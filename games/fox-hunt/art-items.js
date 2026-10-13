// Вещи «Лисьей охоты»: значки оружия, брони и зелий (item.<id>) и то, что стоит в особых комнатах, — жертвенный
// камень, колодец желаний, кузница, родник, тотем испытания, пень напёрсточника и палатка привала (thing.<вид>).
// Без DOM: всё рисуется в переданный контекст Canvas в единицах мира, свет — слева сверху.
//
// Значок — квадрат 24×24 с привязкой посередине: один предмет с тем же объёмом, что и всё в игре, чуть наклонён,
// без подложки (плашку цвета редкости рисует интерфейс). Один и тот же значок лежит на земле как добыча и стоит
// в окнах рюкзака, поэтому:
//   • всё твёрдое помещается в сам квадрат — в окне поля картинки обрезаются; за него выходит только сияние;
//   • у каждой вещи свой силуэт и один главный цвет — в рюкзаке их различают с первого взгляда, не читая;
//   • форму удобно задать «прямо», а положить наклонно — turn(): свет при этом остаётся слева сверху.
//
// Предметы комнат — в красках леса, как сундук и пни из art-tiles.js: они общие для всех мест. Привязка — низ
// посередине, чуть выше нижнего края рамки (основание выступает вперёд); тени на земле — забота рендера.

import { defineSprite } from './art.js';
import {
  TAU, COLORS, INK, LIGHT, clamp, rand, alpha, mix, lighten, darken, outline, tone, radial, linear, glow, speck, sparkle,
  solid, blob, ball, capsule, leaf, stroke, within, pathBlob, pathStar, pathEllipse, pathPoly, pathCapsule, pathLeaf, tufts,
} from './art-kit.js';

/** Значки этого файла: id вещей по видам (ключ картинки — item.<id>). */
export const ICONS = {
  weapons: ['pinecone', 'sling', 'thorns', 'acorngun', 'claws', 'club', 'bow', 'boomerang', 'icicle', 'fireacorn', 'shroombomb', 'bouncenut', 'wasps',
    'venom', 'lightning', 'firefly', 'leaves', 'frostbreath', 'thornring', 'beartrap', 'spores', 'starstaff', 'stormroar', 'meteor', 'crescent', 'sunray'],
  armor: ['vest', 'bark', 'thornmail', 'fur', 'shadowcloak', 'shell', 'feathers', 'silkmail', 'moonrobe'],
  potions: ['heal', 'manapot', 'haste', 'rage', 'stone', 'mapscroll'],
};

/** Предметы особых комнат (ключ картинки — thing.<вид>). */
export const PLACE_THINGS = ['altar', 'well', 'forge', 'spring', 'totem', 'gamble', 'tent'];

// ---------- общее ----------

/** Значок вещи: рамка 24×24, привязка — середина; paint(g) рисует вокруг нуля. */
function icon(id, paint) {
  defineSprite(`item.${id}`, {
    w: 24, h: 24, ox: 12, oy: 12, pad: 1,
    paint(g) {
      g.translate(12, 12);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      paint(g);
    },
  });
}

/**
 * Предмет комнаты: рамка w×h, привязка — низ посередине, на below выше нижнего края (туда выступает основание).
 * paint(g) рисует от точки привязки: x — вправо от середины, y — вниз (всё высокое — с минусом).
 */
function thing(kind, w, h, below, paint) {
  defineSprite(`thing.${kind}`, {
    w, h, ox: w / 2, oy: h - below, pad: 2,
    paint(g) {
      g.translate(w / 2, h - below);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      paint(g);
    },
  });
}

/** Узлы, повёрнутые на угол a вокруг нуля, растянутые в s раз и сдвинутые в (x, y); острые узлы остаются острыми. */
function turn(pts, a = 0, x = 0, y = 0, s = 1) {
  const c = Math.cos(a) * s;
  const n = Math.sin(a) * s;
  return pts.map((p) => {
    const q = [x + p[0] * c - p[1] * n, y + p[0] * n + p[1] * c];
    if (p[2]) q.push(1);
    return q;
  });
}

/** Ломаная с острыми углами (у kit.stroke линия гладкая). */
function poly(g, pts, color, lw) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

/** Линия с тёмным краем: верёвка, тетива, резинка, ус. smooth = false — ломаная. */
function cord(g, pts, color, lw, line = outline(color), smooth = true) {
  const draw = smooth ? stroke : poly;
  draw(g, pts, line, lw + 1);
  draw(g, pts, color, lw);
}

const TWINE = '#f3e2b8';
const TWINE_LINE = '#7a5a34';

/** Витки обмотки поперёк палки: n полосок вокруг точки (x, y); ang — куда идёт палка, half — полуширина витка. */
function wraps(g, x, y, ang, n, half, color = TWINE, line = TWINE_LINE, gap = 1.25, lw = 0.9) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (const pass of [0, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * gap;
      const px = x + dx * t;
      const py = y + dy * t;
      poly(g, [[px + dy * half, py - dx * half], [px - dy * half, py + dx * half]], pass ? color : line, pass ? lw : lw + 0.9);
    }
  }
}

/** Рог, коготь, шип: от основания (x, y) по углу ang, длиной len и шириной w у основания; bend — загиб кончика вбок. */
function horn(g, x, y, ang, len, w, look, bend = 0, o) {
  blob(g, turn([[-w * 0.22, 0], [0, -w / 2], [len * 0.5, bend * 0.25 - w * 0.33], [len, bend, 1], [len * 0.5, bend * 0.25 + w * 0.33], [0, w / 2]], ang, x, y), look, o);
}

/** Клуб из кругов внахлёст: lobes — [[x, y, r], …]. */
function cloud(g, lobes, look) {
  solid(g, (c) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y, r] of lobes) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, TAU);
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
    return [x0, y0, x1, y1];
  }, look, { union: true });
}

/** Кольцо: круг радиуса R с дырой радиуса r. */
function pathRing(g, cx, cy, R, r) {
  g.moveTo(cx + R, cy);
  g.arc(cx, cy, R, 0, TAU);
  g.closePath();
  g.moveTo(cx + r, cy);
  g.arc(cx, cy, r, TAU, 0, true);
  g.closePath();
  return [cx - R, cy - R, cx + R, cy + R];
}

/** Узлы месяца: круг (cx, cy, R) без круга радиуса r, сдвинутого на (ox, oy); рога — первый узел и узел n. */
function moonPts(cx, cy, R, ox, oy, r, n = 12) {
  const d = Math.hypot(ox, oy);
  const base = Math.atan2(oy, ox);
  const a = (R * R - r * r + d * d) / (2 * d);
  const phi = Math.acos(clamp(a / R, -1, 1));
  const psi = Math.acos(clamp((a - d) / r, -1, 1));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = base + phi + ((TAU - 2 * phi) * i) / n;
    pts.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R]);
  }
  // обратно — по внутреннему кругу
  for (let i = 1; i < n; i++) {
    const t = base - psi + TAU - ((TAU - 2 * psi) * i) / n;
    pts.push([cx + ox + Math.cos(t) * r, cy + oy + Math.sin(t) * r]);
  }
  return pts;
}

/** Блёстка, видная и на тёмном, и на светлом: тёмный край под светлой звёздочкой. */
function twinkle(g, x, y, r, color = '#fff7a8', edge = '#b8791c') {
  sparkle(g, x, y, r + 0.7, alpha(edge, 0.85), 0.38);
  sparkle(g, x, y, r, color, 0.24);
}

/** Пузырьки в зелье и в воде: list — [[x, y, r], …]. */
function bubbles(g, list, color) {
  g.strokeStyle = alpha(color, 0.9);
  g.lineWidth = 0.5;
  for (const [x, y, r] of list) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
  }
}

/** След лапы: подушечка и четыре пальца; s — размер (1 — около 7,5 в ширину). */
function pawMark(g, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y + 1.3 * s, 2.5 * s, 2 * s, 0, 0, TAU);
  for (const [dx, dy] of [[-2.7, -0.9], [-0.95, -2.3], [0.95, -2.3], [2.7, -0.9]]) {
    g.moveTo(x + (dx + 1.05) * s, y + dy * s);
    g.arc(x + dx * s, y + dy * s, 1.05 * s, 0, TAU);
  }
  g.fill();
}

// ---------- краски значков ----------

const T = (fill, o) => tone(fill, { lw: 1.1, ...o });

const WOOD = T('#a8703c', { light: '#dba569', dark: '#6e4322' });
const WOOD_DARK = T('#7a4a28', { light: '#a8743c', dark: '#4a2a16' });
const LEATHER = T('#b0703c', { light: '#dea268', dark: '#74421e' });
const LEATHER_DARK = T('#74462a', { light: '#a06c44', dark: '#422414' });
const STEEL = T('#b4bec9', { light: '#f4f7fa', dark: '#66717f' });
const STEEL_FAR = T('#8e99a6', { light: '#c6ced6', dark: '#56606e' });
const IRON = T('#6f7783', { light: '#aab3bd', dark: '#3f4752' });
const BONE = T('#f3ecdc', { light: '#ffffff', dark: '#c9b890', line: '#6a5238' });
const GOLD = T(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark });
const GREEN = T('#58b84e', { light: '#9ee27a', dark: '#2f7f3a' });
const GREEN_DARK = T('#3f8f44', { light: '#7fcc6a', dark: '#22602e', lw: 0.9 });
const RED = T('#e4473c', { light: '#ff8e7a', dark: '#a3212c' });
const ICE = T(COLORS.ice, { light: '#ffffff', dark: '#5fb4e2', line: '#3b82b8' });
const THORN = T('#b8744a', { light: '#f6ead0', dark: '#6a3424', lw: 0.9 });
const NUT = T('#d9a85a', { light: '#f6d79a', dark: '#a8742c', lw: 1 });
const NUT_CAP = T('#7a4a28', { light: '#a8743c', dark: '#4a2a16', lw: 1 });
const STAR = T('#ffd24a', { light: '#fff3b0', dark: '#e09a1c', line: '#8a5a12' });
const VEIN = '#2f7f3a';

// ---------- оружие: обычное ----------

// шишкомёт: шишка, примотанная бечёвкой к ветке-рогульке
icon('pinecone', (g) => {
  const A = -0.72;                                                // куда смотрит шишка
  capsule(g, -6, 5, 1.5, -3.8, 9.6, 1.3, WOOD_DARK);              // рукоять
  capsule(g, -9.6, 8, 1.4, -1.4, 0.9, 1.8, WOOD);                 // ложе
  blob(g, turn([[-6.8, 0], [-5.4, -3.9], [-0.8, -4.8], [4.4, -2.9], [7.6, 0, 1], [4.4, 2.9], [-0.8, 4.8], [-5.4, 3.9]], A, 3.3, -3.3),
    T('#9a6a3c', { light: '#cf9a5c', dark: '#5e3a20' }), {
      over(c) {
        c.save();
        c.translate(3.3, -3.3);
        c.rotate(A);
        // чешуйки — косая клетка, на каждой светлая точка
        c.strokeStyle = alpha('#4a2a16', 0.75);
        c.lineWidth = 0.6;
        c.beginPath();
        for (let x = -17; x < 9; x += 3.2) {
          c.moveTo(x, -6);
          c.lineTo(x + 9, 6);
          c.moveTo(x + 9, -6);
          c.lineTo(x, 6);
        }
        c.stroke();
        c.fillStyle = alpha('#f6d79a', 0.6);
        for (const [x, y] of [[-6.1, -2.6], [-2.9, -2.6], [0.3, -2.6], [3.5, -2.4], [-4.5, -0.5], [-1.3, -0.5], [1.9, -0.5], [5.1, -0.4], [-2.9, 1.7], [0.3, 1.7]]) {
          c.beginPath();
          c.arc(x, y, 0.6, 0, TAU);
          c.fill();
        }
        c.restore();
      },
    });
  wraps(g, -2.7, 2, A, 3, 2.5);
  cord(g, [[-2.4, 3.6], [-1, 5], [-1.5, 6.8]], TWINE, 0.7, TWINE_LINE);
});

// рогатка: рогулька, красная резинка и кожанка с камешком
icon('sling', (g) => {
  g.rotate(0.2);
  solid(g, (c) => {
    pathCapsule(c, 0, 7.6, 1.9, 0, 1.6, 2.1);
    pathCapsule(c, 0, 1.6, 2.1, -6.2, -7.8, 1.5);
    pathCapsule(c, 0, 1.6, 2.1, 6.2, -7.8, 1.5);
    return [-7.7, -9.3, 7.7, 9.5];
  }, WOOD, {
    union: true,
    over(c, patch) {
      // рукоять обмотана кожей
      patch((p) => pathPoly(p, [[-3, 4.4], [3, 4.4], [3, 11], [-3, 11]]), LEATHER_DARK);
      c.strokeStyle = alpha('#2f1a0e', 0.6);
      c.lineWidth = 0.6;
      for (const y of [5.8, 7.3, 8.8]) {
        c.beginPath();
        c.moveTo(-2.4, y - 0.5);
        c.lineTo(2.4, y + 0.5);
        c.stroke();
      }
    },
  });
  ball(g, 0, -3.6, 1.6, 1.5, T('#9aa3ad', { light: '#dfe5ea', dark: '#5f6975', lw: 0.8 }));
  cord(g, [[-6.1, -7.4], [-3.4, -3.8], [0, -2.4]], '#e4473c', 1.3, '#6a1a20');
  cord(g, [[6.1, -7.4], [3.4, -3.8], [0, -2.4]], '#e4473c', 1.3, '#6a1a20');
  ball(g, 0, -2.3, 2.5, 1.6, T('#c98a52', { light: '#eebd88', dark: '#84522a', lw: 0.9 }));
  wraps(g, -5.5, -6.6, Math.atan2(-9.4, -6.2), 2, 1.8);
  wraps(g, 5.5, -6.6, Math.atan2(-9.4, 6.2), 2, 1.8);
});

// колючкомёт: зелёная трубка-тростинка, из дула торчат шипы
icon('thorns', (g) => {
  const S = [-8, 7.2];
  const M = [4, -3.6];
  const A = Math.atan2(M[1] - S[1], M[0] - S[0]);
  const len = Math.hypot(M[0] - S[0], M[1] - S[1]);
  leaf(g, -4.6, 2.6, -8.8, -2, 3.6, GREEN, -0.12, VEIN);
  capsule(g, S[0], S[1], 2, M[0], M[1], 2.1, T('#7cb84a', { light: '#c8ee8e', dark: '#44742a' }), {
    over(c) {
      c.save();
      c.translate(S[0], S[1]);
      c.rotate(A);
      // блик вдоль трубки и её колена
      c.strokeStyle = alpha('#f0ffc8', 0.75);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(0.4, -0.9);
      c.lineTo(len - 1.4, -0.9);
      c.stroke();
      c.strokeStyle = alpha('#2f5a1c', 0.85);
      c.lineWidth = 0.9;
      for (const x of [1.2, len * 0.36, len * 0.68]) {
        c.beginPath();
        c.moveTo(x, -3);
        c.lineTo(x, 3);
        c.stroke();
      }
      c.restore();
    },
  });
  const bx = M[0] + Math.cos(A) * 0.8;
  const by = M[1] + Math.sin(A) * 0.8;
  g.fillStyle = '#22361a';
  g.beginPath();
  g.ellipse(bx, by, 1, 1.9, A, 0, TAU);
  g.fill();
  for (const [da, l] of [[-0.55, 5.6], [0.55, 5.6], [0, 7]]) horn(g, bx, by, A + da, l, 2.3, THORN);
});

// жёлудь: носиком по углу ang, s — размер (1 — около 11 в длину)
function acorn(g, x, y, ang, s) {
  const at = (pts) => turn(pts, ang, x, y, s);
  const [s0, s1, mid] = at([[-5.7, 0], [-4.4, 0], [1.6, 0]]);
  capsule(g, s0[0], s0[1], 0.5 * s, s1[0], s1[1], 0.5 * s, tone('#5a3a20', { lw: 0.6, flat: true }));
  blob(g, at([[-2.4, -3], [1.6, -2.8], [4.2, -1.2], [5.4, 0, 1], [4.2, 1.2], [1.6, 2.8], [-2.4, 3]]), NUT);
  blob(g, at([[-4.6, 0], [-4, -2.8], [-1.8, -3.5], [-1, 0], [-1.8, 3.5], [-4, 2.8]]), NUT_CAP, {
    over(c) {
      // шляпка в клеточку
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.scale(s, s);
      c.strokeStyle = alpha('#2f1a0c', 0.7);
      c.lineWidth = 0.5;
      for (const v of [-1.7, 0, 1.7]) {
        c.beginPath();
        c.moveTo(-4.6, v);
        c.lineTo(-1.2, v + 0.3);
        c.stroke();
      }
      for (const u of [-3.5, -2.3]) {
        c.beginPath();
        c.moveTo(u, -3.4);
        c.lineTo(u + 0.2, 3.4);
        c.stroke();
      }
      c.restore();
    },
  });
  speck(g, mid[0] - 0.9 * s, mid[1] - 1.1 * s, 0.75 * s, 0.8);
}

// желудёвая дробь: три жёлудя летят клином
icon('acorngun', (g) => {
  const A = -0.52;
  acorn(g, -5.2, -2.6, A, 0.84);
  acorn(g, -0.4, 5.2, A, 0.84);
  acorn(g, 3.6, -2.8, A, 1.02);
});

// когти: три костяных когтя на кожаной манжете
icon('claws', (g) => {
  for (const [x, y, a, len] of [[-7.5, 3.7, -1.35, 13.4], [-5.6, 5.6, -1, 14.8], [-3.7, 7.5, -0.62, 12.8]]) horn(g, x, y, a, len, 4.2, BONE, 3.2);
  capsule(g, -8.4, 2.8, 2.1, -2.8, 8.4, 2.1, LEATHER, {
    over(c) {
      c.strokeStyle = alpha(TWINE, 0.9);
      c.lineWidth = 0.6;
      c.setLineDash([1.1, 1.3]);
      c.beginPath();
      c.moveTo(-8.6, 4.2);
      c.lineTo(-4.2, 8.6);
      c.stroke();
      c.setLineDash([]);
    },
  });
});

// дубина-коряга: узловатая, с сучком и листком
icon('club', (g) => {
  const A = -0.8;
  const at = (pts) => turn(pts, A, -0.9, 0.9, 1.08);
  const [k0, k1] = at([[5, 4.2], [6.2, 6.8]]);
  capsule(g, k0[0], k0[1], 1.1, k1[0], k1[1], 0.8, WOOD_DARK);
  leaf(g, k1[0], k1[1], 6.4, 6.6, 3.6, GREEN, -0.12, VEIN);
  blob(g, at([[-10.2, 0], [-9, -1.5], [-3, -1.9], [1, -3.2], [3.6, -5.4], [7.6, -5.6], [10.4, -2.4], [10.2, 2.2], [7.6, 5.2], [3.4, 4.8], [0, 2.8], [-4, 1.9], [-9, 1.6]]),
    T('#9a6a3c', { light: '#d6a268', dark: '#5e3a20' }), {
      over(c) {
        c.save();
        c.translate(-0.9, 0.9);
        c.rotate(A);
        c.scale(1.08, 1.08);
        // сучок-глазок и трещины
        c.strokeStyle = alpha('#3a2010', 0.8);
        c.lineWidth = 0.7;
        c.beginPath();
        c.ellipse(6.4, -0.4, 2, 1.6, 0, 0, TAU);
        c.stroke();
        c.fillStyle = alpha('#3a2010', 0.8);
        c.beginPath();
        c.arc(6.4, -0.4, 0.7, 0, TAU);
        c.fill();
        stroke(c, [[1.4, -1.3], [3.4, -2.6], [4.8, -4.4]], alpha('#3a2010', 0.7), 0.7);
        stroke(c, [[8.8, 2], [7.4, 3.6]], alpha('#3a2010', 0.7), 0.7);
        stroke(c, [[-2, 0.9], [1.6, 1.4]], alpha('#3a2010', 0.6), 0.6);
        c.restore();
      },
    });
  const [w] = at([[-7.2, 0]]);
  wraps(g, w[0], w[1], A, 3, 2.2, '#5e3c22', '#2a180e', 1.3, 1);
});

// ---------- оружие: редкое ----------

// лук охотника: стрела на тетиве
icon('bow', (g) => {
  const at = (pts) => turn(pts, -Math.PI / 4, -2.9, 2.9);
  const [s1, s2] = at([[0, -9.4], [0, 9.4]]);
  cord(g, [s1, s2], '#f3ecdc', 0.6, '#4a3a2c', false);
  blob(g, at([[0, -9.8, 1], [3, -6.7], [5.9, -3.3], [6.9, 0], [5.9, 3.3], [3, 6.7], [0, 9.8, 1], [1.5, 5.4], [3.7, 2.7], [4.3, 0], [3.7, -2.7], [1.5, -5.4]]),
    T('#b9783c', { light: '#eab478', dark: '#754520' }), {
      over(c, patch) {
        patch(at([[3.2, -2.1], [8, -2.1], [8, 2.1], [3.2, 2.1]]), LEATHER_DARK);
      },
    });
  const [a0, a1] = at([[0.4, 0], [11.6, 0]]);
  capsule(g, a0[0], a0[1], 0.7, a1[0], a1[1], 0.7, T('#e9cf9c', { light: '#fff6dc', dark: '#a8844a', lw: 0.8 }));
  for (const s of [-1, 1]) solid(g, (c) => pathPoly(c, at([[0.2, 0], [-0.9, s * 2.5], [2.4, s * 2.5], [4, 0]])), { ...RED, lw: 0.8 });
  solid(g, (c) => pathPoly(c, at([[15, 0], [10.4, -2.6], [11.5, 0], [10.4, 2.6]])), { ...STEEL, lw: 0.9 });
});

// бумеранг-рогач: уголок с отростками, как рог
icon('boomerang', (g) => {
  blob(g, [[-9.4, -4.8], [-6.2, -6.6], [-4.6, -9.8, 1], [-2.6, -7.6], [2, -8.2], [6.2, -7.6], [8.4, -4.6], [8.4, -0.4], [10.2, 2.4, 1], [8.2, 3], [7.8, 7], [6, 9.8],
    [3.8, 8.6], [4.2, 3.4], [3.6, -1.6], [1.4, -3.8], [-3, -3.6], [-8.6, -1.4], [-10, -2.8]], T('#d9a85a', { light: '#f8dca0', dark: '#a06a2c' }), {
    over(c) {
      // красные полосы на концах
      c.strokeStyle = '#d8453a';
      c.lineWidth = 1.4;
      for (const [x1, y1, x2, y2] of [[-7.8, -7.6, -6.6, -0.8], [-5.4, -8.6, -4.2, -1.8], [2.6, 5.4, 9.4, 4.4], [2.6, 7.6, 9.2, 6.6]]) {
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }
      // годовые кольца на сгибе
      stroke(c, [[2.6, -6.6], [5.6, -5], [6.6, -2]], alpha('#8a5a24', 0.6), 0.7);
    },
  });
});

// сосулька: большая и малая под снежной шапкой
icon('icicle', (g) => {
  const at = (pts) => turn(pts, 0.32, 0.6, 0.2, 0.95);
  glow(g, 0, 0, 10.6, COLORS.ice, 0.3);
  blob(g, at([[2.6, -8.8], [6.6, -9], [6.2, -4.6], [5.2, 1.4, 1], [3.6, -3.6]]), T('#7fcff2', { light: '#d6f4ff', dark: '#4a9fd4', line: '#3b82b8', lw: 0.9 }));
  blob(g, at([[-4.8, -9.4], [0, -10.2], [4.8, -9.4], [4.2, -4.8], [2.5, 1], [1.3, 6], [0.3, 10.8, 1], [-1.3, 5], [-2.8, 0], [-4.4, -5]]), ICE, {
    over(c, patch) {
      // светлая грань слева
      patch(at([[-6, -11], [-1.4, -11], [-0.8, -4], [-0.1, 4], [0.3, 11], [-6, 11]]), T('#d8f5ff', { light: '#ffffff', dark: '#a6dcf6' }));
      const [p0, p1] = at([[-2.9, -6.6], [-1.7, 0.8]]);
      stroke(c, [p0, p1], 'rgba(255,255,255,0.95)', 0.8);
    },
  });
  blob(g, at([[-5.6, -9.6], [-3, -10.8], [0.2, -11.2], [3.6, -10.8], [7.4, -9.6], [7, -7.9], [5, -8.5], [3.4, -7.3], [1.4, -8.7], [-0.8, -7.3], [-2.8, -8.7], [-4.6, -7.7]]),
    T('#ffffff', { light: '#ffffff', dark: '#c2d2e4', line: '#5f84b4', lw: 0.9 }));
  twinkle(g, -7.2, -3.4, 2, '#ffffff', '#3b82b8');
});

// огненный жёлудь: жёлудь в пламени
icon('fireacorn', (g) => {
  const flame = [[-7, 2.4], [-7.4, -2.4], [-5, -6], [-3.8, -10.2, 1], [-1.6, -6.6], [0.8, -11, 1], [2.6, -7.2], [5.4, -9, 1], [6.4, -4.2], [7.4, 0.4], [6.2, 4.6], [0, 7], [-5.6, 5.4]];
  glow(g, 0, -1, 10.8, COLORS.fire, 0.4);
  blob(g, flame, T(COLORS.fire, { light: '#ffb04a', dark: '#e2491c', line: '#b8361a', rim: 0 }), {
    over(c) {
      // жёлтая сердцевина — то же пламя, только меньше
      c.save();
      c.translate(0, 1.8);
      c.scale(0.66, 0.62);
      c.fillStyle = COLORS.fireLight;
      c.beginPath();
      pathBlob(c, flame);
      c.fill();
      c.restore();
    },
  });
  acorn(g, 0.2, 2.9, 1.25, 1.2);
});

// гриб-бомба: мухомор с горящим фитилём
icon('shroombomb', (g) => {
  const at = (pts) => turn(pts, 0.22, -0.4, 1, 0.94);
  blob(g, at([[-3.6, 2.2], [3.6, 2.2], [4.2, 6.6], [3, 9.4], [0, 10], [-3, 9.4], [-4.2, 6.6]]), T('#f6ead0', { light: '#ffffff', dark: '#cdb88c', line: '#6a5238' }));
  blob(g, at([[-8.6, 1.4], [-7.8, -3.6], [-4.2, -7.4], [0.4, -8.6], [4.8, -7.4], [8.2, -3.4], [8.8, 1.6], [5, 3.2], [0, 3.8], [-5, 3.2]]), RED, {
    over(c) {
      c.fillStyle = '#fff6e6';
      for (const [x, y, r] of [[-4.2, -3.2, 1.9], [1.4, -5.6, 1.5], [5, -1.6, 1.7], [-0.4, 0.2, 1.4], [-7.4, 0.4, 1.2]]) {
        const [p] = at([[x, y]]);
        c.beginPath();
        c.ellipse(p[0], p[1], r, r * 0.86, 0.22, 0, TAU);
        c.fill();
      }
    },
  });
  const fuse = at([[0.6, -8.4], [1.4, -10], [3.6, -10.2]]);
  cord(g, fuse, TWINE, 0.8, TWINE_LINE);
  glow(g, fuse[2][0], fuse[2][1], 3.4, COLORS.fire, 0.7);
  twinkle(g, fuse[2][0], fuse[2][1], 2.2, '#fff6c0', '#d9601c');
});

// орех-попрыгун: грецкий орех на усике-пружинке
icon('bouncenut', (g) => {
  g.rotate(0.14);
  cord(g, [[2.8, 2.4], [-3.6, 3.7], [3.2, 5.4], [-3.4, 6.7], [2.6, 8.2], [-1.6, 9.4]], '#86cc5e', 1.3, '#2c6a2e', false);
  ball(g, 0.6, -3.7, 6.8, 6.4, T('#b9783c', { light: '#e9b678', dark: '#754520' }), {
    over(c) {
      // шов скорлупы и морщинки
      stroke(c, [[0.2, -10.4], [1.7, -3.7], [0.4, 3]], alpha('#4a2a12', 0.8), 0.9);
      stroke(c, [[-0.9, -10], [0.5, -3.7], [-0.8, 2.6]], alpha('#f6d7a0', 0.6), 0.7);
      for (const p of [[[-4.4, -6], [-2.6, -5.2], [-2.4, -3.2]], [[-4.6, -1.6], [-3, -0.4], [-1.6, -1]], [[3.4, -7], [4.6, -5], [4, -3]], [[3.2, -1.4], [4.6, -0.4], [5.6, -1.6]]]) {
        stroke(c, p, alpha('#5e3a1c', 0.65), 0.7);
      }
    },
  });
  speck(g, -2.2, -6.9, 1.1, 0.8);
});

// оса: тельце в полоску, голова по углу a
function wasp(g, x, y, a) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(235,246,255,0.92)';
  g.strokeStyle = alpha('#3a4a60', 0.7);
  g.lineWidth = 0.45;
  for (const [wx, wy, rot] of [[-0.5, -1.7, -0.5], [0.9, -1.8, 0.3]]) {
    g.beginPath();
    g.ellipse(wx, wy, 1.7, 0.9, rot, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#ffcf3a';
  g.strokeStyle = '#33261a';
  g.lineWidth = 0.6;
  g.beginPath();
  g.ellipse(-0.6, 0, 2.1, 1.35, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#33261a';
  g.fillRect(-1.5, -1.1, 0.7, 2.2);
  g.fillRect(-0.2, -1.1, 0.7, 2.2);
  g.beginPath();
  g.arc(1.7, 0.1, 1, 0, TAU);
  g.fill();
  g.restore();
}

// осиный рой: гнездо на ветке и осы вокруг
icon('wasps', (g) => {
  capsule(g, -8.6, -8.6, 0.9, 8.2, -9.4, 1.1, { ...WOOD_DARK, lw: 0.9 });
  leaf(g, 5.2, -9, 9.6, -5.4, 3.2, GREEN, 0.1, VEIN);
  blob(g, [[0, -8.6], [3.8, -6.8], [6.4, -2.6], [6.8, 1.8], [5, 5.8], [1, 8.8], [-3.4, 7.2], [-6.2, 3], [-6.6, -1.6], [-4.4, -6]], T('#f0c35a', { light: '#fff0b0', dark: '#b8862c', line: '#5a3c14' }), {
    over(c) {
      // бумажные слои и леток
      for (const y of [-5.2, -1.8, 1.6, 5]) stroke(c, [[-8, y + 0.4], [0, y + 1.5], [8, y + 0.2]], alpha('#a8742c', 0.75), 0.8);
      c.fillStyle = '#3a2010';
      c.beginPath();
      c.ellipse(0.5, 2.6, 1.9, 2.2, 0, 0, TAU);
      c.fill();
      stroke(c, [[-0.9, 4], [0.6, 4.9], [2, 3.9]], alpha('#fff0b0', 0.8), 0.6);
    },
  });
  wasp(g, -8, 6, 0.4);
  wasp(g, 8.4, 3.4, -0.5);
});

// капля: яд, вода
function drop(g, x, y, s, look) {
  blob(g, turn([[0, -3.4, 1], [1.5, -1], [2, 0.8], [1.3, 2.2], [0, 2.7], [-1.3, 2.2], [-2, 0.8], [-1.5, -1]], 0, x, y, s), look);
  speck(g, x - 0.7 * s, y + 0.4 * s, 0.55 * s, 0.9);
}

// ядовитый шип: тёмный шип, с кончика каплет яд
icon('venom', (g) => {
  const A = -0.74;
  const B = [-7, 6.2];
  const venom = T(COLORS.poison, { light: '#e6ffb4', dark: '#4f8f24', line: '#2f5a14', lw: 0.9 });
  glow(g, 6, -4, 5.6, COLORS.poison, 0.5);
  horn(g, B[0], B[1], A, 20.5, 6.4, T('#6f4a86', { light: '#b890d4', dark: '#3d2356', line: '#28173a' }), -2.4, {
    over(c, patch) {
      patch(turn([[12.6, -7], [23, -7], [23, 7], [13.6, 7], [14.6, 1.6], [12.4, -1.6]], A, B[0], B[1]), venom);
    },
  });
  blob(g, turn([[-1.8, -3.6], [0.4, -3.3], [2.2, -3.8, 1], [1.5, -1.2], [3, 0, 1], [1.5, 1.2], [2.2, 3.8, 1], [0.4, 3.3], [-1.8, 3.6], [-2.4, 0]], A, B[0], B[1]), GREEN_DARK);
  drop(g, 6.9, -4.2, 1, venom);
  drop(g, 7.7, 1.8, 0.62, venom);
});

// ---------- оружие: эпическое ----------

// посох молний: на ветке — кристалл-молния
icon('lightning', (g) => {
  const C = [3, -3.6];
  glow(g, C[0], C[1], 8.2, '#b9a4ff', 0.5);
  capsule(g, -8.6, 9.2, 1.2, -1.9, 0.6, 1.3, WOOD_DARK);
  solid(g, (c) => pathPoly(c, turn([[1.5, -6.5], [-3.2, 0.6], [-0.4, 0.6], [-2, 6.5], [3.4, -1.4], [0.5, -1.4], [3.2, -6.5]], 0.75, C[0], C[1])),
    T(COLORS.lightning, { light: '#ffffff', dark: '#ffc93c', line: '#a8701c' }));
  wraps(g, -2.6, 1.5, Math.atan2(-8.6, 6.7), 3, 2, COLORS.coin, '#7a5210', 1.2, 0.9);
  twinkle(g, -4.4, -7, 1.8);
  twinkle(g, 8.6, 2.2, 1.3);
});

// луч светлячка: фонарь со светлячком внутри
icon('firefly', (g) => {
  g.rotate(-0.12);
  glow(g, 0, 1.4, 10.2, '#d9f77a', 0.55);
  // кольцо, за которое носят
  g.beginPath();
  g.arc(0, -7.6, 2, 0, TAU);
  g.lineWidth = 2.1;
  g.strokeStyle = WOOD_DARK.line;
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = '#b8864a';
  g.stroke();
  ball(g, 0, 2.2, 6.3, 6, T('#e4fb8c', { light: '#ffffff', dark: '#a6d444', line: '#55702a' }), {
    over(c) {
      c.fillStyle = radial(c, 0.4, 2.4, 5, [[0, 'rgba(255,255,255,0.95)'], [0.5, alpha('#fbffd0', 0.6)], [1, alpha('#fbffd0', 0)]]);
      c.fillRect(-7, -4, 14, 13);
      // сам светлячок: тёмная спинка, крылышки и огонёк
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, rot] of [[-1.2, -0.9], [0.2, -0.3]]) {
        c.beginPath();
        c.ellipse(x, 0.6, 1.3, 0.7, rot, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#3a2a1a';
      c.beginPath();
      c.ellipse(-0.7, 1.8, 1.5, 0.95, -0.3, 0, TAU);
      c.fill();
      c.fillStyle = '#fffbe0';
      c.beginPath();
      c.arc(1, 2.8, 1.3, 0, TAU);
      c.fill();
      // прутья фонаря
      stroke(c, [[-3.2, -3.4], [-4.5, 2.2], [-3.2, 8]], alpha('#5a3a20', 0.8), 0.8);
      stroke(c, [[3.2, -3.4], [4.5, 2.2], [3.2, 8]], alpha('#5a3a20', 0.8), 0.8);
    },
  });
  solid(g, (c) => pathPoly(c, [[-4.8, -3.4], [-3.2, -6], [3.2, -6], [4.8, -3.4]]), WOOD_DARK);
  capsule(g, -4.4, 8.6, 1.4, 4.4, 8.6, 1.4, WOOD_DARK);
});

// тройной лист: три листа-лезвия веером
icon('leaves', (g) => {
  const back = T('#4aa84a', { light: '#8ad870', dark: '#2a7436' });
  leaf(g, -7, 8, -5.6, -9.8, 6.8, back, 0.05, VEIN);
  leaf(g, -7, 8, 10, 3.8, 6.8, back, -0.05, VEIN);
  leaf(g, -7, 8, 6.8, -7.6, 7.6, T('#6cc85a', { light: '#c6f6a0', dark: '#2f8a3c' }), 0, VEIN);
  capsule(g, -9.6, 10.2, 1, -6.8, 7.6, 1.2, { ...WOOD_DARK, lw: 0.9 });
  wraps(g, -6.4, 7.3, -0.75, 2, 1.9);
  stroke(g, [[-3.6, 3.6], [1.4, -2.2], [4.4, -5.6]], 'rgba(255,255,255,0.55)', 0.6);
});

// ледяное дыхание: большая снежинка с ледяным кристаллом посередине
icon('frostbreath', (g) => {
  glow(g, 0, 0, 11.4, COLORS.ice, 0.42);
  const arms = (lw, color) => {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.26;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      g.moveTo(dx * 2, dy * 2);
      g.lineTo(dx * 9.2, dy * 9.2);
      // веточки на луче
      for (const s of [-1, 1]) {
        const b = a + s * 0.9;
        g.moveTo(dx * 5.4, dy * 5.4);
        g.lineTo(dx * 5.4 + Math.cos(b) * 3.1, dy * 5.4 + Math.sin(b) * 3.1);
      }
    }
    g.stroke();
  };
  arms(3.1, '#2f6fa8');
  arms(1.9, '#bfeaff');
  arms(0.8, '#ffffff');
  solid(g, (c) => pathStar(c, 0, 0, 3.6, 6, 0.86, 0.26 + TAU / 12), ICE);
  speck(g, -1, -1.1, 0.9, 0.95);
});

// кольцо шипов: венок из лозы, шипы наружу
icon('thornring', (g) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.2;
    horn(g, Math.cos(a) * 5.7, Math.sin(a) * 5.7, a, 4.7, 3, THORN);
  }
  solid(g, (c) => pathRing(c, 0, 0, 7.3, 4.2), T('#96683a', { light: '#d09a60', dark: '#5a3a1e' }), {
    over(c) {
      // лоза перевита
      c.strokeStyle = alpha('#3a2010', 0.7);
      c.lineWidth = 0.7;
      for (let i = 0; i < 14; i++) {
        const a = (i * TAU) / 14;
        c.beginPath();
        c.moveTo(Math.cos(a) * 4.4, Math.sin(a) * 4.4);
        c.lineTo(Math.cos(a + 0.34) * 7.2, Math.sin(a + 0.34) * 7.2);
        c.stroke();
      }
    },
  });
  leaf(g, -5, -3.4, -8.6, -7.4, 3, GREEN, 0.1, VEIN);
  leaf(g, 4.6, 4, 8.2, 7.6, 2.8, GREEN, 0.1, VEIN);
});

// челюсть капкана: зубцы по верхнему краю дуги эллипса от угла a0 до a1, под ними полоса шириной band
function jawPts(cx, cy, rx, ry, a0, a1, n, tooth, band) {
  const pts = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = a0 + ((a1 - a0) * i) / (n * 2);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry - (i % 2 ? tooth : 0)]);
  }
  for (let i = 12; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / 12;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + band]);
  }
  return pts;
}

// капкан: раскрытые стальные челюсти вокруг пластины
icon('beartrap', (g) => {
  g.rotate(-0.1);
  solid(g, (c) => pathPoly(c, jawPts(0, -0.2, 8.6, 4.4, Math.PI, TAU, 6, 3.6, 1.9)), STEEL_FAR);
  ball(g, 0, 1, 4, 2.1, T('#b8543c', { light: '#e8866a', dark: '#7a2c1e' }));
  for (const s of [-1, 1]) ball(g, s * 8.7, 0.8, 1.3, 1.3, IRON);
  solid(g, (c) => pathPoly(c, jawPts(0, 0.9, 8.6, 4.4, Math.PI, 0, 6, 3.8, 2)), STEEL);
});

// споровое облако: гриб-дождевик пускает зелёное облако
icon('spores', (g) => {
  glow(g, 4.6, -4.8, 6.8, COLORS.poison, 0.45);
  cloud(g, [[3.4, -3.2, 3.4], [6.8, -5.4, 3.1], [5, -7.6, 2.5], [1.6, -6.4, 2.4]], T('#a8e86a', { light: '#ecffc6', dark: '#5a9a2c', line: alpha('#2f5a14', 0.8), lw: 0.7 }));
  blob(g, [[-5.4, 8], [0, 8], [0.6, 9.7], [-2.6, 10.3], [-5.8, 9.7]], T('#e6dcc8', { light: '#ffffff', dark: '#b8a888', line: '#463069', lw: 0.9 }));
  ball(g, -2.6, 3.2, 6.6, 6, T('#d9c6f4', { light: '#ffffff', dark: '#9a7ccf', line: '#463069' }), {
    over(c) {
      // бородавки и дырочка, из которой летят споры
      c.fillStyle = alpha('#ffffff', 0.6);
      for (const [x, y, r] of [[-6, 1.4, 1], [-4.4, 5.6, 1.2], [-1, 6.6, 0.9], [1.4, 3.6, 0.9], [-6.4, 4.4, 0.7]]) {
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#3a2456';
      c.beginPath();
      c.ellipse(0.2, -0.8, 2.2, 1.4, -0.6, 0, TAU);
      c.fill();
    },
  });
  g.fillStyle = '#e9ffc0';
  g.strokeStyle = '#4f8f24';
  g.lineWidth = 0.5;
  for (const [x, y, r] of [[1.2, -2.6, 0.8], [8.6, -0.8, 0.8], [9.2, -8.8, 0.7], [-1.6, -8.2, 0.8], [5.4, 0.6, 0.6]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.stroke();
  }
});

// ---------- оружие: легендарное ----------

// звёздный посох: золотая звезда на синем древке
icon('starstaff', (g) => {
  glow(g, -3.4, -4, 7.8, '#ffe58a', 0.6);
  capsule(g, 8, 9.6, 1.2, -1, -1, 1.3, T('#5a4fc0', { light: '#9a90f0', dark: '#30287a' }));
  wraps(g, 0.7, 1, Math.atan2(10.6, 9), 2, 2, COLORS.coin, '#7a5210', 1.3, 0.9);
  wraps(g, 6.4, 7.7, Math.atan2(10.6, 9), 2, 1.9, COLORS.coin, '#7a5210', 1.3, 0.9);
  solid(g, (c) => pathStar(c, -3.4, -4, 6.2, 5, 0.5, -Math.PI / 2 - 0.3), STAR);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(-4, -4.8, 1.5, 0, TAU);
  g.fill();
  twinkle(g, 6.6, -7.2, 2);
  twinkle(g, 4.6, -1.4, 1.2);
});

// рёв бури: рог, из раструба — грозовой рёв
icon('stormroar', (g) => {
  const B = [4.6, -3.6];                                           // середина раструба
  const tilt = 0.866;                                              // куда вытянут его овал
  const N = tilt - Math.PI / 2;                                    // куда он смотрит
  blob(g, [[1.2, -7.6], [6.4, -5.4], [8, 0.4], [6, 3.4], [1.6, 6.8], [-5, 8.6], [-10, 7.4], [-10.4, 5.6], [-8.6, 4.4], [-3.6, 1.2], [-0.6, -3]],
    T('#e6d3ae', { light: '#fff6e0', dark: '#b09468', line: '#5a4226' }), {
      over(c, patch) {
        // тёмный кончик и золотые кольца
        patch([[-13, 2], [-6.9, 2.6], [-6.5, 10], [-13, 10]], T('#5a4636', { light: '#8a705a', dark: '#33261c' }));
        for (const [x1, y1, x2, y2] of [[-4.6, 1.6, -3.2, 8.6], [0.2, -1.6, 2.6, 6.4]]) {
          poly(c, [[x1, y1], [x2, y2]], '#7a5210', 2.3);
          poly(c, [[x1, y1], [x2, y2]], COLORS.coin, 1.2);
        }
      },
    });
  solid(g, (c) => pathEllipse(c, B[0], B[1], 5.2, 2.3, tilt), T('#4a3428', { light: '#7a5a40', dark: '#241812', line: '#5a4226' }));
  for (const [r, half] of [[4.2, 0.55], [6.2, 0.6]]) {
    for (const [color, lw] of [['#4a3f9a', 2.3], ['#f2f4ff', 1.1]]) {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(B[0], B[1], r, N - half, N + half);
      g.stroke();
    }
  }
});

// звездопад: падающая звезда с хвостом
icon('meteor', (g) => {
  const S = [-4, 4];
  const tail = (c) => {
    c.moveTo(-7.4, 0.8);
    c.quadraticCurveTo(0, -4, 10.6, -10.6);
    c.quadraticCurveTo(4, 0, -0.8, 7.4);
    c.closePath();
  };
  g.fillStyle = linear(g, S[0], S[1], 10.6, -10.6, [[0, alpha('#ffe58a', 0.95)], [0.32, alpha('#ff9a3c', 0.9)], [0.66, alpha('#b06cff', 0.65)], [1, alpha('#b06cff', 0)]]);
  g.beginPath();
  tail(g);
  g.fill();
  g.strokeStyle = linear(g, S[0], S[1], 10.6, -10.6, [[0, alpha('#b8601c', 0.9)], [0.6, alpha('#6a3fb8', 0.7)], [1, alpha('#6a3fb8', 0)]]);
  g.lineWidth = 0.8;
  g.beginPath();
  tail(g);
  g.stroke();
  stroke(g, [[-1.6, 1.2], [3.4, -3.6], [7.6, -7.6]], 'rgba(255,255,255,0.7)', 0.8);
  glow(g, S[0], S[1], 7.4, '#ffe58a', 0.6);
  solid(g, (c) => pathStar(c, S[0], S[1], 5.7, 5, 0.52, -Math.PI / 2 + 0.5), STAR);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(S[0] - 0.6, S[1] - 0.6, 1.5, 0, TAU);
  g.fill();
  twinkle(g, 6.4, 5.4, 1.9);
  twinkle(g, -7.4, -7, 1.5);
});

// лунный серп: серп-полумесяц на короткой рукояти
icon('crescent', (g) => {
  glow(g, 1, -2.4, 10.4, '#9fd0ff', 0.4);
  solid(g, (c) => pathPoly(c, moonPts(1, -2.4, 8.4, -2.4, 1.8, 7.2)), T('#e6f0ff', { light: '#ffffff', dark: '#9db8e8', line: '#3f5a96' }));
  capsule(g, 3, 4.8, 1.5, -1.8, 9.2, 1.4, WOOD_DARK);
  wraps(g, 2, 5.7, Math.atan2(4.4, -4.8), 2, 2.1, COLORS.coin, '#7a5210', 1.3, 0.9);
  twinkle(g, 5.6, -7.4, 1.8, '#ffffff', '#3f5a96');
});

// солнечный луч: солнце и яркий луч от него
icon('sunray', (g) => {
  const C = [2.6, -2.6];
  glow(g, C[0], C[1], 9, '#ffd24a', 0.55);
  // луч: от солнца в угол, сужается к концу
  solid(g, (c) => pathPoly(c, [[C[0] + 2, C[1] + 2], [-10.4, 10.4], [C[0] - 2, C[1] - 2]]), T('#fff3a8', { light: '#ffffff', dark: '#ffd24a', line: '#b8791c', lw: 0.9 }));
  solid(g, (c) => pathStar(c, C[0], C[1], 7.7, 8, 0.62, -Math.PI / 2 + 0.2), T('#ffb629', { light: '#ffe08a', dark: '#e07a1c', line: '#8a4a12' }));
  ball(g, C[0], C[1], 4.5, 4.5, T('#ffe14a', { light: '#fffbe0', dark: '#ffb629', line: '#8a4a12', lw: 0.9 }));
  speck(g, C[0] - 1.5, C[1] - 1.6, 1.2, 0.95);
});

// ---------- броня ----------

// кожаный жилет: шнуровка и карман
icon('vest', (g) => {
  g.rotate(-0.1);
  blob(g, [[-7.4, -8.4], [-5.2, -9.8], [-3.2, -9.3, 1], [0, -3.2, 1], [3.2, -9.3, 1], [5.2, -9.8], [7.4, -8.4], [7.6, -5.6], [5.9, -2.2], [7.2, 1.8], [8, 8.2],
    [4, 9.9], [0, 8.8], [-4, 9.9], [-8, 8.2], [-7.2, 1.8], [-5.9, -2.2], [-7.6, -5.6]], LEATHER, {
    over(c, patch) {
      patch([[2.5, 2.9], [6.5, 2.7], [6.7, 6.6], [2.7, 6.8]], LEATHER_DARK);
      // шов посередине и шнуровка
      stroke(c, [[0, -3.2], [0.2, 3], [0, 9]], alpha('#3a2010', 0.85), 0.9);
      for (const y of [-0.2, 2.6, 5.4]) {
        for (const s of [-1, 1]) cord(c, [[-1.7 * s, y - 1], [1.7 * s, y + 1]], TWINE, 0.6, alpha('#3a2010', 0.8), false);
      }
      // стежки по краям
      c.setLineDash([1.1, 1.3]);
      for (const s of [-1, 1]) stroke(c, [[6.3 * s, -7.6], [6.5 * s, -5.4], [4.7 * s, -2.2], [5.9 * s, 1.6], [6.7 * s, 7]], alpha(TWINE, 0.9), 0.6);
      c.setLineDash([]);
      c.fillStyle = COLORS.coin;
      c.beginPath();
      c.arc(4.6, 3.6, 0.7, 0, TAU);
      c.fill();
    },
  });
});

// кора дуба: нагрудник из коры, подпоясан верёвкой
icon('bark', (g) => {
  g.rotate(0.08);
  for (const s of [-1, 1]) cord(g, [[6.8 * s, -6.6], [5.6 * s, -9.8], [3.2 * s, -7.6]], TWINE, 0.9, TWINE_LINE);
  blob(g, [[-7.8, -7.4, 1], [-4, -8.4], [-1.4, -7.2, 1], [0.8, -8], [4.2, -8.6, 1], [7.6, -7], [9, -2.6], [7.8, 2.6, 1], [8.2, 4.6], [5.4, 8.8], [1.4, 10.2, 1],
    [-0.4, 9.2], [-4.6, 9.4], [-7.8, 4.6], [-9, -1.4], [-8.2, -4.4, 1]], T('#8a6848', { light: '#c09c70', dark: '#4f3826', line: '#33241a', lw: 1.2 }), {
    over(c, patch) {
      // борозды коры: тёмная и рядом светлая
      for (const x of [-5.2, -2, 1.4, 4.8]) {
        stroke(c, [[x, -9], [x + 0.7, -3], [x - 0.5, 2.4], [x + 0.4, 10]], alpha('#2a1c14', 0.75), 0.9);
        stroke(c, [[x - 1.1, -9], [x - 0.4, -3], [x - 1.6, 2.4], [x - 0.7, 10]], alpha('#dcbc8e', 0.45), 0.7);
      }
      patch([[-10, -9.6], [-3.2, -9.8], [-2.4, -6.4], [-4.8, -4.8], [-6.6, -3.2], [-10, -2.8]], T('#6fae4a', { light: '#aede7c', dark: '#3f7a2c' }));
    },
  });
  cord(g, [[-8.6, 1.4], [0, 2.6], [8.2, 2.2]], TWINE, 1.3, TWINE_LINE);
  leaf(g, 5, -7.8, 8.4, -10, 2.6, GREEN, 0.1, VEIN);
});

// колючая броня: зелёная чешуя и шипы на плечах
icon('thornmail', (g) => {
  g.rotate(-0.08);
  for (const s of [-1, 1]) {
    const side = (a) => (s > 0 ? a : Math.PI - a);
    horn(g, s * 6.2, -7.2, side(-0.75), 4.2, 2.8, THORN);
    horn(g, s * 6.8, -3.4, side(-0.1), 3.2, 2.6, THORN);
    horn(g, s * 6.4, 4.4, side(0.35), 3.4, 2.6, THORN);
  }
  blob(g, [[-6.6, -8.6], [-3.2, -9.4, 1], [0, -6.2], [3.2, -9.4, 1], [6.6, -8.6], [7.6, -4.4], [6.2, -0.4], [6.8, 5.4], [4.4, 9], [0, 10, 1], [-4.4, 9], [-6.8, 5.4],
    [-6.2, -0.4], [-7.6, -4.4]], T('#4f9a52', { light: '#9ad97a', dark: '#2a5f34', line: '#1c3a24' }), {
    over(c) {
      // чешуя рядами
      c.strokeStyle = alpha('#1c3a24', 0.7);
      c.lineWidth = 0.7;
      [-5.2, -1.8, 1.6, 5].forEach((y, row) => {
        for (let x = -9.6 + (row % 2 ? 1.6 : 0); x < 9; x += 3.2) {
          c.beginPath();
          c.moveTo(x, y);
          c.quadraticCurveTo(x + 1.6, y + 2.8, x + 3.2, y);
          c.stroke();
        }
      });
    },
  });
  // шипы-заклёпки на груди
  for (const [x, y] of [[-2.8, -2.6], [2.8, -2.6], [0, 2.8]]) solid(g, (c) => pathPoly(c, [[x - 1.3, y + 1], [x, y - 1.7], [x + 1.3, y + 1]]), { ...BONE, lw: 0.7 });
});

// меховая шубка: пушистый воротник, манжеты и подол
icon('fur', (g) => {
  g.rotate(0.06);
  const fluff = T('#fffaf0', { light: '#ffffff', dark: '#d6c4a2', line: '#6a5238', lw: 0.8 });
  blob(g, [[-3.6, -8], [0, -6.6], [3.6, -8], [7.4, -6.2], [9, -1.8], [7.8, 1.2, 1], [6.2, -1.2], [6.6, 4.6], [7.4, 8.2, 1], ...tufts(7.4, 8.4, -7.4, 8.4, 5, 1.9, 0.5),
    [-7.4, 8.2, 1], [-6.6, 4.6], [-6.2, -1.2], [-7.8, 1.2, 1], [-9, -1.8], [-7.4, -6.2]], T('#e2c08a', { light: '#fff0cc', dark: '#a8804a', line: '#5a3e22' }), {
    over(c) {
      // штрихи меха, запах и палочки-застёжки
      c.strokeStyle = alpha('#a8804a', 0.75);
      c.lineWidth = 0.7;
      for (const [x, y] of [[-4.6, -1.6], [-3, 3.4], [-5, 5.6], [3.6, -2], [4.8, 2.6], [2.8, 6], [-7.4, -2.6], [7.2, -3]]) {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 0.3, y + 1.3, x - 0.5, y + 2.2);
        c.stroke();
      }
      stroke(c, [[0, -5], [0.3, 2], [0, 10]], alpha('#5a3e22', 0.8), 0.8);
      for (const y of [-1.6, 2.4]) cord(c, [[-1.6, y + 0.4], [1.8, y - 0.4]], '#8a5a34', 1, '#3a2414', false);
    },
  });
  cloud(g, [[8.3, -0.2, 1.8]], fluff);
  cloud(g, [[-8.3, -0.2, 1.8]], fluff);
  cloud(g, [[-4.2, -7.6, 2.4], [-1.4, -6.6, 2.5], [1.4, -6.6, 2.5], [4.2, -7.6, 2.4]], fluff);
});

// плащ тени: тёмный капюшон и рваный подол
icon('shadowcloak', (g) => {
  glow(g, 0, 0, 11.4, '#8a5ae0', 0.38);
  blob(g, [[1.6, -10.6, 1], [5.4, -7.2], [5.8, -3.4], [7.8, -0.4], [9.2, 5], [9.6, 9.4, 1], [6.6, 8], [4.4, 10, 1], [1.6, 8.4], [-1, 10.2, 1], [-3.8, 8.4], [-6.4, 10, 1],
    [-8, 8.2], [-9.6, 9.2, 1], [-9, 4], [-7.2, -0.8], [-5.6, -4], [-4.6, -8], [-1.6, -10.2]], T('#5a4690', { light: '#a08cec', dark: '#2c2152', line: '#1c1436', lw: 1.2, rim: 0.85 }), {
    over(c, patch) {
      // запах плаща и складки
      patch([[0.2, -1.2], [2.6, 11], [-2.2, 11]], T('#2c2152', { light: '#4a3a80', dark: '#160f2c' }));
      stroke(c, [[-5.4, -0.6], [-6.2, 4], [-5.6, 9]], alpha('#1c1436', 0.55), 0.8);
      stroke(c, [[5.6, -0.2], [6.6, 4.4], [6.2, 9]], alpha('#1c1436', 0.55), 0.8);
    },
  });
  ball(g, 0.2, -5.2, 3.3, 3.6, T('#1c1430', { light: '#3a2c5a', dark: '#0f0a1c', line: '#1c1436', lw: 0.9, rim: 0 }));
  ball(g, 0.2, -0.8, 1.5, 1.5, { ...GOLD, lw: 0.8 });
  twinkle(g, -4.6, 3.4, 1.2, '#e6d8ff', '#3a2a70');
  twinkle(g, 5, 5.6, 0.9, '#e6d8ff', '#3a2a70');
});

// панцирь черепахи: купол из щитков со светлой каймой
icon('shell', (g) => {
  g.rotate(-0.2);
  ball(g, 0, 0.9, 9.6, 8, T('#d9c08a', { light: '#fff2c4', dark: '#a8884a', line: '#4a3a1c' }), {
    over(c) {
      c.strokeStyle = alpha('#4a3a1c', 0.6);
      c.lineWidth = 0.7;
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12 + 0.26;
        c.beginPath();
        c.moveTo(Math.cos(a) * 7.6, 0.4 + Math.sin(a) * 6.2);
        c.lineTo(Math.cos(a) * 10, 0.9 + Math.sin(a) * 8.4);
        c.stroke();
      }
    },
  });
  ball(g, 0, -0.2, 8, 6.5, T('#5f9a4a', { light: '#aede80', dark: '#2f6a34', line: '#234a24' }), {
    over(c) {
      // щитки: шестиугольник посередине и швы к краям
      const hex = [[-2.5, -3.7], [2.5, -3.7], [4.7, -0.3], [2.5, 3.1], [-2.5, 3.1], [-4.7, -0.3]];
      const rim = [[-4.6, -7.4], [4.6, -7.4], [9.4, -0.3], [4.6, 7], [-4.6, 7], [-9.4, -0.3]];
      c.fillStyle = alpha('#c6f09a', 0.3);
      c.beginPath();
      pathPoly(c, hex);
      c.fill();
      c.strokeStyle = alpha('#234a24', 0.85);
      c.lineWidth = 0.9;
      c.beginPath();
      pathPoly(c, hex);
      for (let i = 0; i < 6; i++) {
        c.moveTo(hex[i][0], hex[i][1]);
        c.lineTo(rim[i][0], rim[i][1]);
      }
      c.stroke();
    },
  });
  speck(g, -3.4, -3.6, 1.1, 0.7);
});

// перо накидки: от (x1, y1) до кончика (x2, y2)
function feather(g, x1, y1, x2, y2, w, look, tip) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  solid(g, (c) => pathLeaf(c, x1, y1, x2, y2, w), look, {
    over(c, patch) {
      patch((p) => pathEllipse(p, x2, y2, len * 0.36, len * 0.36), tip);
      c.strokeStyle = alpha('#ffffff', 0.85);
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x1 + (x2 - x1) * 0.9, y1 + (y2 - y1) * 0.9);
      c.stroke();
    },
  });
}

// перьевая накидка: веер бирюзовых перьев на застёжке
icon('feathers', (g) => {
  const teal = T('#3fb8a8', { light: '#9af0dc', dark: '#1f7a74', line: '#124a48', lw: 1 });
  const pale = T('#7fd8c8', { light: '#d6fff4', dark: '#3f9a8c', line: '#124a48', lw: 1 });
  const tip = T('#2a4a6a', { light: '#4a7aa0', dark: '#16283c' });
  feather(g, -2.8, -6.4, -9.2, 4.2, 5.8, teal, tip);
  feather(g, 2.8, -6.4, 9.2, 4.2, 5.8, teal, tip);
  feather(g, -1.4, -6.2, -5.2, 9.2, 5.8, pale, tip);
  feather(g, 1.4, -6.2, 5.2, 9.2, 5.8, pale, tip);
  feather(g, 0, -6, 0, 10.4, 6, teal, tip);
  capsule(g, -4.4, -7.8, 1.6, 4.4, -7.8, 1.6, LEATHER);
  ball(g, 0, -7.8, 2.1, 2.1, GOLD);
  speck(g, -0.7, -8.5, 0.6, 0.9);
});

// паутинная кольчуга: серебристая рубаха в паутинном узоре
icon('silkmail', (g) => {
  g.rotate(0.08);
  glow(g, 0, 0, 11.2, '#c8c8ff', 0.3);
  blob(g, [[-3, -9, 1], [0, -7.2], [3, -9, 1], [7.6, -7.6], [10.4, -3.4, 1], [8, -0.6, 1], [6.2, -2.4], [6.4, 4], [6.8, 9.2, 1], [4.5, 8.2], [2.3, 9.8, 1], [0, 8.6],
    [-2.3, 9.8, 1], [-4.5, 8.2], [-6.8, 9.2, 1], [-6.4, 4], [-6.2, -2.4], [-8, -0.6, 1], [-10.4, -3.4, 1], [-7.6, -7.6]], T('#eef0f8', { light: '#ffffff', dark: '#aab0d0', line: '#4a4f78' }), {
    over(c) {
      // паутина: спицы от середины и провисшие нити между ними
      const W = [0, -0.4];
      c.strokeStyle = alpha('#6a70a4', 0.8);
      c.lineWidth = 0.6;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8 + 0.2;
        c.moveTo(W[0], W[1]);
        c.lineTo(W[0] + Math.cos(a) * 16, W[1] + Math.sin(a) * 16);
      }
      for (const r of [3, 5.8, 8.8]) {
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8 + 0.2;
          const b = a + TAU / 8;
          c.moveTo(W[0] + Math.cos(a) * r, W[1] + Math.sin(a) * r);
          c.quadraticCurveTo(W[0] + Math.cos((a + b) / 2) * r * 0.74, W[1] + Math.sin((a + b) / 2) * r * 0.74, W[0] + Math.cos(b) * r, W[1] + Math.sin(b) * r);
        }
      }
      c.stroke();
      stroke(c, [[-3.6, -7.8], [0, -5.6], [3.6, -7.8]], alpha('#4a4f78', 0.75), 0.8);
    },
  });
  twinkle(g, -4.4, -3.6, 1.5, '#ffffff', '#4a4f78');
});

// лунная мантия: синяя, с месяцем и золотой каймой
icon('moonrobe', (g) => {
  glow(g, 0, 0, 11.4, '#9fb8ff', 0.34);
  blob(g, [[-2.4, -9.6, 1], [0, -8.2], [2.4, -9.6, 1], [5.4, -8.4], [9.4, -2.6], [9.8, 2.4, 1], [6.6, 1], [4.8, -2.6], [4.4, 1.6], [8.2, 9.4, 1], [0, 10.4], [-8.2, 9.4, 1],
    [-4.4, 1.6], [-4.8, -2.6], [-6.6, 1], [-9.8, 2.4, 1], [-9.4, -2.6], [-5.4, -8.4]], T('#4a63d0', { light: '#8ea8ff', dark: '#2a3a94', line: '#1a2258' }), {
    over(c, patch) {
      // золотая кайма по подолу и рукавам
      patch([[-12, 7.4], [0, 8.4], [12, 7.4], [12, 12], [-12, 12]], GOLD);
      for (const s of [-1, 1]) patch((p) => pathPoly(p, [[7.6 * s, -3.6], [12 * s, -4], [12 * s, 4], [8.2 * s, 3]]), GOLD);
      stroke(c, [[0, -8], [0.2, -1], [0, 7.6]], alpha('#1a2258', 0.5), 0.7);
    },
  });
  cord(g, [[-4.4, 1.5], [0, 2.1], [4.4, 1.5]], COLORS.coin, 0.9, '#7a5210');
  solid(g, (c) => pathPoly(c, moonPts(-0.2, -4.2, 2.7, 1.2, -0.5, 2.3, 8)), T('#fff0a8', { light: '#ffffff', dark: '#ffd24a', line: '#7a5a1c', lw: 0.6 }));
  g.fillStyle = '#fff0a8';
  for (const [x, y, r] of [[-2.6, 5, 0.7], [2.4, 5.8, 0.6], [0.3, 4, 0.5]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
});

// ---------- зелья ----------

const GLASS = T('#dcefff', { light: '#ffffff', dark: '#9fc4e6', line: '#3f5a7a', lw: 1 });
const CORK = T('#c79a5e', { light: '#eecb96', dark: '#8a6234', lw: 1 });

/** Горлышко с пробкой: (x, y) — середина низа горлышка, w × h — оно само; пробка торчит ещё на 2,6 выше. */
function neck(g, x, y, w, h, cork = CORK) {
  solid(g, (c) => pathPoly(c, [[x - w * 0.4, y - h - 2.6], [x + w * 0.4, y - h - 2.6], [x + w * 0.48, y - h + 0.6], [x - w * 0.48, y - h + 0.6]]), cork);
  solid(g, (c) => pathPoly(c, [[x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2, y], [x - w / 2, y]]), GLASS);
  capsule(g, x - w / 2 - 0.3, y - h, 0.8, x + w / 2 + 0.3, y - h, 0.8, GLASS);
}

/**
 * Склянка: trace — её контур, look — краска зелья, level — где его поверхность (выше — пустое стекло),
 * inside(c, patch) — что плавает в зелье и нарисовано на стекле.
 */
function flask(g, trace, look, level, inside) {
  solid(g, trace, look, {
    over(c, patch) {
      patch((p) => pathPoly(p, [[-13, -13], [13, -13], [13, level], [-13, level]]), GLASS);
      stroke(c, [[-13, level + 0.1], [0, level + 1], [13, level + 0.1]], alpha(look.light, 0.95), 1);
      if (inside) inside(c, patch);
    },
  });
}

const HEART = [[0, -0.6, 1], [-4.6, -4.8], [-4.8, -8.4], [-2.4, -9.8], [0, -8, 1], [2.4, -9.8], [4.8, -8.4], [4.6, -4.8]];

// зелье лечения: круглая склянка, красное, с сердечком
icon('heal', (g) => {
  g.rotate(-0.2);
  const look = T(COLORS.heart, { light: COLORS.heartLight, dark: COLORS.heartDark, line: '#5e1626' });
  neck(g, 0, -2.4, 4.6, 5);
  flask(g, (c) => pathEllipse(c, 0, 3.4, 7, 6.6), look, -0.2, (c) => {
    bubbles(c, [[-3.6, 1.8, 0.8], [3.8, 1, 0.6], [3, 7.2, 0.7]], look.light);
    c.fillStyle = 'rgba(255,255,255,0.94)';
    c.beginPath();
    pathBlob(c, turn(HEART, 0, 0.2, 7.6, 0.52));
    c.fill();
    stroke(c, [[-5, 0.6], [-5.7, 3.6], [-4.7, 6.6]], 'rgba(255,255,255,0.75)', 1);
  });
});

// зелье маны: коническая колба, синее, со звёздочкой
icon('manapot', (g) => {
  g.rotate(0.16);
  const look = T(COLORS.mana, { light: COLORS.manaLight, dark: COLORS.manaDark, line: '#143a78' });
  neck(g, 0, -3.2, 4.2, 4.6);
  flask(g, (c) => pathBlob(c, [[-2.3, -4, 1], [-5, 1.6], [-7.8, 7], [-6.8, 9.4], [0, 10], [6.8, 9.4], [7.8, 7], [5, 1.6], [2.3, -4, 1]]), look, 0.8, (c) => {
    bubbles(c, [[-3, 3.6, 0.7], [3.4, 4.4, 0.6], [-4.6, 7.4, 0.6]], look.light);
    sparkle(c, 0.2, 5.8, 2.9, 'rgba(255,255,255,0.95)', 0.26);
    stroke(c, [[-3.4, 0], [-5.4, 4.6], [-6.4, 7.4]], 'rgba(255,255,255,0.7)', 0.9);
  });
});

// эликсир скорости: узкая склянка с крылышками, жёлтое
icon('haste', (g) => {
  g.rotate(-0.22);
  const look = T('#ffd93c', { light: '#fff6b0', dark: '#e09a1c', line: '#7a5210' });
  const wing = T('#ffffff', { light: '#ffffff', dark: '#c2d2e4', line: '#56688a', lw: 0.9 });
  for (const s of [-1, 1]) {
    blob(g, [[3.2, -0.2], [5.4, -4.4], [9, -5.4, 1], [7.8, -3.3], [8.9, -2.5, 1], [7.2, -1], [7.8, 0.4, 1], [5.2, 1.5]].map(([x, y, k]) => (k ? [x * s, y, 1] : [x * s, y])), wing);
  }
  neck(g, 0, -3.6, 3.4, 4.2);
  flask(g, (c) => pathCapsule(c, 0, -0.4, 4.1, 0, 6, 4.1), look, -1, (c) => {
    bubbles(c, [[1.4, 1.4, 0.7], [-1.2, 4, 0.6], [1.8, 6.6, 0.8]], look.light);
    stroke(c, [[-2.6, -1.6], [-3, 3], [-2.4, 7]], 'rgba(255,255,255,0.8)', 0.9);
  });
});

// эликсир ярости: гранёная склянка с рожками, рыжее, со злыми глазами
icon('rage', (g) => {
  g.rotate(0.14);
  const look = T('#ff6a1f', { light: '#ffc27a', dark: '#c2331a', line: '#6a1c10' });
  const dark = T('#5a3626', { light: '#8a5a40', dark: '#33190f', lw: 0.9 });
  horn(g, -1.8, -8, -2.45, 3.6, 2.2, dark, -0.8);
  horn(g, 1.8, -8, -0.69, 3.6, 2.2, dark, 0.8);
  neck(g, 0, -2.6, 4.6, 4.2, dark);
  flask(g, (c) => pathPoly(c, [[-2.6, -3.8], [-8, 2.2], [-4.8, 9.6], [4.8, 9.6], [8, 2.2], [2.6, -3.8]]), look, -0.6, (c) => {
    bubbles(c, [[-2.4, 0.8, 0.7], [1.6, 0.4, 0.9], [4.2, 1.6, 0.6]], look.light);
    // злые глаза
    c.fillStyle = '#fff6c0';
    for (const s of [-1, 1]) {
      c.beginPath();
      pathPoly(c, [[4.6 * s, 2.6], [1 * s, 4.4], [1.4 * s, 5.8], [4.4 * s, 5]]);
      c.fill();
    }
    stroke(c, [[-5.6, 1.6], [-5.4, 5], [-4.2, 8]], 'rgba(255,255,255,0.6)', 0.8);
  });
});

// эликсир каменной шкуры: приземистая банка с камнем вместо пробки, серое, с камешками
icon('stone', (g) => {
  g.rotate(-0.1);
  const rock = T('#9aa3ad', { light: '#dfe5ea', dark: '#5f6975', line: '#343c48' });
  blob(g, [[-3, -6.6], [-2.4, -9.4], [0.8, -10.2], [3.2, -8.6], [3, -6.4], [0, -5.8]], { ...rock, lw: 1 });
  solid(g, (c) => pathPoly(c, [[-3.4, -6.2], [3.4, -6.2], [3.4, -2.4], [-3.4, -2.4]]), GLASS);
  capsule(g, -3.7, -6.2, 0.8, 3.7, -6.2, 0.8, GLASS);
  flask(g, (c) => pathBlob(c, [[-4, -3.2], [-7.6, -1.4], [-8.6, 3.4], [-7.4, 8.4], [-3, 10], [3, 10], [7.4, 8.4], [8.6, 3.4], [7.6, -1.4], [4, -3.2]]),
    T('#a9b6c4', { light: '#e6eef6', dark: '#66748a', line: '#343c48' }), 0, (c, patch) => {
      // камешки на дне
      for (const [x, y, rx, ry] of [[-3.6, 7, 2.8, 2], [1.8, 7.6, 3, 1.9], [5.2, 5.2, 2, 1.6], [-0.8, 4.4, 1.7, 1.3]]) {
        patch((p) => pathEllipse(p, x, y, rx, ry), T('#6f7a88', { light: '#b4bec9', dark: '#3f4752' }));
        c.strokeStyle = alpha('#2a323c', 0.7);
        c.lineWidth = 0.6;
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, TAU);
        c.stroke();
      }
      stroke(c, [[-6.2, 0.6], [-6.8, 3.6], [-6, 6.6]], 'rgba(255,255,255,0.75)', 0.9);
    });
});

// свиток-карта: развёрнутый лист с тропой и крестиком
icon('mapscroll', (g) => {
  g.rotate(-0.2);
  const roll = T('#e2c88e', { light: '#fff0c8', dark: '#b08a4a', line: '#6a4a24' });
  solid(g, (c) => pathPoly(c, [[-6.2, -6.4], [6.2, -6.4], [6.6, 0], [6.2, 6.6], [-6.2, 6.6], [-6.6, 0]]), T('#f3e2b8', { light: '#fffaf0', dark: '#cfae74', line: '#6a4a24' }), {
    over(c) {
      // горы, тропа пунктиром и крестик там, где клад
      c.fillStyle = alpha('#8a7a5a', 0.75);
      c.beginPath();
      pathPoly(c, [[-5, -1.4], [-3.4, -4], [-1.8, -1.4]]);
      pathPoly(c, [[-2.8, -1.4], [-1.4, -3.4], [0, -1.4]]);
      c.fill();
      c.setLineDash([1.1, 1.3]);
      stroke(c, [[-4.4, 4.2], [-1.2, 1.8], [1.4, 3.2], [3.4, -0.6]], '#7a5a34', 0.9);
      c.setLineDash([]);
      poly(c, [[2.6, -3.8], [4.8, -1.6]], '#d8453a', 1.1);
      poly(c, [[4.8, -3.8], [2.6, -1.6]], '#d8453a', 1.1);
    },
  });
  capsule(g, -6.8, -6.8, 1.7, 6.8, -6.8, 1.7, roll);
  capsule(g, -6.8, 7, 1.6, 6.8, 7, 1.6, roll);
  g.strokeStyle = alpha('#6a4a24', 0.8);
  g.lineWidth = 0.6;
  for (const [x, y] of [[-6.8, -6.8], [6.8, 7]]) {
    g.beginPath();
    g.arc(x, y, 0.8, 0.6, TAU);
    g.stroke();
  }
  ball(g, 4.4, 7.4, 1.7, 1.7, { ...RED, lw: 0.8 });
});

// ---------- предметы комнат: общее ----------

// краски леса — те же, что у сундука, пней и камней (art-tiles.js)
const F = {
  rock: '#9aa3ad', rockDark: '#6d7783', rockLight: '#c6ced6', moss: '#6fae4a',
  trunk: '#8a5a34', trunkDark: '#5e3a20', stump: '#b98a56', wood: '#b07a44', brass: '#e6bc4e', glow: '#fff0a8',
  water: '#4aa8d8', waterDeep: '#2f86bd', shine: '#bfe9ff', berry: '#e4473c',
  grass: '#9ad96f', grassDark: '#5ea646', grassDeep: '#3f8238',
};
const SHADE = '#141828';                       // тень на земле: к ней темнеет низ камней

const K = (fill, o) => tone(fill, { lw: 1.6, ...o });

/** Узлы «живого» пятна: n точек по овалу, каждая чуть ближе или дальше (мох, лужица). */
function wobble(cx, cy, rx, ry, seed, rough = 0.18, n = 8) {
  const rnd = rand(seed);
  const a0 = rnd() * TAU;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const k = 1 + (rnd() - 0.5) * 2 * rough;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** Подушка мха: пятно со светлой макушкой. */
function moss(g, cx, cy, rx, ry, seed) {
  g.fillStyle = F.moss;
  g.beginPath();
  pathBlob(g, wobble(cx, cy, rx, ry, seed));
  g.fill();
  g.save();
  g.translate(cx - rx * 0.2, cy - ry * 0.25);
  g.scale(1, ry / rx);
  glow(g, 0, 0, rx * 0.7, lighten(F.moss, 0.5), 0.8);
  g.restore();
}

/**
 * Гранёный камень-валун: стоит на (cx, base), шириной w и высотой h. Грани светлее к свету и темнее от него.
 * o: moss — мох на макушке (доля 0…1), cracks — трещины, lw — обводка, color — свой цвет камня.
 */
function boulder(g, cx, base, w, h, seed, o = {}) {
  const rnd = rand(seed);
  const n = 9;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    const k = i === 0 || i === n - 1 ? 1 : 0.84 + rnd() * 0.24;
    pts.push([cx + Math.cos(a) * (w / 2) * k, base + Math.sin(a) * h * k]);
  }
  const color = o.color ?? F.rock;
  const lit = o.color ? lighten(color, 0.42) : F.rockLight;
  const dim = o.color ? darken(color, 0.36) : F.rockDark;
  const ax = cx - w * 0.1 + (rnd() - 0.5) * w * 0.12;
  const ay = base - h * 0.62;
  const trace = (c) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.quadraticCurveTo(cx, base + 2.6, pts[0][0], pts[0][1]);
    c.closePath();
    return [cx - w / 2, base - h * 1.08, cx + w / 2, base + 1.3];
  };
  solid(g, trace, tone(color, { lw: o.lw ?? 1.6, shade: 0, rim: 0 }), {
    over(c) {
      for (let i = 0; i < n - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2 - ax;
        const my = (pts[i][1] + pts[i + 1][1]) / 2 - ay;
        const d = Math.hypot(mx, my) || 1;
        const turnToLight = (mx * LIGHT[0] + my * LIGHT[1]) / d;
        const face = turnToLight > 0 ? mix(color, lit, Math.min(1, turnToLight * 1.05)) : mix(color, dim, Math.min(1, -turnToLight * 1.15));
        c.fillStyle = face;
        c.strokeStyle = face;
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(pts[i][0], pts[i][1]);
        c.lineTo(pts[i + 1][0], pts[i + 1][1]);
        c.closePath();
        c.fill();
        c.stroke();
      }
      // низ в тени: от земли поднимается сумрак
      c.fillStyle = linear(c, 0, base - h * 0.42, 0, base + 2, [[0, alpha(dim, 0)], [1, alpha(mix(dim, SHADE, 0.35), 0.62)]]);
      c.fillRect(cx - w / 2 - 2, base - h * 0.42, w + 4, h * 0.42 + 4);
      c.strokeStyle = alpha(outline(color, 0.6), 0.6);
      c.lineWidth = 0.9;
      for (let i = 0; i < (o.cracks ?? 2); i++) {
        const sx = ax + (rnd() - 0.3) * w * 0.4;
        c.beginPath();
        c.moveTo(sx, ay + rnd() * 4);
        c.lineTo(sx + (rnd() - 0.4) * 5, ay + h * 0.22 + rnd() * 3);
        c.lineTo(sx + (rnd() - 0.4) * 8, ay + h * 0.4 + rnd() * 4);
        c.stroke();
      }
      if (o.moss) moss(c, cx - w * 0.08, base - h * 0.98, w * 0.42 * o.moss + 3, h * 0.26 * o.moss + 2, seed + 5);
      // кайма света по освещённому краю
      c.strokeStyle = linear(c, cx - w / 2, base - h, cx + w * 0.05, base - h * 0.45, [[0, alpha(lighten(lit, 0.5), 0.7)], [1, alpha(lit, 0)]]);
      c.lineWidth = 3;
      c.beginPath();
      trace(c);
      c.stroke();
    },
  });
}

/** Кустик травы: несколько травинок веером. */
function grass(g, x, y, size, seed) {
  const rnd = rand(seed);
  const n = 3 + Math.floor(rnd() * 3);
  g.lineCap = 'round';
  g.lineWidth = 1.25;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.44 + (rnd() - 0.5) * 0.3;
    const len = size * (0.65 + rnd() * 0.55);
    g.strokeStyle = i % 2 ? alpha(F.grassDeep, 0.85) : rnd() < 0.55 ? lighten(F.grass, 0.18) : F.grassDark;
    g.beginPath();
    g.moveTo(x + (i - (n - 1) / 2) * 0.9, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.45, y + Math.sin(a) * len * 0.7, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
}

/** Цветок в пять лепестков. */
function flower(g, x, y, color, size = 1) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - 0.3;
    g.moveTo(x + Math.cos(a) * 1.5 * size + 1.25 * size, y + Math.sin(a) * 1.5 * size);
    g.arc(x + Math.cos(a) * 1.5 * size, y + Math.sin(a) * 1.5 * size, 1.25 * size, 0, TAU);
  }
  g.fill();
  g.fillStyle = '#f2b632';
  g.beginPath();
  g.arc(x, y, 0.95 * size, 0, TAU);
  g.fill();
}

/**
 * Бок пня: кора с корнями от земли (base) до спила (top), r — полуширина у спила. Слева кора светлее.
 * o: seed — зерно трещин, bark — свой цвет коры, over(c) — что ещё нарисовать на коре.
 */
function stumpSide(g, x, base, top, r, o = {}) {
  const bark = o.bark ?? mix(F.trunk, F.stump, 0.35);
  solid(g, (c) => {
    c.moveTo(x - r - 4.5, base + 1);
    c.quadraticCurveTo(x - r, base - 1.5, x - r, top);
    c.lineTo(x + r, top);
    c.quadraticCurveTo(x + r, base - 1.5, x + r + 5, base + 1);
    c.quadraticCurveTo(x + r * 0.55, base + 3.4, x + r * 0.2, base + 1);
    c.quadraticCurveTo(x - r * 0.4, base + 3.6, x - r - 4.5, base + 1);
    c.closePath();
    return [x - r - 4.5, top, x + r + 5, base + 2.4];
  }, K(bark, { shade: 0.5 }), {
    over(c) {
      c.fillStyle = linear(c, x - r, 0, x + r + 1, 0, [[0, alpha(lighten(bark, 0.5), 0.5)], [0.4, alpha(bark, 0)], [1, alpha(F.trunkDark, 0.9)]]);
      c.fillRect(x - r - 6, top - 2, r * 2 + 12, base - top + 8);
      const rnd = rand(o.seed ?? 7);
      c.strokeStyle = alpha(F.trunkDark, 0.6);
      c.lineWidth = 0.9;
      for (let i = 0; i < 7; i++) {
        const bx = x - r + 1.5 + rnd() * (r * 2 - 3);
        const by = top + 5 + rnd() * 3;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + (rnd() - 0.5), by + 4 + rnd() * 5);
        c.stroke();
      }
      if (o.over) o.over(c);
    },
  });
}

/** Спил пня: светлый овал с годовыми кольцами. */
function cutFace(g, x, y, rx, ry) {
  const face = lighten(F.stump, 0.42);
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
  g.strokeStyle = alpha(outline(F.stump, 0.3), 0.7);
  g.lineWidth = 0.8;
  for (const k of [0.66, 0.36]) {
    g.beginPath();
    g.ellipse(x + rx * 0.06, y + ry * 0.05, rx * k, ry * k, 0, 0, TAU);
    g.stroke();
  }
  g.fillStyle = alpha(lighten(face, 0.6), 0.7);
  g.beginPath();
  g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.36, 0, 0, TAU);
  g.fill();
  g.strokeStyle = outline(F.stump, 0.6);
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.stroke();
}

/** Сияние, лежащее на земле: сплюснутый круг. */
function groundGlow(g, x, y, rx, ry, color, strength) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  glow(g, 0, 0, rx, color, strength);
  g.restore();
}

// ---------- жертвенный камень ----------

thing('altar', 40, 34, 4, (g) => {
  // стоячие камни позади
  boulder(g, -11.5, -9, 10, 17.6, 311, { cracks: 1 });
  boulder(g, 13.2, -9, 8.4, 10.4, 312, { cracks: 1, lw: 1.5 });
  const front = mix(F.rock, F.rockDark, 0.55);
  // бок плиты
  solid(g, (c) => {
    c.moveTo(-16.5, -13.4);
    c.lineTo(16.5, -13.4);
    c.quadraticCurveTo(17.6, -4, 16.4, 1.2);
    c.quadraticCurveTo(0, 4.6, -16.4, 1.2);
    c.quadraticCurveTo(-17.6, -4, -16.5, -13.4);
    c.closePath();
    return [-17.1, -13.4, 17.1, 2.9];
  }, K(front, { light: F.rock, dark: darken(F.rockDark, 0.3), shade: 0.5 }), {
    over(c) {
      c.fillStyle = linear(c, -17, 0, 17, 0, [[0, alpha(F.rockLight, 0.45)], [0.36, alpha(F.rockLight, 0)], [1, alpha(darken(F.rockDark, 0.3), 0.45)]]);
      c.fillRect(-18, -14, 36, 19);
      c.fillStyle = linear(c, 0, -5, 0, 3.4, [[0, alpha(F.rockDark, 0)], [1, alpha(mix(F.rockDark, SHADE, 0.4), 0.6)]]);
      c.fillRect(-18, -5, 36, 9);
      // трещины
      stroke(c, [[-11.6, -8], [-10, -3.6], [-11.8, -0.2]], alpha(outline(F.rock, 0.6), 0.6), 0.9);
      stroke(c, [[13.2, -3.4], [11.6, 0.4]], alpha(outline(F.rock, 0.6), 0.6), 0.9);
      // вырезанный след лапы: светлый нижний край и тёмная выемка
      pawMark(c, 0.5, -3.2, 0.92, alpha(F.rockLight, 0.7));
      pawMark(c, 0, -3.8, 0.92, mix(front, INK, 0.66));
    },
  });
  // верх плиты и тёмное пятно на нём
  solid(g, (c) => pathEllipse(c, 0, -14, 17, 5.8), K(mix(F.rock, F.rockLight, 0.5)), {
    over(c) {
      stroke(c, [[-2.4, -19.4], [-0.8, -15.4], [-3.2, -12], [-2, -8.6]], alpha(outline(F.rock, 0.6), 0.5), 0.8);
      c.fillStyle = alpha('#5a1826', 0.88);
      c.beginPath();
      pathBlob(c, [[-3.6, -15.2], [1, -17], [6.6, -16.6], [10.6, -14.6], [11.6, -12], [10.2, -8], [7.6, -8], [7.6, -11.2], [4, -11.4], [-1.6, -12.4]]);
      c.fill();
      c.fillStyle = alpha('#8a2a3a', 0.6);
      c.beginPath();
      c.ellipse(3.4, -14.6, 3.6, 1.2, 0, 0, TAU);
      c.fill();
    },
  });
  // потёки по боку
  g.fillStyle = alpha('#5a1826', 0.9);
  g.beginPath();
  pathCapsule(g, 8.9, -9.4, 1.2, 8.9, -5.2, 1);
  pathCapsule(g, 11.4, -9.6, 0.8, 11.4, -7.6, 0.7);
  g.fill();
  // мох: на плите, свесился с края, и у земли
  moss(g, -10.2, -15.4, 5.6, 2.6, 313);
  moss(g, -12.4, -10.6, 3.4, 3, 314);
  moss(g, 11.2, 1.8, 4.4, 1.5, 315);
  moss(g, -13.2, 1.6, 3.6, 1.4, 316);
  grass(g, -17.4, 2.6, 5, 317);
  grass(g, 17.2, 2.4, 4.4, 318);
});

// ---------- колодец желаний ----------

thing('well', 44, 52, 4, (g) => {
  const post = K(F.trunk, { light: '#bc8a58', dark: F.trunkDark, lw: 1.4 });
  // по какой дуге идёт ряд кладки (стенка круглая: посередине ряд ниже)
  const sag = (x) => 6.4 * ((x + 14) / 28) * (1 - (x + 14) / 28) - 1.4;
  const rows = [-9.6, -5.2, -0.8];
  // стенка
  solid(g, (c) => {
    c.moveTo(-14, -14);
    c.lineTo(14, -14);
    c.lineTo(14, -1);
    c.quadraticCurveTo(14, 3.6, 0, 3.8);
    c.quadraticCurveTo(-14, 3.6, -14, -1);
    c.closePath();
    return [-14, -14, 14, 3.8];
  }, K(F.rock, { shade: 0.4 }), {
    over(c) {
      c.fillStyle = linear(c, -14, 0, 14, 0, [[0, alpha(F.rockLight, 0.6)], [0.36, alpha(F.rockLight, 0)], [0.6, alpha(F.rockDark, 0)], [1, alpha(F.rockDark, 0.8)]]);
      c.fillRect(-15, -15, 30, 20);
      // камни посветлее и потемнее
      for (const [x, y, lightStone] of [[-8.4, -7.2, 1], [2.6, -2.6, 1], [-2.4, -11, 0], [8.6, -6.6, 0], [-9, 1.4, 0], [5.4, 1.8, 1]]) {
        c.fillStyle = lightStone ? alpha(F.rockLight, 0.4) : alpha(F.rockDark, 0.35);
        c.beginPath();
        c.ellipse(x, y + sag(x), 2.5, 1.7, 0, 0, TAU);
        c.fill();
      }
      // швы кладки: ряды и стыки вперебежку
      c.strokeStyle = alpha(outline(F.rock, 0.62), 0.6);
      c.lineWidth = 0.9;
      for (const y of rows) {
        c.beginPath();
        c.moveTo(-14, y - 1.4);
        c.quadraticCurveTo(0, y + 1.8, 14, y - 1.4);
        c.stroke();
      }
      for (let r = 0; r < 4; r++) {
        for (let x = -11.4 + (r % 2 ? 2.8 : 0); x < 13; x += 5.6) {
          c.beginPath();
          c.moveTo(x, r === 0 ? -14 : rows[r - 1] + sag(x));
          c.lineTo(x, r === 3 ? 4 : rows[r] + sag(x));
          c.stroke();
        }
      }
      c.fillStyle = linear(c, 0, -3, 0, 4, [[0, alpha(F.rockDark, 0)], [1, alpha(mix(F.rockDark, SHADE, 0.4), 0.6)]]);
      c.fillRect(-15, -3, 30, 8);
    },
  });
  // верхний ряд камней — кольцо
  solid(g, (c) => pathEllipse(c, 0, -14, 15.4, 5.6), K(mix(F.rock, F.rockLight, 0.45), { shade: 0.5 }), {
    over(c) {
      c.strokeStyle = alpha(outline(F.rock, 0.62), 0.55);
      c.lineWidth = 0.9;
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12 + 0.2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 11, -13.7 + Math.sin(a) * 3.6);
        c.lineTo(Math.cos(a) * 15.6, -14 + Math.sin(a) * 5.8);
        c.stroke();
      }
    },
  });
  // жерло: дальняя стенка в тени и вода с бликом
  const mouth = (c) => pathEllipse(c, 0, -13.7, 11.2, 3.7);
  within(g, mouth, (c) => {
    c.fillStyle = linear(c, 0, -17.4, 0, -10, [[0, '#262e3a'], [0.4, '#33485c'], [0.46, F.waterDeep], [1, F.water]]);
    c.fillRect(-12, -18, 24, 9);
    stroke(c, [[1.6, -12.4], [5, -11.5], [8.4, -12.3]], alpha(F.shine, 0.95), 0.8);
    stroke(c, [[-8, -12.7], [-6, -12], [-4.4, -12.3]], alpha(F.shine, 0.8), 0.7);
  });
  g.strokeStyle = outline(F.rock, 0.7);
  g.lineWidth = 1.2;
  g.beginPath();
  mouth(g);
  g.stroke();
  sparkle(g, 5.6, -12.2, 2, '#ffffff', 0.24);
  // монетка на краю
  g.fillStyle = COLORS.coinDark;
  g.beginPath();
  g.ellipse(9.2, -10.1, 2, 1.15, 0, 0, TAU);
  g.fill();
  g.fillStyle = COLORS.coin;
  g.beginPath();
  g.ellipse(9.2, -10.5, 1.8, 0.95, 0, 0, TAU);
  g.fill();
  // столбы, ворот с верёвкой и ручкой
  capsule(g, -12.6, -15, 1.7, -12.6, -34, 1.6, post);
  capsule(g, 12.6, -15, 1.7, 12.6, -34, 1.6, post);
  capsule(g, -12.6, -27, 1.4, 12.6, -27, 1.4, K(F.wood, { light: '#dcaa72', dark: '#74482a', lw: 1.3 }));
  wraps(g, -1.6, -27, 0, 5, 1.8, TWINE, TWINE_LINE, 1.45, 1);
  cord(g, [[14.2, -27], [17.4, -27], [17.4, -23.4]], '#7a8492', 1.1, '#2f3644', false);
  ball(g, 17.4, -22.8, 1.2, 1.2, K(F.wood, { lw: 1 }));
  // ведёрко висит над жерлом
  cord(g, [[-3, -25.6], [-3, -20.6]], TWINE, 0.8, TWINE_LINE, false);
  solid(g, (c) => pathPoly(c, [[-6.2, -20.6], [0.2, -20.6], [-0.5, -15.4], [-5.5, -15.4]]), K(F.wood, { light: '#dcaa72', dark: '#74482a', lw: 1.3 }), {
    over(c) {
      poly(c, [[-7, -17.8], [1, -17.8]], '#5f6975', 1.1);
      poly(c, [[-3, -20.6], [-3, -15.4]], alpha('#5a3a20', 0.6), 0.6);
    },
  });
  g.fillStyle = '#3a2618';
  g.beginPath();
  g.ellipse(-3, -20.6, 3.1, 0.8, 0, 0, TAU);
  g.fill();
  // крыша из дранки, на ней мох
  solid(g, (c) => {
    c.moveTo(-20, -31.6);
    c.quadraticCurveTo(-15.5, -37, -12.6, -45);
    c.lineTo(12.6, -45);
    c.quadraticCurveTo(15.5, -37, 20, -31.6);
    c.quadraticCurveTo(0, -29.2, -20, -31.6);
    c.closePath();
    return [-20, -45, 20, -30.4];
  }, K('#b85e3e', { light: '#ec9a6c', dark: '#7c3422' }), {
    over(c) {
      c.strokeStyle = alpha('#5a2416', 0.6);
      c.lineWidth = 0.8;
      for (let r = 0; r < 3; r++) {
        const y = -41.4 + r * 4;
        for (let x = -22 + (r % 2 ? 2.2 : 0); x < 22; x += 4.4) {
          c.beginPath();
          c.moveTo(x, y);
          c.quadraticCurveTo(x + 2.2, y + 3.2, x + 4.4, y);
          c.stroke();
        }
      }
      moss(c, -8.6, -43.6, 6.4, 2.4, 351);
      moss(c, 13.4, -33.2, 4, 1.8, 352);
    },
  });
  capsule(g, -13, -45, 1.4, 13, -45, 1.4, K(F.trunk, { light: '#bc8a58', dark: F.trunkDark, lw: 1.4 }));
  moss(g, -10.6, 2, 4.6, 1.6, 353);
  grass(g, -16.8, 2.8, 5.4, 354);
  grass(g, 16.6, 2.4, 4.8, 355);
});

// ---------- кузница ----------

thing('forge', 44, 36, 4, (g) => {
  const iron = K('#5f6975', { light: '#b4bec9', dark: '#2f3644', line: '#1f2430', lw: 1.5 });
  // горн: каменный свод, в устье жар
  const arch = (c) => {
    c.moveTo(9.4, 1.4);
    c.lineTo(9.4, -4.6);
    c.bezierCurveTo(9.4, -10, 17.6, -10, 17.6, -4.6);
    c.lineTo(17.6, 1.4);
    c.closePath();
  };
  solid(g, (c) => pathPoly(c, [[11.2, -19], [15.8, -19], [16.2, -13], [10.8, -13]]), K(F.rockDark, { lw: 1.4 }));
  solid(g, (c) => {
    c.moveTo(5.6, 1.6);
    c.quadraticCurveTo(5, -9, 9.5, -13.2);
    c.quadraticCurveTo(13.5, -16.4, 17.5, -13.2);
    c.quadraticCurveTo(22, -9, 21.4, 1.6);
    c.quadraticCurveTo(13.5, 3.8, 5.6, 1.6);
    c.closePath();
    return [5.4, -15, 21.6, 2.8];
  }, K(F.rockDark, { light: F.rock, dark: darken(F.rockDark, 0.35) }), {
    over(c) {
      // кладка свода
      c.strokeStyle = alpha(outline(F.rockDark, 0.6), 0.6);
      c.lineWidth = 0.9;
      for (const [r, n] of [[7.6, 7], [10.6, 9]]) {
        c.beginPath();
        c.ellipse(13.5, 0, r * 0.74, r, 0, Math.PI, TAU);
        c.stroke();
        for (let i = 1; i < n; i++) {
          const a = Math.PI + (i * Math.PI) / n;
          c.beginPath();
          c.moveTo(13.5 + Math.cos(a) * (r - 3) * 0.74, Math.sin(a) * (r - 3));
          c.lineTo(13.5 + Math.cos(a) * r * 0.74, Math.sin(a) * r);
          c.stroke();
        }
      }
      // отсвет жара на камнях
      glow(c, 13.5, -2, 9, COLORS.fire, 0.4);
    },
  });
  within(g, arch, (c) => {
    c.fillStyle = radial(c, 13.5, -0.6, 8, [[0, '#fffbe0'], [0.3, COLORS.fireLight], [0.62, COLORS.fire], [1, '#b8361a']]);
    c.fillRect(9, -9, 9, 11);
    // угли
    c.fillStyle = '#5a1c14';
    for (const [x, y, r] of [[11, 0.6, 1.5], [13.6, 1, 1.7], [16.2, 0.6, 1.4]]) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    c.fillStyle = COLORS.fireLight;
    for (const [x, y] of [[10.8, -0.2], [13.4, 0.1], [16, -0.2]]) {
      c.beginPath();
      c.ellipse(x, y, 0.9, 0.5, 0, 0, TAU);
      c.fill();
    }
    // язычок пламени
    c.fillStyle = '#fff3c0';
    c.beginPath();
    pathBlob(c, [[11.6, -0.6], [12, -3.6], [13.2, -6.4, 1], [14, -3.8], [15.2, -5, 1], [15.6, -0.8]]);
    c.fill();
  });
  g.strokeStyle = outline(F.rockDark, 0.75);
  g.lineWidth = 1.4;
  g.beginPath();
  arch(g);
  g.stroke();
  groundGlow(g, 13.5, 2.4, 9, 2.6, COLORS.fire, 0.4);
  twinkle(g, 17.6, -20.6, 1.4, '#ffe58a', '#c8501c');
  twinkle(g, 10.6, -22.6, 1, '#ffe58a', '#c8501c');
  // молот прислонён к пню
  capsule(g, -20, 1.4, 0.9, -15.6, -9.4, 0.9, K(F.wood, { lw: 1.1 }));
  capsule(g, -17.8, -9.2, 1.8, -13, -11.2, 1.8, { ...iron, lw: 1.2 });
  // пень-наковальня
  stumpSide(g, -7, 1, -12, 8.6, { seed: 321 });
  cutFace(g, -7, -12, 8.6, 3.2);
  blob(g, [[-12.6, -24.4, 1], [-1, -24.4, 1], [-0.8, -21, 1], [-3.8, -19.8], [-4.8, -17.2], [-2.6, -15, 1], [-2.6, -12.4, 1], [-11, -12.4, 1], [-11, -15, 1], [-8.8, -17.2],
    [-9.8, -19.8], [-12.6, -20.8], [-17.8, -22.8, 1]], iron, {
    over(c) {
      poly(c, [[-16.4, -23.4], [-1.6, -23.4]], alpha('#e6eef6', 0.7), 0.9);
      c.fillStyle = '#1f2430';
      c.fillRect(-4.4, -23.4, 1.5, 1.2);
    },
  });
  // заготовка на наковальне ещё светится
  glow(g, -8.4, -25.4, 4.4, COLORS.fire, 0.55);
  capsule(g, -11.4, -25.4, 0.9, -5.4, -25.4, 0.9, K(COLORS.fireLight, { light: '#fffbe0', dark: COLORS.fire, line: '#b8361a', lw: 0.9, rim: 0 }));
  moss(g, -15, 1.8, 3.6, 1.3, 322);
  grass(g, -1.4, 3, 4.6, 323);
});

// ---------- родник ----------

thing('spring', 44, 30, 4, (g) => {
  // камни позади
  boulder(g, -9.5, -8, 13, 10.4, 331, { moss: 0.6 });
  boulder(g, 13.6, -6.6, 11, 8.6, 333, { cracks: 1 });
  boulder(g, 2.6, -9.4, 15, 13.4, 332, { moss: 0.4 });
  // чаша с водой
  blob(g, [[-15, -3.4], [-11, -7.2], [-3, -8.4], [6, -8], [13, -6.2], [16, -2.4], [12, 0.8], [6, 1.8], [2.6, 3.6], [-1.4, 3.4], [-3.6, 1.8], [-9, 1.4], [-13.5, -0.6]],
    K('#62c4ee', { light: '#d6f4ff', dark: F.waterDeep, line: '#1f5f8f', lw: 1.3, rim: 0.9 }), {
      over(c) {
        groundGlow(c, 1.6, -3, 9, 3.6, F.waterDeep, 0.5);
        // круги от ключа
        c.strokeStyle = alpha('#ffffff', 0.75);
        c.lineWidth = 0.7;
        for (const [rx, ry] of [[5.6, 2], [8.6, 3.1]]) {
          c.beginPath();
          c.ellipse(2, -4.6, rx, ry, 0, 0.3, Math.PI - 0.3);
          c.stroke();
        }
        stroke(c, [[-11.6, -3], [-9.4, -2.2], [-7.6, -2.6]], alpha(F.shine, 0.95), 0.8);
        stroke(c, [[9.6, -1.4], [11.6, -0.9], [13, -1.3]], alpha(F.shine, 0.9), 0.7);
        stroke(c, [[-0.6, 2], [1, 2.6], [2.4, 2.2]], alpha(F.shine, 0.9), 0.7);
      },
    });
  // ключ: вода бьёт бугорком, над ним брызги
  const foam = K('#eaf8ff', { light: '#ffffff', dark: '#9fd8f4', line: '#3b82b8', lw: 0.9 });
  ball(g, 2, -6, 3.5, 2.6, foam);
  ball(g, 1.6, -8.4, 2, 1.7, foam);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#3b82b8';
  g.lineWidth = 0.5;
  for (const [x, y, r] of [[-0.8, -11, 0.8], [3.6, -11.6, 0.9], [1.6, -13.4, 0.7], [5.6, -8.6, 0.6]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.stroke();
  }
  // камни спереди
  boulder(g, -14, 1.2, 9, 5.6, 334, { lw: 1.4, cracks: 0 });
  boulder(g, 12.6, 1.8, 10, 6, 335, { lw: 1.4, cracks: 0, moss: 0.5 });
  boulder(g, 6, 3, 4.4, 2.6, 338, { lw: 1.1, cracks: 0 });
  grass(g, -19.6, 2.6, 5.4, 336);
  grass(g, 19.4, 2.8, 5, 337);
  flower(g, -19, -2.6, '#ff9fb5', 0.9);
  flower(g, 19.2, -3.4, '#fff3a0', 0.9);
  sparkle(g, -5.6, -4.6, 1.5, '#ffffff', 0.24);
});

// ---------- тотем испытания ----------

thing('totem', 30, 56, 4, (g) => {
  const wood = '#a8743e';
  const W = K(wood, { light: '#dba86c', dark: '#6a4424' });
  const groove = mix(wood, INK, 0.66);
  const red = '#c8503c';
  const teal = '#3fa8a0';
  // столб круглый: слева свет, справа тень — кладётся внутри каждой части
  const round = (c, x0, x1, y0, y1) => {
    c.fillStyle = linear(c, x0, 0, x1, 0, [[0, alpha('#f0c890', 0.5)], [0.36, alpha(wood, 0)], [0.6, alpha(wood, 0)], [1, alpha('#4a2c16', 0.78)]]);
    c.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
  };
  // крылья — за столбом
  for (const s of [-1, 1]) {
    blob(g, [[5, -41.4], [10.4, -42.6], [14, -40.8, 1], [13, -37.8], [13.6, -35.2, 1], [11.2, -34], [10.8, -31.8, 1], [5, -32.4]].map(([x, y, k]) => (k ? [x * s, y, 1] : [x * s, y])),
      K(red, { light: '#f08a70', dark: '#8a2c20', lw: 1.3 }), {
        over(c) {
          for (const x of [8.2, 10.6]) poly(c, [[x * s, -43], [(x + 0.8) * s, -31]], alpha('#f3ecdc', 0.9), 0.9);
        },
      });
  }
  // низ: пояс-зигзаг и след лапы
  solid(g, (c) => {
    c.moveTo(-9.6, 1.4);
    c.quadraticCurveTo(-7.4, -1.5, -7.4, -13.4);
    c.lineTo(7.4, -13.4);
    c.quadraticCurveTo(7.4, -1.5, 9.6, 1.4);
    c.quadraticCurveTo(0, 4.2, -9.6, 1.4);
    c.closePath();
    return [-9.6, -13.4, 9.6, 2.8];
  }, W, {
    over(c) {
      round(c, -9.6, 9.6, -14, 4);
      const zig = [];
      for (let i = 0; i <= 8; i++) zig.push([-8 + i * 2, i % 2 ? -8.2 : -11]);
      poly(c, zig, groove, 2.5);
      poly(c, zig, teal, 1.3);
      pawMark(c, 0, -3.4, 0.82, groove);
    },
  });
  // середина: хмурая морда с клыками
  solid(g, (c) => {
    c.moveTo(-8.6, -13.6);
    c.lineTo(-8.6, -27.6);
    c.quadraticCurveTo(-8.6, -30.4, -6, -30.4);
    c.lineTo(6, -30.4);
    c.quadraticCurveTo(8.6, -30.4, 8.6, -27.6);
    c.lineTo(8.6, -13.6);
    c.quadraticCurveTo(0, -11.8, -8.6, -13.6);
    c.closePath();
    return [-8.6, -30.4, 8.6, -12.7];
  }, W, {
    over(c) {
      round(c, -8.6, 8.6, -31, -12);
      c.fillStyle = alpha(red, 0.92);
      c.fillRect(-9, -30.8, 18, 2.8);
      for (const s of [-1, 1]) {
        poly(c, [[7.4 * s, -27], [1.4 * s, -24.6]], groove, 1.8);
        c.fillStyle = groove;
        c.beginPath();
        c.ellipse(4 * s, -23, 2.7, 2.2, 0, 0, TAU);
        c.fill();
        poly(c, [[7.8 * s, -20.4], [5.8 * s, -18.4]], teal, 1.1);
        poly(c, [[7.8 * s, -18], [6 * s, -16.2]], teal, 1.1);
      }
    },
  });
  blob(g, [[-4.2, -21], [0, -22], [4.2, -21], [4.6, -16], [0, -14.8], [-4.6, -16]], K(lighten(wood, 0.24), { lw: 1.2 }), {
    over(c) {
      c.fillStyle = groove;
      c.beginPath();
      pathPoly(c, [[-1.5, -20.6], [1.5, -20.6], [0, -18.8]]);
      c.fill();
      poly(c, [[-3.6, -17.4], [3.6, -17.4]], groove, 0.9);
      c.fillStyle = '#fff6e6';
      for (const s of [-1, 1]) {
        c.beginPath();
        pathPoly(c, [[1.4 * s, -17.4], [3 * s, -17.4], [2.2 * s, -15.2]]);
        c.fill();
      }
    },
  });
  // верх: сова с ушками
  solid(g, (c) => {
    c.moveTo(-7.6, -30.2);
    c.lineTo(-7.6, -41.4);
    c.lineTo(-8.2, -49.4);
    c.lineTo(-3.4, -45);
    c.quadraticCurveTo(0, -46.2, 3.4, -45);
    c.lineTo(8.2, -49.4);
    c.lineTo(7.6, -41.4);
    c.lineTo(7.6, -30.2);
    c.closePath();
    return [-8.2, -49.4, 8.2, -30.2];
  }, W, {
    over(c) {
      round(c, -8.2, 8.2, -50, -30);
      for (const s of [-1, 1]) {
        c.fillStyle = alpha('#f3ecdc', 0.9);
        c.beginPath();
        c.arc(3.4 * s, -38.6, 3.5, 0, TAU);
        c.fill();
        c.strokeStyle = alpha(groove, 0.9);
        c.lineWidth = 0.9;
        c.stroke();
        c.fillStyle = groove;
        c.beginPath();
        c.arc(3.4 * s, -38.6, 2.4, 0, TAU);
        c.fill();
      }
      // пёрышки на груди
      for (const [x, y] of [[-3, -32.6], [0, -32], [3, -32.6]]) poly(c, [[x - 1.1, y - 0.8], [x, y + 0.5], [x + 1.1, y - 0.8]], alpha(groove, 0.8), 0.8);
    },
  });
  solid(g, (c) => pathPoly(c, [[-1.6, -37], [1.6, -37], [0, -33.6]]), K(F.brass, { lw: 1 }));
  // глаза горят
  for (const [x, y, r] of [[-3.4, -38.6, 1.8], [3.4, -38.6, 1.8], [-4, -23, 1.7], [4, -23, 1.7]]) {
    glow(g, x, y, r * 2.7, COLORS.elite, 0.8);
    g.fillStyle = '#ffe58a';
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.25, r * 0.5, 0, TAU);
    g.fill();
  }
  // камни и трава у подножия
  boulder(g, -10.4, 2.4, 7, 4.4, 361, { lw: 1.3, cracks: 0 });
  boulder(g, 10.6, 2.6, 6, 3.6, 362, { lw: 1.3, cracks: 0 });
  grass(g, -5, 3.6, 4.6, 363);
  grass(g, 6, 3.4, 4, 364);
});

// ---------- пень-напёрсточник ----------

// половинка скорлупы грецкого ореха донышком вверх: (x, y) — середина её края
function nutShell(g, x, y, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  solid(g, (c) => {
    c.moveTo(-4, 0);
    c.bezierCurveTo(-4.2, -7.4, 4.2, -7.4, 4, 0);
    c.quadraticCurveTo(0, 1.8, -4, 0);
    c.closePath();
    return [-4.1, -5.6, 4.1, 0.9];
  }, K('#c08a4a', { light: '#f2ca8e', dark: '#7a4a20', line: '#4a2a12', lw: 1.3 }), {
    over(c) {
      // борозды скорлупы
      c.strokeStyle = alpha('#5e3a1c', 0.6);
      c.lineWidth = 0.7;
      for (const dx of [-2.2, 0, 2.2]) {
        c.beginPath();
        c.moveTo(dx * 0.4, -5.4);
        c.quadraticCurveTo(dx * 1.3, -2.6, dx, 0.6);
        c.stroke();
      }
    },
  });
  g.restore();
}

thing('gamble', 40, 30, 4, (g) => {
  const top = -14;
  stumpSide(g, 0, 1, top, 13.4, { seed: 371 });
  cutFace(g, 0, top, 13.4, 4.8);
  moss(g, -10.4, top + 2.6, 3.6, 1.5, 372);
  // тени под скорлупками и горошина под приподнятой
  g.fillStyle = alpha(F.trunkDark, 0.32);
  for (const [x, y, rx] of [[-8, top + 0.9, 4.6], [0.2, top + 2.1, 4.6], [8.8, top + 1.2, 5]]) {
    g.beginPath();
    g.ellipse(x, y, rx, 1.3, 0, 0, TAU);
    g.fill();
  }
  ball(g, 5.6, top + 0.9, 1.5, 1.5, K(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark, lw: 0.9 }));
  nutShell(g, -8.2, top + 0.6, 0);
  nutShell(g, 9, top - 1, 0.42);
  nutShell(g, 0, top + 1.8, 0);
  // ставка: монетки на краю спила
  for (const dy of [0.7, 0]) {
    g.fillStyle = COLORS.coinDark;
    g.beginPath();
    g.ellipse(-4.4, top + 3.6 + dy, 2, 1.1, 0, 0, TAU);
    g.fill();
    g.fillStyle = COLORS.coin;
    g.beginPath();
    g.ellipse(-4.4, top + 3.2 + dy, 1.8, 0.9, 0, 0, TAU);
    g.fill();
  }
  // гриб у корней и трава
  g.fillStyle = '#f3ecdc';
  g.fillRect(15.2, -1.4, 1.8, 3.2);
  solid(g, (c) => {
    c.moveTo(13, -1.2);
    c.bezierCurveTo(13, -5.2, 19.2, -5.2, 19.2, -1.2);
    c.closePath();
    return [13, -4.2, 19.2, -1.2];
  }, K('#d8574a', { lw: 0.9 }));
  g.fillStyle = '#ffffff';
  for (const [x, y, r] of [[15, -2.8, 0.55], [17.2, -2.4, 0.45]]) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  grass(g, -17.4, 2.6, 5, 373);
});

// ---------- палатка привала ----------

thing('tent', 56, 44, 4, (g) => {
  const A = [-5, -31];                                             // вершина спереди
  const line = '#5a4228';
  const hem = '#c2553c';
  // растяжки и колышки
  cord(g, [[-13.6, -16], [-26, 0.6]], TWINE, 0.8, TWINE_LINE, false);
  cord(g, [[15, -27.5], [26.6, -3.6]], TWINE, 0.8, TWINE_LINE, false);
  capsule(g, -26.2, -1.2, 0.9, -25.2, 2, 0.8, K(F.trunk, { lw: 1 }));
  capsule(g, 27, -5.2, 0.9, 26, -2, 0.8, K(F.trunk, { lw: 1 }));
  // скат сбоку — в тени
  solid(g, (c) => {
    c.moveTo(A[0], A[1]);
    c.lineTo(15, -27.5);
    c.quadraticCurveTo(19, -14, 25, -1.4);
    c.quadraticCurveTo(18, 1.2, 11, 1.6);
    c.closePath();
    return [-5, -31, 25, 1.6];
  }, K('#cdb286', { light: '#ecd9b0', dark: '#94784c', line }), {
    over(c, patch) {
      patch((p) => pathPoly(p, [[9, -2.4], [27, -6], [27, 3], [9, 3]]), tone(hem, { dark: '#7a2c20' }));
      // швы и заплатка
      c.strokeStyle = alpha(line, 0.4);
      c.lineWidth = 0.8;
      for (const [x1, x2] of [[4.6, 16], [10.4, 21.4]]) {
        c.beginPath();
        c.moveTo(x1, -29.4);
        c.quadraticCurveTo(x1 + 5, -14, x2, 1);
        c.stroke();
      }
      c.fillStyle = alpha('#a88a5a', 0.9);
      c.beginPath();
      pathPoly(c, [[14.6, -17], [19, -18], [20, -13.4], [15.6, -12.4]]);
      c.fill();
      c.strokeStyle = alpha('#fff6e0', 0.9);
      c.lineWidth = 0.6;
      c.setLineDash([1, 1.2]);
      c.stroke();
      c.setLineDash([]);
    },
  });
  // передняя стенка
  solid(g, (c) => {
    c.moveTo(A[0], A[1]);
    c.quadraticCurveTo(4, -14, 11, 1.6);
    c.quadraticCurveTo(-6, 3.8, -23, 1.6);
    c.quadraticCurveTo(-15.6, -14, A[0], A[1]);
    c.closePath();
    return [-23, -31, 11, 2.7];
  }, K('#ecd9b0', { light: '#fff8e4', dark: '#bfa070', line }), {
    over(c, patch) {
      patch([[-24, -2.4], [-6, -0.2], [12, -2.4], [12, 5], [-24, 5]], tone(hem, { dark: '#7a2c20' }));
      // вход: внутри темно и тепло
      c.fillStyle = '#33241c';
      c.beginPath();
      pathPoly(c, [[-5.6, -23], [-13, 3.4], [1.6, 3.4]]);
      c.fill();
      groundGlow(c, -5.8, 2, 7, 5, '#ffb057', 0.55);
    },
  });
  // откинутые полы
  const flap = K('#f6e8c8', { light: '#fffdf2', dark: '#cdb286', line, lw: 1.3 });
  blob(g, [[-5.6, -23, 1], [-11.8, -11.6], [-17.2, -5, 1], [-14.4, -1.2], [-13, 2.2, 1], [-11, -8]], flap);
  blob(g, [[-5.6, -23, 1], [-1, -11.6], [5.6, -5, 1], [3, -1.2], [1.6, 2.2, 1], [0.2, -8]], flap);
  for (const x of [-17, 5.4]) {
    g.fillStyle = TWINE_LINE;
    g.beginPath();
    g.arc(x, -5, 1, 0, TAU);
    g.fill();
  }
  // шест с флажком
  capsule(g, A[0], A[1] + 1.4, 0.9, A[0], -38.4, 0.8, K(F.trunk, { lw: 1.2 }));
  blob(g, [[-4.4, -38.6, 1], [0.6, -39.2], [5.8, -37.8, 1], [3.2, -36.2, 1], [5.6, -34.4, 1], [0.4, -35.1], [-4.4, -33.9, 1]], K(F.berry, { light: '#ff8e7a', dark: '#a3212c', lw: 1.2 }));
  g.fillStyle = '#fff6e6';
  g.beginPath();
  g.arc(-1.4, -36.5, 1.1, 0, TAU);
  g.fill();
  // копьё и щит наёмников
  capsule(g, 24.2, 1.6, 0.8, 21.4, -18.6, 0.7, K(F.wood, { lw: 1.1 }));
  solid(g, (c) => pathPoly(c, [[19.9, -18.4], [20.8, -24.4], [22.9, -18.8]]), K('#b4bec9', { light: '#f4f7fa', dark: '#66717f', lw: 1.1 }));
  ball(g, 18, -5.2, 6.2, 6.2, K(F.wood, { light: '#dcaa72', dark: '#74482a', lw: 1.4 }));
  ball(g, 18, -5.2, 4.5, 4.5, K(F.berry, { light: '#ff8e7a', dark: '#a3212c', lw: 1 }), {
    over(c) {
      pawMark(c, 18, -5.4, 0.62, '#fff6e6');
    },
  });
  // скатка у входа
  capsule(g, -22, -0.4, 2.3, -16.6, 0.2, 2.3, K('#3fa8a0', { lw: 1.3 }), {
    over(c) {
      for (const x of [-20.4, -17.6]) poly(c, [[x, -3.4], [x + 0.4, 3.4]], alpha(TWINE, 0.95), 0.9);
    },
  });
  grass(g, 26.4, 2.6, 4.6, 381);
  grass(g, -24.2, 3.4, 4, 382);
});
