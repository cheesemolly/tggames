// Куча кружков «Слогов»: успокаивается, кружки не наезжают друг на друга и не выходят за поле — при любых кадрах.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, radiusOf, spawnPoint, unitFor } from '../physics.js';
import { TOPICS } from '../topics.js';
import { MAX_PIECES, pickWords, piecesOf, wordsIn } from '../logic.js';

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Поле width × height с кружками для текстов — как их расставляет игра. */
function pile(texts, width, height, seed = 1) {
  const rng = rngOf(seed);
  const world = createWorld(width, height);
  const unit = unitFor(texts, width, height);
  texts.forEach((text, k) => {
    const at = spawnPoint(k, texts.length, width, height, rng);
    world.add({ id: k, text, x: at.x, y: at.y, r: radiusOf(text, unit), tilt: (rng() - 0.5) * 30 });
  });
  return world;
}

const inside = (world) => world.bodies.every((b) => b.x >= b.r - 0.01 && b.x <= world.width - b.r + 0.01 && b.y >= b.r - 0.01 && b.y <= world.height - b.r + 0.01);
const finite = (world) => world.bodies.every((b) => [b.x, b.y, b.vx, b.vy, b.angle, b.spin].every(Number.isFinite));
const TEXTS = ['смо', 'ро', 'ди', 'на', 'ма', 'ли', 'на', 'виш', 'ня', 'чер', 'ни', 'ка', 'ар', 'буз', 'брус', 'ни', 'ка', 'е', 'же', 'ви', 'ка'];

test('размер кружка: длиннее слог — больше кружок, но не бесконечно', () => {
  assert.ok(radiusOf('брус', 20) > radiusOf('ка', 20));
  assert.ok(radiusOf('ка', 20) > radiusOf('е', 20));
  assert.equal(radiusOf('страсть', 20), radiusOf('страст', 20), 'после шести букв кружок не растёт');
  assert.equal(radiusOf('ка', 10) * 2, radiusOf('ка', 20));
  // в кружок помещается надпись: по ~0.6 unit на букву
  for (const t of ['е', 'ка', 'виш', 'брус', 'скрип', 'страст']) assert.ok(radiusOf(t, 20) * 2 >= t.length * 9 + 14, t);
});

test('масштаб: кружки занимают заданную долю поля и не выходят за пределы размера', () => {
  const unit = unitFor(TEXTS, 360, 440);
  const area = TEXTS.reduce((sum, t) => sum + Math.PI * radiusOf(t, unit) ** 2, 0);
  assert.ok(unit > 13 && unit < 27);
  assert.ok(Math.abs(area / (360 * 440) - 0.44) < 0.001);
  assert.equal(unitFor(['ка', 'ша'], 360, 440), 27, 'мало кружков — не раздуваются');
  assert.equal(unitFor(new Array(200).fill('страст'), 320, 300), 13, 'много — не мельчают до нечитаемых');
  assert.equal(unitFor([], 360, 440), 27);
});

test('куча собирается у середины, успокаивается, кружки не пересекаются и не выходят за поле', () => {
  for (const [w, h] of [[390, 520], [320, 330], [700, 420]]) {
    const world = pile(TEXTS, w, h, w);
    const spent = world.settle();
    assert.ok(spent < 12, `${w}×${h}: не успокоилась за ${spent} с`);
    assert.ok(world.asleep);
    assert.ok(world.overlap() < 1.5, `${w}×${h}: наложение ${world.overlap()}`);
    assert.ok(inside(world) && finite(world));
    const cx = world.bodies.reduce((a, b) => a + b.x, 0) / world.bodies.length;
    const cy = world.bodies.reduce((a, b) => a + b.y, 0) / world.bodies.length;
    assert.ok(Math.abs(cx - w / 2) < w * 0.08 && Math.abs(cy - h / 2) < h * 0.08, `${w}×${h}: куча не по центру (${cx}, ${cy})`);
    for (const b of world.bodies) assert.equal(b.angle, b.tilt, 'надпись вернулась к своему наклону');
  }
});

test('неровные кадры (и огрызки в доли миллисекунды) не разгоняют кружки', () => {
  const world = pile(TEXTS, 390, 520, 3);
  const rng = rngOf(99);
  let fastest = 0;
  let time = 0;
  while (time < 9) {
    // кадры от 0.2 до 40 мс, изредка — пауза вкладки
    const dt = rng() < 0.02 ? 1.5 : rng() < 0.3 ? 0.0002 + rng() * 0.002 : 0.004 + rng() * 0.036;
    world.step(dt);
    time += Math.min(dt, 0.1);
    for (const b of world.bodies) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
    assert.ok(finite(world));
    // кружки появляются у края и до первого шага могут торчать за него
    if (time > 0.05) assert.ok(inside(world));
  }
  assert.ok(fastest <= 1400 + 1e-6, `скорость ${fastest}`);
  assert.ok(world.asleep, 'куча уснула');
  assert.ok(world.overlap() < 1.5);
});

test('шаг: отрицательное и нулевое время ничего не двигает, длинная пауза не взрывает', () => {
  const world = pile(TEXTS, 390, 520, 4);
  const before = JSON.stringify(world.bodies);
  world.step(0);
  world.step(-5);
  world.step(NaN > 0 ? 1 : 0);
  assert.equal(JSON.stringify(world.bodies), before);
  world.step(0.001);
  assert.equal(JSON.stringify(world.bodies), before, 'меньше шага — копится');
  world.step(0.016);
  assert.notEqual(JSON.stringify(world.bodies), before);
  world.step(3600);
  assert.ok(finite(world) && inside(world));
});

test('кружки лопнули — куча смыкается; прилетели новые — раздвигается', () => {
  const world = pile(TEXTS, 390, 520, 5);
  world.settle();
  const spread = () => Math.max(...world.bodies.map((b) => Math.hypot(b.x - 195, b.y - 260) + b.r));
  const wide = spread();
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8]) world.remove(id);
  assert.equal(world.bodies.length, TEXTS.length - 9);
  assert.equal(world.get(0), null);
  assert.ok(!world.asleep, 'после удаления куча просыпается');
  world.settle();
  assert.ok(spread() < wide - 8, `${spread()} против ${wide}`);
  assert.ok(world.overlap() < 1.5);
  const tight = spread();
  const unit = unitFor(TEXTS, 390, 520);
  ['го', 'рил', 'ла'].forEach((text, k) => {
    const at = spawnPoint(k, 3, 390, 520, rngOf(k + 1));
    world.add({ id: 100 + k, text, x: at.x, y: at.y, r: radiusOf(text, unit) });
  });
  assert.ok(!world.asleep);
  world.settle();
  assert.ok(spread() > tight);
  assert.ok(world.overlap() < 1.5 && inside(world));
  assert.equal(world.get(101).text, 'рил');
  world.remove(9999);
  assert.equal(world.bodies.length, TEXTS.length - 9 + 3);
});

test('кружки точно один на другом расходятся, а не делят на ноль', () => {
  const world = createWorld(300, 300);
  for (let k = 0; k < 6; k++) world.add({ id: k, x: 150, y: 150, r: 24 });
  world.settle();
  assert.ok(finite(world));
  assert.ok(world.overlap() < 1.5, String(world.overlap()));
});

test('поле изменило размер — куча переезжает в новые границы', () => {
  const world = pile(TEXTS, 390, 520, 6);
  world.settle();
  world.resize(320, 300);
  assert.equal(world.width, 320);
  assert.equal(world.height, 300);
  assert.ok(!world.asleep);
  world.settle();
  assert.ok(inside(world));
  const cx = world.bodies.reduce((a, b) => a + b.x, 0) / world.bodies.length;
  assert.ok(Math.abs(cx - 160) < 30, String(cx));
});

test('точки появления — вокруг середины и внутри поля', () => {
  const rng = rngOf(8);
  const points = Array.from({ length: 12 }, (_, k) => spawnPoint(k, 12, 390, 520, rng));
  for (const p of points) {
    assert.ok(p.x > 0 && p.x < 390 && p.y > 0 && p.y < 520);
    assert.ok(Math.hypot(p.x - 195, p.y - 260) > 120, 'не в середине');
  }
  const angles = points.map((p) => Math.atan2(p.y - 260, p.x - 195));
  assert.ok(new Set(angles.map((a) => Math.round(a * 2))).size >= 6, 'со всех сторон');
  assert.ok(Number.isFinite(spawnPoint(0, 0, 390, 520, rng).x));
});

test('любой уровень любой темы помещается на маленьком экране без наложений', () => {
  // поле телефона 320 × 568: под кружки остаётся примерно 320 × 330
  let most = 0;
  TOPICS.forEach((t, index) => {
    const words = pickWords(t, wordsIn(index), rngOf(index + 11));
    const texts = piecesOf(words).map((p) => p.text);
    most = Math.max(most, texts.length);
    const world = pile(texts, 320, 330, index + 1);
    const spent = world.settle();
    assert.ok(spent < 12, `${t.id}: не успокоилась`);
    assert.ok(world.overlap() < 2, `${t.id}: наложение ${world.overlap().toFixed(2)} при ${texts.length} кружках`);
    assert.ok(inside(world), t.id);
  });
  assert.ok(most <= MAX_PIECES);
});
