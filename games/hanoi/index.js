// Ханойская башня: перенеси башню на последний стержень (с флажком). Брать можно только верхний диск, класть —
// на пустой стержень или на больший диск. Касание стержня поднимает верхний диск, касание другого — опускает
// туда; диск можно и перетащить пальцем. 3–10 дисков, 3 или 4 стержня, отмена без ограничений (каждая — ход),
// подсказка — лучший ход из любой позиции (с ней рекорд и «идеально» не засчитываются), рекорды по размерам.
// Правила — logic.js, звуки — sounds.js.
//
// Отрисовка — DOM в «полу-3D»: диск — цилиндр, видимый чуть сверху (боковина с градиентом, верхний эллипс с
// отверстием), стержень стоит позади дисков, а из отверстия верхнего диска торчит его кусочек («стаб») — кажется,
// что стержень проходит сквозь диски. Геометрия считается в px под размер сцены (layout), диски — абсолютные
// элементы с transform; полёт — Web Animations по ломаной «вверх — вбок — вниз». Ввод не ждёт анимацию.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  DISKS, PEGS, DEFAULT_DISKS, DEFAULT_PEGS, minMoves, newGame, move, undo, canMove, top, target, bestMove,
  remaining, distances, isValidGame, emptyStats, isValidStats, recordGame, statKey, biggestTower, fmtTime,
} from './logic.js';
import { pointsInfo } from '../../shared/points-info.js';

const SKINS = ['telegram', 'wood', 'temple', 'neon', 'candy', 'ice'];
const DRAG_MIN = 8;
const SPEED = 1.6;                   // px/мс — скорость полёта диска
const T = {
  title: 'Ханойская башня',
  sub: (n, p) => `${n} ${plural(n, 'диск', 'диска', 'дисков')} · ${p} ${plural(p, 'стержень', 'стержня', 'стержней')}`,
  moves: 'Ходы',
  min: 'Минимум',
  time: 'Время',
  undo: 'Отменить',
  hint: 'Подсказка',
  nothingToUndo: 'Нечего отменять',
  blocked: 'Больший диск на меньший класть нельзя',
  hintLeft: (k) => `До цели — минимум ${k} ${plural(k, 'ход', 'хода', 'ходов')}`,
  hintNote: 'С подсказкой рекорд и «идеально» не засчитываются',
  newGame: 'Новая башня',
  newShort: 'Новая',
  disks: 'Сколько дисков',
  pegs: 'Стержни',
  pegsHint: { 3: 'Классика', 4: 'Короче, но хитрее' },
  minLine: (k) => `мин. ${k}`,
  restartNote: 'Начатая башня засчитается несобранной.',
  start: 'Начать',
  marks: '✓ — собрано, ★ — за минимум ходов',
  rules: [
    'Перенеси всю башню на стержень с флажком.',
    'Бери только верхний диск: коснись стержня — диск поднимется, коснись другого — опустится туда. Можно и перетащить пальцем.',
    'Класть можно только на пустой стержень или на диск побольше.',
    'Меньше всего ходов на трёх стержнях — 2ⁿ − 1: для 4 дисков это 15, для 5 — 31. Собери за минимум — будет «Идеально».',
  ],
  legend: 'Легенда: где-то в храме монахи переносят 64 золотых диска по тем же правилам. Когда закончат — наступит конец света. По ходу в секунду им понадобится 585 миллиардов лет.',
  gotIt: 'Играть',
  howTo: 'Как играть',
  win: 'Башня собрана!',
  perfect: 'Идеально!',
  record: 'Новый рекорд!',
  result: (n, m) => `${n} ${plural(n, 'диск', 'диска', 'дисков')} · ${m} ${plural(m, 'ход', 'хода', 'ходов')}`,
  exact: 'ровно минимум',
  minimum: (k) => `минимум ${k}`,
  withHints: 'с подсказками',
  bestTime: (t) => `рекорд: ${t}`,
  menu: (n) => `Рекорд: ${n} ${plural(n, 'диск', 'диска', 'дисков')}`,
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  skin: 'Оформление',
  skins: { telegram: 'По умолчанию', wood: 'Дерево', temple: 'Храм', neon: 'Неон', candy: 'Конфета', ice: 'Лёд' },
  options: 'Игра',
  targets: 'Подсвечивать, куда можно положить диск',
  numbers: 'Номера на дисках',
  head: ['Диски', 'Собрано', 'Ходы', 'Время', '★'],
  pegsTab: (p) => `${p} ${plural(p, 'стержень', 'стержня', 'стержней')}`,
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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  flag: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 4h11l-2.4 3.5L17 11H6Z" fill="currentColor"/></svg>',
};

const defaultSettings = () => ({ n: DEFAULT_DISKS, pegs: DEFAULT_PEGS, skin: 'telegram', targets: true, numbers: false });

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let G = null;                        // геометрия сцены (layout)
let stats = emptyStats();
let settings = defaultSettings();
let soundOn = true;
let modalActive = false;
let modalToken = 0;
let finishing = false;
let lifted = -1;                     // стержень, с которого поднят диск (−1 — ничего)
let pd = null;                       // нажатие: { id, x, y, peg, from, dragging }
let hintMove = null;
let warnedBlocked = false;
let warnedHint = false;
let runSince = 0;
let clockTimer = 0;
let resizer = null;
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

// ---------- сцена: геометрия ----------

/**
 * Геометрия под размер сцены. Диск d (0 — самый маленький): ширина w(d), толщина h (одна на всех), высота
 * верхнего эллипса e(d) — «взгляд чуть сверху». Нижний центр k-го диска стопки — slotY(k), поднятого — liftY.
 */
function layout() {
  const W = ui.stage.clientWidth;
  const H = ui.stage.clientHeight;
  if (!W || !H || !game) return null;
  const P = game.pegs;
  const n = game.n;
  const colW = W / P;
  const rw = clamp(colW * 0.055, 5, 11);
  const maxW = Math.min(colW * 0.86, 250);
  const minW = Math.max(rw * 3.4, maxW * 0.3);
  const ratio = 0.17;
  const labelH = 24;
  const front = clamp(maxW * 0.1, 9, 16);
  const eMax = maxW * ratio;
  const eb = Math.min(eMax * 1.25, 30);
  // толщина: чтобы поместились стопка, запас над стержнем для поднятого диска, подставка и флажок
  const avail = H - 14 - labelH - front - eb / 2 - eMax - 8;
  const h = clamp(avail / (n + 2), 7, Math.min(30, maxW * 0.22));
  const e = (w) => Math.min(w * ratio, h * 1.15);
  const need = 14 + h + e(maxW) + 8 + (n + 1) * h + eb / 2 + front + labelH;
  const spare = Math.max(0, H - need);
  const baseY = H - labelH - front - eb / 2 - spare * 0.45;
  const rodTop = baseY - (n + 1) * h;
  return {
    W, H, P, n, colW, rw, maxW, minW, h, eb, front, baseY, rodTop,
    liftY: rodTop - 8 - e(maxW) / 2,
    pegX: (p) => colW * (p + 0.5),
    w: (d) => (n > 1 ? minW + ((maxW - minW) * d) / (n - 1) : maxW),
    e: (d) => e(n > 1 ? minW + ((maxW - minW) * d) / (n - 1) : maxW),
    slotY: (k) => baseY - k * h,
  };
}

/** Где диск лежит по правилам: стержень и место в стопке. */
function whereIs(d) {
  for (let p = 0; p < game.pegs; p++) {
    const k = game.towers[p].indexOf(d);
    if (k >= 0) return { p, k };
  }
  return { p: 0, k: 0 };
}

function restPos(d) {
  const { p, k } = whereIs(d);
  if (p === lifted && k === game.towers[p].length - 1) return [G.pegX(p), G.liftY];
  return [G.pegX(p), G.slotY(k)];
}

const tr = (d, [x, y]) => `translate(${(x - G.w(d) / 2).toFixed(1)}px, ${(y - G.h - G.e(d) / 2).toFixed(1)}px)`;

function setPos(d, pt) {
  const node = ui.disks[d];
  node.style.transform = tr(d, pt);
  node._pt = pt;
}

/** Классы покоя: на стержне (видно, как стержень проходит сквозь), слой по месту в стопке. */
function rest(d) {
  const node = ui.disks[d];
  const { p, k } = whereIs(d);
  const up = p === lifted && k === game.towers[p].length - 1;
  node.classList.toggle('th-onrod', !up);
  node.classList.toggle('th-up', up);
  node.classList.remove('th-fly', 'th-drag');
  node.style.zIndex = up ? 60 : 10 + k;
}

function stopAnim(d) {
  const node = ui.disks[d];
  node._flight = (node._flight ?? 0) + 1;
  node._anim?.cancel();
  node._anim = null;
}

/** Поставить всё по местам без анимации (новая партия, размер окна). */
function placeAll() {
  if (!G) return;
  for (let d = 0; d < game.n; d++) {
    stopAnim(d);
    setPos(d, restPos(d));
    rest(d);
  }
}

function applyGeometry() {
  G = layout();
  if (!G) return;
  const { W, H, P, rw, maxW, eb, front, baseY, rodTop } = G;
  ui.scene.style.setProperty('--rw', `${rw}px`);
  ui.scene.style.setProperty('--eb', `${eb}px`);
  const left = Math.max(4, G.colW * 0.5 - maxW / 2 - 6);
  Object.assign(ui.base.style, {
    left: `${left}px`, width: `${W - left * 2}px`, top: `${baseY - eb / 2}px`, height: `${eb + front}px`,
  });
  ui.pegs.forEach(({ rod, spot }, p) => {
    const x = G.pegX(p);
    Object.assign(rod.style, { left: `${x - rw / 2}px`, top: `${rodTop}px`, height: `${baseY - rodTop}px` });
    Object.assign(spot.style, { left: `${x - maxW * 0.55}px`, width: `${maxW * 1.1}px`, top: `${baseY - eb * 0.42}px`, height: `${eb * 0.84}px` });
  });
  Object.assign(ui.goal.style, { left: `${G.pegX(target(game))}px`, top: `${baseY + eb / 2 + front + 3}px` });
  for (let d = 0; d < game.n; d++) {
    const w = G.w(d);
    const e = G.e(d);
    const hw = Math.min(rw * 1.3, w * 0.3);
    const s = ui.disks[d].style;
    s.setProperty('--w', `${w}px`);
    s.setProperty('--h', `${G.h}px`);
    s.setProperty('--e', `${e}px`);
    s.setProperty('--hw', `${hw}px`);
    s.setProperty('--he', `${(hw * e) / w}px`);
    s.fontSize = `${clamp(G.h * 0.62, 8, 16)}px`;
  }
  ui.arrow.setAttribute('viewBox', `0 0 ${W} ${H}`);
  placeAll();
  if (hintMove) drawArrow(hintMove);
}

function buildScene() {
  const n = game.n;
  ui.pegs = Array.from({ length: game.pegs }, (_, p) => ({
    spot: el('div', { class: 'th-spot' }),
    rod: el('div', { class: `th-rod${p === target(game) ? ' th-target' : ''}` }),
  }));
  ui.disks = Array.from({ length: n }, (_, d) => diskEl(d, n));
  ui.base = el('div', { class: 'th-base' }, el('div', { class: 'th-base-top' }));
  ui.goal = el('div', { class: 'th-goal' });
  ui.goal.innerHTML = ICONS.flag;
  ui.arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ui.arrow.setAttribute('class', 'th-arrow');
  ui.arrow.innerHTML = '<defs><marker id="th-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs><path class="th-arrow-path" marker-end="url(#th-head)"/>';
  ui.scene.replaceChildren(
    ui.base,
    ...ui.pegs.map((g) => g.spot),
    ...ui.pegs.map((g) => g.rod),
    ui.goal,
    ...ui.disks,
    ui.arrow,
  );
  hintMove = null;
  lifted = -1;
  root.classList.remove('th-won');
  ui.sub.textContent = T.sub(game.n, game.pegs);
  applyGeometry();
  paintInfo();
}

/** Диск: боковина, верхний эллипс, отверстие и кусочек стержня над ним. --t: 0 — самый большой, 1 — маленький. */
function diskEl(d, n) {
  return el('div', { class: 'th-disk', 'data-d': d, style: `--t: ${n > 1 ? ((n - 1 - d) / (n - 1)).toFixed(3) : 0}` },
    el('div', { class: 'th-face' },
      el('div', { class: 'th-side' }, el('span', { class: 'th-num' }, String(d + 1))),
      el('div', { class: 'th-top' }),
      el('div', { class: 'th-hole' }),
      el('div', { class: 'th-stub' }),
    ));
}

function applyOptions() {
  host.dataset.skin = settings.skin;
  root.classList.toggle('th-nums', settings.numbers);
}

function paintInfo() {
  if (!ui?.moves || !game) return;
  const m = String(game.moves);
  if (ui.moves.textContent !== m) ui.moves.textContent = m;
  const t = fmtTime(elapsed());
  if (ui.clock.textContent !== t) ui.clock.textContent = t;
  const min = String(minMoves(game.n, game.pegs));
  if (ui.min.textContent !== min) ui.min.textContent = min;
  ui.moves.classList.toggle('th-over-min', game.moves > Number(min));
  ui.undoBtn.disabled = !game.history.length || game.done || finishing;
  ui.hintBtn.disabled = game.done || finishing;
}

// ---------- полёт диска ----------

/**
 * Полёт по ломаной points (от текущего места): скорость постоянная, взлёт — с замедлением, посадка — с ускорением.
 * onLand — когда диск сел (если полёт не перебили новым действием с этим же диском). → длительность, мс.
 */
function fly(d, points, onLand) {
  const node = ui.disks[d];
  stopAnim(d);
  const id = node._flight;
  const from = node._pt;
  setPos(d, points[points.length - 1]);
  node.style.zIndex = 100;
  const pts = [from, ...points];
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const land = () => { if (ui && node._flight === id) onLand?.(); };
  if (reducedMotion() || total < 1) {
    land();
    return 0;
  }
  const dur = clamp(total / SPEED, 140, 560);
  let acc = 0;
  const frames = pts.map((p, i) => {
    const f = { transform: tr(d, p), offset: total ? acc / total : 0 };
    if (i < lens.length) acc += lens[i];
    f.easing = i === 0 && pts.length > 2 ? 'cubic-bezier(0.2, 0.7, 0.4, 1)' : i === pts.length - 2 ? 'cubic-bezier(0.55, 0, 0.8, 0.45)' : 'ease-in-out';
    return f;
  });
  frames[frames.length - 1].offset = 1;
  node._anim = node.animate(frames, { duration: dur });
  node._anim.finished.then(land, () => {});
  return dur;
}

/** Диск сел на стержень: мягкое «приседание», стук и нота. */
function landed(d) {
  rest(d);
  sfx('drop', { disk: d, n: game.n }, 0);
  api?.platform.haptic.impact('light');
  if (!reducedMotion()) {
    animate(ui.disks[d].firstChild, [{ scale: '1 1' }, { scale: '1.04 0.86' }, { scale: '0.99 1.03' }, { scale: '1 1' }],
      { duration: 220, easing: 'ease-out' });
  }
}

// ---------- действия ----------

const canPlay = () => game && !game.done && !finishing && !modalActive;

function markTargets(from) {
  ui.pegs.forEach(({ spot, rod }, p) => {
    const can = from >= 0 && settings.targets && p !== from && canMove(game, from, p);
    spot.classList.toggle('th-can', can);
    rod.classList.toggle('th-can', can);
  });
}

function markOver(p) {
  ui.pegs.forEach(({ spot, rod }, q) => {
    const on = q === p && spot.classList.contains('th-can');
    spot.classList.toggle('th-over', on);
    rod.classList.toggle('th-over', on);
  });
}

function clearHint() {
  if (!hintMove) return;
  hintMove = null;
  ui.arrow.classList.remove('th-show');
  ui.disks.forEach((node) => node.classList.remove('th-hinted'));
}

function lift(p) {
  const d = top(game, p);
  if (d < 0) return;
  lifted = p;
  const node = ui.disks[d];
  node.classList.remove('th-onrod');
  node.classList.add('th-fly');
  fly(d, [[G.pegX(p), G.liftY]], () => rest(d));
  markTargets(p);
  sfx('lift', { disk: d, n: game.n }, 0);
  api.platform.haptic.selection();
}

function putBack() {
  const p = lifted;
  if (p < 0) return;
  const d = top(game, p);
  lifted = -1;
  markTargets(-1);
  const { k } = whereIs(d);
  fly(d, [[G.pegX(p), G.slotY(k)]], () => {
    rest(d);
    sfx('back', { disk: d, n: game.n }, 0);
  });
}

/** Нельзя: глухой «бум» и покачивание диска (translate — место диска задано transform'ом). */
function refuse(d) {
  sfx('blocked', {}, 120);
  api.platform.haptic.notification('error');
  if (!warnedBlocked) {
    warnedBlocked = true;
    toast.show(T.blocked, 1800);
  }
  if (d < 0 || reducedMotion()) return;
  animate(ui.disks[d].firstChild, [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }],
    { duration: 260, easing: 'ease-out' });
}

/** Ход from → to. drag — диск уже в руке (перетаскивание): летит от того места, где его отпустили. */
function doMove(from, to, { drag = false } = {}) {
  const wasUp = lifted === from;
  const d = top(game, from);
  const r = move(game, from, to);
  if (!r) {
    refuse(d);
    return;
  }
  lifted = -1;
  markTargets(-1);
  clearHint();
  const node = ui.disks[d];
  node.classList.remove('th-onrod', 'th-up', 'th-drag');
  node.classList.add('th-fly');
  if (!wasUp && !drag) sfx('lift', { disk: d, n: game.n }, 0);
  const k = game.towers[to].length - 1;
  const pts = [];
  if (!wasUp && !drag) pts.push([G.pegX(from), G.liftY]);
  pts.push([G.pegX(to), drag ? Math.min(node._pt[1], G.liftY) : G.liftY]);
  pts.push([G.pegX(to), G.slotY(k)]);
  const dur = fly(d, pts, () => landed(d));
  afterMove(dur);
}

function afterMove(dur = 0) {
  syncClock();                                 // первый ход (или первый после загрузки) — часы пошли
  paintInfo();
  if (game.done) {
    finishing = true;
    syncClock();
    later(win, dur + 120);
  } else save();
}

function tapPeg(p) {
  if (!canPlay() || p < 0) return;
  audio.get();
  if (lifted >= 0) {
    if (p === lifted) putBack();
    else if (canMove(game, lifted, p)) doMove(lifted, p);
    else refuse(top(game, lifted));
  } else if (top(game, p) >= 0) {
    if (hintMove && hintMove[0] !== p) clearHint();
    lift(p);
  }
}

function onUndo() {
  if (!game || game.done || finishing || modalActive) return;
  if (lifted >= 0) {
    const d = top(game, lifted);
    lifted = -1;
    markTargets(-1);
    stopAnim(d);
    setPos(d, restPos(d));
    rest(d);
  }
  const r = undo(game);
  if (!r) {
    toast.show(T.nothingToUndo, 1400);
    return;
  }
  clearHint();
  const node = ui.disks[r.disk];
  node.classList.remove('th-onrod');
  node.classList.add('th-fly');
  const k = game.towers[r.to].length - 1;
  fly(r.disk, [[G.pegX(r.from), G.liftY], [G.pegX(r.to), G.liftY], [G.pegX(r.to), G.slotY(k)]], () => {
    rest(r.disk);
    sfx('back', { disk: r.disk, n: game.n }, 0);
  });
  sfx('undo');
  api.platform.haptic.selection();
  paintInfo();
  save();
}

function onHint() {
  if (!canPlay()) return;
  audio.get();
  const m = bestMove(game);
  if (!m) return;
  if (lifted >= 0 && lifted !== m[0]) putBack();
  game.hints++;
  hintMove = m;
  drawArrow(m);
  ui.disks.forEach((node) => node.classList.remove('th-hinted'));
  ui.disks[top(game, m[0])].classList.add('th-hinted');
  sfx('hint', {}, 0);
  if (!warnedHint) {
    warnedHint = true;
    toast.show(T.hintNote, 2200);
  } else toast.show(T.hintLeft(remaining(game)), 1600);
  save();
}

/** Стрелка подсказки: дуга с верха стопки a к месту на стержне b. */
function drawArrow([a, b]) {
  if (!G) return;
  const x0 = G.pegX(a);
  const y0 = G.slotY(game.towers[a].length) - G.h * 0.6;
  const x1 = G.pegX(b);
  const y1 = G.slotY(game.towers[b].length) - G.h * 0.9;
  const cy = Math.max(G.h, G.liftY - G.h * 1.6);
  ui.arrow.querySelector('path.th-arrow-path').setAttribute('d', `M${x0} ${y0} C${x0} ${cy} ${x1} ${cy} ${x1} ${y1}`);
  ui.arrow.classList.remove('th-show');
  void ui.arrow.getBoundingClientRect();
  ui.arrow.classList.add('th-show');
}

// ---------- ввод ----------

function pegAt(clientX) {
  const r = ui.stage.getBoundingClientRect();
  return clamp(Math.floor(((clientX - r.left) / r.width) * game.pegs), 0, game.pegs - 1);
}

function onPointerDown(e) {
  if (!canPlay() || pd || !G) return;
  audio.get();
  const peg = pegAt(e.clientX);
  const from = lifted >= 0 ? lifted : top(game, peg) >= 0 ? peg : -1;
  pd = { id: e.pointerId, x: e.clientX, y: e.clientY, peg, from, dragging: false };
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    // без захвата — тоже работает
  }
}

function onPointerMove(e) {
  if (!pd || e.pointerId !== pd.id) return;
  if (!pd.dragging) {
    if (pd.from < 0 || !canPlay() || Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < DRAG_MIN) return;
    pd.dragging = true;
    const d = top(game, pd.from);
    if (lifted !== pd.from) {
      sfx('lift', { disk: d, n: game.n }, 0);
      api.platform.haptic.selection();
    }
    lifted = pd.from;
    clearHint();
    stopAnim(d);
    const node = ui.disks[d];
    node.classList.remove('th-onrod', 'th-up');
    node.classList.add('th-fly', 'th-drag');
    node.style.zIndex = 100;
    markTargets(pd.from);
  }
  const r = ui.stage.getBoundingClientRect();
  const d = top(game, pd.from);
  setPos(d, [clamp(e.clientX - r.left, G.w(d) * 0.3, r.width - G.w(d) * 0.3), clamp(e.clientY - r.top - G.h * 0.9, G.h + G.e(d), r.height)]);
  markOver(pegAt(e.clientX));
}

function onPointerUp(e) {
  if (!pd || e.pointerId !== pd.id) return;
  const p = pd;
  pd = null;
  markOver(-1);
  if (p.dragging) {
    dropDrag(p.from, pegAt(e.clientX));
    return;
  }
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_MIN * 2) tapPeg(p.peg);
}

/** Отпустил перетаскиваемый диск: над подходящим стержнем — ход, иначе домой. */
function dropDrag(from, to) {
  if (!game || game.done) return;
  if (to !== from && canMove(game, from, to)) {
    doMove(from, to, { drag: true });
    return;
  }
  const d = top(game, from);
  lifted = -1;
  markTargets(-1);
  ui.disks[d].classList.remove('th-drag');
  const { k } = whereIs(d);
  const cur = ui.disks[d]._pt;
  fly(d, [[G.pegX(from), Math.min(cur[1], G.liftY)], [G.pegX(from), G.slotY(k)]], () => {
    rest(d);
    sfx('back', { disk: d, n: game.n }, 0);
  });
  if (to !== from) refuse(-1);
}

function onPointerCancel() {
  if (!pd) return;
  const p = pd;
  pd = null;
  markOver(-1);
  if (p.dragging) dropDrag(p.from, p.from);
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
  if (e.ctrlKey || e.metaKey || e.altKey || !game) return;
  const digit = /^(Digit|Numpad)([1-4])$/.exec(e.code);
  if (digit && Number(digit[2]) <= game.pegs) {
    e.preventDefault();
    tapPeg(Number(digit[2]) - 1);
  } else if (e.key === 'Escape' && lifted >= 0) putBack();
  else if (e.code === 'KeyH') onHint();
}

// ---------- победа ----------

function win() {
  if (!api || !game) return;
  const n = game.n;
  const key = statKey(game.pegs, n);
  const min = minMoves(n, game.pegs);
  const ms = game.time;
  const prev = { ...stats[key] };
  stats = recordGame(stats, game, { win: true });
  api.storage.set('stats', stats);
  api.storage.remove('current');
  sendProgress();
  const clean = !game.hints;
  const perfect = clean && game.moves === min;
  const record = clean && (!prev.bestTime || ms < prev.bestTime) && prev.wins > 0;
  root.classList.add('th-won');
  api.platform.haptic.notification('success');
  const motion = !reducedMotion();
  const tower = game.towers[target(game)];
  // волна снизу вверх: каждый диск подпрыгивает и звенит своей нотой
  const step = clamp(520 / n, 55, 110);
  tower.forEach((d, k) => {
    later(() => sfx('note', { disk: d, n }, 0), k * step);
    if (motion) {
      animate(ui.disks[d].firstChild, [{ translate: '0 0' }, { translate: `0 ${-G.h * 1.1}px` }, { translate: '0 0' }],
        { duration: 380, delay: k * step, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' });
    }
  });
  const wave = n * step;
  later(() => {
    sfx('win', {}, 0);
    if (perfect) sfx('perfect', {}, 0);
    if (motion) fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff', '#ff9f43'], perfect ? 90 : 60);
  }, wave);
  later(() => {
    if (!api) return;
    const row = stats[key];
    api.finish({
      outcome: 'win',
      title: perfect ? T.perfect : record ? T.record : T.win,
      durationMs: ms,
      variant: key,
      message: [
        T.result(n, game.moves),
        clean ? (perfect ? T.exact : T.minimum(min)) : T.withHints,
        clean && !record && row.bestTime ? T.bestTime(fmtTime(row.bestTime)) : null,
      ].filter(Boolean).join(' · '),
    });
  }, motion ? wave + 1500 : 300);
}

function sendProgress() {
  const n = biggestTower(stats);
  if (n) api.progress(T.menu(n));
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => { if (e.target === ui.modal) closeModal(); };
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  if (pd?.dragging) onPointerCancel();
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
  return el('div', { class: 'th-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'th-card-head' },
      el('h2', {}, title),
      el('button', { class: 'th-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function startGame(n = settings.n, pegs = settings.pegs) {
  game = newGame(n, pegs);
  runSince = 0;
  finishing = false;
  buildScene();
  if (G && !reducedMotion()) {
    // диски ложатся на первый стержень снизу вверх
    const gap = clamp(560 / n, 45, 90);
    for (let k = 0; k < n; k++) {
      const d = n - 1 - k;
      const node = ui.disks[d];
      node._anim = node.animate([{ transform: tr(d, [G.pegX(0), G.liftY - G.h * 2]), opacity: 0 }, { transform: tr(d, node._pt), opacity: 1 }],
        { duration: 260, delay: k * gap, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'backwards' });
    }
    sfx('stack', { n, gap: gap / 1000 }, 0);
  }
  // 4 стержня, много дисков: таблицу подсказки строим заранее, пока игрок думает
  if (pegs === 4 && n >= 9) later(() => { if (game?.n === n) distances(n, pegs); }, 900);
  save();
}

/** «Новая башня»: сколько дисков и стержней; начатая партия засчитывается несобранной. */
function showNew() {
  if (finishing) return;
  let n = game?.n ?? settings.n;
  let pegs = game?.pegs ?? settings.pegs;
  const mark = (p, k) => {
    const r = stats[statKey(p, k)];
    return r?.perfect ? '★' : r?.wins ? '✓' : '';
  };
  const diskBtns = DISKS.map((k) => el('button', {
    class: 'th-option', role: 'radio',
    onclick: () => {
      n = k;
      paint();
      sfx('click');
    },
  }, el('b', {}, String(k)), el('span', { class: 'th-opt-min' }), el('i', { class: 'th-mark' })));
  const pegBtns = PEGS.map((p) => el('button', {
    class: 'th-option th-option-wide', role: 'radio',
    onclick: () => {
      pegs = p;
      paint();
      sfx('click');
    },
  }, el('b', {}, T.pegsTab(p)), el('span', {}, T.pegsHint[p])));
  function paint() {
    diskBtns.forEach((b, i) => {
      const k = DISKS[i];
      b.setAttribute('aria-checked', String(k === n));
      b.children[1].textContent = T.minLine(minMoves(k, pegs));
      b.children[2].textContent = mark(pegs, k);
    });
    pegBtns.forEach((b, i) => b.setAttribute('aria-checked', String(PEGS[i] === pegs)));
  }
  paint();
  openModal(card(T.newGame,
    el('h3', { class: 'th-section' }, T.disks),
    el('div', { class: 'th-options', role: 'radiogroup' }, diskBtns),
    el('p', { class: 'th-note' }, T.marks),
    el('h3', { class: 'th-section' }, T.pegs),
    el('div', { class: 'th-options th-options-2', role: 'radiogroup' }, pegBtns),
    started() && el('p', { class: 'th-note' }, T.restartNote),
    el('button', {
      class: 'btn th-play',
      onclick: () => {
        if (started()) {
          syncClock();
          stats = recordGame(stats, game, { win: false });
          api.storage.set('stats', stats);
        }
        settings.n = n;
        settings.pegs = pegs;
        saveSettings();
        closeModal();
        startGame(n, pegs);
      },
    }, T.start),
  ));
}

function showRules() {
  openModal(card(T.title,
    ...T.rules.map((line) => el('p', { class: 'th-note th-rules' }, line)),
    el('p', { class: 'th-note th-legend' }, T.legend),
    el('button', { class: 'btn th-play', onclick: closeModal }, T.gotIt),
  ));
}

function showStats() {
  const box = el('div', {});
  const render = (p) => {
    const rows = DISKS.map((n) => {
      const r = stats[statKey(p, n)];
      return el('div', { class: `th-row${r.wins ? '' : ' th-row-empty'}` },
        el('b', {}, String(n)),
        el('span', {}, r.played ? `${r.wins} / ${r.played}` : '—'),
        el('span', {}, r.bestMoves ? `${r.bestMoves}${r.bestMoves === minMoves(n, p) ? ' ✓' : ''}` : '—'),
        el('span', {}, r.bestTime ? fmtTime(r.bestTime) : '—'),
        el('span', {}, r.perfect ? String(r.perfect) : '—'));
    });
    box.replaceChildren(el('div', { class: 'th-table' },
      el('div', { class: 'th-row th-row-head' }, ...T.head.map((h) => el('span', {}, h))),
      ...rows));
  };
  const cur = game?.pegs ?? 3;
  const tabs = PEGS.map((p) => el('button', {
    class: 'th-tab', role: 'tab', 'aria-selected': String(p === cur),
    onclick: () => {
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(PEGS[k] === p)));
      render(p);
    },
  }, T.pegsTab(p)));
  render(cur);
  openModal(card(T.stats, el('div', { class: 'th-tabs', role: 'tablist' }, tabs), box));
}

const saveSettings = () => api.storage.set('settings', settings);

/** Образец оформления: подставка, стержень и три диска — теми же классами, что и в игре. */
function swatch() {
  const disk = (k, w) => {
    const node = diskEl(0, 1);
    const e = w * 0.17;
    node.classList.add('th-onrod');
    node.style.cssText = `--t: ${k / 2}; --w: ${w}px; --h: 9px; --e: ${e.toFixed(1)}px; --hw: 5px; --he: ${(5 * 0.17).toFixed(2)}px;`
      + ` transform: translate(${(28 - w / 2).toFixed(1)}px, ${(42 - k * 9 - 9 - e / 2).toFixed(1)}px); z-index: ${10 + k}`;
    return node;
  };
  return el('span', { class: 'th-swatch', style: '--rw: 4px; --eb: 9px' },
    el('span', { class: 'th-base', style: 'left: 3px; width: 50px; top: 38px; height: 15px' }, el('span', { class: 'th-base-top' })),
    el('span', { class: 'th-rod', style: 'left: 26px; top: 6px; height: 36px' }),
    disk(0, 44), disk(1, 32), disk(2, 21),
  );
}

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'th-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      skins.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.skin === id)));
      applyOptions();
      sfx('click');
    },
  }, swatch(), el('span', { class: 'th-skin-name' }, T.skins[id])));
  const toggle = (key, label) => {
    const input = el('input', { type: 'checkbox', checked: settings[key] });
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      applyOptions();
    });
    return el('label', { class: 'th-toggle' }, input, el('span', {}, label));
  };
  openModal(card(T.settings,
    el('h3', { class: 'th-section' }, T.skin),
    el('div', { class: 'th-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'th-section' }, T.options),
    toggle('targets', T.targets),
    toggle('numbers', T.numbers),
    el('button', { class: 'btn btn-secondary th-play', onclick: showRules }, T.howTo),
    pointsInfo(api, 'hanoi'),
  ));
}

function iconButton(icon, label, onclick, cls = 'th-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function toolButton(icon, label, onclick) {
  const b = el('button', { class: 'th-tool', onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'th-tool-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function onVisibility() {
  if (document.visibilityState !== 'visible') save();
  syncClock();
}

export default {
  id: 'hanoi',
  title: 'Ханойская башня',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings, savedSound, rulesSeen] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
      api.storage.get('rules'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? { ...emptyStats(), ...savedStats } : emptyStats();
    if (savedSettings && typeof savedSettings === 'object') {
      const d = defaultSettings();
      settings = {
        n: DISKS.includes(savedSettings.n) ? savedSettings.n : d.n,
        pegs: PEGS.includes(savedSettings.pegs) ? savedSettings.pegs : d.pegs,
        skin: SKINS.includes(savedSettings.skin) ? savedSettings.skin : d.skin,
        targets: savedSettings.targets !== false,
        numbers: savedSettings.numbers === true,
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
    const stat = (label, node) => el('div', { class: 'th-stat' }, el('span', {}, label), node);
    ui = {
      sub: el('div', { class: 'th-sub' }),
      moves: el('b', {}, '0'),
      min: el('b', {}, '—'),
      clock: el('b', {}, '0:00'),
      stage: el('div', { class: 'th-stage' }),
      scene: el('div', { class: 'th-scene' }),
      modal: el('div', { class: 'th-modal', hidden: true }),
      pegs: [],
      disks: [],
    };
    ui.undoBtn = toolButton(ICONS.undo, T.undo, onUndo);
    ui.hintBtn = toolButton(ICONS.hint, T.hint, onHint);
    ui.stage.append(ui.scene);
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerCancel);
    ui.stage.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root = el('div', { class: 'th' },
      el('div', { class: 'th-header' },
        el('div', { class: 'th-head-text' }, el('div', { class: 'th-title' }, T.title), ui.sub),
        el('div', { class: 'th-actions' },
          soundBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
        ),
      ),
      el('div', { class: 'th-bar' }, stat(T.moves, ui.moves), stat(T.min, ui.min), stat(T.time, ui.clock)),
      ui.stage,
      el('div', { class: 'th-tools' }, ui.undoBtn, ui.hintBtn, toolButton(ICONS.plus, T.newShort, showNew)),
      ui.modal,
      toast.el,
    );
    container.append(root);
    applyOptions();
    fx = createFx(root, 'th-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = setInterval(paintInfo, 250);
    resizer = new ResizeObserver(() => { if (game) applyGeometry(); });
    resizer.observe(ui.stage);

    if (isValidGame(saved) && !saved.done) {
      game = saved;
      buildScene();
    } else startGame();
    sendProgress();
    // правила — только при самом первом запуске (раньше признаком были сохранённые настройки, а их без изменений
    // в окне настроек нет — окно открывалось при каждом входе)
    if (rulesSeen !== true) {
      if (!saved && !savedSettings) showRules();
      api.storage.set('rules', true);
    }

    if (new URLSearchParams(location.search).has('thdebug')) {
      window.__th = {
        get game() { return game; },
        get lifted() { return lifted; },
        get geometry() { return G; },
        tap: (p) => tapPeg(p),
        move: (a, b) => { if (canPlay()) doMove(a, b); },
        undo: () => onUndo(),
        hint: () => onHint(),
        skin: (id) => { settings.skin = id; applyOptions(); },
        set: (key, value) => { settings[key] = value; applyOptions(); },
        start: (n, p = 3) => startGame(n, p),
        /** сыграть лучшими ходами без анимации, пока до цели не останется left ходов */
        solveExcept: (left = 1) => {
          while (game && !game.done && remaining(game) > left) {
            const [a, b] = bestMove(game);
            move(game, a, b);
          }
          lifted = -1;
          placeAll();
          paintInfo();
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
    resizer?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (started()) {
      syncClock();
      save();
    }
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = host = root = ui = toast = fx = game = G = pd = hintMove = resizer = null;
    modalActive = finishing = warnedBlocked = warnedHint = false;
    lifted = -1;
    runSince = 0;
    clockTimer = 0;
  },
};
