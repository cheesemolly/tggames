// Звуки «Змейки» на поддельном AudioContext: каждый звучит, узлы подключены; «ням» и «юк» — голос
// (пила через форманты), остальное — 8-битные чипы; «ням» каждый раз чуть разный.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Змейки» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    const before = created.length;
    sounds.play(name);
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
  }
});

test('«ням» и «юк!» — голос: пила через два фильтра-форманта; «юк» ниже и кончается резким «к»', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const voiced = (name) => {
    const before = created.length;
    const pitches = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { pitches.push(v); at(v, t); };
      return o;
    };
    sounds.play(name);
    ctx.createOscillator = orig;
    const fresh = created.slice(before);
    return { saw: fresh.filter((n) => n.kind === 'osc' && n.type === 'sawtooth').length, filters: fresh.filter((n) => n.kind === 'filter').length, noise: fresh.filter((n) => n.kind === 'buffer').length, pitch: pitches[0] };
  };
  const nom = voiced('nom');
  const yuk = voiced('yuk');
  for (const v of [nom, yuk]) {
    assert.equal(v.saw, 1, 'один голос');
    assert.ok(v.filters >= 2, 'форманты');
  }
  assert.ok(yuk.pitch < nom.pitch, '«юк» ниже «ням»');
  assert.ok(yuk.noise >= 1, 'в конце «юк» — щелчок «к»');
});

test('сотый «ням» не звучит как первый: высота гуляет', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const pitches = new Set();
  for (let k = 0; k < 20; k++) {
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { if (o.type === 'sawtooth') pitches.add(Math.round(v)); at(v, t); };
      return o;
    };
    sounds.play('nom');
    ctx.createOscillator = orig;
  }
  assert.ok(pitches.size > 5, `разных высот: ${pitches.size}`);
});
