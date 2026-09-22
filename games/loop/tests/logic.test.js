// «Петля»: повороты масок, проверка решения, уровни решаемы и перемешаны, размер растёт плавно и ≤ 10×10.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N, E, S, W, MAX_DIM, rotateMask, tileKind, dimsFor, generateSolution, isSolved, scramble, newLevel,
  rotateTile, currentMasks, isValidState, emptyStats, recordSolved, isValidStats,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const PALETTES = ['mint', 'sky', 'sand'];

test('повороты: по часовой N → E → S → W, четыре поворота — на место', () => {
  assert.equal(rotateMask(N, 1), E);
  assert.equal(rotateMask(W, 1), N);
  assert.equal(rotateMask(N | E, 1), E | S);
  assert.equal(rotateMask(N | S, 1), E | W);
  for (let m = 0; m < 16; m++) assert.equal(rotateMask(m, 4), m);
  assert.deepEqual(tileKind(N | E | S), { kind: 'tee', turns: 0 });
  assert.deepEqual(tileKind(W | N | E), { kind: 'tee', turns: 3 });
  assert.equal(tileKind(E | W).kind, 'straight');
  assert.equal(tileKind(S | W).kind, 'corner');
  assert.equal(tileKind(0), null);
  for (let m = 1; m < 16; m++) {
    const { kind, turns } = tileKind(m);
    const base = { end: N, straight: N | S, corner: N | E, tee: N | E | S, cross: 15 }[kind];
    assert.equal(rotateMask(base, turns), m);
  }
});

test('проверка решения: свободный конец или выход за край — не решено', () => {
  // 1×… не бывает, берём 2×2: кольцо из четырёх уголков
  const ring = [E | S, W | S, N | E, N | W];
  assert.ok(isSolved(ring, 2, 2));
  assert.equal(isSolved([E | S, W | S, N | E, N], 2, 2), false, 'у соседа нет ответной связи');
  assert.equal(isSolved([N | E | S, W | S, N | E, N | W], 2, 2), false, 'связь за край поля');
  assert.ok(isSolved([0, 0, 0, 0], 2, 2));
});

test('генерация: исходное поле решено, связи парные, перемешанное — не решено', () => {
  const rng = seeded(1);
  for (let k = 0; k < 500; k++) {
    const rows = 3 + (k % 8);
    const cols = 3 + ((k * 3) % 8);
    const base = generateSolution(rows, cols, rng);
    assert.ok(isSolved(base, rows, cols));
    assert.ok(base.filter(Boolean).length >= base.length * 0.6 || rows * cols <= 9);
    const rot = scramble(base, rows, cols, rng);
    assert.equal(isSolved(base.map((m, i) => rotateMask(m, rot[i])), rows, cols), false);
  }
});

test('размер: не больше 10×10, стороны меняются не больше чем на 1, поле растёт', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = seeded(seed);
    let prev = null;
    for (let level = 1; level <= 150; level++) {
      const d = dimsFor(level, prev, rng);
      assert.ok(d.rows >= 3 && d.cols >= 3 && d.rows <= MAX_DIM && d.cols <= MAX_DIM, JSON.stringify(d));
      if (prev) {
        assert.ok(Math.abs(d.rows - prev.rows) <= 1 && Math.abs(d.cols - prev.cols) <= 1, `уровень ${level}: скачок`);
      }
      if (level === 1) assert.deepEqual(d, { rows: 3, cols: 3 });
      if (level >= 30) assert.ok(d.rows >= 6 && d.cols >= 6, `уровень ${level}: ${JSON.stringify(d)}`);
      prev = d;
    }
  }
});

test('уровень: поворот до исходного положения решает; форма и палитра меняются по настройкам', () => {
  const rng = seeded(7);
  let s = null;
  let shapeChanges = 0;
  for (let level = 1; level <= 60; level++) {
    const next = newLevel(level, s, { shape: 'mix', palette: 'random' }, PALETTES, rng);
    assert.ok(isValidState(JSON.parse(JSON.stringify(next))));
    if (s) {
      assert.notEqual(next.palette, s.palette, 'случайная палитра — каждый раз другая');
      if (next.shape !== s.shape) shapeChanges++;
    }
    // докрутить каждую плитку до исходного положения
    let solved = false;
    next.rot.forEach((r, i) => {
      for (let k = r; k % 4 !== 0; k++) solved = rotateTile(next, i);
    });
    assert.ok(solved || isSolved(currentMasks(next), next.rows, next.cols));
    s = next;
  }
  assert.ok(shapeChanges >= 5 && shapeChanges <= 40, `смен формы: ${shapeChanges}`);
  const fixed = newLevel(2, s, { shape: 'square', palette: 'sky' }, PALETTES, rng);
  assert.equal(fixed.shape, 'square');
  assert.equal(fixed.palette, 'sky');
});

test('сохранение и статистика', () => {
  const s = newLevel(1, null, { shape: 'round', palette: 'mint' }, PALETTES, seeded(3));
  assert.ok(isValidState(s));
  assert.equal(isValidState({ ...s, rows: 11 }), false);
  assert.equal(isValidState({ ...s, base: s.base.map(() => N) }), false, 'исходное поле должно быть решено');
  assert.equal(isValidState({ ...s, v: 0 }), false);
  let st = emptyStats();
  st = recordSolved(st, { ...s, moves: 12, level: 4 });
  assert.deepEqual(st, { solved: 1, taps: 12, bestLevel: 4 });
  assert.ok(isValidStats(st));
});
