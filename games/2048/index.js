// 2048 по образцу play2048.co: свайп (или стрелки/WASD) сдвигает плитки, одинаковые сливаются.
// Анимация хода: плитки скользят (SLIDE_MS), потом слитые «впрыгивают», новая плитка появляется.
// Отмена хода — UNDO_PER_GAME раз за партию. Партия, статистика (по размеру поля) и настройки — в api.storage.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, pop, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import {
  SIZES, DEFAULT_SIZE, WIN_VALUE, UNDO_PER_GAME, canMove, maxTile, newGame, play, undo, isValidState,
  emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'dark', 'ocean', 'neon', 'candy'];
const SLIDE_MS = 110;
const SWIPE_MIN = 24;           // px — короче не считается свайпом
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', ц: 'up', ы: 'down', ф: 'left', в: 'right',
};
const T = {
  title: '2048',
  sub: (n) => `Поле ${n}×${n}`,
  tile: 'Клетка',            // очков в игре нет — показываем наибольшую плитку
  best: 'Рекорд',
  undo: 'Отменить ход',
  noUndo: 'Отмены закончились',
  nothingToUndo: 'Нечего отменять',
  hint: 'Сдвигай плитки свайпом. Одинаковые сливаются — собери 2048!',
  noMoves: 'Ходов больше нет',
  win: { title: 'Есть 2048!', text: 'Ты собрал плитку 2048. Можно играть дальше — до 4096 и выше.', keep: 'Играть дальше', finish: 'Закончить' },
  resultTitle: 'Игра окончена',
  result: (tile, moves) => `Лучшая плитка: ${tile} · ходов: ${moves}`,
  newGame: 'Новая игра',
  restartQuestion: 'Начать заново? Текущая партия будет потеряна.',
  restart: 'Начать заново',
  cancel: 'Отмена',
  stats: { open: 'Статистика', title: 'Статистика', played: 'Сыграно', bestTile: 'Лучшая плитка', wins: 'Собрано 2048', close: 'Закрыть' },
  settings: { open: 'Настройки', title: 'Настройки', size: 'Размер поля', skin: 'Оформление', nextGame: 'Новый размер — со следующей партии.' },
  skins: { telegram: 'По умолчанию', classic: 'Классика', dark: 'Графит', ocean: 'Океан', neon: 'Неон', candy: 'Конфета' },
};

const svg = (body, fill = false) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  stats: svg('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;
let stats = {};
let settings = { size: DEFAULT_SIZE, skin: 'telegram' };
let finished = false;
let sliding = null;             // таймер завершения анимации хода
let swipe = null;
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

function save() {
  if (game && !finished) api.storage.set('current', game);
}

// ---------- отрисовка ----------

function tileClass(value) {
  return value > WIN_VALUE ? 'tt-super' : `tt-${value}`;
}

function tileEl(value, index) {
  const n = game.size;
  return el('div', {
    class: `tt-tile ${tileClass(value)}`,
    'data-len': String(value).length,
    style: `--x: ${index % n}; --y: ${Math.floor(index / n)};`,
  }, el('span', {}, value));
}

/** Плитки заново по полю. effects: { merged: Set, spawned } — какие впрыгивают/появляются. */
function renderTiles(effects = {}) {
  ui.tiles.replaceChildren(...game.grid.flatMap((v, i) => {
    if (!v) return [];
    const node = tileEl(v, i);
    if (effects.merged?.has(i)) {
      node.classList.add('tt-merged');
      animate(node.firstChild, [
        { transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.45 }, { transform: 'scale(1)' },
      ], { duration: 200, easing: 'ease-out' });
    }
    if (effects.spawned === i) {
      animate(node.firstChild, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 200, delay: 60, easing: EASE_OUT, fill: 'backwards' });
    }
    return [node];
  }));
}

function buildBoard() {
  const n = game.size;
  ui.board.style.setProperty('--n', n);
  ui.cells.replaceChildren(...Array.from({ length: n * n }, () => el('div', { class: 'tt-cell' })));
  renderTiles();
}

function renderInfo() {
  const top = maxTile(game.grid);
  ui.sub.textContent = T.sub(game.size);
  ui.score.textContent = top || '—';
  ui.best.textContent = Math.max(stats[game.size].bestTile, top) || '—';
  ui.undoBadge.textContent = game.undoLeft;
  ui.undoButton.disabled = finished || game.undoLeft <= 0;
}

// ---------- ход ----------

/** Анимация предыдущего хода ещё идёт — досрочно довести её до конца (быстрые свайпы не теряются). */
function finishSlide() {
  if (!sliding) return;
  clearTimeout(sliding.timer);
  timers.delete(sliding.timer);
  const done = sliding;
  sliding = null;
  done.finish();
}

function doMove(dir) {
  if (!game || finished || modalActive) return;
  finishSlide();
  const before = game.grid;
  const result = play(game, dir);
  if (!result.moved) {
    shake(ui.board, { distance: 3, duration: 200 });
    return;
  }
  api.platform.haptic.impact(result.merges.length ? 'medium' : 'light');

  // 1) скольжение: существующие плитки едут к новым местам
  const byFrom = new Map(result.moves.map((m) => [m.from, m.to]));
  const n = game.size;
  [...ui.tiles.children].forEach((node) => {
    const x = Number(node.style.getPropertyValue('--x'));
    const y = Number(node.style.getPropertyValue('--y'));
    const from = y * n + x;
    if (byFrom.has(from) && before[from]) {
      const to = byFrom.get(from);
      node.style.setProperty('--x', to % n);
      node.style.setProperty('--y', Math.floor(to / n));
    }
  });

  // 2) после скольжения — поле заново: слитые впрыгивают, новая плитка появляется
  const finish = () => {
    if (!ui) return;
    renderTiles({ merged: new Set(result.merges.map((m) => m.at)), spawned: result.spawned?.at });
    renderInfo();
    if (result.merges.length) pop(ui.score, { from: 0.85, duration: 200 });
    save();
    if (result.won && !game.keepPlaying) later(showWin, 350);
    else if (!canMove(game.grid, n)) gameOver();
  };
  if (reducedMotion()) finish();
  else sliding = { finish, timer: later(() => { sliding = null; finish(); }, SLIDE_MS) };
}

function onUndo() {
  if (!game || finished || modalActive) return;
  finishSlide();
  if (game.undoLeft <= 0) {
    toast.show(T.noUndo);
    return;
  }
  if (!undo(game)) {
    toast.show(T.nothingToUndo);
    return;
  }
  api.platform.haptic.selection();
  renderTiles();
  renderInfo();
  save();
  animate(ui.tiles, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
}

// ---------- свайп и клавиатура ----------

function onPointerDown(e) {
  if (swipe || finished || modalActive) return;
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
}

function onPointerUp(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
  else doMove(dy > 0 ? 'down' : 'up');
}

function onKeydown(e) {
  if (modalActive) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    onUndo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
  if (dir) {
    e.preventDefault();
    doMove(dir);
  }
}

// ---------- победа и конец ----------

function showWin() {
  api.platform.haptic.notification('success');
  const tile2048 = [...ui.tiles.children].find((node) => node.classList.contains('tt-2048'));
  if (tile2048) animate(tile2048, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], { duration: 700, iterations: 2 });
  openModal(el('div', { class: 'tt-card tt-win', role: 'dialog', 'aria-label': T.win.title },
    el('div', { class: 'tt-win-tile' }, '2048'),
    el('h2', {}, T.win.title),
    el('p', { class: 'tt-note' }, T.win.text),
    el('div', { class: 'tt-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); endGame(); } }, T.win.finish),
      el('button', { class: 'btn', onclick: () => { game.keepPlaying = true; save(); closeModal(); } }, T.win.keep),
    ),
  ));
}

function gameOver() {
  toast.show(T.noMoves, 1400);
  api.platform.haptic.notification('error');
  shake(ui.board, { distance: 6, duration: 400 });
  ui.board.classList.add('tt-over');
  endGame(1300);
}

function endGame(delay = 0) {
  if (finished) return;
  finished = true;
  api.storage.remove('current');
  stats[game.size] = recordGame(stats[game.size], game);
  api.storage.set('stats', stats);
  renderInfo();
  const { size, won, moves } = game;
  const best = maxTile(game.grid);
  later(() => api.finish({
    outcome: won ? 'win' : 'lose',
    title: won ? T.win.title : T.resultTitle,
    score: best,                                   // рекорд — самая большая плитка, а не очки
    variant: String(size),
    locale: 'ru',
    message: T.result(best, moves),
  }), reducedMotion() ? 0 : delay);
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
  return el('div', { class: 'tt-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'tt-card-head' },
      el('h2', {}, title),
      el('button', { class: 'tt-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats(initial = game.size) {
  const render = (size) => {
    const s = stats[size];
    const item = (value, label) => el('div', { class: 'tt-stat' },
      el('div', { class: 'tt-stat-value' }, value), el('div', { class: 'tt-stat-label' }, label));
    openModal(card(T.stats.title,
      el('div', { class: 'tt-tabs', role: 'tablist' }, SIZES.map((n) => el('button', {
        class: 'tt-tab', role: 'tab', 'aria-selected': String(n === size), onclick: () => render(n),
      }, `${n}×${n}`))),
      el('div', { class: 'tt-stats-grid' },
        item(s.played, T.stats.played), item(s.bestTile || '—', T.stats.bestTile),
        item(s.wins, T.stats.wins),
      ),
    ));
  };
  render(initial);
}

function showSettings() {
  const note = el('p', { class: 'tt-note', hidden: true }, T.settings.nextGame);
  const sizeButtons = SIZES.map((n) => el('button', {
    class: 'tt-size', role: 'radio', 'aria-checked': String(n === settings.size),
    onclick: () => {
      settings.size = n;
      api.storage.set('settings', settings);
      sizeButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SIZES[k] === n)));
      if (!finished && !game.moves) startGame();
      else note.hidden = n === game.size;
    },
  }, `${n}×${n}`));
  const skinButtons = SKINS.map((id) => el('button', {
    class: 'tt-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'tt-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title,
    el('h3', { class: 'tt-section' }, T.settings.size),
    el('div', { class: 'tt-sizes', role: 'radiogroup' }, sizeButtons),
    note,
    el('h3', { class: 'tt-section' }, T.settings.skin),
    el('div', { class: 'tt-skins', role: 'radiogroup' }, skinButtons),
  ));
}

function askRestart() {
  if (finished || !game.moves) {
    startGame();
    return;
  }
  openModal(card(T.newGame,
    el('p', { class: 'tt-note' }, T.restartQuestion),
    el('div', { class: 'tt-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); startGame(); } }, T.restart),
    ),
  ));
}

function startGame(saved = null) {
  finishSlide();
  game = saved ?? newGame(settings.size);
  finished = false;
  ui.board.classList.remove('tt-over');
  buildBoard();
  renderInfo();
  save();
  if (!saved && !reducedMotion()) {
    [...ui.tiles.children].forEach((node, k) => animate(node.firstChild, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
      { duration: 240, delay: 120 + k * 80, easing: EASE_OUT, fill: 'backwards' }));
  }
}

function iconButton(icon, label, onclick, extra = null) {
  const button = el('button', { class: 'tt-icon-btn', 'aria-label': label, title: label, onclick }, extra);
  button.insertAdjacentHTML('afterbegin', icon);
  return button;
}

export default {
  id: '2048',
  title: '2048',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    stats = {};
    for (const n of SIZES) stats[n] = isValidStats(savedStats?.[n]) ? savedStats[n] : emptyStats();
    settings = {
      size: SIZES.includes(savedSettings?.size) ? savedSettings.size : DEFAULT_SIZE,
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
    };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'tt-sub' }),
      score: el('div', { class: 'tt-box-value' }),
      best: el('div', { class: 'tt-box-value' }),
      undoBadge: el('span', { class: 'tt-badge' }),
      board: el('div', { class: 'tt-board' }),
      cells: el('div', { class: 'tt-cells' }),
      tiles: el('div', { class: 'tt-tiles' }),
      modal: el('div', { class: 'tt-modal', hidden: true }),
    };
    ui.scoreBox = el('div', { class: 'tt-box' }, el('div', { class: 'tt-box-label' }, T.tile), ui.score);
    ui.undoButton = iconButton(ICONS.undo, T.undo, onUndo, ui.undoBadge);
    ui.undoButton.classList.add('tt-undo');
    ui.board.append(ui.cells, ui.tiles);
    const wrap = el('div', { class: 'tt-board-wrap' }, ui.board);
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', () => { swipe = null; });

    root = el('div', { class: 'tt' },
      el('div', { class: 'tt-header' },
        el('div', {}, el('div', { class: 'tt-title' }, T.title), ui.sub),
        el('div', { class: 'tt-actions' },
          iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, () => showStats()),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'tt-bar' },
        ui.scoreBox,
        el('div', { class: 'tt-box' }, el('div', { class: 'tt-box-label' }, T.best), ui.best),
        ui.undoButton,
      ),
      el('p', { class: 'tt-hint' }, T.hint),
      wrap,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);

    const saved = isValidState(savedGame) && canMove(savedGame.grid, savedGame.size) ? savedGame : null;
    startGame(saved);
  },

  getState() {
    if (!game || finished || !game.moves) return null;
    save();
    return { size: game.size };
  },

  destroy() {
    finishSlide();
    save();
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = game = sliding = swipe = null;
    finished = modalActive = false;
  },
};
