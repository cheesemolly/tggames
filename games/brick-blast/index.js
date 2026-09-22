// Brick Blast (по видео владельца): прицелься пальцем по полю или ползунком под ним, отпусти — шарики летят
// очередью, отскакивают и разбивают блоки с числами. После хода уровень опускается на ряд; блок дошёл до
// нижнего ряда — уровень не пройден. Бонусы-кольца: лазеры (ряд / столбец / крест), ×3 шарика, разброс.
// Поле рисуется на Canvas (шариков бывает несколько сотен). Партия, статистика, скин — в api.storage игры.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, shake, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  COLS, ROWS, BALL_R, POWER_R, MIN_ANGLE, newLevel, startTurn, step, recall, endTurn, danger, tracePath, aimAngle,
  polygon, progress, isValidState, emptyStats, isValidStats,
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
  completed: 'Пройден',
  next: (n) => `Уровень ${n}`,
  loseTitle: 'Блоки дошли до низа',
  loseMessage: (n) => `Уровень ${n} — попробуй ещё раз`,
  restart: 'Заново',
  restartQuestion: 'Начать этот уровень заново?',
  cancelBtn: 'Отмена',
  newLevel: 'Начать уровень заново',
  stats: {
    open: 'Статистика', title: 'Статистика', level: 'Уровень', cleared: 'Пройдено', bestLevel: 'Лучший уровень',
    bricks: 'Разбито блоков', shots: 'Бросков', fails: 'Неудач', close: 'Закрыть',
  },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', close: 'Закрыть' },
  skins: { telegram: 'Как в Telegram', classic: 'Классика', neon: 'Неон', candy: 'Конфета', forest: 'Лес', graphite: 'Графит' },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
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
let lasers = [];                   // { axis, r, c, t }
let shiftAnim = null;              // { from: сдвиг в рядах, t0 }
let intro = null;                  // появление уровня: { t0 }
let modalActive = false;
let modalToken = 0;
let lastHaptic = 0;
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

const save = () => (pending ?? game) && api?.storage.set('current', pending ?? game);

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

function drawBlock(c, b, dy, now) {
  const r = b.r + dy;
  if (r < -1) return;
  const color = tierColor(b.hp);
  const flash = flashes.get(b.id);
  const k = flash ? Math.max(0, 1 - (now - flash) / 160) : 0;
  c.save();
  if (k > 0) {
    c.shadowColor = color;
    c.shadowBlur = 14 * k;
  }
  if (b.shape === 'sq') {
    roundRect(c, b.c + 0.04, r + 0.04, 0.92, 0.92, 0.1);
    c.fillStyle = color;
    c.fill();
    c.shadowBlur = 0;
    // фаска: светлый верх, тёмный низ
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(b.c, r, 1, 0.1);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(b.c, r + 0.86, 1, 0.14);
    if (k > 0) {
      c.fillStyle = `rgba(255,255,255,${0.55 * k})`;
      c.fillRect(b.c, r, 1, 1);
    }
    c.restore();
  } else {
    const pts = insetPoly(b.shape, r, b.c, 0.045);
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.shadowBlur = 0;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 0.05;
    c.stroke();
    if (k > 0) {
      c.fillStyle = `rgba(255,255,255,${0.55 * k})`;
      c.fill();
    }
  }
  c.restore();
  // число: у квадрата — в центре, у треугольника — ближе к прямому углу
  const pos = {
    sq: [0.5, 0.52], tl: [0.33, 0.35], tr: [0.67, 0.35], bl: [0.33, 0.7], br: [0.67, 0.7],
  }[b.shape];
  c.fillStyle = palette.number;
  c.font = `700 ${b.shape === 'sq' ? 0.34 : 0.27}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(b.hp), b.c + pos[0], r + pos[1]);
}

function drawPower(c, p, dy, now) {
  const r = p.r + dy;
  if (r < 0) return;
  const x = p.c + 0.5;
  const y = r + 0.5;
  const color = p.kind.startsWith('laser') ? palette.power.laser : palette.power[p.kind];
  const pulse = 1 + Math.sin(now / 260 + p.id) * 0.06;
  c.save();
  c.translate(x, y);
  c.scale(pulse, pulse);
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

function drawBalls(c, balls, color) {
  c.fillStyle = color;
  c.beginPath();
  for (const b of balls) {
    c.moveTo(b.x + BALL_R, b.y);
    c.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
  }
  c.fill();
}

function draw() {
  if (!ui || !palette || !game) return;
  const c = ui.ctx;
  const now = performance.now();
  c.clearRect(0, 0, COLS, FIELD_H);
  // поле и полосы столбцов
  c.fillStyle = palette.field;
  c.fillRect(0, 0, COLS, ROWS);
  c.strokeStyle = palette.grid;
  c.lineWidth = 0.02;
  for (let k = 1; k < COLS; k++) {
    c.beginPath();
    c.moveTo(k, 0);
    c.lineTo(k, ROWS);
    c.stroke();
  }
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
  for (const b of game.blocks) drawBlock(c, b, dy, now);
  // лазеры
  lasers = lasers.filter((l) => now - l.t < 280);
  for (const l of lasers) {
    const k = 1 - (now - l.t) / 280;
    c.save();
    c.strokeStyle = palette.laser;
    c.shadowColor = palette.laser;
    c.shadowBlur = 16;
    c.globalAlpha = k;
    c.lineWidth = 0.14 * k + 0.03;
    c.beginPath();
    if (l.axis === 'h') {
      c.moveTo(0, l.r + 0.5);
      c.lineTo(COLS, l.r + 0.5);
    } else {
      c.moveTo(l.c + 0.5, 0);
      c.lineTo(l.c + 0.5, ROWS);
    }
    c.stroke();
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
  if (sim) drawBalls(c, sim.balls.filter((b) => b.active), ballColor);
  c.restore();
  // линия запуска, шарик и счётчик
  c.fillStyle = palette.grid;
  c.fillRect(0, ROWS, COLS, 0.02);
  const waiting = phase === 'aim' || phase === 'shift' || (sim && sim.launched < sim.count);
  if (waiting) {
    const x = sim && phase === 'fly' ? sim.x0 : game.x;
    drawBalls(c, [{ x, y: ROWS - BALL_R }], ballColor);
    const left = phase === 'fly' && sim ? sim.count - sim.launched : (game.triple ? game.balls * 3 : game.balls);
    c.fillStyle = ballColor;
    c.font = '600 0.3px system-ui, -apple-system, "Segoe UI", sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = x > COLS - 1.2 ? 'right' : 'left';
    c.fillText(`×${left}`, x + (x > COLS - 1.2 ? -0.22 : 0.22), ROWS + 0.26);
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
    const speed = sim.t > 10 ? 2.4 : sim.t > 5 ? 1.6 : 1;
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

const needsFrames = () => phase === 'fly' || shiftAnim || intro || lasers.length || flashes.size
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
  for (const e of sim.events) {
    if (e.type === 'hit') flashes.set(e.id, now);
    else if (e.type === 'break') {
      flashes.delete(e.id);
      stats.bricks += 1;
      burstAt(e.c + 0.5, e.r + 0.5, tierColor(e.max));
      if (now - lastHaptic > 60) {
        api.platform.haptic.impact('light');
        lastHaptic = now;
      }
    } else if (e.type === 'laser') lasers.push({ ...e, t: now });
    else if (e.type === 'triple') {
      toast.show(T.triple, 1800);
      api.platform.haptic.notification('success');
    }
  }
  sim.events.length = 0;
  for (const [id, t] of flashes) if (now - t > 200) flashes.delete(id);
  renderProgress();
}

function burstAt(x, y, color) {
  const cr = ui.canvas.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  fx?.burst(cr.left - rr.left + x * cell, cr.top - rr.top + y * cell, color, 8, { speed: 200, size: 5 });
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
  api.platform.haptic.impact('medium');
  kick();
}

function finishTurn() {
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
  if (danger(game)) api.platform.haptic.notification('warning');
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
  api.platform.haptic.notification('success');
  renderProgress(1);
  later(() => {
    if (!ui) return;
    fx?.confetti([...palette.tiers, palette.ball], 140);
    openModal(el('div', { class: 'bk-card bk-won', role: 'dialog' },
      el('h2', { class: 'bk-won-title' }, T.wonTitle),
      miniature(done.pattern),
      el('div', { class: 'bk-won-badge' }, `${T.level(done.level)} — ${T.completed}`),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          game = pending;
          pending = null;
          startLevel(true);
        },
      }, T.next(done.level + 1)),
    ));
  }, reducedMotion() ? 0 : 500);
}

function lost() {
  phase = 'lost';
  ui.bottom.dataset.mode = 'none';
  stats.fails += 1;
  api.storage.set('stats', stats);
  const failed = game.level;
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

/** Миниатюра уровня для окна победы (как в видео). */
function miniature(pattern) {
  const canvas = el('canvas', { class: 'bk-mini' });
  const size = 7;
  const w = COLS * size;
  const h = pattern.rows * size;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = '176px';
  canvas.style.height = `${(176 * pattern.rows) / COLS}px`;
  const c = canvas.getContext('2d');
  c.setTransform(dpr * size, 0, 0, dpr * size, 0, 0);
  c.fillStyle = palette.field;
  c.fillRect(0, 0, COLS, pattern.rows);
  for (const x of pattern.cells) {
    const pts = polygon(x.shape, pattern.rows - 1 - x.k, x.c);
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.fillStyle = tierColor(x.hp);
    c.fill();
    c.strokeStyle = palette.field;
    c.lineWidth = 0.12;
    c.stroke();
  }
  return canvas;
}

function startLevel(animateIn) {
  phase = 'aim';
  sim = null;
  aim = null;
  flashes.clear();
  lasers = [];
  shiftAnim = null;
  ui.sub.textContent = T.level(game.level);
  ui.bottom.dataset.mode = 'aim';
  syncSlider();
  renderProgress();
  if (animateIn && !reducedMotion()) intro = { t0: performance.now() };
  kick();
}

// ---------- прогресс ----------

function renderProgress(force) {
  const p = force ?? progress(game);
  ui.fill.style.transform = `scaleX(${p})`;
  ui.stars.forEach((star, k) => {
    const on = p >= [1 / 3, 2 / 3, 1][k] - 1e-9;
    if (on && !star.classList.contains('bk-star-on')) {
      star.classList.add('bk-star-on');
      pop(star, { from: 0.3, duration: 360 });
    } else if (!on) star.classList.remove('bk-star-on');
  });
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
  api.platform.haptic.impact('light');
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
      draw();
    },
  }, el('span', { class: 'bk-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title,
    el('h3', { class: 'bk-section' }, T.settings.skin),
    el('div', { class: 'bk-skins', role: 'radiogroup' }, buttons),
  ));
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
    const [saved, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
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
    ui.stars = [0, 1, 2].map((k) => el('div', { class: 'bk-star', style: `left: ${[33.3, 66.6, 100][k]}%` }, '★'));
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
        el('div', { class: 'bk-actions' },
          iconButton(ICONS.restart, T.newLevel, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bk-progress' }, el('div', { class: 'bk-progress-track' }, ui.fill), ...ui.stars),
      ui.wrap,
      ui.bottom,
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'bk-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);

    readPalette();
    ui.resizeObserver = new ResizeObserver(() => resize());
    ui.resizeObserver.observe(ui.wrap);

    const fresh = !isValidState(saved);
    game = fresh ? newLevel(1) : saved;
    if (fresh) save();
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
    api = host = root = ui = toast = fx = game = pending = sim = aim = shiftAnim = intro = palette = null;
    phase = 'aim';
    flashes.clear();
    lasers = [];
    modalActive = false;
  },
};

