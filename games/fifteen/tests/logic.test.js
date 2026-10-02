// Пятнашки: решаемость (сверяется с поиском в ширину на 2×2/3×3), честное перемешивание, ходы и отмена, решатели
// (кратчайший — с поиском в ширину на 3×3, пошаговый — собирает любое поле), сохранение, статистика.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZES, solved, isSolvable, isSolved, scramble, tileForDir, lineTo, newGame, slide, moveDir, tapCell, undo,
  isValidGame, emptyStats, isValidStats, recordGame, manhattan, inversions,
} from '../logic.js';
import { optimal, staged, hint, heuristic } from '../solver.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Все достижимые из собранного положения 3×3 (поиск в ширину): Map(ключ → расстояние). */
function bfs3() {
  const n = 3;
  const start = solved(n);
  const dist = new Map([[start.join(''), 0]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const g = queue[q];
    const e = g.indexOf(0);
    for (const t of [e - 3, e + 3, e % 3 ? e - 1 : -1, e % 3 < 2 ? e + 1 : -1]) {
      if (t < 0 || t >= 9) continue;
      const h = g.slice();
      h[e] = h[t];
      h[t] = 0;
      const k = h.join('');
      if (dist.has(k)) continue;
      dist.set(k, dist.get(g.join('')) + 1);
      queue.push(h);
    }
  }
  return dist;
}
const reach3 = bfs3();

const apply = (grid, n, moves) => {
  const g = grid.slice();
  for (const v of moves) {
    const i = g.indexOf(v);
    const e = g.indexOf(0);
    const adj = (Math.abs(i - e) === 1 && Math.floor(i / n) === Math.floor(e / n)) || Math.abs(i - e) === n;
    assert.ok(adj, `плитка ${v} не рядом с пустой`);
    g[e] = v;
    g[i] = 0;
  }
  return g;
};

test('решаемость: ровно половина расстановок 3×3, совпадает с поиском в ширину (9!/2 = 181 440)', () => {
  assert.equal(reach3.size, 181440);
  const r = rng(1);
  for (let t = 0; t < 3000; t++) {
    const g = solved(3);
    for (let i = 8; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    assert.equal(isSolvable(g, 3), reach3.has(g.join('')));
  }
});

test('решаемость на чётной ширине: 14 и 15 переставлены — нельзя (знаменитая задача Лойда)', () => {
  const loyd = solved(4);
  [loyd[13], loyd[14]] = [loyd[14], loyd[13]];
  assert.equal(isSolvable(loyd, 4), false);
  assert.equal(isSolvable(solved(4), 4), true);
  assert.equal(inversions(loyd), 1);
});

test('перемешивание: всегда решаемо, не собрано и не слишком близко к сборке; равномерно по клеткам', () => {
  const r = rng(7);
  for (const n of SIZES) {
    for (let t = 0; t < 300; t++) {
      const g = scramble(n, r);
      assert.ok(isSolvable(g, n), `${n}×${n}`);
      assert.ok(!isSolved(g));
      assert.ok(manhattan(g, n) >= Math.round(n * n * (n - 1) * 0.33));
    }
  }
  // пустая клетка попадает во все места примерно поровну
  const counts = new Array(16).fill(0);
  for (let t = 0; t < 8000; t++) counts[scramble(4, r).indexOf(0)]++;
  assert.ok(Math.min(...counts) > 350 && Math.max(...counts) < 650, counts.join(','));
});

test('ход свайпом как в 2048: свайп вправо двигает плитку слева от пустой; у края — ничего', () => {
  const game = newGame(3, rng(2));
  game.grid = [1, 2, 3, 4, 5, 6, 7, 0, 8];
  assert.equal(tileForDir(game.grid, 3, 'right'), 6);
  assert.equal(tileForDir(game.grid, 3, 'left'), 8);
  assert.equal(tileForDir(game.grid, 3, 'down'), 4);
  assert.equal(tileForDir(game.grid, 3, 'up'), -1);
  const m = moveDir(game, 'left');
  assert.deepEqual(m, [{ from: 8, to: 7, value: 8 }]);
  assert.equal(game.done, true, 'собрано');
});

test('касание: вся линия от пустой до плитки сдвигается, каждая плитка — ход; отмена возвращает', () => {
  const game = newGame(4, rng(3));
  game.grid = solved(4);
  game.done = false;
  // пустая в углу (15); касание 12-й клетки (верхняя в столбце) двигает 3 плитки вниз
  assert.deepEqual(lineTo(game.grid, 4, 3), [11, 7, 3]);
  assert.deepEqual(lineTo(game.grid, 4, 5), [], 'не в одной линии');
  const before = game.grid.slice();
  const moved = tapCell(game, 3);
  assert.equal(moved.length, 3);
  assert.equal(game.moves, 3);
  assert.equal(game.grid[3], 0);
  undo(game);
  assert.deepEqual(game.grid, before);
});

test('кратчайший путь на 3×3 совпадает с поиском в ширину; оценка допустима', () => {
  const r = rng(11);
  for (let t = 0; t < 150; t++) {
    const g = scramble(3, r, 0);
    const p = optimal(g, 3);
    assert.equal(p.length, reach3.get(g.join('')), `поле ${g.join('')}`);
    assert.ok(isSolved(apply(g, 3, p)));
    assert.ok(heuristic(g, 3) <= p.length, 'оценка не больше кратчайшего');
  }
});

test('пошаговый решатель собирает любое поле 3×3…6×6', () => {
  const r = rng(5);
  for (const n of SIZES) {
    for (let t = 0; t < (n > 4 ? 15 : 40); t++) {
      const g = scramble(n, r);
      const p = staged(g, n);
      assert.ok(p, `${n}×${n}: не решил`);
      assert.ok(isSolved(apply(g, n, p)), `${n}×${n}: не собрал`);
    }
  }
});

test('подсказка: ход — сосед пустой и ведёт к сборке', () => {
  const r = rng(9);
  for (const n of SIZES) {
    let g = scramble(n, r);
    for (let k = 0; k < 6; k++) {
      const h = hint(g, n);
      assert.ok(h && h.tile, `${n}×${n}`);
      g = apply(g, n, [h.tile]);
    }
  }
  assert.equal(hint(solved(4), 4).tile, null);
});

test('сохранение и статистика', () => {
  const game = newGame(5, rng(4));
  slide(game, [tileForDir(game.grid, 5, 'left') >= 0 ? tileForDir(game.grid, 5, 'left') : tileForDir(game.grid, 5, 'right')]);
  assert.ok(isValidGame(JSON.parse(JSON.stringify(game))));
  assert.equal(isValidGame({ ...game, grid: game.grid.slice(1) }), false);
  const bad = game.grid.slice();
  const a = bad.findIndex((v) => v);
  const b = bad.findIndex((v, i) => v && i !== a);
  [bad[a], bad[b]] = [bad[b], bad[a]];
  assert.equal(isValidGame({ ...game, grid: bad }), false, 'нерешаемое');
  const s = emptyStats();
  recordGame(s, { n: 4, moves: 120, time: 90000 }, { win: true });
  recordGame(s, { n: 4, moves: 100, time: 95000 }, { win: true });
  recordGame(s, { n: 4, moves: 140, time: 80000 }, { win: true });
  recordGame(s, { n: 4, moves: 5, time: 1000 }, { win: false });
  assert.equal(s[4].played, 4);
  assert.equal(s[4].wins, 3);
  assert.equal(s[4].bestMoves, 100);
  assert.equal(s[4].bestTime, 80000, 'брошенная — не рекорд');
  assert.ok(isValidStats(s));
});
