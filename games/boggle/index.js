// Boggle: сетка букв (4×4 … 10×10), за отведённое время ищешь слова, проводя пальцем по соседним клеткам
// (включая диагонали). После конца — разбор: все слова сетки, тап по слову показывает его путь.
// Партия, статистика (по размеру поля) и настройки (размер, скин) — в api.storage игры.

import { el } from '../../shared/dom.js';
import { formatDuration } from '../../shared/format.js';
import { animate, showLayer, hideLayer, pop, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import {
  SIZES, DEFAULT_SIZE, TIME_BY_SIZE, createDictionary, generateGrid, solve, findPath, isAdjacent,
  pathWord, wordScore, checkWord, addWord, newGame, isValidState, emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'night', 'paper', 'neon', 'mint'];
const T = {
  title: 'Boggle',
  sub: (size) => `Поле ${size}×${size}`,
  info: { time: 'Время', words: 'Слова', score: 'Очки' },
  loading: 'Загрузка словаря…',
  loadFailed: 'Не удалось загрузить словарь',
  hint: 'Проведи пальцем по буквам',
  repeat: 'Уже найдено',
  unknown: 'Нет в словаре',
  timeUp: 'Время вышло!',
  reviewHint: 'Нажми на слово — покажу, где оно',
  finish: 'Итоги',
  pause: 'Пауза',
  resume: 'Продолжить',
  endNow: 'Закончить партию',
  newGame: 'Новая игра',
  restartQuestion: 'Начать заново? Найденные слова пропадут.',
  restart: 'Начать заново',
  cancel: 'Отмена',
  resultTitle: 'Время вышло',
  result: (found, total, longest) => `Найдено ${found} из ${total}` + (longest ? ` · самое длинное: ${longest.toUpperCase()}` : ''),
  stats: {
    open: 'Статистика', title: 'Статистика', played: 'Сыграно', best: 'Рекорд', words: 'Слов найдено',
    longest: 'Самое длинное', close: 'Закрыть',
  },
  settings: {
    open: 'Настройки', title: 'Настройки', size: 'Размер поля', skin: 'Оформление', close: 'Закрыть',
    nextGame: 'Новый размер — со следующей партии.', minutes: (s) => `${Math.round(TIME_BY_SIZE[s] / 60)} мин`,
  },
  skins: { telegram: 'Как в Telegram', classic: 'Кубики', night: 'Ночь', paper: 'Бумага', neon: 'Неон', mint: 'Мята' },
};

const svg = (body, fill = false) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svg('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', true),
};

// Засчитывать клетку, только если палец ближе к её центру, чем HIT × размер клетки —
// иначе при движении по диагонали цеплялись бы соседние клетки.
const HIT = 0.4;

// Словарь — кэш данных, переживает destroy().
let dictPromise = null;
function loadDict() {
  dictPromise ??= fetch(new URL('./words/ru.json', import.meta.url))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ words, common }) => createDictionary(words, common))
    .catch((err) => {
      dictPromise = null;
      throw err;
    });
  return dictPromise;
}

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let dict = null;
let game = null;
let allWords = [];            // все слова текущей сетки (для счётчика и разбора)
let stats = {};
let settings = { size: DEFAULT_SIZE, skin: 'telegram' };
let path = [];                // текущее выделение
let pointerId = null;
let paused = false;
let review = false;           // время вышло — разбор
let runningSince = null;
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

// ---------- время ----------

function remaining() {
  if (!game) return 0;
  return Math.max(0, game.remainingMs - (runningSince === null ? 0 : performance.now() - runningSince));
}

function stopClock() {
  if (game && runningSince !== null) game.remainingMs = remaining();
  runningSince = null;
}

function startClock() {
  if (game && !review && runningSince === null) runningSince = performance.now();
}

function save() {
  if (!game || review) return;
  if (runningSince !== null) {
    game.remainingMs = remaining();
    runningSince = performance.now();
  }
  api.storage.set('current', game);
}

function tick() {
  if (!game || review || runningSince === null) return;
  const left = remaining();
  ui.time.textContent = formatDuration(Math.ceil(left / 1000) * 1000);
  ui.time.classList.toggle('bo-time-low', left <= 15000);
  if (left <= 0) timeUp();
}

// ---------- отрисовка ----------

function renderInfo() {
  ui.sub.textContent = T.sub(game?.size ?? settings.size);
  ui.words.textContent = game ? `${game.found.length}/${allWords.length}` : '—';
  ui.score.textContent = game ? game.score : '—';
  ui.time.textContent = game ? formatDuration(Math.ceil(remaining() / 1000) * 1000) : '—';
  ui.pauseButton.disabled = !game || review;
}

function buildBoard() {
  const { size, grid } = game;
  ui.board.style.setProperty('--n', size);
  ui.cells = grid.map((letter, i) => el('div', { class: 'bo-cell', 'data-i': i }, el('span', { class: 'bo-letter' }, letter)));
  ui.board.replaceChildren(...ui.cells, ui.line);
  if (!reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 260, delay: (Math.floor(i / size) + (i % size)) * 22, easing: EASE_OUT, fill: 'backwards' }));
  }
}

/** Подсветка пути: клетки и линия через их центры. kind — '' | 'good' | 'bad' | 'warn' | 'show'. */
function renderPath(cells = path, kind = '') {
  const set = new Set(cells);
  ui.cells.forEach((cell, i) => {
    cell.classList.toggle('bo-on', set.has(i));
    for (const k of ['good', 'bad', 'warn', 'show']) cell.classList.toggle(`bo-${k}`, k === kind && set.has(i));
  });
  const n = game.size;
  const pts = cells.map((i) => `${((i % n) + 0.5) * (100 / n)},${(Math.floor(i / n) + 0.5) * (100 / n)}`).join(' ');
  ui.polyline.setAttribute('points', pts);
  ui.line.dataset.kind = kind;
  ui.current.textContent = cells.length ? pathWord(game.grid, cells).toUpperCase() : (review ? T.reviewHint : T.hint);
  ui.current.classList.toggle('bo-current-empty', !cells.length);
  ui.current.dataset.kind = kind;
}

function chip(word, cls = '') {
  return el('button', { class: `bo-chip ${cls}`, 'data-word': word, onclick: () => showWord(word) },
    word.toUpperCase(), el('span', { class: 'bo-chip-pts' }, wordScore(word)));
}

function renderFound({ fresh = null } = {}) {
  if (review) {
    // Найденные — первыми; среди пропущенных сначала частые слова (их игрок наверняка знает), потом редкие.
    const found = new Set(game.found);
    const rank = (w) => (found.has(w) ? 2 : dict.common.has(w) ? 1 : 0);
    const sorted = [...allWords].sort((a, b) => rank(b) - rank(a) || b.length - a.length);
    ui.list.replaceChildren(...sorted.map((w) => chip(w, found.has(w) ? 'bo-chip-found' : 'bo-chip-missed')));
    return;
  }
  ui.list.replaceChildren(...[...game.found].reverse().map((w) => chip(w, 'bo-chip-found')));
  if (fresh) pop(ui.list.firstChild);
}

// ---------- ввод пальцем ----------

/** Клетка под точкой — только если точка достаточно близко к центру клетки. */
function cellAt(clientX, clientY) {
  const rect = ui.board.getBoundingClientRect();
  const n = game.size;
  const cs = rect.width / n;
  const col = Math.floor((clientX - rect.left) / cs);
  const row = Math.floor((clientY - rect.top) / cs);
  if (row < 0 || row >= n || col < 0 || col >= n) return -1;
  const dx = clientX - (rect.left + (col + 0.5) * cs);
  const dy = clientY - (rect.top + (row + 0.5) * cs);
  return Math.hypot(dx, dy) <= cs * HIT ? row * n + col : -1;
}

function canInput() {
  return Boolean(game && dict && !paused && !review && !modalActive);
}

function onPointerDown(e) {
  if (!canInput() || pointerId !== null) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell < 0) return;
  e.preventDefault();
  pointerId = e.pointerId;
  try {
    ui.board.setPointerCapture(e.pointerId);
  } catch {
    // без захвата движения всё равно придут на поле
  }
  path = [cell];
  api.platform.haptic.selection();
  renderPath();
  pop(ui.cells[cell].firstChild, { from: 0.8, duration: 160 });
}

function onPointerMove(e) {
  if (e.pointerId !== pointerId) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell < 0 || cell === path.at(-1)) return;
  if (cell === path.at(-2)) {                  // вернулся назад — убрать последнюю букву
    path.pop();
    renderPath();
    return;
  }
  if (path.includes(cell) || !isAdjacent(path.at(-1), cell, game.size)) return;
  path.push(cell);
  api.platform.haptic.selection();
  renderPath();
  pop(ui.cells[cell].firstChild, { from: 0.8, duration: 160 });
}

function onPointerUp(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  const cells = path;
  path = [];
  if (cells.length) submit(cells);
}

function submit(cells) {
  const word = pathWord(game.grid, cells);
  const verdict = checkWord(game, word, dict);
  if (verdict === 'short') {
    renderPath([]);
    return;
  }
  if (verdict === 'ok') {
    const points = addWord(game, word);
    api.platform.haptic.notification('success');
    renderPath(cells, 'good');
    floatPoints(`+${points}`, cells);
    save();
    renderInfo();
    renderFound({ fresh: word });
    pop(ui.score, { from: 0.8 });
  } else {
    api.platform.haptic.notification(verdict === 'repeat' ? 'warning' : 'error');
    renderPath(cells, verdict === 'repeat' ? 'warn' : 'bad');
    if (verdict === 'unknown') shake(ui.current);
    toast.show(verdict === 'repeat' ? T.repeat : T.unknown, 1100);
    if (verdict === 'repeat') flashChip(word);
  }
  // подсветка результата держится немного и гаснет
  later(() => {
    if (ui && !path.length && !review) renderPath([]);
  }, 450);
}

function floatPoints(text, cells) {
  const last = ui.cells[cells.at(-1)].getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const node = el('div', {
    class: 'bo-float',
    style: `left: ${last.left + last.width / 2 - rootRect.left}px; top: ${last.top - rootRect.top}px;`,
  }, text);
  root.append(node);
  later(() => node.remove(), 1000);
}

function flashChip(word) {
  const node = ui.list.querySelector(`[data-word="${word}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  pop(node, { from: 0.8 });
}

/** Разбор: показать путь слова на сетке — буквы загораются по очереди. */
function showWord(word) {
  if (!review) return;
  const cells = findPath(game.grid, game.size, word);
  if (!cells) return;
  renderPath(cells, 'show');
  cells.forEach((i, k) => animate(ui.cells[i], [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }],
    { duration: 260, delay: k * 90, easing: 'ease-out' }));
}

// ---------- пауза, конец ----------

function setPaused(value) {
  if (!game || review || paused === value) return;
  paused = value;
  if (paused) {
    stopClock();
    ui.pauseCover.getAnimations().forEach((a) => a.cancel());
    ui.pauseCover.hidden = false;
    animate(ui.pauseCover, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  } else {
    startClock();
    animate(ui.pauseCover, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).then(() => {
      if (!ui) return;
      if (!paused) ui.pauseCover.hidden = true;
      ui.pauseCover.getAnimations().forEach((a) => a.cancel());
    });
  }
  save();
}

function onVisibility() {
  if (document.visibilityState === 'hidden') setPaused(true);
}

function timeUp() {
  if (review) return;
  paused = false;
  ui.pauseCover.hidden = true;
  stopClock();
  game.remainingMs = 0;
  review = true;
  pointerId = null;
  path = [];
  api.storage.remove('current');
  stats[game.size] = recordGame(stats[game.size], game);
  api.storage.set('stats', stats);
  api.platform.haptic.notification('warning');

  ui.time.textContent = formatDuration(0);
  ui.time.classList.remove('bo-time-low');
  toast.show(T.timeUp, 1500);
  shake(ui.board, { distance: 5 });
  renderInfo();
  renderPath([]);
  renderFound();
  ui.finishBar.hidden = false;
  animate(ui.finishBar, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE_OUT });
}

function report() {
  const longest = game.found.reduce((a, w) => (w.length > a.length ? w : a), '');
  api.finish({
    outcome: 'quit',
    title: T.resultTitle,
    score: game.score,
    variant: String(game.size),
    locale: 'ru',
    message: T.result(game.found.length, allWords.length, longest),
  });
}

// ---------- новая партия ----------

async function startGame(saved = null) {
  ui.current.textContent = T.loading;
  try {
    dict = await loadDict();
  } catch (err) {
    console.error(err);
    toast.show(T.loadFailed, 2500);
    return;
  }
  if (!api) return;
  if (saved) {
    game = saved;
    allWords = [...solve(game.grid, game.size, dict)];
  } else {
    const { grid, words } = generateGrid(settings.size, dict);
    game = newGame(settings.size, grid, words.length);
    allWords = words;
  }
  review = false;
  paused = false;
  ui.finishBar.hidden = true;
  ui.pauseCover.hidden = true;
  buildBoard();
  renderPath([]);
  renderFound();
  renderInfo();
  save();
  if (saved) setPaused(true);                   // вернулся к партии — сначала пауза, время не утекло
  else startClock();
}

function askRestart() {
  if (!game || review || !game.found.length) {
    stopClock();
    startGame();
    return;
  }
  const wasPaused = paused;
  setPaused(true);
  openModal(card(T.newGame, () => { if (!wasPaused) setPaused(false); },
    el('p', { class: 'bo-note' }, T.restartQuestion),
    el('div', { class: 'bo-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); if (!wasPaused) setPaused(false); } }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); stopClock(); startGame(); } }, T.restart),
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

function card(title, onClose, ...children) {
  const close = () => {
    closeModal();
    onClose?.();
  };
  ui.modal.onEscape = close;
  return el('div', { class: 'bo-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bo-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bo-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: close }, '✕'),
    ),
    ...children,
  );
}

function withPause(fn) {
  const wasPaused = paused;
  setPaused(true);
  fn(() => { if (!wasPaused) setPaused(false); });
}

function showStats(initial = game?.size ?? settings.size) {
  withPause((resume) => {
    const render = (size) => {
      const s = stats[size];
      const item = (value, label) => el('div', { class: 'bo-stat' },
        el('div', { class: 'bo-stat-value' }, value), el('div', { class: 'bo-stat-label' }, label));
      openModal(card(T.stats.title, resume,
        el('div', { class: 'bo-tabs', role: 'tablist' }, SIZES.map((n) => el('button', {
          class: 'bo-tab', role: 'tab', 'aria-selected': String(n === size), onclick: () => render(n),
        }, `${n}×${n}`))),
        el('div', { class: 'bo-stats-grid' },
          item(s.played, T.stats.played),
          item(s.best, T.stats.best),
          item(s.words, T.stats.words),
          item(s.longest ? s.longest.toUpperCase() : '—', T.stats.longest),
        ),
      ));
    };
    render(initial);
  });
}

function showSettings() {
  withPause((resume) => {
    const note = el('p', { class: 'bo-note', hidden: true }, T.settings.nextGame);
    const sizeButtons = SIZES.map((n) => el('button', {
      class: 'bo-size', role: 'radio', 'aria-checked': String(n === settings.size),
      onclick: () => {
        settings.size = n;
        api.storage.set('settings', settings);
        sizeButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SIZES[k] === n)));
        // Партия ещё не начата по-настоящему (ни одного слова) — сразу новое поле, иначе — со следующей.
        if (game && !review && !game.found.length) {
          stopClock();
          startGame().then(() => setPaused(true));
        } else {
          note.hidden = n === game?.size;
        }
      },
    }, el('b', {}, `${n}×${n}`), el('span', {}, T.settings.minutes(n))));
    const skinButtons = SKINS.map((id) => el('button', {
      class: 'bo-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
      onclick: () => {
        settings.skin = id;
        host.dataset.skin = id;
        api.storage.set('settings', settings);
        skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      },
    }, el('span', { class: 'bo-swatch', 'data-skin': id }), T.skins[id]));

    openModal(card(T.settings.title, resume,
      el('h3', { class: 'bo-section' }, T.settings.size),
      el('div', { class: 'bo-sizes', role: 'radiogroup' }, sizeButtons),
      note,
      el('h3', { class: 'bo-section' }, T.settings.skin),
      el('div', { class: 'bo-skins', role: 'radiogroup' }, skinButtons),
    ));
  });
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) ui.modal.onEscape?.();
}

function iconButton(icon, label, onclick, cls = '') {
  const button = el('button', { class: `bo-icon-btn ${cls}`, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'boggle',
  title: 'Boggle',

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

    const svgNs = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(svgNs, 'svg');
    line.setAttribute('viewBox', '0 0 100 100');
    line.setAttribute('preserveAspectRatio', 'none');
    line.classList.add('bo-line');
    const polyline = document.createElementNS(svgNs, 'polyline');
    line.append(polyline);

    ui = {
      sub: el('div', { class: 'bo-sub' }),
      time: el('div', { class: 'bo-info-value' }),
      words: el('div', { class: 'bo-info-value' }),
      score: el('div', { class: 'bo-info-value' }),
      current: el('div', { class: 'bo-current bo-current-empty' }),
      board: el('div', { class: 'bo-board', onpointerdown: onPointerDown }),
      line,
      polyline,
      cells: [],
      list: el('div', { class: 'bo-list' }),
      pauseCover: el('div', { class: 'bo-pause', hidden: true },
        el('button', { class: 'btn', onclick: () => setPaused(false) }, T.resume),
        el('button', { class: 'btn btn-secondary', onclick: () => timeUp() }, T.endNow)),
      finishBar: el('div', { class: 'bo-finish', hidden: true }, el('button', { class: 'btn', onclick: report }, T.finish)),
      modal: el('div', { class: 'bo-modal', hidden: true }),
    };
    ui.pauseButton = iconButton(ICONS.pause, T.pause, () => setPaused(true), 'bo-pause-btn');
    ui.board.addEventListener('pointermove', onPointerMove);
    ui.board.addEventListener('pointerup', onPointerUp);
    ui.board.addEventListener('pointercancel', onPointerUp);

    const infoItem = (label, value) => el('div', { class: 'bo-info-item' }, el('div', { class: 'bo-info-label' }, label), value);
    root = el('div', { class: 'bo' },
      el('div', { class: 'bo-header' },
        el('div', {}, el('div', { class: 'bo-title' }, T.title), ui.sub),
        el('div', { class: 'bo-actions' },
          iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, () => showStats()),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bo-info' },
        infoItem(T.info.time, ui.time), infoItem(T.info.words, ui.words), infoItem(T.info.score, ui.score), ui.pauseButton),
      ui.current,
      el('div', { class: 'bo-board-wrap' }, ui.board, ui.pauseCover),
      ui.list,
      ui.finishBar,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    const tickId = setInterval(tick, 250);
    timers.add(tickId);
    renderInfo();

    await startGame(isValidState(savedGame) && savedGame.remainingMs > 0 ? savedGame : null);
  },

  getState() {
    if (!game || review || !game.found.length) return null;
    save();
    return { size: game.size };
  },

  destroy() {
    if (game && !review) {
      stopClock();
      api?.storage.set('current', game);
    }
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = game = runningSince = null;
    pointerId = null;
    path = [];
    allWords = [];
    paused = review = modalActive = false;
  },
};
