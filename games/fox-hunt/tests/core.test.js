// Лисья охота, основа расчёта: случайность от зерна, геометрия, сетка соседей, очередь событий, реестр.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  H, T, TAU, CAPS, REG, own, kindOf, itemDef, rnd, rand, randInt, chance, pickOf, rngFrom, rndOf, hash2,
  clamp, lerp, dist2, angDiff, segDist2, segCircle, inCone, inRing, createGrid, swapRemove, emit, sfx, banner, shake,
} from '../core.js';
import '../content.js';

// ---------- случайность ----------

test('случайность: одно зерно — один ряд чисел, все в пределах 0…1', () => {
  const a = { rs: 12345 };
  const b = { rs: 12345 };
  const c = { rs: 12346 };
  const row = [];
  let same = 0;
  for (let k = 0; k < 2000; k++) {
    const x = rnd(a);
    assert.equal(x, rnd(b));
    assert.ok(x >= 0 && x < 1);
    if (x === rnd(c)) same += 1;
    row.push(x);
  }
  assert.ok(same < 5, 'соседнее зерно даёт другой ряд');
  assert.ok(Number.isInteger(a.rs) && a.rs >= 0 && a.rs <= 0xffffffff, 'зерно остаётся uint32 — его можно сохранить');
  const mean = row.reduce((s, x) => s + x, 0) / row.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `среднее ${mean}`);
  const low = row.filter((x) => x < 0.1).length / row.length;
  assert.ok(low > 0.07 && low < 0.13, `доля малых ${low}`);
});

test('случайность: диапазоны, целые, выбор из списка', () => {
  const s = { rs: 7 };
  const seen = new Set();
  for (let k = 0; k < 500; k++) {
    const x = rand(s, -3, 8);
    assert.ok(x >= -3 && x < 8);
    const n = randInt(s, 2, 5);
    assert.ok(Number.isInteger(n) && n >= 2 && n <= 5);
    seen.add(n);
    assert.ok(['а', 'б', 'в'].includes(pickOf(s, ['а', 'б', 'в'])));
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5], 'границы целых достижимы');
  let hits = 0;
  for (let k = 0; k < 4000; k++) if (chance(s, 0.25)) hits += 1;
  assert.ok(hits > 880 && hits < 1120, `шанс 25 %: ${hits} из 4000`);
});

test('rngFrom: своя случайность генераторов — одинаковая от зерна и не трогает партию', () => {
  const a = rngFrom(99);
  const b = rngFrom(99);
  const c = rngFrom(100);
  const rowA = Array.from({ length: 50 }, () => a());
  assert.deepEqual(rowA, Array.from({ length: 50 }, () => b()));
  assert.notDeepEqual(rowA, Array.from({ length: 50 }, () => c()));
  assert.equal(rngFrom(0)(), rngFrom(1)(), 'нулевое зерно заменяется единицей');
  const r = rngFrom(5);
  for (let k = 0; k < 200; k++) {
    const n = r.int(1, 3);
    assert.ok(n >= 1 && n <= 3);
    assert.ok(r.range(2, 4) >= 2);
    assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
  }
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual([...r.shuffle([...list])].sort((x, y) => x - y), list, 'перемешивание ничего не теряет');
  assert.notDeepEqual(rngFrom(3).shuffle([...list]), list);
  const counts = { a: 0, b: 0, c: 0 };
  for (let k = 0; k < 3000; k++) counts[r.weighted(['a', 'b', 'c'], (x) => (x === 'a' ? 3 : x === 'b' ? 1 : 0))] += 1;
  assert.equal(counts.c, 0, 'нулевой вес не выпадает');
  assert.ok(counts.a > counts.b * 2.3 && counts.a < counts.b * 3.9, JSON.stringify(counts));
  assert.equal(r.weighted(['a'], () => 0), null);
});

test('rndOf: случайность партии в виде функции идёт от того же зерна, что и rnd', () => {
  const G = { rs: 4242 };
  const twin = { rs: 4242 };
  const r = rndOf(G);
  assert.equal(rndOf(G), r, 'функция одна на партию');
  assert.equal(r(), rnd(twin));
  assert.equal(rnd(G), rnd(twin), 'rnd и rndOf двигают одно зерно');
  assert.equal(r.int(0, 1000), randInt(twin, 0, 1000));
});

test('hash2: одно и то же из одних чисел, разное — из разных', () => {
  assert.equal(hash2(5, 9), hash2(5, 9));
  const seen = new Set();
  for (let a = 0; a < 40; a++) for (let b = 0; b < 40; b++) seen.add(hash2(a, b));
  assert.equal(seen.size, 1600, 'без совпадений на малых числах');
  assert.notEqual(hash2(1, 2), hash2(2, 1));
  for (const h of seen) assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});

// ---------- геометрия ----------

test('мелочи: clamp, lerp, расстояния', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(dist2(0, 0, 3, 4), 25);
  assert.equal(H, 1 / 60);
  assert.equal(T, 32);
});

test('angDiff: кратчайший поворот со знаком', () => {
  assert.ok(Math.abs(angDiff(0, Math.PI / 2) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(angDiff(Math.PI / 2, 0) + Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(angDiff(-3, 3) - (6 - TAU)) < 1e-12, 'через ±π ближе');
  assert.ok(Math.abs(angDiff(0.1, 0.1 + TAU * 3)) < 1e-9);
  for (let a = -10; a < 10; a += 0.37) {
    for (let b = -10; b < 10; b += 0.41) {
      const d = angDiff(a, b);
      assert.ok(d >= -Math.PI - 1e-9 && d <= Math.PI + 1e-9);
      assert.ok(Math.abs(Math.sin(a + d) - Math.sin(b)) < 1e-9 && Math.abs(Math.cos(a + d) - Math.cos(b)) < 1e-9);
    }
  }
});

test('отрезок и круг', () => {
  assert.equal(segDist2(0, 0, 10, 0, 5, 3), 9);
  assert.equal(segDist2(0, 0, 10, 0, -4, 3), 25, 'за концом — до конца');
  assert.equal(segDist2(0, 0, 10, 0, 14, -3), 25);
  assert.equal(segDist2(2, 2, 2, 2, 5, 6), 25, 'отрезок-точка');
  assert.ok(segCircle(0, 0, 10, 0, 5, 3, 3));
  assert.ok(!segCircle(0, 0, 10, 0, 5, 3.1, 3));
  // сверка с перебором точек отрезка
  const r = rngFrom(11);
  for (let k = 0; k < 300; k++) {
    const [x1, y1, x2, y2, px, py] = Array.from({ length: 6 }, () => r.range(-50, 50));
    let best = Infinity;
    for (let i = 0; i <= 400; i++) best = Math.min(best, dist2(x1 + ((x2 - x1) * i) / 400, y1 + ((y2 - y1) * i) / 400, px, py));
    assert.ok(Math.abs(Math.sqrt(segDist2(x1, y1, x2, y2, px, py)) - Math.sqrt(best)) < 0.2);
  }
});

test('сектор и кольцо', () => {
  const arc = Math.PI / 2;
  assert.ok(inCone(0, 0, 0, arc, 100, 50, 0));
  assert.ok(inCone(0, 0, 0, arc, 100, 50, 40), '38,7° — внутри раствора 90°');
  assert.ok(!inCone(0, 0, 0, arc, 100, 50, 60), '50° — снаружи');
  assert.ok(!inCone(0, 0, 0, arc, 100, 120, 0), 'дальше радиуса');
  assert.ok(inCone(0, 0, 0, arc, 100, 108, 0, 10), 'круг задевает край по радиусу');
  assert.ok(inCone(0, 0, 0, arc, 100, 50, 56, 8), 'круг задевает край по углу');
  assert.ok(!inCone(0, 0, 0, arc, 100, -30, 0), 'за спиной');
  assert.ok(inCone(0, 0, 0, arc, 100, -3, 0, 5), 'вершина внутри круга');
  assert.ok(inCone(0, 0, Math.PI, arc, 100, -50, 5), 'поворот на 180°');
  assert.ok(inCone(10, 10, -Math.PI / 2, arc, 100, 10, -40), 'вверх — отрицательный угол');
  assert.ok(inRing(0, 0, 50, 10, 52, 0));
  assert.ok(!inRing(0, 0, 50, 10, 30, 0), 'внутри дырки');
  assert.ok(!inRing(0, 0, 50, 10, 70, 0));
  assert.ok(inRing(0, 0, 50, 10, 0, 62, 8), 'с радиусом цели');
});

// ---------- сетка ----------

test('сетка соседей: находит всех, кто рядом (сверка с перебором)', () => {
  const r = rngFrom(21);
  const grid = createGrid(64, 512, 64);
  const out = new Int16Array(64);
  for (let round = 0; round < 40; round++) {
    const w = r.int(300, 800);
    const h = r.int(200, 480);
    const n = r.int(1, 48);
    const list = Array.from({ length: n }, () => ({ x: r.range(0, w), y: r.range(0, h), dead: r.chance(0.15) }));
    grid.build(list, n, w, h);
    for (let q = 0; q < 30; q++) {
      const x = r.range(-20, w + 20);
      const y = r.range(-20, h + 20);
      const rad = r.range(5, 90);
      const k = grid.query(x - rad, y - rad, x + rad, y + rad, out);
      const got = new Set(Array.from(out.subarray(0, k)));
      assert.equal(got.size, k, 'никто не назван дважды');
      for (let i = 0; i < n; i++) {
        const e = list[i];
        if (e.dead) {
          assert.ok(!got.has(i), 'мёртвых в сетке нет');
          continue;
        }
        if (Math.abs(e.x - x) <= rad && Math.abs(e.y - y) <= rad) assert.ok(got.has(i), 'тот, кто в прямоугольнике, найден');
      }
    }
  }
});

test('сетка соседей: края поля и переполнение не ломают', () => {
  const grid = createGrid(64, 8, 4);
  const out = new Int16Array(3);
  const list = [{ x: -50, y: -50 }, { x: 5000, y: 5000 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }];
  grid.build(list, list.length, 2000, 2000);                   // клеток и существ больше, чем помещается
  const k = grid.query(-1000, -1000, 9000, 9000, out);
  assert.ok(k <= 3, 'больше, чем влезает в out, не пишет');
  grid.build([], 0, 100, 100);
  assert.equal(grid.query(0, 0, 100, 100, out), 0);
});

// ---------- списки и события ----------

test('swapRemove: убирает один, остальные на месте (порядок не важен)', () => {
  const list = ['а', 'б', 'в', 'г'];
  swapRemove(list, 1);
  assert.deepEqual([...list].sort(), ['а', 'в', 'г']);
  swapRemove(list, list.length - 1);
  assert.equal(list.length, 2);
  swapRemove(list, 0);
  swapRemove(list, 0);
  assert.deepEqual(list, []);
});

test('события: очередь не растёт без конца, звук — обычное событие', () => {
  const G = { events: [], room: { shake: 0 } };
  sfx(G, 'dash', 10, 20, 3);
  assert.deepEqual(G.events[0], { t: 'sfx', id: 'dash', x: 10, y: 20, v: 3 });
  banner(G, 'Заголовок', 'подпись');
  assert.deepEqual(G.events[1], { t: 'banner', title: 'Заголовок', sub: 'подпись', kind: '' });
  shake(G, 0.5);
  shake(G, 0.2);
  assert.equal(G.room.shake, 0.5, 'слабая тряска сильную не перебивает');
  for (let k = 0; k < 5000; k++) emit(G, { t: 'x', k });
  assert.ok(G.events.length <= CAPS.events);
  assert.equal(G.events[G.events.length - 1].k, 4999, 'свежие события остаются');
});

// ---------- реестр ----------

test('реестр: вид вещи по id, чужие поля объектов за id не считаются', () => {
  assert.ok(Object.keys(REG.ROOMS).length > 0);
  for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', null, undefined, 5, {}]) {
    assert.equal(kindOf(bad), null, String(bad));
    assert.equal(itemDef(bad), null, String(bad));
  }
  assert.ok(own({ a: 1 }, 'a'));
  assert.ok(!own({ a: 1 }, 'toString'));
  assert.ok(!own({ 1: 1 }, 1), 'ключ — только строка');
});
