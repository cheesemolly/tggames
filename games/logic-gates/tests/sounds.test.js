// Звуки «Логических схем» на поддельном AudioContext: каждый звучит, все узлы подключены, резких высоких нет.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 0 }, { step: 3, on: false }, { step: 40, on: true }, { step: -2 }, { step: 'мусор' }, null]) {
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

/** Все частоты, которые звук задаёт осцилляторам. */
function freqsOf(play) {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const seen = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    for (const method of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
      const set = o.frequency[method];
      if (typeof set !== 'function') continue;
      o.frequency[method] = (v, t) => {
        seen.push(v);
        set.call(o.frequency, v, t);
      };
    }
    return o;
  };
  play(sounds);
  return seen;
}

test('вентиль, пропустивший ток, звучит выше с каждым шагом по схеме; не пропустивший — глухо и низко', () => {
  const top = (step) => Math.max(...freqsOf((s) => s.play('gate', { step, on: true })));
  const steps = [0, 1, 2, 4, 7].map(top);
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k] > steps[k - 1], `шаг ${k}`);
  assert.equal(top(99), top(9), 'выше девятого шага звук не растёт');
  const dull = freqsOf((s) => s.play('gate', { step: 5, on: false }));
  assert.ok(Math.max(...dull) < 300, `вентиль без тока: ${Math.max(...dull)} Гц`);
});

test('частые звуки мягкие: детали, вентили и выключатель — без высоких тонов', () => {
  for (const name of ['pick', 'place', 'remove', 'deny', 'power', 'trip', 'click']) {
    const top = Math.max(...freqsOf((s) => s.play(name)));
    assert.ok(top <= 1100, `${name}: ${Math.round(top)} Гц`);
  }
  for (const step of [0, 5, 9]) {
    const top = Math.max(...freqsOf((s) => s.play('gate', { step, on: true })));
    assert.ok(top <= 2400, `вентиль на шаге ${step}: ${Math.round(top)} Гц`);
  }
});

test('лампы и звёзды звенят всё выше; неудача звучит ниже удачи', () => {
  const base = (name, step) => freqsOf((s) => s.play(name, { step }))[0];
  assert.ok(base('lamp', 0) < base('lamp', 1) && base('lamp', 1) < base('lamp', 2));
  assert.ok(base('star', 0) < base('star', 1) && base('star', 1) < base('star', 2));
  assert.ok(Math.max(...freqsOf((s) => s.play('wrong'))) < base('lamp', 0));
  assert.ok(Math.max(...freqsOf((s) => s.play('trip'))) < base('lamp', 0));
});
