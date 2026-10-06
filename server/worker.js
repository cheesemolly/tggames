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
//   GET  /me                      -> { id, tgId, name, username, isAdmin, beta, banned, perks }
//   GET  /state                   -> { data, updatedAt }
//   PUT  /state  { data, base }   -> { updatedAt }  |  409 с чужим свежим прогрессом
// Рейтинг (в ответах только имя игрока и случайный pid — ни id, ни ника, ни tg_id):
//   GET  /top                     -> { games: [{ game, by, total, leader, me }], mePid, overall? } — сводка по всем
//                                    играм; overall (в бете 'leaderboard-overall') — общий рейтинг: { total, rows:
//                                    [{ place, name, pid, points, firsts, games, me }], me } — очки за места (lib.js)
//   GET  /top/<игра>              -> { game, by, total, rows: [{ place, name, text, pid, me }], me }
//   GET  /top/player/<pid>        -> { name, me, games: [{ game, text, place, total, points? }], overall?, admin?,
//                                    outside?, tester? } — профиль (разработчик — вне мест, но с бейджем admin:
//                                    'leaderboard-no-admin'; tester — рамка тестера на аватаре: 'tester-frame')
//   POST /top/find  { username }  -> { pid } — поиск игрока по @нику, только точное совпадение; сам ник в ответ не попадает
//   POST /top/suggest { q }       -> { players: [{ pid, name }] } — автодополнение: до 10 игроков, у кого имя
//                                    начинается с q (кириллица тоже) или @ник совпал целиком; сам ник в ответ не попадает
// Панель (только для ADMIN_IDS):
//   GET    /admin/players?q=&limit=&offset=
//   GET    /admin/player/<id>
//   PUT    /admin/player/<id>/state  { data }
//   POST   /admin/player/<id>/ban    { banned }
//   POST   /admin/player/<id>/perk   { perk, on } — выдать / забрать особый скин (PERKS в lib.js)
//   POST   /admin/player/<id>/tester { on } — бета-тестер: видит бету, но не панель (таблица beta_testers)
// Обратная связь: POST /report { text } (из приложения) и /report текст в боте — отзыв приходит владельцам.
//   DELETE /admin/player/<id>
//   POST   /admin/broadcast          { text }
// Бот: POST /bot — вебхук Telegram, проверяется заголовком X-Telegram-Bot-Api-Secret-Token.
//   /start, /me — всем; /broadcast и /message @ник — владельцу, через черновик: бот показывает, как
//   сообщение увидят игроки, и отправляет только по кнопке «Разослать/Отправить» (можно с фото и альбомом).
//   Инлайн-режим (включается в @BotFather: /setinline): в любом чате «@бот» — приглашение в игры,
//   «@бот судоку» — конкретная игра, «@бот рекорды» — свой прогресс. Кнопка под сообщением — ссылка
//   t.me/<бот>?startapp=<id игры>: она открывает главное мини-приложение сразу на этой игре.

import {
  checkInitData, timingSafeEqual, validateState, parseAdminIds, isAdmin, displayName,
  publicGames, findGames, startAppLink, progressLines, shiftEntities, GAMES, BOARDS, boardScores, boardPoints, pointsView, boardFor, BOARD_VERSION, boardName,
  PERKS, isPerk, SERVER_BETA, SYNC_PROTOCOL, overallPoints, overallRanking, withoutUsers, parseUsername, matchPlayers, REPORT_MAX, REPORT_PER_HOUR, reportMessage, START_TEXT, WELCOME_TEXT, WELCOME_MEDIA,
} from './lib.js';
import {
  MERGE_PROTOCOL, loadDoc, saveDoc, applyPush, applyAdmin, entriesSince, isDeviceId,
} from './merge.js';

// Кто может обращаться к обработчику. Свой домен — чтобы чужой сайт не ходил в него от имени игрока.
const ALLOWED_ORIGINS = [
  'https://cheesemolly.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const DEFAULT_APP_URL = 'https://cheesemolly.github.io/tggames/';
const OWNER_COMMANDS = ['/broadcast', '/silentbroadcast', '/message', '/unsend', '/edit', '/cancel'];
const SEEN_EVERY_MS = 5 * 60 * 1000;      // «последний заход» пишется в базу не чаще
const STATE_MIN_GAP_MS = 1500;            // сохранения прогресса — не чаще (защита лимита записи D1)
const ADMIN_MAX_AGE_MS = 2 * 60 * 60 * 1000;   // подпись владельца для панели — не старше двух часов
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
      // /whoami и /debug/initdata (диагностика входа, 2026-09-23) убраны после аудита 2026-09-27: вход давно
      // работает, а открытые всем адреса выдавали лишнее (число админов, длину токена) и дёргали Telegram.

      // Всё остальное — только для игрока, подтверждённого подписью Telegram.
      const auth = await authorize(request, env);
      if (!auth.ok) return fail(auth.error, auth.error === 'banned' ? 403 : 401, origin);
      const { player, admin, user } = auth;

      if (path === '/me' && request.method === 'GET') {
        return json({
          id: player.id, tgId: player.tg_id, name: player.name, username: player.username,
          // beta — видит бету (владелец или бета-тестер из панели); панель — только isAdmin
          isAdmin: admin, beta: admin || await isTester(env, player.id), banned: Boolean(player.banned),
          // владелец видит все особые скины и так; остальным — выданные в панели
          perks: admin ? Object.keys(PERKS) : await perksOf(env, player.id),
        }, 200, origin);
      }
      if (path === '/state' && request.method === 'GET') {
        if (url.searchParams.get('sync') === String(MERGE_PROTOCOL)) return await getMerged(env, player, url, origin);
        return await getState(env, player, origin);
      }
      if (path === '/state' && request.method === 'PUT') return await putState(request, env, player, user, origin, admin);
      if (path === '/top' || path.startsWith('/top/')) return await topRoutes(request, env, path, player, admin, origin);
      if (path === '/report' && request.method === 'POST') {
        if (!betaOpen('feedback', admin) && !(await isTester(env, player.id))) return fail('not_found', 404, origin);
        const { text } = await body(request);
        const res = await submitReport(env, { player, user, text, source: 'app' });
        return res.ok ? json({ ok: true }, 200, origin) : fail(res.error, res.error === 'too_many' ? 429 : 400, origin);
      }

      if (path.startsWith('/admin/')) {
        if (!admin) return fail('forbidden', 403, origin);
        // панель — только со свежей подписью: утёкшая строка входа владельца не должна сутки открывать панель
        if (Date.now() - auth.authDate > ADMIN_MAX_AGE_MS) return fail('expired', 401, origin);
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
    searchCache.delete(env.DB);          // новичка сразу можно найти поиском
  } else if (player.name !== name || player.username !== (user.username ?? null)
    || now - player.last_seen_at > SEEN_EVERY_MS) {
    // запись в D1 ограничена: «последний заход» обновляем не на каждый запрос, а раз в несколько минут
    if (player.name !== name || player.username !== (user.username ?? null)) searchCache.delete(env.DB);
    await env.DB.prepare('UPDATE users SET name = ?, username = ?, last_seen_at = ? WHERE id = ?')
      .bind(name, user.username ?? null, now, player.id).run();
    player = { ...player, name, username: user.username ?? null, last_seen_at: now };
  }

  const admin = isAdmin(user.id, parseAdminIds(env.ADMIN_IDS));
  if (player.banned && !admin) return { ok: false, error: 'banned' };
  const authDate = Number(new URLSearchParams(initData).get('auth_date')) * 1000;
  return { ok: true, player, admin, user, authDate };
}

// ---------- прогресс ----------

async function getState(env, player, origin) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  return json({ data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0 }, 200, origin);
}

async function putState(request, env, player, user, origin, admin = false) {
  const text = await request.text();
  // прогресс и его записи по устройствам (переход на слияние шлёт весь прогресс сразу)
  if (text.length > MAX_PUSH_CHARS) return fail('state_big', 400, origin);
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  if (payload?.sync === MERGE_PROTOCOL) return await putMerged(env, player, user, payload, origin);
  const { data, base, sync } = payload ?? {};
  // Старый клиент у того, кому открыта бета, прогресс не пишет: прогресс остаётся у него на устройстве и уйдёт
  // новым клиентом после перезапуска приложения. 'sync-merge' — только слияние (иначе старый снимок целиком затёр
  // бы записи устройств), 'sync-refresh' — хотя бы клиент, который перезапускает устаревшую игру (sync: 2) —
  // старый после 409 отправил бы уровень из памяти игры и откатил прогресс. Тестера спрашиваем, только если нужно.
  if (sync !== MERGE_PROTOCOL) {
    const beta = admin || await isTester(env, player.id);
    if (betaOpen('sync-merge', beta) || (sync !== SYNC_PROTOCOL && betaOpen('sync-refresh', beta))) {
      return fail('update_required', 426, origin);
    }
  }
  const bad = validateState(data);
  if (bad) return fail(bad, 400, origin);

  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(player.id).first();
  const stored = row?.updated_at ?? 0;
  // На другом устройстве уже сохраняли новее — не затираем, отдаём тот прогресс клиенту.
  if (typeof base === 'number' && stored > base) {
    return json({ conflict: true, data: row.data, updatedAt: stored }, 409, origin);
  }

  // не чаще раза в пару секунд: иначе циклом можно выбрать дневной лимит записи D1 (аудит 2026-09-27).
  // Клиент на «too_many» просто повторит позже (shell/sync.js).
  const since = Date.now() - stored;
  if (row && since >= 0 && since < Number(env.STATE_MIN_GAP_MS ?? STATE_MIN_GAP_MS)) return fail('too_many', 429, origin);

  const stamp = Math.max(Date.now(), stored + 1);
  await saveState(env, player.id, data, stamp);
  await indexBoard(env, player.id, JSON.parse(data), user?.first_name);
  return json({ updatedAt: stamp }, 200, origin);
}

/** Записать прогресс снимком (старый обмен, панель). Записи слияния (meta) при этом сбрасываются: снимок их не знает. */
async function saveState(env, userId, data, stamp, meta = null) {
  await ensureStateMeta(env);
  return env.DB.prepare(
    `INSERT INTO states (user_id, data, updated_at, meta) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, meta = excluded.meta`,
  ).bind(userId, data, stamp, meta).run();
}

// ---------- слияние по ключам (бета 'sync-merge', server/merge.js) ----------

// Весь прогресс (до 400 КБ) и записи по устройствам — с запасом на них и на обёртку запроса.
const MAX_PUSH_CHARS = 2 * 400 * 1024;
const MERGE_TRIES = 3;           // два устройства записали одновременно — слить заново поверх записанного
const stateMetaReady = new WeakSet();

/**
 * Откат слияния без wrangler: при первом переходе игрока на слияние его прежний прогресс (как он был записан старым
 * обменом) один раз копируется в states_premerge. Вернуть — в консоли D1:
 *   UPDATE states SET data = (SELECT data FROM states_premerge p WHERE p.user_id = states.user_id), meta = NULL
 *   WHERE user_id IN (SELECT user_id FROM states_premerge);
 * (Time Travel D1 тоже есть — 7 дней на бесплатном плане, но только через wrangler или API.)
 * Когда слияние выйдет из беты и обкатается — таблицу можно удалить (DROP TABLE states_premerge).
 */
async function keepPremerge(env, userId, row) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS states_premerge (
      user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, saved_at INTEGER NOT NULL)`).run();
    await env.DB.prepare('INSERT OR IGNORE INTO states_premerge (user_id, data, updated_at, saved_at) VALUES (?, ?, ?, ?)')
      .bind(userId, row.data, row.updated_at, Date.now()).run();
  } catch (err) {
    console.error('не удалось сохранить копию прогресса до слияния', err);
  }
}

/** Столбец meta (записи слияния: время, эпоха, счётчики по устройствам) добавлен позже — заводим сами. */
async function ensureStateMeta(env) {
  if (stateMetaReady.has(env.DB)) return;
  try {
    await env.DB.prepare('ALTER TABLE states ADD COLUMN meta TEXT').run();
  } catch {
    // уже есть
  }
  stateMetaReady.add(env.DB);
}

async function readDoc(env, userId) {
  await ensureStateMeta(env);
  const row = await env.DB.prepare('SELECT data, meta, updated_at FROM states WHERE user_id = ?').bind(userId).first();
  const parse = (s) => {
    try {
      return JSON.parse(s ?? 'null');
    } catch {
      return null;
    }
  };
  return {
    row: row ?? null,
    doc: loadDoc(parse(row?.data) ?? {}, parse(row?.meta), row?.updated_at ?? 0),
  };
}

/** GET /state?sync=3&since=<время>&device=<id>: изменившееся на сервере позже since (0 — всё) и что принято от устройства. */
async function getMerged(env, player, url, origin) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const device = url.searchParams.get('device');
  const { row, doc } = await readDoc(env, player.id);
  return json({
    updatedAt: row?.updated_at ?? 0,
    full: since === 0,
    ack: isDeviceId(device) ? (doc.acks[device] ?? 0) : 0,
    keys: entriesSince(doc, since),
  }, 200, origin);
}

/**
 * PUT /state { sync: 3, device, seq, base, keys, migrate? } — сохранение по-новому: сервер не отвергает устаревшее,
 * а сливает его со своей копией (server/merge.js) и отдаёт итог: всё, что изменилось позже base, и присланные ключи.
 * Записывается, только если что-то изменилось. Два устройства одновременно: запись — только если со времени
 * чтения никто не писал (updated_at тот же), иначе слияние заново поверх записанного.
 */
async function putMerged(env, player, user, payload, origin) {
  if (!isDeviceId(payload.device)) return fail('bad_device', 400, origin);
  const base = Number(payload.base) || 0;
  const sent = Object.keys(payload.keys ?? {});
  for (let attempt = 0; attempt < MERGE_TRIES; attempt += 1) {
    const { row, doc } = await readDoc(env, player.id);
    const stored = row?.updated_at ?? 0;
    const since = Date.now() - stored;
    if (row && since >= 0 && since < Number(env.STATE_MIN_GAP_MS ?? STATE_MIN_GAP_MS)) return fail('too_many', 429, origin);
    const stamp = Math.max(Date.now(), stored + 1);
    const res = applyPush(doc, payload, stamp);
    if (!res.dirty) {
      return json({ updatedAt: stored, ack: doc.acks[payload.device] ?? 0, keys: entriesSince(doc, base, sent) }, 200, origin);
    }
    const saved = saveDoc(res.doc, stamp);
    const data = JSON.stringify(saved.data);
    const bad = validateState(data);
    if (bad) return fail(bad, 400, origin);
    const meta = JSON.stringify(saved.meta);
    if (meta.length > MAX_PUSH_CHARS) return fail('state_big', 400, origin);
    const written = row
      ? await env.DB.prepare('UPDATE states SET data = ?, meta = ?, updated_at = ? WHERE user_id = ? AND updated_at = ?')
        .bind(data, meta, stamp, player.id, stored).run()
      : await env.DB.prepare(
        `INSERT INTO states (user_id, data, meta, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO NOTHING`,
      ).bind(player.id, data, meta, stamp).run();
    if (!written?.meta?.changes) continue;       // между чтением и записью успело записать другое устройство
    if (row && !row.meta) await keepPremerge(env, player.id, row);
    if (res.changed.length) await indexBoard(env, player.id, saved.data, user?.first_name);
    return json({ updatedAt: stamp, ack: res.doc.acks[payload.device] ?? 0, keys: entriesSince(res.doc, base, sent) }, 200, origin);
  }
  return fail('too_many', 429, origin);
}

// ---------- рейтинг ----------

// Таблицы рейтинга обработчик заводит сам (как черновики бота) — вручную в D1 ничего выполнять не нужно.
// board_players: у игрока случайный pid (по нему открывают профиль) и имя для рейтинга — только имя из
// Telegram, без фамилии и ника. board_scores: очки по играм (boardScores в lib.js), updated_at — когда
// достигнуто: при равных очках выше тот, кто успел раньше.
const boardReady = new WeakSet();

async function ensureBoardTables(env) {
  if (boardReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS board_players (
    user_id INTEGER PRIMARY KEY, pid TEXT NOT NULL UNIQUE, name TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS board_scores (
    user_id INTEGER NOT NULL, game_id TEXT NOT NULL, value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game_id))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS board_scores_game ON board_scores(game_id, value DESC)').run();
  // «убрать из рейтинга» (панель владельца) и версия подсчёта (BOARD_VERSION) — столбцы добавлены позже
  for (const column of ['hidden', 'ver']) {
    try {
      await env.DB.prepare(`ALTER TABLE board_players ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`).run();
    } catch {
      // уже есть
    }
  }
  boardReady.add(env.DB);
}

// Рейтинг считается окном по всей таблице — дорого на каждый просмотр. Готовый список держится в памяти
// обработчика TOP_CACHE_MS; своё изменение очков или правка владельца сбрасывают его сразу.
const topCache = new WeakMap();
// список для подсказок поиска (все игроки: имя, ник, pid) — тоже из памяти, сбрасывается вместе с рейтингом
const searchCache = new WeakMap();
const dropTopCache = (env) => {
  topCache.delete(env.DB);
  searchCache.delete(env.DB);
};

function randomPid() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

/**
 * Пересчитывает очки игрока из его прогресса. Пишет только то, что изменилось: сохранение идёт каждые
 * несколько секунд игры, а запись в D1 ограничена. firstName — из подписи Telegram (только при своём заходе).
 */
async function indexBoard(env, userId, state, firstName = null) {
  await ensureBoardTables(env);
  const known = await env.DB.prepare('SELECT pid, name, ver FROM board_players WHERE user_id = ?').bind(userId).first();
  if (!known) {
    let name = firstName;
    if (name == null) {
      // до рейтинга имя хранилось вместе с фамилией: берём первое слово
      const row = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
      name = String(row?.name ?? '').trim().split(/\s+/)[0];
    }
    await env.DB.prepare('INSERT OR IGNORE INTO board_players (user_id, pid, name) VALUES (?, ?, ?)')
      .bind(userId, randomPid(), boardName(name)).run();
  } else if (firstName != null && boardName(firstName) !== known.name) {
    await env.DB.prepare('UPDATE board_players SET name = ? WHERE user_id = ?').bind(boardName(firstName), userId).run();
  }

  // старые меры и новые очки (бета 'rating-points', game_id «pts:<игра>») — рядом: кому что показать, решает topRoutes
  const scores = { ...boardScores(state), ...boardPoints(state) };
  const old = await env.DB.prepare('SELECT game_id, value FROM board_scores WHERE user_id = ?').bind(userId).all();
  const before = Object.fromEntries((old.results ?? []).map((r) => [r.game_id, r.value]));
  const now = Date.now();
  // записи — одним пакетом (batch): при пересчёте после смены мер у игрока меняются десятки строк сразу,
  // а запросов за один вызов воркера у Cloudflare ограниченное число
  const writes = [];
  for (const [game, value] of Object.entries(scores)) {
    if (before[game] === value) continue;
    writes.push(env.DB.prepare(
      `INSERT INTO board_scores (user_id, game_id, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, game_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(userId, game, value, now));
  }
  for (const game of Object.keys(before)) {
    if (game in scores) continue;
    writes.push(env.DB.prepare('DELETE FROM board_scores WHERE user_id = ? AND game_id = ?').bind(userId, game));
  }
  if (writes.length) dropTopCache(env);
  if (known?.ver !== BOARD_VERSION) {
    writes.push(env.DB.prepare('UPDATE board_players SET ver = ? WHERE user_id = ?').bind(BOARD_VERSION, userId));
  }
  if (writes.length) await env.DB.batch(writes);
}

const BACKFILL_LIMIT = 10;

/**
 * Прогресс, сохранённый до появления рейтинга или посчитанный старой версией мер (ver < BOARD_VERSION),
 * досчитывается понемногу — при просмотре рейтинга (на игрока — 3–4 запроса, записи одним пакетом).
 * Возвращает, скольких досчитал: BACKFILL_LIMIT — возможно, остались ещё.
 */
async function backfillBoard(env, limit = BACKFILL_LIMIT) {
  const rows = await env.DB.prepare(
    `SELECT s.user_id, s.data FROM states s LEFT JOIN board_players b ON b.user_id = s.user_id
     WHERE b.user_id IS NULL OR b.ver < ? LIMIT ?`,
  ).bind(BOARD_VERSION, limit).all();
  for (const row of rows.results ?? []) {
    let state = {};
    try {
      state = JSON.parse(row.data);
    } catch {
      // битый прогресс — в рейтинг просто ничего не попадёт
    }
    await indexBoard(env, row.user_id, state);
  }
  return (rows.results ?? []).length;
}

// Места: по очкам, при равенстве — кто раньше. Заблокированных и убранных владельцем в рейтинге нет.
const RANKED = `SELECT b.user_id, b.game_id, b.value, b.updated_at, u.tg_id, p.name, p.pid,
    ROW_NUMBER() OVER (PARTITION BY b.game_id ORDER BY b.value DESC, b.updated_at ASC, b.user_id ASC) AS place,
    COUNT(*) OVER (PARTITION BY b.game_id) AS total
  FROM board_scores b JOIN users u ON u.id = b.user_id JOIN board_players p ON p.user_id = b.user_id
  WHERE u.banned = 0 AND p.hidden = 0`;

const TOP_LIMIT = 50;
const TOP_CACHE_MS = 60 * 1000;

/** Весь рейтинг (все игры, все места) — из памяти, если свежий. */
async function rankedRows(env) {
  const cached = topCache.get(env.DB);
  if (cached && Date.now() - cached.at < TOP_CACHE_MS) return cached.rows;
  const pending = await backfillBoard(env) === BACKFILL_LIMIT;   // досчитаны не все — следующий просмотр продолжит
  const rows = (await env.DB.prepare(RANKED).all()).results ?? [];
  if (!pending) topCache.set(env.DB, { at: Date.now(), rows });
  return rows;
}

// поиск по нику: не чаще FIND_PER_MINUTE в минуту от игрока (в памяти обработчика — мягкая защита от перебора ников)
const FIND_PER_MINUTE = 12;
const SUGGEST_PER_MINUTE = 90;     // автодополнение — запрос на каждую букву (с паузой 0,2 с в приложении)
const findLog = new Map();
const suggestLog = new Map();

function allowed(log, limit, userId, now = Date.now()) {
  const recent = (log.get(userId) ?? []).filter((t) => now - t < 60 * 1000);
  if (recent.length >= limit) return false;
  recent.push(now);
  log.set(userId, recent);
  if (log.size > 5000) log.clear();
  return true;
}
const findAllowed = (userId) => allowed(findLog, FIND_PER_MINUTE, userId);

/**
 * pid игрока для профиля. Запись в рейтинге заводится при сохранении прогресса — у того, кто ещё ничего не
 * сохранял, её нет, и поиск его не находил (владелец, 2026-09-27: «не ищет ganj, хотя такой игрок есть»).
 * Заводим сейчас: из сохранённого прогресса, если он есть, иначе пустую.
 */
async function ensureBoardPid(env, userId) {
  const known = await env.DB.prepare('SELECT pid FROM board_players WHERE user_id = ?').bind(userId).first();
  if (known) return known.pid;
  const row = await env.DB.prepare('SELECT data FROM states WHERE user_id = ?').bind(userId).first();
  let state = {};
  try {
    state = JSON.parse(row?.data ?? '{}');
  } catch {
    // битый прогресс — просто без очков
  }
  await indexBoard(env, userId, state);
  return (await env.DB.prepare('SELECT pid FROM board_players WHERE user_id = ?').bind(userId).first())?.pid ?? null;
}

/** Все, кого можно найти поиском (не заблокированы, не убраны из рейтинга): имя как в рейтинге, ник, pid. */
async function searchable(env) {
  const cached = searchCache.get(env.DB);
  if (cached && Date.now() - cached.at < TOP_CACHE_MS) return cached.rows;
  const rows = ((await env.DB.prepare(
    `SELECT u.id, u.username, u.name AS full_name, u.last_seen_at AS seen, p.pid, p.name AS board_name
     FROM users u LEFT JOIN board_players p ON p.user_id = u.id WHERE u.banned = 0 AND COALESCE(p.hidden, 0) = 0`,
  ).all()).results ?? []).map((r) => ({
    id: r.id, username: r.username, pid: r.pid, seen: r.seen,
    // у кого записи в рейтинге ещё нет — первое слово имени (фамилию не показываем и по ней не ищем)
    name: r.board_name ?? boardName(String(r.full_name ?? '').trim().split(/\s+/)[0]),
  }));
  searchCache.set(env.DB, { at: Date.now(), rows });
  return rows;
}

async function topRoutes(request, env, path, player, admin, origin) {
  await ensureBoardTables(env);
  // бета (игры и функции рейтинга) открыта владельцу и бета-тестерам
  const beta = admin || await isTester(env, player.id);
  // очки вместо уровней и побед (бета 'rating-points'): строки «pts:<игра>» вместо старых строк этих игр
  const pointsOn = betaOpen('rating-points', beta);
  const ranked = pointsView(await rankedRows(env), pointsOn);
  const board = (game) => boardFor(game, pointsOn);
  // разработчик тестирует игры и иначе стоит везде первым — в местах его нет (в бете 'leaderboard-no-admin'),
  // профиль по-прежнему открывается, с бейджем admin
  const adminIds = parseAdminIds(env.ADMIN_IDS);
  const noAdmin = betaOpen('leaderboard-no-admin', beta);
  const isOwnerRow = (r) => adminIds.includes(Number(r.tg_id));
  const all = noAdmin ? withoutUsers(ranked, new Set(ranked.filter(isOwnerRow).map((r) => r.user_id))) : ranked;
  const outside = noAdmin && admin;   // смотрит сам разработчик: его мест нет — экран так и скажет
  // игры в бете в рейтинге видят только владелец и бета-тестеры
  const games = new Set(GAMES.filter((g) => BOARDS[g.id] && (beta || !g.beta)).map((g) => g.id));
  const text = (game, value) => board(game).text(value);
  // общий рейтинг — сумма очков за места по играм (overallRanking в lib.js); пока в бете — только владельцу
  const withOverall = betaOpen('leaderboard-overall', beta);
  const overall = () => overallRanking(all, games);
  const overallRow = (p) => ({ place: p.place, name: p.name, pid: p.pid, points: p.points, firsts: p.firsts, games: p.games, me: p.user_id === player.id });

  if (path === '/top') {
    const byGame = {};
    for (const r of all.filter((x) => x.place === 1 || x.user_id === player.id)) {
      if (!games.has(r.game_id)) continue;
      const item = byGame[r.game_id] ??= { game: r.game_id, by: board(r.game_id).by, total: r.total, leader: null, me: null };
      if (r.place === 1) item.leader = { name: r.name, text: text(r.game_id, r.value), me: r.user_id === player.id };
      if (r.user_id === player.id) item.me = { place: r.place, text: text(r.game_id, r.value) };
    }
    const list = GAMES.filter((g) => games.has(g.id))
      .map((g) => byGame[g.id] ?? { game: g.id, by: board(g.id).by, total: 0, leader: null, me: null });
    const mine = await env.DB.prepare('SELECT pid FROM board_players WHERE user_id = ?').bind(player.id).first();
    const out = { games: list, mePid: mine?.pid ?? null, ...(outside && { outside: true }) };
    if (withOverall) {
      const ranking = overall();
      const me = ranking.find((p) => p.user_id === player.id);
      out.overall = { total: ranking.length, rows: ranking.slice(0, TOP_LIMIT).map(overallRow), me: me ? overallRow(me) : null };
    }
    return json(out, 200, origin);
  }

  if (path === '/top/find') {
    if (!betaOpen('player-search', beta)) return fail('not_found', 404, origin);
    if (request.method !== 'POST') return fail('not_found', 404, origin);
    const username = parseUsername((await body(request)).username);
    if (!username) return fail('bad_username', 400, origin);
    if (!findAllowed(player.id)) return fail('too_many', 429, origin);
    if (betaOpen('player-suggest', beta)) {
      // и тех, кто ещё ничего не сохранял: запись в рейтинге заводится сейчас
      const found = await env.DB.prepare(
        `SELECT u.id FROM users u LEFT JOIN board_players p ON p.user_id = u.id
         WHERE lower(u.username) = ? AND u.banned = 0 AND COALESCE(p.hidden, 0) = 0 LIMIT 1`,
      ).bind(username).first();
      const pid = found && await ensureBoardPid(env, found.id);
      return pid ? json({ pid }, 200, origin) : fail('no_player', 404, origin);
    }
    const found = await env.DB.prepare(
      `SELECT p.pid FROM users u JOIN board_players p ON p.user_id = u.id
       WHERE lower(u.username) = ? AND u.banned = 0 AND p.hidden = 0 LIMIT 1`,
    ).bind(username).first();
    return found ? json({ pid: found.pid }, 200, origin) : fail('no_player', 404, origin);
  }

  if (path === '/top/suggest') {
    if (!betaOpen('player-suggest', beta) || request.method !== 'POST') return fail('not_found', 404, origin);
    const q = String((await body(request)).q ?? '').slice(0, 64);
    if (!q.trim()) return json({ players: [] }, 200, origin);
    if (!allowed(suggestLog, SUGGEST_PER_MINUTE, player.id)) return fail('too_many', 429, origin);
    const players = [];
    for (const c of matchPlayers(await searchable(env), q)) {
      const pid = c.pid ?? await ensureBoardPid(env, c.id);
      if (pid) players.push({ pid, name: c.name });
    }
    return json({ players }, 200, origin);
  }

  const profile = path.match(/^\/top\/player\/([a-z0-9]{1,32})$/);
  if (profile) {
    const who = await env.DB.prepare('SELECT user_id, name, hidden FROM board_players WHERE pid = ?').bind(profile[1]).first();
    if (!who || who.hidden) return fail('no_player', 404, origin);
    const banned = await env.DB.prepare('SELECT banned, tg_id FROM users WHERE id = ?').bind(who.user_id).first();
    if (!banned || banned.banned) return fail('no_player', 404, origin);
    const ownerProfile = noAdmin && adminIds.includes(Number(banned.tg_id));
    // рамка тестера на аватаре (в бете 'tester-frame'): у бета-тестеров и разработчика
    const tester = betaOpen('tester-frame', beta)
      && (adminIds.includes(Number(banned.tg_id)) || await isTester(env, who.user_id));
    if (ownerProfile) {
      // разработчик вне мест: результаты видны, мест и очков нет
      const own = Object.fromEntries(ranked.filter((r) => r.user_id === who.user_id).map((r) => [r.game_id, r]));
      return json({
        name: who.name, me: who.user_id === player.id, admin: true, outside: true,
        games: GAMES.filter((g) => games.has(g.id) && own[g.id]).map((g) => ({ game: g.id, text: text(g.id, own[g.id].value), place: null, total: null })),
        ...(withOverall && { overall: null }),
        ...(tester && { tester: true }),
      }, 200, origin);
    }
    const found = Object.fromEntries(all.filter((r) => r.user_id === who.user_id).map((r) => [r.game_id, r]));
    const out = {
      name: who.name,
      me: who.user_id === player.id,
      games: GAMES.filter((g) => games.has(g.id) && found[g.id]).map((g) => ({
        game: g.id, text: text(g.id, found[g.id].value), place: found[g.id].place, total: found[g.id].total,
        ...(withOverall && { points: overallPoints(found[g.id].place) }),
      })),
      ...(tester && { tester: true }),
    };
    if (withOverall) {
      const ranking = overall();
      const p = ranking.find((x) => x.user_id === who.user_id);
      out.overall = p ? { place: p.place, total: ranking.length, points: p.points } : null;
    }
    return json(out, 200, origin);
  }

  const one = path.match(/^\/top\/([a-z0-9-]{1,40})$/);
  if (!one || !games.has(one[1])) return fail('not_found', 404, origin);
  const game = one[1];
  const list = all.filter((r) => r.game_id === game && (r.place <= TOP_LIMIT || r.user_id === player.id))
    .sort((a, b) => a.place - b.place);
  const mine = list.find((r) => r.user_id === player.id);
  return json({
    game,
    by: board(game).by,
    total: list[0]?.total ?? 0,
    rows: list.filter((r) => r.place <= TOP_LIMIT).map((r) => ({
      place: r.place, name: r.name, text: text(game, r.value), pid: r.pid, me: r.user_id === player.id,
    })),
    me: mine ? { place: mine.place, name: mine.name, text: text(game, mine.value), pid: mine.pid } : null,
    ...(outside && { outside: true }),
  }, 200, origin);
}

// ---------- бета на сервере и обратная связь ----------

/** Функция из серверной беты (SERVER_BETA) доступна владельцу и бета-тестерам; после релиза — всем. */
const betaOpen = (id, beta) => beta || !SERVER_BETA.includes(id);

const reportsReady = new WeakSet();

async function ensureReports(env) {
  if (reportsReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER NOT NULL, user_id INTEGER, name TEXT, username TEXT,
    text TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS reports_tg ON reports(tg_id, created_at)').run();
  reportsReady.add(env.DB);
}

/**
 * Отзыв игрока: проверка длины и частоты, запись в reports и сообщение каждому владельцу (ADMIN_IDS).
 * copy — { chat, id }: сообщение с картинкой из бота, его бот копирует владельцу следом за текстом.
 */
async function submitReport(env, { player, user, text, source, copy = null }) {
  const clean = String(text ?? '').trim();
  if (!clean) return { ok: false, error: 'empty_text' };
  if (clean.length > REPORT_MAX) return { ok: false, error: 'too_long' };
  await ensureReports(env);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE tg_id = ? AND created_at > ?')
    .bind(user.id, now - 60 * 60 * 1000).first();
  if ((recent?.n ?? 0) >= REPORT_PER_HOUR) return { ok: false, error: 'too_many' };
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  const added = await env.DB.prepare(
    'INSERT INTO reports (tg_id, user_id, name, username, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(user.id, player?.id ?? null, name, user.username ?? null, clean, source, now).run();
  // два запроса одновременно оба прошли бы проверку выше — пересчёт после записи закрывает эту щель
  const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE tg_id = ? AND created_at > ?')
    .bind(user.id, now - 60 * 60 * 1000).first();
  if ((after?.n ?? 0) > REPORT_PER_HOUR) {
    await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(added.meta?.last_row_id ?? -1).run();
    return { ok: false, error: 'too_many' };
  }
  const note = reportMessage({ name, username: user.username, tgId: user.id, text: clean, source });
  for (const adminId of parseAdminIds(env.ADMIN_IDS)) {
    await api(env, 'sendMessage', { chat_id: adminId, text: note, parse_mode: 'HTML' });
    if (copy) await api(env, 'copyMessage', { chat_id: adminId, from_chat_id: copy.chat, message_id: copy.id });
  }
  return { ok: true };
}

// ---------- приветствие с гифкой (/start) ----------

const botFilesReady = new WeakSet();

/** Файлы, которые бот уже отправлял: адрес → file_id Telegram (повторно с сайта не скачивается). */
async function ensureBotFiles(env) {
  if (botFilesReady.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS bot_files (url TEXT PRIMARY KEY, file_id TEXT NOT NULL)').run();
  botFilesReady.add(env.DB);
}

/**
 * Гифка с геймплеем + приветствие + «Играть». Первый раз Telegram сам скачивает файл с сайта (APP_URL),
 * его file_id запоминается. Не вышло (файла нет, сайт недоступен) — просто текст: приветствие не теряется.
 */
async function sendWelcome(env, chatId) {
  const url = new URL(WELCOME_MEDIA, appUrl(env)).href;
  await ensureBotFiles(env);
  const known = await env.DB.prepare('SELECT file_id FROM bot_files WHERE url = ?').bind(url).first();
  const res = await api(env, 'sendAnimation', {
    chat_id: chatId, animation: known?.file_id ?? url, caption: WELCOME_TEXT, reply_markup: playButton(env),
  });
  const data = await res.json().catch(() => null);
  if (data?.ok) {
    const id = data.result?.animation?.file_id ?? data.result?.document?.file_id;
    if (id && id !== known?.file_id) {
      await env.DB.prepare('INSERT INTO bot_files (url, file_id) VALUES (?, ?) '
        + 'ON CONFLICT(url) DO UPDATE SET file_id = excluded.file_id').bind(url, id).run();
    }
    return;
  }
  if (known) await env.DB.prepare('DELETE FROM bot_files WHERE url = ?').bind(url).run();
  await api(env, 'sendMessage', { chat_id: chatId, text: WELCOME_TEXT, reply_markup: playButton(env) });
}

// ---------- особые скины (перки) ----------

const perksReady = new WeakSet();

async function ensurePerks(env) {
  if (perksReady.has(env.DB)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_perks (
    user_id INTEGER NOT NULL, perk TEXT NOT NULL, PRIMARY KEY (user_id, perk))`).run();
  perksReady.add(env.DB);
}

async function perksOf(env, userId) {
  await ensurePerks(env);
  const rows = await env.DB.prepare('SELECT perk FROM user_perks WHERE user_id = ?').bind(userId).all();
  return (rows.results ?? []).map((r) => r.perk).filter(isPerk);
}

// ---------- бета-тестеры ----------
// Кого владелец позвал проверять бету: видят новые игры и функции, как он, но панели у них нет (её закрывает
// isAdmin). Список — в базе, не в коде: репозиторий публичный. Отмечает владелец в панели.

const testersReady = new WeakSet();

async function ensureTesters(env) {
  if (testersReady.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS beta_testers (user_id INTEGER PRIMARY KEY, since INTEGER NOT NULL)').run();
  testersReady.add(env.DB);
}

async function isTester(env, userId) {
  await ensureTesters(env);
  return Boolean(await env.DB.prepare('SELECT 1 FROM beta_testers WHERE user_id = ?').bind(userId).first());
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

  const match = path.match(/^\/admin\/player\/(\d+)(\/state|\/ban|\/perk|\/board|\/tester)?$/);
  if (!match) return fail('not_found', 404, origin);
  const id = Number(match[1]);
  const action = match[2] ?? '';

  const player = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!player) return fail('no_player', 404, origin);

  if (!action && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(id).first();
    await ensureBoardTables(env);
    const board = await env.DB.prepare('SELECT hidden FROM board_players WHERE user_id = ?').bind(id).first();
    return json({
      player: playerRow(player), data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0,
      perks: await perksOf(env, id), allPerks: PERKS, boardHidden: Boolean(board?.hidden),
      tester: await isTester(env, id),
    }, 200, origin);
  }

  // бета-тестер: видит бету, панели не получает
  if (action === '/tester' && request.method === 'POST') {
    const { on } = await body(request);
    await ensureTesters(env);
    if (on) await env.DB.prepare('INSERT OR IGNORE INTO beta_testers (user_id, since) VALUES (?, ?)').bind(id, Date.now()).run();
    else await env.DB.prepare('DELETE FROM beta_testers WHERE user_id = ?').bind(id).run();
    return json({ ok: true, tester: await isTester(env, id) }, 200, origin);
  }

  // убрать из рейтинга (подделанные очки) или вернуть — прогресс игрока не трогается
  if (action === '/board' && request.method === 'POST') {
    const { hidden } = await body(request);
    await ensureBoardTables(env);
    const known = await env.DB.prepare('SELECT 1 FROM board_players WHERE user_id = ?').bind(id).first();
    if (!known) {
      await env.DB.prepare('INSERT OR IGNORE INTO board_players (user_id, pid, name, hidden) VALUES (?, ?, ?, ?)')
        .bind(id, randomPid(), boardName(String(player.name).split(/\s+/)[0]), hidden ? 1 : 0).run();
    } else {
      await env.DB.prepare('UPDATE board_players SET hidden = ? WHERE user_id = ?').bind(hidden ? 1 : 0, id).run();
    }
    dropTopCache(env);
    return json({ ok: true, boardHidden: Boolean(hidden) }, 200, origin);
  }

  if (action === '/state' && request.method === 'PUT') {
    const { data } = await body(request);
    const bad = validateState(data);
    if (bad) return fail(bad, 400, origin);
    // Отметка заведомо новее всего, что есть у игрока: его устройство при следующем обмене
    // получит конфликт и применит правку, а не затрёт её своим старым прогрессом.
    const stamp = Date.now() + 1000;
    // прогресс уже на слиянии (бета 'sync-merge'): изменённые ключи начинаются заново (новая эпоха) — счётчики
    // устройств из старой эпохи отбрасываются, иначе правка «вниз» не прошла бы
    const { row, doc } = await readDoc(env, id);
    let meta = null;
    if (row?.meta) {
      const saved = saveDoc(applyAdmin(doc, JSON.parse(data), stamp), stamp);
      meta = JSON.stringify(saved.meta);
    }
    await saveState(env, id, data, stamp, meta);
    await indexBoard(env, id, JSON.parse(data));
    return json({ ok: true, updatedAt: stamp }, 200, origin);
  }

  if (action === '/perk' && request.method === 'POST') {
    const { perk, on } = await body(request);
    if (!isPerk(perk)) return fail('bad_perk', 400, origin);
    await ensurePerks(env);
    if (on) await env.DB.prepare('INSERT OR IGNORE INTO user_perks (user_id, perk) VALUES (?, ?)').bind(id, perk).run();
    else await env.DB.prepare('DELETE FROM user_perks WHERE user_id = ? AND perk = ?').bind(id, perk).run();
    return json({ ok: true, perks: await perksOf(env, id) }, 200, origin);
  }

  if (action === '/ban' && request.method === 'POST') {
    const { banned } = await body(request);
    await env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?').bind(banned ? 1 : 0, id).run();
    dropTopCache(env);
    return json({ ok: true, banned: Boolean(banned) }, 200, origin);
  }

  if (!action && request.method === 'DELETE') {
    await ensurePerks(env);
    await env.DB.prepare('DELETE FROM user_perks WHERE user_id = ?').bind(id).run();
    await ensureTesters(env);
    await env.DB.prepare('DELETE FROM beta_testers WHERE user_id = ?').bind(id).run();
    await ensureBoardTables(env);
    await env.DB.prepare('DELETE FROM board_scores WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM board_players WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM states WHERE user_id = ?').bind(id).run();
    try {
      await env.DB.prepare('DELETE FROM states_premerge WHERE user_id = ?').bind(id).run();
    } catch {
      // копий до слияния ещё не было — таблицы нет
    }
    // отзывы тоже: политика конфиденциальности (privacy.html) обещает удалить всё, что связано с игроком
    await ensureReports(env);
    await env.DB.prepare('DELETE FROM reports WHERE tg_id = ?').bind(player.tg_id).run();
    // следы в рассылках: номера сообщений в его чате, личные сообщения ему (их черновики с его именем)
    await ensureDraftTables(env);
    for (const table of ['sent_messages', 'unsend_done', 'draft_anchor']) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).bind(player.tg_id).run();
    }
    const personal = (await env.DB.prepare("SELECT admin_id, group_key FROM drafts WHERE kind = 'message' AND target = ?")
      .bind(player.tg_id).all()).results ?? [];
    for (const d of personal) {
      await env.DB.prepare('DELETE FROM draft_media WHERE admin_id = ? AND group_key = ?').bind(d.admin_id, d.group_key).run();
    }
    await env.DB.prepare("DELETE FROM drafts WHERE kind = 'message' AND target = ?").bind(player.tg_id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    dropTopCache(env);
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

async function botWebhook(request, env, ctx) {
  // Telegram шлёт этот заголовок, если вебхук поставлен с secret_token. Так чужой запрос не пройдёт.
  // без секрета вебхук не работает вовсе: иначе любой мог бы прислать «сообщение от владельца» (аудит 2026-09-27)
  const given = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!env.WEBHOOK_SECRET || !timingSafeEqual(given, env.WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await body(request);
  if (update.inline_query) {
    await onInline(update.inline_query, env);
    return new Response('ok');
  }
  if (update.callback_query) {
    await onButton(update.callback_query, env, ctx);
    return new Response('ok');
  }
  // правки старых сообщений не выполняются заново (иначе правка /report — новый отзыв, а у владельца правка
  // любого сообщения во время /edit стала бы новым текстом рассылки)
  const message = update.message;
  const chatId = message?.chat?.id;
  const tgId = message?.from?.id;
  const raw = message?.text ?? message?.caption ?? '';
  const text = raw.trim();
  const media = mediaOf(message);
  if (!chatId || (!text && !media.length)) return new Response('ok');

  const command = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const rest = command ? text.slice(text.split(/\s+/)[0].length).trim() : text;
  // где в исходном сообщении начинается rest — от этого места сдвигается разметка (цитаты, жирный…)
  const lead = raw.length - raw.trimStart().length;
  const afterCmd = command ? text.slice(text.split(/\s+/)[0].length) : text;
  const restAt = lead + (text.length - afterCmd.length) + (afterCmd.length - afterCmd.trimStart().length);
  const entities = message?.entities ?? message?.caption_entities ?? [];
  const admin = isAdmin(tgId, parseAdminIds(env.ADMIN_IDS));

  // Бот живёт и в группах. Команды владельца — только в личке (иначе предпросмотр рассылки ушёл бы в группу),
  // а обычный текст в группе — не повод отвечать справкой.
  const privateChat = message.chat?.type === 'private' || message.chat?.type == null;
  if (!privateChat) {
    if (OWNER_COMMANDS.includes(command)) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда работает только в личке с ботом.' });
      return new Response('ok');
    }
    if (!command) return new Response('ok');
  }

  // /edit: следующее сообщение владельца без команды — новый текст выбранной рассылки; /cancel — передумал
  if (admin && privateChat && (command === '/cancel' || (!command && !media.length))) {
    await ensureDraftTables(env);
    if (command === '/cancel') {
      await env.DB.prepare('DELETE FROM bot_pending WHERE admin_id = ?').bind(tgId).run();
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Отменено.' });
      return new Response('ok');
    }
    if (await takeEditText(env, tgId, chatId, text, shiftEntities(entities, lead, text.length))) return new Response('ok');
  }

  if (command === '/start') {
    if (betaOpen('welcome', admin)) await sendWelcome(env, chatId);
    else await api(env, 'sendMessage', { chat_id: chatId, text: START_TEXT, reply_markup: playButton(env) });
    return new Response('ok');
  }

  if (command === '/report' && betaOpen('feedback', admin) && !admin) {
    const banned = await env.DB.prepare('SELECT banned FROM users WHERE tg_id = ?').bind(tgId).first();
    if (banned?.banned) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Отзывы сейчас недоступны.' });
      return new Response('ok');
    }
  }
  if (command === '/report' && betaOpen('feedback', admin)) {
    if (!rest && !media.length) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Напиши после команды, что хочешь сказать. Например:\n/report добавьте бильярд' });
      return new Response('ok');
    }
    const player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();
    const res = await submitReport(env, {
      player, user: message.from, text: rest || '(без текста, только картинка)', source: 'bot',
      copy: media.length ? { chat: chatId, id: message.message_id } : null,
    });
    await api(env, 'sendMessage', {
      chat_id: chatId,
      text: res.ok ? 'Спасибо! Передал разработчику 🙌'
        : res.error === 'too_many' ? 'Слишком много отзывов за час — попробуй чуть позже.'
          : 'Отзыв слишком длинный — уложись в 1000 символов.',
    });
    return new Response('ok');
  }

  if (command === '/me') {
    await api(env, 'sendMessage', { chat_id: chatId, text: await meText(env, tgId), parse_mode: 'HTML' });
    return new Response('ok');
  }

  if (command === '/unsend' || command === '/edit') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    const prefix = command === '/edit' ? 'e' : 'u';
    // ответ командой на сообщение рассылки в своём чате — сразу эта рассылка, и её номер известен (якорь)
    if (message.reply_to_message?.from?.is_bot) await pickByReply(env, chatId, tgId, prefix, message.reply_to_message);
    else await listSent(env, chatId, tgId, prefix);
    return new Response('ok');
  }

  if (command === '/broadcast' || command === '/silentbroadcast' || command === '/message') {
    if (!admin) {
      await api(env, 'sendMessage', { chat_id: chatId, text: 'Эта команда только для владельца.' });
      return new Response('ok');
    }
    await collectDraft(env, ctx, message, { command, rest, media, entities, restAt });
    return new Response('ok');
  }

  // картинки альбома без подписи — часть черновика владельца (подпись с командой у одной из них)
  if (admin && media.length && message.media_group_id) {
    await collectDraft(env, ctx, message, { command: '', rest: '', media, entities: [], restAt: 0 });
    return new Response('ok');
  }

  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: admin ? ADMIN_HELP : `Команды: /start — открыть игры, /me — мой прогресс${betaOpen('feedback', false) ? ',\n/report текст — написать разработчику (идея, ошибка, пожелание)' : ''}.`,
    reply_markup: playButton(env),
  });
  return new Response('ok');
}

const ADMIN_HELP = 'Команды: /start — открыть игры, /me — мой прогресс, /report текст — отзыв.\n\n'
  + 'Для владельца:\n'
  + '/broadcast текст — всем игрокам;\n'
  + '/silentbroadcast текст — всем, но без звука уведомления;\n'
  + '/unsend — удалить у всех недавнюю рассылку или сообщение (Telegram даёт 48 часов);\n'
  + '/edit — изменить текст недавней рассылки у всех (там же, без нового уведомления);\n'
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
  // оформление текста (JSON entities) и «без звука» — столбцы добавлены позже: у старой таблицы их может не быть
  for (const column of ['entities TEXT', 'silent INTEGER']) {
    try {
      await env.DB.prepare(`ALTER TABLE drafts ADD COLUMN ${column}`).run();
    } catch {
      // уже есть
    }
  }
  // кому и какие сообщения ушли (номера нужны, чтобы потом удалить — /unsend) и у кого уже удалено
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sent_messages (
    draft_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, message_ids TEXT NOT NULL, PRIMARY KEY (draft_id, chat_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS unsend_done (
    draft_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, PRIMARY KEY (draft_id, chat_id))`).run();
  // старая рассылка без записанных номеров: номер копии владельца — он ответил командой на это сообщение
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS draft_anchor (
    draft_id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL)`).run();
  // /edit: владелец выбрал рассылку и присылает новый текст
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bot_pending (
    admin_id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL, text TEXT, entities TEXT, created_at INTEGER NOT NULL)`).run();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectDraft(env, ctx, message, { command, rest, media, entities = [], restAt = 0 }) {
  await ensureDraftTables(env);
  const adminId = message.from.id;
  const chatId = message.chat.id;
  const key = message.media_group_id ? `g${message.media_group_id}` : `m${message.message_id}`;

  // что написано в команде
  let kind = null;
  let target = null;
  let targetName = null;
  let text = null;
  let textAt = restAt;                     // где текст рассылки начинается в исходном сообщении
  let silent = null;                       // null — часть альбома без подписи: берётся у части с командой
  if (command === '/broadcast' || command === '/silentbroadcast') {
    kind = 'broadcast';
    text = rest;
    silent = command === '/silentbroadcast' ? 1 : 0;
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
    const tail = rest.slice(who.length);
    text = tail.trim();
    textAt = restAt + who.length + (tail.length - tail.trimStart().length);
    void words;
  }
  // оформление (сворачиваемые цитаты, жирный, ссылки) — сдвигается на вырезанную команду и ник
  const format = text ? shiftEntities(entities, textAt, text.length) : [];

  const stamp = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO drafts (admin_id, chat_id, group_key, kind, target, target_name, text, entities, silent, stamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (admin_id, group_key) DO UPDATE SET
        kind = COALESCE(excluded.kind, drafts.kind), target = COALESCE(excluded.target, drafts.target),
        target_name = COALESCE(excluded.target_name, drafts.target_name), text = COALESCE(excluded.text, drafts.text),
        entities = COALESCE(excluded.entities, drafts.entities), silent = COALESCE(excluded.silent, drafts.silent),
        stamp = excluded.stamp`)
    .bind(adminId, chatId, key, kind, target, targetName, text, format.length ? JSON.stringify(format) : null, silent, stamp, Date.now()).run();
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
    text: draft.kind === 'broadcast'
      ? `Разослать всем игрокам${draft.silent ? ' без звука' : ''} (${players})?`
      : `Отправить ${draft.target_name}?`,
    reply_markup: {
      inline_keyboard: [[
        { text: draft.kind === 'broadcast' ? `${draft.silent ? '🔕' : '📣'} Разослать (${players})` : '✉️ Отправить', callback_data: `d:send:${draft.id}` },
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
  let format = [];
  try {
    format = draft.entities ? JSON.parse(draft.entities) : [];
  } catch {
    format = [];
  }
  const withText = format.length ? { entities: format } : {};
  const withCaption = text ? { caption: text, ...(format.length ? { caption_entities: format } : {}) } : {};
  const quiet = draft.silent ? { disable_notification: true } : {};
  let res;
  if (!media.length) {
    res = await api(env, 'sendMessage', { chat_id: chatId, text, ...withText, ...quiet, reply_markup: playButton(env) });
  } else if (media.length === 1) {
    const [m] = media;
    res = await api(env, m.type === 'video' ? 'sendVideo' : 'sendPhoto', {
      chat_id: chatId, [m.type]: m.id, ...withCaption, ...quiet, reply_markup: playButton(env),
    });
  } else {
    res = await api(env, 'sendMediaGroup', {
      chat_id: chatId, ...quiet,
      media: media.map((m, i) => ({ type: m.type, media: m.id, ...(i === 0 ? withCaption : {}) })),
    });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.ok === false) return { ok: false, ids: [] };
  const result = data?.result;
  const ids = (Array.isArray(result) ? result : [result]).map((m) => m?.message_id).filter(Number.isInteger);
  return { ok: true, ids };
}

/** Запомнить, что ушло игроку, — /unsend потом удалит именно эти сообщения. */
async function recordSent(env, draftId, chatId, ids) {
  if (!draftId || !ids.length) return;
  await env.DB.prepare('INSERT OR REPLACE INTO sent_messages (draft_id, chat_id, message_ids) VALUES (?, ?, ?)')
    .bind(draftId, chatId, JSON.stringify(ids)).run();
}

/** Кнопки под предпросмотром. Нажать может только владелец; дважды не отправится. */
async function onButton(query, env, ctx) {
  const answer = (text) => api(env, 'answerCallbackQuery', { callback_query_id: query.id, ...(text ? { text } : {}) });
  const [prefix, action, rawId] = String(query.data ?? '').split(':');
  if (!['d', 'u', 'e'].includes(prefix) || !isAdmin(query.from?.id, parseAdminIds(env.ADMIN_IDS))) {
    await answer('Это только для владельца.');
    return;
  }
  await ensureDraftTables(env);
  if (prefix === 'u' || prefix === 'e') {
    await onSentButton(query, env, ctx, prefix, action, Number(rawId), answer);
    return;
  }
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
      const sent = await sendDraft(env, draft.target, draft).catch(() => ({ ok: false, ids: [] }));
      await recordSent(env, draft.id, draft.target, sent.ids);
      const { ok } = sent;
      await edit(ok ? `Отправлено ${draft.target_name}.` : `Не доставлено ${draft.target_name}: игрок заблокировал бота или не начинал с ним чат.`);
    }
    await env.DB.prepare("UPDATE drafts SET state = 'sent' WHERE id = ?").bind(draft.id).run();
  };
  if (ctx?.waitUntil) ctx.waitUntil(job());
  else await job();
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Игрок и его прогресс (строки по играм) по Telegram-id; игрока нет — null. */
async function playerProgress(env, tgId) {
  const player = await env.DB.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first();
  if (!player) return null;
  const row = await env.DB.prepare('SELECT data FROM states WHERE user_id = ?').bind(player.id).first();
  let state = {};
  try {
    state = JSON.parse(row?.data ?? '{}');
  } catch {
    state = {};
  }
  return { player, lines: progressLines(state) };
}

/** Текст для /me: уровни и рекорды из сохранённого прогресса. */
async function meText(env, tgId) {
  const found = await playerProgress(env, tgId);
  if (!found) return 'Ты ещё не заходил в игры. Нажми «Играть» — и всё появится.';
  if (!found.lines.length) return 'Пока пусто — сыграй партию, и здесь появятся уровни и рекорды.';
  const { player, lines } = found;
  return `<b>${escapeHtml(displayName({ first_name: player.name, username: player.username }))}</b>\n`
    + lines.map((l) => `• ${escapeHtml(l)}`).join('\n');
}

// ---------- инлайн-режим ----------

let cachedUsername = null;

/** Имя бота для ссылок t.me/<бот>: из переменной BOT_USERNAME или один раз у Telegram (getMe). */
async function botUsername(env) {
  if (env.BOT_USERNAME) return env.BOT_USERNAME.replace(/^@/, '');
  if (cachedUsername) return cachedUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (data.ok && data.result?.username) cachedUsername = data.result.username;
  } catch {
    // сеть моргнула — ниже запасной вариант
  }
  return cachedUsername;
}

// Слова, по которым вместо игр показывается свой прогресс.
const RECORDS_QUERY = /^(рекорд|мои|мой|прогресс|стат|me|my|score)/;

/**
 * Инлайн-запрос «@бот …» из любого чата. Кнопки web_app в чужих чатах Telegram не разрешает,
 * поэтому кнопка — ссылка на главное мини-приложение (t.me/<бот>?startapp=<игра>).
 */
async function onInline(query, env) {
  const username = await botUsername(env);
  const link = (param) => (username ? startAppLink(username, param) : appUrl(env));
  const button = (text, param) => ({ inline_keyboard: [[{ text, url: link(param) }]] });
  const q = (query.query ?? '').trim().toLowerCase();

  const invite = {
    type: 'article',
    id: 'all',
    title: '🎮 Позвать играть',
    description: `${publicGames().length} игр прямо в Telegram: слова, головоломки, аркады`,
    input_message_content: {
      message_text: `🎮 <b>Игры прямо в Telegram</b>\n${publicGames().map((g) => g.title).join(', ')}.`,
      parse_mode: 'HTML',
    },
    reply_markup: button('🎮 Играть', ''),
  };
  const gameResult = (g) => ({
    type: 'article',
    id: `g:${g.id}`,
    title: `${g.emoji} ${g.title}`,
    description: g.about,
    input_message_content: {
      message_text: `${g.emoji} <b>${escapeHtml(g.title)}</b> — ${escapeHtml(g.about)}.\nСыграем?`,
      parse_mode: 'HTML',
    },
    reply_markup: button(`▶️ Играть в «${g.title}»`, g.id),
  });

  const mine = await playerProgress(env, query.from?.id);
  const records = mine?.lines.length ? {
    type: 'article',
    id: 'me',
    title: '🏆 Мои рекорды',
    description: mine.lines.slice(0, 3).join(' · '),
    input_message_content: {
      message_text: `🏆 <b>Мои игры</b>\n${mine.lines.map((l) => `• ${escapeHtml(l)}`).join('\n')}`,
      parse_mode: 'HTML',
    },
    reply_markup: button('🎮 Попробуй побить', ''),
  } : null;

  const results = [];
  if (!q) {
    results.push(invite);
    if (records) results.push(records);
    results.push(...publicGames().map(gameResult));
  } else if (RECORDS_QUERY.test(q)) {
    if (records) results.push(records);
    results.push(invite);
  } else {
    const games = findGames(q);
    results.push(...games.map(gameResult));
    if (!games.length) results.push(invite);
  }

  await api(env, 'answerInlineQuery', {
    inline_query_id: query.id,
    results: results.slice(0, 50),
    cache_time: 10,
    is_personal: true,          // «Мои рекорды» у каждого свои
  });
}

/**
 * Рассылка всем, кто хоть раз открывал игры. Заблокировавшие бота просто не получат сообщение.
 * content — строка (панель владельца) или черновик { text, media }.
 */
async function broadcast(env, content) {
  const draft = typeof content === 'string' ? { text: content, media: [] } : content;
  const rows = await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0 ORDER BY id LIMIT ?').bind(BROADCAST_LIMIT).all();
  const ids = (rows.results ?? []).map((r) => r.tg_id);
  let sent = 0;
  let failed = 0;
  if (draft.id) await ensureDraftTables(env);
  for (const id of ids) {
    try {
      const res = await sendDraft(env, id, draft);
      if (res.ok) {
        sent += 1;
        await recordSent(env, draft.id, id, res.ids);
      } else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { total: ids.length, sent, failed };
}

// ---------- /unsend и /edit: удалить или изменить у всех недавнюю рассылку ----------
// Номера отправленного записываются (sent_messages) — по ним всё точно. У рассылок, ушедших до записи номеров,
// номера ищутся. У бота номера сообщений — ОДИН общий счётчик на все чаты (первая версия считала, что у каждого чата
// свой, и искала рядом с «якорем» в том же чате — не находила ничего). Рассылка уходила игрокам подряд, в порядке id,
// поэтому её сообщения — почти подряд идущие номера. Владелец отвечает командой на копию рассылки в своём чате
// (draft_anchor) — от неё номер у соседнего по порядку игрока ожидается на 1 больше/меньше; бот проверяет номера
// вокруг ожидаемого (SEEK): пересылает сообщение себе (копию сразу стирает) — чужой чат не отдаст, своё сообщение с
// тем же текстом и есть нужное; сообщения игрока не трогаются. Найденные номера записываются. Удалять свои сообщения
// Telegram даёт боту 48 часов. Много игроков — Cloudflare может оборвать по лимиту запросов: «Продолжить» доделает.

const SEEK = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10];
const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const clip = (text, n = 40) => {
  const t = norm(text) || '(картинка)';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const SENT_ACTIONS = {
  u: { icon: '🗑', intro: 'Что удалить у всех, кому ушло? Telegram даёт боту удалять свои сообщения только 48 часов.' },
  e: { icon: '✏️', intro: 'Что изменить? Сообщение поменяется там же, где было, без нового уведомления.' },
};
const REPLY_HINT = 'Эту рассылку бот не запомнил. Найди её в этом чате и ответь на неё командой (реплаем) — ';

async function listSent(env, chatId, adminId, prefix) {
  await ensureDraftTables(env);
  const rows = (await env.DB.prepare(`SELECT id, kind, target_name, text FROM drafts
      WHERE admin_id = ? AND state = 'sent' ORDER BY id DESC LIMIT 6`).bind(adminId).all()).results ?? [];
  if (!rows.length) {
    await api(env, 'sendMessage', { chat_id: chatId, text: 'Рассылок и сообщений ещё не было.' });
    return;
  }
  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: `${SENT_ACTIONS[prefix].intro} Старую рассылку проще выбрать ответом на неё: ${prefix === 'e' ? '/edit' : '/unsend'} реплаем.`,
    reply_markup: {
      inline_keyboard: rows.map((d) => [{
        text: `${SENT_ACTIONS[prefix].icon} ${d.kind === 'broadcast' ? 'Всем' : d.target_name}: ${clip(d.text, 32)}`,
        callback_data: `${prefix}:ask:${d.id}`,
      }]),
    },
  });
}

/** Владелец ответил командой на сообщение рассылки: находим рассылку по тексту и запоминаем номер его копии. */
async function pickByReply(env, chatId, adminId, prefix, replied) {
  await ensureDraftTables(env);
  const text = norm(replied.text ?? replied.caption);
  const drafts = (await env.DB.prepare("SELECT * FROM drafts WHERE admin_id = ? AND state = 'sent' ORDER BY id DESC LIMIT 50")
    .bind(adminId).all()).results ?? [];
  const draft = drafts.find((d) => norm(d.text) === text);
  if (!draft) {
    await api(env, 'sendMessage', { chat_id: chatId, text: 'Это сообщение не похоже на рассылку — не нашёл такую.' });
    return;
  }
  await env.DB.prepare(`INSERT INTO draft_anchor (draft_id, chat_id, message_id) VALUES (?, ?, ?)
      ON CONFLICT (draft_id) DO UPDATE SET chat_id = excluded.chat_id, message_id = excluded.message_id`)
    .bind(draft.id, chatId, replied.message_id).run();
  await env.DB.prepare('INSERT OR IGNORE INTO sent_messages (draft_id, chat_id, message_ids) VALUES (?, ?, ?)')
    .bind(draft.id, chatId, JSON.stringify([replied.message_id])).run();
  await askAbout(env, chatId, adminId, prefix, draft, (text2, buttons) => api(env, 'sendMessage', {
    chat_id: chatId, text: text2, ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  }));
}

/** Вопрос по выбранной рассылке: удалить — подтверждение; изменить — «пришли новый текст». */
async function askAbout(env, chatId, adminId, prefix, draft, say) {
  const who = draft.kind === 'broadcast' ? 'у всех игроков' : `у ${draft.target_name}`;
  const recorded = await env.DB.prepare('SELECT 1 FROM sent_messages WHERE draft_id = ? LIMIT 1').bind(draft.id).first();
  if (!recorded) {
    await say(`${REPLY_HINT}${prefix === 'e' ? '/edit' : '/unsend'}.`);
    return;
  }
  if (prefix === 'u') {
    await say(`Удалить «${clip(draft.text, 60)}» ${who}?`, [
      { text: '🗑 Удалить', callback_data: `u:go:${draft.id}` },
      { text: 'Отмена', callback_data: `u:no:${draft.id}` },
    ]);
    return;
  }
  await env.DB.prepare(`INSERT INTO bot_pending (admin_id, draft_id, text, entities, created_at) VALUES (?, ?, NULL, NULL, ?)
      ON CONFLICT (admin_id) DO UPDATE SET draft_id = excluded.draft_id, text = NULL, entities = NULL, created_at = excluded.created_at`)
    .bind(adminId, draft.id, Date.now()).run();
  await say(`Пришли одним сообщением новый текст вместо «${clip(draft.text, 60)}». `
    + 'Оформление (жирный, ссылки, цитаты) сохранится. Передумал — /cancel.');
}

/** /edit: владелец выбрал рассылку — следующее его сообщение без команды станет новым текстом. */
async function takeEditText(env, adminId, chatId, text, entities) {
  const pending = await env.DB.prepare('SELECT * FROM bot_pending WHERE admin_id = ? AND created_at > ?')
    .bind(adminId, Date.now() - 30 * 60 * 1000).first();
  if (!pending) return false;
  const draft = await loadDraft(env, 'id = ?', pending.draft_id);
  if (!draft) return false;
  const limit = draft.media.length ? CAPTION_LIMIT : TEXT_LIMIT;
  if (text.length > limit) {
    await api(env, 'sendMessage', { chat_id: chatId, text: `Слишком длинно: ${text.length} символов, можно ${limit}.` });
    return true;
  }
  await env.DB.prepare('UPDATE bot_pending SET text = ?, entities = ? WHERE admin_id = ?')
    .bind(text, entities.length ? JSON.stringify(entities) : null, adminId).run();
  await api(env, 'sendMessage', { chat_id: chatId, text: 'Будет так:' });
  await api(env, 'sendMessage', { chat_id: chatId, text, ...(entities.length ? { entities } : {}), reply_markup: playButton(env) });
  await api(env, 'sendMessage', {
    chat_id: chatId,
    text: `Заменить «${clip(draft.text, 40)}» ${draft.kind === 'broadcast' ? 'у всех игроков' : `у ${draft.target_name}`}?`,
    reply_markup: {
      inline_keyboard: [[
        { text: '✏️ Заменить', callback_data: `e:go:${draft.id}` },
        { text: 'Отмена', callback_data: `e:no:${draft.id}` },
      ]],
    },
  });
  return true;
}

async function onSentButton(query, env, ctx, prefix, action, draftId, answer) {
  const chat = query.message?.chat?.id;
  const adminId = query.from.id;
  const edit = (text, buttons = null) => query.message && api(env, 'editMessageText', {
    chat_id: chat, message_id: query.message.message_id, text,
    ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
  const draft = await env.DB.prepare("SELECT * FROM drafts WHERE id = ? AND admin_id = ? AND state = 'sent'")
    .bind(draftId, adminId).first();
  if (!draft) {
    await answer('Не нашёл такую рассылку.');
    return;
  }
  if (action === 'ask') {
    await answer();
    await askAbout(env, chat, adminId, prefix, draft, edit);
    return;
  }
  if (action === 'no') {
    if (prefix === 'e') await env.DB.prepare('DELETE FROM bot_pending WHERE admin_id = ?').bind(adminId).run();
    await answer();
    await edit(prefix === 'e' ? 'Ничего не изменено.' : 'Ничего не удалено.');
    return;
  }

  let act = { kind: 'delete' };
  if (prefix === 'e') {
    const pending = await env.DB.prepare('SELECT * FROM bot_pending WHERE admin_id = ? AND draft_id = ? AND text IS NOT NULL')
      .bind(adminId, draft.id).first();
    if (!pending) {
      await answer('Сначала пришли новый текст.');
      return;
    }
    let entities = [];
    try {
      entities = pending.entities ? JSON.parse(pending.entities) : [];
    } catch {
      entities = [];
    }
    act = { kind: 'edit', text: pending.text, entities };
  }
  await answer(prefix === 'e' ? 'Меняю…' : 'Удаляю…');
  const job = async () => {
    const r = await applyToSent(env, draft, chat, act);
    const parts = [`${prefix === 'e' ? 'Изменено' : 'Удалено'}: ${r.done}.`];
    if (r.missing) parts.push(`Не нашёл: ${r.missing}.`);
    if (r.failed) parts.push(`Не удалось: ${r.failed}${prefix === 'u' ? ' — старше 48 часов или чат удалён' : ''}.`);
    if (r.stopped) parts.push('Не успел всех — нажми «Продолжить».');
    if (prefix === 'e' && !r.stopped) {
      // теперь у рассылки новый текст — по нему её и искать, если понадобится ещё раз
      await env.DB.prepare('UPDATE drafts SET text = ?, entities = ? WHERE id = ?')
        .bind(act.text, act.entities.length ? JSON.stringify(act.entities) : null, draft.id).run();
      await env.DB.prepare('DELETE FROM bot_pending WHERE admin_id = ?').bind(adminId).run();
    }
    await edit(parts.join(' '), r.stopped ? [{ text: 'Продолжить', callback_data: `${prefix}:go:${draft.id}` }] : null);
  };
  if (ctx?.waitUntil) ctx.waitUntil(job());
  else await job();
}

/** Удалить или изменить рассылку у каждого получателя (номера — записанные или найденные от якоря). */
async function applyToSent(env, draft, adminChat, act) {
  const r = { done: 0, missing: 0, failed: 0, stopped: false };
  const tg = async (method, payload) => {
    const res = await api(env, method, payload);
    return res.json().catch(() => ({ ok: res.ok }));
  };
  const deleting = act.kind === 'delete';
  const done = new Set(deleting
    ? ((await env.DB.prepare('SELECT chat_id FROM unsend_done WHERE draft_id = ?').bind(draft.id).all()).results ?? []).map((row) => row.chat_id)
    : []);
  const known = new Map();                        // chat → номера сообщений рассылки
  for (const row of (await env.DB.prepare('SELECT chat_id, message_ids FROM sent_messages WHERE draft_id = ?').bind(draft.id).all()).results ?? []) {
    known.set(row.chat_id, JSON.parse(row.message_ids));
  }
  // порядок, в котором рассылка уходила (по id игрока), — по нему ожидаемые номера соседей
  const order = draft.kind === 'broadcast'
    ? ((await env.DB.prepare('SELECT tg_id FROM users WHERE banned = 0 ORDER BY id').all()).results ?? []).map((u) => u.tg_id)
    : [draft.target];
  const recipients = [...new Set([...known.keys(), ...order])];
  const text = norm(draft.text);
  const mediaCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM draft_media WHERE admin_id = ? AND group_key = ?')
    .bind(draft.admin_id, draft.group_key).first())?.n ?? 0;

  /** Номер у игрока: от ближайшего по порядку, чей номер известен, — ожидаемый ± SEEK. */
  const seek = async (chatId) => {
    const k = order.indexOf(chatId);
    if (k < 0 || !text) return null;
    let base = null;
    for (let d = 1; d < order.length && base == null; d++) {
      for (const j of [k - d, k + d]) {
        const ids = j >= 0 && j < order.length ? known.get(order[j]) : null;
        if (ids && base == null) base = ids[0] + (k - j);
      }
    }
    if (base == null) return null;
    for (const off of SEEK) {
      const id = base + off;
      if (id <= 0) continue;
      const fw = await tg('forwardMessage', { chat_id: adminChat, from_chat_id: chatId, message_id: id, disable_notification: true });
      if (!fw.ok || !fw.result) continue;                  // не из этого чата
      await tg('deleteMessage', { chat_id: adminChat, message_id: fw.result.message_id });
      const byBot = fw.result.forward_origin?.sender_user?.is_bot || fw.result.forward_from?.is_bot;
      if (byBot && norm(fw.result.text ?? fw.result.caption) === text) return id;
    }
    return null;
  };

  // сначала ближние к известным: так ожидаемые номера точнее
  const pendingChats = recipients.filter((c) => !done.has(c));
  try {
    for (const chatId of pendingChats) {
      let ids = known.get(chatId);
      if (!ids) {
        const id = await seek(chatId);
        if (id) {
          ids = [id];
          known.set(chatId, ids);
          await env.DB.prepare('INSERT OR IGNORE INTO sent_messages (draft_id, chat_id, message_ids) VALUES (?, ?, ?)')
            .bind(draft.id, chatId, JSON.stringify(ids)).run();
        }
      }
      if (!ids) {
        r.missing += 1;
        continue;
      }
      let ok;
      if (deleting) {
        ok = (await tg('deleteMessages', { chat_id: chatId, message_ids: ids })).ok;
        if (ok) await env.DB.prepare('INSERT OR IGNORE INTO unsend_done (draft_id, chat_id) VALUES (?, ?)').bind(draft.id, chatId).run();
      } else {
        const format = act.entities;
        const res = mediaCount
          ? await tg('editMessageCaption', {
            chat_id: chatId, message_id: ids[0], caption: act.text, ...(format.length ? { caption_entities: format } : {}),
            ...(mediaCount === 1 ? { reply_markup: playButton(env) } : {}),
          })
          : await tg('editMessageText', {
            chat_id: chatId, message_id: ids[0], text: act.text, ...(format.length ? { entities: format } : {}),
            reply_markup: playButton(env),
          });
        ok = res.ok || /not modified/i.test(res.description ?? '');
      }
      if (ok) r.done += 1;
      else r.failed += 1;
    }
  } catch (err) {
    console.warn('рассылка: работа прервана', err);
    r.stopped = true;
  }
  return r;
}
