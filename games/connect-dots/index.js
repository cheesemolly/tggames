// «Соедини точки» по видео My Talking Tom Connect: соединяй пары точек одного цвета линиями по клеткам,
// линии не пересекаются (кроме тоннелей — там крест-накрест), заполнять всё поле не нужно.
// Бесконечные раунды: поле растёт до 8×8, с 7-го раунда — стены, с 12-го — тоннели.
// Таймер на раунд (в настройках отключается); время вышло — игра окончена.
// Партия, статистика и настройки — в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  levelParams, checkPaths, startAt, stepTo, emptyPaths, newGame, nextRound, applyHint,
  roundPoints, isValidState, emptyStats, isValidStats, isAdjacent, axisOf,
} from './logic.js';

const SKINS = ['telegram', 'classic', 'neon', 'paper', 'candy', 'space'];
const COLORS = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const T = {
  title: 'Соедини точки',
  round: (n) => `Раунд ${n}`,
  score: 'Очки',
  best: 'Рекорд',
  tools: { reset: 'Сбросить', hint: 'Подсказка' },
  noHints: 'Подсказки закончились',
  cleared: (n) => `Раунд ${n} пройден!`,
  newRound: (n) => `Раунд ${n}`,
  walls: 'Новое: стены — через них не пройти',
  tunnels: 'Новое: тоннели — сквозь них можно пройти только прямо, и две линии могут пересечься',
  timeUp: 'Время вышло!',
  resultTitle: 'Время вышло',
  result: (rounds) => `Пройдено раундов: ${rounds}`,
  newGame: 'Новая игра',
  restartQuestion: 'Начать заново с первого раунда?',
  restart: 'Начать заново',
  cancel: 'Отмена',
  stats: { open: 'Статистика', title: 'Статистика', played: 'Игр', bestRound: 'Лучший раунд', bestScore: 'Рекорд', rounds: 'Раундов пройдено', close: 'Закрыть' },
  settings: { open: 'Настройки', title: 'Настройки', timer: 'Таймер', timerDesc: 'Время на раунд. Выключи — играй без спешки, игра не кончится.', skin: 'Оформление', close: 'Закрыть' },
  skins: { telegram: 'Как в Telegram', classic: 'Классика', neon: 'Неон', paper: 'Бумага', candy: 'Конфета', space: 'Космос' },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  reset: svgIcon('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = emptyStats();
let settings = { timer: true, skin: 'telegram' };
let drawing = null;             // { color, pointerId }
let busy = false;               // анимация перехода между раундами
let over = false;
let runningSince = null;
let modalActive = false;
let modalToken = 0;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const cssVar = (name) => getComputedStyle(host).getPropertyValue(name).trim();
const colorVar = (color) => `var(--cd-c${(color % COLORS) + 1})`;

function save() {
  if (!game || over) return;
  if (runningSince !== null) {
    game.timeLeftMs = timeLeft();
    runningSince = performance.now();
  }
  api.storage.set('current', game);
}

// ---------- таймер ----------

function timeLeft() {
  if (game.timeLeftMs === null) return null;
  return Math.max(0, game.timeLeftMs - (runningSince === null ? 0 : performance.now() - runningSince));
}

function startClock() {
  if (!settings.timer || over || busy || modalActive) return;
  if (game.timeLeftMs === null) game.timeLeftMs = levelParams(game.round).timeSec * 1000;
  if (runningSince === null) runningSince = performance.now();
}

function stopClock() {
  if (runningSince !== null) game.timeLeftMs = timeLeft();
  runningSince = null;
}

function renderTimer() {
  ui.timer.hidden = !settings.timer;
  if (!settings.timer || !game) return;
  const total = levelParams(game.round).timeSec * 1000;
  const left = timeLeft() ?? total;
  const k = Math.max(0, Math.min(1, left / total));
  ui.timerFill.style.transform = `scaleX(${k})`;
  ui.timer.classList.toggle('cd-timer-low', k < 0.25);
  ui.timerLabel.textContent = T.round(game.round);
}

function tick() {
  if (!game || over || runningSince === null) return;
  renderTimer();
  if (timeLeft() <= 0) timeUp();
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    stopClock();
    save();
  } else if (!modalActive) {
    startClock();
  }
}

// ---------- отрисовка ----------

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const center = (i, n) => [(i % n) + 0.5, Math.floor(i / n) + 0.5];

/** Поле заново: сетка, стены, линии, тоннели (поперечная линия — поверх трубы), точки. */
function renderBoard() {
  const { level } = game;
  const n = level.size;
  const svg = ui.svg;
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  const layers = { grid: svgEl('g'), paths: svgEl('g', { class: 'cd-paths' }), tunnels: svgEl('g'), over: svgEl('g', { class: 'cd-paths' }), dots: svgEl('g') };

  // сетка
  layers.grid.append(svgEl('rect', { x: 0, y: 0, width: n, height: n, class: 'cd-board-bg', rx: 0.12 }));
  for (let k = 1; k < n; k++) {
    layers.grid.append(svgEl('line', { x1: k, y1: 0, x2: k, y2: n, class: 'cd-grid' }));
    layers.grid.append(svgEl('line', { x1: 0, y1: k, x2: n, y2: k, class: 'cd-grid' }));
  }
  // стены — металлические плитки с заклёпками
  for (const w of level.walls) {
    const x = w % n;
    const y = Math.floor(w / n);
    const g = svgEl('g', { class: 'cd-wall' });
    g.append(svgEl('rect', { x: x + 0.06, y: y + 0.06, width: 0.88, height: 0.88, rx: 0.1 }));
    for (const [dx, dy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) g.append(svgEl('circle', { cx: x + dx, cy: y + dy, r: 0.05, class: 'cd-rivet' }));
    layers.grid.append(g);
  }

  const { connected } = checkPaths(level, game.paths);
  const tunnelAxis = new Map(level.tunnels.map((t) => [t.cell, t.axis]));

  // линии
  game.paths.forEach((path, color) => {
    if (path.length < 2) return;
    const points = path.map((i) => center(i, n).join(',')).join(' ');
    layers.paths.append(svgEl('polyline', {
      points,
      class: `cd-path${connected[color] ? ' cd-path-done' : ''}`,
      'data-color': color,
      style: `stroke: ${colorVar(color)}`,
    }));
    // через тоннель поперёк — отрезок поверх трубы
    path.forEach((cell, k) => {
      if (!tunnelAxis.has(cell) || k === 0) return;
      const along = axisOf(path[k - 1], cell, n);
      if (along === tunnelAxis.get(cell)) return;
      const [cx, cy] = center(cell, n);
      const seg = along === 'h' ? { x1: cx - 0.5, y1: cy, x2: cx + 0.5, y2: cy } : { x1: cx, y1: cy - 0.5, x2: cx, y2: cy + 0.5 };
      layers.over.append(svgEl('line', { ...seg, class: 'cd-path cd-path-over', style: `stroke: ${colorVar(color)}` }));
    });
  });

  // тоннели — «труба» вдоль оси
  for (const { cell, axis } of level.tunnels) {
    const [cx, cy] = center(cell, n);
    const g = svgEl('g', { class: 'cd-tunnel' });
    const long = { w: 1, h: 0.62 };
    const box = axis === 'h'
      ? { x: cx - long.w / 2, y: cy - long.h / 2, width: long.w, height: long.h }
      : { x: cx - long.h / 2, y: cy - long.w / 2, width: long.h, height: long.w };
    g.append(svgEl('rect', { ...box, rx: 0.08, class: 'cd-tunnel-body' }));
    const stripes = axis === 'h'
      ? [[box.x + 0.1, box.y, box.x + 0.1, box.y + box.height], [box.x + 0.9, box.y, box.x + 0.9, box.y + box.height]]
      : [[box.x, box.y + 0.1, box.x + box.width, box.y + 0.1], [box.x, box.y + 0.9, box.x + box.width, box.y + 0.9]];
    for (const [x1, y1, x2, y2] of stripes) g.append(svgEl('line', { x1, y1, x2, y2, class: 'cd-tunnel-rim' }));
    layers.tunnels.append(g);
  }

  // точки
  level.dots.forEach(([a, b], color) => {
    for (const cell of [a, b]) {
      const [cx, cy] = center(cell, n);
      const active = drawing?.color === color;
      layers.dots.append(svgEl('circle', {
        cx, cy, r: active ? 0.4 : 0.36,
        class: `cd-dot${connected[color] ? ' cd-dot-done' : ''}`,
        style: `fill: ${colorVar(color)}`,
        'data-cell': cell,
      }));
    }
  });

  svg.replaceChildren(layers.grid, layers.paths, layers.tunnels, layers.over, layers.dots);
}

function renderInfo() {
  ui.sub.textContent = T.round(game.round);
  ui.score.textContent = game.score;
  ui.best.textContent = Math.max(stats.bestScore, game.score);
  ui.hintBadge.textContent = game.hintsLeft;
  ui.hintButton.disabled = over || game.hintsLeft <= 0;
}

// ---------- ввод пальцем ----------

function cellAt(e) {
  const r = ui.svg.getBoundingClientRect();
  const n = game.level.size;
  const col = Math.floor(((e.clientX - r.left) / r.width) * n);
  const row = Math.floor(((e.clientY - r.top) / r.height) * n);
  if (row < 0 || row >= n || col < 0 || col >= n) return -1;
  return row * n + col;
}

function onPointerDown(e) {
  if (!game || busy || over || modalActive || drawing) return;
  const cell = cellAt(e);
  if (cell < 0) return;
  const started = startAt(game.level, game.paths, cell);
  if (!started) return;
  e.preventDefault();
  try {
    ui.svg.setPointerCapture(e.pointerId);
  } catch {
    // без захвата движения всё равно придут
  }
  drawing = { color: started.color, pointerId: e.pointerId };
  game.paths = started.paths;
  api.platform.haptic.selection();
  renderBoard();
}

function onPointerMove(e) {
  if (!drawing || e.pointerId !== drawing.pointerId) return;
  const target = cellAt(e);
  if (target < 0) return;
  const n = game.level.size;
  // палец мог перескочить через клетки — идём к нему по шагу, сначала по большей оси
  for (let guard = 0; guard < 2 * n; guard++) {
    const path = game.paths[drawing.color];
    const last = path.at(-1);
    if (last === target) break;
    const dr = Math.floor(target / n) - Math.floor(last / n);
    const dc = (target % n) - (last % n);
    // сначала по большей оси; если туда нельзя (стена, тоннель поперёк) — по другой
    const byRow = dr ? last + Math.sign(dr) * n : -1;
    const byCol = dc ? last + Math.sign(dc) : -1;
    const steps = (Math.abs(dr) >= Math.abs(dc) ? [byRow, byCol] : [byCol, byRow]).filter((c) => c >= 0 && isAdjacent(last, c, n));
    let result = null;
    for (const step of steps) {
      result = stepTo(game.level, game.paths, drawing.color, step);
      if (result.event !== 'blocked') break;
    }
    if (!result || result.event === 'blocked') break;
    const { paths, event } = result;
    game.paths = paths;
    if (event === 'connect') {
      api.platform.haptic.impact('medium');
      renderBoard();
      const [a, b] = game.level.dots[drawing.color];
      for (const cell of [a, b]) {
        const dot = ui.svg.querySelector(`.cd-dot[data-cell="${cell}"]`);
        if (dot) animate(dot, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
      }
      break;
    }
    if (event === 'cut') api.platform.haptic.impact('light');
    else api.platform.haptic.selection();
  }
  renderBoard();
}

function onPointerUp(e) {
  if (!drawing || e.pointerId !== drawing.pointerId) return;
  drawing = null;
  renderBoard();
  save();
  if (checkPaths(game.level, game.paths).complete) roundCleared();
}

// ---------- раунды ----------

function roundCleared() {
  busy = true;
  stopClock();
  const left = settings.timer ? timeLeft() : null;
  const points = roundPoints(game.level, left);
  game.score += points;
  stats.bestRound = Math.max(stats.bestRound, game.round);
  stats.bestScore = Math.max(stats.bestScore, game.score);
  stats.rounds += 1;
  api.storage.set('stats', stats);
  api.platform.haptic.notification('success');
  renderInfo();
  pop(ui.score, { from: 0.8 });

  // искры из каждой точки, надпись «Раунд пройден»
  const board = ui.svg.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const n = game.level.size;
  game.level.dots.forEach((pair, color) => pair.forEach((cell) => {
    const [cx, cy] = center(cell, n);
    fx?.burst(board.left - rootRect.left + (cx / n) * board.width, board.top - rootRect.top + (cy / n) * board.height,
      cssVar(`--cd-c${(color % COLORS) + 1}`), 8, { speed: 240, size: 6 });
  }));
  ui.board.classList.add('cd-glow');
  floatText(T.cleared(game.round), `+${points}`);

  later(() => {
    if (!ui) return;
    ui.board.classList.remove('cd-glow');
    const params = levelParams(game.round + 1);
    const prev = levelParams(game.round);
    animate(ui.svg, [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.85)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).then(() => {
      if (!ui) return;
      nextRound(game);
      busy = false;
      ui.svg.getAnimations().forEach((a) => a.cancel());
      renderBoard();
      renderInfo();
      introRound();
      if (params.walls && !prev.walls) toast.show(T.walls, 2600);
      else if (params.tunnels && !prev.tunnels) toast.show(T.tunnels, 3200);
      startClock();
      renderTimer();
      save();
    });
  }, reducedMotion() ? 0 : 1100);
}

/** Новый раунд: поле впрыгивает, точки появляются по очереди. */
function introRound() {
  animate(ui.svg, [{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE_OUT });
  [...ui.svg.querySelectorAll('.cd-dot')].forEach((dot, k) => animate(dot, [
    { transform: 'scale(0)' }, { transform: 'scale(1.2)', offset: 0.7 }, { transform: 'scale(1)' },
  ], { duration: 320, delay: 120 + Math.floor(k / 2) * 70, easing: 'ease-out', fill: 'backwards' }));
}

function floatText(title, sub) {
  const node = el('div', { class: 'cd-float' }, el('b', {}, title), el('span', {}, sub));
  ui.wrap.append(node);
  later(() => node.remove(), 1400);
}

function timeUp() {
  if (over) return;
  over = true;
  stopClock();
  drawing = null;
  game.timeLeftMs = 0;
  renderTimer();
  api.storage.remove('current');
  stats.played += 1;
  api.storage.set('stats', stats);
  api.platform.haptic.notification('error');
  toast.show(T.timeUp, 1500);
  shake(ui.board, { distance: 8, duration: 450 });
  ui.board.classList.add('cd-over');
  renderInfo();
  const { score, round } = game;
  later(() => api.finish({
    outcome: 'lose', title: T.resultTitle, score, locale: 'ru', message: T.result(round - 1),
  }), reducedMotion() ? 0 : 1400);
}

function onReset() {
  if (!game || busy || over) return;
  if (game.paths.every((p) => p.length <= 1)) return;
  game.paths = emptyPaths(game.level);
  api.platform.haptic.impact('light');
  animate(ui.svg.querySelector('.cd-paths'), [{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).then(() => ui && renderBoard());
  save();
}

function onHint() {
  if (!game || busy || over) return;
  if (game.hintsLeft <= 0) {
    toast.show(T.noHints);
    return;
  }
  const color = applyHint(game);
  if (color < 0) return;
  api.platform.haptic.impact('medium');
  renderBoard();
  renderInfo();
  save();
  const path = ui.svg.querySelector(`polyline[data-color="${color}"]`);
  if (path) {
    const length = path.getTotalLength?.() ?? 10;
    path.style.strokeDasharray = `${length}`;
    animate(path, [{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 500, easing: 'ease-out' })
      .then(() => { path.style.strokeDasharray = ''; });
  }
  if (checkPaths(game.level, game.paths).complete) later(roundCleared, 450);
}

// ---------- окна ----------

function openModal(content) {
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  stopClock();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  startClock();
}

function card(title, ...children) {
  return el('div', { class: 'cd-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'cd-card-head' },
      el('h2', {}, title),
      el('button', { class: 'cd-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats() {
  const item = (value, label) => el('div', { class: 'cd-stat' }, el('div', { class: 'cd-stat-value' }, value), el('div', { class: 'cd-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'cd-stats-grid' },
    item(stats.bestRound, T.stats.bestRound), item(stats.bestScore, T.stats.bestScore),
    item(stats.rounds, T.stats.rounds), item(stats.played, T.stats.played),
  )));
}

function showSettings() {
  const timerSwitch = el('input', {
    type: 'checkbox', class: 'cd-switch', role: 'switch', checked: settings.timer,
    onchange: (e) => {
      settings.timer = e.target.checked;
      api.storage.set('settings', settings);
      if (!settings.timer) {
        runningSince = null;
        game.timeLeftMs = null;
      }
      renderTimer();
    },
  });
  const skinButtons = SKINS.map((id) => el('button', {
    class: 'cd-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'cd-swatch', 'data-skin': id }), T.skins[id]));
  openModal(card(T.settings.title,
    el('label', { class: 'cd-setting' },
      el('div', {}, el('div', { class: 'cd-setting-title' }, T.settings.timer), el('div', { class: 'cd-note' }, T.settings.timerDesc)),
      timerSwitch),
    el('h3', { class: 'cd-section' }, T.settings.skin),
    el('div', { class: 'cd-skins', role: 'radiogroup' }, skinButtons),
  ));
}

function askRestart() {
  if (busy) return;
  if (over || game.round === 1) {
    startGame();
    return;
  }
  openModal(card(T.newGame,
    el('p', { class: 'cd-note' }, T.restartQuestion),
    el('div', { class: 'cd-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.cancel),
      el('button', { class: 'btn', onclick: () => { closeModal(); startGame(); } }, T.restart),
    ),
  ));
}

function startGame(saved = null) {
  // брошенная посреди игра (раунд пройден хотя бы один) засчитывается как сыгранная
  if (!saved && game && !over && game.round > 1) {
    stats.played += 1;
    api.storage.set('stats', stats);
  }
  game = saved ?? newGame();
  over = false;
  busy = false;
  drawing = null;
  runningSince = null;
  if (!settings.timer) game.timeLeftMs = null;
  ui.board.classList.remove('cd-over');
  renderBoard();
  renderInfo();
  introRound();
  startClock();
  renderTimer();
  save();
}

function toolButton(icon, label, onclick, badge = null) {
  const button = el('button', { class: 'cd-tool', onclick }, el('span', { class: 'cd-tool-icon' }), el('span', {}, label), badge);
  button.firstChild.innerHTML = icon;
  return button;
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'cd-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

export default {
  id: 'connect-dots',
  title: 'Соедини точки',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      timer: typeof savedSettings?.timer === 'boolean' ? savedSettings.timer : true,
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
    };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'cd-sub' }),
      score: el('b', {}),
      best: el('b', {}),
      svg: svgEl('svg', { class: 'cd-svg' }),
      hintBadge: el('span', { class: 'cd-badge' }),
      timerFill: el('div', { class: 'cd-timer-fill' }),
      timerLabel: el('span', { class: 'cd-timer-label' }),
      modal: el('div', { class: 'cd-modal', hidden: true }),
    };
    ui.board = el('div', { class: 'cd-board' }, ui.svg);
    ui.wrap = el('div', { class: 'cd-wrap' }, ui.board);
    ui.timer = el('div', { class: 'cd-timer' },
      el('span', { class: 'cd-timer-icon' }, '⏱'), el('div', { class: 'cd-timer-track' }, ui.timerFill), ui.timerLabel);
    ui.hintButton = toolButton(ICONS.hint, T.tools.hint, onHint, ui.hintBadge);
    ui.svg.addEventListener('pointerdown', onPointerDown);
    ui.svg.addEventListener('pointermove', onPointerMove);
    ui.svg.addEventListener('pointerup', onPointerUp);
    ui.svg.addEventListener('pointercancel', onPointerUp);

    root = el('div', { class: 'cd' },
      el('div', { class: 'cd-header' },
        el('div', {}, el('div', { class: 'cd-title' }, T.title), ui.sub),
        el('div', { class: 'cd-actions' },
          iconButton(ICONS.restart, T.newGame, askRestart),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'cd-info' }, el('span', {}, `${T.score}: `, ui.score), el('span', {}, `${T.best}: `, ui.best)),
      ui.wrap,
      ui.timer,
      el('div', { class: 'cd-tools' }, toolButton(ICONS.reset, T.tools.reset, onReset), ui.hintButton),
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'cd-fx');
    root.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    const tickId = setInterval(tick, 100);
    timers.add(tickId);

    startGame(isValidState(savedGame) ? savedGame : null);
  },

  getState() {
    if (!game || over || (game.round === 1 && game.paths.every((p) => p.length <= 1))) return null;
    save();
    return { round: game.round };
  },

  destroy() {
    stopClock();
    save();
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = fx = game = drawing = runningSince = null;
    busy = over = modalActive = false;
  },
};

