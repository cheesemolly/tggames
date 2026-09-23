// Обработчик Cloudflare Worker: вход через Telegram, прогресс игроков, панель владельца и сам бот.
// База — Cloudflare D1 (привязка `DB`, схема в schema.sql). Как это выкладывается — в README.md.
//
// Переменные окружения (задаются в настройках воркера, не в коде):
//   BOT_TOKEN       — токен бота от BotFather (секрет);
//   ADMIN_IDS       — Telegram-id владельцев панели через запятую;
//   WEBHOOK_SECRET  — произвольная строка, ею Telegram подписывает вебхук (секрет);
//   APP_URL         — адрес мини-приложения (по умолчанию наш GitHub Pages).
//
// Запросы игры (везде заголовок `Authorization: tma <initData>`):
//   GET  /me                      -> { id, tgId, name, username, isAdmin, banned }
//   GET  /state                   -> { data, updatedAt }
//   PUT  /state  { data, base }   -> { updatedAt }  |  409 с чужим свежим прогрессом
// Панель (только для ADMIN_IDS):
//   GET    /admin/players?q=&limit=&offset=
//   GET    /admin/player/<id>
//   PUT    /admin/player/<id>/state  { data }
//   POST   /admin/player/<id>/ban    { banned }
//   DELETE /admin/player/<id>
//   POST   /admin/broadcast          { text }
// Бот: POST /bot — вебхук Telegram, проверяется заголовком X-Telegram-Bot-Api-Secret-Token.

import {
  checkInitData, validateState, parseAdminIds, isAdmin, displayName,
} from './lib.js';

// Кто может обращаться к обработчику. Свой домен — чтобы чужой сайт не ходил в него от имени игрока.
const ALLOWED_ORIGINS = [
  'https://cheesemolly.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const DEFAULT_APP_URL = 'https://cheesemolly.github.io/tggames/';
const BROADCAST_LIMIT = 2000;          // предохранитель: больше за один раз не рассылаем

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
});

const fail = (error, status, origin) => json({ error }, status, origin);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/bot' && request.method === 'POST') return await botWebhook(request, env);
      if (path === '/') return json({ ok: true, service: 'tggames' }, 200, origin);

      // Всё остальное — только для игрока, подтверждённого подписью Telegram.
      const auth = await authorize(request, env);
      if (!auth.ok) return fail(auth.error, auth.error === 'banned' ? 403 : 401, origin);
      const { player, admin } = auth;

      if (path === '/me' && request.method === 'GET') {
        return json({
          id: player.id, tgId: player.tg_id, name: player.name, username: player.username,
          isAdmin: admin, banned: Boolean(player.banned),
        }, 200, origin);
      }
      if (path === '/state' && request.method === 'GET') return await getState(env, player, origin);
      if (path === '/state' && request.method === 'PUT') return await putState(request, env, player, origin);

      if (path.startsWith('/admin/')) {
        if (!admin) return fail('forbidden', 403, origin);
        return await adminRoutes(request, env, path, url, origin);
      }

      return fail('not_found', 404, origin);
    } catch (err) {
      console.error(err);
      return fail('server', 500, origin);
    }
  },
};

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ---------- вход ----------

/** Проверяет подпись Telegram, заводит игрока при первом заходе и обновляет имя. */
async function authorize(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
  const checked = await checkInitData(initData, env.BOT_TOKEN);
  if (!checked.ok) return { ok: false, error: checked.error };

  const now = Date.now();
  const { user } = checked;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Игрок';

  let player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(user.id).first();
  if (!player) {
    player = await env.DB.prepare(
      `INSERT INTO users (tg_id, name, username, created_at, last_seen_at, banned)
       VALUES (?, ?, ?, ?, ?, 0) RETURNING *`,
    ).bind(user.id, name, user.username ?? null, now, now).first();
    // Пустую запись прогресса не заводим: иначе первое же сохранение новичка (он шлёт base = 0)
    // упиралось бы в «конфликт» и лишний раз ходило на сервер.
  } else {
    await env.DB.prepare('UPDATE users SET name = ?, username = ?, last_seen_at = ? WHERE id = ?')
      .bind(name, user.username ?? null, now, player.id).run();
    player = { ...player, name, username: user.username ?? null, last_seen_at: now };
  }

  const admin = isAdmin(user.id, parseAdminIds(env.ADMIN_IDS));
  if (player.banned && !admin) return { ok: false, error: 'banned' };
  return { ok: true, player, admin };
}

// ---------- прогресс ----------

async function getState(env, player, origin) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  return json({ data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0 }, 200, origin);
}

async function putState(request, env, player, origin) {
  const { data, base } = await body(request);
  const bad = validateState(data);
  if (bad) return fail(bad, 400, origin);

  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  const stored = row?.updated_at ?? 0;
  // На другом устройстве уже сохраняли новее — не затираем, отдаём тот прогресс клиенту.
  if (typeof base === 'number' && stored > base) {
    return json({ conflict: true, data: row.data, updatedAt: stored }, 409, origin);
  }

  const stamp = Math.max(Date.now(), stored + 1);
  await saveState(env, player.id, data, stamp);
  return json({ updatedAt: stamp }, 200, origin);
}

function saveState(env, userId, data, stamp) {
  return env.DB.prepare(
    `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(userId, data, stamp).run();
}

// ---------- панель владельца ----------

async function adminRoutes(request, env, path, url, origin) {
  if (path === '/admin/players' && request.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const like = `%${q}%`;
    const rows = q
      ? await env.DB.prepare(
        `SELECT u.*, s.updated_at AS state_at FROM users u LEFT JOIN states s ON s.user_id = u.id
           WHERE u.name LIKE ? OR IFNULL(u.username, '') LIKE ? OR CAST(u.tg_id AS TEXT) LIKE ?
           ORDER BY u.last_seen_at DESC LIMIT ? OFFSET ?`,
      ).bind(like, like, like, limit, offset).all()
      : await env.DB.prepare(
        `SELECT u.*, s.updated_at AS state_at FROM users u LEFT JOIN states s ON s.user_id = u.id
           ORDER BY u.last_seen_at DESC LIMIT ? OFFSET ?`,
      ).bind(limit, offset).all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return json({ players: (rows.results ?? []).map(playerRow), total: total?.n ?? 0 }, 200, origin);
  }

  if (path === '/admin/broadcast' && request.method === 'POST') {
    const { text } = await body(request);
    if (typeof text !== 'string' || !text.trim()) return fail('empty_text', 400, origin);
    return json(await broadcast(env, text.trim()), 200, origin);
  }

  const match = path.match(/^\/admin\/player\/(\d+)(\/state|\/ban)?$/);
  if (!match) return fail('not_found', 404, origin);
  const id = Number(match[1]);
  const action = match[2] ?? '';

  const player = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!player) return fail('no_player', 404, origin);

  if (!action && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(id).first();
    return json({ player: playerRow(player), data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0 }, 200, origin);
  }

  if (action === '/state' && request.method === 'PUT') {
    const { data } = await body(request);
    const bad = validateState(data);
    if (bad) return fail(bad, 400, origin);
    // Отметка заведомо новее всего, что есть у игрока: его устройство при следующем обмене
    // получит конфликт и применит правку, а не затрёт её своим старым прогрессом.
    const stamp = Date.now() + 1000;
    await saveState(env, id, data, stamp);
    return json({ ok: true, updatedAt: stamp }, 200, origin);
  }

  if (action === '/ban' && request.method === 'POST') {
    const { banned } = await body(request);
    await env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(banned ? 1 : 0, id).run();
    return json({ ok: true, banned: Boolean(banned) }, 200, origin);
  }

  if (!action && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM states WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, origin);
  }

  return fail('not_found', 404, origin);
}

const playerRow = (p) => ({
  id: p.id,
  tgId: p.tg_id,
  name: p.name,
  username: p.username,
  createdAt: p.created_at,
  lastSeenAt: p.last_seen_at,
  banned: Boolean(p.banned),
  stateAt: p.state_at ?? null,
});

// ---------- бот ----------

function api(env, method, payload) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const appUrl = (env) => env.APP_URL || DEFAULT_APP_URL;

const playButton = (env) => ({
  inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: appUrl(env) } }]],
});

async function botWebhook(request, env) {
  // Telegram шлёт этот заголовок, если вебхук поставлен с secret_token. Так чужой запрос не пройдёт.
  if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await body(request);
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const tgId = message?.from?.id;
  if (!chatId || !message?.text) return new Response('ok');

  const text = message.text.trim();
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const rest = text.slice(command.length).trim();
  const admin = isAdmin(tgId, parseAdminIds(env.ADMIN_IDS));

  if (command === '/start') {
    await api(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Привет! Здесь набор небольших игр: слова, головоломки, аркады.\n'
        + 'Прогресс сохраняется за твоим аккаунтом Telegram — можно играть с любого устройства.',
      reply_markup: playButton(env),
    });
    return new Response('ok');
  }

  if (command === '/me') {
    await api(env, 'sendMessage', { chat_id: chatId, text: await meText(env, tgId), parse_mode: 'HTML' });
    return new Response('ok');
  }

  if (command === '/broadcast') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    if (!rest) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Напиши так: /broadcast текст сообщения' });
      return new Response('ok');
    }
    const result = await broadcast(env, rest);
    await api(env, 'sendMessage', {
      chat_id: chatId,
      text: `Разослано: ${result.sent} из ${result.total}.`
        + (result.failed ? ` Не доставлено: ${result.failed} (заблокировали бота).` : ''),
    });
    return new Response('ok');
  }

  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: 'Команды: /start — открыть игры, /me — мой прогресс.',
    reply_markup: playButton(env),
  });
  return new Response('ok');
}

/** Текст для /me: уровни и рекорды из сохранённого прогресса. */
async function meText(env, tgId) {
  const player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();
  if (!player) return 'Ты ещё не заходил в игры. Нажми «Играть» — и всё появится.';
  const row = await env.DB.prepare('SELECT data FROM states WHERE user_id = ?').bind(player.id).first();

  let state = {};
  try {
    state = JSON.parse(row?.data ?? '{}');
  } catch {
    state = {};
  }

  const lines = [];
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith('shell:progress:')) {
      lines.push(`• ${key.slice('shell:progress:'.length)}: ${value}`);
    } else if (key.startsWith('shell:stats:') && !key.slice('shell:stats:'.length).includes(':') && value?.played) {
      const best = value.best === null || value.best === undefined ? '' : `, рекорд ${value.best}`;
      lines.push(`• ${key.slice('shell:stats:'.length)}: сыграно ${value.played}${best}`);
    }
  }
  if (!lines.length) return 'Пока пусто — сыграй партию, и здесь появятся уровни и рекорды.';
  return `<b>${displayName({ first_name: player.name, username: player.username })}</b>\n${lines.join('\n')}`;
}

/** Рассылка всем, кто хоть раз открывал игры. Заблокировавшие бота просто не получат сообщение. */
async function broadcast(env, text) {
  const rows = await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0 LIMIT ?').bind(BROADCAST_LIMIT).all();
  const ids = (rows.results ?? []).map((r) => r.tg_id);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const res = await api(env, 'sendMessage', { chat_id: id, text, reply_markup: playButton(env) });
      if (res.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: ids.length, sent, failed };
}
