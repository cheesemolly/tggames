// Звуки шашек на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук шашек звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 1, bot: true }, { step: 5 }, { step: 12 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('ход бота звучит ниже хода игрока — на слух понятно, кто сходил', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const first = (opts) => {
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const ramp = o.frequency.exponentialRampToValueAtTime;
      o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); ramp(v, t); };
      return o;
    };
    sounds.play('move', opts);
    ctx.createOscillator = orig;
    return seen[0];
  };
  assert.ok(first({ bot: true }) < first({ bot: false }));
});
