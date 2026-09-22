// Русские шашки против бота: выбор уровня и цвета, доска поворачивается к игроку, подсветка обязательного боя,
// бой из нескольких шашек — по шагам (коснись следующего поля), анимации ходов, отмена, подсказка, сдача.
// Бот думает в Web Worker (worker.js); если воркер недоступен — в основном потоке. Партия, статистика по
// уровням и настройки — в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import {
  WHITE, BLACK, LEVEL_IDS, generateMoves, newGame, playMove, undoMove, result, bestMove, sameMove, moveTo, count,
  isValidState, emptyStats, migrateStats, MODES, rowOf, colOf, isDark,
} from './logic.js';

const SKINS = ['telegram', 'wood', 'green', 'marble', 'night', 'candy'];
const T = {
  title: 'Шашки',
  levels: { novice: 'Новичок', easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', master: 'Мастер' },
  levelHint: {
    novice: 'Часто ошибается', easy: 'Думает на 2 хода', medium: 'Думает на 4 хода', hard: 'Считает глубоко', master: 'Играет в полную силу',
  },
  sub: (mode, level, side) => `${mode === 'giveaway' ? 'Поддавки · ' : ''}${T.levels[level]} · вы ${side === WHITE ? 'белыми' : 'чёрными'}`,
  mode: 'Режим',
  modes: { classic: 'Классика', giveaway: 'Поддавки' },
  modeHint: { classic: 'Побей все шашки соперника', giveaway: 'Отдай все свои шашки первым' },
  yourTurn: 'Ваш ход',
  botTurn: 'Бот думает',
  mustCapture: 'Бить обязательно!',
  newGame: 'Новая партия',
  level: 'Сложность',
  color: 'Цвет',
  colors: { white: 'Белые', black: 'Чёрные', random: 'Случайно' },
  play: 'Играть',
  undo: 'Отменить',
  hint: 'Подсказка',
  resign: 'Сдаться',
  resignQuestion: 'Сдаться и закончить партию?',
  cancel: 'Отмена',
  win: 'Победа!',
  lose: 'Поражение',
  draw: 'Ничья',
  reasons: {
    win: 'У бота не осталось ходов',
    lose: 'У вас не осталось ходов',
    giveawayWin: 'Вы первым отдали все шашки',
    giveawayLose: 'Бот первым отдал все шашки',
    resign: 'Вы сдались',
    repeat: 'Позиция повторилась трижды',
    kings: '15 ходов дамками без взятий',
  },
  stats: { open: 'Статистика', title: 'Статистика', played: 'Партий', wins: 'Побед', losses: 'Поражений', draws: 'Ничьих', close: 'Закрыть' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Доска', coords: 'Координаты', coordsHint: 'Буквы и цифры по краям доски', close: 'Закрыть' },
  skins: { telegram: 'Как в Telegram', wood: 'Дерево', green: 'Турнир', marble: 'Мрамор', night: 'Ночь', candy: 'Конфета' },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  flag: svgIcon('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram', coords: true };
let setup = { level: 'medium', color: 'white', mode: 'classic' };
let selected = null;               // { from, path: [...] } — выбранная шашка и уже пройденные поля боя
let busy = false;                  // анимация или бот думает
let over = false;
let worker = null;
let requestId = 0;
let hintMove = null;
let modalActive = false;
let modalToken = 0;
const timers = new Set();

function later(fn, ms) {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      timers.delete(id);
      resolve(fn?.());
    }, ms);
    timers.add(id);
  });
}

const save = () => game && !over && api?.storage.set('current', game);
const modeOf = (g) => (g?.mode === 'giveaway' ? 'giveaway' : 'classic');

/**
 * «Впрыгивание» шашки — свойством scale, а не transform: позиция шашки задана transform'ом, и анимация
 * transform на время уводила её в левый верхний угол доски (a8).
 */
function popPiece(node, from = 0.6, duration = 360) {
  return animate(node, [{ scale: from }, { scale: 1.12, offset: 0.6 }, { scale: 1 }], { duration, easing: 'ease-out' });
}

/** Тряска шашки — свойством translate (не transform — по той же причине, иначе шашка прыгала на a8). */
function shakePiece(node, distance = 3, duration = 300) {
  if (!node) return Promise.resolve();
  const d = `${distance}px`;
  const k = `${distance * 0.6}px`;
  return animate(node, [
    { translate: '0 0' }, { translate: `-${d} 0` }, { translate: `${d} 0` }, { translate: `-${k} 0` }, { translate: `${k} 0` }, { translate: '0 0' },
  ], { duration, easing: 'ease-in-out' });
}

// ---------- доска ----------

/** Экранные координаты поля: доска повёрнута к игроку (его шашки — внизу). */
function viewPos(i) {
  const r = rowOf(i);
  const c = colOf(i);
  return game.player === WHITE ? [r, c] : [7 - r, 7 - c];
}

function setPos(node, i) {
  const [r, c] = viewPos(i);
  node.style.setProperty('--r', r);
  node.style.setProperty('--c', c);
}

function buildSquares() {
  const squares = [];
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const i = game.player === WHITE ? vr * 8 + vc : (7 - vr) * 8 + (7 - vc);
      const sq = el('div', { class: `ck-sq ${isDark(i) ? 'ck-dark' : 'ck-light'}`, 'data-sq': i });
      if (vc === 0) sq.append(el('span', { class: 'ck-coord ck-coord-rank' }, String(8 - rowOf(i))));
      if (vr === 7) sq.append(el('span', { class: 'ck-coord ck-coord-file' }, 'abcdefgh'[colOf(i)]));
      squares.push(sq);
    }
  }
  ui.squares.replaceChildren(...squares);
}

function pieceEl(i, v) {
  const node = el('div', { class: `ck-piece ${v > 0 ? 'ck-white' : 'ck-black'}${Math.abs(v) === 2 ? ' ck-king' : ''}`, 'data-sq': i });
  setPos(node, i);
  return node;
}

/** Шашки на доске — заново по позиции (без анимации). */
function renderPieces() {
  const nodes = [];
  game.board.forEach((v, i) => {
    if (v) nodes.push(pieceEl(i, v));
  });
  ui.pieces.replaceChildren(...nodes);
}

const pieceAt = (i) => ui.pieces.querySelector(`.ck-piece[data-sq="${i}"]`);

/** Подсветка: последний ход, обязанные бить, выбранная шашка, куда можно пойти, подсказка. */
function renderMarks() {
  const legal = !over && game.turn === game.player && !busy ? generateMoves(game.board, game.turn) : [];
  const capture = legal.length && legal[0].captures.length > 0;
  const last = game.lastMove;
  const lastSquares = last ? new Set([last.from, ...last.path]) : new Set();
  const cand = selected ? candidates() : [];
  const targets = new Set(cand.map((m) => m.path[selected.path.length]));
  const movable = new Set(legal.map((m) => m.from));
  for (const sq of ui.squares.children) {
    const i = Number(sq.dataset.sq);
    sq.classList.toggle('ck-last', lastSquares.has(i));
    sq.classList.toggle('ck-target', targets.has(i));
    sq.classList.toggle('ck-target-capture', targets.has(i) && capture);
    sq.classList.toggle('ck-hint', Boolean(hintMove && (hintMove.from === i || moveTo(hintMove) === i)));
  }
  for (const p of ui.pieces.children) {
    const i = Number(p.dataset.sq);
    p.classList.toggle('ck-selected', selected?.from === i);
    p.classList.toggle('ck-must', Boolean(capture && movable.has(i) && !selected));
  }
  renderInfo(legal);
}

function renderInfo(legal = null) {
  const c = count(game.board);
  const mine = game.player === WHITE ? c.wm + c.wk : c.bm + c.bk;
  const theirs = game.player === WHITE ? c.bm + c.bk : c.wm + c.wk;
  ui.taken.mine.textContent = 12 - theirs;
  ui.taken.theirs.textContent = 12 - mine;
  ui.sub.textContent = T.sub(modeOf(game), game.level, game.player);
  const botTurn = !over && game.turn !== game.player;
  ui.turn.textContent = over ? '' : botTurn ? T.botTurn : T.yourTurn;
  ui.turn.classList.toggle('ck-thinking', botTurn);
  ui.undo.disabled = busy || over || game.history.length < 2 || game.turn !== game.player;
  ui.hint.disabled = busy || over || game.turn !== game.player;
  ui.resign.disabled = over;
  void legal;
}

// ---------- ход игрока ----------

function candidates() {
  if (!selected) return [];
  return generateMoves(game.board, game.turn).filter((m) => m.from === selected.from
    && selected.path.every((x, k) => m.path[k] === x));
}

function onBoardTap(e) {
  if (busy || over || modalActive || game.turn !== game.player) return;
  const sqEl = e.target.closest('.ck-sq, .ck-piece');
  if (!sqEl) return;
  const i = Number(sqEl.dataset.sq);
  const legal = generateMoves(game.board, game.turn);
  // выбор (или перевыбор, пока бой не начат) своей шашки
  if (Math.sign(game.board[i]) === game.player && (!selected || selected.path.length === 0)) {
    if (legal.some((m) => m.from === i)) {
      selected = { from: i, path: [] };
      hintMove = null;
      api.platform.haptic.selection();
      renderMarks();
    } else if (legal.length && legal[0].captures.length) {
      toast.show(T.mustCapture);
      for (const p of ui.pieces.querySelectorAll('.ck-must')) shakePiece(p);
      api.platform.haptic.notification('warning');
    } else {
      shakePiece(pieceAt(i), 3, 250);
    }
    return;
  }
  if (!selected) return;
  const cand = candidates();
  const step = cand.filter((m) => m.path[selected.path.length] === i);
  if (!step.length) {
    if (selected.path.length === 0) {
      selected = null;
      renderMarks();
    }
    return;
  }
  selected.path.push(i);
  const done = step.find((m) => m.path.length === selected.path.length);
  const piece = pieceAt(selected.from);
  hopTo(piece, i);
  if (done) {
    commitMove(done, true);
  } else {
    // бой продолжается — следующее поле
    const partial = step[0];
    const over2 = partial.captures[selected.path.length - 1];
    pieceAt(over2)?.classList.add('ck-taken');
    api.platform.haptic.impact('light');
    renderMarks();
  }
}

function hopTo(piece, i) {
  if (!piece) return;
  piece.classList.add('ck-moving');
  setPos(piece, i);
}

// ---------- применение хода (игрок и бот) ----------

async function commitMove(m, alreadyMoved) {
  busy = true;
  selected = null;
  hintMove = null;
  const piece = pieceAt(m.from);
  const hopMs = reducedMotion() ? 0 : 200;
  if (!alreadyMoved) {
    for (let k = 0; k < m.path.length; k++) {
      hopTo(piece, m.path[k]);
      if (m.captures[k] !== undefined) pieceAt(m.captures[k])?.classList.add('ck-taken');
      await later(null, hopMs);
      if (!ui) return;
    }
  } else {
    await later(null, hopMs);
    if (!ui) return;
  }
  // побитые снимаются в конце хода (турецкий удар)
  const gone = m.captures.map((c) => pieceAt(c)).filter(Boolean);
  // scale, а не transform — позицию шашки (transform) не трогаем
  await Promise.all(gone.map((g) => animate(g, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.4 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })));
  if (!ui) return;
  const wasMan = Math.abs(game.board[m.from]) === 1;
  playMove(game, m);
  if (m.captures.length) api.platform.haptic.impact(m.captures.length > 1 ? 'heavy' : 'medium');
  else api.platform.haptic.selection();
  renderPieces();
  const moved = pieceAt(moveTo(m));
  if (wasMan && Math.abs(game.board[moveTo(m)]) === 2 && moved) popPiece(moved);
  busy = false;
  save();
  const res = result(game);
  if (res) {
    finishGame(res);
    return;
  }
  renderMarks();
  if (game.turn !== game.player) botTurn();
}

// ---------- бот ----------

/**
 * Ход бота: в воркере; если воркера нет или он не ответил вовремя (старые браузеры молча не запускают
 * модульные воркеры) — в основном потоке.
 */
function askBot(board, side, level, mode = 'classic') {
  const id = ++requestId;
  const local = () => later(() => bestMove(board, side, { level, mode }), 30);
  if (!worker) return local();
  return new Promise((resolve) => {
    let settled = false;
    const w = worker;
    const onMessage = (e) => {
      if (e.data.id !== id || settled) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      resolve(e.data.move);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, board, side, level, mode });
    later(() => {
      if (settled) return;
      settled = true;
      w.removeEventListener('message', onMessage);
      dropWorker();
      local().then(resolve);
    }, 6000);
  });
}

function dropWorker() {
  worker?.terminate();
  worker = null;
}

/** Проверка, что воркер вообще запускается: нет ответа за 1,5 с — думаем в основном потоке. */
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
    if (e.data.pong) alive = true;
  });
  w.addEventListener('error', () => {
    if (worker === w) dropWorker();
  });
  w.postMessage({ ping: true });
  later(() => {
    if (!alive && worker === w) dropWorker();
  }, 1500);
}

async function botTurn() {
  busy = true;
  renderMarks();
  const started = Date.now();
  const snapshot = game;
  const move = await askBot(game.board, game.turn, game.level, modeOf(game));
  if (!ui || game !== snapshot || over) return;
  // чтобы бот не «ходил мгновенно» — хотя бы полсекунды на раздумье
  const wait = Math.max(0, 500 - (Date.now() - started));
  if (wait) await later(null, reducedMotion() ? 0 : wait);
  if (!ui || game !== snapshot) return;
  // ход из воркера — копия: берём такой же из списка законных
  const legal = generateMoves(game.board, game.turn).find((m) => sameMove(m, move)) ?? move;
  busy = false;
  await commitMove(legal, false);
}

// ---------- конец партии ----------

function finishGame(res, resigned = false) {
  over = true;
  busy = false;
  selected = null;
  renderMarks();
  const mode = modeOf(game);
  const lv = stats[mode][game.level];
  lv.played += 1;
  let outcome;
  let title;
  let reason;
  if (resigned) {
    outcome = 'lose';
    title = T.lose;
    reason = T.reasons.resign;
    lv.losses += 1;
  } else if (res.draw) {
    outcome = 'draw';
    title = T.draw;
    reason = T.reasons[res.draw];
    lv.draws += 1;
  } else if (res.winner === game.player) {
    outcome = 'win';
    title = T.win;
    reason = mode === 'giveaway' ? T.reasons.giveawayWin : T.reasons.win;
    lv.wins += 1;
  } else {
    outcome = 'lose';
    title = T.lose;
    reason = mode === 'giveaway' ? T.reasons.giveawayLose : T.reasons.lose;
    lv.losses += 1;
  }
  api.storage.set('stats', stats);
  api.storage.remove('current');
  api.platform.haptic.notification(outcome === 'win' ? 'success' : outcome === 'draw' ? 'warning' : 'error');
  if (outcome === 'win') for (const p of ui.pieces.querySelectorAll(game.player === WHITE ? '.ck-white' : '.ck-black')) popPiece(p, 0.8, 400);
  later(() => api?.finish({
    outcome, title, locale: 'ru', variant: `${mode}-${game.level}`, message: `${T.modes[mode]} · ${T.levels[game.level]} · ${reason}`,
  }), reducedMotion() ? 0 : 900);
}

// ---------- инструменты ----------

function onUndo() {
  if (busy || over || game.turn !== game.player || game.history.length < 2) return;
  undoMove(game);
  undoMove(game);
  selected = null;
  hintMove = null;
  renderPieces();
  renderMarks();
  save();
  api.platform.haptic.impact('light');
}

async function onHint() {
  if (busy || over || game.turn !== game.player) return;
  busy = true;
  renderInfo();
  const snapshot = game;
  const move = await askBot(game.board, game.turn, 'medium', modeOf(game));
  busy = false;
  if (!ui || game !== snapshot || over) return;
  hintMove = move;
  selected = null;
  renderMarks();
  for (const sq of ui.squares.querySelectorAll('.ck-hint')) pop(sq, { from: 0.8, duration: 300 });
}

function onResign() {
  if (over) return;
  openModal(card(T.resign,
    el('p', { class: 'ck-note' }, T.resignQuestion),
    el('div', { class: 'ck-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); finishGame({}, true); } }, T.resign),
    ),
  ));
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
  return el('div', { class: 'ck-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ck-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ck-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Окно новой партии: сложность и цвет. */
function showNewGame(closable = true) {
  const levelButtons = LEVEL_IDS.map((id) => el('button', {
    class: 'ck-option', role: 'radio', 'aria-checked': String(setup.level === id),
    onclick: () => {
      setup.level = id;
      levelButtons.forEach((b, k) => b.setAttribute('aria-checked', String(LEVEL_IDS[k] === id)));
    },
  }, el('b', {}, T.levels[id]), el('span', {}, T.levelHint[id])));
  const modeButtons = MODES.map((id) => el('button', {
    class: 'ck-option', role: 'radio', 'aria-checked': String(setup.mode === id),
    onclick: () => {
      setup.mode = id;
      modeButtons.forEach((b, k) => b.setAttribute('aria-checked', String(MODES[k] === id)));
    },
  }, el('b', {}, T.modes[id]), el('span', {}, T.modeHint[id])));
  const colorIds = ['white', 'black', 'random'];
  const colorButtons = colorIds.map((id) => el('button', {
    class: 'ck-color', role: 'radio', 'aria-checked': String(setup.color === id),
    onclick: () => {
      setup.color = id;
      colorButtons.forEach((b, k) => b.setAttribute('aria-checked', String(colorIds[k] === id)));
    },
  }, el('span', { class: `ck-color-dot ck-color-${id}` }), T.colors[id]));
  const content = el('div', { class: 'ck-card', role: 'dialog', 'aria-label': T.newGame },
    el('div', { class: 'ck-card-head' },
      el('h2', {}, T.newGame),
      closable ? el('button', { class: 'ck-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕') : null,
    ),
    el('h3', { class: 'ck-section' }, T.mode),
    el('div', { class: 'ck-levels ck-modes', role: 'radiogroup' }, modeButtons),
    el('h3', { class: 'ck-section' }, T.level),
    el('div', { class: 'ck-levels', role: 'radiogroup' }, levelButtons),
    el('h3', { class: 'ck-section' }, T.color),
    el('div', { class: 'ck-colors', role: 'radiogroup' }, colorButtons),
    el('button', { class: 'btn ck-play', onclick: () => { closeModal(); startGame(); } }, T.play),
  );
  openModal(content);
}

function startGame() {
  api.storage.set('setup', setup);
  const player = setup.color === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : setup.color === 'white' ? WHITE : BLACK;
  if (game && !over && game.history.length >= 2) {
    // брошенная партия — поражение
    stats[modeOf(game)][game.level].played += 1;
    stats[modeOf(game)][game.level].losses += 1;
    api.storage.set('stats', stats);
  }
  requestId++;
  game = newGame(player, setup.level, setup.mode);
  over = false;
  busy = false;
  selected = null;
  hintMove = null;
  buildSquares();
  renderPieces();
  renderMarks();
  intro();
  save();
  if (game.turn !== game.player) botTurn();
}

/** Шашки расставляются волной. */
function intro() {
  [...ui.pieces.children].forEach((p) => {
    const [r] = [Number(p.style.getPropertyValue('--r'))];
    animate(p, [{ opacity: 0, translate: '0 -30%' }, { opacity: 1, translate: '0 0' }], { duration: 300, delay: r * 40, easing: 'ease-out', fill: 'backwards' });
  });
}

function showStats() {
  const table = (mode) => el('table', { class: 'ck-stats' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, T.stats.played), el('th', {}, T.stats.wins), el('th', {}, T.stats.losses), el('th', {}, T.stats.draws))),
    el('tbody', {}, LEVEL_IDS.map((id) => {
      const s = stats[mode][id];
      return el('tr', {}, el('td', {}, T.levels[id]), el('td', {}, s.played), el('td', {}, s.wins), el('td', {}, s.losses), el('td', {}, s.draws));
    })));
  openModal(card(T.stats.title, ...MODES.flatMap((mode) => [el('h3', { class: 'ck-section' }, T.modes[mode]), table(mode)])));
}

function showSettings() {
  const coordsSwitch = el('input', {
    type: 'checkbox', class: 'ck-switch', role: 'switch', checked: settings.coords,
    onchange: (e) => {
      settings.coords = e.target.checked;
      ui.board.classList.toggle('ck-no-coords', !settings.coords);
      api.storage.set('settings', settings);
    },
  });
  const buttons = SKINS.map((id) => el('button', {
    class: 'ck-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'ck-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title,
    el('label', { class: 'ck-setting' },
      el('div', {}, el('div', { class: 'ck-setting-title' }, T.settings.coords), el('div', { class: 'ck-note' }, T.settings.coordsHint)),
      coordsSwitch),
    el('h3', { class: 'ck-section' }, T.settings.skin),
    el('div', { class: 'ck-skins', role: 'radiogroup' }, buttons),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'ck-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function toolButton(icon, label, onclick) {
  const button = el('button', { class: 'ck-tool', onclick }, el('span', { class: 'ck-tool-icon' }), el('span', {}, label));
  button.firstChild.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    onUndo();
  }
}

export default {
  id: 'checkers',
  title: 'Шашки',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSetup] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('setup'),
    ]);
    if (!api) return;
    stats = migrateStats(savedStats);
    settings = {
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
      coords: typeof savedSettings?.coords === 'boolean' ? savedSettings.coords : true,
    };
    setup = {
      level: LEVEL_IDS.includes(savedSetup?.level) ? savedSetup.level : 'medium',
      color: ['white', 'black', 'random'].includes(savedSetup?.color) ? savedSetup.color : 'white',
      mode: MODES.includes(savedSetup?.mode) ? savedSetup.mode : 'classic',
    };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'ck-sub' }),
      turn: el('span', { class: 'ck-turn' }),
      taken: { mine: el('b', {}), theirs: el('b', {}) },
      squares: el('div', { class: 'ck-squares' }),
      pieces: el('div', { class: 'ck-pieces' }),
      modal: el('div', { class: 'ck-modal', hidden: true }),
    };
    ui.board = el('div', { class: `ck-board${settings.coords ? '' : ' ck-no-coords'}` }, ui.squares, ui.pieces);
    ui.board.addEventListener('click', onBoardTap);
    ui.undo = toolButton(ICONS.undo, T.undo, onUndo);
    ui.hint = toolButton(ICONS.hint, T.hint, onHint);
    ui.resign = toolButton(ICONS.flag, T.resign, onResign);

    root = el('div', { class: 'ck' },
      el('div', { class: 'ck-header' },
        el('div', {}, el('div', { class: 'ck-title' }, T.title), ui.sub),
        el('div', { class: 'ck-actions' },
          iconButton(ICONS.restart, T.newGame, () => showNewGame(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'ck-info' },
        el('span', { class: 'ck-count' }, el('i', { class: 'ck-mini ck-mini-them' }), '×', ui.taken.mine),
        ui.turn,
        el('span', { class: 'ck-count' }, el('i', { class: 'ck-mini ck-mini-me' }), '×', ui.taken.theirs),
      ),
      el('div', { class: 'ck-wrap' }, ui.board),
      el('div', { class: 'ck-tools' }, ui.undo, ui.hint, ui.resign),
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    startWorker();

    if (isValidState(saved)) {
      game = saved;
      over = false;
      buildSquares();
      renderPieces();
      renderMarks();
      if (game.turn !== game.player) botTurn();
    } else {
      game = newGame(WHITE, setup.level);
      over = false;
      buildSquares();
      renderPieces();
      renderMarks();
      showNewGame(false);
    }
  },

  getState() {
    if (!game || over || !game.history.length) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    save();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    worker?.terminate();
    worker = null;
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = game = selected = hintMove = null;
    busy = over = modalActive = false;
    requestId++;
  },
};
