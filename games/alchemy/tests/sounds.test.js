// Звуки «Алхимии» на поддельном AudioContext: каждый звучит, все узлы подключены.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук «Алхимии» звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { step: 0 }, { step: 3 }, { step: 40 }, { step: -2 }, { step: 'мусор' }, null]) {
      const before = created.length;
      sounds.play(name, opts);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
  assert.equal(sounds.has('нет такого'), false);
  sounds.play('нет такого');
});

test('все звуки игры есть в наборе', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const used = new Set([...js.matchAll(/sfx\('([a-z]+)'/g)].map((m) => m[1]));
  for (const name of used) assert.ok(SOUNDS.includes(name), `в игре звук «${name}», а в наборе его нет`);
  // «recipe» и «known» играют по виду итога смешивания: sfx(res.kind)
  assert.match(js, /sfx\(res\.kind\)/);
  for (const name of SOUNDS) assert.ok(js.includes(`'${name}'`) || js.includes(`${name}:`), `звук «${name}» нигде не играет`);
});

/** Сколько осцилляторов заводит звук. */
function oscCount(name, opts) {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  const before = created.length;
  sounds.play(name, opts);
  return created.slice(before).filter((n) => n.kind === 'osc').length;
}

test('чем дальше элемент от стихий, тем богаче звук открытия; частые звуки — самые простые', () => {
  assert.ok(oscCount('new', { step: 1 }) < oscCount('new', { step: 4 }));
  assert.ok(oscCount('new', { step: 4 }) < oscCount('new', { step: 8 }));
  assert.equal(oscCount('new', { step: 99 }), oscCount('new', { step: 10 }));
  assert.equal(oscCount('pick'), 1);
  assert.equal(oscCount('known'), 1);
  assert.ok(oscCount('gift') > oscCount('quest'));
});
