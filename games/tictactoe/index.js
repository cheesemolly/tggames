// Крестики-нолики: классика 3×3 и гомоку — 5 в ряд на поле 10×10 / 13×13 / 15×15. Против бота (три уровня)
// или вдвоём на одном телефоне. Правила и бот — logic.js, звуки — sounds.js.
//
// Доска — SVG: линии и знаки остаются чёткими на любом размере. Знаки «рисуются» (штрих пера по pathLength),
// в скине «Го» — камни на линиях деревянной доски. На большом поле ход ставится вторым касанием (сначала —
// «призрак» знака): мелкие клетки легко промахнуть; в настройках можно выключить.
// Конец партии с ботом — экран результата оболочки (api.finish, вариант «режим-уровень»); вдвоём — своё окно.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  MODES, SIZES, LEVELS, newGame, play, undo, botMove, canPlay, isValidState, emptyStats, isValidStats, recordGame,
} from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const T = {
  title: 'Крестики-нолики',
  modes: { classic: '3×3', gomoku: 'Гомоку' },
  modeHint: { classic: 'Три в ряд — классика', gomoku: 'Пять в ряд на большом поле' },
  levels: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' },
  friend: 'Вдвоём',
  friendHint: 'на одном телефоне по очереди',
  sides: { x: 'Крестики', o: 'Нолики', random: 'Случайно' },
  sideHint: 'Крестики ходят первыми',
  newGame: 'Новая игра',
  mode: 'Игра',
  size: 'Поле',
  opponent: 'Соперник',
  side: 'Играю за',
  start: 'Играть',
  yourTurn: 'Твой ход',
  botThinks: 'Бот думает…',
  turnOf: (who) => (who === 1 ? 'Ходят крестики' : 'Ходят нолики'),
  confirm: 'Нажми ещё раз, чтобы поставить',
  win: 'Победа!',
  lose: 'Бот победил',
  draw: 'Ничья',
  xWins: 'Победили крестики!',
  oWins: 'Победили нолики!',
  again: 'Ещё раз',
  you: 'Ты',
  bot: 'Бот',
  undo: 'Отменить ход',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  skin: 'Оформление',
  confirmSetting: 'Ставить вторым касанием (большое поле)',
  played: 'Партий',
  wins: 'Побед',
  draws: 'Ничьих',
  losses: 'Поражений',
  streak: 'Серия побед',
  bestStreak: 'Лучшая серия',
  friendStats: 'Вдвоём: крестики / нолики / ничьи',
};

const SKINS = [
  { id: 'telegram', name: 'По умолчанию', style: 'pen', grid: 'cells' },
  { id: 'paper', name: 'Тетрадь', style: 'pen', grid: 'cells', hand: true },
  { id: 'chalk', name: 'Мел', style: 'pen', grid: 'cells', hand: true },
  { id: 'neon', name: 'Неон', style: 'pen', grid: 'cells' },
  { id: 'go', name: 'Го', style: 'stone', grid: 'go' },
  { id: 'candy', name: 'Конфета', style: 'pen', grid: 'cells' },
];

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
};

let api = null;
let root = null;
let host = null;
let ui = null;
let toast = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram', confirm: true };
let setup = { mode: 'classic', size: 15, level: 'medium', vs: 'bot', side: 'x' };
let busy = false;
let ghost = -1;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let finishing = false;
let session = { you: 0, bot: 0 };
let request = 0;
const timers = new Set();
const audio = createAudio(createSounds);
const rng = Math.random;

function sfx(name) {
  if (!soundOn) return;
  try {
    audio.get()?.play(name);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const skin = () => SKINS.find((s) => s.id === settings.skin) ?? SKINS[0];
const save = () => {
  if (!api || !game) return;
  if (game.over || !game.history.length) api.storage.remove('current');
  else api.storage.set('current', game);
};

// ---------- доска ----------

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Детерминированный «шум» для рукописных скинов: одна и та же клетка — один и тот же почерк. */
function jitter(i, k) {
  let x = Math.imul(i * 7919 + k * 104729 + 17, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  return (((x ^ (x >>> 13)) >>> 0) / 4294967296) - 0.5;
}

function buildBoard() {
  const n = game.size;
  const sk = skin();
  const pad = 0.14;
  ui.svg.setAttribute('viewBox', `${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`);
  ui.svg.dataset.n = String(n);
  const bg = svg('rect', { class: 'tt-bg', x: -pad, y: -pad, width: n + pad * 2, height: n + pad * 2, rx: n === 3 ? 0.22 : 0.3 });
  const grid = svg('g', { class: 'tt-grid' });
  const lineW = n === 3 ? 0.05 : 0.035;
  if (sk.grid === 'go') {
    for (let k = 0; k < n; k++) {
      grid.append(svg('line', { x1: 0.5, y1: k + 0.5, x2: n - 0.5, y2: k + 0.5, 'stroke-width': lineW }));
      grid.append(svg('line', { x1: k + 0.5, y1: 0.5, x2: k + 0.5, y2: n - 0.5, 'stroke-width': lineW }));
    }
    // «звёзды» доски го
    const stars = n >= 13 ? [3, Math.floor(n / 2), n - 4] : n === 3 ? [1] : [2, n - 3];
    for (const r of stars) for (const c of stars) grid.append(svg('circle', { class: 'tt-star', cx: c + 0.5, cy: r + 0.5, r: 0.09 }));
  } else {
    const from = n === 3 ? 1 : 0;
    const to = n === 3 ? n - 1 : n;
    for (let k = from; k <= to; k++) {
      const hand = sk.hand ? jitter(k, 1) * 0.08 : 0;
      grid.append(svg('path', { d: `M${k + hand},${n === 3 ? 0.08 : 0} Q${k - hand},${n / 2} ${k + hand * 0.5},${n - (n === 3 ? 0.08 : 0)}`, 'stroke-width': lineW, fill: 'none' }));
      grid.append(svg('path', { d: `M${n === 3 ? 0.08 : 0},${k - hand} Q${n / 2},${k + hand} ${n - (n === 3 ? 0.08 : 0)},${k - hand * 0.5}`, 'stroke-width': lineW, fill: 'none' }));
    }
  }
  ui.marks = svg('g', { class: 'tt-marks' });
  // последний ход: на камнях — красная точка поверх, у знаков — мягкая подсветка клетки под ним
  const stone = sk.style === 'stone';
  ui.lastMark = stone ? svg('circle', { class: 'tt-last tt-last-dot', r: 0.1, cx: -5, cy: -5 })
    : svg('rect', { class: 'tt-last tt-last-cell', width: 0.9, height: 0.9, rx: 0.14, x: -5, y: -5 });
  ui.ghost = svg('g', { class: 'tt-ghost' });
  ui.winLayer = svg('g', { class: 'tt-winline' });
  ui.svg.replaceChildren(bg, grid, ...(stone ? [ui.marks, ui.lastMark] : [ui.lastMark, ui.marks]), ui.ghost, ui.winLayer);
  game.cells.forEach((v, i) => { if (v) ui.marks.append(markNode(i, v, false)); });
  paintLast();
}

/** Знак в клетке i: крестик (1) или нолик (2); animate — «прорисовать». */
function markNode(i, who, animateIt = true) {
  const n = game.size;
  const r = Math.floor(i / n);
  const c = i % n;
  const g = svg('g', { class: `tt-mark tt-${who === 1 ? 'x' : 'o'}`, 'data-i': i, transform: `translate(${c + 0.5} ${r + 0.5})` });
  const sk = skin();
  const w = n === 3 ? 0.13 : 0.15;
  if (sk.style === 'stone') {
    const stone = svg('circle', { class: 'tt-stone', r: 0.43, cx: 0, cy: 0 });
    g.append(svg('circle', { class: 'tt-stone-shadow', r: 0.43, cx: 0.05, cy: 0.06 }), stone,
      svg('ellipse', { class: 'tt-stone-shine', rx: 0.15, ry: 0.09, cx: -0.13, cy: -0.17, transform: 'rotate(-30 -0.13 -0.17)' }));
    if (animateIt && !reducedMotion()) {
      animate(g, [{ opacity: 0, transform: `translate(${c + 0.5}px, ${r + 0.3}px) scale(1.4)` }, { opacity: 1, transform: `translate(${c + 0.5}px, ${r + 0.5}px) scale(1)` }], { duration: 220, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' });
    }
    return g;
  }
  const j = (k) => (sk.hand ? jitter(i, k) * 0.07 : 0);
  if (who === 1) {
    const a = 0.3;
    const p1 = svg('path', { d: `M${-a + j(1)},${-a + j(2)} Q${j(3)},${j(4)} ${a + j(5)},${a + j(6)}`, pathLength: 1, 'stroke-width': w });
    const p2 = svg('path', { d: `M${a + j(7)},${-a + j(8)} Q${j(9)},${j(10)} ${-a + j(11)},${a + j(12)}`, pathLength: 1, 'stroke-width': w });
    g.append(p1, p2);
    if (animateIt) {
      p1.classList.add('tt-draw');
      p2.classList.add('tt-draw', 'tt-draw-2');
    }
  } else {
    let d;
    if (sk.hand) {
      // от руки: круг чуть неровный и с «хвостиком» — перо заходит на начало
      const pts = [];
      for (let k = 0; k <= 26; k++) {
        const t = (k / 24) * Math.PI * 2 - Math.PI / 2;
        const rad = 0.3 + j(20 + (k % 6)) * 0.4;
        pts.push(`${(Math.cos(t) * rad).toFixed(3)},${(Math.sin(t) * rad).toFixed(3)}`);
      }
      d = `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')}`;
    } else {
      // ломаная, а не дуга: длину дуги для штриха (pathLength) браузер считает неточно — нолик оставался «C»
      const pts = [];
      for (let k = 0; k <= 48; k++) {
        const t = (k / 48) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(Math.cos(t) * 0.3).toFixed(3)},${(Math.sin(t) * 0.3).toFixed(3)}`);
      }
      d = `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')}`;
    }
    const o = svg('path', { d, pathLength: 1, 'stroke-width': w, fill: 'none' });
    if (animateIt) o.classList.add('tt-draw');
    g.append(o);
  }
  return g;
}

function paintLast() {
  const last = game.history[game.history.length - 1];
  const dot = ui.lastMark.tagName === 'circle';
  if (last === undefined || game.size === 3) {
    ui.lastMark.setAttribute(dot ? 'cx' : 'x', '-5');
    return;
  }
  const c = last % game.size;
  const r = Math.floor(last / game.size);
  if (dot) {
    ui.lastMark.setAttribute('cx', String(c + 0.5));
    ui.lastMark.setAttribute('cy', String(r + 0.5));
  } else {
    ui.lastMark.setAttribute('x', String(c + 0.05));
    ui.lastMark.setAttribute('y', String(r + 0.05));
  }
  ui.lastMark.dataset.who = String(game.cells[last]);
}

function showGhost(i) {
  ghost = i;
  ui.ghost.replaceChildren();
  if (i < 0) {
    ui.hint.hidden = true;
    return;
  }
  const g = markNode(i, game.turn, false);
  ui.ghost.append(g);
  ui.hint.hidden = false;
}

function drawWinLine(line) {
  const n = game.size;
  const a = line[0];
  const b = line[line.length - 1];
  const ax = (a % n) + 0.5;
  const ay = Math.floor(a / n) + 0.5;
  const bx = (b % n) + 0.5;
  const by = Math.floor(b / n) + 0.5;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ex = ((bx - ax) / len) * 0.35;
  const ey = ((by - ay) / len) * 0.35;
  const stroke = svg('line', {
    x1: ax - ex, y1: ay - ey, x2: bx + ex, y2: by + ey, pathLength: 1, class: 'tt-win tt-draw', 'stroke-width': n === 3 ? 0.14 : 0.2,
  });
  ui.winLayer.replaceChildren(stroke);
  for (const i of line) {
    const m = ui.marks.querySelector(`.tt-mark[data-i="${i}"]`);
    if (m) m.classList.add('tt-winmark');
  }
}

function cellAt(e) {
  const pt = ui.svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(ui.svg.getScreenCTM().inverse());
  const c = Math.floor(p.x);
  const r = Math.floor(p.y);
  if (r < 0 || c < 0 || r >= game.size || c >= game.size) return -1;
  return r * game.size + c;
}

// ---------- ход ----------

const humanTurn = () => game && !game.over && (game.vs === 'friend' || game.turn === game.player);

function paintStatus() {
  if (!ui || !game) return;
  let text;
  if (game.over) text = game.over.draw ? T.draw : game.vs === 'friend' ? (game.over.winner === 1 ? T.xWins : T.oWins) : game.over.winner === game.player ? T.win : T.lose;
  else if (game.vs === 'friend') text = T.turnOf(game.turn);
  else text = game.turn === game.player ? T.yourTurn : T.botThinks;
  ui.status.textContent = text;
  ui.status.classList.toggle('tt-thinking', !game.over && game.vs === 'bot' && game.turn !== game.player);
  const youX = game.vs === 'friend' ? true : game.player === 1;
  ui.pillX.classList.toggle('on', !game.over && game.turn === 1);
  ui.pillO.classList.toggle('on', !game.over && game.turn === 2);
  ui.pillX.querySelector('.tt-pill-name').textContent = game.vs === 'friend' ? T.sides.x : youX ? T.you : T.bot;
  ui.pillO.querySelector('.tt-pill-name').textContent = game.vs === 'friend' ? T.sides.o : youX ? T.bot : T.you;
  ui.score.textContent = game.vs === 'bot' ? `${session.you} : ${session.bot}` : '';
  ui.undoBtn.disabled = !canUndo();
  ui.sub.textContent = subtitle();
}

function subtitle() {
  const mode = game.mode === 'classic' ? T.modes.classic : `${T.modes.gomoku} ${game.size}×${game.size}`;
  return `${mode} · ${game.vs === 'friend' ? T.friend : T.levels[game.level]}`;
}

function onPointerDown(e) {
  if (!game || busy || modalActive || finishing || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = cellAt(e);
  if (i < 0) return;
  e.preventDefault();
  audio.get();
  if (!humanTurn() || !canPlay(game, i)) {
    if (!canPlay(game, i) && ghost >= 0) showGhost(-1);
    return;
  }
  // большое поле: сначала «примерка», второе касание — ход
  if (game.size > 3 && settings.confirm && ghost !== i) {
    showGhost(i);
    sfx('ghost');
    api.platform.haptic.selection();
    return;
  }
  place(i);
}

function place(i) {
  showGhost(-1);
  const who = game.turn;
  if (!play(game, i)) return;
  ui.marks.append(markNode(i, who));
  paintLast();
  sfx(who === 1 ? 'x' : 'o');
  api.platform.haptic.impact('light');
  save();
  if (game.over) {
    finish();
    return;
  }
  paintStatus();
  if (game.vs === 'bot' && game.turn !== game.player) botTurn();
}

function botTurn() {
  busy = true;
  paintStatus();
  const token = ++request;
  const started = performance.now();
  // бот «думает»: короткая пауза, чтобы ход не выскакивал мгновенно
  later(() => {
    if (!game || token !== request) return;
    const i = botMove(game, rng);
    const wait = Math.max(0, (game.size === 3 ? 380 : 520) - (performance.now() - started));
    later(() => {
      if (!game || token !== request) return;
      busy = false;
      place(i);
    }, reducedMotion() ? 0 : wait);
  }, 30);
}

function canUndo() {
  if (!game || game.over || busy || finishing) return false;
  if (game.vs === 'friend') return game.history.length > 0;
  // отменяется свой ход вместе с ответом бота
  const mine = game.history.filter((_, k) => (k % 2 === 0 ? 1 : 2) === game.player).length;
  return mine > 0 && game.turn === game.player;
}

function onUndo() {
  if (!canUndo()) return;
  request++;
  undo(game, game.vs === 'friend' ? 1 : 2);
  sfx('undo');
  showGhost(-1);
  ui.winLayer.replaceChildren();
  ui.marks.replaceChildren();
  game.cells.forEach((v, i) => { if (v) ui.marks.append(markNode(i, v, false)); });
  paintLast();
  save();
  paintStatus();
}

function finish() {
  finishing = true;
  paintStatus();
  const o = game.over;
  if (o.line) drawWinLine(o.line);
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  if (game.vs === 'friend') {
    sfx(o.draw ? 'draw' : 'win');
    api.platform.haptic.notification(o.draw ? 'warning' : 'success');
    later(showFriendResult, reducedMotion() ? 0 : 900);
    return;
  }
  const outcome = o.draw ? 'draw' : o.winner === game.player ? 'win' : 'lose';
  if (outcome === 'win') session.you += 1;
  if (outcome === 'lose') session.bot += 1;
  sfx(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
  api.platform.haptic.notification(outcome === 'win' ? 'success' : outcome === 'draw' ? 'warning' : 'error');
  paintStatus();
  const mode = game.mode === 'classic' ? T.modes.classic : `${T.modes.gomoku} ${game.size}×${game.size}`;
  later(() => api?.finish({
    outcome, title: outcome === 'win' ? T.win : outcome === 'lose' ? T.lose : T.draw, locale: 'ru',
    variant: `${game.mode}-${game.level}`, message: `${mode} · ${T.levels[game.level]}`,
  }), reducedMotion() ? 0 : 1100);
}

function showFriendResult() {
  const o = game.over;
  openModal(card(o.draw ? T.draw : o.winner === 1 ? T.xWins : T.oWins,
    el('div', { class: 'tt-result-mark' }, o.draw ? '🤝' : o.winner === 1 ? '✕' : '○'),
    el('div', { class: 'tt-friend-score' }, `${T.sides.x} ${stats.friend.x} · ${T.sides.o} ${stats.friend.o} · ничьих ${stats.friend.draws}`),
    el('div', { class: 'tt-btns' },
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); showNewGame(); } }, T.newGame),
      el('button', { class: 'btn', onclick: () => { closeModal(); startGame(); } }, T.again),
    ),
  ), false);
}

// ---------- окна ----------

function openModal(content, closable = true) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => { if (closable && e.target === ui.modal) closeModal(); };
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
  return el('div', { class: 'tt-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'tt-card-head' },
      el('h2', {}, title),
      el('button', { class: 'tt-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function radios(options, current, onPick, cls = 'tt-option') {
  const buttons = options.map((o) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(o.id === current),
    onclick: () => {
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(options[k].id === o.id)));
      onPick(o.id);
    },
  }, el('b', {}, o.title), o.hint && el('span', {}, o.hint)));
  return el('div', { class: 'tt-options', role: 'radiogroup' }, buttons);
}

function showNewGame() {
  const draft = { ...setup };
  const sizeBlock = el('div', {},
    el('h3', { class: 'tt-section' }, T.size),
    radios(SIZES.map((n) => ({ id: n, title: `${n}×${n}` })), draft.size, (id) => { draft.size = id; }, 'tt-option tt-option-sm'),
  );
  const sideBlock = el('div', {},
    el('h3', { class: 'tt-section' }, T.side),
    radios(['x', 'o', 'random'].map((id) => ({ id, title: T.sides[id], hint: id === 'x' ? T.sideHint : '' })), draft.side, (id) => { draft.side = id; }, 'tt-option tt-option-sm'),
  );
  const sync = () => {
    sizeBlock.hidden = draft.mode !== 'gomoku';
    sideBlock.hidden = draft.vs !== 'bot';
  };
  const opponents = [...LEVELS.map((id) => ({ id, title: T.levels[id] })), { id: 'friend', title: T.friend, hint: T.friendHint }];
  openModal(card(T.newGame,
    el('h3', { class: 'tt-section' }, T.mode),
    radios(MODES.map((id) => ({ id, title: T.modes[id], hint: T.modeHint[id] })), draft.mode, (id) => { draft.mode = id; sync(); }),
    sizeBlock,
    el('h3', { class: 'tt-section' }, T.opponent),
    radios(opponents, draft.vs === 'friend' ? 'friend' : draft.level, (id) => {
      if (id === 'friend') draft.vs = 'friend';
      else {
        draft.vs = 'bot';
        draft.level = id;
      }
      sync();
    }, 'tt-option tt-option-sm'),
    sideBlock,
    el('button', { class: 'btn tt-play', onclick: () => { setup = draft; api.storage.set('setup', setup); closeModal(); startGame(); } }, T.start),
  ));
  sync();
}

function startGame() {
  request++;
  const player = setup.side === 'random' ? (rng() < 0.5 ? 1 : 2) : setup.side === 'o' ? 2 : 1;
  const prev = game;
  game = newGame({ mode: setup.mode, size: setup.size, level: setup.level, vs: setup.vs, player });
  if (!prev || prev.mode !== game.mode || prev.vs !== game.vs || prev.level !== game.level) session = { you: 0, bot: 0 };
  busy = false;
  finishing = false;
  ghost = -1;
  buildBoard();
  showGhost(-1);
  intro();
  sfx('start');
  save();
  paintStatus();
  if (game.vs === 'bot' && game.turn !== game.player) botTurn();
}

function intro() {
  if (reducedMotion()) return;
  animate(ui.svg, [{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
}

function showStats() {
  const rows = (mode) => el('div', { class: 'tt-stats-table' },
    el('div', { class: 'tt-stats-row tt-stats-head' }, el('span', {}, ''), el('span', {}, T.wins), el('span', {}, T.draws), el('span', {}, T.losses)),
    ...LEVELS.map((l) => {
      const r = stats[mode][l];
      return el('div', { class: 'tt-stats-row' }, el('span', {}, T.levels[l]), el('b', {}, r.wins), el('b', {}, r.draws), el('b', {}, r.losses));
    }),
  );
  openModal(card(T.stats,
    el('div', { class: 'tt-stat-tiles' },
      el('div', { class: 'tt-tile' }, el('b', {}, stats.streak), el('span', {}, T.streak)),
      el('div', { class: 'tt-tile' }, el('b', {}, stats.bestStreak), el('span', {}, T.bestStreak)),
    ),
    el('h3', { class: 'tt-section' }, T.modes.classic),
    rows('classic'),
    el('h3', { class: 'tt-section' }, T.modes.gomoku),
    rows('gomoku'),
    el('h3', { class: 'tt-section' }, T.friendStats),
    el('p', { class: 'tt-friend-score' }, `${stats.friend.x} / ${stats.friend.o} / ${stats.friend.draws}`),
  ));
}

function showSettings() {
  const skins = SKINS.map((sk) => el('button', {
    class: 'tt-skin', role: 'radio', 'aria-checked': String(settings.skin === sk.id), 'data-skin': sk.id,
    onclick: () => {
      settings.skin = sk.id;
      api.storage.set('settings', settings);
      host.dataset.skin = sk.id;
      skins.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === sk.id)));
      buildBoard();
      if (game.over?.line) drawWinLine(game.over.line);
    },
  }, el('span', { class: 'tt-swatch' }, el('i', { class: 'tt-sw-x' }, sk.style === 'stone' ? '' : '✕'), el('i', { class: 'tt-sw-o' }, sk.style === 'stone' ? '' : '○')), sk.name));
  const toggle = el('input', { type: 'checkbox', checked: settings.confirm });
  toggle.addEventListener('change', () => {
    settings.confirm = toggle.checked;
    api.storage.set('settings', settings);
    showGhost(-1);
  });
  openModal(card(T.settings,
    el('h3', { class: 'tt-section' }, T.skin),
    el('div', { class: 'tt-skins', role: 'radiogroup' }, skins),
    el('label', { class: 'tt-toggle' }, toggle, el('span', {}, T.confirmSetting)),
    pointsInfo(api, 'tictactoe'),
  ));
}

function iconButton(icon, label, onclick) {
  const b = el('button', { class: 'tt-icon-btn', 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') onUndo();
}

export default {
  id: 'tictactoe',
  title: 'Крестики-нолики',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSetup, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('setup'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      skin: SKINS.some((s) => s.id === savedSettings?.skin) ? savedSettings.skin : 'telegram',
      confirm: savedSettings?.confirm !== false,
    };
    if (savedSetup && MODES.includes(savedSetup.mode) && SIZES.includes(savedSetup.size) && LEVELS.includes(savedSetup.level)
      && ['bot', 'friend'].includes(savedSetup.vs) && ['x', 'o', 'random'].includes(savedSetup.side)) setup = savedSetup;
    host.dataset.skin = settings.skin;

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      sfx('click');
    });
    const pill = (cls, mark) => el('div', { class: `tt-pill ${cls}` }, el('span', { class: 'tt-pill-mark' }, mark), el('span', { class: 'tt-pill-name' }));
    ui = {
      sub: el('div', { class: 'tt-sub' }),
      status: el('div', { class: 'tt-status' }),
      score: el('div', { class: 'tt-score' }),
      pillX: pill('tt-pill-x', '✕'),
      pillO: pill('tt-pill-o', '○'),
      svg: svg('svg', { class: 'tt-board' }),
      hint: el('div', { class: 'tt-hint', hidden: true }, T.confirm),
      modal: el('div', { class: 'tt-modal', hidden: true }),
      undoBtn: iconButton(ICONS.undo, T.undo, onUndo),
    };
    ui.svg.addEventListener('pointerdown', onPointerDown);
    ui.svg.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

    root = el('div', { class: 'tt' },
      el('div', { class: 'tt-header' },
        el('div', { class: 'tt-head-text' }, el('div', { class: 'tt-title' }, T.title), ui.sub),
        el('div', { class: 'tt-actions' },
          soundBtn,
          ui.undoBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, showNewGame),
        ),
      ),
      el('div', { class: 'tt-bar' }, ui.pillX, el('div', { class: 'tt-bar-mid' }, ui.status, ui.score), ui.pillO),
      el('div', { class: 'tt-wrap' }, ui.svg),
      ui.hint,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);

    if (isValidState(saved)) {
      game = saved;
      buildBoard();
      paintStatus();
      intro();
      if (game.vs === 'bot' && game.turn !== game.player) botTurn();
    } else if (!savedSetup) {
      // первый раз — сразу окно выбора игры (поле за ним уже стоит)
      startGame();
      showNewGame();
    } else startGame();
    // для проверки (страница-обёртка): ?ttdebug в адресе
    if (new URLSearchParams(location.search).has('ttdebug')) {
      window.__tt = {
        get game() { return game; },
        get busy() { return busy; },
        start: (next) => { setup = { ...setup, ...next }; closeModal(); startGame(); },
        place: (i) => { if (humanTurn()) place(i); },
        skin: (id) => { settings.skin = id; host.dataset.skin = id; buildBoard(); if (game.over?.line) drawWinLine(game.over.line); },
      };
    }
  },

  getState() {
    if (!game || game.over || !game.history.length) return null;
    save();
    return { moves: game.history.length };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    request++;
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = root = host = ui = toast = game = null;
    busy = modalActive = finishing = false;
    ghost = -1;
  },
};

