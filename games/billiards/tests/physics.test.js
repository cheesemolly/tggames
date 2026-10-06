// Физика бильярда: стол, расстановка, столкновения, вращение (накат, оттяжка, винт), борта, лузы, прицел.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, L, R, D, STEP, V_MIN, V_MAX, HEAD_Y, HEAD_SPOT, FOOT_SPOT, POCKETS, POCKET_AIM, RAILS, JAWS, TIPS,
  powerToSpeed, rack, createSim, strike, step, run, positions, aimRay, laneClear, spotFree, nearestFree, nearestPocket,
} from '../physics.js';

function rngOf(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Стол с несколькими шарами: { номер: [x, y] }. */
function table(spots) {
  const balls = new Array(16).fill(null);
  for (const [id, at] of Object.entries(spots)) balls[id] = at;
  return balls;
}
function shot(balls, s, record = false) {
  const sim = createSim(balls, { record });
  strike(sim, { spin: [0, 0], ...s });
  return run(sim);
}
const UP = -Math.PI / 2;
const energy = (sim) => {
  let e = 0;
  for (let i = 0; i < sim.n; i++) {
    if (!sim.on[i]) continue;
    e += 0.5 * (sim.vx[i] ** 2 + sim.vy[i] ** 2) + 0.2 * R * R * (sim.wx[i] ** 2 + sim.wy[i] ** 2 + sim.wz[i] ** 2);
  }
  return e;
};

test('стол: 2 : 1, шесть луз, борта и губки симметричны', () => {
  assert.equal(L, 2 * W);
  assert.equal(D, 2 * R);
  assert.equal(POCKETS.length, 6);
  assert.equal(RAILS.length, 6);
  assert.equal(JAWS.length, 12);
  assert.equal(TIPS.length, 12);
  // у каждой губки и каждого борта есть зеркальные — слева направо и сверху вниз
  const key = (s) => [s.ax, s.ay, s.bx, s.by].map((v) => v.toFixed(3)).join(',');
  const all = new Set([...RAILS, ...JAWS].flatMap((s) => [key(s), key({ ax: s.bx, ay: s.by, bx: s.ax, by: s.ay })]));
  for (const s of [...RAILS, ...JAWS]) {
    assert.ok(all.has(key({ ax: W - s.ax, ay: s.ay, bx: W - s.bx, by: s.by })), 'зеркало по x');
    assert.ok(all.has(key({ ax: s.ax, ay: L - s.ay, bx: s.bx, by: L - s.by })), 'зеркало по y');
  }
  // нормали бортов смотрят на сукно, губок — в канал лузы
  for (const s of RAILS) {
    const mx = (s.ax + s.bx) / 2 + s.nx;
    const my = (s.ay + s.by) / 2 + s.ny;
    assert.ok(mx > 0 && mx < W && my > 0 && my < L);
  }
  // створ лузы шире шара с запасом, но не вдвое с лишним
  const corner = Math.hypot(TIPS[0][0] - 0, 0 - 0) * Math.SQRT2;
  assert.ok(corner > D * 1.8 && corner < D * 2.4, `угловая ${corner.toFixed(1)}`);
  for (const [k, aim] of POCKET_AIM.entries()) assert.equal(nearestPocket(aim[0], aim[1]), k);
});

test('сила удара: от тихого до самого сильного, шкала растёт', () => {
  assert.equal(powerToSpeed(0), V_MIN);
  assert.equal(powerToSpeed(1), V_MAX);
  assert.equal(powerToSpeed(5), V_MAX);
  assert.equal(powerToSpeed(-1), V_MIN);
  for (let p = 0.05; p <= 1; p += 0.05) assert.ok(powerToSpeed(p) > powerToSpeed(p - 0.05));
  assert.ok(powerToSpeed(0.5) < (V_MIN + V_MAX) / 2, 'внизу шкала растянута');
});

test('пирамида: 15 шаров вплотную, восьмёрка в середине, в задних углах — разные группы', () => {
  const balls = rack(rngOf(1));
  assert.equal(balls.length, 16);
  assert.deepEqual(balls[0], HEAD_SPOT);
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) assert.ok(Math.hypot(balls[i][0] - balls[j][0], balls[i][1] - balls[j][1]) >= D, `${i}–${j}`);
  }
  const byRow = balls.slice(1).map((b, k) => ({ id: k + 1, row: Math.round((FOOT_SPOT[1] - b[1]) / (Math.sqrt(3) * R)), x: b[0] }));
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => byRow.filter((b) => b.row === r).length), [1, 2, 3, 4, 5]);
  const third = byRow.filter((b) => b.row === 2).sort((a, b) => a.x - b.x);
  assert.equal(third[1].id, 8);
  const back = byRow.filter((b) => b.row === 4).sort((a, b) => a.x - b.x);
  assert.notEqual(back[0].id < 8, back[4].id < 8);
  // вершина — на дальней отметке, соседи касаются (зазор — волосок)
  const apex = byRow.find((b) => b.row === 0);
  assert.ok(Math.abs(balls[apex.id][0] - FOOT_SPOT[0]) < 0.02 && Math.abs(balls[apex.id][1] - FOOT_SPOT[1]) < 0.02);
  assert.ok(Math.hypot(balls[third[0].id][0] - balls[8][0], balls[third[0].id][1] - balls[8][1]) < D + 0.06);
  assert.deepEqual(rack(rngOf(1)), balls, 'одно зерно — одна расстановка');
  assert.notDeepEqual(rack(rngOf(2)), balls);
  // за много раздач каждая группа бывает в каждом заднем углу
  const left = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const b = rack(rngOf(seed));
    const row = b.slice(1).map((p, k) => ({ id: k + 1, p })).filter((o) => Math.abs(o.p[1] - (FOOT_SPOT[1] - 4 * (Math.sqrt(3) * R + 0.02))) < 0.1);
    left.add(row.sort((a, c) => a.p[0] - c.p[0])[0].id < 8);
  }
  assert.equal(left.size, 2);
});

test('один и тот же удар всегда даёт одно и то же; по шагам — то же, что целиком', () => {
  const balls = rack(rngOf(3));
  const s = { angle: UP + 0.003, power: 1, spin: [0.2, 0.3] };
  const a = shot(balls, s);
  const b = shot(balls, s);
  assert.deepEqual(positions(a), positions(b));
  assert.deepEqual(a.potted, b.potted);
  const c = createSim(balls);
  strike(c, s);
  let guard = 0;
  while (c.moving) {
    step(c);
    assert.ok(guard++ < 30000);
  }
  assert.deepEqual(positions(c), positions(a));
  assert.ok(Math.abs(c.t - a.t) < STEP);
  assert.ok(a.t > 3 && a.t < 20, `разбой длится ${a.t.toFixed(1)} с`);
});

test('разбой: шары не проходят друг сквозь друга и сквозь борта, энергия только убывает', () => {
  for (const seed of [1, 2, 3]) {
    const sim = createSim(rack(rngOf(seed)));
    strike(sim, { angle: UP + (seed - 2) * 0.004, power: 1, spin: [0, 0.2] });
    let prev = energy(sim);
    let hits = 0;
    while (sim.moving) {
      step(sim);
      const e = energy(sim);
      assert.ok(e <= prev * (1 + 1e-9) + 1e-6, `энергия выросла на ${sim.t.toFixed(3)} с`);
      prev = e;
      for (let i = 0; i < 16; i++) {
        if (!sim.on[i]) continue;
        // за линию борта шар заходит только в створе лузы
        const out = sim.x[i] < R - 1e-6 || sim.x[i] > W - R + 1e-6 || sim.y[i] < R - 1e-6 || sim.y[i] > L - R + 1e-6;
        if (out) {
          const p = POCKETS[nearestPocket(sim.x[i], sim.y[i])];
          assert.ok(Math.hypot(sim.x[i] - p.x, sim.y[i] - p.y) < 14, `шар ${i} за бортом вдали от лузы`);
        }
        for (let j = i + 1; j < 16; j++) {
          if (sim.on[j]) assert.ok(Math.hypot(sim.x[i] - sim.x[j], sim.y[i] - sim.y[j]) > D - 1e-6, `шары ${i} и ${j} друг в друге`);
        }
      }
    }
    hits = sim.events.filter((e) => e.type === 'ball').length;
    assert.ok(hits >= 15, `разбой ${seed}: соударений ${hits}`);
    assert.ok(sim.events.filter((e) => e.type === 'cushion').length >= 6);
    assert.ok(sim.firstHit > 0);
  }
});

test('разбой разбивает пирамиду: почти все шары уходят со своих мест (удар делится между соседями)', () => {
  let moved = 0;
  let games = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const balls = rack(rngOf(seed));
    const sim = shot(balls, { angle: UP + (seed % 3 - 1) * 0.003, power: 1, spin: [0, 0.15] });
    const after = positions(sim);
    for (let id = 1; id < 16; id++) if (!after[id] || Math.hypot(after[id][0] - balls[id][0], after[id][1] - balls[id][1]) > 15) moved++;
    games++;
  }
  assert.ok(moved / games > 11, `в среднем сдвинулось ${(moved / games).toFixed(1)} из 15`);
});

test('шар, упёршийся сразу в двух соседей, делит удар между ними поровну и отскакивает', () => {
  // биток в лоб в «вилку» из двух касающихся шаров
  const h = Math.sqrt(3) * R;
  const sim = createSim(table({ 0: [W / 2, 100 + h + 30], 1: [W / 2 - R - 0.001, 100], 2: [W / 2 + R + 0.001, 100] }));
  strike(sim, { angle: UP, power: 0.4, spin: [0, 0.8] });
  while (sim.firstHit < 0) step(sim);
  assert.ok(Math.abs(Math.hypot(sim.vx[1], sim.vy[1]) - Math.hypot(sim.vx[2], sim.vy[2])) < 1, 'поровну');
  assert.ok(Math.abs(sim.vx[1] + sim.vx[2]) < 1e-6 && sim.vx[1] < 0, 'в стороны');
  assert.ok(sim.vy[0] > 0, 'биток отскочил назад');
  assert.ok(Math.abs(sim.vx[0]) < 1e-6);
});

test('прямой удар: биток почти встаёт, прицельный шар уходит по линии удара', () => {
  const sim = createSim(table({ 0: [W / 2, 120], 1: [W / 2, 100] }));
  strike(sim, { angle: UP, power: 0.4, spin: [0, -0.2] });
  while (sim.firstHit < 0) step(sim);
  assert.equal(sim.firstHit, 1);
  const before = powerToSpeed(0.4);
  assert.ok(Math.abs(sim.vx[1]) < 1e-6);
  assert.ok(-sim.vy[1] > before * 0.85 && -sim.vy[1] < before, 'шар забрал почти всю скорость');
  assert.ok(Math.hypot(sim.vx[0], sim.vy[0]) < before * 0.05, 'биток почти встал');
});

test('резка: прицельный шар уходит по линии центров, биток — почти под прямым углом к ней', () => {
  for (const offset of [1.5, 2.8, 4.2]) {
    const sim = createSim(table({ 0: [W / 2, 130], 1: [W / 2 + offset, 100] }));
    strike(sim, { angle: UP, power: 0.5, spin: [0, -0.2] });
    while (sim.firstHit < 0) step(sim);
    // в момент касания центр битка — в D от шара
    const ray = aimRay(table({ 0: [W / 2, 130], 1: [W / 2 + offset, 100] }), W / 2, 130, UP);
    assert.equal(ray.type, 'ball');
    assert.ok(Math.abs(Math.hypot(ray.x - (W / 2 + offset), ray.y - 100) - D) < 1e-9);
    const v1 = Math.hypot(sim.vx[1], sim.vy[1]);
    assert.ok(Math.abs(sim.vx[1] / v1 - ray.nx) < 1e-3 && Math.abs(sim.vy[1] / v1 - ray.ny) < 1e-3, 'по линии центров');
    const v0 = Math.hypot(sim.vx[0], sim.vy[0]);
    const cos = (sim.vx[0] * ray.nx + sim.vy[0] * ray.ny) / v0;
    assert.ok(Math.abs(cos) < 0.12, `биток уходит вбок (cos ${cos.toFixed(3)})`);
    assert.ok(sim.vx[0] < 0, 'биток — в другую сторону от шара');
  }
});

test('удар в центр: шар сначала скользит, потом катится без проскальзывания на 5/7 скорости', () => {
  const sim = createSim(table({ 0: [W / 2, 190] }));
  strike(sim, { angle: UP, power: 0.5 });
  const v0 = powerToSpeed(0.5);
  let slipEnd = -1;
  for (let k = 0; k < 600 && slipEnd < 0; k++) {
    step(sim);
    if (Math.hypot(sim.vx[0] - R * sim.wy[0], sim.vy[0] + R * sim.wx[0]) < 1e-6) slipEnd = sim.t;
  }
  assert.ok(slipEnd > 0.02 && slipEnd < 1, `скольжение кончилось на ${slipEnd.toFixed(3)} с`);
  const v = Math.hypot(sim.vx[0], sim.vy[0]);
  assert.ok(Math.abs(v - (5 / 7) * v0) < v0 * 0.01, `скорость ${v.toFixed(1)} при ${((5 / 7) * v0).toFixed(1)}`);
  assert.ok(Math.abs(sim.wx[0] + sim.vy[0] / R) < 1e-6, 'вращение — под качение');
  // удар на 0,4 радиуса выше центра — катится сразу
  const top = createSim(table({ 0: [W / 2, 190] }));
  strike(top, { angle: UP, power: 0.5, spin: [0, 0.8] });
  assert.ok(Math.hypot(top.vx[0] - R * top.wy[0], top.vy[0] + R * top.wx[0]) < 1e-9);
});

test('накат, «стоп» и оттяжка: после прямого удара биток идёт вперёд, стоит или возвращается', () => {
  const end = (spin) => {
    const sim = createSim(table({ 0: [W / 2, 130], 1: [W / 2, 105] }), { record: false });
    strike(sim, { angle: UP, power: 0.32, spin });
    // до первого борта: смотрим на биток через 1,2 с
    while (sim.t < 1.2) step(sim);
    return sim.y[0];
  };
  const contact = 105 + D;
  const follow = end([0, 0.9]);
  const stop = end([0, -0.38]);
  const draw = end([0, -0.95]);
  assert.ok(follow < contact - 15, `накат: ${follow.toFixed(1)}`);
  assert.ok(Math.abs(stop - contact) < 8, `стоп: ${stop.toFixed(1)}`);
  assert.ok(draw > contact + 15, `оттяжка: ${draw.toFixed(1)}`);
});

test('боковое вращение: от борта биток уходит в сторону винта, без винта — назад по прямой', () => {
  const end = (side) => {
    const sim = shot(table({ 0: [W / 2, 70] }), { angle: UP, power: 0.25, spin: [side, 0] });
    return sim.x[0];
  };
  assert.ok(Math.abs(end(0) - W / 2) < 1e-6);
  const right = end(0.9);
  const left = end(-0.9);
  assert.ok(right > W / 2 + 8, `правый винт: ${right.toFixed(1)}`);
  assert.ok(Math.abs((right - W / 2) + (left - W / 2)) < 1e-6, 'влево — зеркально');
  // слабее винт — меньше уход
  assert.ok(end(0.4) < right);
});

test('борт: шар отскакивает внутрь, теряет скорость, сильный удар теряет больше', () => {
  const bounce = (power) => {
    const sim = createSim(table({ 0: [W / 2, 30] }));
    strike(sim, { angle: UP, power, spin: [0, 0.8] });
    let vin = 0;
    while (!sim.events.some((e) => e.type === 'cushion')) {
      vin = Math.hypot(sim.vx[0], sim.vy[0]);
      step(sim);
    }
    assert.ok(sim.vy[0] > 0, 'после борта — обратно');
    return sim.vy[0] / vin;
  };
  const slow = bounce(0.15);
  const fast = bounce(1);
  assert.ok(slow > 0.75 && slow < 0.9, `тихо: ${slow.toFixed(2)}`);
  assert.ok(fast > 0.6 && fast < slow, `сильно: ${fast.toFixed(2)}`);
  // под углом: вдоль борта шар продолжает идти в ту же сторону
  const sim = createSim(table({ 0: [30, 30] }));
  strike(sim, { angle: UP + 0.6, power: 0.4, spin: [0, 0.8] });
  while (!sim.events.some((e) => e.type === 'cushion')) step(sim);
  assert.ok(sim.vx[0] > 0 && sim.vy[0] > 0);
});

test('шары не покидают стол: тысяча случайных ударов по одному шару', () => {
  const rng = rngOf(5);
  for (let k = 0; k < 1000; k++) {
    const sim = shot(table({ 0: [R + rng() * (W - D), R + 12 + rng() * (L - D - 24)] }), { angle: rng() * Math.PI * 2, power: rng(), spin: [rng() * 2 - 1, rng() * 2 - 1] });
    if (sim.on[0]) {
      assert.ok(sim.x[0] > -R && sim.x[0] < W + R && sim.y[0] > -R && sim.y[0] < L + R);
      assert.ok(POCKETS.every((p) => Math.hypot(sim.x[0] - p.x, sim.y[0] - p.y) >= p.r));
    } else {
      assert.equal(sim.potted.length, 1);
    }
    assert.ok(sim.t < 60);
  }
});

test('лузы: прямой удар кладёт шар в каждую из шести', () => {
  for (let k = 0; k < 6; k++) {
    const aim = POCKET_AIM[k];
    // шар в 35 см от лузы по её оси, биток ещё в 30 см за ним
    const ax = k < 4 ? (aim[0] < W / 2 ? 1 : -1) * Math.SQRT1_2 : (aim[0] < W / 2 ? 1 : -1);
    const ay = k < 4 ? (aim[1] < L / 2 ? 1 : -1) * Math.SQRT1_2 : 0;
    const ball = [aim[0] + ax * 35, aim[1] + ay * 35];
    const cue = [aim[0] + ax * 65, aim[1] + ay * 65];
    for (const power of [0.25, 0.5, 0.9]) {
      const sim = shot(table({ 0: cue, 1: ball }), { angle: Math.atan2(-ay, -ax), power, spin: [0, -0.5] });
      assert.deepEqual(sim.potted.map((p) => [p.id, p.pocket]).slice(0, 1), [[1, k]], `луза ${k}, сила ${power}`);
    }
  }
});

test('лузы: шар вдоль борта падает в угловую и проходит мимо средней', () => {
  // по левому борту вверх: мимо средней лузы и в левую верхнюю
  const sim = shot(table({ 0: [R + 0.01, 150] }), { angle: UP, power: 0.45, spin: [0, 0.8] }, true);
  assert.deepEqual(sim.potted.map((p) => [p.id, p.pocket]), [[0, 0]]);
  // под углом в губку средней лузы — отскок, шар остаётся на столе
  const jaw = shot(table({ 0: [40, 60] }), { angle: Math.atan2(L / 2 - 6.6 - 60 + 1.2, -40), power: 0.4, spin: [0, 0.8] });
  assert.equal(jaw.on[0], 1);
});

test('прицел: первое касание — шар, борт или луза; дорожка и свободное место', () => {
  const balls = table({ 0: [W / 2, 150], 1: [W / 2, 100], 2: [20, 150] });
  const straight = aimRay(balls, W / 2, 150, UP);
  assert.equal(straight.type, 'ball');
  assert.equal(straight.ball, 1);
  assert.ok(Math.abs(straight.dist - (50 - D)) < 1e-9);
  assert.ok(Math.abs(straight.cut - 1) < 1e-9, 'в лоб');
  assert.ok(Math.abs(straight.nx) < 1e-9 && Math.abs(straight.ny + 1) < 1e-9);
  const side = aimRay(balls, W / 2, 150, Math.PI);
  assert.equal(side.ball, 2);
  const rail = aimRay(balls, W / 2, 150, 0);
  assert.equal(rail.type, 'cushion');
  assert.ok(Math.abs(rail.x - (W - R)) < 1e-9);
  assert.deepEqual([rail.nx, rail.ny], [-1, 0]);
  const pocket = aimRay(table({ 0: [30, 30] }), 30, 30, Math.atan2(-1, -1));
  assert.equal(pocket.type, 'pocket');
  assert.equal(pocket.pocket, 0);
  const thin = aimRay(balls, W / 2, 150, UP + Math.asin((D - 0.2) / 50));
  assert.equal(thin.type, 'ball');
  assert.ok(thin.cut < 0.3, 'тонкая резка');
  assert.equal(aimRay(balls, W / 2, 150, UP + Math.asin((D + 0.2) / 50)).ball, -1, 'мимо шара');

  assert.equal(laneClear(balls, W / 2, 150, W / 2, 20, [0]), false);
  assert.equal(laneClear(balls, W / 2, 150, W / 2, 20, [0, 1]), true);
  assert.equal(laneClear(balls, W / 2, 150, W / 2, 104, [0]), false, 'шар задевает конец дорожки');
  assert.equal(laneClear(balls, W / 2, 150, W / 2, 110, [0]), true);
  assert.equal(laneClear(balls, W / 2, 150, 80, 150, [0]), true);

  assert.equal(spotFree(balls, 60, 60), true);
  assert.equal(spotFree(balls, W / 2 + 3, 100), false, 'на шаре');
  assert.equal(spotFree(balls, 1, 60), false, 'в борту');
  assert.equal(spotFree(balls, 4, 4), false, 'в створе лузы');
  assert.equal(spotFree(balls, W / 2, 150, 0), true, 'свой шар не мешает');
  assert.deepEqual(nearestFree(balls, 60, 60), [60, 60]);
  const near = nearestFree(balls, W / 2, 100, 5);
  assert.ok(spotFree(balls, near[0], near[1], 5));
  assert.ok(Math.hypot(near[0] - W / 2, near[1] - 100) < D + 2);
  const below = nearestFree(balls, W / 2, 100, 5, (x, y) => y >= HEAD_Y);
  assert.ok(below[1] >= HEAD_Y);
});
