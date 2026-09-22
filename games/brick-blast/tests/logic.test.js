// Brick Blast: столкновения, отскоки, удары, бонусы, сдвиг уровня, генерация, ходы всегда кончаются,
// бот проходит первый уровень. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, BALL_R, SPEED, START_ROW, polygon, circlePolygon, generateLevel, newLevel, startTurn, step, recall,
  endTurn, danger, tracePath, aimAngle, isValidState, progress, ballsFor, emptyStats, isValidStats,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Пустой уровень с заданными блоками и бонусами. */
function level(blocks, powers = []) {
  let id = 1;
  const b = blocks.map((x) => ({ id: id++, shape: 'sq', ...x, max: x.hp }));
  const p = powers.map((x) => ({ id: id++, ...x }));
  return {
    v: 1, level: 1, balls: 1, x: 4, turn: 0, triple: false, blocks: b, powers: p,
    total: b.reduce((s, x) => s + x.hp, 0), dealt: 0, pattern: { rows: 1, cells: [], powers: [] }, nextId: id,
  };
}

function runTurn(state, angle, rng = seeded(1), limit = 120) {
  const sim = startTurn(state, angle);
  for (let t = 0; t < limit && !sim.done; t += 1 / 60) step(state, sim, 1 / 60, rng);
  return sim;
}

test('столкновение круга с квадратом и треугольником: нормаль наружу', () => {
  const sq = polygon('sq', 2, 3);
  assert.equal(circlePolygon(3.5, 1.5, 0.2, sq), null, 'далеко');
  const top = circlePolygon(3.5, 1.9, 0.2, sq);
  assert.ok(top && Math.abs(top.ny + 1) < 1e-9 && Math.abs(top.nx) < 1e-9, 'сверху — нормаль вверх');
  const corner = circlePolygon(4.1, 3.1, 0.2, sq);
  assert.ok(corner && corner.nx > 0 && corner.ny > 0, 'угол — нормаль по диагонали');
  // 'tl' — прямой угол слева сверху, гипотенуза смотрит вправо-вниз
  const tri = polygon('tl', 0, 0);
  const hyp = circlePolygon(0.6, 0.6, 0.2, tri);
  assert.ok(hyp && hyp.nx > 0.6 && hyp.ny > 0.6, 'гипотенуза');
  assert.equal(circlePolygon(0.9, 0.9, 0.1, tri), null, 'пустой угол треугольника — мимо');
  const inside = circlePolygon(0.2, 0.3, 0.1, tri);
  assert.ok(inside, 'центр внутри — касание есть');
});

test('отскок: от блока вниз, удар снимает 1 прочность за касание', () => {
  // блок над стартом: шарик летит вертикально вверх, отскакивает и возвращается
  const s = level([{ r: 3, c: 4, hp: 5 }]);
  s.x = 4.5;
  const sim = runTurn(s, Math.PI / 2);
  assert.ok(sim.done);
  assert.equal(s.blocks[0].hp, 4, 'одно касание — один удар');
  assert.equal(s.dealt, 1);
  assert.ok(Math.abs(sim.firstX - 4.5) < 0.05, 'вернулся туда же');
});

test('шарик не застревает: 300 случайных бросков по уровням 1–30 заканчиваются', () => {
  const rng = seeded(5);
  for (let k = 0; k < 300; k++) {
    const s = newLevel(1 + (k % 30), rng);
    s.balls = 5;
    const sim = runTurn(s, 0.15 + rng() * (Math.PI - 0.3), rng, 90);
    assert.ok(sim.done, `бросок ${k} не кончился`);
    for (const b of sim.balls) assert.ok(b.x >= 0 && b.x <= COLS && b.y <= ROWS, 'шарик вылетел за поле');
  }
});

test('бонусы: лазер бьёт весь ряд, ×3 — на следующий бросок, кнопка «вернуть» кончает ход', () => {
  const s = level([{ r: 5, c: 0, hp: 3 }, { r: 5, c: 7, hp: 3 }, { r: 6, c: 7, hp: 3 }], [{ r: 5, c: 4, kind: 'laserH' }]);
  s.x = 4.5;
  runTurn(s, Math.PI / 2);
  assert.deepEqual(s.blocks.map((b) => b.hp), [1, 1, 3], 'шарик прошёл кольцо вверх и вниз — ряд 5 дважды, ряд 6 не тронут');
  const t = level([{ r: 1, c: 0, hp: 50 }], [{ r: 6, c: 4, kind: 'triple' }]);
  t.x = 4.5;
  runTurn(t, Math.PI / 2);
  assert.equal(t.triple, true);
  assert.equal(t.powers.length, 0, '×3 исчезает');
  const next = startTurn(t, 1);
  assert.equal(next.count, 3);
  endTurn(t, next);
  assert.equal(t.triple, false, '×3 — на один бросок');
  const u = newLevel(3, seeded(2));
  const sim = startTurn(u, 1.2);
  step(u, sim, 0.3);
  recall(sim);
  assert.ok(sim.done && sim.balls.every((b) => !b.active));
});

test('конец хода: сдвиг вниз, проигрыш у нижнего ряда, победа — все блоки разбиты', () => {
  const s = level([{ r: ROWS - 3, c: 2, hp: 9 }], [{ r: ROWS - 2, c: 5, kind: 'laserV' }]);
  const sim = startTurn(s, 1);
  recall(sim);
  assert.equal(endTurn(s, sim), 'next');
  assert.equal(s.blocks[0].r, ROWS - 2);
  assert.equal(s.powers.length, 0, 'бонус у дна исчезает');
  assert.ok(danger(s));
  assert.equal(endTurn(s, sim), 'lose');
  const w = level([{ r: 3, c: 4, hp: 1 }]);
  w.x = 4.5;
  const ws = runTurn(w, Math.PI / 2);
  assert.ok(ws.cleared);
  assert.equal(endTurn(w, ws), 'win');
  assert.equal(progress(w), 1);
  // пустой экран пропускается: блок далеко над полем — сразу спускается
  const far = level([{ r: -6, c: 1, hp: 5 }]);
  const fs = startTurn(far, 1);
  recall(fs);
  assert.equal(endTurn(far, fs), 'next');
  assert.equal(far.blocks[0].r, 1);
});

test('генерация: 8 столбцов, заполнено ≥ 40%, прочность растёт кверху, шариков как в видео', () => {
  const rng = seeded(9);
  for (let lv = 1; lv <= 40; lv++) {
    const p = generateLevel(lv, rng);
    assert.ok(p.cells.length >= p.rows * COLS * 0.4);
    for (const x of p.cells) assert.ok(x.c >= 0 && x.c < COLS && x.k >= 0 && x.k < p.rows && x.hp >= 1);
    const keys = new Set(p.cells.map((x) => `${x.k}:${x.c}`));
    assert.equal(keys.size, p.cells.length, 'клетки не повторяются');
    for (const q of p.powers) assert.ok(!keys.has(`${q.k}:${q.c}`), 'бонус не в блоке');
    const avg = (arr) => arr.reduce((a, x) => a + x.hp, 0) / Math.max(1, arr.length);
    const low = p.cells.filter((x) => x.k < p.rows / 3);
    const high = p.cells.filter((x) => x.k >= (p.rows * 2) / 3);
    if (low.length > 3 && high.length > 3) assert.ok(avg(high) > avg(low), `уровень ${lv}: верх не крепче низа`);
  }
  assert.equal(ballsFor(1), 60);
  assert.equal(ballsFor(6), 70);
  const s = newLevel(1, rng);
  assert.equal(Math.max(...s.blocks.map((b) => b.r)), START_ROW);
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, v: 0 }), false);
});

test('прицел: угол по точке касания, траектория — до касания и отражённый отрезок', () => {
  assert.ok(Math.abs(aimAngle(4, 4, 0) - Math.PI / 2) < 1e-9);
  assert.ok(aimAngle(4, 8, ROWS) > 0.1, 'почти горизонтально — не ниже минимума');
  const s = level([{ r: 2, c: 4, hp: 5 }]);
  const pts = tracePath(s, 4.5, Math.PI / 2);
  assert.equal(pts.length, 3);
  assert.ok(Math.abs(pts[1][1] - (3 + BALL_R)) < 0.05, 'касание нижней грани блока');
  assert.ok(pts[2][1] > pts[1][1], 'отражение — вниз');
});

test('бот с перебором углов проходит 1-й уровень; статистика', () => {
  const rng = seeded(3);
  const s = newLevel(1, rng);
  let res = 'next';
  for (let turn = 0; turn < 60 && res === 'next'; turn++) {
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = 0.25 + ((Math.PI - 0.5) * (k + 0.5)) / 8;
      const c = structuredClone(s);
      runTurn(c, a, seeded(k));
      if (!best || c.dealt > best.d) best = { a, d: c.dealt };
    }
    res = endTurn(s, runTurn(s, best.a, rng));
  }
  assert.equal(res, 'win');
  assert.ok(SPEED > 0);
  assert.ok(isValidStats(emptyStats()));
});
