// Судоку-киллер по мотивам sudoku.com Killer: поле разбито на пунктирные группы с суммой в углу — цифры группы
// складываются в эту сумму и не повторяются, а строки, столбцы и блоки — как в судоку. 4 сложности, ошибки
// (3 — поражение), очки, таймер с паузой, заметки, отмена, подсказки с объяснением приёма (сочетания суммы,
// правило 45…), автозаполнение и сочетания выбранной группы под доской.
// Сетки — из проверенного банка (puzzles.json), каждая партия — поворот/отражение сетки и «зеркало цифр».
// Партия и статистика (по сложностям) — в api.storage игры: 'current', 'stats', 'lastDifficulty', 'settings', 'sound'.

import { el } from '../../shared/dom.js';
import { formatDuration } from '../../shared/format.js';
import { animate, showLayer, hideLayer, flipSize, pop, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { PEERS, ROW_OF, COL_OF, UNITS, UNITS_OF, bit, digitsOf } from './grid.js';
import { decodePuzzle, cagesFromMap, cageMapText } from './cages.js';
import { transformGrids } from './generator.js';
import { buildHint } from './hints.js';
import { cageOutline } from './outline.js';
import { TEXT } from './i18n.js';
import {
  DIFFICULTIES, MAX_MISTAKES,
  newGame, placeDigit, toggleNote, erase, undo, applyHintDigit, applyHintErase,
  isSolved, isLost, isGiven, isWrong, digitCounts, conflicts, isValidState, layoutOf, cageInfo, cageCombos,
  emptyStats, recordGame, isValidStats, normalizeSettings, defaultSettings, SKINS,
  AUTOFILL_MODES, autofillPlan, applyAutofill,
} from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const t = TEXT.ru;
const SVG_NS = 'http://www.w3.org/2000/svg';

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
  soundOn: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
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
let host = null;          // контейнер от оболочки (data-game="killer-sudoku") — на нём data-skin
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
let soundOn = true;
let autofilling = false;   // идёт автозаполнение — ввод на это время закрыт
let resizer = null;        // ResizeObserver доски — пунктир групп перерисовывается под размер
let drawnFor = null;       // для какой раскладки и какого размера уже нарисован пунктир
const timers = new Set();
// звук — один AudioContext на всю жизнь страницы, заводится при первом звуке (из нажатия)
const audio = createAudio(createSounds);

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// ---------- звук ----------

function sfx(name, opts) {
  if (!soundOn) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  ui.soundBtn.setAttribute('aria-label', soundOn ? t.soundOn : t.soundOff);
  ui.soundBtn.title = soundOn ? t.soundOn : t.soundOff;
  ui.soundBtn.classList.toggle('ks-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  pop(ui.soundBtn, { from: 0.8, duration: 220 });
  sfx('click');
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

function canPlay() {
  return Boolean(game && !finished && !paused && !hint && !modalActive && !autofilling);
}

// ---------- группы: пунктир и суммы ----------

/**
 * Пунктир групп поверх доски (SVG): контур каждой группы, отступивший внутрь клетки (outline.js), каждый прямой
 * отрезок — своей линией, чтобы штрихи начинались и кончались в углах; сумма — в левом верхнем углу первой
 * клетки группы, пунктир вокруг неё вырезан маской (как на sudoku.com: подсветка клеток под суммой видна).
 */
function drawCages() {
  if (!ui || !game) {
    ui?.cageLayer.replaceChildren();
    drawnFor = null;
    return;
  }
  const W = ui.board.clientWidth;
  const H = ui.board.clientHeight;
  const key = `${W}x${H}`;
  if (drawnFor?.cages === game.cages && drawnFor.key === key) return;
  drawnFor = { cages: game.cages, key };
  if (!W || !H) return;
  const xs = [];
  const ys = [];
  for (let k = 0; k < 9; k++) {
    xs.push(ui.cells[k].offsetLeft);
    ys.push(ui.cells[k * 9].offsetTop);
  }
  xs.push(ui.cells[8].offsetLeft + ui.cells[8].offsetWidth);
  ys.push(ui.cells[72].offsetTop + ui.cells[72].offsetHeight);
  const cw = (xs[9] - xs[0]) / 9;

  const node = (name, attrs = {}) => {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const layer = ui.cageLayer;
  layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
  layer.setAttribute('width', W);
  layer.setAttribute('height', H);
  const mask = node('mask', { id: 'ks-cut', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  mask.append(node('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
  const lines = node('g', { mask: 'url(#ks-cut)', class: 'ks-cage-lines' });
  const labels = node('g', { class: 'ks-cage-sums' });
  const fontSize = Math.max(9, Math.round(cw * 0.24 * 10) / 10);
  const inset = Math.max(2.5, cw * 0.075);
  const dash = cw * 0.1;
  const gap = cw * 0.065;
  ui.cageGroups = [];

  game.cages.forEach((cage, c) => {
    const group = node('g', { class: 'ks-cg' });
    for (const run of cageOutline(cage.cells, xs, ys, inset)) {
      const [x1, y1, x2, y2] = run;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.round((len + gap) / (dash + gap)));
      const d = Math.max(1, (len - (n - 1) * gap) / n);
      group.append(node('line', { x1, y1, x2, y2, 'stroke-dasharray': n > 1 ? `${d.toFixed(2)} ${gap.toFixed(2)}` : 'none' }));
    }
    lines.append(group);
    ui.cageGroups.push(group);

    const first = Math.min(...cage.cells);
    const x0 = xs[COL_OF[first]];
    const y0 = ys[ROW_OF[first]];
    const text = String(cage.sum);
    const tw = text.length * fontSize * 0.6;
    mask.append(node('rect', { x: x0, y: y0, width: inset + tw + cw * 0.05, height: inset + fontSize * 0.95, fill: '#000' }));
    const label = node('text', { x: x0 + cw * 0.06, y: y0 + cw * 0.05 + fontSize * 0.8, 'font-size': fontSize });
    label.textContent = text;
    labels.append(label);
  });
  layer.replaceChildren(node('defs'), lines, labels);
  layer.firstChild.append(mask);
  renderCageHighlight();
}

/** Выбранная группа — сплошной контур цвета акцента; группы, о которых говорит подсказка, — янтарные. */
function renderCageHighlight() {
  if (!ui?.cageGroups || !game) return;
  const h = hint ? hint.pages[hint.page].show : null;
  const own = !h && selected >= 0 ? layoutOf(game).cageOf[selected] : -1;
  ui.cageGroups.forEach((g, c) => {
    g.classList.toggle('ks-cg-on', c === own);
    g.classList.toggle('ks-cg-hint', Boolean(h?.cages.includes(c)));
  });
}

/** Под доской: сумма выбранной группы и её сочетания (зачёркнуты те, что уже не встают из-за цифр рядом). */
function renderCageBar() {
  const bar = ui.cageBar;
  const show = game && !finished && settings.combos && selected >= 0 && !hint;
  bar.classList.toggle('ks-cagebar-off', !show);
  if (!show) {
    bar.replaceChildren();
    return;
  }
  const c = layoutOf(game).cageOf[selected];
  const info = cageInfo(game, c);
  if (!info.free) {
    bar.replaceChildren(el('span', { class: 'ks-cb-title ks-cb-done' }, `✓ ${t.cage.done} · ${info.sum}`));
    return;
  }
  const combos = cageCombos(game, c);
  combos.sort((a, b) => Number(b.fits) - Number(a.fits));
  const LIMIT = 8;
  const chips = combos.slice(0, LIMIT).map(({ mask, fits }) => el('span', { class: fits ? 'ks-chip' : 'ks-chip ks-chip-off' },
    digitsOf(mask).join('')));
  let hidden = combos.length - chips.length;
  const more = el('span', { class: 'ks-chip ks-chip-more', hidden: !hidden }, t.cage.more(hidden));
  const box = el('span', { class: 'ks-cb-chips' }, chips, more);
  bar.replaceChildren(
    el('span', { class: 'ks-cb-title' }, info.free < info.size ? t.cage.left(info.left, info.free) : t.cage.sum(info.sum, info.size)),
    box,
  );
  // не влезают в ширину — последние уходят в «+N» (обрезанный вариант читался бы как другой набор)
  while (chips.length > 1 && box.scrollWidth > box.clientWidth + 1) {
    chips.pop().remove();
    hidden++;
    more.hidden = false;
    more.textContent = t.cage.more(hidden);
  }
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
  const layout = game ? layoutOf(game) : null;
  const ownCage = layout && selected >= 0 && !hint ? new Set(layout.cages[layout.cageOf[selected]].cells) : new Set();
  const conflict = game ? conflicts(game) : new Set();
  const h = hint ? hint.pages[hint.page].show : null;
  ui.board.classList.toggle('ks-hinting', Boolean(h));

  ui.cells.forEach((cell, i) => {
    const value = game ? game.values[i] : 0;
    const cls = ['ks-cell', ...cell.fixedClasses];
    if (game) {
      if (isGiven(game, i)) cls.push('ks-given');
      else if (isWrong(game, i)) cls.push('ks-wrong');
      else if (value) cls.push('ks-user');
    }
    if (h) {
      if (h.area.has(i)) cls.push('ks-h-area');
      if (h.elim.has(i)) cls.push('ks-h-elim');
      if (h.key.has(i)) cls.push('ks-h-key');
      if (h.target === i) cls.push('ks-h-target');
      if (h.wrong === i) cls.push('ks-h-wrong');
    } else {
      if (peers.has(i)) cls.push('ks-peer');
      if (ownCage.has(i) && i !== selected) cls.push('ks-incage');
      if (selValue && value === selValue && i !== selected) cls.push('ks-same');
      if (i === selected) cls.push('ks-selected');
    }
    if (conflict.has(i) && !h) cls.push('ks-conflict');   // одинаковые цифры в строке/группе — красным фоном
    cell.className = cls.join(' ');

    if (h && !value && (h.reveal && h.target === i)) {
      // последняя страница подсказки: цифра ответа уже видна в клетке
      cell.replaceChildren(el('span', { class: 'ks-val ks-h-reveal' }, h.reveal));
    } else if (h && !value && (h.cands.has(i) || h.elim.has(i))) {
      // варианты, о которых говорит подсказка: нужные — цветом, вычеркнутые — красным крестом
      const on = h.cands.get(i) ?? [];
      const off = h.elim.get(i) ?? [];
      if (on.length + off.length === 1) {
        cell.replaceChildren(el('span', { class: `ks-h-one ${off.length ? 'ks-h-x' : 'ks-h-cand'}` }, off[0] ?? on[0]));
        return;
      }
      const notes = el('div', { class: 'ks-notes' });
      for (let d = 1; d <= 9; d++) {
        notes.append(el('span', { class: off.includes(d) ? 'ks-h-x' : on.includes(d) ? 'ks-h-cand' : '' },
          off.includes(d) || on.includes(d) ? d : ''));
      }
      cell.replaceChildren(notes);
    } else if (value) {
      cell.replaceChildren(el('span', { class: 'ks-val' }, value));
    } else if (game && game.notes[i]) {
      const notes = el('div', { class: 'ks-notes' });
      for (let d = 1; d <= 9; d++) {
        const has = game.notes[i] & bit(d);
        notes.append(el('span', { class: has && d === selValue ? 'ks-note-on' : '' }, has ? d : ''));
      }
      cell.replaceChildren(notes);
    } else {
      cell.replaceChildren();
    }
  });

  renderHintLayer(h);
  renderCageHighlight();
  renderCageBar();

  if (fx) {
    const cell = ui.cells[fx.cell];
    if (fx.kind === 'pop') pop(cell.firstChild);
    else if (fx.kind === 'shake') shake(cell, { distance: 4 });
    else if (fx.kind === 'note') pop(cell.querySelectorAll('.ks-notes span')[fx.digit - 1], { from: 0.3, duration: 180 });
  }
}

function renderControls() {
  const counts = game ? digitCounts(game) : Array(10).fill(0);
  ui.padButtons.forEach((button, index) => {
    button.classList.toggle('ks-digit-done', counts[index + 1] >= 9);
  });
  ui.pad.classList.toggle('ks-pad-notes', notesMode);
  ui.notesBadge.textContent = notesMode ? t.notesOn : t.notesOff;
  ui.notesBadge.classList.toggle('ks-badge-on', notesMode);
  ui.hintBadge.textContent = game ? game.hintsLeft : '';
  ui.hintBadge.hidden = !game;
  ui.tools.hint.disabled = !game || game.hintsLeft === 0;
}

function renderAll() {
  renderInfo();
  drawCages();
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
  const flash = cssVar('--ks-flash');
  for (const i of cells) {
    const delay = (Math.abs(ROW_OF[i] - ROW_OF[origin]) + Math.abs(COL_OF[i] - COL_OF[origin])) * step;
    animate(ui.cells[i], [{ backgroundColor: flash, offset: 0.35 }], { duration, delay, easing: 'ease-out' });
    const content = ui.cells[i].firstChild;
    if (content) animate(content, [{ transform: 'scale(1.18)', offset: 0.35 }], { duration, delay, easing: 'ease-out' });
  }
}

/** Строки/столбцы/блоки и группа клетки, которые теперь заполнены целиком и верно. */
function completedParts(i) {
  const full = (cells) => cells.every((c) => game.values[c] === game.solution[c]);
  const parts = UNITS_OF[i].map((u) => UNITS[u]).filter(full);
  const { cages, cageOf } = layoutOf(game);
  const cage = cages[cageOf[i]].cells;
  if (cage.length > 1 && full(cage)) parts.push(cage);
  return parts;
}

function unitWave(i) {
  const done = completedParts(i);
  if (!done.length) return;
  wave(new Set(done.flat()), i);
  later(() => sfx('unit', { step: done.length }), 120);   // аккорд — вслед за волной подсветки
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

/**
 * Автозаполнение (настройка «Автозаполнение»): после хода дописывает однозначные клетки по одной — с тем же
 * звуком карандаша, «впрыгиванием» и волной, что и обычный ход. На это время ввод закрыт, в конце — победа.
 */
function runAutofill() {
  if (settings.autofill === 'off' || !game || finished || autofilling) return;
  const plan = autofillPlan(game, settings.autofill);
  if (!plan.length) return;
  const g = game;
  autofilling = true;
  plan.forEach(({ i, d }, k) => later(() => {
    if (game !== g || finished) return;
    applyAutofill(game, i, d);
    sfx('digit', { step: d });
    api.platform.haptic.selection();
    save();
    renderInfo();
    renderControls();
    renderBoard({ cell: i, kind: 'pop' });
    bump(ui.info.score);
    if (k === plan.length - 1) autofilling = false;
    if (isSolved(game)) finishGame(true);
    else {
      unitWave(i);
      if (digitCounts(game)[d] === 9) later(() => sfx('done', { step: d }), 180);
    }
  }, 280 + k * 170));
}

function select(i) {
  if (!canPlay()) return;
  if (i !== selected) sfx('select');
  selected = i;
  api.platform.haptic.selection();
  renderBoard();
}

function inputDigit(d) {
  if (!canPlay() || selected < 0) return;
  if (notesMode) {
    if (toggleNote(game, selected, d)) {
      sfx('note', { step: d });
      api.platform.haptic.selection();
      save();
      renderBoard(game.notes[selected] & bit(d) ? { cell: selected, kind: 'note', digit: d } : null);
    }
    return;
  }
  const result = placeDigit(game, selected, d);
  if (result === 'ignored') return;
  if (result === 'wrong') sfx('wrong', { step: d });
  else {
    sfx('digit', { step: d });
    // все девять цифр на месте — нота цифры (если это не конец партии — там свой аккорд)
    if (digitCounts(game)[d] === 9 && !isSolved(game)) later(() => sfx('done', { step: d }), 180);
  }
  if (result === 'wrong') api.platform.haptic.notification('error');
  else api.platform.haptic.impact('light');
  save();
  renderInfo();
  renderControls();
  renderBoard({ cell: selected, kind: result === 'wrong' ? 'shake' : 'pop' });
  if (result === 'wrong') bump(ui.info.mistakes, cssVar('--ks-danger'));
  else {
    bump(ui.info.score);
    if (!isSolved(game)) unitWave(selected);
  }
  // Поражение — только после неверного хода: если лимит включили, когда ошибок уже 3+,
  // партия не должна закончиться от верной цифры.
  if (result === 'wrong' && isLost(game, settings.mistakesLimit)) finishGame(false);
  else if (isSolved(game)) finishGame(true);
  else if (result === 'correct') runAutofill();
}

function onErase() {
  if (!canPlay() || selected < 0) return;
  if (erase(game, selected)) {
    sfx('erase');
    save();
    renderAll();
    runAutofill();   // стёрта ошибка — автозаполнение снова может дописывать
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
  sfx('undo');
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
  sfx(won ? 'win' : 'lose');
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
    sfx('empty');
    showToast(t.noHints);
    return;
  }
  const found = buildHint(game.values, game.solution, layoutOf(game));
  if (!found) return;
  game.hintsLeft--;
  sfx('hint');
  hint = { ...found, page: 0 };
  selected = found.action.cell;
  save();

  renderHintPanel();
  hintToken++;
  ui.hintPanel.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  flipSize(ui.board, () => {
    ui.hintPanel.hidden = false;
    root.classList.add('ks-hint-open');
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
  const text = current.text.map((seg) => (typeof seg === 'string' ? seg : el('span', { class: `ks-mark ks-mark-${seg.m}` }, seg.t)));
  const nav = (dir) => () => setHintPage(page + dir);
  ui.hintPanel.replaceChildren(el('div', { class: pages.length > 1 ? 'ks-hint-card' : 'ks-hint-card ks-hint-single', role: 'dialog', 'aria-label': t.tools.hint },
    el('div', { class: 'ks-hint-head' },
      el('div', { class: 'ks-hint-title' }, current.title),
      el('button', { class: 'ks-icon-btn ks-hint-close', 'aria-label': t.hint.close, title: t.hint.close, onclick: closeHint }, '✕'),
    ),
    el('p', { class: 'ks-hint-text' }, text),
    el('div', { class: 'ks-hint-nav' },
      el('button', { class: 'ks-hint-arrow', 'aria-label': t.hint.back, disabled: page === 0, onclick: nav(-1) }, '‹'),
      el('div', { class: 'ks-hint-dots' }, pages.length > 1 && pages.map((_, n) => el('span', { class: n === page ? 'on' : '' }))),
      last
        ? el('button', { class: 'btn ks-hint-done', onclick: applyHint }, hint.action.kind === 'erase' ? t.hint.erase : t.hint.done)
        : el('button', { class: 'ks-hint-arrow', 'aria-label': t.hint.next, onclick: nav(1) }, '›'),
    ),
  ));
}

function setHintPage(n) {
  if (!hint || n < 0 || n >= hint.pages.length || n === hint.page) return;
  hint.page = n;
  sfx('page');
  renderHintPanel();
  renderBoard();
  api.platform.haptic.selection();
  animate(ui.hintPanel.querySelector('.ks-hint-text'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_OUT });
  const reveal = ui.board.querySelector('.ks-h-reveal');
  if (reveal) pop(reveal);
}

/** Рамки вокруг строк, столбцов и блоков, о которых говорит страница, — поверх доски. */
function renderHintLayer(h) {
  const frames = [];
  for (const u of h?.units ?? []) {
    const cells = UNITS[u].map((i) => ui.cells[i]);
    const left = Math.min(...cells.map((c) => c.offsetLeft));
    const top = Math.min(...cells.map((c) => c.offsetTop));
    const right = Math.max(...cells.map((c) => c.offsetLeft + c.offsetWidth));
    const bottom = Math.max(...cells.map((c) => c.offsetTop + c.offsetHeight));
    frames.push(el('div', { class: 'ks-h-frame', style: `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px` }));
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
      root.classList.remove('ks-hint-open');
    });
  });
}

function applyHint() {
  if (!hint) return;                         // двойное касание «Готово», пока панель уезжает
  const { action } = hint;
  if (action.kind === 'erase') applyHintErase(game, action.cell);
  else applyHintDigit(game, action.cell, action.digit);
  selected = action.cell;
  sfx('apply');
  api.platform.haptic.impact('medium');
  closeHint();
  save();
  renderBoard({ cell: action.cell, kind: 'pop' });
  if (isSolved(game)) finishGame(true);
  else {
    if (action.kind === 'place') unitWave(action.cell);
    runAutofill();
  }
}

// ---------- окна: новая игра и статистика ----------

/** Открыть окно; если окно уже открыто — только заменить содержимое (без повторной анимации). */
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

async function showPicker(cancellable) {
  const last = await api.storage.get('lastDifficulty');
  if (!api) return;
  const wasPaused = paused;
  if (cancellable) setPaused(true);

  const close = () => {
    closeModal();
    if (!wasPaused) setPaused(false);
  };

  openModal(el('div', { class: 'ks-card', role: 'dialog', 'aria-label': t.newGame },
    el('div', { class: 'ks-card-head' },
      el('h2', {}, t.newGame),
      cancellable && el('button', { class: 'ks-icon-btn', 'aria-label': t.cancel, title: t.cancel, onclick: close }, '✕'),
    ),
    cancellable ? el('p', { class: 'hint ks-warning' }, t.newGameWarning) : el('p', { class: 'hint ks-rules' }, t.rules),
    el('div', { class: 'ks-picker' }, DIFFICULTIES.map((d) => el('button', {
      class: d === last ? 'btn ks-level' : 'btn btn-secondary ks-level',
      onclick: () => startNew(d),
    }, el('span', { class: 'ks-level-name' }, t.difficulty[d]), el('span', { class: 'ks-level-desc' }, t.difficultyDesc[d])))),
  ));
  ui.modal.dataset.cancellable = cancellable ? '1' : '';
  ui.modal.onEscape = cancellable ? close : null;
}

async function startNew(difficulty) {
  closeModal();
  // «+» ставит партию на паузу на время выбора сложности — окно паузы надо убрать вместе с флагом
  paused = false;
  autofilling = false;
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
  const base = decodePuzzle(list[Math.floor(Math.random() * list.length)]);
  const [solution, givens, cageOf] = transformGrids([base.solution, base.givens, base.cageOf]);
  const { cages } = cagesFromMap(cageMapText(cageOf), solution);
  game = newGame(difficulty, { solution, givens, cages });
  finished = false;
  notesMode = false;
  hint = null;
  selected = game.values.findIndex((v) => !v);
  runningSince = null;
  sfx('fresh');
  startClock();
  api.storage.set('lastDifficulty', difficulty);
  save();
  renderAll();
  if (!reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, [
      { opacity: 0, transform: 'scale(0.85)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 260, delay: (ROW_OF[i] + COL_OF[i]) * 18, easing: EASE_OUT, fill: 'backwards' }));
    animate(ui.cageLayer, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 250, easing: 'ease-out', fill: 'backwards' });
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
  const item = (value, label) => el('div', { class: 'ks-stat' },
    el('div', { class: 'ks-stat-value' }, value),
    el('div', { class: 'ks-stat-label' }, label),
  );

  const render = (difficulty) => {
    const s = stats[difficulty];
    const winRate = s.played ? Math.round((s.wins / s.played) * 100) : 0;
    const grid = el('div', { class: 'ks-stats-grid' },
      item(s.played, t.stats.played),
      item(s.wins, t.stats.wins),
      item(winRate, t.stats.winRate),
      item(time(s.bestMs), t.stats.best),
      item(time(s.wins ? s.totalWinMs / s.wins : null), t.stats.average),
      item(s.streak, t.stats.streak),
      item(s.maxStreak, t.stats.maxStreak),
    );
    openModal(el('div', { class: 'ks-card', role: 'dialog', 'aria-label': t.stats.title },
      el('div', { class: 'ks-card-head' },
        el('h2', {}, t.stats.title),
        el('button', { class: 'ks-icon-btn', 'aria-label': t.stats.close, title: t.stats.close, onclick: close }, '✕'),
      ),
      el('div', { class: 'ks-tabs', role: 'tablist' }, DIFFICULTIES.map((d) => el('button', {
        class: 'ks-tab',
        role: 'tab',
        'aria-selected': String(d === difficulty),
        onclick: () => {
          if (d === difficulty) return;
          render(d);
          animate(ui.modal.querySelector('.ks-stats-grid'), [{ opacity: 0.2 }, { opacity: 1 }], { duration: 200 });
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

function switchRow(title, desc, checked, onchange) {
  return el('label', { class: 'ks-setting' },
    el('div', {},
      el('div', { class: 'ks-setting-title' }, title),
      el('div', { class: 'ks-setting-desc' }, desc),
    ),
    el('input', { type: 'checkbox', class: 'ks-switch', role: 'switch', checked, onchange: (e) => onchange(e.target.checked) }),
  );
}

function showSettings() {
  if (hint) return;
  const wasPaused = paused;
  setPaused(true);
  const autofillWas = settings.autofill;
  const close = () => {
    closeModal();
    if (!wasPaused) setPaused(false);
    if (settings.autofill !== autofillWas) runAutofill();   // включили — дописывает сразу, если уже есть что
  };

  const autofillDesc = el('div', { class: 'ks-setting-desc' }, t.settings.autofillModes[settings.autofill].desc);
  const autofillButtons = AUTOFILL_MODES.map((mode) => el('button', {
    class: 'ks-seg-btn',
    role: 'radio',
    'aria-checked': String(mode === settings.autofill),
    onclick: () => {
      settings.autofill = mode;
      saveSettings();
      autofillDesc.textContent = t.settings.autofillModes[mode].desc;
      autofillButtons.forEach((b, k) => b.setAttribute('aria-checked', String(AUTOFILL_MODES[k] === mode)));
    },
  }, t.settings.autofillModes[mode].label));

  const skinButtons = SKINS.map((id) => el('button', {
    class: 'ks-skin',
    role: 'radio',
    'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      saveSettings();
      applySkin();
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'ks-swatch', 'data-skin': id }), t.skins[id]));

  openModal(el('div', { class: 'ks-card ks-card-scroll', role: 'dialog', 'aria-label': t.settings.title },
    el('div', { class: 'ks-card-head' },
      el('h2', {}, t.settings.title),
      el('button', { class: 'ks-icon-btn', 'aria-label': t.settings.close, title: t.settings.close, onclick: close }, '✕'),
    ),
    switchRow(t.settings.mistakesLimit, t.settings.mistakesLimitDesc(MAX_MISTAKES), settings.mistakesLimit, (on) => {
      settings.mistakesLimit = on;
      saveSettings();
      renderInfo();
    }),
    switchRow(t.settings.combos, t.settings.combosDesc, settings.combos, (on) => {
      settings.combos = on;
      saveSettings();
      renderCageBar();
    }),
    el('div', { class: 'ks-setting ks-setting-col' },
      el('div', { class: 'ks-setting-title' }, t.settings.autofill),
      el('div', { class: 'ks-seg', role: 'radiogroup', 'aria-label': t.settings.autofill }, autofillButtons),
      autofillDesc,
    ),
    el('h3', { class: 'ks-section-title' }, t.settings.appearance),
    el('div', { class: 'ks-skins', role: 'radiogroup', 'aria-label': t.settings.appearance }, skinButtons),
    pointsInfo(api, 'killer-sudoku'),
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
  if (modalActive) {
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
  const button = el('button', { class: 'ks-tool', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'ks-tool-icon' }),
    el('span', { class: 'ks-tool-label' }, t.tools[key]),
    badge,
  );
  button.firstChild.innerHTML = icon;
  return button;
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'ks-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'killer-sudoku',
  title: 'Судоку-киллер',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    settings = normalizeSettings(savedSettings);
    applySkin();

    stats = {};
    for (const d of DIFFICULTIES) stats[d] = isValidStats(savedStats?.[d]) ? savedStats[d] : emptyStats();

    const infoValue = () => el('div', { class: 'ks-info-value' });
    ui = {
      title: el('div', { class: 'ks-title' }, t.title),
      sub: el('div', { class: 'ks-sub' }),
      info: { difficulty: infoValue(), mistakes: infoValue(), score: infoValue(), time: infoValue() },
      // пауза и продолжение со звуком — только по кнопке (сама пауза бывает и при сворачивании, и под окнами)
      pauseButton: el('button', { class: 'ks-icon-btn ks-pause-btn', onclick: () => { if (game && !finished) sfx(paused ? 'resume' : 'pause'); setPaused(!paused); } }),
      board: el('div', { class: 'ks-board', role: 'grid' }),
      cageLayer: document.createElementNS(SVG_NS, 'svg'),
      hintLayer: el('div', { class: 'ks-hint-layer', 'aria-hidden': 'true' }),
      cells: [],
      cageGroups: null,
      cageBar: el('div', { class: 'ks-cagebar ks-cagebar-off', 'aria-label': t.cage.label }),
      pauseCover: el('div', { class: 'ks-pause-cover', hidden: true },
        el('button', { class: 'btn ks-resume', onclick: () => { sfx('resume'); if (paused) setPaused(false); else showPauseCover(false); } }, t.resume)),
      notesBadge: el('span', { class: 'ks-badge ks-badge-pill' }),
      hintBadge: el('span', { class: 'ks-badge ks-badge-count' }),
      pad: el('div', { class: 'ks-pad' }),
      padButtons: [],
      hintPanel: el('div', { class: 'ks-hint', hidden: true }),
      modal: el('div', { class: 'ks-modal', hidden: true }),
    };
    ui.cageLayer.setAttribute('class', 'ks-cage-layer');
    ui.cageLayer.setAttribute('aria-hidden', 'true');
    ui.soundBtn = iconButton(ICONS.soundOn, t.soundOn, toggleSound);
    ui.tools = {
      undo: toolButton('undo', ICONS.undo, onUndo),
      erase: toolButton('erase', ICONS.erase, onErase),
      notes: toolButton('notes', ICONS.notes, onNotes, ui.notesBadge),
      hint: toolButton('hint', ICONS.hint, onHint, ui.hintBadge),
    };

    for (let i = 0; i < 81; i++) {
      const r = ROW_OF[i];
      const c = COL_OF[i];
      const cell = el('div', { class: 'ks-cell', role: 'gridcell', 'data-i': i });
      cell.fixedClasses = [
        c % 3 === 2 && c < 8 && 'ks-c-thick',
        r % 3 === 2 && r < 8 && 'ks-r-thick',
        c === 8 && 'ks-c-last',
        r === 8 && 'ks-r-last',
      ].filter(Boolean);
      ui.cells.push(cell);
    }
    ui.board.append(...ui.cells, ui.cageLayer, ui.hintLayer);
    ui.board.addEventListener('click', (e) => {
      const cell = e.target.closest('.ks-cell');
      if (cell) select(Number(cell.dataset.i));
    });

    for (let d = 1; d <= 9; d++) {
      const button = el('button', {
        class: 'ks-digit',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => inputDigit(d),
      }, d);
      ui.padButtons.push(button);
    }
    ui.pad.append(...ui.padButtons);

    ui.controls = el('div', { class: 'ks-controls' },
      el('div', { class: 'ks-tools' }, Object.values(ui.tools)),
      ui.pad,
      ui.hintPanel,
    );

    const infoItem = (label, value) => el('div', { class: 'ks-info-item' }, el('div', { class: 'ks-info-label' }, label), value);
    root = el('div', { class: 'ks' },
      el('div', { class: 'ks-header' },
        el('div', { class: 'ks-heading' }, ui.title, ui.sub),
        el('div', { class: 'ks-actions' },
          ui.soundBtn,
          iconButton(ICONS.plus, t.newGame, () => { if (!hint) showPicker(Boolean(game)); }),
          iconButton(ICONS.stats, t.stats.open, () => showStats()),
          iconButton(ICONS.gear, t.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'ks-info' },
        infoItem(t.info.difficulty, ui.info.difficulty),
        infoItem(t.info.mistakes, ui.info.mistakes),
        infoItem(t.info.score, ui.info.score),
        infoItem(t.info.time, ui.info.time),
        ui.pauseButton,
      ),
      el('div', { class: 'ks-board-wrap' }, ui.board, ui.pauseCover),
      ui.cageBar,
      ui.controls,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    const tick = setInterval(() => {
      if (runningSince !== null) renderTime();
    }, 500);
    timers.add(tick);
    // пунктир групп — в пикселях доски: перерисовать при каждом изменении её размера
    resizer = new ResizeObserver(() => {
      if (!ui) return;
      drawCages();
      renderHintLayer(hint ? hint.pages[hint.page].show : null);
    });
    resizer.observe(ui.board);

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
    resizer?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    root?.remove();
    toast?.dispose();
    api = root = host = ui = game = hint = toast = runningSince = resizer = drawnFor = null;
    modalActive = false;
    stats = {};
    settings = defaultSettings();
    selected = -1;
    notesMode = paused = finished = autofilling = false;
  },
};
