// Правила партии. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, placeDigit, toggleNote, erase, undo, applyHintDigit, isSolved, isLost, isLocked,
  digitCounts, conflicts, firstMistake, isValidState, CELL_POINTS, MAX_MISTAKES,
  emptyStats, recordGame, isValidStats, normalizeSettings, defaultSettings, SKINS,
} from '../logic.js';
import { parseGrid, bit, PEERS } from '../grid.js';

const PUZZLE = parseGrid('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
const SOLUTION = parseGrid('534678912672195348198342567859761423426853791713924856961537284287419635345286179');
const fresh = () => newGame('medium', PUZZLE, SOLUTION);
const EMPTY = 2;                           // клетка (1,3): решение 4

test('верная цифра: очки, закрепление, заметки соседей убираются', () => {
  const s = fresh();
  const peer = PEERS[EMPTY].find((p) => !s.values[p]);
  toggleNote(s, peer, 4);
  toggleNote(s, peer, 7);
  assert.equal(placeDigit(s, EMPTY, 4), 'correct');
  assert.equal(s.score, CELL_POINTS.medium);
  assert.ok(isLocked(s, EMPTY));
  assert.equal(s.notes[peer], bit(7), 'заметка 4 у соседа должна исчезнуть, 7 — остаться');
  assert.equal(placeDigit(s, EMPTY, 9), 'ignored', 'верную цифру нельзя заменить');
  assert.equal(erase(s, EMPTY), false, 'верную цифру нельзя стереть');
});

test('неверная цифра: ошибка, остаётся на доске, стирается; 3 ошибки — поражение', () => {
  const s = fresh();
  assert.equal(placeDigit(s, EMPTY, 9), 'wrong');
  assert.equal(s.mistakes, 1);
  assert.equal(s.values[EMPTY], 9);
  assert.equal(firstMistake(s), EMPTY);
  assert.equal(s.score, 0);
  assert.ok(erase(s, EMPTY));
  assert.equal(s.values[EMPTY], 0);
  placeDigit(s, EMPTY, 8);
  placeDigit(s, EMPTY, 7);
  assert.equal(s.mistakes, MAX_MISTAKES);
  assert.ok(isLost(s));
});

test('без лимита ошибок партия не проигрывается, ошибки всё равно считаются', () => {
  const s = fresh();
  for (const d of [9, 8, 7, 6, 5]) placeDigit(s, EMPTY, d);
  assert.equal(s.mistakes, 5);
  assert.equal(isLost(s, false), false);
  assert.equal(isLost(s, true), true);
});

test('настройки: значения по умолчанию и отбраковка мусора', () => {
  assert.deepEqual(normalizeSettings(null), { mistakesLimit: true, skin: 'telegram', autofill: 'off' });
  assert.deepEqual(normalizeSettings({ mistakesLimit: false, skin: 'claude', autofill: 'end' }), { mistakesLimit: false, skin: 'claude', autofill: 'end' });
  assert.deepEqual(normalizeSettings({ mistakesLimit: 'no', skin: 'pink' }), defaultSettings());
  assert.equal(SKINS[0], 'telegram');
});

test('данные цифры не меняются', () => {
  const s = fresh();
  assert.equal(placeDigit(s, 0, 1), 'ignored');
  assert.equal(erase(s, 0), false);
  assert.equal(toggleNote(s, 0, 1), false);
});

test('отмена восстанавливает клетку и заметки соседей, но не ошибки и не очки', () => {
  const s = fresh();
  const peer = PEERS[EMPTY].find((p) => !s.values[p]);
  toggleNote(s, peer, 4);
  placeDigit(s, EMPTY, 4);
  assert.equal(undo(s), EMPTY);
  assert.equal(s.values[EMPTY], 0);
  assert.equal(s.notes[peer], bit(4), 'заметка соседа вернулась');
  assert.equal(s.score, CELL_POINTS.medium, 'очки не откатываются');
  placeDigit(s, EMPTY, 4);
  assert.equal(s.score, CELL_POINTS.medium, 'повторно за ту же клетку очков нет');

  const t = fresh();
  placeDigit(t, EMPTY, 9);
  undo(t);
  assert.equal(t.mistakes, 1, 'ошибка не откатывается');
  assert.equal(undo(fresh()), -1);
});

test('заметки: только в пустой клетке, переключаются', () => {
  const s = fresh();
  assert.ok(toggleNote(s, EMPTY, 3));
  assert.ok(toggleNote(s, EMPTY, 5));
  assert.equal(s.notes[EMPTY], bit(3) | bit(5));
  toggleNote(s, EMPTY, 3);
  assert.equal(s.notes[EMPTY], bit(5));
  placeDigit(s, EMPTY, 9);                 // неверная цифра — заметки клетки очищаются
  assert.equal(s.notes[EMPTY], 0);
  assert.equal(toggleNote(s, EMPTY, 1), false, 'в клетке с цифрой заметки не ставятся');
});

test('подсказка ставит цифру без очков и сбрасывает отмену', () => {
  const s = fresh();
  toggleNote(s, EMPTY, 1);
  applyHintDigit(s, EMPTY, 4);
  assert.equal(s.values[EMPTY], 4);
  assert.equal(s.score, 0);
  assert.equal(s.undo.length, 0);
  placeDigit(s, EMPTY, 4);
  assert.equal(s.score, 0);
});

test('решено, счётчики цифр, конфликты', () => {
  const s = fresh();
  SOLUTION.forEach((d, i) => { if (!s.values[i]) placeDigit(s, i, d); });
  assert.ok(isSolved(s));
  assert.ok(digitCounts(s).slice(1).every((n) => n === 9));
  assert.equal(conflicts(s).size, 0);

  const t = fresh();
  placeDigit(t, EMPTY, 5);                 // 5 уже есть в первой строке
  assert.ok(conflicts(t).has(EMPTY));
  assert.ok(conflicts(t).has(0));
});

test('isValidState: своё сохранение валидно, битое — нет', () => {
  const s = fresh();
  placeDigit(s, EMPTY, 4);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState(null), false);
  assert.equal(isValidState({ ...s, difficulty: 'nightmare' }), false);
  assert.equal(isValidState({ ...s, values: s.values.slice(1) }), false);
  const tampered = JSON.parse(JSON.stringify(s));
  tampered.values[0] = 1;                  // данную цифру подменили
  assert.equal(isValidState(tampered), false);
});

test('статистика: серии и время', () => {
  let st = emptyStats();
  st = recordGame(st, true, 300000);
  st = recordGame(st, true, 200000);
  assert.deepEqual(st, { played: 2, wins: 2, streak: 2, maxStreak: 2, bestMs: 200000, totalWinMs: 500000 });
  st = recordGame(st, false, 100000);
  assert.equal(st.streak, 0);
  assert.equal(st.bestMs, 200000);
  assert.ok(isValidStats(st));
  assert.equal(isValidStats({ ...st, bestMs: -1 }), false);
});
