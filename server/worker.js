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
//   /start, /me — всем; /broadcast и /message @ник — владельцу, через черновик: бот показывает, как
//   сообщение увидят игроки, и отправляет только по кнопке «Разослать/Отправить» (можно с фото и альбомом).

import {
  checkInitData, diagnoseInitData, validateState, parseAdminIds, isAdmin, displayName,
} from './lib.js';

// Кто может обращаться к обработчику. Свой домен — чтобы чужой сайт не ходил в него от имени игрока.
const ALLOWED_ORIGINS = [
  'https://cheesemolly.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const DEFAULT_APP_URL = 'https://cheesemolly.github.io/tggames/';
const BROADCAST_LIMIT = 2000;          // предохранитель: больше за один раз не рассылаем
const ALBUM_WAIT_MS = 1500;            // картинки альбома приходят по одной: ждём, пока придут все
const CAPTION_LIMIT = 1024;            // подпись к фото в Telegram
const TEXT_LIMIT = 4096;               // обычное сообщение

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
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/bot' && request.method === 'POST') return await botWebhook(request, env, ctx);
      if (path === '/') return json({ ok: true, service: 'tggames' }, 200, origin);
      // Диагностика: какому боту принадлежит токен в настройках. Сам токен не раскрывается —
      // видно только имя бота. Нужна, когда мини-апп открыт одним ботом, а токен лежит от другого.
      if (path === '/whoami') return await whoami(env, origin);
      // Диагностика входа: почему не сошлась подпись. Данные игрока наружу не отдаёт.
      if (path === '/debug/initdata') {
        const header = request.headers.get('Authorization') ?? '';
        const initData = header.startsWith('tma ') ? header.slice(4).trim() : '';
        return json(await diagnoseInitData(initData, env.BOT_TOKEN), 200, origin);
      }

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

/** Спрашивает у Telegram, чей это токен: сверить с тем ботом, который открывает мини-апп. */
async function whoami(env, origin) {
  if (!env.BOT_TOKEN) return json({ ok: false, error: 'no_bot_token' }, 200, origin);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (!data.ok) return json({ ok: false, error: data.description ?? 'bad_token' }, 200, origin);
    return json({
      ok: true,
      bot: data.result.username ? `@${data.result.username}` : data.result.first_name,
      tokenLength: env.BOT_TOKEN.length,
      tokenTrimmed: env.BOT_TOKEN === env.BOT_TOKEN.trim(),   // лишние пробелы при вставке ломают подпись
      admins: parseAdminIds(env.ADMIN_IDS).length,
    }, 200, origin);
  } catch {
    return json({ ok: false, error: 'telegram_unreachable' }, 200, origin);
  }
}

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

async function botWebhook(request, env, ctx) {
  // Telegram шлёт этот заголовок, если вебхук поставлен с secret_token. Так чужой запрос не пройдёт.
  if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await body(request);
  if (update.callback_query) {
    await onButton(update.callback_query, env, ctx);
    return new Response('ok');
  }
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const tgId = message?.from?.id;
  const text = (message?.text ?? message?.caption ?? '').trim();
  const media = mediaOf(message);
  if (!chatId || (!text && !media.length)) return new Response('ok');

  const command = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const rest = command ? text.slice(text.split(/\s+/)[0].length).trim() : text;
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

  if (command === '/broadcast' || command === '/message') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    await collectDraft(env, ctx, message, { command, rest, media });
    return new Response('ok');
  }

  // картинки альбома без подписи — часть черновика владельца (подпись с командой у одной из них)
  if (admin && media.length && message.media_group_id) {
    await collectDraft(env, ctx, message, { command: '', rest: '', media });
    return new Response('ok');
  }

  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: admin ? ADMIN_HELP : 'Команды: /start — открыть игры, /me — мой прогресс.',
    reply_markup: playButton(env),
  });
  return new Response('ok');
}

const ADMIN_HELP = 'Команды: /start — открыть игры, /me — мой прогресс.\n\n'
  + 'Для владельца:\n'
  + '/broadcast текст — всем игрокам;\n'
  + '/message @ник текст — одному игроку (можно id вместо ника).\n'
  + 'Можно с фото или альбомом: прикрепи картинки и напиши команду в подписи. '
  + 'Сначала бот покажет, как это увидят, и отправит только по кнопке.';

// ---------- черновики рассылки и личных сообщений ----------
// Картинки альбома Telegram присылает отдельными сообщениями, подпись — только у одной. Поэтому каждая
// часть пишется в черновик (картинки — отдельными строками, без гонок при одновременной записи), а
// предпросмотр показывает тот запрос, после которого за ALBUM_WAIT_MS ничего нового не пришло.

/** Картинки/видео сообщения: [{ type, id }] (у фото берём самый большой размер). */
function mediaOf(message) {
  if (message?.photo?.length) return [{ type: 'photo', id: message.photo[message.photo.length - 1].file_id }];
  if (message?.video) return [{ type: 'video', id: message.video.file_id }];
  return [];
}

async function ensureDraftTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, chat_id INTEGER NOT NULL,
    group_key TEXT NOT NULL, kind TEXT, target INTEGER, target_name TEXT, text TEXT,
    stamp TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL,
    UNIQUE (admin_id, group_key))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draft_media (
    admin_id INTEGER NOT NULL, group_key TEXT NOT NULL, message_id INTEGER NOT NULL,
    type TEXT NOT NULL, file_id TEXT NOT NULL, PRIMARY KEY (admin_id, group_key, message_id))`).run();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectDraft(env, ctx, message, { command, rest, media }) {
  await ensureDraftTables(env);
  const adminId = message.from.id;
  const chatId = message.chat.id;
  const key = message.media_group_id ? `g${message.media_group_id}` : `m${message.message_id}`;

  // что написано в команде
  let kind = null;
  let target = null;
  let targetName = null;
  let text = null;
  if (command === '/broadcast') {
    kind = 'broadcast';
    text = rest;
  } else if (command === '/message') {
    const [who, ...words] = rest.split(/\s+/);
    const player = who ? await findPlayer(env, who) : null;
    if (!player) {
      await api(env, 'sendMessage', {
        chat_id: chatId,
        text: who
          ? `Игрок ${who} не найден — он ещё не открывал игры или сменил ник.`
          : 'Напиши так: /message @ник текст (можно id вместо ника).',
      });
      return;
    }
    kind = 'message';
    target = player.tg_id;
    targetName = player.username ? `@${player.username}` : player.name;
    text = rest.slice(who.length).trim();
    void words;
  }

  const stamp = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO drafts (admin_id, chat_id, group_key, kind, target, target_name, text, stamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (admin_id, group_key) DO UPDATE SET
        kind = COALESCE(excluded.kind, drafts.kind), target = COALESCE(excluded.target, drafts.target),
        target_name = COALESCE(excluded.target_name, drafts.target_name), text = COALESCE(excluded.text, drafts.text),
        stamp = excluded.stamp`)
    .bind(adminId, chatId, key, kind, target, targetName, text, stamp, Date.now()).run();
  for (const m of media) {
    await env.DB.prepare('INSERT OR IGNORE INTO draft_media (admin_id, group_key, message_id, type, file_id) VALUES (?, ?, ?, ?, ?)')
      .bind(adminId, key, message.message_id, m.type, m.id).run();
  }

  const wait = message.media_group_id ? Number(env.ALBUM_WAIT_MS ?? ALBUM_WAIT_MS) : 0;
  const finish = async () => {
    if (wait) await sleep(wait);
    await previewDraft(env, adminId, key, stamp);
  };
  if (wait && ctx?.waitUntil) ctx.waitUntil(finish());
  else await finish();
}

async function findPlayer(env, who) {
  if (/^\d+$/.test(who)) return env.DB.prepare('SELECT tg_id, name, username FROM users WHERE tg_id = ?').bind(Number(who)).first();
  return env.DB.prepare('SELECT tg_id, name, username FROM users WHERE lower(username) = lower(?)')
    .bind(who.replace(/^@/, '')).first();
}

async function loadDraft(env, where, ...args) {
  const draft = await env.DB.prepare(`SELECT * FROM drafts WHERE ${where}`).bind(...args).first();
  if (!draft) return null;
  const rows = await env.DB.prepare('SELECT type, file_id FROM draft_media WHERE admin_id = ? AND group_key = ? ORDER BY message_id')
    .bind(draft.admin_id, draft.group_key).all();
  return { ...draft, media: (rows.results ?? []).map((r) => ({ type: r.type, id: r.file_id })) };
}

/** Предпросмотр: владелец видит ровно то, что получат игроки, и кнопки «Отправить» / «Отмена». */
async function previewDraft(env, adminId, key, stamp) {
  const draft = await loadDraft(env, 'admin_id = ? AND group_key = ?', adminId, key);
  if (!draft || draft.stamp !== stamp || draft.state !== 'new') return;     // пришла ещё часть альбома — покажет она
  const say = (text) => api(env, 'sendMessage', { chat_id: draft.chat_id, text });
  if (!draft.kind) {
    await say('Чтобы разослать картинки, напиши в подписи /broadcast текст или /message @ник текст.');
    return;
  }
  if (!draft.text && !draft.media.length) {
    await say(draft.kind === 'broadcast' ? 'Напиши так: /broadcast текст сообщения' : 'Напиши так: /message @ник текст');
    return;
  }
  const limit = draft.media.length ? CAPTION_LIMIT : TEXT_LIMIT;
  if ((draft.text ?? '').length > limit) {
    await say(`Слишком длинно: ${draft.text.length} символов, можно ${limit}${draft.media.length ? ' (подпись к фото)' : ''}.`);
    return;
  }
  if (draft.media.length > 10) {
    await say('В альбоме не больше 10 картинок.');
    return;
  }

  await env.DB.prepare("UPDATE drafts SET state = 'preview' WHERE id = ?").bind(draft.id).run();
  await say('Так это увидят:');
  await sendDraft(env, draft.chat_id, draft);
  const players = draft.kind === 'broadcast'
    ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE banned = 0').first())?.n ?? 0
    : 1;
  await api(env, 'sendMessage', {
    chat_id: draft.chat_id,
    text: draft.kind === 'broadcast' ? `Разослать всем игрокам (${players})?` : `Отправить ${draft.target_name}?`,
    reply_markup: {
      inline_keyboard: [[
        { text: draft.kind === 'broadcast' ? `📣 Разослать (${players})` : '✉️ Отправить', callback_data: `d:send:${draft.id}` },
        { text: 'Отмена', callback_data: `d:cancel:${draft.id}` },
      ]],
    },
  });
}

/**
 * Отправить черновик в чат. Текст — сообщением с кнопкой «Играть»; одна картинка — с подписью и кнопкой;
 * альбом — группой (кнопку к альбому Telegram прикрепить не даёт, подпись — у первой картинки).
 */
async function sendDraft(env, chatId, draft) {
  const text = draft.text ?? '';
  const media = draft.media ?? [];
  let res;
  if (!media.length) {
    res = await api(env, 'sendMessage', { chat_id: chatId, text, reply_markup: playButton(env) });
  } else if (media.length === 1) {
    const [m] = media;
    res = await api(env, m.type === 'video' ? 'sendVideo' : 'sendPhoto', {
      chat_id: chatId, [m.type]: m.id, ...(text ? { caption: text } : {}), reply_markup: playButton(env),
    });
  } else {
    res = await api(env, 'sendMediaGroup', {
      chat_id: chatId,
      media: media.map((m, i) => ({ type: m.type, media: m.id, ...(i === 0 && text ? { caption: text } : {}) })),
    });
  }
  return res.ok;
}

/** Кнопки под предпросмотром. Нажать может только владелец; дважды не отправится. */
async function onButton(query, env, ctx) {
  const answer = (text) => api(env, 'answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) });
  const [prefix, action, rawId] = String(query.data ?? '').split(':');
  if (prefix !== 'd' || !isAdmin(query.from?.id, parseAdminIds(env.ADMIN_IDS))) {
    await answer('Это только для владельца.');
    return;
  }
  await ensureDraftTables(env);
  const draft = await loadDraft(env, 'id = ? AND admin_id = ?', Number(rawId), query.from.id);
  const edit = (text) => query.message && api(env, 'editMessageText', {
    chat_id: query.message.chat.id, message_id: query.message.message_id, text,
  });
  if (!draft) {
    await answer('Черновик не найден.');
    return;
  }
  if (action === 'cancel') {
    const res = await env.DB.prepare("UPDATE drafts SET state = 'cancelled' WHERE id = ? AND state = 'preview'").bind(draft.id).run();
    await answer();
    if (res.meta?.changes) await edit('Отменено — никому не отправлено.');
    return;
  }
  // «send»: переводим в 'sending' только из 'preview' — второе нажатие ничего не сделает
  const res = await env.DB.prepare("UPDATE drafts SET state = 'sending' WHERE id = ? AND state = 'preview'").bind(draft.id).run();
  if (!res.meta?.changes) {
    await answer('Уже отправлено или отменено.');
    return;
  }
  await answer(draft.kind === 'broadcast' ? 'Рассылаю…' : 'Отправляю…');
  const job = async () => {
    if (draft.kind === 'broadcast') {
      const result = await broadcast(env, draft);
      await edit(`Разослано: ${result.sent} из ${result.total}.`
        + (result.failed ? ` Не доставлено: ${result.failed} (заблокировали бота).` : ''));
    } else {
      const ok = await sendDraft(env, draft.target, draft).catch(() => false);
      await edit(ok ? `Отправлено ${draft.target_name}.` : `Не доставлено ${draft.target_name}: игрок заблокировал бота или не начинал с ним чат.`);
    }
    await env.DB.prepare("UPDATE drafts SET state = 'sent' WHERE id = ?").bind(draft.id).run();
  };
  if (ctx?.waitUntil) ctx.waitUntil(job());
  else await job();
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

/**
 * Рассылка всем, кто хоть раз открывал игры. Заблокировавшие бота просто не получат сообщение.
 * content — строка (панель владельца) или черновик { text, media }.
 */
async function broadcast(env, content) {
  const draft = typeof content === 'string' ? { text: content, media: [] } : content;
  const rows = await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0 LIMIT ?').bind(BROADCAST_LIMIT).all();
  const ids = (rows.results ?? []).map((r) => r.tg_id);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      if (await sendDraft(env, id, draft)) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: ids.length, sent, failed };
}
