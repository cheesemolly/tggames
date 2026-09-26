import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShow, ringCells, letterPose, MIN_MS, MAX_MS } from '../splash.js';

test('заставка: в бете — только тому, у кого отметка (или ?owner на localhost), после релиза — всем', () => {
  assert.equal(shouldShow({ released: false, marked: false, localOwner: false }), false);
  assert.equal(shouldShow({ released: false, marked: true, localOwner: false }), true);
  assert.equal(shouldShow({ released: false, marked: false, localOwner: true }), true);
  assert.equal(shouldShow({ released: true, marked: false, localOwner: false }), true);
  assert.ok(MIN_MS < MAX_MS);
});

test('заставка: кольцо змейки замкнуто, клетки соседние только по стороне, без повторов', () => {
  const ring = ringCells(22, 52, 10);
  assert.ok(ring.length > 40);
  const seen = new Set();
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length];
    assert.equal(Math.abs(nx - x) + Math.abs(ny - y), 1, `шаг ${i}: (${x},${y}) → (${nx},${ny})`);
    assert.ok(x >= 0 && x < 45 && y >= 0 && y < 80, 'внутри кадра');
    seen.add(`${x},${y}`);
  });
  assert.equal(seen.size, ring.length, 'змейка не проходит одну клетку дважды');
});

test('заставка: буквы появляются по очереди и к концу сборки видны все', () => {
  assert.equal(letterPose(0, 0.05).hide, undefined);
  assert.equal(letterPose(6, 0.05).hide, true);
  for (let i = 0; i < 7; i++) assert.equal(letterPose(i, MIN_MS / 1000).hide, undefined, `буква ${i} видна к ${MIN_MS} мс`);
});
