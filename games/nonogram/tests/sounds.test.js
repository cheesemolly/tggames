// Звуки японского кроссворда на поддельном AudioContext: каждый звучит, все узлы подключены; мягкие — только
// синусы и треугольники; протяжка кистью идёт вверх по ступеням и не уходит в писк.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{ step: 0, count: 1 }, { step: 40, count: 2 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

function tonesOf(name, opts) {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    const set = o.frequency.setValueAtTime;
    o.frequency.setValueAtTime = (v, t) => { freqs.push(v); set(v, t); };
    return o;
  };
  const before = created.length;
  sounds.play(name, opts);
  return { freqs, types: created.slice(before).filter((n) => n.kind === 'osc').map((n) => n.type) };
}

test('звуки мягкие: только синусы и треугольники', () => {
  for (const name of SOUNDS) {
    const { types } = tonesOf(name, { step: 3, count: 2 });
    assert.ok(types.every((t) => t === 'sine' || t === 'triangle'), `${name}: ${types}`);
  }
});

test('кисть: каждая следующая клетка выше, длинная линия не уходит выше октавы', () => {
  const first = tonesOf('fill', { step: 0 }).freqs[0];
  const second = tonesOf('fill', { step: 1 }).freqs[0];
  assert.ok(second > first * 1.02, `${first} → ${second}`);
  const far = Math.max(...Array.from({ length: 60 }, (_, k) => tonesOf('fill', { step: k }).freqs[0]));
  assert.ok(far < first * 2.4, `самая высокая — ${Math.round(far)} при первой ${Math.round(first)}`);
});
