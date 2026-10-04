// Звуки мастерской на поддельном AudioContext: каждый звучит, все узлы подключены; мягкие — только синусы
// и треугольники.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук мастерской звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { quality: 'quiet', k: 2 }, { quality: 'none', k: 7 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('звуки мягкие: только синусы и треугольники', () => {
  for (const name of SOUNDS) {
    const { ctx, created } = fakeContext();
    createSounds(ctx).play(name, {});
    const types = created.filter((n) => n.kind === 'osc').map((n) => n.type);
    assert.ok(types.every((t) => t === 'sine' || t === 'triangle'), `${name}: ${types}`);
  }
});
