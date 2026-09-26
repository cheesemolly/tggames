// Звуки «Слов из слова» на поддельном AudioContext: каждый звучит, узлы подключены, спад не до нуля.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';

function fakeContext() {
  const created = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v) { assert.ok(v > 0, 'экспоненциальный спад до нуля невозможен'); },
  });
  const node = (kind, extra = {}) => {
    const n = {
      kind, connections: 0,
      connect(target) { assert.ok(target, `${kind}: соединение в пустоту`); n.connections++; return target; },
      ...extra,
    };
    created.push(n);
    return n;
  };
  const source = (kind, extra) => node(kind, { start() {}, stop() {}, ...extra });
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    destination: { kind: 'destination' },
    createGain: () => node('gain', { gain: param() }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), ratio: param() }),
    createBiquadFilter: () => node('filter', { frequency: param(), Q: param(), type: '' }),
    createOscillator: () => source('osc', { frequency: param(), type: '' }),
    createBufferSource: () => source('buffer', { buffer: null, loop: false }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, created };
}

test('каждый звук игры звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [0, 3, 8, 20]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
  assert.doesNotThrow(() => sounds.play('нет-такого'));
});

test('буквы слова звучат ступенями вверх', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const freqs = [];
  for (let step = 0; step < 6; step++) {
    const before = created.length;
    const seen = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const set = o.frequency.exponentialRampToValueAtTime;
      o.frequency.exponentialRampToValueAtTime = (v, t) => { seen.push(v); set(v, t); };
      return o;
    };
    sounds.play('tap', { step });
    ctx.createOscillator = orig;
    assert.ok(created.length > before);
    freqs.push(seen[0]);
  }
  for (let i = 1; i < freqs.length; i++) assert.ok(freqs[i] > freqs[i - 1], `буква ${i + 1} выше предыдущей`);
});
