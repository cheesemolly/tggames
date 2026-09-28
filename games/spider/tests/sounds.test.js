// Звуки Паука на поддельном AudioContext: каждый звучит, все узлы подключены; карты — шум картона, без мелодий.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Паука звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    const before = created.length;
    sounds.play(name, { step: 55 });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
  }
});

test('карта легла, открылась, раздача — это шум картона, а не ноты', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of ['pick', 'place', 'placeEmpty', 'flip', 'deal', 'undo']) {
    const before = created.length;
    sounds.play(name, { step: 55 });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'buffer'), `${name}: должен быть шум`);
    const tones = fresh.filter((n) => n.kind === 'osc').map((n) => n.frequency.value);
    assert.ok(tones.every((f) => f < 400), `${name}: звенит (${tones})`);
  }
  // раздача — по щелчку на каждую из 10 карт
  const before = created.length;
  sounds.play('deal', { step: 55 });
  assert.ok(created.slice(before).filter((n) => n.kind === 'buffer').length >= 10);
});
