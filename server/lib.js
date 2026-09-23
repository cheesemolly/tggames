// Общие части серверного обработчика: проверка подписи Telegram, разбор данных, лимиты.
// Здесь нет ничего, что есть только в Cloudflare Workers (используется Web Crypto, он есть и в node),
// поэтому этот файл целиком покрывается тестами `node --test`.

export const MAX_STATE_BYTES = 400 * 1024;   // прогресс одного игрока; замер: 100 уровней «Слов» ≈ 64 КБ

// initData живёт сутки: Telegram кладёт в неё auth_date, и старую подпись мы не принимаем —
// чтобы перехваченная строка не работала вечно.
export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Сравнение за одинаковое время: по времени ответа нельзя подбирать подпись посимвольно. */
export function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Строка, которую Telegram подписывает: все поля, кроме hash и signature, в виде key=value,
 * отсортированные по имени и склеенные переводом строки.
 */
export function dataCheckString(params) {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

/**
 * Проверка initData мини-приложения.
 * Ключ подписи — HMAC-SHA256 от токена бота с ключом «WebAppData»; этим ключом подписана
 * dataCheckString. Токен есть только у сервера, поэтому подделать initData на клиенте нельзя.
 *
 * Возвращает { ok: true, user, authDate } или { ok: false, error }.
 */
export async function checkInitData(initData, botToken, { now = Date.now(), maxAgeMs = INIT_DATA_MAX_AGE_MS } = {}) {
  if (typeof initData !== 'string' || !initData) return { ok: false, error: 'no_init_data' };
  if (!botToken) return { ok: false, error: 'no_bot_token' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'bad_init_data' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'bad_init_data' };

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secret, dataCheckString(params)));
  if (!timingSafeEqual(expected, hash)) return { ok: false, error: 'bad_signature' };

  const authDate = Number(params.get('auth_date')) * 1000;
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, error: 'bad_init_data' };
  if (now - authDate > maxAgeMs) return { ok: false, error: 'expired' };

  let user;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    return { ok: false, error: 'bad_user' };
  }
  if (!user || !Number.isFinite(user.id)) return { ok: false, error: 'bad_user' };

  return { ok: true, user, authDate, startParam: params.get('start_param') ?? null };
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

/** Админы — список Telegram-id в переменной ADMIN_IDS («123,456»). В коде их нет. */
export function parseAdminIds(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export const isAdmin = (tgId, adminIds) => adminIds.includes(Number(tgId));

/** Имя игрока для списков: «Маша (@masha)» или просто имя. */
export function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || 'Без имени';
  return user?.username ? `${name} (@${user.username})` : name;
}
