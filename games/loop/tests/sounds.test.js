// Звуки «Петли» («дзен») на поддельном AudioContext и проверка «плитка сошлась с соседями».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { tileFits, N, E, S, W } from '../logic.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Петли» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [0, 3, 17, 99]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('поворот звучит низко и глухо — никакого звона (тоны ниже 400 Гц)', () => {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  for (let i = 0; i < 12; i++) {
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
    sounds.play('turn', { step: i });
    ctx.createOscillator = orig;
    assert.ok(freqs.length && freqs.every((f) => f < 400), `плитка ${i}: ${freqs.map(Math.round)}`);
  }
});

test('плитка сошлась, только когда каждый её конец встречает соседа', () => {
  // поле 2×2: угол ┌ (E|S) слева сверху, соседи — ┐ (W|S) и └ (N|E), ┘ (N|W)
  const solved = [E | S, W | S, N | E, N | W];
  for (let i = 0; i < 4; i++) assert.equal(tileFits(solved, 2, 2, i), true, `плитка ${i}`);
  const turned = [...solved];
  turned[1] = N | E;                      // правую верхнюю повернули концом к краю
  assert.equal(tileFits(turned, 2, 2, 1), false);
  assert.equal(tileFits(turned, 2, 2, 0), false, 'левая верхняя теперь смотрит в пустоту справа');
  assert.equal(tileFits(turned, 2, 2, 2), true, 'нижней левой это не мешает');
  assert.equal(tileFits([0, 0, 0, 0], 2, 2, 0), false, 'пустая клетка не «сходится»');
});
