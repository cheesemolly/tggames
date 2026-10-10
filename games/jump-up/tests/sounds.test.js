// Звуки «Прыгалки вверх» на поддельном AudioContext: каждый звучит, все узлы подключены, частые — мягкие.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSounds, SOUNDS } from '../sounds.js';
import { fakeContext } from '../../../shared/tests/fake-audio.js';

test('каждый звук звучит, все узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const sounds = createSounds(ctx);
  for (const name of SOUNDS) {
    assert.ok(sounds.has(name), `нет звука ${name}`);
    for (const opts of [{}, { kind: 'plane' }, { kind: 'rocket' }, { n: 0 }, { n: 3 }, { kind: 'мусор', n: 'мусор' }, null, undefined]) {
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

/** Все частоты, которые звук задаёт осцилляторам. */
function freqsOf(play) {
  const { ctx } = fakeContext();
  const sounds = createSounds(ctx);
  const seen = [];
  const orig = ctx.createOscillator;
  ctx.createOscillator = () => {
    const o = orig();
    for (const method of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
      const set = o.frequency[method];
      o.frequency[method] = (v, t) => {
        seen.push(v);
        set.call(o.frequency, v, t);
      };
    }
    return o;
  };
  play(sounds);
  return seen;
}

test('прыжок — самый частый звук: низкий, короткий, высота чуть гуляет', () => {
  const tops = [];
  for (let k = 0; k < 12; k++) tops.push(Math.max(...freqsOf((s) => s.play('jump'))));
  assert.ok(Math.max(...tops) < 800, `прыжок: до ${Math.round(Math.max(...tops))} Гц`);
  assert.ok(new Set(tops.map((v) => Math.round(v))).size > 3, 'высота прыжка не одна и та же');
});

test('частые звуки мягкие: без высоких тонов', () => {
  for (const name of ['jump', 'spring', 'eraser', 'crumble', 'stomp', 'flyend', 'shieldend', 'hit', 'fall', 'hole', 'click', 'count']) {
    const top = Math.max(...freqsOf((s) => s.play(name, { n: 2 })));
    assert.ok(top <= 1400, `${name}: ${Math.round(top)} Гц`);
  }
  for (const name of ['shield', 'record']) {
    const all = freqsOf((s) => s.play(name));
    // колокольчик: основной тон невысокий (обертоны тихие)
    assert.ok(all[0] <= 1100, `${name}: основной тон ${Math.round(all[0])} Гц`);
  }
});

test('пружинка и ластик звучат вверх, падение и дырка — вниз; ластик ниже пружинки', () => {
  const slide = (name, opts) => {
    const f = freqsOf((s) => s.play(name, opts));
    return { first: f[f.length - 2], last: f[f.length - 1], low: Math.min(...f) };
  };
  assert.ok(slide('spring').last > slide('spring').first);
  assert.ok(slide('eraser').last > slide('eraser').first);
  assert.ok(slide('eraser').low < slide('spring').low);
  assert.ok(slide('fall').last < slide('fall').first);
  assert.ok(slide('hole').last < slide('hole').first);
  assert.ok(slide('fly', { kind: 'rocket' }).low < slide('fly', { kind: 'plane' }).low, 'карандаш гудит ниже самолётика');
});

test('отсчёт после паузы: «пип» на цифру и другой звук на старт', () => {
  const pip = freqsOf((s) => s.play('count', { n: 2 }));
  const go = freqsOf((s) => s.play('count', { n: 0 }));
  assert.ok(Math.max(...go) > Math.max(...pip));
});

test('игра зовёт только те звуки, которые есть', () => {
  const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  // имена звуков — строки внутри вызовов sfx(…), в том числе в выборе «что звучит при гибели»
  const called = new Set([...js.matchAll(/sfx\(([^;]*)\);/g)].flatMap((m) => [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1])));
  const mapped = js.match(/const SOUND_OF = \{([^}]*)\}/)[1];
  for (const m of mapped.matchAll(/: '([a-z]+)'/g)) called.add(m[1]);
  for (const name of called) assert.ok(SOUNDS.includes(name), `в игре звук «${name}», которого нет`);
  for (const name of SOUNDS) assert.ok(called.has(name), `звук «${name}» нигде не звучит`);
});
