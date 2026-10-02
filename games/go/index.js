// Го против бота (5 уровней) или вдвоём на одном телефоне; доски 9×9, 13×13, 19×19, фора.
// Правила — rules.js (китайский подсчёт по площади, коми 7,5, суперко), бот — engine.js + bot.js (думает в
// worker.js), звуки — sounds.js.
//
// Доска — SVG: пересечения в целых координатах, камни с объёмом (радиальные градиенты из переменных скина) и
// тенью, у белых — полоски раковины. На 13×13 и 19×19 ход ставится вторым касанием (сначала «призрак» камня с
// перекрестием; палец можно вести — «призрак» сдвигается на столько же, сколько палец, так что палец его не
// закрывает) — мелкие пересечения легко промахнуть (19 px на 19×19 при 44 pt по правилам Apple); настраивается.
// Новичкам — подсветка групп в атари (одна свобода) — настройка, по умолчанию включена.
// Конец: два паса подряд → подсчёт: мёртвые камни бот отмечает сам (розыгрыши из позиции), касание группы
// меняет отметку; «Подсчитать» — итог. С ботом — экран результата оболочки (api.finish, вариант «размер-уровень»),
// вдвоём — своё окно.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { EMPTY, BLACK, WHITE, PASS } from './board.js';
import {
  SIZES, newGame, replay, playMove, canPlayAt, scoreArea, chainAt, starPoints, isValidGame, maxHandicap, coordName,
} from './rules.js';
import { chooseMove, hintMove, estimateDead } from './bot.js';
import {
  LEVEL_IDS, SKINS, HANDICAPS, normalizeSetup, normalizeSettings, defaultSettings, needConfirm,
  emptyStats, isValidStats, recordGame, fmtScore,
} from './logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const T = {
  title: 'Го',
  levels: {
    1: ['Новичок', 'Только учится: ошибается часто'],
    2: ['Начинающий', 'Знает правила, видит атари'],
    3: ['Любитель', 'Держит группы, борется за углы'],
    4: ['Сильный', 'Думает до 2 секунд'],
    5: ['Мастер', 'В полную силу'],
  },
  friend: 'Вдвоём',
  friendHint: 'на одном телефоне по очереди',
  sides: { black: 'Чёрными', white: 'Белыми', random: 'Случайно' },
  sideHint: 'Чёрные ходят первыми',
  newGame: 'Новая игра',
  size: 'Доска',
  sizeHint: { 9: 'Быстрая партия', 13: 'Средняя', 19: 'Классика' },
  opponent: 'Соперник',
  side: 'Играю',
  handicap: 'Фора чёрным',
  handicapHint: 'Камни на звёздах до начала — слабому игроку легче',
  noHandicap: 'Нет',
  start: 'Играть',
  rules: 'Ставь камни на пересечения. Камень или группа без свободных соседних пересечений снимается с доски. Побеждает тот, у кого больше камней и окружённой пустоты; белые получают коми.',
  yourTurn: 'Твой ход',
  botThinks: 'Бот думает…',
  turnOf: (c) => (c === BLACK ? 'Ход чёрных' : 'Ход белых'),
  botPassed: 'Бот спасовал — спасуй и ты, чтобы подсчитать',
  passed: (c) => (c === BLACK ? 'Чёрные спасовали' : 'Белые спасовали'),
  scoring: 'Подсчёт: коснись группы, чтобы отметить её мёртвой',
  you: 'Ты',
  bot: 'Бот',
  blackName: 'Чёрные',
  whiteName: 'Белые',
  prisoners: (n) => `взято ${n}`,
  pass: 'Пас',
  hint: 'Подсказка',
  estimate: 'Оценка',
  resign: 'Сдаться',
  resignAsk: 'Сдаться?',
  resignText: 'Партия будет засчитана как поражение.',
  resignFriend: (c) => (c === BLACK ? 'Чёрные сдаются — победа белых.' : 'Белые сдаются — победа чёрных.'),
  yes: 'Сдаться',
  no: 'Играть дальше',
  resume: 'Доиграть',
  count: 'Подсчитать',
  confirm: 'Нажми ещё раз, чтобы поставить',
  ko: 'Ко: сразу взять обратно нельзя — сначала сыграй в другом месте',
  suicide: 'Сюда нельзя: у камня не останется свобод',
  superko: 'Так позиция повторится — сюда нельзя',
  hintPass: 'Подсказка: лучше спасовать',
  noHints: 'Подсказки закончились',
  win: 'Победа!',
  lose: 'Бот победил',
  botResigned: 'Бот сдался',
  youResigned: 'Ты сдался',
  blackWins: 'Победили чёрные!',
  whiteWins: 'Победили белые!',
  byPoints: (m) => `на ${fmtScore(m)} ${pointsWord(m)}`,
  byResign: 'Соперник сдался',
  again: 'Ещё раз',
  undo: 'Отменить ход',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  skin: 'Оформление',
  skins: { telegram: 'По умолчанию', kaya: 'Кая', walnut: 'Орех', night: 'Ночь', paper: 'Бумага' },
  confirmSetting: 'Ставить камень вторым касанием',
  confirmOpts: { big: '13×13 и 19×19', always: 'Всегда', never: 'Никогда' },
  coords: 'Координаты на доске',
  atari: 'Подсвечивать группы в атари',
  streak: 'Серия побед',
  bestStreak: 'Лучшая серия',
  wins: 'Побед',
  losses: 'Поражений',
  friendStats: 'Вдвоём: побед чёрных / белых',
  scoreLine: (b, w, komi) => `Чёрные ${fmtScore(b)} · Белые ${fmtScore(w)} (коми ${fmtScore(komi)})`,
};

function pointsWord(m) {
  const n = Math.floor(Math.abs(m));
  if (Math.abs(m) % 1) return 'очка';
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return 'очков';
  if (a === 1) return 'очко';
  if (a >= 2 && a <= 4) return 'очка';
  return 'очков';
}

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  pass: svgIcon('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  estimate: svgIcon('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M13 3h8v8h-8zM3 13h8v8H3z" opacity=".35"/>'),
  flag: svgIcon('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
};

let api = null;
let root = null;
let host = null;
let ui = null;
let toast = null;
let game = null;        // партия (rules.js)
let pos = null;         // её позиция (replay)
let stats = emptyStats();
let settings = defaultSettings();
let setup = normalizeSetup(null);
let busy = false;       // бот думает / считает
let ghost = -1;
let pressing = false;
let confirmTap = false;
let dragFrom = null;    // { x, y, i } — откуда ведётся «призрак»
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let finishing = false;
let request = 0;
let worker = null;
let workerId = 0;
let estimate = null;    // владение −1…1 по индексам — «Оценка»
let estimateOn = false;
let hintAt = -1;
let fresh = -1;         // только что поставленный камень — «впрыгивает»
let gone = [];          // только что взятые — тают
const timers = new Set();
const audio = createAudio(createSounds);

function sfx(name, opts) {
  if (!soundOn) return;
  try {
    audio.get()?.play(name, opts);
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

const save = () => {
  if (!api || !game) return;
  if (game.over || !game.moves.length) api.storage.remove('current');
  else api.storage.set('current', game);
};

const moverOf = (k) => ((game.handicap ? WHITE : BLACK) === BLACK ? (k % 2 ? WHITE : BLACK) : (k % 2 ? BLACK : WHITE));
const humanTurn = () => game && !game.over && !game.scoring && (game.vs === 'friend' || pos.turn === game.player);

// ---------- бот в отдельном потоке ----------

function startWorker() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return;
  }
  const w = worker;
  let alive = false;
  w.addEventListener('message', (e) => {
    if (e.data?.pong) alive = true;
  });
  w.addEventListener('error', () => {
    if (worker === w) dropWorker();
  });
  w.postMessage({ ping: true });
  later(() => {
    if (!alive && worker === w) dropWorker();
  }, 1500);
}

function dropWorker() {
  worker?.terminate();
  worker = null;
}

/** Задача боту: 'move' | 'hint' | 'dead'. В воркере; нет его или молчит — в основном потоке. */
function ask(kind) {
  const id = ++workerId;
  const snapshot = structuredClone(game);
  const local = () => new Promise((resolve) => later(() => {
    resolve(kind === 'hint' ? hintMove(snapshot) : kind === 'dead' ? estimateDead(snapshot) : chooseMove(snapshot, snapshot.level));
  }, 30));
  if (!worker) return local();
  return new Promise((resolve) => {
    let done = false;
    const w = worker;
    const onMessage = (e) => {
      if (e.data?.id !== id || done) return;
      done = true;
      w.removeEventListener('message', onMessage);
      if (e.data.error) local().then(resolve);
      else resolve(e.data.result);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, kind, game: snapshot, level: snapshot.level });
    later(() => {
      if (done) return;
      done = true;
      w.removeEventListener('message', onMessage);
      dropWorker();
      local().then(resolve);
    }, 12000);
  });
}

// ---------- доска ----------

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Детерминированный «шум» по номеру точки — полоски раковины и прожилки дерева не прыгают при перерисовке. */
function hash01(i, k = 0) {
  let x = Math.imul(i * 7919 + k * 104729 + 17, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

const margin = () => (settings.coords ? 1.15 : 0.62);
const flat = () => settings.skin === 'paper';

function buildBoard() {
  const n = game.size;
  const m = margin();
  const span = n - 1 + m * 2;
  ui.svg.setAttribute('viewBox', `${-m} ${-m} ${span} ${span}`);
  ui.svg.dataset.n = String(n);
  const defs = svg('defs');
  const grad = (id, stops, cx = '36%', cy = '30%', r = '72%') => {
    const g = svg('radialGradient', { id, cx, cy, r, fx: cx, fy: cy });
    for (const [off, v] of stops) g.append(svg('stop', { offset: off, style: `stop-color: var(${v})` }));
    defs.append(g);
  };
  grad('go-g-b', [['0%', '--go-b0'], ['38%', '--go-b1'], ['100%', '--go-b2']]);
  grad('go-g-w', [['0%', '--go-w0'], ['55%', '--go-w1'], ['100%', '--go-w2']]);
  const shade = svg('radialGradient', { id: 'go-g-shadow', cx: '50%', cy: '50%', r: '50%' });
  shade.append(svg('stop', { offset: '55%', style: 'stop-color: rgb(0 0 0 / 0.42)' }), svg('stop', { offset: '100%', style: 'stop-color: rgb(0 0 0 / 0)' }));
  defs.append(shade);
  const wood = svg('linearGradient', { id: 'go-g-wood', x1: '0', y1: '0', x2: '1', y2: '1' });
  wood.append(svg('stop', { offset: '0%', style: 'stop-color: var(--go-board0)' }), svg('stop', { offset: '100%', style: 'stop-color: var(--go-board1)' }));
  defs.append(wood);

  const bg = svg('rect', { class: 'go-bg', x: -m, y: -m, width: span, height: span, rx: 0.32, fill: 'url(#go-g-wood)' });
  // прожилки дерева — пологие волны, привязанные к доске
  const grain = svg('g', { class: 'go-grain' });
  for (let k = 0; k < 14; k++) {
    const y = -m + (span * (k + hash01(k, 1))) / 14;
    const amp = 0.25 + hash01(k, 2) * 0.5;
    grain.append(svg('path', { d: `M${-m},${y} C${span * 0.3 - m},${y - amp} ${span * 0.6 - m},${y + amp} ${span - m},${y - amp * 0.4}`, 'stroke-width': 0.04 + hash01(k, 3) * 0.08 }));
  }
  const grid = svg('g', { class: 'go-grid' });
  const lw = n >= 19 ? 0.045 : n >= 13 ? 0.05 : 0.055;
  for (let k = 0; k < n; k++) {
    const edge = k === 0 || k === n - 1;
    grid.append(svg('line', { x1: 0, y1: k, x2: n - 1, y2: k, 'stroke-width': edge ? lw * 1.8 : lw }));
    grid.append(svg('line', { x1: k, y1: 0, x2: k, y2: n - 1, 'stroke-width': edge ? lw * 1.8 : lw }));
  }
  for (const i of starPoints(n)) grid.append(svg('circle', { class: 'go-star', cx: i % n, cy: Math.floor(i / n), r: n >= 19 ? 0.13 : 0.11 }));
  const coords = svg('g', { class: 'go-coords' });
  if (settings.coords) {
    const letters = 'ABCDEFGHJKLMNOPQRST';
    for (let k = 0; k < n; k++) {
      for (const y of [-0.78, n - 1 + 0.78]) coords.append(Object.assign(svg('text', { x: k, y, 'font-size': 0.42 }), { textContent: letters[k] }));
      for (const x of [-0.78, n - 1 + 0.78]) coords.append(Object.assign(svg('text', { x, y: k, 'font-size': 0.42 }), { textContent: String(n - k) }));
    }
  }
  ui.terr = svg('g', { class: 'go-terr' });
  ui.cross = svg('g', { class: 'go-cross' });
  ui.stones = svg('g', { class: 'go-stones' });
  ui.marks = svg('g', { class: 'go-marks' });
  ui.ghostLayer = svg('g', { class: 'go-ghost' });
  ui.svg.replaceChildren(defs, bg, grain, grid, coords, ui.terr, ui.cross, ui.stones, ui.marks, ui.ghostLayer);
  paintBoard();
}

/** Камень цвета c в точке (x, y); dim — полупрозрачный (мёртвый, «призрак»). */
function stoneNode(x, y, c, i, { dim = false } = {}) {
  const g = svg('g', { class: `go-stone ${c === BLACK ? 'go-b' : 'go-w'}${dim ? ' go-dim' : ''}`, transform: `translate(${x} ${y})` });
  // у настоящих камней чёрный чуть больше белого (22,2 и 21,9 мм): белый на глаз кажется крупнее
  const r = c === BLACK ? 0.48 : 0.47;
  if (!flat()) g.append(svg('circle', { class: 'go-shadow', cx: 0.04, cy: 0.07, r: r * 1.1, fill: 'url(#go-g-shadow)' }));
  g.append(svg('circle', { class: 'go-body', r, fill: flat() ? null : `url(#go-g-${c === BLACK ? 'b' : 'w'})` }));
  if (!flat() && c === WHITE && i >= 0) {
    // полоски раковины: несколько тонких дуг под случайным (но своим у точки) углом
    const rot = hash01(i, 5) * 180;
    const stripes = svg('g', { class: 'go-shell', transform: `rotate(${rot.toFixed(1)})` });
    for (let k = -1.5; k <= 1.5; k++) {
      const yy = k * 0.15 + (hash01(i, 6) - 0.5) * 0.06;
      const half = Math.sqrt(Math.max(0, 0.42 * 0.42 - yy * yy));
      stripes.append(svg('path', { d: `M${-half},${yy} Q0,${yy - 0.05} ${half},${yy}` }));
    }
    g.append(stripes);
  }
  if (!flat()) g.append(svg('ellipse', { class: 'go-gloss', cx: -0.14, cy: -0.17, rx: 0.17, ry: 0.1, transform: 'rotate(-30 -0.14 -0.17)' }));
  return g;
}

function paintBoard() {
  if (!ui?.stones) return;
  const n = game.size;
  const b = pos.board;
  const dead = new Set(game.scoring?.dead ?? []);
  const stones = [];
  for (let i = 0; i < n * n; i++) {
    const c = b.color[b.fromIndex(i)];
    if (c !== BLACK && c !== WHITE) continue;
    const node = stoneNode(i % n, Math.floor(i / n), c, i, { dim: dead.has(i) });
    node.dataset.i = String(i);
    stones.push(node);
  }
  // взятые — тают на своих местах
  for (const { i, c } of gone) {
    const node = stoneNode(i % n, Math.floor(i / n), c, i);
    node.classList.add('go-gone');
    stones.push(node);
    if (!reducedMotion()) {
      animate(node, [{ opacity: 1, transform: `translate(${i % n}px, ${Math.floor(i / n)}px) scale(1)` },
        { opacity: 0, transform: `translate(${i % n}px, ${Math.floor(i / n) - 0.25}px) scale(0.6)` }],
      { duration: 380, delay: 90, easing: 'ease-in', fill: 'forwards' }).then?.(() => node.remove());
    }
  }
  gone = [];
  ui.stones.replaceChildren(...stones.filter((s) => !s.classList.contains('go-gone') || !reducedMotion()));
  if (fresh >= 0 && !reducedMotion()) {
    const node = ui.stones.querySelector(`.go-stone[data-i="${fresh}"]`);
    if (node) {
      const x = fresh % n;
      const y = Math.floor(fresh / n);
      animate(node, [{ transform: `translate(${x}px, ${y - 0.12}px) scale(1.18)`, opacity: 0.4 }, { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 }],
        { duration: 170, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' });
    }
  }
  fresh = -1;
  paintMarks();
  paintTerritory();
}

function paintMarks() {
  const n = game.size;
  const marks = [];
  const last = game.moves[game.moves.length - 1];
  if (last !== undefined && last !== PASS && !game.scoring) {
    const c = pos.board.color[pos.board.fromIndex(last)];
    if (c === BLACK || c === WHITE) marks.push(svg('circle', { class: `go-last ${c === BLACK ? 'on-b' : 'on-w'}`, cx: last % n, cy: Math.floor(last / n), r: 0.2 }));
  }
  if (hintAt >= 0) marks.push(svg('circle', { class: 'go-hint-ring', cx: hintAt % n, cy: Math.floor(hintAt / n), r: 0.42 }));
  // группы в атари — тонкое красное кольцо на каждом камне
  if (settings.atari && !game.scoring && !game.over) {
    const b = pos.board;
    for (let i = 0; i < n * n; i++) {
      const p = b.fromIndex(i);
      const c = b.color[p];
      if ((c === BLACK || c === WHITE) && b.inAtari(b.head[p])) marks.push(svg('circle', { class: 'go-atari', cx: i % n, cy: Math.floor(i / n), r: 0.43 }));
    }
  }
  for (const i of game.scoring?.dead ?? []) {
    const x = i % n;
    const y = Math.floor(i / n);
    marks.push(svg('path', { class: 'go-dead-x', d: `M${x - 0.2},${y - 0.2}L${x + 0.2},${y + 0.2}M${x + 0.2},${y - 0.2}L${x - 0.2},${y + 0.2}` }));
  }
  ui.marks.replaceChildren(...marks);
}

/** Территория при подсчёте и «Оценка» во время партии: квадратики цвета владельца. */
function paintTerritory() {
  const n = game.size;
  const out = [];
  if (game.scoring) {
    const sc = scoreNow();
    const b = pos.board;
    const dead = new Set(game.scoring.dead);
    for (let i = 0; i < n * n; i++) {
      const c = b.color[b.fromIndex(i)];
      if ((c === BLACK || c === WHITE) && !dead.has(i)) continue;
      const o = sc.owner[i];
      if (!o) continue;
      out.push(svg('rect', { class: `go-terr-${o === BLACK ? 'b' : 'w'}`, x: (i % n) - 0.18, y: Math.floor(i / n) - 0.18, width: 0.36, height: 0.36, rx: 0.05 }));
    }
  } else if (estimateOn && estimate) {
    const b = pos.board;
    for (let i = 0; i < n * n; i++) {
      const v = estimate[i];
      if (Math.abs(v) < 0.2) continue;
      const c = b.color[b.fromIndex(i)];
      const mine = (c === BLACK && v > 0) || (c === WHITE && v < 0);
      if (mine) continue;
      const size = 0.2 + Math.abs(v) * 0.3;
      out.push(svg('rect', { class: `go-terr-${v > 0 ? 'b' : 'w'} go-est`, x: (i % n) - size / 2, y: Math.floor(i / n) - size / 2, width: size, height: size, rx: 0.05, opacity: (0.35 + Math.abs(v) * 0.6).toFixed(2) }));
    }
  }
  ui.terr.replaceChildren(...out);
}

function showGhost(i) {
  ghost = i;
  ui.ghostLayer.replaceChildren();
  ui.cross.replaceChildren();
  ui.hintText.hidden = i < 0;
  if (i < 0) return;
  const n = game.size;
  const x = i % n;
  const y = Math.floor(i / n);
  ui.cross.append(svg('line', { x1: -0.3, y1: y, x2: n - 0.7, y2: y }), svg('line', { x1: x, y1: -0.3, x2: x, y2: n - 0.7 }));
  const g = stoneNode(x, y, pos.turn, -1, { dim: true });
  g.classList.add('go-ghost-stone');
  ui.ghostLayer.append(g);
}

function pointAt(e) {
  const pt = ui.svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(ui.svg.getScreenCTM().inverse());
  const c = Math.round(p.x);
  const r = Math.round(p.y);
  const n = game.size;
  if (r < 0 || c < 0 || r >= n || c >= n) return -1;
  return r * n + c;
}

// ---------- ход ----------

function paintStatus() {
  if (!ui || !game) return;
  const b = pos.board;
  const friend = game.vs === 'friend';
  const name = (c) => (friend ? (c === BLACK ? T.blackName : T.whiteName) : c === game.player ? T.you : T.bot);
  ui.pillB.querySelector('.go-pill-name').textContent = name(BLACK);
  ui.pillW.querySelector('.go-pill-name').textContent = name(WHITE);
  ui.pillB.querySelector('.go-pill-cap').textContent = T.prisoners(b.captured[WHITE]);
  ui.pillW.querySelector('.go-pill-cap').textContent = T.prisoners(b.captured[BLACK]);
  const active = !game.over && !game.scoring;
  ui.pillB.classList.toggle('on', active && pos.turn === BLACK);
  ui.pillW.classList.toggle('on', active && pos.turn === WHITE);
  let text;
  const last = game.moves[game.moves.length - 1];
  if (game.over) text = overText();
  else if (game.scoring) {
    const sc = scoreNow();
    text = T.scoreLine(sc.black, sc.white, game.komi);
  }
  else if (!friend && pos.turn !== game.player) text = T.botThinks;
  else if (last === PASS && game.moves.length) text = friend ? T.passed(3 - pos.turn) : T.botPassed;
  else text = friend ? T.turnOf(pos.turn) : T.yourTurn;
  ui.status.textContent = text;
  ui.status.classList.toggle('go-thinking', active && !friend && pos.turn !== game.player);
  ui.sub.textContent = subtitle();
  const can = humanTurn() && !busy && !finishing;
  ui.passBtn.disabled = !can;
  ui.resignBtn.disabled = !game || game.over || finishing || (!friend && busy);
  ui.hintBtn.hidden = friend;
  ui.hintBtn.disabled = !can || game.hints <= 0;
  ui.hintBtn.querySelector('.go-badge').textContent = String(game.hints);
  ui.estBtn.classList.toggle('on', estimateOn);
  ui.estBtn.disabled = Boolean(game.scoring) || finishing;
  ui.undoBtn.disabled = !canUndo();
  ui.play.hidden = Boolean(game.scoring || game.over);
  ui.scorePanel.hidden = !game.scoring || Boolean(game.over);
  ui.overPanel.hidden = !game.over;
}

function overText() {
  const o = game.over;
  const how = o.resign ? '' : ` ${T.byPoints(o.margin)}`;
  if (game.vs === 'friend') return `${o.winner === BLACK ? T.blackWins : T.whiteWins}`.replace('!', '') + how;
  if (o.resign) return o.winner === game.player ? T.botResigned : T.youResigned;
  return (o.winner === game.player ? 'Победа' : 'Победил бот') + how;
}

function subtitle() {
  const parts = [`${game.size}×${game.size}`, game.vs === 'friend' ? T.friend : T.levels[game.level][0]];
  if (game.handicap) parts.push(`фора ${game.handicap}`);
  parts.push(`коми ${fmtScore(game.komi)}`);
  return parts.join(' · ');
}

function scoreNow() {
  return scoreArea(pos.board, new Set(game.scoring?.dead ?? []), game.komi);
}

function onPointerDown(e) {
  if (!game || modalActive || finishing || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = pointAt(e);
  if (i < 0) return;
  e.preventDefault();
  audio.get();
  if (game.scoring) {
    if (!busy) toggleDead(i);
    return;
  }
  if (busy || !humanTurn()) return;
  if (pos.board.color[pos.board.fromIndex(i)] !== EMPTY) {
    if (ghost >= 0) showGhost(-1);
    return;
  }
  if (needConfirm(settings, game.size)) {
    confirmTap = ghost === i;
    if (!confirmTap) {
      showGhost(i);
      sfx('ghost');
      api.platform.haptic.selection();
    }
    pressing = true;
    dragFrom = { x: e.clientX, y: e.clientY, i: ghost };
    ui.svg.setPointerCapture?.(e.pointerId);
    return;
  }
  tryPlace(i);
}

/** Палец ведёт «призрак» относительно: сдвиг пальца на клетку — сдвиг камня на пересечение. */
function onPointerMove(e) {
  if (!pressing || !dragFrom || dragFrom.i < 0) return;
  const n = game.size;
  const cell = ui.svg.getBoundingClientRect().width / (n - 1 + margin() * 2);
  const dc = Math.round((e.clientX - dragFrom.x) / cell);
  const dr = Math.round((e.clientY - dragFrom.y) / cell);
  if (!dc && !dr) return;
  const r = Math.max(0, Math.min(n - 1, Math.floor(dragFrom.i / n) + dr));
  const c = Math.max(0, Math.min(n - 1, (dragFrom.i % n) + dc));
  const i = r * n + c;
  if (i === ghost || pos.board.color[pos.board.fromIndex(i)] !== EMPTY) return;
  confirmTap = false;
  showGhost(i);
  api.platform.haptic.selection();
}

function onPointerUp() {
  if (!pressing) return;
  pressing = false;
  dragFrom = null;
  if (confirmTap && ghost >= 0) tryPlace(ghost);
  confirmTap = false;
}

/** Почему сюда нельзя (или '' — можно). */
function whyIllegal(i) {
  const b = pos.board;
  const p = b.fromIndex(i);
  if (b.color[p] !== EMPTY) return 'busy';
  if (p === b.ko) return T.ko;
  if (!b.isLegal(p, pos.turn)) return T.suicide;
  if (!canPlayAt(pos, i)) return T.superko;
  return '';
}

function tryPlace(i) {
  const why = whyIllegal(i);
  if (why) {
    showGhost(-1);
    if (why === 'busy') return;
    sfx('illegal');
    api.platform.haptic.notification('error');
    toast.show(why);
    shake(ui.svg, { distance: 4, duration: 260 });
    return;
  }
  place(i);
}

/** Сделать ход (индекс или PASS) от того, чья очередь. */
function place(i) {
  showGhost(-1);
  hintAt = -1;
  const who = pos.turn;
  const before = pos.board;
  const snapshot = before.clone();
  if (!playMove(game, pos, i)) return;
  const byBot = game.vs === 'bot' && who !== game.player;
  if (i === PASS) {
    sfx('pass');
    toast.show(game.vs === 'friend' ? T.passed(who) : byBot ? T.botPassed : T.passed(who));
  } else {
    fresh = i;
    const taken = pos.board.lastCapturedAt.map((p) => ({ i: pos.board.toIndex(p), c: snapshot.color[p] }));
    gone = taken;
    sfx('stone', { opponent: byBot || (game.vs === 'friend' && who === WHITE) });
    if (taken.length) later(() => sfx('capture', { count: taken.length }), 0);
    api.platform.haptic.impact(taken.length ? 'medium' : 'light');
  }
  save();
  paintBoard();
  paintStatus();
  if (pos.passes >= 2) {
    enterScoring();
    return;
  }
  refreshEstimate();
  if (game.vs === 'bot' && pos.turn !== game.player) botTurn();
}

function botTurn() {
  busy = true;
  paintStatus();
  const token = ++request;
  const started = performance.now();
  ask('move').then((r) => {
    if (!game || token !== request || game.over) return;
    const wait = Math.max(0, 450 + Math.random() * 350 - (performance.now() - started));
    later(() => {
      if (!game || token !== request || game.over) return;
      busy = false;
      if (r.move === 'resign') {
        endByResign(game.player);
        return;
      }
      if (r.move !== PASS && !canPlayAt(pos, r.move)) r.move = PASS;
      place(r.move);
    }, reducedMotion() ? 0 : wait);
  });
}

function onPass() {
  if (!humanTurn() || busy || finishing) return;
  api.platform.haptic.impact('light');
  place(PASS);
}

function onHint() {
  if (!humanTurn() || busy || game.hints <= 0) {
    if (game?.hints <= 0) toast.show(T.noHints);
    return;
  }
  busy = true;
  game.hints--;
  paintStatus();
  const token = ++request;
  ask('hint').then((i) => {
    if (!game || token !== request) return;
    busy = false;
    save();
    sfx('hint');
    if (i === PASS) toast.show(T.hintPass);
    else {
      hintAt = i;
      showGhost(-1);
    }
    paintMarks();
    paintStatus();
  });
}

function toggleEstimate() {
  if (!game || game.scoring) return;
  estimateOn = !estimateOn;
  sfx('click');
  if (!estimateOn) {
    paintTerritory();
    paintStatus();
    return;
  }
  estimate = null;
  refreshEstimate();
  paintStatus();
}

let estimateToken = 0;
function refreshEstimate() {
  if (!estimateOn || !game || game.scoring) return;
  const token = ++estimateToken;
  // в основном потоке «Оценка» не считается, пока думает бот, — чтобы не тормозить
  ask('dead').then((r) => {
    if (!game || token !== estimateToken || !estimateOn) return;
    estimate = r.own;
    paintTerritory();
  });
}

// ---------- подсчёт и конец ----------

function enterScoring() {
  game.scoring = { dead: [] };
  busy = true;
  estimateOn = false;
  paintStatus();
  const token = ++request;
  ask('dead').then((r) => {
    if (!game || token !== request) return;
    busy = false;
    game.scoring.dead = r.dead;
    save();
    sfx('score');
    paintBoard();
    paintStatus();
  });
}

function toggleDead(i) {
  const chain = chainAt(pos.board, i);
  if (!chain.length) return;
  const dead = new Set(game.scoring.dead);
  const was = dead.has(i);
  for (const k of chain) {
    if (was) dead.delete(k);
    else dead.add(k);
  }
  game.scoring.dead = [...dead];
  sfx('ghost');
  api.platform.haptic.selection();
  save();
  paintBoard();
  paintStatus();
}

function resumePlay() {
  if (!game?.scoring) return;
  game.scoring = null;
  sfx('click');
  save();
  paintBoard();
  paintStatus();
  if (game.vs === 'bot' && pos.turn !== game.player) botTurn();
}

function finishScoring() {
  if (!game?.scoring || busy) return;
  const sc = scoreNow();
  const winner = sc.margin > 0 ? BLACK : WHITE;
  game.over = { winner, margin: Math.abs(sc.margin), black: sc.black, white: sc.white };
  conclude();
}

function endByResign(winner) {
  game.over = { winner, resign: true };
  game.scoring = null;
  conclude();
}

function conclude() {
  finishing = true;
  request++;
  estimateOn = false;
  const o = game.over;
  if (game.vs === 'friend') {
    stats = recordGame(stats, game, { winner: o.winner });
    api.storage.set('stats', stats);
    api.storage.remove('current');
    sfx('win');
    api.platform.haptic.notification('success');
    paintBoard();
    paintStatus();
    later(showFriendResult, reducedMotion() ? 0 : 600);
    return;
  }
  const won = o.winner === game.player;
  stats = recordGame(stats, game, { won });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sfx(won ? 'win' : 'lose');
  api.platform.haptic.notification(won ? 'success' : 'error');
  paintBoard();
  paintStatus();
  const detail = o.resign ? (won ? T.botResigned : T.youResigned) : T.scoreLine(o.black, o.white, game.komi);
  later(() => api?.finish({
    outcome: won ? 'win' : 'lose', title: won ? T.win : T.lose, locale: 'ru', variant: `${game.size}-${game.level}`,
    message: `${detail} · ${game.size}×${game.size} · ${T.levels[game.level][0]}`,
  }), reducedMotion() ? 0 : o.resign ? 600 : 1000);
}

function showFriendResult() {
  const o = game.over;
  const how = o.resign ? T.byResign : T.byPoints(o.margin);
  openModal(card(o.winner === BLACK ? T.blackWins : T.whiteWins,
    el('div', { class: 'go-result-stone' }, el('span', { class: `go-swatch-stone ${o.winner === BLACK ? 'b' : 'w'}` })),
    el('p', { class: 'go-result-how' }, how),
    !o.resign && el('p', { class: 'go-result-score' }, T.scoreLine(o.black, o.white, game.komi)),
    el('div', { class: 'go-friend-score' }, `${T.blackName} ${stats.friend.black} · ${T.whiteName} ${stats.friend.white}`),
    el('div', { class: 'go-btns' },
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); showNewGame(); } }, T.newGame),
      el('button', { class: 'btn', onclick: () => { closeModal(); startGame(); } }, T.again),
    ),
  ), false);
}

function onResign() {
  if (!game || game.over || finishing) return;
  const friend = game.vs === 'friend';
  const loser = friend ? pos.turn : game.player;
  openModal(card(T.resignAsk,
    el('p', { class: 'go-text' }, friend ? T.resignFriend(loser) : T.resignText),
    el('div', { class: 'go-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.no),
      el('button', { class: 'btn go-danger', onclick: () => { closeModal(); request++; busy = false; endByResign(3 - loser); } }, T.yes),
    ),
  ));
}

// ---------- отмена ----------

function canUndo() {
  if (!game || game.over || busy || finishing) return false;
  if (game.vs === 'friend') return game.moves.length > 0;
  return game.moves.some((_, k) => moverOf(k) === game.player) && (game.scoring || pos.turn === game.player);
}

function onUndo() {
  if (!canUndo()) return;
  request++;
  game.scoring = null;
  if (game.vs === 'friend') game.moves.pop();
  else {
    while (game.moves.length) {
      const who = moverOf(game.moves.length - 1);
      game.moves.pop();
      if (who === game.player) break;
    }
  }
  pos = replay(game);
  hintAt = -1;
  sfx('undo');
  showGhost(-1);
  save();
  paintBoard();
  paintStatus();
  refreshEstimate();
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
  return el('div', { class: 'go-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'go-card-head' },
      el('h2', {}, title),
      el('button', { class: 'go-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function radios(options, current, onPick, cls = 'go-option') {
  const buttons = options.map((o) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(o.id === current),
    onclick: () => {
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(options[k].id === o.id)));
      onPick(o.id);
    },
  }, el('b', {}, o.title), o.hint && el('span', {}, o.hint)));
  return el('div', { class: 'go-options', role: 'radiogroup' }, buttons);
}

function showNewGame(first = false) {
  const draft = { ...setup };
  const sideBlock = el('div', {},
    el('h3', { class: 'go-section' }, T.side),
    radios(['black', 'white', 'random'].map((id) => ({ id, title: T.sides[id] })), draft.side, (id) => { draft.side = id; }, 'go-option go-option-sm'),
  );
  const handicapBox = el('div', {});
  const renderHandicap = () => {
    const list = HANDICAPS.filter((h) => h <= maxHandicap(draft.size));
    if (!list.includes(draft.handicap)) draft.handicap = 0;
    handicapBox.replaceChildren(
      el('h3', { class: 'go-section' }, T.handicap),
      radios(list.map((h) => ({ id: h, title: h ? String(h) : T.noHandicap })), draft.handicap, (id) => { draft.handicap = id; }, 'go-option go-option-xs'),
      el('p', { class: 'go-note' }, T.handicapHint),
    );
  };
  const sync = () => {
    sideBlock.hidden = draft.vs !== 'bot';
    renderHandicap();
  };
  const opponents = [
    ...LEVEL_IDS.map((id) => ({ id, title: T.levels[id][0], hint: T.levels[id][1] })),
    { id: 'friend', title: T.friend, hint: T.friendHint },
  ];
  openModal(card(T.newGame,
    first && el('p', { class: 'go-note go-rules' }, T.rules),
    el('h3', { class: 'go-section' }, T.size),
    radios(SIZES.map((n) => ({ id: n, title: `${n}×${n}`, hint: T.sizeHint[n] })), draft.size, (id) => { draft.size = id; sync(); }, 'go-option go-option-sm'),
    el('h3', { class: 'go-section' }, T.opponent),
    radios(opponents, draft.vs === 'friend' ? 'friend' : draft.level, (id) => {
      if (id === 'friend') draft.vs = 'friend';
      else {
        draft.vs = 'bot';
        draft.level = id;
      }
      sync();
    }, 'go-option go-option-wide'),
    sideBlock,
    handicapBox,
    el('button', {
      class: 'btn go-play',
      onclick: () => {
        setup = normalizeSetup(draft);
        api.storage.set('setup', setup);
        closeModal();
        startGame();
      },
    }, T.start),
  ));
  sync();
}

function startGame() {
  request++;
  const player = setup.side === 'random' ? (Math.random() < 0.5 ? BLACK : WHITE) : setup.side === 'white' ? WHITE : BLACK;
  game = newGame({ size: setup.size, vs: setup.vs, level: setup.level, player, handicap: setup.handicap });
  pos = replay(game);
  busy = false;
  finishing = false;
  estimate = null;
  hintAt = -1;
  ghost = -1;
  buildBoard();
  showGhost(-1);
  intro();
  sfx('start');
  save();
  paintStatus();
  if (game.vs === 'bot' && pos.turn !== game.player) botTurn();
}

function intro() {
  if (reducedMotion()) return;
  animate(ui.svg, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
}

function showStats() {
  const table = (n) => el('div', { class: 'go-stats-table' },
    el('div', { class: 'go-stats-row go-stats-head' }, el('span', {}, ''), el('span', {}, T.wins), el('span', {}, T.losses)),
    ...LEVEL_IDS.map((l) => {
      const r = stats[`s${n}`][l];
      return el('div', { class: 'go-stats-row' }, el('span', {}, T.levels[l][0]), el('b', {}, r.wins), el('b', {}, r.losses));
    }),
  );
  const box = el('div', {});
  const tabs = SIZES.map((n) => el('button', {
    class: 'go-tab', role: 'tab',
    onclick: () => {
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(SIZES[k] === n)));
      box.replaceChildren(table(n));
    },
  }, `${n}×${n}`));
  const firstSize = game?.size ?? 9;
  tabs.forEach((t, k) => t.setAttribute('aria-selected', String(SIZES[k] === firstSize)));
  box.replaceChildren(table(firstSize));
  openModal(card(T.stats,
    el('div', { class: 'go-stat-tiles' },
      el('div', { class: 'go-tile' }, el('b', {}, stats.streak), el('span', {}, T.streak)),
      el('div', { class: 'go-tile' }, el('b', {}, stats.bestStreak), el('span', {}, T.bestStreak)),
    ),
    el('div', { class: 'go-tabs', role: 'tablist' }, tabs),
    box,
    el('h3', { class: 'go-section' }, T.friendStats),
    el('p', { class: 'go-friend-score' }, `${stats.friend.black} / ${stats.friend.white}`),
  ));
}

function saveSettings() {
  api.storage.set('settings', settings);
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'go-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      host.dataset.skin = id;
      skins.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === id)));
      buildBoard();
    },
  }, el('span', { class: 'go-swatch' }, el('i', { class: 'go-sw-b' }), el('i', { class: 'go-sw-w' })), T.skins[id]));
  const coords = el('input', { type: 'checkbox', checked: settings.coords });
  coords.addEventListener('change', () => {
    settings.coords = coords.checked;
    saveSettings();
    buildBoard();
  });
  const atari = el('input', { type: 'checkbox', checked: settings.atari });
  atari.addEventListener('change', () => {
    settings.atari = atari.checked;
    saveSettings();
    paintMarks();
  });
  openModal(card(T.settings,
    el('h3', { class: 'go-section' }, T.skin),
    el('div', { class: 'go-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'go-section' }, T.confirmSetting),
    radios(['big', 'always', 'never'].map((id) => ({ id, title: T.confirmOpts[id] })), settings.confirm, (id) => {
      settings.confirm = id;
      saveSettings();
      showGhost(-1);
    }, 'go-option go-option-sm'),
    el('label', { class: 'go-toggle' }, coords, el('span', {}, T.coords)),
    el('label', { class: 'go-toggle' }, atari, el('span', {}, T.atari)),
  ));
}

function iconButton(icon, label, onclick, cls = 'go-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick, badge = false) {
  const b = el('button', { class: 'go-tool', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'go-tool-icon' }),
    el('span', { class: 'go-tool-label' }, label),
    badge && el('span', { class: 'go-badge' }),
  );
  b.firstChild.innerHTML = icon;
  return b;
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else showGhost(-1);
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я')) onUndo();
}

export default {
  id: 'go',
  title: 'Го',

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
    settings = normalizeSettings(savedSettings);
    setup = normalizeSetup(savedSetup);
    host.dataset.skin = settings.skin;

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      sfx('click');
    });
    const pill = (cls) => el('div', { class: `go-pill ${cls}` },
      el('span', { class: 'go-pill-stone' }),
      el('span', { class: 'go-pill-text' }, el('span', { class: 'go-pill-name' }), el('span', { class: 'go-pill-cap' })),
    );
    ui = {
      sub: el('div', { class: 'go-sub' }),
      status: el('div', { class: 'go-status' }),
      pillB: pill('go-pill-b'),
      pillW: pill('go-pill-w'),
      svg: svg('svg', { class: 'go-board' }),
      hintText: el('div', { class: 'go-confirm', hidden: true }, T.confirm),
      modal: el('div', { class: 'go-modal', hidden: true }),
      undoBtn: iconButton(ICONS.undo, T.undo, onUndo),
      passBtn: toolButton(ICONS.pass, T.pass, onPass),
      hintBtn: toolButton(ICONS.hint, T.hint, onHint, true),
      estBtn: toolButton(ICONS.estimate, T.estimate, toggleEstimate),
      resignBtn: toolButton(ICONS.flag, T.resign, onResign),
    };
    ui.play = el('div', { class: 'go-tools' }, ui.passBtn, ui.hintBtn, ui.estBtn, ui.resignBtn);
    ui.scorePanel = el('div', { class: 'go-score-panel', hidden: true },
      el('p', { class: 'go-note' }, T.scoring),
      el('div', { class: 'go-btns' },
        el('button', { class: 'btn btn-secondary', onclick: resumePlay }, T.resume),
        el('button', { class: 'btn', onclick: finishScoring }, T.count),
      ),
    );
    ui.overPanel = el('div', { class: 'go-over-panel', hidden: true },
      el('button', { class: 'btn', onclick: () => showNewGame() }, T.newGame));
    ui.svg.addEventListener('pointerdown', onPointerDown);
    ui.svg.addEventListener('pointermove', onPointerMove);
    ui.svg.addEventListener('pointerup', onPointerUp);
    ui.svg.addEventListener('pointercancel', () => { pressing = false; });
    ui.svg.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

    root = el('div', { class: 'go' },
      el('div', { class: 'go-header' },
        el('div', { class: 'go-head-text' }, el('div', { class: 'go-title' }, T.title), ui.sub),
        el('div', { class: 'go-actions' },
          soundBtn,
          ui.undoBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, () => showNewGame()),
        ),
      ),
      el('div', { class: 'go-bar' }, ui.pillB, ui.pillW),
      el('div', { class: 'go-status-row' }, ui.status),
      el('div', { class: 'go-wrap' }, ui.svg),
      ui.hintText,
      ui.play,
      ui.scorePanel,
      ui.overPanel,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    startWorker();

    if (isValidGame(saved)) {
      game = saved;
      pos = replay(game);
      buildBoard();
      paintStatus();
      intro();
      if (game.scoring && !game.scoring.dead.length) enterScoring();
      else if (game.vs === 'bot' && !game.scoring && pos.turn !== game.player) botTurn();
    } else if (!savedSetup) {
      startGame();
      showNewGame(true);
    } else startGame();

    // для проверки (страница-обёртка): ?godebug в адресе
    if (new URLSearchParams(location.search).has('godebug')) {
      window.__go = {
        get game() { return game; },
        get pos() { return pos; },
        get busy() { return busy; },
        start: (next) => { setup = normalizeSetup({ ...setup, ...next }); closeModal(); startGame(); },
        play: (i) => { if (humanTurn() && !busy) tryPlace(i); },
        pass: () => onPass(),
        load: (moves) => { game.moves = []; game.scoring = null; for (const m of moves) playMove(game, pos, m); pos = replay(game); buildBoard(); paintStatus(); },
        skin: (id) => { settings.skin = id; host.dataset.skin = id; buildBoard(); },
        coord: (i) => coordName(game.size, i),
      };
    }
  },

  getState() {
    if (!game || game.over || !game.moves.length) return null;
    save();
    return { moves: game.moves.length };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    request++;
    dropWorker();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = root = host = ui = toast = game = pos = estimate = null;
    busy = modalActive = finishing = pressing = confirmTap = estimateOn = false;
    dragFrom = null;
    ghost = hintAt = fresh = -1;
    gone = [];
  },
};
