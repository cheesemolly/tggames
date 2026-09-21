// Маджонг-пасьянс: снимай пары одинаковых свободных плиток (сверху пусто, открыт левый или правый бок).
// Без времени. Подсказка, перемешать (разбираемо по построению), отмена — без ограничений.
// Раскладки — layouts.js, рисунки (5 стилей) — faces.js, правила — logic.js.
// Партия, статистика (по раскладкам) и настройки — в api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { LAYOUTS, LAYOUT_BY_ID, DEFAULT_LAYOUT } from './layouts.js';
import { STYLES, STYLE_NAMES, faceHTML } from './faces.js';
import {
  relations, isFree, freeTiles, availablePairs, removePair, undo, reshuffle, tilesLeft, isWon, isStuck,
  newGame, isValidState, emptyStats, recordGame, isValidStats,
} from './logic.js';

const SKINS = ['telegram', 'felt', 'wood', 'night', 'sakura', 'jade'];
const TILE_RATIO = 1.3;          // высота плитки к ширине
const DEPTH = 0.12;              // толщина плитки (сдвиг слоя) к ширине
const STREAK_MS = 3000;          // пары подряд быстрее этого — серия
const T = {
  title: 'Маджонг',
  left: 'Осталось',
  pairs: 'Пар доступно',
  tools: { undo: 'Отменить', hint: 'Подсказка', shuffle: 'Перемешать' },
  nothingToUndo: 'Нечего отменять',
  blocked: 'Плитка закрыта',
  streak: (n) => `Серия ×${n}`,
  stuck: { title: 'Ходов больше нет', text: 'Перемешаем оставшиеся плитки — расклад снова будет разбираемым.', shuffle: 'Перемешать', undo: 'Отменить ход' },
  resultTitle: 'Победа!',
  result: (layout, moves, hints, shuffles) => `«${layout}» · ходов: ${moves} · подсказок: ${hints} · перемешиваний: ${shuffles}`,
  newGame: 'Новая партия',
  pick: 'Выбери раскладку',
  tiles: (n) => `${n} плиток`,
  newGameWarning: 'Текущая партия будет потеряна.',
  stats: { open: 'Статистика', title: 'Статистика', played: 'Игр', wins: 'Побед', clean: 'Чисто', cleanHint: '«Чисто» — победы без подсказок и перемешиваний.', close: 'Закрыть' },
  settings: { open: 'Настройки', title: 'Настройки', style: 'Плитки', dim: 'Затемнять закрытые плитки', dimDesc: 'Сразу видно, какие плитки можно брать.', skin: 'Стол', close: 'Закрыть' },
  skins: { telegram: 'Как в Telegram', felt: 'Сукно', wood: 'Дерево', night: 'Ночь', sakura: 'Сакура', jade: 'Нефрит' },
};

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  stats: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  shuffle: svgIcon('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let stats = {};
let settings = { layout: DEFAULT_LAYOUT, style: 'chinese', dim: true, skin: 'telegram' };
let selected = -1;
let busy = false;
let finished = false;
let streak = 0;
let lastMatch = 0;
let geo = null;                  // размеры плиток для текущего экрана
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

function save() {
  if (game && !finished) api.storage.set('current', game);
}

// ---------- геометрия и отрисовка ----------

/** Размер плиток под свободное место: вся раскладка помещается целиком. */
function measure() {
  const layout = LAYOUT_BY_ID[game.layout].tiles;
  const spanX = Math.max(...layout.map((t) => t.x)) + 2;
  const spanY = Math.max(...layout.map((t) => t.y)) + 2;
  const maxZ = Math.max(...layout.map((t) => t.z));
  const box = ui.wrap.getBoundingClientRect();
  const w = Math.max(12, Math.min(
    box.width / (spanX / 2 + maxZ * DEPTH),
    box.height / ((spanY / 2) * TILE_RATIO + maxZ * DEPTH),
  ));
  const h = w * TILE_RATIO;
  const d = w * DEPTH;
  geo = { w, h, d, maxZ, width: (spanX / 2) * w + maxZ * d, height: (spanY / 2) * h + maxZ * d };
  ui.board.style.width = `${geo.width}px`;
  ui.board.style.height = `${geo.height}px`;
  ui.board.style.setProperty('--w', `${w}px`);
  ui.board.style.setProperty('--h', `${h}px`);
  ui.board.style.setProperty('--d', `${d}px`);
}

function tilePos(i) {
  const t = LAYOUT_BY_ID[game.layout].tiles[i];
  // верхние слои сдвинуты вверх-влево — объём
  return {
    left: (t.x / 2) * geo.w + (geo.maxZ - t.z) * geo.d,
    top: (t.y / 2) * geo.h + (geo.maxZ - t.z) * geo.d,
    z: t.z * 10000 + t.y * 100 + t.x,
  };
}

function buildBoard() {
  measure();
  ui.tiles = game.tiles.map((tile, i) => {
    const { left, top, z } = tilePos(i);
    const node = el('button', {
      class: 'mj-tile',
      style: `left: ${left}px; top: ${top}px; z-index: ${z};`,
      'data-i': i,
      onclick: () => onTile(i),
    }, el('span', { class: 'mj-face' }));
    node.hidden = !tile.alive;
    return node;
  });
  ui.board.replaceChildren(...ui.tiles);
  renderFaces();
  renderState();
}

/** Перестановка после изменения размера экрана (без пересоздания плиток). */
function relayout() {
  if (!game || !ui.tiles) return;
  measure();
  ui.tiles.forEach((node, i) => {
    const { left, top } = tilePos(i);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  });
}

function renderFaces() {
  ui.tiles.forEach((node, i) => {
    const { kind, face } = game.tiles[i];
    node.firstChild.innerHTML = faceHTML(settings.style, kind, face);
    node.dataset.style = settings.style;
  });
}

function renderState() {
  const rel = relations(game.layout);
  const alive = game.tiles.map((t) => t.alive);
  ui.tiles.forEach((node, i) => {
    node.hidden = !alive[i];
    node.classList.toggle('mj-blocked', alive[i] && !isFree(rel, i, alive));
    node.classList.toggle('mj-selected', i === selected);
  });
  ui.board.classList.toggle('mj-dim', settings.dim);
  ui.left.textContent = tilesLeft(game);
  ui.pairs.textContent = availablePairs(game).length;
  ui.sub.textContent = LAYOUT_BY_ID[game.layout].name;
}

// ---------- ходы ----------

function onTile(i) {
  if (busy || finished || modalActive || !game.tiles[i].alive) return;
  const free = new Set(freeTiles(game));
  if (!free.has(i)) {
    api.platform.haptic.notification('warning');
    shake(ui.tiles[i], { distance: 3, duration: 260 });
    return;
  }
  if (selected === i) {
    selected = -1;
    renderState();
    return;
  }
  if (selected >= 0 && game.tiles[selected].kind === game.tiles[i].kind) {
    matchPair(selected, i);
    return;
  }
  selected = i;
  api.platform.haptic.selection();
  renderState();
  pop(ui.tiles[i].firstChild, { from: 0.9, duration: 160 });
}

function matchPair(a, b) {
  if (!removePair(game, a, b)) return;
  selected = -1;
  busy = true;
  const now = performance.now();
  streak = now - lastMatch < STREAK_MS ? streak + 1 : 1;
  lastMatch = now;
  api.platform.haptic.impact(streak >= 3 ? 'heavy' : 'medium');

  // Пара слетается в середину между плитками и рассыпается искрами
  const ra = ui.tiles[a].getBoundingClientRect();
  const rb = ui.tiles[b].getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const mx = (ra.left + ra.width / 2 + rb.left + rb.width / 2) / 2;
  const my = (ra.top + ra.height / 2 + rb.top + rb.height / 2) / 2;
  const fly = (node, r, dir) => animate(node, [
    { transform: 'none', opacity: 1 },
    { transform: 'translateY(-6px) scale(1.1)', opacity: 1, offset: 0.25 },
    { transform: `translate(${mx - (r.left + r.width / 2)}px, ${my - (r.top + r.height / 2)}px) scale(0.5) rotate(${dir * 18}deg)`, opacity: 0 },
  ], { duration: 380, easing: 'ease-in', fill: 'forwards' });
  ui.tiles[a].classList.add('mj-flying');
  ui.tiles[b].classList.add('mj-flying');
  Promise.all([fly(ui.tiles[a], ra, -1), fly(ui.tiles[b], rb, 1)]).then(() => {
    if (!ui) return;
    for (const i of [a, b]) {
      ui.tiles[i].getAnimations().forEach((anim) => anim.cancel());
      ui.tiles[i].classList.remove('mj-flying');
    }
    busy = false;
    renderState();
    save();
    afterMove();
  });
  later(() => {
    if (!fx) return;
    const x = mx - rootRect.left;
    const y = my - rootRect.top;
    const colors = [cssVar('--mj-accent'), cssVar('--mj-spark'), '#ffffff'];
    colors.forEach((c) => fx.burst(x, y, c, 4 + Math.min(streak, 6) * 2, { speed: 220 + streak * 30, size: 6 }));
    if (streak >= 2) floatText(T.streak(streak), x, y, streak >= 5 ? 'mj-tier-3' : streak >= 3 ? 'mj-tier-2' : 'mj-tier-1');
  }, reducedMotion() ? 0 : 330);
}

function floatText(text, x, y, cls) {
  const node = el('div', { class: `mj-float ${cls}`, style: `left: ${x}px; top: ${y}px;` }, text);
  ui.floats.append(node);
  later(() => node.remove(), 1300);
}

function afterMove() {
  if (isWon(game)) {
    win();
    return;
  }
  if (isStuck(game)) later(showStuck, 250);
}

function onUndo() {
  if (busy || finished || modalActive) return;
  const pair = undo(game);
  if (!pair) {
    toast.show(T.nothingToUndo);
    return;
  }
  selected = -1;
  api.platform.haptic.selection();
  renderState();
  save();
  pair.forEach((i) => animate(ui.tiles[i], [{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 260, easing: EASE_OUT }));
}

function onHint() {
  if (busy || finished || modalActive) return;
  const pairs = availablePairs(game);
  if (!pairs.length) {
    showStuck();
    return;
  }
  const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
  game.hints += 1;
  save();
  api.platform.haptic.selection();
  for (const i of [a, b]) {
    ui.tiles[i].classList.remove('mj-hint');
    void ui.tiles[i].offsetWidth;
    ui.tiles[i].classList.add('mj-hint');
    later(() => ui?.tiles[i].classList.remove('mj-hint'), 1900);
  }
}

/** Перемешать: плитки слетаются к центру, меняются и разлетаются обратно. */
function onShuffle() {
  if (busy || finished || modalActive) return;
  busy = true;
  selected = -1;
  api.platform.haptic.impact('medium');
  const center = ui.board.getBoundingClientRect();
  const cx = center.left + center.width / 2;
  const cy = center.top + center.height / 2;
  const alive = ui.tiles.filter((_, i) => game.tiles[i].alive);
  const offsets = alive.map((node) => {
    const r = node.getBoundingClientRect();
    return [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2), (Math.random() - 0.5) * 60];
  });
  const gather = alive.map((node, k) => animate(node, [
    { transform: 'none' },
    { transform: `translate(${offsets[k][0] * 0.7}px, ${offsets[k][1] * 0.7}px) rotate(${offsets[k][2]}deg) scale(0.7)` },
  ], { duration: 260, easing: 'ease-in', fill: 'forwards' }));
  Promise.all(gather).then(() => {
    if (!ui) return;
    reshuffle(game);
    renderFaces();
    renderState();
    save();
    alive.forEach((node, k) => {
      node.getAnimations().forEach((anim) => anim.cancel());
      animate(node, [
        { transform: `translate(${offsets[k][0] * 0.7}px, ${offsets[k][1] * 0.7}px) rotate(${-offsets[k][2]}deg) scale(0.7)` },
        { transform: 'none' },
      ], { duration: 320, delay: Math.random() * 80, easing: EASE_OUT });
    });
    later(() => { busy = false; }, 420);
  });
}

function showStuck() {
  if (finished || isWon(game)) return;
  openModal(card(T.stuck.title,
    el('p', { class: 'mj-note' }, T.stuck.text),
    el('div', { class: 'mj-card-actions' },
      game.history.length ? el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); onUndo(); } }, T.stuck.undo) : null,
      el('button', { class: 'btn', onclick: () => { closeModal(); later(onShuffle, 180); } }, T.stuck.shuffle),
    ),
  ));
}

function win() {
  finished = true;
  api.storage.remove('current');
  stats[game.layout] = recordGame(stats[game.layout], game, true);
  api.storage.set('stats', stats);
  api.platform.haptic.notification('success');
  if (fx) {
    fx.confetti(['#ff4d4d', '#ffd23f', '#3ddc84', '#2ec4f1', '#9b5de5', '#ff5fa2', cssVar('--mj-accent')], 140);
    const r = ui.board.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    for (let k = 0; k < 5; k++) {
      later(() => fx?.burst(r.left - rootRect.left + Math.random() * r.width, r.top - rootRect.top + Math.random() * r.height,
        ['#ffd23f', '#ff5fa2', '#2ec4f1'][k % 3], 18, { speed: 320, size: 7 }), k * 180);
    }
  }
  const { layout, moves, hints, shuffles } = game;
  later(() => api.finish({
    outcome: 'win',
    title: T.resultTitle,
    variant: layout,
    locale: 'ru',
    message: T.result(LAYOUT_BY_ID[layout].name, moves, hints, shuffles),
  }), reducedMotion() ? 0 : 1800);
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
  return el('div', { class: 'mj-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'mj-card-head' },
      el('h2', {}, title),
      el('button', { class: 'mj-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Мини-схема раскладки: прямоугольники плиток со сдвигом слоёв. */
function preview(layoutId) {
  const tiles = LAYOUT_BY_ID[layoutId].tiles;
  const spanX = Math.max(...tiles.map((t) => t.x)) + 2;
  const spanY = Math.max(...tiles.map((t) => t.y)) + 2;
  const rects = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x).map((t) =>
    `<rect x="${t.x * 5 - t.z * 1.5 + 4}" y="${t.y * 6.5 - t.z * 1.5 + 4}" width="9" height="12" rx="1.5" class="mj-pv-z${Math.min(t.z, 4)}"/>`);
  const node = el('span', { class: 'mj-preview' });
  node.innerHTML = `<svg viewBox="0 0 ${spanX * 5 + 8} ${spanY * 6.5 + 8}" aria-hidden="true">${rects.join('')}</svg>`;
  return node;
}

function showPicker(cancellable) {
  openModal(card(T.pick,
    cancellable && game && !finished && game.moves ? el('p', { class: 'mj-note' }, T.newGameWarning) : null,
    el('div', { class: 'mj-layouts' }, LAYOUTS.map((l) => el('button', {
      class: l.id === settings.layout ? 'mj-layout mj-layout-on' : 'mj-layout',
      onclick: () => { closeModal(); startGame(l.id); },
    }, preview(l.id), el('b', {}, l.name), el('span', {}, T.tiles(l.tiles.length))))),
  ));
}

function showStats() {
  openModal(card(T.stats.title,
    el('table', { class: 'mj-stats' },
      el('tr', {}, el('th', {}, ''), el('th', {}, T.stats.played), el('th', {}, T.stats.wins), el('th', {}, T.stats.clean)),
      LAYOUTS.map((l) => el('tr', {}, el('td', {}, l.name), el('td', {}, stats[l.id].played), el('td', {}, stats[l.id].wins), el('td', {}, stats[l.id].clean))),
    ),
    el('p', { class: 'mj-note' }, T.stats.cleanHint),
  ));
}

function showSettings() {
  const styleButtons = STYLES.map((s) => {
    const sample = el('span', { class: 'mj-sample' });
    sample.innerHTML = faceHTML(s, s === 'chinese' ? 31 : 0, 0);
    return el('button', {
      class: 'mj-style', role: 'radio', 'aria-checked': String(s === settings.style),
      onclick: () => {
        settings.style = s;
        saveSettings();
        styleButtons.forEach((b, k) => b.setAttribute('aria-checked', String(STYLES[k] === s)));
        renderFaces();
        ui.tiles.forEach((node, k) => {
          if (game.tiles[k].alive) animate(node.firstChild, [{ transform: 'rotateY(90deg)' }, { transform: 'none' }], { duration: 260, delay: (k % 12) * 12, easing: EASE_OUT });
        });
      },
    }, sample, STYLE_NAMES[s]);
  });
  const dim = el('input', {
    type: 'checkbox', class: 'mj-switch', role: 'switch', checked: settings.dim,
    onchange: (e) => { settings.dim = e.target.checked; saveSettings(); renderState(); },
  });
  const skinButtons = SKINS.map((id) => el('button', {
    class: 'mj-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      saveSettings();
      skinButtons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'mj-swatch', 'data-skin': id }), T.skins[id]));

  openModal(card(T.settings.title,
    el('h3', { class: 'mj-section' }, T.settings.style),
    el('div', { class: 'mj-styles', role: 'radiogroup' }, styleButtons),
    el('label', { class: 'mj-setting' },
      el('div', {}, el('div', { class: 'mj-setting-title' }, T.settings.dim), el('div', { class: 'mj-note' }, T.settings.dimDesc)),
      dim),
    el('h3', { class: 'mj-section' }, T.settings.skin),
    el('div', { class: 'mj-skins', role: 'radiogroup' }, skinButtons),
  ));
}

function saveSettings() {
  api.storage.set('settings', settings);
}

function startGame(layoutId = settings.layout, saved = null) {
  settings.layout = layoutId;
  saveSettings();
  game = saved ?? newGame(layoutId);
  finished = false;
  busy = false;
  selected = -1;
  streak = 0;
  buildBoard();
  save();
  if (!saved && !reducedMotion()) {
    // раздача: плитки падают сверху слой за слоем
    ui.tiles.forEach((node, i) => {
      const t = LAYOUT_BY_ID[game.layout].tiles[i];
      animate(node, [{ transform: 'translateY(-40px) scale(0.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 300, delay: t.z * 180 + (t.y + t.x) * 6, easing: EASE_OUT, fill: 'backwards' });
    });
  }
}

function onKeydown(e) {
  if (modalActive) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    onUndo();
  } else if (['h', 'р'].includes(e.key.toLowerCase())) onHint();
  else if (e.key === 'Escape' && selected >= 0) {
    selected = -1;
    renderState();
  }
}

function toolButton(icon, label, onclick) {
  const button = el('button', { class: 'mj-tool', onclick }, el('span', { class: 'mj-tool-icon' }), el('span', {}, label));
  button.firstChild.innerHTML = icon;
  return button;
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'mj-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

export default {
  id: 'mahjong',
  title: 'Маджонг',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedGame, savedStats, savedSettings] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
    ]);
    if (!api) return;
    stats = {};
    for (const l of LAYOUTS) stats[l.id] = isValidStats(savedStats?.[l.id]) ? savedStats[l.id] : emptyStats();
    settings = {
      layout: LAYOUT_BY_ID[savedSettings?.layout] ? savedSettings.layout : DEFAULT_LAYOUT,
      style: STYLES.includes(savedSettings?.style) ? savedSettings.style : 'chinese',
      dim: typeof savedSettings?.dim === 'boolean' ? savedSettings.dim : true,
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
    };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'mj-sub' }),
      left: el('b', {}),
      pairs: el('b', {}),
      board: el('div', { class: 'mj-board' }),
      floats: el('div', { class: 'mj-floats' }),
      modal: el('div', { class: 'mj-modal', hidden: true }),
      tiles: null,
    };
    ui.wrap = el('div', { class: 'mj-wrap' }, ui.board);

    root = el('div', { class: 'mj' },
      el('div', { class: 'mj-header' },
        el('div', {}, el('div', { class: 'mj-title' }, T.title), ui.sub),
        el('div', { class: 'mj-actions' },
          iconButton(ICONS.plus, T.newGame, () => showPicker(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'mj-info' },
        el('span', {}, `${T.left}: `, ui.left),
        el('span', {}, `${T.pairs}: `, ui.pairs),
      ),
      ui.wrap,
      el('div', { class: 'mj-tools' },
        toolButton(ICONS.undo, T.tools.undo, onUndo),
        toolButton(ICONS.hint, T.tools.hint, onHint),
        toolButton(ICONS.shuffle, T.tools.shuffle, onShuffle),
      ),
      ui.floats,
      ui.modal,
      toast.el,
    );
    container.append(root);
    fx = createFx(root, 'mj-fx');
    root.append(fx.canvas);
    ui.resize = new ResizeObserver(() => relayout());
    ui.resize.observe(ui.wrap);
    document.addEventListener('keydown', onKeydown);

    const saved = isValidState(savedGame) && !isWon(savedGame) ? savedGame : null;
    if (saved) startGame(saved.layout, saved);
    else {
      startGame(settings.layout);
      if (!savedGame) later(() => showPicker(false), 50);
    }
  },

  getState() {
    if (!game || finished || !game.moves) return null;
    save();
    return { layout: game.layout };
  },

  destroy() {
    save();
    timers.forEach(clearTimeout);
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    ui?.resize?.disconnect();
    fx?.dispose();
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = fx = game = geo = null;
    selected = -1;
    busy = finished = modalActive = false;
  },
};
