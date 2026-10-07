// «Города» — игра в города против бота: каждый следующий город начинается на последнюю букву предыдущего.
// На экране — глобус из точек: к каждому названному городу он поворачивается и рисует дугу маршрута. Под ним —
// карточка последнего города (страна, население, сколько до него летели) и буква, на которую нужен следующий.
// Ввод — своя клавиатура внизу (и обычная на компьютере, раскладка не важна).
// База городов (data/cities.json) грузится один раз на страницу. Партия, статистика и настройки (скин глобуса) —
// в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { createGlobe } from './globe.js';
import { parseColor, GLOBE_COLORS } from './colors.js';
import {
  LEVEL_IDS, TIMERS, HINTS, ALPHABET,
  createAtlas, newGame, replay, checkMove, botMove, hint, examples, lastLetter, hasFree, distance, turnOf, mineOf,
  emptyStats, migrateStats, recordGame, titleCase, formatKm, formatPop, citiesWord,
} from './logic.js';

const SKINS = ['telegram', 'ocean', 'space', 'atlas', 'neon', 'forest'];
const KEY_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
const MAX_TYPED = 36;
const TRAIL = 6;                   // сколько последних городов видно строкой под глобусом
// клавиши компьютера по месту — чтобы набирать, не переключая раскладку
const CODES = {
  KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н', KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з',
  BracketLeft: 'х', BracketRight: 'ъ', KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р', KeyJ: 'о',
  KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э', KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м', KeyB: 'и', KeyN: 'т',
  KeyM: 'ь', Comma: 'б', Period: 'ю', Backquote: 'е', Minus: '-',
};

const T = {
  title: 'Города',
  levels: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', master: 'Мастер' },
  levelHint: {
    easy: 'Самые известные города',
    medium: 'Сотни городов',
    hard: 'Больше тысячи, хитрит',
    master: 'Тысячи городов, хитрит',
  },
  timers: { 0: 'Без времени', 60: '60 секунд', 30: '30 секунд' },
  timerShort: { 60: '60 с', 30: '30 с' },
  you: 'Вы',
  bot: 'Бот',
  loading: 'Загружаю города…',
  loadError: 'Не удалось загрузить города',
  retry: 'Повторить',
  first: 'Назовите любой город',
  firstMeta: 'Первый ход — ваш. Дальше — на последнюю букву.',
  anyCity: 'Любой город',
  cityOn: (ch) => `Город на «${ch}»`,
  botThinks: 'Бот думает',
  errors: {
    letter: (ch) => `Нужен город на «${ch}»`,
    unknown: 'Не знаю такого города',
    used: (name) => `Уже называли: ${name}`,
  },
  km: (km) => `+${formatKm(km)}`,
  hint: 'Подсказка',
  noHints: 'Подсказки кончились',
  noHint: 'Подсказать нечего',
  giveUp: 'Сдаться',
  giveUpTitle: 'Сдаться?',
  giveUpNote: 'Партия засчитается как поражение.',
  send: 'Назвать',
  erase: 'Стереть',
  space: 'пробел',
  cancel: 'Отмена',
  close: 'Закрыть',
  newGame: 'Новая партия',
  level: 'Бот',
  timer: 'Время на ход',
  start: 'Играть',
  abandon: 'Начатая партия засчитается как поражение.',
  win: 'Победа!',
  lose: 'Поражение',
  botLost: (ch) => `Бот не знает города на «${ch}»`,
  botLostAny: 'Бот не знает больше городов',
  botGivesUp: 'Бот сдаётся',
  timeUp: 'Время вышло',
  youGaveUp: 'Вы сдались',
  could: (list) => `Можно было: ${list.join(', ')}`,
  newRecord: 'Новый рекорд!',
  route: { open: 'Маршрут', title: 'Маршрут' },
  stats: {
    open: 'Статистика', title: 'Статистика', played: 'Партий', wins: 'Побед', best: 'Рекорд',
    note: 'Рекорд — сколько городов вы назвали за одну партию.',
    cities: 'Названо городов', km: 'Пройдено', far: 'Самый длинный маршрут',
  },
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Глобус' },
  skins: { telegram: 'По умолчанию', ocean: 'Океан', space: 'Космос', atlas: 'Старая карта', neon: 'Неон', forest: 'Лес' },
  rules: [
    'Называйте города по очереди с ботом. Каждый следующий город начинается на последнюю букву предыдущего: Москва — Архангельск — Курск.',
    'Если город кончается на Ь, Ъ или Ы, берётся буква перед ними: после Казани — город на Н. Ё и Е — одна буква. Повторять города нельзя.',
    'Бот знает не все города: чем выше уровень, тем больше. Не знает города на нужную букву — сдаётся, и вы победили. Сдались вы или вышло время — поражение.',
    'Хитрость: на редкие буквы городов мало. Называйте города, которые кончаются на Й, Я, Ц или Ф, — и бот быстрее останется без ответа.',
    'Подсказка впишет в поле известный город на нужную букву — их три на партию. Глобус можно крутить пальцем, а по строке городов под ним открывается весь маршрут.',
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
  send: svgIcon('<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>'),
  erase: svgIcon('<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  flag: svgIcon('<path d="M5 21V4"/><path d="M5 4.5c5-2.5 7 2.5 13 0v9c-6 2.5-8-2.5-13 0"/>'),
  route: svgIcon('<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17.3C13 16 10 8.5 15.9 6.8"/>'),
  clock: svgIcon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/>'),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('ctdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let atlas = null;
let atlasPromise = null;           // база — одна на страницу, переживает закрытие игры
let game = null;
let view = null;                   // разбор партии: { used, cities, legs, km, need }
let stats = emptyStats();
let setup = { level: 'easy', timer: 0 };
let settings = { skin: 'telegram' };
let typed = '';
let busy = false;                  // бот думает
let over = false;
let hinting = false;               // подсказка «набирается» в поле
let clock = null;                  // таймер хода: { total, left, last, id, beat }
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let keyCount = 0;
let themeWatch = null;
let themeTimer = 0;
let debugStump = false;            // отладка: бот не найдёт ответа
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

function loadAtlas() {
  atlasPromise ??= fetch(new URL('./data/cities.json', import.meta.url))
    .then((res) => {
      if (!res.ok) throw new Error(`города: ${res.status}`);
      return res.json();
    })
    .then(createAtlas)
    .catch((err) => {
      atlasPromise = null;
      throw err;
    });
  return atlasPromise;
}

const save = () => game && !over && game.chain.length && api?.storage.set('current', game);
const myTurn = () => Boolean(game && atlas && !over && !busy && turnOf(game) === 0);
const bestOf = () => Math.max(0, ...LEVEL_IDS.map((id) => stats[id].best));

function reportProgress() {
  const best = bestOf();
  api?.progress(best ? `Рекорд: ${best}` : null);
}

// ---------- отрисовка ----------

const FADE_IN = [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }];
const POP_IN = [{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.12, offset: 0.6 }, { opacity: 1, scale: 1 }];

/** Название с подсвеченной буквой, на которую нужен следующий город; пропущенный хвост (ь, ы) — бледный. */
function nameNodes(name, need) {
  if (!need) return [name];
  return [
    name.slice(0, need.pos),
    el('b', { class: 'ct-hot' }, name[need.pos]),
    need.pos < name.length - 1 ? el('span', { class: 'ct-skip' }, name.slice(need.pos + 1)) : null,
  ];
}

function nameSize(name) {
  const n = name.length;
  return n <= 11 ? 'ct-name-xl' : n <= 16 ? 'ct-name-l' : n <= 22 ? 'ct-name-m' : 'ct-name-s';
}

/** Карточка последнего города: кто назвал, название, страна · население · перелёт; справа — буква следующего хода. */
function renderCard(fresh = false) {
  const chain = game?.chain ?? [];
  let who = '';
  let by = '';
  let name = [T.first];
  let size = 'ct-name-m';
  let meta = T.firstMeta;
  let letter = '?';
  if (ui.final) {
    ({ who, name, meta } = ui.final);
    by = ui.final.by;
    size = 'ct-name-m';
    letter = ui.final.letter;
  } else if (!atlas) {
    name = [T.loading];
    meta = '';
  } else if (chain.length) {
    const last = chain[chain.length - 1];
    const city = view.cities[view.cities.length - 1];
    who = last.by ? T.bot : T.you;
    by = last.by ? 'bot' : 'me';
    name = nameNodes(last.name, view.need);
    size = nameSize(last.name);
    const leg = view.legs[view.legs.length - 1];
    const canon = atlas.name(city);
    meta = [canon !== last.name ? canon : null, atlas.country(city), formatPop(atlas.pop(city)), leg != null ? T.km(leg) : null]
      .filter(Boolean).join(' · ');
    letter = view.need ? view.need.letter.toUpperCase() : '?';
  }
  ui.who.textContent = who;
  ui.who.dataset.by = by;
  ui.name.className = `ct-name ${size}`;
  ui.name.replaceChildren(...name.filter((n) => n != null));
  ui.meta.textContent = meta;
  const changed = ui.letter.textContent !== letter;
  ui.letter.textContent = letter;
  ui.badge.classList.toggle('ct-badge-mine', myTurn());
  ui.badge.classList.toggle('ct-badge-off', Boolean(ui.final) || !game);
  if (fresh) {
    animate(ui.cardBody, FADE_IN, { duration: 260, easing: 'ease-out' });
    if (changed) animate(ui.letter, POP_IN, { duration: 300, easing: 'ease-out' });
  }
}

/** Строка последних городов под глобусом: «Москва › Архангельск › Курск». */
function renderTrail(fresh = false) {
  const chain = game?.chain ?? [];
  const from = Math.max(0, chain.length - TRAIL);
  const nodes = [];
  for (let k = from; k < chain.length; k++) {
    if (k > from) nodes.push(el('i', {}, '›'));
    nodes.push(el('span', { class: `ct-crumb ct-by-${chain[k].by}` }, chain[k].name));
  }
  ui.trail.replaceChildren(...nodes);
  ui.trail.hidden = chain.length < 2;
  if (fresh && nodes.length) animate(nodes[nodes.length - 1], FADE_IN, { duration: 260, easing: 'ease-out' });
}

function renderEntry() {
  let hintText = '';
  let thinking = false;
  if (!atlas) hintText = T.loading;
  else if (!game || over) hintText = '';
  else if (turnOf(game) === 1 || busy) {
    hintText = T.botThinks;
    thinking = true;
  } else hintText = view.need ? T.cityOn(view.need.letter.toUpperCase()) : T.anyCity;
  const shown = titleCase(typed);
  ui.text.textContent = shown;
  ui.placeholder.textContent = shown ? '' : hintText;
  ui.placeholder.classList.toggle('ct-thinking', thinking && !shown);
  ui.field.classList.toggle('ct-field-on', myTurn());
  ui.send.disabled = !myTurn() || !typed.trim();
}

function setNumber(node, text) {
  if (node.textContent === text) return;
  const first = node.textContent === '';
  node.textContent = text;
  if (!first) animate(node, [{ scale: 1 }, { scale: 1.18 }, { scale: 1 }], { duration: 280, easing: 'ease-out' });
}

function renderInfo() {
  const mine = game ? mineOf(game) : 0;
  ui.sub.textContent = game ? [T.levels[game.level], T.timerShort[game.timer]].filter(Boolean).join(' · ') : '';
  // «6 городов · 12 480 км»: сколько назвал игрок и длина всего маршрута
  const km = view?.km ?? 0;
  ui.kmChip.hidden = !mine;
  setNumber(ui.count, mine ? (mine < 100 ? citiesWord(mine) : String(mine)) : '');
  ui.kmSep.hidden = !km;
  ui.km.hidden = !km;
  setNumber(ui.km, km ? formatKm(km) : '');
  setNumber(ui.hints, String(game ? game.hints : HINTS));
  ui.hintKey.disabled = !myTurn() || !game.hints;
  ui.giveKey.disabled = !myTurn() || !game.chain.length;
  renderClock();
}

function renderAll(fresh = false) {
  renderCard(fresh);
  renderTrail(fresh);
  renderEntry();
  renderInfo();
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('ct-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

/** Подпись и «пульс» у последнего города: глобус сообщает, где он на экране. */
function placePin(pin) {
  if (!ui) return;
  const chain = game?.chain ?? [];
  const show = pin.visible && chain.length > 0;
  ui.pin.classList.toggle('ct-pin-on', show);
  if (!show) return;
  ui.pin.style.left = `${pin.x}px`;
  ui.pin.style.top = `${pin.y}px`;
  const last = chain[chain.length - 1];
  if (ui.pinLabel.textContent !== last.name) ui.pinLabel.textContent = last.name;
  ui.pin.dataset.by = last.by ? 'bot' : 'me';
}

/** Цвета глобуса — из переменных скина (через проверочный элемент: Canvas не понимает var() и color-mix()). */
function readColors() {
  if (!ui?.globe) return;
  const probe = el('span', { hidden: true });
  host.append(probe);
  const colors = {};
  for (const key of GLOBE_COLORS) {
    probe.style.color = `var(--ct-g-${key})`;
    colors[key] = parseColor(getComputedStyle(probe).color);
  }
  probe.remove();
  ui.globe.setColors(colors);
}

// ---------- таймер хода ----------

function renderClock() {
  const on = Boolean(clock && game?.timer && !over);
  ui.timeChip.hidden = !on;
  ui.ring.style.strokeDashoffset = on ? String(100 * (1 - Math.max(0, clock.left) / clock.total)) : '100';
  ui.badge.classList.toggle('ct-badge-timed', on);
  if (!on) return;
  const sec = Math.max(0, Math.ceil(clock.left / 1000));
  ui.time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  ui.timeChip.classList.toggle('ct-chip-hurry', sec <= 10);
  ui.badge.classList.toggle('ct-badge-hurry', sec <= 10);
}

function stopClock() {
  if (clock) clearInterval(clock.id);
  clock = null;
  if (ui) {
    ui.badge.classList.remove('ct-badge-hurry');
    renderClock();
  }
}

function tickClock() {
  if (!clock) return;
  const now = performance.now();
  const dt = Math.max(0, now - clock.last);
  clock.last = now;
  // время идёт, только пока игрок может ходить: окно, свёрнутое приложение и ход бота его останавливают
  if (modalActive || document.hidden || !myTurn()) return;
  clock.left -= Math.min(dt, 1000);
  const sec = Math.ceil(clock.left / 1000);
  if (sec !== clock.beat) {
    clock.beat = sec;
    if (sec > 0 && (sec <= 5 || sec === 10)) sfx('tick', { step: sec });
  }
  renderClock();
  if (clock.left <= 0) finishGame('lose', 'time');
}

function startClock() {
  stopClock();
  if (!game?.timer || over) return;
  clock = { total: game.timer * 1000, left: game.timer * 1000, last: performance.now(), beat: game.timer, id: 0 };
  clock.id = setInterval(tickClock, 200);
  renderClock();
}

// ---------- ходы ----------

/** Город назван: в цепочку, на глобус, в карточку. → Promise (глобус долетел). */
function applyMove(city, name, by) {
  const prev = view.cities[view.cities.length - 1];
  game.chain.push({ name, by });
  view.used.add(city);
  view.cities.push(city);
  if (prev != null) {
    const leg = distance(atlas, prev, city);
    view.legs.push(leg);
    view.km += leg;
  }
  view.need = lastLetter(name, (ch) => hasFree(atlas, view.used, ch));
  save();
  ui.globe.spin(false);
  renderAll(true);
  return ui.globe.addStop({ lat: atlas.lat(city), lon: atlas.lon(city), by });
}

/** Ход не принят: сообщение и тряска поля. */
function reject(res) {
  const text = res.error === 'letter' ? T.errors.letter(res.letter.toUpperCase())
    : res.error === 'used' ? T.errors.used(atlas.name(res.city))
      : T.errors.unknown;
  toast.show(text, 1800);
  shake(ui.field, { distance: 5, duration: 320 });
  sfx('error');
  api.platform.haptic.notification('error');
}

/** Ответ бота. flight — полёт глобуса к городу игрока: бот «думает», пока он летит. */
async function botReply(flight = null) {
  busy = true;
  stopClock();
  renderCard();
  renderEntry();
  renderInfo();
  const snapshot = game;
  await Promise.all([flight, later(null, reducedMotion() ? 0 : 650 + Math.random() * 650)]);
  if (!ui || game !== snapshot || over) return;
  const move = debugStump ? null : botMove(atlas, game, view.used, view.need);
  busy = false;
  if (move == null) {
    finishGame('win', 'bot');
    return;
  }
  sfx('bot');
  api.platform.haptic.impact('light');
  applyMove(move, atlas.name(move), 1);
  startClock();
}

function onSend() {
  if (!myTurn() || modalActive || hinting) return;
  if (!typed.trim()) return;
  const res = checkMove(atlas, view.used, view.need, typed);
  if (!res.ok) {
    reject(res);
    return;
  }
  typed = '';
  sfx('accept');
  api.platform.haptic.notification('success');
  botReply(applyMove(res.city, res.name, 0));
}

function type(ch) {
  if (!myTurn() || modalActive || hinting) return;
  if (ch === ' ' || ch === '-') {
    // пробел и дефис — только после буквы, не два подряд
    if (!typed || /[\s-]$/.test(typed)) return;
  }
  if (typed.length >= MAX_TYPED) {
    shake(ui.field, { distance: 3, duration: 220 });
    return;
  }
  typed += ch;
  sfx('key', { step: keyCount++ });
  api.platform.haptic.selection();
  renderEntry();
}

function erase() {
  if (!myTurn() || modalActive || hinting || !typed) return;
  typed = typed.slice(0, -1);
  sfx('erase');
  renderEntry();
}

/** Подсказка: бот «набирает» в поле известный город на нужную букву — остаётся нажать «Назвать». */
async function onHint() {
  if (!myTurn() || modalActive || hinting) return;
  if (!game.hints) {
    toast.show(T.noHints, 1600);
    sfx('error');
    return;
  }
  const city = hint(atlas, view.used, view.need);
  if (city == null) {
    toast.show(T.noHint, 1600);
    return;
  }
  game.hints--;
  save();
  sfx('hint');
  api.platform.haptic.impact('light');
  const name = atlas.name(city);
  const snapshot = game;
  hinting = true;
  typed = '';
  renderInfo();
  for (let k = 1; k <= name.length; k++) {
    typed = name.slice(0, k);
    renderEntry();
    if (!reducedMotion()) await later(null, 28);
    if (!ui || game !== snapshot || over) {
      hinting = false;
      return;
    }
  }
  hinting = false;
  renderEntry();
  animate(ui.send, POP_IN, { duration: 300, easing: 'ease-out' });
}

function onKey(e) {
  const key = e.target.closest('[data-key]');
  if (!key || key.disabled) return;
  e.preventDefault();
  const id = key.dataset.key;
  if (id === 'erase') erase();
  else if (id === 'hint') onHint();
  else if (id === 'give') onGiveUp();
  else type(id === 'space' ? ' ' : id);
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    return;
  }
  if (modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    onSend();
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    erase();
  } else if (e.key === ' ') {
    e.preventDefault();
    type(' ');
  } else {
    const key = e.key.toLowerCase();
    const ch = key.length === 1 && (ALPHABET.includes(key) || key === 'ё' || key === '-') ? key : CODES[e.code];
    if (ch) {
      e.preventDefault();
      type(ch);
    }
  }
}

// ---------- конец партии ----------

function finishGame(outcome, reason) {
  if (over || !game) return;
  over = true;
  busy = false;
  hinting = false;
  typed = '';
  stopClock();
  const mine = mineOf(game);
  const letter = view.need ? view.need.letter.toUpperCase() : '';
  const could = outcome === 'lose' ? examples(atlas, view.used, view.need, 3).map((c) => atlas.name(c)) : [];
  const record = mine > bestOf() && bestOf() > 0;
  recordGame(stats, game.level, outcome, mine, view.km);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  reportProgress();
  ui.final = outcome === 'win'
    ? { who: T.bot, by: 'bot', name: [T.botGivesUp], meta: letter ? T.botLost(letter) : T.botLostAny, letter: '✓' }
    : { who: T.you, by: 'me', name: [reason === 'time' ? T.timeUp : T.youGaveUp], meta: could.length ? T.could(could) : '', letter: letter || '?' };
  renderAll(true);
  ui.globe.spin(true);
  sfx(outcome);
  api.platform.haptic.notification(outcome === 'win' ? 'success' : 'error');
  const parts = [T.levels[game.level], citiesWord(mine)];
  if (view.km) parts.push(formatKm(view.km));
  const tail = [
    outcome === 'win' ? (letter ? T.botLost(letter) : T.botLostAny) : null,
    reason === 'time' ? T.timeUp : null,
    could.length ? T.could(could) : null,
    record ? T.newRecord : null,
  ].filter(Boolean).join('. ');
  // score не передаём: рекорд этой игры — города за партию при любом исходе, его ведёт сама игра (api.progress)
  const result = {
    outcome, locale: 'ru', variant: game.level, title: outcome === 'win' ? T.win : T.lose,
    message: tail ? `${parts.join(' · ')}. ${tail}` : parts.join(' · '),
  };
  later(() => api?.finish(result), reducedMotion() ? 0 : 1700);
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
  if (clock) clock.last = performance.now();
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
}

function card(title, ...children) {
  return el('div', { class: 'ct-sheet', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ct-sheet-head' },
      el('h2', {}, title),
      el('button', { class: 'ct-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Кнопки-переключатели: одна выбрана. */
function radios(ids, current, label, hintOf, pick, cls = 'ct-option') {
  const buttons = ids.map((id) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(id === current),
    onclick: () => {
      pick(id);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(ids[k] === id)));
      sfx('pick');
    },
  }, el('b', {}, label(id)), hintOf ? el('span', {}, hintOf(id)) : null));
  return buttons;
}

const started = () => Boolean(game && !over && game.chain.length >= 2);

/** Окно новой партии: уровень бота и время на ход. */
function showNewGame(closable = true) {
  const content = el('div', { class: 'ct-sheet', role: 'dialog', 'aria-label': T.newGame },
    el('div', { class: 'ct-sheet-head' },
      el('h2', {}, T.newGame),
      closable ? el('button', { class: 'ct-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕') : null,
    ),
    el('h3', { class: 'ct-section' }, T.level),
    el('div', { class: 'ct-levels', role: 'radiogroup' },
      radios(LEVEL_IDS, setup.level, (id) => T.levels[id], (id) => T.levelHint[id], (id) => { setup.level = id; })),
    el('h3', { class: 'ct-section' }, T.timer),
    el('div', { class: 'ct-timers', role: 'radiogroup' },
      radios(TIMERS, setup.timer, (id) => T.timers[id], null, (id) => { setup.timer = id; }, 'ct-option ct-option-small')),
    started() ? el('p', { class: 'ct-note' }, T.abandon) : null,
    el('button', {
      class: 'btn ct-start',
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
  if (started()) {
    // брошенная партия — поражение (если бот уже ответил)
    recordGame(stats, game.level, 'lose', mineOf(game), view.km);
    api.storage.set('stats', stats);
    reportProgress();
  }
  api.storage.remove('current');
  stopClock();
  game = newGame(setup.level, setup.timer);
  view = replay(atlas, game);
  over = false;
  busy = false;
  hinting = false;
  typed = '';
  ui.final = null;
  ui.globe.setStops([]);
  ui.globe.spin(true);
  renderAll(true);
  startClock();
}

function onGiveUp() {
  if (!myTurn() || !game.chain.length) return;
  openModal(card(T.giveUpTitle,
    el('p', { class: 'ct-note' }, T.giveUpNote),
    el('div', { class: 'ct-sheet-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          if (myTurn()) finishGame('lose', 'giveup');
        },
      }, T.giveUp),
    ),
  ));
}

/** Весь маршрут: города по порядку, кто назвал, страна и длина перелёта. */
function showRoute() {
  const chain = game?.chain ?? [];
  if (!chain.length || !view) return;
  const rows = chain.map((step, k) => {
    const city = view.cities[k];
    return el('li', { class: `ct-stop ct-by-${step.by}` },
      el('i', {}, k + 1),
      el('div', {}, el('b', {}, step.name), el('span', {}, atlas.country(city))),
      el('em', {}, k ? T.km(view.legs[k - 1]) : ''),
    );
  });
  const list = el('ol', { class: 'ct-route' }, rows);
  openModal(card(T.route.title,
    el('p', { class: 'ct-note ct-route-sum' }, [citiesWord(chain.length), view.km ? formatKm(view.km) : null].filter(Boolean).join(' · ')),
    list,
  ));
  list.scrollTop = list.scrollHeight;
}

function showStats() {
  const t = stats.total;
  openModal(card(T.stats.title,
    el('table', { class: 'ct-stats' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, T.stats.played), el('th', {}, T.stats.wins), el('th', {}, T.stats.best))),
      el('tbody', {}, LEVEL_IDS.map((id) => {
        const s = stats[id];
        return el('tr', {}, el('td', {}, T.levels[id]), el('td', {}, s.played), el('td', {}, s.wins), el('td', {}, s.best || '—'));
      }))),
    el('p', { class: 'ct-note' }, T.stats.note),
    el('dl', { class: 'ct-totals' },
      el('dt', {}, T.stats.cities), el('dd', {}, t.cities),
      el('dt', {}, T.stats.km), el('dd', {}, t.km ? formatKm(t.km) : '—'),
      el('dt', {}, T.stats.far), el('dd', {}, t.far ? formatKm(t.far) : '—'),
    ),
  ));
}

function showHelp() {
  openModal(card(T.help.title, T.rules.map((text) => el('p', { class: 'ct-rule' }, text))));
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'ct-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      readColors();
      sfx('pick');
    },
  }, el('span', { class: 'ct-swatch', 'data-skin': id }, el('i', {})), T.skins[id]));
  openModal(card(T.settings.title,
    el('h3', { class: 'ct-section' }, T.settings.skin),
    el('div', { class: 'ct-skins', role: 'radiogroup' }, buttons),
    pointsInfo(api, 'cities'),
  ));
}

function iconButton(icon, label, onclick, cls = 'ct-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

/** Клавиатура: три ряда букв, стирание, подсказка, дефис, пробел и «Сдаться». Нажатие — сразу по касанию. */
function buildKeyboard() {
  const key = (id, content, cls = '', label = null) => {
    const b = el('button', { class: `ct-key${cls}`, 'data-key': id, tabIndex: -1 });
    if (label) b.setAttribute('aria-label', label);
    if (typeof content === 'string' && content.startsWith('<')) b.innerHTML = content;
    else b.append(...[content].flat());
    return b;
  };
  const rows = KEY_ROWS.map((letters, r) => {
    const keys = [...letters].map((ch) => key(ch, ch));
    if (r === 2) keys.push(key('erase', ICONS.erase, ' ct-key-wide', T.erase));
    return el('div', { class: `ct-kb-row ct-kb-row-${r + 1}` }, keys);
  });
  const hintIcon = el('span', { class: 'ct-key-icon' });
  hintIcon.innerHTML = ICONS.bulb;
  ui.hints = el('b', {});
  ui.hintKey = key('hint', [hintIcon, ui.hints], ' ct-key-tool ct-key-hint', T.hint);
  const flagIcon = el('span', { class: 'ct-key-icon' });
  flagIcon.innerHTML = ICONS.flag;
  ui.giveKey = key('give', [flagIcon, el('span', {}, T.giveUp)], ' ct-key-tool ct-key-give');
  rows.push(el('div', { class: 'ct-kb-row ct-kb-row-4' },
    ui.hintKey, key('-', '—', ' ct-key-dash', 'дефис'), key('space', T.space, ' ct-key-space'), ui.giveKey));
  const kb = el('div', { class: 'ct-kb' }, rows);
  kb.addEventListener('pointerdown', onKey);
  return kb;
}

// ---------- отладка (?ctdebug) ----------

function debugHooks() {
  globalThis.__cities = {
    get game() { return game; },
    get view() { return view; },
    get atlas() { return atlas; },
    get typed() { return typed; },
    /** Назвать город за игрока (как набрать и нажать «Назвать»). */
    say(name) {
      typed = name;
      onSend();
    },
    /** Город, который можно назвать сейчас. */
    idea() {
      const city = hint(atlas, view.used, view.need);
      return city == null ? null : atlas.name(city);
    },
    /** На следующий город игрока бот не найдёт ответа — проверить победу. */
    stump() {
      debugStump = true;
    },
    /** Сколько миллисекунд осталось на ход. */
    time(ms) {
      if (clock) clock.left = ms;
    },
    giveUp: () => finishGame('lose', 'giveup'),
  };
}

/** База городов: пока грузится — надпись в карточке; не загрузилась — окно с «Повторить». → готова ли база. */
async function loadCities() {
  for (;;) {
    try {
      const loaded = await loadAtlas();
      if (!api) return false;
      atlas = loaded;
      return true;
    } catch (err) {
      console.warn('города', err);
      if (!api) return false;
      await new Promise((resolve) => {
        ui.modal.replaceChildren(el('div', { class: 'ct-sheet', role: 'alert' },
          el('h2', {}, T.loadError),
          el('button', {
            class: 'btn ct-start',
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
  id: 'cities',
  title: 'Города',

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
    setup = {
      level: LEVEL_IDS.includes(savedSetup?.level) ? savedSetup.level : 'easy',
      timer: TIMERS.includes(savedSetup?.timer) ? savedSetup.timer : 0,
    };
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'ct-sub' }),
      stage: el('div', { class: 'ct-stage' }),
      km: el('b', {}),
      count: el('b', {}),
      kmSep: el('i', {}, '·'),
      time: el('b', {}),
      trail: el('button', { class: 'ct-trail', hidden: true, 'aria-label': T.route.open, onclick: showRoute }),
      pinLabel: el('span', { class: 'ct-pin-label' }),
      who: el('div', { class: 'ct-who' }),
      name: el('div', { class: 'ct-name' }),
      meta: el('div', { class: 'ct-meta' }),
      letter: el('b', {}),
      text: el('span', { class: 'ct-text' }),
      placeholder: el('span', { class: 'ct-placeholder' }),
      modal: el('div', { class: 'ct-modal', hidden: true }),
      final: null,
      globe: null,
    };
    ui.pin = el('div', { class: 'ct-pin' }, el('i', { class: 'ct-pin-ring' }), ui.pinLabel);
    const routeIcon = el('span', { class: 'ct-chip-icon' });
    routeIcon.innerHTML = ICONS.route;
    ui.kmChip = el('button', { class: 'ct-chip ct-chip-km', hidden: true, 'aria-label': T.route.open, title: T.route.open, onclick: showRoute }, routeIcon, ui.count, ui.kmSep, ui.km);
    const clockIcon = el('span', { class: 'ct-chip-icon' });
    clockIcon.innerHTML = ICONS.clock;
    ui.timeChip = el('div', { class: 'ct-chip ct-chip-time', hidden: true }, clockIcon, ui.time);
    ui.stage.append(ui.pin, ui.kmChip, ui.timeChip, ui.trail);

    // буква следующего хода в кольце таймера
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 36 36');
    ring.setAttribute('class', 'ct-ring');
    ring.innerHTML = '<circle class="ct-ring-track" cx="18" cy="18" r="15.9155" pathLength="100"/>'
      + '<circle class="ct-ring-left" cx="18" cy="18" r="15.9155" pathLength="100"/>';
    ui.ring = ring.querySelector('.ct-ring-left');
    ui.badge = el('div', { class: 'ct-badge' }, ring, ui.letter);
    ui.cardBody = el('div', { class: 'ct-card-body' }, ui.who, ui.name, ui.meta);

    ui.field = el('div', { class: 'ct-field' }, ui.text, el('i', { class: 'ct-caret' }), ui.placeholder);
    ui.send = iconButton(ICONS.send, T.send, onSend, 'ct-send');
    ui.send.addEventListener('mousedown', (e) => e.preventDefault());
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    const keyboard = buildKeyboard();

    root = el('div', { class: 'ct' },
      el('div', { class: 'ct-header' },
        el('div', { class: 'ct-heading' }, el('div', { class: 'ct-title' }, T.title), ui.sub),
        el('div', { class: 'ct-actions' },
          ui.soundBtn,
          iconButton(ICONS.restart, T.newGame, () => atlas && showNewGame(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      ui.stage,
      el('div', { class: 'ct-card' }, ui.cardBody, ui.badge),
      el('div', { class: 'ct-entry' }, ui.field, ui.send),
      keyboard,
      ui.modal,
      toast.el,
    );
    container.append(root);
    ui.globe = createGlobe(ui.stage, { onPin: placePin });
    readColors();
    ui.globe.resize();
    ui.globe.spin(true);
    renderSoundBtn();
    renderAll();
    document.addEventListener('keydown', onKeydown);
    // тема сменилась — у скина «По умолчанию» другие цвета
    if (typeof MutationObserver === 'function') {
      themeWatch = new MutationObserver(() => {
        clearTimeout(themeTimer);
        themeTimer = setTimeout(readColors, 120);
      });
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    }

    const ready = await loadCities();
    if (!ready) return;
    if (isDebug()) debugHooks();
    reportProgress();

    const parsed = replay(atlas, saved);
    if (parsed && saved.chain.length) {
      game = saved;
      view = parsed;
      over = false;
      ui.globe.spin(false);
      ui.globe.setStops(view.cities.map((city, k) => ({ lat: atlas.lat(city), lon: atlas.lon(city), by: game.chain[k].by })));
      renderAll();
      if (turnOf(game) === 1) botReply();
      else startClock();
    } else {
      game = null;
      view = null;
      renderAll();
      showNewGame(false);
    }
  },

  getState() {
    if (!game || over || !game.chain.length) return null;
    save();
    return { level: game.level, cities: mineOf(game) };
  },

  destroy() {
    save();
    stopClock();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    themeWatch?.disconnect();
    clearTimeout(themeTimer);
    ui?.globe?.destroy();
    toast?.dispose();
    root?.remove();
    if (globalThis.__cities) delete globalThis.__cities;
    api = host = root = ui = toast = game = view = atlas = themeWatch = null;
    typed = '';
    busy = over = hinting = modalActive = debugStump = false;
    keyCount = 0;
    themeTimer = 0;
    stats = emptyStats();
    setup = { level: 'easy', timer: 0 };
    settings = { skin: 'telegram' };
  },
};
