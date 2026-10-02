// Пятнашки: собери плитки по порядку, двигая их в пустую клетку. Как в 2048: свайп сдвигает плитку в сторону
// свайпа (стрелки и WASD — тоже; в настройках можно «двигать пустую»), касание плитки в одной строке или столбце
// с пустой — и свайп, начатый на ней в сторону пустой, — сдвигает весь ряд разом; на компьютере по желанию —
// «наведение» (ряд едет, когда на плитку заходит курсор). Поля 3×3…8×8, отмена без ограничений (каждая — ход),
// «вслепую» (цифры гаснут после первого хода), цвета рядов, рекорды по размерам; после победы — скорость (ходов в
// секунду) и оптимум (3×3, 4×4 — если быстро нашёлся). Подсказок нет (решение владельца: бесполезны). Правила —
// logic.js, решатель — solver.js, картинки — pictures.js, звуки — sounds.js.
//
// Плитки — абсолютные элементы с --x/--y (где стоит) и --hx/--hy (своё место — для картинок и градиента), ход —
// CSS-переход transform, ввод никогда не ждёт анимацию. Плитка на своём месте — с точкой, собранный ряд — «плип»
// и волна. Победа: на пустое место встаёт последняя плитка, зазоры схлопываются, по полю бежит блик, конфетти,
// потом экран результата оболочки.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { pictureUrl } from './pictures.js';
import {
  SIZES, DEFAULT_SIZE, newGame, moveDir, tapCell, undo, lineTo, isValidGame, emptyStats, isValidStats,
  recordGame, fmtTime,
} from './logic.js';
import { optimal } from './solver.js';

const SKINS = ['telegram', 'wood', 'gradient', 'neon', 'candy', 'sunset', 'sea'];
const PICTURE_SKINS = new Set(['sunset', 'sea']);
const SWIPE_MIN = 22;
const INVERT = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', ц: 'up', ы: 'down', ф: 'left', в: 'right',
};
const T = {
  title: 'Пятнашки',
  sub: (n) => `Поле ${n}×${n}`,
  moves: 'Ходы',
  time: 'Время',
  best: 'Рекорд',
  undo: 'Отменить',
  nothingToUndo: 'Нечего отменять',
  newGame: 'Новая игра',
  restartAsk: 'Начать заново? Эта партия засчитается несобранной.',
  restart: 'Новая игра',
  cancel: 'Играть дальше',
  rules: [
    'Собери плитки по порядку: 1, 2, 3… слева направо и сверху вниз, пустая клетка — в конце.',
    'Свайп двигает плитку в пустую клетку, как в 2048. Коснись плитки в одной строке или столбце с пустой — сдвинется весь ряд.',
    'Каждая сдвинутая плитка — ход. Отменять можно сколько угодно — отмена тоже ход.',
  ],
  gotIt: 'Играть',
  win: 'Собрано!',
  record: 'Новый рекорд!',
  result: (moves, n) => `${n}×${n} · ${moves} ${plural(moves, 'ход', 'хода', 'ходов')}`,
  optimum: (k) => `можно было за ${k}`,
  speed: (v) => `${v} хода/с`,
  bestLine: (m, t) => `рекорд: ${m} ${plural(m, 'ход', 'хода', 'ходов')} · ${t}`,
  menuBest: (t, n) => `Лучшее ${n}×${n}: ${t}`,
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  size: 'Размер поля',
  sizeHint: { 3: 'Разминка', 4: 'Классика', 5: 'Посложнее', 6: 'Долго', 7: 'Марафон', 8: 'Эпопея' },
  sizeNext: 'Новый размер — со следующей партии',
  skin: 'Оформление',
  skins: { telegram: 'По умолчанию', wood: 'Дерево', gradient: 'Градиент', neon: 'Неон', candy: 'Конфета', sunset: 'Закат', sea: 'Море' },
  options: 'Игра',
  rowColors: 'Цвета рядов — полоска показывает, в какой ряд плитка идёт',
  blind: 'Вслепую — цифры гаснут после первого хода',
  numbers: 'Цифры на картинках',
  moveGap: 'Стрелки двигают пустую клетку, а не плитку',
  hover: 'Наведение мышью — ряд едет, когда на плитку заходит курсор',
  played: 'Сыграно',
  wins: 'Собрано',
  bestMoves: 'Меньше всего ходов',
  bestTime: 'Быстрее всего',
  avgMoves: 'В среднем ходов',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
};

function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
};

const defaultSettings = () => ({ size: DEFAULT_SIZE, skin: 'telegram', rowColors: false, blind: false, numbers: true, moveGap: false, hover: false });

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = emptyStats();
let settings = defaultSettings();
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let finishing = false;
let swipe = null;
let runSince = 0;
let clockTimer = 0;
let lastHover = -1;
let doneLines = new Set();
const timers = new Set();
const audio = createAudio(createSounds);
const lastSound = new Map();

function sfx(name, opts, gap = 35) {
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

const started = () => game && !game.done && game.moves > 0;
const elapsed = () => (game ? game.time + (runSince ? performance.now() - runSince : 0) : 0);

function syncClock() {
  const go = started() && !finishing && !modalActive && document.visibilityState === 'visible';
  if (go && !runSince) runSince = performance.now();
  if (!go && runSince) {
    game.time += performance.now() - runSince;
    runSince = 0;
  }
  paintInfo();
}

function save() {
  if (!api || !game) return;
  if (game.done || !game.moves) api.storage.remove('current');
  else api.storage.set('current', { ...game, time: Math.round(elapsed()) });
}

// ---------- поле ----------

/** Плитка v: своё место (--hx/--hy), цвет ряда — по «слою» сборки (строка и столбец сверху-слева). */
function tileEl(v, n) {
  const g = v - 1;
  const gx = g % n;
  const gy = Math.floor(g / n);
  const layer = Math.min(gx, gy);
  return el('div', { class: 'ff-tile', 'data-v': v, style: `--hx: ${gx}; --hy: ${gy}; --hue: ${Math.round((layer * 300) / Math.max(1, n - 2))}` },
    el('span', { class: 'ff-face' }, el('span', { class: 'ff-num' }, String(v))));
}

/** Доли поля: зазор и рамка (на больших полях зазор тоньше). */
const gapOf = (n) => (n <= 4 ? 0.024 : n <= 6 ? 0.018 : 0.014);

function buildBoard() {
  const n = game.n;
  ui.board.style.setProperty('--n', n);
  ui.board.style.setProperty('--gk', gapOf(n));
  ui.cells.replaceChildren(...Array.from({ length: n * n }, () => el('div', { class: 'ff-cell' })));
  ui.tiles.replaceChildren();
  ui.tileOf = new Map();
  for (let v = 1; v < n * n; v++) {
    const node = tileEl(v, n);
    ui.tileOf.set(v, node);
    ui.tiles.append(node);
  }
  ui.last = tileEl(n * n, n);
  ui.last.classList.add('ff-last', 'ff-home');
  ui.last.style.setProperty('--x', n - 1);
  ui.last.style.setProperty('--y', n - 1);
  ui.tiles.append(ui.last);
  root.classList.remove('ff-won', 'ff-joined');
  doneLines = new Set(linesDone());
  applyOptions();
  paintTiles();
  paintInfo();
}

/** Оформление и режимы — классы на корне, картинка — переменная на контейнере. */
function applyOptions() {
  const picture = PICTURE_SKINS.has(settings.skin);
  host.dataset.skin = settings.skin;
  if (picture) host.style.setProperty('--pic', pictureUrl(settings.skin));
  else host.style.removeProperty('--pic');
  root.classList.toggle('ff-picture', picture);
  root.classList.toggle('ff-nonum', picture && !settings.numbers);
  root.classList.toggle('ff-rows', settings.rowColors);
  root.classList.toggle('ff-blind', settings.blind && Boolean(game?.moves) && !game.done);
}

function paintTiles() {
  const { grid, n } = game;
  grid.forEach((v, i) => {
    if (!v) return;
    const node = ui.tileOf.get(v);
    node.style.setProperty('--x', i % n);
    node.style.setProperty('--y', Math.floor(i / n));
    node.classList.toggle('ff-home', v === i + 1);
  });
}

function paintInfo() {
  if (!ui?.moves || !game) return;
  const m = String(game.moves);
  if (ui.moves.textContent !== m) ui.moves.textContent = m;
  const t = fmtTime(elapsed());
  if (ui.clock.textContent !== t) ui.clock.textContent = t;
  const r = stats[game.n];
  ui.best.textContent = r?.bestMoves ? `${r.bestMoves} · ${fmtTime(r.bestTime || 0)}` : '—';
  ui.sub.textContent = T.sub(game.n);
  ui.undoBtn.disabled = !game.history.length || game.done;
}

/** Собранные «слои»: верхние строки и левые столбцы (ключи 'r0', 'c0'…), пустая клетка в углу не мешает. */
function linesDone() {
  const { grid, n } = game;
  const out = [];
  for (let k = 0; k < n; k++) {
    let row = true;
    let col = true;
    for (let j = 0; j < n; j++) {
      const ri = k * n + j;
      const ci = j * n + k;
      if (!(ri === n * n - 1 || grid[ri] === ri + 1)) row = false;
      if (!(ci === n * n - 1 || grid[ci] === ci + 1)) col = false;
    }
    if (row) out.push(`r${k}`);
    if (col) out.push(`c${k}`);
  }
  return out;
}

// ---------- ход ----------

/** Нельзя: глухой звук и лёгкое покачивание (translate — положение плитки задано transform'ом). */
function refuse(node) {
  sfx('blocked', {}, 120);
  if (!node || reducedMotion()) return;
  animate(node, [{ translate: '0 0' }, { translate: '-3px 0' }, { translate: '3px 0' }, { translate: '-2px 0' }, { translate: '0 0' }],
    { duration: 220, easing: 'ease-out' });
}

function afterMove(moved, node = null) {
  if (!moved.length) {
    refuse(node);
    return;
  }
  if (game.moves === moved.length) {
    syncClock();                   // первый ход — часы пошли
    applyOptions();                // «вслепую» — цифры гаснут
  }
  paintTiles();
  if (moved.length === 1) sfx('move');
  else sfx('multi', { count: moved.length });
  api.platform.haptic.impact('light');
  // новый собранный ряд или столбец — «плип» и волна
  const now = linesDone();
  const fresh = now.filter((k) => !doneLines.has(k));
  doneLines = new Set(now);
  if (fresh.length && !game.done) {
    sfx('line', { step: Number(fresh[0].slice(1)) }, 0);
    glowLine(fresh[0]);
  }
  paintInfo();
  if (game.done) win();
  else save();
}

function glowLine(key) {
  if (reducedMotion()) return;
  const n = game.n;
  const k = Number(key.slice(1));
  for (let j = 0; j < n; j++) {
    const i = key[0] === 'r' ? k * n + j : j * n + k;
    const node = ui.tileOf.get(game.grid[i]);
    if (node) {
      animate(node.firstChild, [{ scale: '1', filter: 'brightness(1)' }, { scale: '1.08', filter: 'brightness(1.25)' }, { scale: '1', filter: 'brightness(1)' }],
        { duration: 340, delay: j * 45, easing: 'ease-out' });
    }
  }
}

const canPlay = () => game && !game.done && !finishing && !modalActive;

function doDir(dir) {
  if (!canPlay()) return;
  afterMove(moveDir(game, dir), ui.board);
}

function doTap(i) {
  if (!canPlay()) return;
  afterMove(tapCell(game, i), ui.tileOf.get(game.grid[i]));
}

function onUndo() {
  if (!game || game.done || finishing) return;
  const moved = undo(game);
  if (!moved.length) {
    toast.show(T.nothingToUndo, 1400);
    return;
  }
  doneLines = new Set(linesDone());
  paintTiles();
  paintInfo();
  sfx('undo');
  api.platform.haptic.selection();
  save();
}

// ---------- ввод ----------

function cellAt(e) {
  const r = ui.board.getBoundingClientRect();
  const pad = ui.cells.offsetLeft;
  const size = (r.width - pad * 2) / game.n;
  const x = Math.floor((e.clientX - r.left - pad) / size);
  const y = Math.floor((e.clientY - r.top - pad) / size);
  if (x < 0 || y < 0 || x >= game.n || y >= game.n) return -1;
  return y * game.n + x;
}

/** В какую сторону поедет ряд, если коснуться клетки i (к пустой). */
function groupDir(i) {
  const n = game.n;
  const e = game.grid.indexOf(0);
  if (i % n === e % n) return e > i ? 'down' : 'up';
  return e > i ? 'right' : 'left';
}

function onPointerDown(e) {
  if (modalActive || finishing || !game) return;
  audio.get();
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, cell: cellAt(e) };
  // мышь, отпущенная за краем поля, — всё равно свайп (палец захватывается сам)
  try {
    ui.board.setPointerCapture(e.pointerId);
  } catch {
    // нет захвата — не страшно
  }
}

function onPointerUp(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  const s = swipe;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) {
    if (s.cell >= 0 && !(settings.hover && e.pointerType === 'mouse')) doTap(s.cell);
    return;
  }
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  // свайп, начатый на плитке в ряду с пустой, в сторону пустой — едет весь ряд (как касание)
  if (s.cell >= 0 && lineTo(game.grid, game.n, s.cell).length > 1 && groupDir(s.cell) === dir) doTap(s.cell);
  else doDir(dir);
}

/** Наведение мышью: курсор зашёл на плитку в ряду с пустой — ряд едет. */
function onPointerMove(e) {
  if (!settings.hover || e.pointerType !== 'mouse' || e.buttons || !canPlay()) return;
  const i = cellAt(e);
  if (i === lastHover) return;
  lastHover = i;
  if (i >= 0 && lineTo(game.grid, game.n, i).length) doTap(i);
}

function onKeydown(e) {
  if (modalActive) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'я')) {
    e.preventDefault();
    onUndo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
  if (dir) {
    e.preventDefault();
    audio.get();
    doDir(settings.moveGap ? INVERT[dir] : dir);
  }
}

// ---------- победа ----------

function win() {
  finishing = true;
  syncClock();
  const ms = game.time;
  const r = stats[game.n];
  const prevMoves = r.bestMoves;
  const prevTime = r.bestTime;
  stats = recordGame(stats, game, { win: true });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sendProgress();
  const record = (!prevMoves || game.moves < prevMoves || !prevTime || ms < prevTime);
  const speed = ms >= 1000 ? (game.moves / (ms / 1000)).toFixed(1).replace('.', ',') : null;
  sfx('win', {}, 0);
  api.platform.haptic.notification('success');
  const motion = !reducedMotion();
  const n = game.n;
  ui.last.classList.add('ff-show');
  root.classList.add('ff-won');
  root.classList.remove('ff-blind');
  later(() => root?.classList.add('ff-joined'), motion ? 260 : 0);
  if (motion) {
    for (let v = 1; v <= n * n; v++) {
      const node = v === n * n ? ui.last : ui.tileOf.get(v);
      const g = v - 1;
      animate(node.firstChild, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.45)' }, { filter: 'brightness(1)' }],
        { duration: 520, delay: 650 + ((g % n) + Math.floor(g / n)) * (520 / n), easing: 'ease-in-out' });
    }
    later(() => fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff'], 70), 900);
  }
  // оптимум начальной расстановки: 3×3 — всегда, 4×4 — если нашёлся быстро (пока идёт анимация)
  let best = null;
  later(() => {
    if (!game || n > 4) return;
    best = optimal(game.start, n, { budget: n === 3 ? 1e6 : 6e5 })?.length ?? null;
  }, motion ? 120 : 0);
  later(() => {
    if (!api) return;
    const row = stats[n];
    api.finish({
      outcome: 'win',
      title: record ? T.record : T.win,
      durationMs: ms,
      variant: String(n),
      message: [
        T.result(game.moves, n),
        best && best < game.moves ? T.optimum(best) : null,
        speed ? T.speed(speed) : null,
        row.bestMoves && !record ? T.bestLine(row.bestMoves, fmtTime(row.bestTime)) : null,
      ].filter(Boolean).join(' · '),
    });
  }, motion ? 2100 : 300);
}

function sendProgress() {
  for (const n of [...SIZES].reverse()) {
    if (stats[n]?.bestTime) {
      api.progress(T.menuBest(fmtTime(stats[n].bestTime), n));
      return;
    }
  }
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => { if (e.target === ui.modal) closeModal(); };
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
  return el('div', { class: 'ff-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ff-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ff-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function startGame() {
  game = newGame(settings.size);
  runSince = 0;
  finishing = false;
  buildBoard();
  sfx('shuffle', {}, 0);
  if (!reducedMotion()) {
    const n = game.n;
    [...ui.tileOf.values()].forEach((node) => {
      const x = Number(node.style.getPropertyValue('--x'));
      const y = Number(node.style.getPropertyValue('--y'));
      animate(node.firstChild, [{ scale: '0.5', opacity: 0 }, { scale: '1', opacity: 1 }],
        { duration: 300, delay: (x + y) * (260 / n), easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)', fill: 'backwards' });
    });
  }
  save();
}

/** Новая игра; начатая партия засчитывается несобранной. */
function onNew() {
  if (finishing) return;
  if (!started()) {
    startGame();
    return;
  }
  openModal(card(T.newGame,
    el('p', { class: 'ff-note' }, T.restartAsk),
    el('div', { class: 'ff-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', {
        class: 'btn',
        onclick: () => {
          syncClock();
          stats = recordGame(stats, game, { win: false });
          api.storage.set('stats', stats);
          closeModal();
          startGame();
        },
      }, T.restart),
    ),
  ));
}

function showRules() {
  openModal(card(T.title,
    ...T.rules.map((line) => el('p', { class: 'ff-note ff-rules' }, line)),
    el('button', { class: 'btn ff-play', onclick: closeModal }, T.gotIt),
  ));
}

function showStats() {
  const box = el('div', {});
  const tile = (value, label) => el('div', { class: 'ff-stat-tile' }, el('b', {}, value), el('span', {}, label));
  const render = (n) => {
    const r = stats[n];
    box.replaceChildren(el('div', { class: 'ff-stat-grid' },
      tile(String(r.played), T.played),
      tile(String(r.wins), T.wins),
      tile(r.bestMoves ? String(r.bestMoves) : '—', T.bestMoves),
      tile(r.bestTime ? fmtTime(r.bestTime) : '—', T.bestTime),
      tile(r.wins ? String(Math.round(r.totalMoves / r.wins)) : '—', T.avgMoves),
    ));
  };
  const tabs = SIZES.map((n) => el('button', {
    class: 'ff-tab', role: 'tab', 'aria-selected': String(n === game.n),
    onclick: () => {
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(SIZES[k] === n)));
      render(n);
    },
  }, `${n}×${n}`));
  render(game.n);
  openModal(card(T.stats, el('div', { class: 'ff-tabs', role: 'tablist' }, tabs), box));
}

const saveSettings = () => api.storage.set('settings', settings);

/** Образец оформления: 2×2 — плитки 1, 2, 3 и пустая клетка. */
function swatch(id) {
  const face = (v, x, y) => el('i', { class: 'ff-sw-tile', style: `--hx: ${x}; --hy: ${y}` },
    el('span', { class: 'ff-face' }, el('span', { class: 'ff-num' }, String(v))));
  const node = el('span', { class: 'ff-swatch' }, face(1, 0, 0), face(2, 1, 0), face(3, 0, 1), el('i', { class: 'ff-sw-empty' }));
  return node;
}

function showSettings() {
  const sizes = SIZES.map((n) => el('button', {
    class: 'ff-option', role: 'radio', 'aria-checked': String(settings.size === n),
    onclick: () => {
      settings.size = n;
      saveSettings();
      sizes.forEach((b, k) => b.setAttribute('aria-checked', String(SIZES[k] === n)));
      if (!started()) startGame();
    },
  }, el('b', {}, `${n}×${n}`), el('span', {}, T.sizeHint[n])));
  const skins = SKINS.map((id) => {
    const b = el('button', {
      class: 'ff-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
      onclick: () => {
        settings.skin = id;
        saveSettings();
        skins.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.skin === id)));
        applyOptions();
        sfx('click');
      },
    }, swatch(id), el('span', { class: 'ff-skin-name' }, T.skins[id]));
    if (PICTURE_SKINS.has(id)) {
      b.style.setProperty('--pic', pictureUrl(id));
      b.classList.add('ff-sw-picture');
    }
    return b;
  });
  const toggle = (key, label) => {
    const input = el('input', { type: 'checkbox', checked: settings[key] });
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      applyOptions();
    });
    return el('label', { class: 'ff-toggle' }, input, el('span', {}, label));
  };
  const finePointer = globalThis.matchMedia?.('(pointer: fine)').matches;
  openModal(card(T.settings,
    el('h3', { class: 'ff-section' }, T.size),
    el('div', { class: 'ff-options' }, sizes),
    started() && el('p', { class: 'ff-note' }, T.sizeNext),
    el('h3', { class: 'ff-section' }, T.skin),
    el('div', { class: 'ff-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'ff-section' }, T.options),
    toggle('rowColors', T.rowColors),
    toggle('blind', T.blind),
    toggle('numbers', T.numbers),
    toggle('moveGap', T.moveGap),
    finePointer && toggle('hover', T.hover),
  ));
}

function iconButton(icon, label, onclick, cls = 'ff-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick) {
  const b = el('button', { class: 'ff-tool', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'ff-tool-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function onVisibility() {
  if (document.visibilityState !== 'visible') save();
  syncClock();
}

export default {
  id: 'fifteen',
  title: 'Пятнашки',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? { ...emptyStats(), ...savedStats } : emptyStats();
    if (savedSettings && typeof savedSettings === 'object') {
      const d = defaultSettings();
      settings = {
        size: SIZES.includes(savedSettings.size) ? savedSettings.size : d.size,
        skin: SKINS.includes(savedSettings.skin) ? savedSettings.skin : d.skin,
        rowColors: savedSettings.rowColors === true,
        blind: savedSettings.blind === true,
        numbers: savedSettings.numbers !== false,
        moveGap: savedSettings.moveGap === true,
        hover: savedSettings.hover === true,
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
    const stat = (label, node) => el('div', { class: 'ff-stat' }, el('span', {}, label), node);
    ui = {
      sub: el('div', { class: 'ff-sub' }),
      moves: el('b', {}, '0'),
      clock: el('b', {}, '0:00'),
      best: el('b', {}, '—'),
      board: el('div', { class: 'ff-board' }),
      cells: el('div', { class: 'ff-cells' }),
      tiles: el('div', { class: 'ff-tiles' }),
      modal: el('div', { class: 'ff-modal', hidden: true }),
    };
    ui.undoBtn = toolButton(ICONS.undo, T.undo, onUndo);
    ui.board.append(ui.cells, ui.tiles);
    ui.board.addEventListener('pointerdown', onPointerDown);
    ui.board.addEventListener('pointerup', onPointerUp);
    ui.board.addEventListener('pointercancel', () => { swipe = null; });
    ui.board.addEventListener('pointermove', onPointerMove);
    ui.board.addEventListener('pointerleave', () => { lastHover = -1; });
    ui.board.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root = el('div', { class: 'ff' },
      el('div', { class: 'ff-header' },
        el('div', { class: 'ff-head-text' }, el('div', { class: 'ff-title' }, T.title), ui.sub),
        el('div', { class: 'ff-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.plus, T.newGame, onNew),
        ),
      ),
      el('div', { class: 'ff-bar' }, stat(T.moves, ui.moves), stat(T.time, ui.clock), stat(T.best, ui.best)),
      el('div', { class: 'ff-wrap' }, ui.board),
      el('div', { class: 'ff-tools' }, ui.undoBtn),
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'ff-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = setInterval(paintInfo, 250);

    if (isValidGame(saved) && !saved.done) {
      game = saved;
      buildBoard();
    } else startGame();
    sendProgress();
    if (!savedSettings && !saved) showRules();

    if (new URLSearchParams(location.search).has('ffdebug')) {
      window.__ff = {
        get game() { return game; },
        dir: (d) => doDir(d),
        tap: (i) => doTap(i),
        undo: () => onUndo(),
        skin: (id) => { settings.skin = id; applyOptions(); },
        set: (key, value) => { settings[key] = value; applyOptions(); },
        start: (n) => { settings.size = n; startGame(); },
        /** почти собрать: до победы один ход */
        almost: () => {
          const n = game.n;
          game.grid = Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));
          [game.grid[n * n - 1], game.grid[n * n - 2]] = [game.grid[n * n - 2], game.grid[n * n - 1]];
          game.start = game.grid.slice();
          game.moves = Math.max(1, game.moves);
          buildBoard();
        },
      };
    }
  },

  getState() {
    if (!started()) return null;
    save();
    return { moves: game.moves };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    clearInterval(clockTimer);
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (started()) {
      syncClock();
      save();
    }
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) {
      delete host.dataset.skin;
      host.style.removeProperty('--pic');
    }
    api = host = root = ui = toast = fx = game = swipe = null;
    modalActive = finishing = false;
    runSince = 0;
    clockTimer = 0;
    lastHover = -1;
    doneLines = new Set();
  },
};
