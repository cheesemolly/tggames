// Звуки пинбола на поддельном AudioContext: каждый звучит, все узлы подключены, ничего резкого — без квадратной
// волны, шум только через фильтр не выше 4 кГц; удары бампера идут вверх по пентатонике (серия — мелодия).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSounds, SOUNDS, noteOf } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук пинбола звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    ctx.currentTime += 1;                        // не упираться в «не чаще 35 мс»
    const before = created.length;
    sounds.play(name, { lane: 2, level: 0.7, speed: 0.5 });
    const fresh = created.slice(before);
    assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
    for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    assert.ok(!fresh.some((n) => n.kind === 'osc' && n.type === 'square'), `${name}: квадратная волна режет уши`);
  }
});

test('шум — только через фильтр не выше 4 кГц', () => {
  const { ctx, created } = fakeContext();
  const seen = [];
  const orig = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const f = orig();
    const set = f.frequency.setValueAtTime;
    f.frequency.setValueAtTime = (v, t) => { seen.push(v); set(v, t); };
    return f;
  };
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    ctx.currentTime += 1;
    sounds.play(name, {});
  }
  assert.ok(seen.length > 0);
  assert.ok(seen.every((f) => f <= 4000), `частоты фильтров: ${Math.max(...seen)}`);
  void created;
});

test('частые удары не трещат: бампер не чаще раза в 35 мс, серия идёт вверх по нотам', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  ctx.currentTime = 10;
  const before = created.length;
  sounds.play('bumper');
  const one = created.length - before;
  sounds.play('bumper');
  assert.equal(created.length - before, one, 'второй удар в тот же миг — без звука');
  assert.ok(noteOf(1) > noteOf(0) && noteOf(5) === noteOf(0) * 2, 'пентатоника: пятая ступень — октава');
});
