// «Логические схемы» — расставляешь вентили И, ИЛИ и НЕ, чтобы зажглась лампа.
// Схема идёт снизу вверх: источники → вентили → лампы. В пустые гнёзда ставятся И и ИЛИ из лотка, на пунктирные
// колечки надевается НЕ. Пока ток выключен, провода молчат: сначала думаешь, потом щёлкаешь выключателем — ток
// бежит по проводам, вентили срабатывают по очереди, и видно, дошёл ли он до лампы. Не дошёл (или загорелась лампа,
// которой гореть нельзя) — ток выбивает, схема остаётся подсвеченной: видно, где он пропал. Звёзды — за то, с какого
// включения получилось. У части уровней несколько проверок: источники переключаются сами, пройти надо каждую.
// Детали ставятся перетаскиванием или касаниями (деталь в лотке → гнездо); касание стоящей детали снимает её.
// Прогресс (звёзды по уровням), начатый уровень, статистика и настройки — в api.storage.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { CHAPTERS, LEVELS } from './levels.js';
import {
  GATE_KINDS, KIND_TITLES, parseLevel, trayLeft, isComplete, check, solve, newState, isValidState, isTouched,
  placeGate, placeNot, swapGates, moveNot, applyHint, starsFor,
  emptyProgress, migrateProgress, starsOf, totalStars, passedCount, isOpen, nextLevel, recordStars,
  emptyStats, migrateStats, plural,
} from './logic.js';
import { layout, timeline, FLOW, CHIP } from './layout.js';
import { chip, bead } from './art.js';
import { mountBoard, paintSetup, paintRow, paintSignals, hasBead, pinValue } from './view.js';

const SKINS = ['telegram', 'pcb', 'blueprint', 'paper', 'scope', 'neon'];
const TOTAL = LEVELS.length;
const MAX_SCALE = 1.45;            // мелкая схема не растягивается на весь экран
const DRAG_START = 8;              // px: дальше — уже перетаскивание, а не касание
const LIFT = 36;                   // px: деталь под пальцем приподнята, чтобы её было видно
const SVG_NS = 'http://www.w3.org/2000/svg';

const T = {
  title: 'Логические схемы',
  level: (n) => `Уровень ${n}`,
  levels: 'Уровни',
  taskOne: 'Зажги лампу',
  taskAll: 'Зажги все лампы',
  taskMixed: 'Зажги лампы, а перечёркнутые не трогай',
  taskChecks: 'Схема должна пройти все проверки',
  power: 'ток',
  powerOn: 'Включить ток',
  pile: (kind, left) => `${KIND_TITLES[kind]}: осталось ${left}`,
  socketEmpty: 'Пустое гнездо',
  check: (k) => `Проверка ${k}`,
  stars: (n) => `Звёзд за уровень: ${n} из 3`,
  needFill: 'Сначала заполни все гнёзда',
  needChange: 'Ток выбило — поменяй что-нибудь в схеме',
  needPick: 'Выбери вентиль в лотке',
  noneLeft: (kind) => `«${KIND_TITLES[kind]}» в лотке кончились`,
  locked: 'Эта деталь стоит по подсказке',
  failDark: 'Лампа не зажглась',
  failSome: 'Зажглись не все лампы',
  failWrong: 'Загорелась лампа, которой гореть нельзя',
  hint: 'Подсказка',
  hintDone: 'Все детали на местах — включай ток',
  hintUsed: 'Деталь на месте. Подсказка стоит звезды',
  praise: ['', 'Работает', 'Хорошо!', 'С первого включения!'],
  passed: (n) => `Уровень ${n} пройден`,
  faults: (fails, hints) => [
    fails ? `${fails} ${plural(fails, ['включение', 'включения', 'включений'])} впустую` : '',
    hints ? `${hints} ${plural(hints, ['подсказка', 'подсказки', 'подсказок'])}` : '',
  ].filter(Boolean).join(' · '),
  onward: 'Дальше',
  again: 'Заново',
  allDone: 'Все схемы собраны',
  toLevels: 'К уровням',
  close: 'Закрыть',
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', pcb: 'Плата', blueprint: 'Чертёж', paper: 'Тетрадь', scope: 'Осциллограф', neon: 'Неон' },
  stats: { passed: 'Пройдено уровней', stars: 'Звёзд', perfect: 'С первого включения', launches: 'Включений тока', hints: 'Подсказок' },
  legend: {
    and: ['И', 'пропускает ток, только когда он есть на обоих входах.'],
    or: ['ИЛИ', 'пропускает ток, когда он есть хотя бы на одном входе.'],
    not: ['НЕ', 'переворачивает: был ток — не станет, не было — появится.'],
  },
  rules: [
    'Ток идёт снизу вверх: от источников через вентили к лампам. Расставь детали из лотка и включи ток — он побежит по проводам, и станет видно, дошёл ли до лампы.',
    'Пунктирный прямоугольник — гнездо под «И» или «ИЛИ», заполнить надо все. Пунктирное колечко на проводе — место под «НЕ», его можно оставить пустым. Детали с контуром впаяны.',
    'Деталь можно перетащить, а можно коснуться её в лотке и потом гнезда. Касание стоящей детали снимает её.',
    'Перечёркнутая лампа гореть не должна. Если наверху несколько проверок — источники переключаются сами, и схема должна пройти каждую.',
    'С первого включения — три звезды. Каждое включение впустую и каждая подсказка — минус звезда, но одна останется всегда.',
  ],
};

// подсказки первых уровней, где появляется новое
const TIPS = {
  1: 'Перетащи «И» в гнездо и включи ток. «И» пропускает ток, когда он есть на обоих входах',
  2: 'У «ИЛИ» хватит и одного входа под током. Что поставить сюда?',
  3: 'Вентили с контуром впаяны — их не снять. Доведи ток до лампы',
  21: '«НЕ» переворачивает: был ток — не станет, не было — появится',
  22: 'Пунктирное колечко на проводе — место под «НЕ». Коснись его',
  41: 'Перечёркнутая лампа гореть не должна. Зажги только левую',
  61: 'Проверок две: источники переключатся сами. Лампа должна загореться в обеих',
  62: 'В каждой проверке видно, что должно быть с лампой. Коснись проверки — схема покажет её',
};

const svgIcon = (body, fill = false, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  down: svgIcon('<path d="m7 10 5 5 5-5"/>', false, 18),
  star: svgIcon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>', true),
  pip: svgIcon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>', true, 14),
  bolt: svgIcon('<path d="M13.5 2.5 5 13.5h5.5l-1 8 8.5-11h-5.5l1-8Z"/>', true, 18),
  check: svgIcon('<path d="m6 12.5 4 4L18 8"/>', false, 13),
  cross: svgIcon('<path d="m7 7 10 10M17 7 7 17"/>', false, 13),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('lgdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let progress = emptyProgress();
let stats = emptyStats();
let settings = { skin: 'telegram' };
let n = 1;                         // номер уровня на экране
let level = null;
let lay = null;
let refs = null;                   // части схемы на странице (view.js)
let state = null;                  // расстановка игрока и счёт включений
let solutions = null;              // решения уровня — считаются при первой подсказке
let rowAt = 0;                     // какая проверка показана на схеме
let phase = 'idle';                // idle — расставляем; running — ток бежит; failed — выбило, схема подсвечена; won
let ran = null;                    // последнее включение: { rows: расчёт по проверкам, upTo: до какой дошли }
let picked = null;                 // деталь, выбранная касанием в лотке: 'and' | 'or' | 'not'
let drag = null;                   // палец на детали: { from, kind, index, … }
let scale = 1;                     // пикселей в единице схемы
let piles = new Map();             // вид детали → кнопка лотка
let checkCards = [];
let modalActive = false;
let modalToken = 0;
let resultToken = 0;
let soundOn = true;
let resizeWatch = null;
let lastGateSound = 0;
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

function stopTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
}

const saveProgress = () => api?.storage.set('progress', progress);
const saveStats = () => api?.storage.set('stats', stats);
const editable = () => Boolean(level && !modalActive && (phase === 'idle' || phase === 'failed'));
const left = () => trayLeft(level, state);

function reportProgress() {
  const passed = passedCount(progress);
  api?.progress(passed ? `${T.level(nextLevel(progress, TOTAL))} · ★ ${totalStars(progress)}` : null);
}

/** Начатый уровень сохраняется, как только в нём что-то сделано. */
function saveState() {
  if (!state || phase === 'won') return;
  if (isTouched(state)) api?.storage.set('current', state);
  else api?.storage.remove('current');
}

// ---------- движение деталей схемы ----------
// Части схемы стоят на местах через transform в разметке — двигать их можно только свойствами scale / translate.

const BUMP = [{ scale: 1 }, { scale: 1.12 }, { scale: 1 }];
const DROP_IN = [{ scale: 0.6, opacity: 0.3 }, { scale: 1.1, opacity: 1, offset: 0.6 }, { scale: 1 }];
const NUDGE = [{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '0 0' }];

const bump = (node) => node && animate(node, BUMP, { duration: 180, easing: 'ease-out' });
const dropIn = (node) => node && animate(node, DROP_IN, { duration: 220, easing: 'ease-out' });
const nudge = (node) => node && animate(node, NUDGE, { duration: 280, easing: 'ease-in-out' });
const slotOf = (node) => node.querySelector('.lg-slot');

// ---------- лоток, звёзды, проверки ----------

function pileSvg(kind) {
  if (kind === 'not') {
    return `<svg viewBox="-19 -13 38 29" width="38" height="29" aria-hidden="true"><rect class="lg-under" x="-15" y="-6" width="30" height="19" rx="9.5"/>${bead()}</svg>`;
  }
  return `<svg viewBox="-36 -24 72 52" width="72" height="52" aria-hidden="true"><rect class="lg-under" x="-34" y="-15.5" width="68" height="40" rx="11"/>${chip(kind)}</svg>`;
}

function buildTray() {
  piles = new Map();
  const nodes = [...GATE_KINDS, 'not'].filter((kind) => level.tray[kind] > 0).map((kind) => {
    const count = el('span', { class: 'lg-pile-count' });
    const pile = el('button', { class: 'lg-pile', 'data-kind': kind });
    pile.innerHTML = pileSvg(kind);
    pile.append(count);
    piles.set(kind, { pile, count });
    return pile;
  });
  ui.tray.replaceChildren(...nodes);
}

function renderTray() {
  const rest = left();
  for (const [kind, { pile, count }] of piles) {
    count.textContent = `×${rest[kind]}`;
    pile.classList.toggle('lg-empty', rest[kind] < 1);
    pile.classList.toggle('lg-single', rest[kind] < 2);
    pile.classList.toggle('lg-picked', picked === kind);
    pile.setAttribute('aria-label', T.pile(kind, rest[kind]));
    pile.setAttribute('aria-pressed', String(picked === kind));
  }
}

function renderPower() {
  ui.power.classList.toggle('lg-wait', phase === 'idle' && !isComplete(state));
  ui.power.classList.toggle('lg-ready', phase === 'idle' && isComplete(state));
  ui.power.classList.toggle('lg-live-on', phase === 'running' || phase === 'won');
  // на первом уровне лоток сам зовёт взять деталь
  ui.tray.classList.toggle('lg-beckon', n === 1 && phase === 'idle' && !isTouched(state) && !picked);
}

function renderPips() {
  const stars = starsFor(state.fails, state.hints);
  ui.pips.setAttribute('aria-label', T.stars(stars));
  [...ui.pips.children].forEach((pip, k) => {
    const off = k >= stars;
    if (off && !pip.classList.contains('lg-pip-off')) animate(pip, [{ scale: 1.6 }, { scale: 1 }], { duration: 340, easing: 'ease-out' });
    pip.classList.toggle('lg-pip-off', off);
  });
}

function buildChecks() {
  checkCards = [];
  ui.checks.hidden = level.rows.length < 2;
  if (level.rows.length < 2) {
    ui.checks.replaceChildren();
    return;
  }
  const dot = (cls, on) => el('i', { class: `${cls}${on ? ' lg-mini-on' : ''}` });
  ui.checks.replaceChildren(...level.rows.map((row, k) => {
    const mark = el('span', { class: 'lg-check-mark' });
    const card = el('button', { class: 'lg-check', 'aria-label': T.check(k + 1), onclick: () => showRow(k) },
      el('span', { class: 'lg-check-row' }, row.want.map((v) => dot('lg-mini-lamp', v))),
      el('span', { class: 'lg-check-row' }, row.src.map((v) => dot('lg-mini-src', v))),
      mark,
    );
    checkCards.push({ card, mark });
    return card;
  }));
}

function renderChecks() {
  checkCards.forEach(({ card, mark }, k) => {
    card.setAttribute('aria-pressed', String(k === rowAt));
    const done = ran && k <= ran.upTo;
    const ok = done && ran.rows[k].ok;
    card.classList.toggle('lg-pass', Boolean(done && ok));
    card.classList.toggle('lg-fail', Boolean(done && !ok));
    const icon = done ? (ok ? ICONS.check : ICONS.cross) : '';
    if (mark.dataset.icon !== (done ? String(ok) : '')) {
      mark.dataset.icon = done ? String(ok) : '';
      if (icon) mark.innerHTML = icon;
    }
  });
}

/** Показать на схеме проверку k: положение источников, цель ламп и ток, если её уже включали. */
function showRow(k) {
  if (phase === 'running' || !level || k === rowAt) return;
  rowAt = k;
  sfx('pick');
  paint();
}

// ---------- схема ----------

/** Места, куда встанет деталь kind: свободные гнёзда и гнёзда с другим вентилем, пустые колечки. */
function targetsFor(kind) {
  if (!kind) return [];
  if (kind === 'not') return refs.rings.filter((_, k) => !state.nots[k] && !state.lockR.includes(k));
  return refs.sockets.filter((_, k) => state.kinds[k] !== kind && !state.lockK.includes(k));
}

function renderOffer() {
  const kind = drag?.moved ? drag.kind : picked;
  const offer = new Set(editable() ? targetsFor(kind) : []);
  for (const g of [...refs.sockets, ...refs.rings]) {
    g.classList.toggle('lg-offer', offer.has(g));
    g.classList.toggle('lg-aim', Boolean(drag?.moved && drag.aim === g));
  }
}

/** Привести страницу к состоянию. */
function paint() {
  paintSetup(refs, state, state);
  const row = level.rows[rowAt];
  paintRow(refs, row);
  paintSignals(refs, ran && rowAt <= ran.upTo ? ran.rows[rowAt] : null, row);
  refs.sockets.forEach((g, k) => g.setAttribute('aria-label', state.kinds[k] ? KIND_TITLES[state.kinds[k]] : T.socketEmpty));
  renderTray();
  renderPower();
  renderPips();
  renderChecks();
  renderOffer();
  ui.hintBtn.classList.toggle('lg-dim', phase === 'running' || phase === 'won');
}

/** Размер схемы на экране: целиком в отведённое место, мелкая — не крупнее MAX_SCALE. */
function fit() {
  if (!ui || !lay) return;
  const w = ui.stage.clientWidth - 16;
  const h = ui.stage.clientHeight - 8;
  if (w < 60 || h < 60) return;
  scale = Math.min(w / lay.box.w, h / lay.box.h, MAX_SCALE);
  ui.board.style.width = `${lay.box.w * scale}px`;
  ui.board.style.height = `${lay.box.h * scale}px`;
}

/** Точка схемы → место на экране. */
function toScreen(p) {
  const rect = ui.board.getBoundingClientRect();
  return { x: rect.left + (p.x - lay.box.x) * scale, y: rect.top + (p.y - lay.box.y) * scale };
}

const socketPoint = (k) => lay.gates[level.sockets[k]];
function ringPoint(k) {
  const r = level.rings[k];
  return lay.pins.get(r.out === undefined ? `g${r.gate}:${r.pin}` : `o${r.out}`).bead;
}

// ---------- расстановка ----------

/** Расстановка изменилась: подсвеченная после неудачи схема гаснет, уровень сохраняется. */
function edited() {
  if (phase === 'failed') {
    phase = 'idle';
    ran = null;
  }
  if (picked && left()[picked] < 1) picked = null;
  saveState();
  paint();
}

function deny(node, text) {
  sfx('deny');
  api.platform.haptic.notification('warning');
  if (node instanceof SVGElement) nudge(node);
  else if (node) shake(node, { distance: 4, duration: 280 });
  if (text) toast.show(text, 1700);
}

function setGate(k, kind) {
  const g = refs.sockets[k];
  if (state.lockK.includes(k)) return deny(g, T.locked);
  if (kind && state.kinds[k] !== kind && left()[kind] < 1) return deny(piles.get(kind)?.pile, T.noneLeft(kind));
  if (!placeGate(level, state, k, kind)) return null;
  sfx(kind ? 'place' : 'remove');
  api.platform.haptic.impact(kind ? 'medium' : 'light');
  edited();
  if (kind) dropIn(slotOf(g).firstElementChild);
  return true;
}

function setNot(k, on) {
  const g = refs.rings[k];
  if (state.lockR.includes(k)) return deny(g, T.locked);
  if (on && left().not < 1) return deny(piles.get('not')?.pile, T.noneLeft('not'));
  if (!placeNot(level, state, k, on)) return null;
  sfx(on ? 'bead' : 'remove');
  api.platform.haptic.impact('light');
  edited();
  if (on) dropIn(slotOf(g).firstElementChild);
  return true;
}

/** Касание без перетаскивания. */
function tap(what) {
  if (what.from === 'tray') {
    if (left()[what.kind] < 1) return deny(piles.get(what.kind).pile, T.noneLeft(what.kind));
    picked = picked === what.kind ? null : what.kind;
    sfx('pick');
    api.platform.haptic.selection();
    renderTray();
    renderOffer();
    return null;
  }
  if (what.from === 'ring') return setNot(what.index, state.nots[what.index] ? 0 : 1);
  const k = what.index;
  const now = state.kinds[k];
  if (picked && picked !== 'not') return setGate(k, now === picked ? null : picked);
  if (now) return setGate(k, null);
  const rest = left();
  const options = GATE_KINDS.filter((kind) => rest[kind] > 0);
  if (options.length === 1) return setGate(k, options[0]);
  if (!options.length) return deny(refs.sockets[k], null);
  // непонятно, что ставить: лоток подсказывает, что выбрать надо в нём
  for (const kind of options) bump(piles.get(kind).pile);
  toast.show(T.needPick, 1600);
  sfx('pick');
  return null;
}

// ---------- перетаскивание ----------

function ghostSvg(kind) {
  const s = Math.max(0.85, scale) * 1.08;
  const [w, h] = kind === 'not' ? [38, 29] : [72, 52];
  const box = kind === 'not' ? '-19 -14.5 38 29' : '-36 -26 72 52';
  return `<svg viewBox="${box}" width="${w * s}" height="${h * s}">${kind === 'not' ? bead() : chip(kind)}</svg>`;
}

function moveGhost(x, y) {
  const g = drag.ghost;
  const box = root.getBoundingClientRect();
  g.style.translate = `${x - box.left - g.offsetWidth / 2}px ${y - box.top - g.offsetHeight / 2}px`;
}

/** Ближайшее к точке место, куда встанет деталь (или её собственное — тогда она просто вернётся). */
function aimAt(x, y) {
  const gates = drag.kind !== 'not';
  const list = gates ? refs.sockets : refs.rings;
  const reach = (gates ? 46 : 34) * scale + 14;
  let best = null;
  let bestD = reach;
  list.forEach((g, k) => {
    if ((gates ? state.lockK : state.lockR).includes(k)) return;
    const own = (gates && drag.from === 'socket' && drag.index === k) || (!gates && drag.from === 'ring' && drag.index === k);
    // туда, где такая деталь уже стоит, ставить нечего
    if (!own && (gates ? state.kinds[k] === drag.kind : state.nots[k])) return;
    const p = toScreen(gates ? socketPoint(k) : ringPoint(k));
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  });
  return best;
}

/**
 * Гнездо или колечко под пальцем. На большой схеме колечко на экране меньше пальца, поэтому берётся ближайшее
 * место, а не то, в которое попали точно: внутри гнезда — гнездо, иначе колечко поблизости, иначе гнездо рядом.
 */
function slotAt(x, y) {
  let ring = null;
  let ringD = Math.max(22, 24 * scale);
  refs.rings.forEach((g, k) => {
    const p = toScreen(ringPoint(k));
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < ringD) {
      ringD = d;
      ring = { from: 'ring', index: k, kind: state.nots[k] ? 'not' : null, origin: g };
    }
  });
  let sock = null;
  let sockD = 12;
  refs.sockets.forEach((g, k) => {
    const p = toScreen(socketPoint(k));
    const d = Math.hypot(Math.max(0, Math.abs(p.x - x) - (CHIP.w / 2) * scale), Math.max(0, Math.abs(p.y - y) - (CHIP.h / 2) * scale));
    if (d < sockD) {
      sockD = d;
      sock = { from: 'socket', index: k, kind: state.kinds[k], origin: g };
    }
  });
  return sock && sockD === 0 ? sock : ring ?? sock;
}

function onPointerDown(e) {
  if (!editable() || drag || e.button > 0) return;
  const pile = e.target.closest('.lg-pile');
  const what = pile ? { from: 'tray', kind: pile.dataset.kind, origin: pile } : slotAt(e.clientX, e.clientY);
  if (!what) return;
  e.preventDefault();
  drag = { ...what, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, aim: null, lift: e.pointerType === 'mouse' ? 0 : LIFT };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function canDrag() {
  if (!drag.kind) return false;
  if (drag.from === 'tray') return left()[drag.kind] > 0;
  return !(drag.from === 'socket' ? state.lockK : state.lockR).includes(drag.index);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START || !canDrag()) return;
    drag.moved = true;
    drag.ghost = el('div', { class: 'lg-ghost' });
    drag.ghost.innerHTML = ghostSvg(drag.kind);
    root.append(drag.ghost);
    if (drag.from !== 'tray') slotOf(drag.origin).style.opacity = '0';
    sfx('pick');
    api.platform.haptic.selection();
  }
  const y = e.clientY - drag.lift;
  moveGhost(e.clientX, y);
  drag.aim = aimAt(e.clientX, y);
  renderOffer();
}

function endDrag() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  if (drag?.from !== 'tray' && drag?.origin) slotOf(drag.origin).style.opacity = '';
  drag?.ghost?.remove();
  drag = null;
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  endDrag();
  if (!editable()) return;
  if (!d.moved) {
    if (e.type === 'pointerup') tap(d);
    return;
  }
  const gates = d.kind !== 'not';
  const to = d.aim ? Number(gates ? d.aim.dataset.socket : d.aim.dataset.ring) : -1;
  if (e.type === 'pointercancel' || (d.from !== 'tray' && to === d.index)) {
    renderOffer();
    return;
  }
  if (d.from === 'tray') {
    if (to < 0) renderOffer();
    else if (gates) setGate(to, d.kind);
    else setNot(to, 1);
    return;
  }
  // деталь со схемы: в другое место — переставить (вентили меняются местами), мимо — обратно в лоток
  if (to < 0) {
    if (gates) setGate(d.index, null);
    else setNot(d.index, 0);
    return;
  }
  const moved = gates ? swapGates(state, d.index, to) : moveNot(state, d.index, to);
  if (!moved) {
    renderOffer();
    return;
  }
  sfx(gates ? 'place' : 'bead');
  api.platform.haptic.impact('medium');
  edited();
  dropIn(slotOf(d.aim).firstElementChild);
  if (gates && state.kinds[d.index]) dropIn(slotOf(d.origin).firstElementChild);
}

// ---------- ток ----------

function lampEvent(i, res, row, counter) {
  const g = refs.lamps[i];
  const on = res.outs[i] === 1;
  const want = row.want[i] === 1;
  g.classList.toggle('lg-lit', on);
  g.classList.toggle('lg-wrong', on && !want);
  g.classList.toggle('lg-miss', !on && want);
  refs.washes[i].classList.toggle('lg-lit', on && want);
  if (on && want) {
    sfx('lamp', { step: counter.lit++ });
    api.platform.haptic.impact('light');
    // лампа накаливания разгорается не сразу: вспыхнула, чуть просела и набрала полный свет
    animate(g.querySelector('.lg-rays'), [{ scale: 0.5 }, { scale: 1.15, offset: 0.6 }, { scale: 1 }], { duration: 320, easing: 'ease-out' });
    animate(g.querySelector('.lg-halo'), [{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0.45, offset: 0.5 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
    animate(g.querySelector('.lg-glass'), [{ scale: 1 }, { scale: 1.09, offset: 0.3 }, { scale: 1 }], { duration: 380, easing: 'ease-out' });
  } else if (on !== want) {
    if (on) sfx('wrong');
    nudge(g);
  }
}

/** Ток бежит по схеме в проверке row: провода загораются от источников, вентили срабатывают по очереди. */
function flow(res, row, fast) {
  const counter = { lit: 0 };
  if (reducedMotion()) {
    paintSignals(refs, res, row);
    level.outs.forEach((_, i) => lampEvent(i, res, row, counter));
    return later(null, 160);
  }
  paintSignals(refs, null, row);
  const k = fast ? 1.6 : 1;
  const f = { speed: FLOW.speed * k, gate: FLOW.gate / k, bead: FLOW.bead / k, lamp: FLOW.lamp / k };
  const tl = timeline(level, lay, (key) => hasBead(refs, key), f);
  const S = level.sources.length;
  const run = (line, delay, len) => {
    line.classList.add('lg-lit');
    animate(line, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: Math.max(40, len / f.speed), delay, easing: 'linear', fill: 'backwards' });
  };
  // искры побегут по куску, когда ток прошёл его целиком
  const spark = (line, delay, len) => later(() => line.classList.add('lg-lit'), delay + len / f.speed);
  for (const net of lay.nets) {
    if (res.nodes[net.node] !== 1) continue;
    const lines = refs.nets.get(net.node);
    const t0 = tl.netAt[net.node];
    net.pieces.forEach((p, i) => {
      run(lines.live[i], t0 + p.at / f.speed, p.len);
      run(lines.glow[i], t0 + p.at / f.speed, p.len);
      spark(lines.sparks[i], t0 + p.at / f.speed, p.len);
    });
    net.dots.forEach((d, i) => later(() => lines.dots[i].classList.add('lg-lit'), t0 + d.at / f.speed));
  }
  for (const [key, pin] of lay.pins) {
    if (!pin.tail) continue;
    const at = tl.pinAt.get(key);
    const beadOn = hasBead(refs, key);
    const value = pinValue(level, res, key);
    const mark = refs.marks.get(key);
    if (beadOn) {
      later(() => {
        mark.classList.toggle('lg-hot', value === 1);
        bump(mark.querySelector('.lg-bead'));
      }, at.bead);
    }
    if (value === 1) {
      const lines = refs.tails.get(key);
      const start = at.bead + (beadOn ? f.bead : 0);
      run(lines.live[0], start, pin.tail.len);
      run(lines.glow[0], start, pin.tail.len);
      spark(lines.sparks[0], start, pin.tail.len);
    }
  }
  const order = level.gates.map((_, i) => i).sort((a, b) => tl.gateAt[a] - tl.gateAt[b]);
  order.forEach((i, step) => later(() => {
    const on = res.nodes[S + i] === 1;
    refs.gates[i].classList.toggle('lg-hot', on);
    bump(refs.gates[i].querySelector('.lg-chip'));
    // два вентиля сработали разом — звучит один
    if (performance.now() - lastGateSound > 45) {
      lastGateSound = performance.now();
      sfx('gate', { step, on });
    }
  }, tl.gateAt[i]));
  level.outs.forEach((_, i) => later(() => lampEvent(i, res, row, counter), tl.outAt[i]));
  return later(null, tl.total + 340);
}

function stopFlow() {
  stopTimers();
  ui?.board.getAnimations?.({ subtree: true }).forEach((a) => a.cancel());
}

async function onPower() {
  if (!level || modalActive || phase === 'running' || phase === 'won') return;
  if (phase === 'failed') {
    deny(ui.power, T.needChange);
    return;
  }
  if (!isComplete(state)) {
    deny(ui.power, T.needFill);
    refs.sockets.forEach((g, k) => { if (!state.kinds[k]) nudge(g); });
    return;
  }
  const playing = level;
  const result = check(level, state);
  phase = 'running';
  picked = null;
  ran = { rows: result.rows, upTo: -1 };
  stats.launches += 1;
  saveStats();
  sfx('power');
  api.platform.haptic.impact('medium');
  paint();
  await later(null, reducedMotion() ? 0 : 220);
  for (let r = 0; r < level.rows.length; r++) {
    if (level !== playing) return;
    rowAt = r;
    // следующая проверка: схема гаснет, источники переключаются
    if (r > 0) paintSignals(refs, null, level.rows[r]);
    paintRow(refs, level.rows[r]);
    renderChecks();
    if (r > 0) await later(null, reducedMotion() ? 0 : 320);
    await flow(result.rows[r], level.rows[r], r > 0);
    if (level !== playing) return;
    ran.upTo = r;
    renderChecks();
    if (!result.rows[r].ok) break;
    if (r < level.rows.length - 1) {
      sfx('pass', { step: r });
      await later(null, reducedMotion() ? 0 : 420);
    }
  }
  if (level !== playing) return;
  if (!result.ok) {
    failRun(result);
    return;
  }
  // все проверки пройдены — на схеме остаётся та, где горит больше всего ламп: победа должна светиться
  const lit = level.rows.map((row) => row.want.reduce((a, b) => a + b, 0));
  const best = lit.indexOf(Math.max(...lit));
  if (best !== rowAt) {
    await later(null, reducedMotion() ? 0 : 380);
    if (level !== playing) return;
    rowAt = best;
    paint();
  }
  win();
}

function failRun(result) {
  phase = 'failed';
  state.fails += 1;
  saveState();
  const bad = result.rows[result.firstBad];
  const want = level.rows[result.firstBad].want;
  const wrong = bad.outs.some((v, i) => v === 1 && want[i] === 0);
  later(() => {
    if (!ui) return;
    sfx('trip');
    api.platform.haptic.notification('error');
    renderPower();
    renderPips();
    shake(ui.power, { distance: 4, duration: 300 });
    toast.show(wrong ? T.failWrong : level.outs.length > 1 ? T.failSome : T.failDark, 2000);
  }, reducedMotion() ? 0 : 380);
}

function win() {
  phase = 'won';
  const stars = starsFor(state.fails, state.hints);
  const passed = n;
  const { fails, hints } = state;
  recordStars(progress, n, stars);
  stats.solved += 1;
  if (stars === 3) stats.perfect += 1;
  saveProgress();
  saveStats();
  api.storage.remove('current');
  reportProgress();
  paint();
  later(() => {
    if (!ui) return;
    sfx('win');
    api.platform.haptic.notification('success');
    const starNodes = [0, 1, 2].map(() => {
      const s = el('i', {});
      s.innerHTML = ICONS.star;
      return s;
    });
    const last = passed >= TOTAL;
    const card = el('div', { class: 'lg-result-card' },
      el('div', { class: 'lg-stars', 'aria-label': `${stars} из 3` }, starNodes),
      el('h2', {}, last ? T.allDone : T.praise[stars]),
      el('p', { class: 'lg-note' }, [T.passed(passed), T.faults(fails, hints)].filter(Boolean).join(' · ')),
      el('div', { class: 'lg-result-actions' },
        el('button', { class: 'btn lg-btn-soft', onclick: () => {
          sfx('click');
          startLevel(passed);
        } }, T.again),
        el('button', { class: 'btn', onclick: () => {
          sfx('click');
          if (last) {
            closeResult();
            showLevels();
          } else startLevel(passed + 1);
        } }, last ? T.toLevels : T.onward),
      ),
    );
    resultToken++;
    ui.result.replaceChildren(card);
    showLayer(ui.result);
    starNodes.slice(0, stars).forEach((s, k) => later(() => {
      if (!ui) return;
      s.classList.add('lg-star-on');
      sfx('star', { step: k });
      animate(s, DROP_IN, { duration: 320, easing: 'ease-out' });
    }, reducedMotion() ? 0 : 300 + k * 280));
  }, reducedMotion() ? 0 : 750);
}

function onHint() {
  if (!editable()) return;
  solutions ??= solve(level);
  const before = starsFor(state.fails, state.hints);
  const hint = applyHint(level, state, solutions);
  if (!hint) {
    toast.show(T.hintDone, 1700);
    return;
  }
  stats.hints += 1;
  saveStats();
  sfx('hint');
  api.platform.haptic.impact('medium');
  edited();
  const g = hint.socket !== undefined ? refs.sockets[hint.socket] : refs.rings[hint.ring];
  dropIn(slotOf(g).firstElementChild ?? g);
  if (starsFor(state.fails, state.hints) < before) toast.show(T.hintUsed, 1900);
}

// ---------- уровень ----------

/** Убрать карточку итога (с затуханием). */
function closeResult() {
  const token = ++resultToken;
  if (ui.result.hidden) return;
  hideLayer(ui.result, () => token === resultToken).then(() => {
    if (ui && token === resultToken) ui.result.replaceChildren();
  });
}

function taskText() {
  if (TIPS[n]) return TIPS[n];
  if (level.rows.length > 1) return T.taskChecks;
  if (level.rows[0].want.includes(0)) return T.taskMixed;
  return level.outs.length > 1 ? T.taskAll : T.taskOne;
}

/** Показать уровень num (resume — сохранённое состояние этого уровня). */
function startLevel(num, resume = null) {
  stopFlow();
  if (drag) endDrag();
  n = Math.max(1, Math.min(TOTAL, num));
  level = parseLevel(LEVELS[n - 1]);
  lay = layout(level);
  refs = mountBoard(ui.board, level, lay);
  state = isValidState(resume, level, n) ? structuredClone(resume) : newState(n, level);
  solutions = null;
  rowAt = 0;
  phase = 'idle';
  ran = null;
  picked = null;
  closeResult();
  ui.levelLabel.textContent = T.level(n);
  ui.taskText.textContent = taskText();
  buildTray();
  buildChecks();
  fit();
  paint();
  if (!isTouched(state)) api.storage.remove('current');
  animate(ui.board, [{ opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1 }], { duration: 280, easing: 'ease-out' });
  animate(ui.tray, [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 240, easing: 'ease-out' });
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
  return el('div', { class: 'lg-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'lg-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'lg-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function legendRow(kind) {
  const pic = el('span', {});
  pic.innerHTML = kind === 'not'
    ? `<svg viewBox="-19 -14.5 38 29" width="42" height="32" aria-hidden="true">${bead()}</svg>`
    : `<svg viewBox="-36 -26 72 52" width="68" height="49" aria-hidden="true">${chip(kind)}</svg>`;
  const [name, text] = T.legend[kind];
  return el('div', { class: 'lg-legend-row' }, pic.firstElementChild, el('p', {}, el('b', {}, name), ` ${text}`));
}

function showHelp() {
  openModal(sheet(T.help.title,
    el('div', { class: 'lg-legend' }, ['and', 'or', 'not'].map(legendRow)),
    T.rules.map((text) => el('p', { class: 'lg-rule' }, text)),
  ));
}

function miniStars(count) {
  const box = el('span', { class: 'lg-cell-stars' });
  box.innerHTML = [0, 1, 2].map((k) => `<i class="${k < count ? 'lg-star-on' : ''}">${ICONS.star}</i>`).join('');
  return box;
}

function showLevels() {
  const body = CHAPTERS.flatMap((chapter) => {
    const nums = Array.from({ length: chapter.count }, (_, k) => chapter.from + k);
    const got = nums.reduce((sum, k) => sum + starsOf(progress, k), 0);
    return [
      el('div', { class: 'lg-chapter' }, el('h3', {}, chapter.title), el('span', {}, `★ ${got} / ${chapter.count * 3}`)),
      el('div', { class: 'lg-levels' }, nums.map((k) => el('button', {
        class: `lg-cell${k === n ? ' lg-current' : ''}`,
        disabled: !isOpen(progress, k),
        'aria-label': T.level(k),
        onclick: () => {
          closeModal();
          if (k !== n || phase === 'won') {
            api.storage.remove('current');
            startLevel(k);
          }
        },
      }, String(k), miniStars(starsOf(progress, k))))),
    ];
  });
  openModal(sheet(T.levels, ...body));
  ui.modal.querySelector('.lg-current')?.scrollIntoView({ block: 'center' });
}

// образец скина: провод, вентиль и горящая лампа в его цветах
const SWATCH = '<svg viewBox="0 0 78 54" width="78" height="54" aria-hidden="true">'
  + '<path class="lg-base" d="M14 46V40Q14 36 18 36H26"/><path class="lg-live lg-lit" d="M39 22V15"/>'
  + `<g transform="translate(39 31) scale(0.6)">${chip('and')}</g>`
  + '<circle class="lg-swatch-glow" cx="39" cy="10" r="12"/><circle class="lg-swatch-lamp" cx="39" cy="10" r="6"/></svg>';

function showSettings() {
  const buttons = SKINS.map((id) => {
    const swatch = el('span', { class: 'lg-swatch', 'data-skin': id });
    swatch.innerHTML = SWATCH;
    return el('button', {
      class: 'lg-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
      onclick: () => {
        settings.skin = id;
        host.dataset.skin = id;
        api.storage.set('settings', settings);
        buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
        sfx('pick');
      },
    }, swatch, T.skins[id]);
  });
  const totals = {
    passed: `${passedCount(progress)} / ${TOTAL}`, stars: `${totalStars(progress)} / ${TOTAL * 3}`,
    perfect: stats.perfect, launches: stats.launches, hints: stats.hints,
  };
  openModal(sheet(T.settings.title,
    el('h3', { class: 'lg-section' }, T.settings.skin),
    el('div', { class: 'lg-skins', role: 'radiogroup' }, buttons),
    el('h3', { class: 'lg-section' }, T.settings.stats),
    el('dl', { class: 'lg-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, totals[k])])),
    pointsInfo(api, 'logic-gates'),
  ));
}

function iconButton(icon, label, onclick, cls = 'lg-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('lg-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    return;
  }
  if (modalActive || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('button')) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onPower();
  }
}

// ---------- отладка (?lgdebug) ----------

function debugHooks() {
  globalThis.__logicGates = {
    get n() { return n; },
    get level() { return level; },
    get state() { return state; },
    get phase() { return phase; },
    get progress() { return progress; },
    get total() { return TOTAL; },
    /** Решение уровня: что должно стоять в гнёздах и на колечках. */
    solution: () => solve(level, { limit: 1 })[0] ?? null,
    /** Середина гнезда k или колечка k на экране — для перетаскивания мышью. */
    socketAt: (k) => toScreen(socketPoint(k)),
    ringAt: (k) => toScreen(ringPoint(k)),
    gate: (k, kind) => setGate(k, kind),
    not: (k, on) => setNot(k, on ? 1 : 0),
    /** Расставить всё как в решении (ток не включается). */
    fill() {
      const answer = solve(level, { limit: 1 })[0];
      state.kinds = [...answer.kinds];
      state.nots = [...answer.nots];
      edited();
    },
    power: onPower,
    hint: onHint,
    /** Открыть уровень num, отметив все предыдущие пройденными. */
    goto(num) {
      for (let k = 1; k < num; k++) if (!starsOf(progress, k)) recordStars(progress, k, 1);
      saveProgress();
      reportProgress();
      api.storage.remove('current');
      startLevel(num);
    },
  };
}

export default {
  id: 'logic-gates',
  title: 'Логические схемы',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    const board = document.createElementNS(SVG_NS, 'svg');
    board.setAttribute('class', 'lg-board');
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label', T.title);
    ui = {
      board,
      levelLabel: el('span', {}, T.title),
      pips: el('span', { class: 'lg-pips', role: 'img' }),
      taskText: el('p', { class: 'lg-task-text' }),
      checks: el('div', { class: 'lg-checks', hidden: true }),
      stage: el('div', { class: 'lg-stage' }, board),
      tray: el('div', { class: 'lg-tray' }),
      result: el('div', { class: 'lg-result', hidden: true }),
      modal: el('div', { class: 'lg-modal', hidden: true }),
    };
    for (let k = 0; k < 3; k++) {
      const pip = el('i', { class: 'lg-pip' });
      pip.innerHTML = ICONS.pip;
      ui.pips.append(pip);
    }
    const levelBtn = el('button', { class: 'lg-level', 'aria-label': T.levels, title: T.levels, onclick: showLevels }, ui.levelLabel);
    levelBtn.insertAdjacentHTML('beforeend', ICONS.down);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    ui.hintBtn = iconButton(ICONS.bulb, T.hint, onHint);
    const knob = el('span', { class: 'lg-power-knob' });
    knob.innerHTML = ICONS.bolt;
    ui.power = el('button', { class: 'lg-power lg-wait', 'aria-label': T.powerOn, title: T.powerOn, onclick: onPower },
      el('span', { class: 'lg-power-track' }, knob), el('span', {}, T.power.toUpperCase()));

    root = el('div', { class: 'lg' },
      el('div', { class: 'lg-header' },
        el('div', { class: 'lg-heading' }, levelBtn, ui.pips),
        el('div', { class: 'lg-actions' },
          ui.hintBtn,
          ui.soundBtn,
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'lg-task' }, ui.taskText, ui.checks),
      ui.stage,
      el('div', { class: 'lg-dock' }, ui.tray, ui.power),
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
    progress = migrateProgress(savedProgress, TOTAL);
    stats = migrateStats(savedStats);
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;
    renderSoundBtn();
    reportProgress();
    // касание мимо окна закрывает его
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.tray.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeydown);
    if (typeof ResizeObserver === 'function') {
      resizeWatch = new ResizeObserver(fit);
      resizeWatch.observe(ui.stage);
    }
    if (isDebug()) debugHooks();
    // начатый уровень — если он всё ещё открыт; иначе первый непройденный
    const resumeAt = Number.isInteger(savedState?.level) && savedState.level >= 1 && savedState.level <= TOTAL
      && isOpen(progress, savedState.level) ? savedState.level : 0;
    startLevel(resumeAt || nextLevel(progress, TOTAL), resumeAt ? savedState : null);
  },

  getState() {
    saveState();
    return state && phase !== 'won' && isTouched(state) ? { level: n } : null;
  },

  destroy() {
    saveState();
    stopFlow();
    if (drag) endDrag();
    document.removeEventListener('keydown', onKeydown);
    resizeWatch?.disconnect();
    toast?.dispose();
    root?.remove();
    if (globalThis.__logicGates) delete globalThis.__logicGates;
    api = host = root = ui = toast = level = lay = refs = state = solutions = ran = picked = resizeWatch = null;
    piles = new Map();
    checkCards = [];
    modalActive = false;
    phase = 'idle';
    rowAt = 0;
    scale = 1;
    n = 1;
    progress = emptyProgress();
    stats = emptyStats();
    settings = { skin: 'telegram' };
  },
};
