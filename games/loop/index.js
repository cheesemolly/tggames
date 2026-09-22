// «Петля» по видео владельца (∞ Loop): нажатие поворачивает плитку на 90°, уровень решён, когда все линии
// замкнуты. Без времени, уровни бесконечные. Плитки — круглые (дуги) и квадратные (прямые углы), форма иногда
// меняется от уровня к уровню (или фиксирована в настройках). Палитра — случайная на каждом уровне или
// фиксированная (скин). Победа: цвета инвертируются, линии становятся двойным контуром, затем «#N» и новый уровень.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import {
  newLevel, rotateTile, tileKind, isValidState, emptyStats, recordSolved, isValidStats, SHAPES,
} from './logic.js';

const PALETTES = ['telegram', 'mint', 'sky', 'sand', 'lilac', 'rose', 'lemon', 'coral', 'graphite', 'night'];
const RANDOM_POOL = PALETTES.filter((p) => p !== 'telegram');
const SVG_NS = 'http://www.w3.org/2000/svg';
const T = {
  title: 'Петля',
  level: (n) => `Уровень ${n}`,
  rules: 'Поворачивай плитки, чтобы замкнуть все линии',
  newField: 'Другое поле',
  stats: { open: 'Статистика', title: 'Статистика', level: 'Уровень', solved: 'Решено', bestLevel: 'Лучший уровень', taps: 'Поворотов', close: 'Закрыть' },
  settings: { open: 'Настройки', title: 'Настройки', shape: 'Форма плиток', palette: 'Палитра', close: 'Закрыть' },
  shapes: { mix: 'Чередовать', round: 'Круглые', square: 'Квадратные' },
  palettes: {
    random: 'Случайная', telegram: 'Как в Telegram', mint: 'Мята', sky: 'Небо', sand: 'Песок', lilac: 'Сирень',
    rose: 'Роза', lemon: 'Лимон', coral: 'Коралл', graphite: 'Графит', night: 'Ночь',
  },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let game = null;
let stats = emptyStats();
let settings = { shape: 'mix', palette: 'random' };
let spins = [];                 // повороты плиток для анимации (не по модулю 4 — крутится всегда по часовой)
let busy = false;               // анимация победы / смены уровня
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

let pending = null;             // следующий уровень, пока идёт анимация победы

// во время анимации победы сохраняется уже следующий уровень — решённый не вернётся
const save = () => (pending ?? game) && api?.storage.set('current', pending ?? game);

// ---------- рисунок плитки ----------

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Фигуры в координатах плитки с центром (0, 0), края — ±0.5. Каноническое положение (как в tileKind):
// end — вверх, straight — вверх-вниз, corner — вверх-вправо, tee — вверх-вправо-вниз.
const ARC_NE = 'M0,-0.5 A0.5,0.5 0 0 0 0.5,0';
const ARC_ES = 'M0.5,0 A0.5,0.5 0 0 0 0,0.5';
const ARC_SW = 'M0,0.5 A0.5,0.5 0 0 0 -0.5,0';
const ARC_WN = 'M-0.5,0 A0.5,0.5 0 0 0 0,-0.5';
const KNOB = 0.16;
const SHAPE_PARTS = {
  round: {
    end: [['path', { d: `M0,-0.5 V${-KNOB}` }], ['circle', { r: KNOB, class: 'lp-knob' }]],
    straight: [['path', { d: 'M0,-0.5 V0.5' }]],
    corner: [['path', { d: ARC_NE }]],
    tee: [['path', { d: ARC_NE }], ['path', { d: ARC_ES }]],
    cross: [['path', { d: ARC_NE }], ['path', { d: ARC_ES }], ['path', { d: ARC_SW }], ['path', { d: ARC_WN }]],
  },
  square: {
    end: [['path', { d: `M0,-0.5 V${-KNOB}` }], ['rect', { x: -KNOB, y: -KNOB, width: KNOB * 2, height: KNOB * 2, class: 'lp-knob' }]],
    straight: [['path', { d: 'M0,-0.5 V0.5' }]],
    corner: [['path', { d: 'M0,-0.5 V0 H0.5' }]],
    tee: [['path', { d: 'M0,-0.5 V0.5 M0,0 H0.5' }]],
    cross: [['path', { d: 'M0,-0.5 V0.5 M-0.5,0 H0.5' }]],
  },
};

/** Фигура плитки в одном слое: 'lp-line' — линия, 'lp-core' — «сердцевина» (после победы — двойной контур). */
function tileShape(mask, shape, layer = 'lp-line') {
  const info = tileKind(mask);
  const g = svgEl('g', { transform: `rotate(${info.turns * 90})` });
  for (const [tag, attrs] of SHAPE_PARTS[shape][info.kind]) {
    g.append(svgEl(tag, { ...attrs, class: `${layer} ${attrs.class ?? ''}`.trim() }));
  }
  return g;
}

// ---------- поле ----------

function renderBoard() {
  const { rows, cols, base, shape } = game;
  // viewBox от (0, 0): CSS-поворот плитки идёт вокруг начала её координат — центра плитки
  ui.svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
  ui.board.style.setProperty('--cols', cols);
  ui.board.style.setProperty('--rows', rows);
  ui.board.dataset.shape = shape;
  spins = game.rot.slice();
  // два слоя: сначала линии всех плиток, поверх — сердцевины всех плиток. После победы концы линий заходят
  // на соседнюю клетку (без щелей на стыках), и край соседа не перечёркивает сердцевину
  const layers = ['lp-line', 'lp-core'].map((layer) => {
    const group = svgEl('g');
    base.forEach((mask, i) => {
      if (!mask) return;
      const cell = svgEl('g', { transform: `translate(${(i % cols) + 0.5} ${Math.floor(i / cols) + 0.5})` });
      const popper = svgEl('g', { class: 'lp-pop', 'data-i': i });
      const spin = svgEl('g', { class: 'lp-spin', 'data-i': i });
      spin.style.transform = `rotate(${spins[i] * 90}deg)`;
      spin.append(tileShape(mask, shape, layer));
      popper.append(spin);
      cell.append(popper);
      group.append(cell);
    });
    return group;
  });
  ui.svg.replaceChildren(...layers);
  host.dataset.skin = game.palette;
  ui.sub.textContent = T.level(game.level);
}

/** Плитки появляются волной от центра с небольшим доворотом. */
function introTiles() {
  const { rows, cols } = game;
  [...ui.svg.querySelectorAll('.lp-pop')].forEach((node) => {
    const i = Number(node.dataset.i);
    const d = Math.hypot(Math.floor(i / cols) - (rows - 1) / 2, (i % cols) - (cols - 1) / 2);
    animate(node, [
      { transform: 'scale(0) rotate(-90deg)', opacity: 0 },
      { transform: 'scale(1.1) rotate(8deg)', opacity: 1, offset: 0.7 },
      { transform: 'none', opacity: 1 },
    ], { duration: 380, delay: d * 45, easing: 'ease-out', fill: 'backwards' });
  });
}

function cellAt(e) {
  const pt = ui.svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(ui.svg.getScreenCTM().inverse());
  const c = Math.floor(p.x);
  const r = Math.floor(p.y);
  if (r < 0 || r >= game.rows || c < 0 || c >= game.cols) return -1;
  return r * game.cols + c;
}

function onPointerDown(e) {
  if (!game || busy || modalActive || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = cellAt(e);
  if (i < 0 || !game.base[i]) return;
  e.preventDefault();
  const solved = rotateTile(game, i);
  spins[i] += 1;
  for (const spin of ui.svg.querySelectorAll(`.lp-spin[data-i="${i}"]`)) spin.style.transform = `rotate(${spins[i] * 90}deg)`;
  api.platform.haptic.selection();
  if (solved) win();
  else save();
}

// ---------- победа и следующий уровень ----------

function nextLevelState() {
  return newLevel(game.level + 1, game, settings, RANDOM_POOL);
}

function win() {
  busy = true;
  stats = recordSolved(stats, game);
  api.storage.set('stats', stats);
  const next = nextLevelState();
  pending = next;
  save();                                   // прогресс сохранён сразу — выход посреди анимации его не теряет
  api.platform.haptic.notification('success');
  later(() => {
    if (!ui) return;
    host.classList.add('lp-won');
    animate(ui.svg, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-in-out' });
  }, reducedMotion() ? 0 : 220);
  later(() => {
    if (!ui) return;
    animate(ui.svg, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' }).then(() => {
      if (!ui) return;
      host.classList.remove('lp-won');
      game = next;
      pending = null;
      ui.svg.getAnimations().forEach((a) => a.cancel());
      ui.svg.replaceChildren();
      showLevelLabel(() => {
        if (!ui) return;
        renderBoard();
        introTiles();
        busy = false;
      });
    });
  }, reducedMotion() ? 0 : 1700);
}

/** «#N» посреди экрана перед уровнем (как в видео). */
function showLevelLabel(then) {
  host.dataset.skin = game.palette;
  ui.sub.textContent = T.level(game.level);
  ui.label.textContent = `#${game.level}`;
  ui.label.hidden = false;
  animate(ui.label, [
    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.25 },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.75 },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.05)' },
  ], { duration: 1100, easing: 'ease-in-out' }).then(() => {
    if (!ui) return;
    ui.label.hidden = true;
    then();
  });
}

function newField() {
  if (busy) return;
  const fresh = newLevel(game.level, game, settings, RANDOM_POOL);
  game = { ...fresh, shape: game.shape, palette: game.palette };      // то же оформление, другое поле
  save();
  api.platform.haptic.impact('light');
  animate(ui.svg, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => {
    if (!ui) return;
    renderBoard();
    introTiles();
  });
}

// ---------- окна ----------

function openModal(content) {
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

function card(title, ...children) {
  return el('div', { class: 'lp-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'lp-card-head' },
      el('h2', {}, title),
      el('button', { class: 'lp-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showStats() {
  const item = (value, label) => el('div', { class: 'lp-stat' }, el('div', { class: 'lp-stat-value' }, value), el('div', { class: 'lp-stat-label' }, label));
  openModal(card(T.stats.title, el('div', { class: 'lp-stats-grid' },
    item(game.level, T.stats.level), item(stats.solved, T.stats.solved),
    item(stats.bestLevel, T.stats.bestLevel), item(stats.taps, T.stats.taps),
  )));
}

/** Образец формы: замкнутое кольцо 2×2 (у «Чередовать» — верх круглый, низ квадратный). */
function shapeSample(shape) {
  const svg = svgEl('svg', { viewBox: '0 0 2 2', class: 'lp-sample' });
  const ring = [[2 | 4, 0, 0], [4 | 8, 1, 0], [1 | 2, 0, 1], [1 | 8, 1, 1]];
  for (const [mask, c, r] of ring) {
    const s = shape === 'mix' ? (r === 0 ? 'round' : 'square') : shape;
    const g = svgEl('g', { transform: `translate(${c + 0.5} ${r + 0.5})`, 'data-shape': s });
    g.append(tileShape(mask, s));
    svg.append(g);
  }
  return svg;
}

function showSettings() {
  const shapeButtons = ['mix', ...SHAPES].map((id) => el('button', {
    class: 'lp-option', role: 'radio', 'aria-checked': String(settings.shape === id),
    onclick: () => {
      settings.shape = id;
      api.storage.set('settings', settings);
      shapeButtons.forEach((b, k) => b.setAttribute('aria-checked', String(['mix', ...SHAPES][k] === id)));
      if (id !== 'mix' && game.shape !== id && !busy) {
        game.shape = id;
        save();
        renderBoard();
      }
    },
  }, shapeSample(id), T.shapes[id]));

  const paletteButtons = ['random', ...PALETTES].map((id) => el('button', {
    class: 'lp-skin', role: 'radio', 'aria-checked': String(settings.palette === id),
    onclick: () => {
      settings.palette = id;
      api.storage.set('settings', settings);
      paletteButtons.forEach((b, k) => b.setAttribute('aria-checked', String(['random', ...PALETTES][k] === id)));
      if (id !== 'random' && !busy) {
        game.palette = id;
        host.dataset.skin = id;
        save();
      }
    },
  }, id === 'random' ? el('span', { class: 'lp-swatch lp-swatch-random' }) : el('span', { class: 'lp-swatch', 'data-skin': id }), T.palettes[id]));

  openModal(card(T.settings.title,
    el('h3', { class: 'lp-section' }, T.settings.shape),
    el('div', { class: 'lp-options', role: 'radiogroup' }, shapeButtons),
    el('h3', { class: 'lp-section' }, T.settings.palette),
    el('div', { class: 'lp-skins', role: 'radiogroup' }, paletteButtons),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'lp-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

export default {
  id: 'loop',
  title: 'Петля',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      shape: ['mix', ...SHAPES].includes(savedSettings?.shape) ? savedSettings.shape : 'mix',
      palette: ['random', ...PALETTES].includes(savedSettings?.palette) ? savedSettings.palette : 'random',
    };

    ui = {
      sub: el('div', { class: 'lp-sub' }),
      svg: svgEl('svg', { class: 'lp-svg' }),
      label: el('div', { class: 'lp-label', hidden: true }),
      modal: el('div', { class: 'lp-modal', hidden: true }),
    };
    ui.board = el('div', { class: 'lp-board' }, ui.svg);
    ui.svg.addEventListener('pointerdown', onPointerDown);

    root = el('div', { class: 'lp' },
      el('div', { class: 'lp-header' },
        el('div', {}, el('div', { class: 'lp-title' }, T.title), ui.sub),
        el('div', { class: 'lp-actions' },
          iconButton(ICONS.restart, T.newField, newField),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'lp-wrap' }, ui.board, ui.label),
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);

    const fresh = !isValidState(saved);
    game = fresh ? newLevel(1, null, settings, RANDOM_POOL) : saved;
    if (fresh) save();
    busy = true;
    showLevelLabel(() => {
      if (!ui) return;
      renderBoard();
      introTiles();
      busy = false;
      if (game.level === 1 && stats.solved === 0) toast.show(T.rules, 2800);
    });
  },

  getState() {
    if (!game) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    save();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (host) {
      host.classList.remove('lp-won');
      delete host.dataset.skin;
    }
    api = host = root = ui = toast = game = pending = null;
    spins = [];
    busy = modalActive = false;
  },
};

