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
 * Строка, которую Telegram подписывает: все поля **кроме hash**, в виде key=value,
 * отсортированные по имени и склеенные переводом строки.
 *
 * Важно: поле `signature` (есть у новых клиентов, нужно для сторонней проверки по Ed25519)
 * в эту строку ВХОДИТ. Если его исключить, подпись не сойдётся — на Telegram Desktop вход
 * падал именно из-за этого (найдено диагностикой /debug/initdata, 2026-09-23).
 */
export function dataCheckString(params) {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
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

/**
 * Диагностика подписи: считает hash несколькими способами и говорит, какой сошёлся.
 * Нужна, когда вход не проходит, а токен заведомо правильный: сразу видно, дело в способе
 * подсчёта (кодирование значений, лишнее поле signature) или подпись вообще не от этого бота.
 * Наружу отдаёт только имена полей и признаки — ни самих данных, ни токена.
 */
export async function diagnoseInitData(initData, botToken) {
  const out = { ok: false, fields: [], hasSignature: false, hasHash: false, ageSec: null, matches: {} };
  if (typeof initData !== 'string' || !initData) return { ...out, error: 'no_init_data' };
  if (!botToken) return { ...out, error: 'no_bot_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  out.fields = [...params.keys()].sort();
  out.hasSignature = params.has('signature');
  out.hasHash = Boolean(hash);
  const authDate = Number(params.get('auth_date')) * 1000;
  if (Number.isFinite(authDate) && authDate > 0) out.ageSec = Math.round((Date.now() - authDate) / 1000);
  if (!hash) return { ...out, error: 'bad_init_data' };

  // Те же пары, но без декодирования — на случай, если значения надо брать «как в строке».
  const rawPairs = initData.split('&').map((part) => {
    const at = part.indexOf('=');
    return [part.slice(0, at), part.slice(at + 1)];
  });
  const build = (pairs, skip) => pairs
    .filter(([key]) => !skip.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const variants = {
    standard: build([...params.entries()], ['hash']),                     // так считаем мы
    withoutSignature: build([...params.entries()], ['hash', 'signature']),
    raw: build(rawPairs, ['hash']),
    rawWithoutSignature: build(rawPairs, ['hash', 'signature']),
  };
  for (const [name, text] of Object.entries(variants)) {
    out.matches[name] = timingSafeEqual(toHex(await hmac(secret, text)), hash);
  }
  out.ok = Object.values(out.matches).some(Boolean);
  return out;
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
