// Wordle на трёх языках: EN (Wordle), UA (Словко), RU (Вордли). Язык — переключатель справа вверху.
// Весь интерфейс партии — на её языке (i18n.js), включая экран результата оболочки (result.locale).
// У каждого языка своя незаконченная партия и своя статистика; всё хранится в api.storage игры:
//   'boards' — lang → доска | null, 'stats' — lang → статистика, 'lang' — выбранный язык.
// Поэтому «Ещё раз» после партии на одном языке не стирает партии на других.
// Ввод — своя экранная клавиатура + физическая (keydown), системная клавиатура телефона не нужна.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { LANGUAGES, LANG_ORDER, defaultLang, toLetter } from './languages.js';
import { TEXT } from './i18n.js';
import {
  WORD_LEN, MAX_TRIES,
  score, keyStatuses, checkGuess, getStatus, newBoard, getScore, isValidBoard,
  emptyStats, recordGame, isValidStats, shareText,
} from './logic.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLIP_MS = 450;
const FLIP_STEP_MS = 250;
const REVEAL_MS = reduceMotion ? 0 : FLIP_STEP_MS * (WORD_LEN - 1) + FLIP_MS;

const STATS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">'
  + '<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/>'
  + '<rect x="17" y="3" width="4" height="18" rx="1"/></svg>';

// Словари — кэш данных, а не состояние партии: переживает destroy(), чтобы не качать заново.
const dictCache = new Map();

function loadDict(lang) {
  if (!dictCache.has(lang)) {
    const promise = fetch(LANGUAGES[lang].words)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(({ answers, allowed }) => ({ answers, allowed: new Set([...answers, ...allowed]) }));
    promise.catch(() => dictCache.delete(lang));   // следующая попытка скачает заново
    dictCache.set(lang, promise);
  }
  return dictCache.get(lang);
}

let api = null;
let root = null;
let ui = null;
let boards = {};        // lang → доска | null
let stats = {};         // lang → статистика
let lastWin = null;     // { lang, tries } — подсветить строку в распределении
let lang = null;
let dict = null;        // словарь текущего языка, null — пока грузится
let typed = '';
let revealing = false;  // идёт анимация хода — ввод и смена языка заблокированы
let loadToken = 0;
let toast = null;
let statsOpen = false;
const timers = new Set();

const t = () => TEXT[lang];

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function canPlay() {
  return Boolean(api && dict && !revealing && !statsOpen
    && boards[lang] && getStatus(boards[lang]) === 'playing');
}

// ---------- отрисовка ----------

function renderHeader() {
  const board = boards[lang];
  root.lang = LANGUAGES[lang].locale;
  ui.title.textContent = LANGUAGES[lang].title;
  // идёт партия — номер текущей попытки; кончилась — сколько ходов сделано
  const attempt = board && (getStatus(board) === 'playing' ? board.guesses.length + 1 : board.guesses.length);
  ui.sub.textContent = board && dict ? t().attempt(attempt, MAX_TRIES) : t().loading;
  ui.statsButton.setAttribute('aria-label', t().stats.open);
  ui.statsButton.title = t().stats.open;
  ui.langs.setAttribute('aria-label', t().language);
  for (const [id, button] of Object.entries(ui.langButtons)) {
    button.setAttribute('aria-pressed', String(id === lang));
  }
}

function tile(ch, cls, i) {
  return el('div', { class: `wd-tile ${cls}`, style: `--i: ${i}` }, ch);
}

/** revealRow — строка, которая сейчас переворачивается (только что сделанный ход). */
function renderBoard(revealRow = -1) {
  const board = boards[lang];
  const current = [...typed];
  const rows = [];
  for (let r = 0; r < MAX_TRIES; r++) {
    const guess = board?.guesses[r];
    let tiles;
    if (guess) {
      const marks = score(guess, board.secret);
      tiles = [...guess].map((ch, i) => tile(ch, `wd-${marks[i]}`, i));
    } else if (board && r === board.guesses.length) {
      tiles = Array.from({ length: WORD_LEN }, (_, i) => tile(current[i] ?? '', current[i] ? 'wd-filled' : '', i));
    } else {
      tiles = Array.from({ length: WORD_LEN }, (_, i) => tile('', '', i));
    }
    rows.push(el('div', { class: r === revealRow ? 'wd-row wd-reveal' : 'wd-row' }, tiles));
  }
  ui.board.replaceChildren(...rows);
}

/** upto — сколько ходов учитывать в цветах клавиш (во время анимации последний ещё не раскрыт). */
function renderKeyboard(upto) {
  const cfg = LANGUAGES[lang];
  const board = boards[lang];
  const statuses = board ? keyStatuses(board.secret, board.guesses.slice(0, upto)) : new Map();
  // Ширина клавиши — от самого длинного ряда; в нижнем ряду ещё ↵ и ⌫ по 1,5 клавиши.
  const cols = Math.max(...cfg.rows.slice(0, -1).map((r) => [...r].length), [...cfg.rows.at(-1)].length + 3);
  ui.keyboard.style.setProperty('--cols', cols);

  const keep = (e) => e.preventDefault();   // клавиши не забирают фокус
  ui.keyboard.replaceChildren(...cfg.rows.map((row, index) => {
    const keys = [...row].map((ch) => el('button', {
      class: `wd-key ${statuses.has(ch) ? `wd-${statuses.get(ch)}` : ''}`,
      onmousedown: keep,
      onclick: () => onLetter(ch),
    }, ch));
    if (index === cfg.rows.length - 1) {
      keys.unshift(el('button', { class: 'wd-key wd-key-wide', 'aria-label': t().enter, onmousedown: keep, onclick: submit }, '↵'));
      keys.push(el('button', { class: 'wd-key wd-key-wide', 'aria-label': t().erase, onmousedown: keep, onclick: backspace }, '⌫'));
    }
    return el('div', { class: 'wd-kb-row' }, keys);
  }));
}

function renderAll() {
  renderHeader();
  renderBoard();
  renderKeyboard(boards[lang]?.guesses.length ?? 0);
}

function showToast(text) {
  toast.show(text);
}

/** Буква «впрыгивает» в клетку. */
function popTile(row, col) {
  const tileEl = ui.board.children[row]?.children[col];
  if (tileEl) {
    animate(tileEl, [
      { transform: 'scale(0.85)' },
      { transform: 'scale(1.12)', offset: 0.4 },
      { transform: 'scale(1)' },
    ], { duration: 120, easing: 'ease-out' });
  }
}

/** Угаданная строка подпрыгивает по буквам. Возвращает длительность, мс. */
function bounceRow(row) {
  if (reducedMotion()) return 0;
  [...ui.board.children[row].children].forEach((tileEl, i) => animate(tileEl, [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-32%)', offset: 0.4 },
    { transform: 'translateY(6%)', offset: 0.65 },
    { transform: 'translateY(0)' },
  ], { duration: 500, delay: i * 100, easing: 'ease-out' }));
  return (WORD_LEN - 1) * 100 + 500 + 250;
}

// ---------- статистика ----------

function openStats() {
  const s = stats[lang];
  const tx = t().stats;
  const winRate = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  const maxDist = Math.max(1, ...s.dist);
  const highlight = lastWin?.lang === lang ? lastWin.tries : null;

  const number = (value, label) => el('div', { class: 'wd-stat' },
    el('div', { class: 'wd-stat-value' }, value),
    el('div', { class: 'wd-stat-label' }, label),
  );

  ui.stats.replaceChildren(el('div', { class: 'wd-stats-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': tx.title },
    el('div', { class: 'wd-stats-head' },
      el('h2', {}, `${tx.title} · ${LANGUAGES[lang].title}`),
      el('button', { class: 'wd-icon-btn', 'aria-label': tx.close, title: tx.close, onclick: closeStats }, '✕'),
    ),
    el('div', { class: 'wd-stats-row' },
      number(s.played, tx.played),
      number(winRate, tx.winRate),
      number(s.streak, tx.streak),
      number(s.maxStreak, tx.maxStreak),
    ),
    el('h3', {}, tx.dist),
    el('div', { class: 'wd-dist' }, s.dist.map((count, i) => el('div', { class: 'wd-dist-row' },
      el('span', { class: 'wd-dist-label' }, i + 1),
      el('span', {
        class: i + 1 === highlight ? 'wd-dist-bar wd-dist-last' : 'wd-dist-bar',
        style: `width: ${Math.max(8, (count / maxDist) * 100)}%`,
      }, count),
    ))),
  ));
  statsOpen = true;
  showLayer(ui.stats);
  // Столбики распределения вырастают слева направо, по очереди.
  ui.stats.querySelectorAll('.wd-dist-bar').forEach((bar, i) => animate(bar, [
    { transform: 'scaleX(0)' },
    { transform: 'scaleX(1)' },
  ], { duration: 450, delay: 120 + i * 50, easing: EASE_OUT, fill: 'backwards' }));
}

function closeStats() {
  statsOpen = false;
  hideLayer(ui.stats, () => !statsOpen);
}

// ---------- ввод ----------

function onLetter(ch) {
  if (!canPlay() || [...typed].length >= WORD_LEN) return;
  typed += ch;
  api.platform.haptic.impact('light');
  renderBoard();
  popTile(boards[lang].guesses.length, [...typed].length - 1);
}

function backspace() {
  if (!canPlay() || !typed) return;
  typed = [...typed].slice(0, -1).join('');
  renderBoard();
}

function reject(code) {
  api.platform.haptic.notification('error');
  showToast(t().errors[code]);
  const row = ui.board.children[boards[lang].guesses.length];
  if (row) shake(row);
}

function submit() {
  if (!canPlay()) return;
  const board = boards[lang];
  const error = checkGuess(board, typed, dict.allowed);
  if (error) return reject(error);

  const next = { ...board, guesses: [...board.guesses, typed] };
  boards[lang] = next;
  typed = '';
  api.storage.set('boards', boards);      // сохраняем до анимации: ушёл посреди неё — ход не пропал

  revealing = true;
  const row = next.guesses.length - 1;
  renderHeader();
  renderBoard(row);
  renderKeyboard(row);
  api.platform.haptic.impact('medium');

  later(() => {
    renderHeader();
    renderBoard();                        // итоговые цвета без анимации — не зависим от её fill-mode
    renderKeyboard(next.guesses.length);
    const status = getStatus(next);
    if (status === 'playing') {
      revealing = false;
      return;
    }
    // Партия окончена: победа — строка подпрыгивает, поражение — пауза, чтобы увидеть последний ход.
    // Всё это время ввод и смена языка заблокированы (revealing), потом — экран результата.
    const delay = status === 'won' ? bounceRow(row) : reducedMotion() ? 0 : 500;
    later(() => {
      revealing = false;
      finishBoard();
    }, delay);
  }, REVEAL_MS);
}

function finishBoard() {
  const board = boards[lang];
  const cfg = LANGUAGES[lang];
  const word = board.secret.toUpperCase();
  const won = getStatus(board) === 'won';

  stats[lang] = recordGame(stats[lang], board);
  boards[lang] = null;
  lastWin = won ? { lang, tries: board.guesses.length } : null;
  api.storage.set('stats', stats);
  api.storage.set('boards', boards);

  const common = { variant: lang, locale: cfg.locale, share: shareText(board) };
  if (won) {
    api.platform.haptic.notification('success');
    api.finish({
      ...common,
      outcome: 'win',
      score: getScore(board),
      message: t().won(word, board.guesses.length, MAX_TRIES, stats[lang].streak),
    });
  } else {
    api.platform.haptic.notification('error');
    api.finish({ ...common, outcome: 'lose', message: t().lost(word) });
  }
}

function onKeydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (statsOpen) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      closeStats();
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    backspace();
  } else {
    const ch = toLetter(lang, e.key);
    if (ch) {
      e.preventDefault();
      onLetter(ch);
    }
  }
}

// ---------- язык ----------

async function selectLang(next) {
  const token = ++loadToken;
  lang = next;
  dict = null;
  typed = '';
  api.storage.set('lang', next);
  renderAll();

  let loaded;
  try {
    loaded = await loadDict(next);
  } catch (err) {
    console.error(err);
    if (token === loadToken) showToast(t().loadFailed);
    return;
  }
  if (token !== loadToken || !api) return;   // успели переключить язык или выйти

  dict = loaded;
  if (!boards[lang]) {
    boards[lang] = newBoard(dict.answers);
    api.storage.set('boards', boards);
  }
  renderAll();
  for (const part of [ui.board, ui.keyboard]) {
    animate(part, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_OUT });
  }
  // Партия кончилась, а результат не отдан (вышли посреди анимации последнего хода).
  if (getStatus(boards[lang]) !== 'playing') finishBoard();
}

function onLangClick(e) {
  const next = e.currentTarget.dataset.lang;
  e.currentTarget.blur();                 // иначе Enter с клавиатуры «нажмёт» эту кнопку
  if (next !== lang && !revealing) selectLang(next);
}

export default {
  id: 'wordle',
  title: 'Wordle',

  async init(container, gameApi) {
    api = gameApi;
    toast = createToast();
    const [savedBoards, savedStats, savedLang] = await Promise.all([
      api.storage.get('boards'), api.storage.get('stats'), api.storage.get('lang'),
    ]);
    if (!api) return;                     // закрыли, пока читали хранилище

    boards = {};
    stats = {};
    for (const id of LANG_ORDER) {
      boards[id] = isValidBoard(savedBoards?.[id]) ? savedBoards[id] : null;
      stats[id] = isValidStats(savedStats?.[id]) ? savedStats[id] : emptyStats();
    }

    ui = {
      title: el('div', { class: 'wd-title' }),
      sub: el('div', { class: 'wd-sub' }),
      statsButton: el('button', {
        class: 'wd-icon-btn',
        onmousedown: (e) => e.preventDefault(),
        onclick: openStats,
      }),
      langs: el('div', { class: 'wd-langs', role: 'group' }),
      langButtons: Object.fromEntries(LANG_ORDER.map((id) => [id, el('button', {
        class: 'wd-lang',
        'data-lang': id,
        onclick: onLangClick,
      }, LANGUAGES[id].label)])),
      board: el('div', { class: 'wd-board' }),
      keyboard: el('div', { class: 'wd-kb' }),
      stats: el('div', { class: 'wd-stats', hidden: true, onclick: (e) => { if (e.target === ui.stats) closeStats(); } }),
    };
    ui.statsButton.innerHTML = STATS_ICON;
    ui.langs.append(...Object.values(ui.langButtons));

    root = el('div', { class: 'wd' },
      el('div', { class: 'wd-header' },
        el('div', { class: 'wd-heading' }, ui.title, ui.sub),
        el('div', { class: 'wd-actions' }, ui.statsButton, ui.langs),
      ),
      el('div', { class: 'wd-board-wrap' }, ui.board),
      ui.keyboard,
      toast.el,
      ui.stats,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);

    await selectLang(LANGUAGES[savedLang] ? savedLang : defaultLang(api.platform.user?.language_code));
  },

  getState() {
    // Партии лежат в api.storage игры; оболочке — только признак «есть что продолжить» для меню.
    const inProgress = LANG_ORDER.some((id) => boards[id]?.guesses.length > 0 && getStatus(boards[id]) === 'playing');
    return inProgress ? { lang } : null;
  },

  destroy() {
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    root?.remove();
    loadToken++;                          // незавершённая загрузка словаря ничего не отрисует
    toast?.dispose();
    api = root = ui = dict = lang = toast = lastWin = null;
    statsOpen = false;
    boards = {};
    stats = {};
    typed = '';
    revealing = false;
  },
};
