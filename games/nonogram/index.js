// Японский кроссворд (нонограмма): над столбцами и слева от строк — длины отрезков подряд закрашенных клеток;
// закрашиваешь по логике — получается картинка. 100 уровней от 5×5 до 20×20 (levels.js), у каждого — цветной
// рисунок, который проявляется после решения. Правила — logic.js, разбор линий — solver.js, звуки — sounds.js.
//
// Экраны: карта уровней (миниатюры решённых картинок, «?» у нерешённых) и уровень. Поле: четыре слоя — угол
// (миниатюра того, что уже закрашено), числа сверху, числа слева и сетка; числа «липнут» к краям, когда большое
// поле приближено и сдвинуто. Одним пальцем — кисть: касание закрашивает (или ставит крестик — по инструменту),
// протяжка красит линию (строку или столбец — по первому сдвигу), начатая на закрашенной клетке — стирает. Двумя
// пальцами — сдвиг и масштаб; колесо мыши — масштаб; правая кнопка — крестик.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { LEVELS, SECTIONS } from './levels.js';
import {
  EMPTY, FILL, CROSS, HINTS, SKINS, prepare, newRun, setCell, undoChanges, brushValue, doneClues, autoCross,
  isSolved, hintLine, serializeRun, deserializeRun, emptyProgress, normalizeProgress, recordSolve, solvedCount,
  isOpen, normalizeSettings, fmtTime,
} from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const T = {
  title: 'Японский кроссворд',
  short: 'Нонограмма',
  solved: (n, all) => `Решено ${n} из ${all}`,
  level: (k) => `Уровень ${k}`,
  levelOf: (k, w, h) => `Уровень ${k} · ${w}×${h}`,
  mistakes: 'Ошибки',
  fill: 'Закрасить',
  cross: 'Крестик',
  hint: 'Подсказка',
  noHints: 'Подсказки закончились',
  hintNone: 'Новых выводов по линиям нет — закрась то, в чём уверен',
  hintWrong: 'Красным — клетки, которые стоят не так',
  hintLine: (kind, k) => (kind === 'row' ? `Строка ${k + 1}: эти клетки выводятся из чисел` : `Столбец ${k + 1}: эти клетки выводятся из чисел`),
  undo: 'Отменить',
  back: 'К уровням',
  map: 'Уровни',
  settings: 'Настройки',
  close: 'Закрыть',
  rules: 'Числа слева от строки и над столбцом — длины отрезков подряд закрашенных клеток, по порядку. Между отрезками — хотя бы одна пустая клетка. Закрашивай то, что точно закрашено, крестиком отмечай то, что точно пусто. Всё сошлось — получится картинка.',
  rulesTitle: 'Как играть',
  gotIt: 'Понятно',
  check: 'Проверять ходы сразу',
  checkHint: 'Ошибка видна сразу и считается; без проверки — как на бумаге',
  autoCross: 'Ставить крестики в решённых линиях',
  highlight: 'Подсвечивать строку и столбец под пальцем',
  skin: 'Оформление',
  skins: { telegram: 'По умолчанию', paper: 'Тетрадь', night: 'Ночь', mint: 'Мята', sakura: 'Сакура', classic: 'Классика' },
  winTitle: 'Готово!',
  winIs: (t) => `Это — ${t}`,
  winTime: (t) => `Время ${t}`,
  winMistakes: (n) => (n ? `Ошибок: ${n}` : 'Без ошибок'),
  clean: 'Чисто — без ошибок и подсказок',
  next: 'Дальше',
  toMap: 'К уровням',
  locked: 'Реши ещё пару уровней перед ним — и он откроется',
  continue: 'продолжить',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  zoom: { in: 'Приблизить', out: 'Отдалить', fit: 'Всё поле', big: 'Крупно' },
  progress: (n) => `Решено: ${n} из 100`,
  restart: 'Начать заново',
  restartAsk: 'Стереть всё на этом уровне и начать заново?',
  yes: 'Начать заново',
  no: 'Отмена',
};

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  back: svgIcon('<path d="M15 18l-6-6 6-6"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  fill: svgIcon('<rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/>'),
  cross: svgIcon('<path d="M6 6l12 12M18 6 6 18"/>'),
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  lock: svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

const MIN_CELL = 26;          // px — клетку мельче не делаем: большое поле приближено и двигается двумя пальцами
const MAX_CELL = 46;
const ZOOM_CELL = 56;
const SECOND_FINGER_MS = 260; // второй палец так быстро после первого — это жест масштаба, а не кисть

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let progress = emptyProgress(LEVELS.length);
let settings = normalizeSettings(null);
let soundOn = true;
let screen = 'map';
let level = null;             // данные уровня
let levelNo = -1;
let run = null;               // партия
let history = [];             // отмена: массивы изменений
let tool = FILL;
let modalActive = false;
let modalToken = 0;
let geo = null;               // { c, w, h, lw, th }
let view = { s: 1, tx: 0, ty: 0 };
let fitScale = 1;
let pointers = new Map();
let stroke = null;
let gesture = null;
let runSince = 0;
let clockTimer = 0;
let winning = false;
let hintMarks = [];
let resizeObs = null;
let doneCache = null;
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

// ---------- время ----------

const elapsed = () => (run ? run.time + (runSince ? performance.now() - runSince : 0) : 0);

function syncClock() {
  const go = screen === 'level' && run && !run.done && !winning && !modalActive && document.visibilityState === 'visible';
  if (go && !runSince) runSince = performance.now();
  if (!go && runSince) {
    run.time += performance.now() - runSince;
    runSince = 0;
  }
  paintClock();
}

function paintClock() {
  if (!ui?.clock || !run) return;
  const text = fmtTime(elapsed());
  if (ui.clock.textContent !== text) ui.clock.textContent = text;
}

const saveRun = () => {
  if (!api || !run) return;
  if (run.done || !run.cells.some((c) => c !== EMPTY)) api.storage.remove('run');
  else api.storage.set('run', serializeRun({ ...run, time: elapsed() }));
};

const saveProgress = () => api.storage.set('progress', progress);

function sendProgress() {
  api.progress(T.progress(solvedCount(progress)));
}

// ---------- карта уровней ----------

/** Миниатюра рисунка уровня на холсте: цветная (решён) или силуэт того, что закрашено в начатой партии. */
function thumb(lvl, size, cells = null) {
  const { w, h } = prepare(lvl);
  const canvas = el('canvas', { class: 'ng-thumb' });
  const px = Math.max(1, Math.floor(size / Math.max(w, h)));
  canvas.width = w * px;
  canvas.height = h * px;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = lvl.art[y][x];
      if (cells) {
        if (cells[y * w + x] !== FILL) continue;
        ctx.fillStyle = getComputedStyle(root).getPropertyValue('--ng-fill').trim() || '#333';
      } else {
        if (ch === '.') continue;
        ctx.fillStyle = lvl.pal[ch];
      }
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  return canvas;
}

function showMap(scrollTo = -1) {
  screen = 'map';
  clearTimers();
  syncClock();
  ui.view.replaceChildren();
  const saved = ui.savedRun;
  const head = el('div', { class: 'ng-header' },
    el('div', { class: 'ng-head-text' }, el('div', { class: 'ng-title' }, T.title), el('div', { class: 'ng-sub' }, T.solved(solvedCount(progress), LEVELS.length))),
    el('div', { class: 'ng-actions' },
      iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, toggleSound, 'ng-icon-btn ng-sound'),
      iconButton(ICONS.help, T.rulesTitle, showRules),
      iconButton(ICONS.gear, T.settings, showSettings),
    ),
  );
  const list = el('div', { class: 'ng-map' });
  let target = null;
  for (const sec of SECTIONS) {
    const tiles = [];
    for (let k = sec.from; k <= sec.to; k++) {
      const lvl = LEVELS[k];
      const { w, h } = prepare(lvl);
      const done = progress.done[k];
      const open = isOpen(progress, k);
      const inRun = saved?.id === k;
      const tile = el('button', {
        class: `ng-tile${done ? ' ng-done' : ''}${open ? '' : ' ng-locked'}${done === 2 ? ' ng-clean' : ''}`,
        onclick: () => (open ? startLevel(k) : (toast.show(T.locked, 2200), sfx('click'))),
      });
      const pic = el('div', { class: 'ng-tile-pic' });
      if (done) pic.append(thumb(lvl, 72));
      else if (inRun) pic.append(thumb(lvl, 72, [...saved.cells].map(Number)));
      else {
        pic.innerHTML = open ? '' : ICONS.lock;
        if (open) pic.append(el('b', { class: 'ng-q' }, '?'));
      }
      tile.append(pic, el('span', { class: 'ng-tile-name' }, done ? lvl.title : `${k + 1} · ${w}×${h}`));
      if (inRun && !done) tile.append(el('span', { class: 'ng-badge' }, T.continue));
      tiles.push(tile);
      if (k === scrollTo) target = tile;
    }
    list.append(el('h3', { class: 'ng-section' }, sec.title, el('span', {}, sec.hint)), el('div', { class: 'ng-tiles' }, tiles));
  }
  const body = el('div', { class: 'ng-map-scroll' }, list);
  ui.view.append(head, body);
  if (!reducedMotion()) animate(body, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  // к первому нерешённому открытому уровню (или к только что решённому)
  if (!target) {
    const first = LEVELS.findIndex((_, k) => !progress.done[k] && isOpen(progress, k));
    target = first >= 0 ? body.querySelectorAll('.ng-tile')[first] : null;
  }
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
}

// ---------- уровень ----------

function startLevel(k) {
  sfx('open');
  levelNo = k;
  level = LEVELS[k];
  const saved = ui.savedRun?.id === k ? deserializeRun(ui.savedRun, LEVELS) : null;
  run = saved && !saved.done ? saved : newRun(level, k);
  history = [];
  winning = false;
  hintMarks = [];
  screen = 'level';
  buildLevel();
  syncClock();
  saveRun();
  ui.savedRun = serializeRun(run);
}

function buildLevel() {
  const { w, h, clues } = prepare(level);
  ui.view.replaceChildren();
  ui.mistakes = el('b', {}, String(run.mistakes));
  ui.clock = el('b', {}, fmtTime(run.time));
  ui.hintBadge = el('span', { class: 'ng-badge-n' }, String(run.hints));
  ui.undoBtn = iconButton(ICONS.undo, T.undo, onUndo);
  const head = el('div', { class: 'ng-header' },
    iconButton(ICONS.back, T.back, leaveLevel, 'ng-icon-btn ng-back'),
    el('div', { class: 'ng-head-text' }, el('div', { class: 'ng-title' }, T.level(levelNo + 1)), el('div', { class: 'ng-sub' }, `${w}×${h}`)),
    el('div', { class: 'ng-actions' },
      iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, toggleSound, 'ng-icon-btn ng-sound'),
      ui.undoBtn,
      iconButton(ICONS.restart, T.restart, askRestart),
      iconButton(ICONS.gear, T.settings, showSettings),
    ),
  );
  const bar = el('div', { class: 'ng-bar' },
    el('span', { class: 'ng-stat', hidden: !settings.check }, `${T.mistakes}: `, ui.mistakes),
    el('span', { class: 'ng-stat ng-stat-time' }, ui.clock),
  );
  // поле: угол, числа сверху, числа слева, сетка
  const lw = Math.max(1, ...clues.rows.map((c) => c.length));
  const th = Math.max(1, ...clues.cols.map((c) => c.length));
  geo = { w, h, lw, th, c: 30 };
  ui.grid = el('div', { class: 'ng-grid' });
  ui.grid.style.setProperty('--w', String(w));
  ui.cells = [];
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    const cell = el('div', { class: `ng-cell${x % 5 === 4 && x < w - 1 ? ' ng-r5' : ''}${y % 5 === 4 && y < h - 1 ? ' ng-b5' : ''}` });
    ui.cells.push(cell);
    ui.grid.append(cell);
  }
  ui.top = el('div', { class: 'ng-top' });
  ui.colClues = clues.cols.map((c, x) => {
    const col = el('div', { class: `ng-col${x % 5 === 4 && x < w - 1 ? ' ng-r5' : ''}` },
      ...(c.length ? c : [0]).map((n) => el('span', {}, String(n))));
    ui.top.append(col);
    return col;
  });
  ui.left = el('div', { class: 'ng-left' });
  ui.rowClues = clues.rows.map((c, y) => {
    const row = el('div', { class: `ng-row${y % 5 === 4 && y < h - 1 ? ' ng-b5' : ''}` },
      ...(c.length ? c : [0]).map((n) => el('span', {}, String(n))));
    ui.left.append(row);
    return row;
  });
  ui.corner = el('div', { class: 'ng-corner' });
  ui.preview = el('canvas', { class: 'ng-preview', width: w, height: h });
  ui.corner.append(ui.preview);
  ui.counter = el('div', { class: 'ng-counter', hidden: true });
  ui.zoomFit = el('button', { class: 'ng-zoom-btn ng-zoom-fit', onclick: zoomToggle });
  ui.zoom = el('div', { class: 'ng-zoom', hidden: true },
    el('button', { class: 'ng-zoom-btn', 'aria-label': T.zoom.out, title: T.zoom.out, onclick: () => zoomStep(1 / 1.3) }, '−'),
    el('button', { class: 'ng-zoom-btn', 'aria-label': T.zoom.in, title: T.zoom.in, onclick: () => zoomStep(1.3) }, '+'),
    ui.zoomFit,
  );
  ui.wrap = el('div', { class: 'ng-wrap' }, ui.grid, ui.top, ui.left, ui.corner, ui.counter);
  ui.stage = el('div', { class: 'ng-stage' }, ui.wrap, ui.zoom);
  ui.fillBtn = toolButton(ICONS.fill, T.fill, () => setTool(FILL));
  ui.crossBtn = toolButton(ICONS.cross, T.cross, () => setTool(CROSS));
  ui.hintBtn = el('button', { class: 'ng-hint-btn', onclick: onHint, onmousedown: (e) => e.preventDefault(), 'aria-label': T.hint, title: T.hint },
    el('span', { class: 'ng-tool-icon' }), el('span', {}, T.hint), ui.hintBadge);
  ui.hintBtn.firstChild.innerHTML = ICONS.hint;
  ui.tools = el('div', { class: 'ng-tools' }, el('div', { class: 'ng-modes' }, ui.fillBtn, ui.crossBtn), ui.hintBtn);
  ui.view.append(head, bar, ui.stage, ui.tools);

  ui.wrap.addEventListener('pointerdown', onPointerDown);
  ui.wrap.addEventListener('pointermove', onPointerMove);
  ui.wrap.addEventListener('pointerup', onPointerUp);
  ui.wrap.addEventListener('pointercancel', onPointerUp);
  ui.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.wrap.addEventListener('wheel', onWheel, { passive: false });
  ui.wrap.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  resizeObs?.disconnect();
  resizeObs = new ResizeObserver(() => { if (screen === 'level') measure(false); });
  resizeObs.observe(ui.stage);
  measure(true);
  paintTools();
  paintAll();
  if (!reducedMotion()) animate(ui.wrap, [{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
}

function paintTools() {
  ui.fillBtn.setAttribute('aria-pressed', String(tool === FILL));
  ui.crossBtn.setAttribute('aria-pressed', String(tool === CROSS));
  ui.hintBadge.textContent = String(run.hints);
  ui.undoBtn.disabled = !history.length;
}

function paintCell(i) {
  const c = run.cells[i];
  const node = ui.cells[i];
  const wrong = run.wrong.includes(i);
  const cls = c === FILL ? 'ng-f' : c === CROSS ? 'ng-x' : '';
  node.classList.toggle('ng-f', cls === 'ng-f');
  node.classList.toggle('ng-x', cls === 'ng-x');
  node.classList.toggle('ng-wrong', wrong);
}

function paintAll() {
  for (let i = 0; i < run.cells.length; i++) paintCell(i);
  paintClues();
  paintPreview();
  ui.mistakes.textContent = String(run.mistakes);
  paintClock();
}

/** Погасить выполненные числа; линии, где погасли все, — отмечены целиком. → сколько линий стало решено. */
function paintClues() {
  const d = doneClues(run, level);
  let newly = 0;
  const apply = (nodes, flags, prev) => nodes.forEach((node, k) => {
    const spans = node.children;
    flags[k].forEach((f, q) => spans[q]?.classList.toggle('ng-done', f));
    const all = flags[k].length ? flags[k].every(Boolean) : isEmptyLineDone(k, nodes === ui.rowClues);
    if (all && prev && !prev[k]) newly++;
    node.classList.toggle('ng-line-done', all);
  });
  const prevRows = doneCache?.rows.map((f) => f.length && f.every(Boolean));
  const prevCols = doneCache?.cols.map((f) => f.length && f.every(Boolean));
  apply(ui.rowClues, d.rows, prevRows);
  apply(ui.colClues, d.cols, prevCols);
  doneCache = d;
  return newly;
}

/** Пустая линия (число 0) решена, когда в ней нет закрашенных и все клетки — крестики. */
function isEmptyLineDone(k, isRow) {
  const { w, h } = geo;
  const idx = isRow ? Array.from({ length: w }, (_, x) => k * w + x) : Array.from({ length: h }, (_, y) => y * w + k);
  return idx.every((i) => run.cells[i] === CROSS);
}

function paintPreview() {
  const ctx = ui.preview.getContext('2d');
  const { w, h } = geo;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(root).getPropertyValue('--ng-fill').trim() || '#333';
  for (let i = 0; i < w * h; i++) if (run.cells[i] === FILL) ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
}

// ---------- размеры и масштаб ----------

function stageSize() {
  const r = ui.stage.getBoundingClientRect();
  return { W: r.width, H: r.height, left: r.left, top: r.top };
}

/** Размер клетки: поле с числами целиком в окне, но не мельче MIN_CELL — тогда приближено и двигается. */
function measure(reset = false) {
  const { W, H } = stageSize();
  if (W < 10 || H < 10) return;
  const { w, h, lw, th } = geo;
  // числа чуть уже клетки — экономят место
  const k = 0.82;
  const fit = Math.min(W / (w + lw * k), H / (h + th * k));
  const c = Math.floor(Math.min(MAX_CELL, Math.max(fit, MIN_CELL)) * 4) / 4;
  geo.c = c;
  geo.cl = c * k;
  host.style.setProperty('--cell', `${c}px`);
  host.style.setProperty('--clue', `${geo.cl}px`);
  geo.cw = lw * geo.cl + w * c;
  geo.ch = th * geo.cl + h * c;
  ui.grid.style.width = `${w * c}px`;
  ui.grid.style.height = `${h * c}px`;
  ui.top.style.width = `${w * c}px`;
  ui.top.style.height = `${th * geo.cl}px`;
  ui.left.style.width = `${lw * geo.cl}px`;
  ui.left.style.height = `${h * c}px`;
  ui.corner.style.width = `${lw * geo.cl}px`;
  ui.corner.style.height = `${th * geo.cl}px`;
  fitScale = Math.min(1, W / geo.cw, H / geo.ch);
  if (reset) view = { s: 1, tx: (W - geo.cw) / 2, ty: (H - geo.ch) / 2 };
  else view.s = Math.max(fitScale, Math.min(maxScale(), view.s));
  clampView();
  applyView();
}

const maxScale = () => Math.max(1, ZOOM_CELL / geo.c);

function clampView() {
  const { W, H } = stageSize();
  const bw = geo.cw * view.s;
  const bh = geo.ch * view.s;
  view.tx = bw <= W ? (W - bw) / 2 : Math.min(0, Math.max(W - bw, view.tx));
  view.ty = bh <= H ? (H - bh) / 2 : Math.min(0, Math.max(H - bh, view.ty));
}

/** Слои: числа «липнут» к краям окна, когда поле сдвинуто. */
function applyView() {
  const { s, tx, ty } = view;
  const ox = geo.lw * geo.cl * s;
  const oy = geo.th * geo.cl * s;
  const set = (node, x, y) => { node.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
  set(ui.grid, tx + ox, ty + oy);
  set(ui.top, tx + ox, Math.max(ty, 0));
  set(ui.left, Math.max(tx, 0), ty + oy);
  set(ui.corner, Math.max(tx, 0), Math.max(ty, 0));
  const zoomable = fitScale < 0.999 || view.s > 1.001;
  ui.zoom.hidden = !zoomable;
  ui.zoomFit.textContent = view.s > fitScale + 0.01 ? T.zoom.fit : T.zoom.big;
}

function smooth() {
  if (reducedMotion()) return;
  for (const n of [ui.grid, ui.top, ui.left, ui.corner]) n.style.transition = 'transform 0.25s ease';
  later(() => { if (ui?.grid) for (const n of [ui.grid, ui.top, ui.left, ui.corner]) n.style.transition = ''; }, 260);
}

function zoomAt(s, cx, cy, animated = false) {
  const next = Math.max(fitScale, Math.min(maxScale(), s));
  const bx = (cx - view.tx) / view.s;
  const by = (cy - view.ty) / view.s;
  view = { s: next, tx: cx - bx * next, ty: cy - by * next };
  clampView();
  if (animated) smooth();
  applyView();
}

function zoomStep(f) {
  const { W, H } = stageSize();
  zoomAt(view.s * f, W / 2, H / 2, true);
  sfx('click');
}

function zoomToggle() {
  const { W, H } = stageSize();
  zoomAt(view.s > fitScale + 0.01 ? fitScale : 1, W / 2, H / 2, true);
  sfx('click');
}

function local(e) {
  const { left, top } = stageSize();
  return { x: e.clientX - left, y: e.clientY - top };
}

/** Клетка сетки под точкой окна; −1 — мимо или на числах (они поверх сетки). */
function cellAt(p, clampToGrid = false) {
  const { s, tx, ty } = view;
  const ox = tx + geo.lw * geo.cl * s;
  const oy = ty + geo.th * geo.cl * s;
  if (!clampToGrid) {
    const leftEdge = Math.max(tx, 0) + geo.lw * geo.cl * s;
    const topEdge = Math.max(ty, 0) + geo.th * geo.cl * s;
    if (p.x < leftEdge || p.y < topEdge) return -1;
  }
  let x = Math.floor((p.x - ox) / (geo.c * s));
  let y = Math.floor((p.y - oy) / (geo.c * s));
  if (clampToGrid) {
    x = Math.max(0, Math.min(geo.w - 1, x));
    y = Math.max(0, Math.min(geo.h - 1, y));
  }
  if (x < 0 || y < 0 || x >= geo.w || y >= geo.h) return -1;
  return y * geo.w + x;
}

// ---------- кисть ----------

function highlight(i) {
  ui.wrap.querySelectorAll('.ng-hl').forEach((n) => n.classList.remove('ng-hl'));
  if (i < 0 || !settings.highlight) return;
  const x = i % geo.w;
  const y = Math.floor(i / geo.w);
  ui.rowClues[y].classList.add('ng-hl');
  ui.colClues[x].classList.add('ng-hl');
  for (let k = 0; k < geo.w; k++) ui.cells[y * geo.w + k].classList.add('ng-hl');
  for (let k = 0; k < geo.h; k++) ui.cells[k * geo.w + x].classList.add('ng-hl');
}

function startStroke(i, useTool, p) {
  const start = run.cells[i];
  const value = brushValue(start, useTool);
  const erasing = value === EMPTY ? start : 0;
  stroke = { start: i, axis: null, value, erasing, changes: [], cells: new Set(), t0: performance.now(), p0: p, last: i, stopped: false };
  applyStroke([i]);
  highlight(i);
}

/** Применить кисть к клеткам (по порядку); ошибка останавливает протяжку. */
function applyStroke(cells) {
  let filled = 0;
  for (const i of cells) {
    if (stroke.stopped || stroke.cells.has(i)) continue;
    stroke.cells.add(i);
    const cur = run.cells[i];
    if (stroke.erasing ? cur !== stroke.erasing : cur !== EMPTY) continue;
    if (stroke.erasing && run.wrong.includes(i)) continue;
    const ch = setCell(run, level, i, stroke.value, { check: settings.check });
    if (!ch) continue;
    stroke.changes.push(ch);
    paintCell(i);
    if (ch.mistake) {
      stroke.stopped = true;
      onMistake(i);
      break;
    }
    filled++;
    if (ch.to === FILL) {
      pop(i);
      sfx('fill', { step: stroke.changes.length - 1 }, 25);
    } else if (ch.to === CROSS) sfx('cross', {}, 25);
    else sfx('erase', {}, 40);
  }
  if (filled) {
    paintClues();
    paintPreview();
  }
  showCounter();
}

function pop(i) {
  if (reducedMotion()) return;
  const c = ui.cells[i];
  c.classList.remove('ng-pop');
  void c.offsetWidth;
  c.classList.add('ng-pop');
}

function showCounter() {
  if (!stroke || stroke.cells.size < 2) {
    ui.counter.hidden = true;
    return;
  }
  const i = stroke.last;
  const { s, tx, ty } = view;
  const x = tx + geo.lw * geo.cl * s + ((i % geo.w) + 0.5) * geo.c * s;
  const y = ty + geo.th * geo.cl * s + Math.floor(i / geo.w) * geo.c * s;
  ui.counter.hidden = false;
  ui.counter.textContent = String(stroke.cells.size);
  ui.counter.style.transform = `translate(${x}px, ${y - 46}px) translateX(-50%)`;
}

function onMistake(i) {
  ui.mistakes.textContent = String(run.mistakes);
  sfx('mistake', {}, 0);
  api.platform.haptic.notification('error');
  if (!reducedMotion()) {
    shake(ui.cells[i]);
    animate(ui.mistakes, [{ transform: 'scale(1.4)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }
}

function endStroke() {
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  ui.counter.hidden = true;
  highlight(-1);
  if (!s.changes.length) return;
  // автокрестики в задетых строках и столбцах
  if (settings.autoCross) {
    const lines = new Set();
    for (const c of s.changes) {
      lines.add(`row:${Math.floor(c.i / geo.w)}`);
      lines.add(`col:${c.i % geo.w}`);
    }
    const added = autoCross(run, level, [...lines].map((l) => {
      const [kind, k] = l.split(':');
      return [kind, Number(k)];
    }), { check: settings.check });
    for (const i of added) {
      s.changes.push({ i, from: EMPTY, to: CROSS, mistake: false });
      paintCell(i);
      if (!reducedMotion()) {
        ui.cells[i].classList.add('ng-auto');
        later(() => ui?.cells?.[i]?.classList.remove('ng-auto'), 500);
      }
    }
    if (added.length) sfx('auto');
  }
  history.push(s.changes);
  if (history.length > 300) history.shift();
  const solvedLines = paintClues();
  if (solvedLines) {
    sfx('line', { count: solvedLines }, 0);
    api.platform.haptic.impact('light');
  }
  paintPreview();
  paintTools();
  clearHint();
  if (isSolved(run, level)) win();
  else saveRun();
}

function onPointerDown(e) {
  if (modalActive || winning || screen !== 'level') return;
  audio.get();
  const p = local(e);
  pointers.set(e.pointerId, p);
  try { ui.wrap.setPointerCapture(e.pointerId); } catch { /* ничего */ }
  if (pointers.size >= 2) {
    // второй палец сразу после первого — это жест: кисть первого отменяется
    if (stroke && performance.now() - stroke.t0 < SECOND_FINGER_MS && stroke.cells.size <= 1) {
      undoChanges(run, stroke.changes);
      stroke.changes.forEach((c) => paintCell(c.i));
      if (stroke.changes.some((c) => c.mistake)) ui.mistakes.textContent = String(run.mistakes);
      paintClues();
      paintPreview();
      stroke = null;
      ui.counter.hidden = true;
      highlight(-1);
    } else endStroke();
    startGesture();
    return;
  }
  const i = cellAt(p);
  if (i < 0) return;
  const useTool = e.pointerType === 'mouse' && e.button === 2 ? CROSS : tool;
  if (e.button > 0 && e.button !== 2) return;
  startStroke(i, useTool, p);
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  const p = local(e);
  pointers.set(e.pointerId, p);
  if (gesture) {
    moveGesture();
    return;
  }
  if (!stroke || stroke.stopped) return;
  const i = cellAt(p, true);
  if (i < 0 || i === stroke.last) return;
  // направление — по первому сдвигу на соседнюю клетку; дальше кисть идёт только вдоль него
  const sx = stroke.start % geo.w;
  const sy = Math.floor(stroke.start / geo.w);
  const x = i % geo.w;
  const y = Math.floor(i / geo.w);
  if (!stroke.axis) stroke.axis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'row' : 'col';
  const target = stroke.axis === 'row' ? sy * geo.w + x : y * geo.w + sx;
  stroke.last = target;
  const cells = [];
  if (stroke.axis === 'row') {
    const step = x >= sx ? 1 : -1;
    for (let q = sx; q !== x + step; q += step) cells.push(sy * geo.w + q);
  } else {
    const step = y >= sy ? 1 : -1;
    for (let q = sy; q !== y + step; q += step) cells.push(q * geo.w + sx);
  }
  applyStroke(cells);
  highlight(target);
}

function onPointerUp(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (gesture) {
    if (pointers.size < 2) gesture = null;
    if (pointers.size === 1) startGesture();
    return;
  }
  if (!pointers.size) endStroke();
}

function startGesture() {
  const pts = [...pointers.values()];
  if (pts.length < 2) {
    gesture = pts.length ? { mode: 'pan', start: { ...pts[0] }, view: { ...view } } : null;
    return;
  }
  const [a, b] = pts;
  gesture = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...view } };
}

function moveGesture() {
  const pts = [...pointers.values()];
  if (gesture.mode === 'pinch' && pts.length >= 2) {
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = Math.max(fitScale, Math.min(maxScale(), gesture.view.s * (dist / gesture.dist)));
    const bx = (gesture.mid.x - gesture.view.tx) / gesture.view.s;
    const by = (gesture.mid.y - gesture.view.ty) / gesture.view.s;
    view = { s, tx: mid.x - bx * s, ty: mid.y - by * s };
  } else if (gesture.mode === 'pan' && pts.length) {
    view = { ...view, tx: gesture.view.tx + pts[0].x - gesture.start.x, ty: gesture.view.ty + pts[0].y - gesture.start.y };
  }
  clampView();
  applyView();
}

function onWheel(e) {
  if (modalActive || screen !== 'level') return;
  if (fitScale >= 0.999 && maxScale() <= 1.001) return;
  e.preventDefault();
  zoomAt(view.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), local(e).x, local(e).y);
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if (modalActive || screen !== 'level') return;
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я')) {
    e.preventDefault();
    onUndo();
  } else if (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'ч') setTool(tool === FILL ? CROSS : FILL);
}

function setTool(next) {
  if (tool === next) return;
  tool = next;
  sfx('tool');
  api.platform.haptic.selection();
  paintTools();
}

function onUndo() {
  if (!history.length || winning || run.done) return;
  const changes = history.pop();
  undoChanges(run, changes);
  changes.forEach((c) => paintCell(c.i));
  paintClues();
  paintPreview();
  paintTools();
  sfx('undo');
  saveRun();
}

// ---------- подсказка ----------

function clearHint() {
  for (const i of hintMarks) ui.cells?.[i]?.classList.remove('ng-hint');
  ui.rowClues?.forEach((n) => n.classList.remove('ng-hint-line'));
  ui.colClues?.forEach((n) => n.classList.remove('ng-hint-line'));
  hintMarks = [];
}

function onHint() {
  if (winning || run.done) return;
  if (run.hints <= 0) {
    toast.show(T.noHints, 2000);
    sfx('mistake');
    return;
  }
  const h = hintLine(run, level);
  if (!h) {
    toast.show(T.hintNone, 2600);
    return;
  }
  clearHint();
  run.hints--;
  sfx('hint', {}, 0);
  const changes = [];
  if (h.kind === 'wrong') {
    for (const { i, v } of h.cells) {
      changes.push({ i, from: run.cells[i], to: v ? FILL : CROSS, mistake: false });
      run.cells[i] = v ? FILL : CROSS;
      ui.cells[i].classList.add('ng-hint');
      hintMarks.push(i);
      paintCell(i);
    }
    toast.show(T.hintWrong, 2600);
  } else {
    (h.kind === 'row' ? ui.rowClues : ui.colClues)[h.k].classList.add('ng-hint-line');
    h.cells.forEach(({ i, v }, q) => {
      const apply = () => {
        if (!ui?.cells || run.cells[i] !== EMPTY) return;
        run.cells[i] = v ? FILL : CROSS;
        paintCell(i);
        ui.cells[i].classList.add('ng-hint');
        if (v) pop(i);
      };
      changes.push({ i, from: EMPTY, to: v ? FILL : CROSS, mistake: false });
      hintMarks.push(i);
      if (reducedMotion()) apply();
      else later(apply, q * 45);
    });
    toast.show(T.hintLine(h.kind, h.k), 2600);
  }
  history.push(changes);
  later(() => {
    if (!ui?.cells || screen !== 'level') return;
    paintClues();
    paintPreview();
    paintTools();
    if (isSolved(run, level)) win();
    else saveRun();
  }, reducedMotion() ? 0 : h.cells.length * 45 + 60);
}

// ---------- победа ----------

function win() {
  winning = true;
  syncClock();
  run.done = true;
  const ms = run.time;
  const clean = run.mistakes === 0 && run.hints === HINTS;
  recordSolve(progress, levelNo, { ms, clean });
  saveProgress();
  sendProgress();
  api.storage.remove('run');
  ui.savedRun = null;
  sfx('win', {}, 0);
  api.platform.haptic.notification('success');
  clearHint();
  // крестики гаснут, закрашенные проявляются цветами рисунка волной от центра
  const motion = !reducedMotion();
  const { w, h } = geo;
  root.classList.add('ng-solved');
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const ch = level.art[y][x];
    const cell = ui.cells[i];
    // проявляется весь цветной рисунок — и клетки, которых не было в маске (у картинок с отдельной маской)
    if (ch !== '.') {
      cell.style.setProperty('--pix', level.pal[ch]);
      cell.classList.add('ng-pix');
    }
    const d = Math.hypot(x - (w - 1) / 2, y - (h - 1) / 2);
    cell.style.setProperty('--d', `${Math.round(d * 40)}ms`);
    cell.classList.add('ng-reveal');
  }
  const delay = motion ? Math.max(w, h) * 30 + 900 : 200;
  if (motion) later(() => fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff'], 70), delay - 400);
  later(() => showWin(ms, clean), delay);
}

function showWin(ms, clean) {
  const next = LEVELS.findIndex((_, k) => k > levelNo && !progress.done[k] && isOpen(progress, k));
  const pic = el('div', { class: 'ng-win-pic' }, thumb(level, 132));
  openModal(el('div', { class: 'ng-card ng-win', role: 'dialog', 'aria-label': T.winTitle },
    el('h2', {}, T.winTitle),
    pic,
    el('p', { class: 'ng-win-name' }, T.winIs(level.title)),
    el('p', { class: 'ng-note' }, `${T.winTime(fmtTime(ms))} · ${settings.check ? T.winMistakes(run.mistakes) : ''}`.replace(/ · $/, '')),
    clean && el('p', { class: 'ng-clean-note' }, T.clean),
    el('div', { class: 'ng-btns' },
      el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); showMap(levelNo); } }, T.toMap),
      next >= 0 && el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(next); } }, T.next),
    ),
  ), false);
  if (!reducedMotion()) animate(pic, [{ transform: 'scale(0.6) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
}

function leaveLevel() {
  if (!run) return showMap();
  // бета 'nonogram-back-fix' (владелец, 2026-10-02: «кнопка выхода в меню не работает»): часы шли, пока экран был
  // «уровнем», партию обнуляли, и showMap() падал на подсчёте времени — сначала остановить часы, потом уходить
  if (api.feature('nonogram-back-fix')) screen = 'map';
  syncClock();
  saveRun();
  ui.savedRun = run.done || !run.cells.some((c) => c !== EMPTY) ? null : serializeRun({ ...run, time: elapsed() });
  const k = levelNo;
  run = null;
  level = null;
  stroke = null;
  gesture = null;
  pointers.clear();
  root.classList.remove('ng-solved');
  sfx('click');
  showMap(k);
}

function askRestart() {
  openModal(card(T.restart,
    el('p', { class: 'ng-note' }, T.restartAsk),
    el('div', { class: 'ng-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.no),
      el('button', {
        class: 'btn',
        onclick: () => {
          closeModal();
          run = newRun(level, levelNo);
          history = [];
          ui.savedRun = null;
          api.storage.remove('run');
          buildLevel();
          syncClock();
        },
      }, T.yes),
    ),
  ));
}

// ---------- окна ----------

function openModal(content, closable = true) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => { if (closable && e.target === ui.modal) closeModal(); };
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  syncClock();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  syncClock();
}

function card(title, ...children) {
  return el('div', { class: 'ng-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ng-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ng-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function toggle(label, checked, onChange, hint) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'ng-toggle' }, input, el('span', {}, label, hint && el('small', {}, hint)));
}

function showRules(first = false) {
  // пример: строка 5 клеток «2 1»
  const demo = el('div', { class: 'ng-demo' },
    el('span', { class: 'ng-demo-clue' }, '2 1'),
    ...[1, 1, 0, 1, 0].map((v) => el('i', { class: v ? 'ng-f' : 'ng-x' })),
  );
  openModal(card(T.rulesTitle,
    el('p', { class: 'ng-note ng-rules' }, T.rules),
    demo,
    first && el('button', { class: 'btn ng-play', onclick: closeModal }, T.gotIt),
  ));
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'ng-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      host.dataset.skin = id;
      skins.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === id)));
      if (screen === 'level') paintPreview();
    },
  }, el('span', { class: 'ng-swatch' }, el('i', { class: 'ng-f' }), el('i', {}), el('i', { class: 'ng-x' }), el('i', { class: 'ng-f' })), T.skins[id]));
  openModal(card(T.settings,
    el('h3', { class: 'ng-section-title' }, T.skin),
    el('div', { class: 'ng-skins', role: 'radiogroup' }, skins),
    toggle(T.check, settings.check, (v) => {
      settings.check = v;
      saveSettings();
      if (screen === 'level') buildLevel();
    }, T.checkHint),
    toggle(T.autoCross, settings.autoCross, (v) => { settings.autoCross = v; saveSettings(); }),
    toggle(T.highlight, settings.highlight, (v) => { settings.highlight = v; saveSettings(); }),
    pointsInfo(api, 'nonogram'),
  ));
}

const saveSettings = () => api.storage.set('settings', settings);

function iconButton(icon, label, onclick, cls = 'ng-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick) {
  const b = el('button', { class: 'ng-mode', 'aria-pressed': 'false', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'ng-tool-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  root.querySelectorAll('.ng-sound').forEach((b) => {
    b.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
    b.title = soundOn ? T.soundOn : T.soundOff;
  });
  sfx('click');
}

function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
}

function onVisibility() {
  if (document.visibilityState !== 'visible') saveRun();
  syncClock();
}

export default {
  id: 'nonogram',
  title: 'Японский кроссворд',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedProgress, savedRun, savedSettings, savedSound] = await Promise.all([
      api.storage.get('progress'), api.storage.get('run'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    progress = normalizeProgress(savedProgress, LEVELS.length);
    settings = normalizeSettings(savedSettings);
    soundOn = savedSound !== false;
    host.dataset.skin = settings.skin;
    ui = { view: el('div', { class: 'ng-view' }), modal: el('div', { class: 'ng-modal', hidden: true }) };
    ui.savedRun = deserializeRun(savedRun, LEVELS) ? savedRun : null;
    root = el('div', { class: 'ng' }, ui.view, ui.modal, toast.el);
    container.append(root);
    fx = createFx(root, 'ng-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = setInterval(paintClock, 250);
    sendProgress();
    // начатый уровень — сразу в него; иначе карта
    if (ui.savedRun) startLevel(ui.savedRun.id);
    else showMap();
    if (!savedProgress && !savedRun) showRules(true);

    if (new URLSearchParams(location.search).has('ngdebug')) {
      window.__ng = {
        get run() { return run; },
        get level() { return level; },
        get view() { return view; },
        get geo() { return geo; },
        start: (k) => startLevel(k),
        map: () => leaveLevel(),
        solveExcept: (n = 1) => {
          const { solution } = prepare(level);
          let left = n;
          for (let i = solution.length - 1; i >= 0; i--) {
            if (solution[i] && left > 0 && run.cells[i] !== FILL) { left--; continue; }
            run.cells[i] = solution[i] ? FILL : CROSS;
          }
          paintAll();
        },
        tap: (i) => { startStroke(i, tool, { x: 0, y: 0 }); endStroke(); },
        drag: (a, b) => {
          startStroke(a, tool, { x: 0, y: 0 });
          const ax = a % geo.w; const ay = Math.floor(a / geo.w); const bx = b % geo.w; const by = Math.floor(b / geo.w);
          stroke.axis = Math.abs(bx - ax) >= Math.abs(by - ay) ? 'row' : 'col';
          const cells = [];
          if (stroke.axis === 'row') for (let q = ax; q !== bx + Math.sign(bx - ax || 1); q += Math.sign(bx - ax || 1)) cells.push(ay * geo.w + q);
          else for (let q = ay; q !== by + Math.sign(by - ay || 1); q += Math.sign(by - ay || 1)) cells.push(q * geo.w + ax);
          applyStroke(cells);
          endStroke();
        },
        tool: (t) => setTool(t === 'cross' ? CROSS : FILL),
        hint: () => onHint(),
        skin: (id) => { settings.skin = id; host.dataset.skin = id; },
        progress: () => progress,
        unlockAll: () => { progress.done = progress.done.map((d, k) => (k < 99 ? Math.max(d, 1) : d)); showMap(); },
      };
    }
  },

  getState() {
    if (!run || run.done || !run.cells.some((c) => c !== EMPTY)) return null;
    saveRun();
    return { level: run.id + 1 };
  },

  destroy() {
    clearTimers();
    clearInterval(clockTimer);
    resizeObs?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (run && !run.done) {
      syncClock();
      saveRun();
    }
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) {
      delete host.dataset.skin;
      host.style.removeProperty('--cell');
      host.style.removeProperty('--clue');
    }
    api = host = root = ui = toast = fx = run = level = geo = resizeObs = stroke = gesture = doneCache = null;
    pointers = new Map();
    history = [];
    hintMarks = [];
    screen = 'map';
    levelNo = -1;
    tool = FILL;
    modalActive = winning = false;
    runSince = 0;
    clockTimer = 0;
  },
};
