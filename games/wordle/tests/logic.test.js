// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TRIES, score, keyStatuses, checkGuess, getStatus, newBoard, getScore, isValidBoard,
  emptyStats, recordGame, isValidStats, shareText,
} from '../logic.js';
import { toLetter, defaultLang, LANGUAGES, LANG_ORDER } from '../languages.js';
import { TEXT } from '../i18n.js';

const C = 'correct';
const P = 'present';
const A = 'absent';

test('score: простые случаи', () => {
  assert.deepEqual(score('crane', 'crane'), [C, C, C, C, C]);
  assert.deepEqual(score('ghost', 'crane'), [A, A, A, A, A]);
  assert.deepEqual(score('nacre', 'crane'), [P, P, P, P, C]);
});

test('score: повторы букв — «есть» не больше, чем таких букв осталось', () => {
  // лишняя «e» серая: одна «e» в слове уже засчитана зелёной
  assert.deepEqual(score('eerie', 'crane'), [A, A, P, A, C]);
  // две «b» в слове: одна зелёная, вторая — жёлтая
  assert.deepEqual(score('kebab', 'abbey'), [A, P, C, P, P]);
  // «e» в слове две: одна зелёная, одна жёлтая, третья серая
  assert.deepEqual(score('geese', 'speed'), [A, P, C, P, A]);
  // зелёные засчитываются раньше жёлтых, даже если стоят правее: обе «l» слова ушли на зелёные,
  // поэтому первая «l» догадки — серая, а не жёлтая
  assert.deepEqual(score('lolly', 'hello'), [A, P, C, C, A]);
});

test('score: кириллица и апостроф', () => {
  assert.deepEqual(score("б'ючи", "б'ючи"), [C, C, C, C, C]);
  assert.deepEqual(score('книга', 'кинга'), [C, P, P, C, C]);
});

test('keyStatuses: лучший статус буквы', () => {
  const st = keyStatuses('crane', ['nacre', 'crane']);
  assert.equal(st.get('c'), C);
  assert.equal(st.get('n'), C);
  const st2 = keyStatuses('crane', ['eerie']);
  assert.equal(st2.get('e'), C);           // серая «e» не перебивает зелёную
  assert.equal(st2.get('i'), A);
});

test('checkGuess: ошибки не тратят попытку', () => {
  const board = { secret: 'crane', guesses: ['ghost'] };
  const allowed = new Set(['crane', 'ghost', 'nacre']);
  assert.equal(checkGuess(board, 'cra', allowed), 'short');
  assert.equal(checkGuess(board, 'ghost', allowed), 'repeat');
  assert.equal(checkGuess(board, 'zzzzz', allowed), 'unknown');
  assert.equal(checkGuess(board, 'nacre', allowed), null);
});

test('getStatus и getScore', () => {
  assert.equal(getStatus({ secret: 'crane', guesses: [] }), 'playing');
  assert.equal(getStatus({ secret: 'crane', guesses: ['crane'] }), 'won');
  const six = ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'];
  assert.equal(getStatus({ secret: 'crane', guesses: six }), 'lost');
  assert.equal(getStatus({ secret: 'crane', guesses: [...six.slice(0, 5), 'crane'] }), 'won');
  assert.equal(getScore({ secret: 'crane', guesses: ['crane'] }), 60);
  assert.equal(getScore({ secret: 'crane', guesses: [...six.slice(0, MAX_TRIES - 1), 'crane'] }), 10);
});

test('newBoard берёт слово из загадок', () => {
  const answers = ['aaaaa', 'bbbbb', 'ccccc'];
  assert.equal(newBoard(answers, () => 0).secret, 'aaaaa');
  assert.equal(newBoard(answers, () => 0.9999).secret, 'ccccc');
});

test('isValidBoard', () => {
  assert.ok(isValidBoard({ secret: 'crane', guesses: ['ghost'] }));
  assert.ok(isValidBoard({ secret: "б'ючи", guesses: [] }));
  for (const bad of [null, {}, { secret: 'cran', guesses: [] }, { secret: 'crane' },
    { secret: 'crane', guesses: ['ab'] }, { secret: 'crane', guesses: Array(7).fill('ghost') }]) {
    assert.equal(isValidBoard(bad), false, JSON.stringify(bad));
  }
});

test('toLetter: нормализация и чужие буквы', () => {
  assert.equal(toLetter('en', 'A'), 'a');
  assert.equal(toLetter('en', 'ф'), null);
  assert.equal(toLetter('en', 'Enter'), null);
  assert.equal(toLetter('ru', 'Ё'), 'е');
  assert.equal(toLetter('ru', 'і'), null);
  assert.equal(toLetter('ua', '’'), "'");
  assert.equal(toLetter('ua', 'ы'), null);
  assert.equal(toLetter('ua', 'Ї'), 'ї');
  assert.equal(toLetter(null, 'a'), null);
});

test('recordGame: серии и распределение', () => {
  const win = (tries) => ({ secret: 'crane', guesses: [...Array(tries - 1).fill('ghost'), 'crane'] });
  const loss = { secret: 'crane', guesses: Array(MAX_TRIES).fill('ghost') };

  let s = emptyStats();
  s = recordGame(s, win(3));
  s = recordGame(s, win(1));
  assert.deepEqual(s, { played: 2, wins: 2, streak: 2, maxStreak: 2, dist: [1, 0, 1, 0, 0, 0] });
  s = recordGame(s, loss);
  assert.equal(s.streak, 0);
  assert.equal(s.maxStreak, 2);                 // лучшая серия не сбрасывается
  assert.equal(s.played, 3);
  s = recordGame(s, win(6));
  assert.deepEqual(s.dist, [1, 0, 1, 0, 0, 1]);
  assert.equal(s.streak, 1);

  const before = emptyStats();
  recordGame(before, win(2));
  assert.deepEqual(before, emptyStats(), 'recordGame не должен менять исходный объект');
});

test('shareText: «N/6», пустая строка, квадраты без букв', () => {
  const B = '⬛️';
  assert.equal(
    shareText({ secret: 'crane', guesses: ['eerie', 'nacre', 'crane'] }),
    `3/6\n\n${B}${B}🟨${B}🟩\n🟨🟨🟨🟨🟩\n🟩🟩🟩🟩🟩`,
  );
  const lost = shareText({ secret: 'crane', guesses: Array(MAX_TRIES).fill('ghost') });
  assert.ok(lost.startsWith('X/6\n\n'));
  assert.equal(lost.split('\n').length, 2 + MAX_TRIES);
  assert.doesNotMatch(lost, /[a-z]/, 'в тексте не должно быть букв слова');
});

test('isValidStats', () => {
  assert.ok(isValidStats(emptyStats()));
  assert.equal(isValidStats(null), false);
  assert.equal(isValidStats({ ...emptyStats(), dist: [0, 0] }), false);
  assert.equal(isValidStats({ ...emptyStats(), played: -1 }), false);
});

// Все строки i18n — плоский список, включая результаты функций.
function allStrings(node) {
  if (typeof node === 'string') return [node];
  if (typeof node === 'function') return [node('WORD', 2, 6, 3)];
  return Object.values(node).flatMap(allStrings);
}

test('i18n: у всех языков одинаковый набор строк', () => {
  const shape = (node) => (typeof node === 'object'
    ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shape(v)]))
    : typeof node);
  for (const id of LANG_ORDER) assert.deepEqual(shape(TEXT[id]), shape(TEXT.en), id);
});

test('i18n: в тексте языка нет букв чужого языка', () => {
  const en = allStrings(TEXT.en).join(' ');
  const ua = allStrings(TEXT.ua).join(' ');
  const ru = allStrings(TEXT.ru).join(' ');
  assert.doesNotMatch(en, /[а-яёіїєґ]/i, 'кириллица в английском');
  assert.doesNotMatch(ua, /[ыэъё]/i, 'русские буквы в украинском');
  assert.doesNotMatch(ru, /[іїєґ]/i, 'украинские буквы в русском');
  assert.deepEqual(LANG_ORDER.map((id) => LANGUAGES[id].locale), ['en', 'uk', 'ru']);
});

test('defaultLang по языку Telegram', () => {
  assert.equal(defaultLang('uk'), 'ua');
  assert.equal(defaultLang('ru'), 'ru');
  assert.equal(defaultLang('en'), 'en');
  assert.equal(defaultLang(undefined), 'en');
});
