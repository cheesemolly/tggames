// «Ночь» в «Лисьей охоте» (комнаты с room.mod === 'night'): темнота рисуется только там; красные зоны, выстрелы и
// знаки появления — поверх неё; лиса в пятне света, на каждом звере своё слабое пятно; в «Графике» 0 слой грубее и
// без украшений; при «уменьшить движение» свет не мерцает; в кадре ничего нового не создаётся.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const made = [];            // все холсты, что создал document.createElement (заготовки)
let ops = [];               // что рисовали: { on — холст, op, img?, alpha, comp, a — аргументы }
let gradients = 0;

function fakeCtx(canvas) {
  const o = { canvas, globalAlpha: 1, fillStyle: '#000', globalCompositeOperation: 'source-over' };
  return new Proxy(o, {
    get(t, name) {
      if (name in t) return t[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') {
        return () => {
          gradients += 1;
          return { addColorStop() {} };
        };
      }
      if (name === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (name === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...a) => {
        const rec = { on: canvas, alpha: t.globalAlpha, comp: t.globalCompositeOperation, a };
        if (name === 'drawImage') ops.push({ ...rec, op: 'img', img: a[0] });
        else if (name === 'fillRect') ops.push({ ...rec, op: 'rect', style: t.fillStyle });
        else if (name === 'arc') ops.push({ ...rec, op: 'arc', x: a[0], y: a[1] });
        else if (name === 'fill') ops.push({ ...rec, op: 'fill', style: t.fillStyle });
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

const { createRenderer, NIGHT_TINT, GRAPHICS } = await import('../render.js');
const { bakeLight } = await import('../render-bake.js');
const { newRun, drain } = await import('../logic.js');
const { spawnMob } = await import('../ai.js');

const CSS_W = 640;
const ZONE = { x: 111, y: 99, r: 30, sh: 0, w: 0, phase: 0, t: 0.5, total: 1, wait: 0, look: 'red', from: 1 };

function setup(level, mod = 'night', o = {}) {
  const canvas = fakeCanvas();
  const r = createRenderer({ canvas, probe: null });
  r.setGraphics(level);
  r.resize(CSS_W, 360);
  const G = newRun(5);
  G.room.mod = mod;
  if (o.zone !== false) G.room.zones.push({ ...ZONE });
  const P = G.player;
  for (const [id, dx, dy] of o.mobs ?? []) spawnMob(G, id, P.x + dx, P.y + dy, { warm: 0 });
  r.enterRoom(G);
  for (const e of drain(G)) r.onEvent(e, G);
  return { r, G, canvas };
}

const frame = (r, G, calm = false) => {
  ops = [];
  r.frame(G, 0.05, { alpha: 1, calm, input: null });
  return ops;
};
const layerOf = (r) => r.nightInfo.layer;
const onMain = (list, canvas) => list.filter((o) => o.on === canvas);
const layerImg = (list, r, canvas) => list.findIndex((o) => o.on === canvas && o.op === 'img' && o.img === layerOf(r));
const cutsOf = (list, r) => list.filter((o) => o.on === layerOf(r) && o.op === 'img' && o.img === bakeLight());

test('ночь: темнота рисуется только в комнате с mod night', () => {
  for (const mod of [null, 'fog', 'plenty', 'calm']) {
    const { r, G, canvas } = setup(1, mod);
    const a = frame(r, G);
    assert.equal(layerImg(a, r, canvas), -1, `${mod}: слой темноты не ложится`);
    assert.equal(cutsOf(a, r).length, 0, `${mod}: пятен не вырезали`);
  }
  const { r, G, canvas } = setup(1);
  const a = frame(r, G);
  const at = layerImg(a, r, canvas);
  assert.ok(at >= 0, 'слой темноты лёг на кадр');
  const tint = NIGHT_TINT[G.room.biome];
  // на кадре: куски слоя у света и сплошная заливка цветом места там, где сплошь темно — одной густоты
  const dark = onMain(a, canvas).filter((o) => (o.op === 'img' && o.img === layerOf(r)) || (o.op === 'rect' && o.style === tint));
  for (const o of dark) {
    assert.ok(o.alpha > 0.6 && o.alpha <= 0.85, `густота ${o.alpha}: темно, но очертания видны`);
    assert.equal(o.comp, 'source-over');
  }
  // слой: сначала заливка цветом места, потом вырезы (destination-out)
  const fill = a.find((o) => o.on === layerOf(r) && o.op === 'rect');
  assert.equal(fill.style, tint);
  assert.equal(fill.comp, 'source-over');
  const cuts = cutsOf(a, r);
  assert.ok(cuts.length > 0 && cuts.every((o) => o.comp === 'destination-out'), 'пятна света вырезают темноту');
});

test('ночь: темнота покрывает весь кадр без дыр и наложений, слоем — только плитки со светом', () => {
  const { r, G, canvas } = setup(1, 'night', { mobs: [['rabbit', 90, 0], ['hedgehog', -150, 60]] });
  const a = frame(r, G);
  const info = r.nightInfo;
  const tint = NIGHT_TINT[G.room.biome];
  const s = info.tile;
  const pieces = onMain(a, canvas).filter((o) => (o.op === 'img' && o.img === layerOf(r)) || (o.op === 'rect' && o.style === tint));
  // куски: [x, y, w, h] на кадре; у картинки — последние четыре числа
  const box = (o) => (o.op === 'img' ? o.a.slice(5, 9) : o.a.slice(0, 4));
  for (let j = 0; j < info.rows; j++) {
    const row = pieces.map(box).filter((b) => Math.abs(b[1] - j * s) < 1e-6).sort((p, q) => p[0] - q[0]);
    let x = 0;
    for (const b of row) {
      assert.ok(Math.abs(b[0] - x) < 1e-6, `ряд ${j}: кусок с ${b[0]}, а ждали с ${x}`);
      assert.ok(Math.abs(b[3] - s) < 1e-6);
      x = b[0] + b[2];
    }
    assert.ok(x >= canvas.width, `ряд ${j} покрыт до края: ${x} из ${canvas.width}`);
  }
  assert.ok(info.rows * s >= canvas.height, 'ряды — до низа кадра');
  assert.ok(info.lit > 0 && info.lit < info.cols * info.rows, `со светом ${info.lit} плиток из ${info.cols * info.rows}`);
  // слоем — ровно плитки со светом: площадь кусков слоя
  const area = pieces.filter((o) => o.op === 'img').reduce((sum, o) => sum + o.a[7] * o.a[8], 0);
  assert.ok(Math.abs(area - info.lit * s * s) < 1, 'слоем ровно столько, сколько плиток со светом');
});

test('ночь: красные зоны, выстрелы и знаки появления — поверх темноты, не под ней', () => {
  const { r, G, canvas } = setup(1);
  const P = G.player;
  const a = frame(r, G);
  const at = layerImg(a, r, canvas);
  const arcs = a.map((o, i) => (o.on === canvas && o.op === 'arc' && o.x === ZONE.x ? i : -1)).filter((i) => i >= 0);
  assert.ok(arcs.length > 0 && arcs.every((i) => i > at), 'зона ни разу не рисуется под темнотой');
  const day = setup(1, null);
  const was = frame(day.r, day.G).filter((o) => o.on === day.canvas && o.op === 'arc' && o.x === ZONE.x).length;
  assert.equal(arcs.length, was, 'зона не удвоена');
  // под зоной ночью тёмная земля — заливка зоны гуще, чем днём
  const red = (list, cv) => Math.max(...list.filter((o) => o.on === cv && o.op === 'fill' && String(o.style).startsWith('rgba(224,48,47,'))
    .map((o) => Number(/,([\d.]+)\)$/.exec(o.style)[1])));
  const dayRed = red(frame(day.r, day.G), day.canvas);
  const nightRed = red(frame(r, G), canvas);
  assert.ok(nightRed > dayRed * 1.3, `заливка зоны: днём ${dayRed}, ночью ${nightRed}`);
  // выстрел и знак появления: после темноты рисуется на одну картинку больше, чем без них
  const after = (list) => onMain(list.slice(layerImg(list, r, canvas) + 1), canvas).filter((o) => o.op === 'img').length;
  const base = after(frame(r, G));
  G.room.shots.push({ on: true, x: P.x + 60, y: P.y, z: 8, look: 'shot.orb', v: 0, a: 0, spin: false });
  const withShot = after(frame(r, G));
  assert.ok(withShot >= base + 1, `выстрел поверх темноты: ${base} → ${withShot}`);
  r.onEvent({ t: 'spawn', x: P.x - 80, y: P.y }, G);
  const withMark = after(frame(r, G));
  assert.equal(withMark, withShot + 1, 'знак появления поверх темноты');
});

test('ночь: лиса в пятне света, на каждом звере на экране — своё слабое пятно', () => {
  const { r, G, canvas } = setup(1, 'night', { mobs: [['rabbit', 90, 0], ['hedgehog', -110, 40], ['boar', 40, -90]] });
  const a = frame(r, G);
  const cuts = cutsOf(a, r);
  const rate = canvas.width / CSS_W;
  const center = (o) => ({ x: o.a[1] + o.a[3] / 2, y: o.a[2] + o.a[4] / 2, r: o.a[3] / 2 });
  const P = G.player;
  const near = (wx, wy, tol) => {
    const s = r.toScreen(wx, wy);
    return cuts.filter((o) => {
      const c = center(o);
      return Math.abs(c.x - s.x * rate) < tol && Math.abs(c.y - s.y * rate) < tol;
    });
  };
  const fox = near(P.x, P.y - 8, 3);
  assert.equal(fox.length, 1, 'пятно у лисы');
  assert.equal(fox[0].alpha, 1, 'у лисы темнота снята целиком');
  const foxR = center(fox[0]).r;
  const mobs = G.room.mobs.filter((m) => !m.dead && !m.hide);
  assert.ok(mobs.length >= 3);
  for (const m of mobs) {
    const s = r.toScreen(m.x, m.y);
    if (s.x < 0 || s.y < 0 || s.x > CSS_W || s.y > 360) continue;
    const mine = near(m.x, m.y - (m.r ?? 10) * 0.9, 3);
    assert.equal(mine.length, 1, `пятно на ${m.id}`);
    assert.ok(mine[0].alpha >= 0.4 && mine[0].alpha < 1, `${m.id}: слабее, чем у лисы (${mine[0].alpha})`);
    assert.ok(center(mine[0]).r < foxR / 2, `${m.id}: пятно меньше лисьего`);
  }
});

test('ночь: «Графика» 0 дешевле — слой грубее, без отсветов и светлячков', () => {
  globalThis.window = { devicePixelRatio: 3 };      // у плотного экрана ступени чёткости различаются
  const look = (level) => {
    const { r, G, canvas } = setup(level);
    frame(r, G);
    const info = r.nightInfo;
    return { px: info.w * info.h, glows: info.glows, cuts: info.cuts, r, G, canvas };
  };
  const [low, mid, high] = [look(0), look(1), look(2)];
  assert.ok(low.px < mid.px && mid.px < high.px, `точек слоя: ${low.px} < ${mid.px} < ${high.px}`);
  assert.equal(low.glows, 0, 'на низкой без отсветов и светлячков');
  assert.ok(high.glows > 0 && high.glows >= mid.glows, `на средней и высокой — есть (${mid.glows}, ${high.glows})`);
  assert.ok(low.cuts < high.cuts, 'на низкой пятен меньше (нет светлячков)');
  // автоснижение: холст грубеет — и слой вместе с ним
  const before = mid.r.nightInfo.w;
  assert.equal(mid.r.lowerQuality(), true);
  assert.ok(mid.r.nightInfo.w < before, 'слой уменьшился вместе с холстом');
  const info = mid.r.nightInfo;
  assert.ok(info.w * info.d >= mid.canvas.width && (info.w - 32) * info.d < mid.canvas.width, 'слой по холсту, с запасом меньше плитки');
  delete globalThis.window;
});

test('ночь: при «уменьшить движение» свет не мерцает и светлячки стоят', () => {
  const { r, G } = setup(2);
  frame(r, G, false);
  const t1 = r.nightInfo.t;
  const sizes = (list) => cutsOf(list, r).map((o) => `${o.a[3].toFixed(3)}|${o.alpha.toFixed(3)}`);
  const a = sizes(frame(r, G, true));
  const b = sizes(frame(r, G, true));
  assert.equal(r.nightInfo.t, t1, 'часы мерцания стоят');
  assert.deepEqual(a, b, 'пятна те же');
  const c = sizes(frame(r, G, false));
  const d = sizes(frame(r, G, false));
  assert.ok(r.nightInfo.t > t1, 'без calm часы идут');
  assert.notDeepEqual(c, d, 'без calm свет дышит');
});

test('ночь: в кадре ничего нового не создаётся, слой заготовлен заранее', () => {
  const grow = (mod) => {
    const { r, G } = setup(2, mod, { mobs: [['rabbit', 90, 0], ['hedgehog', -110, 40]] });
    frame(r, G);
    const before = made.length;
    gradients = 0;
    for (let i = 0; i < 40; i++) frame(r, G, i % 3 === 0);
    return { canvases: made.length - before, gradients };
  };
  const plain = grow(null);
  const night = grow('night');
  assert.equal(night.canvases, plain.canvases, 'столько же новых холстов, сколько без темноты');
  assert.equal(night.gradients, 0, 'градиентов в кадре нет');
  // слой создан при resize, а не в кадре; новый размер — тот же холст
  const { r, G } = setup(1);
  const layer = r.nightInfo.layer;
  assert.ok(made.includes(layer));
  frame(r, G);
  assert.equal(r.nightInfo.layer, layer);
  const w = r.nightInfo.w;
  r.resize(320, 180);
  assert.equal(r.nightInfo.layer, layer, 'после resize — тот же холст');
  assert.ok(r.nightInfo.w < w, 'другого размера');
  assert.equal(bakeLight(), bakeLight(), 'пятно света из кэша');
});

test('ночь: свой цвет у каждого места — синий в лесу и зимой, чернильный в пещерах, не чёрный', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const tints = Object.values(NIGHT_TINT);
  assert.equal(new Set(tints).size, tints.length);
  for (const b of ['forest', 'swamp', 'taiga', 'cave', 'autumn']) {
    assert.match(NIGHT_TINT[b], /^#[0-9a-f]{6}$/);
    const [R, Gr, B] = rgb(NIGHT_TINT[b]);
    assert.ok(R + Gr + B > 20, `${b}: не чёрный`);
    assert.ok(B > R && B > Gr, `${b}: холодный`);
  }
  const [cr, cg, cb] = rgb(NIGHT_TINT.cave);
  const [tr, tg, tb] = rgb(NIGHT_TINT.taiga);
  assert.ok(cr + cg + cb < tr + tg + tb, 'пещера темнее зимы');
  assert.ok(cb - cg > 10 && cr >= cg, 'пещера — чернильно-лиловая, а не синяя');
});
