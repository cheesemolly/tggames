// Косынка: раздача, ходы в столбцы и «дома», колода по одной и по три, переворот сброса, отмена, подсказки, сбор,
// сохранение, статистика; банк раскладок — решаемые.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UP, COLUMNS, card, suitOf, rankOf, isUp, face, newGame, seeded, canPick, canDropOnColumn, canDropOnFoundation,
  foundationFor, canMove, move, draw, undo, isWon, canAutoFinish, nextFinishMove, allMoves, hintMoves, hint,
  isValidState, emptyStats, isValidStats, recordGame,
} from '../logic.js';
import { solve, replay } from '../solver.js';
import deals from '../deals.json' with { type: 'json' };

const up = (suit, rank) => card(suit, rank, true);
const down = (suit, rank) => card(suit, rank, false);
const T = (i) => ({ k: 't', i });
const F = (i) => ({ k: 'f', i });
const W = { k: 'w' };
const table = (cols, extra = {}) => ({
  v: 1, draw: 1, seed: 1, cols: [...cols, ...Array(COLUMNS - cols.length).fill(null).map(() => [])].map((c) => [...c]),
  stock: [], waste: [], found: [[], [], [], []], moves: 0, passes: 0, undo: [], hintsUsed: 0, undos: 0, ...extra,
});
const all = (s) => [...s.cols.flat(), ...s.stock, ...s.waste, ...s.found.flat()];

test('раздача: 1…7 карт в столбцах, открыты верхние, 24 в колоде, 52 разные карты', () => {
  for (const d of [1, 3]) {
    const s = newGame(d, 5);
    assert.deepEqual(s.cols.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
    for (const col of s.cols) col.forEach((c, i) => assert.equal(isUp(c), i === col.length - 1));
    assert.equal(s.stock.length, 24);
    assert.equal(new Set(all(s).map(face)).size, 52);
    assert.ok(isValidState(s));
  }
  assert.deepEqual(newGame(1, 9), newGame(1, 9), 'одно зерно — одна раскладка');
});

test('столбец: младшая на единицу другого цвета; в пустой — только король; ряд берётся целиком', () => {
  const col = [down(0, 5), up(1, 9), up(0, 8), up(2, 7)];
  assert.ok(canPick(col, 1) && canPick(col, 3));
  assert.ok(!canPick(col, 0));
  assert.ok(!canPick([up(1, 9), up(2, 8)], 0), 'красное на красном — не ряд');
  assert.ok(canDropOnColumn([up(0, 8)], up(1, 7)));
  assert.ok(!canDropOnColumn([up(0, 8)], up(3, 7)), 'чёрное на чёрное');
  assert.ok(!canDropOnColumn([], up(1, 12)));
  assert.ok(canDropOnColumn([], up(1, 13)));
  const s = table([col, [up(3, 10)]]);
  const r = move(s, T(0), 1, T(1));
  assert.ok(r.ok && r.flipped);
  assert.deepEqual(s.cols[1].map(rankOf), [10, 9, 8, 7]);
  assert.ok(isUp(s.cols[0][0]));
});

test('«дом»: туз на пустой, дальше по возрастанию той же масти, по одной карте; из «дома» можно вернуть', () => {
  const s = table([[up(1, 1)], [up(1, 3), up(1, 2)], [up(0, 4)]]);
  assert.ok(canDropOnFoundation([], up(1, 1)));
  assert.ok(!canDropOnFoundation([], up(1, 2)));
  assert.equal(foundationFor(s, up(1, 1)), 0);
  assert.ok(move(s, T(0), 0, F(0)).ok);
  assert.equal(foundationFor(s, up(1, 2)), 0);
  assert.ok(!canMove(s, T(1), 0, F(0)), 'две карты разом — нельзя');
  assert.ok(move(s, T(1), 1, F(0)).ok);
  assert.ok(move(s, T(1), 0, F(0)).ok);
  assert.ok(move(s, F(0), 2, T(2)).ok, 'тройку червей — обратно на четвёрку пик');
  assert.equal(s.found[0].length, 2);
});

test('колода по одной и по три; кончилась — сброс переворачивается обратно', () => {
  const one = newGame(1, 3);
  assert.equal(draw(one).n, 1);
  assert.equal(one.waste.length, 1);
  const three = newGame(3, 3);
  const topBefore = three.stock[three.stock.length - 3];
  assert.equal(draw(three).n, 3);
  assert.equal(three.waste.length, 3);
  assert.equal(face(three.waste[2]), face(topBefore), 'сверху сброса — третья открытая');
  for (let k = 0; k < 7; k++) draw(three);
  assert.equal(three.stock.length, 0);
  const order = three.waste.map(face);
  const r = draw(three);
  assert.equal(r.kind, 'recycle');
  assert.equal(three.passes, 1);
  assert.equal(three.waste.length, 0);
  draw(three);
  assert.deepEqual(three.waste.map(face), order.slice(0, 3), 'после переворота — та же последовательность');
  assert.ok(!draw(table([])).ok, 'ни колоды, ни сброса');
});

test('отмена возвращает партию ровно назад — после сотен случайных ходов', () => {
  for (const d of [1, 3]) {
    const rng = seeded(d * 77);
    const s = newGame(d, d * 13);
    const start = JSON.stringify([s.cols, s.stock, s.waste, s.found]);
    let steps = 0;
    for (let k = 0; k < 400; k++) {
      const moves = allMoves(s);
      if (moves.length && rng() < 0.6) {
        const m = moves[Math.floor(rng() * moves.length)];
        assert.ok(move(s, m.from, m.index, m.to).ok);
      } else if (!draw(s).ok) break;
      steps += 1;
      assert.equal(new Set(all(s).map(face)).size, 52);
      assert.ok(isValidState(s));
    }
    assert.ok(steps > 100);
    for (let k = 0; k < steps; k++) assert.ok(undo(s));
    assert.equal(JSON.stringify([s.cols, s.stock, s.waste, s.found]), start);
    assert.equal(undo(s), null);
  }
});

test('подсказки: законные и осмысленные, открыть карту — выше всего', () => {
  const s = table([
    [down(0, 2), up(1, 6)],
    [up(0, 7)],
    [up(3, 13)],
    [up(1, 1)],
  ], { waste: [up(2, 12)] });
  const moves = hintMoves(s);
  for (const m of moves) assert.ok(canMove(s, m.from, m.index, m.to), JSON.stringify(m));
  assert.deepEqual([moves[0].from, moves[0].to], [T(0), T(1)], 'шестёрка червей на семёрку пик — открывает карту');
  assert.ok(moves.some((m) => m.from.k === 't' && m.from.i === 3 && m.to.k === 'f'), 'туз — в «дом»');
  assert.ok(!moves.some((m) => m.from.k === 't' && m.from.i === 2), 'король с пустого основания никуда не двигается');
  assert.equal(hint(table([[up(0, 5)]])), null);
  assert.equal(hint(table([[up(0, 5)]], { stock: [down(1, 9)] })).type, 'draw');
});

test('сбор в конце: когда всё открыто и колода пуста — ходы по возрастанию, до победы', () => {
  const s = table([], { found: [[], [], [], []] });
  // раскладываем полные масти по столбцам от короля к тузу, чередуя цвета нельзя — просто по масти в столбец
  for (let suit = 0; suit < 4; suit++) for (let r = 13; r >= 1; r--) s.cols[suit].push(up(suit, r));
  assert.ok(canAutoFinish(s));
  let guard = 0;
  while (!isWon(s) && guard++ < 60) {
    const m = nextFinishMove(s);
    assert.ok(m);
    assert.ok(move(s, m.from, m.index, m.to).ok);
  }
  assert.ok(isWon(s));
  assert.ok(!canAutoFinish(s));
});

test('решатель: найденное решение — законные ходы до победы', () => {
  for (const d of [1, 3]) {
    const g = newGame(d, deals[d][0]);
    const r = solve(g, { maxNodes: 100000 });
    assert.ok(r.won, `по ${d}`);
    assert.ok(replay(g, r.path).ok);
  }
});

test('банк: по 500 раскладок на режим, разные; выборка решается', () => {
  for (const d of [1, 3]) {
    assert.equal(deals[d].length, 500);
    assert.equal(new Set(deals[d]).size, 500);
    for (const k of [7, 250, 499]) assert.ok(solve(newGame(d, deals[d][k]), { maxNodes: 100000 }).won, `по ${d}, №${k}`);
  }
});

test('сохранение: настоящая партия годится, подмена и мусор — нет', () => {
  const s = newGame(3, 11);
  draw(s);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  const dup = JSON.parse(JSON.stringify(s));
  dup.cols[0][0] = dup.cols[1][1];
  assert.ok(!isValidState(dup), 'две одинаковые карты');
  const upDown = JSON.parse(JSON.stringify(s));
  upDown.cols[6][0] |= UP;
  assert.ok(!isValidState(upDown), 'открытая под закрытой');
  assert.ok(!isValidState({ ...s, draw: 2 }));
  assert.ok(!isValidState(null));
});

test('статистика: победы, серия, лучшее время и меньше всего ходов', () => {
  const st = emptyStats();
  assert.ok(isValidStats(st));
  recordGame(st, 3, { won: true, moves: 140, timeMs: 300000 });
  recordGame(st, 3, { won: true, moves: 120, timeMs: 400000 });
  recordGame(st, 3, { won: false });
  assert.deepEqual(st[3], { played: 3, wins: 2, bestTime: 300, fewestMoves: 120, streak: 0, bestStreak: 2 });
  assert.equal(suitOf(card(2, 5)), 2);
});
