// Враги леса и болота, хозяева этих двух мест и «напасти» — фигуры «Лисьей охоты»: ёж, кабан, оса, ворон;
// жаба, гадюка, комар, гриб-споровик; медведь-хозяин и царь-жаба; медвежья лапа, что бьёт с неба. Без DOM.
// (Бегущий лось — вторая напасть — нарисован вместе с лосем-великаном, в art-mobs2.js: это одна фигура.)
//
// Устроены как лиса (art-fox.js): части запекаются один раз, поза каждый кадр расставляет их заново. Оси фигуры:
// (0, 0) — середина ступней (у летающих — низ зверька: на высоту его поднимает рендер), x — вперёд по взгляду,
// y — вниз; отражение влево делает рендер. Позы — из общего списка: появление, стойка, ход, замах, удар,
// передышка, оглушение, боль и свои у каждого; незнакомая поза — стойка.
//
// Главное в каждом враге — замах: он держится всё время предупреждения, поэтому зверь в нём меняет силуэт, а не
// просто дрожит (кабан опускает голову и роет землю, жаба раздувает горло, гадюка встаёт столбом, гриб пухнет и
// светится, медведь поднимается на дыбы с лапой над головой). k в замахе — насколько близок удар.
//
// Выражение мордочки — вариант картинки головы (или тела, если голова с ним заодно): 0 — хмурый, 1 — моргнул,
// 2 — больно, 3 — оглушён, дальше — свои (раскрытая пасть, надутые щёки). Так на зверя уходит 5–7 картинок в кадр.
// Куда бить, фигура знает только по высоте (a.aim): вид сбоку, а лицом к цели зверя ставит рендер.

import { defineRig } from './art.js';
import {
  TAU, INK, COLORS, clamp, clamp01, lerp, smooth, easeOut, backOut, bump, num, alpha, darken, mix, outline, tone,
  definePart, solid, blob, egg, ball, capsule, limb, pathBlob, pathBlobSpan, pathEllipse, pathPoly, tufts, tuftsArc,
  stroke, fur, fadeEdge, within, glow, speck, radial, eye, nose, blush,
} from './art-kit.js';
// медведь собран на общем скелете четвероногих — как волк и росомаха
import {
  TONGUE, CALM, SNARL, BITE, DIZZY, HURT, FACES, BX, BY, BR, BSY, HX, HY, HR, TR, TS, L1, K1, G1, ARM,
  put as beastPut, atX as beastX, atY as beastY, loop, fang, fierceEye, earAxes, earRound, earInside, farEar, jawOpen, lips, furTones,
  beastIdle, beastCommon, beastRig, legPart, tailPart, tailJoint,
} from './art-mobs2.js';

/**
 * Что умеют фигуры этого файла: acts — позы (их показывает лист рисунков и проверяет тест), w × h — рамка, в которую
 * фигура помещается в любой позе (единицы мира; у жаб — вместе с языком), shadow — ширина тени под ней
 * (0 — тень фигура рисует сама: лапа падает с высоты, и тень растёт вместе с ней).
 */
export const RIG_INFO = {};

const COMMON = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
const BOSS = [...COMMON, 'tired', 'dead'];

function rig(id, acts, w, h, shadow, draw) {
  defineRig(id, { draw });
  RIG_INFO[id] = { acts, w, h, shadow };
}

// ---------- общее: вся фигура разом ----------
// Сдвиг, поворот и растяжение вокруг выбранной точки, прозрачность — через них сделано общее для всех: появление
// из метки, отдача от удара, качание оглушённого. put() ставит часть уже с их учётом.

let gx = 0;
let gy = 0;
let gc = 1;
let gn = 0;
let grot = 0;
let gsx = 1;
let gsy = 1;
let ga = 1;

function whole(x, y, rot, sx, sy, a, px, py) {
  gc = Math.cos(rot);
  gn = Math.sin(rot);
  grot = rot;
  gsx = sx;
  gsy = sy;
  ga = clamp01(a);
  gx = x + px - (px * sx * gc - py * sy * gn);
  gy = y + py - (px * sx * gn + py * sy * gc);
}

// точка фигуры после общего сдвига — для простых линий в кадре (язык жабы)
const outX = (x, y) => gx + x * gsx * gc - y * gsy * gn;
const outY = (x, y) => gy + x * gsx * gn + y * gsy * gc;

/** Поставить часть: (x, y) и поворот — в осях фигуры, v — вариант картинки, a — прозрачность. */
function put(kit, ctx, key, x, y, rot = 0, sx = 1, sy = 1, v = 0, a = 1) {
  kit.part(ctx, key, outX(x, y), outY(x, y), rot + grot, sx * gsx, sy * gsy, clamp01(a) * ga, v);
}

// добавки к позе всей фигуры: их набирает поза, а settle() применяет
let fx = 0;
let fy = 0;
let fr = 0;
let fsx = 1;
let fsy = 1;
let fa = 1;

function calm() {
  fx = 0;
  fy = 0;
  fr = 0;
  fsx = 1;
  fsy = 1;
  fa = 1;
}

/** Появление из метки на земле: вырастает от ступней и проявляется (k: 0 → 1). */
function appear(k) {
  const u = backOut(k);
  fsx = 0.4 + 0.6 * u;
  fsy = 0.25 + 0.75 * u;
  fa = smooth(k / 0.4);
}

/** Отдача от удара: откинуло назад и вернуло (k: 0 → 1). */
function recoil(k, push, lean) {
  const q = (1 - k) * (1 - k);
  fx -= push * q;
  fy -= push * 0.35 * q;
  fr -= lean * q;
}

/** Применить набранное; (px, py) — вокруг какой точки фигуры вертеть и растягивать (у летающих — середина тела). */
const settle = (px = 0, py = 0) => whole(fx, fy, fr, fsx, fsy, fa, px, py);

// опорная часть (тело): её середина, наклон и растяжение — от них считаются крепления остальных частей
let ox = 0;
let oy = 0;
let oc = 1;
let os = 0;
let osx = 1;
let osy = 1;

function frame(x, y, rot = 0, sx = 1, sy = 1) {
  ox = x;
  oy = y;
  oc = Math.cos(rot);
  os = Math.sin(rot);
  osx = sx;
  osy = sy;
}
const atX = (x, y) => ox + x * osx * oc - y * osy * os;
const atY = (x, y) => oy + x * osx * os + y * osy * oc;

/** Во сколько раз вытянуть лапу длиной len (сустав на высоте y, поворот rot), чтобы она стояла на земле. */
const stand = (y, len, rot) => clamp(-y / (len * Math.max(0.4, Math.cos(rot))), 0.55, 1.3);

/** Короткий взмах раз в period секунд: 0 … 1 … 0 за len секунд. */
function flick(t, period, shift, len = 0.2) {
  const u = (((t + shift) % period) + period) % period;
  return u < len ? Math.sin((u / len) * Math.PI) : 0;
}

/** Моргает: раз в несколько секунд, изредка — дважды подряд. */
const blinks = (t) => flick(t, 3.7, 0.4, 0.13) > 0 || flick(t, 8.9, 4.6, 0.12) > 0;

/** Выпад: быстро вперёд (до доли peak) и плавно назад. */
const lunge = (k, peak = 0.3) => (k < peak ? easeOut(k / peak) : 1 - smooth((k - peak) / (1 - peak)));

/** Куда бить по высоте: вид сбоку, поэтому от прицела остаётся только доля «вверх-вниз». */
function aimTilt(a) {
  const aim = num(a.aim);
  return clamp(Math.atan2(Math.sin(aim), Math.abs(Math.cos(aim))), -1.2, 1.2);
}

// ---------- общее: мелочи рисунка ----------

function dot(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
}

function tri(g, x1, y1, x2, y2, x3, y3, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.fill();
}

/** Краска дальней стороны (лапа и крыло за телом): тоном темнее, обводка та же. */
const farOf = (look, base, dark) => tone(mix(base, dark, 0.76), { light: base, dark: darken(dark, 0.3), line: look.line, lw: look.lw * 0.9, rim: 0.22 });

/**
 * Тёмный глаз врага по номеру выражения: 0 — хмурый прищур с бровью, 1 — моргнул, 2 — «>» от боли, 3 — крестик.
 * o: brow — цвет брови, lid и slant — как у eye(); flip — глаз дальней стороны (бровь к носу — зеркально).
 */
function mobEye(g, x, y, r, v, o = {}) {
  g.save();
  g.translate(x, y);
  if (o.flip) g.scale(-1, 1);
  if (v === 1) eye(g, 0, 0, r, { kind: 'closed', color: o.color });
  else if (v === 2) eye(g, 0, 0, r, { kind: 'squint', color: o.color });
  else if (v === 3) eye(g, 0, 0, r, { kind: 'cross', color: o.color });
  else eye(g, 0, 0, r, { kind: 'narrow', lid: o.lid ?? 0.32, slant: o.slant ?? 0.3, brow: o.brow, color: o.color });
  g.restore();
}

/**
 * Светлый глаз с тёмным зрачком — у тёмных зверей (на чёрной голове тёмного глаза не видно) и у холоднокровных.
 * o: iris — цвет глаза, lid — цвет века (шкуры), pupil — 'round' | 'slit' (щель, змея) | 'bar' (полоска, жаба),
 * cover — насколько веко срезает глаз сверху (0…1), slant — наклон века к носу. v — выражение, как у mobEye.
 */
function brightEye(g, x, y, r, v, o) {
  const line = o.line ?? '#2a1a22';
  const ry = r * 0.92;
  const shut = v === 1 || v === 2;
  dot(g, x, y, r, ry, shut ? o.lid : o.iris);
  if (shut) eye(g, x, y, r * 0.78, { kind: v === 1 ? 'closed' : 'squint', color: line });
  else if (v === 3) eye(g, x, y, r * 0.72, { kind: 'cross', color: line });
  else {
    g.fillStyle = line;
    g.beginPath();
    if (o.pupil === 'slit') g.ellipse(x + r * 0.12, y + r * 0.1, r * 0.25, r * 0.74, 0, 0, TAU);
    else if (o.pupil === 'bar') g.ellipse(x + r * 0.1, y + r * 0.14, r * 0.62, r * 0.36, 0, 0, TAU);
    else g.arc(x + r * 0.14, y + r * 0.12, r * 0.5, 0, TAU);
    g.fill();
    // хмурое веко срезает глаз сверху наискось; по его краю — тёмная линия вместо брови
    const cut = -r + 2 * r * (o.cover ?? 0.32);
    within(g, (c) => pathEllipse(c, x, y, r, ry), (c) => {
      c.translate(x, y);
      c.rotate(o.slant ?? 0.3);
      c.fillStyle = o.lid;
      c.fillRect(-r * 2, -r * 3, r * 4, r * 3 + cut);
      c.fillStyle = line;
      c.fillRect(-r * 2, cut - r * 0.13, r * 4, r * 0.26);
    });
    speck(g, x - r * 0.34, y + r * 0.22, r * 0.2, 0.95);
  }
  g.strokeStyle = line;
  g.lineWidth = Math.max(0.5, r * 0.2);
  g.beginPath();
  g.ellipse(x, y, r, ry, 0, 0, TAU);
  g.stroke();
}

// ---------- ёж ----------
// Колючий купол с кремовой мордочкой. Идёт — его можно бить; свернулся (curl) — шар из игл, рывок в него бьёт лису.

const HOG = { quill: '#6b4a36', light: '#a67d58', dark: '#3e2a20', tip: '#ecd6ae', face: '#f3dab0', faceDark: '#caa477', foot: '#c89b70', ear: '#eba58c' };
const quill = tone(HOG.quill, { light: HOG.light, dark: HOG.dark, lw: 1.1 });
const hogFace = tone(HOG.face, { dark: HOG.faceDark, line: quill.line, lw: 1 });

// штрихи-иглы внутри колючей шубы: ряды дужек по кругу, зачёсанные назад; rings — [[радиус, сколько, длина], …]
function quillMarks(cx, cy, rings, from, to) {
  const out = [];
  for (const [r, n, len] of rings) {
    for (let i = 0; i < n; i++) {
      const an = from + ((i + 0.5) / n) * (to - from);
      out.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r, an - 0.45, len]);
    }
  }
  return out;
}

// шуба: купол с зубцами игл от крупа до лба; сустав — середина тела. Голова рисуется под ней — иглы нависают надо лбом
definePart('mob.hedgehog.body', [-10.6, -9, 9, 5.8], (g) => {
  const a0 = Math.PI - 0.42;
  const a1 = TAU - 0.5;
  const at = (an) => [Math.cos(an) * 7, 1.4 + Math.sin(an) * 7];
  blob(g, [[...at(a0), 1], ...tuftsArc(0, 1.4, 7, a0, a1, 8, 2.6, -0.5), [...at(a1), 1], [5.9, 1.2], [4.4, 4.3], [0, 4.9], [-4.4, 4.8]], quill, {
    over(c) {
      fur(c, quillMarks(0, 1.4, [[2.4, 3, 2], [4.9, 6, 2.2]], Math.PI * 0.98, TAU - 0.55), alpha(HOG.tip, 0.8), 0.7);
    },
  });
  // ухо у переднего края шубы
  ball(g, 4.5, -1.5, 1.5, 1.5, { ...hogFace, lw: 0.8 }, { over: (c) => dot(c, 4.7, -1.4, 0.75, 0.75, HOG.ear) });
});

// мордочка: вытянутый нос кверху; сустав — шея
definePart('mob.hedgehog.head', [-4.4, -4.2, 7.9, 3.9], (g, v) => {
  blob(g, [[-3.2, -1.6], [-1, -3], [1.6, -2.7], [3.6, -1.4], [5.3, -0.3], [5.8, 0.8], [4.3, 1.9], [1.7, 2.6], [-1.4, 2.8], [-3.3, 1.4]], hogFace, {
    over(c) {
      blush(c, 0.6, 1.2, 1.6, '#ff8f8a', 0.45);
      stroke(c, [[4.9, 1.5], [3.7, 1.95], [2.7, 1.5]], alpha(HOG.dark, 0.85), 0.7);
    },
  });
  mobEye(g, 1.9, -0.7, 1.3, v, { brow: HOG.dark, slant: 0.32 });
  nose(g, 5.9, 0.2, 1.05);
}, 4);

// лапка: 0 — ближняя, 1 — дальняя
definePart('mob.hedgehog.foot', [-1.8, -1.6, 3.2, 2], (g, v) => {
  capsule(g, 0, 0, 1.15, 1.5, 0.35, 0.95, tone(v ? mix(HOG.foot, HOG.dark, 0.45) : HOG.foot, { line: quill.line, lw: 0.9, rim: v ? 0.2 : 0.5 }));
}, 2);

// свернулся: шар, иглы торчат во все стороны; спрятанная мордочка показывает, что он катится
definePart('mob.hedgehog.ball', [-9, -9, 9, 9], (g) => {
  blob(g, [[5.4, 0, 1], ...tuftsArc(0, 0, 5.4, 0, TAU, 13, 2.9, 0.45)], quill, {
    over(c, patch) {
      fur(c, quillMarks(0, 0, [[1.9, 4, 1.8], [3.9, 9, 2]], 0, TAU), alpha(HOG.tip, 0.8), 0.7);
      patch((p) => pathEllipse(p, 2.9, 1.7, 2.5, 2), hogFace);
      eye(c, 2.5, 1.3, 1, { kind: 'closed', color: HOG.dark });
      dot(c, 4.5, 2.2, 0.75, 0.75, '#2a1a16');
    },
  });
});

const HOG_BODY = [-1.5, -6.2];                                     // середина тела в осях фигуры
const HOG_NECK = [5.9, 1.2];                                       // шея — от середины тела
const HOG_FEET = [[2.6, -1.6], [-5.2, -1.6], [4, -1.8], [-3.7, -1.8]];   // ближние: передняя, задняя; дальние

function drawHedgehog(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = blinks(t) ? 1 : 0;
  let by = 0;            // тело: выше-ниже, наклон, растяжение
  let br = 0;
  let bsx = 1;
  let bsy = 1;
  let hx = 0;            // голова от шеи
  let hy = 0;
  let hr = Math.sin(t * 7) * 0.04;
  let step = 0;          // размах шага
  let ph = 0;
  let curled = false;
  let spin = 0;
  let squash = 1;
  switch (a.act) {
    case 'move':
      ph = t * 15;
      step = 0.5 + 0.5 * clamp01(num(a.speed, 1));
      by = -Math.abs(Math.sin(ph)) * 0.5;
      br = Math.sin(ph) * 0.04;
      hr = Math.sin(ph * 2 - 0.6) * 0.05;
      break;
    case 'windup': {
      // втягивает голову и топорщит иглы: сейчас свернётся
      const q = smooth(k / 0.7);
      hx = -2.4 * q;
      hy = 1.1 * q;
      hr = 0.5 * q;
      bsx = 1 + 0.06 * q;
      bsy = 1 + 0.18 * q;
      br = 0.12 * q;
      fx = Math.sin(t * 62) * 0.35 * (0.3 + 0.7 * k);
      face = 1;
      break;
    }
    case 'curl':
      curled = true;
      spin = t * 9.5;
      fy = -Math.abs(Math.sin(t * 9.5)) * 1.1;
      break;
    case 'attack': {
      // колется: иглы дыбом, короткий выпад
      const u = lunge(k, 0.25);
      bsx = 1 + 0.14 * u;
      bsy = 1 + 0.26 * u;
      fx = 2.4 * u;
      hx = u;
      hr = -0.12 * u;
      break;
    }
    case 'recover':
      // разворачивается: шар оседает, потом зверёк встаёт и отдувается
      if (k < 0.3) {
        curled = true;
        squash = 1 - 0.18 * smooth(k / 0.3);
        spin = 0.5 * (1 - k / 0.3);
      } else {
        const u = backOut((k - 0.3) / 0.7);
        bsy = 0.72 + 0.28 * u;
        bsx = 1.16 - 0.16 * u;
        hx = -1.6 * (1 - u);
        hr = 0.3 * (1 - u);
        if (k < 0.65) face = 1;
      }
      break;
    case 'stun':
      face = 3;
      fr = Math.sin(t * 6) * 0.07;
      hr = 0.22 + Math.sin(t * 6 + 1.2) * 0.12;
      hy = 0.7;
      bsy = 0.95;
      break;
    case 'hurt':
      recoil(k, 2.4, 0.22);
      if (k < 0.8) face = 2;
      break;
    case 'spawn':
      appear(k);
      break;
    default: {
      // стоит: дышит и принюхивается
      const breath = Math.sin(t * 3.1);
      bsy = 1 + breath * 0.03;
      hy = -breath * 0.12;
    }
  }
  settle();
  if (curled) {
    put(kit, ctx, 'mob.hedgehog.ball', 0, -8.3 * squash, spin, 1 + (1 - squash) * 0.6, squash);
    return;
  }
  frame(HOG_BODY[0], HOG_BODY[1] + by, br, bsx, bsy);
  for (let i = 3; i >= 0; i--) {
    // ближние лапки — поверх тела, дальние — под ним; шагают накрест
    if (i === 1) {
      put(kit, ctx, 'mob.hedgehog.head', atX(HOG_NECK[0], HOG_NECK[1]) + hx, atY(HOG_NECK[0], HOG_NECK[1]) + hy, br * 0.5 + hr, 1, 1, face);
      put(kit, ctx, 'mob.hedgehog.body', ox, oy, br, bsx, bsy);
    }
    const p = ph + (i === 0 || i === 3 ? 0 : Math.PI);
    put(kit, ctx, 'mob.hedgehog.foot', HOG_FEET[i][0] + Math.sin(p) * 1.3 * step, HOG_FEET[i][1] - Math.max(0, Math.cos(p)) * 0.9 * step,
      Math.sin(p) * 0.3 * step, 1, 1, i > 1 ? 1 : 0);
  }
}
rig('hedgehog', [...COMMON, 'curl'], 40, 30, 16, drawHedgehog);

// ---------- кабан ----------
// Бочонок на коротких ногах: высокий загривок со щетиной, тяжёлая голова с рылом и клыками. Замах — опускает
// голову и роет землю копытом; charge — несётся прыжками, рыло у земли.

const BOAR = { coat: '#7c5b4c', light: '#ab8672', dark: '#4f382f', mane: '#3f2c27', snout: '#dba48f', snoutDark: '#b3735f', tusk: '#fff5de', hoof: '#2f2220', ear: '#c98a7a' };
const boarCoat = tone(BOAR.coat, { light: BOAR.light, dark: BOAR.dark, lw: 1.4 });
const boarFar = farOf(boarCoat, BOAR.coat, BOAR.dark);
const boarMane = tone(BOAR.mane, { light: '#6a4c42', dark: '#261a18', line: boarCoat.line });
const boarSnout = tone(BOAR.snout, { dark: BOAR.snoutDark, line: boarCoat.line });
const boarTusk = tone(BOAR.tusk, { dark: '#d9c39a', line: boarCoat.line, lw: 0.9 });

// тело: круп слева, загривок справа и выше; щетина по хребту
definePart('mob.boar.body', [-13.6, -12.6, 14, 9], (g) => {
  blob(g, [[-12.4, -1.5], [-10.6, -6], [-8.5, -7.6, 1], ...tufts(-8.5, -7.6, 8.2, -9.4, 6, 2.3, -0.5), [8.2, -9.4, 1], [11.6, -6.6], [12.8, -1.5], [11, 4.5], [5, 7.6], [-4, 7.8], [-10.5, 5.2]], boarCoat, {
    over(c, patch) {
      patch([[-14, -4.2], [-7, -5.6], [1, -6.6], [8, -6.2], [14, -4.4], [14, -14], [-14, -14]], boarMane);
      glow(c, 0.5, 5, 6.5, BOAR.light, 0.4);
      fur(c, [[-5, -1, 0.5, 3], [1.5, 0.8, 0.4, 3], [-8.4, 2, 0.6, 2.6], [6.4, -1.6, 0.35, 2.8], [-1, 4, 0.3, 2.6]], alpha(BOAR.dark, 0.6), 0.8);
    },
  });
});

// голова: клин с рылом; сустав — шея
definePart('mob.boar.head', [-6.6, -9.8, 15.2, 7.8], (g, v) => {
  // дальний клык выглядывает из-за рыла
  blob(g, [[9.2, 0.4], [10.1, -3.2, 1], [11.3, 0.6]], { ...boarTusk, lw: 0.8 });
  // ухо
  blob(g, [[-3.8, -3.6], [-2.4, -8.6, 1], [0.6, -5], [-0.8, -3.2]], { ...boarMane, lw: 1.1 }, {
    over: (c) => stroke(c, [[-2.3, -7], [-1.4, -4.6]], alpha(BOAR.ear, 0.9), 0.9),
  });
  blob(g, [[-4.5, -4.6], [0, -6.2], [4, -4.7], [8, -1.8], [11.6, 0.1], [12.6, 2.4], [12.4, 4.6], [8.4, 6], [3, 6.6], [-2.6, 5.4], [-5.4, 1]], boarCoat, {
    over(c, patch) {
      patch([[6.4, -1.4], [9.4, -0.6], [14, 0], [14, 8], [6, 8], [5.4, 3]], boarSnout);
      glow(c, -1.5, -3.6, 4, BOAR.mane, 0.5);                  // тёмный лоб — щетина с загривка
      blush(c, 2.4, 3.4, 2.2, '#ff8f8a', 0.35);
      stroke(c, [[11.9, 4.3], [9, 4.9], [6.6, 4.3]], alpha(BOAR.mane, 0.9), 0.8);
    },
  });
  mobEye(g, 3.5, -1.4, 1.55, v, { brow: BOAR.mane, slant: 0.36, lid: 0.36, color: '#2a1414' });
  // пятачок
  ball(g, 12.5, 2.3, 1.45, 2.2, tone(BOAR.snoutDark, { light: BOAR.snout, dark: '#8a4f42', line: boarCoat.line, lw: 1 }), {
    over(c) {
      dot(c, 12.6, 1.5, 0.4, 0.55, '#5a2a26');
      dot(c, 12.7, 3.2, 0.4, 0.55, '#5a2a26');
    },
  });
  // ближний клык: из угла пасти вверх
  blob(g, [[8.2, 4.9], [8.9, 2.2], [10.4, -0.9, 1], [10.8, 2.4], [10.2, 5.2]], boarTusk);
}, 4);

// нога с копытом: 0 — ближняя (вверху растворяется в теле), 1 — дальняя; сустав — вверху
const BOAR_LEG = 7.3;
definePart('mob.boar.leg', [-3.6, -3.4, 3.8, 7.8], (g, v) => {
  limb(g, 0, 0, 2.3, 0.3, 5, 1.7, v ? boarFar : { ...boarCoat, lw: 1.2 }, {
    over: (c, patch) => patch([[-4, 4.5], [0, 4.1], [4, 4.5], [4, 9], [-4, 9]], tone(BOAR.hoof, { light: '#5a4440', dark: '#1c1414' })),
  });
  if (!v) fadeEdge(g, 0, -1.2, 0, 1.6);
}, 2);

// хвост с кисточкой; сустав — основание
definePart('mob.boar.tail', [-7, -5.8, 1.8, 1.8], (g) => {
  limb(g, 0, 0, 1, -3.4, -2.4, 0.7, { ...boarCoat, lw: 1 });
  blob(g, [[-2.9, -2], [-4.2, -4.6, 1], [-4.5, -2.8], [-6.2, -3, 1], [-4.5, -1.6], [-5.2, -0.2, 1], [-3.3, -1.3]], { ...boarMane, lw: 0.9 });
});

const BOAR_BODY = [-3.5, -12.5];
// от середины тела: шея, хвост и четыре ноги — ближняя передняя, дальняя передняя, ближняя задняя, дальняя задняя
const BOAR_NECK = [10.5, -2.5];
const BOAR_TAIL = [-12, -3];
const BOAR_HIPS = [[8.7, 5.2], [10.9, 5], [-7.1, 5.2], [-5.3, 5]];
const BL = new Float32Array(4);          // повороты ног (минус — вперёд)
const BK = new Float32Array(4);          // и их длина

function boarLeg(kit, ctx, i, ground) {
  const y = atY(BOAR_HIPS[i][0], BOAR_HIPS[i][1]);
  put(kit, ctx, 'mob.boar.leg', atX(BOAR_HIPS[i][0], BOAR_HIPS[i][1]), y, BL[i], 1, BK[i] * lerp(1, stand(y, BOAR_LEG, BL[i]), ground), i % 2);
}

function drawBoar(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = blinks(t + 0.9) ? 1 : 0;
  let bx = 0;
  let by = 0;
  let br = 0;
  let bsx = 1;
  let bsy = 1;
  let hx = 0;
  let hy = 0;
  let hr = 0;
  let tail = 0.3 + Math.sin(t * 3.3) * 0.25;
  let ground = 1;        // ноги стоят на земле: 1 — дотягиваются сами
  BL.fill(0);
  BK.fill(1);
  switch (a.act) {
    case 'move': {
      // рысь: ноги накрест
      const ph = t * 13;
      const s = 0.5 + 0.5 * clamp01(num(a.speed, 1));
      for (let i = 0; i < 4; i++) {
        const p = ph + (i === 0 || i === 3 ? 0 : Math.PI);
        BL[i] = -Math.sin(p) * 0.5 * s;
        BK[i] = 1 - 0.25 * Math.max(0, Math.cos(p)) * s;
      }
      by = -Math.abs(Math.sin(ph)) * 0.7 * s;
      br = Math.sin(ph * 2 + 0.5) * 0.025;
      hr = 0.06 + Math.sin(ph * 2 - 1) * 0.04;
      hy = Math.sin(ph * 2 - 0.8) * 0.4;
      tail = -0.2 + Math.sin(ph) * 0.4;
      break;
    }
    case 'windup': {
      // голова к земле, копыто роет землю, всё тело подаётся назад
      const q = smooth(k / 0.3);
      const scrape = t * 17;
      bx = -1.2 * q - 1.8 * k;
      by = 0.9 * q;
      br = 0.13 * q;
      hr = 0.52 * q;
      hy = 2.4 * q;
      hx = -0.4 * q;
      BL[0] = (Math.sin(scrape) * 0.6 - 0.15) * q;
      BK[0] = 1 - 0.22 * Math.max(0, Math.cos(scrape)) * q;
      BL[2] = 0.18 * q;
      BL[3] = 0.12 * q;
      fx = Math.sin(t * 58) * 0.3 * k;
      tail = -0.9;
      break;
    }
    case 'charge': {
      // несётся: передние и задние ноги ходят парами, рыло у земли
      const ph = t * 21;
      BL[0] = -Math.sin(ph) * 0.8 - 0.1;
      BL[1] = -Math.sin(ph - 0.5) * 0.8 - 0.1;
      BL[2] = Math.sin(ph - 0.3) * 0.8 + 0.1;
      BL[3] = Math.sin(ph - 0.8) * 0.8 + 0.1;
      BK.fill(1.05);
      ground = 0;
      by = -1.2 - Math.abs(Math.sin(ph)) * 1.4;
      br = 0.06 + Math.sin(ph) * 0.08;
      bsx = 1.07;
      bsy = 0.96;
      hr = 0.34 + Math.sin(ph - 1) * 0.05;
      hy = 1.8;
      hx = 1.4;
      tail = -0.5 + Math.sin(t * 40) * 0.1;
      break;
    }
    case 'attack': {
      // поддевает клыками: голова снизу вверх
      const u = lunge(k, 0.3);
      hr = 0.45 - u;
      hx = 2.6 * u;
      hy = 1.6 - 3.2 * u;
      bx = 2.5 * u;
      br = -0.06 * u;
      break;
    }
    case 'recover': {
      // отдувается, голова висит
      const q = 1 - smooth(k);
      bsy = 1 + Math.sin(t * 11) * 0.035 * q;
      hr = 0.32 * q;
      hy = 1.6 * q;
      by = 0.5 * q;
      break;
    }
    case 'stun':
      // врезался: ноги разъехались, голова мотается
      face = 3;
      by = 2;
      BL[0] = -0.45;
      BL[1] = -0.35;
      BL[2] = 0.45;
      BL[3] = 0.35;
      hr = 0.4 + Math.sin(t * 5.2) * 0.14;
      hy = 1.5;
      fr = Math.sin(t * 5.2 + 0.8) * 0.035;
      tail = 0.8;
      break;
    case 'hurt':
      recoil(k, 2.6, 0.14);
      if (k < 0.8) face = 2;
      break;
    case 'spawn':
      appear(k);
      break;
    default: {
      const breath = Math.sin(t * 2.6);
      bsy = 1 + breath * 0.025;
      hy = -breath * 0.2;
      hr = Math.sin(t * 1.3) * 0.05;
    }
  }
  settle();
  frame(BOAR_BODY[0] + bx, BOAR_BODY[1] + by, br, bsx, bsy);
  put(kit, ctx, 'mob.boar.tail', atX(BOAR_TAIL[0], BOAR_TAIL[1]), atY(BOAR_TAIL[0], BOAR_TAIL[1]), br + tail);
  boarLeg(kit, ctx, 3, ground);
  boarLeg(kit, ctx, 1, ground);
  put(kit, ctx, 'mob.boar.body', ox, oy, br, bsx, bsy);
  boarLeg(kit, ctx, 2, ground);
  boarLeg(kit, ctx, 0, ground);
  put(kit, ctx, 'mob.boar.head', atX(BOAR_NECK[0], BOAR_NECK[1]) + hx, atY(BOAR_NECK[0], BOAR_NECK[1]) + hy, br * 0.6 + hr, 1, 1, face);
}
rig('boar', [...COMMON, 'charge'], 64, 44, 27, drawBoar);

// ---------- крылья насекомых ----------
// Общие для осы и комара: 0 — одно крыло (видно, когда насекомое оглушено), 1 — размытый веер взмаха.
definePart('mob.bug.wing', [-5.2, -7.4, 5.2, 1], (g, v) => {
  if (v) {
    g.fillStyle = radial(g, 0, 0, 6.8, [[0, 'rgba(235,246,255,0.55)'], [0.75, 'rgba(235,246,255,0.34)'], [1, 'rgba(235,246,255,0)']]);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 6.8, -Math.PI / 2 - 0.72, -Math.PI / 2 + 0.72);
    g.closePath();
    g.fill();
    return;
  }
  g.fillStyle = 'rgba(235,246,255,0.82)';
  g.strokeStyle = 'rgba(70,84,110,0.6)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.ellipse(0, -3.3, 1.5, 3.3, 0, 0, TAU);
  g.fill();
  g.stroke();
  stroke(g, [[0, -0.6], [0.2, -3.4], [0, -5.6]], 'rgba(70,84,110,0.45)', 0.7);
}, 2, 0.5);

// крылья в кадре: веер и два крыла, мелькающие вокруг него; оглушённое насекомое машет медленно, веера нет
function bugWings(kit, ctx, x, y, t, size, buzz) {
  if (buzz) {
    put(kit, ctx, 'mob.bug.wing', x, y, -0.3, size, size, 1, 0.9);
    put(kit, ctx, 'mob.bug.wing', x, y, -0.3 + Math.sin(t * 83) * 0.7, size, size, 0, 0.7);
    put(kit, ctx, 'mob.bug.wing', x, y, -0.3 - Math.sin(t * 83 + 1) * 0.7, size, size, 0, 0.7);
  } else {
    put(kit, ctx, 'mob.bug.wing', x, y, -0.9 + Math.sin(t * 9) * 0.5, size, size, 0, 0.85);
    put(kit, ctx, 'mob.bug.wing', x, y, 0.4 + Math.sin(t * 9 + 0.8) * 0.5, size, size, 0, 0.85);
  }
}

// ---------- оса ----------
// Полосатая капля с жалом. Замах — задирает голову, жало вперёд, мелко дрожит; удар — бросок вперёд.

const WASP = { body: '#ffcf3a', light: '#fff0a8', dark: '#d99a1c', stripe: '#33261a', line: '#3a2a1a' };
const waspTone = tone(WASP.body, { light: WASP.light, dark: WASP.dark, line: WASP.line, lw: 0.8 });

// тело целиком, головой вправо; сустав — середина. 0 — злая, 1 — оглушена
definePart('mob.wasp.body', [-7.4, -4.8, 7, 3.8], (g, v) => {
  blob(g, [[-4.6, 0.2], [-7, 1.5, 1], [-4.4, 1.9]], tone(WASP.stripe, { line: WASP.line, lw: 0.5, flat: true }));       // жало
  blob(g, [[-5.2, 1], [-3.8, -1.7], [-1.2, -2.5], [0.8, -1.6], [1, 1.4], [-0.8, 2.8], [-3.6, 2.5]], waspTone, {
    over(c) {
      c.save();
      c.rotate(0.22);
      c.fillStyle = WASP.stripe;
      c.fillRect(-3.9, -4, 1.15, 8);
      c.fillRect(-1.7, -4, 1.15, 8);
      c.restore();
    },
  });
  ball(g, 1.9, -0.5, 1.9, 1.9, tone('#5a4630', { light: '#8a7250', dark: '#33261a', line: WASP.line, lw: 0.8 }));
  stroke(g, [[4.6, -1.6], [5.6, -3.6], [6.5, -3.9]], WASP.line, 0.7);
  stroke(g, [[4, -1.9], [4.6, -3.9], [5.4, -4.3]], WASP.line, 0.7);
  ball(g, 4.2, 0, 2.2, 2.2, waspTone);
  mobEye(g, 4.8, -0.2, 1.2, v ? 3 : 0, { brow: WASP.stripe, slant: 0.4, lid: 0.3 });
}, 2);

function drawWasp(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = 0;
  let buzz = true;
  let x = 0;
  let y = Math.sin(t * 7) * 0.9;
  let rot = Math.sin(t * 3.1) * 0.1;
  let sx = 1;
  switch (a.act) {
    case 'move':
      rot = 0.22 + Math.sin(t * 9) * 0.07;
      y = Math.sin(t * 11) * 0.7;
      x = Math.sin(t * 23) * 0.4;
      break;
    case 'windup': {
      const q = smooth(k / 0.4);
      rot = -0.6 * q;
      x = -2.2 * q + Math.sin(t * 70) * 0.3 * (0.4 + 0.6 * k);
      y = -1.2 * q;
      break;
    }
    case 'attack': {
      // бросок жалом вперёд и возврат
      const u = lunge(k, 0.3);
      x = k < 0.3 ? lerp(-2.2, 6.5, u) : 6.5 * u;
      rot = k < 0.3 ? lerp(-0.6, 0.5, u) : 0.5 * u;
      y = k < 0.3 ? -1.2 * (1 - u) : 0;
      sx = 1 + 0.2 * u;
      break;
    }
    case 'recover':
      x = -1.4 * (1 - k);
      rot = Math.sin(t * 14) * 0.14 * (1 - k);
      break;
    case 'stun':
      face = 1;
      buzz = false;
      rot = 0.9 + Math.sin(t * 4) * 0.25;
      y = 1.2 + Math.sin(t * 4) * 0.6;
      break;
    case 'hurt':
      recoil(k, 2.6, 0.6);
      break;
    case 'spawn':
      appear(k);
      break;
    default:
  }
  fx += x;
  fy += y;
  fr += rot;
  fsx *= sx;
  settle(0, -5.5);
  bugWings(kit, ctx, 1.3, -7.6, t, 1, buzz);
  put(kit, ctx, 'mob.wasp.body', 0, -5.5, 0, 1, 1, face);
}
rig('wasp', COMMON, 36, 30, 8, drawWasp);

// ---------- ворон ----------
// Иссиня-чёрный, с жёлтым клювом и светлым злым глазом. Всегда в воздухе: стойка — висит на месте. Замах — зависает
// стоймя и каркает, крылья дрожат над головой; dive — складывает крылья и падает клювом вниз, у земли — когтями вперёд.

const CROW = { coat: '#3e4263', light: '#737cb0', dark: '#1e2036', beak: '#f0a232', beakLight: '#ffd27a', beakDark: '#b0621a', eye: '#ffe98a', mouth: '#c8425a' };
const crowCoat = tone(CROW.coat, { light: CROW.light, dark: CROW.dark, lw: 1.3 });
const crowFar = farOf(crowCoat, CROW.coat, CROW.dark);
const crowBeak = tone(CROW.beak, { light: CROW.beakLight, dark: CROW.beakDark, lw: 1 });

// тело с хвостом-веером; сустав — середина
definePart('mob.crow.body', [-14.4, -6.8, 9, 6.8], (g) => {
  blob(g, [[-5, -2.2], [-9.5, -3.3], [-13, -2.5, 1], [-11, -1], [-13.4, 0.4, 1], [-10.6, 1.2], [-12.2, 2.9, 1], [-8, 2.6], [-5, 2]], crowFar);
  egg(g, 0, 0, 7.6, 5.4, crowCoat, 0, 0.12, {
    over(c) {
      glow(c, 2.5, 2.6, 4.6, CROW.light, 0.35);
      fur(c, [[3.4, 1.4, 1.2, 2.2], [1, 2.6, 1.3, 2.2], [5, -0.4, 1.1, 2]], alpha(CROW.dark, 0.7), 0.7);
    },
  });
});

// голова: 0 — клюв закрыт, 1 — каркает, 2 — больно, 3 — оглушён; сустав — шея
definePart('mob.crow.head', [-4.8, -8, 12.8, 3.8], (g, v) => {
  if (v === 1) {
    g.fillStyle = CROW.mouth;
    g.beginPath();
    pathBlob(g, [[4.6, -2.6], [9.4, -3], [8.6, 1.2], [4.6, 0.8]]);
    g.fill();
    blob(g, [[4.4, -0.8], [7.6, 0.4], [10.2, 2.4, 1], [7, 2.2], [4.4, 1.4]], crowBeak);
    blob(g, [[4.4, -4], [8, -4.9], [11.6, -4.5, 1], [8.2, -2.4], [4.8, -1.4]], crowBeak);
  } else {
    blob(g, [[4.4, -3.6], [8, -2.9], [11.6, -0.5, 1], [8, 0.5], [4.6, 0.8]], crowBeak, {
      over: (c) => stroke(c, [[5, -1.3], [8, -1], [10.6, -0.6]], alpha(CROW.beakDark, 0.9), 0.7),
    });
  }
  blob(g, [[-2.2, -0.2], [-3.6, -3.4, 1], [-2, -4.7], [0.6, -6.6], [3.8, -6.5], [5.9, -4.3], [6.1, -1.5], [4.4, 1.2], [1.4, 2.2], [-1.2, 1.6]], crowCoat);
  brightEye(g, 3.1, -3.1, 1.6, v === 1 ? 0 : v, { iris: CROW.eye, lid: CROW.coat, slant: 0.42, cover: 0.34 });
}, 4);

// крыло: растёт из плеча вверх; 0 — ближнее, 1 — дальнее. Взмах — растяжение по высоте: минус — крыло внизу
definePart('mob.crow.wing', [-4.8, -14, 5.4, 2.8], (g, v) => {
  blob(g, [[-2.6, 0.6], [-3.4, -4], [-2.6, -8.6], [-0.6, -12.8, 1], [0.8, -9.4], [2.4, -10.6, 1], [2.6, -7], [4.2, -7.6, 1], [3.6, -3.4], [2.6, 0.8], [0, 1.6]], v ? crowFar : crowCoat, {
    over(c) {
      stroke(c, [[-0.8, -9.6], [-0.4, -5], [0.2, -1]], alpha(v ? CROW.dark : CROW.light, 0.55), 0.8);
      stroke(c, [[1.6, -7.6], [1.4, -4], [1.4, -0.6]], alpha(CROW.dark, 0.6), 0.8);
    },
  });
  fadeEdge(g, 0, 2, 0, -0.6);
}, 2);

// лапы: обе сразу; сустав — у брюха
definePart('mob.crow.claw', [-2, -0.8, 4.8, 4], (g) => {
  for (const [color, lw] of [[mix(CROW.beakDark, INK, 0.45), 1.5], [CROW.beak, 0.8]]) {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    for (const x of [0, 2.3]) {
      g.moveTo(x, 0);
      g.lineTo(x + 0.3, 1.8);
      g.lineTo(x - 1.1, 3);
      g.moveTo(x + 0.3, 1.8);
      g.lineTo(x + 0.5, 3.3);
      g.moveTo(x + 0.3, 1.8);
      g.lineTo(x + 1.7, 2.9);
    }
    g.stroke();
  }
});

const CROW_BODY = [-1, -8.2];

function drawCrow(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = 0;
  let ph = t * 10;       // взмах: cos(ph) = 1 — крылья вверху
  let flap = true;
  let wsy = 1;           // крылья без взмаха: высота (минус — опущены), ширина, угол от тела
  let wsx = 1;
  let wl = -0.45;
  let bx = 0;
  let by = 0;
  let br = -0.12;
  let bsx = 1;
  let hx = 0;
  let hr = 0;
  let claw = 0.7;        // лапы: поджаты назад
  let cs = 1;
  switch (a.act) {
    case 'move':
    case 'fly':
      ph = t * 14;
      br = 0.14;
      hr = -0.1;
      break;
    case 'windup': {
      // завис стоймя и каркает
      const q = smooth(k / 0.35);
      flap = false;
      wsy = 0.86 + Math.sin(t * 30) * 0.14;
      wl = -0.2;
      br = -0.12 - 0.42 * q;
      by = -1.6 * q;
      hr = -0.2 * q + Math.sin(t * 19) * 0.12;
      hx = 0.6;
      claw = 0.2;
      face = 1;
      break;
    }
    case 'dive':
      flap = false;
      if (k < 0.72) {
        // падает клювом вниз, крылья сложены вдоль спины
        const q = smooth(k / 0.2);
        br = lerp(0.14, 0.92, q);
        wl = lerp(-0.45, -1.45, q);
        wsx = lerp(1, 0.7, q);
        wsy = lerp(1, 0.85, q);
        bsx = 1 + 0.1 * q;
        hr = -0.2 * q;
      } else {
        // у земли распахивает крылья и бьёт когтями
        const u = smooth((k - 0.72) / 0.28);
        br = lerp(0.92, -0.5, u);
        wl = lerp(-1.45, -0.3, u);
        wsx = lerp(0.7, 1, u);
        wsy = lerp(0.85, 1, u);
        claw = lerp(0.7, -0.9, u);
        cs = 1 + 0.35 * u;
        hr = -0.2 * (1 - u);
        face = 1;
      }
      break;
    case 'attack': {
      // клюёт
      const u = lunge(k, 0.3);
      flap = false;
      wsy = 1 - 0.5 * u;
      wl = -0.7;
      hx = 3 * u;
      hr = 0.4 * u;
      bx = 1.6 * u;
      br = 0.1 * u;
      claw = lerp(0.7, -0.5, u);
      face = u > 0.25 ? 1 : 0;
      break;
    }
    case 'recover':
      // тяжело набирает высоту
      ph = t * 8;
      by = 1.3 * (1 - k);
      br = 0.02;
      hr = 0.15 * (1 - k);
      break;
    case 'stun':
      face = 3;
      flap = false;
      wsy = -0.72;
      wl = -0.25 + Math.sin(t * 4.4) * 0.18;
      br = 0.45 + Math.sin(t * 4.4) * 0.22;
      hr = 0.25 + Math.sin(t * 4.4 + 1) * 0.15;
      claw = 0.2;
      break;
    case 'hurt':
      recoil(k, 2.8, 0.3);
      if (k < 0.8) face = 2;
      flap = false;
      wl = -0.45 - 0.5 * (1 - k);
      break;
    case 'spawn':
      appear(k);
      break;
    default:
  }
  let near = wsy;
  let far = wsy;
  if (flap) {
    near = Math.cos(ph);
    far = Math.cos(ph - 0.45);
    by += Math.sin(ph) * 0.8;        // крылья вниз — тело вверх
  }
  settle(CROW_BODY[0], CROW_BODY[1]);
  frame(CROW_BODY[0] + bx, CROW_BODY[1] + by, br, bsx, 1);
  put(kit, ctx, 'mob.crow.wing', atX(3, -3.4), atY(3, -3.4), br + wl + 0.12, wsx * 0.92, far * 0.94, 1);
  put(kit, ctx, 'mob.crow.claw', atX(-0.6, 4.4), atY(-0.6, 4.4), br + claw, cs, cs);
  put(kit, ctx, 'mob.crow.body', ox, oy, br, bsx, 1);
  put(kit, ctx, 'mob.crow.head', atX(5.4, -3.2) + hx, atY(5.4, -3.2), br * 0.5 + hr, 1, 1, face);
  put(kit, ctx, 'mob.crow.wing', atX(1.8, -2.6), atY(1.8, -2.6), br + wl, wsx, near, 0);
}
rig('crow', [...COMMON, 'fly', 'dive'], 56, 50, 16, drawCrow);

// ---------- жаба и царь-жаба ----------
// Одна постройка на двоих: хозяйка болота — та же жаба, только в u раз крупнее, в бородавках и с короной.
// Тело с головой — одна картинка (шеи у жабы нет), выражения — её варианты: 0 хмурая, 1 моргнула, 2 больно,
// 3 оглушена, 4 пасть настежь, 5 выдохлась. Горловой мешок лежит под телом и раздувается в замахе — его видно
// издалека. Язык — простая линия в кадре от рта вдоль прицела и липкий шарик на конце; длина — a.data.reach,
// а если логика её не дала — reach из описания ниже.

const FROG = { iris: '#ffc23a', mouth: '#7a2230', tongue: '#ff7d94', tongueLine: '#b8405c', sac: '#fbe9c0', sacDark: '#e6a98c' };
const FROG_KINDS = {
  frog: { u: 1, skin: '#8fc43c', light: '#c9ea72', dark: '#5a9226', belly: '#fbf1b8', bellyDark: '#d6c27e', wart: '#6aa22e', lw: 1.3, warts: 3, reach: 62, tongueW: 2, tip: 2, blink: 1.3 },
  toad: { u: 3.7, skin: '#86b83c', light: '#c2e36e', dark: '#4f8a26', belly: '#f8eeb6', bellyDark: '#d2bd78', wart: '#63862a', lw: 2, warts: 10, reach: 120, tongueW: 4.6, tip: 5.4, blink: 0, boss: true },
};

// числа — для обычной жабы, от середины тела; у хозяйки всё множится на u
const FROG_SHAPE = [[-9.4, 4.5], [-10.2, 0.5], [-8, -3.6], [-3.5, -6.4], [1.5, -7.2], [4.4, -9.6], [7, -9.9], [8.6, -7.8], [10.4, -4.6], [11, -1.6], [9.6, 1.4], [6, 5], [0, 7.2], [-6, 6.8]];
// светлый низ: брюхо и нижняя челюсть — граница идёт по линии рта
const FROG_BELLY = [[-10.6, 3.2], [-4, 2.4], [0.5, 0.8], [2.8, -2.7, 1], [4.4, -1.6], [7.6, -1.2], [10.9, -1.9], [13, -2, 1], [13, 9], [-11, 9]];
const FROG_MOUTH = [[2.8, -2.7], [4.4, -1.6], [7.6, -1.2], [10.9, -1.9]];
const FROG_WARTS = [[-5.6, -2.4, 0.9], [-2, -4.3, 0.75], [-7.3, 0.6, 0.8], [-0.4, -1.8, 0.7], [-3.6, 0.2, 0.62], [1.7, -5, 0.6], [-8.3, -1.9, 0.55], [3, -3.5, 0.5], [-5.4, -5, 0.5], [0.4, -6.3, 0.45]];

const FROG_M = {};           // размеры и картинки каждого вида — по ним фигура собирается

function defineFrog(id, S, acts, w, h, shadow) {
  const u = S.u;
  const key = `mob.${id}`;
  const skin = tone(S.skin, { light: S.light, dark: S.dark, lw: S.lw });
  const farSkin = farOf(skin, S.skin, S.dark);
  const belly = tone(S.belly, { light: '#ffffff', dark: S.bellyDark, line: skin.line });
  const thin = S.lw * 0.62;                                       // линии мелких деталей
  const P = (pts) => pts.map((p) => (p[2] ? [p[0] * u, p[1] * u, 1] : [p[0] * u, p[1] * u]));
  const eyeLook = { iris: FROG.iris, lid: S.skin, pupil: 'bar', slant: 0.26, cover: 0.36 };

  definePart(`${key}.body`, [-11.4 * u, -11.2 * u, 12.2 * u, 8.4 * u], (g, v) => {
    // дальний глаз — бугорок за головой
    ball(g, 9.4 * u, -7.5 * u, 1.9 * u, 1.9 * u, farSkin, {
      over: (c) => brightEye(c, 9.8 * u, -7.7 * u, 1.3 * u, v === 1 || v === 2 ? 1 : 0, { ...eyeLook, lid: farSkin.fill, slant: -0.2 }),
    });
    blob(g, P(FROG_SHAPE), skin, {
      over(c, patch) {
        patch(P(FROG_BELLY), belly);
        for (let i = 0; i < S.warts; i++) {
          const [x, y, r] = FROG_WARTS[i];
          dot(c, x * u, y * u, r * u, r * u, alpha(S.wart, 0.9));
          speck(c, (x - r * 0.3) * u, (y - r * 0.35) * u, r * u * 0.34, 0.5);
        }
        dot(c, 9.9 * u, -4.1 * u, 0.36 * u, 0.28 * u, alpha(skin.line, 0.9));           // ноздря
        if (v === 4 || v === 5) {
          // пасть: 4 — настежь (язык, плевок), 5 — приоткрыта
          const d = v === 4 ? 1 : 0.4;
          c.fillStyle = FROG.mouth;
          c.beginPath();
          pathBlob(c, P([[10.9, -2.3], [7.6, -1.9], [4.4, -2.3], [3, -3.1], [4.6, -1.4 + 2 * d], [8.2, -1 + 2.9 * d], [10.8, -1.6 + 2.4 * d]]));
          c.fill();
          dot(c, 7.6 * u, (-0.9 + 1.5 * d) * u, 2.1 * u, (0.5 + 0.6 * d) * u, FROG.tongue);
        } else stroke(c, P(FROG_MOUTH), alpha(skin.line, 0.95), thin * 1.2);
        if (S.boss) {
          // у хозяйки — складки под глазом и у рта
          stroke(c, P([[3.6, -7.6], [5.6, -4.6], [8.6, -4.2]]), alpha(S.dark, 0.6), thin);
          stroke(c, P([[2.2, -1.2], [1.6, 0.4]]), alpha(S.bellyDark, 0.9), thin);
        }
      },
    });
    brightEye(g, 6.5 * u, -7.3 * u, 2.2 * u, v > 3 ? 0 : v, v === 5 ? { ...eyeLook, slant: 0.05, cover: 0.6 } : eyeLook);
  }, 6);

  // горловой мешок: сустав — снизу-сзади, поэтому растёт вперёд и вверх, а не в землю
  definePart(`${key}.sac`, [-2.2 * u, -6.8 * u, 7 * u, 2.4 * u], (g) => {
    ball(g, 2.4 * u, -2.2 * u, 4 * u, 4 * u, tone(FROG.sac, { light: '#ffffff', dark: FROG.sacDark, line: skin.line, lw: S.lw * 0.9 }), {
      over(c) {
        glow(c, 3.4 * u, -1.4 * u, 3 * u, '#ff9c8a', 0.3);
        speck(c, u, -3.8 * u, 0.8 * u, 0.8);
      },
    });
  });

  // задняя лапа, поджатая: бедро и длинная ступня; 0 — ближняя, 1 — дальняя; сустав — бедро
  definePart(`${key}.hind`, [-4.8 * u, -3.8 * u, 8.8 * u, 7.6 * u], (g, v) => {
    const look = v ? farSkin : skin;
    blob(g, P([[-3, 4], [0, 3.6], [4.6, 4.2], [7.2, 4.4, 1], [6.3, 5.2], [7.6, 6, 1], [5, 6.3], [-2, 6.4], [-3.4, 5.2]]), { ...look, lw: look.lw * 0.9 });
    egg(g, 1.2 * u, 1.3 * u, 4.6 * u, 3.3 * u, look, -0.5, 0.1, {
      over: (c) => stroke(c, P([[-1.6, 3.4], [1.6, 3.6], [4.2, 2.2]]), alpha(S.dark, 0.5), thin),
    });
  }, 2);

  // она же в прыжке: вытянута назад
  definePart(`${key}.kick`, [-17.8 * u, -3.6 * u, 3.6 * u, 5.4 * u], (g, v) => {
    const look = v ? farSkin : skin;
    const slim = { ...look, lw: look.lw * 0.9 };
    blob(g, P([[-11, -0.3], [-13.6, -1.3], [-16.6, -0.7, 1], [-14.6, 0.8], [-16.8, 2.3, 1], [-13.8, 2.5], [-11, 2.5]]), slim);
    capsule(g, -5.6 * u, 2.2 * u, 1.9 * u, -11.2 * u, 1.1 * u, 1.3 * u, slim);
    capsule(g, 0, 0, 2.6 * u, -5.6 * u, 2.2 * u, 2 * u, look);
  }, 2);

  // передняя лапа с растопыренными пальцами; сустав — плечо
  definePart(`${key}.arm`, [-3 * u, -2.8 * u, 5.6 * u, 7.7 * u], (g, v) => {
    const look = v ? farSkin : { ...skin, lw: skin.lw * 0.9 };
    limb(g, 0, 0, 1.9 * u, 0.8 * u, 4.4 * u, 1.3 * u, look);
    blob(g, P([[-1.4, 4.2], [2.2, 3.8], [4.4, 5.4, 1], [2.6, 5.5], [3.2, 6.5, 1], [1, 6], [-0.6, 6.6, 1], [-1.6, 5.4]]), look);
    if (!v) fadeEdge(g, 0, -1.4 * u, 0, 0.8 * u);
  }, 2);

  // липкий кончик языка
  const tr = S.tip;
  definePart(`${key}.tip`, [-tr - 0.9, -tr - 0.9, tr + 0.9, tr + 0.9], (g) => {
    ball(g, 0, 0, tr, tr, tone(FROG.tongue, { light: '#ffc2cc', dark: '#d9506e', line: FROG.tongueLine, lw: S.lw * 0.8 }));
    speck(g, -tr * 0.35, -tr * 0.4, tr * 0.24, 0.9);
  }, 1, 0.5);

  FROG_M[id] = {
    u, boss: Boolean(S.boss), reach: S.reach, tongueW: S.tongueW, lw: S.lw, blink: S.blink,
    kBody: `${key}.body`, kSac: `${key}.sac`, kHind: `${key}.hind`, kKick: `${key}.kick`, kArm: `${key}.arm`, kTip: `${key}.tip`,
  };
  rig(id, acts, w, h, shadow, (kit, ctx, a) => drawFrog(kit, ctx, a, FROG_M[id]));
}

// корона хозяйки: слетает, когда та повержена; сустав — низ посередине
definePart('mob.toad.crown', [-8.6, -11, 8.6, 2.6], (g) => {
  const gold = tone(COLORS.coin, { light: COLORS.coinLight, dark: COLORS.coinDark, lw: 1.3 });
  blob(g, [[-6.4, 0], [-7, -6.8, 1], [-3.4, -3.8], [0, -9, 1], [3.4, -3.8], [7, -6.8, 1], [6.4, 0], [0, 1.3]], gold, {
    over: (c, patch) => patch([[-8, -1.9], [0, -1.1], [8, -1.9], [8, 3], [-8, 3]], tone(COLORS.coinDark, { light: COLORS.coin })),
  });
  for (const [x, y] of [[-7, -7.4], [0, -9.6], [7, -7.4]]) ball(g, x, y, 1.25, 1.25, { ...gold, lw: 0.9 });
  ball(g, 0, -4.3, 1.5, 1.5, tone(COLORS.heart, { light: COLORS.heartLight, dark: COLORS.heartDark, lw: 0.8 }));
  speck(g, -0.5, -4.8, 0.4, 0.9);
});

// от середины тела (в единицах обычной жабы): бёдра, плечи, горло, рот, макушка
const F_BODY = [0, -8.5];
const F_HIP = [-5.6, 1.9];
const F_HIP2 = [-3.6, 1.5];
const F_ARM = [5.2, 1.9];
const F_ARM2 = [7.2, 1.5];
const F_SAC = [5.2, 4.4];
const F_MOUTH = [9.3, -1.5];
const F_CROWN = [1.4, -7.4];

let fu = 1;        // размер жабы в кадре
const fX = (p) => atX(p[0] * fu, p[1] * fu);
const fY = (p) => atY(p[0] * fu, p[1] * fu);

// лапа: на земле стоит на своём месте (тело над ней дышит и раздувается), в прыжке летит вместе с телом
function frogLimb(kit, ctx, key, at, air, shift, rot, v) {
  put(kit, ctx, key, lerp((F_BODY[0] + at[0] + shift) * fu, fX(at), air), lerp((F_BODY[1] + at[1]) * fu, fY(at), air), rot, 1, 1, v);
}

function drawFrog(kit, ctx, a, M) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  const u = M.u;
  fu = u;
  calm();
  let face = blinks(t + M.blink) ? 1 : 0;
  let bx = 0;
  let by = 0;
  let br = 0;
  let bsx = 1;
  let bsy = 1;
  let sac = 0.6 + 0.24 * flick(t, 2.7, 0.2, 0.7);      // в покое изредка «квакает»
  let air = 0;           // 0 — сидит, 1 — в воздухе
  let kick = false;      // задние лапы вытянуты
  let legR = 0;
  let armR = 0;
  let tongue = 0;        // язык: доля полной длины
  let sweep = 0;         //   и его поворот от прицела
  let crownX = 0;
  let crownY = 0;
  let crownR = -0.12;
  let crownDrop = 0;     // корона слетела: 0 → 1
  switch (a.act) {
    case 'move': {
      // переползает мелкими прыжками
      const ph = t * (M.boss ? 6.5 : 9.5);
      const up = Math.max(0, Math.sin(ph));
      const down = Math.max(0, -Math.sin(ph));
      air = Math.min(1, up / 0.2);
      by = -2.4 * up;
      br = -0.12 * Math.cos(ph) * up;
      bsx = 1 - 0.05 * up + 0.07 * down;
      bsy = 1 + 0.08 * up - 0.09 * down;
      legR = 0.5 * up;
      armR = -0.35 * up;
      crownY = -0.5 * down;
      break;
    }
    case 'hop': {
      // прыжок: присела — вытянулась в воздухе — шлёпнулась (высоту даёт рендер, здесь — только поза)
      const lift = smooth(k / 0.16) * (1 - smooth((k - 0.8) / 0.2));
      const land = k > 0.8 ? bump((k - 0.8) / 0.2) : 0;
      const sq = Math.max(1 - smooth(k / 0.16), land);
      air = lift;
      by = -3.2 * Math.sin(Math.PI * clamp01((k - 0.08) / 0.84));
      br = lerp(-0.42, 0.34, smooth(k)) * lift;
      bsx = 1 - 0.07 * lift + 0.13 * sq;
      bsy = 1 + 0.12 * lift - 0.18 * sq;
      kick = lift > 0.5;
      legR = kick ? br + 0.12 : 0;
      armR = -0.9 * lift;
      crownY = -1.3 * land;
      face = 0;
      break;
    }
    case 'windup':
      // раздувает горло: сразу заметно, дальше — всё больше
      sac = 0.9 + 0.5 * smooth(k / 0.25) + 0.5 * k + Math.sin(t * 28) * 0.04 * k;
      br = -0.13 * smooth(k);
      bx = -0.8 * smooth(k);
      bsy = 1 + 0.05 * k;
      bsx = 1 + 0.03 * k;
      fx = Math.sin(t * 50) * 0.22 * Math.sqrt(u) * k;
      face = 0;
      break;
    case 'attack': {
      // язык: выстрелил, подержался, втянулся; у хозяйки он ещё и метёт дугой
      const l = lunge(k, 0.2);
      tongue = k < 0.2 ? easeOut(k / 0.2) : k < 0.55 ? 1 : 1 - smooth((k - 0.55) / 0.35);
      if (M.boss) sweep = lerp(-0.55, 0.55, smooth((k - 0.12) / 0.5));
      face = k < 0.92 ? 4 : 0;
      sac = 0.5;
      bx = 1.5 * l;
      br = 0.07 * l;
      bsx = 1 + 0.05 * l;
      break;
    }
    case 'recover': {
      const q = 1 - smooth(k);
      bsy = 1 - 0.05 * q + Math.sin(t * 10) * 0.03 * q;
      sac = 0.5;
      if (k < 0.7) face = 5;
      break;
    }
    case 'stun':
      face = 3;
      fr = Math.sin(t * 5) * 0.06;
      bsy = 0.96;
      sac = 0.45;
      crownR = 0.3 + Math.sin(t * 5 + 1) * 0.1;
      crownX = 0.6;
      break;
    case 'hurt':
      recoil(k, M.boss ? 2 : 2.2, M.boss ? 0.04 : 0.16);
      if (k < 0.8) face = 2;
      break;
    case 'spawn':
      appear(k);
      break;
    default:
      if (M.boss && a.act === 'spit') {
        // плевок: подалась назад, набрала в горло — и вперёд с раскрытой пастью
        const back = smooth(k / 0.2) * (1 - smooth((k - 0.2) / 0.14));
        const out = k < 0.2 ? 0 : lunge((k - 0.2) / 0.8, 0.2);
        bx = -1.2 * back + 1.7 * out;
        bsy = 1 + 0.07 * back - 0.05 * out;
        bsx = 1 - 0.03 * back + 0.05 * out;
        sac = 0.6 + 0.9 * back;
        face = k > 0.18 && k < 0.75 ? 4 : 0;
      } else if (M.boss && a.act === 'tired') {
        // выдохлась: бока ходят, глаза прикрыты, корона съехала
        const pant = Math.sin(t * 9);
        bsy = 0.95 + pant * 0.035;
        bsx = 1.03 - pant * 0.015;
        face = 5;
        sac = 0.5 + 0.14 * Math.max(0, pant);
        crownR = 0.16;
        crownX = 0.3;
      } else if (M.boss && a.act === 'dead') {
        // повержена: оседает лепёшкой, лапы врозь, корона катится прочь
        const fall = smooth(k / 0.45);
        const thud = bump(clamp01((k - 0.45) / 0.25));
        face = 3;
        bsy = 1 - 0.3 * fall + 0.05 * thud;
        bsx = 1 + 0.12 * fall - 0.02 * thud;
        br = -0.08 * fall;
        sac = 0.4;
        legR = 0.5 * fall;
        armR = -0.7 * fall;
        crownDrop = smooth((k - 0.08) / 0.6);
      } else {
        const breath = Math.sin(t * (M.boss ? 1.9 : 2.6));
        bsy = 1 + breath * 0.03;
        bsx = 1 - breath * 0.012;
      }
  }
  // сидящую жабу сплющивает к земле, а не к середине тела
  by += (1 - bsy) * 7 * (1 - air);
  settle();
  frame((F_BODY[0] + bx) * u, (F_BODY[1] + by) * u, br, bsx, bsy);
  if (kick) put(kit, ctx, M.kKick, fX(F_HIP2), fY(F_HIP2), legR, 1, 1, 1);
  else frogLimb(kit, ctx, M.kHind, F_HIP2, air, bx, legR, 1);
  frogLimb(kit, ctx, M.kArm, F_ARM2, air, bx, armR, 1);
  put(kit, ctx, M.kSac, fX(F_SAC), fY(F_SAC), br, sac, sac);
  put(kit, ctx, M.kBody, ox, oy, br, bsx, bsy, face);
  if (M.boss) {
    // корона сидит на макушке; слетев, падает дугой перед жабой и ложится набок
    const cx = fX(F_CROWN) + crownX * u + 43 * crownDrop;
    const cy = lerp(fY(F_CROWN) + crownY * u, -5, crownDrop) - 14 * bump(crownDrop);
    put(kit, ctx, 'mob.toad.crown', cx, cy, br + crownR + 2 * crownDrop);
  }
  frogLimb(kit, ctx, M.kArm, F_ARM, air, bx, armR, 0);
  if (kick) put(kit, ctx, M.kKick, fX(F_HIP), fY(F_HIP), legR, 1, 1, 0);
  else frogLimb(kit, ctx, M.kHind, F_HIP, air, bx, legR, 0);
  if (tongue > 0.01) {
    const tilt = aimTilt(a) + sweep;
    const len = num(a.data && a.data.reach, M.reach) * tongue;
    const mx = fX(F_MOUTH);
    const my = fY(F_MOUTH);
    const ex = mx + Math.cos(tilt) * len;
    const ey = my + Math.sin(tilt) * len;
    kit.axes(ctx);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(outX(mx, my), outY(mx, my));
    ctx.lineTo(outX(ex, ey), outY(ex, ey));
    ctx.strokeStyle = FROG.tongueLine;
    ctx.lineWidth = M.tongueW + M.lw * 1.2;
    ctx.stroke();
    ctx.strokeStyle = FROG.tongue;
    ctx.lineWidth = M.tongueW;
    ctx.stroke();
    put(kit, ctx, M.kTip, ex, ey, tilt);
  }
}

defineFrog('frog', FROG_KINDS.frog, [...COMMON, 'hop'], 120, 46, 20);
defineFrog('toad', FROG_KINDS.toad, [...BOSS, 'hop', 'spit'], 230, 120, 80);

// ---------- гадюка ----------
// Тёмная, с ядовито-жёлтым зигзагом по спине. Стоит кольцами, шея — три куска с открытыми стыками (как хвост лисы),
// поэтому гнётся без швов. Ползёт (move) — те же куски вытягиваются в волну. Замах — встаёт столбом, шея назад,
// пасть раскрыта; удар — бросок головой вперёд (плевок).

const SNAKE = { skin: '#4d4a6a', light: '#8582b0', dark: '#2b2940', mark: '#c9e04e', belly: '#ece6c2', bellyDark: '#bdb48a', eye: '#ffd83a', mouth: '#8a2238', tongue: '#e8455a' };
const snakeSkin = tone(SNAKE.skin, { light: SNAKE.light, dark: SNAKE.dark, lw: 1.2 });
const snakeBelly = tone(SNAKE.belly, { dark: SNAKE.bellyDark, line: snakeSkin.line });
const SNAKE_R = [2.3, 2.4, 2.2, 1.9, 1.4, 0.6];      // толщина тела в суставах: от головы к хвосту
const SNAKE_L = 4.4;                                  // длина куска

// кусок тела: от сустава в нуле назад (влево); стык — круг того же радиуса, что у соседа, поэтому шва на сгибе нет
definePart('mob.snake.piece', [-SNAKE_L - 3.4, -3.3, 3.3, 3.3], (g, v) => {
  const r0 = SNAKE_R[v];
  const r1 = SNAKE_R[v + 1];
  const pts = [
    [0, -r0], [r0 * 0.71, -r0 * 0.71], [r0, 0], [r0 * 0.71, r0 * 0.71], [0, r0],
    [-SNAKE_L, r1], [-SNAKE_L - r1 * 0.71, r1 * 0.71], [-SNAKE_L - r1, 0], [-SNAKE_L - r1 * 0.71, -r1 * 0.71], [-SNAKE_L, -r1],
  ];
  blob(g, pts, snakeSkin, {
    over(c, patch) {
      patch([[r0 + 1, r0 * 0.3], [-SNAKE_L - r1 - 1, r1 * 0.3], [-SNAKE_L - r1 - 1, r0 + 2], [r0 + 1, r0 + 2]], snakeBelly);
      // зубец узора: вместе куски дают зигзаг по спине
      stroke(c, [[0.8, -r0 * 0.05, 1], [-SNAKE_L * 0.5, -(r0 + r1) * 0.42, 1], [-SNAKE_L - 0.8, -r1 * 0.05, 1]], SNAKE.mark, 1);
    },
    stroke: (c) => pathBlobSpan(c, pts, 4, 0),
    shade: (c) => pathBlob(c, [[20, -r0, 1], [20, r0, 1], ...pts.slice(4)]),
  });
}, 5);

// кольца: два витка друг на друге; привязка — низ посередине
definePart('mob.snake.coil', [-11.2, -10.6, 10.8, 1], (g) => {
  const ring = (x1, x2, y, r) => capsule(g, x1, y, r, x2, y, r, snakeSkin, {
    over(c, patch) {
      patch([[x1 - r - 1, y + r * 0.3], [x2 + r + 1, y + r * 0.3], [x2 + r + 1, y + r + 1], [x1 - r - 1, y + r + 1]], snakeBelly);
      const zig = [];
      for (let x = x1 - r * 0.5, i = 0; x <= x2 + r * 0.6; x += 2.2, i++) zig.push([x, y - r * 0.3 + (i % 2 ? r * 0.4 : -r * 0.4), 1]);
      stroke(c, zig, SNAKE.mark, 1);
    },
  });
  ring(-7.2, 6.8, -2.9, 2.8);
  ring(-4.4, 4.2, -6.9, 2.6);
});

// голова: 0 — пасть закрыта, 1 — раскрыта, клыки наружу, 2 — больно, 3 — оглушена; сустав — затылок
definePart('mob.snake.head', [-3.6, -4.4, 8.2, 6.4], (g, v) => {
  if (v === 1) {
    blob(g, [[-1, 1.2], [3, 2.6], [6, 4.6], [5.2, 5.5], [1.6, 4.4], [-1.4, 2.8]], { ...snakeBelly, lw: 1 }, {
      over(c) {
        c.fillStyle = SNAKE.mouth;
        c.beginPath();
        pathBlob(c, [[-1, 1], [6.4, 1], [5.6, 4.4], [2.4, 3.4]]);
        c.fill();
      },
    });
  }
  blob(g, [[-1.6, -2.3], [1.4, -3], [4.2, -2.4], [6.4, -0.9], [6.9, 0.5], [5.6, 1.9], [2.6, 2.6], [-0.6, 2.7], [-2.3, 1.2], [-2.4, -0.8]], snakeSkin, {
    over(c, patch) {
      patch([[-3, 1.1], [2, 0.9], [7.6, 0.3], [7.6, 4], [-3, 4]], snakeBelly);
      if (v !== 1) stroke(c, [[6.6, 1], [4.4, 1.4], [2.4, 1.1]], alpha(SNAKE.dark, 0.9), 0.7);
      dot(c, 5.9, -0.4, 0.3, 0.3, SNAKE.dark);
      stroke(c, [[-1.6, -1.2, 1], [0.2, -2.2, 1], [1.6, -1.4, 1]], SNAKE.mark, 0.9);
    },
  });
  if (v === 1) {
    tri(g, 4.2, 1.9, 4.9, 4.2, 5.5, 1.8, '#ffffff');
    tri(g, 2.6, 2.3, 3.1, 4, 3.7, 2.2, '#ffffff');
  }
  brightEye(g, 3.3, -0.9, 1.3, v === 1 ? 0 : v, { iris: SNAKE.eye, lid: SNAKE.skin, pupil: 'slit', slant: 0.38, cover: 0.3 });
}, 4);

// раздвоенный язык; сустав — у рта
definePart('mob.snake.tongue', [-0.6, -1.8, 4.6, 1.8], (g) => {
  stroke(g, [[0, 0, 1], [2.4, 0, 1], [4, -1.2, 1]], SNAKE.tongue, 0.7);
  stroke(g, [[2.4, 0, 1], [4, 1.2, 1]], SNAKE.tongue, 0.7);
}, 1, 0.5);

// кончик хвоста торчит из колец; сустав — основание
definePart('mob.snake.tail', [-6, -4.4, 2.2, 2.2], (g) => {
  limb(g, 0, 0, 1.6, -4.2, -2.6, 0.6, { ...snakeSkin, lw: 1 });
});

const SNAKE_BASE = [1.5, -4.5];          // откуда шея растёт из колец
const SN = new Float32Array(3);          // шея: наклон трёх кусков от «прямо вверх» (плюс — вперёд), снизу вверх

function neck(n0, n1, n2) {
  SN[0] = n0;
  SN[1] = n1;
  SN[2] = n2;
}
function neckTo(n0, n1, n2, u) {
  SN[0] += (n0 - SN[0]) * u;
  SN[1] += (n1 - SN[1]) * u;
  SN[2] += (n2 - SN[2]) * u;
}

function snakeHead(kit, ctx, x, y, rot, face, lick) {
  put(kit, ctx, 'mob.snake.head', x, y, rot, 1, 1, face);
  if (lick > 0.01) put(kit, ctx, 'mob.snake.tongue', x + Math.cos(rot) * 6.7 - Math.sin(rot) * 0.9, y + Math.sin(rot) * 6.7 + Math.cos(rot) * 0.9, rot, lick, 1);
}

function drawSnake(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = 0;
  let lick = flick(t, 1.9, 0.3, 0.34);
  let headR = 0.05;
  let tail = Math.sin(t * 5) * 0.3;
  const sway = Math.sin(t * 1.7) * 0.07;
  neck(-0.5 + sway, 0.2 + sway * 0.6, 1.25 - sway);
  switch (a.act) {
    case 'move': {
      // ползёт: волна бежит от головы к хвосту
      const ph = t * 11;
      const hx = 7;
      const hy = -3.3 + Math.sin(ph) * 0.4;
      let x = hx;
      let y = hy;
      settle();
      for (let i = 0; i < 5; i++) {
        const an = Math.sin(ph - i * 1.25) * 0.42;
        put(kit, ctx, 'mob.snake.piece', x, y, an, 1, 1, i);
        x -= Math.cos(an) * SNAKE_L;
        y -= Math.sin(an) * SNAKE_L;
      }
      snakeHead(kit, ctx, hx, hy, Math.sin(ph + 0.6) * 0.16 - 0.06, 0, lick);
      return;
    }
    case 'windup': {
      // встаёт столбом, голова назад и вверх, пасть раскрыта
      const q = smooth(k / 0.3);
      const sh = Math.sin(t * 44) * 0.03 * (0.3 + 0.7 * k);
      neckTo(-0.25 + sh, -0.55 - 0.1 * k + sh, 0.5 + sh, q);
      headR = lerp(0.05, -0.38, q);
      face = q > 0.4 ? 1 : 0;
      lick = 0;
      tail = Math.sin(t * 30) * 0.35;
      break;
    }
    case 'attack': {
      // бросок головой вперёд — плевок
      const u = lunge(k, 0.22);
      if (k < 0.22) neck(-0.25, -0.6, 0.5);
      neckTo(0.3, 0.9, 1.5, u);
      headR = k < 0.22 ? lerp(-0.38, 0.12, u) : lerp(0.05, 0.12, u);
      face = k < 0.6 ? 1 : 0;
      lick = 0;
      break;
    }
    case 'recover': {
      const q = 1 - smooth(k);
      neckTo(0.1, 0.9, 1.9, q * 0.6);
      headR = 0.05 + 0.3 * q;
      break;
    }
    case 'stun':
      // голова свесилась на кольца, язык наружу
      neck(-0.6 + sway, 0.9, 2.3 + sway);
      headR = 1;
      face = 3;
      lick = 1;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      neckTo(-0.8, -0.5, 0.9, q);
      headR = 0.05 - 0.4 * q;
      recoil(k, 1.6, 0.1);
      if (k < 0.8) face = 2;
      lick = 0;
      break;
    }
    case 'spawn':
      appear(k);
      break;
    default:
  }
  settle();
  // шея: от колец вверх, кусок за куском; рисуется от головы вниз — каждый следующий закрывает конец предыдущего
  const a2 = SN[0] - Math.PI / 2;
  const a1 = SN[1] - Math.PI / 2;
  const a0 = SN[2] - Math.PI / 2;
  const x2 = SNAKE_BASE[0] + Math.cos(a2) * SNAKE_L;
  const y2 = SNAKE_BASE[1] + Math.sin(a2) * SNAKE_L;
  const x1 = x2 + Math.cos(a1) * SNAKE_L;
  const y1 = y2 + Math.sin(a1) * SNAKE_L;
  const x0 = x1 + Math.cos(a0) * SNAKE_L;
  const y0 = y1 + Math.sin(a0) * SNAKE_L;
  put(kit, ctx, 'mob.snake.tail', -8.4, -2.6, tail);
  put(kit, ctx, 'mob.snake.piece', x0, y0, a0, 1, 1, 0);
  put(kit, ctx, 'mob.snake.piece', x1, y1, a1, 1, 1, 1);
  put(kit, ctx, 'mob.snake.piece', x2, y2, a2, 1, 1, 2);
  put(kit, ctx, 'mob.snake.coil', 0, 0);
  snakeHead(kit, ctx, x0, y0, headR, face, lick);
}
rig('snake', COMMON, 56, 40, 22, drawSnake);

// ---------- комар ----------
// Серая козявка с красным брюшком, длинным хоботком и висящими ногами. Мечется; замах — отлетает назад и целится
// хоботком; удар — укол с лёту.

const MOSQ = { body: '#6b6577', light: '#9d97ad', dark: '#3b3646', belly: '#e0483e', bellyLight: '#ff8a7a', bellyDark: '#9a2620', eye: '#ffe98a', line: '#2a2633' };

// тело с хоботком, головой вправо; сустав — середина. 0 — злой, 1 — оглушён
definePart('mob.mosquito.body', [-6, -3, 8.2, 3.4], (g, v) => {
  stroke(g, [[3.4, -0.2, 1], [7.5, 1.7, 1]], MOSQ.line, 0.8);
  capsule(g, -0.8, 0.3, 1.55, -4.3, 1.6, 0.95, tone(MOSQ.belly, { light: MOSQ.bellyLight, dark: MOSQ.bellyDark, line: MOSQ.line, lw: 0.7 }), {
    over(c) {
      stroke(c, [[-2.2, -1.2, 1], [-2.6, 2.6, 1]], alpha(MOSQ.bellyDark, 0.8), 0.7);
      stroke(c, [[-3.5, -0.6, 1], [-3.8, 2.8, 1]], alpha(MOSQ.bellyDark, 0.8), 0.7);
    },
  });
  ball(g, 0.7, -0.4, 1.75, 1.75, tone(MOSQ.body, { light: MOSQ.light, dark: MOSQ.dark, line: MOSQ.line, lw: 0.7 }));
  ball(g, 2.7, -0.6, 1.4, 1.4, tone(MOSQ.dark, { light: MOSQ.body, dark: '#221f2b', line: MOSQ.line, lw: 0.7 }));
  brightEye(g, 3, -0.8, 0.9, v ? 3 : 0, { iris: MOSQ.eye, lid: MOSQ.dark, slant: 0.4, cover: 0.3 });
}, 2);

// ноги: три ломаные нитки вниз; сустав — под грудью
definePart('mob.mosquito.legs', [-3.4, -0.6, 4.6, 5], (g) => {
  stroke(g, [[-0.6, 0, 1], [-2.5, 1.6, 1], [-2, 4.4, 1]], MOSQ.line, 0.7);
  stroke(g, [[0.2, 0, 1], [0.5, 2.1, 1], [1.5, 4.3, 1]], MOSQ.line, 0.7);
  stroke(g, [[0.9, 0, 1], [2.7, 1.4, 1], [3.8, 3.7, 1]], MOSQ.line, 0.7);
}, 1, 0.5);

function drawMosquito(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = 0;
  let buzz = true;
  let x = Math.sin(t * 17) * 0.5 + Math.sin(t * 7.3) * 0.7;
  let y = Math.sin(t * 13) * 0.6 + Math.sin(t * 5.1) * 0.5;
  let rot = 0.08 + Math.sin(t * 4.3) * 0.1;
  let legs = Math.sin(t * 5) * 0.2;
  switch (a.act) {
    case 'move':
      rot = 0.3 + Math.sin(t * 8) * 0.08;
      legs = 0.5 + Math.sin(t * 9) * 0.15;
      break;
    case 'windup': {
      const q = smooth(k / 0.4);
      x = -2 * q + Math.sin(t * 75) * 0.3 * (0.4 + 0.6 * k);
      y = -0.8 * q;
      rot = 0.3 * q;
      legs = -0.3;
      break;
    }
    case 'attack': {
      // укол с лёту
      const u = lunge(k, 0.3);
      x = k < 0.3 ? lerp(-2, 5.5, u) : 5.5 * u;
      y = k < 0.3 ? lerp(-0.8, 1, u) : u;
      rot = 0.3 + 0.25 * u;
      legs = 0.7 * u;
      break;
    }
    case 'recover':
      x = -1.2 * (1 - k);
      y = Math.sin(t * 13) * 0.6;
      break;
    case 'stun':
      face = 1;
      buzz = false;
      x = 0;
      y = 1 + Math.sin(t * 4) * 0.5;
      rot = 0.8 + Math.sin(t * 4) * 0.25;
      legs = Math.sin(t * 4 + 1) * 0.5;
      break;
    case 'hurt':
      recoil(k, 2.4, 0.6);
      break;
    case 'spawn':
      appear(k);
      break;
    default:
  }
  fx += x;
  fy += y;
  fr += rot;
  settle(0, -6);
  bugWings(kit, ctx, 0.6, -7.6, t, 0.82, buzz);
  put(kit, ctx, 'mob.mosquito.legs', 0.6, -5, legs);
  put(kit, ctx, 'mob.mosquito.body', 0, -6, 0, 1, 1, face);
}
rig('mosquito', COMMON, 32, 28, 7, drawMosquito);

// ---------- гриб-споровик ----------
// Стоит на месте: кремовая ножка с лицом и лиловая шляпка в пятнах (не красная — красные мухоморы на болоте
// просто растут). Замах — шляпка пухнет, пятна и воздух вокруг светятся ядовито-зелёным; удар — шляпка
// подпрыгивает, от неё расходится кольцо спор.

const SHROOM = { cap: '#9a5cc6', light: '#cda2f2', dark: '#633a8e', spot: '#f2eaff', glow: '#c8f56a', stem: '#f5ead6', stemDark: '#cfb898', gill: '#e6d3b6', face: '#5a3a38' };
const capTone = tone(SHROOM.cap, { light: SHROOM.light, dark: SHROOM.dark, lw: 1.4 });
const stemTone = tone(SHROOM.stem, { light: '#ffffff', dark: SHROOM.stemDark, line: mix(SHROOM.stemDark, INK, 0.55), lw: 1.3 });
const SHROOM_SPOTS = [[-5.6, -6.4, 2, 1.5, -0.5], [0.6, -9.4, 2.3, 1.6, 0], [6.2, -6, 1.7, 1.4, 0.5], [-1, -4.2, 1.5, 1.1, 0], [-8, -2.6, 1.1, 0.9, -0.3], [8.6, -2.4, 1, 0.8, 0.3], [4, -2.8, 1, 0.8, 0]];

// ножка с лицом: 0 — хмурая, 1 — моргнул, 2 — больно, 3 — оглушён, 4 — надул щёки, 5 — рот настежь; привязка — низ
definePart('mob.shroom.stem', [-6.8, -12.6, 6.8, 1.9], (g, v) => {
  blob(g, [[-4.6, 0], [-5.5, -3], [-4.5, -7.5], [-3.7, -11.6], [3.7, -11.6], [4.5, -7.5], [5.5, -3], [4.6, 0], [0, 0.9]], stemTone, {
    over(c) {
      blush(c, -2.4, -4.4, v === 4 ? 2.4 : 1.6, '#ff8f8a', v === 4 ? 0.6 : 0.4);
      blush(c, 4.6, -4.6, v === 4 ? 2 : 1.4, '#ff8f8a', v === 4 ? 0.55 : 0.35);
      if (v === 5) dot(c, 1.7, -3.5, 1.5, 1.8, '#7a2230');
      else if (v === 4) dot(c, 1.7, -3.6, 0.7, 0.7, '#7a2230');
      else stroke(c, [[0.3, -3.3], [1.7, -3.9], [3.1, -3.4]], SHROOM.face, 0.8);
    },
  });
  const look = v === 4 ? 1 : v === 5 ? 0 : v;
  mobEye(g, 0, -6.6, 1.45, look, { brow: SHROOM.face, slant: 0.34 });
  mobEye(g, 3.4, -6.7, 1.2, look, { brow: SHROOM.face, slant: 0.34, flip: true });
}, 6);

// шляпка: 0 — обычная, 1 — светится (кладётся поверх обычной с нужной прозрачностью); сустав — низ посередине
definePart('mob.shroom.cap', [-12, -14.2, 12, 3.4], (g, v) => {
  blob(g, [[-10.4, -1.2], [-10, -5.2], [-7, -9.8], [-2, -12.6], [3.4, -12.4], [8, -9.4], [10.4, -5], [10.6, -1.2], [7, 1.2], [0, 2], [-7, 1.2]], capTone, {
    over(c, patch) {
      patch([[-12, -0.4], [-5, 0.5], [0, 0.8], [5, 0.5], [12, -0.4], [12, 4], [-12, 4]], tone(SHROOM.gill, { dark: '#b79f80' }));
      if (v) glow(c, 0, -6, 13, SHROOM.glow, 0.4);
      for (const [x, y, rx, ry, rot] of SHROOM_SPOTS) {
        if (v) glow(c, x, y, rx * 2.2, SHROOM.glow, 0.85);
        c.fillStyle = v ? '#f6ffd0' : SHROOM.spot;
        c.beginPath();
        c.ellipse(x, y, rx, ry, rot, 0, TAU);
        c.fill();
        if (!v) {
          c.strokeStyle = alpha(SHROOM.dark, 0.35);
          c.lineWidth = 0.5;
          c.stroke();
        }
      }
    },
  });
}, 2);

// сияние вокруг шляпки в замахе
definePart('mob.shroom.aura', [-18, -18, 18, 18], (g) => glow(g, 0, 0, 18, SHROOM.glow, 0.6), 1, 0);

// кольцо спор: разлетается от шляпки при ударе
definePart('mob.shroom.puff', [-14, -14, 14, 14], (g) => {
  g.strokeStyle = alpha(SHROOM.glow, 0.35);
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(0, 0, 10.5, 0, TAU);
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const an = (i / 9) * TAU + 0.3;
    const x = Math.cos(an) * 10.5;
    const y = Math.sin(an) * 10.5;
    glow(g, x, y, 3.2, SHROOM.glow, 0.6);
    ball(g, x, y, 1.3, 1.3, tone('#d9f77a', { light: '#fbffd6', dark: '#8fc23c', line: '#4f8f24', lw: 0.6 }));
  }
}, 1, 0);

const SHROOM_TOP = 11.2;        // высота ножки: на ней сидит шляпка

function drawShroom(kit, ctx, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  calm();
  let face = blinks(t + 0.5) ? 1 : 0;
  let ssx = 1;           // ножка
  let ssy = 1 + Math.sin(t * 2.4) * 0.03;
  let cx = 0;            // шляпка: сдвиг от макушки, наклон, растяжение
  let cy = 0;
  let cr = Math.sin(t * 1.2) * 0.04;
  let csx = 1;
  let csy = 1 - Math.sin(t * 2.4 - 0.7) * 0.03;
  let lit = 0;           // свечение пятен
  let aura = 0;          //   и воздуха вокруг
  let puff = -1;         // кольцо спор: ход 0…1, −1 — нет
  switch (a.act) {
    case 'move': {
      // переваливается с боку на бок
      const ph = t * 10;
      fr = Math.sin(ph) * 0.1;
      fy = -Math.abs(Math.sin(ph)) * 1.2;
      cr = -Math.sin(ph - 0.5) * 0.08;
      break;
    }
    case 'windup': {
      // пухнет и светится: чем ближе удар, тем сильнее
      const sw = 0.5 * smooth(k / 0.3) + 0.5 * k;
      ssx = 1 + 0.1 * sw;
      ssy = 1 + 0.06 * sw;
      csx = 1 + 0.26 * sw + Math.sin(t * 40) * 0.02 * k;
      csy = csx;
      lit = sw;
      aura = 0.25 + 0.65 * sw;
      face = 4;
      fx = Math.sin(t * 55) * 0.2 * k;
      break;
    }
    case 'attack': {
      // шляпка подпрыгивает, споры — кольцом во все стороны
      const pop = k < 0.2 ? easeOut(k / 0.2) : 1 - smooth((k - 0.2) / 0.5);
      const big = 1 - smooth(k / 0.6);
      cy = -5.5 * pop;
      csx = 1 + 0.2 * big;
      csy = 1 + 0.12 * big - 0.1 * pop;
      ssy = 1 + 0.1 * pop;
      puff = k;
      lit = 1 - smooth(k / 0.7);
      aura = 0.7 * (1 - k);
      if (k < 0.6) face = 5;
      break;
    }
    case 'recover': {
      // сдулся
      const q = 1 - smooth(k);
      csy = 1 - 0.1 * q;
      cy = 0.8 * q;
      ssy = 1 - 0.05 * q;
      if (k < 0.6) face = 1;
      break;
    }
    case 'stun':
      face = 3;
      cr = 0.3 + Math.sin(t * 5) * 0.08;
      cx = 1.2;
      fr = Math.sin(t * 5 + 1) * 0.06;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      recoil(k, 1.6, 0.2);
      ssy = 1 - 0.12 * q;
      csy = 1 - 0.08 * q;
      if (k < 0.8) face = 2;
      break;
    }
    case 'spawn':
      appear(k);
      break;
    default:
  }
  settle();
  const top = -SHROOM_TOP * ssy + cy;
  if (aura > 0.01) {
    const s = 1 + Math.sin(t * 9) * 0.08;
    put(kit, ctx, 'mob.shroom.aura', cx, top - 5, 0, s, s, 0, aura);
  }
  put(kit, ctx, 'mob.shroom.stem', 0, 0, 0, ssx, ssy, face);
  put(kit, ctx, 'mob.shroom.cap', cx, top, cr, csx, csy, 0);
  if (lit > 0.01) put(kit, ctx, 'mob.shroom.cap', cx, top, cr, csx, csy, 1, lit);
  if (puff >= 0) {
    const s = 0.5 + 1.3 * easeOut(puff);
    put(kit, ctx, 'mob.shroom.puff', cx, top - 6, puff * 0.8, s, s, 0, (1 - puff) * (1 - puff));
  }
}
rig('shroom', COMMON, 56, 52, 16, drawShroom);

// ---------- медведь-хозяин ----------
// Бурая гора: горб над плечами, круглые уши, светлая морда, когти. Ходит на четырёх, а перед ударом встаёт на
// дыбы — туша почти стоймя, лапа занесена над головой: это и есть предупреждение. Удар — всей тушей вниз.
// Рёв — на дыбах, голова запрокинута, от пасти расходятся дуги.

const BEAR = { coat: '#8a5a3a', light: '#bd8c60', dark: '#583624', back: '#6c442c', cream: '#e4bd88', creamShade: '#b58a58', ink: 0.66 };
const bearT = furTones(BEAR, 1.8);
const BEAR_EYE = '#ffb629';
const BEAR_CLAW = tone('#f6eedd', { light: '#ffffff', dark: '#c9b99a', line: '#5a4636', lw: 0.8 });

definePart('mob.bear.body', [-31, -23.6, 31.4, 21.6], (g) => {
  // бочка: круп слева, горб справа; по низу — косматая шерсть
  blob(g, [[-27.4, -2], [-25.4, -12], [-17, -18.4], [-5, -20], [8, -21], [19, -17.4], [26, -9.6], [28.4, 0], [26, 10], [18.6, 16.4],
    ...tufts(18.6, 16.4, -18, 16, 6, 2.6, 0.6), [-18, 16], [-25.4, 9.6]], bearT.coat, {
    over(c, patch) {
      patch([[-32, -6], [-20, -10], [-6, -11], [8, -12], [20, -9], [32, -8], [32, -25], [-32, -25]], bearT.back);
      glow(c, -15, -8, 10, BEAR.light, 0.4);
      glow(c, 26, -3, 12, darken(BEAR.dark, 0.3), 0.55);
      fur(c, [[-16, 10, 1.3, 4.4], [-6, 12, 1.3, 4.4], [5, 12.4, 1.3, 4.4], [14, 11, 1.4, 4], [-10, -15, 0.3, 4.4], [4, -16.4, 0.2, 4.4], [15, -13, 0.5, 4],
        [-2, 0, 0.8, 4.4], [10, 1, 0.8, 4]], alpha(BEAR.dark, 0.6), 1.1);
    },
  });
});

// лапа: толстая, с тремя когтями
const BEAR_LEG = [[-7.4, 0], [0, -7.4], [7.4, 0], [7, 9], [8.6, 13], [11.6, 15.4], [11.2, 19.4], [-5, 19.4], [-7.4, 15.6], [-7, 7]];
legPart('mob.bear.leg', [-9.2, -8.8, 15.8, 23], BEAR_LEG, bearT, {
  lw: 1.6, fade: 1,
  after(g, v) {
    for (const [x, y, len] of [[6, 18, 2.6], [8.6, 17.6, 3], [11, 16.6, 2.8]]) {
      solid(g, (c) => pathPoly(c, [[x - 1, y - 0.4], [x + 1.1, y - 0.7], [x + len, y + 2.6]]), v ? { ...BEAR_CLAW, fill: '#cfc3a8' } : BEAR_CLAW);
    }
  },
});

tailPart('mob.bear.tail', [-9.4, -5.6, 4.6, 5.6], [...tailJoint(3.4), [-3.4, 4], [-6.4, 3.2], [-7.8, 0.4], [-6.2, -2.8], [-3.2, -3.9]], bearT.back);

// голова в три четверти; сустав — шея, середина головы — в BEAR_HC от него
const BEAR_HC = [5, 0];
definePart('mob.bear.head', [-9.8, -21.6, 31.6, 22.6], (g, v) => {
  const F = FACES[v];
  g.translate(BEAR_HC[0], BEAR_HC[1]);
  farEar(g, 2.6, -12.4, 9, -10.6, 5.6, F.ear * 0.4, { ...bearT.far, lw: 1.5 }, earRound);
  if (F.mouth === 2) jawOpen(g, 8.6, 6.4, 12.6, 5.6, 0.62, { ...bearT.cream, lw: 1.4 }, { fang: 1.7, fangH: 3.6 });
  const E = earAxes(-9, -9.6, -2.4, -13.4, 6.2, F.ear * 0.4);
  blob(g, [[-12, 2], [-11.4, -4.6], [-9, -9.6], ...earRound(E), [-2.4, -13.4], [5, -13], [10.6, -9.6], [13.6, -4.8], [17.6, -3], [21.4, -0.4], [22.2, 4.4],
    [19.4, 8.2], [13, 9.8], [6, 11.4], [-1, 12.4], [-5, 15, 1], [-6.6, 11.8], [-10.6, 12.2, 1], [-10.4, 7]], bearT.coat, {
    over(c, patch) {
      // светлая морда; нутро уха тёмное
      patch([[9.6, -1], [13.6, -3.4], [18, -3], [24, 0], [24, 12], [9, 12], [7, 5]], bearT.cream);
      patch(earInside(E), tone('#5a3a2a', { dark: '#3a2218' }));
      glow(c, -3, -7, 6, BEAR.light, 0.35);
      lips(c, F.mouth, 11.6, 20.4, 6.6, bearT.coat.line);
    },
  });
  if (F.mouth === 2) {
    fang(g, 18.2, 7.6, 1.7, 4.4);
    fang(g, 14.4, 8.6, 1.3, 2.8);
  }
  if (F.mouth === 3) blob(g, [[13, 8.6], [16.4, 8.2], [17, 12.4], [15, 14.2], [12.8, 12.4]], tone(TONGUE, { dark: '#d9606e', lw: 0.9 }));
  if (F.eye === 'fierce') {
    fierceEye(g, 11.6, -5.2, 2, BEAR_EYE, { lid: F.lid, slant: 0.4, wide: 0.72 });
    fierceEye(g, 4.4, -4, 2.7, BEAR_EYE, { lid: F.lid, slant: 0.32 });
  } else {
    eye(g, 11.6, -5.2, 2, { kind: F.eye, color: '#2a1a16' });
    eye(g, 4.4, -4, 2.8, { kind: F.eye, color: '#2a1a16' });
  }
  nose(g, 21, 0.8, 2.7, '#2a1a16');
}, FACES.length);

// рёв: дуги от пасти (она в нуле) — расходятся, пока медведь ревёт
definePart('mob.bear.roar', [-0.8, -15, 22, 15], (g) => {
  g.lineCap = 'round';
  for (const [R, half] of [[7.6, 0.62], [13.4, 0.7], [19.4, 0.66]]) {
    for (const [color, lw] of [[alpha('#5a2a22', 0.5), 3], ['#fff6e2', 1.7]]) {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(0, 0, R, -half, half);
      g.stroke();
    }
  }
}, 1, 0.5);

const BEAR_M = {
  kBody: 'mob.bear.body', kHead: 'mob.bear.head', kLeg: 'mob.bear.leg', kTail: 'mob.bear.tail',
  body: [-2, -31.4], neck: [24, -7], tail: [-26.4, -5],
  legNF: [17, 12], legFF: [21, 11.4], legNH: [-18, 12], legFH: [-14, 11.4], arm: [19, -3],
  leg: 20, sit: 4.6, size: 1.14,
  style: { breath: 1.8, head: 0.06, tail: -0.5, tailF: 1.5, tailA: 0.06, pace: 9.5, swing: 0.5, lift: 0.22, bob: 1.5, lean: 0.03, tailRun: -0.3 },
};
// бежит напролом: шаг шире и чаще
const BEAR_RUN = { ...BEAR_M, style: { ...BEAR_M.style, pace: 14, swing: 0.58, lift: 0.3, bob: 3, lean: 0.06 } };
const FULL_SPEED = { speed: 1 };

let bearRoar = 0;      // сила рёва 0…1 — по ней после зверя рисуются дуги
let bearHX = 0;        // куда сдвинута и как наклонена голова: от неё идут дуги
let bearHY = 0;
let bearHR = 0;

// встал на дыбы (up: 0…1): туша почти стоймя на задних лапах, передние — на весу
function bearRear(p, up) {
  p[BR] = -0.85 * up;
  p[BX] = -4 * up;
  p[BY] -= 9.4 * up;
  p[HX] = -2 * up;
  p[HR] -= 0.12 * up;
  p[TR] += 0.3 * up;
  p[L1 + 2] = 0.16 * up;
  p[L1 + 3] = 0.1 * up;
  p[G1] = 1 - up;
  p[G1 + 1] = 1 - up;
}

function bearPose(p, act, t, k, a) {
  const M = BEAR_M;
  let face = CALM;
  bearRoar = 0;
  switch (act) {
    case 'windup': {
      // на дыбах, лапа занесена над головой; чем ближе удар, тем сильнее дрожит
      beastIdle(p, t, M);
      const c = 0.8 + 0.2 * smooth(k);
      bearRear(p, c);
      p[BX] += Math.sin(t * 44) * 0.4 * k;
      p[L1] = -2.9 + Math.sin(t * 9) * 0.06;
      p[K1] = 1.3;
      p[ARM] = 1;
      p[L1 + 1] = -0.9 * c;
      face = SNARL;
      break;
    }
    case 'attack': {
      // удар: с дыбов всей тушей вниз, лапа бьёт в землю в первой трети; потом встаёт ровно
      beastIdle(p, t, M);
      const hit = easeOut(k / 0.3);
      const back = smooth((k - 0.5) / 0.5);
      const hold = 1 - back;
      bearRear(p, (1 - hit) * hold);
      p[BX] += 5 * hit * hold;
      p[BR] += 0.12 * hit * hold;
      p[BY] += 1.6 * hit * hold;
      p[HX] += 2 * hit * hold;
      p[HR] += 0.14 * hit * hold;
      p[L1] = lerp(-2.9, -0.35, hit) * hold;
      p[K1] = lerp(lerp(1.3, 1.12, hit), 1, back);
      p[G1] = back;
      p[ARM] = hold;
      p[L1 + 1] = lerp(-0.9, -0.2, hit) * hold;
      p[G1 + 1] = Math.max(hit, back);
      face = k < 0.5 ? BITE : k < 0.9 ? SNARL : CALM;
      break;
    }
    case 'charge':
      // бежит напролом на всех четырёх, голова к земле
      beastCommon(p, 'move', t, 0, FULL_SPEED, BEAR_RUN);
      p[HX] += 1.5;
      p[HY] += 3;
      p[HR] += 0.2;
      face = SNARL;
      break;
    case 'roar': {
      // рёв: на дыбах, голова запрокинута, лапы врозь, всего трясёт
      beastIdle(p, t, M);
      const up = smooth(k / 0.2) * (1 - smooth((k - 0.84) / 0.16));
      bearRear(p, 0.8 * up);
      p[BX] += Math.sin(t * 50) * 0.5 * up;
      p[HR] += (-0.34 + Math.sin(t * 31) * 0.04) * up;
      p[L1] = -1.25 * up;
      p[L1 + 1] = -up;
      p[TS] = 1 + 0.2 * up;
      bearRoar = up;
      if (up > 0.02) face = up > 0.3 ? BITE : SNARL;
      break;
    }
    case 'tired': {
      // выдохся: осел, голова висит, бока ходят, язык наружу; к концу поднимается
      beastIdle(p, t, M);
      const q = 1 - smooth((k - 0.88) / 0.12);
      const pant = Math.sin(t * 10);
      p[BY] += (3.4 + pant * 0.5) * q;
      p[BSY] += pant * 0.03 * q;
      p[HX] += 1.6 * q;
      p[HY] += 7 * q;
      p[HR] += 0.36 * q;
      p[L1] -= 0.2 * q;
      p[L1 + 1] -= 0.14 * q;
      p[L1 + 2] += 0.16 * q;
      p[L1 + 3] += 0.1 * q;
      if (q > 0.5) face = HURT;
      break;
    }
    case 'dead': {
      // повержен: лапы подламываются вперёд, туша ложится на брюхо, голова падает
      beastIdle(p, 0, M);
      const e = smooth(k / 0.6);
      p[BY] = M.sit * 2.6 * e - bump((k - 0.5) / 0.3);
      p[BR] = 0.05 * e;
      p[BSY] = 1 - 0.07 * e;
      p[HX] = 2 * e;
      p[HY] = 9 * e;
      p[HR] = 0.06 + 0.3 * e;
      p[L1] = -1.1 * e;
      p[L1 + 1] = -0.9 * e;
      p[L1 + 2] = -0.75 * e;
      p[L1 + 3] = -0.6 * e;
      face = e > 0.4 ? DIZZY : HURT;
      break;
    }
    default:
      face = beastCommon(p, act, t, k, a, M);
  }
  bearHX = p[HX];
  bearHY = p[HY];
  bearHR = p[HR];
  return face;
}
beastRig('bear', BEAR_M, bearPose, (act, t) => {
  if (bearRoar <= 0.05) return;
  const hx = beastX(BEAR_M.neck) + bearHX;
  const hy = beastY(BEAR_M.neck) + bearHY;
  const c = Math.cos(bearHR);
  const s = Math.sin(bearHR);
  for (let i = 0; i < 2; i++) {
    const u = loop(t, 0.5, i * 0.25);
    const d = 24 + u * 9;
    beastPut('mob.bear.roar', hx + d * c - 7 * s, hy + d * s + 7 * c, bearHR + 0.2, 0.7 + u * 0.7, 0.7 + u * 0.7, 0, (1 - u) * bearRoar);
  }
});
RIG_INFO.bear = { acts: [...BOSS, 'charge', 'roar'], w: 128, h: 120, shadow: 70 };

// ---------- медвежья лапа (напасть) ----------
// Огромная лапа бьёт с неба в красный круг: падает всё быстрее, на середине (k = 0.5) — удар, потом поднимается и
// тает. Тень под ней растёт, пока лапа близится, — её фигура рисует сама.

const pawCoat = tone(BEAR.coat, { light: BEAR.light, dark: BEAR.dark, line: outline(BEAR.coat, 0.66), lw: 1.9 });

// вид сверху: предплечье уходит ввысь и тает, внизу — ладонь с пальцами и когтями; привязка — куда бьёт
definePart('haz.paw.paw', [-33.5, -62, 33.5, 12.6], (g) => {
  for (const [x, y, lean] of [[-22, -1.6, -0.25], [-7.6, 0.6, -0.08], [7.6, 0.6, 0.08], [22, -1.6, 0.25]]) {
    solid(g, (c) => pathPoly(c, [[x - 3.2, y], [x + 3.2, y], [x + lean * 14, y + 10.4]]), { ...BEAR_CLAW, lw: 1.2 });
  }
  blob(g, [[-18, -60, 1], [18, -60, 1], [21, -44], [27, -32], [31.4, -19], [30, -7], [22.6, -0.6], [15, -3.4], [7.6, 1.4], [0, -2.2], [-7.6, 1.4], [-15, -3.4],
    [-22.6, -0.6], [-30, -7], [-31.4, -19], [-27, -32], [-21, -44]], pawCoat, {
    over(c, patch) {
      patch([[-34, -40], [-10, -46], [14, -44], [34, -38], [34, -64], [-34, -64]], bearT.back);
      glow(c, -12, -22, 13, BEAR.light, 0.4);
      for (const x of [-15, 0, 15]) stroke(c, [[x, -3], [x * 0.94, -13]], alpha(BEAR.dark, 0.8), 1.3);
      fur(c, [[-18, -30, 1.5, 5], [-4, -34, 1.6, 5], [10, -30, 1.6, 5], [20, -24, 1.7, 4.6], [-22, -16, 1.4, 4.6], [2, -18, 1.6, 5]], alpha(BEAR.dark, 0.6), 1.2);
    },
  });
  fadeEdge(g, 0, -60, 0, -42);
});

const PAW_FALL = 76;          // с какой высоты падает

function drawPaw(kit, ctx, a) {
  const k = clamp01(num(a.k));
  let h = 0;            // высота над землёй
  let al = 1;
  let sx = 1;
  let sy = 1;
  if (k < 0.5) {
    const u = k / 0.5;
    h = PAW_FALL * (1 - u * u);
    al = smooth(u / 0.35);
  } else if (k < 0.66) {
    // ударила: расплющило о землю
    const q = bump((k - 0.5) / 0.16);
    sx = 1 + 0.1 * q;
    sy = 1 - 0.14 * q;
  } else {
    const u = (k - 0.66) / 0.34;
    h = PAW_FALL * 0.8 * u * u;
    al = 1 - smooth((u - 0.3) / 0.7);
  }
  const near = 1 - h / PAW_FALL;
  const s = lerp(0.9, 2.3, near);
  calm();
  settle();
  put(kit, ctx, 'fx.shadow', 0, 0, 0, s, s, 0, lerp(0.2, 0.95, near) * al);
  put(kit, ctx, 'haz.paw.paw', 0, -h, 0, sx, sy, 0, al);
}
rig('haz.paw', ['strike'], 80, 156, 0, drawPaw);
