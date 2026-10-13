// Осенняя опушка и свои: охотник, гончая, чёрный лис и пугало; хозяин опушки — филин-чародей; хозяева особых
// комнат — барсук-торговец, ворон и бобёр-кузнец; шесть спутников лисы. «Живые» фигуры «Лисьей охоты»: каждая
// собрана из отдельно запечённых частей, а поза каждый кадр расставляет их заново. Без DOM: здесь только рисунки
// частей и расчёт поз.
//
// Оси фигуры: (0, 0) — середина ступней, x — вперёд по взгляду, y — вниз; отражение влево делает рендер.
// Поза приходит от логики: a.act и a.k (06-acts), a.t — часы, a.speed — доля полной скорости, a.aim — куда метит,
// a.data — числа зверя (у охотника, гончей и чёрного лиса data.a — запомненный угол удара). Незнакомая поза —
// спокойная стойка. Фигуры ничего не помнят между кадрами: всё движение — функция от a.t и a.k.
//
// Как отличить их в размере телефона — по силуэту и одному яркому пятну:
//   охотник — шляпа с пером и длинное ружьё;                 гончая — белая в рыжих пятнах, уши-лопухи, красный ошейник;
//   чёрный лис — та же лиса, но чёрно-лиловая, глаза жёлтые;  пугало — крест на шесте с тыквой вместо головы;
//   филин — рогатая голова, крылья и звёздный плащ;           хозяева комнат стоят на месте и не хмурятся.
// Спутники лисы — маленькие и круглоглазые, без бровей; у тех, кого можно спутать с врагом (ёжик, волчонок,
// барсучонок, белка), на шее голубой платок.
// Замах (windup) держится всё время предупреждения: охотник прижал приклад к плечу и зажмурил глаз, гончая
// припала на грудь, чёрный лис сжался, как лиса перед рывком, у пугала загорелись глаза и поднялась рука с тыквой,
// филин вскинул крылья, а камень на посохе разгорается.

import { defineRig } from './art.js';
import {
  TAU, clamp, clamp01, lerp, smooth, easeOut, backOut, bump, num, alpha, darken, mix, outline, tone,
  definePart, solid, blob, ball, capsule, limb, leaf, eggNodes, pathBlob, pathBlobSpan, pathEllipse, pathPoly, pathStar, tuftsArc,
  stroke, fur, glow, speck, shine, sparkle, eye, nose, blush,
} from './art-kit.js';
import { defineFoxParts, drawFox, FOX_POSE } from './art-fox.js';
import {
  MOUTH, TONGUE, CALM, SNARL, BITE, DIZZY, HURT, FACES, BX, BY, BR, BSY, HX, HY, HR, TR, L1, K1, G1, ARM,
  flick, fang, fierceEye, earAxes, earSharp, earRound, earInside, farEar, jawOpen, lips, furTones,
  beastIdle, beastLeap, beastCommon, beastRig, legPart, tailPart, tailJoint,
} from './art-mobs2.js';

/**
 * Что умеют фигуры этого файла: acts — позы (их показывает лист рисунков и проверяет тест), w × h — рамка, в которую
 * фигура помещается в любой позе (единицы мира), shadow — ширина тени под ней.
 */
export const RIG_INFO = {};

const COMMON = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'];
const BOSS = [...COMMON, 'tired', 'dead'];
const NPC = ['idle', 'talk', 'happy'];

// ---------- вся фигура разом ----------
// Части ставятся через set(): он сдвигает, поворачивает, растягивает и гасит всю фигуру целиком — так сделаны
// появление из метки, подскоки, пике филина, и ни одной позе не нужно знать о них.

let KIT = null;
let CTX = null;
let WX = 0;        // сдвиг всей фигуры
let WY = 0;
let WR = 0;        // поворот вокруг точки привязки
let WC = 1;
let WN = 0;
let WSX = 1;       // растяжение от точки привязки
let WSY = 1;
let WA = 1;        // прозрачность

function open(kit, ctx) {
  KIT = kit;
  CTX = ctx;
  WX = 0;
  WY = 0;
  WR = 0;
  WC = 1;
  WN = 0;
  WSX = 1;
  WSY = 1;
  WA = 1;
}

/** Сдвинуть, повернуть, растянуть и притушить всю фигуру — поверх того, что уже задано. */
function whole(x, y, rot = 0, sx = 1, sy = 1, al = 1) {
  WX += x * WSX;
  WY += y * WSY;
  WR += rot;
  WC = Math.cos(WR);
  WN = Math.sin(WR);
  WSX *= sx;
  WSY *= sy;
  WA *= al;
}

function set(key, x, y, rot = 0, sx = 1, sy = 1, v = 0, al = 1) {
  const X = x * WSX;
  const Y = y * WSY;
  KIT.part(CTX, key, WX + X * WC - Y * WN, WY + X * WN + Y * WC, rot + WR, sx * WSX, sy * WSY, clamp01(al * WA), v);
}

/** Появление из метки на земле: фигура вырастает от точки привязки и проявляется. */
function appear(k) {
  const s = backOut(k);
  whole(0, 0, 0, lerp(0.4, 1, s), lerp(0.25, 1, s), smooth(k / 0.35));
}

// тело: его середина, наклон и растяжение — от них считаются все крепления
let ox = 0;
let oy = 0;
let orot = 0;
let oc = 1;
let os = 0;
let osx = 1;
let osy = 1;

function frame(x, y, rot = 0, sx = 1, sy = 1) {
  ox = x;
  oy = y;
  orot = rot;
  oc = Math.cos(rot);
  os = Math.sin(rot);
  osx = sx;
  osy = sy;
}
const fx = (x, y) => ox + x * osx * oc - y * osy * os;
const fy = (x, y) => oy + x * osx * os + y * osy * oc;

/** Часть в осях тела: стоит на нём и наклоняется вместе с ним. */
function on(key, x, y, rot = 0, sx = 1, sy = 1, v = 0, al = 1) {
  set(key, fx(x, y), fy(x, y), rot + orot, sx, sy, v, al);
}

/** Рука от плеча (x0, y0) до кисти (x1, y1): на картинке она висит вниз, кисть — в len от сустава. */
function reach(key, len, x0, y0, x1, y1, v = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  set(key, x0, y0, Math.atan2(dy, dx) - Math.PI / 2, 1, clamp(Math.hypot(dx, dy) / len, 0.45, 1.5), v);
}

/** Нога от бедра (x, y) до земли: стоит — дотягивается до неё сама, тело присело — поджимается. */
function stand(key, len, x, y, rot, v = 0) {
  set(key, x, y, rot, 1, clamp(-y / (len * Math.max(0.4, Math.cos(rot))), 0.55, 1.3), v);
}

/** Моргает: раз в три с лишним секунды, изредка — дважды подряд. */
const blinks = (t) => flick(t, 3.6, 0.3, 0.12) > 0 || flick(t, 9.3, 5.1, 0.11) > 0;

/** Выпад и возврат: 0 → 1 за долю peak, потом плавно назад. */
const lunge = (k, peak = 0.3) => (k < peak ? easeOut(k / peak) : 1 - smooth((k - peak) / (1 - peak)));

/** Куда метит по высоте: вид сбоку, поэтому от угла остаётся только доля «вверх-вниз». */
const tiltOf = (aim) => clamp(Math.atan2(Math.sin(aim), Math.abs(Math.cos(aim))), -1.1, 1.1);

/** Угол удара: запомненный зверем (data.a), а если его нет — тот, что дал рендер. */
const aimOf = (a) => num(a.data && a.data.a, num(a.aim));

function tri(g, x1, y1, x2, y2, x3, y3, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.fill();
}

// ---------- охотник ----------
// Человек из сказки: зелёное пальто с красным шарфом, шляпа с пером, усы, длинное ружьё. Пока идёт — несёт ружьё
// стволом вверх; целится — приклад у плеча, ствол смотрит по красной линии.

const HUNT = {
  coat: '#4f7a4a', coatLight: '#86b56e', coatDark: '#2f5234', skin: '#f2c9a0', skinDark: '#cf9a70', hat: '#8a5a34', hatLight: '#b98a56', hatDark: '#5e3a20',
  band: '#d8453a', pants: '#5a4636', boot: '#33261f', wood: '#9a6a3c', steel: '#8b95a3', hair: '#7a4a2a',
};
const huntCoat = tone(HUNT.coat, { light: HUNT.coatLight, dark: HUNT.coatDark, lw: 1.4 });
const huntCoatFar = tone(mix(HUNT.coat, HUNT.coatDark, 0.75), { light: HUNT.coat, dark: darken(HUNT.coatDark, 0.3), line: huntCoat.line, lw: 1.2, rim: 0.25 });
const huntSkin = tone(HUNT.skin, { dark: HUNT.skinDark, line: outline(HUNT.skin, 0.6), lw: 1.1 });
const huntHat = tone(HUNT.hat, { light: HUNT.hatLight, dark: HUNT.hatDark, lw: 1.3 });
const huntPants = tone(HUNT.pants, { lw: 1.2 });
const huntBoot = tone(HUNT.boot, { light: '#5a463a', dark: '#1c1512' });
const RED = tone(HUNT.band, { light: '#ff8a7a', dark: '#96261f' });

// нога в сапоге: 0 — ближняя, 1 — дальняя, в тени; сустав — бедро
const HUNT_LEG = 9.4;                           // от сустава до земли (с обводкой)
definePart('mob.hunter.leg', [-3.8, -3.4, 6.6, 10], (g, v) => {
  const pts = [[-2.5, 0], [0, -2.5], [2.5, 0], [2.4, 4.8], [5, 6.8], [4.6, 8.8], [-2.1, 8.8], [-2.7, 6.6], [-2.5, 3]];
  blob(g, pts, v ? tone(darken(HUNT.pants, 0.25), { line: huntPants.line, lw: 1.2, rim: 0.2 }) : huntPants, {
    over(c, patch) {
      patch([[-5, 4.5], [0, 4], [6, 4.6], [7, 11], [-5, 11]], v ? tone(darken(HUNT.boot, 0.2), { line: huntBoot.line, rim: 0.2 }) : huntBoot);
    },
    stroke: (c) => pathBlobSpan(c, pts, 2, 0),
    shade: (c) => pathBlob(c, [[-2.5, -12, 1], [2.5, -12, 1], ...pts.slice(2)]),
  });
}, 2);

// пальто: ремень с пряжкой, красный шарф у ворота; сустав — середина
definePart('mob.hunter.body', [-8.6, -8.4, 8.8, 9], (g) => {
  blob(g, [[-5.2, -6], [0, -7], [5, -5.8], [6.6, -1], [7.2, 4.4], [6.4, 7], [0, 7.6], [-6.6, 7], [-7.4, 3.6], [-6.8, -1.2]], huntCoat, {
    over(c, patch) {
      patch([[-9, 1.6], [0, 2.2], [9, 1.4], [9, 3.8], [0, 4.6], [-9, 4]], tone('#3a2a20', { light: '#6a4c3a' }));
      c.fillStyle = '#ffc93c';
      c.fillRect(2.6, 2.3, 2.2, 1.9);
      patch([[-1.4, -9], [8, -9], [8, -4.2], [3.4, -3.3], [0.2, -4.6]], RED);
      stroke(c, [[3.5, -3.1], [3.2, 1.8]], alpha(huntCoat.line, 0.7), 0.8);
      stroke(c, [[3.5, 4.8], [4.4, 7.6]], alpha(huntCoat.line, 0.7), 0.8);
      glow(c, 5.6, -3, 5, darken(HUNT.coatDark, 0.25), 0.45);        // тень от головы
    },
  });
});

// рука: рукав и кисть; висит из плеча вниз. 0 — ближняя, 1 — дальняя
const HUNT_ARM = 8;                             // от плеча до кисти
definePart('mob.hunter.arm', [-3.6, -3.4, 3.8, 11], (g, v) => {
  limb(g, 0, 0, 2.5, 0, 6.4, 2.1, v ? huntCoatFar : { ...huntCoat, lw: 1.2 });
  ball(g, 0.2, 8, 1.9, 1.9, v ? tone(darken(HUNT.skin, 0.18), { line: huntSkin.line, lw: 1 }) : { ...huntSkin, lw: 1 });
}, 2);

// голова в шляпе; сустав — шея. 0 — хмурится, 1 — целится (один глаз закрыт), 2 — оглушён, 3 — больно
definePart('mob.hunter.head', [-10.8, -20, 11.4, 2.4], (g, v) => {
  // перо — за шляпой
  leaf(g, -2.4, -11.6, -8.6, -17.8, 3.2, tone('#fff6e2', { dark: '#d6c2a2', line: '#8f6f5a', lw: 0.9 }), 0.16, alpha('#b98a70', 0.8));
  blob(g, [[-4.6, -5.2], [-3.8, -9], [0.6, -10.4], [4.8, -9.2], [6.3, -5.6], [5.5, -1.6], [2, 0.5], [-2.2, 0.2], [-4.6, -2.2]], huntSkin, {
    over(c) {
      // волосы на затылке и бакенбарда
      c.fillStyle = HUNT.hair;
      c.beginPath();
      pathBlob(c, [[-7, -11], [-2.6, -11], [-2.2, -6], [-3, -2.6], [-7, -1.6]]);
      c.fill();
      blush(c, 2.4, -3.2, 2.2, '#ff8f8a', 0.4);
      if (v >= 2) {
        c.fillStyle = MOUTH;
        c.beginPath();
        c.ellipse(3.9, -1.3, 1.5, 1.1, 0, 0, TAU);
        c.fill();
      }
    },
  });
  if (v === 0) {
    eye(g, 1.5, -5.2, 1.5, { kind: 'narrow', lid: 0.24, slant: 0.12, brow: HUNT.hair });
    eye(g, 4.7, -5.4, 1.2, { kind: 'narrow', lid: 0.24, slant: 0.12, brow: HUNT.hair });
  } else if (v === 1) {
    eye(g, 1.5, -5.2, 1.5, { kind: 'narrow', lid: 0.42, slant: 0.3, brow: HUNT.hair });
    eye(g, 4.7, -5.3, 1.2, { kind: 'closed' });
  } else {
    eye(g, 1.5, -5.2, 1.5, { kind: v === 2 ? 'cross' : 'squint' });
    eye(g, 4.7, -5.4, 1.2, { kind: v === 2 ? 'cross' : 'squint' });
  }
  // нос картошкой и усы
  ball(g, 6.5, -4.3, 1.9, 1.6, tone('#f0b08c', { dark: '#c8846a', line: huntSkin.line, lw: 0.9 }));
  blob(g, [[1.8, -2.9], [4.4, -3.5], [7.2, -3], [8.4, -1.5, 1], [5.8, -1.5], [3.2, -1.1], [1.4, -1.4, 1]], tone(HUNT.hair, { light: '#a8703c', lw: 0.8 }));
  // шляпа: тулья с красной лентой, поверх — поля
  blob(g, [[-4.8, -8.6], [-4.4, -12.8], [-2, -15.4], [2.4, -15.8], [5.2, -13.6], [6, -8.8]], huntHat, {
    over(c, patch) {
      patch([[-7, -11.8], [8, -11.4], [8, -8.6], [-7, -9]], RED);
    },
  });
  ball(g, 0.7, -8.9, 9.2, 2.1, huntHat);
}, 4);

// ружьё: сустав — рукоять, ствол смотрит вперёд
const HUNT_MUZZLE = [22.4, -1.1];               // дуло — в осях ружья
const HUNT_FORE = 7;                            // от рукояти до места на цевье, за которое держит дальняя рука
definePart('mob.hunter.gun', [-8.6, -3.8, 23.4, 4.8], (g) => {
  const steel = tone(HUNT.steel, { light: '#dfe5ec', dark: '#566070', lw: 1 });
  capsule(g, 2, -1.1, 1.05, 21.6, -1.1, 0.9, steel);
  g.fillStyle = steel.line;
  g.fillRect(19.6, -2.9, 0.9, 1);               // мушка
  stroke(g, [[-0.6, 1.2], [0.4, 2.9], [2.2, 2.6], [2.6, 1]], steel.line, 0.8);       // скоба
  blob(g, [[-7.6, -0.6], [-3.2, -2], [3, -2.1], [11, -1.3], [11.6, 0.3], [4, 0.8], [1.2, 1.3], [-2.8, 2.6], [-7, 3.7], [-8, 2]],
    tone(HUNT.wood, { light: '#cf9a5e', dark: '#6a4424', lw: 1.1 }));
});

// вспышка выстрела: сустав — дуло
definePart('mob.hunter.flash', [-2.4, -7, 12.4, 7], (g) => {
  glow(g, 4, 0, 6.4, '#ffd76a', 0.7);
  blob(g, [[0, -1.6], [3.4, -2.2], [5, -6, 1], [5.6, -2], [11.6, 0, 1], [5.6, 2], [5, 6, 1], [3.4, 2.2], [0, 1.6]],
    tone('#fff3b0', { light: '#ffffff', dark: '#ffb629', line: '#ff8a2a', lw: 0.8, shade: 0 }));
}, 1, 0.5);

// огонёк на мушке: разгорается к выстрелу
definePart('mob.hunter.glint', [-3.4, -3.4, 3.4, 3.4], (g) => {
  glow(g, 0, 0, 3.4, '#ff6a5a', 0.55);
  sparkle(g, 0, 0, 3, '#ffffff', 0.2);
}, 1, 0.5);

const HUNT_BODY = [-0.4, -15.8];                // середина пальто в осях фигуры

function drawHunter(kit, ctx, a) {
  open(kit, ctx);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  const tilt = tiltOf(aimOf(a));
  const breath = Math.sin(t * 2.4);
  let x = 0;                 // тело: сдвиг, высота, наклон (плюс — вперёд)
  let y = -breath * 0.15;
  let lean = 0;
  let l1 = 0;                // ноги: ближняя и дальняя (минус — вперёд)
  let l2 = 0;
  let hx = 0;                // голова: сдвиг от шеи, наклон, лицо
  let hy = -breath * 0.2;
  let hr = 0;
  let face = 0;
  let gx = 3.4;              // ружьё: рукоять в осях тела; наклон ствола (0 — вперёд, минус — вверх)
  let gy = 2.2;
  let gr = -1 + breath * 0.015;
  let fore = HUNT_FORE;      // дальняя рука на цевье: ружьё опущено — перехватывает ближе к рукояти, иначе не дотянуться
  let flash = 0;
  let glint = 0;
  switch (act) {
    case 'move': {
      const ph = t * 9.5;
      l1 = Math.sin(ph) * 0.55;
      l2 = -Math.sin(ph) * 0.55;
      y = -Math.abs(Math.sin(ph)) * 0.9;
      lean = 0.06;
      hy = Math.sin(ph * 2 - 0.8) * 0.3;
      gr = -1 + Math.sin(ph * 2) * 0.05;
      gy += Math.sin(ph * 2 - 0.5) * 0.4;
      break;
    }
    case 'windup':
    case 'attack': {
      // вскинул ружьё и целится: приклад у плеча, щека на прикладе, один глаз закрыт; ствол сперва ходит, к выстрелу
      // замирает. Выстрел — отдача: ствол подбросило, самого качнуло назад; потом ружьё возвращается в руки
      const fire = act === 'attack';
      const q = fire ? (1 - k) * (1 - k) : 0;
      const hold = fire ? 1 - smooth((k - 0.6) / 0.4) : smooth(k / 0.12);       // насколько ружьё у плеча
      const r = tilt + (fire ? -0.34 * q : Math.sin(t * 3.3) * 0.05 * (1 - k));
      gr = lerp(gr, r, hold);
      gx = lerp(gx, 1.2 + 5.5 * Math.cos(r) - 2.2 * q, hold);
      gy = lerp(gy, -3.4 + 5.5 * Math.sin(r) - 0.6 * q, hold);
      x = -1.6 * q;
      y = lerp(y, 0.5, hold);
      lean = (-0.06 - 0.16 * q) * hold;
      l1 = 0.3 * hold;
      l2 = -0.32 * hold;
      hx = (1.2 - 0.6 * q) * hold;
      hy = lerp(hy, 0.8, hold);
      hr = (0.12 + tilt * 0.3 - 0.2 * q) * hold;
      face = !fire || k < 0.6 ? 1 : 0;
      if (fire) flash = k < 0.3 ? 1 - k / 0.3 : 0;
      else glint = smooth((k - 0.5) / 0.4) * (0.75 + 0.25 * Math.sin(t * 20));
      break;
    }
    case 'recover': {
      // прицел сбили: шатается, ружьё повисло стволом вниз; к концу берёт его как обычно
      const q = 1 - smooth((k - 0.5) / 0.5);
      const wob = Math.sin(t * 9);
      x = wob * 0.8 * q;
      lean = (-0.14 + wob * 0.05) * q;
      l1 = 0.2 * q;
      l2 = -0.2 * q;
      hr = wob * 0.2 * q;
      face = q > 0.4 ? 2 : 0;
      gr = lerp(gr, 0.75, q);
      gx = lerp(gx, 3.6, q);
      gy = lerp(gy, 3.6, q);
      fore = lerp(fore, 3, q);
      break;
    }
    case 'stun': {
      const wob = Math.sin(t * 5);
      x = wob * 0.7;
      y = 0.8;
      lean = wob * 0.08;
      l1 = 0.25;
      l2 = -0.25;
      hy = 0.6;
      hr = 0.25 + Math.sin(t * 5 - 1) * 0.2;
      face = 2;
      gr = 0.9 + wob * 0.05;
      gx = 3.4;
      gy = 3.8;
      fore = 3;
      break;
    }
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -2.4 * q;
      lean = -0.2 * q;
      l1 = -0.25 * q;
      l2 = -0.3 * q;
      hx = -0.8 * q;
      hr = -0.3 * q;
      face = k < 0.7 ? 3 : 0;
      gr -= 0.3 * q;
      break;
    }
    default:
  }
  frame(HUNT_BODY[0] + x, HUNT_BODY[1] + y, lean);
  const c = Math.cos(gr);
  const s = Math.sin(gr);
  const px = fx(gx, gy);
  const py = fy(gx, gy);
  stand('mob.hunter.leg', HUNT_LEG, fx(1.9, 6.2), fy(1.9, 6.2), l2, 1);
  reach('mob.hunter.arm', HUNT_ARM, fx(2.6, -4.6), fy(2.6, -4.6), px + fore * c, py + fore * s, 1);
  stand('mob.hunter.leg', HUNT_LEG, fx(-1.5, 6.4), fy(-1.5, 6.4), l1, 0);
  set('mob.hunter.body', ox, oy, lean);
  set('mob.hunter.head', fx(0.8, -6.2) + hx, fy(0.8, -6.2) + hy, lean * 0.5 + hr, 1, 1, face);
  set('mob.hunter.gun', px, py, gr);
  reach('mob.hunter.arm', HUNT_ARM, fx(-2.2, -4.2), fy(-2.2, -4.2), px, py, 0);
  if (flash > 0.02 || glint > 0.02) {
    const mx = px + HUNT_MUZZLE[0] * c - HUNT_MUZZLE[1] * s;
    const my = py + HUNT_MUZZLE[0] * s + HUNT_MUZZLE[1] * c;
    if (flash > 0.02) set('mob.hunter.flash', mx, my, gr, 1.2 - 0.5 * flash, 1.2 - 0.5 * flash, 0, flash);
    if (glint > 0.02) set('mob.hunter.glint', mx, my, t * 3, glint, glint, 0, glint);
  }
}
defineRig('hunter', { draw: drawHunter });
RIG_INFO.hunter = { acts: COMMON, w: 64, h: 50, shadow: 20 };

// ---------- гончая ----------
// Поджарая охотничья собака на длинных лапах: белая с рыжим седлом и рыжей «шапкой», уши-лопухи, хвост прутом
// кверху, красный ошейник. Собрана на общем скелете четвероногих (art-mobs2.js).

const HOUND = { coat: '#efe4d0', light: '#ffffff', dark: '#b9a78c', back: '#a9622e', cream: '#fff8ea', creamShade: '#d8c8ac', ink: 0.62 };
const houndT = furTones(HOUND, 1.3);
const houndEar = tone('#96521f', { light: '#c98244', dark: '#5e3212', line: houndT.coat.line, lw: 1.1 });
const HOUND_EYE = '#ffb347';
// морды — как у всех четвероногих, и ещё одна: дышит, высунув язык
const PANT = 5;
const HOUND_FACES = [...FACES, { ear: 0.1, mouth: 4, eye: 'fierce', lid: 0.3 }];

definePart('mob.hound.body', [-11.6, -6.8, 11.8, 6.6], (g) => {
  // глубокая грудь справа, подтянутый живот
  blob(g, [[-9.6, -2.2], [-6, -4.6], [-0.5, -4.8], [5, -5.4], [8.8, -4.2], [10.2, -0.6], [9.6, 3], [6.4, 5.2], [1.4, 3.4], [-3.6, 2.4], [-7.6, 3.4],
    [-10.2, 1]], houndT.coat, {
    over(c, patch) {
      patch([[-4.6, -8], [5.6, -8], [6.4, -3.6], [3.4, -1.2], [-1, -0.6], [-4.4, -2.4]], houndT.back);       // рыжее седло
      patch([[-12, -1], [-8.6, -2.2], [-7.2, 0.6], [-9, 3.6], [-12, 4]], houndT.back);                        // и пятно на крупе
      patch([[7.4, -8], [9.4, -8], [11.6, -1.8], [9.6, -1]], RED);                                            // ошейник
      glow(c, -6, -1.4, 3.6, '#ffffff', 0.35);
      glow(c, 9.4, 0.6, 4.6, darken(HOUND.dark, 0.3), 0.4);
    },
  });
});

const HOUND_LEG = [[-2, 0], [0, -2], [2, 0], [1.7, 5.6], [3.7, 8.4], [3, 10.2], [-1.3, 10.2], [-2, 8.2], [-1.7, 3.8]];
legPart('mob.hound.leg', [-3.2, -3, 5.2, 11.4], HOUND_LEG, houndT, {
  lw: 1.1, fade: 1.4,
  over(c, patch, v) {
    stroke(c, [[1.9, 8.9], [1.8, 9.9]], alpha(houndT.coat.line, v ? 0.5 : 0.8), 0.45);
    stroke(c, [[2.9, 8.8], [2.9, 9.7]], alpha(houndT.coat.line, v ? 0.5 : 0.8), 0.45);
  },
});

// хвост прутом: рыжий у корня, кончик белый
tailPart('mob.hound.tail', [-11.4, -3.4, 3, 3.4], [...tailJoint(1.7), [-3, 1.9], [-6.4, 1.2], [-10, 0, 1], [-6.4, -1.1], [-3, -1.8]], { ...houndT.coat, lw: 1.1 },
  (c, patch) => patch([[4, -4], [-5, -4], [-6.2, 0], [-5, 4], [4, 4]], houndT.back));

// голова; сустав — шея, середина головы — в HOUND_HC от него
const HOUND_HC = [2.6, -1];
definePart('mob.hound.head', [-9.6, -9, 16.6, 11.4], (g, v) => {
  const F = HOUND_FACES[v];
  g.translate(HOUND_HC[0], HOUND_HC[1]);
  // дальнее ухо — краешек за головой
  blob(g, [[0.4, -4.4], [3.2, -5], [4.4, -3], [3.4, -0.4], [1.2, -1.2]], tone(darken(HOUND.back, 0.3), { line: houndT.coat.line, lw: 1.1, rim: 0.2 }));
  if (F.mouth === 2) jawOpen(g, 4, 2.6, 7.2, 2.8, 0.56, { ...houndT.cream, lw: 1.1 }, { fang: 0.9, fangH: 2 });
  blob(g, [[-5.6, 0.6], [-5, -2.6], [-2.6, -4.8], [1, -5.2], [4, -4], [5.6, -2.2], [8, -1.7], [10.6, -1], [11.9, 0.7], [11, 2.7], [8, 3.5], [4.4, 3.9],
    [1, 4.6], [-2.6, 4.2], [-5, 3]], houndT.coat, {
    over(c, patch) {
      patch([[-8, -1.4], [-3, -1], [1.6, 0.4], [4.6, -1], [6, -3], [6, -8], [-8, -8]], houndT.back);         // рыжая «шапка» через глаз
      lips(c, F.mouth === 4 ? 3 : F.mouth, 6, 11.2, 2.8, houndT.coat.line);
    },
  });
  if (F.mouth === 2) {
    fang(g, 9.9, 3.3, 0.9, 2.2);
    fang(g, 8, 3.7, 0.7, 1.4);
  }
  if (F.mouth >= 3) {
    // язык: у оглушённой — набок, у запыхавшейся — длинный
    const d = F.mouth === 4 ? 2.4 : 0;
    blob(g, [[7.4, 3.4], [9.4, 3.2], [9.9, 5.4 + d], [8.7, 6.6 + d], [7.3, 5.4 + d]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  }
  if (F.eye === 'fierce') {
    fierceEye(g, 5.4, -1.9, 1.3, HOUND_EYE, { lid: F.lid, slant: 0.34, wide: 0.72 });
    fierceEye(g, 1.4, -1.4, 1.9, HOUND_EYE, { lid: F.lid, slant: 0.28 });
  } else {
    eye(g, 5.4, -1.9, 1.3, { kind: F.eye, color: '#2a1c26' });
    eye(g, 1.4, -1.4, 1.9, { kind: F.eye, color: '#2a1c26' });
  }
  nose(g, 11.5, 0.2, 1.5, '#2a2026');
  // ближнее ухо висит лопухом; в броске и от боли отлетает назад
  g.save();
  g.translate(-2.8, -3.8);
  g.rotate(-F.ear * 1.1);
  blob(g, [[-1.8, -0.4], [1.2, -0.8], [2.6, 1.6], [2, 5.6], [0.4, 8.4], [-1.8, 8], [-3, 4.6]], houndEar);
  g.restore();
}, HOUND_FACES.length);

const HOUND_M = {
  kBody: 'mob.hound.body', kHead: 'mob.hound.head', kLeg: 'mob.hound.leg', kTail: 'mob.hound.tail',
  body: [-0.5, -13], neck: [8.4, -2.6], tail: [-9.2, -1.6],
  legNF: [6.6, 2.2], legFF: [8.4, 2.1], legNH: [-7.4, 1.2], legFH: [-5.6, 1.1], arm: [7, -1],
  leg: 10.7, sit: 2.4,
  style: { breath: 2.8, head: 0.02, tail: 0.75, tailF: 5, tailA: 0.16, pace: 18, swing: 0.85, lift: 0.34, bob: 1.5, lean: 0.06, tailRun: 0.3 },
};

function houndPose(p, act, t, k, a) {
  const M = HOUND_M;
  switch (act) {
    case 'windup': {
      // коротко припала на грудь: зад выше головы, хвост палкой, оскал; чем ближе бросок, тем сильнее дрожит
      beastIdle(p, t, M);
      const c = 0.7 + 0.3 * smooth(k);
      p[BX] = -2 * c + Math.sin(t * 48) * 0.25 * k;
      p[BY] = 3 * c;
      p[BR] = 0.26 * c;
      p[BSY] = 1 - 0.08 * c;
      p[HX] = 0.8;
      p[HY] = 1.8 * c;
      p[HR] = 0.1;
      p[TR] = 1.15 + Math.sin(t * 48) * 0.03 * k;
      p[L1] = -0.75 * c;
      p[L1 + 1] = -0.82 * c;
      p[L1 + 2] = 0.24 * c;
      p[L1 + 3] = 0.16 * c;
      return SNARL;
    }
    case 'leap':
      beastLeap(p, k, t, M, 1.15);
      return k < 0.85 ? BITE : SNARL;
    case 'attack': {
      // приземлилась и щёлкнула зубами: голова выстреливает вперёд
      beastIdle(p, t, M);
      const snap = lunge(k);
      p[BX] += 2 * snap;
      p[BR] += 0.08 * snap;
      p[HX] += 3 * snap;
      p[HY] += 0.8 * snap;
      p[HR] += 0.1 * snap;
      p[TR] += 0.3 * snap;
      p[L1] -= 0.3 * snap;
      p[L1 + 1] -= 0.3 * snap;
      p[L1 + 2] += 0.3 * snap;
      p[L1 + 3] += 0.3 * snap;
      return k < 0.34 ? BITE : SNARL;
    }
    case 'recover':
      // переводит дух: язык наружу
      beastCommon(p, act, t, k, a, M);
      return k < 0.8 ? PANT : CALM;
    default:
      return beastCommon(p, act, t, k, a, M);
  }
}
beastRig('hound', HOUND_M, houndPose);
RIG_INFO.hound = { acts: [...COMMON, 'leap'], w: 62, h: 40, shadow: 26 };

// ---------- чёрный лис ----------
// Соперник лисы: те же части и те же позы (art-fox.js), только шкура чёрно-лиловая, морда серая, глаза жёлтые.
// Замах — лисья «пружина» перед рывком: по ней игрок и узнаёт, что сейчас будет.

const DARK = {
  coat: '#40365c', light: '#7566a3', dark: '#211b36', cream: '#bdbacb', creamLight: '#e6e3f0', creamShade: '#8a869f',
  sock: '#17131f', sockLight: '#3c3556', sockDark: '#0c0a12', sockFar: '#110e18', sockFarLight: '#2a2540', sockFarDark: '#08070c',
  ear: '#8a63a0', nose: '#110d16', eye: '#ffd23f', toe: '#6a6288', blush: null,
};
const DARK_RIM = '#0e0b14';
const DARK_LINE = '#e9e4f6';      // закрытый глаз и крестик — светлой линией: тёмную на чёрной шкуре не видно
const DARK_K = defineFoxParts('mob.darkfox', DARK, (g, v) => {
  if (v === 0) fierceEye(g, 0, 0, 2.2, DARK.eye, { lid: 0.3, slant: 0.24, rim: DARK_RIM });
  else if (v === 1) fierceEye(g, 0, 0, 2.2, DARK.eye, { lid: 0.48, slant: 0.34, rim: DARK_RIM });
  else if (v === 6) eye(g, 0, 0, 2.6, { kind: 'wide', color: DARK_RIM });
  else eye(g, 0, 0, 2.8, { kind: ['', '', 'closed', 'happy', 'cross', 'squint'][v], color: DARK_LINE });
});

const DP = new Float32Array(FOX_POSE.SIZE);
const DP2 = new Float32Array(FOX_POSE.SIZE);
// лисьи части ставит drawFox — через этот набор они сдвигаются и гаснут вместе со всей фигурой
const SHIFTED = { part: (ctx, key, x, y, rot = 0, sx = 1, sy = 1, al = 1, v = 0) => set(key, x, y, rot, sx, sy, v, al) };

defineRig('darkfox', {
  draw(kit, ctx, a) {
    open(kit, ctx);
    const F = FOX_POSE;
    const p = DP;
    const t = num(a.t);
    const k = clamp01(num(a.k));
    const speed = clamp01(num(a.speed));
    let act = a.act;
    if (act === 'spawn') {
      appear(k);
      act = 'idle';
    }
    // в рывке — куда летит, перед ним — куда метит
    const lean = act === 'dash' && (num(a.vx) || num(a.vy)) ? clamp(Math.atan2(num(a.vy), Math.abs(num(a.vx))), -1.1, 1.1) : tiltOf(aimOf(a));
    let eyes = F.blinks(t + 0.9) ? 2 : 0;
    let mouth = 0;
    switch (act) {
      case 'move':
        F.move(p, t, Math.max(speed, 0.35));
        break;
      case 'windup':
        // сжался, как пружина; чем ближе рывок, тем сильнее дрожит
        F.aim(p, t, lean);
        p[F.BX] += Math.sin(t * 46) * 0.3 * k;
        eyes = 1;
        break;
      case 'dash':
        F.dash(p, k, t, lean);
        eyes = 1;
        break;
      case 'attack':
        F.move(p, t, speed);
        F.bite(p, k);
        mouth = k < 0.32 ? 1 : 0;
        eyes = 1;
        break;
      case 'recover':
        // приземлился и замер, бока ходят — тут его и бить
        F.land(p, k, t);
        p[F.BSY] += Math.sin(t * 13) * 0.03 * (1 - k);
        if (k < 0.45) eyes = 1;
        break;
      case 'stun':
        // осел на разъехавшихся лапах, голова мотается
        F.down(DP2, t);
        F.idle(p, t);
        F.blend(p, DP2, p, 0.42);
        p[F.BX] += Math.sin(t * 5.4) * 0.8;
        p[F.HR] += 0.1 + Math.sin(t * 5.4 - 0.9) * 0.2;
        eyes = 4;
        break;
      case 'hurt':
        F.move(p, t, speed);
        F.hurt(p, k);
        if (k < 0.75) eyes = 5;
        break;
      default:
        F.idle(p, t);
    }
    drawFox(SHIFTED, ctx, p, eyes, mouth, DARK_K);
  },
});
RIG_INFO.darkfox = { acts: [...COMMON, 'dash'], w: 64, h: 50, shadow: 30 };

// ---------- пугало ----------
// Вкопано и с места не сходит: шест, синяя латаная рубаха на перекладине, солома из рукавов, тыква вместо головы и
// мятая шляпа. Задней рукой бросает тыквы: перед броском прорези в тыкве загораются, рука с тыквой уходит назад.

const SCARE = {
  shirt: '#4f6f96', shirtLight: '#8fb0d2', shirtDark: '#2f4666', straw: '#e9c96a', strawLight: '#fff0a8', strawDark: '#b08a34', wood: '#7a5a3a',
  pump: '#f08a24', pumpLight: '#ffc061', pumpDark: '#b3521a', cut: '#4a2210', hot: '#ffe98a', hat: '#5a4a6a',
};
const scareShirt = tone(SCARE.shirt, { light: SCARE.shirtLight, dark: SCARE.shirtDark, lw: 1.4 });
const scareStraw = tone(SCARE.straw, { light: SCARE.strawLight, dark: SCARE.strawDark, lw: 1 });
const scareWood = tone(SCARE.wood, { light: '#a8825a', dark: '#4e3824', lw: 1.2 });
const scarePump = tone(SCARE.pump, { light: SCARE.pumpLight, dark: SCARE.pumpDark, lw: 1.5 });
const scareHat = tone(SCARE.hat, { light: '#8a7a9c', dark: '#352a42', lw: 1.3 });

// шест с пучком соломы у земли; сустав — вкопанный конец
definePart('mob.scarecrow.post', [-7, -25, 7, 2], (g) => {
  capsule(g, 0, -23, 1.5, 0, -1, 1.7, scareWood);
  blob(g, [[-5.4, 0.6], [-4.6, -2.6, 1], [-3, -0.8], [-1.6, -4, 1], [-0.2, -1], [1.6, -3.6, 1], [2.8, -0.8], [4.8, -2.4, 1], [5.6, 0.6], [0, 1.2]], scareStraw);
});

// рубаха: рваный подол, заплаты, верёвка вместо пояса, соломенный ворот; сустав — середина
definePart('mob.scarecrow.body', [-9, -10.6, 9, 11.6], (g) => {
  // солома торчит из-под подола
  blob(g, [[-5.6, 5], [5.6, 5], [5, 8.4, 1], [3.6, 6.4], [2.4, 10, 1], [1, 6.6], [-0.4, 10.4, 1], [-1.8, 6.6], [-3.2, 9.6, 1], [-4.4, 6.4], [-5.4, 8.6, 1]], scareStraw);
  blob(g, [[-5.4, -7.2], [0, -8.2], [5.4, -7.2], [6.6, -2], [7.2, 3.6], [6.6, 6.4], [3.4, 5.6, 1], [1.6, 7.4, 1], [-0.6, 5.8, 1], [-3, 7.6, 1], [-4.6, 5.6, 1],
    [-6.8, 6.6], [-7.4, 3], [-6.6, -2.4]], scareShirt, {
    over(c, patch) {
      patch([[-5, -1.6], [-1.2, -2.2], [-0.8, 1.2], [-4.6, 1.6]], tone('#e2b84a', { dark: '#a8802a' }));
      patch([[2, 2.6], [5.6, 2], [6, 5], [2.4, 5.4]], tone('#b8503a', { dark: '#7a2e20' }));
      // стежки на заплатах
      stroke(c, [[-5.4, -2.2], [-4.4, -1]], alpha(SCARE.cut, 0.7), 0.5);
      stroke(c, [[-1.6, -2.8], [-0.6, -1.6]], alpha(SCARE.cut, 0.7), 0.5);
      stroke(c, [[1.6, 2], [2.6, 3.2]], alpha(SCARE.cut, 0.7), 0.5);
      stroke(c, [[-8, 0.6], [-2, 1.6], [3, 1.2], [8, 0.2]], '#c9a56b', 1.1);          // верёвка
      glow(c, 0.4, -7, 5, darken(SCARE.shirtDark, 0.25), 0.5);                       // тень от головы
    },
  });
  blob(g, [[-3.4, -7.4], [-4.2, -9.4, 1], [-2.2, -8.4], [-1.4, -10, 1], [0, -8.6], [1.6, -10, 1], [2.4, -8.4], [4.4, -9.4, 1], [3.6, -7.2], [0, -6.6]], scareStraw);
});

// рукав с пучком соломы вместо кисти; сустав — плечо. 0 — передняя рука (смотрит вперёд), 1 — задняя (назад)
const SCARE_ARMS = 0.86;                        // руки в кадре чуть короче, чем нарисованы
const SCARE_ARM = 12.6 * SCARE_ARMS;            // от плеча до конца соломы
definePart('mob.scarecrow.arm', [-15, -4.6, 15, 4.8], (g, v) => {
  const d = v ? -1 : 1;
  blob(g, [[8, -2.2], [10.6, -3.4, 1], [10.4, -1.6], [13.6, -1.4, 1], [11, -0.2], [13.8, 1.2, 1], [10.6, 1.2], [11, 3.2, 1], [8, 2.4]].map((p) => [p[0] * d, p[1], p[2]]),
    scareStraw);
  limb(g, 0, 0, 2.6, d * 8.4, 0.3, 2.9, { ...scareShirt, lw: 1.2 });
}, 2);

/** Прорезь в тыкве: тёмная или горящая, с тёмным краем. */
function carve(c, pts, lit) {
  c.beginPath();
  pathPoly(c, pts);
  c.fillStyle = lit ? SCARE.hot : SCARE.cut;
  c.fill();
  c.strokeStyle = lit ? '#b3521a' : '#2e1408';
  c.lineWidth = 0.5;
  c.lineJoin = 'round';
  c.stroke();
}

// голова-тыква в шляпе; сустав — шея. 0 — спокойно, 1 — прорези горят (замах и бросок), 2 — оглушено, 3 — больно
definePart('mob.scarecrow.head', [-10.8, -20, 11, 2], (g, v) => {
  blob(g, [[-7.8, -6.4], [-6.4, -11.2], [-2.6, -13.2], [2.6, -13.2], [6.6, -11.2], [8, -6.4], [6.6, -1.8], [2.6, 0], [-2.6, 0], [-6.4, -1.8]], scarePump, {
    over(c) {
      for (const x of [-4.4, -1.2, 2.4, 5.2]) stroke(c, [[x * 0.8, -13], [x * 1.12, -6.6], [x * 0.8, -0.2]], alpha(SCARE.pumpDark, 0.55), 0.8);      // дольки
      const lit = v === 1;
      if (lit) {
        glow(c, 0.6, -8.4, 4.4, '#fff6c0', 0.7);
        glow(c, 5, -8.4, 3.6, '#fff6c0', 0.7);
        glow(c, 2.6, -4, 6, '#fff6c0', 0.5);
      }
      if (v < 2) {
        // глаза-треугольники скошены к носу, оскал зубцами
        carve(c, [[-1.6, -9.8], [2.6, -8.6], [0.2, -6.6]], lit);
        carve(c, [[3.8, -8.6], [7, -9.8], [5.6, -6.8]], lit);
        carve(c, [[-2.4, -4.6], [-0.6, -3.8], [0.6, -4.8], [2, -3.6], [3.4, -4.8], [4.8, -3.6], [6, -4.8], [7.2, -4.4], [5.6, -1.9], [3.6, -2.9], [2.2, -1.6],
          [0.6, -2.8], [-0.8, -1.9]], lit);
      } else {
        const kind = v === 2 ? 'cross' : 'squint';
        eye(c, 0.4, -8.4, 2.2, { kind, color: SCARE.cut });
        eye(c, 5.2, -8.4, 1.9, { kind, color: SCARE.cut, dir: -1 });
        if (v === 2) stroke(c, [[-1.6, -3.4], [0.4, -4.4], [2.4, -3.2], [4.4, -4.4], [6.4, -3.4]], SCARE.cut, 1.1);
        else carve(c, [[1, -4.6], [4.6, -4.8], [5.2, -2.6], [2.8, -1.6], [0.6, -2.6]], false);
      }
    },
  });
  // шляпа: мятая тулья, кончик завалился вперёд; поверх — поля
  blob(g, [[-4.8, -12.6], [-3.8, -15.6], [-1.6, -17.6], [1.6, -18.4], [4.6, -18.8, 1], [3.6, -16.4], [4.6, -14.6], [5.2, -12.6]], scareHat, {
    over(c, patch) {
      patch([[-7, -14.6], [8, -14.2], [8, -12], [-7, -12.4]], tone(SCARE.straw, { dark: SCARE.strawDark }));
    },
  });
  ball(g, 0.4, -12.4, 9.4, 2, scareHat);
}, 4);

function drawScarecrow(kit, ctx, a) {
  open(kit, ctx);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  let sway = Math.sin(t * 1.7) * 0.03 + Math.sin(t * 2.9 + 1) * 0.012;      // наклон всего пугала вокруг вкопанного конца
  let back = -0.14 + Math.sin(t * 3.1) * 0.05;       // задняя рука: 0 — в сторону, плюс — вверх
  let front = 0.14 + Math.sin(t * 2.6 + 2) * 0.05;   // передняя: 0 — в сторону, плюс — вниз
  let hr = Math.sin(t * 1.3 + 0.5) * 0.04;
  let face = 0;
  let pumpkin = 0;           // тыква в руке: размер 0…1
  let hop = 0;
  switch (act) {
    case 'move':
      // сдвинули — прыгает на шесте обратно на своё место
      sway = Math.sin(t * 9) * 0.09;
      hop = Math.abs(Math.sin(t * 9)) * 1.6;
      back -= 0.2;
      front += 0.2;
      break;
    case 'windup': {
      const c = 0.7 + 0.3 * smooth(k);
      sway = -0.1 * c + Math.sin(t * 42) * 0.012 * k;
      back = 1.05 * c + Math.sin(t * 42) * 0.03 * k;
      front = 0.5 * c;
      hr = -0.06;
      face = 1;
      pumpkin = smooth(k / 0.25);
      break;
    }
    case 'attack': {
      // бросок: рука через верх вперёд, всё пугало качнулось следом; потом рука возвращается
      const hit = easeOut(k / 0.3);
      const ret = smooth((k - 0.45) / 0.55);
      sway = lerp(lerp(-0.1, 0.16, hit), sway, ret);
      back = lerp(lerp(1.05, 3.3, hit), back, ret);
      front = lerp(0.5, front, ret);
      hr = lerp(0.1 * hit, hr, ret);
      face = k < 0.6 ? 1 : 0;
      break;
    }
    case 'recover': {
      const q = 1 - smooth(k);
      sway = Math.sin(t * 7) * 0.06 * q;
      back -= 0.3 * q;
      front += 0.3 * q;
      break;
    }
    case 'stun':
      sway = Math.sin(t * 5) * 0.07;
      back = -0.9;
      front = 0.9;
      hr = 0.3 + Math.sin(t * 5 - 1) * 0.2;
      face = 2;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      sway -= 0.2 * q;
      back += 0.5 * q;
      front -= 0.5 * q;
      hr = -0.25 * q;
      face = k < 0.7 ? 3 : 0;
      break;
    }
    default:
  }
  if (hop) whole(0, -hop);
  frame(0, 0, sway);
  set('mob.scarecrow.post', 0, 0, sway);
  const sx = fx(-5.2, -27.2);
  const sy = fy(-5.2, -27.2);
  set('mob.scarecrow.arm', sx, sy, sway + back, SCARE_ARMS, SCARE_ARMS, 1);
  // тыква в руке — та же, что потом летит (shot.pumpkin из art-fx.js)
  if (pumpkin > 0.02) set('shot.pumpkin', sx - Math.cos(sway + back) * SCARE_ARM, sy - Math.sin(sway + back) * SCARE_ARM - 1.5, sway + back, pumpkin, pumpkin);
  set('mob.scarecrow.arm', fx(5.2, -27.2), fy(5.2, -27.2), sway + front, SCARE_ARMS, SCARE_ARMS, 0);
  on('mob.scarecrow.body', 0, -22);
  on('mob.scarecrow.head', 0.4, -28.8, hr, 1, 1, face);
}
defineRig('scarecrow', { draw: drawScarecrow });
RIG_INFO.scarecrow = { acts: COMMON, w: 60, h: 64, shadow: 22 };

// ---------- филин-чародей ----------
// Хозяин осенней опушки: большой рогатый филин в звёздном плаще, посох с камнем держит в когтях. Виден спереди:
// крылья раскинуты в стороны и машут за спиной, поэтому лица не закрывают. Высоту (a.z) задаёт рендер; фигура
// нарисована так, что на земле (оглушён) когти стоят в точке привязки.

const OWL = {
  coat: '#8f6f52', light: '#cfa97c', dark: '#523c2c', belly: '#f3e2c0', bellyDark: '#cdb48a', bar: '#a47c56', disc: '#f8ead0', discDark: '#d8bf98',
  eye: '#ffc23a', beak: '#e89a2c', cloak: '#3a3578', cloakLight: '#6a64c2', cloakDark: '#1e1b4a', trim: '#ffc93c', star: '#ffe98a', wood: '#7a5636', gem: '#7fe0ff',
};
const owlCoat = tone(OWL.coat, { light: OWL.light, dark: OWL.dark, lw: 1.6 });
const owlFar = tone(mix(OWL.coat, OWL.dark, 0.5), { light: OWL.coat, dark: darken(OWL.dark, 0.3), line: owlCoat.line, lw: 1.5, rim: 0.25 });
const owlBelly = tone(OWL.belly, { light: '#ffffff', dark: OWL.bellyDark, line: owlCoat.line, lw: 1.6 });
const owlCloak = tone(OWL.cloak, { light: OWL.cloakLight, dark: OWL.cloakDark });
const owlDisc = tone(OWL.disc, { light: '#ffffff', dark: OWL.discDark });
const owlBeak = tone(OWL.beak, { light: '#ffd27a', dark: '#b0621a', lw: 1 });
const OWL_INK = '#3a2a22';

// туловище: пёстрое брюхо между полами плаща; сустав — середина
definePart('mob.owl.body', [-21.6, -24.6, 21.6, 24.6], (g) => {
  blob(g, eggNodes(0, 0, 23, 19, Math.PI / 2, 0.14), owlBelly, {
    over(c, patch) {
      // пестрины: ряды коротких дужек
      const marks = [];
      for (let row = 0; row < 6; row++) for (let i = -2; i <= 2; i++) marks.push([2 + i * 4.4 + (row % 2) * 2.2, -9 + row * 5.6, 0.2, 2.6]);
      fur(c, marks, alpha(OWL.bar, 0.85), 1.1);
      // плащ: две полы, по краю — золотая кайма
      const left = [[-30, -30], [-3, -30], [-6.4, -15], [-9.6, 0], [-8.8, 13], [-11.6, 30], [-30, 30]];
      const right = [[30, -30], [8.6, -30], [11.4, -14], [14, 1], [13.2, 14], [15.6, 30], [30, 30]];
      patch(left, owlCloak);
      patch(right, owlCloak);
      stroke(c, left.slice(1, 6), OWL.trim, 1.3);
      stroke(c, right.slice(1, 6), OWL.trim, 1.3);
      for (const [x, y, r] of [[-14, -8, 2.2], [-17, 6, 1.5], [-12.6, 15, 1.9], [-18.6, -2, 1], [18, -6, 1.7], [19.6, 8, 1.2], [17, 17, 1.6]]) sparkle(c, x, y, r, OWL.star, 0.26);
      glow(c, 3, -20, 11, darken(OWL.cloakDark, 0.3), 0.55);       // тень от головы
    },
  });
});

// крыло: сустав — плечо. 0 — переднее (смотрит вперёд), 1 — заднее (назад); маховые перья — зубцами по нижнему краю
const OWL_WING = [[-3, -4], [4, -6.4], [14, -7], [24, -5.6], [31, -2.4], [32.6, 0.6, 1], [29, 2], [30.4, 5.6, 1], [25.4, 5], [26, 9.2, 1], [20.6, 7.6], [20.6, 12, 1],
  [15.4, 9.4], [14.6, 13.4, 1], [10, 10], [8.4, 13, 1], [4.6, 9], [-2, 6], [-4.4, 1]];
definePart('mob.owl.wing', [-34.6, -9, 34.6, 15.2], (g, v) => {
  const d = v ? -1 : 1;
  blob(g, OWL_WING.map((p) => [p[0] * d, p[1], p[2]]), v ? owlFar : owlCoat, {
    over(c, patch) {
      patch([[0, 4], [10, 2.6], [20, 2], [34, -1], [34, 16], [0, 16]].map((p) => [p[0] * d, p[1]]), tone(darken(OWL.coat, 0.22), { dark: darken(OWL.dark, 0.3) }));
      for (const x of [8, 13, 18, 23, 27.6]) stroke(c, [[x * d, 1.6 + (27.6 - x) * 0.06], [(x + 0.6) * d, 12]], alpha(OWL.dark, 0.6), 0.8);
      fur(c, [[5, -2.4, 0.3], [10, -3.2, 0.2], [15, -3.6, 0.1], [20, -3.2, 0], [25, -2.2, -0.1]].map((m) => [m[0] * d, m[1], m[2] * d, 3]), alpha(OWL.dark, 0.6), 1);
      glow(c, 9 * d, -4, 6, OWL.light, 0.4);
    },
  });
}, 2);

// лицо: 0 — спокоен, 1 — сердит (брови вниз, глаза горят), 2 — колдует (глаза светятся голубым), 3 — оглушён,
// 4 — больно, 5 — устал, 6 — повержен
const OWL_FACES = [
  { eye: 'open', lid: 0.14, slant: 0, iris: OWL.eye },
  { eye: 'open', lid: 0.38, slant: 0.42, iris: '#ffd76a', glow: 0.5 },
  { eye: 'open', lid: 0.04, slant: 0, iris: '#bff3ff', glow: 0.75, beak: 1 },
  { eye: 'cross', beak: 1 },
  { eye: 'squint', beak: 1 },
  { eye: 'open', lid: 0.56, slant: -0.12, iris: OWL.eye, beak: 1 },
  { eye: 'closed' },
];

/** Большой совиный глаз: радужка в тёмном ободке, зрачок, тяжёлое веко сверху (side — с какой стороны клюв). */
function owlEye(g, x, y, r, F, side) {
  if (F.eye !== 'open') {
    eye(g, x, y, r * 0.8, { kind: F.eye, color: OWL_INK, dir: side });
    return;
  }
  if (F.glow) glow(g, x, y, r * 1.8, F.iris, F.glow);
  g.fillStyle = OWL_INK;
  g.beginPath();
  g.arc(x, y, r + 0.9, 0, TAU);
  g.fill();
  g.fillStyle = F.iris;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = '#1c1218';
  g.beginPath();
  g.arc(x + side * r * 0.1, y + r * 0.06, r * 0.5, 0, TAU);
  g.fill();
  speck(g, x - r * 0.34, y - r * 0.36, r * 0.24, 1);
  speck(g, x + r * 0.3, y + r * 0.34, r * 0.1, 0.8);
  // веко: тёмный сегмент над хордой, к клюву ниже
  const cut = Math.asin(clamp(1 - F.lid * 2, -1, 1));
  g.save();
  g.translate(x, y);
  g.rotate(F.slant * side);
  g.fillStyle = mix(OWL.dark, OWL_INK, 0.4);
  g.beginPath();
  g.arc(0, 0, r + 0.95, Math.PI + cut, TAU - cut);
  g.closePath();
  g.fill();
  g.restore();
}

// голова с «рожками»; сустав — шея
definePart('mob.owl.head', [-20.8, -38.6, 23.8, 4], (g, v) => {
  const F = OWL_FACES[v];
  blob(g, [[-18.6, -11], [-17.6, -19], [-15.8, -25], [-16.8, -35.8, 1], [-10, -27.6], [-3, -28.8], [1.5, -27.6], [6, -28.8], [13, -27.6], [19.8, -35.8, 1],
    [18.8, -25], [20.6, -19], [21.6, -11], [19, -3.6], [11, 0.6], [1.5, 1.6], [-8, 0.6], [-16, -3.6]], owlCoat, {
    over(c, patch) {
      // светлые лицевые диски и тёмный клин бровей между ними
      patch((p) => pathEllipse(p, -7, -12.6, 10, 10.6), owlDisc);
      patch((p) => pathEllipse(p, 10, -12.6, 9.4, 10.4), owlDisc);
      patch([[-4.4, -31], [7.4, -31], [5, -21.4], [1.5, -13.6], [-2, -21.4]], tone(darken(OWL.coat, 0.3), { dark: darken(OWL.dark, 0.35) }));
      // ободки дисков и пестрины на лбу
      stroke(c, [[-2.6, -21], [-9, -23.4], [-15.2, -19], [-17.2, -11.6], [-13.6, -4.6], [-6.6, -1.9]], alpha(OWL.dark, 0.6), 1);
      stroke(c, [[5.6, -21], [11.6, -23.2], [17.6, -19], [19.6, -11.6], [16.4, -4.6], [10, -2]], alpha(OWL.dark, 0.6), 1);
      fur(c, [[-11, -27, 1.2, 2.4], [-6, -25.6, 1.3, 2.4], [9.6, -25.6, 1.8, 2.4], [14.6, -27, 1.9, 2.4], [-14, -30, 1.1, 2.6], [17, -30, 2, 2.6]], alpha(OWL.light, 0.8), 1);
    },
  });
  owlEye(g, -7, -13, 6, F, 1);
  owlEye(g, 10, -13, 5.6, F, -1);
  if (F.beak) {
    // клюв раскрыт: тёмный зев и нижняя половинка
    g.fillStyle = MOUTH;
    g.beginPath();
    g.ellipse(1.5, -5.8, 2.3, 2.6, 0, 0, TAU);
    g.fill();
    blob(g, [[-0.6, -4.4], [3.6, -4.4], [2.6, -2.2], [1.5, -1.2, 1], [0.4, -2.2]], owlBeak);
  }
  const up = F.beak ? -0.8 : 0;
  blob(g, [[-1.4, -11.6 + up], [1.5, -12.8 + up], [4.4, -11.6 + up], [3.5, -7.4 + up], [1.5, -4.6 + up, 1], [-0.5, -7.4 + up]], owlBeak);
}, OWL_FACES.length);

// лапа: три пальца с когтями; сустав — щиколотка
definePart('mob.owl.foot', [-5, -3, 6, 7.4], (g) => {
  for (const x of [-2.6, 0.4, 3.2]) {
    tri(g, x - 0.9, 4.8, x + 0.9, 4.8, x + x * 0.16, 6.9, OWL_INK);
    capsule(g, x * 0.4, 0, 1.5, x, 4.2, 1.2, owlBeak);
  }
});

// посох: сустав — хват, камень — впереди
const OWL_GEM = 25;                             // от хвата до камня
definePart('mob.owl.staff', [-21, -6, 30.6, 6], (g) => {
  capsule(g, -19, 0.2, 1.5, 19, -0.2, 1.3, tone(OWL.wood, { light: '#a8825a', dark: '#4e3622', lw: 1.2 }));
  for (const x of [-3, -1, 1, 3]) stroke(g, [[x, -1.4], [x + 0.8, 1.4]], alpha(OWL_INK, 0.7), 0.7);       // обмотка у хвата
  // золотые рожки держат камень
  stroke(g, [[18.6, -1], [21, -3.9], [24.8, -4.6]], '#c8901c', 1.7);
  stroke(g, [[18.6, 1], [21, 3.9], [24.8, 4.6]], '#c8901c', 1.7);
  blob(g, [[21.4, 0, 1], [25, -3.4, 1], [29.2, 0, 1], [25, 3.4, 1]], tone(OWL.gem, { light: '#e9fbff', dark: '#3aa8d8', line: '#1f6f9a', lw: 1 }));
  shine(g, 25, 0, 3);
});

// сияние камня, перо (вихрь и разлёт) и звезда (кружит у камня, когда филин колдует)
definePart('mob.owl.glow', [-12, -12, 12, 12], (g) => {
  glow(g, 0, 0, 12, '#bff3ff', 0.9);
  glow(g, 0, 0, 6, '#ffffff', 0.8);
}, 1, 0);
definePart('mob.owl.feather', [-6, -2.6, 6, 2.6], (g) => {
  leaf(g, -5, 0, 5, 0, 3.6, tone(OWL.light, { dark: OWL.coat, line: owlCoat.line, lw: 0.8 }), 0, alpha(OWL.dark, 0.7));
}, 1, 0.5);
definePart('mob.owl.star', [-3.4, -3.4, 3.4, 3.4], (g) => {
  glow(g, 0, 0, 3.4, OWL.star, 0.6);
  sparkle(g, 0, 0, 3, '#fffbe0', 0.24);
}, 1, 0.5);

const OWL_C = [0, -27];                         // середина тела в осях фигуры
const OWL_SIZE = 0.93;                          // вся фигура в кадре — чуть меньше рисунка

/** Часть мимо общего сдвига и гашения фигуры: перья вихря остаются на месте, когда сам филин исчезает. */
function loose(key, x, y, rot, s, al) {
  KIT.part(CTX, key, x, y, rot, s, s, clamp01(al), 0);
}

function drawOwl(kit, ctx, a) {
  open(kit, ctx);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  whole(0, 0, 0, OWL_SIZE, OWL_SIZE);
  let beat = Math.sin(t * 7.6);    // взмах: 1 — крылья внизу, −1 — вверху
  let up = 0.3;                    // крылья: середина взмаха (плюс — выше), размах, ширина (сложенное — уже)
  let span = 0.55;
  let fold = 1;
  let bx = 0;                      // тело: сдвиг, наклон (плюс — вперёд), приплюснутость
  let by = 0;
  let lean = 0;
  let squash = 1;
  let hx = 0;                      // голова: сдвиг от шеи, наклон, лицо
  let hy = 0;
  let hr = Math.sin(t * 0.9) * 0.03;
  let face = 0;
  let sx = 2;                      // посох: хват в осях тела и наклон (минус — камнем вверх)
  let sy = 24.6;
  let sr = -0.08;
  let shineA = 0.25 + 0.1 * Math.sin(t * 3);      // сияние камня: яркость и размер
  let shineS = 0.5;
  let claws = 0;                   // лапы: 0 — висят, 1 — когтями вперёд
  let swirl = 0;                   // вихрь перьев вокруг (исчезает и появляется)
  let burst = -1;                  // перья разлетаются: ход 0…1 (−1 — нет)
  let stars = 0;                   // звёзды у камня
  let turn = 0;                    // вся фигура: поворот вокруг середины тела, размер, прозрачность
  let size = 1;
  let fade = 1;
  switch (act) {
    case 'move':
      lean = 0.1;
      break;
    case 'windup': {
      // крылья вскинуты и дрожат, посох поднят, камень разгорается — всё время предупреждения
      const c = 0.6 + 0.4 * smooth(k);
      up = 0.95 * c;
      span = 0.05 + 0.05 * k;
      beat = Math.sin(t * 30);
      by = -1.5 * c;
      lean = -0.06 * c;
      hr = -0.05;
      face = 1;
      sx = 4;
      sr = -0.45 - 0.35 * c;
      shineA = 0.4 + 0.6 * k;
      shineS = 0.6 + 0.6 * k;
      break;
    }
    case 'attack': {
      // веер перьев: крылья с размаху вниз, самого бросает вперёд; потом возвращается к обычным взмахам
      const hit = easeOut(k / 0.3);
      const ret = smooth((k - 0.4) / 0.6);
      up = lerp(lerp(0.95, -0.75, hit), up, ret);
      span *= ret;
      by = lerp(-1.5, 2, hit) * (1 - ret);
      lean = lerp(-0.06, 0.18, hit) * (1 - ret);
      face = k < 0.6 ? 2 : 0;
      sx = lerp(4, sx, ret);
      sr = lerp(-0.8, sr, ret);
      shineA = lerp(1, shineA, ret);
      shineS = lerp(1.2, shineS, ret);
      break;
    }
    case 'cast':
      // колдует: посох вперёд, камень пульсирует, вокруг него кружат звёзды
      up = 0.6;
      span = 0.2;
      beat = Math.sin(t * 5);
      lean = 0.08;
      hr = 0.06;
      face = 2;
      sx = 7;
      sr = -0.3 + Math.sin(t * 9) * 0.05;
      shineA = 0.8 + 0.2 * Math.sin(t * 16);
      shineS = 1.1 + 0.25 * Math.sin(t * 16);
      stars = smooth(k / 0.15) * (1 - smooth((k - 0.85) / 0.15));
      break;
    case 'teleport': {
      // исчезает в вихре перьев и появляется снова: к середине филина нет вовсе
      const gone = k < 0.5 ? smooth(k / 0.4) : 1 - smooth((k - 0.6) / 0.4);
      size = 1 - 0.85 * gone;
      fade = 1 - gone;
      turn = gone * (k < 0.5 ? 2.4 : -2.4);
      swirl = Math.sqrt(bump(k));
      up = 0.9;
      span = 0.1;
      face = 2;
      shineA = 1;
      shineS = 1.3;
      break;
    }
    case 'dive': {
      // пике: головой вперёд, крылья сложены вдоль тела, к концу — когти вперёд
      const d = smooth(k / 0.35);
      claws = smooth((k - 0.55) / 0.35);
      turn = 1.3 * d * (1 - 0.6 * claws);
      up = lerp(up, -1.25, d);
      span = 0.04;
      beat = Math.sin(t * 40);
      fold = 1 - 0.35 * d;
      face = 1;
      sr = 0.25 * d;
      break;
    }
    case 'recover': {
      // после удара: сильные взмахи, выравнивается
      const q = 1 - smooth(k);
      beat = lerp(beat, Math.sin(t * 11), q);
      span += 0.2 * q;
      up -= 0.1 * q;
      by = 1.5 * q;
      hr = 0.1 * q;
      face = q > 0.5 ? 5 : 0;
      break;
    }
    case 'stun': {
      // сидит на земле: крылья повисли, голова мотается, посох выпал
      const wob = Math.sin(t * 5);
      up = -0.95 + wob * 0.03;
      span = 0;
      by = 0.8;
      squash = 0.92;
      lean = wob * 0.05;
      hx = wob * 1.2;
      hy = 3;
      hr = 0.25 + Math.sin(t * 5 - 1) * 0.22;
      face = 3;
      sx = 8;
      sy = 26;
      sr = 0.05;
      shineA = 0.1;
      break;
    }
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      bx = -3 * q;
      lean = -0.14 * q;
      up += 0.5 * q;
      span *= 1 - q;
      hr = -0.2 * q;
      face = k < 0.7 ? 4 : 0;
      burst = k;
      break;
    }
    case 'tired': {
      // переводит дух: висит ниже, взмахи тяжёлые и редкие, голова опущена
      const w = smooth(k / 0.15) * (1 - smooth((k - 0.85) / 0.15));
      beat = lerp(beat, Math.sin(t * 4.6), w);
      span += 0.15 * w;
      up -= 0.3 * w;
      by = 3 * w;
      hy = 2.5 * w;
      hr += 0.2 * w;
      face = w > 0.5 ? 5 : 0;
      shineA = lerp(shineA, 0.12, w);
      break;
    }
    case 'dead': {
      // повержен: крылья обмякли, заваливается назад и тает; перья разлетаются
      const fall = smooth(k / 0.5);
      turn = -1.1 * fall;
      up = lerp(up, -1.1, fall);
      span = 0;
      by = 6 * fall;
      hr = -0.3 * fall;
      face = 6;
      fade = 1 - smooth((k - 0.7) / 0.3);
      shineA = 0;
      burst = k;
      break;
    }
    default:
  }
  // поворот и размер — вокруг середины тела, а не точки привязки
  const cx = WX + OWL_C[0] * WSX;
  const cy = WY + OWL_C[1] * WSY;
  const ws = WSX;
  if (turn !== 0 || size !== 1 || fade !== 1) whole(OWL_C[1] * size * Math.sin(turn), OWL_C[1] * (1 - size * Math.cos(turn)), turn, size, size, fade);

  const raise = up - span * beat;
  frame(OWL_C[0] + bx, OWL_C[1] + by - span * beat * 2, lean, 1, squash);
  on('mob.owl.wing', -13.5, -11, raise, 1, fold, 1);
  on('mob.owl.wing', 13.5, -11, -raise, 1, fold, 0);
  set('mob.owl.body', ox, oy, lean, 1, squash);
  const px = fx(sx, sy);
  const py = fy(sx, sy);
  set('mob.owl.staff', px, py, sr);
  on('mob.owl.foot', -4.5, 21.5, -1.1 * claws - 0.1);
  on('mob.owl.foot', 5.5, 21.5, -1.1 * claws + 0.1);
  on('mob.owl.head', 1 + hx, -17 + hy, hr, 1, 1, face);
  // камень: сияние и звёзды вокруг
  const gx = px + Math.cos(sr) * OWL_GEM;
  const gy = py + Math.sin(sr) * OWL_GEM;
  if (shineA > 0.02) set('mob.owl.glow', gx, gy, 0, shineS, shineS, 0, shineA);
  if (stars > 0.02) {
    for (let i = 0; i < 3; i++) {
      const u = t * 5 + i * 2.09;
      set('mob.owl.star', gx + Math.cos(u) * 8, gy + Math.sin(u) * 5, u, 1, 1, 0, stars * (0.7 + 0.3 * Math.sin(u * 3)));
    }
  }
  if (swirl > 0.02) {
    // вихрь: перья кружат вокруг того места, где был филин
    for (let i = 0; i < 8; i++) {
      const u = t * 9 + i * 0.785;
      const r = (10 + 16 * swirl + (i % 2) * 6) * ws;
      loose('mob.owl.feather', cx + Math.cos(u) * r, cy + Math.sin(u) * r * 0.8, u + 1.6, ws, swirl);
    }
  }
  if (burst >= 0 && burst < 1) {
    // выбитые перья: разлетаются и падают
    for (let i = 0; i < 5; i++) {
      const u = i * 1.26 + 0.4;
      const d = (8 + 28 * easeOut(burst)) * ws;
      loose('mob.owl.feather', cx + Math.cos(u) * d, cy + Math.sin(u) * d * 0.7 + 16 * burst * burst * ws, u + burst * 5, ws, 1 - burst);
    }
  }
}
defineRig('owl', { draw: drawOwl });
RIG_INFO.owl = { acts: [...BOSS, 'cast', 'teleport', 'dive'], w: 130, h: 110, shadow: 56 };

// ---------- свои: мордочки без бровей ----------
// Спутники лисы и хозяева комнат смотрят круглыми тёмными глазами и не скалятся. Варианты головы идут в том же
// порядке, что у зверей (спокоен, решителен, пасть раскрыта, оглушён, больно), и ещё два: рад и моргнул.

const HAPPY = 5;
const BLINK = 6;
const PAL_FACES = [
  { eye: 'round', mouth: 0, ear: 0.06 },
  { eye: 'narrow', mouth: 0, ear: -0.4 },
  { eye: 'narrow', mouth: 2, ear: -0.6 },
  { eye: 'cross', mouth: 3, ear: -0.2 },
  { eye: 'squint', mouth: 3, ear: -0.5 },
  { eye: 'happy', mouth: 4, ear: 0.1 },
  { eye: 'closed', mouth: 0, ear: 0.06 },
];
const PAL_EYE = '#221613';
const SCARF = tone('#4aa3ff', { light: '#bfe0ff', dark: '#1f6fd0' });      // голубой платок: «этот — за лису»

/** Глаз своего: круглый и тёмный. ring — светлый ободок (на тёмной шерсти); тогда и чёрточки закрытого глаза светлые. */
function palEye(g, x, y, r, F, ring = null) {
  const full = F.eye === 'round' || F.eye === 'narrow';
  if (ring && full) {
    g.fillStyle = ring;
    g.beginPath();
    g.ellipse(x, y, r * 0.8 + 0.6, r + 0.6, 0, 0, TAU);
    g.fill();
  }
  if (F.eye === 'narrow') eye(g, x, y, r, { kind: 'narrow', lid: 0.3, slant: 0.24, color: PAL_EYE });
  else eye(g, x, y, r, { kind: F.eye, color: ring && !full ? ring : PAL_EYE, glint: '#a85a1e' });
}

/** Рот на мордочке (под обрезкой головой): как lips() у зверей, и ещё 4 — улыбка. Раскрытую пасть (2) рисует jawOpen. */
function palMouth(c, kind, x0, x1, y, line) {
  if (kind === 4) stroke(c, [[x1 - 0.2, y - 0.9], [(x0 + x1) / 2 + 0.8, y + 1.1], [x0 - 0.4, y - 0.1]], alpha(line, 0.9), 0.9);
  else if (kind !== 2) lips(c, kind, x0, x1, y, line);
}

/** Спокойная морда иногда моргает. */
const calmFace = (face, t) => (face === CALM && blinks(t) ? BLINK : face);

// ---------- волчонок ----------
// Спутник лисы: серо-голубой, круглый, большеголовый, на коротких толстых лапах. Нарисован крупно и стоит в игре
// в CUB_M.size от рисунка — так обводка у малыша выходит тонкой. Скелет — общий для четвероногих.

const CUB = { coat: '#a8b2c4', light: '#dfe5ee', dark: '#6d788c', back: '#77829a', cream: '#f6f7fa', creamShade: '#c3ccd9', far: 0.6 };
const cubT = furTones(CUB);

definePart('mob.cub.body', [-11.6, -8.2, 12, 8], (g) => {
  blob(g, [[-9.4, -1.6], [-6.4, -5.4], [0, -6.2], [6, -5.6], [9.8, -2], [9.6, 2.8], [6, 5.6], [0, 6], [-6, 5.4], [-9.6, 2.2]], cubT.coat, {
    over(c, patch) {
      patch([[-12, -2.6], [-7, -2, 1], [-5, -3.4, 1], [-2, -2, 1], [0.6, -3.6, 1], [3.6, -2.4, 1], [6, -4, 1], [12, -3.4], [12, -9], [-12, -9]], cubT.back);
      patch([[-9, 5.4], [-3, 3.4], [3, 3.6], [12, 0.4], [12, 9], [-11, 9]], cubT.cream);
      patch([[5.2, -9], [8.8, -9], [12, -1], [12, 3.6], [8.6, 2.8], [6.6, -1.6]], SCARF);
      glow(c, -5.6, -1, 4.4, CUB.light, 0.4);
    },
  });
});

const CUB_LEG = [[-2.9, 0], [0, -2.9], [2.9, 0], [2.8, 4.6], [5, 6.8], [4.2, 8.8], [-2, 8.8], [-3, 6.8], [-2.6, 3.4]];
legPart('mob.cub.leg', [-4.2, -3.9, 6.4, 10], CUB_LEG, cubT, {
  fade: 1.2,
  over(c, patch, v) {
    if (!v) patch([[-5, 6.4], [-1.2, 5.8, 1], [0.4, 6.8, 1], [2, 5.9, 1], [7, 6.4], [7, 11], [-5, 11]], cubT.cream);
  },
});

// хвост — пушистый обрубок с тёмным кончиком
tailPart('mob.cub.tail', [-10.8, -4.8, 3.8, 5], [...tailJoint(2.8), [-3.4, 3.8], [-6.6, 3.2], [-9.4, 0.6, 1], [-6.4, -2.6], [-3.2, -3.6]], cubT.coat,
  (c, patch) => patch([[-6, -6, 1], [-7, -1.6], [-5.8, 0, 1], [-7, 1.6], [-6.2, 6, 1], [-12, 6], [-12, -6]], cubT.back));

const CUB_HC = [3, -3.4];
definePart('mob.cub.head', [-10.8, -20, 15.6, 9.8], (g, v) => {
  const F = PAL_FACES[v];
  g.translate(CUB_HC[0], CUB_HC[1]);
  farEar(g, 1, -6.4, 6, -5.8, 6.6, F.ear * 0.7 + 0.14, { ...cubT.far, lw: 1.2 });
  if (F.mouth === 2) jawOpen(g, 3.4, 3.2, 5.6, 2.8, 0.55, { ...cubT.cream, lw: 1.1 }, { fang: 0.8, fangH: 1.6 });
  const E = earAxes(-6.4, -4.6, -1, -7.2, 7.2, F.ear);
  blob(g, [[-8, 0.6], [-7.6, -2.6], [-6.4, -4.6], ...earSharp(E), [-1, -7.2], [3, -7], [6.2, -4.8], [7.6, -2], [9.6, -0.6], [10.6, 1.2], [9.6, 3.2], [6.6, 4.4], [2, 5.4],
    [-2.6, 5.6], [-6, 4.4]], cubT.coat, {
    over(c, patch) {
      patch([[-9, 2], [-4, 1.6], [0, 2.6], [3, 1.4], [5.6, -0.6], [8, -0.4], [12, 0], [12, 8], [-9, 8]], cubT.cream);
      patch(earInside(E), tone('#e9b3ae', { dark: '#b8807c' }));
      blush(c, -1.6, 2.8, 2.6, '#ff8f8a', 0.4);
      palMouth(c, F.mouth, 5.6, 10, 3.2, cubT.coat.line);
    },
  });
  if (F.mouth === 2) fang(g, 8.6, 3.6, 0.8, 1.9);
  if (F.mouth === 3) blob(g, [[6.4, 4], [8.2, 3.8], [8.6, 5.8], [7.4, 6.8], [6.2, 5.8]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  palEye(g, 6.4, -1.9, 1.7, F);
  palEye(g, 1.6, -1.3, 2.5, F);
  nose(g, 10.2, 0.8, 1.5, '#2a2230');
}, PAL_FACES.length);

const CUB_M = {
  kBody: 'mob.cub.body', kHead: 'mob.cub.head', kLeg: 'mob.cub.leg', kTail: 'mob.cub.tail',
  body: [-1, -11.6], neck: [8, -2.4], tail: [-8.6, -1.6],
  legNF: [6, 2], legFF: [8, 1.9], legNH: [-6.4, 2], legFH: [-4.6, 1.9], arm: [6.6, -1],
  leg: 9.5, sit: 2.2, size: 0.56,
  style: { breath: 3, head: -0.04, tail: 0.5, tailF: 6, tailA: 0.3, pace: 17, swing: 0.75, lift: 0.3, bob: 1.6, lean: 0.03, tailRun: 0.25 },
};

function cubPose(p, act, t, k, a) {
  const M = CUB_M;
  switch (act) {
    case 'windup': {
      // припал перед прыжком — коротко, как волк, только смешнее
      beastIdle(p, t, M);
      const c = 0.7 + 0.3 * smooth(k);
      p[BX] = -2 * c;
      p[BY] = 2.6 * c;
      p[BR] = 0.24 * c;
      p[HY] = 1.6 * c;
      p[TR] = 0.9 + Math.sin(t * 30) * 0.2;
      p[L1] = -0.7 * c;
      p[L1 + 1] = -0.78 * c;
      p[L1 + 2] = 0.24 * c;
      p[L1 + 3] = 0.16 * c;
      return SNARL;
    }
    case 'leap':
      beastLeap(p, k, t, M, 1);
      return BITE;
    case 'attack': {
      // кусает: голова вперёд, пасть раскрыта
      beastIdle(p, t, M);
      const snap = lunge(k);
      p[BX] += 2 * snap;
      p[HX] += 3 * snap;
      p[HY] += 0.6 * snap;
      p[TR] += 0.4 * snap;
      p[L1 + 2] += 0.3 * snap;
      p[L1 + 3] += 0.3 * snap;
      return k < 0.4 ? BITE : SNARL;
    }
    default:
      return calmFace(beastCommon(p, act, t, k, a, M), t + 0.7);
  }
}
beastRig('cub', CUB_M, cubPose);
RIG_INFO.cub = { acts: [...COMMON, 'leap'], w: 46, h: 32, shadow: 16 };

// ---------- барсучонок ----------
// Спутник лисы, который принимает удары на себя: приземистый, серый, на чёрных лапах с когтями; голова белая с двумя
// чёрными полосами через глаза. Нарисован крупно (BADG_M.size) — та же голова в полный размер у барсука-торговца.

const BADG = { coat: '#8d8f9c', light: '#c9cbd6', dark: '#55566a', back: '#6a6c7c', cream: '#f7f5ee', creamShade: '#cfcabb', far: 0.6 };
const badgT = furTones(BADG);
const BADG_BLACK = tone('#2f2b36', { light: '#5a5566', dark: '#17141c', line: '#17141c' });
const BADG_FAR = tone('#231f29', { light: '#3f3a4a', dark: '#100e14', line: '#17141c', rim: 0.2 });

definePart('mob.badger.body', [-13, -7.6, 13.2, 7.8], (g) => {
  blob(g, [[-11, -0.6], [-8, -4.8], [-1, -5.8], [6, -5.2], [10.6, -2.2], [11, 2.6], [7.6, 5.4], [0, 5.8], [-7, 5.4], [-10.8, 3]], badgT.coat, {
    over(c, patch) {
      patch([[-14, -2.6], [-6, -3.6], [2, -3.8], [14, -3], [14, -9], [-14, -9]], badgT.back);
      patch([[-12, 5], [-4, 3], [4, 3.2], [14, 1], [14, 9], [-12, 9]], BADG_BLACK);               // брюхо у барсука тёмное
      patch([[6.4, -9], [10, -9], [14, -1], [14, 3.4], [9.6, 2.6], [7.6, -1.6]], SCARF);
      glow(c, -6.6, -1.6, 4.6, BADG.light, 0.4);
    },
  });
});

const BADG_LEG = [[-3, 0], [0, -3], [3, 0], [3, 3.6], [5.6, 5.4], [4.8, 7.4], [-2.2, 7.4], [-3.2, 5.6], [-2.8, 2.6]];
legPart('mob.badger.leg', [-4.4, -4, 8, 9.2], BADG_LEG, { coat: BADG_BLACK, far: BADG_FAR }, {
  fade: 1,
  after(g) {
    for (const x of [2.6, 4, 5.4]) stroke(g, [[x, 6.6], [x + 0.9, 8]], '#f1ead8', 0.7);           // когти
  },
});

tailPart('mob.badger.tail', [-8.8, -4.2, 3.6, 4.4], [...tailJoint(2.6), [-3, 3.2], [-6, 2.4], [-7.4, 0, 1], [-6, -2.2], [-3, -3]], badgT.coat);

const BADG_HC = [3, -1.6];
definePart('mob.badger.head', [-7.4, -12.4, 19, 10.4], (g, v) => {
  const F = PAL_FACES[v];
  g.translate(BADG_HC[0], BADG_HC[1]);
  farEar(g, 0.6, -5.6, 4.2, -5, 3, F.ear * 0.5 + 0.1, { ...BADG_BLACK, lw: 1.1 }, earRound);
  if (F.mouth === 2) jawOpen(g, 4.6, 3.6, 7.6, 2.6, 0.5, { ...badgT.cream, lw: 1.1 }, { fang: 0.8, fangH: 1.6 });
  const E = earAxes(-5.2, -4.4, -1.4, -5.8, 3.4, F.ear * 0.5);
  blob(g, [[-7, 0.8], [-6.6, -2.4], [-5.2, -4.4], ...earRound(E), [-1.4, -5.8], [2.6, -5.6], [5.6, -3.8], [7.4, -1.8], [10, -0.8], [12.6, 0.2], [13.6, 1.8], [12.6, 3.6],
    [9, 4.4], [4.6, 5], [0, 5.6], [-4, 5.4], [-6.6, 3.6]], badgT.cream, {
    over(c, patch) {
      // чёрные полосы от носа через глаза к ушам
      patch([[-9, -5.2], [-4.4, -4.6], [0, -3.6], [4, -1.9], [8, -0.7], [11.8, 0.3], [11.2, 1.9], [7, 1.5], [3, 0.9], [-1, 0.7], [-5, 0.5], [-9, 0.9]], BADG_BLACK);
      patch([[0.6, -7.4], [4.8, -5.8], [7.6, -3.4], [10.2, -1.7], [9.6, -1], [6.6, -2.1], [3.6, -4], [0.4, -5.2]], BADG_BLACK);
      patch(earInside(E), BADG_BLACK);
      palMouth(c, F.mouth, 8, 12.6, 3.3, '#55566a');
    },
  });
  if (F.mouth === 2) fang(g, 11.2, 4, 0.8, 1.8);
  if (F.mouth === 3) blob(g, [[9, 4.2], [10.8, 4], [11.2, 6], [10, 7], [8.8, 6]], tone(TONGUE, { dark: '#d9606e', lw: 0.7 }));
  palEye(g, 6.6, -2.3, 1.4, F, BADG.cream);
  palEye(g, 1.6, -1.2, 1.9, F, BADG.cream);
  nose(g, 13.3, 1.5, 1.6, '#17141c');
}, PAL_FACES.length);

const BADG_M = {
  kBody: 'mob.badger.body', kHead: 'mob.badger.head', kLeg: 'mob.badger.leg', kTail: 'mob.badger.tail',
  body: [-1, -10.2], neck: [10, -1.4], tail: [-10.4, -1],
  legNF: [7.4, 2.2], legFF: [9.4, 2.1], legNH: [-7.6, 2.2], legFH: [-5.6, 2.1], arm: [8, -1],
  leg: 8, sit: 1.8, size: 0.56,
  style: { breath: 2.2, head: 0.04, tail: -0.3, tailF: 2, tailA: 0.1, pace: 13, swing: 0.6, lift: 0.26, bob: 1, lean: 0.02, tailRun: 0 },
};

function badgerPose(p, act, t, k, a) {
  const M = BADG_M;
  switch (act) {
    case 'windup': {
      // привстал, лапа с когтями занесена
      beastIdle(p, t, M);
      const c = 0.7 + 0.3 * smooth(k);
      p[BR] = -0.22 * c;
      p[BX] = -1 * c;
      p[BY] = -1 * c;
      p[HR] = -0.14 * c;
      p[L1] = -2.4 * c;
      p[K1] = 1.3;
      p[G1] = 0;
      p[ARM] = 1;
      p[L1 + 1] = -0.5 * c;
      p[G1 + 1] = 0;
      return SNARL;
    }
    case 'attack': {
      // удар когтями сверху вниз
      beastIdle(p, t, M);
      const hit = easeOut(k / 0.3);
      const hold = 1 - smooth((k - 0.45) / 0.55);
      p[BR] = lerp(-0.22, 0.12, hit) * hold;
      p[BX] = lerp(-1, 2.6, hit) * hold;
      p[BY] = lerp(-1, 0.4, hit) * hold;
      p[HX] = 1 * hit * hold;
      p[L1] = lerp(-2.4, -0.4, hit) * hold;
      p[K1] = 1.25;
      p[G1] = 1 - hold;
      p[ARM] = hold;
      return k < 0.5 ? BITE : SNARL;
    }
    default:
      return calmFace(beastCommon(p, act, t, k, a, M), t + 1.9);
  }
}
beastRig('badger', BADG_M, badgerPose);
RIG_INFO.badger = { acts: COMMON, w: 46, h: 30, shadow: 18 };

// ---------- барсук-торговец ----------
// Хозяин лавки: стоит столбиком, за спиной рюкзак со скаткой и котелком, красный жилет, полосатая вязаная шапка.
// Голова — барсучья (mob.badger.head). Подошла лиса — кивает и машет лапой; после сделки подпрыгивает.

const TRADE = { vest: '#b8503a', pack: '#b07a3e', roll: '#5f9a5a', cap: '#d8453a', wool: '#fff1dc' };
const tradeVest = tone(TRADE.vest, { light: '#e58a6a', dark: '#7a2e20' });
const tradeWool = tone(TRADE.wool, { dark: '#d9c3a0' });
const STEEL = tone('#8b95a3', { light: '#dfe5ec', dark: '#566070', lw: 1.1 });

definePart('mob.trader.pack', [-11, -13.4, 9.6, 11.6], (g) => {
  capsule(g, -6, -9.6, 2.6, 6, -9.6, 2.6, tone(TRADE.roll, { lw: 1.2 }));                       // скатка
  stroke(g, [[-3, -12], [-3, -7.4]], alpha('#2f4a2c', 0.8), 0.8);
  stroke(g, [[3, -12], [3, -7.4]], alpha('#2f4a2c', 0.8), 0.8);
  blob(g, [[-7.4, -6], [-4, -7.6], [4, -7.6], [7.4, -6], [8, 4], [6.4, 9.2], [0, 10.2], [-6.4, 9.2], [-8, 4]], tone(TRADE.pack, { light: '#dba868', dark: '#7a4f24', lw: 1.4 }), {
    over(c, patch) {
      patch([[-9, -9], [9, -9], [9, -1.6], [0, -0.4], [-9, -1.6]], tone('#c98f4e', { dark: '#8a5a2a' }));      // клапан
      c.fillStyle = '#ffc93c';
      c.fillRect(-1, -1.6, 2, 2.2);
      patch([[-5.6, 3], [-1.4, 3], [-1.4, 8], [-5.6, 8]], tone('#9a6a34', { dark: '#6a4420' }));               // карман
    },
  });
  ball(g, -7.6, 6.6, 2.2, 2.4, { ...STEEL, lw: 1 });                                            // котелок
});

definePart('mob.trader.body', [-11.6, -12.6, 11.4, 14.4], (g) => {
  for (const x of [-4.4, 4.8]) ball(g, x, 11.7, 4.2, 1.9, { ...BADG_BLACK, lw: 1.2 });            // ступни
  blob(g, [[-6.6, -9.6], [-1, -11.4], [5, -10], [8.6, -4.6], [10, 2.6], [8.6, 8.4], [4, 11], [-3.6, 11], [-8.6, 8.4], [-10, 2.4], [-9, -4.6]], badgT.coat, {
    over(c, patch) {
      patch([[0, -13], [9, -13], [10, 0], [9, 12], [-2, 12], [-1, 0]], badgT.cream);
      patch([[-12, -13], [1.6, -13], [2.6, -5], [1.6, 3], [-1.4, 8.4], [-12, 8]], tradeVest);     // жилет нараспашку
      patch([[12, -13], [8.4, -13], [8.2, -4], [9, 4], [12, 7]], tradeVest);
      c.fillStyle = '#ffc93c';
      for (const y of [-3, 1.4]) {
        c.beginPath();
        c.arc(0.8, y, 0.9, 0, TAU);
        c.fill();
      }
      glow(c, 5, -9.6, 5.6, darken(BADG.dark, 0.3), 0.5);        // тень от головы
    },
  });
});

// лапа с когтями: висит из плеча. 0 — ближняя, 1 — дальняя
definePart('mob.trader.arm', [-3.8, -3.6, 4.2, 11], (g, v) => {
  limb(g, 0, 0, 2.6, 0.2, 7, 2.3, { ...(v ? BADG_FAR : BADG_BLACK), lw: 1.2 });
  for (const x of [-1, 0.4, 1.8]) stroke(g, [[x, 8.6], [x + 0.2, 9.8]], '#f1ead8', 0.7);
}, 2);

// полосатая шапка с помпоном; сустав — середина низа
definePart('mob.trader.cap', [-7.6, -9.8, 8, 2.2], (g) => {
  blob(g, [[-6, 0.6], [-5.6, -3.4], [-2.6, -6.2], [2.4, -6.4], [5.6, -3.6], [6.4, 0.4], [0.2, 1.2]], tone(TRADE.cap, { light: '#ff8a7a', dark: '#96261f', lw: 1.2 }), {
    over(c, patch) {
      patch([[-8, -4.4], [8, -4.8], [8, -2.8], [-8, -2.4]], tradeWool);
      patch([[-8, -0.6], [8, -1], [8, 2], [-8, 2]], tradeWool);
    },
  });
  ball(g, 0.4, -7, 1.9, 1.9, { ...tradeWool, line: outline(TRADE.cap), lw: 1 });
});

const TRADE_SIZE = 0.92;         // вся фигура в кадре — чуть меньше рисунка

function drawTrader(kit, ctx, a) {
  open(kit, ctx);
  whole(0, 0, 0, TRADE_SIZE, TRADE_SIZE);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  const breath = Math.sin(t * 2.2);
  let hop = 0;
  let lean = 0;
  let hr = Math.sin(t * 0.8) * 0.04;
  let arm = 0.16 + breath * 0.02;      // лапы: 0 — висит, минус — вперёд и вверх
  let arm2 = -0.3;
  let face = blinks(t) ? BLINK : CALM;
  if (a.act === 'talk') {
    // кивает и машет лапой
    const q = bump(k);
    arm = lerp(arm, -2.3 + Math.sin(k * TAU * 3) * 0.3, q);
    hr += Math.sin(k * TAU * 2) * 0.1 * q;
    lean = 0.05 * q;
    if (q > 0.4) face = HAPPY;
  } else if (a.act === 'happy') {
    // подпрыгивает, обе лапы вверх
    const q = bump(k);
    hop = Math.abs(Math.sin(k * Math.PI * 2)) * 3.4 * (1 - k * 0.5);
    arm = lerp(arm, -2.7, q);
    arm2 = lerp(arm2, -2.4, q);
    hr -= 0.12 * q;
    face = HAPPY;
  }
  if (hop) whole(0, -hop);
  frame(-1, -14.1 - breath * 0.12, lean, 1, 1 + breath * 0.015);
  on('mob.trader.pack', -9.6, -1.6, -0.06 - hop * 0.02);
  on('mob.trader.arm', 7.4, -5.6, arm2, 1, 1, 1);
  set('mob.trader.body', ox, oy, lean, 1, osy);
  // голова и шапка на ней: шапка сидит на макушке и наклоняется вместе с головой
  const nx = fx(3.4, -8.2);
  const ny = fy(3.4, -8.2) - breath * 0.2;
  const r = lean + hr;
  const c = Math.cos(r);
  const s = Math.sin(r);
  set('mob.badger.head', nx, ny, r, 1, 1, face);
  set('mob.trader.cap', nx + 2.2 * c + 6.6 * s, ny + 2.2 * s - 6.6 * c, r - 0.12);
  on('mob.trader.arm', 4.4, -5.4, arm, 1, 1, 0);
}
defineRig('trader', { draw: drawTrader });
RIG_INFO.trader = { acts: NPC, w: 56, h: 52, shadow: 30 };

// ---------- ворон ----------
// Хозяин обменной комнаты: сидит на жёрдочке, на которой развешано блестящее; на груди — ожерелье с красным камнем.
// Чёрный с лиловым отливом, клюв большой и серый, глаз в светлом ободке (у врага-ворона глаза жёлтые и злые).

const RAVEN = { coat: '#2e3148', light: '#6a70a8', dark: '#14152a', beak: '#4a4a5c', sheen: '#7f6cd8', ring: '#e9e4f2' };
const ravenT = tone(RAVEN.coat, { light: RAVEN.light, dark: RAVEN.dark, lw: 1.3 });
const ravenFar = tone(mix(RAVEN.coat, RAVEN.dark, 0.6), { light: RAVEN.coat, dark: darken(RAVEN.dark, 0.3), line: ravenT.line, lw: 1.2, rim: 0.2 });
const ravenBeak = tone(RAVEN.beak, { light: '#8a8aa0', dark: '#2a2a38', lw: 1 });
const WOOD = tone('#7a5a3a', { light: '#a8825a', dark: '#4e3824', lw: 1.2 });

// жёрдочка: сустав — у земли
definePart('mob.raven.perch', [-11, -22.6, 11, 2.6], (g) => {
  capsule(g, 0, -19, 1.5, 0, -0.6, 1.8, WOOD);
  capsule(g, -8.6, -19.6, 1.4, 8.6, -19.6, 1.4, WOOD);
  ball(g, -3, 0.2, 2.4, 1.6, tone('#9aa3ad', { lw: 1 }));
  ball(g, 2.6, 0.4, 2, 1.4, tone('#8a939d', { lw: 1 }));
  // блестящее на верёвочках: кристалл и золотое кольцо
  stroke(g, [[-6.6, -18.4], [-6.6, -14.4]], '#c9a56b', 0.6);
  blob(g, [[-6.6, -14.6, 1], [-4.9, -12.4, 1], [-6.6, -9.8, 1], [-8.3, -12.4, 1]], tone('#7fe0ff', { light: '#e9fbff', dark: '#3aa8d8', line: '#1f6f9a', lw: 0.8 }));
  stroke(g, [[6.4, -18.4], [6.4, -15.4]], '#c9a56b', 0.6);
  g.strokeStyle = '#c8901c';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(6.4, -13.4, 1.8, 0, TAU);
  g.stroke();
  g.strokeStyle = '#fff0a8';
  g.lineWidth = 0.6;
  g.beginPath();
  g.arc(6.4, -13.4, 1.8, 3.4, 5);
  g.stroke();
});

// тело: грудь справа, хвост клином влево-вниз; сустав — середина
definePart('mob.raven.body', [-14.4, -8, 10.4, 9.4], (g) => {
  for (const x of [-0.6, 3]) capsule(g, x, 5, 0.9, x + 0.9, 7.6, 0.8, tone('#55556a', { lw: 0.8 }));       // лапки на жёрдочке
  blob(g, [[-6.4, -2.6], [-3, -5.6], [2, -6.6], [6.4, -5], [8.6, -1], [7.8, 3.4], [4, 6.2], [-1, 6], [-5, 3.6], [-9, 4.6], [-12.6, 7.4, 1], [-11, 3.6], [-9.4, 0.6]], ravenT, {
    over(c) {
      glow(c, 2, -2, 6, RAVEN.sheen, 0.35);
      stroke(c, [[-6, 3], [-11, 6]], alpha(RAVEN.dark, 0.8), 0.7);
      stroke(c, [[-7, 1.6], [-10.6, 3.8]], alpha(RAVEN.dark, 0.8), 0.7);
      stroke(c, [[4.4, -5.8], [5.4, -1.8], [8.8, -0.8]], '#ffc93c', 1.1);              // ожерелье
    },
  });
  blob(g, [[5.4, -1.6, 1], [6.8, 0.2, 1], [5.4, 2.2, 1], [4, 0.2, 1]], tone('#ff4d5e', { light: '#ff9aa4', dark: '#b8243a', line: '#7a1626', lw: 0.7 }));
});

// крыло: сустав — плечо, смотрит назад. 0 — ближнее, 1 — дальнее (видно, только когда машет)
definePart('mob.raven.wing', [-13.6, -4.6, 3.6, 6], (g, v) => {
  blob(g, [[1.6, -2.6], [2.4, 0.6], [0, 3.6], [-4, 4.6], [-7.4, 3.4, 1], [-7, 4.9, 1], [-10.4, 3.4, 1], [-12.4, 2.6, 1], [-8, -0.6], [-3, -3.2]], v ? ravenFar : ravenT, {
    over(c) {
      stroke(c, [[-1, 1.6], [-6, 2.6], [-10, 2.6]], alpha(RAVEN.dark, 0.8), 0.7);
      stroke(c, [[0, -0.6], [-5, 0], [-8.6, 0.6]], alpha(RAVEN.dark, 0.8), 0.7);
      glow(c, -2, -1.6, 3.6, RAVEN.sheen, 0.3);
    },
  });
}, 2);

// голова; сустав — шея. 0 — спокоен, 1 — каркает (клюв раскрыт), 2 — доволен, 3 — моргнул
const RAVEN_EYES = [{ eye: 'round' }, { eye: 'round' }, { eye: 'happy' }, { eye: 'closed' }];
definePart('mob.raven.head', [-5.8, -11.6, 14.2, 4.2], (g, v) => {
  if (v === 1) {
    // нижняя половинка клюва откинута, в зеве красно
    g.fillStyle = '#c8425a';
    g.beginPath();
    pathBlob(g, [[5, -4.6], [10, -4], [9, -1.6], [5, -2.4]]);
    g.fill();
    blob(g, [[4.6, -3.4], [8, -2.6], [10.4, -0.4, 1], [6.6, -0.6], [4.4, -1.6]], ravenBeak);
  } else blob(g, [[4.6, -4], [9, -3.9], [11.6, -3.3, 1], [8, -2.2], [4.6, -2.4]], ravenBeak);
  // взъерошенное горло
  blob(g, [[-3.6, -4.6], [-2.6, -8], [1, -9.8], [4.6, -8.6], [6.4, -5.6], [5.8, -2.6], [4, -0.6], [2.6, 1.4, 1], [1.8, -0.4], [0, 2, 1], [-0.6, -0.2], [-2.4, 0.6, 1], [-3, -2]],
    ravenT, { over: (c) => glow(c, 0, -6.6, 3.6, RAVEN.sheen, 0.3) });
  // верхняя половинка клюва: большая, с горбинкой
  blob(g, [[4.6, -7], [8.4, -7.4], [11.6, -5.6], [12.8, -3.6, 1], [8.4, -3.4], [4.6, -3.2]], ravenBeak);
  palEye(g, 2.8, -6, 1.7, RAVEN_EYES[v], RAVEN.ring);
}, RAVEN_EYES.length);

// искра на блестящем
definePart('mob.raven.spark', [-3.4, -3.4, 3.4, 3.4], (g) => {
  glow(g, 0, 0, 3.4, '#fff0a8', 0.6);
  sparkle(g, 0, 0, 3, '#ffffff', 0.2);
}, 1, 0.5);

const RAVEN_SIZE = 0.92;         // вся фигура в кадре — чуть меньше рисунка

function drawRaven(kit, ctx, a) {
  open(kit, ctx);
  whole(0, 0, 0, RAVEN_SIZE, RAVEN_SIZE);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  const breath = Math.sin(t * 2.6);
  let hop = 0;
  let lean = 0;
  let hr = 0.45 * flick(t, 4.3, 1.1, 0.6) - 0.35 * flick(t, 6.7, 3.9, 0.5);      // по-птичьи склоняет голову набок
  let wing = -0.5;           // крыло: −0.5 — сложено вдоль тела, плюс — поднято
  let flap = 0;              // машет: видно и дальнее крыло
  let face = blinks(t + 2) ? 3 : 0;
  let glint = flick(t, 2.3, 0, 0.5);          // блестящее сверкает: на жёрдочке и на груди — по очереди
  let glint2 = flick(t, 3.1, 1.4, 0.5);
  if (a.act === 'talk') {
    // каркает: голова вверх, клюв раскрывается дважды, плечи приподняты
    const q = bump(k);
    hr = -0.3 * q;
    lean = -0.08 * q;
    wing += 0.35 * q;
    if (q > 0.2 && Math.sin(k * TAU * 2) > 0) face = 1;
  } else if (a.act === 'happy') {
    // подпрыгивает и хлопает крыльями, всё блестящее сверкает
    const q = bump(k);
    hop = Math.abs(Math.sin(k * Math.PI * 3)) * 2.6 * q;
    flap = q;
    wing += (0.9 + 0.7 * Math.sin(t * 26)) * q;
    hr = -0.1 * q;
    face = 2;
    glint = 0.6 + 0.4 * Math.sin(t * 14);
    glint2 = 0.6 + 0.4 * Math.sin(t * 14 + 2);
  }
  set('mob.raven.perch', 0, 0);
  frame(0.6, -27.6 - hop + breath * 0.1, lean, 1, 1 + breath * 0.02);
  if (flap > 0.05) on('mob.raven.wing', -0.4, -3.6, wing + 0.2, 1, 1, 1, flap);
  set('mob.raven.body', ox, oy, lean, 1, osy);
  on('mob.raven.head', 5.4, -4.2, hr, 1, 1, face);
  on('mob.raven.wing', 1.6, -2.4, wing, 1, 1, 0);
  if (glint > 0.05) set('mob.raven.spark', -6.6, -12.4, t * 2, glint, glint, 0, glint);
  if (glint2 > 0.05) set('mob.raven.spark', fx(5.4, 0.2), fy(5.4, 0.2), -t * 2, glint2 * 0.8, glint2 * 0.8, 0, glint2);
}
defineRig('raven', { draw: drawRaven });
RIG_INFO.raven = { acts: NPC, w: 50, h: 56, shadow: 22 };

// ---------- бобёр-кузнец ----------
// Хозяин кузницы: стоит у пня с наковальней, в кожаном фартуке, молоток лежит бойком на наковальне. За работой
// (work) трижды бьёт: замах назад-вверх, удар, искры.

const BEAV = { coat: '#9a6a44', light: '#cf9a6a', dark: '#5e3c24', back: '#7a5032', cream: '#f0d9b0', creamShade: '#c8a878', far: 0.6 };
const beavT = furTones(BEAV, 1.4);
const beavDark = tone('#5a4032', { light: '#8a6a56', dark: '#33221a', lw: 1.2 });

// пень с наковальней; сустав — у земли
definePart('mob.beaver.stump', [-8.8, -14.2, 8.8, 2.6], (g) => {
  blob(g, [[-6.6, -8], [6.6, -8], [6.2, -1], [7.6, 0.8], [0, 1.6], [-7.6, 0.8], [-6.2, -1]], tone('#8a5a34', { light: '#b98a56', dark: '#5e3a20', lw: 1.3 }), {
    over(c) {
      stroke(c, [[-3.6, -5], [-3.2, 0.6]], alpha('#4e3018', 0.7), 0.7);
      stroke(c, [[1.6, -5.6], [2, -0.6]], alpha('#4e3018', 0.7), 0.7);
      stroke(c, [[4.6, -5], [4.4, -1.6]], alpha('#4e3018', 0.7), 0.7);
    },
  });
  ball(g, 0, -8, 6.6, 2.1, tone('#d9b07a', { dark: '#a87c4a', line: outline('#8a5a34'), lw: 1.2 }));        // спил
  solid(g, (c) => pathPoly(c, [[-5.8, -13], [5.8, -13], [4.4, -11], [2.6, -10.6], [3.4, -8.4], [-3.4, -8.4], [-2.6, -10.6], [-4.4, -11]]), STEEL);
});

// хвост-лопата: сустав — у крупа, смотрит назад
definePart('mob.beaver.tail', [-14.6, -4.8, 2.6, 5.2], (g) => {
  blob(g, [[0.6, -1.6], [-3, -3.2], [-8.6, -3.4], [-12.6, -1.4], [-13, 1.6], [-9.6, 3.8], [-4, 3.6], [0.6, 1.8]], beavDark, {
    over(c) {
      for (const x of [-11, -8.4, -5.8, -3.2]) {
        stroke(c, [[x, -3.6], [x + 2.6, 4]], alpha('#2a1a14', 0.55), 0.6);
        stroke(c, [[x + 2.6, -3.6], [x, 4]], alpha('#2a1a14', 0.55), 0.6);
      }
    },
  });
});

definePart('mob.beaver.body', [-10.8, -11.8, 10.8, 14.4], (g) => {
  for (const x of [-4.2, 4.6]) ball(g, x, 11.7, 4.4, 1.9, beavDark);                    // перепончатые ступни
  blob(g, [[-6, -9.4], [0, -10.6], [5.4, -9], [8.4, -3.4], [9.4, 3.6], [7.6, 9], [3, 11], [-3.6, 11], [-8, 9], [-9.6, 3.4], [-8.4, -3.6]], beavT.coat, {
    over(c, patch) {
      patch([[-2.6, -13], [10, -13], [11, 10], [2, 9.6], [-1.6, 3]], tone('#a8553a', { light: '#d98a6a', dark: '#6f3220' }));      // фартук
      stroke(c, [[2.6, 2], [6.6, 1.6], [6.8, 5.6], [3, 6], [2.6, 2]], alpha('#5a2618', 0.8), 0.7);                             // карман
      glow(c, -5, -3, 4.6, BEAV.light, 0.4);
      glow(c, 4, -9.6, 5, darken(BEAV.dark, 0.3), 0.5);
    },
  });
});

const BEAV_HC = [1.6, -5.6];
definePart('mob.beaver.head', [-7, -16.4, 12.4, 3.4], (g, v) => {
  const F = PAL_FACES[v];
  g.translate(BEAV_HC[0], BEAV_HC[1]);
  farEar(g, 1.6, -6, 4.6, -5.4, 2.6, 0.1, { ...beavT.far, lw: 1.1 }, earRound);
  const E = earAxes(-4.6, -5, -1.4, -6.4, 2.8, 0);
  blob(g, [[-7, 0.6], [-6.6, -3], [-4.6, -5], ...earRound(E), [-1.4, -6.4], [2.6, -6.2], [5.6, -4.2], [7.6, -1.4], [8.4, 1.2], [7, 3.6], [3.6, 5.2], [-1, 5.6], [-5, 4.4]],
    beavT.coat, {
      over(c, patch) {
        patch([[1.6, 0.6], [5, -1], [9, -0.6], [9, 6], [1, 6], [0.4, 3]], beavT.cream);
        patch(earInside(E), tone('#5e3c24'));
        blush(c, -1.6, 2.4, 2.4, '#ff8f8a', 0.4);
        palMouth(c, F.mouth, 4.6, 7.8, 2.9, beavT.coat.line);
      },
    });
  // два рыжих резца
  for (const x of [5.3, 6.8]) {
    g.fillStyle = '#f5a03c';
    g.fillRect(x, 2.7, 1.3, 2.1);
    g.strokeStyle = '#8a4a1a';
    g.lineWidth = 0.4;
    g.strokeRect(x, 2.7, 1.3, 2.1);
  }
  palEye(g, 5.6, -2.2, 1.4, F);
  palEye(g, 1.6, -1.8, 2, F);
  nose(g, 8, 0.2, 1.7, '#3a2620');
}, PAL_FACES.length);

// лапа с молотком: сустав — плечо, висит вниз; боёк — в BEAV_HAMMER от плеча
definePart('mob.beaver.hammer', [-4.8, -3.4, 4.8, 14.4], (g) => {
  capsule(g, 0, 5, 0.8, 0, 12.4, 0.8, tone('#c9a56b', { dark: '#8a6a3a', lw: 0.9 }));
  solid(g, (c) => pathPoly(c, [[-3.6, 9.6], [3.6, 9.6], [3.6, 13.2], [-3.6, 13.2]]), STEEL);
  limb(g, 0, 0, 2.3, 0, 5.6, 2, { ...beavT.coat, lw: 1.2 });
  ball(g, 0, 6.4, 1.8, 1.8, { ...beavDark, lw: 1 });
});

// искры от удара
definePart('mob.beaver.spark', [-5, -5, 5, 5], (g) => {
  glow(g, 0, 0, 5, '#ffd76a', 0.7);
  g.fillStyle = '#fffbe0';
  g.beginPath();
  pathStar(g, 0, 0, 4.6, 6, 0.36);
  g.fill();
}, 1, 0.5);

const BEAV_STUMP = 15;           // где стоит пень с наковальней
const BEAV_SIZE = 0.88;          // вся фигура в кадре — чуть меньше рисунка
const BEAV_REST = -1.45;         // лапа с молотком: боёк лежит на наковальне (0 — висит вниз, минус — вперёд, плюс — назад и вверх)

function drawBeaver(kit, ctx, a) {
  open(kit, ctx);
  whole(0, 0, 0, BEAV_SIZE, BEAV_SIZE);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  const breath = Math.sin(t * 2.3);
  let hop = 0;
  let lean = 0;
  let hr = Math.sin(t * 0.7) * 0.04;
  let arm = BEAV_REST;
  let tail = -0.25;          // хвост: минус — лежит на земле, плюс — поднят
  let face = blinks(t + 1) ? BLINK : CALM;
  let spark = 0;
  if (a.act === 'talk') {
    // кивает и шлёпает хвостом
    const q = bump(k);
    hr += Math.sin(k * TAU * 2) * 0.1 * q;
    tail += Math.abs(Math.sin(k * TAU * 2)) * 0.5 * q;
    if (q > 0.4) face = HAPPY;
  } else if (a.act === 'happy') {
    const q = bump(k);
    hop = Math.abs(Math.sin(k * Math.PI * 2)) * 3 * (1 - k * 0.5);
    tail += Math.abs(Math.sin(k * Math.PI * 4)) * 0.6 * q;
    hr -= 0.1 * q;
    arm -= 0.3 * q;
    face = HAPPY;
  } else if (a.act === 'work') {
    // три удара: замах назад-вверх, удар по наковальне, отскок
    const u = (k * 3) % 1;
    if (u < 0.5) arm = lerp(BEAV_REST, 2, smooth(u / 0.5));
    else if (u < 0.66) arm = lerp(2, -1.5, ((u - 0.5) / 0.16) ** 2);
    else arm = -1.5 + Math.sin(((u - 0.66) / 0.34) * Math.PI) * 0.14;
    lean = u < 0.5 ? -0.06 * smooth(u / 0.5) : 0.06;
    spark = u >= 0.66 ? 1 - (u - 0.66) / 0.34 : 0;
    face = SNARL;
  }
  set('mob.beaver.stump', BEAV_STUMP, 0);
  if (hop) whole(0, -hop);
  frame(-1.6, -14.1 - breath * 0.12, lean, 1, 1 + breath * 0.015);
  on('mob.beaver.tail', -7.4, 6.6, tail);
  set('mob.beaver.body', ox, oy, lean, 1, osy);
  on('mob.beaver.head', 2.6, -8.2, hr, 1, 1, face);
  on('mob.beaver.hammer', 5.2, -3.4, arm);
  if (spark > 0.02) set('mob.beaver.spark', BEAV_STUMP, -13.6, t * 4, 1.4 - spark * 0.9, 1.4 - spark * 0.9, 0, spark);
}
defineRig('beaver', { draw: drawBeaver });
RIG_INFO.beaver = { acts: [...NPC, 'work'], w: 60, h: 50, shadow: 34 };

// ---------- ёжик ----------
// Спутник лисы: светло-карамельные иголки (у врага-ежа они тёмные), кремовая мордочка, голубой платок. Катается
// колючим клубком (roll) — на клубке видно мордочку и платок, по ним заметно, как он вертится.

const HEDG = { quill: '#a9774a', light: '#e0b47e', dark: '#6a4426', face: '#f8e2bd', faceDark: '#d4b084', paw: '#d99a80' };
const hedgQuill = tone(HEDG.quill, { light: HEDG.light, dark: HEDG.dark, lw: 1 });
const hedgFace = tone(HEDG.face, { dark: HEDG.faceDark, line: hedgQuill.line, lw: 0.9 });
const hedgPaw = tone(HEDG.paw, { line: hedgQuill.line, lw: 0.8 });

// спина в иголках; сустав — середина
definePart('mob.hedgie.body', [-9.6, -8.6, 7.4, 5.6], (g) => {
  blob(g, [[-7, 1.6], ...tuftsArc(-0.6, 1.2, 5.8, Math.PI * 1.04, Math.PI * 1.9, 6, 2, 0.3), [5.2, 0.2], [5.6, 3], [2, 4.2], [-3.6, 4.2], [-6.6, 3.4]], hedgQuill, {
    over(c, patch) {
      patch([[-8, 2.6], [0, 2.4], [7, 1.6], [7, 6], [-8, 6]], hedgFace);
      patch([[2.6, -4], [5.6, -3], [7, 2], [4.6, 2.6], [3.4, -0.6]], SCARF);
      fur(c, [[-4.6, -1, -1.9, 2], [-2, -2.4, -1.7, 2], [0.8, -2.4, -1.4, 2], [-3.2, 1, -1.8, 1.8], [-0.4, 0.4, -1.5, 1.8], [-5.6, 1.6, -2.1, 1.6]], alpha(HEDG.light, 0.9), 0.7);
    },
  });
});

// мордочка; сустав — шея
definePart('mob.hedgie.head', [-3.8, -5.4, 7.2, 4], (g, v) => {
  const F = PAL_FACES[v];
  ball(g, -0.8, -2.9, 1.3, 1.3, hedgPaw);                  // ухо
  blob(g, [[-2.6, -0.6], [-1.6, -3], [1.4, -3.4], [3.6, -1.6], [5.4, 0.2], [4.6, 1.6], [1.6, 2.6], [-1.6, 2.4]], hedgFace, {
    over(c) {
      blush(c, 0.2, 1, 1.6, '#ff8f8a', 0.45);
      if (F.mouth === 2 || F.mouth === 3) {
        c.fillStyle = MOUTH;
        c.beginPath();
        c.ellipse(3.2, 1.3, 1, 0.8, 0, 0, TAU);
        c.fill();
      } else stroke(c, [[4.4, 1.3], [3.2, 1.8], [2.2, 1.2]], alpha(hedgQuill.line, 0.85), 0.6);
    },
  });
  palEye(g, 1.5, -0.9, 1.15, F);
  nose(g, 5.4, 0.3, 0.8, '#2a1a16');
}, PAL_FACES.length);

// лапка: 0 — ближняя, 1 — дальняя
definePart('mob.hedgie.foot', [-1.8, -1.6, 2.8, 1.8], (g, v) => {
  capsule(g, 0, 0, 1, 1.5, 0.2, 0.85, v ? { ...hedgPaw, fill: darken(HEDG.paw, 0.25) } : hedgPaw);
}, 2);

// клубок; сустав — середина
definePart('mob.hedgie.ball', [-8.6, -8.6, 8.6, 8.6], (g) => {
  blob(g, [[5.6, 0, 1], ...tuftsArc(0, 0, 5.6, 0, TAU, 11, 2.1, 0.5)], hedgQuill, {
    over(c, patch) {
      patch((p) => pathEllipse(p, 2.4, 2.4, 2.7, 2.1), hedgFace);
      c.fillStyle = SCARF.fill;
      c.beginPath();
      c.arc(4.2, 0.2, 1.2, 0, TAU);
      c.fill();
      fur(c, [[-2.6, -2.4, 0.9, 2.2], [-3.4, 1.2, 2.2, 2.2], [0.4, -3.6, 0.2, 2.2], [-0.6, 0.2, 1.4, 2]], alpha(HEDG.light, 0.9), 0.7);
    },
  });
});

const HEDG_SIZE = 0.88;          // вся фигура в кадре — чуть меньше рисунка

function drawHedgie(kit, ctx, a) {
  open(kit, ctx);
  whole(0, 0, 0, HEDG_SIZE, HEDG_SIZE);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  if (act === 'roll') {
    // катится: клубок вертится и чуть подскакивает
    set('mob.hedgie.ball', 0, -6.4 - Math.abs(Math.sin(t * 16)) * 0.7, t * 16);
    return;
  }
  const breath = Math.sin(t * 3.4);
  let x = 0;                 // тело: сдвиг, наклон (плюс — носом вниз), приплюснутость
  let y = -breath * 0.1;
  let lean = 0;
  let sq = 1 + breath * 0.03;
  let hx = 0;                // мордочка: сдвиг и наклон (нос всё время шевелится)
  let hy = 0;
  let hr = Math.sin(t * 7) * 0.03;
  let f1 = 0;                // лапки: сдвиг по земле — пары ходят в противоход
  let f2 = 0;
  let face = blinks(t + 0.5) ? BLINK : CALM;
  switch (act) {
    case 'move': {
      const ph = t * 20;
      f1 = Math.sin(ph) * 1.3;
      f2 = -f1;
      y = -Math.abs(Math.sin(ph)) * 0.5;
      lean = 0.05 + Math.sin(ph) * 0.04;
      break;
    }
    case 'windup': {
      // подобрался и ощетинился
      const c = 0.7 + 0.3 * smooth(k);
      x = -1.2 * c;
      lean = -0.12 * c;
      sq = 1.06;
      hx = -0.5;
      face = SNARL;
      break;
    }
    case 'attack': {
      const hit = lunge(k);
      x = 2.6 * hit;
      lean = 0.14 * hit;
      hx = hit;
      face = k < 0.4 ? BITE : SNARL;
      break;
    }
    case 'recover': {
      const q = 1 - smooth(k);
      y += 0.5 * q;
      hy = 0.8 * q;
      hr += 0.15 * q;
      break;
    }
    case 'stun':
      lean = Math.sin(t * 5) * 0.08;
      y = 0.6;
      sq = 0.92;
      hy = 1;
      hr = 0.3 + Math.sin(t * 5 - 1) * 0.15;
      face = DIZZY;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -1.8 * q;
      lean = -0.2 * q;
      sq = 1 + 0.08 * q;
      face = k < 0.7 ? HURT : CALM;
      break;
    }
    default:
  }
  frame(-1 + x, -5.4 + y, lean, 1, sq);
  set('mob.hedgie.foot', -3.2 + x + f1, -0.9, 0, 1, 1, 1);
  set('mob.hedgie.foot', 3.2 + x + f2, -0.9, 0, 1, 1, 1);
  set('mob.hedgie.body', ox, oy, lean, 1, sq);
  set('mob.hedgie.foot', -4.6 + x + f2, -0.7, 0, 1, 1, 0);
  set('mob.hedgie.foot', 1.8 + x + f1, -0.7, 0, 1, 1, 0);
  on('mob.hedgie.head', 4.4 + hx, 0.6 + hy, hr, 1, 1, face);
}
defineRig('hedgie', { draw: drawHedgie });
RIG_INFO.hedgie = { acts: [...COMMON, 'roll'], w: 30, h: 24, shadow: 13 };

// ---------- совёнок ----------
// Спутник лисы, летает: круглый, глазастый, с «рожками»; крылышки машут за спиной. Бросает перо — переднее крыло
// с размаху идёт вперёд.

const OWLET = { coat: '#b9997a', light: '#e6cba8', dark: '#7a5c42', belly: '#f6e8cc', bellyDark: '#d8c09a', disc: '#fbf1dc', discDark: '#e0cba6' };
const owletT = tone(OWLET.coat, { light: OWLET.light, dark: OWLET.dark, lw: 1 });
const owletFar = tone(mix(OWLET.coat, OWLET.dark, 0.5), { light: OWLET.coat, line: owletT.line, lw: 0.9, rim: 0.2 });
const owletBeak = tone('#e89a2c', { line: '#8a4a1a', lw: 0.6 });

// тело с лицом; сустав — середина
definePart('mob.owlet.body', [-7.8, -9.8, 8, 7.8], (g, v) => {
  const F = PAL_FACES[v];
  blob(g, [[-6.2, 0.6], [-6, -2.6], [-5.2, -5], [-5.6, -8.2, 1], [-2.6, -6.2], [0.6, -6.6], [3.4, -6.2], [6.4, -8.2, 1], [6, -5], [6.6, -2], [6.4, 1.6], [4.6, 5.4],
    [0.4, 6.8], [-4, 5.6]], owletT, {
    over(c, patch) {
      patch((p) => pathEllipse(p, 0.8, 3.4, 4.6, 4.2), tone(OWLET.belly, { dark: OWLET.bellyDark }));
      patch((p) => pathEllipse(p, -1.9, -1.8, 3.3, 3.5), tone(OWLET.disc, { dark: OWLET.discDark }));
      patch((p) => pathEllipse(p, 3.5, -1.8, 3, 3.4), tone(OWLET.disc, { dark: OWLET.discDark }));
      fur(c, [[-0.8, 3.8, 0.2, 1.4], [2.4, 3.4, 0.2, 1.4], [0.8, 5.4, 0.2, 1.4]], alpha(OWLET.dark, 0.6), 0.6);
    },
  });
  palEye(g, -1.8, -1.7, 2.2, F);
  palEye(g, 3.5, -1.7, 2, F);
  blob(g, [[-0.1, -0.5], [2.1, -0.5], [1, 1.5, 1]], owletBeak);
}, PAL_FACES.length);

// крылышко: сустав — плечо. 0 — переднее (смотрит вперёд), 1 — заднее
definePart('mob.owlet.wing', [-9.4, -4, 9.4, 4.8], (g, v) => {
  const d = v ? -1 : 1;
  blob(g, [[-1, -2], [3, -2.8], [6.6, -1.6], [8, 0.4, 1], [6, 1.2], [6.4, 3, 1], [3.6, 2.4], [3, 3.8, 1], [0.6, 2.4], [-1.4, 1]].map((p) => [p[0] * d, p[1], p[2]]),
    v ? owletFar : owletT);
}, 2);

definePart('mob.owlet.foot', [-1.8, -1.2, 2, 2.8], (g) => {
  for (const x of [-0.7, 0.7]) capsule(g, x * 0.4, 0, 0.6, x, 1.6, 0.55, owletBeak);
});

function drawOwlet(kit, ctx, a) {
  open(kit, ctx);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  let beat = Math.sin(t * 19);     // взмах: 1 — крылья внизу
  let up = 0.25;                   // крылья: середина взмаха (плюс — выше) и размах
  let span = 0.7;
  let front = NaN;                 // переднее крыло — своё положение (бросок)
  let x = 0;
  let y = Math.sin(t * 3) * 0.6;
  let lean = 0;
  let face = blinks(t + 1.3) ? BLINK : CALM;
  switch (act) {
    case 'move':
      lean = 0.14;
      break;
    case 'windup': {
      // крылья вскинуты и дрожат
      const c = 0.7 + 0.3 * smooth(k);
      up = 0.9 * c;
      span = 0.08;
      beat = Math.sin(t * 34);
      lean = -0.14 * c;
      face = SNARL;
      break;
    }
    case 'attack': {
      const hit = easeOut(k / 0.35);
      const ret = smooth((k - 0.45) / 0.55);
      front = lerp(lerp(0.9, -0.9, hit), up - span * beat, ret);
      lean = lerp(-0.14, 0.2, hit) * (1 - ret);
      x = 1.2 * hit * (1 - ret);
      face = k < 0.5 ? SNARL : CALM;
      break;
    }
    case 'recover':
      y += 1 - smooth(k);
      break;
    case 'stun':
      // сел: крылышки повисли
      up = -0.8;
      span = 0;
      y = 1;
      lean = Math.sin(t * 5) * 0.1;
      face = DIZZY;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -1.6 * q;
      lean = -0.2 * q;
      up += 0.5 * q;
      face = k < 0.7 ? HURT : CALM;
      break;
    }
    default:
  }
  const raise = up - span * beat;
  frame(x, -8 + y - span * beat * 0.5, lean);
  on('mob.owlet.wing', -4.6, -0.4, raise, 0.8, 0.8, 1);
  on('mob.owlet.wing', 4.6, -0.4, -(Number.isNaN(front) ? raise : front), 0.8, 0.8, 0);
  on('mob.owlet.foot', -1.6, 6.2);
  on('mob.owlet.foot', 2, 6.2);
  set('mob.owlet.body', ox, oy, lean, 1, 1, face);
}
defineRig('owlet', { draw: drawOwlet });
RIG_INFO.owlet = { acts: COMMON, w: 30, h: 28, shadow: 12 };

// ---------- светлячок ----------
// Спутник лисы, летает: крошечный жук со светящимся брюшком в мягком ореоле. Перед разрядом свет сжимается, в
// разряде — вспышка-звезда.

const FIRE = { glow: '#eaff7a', body: '#4a3a2e', lamp: '#f6ff9a', lampDark: '#b8d84a' };

definePart('mob.firefly.glow', [-8, -8, 8, 8], (g) => {
  glow(g, 0, 0, 8, FIRE.glow, 0.8);
  glow(g, 0, 0, 4, '#ffffff', 0.5);
}, 1, 0);

definePart('mob.firefly.body', [-4.6, -3.6, 4.8, 3.6], (g) => {
  stroke(g, [[2.6, -1.2], [3.6, -2.6], [4.2, -2.4]], '#3a2a22', 0.45);       // усики
  stroke(g, [[2.2, -1.4], [2.6, -2.9], [3.2, -3]], '#3a2a22', 0.45);
  ball(g, -1.4, 0.5, 2.6, 2.1, tone(FIRE.lamp, { light: '#ffffff', dark: FIRE.lampDark, line: '#7a8a2a', lw: 0.7 }));
  ball(g, 1.6, -0.2, 1.9, 1.7, tone(FIRE.body, { light: '#7a6656', lw: 0.7 }));
  speck(g, 2.4, -0.6, 0.6, 1);
  g.fillStyle = PAL_EYE;
  g.beginPath();
  g.arc(2.55, -0.55, 0.3, 0, TAU);
  g.fill();
});

// крылышко — прозрачное; сустав — у спинки
definePart('mob.firefly.wing', [-4.2, -4.6, 1.4, 1.2], (g) => {
  g.fillStyle = 'rgba(223,240,255,0.6)';
  g.strokeStyle = 'rgba(120,150,190,0.7)';
  g.lineWidth = 0.4;
  g.beginPath();
  g.ellipse(-1.4, -1.8, 2.5, 1.2, 0.75, 0, TAU);
  g.fill();
  g.stroke();
}, 1, 0.5);

definePart('mob.firefly.zap', [-9, -9, 9, 9], (g) => {
  glow(g, 0, 0, 9, '#fffbd0', 0.8);
  g.fillStyle = '#ffffff';
  g.beginPath();
  pathStar(g, 0, 0, 8, 8, 0.32, 0.2);
  g.fill();
}, 1, 0);

function drawFirefly(kit, ctx, a) {
  open(kit, ctx);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  let x = Math.sin(t * 2.3) * 1.2;         // висит и выписывает восьмёрку
  let y = Math.sin(t * 4.6) * 0.8;
  let lean = 0;
  let lamp = 0.55 + 0.25 * Math.sin(t * 5);        // свет: яркость и размер ореола
  let size = 0.9 + 0.1 * Math.sin(t * 5);
  let zap = -1;              // вспышка разряда: ход 0…1
  let buzz = 1;              // крылья жужжат
  switch (act) {
    case 'move':
      lean = 0.2;
      break;
    case 'windup':
      lamp = 0.5 + 0.5 * k;
      size = 1 - 0.4 * k;
      x = Math.sin(t * 40) * 0.4 * k;
      y = 0;
      break;
    case 'attack':
      zap = k;
      lamp = 1 - 0.5 * k;
      size = 1.2 - 0.3 * k;
      break;
    case 'recover':
      lamp = 0.3 + 0.3 * k;
      break;
    case 'stun':
      // погас и повис
      lamp = 0.12;
      buzz = 0.2;
      y = 2 + Math.sin(t * 5) * 0.4;
      lean = 0.5;
      break;
    case 'hurt':
      lamp = k < 0.7 && Math.sin(t * 60) > 0 ? 0.15 : 0.7;
      x -= 1.4 * (1 - k);
      break;
    default:
  }
  const cx = x;
  const cy = -5 + y;
  const flap = Math.sin(t * 70) * 0.6 * buzz;
  set('mob.firefly.glow', cx - 1.2, cy + 0.4, 0, size, size, 0, lamp);
  set('mob.firefly.wing', cx, cy - 1, lean + 0.2 + flap, 1, 1, 0, 0.75);
  set('mob.firefly.wing', cx + 0.6, cy - 1, lean - 0.3 - flap, 1, 1, 0, 0.75);
  set('mob.firefly.body', cx, cy, lean);
  if (zap >= 0 && zap < 1) set('mob.firefly.zap', cx - 1.2, cy + 0.4, t * 3, 0.5 + easeOut(zap) * 0.9, 0.5 + easeOut(zap) * 0.9, 0, (1 - zap) * (1 - zap));
}
defineRig('firefly', { draw: drawFirefly });
RIG_INFO.firefly = { acts: COMMON, w: 30, h: 30, shadow: 8 };

// ---------- белка ----------
// Спутница лисы: рыжая, с кисточками на ушах и большим пушистым хвостом крючком. Сидит столбиком, бегает
// скачками (тело ложится вперёд, хвост стелется сзади), бросает орехи, а подобранное несёт в зубах (carry).

const SQ = { coat: '#cf6a32', light: '#f5a35e', dark: '#8f3f1c', belly: '#fdf0d8', bellyDark: '#e0c59a' };
const sqT = tone(SQ.coat, { light: SQ.light, dark: SQ.dark, lw: 1 });
const sqFar = tone(mix(SQ.coat, SQ.dark, 0.6), { light: SQ.coat, line: sqT.line, lw: 0.9, rim: 0.2 });
const sqBelly = tone(SQ.belly, { dark: SQ.bellyDark, line: sqT.line, lw: 0.9 });

// хвост: сустав — у крупа, растёт вверх и загибается вперёд
definePart('mob.squirrel.tail', [-9, -14, 3.6, 3.4], (g) => {
  blob(g, [[1.4, 0.6], [-1.6, 2], [-5, 0.6], [-7.4, -3.2], [-7.6, -7.6], [-5.6, -11.2], [-2, -12.6], [1, -11], [1.6, -8.4], [-0.6, -8.6], [-2.6, -7.2], [-2.8, -4.2],
    [-1, -1.6], [1.6, -1.4]], sqT, {
    over(c, patch) {
      patch([[-9, -9], [-5.6, -8.4, 1], [-4.6, -10, 1], [-3, -8.8, 1], [-1.6, -10.4, 1], [0, -9.2, 1], [3, -9.6], [3, -15], [-9, -15]], sqBelly);       // светлый кончик
      fur(c, [[-5.6, -3, -1.3, 2.2], [-5.4, -6, -1.1, 2.2], [-4, -1, -0.9, 2]], alpha(SQ.dark, 0.6), 0.6);
    },
  });
});

// тело столбиком: светлое брюшко спереди, платок у шеи; сустав — середина
definePart('mob.squirrel.body', [-5, -5.8, 5, 5.8], (g) => {
  blob(g, [[-3.4, -1], [-2.2, -4], [0.8, -4.6], [3.2, -2.6], [3.8, 0.8], [3, 3.6], [0.4, 4.6], [-2.6, 3.8], [-3.8, 1.6]], sqT, {
    over(c, patch) {
      patch([[0.4, -6], [5, -6], [5, 6], [0.6, 6], [-0.6, 2], [0.2, -2]], sqBelly);
      patch([[-1, -6], [5, -6], [5, -2.4], [1.6, -1.6], [-0.6, -2.6]], SCARF);
    },
  });
});

const SQ_MOUTH = [5.2, -0.4];    // где белка держит орех в зубах — в осях головы
definePart('mob.squirrel.head', [-4.8, -10.4, 7.2, 2.6], (g, v) => {
  const F = PAL_FACES[v];
  blob(g, [[-3.4, -2.4], [-3, -4.8], [-2.6, -8.6, 1], [-0.8, -6], [1.2, -6.2], [2, -8.8, 1], [3, -5.4], [4.6, -3.4], [5.6, -1.8], [4.8, -0.2], [2.4, 0.8], [-0.6, 1],
    [-2.8, -0.2]], sqT, {
    over(c, patch) {
      patch([[0.6, -1.6], [3, -2.4], [6, -2.4], [6, 2], [-1, 2], [-0.6, -0.4]], sqBelly);
      blush(c, 0.8, -0.6, 1.5, '#ff8f8a', 0.45);
      if (F.mouth === 2 || F.mouth === 3) {
        c.fillStyle = MOUTH;
        c.beginPath();
        c.ellipse(3.8, -0.3, 0.9, 0.7, 0, 0, TAU);
        c.fill();
      } else stroke(c, [[4.9, -0.5], [3.9, 0], [3, -0.4]], alpha(sqT.line, 0.85), 0.5);
    },
  });
  palEye(g, 1.9, -3.2, 1.45, F);
  nose(g, 5.4, -1.6, 0.7, '#3a2018');
}, PAL_FACES.length);

const SQ_ARM = 3.4;              // от плеча до лапки
definePart('mob.squirrel.arm', [-1.8, -1.6, 2, 4.8], (g, v) => limb(g, 0, 0, 1.1, 0.2, 3.2, 0.95, v ? sqFar : sqT), 2);
definePart('mob.squirrel.foot', [-1.8, -1.5, 3.8, 1.7], (g, v) => capsule(g, 0, 0, 1.1, 2.2, 0.2, 0.9, v ? sqFar : sqT), 2);

// орех: в лапках перед броском и в зубах, когда несёт
definePart('mob.squirrel.nut', [-2.6, -2.8, 2.6, 2.8], (g) => {
  ball(g, 0, 0.3, 1.8, 1.9, tone('#b9783a', { light: '#e6b06a', dark: '#7a4a1c', lw: 0.7 }));
  blob(g, [[-2, -0.6], [-1.4, -1.8], [0, -2.2], [1.4, -1.8], [2, -0.6], [0, -0.2]], tone('#6a4424', { lw: 0.7 }));
}, 1, 0.5);

const SQ_SIZE = 0.88;            // вся фигура в кадре — чуть меньше рисунка

function drawSquirrel(kit, ctx, a) {
  open(kit, ctx);
  whole(0, 0, 0, SQ_SIZE, SQ_SIZE);
  const t = num(a.t);
  const k = clamp01(num(a.k));
  let act = a.act;
  if (act === 'spawn') {
    appear(k);
    act = 'idle';
  }
  const breath = Math.sin(t * 3.6);
  let x = 0;                 // круп: сдвиг и высота над землёй
  let y = -breath * 0.1;
  let lean = 0;              // тело: 0 — столбиком, плюс — легло вперёд
  let hr = Math.sin(t * 8) * 0.03;
  let tail = Math.sin(t * 2.2) * 0.08;       // хвост: плюс — откинут назад
  let arm = -0.5;            // лапки: 0 — вдоль тела, минус — вперёд и вверх
  let nut = 0;               // орех: 1 — в лапках, 2 — в зубах
  let step = 0;              // ступни: насколько оторваны от земли
  let face = blinks(t + 2.1) ? BLINK : CALM;
  switch (act) {
    case 'move':
    case 'carry': {
      // скачет: в воздухе вытянута, хвост запаздывает
      const ph = t * 17;
      const air = Math.max(0, Math.sin(ph));
      lean = 0.95;
      x = 0.6;
      y = 1.2 - air * 2.6;
      step = air * 1.6;
      tail = 1.15 + Math.sin(ph - 1) * 0.18;
      arm = -0.9 + Math.sin(ph) * 0.5;
      if (act === 'carry') nut = 2;
      break;
    }
    case 'windup': {
      // замахнулась: орех над головой
      const c = 0.7 + 0.3 * smooth(k);
      arm = -2.6 * c;
      lean = -0.1 * c;
      tail = -0.1;
      nut = 1;
      face = SNARL;
      break;
    }
    case 'attack': {
      const hit = easeOut(k / 0.3);
      const ret = smooth((k - 0.45) / 0.55);
      arm = lerp(lerp(-2.6, -0.6, hit), arm, ret);
      lean = lerp(-0.1, 0.22, hit) * (1 - ret);
      x = hit * (1 - ret);
      tail = 0.3 * hit * (1 - ret);
      nut = k < 0.12 ? 1 : 0;
      face = k < 0.5 ? SNARL : CALM;
      break;
    }
    case 'recover': {
      const q = 1 - smooth(k);
      lean = 0.15 * q;
      hr += 0.15 * q;
      tail = 0.3 * q;
      break;
    }
    case 'stun':
      lean = 0.2 + Math.sin(t * 5) * 0.08;
      y = 0.4;
      hr = 0.3 + Math.sin(t * 5 - 1) * 0.2;
      tail = 0.9;
      arm = 0.2;
      face = DIZZY;
      break;
    case 'hurt': {
      const q = (1 - k) * (1 - k);
      x = -1.6 * q;
      lean = -0.25 * q;
      tail += 0.4 * q;
      arm -= 0.8 * q;
      face = k < 0.7 ? HURT : CALM;
      break;
    }
    default:
  }
  // тело наклоняется вокруг крупа: легла вперёд — круп остаётся у земли
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  frame(-1 + x + c + 3.6 * s, -1.8 + y + s - 3.6 * c, lean, 1, 1 + breath * 0.03);
  on('mob.squirrel.tail', -2.4, 3, -tail - lean * 0.8);
  set('mob.squirrel.foot', 1.4 + x, -0.8 - step, 0, 1, 1, 1);
  on('mob.squirrel.arm', 2.6, -1.6, arm, 1, 1, 1);
  set('mob.squirrel.body', ox, oy, lean, 1, osy);
  set('mob.squirrel.foot', 0.4 + x, -0.7 - step, 0, 1, 1, 0);
  const nx = fx(1, -3.8);
  const ny = fy(1, -3.8);
  const r = lean * 0.25 + hr;
  set('mob.squirrel.head', nx, ny, r, 1, 1, face);
  on('mob.squirrel.arm', 1.8, -1.4, arm, 1, 1, 0);
  if (nut === 1) {
    const u = arm + lean;
    set('mob.squirrel.nut', fx(1.8, -1.4) - Math.sin(u) * SQ_ARM, fy(1.8, -1.4) + Math.cos(u) * SQ_ARM, u);
  } else if (nut === 2) {
    set('mob.squirrel.nut', nx + SQ_MOUTH[0] * Math.cos(r) - SQ_MOUTH[1] * Math.sin(r), ny + SQ_MOUTH[0] * Math.sin(r) + SQ_MOUTH[1] * Math.cos(r) + 0.6, r);
  }
}
defineRig('squirrel', { draw: drawSquirrel });
RIG_INFO.squirrel = { acts: [...COMMON, 'carry'], w: 34, h: 32, shadow: 12 };
