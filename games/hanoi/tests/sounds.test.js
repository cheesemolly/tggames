// Звуки башни на поддельном AudioContext: каждый звучит, все узлы подключены; мягкие — только синусы и
// треугольники; у каждого диска своя нота — чем меньше диск, тем выше.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS, diskNote } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук башни звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { disk: 0, n: 3 }, { disk: 9, n: 10, gap: 0.05 }]) {
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
    createSounds(ctx).play(name, { disk: 2, n: 6 });
    const types = created.filter((n) => n.kind === 'osc').map((n) => n.type);
    assert.ok(types.every((t) => t === 'sine' || t === 'triangle'), `${name}: ${types}`);
  }
});

test('нота диска: меньше диск — выше нота, самый большой — самый низкий', () => {
  for (const n of [3, 7, 10]) {
    const notes = Array.from({ length: n }, (_, d) => diskNote(d, n));
    for (let d = 1; d < n; d++) assert.ok(notes[d] < notes[d - 1], `${n}: диск ${d}`);
    assert.ok(notes[n - 1] > 100 && notes[0] < 2000);
  }
});
