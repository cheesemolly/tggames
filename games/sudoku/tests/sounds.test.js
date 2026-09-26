// Звуки судоку на поддельном AudioContext: каждый звучит, узлы подключены; цифры 1…9 идут вверх.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук судоку звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [1, 2, 5, 9, 0, 12]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('у каждой цифры своя нота: 1 — ниже всех, 9 — выше всех', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((step) => {
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { seen.push(v); at(v, t); };
      return o;
    };
    sounds.play('digit', { step });
    ctx.createOscillator = orig;
    return seen[0];                    // основной тон колокольчика
  });
  for (let i = 1; i < freqs.length; i++) assert.ok(freqs[i] > freqs[i - 1], `цифра ${i + 1} выше цифры ${i}`);
});
