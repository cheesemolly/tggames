// Звуки Flappy Burger на поддельном AudioContext: каждый звучит, узлы подключены; всё 8-битное (без колокольчиков).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Flappy Burger звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [1, 9, 10, 20]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('всё аркадное: тоны только квадрат и треугольник (8-бит), синусов-колокольчиков нет', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS.filter((n) => n !== 'over')) {       // в падении — глухой «бум» (треугольник)
    const before = created.length;
    sounds.play(name, { step: 10 });
    const types = created.slice(before).filter((n) => n.kind === 'osc').map((n) => n.type);
    assert.ok(types.every((t) => t === 'square' || t === 'triangle'), `${name}: ${types}`);
  }
});

test('каждое десятое очко звучит иначе, чем обычное', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const count = (step) => {
    const before = created.length;
    sounds.play('score', { step });
    return created.slice(before).filter((n) => n.kind === 'osc').length;
  };
  assert.notEqual(count(10), count(7));
});
