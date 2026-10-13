// Значки «Лисьей охоты», вторая часть: украшения (item.*), дары леса (gift.*) и значки экрана и карты (ui.*).
// Без DOM: каждый значок записывается в реестр (art.js), рисуется один раз и дальше только ставится на место.
//
// Украшение — одна вещь в рамке 24×24, с тем же светом слева сверху и тёмной обводкой, что и всё в игре, чуть
// наклонена, без подложки (подложку цвета редкости рисует окно). По рисунку видно, что вещь делает: к
// подкове-магниту летит монета, вокруг громового бубенца — молнии, колокольчик тишины замотан тряпицей.
// Вещей тридцать шесть, а значок в рюкзаке — около тридцати пикселей, поэтому они различаются силуэтом и главным
// цветом, а не мелочами.
// Дар леса — не вещь, а благословение: светлый знак в цветном окошке на листе-медальоне. Лист у всех даров один —
// три карточки выбора смотрятся набором, и дар не спутать с вещью; цвет окошка у каждого дара свой.
// Значки экрана (16×16) показываются в 14–20 пикселей поверх любой земли и в окнах обеих тем: формы крупные,
// светлая середина и тёмный край, линий тоньше единицы нет. Пустые сердце, щит, жизнь и заряд рывка — тот же
// силуэт «гнездом»: тёмный и вдавленный.
//
// Привязка у всех — середина. Значок для окон (art.icon) рисуется без полей вокруг рамки, поэтому здесь ничего
// не выходит за рамку — ни обводка, ни сияние (за этим следит тест).
// Свет ложится в осях холста, поэтому наклонные вещи собраны из повёрнутых узлов (turn), а не поворотом холста:
// блик остаётся слева сверху. Сам холст поворачивается только чуть-чуть.

import { defineSprite } from './art.js';
import {
  TAU, COLORS, alpha, mix, lighten, darken, outline, tone, radial, glow, speck, shine, sparkle, nose,
  solid, blob, ball, capsule, leaf, stroke, fur, pathBlob, pathPoly, pathEllipse, pathCapsule, pathStar, pathLeaf, tufts, tuftsArc,
} from './art-kit.js';

// ---------- приёмы ----------

/** Значок size×size с привязкой посередине: paint(g) рисует вокруг нуля. */
function centered(key, size, paint) {
  defineSprite(key, {
    w: size, h: size, ox: size / 2, oy: size / 2,
    paint(g) {
      g.translate(size / 2, size / 2);
      paint(g);
    },
  });
}

/** Узлы контура, повёрнутые на угол a вокруг нуля, растянутые в s раз и сдвинутые на (dx, dy); острые остаются острыми. */
function turn(pts, a = 0, dx = 0, dy = 0, s = 1) {
  const c = Math.cos(a) * s;
  const n = Math.sin(a) * s;
  return pts.map((p) => (p[2] ? [dx + p[0] * c - p[1] * n, dy + p[0] * n + p[1] * c, 1] : [dx + p[0] * c - p[1] * n, dy + p[0] * n + p[1] * c]));
}

/** Те же узлы, но все острые: ломаная вместо плавной линии. */
const sharp = (pts) => pts.map((p) => [p[0], p[1], 1]);

/** Линия с тёмным краем — шнурок, нить, стебель: читается и на тёмной подложке, и на светлой. */
function cord(g, pts, color, lw = 1.2, edge = outline(color), grow = 1) {
  stroke(g, pts, edge, lw + grow);
  stroke(g, pts, color, lw);
}

/** Колечко (или дуга от a0 до a1) с тёмным краем. */
function ring(g, x, y, r, color, lw = 1.1, edge = outline(color), a0 = 0, a1 = TAU, grow = 1) {
  g.lineCap = 'round';
  for (const [paint, w] of [[edge, lw + grow], [color, lw]]) {
    g.strokeStyle = paint;
    g.lineWidth = w;
    g.beginPath();
    g.arc(x, y, r, a0, a1);
    g.stroke();
  }
}

/** Точка или овал одним цветом: зрачок, заклёпка, семечко. */
function dot(g, x, y, r, color, ry = r) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, r, ry, 0, 0, TAU);
  g.fill();
}

/** Прямоугольник со скруглёнными углами (roundRect есть не на всех телефонах). */
function pathRound(g, x0, y0, x1, y1, r) {
  g.moveTo(x0 + r, y0);
  g.arcTo(x1, y0, x1, y1, r);
  g.arcTo(x1, y1, x0, y1, r);
  g.arcTo(x0, y1, x0, y0, r);
  g.arcTo(x0, y0, x1, y0, r);
  g.closePath();
  return [x0, y0, x1, y1];
}

const poly = (g, pts, look, o) => solid(g, (c) => pathPoly(c, pts), look, o);
const plate = (g, x0, y0, x1, y1, r, look, o) => solid(g, (c) => pathRound(c, x0, y0, x1, y1, r), look, o);
const thin = (look, lw) => ({ ...look, lw });

/**
 * Знак линиями: parts — { lines: [узлы…], arcs: [[x, y, r, a0, a1]…], shapes: [многоугольник…], dots: [[x, y, r]…] }.
 * Сначала всё целиком тёмным краем, потом светлой серединой — на стыках линий нет перемычек.
 */
function glyph(g, parts, look, lw = 1.6, edge = 0.9) {
  const { lines = [], arcs = [], shapes = [], dots = [] } = parts;
  for (const [color, grow] of [[look.line, edge * 2], [look.fill, 0]]) {
    for (const pts of lines) stroke(g, pts, color, lw + grow);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = color;
    g.fillStyle = color;
    for (const [x, y, r, a0, a1] of arcs) {
      g.lineWidth = lw + grow;
      g.beginPath();
      g.arc(x, y, r, a0, a1);
      g.stroke();
    }
    for (const pts of shapes) {
      g.beginPath();
      pathPoly(g, pts);
      g.fill();
      if (grow) {
        g.lineWidth = grow;
        g.stroke();
      }
    }
    for (const [x, y, r] of dots) {
      g.beginPath();
      g.arc(x, y, r + grow / 2, 0, TAU);
      g.fill();
    }
  }
}

// ---------- краски ----------

const GOLD = tone(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark, lw: 1.2 });
const HIDE = tone('#9a6236', { light: '#cb9058', dark: '#5e3a20', lw: 1.2 });              // кожа
const WOOD = tone('#b98248', { light: '#e2b274', dark: '#754a26', lw: 1.2 });
const GREEN = tone('#58b84e', { light: '#a4e67c', dark: '#2f7f3a', lw: 1 });
const RED = tone(COLORS.heart, { light: COLORS.heartLight, dark: COLORS.heartDark, lw: 1.2 });
const COAT = tone('#f0862b', { light: '#ffb057', dark: '#c4601a', lw: 1.2 });              // лисья шерсть
const CREAM = tone('#fff1dc', { light: '#ffffff', dark: '#e8cfae', line: COAT.line, lw: 1.2 });
const SOCK = tone('#4a2a1c', { light: '#7a4a32', dark: '#2f1a14' });
const BONE = tone('#f6ecd6', { light: '#ffffff', dark: '#cbb68c', line: '#6e5a40', lw: 1.2 });
const WATER = tone(COLORS.mana, { light: COLORS.manaLight, dark: COLORS.manaDark, lw: 1.2 });
const STONE = tone('#9aa3ad', { light: '#dfe5ea', dark: '#5f6975', line: '#2e3540', lw: 1.1 });

// ---------- общие формы ----------
// Узлы — вокруг нуля в «единичном» размере; на место их ставит turn().

const HEART = [[0, 0.96, 1], [-0.96, 0.08], [-1, -0.67], [-0.5, -0.96], [0, -0.58, 1], [0.5, -0.96], [1, -0.67], [0.96, 0.08]];
const heart = (x, y, s) => turn(HEART, 0, x, y, s);
const DROP = [[0, -1, 1], [0.47, -0.2], [0.69, 0.35], [0.47, 0.85], [0, 1], [-0.47, 0.85], [-0.69, 0.35], [-0.47, -0.2]];
const drop = (x, y, s, a = 0) => turn(DROP, a, x, y, s);
const BOLT = [[1.5, -5], [-2.5, 0.5], [-0.3, 0.5], [-1.5, 5], [2.5, -0.8], [0.3, -0.8]];
// листик клевера: остриё в нуле, сердечко смотрит вверх
const LEAFLET = [[0, 0, 1], [-3.4, -2.6], [-4.1, -5.6], [-2.3, -7.4], [0, -6.1, 1], [2.3, -7.4], [4.1, -5.6], [3.4, -2.6]];
const FLAME = [[-3.8, -1], [-3.2, -5.6], [-2.4, -9.8, 1], [-0.6, -7.4], [1.8, -12, 1], [2.4, -7], [3.8, -4.4], [3.4, -1], [0, 0.4]];
// морковь: ботва вверху, острый кончик внизу
const CARROT = [[-3.2, -6], [0, -7], [3.2, -6], [3.9, -2.8], [2.9, 2], [1.5, 6.4], [0, 10, 1], [-1.5, 6.4], [-2.9, 2], [-3.9, -2.8]];
// жёлудь: орех и шляпка
const NUT = [[-5.9, -2.4], [5.9, -2.4], [6.5, 1.4], [4.9, 5.8], [1.9, 8.6], [0, 9.9, 1], [-1.9, 8.6], [-4.9, 5.8], [-6.5, 1.4]];
const NUT_CAP = [[-7.3, -1.4], [-7, -4.8], [-4.2, -7.6], [0, -8.6], [4.2, -7.6], [7, -4.8], [7.3, -1.4], [3.6, -0.5], [0, -0.3], [-3.6, -0.5]];
// голова с острыми ушами (радиус 1)
const EARED = [[-0.95, -0.3], [-1, -1.55, 1], [-0.35, -0.9], [0.35, -0.9], [1, -1.55, 1], [0.95, -0.3], [0.8, 0.6], [0, 1], [-0.8, 0.6]];

// отпечаток лапы: подушечка и четыре пальца; размер 10,4 × 9,8 при s = 1, середина подушечки — чуть ниже (x, y)
const PAD = [[0, -1.6], [2.6, -0.4], [3.4, 2.2], [1.8, 3.6], [0, 3.2], [-1.8, 3.6], [-3.4, 2.2], [-2.6, -0.4]];
const TOES = [[-3.7, -2.1, -0.45], [-1.35, -4.5, -0.12], [1.35, -4.5, 0.12], [3.7, -2.1, 0.45]];
function pathPaw(g, x, y, s) {
  pathBlob(g, turn(PAD, 0, x, y, s));
  for (const [tx, ty, rot] of TOES) pathEllipse(g, x + tx * s, y + ty * s, 1.3 * s, 1.7 * s, rot);
  return [x - 5.2 * s, y - 6.2 * s, x + 5.2 * s, y + 3.7 * s];
}

/** Чешуйки шляпки жёлудя: косая клетка поверх формы. */
function hatch(c, color) {
  c.strokeStyle = color;
  c.lineWidth = 0.6;
  c.beginPath();
  for (let x = -16; x < 12; x += 2.6) {
    c.moveTo(x, -10);
    c.lineTo(x + 6, 1);
    c.moveTo(x + 6, -10);
    c.lineTo(x, 1);
  }
  c.stroke();
}

/** Двойная искорка: тёмная кайма и светлая середина — видна на любой подложке. */
function twinkle(g, x, y, r, edge = '#d98a1c', core = '#fffbe0') {
  sparkle(g, x, y, r, alpha(edge, 0.9), 0.36);
  sparkle(g, x, y, r * 0.78, core, 0.22);
}

// ---------- украшения ----------

const item = (id, paint) => centered(`item.${id}`, 24, paint);

// клевер: четыре листика-сердечка — удача
item('clover', (g) => {
  const look = tone('#4fb04a', { light: '#a4e67c', dark: '#2a7a38', lw: 1.2 });
  cord(g, [[0.2, -0.8], [0.6, 4.6], [2.4, 9.4]], '#4a9a40', 1.5, look.line);
  for (const a of [2.36, -2.36, 0.79, -0.79]) {             // нижние — первыми
    const pts = turn(LEAFLET, a, 0, -1.2, 1.3);
    blob(g, pts, look, {
      over(c) {
        stroke(c, [pts[0], pts[4]], alpha('#d8f7b0', 0.7), 0.7);
      },
    });
  }
  speck(g, -5.6, -7.4, 0.9, 0.8);
});

// заячья лапка на колечке: брелок на скорость
item('rabbitfoot', (g) => {
  const at = (pts) => turn(pts, 0.62, -0.5, 0.5, 1.1);
  const coat = tone('#f4ebdf', { light: '#ffffff', dark: '#cbb9a2', line: '#7a6652', lw: 1.2 });
  const [hx, hy] = at([[0, -9.3]])[0];
  ring(g, hx, hy, 1.6, COLORS.coin, 1.1, GOLD.line);
  blob(g, at([[-2.6, -5.8], [2.6, -5.8], [3.7, -1], [4.3, 4], [4, 7.4], [2.5, 9.4], [1.3, 8.3, 1], [0, 9.8], [-1.3, 8.3, 1], [-2.5, 9.4], [-4, 7.4], [-4.3, 4], [-3.7, -1]]), coat, {
    over(c) {
      for (const x of [-1.3, 1.3]) stroke(c, at([[x, 8.4], [x * 0.9, 6.2]]), alpha('#9a8672', 0.8), 0.7);
      fur(c, at([[-1.6, -1.8], [1.5, 1], [-1.2, 3.8]]).map(([x, y]) => [x, y, 2.2, 2.6]), alpha('#b8a48f', 0.8), 0.7);
    },
  });
  poly(g, at([[-3.2, -8.2], [3.2, -8.2], [3.6, -4.8], [-3.6, -4.8]]), GOLD, {
    over(c) {
      stroke(c, at([[-3.6, -6], [3.6, -6]]), alpha(COLORS.coinDark, 0.8), 0.7);
    },
  });
});

// волчий клык в кожаной обмотке
item('fang', (g) => {
  const at = (pts) => turn(pts, -0.22, 0.5, 0.6);
  const [rx, ry] = at([[0.2, -8.9]])[0];
  ring(g, rx, ry, 1.6, COLORS.coin, 1.1, GOLD.line);
  blob(g, at([[-3.3, -4.6], [3.5, -4.6], [4.1, -0.4], [3.3, 3.9], [1, 7.4], [-2.6, 9.6, 1], [-1.7, 6.2], [-2.5, 2.6], [-3.5, -1]]), BONE, {
    over(c) {
      stroke(c, at([[1.7, -2.6], [2, 1.6], [0.7, 5]]), alpha('#b8a070', 0.6), 0.7);
    },
  });
  blob(g, at([[-3.9, -7.2], [0.1, -7.6], [4.1, -7.2], [4.4, -3.6], [0.1, -3.2], [-4.2, -3.6]]), HIDE, {
    over(c) {
      for (const x of [-2.2, 0.1, 2.4]) stroke(c, at([[x, -6.6], [x + 0.5, -4.2]]), alpha('#f1d8a8', 0.75), 0.6);
    },
  });
  const [sx, sy] = at([[-1.4, -1]])[0];
  speck(g, sx, sy, 0.9, 0.85);
});

// перо совы: бурое, с поперечными светлыми полосами
item('owlfeather', (g) => {
  const at = (pts) => turn(pts, 0.7, 0, 0, 1.16);
  const brown = tone('#a87848', { light: '#dcb27c', dark: '#6a4424', lw: 1.2 });
  const pale = tone('#f3e4c4', { light: '#ffffff', dark: '#cdb48a' });
  const [q1, q2] = at([[0, 7.8], [0, 10.2]]);
  capsule(g, q1[0], q1[1], 0.7, q2[0], q2[1], 0.5, tone('#efe0bf', { lw: 0.8 }));
  blob(g, at([[0, -10.4], [2.6, -8.6], [4.3, -4.2], [4.6, 0.6], [3.7, 4.4], [2.3, 5.4, 1], [2.7, 7], [0.8, 8.2], [-0.8, 8.2], [-2.9, 6.8], [-2.3, 5.2, 1], [-4.1, 3.2], [-3.1, 2.2, 1],
    [-4.6, -0.2], [-4.3, -4.6], [-2.6, -8.6]]), brown, {
    over(c, patch) {
      for (const y of [-7.6, -3.6, 0.4, 4.2]) patch((p) => pathPoly(p, at([[-6, y + 2.4], [0, y], [6, y + 2.4], [6, y + 4], [0, y + 1.6], [-6, y + 4]])), pale);
      stroke(c, at([[0, -9.6], [0, 8.2]]), '#fff6e0', 0.8);
    },
  });
});

// ягода-сердце: ещё одно сердце
item('heartberry', (g) => {
  g.rotate(-0.12);
  capsule(g, 0.2, -4.4, 0.9, 1.6, -9.4, 0.7, tone('#6a8f3a', { dark: '#3f5a22', lw: 0.9 }));
  blob(g, heart(0, 1.9, 8.6), RED, {
    over(c) {
      for (const [x, y] of [[-4.8, 0.2], [-1.4, 2.8], [3.2, 1.4], [5.6, -1.6], [-2.6, 6], [1.8, 5.8], [1, -1]]) dot(c, x, y, 0.5, alpha('#ffe9a8', 0.9), 0.75);
    },
  });
  leaf(g, 0.2, -4, -6.2, -6.6, 4, GREEN, 0.12);
  leaf(g, 0.2, -4, 6.4, -6.2, 4, GREEN, -0.12);
  leaf(g, 0.2, -4.6, 0.6, 0.6, 3.2, GREEN);
  speck(g, -4.6, -2.8, 1.4, 0.85);
  speck(g, -6.2, -0.6, 0.6, 0.7);
});

// синий кристалл: больше маны
item('crystal', (g) => {
  glow(g, 0, -0.4, 10.6, COLORS.mana, 0.26);
  const gem = tone(COLORS.mana, { light: '#d8ecff', dark: COLORS.manaDark, line: '#173f86', lw: 1.1, rim: 0.7 });
  // осколок: pts — контур от левого низа по часовой, ridge — ребро от вершины (третий узел) к основанию
  const shard = (pts, ridge) => poly(g, pts, gem, {
    over(c) {
      dotless(c, [pts[0], pts[1], pts[2], ...ridge], alpha('#ffffff', 0.3));
      dotless(c, [pts[2], pts[3], pts[4], ridge[1], ridge[0]], alpha(COLORS.manaDark, 0.3));
      stroke(c, sharp([pts[2], ...ridge]), alpha('#ffffff', 0.85), 0.6);
    },
  });
  shard([[-9.4, 8.4], [-9.8, 2.4], [-7.2, -2.8], [-4.4, 1.8], [-4.2, 8.4]], [[-7.1, 2.6], [-6.9, 8.4]]);
  shard([[4.2, 8.4], [4.4, 0.4], [7.3, -4.8], [9.9, 0.2], [9.5, 8.4]], [[7.2, 1], [7, 8.4]]);
  shard([[-3.5, 8.4], [-4.3, -3.8], [-0.4, -10.4], [3.7, -4.4], [3.3, 8.4]], [[-0.6, -3.2], [-0.2, 8.4]]);
  blob(g, [[-10.2, 8], [-6, 6.8], [0, 7.6], [6, 6.6], [10.2, 7.8], [9.4, 10], [0, 10.4], [-9.4, 10]], tone('#6f7783', { light: '#aab3bd', dark: '#3f4752', lw: 1.1 }));
  sparkle(g, 7.2, -8.4, 2.2, '#ffffff', 0.2);
});

/** Закрасить многоугольник одним цветом без обводки (грань, блик). */
function dotless(g, pts, color) {
  g.fillStyle = color;
  g.beginPath();
  pathPoly(g, pts);
  g.fill();
}

// утренняя роса: большая капля на листе
item('dew', (g) => {
  leaf(g, -10.2, 6.8, 10.2, -3.4, 11, tone('#58b84e', { light: '#a4e67c', dark: '#2f7f3a', lw: 1.2 }), 0.1, '#2f7f3a');
  const water = tone('#a8dcff', { light: '#ffffff', dark: '#4a9fe0', line: '#2a6fb0', lw: 1.1, rim: 0.8 });
  ball(g, -0.6, 0, 5.4, 5.2, water, {
    over(c) {
      glow(c, 0.8, 3.8, 4.4, '#8fe27a', 0.55);                // лист просвечивает сквозь каплю
    },
  });
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(-0.6, 0, 3.7, 0.25, 1.25);
  g.stroke();
  shine(g, -0.6, 0, 5.4, 0.95);
  ball(g, 6.4, -1.2, 1.5, 1.4, thin(water, 0.8));
  speck(g, 5.9, -1.7, 0.45, 0.9);
  twinkle(g, 7.4, -7.8, 2.6, '#e0a01c');
});

// подкова-магнит: красная, со стальными концами; к ней летит монета
item('magnet', (g) => {
  const at = (pts) => turn(pts, 0.55, -0.9, 0.9);
  const red = tone('#e8423c', { light: '#ff8f7a', dark: '#a3202c', lw: 1.3 });
  const tip = tone('#e9eef3', { light: '#ffffff', dark: '#8f9aa8' });
  blob(g, at([[-7.6, -6.6, 1], [-7.6, 2], [-5.4, 7], [0, 9.2], [5.4, 7], [7.6, 2], [7.6, -6.6, 1], [3.4, -6.6, 1], [3.4, 2], [2.4, 4.2], [0, 5.1], [-2.4, 4.2], [-3.4, 2], [-3.4, -6.6, 1]]), red, {
    over(c, patch) {
      for (const s of [-1, 1]) {
        patch((p) => pathPoly(p, at([[s * 2.4, -8], [s * 8.8, -8], [s * 8.8, -3], [s * 2.4, -3]])), tip);
        stroke(c, at([[s * 3.4, -3], [s * 7.6, -3]]), alpha(red.line, 0.85), 0.8);
      }
    },
  });
  ball(g, 5.8, -8.2, 2.3, 2.3, thin(GOLD, 0.9));
  speck(g, 5.1, -8.9, 0.6, 0.9);
});

// двойной хвост: два лисьих хвоста в одной связке
item('twintail', (g) => {
  const tail = [[-1.8, 0], [-3.4, -4], [-4.8, -9], [-4.4, -13.6], [-2.2, -17], [0, -19.2, 1], [2.6, -16.4], [4.6, -12.6], [4.8, -8], [3.4, -3.6], [1.8, 0]];
  const tip = [[-7, -11.6], [-3, -13.2, 1], [-1.6, -11.4, 1], [0, -13.4, 1], [1.6, -11.4, 1], [3, -13.2, 1], [7, -11.6], [7, -22], [-7, -22]];
  for (const a of [0.42, -0.42]) {
    const at = (pts) => turn(pts, a, 0, 9);
    blob(g, at(tail), COAT, {
      over(c, patch) {
        patch(at(tip), CREAM);
        fur(c, at([[-1.6, -6.2], [1.5, -9]]).map(([x, y]) => [x, y, a - 1.3, 2.6]), alpha('#c4601a', 0.7), 0.7);
      },
    });
  }
  plate(g, -2.7, 6.6, 2.7, 10.2, 1.2, HIDE, {
    over(c) {
      for (const x of [-1.2, 1]) stroke(c, [[x, 7.2], [x + 0.4, 9.6]], alpha('#f1d8a8', 0.75), 0.6);
    },
  });
});

// огненный хвост: кончик горит
item('firetail', (g) => {
  glow(g, 4.6, -4, 6.6, COLORS.fire, 0.4);
  const fire = tone(COLORS.fire, { light: '#ffb04a', dark: '#e2491c', line: '#a8301a', lw: 1.1, rim: 0 });
  const tongue = (s, dx, dy) => turn(FLAME, 0.5, 0.8 + dx, 3.4 + dy, s);
  blob(g, tongue(1.3, 0, 0), fire, {
    over(c) {
      c.fillStyle = COLORS.fireLight;
      c.beginPath();
      pathBlob(c, tongue(0.86, 0.9, -1.2));
      c.fill();
      c.fillStyle = '#fffbe6';
      c.beginPath();
      pathBlob(c, tongue(0.5, 1.6, -2.2));
      c.fill();
    },
  });
  blob(g, [[-9.2, 9.4], [-9.6, 5.8], [-7.6, 2.2], [-4.2, -0.2], [-0.6, -0.6], [2.4, 1.2], [3, 4.4], [1, 7], [-2.6, 8.2], [-5.6, 10]], COAT, {
    over(c, patch) {
      // кончик раскалён добела
      patch([[0.4, -3], [-1.6, 1, 1], [0, 2.4, 1], [-1, 4.4, 1], [0.8, 5.6, 1], [0.4, 9], [6, 9], [6, -3]], tone('#ffd76a', { light: '#fffbe6', dark: '#ff9a3c' }));
      fur(c, [[-6.2, 5.2, -0.6, 2.8], [-3.6, 3, -0.5, 2.8], [-4.4, 7.2, -0.4, 2.4]], alpha('#c4601a', 0.7), 0.7);
    },
  });
  dot(g, -1.4, -7.4, 0.8, '#ffd76a');
  dot(g, 9.6, -0.6, 0.7, '#ffb04a');
});

// ледяной след: отпечаток лапы из льдинок
item('icetrail', (g) => {
  g.rotate(-0.18);
  const ice = tone('#a8e6ff', { light: '#ffffff', dark: '#58aee0', line: '#2f74ad', lw: 1.1, rim: 0.8 });
  const toe = [[0, -2.9], [1.9, -1.2], [1.9, 1.3], [0, 2.7], [-1.9, 1.3], [-1.9, -1.2]];
  for (const [x, y, a] of [[-6.5, -1.2, -0.5], [-2.5, -5.5, -0.16], [2.5, -5.5, 0.16], [6.5, -1.2, 0.5]]) {
    const pts = turn(toe, a, x, y);
    poly(g, pts, ice, {
      over(c) {
        stroke(c, [pts[0], pts[3]], 'rgba(255,255,255,0.8)', 0.6);
      },
    });
  }
  poly(g, [[0, -0.4], [4, 1.2], [6.2, 5.2], [4.2, 9], [1.4, 7.8], [0, 8.8], [-1.4, 7.8], [-4.2, 9], [-6.2, 5.2], [-4, 1.2]], ice, {
    over(c) {
      stroke(c, sharp([[-4, 1.2], [0, 4], [4, 1.2]]), 'rgba(255,255,255,0.8)', 0.6);
      stroke(c, [[0, 4], [0, 8.8]], 'rgba(255,255,255,0.8)', 0.6);
    },
  });
  sparkle(g, 8, -7, 2.2, '#ffffff', 0.2);
});

// комариный хоботок: голова комара, игла и капля на её кончике
item('proboscis', (g) => {
  cord(g, [[4, -8.8], [2.9, -10]], '#8a7460', 0.7, '#3a2c24');
  cord(g, [[7, -8.6], [8.6, -9.8]], '#8a7460', 0.7, '#3a2c24');
  capsule(g, 3.2, -3.4, 1.25, -4.4, 4.2, 0.5, tone('#d9a85a', { light: '#f6d79a', dark: '#8a5a24', lw: 1 }));
  blob(g, drop(-5.4, 6.6, 3.6), thin(RED, 1.1));
  speck(g, -6.2, 6.6, 0.8, 0.9);
  ball(g, 5.2, -5.6, 4, 4, tone('#7a6454', { light: '#a8927c', dark: '#463628', lw: 1.1 }));
  ball(g, 3.7, -4.9, 1.9, 2.1, tone('#d8453a', { light: '#ff9a8a', dark: '#8a1c24', lw: 0.8 }));
  speck(g, 3.2, -5.6, 0.55, 0.9);
});

// жёлудь-оберег: на орехе — щиток
item('acornshield', (g) => {
  g.rotate(-0.14);
  capsule(g, 0.2, -8, 0.85, 1.3, -9.7, 0.75, tone('#6e4a28', { lw: 0.9 }));
  blob(g, NUT, tone('#dba95c', { light: '#f8dca0', dark: '#a67430', lw: 1.3 }));
  blob(g, NUT_CAP, tone('#8a5a30', { light: '#b98850', dark: '#573618', lw: 1.3 }), {
    over(c) {
      hatch(c, alpha('#3a2010', 0.55));
    },
  });
  blob(g, [[-3.2, 0.9, 1], [0, 0.3], [3.2, 0.9, 1], [3.1, 3.8], [1.9, 5.9], [0, 7.1, 1], [-1.9, 5.9], [-3.1, 3.8]], tone(COLORS.shield, { light: '#eef4fb', dark: '#5f7fa8', line: '#33435e', lw: 1 }), {
    over(c) {
      dotless(c, [[-4, 0], [0, 0], [0, 8], [-4, 8]], alpha('#ffffff', 0.32));
    },
  });
});

// кошель барсука: полосатый, как барсучья морда; рядом монета
item('pouch', (g) => {
  const hide = tone('#a8703c', { light: '#d9a060', dark: '#6a4020', lw: 1.3 });
  const tie = tone('#d8453a', { light: '#ff8a78', dark: '#9a2028', lw: 1 });
  blob(g, [[-3, -3.4], [-5.6, -8.4], [-3.4, -7, 1], [-1.7, -9.2], [0, -7.2, 1], [1.7, -9.2], [3.4, -7, 1], [5.6, -8.4], [3, -3.4]], thin(hide, 1.1));
  blob(g, [[-4, -3.6], [4, -3.6], [7.4, 0.4], [8.6, 4.8], [6.8, 8.8], [0, 10.2], [-6.8, 8.8], [-8.6, 4.8], [-7.4, 0.4]], hide, {
    over(c, patch) {
      patch((p) => pathPoly(p, [[-1.5, -5], [1.5, -5], [2.9, 12], [-2.9, 12]]), tone('#fbf2e2', { dark: '#d9c8ac' }));
      for (const s of [-1, 1]) patch((p) => pathPoly(p, [[s * 4.6, -5], [s * 2.5, -5], [s * 4.5, 12], [s * 7.8, 12]]), tone('#463a40', { light: '#6e5e64', dark: '#281e26' }));
    },
  });
  leaf(g, 3.9, -3.2, 7.6, -0.6, 2.2, tie);
  leaf(g, 3.9, -3.2, 6.2, 0.8, 2, tie);
  capsule(g, -3.6, -3.5, 1.1, 3.6, -3.5, 1.1, tie);
  ball(g, 4, -3.4, 1.5, 1.5, tie);
  ball(g, 6.9, 7.3, 3.1, 3.1, thin(GOLD, 1), {
    over(c) {
      c.strokeStyle = alpha(COLORS.coinDark, 0.8);
      c.lineWidth = 0.7;
      c.beginPath();
      c.arc(6.9, 7.3, 2, 0, TAU);
      c.stroke();
    },
  });
  speck(g, 5.9, 6.2, 0.6, 0.9);
});

// глаз совы: янтарный, в кругу перьев — видит всю карту
item('owleye', (g) => {
  blob(g, [[9, 0, 1], ...tuftsArc(0, 0, 9, 0, TAU, 12, 1.7, 0.4)], tone('#9a7648', { light: '#cfa878', dark: '#5e4424', lw: 1.2 }), {
    over(c, patch) {
      patch((p) => pathEllipse(p, 0, 0, 7.3, 7.3), tone('#e9d2a6', { light: '#fff4dc', dark: '#b89a68' }));
      c.strokeStyle = alpha('#7a5a34', 0.6);
      c.lineWidth = 0.6;
      c.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 5.8, Math.sin(a) * 5.8);
        c.lineTo(Math.cos(a) * 7.4, Math.sin(a) * 7.4);
        c.stroke();
      }
    },
  });
  ball(g, 0, 0, 5.4, 5.4, tone('#ffb629', { light: '#fff0a8', dark: '#d9741c', line: '#5e3410', lw: 1.1 }));
  dot(g, 0, 0, 2.8, '#1e1410');
  speck(g, -1.3, -1.5, 1.1, 1);
  speck(g, 1.4, 1.5, 0.45, 0.8);
});

// подкова удачи: золотая, концами вниз
item('horseshoe', (g) => {
  const at = (pts) => turn(pts, -0.2, 0.3, 0.3);
  blob(g, at([[-7.6, 8.8, 1], [-9.4, 3.4], [-8.8, -3.6], [-5.2, -8.4], [0, -10], [5.2, -8.4], [8.8, -3.6], [9.4, 3.4], [7.6, 8.8, 1], [4.4, 8.8, 1], [5, 3.6], [4.4, -1.6], [2.6, -4.4], [0, -5.4],
    [-2.6, -4.4], [-4.4, -1.6], [-5, 3.6], [-4.4, 8.8, 1]]), thin(GOLD, 1.3), {
    over(c) {
      for (const [x, y] of at([[-7.1, 4.4], [-6.8, -1], [-4.9, -5.2], [7.1, 4.4], [6.8, -1], [4.9, -5.2]])) dot(c, x, y, 0.75, alpha('#7a4a0c', 0.85), 0.95);
    },
  });
  twinkle(g, 0.4, 3.2, 3);
});

// колючий ошейник: красный ремень со стальными шипами
item('collar', (g) => {
  const band = tone('#cf3640', { light: '#ff8a80', dark: '#7c1a2c', lw: 1.2 });
  const steel = tone('#e4e9ee', { light: '#ffffff', dark: '#8690a0', line: '#3a424e', lw: 0.9 });
  // шип: основание на ободе под углом a, остриё наружу
  const spike = (a, rx, ry, len) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const bx = c * rx;
    const by = 0.6 + s * ry;
    const d = Math.hypot(c, s * 0.86);
    const ux = c / d;
    const uy = (s * 0.86) / d;
    poly(g, [[bx - uy * 1.5, by + ux * 1.5], [bx + ux * len, by + uy * len], [bx + uy * 1.5, by - ux * 1.5]], steel);
  };
  for (const i of [4, 5, 6, 7]) spike(Math.PI / 8 + (i * Math.PI) / 4, 7, 5.6, 3);          // дальние — за ремнём
  solid(g, (c) => {
    pathEllipse(c, 0, 0.6, 7.6, 6.2);
    c.moveTo(4.6, 0.1);
    c.ellipse(0, 0.1, 4.6, 3.3, 0, 0, TAU, true);
    c.closePath();
    return [-7.6, -5.6, 7.6, 6.8];
  }, band);
  for (const i of [0, 1, 2, 3]) spike(Math.PI / 8 + (i * Math.PI) / 4, 6.2, 4.9, 3.4);      // ближние — поверх
  plate(g, -1.4, 4.2, 1.4, 6.6, 0.5, thin(GOLD, 0.9));
});

// громовой бубенец: золотой шарик с прорезью, вокруг — молнии
item('bell', (g) => {
  const zap = tone(COLORS.lightning, { light: '#ffffff', dark: '#f2c84a', line: '#7a5cd0', lw: 0.9, rim: 0 });
  poly(g, turn(BOLT, 0.5, 7.6, -6.6, 0.58), zap);
  poly(g, turn(BOLT, -0.6, -8, -5, 0.5), zap);
  poly(g, turn(BOLT, 2.5, 8.6, 6.6, 0.42), zap);
  ring(g, -0.4, -6.6, 1.7, COLORS.coin, 1.2, GOLD.line);
  ball(g, -0.4, 1.8, 7.4, 7.4, thin(GOLD, 1.3), {
    over(c) {
      stroke(c, [[-8, 1.4], [-0.4, 3.2], [7.2, 1.4]], alpha(COLORS.coinDark, 0.9), 0.9);
      stroke(c, [[-8, 2.4], [-0.4, 4.2], [7.2, 2.4]], alpha(COLORS.coinLight, 0.7), 0.6);
      stroke(c, [[-3.6, 6.2], [2.8, 6.2]], '#5e3a0c', 1.3);
      dot(c, -3.6, 6.2, 1.15, '#5e3a0c');
      dot(c, 2.8, 6.2, 1.15, '#5e3a0c');
    },
  });
  shine(g, -0.6, 0.6, 7, 0.85);
});

// пружинистые лапы: лапа на пружине
item('springpaws', (g) => {
  g.rotate(0.12);
  const coil = sharp([[-4.2, 2.2], [4.2, 3.4], [-4.2, 5.1], [4.2, 6.3], [-4.2, 8], [4.2, 9.2]]);
  stroke(g, coil, '#3a424e', 2.9);
  stroke(g, coil, '#aab3bd', 1.7);
  stroke(g, coil.map(([x, y]) => [x, y - 0.4, 1]), '#f2f5f8', 0.55);
  solid(g, (c) => {
    pathEllipse(c, 0, -2.2, 5.7, 4.1);
    for (const [x, y, r] of [[-4.4, -6, 2], [-1.5, -7.4, 2.1], [1.5, -7.4, 2.1], [4.4, -6, 2]]) pathEllipse(c, x, y, r, r);
    return [-6.4, -9.5, 6.4, 1.9];
  }, thin(COAT, 0.75), { union: true });
  const bean = alpha('#ffb7a0', 0.95);
  dot(g, 0, -1.8, 2.7, bean, 2);
  for (const [x, y] of [[-4.3, -5.9], [-1.5, -7.3], [1.5, -7.3], [4.3, -5.9]]) dot(g, x, y, 1.05, bean);
});

// колокольчик тишины: замотан тряпицей — не звенит
item('hushbell', (g) => {
  g.rotate(-0.1);
  const metal = tone('#a9bcd6', { light: '#eef4fb', dark: '#5f7fa8', line: '#33435e', lw: 1.3 });
  const cloth = tone('#f6ead8', { light: '#ffffff', dark: '#c8b49a', line: '#7a6652', lw: 1.1 });
  ring(g, 0, -8.2, 1.6, '#a9bcd6', 1.2, metal.line);
  blob(g, [[-2.6, -7.2], [2.6, -7.2], [4.8, -4.2], [6, 1], [7, 4.8], [9.2, 7], [8.8, 8.8], [0, 9.6], [-8.8, 8.8], [-9.2, 7], [-7, 4.8], [-6, 1], [-4.8, -4.2]], metal, {
    over(c) {
      stroke(c, [[-9, 6.4], [0, 7.6], [9, 6.4]], alpha(metal.line, 0.55), 0.7);
    },
  });
  leaf(g, 6.2, -0.6, 10, 3.2, 2.6, cloth, 0.1);
  leaf(g, 6.2, -0.4, 8.2, 5.4, 2.4, cloth, -0.1);
  blob(g, [[-6.9, -2.2], [0, -0.8], [6.7, -3], [7.4, 1], [0, 3.4], [-7.4, 2.2]], cloth, {
    over(c) {
      stroke(c, [[-6, 0.6], [0, 1.6], [5.6, -0.4]], alpha('#a8947a', 0.6), 0.6);
    },
  });
  ball(g, 6.6, -0.9, 1.7, 1.7, cloth);
});

// ботва моркови: три листа веером от макушки (tx, ty); at ставит узлы на место
function carrotTop(g, at) {
  const [tx, ty] = at([[0, -5.4]])[0];
  for (const [x, y, w] of [[-3.6, -9.8, 2.8], [4, -9.4, 2.8], [0.4, -10.6, 3]]) {
    const [qx, qy] = at([[x, y]])[0];
    leaf(g, tx, ty, qx, qy, w, GREEN);
  }
}

// поперечные бороздки на моркови
function carrotRidges(c, at, color) {
  for (const line of [[[-2.6, -2.2], [-0.8, -1.8]], [[0.9, 1.4], [2.3, 1.1]], [[-1.7, 4.2], [-0.3, 4.5]]]) stroke(c, at(line), color, 0.7);
}

// морковка-приманка: висит на бечёвке
item('carrot', (g) => {
  const at = (pts) => turn(pts, 0.5, 0.4, 0.2);
  cord(g, [[-7.4, -10.2], [-4.6, -8.6], [-0.4, -5.5]], '#e9d8b0', 0.9, '#6a5a3a');
  carrotTop(g, at);
  blob(g, at(CARROT), tone('#f58a2c', { light: '#ffbf6a', dark: '#c2541a', lw: 1.3 }), {
    over(c) {
      carrotRidges(c, at, alpha('#a8441a', 0.7));
    },
  });
  cord(g, at([[-3.7, -4.4], [0, -3.8], [3.7, -4.4]]), '#e9d8b0', 0.9, '#6a5a3a');
});

// зеркальце: выстрел может раздвоиться
item('mirror', (g) => {
  const frame = tone('#f07a9c', { light: '#ffc0d0', dark: '#b03a64', lw: 1.3 });
  capsule(g, -3, 3.4, 1.7, -7.4, 8.4, 1.9, frame);
  ball(g, 1.8, -2.6, 7.6, 7.6, frame);
  ball(g, 1.8, -2.6, 5.5, 5.5, tone('#bfe9ff', { light: '#ffffff', dark: '#6ab4e0', line: '#8a2c50', lw: 0.9, rim: 0 }), {
    over(c) {
      dotless(c, [[-2.4, -3], [2.6, -9], [4.4, -9], [-2.4, -0.6]], 'rgba(255,255,255,0.7)');
      dotless(c, [[-0.4, 1.4], [6.4, -6.8], [7.2, -6], [0.6, 2]], 'rgba(255,255,255,0.5)');
    },
  });
  sparkle(g, 4.8, -5.4, 2.4, '#ffffff', 0.2);
});

// мёд: горшочек с потёками и ложка-веретёнце
item('honey', (g) => {
  const clay = tone('#d9944a', { light: '#f6c480', dark: '#9a5a24', lw: 1.3 });
  const gold = tone('#ffc93c', { light: '#fff3b0', dark: '#e0961c', line: '#9a5a10', lw: 1 });
  blob(g, [[-6.4, -3.4], [6.4, -3.4], [8.4, 0.8], [8.2, 5.6], [5.6, 9.2], [0, 10], [-5.6, 9.2], [-8.2, 5.6], [-8.4, 0.8]], clay);
  solid(g, (c) => pathEllipse(c, 0, -4.2, 6.9, 2.3), tone('#b8742c', { light: '#dba25a', dark: '#7a4a1a', lw: 1.2 }));
  solid(g, (c) => pathEllipse(c, 0, -4.2, 5.4, 1.5), thin(gold, 0.7));
  capsule(g, 2.2, -4.4, 0.8, 5.6, -7.2, 0.8, thin(WOOD, 0.9));
  solid(g, (c) => pathEllipse(c, 6.4, -7.8, 2.6, 2, -0.7), thin(WOOD, 1), {
    over(c) {
      for (const d of [-1, 0, 1]) stroke(c, [[5.2 + d * 1.2, -9.6 + d * 0.9], [7.6 + d * 1.2, -6.8 + d * 0.9]], alpha('#754a26', 0.8), 0.6);
    },
  });
  blob(g, [[-6.6, -3.6], [-3.4, -2.2], [0, -1.8], [3.4, -2.2], [6.6, -3.6], [6.5, -0.8], [5.2, 1.2], [4, -0.6], [2, -0.2], [0.6, 4.2], [-0.8, 0], [-3.2, -0.6], [-4.6, 1.8], [-6.2, -0.8]], gold);
  speck(g, -4.4, -1.6, 0.7, 0.85);
  speck(g, -5.4, 4.4, 1.1, 0.5);
});

// точильный камень: брусок, по нему идёт лезвие — летят искры
item('whetstone', (g) => {
  const edge = '#3f4a5a';
  poly(g, [[-9.6, 0.6], [-2.4, 4.6], [-2.4, 9], [-9.6, 5]], tone('#8f9bb0', { light: '#b4bfd0', dark: '#5a667c', line: edge, lw: 1.2 }));
  poly(g, [[-2.4, 4.6], [9.6, -1], [9.6, 3.4], [-2.4, 9]], tone('#6f7c94', { light: '#8f9bb0', dark: '#465066', line: edge, lw: 1.2 }));
  poly(g, [[-9.6, 0.6], [2.4, -5], [9.6, -1], [-2.4, 4.6]], tone('#c3ccd8', { light: '#f2f6fa', dark: '#8a96a8', line: edge, lw: 1.2 }), {
    over(c) {
      dotless(c, [[-6.4, 0.6], [3.4, -4], [5.6, -2.8], [-4.2, 1.8]], alpha('#ffffff', 0.4));
    },
  });
  poly(g, [[-4.6, 0.4], [8.4, -10], [10.6, -7.4]], tone('#e4e9ee', { light: '#ffffff', dark: '#8690a0', line: '#3a424e', lw: 1 }), {
    over(c) {
      stroke(c, [[-4.2, 0.2], [9.4, -8.6]], alpha('#5f6975', 0.6), 0.6);
    },
  });
  twinkle(g, -6.4, -3.6, 2.6);
  twinkle(g, -2.4, -6.8, 1.6);
  twinkle(g, -9, -7, 1.3);
});

// быстрые лапы: лисья лапа с крылышком
item('quickpaws', (g) => {
  g.rotate(-0.16);
  for (const [x0, x1, y] of [[-9.4, -5.6, 5.6], [-8.4, -5.4, 8.4]]) cord(g, [[x0, y], [x1, y]], '#fff6e2', 1, '#5a4a3e', 0.9);
  blob(g, [[-2.4, 1.8], [-4.6, -2.4], [-8.4, -6.4, 1], [-7, -2.6], [-10, -3, 1], [-7.6, 0], [-9.4, 1.9, 1], [-5.6, 2.8], [-2.8, 3.4]], tone('#ffffff', { light: '#ffffff', dark: '#c4d2e4', line: '#56617a', lw: 1 }));
  blob(g, [[-3.3, -8.4], [-0.8, -9.3], [1.7, -8.4], [2.4, -3.2], [2.8, 1.6], [6.6, 3.4], [8.2, 6], [7, 8.6], [0, 8.8], [-3.6, 8], [-4.2, 3], [-3.8, -3]], COAT, {
    over(c, patch) {
      patch([[-6, -0.4], [-2.4, -1.4, 1], [-1, 0, 1], [0.6, -1.4, 1], [2, 0, 1], [4, -1], [10, 2], [10, 12], [-6, 12]], SOCK);
      stroke(c, [[5.5, 6.6], [5.2, 8.4]], alpha('#9a6a4c', 0.9), 0.6);
      stroke(c, [[7, 6.4], [6.8, 8.2]], alpha('#9a6a4c', 0.9), 0.6);
    },
  });
});

// бережливый мешочек: туго завязан, с заплаткой и каплей маны
item('thrift', (g) => {
  const cloth = tone('#5a66cc', { light: '#98a4f6', dark: '#333a8c', lw: 1.3 });
  const tie = tone('#ffc93c', { light: '#fff0a8', dark: '#c8901c', lw: 0.9 });
  blob(g, [[-2.4, -4], [-4.2, -7.8], [-2.2, -6.8, 1], [0, -8.4], [2.2, -6.8, 1], [4.2, -7.8], [2.4, -4]], thin(cloth, 1.1));
  blob(g, [[-3.2, -3.4], [3.2, -3.4], [6.6, 0.8], [7.2, 5.4], [5.4, 9], [0, 9.9], [-5.4, 9], [-7.2, 5.4], [-6.6, 0.8]], cloth, {
    over(c, patch) {
      const sewn = [[-6.4, 3.4], [-2.9, 2.6], [-2.3, 6], [-5.9, 6.8]];
      patch((p) => pathPoly(p, sewn), tone('#d9a85a', { dark: '#a67430' }));
      c.strokeStyle = alpha('#fff1dc', 0.9);
      c.lineWidth = 0.5;
      c.setLineDash([0.9, 0.9]);
      c.beginPath();
      pathPoly(c, sewn);
      c.stroke();
      c.setLineDash([]);
    },
  });
  blob(g, drop(1.8, 4.2, 3.4), tone('#bfe9ff', { light: '#ffffff', dark: '#5fb0ee', line: '#1f4f9a', lw: 0.9 }));
  speck(g, 1.1, 4.6, 0.6, 0.9);
  leaf(g, 0, -3.4, -3.6, -0.4, 1.8, tie);
  leaf(g, 0, -3.4, 3.6, -0.4, 1.8, tie);
  leaf(g, 0, -3.6, -4.8, -5, 2.8, tie);
  leaf(g, 0, -3.6, 4.8, -5, 2.8, tie);
  ball(g, 0, -3.6, 1.2, 1.2, tie);
});

// рог лося: широкая лопата с отростками
item('antler', (g) => {
  const horn = tone('#d9b88a', { light: '#f8e6c4', dark: '#9a7648', lw: 1.3 });
  blob(g, [[-8.6, 9], [-9, 6.2], [-6.6, 3.2], [-8, -0.2], [-9.6, -4.6, 1], [-6.2, -2.8], [-6.2, -9.6, 1], [-3, -5.2], [-0.2, -10.6, 1], [1.6, -5.6], [5.4, -9.6, 1], [5, -4.2], [9.8, -5.4, 1],
    [8.6, -1.2], [5.2, 2.8], [0.4, 5], [-3.2, 6.4], [-4.6, 9]], horn, {
    over(c) {
      for (const line of [[[-6.4, 7], [-4.4, 2], [-7.6, -2.6]], [[-4.4, 2], [-5.6, -6.4]], [[-3.6, 2.4], [-0.6, -6.6]], [[-1.6, 2.6], [4.4, -6.2]], [[0.6, 2.6], [7.4, -3.6]]]) {
        stroke(c, line, alpha('#8a6438', 0.5), 0.7);
      }
    },
  });
  solid(g, (c) => pathEllipse(c, -6.6, 9, 2.7, 1.4), tone('#b8905a', { light: '#dcb884', dark: '#7a5628', lw: 1.1 }));
});

// медвежий амулет: деревянная голова медведя на красном шнурке
item('bearcharm', (g) => {
  const wood = tone('#a06c3a', { light: '#d29c5e', dark: '#623c1c', lw: 1.3 });
  cord(g, sharp([[-6.8, -10.2], [0, -5.4], [6.8, -10.2]]), '#d8453a', 1.1, '#7a1c24');
  for (const s of [-1, 1]) {
    ball(g, s * 5.4, -2.6, 2.9, 2.9, wood, {
      over(c) {
        dot(c, s * 5.4, -2.3, 1.4, alpha('#5a3418', 0.8));
      },
    });
  }
  ball(g, 0, 2.6, 7.2, 6.8, wood, {
    over(c, patch) {
      patch((p) => pathEllipse(p, 0, 5.6, 3.7, 2.9), tone('#e9c898', { dark: '#b8905a' }));
    },
  });
  ring(g, 0, -5, 1.3, COLORS.coin, 0.9, GOLD.line);
  dot(g, -2.9, 1.2, 0.95, '#2a1a16');
  dot(g, 2.9, 1.2, 0.95, '#2a1a16');
  speck(g, -3.2, 0.9, 0.3, 0.9);
  speck(g, 2.6, 0.9, 0.3, 0.9);
  nose(g, 0, 4.4, 1.4);
  stroke(g, [[-1.3, 6.8], [0, 7.4], [1.3, 6.8]], alpha('#2a1a16', 0.8), 0.6);
});

// перо жар-птицы: горит и светится
item('phoenix', (g) => {
  glow(g, 1.4, -1.2, 10, '#ffb04a', 0.32);
  const plume = tone('#ff6a2a', { light: '#ffc45a', dark: '#c8321c', line: '#8a2418', lw: 1.1 });
  blob(g, [[-9, 10, 1], [-6.8, 3.6], [-5.2, -2.6], [-1.6, -7.8], [4, -10.2], [9, -8.8], [10, -4.6], [8.6, -0.6], [6, 0.2, 1], [6.4, 2.6], [3.2, 2.2, 1], [3, 5], [-0.6, 3.8, 1], [-1.6, 7],
    [-4.2, 6, 1], [-5.8, 8.6]], plume, {
    over(c, patch) {
      patch([[-7.4, 7.6], [-3.6, -0.6], [0.6, -5.6], [5.2, -8], [7.8, -5.6], [6, -1.6], [1.6, 0.6], [-2.6, 3.6]], tone('#ffd24a', { light: '#fff6c0', dark: '#ff9a2a' }));
      stroke(c, [[-8.6, 9.6], [-4.6, 3], [0.4, -2.4], [4.8, -5]], alpha('#fff6c0', 0.9), 0.7);
    },
  });
  ball(g, 5, -5.2, 2.5, 2.5, tone('#ff5a2a', { light: '#ffb07a', dark: '#b02818', line: '#8a2418', lw: 0.8 }));
  dot(g, 5, -5.2, 1.2, '#7fe0ff');
  speck(g, 4.6, -5.6, 0.4, 0.9);
  twinkle(g, -4.6, -8, 1.8);
  twinkle(g, 8.6, 6, 1.5);
});

// грибная шляпка: сиреневая, вокруг — ядовитые споры
item('sporecap', (g) => {
  for (const [x, y, r] of [[-8.2, -8, 1.1], [8.2, -8.2, 1.3], [-8.4, 8.6, 1], [8.2, 8.4, 1.2]]) {
    glow(g, x, y, 2.7, COLORS.poison, 0.6);
    ball(g, x, y, r, r, tone('#d9f77a', { light: '#fbffd6', dark: '#8fc23c', line: '#4f8f24', lw: 0.6 }));
  }
  blob(g, [[-2.6, 4.4], [2.6, 4.4], [3.2, 8.4], [1.8, 10], [-1.8, 10], [-3.2, 8.4]], tone('#f1e6d2', { light: '#ffffff', dark: '#c8b698', lw: 1.1 }));
  blob(g, [[-9.6, 3.2], [-8.6, -2.6], [-5, -7.4], [0, -9.2], [5, -7.4], [8.6, -2.6], [9.6, 3.2], [6.6, 5.2], [0, 6], [-6.6, 5.2]], tone('#a05ad8', { light: '#d2a8ff', dark: '#5e2a94', lw: 1.3 }), {
    over(c, patch) {
      patch([[-12, 2.2], [-6, 3.7], [0, 4.2], [6, 3.7], [12, 2.2], [12, 9], [-12, 9]], tone('#ead8ff', { light: '#ffffff', dark: '#b79ad8' }));
      for (const x of [-6.4, -3.2, 0, 3.2, 6.4]) stroke(c, [[x * 0.92, 3.6], [x, 5.8]], alpha('#8a6ab8', 0.6), 0.5);
      for (const [x, y, rx, ry] of [[-4.6, -2.6, 2, 1.5], [1.2, -5.4, 1.8, 1.3], [5, -1, 1.5, 1.1], [-0.4, 0.4, 1.2, 0.9]]) dot(c, x, y, rx, '#f3e6ff', ry);
    },
  });
  speck(g, -5.6, -5.4, 0.8, 0.7);
});

// паучий шёлк: катушка белой нити
item('silk', (g) => {
  g.rotate(-0.2);
  cord(g, [[5.4, 1.6], [8.6, 1], [9.8, 3.4], [8.4, 5.4]], '#f4f6fa', 0.9, '#4f5a6e');
  solid(g, (c) => pathEllipse(c, 0, 7.4, 6.8, 2.4), WOOD);
  blob(g, [[-5.2, -6], [5.2, -6], [6, 0.4], [5.2, 7], [0, 8.2], [-5.2, 7], [-6, 0.4]], tone('#f4f6fa', { light: '#ffffff', dark: '#b4c0d2', line: '#4f5a6e', lw: 1.2 }), {
    over(c) {
      c.strokeStyle = alpha('#7f8aa0', 0.75);
      c.lineWidth = 0.55;
      for (let y = -4.4; y < 8; y += 1.9) {
        c.beginPath();
        c.moveTo(-7, y);
        c.quadraticCurveTo(0, y + 1.9, 7, y - 0.3);
        c.stroke();
      }
    },
  });
  solid(g, (c) => pathEllipse(c, 0, -6.4, 6.8, 2.5), tone('#cf9a5c', { light: '#f2cf96', dark: '#8a5a2c', lw: 1.2 }));
  dot(g, 0, -6.4, 1.7, '#5e3a20', 0.65);
});

// орлиный глаз: белая голова, жёлтый клюв, взгляд из-под брови
item('eagleeye', (g) => {
  blob(g, [[4, -4], [8.4, -3.6], [10.4, -0.8], [10.2, 2.2], [9, 4.6, 1], [8.4, 1.6], [6.2, 1.5], [4, 1.8]], tone('#ffc93c', { light: '#fff0a8', dark: '#d9861c', line: '#7a4a0c', lw: 1.1 }), {
    over(c) {
      stroke(c, [[4.4, 0], [8.6, 0.4], [9.4, 1.6]], alpha('#7a4a0c', 0.8), 0.6);
    },
  });
  blob(g, [[-8.6, 2.6], [-8.4, -3.4], [-5.4, -8], [-0.6, -9.8], [4, -8.4], [6.2, -5.2], [6.4, -1.4], [5.6, 2.4], [3.4, 5.2], [2.6, 9.4, 1], [0.6, 6.6], [-1.6, 10, 1], [-3.4, 6.8], [-5.8, 9.6, 1],
    [-6.8, 6], [-9.8, 7.2, 1]], tone('#fbf6ea', { light: '#ffffff', dark: '#cfc3ac', line: '#5e5040', lw: 1.2 }), {
    over(c) {
      fur(c, [[-4.6, -1], [-2, 2.6], [-5.4, 3.2], [-1.4, -4.6]].map(([x, y]) => [x, y, 1.2, 2.4]), alpha('#b8aa90', 0.8), 0.7);
    },
  });
  dot(g, 2.2, -3, 2.2, '#3a2a1c');
  dot(g, 2.2, -3, 1.65, '#ffd24a');
  dot(g, 2.5, -3, 0.9, '#221613');
  speck(g, 1.7, -3.6, 0.4, 1);
  stroke(g, [[-1.4, -5.8], [2.4, -5.7], [5.6, -4.2]], '#4a3a2a', 1.3);
});

// жадный жёлудь: золотой, с прорезью, как у копилки
item('greedacorn', (g) => {
  g.rotate(0.22);
  capsule(g, 0.2, -8, 0.85, 1.3, -9.7, 0.75, tone('#6e4a28', { lw: 0.9 }));
  blob(g, NUT, tone('#ffc93c', { light: '#fff3b0', dark: '#d98a1c', line: '#7a4a0c', lw: 1.3 }));
  blob(g, NUT_CAP, tone('#a8703a', { light: '#d6a064', dark: '#6a401c', lw: 1.3 }), {
    over(c) {
      hatch(c, alpha('#3a2010', 0.55));
    },
  });
  solid(g, (c) => {
    c.moveTo(-2.9, 3.4);
    c.arc(0, 3.4, 2.9, Math.PI, TAU);
    c.closePath();
    return [-2.9, 0.5, 2.9, 3.4];
  }, tone('#fff0a8', { light: '#ffffff', dark: '#ffc93c', line: '#7a4a0c', lw: 0.9 }));
  stroke(g, [[-3.7, 3.7], [3.7, 3.7]], '#5e3a0c', 1.5);
  twinkle(g, -7.6, -6.6, 2.2);
});

// золотая морковь: за добычу больше очков
item('goldcarrot', (g) => {
  glow(g, 0, 0.4, 10.4, '#ffe58a', 0.3);
  const at = (pts) => turn(pts, -0.5, -0.4, 0.2);
  carrotTop(g, at);
  blob(g, at(CARROT), tone('#ffc93c', { light: '#fff6c0', dark: '#d98a1c', line: '#7a4a0c', lw: 1.3 }), {
    over(c) {
      carrotRidges(c, at, alpha('#a8641a', 0.7));
    },
  });
  const [sx, sy] = at([[-1.4, -3]])[0];
  speck(g, sx, sy, 1, 0.85);
  twinkle(g, 6.8, -6.4, 2.8);
  twinkle(g, -7.4, 5.4, 1.7);
});

// часы-луковица: вражеские выстрелы летят медленнее
item('pocketwatch', (g) => {
  const brass = tone('#d98a4a', { light: '#ffc890', dark: '#8f4f22', line: '#52290e', lw: 1.3 });
  for (const [x, y, a] of [[3.4, -8.6, 0.3], [6.4, -7.6, 0.9], [8.6, -5.2, 1.3]]) {
    for (const [color, w] of [[brass.line, 1.7], [brass.light, 0.8]]) {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(x, y, 1.5, 1, a, 0, TAU);
      g.stroke();
    }
  }
  ring(g, -0.6, -8.4, 1.5, brass.fill, 1.1, brass.line);
  plate(g, -1.9, -7.2, 0.7, -5, 0.6, thin(brass, 1));
  ball(g, -0.6, 2, 7.6, 7.6, brass);
  ball(g, -0.6, 2, 5.7, 5.7, tone('#fff6e2', { light: '#ffffff', dark: '#e2cfa8', line: brass.line, lw: 0.9, rim: 0 }), {
    over(c) {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        stroke(c, [[-0.6 + Math.cos(a) * 4, 2 + Math.sin(a) * 4], [-0.6 + Math.cos(a) * 5, 2 + Math.sin(a) * 5]], '#8f4f22', 0.8);
      }
    },
  });
  stroke(g, [[-0.6, 2], [-3, 0.2]], '#3a2a1c', 1.1);
  stroke(g, [[-0.6, 2], [2, -1.6]], '#3a2a1c', 0.9);
  dot(g, -0.6, 2, 0.9, '#b8243a');
  speck(g, -5.4, -2.8, 0.9, 0.8);
});

// друг-светлячок: тёмная спинка, прозрачные крылья и светящееся брюшко
item('glowbug', (g) => {
  glow(g, -3.6, 4.2, 7, '#e9ff8a', 0.7);
  for (const [x, y, rot] of [[-2.8, -5.4, -0.9], [1.6, -7, -0.35]]) {
    g.fillStyle = 'rgba(235,246,255,0.85)';
    g.strokeStyle = alpha('#4a5a70', 0.8);
    g.lineWidth = 0.7;
    g.beginPath();
    g.ellipse(x, y, 4, 2, rot, 0, TAU);
    g.fill();
    g.stroke();
  }
  cord(g, [[6, -5.4], [7.6, -8.2], [9, -8.4]], '#8a5a34', 0.7, '#3a2414');
  cord(g, [[7, -4], [9.6, -5.2], [10.2, -4]], '#8a5a34', 0.7, '#3a2414');
  ball(g, -3.6, 4, 4.5, 4.1, tone('#e4ff7a', { light: '#ffffff', dark: '#9fd13c', line: '#5a8f24', lw: 1.1, rim: 0 }), {
    over(c) {
      stroke(c, [[-6.4, 1.2], [-3.2, 2.6], [0.4, 2.2]], alpha('#7ab02c', 0.7), 0.6);
      stroke(c, [[-7.6, 4], [-3.8, 5.6], [0.8, 4.8]], alpha('#7ab02c', 0.7), 0.6);
    },
  });
  const shell = tone('#8a5a34', { light: '#c08a54', dark: '#4e2e16', lw: 1.1 });
  ball(g, 1, -0.4, 3.4, 3.2, shell);
  ball(g, 4.8, -3.4, 2.8, 2.7, shell);
  dot(g, 5.6, -3.8, 1.1, '#ffffff');
  dot(g, 5.9, -3.7, 0.55, '#221613');
  speck(g, -5.2, 2.6, 0.9, 0.9);
});

// ---------- дары леса ----------
// Лист-медальон: круглый лист с острым кончиком справа сверху и черешком слева снизу; посередине — окошко цвета
// дара, в нём светлый знак. Знак плоский и простой, как руна: объём у него почти не читается, зато читается форма.

const LEAF = [[9.3, -9.8, 1], [8, -5.6], [8.7, -1], [8, 4.2], [4.8, 8.4], [-0.6, 9.9], [-5.8, 8.2], [-9.2, 4], [-9.8, -1.4], [-7.4, -5.8], [-3, -8.4], [2.4, -8.4], [6.2, -8]];
const LEAF_LOOK = tone('#3f9a50', { light: '#84d46e', dark: '#1f6a40', line: '#12402e', lw: 1.3 });
const STALK = tone('#5a8a3a', { dark: '#2f5a26', line: '#12402e', lw: 1 });
const WIN = [-0.4, 0.5];                 // середина окошка
const WIN_R = 6.9;

/** Краска знака: почти белая, с оттенком дара; край — тёмный тон того же цвета. */
const rune = (accent) => tone(lighten(accent, 0.8), { light: '#ffffff', dark: lighten(accent, 0.25), line: darken(accent, 0.74), lw: 0.9, rim: 0, shade: 0.7 });

/** Дар: accent — цвет окошка и знака; emblem(g, R, accent) рисует знак вокруг нуля (в середине окошка) краской R. */
function gift(id, accent, emblem) {
  centered(`gift.${id}`, 24, (g) => {
    capsule(g, -6.4, 6.6, 1.1, -9.3, 9.5, 0.8, STALK);
    blob(g, LEAF, LEAF_LOOK, {
      over(c) {
        stroke(c, [[-7, 7.2], [9, -9.6]], alpha('#c8f29a', 0.5), 0.8);          // жилка видна у черешка и у кончика
        c.fillStyle = radial(c, WIN[0] - 1.4, WIN[1] - 1.8, 9.4, [[0, darken(accent, 0.3)], [0.6, darken(accent, 0.58)], [1, darken(accent, 0.8)]]);
        c.beginPath();
        c.arc(WIN[0], WIN[1], WIN_R, 0, TAU);
        c.fill();
        glow(c, WIN[0], WIN[1], 5.6, accent, 0.5);
        for (const [color, r, w] of [[alpha(LEAF_LOOK.line, 0.9), WIN_R, 0.9], [alpha(lighten(accent, 0.5), 0.55), WIN_R - 0.8, 0.5]]) {
          c.strokeStyle = color;
          c.lineWidth = w;
          c.beginPath();
          c.arc(WIN[0], WIN[1], r, 0, TAU);
          c.stroke();
        }
      },
    });
    g.translate(WIN[0], WIN[1]);
    emblem(g, rune(accent), accent);
  });
}

// крепость: сердце с ростком
gift('vigor', '#ff4d5e', (g, R) => {
  glyph(g, { lines: [[[0, -1.2], [0, -4.6]]] }, R, 1, 0.8);
  leaf(g, 0, -4.4, -3.4, -6, 2.6, R);
  leaf(g, 0, -4.4, 3.4, -6, 2.6, R);
  blob(g, heart(0, 1.4, 4.7), R);
});

// мудрость: сова — брови-уши, круглые глаза, клюв
gift('wisdom', '#a67cff', (g, R) => {
  glyph(g, { lines: [[[-5.6, -4.6, 1], [-2.6, -3.2], [0, -1.4, 1], [2.6, -3.2], [5.6, -4.6, 1]]] }, R, 1.4, 0.8);
  for (const s of [-1, 1]) {
    ball(g, s * 2.9, 0.6, 2.5, 2.5, R);
    dot(g, s * 2.9, 0.6, 1.15, R.line);
  }
  poly(g, [[-1.1, 2.9], [1.1, 2.9], [0, 5]], R);
});

// лёгкие лапы: ветер
gift('swift', '#6ac8ff', (g, R) => {
  glyph(g, {
    lines: [
      [[-5.4, -2.6], [0.6, -2.6], [3.2, -3.2], [3.6, -5], [2.2, -5.8], [1.2, -4.8]],
      [[-6, 0.6], [2.8, 0.6], [5.4, 1.2], [5.8, 3], [4.4, 3.9], [3.4, 2.9]],
      [[-4.2, 3.8], [-0.4, 3.8], [1, 4.6], [0.6, 5.9], [-0.5, 5.6]],
    ],
  }, R, 1.3, 0.8);
});

// прыть: лапа с крыльями — ещё один рывок
gift('pounce', '#ff9a3c', (g, R) => {
  for (const s of [-1, 1]) blob(g, [[s * 2, 1.4], [s * 3.2, -2], [s * 7, -4.8, 1], [s * 5.6, -1.6], [s * 7.2, -1.2, 1], [s * 5.2, 0.8], [s * 6, 2, 1], [s * 3.4, 2.8]], R);
  solid(g, (c) => pathPaw(c, 0, 1.6, 0.74), thin(R, 0.6), { union: true });
});

// острые когти: три царапины
gift('sharp', '#d5dde8', (g, R) => {
  for (const [x1, y1, x2, y2] of [[-0.6, -5.8, -5.6, 3.4], [2.6, -5, -2.6, 5], [5.6, -3.2, 1, 5.6]]) solid(g, (c) => pathLeaf(c, x1, y1, x2, y2, 2.4, 0.14), R);
});

// густой мех: щит с меховым верхом
gift('thickfur', '#8fb0e0', (g, R) => {
  blob(g, [[-4.8, -3], ...tufts(-4.8, -3, 4.8, -3, 3, 2.6, 0.3), [4.8, -3], [5, 0.8], [3.4, 4.2], [0, 6.2, 1], [-3.4, 4.2], [-5, 0.8]], R, {
    over(c) {
      fur(c, [[-1.8, -0.4, 1.4, 2.4], [1.6, 0.6, 1.4, 2.4], [-0.4, 2.8, 1.4, 2]], alpha(R.line, 0.55), 0.7);
    },
  });
});

// бережливость: капля и стрелка вниз — мана тратится меньше
gift('frugal', '#4aa3ff', (g, R) => {
  blob(g, drop(-1.8, 0.2, 4.7), R);
  glyph(g, { lines: [[[4.2, -3.6], [4.2, 3]], sharp([[2.2, 1.2], [4.2, 3.4], [6.2, 1.2]])] }, R, 1.3, 0.8);
});

// торг: ценник
gift('bargain', '#ffc93c', (g, R) => {
  const at = (pts) => turn(pts, -0.5, 0.2, 0.4);
  blob(g, at([[-6.2, 0], [-2.8, -3.5], [4.6, -3.7], [5.7, -2.8], [5.7, 2.8], [4.6, 3.7], [-2.8, 3.5]]), R);
  const [[hx, hy], [cx, cy]] = at([[-3.3, 0], [1.9, 0]]);
  dot(g, hx, hy, 1, R.line);
  g.strokeStyle = R.line;
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(cx, cy, 1.9, 0, TAU);
  g.stroke();
});

// стая: две головы — большая и маленькая
gift('pack', '#d98a4a', (g, R) => {
  blob(g, turn(EARED, 0.15, 3.4, -1.9, 2.7), R);
  blob(g, turn(EARED, -0.08, -1.6, 1.7, 3.8), R);
  dot(g, -3.1, 1.3, 0.7, R.line);
  dot(g, -0.1, 1.1, 0.7, R.line);
  dot(g, -1.5, 3, 0.6, R.line);
  dot(g, 2.9, -2, 0.5, R.line);
  dot(g, 4.6, -1.7, 0.5, R.line);
});

// страж: щит со звездой
gift('guard', '#ffe58a', (g, R) => {
  blob(g, [[-5.2, -4.6, 1], [0, -5.8], [5.2, -4.6, 1], [5, 0.6], [3.2, 4.2], [0, 6.2, 1], [-3.2, 4.2], [-5, 0.6]], R);
  g.fillStyle = R.line;
  g.beginPath();
  pathStar(g, 0, -0.2, 2.9, 5, 0.48);
  g.fill();
});

// щедрая охота: кролик и плюс
gift('bounty', '#ff9fb5', (g, R) => {
  solid(g, (c) => {
    pathEllipse(c, -2.2, -3, 1.5, 3.4, -0.18);
    pathEllipse(c, 1.4, -3, 1.5, 3.4, 0.18);
    pathEllipse(c, -0.4, 2.4, 3.9, 3.3);
    return [-4.3, -6.4, 3.5, 5.7];
  }, thin(R, 0.6), { union: true });
  dot(g, -1.9, 2, 0.65, R.line);
  dot(g, 1.1, 2, 0.65, R.line);
  glyph(g, { lines: [[[5, -4.6], [5, -1.4]], [[3.4, -3], [6.6, -3]]] }, R, 1.1, 0.7);
});

// везение: клевер
gift('fortune', '#6cd45a', (g, R) => {
  glyph(g, { lines: [[[0.2, 0.4], [0.6, 3.6], [1.8, 6]]] }, R, 1, 0.8);
  for (const a of [2.36, -2.36, 0.79, -0.79]) blob(g, turn(LEAFLET, a, 0, -0.4, 0.66), R);
});

// противоядие: склянка с крестом
gift('antidote', '#4fe0c0', (g, R) => {
  solid(g, (c) => {
    pathRound(c, -2.2, -6.2, 2.2, -4.6, 0.6);
    pathRound(c, -1.3, -5.2, 1.3, -1, 0.3);
    pathEllipse(c, 0, 1.9, 4, 4);
    return [-4, -6.2, 4, 5.9];
  }, thin(R, 0.6), { union: true });
  g.fillStyle = R.line;
  g.fillRect(-0.7, -0.4, 1.4, 4.6);
  g.fillRect(-2.3, 1.2, 4.6, 1.4);
});

// твёрдая лапа: лапа на камне
gift('surefoot', '#c9a56b', (g, R) => {
  poly(g, [[-4.8, 5.8], [-3.4, 3.6], [3.4, 3.6], [4.8, 5.8]], R);
  solid(g, (c) => pathPaw(c, 0, -0.8, 0.74), thin(R, 0.6), { union: true });
});

// пиявка: клыки и капля
gift('leech', '#e8457a', (g, R, accent) => {
  glyph(g, { lines: [[[-5, -4.4], [0, -5.4], [5, -4.4]]] }, R, 1.3, 0.8);
  for (const s of [-1, 1]) poly(g, [[s * 4.4, -4], [s * 1.5, -4.4], [s * 2.6, 1.4]], R);
  blob(g, drop(0, 3, 2.9), tone(mix(accent, '#ffffff', 0.3), { light: '#ffffff', dark: accent, line: R.line, lw: 0.9 }));
});

// следопыт: песочные часы — добыча не уходит дольше
gift('tracker', '#f2c84a', (g, R, accent) => {
  const sand = mix(accent, R.line, 0.3);
  poly(g, [[-3.6, -4.6], [3.6, -4.6], [0.7, 0], [3.6, 4.6], [-3.6, 4.6], [-0.7, 0]], R, {
    over(c) {
      dotless(c, [[-3.4, 4.6], [0, 1.8], [3.4, 4.6]], sand);
      dotless(c, [[-2.2, -2.8], [2.2, -2.8], [0.5, -0.2], [-0.5, -0.2]], sand);
    },
  });
  glyph(g, { lines: [[[-4.4, -5.4], [4.4, -5.4]], [[-4.4, 5.4], [4.4, 5.4]]] }, R, 1.5, 0.8);
});

// искра: молния — мана за добычу
gift('spark', '#8fe8ff', (g, R) => {
  poly(g, turn(BOLT, 0.1, 0, 0, 1.22), R);
  sparkle(g, -4.6, -3.4, 1.7, R.fill, 0.24);
  sparkle(g, 4.6, 3.6, 1.4, R.fill, 0.24);
});

// второе дыхание: стрелка по кругу вокруг сердца
gift('secondwind', '#ff7a3c', (g, R) => {
  glyph(g, { arcs: [[0, 0.2, 5.1, -0.82, 4.08]], shapes: [[[-0.9, -5.5], [-4.2, -5.5], [-1.8, -2.3]]] }, R, 1.4, 0.8);
  blob(g, heart(0, 0.6, 2.5), R);
});

// ---------- значки экрана ----------

const mark = (name, paint) => centered(`ui.${name}`, 16, paint);

// светлая краска кнопок и знаков: тот же кремовый, что у стрелки рывка
const GLYPH = tone('#fff6e2', { light: '#ffffff', dark: '#e9c88e', line: '#2e2230', lw: 1.2, rim: 0 });
// «гнездо» пустого сердца, щита, жизни, заряда: свет и тень поменяны местами — форма вдавлена
const SOCKET = tone('#4a4456', { light: '#38323f', dark: '#6c657a', line: '#241a26', lw: 1.2, rim: 0 });

const SHIELD = [[-6, -5, 1], [0, -6.6], [6, -5, 1], [5.8, 0.8], [3.8, 4.8], [0, 7, 1], [-3.8, 4.8], [-5.8, 0.8]];
const FOX_HEAD = [[-6.4, -7, 1], [-3, -4.4], [0, -3.7], [3, -4.4], [6.4, -7, 1], [6.4, -1.6], [7.1, 1.4, 1], [4.2, 4], [1.6, 6.5], [0, 7], [-1.6, 6.5], [-4.2, 4], [-7.1, 1.4, 1], [-6.4, -1.6]];
const pawPrint = (c) => pathPaw(c, 0, 1.5, 1.2);

mark('heart', (g) => {
  blob(g, heart(0, 0.5, 6.5), RED);
  speck(g, -3, -2.4, 1.3, 0.9);
  speck(g, -4.6, -0.2, 0.55, 0.7);
});
mark('heart.empty', (g) => blob(g, heart(0, 0.5, 6.5), SOCKET));

mark('shield', (g) => {
  blob(g, SHIELD, tone(COLORS.shield, { light: '#eef4fb', dark: '#5f7fa8', line: '#2c3a54', lw: 1.2 }), {
    over(c) {
      dotless(c, [[-8, -8], [0, -8], [0, 8], [-8, 8]], alpha('#ffffff', 0.28));
      stroke(c, [[0, -6.4], [0, 6.8]], alpha('#2c3a54', 0.35), 0.6);
    },
  });
});
mark('shield.empty', (g) => blob(g, SHIELD, SOCKET));

// мана — капля
mark('mana', (g) => {
  blob(g, drop(0, 0.2, 6.9).map((p) => [p[0] * 1.14, p[1], p[2]]), WATER);
  speck(g, -1.9, 1.6, 1.3, 0.9);
  speck(g, -3, 3.6, 0.55, 0.7);
});

// жизнь — голова лисы
mark('life', (g) => {
  blob(g, FOX_HEAD, COAT, {
    over(c, patch) {
      for (const s of [-1, 1]) {
        patch([[s * 8, 0.2], [s * 4.4, 0], [s * 1.7, 2.4], [s * 0.9, 6], [s * 3, 9], [s * 8, 9]], CREAM);
        patch((p) => pathPoly(p, [[s * 7.4, -8], [s * 4.2, -8], [s * 4.5, -5.5], [s * 7.4, -4.8]]), SOCK);
      }
    },
  });
  dot(g, -2.9, -0.9, 1, '#221613');
  dot(g, 2.9, -0.9, 1, '#221613');
  nose(g, 0, 5.6, 1.3);
});
mark('life.empty', (g) => blob(g, FOX_HEAD, SOCKET));

// монета с отпечатком лапы — как та, что лежит на земле
mark('coin', (g) => {
  ball(g, 0, 0, 6.3, 6.3, GOLD, {
    over(c) {
      c.strokeStyle = alpha(COLORS.coinDark, 0.75);
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(0, 0, 4.5, 0, TAU);
      c.stroke();
      c.fillStyle = alpha(COLORS.coinDark, 0.9);
      c.beginPath();
      c.ellipse(0, 1.2, 1.9, 1.5, 0, 0, TAU);
      for (const [x, y] of [[-2, -1.3], [0, -2.2], [2, -1.3]]) {
        c.moveTo(x + 0.85, y);
        c.arc(x, y, 0.85, 0, TAU);
      }
      c.fill();
    },
  });
  speck(g, -2.8, -3, 1.1, 0.9);
});

// очки — кролик: одна добыча — одно очко
mark('score', (g) => {
  const coat = tone('#f4ebdf', { light: '#ffffff', dark: '#cbb9a2', line: '#2e2230', lw: 0.75 });
  solid(g, (c) => {
    pathEllipse(c, -2.4, -2.9, 1.9, 3.6, -0.2);
    pathEllipse(c, 2.4, -2.9, 1.9, 3.6, 0.2);
    pathEllipse(c, 0, 2.4, 5.1, 4);
    return [-5.1, -6.5, 5.1, 6.4];
  }, coat, { union: true });
  for (const s of [-1, 1]) {
    dot(g, s * 2.5, -3.2, 0.7, '#f0a8a0', 2.2);
    dot(g, s * 2.1, 1.8, 0.95, '#221613');
  }
  dot(g, 0, 3.6, 0.8, '#e88a8a', 0.6);
});

// заряд рывка — отпечаток лапы
mark('dash', (g) => solid(g, pawPrint, tone('#fff6e2', { light: '#ffffff', dark: '#f2c98a', line: '#2e2230', lw: 0.75, rim: 0 }), { union: true }));
mark('dash.empty', (g) => solid(g, pawPrint, thin(SOCKET, 0.75), { union: true }));

mark('pause', (g) => {
  for (const x of [-5.2, 1.4]) plate(g, x, -5.6, x + 3.8, 5.6, 1.2, GLYPH);
});

// рюкзак
mark('bag', (g) => {
  const hide = tone('#b9783c', { light: '#e6aa68', dark: '#74441c', line: '#3a2210', lw: 1.2 });
  ring(g, 0, -5.2, 1.5, '#a8703a', 0.9, '#3a2210', Math.PI, TAU);
  blob(g, [[-5.6, -3.2], [-3.6, -5.4], [3.6, -5.4], [5.6, -3.2], [6, 3.6], [4.8, 6.6], [-4.8, 6.6], [-6, 3.6]], hide, {
    over(c, patch) {
      patch([[-8, -8], [8, -8], [8, -1], [3.4, 1], [0, 1.6], [-3.4, 1], [-8, -1]], tone('#d9a05a', { light: '#f6cf92', dark: '#a86e30' }));
      stroke(c, [[-6.4, -1], [-3.4, 0.9], [0, 1.5], [3.4, 0.9], [6.4, -1]], alpha('#3a2210', 0.8), 0.8);
    },
  });
  plate(g, -1.4, 0.2, 1.4, 3.4, 0.5, thin(GOLD, 0.9));
});

// статистика — столбики
mark('stats', (g) => {
  for (const [x, h] of [[-6.4, 4.2], [-1.8, 7.8], [2.8, 11.6]]) plate(g, x, 6 - h, x + 3.6, 6, 0.9, GLYPH);
});

// музыка — две ноты под одним ребром
mark('music', (g) => {
  solid(g, (c) => {
    pathEllipse(c, -3.6, 4.2, 2.6, 2, -0.35);
    pathEllipse(c, 3.6, 2.6, 2.6, 2, -0.35);
    pathPoly(c, [[-1.9, 4.2], [-1.9, -4.6], [5.4, -6.4], [5.4, 2.6], [4, 2.6], [4, -2.2], [-0.5, -1.1], [-0.5, 4.2]]);
    return [-6.4, -6.4, 6.4, 6.4];
  }, thin(GLYPH, 0.75), { union: true });
});

// звуки — динамик и две волны
mark('sound', (g) => {
  glyph(g, { arcs: [[-0.6, 0, 3.2, -0.8, 0.8], [-0.6, 0, 5.8, -0.8, 0.8]] }, GLYPH, 1.4);
  poly(g, [[-7, -2.2], [-4.4, -2.2], [-1, -5.6], [-1, 5.6], [-4.4, 2.2], [-7, 2.2]], GLYPH);
});

// режим левши — ладонь
mark('lefty', (g) => {
  solid(g, (c) => {
    pathRound(c, -5.4, -0.4, 2.6, 6.8, 2.4);
    for (const [x, top] of [[-4.3, -3], [-2.1, -5.2], [0.1, -5.8], [2.3, -4.2]]) pathCapsule(c, x, 1, 1.15, x, top, 1.15);
    pathCapsule(c, 1.8, 3.6, 1.3, 4.9, 0.8, 1.25);
    return [-5.4, -7, 6.2, 6.8];
  }, thin(GLYPH, 0.75), { union: true });
});

// перевернуть экран — телефон и две стрелки вокруг
mark('flip', (g) => {
  glyph(g, {
    arcs: [[0, 0, 5.8, -2.5, -0.75], [0, 0, 5.8, 0.64, 2.39]],
    shapes: [[[5.74, -2.34], [5.63, -5.25], [2.85, -2.65]], [[-5.74, 2.34], [-5.63, 5.25], [-2.85, 2.65]]],
  }, GLYPH, 1.4);
  plate(g, -3.8, -2.2, 3.8, 2.2, 1, GLYPH);
});

// в меню — дверь и стрелка наружу
mark('exit', (g) => {
  glyph(g, { lines: [sharp([[0.6, -5.8], [-5.4, -5.8], [-5.4, 5.8], [0.6, 5.8]]), [[-1.6, 0], [5.6, 0]], sharp([[2.8, -3], [5.8, 0], [2.8, 3]])] }, GLYPH, 1.8);
});

// заново — стрелка по кругу
mark('restart', (g) => {
  glyph(g, { arcs: [[0, 0, 5, 0.05 * Math.PI, 1.78 * Math.PI]], shapes: [[[5.63, -1.03], [5.54, -4.59], [2.16, -1.79]]] }, GLYPH, 1.8);
});

// --- отметки комнат на карте ---

// начало пути — нора
mark('room.start', (g) => {
  blob(g, [[-6.8, 6.2, 1], [-6.6, 1], [-4, -3.6], [0, -5.2], [4, -3.6], [6.6, 1], [6.8, 6.2, 1]], tone('#58b84e', { light: '#a4e67c', dark: '#2f7f3a', line: '#1d4a2a', lw: 1.2 }));
  blob(g, [[-3.8, 6.2, 1], [-3.6, 1.6], [-2, -1], [0, -1.8], [2, -1], [3.6, 1.6], [3.8, 6.2, 1]], tone('#c9a06a', { light: '#f2d6a0', dark: '#8a6238', line: '#3a2210', lw: 1 }));
  blob(g, [[-2.2, 6.2, 1], [-2.1, 2.4], [0, 0.4], [2.1, 2.4], [2.2, 6.2, 1]], tone('#2a1a16', { light: '#3a2620', dark: '#1a100e', line: '#1a100e', lw: 0.6, rim: 0 }));
});

// охота — три следа когтей
mark('room.hunt', (g) => {
  const claw = tone('#ff7a3c', { light: '#ffc27a', dark: '#c8401c', line: '#5e1c10', lw: 1.1 });
  for (const d of [-3.6, 0, 3.6]) solid(g, (c) => pathLeaf(c, 2.6 + d, -5.8, -2.6 + d, 5.8, 3.4, 0.16), claw);
});

// хозяин — медвежий череп
mark('room.boss', (g) => {
  solid(g, (c) => {
    pathEllipse(c, -4.4, -4.2, 2.3, 2.3);
    pathEllipse(c, 4.4, -4.2, 2.3, 2.3);
    pathBlob(c, [[-6, 0.4], [-4.6, -3.6], [0, -5], [4.6, -3.6], [6, 0.4], [4.4, 4.4], [2.4, 6.4], [-2.4, 6.4], [-4.4, 4.4]]);
    return [-6.7, -6.5, 6.7, 6.6];
  }, tone('#f4ebdf', { light: '#ffffff', dark: '#c8b89c', line: '#2e2230', lw: 0.75 }), { union: true });
  for (const s of [-1, 1]) {
    const socket = [[s * 4.7, -1.8], [s * 1.2, -0.1], [s * 1.6, 2], [s * 4.2, 1.5]];
    dotless(g, socket, '#b8243a');
    g.strokeStyle = '#2e2230';
    g.lineWidth = 0.6;
    g.lineJoin = 'round';
    g.stroke();
  }
  dotless(g, [[-1.2, 2.9], [1.2, 2.9], [0, 4.3]], '#2e2230');
  stroke(g, sharp([[-2.2, 5.2], [-1.1, 6], [0, 5.2], [1.1, 6], [2.2, 5.2]]), '#2e2230', 0.6);
});

// сундук
mark('room.treasure', (g) => {
  const wood = tone('#b9783c', { light: '#e6aa68', dark: '#74441c', line: '#3a2210', lw: 1.1 });
  plate(g, -6.2, -0.6, 6.2, 5.8, 0.8, wood);
  blob(g, [[-6.4, 0, 1], [-6.2, -3.4], [-3.6, -5.8], [3.6, -5.8], [6.2, -3.4], [6.4, 0, 1]], wood);
  plate(g, -6.6, -0.9, 6.6, 0.7, 0.4, thin(GOLD, 0.9));
  plate(g, -1.5, -1.4, 1.5, 2.8, 0.6, thin(GOLD, 0.9));
  dot(g, 0, 0.7, 0.7, '#5e3a0c');
});

// лавка — прилавок под полосатым навесом
mark('room.shop', (g) => {
  plate(g, -5, 0.6, 5, 6.4, 0.6, tone('#d9a85a', { light: '#f6d79a', dark: '#a67430', line: '#3a2210', lw: 1.1 }));
  blob(g, [[-6.8, 1, 1], [-5.2, -6.2, 1], [5.2, -6.2, 1], [6.8, 1, 1], [4.5, 2.4], [2.3, 1, 1], [0, 2.4], [-2.3, 1, 1], [-4.5, 2.4]], tone('#fbf2e2', { light: '#ffffff', dark: '#d9c8ac', line: '#3a2210', lw: 1.1 }), {
    over(c, patch) {
      for (const i of [0, 2, 4]) {
        patch((p) => pathPoly(p, [[-5.2 + i * 2.08, -7], [-5.2 + (i + 1) * 2.08, -7], [-6.8 + (i + 1) * 2.72, 3], [-6.8 + i * 2.72, 3]]), tone('#e4473c', { light: '#ff8a78', dark: '#a8242c' }));
      }
    },
  });
});

// жертвенный камень — над плитой сердце
mark('room.altar', (g) => {
  plate(g, -3.4, 1.6, 3.4, 5.6, 0.4, STONE);
  plate(g, -5.2, 4.6, 5.2, 6.8, 0.6, STONE);
  plate(g, -6.2, -0.8, 6.2, 2.2, 0.8, STONE);
  blob(g, heart(0, -4.3, 2.9), thin(RED, 0.9));
  speck(g, -1.3, -5.4, 0.55, 0.9);
});

// колодец желаний
mark('room.well', (g) => {
  const post = tone('#b9783c', { light: '#e6aa68', dark: '#74441c', line: '#3a2210', lw: 0.9 });
  for (const x of [-4.4, 4.4]) plate(g, x - 0.8, -3.6, x + 0.8, 1.8, 0.3, post);
  plate(g, -5.4, 1, 5.4, 6.6, 1, STONE, {
    over(c) {
      stroke(c, [[-6, 4.2], [6, 4.2]], alpha('#2e3540', 0.5), 0.6);
      for (const x of [-2.6, 2.6]) stroke(c, [[x, 4.2], [x, 7]], alpha('#2e3540', 0.5), 0.6);
    },
  });
  solid(g, (c) => pathEllipse(c, 0, 1.2, 5.4, 1.7), STONE);
  solid(g, (c) => pathEllipse(c, 0, 1.3, 3.8, 0.95), tone(COLORS.mana, { light: COLORS.manaLight, dark: COLORS.manaDark, lw: 0.6 }));
  poly(g, [[-6.6, -3], [0, -7], [6.6, -3]], tone('#c8553c', { light: '#f08a6a', dark: '#8a2c20', line: '#3a1410', lw: 1.1 }));
});

// привал — палатка
mark('room.camp', (g) => {
  glyph(g, { lines: [[[-1.5, -6.6], [0.5, -4.4]], [[1.5, -6.6], [-0.5, -4.4]]] }, { line: '#3a2210', fill: '#b9783c' }, 0.8, 0.5);
  poly(g, [[-6.8, 6.2], [0, -5.4], [6.8, 6.2]], tone('#f0a03c', { light: '#ffd08a', dark: '#b8601c', line: '#4a2410', lw: 1.2 }));
  poly(g, [[-2.4, 6.2], [0, 0.6], [2.4, 6.2]], tone('#4a2410', { light: '#6a3a1c', dark: '#2a1408', line: '#2a1408', lw: 0.7, rim: 0 }));
});

// кузница — наковальня и искра
mark('room.forge', (g) => {
  blob(g, [[-7, -1.4, 1], [-3, -2.2, 1], [6.2, -2.2, 1], [6.2, 0.2, 1], [2.6, 1.2], [2.4, 3.4, 1], [5, 4.8, 1], [5, 6.8, 1], [-4.4, 6.8, 1], [-4.4, 4.8, 1], [-1.8, 3.4, 1], [-1.6, 1.2], [-3.6, 0.4]],
    tone('#7f8896', { light: '#c6ced8', dark: '#474f5c', line: '#1e222a', lw: 1.1 }));
  twinkle(g, 3.2, -5.2, 2.1, '#e0621c', '#fff0a8');
});

// родник — струя и брызги над лужицей
mark('room.spring', (g) => {
  const water = tone('#5ab8ff', { light: '#e2f4ff', dark: '#1f7fd8', line: '#123f7a', lw: 1 });
  solid(g, (c) => pathEllipse(c, 0, 5, 6.2, 1.9), water);
  blob(g, drop(-4.2, 0.8, 2.9, -0.8), water);
  blob(g, drop(4.2, 0.8, 2.9, 0.8), water);
  blob(g, drop(0, -1.6, 5), water);
  speck(g, -1.1, -0.4, 0.9, 0.9);
});

// тотем испытания — столб с лицом и крыльями
mark('room.totem', (g) => {
  blob(g, [[-7, -4.4, 1], [-2, -4.8], [2, -4.8], [7, -4.4, 1], [6.2, -1.6], [2, -2], [-2, -2], [-6.2, -1.6]], tone('#e4473c', { light: '#ff8a78', dark: '#a8242c', line: '#4a1014', lw: 1 }));
  plate(g, -2.9, -6.8, 2.9, 6.8, 1.2, tone('#b9783c', { light: '#e6aa68', dark: '#74441c', line: '#3a2210', lw: 1.1 }), {
    over(c) {
      c.fillStyle = '#ffc93c';
      c.fillRect(-3, 1.6, 6, 1.4);
      c.fillStyle = '#3fb0a0';
      c.fillRect(-3, 4.2, 6, 1.3);
    },
  });
  for (const s of [-1, 1]) {
    dot(g, s * 1.3, -3.8, 1.05, '#ffffff');
    dot(g, s * 1.3, -3.7, 0.5, '#221613');
  }
  dotless(g, [[-0.9, -2], [0.9, -2], [0, 0.2]], '#ffc93c');
});

// пень-напёрсточник — игральная кость
mark('room.gamble', (g) => {
  g.rotate(0.2);
  plate(g, -5.4, -5.4, 5.4, 5.4, 1.6, tone('#fbf6ea', { light: '#ffffff', dark: '#cdbfa6', line: '#2e2230', lw: 1.2 }));
  for (const d of [-2.7, 0, 2.7]) dot(g, d, d, 1.15, '#d8453a');
});

// ворон-меняла — голова ворона; светлая кайма не даёт ему пропасть на тёмной карте
mark('room.raven', (g) => {
  const head = [[-5.8, 2.6], [-5.4, -2.4], [-2, -5.8], [2, -5.2], [4.2, -2.2], [4, 1.4], [2.2, 6.6, 1], [0.6, 4.2], [-1.4, 7, 1], [-2.8, 4.4], [-5.4, 6.6, 1]];
  const beak = [[2.6, -3], [7.2, 0], [3, 1.6]];
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.beginPath();
  pathBlob(g, head);
  pathPoly(g, beak);
  g.stroke();
  poly(g, beak, tone('#9aa3b4', { light: '#dfe5ea', dark: '#5f6975', line: '#14151f', lw: 1 }));
  blob(g, head, tone('#4a4f7c', { light: '#8a90c0', dark: '#25283f', line: '#14151f', lw: 1.1, rim: 0.8 }));
  dot(g, 1.4, -2, 1.5, '#ffd24a');
  dot(g, 1.7, -2, 0.75, '#14151f');
});

// неизвестная комната — вопросительный знак
mark('room.unknown', (g) => {
  glyph(g, { arcs: [[0, -2.4, 3.3, Math.PI, TAU + 0.9]], lines: [[[2.05, 0.2], [0.2, 1.7], [0.1, 2.8]]], dots: [[0.1, 5.6, 1.15]] }, GLYPH, 2.1);
});
