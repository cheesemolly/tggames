// Филворд («слова на сетке»): на поле спрятаны слова банка (список внизу). Выделяешь пальцем прямую —
// горизонталь, вертикаль или диагональ, без поворотов. Слово банка остаётся на поле цветной капсулой,
// любое другое слово словаря — бонус (очки + список по кнопке «Бонус»). Времени нет.
// Уровни бесконечные, как в «Петле»: все слова найдены — сразу следующее поле, экрана результата нет.
// Очки считаются за уровень, рекорд — лучший уровень по очкам. Партия, статистика (по размеру поля)
// и настройки — в api.storage игры.
// Звуки (sounds.js) — в бете у владельца: api.feature('boggle-sounds'); кнопка в шапке включает и выключает их.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, pop, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  SIZES, DEFAULT_SIZE, WORDS_BY_SIZE, createDictionary, generatePuzzle, snapLine, cellsWord,
  checkSelection, applyWord, bonusPoints, isComplete, newGame, isValidState,
  emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'night', 'paper', 'neon', 'mint'];
const CAPSULE_COLORS = 8;
const T = {
  title: 'Филворд',
  sub: (level, size) => `Уровень ${level} · ${size}×${size}`,
  cleared: (n) => `Уровень ${n} пройден!`,
  menu: (level, best) => `Уровень ${level} · Рекорд за уровень: ${best}`,
  info: { found: 'Слова', bonus: 'Бонус', score: 'Очки' },
  loading: 'Загрузка словаря…',
  loadFailed: 'Не удалось загрузить словарь',
  hint: 'Проведи по прямой: → ↓ ↘ и в любую сторону',
  repeat: 'Уже найдено',
  unknown: 'Нет в словаре',
  bonusBanner: 'Бонус!',
  newGame: 'Новая игра',
  restartQuestion: 'Начать заново? Найденные слова пропадут.',
  restart: 'Начать заново',
  cancel: 'Отмена',
  bonus: {
    title: 'Бонусные слова',
    empty: 'Пока нет. Бонус — любое слово, которого нет в списке внизу, но оно есть в словаре.',
    left: (n) => (n > 0 ? `На поле ещё ${n} бонусных слов.` : 'Все бонусные слова найдены!'),
  },

  stats: {
    open: 'Статистика', title: 'Статистика', played: 'Уровней пройдено', best: 'Рекорд за уровень',
    bonus: 'Бонусных слов', close: 'Закрыть',
  },
  settings: {
    open: 'Настройки', title: 'Настройки', size: 'Размер поля', skin: 'Оформление', close: 'Закрыть',
    words: (n) => `${WORDS_BY_SIZE[n]} слов`, nextGame: 'Новый размер — со следующей партии.',
  },
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  skins: { telegram: 'По умолчанию', classic: 'Кубики', night: 'Ночь', paper: 'Бумага', neon: 'Неон', mint: 'Мята' },
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
let stats = {};
let settings = { size: DEFAULT_SIZE, skin: 'telegram', sound: true };
// звук — один AudioContext на всю жизнь страницы, заводится при первом звуке (из касания)
const audio = createAudio(createSounds);
let selection = [];
let pointerId = null;
let finished = false;
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

// ---------- звук ----------

const soundFeature = () => Boolean(api?.feature?.('boggle-sounds'));

function sfx(name, opts) {
  if (!soundFeature() || !settings.sound) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = settings.sound ? ICONS.soundOn : ICONS.soundOff;
  const label = settings.sound ? T.soundOn : T.soundOff;
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('bo-muted', !settings.sound);
}

function toggleSound() {
  settings.sound = !settings.sound;
  api.storage.set('settings', settings);
  renderSoundBtn();
  pop(ui.soundBtn, { from: 0.8, duration: 220 });
  sfx('click');
}

function save() {
  if (game && !finished) api.storage.set('current', game);
}

// ---------- отрисовка ----------

function renderInfo() {
  ui.sub.textContent = T.sub(game?.level ?? 1, game?.size ?? settings.size);
  ui.found.textContent = game ? `${game.found.length}/${game.bank.length}` : '—';
  ui.bonusCount.textContent = game ? game.bonus.length : '—';
  ui.score.textContent = game ? game.score : '—';
}

function buildBoard() {
  const { size, grid } = game;
  ui.board.style.setProperty('--n', size);
  ui.cells = grid.map((letter) => el('div', { class: 'bo-cell' }, el('span', { class: 'bo-letter' }, letter)));
  ui.board.replaceChildren(ui.capsules, ...ui.cells);
  syncCapsules();
  if (!reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 240, delay: (Math.floor(i / size) + (i % size)) * 14, easing: EASE_OUT, fill: 'backwards' }));
  }
}

/**
 * Капсула — толстая линия с круглыми концами от центра первой клетки до центра последней.
 * Координаты — в пикселях, по реальным центрам клеток на экране (с учётом зазоров между ними).
 */
function capsule(cells, cls) {
  // offset* — из раскладки, без учёта transform: анимации клеток (появление, увеличение) не сбивают капсулу.
  // Холст капсул стоит внутри поля с отступом, равным padding поля.
  const pad = parseFloat(getComputedStyle(ui.board).paddingLeft) || 0;
  const at = (i) => {
    const cell = ui.cells[i];
    return [cell.offsetLeft + cell.offsetWidth / 2 - pad, cell.offsetTop + cell.offsetHeight / 2 - pad];
  };
  const [x1, y1] = at(cells[0]);
  const [x2, y2] = at(cells.at(-1));
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', `bo-capsule ${cls}`);
  line.style.strokeWidth = `${ui.cells[cells[0]].offsetWidth * 0.78}`;
  return line;
}

/** Холст капсул — в пикселях поля; при изменении размера капсулы перестраиваются. */
function syncCapsules() {
  const box = ui.capsules.getBoundingClientRect();
  ui.capsules.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  if (game) {
    renderCapsules();
    renderSelection(selection);
  }
}

function renderCapsules() {
  ui.capsules.replaceChildren(...game.found.map((f, k) => capsule(f.cells, `bo-m${(k % CAPSULE_COLORS) + 1}`)));
  const foundCells = new Set(game.found.flatMap((f) => f.cells));
  ui.cells.forEach((cell, i) => cell.classList.toggle('bo-done', foundCells.has(i)));
}

/** Текущее выделение: kind — '' | 'good' | 'bonus' | 'bad' | 'warn'. */
function renderSelection(cells = selection, kind = '') {
  ui.selection?.remove();
  ui.selection = null;
  const set = new Set(cells);
  ui.cells.forEach((cell, i) => cell.classList.toggle('bo-on', set.has(i)));
  if (cells.length) {
    ui.selection = capsule(cells, `bo-sel ${kind ? `bo-sel-${kind}` : ''}`);
    ui.capsules.append(ui.selection);
  }
  ui.current.textContent = cells.length ? cellsWord(game.grid, cells).toUpperCase() : T.hint;
  ui.current.classList.toggle('bo-current-empty', !cells.length);
  ui.current.dataset.kind = kind;
}

function renderBank({ fresh = null } = {}) {
  const found = new Set(game.found.map((f) => f.word));
  const order = new Map(game.found.map((f, k) => [f.word, k]));
  ui.bank.replaceChildren(...game.bank.map(({ word }) => {
    const done = found.has(word);
    const node = el('div', { class: done ? `bo-word bo-word-done bo-m${(order.get(word) % CAPSULE_COLORS) + 1}` : 'bo-word' },
      word.toUpperCase());
    if (word === fresh) pop(node, { from: 0.7 });
    return node;
  }));
}

// ---------- ввод пальцем ----------

/** Точка пальца в «клетках» (дробно): считаем от центров первой и последней клетки — с учётом зазоров. */
function pointToCell(clientX, clientY) {
  const n = game.size;
  const first = ui.cells[0].getBoundingClientRect();
  const last = ui.cells[n * n - 1].getBoundingClientRect();
  const pitchX = (last.left - first.left) / (n - 1);
  const pitchY = (last.top - first.top) / (n - 1);
  return {
    row: (clientY - (first.top + first.height / 2)) / pitchY + 0.5,
    col: (clientX - (first.left + first.width / 2)) / pitchX + 0.5,
  };
}

function onPointerDown(e) {
  if (!game || !dict || finished || modalActive || pointerId !== null) return;
  const { row, col } = pointToCell(e.clientX, e.clientY);
  const n = game.size;
  if (row < 0 || row >= n || col < 0 || col >= n) return;
  e.preventDefault();
  pointerId = e.pointerId;
  try {
    ui.board.setPointerCapture(e.pointerId);
  } catch {
    // без захвата движения всё равно придут на поле
  }
  selection = [Math.floor(row) * n + Math.floor(col)];
  sfx('grab');
  api.platform.haptic.selection();
  renderSelection();
}

function onPointerMove(e) {
  if (e.pointerId !== pointerId) return;
  const { row, col } = pointToCell(e.clientX, e.clientY);
  const next = snapLine(selection[0], row, col, game.size);
  if (next.length === selection.length && next.at(-1) === selection.at(-1)) return;
  // линия длиннее — нота выше, короче — та же нота вниз
  if (next.length >= selection.length) sfx('drag', { step: next.length });
  else sfx('undrag', { step: selection.length });
  selection = next;
  api.platform.haptic.selection();
  renderSelection();
}

function onPointerUp(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  const cells = selection;
  selection = [];
  if (cells.length) submit(cells);
}

function submit(cells) {
  const { verdict, word } = checkSelection(game, cells, dict);
  if (verdict === 'short') {
    renderSelection([]);
    return;
  }
  if (verdict === 'bank' || verdict === 'bonus') {
    const points = applyWord(game, verdict, word, cells);
    save();
    renderInfo();
    if (verdict === 'bank') floatPoints(`+${points}`, cells, verdict);
    if (verdict === 'bank') {
      sfx('bank', { step: word.length });
      api.platform.haptic.notification('success');
      renderSelection([]);
      renderCapsules();
      const last = ui.capsules.lastChild;
      animate(last, [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
      renderBank({ fresh: word });
      pop(ui.found, { from: 0.8 });
      if (isComplete(game)) complete();
      return;
    }
    api.platform.haptic.impact('medium');
    renderSelection(cells, 'bonus');
    bonusBanner(word, points);
    // звук баннера: вступление, по ноте на каждую подпрыгнувшую букву «Бонус!», «монетка» под словом
    sfx('bonus');
    const hops = [...T.bonusBanner].length;
    for (let k = 0; k < hops; k++) later(() => sfx('hop', { step: k }), k * 90 + 150);
    later(() => sfx('coin'), hops * 90 + 120);
    pop(ui.bonusButton, { from: 0.8 });
  } else {
    sfx(verdict === 'repeat' ? 'repeat' : 'unknown');
    api.platform.haptic.notification(verdict === 'repeat' ? 'warning' : 'error');
    renderSelection(cells, verdict === 'repeat' ? 'warn' : 'bad');
    if (verdict === 'unknown') shake(ui.current);
    toast.show(verdict === 'repeat' ? T.repeat : T.unknown, 1000);
  }
  later(() => {
    if (ui && pointerId === null) renderSelection([]);
  }, 450);
}

function floatPoints(text, cells, kind) {
  const last = ui.cells[cells.at(-1)].getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const node = el('div', {
    class: `bo-float bo-float-${kind}`,
    style: `left: ${last.left + last.width / 2 - rootRect.left}px; top: ${last.top - rootRect.top}px;`,
  }, text);
  root.append(node);
  later(() => node.remove(), 1000);
}

/** «Бонус!» над полем: буквы подпрыгивают по одной (Б, о, н, у, с, !), под ними слово и очки, потом тает. */
function bonusBanner(word, points) {
  ui.banner?.remove();
  const letters = [...T.bonusBanner].map((ch) => el('span', { class: 'bo-banner-letter' }, ch));
  const banner = el('div', { class: 'bo-banner' },
    el('div', { class: 'bo-banner-title' }, letters),
    el('div', { class: 'bo-banner-word' }, `${word.toUpperCase()} +${points}`),
  );
  const board = ui.board.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  banner.style.left = `${board.left + board.width / 2 - rootRect.left}px`;
  banner.style.top = `${board.top + board.height / 2 - rootRect.top}px`;
  root.append(banner);
  ui.banner = banner;

  if (reducedMotion()) {
    later(() => banner.remove(), 1200);
    return;
  }
  letters.forEach((letter, k) => animate(letter, [
    { transform: 'translateY(0) scale(0.2)', opacity: 0 },
    { transform: 'translateY(-45%) scale(1.25)', opacity: 1, offset: 0.45 },
    { transform: 'translateY(8%) scale(0.95)', offset: 0.7 },
    { transform: 'translateY(0) scale(1)', opacity: 1 },
  ], { duration: 460, delay: k * 90, easing: 'ease-out', fill: 'backwards' }));
  const word2 = banner.lastChild;
  animate(word2, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration: 260, delay: letters.length * 90, easing: EASE_OUT, fill: 'backwards' });
  later(() => {
    animate(banner, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -60%) scale(1.05)' }],
      { duration: 320, easing: 'ease-in', fill: 'forwards' }).then(() => {
      banner.remove();
      if (ui?.banner === banner) ui.banner = null;
    });
  }, letters.length * 90 + 900);
}

// ---------- конец уровня ----------

function complete() {
  finished = true;                       // на время победной волны поле не принимает ввод
  stats[game.size] = recordGame(stats[game.size], game);
  api.storage.set('stats', stats);
  report();
  const size = game.size;
  later(() => sfx('level', { step: size }), 450);    // после колокольчиков последнего слова
  // победная волна по буквам, капсулы пульсируют — потом сразу следующий уровень
  if (!reducedMotion()) {
    const n = game.size;
    ui.cells.forEach((cell, i) => animate(cell, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 420, delay: (Math.floor(i / n) + (i % n)) * 25, easing: 'ease-out' }));
    [...ui.capsules.children].forEach((line, k) => animate(line, [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }],
      { duration: 500, delay: k * 40 }));
  }
  const cleared = game.level;
  later(() => {
    if (!ui) return;
    sfx('fresh');
    startLevel(cleared + 1);
    toast.show(T.cleared(cleared), 2200);
  }, reducedMotion() ? 0 : 1600);
}

/** Следующий уровень: то же поле по размеру, новые слова. */
function startLevel(level) {
  game = newGame(settings.size, generatePuzzle(settings.size, dict), level);
  finished = false;
  selection = [];
  buildBoard();
  renderCapsules();
  renderSelection([]);
  renderBank();
  renderInfo();
  save();
  report();
}

/** Строка для меню: уровень и рекорд очков за уровень. */
function report() {
  if (!game) return;
  api?.progress(T.menu(game.level, stats[game.size]?.best ?? 0));
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
  game = saved ?? newGame(settings.size, generatePuzzle(settings.size, dict));
  if (!game.level) game.level = 1;              // сохранения до уровней — это первый уровень
  finished = false;
  selection = [];
  buildBoard();
  renderCapsules();
  renderSelection([]);
  renderBank();
  renderInfo();
  save();
  report();
}

function askRestart() {
  if (!game || finished || (!game.found.length && !game.bonus.length)) {
    startGame();
    return;
  }
  openModal(card(T.newGame,
    el('p', { class: 'bo-note' }, T.restartQuestion),
    el('div', { class: 'bo-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); sfx('fresh'); startGame(); } }, T.restart),
    ),
  ));
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
  return el('div', { class: 'bo-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bo-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bo-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showBonus() {
  if (!game) return;
  const words = [...game.bonus].sort((a, b) => b.length - a.length || a.localeCompare(b));
  openModal(card(T.bonus.title,
    words.length
      ? el('div', { class: 'bo-list' }, words.map((w) => el('span', { class: 'bo-chip' },
        w.toUpperCase(), el('span', { class: 'bo-chip-pts' }, `+${bonusPoints(w)}`))))
      : el('p', { class: 'bo-note' }, T.bonus.empty),
    el('p', { class: 'bo-note' }, T.bonus.left(game.bonusTotal - game.bonus.length)),
  ));
}

function showStats(initial = game?.size ?? settings.size) {
  const render = (size) => {
    const s = stats[size];
    const item = (value, label) => el('div', { class: 'bo-stat' },
      el('div', { class: 'bo-stat-value' }, value), el('div', { class: 'bo-stat-label' }, label));
    openModal(card(T.stats.title,
      el('div', { class: 'bo-tabs', role: 'tablist' }, SIZES.map((n) => el('button', {
        class: 'bo-tab', role: 'tab', 'aria-selected': String(n === size), onclick: () => render(n),
      }, `${n}×${n}`))),
      el('div', { class: 'bo-stats-grid' },
        item(s.played, T.stats.played),
        item(s.best, T.stats.best),
        item(s.bonus, T.stats.bonus),
      ),
    ));
  };
  render(initial);
}

function showSettings() {
  const note = el('p', { class: 'bo-note', hidden: true }, T.settings.nextGame);
  const sizeButtons = SIZES.map((n) => el('button', {
    class: 'bo-size', role: 'radio', 'aria-checked': String(n === settings.size),
    onclick: () => {
      settings.size = n;
      api.storage.set('settings', settings);
      sizeButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SIZES[k] === n)));
      // В партии ещё ничего не найдено — сразу новое поле, иначе — со следующей партии.
      if (game && !finished && !game.found.length && !game.bonus.length) startGame();
      else note.hidden = n === game?.size;
    },
  }, el('b', {}, `${n}×${n}`), el('span', {}, T.settings.words(n))));
  const skinButtons = SKINS.map((id) => el('button', {
    class: 'bo-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'bo-swatch', 'data-skin': id }), T.skins[id]));

  openModal(card(T.settings.title,
    el('h3', { class: 'bo-section' }, T.settings.size),
    el('div', { class: 'bo-sizes', role: 'radiogroup' }, sizeButtons),
    note,
    el('h3', { class: 'bo-section' }, T.settings.skin),
    el('div', { class: 'bo-skins', role: 'radiogroup' }, skinButtons),
  ));
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bo-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'boggle',
  title: 'Филворд',

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
      sound: savedSettings?.sound !== false,
    };
    host.dataset.skin = settings.skin;

    const capsules = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    capsules.setAttribute('viewBox', '0 0 100 100');
    capsules.setAttribute('preserveAspectRatio', 'none');
    capsules.classList.add('bo-capsules');

    ui = {
      sub: el('div', { class: 'bo-sub' }),
      found: el('div', { class: 'bo-info-value' }),
      bonusCount: el('span', {}),
      score: el('div', { class: 'bo-info-value' }),
      current: el('div', { class: 'bo-current bo-current-empty' }),
      board: el('div', { class: 'bo-board', onpointerdown: onPointerDown }),
      capsules,
      selection: null,
      cells: [],
      bank: el('div', { class: 'bo-bank' }),
      modal: el('div', { class: 'bo-modal', hidden: true }),
    };
    ui.soundBtn = soundFeature() ? iconButton(ICONS.soundOn, T.soundOn, toggleSound) : null;
    ui.bonusButton = el('button', { class: 'bo-bonus-btn', onclick: showBonus },
      el('div', { class: 'bo-info-label' }, T.info.bonus), el('div', { class: 'bo-info-value' }, '★ ', ui.bonusCount));
    ui.resize = new ResizeObserver(() => syncCapsules());
    ui.resize.observe(ui.board);
    ui.board.addEventListener('pointermove', onPointerMove);
    ui.board.addEventListener('pointerup', onPointerUp);
    ui.board.addEventListener('pointercancel', onPointerUp);

    const infoItem = (label, value) => el('div', { class: 'bo-info-item' }, el('div', { class: 'bo-info-label' }, label), value);
    root = el('div', { class: 'bo' },
      el('div', { class: 'bo-header' },
        el('div', {}, el('div', { class: 'bo-title' }, T.title), ui.sub),
        el('div', { class: 'bo-actions' },
          ui.soundBtn,
          // кнопка «Новая игра» (сбросить уровни) — в бете убрана: смысла в ней нет (владелец, 2026-09-26)
          !api.feature?.('boggle-no-restart') && iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, () => showStats()),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bo-info' }, infoItem(T.info.found, ui.found), ui.bonusButton, infoItem(T.info.score, ui.score)),
      ui.current,
      el('div', { class: 'bo-board-wrap' }, ui.board),
      ui.bank,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    renderSoundBtn();
    renderInfo();

    await startGame(isValidState(savedGame) && !isComplete(savedGame) ? savedGame : null);
  },

  getState() {
    if (!game || finished || (!game.found.length && !game.bonus.length)) return null;
    save();
    return { size: game.size };
  },

  destroy() {
    save();
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    ui?.resize?.disconnect();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = game = null;
    pointerId = null;
    selection = [];
    finished = modalActive = false;
  },
};
