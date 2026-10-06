// Рисование шара: ориентация крутится вместе с вращением, рисунок (цвет, номер, полоса, точки битка) — на месте.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identity, rotate, orthonormalize, randomOrientation, colorOf, pattern, shade, BALL_COLORS } from '../sphere.js';
import { R } from '../physics.js';

const col = (M, k) => [M[k], M[3 + k], M[6 + k]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function isRotation(M, eps = 1e-9) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!near(dot(col(M, i), col(M, j)), i === j ? 1 : 0, eps)) return false;
  const [a, b, c] = [col(M, 0), col(M, 1), col(M, 2)];
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return near(dot(cross, c), 1, eps);
}
/** Куда на экране попала точка шара p (в системе шара). */
const world = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];

test('поворот: матрица остаётся поворотом, без вращения не меняется', () => {
  const M = identity();
  assert.deepEqual(rotate(M, 0, 0, 0, 1), identity());
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };
  for (let k = 0; k < 5000; k++) rotate(M, rnd() * 80, rnd() * 80, rnd() * 80, 1 / 300);
  assert.ok(isRotation(M, 1e-6), 'после пяти тысяч шагов');
  M[0] += 0.01;
  M[4] -= 0.02;
  assert.ok(isRotation(orthonormalize(M), 1e-12), 'выправляется');
  assert.ok(isRotation(randomOrientation(), 1e-9));
});

test('качение: шар, катящийся вправо, поворачивает верхнюю точку вперёд и за длину окружности делает оборот', () => {
  // качение вправо со скоростью v: wy = v / R (как в physics.js)
  const v = 100;
  const M = identity();
  rotate(M, 0, v / R, 0, 0.001);
  // точка, что была сверху (на зрителя), сдвинулась вправо
  const top = world(M, [0, 0, 1]);
  assert.ok(top[0] > 0 && near(top[1], 0, 1e-12));
  // качение вниз по экрану: wx = −v / R — верх уходит вниз
  const N = identity();
  rotate(N, -v / R, 0, 0, 0.001);
  assert.ok(world(N, [0, 0, 1])[1] > 0);
  // полный оборот за время 2πR / v
  const steps = 2000;
  const T = (2 * Math.PI * R) / v;
  const full = identity();
  for (let k = 0; k < steps; k++) rotate(full, 0, v / R, 0, T / steps);
  for (let k = 0; k < 9; k++) assert.ok(near(full[k], identity()[k], 1e-9));
  // боковое вращение крутит рисунок в плоскости стола, верх остаётся верхом
  const spin = identity();
  rotate(spin, 0, 0, 3, 0.2);
  assert.ok(near(world(spin, [0, 0, 1])[2], 1, 1e-12));
  assert.ok(Math.abs(world(spin, [1, 0, 0])[1]) > 0.1);
});

test('рисунок: сплошной — цветной с белым кругом номера, полосатый — с белыми шапками, биток — с точками', () => {
  const out = [0, 0, 0];
  const ivory = BALL_COLORS[0];
  // сплошная тройка: сбоку цвет, на оси X — белый круг
  assert.deepEqual([...pattern(3, 0, 0, 1, null, out)], colorOf(3));
  assert.deepEqual([...pattern(3, 0, 1, 0, null, out)], colorOf(3));
  assert.deepEqual([...pattern(3, 1, 0, 0, null, out)], ivory);
  assert.deepEqual([...pattern(3, -1, 0, 0, null, out)], ivory);
  // полосатая одиннадцатая (цвет тройки): полоса вокруг оси Z цветная, «шапки» белые
  assert.deepEqual(colorOf(11), colorOf(3));
  assert.deepEqual([...pattern(11, 0, 1, 0, null, out)], colorOf(3));
  assert.deepEqual([...pattern(11, 0, 0, 1, null, out)], ivory);
  assert.deepEqual([...pattern(11, 0, 0, -1, null, out)], ivory);
  assert.deepEqual([...pattern(11, 1, 0, 0, null, out)], ivory, 'номер на полосе');
  // восьмёрка чёрная
  assert.ok(pattern(8, 0, 0, 1, null, out).every((c) => c < 40));
  // биток: белый, шесть красных точек по осям
  assert.deepEqual([...pattern(0, 0.6, 0.6, 0.53, null, out)], ivory);
  for (const p of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const c = pattern(0, p[0], p[1], p[2], null, out);
    assert.ok(c[0] > 150 && c[1] < 80, 'красная точка');
  }
  // цифра: чёрная там, где закрашено в картинке номера
  const digits = { size: 8, alpha: new Uint8Array(64).fill(0) };
  digits.alpha[4 * 8 + 4] = 255;                       // точка чуть правее и ниже центра
  const inked = pattern(3, 0.999, 0.02, 0.02, digits, out);
  assert.ok(inked.every((c) => c < 40), 'чернила');
  assert.deepEqual([...pattern(3, 0.999, -0.2, 0.2, digits, out)], ivory, 'рядом — белое поле');
  // с обратной стороны шара картинка зеркалится — цифра читается и там
  assert.ok(pattern(3, -0.999, -0.02, 0.02, digits, out).every((c) => c < 40));
});

test('картинка шара: круг со сглаженным краем, свет слева сверху, блик', () => {
  const size = 40;
  const data = new Uint8ClampedArray(size * size * 4);
  shade(data, size, identity(), 3);
  const px = (x, y) => [...data.slice((y * size + x) * 4, (y * size + x) * 4 + 4)];
  assert.equal(px(0, 0)[3], 0, 'углы прозрачны');
  assert.equal(px(size - 1, size - 1)[3], 0);
  assert.equal(px(20, 20)[3], 255);
  // край полупрозрачный
  let soft = 0;
  for (let i = 0; i < size * size; i++) if (data[i * 4 + 3] > 0 && data[i * 4 + 3] < 255) soft++;
  assert.ok(soft > 30, `сглаженных точек ${soft}`);
  // слева сверху светлее, чем справа снизу (одного цвета — красные)
  const lit = px(13, 12);
  const dark = px(29, 30);
  assert.ok(lit[0] > dark[0] + 30, `${lit[0]} и ${dark[0]}`);
  const body = px(20, 27);                               // в стороне от блика и от круга с номером
  assert.ok(body[0] > body[1] * 2 && body[0] > body[2] * 2, `красный шар: ${body}`);
  // блик — почти белая точка
  let brightest = 0;
  for (let i = 0; i < size * size; i++) brightest = Math.max(brightest, Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  assert.ok(brightest > 200, `блик ${brightest}`);
});

test('картинка меняется, когда шар поворачивается, и повторяется после полного оборота', () => {
  const size = 32;
  const a = shade(new Uint8ClampedArray(size * size * 4), size, identity(), 11).slice();
  const M = identity();
  rotate(M, 1, 0, 0, Math.PI / 2);
  const b = shade(new Uint8ClampedArray(size * size * 4), size, M, 11).slice();
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  assert.ok(diff > 500, `изменилось ${diff} значений`);
  rotate(M, 1, 0, 0, Math.PI * 1.5);
  const c = shade(new Uint8ClampedArray(size * size * 4), size, orthonormalize(M), 11);
  let same = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - c[i]) <= 1) same++;
  assert.equal(same, a.length);
});
