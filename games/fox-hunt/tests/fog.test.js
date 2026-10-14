// Туман в «Лисьей охоте» (комнаты с room.mod === 'fog'): рисуется только там, не прячет красные зоны и выстрелы,
// в «Графике» 0 проще, при «уменьшить движение» не плывёт, и в кадре ничего нового не создаётся.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const made = [];            // все холсты, что создал document.createElement (заготовки)
let ops = [];               // что рисовали в кадре: { op, img?, alpha, style?, x?, y? }

function fakeCtx(canvas) {
  const o = { canvas, globalAlpha: 1, fillStyle: '#000' };
  return new Proxy(o, {
    get(t, name) {
      if (name in t) return t[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (name === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (name === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...a) => {
        if (name === 'drawImage') ops.push({ op: 'img', img: a[0], alpha: t.globalAlpha });
        else if (name === 'fillRect') ops.push({ op: 'rect', style: t.fillStyle, alpha: t.globalAlpha });
        else if (name === 'arc') ops.push({ op: 'arc', x: a[0], y: a[1] });
      };
    },
    set(t, name, v) {
      t[name] = v;
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

globalThis.document = { createElement: () => { const c = fakeCanvas(); made.push(c); return c; } };

const { createRenderer, FOG_TINT } = await import('../render.js');
const { bakeFog, bakePuff } = await import('../render-bake.js');
const { newRun, drain } = await import('../logic.js');

const ZONE = { x: 111, y: 99, r: 30, sh: 0, w: 0, phase: 0, t: 0.5, total: 1, wait: 0, look: 'red', from: 1 };

function setup(level, mod = 'fog') {
  const canvas = fakeCanvas();
  const r = createRenderer({ canvas, probe: null });
  r.setGraphics(level);
  r.resize(640, 360);
  const G = newRun(5);
  G.room.mod = mod;
  G.room.zones.push({ ...ZONE });
  r.enterRoom(G);
  drain(G);
  return { r, G };
}

const frame = (r, G, calm = false) => {
  ops = [];
  r.frame(G, 0.05, { alpha: 1, calm, input: null });
  return ops;
};
const tint = (G) => FOG_TINT[G.room.biome] ?? FOG_TINT.forest;
const fogImgs = (list, G) => list.filter((o) => o.op === 'img' && o.img === bakeFog(tint(G)));
const puffImgs = (list, G) => list.filter((o) => o.op === 'img' && o.img === bakePuff(tint(G)));

test('туман: рисуется только в комнате с mod fog', () => {
  const off = setup(1, null);
  const a = frame(off.r, off.G);
  assert.equal(fogImgs(a, off.G).length, 0);
  assert.equal(puffImgs(a, off.G).length, 0);
  assert.equal(a.filter((o) => o.op === 'rect' && o.style === tint(off.G)).length, 0);
  const night = setup(1, 'night');
  assert.equal(fogImgs(frame(night.r, night.G), night.G).length, 0, 'другая особая комната — без тумана');
  const on = setup(1, 'fog');
  const b = frame(on.r, on.G);
  assert.equal(fogImgs(b, on.G).length, 1, 'пелена — одной картинкой');
  assert.ok(puffImgs(b, on.G).length > 0, 'на средней плывут клоки дымки');
});

test('туман: красная зона рисуется один раз и поверх пелены, не под ней', () => {
  const { r, G } = setup(1);
  const a = frame(r, G);
  const fog = a.findIndex((o) => o.op === 'img' && o.img === bakeFog(tint(G)));
  const arcs = a.map((o, i) => (o.op === 'arc' && o.x === ZONE.x ? i : -1)).filter((i) => i >= 0);
  assert.ok(fog >= 0 && arcs.length > 0, 'и туман, и зона нарисованы');
  assert.ok(arcs.every((i) => i > fog), 'зона ни разу не рисуется до пелены');
  const clear = setup(1, null);
  const b = frame(clear.r, clear.G);
  const was = b.map((o, i) => (o.op === 'arc' && o.x === ZONE.x ? i : -1)).filter((i) => i >= 0);
  assert.equal(arcs.length, was.length, 'столько же вызовов, сколько без тумана — не удвоена');
});

test('туман: пелена не гуще потолка — зверь за краем виден силуэтом', () => {
  const { r, G } = setup(1);
  const a = frame(r, G);
  const veil = a.filter((o) => (o.op === 'rect' && o.style === tint(G)) || (o.op === 'img' && o.img === bakeFog(tint(G))));
  assert.ok(veil.length > 0);
  for (const o of veil) assert.ok(o.alpha > 0 && o.alpha <= 0.7, `потолок густоты: ${o.alpha}`);
  for (const o of puffImgs(a, G)) assert.ok(o.alpha <= 0.3);
});

test('туман: «Графика» 0 — один слой без клоков, выше — с клоками', () => {
  const low = setup(0);
  const lo = frame(low.r, low.G);
  assert.equal(fogImgs(lo, low.G).length, 1, 'пелена есть и на низкой');
  assert.equal(puffImgs(lo, low.G).length, 0, 'клоков нет');
  const mid = setup(1);
  const hi = setup(2);
  const m = puffImgs(frame(mid.r, mid.G), mid.G).length;
  const h = puffImgs(frame(hi.r, hi.G), hi.G).length;
  assert.ok(m > 0 && h >= m, `клоков: средняя ${m}, высокая ${h}`);
  const t0 = low.r.fogTime;
  frame(low.r, low.G);
  const a = frame(low.r, low.G);
  const b = frame(low.r, low.G);
  assert.deepEqual(a.map((o) => o.alpha), b.map((o) => o.alpha), 'на низкой ничего не дрейфует');
  void t0;
});

test('туман: при «уменьшить движение» не плывёт', () => {
  const { r, G } = setup(2);
  frame(r, G, false);
  const t1 = r.fogTime;
  const a = frame(r, G, true);
  const b = frame(r, G, true);
  assert.equal(r.fogTime, t1, 'часы дрейфа стоят');
  assert.deepEqual(a.map((o) => o.alpha), b.map((o) => o.alpha));
  frame(r, G, false);
  assert.ok(r.fogTime > t1, 'без calm часы идут');
});

test('туман: в кадре ничего нового не заготавливается', () => {
  // рисунки лисы печатаются по ходу сами; туман добавлять холстов не должен — считаем так же в комнате без него
  const grow = (mod) => {
    const { r, G } = setup(2, mod);
    frame(r, G);
    const before = made.length;
    for (let i = 0; i < 40; i++) frame(r, G, i % 3 === 0);
    return made.length - before;
  };
  const plain = grow(null);
  assert.equal(grow('fog'), plain, 'столько же новых холстов, сколько без тумана');
  const { G } = setup(2);
  assert.equal(bakeFog(tint(G)), bakeFog(tint(G)), 'пелена из кэша');
  assert.equal(bakePuff(tint(G)), bakePuff(tint(G)), 'клок из кэша');
});

test('туман: свой цвет у каждого места', () => {
  const tints = Object.values(FOG_TINT);
  assert.equal(new Set(tints).size, tints.length);
  for (const b of ['forest', 'swamp', 'taiga', 'cave', 'autumn']) assert.match(FOG_TINT[b], /^#[0-9a-f]{6}$/);
});
