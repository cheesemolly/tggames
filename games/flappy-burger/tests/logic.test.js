// Flappy Burger: генерация проходима (бот пролетает сотни препятствий), проёмы в границах, сцены чередуются
// через двери, столкновения, счёт. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, PLAY_H, GAP, EDGE, MAX_UP, MAX_DOWN, SPACING, OB_W, BURGER_X, BURGER_H, FLAP, GRAVITY, SPEED, SCENE_MIN, SCENE_MAX,
  newGame, step, flap, fillAhead, sceneAt, obstacleRects, nextObstacle, emptyStats, recordGame, isValidStats,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Простой автопилот: машет, когда центр бургера ниже центра следующего проёма и он уже падает. */
function autopilot(s, rng, maxScore, seconds = 900) {
  flap(s);
  const dt = 1 / 60;
  for (let t = 0; t < seconds && s.phase === 'play' && s.score < maxScore; t += dt) {
    const o = nextObstacle(s);
    const target = o ? o.gapY + 6 : PLAY_H / 2;
    if (s.y + BURGER_H / 2 > target && s.vy >= 0) flap(s);
    step(s, dt, rng);
  }
  return s;
}

test('физика: прыжок ниже проёма, между препятствиями успевает подняться на MAX_UP и опуститься на MAX_DOWN', () => {
  const jump = (FLAP * FLAP) / (2 * GRAVITY);
  assert.ok(jump < GAP / 2, `прыжок ${jump.toFixed(1)} px меньше половины проёма — можно «висеть» внутри`);
  const time = SPACING / SPEED;
  assert.ok(time * (jump / (-FLAP / GRAVITY)) > MAX_UP, 'подъём между препятствиями больше MAX_UP');
  assert.ok(0.5 * GRAVITY * time * time > MAX_DOWN, 'падение между препятствиями больше MAX_DOWN');
});

test('генерация: проёмы в границах, соседние — в пределах MAX_UP/MAX_DOWN, шаг SPACING, двери вместо препятствий', () => {
  const rng = seeded(3);
  const s = newGame(rng);
  const all = [];
  const gates = [];
  for (let k = 0; k < 400; k++) {
    s.dist += SPACING;
    const before = new Set(s.obstacles);
    fillAhead(s, rng);
    for (const o of s.obstacles) if (!before.has(o) && !all.includes(o)) all.push(o);
    for (const g of s.gates) if (!gates.includes(g)) gates.push(g);
  }
  assert.ok(all.length > 300);
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    assert.ok(o.gapY - GAP / 2 >= EDGE && o.gapY + GAP / 2 <= PLAY_H - EDGE, `проём ${o.gapY} у края`);
    if (i) {
      const d = o.gapY - all[i - 1].gapY;
      assert.ok(d >= -MAX_UP && d <= MAX_DOWN, `скачок ${d}`);
      assert.ok((o.x - all[i - 1].x) % SPACING === 0 && o.x > all[i - 1].x);
    }
  }
  // сцены: кухня → улица → кухня…, в каждой SCENE_MIN…SCENE_MAX препятствий
  assert.ok(gates.length >= 20);
  gates.forEach((g, i) => {
    assert.notEqual(g.from, g.to);
    if (i) assert.equal(g.from, gates[i - 1].to);
    assert.ok(!all.some((o) => Math.abs(o.x + OB_W / 2 - g.x) < SPACING / 2), 'дверь не на препятствии');
  });
  assert.equal(gates[0].from, 'kitchen');
  for (let i = 1; i < gates.length; i++) {
    const n = all.filter((o) => o.x > gates[i - 1].x && o.x < gates[i].x).length;
    assert.ok(n >= SCENE_MIN && n <= SCENE_MAX, `в сцене ${n}`);
  }
  for (const o of all) assert.equal(o.scene, sceneAt({ ...s, gates }, o.x + OB_W / 2));
});

test('проходимость: автопилот пролетает 300 препятствий на 10 зёрнах (кухни и улицы)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const rng = seeded(seed);
    const s = autopilot(newGame(rng), rng, 300);
    assert.equal(s.score, 300, `зерно ${seed}: разбился на ${s.score}`);
    assert.ok(s.visits.street >= 5, 'побывал на улице');
  }
});

test('столкновения: вытяжка, плита, пол; в проёме — нет', () => {
  const s = newGame(seeded(1));
  s.phase = 'play';
  s.obstacles = [{ x: BURGER_X - 5, gapY: 120, scene: 'kitchen', passed: false }];
  s.dist = 0;
  s.nextX = 1e9;
  s.y = 120 - BURGER_H / 2;
  s.vy = 0;
  step(s, 1 / 120);
  assert.equal(s.phase, 'play', 'в проёме');
  s.y = 120 - GAP / 2 - 3;
  s.vy = 0;
  assert.ok(step(s, 1 / 120).includes('hit'), 'вытяжка');
  const t = { ...newGame(seeded(1)), phase: 'play', obstacles: [{ x: BURGER_X - 5, gapY: 120, scene: 'street', passed: false }], nextX: 1e9 };
  t.y = 120 + GAP / 2 - BURGER_H + 3;
  assert.ok(step(t, 1 / 120).includes('hit'), 'мусорный бак');
  // рядом с воздуховодом (он уже колпака) — не удар
  const duct = obstacleRects({ x: 0, gapY: 150, scene: 'kitchen' }).find((r) => r.part === 'duct');
  assert.ok(duct.x > 0 && duct.x + duct.w < OB_W);
  const g = { ...newGame(seeded(2)), phase: 'play', obstacles: [], nextX: 1e9 };
  g.y = PLAY_H - BURGER_H - 1;
  g.vy = 200;
  const ev = step(g, 0.1);
  assert.ok(ev.includes('over') && g.phase === 'over', 'пол');
  assert.equal(flap(g), false, 'после падения не машет');
});

test('счёт, ожидание старта, статистика', () => {
  const rng = seeded(5);
  const s = newGame(rng);
  step(s, 2, rng);
  assert.equal(s.phase, 'ready');
  assert.equal(s.score, 0, 'до первого взмаха не играет');
  autopilot(s, rng, 5);
  assert.equal(s.score, 5);
  let st = emptyStats();
  st = recordGame(st, s);
  assert.deepEqual(st, { games: 1, best: 5, total: 5, streets: s.visits.street });
  assert.ok(isValidStats(st));
  assert.ok(W > OB_W);
});
