// «Алхимия» — смешиваешь два элемента и открываешь новые: вода + огонь = пар. Стартовых четыре, в базе больше
// тысячи элементов и пяти тысяч рецептов (data.json, собирает tools/alchemy-build.mjs).
// Экран: шапка (звание и счёт), карточка задания («Создай: Пар»), котёл — две ячейки и итог, полка открытых
// элементов с категориями. Касание элемента кладёт его в свободную ячейку; заняты обе — смешиваются сами.
// Задание есть всегда: его цель — элемент, который можно открыть уже сейчас; за выполнение дают подсказки.
// За число открытых — звания, а на трёх порогах — «дары»: новый первоэлемент и его категория, до того запечатанная.
// Прогресс, задание и настройки — в api.storage; партии как таковой нет, поэтому getState() всегда null.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createFx } from '../../shared/fx.js';
import { createSounds } from './sounds.js';
import {
  RANKS, RANK_HINTS, rankOf, questReward, pairKey, titleOf, plural,
  indexData, emptyProgress, migrateProgress, emptyStats, migrateStats, stateOf, recipeOf, isSpent,
  mix, grantGifts, nextGift, frontier, readyRecipe, pickQuest, newQuest, loadQuest, questRecipe, useHint, addHints,
  catProgress, shelf,
} from './logic.js';

const SKINS = ['telegram', 'parchment', 'lab', 'night', 'moss', 'candy'];
const MARKERS = 6;                 // цветов плиток в скине: --al-m1 … --al-m6 (цвет — по категории элемента)
const ORDERS = ['name', 'new'];
const LONG_PRESS = 480;            // мс: долгое нажатие на плитку открывает карточку элемента
const LONG_WORD = 11;              // букв в слове, с которых название на плитке пишется мельче
const WORDS = ['элемент', 'элемента', 'элементов'];

const T = {
  title: 'Алхимия',
  loading: 'Загружаю элементы…',
  loadError: 'Не удалось загрузить элементы',
  retry: 'Повторить',
  menu: (n) => `Открыто: ${n}`,
  count: (n, total) => `${n} из ${total}`,
  quest: (n) => `Задание ${n}`,
  make: 'Создай:',
  questDone: 'Задание выполнено!',
  allDone: 'Все элементы открыты',
  allDoneNote: (left) => (left ? `Осталось найти комбинаций: ${left}` : 'И все комбинации найдены — великое делание завершено'),
  hint: (n) => `Подсказка, осталось ${n}`,
  reroll: 'Другое задание',
  noHints: 'Подсказки кончились — их дают за задания и звания',
  hintShown: 'Рецепт уже подсказан — нажми на него',
  putHint: 'Положить в котёл',
  unknown: 'ещё один элемент',
  idle: 'Нажми на два элемента — посмотрим, что получится',
  second: 'Теперь второй элемент',
  fresh: 'Новое',
  res: {
    new: (name) => `Новый элемент — ${name}!`,
    recipe: (name) => `${name}: новая комбинация`,
    known: (name) => `${name} — уже открыто`,
    none: 'Ничего не вышло',
    sealed: (gift, left) => `Запечатано: нужен дар «${gift}» — до него ещё ${left} ${plural(left, WORDS)}`,
  },
  slot: (k, name) => (name ? `Ячейка ${k + 1}: ${name}, убрать` : `Ячейка ${k + 1}, пусто`),
  result: (name) => `Итог: ${name}, взять в котёл`,
  pin: 'Закрепить первый элемент',
  search: 'Поиск',
  searchHint: 'Название элемента',
  nothing: 'Ничего не найдено',
  emptyShelf: 'Здесь пока пусто',
  order: { name: 'По алфавиту', new: 'Сначала новые' },
  all: 'Все',
  close: 'Закрыть',
  book: { open: 'Коллекция', title: 'Коллекция' },
  found: 'Открыто элементов',
  recipes: 'Найдено комбинаций',
  ready: 'Можно открыть уже сейчас',
  nextRank: (title, left) => `До звания «${title}» — ещё ${left}`,
  topRank: 'Высшее звание',
  nextGift: (left) => `До нового дара — ещё ${left}`,
  sealedCat: (at) => `Откроется на ${at} элементах`,
  moreIn: (n) => `Ещё не открыто: ${n}`,
  card: {
    start: 'Первоэлемент', gift: (at) => `Дар за ${at} открытых элементов`,
    from: 'Как получить', more: (n) => `и ещё ${n} ${plural(n, ['способ', 'способа', 'способов'])} — пока не найдены`,
    none: 'Рецепт ещё не найден: элемент открыт подсказкой',
    into: (n, total) => `Что из него выходит · ${n} из ${total}`,
    put: 'В котёл',
  },
  rank: { title: 'Новое звание', bonus: (n) => `+${n} ${plural(n, ['подсказка', 'подсказки', 'подсказок'])}`, ok: 'Отлично' },
  gift: { title: 'Новый дар', note: (cat) => `Открыта категория «${cat}». Смешивай дар со всем подряд — с ним выходит много нового.` },
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', shelf: 'Полка', hideSpent: 'Прятать исчерпанные', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', parchment: 'Пергамент', lab: 'Лаборатория', night: 'Ночь', moss: 'Мох', candy: 'Леденцы' },
  stats: { found: 'Открыто элементов', recipes: 'Найдено комбинаций', quests: 'Выполнено заданий', mixes: 'Смешиваний', fails: 'Из них впустую', hints: 'Потрачено подсказок' },
  rules: [
    'Начинаешь с четырёх стихий: вода, огонь, земля и воздух. Нажми на два элемента — они смешаются. Вода и огонь дают пар, земля и огонь — лаву, а дальше — тысяча с лишним элементов.',
    'Элемент можно смешать и с самим собой. Одно и то же часто получается разными способами — каждая найденная пара идёт в счёт комбинаций.',
    'Наверху всегда есть задание: «Создай: Пар». Его цель можно собрать из того, что у тебя уже есть. За выполненное задание дают подсказку, за каждое пятое — две.',
    'Лампочка подсказывает рецепт задания: сначала один элемент, потом второй. Стрелки по кругу меняют задание на другое.',
    'Когда выбран первый элемент, на плитках видно, что с ним уже получалось. Плитка с галочкой исчерпана: все её комбинации найдены. Долгое нажатие на плитку — карточка элемента.',
    'За открытые элементы растёт звание. На 50, 150 и 300 элементах вручается дар — новый первоэлемент со своей категорией. До дара её рецепты запечатаны.',
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
  book: svgIcon('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8.5 7.5h7"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>', false, 18),
  swap: svgIcon('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>', false, 18),
  search: svgIcon('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', false, 20),
  sortName: svgIcon('<path d="M4 7h9M4 12h6M4 17h3"/><path d="M17 5v14"/><path d="m13.5 15.5 3.5 3.5 3.5-3.5"/>', false, 20),
  sortNew: svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', false, 20),
  pin: svgIcon('<path d="M9 3h6l-1 6 3.5 3.5h-11L10 9 9 3Z"/><path d="M12 12.5V21"/>', false, 13),
  lock: svgIcon('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', false, 26),
  check: svgIcon('<path d="m5 12.5 4.5 4.5L19 7.5"/>', false, 18),
  plus: svgIcon('<path d="M12 6v12M6 12h12"/>', false, 18),
  equals: svgIcon('<path d="M6 9.5h12M6 14.5h12"/>', false, 18),
  chevron: svgIcon('<path d="m9.5 6 6 6-6 6"/>', false, 16),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('aldebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let db = null;                     // база: разбирается один раз на страницу
let dbPromise = null;
let progress = emptyProgress();
let stats = emptyStats();
let state = null;                  // { found, recipes, left } — множества по прогрессу
let quest = null;
let settings = { skin: 'telegram', order: 'name', hideSpent: false };
let slots = [null, null];          // id элементов в ячейках котла
let arrivals = [null, null];       // «долетает ли» элемент до ячейки
let pinned = false;                // первый элемент остаётся в котле после смешивания
let shown = null;                  // что в кружке итога: { id } | { gift } | null
let cat = null;                    // выбранная категория полки (номер) или null — все
let fresh = new Set();             // открытые в этот заход и ещё не тронутые
let tried = new Set();             // пары, которые в этот заход ничего не дали
let tiles = new Map();             // id → плитка на полке
let openCat = null;                // раскрытая категория в «Коллекции»
let busy = false;                  // идёт смешивание — касания не принимаются
let modalActive = false;
let modalToken = 0;
let sheetOpen = false;
let searchOpen = false;
let soundOn = true;
let press = null;                  // идёт нажатие на плитку: { timer, x, y }
let longPressed = false;           // последнее нажатие было долгим — касание после него не считается
let questBusy = false;             // задание только что выполнено — карточка показывает итог
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

function loadData() {
  dbPromise ??= fetch(new URL('./data.json', import.meta.url))
    .then((res) => {
      if (!res.ok) throw new Error(`элементы: ${res.status}`);
      return res.json();
    })
    .then((raw) => indexData(raw))
    .catch((err) => {
      dbPromise = null;
      throw err;
    });
  return dbPromise;
}

const item = (id) => db.items.get(id);
const nameOf = (id) => titleOf(item(id).name);
const saveProgress = () => api?.storage.set('progress', progress);
const saveStats = () => api?.storage.set('stats', stats);
const saveSettings = () => api?.storage.set('settings', settings);
const saveQuest = () => (quest ? api?.storage.set('quest', quest) : api?.storage.remove('quest'));
const ready = () => Boolean(ui && db && state && !modalActive && !sheetOpen);
const reportProgress = () => api?.progress(state && state.found.size > db.start.length ? T.menu(state.found.size) : null);
const haptic = () => api.platform.haptic;

// ---------- плитки ----------

const POP_IN = [{ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1.2, offset: 0.6 }, { opacity: 1, scale: 1 }];
const BUMP = [{ scale: 1 }, { scale: 1.18 }, { scale: 1 }];

/** Плитка элемента: значок и название; цвет — по категории. */
function tileNode(it, cls = 'al-tile') {
  // название с длинным словом («землетрясение») пишется мельче — иначе слово рвётся посередине
  const long = it.name.split(/[ -]/).some((word) => word.length >= LONG_WORD);
  const node = el('button', { class: cls, 'data-id': it.id },
    el('span', { class: 'al-emoji' }, it.emoji), el('span', { class: `al-name${long ? ' al-name-s' : ''}` }, titleOf(it.name)));
  node.style.setProperty('--m', `var(--al-m${(it.cat % MARKERS) + 1})`);
  return node;
}

/** Маленькая подпись «значок + название» — в подсказке задания и в карточке элемента. */
const chip = (id, cls = 'al-chip') => el('span', { class: cls }, el('span', { class: 'al-emoji' }, item(id).emoji), nameOf(id));

function renderHeader() {
  const n = state.found.size;
  const k = rankOf(n);
  const next = RANKS[k + 1];
  ui.rank.textContent = RANKS[k].title;
  ui.count.textContent = T.count(n, db.total);
  const part = next ? (n - RANKS[k].at) / (next.at - RANKS[k].at) : 1;
  ui.bar.style.width = `${Math.round(Math.max(0.03, Math.min(1, part)) * 100)}%`;
}

function renderChips() {
  const counts = catProgress(db, state.found);
  const make = (value, label, n) => el('button', {
    class: `al-tab${cat === value ? ' al-tab-on' : ''}`, role: 'tab', 'aria-selected': String(cat === value),
    onclick: () => {
      if (cat === value) return;
      cat = value;
      sfx('click');
      renderChips();
      renderShelf();
      ui.shelf.scrollTop = 0;
    },
  }, label, el('i', {}, String(n)));
  ui.tabs.replaceChildren(make(null, T.all, state.found.size),
    ...counts.map((c, k) => (c.found ? make(k, c.title, c.found) : null)).filter(Boolean));
}

/** Полка: открытые элементы выбранной категории в выбранном порядке. */
function renderShelf() {
  const list = shelf(db, state, { cat, order: settings.order, opened: progress.found, hideSpent: settings.hideSpent });
  tiles = new Map();
  ui.shelf.replaceChildren(...list.map((it) => {
    const node = tileNode(it);
    tiles.set(it.id, node);
    return node;
  }));
  if (!list.length) ui.shelf.append(el('p', { class: 'al-empty' }, T.emptyShelf));
  markTiles();
}

/** Пометки на плитках: новая, исчерпанная, лежит в котле; если выбран первый элемент — что с ним уже выходило. */
function markTiles() {
  const first = slots[0] !== null && slots[1] === null ? slots[0] : null;
  for (const [id, node] of tiles) {
    node.classList.toggle('al-fresh', fresh.has(id));
    node.classList.toggle('al-spent', isSpent(state, id));
    node.classList.toggle('al-in', slots.includes(id));
    const recipe = first !== null ? recipeOf(db, first, id) : null;
    const made = recipe && state.recipes.has(recipe.key) ? item(recipe.c).emoji : null;
    let badge = node.querySelector('.al-badge');
    if (made) {
      if (!badge) node.append(badge = el('i', { class: 'al-badge' }));
      badge.textContent = made;
    } else badge?.remove();
    node.classList.toggle('al-tried', first !== null && !made && tried.has(pairKey(first, id)));
  }
}

// ---------- котёл ----------

function setStatus(text, kind = '') {
  ui.status.textContent = text;
  ui.status.className = `al-status${kind ? ` al-status-${kind}` : ''}`;
}

function idleStatus() {
  if (slots[0] !== null && slots[1] === null) setStatus(T.second);
  else if (state.found.size <= db.start.length + 3) setStatus(T.idle);
  else setStatus('');
}

function paintSlots() {
  slots.forEach((id, k) => {
    const slot = ui.slots[k];
    slot.node.classList.toggle('al-full', id !== null);
    slot.emoji.textContent = id !== null ? item(id).emoji : '';
    slot.name.textContent = id !== null ? nameOf(id) : '';
    slot.node.setAttribute('aria-label', T.slot(k, id !== null ? nameOf(id) : ''));
    if (id !== null) slot.node.style.setProperty('--m', `var(--al-m${(item(id).cat % MARKERS) + 1})`);
  });
  ui.pin.hidden = slots[0] === null;
  ui.pin.setAttribute('aria-pressed', String(pinned));
}

function paintResult(kind = '') {
  const id = shown?.id ?? null;
  ui.res.node.className = `al-slot al-res${shown ? ' al-full' : ''}${kind ? ` al-res-${kind}` : ''}`;
  ui.res.emoji.textContent = id !== null ? item(id).emoji : '';
  ui.res.lock.hidden = !shown?.gift;
  ui.res.name.textContent = id !== null ? nameOf(id) : '';
  ui.res.tag.hidden = kind !== 'new';
  ui.res.node.setAttribute('aria-label', id !== null ? T.result(nameOf(id)) : '');
  ui.res.node.disabled = id === null;
  if (id !== null) ui.res.node.style.setProperty('--m', `var(--al-m${(item(id).cat % MARKERS) + 1})`);
}

function clearResult() {
  if (!shown) return;
  shown = null;
  paintResult();
}

const centerOf = (node) => {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Значок перелетает от одного места к другому (поверх всего). */
function fly(emoji, from, to, duration = 240) {
  if (reducedMotion() || !from || !to) return Promise.resolve();
  const base = root.getBoundingClientRect();
  const node = el('span', { class: 'al-flyer al-emoji' }, emoji);
  node.style.left = `${from.x - base.left}px`;
  node.style.top = `${from.y - base.top}px`;
  ui.layer.append(node);
  return animate(node, [
    { translate: '-50% -50%', scale: 0.9 },
    { translate: `calc(-50% + ${to.x - from.x}px) calc(-50% + ${to.y - from.y}px)`, scale: 1.2 },
  ], { duration, easing: EASE_OUT, fill: 'forwards' }).then(() => node.remove());
}

/** Элемент ложится в ячейку k: значок летит от плитки, потом ячейка «подпрыгивает». */
async function land(k, from) {
  const slot = ui.slots[k];
  if (reducedMotion() || !from?.isConnected) return;
  const id = slots[k];
  slot.emoji.style.opacity = '0';
  await fly(item(id).emoji, centerOf(from.querySelector('.al-emoji') ?? from), centerOf(slot.orb));
  if (!ui) return;
  slot.emoji.style.opacity = '';
  animate(slot.orb, BUMP, { duration: 200, easing: 'ease-out' });
}

/** Положить элемент в свободную ячейку (from — плитка, от которой он летит). Заняты обе — смешать. */
async function pick(id, from = null) {
  if (!ready() || busy || !state.found.has(id)) return;
  const k = slots[0] === null ? 0 : slots[1] === null ? 1 : -1;
  if (k < 0) return;
  slots[k] = id;
  fresh.delete(id);
  clearResult();
  sfx('pick', { step: k });
  haptic().selection();
  paintSlots();
  markTiles();
  idleStatus();
  arrivals[k] = land(k, from);
  if (slots[0] === null || slots[1] === null) return;
  busy = true;                     // пока идёт смешивание, новые касания не принимаются
  await Promise.all(arrivals);
  if (!ui) return;
  await combine();
}

function clearSlot(k) {
  if (!ready() || busy || slots[k] === null) return;
  slots[k] = null;
  if (k === 0) {
    pinned = false;
    // второй элемент переезжает на место первого
    if (slots[1] !== null) slots = [slots[1], null];
  }
  sfx('drop');
  paintSlots();
  markTiles();
  idleStatus();
}

function togglePin() {
  if (slots[0] === null) return;
  pinned = !pinned;
  sfx('click');
  paintSlots();
}

/** Цвета вспышки — игровые цвета скина. */
function sparkColors() {
  const cs = getComputedStyle(root);
  return Array.from({ length: MARKERS }, (_, k) => cs.getPropertyValue(`--al-m${k + 1}`).trim()).filter(Boolean);
}

function burstAt(node, count = 14) {
  if (!fx || reducedMotion()) return;
  const base = root.getBoundingClientRect();
  const c = centerOf(node);
  const colors = sparkColors();
  for (let k = 0; k < count; k++) fx.burst(c.x - base.left, c.y - base.top, colors[k % colors.length], 1, { speed: 210, size: 6 });
}

/** Смешать то, что лежит в котле: анимация, итог, задание, звания и дары. */
async function combine() {
  const [a, b] = slots;
  const before = state.found.size;
  const res = mix(db, progress, state, a, b);
  const gifts = res.kind === 'new' ? grantGifts(db, progress, state) : [];
  stats.mixes += 1;
  if (res.kind === 'none') {
    stats.fails += 1;
    tried.add(pairKey(a, b));
  }
  if (res.kind === 'new' || res.kind === 'recipe') saveProgress();
  saveStats();

  const orbs = [ui.slots[0].orb, ui.slots[1].orb];
  if (res.kind === 'none') {
    sfx('fail');
    haptic().notification('error');
    setStatus(T.res.none, 'none');
    await Promise.all(orbs.map((orb) => shake(orb, { distance: 5, duration: 300 })));
  } else {
    sfx('swirl');
    if (!reducedMotion()) {
      const to = centerOf(ui.res.orb);
      await Promise.all(ui.slots.map((slot) => {
        const from = centerOf(slot.orb);
        return animate(slot.emoji, [
          { translate: '0 0', scale: 1, opacity: 1 },
          { translate: `${to.x - from.x}px ${to.y - from.y}px`, scale: 0.5, opacity: 0.2 },
        ], { duration: 230, easing: 'ease-in', fill: 'forwards' });
      }));
    }
  }
  if (!ui) return;

  slots = pinned ? [a, null] : [null, null];
  arrivals = [null, null];
  paintSlots();
  for (const slot of ui.slots) slot.emoji.getAnimations?.().forEach((anim) => anim.cancel());
  if (res.kind === 'sealed') {
    shown = { gift: res.gift };
    paintResult('sealed');
    sfx('sealed');
    haptic().notification('warning');
    setStatus(T.res.sealed(nameOf(res.gift.id), Math.max(1, res.gift.at - state.found.size)), 'sealed');
  } else if (res.kind !== 'none') {
    shown = { id: res.id };
    paintResult(res.kind);
    setStatus(T.res[res.kind](nameOf(res.id)), res.kind);
    if (res.kind === 'new') {
      fresh.add(res.id);
      sfx('new', { step: item(res.id).tier });
      haptic().notification('success');
      burstAt(ui.res.orb);
    } else {
      sfx(res.kind);
      haptic().impact('light');
    }
  }
  if (shown && !reducedMotion()) animate(ui.res.orb, POP_IN, { duration: 320, easing: 'ease-out' });
  busy = false;

  if (res.kind === 'new') {
    renderHeader();
    renderChips();
    renderShelf();
    reportProgress();
    // «сначала новые» — новый элемент встал первым: полка возвращается к началу, чтобы его было видно
    if (settings.order === 'new') ui.shelf.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (!reducedMotion()) {
      animate(ui.count, BUMP, { duration: 260, easing: 'ease-out' });
      const tile = tiles.get(res.id);
      if (tile) animate(tile, POP_IN, { duration: 320, easing: 'ease-out' });
    }
    await afterDiscovery(res.id, before, gifts);
  } else markTiles();
}

/** После нового элемента: выполнено ли задание, новое звание, дары. */
async function afterDiscovery(id, before, gifts) {
  const rankUp = rankOf(state.found.size) - rankOf(before);
  if (rankUp > 0) {
    addHints(progress, RANK_HINTS * rankUp);
    saveProgress();
  }
  // карточка задания показывает «выполнено» сама, окно звания её не ждёт
  if (quest && quest.id === id) completeQuest();
  else if (!questBusy) {
    if (quest) renderQuest();
    else nextQuest();
  }
  if (rankUp > 0 || gifts.length) {
    await later(null, reducedMotion() ? 0 : 450);
    if (ui) showMilestone(rankUp > 0 ? rankOf(state.found.size) : null, rankUp, gifts);
  }
}

// ---------- задание ----------

function renderQuest() {
  if (questBusy) return;
  ui.hintCount.textContent = String(progress.hints);
  ui.hintBtn.setAttribute('aria-label', T.hint(progress.hints));
  ui.hintBtn.title = T.hint(progress.hints);
  ui.quest.classList.toggle('al-quest-over', !quest);
  if (!quest) {
    ui.questTag.textContent = T.title;
    ui.questReward.hidden = true;
    ui.questEmoji.textContent = '🏆';
    ui.questTitle.replaceChildren(T.allDone);
    ui.questHint.replaceChildren(el('span', { class: 'al-quest-note' }, T.allDoneNote(db.recipes.length - state.recipes.size)));
    ui.questHint.classList.add('al-open');
    return;
  }
  const n = progress.quests + 1;
  ui.questTag.textContent = T.quest(n);
  ui.questReward.hidden = false;
  ui.questRewardNum.textContent = `+${questReward(n)}`;
  ui.questEmoji.textContent = item(quest.id).emoji;
  ui.questTitle.replaceChildren(el('span', { class: 'al-quest-make' }, T.make), ' ', nameOf(quest.id));
  ui.hintBtn.classList.toggle('al-dim', progress.hints < 1 || quest.hint >= 2);
  const recipe = quest.hint ? questRecipe(db, state.found, quest) : null;
  ui.questHint.classList.toggle('al-open', Boolean(recipe));
  if (recipe) {
    ui.questHint.replaceChildren(el('button', { class: 'al-recipe', 'aria-label': T.putHint, title: T.putHint, onclick: () => putHint(recipe) },
      chip(recipe.a), el('b', {}, '+'),
      quest.hint > 1 ? chip(recipe.b) : el('span', { class: 'al-chip al-chip-q' }, el('span', { class: 'al-emoji' }, '❔'), T.unknown),
    ));
  }
}

/** Подсказанное кладётся в котёл: один элемент или оба (тогда они сразу смешаются). */
async function putHint(recipe) {
  if (!ready() || busy) return;
  slots = [null, null];
  pinned = false;
  paintSlots();
  await pick(recipe.a, tiles.get(recipe.a) ?? null);
  if (ui && quest?.hint > 1) await pick(recipe.b, tiles.get(recipe.b) ?? null);
}

function nextQuest(avoid = null) {
  const id = pickQuest(db, state.found, Math.random, avoid);
  quest = id === null ? null : newQuest(id);
  saveQuest();
  renderQuest();
  if (!reducedMotion()) animate(ui.questBody, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'ease-out' });
}

async function completeQuest() {
  questBusy = true;
  quest = null;
  progress.quests += 1;
  const reward = questReward(progress.quests);
  addHints(progress, reward);
  saveProgress();
  later(() => sfx('quest'), 260);
  ui.quest.classList.add('al-quest-done');
  ui.questTitle.replaceChildren(T.questDone);
  ui.questHint.classList.remove('al-open');
  ui.hintCount.textContent = String(progress.hints);
  if (!reducedMotion()) {
    animate(ui.questEmoji, BUMP, { duration: 320, easing: 'ease-out' });
    animate(ui.hintBtn, BUMP, { duration: 320, delay: 200, easing: 'ease-out' });
  }
  await later(null, reducedMotion() ? 0 : 1100);
  questBusy = false;
  if (!ui) return;
  ui.quest.classList.remove('al-quest-done');
  nextQuest();
}

function onHint() {
  if (!ready() || busy || !quest || questBusy) return;
  if (quest.hint >= 2) {
    toast.show(T.hintShown, 1800);
    return;
  }
  if (!useHint(db, progress, state, quest)) {
    toast.show(T.noHints, 2200);
    sfx('fail');
    shake(ui.hintBtn, { distance: 4, duration: 300 });
    return;
  }
  stats.hints += 1;
  saveProgress();
  saveStats();
  saveQuest();
  sfx('hint');
  haptic().impact('light');
  renderQuest();
  if (!reducedMotion()) animate(ui.hintBtn, BUMP, { duration: 260, easing: 'ease-out' });
}

function onReroll() {
  if (!ready() || busy || !quest || questBusy) return;
  sfx('click');
  nextQuest(quest.id);
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

function dialog(title, ...children) {
  return el('div', { class: 'al-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'al-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'al-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showHelp() {
  openModal(dialog(T.help.title, T.rules.map((text) => el('p', { class: 'al-rule' }, text))));
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'al-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      saveSettings();
      skins.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      sfx('click');
    },
  }, el('span', { class: 'al-swatch', 'data-skin': id }, ['💧', '🔥', '🌍'].map((ch, k) => el('i', { class: `al-swatch-${k + 1} al-emoji` }, ch))), T.skins[id]));
  const orders = ORDERS.map((id) => el('button', {
    class: 'al-seg', role: 'radio', 'aria-checked': String(id === settings.order),
    onclick: () => {
      setOrder(id);
      orders.forEach((b, k) => b.setAttribute('aria-checked', String(ORDERS[k] === id)));
    },
  }, T.order[id]));
  const hide = el('button', {
    class: 'al-switch', role: 'switch', 'aria-checked': String(settings.hideSpent),
    onclick: () => {
      settings.hideSpent = !settings.hideSpent;
      hide.setAttribute('aria-checked', String(settings.hideSpent));
      saveSettings();
      sfx('click');
      renderShelf();
    },
  }, el('span', {}, T.settings.hideSpent), el('i', {}));
  const numbers = { found: state.found.size, recipes: state.recipes.size, quests: progress.quests, ...stats };
  openModal(dialog(T.settings.title,
    el('h3', { class: 'al-section' }, T.settings.skin),
    el('div', { class: 'al-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'al-section' }, T.settings.shelf),
    el('div', { class: 'al-segs', role: 'radiogroup' }, orders),
    hide,
    el('h3', { class: 'al-section' }, T.settings.stats),
    el('dl', { class: 'al-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, numbers[k])])),
  ));
}

function setOrder(id) {
  if (settings.order === id) return;
  settings.order = id;
  saveSettings();
  sfx('click');
  renderOrderBtn();
  renderShelf();
  ui.shelf.scrollTop = 0;
}

function renderOrderBtn() {
  ui.orderBtn.innerHTML = settings.order === 'new' ? ICONS.sortNew : ICONS.sortName;
  ui.orderBtn.setAttribute('aria-label', T.order[settings.order]);
  ui.orderBtn.title = T.order[settings.order];
}

/** Окно «новое звание» и/или «новый дар». */
function showMilestone(rank, rankUp, gifts) {
  sfx(gifts.length ? 'gift' : 'rank');
  haptic().notification('success');
  if (fx && !reducedMotion()) fx.confetti(sparkColors(), 70);
  const parts = [];
  if (rank !== null) {
    parts.push(el('div', { class: 'al-mile' },
      el('span', { class: 'al-mile-tag' }, T.rank.title),
      el('b', { class: 'al-mile-title' }, RANKS[rank].title),
      el('span', { class: 'al-mile-bonus' }, T.rank.bonus(RANK_HINTS * rankUp)),
    ));
  }
  for (const id of gifts) {
    parts.push(el('div', { class: 'al-mile al-mile-gift' },
      el('span', { class: 'al-mile-tag' }, T.gift.title),
      el('span', { class: 'al-mile-emoji al-emoji' }, item(id).emoji),
      el('b', { class: 'al-mile-title' }, nameOf(id)),
      el('p', { class: 'al-mile-note' }, T.gift.note(db.cats[item(id).cat].title)),
    ));
  }
  openModal(el('div', { class: 'al-dialog al-dialog-mile', role: 'dialog', 'aria-label': T.rank.title },
    parts,
    el('button', { class: 'btn', onclick: closeModal }, T.rank.ok),
  ));
  renderQuest();
}

/** Карточка элемента: как получен и что из него выходит (только найденное). */
function showCard(id) {
  const it = item(id);
  const made = it.makes.map((k) => db.recipes[k]).filter((r) => state.recipes.has(r.key));
  const used = it.uses.map((k) => db.recipes[k]).filter((r) => state.recipes.has(r.key));
  const results = [...new Set(used.map((r) => r.c))];
  const origin = db.start.includes(id) ? T.card.start : it.gift ? T.card.gift(it.gift) : null;
  const more = it.makes.length - made.length;
  const head = el('div', { class: 'al-card-head' },
    el('span', { class: 'al-card-emoji al-emoji' }, it.emoji),
    el('div', {}, el('h2', {}, titleOf(it.name)), el('span', { class: 'al-card-cat' }, db.cats[it.cat].title)),
    el('button', { class: 'al-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
  );
  head.style.setProperty('--m', `var(--al-m${(it.cat % MARKERS) + 1})`);
  openModal(el('div', { class: 'al-dialog al-card', role: 'dialog', 'aria-label': titleOf(it.name) },
    head,
    el('h3', { class: 'al-section' }, T.card.from),
    origin && el('p', { class: 'al-card-note' }, origin),
    made.map((r) => el('div', { class: 'al-row' }, chip(r.a), el('b', {}, '+'), chip(r.b))),
    !origin && !made.length && el('p', { class: 'al-card-note' }, T.card.none),
    more > 0 && made.length > 0 && el('p', { class: 'al-card-note' }, T.card.more(more)),
    it.uses.length > 0 && el('h3', { class: 'al-section' }, T.card.into(used.length, it.uses.length)),
    results.length > 0 && el('div', { class: 'al-chips' }, results.map((r) => chip(r))),
    el('button', { class: 'btn', onclick: () => {
      closeModal();
      closeSheet();
      closeSearch();
      later(() => ui && pick(id, tiles.get(id) ?? null), reducedMotion() ? 0 : 200);
    } }, T.card.put),
  ));
}

// ---------- коллекция ----------

function renderSheet() {
  const n = state.found.size;
  const k = rankOf(n);
  const next = RANKS[k + 1];
  const gift = nextGift(db, state);
  const counts = catProgress(db, state.found);
  const line = (label, value) => el('div', { class: 'al-sum-row' }, el('span', {}, label), el('b', {}, value));
  ui.sheetBody.replaceChildren(
    el('div', { class: 'al-sum' },
      el('b', { class: 'al-sum-rank' }, RANKS[k].title),
      el('span', { class: 'al-sum-next' }, next ? T.nextRank(next.title, next.at - n) : T.topRank),
      line(T.found, T.count(n, db.total)),
      line(T.recipes, T.count(state.recipes.size, db.recipes.length)),
      line(T.ready, String(frontier(db, state.found).length)),
      gift && el('span', { class: 'al-sum-next' }, T.nextGift(Math.max(1, gift.at - n))),
    ),
    ...counts.map((c, index) => {
      const seal = db.giftOfCat.get(index);
      const sealed = Boolean(seal) && !state.found.has(seal.id);
      const open = openCat === index && !sealed;
      const arrow = el('i', { class: 'al-cat-arrow' });
      arrow.innerHTML = sealed ? ICONS.lock : ICONS.chevron;
      const row = el('button', {
        class: `al-cat${open ? ' al-cat-open' : ''}${sealed ? ' al-cat-sealed' : ''}`, 'aria-expanded': String(open),
        onclick: () => {
          if (sealed) return;
          openCat = open ? null : index;
          sfx('click');
          renderSheet();
        },
      },
        el('span', { class: 'al-cat-title' }, c.title),
        el('span', { class: 'al-cat-count' }, sealed ? T.sealedCat(seal.at) : T.count(c.found, c.total)),
        arrow,
        el('span', { class: 'al-cat-bar' }, el('i', { style: `width: ${Math.round((c.found / c.total) * 100)}%` })),
      );
      row.style.setProperty('--m', `var(--al-m${(index % MARKERS) + 1})`);
      if (!open) return row;
      const list = shelf(db, state, { cat: index });
      return [row, el('div', { class: 'al-cat-grid' },
        list.map((it) => tileNode(it, 'al-tile al-tile-s')),
        c.total > c.found && el('p', { class: 'al-cat-more' }, T.moreIn(c.total - c.found)),
      )];
    }).flat(),
  );
}

function openSheet() {
  if (!ready() || busy) return;
  sheetOpen = true;
  sfx('click');
  renderSheet();
  ui.sheet.hidden = false;
  ui.sheetBody.scrollTop = 0;
  animate(ui.sheet, [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 240, easing: EASE_OUT });
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  animate(ui.sheet, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 12px' }], { duration: 160, easing: 'ease-in' })
    .then(() => {
      if (ui && !sheetOpen) ui.sheet.hidden = true;
    });
}

// ---------- поиск ----------

function renderSearch() {
  const list = shelf(db, state, { query: ui.searchInput.value });
  ui.searchList.replaceChildren(...list.slice(0, 120).map((it) => tileNode(it)));
  if (!list.length) ui.searchList.append(el('p', { class: 'al-empty' }, T.nothing));
}

function openSearch() {
  if (!ready() || busy) return;
  searchOpen = true;
  sfx('click');
  ui.searchInput.value = '';
  renderSearch();
  ui.search.hidden = false;
  animate(ui.search, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  ui.searchInput.focus();
}

function closeSearch() {
  if (!searchOpen) return;
  searchOpen = false;
  ui.searchInput.blur();
  animate(ui.search, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in' }).then(() => {
    if (ui && !searchOpen) ui.search.hidden = true;
  });
}

function pickFound(id) {
  closeSearch();
  // плитки на полке может не быть (другая категория) — тогда элемент появляется в котле без полёта
  later(() => ui && pick(id, tiles.get(id) ?? null), reducedMotion() ? 0 : 150);
}

// ---------- касания ----------

function tileOf(e) {
  const node = e.target.closest?.('.al-tile');
  return node ? Number(node.dataset.id) : null;
}

/** Долгое нажатие на плитку — карточка элемента (и касание после него не считается). */
function onPressStart(e) {
  const id = tileOf(e);
  cancelPress();
  longPressed = false;
  if (id === null || !db?.items.has(id)) return;
  press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
    press = null;
    if (!ui || busy || modalActive) return;
    longPressed = true;
    haptic().impact('medium');
    showCard(id);
  }, LONG_PRESS) };
}

function onPressMove(e) {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
}

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
}

/** Было ли это касание долгим нажатием (тогда оно уже открыло карточку). */
function wasLongPress() {
  cancelPress();
  const was = longPressed;
  longPressed = false;
  return was;
}

function onShelfTap(e) {
  const id = tileOf(e);
  if (id === null || wasLongPress()) return;
  pick(id, e.target.closest('.al-tile'));
}

function onSheetTap(e) {
  const id = tileOf(e);
  if (id !== null) showCard(id);
}

function onSearchTap(e) {
  const id = tileOf(e);
  if (id === null || wasLongPress()) return;
  pickFound(id);
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (modalActive) closeModal();
  else if (searchOpen) closeSearch();
  else if (sheetOpen) closeSheet();
  else if (slots[1] !== null) clearSlot(1);
  else clearSlot(0);
}

function iconButton(icon, label, onclick, cls = 'al-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('al-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

/** База не загрузилась — сообщение и «Повторить». → загружена ли. */
async function loadAll() {
  ui.load.replaceChildren(el('p', {}, T.loading));
  ui.load.hidden = false;
  try {
    db = await loadData();
    if (ui) ui.load.hidden = true;
    return true;
  } catch (err) {
    console.warn(err);
    if (!ui) return false;
    ui.load.replaceChildren(el('p', {}, T.loadError), el('button', { class: 'btn', onclick: async () => {
      if (await loadAll() && api) start();
    } }, T.retry));
    return false;
  }
}

let saved = null;                  // что лежало в хранилище на момент открытия

/** База загружена: разобрать сохранение и показать игру. */
function start() {
  progress = migrateProgress(saved.progress, db);
  state = stateOf(db, progress);
  // дары, до которых игрок дошёл на другом устройстве (открытое слилось, а дар выдаётся здесь)
  const gifts = grantGifts(db, progress, state);
  if (gifts.length) saveProgress();
  quest = loadQuest(saved.quest, db, state.found);
  if (!quest) {
    // самое первое задание — то, что получается из первых двух стихий («Создай: Пар»)
    const first = state.found.size === db.start.length ? recipeOf(db, db.start[0], db.start[1])?.c ?? null : null;
    const id = first ?? pickQuest(db, state.found);
    quest = id === null ? null : newQuest(id);
    saveQuest();
  }
  renderHeader();
  renderChips();
  renderShelf();
  renderQuest();
  paintSlots();
  paintResult();
  idleStatus();
  reportProgress();
  if (isDebug()) debugHooks();
  if (gifts.length) showMilestone(null, 0, gifts);
}

// ---------- отладка (?aldebug) ----------

function debugHooks() {
  const idOf = (name) => db.list.find((it) => it.name === String(name).toLowerCase() || it.name === name)?.id ?? null;
  globalThis.__alchemy = {
    get db() { return db; },
    get progress() { return progress; },
    get state() { return state; },
    get quest() { return quest; },
    get slots() { return slots; },
    get busy() { return busy; },
    get shown() { return shown; },
    get found() { return state.found.size; },
    idOf,
    name: (id) => item(id)?.name ?? null,
    /** Положить элемент в котёл по названию. */
    pick: (name) => pick(idOf(name), tiles.get(idOf(name)) ?? null),
    /** Смешать два элемента по названиям. */
    async mix(a, b) {
      slots = [null, null];
      paintSlots();
      await pick(idOf(a));
      await pick(idOf(b));
    },
    /** Рецепт текущего задания: [название, название]. */
    recipe() {
      const r = quest ? questRecipe(db, state.found, quest) : null;
      return r ? [item(r.a).name, item(r.b).name] : null;
    },
    /** Выполнить текущее задание. */
    async solve() {
      const r = quest ? questRecipe(db, state.found, quest) : null;
      if (!r) return false;
      slots = [null, null];
      await pick(r.a);
      await pick(r.b);
      return true;
    },
    /** Открыть без анимаций ещё n элементов — так, как их выдавали бы задания (для проверки поздней игры). */
    open(n = 10) {
      for (let k = 0; k < n; k++) {
        const id = pickQuest(db, state.found);
        if (id === null) break;
        const r = readyRecipe(db, state.found, id);
        mix(db, progress, state, r.a, r.b);
        grantGifts(db, progress, state);
      }
      saveProgress();
      quest = loadQuest(quest, db, state.found);
      if (!quest) nextQuest();
      renderHeader();
      renderChips();
      renderShelf();
      renderQuest();
      reportProgress();
      return state.found.size;
    },
    hints(n) {
      progress.hints = n;
      saveProgress();
      renderQuest();
    },
    hint: onHint,
    reroll: onReroll,
    card: showCard,
    sheet: openSheet,
  };
}

export default {
  id: 'alchemy',
  title: 'Алхимия',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    const slot = (k) => {
      const emoji = el('span', { class: 'al-emoji' });
      const orb = el('span', { class: 'al-orb' }, emoji);
      const name = el('span', { class: 'al-slot-name' });
      const node = el('button', { class: 'al-slot', onclick: () => clearSlot(k) }, orb, name);
      return { node, orb, emoji, name };
    };
    const sign = (icon) => {
      const node = el('i', { class: 'al-sign' });
      node.innerHTML = icon;
      return node;
    };
    const res = (() => {
      const emoji = el('span', { class: 'al-emoji' });
      const lock = el('i', { class: 'al-lock', hidden: true });
      lock.innerHTML = ICONS.lock;
      const tag = el('i', { class: 'al-new-tag', hidden: true }, T.fresh);
      const orb = el('span', { class: 'al-orb' }, emoji, lock, tag);
      const name = el('span', { class: 'al-slot-name' });
      const node = el('button', { class: 'al-slot al-res', disabled: true, onclick: () => {
        const id = shown?.id ?? null;
        if (id === null || busy) return;
        clearResult();
        pick(id, node);
      } }, orb, name);
      return { node, orb, emoji, lock, tag, name };
    })();

    ui = {
      rank: el('b', { class: 'al-rank' }, T.title),
      count: el('span', { class: 'al-count' }),
      bar: el('i', {}),
      questTag: el('span', { class: 'al-tag' }),
      questRewardNum: el('b', {}),
      questEmoji: el('span', { class: 'al-quest-emoji al-emoji' }),
      questTitle: el('b', { class: 'al-quest-title' }),
      questHint: el('div', { class: 'al-quest-hint' }),
      hintCount: el('b', {}),
      slots: [slot(0), slot(1)],
      res,
      status: el('p', { class: 'al-status' }),
      tabs: el('div', { class: 'al-tabs', role: 'tablist' }),
      shelf: el('div', { class: 'al-shelf' }),
      layer: el('div', { class: 'al-layer' }),
      sheetBody: el('div', { class: 'al-sheet-body' }),
      searchInput: el('input', {
        class: 'al-search-input', type: 'search', placeholder: T.searchHint, 'aria-label': T.searchHint,
        autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'search',
      }),
      searchList: el('div', { class: 'al-shelf al-search-list' }),
      modal: el('div', { class: 'al-modal', hidden: true }),
      load: el('div', { class: 'al-load' }, el('p', {}, T.loading)),
    };
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    ui.orderBtn = iconButton(ICONS.sortName, T.order.name, () => setOrder(settings.order === 'name' ? 'new' : 'name'), 'al-tool-btn');
    ui.hintBtn = el('button', { class: 'al-hint-btn', onclick: onHint });
    ui.hintBtn.innerHTML = ICONS.bulb;
    ui.hintBtn.append(ui.hintCount);
    const bulb = el('i', { class: 'al-reward-bulb' });
    bulb.innerHTML = ICONS.bulb;
    ui.questReward = el('span', { class: 'al-reward' }, ui.questRewardNum, bulb);
    ui.questBody = el('div', { class: 'al-quest-body' },
      ui.questEmoji,
      el('div', { class: 'al-quest-text' }, el('div', { class: 'al-quest-top' }, ui.questTag, ui.questReward), ui.questTitle),
    );
    ui.quest = el('div', { class: 'al-quest' },
      el('div', { class: 'al-quest-main' },
        ui.questBody,
        ui.hintBtn,
        iconButton(ICONS.swap, T.reroll, onReroll, 'al-reroll-btn'),
      ),
      ui.questHint,
    );
    ui.pin = iconButton(ICONS.pin, T.pin, togglePin, 'al-pin');
    ui.pin.hidden = true;
    ui.pin.setAttribute('aria-pressed', 'false');
    ui.table = el('div', { class: 'al-table' },
      el('div', { class: 'al-mix' },
        el('div', { class: 'al-slot-wrap' }, ui.slots[0].node, ui.pin),
        sign(ICONS.plus), ui.slots[1].node, sign(ICONS.equals), ui.res.node,
      ),
      ui.status,
    );
    ui.sheet = el('div', { class: 'al-sheet', hidden: true },
      el('div', { class: 'al-sheet-head' },
        el('h2', {}, T.book.title),
        el('button', { class: 'al-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeSheet }, '✕'),
      ),
      ui.sheetBody,
    );
    const form = el('form', { class: 'al-search-head', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const first = ui.searchList.querySelector('.al-tile');
      if (first) pickFound(Number(first.dataset.id));
    } },
      ui.searchInput,
      el('button', { class: 'al-icon-btn', type: 'button', 'aria-label': T.close, title: T.close, onmousedown: (e) => e.preventDefault(), onclick: closeSearch }, '✕'),
    );
    ui.search = el('div', { class: 'al-search', hidden: true }, form, ui.searchList);
    ui.searchInput.addEventListener('input', renderSearch);

    ui.shelf.addEventListener('click', onShelfTap);
    ui.sheetBody.addEventListener('click', onSheetTap);
    ui.searchList.addEventListener('click', onSearchTap);
    for (const node of [ui.shelf, ui.searchList]) {
      node.addEventListener('pointerdown', onPressStart);
      node.addEventListener('pointermove', onPressMove);
      node.addEventListener('pointerup', cancelPress);
      node.addEventListener('pointerleave', cancelPress);
      node.addEventListener('pointercancel', cancelPress);
      node.addEventListener('scroll', cancelPress, { passive: true });
      node.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    root = el('div', { class: 'al', lang: 'ru' },
      el('div', { class: 'al-header' },
        el('button', { class: 'al-heading', 'aria-label': T.book.open, onclick: openSheet },
          ui.rank, ui.count, el('span', { class: 'al-bar' }, ui.bar)),
        el('div', { class: 'al-actions' },
          iconButton(ICONS.book, T.book.open, openSheet),
          ui.soundBtn,
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      ui.quest,
      ui.table,
      el('div', { class: 'al-tools' }, iconButton(ICONS.search, T.search, openSearch, 'al-tool-btn'), ui.orderBtn, ui.tabs),
      ui.shelf,
      ui.layer,
      ui.search,
      ui.sheet,
      ui.load,
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'al-fx');
    root.append(fx.canvas);
    renderSoundBtn();

    const [savedProgress, savedQuest, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('progress'), api.storage.get('quest'), api.storage.get('stats'), api.storage.get('settings'),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    saved = { progress: savedProgress, quest: savedQuest };
    soundOn = savedSound !== false;
    stats = migrateStats(savedStats);
    settings = {
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
      order: ORDERS.includes(savedSettings?.order) ? savedSettings.order : 'name',
      hideSpent: savedSettings?.hideSpent === true,
    };
    host.dataset.skin = settings.skin;
    renderSoundBtn();
    renderOrderBtn();
    document.addEventListener('keydown', onKeydown);
    const ok = await loadAll();
    if (!api || !ok) return;
    start();
  },

  getState() {
    return null;
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    cancelPress();
    document.removeEventListener('keydown', onKeydown);
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    if (globalThis.__alchemy) delete globalThis.__alchemy;
    api = host = root = ui = toast = fx = state = quest = shown = press = saved = null;
    progress = emptyProgress();
    stats = emptyStats();
    settings = { skin: 'telegram', order: 'name', hideSpent: false };
    slots = [null, null];
    arrivals = [null, null];
    pinned = busy = modalActive = sheetOpen = searchOpen = longPressed = questBusy = false;
    cat = openCat = null;
    fresh = new Set();
    tried = new Set();
    tiles = new Map();
  },
};
