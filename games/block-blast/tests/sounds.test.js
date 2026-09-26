// Звуки Block Blast на поддельном AudioContext: каждый звучит, все узлы подключены; сгорание богаче с каждой ступенью эффектов.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук Block Blast звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 1, color: 0, tier: 1, level: 1, lines: 1 }, { step: 200, color: 5, tier: 4, level: 4, lines: 4 }]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('сгорание линий: чем выше ступень эффектов, тем больше звуков', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const size = (level) => {
    const before = created.length;
    sounds.play('clear', { step: 2, level, lines: 1 });
    return created.length - before;
  };
  const sizes = [1, 2, 3, 4].map(size);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], `ступень ${i + 1}: ${sizes}`);
});
