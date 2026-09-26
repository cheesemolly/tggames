// Block Blast: поле 8×8, три фигуры в лотке, перетаскивание пальцем. Заполненные строки и столбцы сгорают.
// Эффекты растут вместе с комбо: свечение → радужное свечение → молнии, вспышка и конфетти.
// Партия, статистика и настройки — в api.storage игры: 'current', 'stats', 'settings'.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { SHAPE_BY_ID } from './pieces.js';
import {
  SIZE, canPlace, fitsAnywhere, linesAfter, lineCells, placePiece, isGameOver, trayEmpty, dealTray,
  newGame, isValidState, emptyStats, recordGame, isValidStats,
} from './logic.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';

const SKINS = ['telegram', 'classic', 'sky', 'dark', 'wood', 'neon', 'candy'];
const T = {
  title: 'Block Blast',
  best: (n) => `Рекорд: ${n}`,
  combo: (n) => (n > 1 ? `Комбо ${n}` : 'Комбо'),
  allClear: 'Чистое поле!',
  noMoves: 'Больше некуда ставить',
  newGame: 'Новая игра',
  restartQuestion: 'Начать заново? Текущая партия будет потеряна.',
  restart: 'Начать заново',
  cancel: 'Отмена',
  overTitle: 'Игра окончена',
  over: (combo, lines) => `Лучшее комбо: ${combo} · линий: ${lines}`,
  stats: {
    open: 'Статистика', title: 'Статистика', played: 'Сыграно', best: 'Рекорд', average: 'Средний счёт',
    maxCombo: 'Лучшее комбо', lines: 'Линий сожжено', close: 'Закрыть',
  },
  settings: { open: 'Настройки', title: 'Оформление', close: 'Закрыть' },
  skins: {
    telegram: 'По умолчанию', classic: 'Классика', sky: 'Небо', dark: 'Графит',
    wood: 'Дерево', neon: 'Неон', candy: 'Конфета',
  },
};

const svg = (body, fill = false) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svg('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
};

const CLEAR_MS = 380;          // сколько длится сгорание линий
const LIFT_CELLS = 1.3;        // фигура при перетаскивании — выше пальца, чтобы её было видно

let api = null;
let host = null;
let root = null;
let ui = null;
let fx = null;
let toast = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram' };
let drag = null;               // текущее перетаскивание
let busy = false;              // идёт анимация сгорания — новые ходы ждут
let finished = false;
let shownScore = 0;
let scoreRaf = 0;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
// звуки (в бете: api.feature('block-blast-sounds')) — один AudioContext на страницу, заводится при первом звуке
const audio = createAudio(createSounds);

const soundFeature = () => Boolean(api?.feature?.('block-blast-sounds'));

function sfx(name, opts) {
  if (!soundFeature() || !soundOn) return;
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
  ui.soundBtn.classList.toggle('bb-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const cssVar = (name) => getComputedStyle(host).getPropertyValue(name).trim();
const colorOf = (n) => cssVar(`--bb-c${n}`);

function save() {
  if (game && !finished) api.storage.set('current', game);
}

// ---------- отрисовка ----------

function cellSize() {
  return ui.board.getBoundingClientRect().width / SIZE;
}

/** Поле. view — что показывать (по умолчанию состояние партии); preview — тень и будущие линии. */
function renderBoard(view = game.board, preview = null) {
  const ghost = new Set(preview?.ghost ?? []);
  const willClear = new Set(preview?.clear ?? []);
  ui.cells.forEach((cell, i) => {
    let cls = 'bb-cell';
    const color = view[i];
    if (color) cls += ` bb-block bb-c${willClear.has(i) ? preview.color : color}`;
    else if (ghost.has(i)) cls += ` bb-ghost bb-c${preview.color}`;
    if (willClear.has(i)) cls += ' bb-will-clear';
    cell.className = cls;
  });
}

/** Мини-фигура: сетка из клеток размера cs. */
function pieceEl(piece, cs) {
  const shape = SHAPE_BY_ID[piece.shape];
  const node = el('div', {
    class: 'bb-piece',
    style: `--cs: ${cs}px; grid-template-columns: repeat(${shape.cols}, ${cs}px); grid-template-rows: repeat(${shape.rows}, ${cs}px);`,
  });
  for (const [r, c] of shape.cells) {
    node.append(el('div', { class: `bb-block bb-c${piece.color}`, style: `grid-row: ${r + 1}; grid-column: ${c + 1};` }));
  }
  return node;
}

function trayCellSize() {
  const slot = ui.slots[0].getBoundingClientRect();
  return Math.max(10, Math.min(cellSize() * 0.52, (slot.width - 8) / 5, (slot.height - 8) / 5));
}

function renderTray({ entering = false } = {}) {
  const cs = trayCellSize();
  ui.slots.forEach((slot, k) => {
    const piece = game.tray[k];
    slot.replaceChildren();
    slot.classList.remove('bb-slot-dim');
    if (!piece) return;
    const node = pieceEl(piece, cs);
    slot.append(node);
    if (!fitsAnywhere(game.board, SHAPE_BY_ID[piece.shape])) slot.classList.add('bb-slot-dim');
    if (entering) {
      animate(node, [
        { opacity: 0, transform: 'translateX(60px) scale(0.6)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 320, delay: k * 70, easing: EASE_OUT, fill: 'backwards' });
    }
  });
}

/** Счёт «набегает» до нового значения. */
function renderScore() {
  const target = game.score;
  cancelAnimationFrame(scoreRaf);
  if (reducedMotion() || target - shownScore < 2) {
    shownScore = target;
    ui.score.textContent = target;
    return;
  }
  const from = shownScore;
  const start = performance.now();
  const step = (now) => {
    if (!ui) return;
    // время кадра бывает чуть раньше start — без ограничения снизу счёт на миг «отъезжал» назад
    const k = Math.max(0, Math.min(1, (now - start) / 500));
    shownScore = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
    ui.score.textContent = shownScore;
    if (k < 1) scoreRaf = requestAnimationFrame(step);
  };
  scoreRaf = requestAnimationFrame(step);
  // страховка: в свёрнутой вкладке кадры не идут — точный счёт всё равно появится
  later(() => {
    if (!ui || game.score !== target) return;
    cancelAnimationFrame(scoreRaf);
    shownScore = target;
    ui.score.textContent = target;
  }, 650);
}

function renderHeader() {
  ui.sub.textContent = T.best(Math.max(stats.best, game?.score ?? 0));
}

/** Свечение рамки поля, пока комбо живо: 1 — цветное, 2 — ярче, 3 — радужное. */
function renderGlow() {
  const combo = game?.combo ?? 0;
  const level = combo >= 5 ? 3 : combo >= 3 ? 2 : combo >= 2 ? 1 : 0;
  ui.frame.dataset.glow = String(level);
}

// ---------- перетаскивание ----------

function localPoint(e) {
  const rect = root.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onPointerDown(e, slot) {
  if (drag || busy || finished || modalActive || !game?.tray[slot]) return;
  e.preventDefault();
  const piece = game.tray[slot];
  const shape = SHAPE_BY_ID[piece.shape];
  const cs = cellSize();
  const node = pieceEl(piece, cs);
  node.classList.add('bb-drag');
  root.append(node);
  ui.slots[slot].classList.add('bb-slot-taken');
  try {
    e.currentTarget.setPointerCapture(e.pointerId);   // палец может уйти за пределы лотка
  } catch {
    // без захвата тоже работает: движения ловит корень игры
  }
  drag = { slot, piece, shape, cs, node, pointerId: e.pointerId, anchor: null, w: shape.cols * cs, h: shape.rows * cs };
  sfx('pick');
  api.platform.haptic.selection();
  moveDrag(localPoint(e));
  animate(node, [{ transform: 'scale(0.55)' }, { transform: 'scale(1)' }], { duration: 140, easing: EASE_OUT });
}

function moveDrag({ x, y }) {
  const lift = drag.cs * LIFT_CELLS;
  const left = x - drag.w / 2;
  const top = y - drag.h - lift;
  drag.node.style.left = `${left}px`;
  drag.node.style.top = `${top}px`;

  // Куда встанет фигура: ближайшая клетка поля к её левому верхнему углу.
  const board = ui.board.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const r = Math.round((top + rootRect.top - board.top) / drag.cs);
  const c = Math.round((left + rootRect.left - board.left) / drag.cs);
  const anchor = canPlace(game.board, drag.shape, r, c) ? [r, c] : null;
  if (String(anchor) === String(drag.anchor)) return;
  drag.anchor = anchor;
  if (!anchor) {
    renderBoard();
    return;
  }
  const ghost = drag.shape.cells.map(([dr, dc]) => (r + dr) * SIZE + (c + dc));
  const clear = lineCells(linesAfter(game.board, drag.shape, r, c));
  renderBoard(game.board, { ghost, clear, color: drag.piece.color });
  if (clear.length) api.platform.haptic.selection();
}

function onPointerMove(e) {
  if (drag && e.pointerId === drag.pointerId) moveDrag(localPoint(e));
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const current = drag;
  drag = null;
  if (current.anchor) {
    dropOnBoard(current);
  } else {
    returnToTray(current);
  }
}

/** Отпустили мимо — фигура улетает обратно в лоток. */
function returnToTray(current) {
  sfx('back');
  renderBoard();
  const slot = ui.slots[current.slot].getBoundingClientRect();
  const nodeRect = current.node.getBoundingClientRect();
  const dx = slot.left + slot.width / 2 - (nodeRect.left + nodeRect.width / 2);
  const dy = slot.top + slot.height / 2 - (nodeRect.top + nodeRect.height / 2);
  const scale = trayCellSize() / current.cs;
  animate(current.node, [
    { transform: 'none' },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
  ], { duration: 200, easing: 'ease-in', fill: 'forwards' }).then(() => {
    current.node.remove();
    ui?.slots[current.slot].classList.remove('bb-slot-taken');
  });
}

/** Отпустили над полем — фигура «защёлкивается» в клетки, дальше ход. */
function dropOnBoard(current) {
  const [r, c] = current.anchor;
  const board = ui.board.getBoundingClientRect();
  const nodeRect = current.node.getBoundingClientRect();
  const dx = board.left + c * current.cs - nodeRect.left;
  const dy = board.top + r * current.cs - nodeRect.top;
  busy = true;
  animate(current.node, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px)` }],
    { duration: 70, easing: 'ease-out', fill: 'forwards' }).then(() => {
    current.node.remove();
    if (!ui) return;
    ui.slots[current.slot].classList.remove('bb-slot-taken');
    commitMove(current.slot, r, c);
  });
}

// ---------- ход ----------

function commitMove(slot, r, c) {
  const ev = placePiece(game, slot, r, c);
  busy = false;
  if (!ev) {
    renderBoard();
    renderTray();
    return;
  }
  sfx('place', { step: ev.cells.length });
  api.platform.haptic.impact(ev.lines ? 'medium' : 'light');

  // Сначала показываем поле с поставленной фигурой и ещё не сгоревшими линиями.
  const before = [...game.board];
  ev.cleared.forEach((i, k) => { before[i] = ev.clearedColors[k]; });
  renderBoard(before);
  for (const i of ev.cells) {
    animate(ui.cells[i], [{ transform: 'scale(0.7)' }, { transform: 'scale(1.08)', offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'ease-out' });
  }
  floatText(`+${ev.placePoints}`, centerOf(ev.cells), 'bb-float-small');

  if (ev.lines) {
    busy = true;
    playClear(ev);
    later(() => {
      busy = false;
      renderBoard();
      afterMove(ev);
    }, reducedMotion() ? 0 : CLEAR_MS);
  } else {
    afterMove(ev);
  }
  renderScore();
  renderHeader();
  renderGlow();
}

function afterMove() {
  if (trayEmpty(game)) {
    game.tray = dealTray(game.board);
    sfx('deal');
    renderTray({ entering: true });
  } else {
    renderTray();
  }
  save();
  if (isGameOver(game)) gameOver();
}

/** Центр группы клеток — в координатах корня игры. */
function centerOf(cells) {
  const rootRect = root.getBoundingClientRect();
  let x = 0;
  let y = 0;
  for (const i of cells) {
    const rect = ui.cells[i].getBoundingClientRect();
    x += rect.left + rect.width / 2;
    y += rect.top + rect.height / 2;
  }
  return { x: x / cells.length - rootRect.left, y: y / cells.length - rootRect.top };
}

function floatText(text, { x, y }, cls = '') {
  const node = el('div', { class: `bb-float ${cls}`, style: `left: ${x}px; top: ${y}px;` }, text);
  ui.floats.append(node);
  later(() => node.remove(), 1600);
}

/**
 * Сгорание линий. Уровень эффектов растёт с комбо и числом линий:
 *   1 — лучи по линиям и осколки; 2 — + надпись комбо и свечение;
 *   3 — радужные клетки и тряска; 4 — + молнии, вспышка и конфетти.
 */
function playClear(ev) {
  let level = ev.combo >= 7 ? 4 : ev.combo >= 4 ? 3 : ev.combo >= 2 ? 2 : 1;
  if (ev.lines >= 3) level += 1;            // 3+ линии разом — на уровень выше
  if (ev.allClear) level = 4;               // чистое поле — всегда максимум
  level = Math.min(4, level);
  sfx(ev.allClear ? 'allclear' : 'clear', { step: ev.combo, level, lines: ev.lines });
  if (ev.allClear) sfx('clear', { step: ev.combo, level, lines: ev.lines });
  const rootRect = root.getBoundingClientRect();
  const board = ui.board.getBoundingClientRect();
  const cs = board.width / SIZE;
  const ox = board.left - rootRect.left;
  const oy = board.top - rootRect.top;

  // клетки вспыхивают и тают (радужно — начиная с 3-го уровня)
  ev.cleared.forEach((i) => {
    ui.cells[i].classList.add(level >= 3 ? 'bb-clearing-rainbow' : 'bb-clearing');
    ui.cells[i].style.setProperty('--d', `${((i % SIZE) + Math.floor(i / SIZE)) * 12}ms`);
  });

  // лучи вдоль линий
  const accent = colorOf(ev.color);
  for (const r of ev.rows) fx.beam({ x: ox, y: oy + r * cs, w: board.width, h: cs }, accent);
  for (const c of ev.cols) fx.beam({ x: ox + c * cs, y: oy, w: cs, h: board.height }, accent, { vertical: true });

  // осколки из каждой клетки её цветом
  ev.cleared.forEach((i, k) => {
    const x = ox + (i % SIZE) * cs + cs / 2;
    const y = oy + Math.floor(i / SIZE) * cs + cs / 2;
    fx.burst(x, y, colorOf(ev.clearedColors[k]), level >= 3 ? 7 : 4, { size: cs * 0.22 });
  });

  // молнии между сгорающими линиями и через поле
  if (level >= 4) {
    const lines = [
      ...ev.rows.map((r) => [ox, oy + r * cs + cs / 2, ox + board.width, oy + r * cs + cs / 2]),
      ...ev.cols.map((c) => [ox + c * cs + cs / 2, oy, ox + c * cs + cs / 2, oy + board.height]),
    ];
    lines.forEach(([x1, y1, x2, y2], k) => later(() => fx?.lightning(x1, y1, x2, y2, colorOf(1 + (k % 8))), k * 60));
    for (let k = 0; k < 3; k++) {
      const from = [ox + Math.random() * board.width, oy];
      const to = [ox + Math.random() * board.width, oy + board.height];
      later(() => fx?.lightning(...from, ...to, accent, { width: 2 }), 80 + k * 90);
    }
    ui.flash.classList.remove('bb-flash-on');
    void ui.flash.offsetWidth;
    ui.flash.classList.add('bb-flash-on');
    fx.confetti(Array.from({ length: 8 }, (_, k) => colorOf(k + 1)), ev.allClear ? 120 : 60);
  }
  if (level >= 3) shake(ui.frame, { distance: level >= 4 ? 7 : 4, duration: 380 });

  // надписи: бонус, комбо, чистое поле
  const center = centerOf(ev.cleared);
  floatText(`+${ev.bonus}`, center, `bb-float-bonus bb-tier-${level}`);
  if (ev.combo >= 1) {
    floatText(T.combo(ev.combo), { x: ox + board.width / 2, y: oy + board.height * 0.42 }, `bb-float-combo bb-tier-${level}`);
  }
  if (ev.allClear) floatText(T.allClear, { x: ox + board.width / 2, y: oy + board.height * 0.28 }, 'bb-float-combo bb-tier-4');
}

// ---------- конец игры ----------

function gameOver() {
  finished = true;
  api.storage.remove('current');
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  toast.show(T.noMoves, 1400);
  sfx('over');
  api.platform.haptic.notification('error');

  // клетки гаснут волной сверху вниз
  ui.cells.forEach((cell, i) => {
    if (!game.board[i]) return;
    cell.style.setProperty('--d', `${Math.floor(i / SIZE) * 60 + (i % SIZE) * 15}ms`);
    cell.classList.add('bb-dead');
  });
  ui.slots.forEach((slot) => slot.classList.add('bb-slot-dim'));
  const { score, maxCombo, lines } = game;
  later(() => api.finish({
    outcome: 'lose', title: T.overTitle, score, message: T.over(maxCombo, lines), locale: 'ru',
  }), reducedMotion() ? 0 : 1500);
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
  return el('div', { class: 'bb-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bb-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bb-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats() {
  const s = stats;
  const item = (value, label) => el('div', { class: 'bb-stat' },
    el('div', { class: 'bb-stat-value' }, value), el('div', { class: 'bb-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'bb-stats-grid' },
    item(s.best, T.stats.best),
    item(s.played, T.stats.played),
    item(s.played ? Math.round(s.totalScore / s.played) : 0, T.stats.average),
    item(s.maxCombo, T.stats.maxCombo),
    item(s.lines, T.stats.lines),
  )));
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'bb-skin',
    role: 'radio',
    'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'bb-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title, el('div', { class: 'bb-skins', role: 'radiogroup' }, buttons)));
}

function askRestart() {
  if (busy || drag) return;
  if (!game.moves || finished) {
    restart();
    return;
  }
  openModal(card(T.newGame,
    el('p', { class: 'bb-note' }, T.restartQuestion),
    el('div', { class: 'bb-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); restart(); } }, T.restart),
    ),
  ));
}

function restart() {
  game = newGame();
  finished = false;
  shownScore = 0;
  ui.score.textContent = '0';
  ui.cells.forEach((cell) => cell.classList.remove('bb-dead'));
  renderBoard();
  renderTray({ entering: true });
  renderHeader();
  renderGlow();
  save();
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bb-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'block-blast',
  title: 'Block Blast',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;
    game = isValidState(savedGame) ? savedGame : newGame();

    ui = {
      sub: el('div', { class: 'bb-sub' }),
      score: el('div', { class: 'bb-score' }, game.score),
      board: el('div', { class: 'bb-board' }),
      cells: Array.from({ length: SIZE * SIZE }, () => el('div', { class: 'bb-cell' })),
      slots: [0, 1, 2].map((k) => el('div', { class: 'bb-slot', onpointerdown: (e) => onPointerDown(e, k) })),
      floats: el('div', { class: 'bb-floats' }),
      flash: el('div', { class: 'bb-flash' }),
      modal: el('div', { class: 'bb-modal', hidden: true }),
    };
    ui.board.append(...ui.cells);
    ui.soundBtn = soundFeature() ? iconButton(ICONS.soundOn, 'Выключить звук', toggleSound) : null;
    ui.frame = el('div', { class: 'bb-frame', 'data-glow': '0' }, ui.board);
    shownScore = game.score;

    root = el('div', { class: 'bb' },
      el('div', { class: 'bb-header' },
        el('div', {}, el('div', { class: 'bb-title' }, T.title), ui.sub),
        el('div', { class: 'bb-actions' },
          ui.soundBtn,
          iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      ui.score,
      el('div', { class: 'bb-board-wrap' }, ui.frame),
      el('div', { class: 'bb-tray' }, ui.slots),
      ui.flash,
      ui.floats,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    fx = createFx(root, 'bb-fx');
    root.append(fx.canvas);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('keydown', onKeydown);

    renderBoard();
    renderHeader();
    renderGlow();
    // лоток — после раскладки, чтобы знать размер ячеек
    requestAnimationFrame(() => ui && renderTray({ entering: true }));
    if (isGameOver(game)) gameOver();
  },

  getState() {
    if (!game || finished || !game.moves) return null;
    save();
    return { score: game.score };
  },

  destroy() {
    timers.forEach(clearTimeout);
    timers.clear();
    cancelAnimationFrame(scoreRaf);
    document.removeEventListener('keydown', onKeydown);
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = fx = toast = game = drag = null;
    busy = finished = modalActive = false;
    stats = emptyStats();
  },
};
