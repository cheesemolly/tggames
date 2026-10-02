// Сапёр: поле закрытых клеток, под некоторыми мины; открытая клетка показывает, сколько мин вокруг. Цель — открыть
// всё, кроме мин. Правила — logic.js, логика выводов (подсказки и поля «без угадываний») — solver.js, звуки —
// sounds.js.
//
// Поле — сетка DOM-клеток (до 900): перерисовываются только изменившиеся. Касание — открыть (в режиме «Флажок» —
// флажок), долгое нажатие — наоборот; касание открытой цифры с нужным числом флажков вокруг открывает остальных
// соседей («аккорд»). Мышь: левая — открыть, правая — флажок, средняя — аккорд; пробел/F — флажок или аккорд
// под курсором. Большое поле двигается пальцем и масштабируется щипком, колесом и кнопками (клетка на телефоне
// не мельче 30 px — настройка «Размер клеток»).
// Время идёт с первого открытия и стоит, пока открыто окно или свёрнута вкладка. Конец — экран результата
// оболочки (api.finish) после анимации: взрыв и остальные мины по очереди или волна по полю и флажки на минах.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  CLOSED, OPEN, FLAG, MARK, DIFFS, DIFF_IDS, LIMITS, HINTS, NG_DENSITY, HOLDS, SKINS, SIZES, maxMines, sizeOf, newGame, placeMines,
  numbers, reveal, chord, toggleFlag, flagsAround, minesLeft, progressOf, bbbv, hintFor, serialize, deserialize,
  emptyStats, isValidStats, recordGame, normalizeSetup, normalizeSettings, fmtTime, neighborsOf,
} from './logic.js';

const T = {
  title: 'Сапёр',
  diffs: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', custom: 'Своё поле' },
  diffShort: { easy: 'лёгкий', medium: 'средний', hard: 'сложный', custom: 'своё поле' },
  minesWord: (n) => `${n} ${plural(n, 'мина', 'мины', 'мин')}`,
  noGuess: 'Без угадываний',
  noGuessHint: 'Поле всегда решается логикой — угадывать не придётся ни разу',
  noGuessFailed: 'Без угадываний не вышло: мин слишком много — поле обычное',
  rules: 'Открывай клетки. Цифра — сколько мин среди восьми соседних клеток. Где мина — ставь флажок. Открой всё, кроме мин, — победа. Первый ход всегда безопасен.',
  newGame: 'Новая игра',
  difficulty: 'Сложность',
  width: 'Ширина',
  height: 'Высота',
  mines: 'Мины',
  density: (p) => `${p}% поля`,
  denseNg: 'Без угадываний поле находится до 22% мин — плотнее может выйти обычное',
  start: 'Играть',
  abandon: 'Начатая партия засчитается поражением.',
  restartAsk: 'Начать заново?',
  restart: 'Заново',
  keep: 'Играть дальше',
  dig: 'Открыть',
  flag: 'Флажок',
  hint: 'Подсказка',
  noHints: 'Подсказки закончились',
  hintStart: 'Открой любую клетку — первый ход всегда безопасен',
  hintWrongFlag: 'Этот флажок стоит не на мине — сними его',
  hintSafe: {
    single: 'Вокруг выделенной цифры уже стоят все её флажки — эта клетка свободна',
    pair: 'Сравни выделенные цифры: все мины одной из них уже приходятся на общих соседей — эта клетка свободна',
    global: 'Все мины уже под флажками — остальные клетки свободны',
    enum: 'Перебери, как могут лежать мины у выделенных цифр: в любом варианте эта клетка свободна',
  },
  hintMine: {
    single: 'У выделенной цифры закрытых соседей ровно столько, сколько мин осталось, — здесь мина',
    pair: 'Сравни выделенные цифры: лишняя мина одной из них может быть только здесь — поставь флажок',
    global: 'Закрытых клеток осталось ровно столько, сколько мин, — здесь мина',
    enum: 'Перебери, как могут лежать мины у выделенных цифр: в любом варианте здесь мина',
  },
  hintGuess: (p) => `Без угадывания тут не обойтись. Безопаснее всего здесь: мина с вероятностью ${p}%`,
  win: 'Победа!',
  record: 'Новый рекорд!',
  boom: 'Мина!',
  openedShare: (p) => `Открыто ${p}% поля`,
  resultLine: (diff, b3, eff) => `${diff} · 3BV ${b3} · эффективность ${eff}%`,
  best: (t) => `Рекорд: ${t}`,
  menuBest: (t, d) => `Лучшее: ${t} · ${d}`,
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  skin: 'Оформление',
  skins: { telegram: 'По умолчанию', classic: 'Классика', lawn: 'Луг', neon: 'Неон', ice: 'Лёд', candy: 'Конфета' },
  size: 'Размер клеток',
  sizes: { fit: 'Мелкие', normal: 'Обычные', big: 'Крупные' },
  sizeHint: 'Мелкие — поле целиком на экране, крупные — удобнее попадать (большое поле двигается пальцем)',
  longPress: 'Флажок долгим нажатием',
  hold: 'Долгое нажатие',
  holds: { fast: 'Быстрое', normal: 'Обычное', slow: 'Медленное' },
  chordSetting: 'Нажатие на цифру открывает соседей, если флажки расставлены',
  marks: 'Знак «?» (третье нажатие флажка)',
  played: 'Сыграно',
  wins: 'Побед',
  bestTime: 'Лучшее время',
  bestNg: 'Без угадываний',
  streak: 'Серия',
  bestStreak: 'Лучшая серия',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  zoom: { in: 'Приблизить', out: 'Отдалить', fit: 'Всё поле', big: 'Крупно' },
  minesLeft: 'Осталось мин',
  timer: 'Время',
  face: 'Новая партия',
};

function plural(n, one, few, many) {
  const a = Math.abs(n) % 10;
  const b = Math.abs(n) % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  dig: svgIcon('<path d="M14 4l6 6"/><path d="M17 7 7.5 16.5"/><path d="M4 20l3.5-3.5"/><path d="M12.5 3.5c2.5-.5 5.5.6 8 3.2l-1.2 1.2c-2.2-2.2-4.5-3.2-6.8-2.9Z"/>'),
  flag: svgIcon('<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>'),
  clock: svgIcon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M10 2h4"/>'),
};

// флажок и мина на клетке — SVG в долях клетки (масштабируются вместе с ней)
const FLAG_SVG = '<svg class="ms-ico" viewBox="0 0 20 20" aria-hidden="true"><path class="ms-flag-base" d="M5 16.6h10v1.6H5z"/><path class="ms-flag-pole" d="M9.2 3.2h1.4v13.6H9.2z"/><path class="ms-flag-cloth" d="M10.6 3.2 16 6.3l-5.4 3.1z"/></svg>';
const MINE_SVG = '<svg class="ms-ico" viewBox="0 0 20 20" aria-hidden="true"><g class="ms-mine-spikes"><path d="M10 2.4v15.2M2.4 10h15.2M4.6 4.6l10.8 10.8M15.4 4.6 4.6 15.4"/></g><circle class="ms-mine-body" cx="10" cy="10" r="5.2"/><circle class="ms-mine-shine" cx="8.2" cy="8.2" r="1.5"/></svg>';
const CROSS_SVG = '<svg class="ms-ico ms-cross" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4 4 16"/></svg>';

/** Рожица на кнопке новой партии: normal | press | win | lose. */
function faceSvg(state) {
  const eyes = state === 'lose'
    ? '<path class="ms-face-x" d="M8.2 9.2l2.6 2.6M10.8 9.2 8.2 11.8M15.2 9.2l2.6 2.6M17.8 9.2l-2.6 2.6"/>'
    : state === 'win'
      ? '<path class="ms-face-glasses" d="M6.6 9.6h12.8v1.2l-1 2.4h-3.4l-1-2.2h-1l-1 2.2H8.6l-1-2.4z"/>'
      : '<circle class="ms-face-eye" cx="9.6" cy="10.4" r="1.25"/><circle class="ms-face-eye" cx="16.4" cy="10.4" r="1.25"/>';
  const mouth = state === 'press'
    ? '<circle class="ms-face-o" cx="13" cy="17.2" r="2"/>'
    : state === 'lose'
      ? '<path class="ms-face-mouth" d="M9.4 18.6c2.2-2 5-2 7.2 0"/>'
      : '<path class="ms-face-mouth" d="M8.8 15.6c2.4 2.8 6 2.8 8.4 0"/>';
  return `<svg viewBox="0 0 26 26" width="30" height="30" aria-hidden="true"><circle class="ms-face-bg" cx="13" cy="13" r="11"/>${eyes}${mouth}</svg>`;
}

const PAN_THRESHOLD = 9;      // px — дальше это перетаскивание поля, а не касание
const MAX_CELL = 56;          // крупнее клетку не делаем даже на большом экране
const ZOOM_CELL = 64;         // до какого размера клетки можно приблизить
const CELL_MIN = { fit: 0, normal: 30, big: 40 };

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = emptyStats();
let settings = normalizeSettings(null);
let setup = normalizeSetup(null);
let mode = 'dig';
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let finishing = false;
let rendered = [];
let geo = { cell: 30, width: 0, height: 0 };
let view = { s: 1, tx: 0, ty: 0 };
let fitScale = 1;
let pointers = new Map();
let gesture = null;
let lastCell = -1;
let hover = -1;
let hintMarks = [];
let pressed = [];
let runSince = 0;             // когда пошли часы (0 — стоят)
let waitTouch = false;        // партия из сохранения: часы пойдут с первого касания поля
let clockTimer = 0;
let resizeObs = null;
const timers = new Set();
const audio = createAudio(createSounds);

const lastSound = new Map();

/** Звук; одинаковые — не чаще раза в 45 мс (быстрые касания и аккорды не сливаются в треск). */
function sfx(name, opts) {
  if (!soundOn) return;
  const t = performance.now();
  if (t - (lastSound.get(name) ?? -1e9) < 45) return;
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

const started = () => Boolean(game?.mine) && !game.over;

// ---------- время ----------

function elapsed() {
  return game.time + (runSince ? performance.now() - runSince : 0);
}

/** Часы идут, когда партия начата, не кончилась, окна нет и вкладка видна. */
function syncClock() {
  const run = started() && !modalActive && !waitTouch && document.visibilityState === 'visible';
  if (run && !runSince) runSince = performance.now();
  if (!run && runSince) {
    game.time += performance.now() - runSince;
    runSince = 0;
  }
  paintClock();
}

function paintClock() {
  if (!ui || !game) return;
  const s = Math.floor(elapsed() / 1000);
  const text = settings.skin === 'classic' ? String(Math.min(999, s)).padStart(3, '0') : fmtTime(s * 1000);
  if (ui.clock.textContent !== text) ui.clock.textContent = text;
}

function paintCounter() {
  const left = minesLeft(game);
  const text = settings.skin === 'classic' ? (left < 0 ? `-${String(-left).padStart(2, '0')}` : String(left).padStart(3, '0')) : String(left);
  ui.counter.textContent = text;
}

function setFace(state) {
  if (ui.face.dataset.state === state) return;
  ui.face.dataset.state = state;
  ui.face.innerHTML = faceSvg(state);
}

const save = () => {
  if (!api || !game) return;
  if (!started()) api.storage.remove('current');
  else {
    const snap = serialize({ ...game, time: elapsed() });
    api.storage.set('current', snap);
  }
};

// ---------- поле ----------

function buildBoard() {
  const { w, h } = game;
  rendered = new Array(w * h).fill('');
  const frag = document.createDocumentFragment();
  ui.cells = [];
  for (let i = 0; i < w * h; i++) {
    const c = el('div', { class: 'ms-cell' });
    ui.cells.push(c);
    frag.append(c);
  }
  ui.board.replaceChildren(frag);
  ui.board.style.setProperty('--w', String(w));
  ui.board.style.setProperty('--h', String(h));
  measure(true);
  paintAll();
}

/** Ключ вида клетки — чтобы трогать DOM только при изменении. */
function cellKey(i) {
  const st = game.cells[i];
  const over = game.over;
  const isMine = game.mine?.[i];
  if (st === OPEN) return `o${numbers(game)[i]}`;
  if (over === 'lose') {
    if (i === game.boom) return 'boom';
    if (st === FLAG) return isMine ? 'f' : 'wrong';
    if (isMine) return 'mine';
  }
  if (st === FLAG) return 'f';
  if (st === MARK) return 'q';
  return 'c';
}

function paintCell(i) {
  const key = cellKey(i);
  if (rendered[i] === key) return false;
  rendered[i] = key;
  const node = ui.cells[i];
  const x = i % game.w;
  const y = (i - x) / game.w;
  const odd = (x + y) % 2 ? ' ms-odd' : '';
  if (key[0] === 'o') {
    const n = key.slice(1);
    node.className = `ms-cell ms-open${odd}${n !== '0' ? ` ms-n${n}` : ''}`;
    node.textContent = n !== '0' ? n : '';
    return true;
  }
  node.textContent = '';
  if (key === 'f') {
    node.className = `ms-cell ms-closed ms-flagged${odd}`;
    node.innerHTML = FLAG_SVG;
  } else if (key === 'q') {
    node.className = `ms-cell ms-closed ms-marked${odd}`;
    node.textContent = '?';
  } else if (key === 'mine' || key === 'boom') {
    node.className = `ms-cell ms-open ms-mine${key === 'boom' ? ' ms-boom' : ''}${odd}`;
    node.style.setProperty('--mine-hue', String((i * 137) % 360));
    node.innerHTML = MINE_SVG;
  } else if (key === 'wrong') {
    node.className = `ms-cell ms-closed ms-wrong${odd}`;
    node.innerHTML = FLAG_SVG + CROSS_SVG;
  } else {
    node.className = `ms-cell ms-closed${odd}`;
  }
  return true;
}

function paintAll() {
  for (let i = 0; i < game.w * game.h; i++) paintCell(i);
  paintCounter();
  paintClock();
  paintTools();
  paintSub();
}

/** Под заголовком — коротко (мины видны на счётчике, размер — в окне новой игры): «Лёгкий · без угадываний». */
function paintSub() {
  const parts = [game.diff === 'custom' ? `${T.diffs.custom} ${game.w}×${game.h}` : T.diffs[game.diff]];
  if (game.noGuess && (!game.mine || game.ng)) parts.push(T.noGuess.toLowerCase());
  ui.sub.textContent = parts.join(' · ');
}

function paintTools() {
  ui.digBtn.setAttribute('aria-pressed', String(mode === 'dig'));
  ui.flagBtn.setAttribute('aria-pressed', String(mode === 'flag'));
  ui.hintBadge.textContent = String(game.hints);
  ui.hintBtn.disabled = Boolean(game.over);
  ui.tools.classList.toggle('ms-flag-mode', mode === 'flag');
}

// ---------- размеры, масштаб, перемещение ----------

function wrapSize() {
  const r = ui.wrap.getBoundingClientRect();
  return { W: r.width, H: r.height, left: r.left, top: r.top };
}

/** Размер клетки под свободное место и настройку; reset — новая партия (масштаб 1, поле по центру). */
function measure(reset = false) {
  const { W, H } = wrapSize();
  if (W < 10 || H < 10) return;
  const fit = Math.min(W / game.w, H / game.h);
  const cell = Math.floor(Math.min(MAX_CELL, Math.max(fit, CELL_MIN[settings.size] ?? 30)) * 4) / 4;
  geo = { cell, width: cell * game.w, height: cell * game.h };
  host.style.setProperty('--cell', `${cell}px`);
  ui.board.style.width = `${geo.width}px`;
  ui.board.style.height = `${geo.height}px`;
  fitScale = Math.min(1, W / geo.width, H / geo.height);
  const maxScale = Math.max(1, ZOOM_CELL / cell);
  if (reset) view = { s: 1, tx: (W - geo.width) / 2, ty: (H - geo.height) / 2 };
  else view.s = Math.max(fitScale, Math.min(maxScale, view.s));
  clampView();
  applyView();
}

const maxScale = () => Math.max(1, ZOOM_CELL / geo.cell);

function clampView() {
  const { W, H } = wrapSize();
  const bw = geo.width * view.s;
  const bh = geo.height * view.s;
  view.tx = bw <= W ? (W - bw) / 2 : Math.min(0, Math.max(W - bw, view.tx));
  view.ty = bh <= H ? (H - bh) / 2 : Math.min(0, Math.max(H - bh, view.ty));
}

function applyView() {
  ui.board.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
  const zoomable = fitScale < 0.999 || maxScale() > 1.001;
  const bigBoard = fitScale < 0.999 || view.s > 1.001;
  ui.zoom.hidden = !zoomable || !bigBoard;
  ui.zoomFit.textContent = view.s > fitScale + 0.01 ? T.zoom.fit : T.zoom.big;
}

function zoomAt(s, cx, cy, animated = false) {
  const next = Math.max(fitScale, Math.min(maxScale(), s));
  const bx = (cx - view.tx) / view.s;
  const by = (cy - view.ty) / view.s;
  view = { s: next, tx: cx - bx * next, ty: cy - by * next };
  clampView();
  smooth(animated);
  applyView();
}

function smooth(on) {
  if (!on || reducedMotion()) return;
  ui.board.style.transition = 'transform 0.25s ease';
  later(() => { if (ui) ui.board.style.transition = ''; }, 260);
}

function zoomStep(factor) {
  const { W, H } = wrapSize();
  zoomAt(view.s * factor, W / 2, H / 2, true);
  sfx('click');
}

function zoomToggle() {
  const { W, H } = wrapSize();
  zoomAt(view.s > fitScale + 0.01 ? fitScale : 1, W / 2, H / 2, true);
  sfx('click');
}

/** Подвинуть поле так, чтобы клетки были видны. */
function ensureVisible(cells) {
  if (!cells.length) return;
  const { W, H } = wrapSize();
  const xs = cells.map((i) => (i % game.w) * geo.cell * view.s + view.tx);
  const ys = cells.map((i) => Math.floor(i / game.w) * geo.cell * view.s + view.ty);
  const size = geo.cell * view.s;
  const pad = 24;
  const left = Math.min(...xs);
  const right = Math.max(...xs) + size;
  const top = Math.min(...ys);
  const bottom = Math.max(...ys) + size;
  let dx = 0;
  let dy = 0;
  if (left < pad) dx = pad - left;
  else if (right > W - pad) dx = W - pad - right;
  if (top < pad) dy = pad - top;
  else if (bottom > H - pad) dy = H - pad - bottom;
  if (!dx && !dy) return;
  view.tx += dx;
  view.ty += dy;
  clampView();
  smooth(true);
  applyView();
}

function localPoint(e) {
  const { left, top } = wrapSize();
  return { x: e.clientX - left, y: e.clientY - top };
}

/** Клетка под точкой окна поля (или −1). */
function cellAt(p) {
  const bx = (p.x - view.tx) / view.s;
  const by = (p.y - view.ty) / view.s;
  const x = Math.floor(bx / geo.cell);
  const y = Math.floor(by / geo.cell);
  if (x < 0 || y < 0 || x >= game.w || y >= game.h) return -1;
  return y * game.w + x;
}

// ---------- ввод ----------

function clearPress() {
  for (const i of pressed) ui.cells[i]?.classList.remove('ms-press', 'ms-hold');
  pressed = [];
  if (game && !game.over) setFace('normal');
}

function showPress(i) {
  clearPress();
  if (i < 0 || game.over) return;
  const st = game.cells[i];
  if (st === CLOSED || st === MARK) pressed = mode === 'dig' ? [i] : [];
  else if (st === OPEN && settings.chord && numbers(game)?.[i]) {
    pressed = neighborsOf(game, i).filter((j) => game.cells[j] === CLOSED || game.cells[j] === MARK);
  }
  for (const j of pressed) ui.cells[j].classList.add('ms-press');
  if (pressed.length) setFace('press');
}

function startGesture() {
  const pts = [...pointers.values()];
  clearTimeout(gesture?.long);
  if (pts.length >= 2) {
    clearPress();
    const [a, b] = pts;
    gesture = {
      mode: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: { ...view },
    };
  } else gesture = null;
}

function onPointerDown(e) {
  if (modalActive || finishing || !game) return;
  if (waitTouch) {
    waitTouch = false;
    syncClock();
  }
  audio.get();
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  try { ui.wrap.setPointerCapture(e.pointerId); } catch { /* ничего */ }
  if (pointers.size >= 2) {
    startGesture();
    return;
  }
  const i = cellAt(p);
  if (e.pointerType === 'mouse' && e.button === 2) {
    gesture = { mode: 'done' };
    if (i >= 0) secondary(i);
    return;
  }
  if (e.pointerType === 'mouse' && e.button === 1) {
    gesture = { mode: 'done' };
    e.preventDefault();
    if (i >= 0) chordAt(i);
    return;
  }
  if (e.button > 0) return;
  gesture = { mode: 'pending', start: p, view: { ...view }, i, long: 0 };
  showPress(i);
  if (i >= 0 && settings.longPress && e.pointerType !== 'mouse' && !game.over) {
    // кольцо заполняется, пока держишь: видно, когда встанет флажок
    const st = game.cells[i];
    if (st !== OPEN) {
      if (!pressed.includes(i)) pressed.push(i);
      ui.cells[i].classList.add('ms-hold');
    }
    gesture.long = later(() => {
      if (!gesture || gesture.mode !== 'pending' || gesture.i !== i) return;
      gesture.mode = 'done';
      clearPress();
      secondary(i, true);
    }, HOLDS[settings.hold]);
  }
}

function onPointerMove(e) {
  if (e.pointerType === 'mouse' && !pointers.size) {
    const p = localPoint(e);
    hover = cellAt(p);
  }
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, localPoint(e));
  const pts = [...pointers.values()];
  if (gesture.mode === 'pinch' && pts.length >= 2) {
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = Math.max(fitScale, Math.min(maxScale(), gesture.view.s * (dist / gesture.dist)));
    const bx = (gesture.mid.x - gesture.view.tx) / gesture.view.s;
    const by = (gesture.mid.y - gesture.view.ty) / gesture.view.s;
    view = { s, tx: mid.x - bx * s, ty: mid.y - by * s };
    clampView();
    applyView();
    return;
  }
  if (gesture.mode !== 'pending' && gesture.mode !== 'pan') return;
  const p = pts[0];
  const dx = p.x - gesture.start.x;
  const dy = p.y - gesture.start.y;
  if (gesture.mode === 'pending') {
    if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
    clearTimeout(gesture.long);
    timers.delete(gesture.long);
    clearPress();
    gesture.mode = 'pan';
  }
  if (fitScale >= 0.999 && view.s <= 1.001) return;      // поле целиком в окне — двигать нечего
  view = { ...view, tx: gesture.view.tx + dx, ty: gesture.view.ty + dy };
  clampView();
  applyView();
}

function onPointerUp(e) {
  if (!pointers.delete(e.pointerId)) return;
  const g = gesture;
  if (g?.long) {
    clearTimeout(g.long);
    timers.delete(g.long);
  }
  clearPress();
  if (g?.mode === 'pending' && !pointers.size && g.i >= 0 && e.type === 'pointerup') primary(g.i);
  if (pointers.size) startGesture();
  else gesture = null;
}

function onWheel(e) {
  if (modalActive || !game) return;
  if (fitScale >= 0.999 && maxScale() <= 1.001) return;
  e.preventDefault();
  const p = localPoint(e);
  zoomAt(view.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if (modalActive || !game || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.code === 'Space' || e.code === 'KeyF') && hover >= 0) {
    e.preventDefault();
    if (game.cells[hover] === OPEN) chordAt(hover);
    else secondary(hover);
  }
}

/** Основное действие (касание, левая кнопка): открыть или флажок — по режиму; цифра — аккорд. */
function primary(i) {
  if (!game || game.over || finishing) return;
  lastCell = i;
  const st = game.cells[i];
  if (st === OPEN) {
    chordAt(i);
    return;
  }
  if (mode === 'flag') flagAt(i);
  else openAt(i);
}

/** Второе действие (долгое нажатие, правая кнопка): наоборот к режиму. */
function secondary(i, viaLong = false) {
  if (!game || game.over || finishing) return;
  lastCell = i;
  const st = game.cells[i];
  if (st === OPEN) {
    chordAt(i);
    return;
  }
  if (mode === 'flag' && viaLong) openAt(i);
  else flagAt(i);
}

function flagAt(i) {
  clearHint();
  const next = toggleFlag(game, i, settings.marks);
  if (next === null) return;
  game.clicks++;
  paintCell(i);
  paintCounter();
  if (next === FLAG) {
    sfx('flag');
    api.platform.haptic.impact('light');
    if (!reducedMotion()) {
      ui.cells[i].classList.add('ms-plant');
      later(() => ui?.cells[i]?.classList.remove('ms-plant'), 400);
    }
  } else if (next === MARK) {
    sfx('mark');
    api.platform.haptic.selection();
  } else {
    sfx('unflag');
    api.platform.haptic.selection();
  }
  save();
}

function openAt(i) {
  const st = game.cells[i];
  if (st === FLAG) {
    sfx('blocked');
    nudge([i]);
    return;
  }
  clearHint();
  if (!game.mine) {
    const res = placeMines(game, i);
    if (game.noGuess && !res.ng) toast.show(T.noGuessFailed, 3200);
    paintSub();
  }
  game.clicks++;
  const r = reveal(game, i);
  afterOpen(r, i);
}

function chordAt(i) {
  if (!settings.chord || !game.mine || game.over) return;
  clearHint();
  const r = chord(game, i);
  if (r.fail) {
    sfx('blocked');
    nudge(r.cells);
    return;
  }
  if (!r.opened.length && !r.boom) return;
  game.clicks++;
  if (!r.boom) {
    sfx('chord');
    api.platform.haptic.impact('light');
  }
  afterOpen(r, i);
}

/** Мягкая «тряска» клеток: нельзя (касание флажка, флажков не столько, сколько цифра). */
function nudge(cells) {
  api.platform.haptic.notification('warning');
  if (reducedMotion()) return;
  for (const i of cells) {
    const c = ui.cells[i];
    c.classList.remove('ms-nope');
    void c.offsetWidth;
    c.classList.add('ms-nope');
    later(() => c.classList.remove('ms-nope'), 450);
  }
}

function afterOpen(r, from) {
  if (r.boom) {
    loseSequence();
    return;
  }
  if (!r.opened.length) return;
  syncClock();
  const motion = !reducedMotion();
  const step = r.opened.length > 120 ? 14 : 24;
  for (const { i, d } of r.opened) {
    paintCell(i);
    if (motion) {
      const c = ui.cells[i];
      c.style.setProperty('--d', `${Math.min(d * step, 420)}ms`);
      c.classList.add('ms-reveal');
    }
  }
  if (motion) later(() => r.opened.forEach(({ i }) => ui?.cells[i]?.classList.remove('ms-reveal')), 900);
  // осколки «травы» из маленьких открытий
  if (motion && r.opened.length <= 14) dust(r.opened.map((o) => o.i));
  if (r.opened.length === 1) sfx('open');
  else sfx('cascade', { count: r.opened.length });
  if (game.over === 'win') winSequence(from);
  else save();
}

const DUST = {
  classic: ['#c0c0c0', '#ffffff', '#808080'],
  lawn: ['#aad751', '#a2d149', '#8bbd3c'],
  neon: ['#00e5ff', '#7c4dff', '#2bffb0'],
  ice: ['#bfe3ff', '#ffffff', '#9ccff5'],
  candy: ['#ff9ec7', '#ffd1e6', '#c78bff'],
};

function dust(cells) {
  const colors = DUST[settings.skin] ?? [getComputedStyle(document.documentElement).getPropertyValue('--tg-theme-button-color').trim() || '#3390ec'];
  const wr = ui.wrap.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const size = geo.cell * view.s;
  for (const i of cells) {
    const x = wr.left - rr.left + view.tx + ((i % game.w) + 0.5) * size;
    const y = wr.top - rr.top + view.ty + (Math.floor(i / game.w) + 0.5) * size;
    fx.burst(x, y, colors[i % colors.length], 4, { speed: 120 + size * 2, size: Math.max(3, size * 0.16) });
  }
}

// ---------- конец партии ----------

function loseSequence() {
  finishing = true;
  syncClock();
  const ms = elapsed();
  stats = recordGame(stats, game.diff, { win: false });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  const boom = game.boom;
  ensureVisible([boom]);
  paintCell(boom);
  setFace('lose');
  sfx('boom');
  api.platform.haptic.notification('error');
  if (!reducedMotion()) {
    shake(ui.board);
    ui.cells[boom].classList.add('ms-blast');
    const wr = ui.wrap.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const size = geo.cell * view.s;
    const x = wr.left - rr.left + view.tx + ((boom % game.w) + 0.5) * size;
    const y = wr.top - rr.top + view.ty + (Math.floor(boom / game.w) + 0.5) * size;
    fx.burst(x, y, '#ff6b4a', 14, { speed: 260, size: Math.max(4, size * 0.2) });
  }
  // остальные мины и неверные флажки — по очереди, от взрыва наружу
  const bx = boom % game.w;
  const by = Math.floor(boom / game.w);
  const rest = [];
  for (let i = 0; i < game.w * game.h; i++) {
    if (i === boom) continue;
    if ((game.mine[i] && game.cells[i] !== FLAG) || (game.cells[i] === FLAG && !game.mine[i])) rest.push(i);
  }
  const dist = (i) => Math.hypot((i % game.w) - bx, Math.floor(i / game.w) - by);
  rest.sort((a, b) => dist(a) - dist(b));
  const motion = !reducedMotion();
  const gap = motion ? Math.max(12, Math.min(60, 1400 / Math.max(1, rest.length))) : 0;
  rest.forEach((i, k) => {
    const show = () => {
      if (!ui) return;
      paintCell(i);
      if (motion) ui.cells[i].classList.add('ms-pop');
      if (k < 10 && k % 2 === 0) sfx('mine');
    };
    if (motion) later(show, 450 + k * gap);
    else show();
  });
  const total = motion ? 450 + rest.length * gap + 700 : 300;
  later(() => sfx('lose'), Math.min(total, 1400));
  later(() => {
    finishing = false;
    if (!api) return;
    const pct = Math.floor(progressOf(game) * 100);
    api.finish({
      outcome: 'lose', title: T.boom, durationMs: ms, variant: game.diff,
      message: `${T.diffs[game.diff]} · ${T.openedShare(pct)}`,
    });
  }, total);
}

function winSequence(last) {
  finishing = true;
  syncClock();
  const ms = elapsed();
  const row = stats[game.diff];
  const key = game.ng ? 'bestNg' : 'best';
  const prev = row?.[key] ?? 0;
  stats = recordGame(stats, game.diff, { win: true, ms, ng: game.ng });
  const record = game.diff !== 'custom' && (!prev || ms < prev);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sendProgress();
  setFace('win');
  paintCounter();
  const motion = !reducedMotion();
  // флажки на оставшиеся мины и волна по полю от последней клетки
  const lx = last % game.w;
  const ly = Math.floor(last / game.w);
  for (let i = 0; i < game.w * game.h; i++) {
    const changed = paintCell(i);
    if (!motion) continue;
    const d = Math.max(Math.abs((i % game.w) - lx), Math.abs(Math.floor(i / game.w) - ly));
    const c = ui.cells[i];
    c.style.setProperty('--d', `${Math.min(d * 35, 700)}ms`);
    c.classList.add(changed && game.mine[i] ? 'ms-plant-late' : 'ms-wave');
  }
  sfx('win');
  api.platform.haptic.notification('success');
  if (motion) later(() => fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff'], 80), 250);
  const b3 = bbbv(game);
  later(() => {
    finishing = false;
    if (!api) return;
    const best = stats[game.diff]?.[key];
    api.finish({
      outcome: 'win', title: record ? T.record : T.win, durationMs: ms, variant: game.diff,
      message: [T.resultLine(T.diffs[game.diff], b3, Math.round((b3 / Math.max(1, game.clicks)) * 100)),
        game.diff !== 'custom' && best && !record ? T.best(fmtTime(best)) : null].filter(Boolean).join(' · '),
    });
  }, motion ? 1500 : 400);
}

/** Строка меню: лучшее время на самой сложной из пройденных сложностей. */
function sendProgress() {
  for (const d of ['hard', 'medium', 'easy']) {
    const r = stats[d];
    const best = [r.best, r.bestNg].filter(Boolean);
    if (best.length) {
      api.progress(T.menuBest(fmtTime(Math.min(...best)), T.diffShort[d]));
      return;
    }
  }
}

// ---------- подсказка ----------

function clearHint() {
  for (const i of hintMarks) ui?.cells[i]?.classList.remove('ms-hint-safe', 'ms-hint-mine', 'ms-hint-from', 'ms-hint-wrong');
  hintMarks = [];
}

function onHint() {
  if (!game || game.over || finishing) return;
  const h = hintFor(game, lastCell);
  if (h.kind === 'start') {
    toast.show(T.hintStart, 2600);
    sfx('click');
    return;
  }
  if (game.hints <= 0) {
    toast.show(T.noHints, 2000);
    sfx('blocked');
    return;
  }
  clearHint();
  game.hints--;
  paintTools();
  sfx('hint');
  const mark = (i, cls) => {
    ui.cells[i].classList.add(cls);
    hintMarks.push(i);
  };
  let text = '';
  if (h.kind === 'flag') {
    mark(h.i, 'ms-hint-wrong');
    text = T.hintWrongFlag;
  } else if (h.kind === 'guess') {
    mark(h.i, 'ms-hint-safe');
    text = T.hintGuess(Math.round(h.p * 100));
  } else {
    for (const j of h.from) mark(j, 'ms-hint-from');
    mark(h.i, h.kind === 'safe' ? 'ms-hint-safe' : 'ms-hint-mine');
    text = (h.kind === 'safe' ? T.hintSafe : T.hintMine)[h.rule];
  }
  ensureVisible([h.i, ...(h.from ?? [])]);
  toast.show(text, 4200);
  save();
}

// ---------- окна ----------

function openModal(content, closable = true) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => { if (closable && e.target === ui.modal) closeModal(); };
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  root.classList.toggle('ms-paused', started());
  syncClock();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  root.classList.remove('ms-paused');
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  syncClock();
}

function card(title, ...children) {
  return el('div', { class: 'ms-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ms-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ms-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function radios(options, current, onPick, cls = 'ms-option') {
  const buttons = options.map((o) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(o.id === current),
    onclick: () => {
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(options[k].id === o.id)));
      onPick(o.id);
    },
  }, el('b', {}, o.title), o.hint && el('span', {}, o.hint)));
  return el('div', { class: 'ms-options', role: 'radiogroup' }, buttons);
}

function toggle(label, checked, onChange, hint) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'ms-toggle' }, input, el('span', {}, label, hint && el('small', {}, hint)));
}

function slider(label, value, min, max, onInput) {
  const out = el('b', {}, String(value));
  const input = el('input', { type: 'range', min, max, step: 1, value });
  input.addEventListener('input', () => {
    out.textContent = input.value;
    onInput(Number(input.value), input);
  });
  return { row: el('label', { class: 'ms-slider' }, el('span', {}, label, out), input), input, out };
}

function showNewGame(first = false) {
  const draft = normalizeSetup(setup);
  const customBox = el('div', { class: 'ms-custom' });
  const renderCustom = () => {
    const c = draft.custom;
    const dens = el('p', { class: 'ms-note' });
    const sync = () => {
      c.mines = Math.min(c.mines, maxMines(c.w, c.h));
      mines.input.max = String(maxMines(c.w, c.h));
      mines.input.value = String(c.mines);
      mines.out.textContent = String(c.mines);
      const share = c.mines / (c.w * c.h);
      dens.textContent = T.density(Math.round(share * 100)) + (share > NG_DENSITY ? `. ${T.denseNg}` : '');
    };
    const wS = slider(T.width, c.w, LIMITS.min, LIMITS.maxW, (v) => { c.w = v; sync(); });
    const hS = slider(T.height, c.h, LIMITS.min, LIMITS.maxH, (v) => { c.h = v; sync(); });
    const mines = slider(T.mines, c.mines, 1, maxMines(c.w, c.h), (v) => { c.mines = v; sync(); });
    customBox.replaceChildren(wS.row, hS.row, mines.row, dens);
    sync();
  };
  const syncCustom = () => {
    customBox.hidden = draft.diff !== 'custom';
    if (!customBox.hidden && !customBox.firstChild) renderCustom();
  };
  const options = DIFF_IDS.map((id) => {
    if (id === 'custom') return { id, title: T.diffs.custom, hint: `до ${LIMITS.maxW}×${LIMITS.maxH}` };
    const d = DIFFS[id];
    return { id, title: T.diffs[id], hint: `${d.w}×${d.h} · ${T.minesWord(d.mines)}` };
  });
  openModal(card(T.newGame,
    first && el('p', { class: 'ms-note ms-rules' }, T.rules),
    el('h3', { class: 'ms-section' }, T.difficulty),
    radios(options, draft.diff, (id) => { draft.diff = id; syncCustom(); }),
    customBox,
    toggle(T.noGuess, draft.noGuess, (v) => { draft.noGuess = v; }, T.noGuessHint),
    started() && el('p', { class: 'ms-note ms-warn' }, T.abandon),
    el('button', {
      class: 'btn ms-play',
      onclick: () => {
        setup = normalizeSetup(draft);
        api.storage.set('setup', setup);
        abandonIfStarted();
        closeModal();
        startGame();
      },
    }, T.start),
  ));
  syncCustom();
}

/** Начатая и брошенная партия — поражение (иначе серии побед ничего бы не стоили). */
function abandonIfStarted() {
  if (!started()) return;
  stats = recordGame(stats, game.diff, { win: false });
  api.storage.set('stats', stats);
}

function onFace() {
  if (finishing) return;
  if (!started()) {
    startGame();
    return;
  }
  openModal(card(T.restartAsk,
    el('p', { class: 'ms-note' }, T.abandon),
    el('div', { class: 'ms-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.keep),
      el('button', {
        class: 'btn',
        onclick: () => {
          abandonIfStarted();
          closeModal();
          startGame();
        },
      }, T.restart),
    ),
  ));
}

function landscape() {
  const r = ui.wrap.getBoundingClientRect();
  return r.width > r.height * 1.1;
}

function startGame() {
  const size = sizeOf(setup, landscape());
  game = newGame({ diff: setup.diff, ...size, noGuess: setup.noGuess });
  runSince = 0;
  waitTouch = false;
  finishing = false;
  lastCell = -1;
  hintMarks = [];
  setFace('normal');
  buildBoard();
  intro();
  sfx('start');
  save();
}

function intro() {
  if (reducedMotion()) return;
  animate(ui.board, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
}

function showStats() {
  const box = el('div', {});
  const tile = (value, label) => el('div', { class: 'ms-tile' }, el('b', {}, value), el('span', {}, label));
  const render = (d) => {
    const r = stats[d];
    const pct = r.played ? Math.round((r.wins / r.played) * 100) : 0;
    box.replaceChildren(el('div', { class: 'ms-tiles' },
      tile(String(r.played), T.played),
      tile(`${r.wins} · ${pct}%`, T.wins),
      tile(r.best ? fmtTime(r.best) : '—', T.bestTime),
      tile(r.bestNg ? fmtTime(r.bestNg) : '—', T.bestNg),
      tile(String(r.streak), T.streak),
      tile(String(r.bestStreak), T.bestStreak),
    ));
  };
  const current = game?.diff ?? 'easy';
  const tabs = DIFF_IDS.map((d) => el('button', {
    class: 'ms-tab', role: 'tab', 'aria-selected': String(d === current),
    onclick: () => {
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(DIFF_IDS[k] === d)));
      render(d);
    },
  }, T.diffs[d]));
  render(current);
  openModal(card(T.stats, el('div', { class: 'ms-tabs', role: 'tablist' }, tabs), box));
}

function saveSettings() {
  api.storage.set('settings', settings);
}

function applySkin() {
  host.dataset.skin = settings.skin;
  rendered = rendered.map(() => '');
  paintAll();
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'ms-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      skins.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === id)));
      applySkin();
    },
  }, el('span', { class: 'ms-swatch' },
    el('i', { class: 'ms-sw-closed' }), el('i', { class: 'ms-sw-open ms-n1' }, '1'), el('i', { class: 'ms-sw-open ms-n2' }, '2'), el('i', { class: 'ms-sw-closed ms-sw-flag' })),
  T.skins[id]));
  skins.forEach((b) => { b.querySelector('.ms-sw-flag').innerHTML = FLAG_SVG; });
  openModal(card(T.settings,
    el('h3', { class: 'ms-section' }, T.skin),
    el('div', { class: 'ms-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'ms-section' }, T.size),
    radios(SIZES.map((id) => ({ id, title: T.sizes[id] })), settings.size, (id) => {
      settings.size = id;
      saveSettings();
      measure(true);
    }, 'ms-option ms-option-sm'),
    el('p', { class: 'ms-note' }, T.sizeHint),
    toggle(T.longPress, settings.longPress, (v) => { settings.longPress = v; saveSettings(); }),
    el('h3', { class: 'ms-section' }, T.hold),
    radios(Object.keys(HOLDS).map((id) => ({ id, title: T.holds[id], hint: `${HOLDS[id] / 1000} с`.replace('.', ',') })), settings.hold, (id) => {
      settings.hold = id;
      saveSettings();
      root.style.setProperty('--hold', `${HOLDS[id]}ms`);
    }, 'ms-option ms-option-sm'),
    toggle(T.chordSetting, settings.chord, (v) => { settings.chord = v; saveSettings(); }),
    toggle(T.marks, settings.marks, (v) => { settings.marks = v; saveSettings(); }),
  ));
}

function iconButton(icon, label, onclick, cls = 'ms-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  sfx('mode');
  api.platform.haptic.selection();
  paintTools();
}

function onVisibility() {
  if (document.visibilityState !== 'visible') save();
  syncClock();
}

export default {
  id: 'minesweeper',
  title: 'Сапёр',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSetup, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('setup'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? { ...emptyStats(), ...savedStats } : emptyStats();
    settings = normalizeSettings(savedSettings);
    setup = normalizeSetup(savedSetup);
    host.dataset.skin = settings.skin;

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      sfx('click');
    });
    const modeBtn = (id, icon, label) => {
      const b = el('button', { class: 'ms-mode', 'aria-pressed': 'false', onclick: () => setMode(id), onmousedown: (e) => e.preventDefault() },
        el('span', { class: 'ms-mode-icon' }), el('span', {}, label));
      b.firstChild.innerHTML = icon;
      return b;
    };
    ui = {
      sub: el('div', { class: 'ms-sub' }),
      counter: el('span', { class: 'ms-num' }),
      clock: el('span', { class: 'ms-num' }),
      face: el('button', { class: 'ms-face', 'aria-label': T.face, title: T.face, onclick: onFace }),
      board: el('div', { class: 'ms-board' }),
      modal: el('div', { class: 'ms-modal', hidden: true }),
      digBtn: modeBtn('dig', ICONS.dig, T.dig),
      flagBtn: modeBtn('flag', ICONS.flag, T.flag),
      hintBadge: el('span', { class: 'ms-badge' }, String(HINTS)),
    };
    ui.hintBtn = el('button', { class: 'ms-hint-btn', onclick: onHint, onmousedown: (e) => e.preventDefault(), 'aria-label': T.hint, title: T.hint },
      el('span', { class: 'ms-mode-icon' }), el('span', {}, T.hint), ui.hintBadge);
    ui.hintBtn.firstChild.innerHTML = ICONS.hint;
    ui.zoomFit = el('button', { class: 'ms-zoom-btn ms-zoom-fit', onclick: zoomToggle });
    ui.zoom = el('div', { class: 'ms-zoom', hidden: true },
      el('button', { class: 'ms-zoom-btn', 'aria-label': T.zoom.out, title: T.zoom.out, onclick: () => zoomStep(1 / 1.3) }, '−'),
      el('button', { class: 'ms-zoom-btn', 'aria-label': T.zoom.in, title: T.zoom.in, onclick: () => zoomStep(1.3) }, '+'),
      ui.zoomFit,
    );
    ui.wrap = el('div', { class: 'ms-wrap' }, ui.board);
    ui.tools = el('div', { class: 'ms-tools' },
      el('div', { class: 'ms-modes', role: 'group' }, ui.digBtn, ui.flagBtn),
      ui.hintBtn,
    );
    const counterIcon = el('span', { class: 'ms-counter-icon' });
    counterIcon.innerHTML = MINE_SVG;
    const clockIcon = el('span', { class: 'ms-counter-icon' });
    clockIcon.innerHTML = ICONS.clock;
    root = el('div', { class: 'ms' },
      el('div', { class: 'ms-header' },
        el('div', { class: 'ms-head-text' }, el('div', { class: 'ms-title' }, T.title), ui.sub),
        el('div', { class: 'ms-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, () => showNewGame()),
        ),
      ),
      el('div', { class: 'ms-bar' },
        el('div', { class: 'ms-counter', title: T.minesLeft }, counterIcon, ui.counter),
        ui.face,
        el('div', { class: 'ms-counter ms-counter-time', title: T.timer }, clockIcon, ui.clock),
      ),
      el('div', { class: 'ms-stage' }, ui.wrap, ui.zoom),
      ui.tools,
      ui.modal,
      toast.el,
    );
    container.append(root);
    root.style.setProperty('--hold', `${HOLDS[settings.hold]}ms`);
    fx = createFx(root, 'ms-fx');
    root.append(fx.canvas);

    ui.wrap.addEventListener('pointerdown', onPointerDown);
    ui.wrap.addEventListener('pointermove', onPointerMove);
    ui.wrap.addEventListener('pointerup', onPointerUp);
    ui.wrap.addEventListener('pointercancel', onPointerUp);
    ui.wrap.addEventListener('pointerleave', () => { hover = -1; });
    ui.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.wrap.addEventListener('wheel', onWheel, { passive: false });
    // долгое нажатие на айфоне не должно включать выделение и лупу
    ui.wrap.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    ui.wrap.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    resizeObs = new ResizeObserver(() => { if (game) measure(false); });
    resizeObs.observe(ui.wrap);
    clockTimer = setInterval(paintClock, 250);

    const restored = deserialize(saved);
    if (restored && !restored.over) {
      game = restored;
      waitTouch = Boolean(game.mine);
      setFace('normal');
      buildBoard();
      intro();
    } else if (!savedSetup) {
      startGame();
      showNewGame(true);
    } else startGame();
    sendProgress();

    // для проверки (страница-обёртка): ?msdebug в адресе
    if (new URLSearchParams(location.search).has('msdebug')) {
      window.__ms = {
        get game() { return game; },
        get view() { return view; },
        get geo() { return geo; },
        start: (next) => { setup = normalizeSetup({ ...setup, ...next }); closeModal(); startGame(); },
        tap: (i) => primary(i),
        flag: (i) => secondary(i),
        mode: (m) => setMode(m),
        hint: () => onHint(),
        skin: (id) => { settings.skin = id; applySkin(); },
        size: (id) => { settings.size = id; measure(true); },
        /** Открыть все безопасные клетки, кроме last (для проверки победы). */
        solveExcept: (last = -1) => {
          for (let i = 0; i < game.w * game.h; i++) if (!game.mine[i] && i !== last && game.cells[i] !== OPEN) { game.cells[i] = OPEN; }
          rendered = rendered.map(() => '');
          paintAll();
        },
      };
    }
  },

  getState() {
    if (!started()) return null;
    save();
    return { open: Math.round(progressOf(game) * 100) };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    clearInterval(clockTimer);
    resizeObs?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) {
      delete host.dataset.skin;
      host.style.removeProperty('--cell');
    }
    api = host = root = ui = toast = fx = game = resizeObs = null;
    modalActive = finishing = waitTouch = false;
    pointers = new Map();
    gesture = null;
    rendered = [];
    hintMarks = [];
    pressed = [];
    lastCell = hover = -1;
    runSince = 0;
    clockTimer = 0;
    mode = 'dig';
  },
};
