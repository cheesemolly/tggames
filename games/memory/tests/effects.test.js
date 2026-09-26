// Звуковые эффекты Мемори на поддельном AudioContext: каждый звучит, узлы подключены;
// карта — это шорох картона (шум), а не нота; веер раздачи растёт с числом карт.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEffects, EFFECTS } from '../effects.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый эффект Мемори звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const fx = createEffects(ctx);
  for (const name of EFFECTS) {
    assert.ok(fx.has(name), `нет эффекта ${name}`);
    for (const step of [1, 2, 5, 12, 36]) {
      const before = created.length;
      fx.play(name, { step });
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${name}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${name}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});

test('переворот карты — шорох картона: шум есть, звонкой ноты нет (тоны ниже 400 Гц)', () => {
  const { ctx, created } = fakeContext();
  const fx = createEffects(ctx);
  for (const name of ['flip', 'unflip', 'deal', 'fan']) {
    const freqs = [];
    const orig = ctx.createOscillator;
    ctx.createOscillator = () => {
      const o = orig();
      const at = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => { freqs.push(v); at(v, t); };
      return o;
    };
    const before = created.length;
    fx.play(name, { step: 12 });
    ctx.createOscillator = orig;
    assert.ok(created.slice(before).some((n) => n.kind === 'buffer'), `${name}: нет шороха`);
    assert.ok(freqs.every((f) => f < 400), `${name}: ${Math.round(Math.max(...freqs))} Гц`);
  }
});

test('веер при раздаче: больше карт — больше щелчков (но не бесконечно)', () => {
  const { ctx, created } = fakeContext();
  const fx = createEffects(ctx);
  const clicks = (n) => {
    const before = created.length;
    fx.play('deal', { step: n });
    return created.slice(before).filter((x) => x.kind === 'buffer').length;
  };
  assert.ok(clicks(12) < clicks(30));
  assert.ok(clicks(1000) <= 24);
});
