// Судоку по мотивам sudoku.com: 4 сложности, ошибки (3 — поражение), очки, таймер с паузой,
// заметки, отмена, стирание и продвинутые подсказки с объяснением приёма.
// Сетки — из проверенного банка (puzzles.json), каждая партия — случайное перемешивание сетки.
// Партия и статистика (по сложностям) — в api.storage игры: 'current', 'stats', 'lastDifficulty'.

import { el } from '../../shared/dom.js';
import { formatDuration } from '../../shared/format.js';
import { animate, showLayer, hideLayer, flipSize, pop, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { PEERS, ROW_OF, COL_OF, UNITS, UNITS_OF, parseGrid, bit } from './grid.js';
import { countSolutions } from './solver.js';
import { transformPair } from './generator.js';
import { buildHint } from './hints.js';
import { TEXT } from './i18n.js';
import {
  DIFFICULTIES, MAX_MISTAKES,
  newGame, placeDigit, toggleNote, erase, undo, applyHintDigit, applyHintErase,
  isSolved, isLost, isGiven, isWrong, isLocked, digitCounts, conflicts, isValidState,
  emptyStats, recordGame, isValidStats, normalizeSettings, defaultSettings, SKINS,
} from './logic.js';

const t = TEXT.ru;

const svg = (body, fill = false) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  erase: svg('<path d="M20 20H8.5L3.8 15.3a1.5 1.5 0 0 1 0-2.1L13.4 3.6a1.5 1.5 0 0 1 2.1 0l4.9 4.9a1.5 1.5 0 0 1 0 2.1L11 20"/><path d="m7.5 9.5 7 7"/>'),
  notes: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  hint: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', true),
  play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z"/>', true),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  stats: svg('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
};

// Банк сеток — кэш данных, переживает destroy().
let bankPromise = null;
function loadBank() {
  bankPromise ??= fetch(new URL('./puzzles.json', import.meta.url))
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      bankPromise = null;
      throw err;
    });
  return bankPromise;
}

let api = null;
let root = null;
let host = null;          // контейнер от оболочки (data-game="sudoku") — на нём data-skin
let ui = null;
let game = null;          // состояние партии (logic.js) или null, пока не выбрана сложность
let stats = {};           // сложность → статистика
let settings = defaultSettings();
let selected = -1;
let notesMode = false;
let paused = false;
let finished = false;
let hint = null;          // открытая подсказка (hints.js)
let runningSince = null;  // performance.now() запуска таймера; null — стоит
let toast = null;
let modalActive = false;  // окно открыто (во время анимации закрытия уже false)
let modalToken = 0;
let hintToken = 0;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// ---------- время и сохранение ----------

function elapsed() {
  return game.elapsedMs + (runningSince === null ? 0 : performance.now() - runningSince);
}

function stopClock() {
  if (game && runningSince !== null) game.elapsedMs = elapsed();
  runningSince = null;
}

function startClock() {
  if (game && !finished && runningSince === null) runningSince = performance.now();
}

function save() {
  if (!game || finished) return;
  if (runningSince !== null) {
    game.elapsedMs = elapsed();
    runningSince = performance.now();
  }
  api.storage.set('current', game);
}

function modalOpen() {
  return modalActive;
}

function canPlay() {
  return Boolean(game && !finished && !paused && !hint && !modalOpen());
}

// ---------- отрисовка ----------

function renderInfo() {
  ui.sub.textContent = game ? t.difficulty[game.difficulty] : t.newGame;
  ui.info.difficulty.textContent = game ? t.difficulty[game.difficulty] : '—';
  ui.info.mistakes.textContent = !game ? '—'
    : settings.mistakesLimit ? `${game.mistakes}/${MAX_MISTAKES}` : String(game.mistakes);
  ui.info.score.textContent = game ? game.score : '—';
  renderTime();
  ui.pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
  ui.pauseButton.setAttribute('aria-label', paused ? t.resume : t.pause);
  ui.pauseButton.disabled = !game || finished;
}

function renderTime() {
  ui.info.time.textContent = game ? formatDuration(elapsed()) : '—';
}

/** fx — анимация одной клетки после отрисовки: { cell, kind: 'pop' | 'shake' | 'note', digit? } */
function renderBoard(fx = null) {
  const selValue = selected >= 0 && game ? game.values[selected] : 0;
  const peers = selected >= 0 && !hint ? new Set(PEERS[selected]) : new Set();
  const conflict = game ? conflicts(game) : new Set();
  const h = hint ? hint.pages[hint.page].show : null;
  ui.board.classList.toggle('sd-hinting', Boolean(h));

  ui.cells.forEach((cell, i) => {
    const value = game ? game.values[i] : 0;
    const cls = ['sd-cell', ...cell.fixedClasses];
    if (game) {
      if (isGiven(game, i)) cls.push('sd-given');
      else if (isWrong(game, i)) cls.push('sd-wrong');
      else if (value) cls.push('sd-user');
    }
    if (h) {
      if (h.area.has(i)) cls.push('sd-h-area');
      if (h.elim.has(i)) cls.push('sd-h-elim');
      if (h.key.has(i)) cls.push('sd-h-key');
      if (h.target === i) cls.push('sd-h-target');
      if (h.wrong === i) cls.push('sd-h-wrong');
    } else {
      if (peers.has(i)) cls.push('sd-peer');
      if (selValue && value === selValue && i !== selected) cls.push('sd-same');
      if (i === selected) cls.push('sd-selected');
    }
    if (conflict.has(i) && !h) cls.push('sd-conflict');   // одинаковые цифры в группе — обе красным фоном
    cell.className = cls.join(' ');

    if (h && !value && (h.reveal && h.target === i)) {
      // последняя страница подсказки: цифра ответа уже видна в клетке
      cell.replaceChildren(el('span', { class: 'sd-val sd-h-reveal' }, h.reveal));
    } else if (h && !value && (h.cands.has(i) || h.elim.has(i))) {
      // варианты, о которых говорит подсказка: нужные — цветом, вычеркнутые — красным крестом
      const on = h.cands.get(i) ?? [];
      const off = h.elim.get(i) ?? [];
      if (on.length + off.length === 1) {
        // одна цифра — крупно по центру клетки, мелкая заметка на телефоне почти не видна
        cell.replaceChildren(el('span', { class: `sd-h-one ${off.length ? 'sd-h-x' : 'sd-h-cand'}` }, off[0] ?? on[0]));
        return;
      }
      const notes = el('div', { class: 'sd-notes' });
      for (let d = 1; d <= 9; d++) {
        notes.append(el('span', { class: off.includes(d) ? 'sd-h-x' : on.includes(d) ? 'sd-h-cand' : '' },
          off.includes(d) || on.includes(d) ? d : ''));
      }
      cell.replaceChildren(notes);
    } else if (value) {
      cell.replaceChildren(el('span', { class: 'sd-val' }, value));
    } else if (game && game.notes[i]) {
      const notes = el('div', { class: 'sd-notes' });
      for (let d = 1; d <= 9; d++) {
        const has = game.notes[i] & bit(d);
        notes.append(el('span', { class: has && d === selValue ? 'sd-note-on' : '' }, has ? d : ''));
      }
      cell.replaceChildren(notes);
    } else {
      cell.replaceChildren();
    }
  });

  renderHintLayer(h);

  if (fx) {
    const cell = ui.cells[fx.cell];
    if (fx.kind === 'pop') pop(cell.firstChild);
    else if (fx.kind === 'shake') shake(cell, { distance: 4 });
    else if (fx.kind === 'note') pop(cell.querySelectorAll('.sd-notes span')[fx.digit - 1], { from: 0.3, duration: 180 });
  }
}

function renderControls() {
  const counts = game ? digitCounts(game) : Array(10).fill(0);
  ui.padButtons.forEach((button, index) => {
    button.classList.toggle('sd-digit-done', counts[index + 1] >= 9);
  });
  ui.pad.classList.toggle('sd-pad-notes', notesMode);
  ui.notesBadge.textContent = notesMode ? t.notesOn : t.notesOff;
  ui.notesBadge.classList.toggle('sd-badge-on', notesMode);
  ui.hintBadge.textContent = game ? game.hintsLeft : '';
  ui.hintBadge.hidden = !game;
  ui.tools.hint.disabled = !game || game.hintsLeft === 0;
}

function renderAll() {
  renderInfo();
  renderBoard();
  renderControls();
}

function showToast(text) {
  toast.show(text);
}

// ---------- эффекты ----------

function cssVar(name) {
  return getComputedStyle(host).getPropertyValue(name).trim();
}

/** Волна подсветки по клеткам — от клетки origin (задержка по расстоянию), как на sudoku.com. */
function wave(cells, origin, { step = 40, duration = 520 } = {}) {
  if (reducedMotion()) return;
  const flash = cssVar('--sd-flash');
  for (const i of cells) {
    const delay = (Math.abs(ROW_OF[i] - ROW_OF[origin]) + Math.abs(COL_OF[i] - COL_OF[origin])) * step;
    animate(ui.cells[i], [{ backgroundColor: flash, offset: 0.35 }], { duration, delay, easing: 'ease-out' });
    const content = ui.cells[i].firstChild;
    if (content) animate(content, [{ transform: 'scale(1.18)', offset: 0.35 }], { duration, delay, easing: 'ease-out' });
  }
}

/** Группы клетки, которые теперь заполнены целиком и верно. */
function completedUnits(i) {
  return UNITS_OF[i].filter((u) => UNITS[u].every((c) => game.values[c] === game.solution[c]));
}

function unitWave(i) {
  const done = completedUnits(i);
  if (done.length) wave(new Set(done.flatMap((u) => UNITS[u])), i);
}

/** Счётчик «подпрыгивает» (и при желании вспыхивает цветом). */
function bump(node, color = null) {
  animate(node, [
    { transform: 'scale(1)' },
    { transform: 'scale(1.3)', offset: 0.3, ...(color && { color }) },
    { transform: 'scale(1)' },
  ], { duration: 420, easing: 'ease-out' });
}

// ---------- действия ----------

function select(i) {
  if (!canPlay()) return;
  selected = i;
  api.platform.haptic.selection();
  renderBoard();
}

function inputDigit(d) {
  if (!canPlay() || selected < 0) return;
  if (notesMode) {
    if (toggleNote(game, selected, d)) {
      api.platform.haptic.selection();
      save();
      renderBoard(game.notes[selected] & bit(d) ? { cell: selected, kind: 'note', digit: d } : null);
    }
    return;
  }
  const result = placeDigit(game, selected, d);
  if (result === 'ignored') return;
  if (result === 'wrong') api.platform.haptic.notification('error');
  else api.platform.haptic.impact('light');
  save();
  renderInfo();
  renderControls();
  renderBoard({ cell: selected, kind: result === 'wrong' ? 'shake' : 'pop' });
  if (result === 'wrong') bump(ui.info.mistakes, cssVar('--sd-danger'));
  else {
    bump(ui.info.score);
    if (!isSolved(game)) unitWave(selected);
  }
  // Поражение — только после неверного хода: если лимит включили, когда ошибок уже 3+,
  // партия не должна закончиться от верной цифры.
  if (result === 'wrong' && isLost(game, settings.mistakesLimit)) finishGame(false);
  else if (isSolved(game)) finishGame(true);
}

function onErase() {
  if (!canPlay() || selected < 0) return;
  if (erase(game, selected)) {
    save();
    renderAll();
  }
}

function onUndo() {
  if (!canPlay()) return;
  const cell = undo(game);
  if (cell < 0) {
    showToast(t.nothingToUndo);
    return;
  }
  selected = cell;
  save();
  renderInfo();
  renderControls();
  renderBoard({ cell, kind: 'pop' });
}

function onNotes() {
  if (!canPlay()) return;
  notesMode = !notesMode;
  renderControls();
}

function finishGame(won) {
  stopClock();
  finished = true;
  const { difficulty, mistakes, score } = game;
  const time = game.elapsedMs;
  const origin = selected >= 0 ? selected : 40;
  stats[difficulty] = recordGame(stats[difficulty], won, time);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  selected = -1;
  renderAll();

  // Сначала анимация (победа — волна по всей доске, поражение — тряска), потом экран результата.
  if (won) wave(ui.cells.map((_, i) => i), origin, { step: 45, duration: 600 });
  else shake(ui.board, { distance: 8, duration: 450 });
  later(() => report(won, { difficulty, mistakes, score, time }), reducedMotion() ? 0 : won ? 1300 : 650);
}

function report(won, { difficulty, mistakes, score, time }) {
  const common = { variant: difficulty, locale: 'ru', durationMs: time };
  if (won) {
    api.platform.haptic.notification('success');
    api.finish({
      ...common,
      outcome: 'win',
      score,
      message: settings.mistakesLimit
        ? t.won(t.difficulty[difficulty], formatDuration(time), mistakes, MAX_MISTAKES)
        : t.wonNoLimit(t.difficulty[difficulty], formatDuration(time), mistakes),
    });
  } else {
    api.platform.haptic.notification('error');
    api.finish({ ...common, outcome: 'lose', message: t.lost(MAX_MISTAKES) });
  }
}

// ---------- пауза ----------

/** Окно паузы без анимации: при новой партии и открытии сохранённой оно обязано совпадать с `paused`. */
function showPauseCover(show) {
  ui.pauseCover.getAnimations().forEach((a) => a.cancel());
  ui.pauseCover.hidden = !show;
}

function setPaused(value) {
  if (!game || finished || paused === value) return;
  paused = value;
  if (paused) {
    stopClock();
    showPauseCover(true);
    animate(ui.pauseCover, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  } else {
    startClock();
    animate(ui.pauseCover, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
      .then(() => {
        if (!ui) return;
        if (!paused) ui.pauseCover.hidden = true;
        ui.pauseCover.getAnimations().forEach((a) => a.cancel());
      });
  }
  save();
  renderInfo();
  renderControls();
}

function onVisibility() {
  if (document.visibilityState === 'hidden') setPaused(true);
}

// ---------- подсказки ----------

function onHint() {
  if (!canPlay()) return;
  if (game.hintsLeft <= 0) {
    showToast(t.noHints);
    return;
  }
  const found = buildHint(game.values, game.solution);
  if (!found) return;
  game.hintsLeft--;
  hint = { ...found, page: 0 };
  selected = found.action.cell;
  save();

  renderHintPanel();
  hintToken++;
  ui.hintPanel.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  flipSize(ui.board, () => {
    ui.hintPanel.hidden = false;
    ui.controls.classList.add('sd-hint-open');
  });
  animate(ui.hintPanel.firstChild, [
    { opacity: 0, transform: 'translateY(24px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 280, easing: EASE_OUT });
  renderAll();
}

/**
 * Панель подсказки: заголовок, текст страницы с цветными ссылками на подсветку доски, внизу —
 * ‹ точки › (на последней странице вместо › — «Готово» / «Стереть»).
 */
function renderHintPanel() {
  const { pages, page } = hint;
  const current = pages[page];
  const last = page === pages.length - 1;
  const text = current.text.map((seg) => (typeof seg === 'string' ? seg : el('span', { class: `sd-mark sd-mark-${seg.m}` }, seg.t)));
  const nav = (dir) => () => setHintPage(page + dir);
  ui.hintPanel.replaceChildren(el('div', { class: pages.length > 1 ? 'sd-hint-card' : 'sd-hint-card sd-hint-single', role: 'dialog', 'aria-label': t.tools.hint },
    el('div', { class: 'sd-hint-head' },
      el('div', { class: 'sd-hint-title' }, current.title),
      el('button', { class: 'sd-icon-btn sd-hint-close', 'aria-label': t.hint.close, title: t.hint.close, onclick: closeHint }, '✕'),
    ),
    el('p', { class: 'sd-hint-text' }, text),
    el('div', { class: 'sd-hint-nav' },
      el('button', { class: 'sd-hint-arrow', 'aria-label': t.hint.back, disabled: page === 0, onclick: nav(-1) }, '‹'),
      el('div', { class: 'sd-hint-dots' }, pages.length > 1 && pages.map((_, n) => el('span', { class: n === page ? 'on' : '' }))),
      last
        ? el('button', { class: 'btn sd-hint-done', onclick: applyHint }, hint.action.kind === 'erase' ? t.hint.erase : t.hint.done)
        : el('button', { class: 'sd-hint-arrow', 'aria-label': t.hint.next, onclick: nav(1) }, '›'),
    ),
  ));
}

function setHintPage(n) {
  if (!hint || n < 0 || n >= hint.pages.length || n === hint.page) return;
  hint.page = n;
  renderHintPanel();
  renderBoard();
  api.platform.haptic.selection();
  animate(ui.hintPanel.querySelector('.sd-hint-text'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT });
  const reveal = ui.board.querySelector('.sd-h-reveal');
  if (reveal) pop(reveal);
}

/** Рамки вокруг групп (строка, столбец, блок), о которых говорит страница, — поверх доски. */
function renderHintLayer(h) {
  const frames = [];
  for (const u of h?.units ?? []) {
    const cells = UNITS[u].map((i) => ui.cells[i]);
    const left = Math.min(...cells.map((c) => c.offsetLeft));
    const top = Math.min(...cells.map((c) => c.offsetTop));
    const right = Math.max(...cells.map((c) => c.offsetLeft + c.offsetWidth));
    const bottom = Math.max(...cells.map((c) => c.offsetTop + c.offsetHeight));
    frames.push(el('div', { class: 'sd-h-frame', style: `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px` }));
  }
  ui.hintLayer.replaceChildren(...frames);
  frames.forEach((f) => animate(f, [{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OUT }));
}

/** Панель уезжает вниз, затем доска плавно возвращается к полному размеру. */
function closeHint() {
  hint = null;
  renderAll();
  const token = ++hintToken;
  animate(ui.hintPanel.firstChild, [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateY(24px)' },
  ], { duration: 160, easing: 'ease-in', fill: 'forwards' }).then(() => {
    if (!ui || token !== hintToken) return;
    flipSize(ui.board, () => {
      ui.hintPanel.hidden = true;
      ui.controls.classList.remove('sd-hint-open');
    });
  });
}

function applyHint() {
  const { action } = hint;
  if (action.kind === 'erase') applyHintErase(game, action.cell);
  else applyHintDigit(game, action.cell, action.digit);
  selected = action.cell;
  api.platform.haptic.impact('medium');
  closeHint();
  save();
  renderBoard({ cell: action.cell, kind: 'pop' });
  if (isSolved(game)) finishGame(true);
  else if (action.kind === 'place') unitWave(action.cell);
}

// ---------- окна: новая игра и статистика ----------

/** Открыть окно; если окно уже открыто — только заменить содержимое (без повторной анимации). */
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

async function showPicker(cancellable) {
  const last = await api.storage.get('lastDifficulty');
  if (!api) return;
  const wasPaused = paused;
  if (cancellable) setPaused(true);

  const close = () => {
    closeModal();
    if (!wasPaused) setPaused(false);
  };
  openModal(el('div', { class: 'sd-card', role: 'dialog', 'aria-label': t.newGame },
    el('div', { class: 'sd-card-head' },
      el('h2', {}, t.newGame),
      cancellable && el('button', { class: 'sd-icon-btn', 'aria-label': t.cancel, title: t.cancel, onclick: close }, '✕'),
    ),
    cancellable && el('p', { class: 'hint sd-warning' }, t.newGameWarning),
    el('div', { class: 'sd-picker' }, DIFFICULTIES.map((d) => el('button', {
      class: d === last ? 'btn' : 'btn btn-secondary',
      onclick: () => startNew(d),
    }, t.difficulty[d]))),
  ));
  ui.modal.dataset.cancellable = cancellable ? '1' : '';
  ui.modal.onEscape = cancellable ? close : null;
}

async function startNew(difficulty) {
  closeModal();
  // «+» ставит партию на паузу на время выбора сложности — окно паузы надо убрать вместе с флагом,
  // иначе оно оставалось поверх новой партии, а «Продолжить» ничего не делал (баг, видео владельца)
  paused = false;
  showPauseCover(false);
  ui.sub.textContent = t.loading;
  let bank;
  try {
    bank = await loadBank();
  } catch (err) {
    console.error(err);
    showToast(t.loadFailed);
    showPicker(false);
    return;
  }
  if (!api) return;

  const list = bank[difficulty];
  const base = parseGrid(list[Math.floor(Math.random() * list.length)]);
  const { solution } = countSolutions(base, 1);
  const pair = transformPair(base, solution);
  game = newGame(difficulty, pair.puzzle, pair.solution);
  finished = false;
  notesMode = false;
  hint = null;
  selected = game.values.findIndex((v) => !v);
  runningSince = null;
  startClock();
  api.storage.set('lastDifficulty', difficulty);
  save();
  renderAll();
  if (!reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, [
      { opacity: 0, transform: 'scale(0.85)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 260, delay: (ROW_OF[i] + COL_OF[i]) * 18, easing: EASE_OUT, fill: 'backwards' }));
  }
}

function showStats(initial = game?.difficulty ?? 'easy') {
  if (hint) return;
  const wasPaused = paused;
  setPaused(true);
  const close = () => {
    closeModal();
    if (!wasPaused) setPaused(false);
  };
  const time = (ms) => (ms === null ? '—' : formatDuration(ms));
  const item = (value, label) => el('div', { class: 'sd-stat' },
    el('div', { class: 'sd-stat-value' }, value),
    el('div', { class: 'sd-stat-label' }, label),
  );

  const render = (difficulty) => {
    const s = stats[difficulty];
    const winRate = s.played ? Math.round((s.wins / s.played) * 100) : 0;
    const grid = el('div', { class: 'sd-stats-grid' },
      item(s.played, t.stats.played),
      item(s.wins, t.stats.wins),
      item(winRate, t.stats.winRate),
      item(time(s.bestMs), t.stats.best),
      item(time(s.wins ? s.totalWinMs / s.wins : null), t.stats.average),
      item(s.streak, t.stats.streak),
      item(s.maxStreak, t.stats.maxStreak),
    );
    openModal(el('div', { class: 'sd-card', role: 'dialog', 'aria-label': t.stats.title },
      el('div', { class: 'sd-card-head' },
        el('h2', {}, t.stats.title),
        el('button', { class: 'sd-icon-btn', 'aria-label': t.stats.close, title: t.stats.close, onclick: close }, '✕'),
      ),
      el('div', { class: 'sd-tabs', role: 'tablist' }, DIFFICULTIES.map((d) => el('button', {
        class: 'sd-tab',
        role: 'tab',
        'aria-selected': String(d === difficulty),
        onclick: () => {
          if (d === difficulty) return;
          render(d);
          animate(ui.modal.querySelector('.sd-stats-grid'), [{ opacity: 0.2 }, { opacity: 1 }], { duration: 200 });
        },
      }, t.difficulty[d]))),
      grid,
    ));
  };

  render(initial);
  ui.modal.onEscape = close;
}

// ---------- настройки ----------

function applySkin() {
  host.dataset.skin = settings.skin;
}

function saveSettings() {
  api.storage.set('settings', settings);
}

function showSettings() {
  if (hint) return;
  const wasPaused = paused;
  setPaused(true);
  const close = () => {
    closeModal();
    if (!wasPaused) setPaused(false);
  };

  const limitSwitch = el('input', {
    type: 'checkbox',
    class: 'sd-switch',
    role: 'switch',
    checked: settings.mistakesLimit,
    onchange: (e) => {
      settings.mistakesLimit = e.target.checked;
      saveSettings();
      renderInfo();
    },
  });

  const skinButtons = SKINS.map((id) => el('button', {
    class: 'sd-skin',
    role: 'radio',
    'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      saveSettings();
      applySkin();
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'sd-swatch', 'data-skin': id }), t.skins[id]));

  openModal(el('div', { class: 'sd-card', role: 'dialog', 'aria-label': t.settings.title },
    el('div', { class: 'sd-card-head' },
      el('h2', {}, t.settings.title),
      el('button', { class: 'sd-icon-btn', 'aria-label': t.settings.close, title: t.settings.close, onclick: close }, '✕'),
    ),
    el('label', { class: 'sd-setting' },
      el('div', {},
        el('div', { class: 'sd-setting-title' }, t.settings.mistakesLimit),
        el('div', { class: 'sd-setting-desc' }, t.settings.mistakesLimitDesc(MAX_MISTAKES)),
      ),
      limitSwitch,
    ),
    el('h3', { class: 'sd-section-title' }, t.settings.appearance),
    el('div', { class: 'sd-skins', role: 'radiogroup', 'aria-label': t.settings.appearance }, skinButtons),
  ));
  ui.modal.onEscape = close;
}

// ---------- клавиатура ----------

function onKeydown(e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я') {
      e.preventDefault();
      onUndo();
    }
    return;
  }
  if (e.altKey) return;
  if (modalOpen()) {
    if (e.key === 'Escape' && ui.modal.onEscape) ui.modal.onEscape();
    return;
  }
  if (hint) {
    if (e.key === 'Escape') closeHint();
    else if (e.key === 'ArrowLeft') setHintPage(hint.page - 1);
    else if (e.key === 'ArrowRight') setHintPage(hint.page + 1);
    else if (e.key === 'Enter') {
      if (hint.page < hint.pages.length - 1) setHintPage(hint.page + 1);
      else applyHint();
    }
    e.preventDefault();
    return;
  }
  if (paused) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setPaused(false);
    }
    return;
  }

  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (/^[1-9]$/.test(e.key)) {
    e.preventDefault();
    inputDigit(Number(e.key));
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    onErase();
  } else if (e.key in moves && game) {
    e.preventDefault();
    const from = selected < 0 ? 0 : selected;
    const row = ROW_OF[from];
    const col = COL_OF[from];
    const next = e.key === 'ArrowUp' || e.key === 'ArrowDown'
      ? ((row + (moves[e.key] > 0 ? 1 : 8)) % 9) * 9 + col
      : row * 9 + ((col + (moves[e.key] > 0 ? 1 : 8)) % 9);
    select(next);
  } else if (['n', 'N', 'т', 'Т'].includes(e.key)) {
    onNotes();
  }
}

// ---------- сборка ----------

function toolButton(key, icon, onclick, badge) {
  const button = el('button', { class: 'sd-tool', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'sd-tool-icon' }),
    el('span', { class: 'sd-tool-label' }, t.tools[key]),
    badge,
  );
  button.firstChild.innerHTML = icon;
  return button;
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'sd-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'sudoku',
  title: 'Судоку',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    settings = normalizeSettings(savedSettings);
    applySkin();

    stats = {};
    for (const d of DIFFICULTIES) stats[d] = isValidStats(savedStats?.[d]) ? savedStats[d] : emptyStats();

    const infoValue = () => el('div', { class: 'sd-info-value' });
    ui = {
      title: el('div', { class: 'sd-title' }, t.title),
      sub: el('div', { class: 'sd-sub' }),
      info: { difficulty: infoValue(), mistakes: infoValue(), score: infoValue(), time: infoValue() },
      pauseButton: el('button', { class: 'sd-icon-btn sd-pause-btn', onclick: () => setPaused(!paused) }),
      board: el('div', { class: 'sd-board', role: 'grid' }),
      hintLayer: el('div', { class: 'sd-hint-layer', 'aria-hidden': 'true' }),
      cells: [],
      pauseCover: el('div', { class: 'sd-pause-cover', hidden: true },
        el('button', { class: 'btn sd-resume', onclick: () => (paused ? setPaused(false) : showPauseCover(false)) }, t.resume)),
      notesBadge: el('span', { class: 'sd-badge sd-badge-pill' }),
      hintBadge: el('span', { class: 'sd-badge sd-badge-count' }),
      pad: el('div', { class: 'sd-pad' }),
      padButtons: [],
      hintPanel: el('div', { class: 'sd-hint', hidden: true }),
      modal: el('div', { class: 'sd-modal', hidden: true }),
    };
    ui.tools = {
      undo: toolButton('undo', ICONS.undo, onUndo),
      erase: toolButton('erase', ICONS.erase, onErase),
      notes: toolButton('notes', ICONS.notes, onNotes, ui.notesBadge),
      hint: toolButton('hint', ICONS.hint, onHint, ui.hintBadge),
    };

    for (let i = 0; i < 81; i++) {
      const r = ROW_OF[i];
      const c = COL_OF[i];
      const cell = el('div', { class: 'sd-cell', role: 'gridcell', 'data-i': i });
      cell.fixedClasses = [
        c % 3 === 2 && c < 8 && 'sd-c-thick',
        r % 3 === 2 && r < 8 && 'sd-r-thick',
        c === 8 && 'sd-c-last',
        r === 8 && 'sd-r-last',
      ].filter(Boolean);
      ui.cells.push(cell);
    }
    ui.board.append(...ui.cells, ui.hintLayer);
    ui.board.addEventListener('click', (e) => {
      const cell = e.target.closest('.sd-cell');
      if (cell) select(Number(cell.dataset.i));
    });

    for (let d = 1; d <= 9; d++) {
      const button = el('button', {
        class: 'sd-digit',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => inputDigit(d),
      }, d);
      ui.padButtons.push(button);
    }
    ui.pad.append(...ui.padButtons);

    ui.controls = el('div', { class: 'sd-controls' },
      el('div', { class: 'sd-tools' }, Object.values(ui.tools)),
      ui.pad,
      ui.hintPanel,
    );

    const infoItem = (label, value) => el('div', { class: 'sd-info-item' }, el('div', { class: 'sd-info-label' }, label), value);
    root = el('div', { class: 'sd' },
      el('div', { class: 'sd-header' },
        el('div', { class: 'sd-heading' }, ui.title, ui.sub),
        el('div', { class: 'sd-actions' },
          iconButton(ICONS.plus, t.newGame, () => { if (!hint) showPicker(Boolean(game)); }),
          iconButton(ICONS.stats, t.stats.open, () => showStats()),
          iconButton(ICONS.gear, t.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'sd-info' },
        infoItem(t.info.difficulty, ui.info.difficulty),
        infoItem(t.info.mistakes, ui.info.mistakes),
        infoItem(t.info.score, ui.info.score),
        infoItem(t.info.time, ui.info.time),
        ui.pauseButton,
      ),
      el('div', { class: 'sd-board-wrap' }, ui.board, ui.pauseCover),
      ui.controls,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    const tick = setInterval(() => {
      if (runningSince !== null) renderTime();
    }, 500);
    timers.add(tick);

    if (isValidState(savedGame)) {
      game = savedGame;
      selected = -1;
      paused = false;
      showPauseCover(false);
      startClock();
      renderAll();
    } else {
      renderAll();
      showPicker(false);
    }
  },

  getState() {
    if (!game || finished) return null;
    save();
    return { difficulty: game.difficulty };
  },

  destroy() {
    if (game && !finished) {
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
    root?.remove();
    toast?.dispose();
    api = root = host = ui = game = hint = toast = runningSince = null;
    modalActive = false;
    stats = {};
    settings = defaultSettings();
    selected = -1;
    notesMode = paused = finished = false;
  },
};
