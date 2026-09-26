// Звуки Brick Blast на поддельном AudioContext: каждый звучит, все узлы подключены; удар о блок — короткий и тихий (их сотни).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Brick Blast звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 1, color: 0, tier: 1, level: 1, lines: 1 }, { step: 200, color: 5, tier: 4, level: 4, lines: 4 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('удар о блок — один короткий тихий «тик» (ударов сотни), разбитый блок крепче — ниже', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const before = created.length;
  sounds.play('hit');
  assert.equal(created.slice(before).filter((n) => n.kind === 'osc').length, 1, 'один генератор');
  const low = (hp) => {
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const ramp = o.frequency.exponentialRampToValueAtTime;
      o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); ramp(v, t); };
      return o;
    };
    sounds.play('break', { step: hp });
    ctx.createOscillator = orig;
    return seen[0];
  };
  assert.ok(low(200) < low(5), 'крепкий блок звучит ниже');
});
