// Звуки 2048 на поддельном AudioContext: каждый звучит, узлы подключены; «поп» слияния выше у больших плиток.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS, mergeStep } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук 2048 звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const [step, count] of [[4, 1], [128, 2], [2048, 3], [0, 1]]) {
      const before = created.length;
      sounds.play(name, { step, count });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('чем больше слитая плитка, тем выше «поп»', () => {
  assert.deepEqual([4, 8, 16, 1024, 2048].map(mergeStep), [0, 1, 2, 8, 9]);
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048].map((value) => {
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const ramp = o.frequency.exponentialRampToValueAtTime;
      o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); ramp(v, t); };
      return o;
    };
    sounds.play('merge', { step: value });
    ctx.createOscillator = orig;
    return seen[0];                        // куда «падает» тон «попа»
  });
  for (let i = 1; i < freqs.length; i++) assert.ok(freqs[i] > freqs[i - 1], `плитка ${2 ** (i + 2)} выше предыдущей`);
});
