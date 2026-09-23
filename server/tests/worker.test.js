// Проверка обработчика целиком: настоящий worker.js поверх локальной SQLite вместо Cloudflare D1.
// Запросов по сети нет — worker.fetch() вызывается напрямую, как это делает Cloudflare.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from '../worker.js';
import { ATTEMPT_LIMIT } from '../lib.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://cheesemolly.github.io';

/** Обёртка над SQLite с интерфейсом D1 (prepare → bind → first/run). */
function createEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const wrap = (stmt, args) => ({
    first: () => stmt.get(...args) ?? null,
    run: () => stmt.run(...args),
    all: () => ({ results: stmt.all(...args) }),
  });
  return {
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return { bind: (...args) => wrap(stmt, args), ...wrap(stmt, []) };
      },
    },
  };
}

async function call(env, path, { method = 'GET', payload, token } = {}) {
  const headers = { Origin: ORIGIN };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await worker.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    env,
  );
  const data = await response.json();
  return { status: response.status, data, cors: response.headers.get('Access-Control-Allow-Origin') };
}

const register = (env, name, password, state) => call(env, '/register', { method: 'POST', payload: { name, password, state } });
const login = (env, name, password) => call(env, '/login', { method: 'POST', payload: { name, password } });

test('регистрация выдаёт токен, повторное имя — отказ', async () => {
  const env = createEnv();
  const first = await register(env, 'Маша', 'секрет123');
  assert.equal(first.status, 200);
  assert.ok(first.data.token);
  assert.equal(first.data.name, 'Маша');
  assert.equal(first.cors, ORIGIN, 'свой домен разрешён');

  const again = await register(env, 'маша', 'другой-пароль');
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'name_taken', 'регистр не создаёт второго игрока с тем же именем');

  const short = await register(env, 'Петя', '123');
  assert.equal(short.data.error, 'password_short');
});

test('вход: верный пароль пускает, неверный — нет', async () => {
  const env = createEnv();
  await register(env, 'Петя', 'пароль-раз');

  const ok = await login(env, 'ПЕТЯ', 'пароль-раз');
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  assert.equal(ok.data.name, 'Петя', 'имя отдаётся так, как его записали при регистрации');

  const bad = await login(env, 'Петя', 'пароль-два');
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, 'bad_credentials');

  const nobody = await login(env, 'Вася', 'какой-нибудь');
  assert.equal(nobody.status, 401);
  assert.equal(nobody.data.error, 'bad_credentials', 'по ответу не видно, есть ли такой игрок');
});

test('после лимита неудачных попыток имя блокируется', async () => {
  const env = createEnv();
  await register(env, 'Жертва', 'правильный-пароль');
  for (let i = 0; i < ATTEMPT_LIMIT; i += 1) await login(env, 'Жертва', `перебор-${i}`);

  const blocked = await login(env, 'Жертва', 'правильный-пароль');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.error, 'too_many', 'даже верный пароль не проходит, пока идёт блокировка');
});

test('прогресс сохраняется и возвращается только владельцу', async () => {
  const env = createEnv();
  const created = (await register(env, 'Маша', 'секрет123')).data;
  const masha = created.token;
  const petya = (await register(env, 'Петя', 'секрет123')).data.token;

  const state = JSON.stringify({ 'game:words:progress': { current: 7 } });
  // base — отметка, которую клиент получил при регистрации или последнем обмене с сервером.
  const put = await call(env, '/state', { method: 'PUT', token: masha, payload: { data: state, base: created.updatedAt } });
  assert.equal(put.status, 200);

  const mine = await call(env, '/state', { token: masha });
  assert.equal(mine.data.data, state);

  const other = await call(env, '/state', { token: petya });
  assert.equal(other.data.data, '{}', 'чужой прогресс не виден');

  const anon = await call(env, '/state');
  assert.equal(anon.status, 401);
  const fake = await call(env, '/state', { token: 'ne-nastoyaschiy-token' });
  assert.equal(fake.status, 401);
});

test('гостевой прогресс переносится в аккаунт при регистрации', async () => {
  const env = createEnv();
  const guest = JSON.stringify({ 'shell:stats:2048': { played: 3, wins: 1, best: 900 } });
  const { data } = await register(env, 'Гость', 'секрет123', guest);
  const state = await call(env, '/state', { token: data.token });
  assert.equal(state.data.data, guest);
});

test('сохранение с другого устройства не затирается', async () => {
  const env = createEnv();
  const created = (await register(env, 'Маша', 'секрет123')).data;
  const token = created.token;

  // Телефон сохранил.
  const phone = await call(env, '/state', {
    method: 'PUT', token, payload: { data: '{"a":1}', base: created.updatedAt },
  });
  assert.equal(phone.status, 200);

  // Компьютер играл от старой отметки — сервер отвечает конфликтом и присылает свежие данные.
  const desktop = await call(env, '/state', {
    method: 'PUT', token, payload: { data: '{"b":2}', base: created.updatedAt },
  });
  assert.equal(desktop.status, 409);
  assert.equal(desktop.data.conflict, true);
  assert.equal(desktop.data.data, '{"a":1}');

  // Повтор с правильной отметкой проходит.
  const retry = await call(env, '/state', {
    method: 'PUT', token, payload: { data: '{"b":2}', base: desktop.data.updatedAt },
  });
  assert.equal(retry.status, 200);
  assert.equal((await call(env, '/state', { token })).data.data, '{"b":2}');
});

test('выход убивает сессию', async () => {
  const env = createEnv();
  const token = (await register(env, 'Маша', 'секрет123')).data.token;
  assert.equal((await call(env, '/me', { token })).data.name, 'Маша');

  await call(env, '/logout', { method: 'POST', token });
  assert.equal((await call(env, '/me', { token })).status, 401, 'старый токен больше не работает');
});

test('слишком большой прогресс не принимается', async () => {
  const env = createEnv();
  const token = (await register(env, 'Маша', 'секрет123')).data.token;
  const huge = JSON.stringify({ big: 'x'.repeat(500 * 1024) });
  const res = await call(env, '/state', { method: 'PUT', token, payload: { data: huge, base: 0 } });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, 'state_big');
});

test('неизвестный путь и проверка живости', async () => {
  const env = createEnv();
  assert.equal((await call(env, '/')).data.ok, true);
  assert.equal((await call(env, '/нет-такого')).status, 404);
});

test('схему можно вставить в консоль D1 одной строкой', () => {
  // Консоль Cloudflare склеивает вставленный текст в одну строку. С комментариями «--» всё после
  // первого из них стало бы комментарием, и запрос не выполнился бы (так и случилось при первой попытке).
  assert.ok(!/(^|[^-])--(?!>)/.test(SCHEMA), 'в schema.sql только блочные комментарии /* */');
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA.replace(/\s+/g, ' ').trim());
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const table of ['users', 'sessions', 'states', 'attempts']) assert.ok(tables.includes(table), table);
});
