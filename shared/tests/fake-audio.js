// Поддельный AudioContext для тестов звуков игр: запоминает созданные узлы и их подключения,
// ругается на соединение в пустоту и на экспоненциальный спад до нуля (Web Audio такого не умеет).

import assert from 'node:assert/strict';

export function fakeContext() {
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
