// Кубик Рубика 3×3 с таймером и перемешиванием. Управление: провести пальцем по наклейкам — поворачивается слой
// (вслед за пальцем; отпустил — доворачивается до ближайшей четверти, быстрый взмах — дальше), провести мимо кубика —
// поворачивается весь кубик (с инерцией), двойное касание мимо — вид по умолчанию. Клавиатура: R L U D F B M E S
// (Shift — обратно) относительно того, как кубик повёрнут к игроку, X Y Z — повернуть кубик целиком, пробел —
// перемешать, Ctrl+Z — отмена.
//
// Перемешивание — как на соревнованиях: случайное положение (решатель Коцембы в worker.js) и ходы к нему; нет
// воркера — 25 случайных ходов. Таймер — с первого поворота слоя после перемешивания (по желанию — осмотр 15 с по
// правилам WCA: +2 после 15 с, DNF после 17), стоп — когда собрано. «Собрать» — решатель показывает и проигрывает
// решение (попытка не засчитывается). Отрисовка — render.js (WebGL, плоские цвета без освещения).

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { createRenderer, quatAxis, quatMul, quatNorm, quatSlerp, quatToMat3 } from './render.js';
import {
  FACE_NORMAL, FACES, MOVE_DEF, newModel, turnModel, isSolvedModel, wrongStickers, MIXED_STICKERS, parseMove, moveToTurn, relativeFacelets,
  encodeModel, decodeModel,
} from './cube.js';
import { randomMoveScramble, solveFacelets, buildTables } from './solver.js';
import {
  DNF, penaltyFor, averageOf, fmtTime, emptyStats, isValidStats, isValidHistory, recordSolve, SKINS, SPEEDS,
  defaultSettings, normalizeSettings, isValidSave, solveValue,
} from './logic.js';

const PALETTES = {
  classic: { colors: ['#ffffff', '#c41e3a', '#009e60', '#ffd500', '#ff5800', '#0051ba'], body: '#121212', size: 0.86, radius: 0.12 },
  stickerless: { colors: ['#f4f6f8', '#ef2b40', '#16c24f', '#fde21f', '#ff8c00', '#1f6ff0'], body: '#1c1d21', size: 0.955, radius: 0.08 },
  light: { colors: ['#ffffff', '#d8263b', '#0aa45a', '#ffd21a', '#ff6a13', '#1d5fd1'], body: '#bfc6d1', size: 0.86, radius: 0.12 },
  // пастель — не бледные классические, а мягкие соседние оттенки: красный → розовый, синий → голубой, зелёный → мятный,
  // оранжевый → персиковый, жёлтый → сливочный, белый → молочный; корпус — приглушённый сливовый
  pastel: { colors: ['#fff8ef', '#ff9cc6', '#8fe3bf', '#fff0a0', '#ffc396', '#9ccfff'], body: '#4a4560', size: 0.88, radius: 0.17 },
  neon: { colors: ['#f2f2ff', '#ff2e63', '#20ff8a', '#f5ff3d', '#ff9500', '#00c8ff'], body: '#07070d', size: 0.84, radius: 0.1 },
  retro: { colors: ['#f1eee2', '#c8102e', '#00843d', '#f6d000', '#f47920', '#0057b8'], body: '#1a1a1a', size: 0.8, radius: 0.035 },
};

const DEG = Math.PI / 180;
const DEFAULT_VIEW = quatNorm(quatMul(quatAxis([1, 0, 0], 26 * DEG), quatAxis([0, 1, 0], -36 * DEG)));
const DRAG_MIN = 8;
const KEY_FACE = {
  KeyR: 'R', KeyL: 'L', KeyU: 'U', KeyD: 'D', KeyF: 'F', KeyB: 'B', KeyM: 'M', KeyE: 'E', KeyS: 'S',
  KeyX: 'x', KeyY: 'y', KeyZ: 'z',
};

const T = {
  title: 'Кубик Рубика',
  status: {
    free: 'Свободная игра', scrambling: 'Перемешиваю…', inspect: 'Осмотр', ready: 'Готов — поверни слой',
    running: 'Сборка', done: 'Собрано!', solving: 'Собираю…', thinking: 'Думаю…',
  },
  moves: 'Ходы',
  best: 'Лучшее',
  ao5: 'Среднее из 5',
  undo: 'Отменить',
  scramble: 'Перемешать',
  solve: 'Собрать',
  readyHint: 'Поверни любой слой — время пойдёт',
  freeHint: 'Перемешай — и на время',
  solution: 'Решение',
  nothingToUndo: 'Нечего отменять',
  alreadySolved: 'Кубик уже собран',
  solvedFree: 'Собрано!',
  solvedAuto: (n) => `Собрано за ${n} ${plural(n, 'ход', 'хода', 'ходов')}`,
  abandonAsk: 'Сборка идёт — бросить её? Время не засчитается.',
  abandonScramble: 'Перемешать заново',
  abandonSolve: 'Показать решение',
  keep: 'Продолжить сборку',
  record: 'Новый рекорд!',
  win: 'Собрано!',
  dnf: 'DNF',
  dnfNote: 'осмотр дольше 17 секунд — сборка не засчитана',
  plus2: '+2 за осмотр',
  result: (m, tps) => `${m} ${plural(m, 'ход', 'хода', 'ходов')}${tps ? ` · ${tps} хода/с` : ''}`,
  ao5Line: (v) => `среднее из 5: ${v}`,
  ao12Line: (v) => `из 12: ${v}`,
  menuBest: (t) => `Лучшее: ${t}`,
  noGl: 'Здесь не работает 3D (WebGL) — обнови Telegram или браузер.',
  stats: 'Статистика',
  settings: 'Настройки',
  help: 'Как играть',
  close: 'Закрыть',
  count: 'Сборок',
  bestSingle: 'Лучшее время',
  currentAo5: 'Среднее из 5',
  currentAo12: 'Среднее из 12',
  bestAo5: 'Лучшее из 5',
  bestMoves: 'Меньше всего ходов',
  recent: 'Последние сборки',
  none: 'Сборок пока нет — перемешай кубик и собери на время.',
  skin: 'Оформление',
  skins: { classic: 'Классика', stickerless: 'Без наклеек', light: 'Светлый корпус', pastel: 'Пастель', neon: 'Неон', retro: 'Ретро' },
  speed: 'Скорость анимации',
  speeds: { fast: 'Быстро', normal: 'Обычно', slow: 'Плавно' },
  inspection: 'Осмотр 15 секунд перед сборкой (как на соревнованиях)',
  scrambleNote: 'Перемешивание — из случайного положения, как на соревнованиях WCA.',
  rules: [
    'Проведи пальцем по наклейкам — повернётся слой. Отпусти — он доворачивается до четверти, быстрый взмах — дальше.',
    'Проведи мимо кубика — повернётся весь кубик. Двойное касание мимо — вид как был.',
    'Нажми «Перемешать» — время пойдёт с первого поворота и остановится, когда кубик собран. «Собрать» покажет решение.',
    'С клавиатуры: R L U D F B M E S (с Shift — обратно), X Y Z — повернуть кубик, пробел — перемешать.',
  ],
  gotIt: 'Играть',
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
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  shuffle: svgIcon('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>'),
  solve: svgIcon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/><path d="m10.5 12 1 1 2-2.2"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.8"/><path d="M12 17.2h.01"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let renderer = null;
let model = newModel();
let view = DEFAULT_VIEW.slice();
let settings = defaultSettings();
let stats = emptyStats();
let history = [];
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let session = null;
let runSince = 0;
let inspectSince = 0;
let queue = [];
let anim = null;
let gesture = null;
let inertia = null;
let viewAnim = null;
let raf = 0;
let busy = null;                 // 'scramble' | 'solve' | 'thinking' | 'celebrate' | null
let clockTimer = 0;
let lastTap = 0;
let resizeObs = null;
const timers = new Set();
const audio = createAudio(createSounds);
const lastSound = new Map();

// воркер решателя живёт, пока открыто приложение: таблицы строятся один раз (не на каждый вход в игру)
let worker = null;
let workerReady = null;
let workerId = 0;

// peak — насколько кубик был перемешан (наклеек не на месте) с последней сборки: «Собрано!» в свободной игре — только
// если он был перемешан по-настоящему (R и R′ — не сборка)
const newSession = (over = {}) => ({ status: 'free', scramble: [], solution: null, progress: 0, moves: 0, time: 0, inspect: 0, penalty: 0, turns: [], beeps: 0, peak: 0, ...over });

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

// ---------- решатель в отдельном потоке ----------

function ensureWorker() {
  if (worker || workerReady === false) return;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    workerReady = false;
    return;
  }
  workerReady = new Promise((resolve) => {
    const w = worker;
    const timer = setTimeout(() => {
      w.terminate();
      if (worker === w) worker = null;
      workerReady = false;
      resolve(false);
    }, 20000);
    w.addEventListener('error', () => {
      clearTimeout(timer);
      if (worker === w) worker = null;
      workerReady = false;
      resolve(false);
    });
    callWorker({ kind: 'init' }).then((r) => {
      clearTimeout(timer);
      resolve(r !== undefined);
    });
  });
}

function callWorker(msg) {
  const w = worker;
  if (!w) return Promise.resolve(undefined);
  const id = ++workerId;
  return new Promise((resolve) => {
    const onMessage = (e) => {
      if (e.data?.id !== id) return;
      w.removeEventListener('message', onMessage);
      resolve(e.data.error ? undefined : e.data.result);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, ...msg });
  });
}

async function requestScramble() {
  ensureWorker();
  const ok = await workerReady;
  if (ok) {
    const moves = await callWorker({ kind: 'scramble' });
    if (Array.isArray(moves) && moves.length) return moves;
  }
  return randomMoveScramble(Math.random, 25);
}

async function requestSolve(facelets) {
  ensureWorker();
  const ok = await workerReady;
  if (ok) {
    const moves = await callWorker({ kind: 'solve', facelets });
    if (moves !== undefined) return moves;
  }
  buildTables();                  // запасной путь: в этом потоке (≈ 1 с)
  return solveFacelets(facelets, { maxLength: 22, timeLimit: 150 });
}

// ---------- время ----------

const elapsed = () => session.time + (runSince ? performance.now() - runSince : 0);
const inspectElapsed = () => session.inspect + (inspectSince ? performance.now() - inspectSince : 0);

function syncClock() {
  if (!session) return;
  const visible = document.visibilityState === 'visible' && !modalActive;
  const run = session.status === 'running' && visible;
  if (run && !runSince) runSince = performance.now();
  if (!run && runSince) {
    session.time += performance.now() - runSince;
    runSince = 0;
  }
  const insp = session.status === 'inspect' && visible;
  if (insp && !inspectSince) inspectSince = performance.now();
  if (!insp && inspectSince) {
    session.inspect += performance.now() - inspectSince;
    inspectSince = 0;
  }
  paintClock();
}

function paintClock() {
  if (!ui || !session) return;
  const st = busy === 'scramble' || busy === 'solve' || busy === 'thinking' ? busy === 'scramble' ? 'scrambling' : busy === 'solve' ? 'solving' : 'thinking' : session.status;
  let text = '0.00';
  let cls = 'rb-time';
  if (session.status === 'running') text = fmtTime(elapsed());
  else if (session.status === 'inspect') {
    const s = inspectElapsed() / 1000;
    if (s < 15) text = String(Math.ceil(15 - s));
    else text = s < 17 ? '+2' : 'DNF';
    cls += ' rb-inspect';
    if (s >= 8 && session.beeps < 1) {
      session.beeps = 1;
      sfx('beep', {}, 0);
    }
    if (s >= 12 && session.beeps < 2) {
      session.beeps = 2;
      sfx('beep', {}, 0);
    }
  } else if (session.status === 'done') {
    text = fmtTime(session.final);
    cls += ' rb-final';
  } else if (session.status === 'free') cls += ' rb-dim';
  if (ui.time.textContent !== text) ui.time.textContent = text;
  if (ui.time.className !== cls) ui.time.className = cls;
  const sub = T.status[st];
  if (ui.sub.textContent !== sub) ui.sub.textContent = sub;
  const hint = session.status === 'ready' && !busy ? T.readyHint : session.status === 'free' && !busy && !session.moves && !stats.count ? T.freeHint : '';
  if (ui.hint.textContent !== hint) {
    ui.hint.textContent = hint;
    ui.hint.classList.toggle('rb-show', Boolean(hint));
  }
}

function paintInfo() {
  if (!ui) return;
  ui.moves.textContent = String(session.moves);
  const a5 = averageOf(history, 5);
  ui.ao5.textContent = a5 === null ? '—' : fmtTime(a5);
  ui.best.textContent = stats.best ? fmtTime(stats.best) : '—';
  ui.undoBtn.disabled = Boolean(busy) || !session.turns.length || session.status === 'done';
  ui.solveBtn.disabled = Boolean(busy) || !renderer;
  ui.scrambleBtn.disabled = Boolean(busy) || !renderer;
  ui.scrambleBtn.classList.toggle('rb-wait', busy === 'thinking');
}

/** Строка перемешивания или решения: ходы, уже сделанные — приглушены. */
function paintScramble() {
  if (!ui) return;
  const list = session.solution ?? session.scramble;
  const label = session.solution ? `${T.solution}:` : '';
  ui.scramble.replaceChildren(
    ...(label ? [el('span', { class: 'rb-label' }, label)] : []),
    ...list.map((m, i) => el('span', { class: i < session.progress ? 'rb-mv rb-done' : 'rb-mv' }, m)),
  );
}

function save() {
  if (!api || !session) return;
  if (session.status === 'done' || (session.status === 'free' && !session.moves && isSolvedModel(model))) {
    api.storage.remove('current');
    return;
  }
  api.storage.set('current', {
    v: 1, cubies: encodeModel(model), status: session.status, scramble: session.scramble.join(' '),
    moves: session.moves, time: Math.round(elapsed()), inspect: Math.round(inspectElapsed()), penalty: session.penalty,
    turns: session.turns.slice(-500), peak: session.peak || 0,
  });
}

// ---------- отрисовка и анимация ----------

function requestFrame() {
  if (!raf && renderer) raf = requestAnimationFrame(frame);
}

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOut = (p) => 1 - (1 - p) ** 3;

function frame(now) {
  raf = 0;
  if (!renderer) return;
  let more = false;
  if (anim && anim.t0 != null) {
    const p = Math.min(1, (now - anim.t0) / anim.dur);
    anim.angle = anim.from + (anim.to - anim.from) * (anim.snap !== undefined ? easeOut(p) : easeInOut(p));
    if (p >= 1) finishAnim();
    more = true;
  }
  if (inertia) {
    const dt = Math.min(40, now - inertia.t);
    inertia.t = now;
    view = quatNorm(quatMul(quatAxis(inertia.axis, inertia.speed * dt), view));
    inertia.speed *= Math.exp(-dt / 260);
    if (Math.abs(inertia.speed) < 0.00005) inertia = null;
    else more = true;
  }
  if (viewAnim) {
    const p = Math.min(1, (now - viewAnim.t0) / viewAnim.dur);
    view = viewAnim.spin
      ? quatNorm(quatMul(quatAxis([0, 1, 0], viewAnim.spin * easeInOut(p)), viewAnim.from))
      : quatSlerp(viewAnim.from, viewAnim.to, easeInOut(p));
    if (p >= 1) {
      const done = viewAnim.done;
      viewAnim = null;
      done?.();
    } else more = true;
  }
  renderer.draw({ cubies: model.cubies, view, anim: anim ? { axis: anim.axis, layer: anim.layer, angle: anim.angle } : null });
  if (more || anim || queue.length) requestFrame();
}

/** Анимированный поворот из очереди: kind 'user' (клавиатура) / 'undo' / 'scramble' / 'solve'. */
function enqueue(item) {
  queue.push(item);
  pump();
}

function pump() {
  if (anim || !queue.length) return;
  const it = queue.shift();
  const quarters = Math.abs(it.q);
  anim = {
    axis: it.axis, layer: it.layer, from: 0, to: (it.q * Math.PI) / 2, angle: 0,
    t0: performance.now(), dur: reducedMotion() ? 1 : it.dur * (quarters > 1 ? 1.5 : 1), item: it,
  };
  if (it.kind === 'scramble' || it.kind === 'solve') sfx('scramble', {}, 25);
  requestFrame();
}

function finishAnim() {
  const a = anim;
  anim = null;
  if (!a) return;
  if (a.snap !== undefined) {
    if (((a.snap % 4) + 4) % 4) commitUser(a.axis, a.layer, a.snap);
  } else if (a.item) {
    const it = a.item;
    if (it.kind === 'user') commitUser(it.axis, it.layer, it.q);
    else if (it.kind === 'undo') {
      turnModel(model, it.axis, it.layer, it.q);
      session.moves++;
      sfx('undo');
      afterTurn();
    } else {
      turnModel(model, it.axis, it.layer, it.q);
      it.done?.();
    }
  }
  pump();
  requestFrame();
}

/** Доделать мгновенно всё, что анимируется (перед новым жестом, уходом из игры). */
function flushAnims() {
  while (anim || queue.length) {
    if (!anim) pump();
    finishAnim();
  }
}

function commitUser(axis, layer, q) {
  const k = ((q % 4) + 4) % 4;
  if (!k) return;
  turnModel(model, axis, layer, q);
  session.turns.push([axis, layer, k === 3 ? -1 : k]);
  if (session.turns.length > 500) session.turns.shift();
  session.moves++;
  sfx(k === 2 ? 'half' : 'turn', {}, 20);
  api?.platform.haptic.impact('light');
  afterTurn();
}

function afterTurn() {
  paintInfo();
  session.peak = Math.max(session.peak || 0, wrongStickers(model));
  if (isSolvedModel(model)) {
    const mixed = session.peak >= MIXED_STICKERS;
    session.peak = 0;
    if (session.status === 'running') {
      finishSolve();
      return;
    }
    if (session.status === 'free' && session.moves && mixed && !busy) {
      toast.show(T.solvedFree, 1400);
      sfx('solved', {}, 0);
      session.moves = 0;
      session.turns = [];
      paintInfo();
    }
  }
  save();
}

// ---------- перемешивание, решение, сборка на время ----------

function beginAttempt() {
  if (session.status !== 'ready' && session.status !== 'inspect') return;
  syncClock();
  session.penalty = session.status === 'inspect' ? penaltyFor(inspectElapsed()) : 0;
  session.status = 'running';
  session.time = 0;
  runSince = 0;
  syncClock();
  sfx('start', {}, 0);
}

const canTurn = () => Boolean(renderer) && !busy && session.status !== 'done';

function confirmAbandon(label, go) {
  if (session.status !== 'running') {
    go();
    return;
  }
  openModal(card(T.title,
    el('p', { class: 'rb-note' }, T.abandonAsk),
    el('div', { class: 'rb-btns' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.keep),
      el('button', { class: 'btn', onclick: () => { closeModal(); go(); } }, label),
    ),
  ));
}

function onScramble() {
  if (!renderer || busy) return;
  confirmAbandon(T.abandonScramble, startScramble);
}

async function startScramble() {
  flushAnims();
  inertia = null;
  busy = 'thinking';
  paintInfo();
  paintClock();
  const moves = await requestScramble();
  if (!api) return;
  model = newModel();
  runSince = 0;
  inspectSince = 0;
  session = newSession({ status: 'free', scramble: moves });
  busy = 'scramble';
  paintScramble();
  paintInfo();
  paintClock();
  const speed = SPEEDS[settings.speed];
  moves.forEach((token, i) => {
    const t = moveToTurn(parseMove(token));
    enqueue({
      ...t, kind: 'scramble', dur: speed.scramble,
      done: () => {
        session.progress = i + 1;
        paintScramble();
        if (i === moves.length - 1) scrambled();
      },
    });
  });
}

function scrambled() {
  busy = null;
  session.progress = 0;
  session.status = settings.inspection ? 'inspect' : 'ready';
  session.beeps = 0;
  paintScramble();
  paintInfo();
  syncClock();
  save();
}

function onSolve() {
  if (!renderer || busy) return;
  if (isSolvedModel(model)) {
    toast.show(T.alreadySolved, 1400);
    return;
  }
  confirmAbandon(T.abandonSolve, startSolve);
}

async function startSolve() {
  flushAnims();
  busy = 'thinking';
  paintInfo();
  paintClock();
  const moves = await requestSolve(relativeFacelets(model));
  if (!api) return;
  if (!moves) {
    busy = null;
    paintInfo();
    paintClock();
    return;
  }
  runSince = 0;
  inspectSince = 0;
  session = newSession({ status: 'free', scramble: session.scramble, solution: moves });
  busy = 'solve';
  paintScramble();
  paintInfo();
  paintClock();
  const speed = SPEEDS[settings.speed];
  if (!moves.length) solvedByMachine(0);
  moves.forEach((token, i) => {
    const t = moveToTurn(parseMove(token));
    enqueue({
      ...t, kind: 'solve', dur: speed.solve,
      done: () => {
        session.progress = i + 1;
        paintScramble();
        if (i === moves.length - 1) solvedByMachine(moves.length);
      },
    });
  });
}

function solvedByMachine(n) {
  busy = null;
  toast.show(T.solvedAuto(n), 2000);
  sfx('solved', {}, 0);
  paintInfo();
  paintClock();
  save();
}

function finishSolve() {
  syncClock();
  const t = Math.round(elapsed());
  runSince = 0;
  const solve = { t, p: session.penalty || 0, m: session.moves, s: session.scramble.join(' '), d: Date.now() };
  const prevAo5 = averageOf(history, 5);
  const res = recordSolve(stats, history, solve);
  stats = res.stats;
  history = res.history;
  api.storage.set('stats', stats);
  api.storage.set('history', history);
  api.storage.remove('current');
  sendProgress();
  session.status = 'done';
  session.final = solveValue(solve);
  busy = 'celebrate';
  paintClock();
  paintInfo();
  sfx('solved', {}, 0);
  api.platform.haptic.notification('success');
  const motion = !reducedMotion();
  if (motion) {
    viewAnim = { from: view.slice(), spin: Math.PI * 2, t0: performance.now(), dur: 1300 };
    requestFrame();
    later(() => fx?.confetti(PALETTES[settings.skin].colors, 80), 250);
  }
  void prevAo5;
  later(() => {
    if (!api) return;
    busy = null;
    const dnf = solve.p === DNF;
    const secs = t / 1000;
    const tps = secs > 0.5 ? (solve.m / secs).toFixed(1).replace('.', ',') : null;
    const a5 = averageOf(history, 5);
    const a12 = averageOf(history, 12);
    api.finish({
      outcome: dnf ? 'lose' : 'win',
      title: dnf ? T.dnf : res.record ? T.record : T.win,
      durationMs: t,
      variant: '3x3',
      message: [
        dnf ? `${fmtTime(t)} — ${T.dnfNote}` : fmtTime(solveValue(solve)) + (solve.p ? ` (${T.plus2})` : ''),
        T.result(solve.m, tps),
        a5 !== null ? T.ao5Line(fmtTime(a5)) : null,
        a12 !== null ? T.ao12Line(fmtTime(a12)) : null,
      ].filter(Boolean).join(' · '),
    });
  }, motion ? 1700 : 400);
}

function sendProgress() {
  if (stats.best) api.progress(T.menuBest(fmtTime(stats.best)));
}

function onUndo() {
  if (!renderer || busy || session.status === 'done') return;
  if (anim?.snap !== undefined || queue.length) flushAnims();
  const t = session.turns.pop();
  if (!t) {
    toast.show(T.nothingToUndo, 1400);
    return;
  }
  enqueue({ axis: t[0], layer: t[1], q: -t[2], kind: 'undo', dur: SPEEDS[settings.speed].key });
  paintInfo();
}

// ---------- ввод ----------

function local(e) {
  const r = ui.stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e) {
  if (gesture || modalActive || !renderer) return;
  audio.get();
  const { x, y } = local(e);
  inertia = null;
  if (viewAnim && !viewAnim.spin) viewAnim = null;
  const hit = canTurn() ? renderer.pick(view, x, y) : null;
  gesture = { id: e.pointerId, x0: x, y0: y, lx: x, ly: y, mode: hit ? 'pending' : 'orbit', hit, samples: [], moved: false };
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    // нет захвата — не страшно
  }
}

/** Решить, какой слой крутит палец: ось из двух лежащих в грани, вдоль которой палец ведёт точку касания. */
function decideTurn(dx, dy) {
  const { point: P, normal: N } = gesture.hit;
  const nAxis = N.findIndex((v) => v);
  const p0 = renderer.project(view, P);
  let best = null;
  for (let a = 0; a < 3; a++) {
    if (a === nAxis) continue;
    const e = [0, 0, 0];
    e[a] = 1;
    // скорость точки при повороте вокруг +a: a × P
    const t = [e[1] * P[2] - e[2] * P[1], e[2] * P[0] - e[0] * P[2], e[0] * P[1] - e[1] * P[0]];
    const eps = 0.01;
    const p1 = renderer.project(view, P.map((v, i) => v + t[i] * eps));
    const ts = [(p1[0] - p0[0]) / eps, (p1[1] - p0[1]) / eps];
    const len = Math.hypot(ts[0], ts[1]);
    if (len < 1) continue;
    const score = Math.abs(ts[0] * dx + ts[1] * dy) / (len * Math.hypot(dx, dy));
    if (!best || score > best.score) best = { axis: a, ts, len2: len * len, score };
  }
  if (!best) return null;
  const layer = Math.max(-1, Math.min(1, Math.round(P[best.axis])));
  return { ...best, layer };
}

function onPointerMove(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const { x, y } = local(e);
  const dx = x - gesture.x0;
  const dy = y - gesture.y0;
  const now = performance.now();
  if (gesture.mode === 'pending') {
    if (dx * dx + dy * dy < DRAG_MIN * DRAG_MIN) return;
    if (!canTurn()) {
      gesture.mode = 'orbit';
    } else {
      const t = decideTurn(dx, dy);
      if (!t) gesture.mode = 'orbit';
      else {
        if (anim || queue.length) flushAnims();
        Object.assign(gesture, { mode: 'turn', axis: t.axis, layer: t.layer, ts: t.ts, len2: t.len2 });
        beginAttempt();
        anim = { axis: t.axis, layer: t.layer, angle: 0 };
      }
    }
  }
  if (gesture.mode === 'turn') {
    const angle = (dx * gesture.ts[0] + dy * gesture.ts[1]) / gesture.len2;
    if (anim) anim.angle = angle;
    gesture.samples.push([now, angle]);
    while (gesture.samples.length > 2 && now - gesture.samples[0][0] > 90) gesture.samples.shift();
    requestFrame();
    return;
  }
  if (gesture.mode === 'orbit') {
    const mx = x - gesture.lx;
    const my = y - gesture.ly;
    gesture.lx = x;
    gesture.ly = y;
    if (Math.abs(dx) + Math.abs(dy) > 6) gesture.moved = true;
    const len = Math.hypot(mx, my);
    if (!len) return;
    const k = 0.0095;
    const axis = [my / len, mx / len, 0];
    view = quatNorm(quatMul(quatAxis(axis, len * k), view));
    gesture.samples.push([now, axis, len * k]);
    while (gesture.samples.length > 2 && now - gesture.samples[0][0] > 90) gesture.samples.shift();
    requestFrame();
  }
}

function onPointerUp(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture;
  gesture = null;
  const now = performance.now();
  if (g.mode === 'turn') {
    const angle = anim?.angle ?? 0;
    let w = 0;
    if (g.samples.length >= 2) {
      const [t0, a0] = g.samples[0];
      const [t1, a1] = g.samples[g.samples.length - 1];
      if (t1 > t0) w = ((a1 - a0) / (t1 - t0)) * 1000;
    }
    const q = angle / (Math.PI / 2);
    let target = Math.abs(w) > 5 ? (w > 0 ? Math.ceil(q - 0.15) : Math.floor(q + 0.15)) : Math.round(q);
    target = Math.max(-2, Math.min(2, target));
    const delta = Math.abs(target * (Math.PI / 2) - angle) / (Math.PI / 2);
    anim = {
      axis: g.axis, layer: g.layer, from: angle, to: (target * Math.PI) / 2, angle, t0: performance.now(),
      dur: reducedMotion() ? 1 : Math.max(60, Math.min(220, delta * SPEEDS[settings.speed].key * 1.6)), snap: target,
    };
    requestFrame();
    return;
  }
  if (g.mode === 'orbit') {
    if (!g.moved) {
      // двойное касание мимо кубика — вид по умолчанию
      if (now - lastTap < 320) {
        lastTap = 0;
        viewAnim = { from: view.slice(), to: DEFAULT_VIEW.slice(), t0: now, dur: reducedMotion() ? 1 : 420 };
        requestFrame();
      } else lastTap = now;
      return;
    }
    if (g.samples.length >= 2 && !reducedMotion()) {
      const [t0] = g.samples[0];
      const [t1, axis] = g.samples[g.samples.length - 1];
      const total = g.samples.slice(1).reduce((s, v) => s + v[2], 0);
      if (t1 > t0 && now - t1 < 60) {
        inertia = { axis, speed: total / (t1 - t0), t: now };
        requestFrame();
      }
    }
  }
}

/** Ход с клавиатуры — относительно того, как кубик сейчас повёрнут к игроку. */
function viewTurn(letter, k) {
  const m = quatToMat3(view);
  const cam = FACE_NORMAL.map((n) => [
    m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[3] * n[0] + m[4] * n[1] + m[5] * n[2], m[6] * n[0] + m[7] * n[1] + m[8] * n[2],
  ]);
  const argmax = (i) => cam.reduce((b, v, f) => (v[i] > cam[b][i] ? f : b), 0);
  const front = argmax(2);
  const up = argmax(1);
  const right = argmax(0);
  const opp = (f) => (f + 3) % 6;
  const map = { F: front, B: opp(front), U: up, D: opp(up), R: right, L: opp(right) };
  const slice = { M: 'L', E: 'D', S: 'F' }[letter];
  const face = FACES[map[slice ?? letter]];
  const def = MOVE_DEF[face];
  return { axis: def.axis, layer: slice ? 0 : def.layer, q: def.cw * k };
}

function onKeydown(e) {
  if (modalActive) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    onUndo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();
    onScramble();
    return;
  }
  const letter = KEY_FACE[e.code];
  if (!letter || !renderer) return;
  e.preventDefault();
  audio.get();
  const k = e.shiftKey ? 3 : 1;
  if (letter === 'x' || letter === 'y' || letter === 'z') {
    const axis = [letter === 'x' ? 1 : 0, letter === 'y' ? 1 : 0, letter === 'z' ? 1 : 0];
    const angle = (e.shiftKey ? 1 : -1) * (Math.PI / 2);
    const from = viewAnim?.to ?? view;
    viewAnim = { from: view.slice(), to: quatNorm(quatMul(quatAxis(axis, angle), from)), t0: performance.now(), dur: reducedMotion() ? 1 : 200 };
    requestFrame();
    return;
  }
  if (!canTurn() || queue.length > 6) return;
  if (anim?.snap !== undefined) finishAnim();
  beginAttempt();
  enqueue({ ...viewTurn(letter, k), kind: 'user', dur: SPEEDS[settings.speed].key });
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
  return el('div', { class: 'rb-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'rb-card-head' },
      el('h2', {}, title),
      el('button', { class: 'rb-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showRules() {
  openModal(card(T.help,
    ...T.rules.map((line) => el('p', { class: 'rb-note rb-rules' }, line)),
    el('button', { class: 'btn rb-play', onclick: closeModal }, T.gotIt),
  ));
}

function showStats() {
  const tile = (value, label) => el('div', { class: 'rb-stat-tile' }, el('b', {}, value), el('span', {}, label));
  const a5 = averageOf(history, 5);
  const a12 = averageOf(history, 12);
  const recent = history.slice(-12).reverse();
  const n = stats.count;
  openModal(card(T.stats,
    el('div', { class: 'rb-stat-grid' },
      tile(String(stats.count), T.count),
      tile(stats.best ? fmtTime(stats.best) : '—', T.bestSingle),
      tile(a5 === null ? '—' : fmtTime(a5), T.currentAo5),
      tile(a12 === null ? '—' : fmtTime(a12), T.currentAo12),
      tile(stats.bestAo5 ? fmtTime(stats.bestAo5) : '—', T.bestAo5),
      tile(stats.bestMoves ? String(stats.bestMoves) : '—', T.bestMoves),
    ),
    el('h3', { class: 'rb-section' }, T.recent),
    recent.length
      ? el('ol', { class: 'rb-list' }, recent.map((s, i) => el('li', {},
        el('span', { class: 'rb-n' }, `${n - i}`),
        el('b', {}, s.p === DNF ? `DNF (${fmtTime(s.t)})` : fmtTime(solveValue(s)) + (s.p ? '+' : '')),
        el('span', { class: 'rb-m' }, `${s.m} ${plural(s.m, 'ход', 'хода', 'ходов')}`),
      )))
      : el('p', { class: 'rb-note' }, T.none),
  ));
}

const saveSettings = () => api.storage.set('settings', settings);

/** Образец оформления: кубик в изометрии (верх, лицо, право по 9 наклеек). */
function isoSwatch(skin) {
  const pal = PALETTES[skin];
  const c30 = Math.cos(Math.PI / 6);
  const pr = (x, y, z) => [(x - z) * c30 * 10 + 30, (-y + (x + z) * 0.5) * 10 + 30];
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`;
  const parts = [];
  const faces = [
    { f: 0, pt: (u, v) => pr(u - 1.5, 1.5, v - 1.5) },
    { f: 2, pt: (u, v) => pr(u - 1.5, 1.5 - v, 1.5) },
    { f: 1, pt: (u, v) => pr(1.5, 1.5 - v, 1.5 - u) },
  ];
  for (const { f, pt } of faces) {
    parts.push(poly([pt(0, 0), pt(3, 0), pt(3, 3), pt(0, 3)], pal.body));
    const g = (1 - pal.size) / 2;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) parts.push(poly([pt(i + g, j + g), pt(i + 1 - g, j + g), pt(i + 1 - g, j + 1 - g), pt(i + g, j + 1 - g)], pal.colors[f]));
    }
  }
  const span = el('span', { class: 'rb-swatch' });
  span.innerHTML = `<svg viewBox="2 0 56 62" width="52" height="56" aria-hidden="true">${parts.join('')}</svg>`;
  return span;
}

function applySkin() {
  const pal = PALETTES[settings.skin];
  renderer?.setStyle({ palette: [...pal.colors, pal.body, pal.body], size: pal.size, radius: pal.radius });
  requestFrame();
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'rb-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      skins.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === id)));
      applySkin();
      sfx('click');
    },
  }, isoSwatch(id), el('span', {}, T.skins[id])));
  const speeds = Object.keys(SPEEDS).map((id) => el('button', {
    class: 'rb-option', role: 'radio', 'aria-checked': String(settings.speed === id),
    onclick: () => {
      settings.speed = id;
      saveSettings();
      speeds.forEach((b, k) => b.setAttribute('aria-checked', String(Object.keys(SPEEDS)[k] === id)));
    },
  }, T.speeds[id]));
  const insp = el('input', { type: 'checkbox', checked: settings.inspection });
  insp.addEventListener('change', () => {
    settings.inspection = insp.checked;
    saveSettings();
  });
  openModal(card(T.settings,
    el('h3', { class: 'rb-section' }, T.skin),
    el('div', { class: 'rb-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'rb-section' }, T.speed),
    el('div', { class: 'rb-options', role: 'radiogroup' }, speeds),
    el('label', { class: 'rb-toggle' }, insp, el('span', {}, T.inspection)),
    el('p', { class: 'rb-note' }, T.scrambleNote),
  ));
}

function iconButton(icon, label, onclick) {
  const b = el('button', { class: 'rb-icon-btn', 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick, cls = 'rb-tool') {
  const b = el('button', { class: cls, onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'rb-tool-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function onVisibility() {
  if (document.visibilityState !== 'visible') {
    if (busy === 'scramble' || busy === 'solve') flushAnims();
    save();
  }
  syncClock();
}

function onResize() {
  if (!renderer || !ui) return;
  const r = ui.stage.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  renderer.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2.5));
  requestFrame();
}

function setupRenderer() {
  try {
    renderer = createRenderer(ui.canvas);
  } catch (err) {
    console.warn('кубик: WebGL', err);
    renderer = null;
  }
  if (!renderer) {
    ui.hint.textContent = T.noGl;
    ui.hint.classList.add('rb-show');
    return;
  }
  applySkin();
  onResize();
}

export default {
  id: 'rubik',
  title: 'Кубик Рубика',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedHistory, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('history'), api.storage.get('settings'),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? { ...emptyStats(), ...savedStats } : emptyStats();
    history = isValidHistory(savedHistory) ? savedHistory : [];
    settings = normalizeSettings(savedSettings);
    host.dataset.skin = settings.skin;

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      soundBtn.setAttribute('aria-label', soundBtn.title);
      sfx('click');
    });
    const meta = (label, node) => el('span', { class: 'rb-meta-item' }, el('span', {}, label), node);
    ui = {
      sub: el('div', { class: 'rb-sub' }),
      time: el('div', { class: 'rb-time' }, '0.00'),
      moves: el('b', {}, '0'),
      ao5: el('b', {}, '—'),
      best: el('b', {}, '—'),
      scramble: el('div', { class: 'rb-scramble', 'aria-live': 'polite' }),
      stage: el('div', { class: 'rb-stage' }),
      canvas: el('canvas', { class: 'rb-canvas' }),
      hint: el('div', { class: 'rb-hint' }),
      modal: el('div', { class: 'rb-modal', hidden: true }),
    };
    ui.undoBtn = toolButton(ICONS.undo, T.undo, onUndo);
    ui.scrambleBtn = toolButton(ICONS.shuffle, T.scramble, onScramble, 'rb-tool rb-primary');
    ui.solveBtn = toolButton(ICONS.solve, T.solve, onSolve);
    ui.stage.append(ui.canvas, ui.hint);
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerUp);
    ui.stage.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    ui.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    ui.canvas.addEventListener('webglcontextrestored', () => {
      renderer = null;
      setupRenderer();
    });
    root = el('div', { class: 'rb' },
      el('div', { class: 'rb-header' },
        el('div', { class: 'rb-head-text' }, el('div', { class: 'rb-title' }, T.title), ui.sub),
        el('div', { class: 'rb-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
          iconButton(ICONS.help, T.help, showRules),
        ),
      ),
      el('div', { class: 'rb-timer' },
        ui.time,
        el('div', { class: 'rb-meta' }, meta(T.moves, ui.moves), meta(T.ao5, ui.ao5), meta(T.best, ui.best)),
      ),
      ui.scramble,
      ui.stage,
      el('div', { class: 'rb-tools' }, ui.undoBtn, ui.scrambleBtn, ui.solveBtn),
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'rb-fx');
    root.append(fx.canvas);

    if (isValidSave(saved)) {
      model = decodeModel(saved.cubies);
      session = newSession({
        status: saved.status, scramble: saved.scramble ? saved.scramble.split(' ') : [], moves: saved.moves,
        time: saved.time, inspect: saved.inspect, penalty: saved.penalty === 2000 || saved.penalty === DNF ? saved.penalty : 0,
        turns: saved.turns.slice(), peak: Number.isInteger(saved.peak) && saved.peak >= 0 ? saved.peak : 0, beeps: saved.inspect >= 12000 ? 2 : saved.inspect >= 8000 ? 1 : 0,
      });
    } else {
      model = newModel();
      session = newSession();
    }
    view = DEFAULT_VIEW.slice();
    setupRenderer();
    resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(ui.stage);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = setInterval(paintClock, 40);
    paintScramble();
    paintInfo();
    syncClock();
    sendProgress();
    ensureWorker();
    if (!savedSettings && !saved) showRules();

    if (new URLSearchParams(location.search).has('rbdebug')) {
      window.__rb = {
        get model() { return model; },
        get session() { return session; },
        get view() { return view; },
        get busy() { return busy; },
        turn: (token) => { const t = moveToTurn(parseMove(token)); beginAttempt(); enqueue({ ...t, kind: 'user', dur: 60 }); },
        scramble: () => onScramble(),
        solve: () => onSolve(),
        skin: (id) => { settings.skin = id; applySkin(); },
        setView: (q) => { view = q; requestFrame(); },
        project: (p) => renderer.project(view, p),
        flush: () => flushAnims(),
      };
    }
  },

  getState() {
    if (!session || !['running', 'inspect', 'ready'].includes(session.status)) return null;
    flushAnims();
    save();
    return { moves: session.moves };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    clearInterval(clockTimer);
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    resizeObs?.disconnect();
    if (session && api) {
      if (busy === 'scramble' || busy === 'solve') flushAnims();
      if (busy === 'scramble' && session.status === 'free') scrambled();
      syncClock();
      if (session.status !== 'done') save();
    }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    toast?.dispose();
    fx?.dispose();
    renderer?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = host = root = ui = toast = fx = renderer = gesture = inertia = viewAnim = anim = session = null;
    queue = [];
    busy = null;
    modalActive = false;
    runSince = 0;
    inspectSince = 0;
    clockTimer = 0;
    resizeObs = null;
    lastTap = 0;
  },
};
