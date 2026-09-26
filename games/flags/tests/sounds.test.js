// Звуки «Флагов» на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Флагов» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 1, bot: true }, { step: 5 }, { step: 12 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('каждый пятый верный ответ подряд звучит богаче', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const size = (step) => {
    const before = created.length;
    sounds.play('right', { step });
    return created.length - before;
  };
  assert.ok(size(5) > size(4));
  assert.ok(size(10) > size(11));
});
