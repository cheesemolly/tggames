// Лиса и её добыча — «живые» фигуры «Лисьей охоты». Каждая собрана из отдельно запечённых частей (тело, голова,
// уши, хвост из трёх кусков, лапы, глаза), а поза каждый кадр расставляет их заново: дыхание, бег, сжатая пружина
// перед рывком, вытянутый полёт, приземление. Без DOM: здесь только рисунки частей и расчёт поз.
//
// Оси фигуры: (0, 0) — середина ступней, x — вперёд по взгляду, y — вниз; отражение влево делает рендер.
// Поза приходит от логики: a.act и a.k (см. 02-engine, «Poses»), a.t — часы, a.speed — доля полной скорости,
// a.aim — куда целится (радианы), a.vx / a.vy — куда летит. Незнакомая поза — спокойная стойка.
// Фигура ничего не помнит между кадрами: «запаздывание» хвоста и ушей — сдвиг фазы той же волны.

import { defineRig } from './art.js';
import {
  TAU, clamp, clamp01, lerp, smooth, easeOut, backOut, bump, num, alpha, darken, mix, outline, tone,
  definePart, blob, capsule, limb, eggNodes, pathBlob, pathBlobSpan, stroke, fadeEdge, glow, sparkle, eye, nose, blush,
} from './art-kit.js';

/**
 * Что умеют фигуры этого файла: acts — позы (их показывает лист рисунков и проверяет тест), w × h — рамка, в которую
 * фигура помещается в любой позе (единицы мира), shadow — ширина тени под ней.
 */
export const RIG_INFO = {
  fox: { acts: ['idle', 'run', 'aim', 'dash', 'land', 'hurt', 'fire', 'bite', 'down', 'rise'], w: 64, h: 50, shadow: 30 },
};

// ---------- лиса: краски ----------

const FOX = {
  coat: '#f0862b', light: '#ffb057', dark: '#c4601a', cream: '#fff1dc', creamShade: '#e8cfae',
  sock: '#4a2a1c', ear: '#f6a98a', nose: '#2a1a16', eye: '#221613',
};
const coat = tone(FOX.coat, { light: FOX.light, dark: FOX.dark, lw: 1.5 });
// дальняя сторона (ухо и лапы за телом) — в тени: тоном темнее, обводка та же
const coatFar = tone(mix(FOX.coat, FOX.dark, 0.8), { light: FOX.coat, dark: darken(FOX.dark, 0.35), line: coat.line, rim: 0.25 });
const cream = tone(FOX.cream, { light: '#ffffff', dark: FOX.creamShade, line: coat.line });
const sock = tone(FOX.sock, { light: '#7a4a32', dark: '#2f1a14' });
const sockFar = tone('#3a2018', { light: '#56301f', dark: '#24120e', line: sock.line, rim: 0.2 });

// ---------- лиса: части ----------
// Числа — в осях сустава каждой части. Где какая часть крепится — в FOX_AT ниже.

// тело: фасолина, круп слева, грудь справа; светлое брюхо, свет на бедре, тень под головой
definePart('mob.fox.body', [-13.5, -8, 12.5, 8], (g) => {
  blob(g, [[-10.4, -3.2], [-5.6, -6.1], [1.6, -6.3], [7.2, -5], [10.2, -1.2], [9.4, 3.2], [5, 5.8], [-2.4, 6.1], [-8.2, 5.4], [-11.6, 1.6]], coat, {
    over(c, patch) {
      patch([[-8, 5], [-2, 4.2], [5, 3.7], [13, 0.6], [13, 9], [-11, 9]], cream);
      glow(c, -5.4, -1.6, 5.6, FOX.light, 0.5);                 // свет на бедре
      glow(c, 9.4, -2.4, 7.6, darken(FOX.dark, 0.25), 0.6);     // тень от головы на плечах
    },
  });
});

// грудка: кремовый пушистый «слюнявчик»; сустав — под подбородком
definePart('mob.fox.chest', [-5, -3, 6.2, 8.6], (g) => {
  const pts = [[-2.6, -1.5], [2.8, -1.8], [4.8, 1.6], [4.4, 4.6], [2.6, 7.2, 1], [1.4, 5.6], [-0.8, 7.4, 1], [-1.6, 5.2], [-3.6, 5.4, 1], [-3.8, 1.8]];
  blob(g, pts, { ...cream, lw: 1, line: mix(FOX.creamShade, coat.line, 0.5) });
  fadeEdge(g, 0, -2.2, 0, 0.8);
});

// голова в три четверти: сустав — шея, середина головы — в HEAD_C от него
const HEAD_C = [2, -5];
const HEAD = [
  [-7.6, -3], [-5.6, -6.4], [-1, -7.9], [3.8, -7.3], [7.2, -4.6], [8.4, -1.2], [10, 0.6], [12.8, 1.6], [14, 3.3], [12.6, 5.2],
  [9, 6.3], [4.5, 7], [0.5, 7.6], [-3.2, 8.6, 1], [-4, 6.6], [-7.6, 7.8, 1], [-7.4, 5.2], [-10.8, 4.8, 1], [-8.8, 1.6],
];
definePart('mob.fox.head', [-10, -14, 18, 6.6], (g, v) => {
  g.translate(HEAD_C[0], HEAD_C[1]);
  if (v === 1) {
    // пасть открыта: нижняя челюсть, за ней тёмный рот с языком
    blob(g, [[5, 4.2], [11, 4.6], [12, 7], [9.6, 9.4], [6, 9.2], [4.2, 6.8]], { ...cream, lw: 1.2 }, {
      over(c) {
        c.fillStyle = '#7a2230';
        c.beginPath();
        pathBlob(c, [[5, 3.6], [12.4, 3.8], [11.4, 6.8], [6.4, 7.4]]);
        c.fill();
        c.fillStyle = '#ff8a8a';
        c.beginPath();
        c.ellipse(9.2, 7.5, 2.4, 1.3, 0.1, 0, TAU);
        c.fill();
      },
    });
  }
  blob(g, HEAD, coat, {
    over(c, patch) {
      // кремовая маска: щека, бока морды и подбородок
      patch([[-12, 1], [-7.5, 0.6], [-3.5, 2], [-0.5, 3], [2.8, 2.4], [5.6, 0.8], [8.2, 1.2], [10.6, 2.5], [13, 3.4], [16, 4], [15, 10], [-12, 11]], cream);
      blush(c, -3.6, 4.6, 3, '#ff8f8a', 0.4);
      if (v === 0) stroke(c, [[12.6, 5], [10.6, 5.7], [8.8, 5.2], [8.2, 4.3]], alpha(FOX.nose, 0.8), 0.9);
      else {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(10.6, 5.4);
        c.lineTo(11.5, 7.4);
        c.lineTo(12.3, 5.4);
        c.fill();
      }
    },
  });
  nose(g, 13.5, 2.9, 1.5, FOX.nose);
}, 2);

// глаз: 0 открыт, 1 решительный прищур, 2 закрыт (моргнула), 3 зажмурен от удовольствия, 4 крестик, 5 «>» от боли, 6 испуг
const FOX_EYES = [{ kind: 'round', glint: '#a85a1e' }, { kind: 'narrow', lid: 0.3, slant: 0.22, brow: FOX.eye }, { kind: 'closed' }, { kind: 'happy' }, { kind: 'cross' }, { kind: 'squint' }, { kind: 'wide' }];
definePart('mob.fox.eye', [-3.4, -3.4, 3.4, 3.4], (g, v) => eye(g, 0, 0, 2.8, { ...FOX_EYES[v], color: FOX.eye }), FOX_EYES.length, 0.5);

// ухо: 0 — ближнее (видно розовое нутро), 1 — дальнее, в тени; сустав — середина основания
definePart('mob.fox.ear', [-5, -11, 5, 3.2], (g, v) => {
  const pts = [[-3.6, 1.4], [-3.4, -3.2], [-1.9, -7.7], [-0.8, -9.8, 1], [0.9, -7.2], [2.5, -3.6], [3.7, 1.4], [0, 2.6]];
  blob(g, pts, { ...(v ? coatFar : coat), lw: 1.3 }, {
    over(c, patch) {
      patch([[-1.5, 2], [-1.9, -3], [-0.7, -6.4], [1.1, -3.2], [1.9, 2]], tone(v ? darken(FOX.ear, 0.25) : FOX.ear, { dark: darken(FOX.ear, 0.4) }));
      patch([[-5, -5.9], [-2.2, -5.1, 1], [-1, -6.1, 1], [0.4, -4.9, 1], [1.6, -5.9, 1], [4, -5.3], [4, -13], [-5, -13]], v ? sockFar : sock);
    },
    stroke: (c) => pathBlobSpan(c, pts, 0, 6),
    shade: (c) => pathBlob(c, [[-3.6, 9, 1], ...pts.slice(1, 6), [3.7, 9, 1]]),
  });
  fadeEdge(g, 0, 2.4, 0, 0.4);
}, 2);

// хвост — три куска от тела к кончику, каждый смотрит влево (назад) и растёт из сустава в нуле;
// стыки — круги одного радиуса, поэтому при изгибе шва не видно
const TAIL_R = [3.4, 5.2, 6.2];                 // радиусы в суставах
const TAIL_L = [6.4, 7.4];                      // длины первых двух кусков
// свет кладётся по рамке всего хвоста (а не каждого куска): иначе на стыках видна ступенька
const tailBox = (from) => [from - 28, -7, from + 4, 7];
function tailPiece(g, r0, len, r1, from) {
  // круг сустава — нижний край — круг следующего сустава — верхний край
  const pts = [
    [0, -r0], [r0 * 0.71, -r0 * 0.71], [r0, 0], [r0 * 0.71, r0 * 0.71], [0, r0],
    [-len, r1], [-len - r1 * 0.71, r1 * 0.71], [-len - r1, 0], [-len - r1 * 0.71, -r1 * 0.71], [-len, -r1],
  ];
  blob(g, pts, coat, {
    box: tailBox(from),
    stroke: (c) => pathBlobSpan(c, pts, 4, 0),
    shade: (c) => pathBlob(c, [[20, -r0, 1], [20, r0, 1], ...pts.slice(4)]),
  });
}
definePart('mob.fox.tail1', [-13, -6.4, 4.6, 6.4], (g) => tailPiece(g, TAIL_R[0], TAIL_L[0], TAIL_R[1], 0));
definePart('mob.fox.tail2', [-15, -7.4, 6.2, 7.4], (g) => tailPiece(g, TAIL_R[1], TAIL_L[1], TAIL_R[2], TAIL_L[0]));
definePart('mob.fox.tail3', [-15.4, -7.4, 7.2, 7.6], (g) => {
  const r = TAIL_R[2];
  const pts = [[0, -r], [r * 0.71, -r * 0.71], [r, 0], [r * 0.71, r * 0.71], [0, r], [-4.4, 6], [-8, 5.6, 1], [-8.2, 3.4], [-14, -0.4, 1], [-9.2, -3.8], [-4.4, -5.9]];
  blob(g, pts, coat, {
    over(c, patch) {
      // кремовый кончик, граница — зубцами, как шерсть
      patch([[-2.4, -9, 1], [-4.2, -3.8], [-1.9, -1.7, 1], [-4.4, 0.6], [-2.1, 2.8, 1], [-4.2, 5], [-2.8, 9, 1], [-17, 9], [-17, -9]], cream);
    },
    box: tailBox(TAIL_L[0] + TAIL_L[1]),
    stroke: (c) => pathBlobSpan(c, pts, 4, 0),
    shade: (c) => pathBlob(c, [[20, -r, 1], [20, r, 1], ...pts.slice(4)]),
  });
});

// лапа с тёмным носком: 0 — ближняя (вверху растворяется в теле), 1 — дальняя, в тени; сустав — бедро
const LEG = 10.4;                               // от сустава до земли (с обводкой)
definePart('mob.fox.leg', [-3.8, -3.2, 6, 10.6], (g, v) => {
  const pts = [[-2.6, 0], [0, -2.6], [2.6, 0], [2.7, 5.4], [4.6, 7.8], [3.4, 9.8], [-1.5, 9.8], [-2.6, 7.6], [-2.4, 4]];
  blob(g, pts, { ...(v ? coatFar : coat), lw: 1.2 }, {
    over(c, patch) {
      patch([[-5, 6.4], [-1.3, 5.7, 1], [0.2, 6.7, 1], [1.7, 5.8, 1], [6, 6.5], [7, 12], [-5, 12]], v ? sockFar : sock);
      // пальцы
      stroke(c, [[2.3, 8.3], [2.1, 9.5]], alpha('#9a6a4c', v ? 0.5 : 0.9), 0.5);
      stroke(c, [[3.6, 8.2], [3.5, 9.3]], alpha('#9a6a4c', v ? 0.5 : 0.9), 0.5);
    },
    stroke: (c) => pathBlobSpan(c, pts, v ? 2 : 3, v ? 0 : 8),      // у ближней обводка начинается у края тела
    shade: (c) => pathBlob(c, [[-2.6, -12, 1], [2.6, -12, 1], ...pts.slice(2)]),
  });
  if (!v) fadeEdge(g, 0, 1.8, 0, 4.4);          // дальняя и так за телом
}, 2);

// ---------- лиса: поза ----------

// где что крепится: к телу (от его середины) и к голове (от её середины)
const FOX_AT = {
  body: [-2.4, -11],
  neck: [8.2, -1.6], chest: [7.4, -1.2], tail: [-10, -1.4],
  legNF: [6.2, -0.4], legFF: [8.6, -0.5], legNH: [-6.8, -0.4], legFH: [-4.6, -0.5],
  earN: [-3.8, -6], earF: [3.8, -6.6], eyeN: [1.6, -1.9], eyeF: [7.2, -2.4],
};

// поза — числа по местам: их можно смешивать (встаёт — между «лежит» и «стоит»)
const BX = 0;      // тело: сдвиг
const BY = 1;
const BR = 2;      //   наклон (плюс — носом вниз)
const BSX = 3;     //   растяжение вдоль и поперёк
const BSY = 4;
const HX = 5;      // голова: сдвиг от шеи
const HY = 6;
const HR = 7;      //   наклон
const E1 = 8;      // уши: ближнее и дальнее (минус — прижато назад)
const E2 = 9;
const ES = 10;     //   длина (прижатые — короче)
const T1 = 11;     // хвост: углы трёх кусков (плюс — кверху)
const T2 = 12;
const T3 = 13;
const TS = 14;     //   пышность
const L1 = 15;     // лапы: ближняя передняя, дальняя передняя, ближняя задняя, дальняя задняя (минус — вперёд)
const K1 = 19;     //   длина каждой (1 — как есть)
const GR = 23;     // насколько лапы стоят на земле: 1 — дотягиваются до неё сами
const CR = 24;     // грудка: наклон
const SIZE = 25;

const P = new Float32Array(SIZE);
const P2 = new Float32Array(SIZE);

function rest(p) {
  p.fill(0);
  p[BSX] = 1;
  p[BSY] = 1;
  p[ES] = 1;
  p[TS] = 1;
  p[K1] = 1;
  p[K1 + 1] = 1;
  p[K1 + 2] = 1;
  p[K1 + 3] = 1;
  p[GR] = 1;
}

function blend(out, a, b, u) {
  for (let i = 0; i < SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * u;
}

/** Короткий взмах раз в period секунд (ухо дёрнулось): 0 … 1 … 0 за len секунд. */
function flick(t, period, shift, len = 0.2) {
  const u = (((t + shift) % period) + period) % period;
  return u < len ? Math.sin((u / len) * Math.PI) : 0;
}

/** Моргает: раз в три с лишним секунды, изредка — дважды подряд. */
const blinks = (t) => flick(t, 3.4, 0.3, 0.12) > 0 || flick(t, 9.7, 5.1, 0.11) > 0;

// стоит и дышит: хвост покачивается, ухо иногда дёргается
function poseIdle(p, t) {
  rest(p);
  const breath = Math.sin(t * 2.5);
  p[BSY] = 1 + breath * 0.024;
  p[BSX] = 1 - breath * 0.01;
  p[BY] = -breath * 0.14;
  p[HY] = -breath * 0.3;
  p[HR] = Math.sin(t * 1.1 + 1) * 0.03;
  const w = t * 2.1;
  p[T1] = 0.4 + Math.sin(w) * 0.1;
  p[T2] = p[T1] + 0.26 + Math.sin(w - 0.8) * 0.14;
  p[T3] = p[T2] + 0.26 + Math.sin(w - 1.6) * 0.2;
  p[E1] = -0.42 * flick(t, 3.7, 0);
  p[E2] = 0.3 * flick(t, 5.3, 1.9);
  p[CR] = breath * 0.02;
}

// бежит: лапы по диагонали, тело подпрыгивает, хвост стелется сзади волной
function poseRun(p, t, speed) {
  rest(p);
  const ph = t * 15.5;
  const swing = 0.3 + 0.55 * speed;
  for (let i = 0; i < 4; i++) {
    const a = ph + (i === 0 || i === 3 ? 0 : Math.PI);
    p[L1 + i] = -Math.sin(a) * swing;
    p[K1 + i] = 1 - 0.3 * Math.max(0, Math.cos(a)) * (0.4 + 0.6 * speed);      // лапа, что идёт вперёд, поджата
  }
  const hop = Math.abs(Math.sin(ph));
  p[BY] = -0.2 - hop * 1.3 * speed;
  p[BR] = 0.05 * speed + Math.sin(ph * 2 + 0.6) * 0.035;
  p[BSX] = 1 + 0.03 * speed;
  p[HY] = Math.sin(ph * 2 - 0.9) * 0.55;
  p[HX] = 0.5 * speed;
  p[HR] = -0.03 + Math.sin(ph * 2 - 1.4) * 0.04;
  p[T1] = 0.16 + Math.sin(ph - 0.6) * 0.13;
  p[T2] = p[T1] + 0.04 + Math.sin(ph - 1.4) * 0.16;
  p[T3] = p[T2] + 0.02 + Math.sin(ph - 2.2) * 0.2;
  p[E1] = -0.32 - Math.sin(ph * 2) * 0.09;
  p[E2] = -0.24 - Math.sin(ph * 2 - 0.5) * 0.08;
  p[CR] = Math.sin(ph * 2 - 1.8) * 0.07;
}

// идёт или стоит — по скорости (без рывка между стойкой и бегом)
function poseMove(p, t, speed) {
  if (speed <= 0.02) {
    poseIdle(p, t);
    return;
  }
  poseIdle(P2, t);
  poseRun(p, t, speed);
  if (speed < 0.3) blend(p, P2, p, smooth(speed / 0.3));
}

// целится рывком: сжалась, как пружина, — грудь к земле, круп и хвост вверх, уши прижаты; tilt — куда целится по высоте
function poseAim(p, t, tilt) {
  rest(p);
  const wig = Math.sin(t * 13);
  p[BX] = -2.6;
  p[BY] = 2.5 + tilt * 0.5;
  p[BR] = 0.2 - tilt * 0.24;
  p[BSX] = 1.07;
  p[BSY] = 0.9;
  p[HX] = -0.6;
  p[HY] = 1.7;
  p[HR] = tilt * 0.4 - 0.04;
  p[E1] = -0.72;
  p[E2] = -0.6;
  p[ES] = 0.86;
  p[T1] = 1.22 + wig * 0.04;
  p[T2] = p[T1] + 0.2 + Math.sin(t * 13 - 0.9) * 0.07;
  p[T3] = p[T2] + 0.1 + Math.sin(t * 13 - 1.8) * 0.1;
  p[L1] = -0.42;
  p[L1 + 1] = -0.5;
  p[L1 + 2] = 0.3;
  p[L1 + 3] = 0.22;
  p[CR] = 0.1;
}

// летит в рывке: вытянута в струну, уши прижаты, передние лапы вперёд, задние назад, хвост прямой
function poseDash(p, k, t, tilt) {
  rest(p);
  const s = (0.55 + 0.45 * smooth(k / 0.14)) * (1 - 0.4 * smooth((k - 0.72) / 0.28));
  p[BSX] = 1 + 0.36 * s;
  p[BSY] = 1 - 0.22 * s;
  p[BR] = tilt * 0.8 - 0.12 + 0.24 * k;
  p[BY] = -2.2 * s;
  p[HX] = 2.6 * s;
  p[HY] = 0.6 * s;
  p[HR] = p[BR] * 0.7 + 0.06 * s;
  p[E1] = -0.8 * s;
  p[E2] = -0.7 * s;
  p[ES] = 1 - 0.16 * s;
  const flutter = Math.sin(t * 40) * 0.03;
  p[T1] = p[BR] - 0.06 + flutter;
  p[T2] = p[T1] - 0.03 - flutter;
  p[T3] = p[T2] + 0.03 + flutter * 2;
  p[TS] = 1 - 0.12 * s;
  const reach = 1 - 0.5 * smooth((k - 0.7) / 0.3);          // к концу передние лапы тянутся к земле
  p[L1] = (-0.95 * reach - 0.1) * s + p[BR];
  p[L1 + 1] = (-0.8 * reach - 0.1) * s + p[BR];
  p[L1 + 2] = 1.3 * s + p[BR];
  p[L1 + 3] = 1.15 * s + p[BR];
  p[K1] = 1.14;
  p[K1 + 1] = 1.1;
  p[K1 + 2] = 1.16;
  p[K1 + 3] = 1.12;
  p[GR] = 0;
  p[CR] = 0.3 * s;
}

// приземлилась: присела от удара и выпрямляется; хвост и уши доезжают позже
function poseLand(p, k, t) {
  poseIdle(p, t);
  const q = (1 - k) * (1 - k);
  const back = Math.sin(k * Math.PI) * 0.05;
  p[BSY] = 1 - 0.22 * q + back;
  p[BSX] = 1 + 0.16 * q - back * 0.5;
  p[BY] = 2.3 * q - back * 4;
  p[HY] = 1.7 * q;
  p[HR] = 0.16 * q;
  p[E1] = 0.45 * q - back * 2;
  p[E2] = 0.36 * q;
  p[T1] -= 0.8 * q;
  p[T2] -= 1.1 * q;
  p[T3] -= 1.3 * q;
  p[L1] = -0.5 * q;
  p[L1 + 1] = -0.56 * q;
  p[L1 + 2] = 0.5 * q;
  p[L1 + 3] = 0.42 * q;
  p[CR] = 0.25 * q;
}

// добавки поверх стойки или бега: их не видно, когда прошли (q → 0)
function addHurt(p, k) {
  const q = (1 - k) * (1 - k);
  p[BX] -= 3.2 * q;
  p[BY] -= 1.4 * q;
  p[BR] -= 0.24 * q;
  p[HX] -= 1.2 * q;
  p[HR] -= 0.4 * q;
  p[E1] = lerp(p[E1], -0.6, q);
  p[E2] = lerp(p[E2], 0.45, q);
  p[T1] = lerp(p[T1], 1.2, q);
  p[T2] = lerp(p[T2], 1.35, q);
  p[T3] = lerp(p[T3], 1.2, q);
  p[TS] += 0.24 * q;
  p[L1] -= 0.4 * q;
  p[L1 + 1] -= 0.4 * q;
  p[L1 + 2] -= 0.2 * q;
  p[L1 + 3] -= 0.2 * q;
}

function addFire(p, k, tilt) {
  const q = (1 - k) * (1 - k);
  p[BX] -= 1.5 * q;
  p[BSX] -= 0.04 * q;
  p[HX] -= 0.9 * q;
  p[HR] += tilt * 0.5 - 0.12 * q;
  p[E1] -= 0.3 * q;
  p[E2] -= 0.3 * q;
  p[T1] += 0.2 * q;
}

function addBite(p, k) {
  const snap = k < 0.35 ? easeOut(k / 0.35) : 1 - smooth((k - 0.35) / 0.65);
  p[BX] += 1.2 * snap;
  p[HX] += 3.6 * snap;
  p[HY] += 1.3 * snap;
  p[HR] += 0.32 * snap;
  p[E1] -= 0.4 * snap;
  p[E2] -= 0.3 * snap;
  p[T1] += 0.3 * snap;
}

// сбита с ног: лежит на брюхе, лапы врозь, хвост на земле
function poseDown(p, t) {
  rest(p);
  const breath = Math.sin(t * 2);
  p[BY] = 4.9;
  p[BR] = 0.05;
  p[BSX] = 1.08;
  p[BSY] = 0.86 + breath * 0.012;
  p[HX] = 1.6;
  p[HY] = 3.2;
  p[HR] = 0.3;
  p[E1] = -0.9;
  p[E2] = 0.5;
  p[T1] = -0.3;
  p[T2] = -0.12;
  p[T3] = 0.04;
  p[L1] = -1.4;
  p[L1 + 1] = -1.25;
  p[L1 + 2] = 1.4;
  p[L1 + 3] = 1.25;
  p[K1] = 0.9;
  p[K1 + 1] = 0.9;
  p[K1 + 2] = 0.9;
  p[K1 + 3] = 0.9;
  p[GR] = 0;
  p[CR] = 0.5;
}

// ---------- лиса: сборка ----------

let ox = 0;        // середина тела в осях фигуры и его поворот с растяжением — от них считаются все крепления
let oy = 0;
let oc = 1;
let os = 0;
let osx = 1;
let osy = 1;
const atX = (at) => ox + at[0] * osx * oc - at[1] * osy * os;
const atY = (at) => oy + at[0] * osx * os + at[1] * osy * oc;
let nx = 0;        // шея, поворот головы и где от шеи её середина — от них считаются уши и глаза
let ny = 0;
let nc = 1;
let ns = 0;
let hcx = 0;
let hcy = 0;
const headX = (at) => nx + (hcx + at[0]) * nc - (hcy + at[1]) * ns;
const headY = (at) => ny + (hcx + at[0]) * ns + (hcy + at[1]) * nc;

function leg(kit, ctx, p, i, at, far) {
  const rot = p[L1 + i];
  const hy = atY(at);
  // стоит на земле — лапа сама дотягивается до неё (или поджимается, если тело присело)
  const reach = clamp(-hy / (LEG * Math.max(0.35, Math.cos(rot))), 0.5, 1.3);
  kit.part(ctx, 'mob.fox.leg', atX(at), hy, rot, 1, p[K1 + i] * lerp(1, reach, p[GR]), 1, far);
}

function drawFox(kit, ctx, p, eyes, mouth) {
  ox = FOX_AT.body[0] + p[BX];
  oy = FOX_AT.body[1] + p[BY];
  oc = Math.cos(p[BR]);
  os = Math.sin(p[BR]);
  osx = p[BSX];
  osy = p[BSY];

  // хвост: цепочка от крупа, каждый кусок — от конца предыдущего
  let tx = atX(FOX_AT.tail);
  let ty = atY(FOX_AT.tail);
  const ts = p[TS];
  kit.part(ctx, 'mob.fox.tail1', tx, ty, p[T1], 1, ts);
  tx -= Math.cos(p[T1]) * TAIL_L[0];
  ty -= Math.sin(p[T1]) * TAIL_L[0];
  kit.part(ctx, 'mob.fox.tail2', tx, ty, p[T2], 1, ts);
  tx -= Math.cos(p[T2]) * TAIL_L[1];
  ty -= Math.sin(p[T2]) * TAIL_L[1];
  kit.part(ctx, 'mob.fox.tail3', tx, ty, p[T3], 1, ts);

  leg(kit, ctx, p, 3, FOX_AT.legFH, 1);
  leg(kit, ctx, p, 1, FOX_AT.legFF, 1);
  kit.part(ctx, 'mob.fox.body', ox, oy, p[BR], osx, osy);
  leg(kit, ctx, p, 2, FOX_AT.legNH, 0);
  leg(kit, ctx, p, 0, FOX_AT.legNF, 0);
  kit.part(ctx, 'mob.fox.chest', atX(FOX_AT.chest), atY(FOX_AT.chest), p[BR] * 0.5 + p[CR]);

  // голова: шея на теле, дальше — в осях головы
  const hr = p[HR];
  hcx = HEAD_C[0];
  hcy = HEAD_C[1];
  nx = atX(FOX_AT.neck) + p[HX];
  ny = atY(FOX_AT.neck) + p[HY];
  nc = Math.cos(hr);
  ns = Math.sin(hr);
  kit.part(ctx, 'mob.fox.ear', headX(FOX_AT.earF), headY(FOX_AT.earF), hr + 0.2 + p[E2], 0.92, 0.95 * p[ES], 1, 1);
  kit.part(ctx, 'mob.fox.head', nx, ny, hr, 1, 1, 1, mouth);
  kit.part(ctx, 'mob.fox.eye', headX(FOX_AT.eyeF), headY(FOX_AT.eyeF), hr, 0.72, 0.9, 1, eyes);
  kit.part(ctx, 'mob.fox.eye', headX(FOX_AT.eyeN), headY(FOX_AT.eyeN), hr, 1, 1, 1, eyes);
  kit.part(ctx, 'mob.fox.ear', headX(FOX_AT.earN), headY(FOX_AT.earN), hr - 0.22 + p[E1], 1, p[ES], 1, 0);
}

defineRig('fox', {
  draw(kit, ctx, a) {
    const t = num(a.t);
    const k = clamp01(num(a.k));
    const speed = clamp01(num(a.speed));
    // куда целится или летит по высоте: вид сбоку, поэтому важна только доля «вверх-вниз»
    const aim = num(a.aim);
    const tilt = a.act === 'dash' && (num(a.vx) || num(a.vy))
      ? Math.atan2(num(a.vy), Math.abs(num(a.vx)))
      : Math.atan2(Math.sin(aim), Math.abs(Math.cos(aim)));
    const lean = clamp(tilt, -1.1, 1.1);
    let eyes = blinks(t) ? 2 : 0;
    let mouth = 0;
    switch (a.act) {
      case 'run':
        poseMove(P, t, Math.max(speed, 0.35));
        break;
      case 'aim':
        poseAim(P, t, lean);
        eyes = 1;
        break;
      case 'dash':
        poseDash(P, k, t, lean);
        eyes = 1;
        break;
      case 'land':
        poseLand(P, k, t);
        if (k < 0.45) eyes = 1;
        break;
      case 'hurt':
        poseMove(P, t, speed);
        addHurt(P, k);
        if (k < 0.75) eyes = 5;
        break;
      case 'fire':
        poseMove(P, t, speed);
        addFire(P, k, lean);
        eyes = 1;
        break;
      case 'bite':
        poseMove(P, t, speed);
        addBite(P, k);
        mouth = k < 0.32 ? 1 : 0;
        eyes = k < 0.32 ? 1 : 3;
        break;
      case 'down':
        poseDown(P, t);
        eyes = 4;
        break;
      case 'rise': {
        // встаёт: из «лежит» в «стоит» с перелётом, встряхивает головой
        poseDown(P2, t);
        poseIdle(P, t);
        blend(P, P2, P, backOut(k));
        P[GR] = smooth(k * 1.6);
        P[HR] += Math.sin(k * 19) * 0.16 * bump(k);
        if (k < 0.35) eyes = 2;
        break;
      }
      default:
        poseIdle(P, t);
    }
    drawFox(kit, ctx, P, eyes, mouth);
  },
});

// ---------- добыча ----------
// Кролик, заяц-беляк, золотой кролик и толстяк — одна фигура: меняются только краски и пропорции.
//   bw, bh — тело шире и выше; head — голова; ear, earW — длина и ширина ушей; leg — длина лап;
//   tip — цвет кончиков ушей (у беляка чёрные); spark — блёстки на шкуре.

const PREY = {
  rabbit: { coat: '#b8a48f', light: '#d9c8b4', dark: '#8c7763', belly: '#f4ebdf', inner: '#eeb4ac', tip: null, bw: 1, bh: 1, head: 1, ear: 1, earW: 1, leg: 1 },
  hare: { coat: '#f3f6fa', light: '#ffffff', dark: '#c9d6e6', belly: '#ffffff', inner: '#e9c4cc', tip: '#3b3f4a', bw: 1.08, bh: 0.92, head: 0.96, ear: 1.34, earW: 0.92, leg: 1.22 },
  gold: { coat: '#ffd24a', light: '#fff0a8', dark: '#d99a1c', belly: '#fff6d2', inner: '#ffb98a', tip: null, bw: 1, bh: 1, head: 1, ear: 1, earW: 1, leg: 1, spark: true },
  fat: { coat: '#e2c9a3', light: '#f4e4c8', dark: '#b89468', belly: '#fbf2e2', inner: '#f0b8a6', tip: null, bw: 1.3, bh: 1.26, head: 1, ear: 0.64, earW: 1.14, leg: 0.9 },
};

// глаз добычи — большой и круглый: 0 открыт, 1 закрыт, 2 вытаращен от страха, 3 устало прикрыт, 4 зажмурен
const PREY_EYES = [{ kind: 'prey' }, { kind: 'closed' }, { kind: 'wide' }, { kind: 'narrow', lid: 0.42 }, { kind: 'happy' }];
definePart('mob.prey.eye', [-2.3, -2.3, 2.3, 2.3], (g, v) => eye(g, 0, 0, 1.8, PREY_EYES[v]), PREY_EYES.length, 0.5);

// капля пота — летит от того, кто выдохся
definePart('mob.prey.drop', [-1.2, -1.8, 1.2, 1.4], (g) => {
  blob(g, [[0, -1.5, 1], [0.8, 0.2], [0, 1], [-0.8, 0.2]], tone('#bfe6ff', { line: '#5b93bd', lw: 0.6, shade: 0 }));
}, 1, 0.5);

// блёстка золотого кролика
definePart('mob.gold.spark', [-2.6, -2.6, 2.6, 2.6], (g) => {
  glow(g, 0, 0, 2.6, '#fff6c0', 0.6);
  sparkle(g, 0, 0, 2.3, '#ffffff', 0.2);
}, 1, 0.5);

const PREY_M = {};        // размеры и крепления каждого вида — по ним фигура собирается

function definePrey(id, S) {
  const key = `mob.${id}`;
  // зверёк маленький — обводка тоньше, чем у лисы, иначе контур съедает форму
  const coatTone = tone(S.coat, { light: S.light, dark: S.dark, lw: 1.2, line: outline(S.coat, 0.6) });
  const thin = { ...coatTone, lw: 1 };
  const far = tone(mix(S.coat, S.dark, 0.72), { light: S.coat, dark: darken(S.dark, 0.3), line: coatTone.line, lw: 1, rim: 0.25 });
  const bellyTone = tone(S.belly, { dark: mix(S.belly, S.dark, 0.5), line: coatTone.line });
  const rx = 6.1 * S.bw;
  const ry = 4.9 * S.bh;
  const hs = S.head;

  // тело: яйцо с круглым крупом; светлое брюшко спереди, свет на бедре
  definePart(`${key}.body`, [-rx - 1.6, -ry - 1.4, rx + 1.4, ry + 1.4], (g) => {
    blob(g, eggNodes(0, 0, rx, ry, Math.PI, 0.16), coatTone, {
      over(c, patch) {
        patch([[-rx * 0.15, ry * 0.55], [rx * 0.45, ry * 0.1], [rx * 1.3, -ry * 0.35], [rx * 1.3, ry * 1.5], [-rx * 0.6, ry * 1.5]], bellyTone);
        // бедро: свет на нём и дужка спереди
        glow(c, -rx * 0.42, ry * 0.05, ry * 0.95, S.light, 0.55);
        stroke(c, [[-rx * 0.3, -ry * 0.62], [rx * 0.1, -ry * 0.28], [rx * 0.2, ry * 0.32], [-rx * 0.02, ry * 0.86]], alpha(S.dark, 0.5), 0.7);
        if (S.spark) {
          sparkle(c, -rx * 0.5, -ry * 0.38, 1.5, '#ffffff', 0.24);
          sparkle(c, rx * 0.12, -ry * 0.6, 1, '#ffffff', 0.24);
          sparkle(c, -rx * 0.12, ry * 0.3, 0.8, '#fffbe0', 0.24);
        }
      },
    });
  });

  // голова: круглая, с пухлой щекой; мордочка светлая; сустав — шея
  const hc = [2 * hs, -2.4 * hs];
  const sc = (pts) => pts.map((p) => (p[2] ? [p[0] * hs, p[1] * hs, 1] : [p[0] * hs, p[1] * hs]));
  definePart(`${key}.head`, [hc[0] - 5.4 * hs, hc[1] - 5.4 * hs, hc[0] + 6.6 * hs, hc[1] + 5.2 * hs], (g) => {
    g.translate(hc[0], hc[1]);
    blob(g, sc([[-4.2, -0.6], [-2.8, -3.5], [0.6, -4.2], [3.6, -2.9], [4.7, -0.3], [4.3, 2.3], [1.6, 3.9], [-2, 3.6], [-4, 1.9]]), coatTone, {
      over(c, patch) {
        patch(sc([[0.6, 1.1], [3, 0.2], [6, 0.2], [6, 5], [0, 5], [-0.6, 2.8]]), bellyTone);
        blush(c, 0.9 * hs, 1.9 * hs, 2 * hs, '#ff8f8a', 0.45);
        stroke(c, sc([[4.4, 1.2], [3.7, 2.1], [2.9, 1.9]]), alpha('#5a3a38', 0.85), 0.7);
        c.fillStyle = '#ffffff';
        c.fillRect(3.5 * hs, 2.2 * hs, 0.9 * hs, 1 * hs);
      },
    });
    nose(g, 4.7 * hs, 0.3 * hs, 0.85, '#d9777c');
  });

  // ухо: 0 — ближнее (розовое внутри), 1 — дальнее; сустав — основание
  const L = 7.6 * S.ear;
  const w = 1.6 * S.earW;
  definePart(`${key}.ear`, [-w - 1.8, -L - 1.4, w + 1.8, 2.2], (g, v) => {
    const pts = [[-w * 0.9, 0.9], [-w * 1.08, -L * 0.36], [-w * 0.66, -L * 0.8], [0.1, -L], [w * 0.74, -L * 0.78], [w * 1.05, -L * 0.34], [w * 0.85, 0.9], [0, 1.7]];
    blob(g, pts, v ? far : thin, {
      over(c, patch) {
        if (!v) patch([[-w * 0.32, 0.8], [-w * 0.52, -L * 0.36], [0, -L * 0.74], [w * 0.52, -L * 0.34], [w * 0.4, 0.8]], tone(S.inner, { dark: darken(S.inner, 0.3) }));
        if (S.tip) patch([[-w * 3, -L * 0.72], [0, -L * 0.66], [w * 3, -L * 0.72], [w * 3, -L * 1.4], [-w * 3, -L * 1.4]], tone(S.tip, { light: '#6a6f7c' }));
      },
      stroke: (c) => pathBlobSpan(c, pts, 0, 6),
      shade: (c) => pathBlob(c, [[-w * 0.9, 8, 1], ...pts.slice(1, 6), [w * 0.85, 8, 1]]),
    });
    fadeEdge(g, 0, 1.6, 0, 0.2);
  }, 2);

  // хвост — пушистый комочек
  definePart(`${key}.tail`, [-3.2, -3.2, 3.2, 3.2], (g) => {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.2;
      const r = i % 2 ? 2.15 : 2.6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    blob(g, pts, { ...bellyTone, lw: 0.95 });
  });

  // задняя ступня: длинная, смотрит вперёд; сустав — пятка. 0 — ближняя, 1 — дальняя
  const fl = 5 * S.leg;
  definePart(`${key}.foot`, [-2.6, -2.6, fl + 2.6, 2.8], (g, v) => capsule(g, 0, 0, 1.55, fl, 0.45, 1.25, v ? far : thin), 2);

  // передняя лапка: висит из плеча. 0 — ближняя, 1 — дальняя
  const bodyY = -1 - ry - (S.leg - 1) * 2.4;                  // тело чуть над землёй: под ним — ступни
  const shoulder = [rx * 0.6, ry * 0.32];
  const pl = Math.max(1.2, -(bodyY + shoulder[1]) - 1.8);     // лапка как раз до земли
  definePart(`${key}.paw`, [-2.6, -2.4, 3, pl + 2.4], (g, v) => {
    limb(g, 0, 0, 1.55, 0.5, pl, 1.2, v ? far : thin);
    if (!v) fadeEdge(g, 0, -0.6, 0, 1.6);
  }, 2);

  PREY_M[id] = {
    rx, ry, hc,
    kBody: `${key}.body`, kHead: `${key}.head`, kEar: `${key}.ear`, kTail: `${key}.tail`, kFoot: `${key}.foot`, kPaw: `${key}.paw`,
    body: [-1, bodyY],
    neck: [rx * 0.86 - hc[0], -ry * 0.82 - hc[1]],
    tail: [-rx * 0.9, -ry * 0.2],
    foot: [-1 - rx * 0.52, -1.9],                              // пятка на земле — в осях фигуры, не тела
    shoulder, pawLen: pl + 1.75,
    earN: [-1.5 * hs, -3.2 * hs], earF: [0.5 * hs, -3.5 * hs], eye: [1.7 * hs, -0.9 * hs],
    spark: Boolean(S.spark),
  };

  defineRig(id, { draw: (kit, ctx, a) => drawPrey(kit, ctx, PREY_M[id], a) });
  RIG_INFO[id] = { acts: ['graze', 'alert', 'flee', 'tired', 'hop', 'freeze', 'dive'], w: 40, h: 40, shadow: 15 * S.bw };
}

// поза добычи — числа по местам, как у лисы
const QX = 0;      // тело: сдвиг
const QY = 1;
const QR = 2;      //   наклон (плюс — носом вниз)
const QSX = 3;
const QSY = 4;
const QHX = 5;     // голова: сдвиг от шеи и наклон
const QHY = 6;
const QHR = 7;
const QE1 = 8;     // уши: ближнее и дальнее (минус — назад), длина
const QE2 = 9;
const QEL = 10;
const QF = 11;     // задние ступни: поворот (плюс — вытянуты назад)
const QP = 12;     // передние лапки: поворот (минус — вперёд)
const QG = 13;     // стоит на земле: 1 — ступни на месте, 0 — летят вместе с телом
const QPG = 14;    //   и передние лапки: 1 — сами дотягиваются до земли, 0 — на весу
const QS = 15;     // размер целиком (ныряет в нору — уменьшается)
const QSIZE = 16;

const Q = new Float32Array(QSIZE);

function preyRest(q) {
  q.fill(0);
  q[QSX] = 1;
  q[QSY] = 1;
  q[QE1] = -0.3;
  q[QE2] = -0.06;
  q[QEL] = 1;
  q[QG] = 1;
  q[QPG] = 1;
  q[QS] = 1;
}

// повернуть тело вокруг точки (px, py) на нём — встаёт столбиком на задние лапы, а не крутится вокруг живота
function preyTilt(q, angle, px, py) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  q[QR] = angle;
  q[QX] += px - (px * c - py * s);
  q[QY] += py - (px * s + py * c);
}

// сидит: дышит, шевелит носом, поводит ухом
function preySit(q, t) {
  preyRest(q);
  const breath = Math.sin(t * 3.2);
  q[QSY] = 1 + breath * 0.03;
  q[QSX] = 1 - breath * 0.012;
  q[QY] = -breath * 0.12;
  q[QHR] = Math.sin(t * 9) * 0.025;
  q[QE1] -= 0.35 * flick(t, 2.9, 0, 0.22);
  q[QE2] += 0.3 * flick(t, 4.3, 1.2, 0.2);
}

// щиплет траву: голова у земли; раз в несколько секунд поднимает её и осматривается
function preyGraze(q, t) {
  preySit(q, t);
  const u = ((t % 3.6) + 3.6) % 3.6;
  const down = 1 - smooth((u - 2.6) / 0.16) * (1 - smooth((u - 3.3) / 0.16));
  q[QR] += 0.16 * down;
  q[QX] += 0.3 * down;
  q[QHX] = 0.9 * down;
  q[QHY] = (2.9 + Math.abs(Math.sin(t * 7.5)) * 0.4) * down;
  q[QHR] += 0.58 * down;
  q[QE1] -= 0.5 * down;
  q[QE2] -= 0.5 * down;
}

// насторожился: столбиком, уши торчком, лапки на весу
function preyAlert(q, t, M) {
  preyRest(q);
  preyTilt(q, -0.62, -M.rx * 0.35, M.ry * 0.75);
  q[QX] += Math.sin(t * 37) * 0.1;
  q[QHX] = -1.3;
  q[QHY] = -0.4;
  q[QHR] = -0.04;
  q[QE1] = 0.04;
  q[QE2] = 0.24;
  q[QEL] = 1.08;
  q[QP] = 0.4;
  q[QPG] = 0;
}

// удирает длинными прыжками: в воздухе вытянут, уши прижаты; на земле — собран в комок
function preyFlee(q, t, speed) {
  preyRest(q);
  const ph = t * 19.5;
  const up = Math.sin(ph);
  // в воздухе — почти две трети прыжка, на земле — короткий толчок
  const air = clamp01((up + 0.4) / 1.4);
  const push = clamp01((-up - 0.4) / 0.6);
  const far = 0.55 + 0.45 * speed;
  q[QY] = -5.2 * air * far + 0.5 * push;
  q[QR] = -0.26 * Math.cos(ph) * far;
  q[QSX] = 1 + (0.22 * air - 0.1 * push) * far;
  q[QSY] = 1 - (0.13 * air - 0.1 * push) * far;
  q[QHX] = 0.8 * air;
  q[QHR] = q[QR] * 0.5;
  q[QE1] = -1.3 - Math.sin(ph - 0.9) * 0.16;
  q[QE2] = -1.14 - Math.sin(ph - 1.3) * 0.16;
  q[QF] = 2.3 * air - 0.25 * push;
  q[QP] = -1.0 * air + 0.2 * push;
  q[QG] = clamp01(push * 4);
  q[QPG] = q[QG];
}

// выдохся: сидит, бока ходят, уши повисли
function preyTired(q, t) {
  preyRest(q);
  const pant = Math.sin(t * 12);
  q[QSY] = 0.97 + pant * 0.055;
  q[QSX] = 1.03 - pant * 0.03;
  q[QY] = 0.4 - pant * 0.2;
  q[QR] = 0.08;
  q[QHX] = 0.4;
  q[QHY] = 1.3 + pant * 0.25;
  q[QHR] = 0.22;
  q[QE1] = -1.8 + pant * 0.04;
  q[QE2] = -1.58 + pant * 0.04;
}

// прыжок в сторону от рывка: присел — взлетел дугой — присел
function preyHop(q, k) {
  preyRest(q);
  const air = smooth(k / 0.18) * (1 - smooth((k - 0.8) / 0.2));
  const arc = Math.sin(Math.PI * clamp01((k - 0.06) / 0.88));
  q[QY] = -8 * arc + 0.9 * (1 - air);
  q[QR] = lerp(-0.45, 0.4, smooth(k)) * air;
  q[QSX] = 1 + 0.2 * air - 0.08 * (1 - air);
  q[QSY] = 1 - 0.12 * air + 0.08 * (1 - air);
  q[QHR] = q[QR] * 0.5;
  q[QE1] = -0.3 - 1.0 * air;
  q[QE2] = -0.06 - 1.05 * air;
  q[QF] = 2.2 * air;
  q[QP] = -0.85 * air;
  q[QG] = 1 - air;
  q[QPG] = 1 - air;
}

// замер от страха: вжался в землю, уши торчком и мелко дрожат (у выдохшегося они, наоборот, лежат)
function preyFreeze(q, t) {
  preyRest(q);
  const shake = Math.sin(t * 58);
  q[QX] = shake * 0.38;
  q[QY] = 0.8;
  q[QSX] = 1.08;
  q[QSY] = 0.88;
  q[QHX] = -0.7;
  q[QHY] = 1;
  q[QE1] = -0.1 + Math.sin(t * 58 + 1) * 0.07;
  q[QE2] = 0.2 + Math.sin(t * 58 + 2) * 0.07;
  q[QEL] = 1.06;
}

// ныряет в нору: носом вниз, задние лапы вверх — и уменьшается к точке привязки (там нора)
function preyDive(q, k) {
  preyRest(q);
  const turn = smooth(k / 0.4);
  const sink = smooth((k - 0.25) / 0.75);
  q[QR] = 1.35 * turn;
  q[QX] = 2.6 * turn;
  q[QY] = -5 * Math.sin(Math.PI * Math.min(1, k / 0.5)) * (1 - sink) + 4.6 * sink;
  q[QS] = 1 - 0.8 * sink;
  q[QHR] = 1.1 * turn;
  q[QE1] = -0.3 - 0.9 * turn;
  q[QE2] = -0.06 - 0.95 * turn;
  q[QF] = 1.6 * turn;
  q[QP] = -0.7 * turn;
  q[QG] = 0;
  q[QPG] = 0;
}

/** Размер всей добычи разом: кролики покажутся мелкими на телефоне — увеличить здесь (1.15 — на 15 %). */
const PREY_SIZE = 1;

let ps = 1;        // размер добычи в кадре (с учётом нырка в нору) — на него множится всё, что ставит put
const put = (kit, ctx, key, x, y, rot, sx, sy, variant, a = 1) => kit.part(ctx, key, x * ps, y * ps, rot, sx * ps, sy * ps, a, variant);

function drawPrey(kit, ctx, M, a) {
  const t = num(a.t);
  const k = clamp01(num(a.k));
  const q = Q;
  let eyes = blinks(t + 1.7) ? 1 : 0;
  switch (a.act) {
    case 'graze':
      preyGraze(q, t);
      break;
    case 'alert':
      preyAlert(q, t, M);
      eyes = 0;
      break;
    case 'flee':
      preyFlee(q, t, clamp01(num(a.speed, 1)));
      eyes = 2;
      break;
    case 'tired':
      preyTired(q, t);
      eyes = 3;
      break;
    case 'hop':
      preyHop(q, k);
      eyes = 2;
      break;
    case 'freeze':
      preyFreeze(q, t);
      eyes = 2;
      break;
    case 'dive':
      preyDive(q, k);
      break;
    default:
      preySit(q, t);
  }
  ps = q[QS] * PREY_SIZE;
  ox = M.body[0] + q[QX];
  oy = M.body[1] + q[QY];
  oc = Math.cos(q[QR]);
  os = Math.sin(q[QR]);
  osx = q[QSX];
  osy = q[QSY];

  // шея и голова
  const hr = q[QHR];
  hcx = M.hc[0];
  hcy = M.hc[1];
  nx = atX(M.neck) + q[QHX];
  ny = atY(M.neck) + q[QHY];
  nc = Math.cos(hr);
  ns = Math.sin(hr);

  // ступни: на земле стоят на своём месте, в прыжке — летят за телом
  const g = q[QG];
  const fx = lerp(ox + (M.foot[0] - M.body[0]) * oc - (M.foot[1] - M.body[1]) * os, M.foot[0] + q[QX] * 0.4, g);
  const fy = lerp(oy + (M.foot[0] - M.body[0]) * os + (M.foot[1] - M.body[1]) * oc, M.foot[1], g);
  const fr = q[QF] + q[QR] * (1 - g);
  const pr = q[QP] + q[QR] * 0.6;
  // лапка на земле дотягивается до неё сама: тело наклонилось — она короче, приподнялось — длиннее
  const sy = atY(M.shoulder);
  const pk = lerp(1, clamp(-sy / (M.pawLen * Math.max(0.4, Math.cos(pr))), 0.4, 1.3), q[QPG]);

  put(kit, ctx, M.kEar, headX(M.earF), headY(M.earF), hr + q[QE2], 1, q[QEL], 1);
  put(kit, ctx, M.kFoot, fx + 1.5, fy - 0.5, fr, 1, 1, 1);
  put(kit, ctx, M.kPaw, atX(M.shoulder) + 1.5, sy - 0.4, pr, 1, pk, 1);
  put(kit, ctx, M.kTail, atX(M.tail), atY(M.tail), q[QR], 1, 1, 0);
  put(kit, ctx, M.kBody, ox, oy, q[QR], osx, osy, 0);
  put(kit, ctx, M.kFoot, fx, fy, fr, 1, 1, 0);
  put(kit, ctx, M.kPaw, atX(M.shoulder), sy, pr, 1, pk, 0);
  put(kit, ctx, M.kHead, nx, ny, hr, 1, 1, 0);
  put(kit, ctx, 'mob.prey.eye', headX(M.eye), headY(M.eye), hr, 1, 1, eyes);
  put(kit, ctx, M.kEar, headX(M.earN), headY(M.earN), hr + q[QE1], 1, q[QEL], 0);

  if (a.act === 'tired') {
    // капли пота: летят от головы назад и гаснут
    for (let i = 0; i < 2; i++) {
      const u = (((t * 1.5 + i * 0.5) % 1) + 1) % 1;
      put(kit, ctx, 'mob.prey.drop', nx - 1 - u * 6 - i * 2, ny - 7.5 - u * 5 + u * u * 7, -0.7, 1, 1, 0, 1 - u * u);
    }
  }
  if (M.spark) {
    // блёстки вспыхивают по очереди
    for (let i = 0; i < 3; i++) {
      const s = Math.max(0, Math.sin(t * 4.2 + i * 2.1));
      if (s > 0.05) put(kit, ctx, 'mob.gold.spark', ox + (i - 1) * M.rx * 0.8 + 1, oy - M.ry * (0.9 - (i % 2) * 1.3), t * 0.8 + i, s, s, 0, s);
    }
  }
  ps = 1;
}

for (const id of Object.keys(PREY)) definePrey(id, PREY[id]);
