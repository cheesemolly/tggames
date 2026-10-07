// «Кростик» — спрятанная фраза и вопросы к ней. У каждой клетки номер: одинаковый номер — одинаковая буква.
// Выбираешь клетку, называешь букву: угадал — она встаёт во все клетки с этим номером (и в ответах, и во фразе),
// ошибся — минус попытка. Ответил на вопросы — фраза открылась. Пять ошибок — уровень начинается заново.
// Страница (фраза и вопросы) прокручивается, внизу — строка текущего вопроса и своя клавиатура.
// Уровни (levels.json) грузятся один раз на страницу. Прогресс, монеты, начатый уровень и настройки — в api.storage.
// С компьютера: буквы — с клавиатуры, стрелки — по клеткам, Tab и Enter — следующий вопрос.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import {
  MAX_MISTAKES, HINT_COST, ALPHABET, KEY_ROWS,
  norm, parseLevel, numberOf, groupsOf, levelText, newState, isValidState, isOpen, isDone, isFailed, livesLeft,
  groupDone, guess, reveal, nextHidden, stepCell, starsFor, reward,
  emptyProgress, migrateProgress, spend, emptyStats, migrateStats, plural,
} from './logic.js';

const SKINS = ['telegram', 'notebook', 'chalk', 'kraft', 'night', 'candy'];
const MARKERS = 6;                 // цветов клеток в скине: --cr-m1 … --cr-m6 (цвет — по номеру клетки)
const GAP = 2;                     // зазор между клетками, px (как в game.css)
const STICKY_ROOM = 150;           // столько px страницы должно оставаться вопросам под закреплённой фразой

const T = {
  title: 'Кростик',
  level: (n) => `Уровень ${n}`,
  loading: 'Загружаю уровни…',
  loadError: 'Не удалось загрузить уровни',
  retry: 'Повторить',
  phrase: 'Фраза',
  phraseNote: 'Спрятанная фраза — её буквы открываются ответами',
  questions: 'Вопросы',
  tip: 'Выберите клетку и назовите букву. Одинаковый номер — одинаковая буква.',
  hint: `Открыть букву за ${HINT_COST} монет`,
  noCell: 'Сначала выберите закрытую клетку',
  noCoins: 'Не хватает монет',
  lives: (n) => `Попыток: ${n}`,
  coins: (n) => `Монет: ${n}`,
  prev: 'Предыдущий вопрос',
  next: 'Следующий вопрос',
  cell: (num, letter) => (letter ? `Клетка ${num}: ${letter}` : `Клетка ${num}, закрыта`),
  praise: ['', 'Уровень пройден', 'Хорошо!', 'Отлично!'],
  passed: (n) => `Уровень ${n} пройден`,
  faults: (m, h) => [m ? `${m} ${plural(m, ['ошибка', 'ошибки', 'ошибок'])}` : '', h ? `${h} ${plural(h, ['подсказка', 'подсказки', 'подсказок'])}` : '']
    .filter(Boolean).join(' · ') || 'без ошибок и подсказок',
  onward: 'Дальше',
  failed: 'Попытки кончились',
  failNote: `${MAX_MISTAKES} ошибок — уровень начинается заново`,
  again: 'Заново',
  close: 'Закрыть',
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', notebook: 'Тетрадь', chalk: 'Мел', kraft: 'Крафт', night: 'Ночь', candy: 'Леденцы' },
  stats: { levels: 'Пройдено уровней', perfect: 'Из них без ошибок', mistakes: 'Ошибок', hints: 'Подсказок', fails: 'Уровней заново' },
  rules: [
    'Наверху спрятана фраза — пословица, крылатая строка или любопытный факт. Ниже — вопросы с ответами в клетках.',
    'Под каждой клеткой номер. Одинаковый номер — одинаковая буква: и во фразе, и во всех ответах.',
    'Выберите клетку и назовите букву. Угадали — она встанет во все клетки с этим номером. Так каждый ответ открывает буквы фразы и других слов.',
    `Ошиблись — сгорает попытка. Попыток ${MAX_MISTAKES}: кончились — уровень начинается заново.`,
    `Лампочка открывает букву в выбранной клетке за ${HINT_COST} монет. Монеты дают за пройденные уровни: чем меньше ошибок и подсказок, тем больше.`,
  ],
};

const svgIcon = (body, fill = false, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>', false, 20),
  left: svgIcon('<path d="m14.5 6-6 6 6 6"/>'),
  right: svgIcon('<path d="m9.5 6 6 6-6 6"/>'),
  check: svgIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>', false, 18),
  heart: svgIcon('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/>', true, 15),
  star: svgIcon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>', true),
  coin: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M9.6 9.7c0-1 1-1.7 2.4-1.7s2.4.7 2.4 1.7c0 2.4-4.8 1.6-4.8 4.1 0 1 1 1.7 2.4 1.7s2.4-.7 2.4-1.7" fill="none" stroke="var(--cr-coin-ink, #7a4b00)" stroke-width="1.6" stroke-linecap="round"/>', true, 18),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('crdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let levels = null;                 // строки уровней из levels.json
let levelsPromise = null;
let progress = emptyProgress();
let stats = emptyStats();
let settings = { skin: 'telegram' };
let n = 1;                         // номер уровня на экране
let level = null;
let groups = [];                   // слова фразы и ответы — группы клеток
let state = null;
let cursor = null;                 // выбранная клетка: { g, i }
let cells = [];                    // клетки страницы: { node, letter, g, i, ch, num }
let cellAt = new Map();            // 'g:i' → клетка
let keys = new Map();              // буква → клавиша
let finished = false;              // уровень пройден или провален — ввод закрыт
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let resizeWatch = null;
// звуки — один AudioContext на страницу, заводится при первом звуке
const audio = createAudio(createSounds);
const timers = new Set();

function sfx(name, opts) {
  if (!soundOn) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function later(fn, ms) {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      timers.delete(id);
      resolve(fn?.());
    }, ms);
    timers.add(id);
  });
}

function loadLevels() {
  levelsPromise ??= fetch(new URL('./levels.json', import.meta.url))
    .then((res) => {
      if (!res.ok) throw new Error(`уровни: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data?.levels) || !data.levels.length) throw new Error('уровни: пусто');
      return data.levels;
    })
    .catch((err) => {
      levelsPromise = null;
      throw err;
    });
  return levelsPromise;
}

const saveProgress = () => api?.storage.set('progress', progress);
const saveStats = () => api?.storage.set('stats', stats);
const playing = () => Boolean(level && state && !finished && !modalActive);
const cursorCell = () => (cursor ? cellAt.get(`${cursor.g}:${cursor.i}`) ?? null : null);
const reportProgress = () => api?.progress(progress.level > 1 ? T.level(progress.level) : null);

/** Начатый уровень сохраняется, как только в нём что-то сделано. */
function saveState() {
  if (!state || finished) return;
  if (state.open.length > level.start.length || state.mistakes || state.hints) api?.storage.set('current', state);
}

// ---------- страница уровня ----------

const POP_IN = [{ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1.25, offset: 0.6 }, { opacity: 1, scale: 1 }];
const BUMP = [{ scale: 1 }, { scale: 1.2 }, { scale: 1 }];

function cellNode(g, i, ch, cls) {
  const num = numberOf(level, ch);
  // буква — отдельным слоем: когда она открывается сразу в нескольких клетках, буквы «впрыгивают» по очереди,
  // а сами клетки при этом никуда не пропадают
  const letter = el('span', {});
  const node = el('button', { class: `cr-cell ${cls}`, 'data-g': g, 'data-i': i }, el('b', {}, letter), el('i', {}, String(num)));
  node.style.setProperty('--m', `var(--cr-m${((num - 1) % MARKERS) + 1})`);
  const rec = { node, letter, g, i, ch, num };
  cells.push(rec);
  cellAt.set(`${g}:${i}`, rec);
  return node;
}

function buildPage() {
  cells = [];
  cellAt = new Map();
  ui.phrase.replaceChildren(...level.words.map((word, g) => {
    let i = 0;
    return el('span', { class: 'cr-word' },
      word.before ? el('span', { class: 'cr-mark' }, word.before) : null,
      word.cells.map((c) => (c.ch ? cellNode(g, i++, c.ch, 'cr-pcell') : el('span', { class: 'cr-dash' }, c.mark))),
      word.after ? el('span', { class: 'cr-mark' }, word.after.trim()) : null,
    );
  }));
  ui.clues.replaceChildren(...level.clues.map((clue, k) => {
    const g = level.words.length + k;
    const check = el('i', { class: 'cr-check' });
    check.innerHTML = ICONS.check;
    return el('div', { class: 'cr-clue', 'data-g': g },
      el('div', { class: 'cr-q' }, el('span', { class: 'cr-q-num' }, String(k + 1)), el('span', { class: 'cr-q-text' }, clue.text), check),
      el('div', { class: 'cr-answer' }, [...clue.answer].map((ch, i) => cellNode(g, i, ch, 'cr-acell'))),
    );
  }));
  ui.clueRows = [...ui.clues.children];
  fit();
}

/** Размер клеток — чтобы самое длинное слово фразы и самый длинный ответ помещались в строку. */
function fit() {
  if (!ui || !level) return;
  const inner = ui.sheet.clientWidth - 24;
  if (inner < 80) return;
  const size = (count, max) => Math.max(17, Math.min(max, Math.floor((inner - 8 - (count - 1) * GAP) / count)));
  root.style.setProperty('--cr-cell', `${size(Math.max(9, ...level.words.map((w) => w.cells.length)), 30)}px`);
  root.style.setProperty('--cr-acell', `${size(Math.max(9, ...level.clues.map((c) => c.answer.length)), 30)}px`);
  // фраза остаётся на виду, пока листаешь вопросы, — если под ней хватает места на вопрос с ответом
  ui.sheet.classList.remove('cr-sticky');
  const top = ui.top.offsetHeight;
  const sticky = ui.page.clientHeight - top >= STICKY_ROOM;
  ui.sheet.classList.toggle('cr-sticky', sticky);
  root.style.setProperty('--cr-top-h', sticky ? `${top}px` : '0px');
}

function renderLives() {
  const left = livesLeft(state ?? { mistakes: 0 });
  ui.lives.setAttribute('aria-label', T.lives(left));
  [...ui.lives.children].forEach((node, k) => node.classList.toggle('cr-heart-off', k >= left));
}

function renderCoins() {
  ui.coins.textContent = String(progress.coins);
  ui.coinsPill.setAttribute('aria-label', T.coins(progress.coins));
}

function renderBar() {
  const group = cursor ? groups[cursor.g] : null;
  const clue = group?.zone === 'clue' ? level.clues[group.index] : null;
  ui.barNum.textContent = clue ? String(group.index + 1) : '';
  ui.barNum.hidden = !clue;
  ui.barText.textContent = clue ? clue.text : T.phraseNote;
  ui.bar.classList.toggle('cr-bar-phrase', !clue);
}

/** Привести страницу к состоянию: открытые буквы, выбранная клетка, клетки с тем же номером, клавиши. */
function paint() {
  const cur = cursorCell();
  for (const c of cells) {
    const open = isOpen(state, c.ch);
    c.node.classList.toggle('cr-open', open);
    c.letter.textContent = open ? c.ch.toUpperCase() : '';
    c.node.classList.toggle('cr-sel', c === cur);
    c.node.classList.toggle('cr-same', Boolean(cur) && c !== cur && c.num === cur.num && !open);
    c.node.setAttribute('aria-label', T.cell(c.num, open ? c.ch.toUpperCase() : ''));
  }
  ui.clueRows.forEach((row, k) => {
    const g = level.words.length + k;
    row.classList.toggle('cr-solved', groupDone(groups[g], state));
    row.classList.toggle('cr-active', cursor?.g === g);
  });
  ui.phrase.classList.toggle('cr-active', Boolean(cursor) && groups[cursor.g]?.zone === 'phrase');
  for (const [ch, key] of keys) key.classList.toggle('cr-used', isOpen(state, ch));
  ui.hintBtn.classList.toggle('cr-dim', !cur || isOpen(state, cur.ch) || progress.coins < HINT_COST);
  // на первых двух уровнях, пока ничего не названо, под заголовком «Вопросы» — подсказка, что делать
  ui.tip.classList.toggle('cr-tip-off', n > 2 || state.open.length > level.start.length || state.mistakes > 0);
  renderLives();
  renderCoins();
  renderBar();
}

function reveal1(node, delay = 0) {
  if (reducedMotion()) return;
  animate(node, POP_IN, { duration: 300, delay, easing: 'ease-out', fill: 'backwards' });
}

/** Прокрутить страницу так, чтобы выбранная клетка (и весь её вопрос) была видна. */
function showCursor() {
  const cell = cursorCell();
  const target = cell?.node.closest('.cr-clue') ?? cell?.node;
  target?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function select(pos, { quiet = false, scroll = true } = {}) {
  if (!pos || !groups[pos.g] || pos.i < 0 || pos.i >= groups[pos.g].letters.length) return;
  cursor = { g: pos.g, i: pos.i };
  if (!quiet) sfx('select');
  paint();
  if (scroll) showCursor();
}

/** К соседнему вопросу (dir = ±1): его первая закрытая клетка. */
function moveClue(dir) {
  if (!playing()) return;
  const first = level.words.length;
  const count = level.clues.length;
  const here = cursor && groups[cursor.g].zone === 'clue' ? cursor.g - first : dir > 0 ? -1 : count;
  for (let k = 1; k <= count; k++) {
    const g = first + ((((here + dir * k) % count) + count) % count);
    const i = groups[g].letters.findIndex((ch) => !isOpen(state, ch));
    if (i >= 0) {
      select({ g, i });
      return;
    }
  }
}

// ---------- ввод ----------

/** Буква открылась (угадана или подсказана): она встаёт во все клетки с её номером. */
function opened(cell, viaHint) {
  const same = cells.filter((c) => c.ch === cell.ch);
  const order = [cell, ...same.filter((c) => c !== cell)];
  const solved = [];
  ui.clueRows.forEach((row, k) => {
    const g = level.words.length + k;
    if (!row.classList.contains('cr-solved') && groupDone(groups[g], state)) solved.push(row);
  });
  sfx(viaHint ? 'hint' : 'hit', { step: same.length });
  api.platform.haptic.impact(solved.length ? 'medium' : 'light');
  saveState();
  const done = isDone(level, state);
  const next = done ? null : nextHidden(groups, state, cursor);
  if (next) cursor = next;
  paint();
  order.forEach((c, k) => {
    reveal1(c.letter, Math.min(k * 45, 500));
    c.node.classList.add('cr-flash');
    later(() => c.node.classList.remove('cr-flash'), 650);
  });
  if (solved.length) {
    later(() => sfx('word'), 140);
    if (!reducedMotion()) {
      for (const row of solved) animate(row.querySelector('.cr-check'), POP_IN, { duration: 360, delay: 120, easing: 'ease-out', fill: 'backwards' });
    }
  }
  if (done) {
    completeLevel();
    return;
  }
  if (next) showCursor();
}

function missed(cell, letter) {
  stats.mistakes += 1;
  saveStats();
  saveState();
  sfx('miss');
  api.platform.haptic.notification('error');
  shake(cell.node, { distance: 5, duration: 320 });
  const key = keys.get(norm(letter));
  if (key) {
    key.classList.add('cr-key-miss');
    later(() => key.classList.remove('cr-key-miss'), 480);
  }
  renderLives();
  const lost = ui.lives.children[livesLeft(state)];
  if (lost && !reducedMotion()) animate(lost, [{ scale: 1.5 }, { scale: 1 }], { duration: 320, easing: 'ease-out' });
  if (isFailed(state)) failLevel();
}

/** Игрок назвал букву для выбранной клетки. */
function type(letter) {
  if (!playing()) return;
  const cell = cursorCell();
  if (!cell) {
    select(nextHidden(groups, state, null));
    return;
  }
  const res = guess(level, state, cell.num, letter);
  if (res.kind === 'hit') opened(cell, false);
  else if (res.kind === 'miss') missed(cell, letter);
  else if (isOpen(state, cell.ch)) select(nextHidden(groups, state, cursor), { quiet: true });
}

function onHint() {
  if (!playing()) return;
  const cell = cursorCell();
  if (!cell || isOpen(state, cell.ch)) {
    toast.show(T.noCell, 1600);
    return;
  }
  if (!spend(progress, HINT_COST)) {
    toast.show(T.noCoins, 1600);
    sfx('miss');
    shake(ui.coinsPill, { distance: 4, duration: 300 });
    return;
  }
  reveal(level, state, cell.num);
  stats.hints += 1;
  saveProgress();
  saveStats();
  if (!reducedMotion()) animate(ui.coinsPill, BUMP, { duration: 260, easing: 'ease-out' });
  opened(cell, true);
}

function onPageTap(e) {
  if (!playing()) return;
  const node = e.target.closest('.cr-cell');
  if (node) {
    select({ g: Number(node.dataset.g), i: Number(node.dataset.i) }, { scroll: false });
    return;
  }
  const row = e.target.closest('.cr-clue');
  if (!row) return;
  const g = Number(row.dataset.g);
  const i = groups[g].letters.findIndex((ch) => !isOpen(state, ch));
  select({ g, i: Math.max(0, i) }, { scroll: false });
}

function onKeysTap(e) {
  const key = e.target.closest('.cr-key');
  if (!key || key.classList.contains('cr-hint-key')) return;
  type(key.dataset.ch);
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    return;
  }
  if (!playing() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    select(stepCell(groups, cursor, e.key === 'ArrowLeft' ? -1 : 1));
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    moveClue(e.key === 'ArrowUp' ? -1 : 1);
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    moveClue(e.shiftKey ? -1 : 1);
  } else if (e.key.length === 1 && ALPHABET.includes(norm(e.key))) {
    e.preventDefault();
    type(e.key);
  }
}

// ---------- уровень ----------

/** Показать уровень num (resume — сохранённое состояние этого уровня). */
function startLevel(num, resume = null) {
  n = num;
  level = parseLevel(levelText(levels, n));
  groups = groupsOf(level);
  state = isValidState(resume, level, n) ? { ...resume } : newState(n, level);
  finished = false;
  ui.result.hidden = true;
  ui.result.replaceChildren();
  ui.levelLabel.textContent = T.level(n);
  ui.source.textContent = T.phrase;
  buildPage();
  cursor = nextHidden(groups, state, null);
  paint();
  ui.page.scrollTop = 0;
  if (!reducedMotion()) animate(ui.sheet, [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 280, easing: 'ease-out' });
  // на невысоком экране первый вопрос не помещается под фразой — страница подъезжает к нему сама
  const started = state;
  later(() => ui && state === started && !finished && showCursor(), reducedMotion() ? 0 : 700);
}

function overlay(...children) {
  const card = el('div', { class: 'cr-result-card' }, ...children);
  ui.result.replaceChildren(card);
  showLayer(ui.result);
  if (!reducedMotion()) animate(card, [{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }], { duration: 260, easing: 'ease-out' });
}

function completeLevel() {
  finished = true;
  const stars = starsFor(state.mistakes, state.hints);
  const gain = reward(stars);
  const passed = n;
  progress.level = Math.max(progress.level, n + 1);
  progress.coins += gain;
  stats.levels += 1;
  if (stars === 3) stats.perfect += 1;
  saveProgress();
  saveStats();
  api.storage.remove('current');
  reportProgress();
  // фраза открыта — по ней пробегает волна, потом итог
  const phraseCells = cells.filter((c) => groups[c.g].zone === 'phrase');
  const step = Math.min(30, 640 / Math.max(1, phraseCells.length));
  if (!reducedMotion()) {
    phraseCells.forEach((c, k) => animate(c.node, [{ translate: '0 0' }, { translate: '0 -7px', offset: 0.4 }, { translate: '0 0' }],
      { duration: 380, delay: 260 + k * step, easing: 'ease-out' }));
  }
  ui.page.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  later(() => {
    if (!ui) return;
    sfx('win');
    api.platform.haptic.notification('success');
    const starNodes = [0, 1, 2].map(() => {
      const s = el('i', {});
      s.innerHTML = ICONS.star;
      return s;
    });
    const coin = el('i', { class: 'cr-coin' });
    coin.innerHTML = ICONS.coin;
    overlay(
      el('div', { class: 'cr-stars', 'aria-label': `${stars} из 3` }, starNodes),
      el('h2', {}, T.praise[stars]),
      el('p', { class: 'cr-note' }, `${T.passed(passed)} · ${T.faults(state.mistakes, state.hints)}`),
      el('figure', { class: 'cr-quote' }, el('blockquote', {}, level.phrase), el('figcaption', {}, level.source)),
      el('div', { class: 'cr-gain' }, coin, el('b', {}, `+${gain}`)),
      el('div', { class: 'cr-result-actions' }, el('button', { class: 'btn', onclick: () => {
        sfx('click');
        startLevel(progress.level);
      } }, T.onward)),
    );
    renderCoins();
    starNodes.slice(0, stars).forEach((s, k) => later(() => {
      if (!ui) return;
      s.classList.add('cr-star-on');
      sfx('star', { step: k });
      if (!reducedMotion()) animate(s, POP_IN, { duration: 320, easing: 'ease-out' });
    }, reducedMotion() ? 0 : 320 + k * 300));
  }, reducedMotion() ? 0 : 1050);
}

function failLevel() {
  finished = true;
  stats.fails += 1;
  saveStats();
  api.storage.remove('current');
  later(() => {
    if (!ui) return;
    sfx('fail');
    api.platform.haptic.notification('warning');
    const heart = el('i', { class: 'cr-broken' });
    heart.innerHTML = ICONS.heart;
    overlay(
      heart,
      el('h2', {}, T.failed),
      el('p', { class: 'cr-note' }, T.failNote),
      el('div', { class: 'cr-result-actions' }, el('button', { class: 'btn', onclick: () => {
        sfx('click');
        startLevel(n);
      } }, T.again)),
    );
  }, reducedMotion() ? 0 : 520);
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

function sheet(title, ...children) {
  return el('div', { class: 'cr-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'cr-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'cr-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showHelp() {
  openModal(sheet(T.help.title, T.rules.map((text) => el('p', { class: 'cr-rule' }, text))));
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'cr-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      sfx('select');
    },
  }, el('span', { class: 'cr-swatch', 'data-skin': id }, ['А', 'Б', 'В'].map((ch, k) => el('i', { class: `cr-swatch-${k + 1}` }, ch))), T.skins[id]));
  openModal(sheet(T.settings.title,
    el('h3', { class: 'cr-section' }, T.settings.skin),
    el('div', { class: 'cr-skins', role: 'radiogroup' }, buttons),
    el('h3', { class: 'cr-section' }, T.settings.stats),
    el('dl', { class: 'cr-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, stats[k])])),
    pointsInfo(api, 'crostic'),
  ));
}

function iconButton(icon, label, onclick, cls = 'cr-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('cr-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

/** Уровни не загрузились — сообщение и «Повторить». → загружены ли. */
async function loadAll() {
  ui.load.replaceChildren(el('p', {}, T.loading));
  ui.load.hidden = false;
  try {
    levels = await loadLevels();
    if (ui) ui.load.hidden = true;
    return true;
  } catch (err) {
    console.warn(err);
    if (!ui) return false;
    ui.load.replaceChildren(el('p', {}, T.loadError), el('button', { class: 'btn', onclick: async () => {
      if (await loadAll() && api) startLevel(progress.level);
    } }, T.retry));
    return false;
  }
}

// ---------- отладка (?crdebug) ----------

function debugHooks() {
  globalThis.__crostic = {
    get n() { return n; },
    get level() { return level; },
    get state() { return state; },
    get progress() { return progress; },
    get cursor() { return cursor; },
    get finished() { return finished; },
    get total() { return levels?.length ?? 0; },
    /** Буква клетки под курсором (ответ). */
    answer: () => cursorCell()?.ch ?? null,
    select: (g, i) => select({ g, i }),
    type: (letter) => type(letter),
    /** Назвать верную букву выбранной клетки. → буква или null. */
    hit() {
      const ch = cursorCell()?.ch ?? null;
      if (ch) type(ch);
      return ch;
    },
    /** Ошибиться: назвать букву, которой в выбранной клетке нет. */
    miss() {
      const cell = cursorCell();
      const wrong = [...ALPHABET].find((ch) => ch !== cell?.ch && !isOpen(state, ch));
      if (wrong) type(wrong);
    },
    /** Ответить на вопрос k (с нуля) — по букве. */
    solveClue(k) {
      const g = level.words.length + k;
      groups[g].letters.forEach((ch, i) => {
        if (!finished && !isOpen(state, ch)) {
          select({ g, i }, { quiet: true });
          type(ch);
        }
      });
    },
    hint: onHint,
    goto(num) {
      progress.level = Math.max(1, Math.floor(num));
      saveProgress();
      api.storage.remove('current');
      reportProgress();
      startLevel(progress.level);
    },
    coins(amount) {
      progress.coins = amount;
      saveProgress();
      paint();
    },
  };
}

export default {
  id: 'crostic',
  title: 'Кростик',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    ui = {
      levelLabel: el('b', { class: 'cr-level' }, T.title),
      lives: el('span', { class: 'cr-lives', role: 'img' }),
      coins: el('b', {}),
      source: el('span', { class: 'cr-tag' }, T.phrase),
      phrase: el('div', { class: 'cr-phrase' }),
      clues: el('div', { class: 'cr-clues' }),
      clueRows: [],
      barNum: el('span', { class: 'cr-q-num', hidden: true }),
      barText: el('span', { class: 'cr-bar-text' }),
      keys: el('div', { class: 'cr-keys' }),
      tip: el('p', { class: 'cr-tip cr-tip-off' }, T.tip),
      result: el('div', { class: 'cr-result', hidden: true }),
      modal: el('div', { class: 'cr-modal', hidden: true }),
      load: el('div', { class: 'cr-load' }, el('p', {}, T.loading)),
    };
    for (let k = 0; k < MAX_MISTAKES; k++) {
      const heart = el('i', { class: 'cr-heart' });
      heart.innerHTML = ICONS.heart;
      ui.lives.append(heart);
    }
    const coin = el('i', { class: 'cr-coin' });
    coin.innerHTML = ICONS.coin;
    ui.coinsPill = el('span', { class: 'cr-coins' }, coin, ui.coins);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    ui.top = el('div', { class: 'cr-top' }, el('div', { class: 'cr-caption' }, ui.source), ui.phrase);
    ui.sheet = el('div', { class: 'cr-sheet' },
      ui.top,
      el('div', { class: 'cr-caption cr-caption-q' }, el('span', { class: 'cr-tag' }, T.questions)),
      ui.tip,
      ui.clues,
    );
    ui.page = el('div', { class: 'cr-page' }, ui.sheet);
    ui.bar = el('div', { class: 'cr-bar' },
      iconButton(ICONS.left, T.prev, () => moveClue(-1), 'cr-bar-btn'),
      el('div', { class: 'cr-bar-mid' }, ui.barNum, ui.barText),
      iconButton(ICONS.right, T.next, () => moveClue(1), 'cr-bar-btn'),
    );
    ui.hintBtn = el('button', { class: 'cr-key cr-hint-key', 'aria-label': T.hint, title: T.hint, onclick: onHint });
    ui.hintBtn.innerHTML = `${ICONS.bulb}<span>${HINT_COST}</span>`;
    keys = new Map();
    KEY_ROWS.forEach((row, r) => {
      const line = el('div', { class: 'cr-key-row' }, [...row].map((ch) => {
        const key = el('button', { class: 'cr-key', 'data-ch': ch }, ch.toUpperCase());
        keys.set(ch, key);
        return key;
      }));
      if (r === KEY_ROWS.length - 1) line.append(ui.hintBtn);
      ui.keys.append(line);
    });
    ui.keys.addEventListener('click', onKeysTap);
    ui.page.addEventListener('click', onPageTap);

    root = el('div', { class: 'cr' },
      el('div', { class: 'cr-header' },
        el('div', { class: 'cr-heading' }, ui.levelLabel, ui.lives),
        el('div', { class: 'cr-actions' },
          ui.coinsPill,
          ui.soundBtn,
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      ui.page,
      el('div', { class: 'cr-dock' }, ui.bar, ui.keys),
      ui.load,
      ui.result,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();

    const [savedProgress, savedState, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('progress'), api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = migrateProgress(savedProgress);
    stats = migrateStats(savedStats);
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;
    renderSoundBtn();
    renderCoins();
    reportProgress();
    document.addEventListener('keydown', onKeydown);
    if (typeof ResizeObserver === 'function') {
      resizeWatch = new ResizeObserver(fit);
      resizeWatch.observe(ui.page);
    }
    if (isDebug()) debugHooks();
    const ready = await loadAll();
    if (!api || !ready) return;
    startLevel(progress.level, savedState);
  },

  getState() {
    saveState();
    return state && !finished && (state.open.length > level.start.length || state.mistakes || state.hints) ? { level: n } : null;
  },

  destroy() {
    saveState();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    resizeWatch?.disconnect();
    toast?.dispose();
    root?.remove();
    if (globalThis.__crostic) delete globalThis.__crostic;
    api = host = root = ui = toast = level = state = cursor = resizeWatch = null;
    groups = [];
    cells = [];
    cellAt = new Map();
    keys = new Map();
    finished = modalActive = false;
    n = 1;
    progress = emptyProgress();
    stats = emptyStats();
    settings = { skin: 'telegram' };
  },
};
