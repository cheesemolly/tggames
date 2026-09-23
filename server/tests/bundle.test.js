// Собранный worker.bundled.js — это то, что живёт в Cloudflare. Тест следит, чтобы он не отстал
// от исходников (иначе на сервере будет старый код) и чтобы он вообще работал.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { buildBundle } from '../tools/bundle.js';
import bundled from '../worker.bundled.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

test('собранный файл совпадает с исходниками', () => {
  const onDisk = readFileSync(new URL('../worker.bundled.js', import.meta.url), 'utf8');
  assert.equal(
    onDisk.replace(/\r\n/g, '\n'),
    buildBundle(),
    'worker.js или lib.js изменились — пересобери: node server/tools/bundle.js',
  );
});

test('собранный обработчик работает: регистрация, вход, прогресс', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const wrap = (stmt, args) => ({
    first: () => stmt.get(...args) ?? null,
    run: () => stmt.run(...args),
    all: () => ({ results: stmt.all(...args) }),
  });
  const env = {
    DB: {
      prepare(sql) {
        const stmt = db.prepare(sql);
        return { bind: (...args) => wrap(stmt, args), ...wrap(stmt, []) };
      },
    },
  };

  const call = async (path, { method = 'GET', payload, token } = {}) => {
    const headers = { Origin: 'https://cheesemolly.github.io' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await bundled.fetch(new Request(`https://api.test${path}`, {
      method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
    }), env);
    return { status: res.status, data: await res.json() };
  };

  const reg = await call('/register', { method: 'POST', payload: { name: 'Игрок', password: 'секрет123' } });
  assert.equal(reg.status, 200);

  const state = JSON.stringify({ 'shell:stats:2048': { played: 1 } });
  const put = await call('/state', { method: 'PUT', token: reg.data.token, payload: { data: state, base: reg.data.updatedAt } });
  assert.equal(put.status, 200);

  const back = await call('/state', { token: reg.data.token });
  assert.equal(back.data.data, state);

  const login = await call('/login', { method: 'POST', payload: { name: 'игрок', password: 'секрет123' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.name, 'Игрок');
});
