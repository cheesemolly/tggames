// Пинбол — как 3D Pinball для Windows XP: те же элементы, миссии, звания, топливо, гиперпространство,
// червоточины, чёрная дыра, гравитационный колодец. Геометрия, рисунок и звуки — свои (table.js, render.js, sounds.js),
// физика — physics.js (подшаги 1/480 с), правила — rules.js.
//
// Управление: касание левой половины — левый флиппер, правой — правый; пока шарик на пружине, правая половина её
// натягивает (держи — сильнее, отпусти — запуск). Быстрый взмах пальцем вверх — толчок стола (часто — наклон).
// Клавиатура: Z / ← / левый Shift, / / → / правый Shift — флипперы; пробел / ↓ / Enter — пружина; X, «.», ↑ — толчок;
// Esc / P — пауза.
// Партия сохраняется (getState): при возвращении шарик снова на пружине.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import { createWorld } from './physics.js';
import { buildTable, W, BALL_R, PLUNGER_Y, LANE_X } from './table.js';
import { createRenderer, SKINS } from './render.js';
import * as R from './rules.js';

const T = {
  title: 'Пинбол',
  ball: (n, all) => `Шарик ${n} из ${all}`,
  ballShort: 'Шарик',
  score: 'Очки',
  fuel: 'Топливо',
  pause: 'Пауза',
  nudge: 'Толчок стола',
  resume: 'Продолжить',
  newGame: 'Новая игра',
  howTo: 'Как играть',
  stats: 'Статистика',
  settings: 'Настройки',
  close: 'Закрыть',
  table: 'Стол',
  sound: 'Звуки',
  music: 'Фоновая музыка',
  haptic: 'Вибрация',
  on: 'Вкл',
  off: 'Выкл',
  hintTouch: 'Держи справа — натянуть пружину, отпусти — запуск',
  hintKeys: 'Пробел — пружина · Z и / — флипперы',
  over: 'Игра окончена',
  result: (rank, missions) => `Звание: ${rank} · Миссий: ${missions}`,
  share: (score, rank) => `🚀 Пинбол: ${fmt(score)} очков, звание «${rank}»`,
  menuProgress: (rank) => `Звание: ${rank}`,
  abandon: 'Текущая партия закончится.',
  statsTiles: { played: 'Партий', best: 'Рекорд', bestRank: 'Высшее звание', missions: 'Миссий', jackpots: 'Джекпотов', hyper: 'Гиперпрыжков' },
};

const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const strokeIcon = (body) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" '
  + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON_SOUND_ON = strokeIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>');
const ICON_SOUND_OFF = strokeIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>');
const ICON_PAUSE = strokeIcon('<path d="M9 5v14"/><path d="M15 5v14"/>');
// толчок стола: рамка стола и дуги «тряски» по бокам
const ICON_NUDGE = strokeIcon('<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M4 9c-1 2-1 4 0 6"/><path d="M20 9c1 2 1 4 0 6"/>');

const HOLD_TIME = 1.5;             // с — пружина от нуля до полной
const PLUNGE_MIN = 900;            // скорость запуска: слабый…полный
const PLUNGE_MAX = 3650;
const CHUNK = 1 / 240;             // шаг, после которого разбираются события мира
const KICK_L = [0, -2450];
const KICK_R = [-500, -1700];

let api = null;
let root = null;
let ui = null;
let renderer = null;
let table = null;
let world = null;
let ball = null;
let g = null;
let stats = R.emptyStats();
let settings = { skin: 'nebula', sound: true, music: false, haptic: true };
let raf = 0;
let lastTs = 0;
let paused = false;
let modalActive = false;
let modalToken = 0;
let finished = false;
let mode = 'plunger';              // plunger | play | ride | held | over
let pull = 0;
let pullVisual = 0;
let ride = null;                   // { pts, lens, total, d, speed, path }
let held = null;                   // { t, exit, kind }
let slowFor = 0;
// пятачок, по которому мечется шарик последние секунды: { x0, x1, y0, y1, t } — ловит петли между бамперами
let loopBox = null;
let platformFor = 0;   // сколько секунд шарик на платформе (слой 1) подряд
let clock = 0;
let noCatchUntil = 0;
let spin = { left: 0, rate: 0, acc: 0, angle: 0 };
let raiseAt = { mult: 0, medal: 0, boost: 0 };
let shownScore = 0;
let hudKey = '';
let callouts = [];
let calloutT = 0;
let hinted = false;
let resizeObs = null;
let sizeKey = '';
let hudT = 0;
// качество: плотность пикселей холста; если кадры не успевают — ниже (2 → 1,5 → 1,25 → 1)
let quality = 2;
let perf = { n: 0, sum: 0, cool: 0 };
const pointers = new Map();        // pointerId → { side, kind, x0, y0, t0, nudged }
const keys = { left: false, right: false, plunger: false };
let flipWas = [false, false];
const timers = new Set();
const audio = createAudio(createSounds);
let ambientOn = false;

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function sfx(name, opts) {
  if (!settings.sound) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function syncAmbient() {
  const want = settings.sound && settings.music && !paused && !modalActive && mode !== 'over' && Boolean(root);
  if (want === ambientOn) return;
  ambientOn = want;
  try {
    audio.get()?.ambient(want);
  } catch { /* без звука */ }
}

const haptic = (kind, arg) => {
  if (!settings.haptic) return;
  try {
    api.platform.haptic[kind](arg);
  } catch { /* нет вибрации */ }
};

// ---------- пути рамп ----------

/** Та же кривая, что рисует render.js (середины отрезков — квадратичные дуги), — плотной ломаной. */
function densify(points) {
  const out = [points[0]];
  let cur = points[0];
  const quad = (a, c, b, u) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  for (let k = 1; k < points.length - 1; k++) {
    const m = [(points[k][0] + points[k + 1][0]) / 2, (points[k][1] + points[k + 1][1]) / 2];
    for (let q = 1; q <= 10; q++) out.push(quad(cur, points[k], m, q / 10));
    cur = m;
  }
  out.push(points[points.length - 1]);
  const lens = [0];
  for (let k = 1; k < out.length; k++) lens.push(lens[k - 1] + Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]));
  return { pts: out, lens, total: lens[lens.length - 1] };
}

function pointAt(r, d) {
  let k = 1;
  while (k < r.lens.length - 1 && r.lens[k] < d) k++;
  const a = r.pts[k - 1];
  const b = r.pts[k];
  const span = r.lens[k] - r.lens[k - 1] || 1;
  const u = Math.max(0, Math.min(1, (d - r.lens[k - 1]) / span));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// ---------- шарик ----------

function restOnPlunger() {
  ball.x = LANE_X;
  ball.y = PLUNGER_Y - BALL_R - 0.5;
  ball.vx = 0;
  ball.vy = 0;
  ball.layer = 0;
  ball.frozen = true;
  ball.hidden = false;
  ball.riding = false;
  ball.inside.clear();
  ball.trail = [];
  mode = 'plunger';
  pull = 0;
  slowFor = 0;
  loopBox = null;
  platformFor = 0;
}

function launch() {
  if (mode !== 'plunger' || g.over) return;
  const power = pull;
  pull = 0;
  if (power < 0.03) return;
  ball.frozen = false;
  ball.vy = -(PLUNGE_MIN + (PLUNGE_MAX - PLUNGE_MIN) * power);
  mode = 'play';
  sfx('launch', { level: power });
  haptic('impact', power > 0.6 ? 'medium' : 'light');
  hideHint();
}

function startRide(name) {
  const p = table.paths[name];
  ride = { ...p.dense, d: 0, speed: p.speed, name, path: p };
  mode = 'ride';
  ball.frozen = true;
  ball.riding = true;
  ball.trail = [];
}

/** Вывести шарик из петли: с платформы — в лунку выхода (как будто докатился), на столе — толчок вверх-вбок. */
function unstick() {
  if (ball.layer === 1) {
    capture('platExit', 0.45, 'platExit');
    return;
  }
  ball.vx += (ball.x < 500 ? 1 : -1) * (220 + Math.random() * 160);
  ball.vy -= 650;
}

function capture(id, holdSec, exit) {
  mode = 'held';
  held = { t: holdSec, exit, id };
  ball.frozen = true;
  ball.hidden = true;
  ball.riding = false;
  ball.vx = 0;
  ball.vy = 0;
  ball.trail = [];
  const h = table.elements.holes[id] ?? table.elements.well;
  renderer.ring(h.x, h.y, 'cyan', 10, 80, 0.45);
  renderer.burst(h.x, h.y, 'violet', 6, 380);
}

function eject() {
  const { exit, id } = held;
  held = null;
  if (id === 'well') {
    const w = table.elements.well;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    place(w.x, w.y, Math.cos(a) * 1400, Math.sin(a) * 1400, 0);
  } else {
    const h = table.elements.holes[exit];
    place(h.out[0], h.out[1], h.v[0] + (Math.random() - 0.5) * 80, h.v[1] + (Math.random() - 0.5) * 60, h.layer ?? (exit === 'platExit' ? 0 : 0));
    if (exit !== id && table.elements.holes[id]) {
      const from = table.elements.holes[id];
      renderer.ring(from.x, from.y, 'violet', 60, 5, 0.35);
    }
    renderer.ring(h.x, h.y, 'cyan', 5, 90, 0.5);
    renderer.burst(h.x, h.y, 'cyan', 8, 420);
  }
  sfx('eject');
  noCatchUntil = clock + 0.6;
  mode = 'play';
}

function place(x, y, vx, vy, layer) {
  ball.x = x;
  ball.y = y;
  ball.vx = vx;
  ball.vy = vy;
  ball.layer = layer;
  ball.frozen = false;
  ball.hidden = false;
  ball.riding = false;
  ball.inside.clear();
  ball.trail = [];
}

// ---------- события мира ----------

const SPEED_MIN = { target: 90, fuelT: 230, sling: 150 };
// эффекты одного элемента — не чаще раза в 0,1 с: на платформе шарик бьётся о бамперы десятки раз в секунду,
// и частицы с кольцами от каждого удара тормозили телефон (жалоба владельца, 2026-09-28)
const FX_GAP = 0.1;
const fxAt = new Map();
const fxReady = (id) => {
  const t = fxAt.get(id);
  if (t != null && clock - t < FX_GAP) return false;
  fxAt.set(id, clock);
  return true;
};

function onEvent(e) {
  if (e.ball !== ball || mode !== 'play') return;
  const id = e.id;
  if (!id) return;
  if (e.type === 'hit') {
    if (id === 'flipL' || id === 'flipR') return;
    const c = table.byId.get(id);
    if (!c) return;
    if (c.kind === 'bumper') {
      R.hit(g, id);
      renderer.hit(id);
      if (fxReady(id)) {
        renderer.ring(c.x, c.y, id.startsWith('lbump') ? 'rubber' : id === 'bumpSat' ? 'cyan' : 'gold', c.r, c.r + 55, 0.3);
        renderer.burst(ball.x, ball.y, 'gold', 4, 380);
      }
      return;
    }
    if (c.kind === 'sling' || c.kind === 'rubber') {
      if (e.speed < SPEED_MIN.sling) return;
      R.hit(g, id);
      renderer.hit(id);
      if (c.kind === 'sling' && fxReady(id)) renderer.burst(ball.x, ball.y, 'rubber', 5, 360);
      return;
    }
    if (c.kind === 'drop' || c.kind === 'target') {
      if (e.speed < (id.startsWith('fuelT') ? SPEED_MIN.fuelT : SPEED_MIN.target)) return;
      R.hit(g, id);
      renderer.hit(id);
      if (fxReady(id)) renderer.burst(ball.x, ball.y, c.kind === 'drop' ? 'cyan' : 'green', 4, 300);
      return;
    }
    if (id === 'post') R.hit(g, id);
    return;
  }
  if (e.type !== 'enter') return;
  if (id.startsWith('trip')) {
    R.trip(g, Number(id.slice(4)));
    return;
  }
  if (id === 'tubeExit') {
    R.launched(g);
    return;
  }
  if (id === 'spin1') {
    spin.left += Math.max(1, Math.min(12, Math.round(e.speed / 230)));
    spin.rate = Math.max(spin.rate, Math.min(28, e.speed / 90));
    return;
  }
  if (id === 'rampMouth' || id === 'hyperMouth') {
    if (ball.vy > -150) return;
    R.hit(g, id);
    startRide(id === 'rampMouth' ? 'ramp' : 'hyper');
    return;
  }
  if (id === 'kickL' || id === 'kickR') {
    const side = id === 'kickL' ? 'L' : 'R';
    if (!R.kickback(g, side)) return;
    const v = side === 'L' ? KICK_L : KICK_R;
    ball.vx = v[0] + (Math.random() - 0.5) * 40;
    ball.vy = v[1];
    renderer.burst(ball.x, ball.y, 'green', 10, 500);
    renderer.shake(5);
    return;
  }
  if (id === 'drain') {
    onDrain();
    return;
  }
  if (id === 'platExit') {
    if (clock < noCatchUntil) return;
    capture('platExit', 0.45, 'platExit');
    R.hit(g, 'platExit');
    return;
  }
  const holes = table.elements.holes;
  if (id in holes && id !== 'hyper') {
    if (clock < noCatchUntil || e.speed > 1900) return;
    const res = R.hole(g, id);
    capture(id, res.hold, res.exit);
    return;
  }
  R.hit(g, id);
}

function onDrain() {
  ball.frozen = true;
  ball.hidden = true;
  const res = R.drain(g);
  renderer.shake(res === 'save' ? 4 : 10);
  if (res === 'save') {
    later(() => {
      if (root && g && !g.over) restOnPlunger();
    }, 700);
    mode = 'held';
    held = { t: 99, exit: null, id: 'drain' };
    return;
  }
  haptic('notification', 'error');
  if (res === 'over') {
    mode = 'over';
    syncAmbient();
    later(() => gameOver(), 1800);
    return;
  }
  mode = 'held';
  held = { t: 99, exit: null, id: 'drain' };
  raiseAt = { mult: 0, medal: 0, boost: 0 };
  later(() => {
    if (!root || !g || g.over) return;
    restOnPlunger();
    say(T.ball(g.ball, R.BALLS), true);
  }, 1300);
}

async function gameOver() {
  if (finished || !g) return;
  finished = true;
  stats = R.recordGame(stats, g);
  await api.storage.set('stats', stats);
  api.progress(T.menuProgress(R.RANKS[stats.bestRank]));
  api.finish({
    outcome: 'lose',
    title: T.over,
    score: Math.round(g.score),
    message: T.result(R.RANKS[g.rank], g.missionsDone),
    share: T.share(g.score, R.RANKS[g.rank]),
  });
}

// ---------- эффекты правил ----------

function drainFx() {
  const list = g.fx;
  if (!list.length) return;
  g.fx = [];
  for (const f of list) {
    if (f.t === 'sound') sfx(f.name, f.opts);
    else if (f.t === 'msg') say(f.text, f.big);
    else if (f.t === 'drop') renderer.ring(ball.x, ball.y, 'cyan', 10, 60, 0.3);
    else if (f.t === 'raise') raiseAt[f.group] = clock + 0.8;
    else if (f.t === 'drops') raiseAt = { mult: clock + 0.5, medal: clock + 0.5, boost: clock + 0.5 };
    else if (f.t === 'show') {
      const w = table.elements.well;
      renderer.white(f.kind === 'rank' || f.kind === 'jackpot' ? 0.35 : 0.2);
      renderer.shake(f.kind === 'rank' ? 12 : 7);
      renderer.burst(w.x, w.y - 40, 'gold', 24, 900);
      renderer.ring(w.x, w.y, 'gold', 30, 260, 0.7);
      haptic('notification', 'success');
    }
  }
}

// ---------- надписи ----------

function say(text, big = false) {
  if (!ui) return;
  if (big) callouts = callouts.filter((c) => c.big);
  else if (callouts.length > 2) callouts = callouts.filter((c) => c.big);
  if (callouts.some((c) => c.text === text)) return;
  callouts.push({ text, big });
}

function tickCallouts(dt) {
  calloutT -= dt;
  if (calloutT > 0 || !callouts.length) {
    if (calloutT <= 0 && ui.callout.classList.contains('pb-on')) ui.callout.classList.remove('pb-on');
    return;
  }
  const c = callouts.shift();
  ui.callout.textContent = c.text;
  ui.callout.classList.toggle('pb-big', c.big);
  ui.callout.classList.remove('pb-on');
  void ui.callout.offsetWidth;
  ui.callout.classList.add('pb-on');
  calloutT = c.big ? 1.5 : 1.05;
}

function hideHint() {
  if (hinted || !ui) return;
  hinted = true;
  ui.hint.classList.add('pb-gone');
}

// ---------- HUD ----------

function updateHud(dt) {
  shownScore += (g.score - shownScore) * Math.min(1, dt * 9);
  if (Math.abs(g.score - shownScore) < 1) shownScore = g.score;
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.08;                                   // панель — не чаще ~12 раз в секунду: смена текста стоит вёрстки
  const s = fmt(shownScore);
  if (ui.score.textContent !== s) ui.score.textContent = s;
  const m = R.missionText(g);
  const fuel = R.fuelLights(g);
  const key = [g.ball, g.extraBalls, g.rank, m.title, m.text, fuel, R.multiplier(g), g.tilted].join('|');
  if (key === hudKey) return;
  hudKey = key;
  ui.balls.replaceChildren(...Array.from({ length: R.BALLS }, (_, k) => el('i', { class: k < R.BALLS - g.ball + 1 ? 'pb-on' : '' })),
    ...(g.extraBalls ? [el('b', {}, `+${g.extraBalls}`)] : []));
  ui.balls.title = T.ball(g.ball, R.BALLS);
  ui.rank.textContent = R.RANKS[g.rank];
  ui.mult.textContent = `×${R.multiplier(g)}`;
  ui.mult.classList.toggle('pb-on', R.multiplier(g) > 1);
  ui.missionTitle.textContent = m.title;
  ui.missionText.textContent = g.tilted ? 'НАКЛОН — шарик потерян' : m.text;
  ui.fuel.replaceChildren(...Array.from({ length: 6 }, (_, k) => el('i', { class: k < fuel ? (fuel <= 1 ? 'pb-on pb-low' : 'pb-on') : '' })));
  ui.mission.classList.toggle('pb-active', Boolean(g.mission));
}

// ---------- цикл ----------

function frame(ts) {
  raf = 0;
  if (!root) return;
  const gap = lastTs ? Math.max(0, (ts - lastTs) / 1000) : 1 / 60;
  const dt = Math.min(1 / 30, gap);
  lastTs = ts;
  if (!paused && !modalActive && document.visibilityState === 'visible') watchPerf(gap);
  if (!paused && !modalActive) step(dt);
  renderer.draw(view(), paused || modalActive ? 0 : dt);
  if (!paused && !modalActive) {
    tickCallouts(dt);
    updateHud(dt);
  }
  schedule();
}

/**
 * Кадры идут реже 45 в секунду 1,5 с подряд — холст становится менее плотным (дешевле рисовать). Вверх качество
 * не возвращается: иначе оно прыгало бы туда-обратно.
 */
function watchPerf(gap) {
  if (gap > 0.25) return;                        // вкладку сворачивали — не мерило
  perf.n += 1;
  perf.sum += gap;
  if (perf.cool > 0) perf.cool -= gap;
  if (perf.n < 90) return;
  const avg = perf.sum / perf.n;
  perf.n = 0;
  perf.sum = 0;
  if (avg > 1 / 45 && perf.cool <= 0 && quality > 1) {
    quality = quality > 1.5 ? 1.5 : quality > 1.25 ? 1.25 : 1;
    perf.cool = 1.5;
    sizeKey = '';
    hudT = 0;
    quality = 2;
    perf = { n: 0, sum: 0, cool: 0 };
    fxAt.clear();
    onResize();
  }
}

function schedule() {
  if (!raf && root && !paused && !modalActive) raf = requestAnimationFrame(frame);
}

function view() {
  const dropUp = {};
  for (const grp of ['mult', 'medal', 'boost']) {
    g.drops[grp].forEach((up, k) => {
      dropUp[`${grp}${k}`] = up && clock >= raiseAt[grp];
    });
  }
  const b = { x: ball.x, y: ball.y, layer: ball.layer, riding: ball.riding, hidden: ball.hidden, trail: ball.trail };
  if (mode === 'plunger') b.y += pullVisual * 55;
  return { g, balls: [b], dropUp, pull: pullVisual, postUp: g.postTimer > 0, spinAngle: spin.angle };
}

function flippers() {
  const ballOnPlunger = mode === 'plunger';
  let left = keys.left;
  let right = keys.right;
  for (const p of pointers.values()) {
    if (p.kind !== 'flip') continue;
    if (p.side < 0) left = true;
    else right = true;
  }
  if (g.tilted || mode === 'over') left = right = false;
  const want = [left, right];
  table.flippers.forEach((f, k) => {
    f.pressed = want[k];
    if (want[k] && !flipWas[k]) {
      sfx('flipper', { side: k ? 1 : -1 });
      haptic('impact', 'light');
      R.laneChange(g, k ? 1 : -1);
    } else if (!want[k] && flipWas[k]) sfx('flipperDown');
  });
  flipWas = want;
  // пружина: пробел или палец справа (пока шарик на ней)
  let hold = keys.plunger;
  for (const p of pointers.values()) if (p.kind === 'plunger') hold = true;
  if (ballOnPlunger && hold) {
    const before = pull;
    pull = Math.min(1, pull + (1 / HOLD_TIME) * lastDt);
    if (Math.floor(before * 10) !== Math.floor(pull * 10)) sfx('pull', { level: pull });
  }
}

let lastDt = 1 / 60;

function step(dt) {
  lastDt = dt;
  clock += dt;
  flippers();
  pullVisual += ((mode === 'plunger' ? pull : 0) - pullVisual) * Math.min(1, dt * (mode === 'plunger' ? 30 : 18));

  // центральная стойка и мишени
  table.byId.get('post').enabled = g.postTimer > 0;
  for (const grp of ['mult', 'medal', 'boost']) {
    g.drops[grp].forEach((up, k) => {
      table.byId.get(`${grp}${k}`).enabled = up && clock >= raiseAt[grp];
    });
  }

  if (mode === 'ride') {
    ride.d += ride.speed * dt;
    const [x, y] = pointAt(ride, Math.min(ride.d, ride.total));
    ball.trail.push([ball.x, ball.y]);
    if (ball.trail.length > 7) ball.trail.shift();
    ball.x = x;
    ball.y = y;
    if (ride.d >= ride.total) {
      const p = ride.path;
      ride = null;
      if (p.hole === 'hyper') {
        const res = R.hole(g, 'hyper');
        capture('hyper', res.hold, res.exit);
      } else {
        place(x, y, p.exitV[0] + (Math.random() - 0.5) * (p.spread ?? 0), p.exitV[1], p.layer);
        mode = 'play';
      }
    }
  } else if (mode === 'held' && held) {
    held.t -= dt;
    if (held.t <= 0 && held.exit) eject();
  }

  if (mode === 'play' || mode === 'plunger' || mode === 'ride' || mode === 'held') {
    // физика по кусочкам: события разбираются сразу, чтобы захват лункой не «опаздывал»
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(CHUNK, left);
      left -= h;
      if (mode === 'play') gravityWell(h);
      const events = world.step(h);
      for (const e of events) {
        onEvent(e);
        if (mode !== 'play') break;
      }
    }
  }

  if (mode === 'play') {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 350) {
      ball.trail.push([ball.x, ball.y]);
      if (ball.trail.length > 7) ball.trail.shift();
    } else if (ball.trail.length) ball.trail.shift();
    // слабый запуск скатился на пружину
    if (ball.x > 915 && ball.y > PLUNGER_Y - BALL_R - 6 && speed < 60) {
      R.fellBack(g);
      restOnPlunger();
    } else {
      // застрял: 3 с без движения (и флипперы не держат) — лёгкий толчок
      const cradled = table.flippers.some((f) => f.pressed);
      if (speed < 25 && !cradled) slowFor += dt;
      else slowFor = 0;
      if (slowFor > 3) {
        slowFor = 0;
        ball.vx += (Math.random() < 0.5 ? -1 : 1) * 260;
        ball.vy -= 420;
      }
      // петля: 6 с шарик не выходит из пятачка 120×120 (бамперы перекидывают его друг другу или подбрасывают у
      // стенки) — вывести: на платформе — в лунку выхода, на столе — толчок. Видео владельца, 2026-10-02: шарик
      // навсегда застрял в углу платформы, очки росли.
      // на платформе дольше 8 с (бамперы гоняют шарик по всей ней) — в лунку выхода
      platformFor = ball.layer === 1 ? platformFor + dt : 0;
      if (platformFor > 8 && api.feature('pinball-unstick')) {
        platformFor = 0;
        loopBox = null;
        unstick();
      } else if (cradled || !api.feature('pinball-unstick')) loopBox = null;
      else {
        if (!loopBox) loopBox = { x0: ball.x, x1: ball.x, y0: ball.y, y1: ball.y, t: 0 };
        loopBox.x0 = Math.min(loopBox.x0, ball.x);
        loopBox.x1 = Math.max(loopBox.x1, ball.x);
        loopBox.y0 = Math.min(loopBox.y0, ball.y);
        loopBox.y1 = Math.max(loopBox.y1, ball.y);
        loopBox.t += dt;
        if (loopBox.t > 6) {
          const small = loopBox.x1 - loopBox.x0 < 120 && loopBox.y1 - loopBox.y0 < 120;
          loopBox = null;
          if (small) unstick();
        }
      }
    }
  } else loopBox = null;

  // флажок-спиннер
  if (spin.left > 0 || spin.rate > 0.2) {
    spin.acc += spin.rate * dt;
    spin.angle += spin.rate * dt * Math.PI * 2;
    while (spin.acc >= 1 && spin.left > 0) {
      spin.acc -= 1;
      spin.left -= 1;
      R.hit(g, 'spin1');
    }
    spin.rate *= 1 - Math.min(0.9, dt * 1.6);
    if (spin.left <= 0) spin.acc = 0;
  }

  if (mode !== 'plunger' && mode !== 'over') R.tick(g, dt);
  drainFx();
}

function gravityWell(h) {
  if (!g.wellActive || ball.layer !== 0) return;
  const w = table.elements.well;
  const dx = w.x - ball.x;
  const dy = w.y - ball.y;
  const d = Math.hypot(dx, dy);
  if (d > w.r || d < 1e-3) return;
  if (d < 18 && clock >= noCatchUntil) {
    if (R.gravityWell(g)) {
      capture('well', 1, 'well');
      held.id = 'well';
      return;
    }
  }
  const a = 2400 * (1 - d / w.r) + 350;
  ball.vx += (dx / d) * a * h;
  ball.vy += (dy / d) * a * h;
  const damp = 1 - 1.4 * h;
  ball.vx *= damp;
  ball.vy *= damp;
}

// ---------- ввод ----------

function stageSide(clientX) {
  const r = ui.canvas.getBoundingClientRect();
  return clientX < r.left + r.width / 2 ? -1 : 1;
}

function onPointerDown(e) {
  if (modalActive || paused || !g) return;
  if (e.target.closest?.('button, .pb-modal')) return;
  e.preventDefault();
  audio.get();
  syncAmbient();
  const side = stageSide(e.clientX);
  const kind = side > 0 && mode === 'plunger' ? 'plunger' : 'flip';
  pointers.set(e.pointerId, { side, kind, x0: e.clientX, y0: e.clientY, t0: performance.now(), nudged: false });
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch { /* нет захвата — ничего */ }
}

function onPointerMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p || p.nudged || p.kind !== 'flip') return;
  const dy = e.clientY - p.y0;
  const dx = e.clientX - p.x0;
  // бета 'pinball-nudge' (владелец, 2026-10-02: «на телефоне нельзя делать толчок»): взмах мягче — 45 px за 0,45 с
  // (было 70 px за 0,3 с: пальцем, который держит флиппер, так резко почти не выходит); и кнопка в панели
  const soft = api.feature('pinball-nudge');
  if (dy < (soft ? -45 : -70) && performance.now() - p.t0 < (soft ? 450 : 300)) {
    p.nudged = true;
    nudge(dx < -30 ? -1 : dx > 30 ? 1 : 0);
  }
}

function onPointerUp(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.kind === 'plunger' && ![...pointers.values()].some((q) => q.kind === 'plunger') && !keys.plunger) launch();
}

const KEY_LEFT = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft']);
const KEY_RIGHT = new Set(['Slash', 'ArrowRight', 'ShiftRight', 'KeyM']);
const KEY_PLUNGER = new Set(['Space', 'Enter', 'NumpadEnter', 'ArrowDown']);

function onKeyDown(e) {
  if (!root || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (modalActive) closeModal();
    else showMenu();
    e.preventDefault();
    return;
  }
  if (modalActive || paused || !g) return;
  audio.get();
  syncAmbient();
  if (KEY_LEFT.has(e.code)) keys.left = true;
  else if (KEY_RIGHT.has(e.code)) keys.right = true;
  else if (KEY_PLUNGER.has(e.code)) keys.plunger = true;
  else if (!e.repeat && e.code === 'KeyX') nudge(1);
  else if (!e.repeat && e.code === 'Period') nudge(-1);
  else if (!e.repeat && e.code === 'ArrowUp') nudge(0);
  else return;
  e.preventDefault();
}

function onKeyUp(e) {
  if (KEY_LEFT.has(e.code)) keys.left = false;
  else if (KEY_RIGHT.has(e.code)) keys.right = false;
  else if (KEY_PLUNGER.has(e.code)) {
    keys.plunger = false;
    if (![...pointers.values()].some((q) => q.kind === 'plunger')) launch();
  }
}

/** Толчок стола: dir −1 — шарик влево, 1 — вправо, 0 — вверх. */
function nudge(dir) {
  if (mode !== 'play' || g.tilted || ball.layer !== 0) return;
  ball.vx += dir * 190;
  ball.vy -= 140;
  renderer.shake(9);
  R.nudge(g);
  if (g.tilted) {
    haptic('impact', 'heavy');
    renderer.shake(16);
  } else haptic('impact', 'medium');
}

// ---------- окна ----------

function openModal(content) {
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  pointers.clear();
  keys.left = keys.right = keys.plunger = false;
  syncAmbient();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  lastTs = 0;
  syncAmbient();
  schedule();
}

function dialog(title, ...children) {
  return el('div', { class: 'pb-dialog', role: 'dialog', 'aria-label': title },
    el('div', { class: 'pb-dialog-head' },
      el('h2', {}, title),
      el('button', { class: 'pb-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function toggleRow(label, key, after) {
  const b = el('button', { class: 'pb-toggle', role: 'switch', 'aria-checked': String(settings[key]) }, el('span', {}, label), el('i', {}));
  b.addEventListener('click', () => {
    settings[key] = !settings[key];
    b.setAttribute('aria-checked', String(settings[key]));
    api.storage.set('settings', settings);
    after?.();
    sfx('click');
  });
  return b;
}

function showMenu() {
  if (!g) return;
  sfx('click');
  const skins = Object.entries(SKINS).map(([id, p]) => {
    const b = el('button', { class: 'pb-skin', role: 'radio', 'aria-checked': String(settings.skin === id), style: `--a:${p.cyan};--b:${p.rubber};--c:${p.bg1}` },
      el('span', { class: 'pb-skin-dot' }), el('b', {}, p.name));
    b.addEventListener('click', () => {
      settings.skin = id;
      api.storage.set('settings', settings);
      renderer.setSkin(id);
      ui.root.dataset.skin = id;
      b.parentElement.querySelectorAll('.pb-skin').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      sfx('click');
    });
    return b;
  });
  openModal(dialog(T.pause,
    el('div', { class: 'pb-menu' },
      el('button', { class: 'btn pb-wide-btn', onclick: closeModal }, T.resume),
      el('button', { class: 'btn btn-secondary pb-wide-btn', onclick: confirmNewGame }, T.newGame),
      el('div', { class: 'pb-row2' },
        el('button', { class: 'btn btn-secondary', onclick: showHowTo }, T.howTo),
        el('button', { class: 'btn btn-secondary', onclick: showStats }, T.stats),
      ),
    ),
    el('h3', { class: 'pb-section' }, T.table),
    el('div', { class: 'pb-skins', role: 'radiogroup' }, ...skins),
    el('h3', { class: 'pb-section' }, T.settings),
    toggleRow(T.sound, 'sound', () => {
      renderSoundBtn();
      syncAmbient();
    }),
    toggleRow(T.music, 'music', syncAmbient),
    toggleRow(T.haptic, 'haptic'),
  ));
}

function confirmNewGame() {
  openModal(dialog(T.newGame,
    el('p', { class: 'pb-note' }, T.abandon),
    el('button', { class: 'btn pb-wide-btn', onclick: () => { closeModal(); newGame(); } }, T.newGame),
    el('button', { class: 'btn btn-secondary pb-wide-btn', onclick: showMenu }, T.resume),
  ));
}

function showStats() {
  const tile = (value, label) => el('div', { class: 'pb-tile' }, el('b', {}, value), el('span', {}, label));
  openModal(dialog(T.stats,
    el('div', { class: 'pb-tiles' },
      tile(String(stats.played), T.statsTiles.played),
      tile(fmt(stats.best), T.statsTiles.best),
      tile(R.RANKS[stats.bestRank], T.statsTiles.bestRank),
      tile(String(stats.missions), T.statsTiles.missions),
      tile(String(stats.jackpots), T.statsTiles.jackpots),
      tile(String(stats.hyper), T.statsTiles.hyper),
    ),
    el('button', { class: 'btn btn-secondary pb-wide-btn', onclick: showMenu }, T.pause),
  ));
}

function showHowTo() {
  const p = (text) => el('p', { class: 'pb-note' }, text);
  const tiers = R.TIERS.map((ids, k) => el('li', {},
    el('b', {}, [['Кадет'], ['Мичман', 'Лейтенант'], ['Капитан', 'Капитан-лейтенант'], ['Коммандер', 'Коммодор'], ['Адмирал', 'Адмирал флота']][k].join(', ')),
    el('span', {}, ids.map((id) => R.MISSIONS[id].name).join(' · '))));
  openModal(dialog(T.howTo,
    el('h3', { class: 'pb-section' }, 'Управление'),
    p(`Левая половина экрана — левый флиппер, правая — правый. Пока шарик на пружине, держи правую половину: чем дольше, тем сильнее запуск. ${api.feature('pinball-nudge') ? 'Толчок стола — кнопка вверху (рамка стола) или быстрый взмах пальцем вверх' : 'Взмах пальцем вверх — толчок стола'}, но часто толкать нельзя — будет наклон.`),
    p('Клавиатура: Z и / — флипперы, пробел — пружина, X, точка и ↑ — толчок, Esc — пауза.'),
    el('h3', { class: 'pb-section' }, 'Миссии и звания'),
    p('Сбей зелёную мишень миссии слева — загорится миссия; въезд на рампу запуска её принимает. Выполненная миссия даёт очки и огни звания: 18 огней вокруг колодца — повышение. Миссия идёт, пока есть топливо: заправка — топливные дорожки и мишени слева вверху, бонусная дорожка и запуск.'),
    el('ul', { class: 'pb-tiers' }, ...tiers),
    el('h3', { class: 'pb-section' }, 'Стол'),
    p('Три дорожки наверху прокачивают бамперы, три дорожки платформы — её бамперы. Голубые мишени — множитель поля (×2…×10), жёлтые под бамперами — медали и дополнительный шарик, розовые справа — ускорители: флаги, джекпот, бонус. Гиперпространство (правая труба) повышается с каждым заездом: джекпот, стойка между флипперами, дополнительный шарик, гравитационный колодец. Червоточины переносят шарик; попал в ту же — повтор шарика.'),
    p('Слабый запуск, скатившийся обратно, — удар умения: больше всего за третью растяжку. Первые 10 секунд шарик сохраняется. Внешние дорожки спасают откидные толкатели, пока горят зелёные огни.'),
    el('button', { class: 'btn btn-secondary pb-wide-btn', onclick: showMenu }, T.pause),
  ));
}

function renderSoundBtn() {
  if (!ui) return;
  ui.soundBtn.innerHTML = settings.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
  const label = settings.sound ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
}

function toggleSound() {
  settings.sound = !settings.sound;
  api.storage.set('settings', settings);
  renderSoundBtn();
  syncAmbient();
  sfx('click');
}

// ---------- партия ----------

function syncTargets() {
  for (const grp of ['mult', 'medal', 'boost']) g.drops[grp].forEach((up, k) => { table.byId.get(`${grp}${k}`).enabled = up; });
  raiseAt = { mult: 0, medal: 0, boost: 0 };
}

function newGame() {
  g = R.newGame();
  finished = false;
  shownScore = 0;
  hudKey = '';
  callouts = [];
  syncTargets();
  restOnPlunger();
  say(T.ball(1, R.BALLS), true);
  syncAmbient();
}

function onVisibility() {
  if (document.hidden && root && g && mode !== 'over' && !modalActive) showMenu();
}

function onResize() {
  if (!ui) return;
  const r = ui.stage.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const wide = root.clientWidth > root.clientHeight * 0.95;
  ui.root.classList.toggle('pb-wide', wide);
  const s = ui.stage.getBoundingClientRect();
  const dpr = Math.min(quality, window.devicePixelRatio || 1);
  const key = `${Math.round(s.width)}x${Math.round(s.height)}@${dpr}`;
  if (key === sizeKey) return;
  sizeKey = key;
  renderer.resize(s.width, s.height, dpr);
  const scale = renderer.scale;
  ui.callout.style.setProperty('--pb-w', `${W * scale}px`);
  if (!raf) renderer.draw(view(), 0);
}

function buildUi() {
  const canvas = el('canvas', { class: 'pb-canvas' });
  const soundBtn = el('button', { class: 'pb-icon-btn', onclick: toggleSound });
  const pauseBtn = el('button', { class: 'pb-icon-btn', 'aria-label': T.pause, title: T.pause, onclick: showMenu });
  pauseBtn.innerHTML = ICON_PAUSE;
  // кнопка «Толчок» (бета 'pinball-nudge'): на телефоне — понятный способ толкнуть стол; срабатывает на нажатие
  const nudgeBtn = api.feature('pinball-nudge') && el('button', {
    class: 'pb-icon-btn pb-nudge-btn', 'aria-label': T.nudge, title: T.nudge,
    onpointerdown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.get();
      nudge(0);
    },
  });
  if (nudgeBtn) nudgeBtn.innerHTML = ICON_NUDGE;
  const score = el('div', { class: 'pb-score' }, '0');
  const balls = el('div', { class: 'pb-balls' });
  const rank = el('div', { class: 'pb-rank' });
  const mult = el('div', { class: 'pb-mult' }, '×1');
  const missionTitle = el('b', {});
  const missionText = el('span', {});
  const mission = el('div', { class: 'pb-mission' }, missionTitle, missionText);
  const fuel = el('div', { class: 'pb-fuel', title: T.fuel });
  const hud = el('div', { class: 'pb-hud' },
    el('div', { class: 'pb-hud-top' },
      el('div', { class: 'pb-score-box' }, score, el('div', { class: 'pb-sub' }, balls, rank, mult)),
      el('div', { class: 'pb-btns' }, nudgeBtn, soundBtn, pauseBtn),
    ),
    el('div', { class: 'pb-hud-bottom' }, mission, el('div', { class: 'pb-fuel-box' }, el('span', {}, T.fuel), fuel)),
  );
  const callout = el('div', { class: 'pb-callout', 'aria-live': 'polite' });
  const touch = matchMedia?.('(pointer: coarse)').matches;
  const hint = el('div', { class: 'pb-hint' }, touch ? T.hintTouch : T.hintKeys);
  const stage = el('div', { class: 'pb-stage' }, canvas, callout, hint);
  const modal = el('div', { class: 'pb-modal', hidden: true });
  const r = el('div', { class: 'pb' }, hud, stage, modal);
  return { root: r, canvas, soundBtn, score, balls, rank, mult, mission, missionTitle, missionText, fuel, callout, hint, stage, modal };
}

export default {
  id: 'pinball',
  title: 'Пинбол',

  async init(container, gameApi) {
    api = gameApi;
    root = container;
    const [savedSettings, savedStats] = await Promise.all([api.storage.get('settings'), api.storage.get('stats')]);
    if (!root) return;
    if (savedSettings && typeof savedSettings === 'object') settings = { ...settings, ...savedSettings };
    if (!(settings.skin in SKINS)) settings.skin = 'nebula';
    stats = R.isValidStats(savedStats) ? { ...R.emptyStats(), ...savedStats } : R.emptyStats();
    if (stats.played) api.progress(T.menuProgress(R.RANKS[stats.bestRank]));

    table = buildTable({ fixPlatform: api.feature('pinball-unstick') });
    table.byId = new Map();
    for (const c of table.colliders) if (c.id) table.byId.set(c.id, c);
    for (const p of Object.values(table.paths)) p.dense = densify(p.points);
    world = createWorld({ gravity: 1900, colliders: table.colliders, slopes: table.slopes });
    ball = world.addBall(LANE_X, PLUNGER_Y - BALL_R - 0.5, 0, 0, BALL_R);
    ball.trail = [];

    ui = buildUi();
    ui.root.dataset.skin = settings.skin;
    root.append(ui.root);
    renderer = createRenderer(ui.canvas, table);
    renderer.setSkin(settings.skin);
    renderSoundBtn();

    const saved = api.savedState?.v === 1 && R.isValidGame(api.savedState.g) ? api.savedState.g : null;
    if (saved) {
      g = R.resume(saved);
      shownScore = g.score;
      syncTargets();
      restOnPlunger();
      say(T.ball(g.ball, R.BALLS), true);
    } else newGame();

    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerUp);
    ui.stage.addEventListener('lostpointercapture', onPointerUp);
    ui.stage.addEventListener('contextmenu', (e) => e.preventDefault());
    // долгое нажатие на айфоне включало выделение текста и лупу (владелец, 2026-09-28): касания стола — только наши.
    // Pointer-события при этом приходят как обычно.
    ui.stage.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    ui.stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    ui.stage.addEventListener('selectstart', (e) => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVisibility);
    resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(root);
    resizeObs.observe(ui.stage);             // панель над столом меняет высоту — стол пересчитывается
    onResize();
    if (reducedMotion()) renderer.shake = () => {};

    if (new URLSearchParams(location.search).has('pbdebug')) {
      window.__pb = {
        get g() { return g; }, get ball() { return ball; }, world, table,
        get mode() { return mode; },
        launch(power = 1) { pull = power; launch(); },
        place(x, y, vx = 0, vy = 0, layer = 0) { mode = 'play'; place(x, y, vx, vy, layer); },
        press(side, on) { if (side < 0) keys.left = on; else keys.right = on; },
        hit: (id) => R.hit(g, id),
        say,
        get renderer() { return renderer; },
        view: () => view(),
        get quality() { return quality; },
      };
    }
    schedule();
  },

  getState() {
    if (!g || g.over || mode === 'over' || finished) return null;
    if (g.score <= 0 && g.ball === 1) return null;
    return { v: 1, g: R.snapshot(g) };
  },

  destroy() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (ambientOn) {
      try {
        audio.get()?.ambient(false);
      } catch { /* без звука */ }
      ambientOn = false;
    }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('visibilitychange', onVisibility);
    resizeObs?.disconnect();
    resizeObs = null;
    pointers.clear();
    keys.left = keys.right = keys.plunger = false;
    ui?.root.remove();
    if (typeof window !== 'undefined') delete window.__pb;
    api = root = ui = renderer = table = world = ball = g = null;
    lastTs = 0;
    paused = false;
    modalActive = false;
    finished = false;
    mode = 'plunger';
    pull = pullVisual = 0;
    ride = held = null;
    slowFor = 0;
    loopBox = null;
    platformFor = 0;
    clock = 0;
    noCatchUntil = 0;
    spin = { left: 0, rate: 0, acc: 0, angle: 0 };
    raiseAt = { mult: 0, medal: 0, boost: 0 };
    shownScore = 0;
    hudKey = '';
    callouts = [];
    calloutT = 0;
    hinted = false;
    flipWas = [false, false];
    sizeKey = '';
  },
};
