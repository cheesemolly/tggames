// СОБРАННЫЙ ФАЙЛ — не редактировать руками.
// Источники: server/worker.js и server/lib.js, пересборка: node server/tools/bundle.js
// Это то, что вставляется в редактор Cloudflare Worker.

// Общие части серверного обработчика: проверка данных, пароли, токены, ответы.
// Здесь нет ничего, что есть только в Cloudflare Workers (используется Web Crypto, он есть и в node),
// поэтому этот файл целиком покрывается тестами `node --test`.

const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,20}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const MAX_STATE_BYTES = 400 * 1024;   // прогресс одного игрока; замер: 100 уровней «Слов» ≈ 64 КБ
const PBKDF2_ITERATIONS = 120_000;

// Неудачные попытки входа: больше ATTEMPT_LIMIT за ATTEMPT_WINDOW_MS — имя временно блокируется.
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;   // полгода: игрок не должен входить каждую неделю

/** Ключ уникальности имени: регистр и ё/е не различаем, иначе «Маша» и «маша» — разные игроки. */
function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

/** null — имя годится, иначе код ошибки для клиента. */
function validateName(name) {
  const value = String(name ?? '').trim();
  if (!value) return 'name_empty';
  if (!NAME_RE.test(value)) return 'name_bad';
  return null;
}

function validatePassword(password) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD) return 'password_short';
  if (value.length > MAX_PASSWORD) return 'password_long';
  return null;
}

const enc = new TextEncoder();

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

/** PBKDF2-SHA256. Соль новая, если не передана (регистрация); при проверке передаётся сохранённая. */
async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256,
  );
  return { salt: b64encode(salt), hash: b64encode(new Uint8Array(bits)) };
}

async function verifyPassword(password, saltB64, hashB64) {
  if (!saltB64 || !hashB64) return false;
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(hash, hashB64);
}

/** Сравнение за одинаковое время: по времени ответа нельзя угадывать хэш посимвольно. */
function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Токен сессии: 32 случайных байта. Клиенту отдаётся он, в базе лежит только его хэш. */
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Прогресс приходит строкой JSON: проверяем размер и то, что это вообще объект. */
function validateState(data) {
  if (typeof data !== 'string') return 'state_type';
  if (enc.encode(data).length > MAX_STATE_BYTES) return 'state_big';
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return 'state_json';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'state_shape';
  return null;
}

/** Заблокировано ли имя после неудачных входов. row — строка таблицы attempts или null. */
function isLockedOut(row, now) {
  if (!row) return false;
  if (now >= row.reset_at) return false;
  return row.count >= ATTEMPT_LIMIT;
}

function nextAttempt(row, now) {
  if (!row || now >= row.reset_at) return { count: 1, reset_at: now + ATTEMPT_WINDOW_MS };
  return { count: row.count + 1, reset_at: row.reset_at };
}

// Обработчик Cloudflare Worker: регистрация, вход и хранение прогресса игрока.
// База — Cloudflare D1 (привязка `DB`, схема в schema.sql). Как это выкладывается — в README.md.
//
// Запросы (всё — JSON):
//   POST /register { name, password, state? } -> { token, name }   state — прогресс гостя, переносится в аккаунт
//   POST /login    { name, password }         -> { token, name, updatedAt }
//   POST /logout                              -> { ok: true }
//   GET  /me                                  -> { name }
//   GET  /state                               -> { data, updatedAt }
//   PUT  /state    { data, base }             -> { updatedAt }     base — updatedAt, от которого играли
// Везде, кроме register/login, нужен заголовок `Authorization: Bearer <token>`.


// Кто может обращаться к обработчику. Свой домен — чтобы чужой сайт не ходил в него от имени игрока.
const ALLOWED_ORIGINS = [
  'https://cheesemolly.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
      if (path === '/register' && request.method === 'POST') return await register(request, env, origin);
      if (path === '/login' && request.method === 'POST') return await login(request, env, origin);
      if (path === '/logout' && request.method === 'POST') return await logout(request, env, origin);
      if (path === '/me' && request.method === 'GET') return await me(request, env, origin);
      if (path === '/state' && request.method === 'GET') return await getState(request, env, origin);
      if (path === '/state' && request.method === 'PUT') return await putState(request, env, origin);
      if (path === '/') return json({ ok: true, service: 'tggames' }, 200, origin);
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

/** Создаёт сессию и возвращает токен. В базе — только хэш токена. */
async function createSession(env, userId, now) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

/** Игрок по заголовку Authorization или null. */
async function authorize(request, env, now) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).bind(await sha256hex(token)).first();
  if (!row || row.expires_at < now) return null;
  return { id: row.id, name: row.name };
}

async function register(request, env, origin) {
  const { name, password, state } = await body(request);
  const bad = validateName(name) ?? validatePassword(password);
  if (bad) return fail(bad, 400, origin);
  if (state !== undefined && state !== null) {
    const badState = validateState(state);
    if (badState) return fail(badState, 400, origin);
  }

  const now = Date.now();
  const key = normalizeName(name);
  const taken = await env.DB.prepare('SELECT id FROM users WHERE name_key = ?').bind(key).first();
  if (taken) return fail('name_taken', 409, origin);

  const { salt, hash } = await hashPassword(password);
  const inserted = await env.DB.prepare(
    'INSERT INTO users (name, name_key, salt, hash, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
  ).bind(String(name).trim(), key, salt, hash, now).first();

  // Прогресс, набранный до регистрации, переносится в новый аккаунт.
  const data = state ?? '{}';
  await env.DB.prepare('INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)')
    .bind(inserted.id, data, now).run();

  const token = await createSession(env, inserted.id, now);
  return json({ token, name: String(name).trim(), updatedAt: now }, 200, origin);
}

async function login(request, env, origin) {
  const { name, password } = await body(request);
  if (validateName(name) || validatePassword(password)) return fail('bad_credentials', 401, origin);

  const now = Date.now();
  const key = normalizeName(name);
  const attempts = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE name_key = ?').bind(key).first();
  if (isLockedOut(attempts, now)) return fail('too_many', 429, origin);

  const user = await env.DB.prepare('SELECT id, name, salt, hash FROM users WHERE name_key = ?').bind(key).first();
  const ok = user ? await verifyPassword(password, user.salt, user.hash) : false;
  if (!ok) {
    const next = nextAttempt(attempts, now);
    await env.DB.prepare(
      `INSERT INTO attempts (name_key, count, reset_at) VALUES (?, ?, ?)
       ON CONFLICT(name_key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`,
    ).bind(key, next.count, next.reset_at).run();
    return fail('bad_credentials', 401, origin);
  }

  await env.DB.prepare('DELETE FROM attempts WHERE name_key = ?').bind(key).run();
  const token = await createSession(env, user.id, now);
  const row = await env.DB.prepare('SELECT updated_at FROM states WHERE user_id = ?').bind(user.id).first();
  return json({ token, name: user.name, updatedAt: row?.updated_at ?? 0 }, 200, origin);
}

async function logout(request, env, origin) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256hex(token)).run();
  return json({ ok: true }, 200, origin);
}

async function me(request, env, origin) {
  const user = await authorize(request, env, Date.now());
  if (!user) return fail('unauthorized', 401, origin);
  return json({ name: user.name }, 200, origin);
}

async function getState(request, env, origin) {
  const user = await authorize(request, env, Date.now());
  if (!user) return fail('unauthorized', 401, origin);
  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(user.id).first();
  return json({ data: row?.data ?? '{}', updatedAt: row?.updated_at ?? 0 }, 200, origin);
}

async function putState(request, env, origin) {
  const now = Date.now();
  const user = await authorize(request, env, now);
  if (!user) return fail('unauthorized', 401, origin);

  const { data, base } = await body(request);
  const bad = validateState(data);
  if (bad) return fail(bad, 400, origin);

  const row = await env.DB.prepare('SELECT data, updated_at FROM states WHERE user_id = ?').bind(user.id).first();
  const stored = row?.updated_at ?? 0;
  // На другом устройстве уже сохраняли новее — не затираем, отдаём тот прогресс клиенту.
  if (typeof base === 'number' && stored > base) {
    return json({ conflict: true, data: row.data, updatedAt: stored }, 409, origin);
  }

  const stamp = Math.max(now, stored + 1);
  await env.DB.prepare(
    `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).bind(user.id, data, stamp).run();
  return json({ updatedAt: stamp }, 200, origin);
}
