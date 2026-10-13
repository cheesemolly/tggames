// Враги зимнего бора и пещер, зубастый сундук и два хозяина — лось-великан и паучья королева: «живые» фигуры
// «Лисьей охоты». Каждая собрана из отдельно запечённых частей, а поза каждый кадр расставляет их заново.
// Без DOM: здесь только рисунки частей и расчёт поз.
//
// Оси фигуры: (0, 0) — середина ступней, x — вперёд по взгляду, y — вниз; отражение влево делает рендер.
// Поза приходит от логики: a.act и a.k (06-acts: общие spawn, idle, move, windup, attack, recover, stun, hurt и
// свои у каждого зверя), a.t — часы, a.speed — доля полной скорости, a.data — числа зверя. Незнакомая поза —
// спокойная стойка. Фигуры ничего не помнят между кадрами: всё движение — функция от a.t и a.k.
//
// Как отличить их друг от друга в размере телефона — по силуэту и одному яркому пятну:
//   волк — серый, длинная морда, жёлтые глаза, хвост поленом;    рысь — рыжая в пятнах, кисточки на ушах, куцый хвост;
//   росомаха — тёмная глыба со светлой полосой по боку и когтями; летучая мышь — крылья и уши, глаза горят;
//   паук — восемь лап дугами выше тела;                           крот — холмик земли, розовый нос и лапы-лопаты;
//   жук — каменный щит с рогом спереди и мягкая рыжая спина;      сундук-обманка — сундук с зубами и языком.
// Замах (windup) у каждого свой и держится всё время предупреждения: волк припал и скалится, рысь виляет задом,
// росомаха занесла лапу, паук вскинул передние лапы, жук опустил рог, сундук разинул пасть.

import { defineRig, hasSprite } from './art.js';
import {
  TAU, INK, clamp, clamp01, lerp, smooth, easeOut, backOut, bump, num, alpha, darken, lighten, mix, outline, tone,
  definePart, solid, blob, ball, capsule, limb, eggNodes, pathBlob, pathBlobSpan, pathEllipse, pathPoly, tufts, tuftsArc,
  stroke, fur, fadeEdge, glow, radial, linear, speck, shine, sparkle, eye, nose,
} from './art-kit.js';

/**
 * Что умеют фигуры этого файла: acts — позы (их показывает лист рисунков и проверяет тест), w × h — рамка, в которую
 * фигура помещается в любой позе (единицы мира), shadow — ширина тени под ней.
 */
export const RIG_INFO = {};

const COMMON = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
const BOSS = [...COMMON, 'tired', 'dead'];

export const MOUTH = '#6a1f2e';        // нутро пасти
export const TONGUE = '#ff8f94';
export const TOOTH = '#fffdf4';

// ---------- вся фигура разом ----------
// (Скелет четвероногих и приёмы для морд отсюда берёт и art-mobs3.js — поэтому они на экспорт.)
// Части ставятся через put(): он сдвигает, растягивает и гасит всю фигуру целиком — так сделаны появление из метки,
// прыжки и приплюснутость от удара, и ни одной позе не нужно знать о них.

let KIT = null;
let CTX = null;
let GX = 0;        // сдвиг всей фигуры
let GY = 0;
let GSX = 1;       // растяжение от точки привязки
let GSY = 1;
let GA = 1;        // прозрачность

function begin(kit, ctx) {
  KIT = kit;
  CTX = ctx;
  GX = 0;
  GY = 0;
  GSX = 1;
  GSY = 1;
  GA = 1;
}

export function put(key, x, y, rot = 0, sx = 1, sy = 1, variant = 0, al = 1) {
  KIT.part(CTX, key, GX + x * GSX, GY + y * GSY, rot, sx * GSX, sy * GSY, clamp01(al * GA), variant);
}

/** Появление из метки на земле: фигура вырастает от точки привязки и проявляется. */
function rise(k) {
  const s = backOut(k);
  GSX *= lerp(0.4, 1, s);
  GSY *= lerp(0.25, 1, s);
  GA = smooth(k / 0.35);
}

/** Короткий взмах раз в period секунд (ухо дёрнулось, моргнул): 0 … 1 … 0 за len секунд. */
export function flick(t, period, shift, len = 0.2) {
  const u = (((t + shift) % period) + period) % period;
  return u < len ? Math.sin((u / len) * Math.PI) : 0;
}

/** Доля 0…1 круга длиной period секунд. */
export const loop = (t, period, shift = 0) => ((((t + shift) / period) % 1) + 1) % 1;

// ---------- общее для морд ----------

/** Ряд зубов: n треугольников от (x0, y) до (x1, y), остриями на h (плюс — вниз). */
export function teeth(g, x0, x1, y, n, h, color = TOOTH) {
  const w = (x1 - x0) / n;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    g.moveTo(x0 + w * i, y);
    g.lineTo(x0 + w * (i + 0.5), y + h);
    g.lineTo(x0 + w * (i + 1), y);
  }
  g.closePath();
  g.fill();
}

/** Клык: основание шириной 2w с серединой в (x, y), остриё — на h (плюс — вниз), чуть загнут вперёд. */
export function fang(g, x, y, w, h, line = 'rgba(70,44,56,0.7)') {
  g.fillStyle = TOOTH;
  g.strokeStyle = line;
  g.lineWidth = 0.45;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - w, y);
  g.quadraticCurveTo(x - w * 0.2, y + h * 0.6, x + w * 0.3, y + h);
  g.quadraticCurveTo(x + w * 0.9, y + h * 0.5, x + w, y);
  g.closePath();
  g.fill();
  g.stroke();
}

/**
 * Глаз хищника: цветная радужка под тяжёлым веком, зрачок-щёлка, тёмная подводка — на любой шкуре он читается
 * цветным пятном. lid — насколько прикрыт (0…0.9), slant — наклон века к носу, shine — мягкое свечение вокруг
 * (у тех, кто живёт в темноте).
 */
export function fierceEye(g, x, y, r, iris, o = {}) {
  const cut = Math.asin(clamp(1 - (o.lid ?? 0.36) * 2, -1, 1));
  const rim = o.rim ?? '#2a1c26';
  if (o.shine) glow(g, x, y, r * 2.7, iris, o.shine);
  g.save();
  g.translate(x, y);
  g.rotate(o.slant ?? 0.3);
  g.scale(o.wide ?? 0.9, 1);
  const lens = (rr) => {
    g.beginPath();
    g.arc(0, 0, rr, -cut, Math.PI + cut);
    g.closePath();
  };
  g.fillStyle = rim;
  lens(r + 0.55);
  g.fill();
  g.fillStyle = iris;
  lens(r);
  g.fill();
  g.save();
  lens(r);
  g.clip();
  g.fillStyle = o.pupil ?? '#1c1218';
  g.beginPath();
  g.ellipse(r * 0.14, r * 0.14, r * (o.slit ?? 0.3), r * 0.8, 0, 0, TAU);
  g.fill();
  g.restore();
  // веко — оно же бровь: тяжёлая линия, к носу ниже
  const ly = -Math.sin(cut) * r;
  g.strokeStyle = o.brow ?? rim;
  g.lineWidth = Math.max(0.7, r * 0.44);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-r * 1.3, ly - r * 0.16);
  g.lineTo(r * 1.2, ly + r * 0.06);
  g.stroke();
  g.restore();
  speck(g, x - r * 0.36, y + r * 0.3, r * 0.2, 0.9);
}

/**
 * Ухо в контуре головы: основание от (x0, y0) до (x1, y1) по ходу контура, высота h, наклон lean (минус — прижато
 * назад). Возвращает перевод из осей уха (u — вдоль основания, −0,5…0,5; v — вверх, 0…1) в оси головы.
 */
export function earAxes(x0, y0, x1, y1, h, lean) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (dy / len) * h;
  const ny = (-dx / len) * h;
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return (u, v, sharp) => {
    const px = dx * u + nx * v;
    const py = dy * u + ny * v;
    return sharp ? [mx + px * c - py * s, my + px * s + py * c, 1] : [mx + px * c - py * s, my + px * s + py * c];
  };
}
export const earSharp = (E) => [E(-0.4, 0.42), E(-0.16, 0.84), E(0.03, 1, 1), E(0.22, 0.68), E(0.42, 0.28)];
export const earRound = (E) => [E(-0.47, 0.5), E(-0.3, 0.94), E(0.04, 1.08), E(0.34, 0.88), E(0.47, 0.42)];
export const earInside = (E) => [E(-0.22, 0.04), E(-0.2, 0.42), E(0.02, 0.74), E(0.2, 0.4), E(0.25, 0.04)];

/** Дальнее ухо — отдельная форма за головой. */
export function farEar(g, x0, y0, x1, y1, h, lean, look, nodes = earSharp) {
  const E = earAxes(x0, y0, x1, y1, h, lean);
  blob(g, [[x0, y0], ...nodes(E), [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2 + 2.4]], look);
}

/**
 * Раскрытая пасть: тёмное нутро клином от сустава (hx, hy), язык и нижняя челюсть длиной L и толщиной th,
 * откинутая на угол open. Рисуется до головы — та закрывает её верх.
 */
export function jawOpen(g, hx, hy, L, th, open, look, o = {}) {
  const c = Math.cos(open);
  const s = Math.sin(open);
  g.fillStyle = MOUTH;
  g.beginPath();
  g.moveTo(hx - 1.4, hy - 1);
  g.lineTo(hx + L * 1.04, hy - 0.4);
  g.lineTo(hx + L * c, hy + L * s);
  g.lineTo(hx - 1.2, hy + 1.6);
  g.closePath();
  g.fill();
  g.save();
  g.translate(hx, hy);
  g.rotate(open);
  g.fillStyle = TONGUE;
  g.beginPath();
  g.ellipse(L * 0.56, -0.5, L * 0.36, th * 0.4, -0.06, 0, TAU);
  g.fill();
  blob(g, [[-1, 0.3], [L * 0.45, 0.5], [L * 0.86, 0.1], [L, 1.2], [L * 0.9, th], [L * 0.4, th * 1.05], [-0.8, th * 0.8]], look);
  fang(g, L * 0.8, 0.6, o.fang ?? 1.1, -(o.fangH ?? 2.3));
  fang(g, L * 0.54, 0.7, 0.8, -1.3);
  g.restore();
}

/** Рот на морде (под обрезкой головой): 0 — закрыт, 1 — оскал со стиснутыми зубами, 3 — приоткрыт (оглушён, больно). */
export function lips(c, kind, x0, x1, y, line) {
  if (kind === 0) {
    stroke(c, [[x1 - 0.3, y - 0.3], [(x0 + x1) / 2 + 1, y + 0.7], [x0 + 1.2, y + 0.5], [x0, y - 0.6]], alpha(line, 0.85), 0.9);
  } else if (kind === 1) {
    c.fillStyle = MOUTH;
    c.beginPath();
    pathBlob(c, [[x0 - 0.2, y - 1.4], [x1 + 0.4, y - 1.6], [x1, y + 1.2], [x0 + 0.2, y + 1.4]]);
    c.fill();
    teeth(c, x0 + 0.2, x1, y - 1.4, Math.max(3, Math.round((x1 - x0) / 1.5)), 1.6);
    teeth(c, x0 + 0.8, x1 - 0.6, y + 1.3, Math.max(2, Math.round((x1 - x0) / 1.8)), -1.2);
  } else if (kind === 3) {
    c.fillStyle = MOUTH;
    c.beginPath();
    c.ellipse((x0 + x1) / 2 + 1, y + 0.2, (x1 - x0) * 0.3, 1.3, 0, 0, TAU);
    c.fill();
  }
}

/** Пятна на шкуре (под обрезкой формой): list — [[x, y, rx, ry, поворот], …]. */
export function spots(c, list, color) {
  c.fillStyle = color;
  for (const [x, y, rx, ry = rx, rot = 0] of list) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
    c.fill();
  }
}

// выражения морды — номер варианта картинки головы: спокойна, оскал, пасть раскрыта, оглушён, больно
export const CALM = 0;
export const SNARL = 1;
export const BITE = 2;
export const DIZZY = 3;
export const HURT = 4;
// ухо (наклон), рот (0 закрыт, 1 оскал, 2 раскрыт, 3 приоткрыт), глаз
export const FACES = [
  { ear: 0.08, mouth: 0, eye: 'fierce', lid: 0.36 },
  { ear: -0.7, mouth: 1, eye: 'fierce', lid: 0.46 },
  { ear: -0.8, mouth: 2, eye: 'fierce', lid: 0.42 },
  { ear: -0.25, mouth: 3, eye: 'cross' },
  { ear: -0.6, mouth: 3, eye: 'squint' },
];

/** Краски шкуры: основная, дальняя сторона (в тени), светлый низ, тёмный верх. */
export function furTones(C, lw = 1.5) {
  const coat = tone(C.coat, { light: C.light, dark: C.dark, line: outline(C.coat, C.ink ?? 0.68), lw });
  return {
    coat,
    far: tone(mix(C.coat, C.dark, C.far ?? 0.8), { light: C.coat, dark: darken(C.dark, 0.35), line: coat.line, lw, rim: 0.25 }),
    cream: tone(C.cream, { light: lighten(C.cream, 0.6), dark: C.creamShade, line: coat.line, lw }),
    back: tone(C.back, { light: mix(C.back, C.light, 0.45), dark: darken(C.back, 0.3), line: coat.line, lw }),
  };
}

// ---------- четвероногие: общий скелет ----------
// Волк, рысь и росомаха собраны как лиса (art-fox.js), только проще: хвост одним куском, уши и глаза запечены в
// голову (у головы — варианты с выражениями морды). Семь частей в кадре.

// поза — числа по местам: их можно смешивать
export const BX = 0;      // тело: сдвиг
export const BY = 1;
export const BR = 2;      //   наклон (плюс — носом вниз)
export const BSX = 3;     //   растяжение вдоль и поперёк
export const BSY = 4;
export const HX = 5;      // голова: сдвиг от шеи
export const HY = 6;
export const HR = 7;      //   наклон
export const TR = 8;      // хвост: угол от тела (плюс — кверху) и пышность
export const TS = 9;
export const L1 = 10;     // лапы: ближняя передняя, дальняя передняя, ближняя задняя, дальняя задняя (минус — вперёд)
export const K1 = 14;     //   длина каждой (1 — как есть)
export const G1 = 18;     //   стоит ли на земле: 1 — дотягивается до неё сама, 0 — на весу
export const ARM = 22;    // ближняя передняя лапа занесена для удара (0…1): растёт от плеча повыше и рисуется поверх головы
const SIZE = 23;

const P = new Float32Array(SIZE);
const P2 = new Float32Array(SIZE);

function rest(p) {
  p.fill(0);
  p[BSX] = 1;
  p[BSY] = 1;
  p[TS] = 1;
  for (let i = 0; i < 4; i++) {
    p[K1 + i] = 1;
    p[G1 + i] = 1;
  }
}

function blend(out, a, b, u) {
  for (let i = 0; i < SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * u;
}

let ox = 0;        // середина тела в осях фигуры и его поворот с растяжением — от них считаются все крепления
let oy = 0;
let oc = 1;
let os = 0;
let osx = 1;
let osy = 1;
export const atX = (at) => ox + at[0] * osx * oc - at[1] * osy * os;
export const atY = (at) => oy + at[0] * osx * os + at[1] * osy * oc;

const ARM_AT = [0, 0];

function beastLeg(M, p, i, at, far) {
  const rot = p[L1 + i];
  const hy = atY(at);
  // стоит на земле — лапа сама дотягивается до неё (или поджимается, если тело присело)
  const reach = clamp(-hy / (M.leg * Math.max(0.35, Math.cos(rot))), 0.5, 1.35);
  put(M.kLeg, atX(at), hy, rot, 1, p[K1 + i] * lerp(1, reach, p[G1 + i]), far);
}

// ближняя передняя лапа: занесённая — от плеча M.arm; выше плеча она повёрнута когтями вперёд
function beastArm(M, p) {
  const lift = p[ARM];
  ARM_AT[0] = lerp(M.legNF[0], M.arm[0], lift);
  ARM_AT[1] = lerp(M.legNF[1], M.arm[1], lift);
  const rot = p[L1];
  const hy = atY(ARM_AT);
  const reach = clamp(-hy / (M.leg * Math.max(0.35, Math.cos(rot))), 0.5, 1.35);
  put(M.kLeg, atX(ARM_AT), hy, rot, rot < -1.57 ? -1 : 1, p[K1] * lerp(1, reach, p[G1]), 0);
}

function drawBeast(M, p, face) {
  ox = M.body[0] + p[BX];
  oy = M.body[1] + p[BY];
  oc = Math.cos(p[BR]);
  os = Math.sin(p[BR]);
  osx = p[BSX];
  osy = p[BSY];
  put(M.kTail, atX(M.tail), atY(M.tail), p[TR] + p[BR], 1, p[TS]);
  beastLeg(M, p, 3, M.legFH, 1);
  beastLeg(M, p, 1, M.legFF, 1);
  put(M.kBody, ox, oy, p[BR], osx, osy);
  beastLeg(M, p, 2, M.legNH, 0);
  if (p[ARM] < 0.5) beastArm(M, p);
  put(M.kHead, atX(M.neck) + p[HX], atY(M.neck) + p[HY], p[HR], 1, 1, face);
  if (p[ARM] >= 0.5) beastArm(M, p);
}

// стоит и дышит: хвост покачивается, голова чуть водит
export function beastIdle(p, t, M) {
  rest(p);
  const S = M.style;
  const breath = Math.sin(t * S.breath);
  p[BSY] = 1 + breath * 0.022;
  p[BSX] = 1 - breath * 0.009;
  p[BY] = -breath * 0.14;
  p[HY] = -breath * 0.28;
  p[HR] = S.head + Math.sin(t * 0.9 + 1) * 0.035;
  p[TR] = S.tail + Math.sin(t * S.tailF) * S.tailA;
}

// бежит: лапы по диагонали, тело подпрыгивает, хвост стелется
function beastRun(p, t, speed, M) {
  rest(p);
  const S = M.style;
  const ph = t * S.pace;
  const swing = S.swing * (0.4 + 0.6 * speed);
  for (let i = 0; i < 4; i++) {
    const a = ph + (i === 0 || i === 3 ? 0 : Math.PI);
    p[L1 + i] = -Math.sin(a) * swing;
    p[K1 + i] = 1 - S.lift * Math.max(0, Math.cos(a)) * (0.4 + 0.6 * speed);      // лапа, что идёт вперёд, поджата
  }
  const hop = Math.abs(Math.sin(ph));
  p[BY] = -0.2 - hop * S.bob * speed;
  p[BR] = S.lean * speed + Math.sin(ph * 2 + 0.6) * 0.03;
  p[BSX] = 1 + 0.03 * speed;
  p[HY] = Math.sin(ph * 2 - 0.9) * 0.5;
  p[HX] = 0.6 * speed;
  p[HR] = S.head + S.lean * speed + Math.sin(ph * 2 - 1.4) * 0.035;
  p[TR] = S.tailRun + Math.sin(ph - 0.6) * 0.12;
}

// идёт или стоит — по скорости (без рывка между стойкой и бегом)
function beastMove(p, t, speed, M) {
  if (speed <= 0.02) {
    beastIdle(p, t, M);
    return;
  }
  beastIdle(P2, t, M);
  beastRun(p, t, speed, M);
  if (speed < 0.3) blend(p, P2, p, smooth(speed / 0.3));
}

// оглушён: осел на разъехавшихся лапах, голова мотается
function beastStun(p, t, M) {
  rest(p);
  const sway = Math.sin(t * 5.4);
  p[BX] = sway * 0.9;
  p[BY] = M.sit;
  p[BR] = 0.05 + sway * 0.035;
  p[BSY] = 0.95;
  p[HX] = 0.6;
  p[HY] = M.sit * 0.5 + 1.6;
  p[HR] = 0.3 + Math.sin(t * 5.4 - 0.9) * 0.22;
  p[TR] = M.style.tail - 0.35 + sway * 0.05;
  p[L1] = -0.5;
  p[L1 + 1] = -0.38;
  p[L1 + 2] = 0.48;
  p[L1 + 3] = 0.36;
}

// отдувается после броска: голова опущена, бока ходят; к концу выпрямляется
function beastRecover(p, t, k, M) {
  beastIdle(p, t, M);
  const q = 1 - smooth((k - 0.45) / 0.55);
  const pant = Math.sin(t * 13);
  p[BY] += (1.4 + pant * 0.25) * q;
  p[BSY] += pant * 0.03 * q;
  p[HX] += 0.6 * q;
  p[HY] += 2.2 * q;
  p[HR] += 0.26 * q;
  p[TR] -= 0.3 * q;
  p[L1] -= 0.16 * q;
  p[L1 + 2] += 0.12 * q;
}

// получил удар: отдёрнулся назад; к концу проходит (добавка поверх стойки или бега)
function addHurt(p, k) {
  const q = (1 - k) * (1 - k);
  p[BX] -= 3 * q;
  p[BY] -= 1.2 * q;
  p[BR] -= 0.2 * q;
  p[HX] -= 1 * q;
  p[HR] -= 0.32 * q;
  p[TR] += 0.5 * q;
  p[L1] -= 0.35 * q;
  p[L1 + 1] -= 0.35 * q;
  p[L1 + 2] -= 0.18 * q;
  p[L1 + 3] -= 0.18 * q;
}

// бросок: вытянут в струну — передние лапы вперёд, задние назад; нос вверх на взлёте и вниз к приземлению
export function beastLeap(p, k, t, M, far) {
  rest(p);
  const s = (0.5 + 0.5 * smooth(k / 0.15)) * (1 - 0.45 * smooth((k - 0.75) / 0.25));
  p[BSX] = 1 + 0.24 * s * far;
  p[BSY] = 1 - 0.15 * s;
  p[BR] = lerp(-0.3, 0.24, smooth(k)) * s;
  p[BY] = -1.6 * s;
  p[HX] = 2.4 * s;
  p[HY] = 0.3 * s;
  p[HR] = p[BR] * 0.6 - 0.1 * s;
  p[TR] = 0.04 + Math.sin(t * 38) * 0.04;
  p[TS] = 1 - 0.1 * s;
  const reach = 1 - 0.5 * smooth((k - 0.7) / 0.3);          // к концу передние лапы тянутся к земле
  p[L1] = (-1.05 * reach - 0.15) * s + p[BR];
  p[L1 + 1] = (-0.9 * reach - 0.15) * s + p[BR];
  p[L1 + 2] = 1.25 * s + p[BR];
  p[L1 + 3] = 1.1 * s + p[BR];
  for (let i = 0; i < 4; i++) {
    p[K1 + i] = 1.1;
    p[G1 + i] = 0;
  }
}

// позы, общие для всех четвероногих; возвращает выражение морды
export function beastCommon(p, act, t, k, a, M) {
  switch (act) {
    case 'move':
      beastMove(p, t, Math.max(clamp01(num(a.speed, 1)), 0.35), M);
      return CALM;
    case 'recover':
      beastRecover(p, t, k, M);
      return CALM;
    case 'stun':
      beastStun(p, t, M);
      return DIZZY;
    case 'hurt':
      beastMove(p, t, clamp01(num(a.speed)), M);
      addHurt(p, k);
      return k < 0.7 ? HURT : CALM;
    default:
      beastIdle(p, t, M);
      return CALM;
  }
}

/** Фигура четвероногого: pose(p, act, t, k, a) заполняет позу и возвращает вариант головы; after — что дорисовать. */
export function beastRig(id, M, pose, after = null) {
  defineRig(id, {
    draw(kit, ctx, a) {
      begin(kit, ctx);
      if (M.size) {
        // зверь нарисован крупнее, чем стоит в игре (спутники лисы): вся фигура — в M.size от рисунка
        GSX = M.size;
        GSY = M.size;
      }
      const t = num(a.t);
      const k = clamp01(num(a.k));
      let act = a.act;
      if (act === 'spawn') {
        rise(k);
        act = 'idle';
      }
      const face = pose(P, act, t, k, a);
      drawBeast(M, P, face);
      if (after) after(act, t, k);
    },
  });
}

/** Лапа: pts — контур от сустава (узлы 0…2 — круг сустава, как у лисы). Вариант 0 — ближняя, 1 — дальняя, в тени. */
export function legPart(key, box, pts, T, o = {}) {
  definePart(key, box, (g, v) => {
    blob(g, pts, { ...(v ? T.far : T.coat), lw: o.lw ?? 1.25 }, {
      over: o.over ? (c, patch) => o.over(c, patch, v) : null,
      stroke: (c) => pathBlobSpan(c, pts, v ? 2 : 3, v ? 0 : pts.length - 1),      // у ближней обводка начинается у края тела
      shade: (c) => pathBlob(c, [[pts[0][0], -14, 1], [pts[2][0], -14, 1], ...pts.slice(2)]),
    });
    if (o.after) o.after(g, v);
    if (!v) fadeEdge(g, 0, o.fade ?? 1.8, 0, (o.fade ?? 1.8) + 2.8);          // дальняя и так за телом
  }, 2);
}

/** Хвост одним куском: смотрит влево (назад) и растёт из сустава в нуле; узлы 0…4 — круг сустава. */
export function tailPart(key, box, pts, look, over = null) {
  definePart(key, box, (g) => {
    const r = pts[4][1];
    blob(g, pts, look, {
      over,
      stroke: (c) => pathBlobSpan(c, pts, 4, 0),
      shade: (c) => pathBlob(c, [[20, -r, 1], [20, r, 1], ...pts.slice(4)]),
    });
  });
}
export const tailJoint = (r) => [[0, -r], [r * 0.71, -r * 0.71], [r, 0], [r * 0.71, r * 0.71], [0, r]];

// ---------- волк ----------
// Серый, с тёмной спиной и светлой мордой, голову несёт низко; жёлтые глаза — его яркое пятно.

const WOLF = { coat: '#8d96a6', light: '#cad1db', dark: '#596373', back: '#565e6d', cream: '#f1f3f6', creamShade: '#b9c3d1', far: 0.62 };
const wolfT = furTones(WOLF);
const WOLF_EYE = '#ffd23f';

definePart('mob.wolf.body', [-15, -10, 15.4, 8.6], (g) => {
  // фасолина: круп слева, высокая холка и лохматая грудь справа
  blob(g, [[-12.4, -2.6], [-8, -6], [-1, -6.4], [5.5, -7.8], [10.6, -6.2], [13, -1.6], [12.6, 2.2], [13.4, 4.6, 1], [11, 3.8], [10.6, 6.9, 1],
    [8, 5.8], [1.4, 5.6], [-4.6, 4.2], [-9.6, 5], [-13, 1.8]], wolfT.coat, {
    over(c, patch) {
      // тёмная спина: граница зубцами, как шерсть
      patch([[-16, -2.4], [-11, -1.6, 1], [-9.4, -3.1, 1], [-6.6, -1.5, 1], [-4.4, -3.1, 1], [-1.4, -1.7, 1], [0.8, -3.5, 1], [3.6, -2.1, 1], [6, -4.1, 1],
        [9, -2.7, 1], [11, -4.7, 1], [16, -4], [16, -12], [-16, -12]], wolfT.back);
      patch([[-11, 5.6], [-4.6, 3], [1.4, 4.2], [7.4, 3.2], [16, -0.6], [16, 10], [-13, 10]], wolfT.cream);
      glow(c, -7.4, -0.6, 5.2, WOLF.light, 0.4);                  // свет на бедре
      glow(c, 11.6, -1.6, 7, darken(WOLF.dark, 0.3), 0.55);       // тень от головы на плечах
    },
  });
});

const WOLF_LEG = [[-2.7, 0], [0, -2.7], [2.7, 0], [2.4, 7.4], [4.6, 10.6], [3.6, 13], [-1.6, 13], [-2.6, 10.4], [-2.2, 5]];
legPart('mob.wolf.leg', [-4, -3.6, 6.2, 14.2], WOLF_LEG, wolfT, {
  over(c, patch, v) {
    if (!v) patch([[-5, 9.8], [-1.2, 9, 1], [0.2, 10, 1], [1.6, 9.1, 1], [6.4, 9.8], [7, 15], [-5, 15]], wolfT.cream);
    stroke(c, [[2.3, 11.4], [2.1, 12.7]], alpha(wolfT.coat.line, v ? 0.5 : 0.8), 0.5);
    stroke(c, [[3.6, 11.3], [3.5, 12.5]], alpha(wolfT.coat.line, v ? 0.5 : 0.8), 0.5);
  },
});

// хвост поленом: густой, с тёмным кончиком
tailPart('mob.wolf.tail', [-16.6, -5.4, 4, 6], [...tailJoint(3), [-4.5, 4.4], [-8.6, 4.6], [-11.8, 2.8], [-15, 0.6, 1], [-11.4, -1.9], [-8, -3.9], [-4, -3.9]],
  wolfT.coat, (c, patch) => {
    patch([[-9.6, -8, 1], [-11, -2.4], [-9.4, -0.6, 1], [-11.2, 1.2], [-9.8, 3, 1], [-11.4, 8, 1], [-20, 8], [-20, -8]], wolfT.back);
    patch([[4, 2.2], [-4, 2.6], [-9.4, 3.2], [-9, 8], [4, 8]], wolfT.cream);
  });

// голова в три четверти; сустав — шея, середина головы — в WOLF_HC от него
const WOLF_HC = [3.2, -1.2];
definePart('mob.wolf.head', [-9.6, -16.4, 20.6, 13.4], (g, v) => {
  const F = FACES[v];
  g.translate(WOLF_HC[0], WOLF_HC[1]);
  farEar(g, 0.8, -5, 5.6, -5, 6.4, F.ear * 0.7 + 0.14, { ...wolfT.far, lw: 1.2 });
  if (F.mouth === 2) jawOpen(g, 4.4, 3.4, 9.2, 3.4, 0.56, { ...wolfT.cream, lw: 1.2 });
  const E = earAxes(-5.2, -4.4, -0.2, -6.2, 6.8, F.ear);
  blob(g, [[-7.4, 1.4], [-6.6, -2], [-5.2, -4.4], ...earSharp(E), [-0.2, -6.2], [3.4, -5.8], [6.2, -3.6], [7.8, -1.5], [10.4, -0.9], [13.4, -0.2],
    [14.8, 1.7], [14, 3.9], [10.8, 5], [6.2, 5.4], [2, 6], [-1.4, 7.6, 1], [-2.4, 5.6], [-5.6, 7.2, 1], [-5.8, 4.6], [-9, 4.8, 1]], wolfT.coat, {
    over(c, patch) {
      // тёмная «шапка» от ушей до бровей и светлая маска: щёки, бока морды, подбородок
      patch([[-12, -1.6], [-5.4, -2.8, 1], [-3.6, -1.7, 1], [-1.2, -3.1, 1], [1.2, -2.1, 1], [3.6, -3.7], [9, -3.4], [10, -9], [-2, -18], [-13, -9]], wolfT.back);
      patch([[-11, 1.4], [-7, 1.2], [-3.4, 2.4], [-0.4, 3.2], [2.8, 2.6], [5.6, 1.5], [8.4, 2], [11, 2.7], [14, 3.1], [17, 3.4], [16, 10], [-11, 10]], wolfT.cream);
      patch(earInside(E), tone('#b9929c', { dark: '#7d5c68' }));
      lips(c, F.mouth, 7.4, 13.8, 3.9, wolfT.coat.line);
      if (F.mouth === 1) {
        // сморщенный нос
        stroke(c, [[9.4, -0.3], [10.2, 0.9]], alpha(wolfT.coat.line, 0.7), 0.6);
        stroke(c, [[11, -0.1], [11.7, 1]], alpha(wolfT.coat.line, 0.7), 0.6);
      }
    },
  });
  if (F.mouth === 2) {
    fang(g, 12.5, 4.5, 1.1, 2.7);
    fang(g, 10.1, 4.9, 0.8, 1.6);
  }
  if (F.mouth === 3) {
    // язык набок
    blob(g, [[9.2, 4.6], [11.4, 4.4], [11.8, 6.8], [10.4, 8], [9, 6.8]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  }
  if (F.eye === 'fierce') {
    fierceEye(g, 6, -2.1, 1.7, WOLF_EYE, { lid: F.lid, slant: 0.36, wide: 0.7 });
    fierceEye(g, 1.3, -1.4, 2.3, WOLF_EYE, { lid: F.lid, slant: 0.3 });
  } else {
    eye(g, 6, -2.1, 1.6, { kind: F.eye, color: '#2a1c26' });
    eye(g, 1.3, -1.4, 2.3, { kind: F.eye, color: '#2a1c26' });
  }
  nose(g, 14.3, 1.3, 1.6, '#2a2230');
}, FACES.length);

const WOLF_M = {
  kBody: 'mob.wolf.body', kHead: 'mob.wolf.head', kLeg: 'mob.wolf.leg', kTail: 'mob.wolf.tail',
  body: [-1, -14.2], neck: [10.4, -1.6], tail: [-11.6, -1.4],
  legNF: [7.6, 0.6], legFF: [10, 0.5], legNH: [-8.4, 0.6], legFH: [-6.2, 0.5], arm: [8, -1],
  leg: 13.6, sit: 3,
  style: { breath: 2.3, head: 0.05, tail: -0.7, tailF: 1.6, tailA: 0.07, pace: 15, swing: 0.72, lift: 0.3, bob: 1.3, lean: 0.05, tailRun: -0.18 },
};

function wolfPose(p, act, t, k, a) {
  const M = WOLF_M;
  switch (act) {
    case 'windup': {
      // припал к земле перед броском: грудь вниз, оскал, хвост струной; чем ближе бросок, тем сильнее дрожит
      beastIdle(p, t, M);
      const c = 0.72 + 0.28 * smooth(k);
      p[BX] = -2.6 * c + Math.sin(t * 46) * 0.3 * k;
      p[BY] = 4 * c;
      p[BR] = 0.24 * c;
      p[BSX] = 1 + 0.06 * c;
      p[BSY] = 1 - 0.1 * c;
      p[HX] = 1;
      p[HY] = 2.6 * c;
      p[HR] = 0.2;
      p[TR] = 0.95 + Math.sin(t * 46) * 0.03 * k;
      p[L1] = -0.82 * c;
      p[L1 + 1] = -0.9 * c;
      p[L1 + 2] = 0.3 * c;
      p[L1 + 3] = 0.22 * c;
      return SNARL;
    }
    case 'leap':
      beastLeap(p, k, t, M, 1);
      return k < 0.82 ? BITE : SNARL;
    case 'attack': {
      // укус с места: голова выстреливает вперёд с раскрытой пастью и щёлкает
      beastIdle(p, t, M);
      const snap = k < 0.3 ? easeOut(k / 0.3) : 1 - smooth((k - 0.3) / 0.7);
      p[BX] += 2.4 * snap;
      p[BR] += 0.07 * snap;
      p[HX] += 3.6 * snap;
      p[HY] += 0.9 * snap;
      p[HR] += 0.1 * snap;
      p[TR] += 0.5 * snap;
      p[L1] -= 0.3 * snap;
      p[L1 + 1] -= 0.3 * snap;
      p[L1 + 2] += 0.3 * snap;
      p[L1 + 3] += 0.3 * snap;
      return k < 0.34 ? BITE : SNARL;
    }
    default:
      return beastCommon(p, act, t, k, a, M);
  }
}
beastRig('wolf', WOLF_M, wolfPose);
RIG_INFO.wolf = { acts: [...COMMON, 'leap'], w: 72, h: 46, shadow: 32 };

// ---------- рысь ----------
// Рыжая в тёмных пятнах, на длинных лапах, с кисточками на ушах, бакенбардами и куцым хвостом с чёрным кончиком.

const LYNX = { coat: '#dba768', light: '#f7d7a2', dark: '#a8733b', back: '#bd8648', cream: '#fdf6e8', creamShade: '#dcc6a4', ink: 0.66 };
const lynxT = furTones(LYNX);
const LYNX_SPOT = alpha('#6f4424', 0.85);
const LYNX_TIP = tone('#2e2420', { light: '#5a4a44', dark: '#18100e' });
const LYNX_EYE = '#d4e84a';

definePart('mob.lynx.body', [-13, -8.8, 13.2, 8.2], (g) => {
  // круп выше холки: задние лапы у рыси длиннее
  blob(g, [[-10.4, -2.4], [-7, -6.4], [-1, -6.6], [5, -6], [9.4, -4.2], [11.2, -0.4], [10.2, 3.6], [6.4, 6], [0.6, 5.4], [-4.2, 4.6], [-8.4, 5.2],
    [-11, 1.6]], lynxT.coat, {
    over(c, patch) {
      patch([[-9, 5.6], [-4.2, 3.4], [0.6, 4], [6, 3.2], [14, -0.4], [14, 10], [-11, 10]], lynxT.cream);
      glow(c, -6.4, -1.2, 5, LYNX.light, 0.45);
      glow(c, 10, -1.6, 6.4, darken(LYNX.dark, 0.25), 0.5);
      spots(c, [[-7.6, -3.6, 1.1, 0.8, 0.3], [-4.6, -1.2, 1, 0.75, -0.2], [-8.2, 0.6, 0.9, 0.7, 0.4], [-1.6, -4, 1.1, 0.8, 0.1], [1.4, -1.4, 0.95, 0.7, 0.5],
        [4.2, -3.8, 1, 0.75, -0.3], [-3.4, 1.6, 0.8, 0.6, 0], [6, -0.8, 0.8, 0.6, 0.2]], LYNX_SPOT);
    },
  });
});

const LYNX_LEG = [[-2.9, 0], [0, -2.9], [2.9, 0], [2.6, 6.6], [5.4, 9.6], [4.6, 12.2], [-1.8, 12.2], [-2.9, 9.6], [-2.4, 4.6]];
legPart('mob.lynx.leg', [-4.2, -3.8, 6.8, 13.4], LYNX_LEG, lynxT, {
  over(c, patch, v) {
    if (!v) spots(c, [[0.2, 4.6, 0.8, 0.6, 0.2], [-0.8, 6.8, 0.7, 0.5, 0], [1, 7.6, 0.6, 0.5, 0.3]], LYNX_SPOT);
    stroke(c, [[2.6, 10.6], [2.4, 11.9]], alpha(lynxT.coat.line, v ? 0.5 : 0.8), 0.5);
    stroke(c, [[4, 10.5], [3.9, 11.7]], alpha(lynxT.coat.line, v ? 0.5 : 0.8), 0.5);
  },
});

tailPart('mob.lynx.tail', [-8.4, -4, 3.4, 4], [...tailJoint(2.4), [-3.4, 2.9], [-5.8, 2.2], [-7, 0], [-5.8, -2.2], [-3.4, -2.9]], lynxT.coat,
  (c, patch) => patch([[-3.6, -6, 1], [-4.4, -1], [-3.4, 0.6, 1], [-4.4, 2], [-3.8, 6, 1], [-12, 6], [-12, -6]], LYNX_TIP));

const LYNX_HC = [3, -2.2];
definePart('mob.lynx.head', [-12, -20.4, 15.4, 12.4], (g, v) => {
  const F = FACES[v];
  g.translate(LYNX_HC[0], LYNX_HC[1]);
  // кисточка на кончике уха: три чёрных волоска
  const tuft = (E) => {
    for (const [u, len] of [[-0.1, 1.34], [0.04, 1.46], [0.18, 1.3]]) stroke(g, [E(0.03, 0.94), E(u, len)], LYNX_TIP.fill, 0.75);
  };
  const EF = earAxes(1.4, -5.4, 5.6, -5.2, 7, F.ear * 0.7 + 0.16);
  tuft(EF);
  farEar(g, 1.4, -5.4, 5.6, -5.2, 7, F.ear * 0.7 + 0.16, { ...lynxT.far, lw: 1.2 });
  if (F.mouth === 2) jawOpen(g, 3.6, 3.4, 6.2, 3, 0.62, { ...lynxT.cream, lw: 1.2 }, { fang: 0.9, fangH: 2 });
  const E = earAxes(-5, -4.8, -0.4, -6.4, 7.8, F.ear);
  tuft(E);
  blob(g, [[-7, 0.6], [-6.4, -2.6], [-5, -4.8], ...earSharp(E), [-0.4, -6.4], [3.4, -6], [6.2, -3.8], [7.4, -1.2], [9.4, 0.2], [10.6, 2], [9.8, 4],
    [7.2, 5.2], [3.6, 5.8], [1, 6.4], [-0.6, 9.6, 1], [-2.2, 6.6], [-4.2, 9.4, 1], [-5, 6], [-8.2, 7.6, 1], [-7, 3.6], [-9.2, 2.4, 1]], lynxT.coat, {
    over(c, patch) {
      // светлые бакенбарды, морда и подбородок
      patch([[-11, 3.6], [-6, 2.8], [-2.4, 3.2], [0.6, 2.4], [3.4, 0.8], [5.6, 0.2], [8, 0.8], [12, 1], [12, 11], [-11, 11]], lynxT.cream);
      patch(earInside(E), tone('#f0c9b4', { dark: '#c99a86' }));
      // чёрный кончик уха
      patch([E(-0.6, 0.7), E(-0.1, 0.64, 1), E(0.1, 0.7, 1), E(0.6, 0.62), E(0.6, 1.5), E(-0.6, 1.5)], LYNX_TIP);
      spots(c, [[-2.4, -3.6, 0.8, 0.5, 0.3], [0.6, -4.4, 0.8, 0.5, 0.1], [3.4, -4.2, 0.7, 0.45, -0.2]], LYNX_SPOT);
      // тёмные полоски на бакенбардах
      stroke(c, [[-6.6, 4.4], [-5, 6.6]], LYNX_SPOT, 0.8);
      stroke(c, [[-3.4, 4.6], [-2.4, 7.2]], LYNX_SPOT, 0.8);
      lips(c, F.mouth, 5.4, 10, 3.8, lynxT.coat.line);
    },
  });
  if (F.mouth === 2) {
    fang(g, 8.8, 4.4, 0.9, 2.3);
    fang(g, 7, 4.9, 0.7, 1.4);
  }
  if (F.mouth === 3) blob(g, [[6.6, 4.6], [8.4, 4.4], [8.8, 6.4], [7.6, 7.4], [6.4, 6.4]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  if (F.eye === 'fierce') {
    fierceEye(g, 6.3, -1.9, 1.9, LYNX_EYE, { lid: F.lid - 0.08, slant: 0.34, wide: 0.72, slit: 0.2 });
    fierceEye(g, 1.5, -1.1, 2.6, LYNX_EYE, { lid: F.lid - 0.08, slant: 0.28, slit: 0.2 });
  } else {
    eye(g, 6.3, -1.9, 1.7, { kind: F.eye, color: '#2e2420' });
    eye(g, 1.5, -1.1, 2.5, { kind: F.eye, color: '#2e2420' });
  }
  nose(g, 10.1, 1.8, 1.25, '#c8686a');
}, FACES.length);

const LYNX_M = {
  kBody: 'mob.lynx.body', kHead: 'mob.lynx.head', kLeg: 'mob.lynx.leg', kTail: 'mob.lynx.tail',
  body: [-1.5, -13.2], neck: [8.6, -2.2], tail: [-9.8, -2.6],
  legNF: [6.2, 0.4], legFF: [8.4, 0.3], legNH: [-6.6, 0.4], legFH: [-4.6, 0.3], arm: [7, -2],
  leg: 12.8, sit: 3,
  style: { breath: 2.6, head: 0.02, tail: 0.55, tailF: 2.3, tailA: 0.12, pace: 16, swing: 0.8, lift: 0.34, bob: 1.5, lean: 0.04, tailRun: 0.2 },
};

function lynxPose(p, act, t, k, a) {
  const M = LYNX_M;
  switch (act) {
    case 'windup': {
      // кошачья стойка перед прыжком: грудь у земли, круп выше и виляет, хвост дёргается всё чаще
      beastIdle(p, t, M);
      const c = 0.75 + 0.25 * smooth(k);
      const wig = Math.sin(t * 17);
      p[BX] = -1.4 * c + wig * 0.5;
      p[BY] = 3.4 * c;
      p[BR] = 0.32 * c + wig * 0.035;
      p[BSY] = 1 - 0.07 * c;
      p[HX] = 0.6;
      p[HY] = 2.2 * c;
      p[HR] = -0.04;
      p[TR] = 0.2 + Math.sin(t * 23) * 0.55 * (0.5 + 0.5 * k);
      p[L1] = -0.7 * c;
      p[L1 + 1] = -0.78 * c;
      p[L1 + 2] = 0.2 * c;
      p[L1 + 3] = 0.12 * c;
      return SNARL;
    }
    case 'leap':
      beastLeap(p, k, t, M, 1.3);
      return k < 0.82 ? BITE : SNARL;
    case 'attack': {
      // удар лапой с места: передняя взлетает и бьёт вниз
      beastIdle(p, t, M);
      const hit = easeOut(k / 0.3);
      const back = smooth((k - 0.4) / 0.6);
      const q = hit * (1 - back);
      p[BX] += 2 * q;
      p[BR] += 0.08 * q;
      p[HX] += 1.6 * q;
      p[HR] += 0.08 * q;
      p[L1] = lerp(-2.5, -0.5, hit) * (1 - back);
      p[K1] = 1.15;
      p[G1] = back;
      p[ARM] = 1 - back;
      p[TR] += 0.4 * q;
      return k < 0.4 ? BITE : SNARL;
    }
    default:
      return beastCommon(p, act, t, k, a, M);
  }
}
beastRig('lynx', LYNX_M, lynxPose);
RIG_INFO.lynx = { acts: [...COMMON, 'leap'], w: 70, h: 50, shadow: 28 };

// ---------- росомаха ----------
// Тёмная косматая глыба на коротких лапах: светлая полоса по боку, широкая голова, длинные когти. В ярости
// (a.data.rage) глаза горят красным.

const GLUT = { coat: '#5a4231', light: '#8f6d50', dark: '#33231c', back: '#3f2c23', cream: '#d6b078', creamShade: '#a8834e', ink: 0.6 };
const glutT = furTones(GLUT);
const GLUT_EYE = '#ffb629';
const GLUT_RAGE = '#ff3b30';
const CLAW = tone('#f6eedd', { light: '#ffffff', dark: '#c9b99a', line: '#5a4636', lw: 0.6 });

definePart('mob.wolverine.body', [-17, -11.2, 16.4, 11.4], (g) => {
  // бочка с горбом; по низу — косматая шерсть
  blob(g, [[-14.2, -1.6], [-10.6, -6.8], [-3, -8.6], [5, -8.8], [11, -6.6], [14.2, -1.4], [13.4, 4], [9, 7.6],
    ...tufts(9, 7.6, -11.6, 6.8, 5, 2, 0.7), [-11.6, 6.8], [-14.8, 3]], glutT.coat, {
    over(c, patch) {
      patch([[-18, -3], [-10, -4.6], [-2, -5.6], [6, -5.4], [12, -3.6], [18, -4], [18, -13], [-18, -13]], glutT.back);
      // светлая полоса от плеча по боку к хвосту
      patch([[11, -2.2], [5, -0.4], [-3, 0.6], [-10, -0.2], [-17, -3], [-17, 1.6], [-10, 4], [-3, 4.6], [5, 3.4], [11.6, 1]], glutT.cream);
      glow(c, -8, -4, 5.6, GLUT.light, 0.4);
      glow(c, 12.6, -1, 7, darken(GLUT.dark, 0.3), 0.6);
      fur(c, [[-9, 5.4, 1.2, 2.6], [-4, 6, 1.2, 2.6], [1.4, 6.2, 1.3, 2.6], [6.4, 5.6, 1.3, 2.4], [-6, -6.4, 0.3, 2.6], [1, -7, 0.2, 2.6]], alpha(GLUT.dark, 0.7));
    },
  });
});

const GLUT_LEG = [[-3.6, 0], [0, -3.6], [3.6, 0], [3.4, 4.2], [6, 6], [5.4, 8.4], [-2.2, 8.4], [-3.6, 6.2], [-3.2, 3]];
legPart('mob.wolverine.leg', [-5, -4.6, 9, 10.4], GLUT_LEG, glutT, {
  lw: 1.35, fade: 1.2,
  after(g, v) {
    // когти: три, длинные, загнуты вниз
    for (const [x, y, len] of [[3, 7.6, 2], [4.6, 7.4, 2.3], [6, 6.8, 2.2]]) {
      solid(g, (c) => pathPoly(c, [[x - 0.7, y - 0.3], [x + 0.8, y - 0.5], [x + len * 0.8, y + 1.8]]), v ? { ...CLAW, fill: '#cfc3a8' } : CLAW);
    }
  },
});

tailPart('mob.wolverine.tail', [-12.4, -5.4, 4.6, 5.6], [...tailJoint(3.6), [-3.6, 4.4], [-7, 4.2, 1], [-7.6, 2.6], [-10.6, 2, 1], [-9.4, 0], [-10.8, -1.8, 1],
  [-7.4, -2.6], [-6.6, -4.2, 1], [-3.4, -4.2]], glutT.back);

const GLUT_HC = [3.6, 0.4];
// 0…4 — выражения морды, 5…9 — они же в ярости (глаза красные и светятся)
definePart('mob.wolverine.head', [-8, -11.4, 18.4, 14.4], (g, v) => {
  const F = FACES[v % 5];
  const rage = v >= 5;
  const iris = rage ? GLUT_RAGE : GLUT_EYE;
  g.translate(GLUT_HC[0], GLUT_HC[1]);
  farEar(g, 1.8, -5.8, 5.6, -5.2, 3.2, F.ear * 0.5, { ...glutT.far, lw: 1.2 }, earRound);
  if (F.mouth === 2) jawOpen(g, 3.4, 3.4, 7.6, 3.8, 0.66, { ...glutT.coat, lw: 1.2 }, { fang: 1.2, fangH: 2.6 });
  const E = earAxes(-5.6, -4.6, -1.8, -6.2, 3.6, F.ear * 0.5);
  blob(g, [[-7.6, 1.2], [-7, -2.4], [-5.6, -4.6], ...earRound(E), [-1.8, -6.2], [2.6, -6.2], [6, -4.2], [7.6, -1.6], [9.8, -0.6], [11.4, 1], [11.2, 3.6],
    [8.6, 5.6], [4, 6.4], [-0.6, 6.6], [-3, 8.4, 1], [-4.2, 6.2], [-7, 6.8, 1], [-7, 3.6]], glutT.coat, {
    over(c, patch) {
      // светлая повязка через лоб на щёку; морда и «очки» вокруг глаз — тёмные
      patch([[-10, -3.2], [-3, -5.6], [2, -5.2], [5.6, -3.4], [3.6, -1.9], [-1, -2.5], [-4.6, -0.6], [-6.2, 3], [-10, 3.6]], glutT.cream);
      patch([[6.6, -0.6], [9.6, -1.2], [13, 0], [13, 5], [8.6, 5.6], [5.8, 3.2]], glutT.back);
      patch(earInside(E), tone('#3a2820', { dark: '#22140f' }));
      lips(c, F.mouth, 5.6, 10.6, 3.7, rage ? '#1c100c' : glutT.coat.line);
    },
  });
  if (F.mouth === 2) {
    fang(g, 9.6, 4.6, 1.2, 2.9);
    fang(g, 7.2, 5.2, 0.9, 1.8);
  }
  if (F.mouth === 3) blob(g, [[7, 4.8], [9, 4.6], [9.4, 6.8], [8.2, 7.8], [6.8, 6.8]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  if (F.eye === 'fierce') {
    fierceEye(g, 6.7, -1.5, 1.5, iris, { lid: F.lid, slant: 0.4, wide: 0.72, shine: rage ? 0.7 : 0, rim: '#1c100c' });
    fierceEye(g, 2.3, -0.7, 2, iris, { lid: F.lid, slant: 0.34, shine: rage ? 0.7 : 0, rim: '#1c100c' });
  } else {
    eye(g, 6.7, -1.5, 1.5, { kind: F.eye, color: '#fff1dc' });
    eye(g, 2.3, -0.7, 2.1, { kind: F.eye, color: '#fff1dc' });
  }
  nose(g, 10.9, 1.5, 1.6, '#1c1214');
}, FACES.length * 2);

// серп — выпуклой стороной вправо (вперёд): радиус R вокруг нуля, half — половина раствора, d — сдвиг внутренней дуги
function pathCrescent(g, R, half, d) {
  const px = R * Math.cos(half);
  const py = R * Math.sin(half);
  const r2 = Math.hypot(px + d, py);
  const a2 = Math.atan2(py, px + d);
  g.moveTo(px, -py);
  g.arc(0, 0, R, -half, half);
  g.arc(-d, 0, r2, a2, -a2, true);
  g.closePath();
  return [px - 1, -py, R, py];
}

// след когтей: три дуги вокруг плеча (оно в нуле) — рисуется во время удара
definePart('mob.wolverine.swipe', [-0.6, -21, 23.6, 21], (g) => {
  for (const [R, half, w] of [[13.6, 0.8, 2.4], [17.6, 1, 3], [21.6, 0.84, 2.6]]) {
    g.beginPath();
    pathCrescent(g, R, half, w);
    g.fillStyle = linear(g, R * 0.6, -R, R, R * 0.6, [[0, 'rgba(255,250,236,0.35)'], [0.55, '#fffaec'], [1, 'rgba(255,236,196,0.75)']]);
    g.fill();
    g.strokeStyle = alpha('#e2622a', 0.9);
    g.lineWidth = 0.8;
    g.lineJoin = 'round';
    g.stroke();
  }
}, 1, 0.5);

// рёв: дуги от пасти (она в нуле) — расходятся, пока росомаха ярится
definePart('mob.wolverine.roar', [-0.6, -8.6, 13, 8.6], (g) => {
  g.lineCap = 'round';
  for (const [R, half] of [[4.6, 0.62], [8, 0.7], [11.4, 0.66]]) {
    for (const [color, lw] of [[alpha('#5a2a22', 0.5), 2], ['#fff6e2', 1.1]]) {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(0, 0, R, -half, half);
      g.stroke();
    }
  }
}, 1, 0.5);

const GLUT_M = {
  kBody: 'mob.wolverine.body', kHead: 'mob.wolverine.head', kLeg: 'mob.wolverine.leg', kTail: 'mob.wolverine.tail',
  body: [-1, -14.6], neck: [11.8, -1.6], tail: [-13.4, -1.8],
  legNF: [8.6, 5.4], legFF: [11, 5.2], legNH: [-9.2, 5.4], legFH: [-7, 5.2], arm: [9.4, -1.6],
  leg: 9.2, sit: 2,
  style: { breath: 2, head: 0.04, tail: -0.95, tailF: 1.4, tailA: 0.05, pace: 11.5, swing: 0.6, lift: 0.24, bob: 1, lean: 0.03, tailRun: -0.5 },
};

let glutRage = 0;      // в ярости — картинки головы с красными глазами
let glutArc = 0;       // угол следа когтей и его яркость
let glutArcA = 0;
let glutRoar = 0;      // сила рёва 0…1

function glutPose(p, act, t, k, a) {
  const M = GLUT_M;
  glutRage = a.data && a.data.rage ? 5 : 0;
  glutArcA = 0;
  glutRoar = 0;
  switch (act) {
    case 'windup': {
      // встала на дыбы, лапа занесена над головой: чем ближе удар, тем сильнее дрожит
      beastIdle(p, t, M);
      const c = 0.75 + 0.25 * smooth(k);
      p[BR] = -0.3 * c;
      p[BX] = -1.5 * c + Math.sin(t * 44) * 0.3 * k;
      p[BY] = -1.6 * c;
      p[HX] = -0.4;
      p[HY] = -0.6 * c;
      p[HR] = -0.2 * c;
      p[L1] = -2.75 * c + Math.sin(t * 9) * 0.06;
      p[K1] = 1.5;
      p[G1] = 0;
      p[ARM] = 1;
      p[L1 + 1] = -0.7 * c;
      p[K1 + 1] = 0.95;
      p[G1 + 1] = 0;
      p[L1 + 2] = 0.12;
      p[L1 + 3] = 0.06;
      p[TR] = M.style.tail + 0.6 * c;
      return SNARL + glutRage;
    }
    case 'attack': {
      // широкий удар: лапа сверху вниз за первую треть, потом возвращается
      beastIdle(p, t, M);
      const hit = easeOut(k / 0.32);
      const back = smooth((k - 0.45) / 0.55);
      const hold = 1 - back;
      p[BR] = lerp(-0.3, 0.16, hit) * hold;
      p[BX] = lerp(-1.5, 3.4, hit) * hold;
      p[BY] = lerp(-1.6, 0.6, hit) * hold;
      p[HX] = 1.2 * hit * hold;
      p[HR] = lerp(-0.2, 0.14, hit) * hold;
      p[L1] = lerp(-2.75, -0.35, hit) * hold;
      p[K1] = lerp(1.5, 1.25, hit);
      p[G1] = back;
      p[ARM] = hold;
      p[L1 + 1] = lerp(-0.7, -0.2, hit) * hold;
      p[G1 + 1] = hit;
      p[TR] = M.style.tail + 0.6 * hold;
      glutArc = lerp(-0.9, 0.55, hit);
      glutArcA = smooth(k / 0.08) * (1 - smooth((k - 0.24) / 0.3));
      return (k < 0.5 ? BITE : SNARL) + glutRage;
    }
    case 'rage': {
      // рёв: на дыбы, голова запрокинута, шерсть дыбом, всю трясёт; с этого рёва глаза краснеют
      beastIdle(p, t, M);
      const up = smooth(k / 0.22) * (1 - smooth((k - 0.82) / 0.18));
      p[BR] = -0.34 * up;
      p[BX] = -1 * up + Math.sin(t * 52) * 0.45 * up;
      p[BY] = -2 * up;
      p[BSY] = 1 + 0.06 * up;
      p[HX] = -0.6 * up;
      p[HY] = -1.2 * up;
      p[HR] = -0.5 * up + Math.sin(t * 31) * 0.05 * up;
      p[L1] = -1.1 * up;
      p[L1 + 1] = -0.9 * up;
      p[G1] = 1 - up;
      p[G1 + 1] = 1 - up;
      p[TR] = M.style.tail + 1.1 * up;
      p[TS] = 1 + 0.2 * up;
      glutRoar = up;
      if (k > 0.25) glutRage = 5;
      return (up > 0.3 ? BITE : SNARL) + glutRage;
    }
    default:
      return beastCommon(p, act, t, k, a, M) + glutRage;
  }
}
beastRig('wolverine', GLUT_M, glutPose, (act, t) => {
  // после зверя: след когтей вокруг плеча и дуги рёва от пасти
  if (glutArcA > 0.02) put('mob.wolverine.swipe', atX(GLUT_M.arm), atY(GLUT_M.arm), glutArc, 1, 1, 0, glutArcA);
  if (glutRoar > 0.05) {
    const hx = atX(GLUT_M.neck) + P[HX];
    const hy = atY(GLUT_M.neck) + P[HY];
    const c = Math.cos(P[HR]);
    const s = Math.sin(P[HR]);
    for (let i = 0; i < 2; i++) {
      const u = loop(t, 0.42, i * 0.21);
      const d = 13 + u * 5;
      put('mob.wolverine.roar', hx + d * c - 4 * s, hy + d * s + 4 * c, P[HR] + 0.3, 0.7 + u * 0.7, 0.7 + u * 0.7, 0, (1 - u) * glutRoar);
    }
  }
});
RIG_INFO.wolverine = { acts: [...COMMON, 'rage'], w: 76, h: 52, shadow: 36 };

// ---------- остальные: кто не на четырёх лапах ----------
// Летучая мышь, пауки, крот, жук и сундук расставляют свои части сами, через тот же put(); общее у них с
// четвероногими одно — появление из метки.

/** Опорная часть (тело): её середина, наклон и растяжение — от них считаются крепления остальных. */
function stage(x, y, rot = 0, sx = 1, sy = 1) {
  ox = x;
  oy = y;
  oc = Math.cos(rot);
  os = Math.sin(rot);
  osx = sx;
  osy = sy;
}
const onX = (x, y) => ox + x * osx * oc - y * osy * os;
const onY = (x, y) => oy + x * osx * os + y * osy * oc;

/** Выпад: быстро вперёд (до доли peak) и плавно назад. */
const lunge = (k, peak = 0.3) => (k < peak ? easeOut(k / peak) : 1 - smooth((k - peak) / (1 - peak)));

/** Фигура, которая ставит части сама: draw(act, t, k, a). */
function plainRig(id, acts, w, h, shadow, draw) {
  defineRig(id, {
    draw(kit, ctx, a) {
      begin(kit, ctx);
      const k = clamp01(num(a.k));
      let act = a.act;
      if (act === 'spawn') {
        rise(k);
        act = 'idle';
      }
      draw(act, num(a.t), k, a);
    },
  });
  RIG_INFO[id] = { acts, w, h, shadow };
}

// ---------- летучая мышь ----------
// Пушистый комок с большими ушами между двух перепончатых крыльев; жёлтые глаза горят в темноте. Всегда в воздухе
// (на высоту её поднимает рендер). Замах — зависла, крылья вскинуты и дрожат, пасть раскрыта; бросок — крылья углом.

const BAT = { coat: '#4b3a5e', light: '#8370a0', dark: '#281e34', wing: '#8d62a2', wingLight: '#c29ad4', wingDark: '#553a6c', ear: '#f0a0ac', eye: '#ffd23f' };
const batCoat = tone(BAT.coat, { light: BAT.light, dark: BAT.dark, line: outline(BAT.coat, 0.6), lw: 1 });
const batWing = tone(BAT.wing, { light: BAT.wingLight, dark: BAT.wingDark, line: batCoat.line, lw: 0.9 });
const batWingFar = tone(mix(BAT.wing, BAT.wingDark, 0.75), { light: BAT.wing, dark: darken(BAT.wingDark, 0.3), line: batCoat.line, lw: 0.9, rim: 0.2 });

// крыло: растёт из плеча (оно в нуле) вправо; перепонка с зубцами по нижнему краю. 0 — ближнее, 1 — дальнее
const BAT_WING = [[-0.6, -1.5], [2.2, -3.6], [4.6, -4.6, 1], [7.4, -3.8], [9.8, -1.6, 1], [7.6, 0.2], [6.6, 3, 1], [4.6, 1.2], [3.5, 3.9, 1], [1.8, 1.7], [-0.6, 2.2]];
definePart('mob.bat.wing', [-1.8, -5.8, 11, 5.2], (g, v) => {
  blob(g, BAT_WING, v ? batWingFar : batWing, {
    over(c) {
      // кости: плечо до запястья и два пальца к зубцам перепонки
      const bone = alpha(BAT.dark, v ? 0.5 : 0.7);
      stroke(c, [[-0.4, -0.5], [2.4, -2.9], [4.6, -4.2]], bone, 0.9);
      stroke(c, [[4.6, -4.2], [6.4, -0.8], [6.6, 2.6]], bone, 0.5);
      stroke(c, [[4.6, -4.2], [4.1, -0.2], [3.5, 3.4]], bone, 0.5);
    },
  });
}, 2);

// тело с головой заодно; сустав — середина. 0 — злая, 1 — пасть раскрыта, 2 — больно, 3 — оглушена
definePart('mob.bat.body', [-6.4, -11.6, 6.8, 6.8], (g, v) => {
  const ear = (x0, y0, x1, y1, h, lean, look) => {
    const E = earAxes(x0, y0, x1, y1, h, lean);
    blob(g, [[x0, y0], ...earSharp(E), [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2 + 2]], look);
    blob(g, earInside(E), tone(BAT.ear, { dark: '#b8687c', lw: 0 }));
  };
  ear(0.2, -3.6, 3.8, -3, 6, 0.24, { ...batCoat, fill: mix(BAT.coat, BAT.dark, 0.5), lw: 0.9 });
  ear(-3.8, -3, -0.2, -3.8, 6.8, -0.14, { ...batCoat, lw: 0.9 });
  blob(g, [[-4.5, 0.4], [-3.9, -2.8], [-1.6, -4.5], [1.6, -4.5], [4, -2.6], [4.7, 0.4], [3.6, 3.2], [1.8, 4.6], ...tufts(1.8, 4.6, -2.2, 4.6, 2, 1.1, 0.5),
    [-2.2, 4.6], [-3.8, 3]], batCoat, {
    over: (c) => glow(c, 1, 2.8, 3, BAT.light, 0.45),             // светлая грудка
  });
  if (v >= 2) {
    const kind = v === 2 ? 'squint' : 'cross';
    eye(g, 3, -1, 1, { kind, color: '#fff1dc' });
    eye(g, 0, -0.8, 1.3, { kind, color: '#fff1dc' });
  } else {
    fierceEye(g, 3, -1, 0.95, BAT.eye, { lid: 0.3, slant: 0.4, wide: 0.75, shine: 0.5, rim: BAT.dark });
    fierceEye(g, 0, -0.8, 1.3, BAT.eye, { lid: 0.3, slant: 0.32, shine: 0.5, rim: BAT.dark });
  }
  g.fillStyle = '#e88a9a';
  g.beginPath();
  g.ellipse(2.3, 0.7, 0.6, 0.45, 0, 0, TAU);
  g.fill();
  if (v === 1) {
    g.fillStyle = MOUTH;
    g.beginPath();
    g.ellipse(1.9, 2.5, 1.8, 1.4, 0, 0, TAU);
    g.fill();
    fang(g, 1, 1.5, 0.45, 1.5);
    fang(g, 2.8, 1.4, 0.45, 1.5);
  } else {
    stroke(g, [[0.6, 1.8], [1.9, 2.2], [3.1, 1.7]], alpha(BAT.dark, 0.9), 0.6);
    fang(g, 1.1, 1.9, 0.35, 1);
    fang(g, 2.7, 1.8, 0.35, 1);
  }
}, 4);

function drawBat(act, t, k, a) {
  let face = 0;
  let beat = 22;        // как часто машет
  let amp = 0.8;        // размах крыла
  let mid = -0.1;       // его среднее положение (минус — кверху)
  let span = 1;         // насколько крылья расправлены
  let x = 0;
  let y = -7.4;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  switch (act) {
    case 'move':
      rot = 0.14 * clamp01(num(a.speed, 1));
      beat = 26;
      break;
    case 'windup': {
      // зависла перед броском: крылья вскинуты и мелко дрожат, пасть раскрыта; чем ближе укус, тем дальше отходит
      const c = 0.7 + 0.3 * smooth(k);
      mid = -0.8 * c;
      amp = 0.2;
      beat = 48;
      x = -2.4 * c;
      y -= 1.4 * c;
      rot = -0.24 * c;
      face = 1;
      break;
    }
    case 'attack': {
      // бросок: крылья сложены углом над спиной, тело вытянуто носом вниз; к концу расправляются
      const s = smooth(k / 0.12) * (1 - smooth((k - 0.72) / 0.28));
      mid = lerp(-0.1, -1, s);
      amp = lerp(0.8, 0.08, s);
      span = 1 - 0.4 * s;
      rot = 0.3 * s;
      sx = 1 + 0.16 * s;
      sy = 1 - 0.1 * s;
      x = 1.6 * s;
      if (k < 0.85) face = 1;
      break;
    }
    case 'recover': {
      // отдувается: тяжёлые редкие взмахи, висит пониже
      const q = 1 - smooth((k - 0.5) / 0.5);
      beat = 13;
      amp = 0.8 + 0.2 * q;
      y += 1.6 * q;
      rot = 0.1 * q;
      break;
    }
    case 'stun':
      face = 3;
      mid = 0.9;
      amp = 0.1;
      beat = 9;
      y += 1.6 + Math.sin(t * 4.2) * 0.8;
      rot = Math.sin(t * 4.2) * 0.3;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -2.8 * q;
      y -= q;
      rot = -0.4 * q;
      if (k < 0.7) face = 2;
      break;
    }
    default:
  }
  const flap = Math.sin(t * beat);
  const wing = mid + flap * amp;
  y -= flap * amp * 1.1;                  // крылья вниз — тело вверх
  stage(x, y, rot, sx, sy);
  put('mob.bat.wing', onX(-2.4, -1), onY(-2.4, -1), rot - wing, -span, 1, 1);
  put('mob.bat.wing', onX(2.6, -0.8), onY(2.6, -0.8), rot + wing, span, 1, 0);
  put('mob.bat.body', ox, oy, rot, sx, sy, face);
}
plainRig('bat', COMMON, 34, 30, 12, drawBat);

// ---------- паук и паучья королева ----------
// Одна фигура на двоих: королева — тот же паук, только вчетверо больше, с золотой короной на брюшке вместо рыжих
// «песочных часов» и лишней парой глаз. Мохнатое брюшко висит между восьми лап, колени — выше спины; глаза горят.
// Замах — встал на задние лапы, передние перебирают в воздухе, жвалы раскрыты.

const SPIDER_KINDS = {
  spider: { u: 1, lw: 1.1, coat: '#4a3a52', light: '#806c8e', dark: '#271e2e', mark: '#ff7a3c', markDark: '#c4481c', eye: '#ff5a4a', fang: 1, breath: 3.1, pace: 17 },
  spiderqueen: { u: 3.7, lw: 1.9, coat: '#3f3058', light: '#7a66a0', dark: '#1f1730', mark: '#ffc93c', markDark: '#c8901c', eye: '#ff4d8a', fang: 1.3, breath: 1.9, pace: 9, queen: true },
};

const SPIDER_M = {};         // по виду: размер и картинки — по ним фигура собирается

// числа ниже — для обычного паука, в осях его тела; у королевы всё множится на u
function defineSpider(id, S, acts, w, h, shadow) {
  const u = S.u;
  const lw = S.lw / u;
  const coat = tone(S.coat, { light: S.light, dark: S.dark, line: outline(S.coat, 0.6), lw });
  const far = tone(mix(S.coat, S.dark, 0.7), { light: S.coat, dark: darken(S.dark, 0.3), line: coat.line, lw: lw * 0.9, rim: 0.2 });
  const mark = tone(S.mark, { dark: S.markDark, line: coat.line, lw });
  const box = (b) => b.map((n) => n * u);
  const M = { u, kLeg: `mob.${id}.leg`, kBody: `mob.${id}.body`, breath: S.breath, pace: S.pace, queen: Boolean(S.queen) };
  SPIDER_M[id] = M;

  // лапа дугой: от сустава (он в нуле) вверх к колену и вниз к земле. 0 — ближняя (у сустава тает), 1 — дальняя
  definePart(M.kLeg, box([-2.2, -13.3, 12, 8.6]), (g, v) => {
    g.scale(u, u);
    const look = v ? far : coat;
    limb(g, 0, 0, 1.2, 4.4, -11.2, 0.95, look);
    limb(g, 4.4, -11.2, 0.95, 10.4, 7, 0.45, look);
    // щетинки
    for (const [x1, y1, x2, y2] of [[0.9, -5.2, -0.4, -5.8], [2.2, -8.4, 0.9, -9], [7.2, -5.1, 8.5, -5.5], [8.9, 0.4, 10.2, 0]]) {
      stroke(g, [[x1, y1], [x2, y2]], look.line, 0.4);
    }
    if (!v) fadeEdge(g, -0.7, 0, 1.3, 0);         // тает только у сустава: стопа ниже него, вдоль лапы растворять нельзя
  }, 2);

  // тело: брюшко сзади, головогрудь с глазами спереди; сустав — середина.
  // 0 — злой, 1 — жвалы раскрыты, 2 — больно, 3 — оглушён
  definePart(M.kBody, box([-12.4, -8.8, 9.8, 8.4]), (g, v) => {
    g.scale(u, u);
    blob(g, [[-10.8, -0.2], [-9.5, -3.7], ...tuftsArc(-4.6, -0.4, 5.9, -2.55, -0.75, 4, 1.05, 0.6), [-0.3, -4.4], [1.3, -1.6], [1.5, 1.4], [0, 3.9], [-3, 5.1],
      [-7, 4.6], [-9.8, 2.6]], coat, {
      over(c, patch) {
        if (S.queen) {
          // корона: три зубца и камни под ними
          patch([[-9.2, 1.2], [-8.9, -2.4, 1], [-7.5, -0.4, 1], [-6, -3.4, 1], [-4.5, -0.4, 1], [-3.1, -2.4, 1], [-2.8, 1.2], [-6, 2.3]], mark);
          c.fillStyle = S.eye;
          for (const x of [-7.7, -6, -4.3]) {
            c.beginPath();
            c.arc(x, 0.9, 0.5, 0, TAU);
            c.fill();
          }
        } else {
          // «песочные часы»
          patch([[-7.9, -2.7, 1], [-4.1, -2.7, 1], [-6, -0.3, 1]], mark);
          patch([[-6, 0.3, 1], [-4.2, 2.7, 1], [-7.8, 2.7, 1]], mark);
        }
        glow(c, -8.6, -2.4, 2.6, S.light, 0.4);
        fur(c, [[-9.4, 1.6, 1.2, 1.5], [-1.4, 2.6, 1.9, 1.5], [-6, 3.8, 1.5, 1.4], [-3.4, 4, 1.7, 1.4]], alpha(S.dark, 0.7), 0.5);
      },
    });
    blob(g, [[0.6, 0.6], [1.6, -1.8], [4.2, -2.7], [6.8, -1.9], [8.2, 0.6], [7.6, 3.2], [5.2, 4.6], [2.4, 4.2], [0.9, 2.6]], coat, {
      over: (c) => glow(c, 3, -1, 2.4, S.light, 0.35),
    });
    // жвалы
    const open = v === 1;
    if (open) {
      g.fillStyle = MOUTH;
      g.beginPath();
      g.ellipse(6.3, 4.3, 1.7, 1.3, 0, 0, TAU);
      g.fill();
    }
    fang(g, open ? 4.9 : 5.4, 4.1, 0.55 * S.fang, (open ? 2.4 : 1.7) * S.fang);
    fang(g, open ? 7.5 : 7.2, 3.6, 0.5 * S.fang, (open ? 2.2 : 1.5) * S.fang);
    // глаза-бусины: светятся
    const bead = (x, y, r) => {
      glow(g, x, y, r * 2.4, S.eye, 0.55);
      g.fillStyle = S.dark;
      g.beginPath();
      g.arc(x, y, r + 0.3, 0, TAU);
      g.fill();
      g.fillStyle = S.eye;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      speck(g, x - r * 0.3, y - r * 0.35, r * 0.34, 0.95);
    };
    if (v >= 2) {
      const kind = v === 2 ? 'squint' : 'cross';
      eye(g, 4.6, 0.3, 1.3, { kind, color: '#fff1dc' });
      eye(g, 7, 0.5, 1, { kind, color: '#fff1dc' });
    } else {
      bead(4.6, 0.3, 1.15);
      bead(7, 0.5, 0.85);
      // хмурые брови
      stroke(g, [[3.2, -1.2], [5.9, -0.3]], S.dark, 0.6);
      stroke(g, [[6.2, -0.4], [7.9, -0.6]], S.dark, 0.5);
    }
    bead(3.3, -1.6, 0.42);
    bead(6, -1.8, 0.38);
    if (S.queen) {
      bead(2.1, 0.5, 0.36);
      bead(7.9, -1.1, 0.3);
    }
  }, 4);

  plainRig(id, acts, w, h, shadow, (act, t, k, a) => drawSpider(M, act, t, k, a));
}

// лапы: сустав в осях тела (x, y), размах (минус — назад), длина, шагает ли в противофазе; первые четыре — дальние
const SPIDER_LEGS = [
  [1.4, 1, 0.86, 0.94, 1], [1, 1, 0.42, 0.9, 0], [-0.8, 1, -0.4, 0.9, 1], [-1.2, 1, -0.82, 0.92, 0],
  [0.6, 1.6, 1.06, 1, 0], [0.2, 1.8, 0.62, 0.97, 1], [-0.2, 1.8, -0.58, 0.97, 0], [-0.6, 1.6, -1, 1, 1],
];
const FRONT = [0, 1, 4, 5];   // передние лапы: ими паук замахивается и бьёт
const SPIDER_FOOT = 7;        // на сколько стопа ниже сустава
const SPIDER_REST = -8.6;     // середина тела над землёй
// поза лап — по четыре числа на лапу: подъём (поворот от земли), размах, длина, стоит ли на земле
const SP_LIFT = 0;
const SP_REACH = 1;
const SP_LEN = 2;
const SP_GROUND = 3;
const SP = new Float32Array(8 * 4);

function spiderLeg(i, lift, ground, len = 1) {
  SP[i * 4 + SP_LIFT] = lift;
  SP[i * 4 + SP_GROUND] = ground;
  SP[i * 4 + SP_LEN] = len;
}

// шаг: лапа, что идёт вперёд, приподнята; соседние — в противофазе
function spiderWalk(t, pace, speed) {
  for (let i = 0; i < 8; i++) {
    const L = SPIDER_LEGS[i];
    const ph = t * pace + (L[4] ? Math.PI : 0) + (i < 4 ? 0.9 : 0);
    SP[i * 4 + SP_REACH] = 1 + Math.sin(ph) * 0.2 * speed * (L[2] < 0 ? -1 : 1);
    SP[i * 4 + SP_LEN] = 1 - Math.max(0, Math.cos(ph)) * 0.17 * speed;
  }
}

function spiderLegs(M, from, to, lean) {
  const u = M.u;
  for (let i = from; i < to; i++) {
    const L = SPIDER_LEGS[i];
    const x = onX(L[0] * u, L[1] * u);
    const y = onY(L[0] * u, L[1] * u);
    const lift = SP[i * 4 + SP_LIFT];
    const ground = SP[i * 4 + SP_GROUND];
    const back = L[2] < 0;
    // стоит — сама дотягивается до земли; на весу — наклоняется вместе с телом
    const fit = clamp(-y / (SPIDER_FOOT * u * Math.max(0.4, Math.cos(lift))), 0.3, 1.4);
    put(M.kLeg, x, y, (back ? lift : -lift) + lean * (1 - ground), L[2] * SP[i * 4 + SP_REACH], L[3] * SP[i * 4 + SP_LEN] * lerp(1, fit, ground), i < 4 ? 1 : 0);
  }
}

function drawSpider(M, act, t, k, a) {
  const breath = Math.sin(t * M.breath);
  let face = 0;
  let x = 0;
  let y = breath * 0.25;
  let rot = 0;
  let sx = 1;
  let sy = 1 + breath * 0.02;
  let wide = 1;         // лапы шире обычного
  for (let i = 0; i < 8; i++) {
    SP[i * 4 + SP_LIFT] = 0;
    SP[i * 4 + SP_REACH] = 1;
    SP[i * 4 + SP_LEN] = 1;
    SP[i * 4 + SP_GROUND] = 1;
  }
  switch (act) {
    case 'move': {
      const sp = Math.max(clamp01(num(a.speed, 1)), 0.4);
      spiderWalk(t, M.pace, sp);
      y += Math.sin(t * M.pace * 2) * 0.3 * sp;
      rot = Math.sin(t * M.pace) * 0.03;
      break;
    }
    case 'windup': {
      // встал на задние лапы: передние вскинуты и перебирают в воздухе, жвалы раскрыты
      const c = 0.75 + 0.25 * smooth(k);
      const wave = Math.sin(t * 13) * 0.12 * (0.4 + 0.6 * k);
      rot = -0.3 * c;
      x = -1.4 * c;
      y -= 1.5 * c;
      spiderLeg(0, 0.7 * c - wave, 0);
      spiderLeg(4, 0.75 * c + wave, 0, 1.05);
      spiderLeg(1, 0.4 * c + wave, 0);
      spiderLeg(5, 0.45 * c - wave, 0);
      face = 1;
      break;
    }
    case 'attack': {
      // плевок паутиной: с дыбов — рывком вперёд, передние лапы бьют о землю
      const hit = easeOut(k / 0.28);
      const hold = 1 - smooth((k - 0.4) / 0.6);
      rot = lerp(-0.3, 0.14, hit) * hold;
      x = lerp(-1.4, 2.6, hit) * hold;
      y -= 1.5 * (1 - hit) * hold;
      for (const i of FRONT) spiderLeg(i, (i === 0 || i === 4 ? 0.72 : 0.42) * (1 - hit), hit);
      if (k < 0.6) face = 1;
      break;
    }
    case 'leap': {
      // прыжок: лапы врастопырку и поджаты; к приземлению тянутся к земле
      const s = smooth(k / 0.15) * (1 - smooth((k - 0.7) / 0.3));
      for (let i = 0; i < 8; i++) spiderLeg(i, 0.48 * s, 1 - s, 1 - 0.14 * s);
      sx = 1 + 0.08 * s;
      sy -= 0.06 * s;
      face = 1;
      break;
    }
    case 'recover': {
      // осел на лапах, бока ходят
      const q = 1 - smooth((k - 0.45) / 0.55);
      const pant = Math.sin(t * 13);
      y += (1.8 + pant * 0.25) * q;
      sy += pant * 0.03 * q;
      wide = 1 + 0.08 * q;
      break;
    }
    case 'stun':
      face = 3;
      x = Math.sin(t * 5.2) * 0.6;
      y += 2.4 + Math.sin(t * 5.2 + 1) * 0.3;
      rot = Math.sin(t * 5.2) * 0.1;
      wide = 1.12;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -2.4 * q;
      y -= 0.8 * q;
      rot = -0.18 * q;
      if (k < 0.7) face = 2;
      break;
    }
    case 'cast': {
      // плюёт паутиной раз за разом: перёд вздёрнут, на каждый плевок — рывок вперёд
      const on = smooth(k / 0.1) * (1 - smooth((k - 0.88) / 0.12));
      const spit = flick(t, 0.3, 0, 0.2);
      rot = (-0.22 + 0.16 * spit) * on;
      x = (-1 + 2.2 * spit) * on;
      spiderLeg(0, (0.5 - 0.3 * spit) * on, 1 - on);
      spiderLeg(4, (0.55 - 0.3 * spit) * on, 1 - on);
      face = 1;
      break;
    }
    case 'drop': {
      // падает с потолка: лапы поджаты кверху; у самой земли — врастопырку
      const land = smooth((k - 0.6) / 0.4);
      for (let i = 0; i < 8; i++) spiderLeg(i, 0.7 * (1 - land), land, 0.8 + 0.2 * land);
      y -= 1.5 * (1 - land);
      sy += 0.06 * (1 - land);
      face = 1;
      break;
    }
    case 'summon': {
      // зовёт пауков: на дыбах, передние лапы машут по очереди, всю трясёт
      const up = smooth(k / 0.18) * (1 - smooth((k - 0.8) / 0.2));
      const wave = Math.sin(t * 11) * 0.3;
      rot = -0.36 * up;
      x = (-1.2 + Math.sin(t * 40) * 0.25) * up;
      y -= 1.7 * up;
      spiderLeg(0, (0.85 - wave) * up, 1 - up);
      spiderLeg(4, (0.9 + wave) * up, 1 - up, 1 + 0.05 * up);
      spiderLeg(1, 0.45 * up, 1 - up);
      spiderLeg(5, 0.5 * up, 1 - up);
      if (up > 0.3) face = 1;
      break;
    }
    case 'tired': {
      // выдохлась: брюхо у земли, лапы разъехались, бока ходят; к концу поднимается
      const q = 1 - smooth((k - 0.86) / 0.14);
      const pant = Math.sin(t * 10);
      y += (2.6 + pant * 0.3) * q;
      sy += pant * 0.035 * q;
      rot = 0.06 * q;
      wide = 1 + 0.14 * q;
      break;
    }
    case 'dead': {
      // повержена: падает на брюхо, лапы поджимаются
      const fall = smooth(k / 0.5);
      const curl = smooth((k - 0.25) / 0.6);
      y = 3.3 * fall;
      rot = 0.14 * fall;
      sy = 1 - 0.08 * fall;
      wide = 1 - 0.45 * curl;
      for (let i = 0; i < 8; i++) spiderLeg(i, 0.85 * curl, 1 - curl, 1 - 0.3 * curl);
      face = 3;
      break;
    }
    default:
  }
  for (let i = 0; i < 8; i++) SP[i * 4 + SP_REACH] *= wide;
  stage(x * M.u, (SPIDER_REST + y) * M.u, rot, sx, sy);
  spiderLegs(M, 0, 4, rot);
  put(M.kBody, ox, oy, rot, sx, sy, face);
  spiderLegs(M, 4, 8, rot);
}
defineSpider('spider', SPIDER_KINDS.spider, [...COMMON, 'leap'], 36, 30, 22);
defineSpider('spiderqueen', SPIDER_KINDS.spiderqueen, [...BOSS, 'cast', 'drop', 'summon'], 128, 104, 80);

// ---------- крот ----------
// Под землёй — один ползущий холмик. Наверху — по пояс из норы: тёмная груша с розовым носом и лапами-лопатами.
// Вылезает уже с камнем над головой; замах — откинулся назад, бросок — хлестнул вперёд, и камня в лапах нет.

const MOLE = { coat: '#51475c', light: '#8a7e98', dark: '#2b2434', belly: '#7a6e88', nose: '#ff9aa8', noseDark: '#d9667a', paw: '#f6bba8', pawDark: '#cf8a78', soil: '#8f6c48', soilLight: '#bd9668', soilDark: '#5c4230' };
const moleCoat = tone(MOLE.coat, { light: MOLE.light, dark: MOLE.dark, line: outline(MOLE.coat, 0.62), lw: 1.2 });
const moleSoil = tone(MOLE.soil, { light: MOLE.soilLight, dark: MOLE.soilDark, line: outline(MOLE.soil, 0.62), lw: 1.2 });
const molePaw = tone(MOLE.paw, { dark: MOLE.pawDark, line: outline(MOLE.paw, 0.6), lw: 0.9 });
const moleClaw = tone('#fff3dc', { dark: '#d6c39a', line: outline(MOLE.paw, 0.7), lw: 0.6 });

// холмик; привязка — середина низа. 0 — целый (крот под землёй), 1 — задний край с норой, 2 — передний край
definePart('mob.mole.mound', [-12.6, -8.4, 12.6, 4.4], (g, v) => {
  const clods = (list) => {
    for (const [x, y, r] of list) ball(g, x, y, r, r * 0.8, { ...moleSoil, lw: 0.7 });
  };
  if (v === 0) {
    blob(g, [[-11, 0.4], [-9.4, -2.8], [-5.6, -5.6], [-0.6, -7], [4.4, -6.2], [8.4, -3.6], [10.8, -0.8], [10.6, 1.4], [5.6, 2.4], [-1, 2.8], [-7, 2.2]], moleSoil, {
      over(c) {
        stroke(c, [[-3.6, -4.6], [-1.6, -2.6], [-2.6, -0.6]], alpha(MOLE.soilDark, 0.7), 0.7);
        stroke(c, [[3.4, -4], [4.6, -1.8]], alpha(MOLE.soilDark, 0.7), 0.7);
        glow(c, -4, -4, 4, MOLE.soilLight, 0.4);
      },
    });
    clods([[-10.4, 1.8, 1.3], [9.6, 2, 1.5], [1.6, 2.6, 1.1]]);
  } else if (v === 1) {
    blob(g, [[-11, 0.2], [-9.2, -2.6], [-5, -4.2], [0, -4.7], [5, -4.2], [9.2, -2.6], [11, 0.2], [6, 1.4], [0, 1.8], [-6, 1.4]], moleSoil, {
      over(c) {
        c.fillStyle = mix(MOLE.soilDark, INK, 0.6);
        c.beginPath();
        c.ellipse(0, -1, 7.4, 2.5, 0, 0, TAU);
        c.fill();
      },
    });
  } else {
    blob(g, [[-11.2, 0], [-8.4, -1.7], [-4.4, -0.7], [0, -0.3], [4.4, -0.7], [8.4, -1.7], [11.2, 0], [9, 2.2], [3, 3], [-3, 3], [-9, 2.2]], moleSoil, {
      over: (c) => glow(c, -5, -0.4, 3.4, MOLE.soilLight, 0.4),
    });
    clods([[-10, 1.6, 1.3], [9.8, 1.6, 1.4], [0.6, 2.6, 1]]);
  }
}, 3);

// крот по пояс: растёт из норы (привязка — середина низа), морда вправо.
// 0 — хмурый, 1 — натужился (рот открыт), 2 — больно, 3 — оглушён
definePart('mob.mole.body', [-8.6, -17.8, 13, 3], (g, v) => {
  blob(g, [[-6.4, 0.6], [-6.9, -5], [-5.7, -10.5], [-3, -14.6], [1, -16], [4.6, -14.7], [6.7, -12.4], [9.4, -11.6], [10.4, -10.2], [9.6, -8.8], [7.2, -7.8],
    [6.4, -4.6], [6.6, 0.6]], moleCoat, {
    over(c, patch) {
      patch([[0.4, -6.6], [4.4, -6.2], [8, -4], [8, 2], [-1.6, 2], [-2, -3]], tone(MOLE.belly, { dark: MOLE.coat }));
      glow(c, -3, -11, 4.4, MOLE.light, 0.4);
      fur(c, [[-4.4, -6, 1.3, 1.8], [-3.4, -2.4, 1.4, 1.8], [-1, -12.6, 0.4, 1.8], [-4.6, -9.6, 1.1, 1.6]], alpha(MOLE.dark, 0.7), 0.6);
      if (v === 1) {
        c.fillStyle = MOUTH;
        c.beginPath();
        c.ellipse(7.2, -8.4, 1.5, 1.2, 0.3, 0, TAU);
        c.fill();
      } else stroke(c, [[5.6, -8.2], [7, -7.9], [8.4, -8.6]], alpha(MOLE.dark, 0.9), 0.6);
    },
  });
  // усы, зуб, нос
  stroke(g, [[7.8, -10.8], [8.6, -13.4]], alpha('#e6dcec', 0.8), 0.4);
  stroke(g, [[7, -10.8], [6.6, -13.2]], alpha('#e6dcec', 0.8), 0.4);
  if (v !== 1) {
    g.fillStyle = TOOTH;
    g.fillRect(6.8, -8.1, 1.2, 1.3);
  }
  ball(g, 10.2, -10.3, 1.5, 1.35, tone(MOLE.nose, { dark: MOLE.noseDark, line: outline(MOLE.nose, 0.55), lw: 0.7 }));
  speck(g, 9.7, -10.8, 0.4, 0.9);
  // глаз-бусинка: светлый, иначе на тёмной шкуре его не видно
  if (v === 0) {
    g.fillStyle = '#f3ecf6';
    g.beginPath();
    g.ellipse(4.4, -11.8, 1.15, 1.05, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#16101a';
    g.beginPath();
    g.arc(4.7, -11.7, 0.6, 0, TAU);
    g.fill();
    stroke(g, [[2.9, -13.2], [5.9, -12.5]], MOLE.dark, 0.7);
  } else eye(g, 4.4, -11.8, 1.2, { kind: v === 3 ? 'cross' : 'squint', color: '#f3ecf6' });
}, 4);

// лапа-лопата: розовая ладонь с когтями, смотрит вправо; сустав — запястье. 0 — ближняя, 1 — дальняя
definePart('mob.mole.paw', [-2.8, -4.4, 7.8, 4.4], (g, v) => {
  ball(g, 0, 0, 1.7, 1.7, { ...moleCoat, lw: 0.9 });
  for (const a of [-0.7, -0.25, 0.25, 0.7]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    solid(g, (p) => pathPoly(p, [[2.2 + c * 2 + s * 0.8, s * 2 - c * 0.8], [2.2 + c * 4.9, s * 4.9], [2.2 + c * 2 - s * 0.8, s * 2 + c * 0.8]]), moleClaw);
  }
  ball(g, 2.2, 0, 2.5, 2.7, v ? { ...molePaw, fill: MOLE.pawDark } : molePaw);
}, 2);

const MOLE_HOLE = -1.4;       // где тело выходит из норы
const MOLE_TALL = 16;         // рост над норой

function drawMole(act, t, k, a) {
  if (act === 'burrow') {
    // под землёй: один холмик, и тот шевелится
    put('mob.mole.mound', 0, 0, 0, 1 + Math.sin(t * 12) * 0.03, 1 + Math.sin(t * 12 + 1.4) * 0.09, 0);
    return;
  }
  const sway = Math.sin(t * 1.7) * 0.04;
  let face = 0;
  let out = 1;          // насколько вылез (0 — весь под землёй)
  let shut = 0;         // насколько холмик закрыт
  let lean = sway;
  let squash = 1 + Math.sin(t * 2.8) * 0.02;
  let hold = 0;         // лапы у камня над головой (0 — лежат на краю норы)
  let swing = 0;        // бросок: лапы с камнем уходят вперёд
  let stone = 0;        // виден ли камень
  let scrape = 0;       // гребёт лапами
  switch (act) {
    case 'emerge':
      // вылезает: холмик раскрывается, сначала показывается камень, за ним крот
      out = backOut(k / 0.85);
      shut = 1 - smooth(k / 0.3);
      hold = 1;
      stone = 1;
      break;
    case 'windup': {
      // камень над головой, откинулся назад; чем ближе бросок, тем сильнее дрожит
      const c = 0.7 + 0.3 * smooth(k);
      lean = -0.22 * c + Math.sin(t * 40) * 0.015 * k;
      hold = 1;
      stone = 1;
      face = 1;
      break;
    }
    case 'attack': {
      // бросок: тело хлещет вперёд, лапы — следом; камень уходит из лап в первой пятой
      const hit = easeOut(k / 0.25);
      const back = smooth((k - 0.4) / 0.6);
      lean = lerp(lerp(-0.22, 0.34, hit), sway, back);
      hold = 1 - back;
      swing = hit;
      stone = k < 0.2 ? 1 : 0;
      if (k < 0.6) face = 1;
      break;
    }
    case 'dig':
      // зарывается: гребёт лапами и уходит вниз, холмик смыкается
      out = 1 - smooth(k / 0.85);
      shut = smooth((k - 0.6) / 0.4);
      scrape = 1 - shut;
      break;
    case 'recover': {
      const q = 1 - smooth((k - 0.5) / 0.5);
      const pant = Math.sin(t * 12);
      lean = lerp(sway, 0.14, q);
      squash += (pant * 0.03 - 0.06) * q;
      break;
    }
    case 'stun':
      face = 3;
      lean = Math.sin(t * 5) * 0.16;
      squash = 0.94;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      lean = lerp(sway, -0.26, q);
      squash -= 0.16 * q;
      if (k < 0.7) face = 2;
      break;
    }
    default:
  }
  const open = 1 - shut;
  // макушка: над ней держат камень
  const tall = MOLE_TALL * out * squash;
  const topX = 0.6 * Math.cos(lean) + tall * Math.sin(lean);
  const topY = MOLE_HOLE + 0.6 * Math.sin(lean) - tall * Math.cos(lean);
  const sX = topX - 0.5 + 5.5 * swing;
  const sY = topY - 4.2 + 6 * swing;
  const dig = Math.sin(t * 30) * 0.5 * scrape;
  const sink = 2.4 * (1 - Math.min(1, out));
  if (open > 0.02) put('mob.mole.mound', 0, 0, 0, 1, 1, 1, open);
  if (out > 0.03) put('mob.mole.body', 0, MOLE_HOLE, lean, 1, out * squash, face);
  put('mob.mole.paw', lerp(-4.6, sX - 3.2 + 1.4 * swing, hold), lerp(-2.6 + sink, sY + 2.4, hold), lerp(-0.35 - dig, lerp(-1.22, -0.1, swing), hold), hold > 0.5 ? 1 : -1, 1, 1, open);
  if (stone > 0) put('shot.stone', sX, sY, 0.3, 1.4, 1.4);
  put('mob.mole.paw', lerp(4.6, sX + 3.2 - 2.2 * swing, hold), lerp(-2.6 + sink, sY + 2.4 - 1.2 * swing, hold), lerp(0.35 + dig, lerp(-1.92, -0.3, swing), hold), 1, 1, 0, open);
  if (open > 0.02) put('mob.mole.mound', 0, 0, 0, 1, 1, 2, open);
  if (shut > 0.02) put('mob.mole.mound', 0, 0, 0, 1, 1, 0, shut);
}
plainRig('mole', [...COMMON, 'burrow', 'emerge', 'dig'], 32, 36, 20, drawMole);

// ---------- жук-камнеед ----------
// Спереди — каменный щит с рогом (от него всё отскакивает), сзади — мягкая рыжая спина: бить надо туда.
// Замах — рог к земле, зад кверху; таран — несётся, вытянувшись.

const BEETLE = { rock: '#9391a6', rockLight: '#d4d2e4', rockDark: '#5a586e', back: '#dc7038', backLight: '#fbab6e', backDark: '#9c4420', belly: '#f3c58e', leg: '#3c3244', horn: '#c2c0d2', eye: '#ffd23f', rage: '#ff5a3c', moss: '#86c06c' };
const beetleRock = tone(BEETLE.rock, { light: BEETLE.rockLight, dark: BEETLE.rockDark, line: outline(BEETLE.rock, 0.66), lw: 1.4 });
const beetleBack = tone(BEETLE.back, { light: BEETLE.backLight, dark: BEETLE.backDark, line: outline(BEETLE.back, 0.62), lw: 1.3 });
const beetleHorn = tone(BEETLE.horn, { light: '#f0eefa', dark: '#7a788e', line: beetleRock.line, lw: 1.2 });
const beetleLeg = tone(BEETLE.leg, { light: '#6a5c78', dark: '#1e1826', line: '#1e1826', lw: 0.8 });

// мягкая спина: рыжее брюшко с перетяжками; сустав — середина
definePart('mob.beetle.back', [-11.2, -9.2, 10.4, 8.2], (g) => {
  blob(g, [[-9.8, 0.6], [-8.8, -3.8], [-5, -6.9], [0, -7.7], [5, -6.5], [8.3, -3], [8.7, 1.4], [6, 5], [0, 6.7], [-5.6, 5.7], [-8.9, 3.2]], beetleBack, {
    over(c, patch) {
      patch([[-11, 3.2], [-4, 4.4], [4, 4.2], [10, 2.4], [10, 9], [-11, 9]], tone(BEETLE.belly, { dark: '#c9935a' }));
      for (const x of [-5.6, -1.6, 2.6]) stroke(c, [[x - 0.6, -8], [x + 0.6, -2], [x - 0.4, 4.4]], alpha(BEETLE.backDark, 0.75), 0.8);
      glow(c, -4.6, -4.2, 3.6, '#fff0d8', 0.5);
    },
  });
  speck(g, -5.4, -4.6, 1.1, 0.7);
});

// каменный щит с рогом: закрывает жука спереди; сустав — где щит сидит на теле.
// 0 — спокоен, 1 — зол (глаз красный), 2 — больно, 3 — оглушён
definePart('mob.beetle.shield', [-6.8, -14.6, 15.6, 10], (g, v) => {
  // рог — вперёд и вверх; под ним зубец поменьше
  blob(g, [[4.6, -7.4], [8.6, -9.8], [13.8, -13, 1], [11.6, -7.6], [8.6, -3.8], [6, -3.2]], beetleHorn);
  blob(g, [[6.6, 0.6], [11.6, 0.2, 1], [8.2, 3.6]], { ...beetleHorn, lw: 1 });
  blob(g, [[-3.8, -8.4, 1], [0.6, -10.6], [4.8, -9.6, 1], [7.6, -6.4], [8.8, -1.8, 1], [8.2, 3.2], [6.2, 6.8, 1], [2.2, 8.2], [-2.2, 7.2, 1], [-4.6, 3.2],
    [-5.2, -3.2]], beetleRock, {
    over(c, patch) {
      // грани камня: светлая сверху слева, тёмная снизу справа; трещины и мох
      patch([[-6, -4, 1], [-1, -5.6, 1], [3.6, -3.6, 1], [5.6, -11, 1], [-6, -11, 1]], tone(mix(BEETLE.rock, BEETLE.rockLight, 0.5), { dark: BEETLE.rock }));
      patch([[9.6, 1, 1], [5.6, 2.4, 1], [3.6, 6, 1], [3, 9, 1], [9.6, 9, 1]], tone(mix(BEETLE.rock, BEETLE.rockDark, 0.6), { light: BEETLE.rock }));
      stroke(c, [[-1.4, -5.4], [0.4, -1.6], [-1.2, 1.4], [0.2, 4.6]], alpha(BEETLE.rockDark, 0.8), 0.7);
      stroke(c, [[0.4, -1.6], [3.4, -0.8]], alpha(BEETLE.rockDark, 0.8), 0.6);
      spots(c, [[-2.6, -7.4, 1.3, 0.8, 0.3], [0.8, -8.6, 1.1, 0.7, 0], [-4, -5, 0.8, 0.6, 0.6]], alpha(BEETLE.moss, 0.9));
      // прорезь, из которой смотрит глаз
      c.fillStyle = '#1e1826';
      c.beginPath();
      c.ellipse(4.6, 3.2, 2.7, 1.5, -0.15, 0, TAU);
      c.fill();
    },
  });
  if (v >= 2) eye(g, 4.8, 3.2, 1.1, { kind: v === 2 ? 'squint' : 'cross', color: '#fff1dc' });
  else {
    const iris = v ? BEETLE.rage : BEETLE.eye;
    glow(g, 4.9, 3.2, v ? 3.4 : 2.6, iris, v ? 0.7 : 0.5);
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(4.9, 3.2, 1.15, v ? 0.75 : 1, 0, 0, TAU);
    g.fill();
    speck(g, 4.5, 2.9, 0.35, 0.95);
  }
}, 4);

// лапка с коленом; сустав — вверху. 0 — ближняя, 1 — дальняя
const BEETLE_LEG = 5.6;
definePart('mob.beetle.leg', [-2.2, -2.2, 5, 7], (g, v) => {
  const look = v ? { ...beetleLeg, fill: '#2a2232' } : beetleLeg;
  capsule(g, 0, 0, 1.2, 2.6, 1.6, 0.95, look);
  limb(g, 2.6, 1.6, 0.95, 1.6, 5, 0.6, look);
  stroke(g, [[1.6, 5.2], [2.8, 5.7]], look.line, 0.7);
}, 2);

// бёдра в осях тела: три дальние лапки, три ближние
const BEETLE_HIPS = [[-6.6, 4.4], [-0.6, 5], [6.4, 4.6], [-8.8, 4.6], [-2.8, 5.4], [4.2, 5]];
const BEETLE_REST = -10.2;

function drawBeetle(act, t, k, a) {
  let face = 0;
  let x = 0;
  let y = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1 + Math.sin(t * 2.4) * 0.02;
  let tilt = Math.sin(t * 1.3) * 0.03;      // наклон щита (плюс — рогом вниз)
  let pace = 0;         // лапки: как часто и как широко шагают
  let swing = 0;
  switch (act) {
    case 'move': {
      const sp = Math.max(clamp01(num(a.speed, 1)), 0.4);
      pace = 15;
      swing = 0.5 * sp;
      y = -Math.abs(Math.sin(t * 15)) * 0.5 * sp;
      tilt = Math.sin(t * 7.5) * 0.04;
      break;
    }
    case 'windup': {
      // рог к земле, зад кверху; скребёт лапками и дрожит всё сильнее
      const c = 0.75 + 0.25 * smooth(k);
      tilt = 0.5 * c;
      rot = 0.14 * c;
      x = -2.2 * c + Math.sin(t * 44) * 0.3 * k;
      y = 0.6 * c;
      pace = 22;
      swing = 0.25;
      face = 1;
      break;
    }
    case 'attack': {
      // таран: несётся рогом вперёд, вытянувшись
      const s = smooth(k / 0.1) * (1 - smooth((k - 0.85) / 0.15));
      tilt = 0.36 * s;
      rot = 0.06 * s;
      x = 1.6 * s;
      sx = 1 + 0.07 * s;
      pace = 34;
      swing = 0.7 * s;
      y = -Math.abs(Math.sin(t * 34)) * 0.6 * s;
      face = 1;
      break;
    }
    case 'recover': {
      // стоит и отдувается: щит повис
      const q = 1 - smooth((k - 0.5) / 0.5);
      tilt = 0.26 * q;
      y = 0.8 * q;
      sy += Math.sin(t * 12) * 0.03 * q;
      break;
    }
    case 'stun':
      face = 3;
      tilt = 0.3 + Math.sin(t * 5.2) * 0.14;
      rot = Math.sin(t * 5.2 + 1) * 0.05;
      y = 1.2;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -2.6 * q;
      rot = -0.16 * q;
      tilt = -0.25 * q;
      if (k < 0.7) face = 2;
      break;
    }
    default:
  }
  stage(x, BEETLE_REST + y, rot, sx, sy);
  const lift = Math.min(1, swing * 4) * 0.22;
  for (let i = 0; i < 6; i++) {
    if (i === 3) put('mob.beetle.back', onX(-5, 0.4), onY(-5, 0.4), rot, sx, sy);
    const H = BEETLE_HIPS[i];
    const hy = onY(H[0], H[1]);
    // тройками: средняя лапка идёт в ногу с крайними другой стороны
    const ph = t * pace + (i % 2 ? Math.PI : 0) + (i < 3 ? Math.PI : 0);
    const turn = -Math.sin(ph) * swing;
    const reach = clamp(-hy / (BEETLE_LEG * Math.max(0.5, Math.cos(turn))), 0.5, 1.5);
    put('mob.beetle.leg', onX(H[0], H[1]), hy, turn, 1, reach * (1 - Math.max(0, Math.cos(ph)) * lift), i < 3 ? 1 : 0);
  }
  put('mob.beetle.shield', onX(3.6, -0.8), onY(3.6, -0.8), rot + tilt, 1, 1, face);
}
plainRig('beetle', COMMON, 46, 36, 28, drawBeetle);

// ---------- зубастый сундук ----------
// Пока спит (sleep) — тот самый сундук из комнаты, не отличить. Проснулся — крышка откидывается от заднего края,
// как челюсть: под ней зубы в два ряда, тёмное нутро и язык; глаза горят на крышке. Ног нет — скачет.

const CHEST = { wood: '#b07a44', brass: '#e6bc4e' };         // те же краски, что у сундука из комнаты (art-tiles.js)
const chestWood = tone(CHEST.wood, { light: lighten(CHEST.wood, 0.35), dark: darken(CHEST.wood, 0.4), line: mix(CHEST.wood, INK, 0.66), lw: 1.5 });
const chestLid = { ...chestWood, fill: lighten(CHEST.wood, 0.08) };
const MIMIC_EYE = '#ffd23f';

// латунные обручи и щели между досками — как на сундуке
function chestBands(c, xs, y0, y1) {
  for (const x of xs) {
    c.fillStyle = CHEST.brass;
    c.fillRect(x - 2.2, y0, 4.4, y1 - y0);
    c.fillStyle = alpha(lighten(CHEST.brass, 0.7), 0.8);
    c.fillRect(x - 2.2, y0, 1.3, y1 - y0);
    c.fillStyle = alpha(darken(CHEST.brass, 0.45), 0.7);
    c.fillRect(x + 1.2, y0, 1, y1 - y0);
  }
}
function chestPlanks(c, x0, x1, ys) {
  c.strokeStyle = alpha(chestWood.line, 0.55);
  c.lineWidth = 0.9;
  for (const y of ys) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  }
}

// ящик с нижними зубами: они торчат над передней стенкой; привязка — середина низа
definePart('mob.mimic.base', [-15.6, -19.4, 15.6, 1.8], (g) => {
  teeth(g, -11.6, 13.4, -13, 7, -4.2);
  fang(g, 10.8, -13, 1.5, -5.4);
  blob(g, [[-14, -13.5, 1], [14, -13.5, 1], [13, -1.5], [11.6, 0.2], [-11.6, 0.2], [-13, -1.5]], chestWood, {
    over(c) {
      chestPlanks(c, -15, 15, [-9, -4.6]);
      chestBands(c, [-8, 8], -15, 2);
    },
  });
});

// крышка с верхними зубами и глазами; сустав — петля у заднего края. 0 — злая, 1 — больно, 2 — оглушена
definePart('mob.mimic.lid', [-1.8, -12.8, 31, 6.6], (g, v) => {
  teeth(g, 4.6, 28.6, 0.2, 7, 3.8);
  fang(g, 25.6, 0.2, 1.5, 5);
  blob(g, [[0, 0.6, 1], [0.5, -5.4], [4.6, -9.6], [14.6, -11], [24.6, -9.6], [28.7, -5.4], [29.2, 0.6, 1]], chestLid, {
    over(c) {
      chestPlanks(c, -1, 31, [-7.2, -3.4]);
      chestBands(c, [6.6, 22.6], -13, 2);
    },
  });
  if (v === 0) {
    fierceEye(g, 17.8, -4.6, 1.8, MIMIC_EYE, { lid: 0.4, slant: 0.4, wide: 0.8, shine: 0.6, rim: '#3a2416' });
    fierceEye(g, 12.4, -4.4, 2.3, MIMIC_EYE, { lid: 0.4, slant: 0.32, shine: 0.6, rim: '#3a2416' });
  } else {
    const kind = v === 1 ? 'squint' : 'cross';
    eye(g, 17.8, -4.6, 1.7, { kind, color: '#3a2416' });
    eye(g, 12.4, -4.4, 2.2, { kind, color: '#3a2416' });
  }
}, 3);

// нутро пасти: тёмный клин от петли — его растягивают по раскрытию
definePart('mob.mimic.maw', [-1, -9, 29.4, 9], (g) => {
  g.fillStyle = linear(g, 0, 0, 28, 0, [[0, '#2a1016'], [0.6, MOUTH], [1, '#8a2c40']]);
  g.beginPath();
  pathPoly(g, [[0, -0.5], [28.4, -8], [28.4, 8], [0, 0.5]]);
  g.fill();
}, 1, 0.5);

// язык: растёт из глубины пасти (сустав в нуле) и свешивается вперёд
definePart('mob.mimic.tongue', [-1.8, -3.8, 15, 7.4], (g) => {
  blob(g, [[0, -2.2], [5, -2.6], [9.6, -1.6], [13, 0.8], [13.6, 3.6], [11.6, 5.8], [9, 5], [8.4, 2.6], [5.6, 1.6], [0, 2.2]],
    tone(TONGUE, { light: '#ffc2c6', dark: '#d9606e', line: '#a23a4e', lw: 1 }), {
      over: (c) => stroke(c, [[1, 0], [6, -0.4], [10.4, 1.2], [11.6, 3.6]], alpha('#c24a5e', 0.8), 0.7),
    });
});

const MIMIC_HX = -14.6;       // петля крышки
const MIMIC_HY = -13.4;
const MIMIC_GAPE = 1.02;      // пасть нараспашку, радианы

function drawMimic(act, t, k, a) {
  if (act === 'sleep' && hasSprite('thing.chest')) {
    put('thing.chest', 0, 0);
    return;
  }
  const ajar = 0.14 + Math.sin(t * 2.4) * 0.04;
  let face = 0;
  let open = ajar;      // раствор пасти, радианы
  let tongue = 0;       // насколько высунут язык
  let x = 0;
  let hop = 0;          // подскок
  let wide = 1;         // сундук плющит: вширь и ввысь
  let tall = 1;
  switch (act) {
    case 'sleep':
      open = 0;
      break;
    case 'reveal': {
      // крышка распахивается рывком — под ней пасть; сундук подпрыгивает, потом скалится
      const settle = smooth((k - 0.5) / 0.5);
      open = lerp(1.05 * backOut(k / 0.4), ajar, settle);
      hop = bump(k / 0.55) * 5;
      tall = 1 + 0.1 * bump(k / 0.3);
      tongue = smooth((k - 0.15) / 0.2) * (1 - settle);
      break;
    }
    case 'move': {
      // скачет: в воздухе пасть хлопает, у земли сундук плющит
      const h = Math.abs(Math.sin(t * 7.5));
      const low = (1 - h) * (1 - h);
      hop = h * 5.5;
      open = 0.16 + 0.4 * h;
      tall = 1 - 0.12 * low + 0.05 * h;
      wide = 1 + 0.08 * low;
      break;
    }
    case 'windup': {
      // пасть нараспашку, язык наружу; чем ближе щелчок, тем сильнее дрожит
      const c = 0.75 + 0.25 * smooth(k);
      open = MIMIC_GAPE * c + Math.sin(t * 42) * 0.03 * k;
      tongue = 1;
      x = -1.6 * c;
      tall = 1 + 0.05 * c;
      break;
    }
    case 'attack': {
      // щёлк: пасть захлопывается в первой пятой, сундук подаётся вперёд
      const shut = clamp01(k / 0.2) ** 2;
      const back = smooth((k - 0.45) / 0.55);
      open = lerp(MIMIC_GAPE * (1 - shut), ajar, back);
      x = 3.2 * lunge(k, 0.22);
      wide = 1 + 0.06 * shut * (1 - back);
      tall = 1 - 0.08 * shut * (1 - back);
      break;
    }
    case 'recover': {
      // отдувается: пасть ходит, язык свесился
      const q = 1 - smooth((k - 0.6) / 0.4);
      open = lerp(ajar, 0.42 + Math.sin(t * 11) * 0.1, q);
      tongue = q;
      tall = 1 - 0.04 * q;
      break;
    }
    case 'stun':
      face = 2;
      open = 0.5 + Math.sin(t * 5) * 0.08;
      tongue = 1;
      x = Math.sin(t * 5.2) * 0.9;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -2.6 * q;
      tall = 1 - 0.12 * q;
      wide = 1 + 0.06 * q;
      open += 0.3 * q;
      if (k < 0.7) face = 1;
      break;
    }
    default:
  }
  GX += x * GSX;
  GY -= hop * GSY;
  GSX *= wide;
  GSY *= tall;
  if (open > 0.06) put('mob.mimic.maw', MIMIC_HX, MIMIC_HY + 0.2, -open / 2, 1, (29 * Math.tan(open / 2)) / 8);
  put('mob.mimic.lid', MIMIC_HX, MIMIC_HY, -open, 1, 1, face);
  put('mob.mimic.base', 0, 0);
  if (tongue > 0.05) {
    const half = open / 2;
    put('mob.mimic.tongue', MIMIC_HX + 15 * Math.cos(half), MIMIC_HY - 15 * Math.sin(half) + 1, 0.25 - half * 0.5 + Math.sin(t * 6) * 0.08, tongue, 1);
  }
}
plainRig('mimic', [...COMMON, 'sleep', 'reveal'], 58, 62, 30, drawMimic);

// ---------- лось-великан ----------
// Тёмно-бурая гора на длинных светлых ногах: горб над плечами, горбатая морда с серьгой под челюстью, рога
// лопатами; на холке и рогах иней, глаз светится льдом. Замах — голова к земле, рога вперёд, бьёт копытом.
// Он же, поменьше, — напасть «бегущий лось» (haz.moose): только несётся, опустив рога.

const MOOSE = { coat: '#6d4c3a', light: '#a37c60', dark: '#422c22', back: '#4f3628', cream: '#c9b598', creamShade: '#978268', ink: 0.66 };
const mooseT = furTones(MOOSE, 1.8);
const MOOSE_EYE = '#9fe3ff';
const FROST = '#eef8ff';
const ANTLER = tone('#eadbb8', { light: '#fff8e4', dark: '#b39a6c', line: outline('#eadbb8', 0.6), lw: 1.5 });
const ANTLER_FAR = tone('#bca988', { light: '#e0d0aa', dark: '#8a7654', line: ANTLER.line, lw: 1.4, rim: 0.25 });

definePart('mob.moose.body', [-30.5, -22.5, 30.5, 16.5], (g) => {
  // круп слева, горб над плечами справа; под грудью — клок шерсти
  blob(g, [[-27.4, -2], [-25.4, -10], [-17, -14], [-6, -13.2], [4, -15], [13, -19.4], [21, -16.6], [26.4, -8.6], [27.6, 0], [24.6, 7.6], [25.4, 13, 1],
    [20.6, 10.6], [10, 13], [-4, 12], [-14, 10.4], [-22, 11.4], [-27.4, 5]], mooseT.coat, {
    over(c, patch) {
      patch([[-32, -6], [-20, -9], [-6, -8], [6, -10], [16, -13], [27, -10], [32, -12], [32, -24], [-32, -24]], mooseT.back);
      glow(c, -16, -4, 9, MOOSE.light, 0.4);
      glow(c, 24, -2, 11, darken(MOOSE.dark, 0.3), 0.55);
      fur(c, [[-10, 9, 1.3, 4], [0, 10, 1.3, 4], [12, 10.6, 1.4, 4], [-20, 8, 1.2, 3.6], [18, -4, 1, 4], [8, -2, 0.9, 4]], alpha(MOOSE.dark, 0.6), 1);
      // иней на холке и спине
      spots(c, [[13, -17.4, 2.6, 1.1, -0.2], [7, -14.6, 2.2, 0.9, -0.3], [19, -15, 2, 0.9, 0.5], [-2, -12.4, 2.4, 0.9, 0], [-12, -12.6, 2.2, 0.9, 0.1],
        [-21, -10.6, 1.8, 0.8, 0.5], [1, -9.6, 1.2, 0.6, 0], [15, -11.4, 1.3, 0.6, 0]], alpha(FROST, 0.85));
    },
  });
});

// нога: узловатое колено, светлый «чулок» и тёмное копыто
const MOOSE_LEG = [[-5, 0], [0, -5], [5, 0], [4.4, 9], [3, 16], [3.5, 19.4], [2.6, 27], [3.2, 31.4], [5.6, 33.8], [5.2, 36], [-2.6, 36], [-3, 32], [-2.4, 27],
  [-3.3, 19.4], [-3.6, 14], [-4.6, 7]];
legPart('mob.moose.leg', [-6.8, -6.4, 7.4, 38.4], MOOSE_LEG, mooseT, {
  lw: 1.5, fade: 0.6,
  over(c, patch, v) {
    patch([[-8, 18.6], [-2, 17.6, 1], [0, 19, 1], [2, 17.6, 1], [8, 18.6], [8, 40], [-8, 40]], v ? { ...mooseT.cream, fill: MOOSE.creamShade } : mooseT.cream);
    patch([[-8, 32.6, 1], [8, 32.2, 1], [8, 40, 1], [-8, 40, 1]], tone('#2c2220', { light: '#5a4a44', dark: '#161010' }));
  },
});

tailPart('mob.moose.tail', [-9, -5, 4, 5.4], [...tailJoint(3), [-3, 3.6], [-6, 3], [-7.4, 0.6], [-6, -2.2], [-3, -3.4]], mooseT.coat);

// рог лопатой: растёт из темени (оно в нуле) — ладонь с отростками, на концах иней
const MOOSE_ANTLER = [[-2, 0.6], [-5, -5], [-11, -9], [-16.4, -16, 1], [-10.6, -13.4], [-9.8, -21.4, 1], [-5.6, -15.6], [-2.6, -24, 1], [0.4, -16.6], [5, -23.6, 1],
  [6, -15.6], [11.8, -20, 1], [10.4, -12], [16.6, -12.6, 1], [11, -7], [6, -4.6], [2.6, 0.6]];
const MOOSE_TIPS = [[-15.4, -15], [-9.6, -20], [-2.6, -22.6], [4.8, -22.2], [11.2, -18.8], [15.4, -12.4]];
function mooseAntler(g, x, y, look) {
  g.save();
  g.translate(x, y);
  blob(g, MOOSE_ANTLER, look, {
    over(c) {
      c.fillStyle = alpha(FROST, 0.9);
      for (const [px, py] of MOOSE_TIPS) {
        c.beginPath();
        c.arc(px, py, 2, 0, TAU);
        c.fill();
      }
      stroke(c, [[0, -1], [-2, -8], [-4, -13]], alpha(look.dark, 0.6), 0.8);
      stroke(c, [[2, -3], [4, -9], [5, -15]], alpha(look.dark, 0.6), 0.8);
    },
  });
  g.restore();
}

// голова в профиль с обоими рогами; сустав — шея, середина головы — в MOOSE_HC от него
const MOOSE_HC = [6, -2];
definePart('mob.moose.head', [-13.6, -35.6, 35, 19.5], (g, v) => {
  const F = FACES[v];
  g.translate(MOOSE_HC[0], MOOSE_HC[1]);
  mooseAntler(g, 4.6, -6.4, ANTLER_FAR);
  farEar(g, 0.4, -8.6, 5.4, -8, 7, F.ear * 0.6 + 0.3, { ...mooseT.far, lw: 1.4 });
  if (F.mouth === 2) jawOpen(g, 12, 7.6, 12.6, 4.6, 0.5, { ...mooseT.coat, lw: 1.4 }, { fang: 0.7, fangH: 1.2 });
  // серьга под челюстью
  blob(g, [[3, 8], [9, 9], [8.6, 13.6], [6.2, 18, 1], [4, 13.6]], { ...mooseT.far, lw: 1.3 });
  const E = earAxes(-7.6, -6.4, -2.6, -9.2, 8.4, F.ear * 0.6 - 0.25);
  blob(g, [[-9, 2], [-8.6, -3.4], [-7.6, -6.4], ...earSharp(E), [-2.6, -9.2], [4.6, -8.8], [10.4, -5.8], [15, -2.6], [20, -0.8], [24.6, 1.4], [26.8, 5.6],
    [25.2, 10], [20.6, 11.6], [14, 10.6], [8, 10], [3, 10.6], [-2, 8.8], [-6.4, 7.4]], mooseT.coat, {
    over(c, patch) {
      // тёмный лоб и светлая горбатая морда
      patch([[-12, -3], [-4, -4.6], [4, -3.6], [10, -2.6], [14, -5], [8, -12], [-12, -12]], mooseT.back);
      patch([[15, 1.6], [20, 0.6], [26, 2], [29, 6], [29, 13], [16, 13], [13.6, 7.6]], mooseT.cream);
      patch(earInside(E), tone('#b9929c', { dark: '#7d5c68' }));
      lips(c, F.mouth, 15.6, 24.6, 8.8, mooseT.coat.line);
      c.fillStyle = '#2a1c1a';
      c.beginPath();
      c.ellipse(24.4, 5, 1.3, 0.9, -0.5, 0, TAU);
      c.fill();
    },
  });
  mooseAntler(g, -1.4, -7.6, ANTLER);
  if (F.mouth === 3) blob(g, [[17, 9.6], [19.6, 9.4], [20, 12.4], [18.4, 13.8], [16.8, 12.4]], tone(TONGUE, { dark: '#d9606e', lw: 0.8 }));
  if (F.eye === 'fierce') fierceEye(g, 7.4, -1.4, 2.7, MOOSE_EYE, { lid: F.lid, slant: 0.3, shine: 0.6, rim: '#1c1418' });
  else eye(g, 7.4, -1.4, 2.7, { kind: F.eye, color: '#fff1dc' });
}, FACES.length);

const MOOSE_M = {
  kBody: 'mob.moose.body', kHead: 'mob.moose.head', kLeg: 'mob.moose.leg', kTail: 'mob.moose.tail',
  body: [-4, -44], neck: [23, -10], tail: [-26.6, -4],
  legNF: [17, 8], legFF: [21, 7.6], legNH: [-19, 8], legFH: [-15, 7.6], arm: [19, 2],
  leg: 36.4, sit: 7, size: 1.05,
  style: { breath: 1.7, head: 0.12, tail: -0.9, tailF: 1.3, tailA: 0.06, pace: 8.5, swing: 0.42, lift: 0.2, bob: 1.8, lean: 0.03, tailRun: -0.6 },
};
// во весь опор: шаг шире и чаще
const MOOSE_RUN = { ...MOOSE_M, style: { ...MOOSE_M.style, pace: 15, swing: 0.72, lift: 0.3, bob: 3.4, lean: 0.05 } };
const FULL = { speed: 1 };

// несётся, опустив рога
function mooseGallop(p, t) {
  beastCommon(p, 'move', t, 0, FULL, MOOSE_RUN);
  p[HX] += 4;
  p[HY] += 11;
  p[HR] += 0.42;
  p[BR] += 0.05;
  return SNARL;
}

function moosePose(p, act, t, k, a) {
  const M = MOOSE_M;
  switch (act) {
    case 'windup': {
      // голова к земле, рога вперёд; бьёт копытом — и дрожит всё сильнее
      beastIdle(p, t, M);
      const c = 0.75 + 0.25 * smooth(k);
      const paw = Math.sin(t * 12);
      p[BX] = -3 * c + Math.sin(t * 44) * 0.4 * k;
      p[BY] += 1.5 * c;
      p[BR] = 0.07 * c;
      p[HX] = 3 * c;
      p[HY] += 13 * c;
      p[HR] = 0.66 * c;
      p[TR] += 0.5 * c;
      p[L1] = -0.3 + paw * 0.4;
      p[K1] = 0.9 - 0.08 * Math.max(0, paw);
      p[G1] = 0.2;
      p[L1 + 2] = 0.14 * c;
      p[L1 + 3] = 0.1 * c;
      return SNARL;
    }
    case 'charge':
      return mooseGallop(p, t);
    case 'attack': {
      // взмах рогами: голова от земли — вверх и вперёд, потом возвращается
      beastIdle(p, t, M);
      const hit = easeOut(k / 0.4);
      const hold = 1 - smooth((k - 0.55) / 0.45);
      p[BX] = lerp(-3, 5, hit) * hold;
      p[BR] = lerp(0.07, -0.08, hit) * hold;
      p[HX] = lerp(3, 8, hit) * hold;
      p[HY] += lerp(13, -7, hit) * hold;
      p[HR] += (lerp(0.66, -0.55, hit) - p[HR]) * hold;
      p[L1] = -0.4 * hit * hold;
      p[L1 + 1] = -0.3 * hit * hold;
      p[L1 + 2] = 0.3 * hit * hold;
      p[L1 + 3] = 0.25 * hit * hold;
      return k < 0.6 ? BITE : k < 0.9 ? SNARL : CALM;
    }
    case 'stomp': {
      // копыто взлетает и на середине бьёт оземь (в этот миг сыплются сосульки)
      beastIdle(p, t, M);
      const up = k < 0.5 ? smooth(k / 0.38) : 1 - easeOut((k - 0.5) / 0.1);
      const dip = bump((k - 0.5) / 0.3);
      p[BR] = -0.16 * up + 0.05 * dip;
      p[BY] += -3 * up + 2 * dip;
      p[BX] = -2 * up;
      p[HR] += -0.3 * up + 0.2 * dip;
      p[HY] += -3 * up + 3 * dip;
      p[L1] = -1.25 * up;
      p[K1] = 1 - 0.25 * up;
      p[G1] = 1 - up;
      p[ARM] = 0.45 * up;
      p[L1 + 1] = -0.2 * up;
      return k < 0.85 ? SNARL : CALM;
    }
    case 'tired': {
      // запыхался: голова висит, бока ходят, язык наружу; к концу выпрямляется
      beastIdle(p, t, M);
      const q = 1 - smooth((k - 0.86) / 0.14);
      const pant = Math.sin(t * 11);
      p[BY] += (2.4 + pant * 0.5) * q;
      p[BSY] += pant * 0.03 * q;
      p[HX] += 2 * q;
      p[HY] += 12 * q;
      p[HR] += 0.4 * q;
      p[TR] -= 0.3 * q;
      p[L1] -= 0.14 * q;
      p[L1 + 2] += 0.12 * q;
      return q > 0.5 ? HURT : CALM;
    }
    case 'dead': {
      // повержен: ноги подламываются, туша оседает, голова падает
      beastIdle(p, 0, M);
      const e = smooth(k / 0.6);
      p[BY] = M.sit * 3.4 * e - bump((k - 0.5) / 0.3);
      p[BR] = 0.06 * e;
      p[BSY] = 1 - 0.06 * e;
      p[HX] = 3 * e;
      p[HY] = 8 * e;
      p[HR] = 0.12 + 0.2 * e;
      p[TR] = M.style.tail - 0.4 * e;
      p[L1] = -1.05 * e;
      p[L1 + 1] = -0.85 * e;
      p[L1 + 2] = -0.8 * e;
      p[L1 + 3] = -0.65 * e;
      return e > 0.4 ? DIZZY : HURT;
    }
    default:
      return beastCommon(p, act, t, k, a, M);
  }
}
beastRig('moose', MOOSE_M, moosePose);
RIG_INFO.moose = { acts: [...BOSS, 'charge', 'stomp'], w: 140, h: 124, shadow: 80 };

beastRig('haz.moose', { ...MOOSE_RUN, size: 0.82 }, (p, act, t) => mooseGallop(p, t));
RIG_INFO['haz.moose'] = { acts: ['run'], w: 106, h: 94, shadow: 60 };
