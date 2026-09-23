// Общие части серверного обработчика: проверка данных, пароли, токены, ответы.
// Здесь нет ничего, что есть только в Cloudflare Workers (используется Web Crypto, он есть и в node),
// поэтому этот файл целиком покрывается тестами `node --test`.

export const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_-]{3,20}$/;
export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 200;
export const MAX_STATE_BYTES = 400 * 1024;   // прогресс одного игрока; замер: 100 уровней «Слов» ≈ 64 КБ
export const PBKDF2_ITERATIONS = 120_000;

// Неудачные попытки входа: больше ATTEMPT_LIMIT за ATTEMPT_WINDOW_MS — имя временно блокируется.
export const ATTEMPT_LIMIT = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;   // полгода: игрок не должен входить каждую неделю

/** Ключ уникальности имени: регистр и ё/е не различаем, иначе «Маша» и «маша» — разные игроки. */
export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

/** null — имя годится, иначе код ошибки для клиента. */
export function validateName(name) {
  const value = String(name ?? '').trim();
  if (!value) return 'name_empty';
  if (!NAME_RE.test(value)) return 'name_bad';
  return null;
}

export function validatePassword(password) {
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
export async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256,
  );
  return { salt: b64encode(salt), hash: b64encode(new Uint8Array(bits)) };
}

export async function verifyPassword(password, saltB64, hashB64) {
  if (!saltB64 || !hashB64) return false;
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(hash, hashB64);
}

/** Сравнение за одинаковое время: по времени ответа нельзя угадывать хэш посимвольно. */
export function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Токен сессии: 32 случайных байта. Клиенту отдаётся он, в базе лежит только его хэш. */
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Прогресс приходит строкой JSON: проверяем размер и то, что это вообще объект. */
export function validateState(data) {
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
export function isLockedOut(row, now) {
  if (!row) return false;
  if (now >= row.reset_at) return false;
  return row.count >= ATTEMPT_LIMIT;
}

export function nextAttempt(row, now) {
  if (!row || now >= row.reset_at) return { count: 1, reset_at: now + ATTEMPT_WINDOW_MS };
  return { count: row.count + 1, reset_at: row.reset_at };
}
