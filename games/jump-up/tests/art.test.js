// Рисунки «Прыгалки вверх» без браузера: перо рисует на поддельном холсте — ничего не падает, линии не уходят
// далеко от задуманного; каракули на полях разложены по зонам; почерк знает все цифры.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../art.js';

const PAL = new Proxy({}, { get: (_, key) => `#${String(key)}` });

/**
 * Поддельный холст: запоминает точки линий и заливок — с учётом сдвига, поворота и масштаба; то, что рисуется
 * под обрезкой (clip — штриховка, заливка маркером), не запоминается: на настоящем холсте оно не выходит за контур.
 */
function fakeCtx() {
  const pts = [];
  const calls = { stroke: 0, fill: 0, clip: 0, save: 0, restore: 0 };
  let m = [1, 0, 0, 1, 0, 0];
  let clipped = false;
  const stack = [];
  const mul = (n) => {
    m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  };
  const point = (x, y) => {
    if (!clipped) pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  };
  return {
    pts,
    calls,
    moveTo: point,
    lineTo: point,
    ellipse: point,
    arc: point,
    fillRect() {},
    beginPath() {},
    closePath() {},
    translate: (x, y) => mul([1, 0, 0, 1, x, y]),
    rotate: (a) => mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]),
    scale: (x, y) => mul([x, 0, 0, y, 0, 0]),
    stroke: () => { calls.stroke += 1; },
    fill: () => { calls.fill += 1; },
    clip: () => {
      calls.clip += 1;
      clipped = true;
    },
    save: () => {
      calls.save += 1;
      stack.push([m, clipped]);
    },
    restore: () => {
      calls.restore += 1;
      [m, clipped] = stack.pop();
    },
  };
}

function drawn(paint, seed = 1) {
  const ctx = fakeCtx();
  paint(A.createPen(ctx, PAL, seed), seed);
  for (const [x, y] of ctx.pts) assert.ok(Number.isFinite(x) && Number.isFinite(y), 'в рисунке не число');
  assert.equal(ctx.calls.save, ctx.calls.restore, 'save без restore');
  return ctx;
}
const box = (pts) => ({
  x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])),
});

test('случайность рисунка — от зерна', () => {
  const a = A.rand(7);
  const b = A.rand(7);
  const c = A.rand(8);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  for (const v of xs) assert.ok(v >= 0 && v < 1);
});

test('гладкая линия проходит через узлы; рука уводит её в сторону плавно и не дальше заданного', () => {
  const nodes = [[0, 0], [20, 10], [40, 0], [60, 20]];
  const line = A.spline(nodes);
  for (const n of nodes) assert.ok(line.some((p) => Math.hypot(p[0] - n[0], p[1] - n[1]) < 0.01), `узел ${n}`);
  for (let i = 1; i < line.length; i++) assert.ok(Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) < 3.5, 'точки идут часто');
  const closed = A.spline(nodes, true);
  assert.deepEqual(closed[0], closed[closed.length - 1]);
  assert.equal(A.shaky(line, 0, 5), line, 'без дрожи — та же линия');
  const amp = 1.2;
  const moved = A.shaky(line, amp, 5);
  assert.equal(moved.length, line.length);
  let far = 0;
  for (let i = 0; i < line.length; i++) far = Math.max(far, Math.hypot(moved[i][0] - line[i][0], moved[i][1] - line[i][1]));
  assert.ok(far > 0.2 && far <= amp * 1.1, `уход ${far.toFixed(2)}`);
  // плавно: соседние точки уходят почти одинаково (это не частая дрожь)
  for (let i = 1; i < line.length; i++) {
    const d0 = [moved[i - 1][0] - line[i - 1][0], moved[i - 1][1] - line[i - 1][1]];
    const d1 = [moved[i][0] - line[i][0], moved[i][1] - line[i][1]];
    assert.ok(Math.hypot(d1[0] - d0[0], d1[1] - d0[1]) < 0.45, 'рывок между соседними точками');
  }
  assert.deepEqual(A.shaky(line, amp, 5), moved, 'одно зерно — одна линия');
  assert.notDeepEqual(A.shaky(line, amp, 6), moved);
});

test('штрих ручкой: толщина гуляет от нажима, концы тоньше; карандаш — одной ровной линией', () => {
  const widths = [];
  const ctx = fakeCtx();
  Object.defineProperty(ctx, 'lineWidth', { set: (v) => widths.push(v), get: () => 1 });
  const pts = A.spline([[0, 0], [30, 4], [60, 0], [90, 6]]);
  A.inkLine(ctx, pts, { color: '#000', w: 2, seed: 3 });
  assert.ok(widths.length > 10);
  assert.ok(Math.min(...widths) > 1 && Math.max(...widths) < 3);
  assert.ok(new Set(widths.map((v) => v.toFixed(2))).size > 5, 'толщина меняется');
  assert.ok(widths[0] < 2 * 0.9 && widths[widths.length - 1] < 2 * 0.9, 'начало и конец штриха тоньше');
  const pencil = [];
  const ctx2 = fakeCtx();
  Object.defineProperty(ctx2, 'lineWidth', { set: (v) => pencil.push(v), get: () => 1 });
  A.inkLine(ctx2, pts, { color: '#000', w: 1.2, alpha: 0.6 });
  assert.deepEqual(pencil, [1.2]);
  assert.equal(ctx2.calls.stroke, 1);
});

test('платформы: рисунок — в своих размерах, варианты отличаются', () => {
  for (const type of ['solid', 'move', 'vert', 'once', 'crumble']) {
    const b = box(drawn((g, v) => A.PLATFORMS[type](g, v), 1).pts);
    const side = type === 'move' || type === 'vert' ? 44 : 36;
    assert.ok(b.x0 >= -side && b.x1 <= side, `${type}: по ширине ${b.x0.toFixed(1)}…${b.x1.toFixed(1)}`);
    assert.ok(b.y0 >= -5 && b.y1 <= 19, `${type}: по высоте ${b.y0.toFixed(1)}…${b.y1.toFixed(1)}`);
    assert.ok(b.x1 - b.x0 > A.PLAT.w - 8, `${type}: во всю ширину платформы`);
    assert.notDeepEqual(drawn((g, v) => A.PLATFORMS[type](g, v), 2).pts, drawn((g, v) => A.PLATFORMS[type](g, v), 1).pts);
  }
  const halves = A.crumbleHalves();
  assert.equal(halves.length, 2);
  const [left, right] = halves.map((flat) => flat.filter((_, i) => i % 2 === 0));
  assert.ok(Math.max(...left) < Math.min(...right) + 6 && Math.min(...left) < -25 && Math.max(...right) > 25, 'половинки — слева и справа от трещины');
});

test('предметы, каракуля и враги рисуются; основание предмета — на платформе', () => {
  const spring = box(drawn((g) => A.ITEMS.spring(g, 1, false)).pts);
  const tall = box(drawn((g) => A.ITEMS.spring(g, 1, true)).pts);
  assert.ok(spring.y1 <= 1.5 && spring.y0 > -16);
  assert.ok(tall.y0 < spring.y0 - 10, 'распрямившаяся пружинка выше');
  for (const kind of ['eraser', 'star']) assert.ok(box(drawn((g) => A.ITEMS[kind](g)).pts).y1 <= 2.5, kind);
  const rocket = box(drawn((g) => A.ITEMS.rocket(g)).pts);
  assert.ok(rocket.y0 < -22 && rocket.y1 > 20 && rocket.x1 - rocket.x0 < 16, 'карандаш — вытянутый, остриём вверх');
  drawn((g) => A.ITEMS.plane(g));
  for (const seed of [1, 2, 3]) {
    const b = box(drawn((g, v) => A.heroBody(g, v), seed).pts);
    assert.ok(b.x1 - b.x0 > A.HERO.w - 6 && b.x1 - b.x0 < A.HERO.w + 8, `каракуля ${seed}: ширина ${(b.x1 - b.x0).toFixed(1)}`);
    assert.ok(b.y1 - b.y0 > A.HERO.h - 6 && b.y1 - b.y0 < A.HERO.h + 8);
  }
  const blot = box(drawn((g, v) => A.blot(g, v)).pts);
  assert.ok(blot.x0 > -36 && blot.x1 < 36 && blot.y0 > -28 && blot.y1 < 40);
  for (const [x, y] of A.BLOT_EYES) assert.ok(Math.abs(x) < 12 && Math.abs(y) < 8);
  const two = box(drawn((g) => A.two(g)).pts);
  assert.ok(two.x0 > -22 && two.x1 < 20 && two.y0 > -27 && two.y1 < 25);
  const hole = box(drawn((g, v) => A.hole(g, v)).pts);
  assert.ok(hole.x0 > -37 && hole.x1 < 37 && hole.y0 > -33 && hole.y1 < 33);
  drawn((g) => A.swirl(g));
  drawn((g) => A.ground(g, 360));
  const arrow = box(drawn((g) => A.startArrow(g)).pts);
  assert.ok(arrow.y0 < 12 && arrow.y1 > 60 && arrow.x0 > 0 && arrow.x1 < 70, 'стрелка у старта — снизу вверх, в рамке каракули');
});

test('почерк: все цифры и знаки, ширина надписи растёт с длиной', () => {
  for (const ch of '0123456789+-=x!?') {
    const ctx = drawn((g) => g.text(ch, 0, 0, 16));
    assert.ok(ctx.pts.length > 3, `знак «${ch}» не нарисован`);
    const b = box(ctx.pts);
    assert.ok(b.x0 > -2.5 && b.x1 < A.GLYPH_W + 3.5 && b.y0 > -2.5 && b.y1 < A.GLYPH_H + 2.5, `знак «${ch}» вылез из клетки`);
  }
  assert.equal(drawn((g) => g.text(' ', 0, 0, 16)).pts.length, 0, 'незнакомый знак — пропуск');
  assert.ok(A.textWidth('1250', 22) > A.textWidth('125', 22));
  assert.ok(Math.abs(A.textWidth('7', 16) - A.GLYPH_W) < 1e-9);
  const big = box(drawn((g) => g.text('8', 0, 0, 84)).pts);
  assert.ok(big.y1 - big.y0 > 70, 'крупная цифра для отсчёта');
});

test('каракули на полях: каждая рисуется в своей рамке и есть в какой-нибудь зоне', () => {
  const names = Object.keys(A.DOODLES);
  assert.ok(names.length >= 40, `каракулей ${names.length}`);
  const zoned = new Set(A.ZONES.flatMap((z) => z.list));
  for (const name of names) {
    const ctx = drawn((g) => A.DOODLES[name](g));
    assert.ok(ctx.pts.length > 10, name);
    const b = box(ctx.pts);
    // картинка каракули — 84×84 со сдвигом 7: всё, что дальше, обрезалось бы
    assert.ok(b.x0 > -6 && b.x1 < 76 && b.y0 > -6 && b.y1 < 76, `${name}: вылезла из рамки (${b.x0.toFixed(0)}…${b.x1.toFixed(0)}, ${b.y0.toFixed(0)}…${b.y1.toFixed(0)})`);
    assert.ok(b.x1 - b.x0 > 30 && b.y1 - b.y0 > 20, `${name}: слишком мелкая`);
    assert.ok(zoned.has(name), `${name}: ни в одной зоне`);
  }
  for (const z of A.ZONES) {
    assert.ok(z.list.length >= 8, z.name);
    for (const name of z.list) assert.ok(A.DOODLES[name], `${z.name}: нет каракули «${name}»`);
  }
});

test('зоны сменяются с высотой и потом идут по кругу', () => {
  assert.equal(A.zoneAt(0).name, 'двор');
  assert.equal(A.zoneAt(249).name, 'двор');
  assert.equal(A.zoneAt(250).name, 'небо');
  assert.equal(A.zoneAt(700).name, 'урок');
  assert.equal(A.zoneAt(1200).name, 'космос');
  assert.equal(A.zoneAt(2000).name, 'каракули');
  assert.equal(A.zoneAt(A.ZONE_LOOP).name, 'небо', 'выше — снова небо: двор бывает только у земли');
  assert.equal(A.zoneAt(A.ZONE_LOOP + 400).name, 'урок');
  const seen = new Set();
  for (let c = A.ZONE_LOOP; c < A.ZONE_LOOP * 3; c += 50) seen.add(A.zoneAt(c).name);
  assert.deepEqual([...seen].sort(), ['каракули', 'космос', 'небо', 'урок']);
  for (let k = 1; k < A.ZONES.length; k++) assert.ok(A.ZONES[k].from > A.ZONES[k - 1].from);
});
