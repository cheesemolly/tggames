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

/** Стена с дверным проёмом (препятствие-переход между сценами). */
function drawDoorWall(ox, ob, t) {
  const top = ob.gapY - ob.gap / 2;
  const toStreet = ob.to === 'street';
  const x = ox;
  if (toStreet) {
    // кирпичная стена кухни, стальная притолока, табличка EXIT
    px(x, 0, OB_W, top, '#8a4b3a');
    for (let yy = 3; yy < top; yy += 5) {
      px(x, yy, OB_W, 1, '#6d3a2d');
      for (let k = (yy / 5) % 2 ? 3 : 0; k < OB_W; k += 7) px(x + k, yy - 4, 1, 4, '#6d3a2d');
    }
    px(x, 0, 3, top, '#efe0c2');                                 // штукатурка со стороны кухни
    px(x, top - 4, OB_W, 4, '#5a5f66');
    px(x, top - 4, OB_W, 1, '#8a9099');
    px(x + 3, top - 17, 22, 10, '#1f9d4a');
    px(x + 3, top - 17, 22, 1, '#5fd88a');
    pixelText('EXIT', x + 14, top - 14, 1, '#ffffff');
  } else {
    // стена ресторана: тёмный кирпич, неон, полосатый козырёк
    px(x, 0, OB_W, top, '#5a2e2e');
    for (let yy = 3; yy < top; yy += 5) {
      px(x, yy, OB_W, 1, '#442222');
      for (let k = (yy / 5) % 2 ? 3 : 0; k < OB_W; k += 7) px(x + k, yy - 4, 1, 4, '#442222');
    }
    const on = Math.sin(t * 8) > -0.6;
    px(x + 1, top - 26, 26, 10, '#1a1020');
    pixelText('BURGER', x + 14, top - 23, 1, on ? '#ff8a3d' : '#7a3d1a');
    for (let k = 0; k < OB_W; k += 4) px(x + k, top - 7, 4, 7, (k / 4) % 2 ? '#ffffff' : '#d93b3b');
    px(x, top - 1, OB_W, 1, '#8a2020');
  }
  // тень косяков и порог
  lc.fillStyle = 'rgba(0, 0, 0, 0.35)';
  lc.fillRect(x, top, 2, PLAY_H - top);
  lc.fillRect(x + OB_W - 2, top, 2, PLAY_H - top);
  px(x, PLAY_H - 2, OB_W, 2, toStreet ? '#5a5f66' : '#6b4a2a');
}

/** Кирпичная кладка прямоугольником (фон). */
function bricks(x, y, w, h, base, mortar) {
  px(x, y, w, h, base);
  for (let yy = y + 3; yy < y + h; yy += 5) {
    px(x, yy, w, 1, mortar);
    for (let k = (Math.floor(yy / 5) % 2) * 3; k < w; k += 7) px(x + k, yy - 4, 1, 4, mortar);
  }
}

/**
 * Фасад здания за дверью и открытая створка — в плоскости фона (за бургером, не препятствие). Раньше за рамой
 * был виден фон города — теперь кирпичная стена здания; сам проём — тот же кирпич в тени (проход сквозь стену).
 */
function drawDoorLeaf(ox, ob) {
  const top = ob.gapY - ob.gap / 2 + 2;
  const x = ox + OB_W;
  const h = PLAY_H - top - 2;
  const toStreet = ob.to === 'street';
  bricks(ox, 0, OB_W + 34, PLAY_H, toStreet ? '#8a4b3a' : '#5a2e2e', toStreet ? '#6d3a2d' : '#442222');
  lc.fillStyle = 'rgba(0, 0, 0, 0.45)';
  lc.fillRect(ox, top - 2, OB_W, PLAY_H - top + 2);
  lc.fillStyle = 'rgba(0, 0, 0, 0.25)';
  lc.fillRect(ox + OB_W + 30, 0, 4, PLAY_H);                   // угол здания
  if (ob.to === 'street') {
    // металлическая дверь запасного выхода с «антипаникой» и окошком
    px(x, top, 22, h, '#3f5a66');
    px(x + 1, top + 1, 20, h - 2, '#5f7f8e');
    px(x + 1, top + 1, 2, h - 2, '#86a6b4');
    px(x + 6, top + 10, 10, 14, '#2a3c44');
    px(x + 7, top + 11, 8, 12, '#9fd3ff');
    px(x + 8, top + 12, 2, 5, '#d8f0ff');
    px(x + 3, top + Math.floor(h * 0.55), 16, 3, '#c9d1d6');
    px(x + 3, top + Math.floor(h * 0.55) + 3, 16, 1, '#7d8a90');
  } else {
    // деревянная дверь ресторана с иллюминатором
    px(x, top, 22, h, '#5a3519');
    px(x + 1, top + 1, 20, h - 2, '#9c6234');
    px(x + 1, top + 1, 2, h - 2, '#b8804a');
    px(x + 6, top + 8, 10, 10, '#5a3519');
    px(x + 7, top + 9, 8, 8, '#ffcf7a');
    px(x + 8, top + 10, 2, 3, '#fff1c8');
    px(x + 4, top + 26, 14, Math.max(0, h - 34), '#8a5429');
    px(x + 16, top + Math.floor(h * 0.55), 3, 2, '#ffd98a');
  }
}

// ---------- диагональные препятствия: ступенчатые «кучи» с наполнением ----------

/** Узоры наполнения; координаты плиток привязаны к левому краю препятствия — при прокрутке узор не «плывёт». */
function kitchenShelves(x0, y0, w, h, seed) {
  // стеллаж: тёмная задняя стенка, полки каждые 12 px, на полках банки и бутылки
  px(x0, y0, w, h, '#4e3420');
  const jars = [['#e05555', '#8a2a2a'], ['#ffd23f', '#a88a10'], ['#f2f2f2', '#9aa3ab'], ['#4c9be0', '#2a5a8a'], ['#6fbf4a', '#3a7a2a']];
  for (let y = y0 + h - 12; y > y0 - 12; y -= 12) {
    px(x0, y + 10, w, 2, '#9c6234');
    for (let x = x0 + 1, k = 0; x < x0 + w - 3; x += 5, k++) {
      const [c, d] = jars[Math.floor(hash(seed + k * 13 + y * 7) * jars.length)];
      const tall = hash(seed + k * 5 + y) < 0.5 ? 7 : 5;
      px(x, y + 10 - tall, 4, tall, c);
      px(x, y + 10 - tall, 4, 1, d);
      px(x + 1, y + 11 - tall, 1, tall - 2, 'rgba(255,255,255,0.45)');
    }
  }
}

function kitchenCrates(x0, y0, w, h, seed) {
  // деревянные ящики со снедью (кирпичной кладкой): булки, помидоры, салат
  const fills = [['#e89a3c', '#f5c07a'], ['#d94040', '#ff7a7a'], ['#58c24a', '#8fe07a']];
  for (let row = 0, y = y0 + h - 10; y > y0 - 10; row++, y -= 10) {
    for (let x = x0 - (row % 2) * 7; x < x0 + w; x += 14) {
      px(x, y, 14, 10, '#6b4a2a');
      px(x + 1, y + 1, 12, 8, '#9c6234');
      const [c, l] = fills[Math.floor(hash(seed + x * 3 + row * 17) * fills.length)];
      for (let k = 0; k < 3; k++) {
        px(x + 2 + k * 4, y + 2, 3, 3, c);
        px(x + 2 + k * 4, y + 2, 1, 1, l);
      }
      px(x + 1, y + 6, 12, 1, '#7b4a24');                          // доска
      px(x + 1, y + 8, 12, 1, '#7b4a24');
    }
  }
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
      if (hash(seed + x * 7 + row * 3) < 0.3) {
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
      ? (part === 'diag-top' ? kitchenShelves : kitchenCrates)
      : (part === 'diag-top' ? streetWindows : streetJunk);
    fill(ox, y0, ob.w, y1 - y0, seed + (part === 'diag-top' ? 0 : 999));
    lc.restore();
    // кромка вдоль ступенек
    for (const r of steps) {
      const x = ox + r.x;
      if (part === 'diag-top') {
        if (ob.scene === 'kitchen') {
          px(x, r.y + r.h - 2, r.w, 2, '#b8c2cc');                   // стальной край полки
          px(x, r.y + r.h - 1, r.w, 1, '#7f8891');
        } else {
          // неоновая трубка по краю дома
          const on = Math.sin(t * 5 + r.i * 0.6) > -0.4;
          px(x, r.y + r.h - 2, r.w, 2, on ? '#ff4fa3' : '#8a2a5a');
          lc.fillStyle = on ? 'rgba(255, 79, 163, 0.18)' : 'rgba(255, 79, 163, 0.05)';
          lc.fillRect(x, r.y + r.h, r.w, 4);
        }
      } else if (ob.scene === 'kitchen') {
        px(x, r.y, r.w, 1, '#caa06a');
      } else {
        px(x, r.y, r.w, 1, '#d9c28a');
      }
    }
  }
}

function drawObstacle(ox, ob, t) {
  if (ob.type === 'door') {
    drawDoorWall(ox, ob, t);
    return;
  }
  if (ob.slope !== undefined && (ob.type === 'chute' || ob.type === 'stairs')) {
    drawDiagonal(ox, ob, t);
    return;
  }
  for (const r of obstacleRects(ob)) drawPart(ox, ob, r, t);
}

/**
 * Передний слой двери — наличники и нижняя кромка притолоки поверх бургера: он пролетает между задним слоем
 * (фасад и тень проёма) и передним, как сквозь дверной проём.
 */
function drawDoorFront(ox, ob) {
  const top = ob.gapY - ob.gap / 2;
  const toStreet = ob.to === 'street';
  const casing = toStreet ? '#5a5f66' : '#6b4a2a';
  const light = toStreet ? '#8a9099' : '#9c6234';
  px(ox - 2, top - 2, 5, PLAY_H - top + 2, casing);
  px(ox - 2, top - 2, 1, PLAY_H - top + 2, light);
  px(ox + OB_W - 3, top - 2, 5, PLAY_H - top + 2, casing);
  px(ox + OB_W - 3, top - 2, 1, PLAY_H - top + 2, light);
  px(ox - 2, top - 2, OB_W + 4, 3, casing);
  px(ox - 2, top - 2, OB_W + 4, 1, light);
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
  // открытые створки дверей — в плоскости фона
  for (const o of s.obstacles) {
    const ox = Math.round(o.x) - d;
    if (o.type === 'door' && ox < W && ox + OB_W + 34 > 0) drawDoorLeaf(ox, o);
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
  // передний слой дверей — поверх бургера
  for (const o of s.obstacles) {
    const ox = Math.round(o.x) - d;
    if (o.type === 'door' && ox < W + 4 && ox + OB_W + 4 > 0) drawDoorFront(ox, o);
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
