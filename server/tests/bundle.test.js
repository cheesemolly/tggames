// Собранный worker.bundled.js — это то, что живёт в Cloudflare. Тест следит, чтобы он не отстал
// от исходников (иначе на сервере будет старый код) и чтобы он вообще работал.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildBundle } from '../tools/bundle.js';
import bundled from '../worker.bundled.js';
import { createEnv, makeInitData, TOKEN, USER } from './helpers.js';

test('собранный файл совпадает с исходниками', () => {
  const onDisk = readFileSync(new URL('../worker.bundled.js', import.meta.url), 'utf8');
  assert.equal(
    onDisk.replace(/\r\n/g, '\n'),
    buildBundle(),
    'worker.js или lib.js изменились — пересобери: node server/tools/bundle.js',
  );
});

test('собранный обработчик работает: вход по подписи Telegram и прогресс', async () => {
  const env = createEnv();
  const initData = await makeInitData(TOKEN, USER);

  const call = async (path, { method = 'GET', payload } = {}) => {
    const headers = { Origin: 'https://cheesemolly.github.io', Authorization: `tma ${initData}` };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const res = await bundled.fetch(new Request(`https://api.test${path}`, {
      method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
    }), env);
    return { status: res.status, data: await res.json() };
  };

  const me = await call('/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.tgId, USER.id);

  const state = JSON.stringify({ 'shell:progress:loop': 'Уровень 3' });
  assert.equal((await call('/state', { method: 'PUT', payload: { data: state, base: 0 } })).status, 200);
  assert.equal((await call('/state')).data.data, state);
});
