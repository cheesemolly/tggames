import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkInitData, diagnoseInitData, dataCheckString, validateState, parseAdminIds, isAdmin, displayName,
  timingSafeEqual, MAX_STATE_BYTES, INIT_DATA_MAX_AGE_MS,
} from '../lib.js';
import { makeInitData, TOKEN, USER } from './helpers.js';

test('подпись Telegram: своя проходит, чужая — нет', async () => {
  const initData = await makeInitData(TOKEN, USER);
  const good = await checkInitData(initData, TOKEN);
  assert.equal(good.ok, true);
  assert.equal(good.user.id, USER.id);
  assert.equal(good.user.first_name, USER.first_name);

  const otherToken = await checkInitData(initData, '999:another-token');
  assert.equal(otherToken.ok, false);
  assert.equal(otherToken.error, 'bad_signature', 'подпись сделана ключом от токена бота');
});

test('подменить данные в initData нельзя', async () => {
  const initData = await makeInitData(TOKEN, USER);
  // пытаемся стать другим игроком, не трогая hash
  const tampered = initData.replace(encodeURIComponent(String(USER.id)), encodeURIComponent('777'));
  assert.notEqual(tampered, initData);
  const res = await checkInitData(tampered, TOKEN);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'bad_signature');
});

test('старая подпись не принимается', async () => {
  const old = Date.now() - INIT_DATA_MAX_AGE_MS - 1000;
  const initData = await makeInitData(TOKEN, USER, { authDate: old });
  assert.equal((await checkInitData(initData, TOKEN)).error, 'expired');
  // но в пределах срока — годится
  const fresh = await makeInitData(TOKEN, USER, { authDate: Date.now() - 60_000 });
  assert.equal((await checkInitData(fresh, TOKEN)).ok, true);
});

test('пустые и битые данные', async () => {
  assert.equal((await checkInitData('', TOKEN)).error, 'no_init_data');
  assert.equal((await checkInitData(null, TOKEN)).error, 'no_init_data');
  assert.equal((await checkInitData('user=x&hash=y', '')).error, 'no_bot_token');
  assert.equal((await checkInitData('нет-подписи', TOKEN)).error, 'bad_init_data');
  const noUser = await makeInitData(TOKEN, null);
  assert.equal((await checkInitData(noUser, TOKEN)).error, 'bad_user');
});

test('подписываемая строка: без hash, по алфавиту', () => {
  const params = new URLSearchParams('hash=zzz&user=%7B%7D&auth_date=5&query_id=q&signature=s');
  assert.equal(dataCheckString(params), 'auth_date=5\nquery_id=q\nuser={}');
});

test('сравнение за постоянное время', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
});

test('админы — из переменной окружения, а не из кода', () => {
  assert.deepEqual(parseAdminIds('111, 222 333'), [111, 222, 333]);
  assert.deepEqual(parseAdminIds(''), []);
  assert.deepEqual(parseAdminIds(undefined), []);
  assert.equal(isAdmin(111, [111, 222]), true);
  assert.equal(isAdmin('111', [111]), true, 'id может прийти строкой');
  assert.equal(isAdmin(333, [111, 222]), false);
});

test('прогресс: что сервер принимает', () => {
  assert.equal(validateState('{"shell:stats:2048":{"played":3}}'), null);
  assert.equal(validateState('{}'), null);
  assert.equal(validateState({ notAString: true }), 'state_type');
  assert.equal(validateState('не json'), 'state_json');
  assert.equal(validateState('[1,2,3]'), 'state_shape');
  assert.equal(validateState(`{"k":"${'x'.repeat(MAX_STATE_BYTES)}"}`), 'state_big');
});

test('имя игрока для списков', () => {
  assert.equal(displayName({ first_name: 'Маша', username: 'masha' }), 'Маша (@masha)');
  assert.equal(displayName({ first_name: 'Маша', last_name: 'Иванова' }), 'Маша Иванова');
  assert.equal(displayName({}), 'Без имени');
});

test('диагностика подписи говорит, какой способ подсчёта подходит', async () => {
  const initData = await makeInitData(TOKEN, USER);
  const good = await diagnoseInitData(initData, TOKEN);
  assert.equal(good.ok, true);
  assert.equal(good.matches.decoded, true, 'наш способ — значения после декодирования');
  assert.equal(good.matches.raw, false);
  assert.ok(good.fields.includes('user') && good.fields.includes('hash'));
  assert.ok(good.ageSec >= 0);

  const alien = await diagnoseInitData(initData, '999:another-token');
  assert.equal(alien.ok, false, 'чужой токен — не подходит ни один способ');
  assert.equal(Object.values(alien.matches).some(Boolean), false);
  assert.doesNotMatch(JSON.stringify(alien), /Маша/, 'данные игрока наружу не отдаются');
});
