// Мяч-шар «Баскетбола»: диск со сглаженным краем, свет слева сверху, рисунок вертится вместе с мячом и
// возвращается на место после полного оборота; у каждого вида мяча свой рисунок.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALL_KINDS, texture, identity, rotate, settle, createBall } from '../ball.js';
import { LOOKS } from '../art.js';

const COLORS = { ball: 'rgb(240,138,44)', ball2: 'rgb(40,20,8)', ball3: 'rgb(255,255,255)', ball4: 'rgb(47,111,214)' };
const RGB = { ball: [240, 138, 44], ball2: [40, 20, 8], ball3: [255, 255, 255], ball4: [47, 111, 214] };
const SIZE = 64;
const RADIUS = 30;

function make(kind) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const body = createBall({ kind, colors: COLORS, size: SIZE, radius: RADIUS, data });
  return { data, body };
}
const pixel = (data, x, y) => [...data.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)];
const light = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
/** Цвет точки рисунка (без света) по направлению из центра мяча. */
function colorAt(kind, x, y, z, aa = 0.001, colors = RGB) {
  const out = [0, 0, 0];
  const n = Math.hypot(x, y, z);
  texture(kind, colors, out)(x / n, y / n, z / n, aa);
  return out.map(Math.round);
}

test('у каждой площадки — мяч из списка, и каждый вид рисуется', () => {
  for (const [skin, look] of Object.entries(LOOKS)) assert.ok(BALL_KINDS.includes(look.ball), skin);
  for (const kind of [...BALL_KINDS, 'нет такого']) {
    const { data, body } = make(kind);
    body.paint(identity());
    assert.ok(body.count > 2500, `${kind}: точек ${body.count}`);
    assert.ok(light(pixel(data, 32, 32)) > 20, `${kind}: середина не чёрная`);
  }
});

test('мяч — диск: внутри непрозрачен, снаружи пусто, край сглажен', () => {
  const { data, body } = make('classic');
  body.paint(identity());
  let soft = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2);
      const a = pixel(data, x, y)[3];
      if (d < RADIUS - 1) assert.equal(a, 255, `точка (${x}, ${y}) внутри`);
      else if (d > RADIUS + 1) assert.equal(a, 0, `точка (${x}, ${y}) снаружи`);
      else if (a > 0 && a < 255) soft += 1;
    }
  }
  assert.ok(soft > 60, 'у края есть полупрозрачные точки');
});

test('свет слева сверху: там мяч светлее, справа снизу — темнее, к краю — затемнение', () => {
  for (const kind of BALL_KINDS) {
    const { data, body } = make(kind);
    body.paint(identity());
    const zone = (cx, cy) => {
      let sum = 0;
      for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) sum += light(pixel(data, x, y));
      return sum / 81;
    };
    assert.ok(zone(22, 20) > zone(42, 44) * 1.25, `${kind}: свет ${zone(22, 20).toFixed(0)}, тень ${zone(42, 44).toFixed(0)}`);
  }
});

test('поворот: оси остаются единичными и перпендикулярными; четверть оборота вокруг z переводит x в y', () => {
  const m = rotate(identity(), 0, 0, 1, Math.PI / 2);
  // столбцы матрицы — куда на экране смотрят оси мяча
  assert.ok(Math.abs(m[0]) < 1e-12 && Math.abs(m[3] - 1) < 1e-12, 'ось x мяча теперь смотрит вниз экрана');
  const t = identity();
  for (let i = 0; i < 2000; i++) rotate(t, Math.sin(i), Math.cos(i * 0.7), 0.4, 0.07);
  settle(t);
  for (const [a, b] of [[0, 3], [0, 6], [3, 6]]) {
    assert.ok(Math.abs(t[a] * t[b] + t[a + 1] * t[b + 1] + t[a + 2] * t[b + 2]) < 1e-9, 'строки перпендикулярны');
  }
  for (const a of [0, 3, 6]) assert.ok(Math.abs(Math.hypot(t[a], t[a + 1], t[a + 2]) - 1) < 1e-9, 'строки единичные');
  const same = identity();
  assert.equal(rotate(same, 0, 0, 0, 1), same, 'без оси — без поворота');
  assert.deepEqual(rotate(identity(), 1, 0, 0, 0), identity());
});

test('рисунок вертится вместе с мячом и после полного оборота возвращается на место', () => {
  for (const kind of BALL_KINDS) {
    const a = make(kind);
    a.body.paint(identity());
    const start = [...a.data];
    const m = identity();
    rotate(m, 1, 0.4, 0.2, 0.9);
    a.body.paint(m);
    let moved = 0;
    for (let i = 0; i < start.length; i += 4) if (Math.abs(a.data[i] - start[i]) > 30) moved += 1;
    assert.ok(moved > 80, `${kind}: рисунок сдвинулся в ${moved} точках`);
    rotate(m, 1, 0.4, 0.2, Math.PI * 2 - 0.9);
    a.body.paint(m);
    // совпадает с точностью до округления; у кожи с зерном единичные точки на границе зёрен могут «перескочить»
    let off = 0;
    for (let i = 0; i < start.length; i++) if (Math.abs(a.data[i] - start[i]) > 2) off += 1;
    assert.ok(off <= 24, `${kind}: после полного оборота не совпало ${off} значений`);
  }
});

test('баскетбольный мяч: швы — крест через середину и два круга по бокам', () => {
  assert.deepEqual(colorAt('classic', 0, 0, 1), RGB.ball2, 'середина — на перекрестье швов');
  assert.deepEqual(colorAt('classic', 0, 0.5, 0.8), RGB.ball2, 'шов сверху вниз');
  assert.deepEqual(colorAt('classic', 0.4, 0, 0.9), RGB.ball2, 'шов поперёк');
  assert.deepEqual(colorAt('classic', 0.62, 0.4, 0.67), RGB.ball2, 'боковой шов');
  assert.deepEqual(colorAt('classic', -0.62, -0.3, 0.72), RGB.ball2, 'и с другой стороны');
  const skin = colorAt('classic', 0.3, 0.3, 0.9);
  assert.ok(Math.abs(skin[0] - RGB.ball[0]) < 16 && light(skin) > light(RGB.ball2) * 3, 'между швами — кожа (с зерном)');
  // зерно: соседние места чуть разного тона
  const tones = new Set();
  for (let i = 0; i < 40; i++) tones.add(colorAt('classic', 0.2 + i * 0.006, 0.3, 0.9)[0]);
  assert.ok(tones.size > 2);
  assert.deepEqual(colorAt('neon', 0.3, 0.3, 0.9), RGB.ball, 'у неонового зерна нет');
});

test('уличный мяч: восемь долек трёх цветов, соседние — разные', () => {
  const at = (sx, sy, cap) => colorAt('street', sx * (cap ? 0.85 : 0.3), sy * 0.35, 0.5);
  const inner = { pp: at(1, 1, 0), mp: at(-1, 1, 0), pm: at(1, -1, 0), mm: at(-1, -1, 0) };
  const cap = { pp: at(1, 1, 1), mp: at(-1, 1, 1), pm: at(1, -1, 1), mm: at(-1, -1, 1) };
  const all = [...Object.values(inner), ...Object.values(cap)].map(String);
  for (const c of all) assert.ok([RGB.ball, RGB.ball3, RGB.ball4].map(String).includes(c), `цвет дольки ${c}`);
  assert.equal(new Set(all).size, 3, 'все три цвета есть');
  for (const [a, b] of [[inner.pp, inner.mp], [inner.pp, inner.pm], [inner.mm, inner.mp], [inner.mm, inner.pm],
    [cap.pp, inner.pp], [cap.pm, inner.pm], [cap.mp, inner.mp], [cap.mm, inner.mm], [cap.pp, cap.pm], [cap.mp, cap.mm]]) {
    assert.notDeepEqual(a, b, 'соседние дольки одного цвета');
  }
});

test('надувной мяч: шесть долек вокруг оси, белые через одну, и белые шапочки', () => {
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    ring.push(colorAt('beach', Math.cos(a), Math.sin(a), 0.2));
  }
  assert.deepEqual(ring, [RGB.ball, RGB.ball3, RGB.ball4, RGB.ball3, RGB.ball2, RGB.ball3]);
  assert.deepEqual(colorAt('beach', 0.05, 0.05, 1), RGB.ball3);
  assert.deepEqual(colorAt('beach', 0.05, 0.05, -1), RGB.ball3);
  // на стыке долек цвет — между соседними (край сглажен)
  const edge = colorAt('beach', 1, 0.0005, 0.2, 0.05);
  assert.ok(edge[1] > RGB.ball[1] && edge[1] < RGB.ball3[1]);
});

test('луна: кратеры темнее поверхности, вокруг них светлый вал', () => {
  // ball — поверхность, ball3 — тёмное (дно кратеров, «моря»), ball4 — светлое (валы)
  const MOON = { ball: [200, 204, 214], ball2: [100, 104, 120], ball3: [140, 146, 166], ball4: [250, 250, 255] };
  const base = light(MOON.ball);
  assert.ok(light(colorAt('moon', 0.1, -0.2, 0.97, 0.001, MOON)) < base - 30, 'дно кратера');
  let rim = 0;
  let floor = 0;
  for (let i = 0; i < 4000; i++) {
    const z = 1 - (2 * i + 1) / 4000;
    const r = Math.sqrt(1 - z * z);
    const c = light(colorAt('moon', Math.cos(i * 2.4) * r, Math.sin(i * 2.4) * r, z, 0.001, MOON));
    if (c > base + 5) rim += 1;
    if (c < base - 30) floor += 1;
  }
  assert.ok(floor > 150 && floor < 2400, `тёмных мест ${floor}`);
  assert.ok(rim > 40, `светлых валов ${rim}`);
});
