// Звуки маджонга («дзен») на поддельном AudioContext: каждый звучит, узлы подключены; касания плиток — глухие.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук маджонга звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [1, 2, 5, 12, 0]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('касания плиток глухие, без звона: все тоны ниже 800 Гц', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of ['select', 'deselect', 'blocked', 'undo', 'shuffle', 'deal']) {
    const freqs = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      const ramp = o.frequency.exponentialRampToValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { freqs.push(v); at(v, t); };
      o.frequency.exponentialRampToValueAtTime = (v, t) => { freqs.push(v); ramp(v, t); };
      return o;
    };
    sounds.play(name, { step: 4 });
    ctx.createOscillator = orig;
    assert.ok(freqs.every((f) => f < 800), `${name}: ${Math.round(Math.max(...freqs))} Гц`);
  }
});
