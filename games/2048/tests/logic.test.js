// Правила 2048. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZES, move, spawn, canMove, maxTile, newGame, play, undo, isValidState,
  emptyStats, recordGame, isValidStats, UNDO_PER_GAME, WIN_VALUE, DIRECTIONS,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const row = (values) => [...values, ...Array(12).fill(0)];   // первая строка поля 4×4

test('слияние: 2 2 2 2 → 4 4, счёт 8', () => {
  const r = move(row([2, 2, 2, 2]), 4, 'left');
  assert.deepEqual(r.grid.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(r.gain, 8);
  assert.equal(r.merges.length, 2);
});

test('каждая плитка сливается не больше раза за ход: 4 4 8 → 8 8, а не 16', () => {
  assert.deepEqual(move(row([4, 4, 8, 0]), 4, 'left').grid.slice(0, 4), [8, 8, 0, 0]);
  assert.deepEqual(move(row([2, 2, 4, 4]), 4, 'left').grid.slice(0, 4), [4, 8, 0, 0]);
  assert.deepEqual(move(row([2, 2, 2, 0]), 4, 'left').grid.slice(0, 4), [4, 2, 0, 0]);
  assert.deepEqual(move(row([2, 2, 2, 0]), 4, 'right').grid.slice(0, 4), [0, 0, 2, 4], 'сливаются те, что ближе к краю');
  assert.deepEqual(move(row([2, 0, 0, 2]), 4, 'left').grid.slice(0, 4), [4, 0, 0, 0], 'через пустоты');
  assert.deepEqual(move(row([2, 4, 2, 4]), 4, 'left').grid.slice(0, 4), [2, 4, 2, 4]);
});

test('ход, который ничего не меняет, — не ход', () => {
  const r = move(row([2, 4, 8, 16]), 4, 'left');
  assert.equal(r.moved, false);
  assert.equal(r.moves.length, 0);
});

test('все 4 направления согласованы (поворот поля даёт тот же результат)', () => {
  // столбец 0 сверху вниз = строка 0 слева направо
  const col = Array(16).fill(0);
  [2, 2, 4, 4].forEach((v, k) => { col[k * 4] = v; });
  const up = move(col, 4, 'up').grid;
  assert.deepEqual([up[0], up[4], up[8], up[12]], [4, 8, 0, 0]);
  const down = move(col, 4, 'down').grid;
  assert.deepEqual([down[0], down[4], down[8], down[12]], [0, 0, 4, 8]);
});

test('движения для анимации: каждая плитка знает откуда и куда', () => {
  const r = move(row([0, 2, 0, 2]), 4, 'left');
  assert.deepEqual(r.moves, [{ from: 1, to: 0, value: 2 }, { from: 3, to: 0, value: 2 }]);
  assert.deepEqual(r.merges, [{ at: 0, value: 4 }]);
});

test('сумма плиток сохраняется при ходе (случайные поля)', () => {
  const rng = seeded(1);
  for (let k = 0; k < 2000; k++) {
    const size = SIZES[k % SIZES.length];
    const grid = Array.from({ length: size * size }, () => (rng() < 0.5 ? 0 : 2 ** (1 + Math.floor(rng() * 5))));
    for (const dir of DIRECTIONS) {
      const r = move(grid, size, dir);
      const sum = (g) => g.reduce((a, b) => a + b, 0);
      assert.equal(sum(r.grid), sum(grid));
      assert.equal(r.gain, r.merges.reduce((a, m) => a + m.value, 0));
    }
  }
});

test('новая плитка: только в пустую клетку, 2 примерно в 90% случаев', () => {
  const rng = seeded(4);
  let twos = 0;
  for (let k = 0; k < 5000; k++) {
    const s = spawn(row([2, 4, 0, 0]), rng);
    assert.equal(row([2, 4, 0, 0])[s.at], 0);
    if (s.value === 2) twos++;
  }
  assert.ok(twos > 4350 && twos < 4650, `двоек ${twos} из 5000`);
  assert.equal(spawn(Array(16).fill(2)), null);
});

test('конец игры: нет пустых клеток и соседних одинаковых', () => {
  assert.equal(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2], 4), false);
  assert.equal(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 4], 4), true);
  assert.equal(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0], 4), true);
});

test('партия: ход добавляет плитку, победа на 2048 один раз, отмена', () => {
  const rng = seeded(9);
  const s = newGame(4, rng);
  assert.equal(s.grid.filter(Boolean).length, 2);
  s.grid = row([1024, 1024, 0, 0]);
  const r = play(s, 'left', rng);
  assert.ok(r.moved && r.won);
  assert.equal(maxTile(s.grid), WIN_VALUE);
  assert.equal(s.grid.filter(Boolean).length, 2, 'после хода появилась новая плитка');
  assert.ok(undo(s));
  assert.deepEqual(s.grid, row([1024, 1024, 0, 0]));
  assert.equal(s.score, undefined, 'очков в игре нет');
  assert.equal(s.undoLeft, UNDO_PER_GAME - 1);
  assert.equal(undo(s), false, 'отменить можно только последний ход');
  const again = play(s, 'left', rng);
  assert.equal(again.won, false, 'победа засчитывается один раз');
});

test('случайные партии доигрываются, состояние всегда корректно', () => {
  const rng = seeded(12);
  for (const size of SIZES) {
    const s = newGame(size, rng);
    let guard = 0;
    while (canMove(s.grid, size) && guard++ < 5000) {
      play(s, DIRECTIONS[Math.floor(rng() * 4)], rng);
    }
    assert.ok(guard < 5000);
    assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  }
});

test('сохранение и статистика', () => {
  const s = newGame(4, seeded(2));
  assert.ok(isValidState(s));
  assert.equal(isValidState({ ...s, grid: [...s.grid.slice(1), 3] }), false, '3 — не степень двойки');
  assert.equal(isValidState({ ...s, size: 7 }), false);
  let st = emptyStats();
  st = recordGame(st, { ...s, won: true, grid: row([2048, 4, 0, 0]) });
  st = recordGame(st, { ...s, won: false, grid: row([64, 0, 0, 0]) });
  assert.deepEqual(st, { played: 2, bestTile: 2048, wins: 1 }, 'рекорд — лучшая плитка, а не очки');
  assert.ok(isValidStats(st));
});
