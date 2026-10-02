// Звуки пятнашек на поддельном AudioContext: каждый звучит, все узлы подключены; мягкие — только синусы и
// треугольники; ход и «нельзя» — без звона (тоны ниже 1000 Гц); ряд из многих плиток — не больше пяти щелчков.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук пятнашек звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { count: 1, step: 0 }, { count: 7, step: 6 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

function probe(name, opts = {}) {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const tones = [];
  const osc = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = osc();
    const set = o.frequency.setValueAtTime;
    const ramp = o.frequency.exponentialRampToValueAtTime;
    o.frequency.setValueAtTime = (v, t) => { tones.push(v); set(v, t); };
    o.frequency.exponentialRampToValueAtTime = (v, t) => { tones.push(v); ramp(v, t); };
    return o;
  };
  const before = created.length;
  sounds.play(name, opts);
  const nodes = created.slice(before).filter((n) => n.kind === 'osc');
  return { tones, types: nodes.map((n) => n.type), count: nodes.length };
}

test('звуки мягкие: только синусы и треугольники; ход и «нельзя» — без звона', () => {
  for (const name of SOUNDS) {
    const { types } = probe(name, { count: 5 });
    assert.ok(types.every((t) => t === 'sine' || t === 'triangle'), `${name}: ${types}`);
  }
  for (const name of ['move', 'multi', 'blocked']) {
    const { tones } = probe(name, { count: 4 });
    assert.ok(tones.length && tones.every((f) => f < 1000), `${name}: ${tones.map(Math.round)}`);
  }
});

test('ряд плиток — щелчок на плитку, но не больше пяти', () => {
  const clicks = (count) => probe('multi', { count }).count;
  assert.ok(clicks(2) < clicks(4));
  assert.equal(clicks(7), clicks(5));
});
