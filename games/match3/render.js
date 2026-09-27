// Рисование «Три в ряд» на canvas: поле, фишки, препятствия, анимация фаз хода и эффекты.
//
// Два холста: board — поле (ловит нажатия), fx — поверх всей игры (частицы, лучи ракет, полёт собранных фишек
// к счётчику цели). Вид поля — своя копия состояния (view): фишки по id с дробными координатами; фазы хода из
// logic.js двигают её с анимацией, а в конце хода sync(state) сверяет её с настоящим состоянием.
// Фишки рисуются один раз в картинку (кэш по виду, цвету и размеру) — в кадре только drawImage.

import { reducedMotion } from '../../shared/motion.js';

export const COLORS = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#35c95a', '#2f8cff', '#a24bff'];
const LIGHT = ['#ffb3c0', '#ffd09a', '#fff3a6', '#b4f5c2', '#b0d6ff', '#dcb8ff'];
const DARK = ['#b0122f', '#c0550a', '#c79400', '#16863a', '#1256b8', '#6420b0'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = {
  out: (k) => 1 - (1 - k) ** 3,
  in: (k) => k * k,
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,
  lin: (k) => k,
};

// ---------- формы фишек (единичный квадрат с центром в 0) ----------

function shapePath(c, color) {
  c.beginPath();
  if (color === 0) {                          // сердце
    c.moveTo(0, 0.36);
    c.bezierCurveTo(-0.5, 0.02, -0.42, -0.42, -0.2, -0.4);
    c.bezierCurveTo(-0.08, -0.39, 0, -0.3, 0, -0.2);
    c.bezierCurveTo(0, -0.3, 0.08, -0.39, 0.2, -0.4);
    c.bezierCurveTo(0.42, -0.42, 0.5, 0.02, 0, 0.36);
  } else if (color === 1) {                   // круглая карамель
    c.arc(0, 0, 0.38, 0, Math.PI * 2);
  } else if (color === 2) {                   // звезда
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.19 : 0.43;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r + 0.03;
      k ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  } else if (color === 3) {                   // лист
    c.moveTo(-0.34, 0.34);
    c.bezierCurveTo(-0.44, -0.1, -0.1, -0.42, 0.38, -0.38);
    c.bezierCurveTo(0.42, 0.1, 0.1, 0.44, -0.34, 0.34);
  } else if (color === 4) {                   // ромб-кристалл
    c.moveTo(0, -0.42);
    c.lineTo(0.38, -0.06);
    c.lineTo(0, 0.42);
    c.lineTo(-0.38, -0.06);
    c.closePath();
  } else {                                    // шестигранник
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      k ? c.lineTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4) : c.moveTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
    }
    c.closePath();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Глянцевая «мармеладка»: тень, заливка сверху светлее, обводка, блик и искра. */
function drawGem(c, color, pathFn = () => shapePath(c, color)) {
  c.save();
  c.translate(0, 0.05);
  c.globalAlpha = 0.28;
  c.fillStyle = '#000';
  c.scale(1, 0.96);
  pathFn();
  c.fill();
  c.restore();

  const g = c.createLinearGradient(0, -0.45, 0, 0.45);
  g.addColorStop(0, LIGHT[color]);
  g.addColorStop(0.45, COLORS[color]);
  g.addColorStop(1, DARK[color]);
  pathFn();
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.045;
  c.strokeStyle = DARK[color];
  c.lineJoin = 'round';
  c.stroke();

  // блик: светлый овал сверху-слева внутри формы
  c.save();
  pathFn();
  c.clip();
  const h = c.createRadialGradient(-0.12, -0.2, 0.02, -0.12, -0.2, 0.32);
  h.addColorStop(0, 'rgba(255,255,255,0.85)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = h;
  c.beginPath();
  c.ellipse(-0.1, -0.18, 0.28, 0.18, -0.5, 0, Math.PI * 2);
  c.fill();
  // отражённый свет снизу
  c.globalAlpha = 0.35;
  c.strokeStyle = '#fff';
  c.lineWidth = 0.035;
  c.beginPath();
  c.arc(0, 0.02, 0.3, 0.3 * Math.PI, 0.7 * Math.PI);
  c.stroke();
  c.restore();
  sparkle(c, -0.16, -0.2, 0.07);
}

function sparkle(c, x, y, r) {
  c.save();
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
  c.restore();
}

/** Ракета: капсула цвета фишки с белыми полосами и стрелками на концах (вдоль ряда или столбца). */
function drawRocket(c, color, vertical) {
  c.save();
  if (vertical) c.rotate(Math.PI / 2);
  const body = () => {
    c.beginPath();
    c.moveTo(-0.46, 0);
    c.lineTo(-0.3, -0.2);
    c.lineTo(0.3, -0.2);
    c.lineTo(0.46, 0);
    c.lineTo(0.3, 0.2);
    c.lineTo(-0.3, 0.2);
    c.closePath();
  };
  drawGem(c, color, body);
  c.save();
  body();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  for (const x of [-0.14, 0.02]) c.fillRect(x, -0.22, 0.07, 0.44);
  c.restore();
  c.fillStyle = '#fff';
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(dir * 0.3, -0.09);
    c.lineTo(dir * 0.43, 0);
    c.lineTo(dir * 0.3, 0.09);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Бомба: тёмный шар с отливом цвета фишки и фитилём (искра рисуется в кадре). */
function drawBomb(c, color) {
  const circle = () => {
    c.beginPath();
    c.arc(0, 0.04, 0.36, 0, Math.PI * 2);
  };
  c.save();
  c.translate(0, 0.05);
  c.globalAlpha = 0.3;
  c.fillStyle = '#000';
  circle();
  c.fill();
  c.restore();
  const g = c.createRadialGradient(-0.12, -0.08, 0.05, 0, 0.04, 0.4);
  g.addColorStop(0, LIGHT[color]);
  g.addColorStop(0.35, COLORS[color]);
  g.addColorStop(1, '#1d1430');
  circle();
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.04;
  c.strokeStyle = '#140d22';
  c.stroke();
  // колпачок и фитиль
  c.fillStyle = '#c9a44a';
  roundRect(c, -0.09, -0.4, 0.18, 0.1, 0.03);
  c.fill();
  c.strokeStyle = '#6b4a1e';
  c.lineWidth = 0.035;
  c.beginPath();
  c.moveTo(0, -0.4);
  c.quadraticCurveTo(0.08, -0.52, 0.18, -0.46);
  c.stroke();
  c.fillStyle = '#fff';
  c.globalAlpha = 0.8;
  c.beginPath();
  c.ellipse(-0.13, -0.08, 0.1, 0.06, -0.6, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
}

/** Пропеллер: фишка-кружок цвета, сверху белые лопасти (вращаются в кадре — здесь только основа). */
function drawPropellerBase(c, color) {
  drawGem(c, color, () => {
    c.beginPath();
    c.arc(0, 0.05, 0.33, 0, Math.PI * 2);
  });
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(0, 0.05, 0.07, 0, Math.PI * 2);
  c.fill();
}

function drawBlades(c, angle) {
  c.save();
  c.translate(0, 0.05);
  c.rotate(angle);
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.strokeStyle = 'rgba(40,30,60,0.5)';
  c.lineWidth = 0.02;
  for (let k = 0; k < 3; k++) {
    c.rotate((Math.PI * 2) / 3);
    c.beginPath();
    c.ellipse(0, -0.2, 0.07, 0.18, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.fillStyle = '#4b3b6b';
  c.beginPath();
  c.arc(0, 0, 0.05, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Призма: переливающийся шар (радуга вращается в кадре). */
function drawPrism(c, angle) {
  c.save();
  c.translate(0, 0.05);
  c.globalAlpha = 0.3;
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(0, 0.02, 0.4, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.arc(0, 0, 0.4, 0, Math.PI * 2);
  c.clip();
  const n = 12;
  for (let k = 0; k < n; k++) {
    c.fillStyle = `hsl(${(k * 360) / n}, 95%, 62%)`;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 0.42, angle + (k * Math.PI * 2) / n, angle + ((k + 1.05) * Math.PI * 2) / n);
    c.closePath();
    c.fill();
  }
  const g = c.createRadialGradient(-0.12, -0.14, 0.02, 0, 0, 0.42);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(40,0,80,0.45)');
  c.fillStyle = g;
  c.fillRect(-0.5, -0.5, 1, 1);
  c.restore();
  c.lineWidth = 0.04;
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(0, 0, 0.4, 0, Math.PI * 2);
  c.stroke();
  sparkle(c, -0.14, -0.16, 0.09);
  sparkle(c, 0.16, 0.12, 0.05);
}

/** Сундук, который надо довести вниз. */
function drawChest(c) {
  c.save();
  c.translate(0, 0.05);
  c.globalAlpha = 0.3;
  c.fillStyle = '#000';
  roundRect(c, -0.36, -0.22, 0.72, 0.56, 0.08);
  c.fill();
  c.restore();
  const g = c.createLinearGradient(0, -0.3, 0, 0.35);
  g.addColorStop(0, '#d38b3c');
  g.addColorStop(1, '#8a4a17');
  c.fillStyle = g;
  roundRect(c, -0.36, -0.12, 0.72, 0.46, 0.07);
  c.fill();
  const lid = c.createLinearGradient(0, -0.4, 0, -0.1);
  lid.addColorStop(0, '#e8a453');
  lid.addColorStop(1, '#a45e22');
  c.fillStyle = lid;
  c.beginPath();
  c.moveTo(-0.36, -0.1);
  c.quadraticCurveTo(-0.36, -0.42, 0, -0.42);
  c.quadraticCurveTo(0.36, -0.42, 0.36, -0.1);
  c.closePath();
  c.fill();
  c.strokeStyle = '#5b2e0c';
  c.lineWidth = 0.035;
  roundRect(c, -0.36, -0.12, 0.72, 0.46, 0.07);
  c.stroke();
  c.fillStyle = '#ffd34d';
  c.strokeStyle = '#9a6a00';
  c.lineWidth = 0.025;
  for (const x of [-0.28, 0.2]) {
    c.fillRect(x, -0.4, 0.08, 0.74);
    c.strokeRect(x, -0.4, 0.08, 0.74);
  }
  roundRect(c, -0.08, -0.1, 0.16, 0.16, 0.04);
  c.fill();
  c.stroke();
  sparkle(c, -0.18, -0.28, 0.07);
}

/** Спрайт фишки (без живых частей). */
function drawPieceBase(c, p) {
  if (p.k === 'n') drawGem(c, p.c);
  else if (p.k === 'rh' || p.k === 'rv') drawRocket(c, p.c, p.k === 'rv');
  else if (p.k === 'b') drawBomb(c, p.c);
  else if (p.k === 'p') drawPropellerBase(c, p.c);
  else if (p.k === 't') drawChest(c);
}

// ---------- препятствия ----------

function drawIce(c, v) {
  c.save();
  const g = c.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
  g.addColorStop(0, v > 1 ? 'rgba(210,245,255,0.95)' : 'rgba(210,245,255,0.7)');
  g.addColorStop(1, v > 1 ? 'rgba(120,200,240,0.9)' : 'rgba(140,210,245,0.55)');
  c.fillStyle = g;
  roundRect(c, -0.47, -0.47, 0.94, 0.94, 0.12);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 0.035;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 0.025;
  c.beginPath();
  c.moveTo(-0.3, -0.36);
  c.lineTo(-0.1, -0.16);
  c.moveTo(0.22, 0.3);
  c.lineTo(0.36, 0.16);
  if (v > 1) {
    c.moveTo(-0.36, 0.3);
    c.lineTo(-0.2, 0.36);
    c.moveTo(0.3, -0.34);
    c.lineTo(0.12, -0.3);
  }
  c.stroke();
  c.restore();
}

function drawCrate(c, hp) {
  const tone = [null, ['#e2b068', '#a8702f'], ['#b87a3c', '#7a4a1c'], ['#8a5a2e', '#4e2f12']][Math.min(3, hp)];
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(c, -0.44, -0.4, 0.9, 0.9, 0.1);
  c.fill();
  const g = c.createLinearGradient(0, -0.46, 0, 0.46);
  g.addColorStop(0, tone[0]);
  g.addColorStop(1, tone[1]);
  c.fillStyle = g;
  roundRect(c, -0.46, -0.46, 0.92, 0.92, 0.1);
  c.fill();
  c.strokeStyle = 'rgba(60,30,8,0.55)';
  c.lineWidth = 0.03;
  for (const y of [-0.15, 0.15]) {
    c.beginPath();
    c.moveTo(-0.44, y);
    c.lineTo(0.44, y);
    c.stroke();
  }
  c.lineWidth = 0.07;
  c.strokeStyle = tone[1];
  c.beginPath();
  c.moveTo(-0.34, -0.34);
  c.lineTo(0.34, 0.34);
  c.stroke();
  c.lineWidth = 0.04;
  c.strokeStyle = '#3d2208';
  roundRect(c, -0.46, -0.46, 0.92, 0.92, 0.1);
  c.stroke();
  if (hp >= 2) {
    c.fillStyle = '#c8ccd6';
    for (const [x, y] of [[-0.46, -0.46], [0.3, -0.46], [-0.46, 0.3], [0.3, 0.3]]) {
      roundRect(c, x, y, 0.16, 0.16, 0.04);
      c.fill();
    }
  }
  if (hp >= 3) {
    c.fillStyle = '#9aa1b0';
    c.fillRect(-0.46, -0.04, 0.92, 0.08);
  }
  c.restore();
}

function drawSteel(c, hp) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(c, -0.44, -0.4, 0.9, 0.9, 0.12);
  c.fill();
  const g = c.createLinearGradient(-0.4, -0.46, 0.4, 0.46);
  g.addColorStop(0, '#e9eef5');
  g.addColorStop(0.5, '#9aa6b8');
  g.addColorStop(1, '#5d6778');
  c.fillStyle = g;
  roundRect(c, -0.46, -0.46, 0.92, 0.92, 0.12);
  c.fill();
  c.strokeStyle = '#3b4250';
  c.lineWidth = 0.04;
  c.stroke();
  c.fillStyle = '#4b5361';
  for (const [x, y] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) {
    c.beginPath();
    c.arc(x, y, 0.045, 0, Math.PI * 2);
    c.fill();
  }
  // замок-циферблат
  c.fillStyle = '#39404d';
  c.beginPath();
  c.arc(0, 0, 0.16, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#d7dde8';
  c.lineWidth = 0.035;
  c.beginPath();
  c.arc(0, 0, 0.1, 0, Math.PI * 2);
  c.moveTo(0, 0);
  c.lineTo(0.07, -0.07);
  c.stroke();
  if (hp < 2) {
    c.strokeStyle = '#1e222b';
    c.lineWidth = 0.03;
    c.beginPath();
    c.moveTo(-0.46, -0.1);
    c.lineTo(-0.2, 0.02);
    c.lineTo(-0.28, 0.18);
    c.lineTo(-0.05, 0.4);
    c.stroke();
  }
  c.restore();
}

/** Слизь: пузырчатая капля с глазками; wob — покачивание. */
function drawSlime(c, t, seed) {
  const w = Math.sin(t * 3 + seed) * 0.03;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.ellipse(0, 0.36, 0.4, 0.1, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(-0.1, -0.15, 0.05, 0, 0.05, 0.5);
  g.addColorStop(0, '#d8ff8a');
  g.addColorStop(0.5, '#7bd23f');
  g.addColorStop(1, '#3f8a1c');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-0.44, 0.34);
  c.bezierCurveTo(-0.5, -0.1, -0.3 - w, -0.42, 0, -0.42 + w);
  c.bezierCurveTo(0.3 + w, -0.42, 0.5, -0.1, 0.44, 0.34);
  c.quadraticCurveTo(0.3, 0.44, 0.15, 0.34);
  c.quadraticCurveTo(0, 0.44, -0.15, 0.34);
  c.quadraticCurveTo(-0.3, 0.44, -0.44, 0.34);
  c.fill();
  c.strokeStyle = '#2f6a12';
  c.lineWidth = 0.035;
  c.stroke();
  const blink = (Math.sin(t * 1.3 + seed * 7) > 0.97) ? 0.2 : 1;
  for (const x of [-0.13, 0.13]) {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(x, -0.06, 0.09, 0.11 * blink, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a2a10';
    c.beginPath();
    c.arc(x + 0.02, -0.04, 0.045 * blink, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.ellipse(-0.24, -0.2, 0.07, 0.04, -0.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Цепи: фишка притемнена, крест-накрест две цепи из звеньев, посередине замочек (2 слоя — цепи толще). */
function drawChains(c, lock) {
  c.save();
  c.fillStyle = 'rgba(30, 30, 45, 0.28)';
  roundRect(c, -0.44, -0.44, 0.88, 0.88, 0.14);
  c.fill();
  const link = lock > 1 ? 0.13 : 0.11;
  for (const dir of [1, -1]) {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = -0.44 + 0.88 * t;
      const y = dir * (-0.44 + 0.88 * t);
      c.save();
      c.translate(x, y);
      c.rotate(dir * Math.PI / 4 + (k % 2 ? Math.PI / 2 : 0));
      const w = k % 2 ? link * 0.55 : link;
      const h = k % 2 ? link * 0.9 : link * 0.55;
      c.lineWidth = 0.05;
      c.strokeStyle = '#2e3140';
      c.beginPath();
      c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 0.028;
      c.strokeStyle = lock > 1 ? '#b8bfcc' : '#e6eaf2';
      c.stroke();
      c.restore();
    }
  }
  // замочек
  c.fillStyle = lock > 1 ? '#9aa3b2' : '#d9dee8';
  c.strokeStyle = '#2e3140';
  c.lineWidth = 0.035;
  c.beginPath();
  c.arc(0, -0.07, 0.08, Math.PI, 0);
  c.stroke();
  roundRect(c, -0.12, -0.07, 0.24, 0.19, 0.04);
  c.fill();
  c.stroke();
  c.fillStyle = '#2e3140';
  c.beginPath();
  c.arc(0, 0.01, 0.03, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawTimer(c, v) {
  c.save();
  c.translate(0.24, 0.24);
  c.fillStyle = v <= 3 ? '#ff2d2d' : '#262033';
  c.strokeStyle = '#fff';
  c.lineWidth = 0.035;
  c.beginPath();
  c.arc(0, 0, 0.17, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#fff';
  c.font = 'bold 0.22px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(v), 0, 0.01);
  c.restore();
}

/** Значок для DOM (цели уровня, карточки): canvas нужного размера. */
export function makeIcon(type, color, px = 28) {
  const cv = document.createElement('canvas');
  const scale = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(px * scale);
  cv.height = Math.round(px * scale);
  cv.style.width = `${px}px`;
  cv.style.height = `${px}px`;
  const c = cv.getContext('2d');
  c.translate(cv.width / 2, cv.height / 2);
  c.scale(cv.width / 1.05, cv.height / 1.05);
  if (type === 'color') drawGem(c, color);
  else if (type === 'ice') drawIce(c, 2);
  else if (type === 'box') drawCrate(c, 1);
  else if (type === 'slime') drawSlime(c, 0, 1);
  else if (type === 'chain') {
    drawGem(c, 4);
    drawChains(c, 1);
  } else if (type === 'treasure') drawChest(c);
  else if (type === 'steel') drawSteel(c, 2);
  else if (type === 'rocket') drawRocket(c, 0, false);
  else if (type === 'bomb') drawBomb(c, 5);
  else if (type === 'propeller') {
    drawPropellerBase(c, 3);
    drawBlades(c, 0.3);
  } else if (type === 'prism') drawPrism(c, 0.4);
  else if (type === 'timer') {
    drawGem(c, 0);
    drawTimer(c, 5);
  }
  return cv;
}


// ---------- рендерер ----------

export function createRenderer({ board, fx, host, getGoalTarget = () => null }) {
  const bc = board.getContext('2d');
  const fc = fx.getContext('2d');
  let dpr = 1;
  let W = 0;
  let H = 0;
  let cs = 40;                     // размер клетки в css-пикселях
  let ox = 0;
  let oy = 0;
  let state = null;                // для размеров, дыр
  const view = { pieces: new Map(), ice: [], block: [], cells: [] };
  const sprites = new Map();
  let bg = null;                   // готовая подложка поля
  const tweens = [];
  const particles = [];
  const flights = [];              // собранные фишки летят к счётчику цели
  const rings = [];
  let shakeT = 0;
  let selected = -1;
  let hintPair = null;
  let raf = 0;
  let timer = 0;
  let last = performance.now();
  let alive = true;
  let fxRect = { left: 0, top: 0 };

  // ---------- размеры ----------

  function layout() {
    if (!state) return;
    const rect = board.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    fxRect = { left: rect.left - hostRect.left, top: rect.top - hostRect.top };
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = rect.width;
    H = rect.height;
    board.width = Math.max(1, Math.round(W * dpr));
    board.height = Math.max(1, Math.round(H * dpr));
    fx.width = Math.max(1, Math.round(hostRect.width * dpr));
    fx.height = Math.max(1, Math.round(hostRect.height * dpr));
    cs = Math.floor(Math.min(W / state.cols, H / state.rows));
    ox = Math.round((W - cs * state.cols) / 2);
    oy = Math.round((H - cs * state.rows) / 2);
    sprites.clear();
    bg = null;
  }

  const cx = (col) => ox + (col + 0.5) * cs;
  const cy = (row) => oy + (row + 0.5) * cs;
  /** Центр клетки в координатах холста эффектов. */
  const fxPoint = (col, row) => ({ x: fxRect.left + cx(col), y: fxRect.top + cy(row) });

  function cellAt(clientX, clientY) {
    if (!state) return -1;
    const rect = board.getBoundingClientRect();
    const c = Math.floor((clientX - rect.left - ox) / cs);
    const r = Math.floor((clientY - rect.top - oy) / cs);
    if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return -1;
    const i = r * state.cols + c;
    return view.cells[i] ? i : -1;
  }

  // ---------- спрайты ----------

  function sprite(key, draw) {
    let s = sprites.get(key);
    if (s) return s;
    const size = Math.max(8, Math.round(cs * dpr * 1.15));
    s = document.createElement('canvas');
    s.width = size;
    s.height = size;
    const c = s.getContext('2d');
    c.translate(size / 2, size / 2);
    c.scale(size / 1.15, size / 1.15);
    draw(c);
    sprites.set(key, s);
    return s;
  }

  const pieceSprite = (p) => sprite(`p${p.k}${p.c ?? ''}`, (c) => drawPieceBase(c, p));

  function buildBg() {
    const cv = document.createElement('canvas');
    cv.width = board.width;
    cv.height = board.height;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const pad = Math.max(3, cs * 0.08);
    // общая подложка — контур по клеткам поля
    c.fillStyle = 'rgba(20, 12, 45, 0.42)';
    for (let i = 0; i < view.cells.length; i++) {
      if (!view.cells[i]) continue;
      const r = Math.floor(i / state.cols);
      const col = i % state.cols;
      roundRect(c, ox + col * cs - pad, oy + r * cs - pad, cs + pad * 2, cs + pad * 2, pad * 2);
      c.fill();
    }
    for (let i = 0; i < view.cells.length; i++) {
      if (!view.cells[i]) continue;
      const r = Math.floor(i / state.cols);
      const col = i % state.cols;
      c.fillStyle = (r + col) % 2 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.2)';
      roundRect(c, ox + col * cs + 1.5, oy + r * cs + 1.5, cs - 3, cs - 3, cs * 0.16);
      c.fill();
    }
    bg = cv;
  }

  // ---------- состояние вида ----------

  function sync(s) {
    const firstTime = state !== s || view.cells.length !== s.cells.length;
    state = s;
    if (firstTime) layout();
    view.cells = s.cells.slice();
    view.ice = s.ice.slice();
    view.block = s.block.map((b) => (b ? { ...b } : null));
    const keep = new Set();
    s.pieces.forEach((p, i) => {
      if (!p) return;
      keep.add(p.id);
      const v = view.pieces.get(p.id);
      const col = i % s.cols;
      const row = Math.floor(i / s.cols);
      if (v) Object.assign(v, { k: p.k, c: p.c, lock: p.lock ?? 0, timer: p.timer ?? 0, x: col, y: row, s: 1, a: 1, sq: 0, dy: 0 });
      else view.pieces.set(p.id, makeView(p, col, row));
    });
    for (const id of [...view.pieces.keys()]) if (!keep.has(id)) view.pieces.delete(id);
    bg = null;
    kick();
  }

  function makeView(p, col, row) {
    return { id: p.id, k: p.k, c: p.c, lock: p.lock ?? 0, timer: p.timer ?? 0, x: col, y: row, s: 1, a: 1, sq: 0, dy: 0, spin: Math.random() * 6 };
  }

  const posOf = (i) => ({ x: i % state.cols, y: Math.floor(i / state.cols) });

  // ---------- анимация ----------

  function tween(dur, fn, { delay = 0, easing = ease.out } = {}) {
    if (reducedMotion()) dur = Math.min(dur, 1);
    return new Promise((resolve) => {
      tweens.push({ t0: performance.now() + delay, dur, fn, easing, resolve, started: false });
      kick();
    });
  }

  const wait = (ms) => tween(reducedMotion() ? 0 : ms, () => {});

  function burst(i, color, n = 8, { speed = 1, size = 1 } = {}) {
    if (reducedMotion()) return;
    const { x, y } = posOf(i);
    const p = fxPoint(x, y);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = cs * (2.5 + Math.random() * 4) * speed;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cs * 2, g: cs * 18, life: 0.45 + Math.random() * 0.35, t: 0, size: cs * (0.08 + Math.random() * 0.1) * size, color, rot: Math.random() * 6, shape: k % 3 });
    }
    kick();
  }

  function ring(i, color, radius, dur = 0.45) {
    if (reducedMotion()) return;
    const { x, y } = posOf(i);
    rings.push({ ...fxPoint(x, y), color, radius: radius * cs, t: 0, life: dur });
    kick();
  }

  /** Луч ракеты — ровно по ряду или столбцу поля (от края до края), вспыхивает от места ракеты. */
  function beam(i, vertical, color) {
    if (reducedMotion()) return;
    const { x, y } = posOf(i);
    const p = fxPoint(x, y);
    const mid = fxPoint((state.cols - 1) / 2, (state.rows - 1) / 2);
    rings.push({ beam: true, vertical, x: vertical ? p.x : mid.x, y: vertical ? mid.y : p.y, color, t: 0, life: 0.45,
      len: vertical ? state.rows * cs : state.cols * cs });
    kick();
  }

  function shake(power = 1) {
    if (reducedMotion()) return;
    shakeT = Math.max(shakeT, 0.3 * power);
  }

  /** Фишка улетает к значку цели (если он на экране). */
  function fly(p, i, kind) {
    const target = getGoalTarget(kind, p.c);
    if (!target || reducedMotion()) return;
    const { x, y } = posOf(i);
    const from = fxPoint(x, y);
    flights.push({ p: { ...p, lock: 0, timer: 0 }, from, to: target, t: 0, life: 0.55 + Math.random() * 0.15, onDone: target.onArrive });
    kick();
  }

  // ---------- фазы хода ----------

  async function playSwap(ph, back = false) {
    const va = view.pieces.get(ph.ida ?? state.pieces[ph.b]?.id);
    const vb = view.pieces.get(ph.idb ?? state.pieces[ph.a]?.id);
    const A = posOf(ph.a);
    const B = posOf(ph.b);
    if (back) {
      // неудачный обмен: фишки качнулись навстречу и вернулись
      const pa = view.pieces.get(state.pieces[ph.a]?.id);
      const pb = view.pieces.get(state.pieces[ph.b]?.id);
      await tween(230, (k) => {
        const d = Math.sin(k * Math.PI) * 0.32;
        if (pa) Object.assign(pa, { x: A.x + (B.x - A.x) * d, y: A.y + (B.y - A.y) * d });
        if (pb) Object.assign(pb, { x: B.x + (A.x - B.x) * d, y: B.y + (A.y - B.y) * d });
      }, { easing: ease.lin });
      return;
    }
    await tween(170, (k) => {
      if (va) Object.assign(va, { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, s: 1 + Math.sin(k * Math.PI) * 0.12 });
      if (vb) Object.assign(vb, { x: B.x + (A.x - B.x) * k, y: B.y + (A.y - B.y) * k, s: 1 - Math.sin(k * Math.PI) * 0.08 });
    }, { easing: ease.inOut });
  }

  async function playClear(ph, sounds) {
    const jobs = [];
    const origins = [];
    // срабатывания спецфишек и комбо
    for (const act of ph.activations) {
      origins.push(act.i);
      const color = COLORS[act.c ?? act.color ?? 0] ?? '#fff';
      const { x, y } = posOf(act.i);
      if (act.k === 'rh' || act.k === 'rv') {
        beam(act.i, act.k === 'rv', color);
        sounds('rocket');
      } else if (act.k === 'rr') {
        beam(act.i, false, color);
        beam(act.i, true, color);
        sounds('combo');
        shake(0.8);
      } else if (act.k === 'rb') {
        for (let d = -1; d <= 1; d++) {
          if (y + d >= 0 && y + d < state.rows) beam(act.i + d * state.cols, false, color);
          if (x + d >= 0 && x + d < state.cols) beam(act.i + d, true, color);
        }
        ring(act.i, color, 2.5);
        sounds('combo');
        shake(1.2);
      } else if (act.k === 'b' || act.k === 'bb') {
        const big = act.k === 'bb';
        ring(act.i, color, big ? 4.5 : 2.5, big ? 0.6 : 0.45);
        ring(act.i, '#fff3b0', big ? 3 : 1.6, 0.3);
        burst(act.i, '#ffcf6b', big ? 26 : 14, { speed: big ? 1.8 : 1.3, size: 1.2 });
        sounds(big ? 'combo' : 'bomb');
        shake(big ? 1.6 : 1);
      } else if (act.k === 'p' || act.k === 'pp') {
        sounds('propeller');
        const targets = act.targets?.length ? act.targets : act.target >= 0 ? [act.target] : [];
        for (const t of targets) jobs.push(flyPropeller(act, t));
      } else if (act.k === 'x' || act.k === 'xn' || act.k === 'xs' || act.k === 'xx') {
        sounds(act.k === 'xx' ? 'combo' : 'prism');
        const from = fxPoint(x, y);
        const cells = act.k === 'xx' ? [] : (act.turned?.map((t) => t.i) ?? act.cells).slice(0, 24);
        for (const j of cells) {
          const q = posOf(j);
          const to = fxPoint(q.x, q.y);
          rings.push({ bolt: true, x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: COLORS[act.color] ?? '#fff', t: 0, life: 0.4 });
        }
        if (act.k === 'xx') {
          ring(act.i, '#ffffff', 9, 0.7);
          shake(1.8);
        }
        for (const t of act.turned ?? []) {
          const v = view.pieces.get(t.id);
          if (v) v.k = t.k;
        }
        kick();
      }
    }
    if (ph.combo) shake(0.6);
    if (ph.activations.length) await wait(ph.activations.some((a) => a.k === 'p' || a.k === 'pp') ? 60 : 140);

    // удары по препятствиям
    for (const b of ph.blocks) {
      const prev = view.block[b.i];
      const color = b.t === 'slime' ? '#7bd23f' : b.t === 'steel' ? '#c7d0dc' : '#c58a45';
      burst(b.i, color, b.hp ? 5 : 12, { size: 1.3 });
      if (b.hp) view.block[b.i] = { ...(prev ?? { t: b.t }), hp: b.hp };
      else {
        view.block[b.i] = null;
        if (prev && (b.t === 'crate' || b.t === 'steel')) fly({ k: 'box' }, b.i, 'box');
        if (prev && b.t === 'slime') fly({ k: 'slime' }, b.i, 'slime');
      }
    }
    if (ph.blocks.length) sounds(ph.blocks.some((b) => b.t === 'slime') ? 'slime' : ph.blocks.some((b) => b.t === 'steel') ? 'steel' : 'crate');
    for (const e of ph.ice) {
      burst(e.i, '#d6f6ff', 6, { size: 1.1 });
      view.ice[e.i] = e.v;
    }
    if (ph.ice.length) sounds('ice');
    for (const e of ph.chains) {
      burst(e.i, '#c9d0dc', 6);
      const p = state.pieces[e.i];
      const v = p && view.pieces.get(p.id);
      if (v) v.lock = e.v;
    }
    if (ph.chains.length) sounds('chain');

    // фишки лопаются волной от места срабатывания
    const originPts = origins.map(posOf);
    const createdAt = new Map(ph.created.map((c) => [c.i, c]));
    for (const r of ph.removed) {
      const v = view.pieces.get(r.id);
      if (!v) continue;
      const pos = posOf(r.i);
      const dist = originPts.length ? Math.min(...originPts.map((o) => Math.hypot(o.x - pos.x, o.y - pos.y))) : 0;
      const delay = Math.min(260, dist * 32);
      if (r.into && createdAt.has(r.i)) continue;      // на этом месте рождается спецфишка
      jobs.push(tween(200, (k) => {
        v.s = k < 0.35 ? 1 + k * 0.7 : Math.max(0, 1.25 * (1 - (k - 0.35) / 0.65));
        v.a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      }, { delay, easing: ease.lin }).then(() => {
        view.pieces.delete(r.id);
      }));
      setTimeout(() => {
        if (!alive) return;
        if (r.c !== undefined && COLORS[r.c]) burst(r.i, COLORS[r.c], 6);
        if (r.c !== undefined) fly(r, r.i, 'color');
      }, reducedMotion() ? 0 : delay + 60);
    }
    for (const c of ph.created) {
      const group = ph.removed.filter((r) => r.into && r.i === c.i);
      for (const r of group) view.pieces.delete(r.id);
    }
    if (ph.removed.length) sounds('pop', { step: ph.cascade });
    await Promise.all(jobs);

    // новые спецфишки впрыгивают
    if (ph.created.length) {
      sounds('create');
      const pops = ph.created.map((c) => {
        const { x, y } = posOf(c.i);
        const v = makeView(c.piece, x, y);
        v.s = 0;
        view.pieces.set(c.piece.id, v);
        ring(c.i, COLORS[c.piece.c] ?? '#fff', 1.1, 0.35);
        return tween(260, (k) => { v.s = k; }, { easing: ease.back });
      });
      await Promise.all(pops);
    }
  }

  async function flyPropeller(act, target) {
    const from = posOf(act.i);
    const to = posOf(target);
    const temp = { id: `fly${Math.random()}`, k: act.carry ?? 'p', c: act.c, lock: 0, timer: 0, x: from.x, y: from.y, s: 1, a: 1, sq: 0, dy: 0, spin: 0, top: true };
    view.pieces.set(temp.id, temp);
    const lift = Math.max(1.2, Math.hypot(to.x - from.x, to.y - from.y) * 0.35);
    await tween(420, (k) => {
      temp.x = from.x + (to.x - from.x) * k;
      temp.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * lift;
      temp.s = 1 + Math.sin(k * Math.PI) * 0.35;
      temp.spin += 0.5;
    }, { easing: ease.inOut });
    view.pieces.delete(temp.id);
    burst(target, COLORS[act.c] ?? '#fff', 10, { speed: 1.2 });
    ring(target, '#ffffff', 0.9, 0.3);
  }

  async function playFall(ph, sounds) {
    const jobs = [];
    let maxDist = 0;
    for (const m of ph.moves) {
      const v = view.pieces.get(m.id);
      if (!v) continue;
      const from = posOf(m.from);
      const to = posOf(m.to);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      maxDist = Math.max(maxDist, dist);
      jobs.push(fall(v, from, to, dist));
    }
    for (const sp of ph.spawns) {
      const to = posOf(sp.to);
      // появляется над верхней клеткой своего столбца
      const from = { x: to.x, y: 0 };
      let top = 0;
      for (let r = 0; r < state.rows; r++) if (view.cells[r * state.cols + to.x]) { top = r; break; }
      from.y = top - sp.depth;
      const v = makeView(sp.piece, from.x, from.y);
      view.pieces.set(sp.id, v);
      jobs.push(fall(v, from, to, to.y - from.y));
    }
    if (jobs.length) {
      await Promise.all(jobs);
      sounds('land', { step: Math.min(8, Math.round(maxDist)) });
    }
  }

  function fall(v, from, to, dist) {
    const dur = 110 + Math.sqrt(Math.max(0, dist)) * 85;
    return tween(dur, (k) => {
      v.x = from.x + (to.x - from.x) * k;
      v.y = from.y + (to.y - from.y) * k;
    }, { easing: ease.in }).then(() => tween(140, (k) => {
      v.sq = Math.sin(k * Math.PI) * (1 - k) * 0.18;            // приземление с «приседанием»
    }, { easing: ease.lin }));
  }

  async function playCollect(ph, sounds) {
    sounds('treasure');
    await Promise.all(ph.removed.map(async (r) => {
      const v = view.pieces.get(r.id);
      if (!v) return;
      fly({ k: 't' }, r.i, 'treasure');
      burst(r.i, '#ffd34d', 12, { speed: 1.2 });
      await tween(220, (k) => {
        v.s = 1 + k * 0.3;
        v.a = 1 - k;
      });
      view.pieces.delete(r.id);
    }));
  }

  async function playEnd(ph, sounds) {
    for (const t of ph.timers) {
      const p = state.pieces[t.i];
      const v = p && view.pieces.get(p.id);
      if (!v) continue;
      v.timer = t.v;
      tween(260, (k) => { v.s = 1 + Math.sin(k * Math.PI) * 0.18; });
    }
    if (ph.timers.some((t) => t.v <= 3)) sounds('tick');
    if (ph.slime) {
      const v = view.pieces.get(ph.slime.id);
      sounds('grow');
      if (v) await tween(260, (k) => { v.s = 1 - k; v.a = 1 - k; });
      view.pieces.delete(ph.slime.id);
      view.block[ph.slime.to] = { t: 'slime', hp: 1 };
      burst(ph.slime.to, '#7bd23f', 8);
    }
    if (ph.shuffle) await playShuffle(ph.shuffle, sounds);
  }

  async function playShuffle(sh, sounds) {
    sounds('shuffle');
    await Promise.all(sh.moves.map((m) => {
      const v = view.pieces.get(m.id);
      if (!v) return null;
      const from = posOf(m.from);
      const to = posOf(m.to);
      const mid = { x: (state.cols - 1) / 2, y: (state.rows - 1) / 2 };
      return tween(520, (k) => {
        const pull = Math.sin(k * Math.PI) * 0.55;
        v.x = from.x + (to.x - from.x) * k + (mid.x - (from.x + to.x) / 2) * pull;
        v.y = from.y + (to.y - from.y) * k + (mid.y - (from.y + to.y) / 2) * pull;
        v.s = 1 - Math.sin(k * Math.PI) * 0.3;
        v.c = k > 0.5 && m.c !== undefined ? m.c : v.c;
      }, { easing: ease.inOut });
    }));
  }

  async function playBonus(ph, sounds) {
    const v = view.pieces.get(ph.id);
    sounds('bonus', { step: ph.left });
    if (v) {
      v.k = ph.k;
      ring(ph.i, '#fff6b0', 0.9, 0.3);
      await tween(160, (k) => { v.s = 1 + Math.sin(k * Math.PI) * 0.3; });
    }
  }

  /** Сыграть фазу хода. sounds(name, opts) — звук. */
  async function play(ph, sounds = () => {}) {
    if (!ph || !state) return;
    if (ph.t === 'swap') await playSwap(ph);
    else if (ph.t === 'bad') await playSwap(ph, true);
    else if (ph.t === 'clear') await playClear(ph, sounds);
    else if (ph.t === 'fall') await playFall(ph, sounds);
    else if (ph.t === 'collect') await playCollect(ph, sounds);
    else if (ph.t === 'end') await playEnd(ph, sounds);
    else if (ph.t === 'shuffle') await playShuffle(ph, sounds);
    else if (ph.t === 'bonus') await playBonus(ph, sounds);
  }

  /** Поле появляется: фишки падают сверху волной. */
  async function intro() {
    if (!state) return;
    const jobs = [];
    for (const v of view.pieces.values()) {
      const to = { x: v.x, y: v.y };
      const from = { x: v.x, y: v.y - state.rows - 1 };
      v.y = from.y;
      jobs.push(tween(420 + to.y * 30, (k) => { v.y = from.y + (to.y - from.y) * k; }, { delay: to.x * 30 + (state.rows - to.y) * 18, easing: ease.back }));
    }
    await Promise.all(jobs);
  }

  // ---------- кадр ----------

  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    // анимации
    for (let k = tweens.length - 1; k >= 0; k--) {
      const tw = tweens[k];
      if (now < tw.t0) continue;
      const p = tw.dur <= 1 ? 1 : clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.easing(p));
      if (p >= 1) {
        tweens.splice(k, 1);
        tw.resolve();
      }
    }
    draw(now / 1000, dt);
    schedule();
  }

  function schedule() {
    if (raf || !alive) return;
    last = last || performance.now();
    raf = requestAnimationFrame(frame);
    // в свёрнутой вкладке и в headless rAF может не прийти — страхуемся таймером
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!raf || !alive) return;
      cancelAnimationFrame(raf);
      raf = 0;
      frame(performance.now());
    }, 250);
  }

  function kick() {
    schedule();
  }

  function draw(t, dt) {
    if (!state || !W) return;
    if (!bg) buildBg();
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, board.width, board.height);
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      sx = (Math.random() - 0.5) * cs * 0.25 * (shakeT / 0.3);
      sy = (Math.random() - 0.5) * cs * 0.25 * (shakeT / 0.3);
    }
    bc.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    bc.drawImage(bg, 0, 0, W, H);

    // лёд
    for (let i = 0; i < view.ice.length; i++) {
      if (!view.ice[i] || !view.cells[i]) continue;
      const s = sprite(`ice${view.ice[i]}`, (c) => drawIce(c, view.ice[i]));
      const { x, y } = posOf(i);
      bc.drawImage(s, cx(x) - cs * 0.575, cy(y) - cs * 0.575, cs * 1.15, cs * 1.15);
    }

    // подсказка и выбор — под фишками
    const glow = (i, color, alpha) => {
      const { x, y } = posOf(i);
      bc.save();
      bc.globalAlpha = alpha;
      bc.fillStyle = color;
      roundRect(bc, ox + x * cs + 2, oy + y * cs + 2, cs - 4, cs - 4, cs * 0.2);
      bc.fill();
      bc.restore();
    };
    if (selected >= 0) glow(selected, '#ffffff', 0.45 + Math.sin(t * 8) * 0.1);
    if (hintPair) for (const i of hintPair) glow(i, '#fff7a8', 0.25 + (Math.sin(t * 5) + 1) * 0.18);

    // препятствия
    for (let i = 0; i < view.block.length; i++) {
      const b = view.block[i];
      if (!b) continue;
      const { x, y } = posOf(i);
      bc.save();
      bc.translate(cx(x), cy(y));
      bc.scale(cs, cs);
      if (b.t === 'slime') drawSlime(bc, t, i);
      else {
        bc.restore();
        const s = sprite(`b${b.t}${b.hp}`, (c) => (b.t === 'steel' ? drawSteel(c, b.hp) : drawCrate(c, b.hp)));
        bc.drawImage(s, cx(x) - cs * 0.575, cy(y) - cs * 0.575, cs * 1.15, cs * 1.15);
        continue;
      }
      bc.restore();
    }

    // фишки: сначала обычные, потом летящие (пропеллер) поверх
    const list = [...view.pieces.values()].sort((a, b) => (a.top ? 1 : 0) - (b.top ? 1 : 0) || a.y - b.y);
    bc.save();
    // всё, что выше поля (новые фишки), не рисуем над ним
    bc.beginPath();
    bc.rect(0, oy - cs * 0.1, W, H);
    bc.clip();
    for (const v of list) drawPieceView(v, t);
    bc.restore();

    drawFx(dt, t);
  }

  function drawPieceView(v, t) {
    if (v.a <= 0 || v.s <= 0) return;
    const px = cx(v.x);
    const py = cy(v.y) + v.dy * cs;
    const s = v.s;
    const w = cs * s * (1 + v.sq);
    const h = cs * s * (1 - v.sq);
    bc.save();
    bc.globalAlpha = v.a;
    bc.translate(px, py + (cs - h) * 0.4);
    if (v.k === 'x') {
      bc.scale(w, h);
      drawPrism(bc, t * 1.4 + (v.spin ?? 0));
    } else {
      const sp = pieceSprite(v);
      bc.drawImage(sp, -w * 0.575, -h * 0.575, w * 1.15, h * 1.15);
      bc.scale(w, h);
      if (v.k === 'p') drawBlades(bc, t * 6 + (v.spin ?? 0));
      if (v.k === 'b') {
        // искра на фитиле
        const f = 0.5 + Math.sin(t * 20 + v.id) * 0.5;
        bc.fillStyle = `rgba(255,${180 + f * 60},60,${0.7 + f * 0.3})`;
        bc.beginPath();
        bc.arc(0.18, -0.46, 0.05 + f * 0.03, 0, Math.PI * 2);
        bc.fill();
      }
      if (v.lock) drawChains(bc, v.lock);
      if (v.timer) drawTimer(bc, v.timer);
    }
    bc.restore();
  }

  function drawFx(dt, t) {
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, fx.width, fx.height);
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    // кольца, лучи, молнии
    for (let k = rings.length - 1; k >= 0; k--) {
      const r = rings[k];
      r.t += dt;
      const q = r.t / r.life;
      if (q >= 1) {
        rings.splice(k, 1);
        continue;
      }
      fc.save();
      if (r.beam) {
        const alpha = q < 0.25 ? 1 : 1 - (q - 0.25) / 0.75;
        const thick = cs * (0.9 - q * 0.5);
        fc.globalAlpha = alpha;
        fc.shadowColor = r.color;
        fc.shadowBlur = 20;
        fc.fillStyle = r.color;
        const grow = Math.min(1, q * 4);
        if (r.vertical) {
          const len = r.len * grow;
          fc.fillRect(r.x - thick / 2, r.y - len / 2, thick, len);
          fc.fillStyle = '#fff';
          fc.fillRect(r.x - thick / 5, r.y - len / 2, thick / 2.5, len);
        } else {
          const len = r.len * grow;
          fc.fillRect(r.x - len / 2, r.y - thick / 2, len, thick);
          fc.fillStyle = '#fff';
          fc.fillRect(r.x - len / 2, r.y - thick / 5, len, thick / 2.5);
        }
      } else if (r.bolt) {
        fc.globalAlpha = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        fc.strokeStyle = '#fff';
        fc.shadowColor = r.color;
        fc.shadowBlur = 14;
        fc.lineWidth = 2.5;
        fc.beginPath();
        const n = 6;
        for (let s = 0; s <= n; s++) {
          const k2 = s / n;
          const jx = s && s < n ? (Math.random() - 0.5) * cs * 0.35 : 0;
          const jy = s && s < n ? (Math.random() - 0.5) * cs * 0.35 : 0;
          const x = r.x1 + (r.x2 - r.x1) * k2 + jx;
          const y = r.y1 + (r.y2 - r.y1) * k2 + jy;
          s ? fc.lineTo(x, y) : fc.moveTo(x, y);
        }
        fc.stroke();
      } else {
        fc.globalAlpha = 1 - q;
        fc.strokeStyle = r.color;
        fc.lineWidth = cs * 0.22 * (1 - q) + 1;
        fc.shadowColor = r.color;
        fc.shadowBlur = 16;
        fc.beginPath();
        fc.arc(r.x, r.y, r.radius * ease.out(q), 0, Math.PI * 2);
        fc.stroke();
      }
      fc.restore();
    }
    // частицы
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.t += dt;
      if (p.t >= p.life) {
        particles.splice(k, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 8;
      fc.save();
      fc.globalAlpha = 1 - p.t / p.life;
      fc.translate(p.x, p.y);
      fc.rotate(p.rot);
      fc.fillStyle = p.color;
      const s = p.size * (1 - (p.t / p.life) * 0.4);
      if (p.shape === 0) fc.fillRect(-s / 2, -s / 2, s, s);
      else {
        fc.beginPath();
        if (p.shape === 1) fc.arc(0, 0, s / 2, 0, Math.PI * 2);
        else {
          fc.moveTo(0, -s * 0.7);
          fc.lineTo(s * 0.6, s * 0.5);
          fc.lineTo(-s * 0.6, s * 0.5);
        }
        fc.fill();
      }
      fc.restore();
    }
    // собранное летит к целям
    for (let k = flights.length - 1; k >= 0; k--) {
      const f = flights[k];
      f.t += dt;
      const q = clamp(f.t / f.life, 0, 1);
      const e = ease.inOut(q);
      const x = f.from.x + (f.to.x - f.from.x) * e;
      const y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(q * Math.PI) * cs * 1.4;
      const size = cs * (1 - q * 0.45);
      fc.save();
      fc.translate(x, y);
      fc.globalAlpha = q > 0.85 ? 1 - (q - 0.85) / 0.15 : 1;
      if (f.p.k === 'box') {
        fc.scale(size, size);
        drawCrate(fc, 1);
      } else if (f.p.k === 'slime') {
        fc.scale(size, size);
        drawSlime(fc, t, 1);
      } else if (f.p.k === 't') {
        fc.scale(size, size);
        drawChest(fc);
      } else {
        const sp = pieceSprite({ k: 'n', c: f.p.c });
        fc.drawImage(sp, -size * 0.575, -size * 0.575, size * 1.15, size * 1.15);
      }
      fc.restore();
      if (q >= 1) {
        flights.splice(k, 1);
        f.onDone?.();
      }
    }
  }

  // ---------- наружу ----------

  return {
    sync,
    play,
    intro,
    layout: () => {
      layout();
      kick();
    },
    cellAt,
    icon: makeIcon,
    cellSize: () => cs,
    select(i) {
      selected = i;
      kick();
    },
    hint(pair) {
      hintPair = pair;
      kick();
    },
    /** Центр клетки в координатах страницы (для всплывающих «+очки»). */
    cellPoint(i) {
      const rect = board.getBoundingClientRect();
      const { x, y } = posOf(i);
      return { x: rect.left + cx(x), y: rect.top + cy(y) };
    },
    burst,
    ring,
    shake,
    confettiAt(i) {
      for (let k = 0; k < 6; k++) burst(i, COLORS[k], 6, { speed: 1.6 });
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      tweens.forEach((tw) => tw.resolve());
      tweens.length = 0;
    },
  };
}
