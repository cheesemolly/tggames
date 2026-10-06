// Звуки Арканоида на поддельном AudioContext: каждый звучит, все узлы подключены, квадратной волны нет;
// частые звуки (удар, стена, выстрел) — короткие, в один источник.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Арканоида звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 0 }, { step: 3 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
  assert.equal(sounds.has('нет такого'), false);
  sounds.play('нет такого');
});

test('ни одной квадратной (8-битной) волны', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    const before = created.length;
    sounds.play(name, { step: 2 });
    const types = created.slice(before).filter((n) => n.kind === 'osc').map((n) => n.type);
    assert.ok(!types.includes('square'), `${name}: квадратная волна`);
  }
});

test('частые звуки — в один источник', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of ['hit', 'metal', 'wall', 'paddle', 'break', 'laser']) {
    const before = created.length;
    sounds.play(name);
    const sources = created.slice(before).filter((n) => n.kind === 'osc' || n.kind === 'buffer');
    assert.equal(sources.length, 1, `${name}: источников ${sources.length}`);
  }
});
