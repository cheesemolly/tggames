// Звуки «Баскетбола» на поддельном AudioContext: каждый звучит, все узлы подключены, частые — мягкие,
// нота чистого попадания растёт вместе с серией.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { n: 1 }, { n: 40 }, { v: 0 }, { v: 5000 }, { power: 0 }, { power: 1 }, { n: 'мусор', v: 'мусор', power: NaN }, null, undefined]) {
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

/** Что звук задаёт осцилляторам (частоты) и усилителям (громкость). */
function trace(play) {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [];
  const gains = [];
  const spy = (make, key, into) => () => {
    const node = make();
    for (const method of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
      const set = node[key][method];
      node[key][method] = (v, t) => {
        into.push(v);
        set.call(node[key], v, t);
      };
    }
    return node;
  };
  ctx.createOscillator = spy(ctx.createOscillator, 'frequency', freqs);
  ctx.createGain = spy(ctx.createGain, 'gain', gains);
  play(sounds);
  return { freqs, gains, top: Math.max(0, ...freqs), loud: Math.max(0, ...gains) };
}

test('частые звуки мягкие: без высоких тонов', () => {
  for (const name of ['pull', 'shoot', 'wall', 'rim', 'net', 'score', 'back', 'fizzle', 'miss', 'click']) {
    for (const opts of [{ v: 60, power: 0 }, { v: 2000, power: 1 }]) {
      const { top } = trace((s) => s.play(name, opts));
      assert.ok(top <= 1400, `${name}: ${Math.round(top)} Гц`);
    }
  }
  for (const name of ['swish', 'bank', 'ignite', 'blue', 'record']) {
    // колокольчик: основной тон невысокий (обертоны тихие)
    const { freqs } = trace((s) => s.play(name, { n: 9 }));
    assert.ok(freqs[0] <= 1100, `${name}: основной тон ${Math.round(freqs[0])} Гц`);
  }
});

test('чистое попадание: нота растёт с серией и останавливается на десятом', () => {
  const tone = (n) => trace((s) => s.play('swish', { n })).freqs[0];
  for (let n = 2; n <= 10; n++) assert.ok(tone(n) > tone(n - 1), `серия ${n}`);
  assert.equal(tone(10), tone(25));
  assert.equal(tone(1), tone(0), 'мусор — как первое');
  assert.ok(tone(10) < 900);
});

test('дужка и стена: чем сильнее удар, тем громче; натяжение — чем сильнее, тем выше', () => {
  for (const name of ['rim', 'wall']) {
    const soft = trace((s) => s.play(name, { v: 80 })).loud;
    const hard = trace((s) => s.play(name, { v: 900 })).loud;
    assert.ok(hard > soft * 1.5, `${name}: ${soft} → ${hard}`);
    assert.ok(hard <= 0.31, `${name}: не громче остальных`);
  }
  assert.ok(trace((s) => s.play('pull', { power: 1 })).top > trace((s) => s.play('pull', { power: 0 })).top);
  assert.ok(trace((s) => s.play('pull', { power: 1 })).loud < 0.1, 'натяжение — тихое: оно звучит чаще всего');
});

test('мяч загорелся — звук вверх и аккорд; синее пламя — выше; промах — вниз', () => {
  const ignite = trace((s) => s.play('ignite')).freqs;
  const blue = trace((s) => s.play('blue')).freqs;
  assert.ok(ignite.length >= 3 && blue.length > ignite.length);
  assert.ok(Math.max(...blue) > Math.max(...ignite));
  const miss = trace((s) => s.play('miss')).freqs;
  assert.ok(miss[miss.length - 1] < miss[0]);
});

test('игра зовёт только те звуки, которые есть, — и каждый из них', () => {
  const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const called = new Set([...js.matchAll(/sfx\('([a-z]+)'/g)].map((m) => m[1]));
  for (const name of called) assert.ok(SOUNDS.includes(name), `в игре звук «${name}», которого нет`);
  for (const name of SOUNDS) assert.ok(called.has(name), `звук «${name}» нигде не звучит`);
});
