// Косынка (Klondike, как в Windows): правила — logic.js, решаемые раскладки — deals.json (собраны решателем),
// карты — shared/cards.js (общие с Пауком), звуки — shared/card-sounds.js.
//
// Все 52 карты — элементы одного слоя поверх игры: карта может лететь откуда угодно куда угодно (из колоды в сброс,
// в «дом», обратно). Модель вида (view) повторяет каждое действие логики — ход, открытие колоды, переворот сброса и их
// отмену, — поэтому каждая карта едет, а не появляется. Сверху — колода, сброс (по три — веером) и четыре «дома»,
// ниже — семь столбцов, ужатых под высоту экрана. Ход — перетаскиванием или двумя касаниями: первое выбирает карту
// (с картами под ней), второе — столбец или «дом» (сами карты никуда не прыгают — как в Пауке, по просьбе владельца).
// Когда всё открыто и колода пуста — кнопка «Собрать карты». Победа — каскад прыгающих карт из «домов», как в Windows.
// Альбомный вид — как в Пауке: кнопка поворота и сам на широком экране; касания переводятся в систему игры (toLocal).

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createCardSounds } from '../../shared/card-sounds.js';
import { faceHtml, suitSvg, cardImage, loadCardStyles } from '../../shared/cards.js';
import {
  COLUMNS, MODES, suitOf, rankOf, isUp, face, newGame, canPick, firstUp, canMove, move, draw, undo, isWon,
  canAutoFinish, nextFinishMove, hintMoves, foundationFor, allMoves, isValidState, emptyStats, isValidStats, recordGame,
} from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const T = {
  title: 'Косынка',
  modes: { 1: 'По одной карте', 3: 'По три карты' },
  modeShort: { 1: 'По одной', 3: 'По три' },
  modeHint: { 1: 'Из колоды — по одной, легче', 3: 'Из колоды — по три, как в Windows' },
  moves: 'Ходы',
  newGame: 'Новая партия',
  restart: 'Эту раскладку заново',
  abandon: 'Начатая партия будет засчитана как поражение.',
  play: 'Играть',
  undo: 'Отменить',
  hint: 'Подсказка',
  finish: 'Собрать',
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  rotate: 'Повернуть: альбомный вид',
  skin: 'Стол',
  fourColor: 'Четырёхцветная колода',
  fourColorHint: 'Бубны — синие, трефы — зелёные',
  winnable: 'Только решаемые раскладки',
  winnableNote: 'Каждую раскладку проверил решатель — выиграть можно всегда.',
  winnableHint: 'Каждую проверил решатель — выиграть можно всегда',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  noHint: 'Полезных ходов нет — отмени ход или начни заново',
  won: 'Победа!',
  played: 'Сыграно',
  wins: 'Побед',
  winRate: 'Процент побед',
  fewestMoves: 'Меньше всего ходов',
  bestTime: 'Лучшее время',
  streak: 'Серия побед',
  bestStreak: 'Лучшая серия',
  skipWin: 'Коснись, чтобы продолжить',
};

const SKINS = [
  { id: 'telegram', name: 'По умолчанию' },
  { id: 'felt', name: 'Сукно' },
  { id: 'wine', name: 'Бордо' },
  { id: 'night', name: 'Ночь' },
  { id: 'wood', name: 'Дерево' },
  { id: 'ocean', name: 'Океан' },
];
const GAP = 5;
const PAD = 4;
const MIN_UP = 13;
const MAX_UNDO_SAVED = 300;

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  finish: svgIcon('<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  rotate: svgIcon('<rect x="7" y="2" width="10" height="16" rx="2"/><path d="M11 15h2"/><path d="M20 13a8 8 0 0 1-6 7.7"/><path d="M16.5 19.8 14 20.7l.8 2.3"/>'),
  recycle: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;            // состояние logic.js + time (мс в партии)
let view = null;            // { cols: [[el]], stock: [el], waste: [el], found: [[el] × 4] }
let metrics = null;
let drag = null;
let selected = null;        // выбранное касанием: { from, index }
let busy = false;           // автосбор или победа
let rotated = false;
let hintCycle = { key: '', index: 0 };
let settings = { skin: 'telegram', fourColor: false, rotated: false, winnable: true };
let setup = { draw: 1 };
let stats = emptyStats();
let deals = null;           // банк решаемых зёрен { 1: [...], 3: [...] }
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let lastTick = 0;
let lastDrawAt = 0;
let resizeObserver = null;
const timers = new Set();
const audio = createAudio(createCardSounds);

function sfx(name, opts) {
  if (!soundOn) return;
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

function plural(n, [one, few, many]) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

const clock = (ms) => {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// ---------- карты ----------

function makeCard(code) {
  const c = face(code);
  const node = el('div', { class: `kl-card${isUp(code) ? ' kl-up' : ''}` },
    el('div', { class: 'kl-inner' },
      el('div', { class: `kl-face kl-front pc-s${suitOf(c)}` }),
      el('div', { class: 'kl-face kl-back' }),
    ),
  );
  node.querySelector('.kl-front').innerHTML = faceHtml(suitOf(c), rankOf(c));
  node._card = c;
  node._x = null;
  return node;
}

function ensureFace(node, code) {
  const c = face(code);
  if (node._card === c) return;
  const front = node.querySelector('.kl-front');
  front.className = `kl-face kl-front pc-s${suitOf(c)}`;
  front.innerHTML = faceHtml(suitOf(c), rankOf(c));
  node._card = c;
}

function buildView() {
  ui.layer.replaceChildren();
  const add = (code) => ui.layer.appendChild(makeCard(code));
  view = {
    cols: game.cols.map((col) => col.map(add)),
    stock: game.stock.map(add),
    waste: game.waste.map(add),
    found: game.found.map((f) => f.map(add)),
  };
}

const listOf = (place) => (place.k === 't' ? view.cols[place.i] : place.k === 'w' ? view.waste : view.found[place.i]);
const stateListOf = (place) => (place.k === 't' ? game.cols[place.i] : place.k === 'w' ? game.waste : game.found[place.i]);

// ---------- раскладка ----------

function boxOf(node) {
  let x = 0;
  let y = 0;
  for (let n = node; n && n !== root; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

function toLocal(clientX, clientY) {
  const R = root.getBoundingClientRect();
  if (!rotated) return [clientX - R.left, clientY - R.top];
  const mx = R.left + R.width / 2;
  const my = R.top + R.height / 2;
  return [root.offsetWidth / 2 + (clientY - my), root.offsetHeight / 2 - (clientX - mx)];
}

/**
 * Размеры и места. Вертикально — сверху колода, сброс и «дома» по сетке столбцов, ниже столбцы. Альбомно — колода и
 * сброс слева, «дома» справа столбиком, столбцы посередине на всю высоту (иначе им не хватает места).
 */
function measure() {
  const land = root.classList.contains('kl-land');
  const Tb = boxOf(ui.table);
  const top = Tb.y + 4;
  const side = land ? Math.max(12, GAP * 3) : 0;           // отступ боковых колонок от столбцов
  let W;
  if (land) {
    W = Math.floor((Tb.w - PAD * 2 - GAP * (COLUMNS - 1) - side * 2) / (COLUMNS + 2));
    W = Math.min(W, Math.floor((Tb.h - 8 - GAP * 3) / 4 / 1.42));    // четыре «дома» столбиком
  } else {
    W = Math.floor((Tb.w - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  }
  W = Math.max(26, Math.min(96, W));
  const H = Math.round(W * 1.42);
  const tabW = W * COLUMNS + GAP * (COLUMNS - 1);
  const total = land ? tabW + (W + side) * 2 : tabW;
  const x0 = Tb.x + (Tb.w - total) / 2;
  const tabLeft = land ? x0 + W + side : x0;
  const rowGap = Math.max(10, Math.round(H * 0.2));
  metrics = {
    W, H, top, land, tabLeft,
    tabTop: land ? top : top + H + rowGap,
    bottom: Tb.y + Tb.h - 4,
    sideX: x0,                                            // колода и сброс (альбомно)
    foundX: tabLeft + tabW + side,                        // «дома» (альбомно)
  };
  root.style.setProperty('--kl-w', `${W}px`);
  root.style.setProperty('--kl-h', `${H}px`);
  root.style.setProperty('--pc-w', `${W}px`);
  const put = (slot, [x, y]) => {
    slot.style.transform = `translate(${x}px, ${y}px)`;
  };
  put(ui.stockSlot, stockXY());
  put(ui.stockCount, [stockXY()[0], top + H + 1]);
  ui.foundSlots.forEach((slot, i) => put(slot, foundXY(i)));
  ui.colSlots.forEach((slot, i) => put(slot, [colX(i), metrics.tabTop]));
}

const colX = (c) => metrics.tabLeft + c * (metrics.W + GAP);
const stockXY = () => (metrics.land ? [metrics.sideX, metrics.top] : [colX(0), metrics.top]);
const foundXY = (i) => (metrics.land ? [metrics.foundX, metrics.top + i * (metrics.H + GAP)] : [colX(3 + i), metrics.top]);
/** Карта сброса: pos — место в веере (0…2); вертикально веер вправо, альбомно — вниз под колодой. */
function wasteXY(pos) {
  const { W, H, top } = metrics;
  if (metrics.land) return [metrics.sideX, top + H + 16 + pos * Math.round(H * 0.3)];
  return [colX(1) + pos * Math.round(W * 0.34), top];
}

/** Шаги столбца: закрытые и открытые карты, ужатые, чтобы столбец влез по высоте. */
function steps(col) {
  const { H } = metrics;
  const downs = col.filter((c) => !isUp(c)).length;
  const ups = Math.max(0, col.length - downs - 1);
  let d = Math.round(H * 0.11);
  let u = Math.round(H * 0.3);
  const avail = metrics.bottom - metrics.tabTop - H;
  const need = () => downs * d + ups * u;
  if (need() > avail) d = Math.max(3, Math.floor((avail - ups * u) / Math.max(1, downs)));
  if (need() > avail && ups) u = Math.max(MIN_UP, Math.floor((avail - downs * d) / ups));
  if (need() > avail && ups) u = Math.max(8, Math.floor((avail - downs * d) / ups));
  return { d, u };
}

function place(node, x, y, z, { delay = 0, up = node.classList.contains('kl-up') } = {}) {
  node.classList.toggle('kl-up', up);
  const moved = node._x !== x || node._y !== y;
  node._x = x;
  node._y = y;
  if (moved && node._placed) {
    node.style.transitionDelay = delay ? `${delay}ms` : '';
    node.classList.add('kl-fly');
    node._flyUntil = performance.now() + delay + 330;
    later(() => {
      if (performance.now() >= node._flyUntil - 5) {
        node.classList.remove('kl-fly');
        node.style.transitionDelay = '';
      }
    }, delay + 340);
  }
  node._placed = true;
  node.style.transform = `translate(${x}px, ${y}px)`;
  node.style.zIndex = String(z);
}

function layout(delays = null) {
  if (!metrics) measure();
  const { tabTop } = metrics;
  const delay = (node) => delays?.get(node) ?? 0;
  const [sx, sy] = stockXY();
  view.stock.forEach((node, k) => {
    node._loc = { k: 's' };
    const lift = Math.min(3, Math.floor(k / 8));        // стопка чуть толще, пока карт много
    place(node, sx + lift, sy - lift, 10 + k, { delay: delay(node), up: false });
  });
  // сброс: по три — веером последние три карты
  const visible = game.draw === 3 ? Math.min(3, view.waste.length) : 1;
  view.waste.forEach((node, k) => {
    const pos = Math.max(0, k - (view.waste.length - visible));
    node._loc = { k: 'w' };
    ensureFace(node, game.waste[k]);
    const [x, y] = wasteXY(pos);
    place(node, x, y, 100 + k, { delay: delay(node), up: true });
  });
  view.found.forEach((list, i) => list.forEach((node, k) => {
    node._loc = { k: 'f', i };
    ensureFace(node, game.found[i][k]);
    const [x, y] = foundXY(i);
    place(node, x, y, 200 + k, { delay: delay(node), up: true });
  }));
  for (let c = 0; c < COLUMNS; c++) {
    const col = game.cols[c];
    const { d, u } = steps(col);
    let y = tabTop;
    view.cols[c].forEach((node, i) => {
      ensureFace(node, col[i]);
      node._loc = { k: 't', i: c, index: i };
      place(node, colX(c), y, 300 + i, { delay: delay(node), up: isUp(col[i]) });
      y += isUp(col[i]) ? u : d;
    });
  }
  paintInfo();
}

// ---------- тряска, выбор ----------

function jiggle(node) {
  return animate(node, [
    { translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '2px 0' }, { translate: '0 0' },
  ], { duration: 260, easing: 'ease-in-out' });
}

const samePlace = (a, b) => a && b && a.k === b.k && (a.k === 'w' || a.i === b.i);

function selectedNodes(sel) {
  const list = listOf(sel.from);
  return sel.from.k === 't' ? list.slice(sel.index) : list.slice(-1);
}

function select(from, index) {
  deselect();
  selected = { from, index };
  selectedNodes(selected).forEach((node) => node.classList.add('kl-sel'));
  markTargets(selected);
  sfx('pick');
}

function deselect() {
  if (!selected) return;
  selected = null;
  root?.querySelectorAll('.kl-sel').forEach((node) => node.classList.remove('kl-sel'));
  markTargets(null);
}

function markTargets(sel) {
  const ok = (to) => sel && canMove(game, sel.from, sel.index, to);
  ui.colSlots.forEach((slot, i) => slot.classList.toggle('kl-target', !view.cols[i].length && ok({ k: 't', i })));
  ui.foundSlots.forEach((slot, i) => slot.classList.toggle('kl-target', ok({ k: 'f', i })));
  for (let i = 0; i < COLUMNS; i++) {
    const topNode = view.cols[i][view.cols[i].length - 1];
    topNode?.classList.toggle('kl-target-card', Boolean(ok({ k: 't', i })));
  }
  for (let i = 0; i < 4; i++) {
    const topNode = view.found[i][view.found[i].length - 1];
    topNode?.classList.toggle('kl-target-card', Boolean(ok({ k: 'f', i })));
  }
}

/** Выбранное — в место to; в «дом» — в тот, что примет (касание любого «дома»). → получилось ли */
function dropSelected(to) {
  if (!selected) return false;
  let target = to;
  if (to.k === 'f' && !canMove(game, selected.from, selected.index, to)) {
    const cards = stateListOf(selected.from);
    const c = cards[cards.length - 1];
    const f = selected.from.k === 't' && selected.index !== cards.length - 1 ? -1 : foundationFor(game, c);
    if (f >= 0) target = { k: 'f', i: f };
  }
  if (samePlace(target, selected.from) || !canMove(game, selected.from, selected.index, target)) return false;
  const { from, index } = selected;
  deselect();
  return doMove(from, index, target);
}

// ---------- действия ----------

function afterAction() {
  deselect();
  hintCycle = { key: '', index: 0 };
  clearHint();
  save();
  paintInfo();
}

function doMove(from, index, to, { dropped = false } = {}) {
  const wasEmpty = to.k === 't' && !game.cols[to.i].length;
  const res = move(game, from, index, to);
  if (!res.ok) return false;
  const src = listOf(from);
  const n = from.k === 't' ? src.length - index : 1;
  listOf(to).push(...src.splice(src.length - n, n));
  layout();
  if (to.k === 'f') sfx('foundation', { rank: game.found[to.i].length });
  else sfx(wasEmpty ? 'placeEmpty' : 'place');
  if (res.flipped) later(() => sfx('flip'), 120);
  api.platform.haptic.impact(dropped ? 'light' : 'soft');
  afterAction();
  if (isWon(game)) later(win, reducedMotion() ? 50 : 500);
  return true;
}

function doDraw() {
  if (busy) return;
  const nowMs = performance.now();
  if (nowMs - lastDrawAt < 250) return;            // двойное касание не открывает лишнего
  const res = draw(game);
  deselect();
  if (!res.ok) {
    sfx('illegal');
    shake(ui.stockSlot, { distance: 4, duration: 260 });
    return;
  }
  lastDrawAt = nowMs;
  const delays = new Map();
  if (res.kind === 'draw') {
    for (let k = 0; k < res.n; k++) {
      const node = view.stock.pop();
      view.waste.push(node);
      delays.set(node, k * 70);
    }
    sfx('deal', { step: 70, count: res.n });
  } else {
    while (view.waste.length) view.stock.push(view.waste.pop());
    sfx('recycle');
  }
  layout(delays);
  afterAction();
}

function doUndo() {
  deselect();
  if (busy || !game.undo.length) return;
  const rec = undo(game);
  if (!rec) return;
  if (rec.t === 'm') {
    const dst = listOf(rec.to);
    listOf(rec.from).push(...dst.splice(dst.length - rec.n, rec.n));
  } else if (rec.t === 'd') {
    for (let k = 0; k < rec.n; k++) view.stock.push(view.waste.pop());
  } else {
    while (view.stock.length) view.waste.push(view.stock.pop());
  }
  layout();
  sfx('undo');
  afterAction();
}

/** Сбор в конце: карты по одной в «дома», по возрастанию. */
function autoFinish() {
  if (busy || !canAutoFinish(game)) return;
  busy = true;
  deselect();
  paintInfo();
  const step = () => {
    if (!game || !ui) return;
    const m = nextFinishMove(game);
    if (!m || isWon(game)) {
      busy = false;
      if (isWon(game)) later(win, 400);
      return;
    }
    move(game, m.from, m.index, m.to);
    const src = listOf(m.from);
    listOf(m.to).push(src.pop());
    layout();
    sfx('foundation', { rank: game.found[m.to.i].length });
    save();
    later(step, reducedMotion() ? 0 : 85);
  };
  step();
}

// ---------- ввод ----------

/** Место под точкой (в системе игры): { k: 't'|'f'|'s', i } или null. */
function placeAt(x, y) {
  const { W, H, top, tabTop } = metrics;
  if (metrics.land) {
    if (x >= metrics.sideX - 4 && x <= metrics.sideX + W + 4) return y >= top - 4 && y <= top + H + 4 ? { k: 's' } : null;
    if (x >= metrics.foundX - 4 && x <= metrics.foundX + W + 4) {
      const i = Math.floor((y - top + GAP / 2) / (H + GAP));
      return i >= 0 && i < 4 ? { k: 'f', i } : null;
    }
  }
  const c = Math.round((x - metrics.tabLeft - W / 2) / (W + GAP));
  if (c < 0 || c >= COLUMNS || Math.abs(x - (colX(c) + W / 2)) > (W + GAP) / 2) return null;
  if (y >= top - 4 && y <= top + H + 4) {
    if (c === 0) return { k: 's' };
    if (c >= 3) return { k: 'f', i: c - 3 };
    return null;
  }
  if (y >= tabTop - 6 && y <= metrics.bottom) return { k: 't', i: c };
  return null;
}

function onPointerDown(e) {
  if (!game || busy || modalActive || (e.pointerType === 'mouse' && e.button !== 0)) return;
  audio.get();
  const node = e.target.closest?.('.kl-card');
  if (!node) return;
  e.preventDefault();
  e.stopPropagation();
  const loc = node._loc;
  if (!loc) return;
  if (loc.k === 's') {
    doDraw();
    return;
  }
  const [x, y] = toLocal(e.clientX, e.clientY);
  let from = null;
  let index = -1;
  if (loc.k === 'w') {
    if (node === view.waste[view.waste.length - 1]) {
      from = { k: 'w' };
      index = view.waste.length - 1;
    }
  } else if (loc.k === 'f') {
    if (node === view.found[loc.i][view.found[loc.i].length - 1]) {
      from = { k: 'f', i: loc.i };
      index = view.found[loc.i].length - 1;
    }
  } else if (isUp(game.cols[loc.i][loc.index]) && canPick(game.cols[loc.i], loc.index)) {
    from = { k: 't', i: loc.i };
    index = loc.index;
  }
  const target = loc.k === 't' ? { k: 't', i: loc.i } : loc.k === 'f' ? { k: 'f', i: loc.i } : null;
  drag = {
    from, index, target, node, nodes: from ? selectedNodes({ from, index }) : [],
    id: e.pointerId, x, y, moving: false,
  };
  try {
    ui.layer.setPointerCapture(e.pointerId);
  } catch {
    // старые браузеры
  }
}

function onPointerMove(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const [x, y] = toLocal(e.clientX, e.clientY);
  const dx = x - drag.x;
  const dy = y - drag.y;
  if (!drag.moving) {
    if (!drag.from || Math.hypot(dx, dy) < 7) return;
    drag.moving = true;
    deselect();
    sfx('pick');
    drag.nodes.forEach((node) => node.classList.add('kl-drag'));
    markTargets({ from: drag.from, index: drag.index });
  }
  drag.nodes.forEach((node, k) => {
    node.style.transform = `translate(${node._x + dx}px, ${node._y + dy}px)`;
    node.style.zIndex = String(900 + k);
  });
}

function onPointerUp(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const d = drag;
  drag = null;
  d.nodes.forEach((node) => node.classList.remove('kl-drag'));
  if (d.moving) {
    markTargets(null);
    const [x, y] = toLocal(e.clientX, e.clientY);
    // куда уронили: место под серединой взятой карты
    const cx = d.nodes[0]._x + (x - d.x) + metrics.W / 2;
    const cy = d.nodes[0]._y + (y - d.y) + metrics.H / 3;
    const to = placeAt(cx, cy);
    if (to && to.k !== 's' && !samePlace(to, d.from) && canMove(game, d.from, d.index, to)) {
      doMove(d.from, d.index, to, { dropped: true });
      return;
    }
    d.nodes.forEach((node) => {
      node._x = null;
    });
    layout();
    if (to && !samePlace(to, d.from)) {
      sfx('illegal');
      jiggle(d.nodes[0]);
    }
    return;
  }
  // касание: выбрано что-то — положить сюда; то же — снять выбор; иначе — выбрать
  if (selected && d.target && !samePlace(d.target, selected.from) && dropSelected(d.target)) return;
  if (selected && d.from && samePlace(d.from, selected.from) && d.index === selected.index) {
    deselect();
    return;
  }
  if (d.from) {
    select(d.from, d.index);
    return;
  }
  deselect();
  sfx('illegal');
  jiggle(d.node);
}

/** Касание мимо карт: колода — открыть; выбрано что-то — положить в место под пальцем; иначе снять выбор. */
function onTablePointer(e) {
  if (!game || busy || modalActive || e.target.closest?.('.kl-card, button, .kl-modal, .kl-cascade-wrap')) return;
  const [x, y] = toLocal(e.clientX, e.clientY);
  const to = placeAt(x, y);
  if (to?.k === 's') {
    audio.get();
    doDraw();
    return;
  }
  if (!selected) return;
  if (to && dropSelected(to)) return;
  if (to) {
    sfx('illegal');
    selectedNodes(selected).forEach(jiggle);
  }
  deselect();
}

// ---------- подсказка ----------

function clearHint() {
  root?.querySelectorAll('.kl-hint').forEach((node) => node.classList.remove('kl-hint'));
}

function onHint() {
  if (busy || !game) return;
  deselect();
  clearHint();
  const key = `${game.moves}`;
  const list = [...hintMoves(game).map((m) => ({ type: 'move', ...m })), ...(game.stock.length || game.waste.length ? [{ type: 'draw' }] : [])];
  if (!list.length) {
    sfx('illegal');
    toast.show(T.noHint, 2600);
    return;
  }
  if (hintCycle.key !== key) hintCycle = { key, index: 0 };
  const h = list[hintCycle.index % list.length];
  hintCycle.index += 1;
  game.hintsUsed += 1;
  sfx('hint');
  if (h.type === 'draw') {
    (view.stock[view.stock.length - 1] ?? ui.stockSlot).classList.add('kl-hint');
  } else {
    selectedNodes(h).forEach((node) => node.classList.add('kl-hint'));
    const dst = listOf(h.to);
    (dst[dst.length - 1] ?? (h.to.k === 'f' ? ui.foundSlots[h.to.i] : ui.colSlots[h.to.i])).classList.add('kl-hint');
  }
  later(clearHint, 2400);
}

// ---------- шапка, время, сохранение ----------

function paintInfo() {
  if (!ui || !game) return;
  ui.moves.textContent = String(game.moves);
  ui.time.textContent = clock(game.time ?? 0);
  ui.sub.textContent = T.modes[game.draw];
  ui.undoBtn.disabled = !game.undo.length || busy;
  const finish = canAutoFinish(game) && !busy;
  ui.finishBtn.hidden = !finish;
  ui.stockSlot.classList.toggle('kl-recycle', !game.stock.length && game.waste.length > 0);
  ui.stockCount.textContent = game.stock.length ? String(game.stock.length) : '';
  ui.stockSlot.classList.toggle('kl-empty', !game.stock.length && !game.waste.length);
}

function tick() {
  const now = performance.now();
  if (game && !busy && !modalActive && document.visibilityState === 'visible' && game.moves > 0 && !isWon(game)) {
    game.time = (game.time ?? 0) + (now - lastTick);
    ui.time.textContent = clock(game.time);
  }
  lastTick = now;
}

function save() {
  if (!api || !game) return;
  if (isWon(game) || !game.moves) {
    api.storage.remove('current');
    return;
  }
  api.storage.set('current', { ...game, undo: game.undo.slice(-MAX_UNDO_SAVED) });
}

// ---------- партия ----------

async function loadDeals() {
  if (deals) return deals;
  try {
    const res = await fetch(new URL('./deals.json', import.meta.url));
    deals = await res.json();
  } catch {
    deals = null;                 // без банка — случайные раскладки
  }
  return deals;
}

function pickSeed(d) {
  const bank = settings.winnable ? deals?.[d] : null;
  if (bank?.length) return bank[Math.floor(Math.random() * bank.length)];
  return Math.floor(Math.random() * 2 ** 31);
}

function startGame({ drawCount = setup.draw, seed = null } = {}) {
  if (game && game.moves > 0 && !isWon(game)) {
    recordGame(stats, game.draw, { won: false });
    api.storage.set('stats', stats);
  }
  game = { ...newGame(drawCount, seed ?? pickSeed(drawCount)), time: 0 };
  busy = false;
  selected = null;
  hintCycle = { key: '', index: 0 };
  buildView();
  measure();
  // карты сначала в колоде — потом разлетаются по столбцам рядами
  const [sx, sy] = stockXY();
  [...view.cols.flat(), ...view.stock].forEach((node) => place(node, sx, sy, 50, { up: false }));
  const delays = new Map();
  let k = 0;
  for (let row = 0; row < COLUMNS; row++) {
    for (let c = row; c < COLUMNS; c++) delays.set(view.cols[c][row], (k++) * 35);
  }
  sfx('shuffle');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (ui) layout(reducedMotion() ? null : delays);
  }));
  later(() => sfx('deal', { step: 35, count: 28 }), 600);
  save();
  paintInfo();
}

// ---------- победа: каскад прыгающих карт из «домов» (как в Windows) ----------

function win() {
  if (!ui || !game || game.won) return;
  game.won = true;
  busy = true;
  paintInfo();
  const timeMs = game.time ?? 0;
  recordGame(stats, game.draw, { won: true, moves: game.moves, timeMs });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sfx('win');
  api.platform.haptic.notification('success');
  const result = {
    outcome: 'win',
    title: T.won,
    durationMs: timeMs,
    variant: `draw-${game.draw}`,
    locale: 'ru',
    message: `${T.modeShort[game.draw]} · ${game.moves} ${plural(game.moves, ['ход', 'хода', 'ходов'])}`,
  };
  const finish = () => {
    if (!api) return;
    ui.cascade?.remove();
    api.finish(result);
  };
  if (reducedMotion()) later(finish, 400);
  else cascade(finish);
}

function cascade(done) {
  const R = { width: root.offsetWidth, height: root.offsetHeight };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = el('canvas', { class: 'kl-cascade' });
  canvas.width = Math.round(R.width * dpr);
  canvas.height = Math.round(R.height * dpr);
  const wrap = el('div', { class: 'kl-cascade-wrap' }, canvas, el('div', { class: 'kl-cascade-hint' }, T.skipWin));
  ui.cascade = wrap;
  root.append(wrap);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const { W, H } = metrics;
  const styles = getComputedStyle(host);
  const colors = [0, 1, 2, 3].map((s) => styles.getPropertyValue(`--pc-suit-${s}`).trim() || (s % 3 ? '#d42a3c' : '#1c1c22'));
  // как в Windows: короли со всех четырёх «домов», потом дамы… до тузов
  const queue = [];
  for (let r = 13; r >= 1; r--) {
    for (let i = 0; i < 4; i++) {
      const c = game.found[i][r - 1];
      if (c != null) queue.push({ c: face(c), x: foundXY(i)[0], y: foundXY(i)[1] });
    }
  }
  const images = new Map();
  for (const q of queue) if (!images.has(q.c)) images.set(q.c, cardImage(suitOf(q.c), rankOf(q.c), colors[suitOf(q.c)]));
  // «дома» пустеют по мере того, как карты вылетают; новая карта — каждые LAUNCH_MS, в полёте их несколько
  const LAUNCH_MS = 170;
  const flying = [];
  let finished = false;
  let last = performance.now();
  const started = last;
  let nextLaunch = last;
  const floor = R.height - H;
  const stop = () => {
    if (finished) return;
    finished = true;
    wrap.removeEventListener('pointerdown', stop);
    animate(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).then(done);
  };
  wrap.addEventListener('pointerdown', stop);
  function frame(now) {
    if (finished || !ui) return;
    const dt = Math.min(40, Math.max(0, now - last)) / 16.7;
    last = now;
    if (queue.length && now >= nextLaunch) {
      nextLaunch = now + LAUNCH_MS;
      const q = queue.shift();
      const list = view.found.find((f) => f.length && f[f.length - 1]._card === q.c);
      list?.pop()?.remove();
      flying.push({ ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4), vy: -Math.random() * 5 });
    }
    for (let k = flying.length - 1; k >= 0; k--) {
      const card = flying[k];
      card.vy += 0.55 * dt;
      card.x += card.vx * dt;
      card.y += card.vy * dt;
      if (card.y > floor) {
        card.y = floor;
        card.vy = -card.vy * 0.78;
      }
      const img = images.get(card.c);
      if (img.complete) ctx.drawImage(img, card.x, card.y, W, H);
      if (card.x < -W || card.x > R.width) flying.splice(k, 1);
    }
    if ((!flying.length && !queue.length) || now - started > 14000) {
      stop();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- альбомный вид ----------

function applyOrientation(animated = false) {
  if (!ui || !host) return;
  const W = host.clientWidth;
  const H = host.clientHeight;
  const wide = W > H;
  const was = rotated;
  rotated = settings.rotated && !wide;
  host.classList.toggle('kl-host-rot', rotated);
  root.classList.toggle('kl-rot', rotated);
  root.classList.toggle('kl-land', rotated || wide);
  if (rotated) {
    root.style.setProperty('--rot-w', `${H}px`);
    root.style.setProperty('--rot-h', `${W}px`);
  }
  ui.rotateBtn.hidden = wide;
  ui.rotateBtn.setAttribute('aria-pressed', String(rotated));
  metrics = null;
  if (game && view) {
    measure();
    layout();
  }
  if (animated && was !== rotated && !reducedMotion() && H > 0) {
    const k = (W / H).toFixed(3);
    animate(root, rotated
      ? [{ transform: `translate(-50%, -50%) rotate(0deg) scale(${k})`, opacity: 0.35 }, { transform: 'translate(-50%, -50%) rotate(90deg) scale(1)', opacity: 1 }]
      : [{ transform: `rotate(90deg) scale(${k})`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
    { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}

function toggleRotate() {
  if (busy) return;
  deselect();
  settings.rotated = !rotated;
  api.storage.set('settings', settings);
  api.platform.haptic.impact('medium');
  sfx('click');
  applyOrientation(true);
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
  return el('div', { class: 'kl-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'kl-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'kl-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function radioGroup(cls, items, isOn, onPick) {
  const buttons = items.map((item) => {
    const b = el('button', { class: cls, role: 'radio', 'aria-checked': String(isOn(item.id)) }, item.body);
    b.addEventListener('click', () => {
      onPick(item.id);
      buttons.forEach((x, k) => x.setAttribute('aria-checked', String(isOn(items[k].id))));
    });
    return b;
  });
  return buttons;
}

/** Значок режима: одна или три карты веером. */
function modeIcon(d) {
  const span = el('span', { class: `kl-mode-icon kl-mode-${d}` });
  for (let k = 0; k < d; k++) span.append(el('i', {}));
  return span;
}

function showNewGame() {
  const draft = { ...setup };
  const inProgress = game && game.moves > 0 && !isWon(game);
  openModal(dialog(T.newGame,
    el('div', { class: 'kl-modes', role: 'radiogroup' }, radioGroup('kl-option', MODES.map((d) => ({
      id: d,
      body: [modeIcon(d), el('b', {}, T.modes[d]), el('span', {}, T.modeHint[d])],
    })), (id) => draft.draw === id, (id) => { draft.draw = id; })),
    settings.winnable && deals ? el('p', { class: 'kl-note' }, T.winnableNote) : null,
    inProgress ? el('p', { class: 'kl-note' }, T.abandon) : null,
    el('button', { class: 'btn kl-play', onclick: () => { setup = draft; api.storage.set('setup', setup); closeModal(); startGame(); } }, T.play),
    inProgress ? el('button', { class: 'btn btn-secondary kl-play', onclick: () => { closeModal(); startGame({ drawCount: game.draw, seed: game.seed }); } }, T.restart) : null,
  ));
}

function showStats() {
  const tile = (value, label) => el('div', { class: 'kl-tile' }, el('b', {}, value), el('span', {}, label));
  openModal(dialog(T.stats, ...MODES.map((d) => {
    const r = stats[d];
    return el('div', { class: 'kl-stat-block' },
      el('h3', { class: 'kl-section' }, modeIcon(d), T.modes[d]),
      el('div', { class: 'kl-tiles' },
        tile(String(r.played), T.played),
        tile(String(r.wins), T.wins),
        tile(r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '—', T.winRate),
        tile(r.fewestMoves ? String(r.fewestMoves) : '—', T.fewestMoves),
        tile(r.bestTime ? clock(r.bestTime * 1000) : '—', T.bestTime),
        tile(`${r.streak} / ${r.bestStreak}`, `${T.streak} / ${T.bestStreak.toLowerCase()}`),
      ));
  })));
}

function toggle(label, hint, on, onChange) {
  const input = el('input', { type: 'checkbox', checked: on });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'kl-toggle' }, input, el('span', {}, el('b', {}, label), el('small', {}, hint)));
}

function showSettings() {
  openModal(dialog(T.settings,
    el('h3', { class: 'kl-section' }, T.skin),
    el('div', { class: 'kl-skins', role: 'radiogroup' }, radioGroup('kl-skin', SKINS.map((s) => ({
      id: s.id,
      body: [el('span', { class: 'kl-swatch', 'data-skin': s.id }, el('i', { class: 'kl-sw-card' }), el('i', { class: 'kl-sw-back' })), s.name],
    })), (id) => settings.skin === id, (id) => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
    })),
    toggle(T.fourColor, T.fourColorHint, settings.fourColor, (on) => {
      settings.fourColor = on;
      host.classList.toggle('kl-four', on);
      api.storage.set('settings', settings);
    }),
    toggle(T.winnable, T.winnableHint, settings.winnable, (on) => {
      settings.winnable = on;
      api.storage.set('settings', settings);
    }),
    pointsInfo(api, 'klondike'),
  ));
}

function iconButton(icon, label, onclick) {
  const b = el('button', { class: 'kl-icon-btn', 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick, cls = '') {
  const b = el('button', { class: `kl-tool ${cls}`.trim(), 'aria-label': label, onclick }, el('span', { class: 'kl-tool-label' }, label));
  b.insertAdjacentHTML('afterbegin', icon);
  return b;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
  else if (e.key === 'Escape') deselect();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    doUndo();
  } else if (!modalActive && (e.key === 'h' || e.key === 'р')) onHint();
  else if (!modalActive && (e.key === ' ' || e.key === 'd' || e.key === 'в')) {
    e.preventDefault();
    doDraw();
  }
}

export default {
  id: 'klondike',
  title: 'Косынка',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSetup, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('setup'), api.storage.get('sound'),
      loadCardStyles(), loadDeals(),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      skin: SKINS.some((s) => s.id === savedSettings?.skin) ? savedSettings.skin : 'telegram',
      fourColor: savedSettings?.fourColor === true,
      rotated: savedSettings?.rotated === true,
      winnable: savedSettings?.winnable !== false,
    };
    const knownSetup = MODES.includes(savedSetup?.draw);
    if (knownSetup) setup = { draw: savedSetup.draw };
    host.dataset.skin = settings.skin;
    host.classList.toggle('kl-four', settings.fourColor);

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.setAttribute('aria-label', soundOn ? T.soundOn : T.soundOff);
      sfx('click');
    });
    ui = {
      sub: el('div', { class: 'kl-sub' }),
      moves: el('b', {}),
      time: el('b', {}),
      table: el('div', { class: 'kl-table' }),
      layer: el('div', { class: 'kl-layer' }),
      modal: el('div', { class: 'kl-modal', hidden: true }),
    };
    ui.stockSlot = el('div', { class: 'kl-slot kl-stock-slot' });
    ui.stockSlot.innerHTML = ICONS.recycle;
    ui.foundSlots = [0, 1, 2, 3].map(() => el('div', { class: 'kl-slot kl-found-slot' }, el('span', {}, 'A')));
    ui.colSlots = Array.from({ length: COLUMNS }, () => el('div', { class: 'kl-slot kl-col-slot' }, el('span', {}, 'K')));
    ui.stockCount = el('div', { class: 'kl-stock-count' });
    ui.slotLayer = el('div', { class: 'kl-slots' }, ui.stockSlot, ui.stockCount, ui.foundSlots, ui.colSlots);
    ui.rotateBtn = iconButton(ICONS.rotate, T.rotate, toggleRotate);
    ui.undoBtn = toolButton(ICONS.undo, T.undo, doUndo);
    ui.finishBtn = toolButton(ICONS.finish, T.finish, autoFinish, 'kl-finish');
    root = el('div', { class: 'kl' },
      el('div', { class: 'kl-header' },
        el('div', { class: 'kl-head-text' }, el('div', { class: 'kl-title' }, T.title), ui.sub),
        el('div', { class: 'kl-actions' },
          ui.rotateBtn,
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, showNewGame),
        ),
      ),
      el('div', { class: 'kl-info' }, el('span', {}, `${T.moves} `, ui.moves), el('span', {}, '⏱ ', ui.time)),
      el('div', { class: 'kl-body' },
        ui.table,
        el('div', { class: 'kl-bar' }, ui.undoBtn, toolButton(ICONS.hint, T.hint, onHint), ui.finishBtn),
      ),
      ui.slotLayer,
      ui.layer,
      ui.modal,
      toast.el,
    );
    container.append(root);
    ui.layer.addEventListener('pointerdown', onPointerDown);
    ui.layer.addEventListener('pointermove', onPointerMove);
    ui.layer.addEventListener('pointerup', onPointerUp);
    ui.layer.addEventListener('pointercancel', () => {
      if (!drag) return;
      drag.nodes.forEach((node) => node.classList.remove('kl-drag'));
      drag = null;
      markTargets(null);
      layout();
    });
    ui.layer.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    root.addEventListener('pointerdown', onTablePointer);
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });
    document.addEventListener('keydown', onKeydown);
    resizeObserver = new ResizeObserver(() => {
      if (!game || drag) return;
      applyOrientation(false);
    });
    resizeObserver.observe(host);
    lastTick = performance.now();
    const tickId = setInterval(tick, 1000);
    timers.add(tickId);

    if (isValidState(saved)) {
      game = { ...saved, time: Number.isFinite(saved.time) ? saved.time : 0 };
      buildView();
      applyOrientation(false);
    } else {
      applyOrientation(false);
      startGame();
      if (!knownSetup) showNewGame();
    }
    // для проверки (страница-обёртка): ?kldebug в адресе
    if (new URLSearchParams(location.search).has('kldebug')) {
      window.__kl = {
        get game() { return game; },
        get busy() { return busy; },
        get selected() { return selected; },
        start: (opts) => { closeModal(); startGame(opts); },
        move: (from, index, to) => doMove(from, index, to),
        draw: () => doDraw(),
        undo: () => doUndo(),
        hint: () => onHint(),
        finish: () => autoFinish(),
        load: (s) => { game = s; buildView(); measure(); layout(); },
        allMoves: () => allMoves(game),
        skin: (id) => { settings.skin = id; host.dataset.skin = id; },
        four: (on) => host.classList.toggle('kl-four', on),
        rotate: () => toggleRotate(),
        point: (place, index) => {
          const list = listOf(place);
          const node = list[index ?? list.length - 1] ?? (place.k === 't' ? ui.colSlots[place.i] : place.k === 'f' ? ui.foundSlots[place.i] : ui.stockSlot);
          const r = node.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + Math.min(12, r.height / 2)];
        },
        stockPoint: () => {
          const r = (view.stock[view.stock.length - 1] ?? ui.stockSlot).getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        },
      };
    }
  },

  getState() {
    if (!game || !game.moves || isWon(game)) return null;
    save();
    return { moves: game.moves };
  },

  destroy() {
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timers.clear();
    resizeObserver?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (host) {
      delete host.dataset.skin;
      host.classList.remove('kl-four', 'kl-host-rot');
    }
    api = host = root = ui = toast = game = view = metrics = drag = resizeObserver = null;
    busy = false;
    modalActive = false;
    selected = null;
    rotated = false;
    hintCycle = { key: '', index: 0 };
  },
};

void firstUp;
