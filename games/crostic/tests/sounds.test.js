// Звуки «Кростика» на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Кростика» звучит, все узлы подключены', () => {
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

test('чем больше клеток открыла буква, тем выше звук; звёзды звенят всё выше', () => {
  const hits = [1, 2, 3, 5, 8].map((step) => firstFreq((s) => s.play('hit', { step })));
  for (let k = 1; k < hits.length; k++) assert.ok(hits[k] > hits[k - 1], `клеток ${k}`);
  assert.equal(firstFreq((s) => s.play('hit', { step: 99 })), hits[hits.length - 1], 'выше восьми клеток звук не растёт');
  const stars = [0, 1, 2].map((step) => firstFreq((s) => s.play('star', { step })));
  assert.ok(stars[0] < stars[1] && stars[1] < stars[2]);
});

test('выбор клетки — самый тихий звук: он звучит при каждом касании', () => {
  const peakOf = (name) => {
    const { ctx, created } = fakeContext();
    const sounds = createSounds(ctx);
    const before = created.length;
    sounds.play(name);
    return created.slice(before).filter((n) => n.kind === 'osc').length;
  };
  assert.equal(peakOf('select'), 1);
  assert.ok(peakOf('win') > peakOf('word'));
  assert.ok(peakOf('word') > peakOf('select'));
});
