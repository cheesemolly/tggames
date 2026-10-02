// Решатель нонограммы — зона риска: уровень с двумя решениями или требующий угадывания нечестен. Разбор строки
// сверяется с полным перебором; разбор поля и подсчёт решений — с перебором на маленьких полях.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluesOf, cluesOfGrid, solveLine, lineSolve, countSolutions } from '../solver.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);

test('подсказка строки: длины отрезков по порядку', () => {
  assert.deepEqual(cluesOf([0, 1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepEqual(cluesOf([0, 0, 0]), []);
  assert.deepEqual(cluesOf([1, 1, 1]), [3]);
  assert.deepEqual(cluesOfGrid([[1, 0], [1, 1]]), { rows: [[1], [2]], cols: [[2], [1]] });
});

test('разбор строки совпадает с полным перебором (20 000 случайных строк, в том числе противоречивых)', () => {
  const r = rng(7);
  for (let t = 0; t < 20000; t++) {
    const n = 1 + Math.floor(r() * 9);
    const truth = Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0));
    const clue = r() < 0.8 ? cluesOf(truth) : cluesOf(Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0)));
    const cells = truth.map((v) => (r() < 0.3 ? v : -1)).map((v) => (r() < 0.05 ? 1 - Math.max(0, v) : v));
    const all = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const line = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
      if (line.some((v, i) => cells[i] !== -1 && cells[i] !== v)) continue;
      if (same(cluesOf(line), clue)) all.push(line);
    }
    const res = solveLine(cells, clue);
    if (!all.length) {
      assert.equal(res, null, `строка ${t}: противоречие не найдено`);
      continue;
    }
    assert.ok(res, `строка ${t}: ложное противоречие`);
    for (let i = 0; i < n; i++) {
      const vals = new Set(all.map((l) => l[i]));
      assert.equal(res[i], vals.size === 1 ? [...vals][0] : -1, `строка ${t}, клетка ${i}`);
    }
  }
});

test('классика: 1-1-1 в пяти клетках, 5 из 5, 3 в пяти — середина', () => {
  assert.deepEqual(solveLine([-1, -1, -1, -1, -1], [1, 1, 1]), [1, 0, 1, 0, 1]);
  assert.deepEqual(solveLine([-1, -1, -1, -1, -1], [5]), [1, 1, 1, 1, 1]);
  assert.deepEqual(solveLine([-1, -1, -1, -1, -1], [3]), [-1, -1, 1, -1, -1]);
  assert.deepEqual(solveLine([-1, -1, -1], []), [0, 0, 0]);
  assert.equal(solveLine([1, -1, -1], []), null);
});

/** Все решения маленького поля перебором (до limit): строки — только подходящие к своим числам. */
function bruteSolutions(w, h, clues, limit = 3) {
  const rowsOk = clues.rows.map((clue) => {
    const list = [];
    for (let mask = 0; mask < 1 << w; mask++) {
      const line = Array.from({ length: w }, (_, x) => (mask >> x) & 1);
      if (same(cluesOf(line), clue)) list.push(line);
    }
    return list;
  });
  const out = [];
  const pick = [];
  const rec = (y) => {
    if (out.length >= limit) return;
    if (y === h) {
      const cols = Array.from({ length: w }, (_, x) => cluesOf(pick.map((r) => r[x])));
      if (cols.every((c, x) => same(c, clues.cols[x]))) out.push(pick.flat());
      return;
    }
    for (const row of rowsOk[y]) {
      pick.push(row);
      rec(y + 1);
      pick.pop();
    }
  };
  rec(0);
  return out;
}

test('поле: решение по линиям верно, число решений совпадает с перебором (до 6×5)', () => {
  const r = rng(3);
  for (let t = 0; t < 300; t++) {
    const w = 3 + Math.floor(r() * 4);
    const h = 4 + Math.floor(r() * 2);
    const truth = Array.from({ length: h }, () => Array.from({ length: w }, () => (r() < 0.55 ? 1 : 0)));
    const clues = cluesOfGrid(truth);
    const brute = bruteSolutions(w, h, clues);
    const { count } = countSolutions(w, h, clues);
    assert.equal(count, Math.min(2, brute.length), `поле ${t}`);
    const ls = lineSolve(w, h, clues);
    // всё, что определил разбор по линиям, совпадает со всеми решениями
    ls.grid.forEach((v, i) => {
      if (v !== -1) assert.ok(brute.every((b) => b[i] === v), `поле ${t}, клетка ${i}`);
    });
    if (ls.solved) assert.equal(brute.length, 1, 'решилось по линиям — значит, решение одно');
  }
});
