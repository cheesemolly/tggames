import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateName, validatePassword, validateState, normalizeName,
  hashPassword, verifyPassword, timingSafeEqual, randomToken, sha256hex,
  isLockedOut, nextAttempt, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS, MAX_STATE_BYTES,
} from '../lib.js';

test('имя игрока: что принимаем и что нет', () => {
  assert.equal(validateName('Маша'), null);
  assert.equal(validateName('player_1'), null);
  assert.equal(validateName('a-b-c'), null);
  assert.equal(validateName('  Маша  '), null, 'пробелы по краям срезаются');

  assert.equal(validateName(''), 'name_empty');
  assert.equal(validateName('   '), 'name_empty');
  assert.equal(validateName('ab'), 'name_bad', 'меньше трёх символов');
  assert.equal(validateName('x'.repeat(21)), 'name_bad', 'больше двадцати');
  assert.equal(validateName('маша!'), 'name_bad', 'знаки препинания');
  assert.equal(validateName('ма ша'), 'name_bad', 'пробел внутри');
  assert.equal(validateName('<script>'), 'name_bad');
});

test('имена сравниваются без регистра и ё/е', () => {
  assert.equal(normalizeName('Маша'), normalizeName('маша'));
  assert.equal(normalizeName('Алёна'), normalizeName('Алена'));
  assert.notEqual(normalizeName('Маша'), normalizeName('Даша'));
});

test('пароль: длина', () => {
  assert.equal(validatePassword('123456'), null);
  assert.equal(validatePassword('12345'), 'password_short');
  assert.equal(validatePassword(''), 'password_short');
  assert.equal(validatePassword('x'.repeat(201)), 'password_long');
});

test('пароль проверяется по хэшу, а не хранится', async () => {
  const { salt, hash } = await hashPassword('верный-пароль');
  assert.ok(!hash.includes('верный'), 'в хэше нет самого пароля');
  assert.equal(await verifyPassword('верный-пароль', salt, hash), true);
  assert.equal(await verifyPassword('другой-пароль', salt, hash), false);
  assert.equal(await verifyPassword('верный-пароль', salt, ''), false);
  assert.equal(await verifyPassword('верный-пароль', '', hash), false);
});

test('у одинаковых паролей разные соли и разные хэши', async () => {
  const a = await hashPassword('одинаковый');
  const b = await hashPassword('одинаковый');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash, 'по базе нельзя понять, что пароли совпадают');
  assert.equal(await verifyPassword('одинаковый', b.salt, b.hash), true);
});

test('сравнение за постоянное время', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('', ''), true);
});

test('токены сессий — случайные и разные', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
  assert.equal(tokens.size, 200);
  for (const t of tokens) assert.match(t, /^[A-Za-z0-9_-]{40,}$/);
});

test('в базе лежит хэш токена, а не токен', async () => {
  const token = randomToken();
  const hash = await sha256hex(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(await sha256hex(token), hash, 'хэш повторяем — по нему находится сессия');
  assert.equal(await sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('прогресс: что сервер принимает', () => {
  assert.equal(validateState('{"shell:stats:2048":{"played":3}}'), null);
  assert.equal(validateState('{}'), null);

  assert.equal(validateState({ notAString: true }), 'state_type');
  assert.equal(validateState('не json'), 'state_json');
  assert.equal(validateState('[1,2,3]'), 'state_shape', 'ожидаем объект ключ-значение');
  assert.equal(validateState('null'), 'state_shape');
  assert.equal(validateState(`{"k":"${'x'.repeat(MAX_STATE_BYTES)}"}`), 'state_big');
});

test('перебор пароля блокируется после лимита попыток', () => {
  const now = 1_000_000;
  let row = null;
  assert.equal(isLockedOut(row, now), false, 'первая попытка всегда проходит');

  for (let i = 0; i < ATTEMPT_LIMIT; i += 1) row = nextAttempt(row, now);
  assert.equal(row.count, ATTEMPT_LIMIT);
  assert.equal(isLockedOut(row, now), true);

  // окно прошло — счёт начинается заново
  const later = now + ATTEMPT_WINDOW_MS + 1;
  assert.equal(isLockedOut(row, later), false);
  assert.deepEqual(nextAttempt(row, later), { count: 1, reset_at: later + ATTEMPT_WINDOW_MS });
});
