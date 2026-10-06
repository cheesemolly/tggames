// «Эрудит» — скрэббл на русском против бота. Поле 15×15, семь фишек на руке, четыре уровня бота.
// Как ставить фишки: касание пустой клетки ставит стрелку (ещё касание — поворачивает её вниз), касания фишек
// руки выкладывают их по стрелке; можно и наоборот — сначала фишка, потом клетка. Касание выложенной в этом
// ходу фишки возвращает её на руку. С клавиатуры — буквы, Backspace, пробел (повернуть стрелку), Enter.
// Словарь (words/ru.json) грузится один раз на страницу; бот считает в основном потоке — перебор ходов занимает
// миллисекунды. Партия, статистика по уровням и настройки (скин поля) — в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import {
  SIZE, CELLS, CENTER, RACK, BINGO, BLANK, LETTERS, PREMIUM, LEVEL_IDS, IDLE_LIMIT,
  rowOf, colOf, valueOf, layout, checkMove, newGame, play, swap, pass, canSwap, ending, finalScores, outcomeOf,
  isValidState, emptyStats, migrateStats, recordGame,
} from './logic.js';
import { createDict, generateMoves, botMove } from './engine.js';

const SKINS = ['telegram', 'classic', 'wood', 'felt', 'night', 'paper'];
const T = {
  title: 'Эрудит',
  levels: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', master: 'Мастер' },
  levelHint: {
    easy: 'Простые слова, часто меняет фишки',
    medium: 'Частые слова, не всегда лучший ход',
    hard: 'Весь словарь, иногда ошибается',
    master: 'Весь словарь и самый дорогой ход',
  },
  you: 'Вы',
  bot: 'Бот',
  bag: 'в мешке',
  loading: 'Загружаю словарь…',
  loadError: 'Не удалось загрузить словарь',
  retry: 'Повторить',
  firstMove: 'Ваш ход — первое слово через центр',
  yourTurn: 'Ваш ход',
  botTurn: 'Бот думает',
  botPlay: (words, score) => `Бот: ${words} — ${score}`,
  botSwap: (n) => `Бот поменял фишки: ${n}`,
  botPass: 'Бот пропустил ход',
  youSwap: 'Вы поменяли фишки',
  youPass: 'Вы пропустили ход',
  bingo: `все семь фишек: +${BINGO}`,
  errors: {
    line: 'Фишки — в одну линию',
    gap: 'Слово — без пропусков',
    center: 'Первое слово — через центр',
    short: 'Нужно слово хотя бы из двух букв',
    connect: 'Слово должно касаться выложенных',
    occupied: 'Клетка занята',
    empty: 'Выложите фишки на поле',
  },
  noWord: (list) => (list.length === 1 ? `Нет слова «${list[0]}»` : `Нет слов: ${list.map((w) => `«${w}»`).join(', ')}`),
  play: 'Ход',
  swap: 'Обмен',
  pass: 'Пас',
  shuffle: 'Смешать',
  recall: 'Вернуть',
  swapTitle: 'Обмен фишек',
  swapNote: 'Отметьте фишки, которые хотите сменить. Ход перейдёт боту.',
  swapDo: (n) => (n ? `Обменять: ${n}` : 'Обменять'),
  swapNone: 'В мешке меньше семи фишек — менять нельзя',
  passTitle: 'Пропустить ход?',
  passNote: 'Если два круга подряд никто не выложит слово, партия закончится.',
  lastIdle: 'Это будет второй круг без слов — партия закончится.',
  starTitle: 'Какая буква?',
  starNote: 'Звёздочка заменяет любую букву, но очков не даёт.',
  cancel: 'Отмена',
  close: 'Закрыть',
  newGame: 'Новая партия',
  level: 'Сложность',
  start: 'Играть',
  abandon: 'Начатая партия засчитается как поражение.',
  win: 'Победа!',
  lose: 'Поражение',
  draw: 'Ничья',
  reasons: { out: 'фишки кончились', idle: 'два круга без слов' },
  left: (mine, bots) => `Остаток на руках: у вас −${mine}, у бота −${bots}`,
  outYou: (n) => `Вы выложили все фишки: +${n} вам, −${n} боту`,
  outBot: (n) => `Бот выложил все фишки: +${n} боту, −${n} вам`,
  stats: { open: 'Статистика', title: 'Статистика', played: 'Партий', wins: 'Побед', best: 'Рекорд', move: 'Ход', note: 'Рекорд — лучший счёт партии, ход — самый дорогой ход.' },
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Поле' },
  skins: { telegram: 'По умолчанию', classic: 'Классика', wood: 'Дерево', felt: 'Сукно', night: 'Ночь', paper: 'Тетрадь' },
  legend: { d: 'буква ×2', t: 'буква ×3', 2: 'слово ×2', 3: 'слово ×3' },
  values: 'Очки букв',
  rules: [
    'Составляйте слова из своих фишек: слева направо или сверху вниз. Первое слово проходит через центр, каждое следующее касается выложенных. Все получившиеся слова должны быть в словаре.',
    'Слова — нарицательные существительные в начальной форме, ё\u00A0=\u00A0е.',
    'Цветная клетка умножает очки буквы или всего слова — один раз, когда на неё ложится фишка. Звёздочка заменяет любую букву, но очков не даёт. Все семь фишек за ход — ещё 15 очков.',
    'Как ставить: коснитесь клетки — появится стрелка, ещё раз — она повернётся вниз. Потом касайтесь фишек, они встают по стрелке. Касание выложенной фишки возвращает её.',
    'Партия кончается, когда мешок пуст и кто-то выложил все фишки, или когда два круга подряд никто не выложил слово. Очки оставшихся на руках фишек вычитаются.',
  ],
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  swap: svgIcon('<path d="M4 8h14"/><path d="m15 4 4 4-4 4"/><path d="M20 16H6"/><path d="m9 12-4 4 4 4"/>'),
  pass: svgIcon('<path d="m5 5 8 7-8 7z"/><path d="M18 5v14"/>'),
  shuffle: svgIcon('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>'),
  recall: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  play: svgIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('erdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let dict = null;
let dictPromise = null;            // словарь — один на страницу, переживает закрытие игры
let game = null;
let stats = emptyStats();
let setup = { level: 'easy' };
let settings = { skin: 'telegram' };
let pending = [];                  // фишки этого хода на поле: { i, slot, ch, blank } — slot — место на руке
let cursor = null;                 // { i, dir: 'h' | 'v' } — куда встанет следующая фишка
let picked = null;                 // фишка руки, выбранная до клетки (номер места)
let lastDir = 'h';
let busy = false;                  // бот думает или идёт анимация
let over = false;
let modalActive = false;
let modalToken = 0;
let onModalClose = null;
let soundOn = true;
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

function loadDict() {
  dictPromise ??= fetch(new URL('./words/ru.json', import.meta.url))
    .then((res) => {
      if (!res.ok) throw new Error(`словарь: ${res.status}`);
      return res.json();
    })
    .then((data) => createDict(data.words, data.common))
    .catch((err) => {
      dictPromise = null;
      throw err;
    });
  return dictPromise;
}

const save = () => game && !over && api?.storage.set('current', game);
const myTurn = () => Boolean(game && dict && !over && !busy && game.turn === 0);
const pendingAt = (i) => pending.find((p) => p.i === i);
const isFree = (i) => game.board[i] === '.' && !pendingAt(i);
const tilesOf = () => pending.map(({ i, ch, blank }) => ({ i, ch, blank }));

// ---------- отрисовка ----------

function tileEl(ch, blank) {
  return el('div', { class: `er-tile${blank ? ' er-star' : ''}` },
    el('b', {}, ch === BLANK ? '★' : ch),
    blank || ch === BLANK ? null : el('i', {}, valueOf(ch)));
}

const POP_IN = [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }];
const popIn = (node, delay = 0) => animate(node, POP_IN, { duration: 220, delay, easing: 'ease-out', fill: 'backwards' });

function vanish(node) {
  node.classList.add('er-leaving');
  animate(node, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.5)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' })
    .then(() => node.remove());
}

function buildBoard() {
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const p = PREMIUM[i];
    const cell = el('div', { class: `er-cell${p ? ` er-p-${p}` : ''}${i === CENTER ? ' er-center' : ''}`, 'data-i': i });
    if (p) cell.append(el('span', { class: 'er-mark' }, p === 'd' || p === '2' ? '×2' : '×3'));
    else if (i === CENTER) cell.append(el('span', { class: 'er-mark' }, '★'));
    cells.push(cell);
  }
  ui.cells = cells;
  ui.shown = new Array(CELLS).fill('');
  ui.board.replaceChildren(...cells);
}

/** Фишки на поле — по позиции и выложенным в этом ходу; новые «впрыгивают» (stagger — по очереди, как у бота). */
function renderTiles({ stagger = false, bot = false, quiet = false } = {}) {
  const last = new Set(game?.last?.type === 'play' ? game.last.cells : []);
  let order = 0;
  for (let i = 0; i < CELLS; i++) {
    const cell = ui.cells[i];
    const mine = game ? pendingAt(i) : null;
    const fixed = game ? game.board[i] : '.';
    const ch = mine ? mine.ch : fixed.toLowerCase();
    const blank = mine ? mine.blank : fixed !== '.' && fixed !== ch;
    const key = mine || fixed !== '.' ? `${ch}${blank ? '*' : ''}` : '';
    let node = cell.querySelector('.er-tile:not(.er-leaving)');
    if (key !== ui.shown[i]) {
      if (node) vanish(node);
      node = null;
      if (key) {
        node = tileEl(ch, blank);
        cell.append(node);
        if (!quiet) {
          const k = order++;
          popIn(node, stagger ? k * 110 : 0);
          if (stagger) later(() => sfx('place', { step: k, bot }), reducedMotion() ? 0 : k * 110);
        }
      }
      ui.shown[i] = key;
    }
    if (node) {
      node.classList.toggle('er-fresh', Boolean(mine));
      node.classList.toggle('er-last', !mine && last.has(i));
    }
    cell.classList.toggle('er-cursor', cursor?.i === i);
    if (cursor?.i === i) cell.dataset.dir = cursor.dir;
    else delete cell.dataset.dir;
  }
  return order;
}

/** Рука: семь мест; фишка, выложенная на поле в этом ходу, оставляет пустое место. fresh — сколько последних новые. */
function renderRack({ fresh = 0, all = false } = {}) {
  const rack = game ? game.racks[0] : [];
  const slots = [];
  for (let k = 0; k < RACK; k++) {
    const ch = rack[k];
    const used = pending.some((p) => p.slot === k);
    const slot = el('button', {
      class: `er-slot${ch && !used ? '' : ' er-slot-empty'}${picked === k ? ' er-picked' : ''}`, 'data-slot': k,
      'aria-label': ch ? (ch === BLANK ? 'звёздочка' : ch) : 'пусто', disabled: !ch,
    });
    if (ch && !used) {
      const tile = tileEl(ch, false);
      slot.append(tile);
      if (all || k >= rack.length - fresh) popIn(tile, all ? k * 25 : (k - (rack.length - fresh)) * 60);
    }
    slots.push(slot);
  }
  ui.rack.replaceChildren(...slots);
}

function bump(node) {
  animate(node, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
}

function setNumber(node, value) {
  const text = String(value);
  if (node.textContent === text) return;
  const first = node.textContent === '';
  node.textContent = text;
  if (!first) bump(node);
}

const upper = (list) => list.map((w) => w.toUpperCase());

function lastText() {
  const l = game.last;
  if (!l) return game.turn === 0 ? T.firstMove : '';
  if (l.by === 1) {
    if (l.type === 'play') return T.botPlay(upper(l.words).join(', '), l.score) + (l.bingo ? ` (${T.bingo})` : '');
    return l.type === 'swap' ? T.botSwap(l.count ?? 0) : T.botPass;
  }
  if (l.type === 'play') return `${upper(l.words).join(', ')} — ${l.score}`;
  return l.type === 'swap' ? T.youSwap : T.youPass;
}

/** Строка под полем: что получится из выложенного, чем ход плох, что сделал бот. → очки хода или null. */
function renderStatus() {
  let text = '';
  let preview = null;
  let thinking = false;
  let warn = false;
  if (!dict) {
    text = T.loading;
  } else if (!game) {
    text = '';
  } else if (over) {
    text = ui.status.dataset.final ?? '';
  } else if (game.turn === 1) {
    text = T.botTurn;
    thinking = true;
  } else if (pending.length) {
    const res = layout(game.board, tilesOf());
    if (res.ok) {
      preview = res.score;
      const parts = res.words.map((w) => `${w.word.toUpperCase()} ${w.score}`);
      text = res.words.length > 1 ? `${parts.join(' + ')}${res.bingo ? ` + ${BINGO}` : ''} = ${res.score}`
        : `${res.words[0].word.toUpperCase()} — ${res.score}${res.bingo ? ` (${T.bingo})` : ''}`;
    } else {
      text = T.errors[res.error] ?? '';
      warn = true;
    }
  } else {
    text = lastText() || T.yourTurn;
  }
  ui.status.textContent = text;
  ui.status.classList.toggle('er-thinking', thinking);
  ui.status.classList.toggle('er-warn', warn);
  return preview;
}

function renderInfo() {
  const preview = renderStatus();
  const scores = game ? (over && ui.final ? ui.final : game.scores) : [0, 0];
  setNumber(ui.score[0], scores[0]);
  setNumber(ui.score[1], scores[1]);
  setNumber(ui.bag, game ? game.bag.length : 0);
  ui.sub.textContent = game ? T.levels[game.level] : '';
  ui.side[0].classList.toggle('er-active', Boolean(game && !over && game.turn === 0));
  ui.side[1].classList.toggle('er-active', Boolean(game && !over && game.turn === 1));
  const mine = myTurn();
  ui.playLabel.textContent = preview == null ? T.play : `${T.play} · ${preview}`;
  ui.play.disabled = !mine || !pending.length;
  ui.play.classList.toggle('er-ready', mine && preview != null);
  ui.swap.disabled = !mine;
  ui.pass.disabled = !mine;
  const recall = pending.length > 0;
  ui.mix.disabled = !mine;
  ui.mixLabel.textContent = recall ? T.recall : T.shuffle;
  ui.mixIcon.innerHTML = recall ? ICONS.recall : ICONS.shuffle;
}

function renderAll(opts) {
  renderTiles(opts);
  renderRack(opts);
  renderInfo();
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('er-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

/** Очки хода всплывают над последней выложенной фишкой. */
function floatScore(cells, score, bot) {
  const cell = ui.cells[cells[cells.length - 1]];
  if (!cell || reducedMotion()) return;
  const node = el('div', { class: `er-float${bot ? ' er-float-bot' : ''}` }, `+${score}`);
  node.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
  node.style.top = `${cell.offsetTop}px`;
  ui.board.append(node);
  animate(node, [
    { opacity: 0, translate: '-50% 0', scale: 0.7 },
    { opacity: 1, translate: '-50% -70%', scale: 1.1, offset: 0.25 },
    { opacity: 1, translate: '-50% -110%', scale: 1, offset: 0.75 },
    { opacity: 0, translate: '-50% -150%', scale: 1 },
  ], { duration: 1100, easing: 'ease-out', fill: 'forwards' }).then(() => node.remove());
}

// ---------- ход игрока: курсор и фишки ----------

/** Следующая свободная клетка по стрелке (выложенные пропускаются) или -1. */
function nextFree(i, dir) {
  const step = dir === 'h' ? 1 : SIZE;
  for (let k = i + step; k < CELLS && (dir === 'v' || rowOf(k) === rowOf(i)); k += step) if (isFree(k)) return k;
  return -1;
}

/** Куда смотрит стрелка в новой клетке: вдоль уже выложенных в этом ходу фишек, иначе — как в прошлый раз. */
function guessDir(i) {
  if (pending.length) {
    if (pending.every((p) => rowOf(p.i) === rowOf(i))) return pending.length > 1 || colOf(pending[0].i) !== colOf(i) ? 'h' : lastDir;
    if (pending.every((p) => colOf(p.i) === colOf(i))) return 'v';
  }
  return lastDir;
}

function setCursor(i, dir) {
  cursor = i < 0 ? null : { i, dir };
  if (cursor) lastDir = dir;
}

/** Фишка с места slot встаёт на клетку i; звёздочка сначала спрашивает букву. */
function placeTile(slot, i) {
  const ch = game.racks[0][slot];
  if (!ch || !isFree(i) || pending.some((p) => p.slot === slot)) return;
  const dir = cursor?.i === i ? cursor.dir : guessDir(i);
  const put = (letter, blank) => {
    pending.push({ i, slot, ch: letter, blank });
    picked = null;
    setCursor(nextFree(i, dir), dir);
    sfx('place', { step: pending.length - 1 });
    api.platform.haptic.selection();
    renderAll();
  };
  if (ch === BLANK) askLetter((letter) => put(letter, true));
  else put(ch, false);
}

function returnTile(p, { silent = false } = {}) {
  pending = pending.filter((x) => x !== p);
  if (!silent) {
    sfx('back');
    api.platform.haptic.selection();
  }
}

function recallAll() {
  if (!pending.length) return;
  pending = [];
  cursor = null;
  picked = null;
  sfx('back');
  renderAll({ all: true });
}

function onBoardTap(e) {
  if (!myTurn() || modalActive) return;
  const cell = e.target.closest('.er-cell');
  if (!cell) return;
  const i = Number(cell.dataset.i);
  const mine = pendingAt(i);
  if (mine) {
    returnTile(mine);
    picked = null;
    setCursor(i, cursor?.dir ?? guessDir(i));
    renderAll();
    return;
  }
  if (game.board[i] !== '.') return;
  if (picked != null) {
    placeTile(picked, i);
    return;
  }
  if (cursor?.i === i) setCursor(i, cursor.dir === 'h' ? 'v' : 'h');
  else setCursor(i, guessDir(i));
  sfx('cursor');
  api.platform.haptic.selection();
  renderTiles();
}

function onRackTap(e) {
  if (!myTurn() || modalActive) return;
  const slot = e.target.closest('.er-slot');
  if (!slot) return;
  const k = Number(slot.dataset.slot);
  const used = pending.find((p) => p.slot === k);
  if (used) {
    returnTile(used);
    renderAll();
    return;
  }
  if (!game.racks[0][k]) return;
  if (cursor) {
    // стрелка могла оказаться на занятой клетке (клавиши-стрелки) — фишка встаёт на следующую свободную
    const target = isFree(cursor.i) ? cursor.i : nextFree(cursor.i, cursor.dir);
    if (target < 0) shake(ui.rack, { distance: 3, duration: 250 });
    else {
      if (target !== cursor.i) setCursor(target, cursor.dir);
      placeTile(k, target);
    }
    return;
  }
  picked = picked === k ? null : k;
  sfx('pick');
  api.platform.haptic.selection();
  renderRack();
}

function onMix() {
  if (!myTurn()) return;
  if (pending.length) {
    recallAll();
    return;
  }
  const rack = game.racks[0];
  for (let i = rack.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rack[i], rack[j]] = [rack[j], rack[i]];
  }
  picked = null;
  sfx('shuffle');
  api.platform.haptic.impact('light');
  renderRack({ all: true });
  save();
}

/** Ход не принят: сообщение и тряска фишек (при неизвестном слове — только его фишек). */
function reject(res) {
  const text = res.error === 'word' ? T.noWord(upper(res.bad)) : T.errors[res.error] ?? T.errors.empty;
  toast.show(text, res.error === 'word' ? 2200 : 1600);
  const bad = res.error === 'word'
    ? new Set(res.words.filter((w) => res.bad.includes(w.word)).flatMap((w) => w.cells))
    : null;
  for (const p of pending) {
    if (bad && !bad.has(p.i)) continue;
    const node = ui.cells[p.i].querySelector('.er-tile:not(.er-leaving)');
    if (node) shake(node, { distance: 3, duration: 300 });
  }
  sfx('error');
  api.platform.haptic.notification('error');
}

function onPlay() {
  if (!myTurn() || modalActive) return;
  const tiles = tilesOf();
  const res = checkMove(game.board, tiles, dict.isWord);
  if (!res.ok) {
    reject(res);
    return;
  }
  const kept = game.racks[0].length - tiles.length;
  play(game, tiles, res);
  pending = [];
  cursor = null;
  picked = null;
  sfx(res.bingo ? 'bingo' : 'play', { step: 2 + Math.floor(res.score / 10) });
  api.platform.haptic.notification('success');
  renderTiles({ quiet: true });
  renderRack({ fresh: game.racks[0].length - kept });
  floatScore(game.last.cells, res.score, false);
  afterTurn();
}

/** После любого хода: сохранить, проверить конец, передать ход. */
function afterTurn() {
  const end = ending(game);
  if (end) {
    finishGame(end);
    return;
  }
  save();
  renderInfo();
  if (game.turn === 1) botTurn();
}

// ---------- бот ----------

async function botTurn() {
  busy = true;
  renderInfo();
  const snapshot = game;
  const started = Date.now();
  await later(null, 40);                                   // дать отрисоваться «Бот думает»
  if (!ui || game !== snapshot || over) return;
  const move = botMove(dict, game, game.level);
  // чтобы бот не «ходил мгновенно» — хотя бы 0,7 с на раздумье
  const wait = Math.max(0, 700 - (Date.now() - started));
  if (wait && !reducedMotion()) await later(null, wait);
  if (!ui || game !== snapshot || over) return;
  if (move.type === 'play') {
    const res = checkMove(game.board, move.tiles, dict.isWord);
    play(game, move.tiles, res);
    const shownTiles = renderTiles({ stagger: true, bot: true });
    await later(null, reducedMotion() ? 0 : shownTiles * 110 + 120);
    if (!ui || game !== snapshot) return;
    floatScore(game.last.cells, res.score, true);
    api.platform.haptic.impact(res.score >= 20 ? 'medium' : 'light');
  } else if (move.type === 'swap') {
    swap(game, move.picks);
    sfx('swap');
  } else {
    pass(game);
    sfx('pass');
  }
  busy = false;
  afterTurn();
  if (!over) renderTiles();
}

// ---------- обмен, пас, звёздочка ----------

function openModal(content, onClose = null) {
  if (!modalActive) sfx('click');
  modalToken++;
  onModalClose = onClose;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const cb = onModalClose;
  onModalClose = null;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  cb?.();
}

function card(title, ...children) {
  return el('div', { class: 'er-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'er-card-head' },
      el('h2', {}, title),
      el('button', { class: 'er-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function askLetter(done) {
  const buttons = [...LETTERS].map((ch) => el('button', {
    class: 'er-letter',
    onclick: () => {
      closeModal();
      done(ch);
    },
  }, ch));
  openModal(card(T.starTitle, el('p', { class: 'er-note' }, T.starNote), el('div', { class: 'er-letters' }, buttons)));
}

function onSwap() {
  if (!myTurn()) return;
  if (!canSwap(game)) {
    toast.show(T.swapNone, 2200);
    sfx('error');
    return;
  }
  if (pending.length) recallAll();
  const marked = new Set();
  const go = el('button', { class: 'btn', disabled: true }, T.swapDo(0));
  const tiles = game.racks[0].map((ch, k) => {
    const b = el('button', {
      class: 'er-slot', 'aria-pressed': 'false',
      onclick: () => {
        if (marked.has(k)) marked.delete(k);
        else marked.add(k);
        b.setAttribute('aria-pressed', String(marked.has(k)));
        go.disabled = marked.size === 0;
        go.textContent = T.swapDo(marked.size);
        sfx('pick');
      },
    }, tileEl(ch, false));
    return b;
  });
  go.addEventListener('click', () => {
    if (!marked.size || !myTurn()) return;
    closeModal();
    const n = marked.size;
    swap(game, [...marked]);
    sfx('swap');
    api.platform.haptic.impact('light');
    renderRack({ fresh: n });
    afterTurn();
  });
  openModal(card(T.swapTitle,
    el('p', { class: 'er-note' }, T.swapNote),
    game.idle === IDLE_LIMIT - 1 ? el('p', { class: 'er-note er-alert' }, T.lastIdle) : null,
    el('div', { class: 'er-rack er-rack-pick' }, tiles),
    el('div', { class: 'er-card-actions' }, el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel), go),
  ));
}

function onPass() {
  if (!myTurn()) return;
  openModal(card(T.passTitle,
    el('p', { class: 'er-note' }, game.idle === IDLE_LIMIT - 1 ? T.lastIdle : T.passNote),
    el('div', { class: 'er-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', {
        class: 'btn',
        onclick: () => {
          if (!myTurn()) return;
          closeModal();
          pending = [];
          cursor = null;
          picked = null;
          pass(game);
          sfx('pass');
          renderTiles();
          renderRack();
          afterTurn();
        },
      }, T.pass),
    ),
  ));
}

// ---------- конец партии ----------

function finishGame(reason) {
  over = true;
  busy = false;
  pending = [];
  cursor = null;
  picked = null;
  const f = finalScores(game);
  const outcome = outcomeOf(f.scores);
  ui.final = f.scores;
  ui.status.dataset.final = f.out === 0 ? T.outYou(f.left[1]) : f.out === 1 ? T.outBot(f.left[0]) : T.left(f.left[0], f.left[1]);
  renderAll();
  recordGame(stats, game.level, outcome, f.scores[0], game.best);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sfx(outcome);
  api.platform.haptic.notification(outcome === 'win' ? 'success' : outcome === 'draw' ? 'warning' : 'error');
  const title = outcome === 'win' ? T.win : outcome === 'draw' ? T.draw : T.lose;
  const result = {
    outcome, title, locale: 'ru', variant: game.level,
    message: `${T.levels[game.level]} · ${f.scores[0]} : ${f.scores[1]} · ${T.reasons[reason]}`,
  };
  if (outcome === 'win') result.score = f.scores[0];
  later(() => api?.finish(result), reducedMotion() ? 0 : 1600);
}

// ---------- окна ----------

function legend() {
  return el('div', { class: 'er-legend' }, ['d', 't', '2', '3'].map((p) => el('span', { class: 'er-legend-item' },
    el('i', { class: `er-chip er-p-${p}` }, p === 'd' || p === '2' ? '×2' : '×3'), T.legend[p])));
}

/** Окно новой партии: уровень бота. */
function showNewGame(closable = true) {
  const buttons = LEVEL_IDS.map((id) => el('button', {
    class: 'er-option', role: 'radio', 'aria-checked': String(setup.level === id),
    onclick: () => {
      setup.level = id;
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(LEVEL_IDS[k] === id)));
      sfx('pick');
    },
  }, el('b', {}, T.levels[id]), el('span', {}, T.levelHint[id])));
  const started = game && !over && game.moves >= 2;
  const content = el('div', { class: 'er-card', role: 'dialog', 'aria-label': T.newGame },
    el('div', { class: 'er-card-head' },
      el('h2', {}, T.newGame),
      closable ? el('button', { class: 'er-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕') : null,
    ),
    el('h3', { class: 'er-section' }, T.level),
    el('div', { class: 'er-levels', role: 'radiogroup' }, buttons),
    legend(),
    started ? el('p', { class: 'er-note' }, T.abandon) : null,
    el('button', {
      class: 'btn er-start',
      onclick: () => {
        closeModal();
        startGame();
      },
    }, T.start),
  );
  openModal(content);
}

function startGame() {
  api.storage.set('setup', setup);
  if (game && !over && game.moves >= 2) {
    // брошенная партия — поражение (если оба уже сходили)
    recordGame(stats, game.level, 'lose', game.scores[0], game.best);
    api.storage.set('stats', stats);
  }
  game = newGame(setup.level);
  over = false;
  busy = false;
  pending = [];
  cursor = null;
  picked = null;
  lastDir = 'h';
  ui.final = null;
  delete ui.status.dataset.final;
  renderTiles();
  renderRack({ all: true });
  renderInfo();
  save();
  if (game.turn === 1) botTurn();
}

function showStats() {
  openModal(card(T.stats.title,
    el('table', { class: 'er-stats' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, T.stats.played), el('th', {}, T.stats.wins), el('th', {}, T.stats.best), el('th', {}, T.stats.move))),
      el('tbody', {}, LEVEL_IDS.map((id) => {
        const s = stats[id];
        return el('tr', {}, el('td', {}, T.levels[id]), el('td', {}, s.played), el('td', {}, s.wins), el('td', {}, s.best || '—'), el('td', {}, s.bestMove || '—'));
      }))),
    el('p', { class: 'er-note' }, T.stats.note),
  ));
}

/** Буквы по очкам: «1 — А Е И Н О» … — из таблицы набора. */
function valuesTable() {
  const groups = new Map();
  for (const ch of LETTERS) {
    const v = valueOf(ch);
    groups.set(v, [...(groups.get(v) ?? []), ch.toUpperCase()]);
  }
  return el('div', { class: 'er-values' }, [...groups.keys()].sort((a, b) => a - b).map((v) => el('div', {},
    el('b', {}, v), el('span', {}, groups.get(v).join(' ')))));
}

function showHelp() {
  openModal(card(T.help.title,
    T.rules.slice(0, 2).map((text) => el('p', { class: 'er-rule' }, text)),
    legend(),
    T.rules.slice(2).map((text) => el('p', { class: 'er-rule' }, text)),
    el('h3', { class: 'er-section' }, T.values),
    valuesTable(),
  ));
}

/** Образец скина: уголок поля с премиями и фишкой. */
function swatch(id) {
  const cells = ['3', '', 'd', '', 'tile', '', '2', '', 't'].map((p) => (p === 'tile'
    ? el('i', { class: 'er-swatch-tile' }, 'Э')
    : el('i', { class: p ? `er-p-${p}` : '' })));
  return el('span', { class: 'er-swatch', 'data-skin': id }, cells);
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'er-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      sfx('pick');
    },
  }, swatch(id), T.skins[id]));
  openModal(card(T.settings.title,
    el('h3', { class: 'er-section' }, T.settings.skin),
    el('div', { class: 'er-skins', role: 'radiogroup' }, buttons),
    pointsInfo(api, 'erudit'),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'er-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function toolButton(icon, label, onclick, cls = '') {
  const iconEl = el('span', { class: 'er-tool-icon' });
  const labelEl = el('span', {}, label);
  iconEl.innerHTML = icon;
  const button = el('button', { class: `er-tool${cls}`, onclick }, iconEl, labelEl);
  return { button, iconEl, labelEl };
}

// ---------- клавиатура ----------

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else if (myTurn()) recallAll();
    return;
  }
  if (modalActive || !myTurn() || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase().replace('ё', 'е');
  if (e.key === 'Enter') {
    e.preventDefault();
    if (pending.length) onPlay();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    const p = pending[pending.length - 1];
    if (!p) return;
    returnTile(p);
    setCursor(p.i, cursor?.dir ?? lastDir);
    renderAll();
  } else if (e.key === ' ' && cursor) {
    e.preventDefault();
    setCursor(cursor.i, cursor.dir === 'h' ? 'v' : 'h');
    renderTiles();
  } else if (e.key.startsWith('Arrow') && cursor) {
    e.preventDefault();
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE }[e.key];
    const to = cursor.i + d;
    if (to < 0 || to >= CELLS || (Math.abs(d) === 1 && rowOf(to) !== rowOf(cursor.i))) return;
    setCursor(to, cursor.dir);
    renderTiles();
  } else if (key.length === 1 && LETTERS.includes(key) && cursor && isFree(cursor.i)) {
    const rack = game.racks[0];
    const slot = rack.findIndex((ch, k) => ch === key && !pending.some((p) => p.slot === k));
    if (slot >= 0) placeTile(slot, cursor.i);
    else shake(ui.rack, { distance: 3, duration: 250 });
  }
}

// ---------- отладка (?erdebug) ----------

function debugHooks() {
  globalThis.__erudit = {
    get game() { return game; },
    get dict() { return dict; },
    get pending() { return pending; },
    /** Лучший ход игрока по очкам (или null). */
    best() {
      const moves = generateMoves(dict, game.board, game.racks[0]);
      return moves.sort((a, b) => b.score - a.score)[0] ?? null;
    },
    /** Выложить ход на поле как игрок (без кнопки «Ход»). */
    lay(move) {
      pending = [];
      const rack = game.racks[0];
      for (const t of move.tiles) {
        const slot = rack.findIndex((ch, k) => ch === (t.blank ? BLANK : t.ch) && !pending.some((p) => p.slot === k));
        pending.push({ i: t.i, slot, ch: t.ch, blank: t.blank });
      }
      cursor = null;
      renderAll();
    },
    play: onPlay,
    /** Доиграть партию ходами бота за обе стороны до конца мешка — проверить финал. */
    skipToEnd(leave = 10) {
      while (game.bag.length > leave && !ending(game)) {
        const m = botMove(dict, game, 'master');
        if (m.type === 'play') play(game, m.tiles, checkMove(game.board, m.tiles, dict.isWord));
        else if (m.type === 'swap') swap(game, m.picks);
        else pass(game);
        game.idle = 0;
      }
      if (game.turn === 1) pass(game);
      game.idle = 0;
      pending = [];
      cursor = null;
      renderAll({ quiet: true });
      save();
    },
    /** Ещё один ход без слова — и партия кончится (проверить конец пасом). */
    nearEnd() {
      game.idle = IDLE_LIMIT - 1;
      save();
    },
  };
}

/** Словарь: пока грузится — строка под полем; не загрузился — окно с «Повторить». → готов ли словарь. */
async function loadWords() {
  for (;;) {
    try {
      const loaded = await loadDict();
      if (!api) return false;
      dict = loaded;
      return true;
    } catch (err) {
      console.warn('словарь', err);
      if (!api) return false;
      await new Promise((resolve) => {
        ui.modal.replaceChildren(el('div', { class: 'er-card', role: 'alert' },
          el('h2', {}, T.loadError),
          el('button', {
            class: 'btn er-start',
            onclick: () => {
              modalActive = false;
              ui.modal.hidden = true;
              ui.modal.replaceChildren();
              resolve();
            },
          }, T.retry)));
        showLayer(ui.modal);
        modalActive = true;
      });
      if (!api) return false;
    }
  }
}

export default {
  id: 'erudit',
  title: 'Эрудит',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSetup, savedSound, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('setup'), api.storage.get('sound'),
      api.storage.get('settings'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = migrateStats(savedStats);
    setup = { level: LEVEL_IDS.includes(savedSetup?.level) ? savedSetup.level : 'easy' };
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'er-sub' }),
      score: [el('b', {}), el('b', {})],
      bag: el('b', {}),
      board: el('div', { class: 'er-board' }),
      status: el('div', { class: 'er-status', role: 'status' }),
      rack: el('div', { class: 'er-rack' }),
      modal: el('div', { class: 'er-modal', hidden: true }),
      final: null,
    };
    ui.side = [
      el('div', { class: 'er-side' }, el('span', {}, T.you), ui.score[0]),
      el('div', { class: 'er-side er-side-bot' }, el('span', {}, T.bot), ui.score[1]),
    ];
    ui.board.addEventListener('click', onBoardTap);
    ui.rack.addEventListener('click', onRackTap);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    const swapTool = toolButton(ICONS.swap, T.swap, onSwap);
    const passTool = toolButton(ICONS.pass, T.pass, onPass);
    const mixTool = toolButton(ICONS.shuffle, T.shuffle, onMix);
    const playTool = toolButton(ICONS.play, T.play, onPlay, ' er-play');
    ui.swap = swapTool.button;
    ui.pass = passTool.button;
    ui.mix = mixTool.button;
    ui.mixLabel = mixTool.labelEl;
    ui.mixIcon = mixTool.iconEl;
    ui.play = playTool.button;
    ui.playLabel = playTool.labelEl;

    root = el('div', { class: 'er' },
      el('div', { class: 'er-header' },
        el('div', {}, el('div', { class: 'er-title' }, T.title), ui.sub),
        el('div', { class: 'er-actions' },
          ui.soundBtn,
          iconButton(ICONS.restart, T.newGame, () => dict && showNewGame(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'er-scores' },
        ui.side[0],
        el('div', { class: 'er-bag' }, ui.bag, el('span', {}, T.bag)),
        ui.side[1],
      ),
      el('div', { class: 'er-wrap' }, ui.board),
      ui.status,
      ui.rack,
      el('div', { class: 'er-tools' }, ui.swap, ui.pass, ui.mix, ui.play),
      ui.modal,
      toast.el,
    );
    container.append(root);
    buildBoard();
    renderSoundBtn();
    renderRack();
    renderInfo();
    document.addEventListener('keydown', onKeydown);

    const ready = await loadWords();
    if (!ready) return;
    if (isDebug()) debugHooks();

    if (isValidState(saved)) {
      game = saved;
      over = false;
      renderTiles({ quiet: true });
      renderRack();
      renderInfo();
      if (game.turn === 1) botTurn();
    } else {
      game = null;
      renderInfo();
      showNewGame(false);
    }
  },

  getState() {
    if (!game || over || game.moves === 0) return null;
    save();
    return { level: game.level, scores: [...game.scores] };
  },

  destroy() {
    save();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (globalThis.__erudit) delete globalThis.__erudit;
    api = host = root = ui = toast = game = dict = cursor = picked = onModalClose = null;
    pending = [];
    busy = over = modalActive = false;
    lastDir = 'h';
    stats = emptyStats();
    setup = { level: 'easy' };
    settings = { skin: 'telegram' };
  },
};
