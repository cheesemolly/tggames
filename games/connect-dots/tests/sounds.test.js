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

test('прохождение уровня не «бьёт по ушам»: тише «плиньк» пары, без высоких нот, не больше пяти колокольчиков', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const peaks = (name) => {
    const before = created.length;
    const freqs = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { freqs.push(v); at(v, t); };
      return o;
    };
    sounds.play(name, { color: 9, step: 10 });
    ctx.createOscillator = orig;
    return { freqs, oscs: created.slice(before).filter((n) => n.kind === 'osc').length };
  };
  const cleared = peaks('cleared');
  // с обертонами колокольчика; у первой версии («ДЗЫНЬ!») самый высокий был ≈ 4400 Гц
  assert.ok(Math.max(...cleared.freqs) < 2000, `самая высокая частота ${Math.round(Math.max(...cleared.freqs))} Гц`);
  // колокольчик — 4 генератора (тон и обертоны), тёплый аккорд — по 2 на ноту: 5 × 4 + 3 × 2
  assert.ok(cleared.oscs <= 26, `генераторов ${cleared.oscs}`);
});

