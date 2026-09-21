// Правила Block Blast. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SHAPE_BY_ID, COLORS } from '../pieces.js';
import {
  SIZE, emptyBoard, canPlace, placements, fitsAnywhere, fullLines, linesAfter, lineCells, clearBonus,
  placePiece, isGameOver, trayEmpty, shapeWeight, trioPlayable, dealTray, newGame, isValidState,
  emptyStats, recordGame, isValidStats, ALL_CLEAR_BONUS, COMBO_MISSES,
} from '../logic.js';

const idx = (r, c) => r * SIZE + c;

/** Детерминированный rng для воспроизводимых тестов. */
function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function stateWith(board, trayIds, extra = {}) {
  return {
    board, tray: trayIds.map((id, k) => (id ? { shape: id, color: k + 1 } : null)),
    score: 0, combo: 0, misses: 0, moves: 0, lines: 0, maxCombo: 0, elapsedMs: 0, ...extra,
  };
}

/** Поле с заполненной строкой r, кроме столбцов из skip. */
function rowAlmost(board, r, skip) {
  for (let c = 0; c < SIZE; c++) if (!skip.includes(c)) board[idx(r, c)] = 5;
  return board;
}

test('фигуры: 37 штук, id уникальны, клетки нормализованы и связны', () => {
  assert.equal(SHAPES.length, 37);
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, SHAPES.length);
  const keys = new Set();
  for (const s of SHAPES) {
    assert.ok(s.weight > 0);
    assert.equal(Math.min(...s.cells.map(([r]) => r)), 0);
    assert.equal(Math.min(...s.cells.map(([, c]) => c)), 0);
    // связность — обход из первой клетки
    const set = new Set(s.cells.map(([r, c]) => `${r},${c}`));
    const seen = new Set([`${s.cells[0][0]},${s.cells[0][1]}`]);
    const stack = [s.cells[0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${r + dr},${c + dc}`;
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([r + dr, c + dc]); }
      }
    }
    assert.equal(seen.size, s.cells.length, `${s.id} не связна`);
    const key = s.cells.map((p) => p.join(',')).sort().join(' ');
    assert.ok(!keys.has(key), `${s.id} повторяет другую фигуру`);
    keys.add(key);
  }
});

test('canPlace: границы и занятые клетки', () => {
  const board = emptyBoard();
  const sq3 = SHAPE_BY_ID.sq3;
  assert.ok(canPlace(board, sq3, 0, 0));
  assert.ok(canPlace(board, sq3, 5, 5));
  assert.equal(canPlace(board, sq3, 6, 0), false);
  assert.equal(canPlace(board, sq3, -1, 0), false);
  board[idx(1, 1)] = 3;
  assert.equal(canPlace(board, sq3, 0, 0), false);
  assert.equal(placements(emptyBoard(), sq3).length, 36);
  assert.equal(placements(emptyBoard(), SHAPE_BY_ID.dot).length, 64);
});

test('строка сгорает: очки за клетки и за линию, комбо 1', () => {
  const board = rowAlmost(emptyBoard(), 7, [6, 7]);
  const s = stateWith(board, ['bar2h', 'dot', 'dot']);
  const ev = placePiece(s, 0, 7, 6);
  assert.deepEqual(ev.rows, [7]);
  assert.equal(ev.lines, 1);
  assert.equal(ev.cleared.length, 8);
  assert.equal(ev.combo, 1);
  assert.equal(ev.bonus, clearBonus(8, 1, 1) + ALL_CLEAR_BONUS, 'поле стало пустым — бонус за чистое поле');
  assert.ok(ev.allClear);
  assert.equal(s.score, 2 + 80 + ALL_CLEAR_BONUS);
  assert.ok(s.board.every((v) => v === 0));
  assert.equal(s.tray[0], null);
});

test('строка и столбец сразу: клетка пересечения считается один раз', () => {
  const board = emptyBoard();
  rowAlmost(board, 0, [0]);
  for (let r = 1; r < SIZE; r++) board[idx(r, 0)] = 2;
  board[idx(5, 5)] = 4;                     // чтобы поле не очистилось целиком
  const s = stateWith(board, ['dot', null, null]);
  const ev = placePiece(s, 0, 0, 0);
  assert.equal(ev.lines, 2);
  assert.equal(ev.cleared.length, 15);
  assert.equal(ev.bonus, clearBonus(15, 2, 1));
  assert.equal(ev.allClear, false);
});

test('комбо растёт, переживает 2 хода без сгорания и сбрасывается на 3-м', () => {
  const board = emptyBoard();
  board[idx(4, 4)] = 1;                     // поле никогда не очищается полностью
  const s = stateWith(board, [null, null, null]);
  const clearRow = (r) => {
    rowAlmost(s.board, r, [0]);
    s.tray[0] = { shape: 'dot', color: 1 };
    return placePiece(s, 0, r, 0);
  };
  const miss = () => {
    const spot = placements(s.board, SHAPE_BY_ID.dot).find(([r]) => r >= 6);
    s.tray[0] = { shape: 'dot', color: 1 };
    return placePiece(s, 0, ...spot);
  };
  assert.equal(clearRow(0).combo, 1);
  assert.equal(clearRow(1).combo, 2);
  miss();
  miss();
  assert.equal(s.combo, 2, 'два пустых хода комбо не рвут');
  assert.equal(clearRow(2).combo, 3);
  assert.equal(clearRow(3).bonus, clearBonus(8, 1, 4));
  for (let k = 0; k < COMBO_MISSES; k++) miss();
  assert.equal(s.combo, 0, 'третий пустой ход подряд сбрасывает комбо');
  assert.equal(s.maxCombo, 4);
});

test('clearBonus: растёт с линиями и комбо', () => {
  assert.equal(clearBonus(8, 1, 1), 80);
  assert.equal(clearBonus(0, 0, 5), 0);
  assert.ok(clearBonus(32, 4, 1) > 4 * clearBonus(8, 1, 1), '4 линии разом ценнее четырёх по одной');
  assert.ok(clearBonus(32, 4, 6) > 3000 && clearBonus(32, 4, 6) < 3500, 'порядок чисел как в видео (+3054)');
});

test('подсветка: linesAfter видит будущие линии, не меняя поле', () => {
  const board = rowAlmost(emptyBoard(), 3, [2, 3]);
  const copy = [...board];
  assert.deepEqual(linesAfter(board, SHAPE_BY_ID.bar2h, 3, 2), { rows: [3], cols: [] });
  assert.deepEqual(board, copy);
  assert.deepEqual(lineCells({ rows: [0], cols: [0] }).length, 15);
});

test('конец игры: ни одна фигура не влезает', () => {
  const board = Array(64).fill(1);
  for (let r = 0; r < SIZE; r++) board[idx(r, (r * 3) % SIZE)] = 0;  // одиночные дырки, линий нет
  assert.deepEqual(fullLines(board), { rows: [], cols: [] });
  assert.ok(isGameOver(stateWith(board, ['sq2', 'bar2h', null])));
  assert.equal(isGameOver(stateWith(board, ['sq2', 'dot', null])), false);
  assert.equal(trayEmpty(stateWith(board, [null, null, null])), true);
});

test('выдача: на плотном поле мелкие фигуры чаще, крупные реже', () => {
  const small = SHAPE_BY_ID.dot;
  const big = SHAPE_BY_ID.sq3;
  assert.ok(shapeWeight(small, 0.8) > shapeWeight(small, 0.1));
  assert.ok(shapeWeight(big, 0.8) < shapeWeight(big, 0.1));
});

test('выдача: хотя бы одна фигура тройки всегда влезает (1000 случайных полей)', () => {
  const rng = seeded(7);
  for (let k = 0; k < 1000; k++) {
    const board = emptyBoard();
    const fill = rng() * 0.75;
    for (let i = 0; i < 64; i++) if (rng() < fill) board[i] = 1;
    for (const i of lineCells(fullLines(board))) board[i] = 0;  // полных линий на поле не бывает
    const tray = dealTray(board, rng);
    assert.equal(tray.length, 3);
    assert.ok(tray.some((p) => fitsAnywhere(board, SHAPE_BY_ID[p.shape])), `поле ${k}: ничего не влезает`);
    assert.equal(new Set(tray.map((p) => p.color)).size, 3, 'цвета тройки разные');
    assert.ok(tray.every((p) => p.color >= 1 && p.color <= COLORS));
  }
});

test('выдача на пустом поле — тройка ставится целиком', () => {
  const rng = seeded(11);
  for (let k = 0; k < 200; k++) {
    const tray = dealTray(emptyBoard(), rng);
    assert.ok(trioPlayable(emptyBoard(), tray.map((p) => SHAPE_BY_ID[p.shape])));
  }
});

test('случайные партии доигрываются до конца без ошибок, очки не убывают', () => {
  const rng = seeded(3);
  for (let game = 0; game < 30; game++) {
    const s = newGame(rng);
    let guard = 0;
    while (!isGameOver(s) && guard++ < 2000) {
      if (trayEmpty(s)) s.tray = dealTray(s.board, rng);
      const slot = s.tray.findIndex((p) => p && fitsAnywhere(s.board, SHAPE_BY_ID[p.shape]));
      if (slot < 0) break;
      const options = placements(s.board, SHAPE_BY_ID[s.tray[slot].shape]);
      const [r, c] = options[Math.floor(rng() * options.length)];
      const before = s.score;
      const ev = placePiece(s, slot, r, c);
      assert.ok(ev);
      assert.ok(s.score >= before + ev.placePoints);
      assert.deepEqual(fullLines(s.board), { rows: [], cols: [] }, 'после хода полных линий не остаётся');
      assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
    }
    assert.ok(guard < 2000, 'партия не закончилась');
  }
});

test('сохранение и статистика', () => {
  const s = newGame(seeded(5));
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, board: s.board.slice(1) }), false);
  assert.equal(isValidState({ ...s, tray: [{ shape: 'nope', color: 1 }, null, null] }), false);
  let st = emptyStats();
  st = recordGame(st, { ...s, score: 500, maxCombo: 3, lines: 7 });
  st = recordGame(st, { ...s, score: 200, maxCombo: 5, lines: 2 });
  assert.deepEqual(st, { played: 2, best: 500, totalScore: 700, maxCombo: 5, lines: 9 });
  assert.ok(isValidStats(st));
});
