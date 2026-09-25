// Flappy Burger: генерация проходима (автопилот пролетает сотни препятствий), проёмы в границах, разная ширина и
// расстояния, диагональные препятствия, сцены чередуются через стены с дверями, столкновения, счёт.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, PLAY_H, GAP, DIAG_GAP, EDGE, MAX_UP, MAX_DOWN, FREE_MIN, FREE_MAX, OB_W, BURGER_X, BURGER_W, BURGER_H, FLAP,
  GRAVITY, SPEED, SCENE_MIN, SCENE_MAX, DOOR_H, TYPES, WIDTHS, DIAGONAL, SLICE,
  HOVER_Y, newGame, step, flap, launch, fillAhead, sceneAt, obstacleRects, nextObstacle, gapCenterAt, exitGapY,
  emptyStats, recordGame, isValidStats,
} from '../logic.js';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

/** Автопилот: машет, когда центр бургера ниже центра проёма чуть впереди (у диагонального — со сдвигом). */
function autopilot(s, rng, maxScore, seconds = 900) {
  flap(s);
  const dt = 1 / 60;
  for (let t = 0; t < seconds && s.phase === 'play' && s.score < maxScore; t += dt) {
    const o = nextObstacle(s);
    const ahead = s.dist + BURGER_X + BURGER_W / 2 + 10;
    const target = o ? gapCenterAt(o, Math.max(o.x, ahead)) + 6 : PLAY_H / 2;
    if (s.y + BURGER_H / 2 > target && s.vy >= 0) flap(s);
    step(s, dt, rng);
  }
  return s;
}

/** Все препятствия на длинном отрезке мира. */
function generate(seed, screens = 600) {
  const rng = seeded(seed);
  const s = newGame(rng);
  const all = [];
  const gates = [];
  for (let k = 0; k < screens; k++) {
    s.dist += 60;
    fillAhead(s, rng);
    for (const o of s.obstacles) if (!all.includes(o)) all.push(o);
    for (const g of s.gates) if (!gates.includes(g)) gates.push(g);
  }
  return { s, all, gates };
}

test('физика: прыжок ниже проёма, за минимальное расстояние успевает подняться на MAX_UP и опуститься на MAX_DOWN', () => {
  const jump = (FLAP * FLAP) / (2 * GRAVITY);
  assert.ok(jump < GAP / 2, `прыжок ${jump.toFixed(1)} px меньше половины проёма`);
  const time = 64 / SPEED;                                 // 64 px свободного места — «единица» сдвига проёма
  assert.ok(time * (jump / (-FLAP / GRAVITY)) > MAX_UP, 'подъём больше MAX_UP');
  assert.ok(0.5 * GRAVITY * time * time > MAX_DOWN, 'падение больше MAX_DOWN');
});

test('генерация: разные ширины и расстояния, проёмы в границах и досягаемы, диагонали, стены с дверями', () => {
  const { s, all, gates } = generate(3);
  assert.ok(all.length > 250);
  const widths = new Set();
  const frees = new Set();
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    widths.add(o.w);
    assert.ok(WIDTHS[o.type].includes(o.w), `${o.type}: ширина ${o.w}`);
    if (i) {
      const free = o.x - (all[i - 1].x + all[i - 1].w);
      frees.add(free);
      assert.ok(free >= FREE_MIN && free <= FREE_MAX, `свободно ${free}`);
    }
    if (o.type === 'door') {
      assert.equal(o.gap, DOOR_H);
      assert.equal(o.gapY + o.gap / 2, PLAY_H, 'дверной проём — до пола');
      assert.ok(exitGapY(all[i - 1]) + MAX_DOWN * (FREE_MIN / 64) >= PLAY_H - DOOR_H + 12, 'перед дверью слишком высоко');
      continue;
    }
    assert.ok(TYPES[o.scene].includes(o.type));
    const gap = o.gap;
    for (const x of [o.x, o.x + o.w - 1]) {
      const c = gapCenterAt(o, x);
      assert.ok(c - gap / 2 >= EDGE - 1 && c + gap / 2 <= PLAY_H - EDGE + 1, `${o.type}: проём ${c} у края`);
    }
    if (i && all[i - 1].type !== 'door') {
      assert.notEqual(o.type, all[i - 1].type, 'вид дважды подряд');
      const free = o.x - (all[i - 1].x + all[i - 1].w);
      const d = o.gapY - exitGapY(all[i - 1]);
      assert.ok(d >= -MAX_UP * (free / 64) - 1 && d <= MAX_DOWN * (free / 64) + 1, `скачок ${d} при ${free}`);
    }
    // хитбоксы: в ширине препятствия и не залезают в проём (у диагонального — в свой проём каждой ступеньки)
    for (const r of obstacleRects(o)) {
      assert.ok(r.x >= 0 && r.x + r.w <= o.w && r.h > 0, `${o.type}/${r.part} за шириной`);
      const c = gapCenterAt(o, o.x + r.x);
      const inGap = r.y < Math.round(c + gap / 2) && r.y + r.h > Math.round(c - gap / 2);
      assert.ok(!inGap, `${o.type}/${r.part} в проёме`);
    }
  }
  assert.ok(widths.size >= 6, 'ширины разные');
  assert.ok(frees.size >= 20, 'расстояния разные');
  const diags = all.filter((o) => DIAGONAL.has(o.type));
  assert.ok(diags.length > 20 && diags.some((o) => o.slope > 0) && diags.some((o) => o.slope < 0), 'диагонали вверх и вниз');
  for (const o of diags) assert.equal(o.gap, DIAG_GAP);
  for (const scene of ['kitchen', 'street']) for (const t of TYPES[scene]) assert.ok(all.some((o) => o.type === t), t);
  // сцены: кухня → улица → кухня…, стена с дверью на каждой границе, в сцене SCENE_MIN…SCENE_MAX препятствий
  assert.ok(gates.length >= 15);
  assert.equal(gates[0].from, 'kitchen');
  gates.forEach((g, i) => {
    assert.notEqual(g.from, g.to);
    if (i) {
      assert.equal(g.from, gates[i - 1].to);
      const n = all.filter((o) => o.x > gates[i - 1].x && o.x < g.x).length;
      assert.ok(n >= SCENE_MIN && n <= SCENE_MAX, `в сцене ${n}`);
    }
    assert.ok(all.some((o) => o.type === 'door' && o.x === g.x));
  });
  for (const o of all) if (o.type !== 'door') assert.equal(o.scene, sceneAt({ ...s, gates }, o.x + o.w / 2));
  assert.equal(SLICE, 4);
});

test('старт после заставки: бургер «планирует» и сам проходит первый проём, первый взмах включает игру', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = seeded(seed);
    const s = newGame(rng);
    const first = s.obstacles[0];
    assert.ok(!DIAGONAL.has(first.type) && first.slope === 0, `зерно ${seed}: первый проём прямой`);
    assert.ok(Math.abs(first.gapY - (HOVER_Y + BURGER_H / 2)) <= 1, `зерно ${seed}: первый проём на высоте бургера`);
    step(s, 1.5, rng);                       // заставка: мир стоит
    assert.equal(s.dist, 0);
    launch(s);
    assert.equal(s.phase, 'glide');
    // игрок не нажимает — бургер держит высоту и проходит первое препятствие
    for (let t = 0; t < 8 && s.score < 1; t += 1 / 60) step(s, 1 / 60, rng);
    assert.equal(s.score, 1, `зерно ${seed}: первое препятствие пройдено без нажатий`);
    assert.equal(s.phase, 'glide');
    assert.ok(Math.abs(s.y - HOVER_Y) <= 3.01, 'высота держится');
    flap(s);
    assert.equal(s.phase, 'play', 'первый взмах включает гравитацию');
  }
});

test('проходимость: автопилот пролетает 300 препятствий на 40 зёрнах (диагонали, двери, кухни и улицы)', () => {
  // было 12 зёрен; перебор 300 нашёл редкие непроходимые места (минимальный зазор перед дверью,
  // резкий спуск после диагонали вверх) — исправлены в генераторе, проверка расширена
  for (let seed = 1; seed <= 40; seed++) {
    const rng = seeded(seed);
    const s = autopilot(newGame(rng), rng, 300);
    assert.equal(s.score, 300, `зерно ${seed}: разбился на ${s.score}`);
    assert.ok(s.visits.street >= 5, 'побывал на улице');
  }
});

test('столкновения: вытяжка, бак, ступенька диагонали, стена над дверью, пол; в проёме — нет', () => {
  const base = (obstacles) => ({ ...newGame(seeded(1)), phase: 'play', dist: 0, nextX: 1e9, obstacles, vy: 0 });
  const hood = { x: BURGER_X - 5, w: 28, gapY: 120, gap: GAP, slope: 0, scene: 'kitchen', type: 'hood', passed: false };
  const s = base([hood]);
  s.y = 120 - BURGER_H / 2;
  step(s, 1 / 120);
  assert.equal(s.phase, 'play', 'в проёме');
  s.y = 120 - GAP / 2 - 3;
  s.vy = 0;
  assert.ok(step(s, 1 / 120).includes('hit'), 'вытяжка');
  const t = base([{ ...hood, type: 'bins', scene: 'street' }]);
  t.y = 120 + GAP / 2 - BURGER_H + 3;
  assert.ok(step(t, 1 / 120).includes('hit'), 'мусорный бак');
  const duct = obstacleRects({ ...hood, gapY: 150 }).find((r) => r.part === 'duct');
  assert.ok(duct.x > 0 && duct.x + duct.w < hood.w, 'воздуховод уже колпака');
  // диагональ вниз: там, где слева проём, справа уже ступенька снизу
  const diag = { x: BURGER_X - 30, w: 48, gapY: 90, gap: DIAG_GAP, slope: 0.45, scene: 'street', type: 'stairs', passed: false };
  const dg = base([diag]);
  dg.y = gapCenterAt(diag, dg.dist + BURGER_X) - BURGER_H / 2;
  assert.ok(!step(dg, 1 / 120).includes('hit'), 'по центру проёма у этой ступеньки');
  const high = base([diag]);
  high.y = 90 - DIAG_GAP / 2 + 2;                        // у входа это в проёме, но бургер уже над 7-й ступенькой
  assert.ok(step(high, 1 / 120).includes('hit'), 'верхняя ступенька');
  // дверь: стена над проёмом — удар, в проёме у пола — нет
  const door = { x: BURGER_X - 5, w: OB_W, gapY: PLAY_H - DOOR_H / 2, gap: DOOR_H, slope: 0, scene: 'kitchen', to: 'street', type: 'door', passed: false };
  const d = base([door]);
  d.y = PLAY_H - 30;
  d.vy = -40;
  assert.ok(!step(d, 1 / 120).includes('hit'), 'в дверном проёме');
  d.y = PLAY_H - DOOR_H - 4;
  assert.ok(step(d, 1 / 120).includes('hit'), 'стена над дверью');
  const g = base([]);
  g.y = PLAY_H - BURGER_H - 1;
  g.vy = 200;
  assert.ok(step(g, 0.1).includes('over') && g.phase === 'over', 'пол');
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
