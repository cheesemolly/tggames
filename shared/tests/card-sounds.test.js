// Звуки пасьянсов (shared/card-sounds.js) на поддельном AudioContext: каждый звучит, все узлы подключены;
// движения карт — шум картона, а не ноты.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardSounds, CARD_SOUNDS } from '../card-sounds.js';
import { fakeContext } from './fake-audio.js';

test('каждый звук пасьянсов звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createCardSounds(ctx);
  for (const name of CARD_SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    const before = created.length;
    sounds.play(name, { step: 55, count: 10, rank: 7 });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
  }
});

test('карта легла, открылась, раздача — это шум картона, а не ноты', () => {
  const { ctx, created } = fakeContext();
  const sounds = createCardSounds(ctx);
  for (const name of ['pick', 'place', 'placeEmpty', 'flip', 'deal', 'undo']) {
    const before = created.length;
    sounds.play(name, { step: 55 });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'buffer'), `${name}: должен быть шум`);
  }
  // раздача — по щелчку на каждую карту
  for (const count of [3, 10, 28]) {
    const before = created.length;
    sounds.play('deal', { step: 40, count });
    assert.ok(created.slice(before).filter((n) => n.kind === 'buffer').length >= count, `раздача ${count}`);
  }
});
