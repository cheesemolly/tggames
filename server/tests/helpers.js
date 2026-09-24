// Общее для серверных тестов: поддельная (но правильно подписанная) initData и база в памяти.
// Подпись считается так же, как её делает Telegram, поэтому тесты проверяют настоящую проверку,
// а не её упрощённую копию.

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const TOKEN = '1234567890:TEST-TOKEN-not-a-real-one';
export const USER = { id: 42, first_name: 'Маша', username: 'masha', language_code: 'ru' };
export const ADMIN = { id: 7, first_name: 'Владелец', username: 'owner' };

const enc = new TextEncoder();

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** initData, какую кладёт Telegram: поля + hash, подписанный ключом от токена бота. */
export async function makeInitData(token, user, { authDate = Date.now(), queryId = 'AAA', signature = null } = {}) {
  const fields = { auth_date: String(Math.floor(authDate / 1000)), query_id: queryId };
  if (user) fields.user = JSON.stringify(user);
  // Новые клиенты добавляют signature (для сторонней проверки по Ed25519). В подписываемую строку
  // оно входит наравне с остальными полями — проверяем, что мы это учитываем.
  if (signature) fields.signature = signature;

  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), token);
  const hash = [...await hmac(secret, check)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

/** Интерфейс D1 (prepare → bind → first/run/all) поверх SQLite в памяти. */
export function createEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const wrap = (stmt, args) => ({
    first: () => stmt.get(...args) ?? null,
    // как D1: результат run() — { success, meta: { changes, last_row_id } }
    run: () => {
      const r = stmt.run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    all: () => ({ results: stmt.all(...args) }),
  });
  return {
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return { bind: (...args) => wrap(stmt, args), ...wrap(stmt, []) };
      },
    },
    BOT_TOKEN: TOKEN,
    ADMIN_IDS: String(ADMIN.id),
    WEBHOOK_SECRET: 'webhook-secret',            // в заголовки HTTP кириллицу класть нельзя
    APP_URL: 'https://example.test/tggames/',
    ...extra,
  };
}

/** Подменяет fetch: запросы к Bot API не уходят наружу, а собираются в массив. */
export function captureTelegram() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ method: String(url).split('/').pop(), payload: JSON.parse(init.body) });
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}
