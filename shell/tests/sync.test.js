import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmpty, pickOnLogin } from '../sync.js';
import { message, ERRORS } from '../../platform/errors.js';

test('пустой прогресс', () => {
  assert.equal(isEmpty(null), true);
  assert.equal(isEmpty({}), true);
  assert.equal(isEmpty({ 'shell:stats:2048': { played: 1 } }), false);
});

test('вход: серверный прогресс побеждает, кроме случая «на сервере пусто»', () => {
  const local = { 'game:words:progress': { current: 5 } };
  const server = { 'game:words:progress': { current: 40 } };

  // Играл в браузере до Telegram, на сервере пусто — локальное уезжает в аккаунт.
  assert.equal(pickOnLogin({}, local), 'local');

  // На сервере уже есть прогресс — он и берётся, иначе игра на другом устройстве была бы затёрта.
  assert.equal(pickOnLogin(server, local), 'server');
  assert.equal(pickOnLogin(server, {}), 'server');
  assert.equal(pickOnLogin({}, {}), 'server');
});

test('ошибки сервера показываются по-русски', () => {
  assert.equal(message('banned'), ERRORS.banned);
  assert.equal(message('bad_signature'), ERRORS.bad_signature);
  assert.equal(message('что-то новое'), ERRORS.server, 'незнакомый код — общее сообщение');
  for (const text of Object.values(ERRORS)) assert.ok(text.length > 0);
});
