// Запуск: npm test  (или node --test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN, MAX, MAX_ATTEMPTS,
  createGame, parseGuess, makeGuess, compare, getStatus, knownRange, getScore, isValidState,
} from '../logic.js';

test('createGame покрывает весь диапазон и не выходит за него', () => {
  assert.equal(createGame(() => 0).secret, MIN);
  assert.equal(createGame(() => 0.999999).secret, MAX);
  for (let i = 0; i < 10000; i++) {
    const { secret } = createGame();
    assert.ok(Number.isInteger(secret) && secret >= MIN && secret <= MAX, `secret=${secret}`);
  }
});

test('parseGuess: плохой ввод — ошибка, а не попытка', () => {
  const state = { secret: 50, guesses: [30] };
  for (const bad of ['', '  ', 'abc', '1.5', '-3', '0', '101', '1e2', '30']) {
    assert.ok(parseGuess(state, bad).error, `ввод "${bad}" должен быть ошибкой`);
  }
  assert.deepEqual(parseGuess(state, ' 42 '), { value: 42 });
  assert.deepEqual(parseGuess(state, '007'), { value: 7 });
});

test('compare и getStatus', () => {
  assert.equal(compare(50, 10), 'higher');
  assert.equal(compare(50, 90), 'lower');
  assert.equal(compare(50, 50), 'correct');

  let state = { secret: 50, guesses: [] };
  assert.equal(getStatus(state), 'playing');
  state = makeGuess(state, 50);
  assert.equal(getStatus(state), 'won');

  state = { secret: 50, guesses: [1, 2, 3, 4, 5, 6, 7] };
  assert.equal(getStatus(state), 'lost');
  // Угадал последней попыткой — победа, а не поражение.
  state = { secret: 50, guesses: [1, 2, 3, 4, 5, 6, 50] };
  assert.equal(getStatus(state), 'won');
});

test('knownRange сужается по подсказкам и всегда содержит загаданное', () => {
  const state = { secret: 42, guesses: [50, 25, 40, 45] };
  assert.deepEqual(knownRange(state), { low: 41, high: 44 });
});

test('двоичный поиск угадывает любое число за MAX_ATTEMPTS — лимит попыток честный', () => {
  for (let secret = MIN; secret <= MAX; secret++) {
    let state = { secret, guesses: [] };
    while (getStatus(state) === 'playing') {
      const { low, high } = knownRange(state);
      assert.ok(low <= secret && secret <= high, `диапазон потерял число ${secret}`);
      state = makeGuess(state, Math.floor((low + high) / 2));
    }
    assert.equal(getStatus(state), 'won', `число ${secret} не угадано за ${MAX_ATTEMPTS}`);
  }
});

test('getScore: больше очков за меньшее число попыток', () => {
  assert.equal(getScore({ secret: 5, guesses: [5] }), 70);
  assert.equal(getScore({ secret: 5, guesses: [1, 2, 3, 4, 6, 7, 5] }), 10);
});

test('isValidState отбраковывает битые сохранения', () => {
  assert.ok(isValidState({ secret: 10, guesses: [5, 20] }));
  for (const bad of [
    null, {}, { secret: 0, guesses: [] }, { secret: 10 }, { secret: 10, guesses: [5, 5] },
    { secret: 10, guesses: ['5'] }, { secret: 10, guesses: [1, 2, 3, 4, 5, 6, 7, 8] },
  ]) {
    assert.equal(isValidState(bad), false, JSON.stringify(bad));
  }
});
