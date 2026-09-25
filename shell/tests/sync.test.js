import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmpty, pickOnLogin, pickOnOpen } from '../sync.js';
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

test('открытие: неотправленное локальное не затирается старой серверной копией', () => {
  const local = { 'shell:stats:checkers': { played: 5, wins: 0, best: null } };
  const server = { 'shell:stats:checkers': { played: 0, wins: 0, best: null } };

  // Закрыли мини-апп сразу после партии — отправка не дошла, сервер с прошлого обмена не менялся.
  assert.equal(pickOnOpen({ serverData: server, serverUpdatedAt: 100, localData: local, base: 100, localDirty: true }), 'local');
  // Всё отправлено — берём серверное (оно то же самое).
  assert.equal(pickOnOpen({ serverData: server, serverUpdatedAt: 100, localData: local, base: 100, localDirty: false }), 'server');
  // Пока нас не было, сохраняли с другого устройства — как и раньше, побеждает сервер.
  assert.equal(pickOnOpen({ serverData: server, serverUpdatedAt: 200, localData: local, base: 100, localDirty: true }), 'server');
  // Устройство ещё ни разу не обменивалось с сервером — серверный прогресс важнее.
  assert.equal(pickOnOpen({ serverData: server, serverUpdatedAt: 100, localData: local, base: 0, localDirty: true }), 'server');
  // Пустое локальное не отправляем даже с отметкой.
  assert.equal(pickOnOpen({ serverData: server, serverUpdatedAt: 100, localData: {}, base: 100, localDirty: true }), 'server');
  // Правило входа сохраняется: на сервере пусто — локальное уезжает в аккаунт.
  assert.equal(pickOnOpen({ serverData: {}, serverUpdatedAt: 0, localData: local, base: 0, afterLogin: true }), 'local');
});

test('ошибки сервера показываются по-русски', () => {
  assert.equal(message('banned'), ERRORS.banned);
  assert.equal(message('bad_signature'), ERRORS.bad_signature);
  assert.equal(message('что-то новое'), ERRORS.server, 'незнакомый код — общее сообщение');
  for (const text of Object.values(ERRORS)) assert.ok(text.length > 0);
});
