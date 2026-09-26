// Звуки судоку («дзен») на поддельном AudioContext: каждый звучит, узлы подключены; цифры, заметки и ластик —
// только шорох бумаги и грифеля, без единого тона (никаких «плиньк» — решение владельца).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS, DIGIT_STROKES } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук судоку звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const step of [1, 2, 5, 9, 0, 12]) {
      const before = created.length;
      sounds.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('цифры, заметки, ластик, подсказка — только бумага и карандаш, без тона', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of ['select', 'digit', 'note', 'erase', 'undo', 'hint', 'page', 'apply', 'pause', 'resume', 'fresh', 'click']) {
    const before = created.length;
    sounds.play(name, { step: 7 });
    assert.ok(!created.slice(before).some((n) => n.kind === 'osc'), `${name}: слышен тон — а должен быть только шорох`);
  }
});

test('у цифр разный рисунок штрихов: число штрихов — по цифре', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (let d = 1; d <= 9; d++) {
    const before = created.length;
    sounds.play('digit', { step: d });
    const noise = created.slice(before).filter((n) => n.kind === 'buffer').length;
    assert.equal(noise, DIGIT_STROKES[d].length, `цифра ${d}`);
  }
  assert.notDeepEqual(DIGIT_STROKES[1], DIGIT_STROKES[8]);
});
