// «Шарики» (bubble shooter) по видео владельца. Поле — Canvas: шары, пунктир прицела, полёт, лопание.
// Прицел как в Brick Blast: ведёшь пальцем по полю — видно пунктир с отражением от стен, отпускаешь —
// выстрел. Тап по «следующему» шару меняет его местами с текущим.
//
// Правила и вся математика — в logic.js (без DOM). Здесь только рисование, ввод и анимации.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, pop as popIn, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  COLS, R, ROW_H, WIDTH, DEADLINE_ROW, COLORS, SPEED, MAX_ROWS,
  rowCols, cellX, cellY, emptyGrid, countBubbles,
  newLevel, shoot, swap, aimPath, angleTo, isValidState, emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'neon', 'candy'];
const FIELD_H = DEADLINE_ROW * ROW_H + 2 * R;     // высота поля в диаметрах шара
const SHOOTER = { x: WIDTH / 2, y: DEADLINE_ROW * ROW_H + R };

const T = {
  title: 'Шарики',
  sub: (level) => `Уровень ${level}`,
  shots: 'Выстрелов',
  score: 'Очки',
  combo: (n) => `Комбо ×${n}`,
  aimHelp: 'Веди пальцем по полю — увидишь траекторию. Отпусти — выстрел.',
  swapHint: 'Тапни по следующему шару, чтобы поменять их местами',
  win: { title: 'Поле очищено!', next: (n) => `Уровень ${n}`, again: 'Ещё раз' },
  loseShots: 'Выстрелы кончились',
  loseLow: 'Шары дошли до низа',
  resultLose: 'Игра окончена',
  newGame: 'Начать заново',
  restartQuestion: 'Начать этот уровень заново?',
  restart: 'Начать заново',
  cancel: 'Отмена',
  stats: {
    open: 'Статистика', title: 'Статистика', played: 'Партий', cleared: 'Уровней пройдено',
    bestLevel: 'Лучший уровень', bestScore: 'Рекорд очков', close: 'Закрыть',
  },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', close: 'Закрыть' },
  skins: { telegram: 'Как в Telegram', classic: 'Классика', neon: 'Неон', candy: 'Конфета' },
};

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none"`
  + ` stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
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

let scale = 20;                 // пикселей в одном диаметре шара
let offsetX = 0;
let offsetY = 0;
let palette = [];               // цвета шаров, прочитанные из CSS
let sprites = new Map();        // готовые картинки шаров: цвет → canvas

let aim = null;                 // { angle, path } пока целимся
let flying = null;              // { color, path, index, onDone }
let popping = [];               // лопающиеся: { x, y, color, t }
let dropping = [];              // падающие: { x, y, vy, color }
let floaters = [];              // всплывающие очки: { x, y, text, t }
let comboText = null;
let frame = 0;
let lastTs = 0;
let modalActive = false;
let finished = false;
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
  api?.progress(T.sub(game.level));
  api?.storage.set('current', game);
};

// ---------- цвета и картинки ----------

/** Canvas не понимает var() — читаем цвета через проверочный элемент, как в Brick Blast. */
function readPalette() {
  const probe = el('div', { class: 'bs-probe' });
  root.appendChild(probe);
  const styles = getComputedStyle(probe);
  palette = Array.from({ length: COLORS }, (_, i) => styles.getPropertyValue(`--bs-c${i + 1}`).trim() || '#888');
  ui.bg = styles.getPropertyValue('--bs-field').trim() || '#0b1a2b';
  ui.line = styles.getPropertyValue('--bs-line').trim() || '#ffffff';
  probe.remove();
  sprites = new Map();
}

/** Глянцевый шар рисуется один раз на цвет и дальше просто копируется. */
function sprite(color) {
  const key = `${color}:${Math.round(scale)}`;
  if (sprites.has(key)) return sprites.get(key);
  const size = Math.max(8, Math.round(scale));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const base = palette[color] ?? '#888';

  const grad = g.createRadialGradient(size * 0.36, size * 0.32, size * 0.05, size * 0.5, size * 0.55, size * 0.52);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.28, base);
  grad.addColorStop(1, shade(base, -0.35));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  g.fill();

  g.globalAlpha = 0.55;                       // блик
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(size * 0.36, size * 0.3, size * 0.16, size * 0.11, -0.5, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  sprites.set(key, c);
  return c;
}

/** Затемнить или осветлить цвет (для объёма). */
function shade(color, amount) {
  const m = color.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return color;
  const mix = (v) => {
    const n = parseInt(v, 16);
    const out = amount < 0 ? n * (1 + amount) : n + (255 - n) * amount;
    return Math.max(0, Math.min(255, Math.round(out))).toString(16).padStart(2, '0');
  };
  return `#${mix(m[1])}${mix(m[2])}${mix(m[3])}`;
}

// ---------- размеры ----------

function resize() {
  if (!ui?.canvas) return;
  const box = ui.wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.floor(box.width));
  const h = Math.max(1, Math.floor(box.height));
  ui.canvas.width = Math.floor(w * dpr);
  ui.canvas.height = Math.floor(h * dpr);
  ui.canvas.style.width = `${w}px`;
  ui.canvas.style.height = `${h}px`;
  ui.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  scale = Math.min(w / WIDTH, h / FIELD_H);
  offsetX = (w - WIDTH * scale) / 2;
  offsetY = (h - FIELD_H * scale) / 2;
  sprites = new Map();
  draw();
}

const px = (x) => offsetX + x * scale;
const py = (y) => offsetY + y * scale;

// ---------- рисование ----------

function draw() {
  if (!ui?.ctx || !game) return;
  const g = ui.ctx;
  const w = ui.canvas.width / (window.devicePixelRatio || 1);
  const h = ui.canvas.height / (window.devicePixelRatio || 1);
  g.clearRect(0, 0, w, h);

  // поле
  g.fillStyle = ui.bg;
  roundRect(g, px(0), py(0), WIDTH * scale, FIELD_H * scale, 12 * (scale / 24));
  g.fill();

  drawDeadline(g);
  if (aim) drawAim(g);

  for (let r = 0; r < MAX_ROWS; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      const color = game.grid[r][c];
      if (color !== null) drawBubble(g, cellX(r, c), cellY(r), color);
    }
  }

  for (const b of dropping) drawBubble(g, b.x, b.y, b.color, 1);
  for (const p of popping) drawPop(g, p);
  if (flying) drawBubble(g, flying.point.x, flying.point.y, flying.color);

  drawShooter(g);
  for (const f of floaters) drawFloater(g, f);
}

function drawBubble(g, x, y, color, alpha = 1) {
  const img = sprite(color);
  const size = scale;
  if (alpha !== 1) g.globalAlpha = alpha;
  g.drawImage(img, px(x) - size / 2, py(y) - size / 2, size, size);
  if (alpha !== 1) g.globalAlpha = 1;
}

function drawDeadline(g) {
  const y = py(DEADLINE_ROW * ROW_H);
  g.save();
  g.strokeStyle = ui.line;
  g.globalAlpha = 0.35;
  g.lineWidth = Math.max(1, scale * 0.06);
  g.setLineDash([scale * 0.4, scale * 0.3]);
  g.beginPath();
  g.moveTo(px(0), y);
  g.lineTo(px(WIDTH), y);
  g.stroke();
  g.restore();
}

function drawAim(g) {
  g.save();
  g.strokeStyle = palette[game.current] ?? ui.line;
  g.globalAlpha = 0.8;
  g.lineWidth = Math.max(1.5, scale * 0.09);
  g.setLineDash([scale * 0.22, scale * 0.3]);
  g.lineCap = 'round';
  g.beginPath();
  aim.path.forEach((p, i) => {
    if (i === 0) g.moveTo(px(p.x), py(p.y));
    else g.lineTo(px(p.x), py(p.y));
  });
  g.stroke();

  const end = aim.path.at(-1);
  g.globalAlpha = 0.35;                       // подсказка, куда встанет шар
  g.setLineDash([]);
  g.beginPath();
  g.arc(px(end.x), py(end.y), scale / 2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawShooter(g) {
  const x = px(SHOOTER.x);
  const y = py(SHOOTER.y);
  g.save();
  g.globalAlpha = 0.25;
  g.fillStyle = ui.line;
  g.beginPath();
  g.arc(x, y, scale * 0.78, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (!flying) drawBubble(g, SHOOTER.x, SHOOTER.y, game.current);
}

function drawPop(g, p) {
  const t = p.t;
  g.save();
  g.globalAlpha = Math.max(0, 1 - t);
  g.strokeStyle = palette[p.color] ?? ui.line;
  g.lineWidth = Math.max(1, scale * 0.08);
  g.beginPath();
  g.arc(px(p.x), py(p.y), (0.5 + t * 0.6) * scale, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawFloater(g, f) {
  g.save();
  g.globalAlpha = Math.max(0, 1 - f.t);
  g.fillStyle = ui.line;
  g.font = `700 ${Math.round(scale * 0.62)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.fillText(f.text, px(f.x), py(f.y) - f.t * scale * 1.6);
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

  if (flying) {
    flying.progress += dt * SPEED / 0.06;          // путь записан шагами по 0.06 диаметра
    const index = Math.min(flying.path.length - 1, Math.floor(flying.progress));
    flying.point = flying.path[index];
    if (index >= flying.path.length - 1) {
      const done = flying.onDone;
      flying = null;
      done();
    }
  }

  for (const p of popping) p.t += dt * 2.6;
  popping = popping.filter((p) => p.t < 1);

  for (const b of dropping) {
    b.vy += dt * 26;
    b.y += b.vy * dt;
  }
  dropping = dropping.filter((b) => b.y < FIELD_H + 2);

  for (const f of floaters) f.t += dt * 1.1;
  floaters = floaters.filter((f) => f.t < 1);

  draw();
}

// ---------- ввод ----------

function pointOf(e) {
  const rect = ui.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - offsetX) / scale,
    y: (e.clientY - rect.top - offsetY) / scale,
  };
}

function onPointerDown(e) {
  if (!game || game.over || flying || modalActive) return;
  try {
    ui.canvas.setPointerCapture?.(e.pointerId);     // палец может уйти за край поля — ведём его дальше
  } catch {
    // указателя уже нет (бывает при синтетических событиях) — прицел всё равно покажем
  }
  updateAim(e);
}

function onPointerMove(e) {
  if (!aim) return;
  updateAim(e);
}

function updateAim(e) {
  const { x, y } = pointOf(e);
  if (y > SHOOTER.y - 0.2) {                       // ниже стрелка целиться некуда
    aim = null;
    draw();
    return;
  }
  const angle = angleTo(x, y);
  aim = { angle, path: aimPath(game.grid, angle) };
  draw();
}

function onPointerUp() {
  if (!aim) return;
  const { angle } = aim;
  aim = null;
  fire(angle);
}

function fire(angle) {
  if (!game || game.over || flying) return;
  const color = game.current;
  const res = shoot(game, angle);
  if (!res) return;
  api.platform.haptic.impact('light');
  renderInfo();

  const run = () => afterHit(res);
  if (reducedMotion()) {
    run();
    return;
  }
  flying = { color, path: res.path, progress: 0, point: res.path[0], onDone: run };
}

function afterHit(res) {
  // лопнувшие: колечки и искры, упавшие — валятся вниз
  for (const [r, c] of res.popped) {
    popping.push({ x: cellX(r, c), y: cellY(r), color: game.current, t: 0 });
    fx?.burst(px(cellX(r, c)) + fxOffsetX(), py(cellY(r)) + fxOffsetY(),
      palette[game.current] ?? '#fff', 7, { speed: 180, size: 5 });
  }
  for (const [r, c] of res.dropped) {
    dropping.push({ x: cellX(r, c), y: cellY(r), vy: 2, color: game.grid[r]?.[c] ?? 0 });
  }
  if (res.gained) {
    const [fr, fc] = res.popped[0] ?? res.cell ?? [0, 0];
    floaters.push({ x: cellX(fr, fc), y: cellY(fr), text: `+${res.gained}`, t: 0 });
  }
  if (res.combo >= 2) {
    comboText = T.combo(res.combo);
    ui.combo.textContent = comboText;
    ui.combo.hidden = false;
    popIn(ui.combo, { from: 0.7 });
    later(() => { if (ui) ui.combo.hidden = true; }, 1200);
  } else {
    ui.combo.hidden = true;
  }

  renderInfo();
  save();
  if (game.over) later(() => endGame(game.over), reducedMotion() ? 0 : 700);
}

const fxOffsetX = () => ui.canvas.getBoundingClientRect().left - root.getBoundingClientRect().left;
const fxOffsetY = () => ui.canvas.getBoundingClientRect().top - root.getBoundingClientRect().top;

// ---------- экраны ----------

function renderInfo() {
  if (!ui || !game) return;
  ui.sub.textContent = T.sub(game.level);
  ui.shots.textContent = game.shots;
  ui.score.textContent = game.score;
  ui.next.style.background = palette[game.next] ?? '#888';
  ui.nextWrap.title = T.swapHint;
}

function endGame(outcome) {
  if (finished) return;
  finished = true;
  stats = recordGame(stats, game, outcome === 'win');
  api.storage.set('stats', stats);
  api.storage.remove('current');

  if (outcome === 'win') {
    showWin();
    return;
  }
  api.finish({
    outcome: 'lose',
    title: T.resultLose,
    score: game.score,
    variant: String(game.level),
    locale: 'ru',
    message: game.shots <= 0 ? T.loseShots : T.loseLow,
  });
}

function showWin() {
  const next = game.level + 1;
  openModal(card(T.win.title,
    el('p', { class: 'bs-note' }, `${T.score}: ${game.score}`),
    el('div', { class: 'bs-card-actions' },
      el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(next); } }, T.win.next(next)),
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); startLevel(game.level); } }, T.win.again),
    ),
  ));
}

function startLevel(level) {
  game = newLevel(level);
  finished = false;
  aim = null;
  flying = null;
  popping = [];
  dropping = [];
  floaters = [];
  if (ui) ui.combo.hidden = true;
  renderInfo();
  save();
  draw();
}

// ---------- окна ----------

function card(title, ...children) {
  return el('div', { class: 'bs-card' },
    el('div', { class: 'bs-card-head' },
      el('h2', { class: 'bs-card-title' }, title),
      el('button', { class: 'bs-icon-btn', 'aria-label': T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

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

function showStats() {
  const item = (value, label) => el('div', { class: 'bs-stat' },
    el('div', { class: 'bs-stat-value' }, String(value)), el('div', { class: 'bs-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'bs-stats-grid' },
    item(stats.played, T.stats.played),
    item(stats.cleared, T.stats.cleared),
    item(stats.bestLevel, T.stats.bestLevel),
    item(stats.bestScore, T.stats.bestScore),
  )));
}

function showSettings() {
  const buttons = SKINS.map((skin) => el('button', {
    class: `bs-skin${skin === settings.skin ? ' bs-skin-on' : ''}`,
    'data-skin': skin,
    onclick: () => {
      settings.skin = skin;
      host.dataset.skin = skin;
      api.storage.set('settings', settings);
      readPalette();
      draw();
      for (const b of buttons) b.classList.toggle('bs-skin-on', b.dataset.skin === skin);
    },
  }, el('span', { class: 'bs-skin-dot' }), T.skins[skin]));
  openModal(card(T.settings.title,
    el('p', { class: 'bs-note' }, T.settings.skin),
    el('div', { class: 'bs-skins' }, buttons),
  ));
}

function askRestart() {
  if (!game) return;
  openModal(card(T.newGame,
    el('p', { class: 'bs-note' }, T.restartQuestion),
    el('div', { class: 'bs-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(game.level); } }, T.restart),
    ),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bs-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
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
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;

    const canvas = el('canvas', { class: 'bs-canvas' });
    ui = {
      sub: el('div', { class: 'bs-sub' }),
      shots: el('b', {}),
      score: el('b', {}),
      combo: el('div', { class: 'bs-combo', hidden: true }),
      next: el('span', { class: 'bs-next-dot' }),
      canvas,
      ctx: canvas.getContext('2d'),
      modal: el('div', { class: 'bs-modal', hidden: true }),
    };
    ui.nextWrap = el('button', { class: 'bs-next', onclick: () => { if (swap(game)) { renderInfo(); draw(); } } },
      el('span', { class: 'bs-next-label' }, '↔'), ui.next);
    ui.wrap = el('div', { class: 'bs-wrap' }, canvas, ui.combo);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => { aim = null; draw(); });

    root = el('div', { class: 'bs' },
      el('div', { class: 'bs-header' },
        el('div', {}, el('div', { class: 'bs-title' }, T.title), ui.sub),
        el('div', { class: 'bs-actions' },
          iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bs-info' },
        el('span', {}, `${T.shots}: `, ui.shots),
        el('span', {}, `${T.score}: `, ui.score),
        ui.nextWrap,
      ),
      ui.wrap,
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'bs-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);

    readPalette();
    const saved = isValidState(savedGame) && !savedGame.over ? savedGame : null;
    if (saved) {
      game = saved;
      finished = false;
      renderInfo();
      save();
    } else {
      startLevel(savedGame?.level && savedGame.over ? savedGame.level : 1);
    }

    ui.observer = new ResizeObserver(() => resize());
    ui.observer.observe(ui.wrap);
    resize();
    frame = requestAnimationFrame(tick);
    if (stats.played === 0) later(() => toast?.show(T.aimHelp, 3400), 600);
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
    fx?.destroy?.();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = fx = game = null;
    aim = flying = null;
    popping = [];
    dropping = [];
    floaters = [];
    comboText = null;
    finished = false;
    modalActive = false;
  },
};
