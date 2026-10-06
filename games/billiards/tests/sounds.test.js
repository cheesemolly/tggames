// Звуки бильярда на поддельном AudioContext: каждый звучит, все узлы подключены, сильный удар громче тихого.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук бильярда звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { v: 0 }, { v: 1 }, { v: 7 }, { v: -3 }, { v: 'мусор' }]) {
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

/** Самая большая громкость, до которой звук доводит усилители. */
function peak(name, opts) {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  let top = 0;
  const orig = ctx.createGain;
  ctx.createGain = () => {
    const g = orig();
    const ramp = g.gain.exponentialRampToValueAtTime;
    g.gain.exponentialRampToValueAtTime = (v, t) => {
      top = Math.max(top, v);
      ramp(v, t);
    };
    return g;
  };
  sounds.play(name, opts);
  return top;
}

test('громкость — от силы: сильный удар громче тихого, а тихий стук почти не слышен', () => {
  for (const name of ['cue', 'ball', 'cushion']) {
    assert.ok(peak(name, { v: 1 }) > peak(name, { v: 0.1 }) * 1.5, name);
  }
  assert.ok(peak('ball', { v: 0 }) < 0.05);
  assert.ok(peak('ball', { v: 1 }) < 0.25, 'и сильный не бьёт по ушам');
});
