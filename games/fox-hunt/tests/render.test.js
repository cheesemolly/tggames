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

test('рендер: летающая вещь (бабочка задания) поднята на свою высоту, смотрит, куда летит, и бросает тень', async () => {
  const { addThing } = await import('../world.js');
  const canvas = fakeCanvas();
  const log = [];
  canvas.getContext().setTransform = (...a) => log.push(a.map((v) => Math.round(v * 1000) / 1000 || 0));
  const r = createRenderer({ canvas, probe: null });
  r.resize(640, 360);
  const G = newRun(5);
  r.enterRoom(G);
  drain(G);
  const th = addThing(G, { kind: 'butterfly', x: G.room.center.x + 40, y: G.room.center.y, r: 6, solid: false });
  // время стоит (dt = 0): от кадра к кадру меняется только бабочка
  const shot = () => {
    log.length = 0;
    r.frame(G, 0, { alpha: 1, calm: true, input: null });
    return log.map((a) => a.join(' '));
  };
  r.frame(G, 0.016, { alpha: 1, calm: true, input: null });
  const ground = shot();
  assert.deepEqual(shot(), ground, 'кадр без хода времени должен повторяться');
  th.z = 10;
  th.face = -1;
  const low = shot();
  th.z = 22;
  const high = shot();
  const fresh = (now, was) => now.filter((c) => !was.includes(c)).map((c) => c.split(' ').map(Number));
  const first = fresh(low, ground);
  const flipped = first.filter((m) => m[0] < 0);
  assert.equal(flipped.length, 1, 'бабочка, летящая влево, не отражена');
  const [a, b, c, d, x, y] = flipped[0];
  assert.ok(a === -d && b === 0 && c === 0 && d > 0, 'отражение без поворота и растяжения');
  // тень — на земле под ней: появилась вместе с высотой и от высоты не зависит
  const shade = first.filter((m) => m[0] > 0 && Math.abs(m[4] - x) < 0.01);
  assert.equal(shade.length, 1, 'у летящей бабочки нет тени');
  assert.ok(shade[0][5] > y + 9 * d, 'тень не ниже бабочки');
  const second = fresh(high, low);
  assert.equal(second.length, 1, 'с высотой должна сдвинуться только сама бабочка');
  assert.ok(Math.abs(second[0][5] - (y - 12 * d)) < 0.01 && second[0][4] === x, 'бабочка поднята не на свою высоту');
  r.destroy();
});


// Хозяева, которых «не задеть» (прыжок жабы, нить паучьей королевы, вихрь филина), раньше пропадали за один кадр:
// рендер не рисовал спрятанных. Теперь рисует — проверяем, что вид меняется плавно и нигде не прыгает.
test('рендер: хозяин в прыжке, под потолком и в вихре не пропадает за один кадр', async () => {
  const { spawnMob } = await import('../ai.js');
  const { arena } = await import('./helpers.js');
  const { T } = await import('../core.js');
  for (const id of ['toad', 'spiderqueen', 'owl']) {
    const canvas = fakeCanvas();
    const r = createRenderer({ canvas, probe: null });
    r.resize(640, 360);
    const G = arena({ seed: 5 });
    G.god = true;
    const m = spawnMob(G, id, G.room.center.x + 3 * T, G.room.center.y, { warm: 0 });
    const bot = createBot({ doors: false });
    let prev = null;
    let hid = 0;
    let worst = 0;
    for (let i = 0; i < 90 * 60 && !m.dead; i++) {
      step(G, bot(G));
      G.events.length = 0;
      const L = r.bossLook(m, false);
      const cur = [L.a, L.sx, L.sy];
      if (m.hide) {
        hid += 1;
        for (const v of cur) assert.ok(Number.isFinite(v));
        assert.ok(L.sa >= 0 && L.sa <= 1 && L.sh > 0);
      }
      if (prev) for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(cur[j] - prev[j]));
      prev = cur;
      assert.ok(worst < 0.25, `${id}: вид скачет на ${worst.toFixed(2)} за кадр (${m.state}, z=${m.z})`);
    }
    assert.ok(hid > 30, `${id}: за бой ни разу не спрятался (${hid})`);
    // при «уменьшить движение» — без масштаба
    m.hide = true;
    m.act = 'drop';
    m.z = 100;
    const c = r.bossLook(m, true);
    assert.equal(c.sx, 1);
    assert.equal(c.sy, 1);
    r.destroy();
  }
});

test('рендер: заготовка заранее (warm) доходит до конца, и первому кадру почти нечего печь', () => {
  let made = 0;
  const was = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    made += 1;
    return fakeCanvas();
  };
  const firstFrame = (warmFirst) => {
    const r = createRenderer({ canvas: fakeCanvas(), probe: null });
    r.resize(640, 360);
    const G = newRun(7);
    r.enterRoom(G);
    for (const e of drain(G)) r.onEvent(e, G);
    if (warmFirst) {
      let last = 0;
      for (let i = 0; i < 5000 && last < 1; i++) {
        const f = r.warm(0.2);
        assert.ok(f >= last && f <= 1, `доля не убывает: ${last} → ${f}`);
        last = f;
      }
      assert.equal(last, 1, 'заготовка не дошла до конца');
      assert.equal(r.warm(5), 1, 'повторный вызов — уже всё готово');
    }
    made = 0;
    r.frame(G, 0.016, { alpha: 1, calm: false, input: null });
    const baked = made;
    r.destroy();
    return baked;
  };
  try {
    const cold = firstFrame(false);
    const warm = firstFrame(true);
    assert.ok(cold > 0 && warm < cold / 2, `первый кадр: без заготовки ${cold} холстов, после — ${warm}`);
  } finally {
    globalThis.document.createElement = was;
  }
});
