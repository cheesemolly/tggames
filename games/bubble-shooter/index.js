// «Шарики» (bubble shooter) по видео владельца (Shoot Bubble).
//
// Экран — Canvas. Правила и математика — в logic.js; здесь рисование, ввод и анимации.
//
// Главное про анимации (замечание владельца: «шарик телепортируется, анимаций лопанья нет»):
// логика сразу считает итог выстрела, а экран рисует не итог, а **свою копию поля** (`view`) и
// меняет её по шагам: шар долетает → встаёт → гроздь лопается волной → отцепившиеся падают →
// поле плавно сползает вниз. Только после этого экран снова рисует настоящее состояние.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, pop as popIn, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  R, ROW_H, WIDTH, VIEW_ROWS, FIELD_H, SHOOTER_DY, COLORS, STONE, SPEED, STEP, BONUS_KINDS,
  rowCols, cellX, cellY, cloneGrid, isStone, isLocked, colorOf, snapCell,
  newLevel, shoot, swap, arm, aimPath, angleTo, starsFor, isValidState, emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['classic', 'telegram', 'night', 'candy'];
const CANVAS_H = SHOOTER_DY + 1.35;                // поле + зона стрелка, в диаметрах шара
const SHOOTER_X = WIDTH / 2;
const NEXT_X = WIDTH / 2 + 2.15;                   // следующий шар — справа от стрелка, как в видео
const NEXT_SIZE = 0.74;
const BADGE_X = WIDTH / 2 - 2.55;                  // счётчик выстрелов — слева

const T = {
  title: 'Шарики',
  level: (n) => `Уровень ${n}`,
  score: 'Очки',
  combo: (n) => `Комбо ×${n}`,
  aimHelp: 'Веди пальцем по полю — увидишь траекторию. Отпусти — выстрел.',
  swapHelp: 'Тап по маленькому шару — поменять местами',
  reward: { bomb: 'Бонус: бомба!', rainbow: 'Бонус: радуга!', fire: 'Бонус: огненный шар!' },
  bonus: { bomb: 'Бомба', rainbow: 'Радуга', fire: 'Огонь' },
  bonusHelp: {
    bomb: 'Бомба: взрывает всё вокруг, даже камни',
    rainbow: 'Радуга: подходит к любому цвету',
    fire: 'Огонь: прожигает шары насквозь',
  },
  noBonus: 'Бонусы копятся за серии попаданий',
  win: { title: (n) => `Уровень ${n}`, score: (s) => `Очки: ${s}`, next: 'Дальше', again: 'Ещё раз' },
  resultLose: 'Выстрелы кончились',
  menu: { title: 'Меню', restart: 'Начать уровень заново', stats: 'Статистика', skin: 'Оформление', close: 'Закрыть' },
  stats: { played: 'Партий', cleared: 'Уровней пройдено', bestLevel: 'Лучший уровень', bestScore: 'Рекорд очков' },
  skins: { classic: 'Небо', telegram: 'Как в Telegram', night: 'Ночь', candy: 'Конфета' },
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'classic' };

let scale = 20;
let offsetX = 0;
let offsetY = 0;
let dpr = 1;
let colors = [];                // цвета шаров из CSS скина
let theme = {};                 // прочие цвета холста
let sprites = new Map();

let view = null;                // { grid, scroll } — что рисуем, пока идёт анимация выстрела
let busy = false;
let aim = null;                 // { angle, path, end }
let flying = null;              // { kind, color, path, progress, burnAt, onDone }
let popping = [];               // { x, y, value, t, kind }
let falling = [];               // { x, y, vx, vy, rot, spin, value, t }
let floaters = [];              // { x, y, text, t }
let reload = 1;                 // 0..1 — новый шар едет в стрелок
let swapT = 1;                  // 0..1 — шары меняются местами
let scrollAnim = null;          // { from, to, t }
let shownScore = 0;
let frame = 0;
let lastTs = 0;
let modalActive = false;
let finished = false;
let pendingNext = null;         // следующий уровень: сохранён сразу при победе, по «Дальше» — он же
const timers = new Set();

const later = (fn, ms) => {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
};

const save = () => {
  if (!game || finished) return;
  api?.progress(T.level(game.level));
  api?.storage.set('current', game);
};

// ---------- цвета и картинки ----------

function readPalette() {
  const probe = el('div', { class: 'bs-probe' });
  root.appendChild(probe);
  const st = getComputedStyle(probe);
  const v = (name, fallback) => st.getPropertyValue(name).trim() || fallback;
  colors = Array.from({ length: COLORS }, (_, i) => v(`--bs-c${i + 1}`, '#888'));
  theme = {
    line: v('--bs-line', '#ffffff'),
    stone: v('--bs-stone', '#7b8290'),
    text: v('--bs-text', '#ffffff'),
    badge: v('--bs-badge', '#3f51b5'),
    arrow: v('--bs-arrow', '#f0a24a'),
    swap: v('--bs-swap', '#c46cf0'),
  };
  probe.remove();
  sprites = new Map();
}

/** Затемнить (amount < 0) или осветлить цвет вида #rrggbb. */
function shade(color, amount) {
  const m = color.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return color;
  const ch = (h) => {
    const n = parseInt(h, 16);
    const out = amount < 0 ? n * (1 + amount) : n + (255 - n) * amount;
    return Math.max(0, Math.min(255, Math.round(out))).toString(16).padStart(2, '0');
  };
  return `#${ch(m[1])}${ch(m[2])}${ch(m[3])}`;
}

/**
 * Глянцевый шар: тень, объём (свет сверху-слева, тёмный край), отражённый свет снизу, блик.
 * Рисуется один раз на значение и размер, дальше только копируется — в кадре никаких градиентов.
 */
function sprite(value, size) {
  const px = Math.max(8, Math.round(size * dpr));
  const key = `${value}:${px}`;
  if (sprites.has(key)) return sprites.get(key);

  const pad = Math.round(px * 0.14);
  const c = document.createElement('canvas');
  c.width = px + pad * 2;
  c.height = px + pad * 2;
  const g = c.getContext('2d');
  const cx = c.width / 2;
  const cy = c.height / 2;
  const rad = px / 2 - 0.5;

  // мягкая тень под шаром
  const shadow = g.createRadialGradient(cx, cy + rad * 0.45, rad * 0.2, cx, cy + rad * 0.45, rad * 1.15);
  shadow.addColorStop(0, 'rgba(0,0,0,0.28)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shadow;
  g.beginPath();
  g.ellipse(cx, cy + rad * 0.5, rad * 1.05, rad * 0.75, 0, 0, Math.PI * 2);
  g.fill();

  const kind = typeof value === 'string' ? value : null;
  const base = kind === 'bomb' ? '#2a2e3a'
    : kind === 'fire' ? '#ff7a1a'
      : kind === 'rainbow' ? '#ffffff'
        : isStone(value) ? theme.stone : colors[colorOf(value)] ?? '#888';

  // тело
  const body = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.08, cx, cy, rad);
  body.addColorStop(0, shade(base, 0.55));
  body.addColorStop(0.35, base);
  body.addColorStop(0.85, shade(base, -0.28));
  body.addColorStop(1, shade(base, -0.45));
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fill();

  if (kind === 'rainbow') {
    // радуга: цветные дольки поверх белого шара
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = colors[i] ?? '#888';
      g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, rad * 0.92, (i / 6) * Math.PI * 2 - Math.PI / 2, ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  if (isStone(value)) {
    // камень: матовый, с крапинками
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (const [dx, dy, s] of [[-0.3, 0.1, 0.12], [0.25, -0.2, 0.09], [0.1, 0.35, 0.1], [-0.05, -0.35, 0.07], [0.38, 0.22, 0.06]]) {
      g.beginPath();
      g.arc(cx + dx * rad, cy + dy * rad, s * rad, 0, Math.PI * 2);
      g.fill();
    }
  }

  // отражённый свет снизу
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = Math.max(1, rad * 0.1);
  g.beginPath();
  g.arc(cx, cy, rad * 0.8, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();

  // блик
  if (!isStone(value)) {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(cx - rad * 0.32, cy - rad * 0.42, rad * 0.28, rad * 0.16, -0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(cx + rad * 0.12, cy - rad * 0.55, rad * 0.06, 0, Math.PI * 2);
    g.fill();
  }

  if (kind === 'bomb') {
    g.strokeStyle = '#c9a36a';                      // фитиль
    g.lineWidth = Math.max(1, rad * 0.12);
    g.beginPath();
    g.moveTo(cx + rad * 0.35, cy - rad * 0.75);
    g.quadraticCurveTo(cx + rad * 0.7, cy - rad * 1.05, cx + rad * 0.55, cy - rad * 1.15);
    g.stroke();
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.arc(cx + rad * 0.55, cy - rad * 1.15, rad * 0.14, 0, Math.PI * 2);
    g.fill();
  }

  if (typeof value === 'number' && isLocked(value)) drawChains(g, cx, cy, rad);

  sprites.set(key, c);
  return c;
}

/** Цепи крест-накрест, как в видео: тёмные звенья со светлым кантом. */
function drawChains(g, cx, cy, rad) {
  g.save();
  g.lineCap = 'round';
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const dx = Math.cos(angle) * rad * 0.95;
    const dy = Math.sin(angle) * rad * 0.95;
    g.strokeStyle = '#3a3f4b';
    g.lineWidth = rad * 0.26;
    g.beginPath();
    g.moveTo(cx - dx, cy - dy);
    g.lineTo(cx + dx, cy + dy);
    g.stroke();
    g.strokeStyle = '#c3c9d6';
    g.lineWidth = rad * 0.1;
    g.setLineDash([rad * 0.22, rad * 0.14]);
    g.beginPath();
    g.moveTo(cx - dx, cy - dy);
    g.lineTo(cx + dx, cy + dy);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

// ---------- размеры и координаты ----------

function resize() {
  if (!ui?.canvas) return;
  const box = ui.wrap.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.floor(box.width));
  const h = Math.max(1, Math.floor(box.height));
  ui.canvas.width = Math.floor(w * dpr);
  ui.canvas.height = Math.floor(h * dpr);
  ui.canvas.style.width = `${w}px`;
  ui.canvas.style.height = `${h}px`;
  scale = Math.min(w / WIDTH, h / CANVAS_H);
  offsetX = (w - WIDTH * scale) / 2;
  // Стрелок — у панели бонусов, как в видео. Лишнее место уходит наверх: там рисуются
  // приглушённые ряды, которые ещё не спустились (в видео они так же торчат из-под шапки).
  offsetY = h - CANVAS_H * scale;
  sprites = new Map();
  draw();
}

const currentScroll = () => (scrollAnim ? scrollAnim.from + (scrollAnim.to - scrollAnim.from) * ease(scrollAnim.t) : (view ?? game).scroll);
const px = (x) => offsetX + x * scale;
/** y уровня → пиксели экрана с учётом сползания поля. */
const py = (y, scroll = currentScroll()) => offsetY + (y - scroll * ROW_H) * scale;
const sy = (y) => offsetY + y * scale;                     // y экрана (зона стрелка)
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------- рисование ----------

function draw() {
  if (!ui?.ctx || !game) return;
  const g = ui.ctx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, ui.canvas.width / dpr, ui.canvas.height / dpr);

  const scroll = currentScroll();
  const grid = (view ?? game).grid;

  // пунктир сверху — граница видимой части уровня, как в видео
  g.save();
  g.strokeStyle = theme.line;
  g.globalAlpha = 0.55;
  g.lineWidth = Math.max(1.5, scale * 0.07);
  g.setLineDash([scale * 0.34, scale * 0.24]);
  g.beginPath();
  g.moveTo(px(0), sy(0.02));
  g.lineTo(px(WIDTH), sy(0.02));
  g.stroke();
  g.restore();

  if (aim && !busy) drawAim(g);

  // шары: видимые ряды ярко, ряды над пунктиром (ещё не спустились) — приглушённо
  g.save();
  g.beginPath();
  g.rect(px(-0.2), 0, (WIDTH + 0.4) * scale, sy(FIELD_H + 0.6));
  g.clip();
  const above = Math.ceil(offsetY / scale / ROW_H) + 1;
  const r0 = Math.max(0, Math.floor(scroll) - above);
  const r1 = Math.min(grid.length - 1, Math.ceil(scroll) + VIEW_ROWS + 1);
  const line = sy(0.02);
  for (let r = r0; r <= r1; r += 1) {
    const y = py(cellY(r), scroll);
    const alpha = y < line ? 0.38 : 1;
    for (let c = 0; c < rowCols(r); c += 1) {
      const v = grid[r][c];
      if (v !== null) drawBall(g, v, px(cellX(r, c)), y, 1, alpha);
    }
  }
  g.restore();

  for (const p of popping) drawPop(g, p);
  for (const b of falling) drawBall(g, b.value, px(b.x), py(b.y), 1, b.alpha, b.rot);
  if (flying) drawFlying(g);

  drawShooter(g);
  for (const f of floaters) drawFloater(g, f);
}

function drawBall(g, value, x, y, size = 1, alpha = 1, rot = 0) {
  const img = sprite(value, scale * size);
  const w = img.width / dpr;
  const h = img.height / dpr;
  if (alpha !== 1) g.globalAlpha = alpha;
  if (rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  } else {
    g.drawImage(img, x - w / 2, y - h / 2, w, h);
  }
  if (alpha !== 1) g.globalAlpha = 1;
}

const ballValue = () => game.armed ?? game.current;

function aimColor() {
  if (game.armed === 'fire') return '#ff8a2a';
  if (game.armed === 'bomb') return theme.line;
  if (game.armed === 'rainbow') return '#ffffff';
  return colors[game.current] ?? theme.line;
}

/** Пунктир из точек, как в видео: цветом шара, с отражением от стен, редеет к концу. */
function drawAim(g) {
  const path = aim.path;
  const color = aimColor();
  const scroll = currentScroll();
  let acc = 0;
  let prev = path[0];
  let n = 0;
  g.save();
  g.fillStyle = color;
  for (let i = 1; i < path.length; i += 1) {
    const p = path[i];
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    if (acc < 0.42) continue;
    acc = 0;
    n += 1;
    if (n < 2) continue;                            // первые точки прячутся под шаром
    g.globalAlpha = Math.max(0.25, 1 - i / path.length * 0.7);
    g.beginPath();
    g.arc(px(p.x), py(p.y, scroll), Math.max(2, scale * 0.085), 0, Math.PI * 2);
    g.fill();
  }
  // где шар встанет
  if (aim.end && game.armed !== 'fire') {
    g.globalAlpha = 0.5;
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, scale * 0.06);
    g.beginPath();
    g.arc(px(cellX(aim.end[0], aim.end[1])), py(cellY(aim.end[0]), scroll), scale * 0.46, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();

  // стрелка у стрелка, как в видео
  const len = scale * 1.25;
  const ax = px(SHOOTER_X);
  const ay = sy(SHOOTER_DY);
  const dx = Math.sin(aim.angle);
  const dy = -Math.cos(aim.angle);
  g.save();
  g.strokeStyle = theme.arrow;
  g.fillStyle = theme.arrow;
  g.lineWidth = scale * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ax + dx * scale * 0.55, ay + dy * scale * 0.55);
  g.lineTo(ax + dx * len, ay + dy * len);
  g.stroke();
  const hx = ax + dx * (len + scale * 0.2);
  const hy = ay + dy * (len + scale * 0.2);
  g.beginPath();
  g.moveTo(hx, hy);
  g.lineTo(hx - dx * scale * 0.34 - dy * scale * 0.22, hy - dy * scale * 0.34 + dx * scale * 0.22);
  g.lineTo(hx - dx * scale * 0.34 + dy * scale * 0.22, hy - dy * scale * 0.34 - dx * scale * 0.22);
  g.closePath();
  g.fill();
  g.restore();
}

function drawFlying(g) {
  const p = flying.point;
  const x = px(p.x);
  const y = py(p.y, flying.scroll);
  if (flying.kind === 'fire') {
    // огненный хвост
    const tail = flying.path.slice(Math.max(0, flying.index - 14), flying.index + 1);
    g.save();
    tail.forEach((q, i) => {
      g.globalAlpha = (i / tail.length) * 0.6;
      g.fillStyle = i % 2 ? '#ffd34d' : '#ff6a1a';
      g.beginPath();
      g.arc(px(q.x), py(q.y, flying.scroll), scale * (0.18 + (i / tail.length) * 0.3), 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  }
  drawBall(g, flying.value, x, y);
}

function drawPop(g, p) {
  const t = p.t;
  const x = px(p.x);
  const y = py(p.y);
  g.save();
  if (t < 0.45) {                                   // шар вздувается и светлеет
    const k = t / 0.45;
    drawBall(g, p.value, x, y, 1 + k * 0.3, 1 - k * 0.5);
  }
  g.globalAlpha = Math.max(0, 1 - t);               // кольцо-вспышка
  g.strokeStyle = p.kind === 'fire' ? '#ffb347' : p.color;
  g.lineWidth = Math.max(1.5, scale * 0.1 * (1 - t));
  g.beginPath();
  g.arc(x, y, scale * (0.45 + t * 0.55), 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawFloater(g, f) {
  g.save();
  g.globalAlpha = Math.max(0, 1 - f.t * f.t);
  g.font = `800 ${Math.round(scale * (f.big ? 0.72 : 0.5))}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(2, scale * 0.12);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  const x = px(f.x);
  const y = py(f.y) - f.t * scale * 1.2;
  g.strokeText(f.text, x, y);
  g.fillStyle = '#ffffff';
  g.fillText(f.text, x, y);
  g.restore();
}

function drawShooter(g) {
  // подставка под шар
  const x = px(SHOOTER_X);
  const y = sy(SHOOTER_DY);
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath();
  g.ellipse(x, y + scale * 0.46, scale * 0.62, scale * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // счётчик выстрелов слева
  drawBadge(g, px(BADGE_X), y, String(game.shots));

  const nextX = px(NEXT_X);
  const nextY = sy(SHOOTER_DY + 0.12);
  if (!flying || flying.kind !== 'ball' || reload < 1) {
    // текущий шар: после выстрела въезжает с места «следующего»
    const k = ease(Math.min(1, reload));
    const s = ease(Math.min(1, swapT));
    let cx = nextX + (x - nextX) * k;
    let cy = nextY + (y - nextY) * k;
    let size = NEXT_SIZE + (1 - NEXT_SIZE) * k;
    if (swapT < 1) {                               // обмен местами по дуге
      cx = nextX + (x - nextX) * s;
      cy = nextY + (y - nextY) * s - Math.sin(s * Math.PI) * scale * 0.7;
      size = NEXT_SIZE + (1 - NEXT_SIZE) * s;
    }
    if (!flying) drawBall(g, ballValue(), cx, cy, size);
  }

  // следующий шар и круговые стрелки «поменять»
  const shown = swapT < 1 ? 1 - ease(swapT) : Math.min(1, reload * 2);
  if (!game.armed) {
    const s = ease(Math.min(1, swapT));
    const fx0 = swapT < 1 ? x + (nextX - x) * s : nextX;
    const fy0 = swapT < 1 ? y + (nextY - y) * s + Math.sin(s * Math.PI) * scale * 0.5 : nextY;
    const size = swapT < 1 ? 1 - (1 - NEXT_SIZE) * s : NEXT_SIZE * (0.4 + 0.6 * shown);
    drawBall(g, game.next, fx0, fy0, size);
  }
  if (!game.armed) drawSwapArrows(g, nextX, nextY);
}

function drawBadge(g, x, y, text) {
  const w = scale * 1.2;
  const h = scale * 0.82;
  g.save();
  g.fillStyle = theme.badge;
  g.shadowColor = 'transparent';
  roundRect(g, x - w / 2, y - h / 2, w, h, h * 0.3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(g, x - w / 2 + 2, y - h / 2 + 2, w - 4, h * 0.42, h * 0.25);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 ${Math.round(scale * 0.5)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 1);
  g.restore();
}

function drawSwapArrows(g, x, y) {
  const rad = scale * 0.62;
  g.save();
  g.strokeStyle = theme.swap;
  g.fillStyle = theme.swap;
  g.lineWidth = scale * 0.08;
  g.lineCap = 'round';
  for (const [a0, a1] of [[-2.6, -1.2], [0.5, 1.9]]) {
    g.beginPath();
    g.arc(x, y, rad, a0, a1);
    g.stroke();
    const hx = x + Math.cos(a1) * rad;
    const hy = y + Math.sin(a1) * rad;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    g.beginPath();
    g.moveTo(hx + tx * scale * 0.16, hy + ty * scale * 0.16);
    g.lineTo(hx - ty * scale * 0.13, hy + tx * scale * 0.13);
    g.lineTo(hx + ty * scale * 0.13, hy - tx * scale * 0.13);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------- кадры ----------

function tick(ts) {
  frame = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  step(dt);
  draw();
}

function step(dt) {
  if (flying) {
    flying.progress += (dt * SPEED) / STEP;
    const index = Math.min(flying.path.length - 1, Math.floor(flying.progress));
    flying.index = index;
    flying.point = flying.path[index];
    // огонь сжигает шары по мере пролёта
    while (flying.burnAt.length && flying.burnAt[0].index <= index) {
      const { r, c } = flying.burnAt.shift();
      burnCell(r, c);
    }
    if (index >= flying.path.length - 1) {
      const done = flying.onDone;
      flying = null;
      done();
    }
  }
  for (const p of popping) p.t += dt * 3.2;
  popping = popping.filter((p) => p.t < 1);
  for (const b of falling) {
    b.vy += dt * 30;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;
    b.t += dt;
    b.alpha = Math.max(0, 1 - Math.max(0, b.t - 0.45) * 2.2);
  }
  falling = falling.filter((b) => b.alpha > 0);
  for (const f of floaters) f.t += dt * 1.25;
  floaters = floaters.filter((f) => f.t < 1);
  if (reload < 1) reload = Math.min(1, reload + dt * 5);
  if (swapT < 1) swapT = Math.min(1, swapT + dt * 4.5);
  if (scrollAnim) {
    scrollAnim.t = Math.min(1, scrollAnim.t + dt / 0.55);
    if (scrollAnim.t >= 1) {
      const done = scrollAnim.onDone;
      scrollAnim = null;
      done?.();
    }
  }
  if (game && shownScore !== game.score) {
    shownScore += Math.ceil((game.score - shownScore) * Math.min(1, dt * 8));
    if (Math.abs(game.score - shownScore) < 2) shownScore = game.score;
    renderScore();
  }
}

// ---------- ввод ----------

function pointOf(e) {
  const rect = ui.canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left - offsetX) / scale, y: (e.clientY - rect.top - offsetY) / scale };
}

function onPointerDown(e) {
  if (!game || game.over || busy || modalActive) return;
  const p = pointOf(e);
  // тап по «следующему» шару — поменять местами
  if (Math.hypot(p.x - NEXT_X, p.y - (SHOOTER_DY + 0.12)) < 0.9) {
    if (!game.armed && swap(game)) {
      swapT = 0;
      api.platform.haptic.selection();
      save();
    }
    return;
  }
  try {
    ui.canvas.setPointerCapture?.(e.pointerId);
  } catch {
    // указатель уже потерян — прицел всё равно покажем
  }
  updateAim(p);
}

function onPointerMove(e) {
  if (aim === null || busy) return;
  updateAim(pointOf(e));
}

function updateAim({ x, y }) {
  if (y > FIELD_H + 0.2) {                          // увёл палец вниз, к стрелку — выстрела не будет
    if (aim) aim.cancelled = true;
    return;
  }
  const scroll = game.scroll;
  const angle = angleTo(scroll, x, y + scroll * ROW_H);
  const path = aimPath(game, angle);
  const end = path.at(-1);
  aim = { angle, path, end: game.armed === 'fire' ? null : snapCell(game.grid, end.x, end.y), cancelled: false };
}

function onPointerUp() {
  if (!aim) return;
  const { angle, cancelled } = aim;
  aim = null;
  if (!cancelled) fire(angle);
}

// ---------- выстрел и его анимация ----------

function fire(angle) {
  if (!game || game.over || busy) return;
  const before = { grid: cloneGrid(game.grid), scroll: game.scroll };
  const value = ballValue();
  const res = shoot(game, angle);
  if (!res) return;
  busy = true;
  view = before;
  api.platform.haptic.impact('light');
  renderBonuses();

  const burnAt = res.kind === 'fire' ? res.blasted.map(([r, c]) => ({ r, c, index: nearestIndex(res.path, cellX(r, c), cellY(r)) }))
    .sort((a, b) => a.index - b.index) : [];

  if (reducedMotion()) {
    finishShot(res);
    return;
  }
  flying = {
    kind: res.kind, value, path: res.path, progress: 0, index: 0, point: res.path[0],
    scroll: before.scroll, burnAt, onDone: () => land(res, value),
  };
}

const nearestIndex = (path, x, y) => {
  let best = 0;
  let bestD = Infinity;
  path.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
};

function burnCell(r, c) {
  const v = view.grid[r][c];
  if (v === null) return;
  view.grid[r][c] = null;
  popAt(r, c, v, 'fire');
}

function popAt(r, c, value, kind = 'pop') {
  const color = isStone(value) ? theme.stone : colors[colorOf(value)] ?? '#fff';
  popping.push({ x: cellX(r, c), y: cellY(r), value, color, kind, t: 0 });
  const rect = ui.canvas.getBoundingClientRect();
  const base = root.getBoundingClientRect();
  fx?.burst(rect.left - base.left + px(cellX(r, c)), rect.top - base.top + py(cellY(r)),
    kind === 'fire' ? '#ffb347' : color, 9, { speed: 230, size: 5 });
}

/** Шар долетел: встаёт, гроздь лопается волной, повисшие падают, поле сползает. */
function land(res, value) {
  const [ir, ic] = res.cell ?? [null, null];
  if (res.cell && res.kind === 'ball') view.grid[ir][ic] = value;
  if (res.kind === 'bomb' && res.cell) shockwave(ir, ic);

  // волна: ближние лопаются первыми
  const origin = res.cell ? { x: cellX(ir, ic), y: cellY(ir) } : res.path.at(-1);
  const wave = [...res.popped.map((p) => [...p, 'pop']), ...(res.kind === 'bomb' ? res.blasted.map((p) => [...p, 'blast']) : [])]
    .map(([r, c, kind]) => ({ r, c, kind, d: Math.hypot(cellX(r, c) - origin.x, cellY(r) - origin.y) }))
    .sort((a, b) => a.d - b.d);

  const gap = wave.length > 12 ? 22 : 38;
  wave.forEach(({ r, c, kind }, i) => {
    later(() => {
      const v = view?.grid[r][c] ?? (kind === 'pop' && r === ir && c === ic ? value : null);
      if (!view) return;
      view.grid[r][c] = null;
      popAt(r, c, v ?? value, kind === 'blast' ? 'fire' : 'pop');
      if (i % 3 === 0) api.platform.haptic.impact('light');
    }, i * gap);
  });

  // цепи слетают сразу
  for (const [r, c] of res.unlocked) {
    later(() => {
      if (!view) return;
      view.grid[r][c] = colorOf(view.grid[r][c]);
      popping.push({ x: cellX(r, c), y: cellY(r), value: view.grid[r][c], color: '#c3c9d6', kind: 'chain', t: 0.4 });
    }, 60);
  }

  const afterPops = wave.length * gap + 80;
  later(() => dropLoose(res), afterPops);

  if (res.gained) {
    const at = res.popped[0] ?? res.blasted[0] ?? res.cell;
    if (at) floaters.push({ x: cellX(at[0], at[1]), y: cellY(at[0]), text: `+${res.gained}`, t: 0, big: res.gained >= 100 });
  }
  if (res.combo >= 2) later(() => showCombo(res.combo), 120);
  if (res.reward) later(() => toast.show(T.reward[res.reward], 1800), afterPops + 200);
}

function shockwave(r, c) {
  popping.push({ x: cellX(r, c), y: cellY(r), value: 'bomb', color: '#ffd34d', kind: 'blast', t: 0 });
  api.platform.haptic.impact('heavy');
  ui.wrap.classList.remove('bs-shake');
  void ui.wrap.offsetWidth;
  ui.wrap.classList.add('bs-shake');
}

function dropLoose(res) {
  if (!view) return;
  for (const [r, c] of res.dropped) {
    const v = view.grid[r][c];
    if (v === null) continue;
    view.grid[r][c] = null;
    falling.push({
      x: cellX(r, c), y: cellY(r), vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3,
      rot: 0, spin: (Math.random() - 0.5) * 6, value: v, t: 0, alpha: 1,
    });
  }
  if (res.dropped.length) {
    const [r, c] = res.dropped[Math.floor(res.dropped.length / 2)];
    floaters.push({ x: cellX(r, c), y: cellY(r), text: `+${res.dropped.length * 20}`, t: 0 });
  }
  later(() => slideDown(res), res.dropped.length ? 260 : 60);
}

/** Поле плавно сползает, когда нижние ряды расчищены (как в видео). */
function slideDown(res) {
  const from = res.scrollBefore;
  const to = res.scrollAfter;
  const done = () => finishShot(res);
  if (from === to) {
    done();
    return;
  }
  scrollAnim = { from, to, t: 0, onDone: done };
}

function finishShot(res) {
  view = null;
  busy = false;
  if (res.kind === 'ball') reload = 0;
  renderAll();
  save();
  if (game.over) later(() => endGame(game.over), reducedMotion() ? 0 : 450);
}

function showCombo(n) {
  ui.combo.textContent = T.combo(n);
  ui.combo.hidden = false;
  popIn(ui.combo, { from: 0.6 });
  clearTimeout(ui.comboTimer);
  ui.comboTimer = later(() => { if (ui) ui.combo.hidden = true; }, 1300);
}

// ---------- шапка и бонусы ----------

function renderScore() {
  if (!ui || !game) return;
  ui.score.textContent = shownScore;
  const k = Math.min(1, game.score / game.target);
  ui.barFill.style.transform = `scaleX(${k})`;
  const stars = starsFor(game);
  ui.stars.forEach((s, i) => s.classList.toggle('bs-star-on', stars > i));
}

function renderBonuses() {
  if (!ui || !game) return;
  for (const kind of BONUS_KINDS) {
    const b = ui.bonus[kind];
    b.count.textContent = game.bonuses[kind];
    b.btn.classList.toggle('bs-bonus-on', game.armed === kind);
    b.btn.classList.toggle('bs-bonus-empty', game.bonuses[kind] <= 0);
  }
}

function renderAll() {
  if (!ui || !game) return;
  ui.level.textContent = T.level(game.level);
  renderScore();
  renderBonuses();
}

function onBonus(kind) {
  if (!game || game.over || busy) return;
  if (game.bonuses[kind] <= 0 && game.armed !== kind) {
    toast.show(T.noBonus, 1800);
    return;
  }
  const wasArmed = game.armed === kind;
  if (!arm(game, kind)) return;
  api.platform.haptic.selection();
  renderBonuses();
  if (!wasArmed) toast.show(T.bonusHelp[kind], 1600);
  save();
}

// ---------- конец уровня ----------

function endGame(outcome) {
  if (finished) return;
  finished = true;
  stats = recordGame(stats, game, outcome === 'win');
  api.storage.set('stats', stats);
  if (outcome === 'win') {
    pendingNext = newLevel(game.level + 1);
    api.storage.set('current', pendingNext);                 // выход посреди окна не теряет прогресс
    api.progress(T.level(game.level + 1));
    showWin();
    return;
  }
  api.storage.remove('current');
  api.finish({
    outcome: 'lose',
    title: T.resultLose,
    score: game.score,
    variant: String(game.level),
    locale: 'ru',
    message: T.level(game.level),
  });
}

function showWin() {
  const stars = starsFor(game);
  const starEls = [0, 1, 2].map((i) => el('span', { class: `bs-win-star${i === 1 ? ' bs-win-star-mid' : ''}` }, '★'));
  openModal(el('div', { class: 'bs-win' },
    el('div', { class: 'bs-win-head' },
      el('div', { class: 'bs-win-title' }, T.win.title(game.level)),
      el('div', { class: 'bs-win-stars' }, starEls),
    ),
    el('div', { class: 'bs-win-body' },
      el('div', { class: 'bs-win-score' }, T.win.score(game.score)),
      el('button', {
        class: 'bs-win-next',
        onclick: () => {
          closeModal();
          const next = pendingNext;
          pendingNext = null;
          startLevel(next.level, null, next);
        },
      }, T.win.next),
    ),
  ));
  starEls.forEach((s, i) => later(() => {
    if (i < stars) {
      s.classList.add('bs-win-star-on');
      popIn(s, { from: 0.3, duration: 320 });
    }
  }, 300 + i * 260));
  fx?.confetti(colors, 90);
}

function startLevel(level, saved = null, fresh = null) {
  game = saved ?? fresh ?? newLevel(level);
  finished = false;
  view = null;
  busy = false;
  aim = null;
  flying = null;
  popping = [];
  falling = [];
  floaters = [];
  scrollAnim = null;
  reload = 1;
  swapT = 1;
  shownScore = game.score;
  if (ui) ui.combo.hidden = true;
  renderAll();
  save();
  // уровень «спускается» сверху при появлении
  if (!reducedMotion() && !saved) scrollAnim = { from: game.scroll + 4, to: game.scroll, t: 0 };
  draw();
}

// ---------- окна ----------

function openModal(content) {
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  hideLayer(ui.modal).then(() => {
    if (ui && !modalActive) ui.modal.replaceChildren();
  });
}

function card(title, ...children) {
  return el('div', { class: 'bs-card' },
    el('div', { class: 'bs-card-head' },
      el('h2', { class: 'bs-card-title' }, title),
      el('button', { class: 'bs-close', 'aria-label': T.menu.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showMenu() {
  const item = (value, label) => el('div', { class: 'bs-stat' },
    el('div', { class: 'bs-stat-value' }, String(value)), el('div', { class: 'bs-stat-label' }, label));
  const skins = SKINS.map((skin) => el('button', {
    class: `bs-skin${skin === settings.skin ? ' bs-skin-on' : ''}`,
    'data-skin': skin,
    onclick: (e) => {
      settings.skin = skin;
      host.dataset.skin = skin;
      api.storage.set('settings', settings);
      readPalette();
      e.currentTarget.parentElement.querySelectorAll('.bs-skin').forEach((b) => b.classList.toggle('bs-skin-on', b.dataset.skin === skin));
    },
  }, el('span', { class: 'bs-skin-dot' }), T.skins[skin]));

  openModal(card(T.menu.title,
    el('div', { class: 'bs-stats-grid' },
      item(stats.played, T.stats.played), item(stats.cleared, T.stats.cleared),
      item(stats.bestLevel, T.stats.bestLevel), item(stats.bestScore, T.stats.bestScore),
    ),
    el('p', { class: 'bs-note' }, T.menu.skin),
    el('div', { class: 'bs-skins' }, skins),
    el('button', { class: 'btn btn-secondary bs-restart', onclick: () => { closeModal(); startLevel(game.level); } }, T.menu.restart),
  ));
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"'
  + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/>'
  + '<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';

function bonusButton(kind) {
  const count = el('span', { class: 'bs-bonus-count' });
  const btn = el('button', {
    class: `bs-bonus bs-bonus-${kind}`, 'aria-label': T.bonus[kind], title: T.bonus[kind], onclick: () => onBonus(kind),
  }, el('span', { class: 'bs-bonus-icon' }), count);
  return { btn, count };
}

export default {
  id: 'bubble-shooter',
  title: 'Шарики',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'classic' };
    host.dataset.skin = settings.skin;

    const canvas = el('canvas', { class: 'bs-canvas' });
    const gear = el('button', { class: 'bs-gear', 'aria-label': T.menu.title, onclick: showMenu });
    gear.innerHTML = GEAR;
    ui = {
      canvas,
      ctx: canvas.getContext('2d'),
      level: el('div', { class: 'bs-level' }),
      score: el('div', { class: 'bs-score-value' }),
      barFill: el('div', { class: 'bs-bar-fill' }),
      stars: [0.3, 0.6, 1].map((k) => el('span', { class: 'bs-star', style: `left: ${k * 100}%` }, '★')),
      combo: el('div', { class: 'bs-combo', hidden: true }),
      modal: el('div', { class: 'bs-modal', hidden: true }),
      bonus: Object.fromEntries(BONUS_KINDS.map((k) => [k, bonusButton(k)])),
    };
    ui.wrap = el('div', { class: 'bs-wrap' }, canvas, ui.combo);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => { aim = null; });

    root = el('div', { class: 'bs' },
      el('div', { class: 'bs-top' },
        gear,
        el('div', { class: 'bs-bar' }, ui.barFill, ...ui.stars),
        el('div', { class: 'bs-score' }, el('div', { class: 'bs-score-label' }, T.score), ui.score),
      ),
      ui.level,
      ui.wrap,
      el('div', { class: 'bs-bonuses' }, BONUS_KINDS.map((k) => ui.bonus[k].btn)),
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'bs-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);

    readPalette();
    const saved = isValidState(savedGame) && !savedGame.over ? savedGame : null;
    startLevel(saved?.level ?? 1, saved);

    ui.observer = new ResizeObserver(() => resize());
    ui.observer.observe(ui.wrap);
    resize();
    lastTs = performance.now();
    frame = requestAnimationFrame(tick);
    if (stats.played === 0) later(() => toast?.show(T.aimHelp, 3400), 700);

    // Для проверки из Claude (как ?fbdebug во Flappy Burger): доступ к состоянию и выстрелу.
    if (new URLSearchParams(location.search).has('bsdebug')) {
      window.__bubble = {
        get game() { return game; }, get view() { return view; }, get busy() { return busy; },
        get anim() { return { popping: popping.length, falling: falling.length, flying: Boolean(flying) }; },
        fire, step: (dt) => { step(dt); draw(); }, setAim: (x, y) => updateAim({ x, y }),
      };
    }
  },

  getState() {
    if (!game || finished) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    cancelAnimationFrame(frame);
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    ui?.observer?.disconnect();
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = fx = game = null;
    view = aim = flying = scrollAnim = null;
    popping = [];
    falling = [];
    floaters = [];
    busy = false;
    finished = false;
    pendingNext = null;
    modalActive = false;
    if (window.__bubble) delete window.__bubble;
  },
};
