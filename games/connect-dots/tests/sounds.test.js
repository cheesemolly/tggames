// Звуки «Соедини точки» на поддельном AudioContext: каждый звучит, узлы подключены; у цветов разные голоса.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS, colorNote } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Соедини точки» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const [color, step] of [[0, 1], [3, 5], [9, 40], [12, 0]]) {
      const before = created.length;
      sounds.play(name, { color, step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('у каждого из 10 цветов свой голос', () => {
  const notes = Array.from({ length: 10 }, (_, c) => colorNote(c));
  assert.equal(new Set(notes).size, 10);
  assert.equal(colorNote(10), colorNote(0), 'цвета идут по кругу');
});

test('длинная линия не улетает в писк: «тик» шага не выше двух октав над голосом цвета', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const seen = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    const ramp = o.frequency.exponentialRampToValueAtTime;
    o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); ramp(v, t); };
    return o;
  };
  for (let step = 1; step <= 64; step++) sounds.play('step', { color: 9, step });
  ctx.createOscillator = orig;
  assert.ok(Math.max(...seen) < 2500, `самый высокий «тик» ${Math.round(Math.max(...seen))} Гц`);
});
