// Пещеры и осенняя чаща — четвёртое и пятое места мира «Лисьей охоты», нарисованные кодом. Без DOM при импорте.
//
// Комнату по-прежнему собирает art-tiles.js (paintRoom и propsOf); здесь только то, чем эти места отличаются от
// леса: краски, рисунки земли, воды, особых клеток и колючек, свои картинки предметов. Всё записывается через
// addBiome(): чего место не задало, берётся лесное, но в красках места. Тропы, норы, лисью нору, тени под
// преградами, пятна света и подножие стены рисует лесной код — ему достаются только краски.
//
// Пещеры — тёмный сланцевый пол в трещинах и жилках, провал вместо воды, горячий разлом вместо травы, осколки
// кристаллов вместо колючек. Верхняя стена — пласты породы со сталактитами, под ними каменные столбы; по бокам
// и снизу — глыбы. Свет здесь дают кристаллы и грибы: их отсвет нарисован в земле. Пол нарочно не чёрный —
// на нём должны читаться и зверьки, и красные зоны.
// Осенняя чаща — ковёр опавших листьев на тёмной земле, тихий пруд с листьями на воде, кучи листвы, шиповник;
// клёны, дубы и берёзы в багрянце и золоте, чёрное голое дерево, стога, тыквы. Солнце низко: тени длинные,
// свет тёплый. Земля темнее и глуше лисьей шубки — иначе рыжая лиса на рыжем пропадает.
//
// Тона листвы (look.tone) месту считает addBiome по его краскам; свои добавки дописываются сразу после него —
// картинки рисуются позже, когда их попросят, и читают уже полный набор.

import { T, TILE } from './tiles.js';
import {
  addBiome, TAU, INK, SHADOW, mix, fade, dim, lift, hashInt, h01, rngOf, pick, spot, disc, oval, solid, puff,
  jitterCircles, curve, limb, leaf, leaves, tinted, contours, regionPath, paintGround, tuft, pebble, paintThorns, reeds,
  standing, trunk, paintOak, paintBirch, rock, paintStump, logBody, sparkle, paintDoorNorth, paintDoorSouth, paintDoorSide,
} from './art-tiles.js';

// ---------- общее ----------

/** Ломаная в текущий путь (без beginPath: много линий собираются в один проход). p — плоский список x, y. */
function trace(g, p, dx = 0, dy = 0) {
  g.moveTo(p[0] + dx, p[1] + dy);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] + dx, p[i + 1] + dy);
}

/** Все ломаные списка одной обводкой. */
function strokeAll(g, lines, color, width, dx = 0, dy = 0) {
  if (!lines.length) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  for (const p of lines) trace(g, p, dx, dy);
  g.stroke();
}

/** Изломанная линия от (ax, ay) к (bx, by): n звеньев, узлы уходят в стороны до amp. */
function jag(ax, ay, bx, by, rnd, n, amp) {
  const p = [ax, ay];
  for (let k = 1; k < n; k++) p.push(ax + ((bx - ax) * k) / n + (rnd() - 0.5) * 2 * amp, ay + ((by - ay) * k) / n + (rnd() - 0.5) * 2 * amp);
  p.push(bx, by);
  return p;
}

// =====================================================================================================
// ПЕЩЕРЫ
// =====================================================================================================

// Первые строки — из общей палитры игры; ниже — свои добавки. Чего здесь нет, остаётся лесным (солома, кость).
const CAVE_PAL = {
  ground: '#5a5868', groundLight: '#6f6d80', groundDark: '#454355', groundDeep: '#2f2e3c',
  flowers: ['#8dffb0', '#c8a8ff', '#7fe0ff'], flowerCore: ['#f4fff8', '#ffffff'],
  path: '#7b7990', pathDark: '#4b495b',
  trunk: '#7a7890', trunkDark: '#4a485a',
  canopy: '#504e62', canopyLight: '#74728a', canopyDark: '#3a3849', canopyDeep: '#292834',
  stump: '#9a98aa', rock: '#8a8898', rockDark: '#5b596d', rockLight: '#b9b7ca',
  bush: '#d9cfe9', berry: '#b06cff',
  water: '#15141c', waterDeep: '#0b0a11', shine: '#9a98b4',

  under: '#1b1a25',                      // порода под стенами и темнота вокруг комнаты
  sun: '#4c4a5e',                        // солнца тут нет: пятна света едва заметны
  shore: '#807e94', moss: '#57c2a6', toadstool: '#8dffb0',
  hole: '#262431', holeDeep: '#0c0b12', straw: '#cfc5a6', bone: '#ece6dc', feather: '#dfe3ee',
  crystal: '#7fe0ff', crystalLight: '#dcf7ff', crystalDark: '#3d9fd0',
  violet: '#b06cff', violetLight: '#e6d0ff', violetDark: '#6f3cc4',
  glow: '#8dffb0', cap: '#c8a8ff', pale: '#efe7f7', paleShade: '#b3a3cc', stem: '#f6f1fb',
  hot: '#ff7a3c', hotCore: '#ffd76a', hotDark: '#3c1a1c',
  pitWall: '#3f3d50', pitLine: '#64617f',
};

/** Краски кристалла: голубого или лилового. */
const gem = (P, violet) => (violet
  ? { base: P.violet, light: P.violetLight, dark: P.violetDark, line: dim(P.violetDark, 0.5) }
  : { base: P.crystal, light: P.crystalLight, dark: P.crystalDark, line: dim(P.crystalDark, 0.5) });

/** Тона породы в стене: дальняя — почти в темноте, ближняя — на свету. */
const wallTones = (P) => ({
  far: { base: mix(P.canopyDark, P.canopyDeep, 0.5), light: P.canopy, dark: P.under, line: mix(P.canopyDeep, INK, 0.5) },
  mid: { base: mix(P.canopy, P.canopyDark, 0.5), light: P.canopyLight, dark: P.canopyDeep, line: dim(P.canopyDark, 0.6) },
  near: { base: mix(P.canopy, P.canopyLight, 0.4), light: lift(P.canopyLight, 0.3), dark: P.canopyDark, line: dim(P.canopy, 0.64) },
});

// ---------- приёмы: кристалл, глыба, сталагмит, пласт, гриб ----------

/**
 * Кристалл-шип: от основания (x, y) по углу ang на длину len. Грань, что смотрит на свет (влево вверх), светлая,
 * другая — тёмная; вдоль светлого ребра — блик. C — краски из gem().
 */
function shard(g, x, y, len, wide, ang, C, lw = 1.3) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let vx = -uy;
  let vy = ux;
  if (vx * 0.62 + vy * 0.78 < 0) {       // v — в сторону от света
    vx = -vx;
    vy = -vy;
  }
  const h = wide / 2;
  const s = len * 0.74;
  const X = (a, b) => x + ux * a + vx * b;
  const Y = (a, b) => y + uy * a + vy * b;
  const poly = (pts) => {
    g.beginPath();
    g.moveTo(X(pts[0], pts[1]), Y(pts[0], pts[1]));
    for (let i = 2; i < pts.length; i += 2) g.lineTo(X(pts[i], pts[i + 1]), Y(pts[i], pts[i + 1]));
    g.closePath();
  };
  const all = [0, -h * 0.8, s, -h, len, 0, s, h, 0, h * 0.8];
  g.lineJoin = 'round';
  g.fillStyle = C.dark;
  poly(all);
  g.fill();
  g.fillStyle = C.base;
  poly([0, -h * 0.8, s, -h, len, 0, s, h * 0.12, 0, h * 0.1]);
  g.fill();
  g.fillStyle = C.light;
  poly([len * 0.1, -h * 0.66, s, -h * 0.8, len * 0.94, -h * 0.06, s * 0.97, -h * 0.34, len * 0.12, -h * 0.3]);
  g.fill();
  g.strokeStyle = C.line;
  g.lineWidth = lw;
  poly(all);
  g.stroke();
}

/**
 * Друза: пять кристаллов веером и два маленьких спереди. (cx, base) — середина основания, k — размер
 * (1 — около 40 в высоту). o: halo — сила сияния позади (false — без него), lw — обводка.
 */
function crystals(g, cx, base, k, C, seed, o = {}) {
  const rnd = rngOf(seed);
  if (o.halo !== false) spot(g, cx, base - 20 * k, 25 * k, 25 * k, C.base, o.halo ?? 0.32);
  const lw = o.lw ?? Math.max(0.9, Math.min(1.5, 1.2 * k));
  for (const [lean, len, wide, dx] of [[-0.95, 15, 5.2, -8], [0.85, 17, 5.6, 8], [-0.45, 27, 6.6, -4], [0.4, 23, 6.2, 5], [0, 36, 8, 0]]) {
    shard(g, cx + dx * k, base - (lean ? 1 : 0), (len + rnd() * 4) * k, wide * k, -Math.PI / 2 + lean * 0.62 + (rnd() - 0.5) * 0.12, C, lw);
  }
  shard(g, cx - 5.5 * k, base + 1, 11 * k, 5 * k, -Math.PI / 2 - 0.55, C, lw);
  shard(g, cx + 6 * k, base + 1.5, 9 * k, 4.6 * k, -Math.PI / 2 + 0.62, C, lw);
}

/**
 * Глыба, как её видно сверху и чуть спереди: неровный многоугольник гранями от вершины; грань светлее, если
 * смотрит на свет. C — { base, light, dark, line }.
 */
function stone(g, cx, cy, rx, ry, seed, C, o = {}) {
  const rnd = rngOf(seed);
  const n = 9;
  const a0 = rnd() * TAU;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const k = 0.84 + rnd() * 0.22;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const path = (c) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  const ax = cx - rx * 0.16 + (rnd() - 0.5) * rx * 0.14;
  const ay = cy - ry * 0.26;
  solid(g, path, cx, cy, rx, ry, C.base, {
    light: 0.2, dark: o.dark ?? 0.4, line: C.line ?? dim(C.base, 0.66), lw: o.lw ?? 1.6, rim: 0.55,
    inside: (c) => {
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n];
        const mx = (p[0] + q[0]) / 2 - ax;
        const my = (p[1] + q[1]) / 2 - ay;
        const d = Math.hypot(mx, my) || 1;
        const lit = (-mx * 0.62 - my * 0.78) / d;
        const tone = lit > 0 ? mix(C.base, C.light, Math.min(1, lit * 0.95)) : mix(C.base, C.dark, Math.min(1, -lit * 1.1));
        c.fillStyle = tone;
        c.strokeStyle = tone;
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(p[0], p[1]);
        c.lineTo(q[0], q[1]);
        c.closePath();
        c.fill();
        c.stroke();
      }
      // трещина от вершины вниз
      if (rx > 8) {
        c.strokeStyle = fade(C.dark, 0.7);
        c.lineWidth = 0.9;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(ax + rx * 0.2, ay + ry * 0.1);
        c.lineTo(ax + rx * (0.3 + rnd() * 0.2), ay + ry * 0.5);
        c.lineTo(ax + rx * (0.15 + rnd() * 0.3), ay + ry * 0.95);
        c.stroke();
      }
    },
  });
}

/**
 * Сталагмит (down — сталактит): конус с мягкой макушкой и наплывами-кольцами. (x, base) — середина основания,
 * tall — высота, wide — ширина у основания. o: lean — наклон макушки, color, dark, flare, rings, lw.
 */
function cone(g, x, base, tall, wide, P, seed, o = {}) {
  const s = o.down ? -1 : 1;
  const w0 = wide / 2;
  const flare = o.flare ?? wide * 0.16;
  const lean = o.lean ?? 0;
  const color = o.color ?? P.trunk;
  const dark = o.dark ?? P.trunkDark;
  const Y = (t) => base - s * tall * t;
  const X = (t) => x + lean * t * t;
  const half = (t) => w0 * (1 - t) ** 0.8;        // полуширина на высоте t: 0 — основание, 1 — макушка
  const path = (c) => {
    c.moveTo(x - w0 - flare, base + s);
    c.quadraticCurveTo(x - w0 * 0.86, Y(0.2), X(0.5) - half(0.5), Y(0.5));
    c.quadraticCurveTo(X(0.86) - half(0.86) * 0.6, Y(0.9), X(1), Y(1));
    c.quadraticCurveTo(X(0.86) + half(0.86) * 0.6, Y(0.9), X(0.5) + half(0.5), Y(0.5));
    c.quadraticCurveTo(x + w0 * 0.86, Y(0.2), x + w0 + flare, base + s);
    c.quadraticCurveTo(x, base + s * 3, x - w0 - flare, base + s);
    c.closePath();
  };
  solid(g, path, x + lean / 2, base - (s * tall) / 2, w0 + flare, tall / 2 + 2, color, {
    light: 0.3, dark: 0.3, lw: o.lw ?? 1.6, rim: 0.5, line: o.line ?? dim(color),
    inside: (c) => {
      const grad = c.createLinearGradient(x - w0, 0, x + w0, 0);
      grad.addColorStop(0, fade(lift(color, 0.5), 0.6));
      grad.addColorStop(0.42, fade(color, 0));
      grad.addColorStop(1, fade(dark, 0.92));
      c.fillStyle = grad;
      c.fillRect(x - w0 - flare - 4 - Math.abs(lean), Math.min(base, Y(1)) - 4, wide + flare * 2 + 8 + Math.abs(lean) * 2, tall + 8);
      const rnd = rngOf(seed);
      c.lineCap = 'round';
      // наплывы: тёмная дуга поперёк, под ней — светлая полоска
      const n = o.rings ?? Math.max(2, Math.round(tall / 13));
      for (let i = 1; i <= n; i++) {
        const t = (i - 0.3 + rnd() * 0.4) / (n + 1);
        const hw = half(t) + (t < 0.2 ? flare * (1 - t / 0.2) : 0) + 1;
        const cy = Y(t);
        const cx = X(t);
        const sag = s * (1.5 + hw * 0.14);
        c.strokeStyle = fade(dark, 0.6);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx - hw, cy - sag * 0.4);
        c.quadraticCurveTo(cx, cy + sag, cx + hw, cy - sag * 0.4);
        c.stroke();
        c.strokeStyle = fade(lift(color, 0.6), 0.42);
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(cx - hw * 0.8, cy + s * 1.2);
        c.quadraticCurveTo(cx - hw * 0.3, cy + sag + s * 1.3, cx + hw * 0.1, cy + sag * 0.8 + s * 1.3);
        c.stroke();
      }
    },
  });
}

/** Наплывы на столбе, нарисованном лесным стволом: дуги поперёк и светлая полоска под каждой. */
function bands(g, x, base, tall, wide, taper, lean, seed, P, n = 3) {
  const rnd = rngOf(seed);
  const w0 = wide / 2;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t = 0.16 + ((i + 0.3 + rnd() * 0.4) / n) * 0.62;
    const u = Math.max(0, (t - 0.3) / 0.7);
    const hw = (t < 0.3 ? w0 * 0.96 : w0 * 0.92 + (wide * taper - w0 * 0.92) * u) - 1.2;
    const cx = x + lean * (t < 0.3 ? (0.25 * t) / 0.3 : 0.25 + 0.75 * u);
    const cy = base - tall * t;
    g.strokeStyle = fade(P.trunkDark, 0.55);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - hw, cy - 0.8);
    g.quadraticCurveTo(cx, cy + 2.6, cx + hw, cy - 0.8);
    g.stroke();
    g.strokeStyle = fade(lift(P.trunk, 0.6), 0.4);
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(cx - hw * 0.85, cy + 0.6);
    g.quadraticCurveTo(cx - hw * 0.3, cy + 3.2, cx + hw * 0.1, cy + 3.3);
    g.stroke();
  }
}

/**
 * Пласт породы: длинная глыба с неровным верхом и низом. Верхняя грань на свету, низ в тени, вдоль — слой,
 * поперёк — трещины. C — { base, light, dark, line }.
 */
function slab(g, x0, x1, y0, y1, seed, C, o = {}) {
  const rnd = rngOf(seed);
  const n = Math.max(2, Math.round((x1 - x0) / 12));
  const top = [];
  const bot = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const end = i === 0 || i === n;
    top.push([x + (end ? 0 : (rnd() - 0.5) * 4), y0 + (end ? 3.5 + rnd() * 2 : rnd() * 2.8)]);
    bot.push([x + (end ? (i ? -2 : 2) : (rnd() - 0.5) * 5), y1 - (end ? 3 + rnd() * 2 : rnd() * 3.2)]);
  }
  const path = (c) => {
    c.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= n; i++) c.lineTo(top[i][0], top[i][1]);
    for (let i = n; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
    c.closePath();
  };
  const tall = y1 - y0;
  solid(g, path, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, tall / 2, C.base, {
    light: o.light ?? 0.24, dark: o.dark ?? 0.34, line: C.line, lw: o.lw ?? 1.6, rim: 0.45,
    inside: (c) => {
      const grad = c.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, fade(C.light, 0.7));
      grad.addColorStop(0.28, fade(C.light, 0.08));
      grad.addColorStop(0.6, fade(C.dark, 0));
      grad.addColorStop(1, fade(C.dark, 0.9));
      c.fillStyle = grad;
      c.fillRect(x0 - 3, y0 - 1, x1 - x0 + 6, tall + 2);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = fade(C.dark, 0.55);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0, y0 + tall * 0.52);
      for (let i = 1; i <= n; i++) c.lineTo(x0 + ((x1 - x0) * i) / n, y0 + tall * (0.46 + rnd() * 0.14));
      c.stroke();
      for (let i = o.cracks ?? 3; i > 0; i--) {
        const sx = x0 + 6 + rnd() * (x1 - x0 - 12);
        const sy = y0 + 2 + rnd() * tall * 0.3;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + (rnd() - 0.5) * 4, sy + tall * 0.3);
        c.lineTo(sx + (rnd() - 0.5) * 6, sy + tall * (0.5 + rnd() * 0.3));
        c.stroke();
      }
    },
  });
}

/**
 * Гриб: ножка и шляпка-купол с пластинками снизу. (x, base) — где ножка входит в землю, tall — высота ножки,
 * r — радиус шляпки, lean — куда клонится. C — { cap, stem, under, dot, line }.
 */
function mushroom(g, x, base, tall, r, C, seed, lean = 0) {
  const tx = x + lean;
  const ty = base - tall;
  limb(g, [x, base, x + lean * 0.3, base - tall * 0.5, tx, ty + r * 0.2], Math.max(1.6, r * 0.42), C.stem, dim(C.stem, 0.5), 1);
  const cap = (c) => {
    c.moveTo(tx - r, ty + r * 0.22);
    c.bezierCurveTo(tx - r * 1.02, ty - r * 0.95, tx + r * 1.02, ty - r * 0.95, tx + r, ty + r * 0.22);
    c.quadraticCurveTo(tx, ty + r * 0.62, tx - r, ty + r * 0.22);
    c.closePath();
  };
  solid(g, cap, tx, ty - r * 0.2, r, r * 0.7, C.cap, {
    lw: Math.min(1.4, 0.8 + r * 0.1), line: C.line, light: 0.55, dark: 0.45,
    inside: (c) => {
      oval(c, tx, ty + r * 0.36, r * 0.9, r * 0.2, fade(C.under, 0.7));
      const rnd = rngOf(seed);
      for (let i = 0; i < 3; i++) disc(c, tx + (rnd() - 0.5) * r * 1.2, ty - r * (0.1 + rnd() * 0.42), r * (0.09 + rnd() * 0.08), fade(C.dot, 0.8));
    },
  });
}

/**
 * Завал в прямоугольнике: глыбы рядами сверху вниз, между рядами торчат шипы кристаллов. Закрытая дверь пещеры
 * должна читаться сразу: не пройти.
 */
function rubbleFill(g, x0, y0, x1, y1, seed, look) {
  const P = look.pal;
  const W = wallTones(P);
  const rnd = rngOf(seed);
  const w = x1 - x0;
  const h = y1 - y0;
  const rows = Math.max(2, Math.round(h / 15));
  const cols = Math.max(2, Math.round(w / 19));
  const rx = (w / cols) * 0.66;
  const ry = (h / rows) * 0.62;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (rnd() > 0.6) continue;
      const sx = x0 + ((i + 0.2 + rnd() * 0.6) / cols) * w;
      shard(g, sx, y0 + ((j + 0.6) / rows) * h, 10 + rnd() * 7, 4.2 + rnd() * 2, -Math.PI / 2 + (rnd() - 0.5) * 1.1, gem(P, rnd() < 0.4));
    }
    for (let i = 0; i < cols; i++) {
      // ряды со сдвигом, как в кладке: щелей насквозь нет
      const cx = x0 + ((i + 0.5 + (j % 2 ? 0.22 : -0.22) + (rnd() - 0.5) * 0.3) / cols) * w;
      const cy = y0 + ((j + 0.6 + (rnd() - 0.5) * 0.24) / rows) * h;
      const tone = (i + j) % 3 === 0 ? W.near : { base: mix(P.rock, P.rockDark, 0.5), light: P.rockLight, dark: P.canopyDark, line: dim(P.rockDark, 0.6) };
      stone(g, Math.min(x1 - rx, Math.max(x0 + rx, cx)), cy, rx, ry, seed + j * 16 + i, tone);
    }
  }
}

// ---------- земля пещеры ----------

/** Каменный пол: мягкие пятна, сеть трещин (часть связей пропущена — выходит треснувший камень, а не кладка), жилки. */
function caveGround(g, R, P) {
  paintGround(g, R, P);
  const S = 52;
  const node = (i, j) => [(i + 0.5 + (h01(R.seed, i, j, 311) - 0.5) * 0.7) * S, (j + 0.5 + (h01(R.seed, i, j, 312) - 0.5) * 0.7) * S];
  const cracks = [];
  const hair = [];
  for (let j = -1; j * S < R.H; j++) {
    for (let i = -1; i * S < R.W; i++) {
      const a = node(i, j);
      for (let d = 0; d < 2; d++) {
        if (h01(R.seed, i, j, 313 + d) < 0.42) continue;
        const b = d ? node(i, j + 1) : node(i + 1, j);
        const rnd = rngOf(hashInt(R.seed, i, j, 315 + d));
        // трещина не всегда доходит до узла
        const k = rnd() < 0.7 ? 1 : 0.55 + rnd() * 0.3;
        const p = jag(a[0], a[1], a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, rnd, 4, 4.5);
        cracks.push(p);
        if (rnd() < 0.55) {
          const at = 2 + 2 * Math.floor(rnd() * 3);
          const ang = rnd() * TAU;
          const len = 7 + rnd() * 9;
          hair.push(jag(p[at], p[at + 1], p[at] + Math.cos(ang) * len, p[at + 1] + Math.sin(ang) * len, rnd, 2, 2));
        }
      }
    }
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // светлая кромка — справа снизу от трещины: туда падает свет
  strokeAll(g, cracks, fade(P.groundLight, 0.55), 1, 0.9, 1);
  strokeAll(g, cracks, fade(P.groundDeep, 0.85), 1.3);
  strokeAll(g, hair, fade(P.groundDeep, 0.6), 0.9);
  // жилки минерала: слабое свечение и блёстки вдоль
  const rnd = rngOf(hashInt(R.seed, 321));
  for (let i = Math.round((R.W * R.H) / 42000); i > 0; i--) {
    const color = i % 3 === 0 ? P.violet : P.crystal;
    let x = T + rnd() * (R.W - 2 * T);
    let y = T + rnd() * (R.H - 2 * T);
    let a = rnd() * TAU;
    const p = [x, y];
    for (let k = 0; k < 5; k++) {
      a += (rnd() - 0.5) * 1.1;
      x += Math.cos(a) * (12 + rnd() * 10);
      y += Math.sin(a) * (12 + rnd() * 10) * 0.8;
      p.push(x, y);
    }
    curve(g, p);
    g.strokeStyle = fade(color, 0.12);
    g.lineWidth = 3.4;
    g.stroke();
    curve(g, p);
    g.strokeStyle = fade(color, 0.42);
    g.lineWidth = 1;
    g.stroke();
    for (let k = 2; k < p.length - 2; k += 2) {
      if (rnd() < 0.7) sparkle(g, p[k] + (rnd() - 0.5) * 3, p[k + 1] + (rnd() - 0.5) * 3, 1.5 + rnd() * 1.2, fade(lift(color, 0.7), 0.85));
    }
  }
}

/** Острый осколок: треугольник. */
function chip(g, x, y, s, a, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  g.lineTo(x + Math.cos(a + 2.3) * s * 0.7, y + Math.sin(a + 2.3) * s * 0.7);
  g.lineTo(x + Math.cos(a - 2) * s * 0.55, y + Math.sin(a - 2) * s * 0.55);
  g.closePath();
  g.fill();
}

/** Светящиеся грибки на полу: плоские, без обводки — по ним ходят. */
function glowCaps(g, x, y, P, rnd) {
  const color = rnd() < 0.7 ? P.glow : P.cap;
  spot(g, x, y - 1, 9, 6.5, color, 0.26);
  for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
    const mx = x + (rnd() - 0.5) * 8;
    const my = y + (rnd() - 0.5) * 4;
    const s = 0.8 + rnd() * 0.5;
    g.fillStyle = P.stem;
    g.fillRect(mx - 0.5 * s, my - 2.4 * s, s, 2.6 * s);
    g.fillStyle = dim(color, 0.45);
    g.beginPath();
    g.ellipse(mx, my - 2.3 * s, 2.5 * s, 1.9 * s, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(mx, my - 2.5 * s, 2 * s, 1.5 * s, 0, Math.PI, TAU);
    g.fill();
    disc(g, mx - 0.7 * s, my - 3.3 * s, 0.45 * s, '#ffffff');
  }
}

/** Мелочи на полу: щебень, осколки, крошка кристаллов, грибки у стен; под кристаллами и грибами — их отсвет. */
function caveDecals(g, R, P) {
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const code = R.at(x, y);
      if (code !== TILE.FLOOR && code !== TILE.PATH) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 331));
      const edgy = R.edgy(x, y);
      const bare = code === TILE.PATH;
      const px = () => (x + 0.1 + rnd() * 0.8) * T;
      const py = () => (y + 0.14 + rnd() * 0.8) * T;
      if (rnd() < (bare ? 0.3 : edgy ? 0.6 : 0.2)) {
        const cx = px();
        const cy = py();
        for (let i = 2 + Math.floor(rnd() * 3); i > 0; i--) pebble(g, cx + (rnd() - 0.5) * 11, cy + (rnd() - 0.5) * 7, 1.3 + rnd() * 1.9, P, rnd);
      }
      if (!bare && rnd() < (edgy ? 0.4 : 0.12)) {
        const cx = px();
        const cy = py();
        for (let i = 2 + Math.floor(rnd() * 2); i > 0; i--) {
          const sx = cx + (rnd() - 0.5) * 9;
          const sy = cy + (rnd() - 0.5) * 6;
          const a = rnd() * TAU;
          chip(g, sx + 0.6, sy + 0.8, 2.6, a, fade(P.groundDeep, 0.6));
          chip(g, sx, sy, 2.4, a, rnd() < 0.5 ? mix(P.rock, P.ground, 0.35) : P.groundLight);
        }
      }
      if (!bare && edgy && rnd() < 0.14) glowCaps(g, px(), py(), P, rnd);
      if (!bare && rnd() < 0.05) {
        const cx = px();
        const cy = py();
        const color = rnd() < 0.6 ? P.crystal : P.violet;
        for (let i = 0; i < 3; i++) chip(g, cx + (rnd() - 0.5) * 7, cy + (rnd() - 0.5) * 5, 1.6 + rnd(), rnd() * TAU, color);
        sparkle(g, cx, cy - 1, 2, fade('#ffffff', 0.8));
      }
    }
  }
  // отсвет на полу: кристаллы светят голубым или лиловым, грибы — зелёным
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const code = R.at(x, y);
      if (code !== TILE.TALL && code !== TILE.LOW) continue;
      const s = standing(R, CAVE, x, y);
      if (!s) continue;
      if (s.name === 'crystal') {
        const color = s.v === 1 ? P.violet : P.crystal;
        spot(g, s.x, s.y + 1, 38, 23, color, 0.3);
        spot(g, s.x, s.y + 1, 19, 11, lift(color, 0.4), 0.26);
      } else if (s.name === 'shrooms') spot(g, s.x, s.y, 23, 14, s.v ? P.cap : P.glow, 0.3);
    }
  }
}

/** Горячий разлом: опалённый камень, жар и светящиеся трещины от клетки к клетке — сюда лучше не наступать. */
function hotCracks(g, R, P) {
  const hot = (x, y) => R.at(x, y) === TILE.SPECIAL;
  const cells = [];
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (hot(x, y)) cells.push([x, y]);
  if (!cells.length) return;
  const mx = (x, y) => (x + 0.5 + (R.rnd(x, y, 341) - 0.5) * 0.5) * T;
  const my = (x, y) => (y + 0.5 + (R.rnd(x, y, 342) - 0.5) * 0.5) * T;
  for (const [x, y] of cells) spot(g, mx(x, y), my(x, y), 26, 22, P.hotDark, 0.62);
  for (const [x, y] of cells) spot(g, mx(x, y), my(x, y), 23, 19, P.hot, 0.22);
  const main = [];
  const side = [];
  const embers = [];
  for (const [x, y] of cells) {
    const ax = mx(x, y);
    const ay = my(x, y);
    const rnd = rngOf(hashInt(R.seed, x, y, 343));
    let linked = hot(x - 1, y) || hot(x, y - 1);
    for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
      if (!hot(nx, ny)) continue;
      linked = true;
      main.push(jag(ax, ay, mx(nx, ny), my(nx, ny), rnd, 4, 4.5));
    }
    if (!linked) {
      const a = rnd() * Math.PI;
      main.push(jag(ax - Math.cos(a) * 12, ay - Math.sin(a) * 10, ax + Math.cos(a) * 12, ay + Math.sin(a) * 10, rnd, 4, 3.5));
    }
    for (let i = 0; i < 2; i++) {
      const a = rnd() * TAU;
      const len = 8 + rnd() * 7;
      side.push(jag(ax, ay, ax + Math.cos(a) * len, ay + Math.sin(a) * len * 0.8, rnd, 3, 2.4));
    }
    for (let i = 0; i < 3; i++) embers.push(ax + (rnd() - 0.5) * 26, ay + (rnd() - 0.5) * 22, 0.6 + rnd() * 0.6);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  strokeAll(g, main, P.hotDark, 6.4);
  strokeAll(g, side, P.hotDark, 4.4);
  strokeAll(g, main, P.hot, 3.6);
  strokeAll(g, side, P.hot, 2.2);
  strokeAll(g, main, P.hotCore, 1.4);
  strokeAll(g, side, fade(P.hotCore, 0.9), 0.8);
  for (let i = 0; i < embers.length; i += 3) disc(g, embers[i], embers[i + 1], embers[i + 2], P.hotCore);
}

/**
 * Провал вместо воды: светлая каменная кромка ловит свет, под дальним (верхним и левым) краем видна стенка,
 * уходящая вниз, дальше — темнота с линиями уступов. Должно читаться сразу: дыра, не пройти.
 */
function cavePit(g, R, P) {
  const pit = (x, y) => R.at(x, y) === TILE.WATER;
  const loops = contours(R.w, R.h, pit);
  if (!loops.length) return;
  const s = R.seed + 7;
  const edge = (grow) => regionPath(g, loops, s, 13, 2.4, grow, 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  edge(6.6);
  g.fillStyle = fade(P.groundDeep, 0.62);
  g.fill();
  edge(5);
  g.fillStyle = mix(P.groundLight, P.rockLight, 0.42);
  g.fill();
  edge(1.5);
  g.fillStyle = dim(P.ground, 0.72);
  g.fill();
  edge(0.2);
  g.fillStyle = P.pitWall;
  g.fill();
  g.save();
  edge(0.2);
  g.clip();
  // штрихи по стенке — вниз, под верхним краем
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!pit(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 351));
      g.strokeStyle = fade(P.groundDeep, 0.8);
      g.lineWidth = 1;
      if (!pit(x, y - 1)) {
        for (let i = 0; i < 5; i++) {
          const bx = (x + (i + rnd()) / 5) * T;
          const top = y * T + 1 + rnd() * 3;
          g.beginPath();
          g.moveTo(bx, top);
          g.lineTo(bx + 0.8, top + 5 + rnd() * 6);
          g.stroke();
        }
      }
      if (!pit(x - 1, y)) {
        for (let i = 0; i < 2; i++) {
          const by = (y + (i + rnd()) / 2) * T;
          g.beginPath();
          g.moveTo(x * T + 1, by);
          g.lineTo(x * T + 3.5, by + 4 + rnd() * 3);
          g.stroke();
        }
      }
    }
  }
  // темнота: стенка гаснет книзу, ниже — чернота и края уступов
  g.save();
  g.translate(2, 5.5);
  edge(0.2);
  g.fillStyle = fade(P.water, 0.55);
  g.fill();
  g.restore();
  g.save();
  g.translate(3.5, 11.5);
  edge(0.2);
  g.fillStyle = P.water;
  g.fill();
  edge(-6);
  g.strokeStyle = fade(P.pitLine, 0.42);
  g.lineWidth = 1.2;
  g.stroke();
  edge(-13);
  g.fillStyle = fade(P.waterDeep, 0.85);
  g.fill();
  g.strokeStyle = fade(P.pitLine, 0.2);
  g.lineWidth = 1.1;
  g.stroke();
  g.restore();
  g.restore();
  // камешки на кромке
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!pit(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 353));
      if (!pit(x, y + 1) && rnd() < 0.6) pebble(g, (x + 0.15 + rnd() * 0.7) * T, (y + 1) * T + 3 + rnd() * 2, 1.5 + rnd() * 1.3, P, rnd);
      if (!pit(x, y - 1) && rnd() < 0.5) pebble(g, (x + 0.15 + rnd() * 0.7) * T, y * T - 3 - rnd() * 2, 1.4 + rnd() * 1.2, P, rnd);
      if (!pit(x + 1, y) && rnd() < 0.4) pebble(g, (x + 1) * T + 3 + rnd() * 2, (y + 0.2 + rnd() * 0.6) * T, 1.4 + rnd() * 1.2, P, rnd);
    }
  }
}

/** Осколки кристаллов на полу: острые, светятся — по ним ходят, но больно. Низкие, чтобы не казаться преградой. */
function crystalThorns(g, R, P) {
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.THORN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 361));
      const x0 = x * T;
      const y0 = y * T;
      spot(g, x0 + 16, y0 + 17, 21, 17, mix(P.groundDeep, SHADOW, 0.3), 0.58);
      spot(g, x0 + 16, y0 + 16, 19, 15, P.crystal, 0.2);
      const list = [];
      for (let i = 0; i < 8; i++) list.push([x0 + 2.5 + ((i % 4) + rnd()) * 6.8, y0 + 9 + Math.floor(i / 4) * 11 + rnd() * 9]);
      list.sort((a, b) => a[1] - b[1]);
      let tip = null;
      for (const [bx, by] of list) {
        const len = 6.5 + rnd() * 5.5;
        const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.3;
        oval(g, bx + 1.6, by + 0.6, 3.4, 1.3, fade(SHADOW, 0.32));
        shard(g, bx, by, len, 3 + rnd() * 1.4, ang, gem(P, rnd() < 0.24), 0.9);
        if (!tip || len > tip[2]) tip = [bx + Math.cos(ang) * len, by + Math.sin(ang) * len, len];
      }
      sparkle(g, tip[0], tip[1], 2.6, '#ffffff');
    }
  }
}

// ---------- картинки пещеры ----------

/** Сталагмит: один высокий, пара или приземистый с малышом и кристалликом. */
function paintStalag(g, look, v) {
  const P = look.pal;
  const base = 68;
  const dark = mix(P.trunk, P.trunkDark, 0.4);
  if (v === 0) {
    cone(g, 32.5, base - 0.5, 22, 10, P, 551, { color: dark, lw: 1.4 });
    cone(g, 20, base, 60, 22, P, 552, { lean: 1.5 });
  } else if (v === 1) {
    cone(g, 13.5, base - 1, 40, 15, P, 553, { color: dark, lean: -1.5 });
    cone(g, 28, base, 57, 19, P, 554, { lean: 1 });
  } else {
    cone(g, 21, base, 45, 27, P, 555, {});
    cone(g, 35.5, base + 0.5, 21, 10, P, 556, { color: dark, lw: 1.4, lean: 1 });
    shard(g, 9, base, 10, 4.4, -Math.PI / 2 - 0.4, gem(P, false), 1.1);
  }
}

/** Каменный столб: расходится к основанию, сверху — обломанная площадка, которую видно чуть сверху. */
function paintPillar(g, look, v) {
  const P = look.pal;
  const x = 24;
  const base = 88;
  const lean = v ? -2.5 : 1.5;
  const tall = v ? 70 : 76;
  const wide = v ? 22 : 24;
  if (v) cone(g, 9.5, base + 0.5, 18, 9, P, 571, { rings: 1, lw: 1.4, color: mix(P.trunk, P.trunkDark, 0.4) });
  trunk(g, x, base, tall, wide, P, 572 + v, { flare: 5, taper: 0.4, lean });
  bands(g, x, base, tall, wide, 0.4, lean, 574 + v, P, 4);
  const top = base - tall;
  solid(g, (c) => c.ellipse(x + lean, top, wide * 0.4 + 0.4, 3.6, 0, 0, TAU), x + lean, top, wide * 0.4, 3.6, lift(P.trunk, 0.25), {
    lw: 1.4, line: dim(P.trunk), light: 0.5, dark: 0.3,
    inside: (c) => {
      c.strokeStyle = fade(P.trunkDark, 0.6);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x + lean - 3, top - 1.5);
      c.lineTo(x + lean + 0.5, top + 0.4);
      c.lineTo(x + lean + 4, top - 0.6);
      c.stroke();
    },
  });
  if (!v) shard(g, 37, base + 0.5, 10, 4.2, -Math.PI / 2 + 0.45, gem(P, true), 1.1);
}

/** Большая друза: голубая, лиловая или двойная. Светится сама и освещает пол вокруг (отсвет — в земле). */
function paintCrystal(g, look, v) {
  const P = look.pal;
  crystals(g, v === 2 ? 30 : 34, 62, v === 2 ? 1.08 : 1.25, gem(P, v === 1), 581 + v);
  if (v === 2) crystals(g, 50, 63, 0.6, gem(P, true), 584, { halo: 0.3 });
  rock(g, 22, 65, 16, 8, 585 + v, P, { cracks: 0, lw: 1.4 });
  rock(g, 45, 65.5, 18, 9.5, 587 + v, P, { cracks: 1, lw: 1.4 });
  rock(g, 33, 66.5, 12, 6, 589, P, { cracks: 0, lw: 1.3 });
  sparkle(g, v === 2 ? 26 : 30, 24, 3.2, '#ffffff');
  sparkle(g, v === 2 ? 52 : 47, 40, 2.4, '#ffffff');
}

/** Скала: гранёные глыбы с кристаллами в щели или пятном светящегося лишайника. */
function paintCaveCrag(g, look, v) {
  const P = look.pal;
  if (v === 0) {
    rock(g, 30, 53, 22, 30, 611, P, { cracks: 1 });
    rock(g, 19, 55, 30, 47, 612, P, { cracks: 3 });
    shard(g, 34, 51, 12, 5, -Math.PI / 2 + 0.5, gem(P, false), 1.2);
    shard(g, 38, 54, 8, 4, -Math.PI / 2 + 0.85, gem(P, false), 1.1);
  } else {
    rock(g, 15, 54, 20, 26, 613, P, { cracks: 1 });
    rock(g, 27, 55, 31, 44, 614, P, { cracks: 3, moss: 0.5 });
    shard(g, 9, 53, 10, 4.4, -Math.PI / 2 - 0.5, gem(P, true), 1.1);
  }
}

/** Валун: с лиловым кристалликом, двойной или плоский под лишайником. */
function paintBoulder(g, look, v) {
  const P = look.pal;
  if (v === 0) {
    rock(g, 18, 25, 29, 19, 621, P, { cracks: 2 });
    shard(g, 28, 23.5, 8, 3.6, -Math.PI / 2 + 0.6, gem(P, true), 1);
  } else if (v === 1) {
    rock(g, 15, 24.5, 23, 17, 622, P, {});
    rock(g, 28, 25.5, 13, 9.5, 623, P, { cracks: 1, lw: 1.5 });
  } else rock(g, 18, 25, 32, 14, 624, P, { moss: 0.8, cracks: 1 });
}

/** Светящиеся грибы на камне: зелёные или лиловые. */
function paintShrooms(g, look, v) {
  const P = look.pal;
  const glow = v ? P.cap : P.glow;
  const C = { cap: glow, stem: mix(P.stem, glow, 0.25), under: mix(glow, P.groundDeep, 0.55), dot: '#ffffff', line: dim(glow, 0.58) };
  spot(g, 19, 18, 17, 14, glow, 0.36);
  rock(g, 27.5, 30, 15, 8, 651 + v, P, { cracks: 0, lw: 1.4 });
  mushroom(g, 29, 25, 8, 4.4, C, 652, 1.5);
  mushroom(g, 10.5, 30, 12, 5.2, C, 653, -1.5);
  mushroom(g, 19.5, 30.5, 18, 6.6, C, 654, 0.5);
  mushroom(g, 14.5, 31, 5, 3.2, C, 655, 0);
  sparkle(g, 26, 8, 2, '#ffffff');
}

/** Груда обломков: мелкие камни вповалку. */
function paintRubble(g, look, v) {
  const P = look.pal;
  const dark = { ...P, rock: mix(P.rock, P.rockDark, 0.5) };
  if (v === 0) {
    rock(g, 11.5, 20, 14, 9, 631, dark, { cracks: 1, lw: 1.4 });
    rock(g, 27, 19.5, 17, 12, 632, P, { cracks: 1, lw: 1.5 });
    rock(g, 18.5, 22, 13, 7.5, 633, P, { cracks: 0, lw: 1.4 });
    rock(g, 33.5, 22, 9, 5.5, 634, dark, { cracks: 0, lw: 1.3 });
  } else {
    rock(g, 26, 19, 15, 10, 635, dark, { cracks: 1, lw: 1.4 });
    rock(g, 13, 20.5, 18, 12.5, 636, P, { cracks: 2, lw: 1.5 });
    rock(g, 29.5, 22, 14, 7.5, 637, P, { cracks: 0, lw: 1.4 });
    rock(g, 20, 22.4, 8, 5, 638, dark, { cracks: 0, lw: 1.3 });
    shard(g, 35, 21.5, 6.5, 3, -Math.PI / 2 + 0.5, gem(P, false), 0.9);
  }
}

/** Упавшая колонна на две клетки: два обломка в ряд, на изломе — кольца, как у сталактита на срезе. */
function paintFallen(g, look, v) {
  const P = look.pal;
  const S = { ...P, trunk: mix(P.trunk, P.rock, 0.3), stump: P.stump };
  logBody(g, 39.5, 15.4, 27, 6.6, { ...S, trunk: mix(P.trunk, P.trunkDark, 0.3) }, 641 + v, {});
  logBody(g, 5, 15, 33, 8, S, 643 + v, v ? { moss: 0.6 } : {});
  const rnd = rngOf(645 + v);
  pebble(g, 40, 22.5, 2.2, P, rnd);
  pebble(g, 44.5, 23.5, 1.5, P, rnd);
  if (!v) shard(g, 67, 21, 7, 3.2, -Math.PI / 2 + 0.3, gem(P, false), 0.9);
}

/**
 * Бледные пещерные грибы кучкой — здешний «куст»: его ломают рывком, поэтому он светлее и мягче камней, а тень
 * на земле у него в самой картинке (в фоне от куста нет ничего).
 */
function paintPaleBush(g, look, v) {
  const P = look.pal;
  const front = { cap: P.pale, stem: P.stem, under: P.paleShade, dot: '#ffffff', line: dim(P.paleShade, 0.55) };
  const back = { ...front, cap: mix(P.pale, P.paleShade, 0.5), stem: mix(P.stem, P.paleShade, 0.3) };
  spot(g, 24, 34, 19, 5.4, SHADOW, 0.5);
  oval(g, 23, 33.6, 14.5, 3.6, fade(SHADOW, 0.28));
  const rnd = rngOf(661 + v * 13);
  const j = (n) => (v ? (rnd() - 0.5) * n : 0);
  mushroom(g, 13 + j(3), 33, 16 + j(5), 6.4, back, 662, -2);
  mushroom(g, 33 + j(3), 33, 19 + j(5), 7, back, 663, 2.5);
  mushroom(g, 23 + j(2), 33.5, 24 + j(4), 8.6, front, 664, 0.5 + j(2));
  mushroom(g, 9 + j(1), 34, 8 + j(3), 5, front, 665, -1.5);
  mushroom(g, 37 + j(1), 34.2, 9 + j(3), 5.4, front, 666, 1.5);
  if (v !== 1) mushroom(g, 17, 34.5, 5.5, 3.4, front, 667, 0);
  if (v !== 2) mushroom(g, 29.5, 34.6, 5, 3.2, front, 668, 0.5);
}

/** Столб под верхней стеной: стоит в тени пластов — кверху темнеет и уходит под них. */
function paintCaveWallTrunk(g, look, v) {
  const P = look.pal;
  const x = 22;
  const base = 55;
  const stone1 = mix(P.trunk, P.trunkDark, 0.4);
  const stone2 = mix(P.trunk, P.trunkDark, 0.6);
  if (v === 0) {
    trunk(g, x, base, 52, 25, P, 601, { color: stone1, shade: 32, flare: 4, taper: 0.4 });
    bands(g, x, base, 52, 25, 0.4, 0, 602, P);
  } else if (v === 1) {
    trunk(g, 12.5, base - 1, 51, 12, P, 603, { color: stone2, shade: 32, flare: 2.4, lean: 1.5, taper: 0.38 });
    trunk(g, 30, base, 52, 16, P, 604, { color: stone1, shade: 32, flare: 3, lean: -1.5, taper: 0.4 });
    bands(g, 30, base, 52, 16, 0.4, -1.5, 605, P);
  } else if (v === 2) {
    trunk(g, 20, base, 52, 21, P, 606, { color: stone1, shade: 32, flare: 3.6, lean: 2, taper: 0.42 });
    bands(g, 20, base, 52, 21, 0.42, 2, 607, P);
    cone(g, 35.5, base + 0.5, 17, 9, P, 608, { color: stone2, rings: 1, lw: 1.4 });
  } else {
    trunk(g, x, base, 52, 27, P, 609, { color: stone2, shade: 32, flare: 4, taper: 0.42, lean: -1 });
    bands(g, x, base, 52, 27, 0.42, -1, 610, P);
    shard(g, 35, base, 9, 4, -Math.PI / 2 + 0.4, gem(P, false), 1);
    shard(g, 38.5, base + 0.8, 6, 3.2, -Math.PI / 2 + 0.8, gem(P, false), 0.9);
  }
}

/**
 * Пласты породы над верхней стеной (от x0 до x1): дальний — почти в темноте, средний и карниз на свету;
 * под карнизом висят сталактиты, под ними видны столбы стены.
 */
function ledge(g, look, v, x0, x1, salt) {
  const P = look.pal;
  const W = wallTones(P);
  const rnd = rngOf(salt + v * 37);
  slab(g, x0 + 7 + rnd() * 6, x1 - 7 - rnd() * 6, 7 + rnd() * 3, 30, salt + 11 + v, W.far, { cracks: 2 });
  slab(g, x0 + rnd() * 4, x1 - rnd() * 4, 21 + rnd() * 3, 43, salt + 21 + v, W.mid, { cracks: 4 });
  const lipTop = 36 + rnd() * 2;
  for (let x = x0 + 9 + rnd() * 6; x < x1 - 8; x += 8 + rnd() * 9) {
    const len = 4 + rnd() * 9;
    cone(g, x, 49, len + 3, 5 + rnd() * 3.6, P, salt + 30 + Math.round(x), {
      down: true, color: mix(W.near.base, W.near.dark, rnd() * 0.6), dark: W.near.dark, flare: 1, rings: 1, lw: 1.3, lean: (rnd() - 0.5) * 2,
    });
  }
  return { W, lipTop };
}

function paintCaveWallTop(g, look, v) {
  const P = look.pal;
  const { W, lipTop } = ledge(g, look, v, 4, 112, 700);
  if (v === 1) crystals(g, 33, 40, 0.42, gem(P, false), 751, { halo: 0.34 });
  if (v === 2) crystals(g, 84, 40, 0.42, gem(P, true), 752, { halo: 0.34 });
  slab(g, 7 + (v % 2) * 3, 109 - (v % 3) * 2, lipTop, 52, 741 + v, W.near, { cracks: 5, light: 0.4 });
}

/** То же, но узкое: для стены в одну-две клетки (скала посреди комнаты). */
function paintCaveWallCap(g, look, v) {
  const P = look.pal;
  const { W, lipTop } = ledge(g, look, v, 7, 73, 760);
  if (v === 1) crystals(g, 52, 40, 0.4, gem(P, true), 771, { halo: 0.34 });
  slab(g, 9 + v * 2, 71 - v, lipTop, 52, 781 + v, W.near, { cracks: 3, light: 0.4 });
}

/** Глыбы боковых и нижней стен, вид сверху: нависают над полом — под них заходят. */
function paintCaveWallSide(g, look, v) {
  const P = look.pal;
  const W = wallTones(P);
  const rnd = rngOf(800 + v * 59);
  const j = () => (rnd() - 0.5) * 3.4;
  const put = (x, y, rx, ry, tone, seed) => stone(g, x + j(), y + j(), rx * (0.94 + rnd() * 0.1), ry * (0.94 + rnd() * 0.1), seed + v * 17, tone);
  put(27, 21, 11.5, 9, W.mid, 811);
  put(49, 21, 11.5, 9, W.far, 812);
  put(38, 33, 21, 16.5, W.mid, 813);
  put(22, 38, 13.5, 11, W.far, 814);
  put(54, 37, 14, 11.5, W.mid, 815);
  put(38, 48, 12.5, 9.5, W.far, 816);
  put(31, 27, 13, 10.5, W.near, 817);
  if (v === 1) crystals(g, 50, 33, 0.36, gem(P, false), 821, { halo: 0.36 });
  if (v === 3) crystals(g, 23, 34, 0.34, gem(P, true), 822, { halo: 0.36 });
  if (v === 2) cone(g, 49, 36, 13, 8, P, 823, { color: W.near.base, dark: W.near.dark, rings: 1, lw: 1.3 });
}

/**
 * Дверь верхней стены: два столба и свод из глыб, под сводом сталактиты, у ног столбов светятся кристаллы.
 * Закрытая — проём завален глыбами с шипами кристаллов. Рамка 140×87: проём — от 22 до 118, земля — на 81.
 */
function paintCaveDoorNorth(g, look, v) {
  const P = look.pal;
  const W = wallTones(P);
  const base = 81;
  if (v) rubbleFill(g, 27, 43, 113, base - 2, 901, look);
  trunk(g, 17, base, 50, 17, P, 902, { color: mix(P.trunk, P.trunkDark, 0.35), flare: 3.4, lean: 3, taper: 0.42, shade: 14 });
  trunk(g, 123, base, 50, 17, P, 903, { color: mix(P.trunk, P.trunkDark, 0.5), flare: 3.4, lean: -3, taper: 0.42, shade: 14 });
  bands(g, 17, base, 50, 17, 0.42, 3, 904, P, 2);
  bands(g, 123, base, 50, 17, 0.42, -3, 905, P, 2);
  if (!v) {
    crystals(g, 30.5, base, 0.4, gem(P, false), 906, { halo: 0.4 });
    crystals(g, 110, base, 0.36, gem(P, true), 907, { halo: 0.4 });
  }
  for (const [x, len] of [[41, 8], [56, 5], [86, 6], [99, 9]]) {
    cone(g, x, 29 + Math.abs(x - 70) * 0.1, len + 4, 5.4, P, 908 + x, { down: true, color: W.near.base, dark: W.near.dark, flare: 1, rings: 1, lw: 1.3 });
  }
  // свод: края раньше середины, замковый камень — последним
  for (const i of [0, 6, 1, 5, 2, 4, 3]) {
    const a = Math.PI * (1 - i / 6);
    stone(g, 70 + Math.cos(a) * 52, 34 - Math.sin(a) * 19, 13 - Math.abs(i - 3) * 0.5, 10, 911 + i, i % 2 ? W.mid : W.near);
  }
}

/**
 * Дверь нижней стены, вид сверху: глыбы по краям проёма и каменная перемычка, прогнувшаяся к нам, — тропа ныряет
 * под неё. Рамка 160×90 (рисунок сдвинут на 6 и 5), проём — от 32 до 128 по ширине.
 */
function paintCaveDoorSouth(g, look, v) {
  const P = look.pal;
  const W = wallTones(P);
  g.save();
  g.translate(6, 5);
  if (v) rubbleFill(g, 29, 9, 119, 45, 921, look);
  for (const m of [0, 1]) {
    const X = (x) => (m ? 148 - x : x);
    stone(g, X(15), 22, 12, 10, 931 + m, W.far);
    stone(g, X(5.5), 41, 10, 8.5, 933 + m, W.far);
    stone(g, X(16), 36, 19, 15, 935 + m, W.mid);
  }
  for (const i of [0, 6, 1, 5, 2, 4, 3]) {
    const u = i / 6;
    stone(g, 26 + u * 96, 46 + 24 * (1 - (2 * u - 1) ** 2), 11.5, 9.5, 941 + i, i % 2 ? W.mid : W.near);
  }
  stone(g, 12, 30, 11, 9, 951, W.near);
  stone(g, 137, 31, 10, 8.5, 952, W.near);
  if (!v) {
    crystals(g, 27, 44, 0.3, gem(P, false), 953, { halo: 0.4 });
    crystals(g, 122, 44, 0.3, gem(P, true), 954, { halo: 0.4 });
  }
  g.restore();
}

/**
 * Дверь боковой стены, вид сверху: глыбы над и под проёмом, перемычка выгнута наружу. Рамка 92×156 (рисунок
 * сдвинут на 3 вниз); у левой двери стена — от 48 до 80 по ширине. Правая — её отражение, свет остаётся слева.
 */
function paintCaveDoorSide(g, look, v, flip) {
  const P = look.pal;
  const W = wallTones(P);
  const X = (x) => (flip ? 92 - x : x);
  const salt = flip ? 40 : 0;
  g.save();
  g.translate(0, 3);
  if (v) rubbleFill(g, flip ? 10 : 44, 30, flip ? 48 : 82, 122, 961 + salt, look);
  stone(g, X(58), 9.5, 10, 8, 962 + salt, W.far);
  stone(g, X(46), 13, 9.5, 8, 963 + salt, W.far);
  stone(g, X(70), 23, 11, 9, 964 + salt, W.far);
  stone(g, X(58), 19, 18, 14, 965 + salt, W.mid);
  stone(g, X(54), 14, 11, 8.5, 966 + salt, W.near);
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    stone(g, X(60 - 42 * (1 - (2 * u - 1) ** 2)), 27 + u * 96, 10.5, 10, 971 + salt + i, i % 2 ? W.mid : W.near);
  }
  stone(g, X(70), 127, 11, 9, 981 + salt, W.far);
  stone(g, X(58), 131, 18, 14, 982 + salt, W.mid);
  stone(g, X(44.5), 128, 10.5, 9, 983 + salt, W.far);
  stone(g, X(58), 142, 9.5, 8, 984 + salt, W.far);
  stone(g, X(54), 126, 11, 8.5, 985 + salt, W.near);
  if (!v) crystals(g, X(52), 121, 0.3, gem(P, !flip), 986 + salt, { halo: 0.4 });
  g.restore();
}

const CAVE = addBiome({
  id: 'cave',
  pal: CAVE_PAL,
  tall: [['stalag', 4.5], ['pillar', 2.4], ['crystal', 2.6], ['crag', 1.8]],
  low: [['boulder', 4.5], ['shrooms', 2.6], ['rubble', 3]],
  bush: 'bush',
  ground: caveGround,
  decals: caveDecals,
  special: hotCracks,
  water: cavePit,
  thorns: crystalThorns,
  sprites: {
    stalag: { w: 44, h: 74, ox: 22, oy: 68, variants: 3, paint: paintStalag, foot: [11, 4], crown: 13 },
    pillar: { w: 48, h: 94, ox: 24, oy: 88, variants: 2, paint: paintPillar, foot: [14, 4.8], crown: 17 },
    // у друзы нет тени «кроны»: под ней на полу её собственный свет
    crystal: { w: 68, h: 72, ox: 34, oy: 64, variants: 3, paint: paintCrystal, foot: [17, 4.6] },
    crag: { w: 46, h: 60, ox: 23, oy: 55, variants: 2, paint: paintCaveCrag, foot: [18, 5.6], crown: 16, sit: 11 },
    boulder: { w: 36, h: 28, ox: 18, oy: 25, variants: 3, paint: paintBoulder, foot: [14, 4.6] },
    shrooms: { w: 38, h: 34, ox: 19, oy: 30, variants: 2, paint: paintShrooms, foot: [12, 4] },
    rubble: { w: 40, h: 26, ox: 20, oy: 22, variants: 2, paint: paintRubble, foot: [15, 4.2], sit: 8 },
    biglog: { w: 72, h: 28, ox: 36, oy: 23, variants: 2, paint: paintFallen, foot: [31, 4.6], sit: 8 },
    bush: { w: 46, h: 40, ox: 22, oy: 34, variants: 3, paint: paintPaleBush, foot: [15, 5], sit: 10 },
    wtrunk: { w: 44, h: 58, ox: 22, oy: 55, variants: 4, paint: paintCaveWallTrunk },
    wtop: { w: 116, h: 74, ox: 58, oy: 72, variants: 3, paint: paintCaveWallTop },
    wcap: { w: 80, h: 74, ox: 40, oy: 72, variants: 2, paint: paintCaveWallCap },
    wside: { w: 76, h: 66, ox: 38, oy: 62, variants: 4, paint: paintCaveWallSide },
    door: { w: 140, h: 87, ox: 70, oy: 81, variants: 2, paint: paintCaveDoorNorth },
    'door.s': { w: 160, h: 90, ox: 80, oy: 90, variants: 2, paint: paintCaveDoorSouth },
    'door.w': { w: 92, h: 156, ox: 48, oy: 156, variants: 2, paint: (g, look, v) => paintCaveDoorSide(g, look, v, false) },
    'door.e': { w: 92, h: 156, ox: 44, oy: 156, variants: 2, paint: (g, look, v) => paintCaveDoorSide(g, look, v, true) },
  },
});

// =====================================================================================================
// ОСЕННЯЯ ЧАЩА
// =====================================================================================================

// Земля темнее и глуше, чем в общей палитре: рыжей лисе и светлому кролику нужен фон, с которым они не сольются.
const AUTUMN_PAL = {
  ground: '#a07842', groundLight: '#bb9252', groundDark: '#876332', groundDeep: '#604524',
  flowers: ['#f2b632', '#e4572e', '#fff3c4'], flowerCore: ['#8a3a1e', '#7a4a24'],
  path: '#c2a27a', pathDark: '#96764e',
  trunk: '#6a4428', trunkDark: '#3f2818',
  canopy: '#e0672e', canopyLight: '#f5a03c', canopyDark: '#b8431e', canopyDeep: '#7a2a18',
  stump: '#b98a56', rock: '#a59c96', rockDark: '#786e6a', rockLight: '#d2c9bf',
  bush: '#c79a3a', berry: '#e4472e',
  water: '#4a7a9a', waterDeep: '#345a78', shine: '#b9d6e6',

  under: mix('#7a2a18', SHADOW, 0.55),   // земля под кронами и глубина чащи
  sun: '#ffd9a0', shore: '#8a6a44', seedHead: '#e9d9a0', toadstool: '#c9772e', moss: '#8f8a3e',
  thorn: '#6a4634', thornTip: '#f1e2c4', thornLeaf: '#a8632e', berryDark: '#8a2a1e',
  birch: '#efe7d6', birchShade: '#9a8f82', birchMark: '#4a3c30', birchLeaf: '#f2b632',
  earth: '#553c22', leafRed: '#d9532c', leafGold: '#f0b83a', leafOrange: '#e98a2e', leafBrown: '#8a3a1e',
  pile: '#d9a23e', pileLight: '#f6d27a', pileDark: '#8a4a1e',
  pumpkin: '#ee7f22', squash: '#e9a94e', vine: '#6f7a34', hay: '#e2c36a', hayDark: '#a8822e', fence: '#8a6a48',
  acorn: '#b8823e', acornCap: '#6a4428', chestnut: '#6e3a1e', chestnutEye: '#c9a070', honey: '#d9973a', honeyStem: '#f1dfb4',
};

// ---------- земля осени ----------

/** Тёмная земля под листьями: к лесным пятнам — проплешины земли. Сам ковёр листьев кладётся позже, поверх троп. */
function autumnGround(g, R, P) {
  paintGround(g, R, P);
  const rnd = rngOf(hashInt(R.seed, 401));
  for (let i = Math.round((R.W * R.H) / 16000); i > 0; i--) {
    const rx = 16 + rnd() * 22;
    spot(g, rnd() * R.W, rnd() * R.H, rx, rx * (0.45 + rnd() * 0.3), P.earth, 0.3, rnd() * Math.PI);
  }
}

/** Кленовый лист: пять лопастей веером и черешок. */
function mapleLeaf(g, x, y, size, rot, color) {
  const lobes = [[0, 1], [-0.95, 0.82], [0.95, 0.82], [-1.9, 0.55], [1.9, 0.55]];
  for (const [da, k] of lobes) leaf(g, x + 0.6, y + 0.9, size * k, size * k * 0.36, rot + da, fade(SHADOW, 0.2));
  g.strokeStyle = dim(color, 0.4);
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - Math.cos(rot) * size * 0.6, y - Math.sin(rot) * size * 0.6);
  g.stroke();
  for (const [da, k] of lobes) leaf(g, x, y, size * k, size * k * 0.36, rot + da, color);
}

/** Жёлудь: орешек и шляпка. */
function acorn(g, x, y, a, P) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  oval(g, 0.5, 0.8, 2.6, 1.7, fade(SHADOW, 0.25));
  oval(g, 0, 0, 2.4, 1.6, P.acorn);
  oval(g, 0.3, -0.5, 1.1, 0.5, fade(lift(P.acorn, 0.6), 0.8));
  g.fillStyle = P.acornCap;
  g.beginPath();
  g.ellipse(-1.2, 0, 1.3, 1.8, 0, Math.PI * 0.5, Math.PI * 1.5);
  g.fill();
  g.restore();
}

/** Каштан: тёмный, блестящий, со светлым пятном. */
function chestnut(g, x, y, P) {
  oval(g, x + 0.5, y + 0.8, 2.4, 1.8, fade(SHADOW, 0.25));
  disc(g, x, y, 2.1, P.chestnut);
  oval(g, x + 0.3, y + 1, 1.3, 0.7, P.chestnutEye);
  disc(g, x - 0.7, y - 0.8, 0.5, fade('#ffffff', 0.6));
}

/**
 * Ковёр листьев и мелочи: неяркие листья под цвет земли — сплошь (это фактура, а не украшение), поверх —
 * редкие багряные и золотые, у стен и преград их наметает гуще; кленовые листья, жёлуди, каштаны, сухая трава.
 * На тропах почти пусто: там вытоптано.
 */
function autumnDecals(g, R, P) {
  const tones = [mix(P.ground, P.leafGold, 0.34), mix(P.ground, P.leafRed, 0.3), mix(P.groundDark, P.leafBrown, 0.45), mix(P.groundLight, P.leafGold, 0.2)];
  const carpet = tones.map(() => []);
  const hues = [P.leafRed, P.leafGold, P.leafBrown];
  const bright = hues.map(() => []);
  const shade = [];
  const stars = [];
  const floor = (x, y) => R.at(x, y) === TILE.FLOOR || R.at(x, y) === TILE.PATH;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!floor(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 411));
      const edgy = R.edgy(x, y);
      const bare = R.at(x, y) === TILE.PATH;
      const px = () => (x + rnd()) * T;
      const py = () => (y + rnd()) * T;
      for (let i = bare ? 2 : 7; i > 0; i--) carpet[Math.floor(rnd() * 4)].push(px(), py(), 4.2 + rnd() * 2.6, 1.5 + rnd() * 0.9, rnd() * TAU);
      for (let i = bare ? (rnd() < 0.25 ? 1 : 0) : edgy ? 2 + Math.floor(rnd() * 3) : Math.floor(rnd() * 1.9); i > 0; i--) {
        const lx = px();
        const ly = py();
        const len = 4.6 + rnd() * 2.2;
        const wide = 1.7 + rnd() * 0.7;
        const a = rnd() * TAU;
        shade.push(lx + 0.6, ly + 0.8, len, wide, a);
        bright[Math.floor(rnd() * 3)].push(lx, ly, len, wide, a);
      }
      if (!bare && rnd() < (edgy ? 0.3 : 0.11)) stars.push([px(), py(), 4.6 + rnd() * 1.6, rnd() * TAU, rnd() < 0.55 ? P.leafRed : P.leafGold]);
    }
  }
  carpet.forEach((list, i) => leaves(g, list, tones[i]));
  leaves(g, shade, fade(SHADOW, 0.2));
  bright.forEach((list, i) => leaves(g, list, hues[i]));
  for (const [x, y, size, rot, color] of stars) mapleLeaf(g, x, y, size, rot, color);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!floor(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 413));
      const bare = R.at(x, y) === TILE.PATH;
      const px = () => (x + 0.1 + rnd() * 0.8) * T;
      const py = () => (y + 0.14 + rnd() * 0.8) * T;
      if (!bare && rnd() < (R.edgy(x, y) ? 0.5 : 0.14)) tuft(g, px(), py(), 4.4 + rnd() * 3, P, rnd);
      // под деревом — то, что с него упало
      const tree = R.at(x - 1, y) === TILE.TALL || R.at(x + 1, y) === TILE.TALL || R.at(x, y - 1) === TILE.TALL || R.at(x, y + 1) === TILE.TALL;
      if (rnd() < (tree ? 0.6 : 0.05)) {
        const cx = px();
        const cy = py();
        for (let i = 1 + Math.floor(rnd() * 2.4); i > 0; i--) {
          const ax = cx + (rnd() - 0.5) * 10;
          const ay = cy + (rnd() - 0.5) * 7;
          if (rnd() < 0.6) acorn(g, ax, ay, rnd() * TAU, P);
          else chestnut(g, ax, ay, P);
        }
      }
      if (rnd() < (bare ? 0.2 : 0.07)) pebble(g, px(), py(), 1.4 + rnd() * 1.5, P, rnd);
      if (!bare && rnd() < 0.07) {
        // веточка с развилкой
        const tx = px();
        const ty = py();
        const a = rnd() * TAU;
        const len = 6 + rnd() * 4;
        g.strokeStyle = fade(P.trunkDark, 0.75);
        g.lineWidth = 1.1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len);
        g.moveTo(tx + Math.cos(a) * len * 0.55, ty + Math.sin(a) * len * 0.55);
        g.lineTo(tx + Math.cos(a + 0.7) * len * 0.9, ty + Math.sin(a + 0.7) * len * 0.9);
        g.stroke();
      }
    }
  }
}

/**
 * Куча листьев — особая земля осени: пухлый ворох с тенью на земле, светлой макушкой слева сверху и тёмным
 * правым нижним краем. По ней ходят, поэтому обводки нет; листья по краю лежат уже на земле.
 */
function leafPiles(g, R, P) {
  const pile = (x, y) => R.at(x, y) === TILE.SPECIAL;
  const loops = contours(R.w, R.h, pile);
  if (!loops.length) return;
  const s = R.seed + 3;
  const edge = (grow) => regionPath(g, loops, s, 12, 4, grow, 2);
  const tones = [P.leafGold, P.pileLight, P.leafRed, mix(P.leafRed, P.leafBrown, 0.5), P.pile, P.leafOrange];
  /** Слой листьев по всем клеткам кучи: под каждым — тёмный, чуть крупнее. */
  const layer = (salt, count, spread) => {
    const dark = [];
    const lists = tones.map(() => []);
    for (let y = 0; y < R.h; y++) {
      for (let x = 0; x < R.w; x++) {
        if (!pile(x, y)) continue;
        const rnd = rngOf(hashInt(R.seed, x, y, salt));
        for (let i = 0; i < count; i++) {
          const lx = (x - spread + rnd() * (1 + 2 * spread)) * T;
          const ly = (y - spread + rnd() * (1 + 2 * spread)) * T;
          const len = 5 + rnd() * 3;
          const wide = 1.9 + rnd();
          const a = rnd() * TAU;
          dark.push(lx + 0.5 - Math.cos(a) * 0.4, ly + 0.9 - Math.sin(a) * 0.4, len + 0.8, wide + 0.4, a);
          lists[Math.floor(rnd() * tones.length)].push(lx, ly, len, wide, a);
        }
      }
    }
    leaves(g, dark, fade(P.pileDark, 0.75));
    lists.forEach((list, i) => leaves(g, list, tones[i]));
  };
  g.lineJoin = 'round';
  g.save();
  g.translate(3.5, 4.5);
  edge(4);
  g.fillStyle = fade(SHADOW, 0.26);
  g.fill();
  g.restore();
  edge(4.6);
  g.fillStyle = mix(P.leafBrown, P.groundDeep, 0.4);
  g.fill();
  edge(3);
  g.fillStyle = P.pile;
  g.fill();
  g.save();
  edge(3);
  g.clip();
  layer(431, 11, 0.04);
  // объём: правый нижний край в тени, левый верхний — на свету
  g.save();
  g.translate(-3, -4);
  edge(3);
  g.strokeStyle = fade(P.pileDark, 0.5);
  g.lineWidth = 8;
  g.stroke();
  g.restore();
  g.save();
  g.translate(2.6, 3.4);
  edge(3);
  g.strokeStyle = fade(P.pileLight, 0.55);
  g.lineWidth = 4.6;
  g.stroke();
  g.restore();
  g.restore();
  layer(433, 7, -0.06);
}

/**
 * Тихий тёмный пруд: вода стоит как зеркало — в ней тёплые отражения крон, на ней красные и жёлтые листья с
 * кругами от них. Берег — сырая земля, по краю сухой камыш.
 */
function autumnPond(g, R, P) {
  const water = (x, y) => R.at(x, y) === TILE.WATER;
  const loops = contours(R.w, R.h, water);
  if (!loops.length) return;
  const s = R.seed + 7;
  const edge = (grow) => regionPath(g, loops, s, 13, 2.6, grow, 2);
  edge(6.5);
  g.fillStyle = fade(P.groundDeep, 0.45);
  g.fill();
  edge(3.6);
  g.fillStyle = P.shore;
  g.fill();
  edge(0.2);
  g.fillStyle = mix(P.water, P.shine, 0.16);
  g.fill();
  g.save();
  edge(0.2);
  g.clip();
  edge(-4);
  g.fillStyle = P.water;
  g.fill();
  edge(-10);
  g.fillStyle = fade(P.waterDeep, 0.65);
  g.fill();
  edge(-17);
  g.fillStyle = fade(P.waterDeep, 0.8);
  g.fill();
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 441));
      if (rnd() < 0.55) spot(g, (x + rnd()) * T, (y + rnd()) * T, 6 + rnd() * 5, 14 + rnd() * 9, pick([P.canopy, P.canopyLight, P.canopyDark], rnd()), 0.16);
    }
  }
  // берег выше воды: его тень на воде слева сверху, светлая кромка справа снизу
  g.lineJoin = 'round';
  g.save();
  g.translate(2.4, 3);
  edge(0.2);
  g.strokeStyle = fade(mix(P.waterDeep, SHADOW, 0.5), 0.55);
  g.lineWidth = 4.4;
  g.stroke();
  g.restore();
  g.save();
  g.translate(-1.5, -1.9);
  edge(0.2);
  g.strokeStyle = fade(P.shine, 0.6);
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
  g.lineCap = 'round';
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 443));
      if (rnd() < 0.6) {
        const bx = (x + 0.15 + rnd() * 0.6) * T;
        const by = (y + 0.15 + rnd() * 0.7) * T;
        g.strokeStyle = fade(P.shine, 0.3 + rnd() * 0.25);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + 3 + rnd() * 5, by);
        g.stroke();
      }
      for (let i = rnd() < 0.3 ? 2 : 1; i > 0; i--) {
        if (rnd() < 0.25) continue;
        const lx = (x + 0.2 + rnd() * 0.6) * T;
        const ly = (y + 0.25 + rnd() * 0.5) * T;
        const len = 5.4 + rnd() * 2.6;
        const wide = 2.1 + rnd() * 0.8;
        const a = rnd() * TAU;
        const color = pick([P.leafRed, P.leafGold, P.leafOrange, P.leafGold], rnd());
        if (rnd() < 0.6) {
          g.strokeStyle = fade(P.shine, 0.3);
          g.lineWidth = 0.8;
          g.beginPath();
          g.ellipse(lx + Math.cos(a) * len * 0.5, ly + Math.sin(a) * len * 0.5, len * 0.95, len * 0.52, 0, 0, TAU);
          g.stroke();
        }
        leaf(g, lx + 0.9, ly + 1.5, len, wide, a, fade(mix(P.waterDeep, SHADOW, 0.5), 0.6));
        leaf(g, lx, ly, len, wide, a, color);
        g.strokeStyle = fade(lift(color, 0.6), 0.7);
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(lx + Math.cos(a) * len * 0.15, ly + Math.sin(a) * len * 0.15);
        g.lineTo(lx + Math.cos(a) * len * 0.85, ly + Math.sin(a) * len * 0.85);
        g.stroke();
      }
    }
  }
  g.restore();
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (!water(x, y)) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 445));
      if (!water(x, y - 1) && rnd() < 0.5) reeds(g, (x + 0.2 + rnd() * 0.6) * T, y * T + 3, P, rnd);
      if (!water(x - 1, y) && rnd() < 0.3) reeds(g, x * T + 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
      if (!water(x + 1, y) && rnd() < 0.3) reeds(g, (x + 1) * T - 1, (y + 0.3 + rnd() * 0.6) * T, P, rnd);
    }
  }
}

/** Плод шиповника: красный овал с тёмной чашечкой на конце. */
function hip(g, x, y, r, a, P) {
  const co = Math.cos(a);
  const si = Math.sin(a);
  oval(g, x, y, r * 1.5, r * 1.12, dim(P.berry, 0.58), a);
  oval(g, x, y, r * 1.2, r * 0.84, P.berry, a);
  disc(g, x + co * r * 1.35, y + si * r * 1.35, r * 0.42, P.berryDark);
  disc(g, x - co * r * 0.3 - 0.4, y - si * r * 0.3 - 0.5, r * 0.3, lift(P.berry, 0.7));
}

/**
 * Колючки осени — сухой шиповник: лесные плети в здешних красках и плоды на них. Здесь же, последним слоем
 * земли, — вечерний свет: длинные тени высокого вправо вниз и косые тёплые полосы.
 */
function autumnThorns(g, R, P) {
  paintThorns(g, R, P);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.THORN) continue;
      const rnd = rngOf(hashInt(R.seed, x, y, 451));
      for (let i = 3 + Math.floor(rnd() * 2); i > 0; i--) hip(g, x * T + 4 + rnd() * 24, y * T + 4 + rnd() * 24, 1.8 + rnd() * 0.5, rnd() * TAU, P);
    }
  }
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (R.at(x, y) !== TILE.TALL) continue;
      const s = standing(R, AUTUMN, x, y);
      if (!s) continue;
      const reach = (s.def.crown ?? 12) * 1.4 + 14;
      spot(g, s.x + reach * 0.82, s.y + reach * 0.36 + 2, reach, 6 + reach * 0.09, SHADOW, 0.2, 0.4);
    }
  }
  const rnd = rngOf(hashInt(R.seed, 453));
  for (let i = Math.max(2, Math.round((R.W * R.H) / 70000)); i > 0; i--) {
    spot(g, rnd() * R.W, T + rnd() * (R.H - 2 * T), 70 + rnd() * 50, 9 + rnd() * 6, P.sun, 0.13 + rnd() * 0.05, 0.4);
  }
}

// ---------- картинки осени ----------

/** Листья в воздухе: list — [x, y, угол, номер краски]. */
function falling(g, list, P) {
  for (const [x, y, a, k] of list) {
    const color = [P.leafRed, P.leafGold, P.leafOrange][k % 3];
    leaf(g, x - Math.cos(a) * 0.7, y - Math.sin(a) * 0.7, 6.4, 2.6, a, dim(color, 0.5));
    leaf(g, x, y, 5, 1.8, a, color);
  }
}

/** Клён: широкая крона-шатёр в багрянце; у вариантов разные краски — от винной до золотой. */
function paintMaple(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const x = 40;
  const base = 87;
  const J = (list, salt) => jitterCircles(list, v * 151 + salt, v ? 1.4 : 0.4);
  const [back, side, front, top] = v === 1 ? [t.crimson, t.rust, t.orange, t.gold] : v === 2 ? [t.wine, t.wine, t.crimson, t.rust] : [t.wine, t.crimson, t.crimson, t.orange];
  trunk(g, x, base, 46, 11.5, P, 1101 + v, { shade: 18, lean: v === 1 ? -2 : 1.5 });
  limb(g, [x - 1, base - 28, x - 9, base - 37, x - 16, base - 42], 3.2, P.trunk, dim(P.trunk), 1.3);
  limb(g, [x + 2, base - 31, x + 9, base - 39, x + 15, base - 43], 3, mix(P.trunk, P.trunkDark, 0.5), dim(P.trunk), 1.3);
  puff(g, J([[40, 31, 22], [21, 37, 15], [59, 37, 15], [40, 19, 13], [27, 22, 12], [53, 22, 12]], 1), back, 1111 + v, { under: 0.32 });
  puff(g, J([[58, 45, 13], [66.5, 48, 7.5], [50, 50, 9]], 2), side, 1112 + v, { under: 0.5, light: 0.28 });
  puff(g, J([[22, 44, 14], [13, 47, 8], [32, 50, 10]], 3), front, 1113 + v, { under: 0.4 });
  puff(g, J([[33, 26, 14], [22, 30, 10], [44, 21, 10.5], [32, 16, 9]], 4), top, 1114 + v, { dark: 0.3 });
  falling(g, v === 1 ? [[66, 63, 0.9, 1], [12, 66, 2.3, 0], [57, 73, 2, 2]] : [[65, 64, 1, 0], [14, 62, 2.2, 1], [60, 75, 0.4, 0]], P);
}

/** Голое чёрное дерево: кривые сучья и последние листья на них. Второй вариант — зеркальный. */
function paintBare(g, look, v) {
  const P = look.pal;
  const m = v ? -1 : 1;
  const x = 30;
  const base = 86;
  const bark = mix(P.trunkDark, INK, 0.3);
  const line = mix(bark, INK, 0.55);
  const at = (list) => list.map((n, i) => (i % 2 ? base + n : x + n * m));
  for (const [pts, width] of [
    [[2, -40, 9, -52, 19, -58, 25, -70], 3.4], [[-2, -44, -10, -56, -18, -60, -23, -73], 3.2], [[0, -50, 3, -64, -1, -74, 2, -82], 3],
    [[14, -56, 20, -52, 26, -54], 1.8], [[22, -64, 27, -62], 1.6], [[19, -58, 17, -66, 20, -72], 1.8],
    [[-14, -58, -20, -54, -25, -57], 1.8], [[-19, -62, -15, -69, -17, -75], 1.7], [[2, -68, 8, -72, 10, -79], 1.7], [[-1, -74, -6, -78], 1.5],
  ]) limb(g, at(pts), width, bark, line, 1.2);
  trunk(g, x, base, 54, 11, P, 1201 + v, { color: bark, dark: mix(bark, INK, 0.5), lean: 1.5 * m, taper: 0.3, flare: 4.5 });
  // дупло
  oval(g, x + 0.6 * m, base - 29, 2.3, 3.2, fade(INK, 0.7));
  g.strokeStyle = fade(lift(bark, 0.5), 0.6);
  g.lineWidth = 0.8;
  g.beginPath();
  g.ellipse(x + 0.6 * m, base - 29, 2.9, 3.8, 0, Math.PI * 0.2, Math.PI * 0.9);
  g.stroke();
  falling(g, [[x + 26 * m, base - 53, 1.4, 0], [x - 25 * m, base - 56, 1.8, 1], [x + 20 * m, base - 71, 1.2, 2], [x - 17 * m, base - 74, 2, 0], [x + 10 * m, base - 78, 1, 1]], P);
}

/** Стог: соломенный купол в три яруса с жердью на макушке; у второго сбоку вилы. */
function paintHay(g, look, v) {
  const P = look.pal;
  const x = 27;
  const base = 52;
  const lean = v ? 2 : -1;
  const w = v ? 19 : 22;
  const tall = v ? 39 : 45;
  limb(g, [x + lean, base - tall + 6, x + lean * 1.5, base - tall - 5], 2, P.trunk, dim(P.trunk), 1.1);
  if (v) {
    const wood = P.fence;
    limb(g, [47, 51, 43.5, 31, 41, 15], 1.8, wood, dim(wood, 0.64), 1);
    for (const dx of [-3.4, 0, 3.4]) limb(g, [41, 16, 40.4 + dx, 12, 40 + dx * 1.15, 6.5], 1.1, P.rock, dim(P.rock, 0.6), 0.8);
  }
  const path = (c) => {
    c.moveTo(x - w, base + 1);
    c.bezierCurveTo(x - w - 2, base - tall * 0.5, x - w * 0.62 + lean, base - tall * 0.98, x + lean, base - tall);
    c.bezierCurveTo(x + w * 0.62 + lean, base - tall * 0.98, x + w + 2, base - tall * 0.5, x + w, base + 1);
    c.quadraticCurveTo(x, base + 4, x - w, base + 1);
    c.closePath();
  };
  const rnd = rngOf(1211 + v);
  solid(g, path, x, base - tall / 2, w, tall / 2, P.hay, {
    light: 0.5, dark: 0.55, line: dim(P.hay, 0.6),
    inside: (c) => {
      c.lineCap = 'round';
      // ярусы: под кромкой каждого — тень
      for (const k of [0.33, 0.62]) {
        const yy = base - tall * k;
        c.strokeStyle = fade(P.hayDark, 0.75);
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(x - w - 2, yy + 3.5);
        c.quadraticCurveTo(x + lean * 0.5, yy - 4, x + w + 2, yy + 3.5);
        c.stroke();
      }
      // соломины расходятся от макушки вниз: слева светлые, справа тёмные
      c.lineWidth = 1;
      for (let i = 0; i < 48; i++) {
        const sx = x + (rnd() - 0.5) * w * 1.9;
        const sy = base - rnd() * tall * 0.92;
        let dx = sx - (x + lean);
        let dy = sy - (base - tall) + 6;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const len = 3.5 + rnd() * 4.5;
        c.strokeStyle = sx < x ? fade(lift(P.hay, 0.6), 0.75) : fade(P.hayDark, 0.7);
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + dx * len, sy + dy * len);
        c.stroke();
      }
    },
  });
  // солома торчит у земли
  g.lineCap = 'round';
  g.lineWidth = 1.1;
  for (let i = 0; i < 7; i++) {
    const sx = x - w + 2 + (i / 6) * (w * 2 - 4);
    g.strokeStyle = i % 2 ? dim(P.hay, 0.4) : P.hay;
    g.beginPath();
    g.moveTo(sx, base + 1);
    g.lineTo(sx + (sx < x ? -2.4 : 2.4) - 0.5 + rnd(), base + 3.4 + rnd());
    g.stroke();
  }
}

/** Тыква: сплюснутый шар с ложбинкой у хвостика, дольки и блик. (cx, base) — низ посередине. */
function pumpkin(g, cx, base, rx, ry, P, o = {}) {
  const cy = base - ry;
  const color = o.color ?? P.pumpkin;
  const path = (c) => {
    c.moveTo(cx - rx, cy + ry * 0.1);
    c.bezierCurveTo(cx - rx, cy - ry * 1.05, cx - rx * 0.25, cy - ry * 1.02, cx, cy - ry * 0.86);
    c.bezierCurveTo(cx + rx * 0.25, cy - ry * 1.02, cx + rx, cy - ry * 1.05, cx + rx, cy + ry * 0.1);
    c.bezierCurveTo(cx + rx, cy + ry * 1.3, cx - rx, cy + ry * 1.3, cx - rx, cy + ry * 0.1);
    c.closePath();
  };
  solid(g, path, cx, cy, rx, ry, color, {
    light: 0.55, dark: 0.5, line: dim(color, 0.6), lw: 1.6,
    inside: (c) => {
      c.strokeStyle = fade(dim(color, 0.42), 0.75);
      c.lineWidth = 1.1;
      c.lineCap = 'round';
      for (const k of [-0.62, -0.26, 0.26, 0.62]) {
        c.beginPath();
        c.moveTo(cx + k * rx * 0.35, cy - ry * 0.86);
        c.quadraticCurveTo(cx + k * rx * 1.55, cy, cx + k * rx * 0.5, cy + ry * 0.96);
        c.stroke();
      }
      oval(c, cx - rx * 0.52, cy - ry * 0.34, rx * 0.15, ry * 0.34, fade(lift(color, 0.75), 0.6), -0.2);
    },
  });
  limb(g, [cx, cy - ry * 0.82, cx + 0.6, cy - ry * 1.1, cx + 2.6, cy - ry * 1.28], 2.3, P.vine, dim(P.vine, 0.55), 1.1);
}

/** Тыквы: большая с листом и усиком, пара, высокая светлая с красной малышкой. */
function paintPumpkins(g, look, v) {
  const P = look.pal;
  if (v === 0) {
    // усик и лист — позади тыквы
    g.strokeStyle = dim(P.vine, 0.3);
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    curve(g, [28, 20, 33, 16.5, 35, 20, 33, 22.5, 31.5, 20.5]);
    g.stroke();
    leaf(g, 26.4, 22.6, 10.4, 4.6, -0.5, dim(P.vine, 0.55));
    leaf(g, 27, 22, 9, 3.8, -0.5, P.vine);
    pumpkin(g, 17.5, 26, 13.5, 10.6, P);
  } else if (v === 1) {
    pumpkin(g, 14, 25.6, 11.5, 9.2, P);
    pumpkin(g, 28.5, 26.4, 7.6, 6.2, P, { color: mix(P.pumpkin, P.leafRed, 0.4) });
  } else {
    pumpkin(g, 27, 25.6, 9.4, 7.6, P, { color: mix(P.pumpkin, P.leafRed, 0.35) });
    pumpkin(g, 13.5, 26.2, 10.5, 10.6, P, { color: P.squash });
  }
}

/** Опёнок: ножка и шляпка-полушарие. */
function fungus(g, x, y, r, P) {
  g.lineCap = 'round';
  g.strokeStyle = dim(P.honey, 0.55);
  g.lineWidth = r * 0.5 + 1;
  g.beginPath();
  g.moveTo(x, y + r * 1.5);
  g.lineTo(x, y);
  g.stroke();
  g.strokeStyle = P.honeyStem;
  g.lineWidth = r * 0.5;
  g.beginPath();
  g.moveTo(x, y + r * 1.5);
  g.lineTo(x, y);
  g.stroke();
  g.fillStyle = dim(P.honey, 0.55);
  g.beginPath();
  g.ellipse(x, y + 0.5, r + 0.7, r * 0.8 + 0.7, 0, Math.PI, TAU);
  g.fill();
  g.fillStyle = P.honey;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.78, 0, Math.PI, TAU);
  g.fill();
  disc(g, x - r * 0.3, y - r * 0.42, r * 0.22, lift(P.honey, 0.7));
}

/** Пень с опятами: лесной пень с веточкой (листья на ней осенние), по коре и у корней — семейка опят. */
function paintFungusStump(g, look, v) {
  const P = look.pal;
  paintStump(g, look, 1);
  if (v === 0) {
    for (const [x, y, r] of [[3.9, 20, 1.8], [7.6, 21, 2.2], [4.6, 23.6, 2.6], [9.4, 24.6, 1.7]]) fungus(g, x, y, r, P);
  } else {
    leaf(g, 9.4, 13.4, 7.4, 2.9, 0.25, dim(P.leafRed, 0.5));
    leaf(g, 10, 13, 6, 2.2, 0.25, P.leafRed);
    for (const [x, y, r] of [[30.3, 19.6, 1.7], [26.6, 20.6, 2.1], [29.2, 23.2, 2.6], [24.4, 24.4, 1.7]]) fungus(g, x, y, r, P);
  }
}

/** Обломок забора: два столба и жерди; у одного нижняя жердь сломана, у другого столб покосился и жердь съехала. */
function paintFence(g, look, v) {
  const P = look.pal;
  const wood = P.fence;
  const line = dim(wood, 0.64);
  const pale = fade(lift(wood, 0.45), 0.7);
  /** Доска с обводкой и светлой гранью: у лежачей — сверху, у столба — слева. */
  const board = (pts, width, upright = false) => {
    limb(g, pts, width, wood, line, 1.2);
    g.strokeStyle = pale;
    g.lineWidth = 0.9;
    curve(g, pts.map((n, i) => ((i % 2 === 1) === !upright ? n - width * 0.24 : n)));
    g.stroke();
  };
  const cut = (x, y) => {
    oval(g, x, y, 2.5, 1.2, line);
    oval(g, x, y - 0.2, 1.9, 0.8, lift(wood, 0.5));
  };
  const rnd = rngOf(1231 + v);
  if (v === 0) {
    board([8, 12.5, 35, 10.5], 3.2);
    board([8, 19.5, 20, 20.5, 27.5, 26], 3);
    board([8.4, 27, 8.6, 17, 8.2, 7.5], 4.2, true);
    board([34.4, 27, 34.2, 17, 34.6, 6.5], 4.2, true);
    cut(8.2, 6);
    cut(34.6, 5);
    tuft(g, 14, 28, 5, P, rnd);
    tuft(g, 30, 28.4, 4.6, P, rnd);
  } else {
    board([10.4, 27, 9.4, 17, 6.8, 8.5], 4.2, true);
    board([7, 13, 22, 15.5, 36, 25], 3.2);
    board([9.8, 20.5, 32.6, 19.5], 3);
    board([33.4, 27, 33.6, 18, 33.2, 9.5], 4.2, true);
    cut(6.6, 7);
    cut(33.2, 8);
    tuft(g, 20, 28.2, 5, P, rnd);
  }
  falling(g, v ? [[24, 9, 0.6, 0]] : [[18, 6, 2.4, 1]], P);
}

/**
 * Куст шиповника: редкая желтеющая листва, над ней дуги колючих веток, по ним красные плоды. Тень на земле —
 * в самой картинке: куст ломают, и в фоне от него нет ничего.
 */
function paintRosehip(g, look, v) {
  const P = look.pal;
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 211 + salt, v ? 1.3 : 0.3);
  spot(g, 24, 32, 19, 5.4, SHADOW, 0.5);
  oval(g, 23, 31.6, 14.5, 3.6, fade(SHADOW, 0.28));
  limb(g, [10, 28, 9, 15, 17, 6.5], 1.5, P.thorn, dim(P.thorn, 0.55), 0.9);
  limb(g, [35, 28, 37, 16, 30, 7.5], 1.5, P.thorn, dim(P.thorn, 0.55), 0.9);
  puff(g, J([[22, 17, 11.5], [12, 21, 8.5], [32, 20, 9.5], [22, 10.5, 6.5]], 1), t.bushBack, 1251 + v, { under: 0.35 });
  const front = J([[15, 23, 9.5], [28, 24, 10], [22, 18.5, 8.5], [7.5, 26.5, 5.6], [36, 27, 5.6]], 2);
  puff(g, front, t.bush, 1252 + v, { under: 0.45 });
  const rnd = rngOf(1253 + v);
  for (let i = v === 1 ? 6 : 9; i > 0; i--) {
    const c = front[Math.floor(rnd() * 3)];
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * c[2] * 0.72;
    hip(g, c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, 1.9, Math.PI / 2 + (rnd() - 0.5) * 0.8, P);
  }
  hip(g, 17.4, 7.6, 1.8, 0.9, P);
  hip(g, 29.6, 8.6, 1.8, 2.2, P);
}

/** Клуб листвы из разноцветных кусков: круги слева направо делятся на группы по два-три, у каждой свой тон. */
function mixed(g, circles, tones, seed, o = {}) {
  const list = circles.slice().sort((a, b) => a[0] - b[0]);
  const rnd = rngOf(seed);
  let k = Math.floor(rnd() * tones.length);
  for (let i = 0; i < list.length;) {
    const n = Math.min(list.length - i, 2 + Math.floor(rnd() * 2));
    puff(g, list.slice(i, i + n), tones[k % tones.length], seed + i, o);
    i += n;
    k += 1;
  }
}

/**
 * Крона над верхней стеной: те же три ряда клубов, что в лесу, но ряд собран из разноцветных деревьев —
 * дальний тёмный, средний винный и багряный, ближний рыжий с золотом. Под кроной кружат листья.
 */
function paintAutumnWallTop(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 97 + salt, 1.6);
  puff(g, J([[18, 23, 13], [38, 19, 15], [60, 18, 16], [82, 20, 15], [100, 24, 13], [49, 25, 13], [72, 26, 13]], 1), t.far, 1311 + v, { light: 0.3 });
  mixed(g, J([[14, 33, 11], [32, 29, 15], [56, 27, 17], [80, 29, 16], [101, 33, 12], [44, 35, 12], [68, 36, 12]], 2), [t.wine, t.crimson, t.rust], 1312 + v, { under: 0.3 });
  mixed(g, J([[11, 43, 8], [24, 43, 12], [42, 44, 12.5], [60, 43, 13.5], [78, 44, 12.5], [94, 43, 12], [106, 43, 8], [33, 49, 7], [51, 50, 7.5], [69, 50, 7.5], [86, 49, 7]], 3),
    [t.orange, t.crimson, t.gold, t.rust], 1313 + v, { under: 0.72, light: 0.34 });
  const lit = [[[30, 36, 10], [64, 34, 10.5]], [[45, 35, 11], [88, 37, 9]], [[21, 37, 8.5], [56, 33, 9.5], [90, 36, 8.5]]][v % 3];
  lit.forEach(([x, y, r], k) => {
    puff(g, J([[x, y, r], [x - r * 0.82, y + r * 0.3, r * 0.65], [x + r * 0.8, y - r * 0.3, r * 0.68]], 4 + k), (k + v) % 2 ? t.gold : t.orange, 1314 + v * 3 + k, { dark: 0.3, marks: 4 });
  });
  falling(g, [[[22, 62, 1, 0], [61, 66, 2.2, 1], [95, 61, 0.6, 2]], [[38, 65, 2, 1], [78, 61, 1.2, 0]], [[15, 60, 0.5, 2], [52, 63, 1.6, 0], [100, 66, 2.4, 1]]][v % 3], look.pal);
}

/** То же, но узкое: для стены в одну-две клетки. */
function paintAutumnWallCap(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 71 + salt, 1.5);
  puff(g, J([[26, 25, 13], [42, 21, 15], [57, 26, 12], [40, 31, 12]], 1), t.far, 1331 + v, { light: 0.3 });
  mixed(g, J([[20, 35, 11], [36, 31, 14], [54, 33, 13], [64, 37, 9], [44, 38, 11]], 2), v ? [t.crimson, t.rust] : [t.wine, t.crimson], 1332 + v, { under: 0.3 });
  mixed(g, J([[14, 44, 8], [26, 44, 11.5], [41, 45, 12.5], [56, 44, 11.5], [67, 44, 8], [33, 50, 7], [49, 50, 7]], 3), v ? [t.gold, t.orange, t.crimson] : [t.orange, t.rust, t.gold], 1333 + v, { under: 0.72, light: 0.34 });
  puff(g, J([[32, 37, 9.5], [25, 40, 6], [39, 34, 6.5]], 4), v ? t.orange : t.gold, 1334 + v, { dark: 0.3, marks: 4 });
  falling(g, v ? [[24, 62, 2.1, 0], [58, 65, 0.8, 1]] : [[52, 61, 1.2, 2], [18, 65, 0.4, 0]], look.pal);
}

/** Клуб кроны сверху — боковые и нижняя стены; у каждого варианта своё дерево: багряное, рыжее, золотое, винное. */
function paintAutumnWallSide(g, look, v) {
  const t = look.tone;
  const J = (list, salt) => jitterCircles(list, v * 59 + salt, 2);
  const [back, body, top] = [[t.wine, t.crimson, t.orange], [t.rust, t.orange, t.gold], [t.crimson, t.rust, t.gold], [t.wine, t.wine, t.crimson]][v % 4];
  puff(g, J([[38, 33, 21], [22, 36, 14], [54, 35, 15], [38, 47, 13], [27, 22, 12], [49, 21, 12]], 1), back, 1321 + v, { under: 0.36 });
  puff(g, J([[32, 28, 15], [21, 31, 9.5], [42, 24, 10], [31, 17, 9]], 2), body, 1322 + v, { dark: 0.4 });
  puff(g, J([[28, 23, 9.5], [21, 26, 6], [34, 19, 6.5]], 3), top, 1323 + v, { dark: 0.28, marks: 4 });
}

// двери — лесные (гнутые ветки, закрытая заросла колючками с плодами), но листва на них трёх красок
const DOOR_TINT = { mid: 'crimson', near: 'orange', lit: 'gold' };

const AUTUMN = addBiome({
  id: 'autumn',
  pal: AUTUMN_PAL,
  tall: [['maple', 4], ['oak', 3], ['birch', 2], ['bare', 1.4], ['hay', 1.4]],
  low: [['pumpkin', 4], ['stump', 3], ['fence', 2.2], ['log', 3]],
  bush: 'bush',
  ground: autumnGround,
  decals: autumnDecals,
  special: leafPiles,
  water: autumnPond,
  thorns: autumnThorns,
  sprites: {
    maple: { w: 80, h: 94, ox: 40, oy: 87, variants: 3, paint: paintMaple, foot: [10, 4.4], crown: 27 },
    oak: { w: 76, h: 92, ox: 38, oy: 85, variants: 2, paint: (g, look, v) => paintOak(g, tinted(look, v ? { mid: 'crimson', near: 'rust', lit: 'orange' } : { mid: 'rust', near: 'orange', lit: 'gold' }), v), foot: [10, 4.4], crown: 25 },
    birch: { w: 56, h: 96, ox: 28, oy: 90, variants: 2, paint: (g, look, v) => paintBirch(g, tinted(look, { near: v ? 'orange' : 'rust', birch: 'gold' }), v), foot: [6, 3], crown: 17 },
    bare: { w: 60, h: 92, ox: 30, oy: 86, variants: 2, paint: paintBare, foot: [8, 3.8], crown: 12 },
    hay: { w: 54, h: 58, ox: 27, oy: 52, variants: 2, paint: paintHay, foot: [20, 5.4], crown: 14, sit: 10 },
    pumpkin: { w: 38, h: 30, ox: 19, oy: 26, variants: 3, paint: paintPumpkins, foot: [14, 4.4], sit: 8 },
    stump: { w: 34, h: 30, ox: 17, oy: 26, variants: 2, paint: paintFungusStump, foot: [13, 4.4], sit: 8 },
    fence: { w: 42, h: 32, ox: 21, oy: 27, variants: 2, paint: paintFence, foot: [15, 3.6], sit: 8 },
    bush: { w: 46, h: 38, ox: 22, oy: 32, variants: 3, paint: paintRosehip, foot: [15, 5], sit: 10 },
    wtop: { w: 116, h: 74, ox: 58, oy: 72, variants: 3, paint: paintAutumnWallTop },
    wcap: { w: 80, h: 74, ox: 40, oy: 72, variants: 2, paint: paintAutumnWallCap },
    wside: { w: 76, h: 66, ox: 38, oy: 62, variants: 4, paint: paintAutumnWallSide },
    door: { w: 140, h: 87, ox: 70, oy: 81, variants: 2, paint: (g, look, v) => paintDoorNorth(g, tinted(look, DOOR_TINT), v) },
    'door.s': { w: 160, h: 90, ox: 80, oy: 90, variants: 2, paint: (g, look, v) => paintDoorSouth(g, tinted(look, DOOR_TINT), v) },
    'door.w': { w: 92, h: 156, ox: 48, oy: 156, variants: 2, paint: (g, look, v) => paintDoorSide(g, tinted(look, DOOR_TINT), v, false) },
    'door.e': { w: 92, h: 156, ox: 44, oy: 156, variants: 2, paint: (g, look, v) => paintDoorSide(g, tinted(look, DOOR_TINT), v, true) },
  },
});

// Свои тона листвы: от винного до золотого. Лесные рисунки (дуб, берёза, двери) берут их через tinted().
const leafy = (base, light, dark) => ({ base, light, dark, line: dim(base, 0.62) });
Object.assign(AUTUMN.tone, {
  wine: leafy('#96302a', '#d2553a', '#5a1c1e'),
  crimson: leafy('#c4442a', '#f08a4a', '#82281a'),
  rust: leafy('#d4642a', '#f5a03c', '#9a3c1c'),
  orange: leafy('#e37c2e', '#ffc266', '#b2521e'),
  gold: leafy('#eeb234', '#ffe391', '#c27c1c'),
  bush: leafy('#c79a3a', '#ecd07a', '#8f6a24'),
  bushBack: leafy('#9a7430', '#c79a3a', '#6a4a1e'),
});
