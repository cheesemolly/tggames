// Паук (Spider Solitaire, как в Windows): правила — logic.js, карты — cards.js (свои SVG), звуки — sounds.js.
//
// Все 104 карты — элементы одного слоя поверх игры: так карта может лететь откуда угодно куда угодно (из колоды
// в столбец, собранная масть — вниз налево). Модель вида (view) повторяет каждое действие логики — ход, раздачу,
// сбор масти и их отмену, — поэтому каждая карта едет, а не появляется. Раскладка столбцов ужимается под экран:
// сначала шаг закрытых карт, потом открытых (не меньше MIN_UP). Ход — перетаскиванием или двумя касаниями: первое
// выбирает карту (ряд одной масти), второе — столбец, куда положить (сами карты никуда не прыгают: иначе партию
// проходили, просто стуча по картам — видео владельца, 2026-09-28). Подсказки — по кругу; отмена без ограничений.
// Альбомный вид — как в Bongo Cat: кнопка поворота разворачивает игру на 90° (телефон держат боком), а на широком
// экране он включается сам; координаты касаний тогда переводятся в систему игры (toLocal).
// Победа — каскад прыгающих карт со следами, как в Windows (касание — пропустить), потом экран результата.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { faceHtml, suitSvg, rankLabel, SUIT_PATHS } from './cards.js';
import {
  COLUMNS, MODES, suitOf, rankOf, isUp, face, card, newGame, canPick, runStart, canMove, move, deal, canDeal, undo,
  isWon, hintMoves, allMoves, dealsLeft, isValidState, emptyStats, isValidStats, recordGame,
} from './logic.js';

const T = {
  title: 'Паук',
  modes: { 1: 'Легко · 1 масть', 2: 'Средне · 2 масти', 4: 'Сложно · 4 масти' },
  modeName: { 1: 'Легко', 2: 'Средне', 4: 'Сложно' },
  modeHint: {
    1: 'Только пики — хорошо для начала',
    2: 'Пики и черви — нужно думать',
    4: 'Все четыре масти — настоящий вызов',
  },
  score: 'Очки',
  moves: 'Ходы',
  newGame: 'Новая партия',
  restart: 'Эту раскладку заново',
  abandon: 'Начатая партия будет засчитана как поражение.',
  play: 'Играть',
  undo: 'Отменить',
  hint: 'Подсказка',
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  skin: 'Стол',
  fourColor: 'Четырёхцветная колода',
  fourColorHint: 'Бубны — синие, трефы — зелёные',
  rotate: 'Повернуть: альбомный вид',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  noHint: 'Полезных ходов нет — отмени ход или начни заново',
  emptyColumn: 'Сначала займи пустой столбец',
  noStock: 'Колода кончилась',
  won: 'Победа!',
  played: 'Сыграно',
  wins: 'Побед',
  winRate: 'Процент побед',
  bestScore: 'Лучший счёт',
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
const GAP = 4;
const PAD = 6;
const MIN_UP = 11;
const MAX_UNDO_SAVED = 200;      // в сохранении — последние ходы (прогресс синхронизируется с сервером)

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  rotate: svgIcon('<rect x="7" y="2" width="10" height="16" rx="2"/><path d="M11 15h2"/><path d="M20 13a8 8 0 0 1-6 7.7"/><path d="M16.5 19.8 14 20.7l.8 2.3"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;            // состояние logic.js + time (мс в партии)
let view = null;            // { cols: [[el]], stock: [el], piles: [[el × 13]] }
let metrics = null;
let drag = null;
let busy = false;           // идёт анимация победы
let hintCycle = { key: '', index: 0 };
let settings = { skin: 'telegram', fourColor: false, rotated: false };
let selected = null;        // выбранный касанием ряд: { from, index }
let rotated = false;        // игра повёрнута на 90° (кнопкой)
let setup = { suits: 1 };
let stats = emptyStats();
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let lastDealAt = 0;
let lastTick = 0;
let resizeObserver = null;
const timers = new Set();
const audio = createAudio(createSounds);

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
  const node = el('div', { class: `sp-card${isUp(code) ? ' sp-up' : ''}` },
    el('div', { class: 'sp-inner' },
      el('div', { class: `sp-face sp-front sp-s${suitOf(c)}` }),
      el('div', { class: 'sp-face sp-back' }),
    ),
  );
  node.querySelector('.sp-front').innerHTML = faceHtml(suitOf(c), rankOf(c));
  node._card = c;
  node._x = null;
  return node;
}

/** Карта элемента должна совпадать с логикой — если нет (не должно случаться), перерисовать лицо. */
function ensureFace(node, code) {
  const c = face(code);
  if (node._card === c) return;
  const front = node.querySelector('.sp-front');
  front.className = `sp-face sp-front sp-s${suitOf(c)}`;
  front.innerHTML = faceHtml(suitOf(c), rankOf(c));
  node._card = c;
}

/** Вид с нуля по состоянию (начало партии, загрузка). */
function buildView() {
  ui.layer.replaceChildren();
  view = { cols: [], stock: [], piles: [] };
  for (const col of game.cols) view.cols.push(col.map((code) => ui.layer.appendChild(makeCard(code))));
  view.stock = game.stock.map((code) => ui.layer.appendChild(makeCard(code)));
  for (const suit of game.done) {
    const pile = [];
    for (let r = 13; r >= 1; r--) pile.push(ui.layer.appendChild(makeCard(card(suit, r, true))));
    view.piles.push(pile);
  }
}

// ---------- раскладка ----------

/** Положение элемента в системе игры (offset — без учёта поворота всей игры). */
function boxOf(node) {
  let x = 0;
  let y = 0;
  for (let n = node; n && n !== root; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

/** Точка касания (экран) → система игры: при повороте на 90° по часовой — обратный поворот вокруг центра. */
function toLocal(clientX, clientY) {
  const R = root.getBoundingClientRect();
  if (!rotated) return [clientX - R.left, clientY - R.top];
  const mx = R.left + R.width / 2;
  const my = R.top + R.height / 2;
  return [root.offsetWidth / 2 + (clientY - my), root.offsetHeight / 2 - (clientX - mx)];
}

function measure() {
  const land = root.classList.contains('sp-land');
  const Tb = boxOf(ui.table);
  let W = Math.floor((Tb.w - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  if (land) W = Math.min(W, Math.floor((Tb.h * 0.3) / 1.42));      // в альбомном — чтобы столбцы влезали по высоте
  W = Math.max(22, Math.min(76, W));
  const H = Math.round(W * 1.42);
  const left = Tb.x + (Tb.w - (W * COLUMNS + GAP * (COLUMNS - 1))) / 2;
  const top = Tb.y + 6;
  const S = boxOf(ui.stock);
  const D = boxOf(ui.done);
  metrics = {
    W, H, left, top, height: Tb.h - 12, land,
    stockX: S.x + S.w - W - 4 * 7, stockY: S.y + (S.h - H) / 2,
    // собранные масти: внизу — в ряд, в альбомном (сбоку) — столбиком
    doneX: land ? D.x + (D.w - W) / 2 : D.x,
    doneY: land ? D.y : D.y + (D.h - H) / 2,
    doneStep: land ? Math.max(4, Math.min(H * 0.3, (D.h - H) / 7)) : Math.min(W * 0.42, (D.w - W) / 7),
  };
  root.style.setProperty('--sp-w', `${W}px`);
  root.style.setProperty('--sp-h', `${H}px`);
  ui.slots.forEach((slot, c) => {
    slot.style.transform = `translate(${colX(c)}px, ${metrics.top}px)`;
  });
}

const colX = (c) => metrics.left + c * (metrics.W + GAP);

/** Шаги столбца: закрытые и открытые карты, ужатые, чтобы столбец влез по высоте. */
function steps(col) {
  const { H, height } = metrics;
  const downs = col.filter((c) => !isUp(c)).length;
  const ups = Math.max(0, col.length - downs - 1);
  let d = Math.round(H * 0.13);
  let u = Math.round(H * 0.34);
  const avail = height - H;
  const need = () => downs * d + ups * u;
  if (need() > avail) d = Math.max(3, Math.floor((avail - ups * u) / Math.max(1, downs)));
  if (need() > avail && ups) u = Math.max(MIN_UP, Math.floor((avail - downs * d) / ups));
  if (need() > avail && ups) u = Math.max(7, Math.floor((avail - downs * d) / ups));
  return { d, u };
}

function place(node, x, y, z, { delay = 0, up = node.classList.contains('sp-up') } = {}) {
  node.classList.toggle('sp-up', up);
  const moved = node._x !== x || node._y !== y;
  node._x = x;
  node._y = y;
  if (moved && node._placed) {
    node.style.transitionDelay = delay ? `${delay}ms` : '';
    node.classList.add('sp-fly');
    node._flyUntil = performance.now() + delay + 330;
    later(() => {
      if (performance.now() >= node._flyUntil - 5) {
        node.classList.remove('sp-fly');
        node.style.transitionDelay = '';
      }
    }, delay + 340);
  }
  node._placed = true;
  node.style.transform = `translate(${x}px, ${y}px)`;
  node.style.zIndex = String(z);
}

/** Расставить все карты по модели вида. delays — задержки полёта отдельных карт (раздача, сбор масти). */
function layout(delays = null) {
  if (!metrics) measure();
  const { top } = metrics;
  for (let c = 0; c < COLUMNS; c++) {
    const col = game.cols[c];
    const list = view.cols[c];
    const { d, u } = steps(col);
    let y = top;
    list.forEach((node, i) => {
      ensureFace(node, col[i]);
      node._loc = { col: c, index: i };
      place(node, colX(c), y, 10 + i, { delay: delays?.get(node) ?? 0, up: isUp(col[i]) });
      y += isUp(col[i]) ? u : d;
    });
  }
  view.stock.forEach((node, k) => {
    node._loc = { stock: true };
    place(node, metrics.stockX + Math.floor(k / COLUMNS) * 7, metrics.stockY, 200 + k, { delay: delays?.get(node) ?? 0, up: false });
  });
  view.piles.forEach((pile, p) => {
    pile.forEach((node, j) => {
      node._loc = { pile: p };
      const x = metrics.land ? metrics.doneX : metrics.doneX + p * metrics.doneStep;
      const y = metrics.land ? metrics.doneY + p * metrics.doneStep : metrics.doneY;
      place(node, x, y, 400 + p * 20 + (13 - j), { delay: delays?.get(node) ?? 0, up: true });
    });
  });
  paintInfo();
}

/**
 * Тряска карты — свойством translate: положение карты задано transform'ом, и общий shake() (он анимирует transform)
 * на время тряски уносил карту в левый верхний угол (видео владельца, 2026-09-28; та же ловушка была в шашках).
 */
function jiggle(node) {
  return animate(node, [
    { translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-2px 0' }, { translate: '2px 0' }, { translate: '0 0' },
  ], { duration: 260, easing: 'ease-in-out' });
}

// ---------- выбор касанием ----------

function select(from, index) {
  deselect();
  selected = { from, index };
  view.cols[from].slice(index).forEach((node) => node.classList.add('sp-sel'));
  markTargets(from, index);
  sfx('pick');
}

function deselect() {
  if (!selected) return;
  selected = null;
  root?.querySelectorAll('.sp-sel').forEach((node) => node.classList.remove('sp-sel'));
  markTargets(-1, -1);
}

/** Касание столбца col, когда что-то выбрано: положить туда. → получилось ли */
function dropSelected(col) {
  if (!selected || col === selected.from || !canMove(game, selected.from, selected.index, col)) return false;
  const { from, index } = selected;
  deselect();
  return doMove(from, index, col);
}

/** Столбец под точкой (в системе игры) или -1. */
function columnAt(x) {
  const c = Math.round((x - metrics.left - metrics.W / 2) / (metrics.W + GAP));
  return c >= 0 && c < COLUMNS && Math.abs(x - (colX(c) + metrics.W / 2)) <= (metrics.W + GAP) / 2 ? c : -1;
}

// ---------- действия (логика + модель вида + звук) ----------

function afterAction() {
  deselect();
  hintCycle = { key: '', index: 0 };
  clearHint();
  save();
  paintInfo();
}

/** Собранные масти из записи хода: 13 карт летят в стопку одна за другой (сверху — туз). */
function collectView(completed, delays) {
  for (const { col } of completed) {
    const list = view.cols[col];
    const pile = list.splice(list.length - 13, 13);
    pile.forEach((node, j) => delays.set(node, 250 + (12 - j) * 45));
    view.piles.push(pile);
  }
}

function doMove(from, index, to, { dropped = false } = {}) {
  const wasEmpty = !game.cols[to].length;
  const res = move(game, from, index, to);
  if (!res.ok) return false;
  const list = view.cols[from];
  view.cols[to].push(...list.splice(index));
  const delays = new Map();
  collectView(res.completed, delays);
  layout(delays);
  sfx(wasEmpty ? 'placeEmpty' : 'place');
  if (res.flipped) later(() => sfx('flip'), 120);
  if (res.completed.length) {
    later(() => sfx('complete'), 250);
    api.platform.haptic.notification('success');
  } else api.platform.haptic.impact(dropped ? 'light' : 'soft');
  afterAction();
  if (isWon(game)) later(win, reducedMotion() ? 50 : 900);
  return true;
}

function doDeal() {
  if (busy) return;
  const nowMs = performance.now();
  if (nowMs - lastDealAt < 300) return;            // двойное касание не раздаёт два ряда
  const res = deal(game);
  if (!res.ok) {
    deselect();
    sfx('illegal');
    shake(ui.stock, { distance: 5, duration: 300 });
    toast.show(res.reason === 'empty' ? T.emptyColumn : T.noStock, 1800);
    return;
  }
  lastDealAt = nowMs;
  const delays = new Map();
  for (let c = 0; c < COLUMNS; c++) {
    const node = view.stock.pop();
    view.cols[c].push(node);
    delays.set(node, c * 55);
  }
  collectView(res.completed, delays);
  layout(delays);
  sfx('deal', { step: 55 });
  if (res.completed.length) later(() => sfx('complete'), 800);
  afterAction();
  if (isWon(game)) later(win, 1500);
}

function doUndo() {
  deselect();
  if (busy || !game.undo.length) return;
  const rec = undo(game);
  if (!rec) return;
  // собранные масти — обратно на стол
  for (let k = rec.cp.length - 1; k >= 0; k--) view.cols[rec.cp[k].col].push(...view.piles.pop());
  if (rec.t === 'm') view.cols[rec.f].push(...view.cols[rec.to].splice(view.cols[rec.to].length - rec.n, rec.n));
  else for (let c = COLUMNS - 1; c >= 0; c--) view.stock.push(view.cols[c].pop());
  layout();
  sfx('undo');
  afterAction();
}

// ---------- ввод ----------

function onPointerDown(e) {
  if (!game || busy || modalActive || (e.pointerType === 'mouse' && e.button !== 0)) return;
  audio.get();
  const node = e.target.closest?.('.sp-card');
  if (!node) return;
  e.preventDefault();
  e.stopPropagation();
  const loc = node._loc;
  if (loc?.stock) {
    deselect();
    doDeal();
    return;
  }
  if (!loc || loc.col == null) {
    deselect();
    return;
  }
  const col = game.cols[loc.col];
  const up = isUp(col[loc.index]);
  // карта внутри разномастного ряда — берём ряд одной масти снизу; закрытая — только как «куда положить»
  const index = !up ? -1 : canPick(col, loc.index) ? loc.index : runStart(col);
  const [x, y] = toLocal(e.clientX, e.clientY);
  drag = {
    col: loc.col, from: loc.col, index, node, nodes: index >= 0 ? view.cols[loc.col].slice(index) : [],
    id: e.pointerId, x, y, moving: false, pickable: up && canPick(col, loc.index),
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
    if (!drag.pickable || Math.hypot(dx, dy) < 7) return;
    drag.moving = true;
    deselect();
    sfx('pick');
    drag.nodes.forEach((node) => node.classList.add('sp-drag'));
    markTargets(drag.from, drag.index);
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
  d.nodes.forEach((node) => node.classList.remove('sp-drag'));
  if (d.moving) {
    markTargets(-1, -1);
    // куда уронили: столбец под серединой взятой карты
    const [x] = toLocal(e.clientX, e.clientY);
    const cx = d.nodes[0]._x + (x - d.x) + metrics.W / 2;
    let to = Math.round((cx - metrics.left - metrics.W / 2) / (metrics.W + GAP));
    to = Math.max(0, Math.min(COLUMNS - 1, to));
    if (to !== d.from && canMove(game, d.from, d.index, to)) {
      doMove(d.from, d.index, to, { dropped: true });
      return;
    }
    d.nodes.forEach((node) => {
      node._x = null;           // вернуть на место с полётом
    });
    layout();
    if (to !== d.from) {
      sfx('illegal');
      jiggle(d.nodes[0]);
    }
    return;
  }
  // касание: выбрано что-то — положить в этот столбец; тот же ряд — снять выбор; иначе — выбрать этот ряд
  if (selected && d.col !== selected.from && dropSelected(d.col)) return;
  if (selected && d.col === selected.from && (d.index === selected.index || d.index < 0)) {
    deselect();
    return;
  }
  if (d.index >= 0) {
    select(d.col, d.index);
    return;
  }
  deselect();
  sfx('illegal');
  jiggle(d.node);
}

/** Касание стола мимо карт: выбрано что-то — положить в столбец под пальцем (пустой или ниже карт), иначе снять выбор. */
function onTablePointer(e) {
  if (!game || busy || modalActive || e.target.closest?.('.sp-card, button, .sp-modal, .sp-cascade-wrap')) return;
  if (!selected) return;
  const [x, y] = toLocal(e.clientX, e.clientY);
  const Tb = boxOf(ui.table);
  const col = y >= Tb.y && y <= Tb.y + Tb.h ? columnAt(x) : -1;
  if (col >= 0 && dropSelected(col)) return;
  if (col >= 0 && col !== selected.from) {
    sfx('illegal');
    view.cols[selected.from].slice(selected.index).forEach(jiggle);
  }
  deselect();
}

function markTargets(from, index) {
  ui.slots.forEach((slot, c) => slot.classList.toggle('sp-target', from >= 0 && canMove(game, from, index, c)));
  for (let c = 0; c < COLUMNS; c++) {
    const top = view.cols[c][view.cols[c].length - 1];
    top?.classList.toggle('sp-target-card', from >= 0 && c !== from && canMove(game, from, index, c));
  }
}

// ---------- подсказка ----------

function clearHint() {
  root?.querySelectorAll('.sp-hint-src, .sp-hint-dst').forEach((node) => node.classList.remove('sp-hint-src', 'sp-hint-dst'));
  ui?.stock.classList.remove('sp-hint-dst');
}

function onHint() {
  if (busy || !game) return;
  const key = JSON.stringify(game.cols.map((c) => c.length)) + game.stock.length + game.moves;
  const list = [...hintMoves(game).map((m) => ({ type: 'move', ...m })), ...(canDeal(game) ? [{ type: 'deal' }] : [])];
  deselect();
  clearHint();
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
  if (h.type === 'deal') {
    ui.stock.classList.add('sp-hint-dst');
    return;
  }
  view.cols[h.from].slice(h.index).forEach((node) => node.classList.add('sp-hint-src'));
  const top = view.cols[h.to][view.cols[h.to].length - 1];
  (top ?? ui.slots[h.to]).classList.add('sp-hint-dst');
  later(clearHint, 2400);
}

// ---------- шапка, время, сохранение ----------

function paintInfo() {
  if (!ui || !game) return;
  ui.score.textContent = String(game.score);
  ui.moves.textContent = String(game.moves);
  ui.time.textContent = clock(game.time ?? 0);
  ui.sub.textContent = T.modes[game.suits];
  ui.undoBtn.disabled = !game.undo.length || busy;
  const left = dealsLeft(game);
  ui.stockCount.textContent = left ? String(left) : '';
  ui.stock.classList.toggle('sp-stock-empty', !left);
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

function startGame({ suits = setup.suits, seed = null } = {}) {
  if (game && game.moves > 0 && !isWon(game)) {
    recordGame(stats, game.suits, { won: false });
    api.storage.set('stats', stats);
  }
  const s = seed ?? Math.floor(Math.random() * 2 ** 31);
  game = { ...newGame(suits, s), time: 0 };
  busy = false;
  hintCycle = { key: '', index: 0 };
  buildView();
  // карты сначала в колоде — потом разлетаются по столбцам
  measure();
  const all = [...view.cols.flat()];
  all.forEach((node) => {
    node.classList.remove('sp-up');
    place(node, metrics.stockX, metrics.stockY, 100);
  });
  view.stock.forEach((node) => place(node, metrics.stockX, metrics.stockY, 100, { up: false }));
  const delays = new Map();
  let k = 0;
  for (let row = 0; row < 6; row++) {
    for (let c = 0; c < COLUMNS; c++) if (view.cols[c][row]) delays.set(view.cols[c][row], (k++) * 22);
  }
  sfx('shuffle');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!ui) return;
    layout(reducedMotion() ? null : delays);
  }));
  later(() => sfx('deal', { step: 45 }), 600);
  save();
  paintInfo();
}

// ---------- альбомный вид (как в Bongo Cat) ----------

/**
 * Альбомная раскладка — если игру повернули кнопкой или экран и так шире, чем выше (телефон боком, окно на ПК):
 * столбцы шире, колода, кнопки и собранные масти — справа столбиком. Поворот — вся игра на 90° по часовой.
 */
function applyOrientation(animated = false) {
  if (!ui || !host) return;
  const W = host.clientWidth;
  const H = host.clientHeight;
  const wide = W > H;
  const was = rotated;
  rotated = settings.rotated && !wide;
  host.classList.toggle('sp-host-rot', rotated);
  root.classList.toggle('sp-rot', rotated);
  root.classList.toggle('sp-land', rotated || wide);
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

// ---------- победа: каскад прыгающих карт ----------

function cardImage(c) {
  const suit = suitOf(c);
  const rank = rankOf(c);
  const color = getComputedStyle(root).getPropertyValue(`--sp-suit-${suit}`).trim() || (suit % 2 ? '#d62828' : '#1b1b1f');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="142" viewBox="0 0 100 142">`
    + '<rect x="1" y="1" width="98" height="140" rx="9" fill="#fdfdfb" stroke="#b9b9b3" stroke-width="2"/>'
    + `<text x="9" y="36" font-family="system-ui, sans-serif" font-weight="800" font-size="34" fill="${color}">${rankLabel(rank)}</text>`
    + `<g transform="translate(62 10) scale(0.3)" fill="${color}"><path d="${SUIT_PATHS[suit]}"/></g>`
    + `<g transform="translate(22 52) scale(0.56)" fill="${color}"><path d="${SUIT_PATHS[suit]}"/></g></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img;
}

function win() {
  if (busy || !ui) return;
  busy = true;
  paintInfo();
  const timeMs = game.time ?? 0;
  recordGame(stats, game.suits, { won: true, score: game.score, timeMs });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sfx('win');
  api.platform.haptic.notification('success');
  const result = {
    outcome: 'win',
    title: T.won,
    score: game.score,
    durationMs: timeMs,
    variant: `suits-${game.suits}`,
    locale: 'ru',
    message: `${T.modeName[game.suits]} · ${game.moves} ${plural(game.moves, ['ход', 'хода', 'ходов'])}`,
  };
  const finish = () => {
    if (!api) return;
    ui.cascade?.remove();
    api.finish(result);
  };
  if (reducedMotion()) {
    later(finish, 400);
    return;
  }
  cascade(finish);
}

function cascade(done) {
  const R = { width: root.offsetWidth, height: root.offsetHeight };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = el('canvas', { class: 'sp-cascade' });
  canvas.width = Math.round(R.width * dpr);
  canvas.height = Math.round(R.height * dpr);
  const hint = el('div', { class: 'sp-cascade-hint' }, T.skipWin);
  const wrap = el('div', { class: 'sp-cascade-wrap' }, canvas, hint);
  ui.cascade = wrap;
  root.append(wrap);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const { W, H } = metrics;
  // карты вылетают из стопок собранных мастей по очереди: с последней стопки, сверху — король
  const queue = [];
  for (let p = view.piles.length - 1; p >= 0; p--) {
    for (let j = 0; j < 13; j++) queue.push({ c: view.piles[p][j]._card, x: metrics.doneX + p * metrics.doneStep, y: metrics.doneY });
  }
  const images = new Map();
  for (const q of queue) if (!images.has(q.c)) images.set(q.c, cardImage(q.c));
  let active = null;
  let finished = false;
  let last = performance.now();
  let started = last;
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
    if (!active && queue.length) {
      const q = queue.shift();
      // стопки внизу — карта подпрыгивает вверх и скачет по экрану, оставляя след
      active = { ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5), vy: -(12 + Math.random() * 7) };
    }
    if (active) {
      active.vy += 0.55 * dt;
      active.x += active.vx * dt;
      active.y += active.vy * dt;
      if (active.y > floor) {
        active.y = floor;
        active.vy = -active.vy * 0.78;
      }
      const img = images.get(active.c);
      if (img.complete) ctx.drawImage(img, active.x, active.y, W, H);
      if (active.x < -W || active.x > R.width) active = null;
    }
    if ((!active && !queue.length) || now - started > 9000) {
      stop();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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

function cardBox(title, ...children) {
  return el('div', { class: 'sp-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'sp-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'sp-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
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

function suitRow(suits) {
  const list = suits === 4 ? [0, 1, 2, 3] : suits === 2 ? [0, 1] : [0];
  return el('span', { class: 'sp-suit-row' }, list.map((s) => {
    const span = el('span', { class: `sp-mini sp-s${s}` });
    span.innerHTML = suitSvg(s);
    return span;
  }));
}

function showNewGame() {
  const draft = { ...setup };
  const inProgress = game && game.moves > 0 && !isWon(game);
  openModal(cardBox(T.newGame,
    el('div', { class: 'sp-modes', role: 'radiogroup' }, radioGroup('sp-option', MODES.map((m) => ({
      id: m,
      body: [suitRow(m), el('b', {}, T.modes[m]), el('span', {}, T.modeHint[m])],
    })), (id) => draft.suits === id, (id) => { draft.suits = id; })),
    inProgress ? el('p', { class: 'sp-note' }, T.abandon) : null,
    el('button', { class: 'btn sp-play', onclick: () => { setup = draft; api.storage.set('setup', setup); closeModal(); startGame(); } }, T.play),
    inProgress ? el('button', { class: 'btn btn-secondary sp-play', onclick: () => { closeModal(); startGame({ suits: game.suits, seed: game.seed }); } }, T.restart) : null,
  ));
}

function showStats() {
  const tile = (value, label) => el('div', { class: 'sp-tile' }, el('b', {}, value), el('span', {}, label));
  openModal(cardBox(T.stats, ...MODES.map((m) => {
    const r = stats[m];
    return el('div', { class: 'sp-stat-block' },
      el('h3', { class: 'sp-section' }, suitRow(m), T.modes[m]),
      el('div', { class: 'sp-tiles' },
        tile(String(r.played), T.played),
        tile(String(r.wins), T.wins),
        tile(r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '—', T.winRate),
        tile(r.bestScore ? String(r.bestScore) : '—', T.bestScore),
        tile(r.bestTime ? clock(r.bestTime * 1000) : '—', T.bestTime),
        tile(`${r.streak} / ${r.bestStreak}`, `${T.streak} / ${T.bestStreak.toLowerCase()}`),
      ));
  })));
}

function showSettings() {
  const four = el('input', { type: 'checkbox', checked: settings.fourColor });
  four.addEventListener('change', () => {
    settings.fourColor = four.checked;
    host.classList.toggle('sp-four', settings.fourColor);
    api.storage.set('settings', settings);
  });
  openModal(cardBox(T.settings,
    el('h3', { class: 'sp-section' }, T.skin),
    el('div', { class: 'sp-skins', role: 'radiogroup' }, radioGroup('sp-skin', SKINS.map((s) => ({
      id: s.id,
      body: [el('span', { class: 'sp-swatch', 'data-skin': s.id }, el('i', { class: 'sp-sw-card' }), el('i', { class: 'sp-sw-back' })), s.name],
    })), (id) => settings.skin === id, (id) => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
    })),
    el('label', { class: 'sp-toggle' }, four, el('span', {}, el('b', {}, T.fourColor), el('small', {}, T.fourColorHint))),
  ));
}

function iconButton(icon, label, onclick) {
  const b = el('button', { class: 'sp-icon-btn', 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick) {
  const b = el('button', { class: 'sp-tool', 'aria-label': label, onclick }, el('span', { class: 'sp-tool-label' }, label));
  b.insertAdjacentHTML('afterbegin', icon);
  return b;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    doUndo();
  } else if (!modalActive && (e.key === 'h' || e.key === 'р')) onHint();
  else if (!modalActive && (e.key === 'd' || e.key === 'в')) doDeal();
}

export default {
  id: 'spider',
  title: 'Паук',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSetup, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('setup'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      skin: SKINS.some((s) => s.id === savedSettings?.skin) ? savedSettings.skin : 'telegram',
      fourColor: savedSettings?.fourColor === true,
      rotated: savedSettings?.rotated === true,
    };
    const knownSetup = MODES.includes(savedSetup?.suits);
    if (knownSetup) setup = { suits: savedSetup.suits };
    host.dataset.skin = settings.skin;
    host.classList.toggle('sp-four', settings.fourColor);

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.setAttribute('aria-label', soundOn ? T.soundOn : T.soundOff);
      sfx('click');
    });
    ui = {
      sub: el('div', { class: 'sp-sub' }),
      score: el('b', {}),
      moves: el('b', {}),
      time: el('b', {}),
      table: el('div', { class: 'sp-table' }),
      layer: el('div', { class: 'sp-layer' }),
      stockCount: el('span', { class: 'sp-stock-count' }),
      done: el('div', { class: 'sp-done' }),
      modal: el('div', { class: 'sp-modal', hidden: true }),
    };
    ui.slots = Array.from({ length: COLUMNS }, () => el('div', { class: 'sp-slot' }));
    ui.slotLayer = el('div', { class: 'sp-slots' }, ui.slots);
    ui.stock = el('button', { class: 'sp-stock', 'aria-label': 'Раздать', onclick: () => doDeal() }, ui.stockCount);
    ui.rotateBtn = iconButton(ICONS.rotate, T.rotate, toggleRotate);
    ui.undoBtn = toolButton(ICONS.undo, T.undo, doUndo);
    root = el('div', { class: 'sp' },
      el('div', { class: 'sp-header' },
        el('div', { class: 'sp-head-text' }, el('div', { class: 'sp-title' }, T.title), ui.sub),
        el('div', { class: 'sp-actions' },
          ui.rotateBtn,
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, showNewGame),
        ),
      ),
      el('div', { class: 'sp-info' },
        el('span', {}, `${T.score} `, ui.score), el('span', {}, `${T.moves} `, ui.moves), el('span', {}, '⏱ ', ui.time)),
      el('div', { class: 'sp-body' },
        ui.table,
        el('div', { class: 'sp-bar' }, ui.done, ui.undoBtn, toolButton(ICONS.hint, T.hint, onHint), ui.stock),
      ),
      ui.slotLayer,
      ui.layer,
      ui.modal,
      toast.el,
    );
    container.append(root);
    ui.layer.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerdown', onTablePointer);
    ui.layer.addEventListener('pointermove', onPointerMove);
    ui.layer.addEventListener('pointerup', onPointerUp);
    ui.layer.addEventListener('pointercancel', () => {
      if (!drag) return;
      drag.nodes.forEach((node) => node.classList.remove('sp-drag'));
      drag = null;
      markTargets(-1, -1);
      layout();
    });
    ui.layer.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });
    document.addEventListener('keydown', onKeydown);
    resizeObserver = new ResizeObserver(() => {
      if (!game || drag) return;
      applyOrientation(false);
    });
    resizeObserver.observe(host);
    applyOrientation(false);
    lastTick = performance.now();
    const tickId = setInterval(tick, 1000);
    timers.add(tickId);
    ui.tickId = tickId;

    if (isValidState(saved)) {
      game = { ...saved, time: Number.isFinite(saved.time) ? saved.time : 0 };
      buildView();
      measure();
      layout();
    } else {
      startGame();
      if (!knownSetup) showNewGame();
    }
    // для проверки (страница-обёртка): ?spdebug в адресе
    if (new URLSearchParams(location.search).has('spdebug')) {
      window.__sp = {
        get game() { return game; },
        get busy() { return busy; },
        start: (opts) => { closeModal(); startGame(opts); },
        move: (from, index, to) => doMove(from, index, to),
        select: (col, index) => select(col, index),
      get selected() { return selected; },
      rotate: () => toggleRotate(),
        deal: () => doDeal(),
        undo: () => doUndo(),
        hint: () => onHint(),
        load: (s) => { game = s; buildView(); measure(); layout(); },
        win: () => win(),
        allMoves: () => allMoves(game),
        skin: (id) => { settings.skin = id; host.dataset.skin = id; },
        point: (col, index) => {
          const node = view.cols[col][index] ?? ui.slots[col];
          const r = node.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + Math.min(10, r.height / 2)];
        },
        four: (on) => host.classList.toggle('sp-four', on),
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
      host.classList.remove('sp-four', 'sp-host-rot');
    }
    api = host = root = ui = toast = game = view = metrics = drag = resizeObserver = null;
    busy = false;
    modalActive = false;
    selected = null;
    rotated = false;
    hintCycle = { key: '', index: 0 };
  },
};

