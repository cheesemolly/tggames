// «Змейка» «типа 3D»: вид на стол сверху-спереди (render.js). Классика — на рекорд, с режимами из Google Snake;
// уровни — карты с препятствиями (levels.js). Правила — logic.js.
//
// Управление: свайп в любом месте поля (срабатывает по ходу пальца, не по отпусканию; можно вести палец
// «змейкой» — каждый новый поворот считается от точки прошлого), стрелки/WASD, по желанию — кнопки-стрелки.
// Классика заканчивается api.finish (экран результата и рекорд оболочки), уровни — своими окнами.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  newGame, turn, step, tickMs, xy, isValidState, emptyStats, isValidStats, recordRun, bestKey,
  SPEEDS, SIZES, MODES, POWER_TIME,
} from './logic.js';
import { levelMap, mapTitle, cycleOf, MAP_COUNT } from './levels.js';
import { createRenderer } from './render.js';

const SKINS = [
  { id: 'telegram', title: 'Как в Telegram' },
  { id: 'grass', title: 'Лужайка' },
  { id: 'desert', title: 'Пустыня' },
  { id: 'night', title: 'Ночь' },
  { id: 'neon', title: 'Неон' },
  { id: 'snow', title: 'Снег' },
];
const MODE_INFO = {
  walls: { title: 'Стены', text: 'Каждое яблоко ставит кирпич' },
  portal: { title: 'Порталы', text: 'Съел яблоко — вынырнул у второго' },
  winged: { title: 'Летающая еда', text: 'Яблоки летают и отскакивают' },
  poison: { title: 'Яд', text: 'Ядовитый гриб укорачивает змейку' },
  twin: { title: 'Инь-ян', text: 'Вторая змейка повторяет ходы зеркально' },
};
const POWER_INFO = {
  magnet: { title: 'Магнит', text: 'еда сама ползёт к тебе' },
  slow: { title: 'Замедление', text: 'время течёт медленнее' },
  shield: { title: 'Щит', text: 'один удар простится' },
  double: { title: '×2', text: 'очки удваиваются' },
};
const DEATH_TEXT = {
  wall: 'Врезалась в стену', brick: 'Врезалась в кирпич', self: 'Укусила себя за хвост', spike: 'Наткнулась на шипы',
  mover: 'Врезалась в патруль', twin: 'Столкнулась с близнецом',
};
const PALETTE_KEYS = ['floor1', 'floor2', 'edge', 'rimTop', 'wallTop', 'wallSide', 'brick', 'snakeHead', 'snakeTail',
  'twinHead', 'twinTail', 'apple', 'mover', 'spike', 'spikeSide'];
const SWIPE = 18;
const FRUIT_COLORS = {
  apple: '#ef4444', pear: '#a3c94a', orange: '#fb923c', banana: '#fde047', grapes: '#8b5cf6', strawberry: '#ef233c', watermelon: '#f43f5e',
};

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" `
  + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  pause: svgIcon('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  play: svgIcon('<path d="M7 5l12 7-12 7z"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  levels: svgIcon('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  classic: svgIcon('<path d="M4 17c3 0 3-4 6-4s3 4 6 4 2-6 4-6"/><circle cx="20" cy="9" r="1.5" fill="currentColor"/>'),
  up: svgIcon('<path d="M12 5l-7 8h14z" fill="currentColor"/>'),
};

let api = null;
let host = null;
let ui = null;
let toast = null;
let fx = null;
let renderer = null;
let game = null;
let mode = 'classic';
let level = 1;
let bestLevel = 0;
let settings = { speed: 'snake', size: 'medium', modes: [], skin: 'telegram', arrows: false };
let stats = emptyStats();
let pal = null;
let prevSnake = null;
let prevTwin = null;
let acc = 0;
let lastFrame = 0;
let raf = 0;
let paused = false;
let modalActive = false;
let dying = null;             // { at, reason } — анимация смерти
let winning = false;
let swipe = null;
let seenPowers = [];
let finished = false;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// ---------- хранение ----------

function saveRun() {
  if (!api || !game) return;
  if (game.dead || game.won || !game.started) api.storage.remove('run');
  else api.storage.set('run', game);
}

const saveSettings = () => api.storage.set('settings', settings);

function progressLine() {
  api?.progress(bestLevel > 0 ? `Уровень ${Math.max(level, 1)}` : null);
}

// ---------- палитра ----------

/** Цвета скина из CSS-переменных --sn-* (через пробный элемент: canvas не понимает var() и color-mix()). */
function readPalette() {
  const probe = ui.probe;
  const out = {};
  for (const key of PALETTE_KEYS) {
    probe.style.color = `var(--sn-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)})`;
    out[key] = normalizeColor(getComputedStyle(probe).color);
  }
  return out;
}

function normalizeColor(c) {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) {
    // color(srgb r g b) — так браузеры отдают результат color-mix
    const s = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
    if (s) return `rgb(${s.slice(1, 4).map((v) => Math.round(Number(v) * 255)).join(',')})`;
    return c;
  }
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
  return `rgb(${r},${g},${b})`;
}

// ---------- партия ----------

function newRun() {
  const cfg = mode === 'levels'
    ? { mode: 'levels', speed: settings.speed, level, map: levelMap(level) }
    : { mode: 'classic', speed: settings.speed, size: settings.size, modes: settings.modes };
  startWith(newGame(cfg));
}

function startWith(state) {
  game = state;
  prevSnake = game.snake.slice();
  prevTwin = game.twin?.snake.slice() ?? null;
  acc = 0;
  dying = null;
  winning = false;
  finished = false;
  paused = false;
  host.classList.remove('sn-dead');
  renderHeader();
  renderHud();
  showHint();
  resize();
}

function renderHeader() {
  if (mode === 'levels') {
    ui.title.textContent = `Уровень ${level}`;
    const cycle = cycleOf(level);
    ui.sub.textContent = `${mapTitle(level)}${cycle > 1 ? ` · круг ${cycle}` : ''} · ${SPEEDS[settings.speed].title}`;
  } else {
    ui.title.textContent = 'Змейка';
    const n = settings.modes.length;
    const modes = n === 1 ? MODE_INFO[settings.modes[0]].title : n > 1 ? `${n} ${n < 5 ? 'режима' : 'режимов'}` : '';
    ui.sub.textContent = `${SPEEDS[settings.speed].title} · ${SIZES[settings.size].cols}×${SIZES[settings.size].rows}${modes ? ` · ${modes}` : ''}`;
  }
  ui.modeBtn.innerHTML = mode === 'levels' ? ICONS.classic : ICONS.levels;
  const label = mode === 'levels' ? 'Классика' : 'Уровни';
  ui.modeBtn.setAttribute('aria-label', label);
  ui.modeBtn.title = label;
  host.dataset.skin = settings.skin;
  host.classList.toggle('sn-arrows', settings.arrows);
}

function renderHud() {
  if (!game) return;
  const g = game;
  const best = mode === 'classic' ? stats.best[bestKey(g)] ?? 0 : null;
  const items = [
    stat('Очки', g.score),
    mode === 'levels' ? stat('Яблоки', `${Math.min(g.eaten, g.goal)}/${g.goal}`) : stat('Длина', g.snake.length),
    mode === 'classic' ? stat('Рекорд', Math.max(best, g.score)) : stat('Лучший', `ур. ${Math.max(bestLevel, 0)}`),
  ];
  ui.hud.replaceChildren(...items);
  if (mode === 'levels') {
    ui.goal.hidden = false;
    ui.goalFill.style.transform = `scaleX(${Math.min(1, g.eaten / g.goal)})`;
  } else ui.goal.hidden = true;
  renderEffects();
}

function stat(k, v) {
  return el('div', { class: 'sn-stat' }, el('span', { class: 'sn-stat-v' }, String(v)), el('span', { class: 'sn-stat-k' }, k));
}

function renderEffects() {
  const list = [];
  for (const k of ['magnet', 'slow', 'double']) {
    if (game.effects[k] > 0) list.push(el('span', { class: `sn-effect sn-effect-${k}`, style: `--left:${game.effects[k] / POWER_TIME[k]}` }, POWER_INFO[k].title));
  }
  if (game.effects.shield > 0) list.push(el('span', { class: 'sn-effect sn-effect-shield', style: '--left:1' }, 'Щит'));
  ui.effects.replaceChildren(...list);
}

function showHint() {
  const started = game?.started;
  ui.hint.hidden = Boolean(started);
  if (!started) {
    ui.hint.textContent = settings.arrows ? 'Проведи пальцем или нажми стрелку, чтобы поползти' : 'Проведи пальцем, чтобы поползти';
  }
}

// ---------- цикл ----------

function resize() {
  if (!ui) return;
  const w = ui.stage.clientWidth;
  const h = ui.stage.clientHeight;
  if (!w || !h) return;
  renderer.resize(w, h);
  pal = readPalette();
  draw(performance.now());
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - (lastFrame || now));
  lastFrame = now;
  if (!game) return;
  const running = game.started && !paused && !modalActive && !game.dead && !game.won && !document.hidden && !dying;
  if (running) {
    acc += dt;
    const ms = tickMs(game);
    let guard = 0;
    while (acc >= ms && guard++ < 3) {
      acc -= ms;
      doStep();
      if (game.dead || game.won) break;
    }
  }
  draw(now);
}

function draw(now) {
  if (!game || !pal) return;
  const ms = tickMs(game);
  const t = game.started && !game.dead && game.freeze === 0 ? Math.min(1, acc / ms) : 1;
  // еда летает и когда змейка стоит (после щита)
  const foodT = game.started && !game.dead ? Math.min(1, acc / ms) : 1;
  renderer.draw({
    s: game,
    prevSnake,
    prevTwin,
    t,
    foodT,
    time: now / 1000,
    pal,
    dying: dying ? Math.min(1, (now - dying.at) / 700) : null,
    deadWho: dying?.who,
    blink: game.freeze > 0,
  });
}

function doStep() {
  prevSnake = game.snake.slice();
  prevTwin = game.twin?.snake.slice() ?? null;
  const events = step(game);
  let hudDirty = false;
  for (const ev of events) {
    if (ev.type === 'eat') {
      hudDirty = true;
      const burger = ev.fruit === 'burger';
      burstAt(ev.idx, ev.kind === 'bonus' || burger ? '#ffd23f' : FRUIT_COLORS[ev.fruit] ?? pal.apple, ev.kind === 'bonus' || burger ? 18 : 10);
      floatAt(ev.idx, burger ? `Бургер! +${ev.points}` : `+${ev.points}`, ev.kind === 'bonus' || burger);
      api.platform.haptic.impact(ev.kind === 'bonus' ? 'medium' : 'light');
    } else if (ev.type === 'power') {
      hudDirty = true;
      burstAt(ev.idx, '#ffffff', 14);
      const info = POWER_INFO[ev.power];
      toast.show(seenPowers.includes(ev.power) ? info.title : `${info.title}: ${info.text}`, 1600);
      if (!seenPowers.includes(ev.power)) {
        seenPowers = [...seenPowers, ev.power];
        api.storage.set('seenPowers', seenPowers);
      }
      api.platform.haptic.impact('medium');
    } else if (ev.type === 'poison') {
      hudDirty = true;
      burstAt(ev.idx, '#8b5cf6', 14);
      floatAt(ev.idx, '−20', false, true);
      toast.show('Ядовитый гриб! Змейка стала короче', 1500);
      api.platform.haptic.notification('warning');
    } else if (ev.type === 'shield') {
      hudDirty = true;
      toast.show('Щит спас! Поворачивай', 1400);
      shake(ui.stage, { distance: 4, duration: 260 });
      api.platform.haptic.notification('warning');
    } else if (ev.type === 'teleport') {
      burstAt(ev.to, '#22d3ee', 8);
    } else if (ev.type === 'brick') {
      burstAt(ev.idx, pal.brick, 6);
    } else if (ev.type === 'spawn' && ev.kind === 'bonus') {
      api.platform.haptic.selection();
    } else if (ev.type === 'die') {
      onDeath(ev.reason, ev.who);
      return;
    } else if (ev.type === 'win') {
      onWin();
      return;
    }
  }
  if (hudDirty) renderHud();
  else if (game.effects.magnet || game.effects.slow || game.effects.double) renderEffects();
  if (game.steps % 20 === 0) saveRun();
}

function cellScreen(i, lift = 0.3) {
  const { x, y } = xy(game, i);
  return renderer.cellCenter(x, y, lift);
}

function burstAt(i, color, count) {
  const p = cellScreen(i);
  fx?.burst(p.x, p.y, color, count, { speed: 200, size: 5 });
}

function floatAt(i, text, big = false, bad = false) {
  const p = cellScreen(i, 0.6);
  const node = el('span', { class: `sn-float ${big ? 'big' : ''} ${bad ? 'bad' : ''}`.trim(), style: `left:${p.x}px;top:${p.y}px` }, text);
  ui.stage.append(node);
  animate(node, [
    { opacity: 0, transform: 'translate(-50%, -30%) scale(0.7)' },
    { opacity: 1, transform: 'translate(-50%, -90%) scale(1.1)', offset: 0.25 },
    { opacity: 0, transform: 'translate(-50%, -200%) scale(1)' },
  ], { duration: 900, easing: 'ease-out' }).then(() => node.remove());
}

// ---------- конец ----------

function onDeath(reason, who = 'main') {
  // кто разбился — главная, близнец или обе: у них глаза крестиком и звёздочки
  dying = { at: performance.now(), reason, who };
  host.classList.add('sn-dead');
  api.platform.haptic.notification('error');
  shake(ui.stage, { distance: 8, duration: 420 });
  const head = cellScreen(game.snake[0]);
  fx?.burst(head.x, head.y, pal.snakeHead, 24, { speed: 260, size: 7 });
  stats = recordRun(stats, game);
  api.storage.set('stats', stats);
  api.storage.remove('run');
  const reasonText = DEATH_TEXT[reason.replace('twin-', '')] ?? 'Не повезло';
  later(() => {
    if (!ui) return;
    if (mode === 'classic') {
      finished = true;
      api.finish({
        outcome: 'lose',
        title: 'Игра окончена',
        score: game.score,
        message: `${reason.startsWith('twin-') ? 'Близнец: ' : ''}${reasonText.toLowerCase()} · длина ${game.snake.length}`,
        share: `🐍 Змейка: ${game.score} очков, длина ${game.snake.length}`,
      });
    } else {
      openModal([
        el('h2', {}, 'Не вышло'),
        el('p', { class: 'sn-muted' }, `${reasonText}. Съедено ${game.eaten} из ${game.goal}.`),
        el('div', { class: 'sn-row' },
          el('button', { class: 'sn-btn', onclick: () => { closeModal(); newRun(); } }, 'Ещё раз'),
          el('button', { class: 'sn-btn sn-btn-2', onclick: openLevels }, 'Уровни')),
      ], { dismissible: false });
    }
  }, reducedMotion() ? 300 : 1400);                // успеть увидеть крестики и звёздочки
}

function onWin() {
  winning = true;
  api.platform.haptic.notification('success');
  stats = recordRun(stats, game);
  api.storage.set('stats', stats);
  api.storage.remove('run');
  if (mode === 'classic') {
    // поле заполнено целиком — редкость, но бывает на маленьком поле
    finished = true;
    fx?.confetti(['#ff4d4d', '#ffd23f', '#3ddc84', '#2ec4f1', '#9b5de5'], 160);
    later(() => ui && api.finish({ outcome: 'win', title: 'Поле заполнено!', score: game.score }), 1200);
    return;
  }
  const done = level;
  level++;
  bestLevel = Math.max(bestLevel, done);
  api.storage.set('levels', { level, best: bestLevel });
  progressLine();
  fx?.confetti(['#ff4d4d', '#ffd23f', '#3ddc84', '#2ec4f1', '#9b5de5'], 120);
  later(() => ui && openModal([
    el('h2', { class: 'sn-win' }, `Уровень ${done} пройден!`),
    el('p', { class: 'sn-muted' }, `«${mapTitle(done)}» · ${game.score} очков · длина ${game.snake.length}`),
    el('button', { class: 'sn-btn', onclick: () => { closeModal(); newRun(); } }, `Уровень ${level}: «${mapTitle(level)}»`),
  ], { dismissible: false }), 700);
}

// ---------- управление ----------

function doTurn(dir) {
  if (!game || game.dead || game.won || dying || modalActive) return;
  if (paused) setPaused(false);
  const wasStarted = game.started;
  const ok = turn(game, dir);
  if (!wasStarted && game.started) {
    showHint();
    lastFrame = performance.now();
  }
  if (ok) api.platform.haptic.selection();
}

function onPointerDown(e) {
  if (e.target.closest('button')) return;
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  try { ui.stage.setPointerCapture(e.pointerId); } catch { /* синтетический указатель */ }
}

function onPointerMove(e) {
  if (!swipe || swipe.id !== e.pointerId) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
  doTurn(dir);
  // следующий поворот — от этой точки: можно вести палец «змейкой», не отрывая
  swipe.x = e.clientX;
  swipe.y = e.clientY;
}

function onPointerUp(e) {
  if (swipe?.id === e.pointerId) swipe = null;
}

const KEYS = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R',
};

function onKey(e) {
  if (!ui || e.ctrlKey || e.metaKey || e.altKey) return;
  if (KEYS[e.code]) {
    e.preventDefault();
    doTurn(KEYS[e.code]);
  } else if ((e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') && game?.started && !modalActive) {
    e.preventDefault();
    setPaused(!paused);
  }
}

function setPaused(on) {
  if (!game || game.dead || game.won) return;
  paused = on;
  ui.pauseBtn.innerHTML = on ? ICONS.play : ICONS.pause;
  ui.pauseBtn.setAttribute('aria-label', on ? 'Продолжить' : 'Пауза');
  ui.pauseLayer.hidden = !on;
  if (on) {
    saveRun();
    animate(ui.pauseLayer, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  } else lastFrame = performance.now();
}

function onVisibility() {
  if (document.hidden && game?.started && !game.dead && !game.won) setPaused(true);
}

// ---------- окна ----------

let dismissible = true;

function openModal(content, { dismissible: canDismiss = true } = {}) {
  dismissible = canDismiss;
  ui.modal.replaceChildren(el('div', { class: 'sn-card' }, content));
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  lastFrame = performance.now();
  hideLayer(ui.modal, () => !modalActive);
}

function options(list, current, onPick, render = (o) => o.title) {
  return el('div', { class: 'sn-options' }, list.map((o) => el('button', {
    class: `sn-option ${(Array.isArray(current) ? current.includes(o.id) : o.id === current) ? 'on' : ''}`.trim(),
    onclick: () => onPick(o.id),
  }, render(o))));
}

/** Настройки поменялись: если партия ещё не начата — сразу новая, иначе — со следующей. */
function applyChange() {
  saveSettings();
  if (!game?.started || game.dead || game.won) newRun();
  else toast.show('Изменения — со следующей партии', 1800);
  renderHeader();
}

function openSettings() {
  if (game?.started && !game.dead) setPaused(true);
  const redraw = () => openSettings();
  openModal([
    el('h2', {}, 'Настройки'),
    el('div', { class: 'sn-section' }, 'Скорость'),
    options(Object.entries(SPEEDS).map(([id, s]) => ({ id, title: s.title, text: `очки ×${s.mult}` })), settings.speed, (id) => {
      settings = { ...settings, speed: id };
      applyChange();
      redraw();
    }, (o) => [el('b', {}, o.title), el('small', {}, o.text)]),
    el('div', { class: 'sn-section' }, 'Поле (классика)'),
    options(Object.entries(SIZES).map(([id, s]) => ({ id, title: `${s.title}`, text: `${s.cols}×${s.rows}` })), settings.size, (id) => {
      settings = { ...settings, size: id };
      applyChange();
      redraw();
    }, (o) => [el('b', {}, o.title), el('small', {}, o.text)]),
    el('div', { class: 'sn-section' }, 'Режимы (классика, можно несколько)'),
    options(MODES.map((id) => ({ id, ...MODE_INFO[id] })), settings.modes, (id) => {
      const modes = settings.modes.includes(id) ? settings.modes.filter((m) => m !== id) : [...settings.modes, id];
      settings = { ...settings, modes };
      applyChange();
      redraw();
    }, (o) => [el('b', {}, o.title), el('small', {}, o.text)]),
    el('div', { class: 'sn-section' }, 'Оформление'),
    el('div', { class: 'sn-skins' }, SKINS.map((s) => el('button', {
      class: `sn-skin ${s.id === settings.skin ? 'on' : ''}`.trim(),
      'data-skin': s.id,
      onclick: () => {
        settings = { ...settings, skin: s.id };
        saveSettings();
        host.dataset.skin = s.id;
        pal = readPalette();
        redraw();
      },
    }, el('span', { class: 'sn-skin-sample' }, el('i'), el('i'), el('i')), el('span', {}, s.title)))),
    el('label', { class: 'sn-toggle' },
      el('input', { type: 'checkbox', checked: settings.arrows, onchange: (e) => {
        settings = { ...settings, arrows: e.target.checked };
        saveSettings();
        renderHeader();
        showHint();
        later(resize, 50);
      } }),
      el('span', {}, 'Кнопки-стрелки на экране')),
    el('button', { class: 'sn-btn', onclick: closeModal }, 'Готово'),
  ]);
}

function openLevels() {
  if (game?.started && !game.dead && !game.won) setPaused(true);
  const open = Math.max(bestLevel + 1, 1);
  const count = Math.max(MAP_COUNT, open);
  openModal([
    el('h2', {}, 'Уровни'),
    el('p', { class: 'sn-muted' }, 'Съешь нужное число яблок — и дальше. После 12-го карты идут по кругу, но быстрее.'),
    el('div', { class: 'sn-levels' }, Array.from({ length: count }, (_, k) => {
      const n = k + 1;
      const locked = n > open;
      return el('button', {
        class: `sn-level ${n === level ? 'on' : ''} ${n <= bestLevel ? 'done' : ''}`.trim(),
        disabled: locked,
        onclick: () => {
          level = n;
          api.storage.set('levels', { level, best: bestLevel });
          if (mode !== 'levels') {
            mode = 'levels';
            api.storage.set('mode', mode);
          }
          closeModal();
          newRun();
          progressLine();
        },
      }, el('b', {}, locked ? '🔒' : String(n)), el('small', {}, mapTitle(n)));
    })),
    el('button', { class: 'sn-btn sn-btn-2', onclick: () => { closeModal(); if (dying || game?.dead) newRun(); } }, 'Закрыть'),
  ], { dismissible: !(dying || game?.dead) });
}

function openStats() {
  if (game?.started && !game.dead) setPaused(true);
  const best = Object.entries(stats.best).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rows = [
    ['Игр', stats.games], ['Яблок съедено', stats.apples], ['Самая длинная', stats.bestLength],
    ['Уровней пройдено', stats.levelsCleared], ['Лучший уровень', stats.bestLevel],
  ];
  openModal([
    el('h2', {}, 'Статистика'),
    el('div', { class: 'sn-result' }, rows.map(([k, v]) => el('div', { class: 'sn-res' }, el('span', { class: 'sn-res-v' }, String(v)), el('span', { class: 'sn-res-k' }, k)))),
    best.length > 0 && el('div', { class: 'sn-section' }, 'Рекорды классики'),
    best.length > 0 && el('div', { class: 'sn-bests' }, best.map(([key, score]) => {
      const [speed, size, modes] = key.split(':');
      const modeText = modes === 'classic' ? '' : ` · ${modes.split('+').map((m) => MODE_INFO[m]?.title ?? m).join(' + ')}`;
      return el('div', { class: 'sn-best-row' }, el('span', {}, `${SPEEDS[speed]?.title ?? speed} · ${SIZES[size]?.cols ?? ''}×${SIZES[size]?.rows ?? ''}${modeText}`), el('b', {}, String(score)));
    })),
    el('button', { class: 'sn-btn', onclick: closeModal }, 'Закрыть'),
  ]);
}

function switchMode() {
  if (mode === 'classic') {
    openLevels();
    return;
  }
  if (game?.started && !game.dead && !game.won) saveRun();
  mode = 'classic';
  api.storage.set('mode', mode);
  newRun();
}

// ---------- модуль ----------

export default {
  id: 'snake',
  title: 'Змейка',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    const keys = ['settings', 'stats', 'levels', 'mode', 'run', 'seenPowers'];
    const loaded = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await api.storage.get(k)])));
    if (!api) return;
    settings = { ...settings, ...(loaded.settings ?? {}) };
    if (!SPEEDS[settings.speed]) settings.speed = 'snake';
    if (!SIZES[settings.size]) settings.size = 'medium';
    if (!Array.isArray(settings.modes)) settings.modes = [];
    settings.modes = settings.modes.filter((m) => MODES.includes(m));
    if (!SKINS.some((s) => s.id === settings.skin)) settings.skin = 'telegram';
    stats = isValidStats(loaded.stats) ? loaded.stats : emptyStats();
    level = Number.isInteger(loaded.levels?.level) && loaded.levels.level >= 1 ? loaded.levels.level : 1;
    bestLevel = Number.isInteger(loaded.levels?.best) ? loaded.levels.best : 0;
    mode = loaded.mode === 'levels' ? 'levels' : 'classic';
    seenPowers = Array.isArray(loaded.seenPowers) ? loaded.seenPowers : [];

    const iconBtn = (icon, label, onclick) => {
      const b = el('button', { class: 'sn-icon-btn', 'aria-label': label, title: label, onclick });
      b.innerHTML = icon;
      return b;
    };
    const arrow = (dir, cls) => {
      const b = el('button', { class: `sn-arrow ${cls}`, 'aria-label': { U: 'Вверх', D: 'Вниз', L: 'Влево', R: 'Вправо' }[dir] });
      b.innerHTML = ICONS.up;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        doTurn(dir);
      });
      return b;
    };

    ui = {
      title: el('div', { class: 'sn-title' }, 'Змейка'),
      sub: el('div', { class: 'sn-sub' }),
      modeBtn: iconBtn(ICONS.levels, 'Уровни', () => switchMode()),
      pauseBtn: iconBtn(ICONS.pause, 'Пауза', () => { if (game?.started) setPaused(!paused); }),
      hud: el('div', { class: 'sn-hud' }),
      goal: el('div', { class: 'sn-goal', hidden: true }),
      goalFill: el('span', { class: 'sn-goal-fill' }),
      effects: el('div', { class: 'sn-effects' }),
      stage: el('div', { class: 'sn-stage' }),
      canvas: el('canvas', { class: 'sn-canvas' }),
      hint: el('div', { class: 'sn-hint' }),
      pauseLayer: el('div', { class: 'sn-pause', hidden: true }, el('span', {}, 'Пауза'), el('small', {}, 'Свайп или ▶ — продолжить')),
      probe: el('span', { class: 'sn-probe' }),
      modal: el('div', { class: 'sn-modal', hidden: true, onclick: (e) => { if (e.target === ui.modal && dismissible) closeModal(); } }),
    };
    ui.goal.append(ui.goalFill);
    ui.stage.append(ui.canvas, ui.hint, ui.pauseLayer);
    const pad = el('div', { class: 'sn-pad' },
      arrow('U', 'up'), arrow('L', 'left'), arrow('R', 'right'), arrow('D', 'down'));

    container.replaceChildren(el('div', { class: 'sn' },
      el('header', { class: 'sn-header' },
        el('div', { class: 'sn-head-text' }, ui.title, ui.sub),
        el('div', { class: 'sn-actions' },
          ui.modeBtn,
          iconBtn(ICONS.stats, 'Статистика', openStats),
          iconBtn(ICONS.gear, 'Настройки', openSettings),
          ui.pauseBtn,
        ),
      ),
      ui.hud,
      ui.goal,
      ui.effects,
      ui.stage,
      pad,
      ui.modal,
      ui.probe,
    ), toast.el);

    renderer = createRenderer(ui.canvas);
    fx = createFx(ui.stage, 'sn-fx');
    ui.stage.append(fx.canvas);
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerUp);
    ui.resize = new ResizeObserver(() => resize());
    ui.resize.observe(ui.stage);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    host.dataset.skin = settings.skin;

    const run = loaded.run;
    const resumable = isValidState(run) && !run.dead && !run.won && run.started && run.mode === mode
      && (mode !== 'levels' || run.level === level);
    if (resumable) {
      startWith(run);
      setPaused(true);                       // вернулись — на паузе, продолжить свайпом
    } else newRun();
    progressLine();
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
    // для проверки из Claude: ?sndebug — доступ к партии (подложить еду, сделать шаг)
    if (/[?&]sndebug\b/.test(location.search)) window.__snake = { game: () => game, step: doStep, turn: doTurn };
  },

  getState() {
    saveRun();
    return null;                              // забег хранится в api.storage игры ('run')
  },

  destroy() {
    if (game && !finished) saveRun();
    cancelAnimationFrame(raf);
    raf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    ui?.resize?.disconnect();
    fx?.dispose?.();
    toast?.el.remove();
    fx = null;
    toast = null;
    renderer = null;
    ui = null;
    host = null;
    api = null;
    game = null;
    pal = null;
    swipe = null;
    dying = null;
    paused = false;
    modalActive = false;
    winning = false;
    finished = false;
    stats = emptyStats();
    mode = 'classic';
    level = 1;
    bestLevel = 0;
  },
};
