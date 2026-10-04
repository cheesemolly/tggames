// Ремонт телефона: клиент приносит сломанный телефон с жалобой — найди поломку, разбери, почини и собери.
// Инструменты внизу (фен, присоска, отвёртка, лопатка, пинцет, запчасти, кисточка, спирт, лупа, зарядка,
// антивирус, прошивка): выбери и коснись детали; фен держат, кисточкой и спиртом трут. Снятое ложится в лотки,
// винты — на магнитный коврик. «Сдать» — проверка: работает — звёзды и следующий клиент, нет — возврат (−★).
// Правила, поломки и подсказка — logic.js, рисунки — scene.js, звуки — sounds.js.
//
// Сцена — один SVG (viewBox 360×440): лотки, телефон (две стороны в .pr-flipper — переворот сжатием по X),
// слой лотка и слой полёта. Деталь — узел <g class="pr-part"> с CSS translate/scale (на телефоне 0/1, в лотке —
// уменьшенная копия на своём месте); при снятии узел переезжает в слой лотка, при установке — в своё гнездо
// (порядок слоёв задают пустые <g data-slot>). Эффекты (тряска) — у внутреннего <g class="pr-inner">.
// Попадание пальцем считается своим кодом по рамкам целей (scene.js), с запасом — мелкие винты и разъёмы
// ловятся и чуть мимо.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  TOOLS, PARTS, SCREW_IDS, SCREWS, CONNS, CONN_IDS, TUTORIAL, COMPLAINTS, newOrder, act, nextStep, reach, screenOf,
  starsFor, isValidState, emptyProgress, isValidProgress, recordWin,
} from './logic.js';
import {
  W, H, BOX, TRAY, SCREW_AT, MAT_CELL, CONN_AT, JACK, BUTTON, abs, defs, trays, backBody, frontBody, partMarkup,
  plugMarkup, screwMarkup, avatar, TOOL_ICONS,
} from './scene.js';

const SKINS = ['telegram', 'green', 'blue', 'wood', 'night'];
const AUTO_HINT = 2;                     // первые заказы — подсказка показывается сама и бесплатно
const HEAT_MS = 1100;
const SCRUB = 240;                       // сколько потереть (единиц сцены)
const SVGNS = 'http://www.w3.org/2000/svg';

const T = {
  title: 'Ремонт телефона',
  sub: (level, stars) => `Заказ №${level} · ★ ${stars}`,
  tools: {
    heat: 'Фен', suction: 'Присоска', screwdriver: 'Отвёртка', spudger: 'Лопатка', tweezers: 'Пинцет', parts: 'Запчасти',
    brush: 'Кисточка', alcohol: 'Спирт', magnifier: 'Лупа', charger: 'Зарядка', antivirus: 'Антивирус', flash: 'Прошивка',
  },
  toolHints: {
    heat: 'Держи на крышке или экране, пока клей не размягчится',
    suction: 'Снимает прогретую крышку или экран',
    screwdriver: 'Выкручивает и закручивает винты',
    spudger: 'Отключает и подключает шлейфы',
    tweezers: 'Снимает детали и ставит их обратно',
    parts: 'Ставит новую деталь на пустое место',
    brush: 'Потри пыльное место',
    alcohol: 'Потри окисление на плате',
    magnifier: 'Коснись детали — посмотреть, что с ней',
    charger: 'Вставь в гнездо — проверить зарядку',
    antivirus: 'Коснись экрана включённого телефона',
    flash: 'Вставь в гнездо — перепрошить телефон',
  },
  flip: 'Перевернуть',
  hint: 'Подсказка',
  deliver: 'Сдать',
  pickTool: 'Выбери инструмент внизу',
  why: {
    flip: 'Это с другой стороны — переверни телефон',
    cover: 'Сначала сними заднюю крышку',
    shield: 'Это под экраном платы — открути и сними его',
    bracket: 'Это под нижней планкой — открути и сними её',
    'no-holder': 'Винту некуда вкрутиться — нет детали',
    'no-part': 'Детали нет на месте',
    glue: 'Держится на клею. Прогрей края феном',
    'flex-holds': 'Экран держит шлейф — отключи его с обратной стороны',
    'heat-where': 'Феном греют клей крышки и экрана',
    'suction-where': 'Присоской снимают крышку и экран',
    'no-screws': 'Тут нечего откручивать',
    'use-suction': 'Это на клею — прогрей феном и сними присоской',
    'spudger-where': 'Лопаткой отключают и подключают шлейфы',
    'use-screwdriver': 'Винты — отвёрткой',
    'tweezers-where': 'Пинцетом снимают и ставят детали',
    screws: 'Сначала выкрути винты',
    'bat-connected': 'Сначала отключи батарею лопаткой',
    flex: 'Сначала отключи шлейф лопаткой',
    'parts-where': 'Новую деталь ставят на пустое место',
    'remove-first': 'Сначала сними старую деталь',
    'inside-missing': 'Внутри не всё собрано — проверь детали и винты',
    clean: 'Тут и так чисто',
    'brush-weak': 'Окисление кисточкой не взять — нужен спирт',
    'brush-where': 'Кисточкой чистят гнездо зарядки и динамик',
    'alcohol-dust': 'Это пыль — тут нужна кисточка',
    'alcohol-where': 'Спиртом отмывают окисление на плате',
    'charger-where': 'Зарядку — в гнездо внизу',
    'antivirus-where': 'Антивирус запускают на экране',
    'power-off': 'Сначала включи телефон — кнопка сбоку',
    'no-screen': 'Экран не работает — антивирус не запустить',
    'flash-where': 'Кабель прошивки — в гнездо внизу',
    'no-need': 'Телефон загружается — прошивка не нужна',
    'no-link': 'Компьютер не видит телефон — что-то с зарядкой',
    'no-power': 'Нет питания — прошивка не начнётся',
    'no-bug': '',
    done: '',
    nothing: '',
  },
  finds: {
    ok: 'Всё в порядке',
    'cover-ok': 'Крышка целая',
    'cover-glass': 'Стекло камеры треснуло — нужна новая крышка',
    'cover-bulge': 'Крышку что-то выдавливает изнутри',
    'display-ok': 'Экран целый',
    'display-crack': 'Стекло экрана разбито — нужен новый экран',
    'battery-ok': 'Батарея в порядке',
    'battery-swollen': 'Батарея вздулась! Под замену',
    'battery-worn': 'Батарея изношена: держит 38% ёмкости',
    'camera-ok': 'Камера в порядке',
    'camera-dead': 'Модуль камеры сгорел',
    'speaker-ok': 'Динамик в порядке',
    'speaker-torn': 'Мембрана динамика порвана',
    'speaker-dust': 'Сетка динамика забита пылью',
    'port-ok': 'Плата зарядки в порядке',
    'port-burnt': 'Плата зарядки сгорела',
    'jack-ok': 'Гнездо чистое',
    'jack-lint': 'В гнезде слежавшийся пух из кармана',
    'jack-burnt': 'Контакты в копоти — сгорела плата зарядки',
    'board-ok': 'Плата чистая',
    'board-corrosion': 'Окисление — плата побывала в воде',
    'indicator-ok': 'Индикатор влаги белый — воды не было',
    'indicator-red': 'Индикатор влаги красный — телефон был в воде',
    'bat-loose': 'Разъём батареи отошёл',
    'disp-loose': 'Шлейф экрана отошёл',
    'cam-loose': 'Шлейф камеры отошёл',
    'usb-loose': 'Шлейф зарядки отошёл',
    'conn-off': 'Шлейф отключён',
    'conn-ok': 'Шлейф подключён плотно',
  },
  problems: {
    swollen: 'батарея вздута', 'no-power': 'не включается', drains: 'сразу гаснет', bootloop: 'висит на логотипе',
    'no-screen': 'экран не показывает', cracked: 'экран разбит', 'no-charge': 'не заряжается', 'no-sound': 'нет звука',
    quiet: 'звук глухой', 'no-camera': 'камера не работает', blurry: 'фото мутные', virus: 'вирусы на месте',
  },
  returned: (list) => `Клиент вернулся: ${list}`,
  assemble: (m) => (m.parts.length ? 'Сначала собери телефон: не хватает деталей' : `Сначала собери телефон: ${m.screws} ${plural(m.screws, 'винт', 'винта', 'винтов')} не на месте`),
  heated: 'Клей размягчился',
  rub: 'Потри пальцем',
  charging: '⚡ Заряжается',
  noCharge: 'Не заряжается',
  dead: 'Не включается',
  blink: 'Включился и сразу погас',
  bootOn: 'Включился — смотри экран',
  scanFound: (n) => `Найдено ${n} ${plural(n, 'вирус', 'вируса', 'вирусов')} — дави жуков!`,
  scanClean: 'Вирусов нет',
  cured: 'Вирусы удалены',
  flashing: 'Прошивка',
  flashed: 'Перепрошит — загружается',
  spark: 'Искра! Сначала отключай батарею',
  wasted: 'Старая деталь была исправна',
  hintNote: 'С подсказкой — не больше двух звёзд за заказ',
  newFault: 'Новая поломка',
  gotIt: 'Понятно',
  notes: 'Что нашёл',
  noNotes: 'Пока ничего — посмотри лупой, включи, проверь зарядку',
  complaint: 'Жалоба',
  win: (n) => `Заказ №${n} готов!`,
  quotes: ['Как новый! Спасибо!', 'Вы волшебник!', 'Ура, работает!', 'Огонь, спасибо огромное!', 'Буду всем вас советовать!'],
  mistakes: { sparks: 'искры', waste: 'лишние детали', returns: 'возвраты', hints: 'подсказка' },
  clean: 'Без единой ошибки',
  next: 'Следующий клиент',
  menu: (n, stars) => `Починено: ${n} · ★ ${stars}`,
  stats: 'Мастерская',
  statRows: ['Починено телефонов', 'Звёзд', 'На три звезды', 'Искр за всё время'],
  rank: 'Звание',
  ranks: [[0, 'Новичок'], [15, 'Подмастерье'], [45, 'Мастер'], [120, 'Профи'], [300, 'Легенда мастерской']],
  settings: 'Настройки',
  skin: 'Коврик',
  skins: { telegram: 'По умолчанию', green: 'Зелёный', blue: 'Силикон', wood: 'Верстак', night: 'Ночь' },
  options: 'Игра',
  marks: 'Показывать, где работает инструмент',
  howTo: 'Как играть',
  close: 'Закрыть',
  rules: [
    'К тебе приходят клиенты со сломанными телефонами. Прочитай жалобу, найди поломку и почини.',
    'Выбери инструмент внизу и коснись детали. Фен и присоска снимают крышку и экран, отвёртка — винты, лопатка — шлейфы, пинцет — детали.',
    'Прежде чем трогать шлейфы — отключи батарею, иначе искра.',
    'Понять, что сломано, помогут лупа, зарядка и кнопка питания. Новую деталь ставь только вместо сломанной.',
    'Собери телефон и нажми «Сдать». Без ошибок — три звезды.',
  ],
  play: 'В мастерскую',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  intro: {
    virus: ['Вирусы', 'Включи телефон кнопкой сбоку, возьми «Антивирус» и коснись экрана — потом дави найденных жуков. Разбирать ничего не нужно.'],
    'screen-crack': ['Разбитый экран', 'Экран на клею, а его шлейф — с обратной стороны. Сними крышку, открути экран платы, отключи батарею, потом шлейф экрана. Переверни, прогрей экран, сними присоской и поставь новый. Собери в обратном порядке.'],
    'port-dirty': ['Не заряжается', 'Проверь «Зарядкой» и посмотри «Лупой» в гнездо внизу. Иногда хватает кисточки.'],
    'battery-swollen': ['Вздутая батарея', 'Батарея раздулась и выдавливает крышку. Отключи её разъём лопаткой и только потом вынимай.'],
    'screen-flex': ['Чёрный экран без трещин', 'Возможно, просто отошёл шлейф. Найди его лупой и вставь обратно лопаткой — новый экран не нужен.'],
    'speaker-dust': ['Глухой звук', 'Включи телефон и послушай мелодию. Глухо — пыль в динамике, он под нижней планкой.'],
    'loose-battery': ['Не включается', 'После падения мог отойти разъём батареи. Вставить его на место — дело секунды.'],
    'camera-glass': ['Мутные фото', 'Посмотри лупой на стёклышко камеры сзади: если треснуло — менять нужно крышку, а не камеру.'],
    bootloop: ['Висит на логотипе', 'Это программа. Подключи «Прошивку» к гнезду — телефон перепрошьётся.'],
    'port-broken': ['Сгоревшая зарядка', 'Копоть в гнезде — плата зарядки сгорела. Она под нижней планкой, её шлейф отключай без батареи.'],
    water: ['Утопленник', 'Внутри покраснел индикатор влаги. Отключи батарею и отмой окисление на плате спиртом.'],
    'speaker-broken': ['Нет звука', 'Мелодии при включении нет совсем — динамик порван. Кисточка тут не поможет.'],
    'battery-worn': ['Гаснет сразу', 'Телефон включается на миг и гаснет — батарея износилась. Лупа покажет ёмкость.'],
    'camera-module': ['Чёрная камера', 'Стёклышко целое? Тогда сгорел модуль камеры. Его шлейф — под экраном платы.'],
  },
};

function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  flip: svgIcon('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>'),
  deliver: svgIcon('<path d="M20 6 9 17l-5-5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
};

const defaultSettings = () => ({ skin: 'telegram', marks: true });

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let progress = emptyProgress();
let settings = defaultSettings();
let seen = [];
let soundOn = true;
let tool = '';
let modalActive = false;
let modalToken = 0;
let busy = 0;                            // идут анимации — касания сцены ждут
let pd = null;                           // нажатие: { id, x, y, target, mode, last }
let overlay = '';                        // временное состояние экрана: scan, clean, charge, empty, flash, logo
let heatLevel = { cover: 0, display: 0 };
let scrubbed = 0;
let mood = 'calm';
let moodTimer = 0;
let bubbleTimer = 0;
let hintShown = null;
let bugs = [];
let bugRaf = 0;
let bugLast = 0;
let adsGone = new Map();                 // закрытая реклама → когда вернётся
const timers = new Set();
const audio = createAudio(createSounds);
const lastSound = new Map();

function sfx(name, opts, gap = 30) {
  if (!soundOn) return;
  const t = performance.now();
  if (gap && t - (lastSound.get(name) ?? -1e9) < gap) return;
  lastSound.set(name, t);
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const wait = (ms) => new Promise((resolve) => later(resolve, reducedMotion() ? 0 : ms));

function svgEl(tag, attrs = {}, html = '') {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html) node.innerHTML = html;
  return node;
}

function save() {
  if (!api || !game) return;
  if (game.done) return;
  api.storage.set('current', game);
}

const tutorialAuto = () => game && game.level <= AUTO_HINT;

// ---------- сцена: постройка ----------

/** Узлы сцены одного заказа. */
let S = null;

function buildScene() {
  const svg = ui.svg;
  svg.innerHTML = `${defs()}<g class="pr-traybg">${trays()}</g>
<g class="pr-flipper">
  <g class="pr-side pr-back">${backBody()}
    <g data-slot="camera"></g><g data-slot="battery"></g><g data-slot="port"></g><g data-slot="speaker"></g>
    <g class="pr-plugs"></g>
    <g data-slot="shield"></g><g data-slot="bracket"></g>
    <g class="pr-screwslots"></g>
    <g data-slot="cover"></g>
  </g>
  <g class="pr-side pr-front">${frontBody()}<g data-slot="display"></g><g class="pr-bugs"></g></g>
</g>
<g class="pr-traylayer"></g>
<g class="pr-marks"></g>
<g class="pr-flylayer"></g>`;
  S = {
    flipper: svg.querySelector('.pr-flipper'),
    tray: svg.querySelector('.pr-traylayer'),
    fly: svg.querySelector('.pr-flylayer'),
    marks: svg.querySelector('.pr-marks'),
    bugs: svg.querySelector('.pr-bugs'),
    slots: Object.fromEntries([...svg.querySelectorAll('[data-slot]')].map((g) => [g.dataset.slot, g])),
    parts: {},
    plugs: {},
    screws: {},
    screwSlots: {},
  };
  // цвет модели — на самом SVG: градиенты в <defs> берут переменные от своих предков, а не от места использования
  svg.classList.forEach((c) => { if (c.startsWith('pr-col-')) svg.classList.remove(c); });
  svg.classList.add(`pr-col-${game.model.color}`);
  for (const p of PARTS) {
    const node = svgEl('g', { class: 'pr-part', 'data-part': p });
    node.append(svgEl('g', { class: 'pr-inner' }, partMarkup(p, game)));
    S.parts[p] = node;
  }
  const plugLayer = svg.querySelector('.pr-plugs');
  for (const c of CONN_IDS) {
    const node = svgEl('g', { class: 'pr-plugnode', 'data-plug': c }, plugMarkup(c));
    plugLayer.append(node);
    S.plugs[c] = node;
  }
  const screwLayer = svg.querySelector('.pr-screwslots');
  for (const id of SCREW_IDS) {
    const slot = svgEl('g', { 'data-screwslot': id });
    screwLayer.append(slot);
    S.screwSlots[id] = slot;
    const node = svgEl('g', { class: 'pr-screwnode', 'data-screw': id });
    node.append(svgEl('g', { class: 'pr-inner' }, screwMarkup(id)));
    S.screws[id] = node;
  }
  for (const p of PARTS) putNode(p);
  for (const id of SCREW_IDS) putScrew(id);
  stopBugs();
  bugs = [];
  adsGone = new Map();
  overlay = '';
  paint();
}

// ---------- места деталей ----------

const HOME = { x: 0, y: 0, s: 1 };
const placeAt = (cx, cy, tx, ty, s) => ({ x: tx - cx * s, y: ty - cy * s, s });

function trayPlace(p) {
  const b = BOX[p];
  const t = TRAY[p];
  const s = Math.min(t.w / b.w, t.h / b.h);
  return placeAt(b.x + b.w / 2, b.y + b.h / 2, t.cx, t.cy, s);
}

/** Откуда приезжает новая деталь — из коробки над сценой. */
function boxPlace(p) {
  const b = BOX[p];
  return placeAt(b.x + b.w / 2, b.y + b.h / 2, W / 2, -b.h / 2 - 20, 1);
}

function screwPlace(id) {
  if (game.screws[id]) return HOME;
  const [hx, hy] = abs(SCREW_AT[id]);
  const [mx, my] = MAT_CELL[id];
  return placeAt(hx, hy, mx, my, 1.3);
}

function setPlace(node, p) {
  node.style.translate = `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`;
  node.style.scale = String(+p.s.toFixed(4));
  node._place = p;
}

/** Поставить узел детали туда, где он по правилам (без анимации). */
function putNode(p) {
  const node = S.parts[p];
  const into = game.parts[p].in ? S.slots[p] : S.tray;
  if (node.parentNode !== into) into.append(node);
  setPlace(node, game.parts[p].in ? HOME : trayPlace(p));
}

function putScrew(id) {
  const node = S.screws[id];
  const into = game.screws[id] ? S.screwSlots[id] : S.tray;
  if (node.parentNode !== into) into.append(node);
  setPlace(node, screwPlace(id));
}

/**
 * Полёт узла из текущего места в to по дуге (через верхнюю точку). Узел на время полёта — в слое полёта
 * (поверх всего), по прилёте — в контейнер into. → Promise.
 */
async function flyNode(node, to, into, { dur = 420, arc = 26, grow = 1.08 } = {}) {
  const from = node._place ?? HOME;
  setPlace(node, to);
  if (reducedMotion()) {
    into.append(node);
    return;
  }
  S.fly.append(node);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arc, s: Math.max(from.s, to.s) * grow };
  const frame = (p) => ({ translate: `${p.x}px ${p.y}px`, scale: String(p.s) });
  busy++;
  try {
    await animate(node, [frame(from), { ...frame(mid), offset: 0.45 }, frame(to)], { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' });
  } finally {
    busy--;
  }
  if (S && node.isConnected) into.append(node);
}

// ---------- сцена: перерисовка по состоянию ----------

function screenMode() {
  if (!game.parts.display.in) return 'off';
  if (overlay) return overlay;
  const s = screenOf(game);
  return s === 'none' ? 'off' : s;
}

function paint() {
  if (!ui || !game || !S) return;
  const svg = ui.svg;
  svg.dataset.view = game.view;
  const P = game.parts;
  svg.classList.toggle('pr-d-jack', game.dirt.jack);
  svg.classList.toggle('pr-d-speaker', game.dirt.speaker);
  svg.classList.toggle('pr-d-board', game.dirt.board);
  svg.classList.toggle('pr-wet', game.wet);
  svg.classList.toggle('pr-swollen', P.battery.in && P.battery.broken === 'swollen');
  svg.classList.toggle('pr-burnt', P.port.in && Boolean(P.port.broken));
  svg.classList.toggle('pr-no-port', !P.port.in);
  for (const c of CONN_IDS) {
    const node = S.plugs[c];
    node.dataset.state = game.conns[c];
    node.classList.toggle('pr-gone', !P[CONNS[c]].in);
  }
  for (const p of ['cover', 'display']) {
    S.parts[p].style.setProperty('--heat', String(game.hot[p] ? 1 : heatLevel[p]));
  }
  const d = S.parts.display;
  d.dataset.screen = screenMode();
  const showAds = game.virus > 0 && d.dataset.screen === 'home';
  d.dataset.virus = showAds ? '1' : '0';
  const now = performance.now();
  d.querySelectorAll('.pr-ad').forEach((ad) => ad.classList.toggle('pr-ad-gone', (adsGone.get(ad.dataset.ad) ?? 0) > now));
  // жуки видны только на рабочем экране; после перезапуска игры найденные антивирусом — снова на месте
  S.bugs.style.display = showAds ? '' : 'none';
  if (showAds && game.scanned && !bugs.some((b) => !b.dead)) spawnBugs(game.virus);
  paintTicket();
  paintTools();
  paintMarks();
}

function paintTicket() {
  const st = starsFor(game);
  const cap = 3;
  ui.stars.forEach((star, k) => star.classList.toggle('pr-star-off', k >= st && k < cap));
  ui.sub.textContent = T.sub(game.level, progress.stars);
  ui.flipBtn.classList.toggle('pr-flipped', game.view === 'front');
}

function paintTools() {
  ui.toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
}

// ---------- клиент ----------

function complaintText() {
  return game.complaint.map(([f, k]) => COMPLAINTS[f][k]).join(' ');
}

function setMood(m, ms = 0) {
  clearTimeout(moodTimer);
  mood = m;
  ui.avatar.innerHTML = avatar(game.customer, m);
  if (ms) moodTimer = later(() => { if (ui && game) setMood('calm'); }, ms);
}

function buildTicket() {
  ui.name.textContent = `${game.customer.name} · ${game.model.name}`;
  ui.complaint.textContent = complaintText();
  setMood('calm');
}

// ---------- попадание пальцем ----------

function toScene(clientX, clientY) {
  const m = ui.svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return [p.x, p.y];
}

function toStage([x, y]) {
  const m = ui.svg.getScreenCTM();
  const r = ui.stage.getBoundingClientRect();
  if (!m) return [0, 0];
  const p = new DOMPoint(x, y).matrixTransform(m);
  return [p.x - r.left, p.y - r.top];
}

const rect = (b) => ({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h });
const circ = ([cx, cy], r) => ({ kind: 'circle', cx, cy, r });

function trayRect(p) {
  const b = BOX[p];
  const pl = trayPlace(p);
  return { kind: 'rect', x: b.x * pl.s + pl.x, y: b.y * pl.s + pl.y, w: b.w * pl.s, h: b.h * pl.s };
}

/** Все цели, которые сейчас можно задеть. prio — кто главнее при наложении. */
function targets() {
  const s = game;
  const P = s.parts;
  const list = [];
  const add = (target, shape, prio) => list.push({ target, prio, ...shape });
  for (const p of PARTS) if (!P[p].in) add(p, trayRect(p), 6);
  for (const id of SCREW_IDS) if (!s.screws[id]) add(id, circ(MAT_CELL[id], 13), 7);
  add('button', rect(BUTTON[s.view]), 8);
  add('jack', rect(JACK), 5);
  if (s.view === 'back') {
    if (P.cover.in) add('cover', rect(BOX.cover), 1);
    else {
      add('cover', rect(BOX.cover), 0);
      for (const id of SCREW_IDS) if (P[SCREWS[id]].in) add(id, circ(abs(SCREW_AT[id]), 14), 9);
      if (P.shield.in) add('shield', rect(BOX.shield), 3);
      else {
        for (const c of ['bat', 'disp', 'cam']) add(c, circ(abs(CONN_AT[c]), 15), 9);
        add('board', rect(BOX.board), 2);
      }
      if (P.bracket.in) add('bracket', rect(BOX.bracket), 3);
      else {
        add('usb', circ(abs(CONN_AT.usb), 13), 9);
        add('speaker', rect(BOX.speaker), 4);
        add('port', rect(BOX.port), 4);
      }
      add('camera', rect(BOX.camera), 3);
      add('battery', rect(BOX.battery), 2);
      add('indicator', rect(BOX.indicator), 5);
    }
  } else {
    add('display', rect(BOX.display), 1);
    bugs.forEach((b, k) => { if (!b.dead) add(`bug:${k}`, circ([b.x, b.y], 18), 11); });
    if (S.parts.display.dataset.virus === '1') {
      const now = performance.now();
      [[130, 156], [150, 252]].forEach(([x, y], k) => {
        if ((adsGone.get(String(k)) ?? 0) <= now) add(`ad:${k}`, circ(abs([x, y]), 13), 10);
      });
    }
  }
  return list;
}

function hitTest(pt) {
  if (!pt) return null;
  const [x, y] = pt;
  let best = null;
  let bestArea = Infinity;
  let near = null;
  let nearD = 22;
  for (const t of targets()) {
    let inside;
    let area;
    if (t.kind === 'rect') {
      inside = x >= t.x - 3 && x <= t.x + t.w + 3 && y >= t.y - 3 && y <= t.y + t.h + 3;
      area = t.w * t.h;
    } else {
      const dd = Math.hypot(x - t.cx, y - t.cy);
      inside = dd <= t.r;
      area = Math.PI * t.r * t.r;
      if (!inside && dd - t.r < nearD) {
        nearD = dd - t.r;
        near = t;
      }
    }
    if (inside && (!best || t.prio > best.prio || (t.prio === best.prio && area < bestArea))) {
      best = t;
      bestArea = area;
    }
  }
  return best?.target ?? near?.target ?? null;
}

/** Цель с поправкой на инструмент: отвёртка по крышке — «сначала сними крышку», антивирус по экрану и т. п. */
function mapTarget(t, target) {
  const P = game.parts;
  if (target === 'cover' && P.cover.in && game.view === 'back') {
    if (t === 'screwdriver') return 's1';
    if (t === 'spudger') return 'bat';
    if (t === 'alcohol') return 'board';
  }
  if (target === 'shield' && P.shield.in) {
    if (t === 'spudger') return 'bat';
    if (t === 'alcohol' || t === 'brush') return 'board';
  }
  if (target === 'bracket' && P.bracket.in) {
    if (t === 'spudger') return 'usb';
    if (t === 'brush') return 'speaker';
  }
  if (target === 'display' && t === 'antivirus') return 'screen';
  return target;
}

/** Центр цели в координатах сцены — для подсветок и всплывашек; slot — снятая деталь: её место на телефоне. */
function centerOf(target, slot = false) {
  if (target in SCREWS) return game.screws[target] ? abs(SCREW_AT[target]) : MAT_CELL[target];
  if (target in CONNS) return abs(CONN_AT[target]);
  if (target === 'jack') return [JACK.x + JACK.w / 2, JACK.y + 14];
  if (target === 'button') {
    const b = BUTTON[game.view];
    return [b.x + b.w / 2, b.y + b.h / 2];
  }
  if (target === 'screen') return [BOX.display.x + 90, BOX.display.y + 190];
  if (target === 'bug') {
    const b = bugs.find((x) => !x.dead);
    return b ? [b.x, b.y] : [BOX.display.x + 90, BOX.display.y + 190];
  }
  if (target in game.parts && !game.parts[target].in && !slot) {
    const t = TRAY[target];
    return [t.cx, t.cy];
  }
  const b = BOX[target] ?? BOX.cover;
  return [b.x + b.w / 2, b.y + b.h / 2];
}

// ---------- подсветки: куда подходит инструмент, подсказка ----------

function applicable(t, target) {
  const P = game.parts;
  switch (t) {
    case 'heat':
    case 'suction': return (target === 'cover' || target === 'display') && P[target].in;
    case 'screwdriver': return target in SCREWS;
    case 'spudger': return target in CONNS && P[CONNS[target]].in;
    case 'tweezers': return target in P;
    case 'parts': return target in P && !P[target].in;
    case 'brush': return target === 'jack' || target === 'speaker';
    case 'alcohol': return target === 'board';
    case 'charger':
    case 'flash': return target === 'jack';
    case 'antivirus': return target === 'display' && P.display.in && game.power;
    default: return false;
  }
}

function paintMarks() {
  if (!S) return;
  S.marks.replaceChildren();
  if (tool && settings.marks && !busy) {
    const seenT = new Set();
    for (const t of targets()) {
      if (seenT.has(t.target) || !applicable(tool, t.target)) continue;
      const m = mapTarget(tool, t.target);
      if (reach(game, m) && !(m in game.parts && !game.parts[m].in)) continue;
      seenT.add(t.target);
      const [x, y] = centerOf(t.target, tool === 'parts');
      S.marks.append(svgEl('circle', { class: 'pr-mark', cx: x, cy: y, r: 5 }));
    }
  }
  if (hintShown?.target) {
    // новая деталь — на пустое место, своя — из лотка
    const [x, y] = centerOf(hintShown.target, hintShown.tool === 'parts');
    S.marks.append(svgEl('circle', { class: 'pr-hint-ring', cx: x, cy: y, r: 16 }));
  }
}

function clearHint() {
  hintShown = null;
  ui.toolBtns.forEach((b) => b.classList.remove('pr-hinted'));
  [ui.flipBtn, ui.deliverBtn].forEach((b) => b.classList.remove('pr-hinted'));
}

function showHint(free) {
  if (!game || game.done) return;
  const st = nextStep(game);
  if (!st) return;
  if (!free) {
    if (!game.hints) toast.show(T.hintNote, 2200);
    game.hints++;
    save();
    sfx('hint', {}, 0);
  }
  clearHint();
  hintShown = st;
  if (st.tool === 'flip') ui.flipBtn.classList.add('pr-hinted');
  else if (st.tool === 'deliver') ui.deliverBtn.classList.add('pr-hinted');
  else if (st.tool !== 'power' && st.tool !== 'squash') {
    if (tool !== st.tool) ui.toolBtns.find((b) => b.dataset.tool === st.tool)?.classList.add('pr-hinted');
  }
  paintTicket();
  paintMarks();
}

// ---------- всплывашка у цели ----------

function bubble(text, at, ms = 1800, kind = '') {
  if (!text || !ui) return;
  const [x, y] = toStage(at ?? [W / 2, H / 2]);
  const r = ui.stage.getBoundingClientRect();
  const b = ui.bubble;
  b.textContent = text;
  b.className = `pr-bubble${kind ? ` pr-bubble-${kind}` : ''}`;
  b.hidden = false;
  const bw = b.offsetWidth;
  const bh = b.offsetHeight;
  b.style.left = `${clamp(x - bw / 2, 6, r.width - bw - 6)}px`;
  b.style.top = `${clamp(y - bh - 18, 6, r.height - bh - 6)}px`;
  animate(b, [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 160, easing: 'ease-out' });
  clearTimeout(bubbleTimer);
  bubbleTimer = later(() => {
    if (!ui) return;
    animate(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => { if (ui && b.textContent === text) b.hidden = true; });
  }, ms);
}

// ---------- эффекты ----------

function sparkFx(at) {
  const [x, y] = toStage(at);
  if (!reducedMotion()) {
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      fx.lightning(x, y, x + Math.cos(a) * 34, y + Math.sin(a) * 34, '#ffd54a', { life: 0.35, width: 2 });
    }
    fx.burst(x, y, '#ffe27a', 10, { speed: 200, size: 4 });
    animate(ui.flash, [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], { duration: 260 });
  }
  sfx('spark', {}, 0);
  api.platform.haptic.notification('error');
  setMood('shock', 1600);
  starShake();
}

function starShake() {
  const st = starsFor(game);
  const star = ui.stars[clamp(st, 0, 2)];
  if (star && !reducedMotion()) animate(star, [{ scale: '1' }, { scale: '1.5' }, { scale: '1' }], { duration: 360, easing: 'ease-out' });
}

function sparkle(at, color = '#ffffff', n = 10) {
  const [x, y] = toStage(at);
  fx.burst(x, y, color, n, { speed: 140, size: 4 });
}

function nudge(node) {
  if (!node || reducedMotion()) return;
  animate(node, [{ translate: '0 0' }, { translate: '-3px 0' }, { translate: '3px 0' }, { translate: '-2px 0' }, { translate: '0 0' }], { duration: 240, easing: 'ease-out' });
}

function innerOf(target) {
  if (target in SCREWS) return S.screws[target].firstChild;
  if (target in game.parts) return S.parts[target].firstChild;
  if (target in CONNS) return S.plugs[target];
  return null;
}

/** Нельзя: мягкий «бум», покачивание и объяснение. */
function refuse(r, target) {
  const text = T.why[r.why] ?? '';
  if (r.why === 'flip') {
    ui.flipBtn.classList.add('pr-hinted');
    later(() => ui?.flipBtn.classList.remove('pr-hinted'), 1600);
  }
  if (!text) return;
  sfx('error', {}, 120);
  api.platform.haptic.notification('warning');
  nudge(innerOf(target));
  bubble(text, centerOf(target), 2000);
}

// ---------- действия ----------

const canTouch = () => game && !game.done && !modalActive && !busy;

function pickTool(t) {
  if (!game || game.done) return;
  audio.get();
  tool = tool === t ? '' : t;
  sfx('tool');
  api.platform.haptic.selection();
  paintTools();
  paintMarks();
  if (tool && progress.level <= 3 && !seen.includes(`tool:${tool}`)) {
    seen.push(`tool:${tool}`);
    api.storage.set('seen', seen);
    toast.show(T.toolHints[tool], 2000);
  }
}

/** Ход сделан: сохранить, перерисовать, обновить подсказку и звёзды. */
function after() {
  save();
  paint();
  if (tutorialAuto()) showHint(true);
}

async function doTool(target) {
  if (!canTouch()) return;
  if (target === 'button') {
    await doPower();
    return;
  }
  if (target.startsWith('bug:')) {
    squash(Number(target.slice(4)));
    return;
  }
  if (target.startsWith('ad:')) {
    closeAd(target.slice(3));
    return;
  }
  if (!tool) {
    bubble(T.pickTool, centerOf(target), 1400);
    ui.tools.classList.remove('pr-pulse');
    void ui.tools.offsetWidth;
    ui.tools.classList.add('pr-pulse');
    return;
  }
  const t = mapTarget(tool, target);
  const used = tool;
  const r = act(game, used, t);
  if (!r.ok) {
    refuse(r, t);
    return;
  }
  clearHint();
  busy++;
  try {
    await perform(used, t, r);
  } finally {
    busy--;
  }
  if (!ui) return;
  after();
}

/** Показать сделанное: анимации и звуки по инструменту. */
async function perform(t, target, r) {
  switch (t) {
    case 'heat': {
      heatLevel[target] = 1;
      sfx('heated', {}, 0);
      if (!r.already) bubble(T.heated, centerOf(target), 1200);
      paint();
      break;
    }
    case 'suction': {
      sfx('suction', {}, 0);
      api.platform.haptic.impact('medium');
      const node = S.parts[target];
      if (!reducedMotion()) await animate(node.firstChild, [{ scale: '1' }, { scale: '1.03' }], { duration: 160, easing: 'ease-out' });
      if (target === 'display') overlay = '';
      await flyNode(node, trayPlace(target), S.tray, { dur: 480, arc: 40 });
      sfx('place', {}, 0);
      break;
    }
    case 'screwdriver': {
      const node = S.screws[target];
      if (r.in) {
        await flyNode(node, HOME, S.screwSlots[target], { dur: 360, arc: 18, grow: 1.2 });
        sfx('screw', {}, 0);
        if (!reducedMotion()) await animate(node.firstChild, [{ rotate: '-540deg' }, { rotate: '0deg' }], { duration: 380, easing: 'ease-out' });
        api.platform.haptic.impact('light');
      } else {
        sfx('unscrew', {}, 0);
        api.platform.haptic.selection();
        if (!reducedMotion()) {
          await animate(node.firstChild, [{ rotate: '0deg', scale: '1' }, { rotate: '-540deg', scale: '1.25' }], { duration: 380, easing: 'ease-in' });
        }
        await flyNode(node, screwPlace(target), S.tray, { dur: 380, arc: 22 });
        sfx('clink', {}, 0);
      }
      break;
    }
    case 'spudger': {
      paint();
      if (r.spark) {
        sparkFx(abs(CONN_AT[target]));
        bubble(T.spark, abs(CONN_AT[target]), 2200, 'bad');
      } else {
        sfx(r.state === 'on' ? 'plug' : 'unplug', {}, 0);
        api.platform.haptic.impact('light');
      }
      await wait(180);
      break;
    }
    case 'tweezers': {
      const node = S.parts[target];
      if (r.removed) {
        sfx('lift', {}, 0);
        await flyNode(node, trayPlace(target), S.tray, { dur: 440, arc: 34 });
      } else {
        sfx('lift', {}, 0);
        await flyNode(node, HOME, S.slots[target], { dur: 440, arc: 34 });
        landBump(node);
      }
      sfx('place', {}, 0);
      api.platform.haptic.impact('light');
      break;
    }
    case 'parts': {
      const node = S.parts[target];
      // старая — в мусор, новая — из коробки сверху
      if (!reducedMotion()) await animate(node, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in' });
      node.firstChild.innerHTML = partMarkup(target, game);
      setPlace(node, boxPlace(target));
      S.fly.append(node);
      sfx('newpart', {}, 0);
      await flyNode(node, HOME, S.slots[target], { dur: 560, arc: 0, grow: 1 });
      landBump(node);
      sparkle(centerOf(target), '#fff6c8', 12);
      api.platform.haptic.impact('medium');
      if (r.wasted) {
        later(() => {
          if (!ui) return;
          sfx('error', {}, 0);
          setMood('sad', 1600);
          starShake();
          bubble(T.wasted, centerOf(target), 2000, 'bad');
        }, 250);
      }
      break;
    }
    case 'brush':
    case 'alcohol': {
      paint();
      sfx('clean', {}, 0);
      sparkle(centerOf(target), t === 'alcohol' ? '#bfe6ff' : '#f4efe6', 14);
      if (r.spark) {
        sparkFx(centerOf(target));
        bubble(T.spark, centerOf(target), 2200, 'bad');
      }
      break;
    }
    case 'magnifier': {
      sfx('inspect', {}, 0);
      loupe(centerOf(target));
      bubble(T.finds[r.find] ?? T.finds.ok, centerOf(target), 2400, /ok$/.test(r.find) ? 'good' : 'find');
      await wait(200);
      break;
    }
    case 'charger': {
      await cable('charger');
      sfx(r.charge ? 'charge' : 'nocharge', {}, 0);
      if (r.charge && !game.power) {
        overlay = 'charge';
        paint();
      }
      bubble(r.charge ? T.charging : T.noCharge, centerOf('jack'), 1800, r.charge ? 'good' : 'bad');
      await wait(1200);
      if (overlay === 'charge') overlay = '';
      await cable('charger', true);
      break;
    }
    case 'flash': {
      await cable('flash');
      overlay = 'flash';
      paint();
      bubble(T.flashing, centerOf('screen'), 1600);
      for (let k = 0; k < 8; k++) {
        await wait(200);
        sfx('flash', { k }, 0);
      }
      overlay = '';
      sfx('flashed', {}, 0);
      await cable('flash', true);
      await bootSequence();
      bubble(T.flashed, centerOf('screen'), 1600, 'good');
      break;
    }
    case 'antivirus': {
      if (r.clean) {
        overlay = 'clean';
        paint();
        sfx('clean', {}, 0);
        bubble(T.scanClean, centerOf('screen'), 1400, 'good');
        await wait(1200);
        overlay = '';
        break;
      }
      overlay = 'scan';
      paint();
      sfx('scan', {}, 0);
      await wait(1300);
      overlay = '';
      paint();                                  // жуки появляются при перерисовке (scanned)
      bubble(T.scanFound(r.bugs), centerOf('screen'), 1800, 'bad');
      break;
    }
    default:
      break;
  }
}

function landBump(node) {
  if (reducedMotion()) return;
  animate(node.firstChild, [{ scale: '1.04' }, { scale: '0.99' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
}

/** Лупа: стеклянное кольцо мелькает над целью. */
function loupe(at) {
  const [x, y] = at;
  const ring = svgEl('g', { class: 'pr-loupe' }, `<circle cx="${x}" cy="${y}" r="20"/><path d="M${x + 14} ${y + 14}l12 12"/>`);
  S.marks.append(ring);
  animate(ring, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1', offset: 0.3 }, { opacity: 1, scale: '1', offset: 0.8 }, { opacity: 0, scale: '1.05' }],
    { duration: 900, easing: 'ease-out' }).then(() => ring.remove());
}

/** Кабель снизу к гнезду: зарядка (белый) или прошивка (синий). out — вынуть. */
async function cable(kind, out = false) {
  if (!S) return;
  let node = S.marks.querySelector('.pr-cable');
  if (!out) {
    node?.remove();
    const [x, y] = [JACK.x + JACK.w / 2, JACK.y + 10];
    node = svgEl('g', { class: `pr-cable pr-cable-${kind}` },
      `<path class="pr-cable-wire" d="M${x} ${y + 16}C${x} ${y + 40} ${x + 40} ${y + 30} ${x + 60} ${H + 20}"/><rect class="pr-cable-plug" x="${x - 9}" y="${y + 6}" width="18" height="16" rx="4"/><rect class="pr-cable-tip" x="${x - 5.5}" y="${y}" width="11" height="7" rx="2"/>`);
    S.marks.append(node);
    sfx('click', {}, 0);
    if (!reducedMotion()) await animate(node, [{ translate: '0 70px' }, { translate: '0 0' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  } else if (node) {
    if (!reducedMotion()) await animate(node, [{ translate: '0 0' }, { translate: '0 70px', opacity: 0 }], { duration: 240, easing: 'ease-in' });
    node.remove();
  }
}

/** Включение: логотип, потом экран; мелодия — по состоянию динамика. */
async function bootSequence() {
  const P = game.parts;
  const quality = !P.speaker.in || P.speaker.broken ? 'none' : game.dirt.speaker ? 'quiet' : 'ok';
  sfx('boot', { quality }, 0);
  if (screenOf(game) === 'home') {
    overlay = 'logo';
    paint();
    await wait(800);
    overlay = '';
  }
  paint();
}

async function doPower() {
  audio.get();
  const r = act(game, 'power', 'button');
  clearHint();
  api.platform.haptic.impact('light');
  const at = centerOf('button');
  busy++;
  try {
    if (r.on) {
      if (game.view !== 'front') await flip();
      await bootSequence();
      if (screenOf(game) !== 'home') bubble(T.bootOn, centerOf('screen'), 1400);
    } else if (r.dead) {
      sfx('click', {}, 0);
      bubble(T.dead, at, 1600, 'bad');
    } else if (r.blink) {
      if (game.view !== 'front') await flip();
      overlay = 'empty';
      paint();
      sfx('blink', {}, 0);
      await wait(800);
      overlay = '';
      bubble(T.blink, centerOf('screen'), 1800, 'bad');
    } else {
      sfx('off', {}, 0);
      overlay = '';
    }
  } finally {
    busy--;
  }
  if (!ui) return;
  after();
}

/** Переворот: телефон сжимается по ширине до нуля, сторона меняется, разжимается. */
async function flip() {
  if (!game) return;
  act(game, 'flip');
  sfx('flip', {}, 0);
  if (reducedMotion()) {
    paint();
    return;
  }
  const other = game.view;
  game.view = other === 'back' ? 'front' : 'back';
  busy++;
  try {
    await animate(S.flipper, [{ scale: '1 1' }, { scale: '0 1' }], { duration: 150, easing: 'ease-in' });
    game.view = other;
    paint();
    await animate(S.flipper, [{ scale: '0 1' }, { scale: '1 1' }], { duration: 170, easing: 'ease-out' });
  } finally {
    busy--;
  }
}

async function onFlip() {
  if (!canTouch()) return;
  audio.get();
  clearHint();
  await flip();
  if (ui) after();
}

// ---------- вирусы: жуки и реклама ----------

function spawnBugs(n) {
  stopBugs();
  S.bugs.replaceChildren();
  const [x0, y0] = abs([20, 40]);
  bugs = Array.from({ length: n }, (_, k) => {
    const node = svgEl('g', { class: `pr-bug pr-bug-${k % 3}` },
      '<g class="pr-bug-body"><path class="pr-bug-legs" d="M-7 -4l-5 -3M-7 0h-6M-7 4l-5 3M7 -4l5 -3M7 0h6M7 4l5 3"/>'
      + '<ellipse class="pr-bug-shell" cx="0" cy="1" rx="7.5" ry="9"/><circle class="pr-bug-head" cx="0" cy="-9" r="4"/>'
      + '<path class="pr-bug-line" d="M0 -6v16"/><circle class="pr-bug-dot" cx="-3" cy="2" r="1.6"/><circle class="pr-bug-dot" cx="3.5" cy="5" r="1.4"/></g>');
    S.bugs.append(node);
    const a = Math.random() * Math.PI * 2;
    const b = { x: x0 + 10 + Math.random() * 120, y: y0 + 20 + Math.random() * 280, a, v: 26 + Math.random() * 22, turn: 0, node, dead: false };
    if (!reducedMotion()) animate(node.firstChild, [{ scale: '0' }, { scale: '1.2' }, { scale: '1' }], { duration: 300, delay: k * 80, easing: 'ease-out', fill: 'backwards' });
    return b;
  });
  drawBugs();
  if (!reducedMotion()) {
    bugLast = performance.now();
    bugRaf = requestAnimationFrame(bugFrame);
  }
}

function drawBugs() {
  for (const b of bugs) b.node.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${((b.a * 180) / Math.PI + 90).toFixed(1)})`);
}

function bugFrame(now) {
  if (!ui || !bugs.length) {
    bugRaf = 0;
    return;
  }
  const dt = Math.min(0.05, Math.max(0, now - bugLast) / 1000);
  bugLast = now;
  const [x0, y0] = abs([18, 36]);
  const [x1, y1] = abs([162, 362]);
  for (const b of bugs) {
    if (b.dead) continue;
    b.turn += (Math.random() - 0.5) * 6 * dt;
    b.turn = clamp(b.turn, -2.5, 2.5);
    b.a += b.turn * dt;
    b.x += Math.cos(b.a) * b.v * dt;
    b.y += Math.sin(b.a) * b.v * dt;
    if (b.x < x0 || b.x > x1) {
      b.a = Math.PI - b.a;
      b.x = clamp(b.x, x0, x1);
    }
    if (b.y < y0 || b.y > y1) {
      b.a = -b.a;
      b.y = clamp(b.y, y0, y1);
    }
  }
  drawBugs();
  bugRaf = requestAnimationFrame(bugFrame);
}

function stopBugs() {
  if (bugRaf) cancelAnimationFrame(bugRaf);
  bugRaf = 0;
}

function clearBugs() {
  stopBugs();
  bugs = [];
  S?.bugs.replaceChildren();
}

function squash(k) {
  const b = bugs[k];
  if (!b || b.dead || !canTouch()) return;
  const r = act(game, 'squash', 'bug');
  if (!r.ok) return;
  clearHint();
  b.dead = true;
  sfx('squash', {}, 0);
  api.platform.haptic.impact('light');
  b.node.classList.add('pr-bug-dead');
  sparkle([b.x, b.y], '#7ddc8a', 8);
  const node = b.node;
  animate(node.firstChild, [{ scale: '1 1', opacity: 1 }, { scale: '1.5 0.3', opacity: 1, offset: 0.3 }, { scale: '1.6 0.2', opacity: 0 }], { duration: 420, easing: 'ease-out' })
    .then(() => node.remove());
  if (!r.left) {
    stopBugs();
    later(() => {
      if (!ui) return;
      bugs = [];
      sfx('clean', {}, 0);
      bubble(T.cured, centerOf('screen'), 1600, 'good');
      paint();
    }, 300);
  }
  after();
}

function closeAd(k) {
  if (!canTouch()) return;
  sfx('ad', {}, 0);
  const node = S.parts.display.querySelector(`.pr-ad[data-ad="${k}"]`);
  adsGone.set(k, performance.now() + 4000);
  if (node && !reducedMotion()) animate(node, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.8' }], { duration: 180 });
  later(() => paint(), 190);
  later(() => paint(), 4050);
}

// ---------- ввод на сцене ----------

function onPointerDown(e) {
  if (!canTouch() || pd) return;
  audio.get();
  const pt = toScene(e.clientX, e.clientY);
  const target = hitTest(pt);
  pd = { id: e.pointerId, x: e.clientX, y: e.clientY, target, mode: 'tap', last: pt };
  if (target && (tool === 'heat') && (target === 'cover' || target === 'display')) {
    const probe = act(structuredClone(game), 'heat', target);
    if (probe.ok && !game.hot[target]) startHeat(target);
  } else if (target && (tool === 'brush' || tool === 'alcohol')) {
    const t = mapTarget(tool, target);
    const probe = act(structuredClone(game), tool, t);
    if (probe.ok) {
      pd.mode = 'scrub';
      pd.target = t;
      scrubbed = 0;
    }
  }
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    // без захвата — тоже работает
  }
}

function onPointerMove(e) {
  if (!pd || e.pointerId !== pd.id) return;
  if (pd.mode !== 'scrub') return;
  const pt = toScene(e.clientX, e.clientY);
  if (!pt || !pd.last) return;
  const d = Math.hypot(pt[0] - pd.last[0], pt[1] - pd.last[1]);
  pd.last = pt;
  if (d < 0.5) return;
  scrubbed += d;
  sfx(tool === 'alcohol' ? 'fizz' : 'scrub', {}, 110);
  if (Math.random() < 0.35) {
    const [x, y] = toStage(pt);
    fx.burst(x, y, tool === 'alcohol' ? '#bfe6ff' : '#cfc6b8', 2, { speed: 90, size: 3 });
  }
  if (scrubbed >= SCRUB) {
    const target = pd.target;
    pd.mode = 'done';
    doTool(target);
  }
}

function onPointerUp(e) {
  if (!pd || e.pointerId !== pd.id) return;
  const p = pd;
  pd = null;
  if (p.mode === 'heat') {
    stopHeat();
    return;
  }
  if (p.mode === 'scrub') {
    if (scrubbed < SCRUB) bubble(T.rub, centerOf(p.target), 1200);
    return;
  }
  if (p.mode === 'done' || !p.target) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) return;
  doTool(p.target);
}

function onPointerCancel() {
  if (pd?.mode === 'heat') stopHeat();
  pd = null;
}

// ---------- фен: держать ----------

let heatRaf = 0;
let heatLast = 0;
let heatTarget = '';
let heatSound = 0;

function startHeat(target) {
  pd.mode = 'heat';
  heatTarget = target;
  heatLast = performance.now();
  heatSound = 0;
  S.parts[target].classList.add('pr-heating');
  heatRaf = requestAnimationFrame(heatFrame);
}

function heatFrame(now) {
  if (!ui || !heatTarget) return;
  const dt = Math.max(0, now - heatLast);
  heatLast = now;
  heatLevel[heatTarget] = Math.min(1, heatLevel[heatTarget] + dt / HEAT_MS);
  S.parts[heatTarget].style.setProperty('--heat', String(heatLevel[heatTarget]));
  heatSound -= dt;
  if (heatSound <= 0) {
    sfx('heat', {}, 0);
    heatSound = 280;
  }
  if (heatLevel[heatTarget] >= 1) {
    const t = heatTarget;
    stopHeat();
    if (pd) pd.mode = 'done';
    doTool(t);
    return;
  }
  heatRaf = requestAnimationFrame(heatFrame);
}

function stopHeat() {
  if (heatRaf) cancelAnimationFrame(heatRaf);
  heatRaf = 0;
  if (heatTarget && S) S.parts[heatTarget].classList.remove('pr-heating');
  heatTarget = '';
}

// ---------- сдача ----------

async function onDeliver() {
  if (!canTouch()) return;
  audio.get();
  const probe = act(structuredClone(game), 'deliver');
  if (!probe.ok) {
    sfx('error', {}, 0);
    toast.show(T.assemble(probe.missing), 1800);
    return;
  }
  clearHint();
  const r = act(game, 'deliver');
  if (!r.win) {
    sfx('return', {}, 0);
    api.platform.haptic.notification('error');
    setMood('sad', 2400);
    starShake();
    const list = r.problems.map((k) => T.problems[k]).join(', ');
    toast.show(T.returned(list), 2600);
    after();
    return;
  }
  busy++;
  try {
    if (game.view !== 'front') await flip();
    overlay = '';
    await bootSequence();
  } finally {
    busy--;
  }
  if (!ui) return;
  const finished = game;
  const stars = recordWin(progress, finished);
  api.storage.set('progress', progress);
  sendProgress();
  paintTicket();
  setMood('happy');
  sfx('deliver', {}, 0);
  api.platform.haptic.notification('success');
  if (!reducedMotion()) fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff', '#ff9f43'], stars === 3 ? 90 : 50);
  // следующий заказ сохранён сразу: выход из окна победы не вернёт сданный
  const next = newOrder(progress.level);
  api.storage.set('current', next);
  later(() => { if (ui) showWin(finished, stars, next); }, reducedMotion() ? 100 : 900);
}

function showWin(done, stars, next) {
  const starRow = el('div', { class: 'pr-win-stars' }, [0, 1, 2].map((k) => el('span', { class: `pr-win-star${k < stars ? ' on' : ''}` }, '★')));
  const faults = Object.entries(T.mistakes).filter(([k]) => done[k]).map(([k, v]) => (k === 'hints' ? v : `${v}: ${done[k]}`));
  const quote = T.quotes[(done.level * 7) % T.quotes.length];
  const face = el('div', { class: 'pr-win-face' });
  face.innerHTML = avatar(done.customer, 'happy');
  const goNext = () => {
    if (game !== done) return;
    closeModal();
    startOrder(next);
  };
  const box = card(T.win(done.level),
    el('div', { class: 'pr-win-who' }, face, el('div', { class: 'pr-win-quote' }, `«${quote}»`, el('span', {}, done.customer.name))),
    starRow,
    el('p', { class: 'pr-note pr-center' }, faults.length ? faults.join(' · ') : T.clean),
    el('button', { class: 'btn pr-play', onclick: goNext }, T.next),
  );
  box.querySelector('.pr-card-head .pr-icon-btn').addEventListener('click', goNext);
  openModal(box, { dismissible: false });
  if (!reducedMotion()) {
    [...starRow.children].forEach((s, k) => {
      animate(s, [{ transform: 'scale(0) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }],
        { duration: 420, delay: 250 + k * 220, easing: 'ease-out', fill: 'backwards' });
    });
  }
  for (let k = 0; k < stars; k++) later(() => sfx('star', { k }, 0), 300 + k * 220);
}

function sendProgress() {
  const n = progress.level - 1;
  api.progress(n ? T.menu(n, progress.stars) : null);
}

// ---------- заказ ----------

function startOrder(s) {
  game = s;
  tool = '';
  heatLevel = { cover: 0, display: 0 };
  clearHint();
  buildScene();
  buildTicket();
  save();
  if (!reducedMotion()) {
    animate(S.flipper, [{ translate: '0 -40px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
    animate(ui.ticket, [{ opacity: 0, translate: '-12px 0' }, { opacity: 1, translate: '0 0' }], { duration: 300, easing: 'ease-out' });
  }
  sfx('place', {}, 0);
  introFault();
  if (tutorialAuto()) showHint(true);
}

/** Обучение: первая встреча с поломкой — карточка с советом. */
function introFault() {
  if (game.level > TUTORIAL.length) return;
  const f = game.faults[0];
  if (!T.intro[f] || seen.includes(f)) return;
  seen.push(f);
  api.storage.set('seen', seen);
  const [title, text] = T.intro[f];
  later(() => {
    if (!ui || modalActive) return;
    openModal(card(`${T.newFault}: ${title}`, el('p', { class: 'pr-note pr-rules' }, text),
      el('button', { class: 'btn pr-play', onclick: closeModal }, T.gotIt)));
  }, reducedMotion() ? 0 : 450);
}

// ---------- окна ----------

function openModal(content, { dismissible = true } = {}) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = dismissible ? (e) => { if (e.target === ui.modal) closeModal(); } : null;
  ui.modal.dataset.dismissible = dismissible ? '1' : '0';
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  if (pd) onPointerCancel();
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
  return el('div', { class: 'pr-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'pr-card-head' },
      el('h2', {}, title),
      el('button', { class: 'pr-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showTicket() {
  const face = el('div', { class: 'pr-win-face' });
  face.innerHTML = avatar(game.customer, mood);
  const notes = game.notes.filter((k) => T.finds[k]);
  openModal(card(game.customer.name,
    el('div', { class: 'pr-win-who' }, face, el('div', { class: 'pr-win-quote' }, `«${complaintText()}»`, el('span', {}, game.model.name))),
    el('h3', { class: 'pr-section' }, T.notes),
    notes.length
      ? el('ul', { class: 'pr-notes' }, notes.map((k) => el('li', { class: /ok$/.test(k) ? 'pr-note-ok' : '' }, T.finds[k])))
      : el('p', { class: 'pr-note' }, T.noNotes),
  ));
}

function showRules() {
  openModal(card(T.title,
    ...T.rules.map((line) => el('p', { class: 'pr-note pr-rules' }, line)),
    el('button', { class: 'btn pr-play', onclick: closeModal }, T.play),
  ));
}

function rankOf(stars) {
  let r = T.ranks[0][1];
  for (const [min, name] of T.ranks) if (stars >= min) r = name;
  return r;
}

function showStats() {
  const vals = [progress.level - 1, progress.stars, progress.perfect, progress.sparks];
  openModal(card(T.stats,
    el('div', { class: 'pr-rank' }, el('span', {}, T.rank), el('b', {}, rankOf(progress.stars))),
    el('div', { class: 'pr-table' }, T.statRows.map((label, k) => el('div', { class: 'pr-row' }, el('span', {}, label), el('b', {}, String(vals[k]))))),
  ));
}

const saveSettings = () => api.storage.set('settings', settings);

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'pr-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      skins.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.skin === id)));
      applyOptions();
      sfx('click');
    },
  }, el('span', { class: 'pr-swatch' }, el('span', { class: 'pr-swatch-phone' })), el('span', { class: 'pr-skin-name' }, T.skins[id])));
  const input = el('input', { type: 'checkbox', checked: settings.marks });
  input.addEventListener('change', () => {
    settings.marks = input.checked;
    saveSettings();
    paintMarks();
  });
  openModal(card(T.settings,
    el('h3', { class: 'pr-section' }, T.skin),
    el('div', { class: 'pr-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'pr-section' }, T.options),
    el('label', { class: 'pr-toggle' }, input, el('span', {}, T.marks)),
    el('button', { class: 'btn btn-secondary pr-play', onclick: showRules }, T.howTo),
  ));
}

function applyOptions() {
  host.dataset.skin = settings.skin;
}

function iconButton(icon, label, onclick, cls = 'pr-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function actionButton(icon, label, onclick, cls = '') {
  const b = el('button', { class: `pr-action ${cls}`, onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'pr-action-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function onKeydown(e) {
  if (modalActive) {
    if (e.key === 'Escape' && ui.modal.dataset.dismissible === '1') closeModal();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || !game) return;
  if (e.code === 'KeyF') onFlip();
  else if (e.code === 'KeyH') onHint();
  else if (e.key === 'Escape' && tool) pickTool(tool);
}

function onHint() {
  if (!canTouch()) return;
  audio.get();
  showHint(tutorialAuto());
}

function onVisibility() {
  if (document.visibilityState !== 'visible') save();
}

export default {
  id: 'repair',
  title: 'Ремонт телефона',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedProgress, savedSettings, savedSound, rulesSeen, savedSeen] = await Promise.all([
      api.storage.get('current'), api.storage.get('progress'), api.storage.get('settings'), api.storage.get('sound'),
      api.storage.get('rules'), api.storage.get('seen'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = isValidProgress(savedProgress) ? { ...savedProgress } : emptyProgress();
    seen = Array.isArray(savedSeen) ? savedSeen.filter((x) => typeof x === 'string') : [];
    if (savedSettings && typeof savedSettings === 'object') {
      settings = {
        skin: SKINS.includes(savedSettings.skin) ? savedSettings.skin : 'telegram',
        marks: savedSettings.marks !== false,
      };
    }

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      soundBtn.setAttribute('aria-label', soundBtn.title);
      sfx('click');
    });
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'pr-svg');
    svg.setAttribute('aria-hidden', 'true');
    ui = {
      sub: el('div', { class: 'pr-sub' }),
      avatar: el('div', { class: 'pr-avatar' }),
      name: el('div', { class: 'pr-name' }),
      complaint: el('div', { class: 'pr-complaint' }),
      stars: [0, 1, 2].map(() => el('span', { class: 'pr-star' }, '★')),
      stage: el('div', { class: 'pr-stage' }),
      svg,
      bubble: el('div', { class: 'pr-bubble', hidden: true }),
      flash: el('div', { class: 'pr-flash-screen' }),
      modal: el('div', { class: 'pr-modal', hidden: true }),
      tools: el('div', { class: 'pr-tools' }),
    };
    ui.ticket = el('button', { class: 'pr-ticket', onclick: () => { if (!modalActive && game) showTicket(); } },
      ui.avatar,
      el('div', { class: 'pr-ticket-text' }, ui.name, ui.complaint),
      el('div', { class: 'pr-stars' }, ui.stars));
    ui.flipBtn = actionButton(ICONS.flip, T.flip, onFlip);
    ui.hintBtn = actionButton(ICONS.hint, T.hint, onHint);
    ui.deliverBtn = actionButton(ICONS.deliver, T.deliver, onDeliver, 'pr-action-main');
    ui.toolBtns = TOOLS.map((t) => {
      const b = el('button', { class: 'pr-tool', 'data-tool': t, 'aria-pressed': 'false', title: T.toolHints[t], onclick: () => pickTool(t), onmousedown: (e) => e.preventDefault() },
        el('span', { class: 'pr-tool-icon' }), el('span', { class: 'pr-tool-name' }, T.tools[t]));
      b.firstChild.innerHTML = TOOL_ICONS[t];
      return b;
    });
    ui.tools.append(...ui.toolBtns);
    ui.stage.append(svg, ui.flash, ui.bubble);
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerCancel);
    ui.stage.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root = el('div', { class: 'pr' },
      el('div', { class: 'pr-header' },
        el('div', { class: 'pr-head-text' }, el('div', { class: 'pr-title' }, T.title), ui.sub),
        el('div', { class: 'pr-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
        ),
      ),
      ui.ticket,
      ui.stage,
      el('div', { class: 'pr-bar' }, ui.flipBtn, ui.hintBtn, ui.deliverBtn),
      ui.tools,
      ui.modal,
      toast.el,
    );
    container.append(root);
    applyOptions();
    fx = createFx(ui.stage, 'pr-fx');
    ui.stage.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);

    if (isValidState(saved) && !saved.done && saved.level >= 1) {
      game = saved;
      tool = '';
      buildScene();
      buildTicket();
      if (tutorialAuto()) showHint(true);
    } else startOrder(newOrder(progress.level));
    sendProgress();
    if (rulesSeen !== true) {
      if (!saved) showRules();
      api.storage.set('rules', true);
    }

    if (new URLSearchParams(location.search).has('prdebug')) {
      window.__pr = {
        get game() { return game; },
        get progress() { return progress; },
        get busy() { return busy; },
        get modal() { return modalActive; },
        tool: (t) => { tool = t; paintTools(); paintMarks(); },
        tap: (target) => doTool(target),
        flip: () => onFlip(),
        power: () => doPower(),
        deliver: () => onDeliver(),
        hint: () => showHint(true),
        next: () => nextStep(game),
        /** заказ с номером level; faults — свои поломки (['virus', 'water']) */
        start: (level, faults) => startOrder(newOrder(level, faults)),
        /** сыграть подсказками без анимации, пока не останется left шагов до сдачи */
        solveExcept: (left = 1) => {
          for (let k = 0; k < 400; k++) {
            const st = nextStep(game);
            if (!st || st.tool === 'deliver') break;
            const copy = structuredClone(game);
            let rest = 0;
            for (; rest < 400; rest++) {
              const n = nextStep(copy);
              if (!n || n.tool === 'deliver') break;
              act(copy, n.tool, n.target);
            }
            if (rest <= left) break;
            act(game, st.tool, st.target);
          }
          clearBugs();
          buildScene();
          after();
        },
        skin: (id) => { settings.skin = id; applyOptions(); },
      };
    }
  },

  getState() {
    if (!game || game.done || !game.moves) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    stopBugs();
    stopHeat();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (game && !game.done && game.moves) save();
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = host = root = ui = toast = fx = game = S = pd = hintShown = null;
    progress = emptyProgress();
    settings = defaultSettings();
    seen = [];
    bugs = [];
    adsGone = new Map();
    tool = overlay = '';
    modalActive = false;
    busy = 0;
    heatLevel = { cover: 0, display: 0 };
    mood = 'calm';
  },
};
