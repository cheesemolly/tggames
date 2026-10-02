// Звуки сапёра на поддельном AudioContext: каждый звучит, все узлы подключены; мягкие — только синусы и
// треугольники (без квадратной волны и пилы); взрыв — низкий: тоны ниже 300 Гц, шум не выше 500 Гц.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук сапёра звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const count of [1, 12, 300]) {
      const before = created.length;
      sounds.play(name, { count });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

/** Что звучит в name: типы волн, частоты тонов и полос шума. */
function probe(name, opts = {}) {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const tones = [];
  const bands = [];
  const watch = (param, into) => {
    const set = param.setValueAtTime;
    const ramp = param.exponentialRampToValueAtTime;
    const lin = param.linearRampToValueAtTime;
    param.setValueAtTime = (v, t) => { into.push(v); set(v, t); };
    param.exponentialRampToValueAtTime = (v, t) => { into.push(v); ramp(v, t); };
    param.linearRampToValueAtTime = (v, t) => { into.push(v); lin(v, t); };
  };
  const osc = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = osc();
    watch(o.frequency, tones);
    return o;
  };
  const filt = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const f = filt();
    let v = 0;
    Object.defineProperty(f.frequency, 'value', { get: () => v, set: (x) => { v = x; bands.push(x); } });
    watch(f.frequency, bands);
    return f;
  };
  const before = created.length;
  sounds.play(name, opts);
  const nodes = created.slice(before);
  return { tones, bands, types: nodes.filter((n) => n.kind === 'osc').map((n) => n.type) };
}

test('звуки мягкие: только синусы и треугольники', () => {
  for (const name of SOUNDS) {
    const { types } = probe(name, { count: 20 });
    assert.ok(types.every((t) => t === 'sine' || t === 'triangle'), `${name}: ${types}`);
  }
});

test('взрыв низкий и глухой — тоны ниже 300 Гц, шум не выше 500 Гц', () => {
  const { tones, bands } = probe('boom');
  assert.ok(tones.length && tones.every((f) => f < 300), `тоны: ${tones.map(Math.round)}`);
  assert.ok(bands.every((f) => f <= 500), `полосы: ${bands.map(Math.round)}`);
});

test('раскрытие пустоты — не больше пяти нот, сколько бы клеток ни открылось', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const notes = (count) => {
    const before = created.length;
    sounds.play('cascade', { count });
    return created.slice(before).filter((n) => n.kind === 'osc').length;
  };
  assert.ok(notes(3) <= notes(400));
  assert.ok(notes(400) <= 6, `тонов: ${notes(400)}`);
});
