// Шахматы против бота. Правила — rules.js, движок — engine.js (думает в worker.js), фигуры — pieces.js (свои SVG).
//
// Ход — касанием (фигура → поле) или перетаскиванием (фигура крупнее и чуть выше пальца); точки — куда можно,
// кольца — взятия; подсвечены последний ход, выбранная фигура и король под шахом. Превращение пешки — столбик
// фигур над полем превращения (мимо — отмена). Над и под доской — соперники, съеденные фигуры и перевес
// в материале; ниже — запись партии по-русски (Кр, Ф, Л, С, К). Инструменты: вернуть ход (свой и ответ бота),
// подсказка (3 за партию — стрелка), повернуть доску, сдаться. Ничьи — сами: пат, троекратное повторение,
// 50 ходов, мало фигур для мата. Конец партии — экран результата оболочки с причиной.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, FLAG, START_FEN,
  typeOf, colorOf, fileOf, rankOf, fromOf, toOf, promoOf, flagsOf, sqName, sqFrom,
  fromFen, make, legalMoves, inCheck, outcome, san, uci, moveFromUci,
} from './rules.js';
import { LEVELS, chooseMove, bestMove } from './engine.js';
import { pieceSvg } from './pieces.js';
import { HINTS_PER_GAME, emptyStats, isValidStats, isValidGame, capturedOf, ruSan, recordGame } from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const T = {
  title: 'Шахматы',
  you: 'Ты',
  bot: 'Бот',
  newGame: 'Новая партия',
  level: 'Соперник',
  color: 'Играю',
  colors: { white: 'Белыми', black: 'Чёрными', random: 'Случайно' },
  abandon: 'Начатая партия будет засчитана как поражение.',
  play: 'Играть',
  undo: 'Вернуть',
  hint: 'Подсказка',
  flip: 'Повернуть',
  resign: 'Сдаться',
  resignAsk: 'Сдаться и закончить партию?',
  resignYes: 'Сдаюсь',
  cancel: 'Отмена',
  thinking: 'думает…',
  noHints: 'Подсказки на эту партию кончились',
  movesEmpty: 'Здесь будет запись партии',
  win: 'Победа!',
  lose: 'Поражение',
  draw: 'Ничья',
  reasons: {
    checkmate: 'Мат', stalemate: 'Пат', repetition: 'Позиция повторилась трижды', fifty: '50 ходов без взятий и ходов пешками',
    material: 'Не хватает фигур для мата', resign: 'Сдача',
  },
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  boardTheme: 'Доска',
  pieceStyle: 'Фигуры',
  coords: 'Координаты на доске',
  styles: { classic: 'С контуром', flat: 'Плоские' },
  wins: 'Побед',
  draws: 'Ничьих',
  losses: 'Поражений',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  promo: ['', '', 'Конь', 'Слон', 'Ладья', 'Ферзь'],
};

const THEMES = [
  { id: 'telegram', name: 'По умолчанию' },
  { id: 'wood', name: 'Дерево' },
  { id: 'green', name: 'Турнир' },
  { id: 'blue', name: 'Лёд' },
  { id: 'night', name: 'Ночь' },
  { id: 'candy', name: 'Конфета' },
];

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  flip: svgIcon('<path d="M7 4v16M7 4 3 8M7 4l4 4"/><path d="M17 20V4M17 20l-4-4M17 20l4-4"/>'),
  resign: svgIcon('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  bot: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/></svg>',
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;               // { v, startFen, moves: [UCI], level, player, hints }
let pos = null;
let legal = [];
let sans = [];                 // запись ходов (SAN)
let selected = -1;
let drag = null;
let promoPicker = null;         // открытый выбор фигуры при превращении
let busy = false;
let over = null;
let flipped = false;
let hintMove = 0;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let settings = { theme: 'telegram', pieces: 'classic', coords: true };
let setup = { level: 3, color: 'white' };
let stats = {};
let worker = null;
let requestId = 0;
const els = new Map();          // клетка → элемент фигуры
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

function plural(n, [one, few, many]) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

// ---------- партия ----------

/** Позиция и запись ходов из game. */
function rebuild() {
  pos = fromFen(game.startFen);
  sans = [];
  for (const u of game.moves) {
    const moves = legalMoves(pos);
    const m = moveFromUci(pos, u, moves);
    sans.push(san(pos, m, moves));
    make(pos, m);
  }
  legal = legalMoves(pos);
}

function save() {
  if (!api || !game) return;
  if (over || !game.moves.length) api.storage.remove('current');
  else api.storage.set('current', game);
}

const levelOf = (id) => LEVELS.find((l) => l.id === id) ?? LEVELS[2];
const myTurn = () => !over && pos.turn === game.player;
const bottomWhite = () => (game.player === WHITE) !== flipped;

// ---------- доска ----------

/** Клетка доски → строка/столбец на экране (с учётом того, кем играешь, и поворота). */
function screenOf(sq) {
  return bottomWhite() ? { row: 7 - rankOf(sq), col: fileOf(sq) } : { row: rankOf(sq), col: 7 - fileOf(sq) };
}

function sqAt(clientX, clientY) {
  const rect = ui.board.getBoundingClientRect();
  const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
  const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
  if (row < 0 || col < 0 || row > 7 || col > 7) return -1;
  return bottomWhite() ? (7 - row) * 16 + col : row * 16 + (7 - col);
}

function buildSquares() {
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) cells.push(el('div', { class: `ch-sq ${(row + col) % 2 ? 'ch-dark' : 'ch-light'}` }));
  }
  ui.squares.replaceChildren(...cells);
  paintCoords();
}

function paintCoords() {
  const files = bottomWhite() ? 'abcdefgh' : 'hgfedcba';
  const ranks = bottomWhite() ? '87654321' : '12345678';
  const labels = [];
  if (settings.coords) {
    for (let k = 0; k < 8; k++) {
      labels.push(el('span', { class: `ch-coord ch-coord-file ${k % 2 ? 'ch-on-light' : 'ch-on-dark'}`, style: `--c: ${k}` }, files[k]));
      labels.push(el('span', { class: `ch-coord ch-coord-rank ${k % 2 ? 'ch-on-dark' : 'ch-on-light'}`, style: `--r: ${k}` }, ranks[k]));
    }
  }
  ui.coords.replaceChildren(...labels);
}

function placeEl(node, sq) {
  const { row, col } = screenOf(sq);
  node.style.setProperty('--r', row);
  node.style.setProperty('--c', col);
}

function pieceEl(p, sq) {
  const node = el('div', { class: 'ch-piece' });
  node.innerHTML = pieceSvg(typeOf(p), colorOf(p) === BLACK, settings.pieces);
  placeEl(node, sq);
  return node;
}

/** Все фигуры заново (начало партии, отмена, поворот, смена стиля). */
function renderPieces() {
  closePromo();
  els.clear();
  const nodes = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = pos.board[sq];
    if (!p) continue;
    const node = pieceEl(p, sq);
    els.set(sq, node);
    nodes.push(node);
  }
  ui.pieces.replaceChildren(...nodes);
}

/** Сдвинуть фигуры по ходу m (позиция уже после хода): взятая тает, ладья при рокировке едет следом. */
function animateMove(m) {
  const from = fromOf(m);
  const to = toOf(m);
  const flags = flagsOf(m);
  const mover = colorOf(pos.board[to]);
  const node = els.get(from);
  const victimSq = flags & FLAG.ep ? to + (mover === WHITE ? -16 : 16) : to;
  const victim = els.get(victimSq);
  if (victim && victim !== node) {
    els.delete(victimSq);
    victim.classList.add('ch-taken');
    later(() => victim.remove(), reducedMotion() ? 0 : 240);
  }
  els.delete(from);
  if (node) {
    placeEl(node, to);
    els.set(to, node);
    if (promoOf(m)) {
      later(() => {
        node.innerHTML = pieceSvg(promoOf(m), mover === BLACK, settings.pieces);
        animate(node.firstElementChild, [{ scale: 0.4 }, { scale: 1.15 }, { scale: 1 }], { duration: 300 });
      }, reducedMotion() ? 0 : 180);
    }
  }
  if (flags & FLAG.castle) {
    const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    const rook = els.get(rf);
    els.delete(rf);
    if (rook) {
      placeEl(rook, rt);
      els.set(rt, rook);
    }
  }
}

/** Подсветки: последний ход, выбор, шах, куда можно пойти, подсказка. */
function paintMarks() {
  const marks = [];
  const mark = (sq, cls) => {
    const { row, col } = screenOf(sq);
    marks.push(el('div', { class: `ch-mark ${cls}`, style: `--r: ${row}; --c: ${col}` }));
  };
  const last = game.moves[game.moves.length - 1];
  if (last) {
    mark(sqFrom(last.slice(0, 2)), 'ch-last');
    mark(sqFrom(last.slice(2, 4)), 'ch-last');
  }
  if (hintMove) {
    mark(fromOf(hintMove), 'ch-hint');
    mark(toOf(hintMove), 'ch-hint');
  }
  if (inCheck(pos)) mark(pos.kings[pos.turn ? 1 : 0], over?.result === 'checkmate' ? 'ch-check ch-mated' : 'ch-check');
  if (selected >= 0) {
    mark(selected, 'ch-selected');
    const seen = new Set();
    for (const m of legal) {
      if (fromOf(m) !== selected || seen.has(toOf(m))) continue;
      seen.add(toOf(m));
      mark(toOf(m), flagsOf(m) & FLAG.capture ? 'ch-target ch-capture' : 'ch-target');
    }
  }
  ui.marks.replaceChildren(...marks);
  paintArrow();
}

/** Стрелка подсказки. */
function paintArrow() {
  ui.arrow.replaceChildren();
  if (!hintMove) return;
  const a = screenOf(fromOf(hintMove));
  const b = screenOf(toOf(hintMove));
  const x1 = a.col + 0.5;
  const y1 = a.row + 0.5;
  const x2 = b.col + 0.5;
  const y2 = b.row + 0.5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1 + ((x2 - x1) / len) * 0.2);
  line.setAttribute('y1', y1 + ((y2 - y1) / len) * 0.2);
  line.setAttribute('x2', x2 - ((x2 - x1) / len) * 0.38);
  line.setAttribute('y2', y2 - ((y2 - y1) / len) * 0.38);
  line.setAttribute('class', 'ch-arrow-line');
  line.setAttribute('marker-end', 'url(#ch-head)');
  ui.arrow.append(line);
}

// ---------- игроки, материал, запись ----------

function paintPlayers() {
  const white = capturedOf(pos.board, WHITE);
  const black = capturedOf(pos.board, BLACK);
  const row = (bar, color) => {
    const taken = color === WHITE ? black.out : white.out;      // что этот игрок забрал у соперника
    const lead = color === WHITE ? white.material - black.material : black.material - white.material;
    const icons = [];
    for (const t of [QUEEN, ROOK, BISHOP, KNIGHT, PAWN]) {
      for (let k = 0; k < taken[t]; k++) {
        const i = el('span', { class: 'ch-cap' });
        i.innerHTML = pieceSvg(t, color === WHITE, settings.pieces);
        icons.push(i);
      }
    }
    bar.caps.replaceChildren(...icons, lead > 0 ? el('span', { class: 'ch-lead' }, `+${lead}`) : '');
  };
  row(ui.me, game.player);
  row(ui.them, game.player ^ 8);
  ui.them.name.textContent = `${T.bot} · ${levelOf(game.level).name}`;
  ui.them.status.textContent = busy && !myTurn() ? T.thinking : '';
  ui.them.root.classList.toggle('ch-turn', !over && pos.turn !== game.player);
  ui.me.root.classList.toggle('ch-turn', !over && pos.turn === game.player);
  ui.hintBtn.querySelector('.ch-count').textContent = String(game.hints);
  ui.hintBtn.disabled = !game.hints || Boolean(over) || !myTurn() || busy;
  ui.undoBtn.disabled = !canUndo();
  ui.resignBtn.disabled = Boolean(over) || !game.moves.length;
}

function paintMoves() {
  const start = fromFen(game.startFen);
  const offset = start.turn === BLACK ? 1 : 0;
  const items = [];
  sans.forEach((s, k) => {
    const ply = k + offset;
    if (ply % 2 === 0) items.push(el('span', { class: 'ch-move-num' }, `${start.full + Math.floor(ply / 2)}.`));
    else if (k === 0) items.push(el('span', { class: 'ch-move-num' }, `${start.full}…`));
    items.push(el('span', { class: `ch-move${k === sans.length - 1 ? ' ch-move-last' : ''}` }, ruSan(s)));
  });
  ui.moves.replaceChildren(...items);
  ui.moves.dataset.empty = T.movesEmpty;
  ui.moves.scrollTop = ui.moves.scrollHeight;
}

function paintAll() {
  paintMarks();
  paintPlayers();
  paintMoves();
}

// ---------- ввод ----------

function onPointerDown(e) {
  if (!game || busy || over || modalActive || promoPicker || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sq = sqAt(e.clientX, e.clientY);
  if (sq < 0) return;
  e.preventDefault();
  audio.get();
  if (!myTurn()) return;
  const p = pos.board[sq];
  // фигура уже выбрана и нажали на поле, куда она ходит, — ходим
  if (selected >= 0 && legal.some((m) => fromOf(m) === selected && toOf(m) === sq)) {
    tryMove(selected, sq);
    return;
  }
  if (p && colorOf(p) === game.player) {
    selected = sq;
    hintMove = 0;
    sfx('select');
    paintMarks();
    const node = els.get(sq);
    if (node) {
      drag = { sq, node, id: e.pointerId, x: e.clientX, y: e.clientY, moving: false };
      try {
        ui.board.setPointerCapture(e.pointerId);
      } catch {
        // старые браузеры — перетаскивание без захвата
      }
    }
    return;
  }
  if (selected >= 0) {
    selected = -1;
    paintMarks();
  }
}

function onPointerMove(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const rect = ui.board.getBoundingClientRect();
  const size = rect.width / 8;
  if (!drag.moving && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < size * 0.2) return;
  drag.moving = true;
  drag.node.classList.add('ch-dragging');
  // пальцем фигура закрыта — держим её чуть выше
  const lift = e.pointerType === 'touch' ? 0.45 : 0;
  drag.node.style.setProperty('--dx', `${((e.clientX - rect.left) / size - 0.5) * 100}%`);
  drag.node.style.setProperty('--dy', `${((e.clientY - rect.top) / size - 0.5 - lift) * 100}%`);
}

function endDrag() {
  if (!drag) return null;
  const d = drag;
  drag = null;
  d.node.classList.remove('ch-dragging');
  d.node.style.removeProperty('--dx');
  d.node.style.removeProperty('--dy');
  return d;
}

function onPointerUp(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const d = endDrag();
  if (!d.moving) return;
  const lift = e.pointerType === 'touch' ? (ui.board.getBoundingClientRect().width / 8) * 0.45 : 0;
  const sq = sqAt(e.clientX, e.clientY - lift);
  if (sq < 0 || sq === d.sq) return;
  if (legal.some((m) => fromOf(m) === d.sq && toOf(m) === sq)) tryMove(d.sq, sq);
  else {
    sfx('illegal');
    shake(ui.board, { distance: 4, duration: 260 });
  }
}

function tryMove(from, to) {
  const options = legal.filter((m) => fromOf(m) === from && toOf(m) === to);
  if (!options.length) return;
  if (options.length > 1) askPromotion(to, options);
  else playerMove(options[0]);
}

function closePromo() {
  promoPicker?.remove();
  promoPicker = null;
}

/** Столбик фигур над полем превращения; нажатие мимо — отмена. */
function askPromotion(to, options) {
  closePromo();
  const { row, col } = screenOf(to);
  const picker = el('div', { class: 'ch-promo' });
  promoPicker = picker;
  const close = closePromo;
  const column = el('div', { class: `ch-promo-col ${row === 0 ? 'ch-promo-top' : 'ch-promo-bottom'}`, style: `--c: ${col}` },
    ...[QUEEN, KNIGHT, ROOK, BISHOP].map((t) => {
      const b = el('button', { class: 'ch-promo-btn', 'aria-label': T.promo[t] });
      b.innerHTML = pieceSvg(t, game.player === BLACK, settings.pieces);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        playerMove(options.find((m) => promoOf(m) === t));
      });
      return b;
    }));
  picker.append(column);
  picker.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
    selected = -1;
    paintMarks();
  });
  ui.board.append(picker);
  animate(picker, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
}

function playerMove(m) {
  selected = -1;
  hintMove = 0;
  applyMove(m, false);
  if (!over) botTurn();
}

/** Сделать ход (позиция, запись, анимация, звук); партия кончилась — итог. */
function applyMove(m, byBot) {
  const text = san(pos, m, legal);
  const capture = flagsOf(m) & FLAG.capture;
  make(pos, m);
  game.moves.push(uci(m));
  sans.push(text);
  legal = legalMoves(pos);
  animateMove(m);
  if (flagsOf(m) & FLAG.castle) sfx('castle');
  else if (capture) sfx('capture', { opponent: byBot });
  else sfx('move', { opponent: byBot });
  if (promoOf(m)) sfx('promote');
  if (inCheck(pos) && legal.length) sfx('check');
  api.platform.haptic.impact(capture ? 'medium' : 'light');
  over = outcome(pos, legal);
  save();
  paintAll();
  if (over) finish();
}

// ---------- бот ----------

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

/** Ход движка (уровень или 'hint'): в воркере; нет воркера или молчит — в основном потоке. → UCI | '' */
function askEngine(level) {
  const id = ++requestId;
  const snapshot = { fen: game.startFen, moves: game.moves.slice() };
  const local = () => new Promise((resolve) => later(() => {
    const p = fromFen(snapshot.fen);
    for (const u of snapshot.moves) make(p, moveFromUci(p, u));
    const r = level === 'hint' ? bestMove(p, { timeMs: 700 }) : chooseMove(p, level, snapshot.moves);
    resolve(r.move ? uci(r.move) : '');
  }, 30));
  if (!worker) return local();
  return new Promise((resolve) => {
    let settled = false;
    const w = worker;
    const onMessage = (e) => {
      if (e.data?.id !== id || settled) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      if (e.data.error) local().then(resolve);
      else resolve(e.data.move);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, fen: snapshot.fen, moves: snapshot.moves, level: level === 'hint' ? 6 : level });
    later(() => {
      if (settled) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      dropWorker();
      local().then(resolve);
    }, 9000);
  });
}

async function botTurn() {
  busy = true;
  paintPlayers();
  const token = requestId + 1;
  const started = performance.now();
  const u = await askEngine(game.level);
  if (!game || over || token !== requestId) return;
  // бот не отвечает мгновенно — 0,4–0,8 с «на подумать», как живой соперник
  const wait = Math.max(0, 400 + Math.random() * 400 - (performance.now() - started));
  later(() => {
    if (!game || over || token !== requestId) return;
    busy = false;
    const m = moveFromUci(pos, u, legal);
    if (m) applyMove(m, true);
    else paintPlayers();
  }, reducedMotion() ? 0 : wait);
}

// ---------- инструменты ----------

function canUndo() {
  if (!game || over || busy || !myTurn()) return false;
  const botFirst = fromFen(game.startFen).turn !== game.player;
  return game.moves.length >= (botFirst ? 3 : 2);
}

function onUndo() {
  if (!canUndo()) return;
  requestId++;
  game.moves.splice(-2, 2);
  selected = -1;
  hintMove = 0;
  rebuild();
  renderPieces();
  save();
  paintAll();
  sfx('move');
}

async function onHint() {
  if (!game.hints) {
    toast.show(T.noHints, 2000);
    return;
  }
  if (over || !myTurn() || busy) return;
  busy = true;
  paintPlayers();
  const token = requestId + 1;
  const u = await askEngine('hint');
  if (!game || token !== requestId) return;
  busy = false;
  const m = moveFromUci(pos, u, legal);
  if (m && !over) {
    game.hints -= 1;
    hintMove = m;
    selected = -1;
    save();
    sfx('click');
  }
  paintAll();
}

function onFlip() {
  flipped = !flipped;
  buildSquares();
  renderPieces();
  paintMarks();
  sfx('click');
}

function onResign() {
  if (over || !game.moves.length) return;
  openModal(card(T.resignAsk,
    el('div', { class: 'ch-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); resign(); } }, T.resignYes),
    ),
  ));
}

function resign() {
  if (over) return;
  requestId++;
  busy = false;
  over = { result: 'resign', winner: game.player ^ 8 };
  finish();
}

function finish() {
  selected = -1;
  hintMove = 0;
  paintAll();
  api.storage.remove('current');
  const result = over.winner === undefined ? 'draw' : over.winner === game.player ? 'win' : 'lose';
  recordGame(stats, game.level, result);
  api.storage.set('stats', stats);
  later(() => sfx(result), 250);
  api.platform.haptic.notification(result === 'win' ? 'success' : result === 'draw' ? 'warning' : 'error');
  const moves = Math.ceil(game.moves.length / 2);
  const message = `${T.reasons[over.result]} · ${levelOf(game.level).name} · ${moves} ${plural(moves, ['ход', 'хода', 'ходов'])}`;
  const title = result === 'win' ? T.win : result === 'lose' ? T.lose : T.draw;
  const variant = `level-${game.level}`;
  later(() => api?.finish({ outcome: result, title, locale: 'ru', variant, message }), reducedMotion() ? 300 : 1300);
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
  return el('div', { class: 'ch-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ch-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ch-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Кнопки-переключатели: items — [{ id, body }], isOn(id), onPick(id). */
function radioGroup(cls, items, isOn, onPick) {
  const buttons = items.map((item) => {
    const b = el('button', { class: cls, role: 'radio', 'aria-checked': String(isOn(item.id)) }, item.body);
    b.addEventListener('click', () => {
      onPick(item.id);
      buttons.forEach((x, k) => x.setAttribute('aria-checked', String(isOn(items[k].id))));
    });
    return b;
  });
  return buttons;
}

function showNewGame() {
  const draft = { ...setup };
  const inProgress = game && !over && game.moves.length >= 2;
  openModal(card(T.newGame,
    el('h3', { class: 'ch-section' }, T.level),
    el('div', { class: 'ch-levels', role: 'radiogroup' }, radioGroup('ch-option',
      LEVELS.map((l) => ({ id: l.id, body: [el('b', {}, `${l.id}. ${l.name}`), el('span', {}, l.hint)] })),
      (id) => draft.level === id, (id) => { draft.level = id; })),
    el('h3', { class: 'ch-section' }, T.color),
    el('div', { class: 'ch-row3', role: 'radiogroup' }, radioGroup('ch-option ch-option-sm',
      ['white', 'black', 'random'].map((id) => ({ id, body: [el('span', { class: `ch-color-dot ch-color-${id}` }), el('b', {}, T.colors[id])] })),
      (id) => draft.color === id, (id) => { draft.color = id; })),
    inProgress ? el('p', { class: 'ch-note' }, T.abandon) : null,
    el('button', { class: 'btn ch-play', onclick: () => { setup = draft; api.storage.set('setup', setup); closeModal(); startGame(); } }, T.play),
  ));
}

function startGame() {
  requestId++;
  // брошенная партия (новая поверх начатой) — поражение
  if (game && !over && game.moves.length >= 2) {
    recordGame(stats, game.level, 'lose');
    api.storage.set('stats', stats);
  }
  const player = setup.color === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : setup.color === 'black' ? BLACK : WHITE;
  game = { v: 1, startFen: START_FEN, moves: [], level: setup.level, player, hints: HINTS_PER_GAME };
  over = null;
  busy = false;
  flipped = false;
  selected = -1;
  hintMove = 0;
  rebuild();
  buildSquares();
  renderPieces();
  paintAll();
  intro();
  sfx('start');
  save();
  if (!myTurn()) later(() => game && !over && !busy && !myTurn() && botTurn(), reducedMotion() ? 0 : 500);
}

/** Фигуры новой партии появляются рядами от краёв к центру. */
function intro() {
  if (reducedMotion()) return;
  for (const node of ui.pieces.children) {
    const row = Number(node.style.getPropertyValue('--r'));
    const delay = (row < 4 ? row : 7 - row) * 70;
    animate(node.firstElementChild, [{ opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1 }], { duration: 280, delay, easing: 'ease-out', fill: 'backwards' });
  }
}

function showStats() {
  openModal(card(T.stats,
    el('div', { class: 'ch-stats' },
      el('div', { class: 'ch-stats-row ch-stats-head' }, el('span', {}, T.level), el('span', {}, T.wins), el('span', {}, T.draws), el('span', {}, T.losses)),
      ...LEVELS.map((l) => {
        const r = stats[l.id];
        return el('div', { class: 'ch-stats-row' }, el('span', {}, l.name), el('b', {}, r.wins), el('b', {}, r.draws), el('b', {}, r.losses));
      }),
    ),
  ));
}

function showSettings() {
  const coords = el('input', { type: 'checkbox', checked: settings.coords });
  coords.addEventListener('change', () => {
    settings.coords = coords.checked;
    api.storage.set('settings', settings);
    paintCoords();
  });
  const sample = (style) => {
    const node = el('span', { class: 'ch-style-sample' });
    node.innerHTML = pieceSvg(KNIGHT, false, style) + pieceSvg(KNIGHT, true, style);
    return node;
  };
  openModal(card(T.settings,
    el('h3', { class: 'ch-section' }, T.boardTheme),
    el('div', { class: 'ch-themes', role: 'radiogroup' }, radioGroup('ch-theme',
      THEMES.map((t) => ({
        id: t.id,
        body: [el('span', { class: 'ch-swatch', 'data-skin': t.id }, el('i', { class: 'ch-sw-l' }), el('i', { class: 'ch-sw-d' }), el('i', { class: 'ch-sw-d' }), el('i', { class: 'ch-sw-l' })), t.name],
      })),
      (id) => settings.theme === id,
      (id) => {
        settings.theme = id;
        host.dataset.skin = id;
        api.storage.set('settings', settings);
      })),
    el('h3', { class: 'ch-section' }, T.pieceStyle),
    el('div', { class: 'ch-row2', role: 'radiogroup' }, radioGroup('ch-option ch-option-sm',
      ['classic', 'flat'].map((id) => ({ id, body: [sample(id), el('b', {}, T.styles[id])] })),
      (id) => settings.pieces === id,
      (id) => {
        settings.pieces = id;
        api.storage.set('settings', settings);
        renderPieces();
        paintPlayers();
      })),
    el('label', { class: 'ch-toggle' }, coords, el('span', {}, T.coords)),
    pointsInfo(api, 'chess'),
  ));
}

function iconButton(icon, label, onclick) {
  const b = el('button', { class: 'ch-icon-btn', 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick, extra = null) {
  const b = el('button', { class: 'ch-tool', 'aria-label': label, onclick }, extra, el('span', { class: 'ch-tool-label' }, label));
  b.insertAdjacentHTML('afterbegin', icon);
  return b;
}

function playerBar(isBot) {
  const name = el('span', { class: 'ch-name' }, isBot ? T.bot : T.you);
  const status = el('span', { class: 'ch-status' });
  const caps = el('div', { class: 'ch-caps' });
  const avatar = el('span', { class: `ch-avatar${isBot ? ' ch-avatar-bot' : ''}` });
  if (isBot) avatar.innerHTML = ICONS.bot;
  else avatar.textContent = (api.platform.user?.first_name ?? '').trim().charAt(0).toUpperCase() || 'Я';
  const bar = el('div', { class: 'ch-player' }, avatar, el('div', { class: 'ch-player-main' }, el('div', { class: 'ch-player-top' }, name, status), caps));
  return { root: bar, name, status, caps };
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    onUndo();
  }
}

export default {
  id: 'chess',
  title: 'Шахматы',

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
      theme: THEMES.some((t) => t.id === savedSettings?.theme) ? savedSettings.theme : 'telegram',
      pieces: ['classic', 'flat'].includes(savedSettings?.pieces) ? savedSettings.pieces : 'classic',
      coords: savedSettings?.coords !== false,
    };
    const knownSetup = savedSetup && LEVELS.some((l) => l.id === savedSetup.level) && ['white', 'black', 'random'].includes(savedSetup.color);
    if (knownSetup) setup = { level: savedSetup.level, color: savedSetup.color };
    host.dataset.skin = settings.theme;

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.setAttribute('aria-label', soundOn ? T.soundOn : T.soundOff);
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      sfx('click');
    });
    ui = {
      squares: el('div', { class: 'ch-squares' }),
      coords: el('div', { class: 'ch-coords' }),
      marks: el('div', { class: 'ch-marks' }),
      pieces: el('div', { class: 'ch-pieces' }),
      moves: el('div', { class: 'ch-moves' }),
      modal: el('div', { class: 'ch-modal', hidden: true }),
      them: playerBar(true),
      me: playerBar(false),
    };
    const ns = 'http://www.w3.org/2000/svg';
    const arrowSvg = document.createElementNS(ns, 'svg');
    arrowSvg.setAttribute('viewBox', '0 0 8 8');
    arrowSvg.setAttribute('class', 'ch-arrow');
    arrowSvg.innerHTML = '<defs><marker id="ch-head" viewBox="0 0 4 4" refX="1.2" refY="2" markerWidth="2.6" markerHeight="2.6" orient="auto"><path d="M0 0 4 2 0 4Z" class="ch-arrow-head"/></marker></defs>';
    ui.arrow = document.createElementNS(ns, 'g');
    arrowSvg.append(ui.arrow);
    ui.board = el('div', { class: 'ch-board' }, ui.squares, ui.marks, ui.coords, ui.pieces, arrowSvg);
    ui.undoBtn = toolButton(ICONS.undo, T.undo, onUndo);
    ui.hintBtn = toolButton(ICONS.hint, T.hint, onHint, el('span', { class: 'ch-count' }));
    ui.resignBtn = toolButton(ICONS.resign, T.resign, onResign);
    ui.board.addEventListener('pointerdown', onPointerDown);
    ui.board.addEventListener('pointermove', onPointerMove);
    ui.board.addEventListener('pointerup', onPointerUp);
    ui.board.addEventListener('pointercancel', endDrag);
    ui.board.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });

    root = el('div', { class: 'ch' },
      el('div', { class: 'ch-header' },
        el('div', { class: 'ch-title' }, T.title),
        el('div', { class: 'ch-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, showNewGame),
        ),
      ),
      el('div', { class: 'ch-mid' }, ui.them.root, ui.board, ui.me.root),
      ui.moves,
      el('div', { class: 'ch-tools' }, ui.undoBtn, ui.hintBtn, toolButton(ICONS.flip, T.flip, onFlip), ui.resignBtn),
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    startWorker();

    if (isValidGame(saved)) {
      game = saved;
      over = null;
      rebuild();
      buildSquares();
      renderPieces();
      paintAll();
      if (!myTurn()) botTurn();
    } else {
      startGame();
      if (!knownSetup) showNewGame();
    }
    // для проверки (страница-обёртка): ?chdebug в адресе
    if (new URLSearchParams(location.search).has('chdebug')) {
      window.__ch = {
        get game() { return game; },
        get busy() { return busy; },
        get over() { return over; },
        get legal() { return legal.map(uci); },
        move: (u) => {
          const m = moveFromUci(pos, u, legal);
          if (m && myTurn() && !busy) playerMove(m);
          return Boolean(m);
        },
        select: (name) => { selected = sqFrom(name); paintMarks(); },
        start: (next) => { setup = { ...setup, ...next }; closeModal(); startGame(); },
        load: (g) => { requestId++; game = g; over = null; busy = false; rebuild(); buildSquares(); renderPieces(); paintAll(); },
        promo: (from, to) => tryMove(sqFrom(from), sqFrom(to)),
        hint: () => onHint(),
        name: sqName,
      };
    }
  },

  getState() {
    if (!game || over || !game.moves.length) return null;
    save();
    return { moves: game.moves.length };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    requestId++;
    dropWorker();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = host = root = ui = toast = game = pos = over = null;
    legal = [];
    sans = [];
    selected = -1;
    drag = null;
    promoPicker = null;
    busy = false;
    modalActive = false;
    flipped = false;
    hintMove = 0;
    els.clear();
  },
};
