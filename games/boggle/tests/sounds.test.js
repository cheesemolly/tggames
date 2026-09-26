// Звуки Филворда на поддельном AudioContext: каждый звучит, узлы подключены; линия идёт вверх гаммой.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Филворда звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [0, 1, 5, 8, 30]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('чем длиннее линия, тем выше нота', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [];
  for (let step = 1; step <= 8; step++) {
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const set = o.frequency.exponentialRampToValueAtTime;
      o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); set(v, t); };
      return o;
    };
    sounds.play('drag', { step });
    ctx.createOscillator = orig;
    freqs.push(seen[0]);
  }
  for (let i = 1; i < freqs.length; i++) assert.ok(freqs[i] > freqs[i - 1], `буква ${i + 1} выше предыдущей`);
});
