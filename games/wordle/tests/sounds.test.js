// Звуки Wordle на поддельном AudioContext: каждый звучит, узлы подключены; буквы и зелёные клетки идут вверх.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Wordle звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [0, 2, 4, 9]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

/** Первая частота, которую звук задаёт генератору (setValueAtTime у колокольчика, конечная у «плипа»). */
function firstFreq(ctx, fn) {
  const seen = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    const at = o.frequency.setValueAtTime;
    const ramp = o.frequency.exponentialRampToValueAtTime;
    o.frequency.setValueAtTime = (v, t) => { seen.push(['set', v]); at(v, t); };
    o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(['ramp', v]); ramp(v, t); };
    return o;
  };
  fn();
  ctx.createOscillator = orig;
  return (seen.find(([k]) => k === 'ramp') ?? seen[0])[1];
}

test('каждая следующая буква и каждая следующая зелёная клетка звучат выше', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of ['key', 'tile-correct']) {
    const freqs = [0, 1, 2, 3, 4].map((step) => firstFreq(ctx, () => sounds.play(name, { step })));
    for (let i = 1; i < freqs.length; i++) assert.ok(freqs[i] > freqs[i - 1], `${name}: клетка ${i + 1} выше предыдущей`);
  }
});
