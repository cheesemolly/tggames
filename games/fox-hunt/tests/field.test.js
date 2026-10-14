// Поле «Лисьей охоты»: полоса отступа со стороны Telegram не входит в поле, масштаб мира от неё не зависит.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripOf, fieldOf } from '../field.js';

const W = 844;
const H = 390;
const none = { top: 0, right: 0, bottom: 0, left: 0 };

test('turn 0 без отступов: полосы нет, поле — весь экран', () => {
  const f = fieldOf(W, H, none);
  assert.deepEqual(f.strip, { side: null, size: 0 });
  assert.equal(f.left, 0);
  assert.equal(f.w, W);
  assert.equal(f.h, H);
  assert.equal(f.base, H);
  assert.deepEqual(f.insets, none);
});

test('turn 90: самый большой отступ слева — полоса слева, поле после неё', () => {
  const f = fieldOf(W, H, { top: 10, right: 20, bottom: 12, left: 96 });
  assert.deepEqual(f.strip, { side: 'left', size: 96 });
  assert.equal(f.left, 96);
  assert.equal(f.w, W - 96);
  assert.equal(f.h, H);
  assert.deepEqual(f.insets, { top: 10, right: 20, bottom: 12, left: 0 });
});

test('turn −90: самый большой отступ справа — полоса справа, поле начинается с нуля', () => {
  const f = fieldOf(W, H, { top: 0, right: 88, bottom: 0, left: 14 });
  assert.deepEqual(f.strip, { side: 'right', size: 88 });
  assert.equal(f.left, 0);
  assert.equal(f.w, W - 88);
  assert.deepEqual(f.insets, { top: 0, right: 0, bottom: 0, left: 14 });
});

test('масштаб мира — по короткой стороне всего экрана, полоса его не меняет', () => {
  const full = fieldOf(W, H, none);
  const cut = fieldOf(W, H, { top: 0, right: 0, bottom: 0, left: 120 });
  assert.equal(cut.base, full.base);
  // даже узкое поле (уже, чем выше) считается по экрану
  assert.equal(fieldOf(400, 390, { top: 0, right: 0, bottom: 0, left: 200 }).base, 390);
});

test('верх и низ в полосу не идут; мусор в отступах — нулевая полоса', () => {
  assert.deepEqual(stripOf({ top: 80, right: 0, bottom: 80, left: 0 }), { side: null, size: 0 });
  assert.deepEqual(stripOf(null), { side: null, size: 0 });
  assert.deepEqual(stripOf({ left: NaN, right: -5 }), { side: null, size: 0 });
  assert.equal(stripOf({ left: 50, right: 50 }).side, 'left');
});

test('полоса не съедает поле целиком', () => {
  const f = fieldOf(100, 50, { top: 0, right: 0, bottom: 0, left: 500 });
  assert.ok(f.w >= 1);
});

test('index.js и ui.js пользуются полосой, цвет полосы — в game.css', () => {
  const idx = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  assert.match(idx, /fieldOf\(/);
  assert.match(idx, /renderer\.resize\(w, h, base\)/);
  assert.match(ui, /stripOf\(/);
  assert.match(css, /--fh-strip/);
});
