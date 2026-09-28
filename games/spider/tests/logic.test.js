// Паук: раздача, ходы, сбор масти, раздача из колоды, отмена, подсказки, сохранение, статистика.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPADES, HEARTS, DIAMONDS, CLUBS, UP, COLUMNS, card, suitOf, rankOf, isUp, face, deck, newGame, seeded,
  canPick, runStart, canDrop, move, deal, canDeal, undo, isWon, hintMoves, hint, bestTarget, isValidState, allMoves,
  emptyStats, isValidStats, recordGame, dealsLeft,
} from '../logic.js';

const up = (suit, rank) => card(suit, rank, true);
const down = (suit, rank) => card(suit, rank, false);
/** Партия из готовых столбцов (для отдельных правил). */
const table = (cols, { stock = [], done = [], suits = 4 } = {}) => ({
  v: 1, suits, seed: 1, cols: [...cols, ...Array(COLUMNS - cols.length).fill(null).map(() => [])].map((c) => [...c]),
  stock, done, moves: 0, undo: [], hintsUsed: 0, undos: 0,
});
const total = (s) => s.cols.flat().length + s.stock.length + s.done.length * 13;

test('раздача: 6-6-6-6-5-5-5-5-5-5, открыты только верхние, в колоде 50 — 5 раздач', () => {
  for (const suits of [1, 2, 4]) {
    const s = newGame(suits, 42);
    assert.deepEqual(s.cols.map((c) => c.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    assert.equal(s.stock.length, 50);
    assert.equal(dealsLeft(s), 5);
    for (const col of s.cols) col.forEach((c, i) => assert.equal(isUp(c), i === col.length - 1));
    assert.ok(s.stock.every((c) => !isUp(c)));
    const suitsSeen = new Set([...s.cols.flat(), ...s.stock].map(suitOf));
    assert.equal(suitsSeen.size, suits);
    assert.ok(isValidState(s));
  }
  assert.deepEqual(newGame(2, 7), newGame(2, 7), 'одно зерно — одна раскладка');
  assert.notDeepEqual(newGame(2, 7).cols, newGame(2, 8).cols);
});

test('колода: 104 карты, по 8 наборов от туза до короля', () => {
  for (const suits of [1, 2, 4]) {
    const d = deck(suits);
    assert.equal(d.length, 104);
    for (let r = 1; r <= 13; r++) assert.equal(d.filter((c) => rankOf(c) === r).length, 8);
  }
  assert.ok(deck(2).every((c) => [SPADES, HEARTS].includes(suitOf(c))));
});

test('ход: карта на старшую на единицу любой масти, ряд — только одной масти, в пустой — что угодно', () => {
  const s = table([
    [down(SPADES, 2), up(HEARTS, 9), up(HEARTS, 8), up(HEARTS, 7)],
    [up(CLUBS, 10)],
    [up(SPADES, 8), up(DIAMONDS, 7)],
    [],
  ]);
  assert.equal(runStart(s.cols[0]), 1);
  assert.ok(canPick(s.cols[0], 1) && canPick(s.cols[0], 3));
  assert.ok(!canPick(s.cols[2], 0), 'разные масти вместе не берутся');
  assert.ok(canPick(s.cols[2], 1));
  assert.ok(canDrop(s.cols[1], up(HEARTS, 9)));
  assert.ok(!canDrop(s.cols[1], up(HEARTS, 8)));
  const r = move(s, 0, 1, 1);
  assert.ok(r.ok && r.flipped, 'закрытая карта открылась');
  assert.deepEqual(s.cols[1].map(rankOf), [10, 9, 8, 7]);
  assert.ok(isUp(s.cols[0][0]));
  assert.equal(s.moves, 1);
  assert.ok(move(s, 2, 1, 3).ok, 'в пустой столбец — любая');
  assert.ok(!move(s, 2, 0, 1).ok, 'восьмёрка на семёрку — нельзя');
});

test('собранная масть от короля до туза уходит со стола, +100, под ней открывается карта', () => {
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(up(HEARTS, r));
  const s = table([[down(CLUBS, 5), ...run], [up(HEARTS, 1)]]);
  const r = move(s, 1, 0, 0);
  assert.ok(r.ok);
  assert.deepEqual(r.completed, [{ col: 0, suit: HEARTS, flipped: true }]);
  assert.deepEqual(s.done, [HEARTS]);
  assert.equal(s.cols[0].length, 1);
  assert.ok(isUp(s.cols[0][0]));
  undo(s);
  assert.equal(s.cols[0].length, 13);
  assert.ok(!isUp(s.cols[0][0]), 'отмена снова закрыла карту');
  assert.deepEqual(s.done, []);
  assert.equal(s.cols[1].length, 1);
});

test('раздача: по карте в каждый столбец; с пустым столбцом нельзя — если только занять его нечем', () => {
  const s = newGame(1, 3);
  assert.ok(canDeal(s));
  const before = s.cols.map((c) => c.length);
  assert.ok(deal(s).ok);
  assert.deepEqual(s.cols.map((c) => c.length), before.map((n) => n + 1));
  assert.ok(s.cols.every((c) => isUp(c[c.length - 1])));
  assert.equal(s.moves, 1, 'раздача — тоже ход');
  assert.equal(dealsLeft(s), 4);

  const stock = Array(10).fill(down(SPADES, 5));
  const withEmpty = table([[up(SPADES, 3), up(SPADES, 2)], [up(SPADES, 9)], ...Array(7).fill([up(SPADES, 4)]), []], { stock, suits: 1 });
  assert.ok(!canDeal(withEmpty), 'пустой столбец и есть чем занять — нельзя');
  assert.equal(deal(withEmpty).reason, 'empty');
  const few = table([[up(SPADES, 3)], [up(SPADES, 9)]], { stock, suits: 1 });
  assert.ok(canDeal(few), 'на столе меньше 10 карт — раздавать можно, иначе тупик');
  assert.ok(!canDeal(table([[up(SPADES, 3)]], { stock: [], suits: 1 })), 'колода пуста');
});

test('отмена возвращает партию ровно назад — после сотен случайных ходов и раздач', () => {
  for (const suits of [1, 2, 4]) {
    const rng = seeded(suits * 99);
    const s = newGame(suits, suits * 11);
    const start = JSON.stringify(s.cols) + JSON.stringify(s.stock);
    let steps = 0;
    for (let k = 0; k < 400; k++) {
      const moves = allMoves(s);
      if (moves.length && (rng() < 0.9 || !canDeal(s))) {
        const [from, index, to] = moves[Math.floor(rng() * moves.length)];
        assert.ok(move(s, from, index, to).ok);
      } else if (canDeal(s)) deal(s);
      else break;
      steps += 1;
      assert.equal(total(s), 104);
    }
    assert.ok(steps > 60, `ходов: ${steps}`);
    for (let k = 0; k < steps; k++) assert.ok(undo(s));
    assert.equal(JSON.stringify(s.cols) + JSON.stringify(s.stock), start);
    assert.deepEqual(s.done, []);
    assert.equal(undo(s), null);
  }
});

test('подсказки: только законные и осмысленные ходы, лучшие первыми', () => {
  const s = table([
    [down(SPADES, 1), up(HEARTS, 6)],
    [up(HEARTS, 7)],
    [up(CLUBS, 7)],
    [up(SPADES, 9), up(SPADES, 8)],
    [up(DIAMONDS, 9), up(SPADES, 8), up(SPADES, 7)],
  ], { stock: Array(10).fill(down(SPADES, 2)) });
  const moves = hintMoves(s);
  for (const m of moves) {
    const copy = JSON.parse(JSON.stringify(s));
    assert.ok(move(copy, m.from, m.index, m.to).ok, JSON.stringify(m));
  }
  // шестёрка червей с открытием карты — на семёрку червей (своя масть) лучше, чем на трефы
  assert.deepEqual([moves[0].from, moves[0].index, moves[0].to], [0, 1, 1]);
  // восьмёрку пик со своей девятки не трогаем
  assert.ok(!moves.some((m) => m.from === 3 && m.index === 1));
  // восьмёрка с семёркой пик — с чужой девятки на свою (со своей девятки пик — нет)
  assert.ok(moves.some((m) => m.from === 4 && m.index === 1 && m.to === 3) === false, 'на восьмёрку нельзя, девятка занята');
  assert.equal(hint(s).type, 'move');
  const stuck = table([[up(SPADES, 5)], [up(HEARTS, 9)], ...Array(8).fill([up(CLUBS, 3)])]);
  assert.equal(hint(stuck), null, 'ходов нет и колода пуста');
  assert.equal(hint({ ...stuck, stock: Array(10).fill(down(SPADES, 2)) }).type, 'deal');
});

test('касание: сначала на свою масть, потом на чужую, пустой столбец — последним, весь столбец в пустой — нет', () => {
  const s = table([
    [up(HEARTS, 6)],
    [up(CLUBS, 7)],
    [up(HEARTS, 7)],
    [],
    [down(SPADES, 1), up(SPADES, 4)],
  ]);
  assert.equal(bestTarget(s, 0, 0), 2);
  s.cols[2] = [up(DIAMONDS, 2)];
  assert.equal(bestTarget(s, 0, 0), 1);
  s.cols[1] = [up(DIAMONDS, 2)];
  assert.equal(bestTarget(s, 0, 0), -1, 'единственная карта столбца в пустой — бессмысленно');
  assert.equal(bestTarget(s, 4, 1), 3, 'четвёрка с закрытой картой под ней — в пустой');
});

test('победа — все 8 мастей собраны', () => {
  const s = table([], { done: [0, 0, 0, 0, 0, 0, 0, 0], suits: 1 });
  assert.ok(isWon(s));
});

test('сохранение: настоящая партия годится, подмена карт и мусор — нет', () => {
  const s = newGame(4, 5);
  const m = hintMoves(s)[0];
  move(s, m.from, m.index, m.to);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  const extra = JSON.parse(JSON.stringify(s));
  extra.cols[0].push(up(SPADES, 1));
  assert.ok(!isValidState(extra), 'лишняя карта');
  const swapped = JSON.parse(JSON.stringify(s));
  swapped.cols[0][0] = face(swapped.cols[0][0]) === card(SPADES, 1) ? card(HEARTS, 1) : card(SPADES, 1);
  assert.ok(!isValidState(swapped) || face(s.cols[0][0]) === face(swapped.cols[0][0]), 'подменённая карта');
  const upUnderDown = JSON.parse(JSON.stringify(s));
  upUnderDown.cols[4][0] |= UP;
  assert.ok(!isValidState(upUnderDown), 'открытая под закрытой');
  assert.ok(!isValidState(null));
  assert.ok(!isValidState({ ...s, suits: 3 }));
  assert.ok(!isValidState({ ...s, cols: s.cols.slice(1) }));
});

test('статистика по режимам: победы, серия, лучшее время и меньше всего ходов (очков нет)', () => {
  const st = emptyStats();
  assert.ok(isValidStats(st));
  recordGame(st, 2, { won: true, moves: 180, timeMs: 400000 });
  recordGame(st, 2, { won: true, moves: 210, timeMs: 300000 });
  recordGame(st, 2, { won: false });
  assert.deepEqual(st[2], { played: 3, wins: 2, bestTime: 300, fewestMoves: 180, streak: 0, bestStreak: 2 });
  assert.ok(!('score' in newGame(1, 1)), 'очков в партии нет');
  assert.ok(!isValidStats({ 1: { played: -1 } }));
});
