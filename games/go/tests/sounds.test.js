// Звуки го на поддельном AudioContext: каждый звучит, все узлы подключены; взятие — по щелчку на камень (до 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук го звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    const before = created.length;
    sounds.play(name, { count: 3, opponent: true });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
  }
});

test('взятие: щелчков столько, сколько камней, но не больше шести', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const clicks = (count) => {
    const before = created.length;
    sounds.play('capture', { count });
    return created.slice(before).filter((n) => n.kind === 'buffer').length;
  };
  assert.equal(clicks(1), 1);
  assert.equal(clicks(4), 4);
  assert.equal(clicks(20), 6);
});
