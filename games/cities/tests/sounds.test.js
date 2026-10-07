// Звуки «Городов» на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Городов» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 0 }, { step: 3 }, { step: 400 }, { step: -2 }, { step: 'мусор' }, null]) {
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

test('город бота звучит ниже города игрока, последние секунды таймера — выше', () => {
  assert.ok(firstFreq((s) => s.play('bot')) < firstFreq((s) => s.play('accept')));
  assert.ok(firstFreq((s) => s.play('tick', { step: 2 })) > firstFreq((s) => s.play('tick', { step: 10 })));
  assert.ok(firstFreq((s) => s.play('erase')) < firstFreq((s) => s.play('key')));
});

test('клавиши звучат не одним тоном, но в узких пределах', () => {
  const tones = [0, 1, 2, 3, 4, 5, 6].map((step) => firstFreq((s) => s.play('key', { step })));
  assert.ok(new Set(tones).size >= 4);
  assert.ok(Math.max(...tones) / Math.min(...tones) < 1.35);
});
