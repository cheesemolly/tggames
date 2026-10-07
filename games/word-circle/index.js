// «Круг слов» — буквы стоят по кругу: проводишь по ним пальцем, собираешь слово, и оно встаёт в кроссворд.
// Слово, которого в кроссворде нет, но оно настоящее, — бонусное (монета). За монеты — подсказки: буква в случайной
// клетке, буква в выбранной клетке, пять букв разом. Буквы в круге можно перемешать. Уровни идут один за другим,
// каждые двадцать — новая глава со своим пейзажем (пейзажи рисует scenery.js).
// С компьютера: буквы с клавиатуры, Enter — проверить, Backspace — убрать букву, пробел — перемешать.
// Уровни (levels.json) грузятся один раз на страницу. Прогресс, монеты, начатый уровень и настройки — в api.storage.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { SCENES, sceneUrl, sceneOfChapter } from './scenery.js';
import {
  COSTS, ROCKET_CELLS, CHAPTER, CHAPTER_BONUS, BONUS_COIN,
  parseLevel, levelText, chapterOf, endsChapter, reward, reorder, newState, isValidState, shownCells, isDone,
  submit, hiddenCells, revealRandom, revealCell, emptyProgress, migrateProgress, spend, emptyStats, migrateStats,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'grass', 'sunset', 'lilac', 'night'];
const SCENE_IDS = ['auto', ...SCENES.map((s) => s.id), 'none'];

const T = {
  title: 'Круг слов',
  level: (n) => `Уровень ${n}`,
  chapter: (k, name) => `Глава ${k} · ${name}`,
  loading: 'Загружаю уровни…',
  loadError: 'Не удалось загрузить уровни',
  retry: 'Повторить',
  swipe: 'Проведите по буквам',
  pickCell: 'Выберите клетку',
  none: 'Такого слова нет',
  again: 'Это слово уже есть',
  bonus: 'Бонусное слово!',
  bonusAgain: 'Это бонусное уже было',
  poor: 'Не хватает монет',
  nothing: 'Все буквы уже открыты',
  shuffle: 'Перемешать',
  hintLetter: 'Открыть букву',
  hintCell: 'Открыть букву в клетке',
  hintRocket: `Открыть ${ROCKET_CELLS} букв`,
  bonusOpen: 'Бонусные слова',
  coins: 'Монеты',
  praise: ['Отлично!', 'Здорово!', 'Блестяще!', 'Супер!', 'Так держать!', 'Красота!'],
  passed: (n) => `Уровень ${n} пройден`,
  chapterDone: 'Глава пройдена',
  next: 'Дальше',
  close: 'Закрыть',
  bonusTitle: 'Бонусные слова',
  bonusNote: (found, total) => (total ? `Найдено ${found} из ${total}. За каждое — монета.` : 'На этом уровне бонусных слов нет.'),
  bonusEmpty: 'Соберите настоящее слово, которого нет в кроссворде, — получите монету.',
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Плитки', scene: 'Пейзаж', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', classic: 'Лазурь', grass: 'Трава', sunset: 'Закат', lilac: 'Сирень', night: 'Ночь' },
  sceneAuto: 'По главам',
  sceneNone: 'Без пейзажа',
  stats: { levels: 'Пройдено уровней', words: 'Найдено слов', bonus: 'Бонусных слов', hints: 'Открыто букв подсказками' },
  rules: [
    'Проведите пальцем по буквам в круге, чтобы собрать слово. Слово встанет в кроссворд — заполните его целиком.',
    'Слова — существительные в начальной форме, от трёх букв. Ё и Е — одна буква.',
    'Настоящее слово, которого нет в кроссворде, — бонусное: за него даётся монета. Найденные бонусные — под звёздочкой.',
    `За монеты — подсказки: лампочка открывает букву в случайной клетке (${COSTS.letter}), прицел — в клетке, которую вы выберете (${COSTS.cell}), ракета — сразу ${ROCKET_CELLS} букв (${COSTS.rocket}). Монеты дают за каждый пройденный уровень.`,
    'Буквы в круге можно перемешать — иногда так слово виднее. Каждые двадцать уровней — новая глава с новым пейзажем.',
  ],
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  shuffle: svgIcon('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  target: svgIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  rocket: svgIcon('<path d="M14 4c3-1.4 5.4-1.2 6-.6.6.6.8 3-.6 6l-6.2 6.2-4.8-4.8L14 4Z"/><path d="M8.4 10.8 5 11.2 3 13.2l3.6 1"/><path d="m13.2 15.6-.4 3.4-2 2-1-3.6"/><circle cx="15.5" cy="8.5" r="1.4"/><path d="M6.5 17.5 4 20"/>'),
  star: svgIcon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>', true),
};
const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#e89a10"/><circle cx="12" cy="12" r="9" fill="#ffc52e"/><circle cx="12" cy="12" r="6.6" fill="#ffdb6b"/><path d="m12 7.3 1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5L12 7.3Z" fill="#e89a10"/></svg>';

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('wcdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let levels = null;
let levelsPromise = null;          // уровни — одни на страницу, переживают закрытие игры
let progress = emptyProgress();
let stats = emptyStats();
let settings = { skin: 'telegram', scene: 'auto' };
let n = 1;                         // номер уровня
let level = null;
let state = null;
let path = [];                     // выбранные буквы: номера мест в круге
let dragging = false;
let pointer = null;                // где палец — в долях круга (0…100)
let picking = false;               // подсказка «в клетку»: ждём, какую клетку выберет игрок
let done = false;                  // уровень пройден, висит окно «Дальше»
let flying = new Set();            // клетки, к которым ещё летят буквы
let shownCoins = 0;                // сколько монет на счётчике (догоняет настоящее число, когда долетает монета)
let sceneKey = '';
let sceneFlip = false;
let modalActive = false;
let modalToken = 0;
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

const canPlay = () => Boolean(level && state && !done && !modalActive);
const started = () => Boolean(state && (state.found.length || state.open.length || state.bonus.length));
const saveState = () => state && !done && api?.storage.set('current', state);
const saveProgress = () => api?.storage.set('progress', progress);
const letterAt = (slot) => level.letters[state.order[slot]];
const wordOf = (slots) => slots.map(letterAt).join('');

// ---------- раскладка круга ----------

/** Центр буквы на месте slot — в долях круга (0…100). */
function slotCenter(slot) {
  const count = level.letters.length;
  const r = count <= 4 ? 27 : 31;
  const a = -Math.PI / 2 + (slot * Math.PI * 2) / count;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
}
const letterSize = () => [0, 0, 0, 32, 30, 27, 24, 22][level.letters.length] ?? 22;

/** Место в круге под точкой (в долях круга) или −1. */
function slotAt(p) {
  const hit = (letterSize() / 2) * 1.02;
  for (let slot = 0; slot < level.letters.length; slot++) {
    const c = slotCenter(slot);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= hit) return slot;
  }
  return -1;
}

/** Положение элемента внутри корня игры. */
function rectIn(node) {
  const a = node.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

// ---------- отрисовка ----------

const POP_IN = [{ opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1.14, offset: 0.6 }, { opacity: 1, scale: 1 }];
const BUMP = [{ scale: 1 }, { scale: 1.22 }, { scale: 1 }];

function buildBoard() {
  ui.board.style.setProperty('--cols', level.cols);
  ui.board.style.setProperty('--rows', level.rows);
  ui.cells = level.cells.map((c, i) => {
    const cell = el('div', { class: 'wc-cell', 'data-cell': i });
    cell.style.gridColumn = String(c.x + 1);
    cell.style.gridRow = String(c.y + 1);
    return cell;
  });
  ui.board.replaceChildren(...ui.cells);
}

function setCell(i, on) {
  const cell = ui.cells[i];
  if (!cell) return;
  cell.classList.toggle('wc-on', on);
  cell.textContent = on ? level.cells[i].ch : '';
}

/** Клетки по состоянию; к которым ещё летят буквы — не трогаем (их откроет приземление). */
function renderBoard() {
  const shown = shownCells(level, state);
  level.cells.forEach((_, i) => {
    if (!flying.has(i)) setCell(i, shown.has(i));
  });
}

function buildWheel() {
  const size = letterSize();
  ui.wheel.style.setProperty('--size', `${size}%`);
  ui.wheel.style.setProperty('--font', `${(size * 0.62).toFixed(1)}cqw`);
  ui.letters = level.letters.map((ch, index) => el('span', { class: 'wc-letter', 'data-letter': index }, ch));
  ui.wheel.replaceChildren(ui.line, ...ui.letters);
  placeLetters();
}

/** Буквы — по своим местам в круге (перемешивание двигает их плавно). */
function placeLetters() {
  state.order.forEach((index, slot) => {
    const c = slotCenter(slot);
    const node = ui.letters[index];
    node.style.left = `${c.x}%`;
    node.style.top = `${c.y}%`;
  });
}

/** Линия по выбранным буквам, сами буквы и слово над кругом. */
function renderPath() {
  const chosen = new Set(path.map((slot) => state.order[slot]));
  ui.letters.forEach((node, index) => node.classList.toggle('wc-picked', chosen.has(index)));
  const pts = path.map(slotCenter);
  if (dragging && pointer && pts.length) pts.push(pointer);
  ui.linePath.setAttribute('points', pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  renderPreview();
}

function renderPreview() {
  const word = path.length ? wordOf(path) : '';
  ui.preview.classList.remove('wc-bad', 'wc-good', 'wc-dim');
  if (word) {
    const have = ui.preview.children.length;
    const chars = [...word];
    // буквы добавляются и убираются с конца — дорисовываем только разницу, чтобы новая буква «впрыгивала»
    while (ui.preview.children.length > chars.length) ui.preview.lastChild.remove();
    chars.forEach((ch, k) => {
      if (k < have && ui.preview.children[k]?.textContent === ch && ui.preview.children[k].tagName === 'B') return;
      const node = el('b', {}, ch);
      if (ui.preview.children[k]) ui.preview.children[k].replaceWith(node);
      else ui.preview.append(node);
      animate(node, POP_IN, { duration: 160, easing: 'ease-out' });
    });
    ui.preview.hidden = false;
    return;
  }
  const hint = picking ? T.pickCell : (level && state && !started() && n <= 2 && !done ? T.swipe : '');
  ui.preview.replaceChildren(...(hint ? [el('i', {}, hint)] : []));
  ui.preview.classList.toggle('wc-dim', Boolean(hint));
  ui.preview.hidden = !hint;
}

function renderCoins() {
  ui.coins.textContent = String(shownCoins);
}

function renderTools() {
  const hidden = level && state ? hiddenCells(level, state).length : 0;
  for (const [key, btn] of [['letter', ui.bulb], ['cell', ui.target], ['rocket', ui.rocket]]) {
    btn.classList.toggle('wc-tool-poor', progress.coins < COSTS[key]);
    btn.classList.toggle('wc-tool-off', !hidden || done);
  }
  ui.target.classList.toggle('wc-tool-active', picking);
  ui.bonusCount.textContent = String(state ? state.bonus.length : 0);
  ui.bonusCount.hidden = !state?.bonus.length;
  ui.shuffle.classList.toggle('wc-tool-off', done);
}

function renderHeader() {
  ui.levelLabel.textContent = T.level(n);
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('wc-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

/** Пейзаж уровня: по главе или выбранный в настройках. Меняется наплывом — два слоя по очереди. */
function applyScene() {
  const chapter = chapterOf(n);
  const id = settings.scene === 'auto' ? sceneOfChapter(chapter).id : settings.scene;
  const key = id === 'none' ? 'none' : `${id}:${chapter}`;
  if (key === sceneKey) return;
  sceneKey = key;
  sceneFlip = !sceneFlip;
  const [front, back] = sceneFlip ? [ui.sceneA, ui.sceneB] : [ui.sceneB, ui.sceneA];
  front.style.backgroundImage = id === 'none' ? 'none' : sceneUrl(id, chapter);
  front.classList.add('wc-scene-on');
  back.classList.remove('wc-scene-on');
  root.classList.toggle('wc-plain', id === 'none');
}

const sceneName = () => (settings.scene === 'auto' ? sceneOfChapter(chapterOf(n)).name
  : SCENES.find((s) => s.id === settings.scene)?.name ?? '');

// ---------- полёты ----------

/** Клетка открылась: буква, «впрыгивание», тихий стук. */
function landCell(i, step = 0) {
  flying.delete(i);
  if (!ui?.cells?.[i]) return;
  setCell(i, true);
  animate(ui.cells[i], POP_IN, { duration: 240, easing: 'ease-out' });
  sfx('drop', { step });
}

/** Буквы слова летят из строки над кругом в свои клетки. → сколько это займёт, мс. */
function flyWord(chars, fromRects, cellIds) {
  cellIds.forEach((c) => flying.add(c));
  if (reducedMotion()) {
    cellIds.forEach((c, k) => landCell(c, k));
    return 0;
  }
  const lv = level;
  chars.forEach((ch, k) => {
    const cell = ui.cells[cellIds[k]];
    const to = rectIn(cell);
    const from = fromRects[k] ?? to;
    const ghost = el('span', { class: 'wc-fly' }, ch);
    Object.assign(ghost.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px`, fontSize: `${from.h * 0.62}px` });
    ui.layer.append(ghost);
    const dx = to.x + to.w / 2 - (from.x + from.w / 2);
    const dy = to.y + to.h / 2 - (from.y + from.h / 2);
    const s = to.w / Math.max(1, from.w);
    animate(ghost, [
      { translate: '0 0', scale: 1 },
      { translate: `${dx * 0.55}px ${dy * 0.55 - 26}px`, scale: Math.max(s, 1) * 1.18, offset: 0.55 },
      { translate: `${dx}px ${dy}px`, scale: s },
    ], { duration: 430, delay: k * 60, easing: 'cubic-bezier(0.3, 0.1, 0.3, 1)', fill: 'both' }).then(() => {
      ghost.remove();
      if (level === lv) landCell(cellIds[k], k);
    });
  });
  return 430 + chars.length * 60;
}

/** Монета летит от from к счётчику; долетев, счётчик показывает новое число. */
function flyCoins(from, count = 1) {
  const settle = () => {
    shownCoins = progress.coins;
    if (!ui) return;
    renderCoins();
    animate(ui.coinPill, BUMP, { duration: 260, easing: 'ease-out' });
  };
  if (reducedMotion() || !from) {
    settle();
    return;
  }
  const a = rectIn(from);
  const b = rectIn(ui.coinIcon);
  const pieces = Math.min(6, Math.max(1, count));
  for (let k = 0; k < pieces; k++) {
    const coin = el('span', { class: 'wc-coin wc-fly-coin' });
    coin.innerHTML = COIN;
    Object.assign(coin.style, { left: `${a.x + a.w / 2 - 11}px`, top: `${a.y + a.h / 2 - 11}px` });
    ui.layer.append(coin);
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const bend = (k - (pieces - 1) / 2) * 26;
    animate(coin, [
      { translate: '0 0', scale: 0.4, opacity: 0 },
      { translate: `${bend}px -24px`, scale: 1.15, opacity: 1, offset: 0.25 },
      { translate: `${dx}px ${dy}px`, scale: 0.8, opacity: 1 },
    ], { duration: 620, delay: k * 70, easing: 'cubic-bezier(0.4, 0, 0.4, 1)', fill: 'both' }).then(() => {
      coin.remove();
      if (k === 0) sfx('coin');
      if (k === pieces - 1) settle();
    });
  }
}

/** Цифра «−25» всплывает у счётчика монет. */
function floatCost(cost) {
  shownCoins = progress.coins;
  renderCoins();
  animate(ui.coinPill, BUMP, { duration: 260, easing: 'ease-out' });
  if (reducedMotion()) return;
  const a = rectIn(ui.coinPill);
  const node = el('span', { class: 'wc-float' }, `−${cost}`);
  Object.assign(node.style, { left: `${a.x + a.w / 2}px`, top: `${a.y + a.h}px` });
  ui.layer.append(node);
  animate(node, [
    { opacity: 0, translate: '-50% -6px' }, { opacity: 1, translate: '-50% 4px', offset: 0.25 }, { opacity: 0, translate: '-50% 22px' },
  ], { duration: 900, easing: 'ease-out', fill: 'forwards' }).then(() => node.remove());
}

/** Слово улетает от строки над кругом к кнопке (бонусное — к звёздочке). */
function flyChip(text, from, to) {
  if (reducedMotion() || !from) return;
  const b = rectIn(to);
  const node = el('span', { class: 'wc-fly-chip' }, text);
  Object.assign(node.style, { left: `${from.x + from.w / 2}px`, top: `${from.y + from.h / 2}px` });
  ui.layer.append(node);
  const dx = b.x + b.w / 2 - (from.x + from.w / 2);
  const dy = b.y + b.h / 2 - (from.y + from.h / 2);
  animate(node, [
    { translate: '-50% -50%', scale: 1, opacity: 1 },
    { translate: `calc(-50% + ${dx * 0.4}px) calc(-50% + ${dy * 0.4 - 30}px)`, scale: 1.1, opacity: 1, offset: 0.4 },
    { translate: `calc(-50% + ${dx}px) calc(-50% + ${dy}px)`, scale: 0.2, opacity: 0.2 },
  ], { duration: 520, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }).then(() => {
    node.remove();
    if (ui) animate(to, BUMP, { duration: 260, easing: 'ease-out' });
  });
}

/** Слово кроссворда «подпрыгивает» по буквам. */
function bounceWord(index) {
  level.words[index]?.cells.forEach((c, k) => {
    if (ui.cells[c]) animate(ui.cells[c], [{ translate: '0 0' }, { translate: '0 -22%' }, { translate: '0 0' }], { duration: 320, delay: k * 45, easing: 'ease-out' });
  });
}

/** Строка над кругом гаснет: слово не подошло (bad) или подошло (good). */
function flashPreview(kind) {
  const node = ui.preview;
  node.classList.add(kind === 'bad' ? 'wc-bad' : 'wc-good');
  if (kind === 'bad') shake(node, { distance: 5, duration: 300 });
  const token = ++ui.previewToken;
  later(() => {
    if (!ui || token !== ui.previewToken || path.length) return;
    renderPreview();
  }, reducedMotion() ? 0 : 420);
}

// ---------- слово ----------

function clearPath() {
  path = [];
  dragging = false;
  pointer = null;
}

/** Игрок отпустил палец: проверяем собранное слово. */
function commit() {
  const slots = path;
  const word = wordOf(slots);
  const letterRects = [...ui.preview.children].filter((c) => c.tagName === 'B').map(rectIn);
  const chipRect = rectIn(ui.preview);
  clearPath();
  ui.letters.forEach((node) => node.classList.remove('wc-picked'));
  ui.linePath.setAttribute('points', '');
  if (slots.length < 2) {
    renderPreview();
    return;
  }
  const res = submit(level, state, word);
  if (res.kind === 'found') {
    stats.words += 1 + res.also.length;
    api.storage.set('stats', stats);
    saveState();
    sfx('found', { step: word.length });
    api.platform.haptic.notification('success');
    ui.preview.replaceChildren();
    ui.preview.hidden = true;
    const ms = flyWord([...word], letterRects, level.words[res.index].cells);
    const lv = level;
    later(() => {
      if (!ui || level !== lv) return;
      renderBoard();
      bounceWord(res.index);
      res.also.forEach(bounceWord);
      renderTools();
      if (isDone(level, state)) complete();
    }, ms + 60);
    return;
  }
  if (res.kind === 'bonus') {
    stats.bonus += 1;
    progress.coins += BONUS_COIN;
    api.storage.set('stats', stats);
    saveProgress();
    saveState();
    sfx('bonus');
    api.platform.haptic.impact('light');
    toast.show(T.bonus, 1100);
    ui.preview.replaceChildren();
    ui.preview.hidden = true;
    flyChip(word, chipRect, ui.star);
    flyCoins(ui.star, BONUS_COIN);
    renderTools();
    return;
  }
  if (res.kind === 'again') {
    sfx('again');
    bounceWord(res.index);
    flashPreview('good');
    return;
  }
  if (res.kind === 'bonus-again') {
    sfx('again');
    toast.show(T.bonusAgain, 1300);
    animate(ui.star, BUMP, { duration: 260, easing: 'ease-out' });
    flashPreview('good');
    return;
  }
  sfx('none');
  api.platform.haptic.notification('error');
  flashPreview('bad');
}

function wheelPoint(e) {
  const r = ui.wheel.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
}

function pushSlot(slot) {
  path.push(slot);
  ui.previewToken++;
  sfx('letter', { step: path.length - 1 });
  api.platform.haptic.selection();
}

function onWheelDown(e) {
  if (!canPlay()) return;
  if (picking) {
    setPicking(false);
    return;
  }
  const p = wheelPoint(e);
  const slot = slotAt(p);
  if (slot < 0) return;
  e.preventDefault();
  dragging = true;
  pointer = p;
  path = [];
  pushSlot(slot);
  try {
    ui.wheel.setPointerCapture?.(e.pointerId);        // палец может уйти за край круга — события всё равно наши
  } catch {
    // указатель уже отпущен — обойдёмся без захвата
  }
  renderPath();
}

function onWheelMove(e) {
  if (!dragging) return;
  pointer = wheelPoint(e);
  const slot = slotAt(pointer);
  if (slot >= 0) {
    if (!path.includes(slot)) pushSlot(slot);
    else if (path.length >= 2 && slot === path[path.length - 2]) {
      path.pop();                                   // вернулся на предыдущую букву — последняя снимается
      sfx('back', { step: path.length });
    }
  }
  renderPath();
}

function onWheelUp() {
  if (!dragging) return;
  commit();
}

function onShuffle() {
  if (!canPlay()) return;
  if (picking) setPicking(false);
  clearPath();
  state.order = reorder(state.order);
  placeLetters();
  renderPath();
  sfx('shuffle');
  api.platform.haptic.impact('light');
  if (!reducedMotion()) animate(ui.shuffle, [{ rotate: '0deg' }, { rotate: '180deg' }], { duration: 300, easing: 'ease-out' });
  saveState();
}

// ---------- подсказки ----------

function poor() {
  toast.show(T.poor, 1400);
  shake(ui.coinPill, { distance: 4, duration: 300 });
  sfx('poor');
  api.platform.haptic.notification('error');
}

/** Клетки открыты подсказкой: показать, пересчитать, проверить конец уровня. */
function afterReveal(res, cost) {
  stats.hints += res.cells.length;
  stats.words += res.words.length;
  api.storage.set('stats', stats);
  saveProgress();
  saveState();
  floatCost(cost);
  sfx('hint');
  api.platform.haptic.impact('light');
  res.cells.forEach((c, k) => {
    flying.add(c);
    later(() => ui && landCell(c, k), reducedMotion() ? 0 : k * 90);
  });
  const lv = level;
  later(() => {
    if (!ui || level !== lv) return;
    renderBoard();
    res.words.forEach(bounceWord);
    renderTools();
    if (isDone(level, state)) complete();
  }, reducedMotion() ? 0 : res.cells.length * 90 + 280);
  renderTools();
}

function hintRandom(key, count) {
  if (!canPlay()) return;
  if (picking) setPicking(false);
  if (!hiddenCells(level, state).length) {
    toast.show(T.nothing, 1300);
    return;
  }
  if (!spend(progress, COSTS[key])) {
    poor();
    return;
  }
  afterReveal(revealRandom(level, state, count), COSTS[key]);
}

function setPicking(on) {
  picking = Boolean(on);
  root.classList.toggle('wc-picking', picking);
  renderTools();
  renderPreview();
}

function onTarget() {
  if (!canPlay()) return;
  if (picking) {
    setPicking(false);
    return;
  }
  if (!hiddenCells(level, state).length) {
    toast.show(T.nothing, 1300);
    return;
  }
  if (progress.coins < COSTS.cell) {
    poor();
    return;
  }
  clearPath();
  renderPath();
  sfx('pick');
  setPicking(true);
}

function onBoardTap(e) {
  if (!picking || !canPlay()) return;
  const node = e.target.closest('[data-cell]');
  if (!node) {
    setPicking(false);
    return;
  }
  const cell = Number(node.dataset.cell);
  if (shownCells(level, state).has(cell)) return;
  if (!spend(progress, COSTS.cell)) {
    setPicking(false);
    poor();
    return;
  }
  const res = revealCell(level, state, cell);
  setPicking(false);
  if (res) afterReveal(res, COSTS.cell);
}

// ---------- уровень ----------

/** Начать уровень n: с сохранённого состояния или с чистого. fresh — уровень сменился на глазах у игрока. */
function startLevel(number, saved = null, fresh = false) {
  n = number;
  level = parseLevel(levelText(levels, n));
  state = isValidState(saved, level, n) ? saved : newState(n, level);
  done = false;
  picking = false;
  flying = new Set();
  clearPath();
  root.classList.remove('wc-picking', 'wc-done');
  buildBoard();
  buildWheel();
  renderBoard();
  renderPath();
  renderHeader();
  renderTools();
  applyScene();
  api.progress(T.level(progress.level));
  if (fresh && !reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, POP_IN, { duration: 260, delay: (level.cells[i].x + level.cells[i].y) * 28, easing: 'ease-out', fill: 'backwards' }));
    ui.letters.forEach((node, i) => animate(node, POP_IN, { duration: 260, delay: 120 + i * 40, easing: 'ease-out', fill: 'backwards' }));
  }
  if (fresh && (n - 1) % CHAPTER === 0 && n > 1 && settings.scene === 'auto') toast.show(T.chapter(chapterOf(n) + 1, sceneName()), 2200);
  if (isDone(level, state)) complete();              // уровень был закрыт, а награду записать не успели
}

/** Уровень пройден: награда, прогресс, волна по плиткам и окно «Дальше». */
function complete() {
  if (done) return;
  done = true;
  setPicking(false);
  clearPath();
  renderPath();
  const passed = n;
  const base = reward(level);
  const extra = endsChapter(passed) ? CHAPTER_BONUS : 0;
  progress.coins += base + extra;
  progress.level = passed + 1;
  stats.levels += 1;
  saveProgress();
  api.storage.set('stats', stats);
  api.storage.remove('current');
  api.progress(T.level(progress.level));
  root.classList.add('wc-done');
  renderTools();
  sfx('win');
  api.platform.haptic.notification('success');
  if (!reducedMotion()) {
    ui.cells.forEach((cell, i) => animate(cell, [{ translate: '0 0', scale: 1 }, { translate: '0 -26%', scale: 1.06 }, { translate: '0 0', scale: 1 }],
      { duration: 420, delay: (level.cells[i].x + level.cells[i].y) * 45, easing: 'ease-out' }));
    burst();
  }
  const gain = el('b', {}, `+${base + extra}`);
  const coin = el('span', { class: 'wc-coin' });
  coin.innerHTML = COIN;
  const nextBtn = el('button', { class: 'btn wc-next', onclick: next }, T.next);
  ui.win.replaceChildren(
    el('div', { class: 'wc-win-title' }, T.praise[passed % T.praise.length]),
    el('div', { class: 'wc-win-sub' }, extra ? `${T.passed(passed)} · ${T.chapterDone}` : T.passed(passed)),
    el('div', { class: 'wc-win-gain' }, coin, gain),
    nextBtn,
  );
  ui.winGain = coin;
  later(() => {
    if (!ui || !done) return;
    showLayer(ui.win);
    later(() => ui && done && flyCoins(ui.winGain, 5), reducedMotion() ? 0 : 380);
  }, reducedMotion() ? 0 : 650);
}

/** Россыпь цветных искр над кроссвордом. */
function burst() {
  const box = rectIn(ui.board);
  const colors = ['#ffd23d', '#ff7aa8', '#5ef2c9', '#7fb4ff', '#ffffff', '#ff9a4a'];
  for (let k = 0; k < 22; k++) {
    const dot = el('span', { class: 'wc-spark' });
    const a = (k / 22) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 110;
    Object.assign(dot.style, { left: `${box.x + box.w / 2}px`, top: `${box.y + box.h / 2}px`, background: colors[k % colors.length] });
    ui.layer.append(dot);
    animate(dot, [
      { translate: '0 0', scale: 0.4, opacity: 1 },
      { translate: `${Math.cos(a) * dist}px ${Math.sin(a) * dist}px`, scale: 1.1, opacity: 1, offset: 0.6 },
      { translate: `${Math.cos(a) * dist * 1.15}px ${Math.sin(a) * dist * 1.15 + 34}px`, scale: 0.3, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' }).then(() => dot.remove());
  }
}

function next() {
  if (!done || !ui) return;
  sfx('click');
  shownCoins = progress.coins;
  renderCoins();
  hideLayer(ui.win);
  startLevel(progress.level, null, true);
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  clearPath();
  if (ui.linePath) renderPath();
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
  return el('div', { class: 'wc-sheet', role: 'dialog', 'aria-label': title },
    el('div', { class: 'wc-sheet-head' },
      el('h2', {}, title),
      el('button', { class: 'wc-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showBonus() {
  if (!level || !state) return;
  const total = level.bonus.size;
  const found = state.bonus;
  openModal(sheet(T.bonusTitle,
    el('p', { class: 'wc-note' }, T.bonusNote(found.length, total)),
    found.length
      ? el('div', { class: 'wc-words' }, found.map((w) => el('span', {}, w)))
      : (total ? el('p', { class: 'wc-rule' }, T.bonusEmpty) : null),
  ));
}

function showHelp() {
  openModal(sheet(T.help.title, T.rules.map((text) => el('p', { class: 'wc-rule' }, text))));
}

function radios(ids, current, make, pick, cls) {
  const buttons = ids.map((id) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(id === current),
    onclick: () => {
      pick(id);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(ids[k] === id)));
      sfx('pick');
    },
  }, make(id)));
  return buttons;
}

/** Образец скина плиток: две клетки (пустая и с буквой) и буква круга. */
const skinSwatch = (id) => [
  el('span', { class: 'wc-swatch', 'data-skin': id }, el('i', {}), el('i', { class: 'wc-on' }, 'а'), el('i', { class: 'wc-swatch-pick' }, 'б')),
  T.skins[id],
];

function sceneSwatch(id) {
  const box = el('span', { class: `wc-scene-thumb${id === 'none' ? ' wc-scene-thumb-none' : ''}` });
  if (id === 'auto') box.append(el('i', {}, 'А'));
  else if (id !== 'none') box.style.backgroundImage = sceneUrl(id, chapterOf(n));
  return [box, id === 'auto' ? T.sceneAuto : id === 'none' ? T.sceneNone : SCENES.find((s) => s.id === id).name];
}

function showSettings() {
  openModal(sheet(T.settings.title,
    el('h3', { class: 'wc-section' }, T.settings.skin),
    el('div', { class: 'wc-skins', role: 'radiogroup' }, radios(SKINS, settings.skin, skinSwatch, (id) => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
    }, 'wc-skin')),
    el('h3', { class: 'wc-section' }, T.settings.scene),
    el('div', { class: 'wc-scenes', role: 'radiogroup' }, radios(SCENE_IDS, settings.scene, sceneSwatch, (id) => {
      settings.scene = id;
      api.storage.set('settings', settings);
      applyScene();
    }, 'wc-skin')),
    el('h3', { class: 'wc-section' }, T.settings.stats),
    el('dl', { class: 'wc-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, stats[k])])),
    pointsInfo(api, 'word-circle'),
  ));
}

function iconButton(icon, label, onclick, cls = 'wc-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

/** Круглая кнопка у круга букв; cost — цена подсказки (под значком). */
function toolButton(icon, label, onclick, cost = null) {
  const button = el('button', { class: 'wc-tool', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  if (cost != null) {
    const coin = el('i', { class: 'wc-coin' });
    coin.innerHTML = COIN;
    button.append(el('span', { class: 'wc-cost' }, String(cost), coin));
  }
  return button;
}

// ---------- клавиатура ----------

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else if (picking) setPicking(false);
    else if (path.length) {
      clearPath();
      renderPath();
    }
    return;
  }
  if (modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (done) next();
    else if (path.length && canPlay()) commit();
    return;
  }
  if (!canPlay() || dragging) return;
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (path.length) {
      path.pop();
      sfx('back', { step: path.length });
      renderPath();
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    onShuffle();
  } else {
    const ch = e.key.toLowerCase().replace('ё', 'е');
    if (ch.length !== 1) return;
    const slot = state.order.findIndex((index, s) => level.letters[index] === ch && !path.includes(s));
    if (slot >= 0) {
      e.preventDefault();
      if (picking) setPicking(false);
      pushSlot(slot);
      renderPath();
    }
  }
}

// ---------- отладка (?wcdebug) ----------

function debugHooks() {
  globalThis.__wordCircle = {
    get n() { return n; },
    get level() { return level; },
    get state() { return state; },
    get progress() { return progress; },
    get done() { return done; },
    /** Собрать слово, как если бы его провели по кругу. */
    word(text) {
      const slots = [];
      for (const ch of text) {
        const slot = state.order.findIndex((index, s) => level.letters[index] === ch && !slots.includes(s));
        if (slot < 0) return false;
        slots.push(slot);
      }
      path = slots;
      renderPath();
      commit();
      return true;
    },
    /** Ненайденные слова кроссворда. */
    left: () => level.words.filter((_, i) => !state.found.includes(i)).map((w) => w.word),
    /** Перейти на уровень (прогресс тоже сдвигается). */
    goto(number) {
      progress.level = number;
      saveProgress();
      hideLayer(ui.win);
      startLevel(number, null, true);
    },
    coins(value) {
      progress.coins = value;
      shownCoins = value;
      saveProgress();
      renderCoins();
      renderTools();
    },
    next,
  };
}

/** Уровни: пока грузятся — надпись; не загрузились — окно с «Повторить». → готовы ли уровни. */
async function loadAll() {
  for (;;) {
    try {
      const loaded = await loadLevels();
      if (!api) return false;
      levels = loaded;
      return true;
    } catch (err) {
      console.warn('уровни', err);
      if (!api) return false;
      await new Promise((resolve) => {
        ui.modal.replaceChildren(el('div', { class: 'wc-sheet', role: 'alert' },
          el('h2', {}, T.loadError),
          el('button', {
            class: 'btn wc-next',
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
  id: 'word-circle',
  title: 'Круг слов',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedProgress, saved, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('progress'), api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = migrateProgress(savedProgress);
    stats = migrateStats(savedStats);
    settings = {
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
      scene: SCENE_IDS.includes(savedSettings?.scene) ? savedSettings.scene : 'auto',
    };
    host.dataset.skin = settings.skin;
    shownCoins = progress.coins;

    ui = {
      sceneA: el('div', { class: 'wc-scene' }),
      sceneB: el('div', { class: 'wc-scene' }),
      levelLabel: el('b', {}, T.loading),
      coins: el('b', {}),
      board: el('div', { class: 'wc-board' }),
      preview: el('div', { class: 'wc-preview', hidden: true }),
      wheel: el('div', { class: 'wc-wheel' }),
      layer: el('div', { class: 'wc-layer' }),
      win: el('div', { class: 'wc-win', hidden: true }),
      modal: el('div', { class: 'wc-modal', hidden: true }),
      bonusCount: el('em', { hidden: true }),
      cells: [],
      letters: [],
      previewToken: 0,
    };
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('viewBox', '0 0 100 100');
    line.setAttribute('class', 'wc-line');
    line.innerHTML = '<polyline fill="none" points=""/>';
    ui.line = line;
    ui.linePath = line.querySelector('polyline');
    ui.coinIcon = el('span', { class: 'wc-coin' });
    ui.coinIcon.innerHTML = COIN;
    ui.coinPill = el('div', { class: 'wc-pill wc-coins', 'aria-label': T.coins, title: T.coins }, ui.coinIcon, ui.coins);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    ui.shuffle = toolButton(ICONS.shuffle, T.shuffle, onShuffle);
    ui.target = toolButton(ICONS.target, T.hintCell, onTarget, COSTS.cell);
    ui.bulb = toolButton(ICONS.bulb, T.hintLetter, () => hintRandom('letter', 1), COSTS.letter);
    ui.rocket = toolButton(ICONS.rocket, T.hintRocket, () => hintRandom('rocket', ROCKET_CELLS), COSTS.rocket);
    ui.star = toolButton(ICONS.star, T.bonusOpen, showBonus);
    ui.star.classList.add('wc-star');
    ui.star.append(ui.bonusCount);
    ui.board.addEventListener('click', onBoardTap);
    ui.wheel.addEventListener('pointerdown', onWheelDown);
    ui.wheel.addEventListener('pointermove', onWheelMove);
    ui.wheel.addEventListener('pointerup', onWheelUp);
    ui.wheel.addEventListener('pointercancel', onWheelUp);

    root = el('div', { class: 'wc' },
      ui.sceneA, ui.sceneB, el('div', { class: 'wc-shade' }),
      el('div', { class: 'wc-body' },
        el('div', { class: 'wc-header' },
          el('div', { class: 'wc-pill wc-level' }, ui.levelLabel),
          el('div', { class: 'wc-actions' },
            ui.coinPill,
            ui.soundBtn,
            iconButton(ICONS.help, T.help.open, showHelp),
            iconButton(ICONS.gear, T.settings.open, showSettings),
          ),
        ),
        el('div', { class: 'wc-board-wrap' }, ui.board),
        el('div', { class: 'wc-preview-row' }, ui.preview),
        el('div', { class: 'wc-dock' },
          el('div', { class: 'wc-tools' }, ui.shuffle, ui.target, ui.star),
          ui.wheel,
          el('div', { class: 'wc-tools' }, ui.bulb, ui.rocket),
          ui.win,
        ),
      ),
      ui.layer,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    renderCoins();
    document.addEventListener('keydown', onKeydown);

    const ready = await loadAll();
    if (!ready) return;
    if (isDebug()) debugHooks();
    startLevel(progress.level, saved, false);
  },

  getState() {
    if (!state || done || !started()) return null;
    saveState();
    return { level: n };
  },

  destroy() {
    if (started()) saveState();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (globalThis.__wordCircle) delete globalThis.__wordCircle;
    api = host = root = ui = toast = levels = level = state = pointer = null;
    path = [];
    flying = new Set();
    dragging = picking = done = modalActive = sceneFlip = false;
    sceneKey = '';
    n = 1;
    shownCoins = 0;
    progress = emptyProgress();
    stats = emptyStats();
    settings = { skin: 'telegram', scene: 'auto' };
  },
};
