// Рендер «Лисьей охоты» без браузера: на поддельном холсте идёт настоящая партия (бот играет, события уходят в рендер).
// Ловится то, что на глаз не видно, пока не сломается на телефоне: NaN в координатах, падение на любом звере или
// вещи, запрещённые в кадре вызовы, неверные формулы камеры и перевода координат.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bad = [];
const num = (v) => typeof v !== 'number' || Number.isFinite(v);

function fakeCtx(canvas) {
  const calls = { drawImage: 0 };
  const target = { canvas };
  return new Proxy(target, {
    get(o, name) {
      if (name in o) return o[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (name === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (name === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (name === 'calls') return calls;
      return (...a) => {
        for (const v of a) if (!num(v)) bad.push(`${String(name)}(${a.join(', ')})`);
        if (name === 'drawImage') calls.drawImage += 1;
      };
    },
    set(o, name, v) {
      o[name] = v;
      return true;
    },
  });
}

function fakeCanvas(w = 1, h = 1) {
  const c = { width: w, height: h, style: {} };
  let ctx = null;
  c.getContext = () => (ctx ??= fakeCtx(c));
  return c;
}

globalThis.document = { createElement: () => fakeCanvas() };

const { createRenderer, QUALITY } = await import('../render.js');
const { newRun, step, drain } = await import('../logic.js');
const { createBot, playBot, makeInput } = await import('./helpers.js');

test('рендер: короткая партия на трёх экранах без «не чисел» и падений', () => {
  for (const [w, h] of [[640, 360], [320, 180], [360, 640]]) {
    bad.length = 0;
    const canvas = fakeCanvas();
    const r = createRenderer({ canvas, probe: null });
    r.resize(w, h);
    assert.ok(canvas.width > 0 && canvas.height > 0);
    const G = newRun(7);
    r.enterRoom(G);
    for (const e of drain(G)) r.onEvent(e, G);
    const bot = createBot();
    let frames = 0;
    playBot(G, bot, 25, (g) => {
      for (const e of drain(g)) {
        r.onEvent(e, g);
        if (e.t === 'room') r.enterRoom(g);
        if (e.t === 'tiles' || e.t === 'doors') r.refreshProps(g);
      }
      if (frames++ % 3 === 0) r.frame(g, 0.05, { alpha: (frames % 5) / 5, calm: false, input: null });
    });
    r.frame(G, 0.016, { alpha: 1, calm: true, input: null });
    assert.deepEqual(bad.slice(0, 5), [], `${w}×${h}: нечисла в вызовах холста`);
    assert.ok(canvas.getContext().calls.drawImage > 0, 'ничего не нарисовано');
    r.destroy();
  }
});

test('рендер: перевод координат туда и обратно', () => {
  const canvas = fakeCanvas();
  const r = createRenderer({ canvas, probe: null });
  r.resize(640, 360);
  const G = newRun(3);
  r.enterRoom(G);
  r.frame(G, 0.016, { alpha: 1, calm: true, input: null });
  const w = r.toWorld(100, 50, {});
  const s = r.toScreen(w.x, w.y, {});
  assert.ok(Math.abs(s.x - 100) < 1e-6 && Math.abs(s.y - 50) < 1e-6);
  assert.ok(Math.abs(r.scale - 360 / 320) < 1e-9, 'короткая сторона = 320 единиц');
  assert.ok(Math.abs(r.view.h - 320) < 1e-6);
});

test('рендер: чёткость снижается только вниз и не до нуля', () => {
  const canvas = fakeCanvas();
  const r = createRenderer({ canvas, probe: null });
  r.resize(360, 640);
  const was = r.quality;
  let n = 0;
  while (r.lowerQuality() && n < 10) n += 1;
  assert.ok(r.quality >= was && r.quality < QUALITY.length);
  assert.ok(n <= QUALITY.length);
});

test('рендер: в кадре нет запрещённого', () => {
  const src = readFileSync(fileURLToPath(new URL('../render.js', import.meta.url)), 'utf8');
  for (const word of ['shadowBlur', 'createLinearGradient', 'createRadialGradient', "'lighter'", 'fillText', 'strokeText', 'roundRect']) {
    assert.ok(!src.includes(word), `в render.js есть ${word}`);
  }
});

test('рендер: каждому зверю из реестра есть рисунок или заглушка (не падает)', async () => {
  const { REG } = await import('../core.js');
  const { spawnMob } = await import('../ai.js');
  bad.length = 0;
  const canvas = fakeCanvas();
  const r = createRenderer({ canvas, probe: null });
  r.resize(640, 360);
  const G = newRun(11);
  r.enterRoom(G);
  drain(G);
  let i = 0;
  for (const id of Object.keys(REG.MOBS)) {
    spawnMob(G, id, G.room.center.x + (i % 6) * 20, G.room.center.y + Math.floor(i / 6) * 14, { warm: 0 });
    i += 1;
  }
  step(G, makeInput());
  r.frame(G, 0.016, { alpha: 1, calm: false, input: null });
  assert.deepEqual(bad.slice(0, 5), []);
});
