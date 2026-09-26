// Brick Blast (по видео владельца): прицелься пальцем по полю или ползунком под ним, отпусти — шарики летят
// очередью, отскакивают и разбивают блоки с числами. После хода уровень опускается на ряд; блок дошёл до
// нижнего ряда — уровень не пройден. Бонусы-кольца: лазеры (ряд / столбец / крест), ×3 шарика, разброс.
// Поле рисуется на Canvas (шариков бывает несколько сотен). Партия, статистика, скин — в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  COLS, ROWS, BALL_R, POWER_R, MIN_ANGLE, newLevel, startTurn, step, recall, endTurn, danger, tracePath, aimAngle,
  polygon, progress, isValidState, normalizeState, emptyStats, isValidStats, LASER_LIFE, LASERS,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'neon', 'candy', 'forest', 'graphite'];
const FIELD_H = ROWS + 0.55;            // поле + полоска под линией запуска (шарик и «×60»)
const T = {
  title: 'Brick Blast',
  level: (n) => `Уровень ${n}`,
  aimHelp: 'Проведи по полю или по ползунку, чтобы прицелиться, отпусти — бросок',
  cancel: 'Отпусти здесь — отмена',
  recall: 'Вернуть шарики',
  triple: '×3 шарика на следующий бросок!',
  danger: 'Разбей блоки, пока они не дошли до низа',
  wonTitle: 'Отлично!',
  completed: (n) => `Уровень ${n} пройден`,
  wonInfo: (turns, bricks) => `Ходов: ${turns} · Блоков разбито: ${bricks}`,
  next: (n) => `Уровень ${n}`,
  loseTitle: 'Блоки дошли до низа',
  loseMessage: (n) => `Уровень ${n} — попробуй ещё раз`,
  restart: 'Заново',
  restartQuestion: 'Начать этот уровень заново?',
  cancelBtn: 'Отмена',
  newLevel: 'Начать уровень заново',
  levels: 'Уровни',
  levelsTitle: 'Выбор уровня',
  levelsNote: 'Открыты пройденные уровни и следующий. Текущая попытка сбросится.',
  stats: {
    open: 'Статистика', title: 'Статистика', level: 'Уровень', cleared: 'Пройдено', bestLevel: 'Лучший уровень',
    bricks: 'Разбито блоков', shots: 'Бросков', fails: 'Неудач', close: 'Закрыть',
  },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', close: 'Закрыть' },
  skins: { telegram: 'По умолчанию', classic: 'Классика', neon: 'Неон', candy: 'Конфета', forest: 'Лес', graphite: 'Графит' },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  levels: svgIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  recall: svgIcon('<circle cx="12" cy="6" r="2.5" fill="currentColor" stroke="none"/><path d="M12 11v9"/><path d="m8 16 4 4 4-4"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram' };
let phase = 'aim';                 // aim | fly | shift | won | lost
let sim = null;
let aim = null;                    // { angle, cancel, source: 'field' | 'slider', pointerId }
let angle = Math.PI / 2;           // последний прицел — ползунок стоит на нём
let raf = 0;
let rafAt = 0;
let lastFrame = 0;
let cell = 40;                     // размер клетки в CSS-пикселях
let palette = null;                // цвета скина для Canvas
const flashes = new Map();         // id блока → время удара
let lasers = new Map();            // линия лазера ('h:ряд' / 'v:столбец') → время последней вспышки
const powerBorn = new Map();       // id бонуса → когда появился на экране (анимация появления)
let fading = [];                   // погасшие лазеры: { p, t } — тают
const blockSprites = new Map();    // 'форма|цвет' → готовая картинка блока; 'форма|flash' — белый силуэт
let burstsThisFrame = 0;
let canvasOffset = null;           // положение холста в корне игры (для осколков), на кадр
let shiftAnim = null;              // { from: сдвиг в рядах, t0 }
let intro = null;                  // появление уровня: { t0 }
let modalActive = false;
let modalToken = 0;
let lastHaptic = 0;
let dprNow = 1;
const sprites = new Map();         // цвет → готовая картинка шарика
let fieldCache = null;             // фон поля, нарисованный заранее
let soundOn = true;
const soundAt = {};                // когда звучал каждый частый звук — удары, осколки, лазеры
// звуки (в бете: api.feature('brick-blast-sounds')) — один AudioContext на страницу, заводится при первом звуке
const audio = createAudio(createSounds);

const soundFeature = () => Boolean(api?.feature?.('brick-blast-sounds'));

/** gap — не чаще раза в gap мс (шариков сотня, ударов за кадр десятки: иначе треск). */
function sfx(name, opts, gap = 0) {
  if (!soundFeature() || !soundOn) return;
  const t = performance.now();
  if (gap && t - (soundAt[name] ?? -Infinity) < gap) return;
  soundAt[name] = t;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('bk-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}
let holding = null;                // палец зажат во время полёта — ускорение ×2 (id касания)
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

let pending = null;                // что сохранять вместо показанного уровня (после победы/проигрыша)

// В меню показывается уровень, а не число партий.
const save = () => {
  const state = pending ?? game;
  if (!state) return undefined;
  api?.progress(`Уровень ${state.level}`);
  return api?.storage.set('current', state);
};

// ---------- цвета ----------

function readPalette() {
  // цвет через проверочный элемент: Canvas не понимает var() и color-mix(), а computed color — всегда rgb()
  const probe = el('span', { hidden: true });
  host.append(probe);
  const v = (name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  palette = {
    field: v('--bk-field'), grid: v('--bk-grid'), ball: v('--bk-ball'), ball3: v('--bk-ball3'), number: v('--bk-number'),
    tiers: [1, 2, 3, 4, 5].map((k) => v(`--bk-t${k}`)), laser: v('--bk-laser'), danger: v('--bk-danger'),
    power: { laser: v('--bk-p-laser'), triple: v('--bk-p-triple'), scatter: v('--bk-p-scatter') },
  };
  probe.remove();
}

/** Цвет блока по прочности (как в видео: синий → зелёный → жёлтый → красный → фиолетовый). */
function tierColor(hp) {
  const k = hp < 50 ? 0 : hp < 90 ? 1 : hp < 130 ? 2 : hp < 170 ? 3 : 4;
  return palette.tiers[k];
}

// ---------- отрисовка ----------

function resize() {
  const box = ui.wrap.getBoundingClientRect();
  cell = Math.max(10, Math.min(box.width / COLS, box.height / FIELD_H, 64));
  const w = cell * COLS;
  const h = cell * FIELD_H;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  dprNow = dpr;
  sprites.clear();
  blockSprites.clear();
  fieldCache = null;
  ui.canvas.style.width = `${w}px`;
  ui.canvas.style.height = `${h}px`;
  ui.canvas.width = Math.round(w * dpr);
  ui.canvas.height = Math.round(h * dpr);
  ui.ctx.setTransform(dpr * cell, 0, 0, dpr * cell, 0, 0);      // рисуем в клетках
  draw();
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

/** Многоугольник блока с отступом внутрь (зазор между блоками). */
function insetPoly(shape, r, c, pad) {
  const pts = polygon(shape, r, c);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x + Math.sign(cx - x) * pad * (Math.abs(cx - x) > 1e-6), y + Math.sign(cy - y) * pad * (Math.abs(cy - y) > 1e-6)]);
}

/** rgb(…) → светлее (k > 0) или темнее (k < 0). */
function shade(rgb, k) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return rgb;
  const [r, g, b] = m.slice(0, 3).map(Number).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** rgb(…) с прозрачностью. */
function alpha(rgb, a) {
  const m = rgb.match(/\d+(\.\d+)?/g);
  return m ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})` : rgb;
}

/**
 * Текст — в пикселях, а не в клетках: Safari не рисует шрифт меньше ~1px, даже если холст увеличен масштабом
 * (из-за этого на айфоне пропадали числа на блоках).
 */
function text(c, str, x, y, size, color, { align = 'center', shadow = true, weight = 800 } = {}) {
  c.save();
  c.setTransform(dprNow, 0, 0, dprNow, 0, 0);
  c.font = `${weight} ${Math.max(9, Math.round(size * cell))}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  // тень — тёмная копия со сдвигом: размытая тень (shadowBlur) на сотне чисел за кадр слишком дорогая
  if (shadow) {
    c.fillStyle = 'rgba(0, 0, 0, 0.35)';
    c.fillText(str, x * cell, y * cell + 1.2);
  }
  c.fillStyle = color;
  c.fillText(str, x * cell, y * cell);
  c.restore();
}

function shapePath(c, b, r, pad) {
  if (b.shape === 'sq') {
    roundRect(c, b.c + pad, r + pad, 1 - pad * 2, 1 - pad * 2, 0.17);
    return;
  }
  const pts = insetPoly(b.shape, r, b.c, pad);
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

/**
 * Картинка блока (рисуется один раз на форму и цвет): градиент сверху вниз, блик, светлая кромка.
 * 'flash' — белый силуэт для вспышки удара. Картинка — клетка с полями PAD со всех сторон.
 */
const PAD = 0.1;
function blockSprite(shape, color) {
  const key = `${shape}|${color}`;
  let img = blockSprites.get(key);
  if (img) return img;
  const size = (1 + PAD * 2) * cell * dprNow;
  img = document.createElement('canvas');
  img.width = Math.max(4, Math.ceil(size));
  img.height = img.width;
  const c = img.getContext('2d');
  const k = img.width / (1 + PAD * 2);
  c.setTransform(k, 0, 0, k, PAD * k, PAD * k);
  const b = { shape, c: 0 };
  shapePath(c, b, 0, 0.05);
  if (color === 'flash') {
    c.fillStyle = '#ffffff';
    c.fill();
  } else {
    const g = c.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, shade(color, 0.28));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.22));
    c.fillStyle = g;
    c.fill();
    c.save();
    c.clip();
    const gl = c.createLinearGradient(0, 0, 0, 0.5);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, 1, 0.5);
    c.restore();
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    c.lineWidth = 0.03;
    shapePath(c, b, 0, 0.065);
    c.stroke();
  }
  blockSprites.set(key, img);
  return img;
}

/** Блок: готовая картинка; удар — белая вспышка и лёгкое «вжатие». */
function drawBlock(c, b, dy, now) {
  const r = b.r + dy;
  if (r < -1) return;
  const flash = flashes.get(b.id);
  const k = flash ? Math.max(0, 1 - (now - flash) / 180) : 0;
  const s2 = 1 - 0.07 * k;
  const size = (1 + PAD * 2) * s2;
  const x = b.c + 0.5 - size / 2;
  const y = r + 0.5 - size / 2;
  c.drawImage(blockSprite(b.shape, tierColor(b.hp)), x, y, size, size);
  if (k > 0) {
    c.globalAlpha = 0.65 * k;
    c.drawImage(blockSprite(b.shape, 'flash'), x, y, size, size);
    c.globalAlpha = 1;
  }
  // прочность: у квадрата — по центру, у треугольника — ближе к прямому углу
  const pos = { sq: [0.5, 0.52], tl: [0.34, 0.36], tr: [0.66, 0.36], bl: [0.34, 0.68], br: [0.66, 0.68] }[b.shape];
  text(c, String(b.hp), b.c + pos[0], r + pos[1], b.shape === 'sq' ? (b.hp >= 100 ? 0.3 : 0.36) : 0.25, palette.number);
}

function drawPower(c, p, dy, now, fade = 1) {
  const r = p.r + dy;
  if (r < 0) return;
  const x = p.c + 0.5;
  const y = r + 0.5;
  const laser = LASERS.includes(p.kind);
  const color = laser ? palette.power.laser : palette.power[p.kind];
  // появление: кольцо «впрыгивает»
  if (!powerBorn.has(p.id)) powerBorn.set(p.id, now);
  const age = Math.min(1, (now - powerBorn.get(p.id)) / 350);
  const grow = age < 1 ? 1.25 * age - 0.25 * age * age * age : 1;
  const pulse = (1 + Math.sin(now / 260 + p.id) * 0.06) * grow;
  const left = laser && Number.isFinite(p.born) ? Math.max(0, 1 - (game.clock - p.born) / LASER_LIFE) : 1;
  c.save();
  // последние 3 секунды лазер мигает
  c.globalAlpha = fade * (laser && left * LASER_LIFE < 3 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 140)) : 1);
  c.translate(x, y);
  c.scale(pulse, pulse);
  if (laser) {
    // сколько лазеру осталось — дуга вокруг кольца
    c.strokeStyle = alpha(color, 0.9);
    c.lineWidth = 0.06;
    c.beginPath();
    c.arc(0, 0, POWER_R + 0.09, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    c.stroke();
  }
  c.strokeStyle = color;
  c.lineWidth = 0.05;
  c.setLineDash([0.12, 0.07]);
  c.beginPath();
  c.arc(0, 0, POWER_R, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = '#fff';
  c.fillStyle = '#fff';
  c.lineWidth = 0.045;
  c.lineCap = 'round';
  const line = (x1, y1, x2, y2) => {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };
  if (p.kind === 'laserH' || p.kind === 'laserX') line(-0.2, 0, 0.2, 0);
  if (p.kind === 'laserV' || p.kind === 'laserX') line(0, -0.2, 0, 0.2);
  if (p.kind.startsWith('laser')) {
    c.beginPath();
    c.arc(0, 0, 0.05, 0, Math.PI * 2);
    c.fill();
  }
  if (p.kind === 'triple') {
    for (const [dx, dy2] of [[-0.09, 0.05], [0.09, 0.05], [0, -0.07]]) {
      c.beginPath();
      c.arc(dx, dy2, 0.06, 0, Math.PI * 2);
      c.fill();
    }
    line(0, 0.13, 0, 0.2);
  }
  if (p.kind === 'scatter') {
    c.beginPath();
    c.arc(0, 0.05, 0.08, 0, Math.PI * 2);
    c.fill();
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI * (0.15 + (k * 0.7) / 3);
      c.beginPath();
      c.arc(Math.cos(a) * 0.17, 0.02 + Math.sin(a) * 0.17, 0.04, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

/** Картинка шарика: стеклянный блик, объём и мягкое свечение (рисуется один раз на цвет и размер). */
function ballSprite(color) {
  let img = sprites.get(color);
  if (img) return img;
  const px = Math.max(8, Math.ceil(BALL_R * 2 * 2.2 * cell * dprNow));
  img = document.createElement('canvas');
  img.width = px;
  img.height = px;
  const c = img.getContext('2d');
  const R = px / 2;
  const rb = R / 2.2;
  const glow = c.createRadialGradient(R, R, rb * 0.8, R, R, R);
  glow.addColorStop(0, alpha(color, 0.45));
  glow.addColorStop(1, alpha(color, 0));
  c.fillStyle = glow;
  c.fillRect(0, 0, px, px);
  const body = c.createRadialGradient(R - rb * 0.35, R - rb * 0.4, rb * 0.05, R, R, rb);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.25, shade(color, 0.45));
  body.addColorStop(0.7, color);
  body.addColorStop(1, shade(color, -0.35));
  c.fillStyle = body;
  c.beginPath();
  c.arc(R, R, rb, 0, Math.PI * 2);
  c.fill();
  sprites.set(color, img);
  return img;
}

/** Шарики: короткий след по ходу полёта + картинка шарика. */
function drawBalls(c, balls, color, trails = false) {
  if (trails && balls.length) {
    c.save();
    c.strokeStyle = color;
    c.globalAlpha = 0.28;
    c.lineWidth = BALL_R * 1.3;
    c.lineCap = 'round';
    c.beginPath();
    for (const b of balls) {
      c.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      c.lineTo(b.x, b.y);
    }
    c.stroke();
    c.restore();
  }
  const img = ballSprite(color);
  const size = BALL_R * 2 * 2.2;
  for (const b of balls) c.drawImage(img, b.x - size / 2, b.y - size / 2, size, size);
}

/** Фон поля: вертикальный градиент, виньетка и точки на пересечениях сетки (рисуется при изменении размера). */
function fieldBackground() {
  if (fieldCache) return fieldCache;
  const img = document.createElement('canvas');
  img.width = Math.max(1, Math.round(COLS * cell * dprNow));
  img.height = Math.max(1, Math.round(ROWS * cell * dprNow));
  const c = img.getContext('2d');
  c.setTransform(cell * dprNow, 0, 0, cell * dprNow, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, ROWS);
  g.addColorStop(0, shade(palette.field, 0.06));
  g.addColorStop(1, shade(palette.field, -0.12));
  c.fillStyle = g;
  c.fillRect(0, 0, COLS, ROWS);
  const v = c.createRadialGradient(COLS / 2, ROWS * 0.45, 1, COLS / 2, ROWS * 0.45, ROWS * 0.75);
  v.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  c.fillStyle = v;
  c.fillRect(0, 0, COLS, ROWS);
  c.fillStyle = palette.grid;
  for (let x = 1; x < COLS; x++) for (let y = 1; y < ROWS; y++) {
    c.beginPath();
    c.arc(x, y, 0.035, 0, Math.PI * 2);
    c.fill();
  }
  fieldCache = img;
  return img;
}

function draw() {
  if (!ui || !palette || !game) return;
  const c = ui.ctx;
  const now = performance.now();
  c.clearRect(0, 0, COLS, FIELD_H);
  // поле и полосы столбцов
  c.drawImage(fieldBackground(), 0, 0, COLS, ROWS);
  // сдвиг уровня / появление: блоки подъезжают сверху
  let dy = 0;
  if (shiftAnim) {
    const p = Math.min(1, (now - shiftAnim.t0) / 260);
    dy = -shiftAnim.from * (1 - (1 - p) ** 3);
  }
  if (intro) {
    const p = Math.min(1, (now - intro.t0) / 600);
    dy = -(ROWS * 0.6) * (1 - p) ** 3;
  }
  c.save();
  c.beginPath();
  c.rect(0, 0, COLS, ROWS);
  c.clip();
  // опасность: красные треугольники у дна
  if (danger(game) && phase !== 'won') {
    const a = 0.45 + Math.sin(now / 180) * 0.25;
    c.fillStyle = palette.danger;
    c.globalAlpha = a;
    for (let k = 0; k < COLS * 2; k++) {
      c.beginPath();
      c.moveTo(k * 0.5 + 0.05, ROWS - 0.02);
      c.lineTo(k * 0.5 + 0.25, ROWS - 0.42);
      c.lineTo(k * 0.5 + 0.45, ROWS - 0.02);
      c.fill();
    }
    c.globalAlpha = 1;
  }
  for (const p of game.powers) drawPower(c, p, dy, now);
  fading = fading.filter((f) => now - f.t < 400);
  for (const f of fading) drawPower(c, f.p, dy, now, 1 - (now - f.t) / 400);
  for (const b of game.blocks) drawBlock(c, b, dy, now);
  // лазеры: одна вспышка на линию, сколько бы шариков ни пролетело кольцо (без размытия — оно дорогое)
  for (const [key, t] of lasers) {
    const k = 1 - (now - t) / 260;
    if (k <= 0) {
      lasers.delete(key);
      continue;
    }
    const [axis, n] = key.split(':');
    const line = () => {
      c.beginPath();
      if (axis === 'h') {
        c.moveTo(0, +n + 0.5);
        c.lineTo(COLS, +n + 0.5);
      } else {
        c.moveTo(+n + 0.5, 0);
        c.lineTo(+n + 0.5, ROWS);
      }
      c.stroke();
    };
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = alpha(palette.laser, 0.25 * k);
    c.lineWidth = 0.45 * k + 0.05;
    line();
    c.strokeStyle = alpha(palette.laser, 0.95 * k);
    c.lineWidth = 0.1 * k + 0.02;
    line();
    c.restore();
  }
  // прицел: пунктир до касания и отражённый отрезок
  if (phase === 'aim' && aim && !aim.cancel) {
    const pts = tracePath(game, game.x, aim.angle);
    c.fillStyle = palette.ball;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let d = carry; d < len; d += 0.32) {
        c.beginPath();
        c.arc(x1 + ((x2 - x1) * d) / len, y1 + ((y2 - y1) * d) / len, 0.05, 0, Math.PI * 2);
        c.fill();
      }
      carry = 0.32 - ((len - carry) % 0.32);
    }
  }
  const ballColor = sim?.tripled || (phase === 'aim' && game.triple) ? palette.ball3 : palette.ball;
  if (sim) drawBalls(c, sim.balls.filter((b) => b.active), ballColor, true);
  // ускорение ×2, пока палец зажат
  if (holding !== null && phase === 'fly') text(c, '⏩ ×2', COLS - 0.2, 0.45, 0.32, '#ffffff', { align: 'right' });
  c.restore();
  // линия запуска, шарик и счётчик
  c.fillStyle = palette.grid;
  c.fillRect(0, ROWS, COLS, 0.02);
  const waiting = phase === 'aim' || phase === 'shift' || (sim && sim.launched < sim.count);
  if (waiting) {
    const x = sim && phase === 'fly' ? sim.x0 : game.x;
    drawBalls(c, [{ x, y: ROWS - BALL_R }], ballColor);
    const left = phase === 'fly' && sim ? sim.count - sim.launched : (game.triple ? game.balls * 3 : game.balls);
    const right = x > COLS - 1.2;
    text(c, `×${left}`, x + (right ? -0.24 : 0.24), ROWS + 0.27, 0.3, ballColor, { align: right ? 'right' : 'left', shadow: false, weight: 700 });
  }
  // шарики, вернувшиеся на дно, собираются у новой точки запуска
  if (phase === 'fly' && sim?.firstX !== null) drawBalls(c, [{ x: sim.firstX, y: ROWS - BALL_R }], ballColor);
}

// ---------- цикл ----------

function loop(now) {
  raf = 0;
  if (!ui) return;
  const dt = Math.min(1 / 30, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (phase === 'fly' && sim) {
    // затянувшийся ход ускоряется
    const speed = (sim.t > 10 ? 2.4 : sim.t > 5 ? 1.6 : 1) * (holding !== null ? 2 : 1);
    step(game, sim, dt * speed);
    handleEvents();
    if (sim.done) finishTurn();
  }
  if (shiftAnim && now - shiftAnim.t0 > 260) shiftAnim = null;
  if (intro && now - intro.t0 > 600) intro = null;
  draw();
  if (needsFrames()) {
    rafAt = now;
    raf = requestAnimationFrame(loop);
  }
}

const needsFrames = () => phase === 'fly' || shiftAnim || intro || lasers.size || fading.length || flashes.size
  || game?.powers.length || (game && danger(game)) || aim;

/** Запустить цикл кадров. Если заказанный кадр не пришёл за 250 мс (браузер придержал), заказываем заново. */
function kick() {
  if (!ui) return;
  const now = performance.now();
  if (raf && now - rafAt < 250) return;
  cancelAnimationFrame(raf);
  lastFrame = now;
  rafAt = now;
  raf = requestAnimationFrame(loop);
}

function handleEvents() {
  const now = performance.now();
  burstsThisFrame = 0;
  canvasOffset = null;
  for (const e of sim.events) {
    if (e.type === 'hit') {
      flashes.set(e.id, now);
      sfx('hit', null, 45);
    } else if (e.type === 'break') {
      flashes.delete(e.id);
      sfx('break', { step: e.max }, 55);
      stats.bricks += 1;
      burstAt(e.c + 0.5, e.r + 0.5, tierColor(e.max));
      if (now - lastHaptic > 60) {
        api.platform.haptic.impact('light');
        lastHaptic = now;
      }
    } else if (e.type === 'laser') {
      lasers.set(e.axis === 'h' ? `h:${e.r}` : `v:${e.c}`, now);
      sfx('laser', null, 120);
    } else if (e.type === 'scatter') sfx('scatter', null, 150);
    else if (e.type === 'expire') {
      powerBorn.set(-e.id, -Infinity);            // гаснущее кольцо не «впрыгивает» заново
      fading.push({ p: { ...e, id: -e.id, born: -Infinity }, t: now });
    }
    else if (e.type === 'spawn') powerBorn.delete(e.id);
    else if (e.type === 'triple') {
      sfx('triple');
      toast.show(T.triple, 1800);
      api.platform.haptic.notification('success');
    }
  }
  sim.events.length = 0;
  for (const [id, t] of flashes) if (now - t > 200) flashes.delete(id);
  renderProgress();
}

function burstAt(x, y, color) {
  // лазер может разбить десяток блоков за кадр — осколки не больше чем от шести
  if (++burstsThisFrame > 6) return;
  if (!canvasOffset) {
    const cr = ui.canvas.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    canvasOffset = [cr.left - rr.left, cr.top - rr.top];
  }
  fx?.burst(canvasOffset[0] + x * cell, canvasOffset[1] + y * cell, color, 6, { speed: 200, size: 5 });
}

// ---------- ход ----------

function shoot() {
  if (phase !== 'aim' || !aim || aim.cancel) {
    aim = null;
    ui.bottom.dataset.mode = 'aim';
    draw();
    return;
  }
  angle = aim.angle;
  aim = null;
  sim = startTurn(game, angle);
  phase = 'fly';
  stats.shots += 1;
  ui.bottom.dataset.mode = 'fly';
  sfx('shoot');
  api.platform.haptic.impact('medium');
  kick();
}

function finishTurn() {
  holding = null;
  const s = sim;
  const before = game.blocks.length ? game.blocks[0].r : 0;
  const firstId = game.blocks[0]?.id;
  const result = endTurn(game, s);
  sim = null;
  api.storage.set('stats', stats);
  if (result === 'win') {
    won();
    return;
  }
  const after = game.blocks.find((b) => b.id === firstId)?.r ?? before + 1;
  shiftAnim = { from: after - before, t0: performance.now() };
  if (result === 'lose') {
    lost();
    return;
  }
  phase = 'aim';
  ui.bottom.dataset.mode = 'aim';
  syncSlider();
  save();
  sfx('shift');
  if (danger(game)) {
    later(() => sfx('danger'), 200);
    api.platform.haptic.notification('warning');
  }
  kick();
}

function won() {
  phase = 'won';
  ui.bottom.dataset.mode = 'none';
  stats.cleared += 1;
  stats.bestLevel = Math.max(stats.bestLevel, game.level);
  api.storage.set('stats', stats);
  const done = game;
  pending = newLevel(done.level + 1);
  pending.x = done.x;
  save();                                          // следующий уровень сохранён сразу, на экране — пройденный
  sfx('win');
  api.platform.haptic.notification('success');
  renderProgress(1);
  later(() => {
    if (!ui) return;
    fx?.confetti([...palette.tiers, palette.ball], 140);
    const stars = [0, 1, 2].map(() => el('span', { class: 'bk-won-star' }, '★'));
    const title = el('h2', { class: 'bk-won-title' }, T.wonTitle);
    const frame = el('div', { class: 'bk-won-frame' },
      miniature(done.pattern),
      el('div', { class: 'bk-won-badge' }, T.completed(done.level)));
    const cardEl = el('div', { class: 'bk-card bk-won', role: 'dialog', 'aria-label': T.wonTitle },
      el('div', { class: 'bk-won-rays', 'aria-hidden': 'true' }),
      el('div', { class: 'bk-won-stars' }, stars),
      title,
      frame,
      el('div', { class: 'bk-won-info' }, T.wonInfo(done.turn, done.pattern.cells.length)),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          game = pending;
          pending = null;
          startLevel(true);
        },
      }, T.next(done.level + 1)),
    );
    openModal(cardEl);
    // звёзды — по очереди, заголовок «впрыгивает», миниатюра выезжает снизу
    stars.forEach((star, k) => animate(star, [
      { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
      { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.6 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, delay: 250 + k * 160, easing: 'ease-out', fill: 'backwards' }));
    pop(title, { from: 0.5, duration: 420 });
    animate(frame, [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 450, delay: 120, easing: EASE_OUT, fill: 'backwards' });
  }, reducedMotion() ? 0 : 500);
}

function lost() {
  phase = 'lost';
  ui.bottom.dataset.mode = 'none';
  stats.fails += 1;
  api.storage.set('stats', stats);
  const failed = game.level;
  sfx('lose');
  api.platform.haptic.notification('error');
  shake(ui.canvas, { distance: 8, duration: 450 });
  // «Ещё раз» на экране результата начнёт этот же уровень заново
  pending = newLevel(failed);
  save();
  later(() => {
    if (!api) return;
    game = pending;
    pending = null;
    api.finish({ outcome: 'lose', title: T.loseTitle, message: T.loseMessage(failed), locale: 'ru' });
  }, reducedMotion() ? 0 : 900);
}

/**
 * Миниатюра уровня для окна победы (как в видео): те же объёмные блоки, что в игре, в размере экрана —
 * рисуется сразу в нужном разрешении (раньше рисовалась крошечной и растягивалась — была размытой).
 */
function miniature(pattern) {
  const canvas = el('canvas', { class: 'bk-mini' });
  const px = Math.min(150 / COLS, 230 / pattern.rows);           // CSS-пикселей на клетку
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = COLS * px;
  const h = pattern.rows * px;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr * px, 0, 0, dpr * px, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, pattern.rows);
  g.addColorStop(0, shade(palette.field, 0.06));
  g.addColorStop(1, shade(palette.field, -0.12));
  c.fillStyle = g;
  c.fillRect(0, 0, COLS, pattern.rows);
  const size = 1 + PAD * 2;
  for (const x of pattern.cells) {
    c.drawImage(blockSprite(x.shape, tierColor(x.hp)), x.c - PAD, pattern.rows - 1 - x.k - PAD, size, size);
  }
  return canvas;
}

function startLevel(animateIn) {
  lastProgress = -1;
  phase = 'aim';
  sim = null;
  aim = null;
  flashes.clear();
  lasers.clear();
  fading = [];
  powerBorn.clear();
  shiftAnim = null;
  ui.sub.textContent = T.level(game.level);
  ui.bottom.dataset.mode = 'aim';
  syncSlider();
  renderProgress();
  if (animateIn && !reducedMotion()) intro = { t0: performance.now() };
  kick();
}

// ---------- прогресс ----------

let lastProgress = -1;
function renderProgress(force) {
  const p = force ?? progress(game);
  if (p === lastProgress) return;                 // зовётся каждый кадр полёта — трогаем DOM, только если изменилось
  lastProgress = p;
  ui.fill.style.transform = `scaleX(${p})`;
  // процент разбитого вместо звёзд (просьба владельца: звёзды ни на что не влияли); 100% — только когда всё
  const pct = p >= 1 - 1e-9 ? 100 : Math.floor(p * 100);
  const text = `${pct}%`;
  if (ui.percent.textContent !== text) {
    const tens = Math.floor(pct / 10) !== Math.floor((parseInt(ui.percent.textContent, 10) || 0) / 10);
    ui.percent.textContent = text;
    if (tens && pct > 0) pop(ui.percent, { from: 0.7, duration: 260 });
  }
}

// ---------- прицел ----------

function fieldPoint(e) {
  const r = ui.canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * COLS, y: ((e.clientY - r.top) / r.height) * FIELD_H, below: e.clientY > r.bottom };
}

function onFieldDown(e) {
  if (phase !== 'aim' || modalActive || aim) return;
  e.preventDefault();
  try {
    ui.canvas.setPointerCapture(e.pointerId);
  } catch {
    // без захвата — движения всё равно придут
  }
  aim = { source: 'field', pointerId: e.pointerId, angle, cancel: false };
  onFieldMove(e);
}

function onFieldMove(e) {
  if (!aim || aim.source !== 'field' || e.pointerId !== aim.pointerId) return;
  const p = fieldPoint(e);
  // увёл палец ниже поля — отмена (как «Drag here to cancel aiming» в видео)
  aim.cancel = p.below || p.y > ROWS - 0.15;
  if (!aim.cancel) aim.angle = aimAngle(game.x, p.x, p.y);
  ui.bottom.dataset.mode = aim.cancel ? 'cancel' : 'aim';
  syncSlider(aim.angle);
  kick();
}

function onFieldUp(e) {
  if (!aim || aim.source !== 'field' || e.pointerId !== aim.pointerId) return;
  shoot();
}

/** Ползунок: слева — стреляем влево, справа — вправо. */
function sliderAngle(e) {
  const r = ui.track.getBoundingClientRect();
  const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  return Math.PI - MIN_ANGLE - k * (Math.PI - 2 * MIN_ANGLE);
}

function syncSlider(a = angle) {
  const k = (Math.PI - MIN_ANGLE - a) / (Math.PI - 2 * MIN_ANGLE);
  ui.knob.style.left = `${k * 100}%`;
}

function onSliderDown(e) {
  if (phase !== 'aim' || modalActive || aim) return;
  e.preventDefault();
  try {
    ui.track.setPointerCapture(e.pointerId);
  } catch {
    // см. выше
  }
  aim = { source: 'slider', pointerId: e.pointerId, angle: sliderAngle(e), cancel: false };
  syncSlider(aim.angle);
  kick();
}

function onSliderMove(e) {
  if (!aim || aim.source !== 'slider' || e.pointerId !== aim.pointerId) return;
  aim.angle = sliderAngle(e);
  syncSlider(aim.angle);
  kick();
}

function onSliderUp(e) {
  if (!aim || aim.source !== 'slider' || e.pointerId !== aim.pointerId) return;
  shoot();
}

function onRecall() {
  if (phase !== 'fly' || !sim) return;
  recall(sim);
  sfx('recall');
  api.platform.haptic.impact('light');
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
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
}

function card(title, ...children) {
  return el('div', { class: 'bk-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bk-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bk-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats() {
  if (phase === 'won') return;
  const item = (value, label) => el('div', { class: 'bk-stat' }, el('div', { class: 'bk-stat-value' }, value), el('div', { class: 'bk-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'bk-stats-grid' },
    item(game.level, T.stats.level), item(stats.cleared, T.stats.cleared),
    item(stats.bestLevel, T.stats.bestLevel), item(stats.bricks, T.stats.bricks),
    item(stats.shots, T.stats.shots), item(stats.fails, T.stats.fails),
  )));
}

function showSettings() {
  if (phase === 'won') return;
  const buttons = SKINS.map((id) => el('button', {
    class: 'bk-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      readPalette();
      sprites.clear();
      blockSprites.clear();
      fieldCache = null;
      draw();
    },
  }, el('span', { class: 'bk-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title,
    el('h3', { class: 'bk-section' }, T.settings.skin),
    el('div', { class: 'bk-skins', role: 'radiogroup' }, buttons),
  ));
}

/** Выбор уровня: открыты пройденные (stats.bestLevel) и следующий за ними. */
function showLevels() {
  if (phase !== 'aim') return;
  const max = Math.max(stats.bestLevel + 1, game.level);
  const cells = [];
  for (let n = 1; n <= max + 3; n++) {
    const open = n <= max;
    cells.push(el('button', {
      class: `bk-lvl${open ? '' : ' bk-lvl-locked'}${n === game.level ? ' bk-lvl-current' : ''}${n <= stats.bestLevel ? ' bk-lvl-passed' : ''}`,
      disabled: !open,
      onclick: () => {
        closeModal();
        if (n === game.level) return;
        game = newLevel(n);
        save();
        startLevel(true);
      },
    }, open ? String(n) : '🔒', n <= stats.bestLevel ? el('span', { class: 'bk-lvl-done' }, '✓') : null));
  }
  openModal(card(T.levelsTitle,
    el('p', { class: 'bk-note' }, T.levelsNote),
    el('div', { class: 'bk-levels' }, cells),
  ));
  ui.modal.querySelector('.bk-lvl-current')?.scrollIntoView({ block: 'center' });
}

function askRestart() {
  if (phase !== 'aim') return;
  openModal(card(T.newLevel,
    el('p', { class: 'bk-note' }, T.restartQuestion),
    el('div', { class: 'bk-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancelBtn),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          game = newLevel(game.level);
          save();
          startLevel(true);
        },
      }, T.restart),
    ),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bk-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive && phase !== 'won') closeModal();
}

export default {
  id: 'brick-blast',
  title: 'Brick Blast',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'bk-sub' }),
      fill: el('div', { class: 'bk-progress-fill' }),
      canvas: el('canvas', { class: 'bk-canvas' }),
      knob: el('div', { class: 'bk-knob' }),
      modal: el('div', { class: 'bk-modal', hidden: true }),
    };
    ui.ctx = ui.canvas.getContext('2d');
    ui.soundBtn = soundFeature() ? iconButton(ICONS.soundOn, 'Выключить звук', toggleSound) : null;
    ui.percent = el('div', { class: 'bk-percent' }, '0%');
    ui.wrap = el('div', { class: 'bk-wrap' }, ui.canvas);
    ui.track = el('div', { class: 'bk-track' }, el('div', { class: 'bk-track-line' }), ui.knob);
    const recallButton = el('button', { class: 'bk-recall', 'aria-label': T.recall, title: T.recall, onclick: onRecall });
    recallButton.innerHTML = ICONS.recall;
    ui.bottom = el('div', { class: 'bk-bottom', 'data-mode': 'aim' },
      ui.track, recallButton, el('div', { class: 'bk-cancel' }, T.cancel));

    ui.canvas.addEventListener('pointerdown', onFieldDown);
    ui.canvas.addEventListener('pointermove', onFieldMove);
    ui.canvas.addEventListener('pointerup', onFieldUp);
    ui.canvas.addEventListener('pointercancel', () => {
      aim = null;
      ui.bottom.dataset.mode = phase === 'fly' ? 'fly' : 'aim';
    });
    ui.track.addEventListener('pointerdown', onSliderDown);
    ui.track.addEventListener('pointermove', onSliderMove);
    ui.track.addEventListener('pointerup', onSliderUp);
    ui.track.addEventListener('pointercancel', () => {
      aim = null;
    });

    root = el('div', { class: 'bk' },
      el('div', { class: 'bk-header' },
        el('div', {}, el('div', { class: 'bk-title' }, T.title), ui.sub),
        el('div', { class: ui.soundBtn ? 'bk-actions bk-actions-5' : 'bk-actions' },
          ui.soundBtn,
          iconButton(ICONS.levels, T.levels, showLevels),
          iconButton(ICONS.restart, T.newLevel, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bk-progress' }, el('div', { class: 'bk-progress-track' }, ui.fill), ui.percent),
      ui.wrap,
      ui.bottom,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    // зажал экран во время полёта (не на кнопке) — шарики летят вдвое быстрее, отпустил — как было
    root.addEventListener('pointerdown', (e) => {
      if (phase !== 'fly' || modalActive || e.target.closest('button')) return;
      holding = e.pointerId;
      api.platform.haptic.selection();
    });
    const release = (e) => {
      if (e.pointerId === holding) holding = null;
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    fx = createFx(root, 'bk-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);

    readPalette();
    ui.resizeObserver = new ResizeObserver(() => resize());
    ui.resizeObserver.observe(ui.wrap);

    const fresh = !isValidState(saved);
    game = fresh ? newLevel(1) : normalizeState(saved);
    if (fresh) save();
    else api.progress(`Уровень ${game.level}`);
    startLevel(true);
    if (fresh && stats.shots === 0) later(() => toast?.show(T.aimHelp, 3200), 700);
  },

  getState() {
    if (!game) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    save();
    cancelAnimationFrame(raf);
    raf = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    ui?.resizeObserver?.disconnect();
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = fx = game = pending = sim = aim = shiftAnim = intro = palette = holding = fieldCache = null;
  sprites.clear();
    phase = 'aim';
    flashes.clear();
    lasers.clear();
    fading = [];
    powerBorn.clear();
    blockSprites.clear();
    modalActive = false;
  },
};

