// Звуки «Слогов» на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Слогов» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 0 }, { step: 3 }, { step: 40 }, { step: -2 }, { step: 'мусор' }, null]) {
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

/** Первая частота, до которой звук доводит осциллятор. */
function firstFreq(play) {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const seen = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    const set = o.frequency.setValueAtTime;
    o.frequency.setValueAtTime = (v, t) => { seen.push(v); set(v, t); };
    return o;
  };
  play(sounds);
  return seen[0];
}

test('каждый следующий слог звучит выше — и при выборе, и когда кружки лопаются', () => {
  for (const name of ['pick', 'unpick', 'pop']) {
    const steps = [0, 1, 2, 3, 4, 5].map((step) => firstFreq((s) => s.play(name, { step })));
    for (let k = 1; k < steps.length; k++) assert.ok(steps[k] > steps[k - 1], `${name}: слог ${k}`);
  }
});

test('звёзды звенят всё выше, последние секунды тикают выше обычных', () => {
  const stars = [0, 1, 2].map((step) => firstFreq((s) => s.play('star', { step })));
  assert.ok(stars[0] < stars[1] && stars[1] < stars[2]);
  assert.ok(firstFreq((s) => s.play('tick', { step: 2 })) > firstFreq((s) => s.play('tick', { step: 5 })));
});

test('длиннее слово — больше нот', () => {
  const count = (step) => {
    const { ctx, created } = fakeContext();
    const sounds = createSounds(ctx);
    const before = created.length;
    sounds.play('word', { step });
    return created.slice(before).filter((n) => n.kind === 'osc').length;
  };
  assert.ok(count(4) > count(2));
  assert.equal(count(99), count(5));
});
