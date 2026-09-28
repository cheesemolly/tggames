// Вход при запуске (shell/login.js): имя сразу после входа, повторы без связи, вход посреди партии её не трогает.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogin, RETRY_DELAYS } from '../login.js';

function setup({ answers, game = false }) {
  const log = [];
  const timers = [];
  const listeners = new Set();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
  };
  const account = {
    offline: false,
    current: null,
    async signIn() {
      log.push('signIn');
      const res = answers.shift() ?? { ok: false, error: 'network' };
      account.current = res.ok ? { id: 1 } : null;
      return res;
    },
  };
  const state = { game };
  const login = createLogin({
    account,
    sync: { pull: async () => { log.push('pull'); } },
    inGame: () => state.game,
    redraw: () => log.push(account.current ? 'redraw:name' : account.offline ? 'redraw:offline' : 'redraw'),
    onError: (res) => log.push(`error:${res.error}`),
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    cancel: () => {},
    doc,
  });
  const fire = async () => timers.shift().fn();
  const wake = async () => Promise.all([...listeners].map((fn) => fn()));
  return { login, log, timers, account, state, fire, wake, listeners };
}

test('вход удался — имя в меню сразу, ещё до загрузки прогресса, и после неё', async () => {
  const t = setup({ answers: [{ ok: true }] });
  await t.login.start();
  assert.deepEqual(t.log, ['signIn', 'redraw:name', 'pull', 'redraw:name']);
  assert.equal(t.account.offline, false);
  assert.equal(t.timers.length, 0);
  assert.equal(t.listeners.size, 0, 'после входа за возвращением в приложение больше не следим');
});

test('нет связи — строка «Нет связи», повторы по расписанию, потом вход', async () => {
  const t = setup({ answers: [{ ok: false, error: 'network' }, { ok: false, error: 'network', timeout: true }, { ok: true }] });
  await t.login.start();
  assert.equal(t.account.offline, true);
  assert.deepEqual(t.log, ['signIn', 'redraw:offline']);
  assert.equal(t.timers[0].ms, RETRY_DELAYS[0]);
  await t.fire();
  assert.deepEqual(t.log.slice(2), ['signIn'], 'вторая неудача меню не перерисовывает');
  assert.equal(t.timers[0].ms, RETRY_DELAYS[1]);
  await t.fire();
  assert.deepEqual(t.log.slice(3), ['signIn', 'redraw:name', 'pull', 'redraw:name']);
  assert.equal(t.account.offline, false);
});

test('ошибка сервера (500) — тоже повтор; расписание кончается', async () => {
  const t = setup({ answers: Array(RETRY_DELAYS.length + 1).fill({ ok: false, error: 'server', status: 500 }) });
  await t.login.start();
  for (let k = 0; k < RETRY_DELAYS.length; k++) await t.fire();
  assert.equal(t.timers.length, 0, 'после последнего повтора — ждём возвращения в приложение или кнопки');
  assert.equal(t.log.filter((x) => x === 'signIn').length, RETRY_DELAYS.length + 1);
});

test('подпись не принята или бан — повторять бесполезно, показываем ошибку', async () => {
  const t = setup({ answers: [{ ok: false, error: 'expired', status: 401 }] });
  await t.login.start();
  assert.deepEqual(t.log, ['signIn', 'error:expired']);
  assert.equal(t.timers.length, 0);
  assert.equal(t.account.offline, false);
});

test('«Повторить» и возвращение в приложение — новая попытка; одновременные — одна', async () => {
  const t = setup({ answers: [{ ok: false, error: 'network' }, { ok: false, error: 'network' }, { ok: true }] });
  await t.login.start();
  await t.wake();
  assert.equal(t.log.filter((x) => x === 'signIn').length, 2, 'вернулся в приложение — попытка');
  await Promise.all([t.login.retry(), t.login.retry()]);
  assert.equal(t.log.filter((x) => x === 'signIn').length, 3, 'две кнопки подряд — один запрос');
  assert.equal(t.account.current?.id, 1);
  await t.login.retry();
  assert.equal(t.log.filter((x) => x === 'signIn').length, 3, 'после входа — ничего');
});

test('вошли посреди партии — игру не перерисовываем, прогресс подтягиваем после выхода', async () => {
  const t = setup({ answers: [{ ok: false, error: 'network' }, { ok: true }], game: true });
  await t.login.start();
  assert.deepEqual(t.log, ['signIn'], 'строка «нет связи» в игре не рисуется');
  await t.fire();
  assert.deepEqual(t.log, ['signIn', 'signIn'], 'вход есть, игра не тронута');
  assert.equal(t.login.leftGame() === null, false);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(t.log.slice(2), ['redraw:name', 'pull', 'redraw:name']);
  assert.equal(t.login.leftGame(), null, 'второй раз — ничего');
});
