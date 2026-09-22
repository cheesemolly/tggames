// Flappy Burger — пиксельная графика: всё рисуется в буфер W×H (160×256 игровых пикселей) и увеличивается без
// сглаживания в целое число экранных пикселей. Кухня (вытяжки и плиты) ↔ ночная улица (мусорные баки) через двери.
// Нажатие / пробел — взмах. Забег не сохраняется (он короткий); статистика — в api.storage игры.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import {
  W, H, GROUND, PLAY_H, BURGER_X, BURGER_W, BURGER_H, MAX_FALL, FLAP, OB_W,
  newGame, step, flap, sceneAt, obstacleRects, emptyStats, recordGame, isValidStats,
} from './logic.js';

const T = {
  title: 'Flappy Burger',
  best: (n) => `Рекорд: ${n}`,
  tap: 'Коснись, чтобы взлететь',
  street: 'На улицу!',
  kitchen: 'Обратно на кухню!',
  over: 'Игра окончена',
  result: (n) => `Пролетел препятствий: ${n}`,
  share: (n) => `🍔 Flappy Burger: ${n}`,
  stats: { open: 'Статистика', title: 'Статистика', games: 'Игр', best: 'Рекорд', total: 'Всего препятствий', streets: 'Выходов на улицу', close: 'Закрыть' },
};

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">${body}</svg>`;
const ICON_STATS = svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;
let stats = emptyStats();
let raf = 0;
let rafAt = 0;
let lastFrame = 0;
let finished = false;
let particles = [];                // { x, y, vx, vy, c, t, life }
let flashT = -1;                   // вспышка удара (время s.t)
let shakeT = -1;
let scorePopT = -1;
let modalActive = false;
let modalToken = 0;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// ---------- пиксельные примитивы ----------

let lc = null;                     // контекст буфера W×H

function px(x, y, w, h, color) {
  lc.fillStyle = color;
  lc.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Детерминированный «случайный» номер для узоров фона (чтобы фон не мерцал между кадрами). */
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// шрифт 3×5: цифры и буквы вывесок
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  E: '111100111100111', X: '101101010101101', I: '111010010010111', T: '111010010010010', B: '110101110101110',
  U: '101101101101111', R: '110101110101101', G: '111100101101111',
};

function pixelText(str, x, y, scale, color, outline = null) {
  const glyph = (ch, gx, gy, col) => {
    const bits = FONT[ch];
    if (!bits) return;
    for (let i = 0; i < 15; i++) if (bits[i] === '1') px(gx + (i % 3) * scale, gy + Math.floor(i / 3) * scale, scale, scale, col);
  };
  const width = str.length * 4 * scale - scale;
  let cx = Math.round(x - width / 2);
  for (const ch of str) {
    if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) glyph(ch, cx + dx, y + dy, outline);
    glyph(ch, cx, y, color);
    cx += 4 * scale;
  }
}

// ---------- бургер ----------

// 16×12, «.» — прозрачно. Верхняя булка с кунжутом и глазами, салат, сыр с помидором, котлета, нижняя булка.
const BURGER = [
  '....oooooooo....',
  '..ooOOsOOOOsoo..',
  '.oOOOOOOOsOOOOo.',
  '.oOsOOOwwOOwwOo.',
  'oOOOOOOwkOOwkOOo',
  'gGgGgGgGgGgGgGgG',
  'rrryyyyyyyyyyrrr',
  '..y..yY...y..Y..',
  'bbbbbbbbbbbbbbbb',
  'bBbbBbbbBbbBbbBb',
  'oOOOOOOOOOOOOOOo',
  '.oooooooooooooo.',
];
const PAL = {
  o: '#6b3a12', O: '#e89a3c', s: '#fff3c4', w: '#ffffff', k: '#1b1b1b', g: '#2f8f2f', G: '#58c24a',
  y: '#ffd23f', Y: '#e6a800', r: '#d94040', b: '#5a2e1a', B: '#7a4028',
};
// крыло-лист салата: три кадра взмаха
const WINGS = [
  ['..gG', '.gGG', 'gGG.'],
  ['gGGG', 'gGG.', '....'],
  ['....', 'gGG.', 'gGGG'],
];

const sprites = [];
function burgerSprites() {
  if (sprites.length) return sprites;
  for (const wing of WINGS) {
    const c = document.createElement('canvas');
    c.width = 20;
    c.height = 12;
    const x = c.getContext('2d');
    const put = (rows, ox, oy) => rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      x.fillStyle = PAL[ch];
      x.fillRect(ox + rx, oy + ry, 1, 1);
    }));
    put(BURGER, 4, 0);
    put(wing, 0, 4);
    sprites.push(c);
  }
  return sprites;
}

function drawBurger(s) {
  const frames = burgerSprites();
  const sinceFlap = s.t - s.flapT;
  let frame = 0;
  if (s.phase === 'ready') frame = Math.floor(s.t * 6) % 3;
  else if (s.phase === 'play' && sinceFlap < 0.3) frame = 1 + (Math.floor(sinceFlap * 20) % 2);
  // наклон как в Flappy Bird: вверх после взмаха, носом вниз при падении
  let angle = 0;
  if (s.phase !== 'ready') {
    const k = (s.vy - FLAP) / (MAX_FALL - FLAP);
    angle = (-25 + Math.max(0, Math.min(1, k)) * 105) * (Math.PI / 180);
  }
  lc.save();
  lc.translate(Math.round(BURGER_X + BURGER_W / 2), Math.round(s.y + BURGER_H / 2));
  lc.rotate(angle);
  lc.drawImage(frames[frame], -12, -6);
  lc.restore();
}

// ---------- фон: кухня ----------

function kitchenBackground(scroll, t) {
  // стена в плитку
  const o0 = Math.floor(scroll * 0.2);
  px(0, 0, W, PLAY_H, '#efe0c2');
  for (let x = -(o0 % 12); x < W; x += 12) px(x, 0, 1, PLAY_H, '#dccba6');
  for (let y = 8; y < PLAY_H; y += 12) px(0, y, W, 1, '#dccba6');
  // верхние шкафы, карниз, рейлинг с поварёшками
  const o1 = Math.floor(scroll * 0.45);
  px(0, 10, W, 4, '#7b4a24');
  for (let base = -(o1 % 56) - 56; base < W; base += 56) {
    px(base + 3, 14, 50, 30, '#7b4a24');
    px(base + 4, 15, 23, 28, '#9c6234');
    px(base + 29, 15, 23, 28, '#9c6234');
    px(base + 7, 18, 17, 22, '#b0733f');
    px(base + 32, 18, 17, 22, '#b0733f');
    px(base + 24, 34, 2, 3, '#ffd98a');
    px(base + 30, 34, 2, 3, '#ffd98a');
  }
  px(0, 54, W, 1, '#6c6c6c');
  for (let base = -(o1 % 56) - 28; base < W; base += 56) {
    const n = Math.floor((base + o1) / 56);
    if (hash(n) < 0.5) {
      px(base + 10, 55, 1, 8, '#6c6c6c');                       // поварёшка
      px(base + 8, 63, 5, 3, '#8f969c');
    } else {
      px(base + 12, 55, 1, 5, '#6c6c6c');                       // сковородка
      px(base + 6, 60, 13, 3, '#2b2b2b');
      px(base + 7, 63, 11, 1, '#454545');
    }
  }
  // дальний стол: столешница, шкафчики, банки и холодильник
  const o2 = Math.floor(scroll * 0.6);
  const topY = PLAY_H - 38;
  px(0, topY, W, 4, '#b8c2cc');
  px(0, topY, W, 1, '#e3e8ec');
  px(0, topY + 4, W, PLAY_H - topY - 4, '#8d6a4a');
  for (let x = -(o2 % 35); x < W; x += 35) {
    px(x, topY + 4, 1, PLAY_H - topY - 4, '#6e5037');
    px(x + 15, topY + 12, 4, 2, '#d8b98a');
  }
  for (let base = -(o2 % 70) - 70; base < W; base += 70) {
    const n = Math.floor((base + o2) / 70);
    if (hash(n * 7) < 0.3) {
      px(base + 4, PLAY_H - 92, 30, 92, '#aab4bd');                // холодильник
      px(base + 5, PLAY_H - 91, 28, 90, '#e8eef2');
      px(base + 5, PLAY_H - 60, 28, 1, '#aab4bd');
      px(base + 28, PLAY_H - 84, 2, 14, '#9aa3ab');
      px(base + 28, PLAY_H - 54, 2, 18, '#9aa3ab');
      px(base + 10, PLAY_H - 86, 6, 5, hash(n) < 0.5 ? '#ff6b6b' : '#6bc5ff'); // магнитик
    } else {
      px(base + 10, topY - 9, 6, 9, ['#e05555', '#4c9be0', '#e0b34c'][((n % 3) + 3) % 3]);
      px(base + 10, topY - 11, 6, 2, '#5b5b5b');
      px(base + 20, topY - 6, 8, 6, '#fafafa');
      px(base + 21, topY - 5, 6, 1, '#c9c9c9');
    }
  }
  void t;
}

function kitchenGround(scroll) {
  const o = Math.floor(scroll);
  px(0, PLAY_H, W, 2, '#3a3a3a');
  for (let y = PLAY_H + 2, row = 0; y < H; y += 8, row++) {
    for (let x = -(o % 16) - 16; x < W; x += 8) {
      const col = Math.floor((x + o) / 8) + row;
      px(x, y, 8, 8, col % 2 === 0 ? '#f2f2f2' : '#2b2b2b');
    }
  }
}

// ---------- фон: ночная улица ----------

function streetBackground(scroll, t) {
  // небо полосами (пиксельный градиент), звёзды, луна
  const bands = ['#0a0f2c', '#0d1335', '#10173d', '#131b45', '#171f4d', '#1b2455'];
  const bh = Math.ceil(PLAY_H / bands.length);
  bands.forEach((c, i) => px(0, i * bh, W, bh, c));
  const os = Math.floor(scroll * 0.05);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash(i * 3) * 400) - os;
    const sx = ((x % 400) + 400) % 400;
    if (sx >= W) continue;
    const y = Math.floor(hash(i * 3 + 1) * 110);
    const tw = Math.sin(t * 3 + i) > 0.6;
    px(sx, y, 1, 1, tw ? '#ffffff' : '#9aa5d6');
  }
  px(118, 22, 12, 12, '#f5f1d0');
  px(116, 24, 16, 8, '#f5f1d0');
  px(120, 20, 8, 16, '#f5f1d0');
  px(121, 25, 3, 3, '#d9d3a8');
  px(126, 29, 2, 2, '#d9d3a8');
  // дальние дома с окнами
  const o1 = Math.floor(scroll * 0.2);
  for (let base = -(o1 % 34) - 34, n = Math.floor(o1 / 34) - 1; base < W; base += 34, n++) {
    const h = 60 + Math.floor(hash(n) * 70);
    px(base, PLAY_H - h, 32, h, '#161d44');
    for (let wy = PLAY_H - h + 6; wy < PLAY_H - 8; wy += 8) {
      for (let wx = base + 4; wx < base + 30; wx += 7) {
        const lit = hash(n * 97 + wx * 13 + wy) < 0.35;
        px(wx, wy, 3, 4, lit ? '#f7d56a' : '#232b5c');
      }
    }
  }
  // ближние кирпичные стены, пожарные лестницы, фонари
  const o2 = Math.floor(scroll * 0.45);
  for (let base = -(o2 % 64) - 64, n = Math.floor(o2 / 64) - 1; base < W; base += 64, n++) {
    const h = 70 + Math.floor(hash(n * 5 + 1) * 40);
    px(base, PLAY_H - h, 62, h, '#3d2b3f');
    for (let y = PLAY_H - h + 3; y < PLAY_H; y += 5) {
      px(base, y, 62, 1, '#2f2031');
      for (let x = base + ((y / 5) % 2 ? 4 : 0); x < base + 62; x += 9) px(x, y, 1, 5, '#2f2031');
    }
    // окно и пожарная лестница
    px(base + 10, PLAY_H - h + 12, 12, 14, '#1b1422');
    px(base + 11, PLAY_H - h + 13, 10, 12, hash(n * 11) < 0.5 ? '#f2c14e' : '#2a2f55');
    for (let k = 0; k < 3; k++) {
      const y = PLAY_H - h + 30 + k * 16;
      if (y > PLAY_H - 10) break;
      px(base + 30, y, 26, 1, '#15151b');
      px(base + 30 + (k % 2 ? 0 : 20), y, 6, 16, 'rgba(20, 20, 27, 0.9)');
    }
  }
  // фонари с конусом света
  for (let base = -(o2 % 96) + 40; base < W + 40; base += 96) {
    px(base, PLAY_H - 64, 2, 64, '#2a2a33');
    px(base - 4, PLAY_H - 66, 10, 3, '#2a2a33');
    px(base - 2, PLAY_H - 63, 6, 2, '#ffe8a0');
    lc.fillStyle = 'rgba(255, 232, 160, 0.10)';
    lc.beginPath();
    lc.moveTo(base - 2, PLAY_H - 61);
    lc.lineTo(base + 4, PLAY_H - 61);
    lc.lineTo(base + 20, PLAY_H);
    lc.lineTo(base - 18, PLAY_H);
    lc.fill();
  }
}

function streetGround(scroll) {
  const o = Math.floor(scroll);
  px(0, PLAY_H, W, 10, '#56586a');
  px(0, PLAY_H, W, 1, '#7a7c8f');
  for (let x = -(o % 16); x < W; x += 16) px(x, PLAY_H + 1, 1, 9, '#46485a');
  px(0, PLAY_H + 10, W, 2, '#3a3b48');
  px(0, PLAY_H + 12, W, H - PLAY_H - 12, '#24252e');
  for (let x = -(o % 24); x < W; x += 24) px(x, PLAY_H + 19, 12, 2, '#c9a227');
}

// ---------- препятствия ----------

/** Бургер-булочка 6×4 (для стойки с булками). */
function bun(x, y) {
  px(x + 1, y, 4, 1, '#f5c07a');
  px(x, y + 1, 6, 2, '#e89a3c');
  px(x + 1, y + 3, 4, 1, '#b8702a');
  px(x + 2, y + 1, 1, 1, '#fff3c4');
  px(x + 4, y + 2, 1, 1, '#fff3c4');
}

/** Одна часть препятствия (прямоугольник из obstacleRects) — своим рисунком. */
function drawPart(ox, ob, r, t) {
  const x = ox + r.x;
  const { y, w, h } = r;
  switch (r.part) {
    // --- кухня: вытяжка и плита
    case 'duct':
      px(x, y, w, h, '#aeb7bf');
      px(x, y, 2, h, '#d8dee3');
      px(x + w - 2, y, 2, h, '#7f8891');
      for (let yy = y + h - 6; yy > y; yy -= 14) px(x, yy, w, 1, '#8e979f');
      break;
    case 'hood-top':
      px(x, y, w, h, '#c5ccd2');
      px(x, y, w, 1, '#e6ebee');
      px(x, y, 1, h, '#8e979f');
      px(x + w - 1, y, 1, h, '#8e979f');
      break;
    case 'hood':
      px(x, y, w, h, '#b4bcc3');
      px(x, y, w, 1, '#e6ebee');
      for (let k = 4; k < w - 4; k += 4) px(x + k, y + 3, 2, 3, '#8e979f');
      px(x, y + h - 2, w, 2, '#4a5158');
      px(x + 5, y + h - 1, 3, 1, '#fff2a0');
      px(x + w - 8, y + h - 1, 3, 1, '#fff2a0');
      lc.fillStyle = 'rgba(255, 242, 160, 0.13)';
      lc.fillRect(x + 3, y + h, w - 6, 10);                    // свет лампы — картинка, не препятствие
      break;
    case 'stove': {
      px(x, y, w, Math.min(3, h), '#3a3f45');
      const glow = Math.sin(t * 6 + ox) > 0 ? '#ff6a3a' : '#d24a2a';
      px(x + 4, y + 1, 7, 1, glow);
      px(x + w - 11, y + 1, 7, 1, glow);
      if (h > 3) {
        px(x, y + 3, w, h - 3, '#9aa3ab');
        px(x + 1, y + 3, w - 2, h - 4, '#e3e6e9');
        for (let k = 0; 4 + k * 6 + 3 <= w - 2; k++) px(x + 4 + k * 6, y + 5, 3, 2, '#3a3f45');
        if (h > 22) {
          px(x + 4, y + 10, w - 8, 1, '#9aa3ab');
          px(x + 4, y + 13, w - 8, Math.min(12, h - 16), '#2b2f36');
          px(x + 6, y + 15, w - 12, Math.max(0, Math.min(8, h - 20)), '#ff9d3a');
        }
      }
      break;
    }
    // --- кухня: подвесной шкафчик и холодильник
    case 'rod':
      px(x, y, w, h, '#6c6c6c');
      px(x, y, 1, h, '#8f969c');
      break;
    case 'cabinet': {
      const half = Math.floor((w - 3) / 2);
      px(x, y, w, h, '#7b4a24');
      px(x + 1, y + 1, half, h - 2, '#9c6234');
      px(x + 2 + half, y + 1, w - 3 - half, h - 2, '#9c6234');
      px(x + 3, y + 3, half - 4, h - 6, '#b0733f');
      px(x + 4 + half, y + 3, w - 7 - half, h - 6, '#b0733f');
      px(x + half, y + h - 7, 1, 3, '#ffd98a');
      px(x + half + 3, y + h - 7, 1, 3, '#ffd98a');
      break;
    }
    case 'fridge':
      px(x, y, w, h, '#aab4bd');
      px(x + 1, y + 1, w - 2, h - 2, '#e8eef2');
      px(x + 1, y + 1, 2, h - 2, '#ffffff');
      px(x + 1, y + 18, w - 2, 1, '#aab4bd');                 // морозилка сверху
      px(x + w - 5, y + 5, 2, 9, '#9aa3ab');
      if (h > 26) px(x + w - 5, y + 22, 2, Math.min(16, h - 26), '#9aa3ab');
      px(x + 6, y + 6, 4, 4, '#ff6b6b');                       // магнитики
      px(x + 12, y + 8, 3, 3, '#6bc5ff');
      if (h > 30) px(x + 6, y + 24, 7, 5, '#fff7a8');          // записка
      if (h > 6) px(x + 1, y + h - 3, w - 2, 2, '#6f7880');
      break;
    // --- кухня: лампа и стойка с булками
    case 'lamp':
      px(x + w / 2 - 4, y, 8, 2, '#a83228');
      px(x + w / 2 - 7, y + 2, 14, 3, '#c0392b');
      px(x, y + 5, w, 4, '#c0392b');
      px(x, y + 5, w, 1, '#e0584a');
      px(x, y + 9, w, 1, '#7d231b');
      px(x + w / 2 - 2, y + 9, 4, 1, '#fff2a0');
      lc.fillStyle = 'rgba(255, 220, 140, 0.14)';
      lc.beginPath();
      lc.moveTo(x + 4, y + 10);
      lc.lineTo(x + w - 4, y + 10);
      lc.lineTo(x + w + 2, y + 26);
      lc.lineTo(x - 2, y + 26);
      lc.fill();
      break;
    case 'rack':
      px(x, y, 2, h, '#8e979f');
      px(x + w - 2, y, 2, h, '#8e979f');
      for (let yy = y; yy < y + h - 4; yy += 14) {
        px(x, yy + 5, w, 2, '#b8c2cc');
        for (let k = 0; 3 + k * 8 + 6 <= w - 2; k++) bun(x + 3 + k * 8, yy + 1);
      }
      break;
    // --- улица: мусорные баки
    case 'lid':
    case 'lid-down':
    case 'bin':
    case 'bin-down': {
      const colors = [['#3e7f55', '#2f6b46', '#25563a', '#5fae78'], ['#6c7a8f', '#56657a', '#46536a', '#8c9ab0']];
      const [lid, body, rib, light] = colors[(r.k + (ob.gapY >> 3)) % 2];
      if (r.part === 'lid' || r.part === 'lid-down') {
        px(x, y, w, h, lid);
        px(x, r.part === 'lid' ? y : y + h - 1, w, 1, light);
      } else {
        px(x, y, w, h, body);
        px(x, y, 2, h, light);
        for (let k = 5; k < w - 2; k += 5) px(x + k, y + 1, 1, Math.max(0, h - 2), rib);
        if (h > 8) px(x + w / 2 - 3, y + Math.floor(h / 2) - 1, 6, 3, rib);
      }
      break;
    }
    // --- улица: рекламный щит и небоскрёб
    case 'rope':
      px(x, y, w, h, '#2a2a33');
      break;
    case 'billboard': {
      const on = Math.sin(t * 7 + ox) > -0.7;
      px(x, y, w, h, '#1c1c24');
      px(x + 1, y + 1, w - 2, h - 2, '#2d1b3d');
      pixelText('BURGER', x + w / 2, y + 5, 1, on ? '#ff8a3d' : '#8a4a24');
      px(x + 3, y + 13, w - 6, 1, on ? '#ff5d8f' : '#6a2a44');
      px(x + 6, y + 16, w - 12, 2, '#ffd23f');
      break;
    }
    case 'tower': {
      px(x, y, w, h, '#1a2147');
      px(x + 1, y + 2, w - 2, h - 2, '#2b3566');
      px(x, y, w, 2, '#3a4680');                                // карниз крыши
      px(x + 2, y + 2, 2, h - 2, '#36417a');
      for (let yy = y + 5; yy < y + h - 2; yy += 6) {
        for (let k = 0; 4 + k * 6 + 3 <= w - 2; k++) {
          const lit = hash(Math.floor(ob.x) * 31 + yy * 7 + k) < 0.45;
          px(x + 4 + k * 6, yy, 3, 3, lit ? '#ffd86b' : '#3a4680');
        }
      }
      break;
    }
    // --- улица: светофор и фонарный столб
    case 'pole-top':
    case 'pole':
      px(x, y, w, h, '#2e2f3a');
      px(x + 1, y, 1, h, '#4a4c5c');
      break;
    case 'traffic': {
      px(x, y, w, h, '#1c1c24');
      px(x + 1, y + 1, w - 2, h - 2, '#2a2a33');
      const phase = Math.floor(t / 1.2) % 3;
      const lights = [['#ff4040', '#4a1a1a'], ['#ffc83d', '#4a3a12'], ['#3ddc84', '#123a24']];
      lights.forEach(([onColor, offColor], k) => {
        px(x + 4, y + 2 + k * 8, 6, 6, phase === k ? onColor : offColor);
      });
      break;
    }
    case 'lamp-head':
      px(x, y, w, h, '#3a3b48');
      px(x, y, w, 1, '#56586a');
      px(x + 8, y + h - 1, 8, 1, '#ffe8a0');
      lc.fillStyle = 'rgba(255, 232, 160, 0.16)';
      lc.fillRect(x + 4, y - 8, w - 8, 8);                       // свет вверх — картинка
      break;
    default:
      break;
  }
}

/** Кирпичная кладка прямоугольником (фон). */
function bricks(x, y, w, h, base, mortar) {
  px(x, y, w, h, base);
  for (let yy = y + 3; yy < y + h; yy += 5) {
    px(x, yy, w, 1, mortar);
    for (let k = (Math.floor(yy / 5) % 2) * 3; k < w; k += 7) px(x + k, yy - 4, 1, 4, mortar);
  }
}

// ---------- диагональные препятствия: ступенчатые «кучи» с наполнением ----------

/** Узоры наполнения; координаты плиток привязаны к левому краю препятствия — при прокрутке узор не «плывёт». */
function kitchenCondiments(x0, y0, w, h, seed) {
  // открытая картонная коробка: внутри ряды бутылок кетчупа и горчицы и пачки салфеток
  px(x0, y0, w, h, '#8a5f33');
  for (let x = x0 + 5; x < x0 + w; x += 10) px(x, y0, 1, h, '#7a522b');           // сгибы картона
  for (let y = y0 + h - 13, row = 0; y > y0 - 13; y -= 13, row++) {
    px(x0, y + 12, w, 1, '#6b4726');                                             // перегородка
    for (let dx = 1, k = 0; dx < w - 3; k++) {
      const kind = Math.floor(hash(seed + k * 13 + row * 101) * 3);          // выбор — от места в коробке
      const x = x0 + dx;
      if (kind === 2) {
        // пачка салфеток
        px(x, y + 5, 6, 7, '#f4f4f4');
        px(x, y + 5, 6, 1, '#ffffff');
        px(x, y + 8, 6, 1, '#4c9be0');
        px(x + 5, y + 5, 1, 7, '#d9d9d9');
        dx += 7;
      } else {
        // бутылка: кетчуп (красная, белая крышка) или горчица (жёлтая, красная крышка)
        const [body, shade, cap] = kind === 0 ? ['#d93030', '#a01f1f', '#f4f4f4'] : ['#ffd23f', '#d4a90f', '#d93030'];
        px(x + 1, y + 1, 1, 2, cap);                                             // носик
        px(x, y + 3, 3, 1, cap);
        px(x, y + 4, 3, 8, body);
        px(x + 2, y + 4, 1, 8, shade);
        px(x, y + 6, 1, 3, 'rgba(255, 255, 255, 0.5)');
        dx += 4;
      }
    }
  }
}

/**
 * Минибар (низ кухонной диагонали): на ступеньках — винный стеллаж с лежащими бутылками, ниже (где полная
 * ширина) — тёмный лакированный корпус с приоткрытой дверцей: из щели тёплый свет и горлышки бутылок,
 * на дверце — бокал вина.
 */
function miniBar(x0, y0, w, h, seed, fullTop) {
  // стеллаж на ступеньках
  px(x0, y0, w, h, '#3b2231');
  for (let y = y0 + 1, row = 0; y < fullTop; y += 6, row++) {
    px(x0, y + 5, w, 1, '#2a1622');
    for (let x = x0 + 1 + (row % 2) * 3, k = 0; x < x0 + w - 3; x += 6, k++) {
      const red = hash(seed + k * 7 + row * 19) < 0.5;
      px(x, y, 4, 4, red ? '#5a1020' : '#1f3d22');
      px(x + 1, y + 1, 2, 2, red ? '#8a2035' : '#2f5c34');
      px(x + 1, y + 1, 1, 1, '#c0c8b0');
    }
  }
  // корпус
  const by = Math.max(y0, fullTop);
  const bh = y0 + h - by;
  if (bh < 8) return;
  px(x0, by, w, bh, '#4a2a3c');
  px(x0, by, w, 2, '#6b3f55');                                              // столешница
  px(x0, by + 2, w, 1, '#2a1622');
  // приоткрытая дверца: смещена влево, справа щель со светом и бутылками внутри
  const dx = x0 + 3;
  const dw = w - 9;
  const dy = by + 5;
  const dh = bh - 8;
  if (dh < 10) return;
  px(dx + dw, dy, 4, dh, '#ffe9b0');
  for (let y = dy + 2, k = 0; y < dy + dh - 6; y += 9, k++) {
    px(dx + dw + 1, y, 2, 6, k % 2 ? '#1f3d22' : '#5a1020');                 // бутылки внутри
    px(dx + dw + 1, y, 2, 1, '#c9a24a');
  }
  px(dx, dy, dw, dh, '#5c3449');
  px(dx, dy, dw, 1, '#7a4a62');
  px(dx, dy, 1, dh, '#7a4a62');
  px(dx + dw - 1, dy, 1, dh, '#2a1622');
  px(dx + dw - 4, dy + Math.floor(dh / 2) - 3, 1, 6, '#c9a24a');            // ручка
  // бокал вина на дверце
  const gx = dx + Math.floor(dw / 2) - 3;
  const gy = dy + Math.min(6, Math.floor(dh / 4));
  px(gx, gy, 6, 1, '#f4f4f4');
  px(gx, gy + 1, 1, 3, '#f4f4f4');
  px(gx + 5, gy + 1, 1, 3, '#f4f4f4');
  px(gx + 1, gy + 2, 4, 2, '#c0203a');
  px(gx + 1, gy + 4, 4, 1, '#f4f4f4');
  px(gx + 2, gy + 5, 2, 3, '#f4f4f4');
  px(gx + 1, gy + 8, 4, 1, '#f4f4f4');
}

function streetWindows(x0, y0, w, h, seed) {
  // угол дома: кирпич и окна (часть горит)
  px(x0, y0, w, h, '#4a2f3f');
  for (let y = y0 + 3; y < y0 + h; y += 5) px(x0, y, w, 1, '#3a2332');
  for (let y = y0 + h - 14, row = 0; y > y0 - 10; y -= 12, row++) {
    for (let x = x0 + 2, k = 0; x < x0 + w - 4; x += 8, k++) {
      const lit = hash(seed + k * 29 + row * 11) < 0.45;
      px(x - 1, y - 1, 6, 8, '#2a1a26');
      px(x, y, 4, 6, lit ? '#ffd86b' : '#262b4f');
      if (lit) px(x, y, 4, 1, '#fff1b0');
    }
  }
}

function streetJunk(x0, y0, w, h, seed) {
  // куча коробок и мусорных мешков
  for (let row = 0, y = y0 + h - 9; y > y0 - 9; row++, y -= 9) {
    for (let x = x0 - (row % 2) * 6; x < x0 + w; x += 12) {
      if (hash(seed + (x - x0) * 7 + row * 3) < 0.3) {
        px(x, y + 1, 12, 8, '#1f1f26');                             // мешок
        px(x + 2, y, 8, 2, '#1f1f26');
        px(x + 3, y + 2, 2, 3, '#3a3a46');
        px(x + 5, y - 1, 2, 1, '#2a2a33');
      } else {
        px(x, y, 12, 9, '#8a5f33');                                  // коробка
        px(x + 1, y + 1, 10, 7, '#b8844a');
        px(x + 5, y + 1, 2, 7, '#d9c28a');                           // скотч
        px(x + 1, y + 1, 10, 1, '#caa06a');
      }
    }
  }
}

/** Ступенчатая часть (верх или низ): клип по ступенькам хитбокса, узор внутри, кромка вдоль ступенек. */
function drawDiagonal(ox, ob, t) {
  const rects = obstacleRects(ob);
  const seed = Math.floor(ob.x);
  for (const part of ['diag-top', 'diag-bottom']) {
    const steps = rects.filter((r) => r.part === part);
    if (!steps.length) continue;
    lc.save();
    lc.beginPath();
    for (const r of steps) lc.rect(ox + r.x, r.y, r.w, r.h);
    lc.clip();
    const y0 = Math.min(...steps.map((r) => r.y));
    const y1 = Math.max(...steps.map((r) => r.y + r.h));
    const fill = ob.scene === 'kitchen'
      ? (part === 'diag-top' ? kitchenCondiments : miniBar)
      : (part === 'diag-top' ? streetWindows : streetJunk);
    // fullTop — ниже него часть на всю ширину (у низа — верх самой низкой ступеньки)
    const fullTop = Math.max(...steps.map((r) => r.y));
    fill(ox, y0, ob.w, y1 - y0, seed + (part === 'diag-top' ? 0 : 999), fullTop);
    lc.restore();
    // кромка вдоль ступенек
    for (const r of steps) {
      const x = ox + r.x;
      if (part === 'diag-top') {
        if (ob.scene === 'kitchen') {
          px(x, r.y + r.h - 3, r.w, 3, '#d9a86a');                   // край коробки — клапан
          px(x, r.y + r.h - 1, r.w, 1, '#a8773f');
          if (r.i % 2 === 0) px(x + 1, r.y + r.h - 3, 1, 2, '#c4905a');
        } else {
          // неоновая трубка по краю дома
          const on = Math.sin(t * 5 + r.i * 0.6) > -0.4;
          px(x, r.y + r.h - 2, r.w, 2, on ? '#ff4fa3' : '#8a2a5a');
          lc.fillStyle = on ? 'rgba(255, 79, 163, 0.18)' : 'rgba(255, 79, 163, 0.05)';
          lc.fillRect(x, r.y + r.h, r.w, 4);
        }
      } else if (ob.scene === 'kitchen') {
        px(x, r.y, r.w, 1, '#8a5a72');
      } else {
        px(x, r.y, r.w, 1, '#d9c28a');
      }
    }
  }
}

function drawObstacle(ox, ob, t) {
  if (ob.type === 'door') {
    return;                                   // стена-переход рисуется поверх бургера (drawWallFront)
  }
  if (ob.slope !== undefined && (ob.type === 'chute' || ob.type === 'stairs')) {
    drawDiagonal(ox, ob, t);
    return;
  }
  for (const r of obstacleRects(ob)) drawPart(ox, ob, r, t);
}

/**
 * Стена-переход между сценами — целиком поверх бургера: толстый кирпичный блок на всю высоту (сама стена
 * OB_W + фасад здания ещё на WALL_EXTRA px с уличной стороны) и вывеска. Бургер скрывается за стеной на всю
 * её толщину и выныривает с другой стороны. Хитбокс — прежний: стена над проходом (obstacleRects 'wall').
 */
const WALL_EXTRA = 34;
function wallBlock(ox, ob) {
  const toStreet = ob.to === 'street';
  return toStreet ? [ox, OB_W + WALL_EXTRA] : [ox - WALL_EXTRA, OB_W + WALL_EXTRA];
}

function drawWallFront(ox, ob, t) {
  const toStreet = ob.to === 'street';
  const [x, w] = wallBlock(ox, ob);
  bricks(x, 0, w, PLAY_H, toStreet ? '#8a4b3a' : '#5a2e2e', toStreet ? '#6d3a2d' : '#442222');
  // со стороны кухни — штукатурка, с уличной — тень угла здания
  if (toStreet) {
    px(x, 0, 3, PLAY_H, '#efe0c2');
    lc.fillStyle = 'rgba(0, 0, 0, 0.25)';
    lc.fillRect(x + w - 4, 0, 4, PLAY_H);
  } else {
    lc.fillStyle = 'rgba(0, 0, 0, 0.25)';
    lc.fillRect(x, 0, 4, PLAY_H);
    px(x + w - 3, 0, 3, PLAY_H, '#efe0c2');
  }
  // вывеска — над проходом
  const top = ob.gapY - ob.gap / 2;
  const mid = ox + OB_W / 2;
  if (toStreet) {
    px(mid - 11, top - 17, 22, 10, '#1f9d4a');
    px(mid - 11, top - 17, 22, 1, '#5fd88a');
    pixelText('EXIT', mid, top - 14, 1, '#ffffff');
  } else {
    const on = Math.sin(t * 8) > -0.6;
    px(mid - 13, top - 18, 26, 10, '#1a1020');
    pixelText('BURGER', mid, top - 15, 1, on ? '#ff8a3d' : '#7a3d1a');
  }
}


// ---------- кадр ----------

function drawScene(scene, scroll, t) {
  if (scene === 'street') streetBackground(scroll, t);
  else kitchenBackground(scroll, t);
}

function drawGround(scene, scroll) {
  if (scene === 'street') streetGround(scroll);
  else kitchenGround(scroll);
}

/** Отрезки экрана по сценам: дверь делит экран на «до» и «после». */
function segments(s, scroll) {
  const cuts = s.gates.map((g) => Math.round(g.x) - scroll).filter((x) => x > 0 && x < W).sort((a, b) => a - b);
  const out = [];
  let x0 = 0;
  for (const x of [...cuts, W]) {
    out.push([x0, x, sceneAt(s, scroll + (x0 + x) / 2)]);
    x0 = x;
  }
  return out;
}

function render() {
  const s = game;
  if (!s || !ui) return;
  // всё на экране — от одной ЦЕЛОЙ прокрутки: стены дверей и граница фона сцен совпадают до пикселя
  // (раньше граница шла по дробной координате, а стена — по округлённой: на стыке мерцала полоска)
  const d = Math.round(s.dist);
  const scroll = d + Math.round(s.idle);
  const segs = segments(s, d);
  for (const [x0, x1, scene] of segs) {
    lc.save();
    lc.beginPath();
    lc.rect(Math.floor(x0), 0, Math.ceil(x1 - x0), H);
    lc.clip();
    drawScene(scene, scroll, s.t);
    lc.restore();
  }
  for (const o of s.obstacles) {
    const ox = Math.round(o.x) - d;
    if (ox > W || ox + o.w < 0) continue;
    drawObstacle(ox, o, s.t);
  }
  for (const [x0, x1, scene] of segs) {
    lc.save();
    lc.beginPath();
    lc.rect(Math.floor(x0), PLAY_H, Math.ceil(x1 - x0), GROUND);
    lc.clip();
    drawGround(scene, scroll);
    lc.restore();
  }
  // крошки
  for (const p of particles) px(p.x, p.y, 1, 1, p.c);
  drawBurger(s);
  // стены-переходы — целиком поверх бургера
  for (const o of s.obstacles) {
    const ox = Math.round(o.x) - d;
    if (o.type === 'door' && ox - WALL_EXTRA < W && ox + OB_W + WALL_EXTRA > 0) drawWallFront(ox, o, s.t);
  }
  // счёт пиксельными цифрами
  if (s.phase !== 'ready') {
    const lift = s.t - scorePopT < 0.12 ? 2 : 0;
    pixelText(String(s.score), W / 2, 14 - lift, 3, '#ffffff', '#3b2412');
  }
  // вспышка удара
  if (flashT >= 0 && s.t - flashT < 0.3) {
    lc.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - (s.t - flashT) / 0.3)})`;
    lc.fillRect(0, 0, W, H);
  }
  // вывод на экран: целое число экранных пикселей на игровой пиксель, тряска после удара
  const c = ui.ctx;
  c.imageSmoothingEnabled = false;
  let dx = 0;
  let dy = 0;
  if (shakeT >= 0 && s.t - shakeT < 0.3) {
    dx = Math.round((Math.random() - 0.5) * 4) * ui.scale;
    dy = Math.round((Math.random() - 0.5) * 4) * ui.scale;
  }
  c.drawImage(ui.low, dx, dy, ui.canvas.width, ui.canvas.height);
}

function resize() {
  const box = ui.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // экранных пикселей на игровой: целое, чтобы все «пиксели» были одного размера
  // во всю доступную площадь: экранных пикселей на игровой — сколько влезает. Если целое число почти не
  // теряет места (≥ 95%) — берём целое (все пиксели одинаковые), иначе дробное: на экранах с плотностью ×2–×3
  // разница в пиксель незаметна (раньше всегда брали целое — на айфоне игра была маленьким окошком)
  const fit = Math.min(box.width / W, box.height / H) * dpr;
  ui.scale = Math.floor(fit) >= fit * 0.95 ? Math.floor(fit) : fit;
  ui.canvas.width = Math.max(1, Math.round(W * ui.scale));
  ui.canvas.height = Math.max(1, Math.round(H * ui.scale));
  ui.canvas.style.width = `${ui.canvas.width / dpr}px`;
  ui.canvas.style.height = `${ui.canvas.height / dpr}px`;
  render();
}

// ---------- цикл ----------

function loop(now) {
  raf = 0;
  if (!ui || !game) return;
  const dt = Math.min(1 / 30, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (!modalActive) {
    const events = step(game, dt);
    for (const e of events) onEvent(e);
    // крошки падают и гаснут
    particles = particles.filter((p) => {
      p.t += dt;
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.t < p.life && p.y < PLAY_H;
    });
  }
  render();
  if (game.phase !== 'over' || particles.length || game.t - flashT < 0.4) {
    rafAt = now;
    raf = requestAnimationFrame(loop);
  }
}

function kick() {
  if (!ui) return;
  const now = performance.now();
  if (raf && now - rafAt < 250) return;
  cancelAnimationFrame(raf);
  lastFrame = now;
  rafAt = now;
  raf = requestAnimationFrame(loop);
}

function crumbs(n, colors, speed) {
  if (reducedMotion()) return;
  for (let k = 0; k < n; k++) {
    particles.push({
      x: BURGER_X + 2 + Math.random() * 10, y: game.y + BURGER_H - 2,
      vx: -20 - Math.random() * speed, vy: -Math.random() * speed, c: colors[k % colors.length], t: 0, life: 0.5 + Math.random() * 0.4,
    });
  }
}

function onEvent(e) {
  if (e === 'score') {
    scorePopT = game.t;
    api.platform.haptic.selection();
  } else if (e === 'gate') {
    const toStreet = sceneAt(game, game.dist + BURGER_X) === 'street';
    toast.show(toStreet ? T.street : T.kitchen, 1400);
  } else if (e === 'hit') {
    flashT = game.t;
    shakeT = game.t;
    api.platform.haptic.notification('error');
    crumbs(14, ['#e89a3c', '#58c24a', '#ffd23f', '#5a2e1a', '#fff3c4'], 90);
  } else if (e === 'over') {
    if (flashT < 0) {
      flashT = game.t;
      shakeT = game.t;
      api.platform.haptic.notification('error');
    }
    gameOver();
  }
}

function onFlap() {
  if (!game || modalActive || finished) return;
  if (game.phase === 'ready') ui.hint.classList.add('fb-hint-hide');
  if (flap(game)) {
    api.platform.haptic.impact('light');
    crumbs(3, ['#fff3c4', '#58c24a', '#e89a3c'], 30);
    kick();
  }
}

function gameOver() {
  if (finished) return;
  finished = true;
  const score = game.score;
  const isBest = score > stats.best;
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  ui.sub.textContent = T.best(stats.best);
  later(() => api?.finish({
    outcome: 'lose', title: T.over, score, locale: 'ru', message: T.result(score) + (isBest && score > 0 ? ' — новый рекорд!' : ''),
    share: T.share(score),
  }), reducedMotion() ? 0 : 900);
}

// ---------- окна ----------

function openModal(content) {
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  kick();
}

function showStats() {
  const item = (value, label) => el('div', { class: 'fb-stat' }, el('div', { class: 'fb-stat-value' }, value), el('div', { class: 'fb-stat-label' }, label));
  openModal(el('div', { class: 'fb-card', role: 'dialog', 'aria-label': T.stats.title },
    el('div', { class: 'fb-card-head' },
      el('h2', {}, T.stats.title),
      el('button', { class: 'fb-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    el('div', { class: 'fb-stats-grid' },
      item(stats.best, T.stats.best), item(stats.games, T.stats.games),
      item(stats.total, T.stats.total), item(stats.streets, T.stats.streets),
    ),
  ));
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if ((e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && !e.repeat) {
    e.preventDefault();
    onFlap();
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') kick();
}

export default {
  id: 'flappy-burger',
  title: 'Flappy Burger',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const savedStats = await api.storage.get('stats');
    if (!api) return;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();

    ui = {
      sub: el('div', { class: 'fb-sub' }, T.best(stats.best)),
      canvas: el('canvas', { class: 'fb-canvas' }),
      hint: el('div', { class: 'fb-hint' }, el('span', { class: 'fb-hint-hand' }, '👆'), T.tap),
      modal: el('div', { class: 'fb-modal', hidden: true }),
      low: document.createElement('canvas'),
    };
    ui.low.width = W;
    ui.low.height = H;
    lc = ui.low.getContext('2d');
    lc.imageSmoothingEnabled = false;
    ui.ctx = ui.canvas.getContext('2d');
    ui.stage = el('div', { class: 'fb-stage' }, ui.canvas, ui.hint);
    const statsButton = el('button', { class: 'fb-icon-btn', 'aria-label': T.stats.open, title: T.stats.open, onclick: showStats });
    statsButton.innerHTML = ICON_STATS;

    root = el('div', { class: 'fb' },
      el('div', { class: 'fb-header' },
        el('div', {}, el('div', { class: 'fb-title' }, T.title), ui.sub),
        el('div', { class: 'fb-actions' }, statsButton),
      ),
      ui.stage,
      ui.modal,
      toast.el,
    );
    container.append(root);
    ui.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      onFlap();
    });
    // iOS: частые тапы не должны приближать страницу
    ui.stage.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);

    game = newGame();
    finished = false;
    // для проверки из Claude (страница-обёртка с автопилотом): ?fbdebug в адресе
    if (new URLSearchParams(location.search).has('fbdebug')) window.__flappy = { get game() { return game; }, flap: onFlap };
    ui.resizeObserver = new ResizeObserver(() => resize());
    ui.resizeObserver.observe(ui.stage);
    pop(ui.hint, { from: 0.8, duration: 400 });
    kick();
  },

  getState() {
    return null;                   // забег короткий — не сохраняем
  },

  destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    ui?.resizeObserver?.disconnect();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = game = lc = null;
    particles = [];
    flashT = shakeT = scorePopT = -1;
    finished = false;
    modalActive = false;
  },
};
