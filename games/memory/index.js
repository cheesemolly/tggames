// «Мемори»: карточки рубашкой вверх, открываешь по две (в «Тройках» — по три) и ищешь одинаковые.
// Два режима: уровни (бесконечные, поле растёт, появляются бонусные карточки и «Тройки») и «Своя игра»
// (размер, правило, картинки — на выбор). Давление — в настройках: спокойно / три ошибки / на время.
// Пять наборов картинок (sets.js), скины стола и рубашек, бонусы-помощники «Подглядеть» и «Магнит».
// Правила — logic.js, рисунки — art.js, звуки набора «Звуки» — sounds.js.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, pop, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import {
  SIZES, findSize, fits, newGame, newLevel, flip, closeOpen, canFlip, magnet, tick, starsFor, levelParams,
  isValidState, emptyStats, isValidStats, recordGame, WORDS_MAX_COLS,
} from './logic.js';
import { SETS, findSet, SOUNDS } from './sets.js';
import { monsterSvg, patternSvg, specialSvg, speakerSvg, SPECIAL_INFO, DEFS } from './art.js';
import { createSounds } from './sounds.js';

const SKINS = [
  { id: 'telegram', title: 'По умолчанию' },
  { id: 'classic', title: 'Казино' },
  { id: 'night', title: 'Ночь' },
  { id: 'wood', title: 'Дерево' },
  { id: 'candy', title: 'Конфета' },
  { id: 'neon', title: 'Неон' },
];
const PRESSURE_INFO = {
  calm: { title: 'Спокойно', text: 'Без времени и без поражений' },
  lives: { title: 'Жизни', text: 'Каждый промах — минус жизнь' },
  time: { title: 'На время', text: 'Успей, пока не кончилось время' },
};
const MISS_DELAY = 750;
const MATCH_DELAY = 330;
const GAP = 6;

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" `
  + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  free: svgIcon('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'),
  levels: svgIcon('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
  peek: svgIcon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  magnet: svgIcon('<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/><path d="M10 3v8a2 2 0 0 0 4 0V3"/>'),
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
};

let api = null;
let host = null;
let ui = null;
let toast = null;
let fx = null;
let audio = null;
let game = null;                 // текущая партия (уровня или «Своей игры»)
let mode = 'levels';
let level = 1;
let settings = { pressure: 'calm', set: 'mix', skin: 'telegram', preview: true };
let freeCfg = { size: '4x5', group: 2, set: 'monsters', specials: true };
let stats = emptyStats();
let boosters = { peek: 2, magnet: 2 };
let seenSpecials = [];
let busy = false;                // раздача, подглядывание, вихрь, конец партии
let started = false;             // время идёт с первого открытия
let modalActive = false;
let deal = 0;                    // номер раздачи: таймеры прошлой раздачи ничего не трогают
let cardEls = [];
let tickTimer = 0;
let lastTick = 0;
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

const storageKey = () => (mode === 'levels' ? 'level' : 'free');

function save() {
  if (!api || !game) return;
  api.storage.set(storageKey(), game);
  if (mode === 'levels') api.storage.set('progress', { level });
  api.progress(`Уровень ${level}`);
}

const saveSettings = () => api.storage.set('settings', settings);

// ---------- звук ----------

function ensureAudio() {
  if (audio) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return audio;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* не поддерживается */ }
  const ctx = new Ctx({ latencyHint: 'interactive' });
  audio = { ctx, sounds: createSounds(ctx) };
  return audio;
}

// ---------- карточки ----------

function frontMarkup(card, i) {
  const f = card.face;
  switch (f.type) {
    case 'monster': return monsterSvg(f);
    case 'pattern': return patternSvg(f, `${deal}-${i}`);
    case 'emoji': return `<span class="mm-emoji">${f.ch}</span>`;
    case 'word': return `<span class="mm-word" style="--len:${f.word.length}">${f.word}</span>`;
    case 'sound': return `<span class="mm-speaker">${speakerSvg()}</span>`;
    case 'special': return `<span class="mm-special">${specialSvg(f.kind)}</span>`;
    default: return '';
  }
}

function buildCard(card, i) {
  const node = el('button', { class: `mm-card ${card.kind !== 'normal' ? `mm-kind-${card.kind}` : ''}`.trim(), 'data-i': i, 'aria-label': 'Карточка' });
  const inner = el('span', { class: 'mm-inner' });
  const back = el('span', { class: 'mm-back' });
  const front = el('span', { class: `mm-front mm-front-${card.face.type}` });
  front.innerHTML = frontMarkup(card, i);
  inner.append(back, front);
  node.append(inner);
  if (card.gone) node.classList.add('gone');
  return node;
}

function renderBoard() {
  cardEls = game.cards.map(buildCard);
  ui.board.style.setProperty('--cols', game.cols);
  ui.board.style.setProperty('--rows', game.rows);
  ui.board.replaceChildren(...cardEls);
  for (const i of game.open) cardEls[i].classList.add('up');
  layout();
}

/** Размер карточки — чтобы поле целиком влезло в оставшееся место (карточка 4:5). */
function layout() {
  if (!ui || !game) return;
  const W = ui.boardWrap.clientWidth;
  const H = ui.boardWrap.clientHeight;
  const w = Math.max(24, Math.min((W - GAP * (game.cols - 1)) / game.cols, ((H - GAP * (game.rows - 1)) / game.rows) * 0.8, 120));
  ui.board.style.setProperty('--card', `${Math.floor(w)}px`);
}

const setUp = (i, up) => cardEls[i]?.classList.toggle('up', up);

// ---------- шапка и счётчики ----------

function renderHeader() {
  if (mode === 'levels') {
    const p = levelParams(level);
    ui.title.textContent = 'Мемори';
    ui.sub.textContent = `Уровень ${level}${p.group === 3 ? ' · Тройки' : ''}`;
  } else {
    ui.title.textContent = 'Своя игра';
    ui.sub.textContent = `${game.cols}×${game.rows}${game.group === 3 ? ' · Тройки' : ''}`;
  }
  ui.modeBtn.innerHTML = mode === 'levels' ? ICONS.free : ICONS.levels;
  ui.modeBtn.setAttribute('aria-label', mode === 'levels' ? 'Своя игра' : 'К уровням');
  ui.modeBtn.title = ui.modeBtn.getAttribute('aria-label');
  host.dataset.skin = settings.skin;
}

function renderHud() {
  const g = game;
  const items = [
    el('div', { class: 'mm-stat' }, el('span', { class: 'mm-stat-v' }, String(g.moves)), el('span', { class: 'mm-stat-k' }, 'Ходов')),
  ];
  if (g.lives != null) {
    items.push(el('div', { class: 'mm-stat mm-lives' },
      el('span', { class: 'mm-stat-v' }, el('span', { class: 'mm-heart on' }, '♥'), ` ${g.lives}`),
      el('span', { class: 'mm-stat-k' }, 'Жизни')));
  } else {
    items.push(el('div', { class: 'mm-stat mm-mistakes' }, el('span', { class: 'mm-stat-v' }, String(g.mistakes)), el('span', { class: 'mm-stat-k' }, 'Ошибок')));
  }
  items.push(el('div', { class: 'mm-stat mm-score' }, el('span', { class: 'mm-stat-v' }, String(g.score)), el('span', { class: 'mm-stat-k' }, 'Очки')));
  ui.hud.replaceChildren(...items);
  ui.timer.hidden = g.timeLeft == null;
  renderTimer();
  renderBoosters();
}

function renderTimer() {
  if (!game || game.timeLeft == null) return;
  const part = game.timeLeft / game.timeTotal;
  ui.timerFill.style.transform = `scaleX(${Math.min(1, part)})`;
  ui.timerText.textContent = `${Math.ceil(game.timeLeft / 1000)} с`;
  ui.timer.classList.toggle('low', game.timeLeft <= 10000);
}

function renderBoosters() {
  ui.peekCount.textContent = boosters.peek;
  ui.magnetCount.textContent = boosters.magnet;
  ui.peekBtn.disabled = boosters.peek <= 0;
  ui.magnetBtn.disabled = boosters.magnet <= 0;
}

function bump(selector, cls = '') {
  const node = ui.hud.querySelector(selector);
  if (!node) return;
  if (cls) node.classList.add(cls);
  pop(node, { from: 0.8 }).then(() => cls && node.classList.remove(cls));
}

// ---------- время ----------

function startTicker() {
  stopTicker();
  if (game?.timeLeft == null) return;
  lastTick = performance.now();
  tickTimer = setInterval(() => {
    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    if (!game || !started || busy || modalActive || document.hidden || game.done || game.failed) return;
    if (tick(game, dt)) {
      renderTimer();
      save();
      onFail('time');
      return;
    }
    renderTimer();
  }, 100);
}

function stopTicker() {
  clearInterval(tickTimer);
  tickTimer = 0;
}

// ---------- партия ----------

function startGame(fresh, { intro = true } = {}) {
  deal++;
  game = fresh;
  started = game.moves > 0 || game.open.length > 0;
  busy = false;
  save();
  renderHeader();
  renderBoard();
  renderHud();
  startTicker();
  if (!intro) return;
  dealIn();
  announceSpecials();
}

/** Раздача: карточки влетают волной из центра; затем (по настройке) все на миг открываются. */
function dealIn() {
  const myDeal = deal;
  busy = true;
  const n = cardEls.length;
  if (!reducedMotion()) {
    const cx = (game.cols - 1) / 2;
    const cy = (game.rows - 1) / 2;
    cardEls.forEach((node, i) => {
      const r = Math.floor(i / game.cols);
      const c = i % game.cols;
      const d = Math.hypot(r - cy, c - cx);
      animate(node, [
        { opacity: 0, transform: `translate(${(cx - c) * 40}%, ${(cy - r) * 40}%) scale(0.3) rotate(${(c - cx) * 8}deg)` },
        { opacity: 1, transform: 'none' },
      ], { duration: 380, delay: d * 55, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
    });
  }
  const dealt = reducedMotion() ? 0 : 420 + Math.hypot(game.cols, game.rows) * 30;
  const fresh = game.moves === 0 && game.open.length === 0 && game.cards.every((c) => !c.gone);
  if (!settings.preview || !fresh) {
    later(() => { if (deal === myDeal) busy = false; }, dealt);
    return;
  }
  const show = Math.min(2600, 900 + n * 45);
  later(() => {
    if (deal !== myDeal) return;
    cardEls.forEach((node) => node.classList.add('up'));
    later(() => {
      if (deal !== myDeal) return;
      cardEls.forEach((node, i) => { if (!game.open.includes(i)) node.classList.remove('up'); });
      later(() => { if (deal === myDeal) busy = false; }, 350);
    }, show);
  }, dealt);
  void n;
}

/** Бонусная карточка впервые — короткая подсказка, что она делает. */
function announceSpecials() {
  const fresh = game.specials.filter((k) => !seenSpecials.includes(k));
  if (!fresh.length) return;
  seenSpecials = [...seenSpecials, ...fresh];
  api.storage.set('seenSpecials', seenSpecials);
  const text = fresh.map((k) => `${SPECIAL_INFO[k].title}: ${SPECIAL_INFO[k].text.toLowerCase()}`).join(' · ');
  later(() => toast?.show(`Новое! ${text}`, 3600), 700);
}

function onCardTap(e) {
  const node = e.target.closest('.mm-card');
  if (!node || busy || modalActive || !game) return;
  const i = Number(node.dataset.i);
  if (!canFlip(game, i)) return;
  if (game.set === 'sounds') ensureAudio();
  const ev = flip(game, i);
  if (!ev) return;
  started = true;
  for (const k of ev.closed ?? []) setUp(k, false);
  setUp(i, true);
  api.platform.haptic.selection();
  const card = game.cards[i];
  if (card.face.type === 'sound') playSound(i);

  if (ev.type === 'match') onMatch(ev);
  else if (ev.type === 'miss') onMiss(ev);
  save();
}

function playSound(i) {
  const a = ensureAudio();
  const f = game.cards[i].face;
  if (a && f.type === 'sound') a.sounds.play(f.sound);
  const wave = cardEls[i]?.querySelector('.mm-speaker');
  if (wave) {
    wave.classList.remove('playing');
    void wave.offsetWidth;
    wave.classList.add('playing');
  }
}

function onMiss(ev) {
  const myDeal = deal;
  const cards = ev.cards.slice();
  renderHud();
  if (ev.mistake) {
    if (game.lives == null) bump('.mm-mistakes', 'bad');
    api.platform.haptic.notification('error');
  }
  if (game.lives != null) bump('.mm-lives', 'bad');
  later(() => {
    if (deal !== myDeal || !ui) return;
    cards.forEach((k) => cardEls[k] && shake(cardEls[k], { distance: 5, duration: 300 }));
  }, MATCH_DELAY);
  later(() => {
    if (deal !== myDeal || !ui) return;
    // игрок мог уже открыть следующую — тогда эти закрылись сами
    if (game.closePending && cards.every((k) => game.open.includes(k))) {
      closeOpen(game);
      cards.forEach((k) => setUp(k, false));
      save();
    }
    if (ev.fail) onFail('lives');
  }, MISS_DELAY);
  if (ev.fail) busy = true;
}

function onMatch(ev) {
  const myDeal = deal;
  busy = Boolean(ev.peek || ev.shuffle || ev.win || ev.extra.length);
  // карточки, снятые джокером, сначала переворачиваются
  ev.extra.forEach((k) => setUp(k, true));
  const all = [...ev.cards, ...ev.extra];
  const sound = all.map((k) => game.cards[k].face).find((f) => f.type === 'sound');
  if (sound && ev.booster) ensureAudio()?.sounds.play(sound.sound);
  api.platform.haptic.impact(ev.kinds.includes('gold') ? 'heavy' : 'light');

  later(() => {
    if (deal !== myDeal || !ui) return;
    flyAway(all, ev);
    renderHud();
    if (ev.combo >= 2 && !ev.booster) showCombo(ev.combo);
    if (ev.kinds.includes('clock')) {
      toast.show('+10 секунд', 1400);
      pop(ui.timer, { from: 0.9 });
    }
    if (ev.kinds.includes('heart')) bump('.mm-lives', 'good');
    if (ev.kinds.includes('gold')) toast.show(`Золото! +${ev.gained}`, 1400);
  }, ev.extra.length ? MATCH_DELAY + 250 : MATCH_DELAY);

  const after = MATCH_DELAY + 420 + (ev.extra.length ? 250 : 0);
  later(() => {
    if (deal !== myDeal || !ui) return;
    if (ev.win) {
      onWin();
      return;
    }
    if (ev.shuffle) {
      runVortex(ev.shuffle, () => {
        if (ev.peek) runPeek(() => { busy = false; });
        else busy = false;
      });
      return;
    }
    if (ev.peek) {
      runPeek(() => { busy = false; });
      return;
    }
    busy = false;
  }, after);
}

/** Пара улетает: вздувается, светится и тает; искры из центра. */
function flyAway(indices, ev) {
  const boardRect = ui.boardWrap.getBoundingClientRect();
  indices.forEach((k, n) => {
    const node = cardEls[k];
    if (!node) return;
    const r = node.getBoundingClientRect();
    const x = r.left + r.width / 2 - boardRect.left;
    const y = r.top + r.height / 2 - boardRect.top;
    const kind = game.cards[k].kind;
    const color = kind === 'gold' ? '#f5c542' : kind === 'joker' ? '#ec4899' : cssVar('--mm-accent');
    fx?.burst(x, y, color, 10 + Math.min(ev.combo, 5) * 2, { speed: 220, size: 6 });
    if (n === 0) floatText(x, y, `+${ev.gained}`);
    node.classList.add('matched');
    animate(node, [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.12)', opacity: 1, offset: 0.35 },
      { transform: 'scale(0.2) rotate(12deg)', opacity: 0 },
    ], { duration: 420, easing: 'ease-in', fill: 'forwards' }).then(() => {
      if (node.isConnected) node.classList.add('gone');
    });
  });
}

function floatText(x, y, text) {
  const node = el('span', { class: 'mm-float', style: `left:${x}px;top:${y}px` }, text);
  ui.boardWrap.append(node);
  animate(node, [
    { opacity: 0, transform: 'translate(-50%, -30%) scale(0.7)' },
    { opacity: 1, transform: 'translate(-50%, -90%) scale(1.1)', offset: 0.25 },
    { opacity: 0, transform: 'translate(-50%, -190%) scale(1)' },
  ], { duration: 900, easing: 'ease-out' }).then(() => node.remove());
}

function showCombo(n) {
  ui.combo.textContent = `Комбо ×${Math.min(n, 5)}`;
  ui.combo.dataset.level = String(Math.min(n, 5));
  ui.combo.hidden = false;
  animate(ui.combo, [
    { opacity: 0, transform: 'translate(-50%, 0) scale(0.6)' },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1.15)', offset: 0.3 },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.75 },
    { opacity: 0, transform: 'translate(-50%, -10px) scale(1)' },
  ], { duration: 1100, easing: 'ease-out' }).then(() => { if (ui) ui.combo.hidden = true; });
}

/** Все закрытые карточки на миг открываются («Глаз» и помощник «Подглядеть»). */
function runPeek(done, ms = 1300) {
  const myDeal = deal;
  const hidden = game.cards.map((c, i) => i).filter((i) => !game.cards[i].gone && !game.open.includes(i));
  hidden.forEach((i) => setUp(i, true));
  host.classList.add('mm-peeking');
  later(() => {
    if (deal !== myDeal || !ui) return;
    hidden.forEach((i) => { if (!game.open.includes(i)) setUp(i, false); });
    host.classList.remove('mm-peeking');
    later(() => { if (deal === myDeal) done(); }, 350);
  }, ms);
}

/** «Вихрь»: карточки разъезжаются по новым местам (FLIP: перерисовка + анимация от старых мест). */
function runVortex(moves, done) {
  const myDeal = deal;
  const before = new Map(moves.map(({ from }) => [from, cardEls[from].getBoundingClientRect()]));
  toast.show('Вихрь! Карточки перемешались', 1600);
  renderBoard();
  if (!reducedMotion()) {
    for (const { from, to } of moves) {
      const a = before.get(from);
      const b = cardEls[to].getBoundingClientRect();
      animate(cardEls[to], [
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) rotate(0deg)` },
        { transform: `translate(${(a.left - b.left) / 2}px, ${(a.top - b.top) / 2}px) rotate(180deg) scale(0.8)`, offset: 0.5 },
        { transform: 'none' },
      ], { duration: 650, easing: 'ease-in-out' });
    }
  }
  later(() => { if (deal === myDeal) done(); }, reducedMotion() ? 0 : 700);
}

function useBooster(kind) {
  if (busy || modalActive || !game || game.done || game.failed || boosters[kind] <= 0) return;
  if (kind === 'peek') {
    boosters = { ...boosters, peek: boosters.peek - 1 };
    api.storage.set('boosters', boosters);
    renderBoosters();
    busy = true;
    api.platform.haptic.impact('light');
    runPeek(() => { busy = false; }, 1500);
    return;
  }
  const ev = magnet(game);
  if (!ev) return;
  boosters = { ...boosters, magnet: boosters.magnet - 1 };
  api.storage.set('boosters', boosters);
  started = true;
  for (const k of ev.closed ?? []) setUp(k, false);
  ev.cards.forEach((k) => setUp(k, true));
  onMatch(ev);
  save();
}

// ---------- конец партии ----------

function onWin() {
  busy = true;
  stopTicker();
  const stars = starsFor(game);
  stats = recordGame(stats, game, stars);
  api.storage.set('stats', stats);
  api.platform.haptic.notification('success');
  const finished = game;
  let reward = null;
  if (mode === 'levels') {
    level++;
    if (stars === 3) {
      reward = Math.random() < 0.5 ? 'peek' : 'magnet';
      boosters = { ...boosters, [reward]: Math.min(9, boosters[reward] + 1) };
      api.storage.set('boosters', boosters);
    }
    // следующий уровень сохранён сразу: выход из окна победы не вернёт пройденный
    game = newLevel(level, settings);
    save();
  } else {
    api.storage.remove('free');
    game = null;
  }
  // волна по пустому полю и конфетти
  fx?.confetti(['#ff4d4d', '#ffd23f', '#3ddc84', '#2ec4f1', '#9b5de5', '#ff5fa2'], 120);
  later(() => ui && showWin(finished, stars, reward), reducedMotion() ? 0 : 450);
}

function showWin(g, stars, reward) {
  const isLevel = g.mode === 'levels';
  const starRow = el('div', { class: 'mm-stars' }, [1, 2, 3].map((k) => el('span', { class: `mm-star ${k <= stars ? 'on' : ''}` }, '★')));
  const rows = [
    ['Ходов', g.moves], ['Ошибок', g.mistakes], ['Очки', g.score], ['Лучшее комбо', `×${Math.min(g.bestCombo, 5)}`],
  ];
  const freeBest = !isLevel ? stats.free[`${g.cols}x${g.rows}:${g.group}`]?.bestMoves : null;
  openModal([
    el('h2', { class: 'mm-win-title' }, isLevel ? `Уровень ${g.level} пройден!` : 'Все пары найдены!'),
    starRow,
    el('div', { class: 'mm-result' }, rows.map(([k, v]) => el('div', { class: 'mm-res' }, el('span', { class: 'mm-res-v' }, String(v)), el('span', { class: 'mm-res-k' }, k)))),
    freeBest != null && el('p', { class: 'mm-muted' }, `Рекорд на этом поле: ${freeBest} ${movesWord(freeBest)}`),
    reward && el('p', { class: 'mm-reward' }, `Без ошибок — подарок: +1 ${reward === 'peek' ? '«Подглядеть»' : '«Магнит»'}`),
    isLevel
      ? el('button', { class: 'mm-btn', onclick: () => { closeModal(); startGame(game); } }, `Уровень ${level}`)
      : el('div', { class: 'mm-row' },
        el('button', { class: 'mm-btn', onclick: () => { closeModal(); startFree(); } }, 'Ещё раз'),
        el('button', { class: 'mm-btn mm-btn-2', onclick: () => openFree() }, 'Настроить')),
  ], { dismissible: false });
  if (!reducedMotion()) {
    [...starRow.children].forEach((s, k) => animate(s, [
      { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
      { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.65 },
      { transform: 'none', opacity: 1 },
    ], { duration: 420, delay: 250 + k * 220, easing: 'ease-out', fill: 'backwards' }));
  }
}

const movesWord = (n) => {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return 'ходов';
  if (a === 1) return 'ход';
  if (a >= 2 && a <= 4) return 'хода';
  return 'ходов';
};

function onFail(reason) {
  busy = true;
  stopTicker();
  stats = recordGame(stats, game, 0);
  api.storage.set('stats', stats);
  api.platform.haptic.notification('error');
  shake(ui.board, { distance: 8, duration: 420 });
  host.classList.add('mm-failed');
  const again = () => {
    closeModal();
    host.classList.remove('mm-failed');
    if (mode === 'levels') startGame(newLevel(level, settings));
    else startFree();
  };
  later(() => ui && openModal([
    el('h2', {}, reason === 'time' ? 'Время вышло' : 'Жизни кончились'),
    el('p', { class: 'mm-muted' }, reason === 'time'
      ? 'Не успел найти все пары. Попробуй ещё раз — карточки разложатся по-новому.'
      : 'Слишком много промахов. Попробуй ещё раз — карточки разложатся по-новому.'),
    el('p', { class: 'mm-muted mm-small' }, 'Совсем без давления — в настройках «Спокойно».'),
    el('button', { class: 'mm-btn', onclick: again }, 'Ещё раз'),
  ], { dismissible: false }), 500);
}

// ---------- режимы ----------

function startFree() {
  const size = findSize(freeCfg.size);
  const group = fits(size, freeCfg.group) ? freeCfg.group : 2;
  const specials = freeCfg.specials ? pickSpecials() : [];
  startGame(newGame({ cols: size.cols, rows: size.rows, group, set: freeCfg.set, specials, pressure: settings.pressure, mode: 'free' }));
}

function pickSpecials() {
  const pool = ['gold', 'eye', 'vortex', 'joker', 'bonus'];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 2);
}

async function switchMode(next) {
  if (next === mode) return;
  save();
  mode = next;
  api.storage.set('mode', mode);
  const saved = await api.storage.get(storageKey());
  if (!ui || mode !== next) return;
  if (mode === 'levels') startGame(isValidState(saved) && saved.mode === 'levels' && saved.level === level && !saved.done && !saved.failed ? saved : newLevel(level, settings));
  else if (isValidState(saved) && saved.mode === 'free' && !saved.done && !saved.failed) startGame(saved);
  else openFree();
}

function restart() {
  if (!game || modalActive) return;
  const fresh = () => (mode === 'levels' ? startGame(newLevel(level, settings)) : startFree());
  if (game.moves === 0) {
    fresh();
    return;
  }
  openModal([
    el('h2', {}, 'Начать заново?'),
    el('p', { class: 'mm-muted' }, 'Карточки разложатся по-новому, найденные пары пропадут.'),
    el('div', { class: 'mm-row' },
      el('button', { class: 'mm-btn', onclick: () => { closeModal(); fresh(); } }, 'Заново'),
      el('button', { class: 'mm-btn mm-btn-2', onclick: closeModal }, 'Отмена')),
  ]);
}

// ---------- окна ----------

let dismissible = true;

function openModal(content, { dismissible: canDismiss = true } = {}) {
  dismissible = canDismiss;
  ui.modal.replaceChildren(el('div', { class: 'mm-card-modal' }, content));
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  hideLayer(ui.modal, () => !modalActive);
}

function options(list, current, onPick, render = (o) => o.title) {
  return el('div', { class: 'mm-options' }, list.map((o) => el('button', {
    class: `mm-option ${o.id === current ? 'on' : ''}`.trim(),
    disabled: Boolean(o.disabled),
    onclick: () => onPick(o.id),
  }, render(o))));
}

function openSettings() {
  const redraw = () => openSettings();
  const setList = [{ id: 'mix', title: 'Случайно' }, ...SETS.filter((s) => !s.freeOnly)];
  openModal([
    el('h2', {}, 'Настройки'),
    el('div', { class: 'mm-section' }, 'Режим'),
    options(Object.entries(PRESSURE_INFO).map(([id, p]) => ({ id, ...p })), settings.pressure, (id) => {
      if (id === settings.pressure) return;
      settings = { ...settings, pressure: id };
      saveSettings();
      applyPressureChange();
      redraw();
    }, (o) => [el('b', {}, o.title), el('small', {}, o.text)]),
    el('div', { class: 'mm-section' }, 'Картинки на уровнях'),
    options(setList, settings.set, (id) => {
      settings = { ...settings, set: id };
      saveSettings();
      if (mode === 'levels' && game.moves === 0) startGame(newLevel(level, settings), { intro: false });
      redraw();
    }),
    el('div', { class: 'mm-section' }, 'Оформление'),
    el('div', { class: 'mm-skins' }, SKINS.map((s) => el('button', {
      class: `mm-skin ${s.id === settings.skin ? 'on' : ''}`.trim(),
      'data-skin': s.id,
      onclick: () => {
        settings = { ...settings, skin: s.id };
        saveSettings();
        host.dataset.skin = s.id;
        redraw();
      },
    }, el('span', { class: 'mm-skin-sample' }, el('span', { class: 'mm-skin-back' }), el('span', { class: 'mm-skin-face' })), el('span', {}, s.title)))),
    el('label', { class: 'mm-toggle' },
      el('input', { type: 'checkbox', checked: settings.preview, onchange: (e) => { settings = { ...settings, preview: e.target.checked }; saveSettings(); } }),
      el('span', {}, 'Показывать карточки в начале')),
    el('button', { class: 'mm-btn', onclick: closeModal }, 'Готово'),
  ]);
}

/** Режим давления поменяли посреди партии: если ходов не было — просто новая раздача, иначе — со следующей. */
function applyPressureChange() {
  if (!game) return;
  if (game.moves === 0) {
    if (mode === 'levels') startGame(newLevel(level, settings), { intro: false });
    else startFree();
  } else toast.show('Режим включится со следующей партии', 2000);
}

function openFree() {
  const size = findSize(freeCfg.size);
  const redraw = () => openFree();
  const tripleOk = fits(size, 3);
  if (!tripleOk && freeCfg.group === 3) freeCfg = { ...freeCfg, group: 2 };
  const keys = (size.cols * size.rows) / freeCfg.group;
  const setDisabled = (s) => (s.pairsOnly && (freeCfg.group === 3 || size.cols > WORDS_MAX_COLS)) || (s.id === 'sounds' && keys > SOUNDS.length);
  if (setDisabled(findSet(freeCfg.set))) freeCfg = { ...freeCfg, set: 'monsters' };
  const setCfg = (patch) => {
    freeCfg = { ...freeCfg, ...patch };
    api.storage.set('freeCfg', freeCfg);
    redraw();
  };
  openModal([
    el('h2', {}, 'Своя игра'),
    el('div', { class: 'mm-section' }, 'Поле'),
    options(SIZES.map((s) => ({ id: s.id, title: `${s.cols}×${s.rows}` })), freeCfg.size, (id) => setCfg({ size: id })),
    el('div', { class: 'mm-section' }, 'Искать'),
    options([{ id: 2, title: 'Пары' }, { id: 3, title: 'Тройки', disabled: !tripleOk }], freeCfg.group, (id) => setCfg({ group: id })),
    !tripleOk && el('p', { class: 'mm-muted mm-small' }, 'Тройки — на полях 3×4, 4×6, 5×6 и 6×6.'),
    el('div', { class: 'mm-section' }, 'Картинки'),
    options(SETS.map((s) => ({ ...s, disabled: setDisabled(s) })), freeCfg.set, (id) => setCfg({ set: id }),
      (o) => [el('b', {}, o.title), el('small', {}, o.hint)]),
    el('label', { class: 'mm-toggle' },
      el('input', { type: 'checkbox', checked: freeCfg.specials, onchange: (e) => setCfg({ specials: e.target.checked }) }),
      el('span', {}, 'Бонусные карточки (джокер, глаз, вихрь…)')),
    el('div', { class: 'mm-row' },
      el('button', { class: 'mm-btn', onclick: () => {
        closeModal();
        if (mode !== 'free') {
          save();
          mode = 'free';
          api.storage.set('mode', mode);
        }
        startFree();
      } }, 'Начать'),
      mode === 'levels' || (game && !game.done)
        ? el('button', { class: 'mm-btn mm-btn-2', onclick: closeModal }, 'Отмена')
        : el('button', { class: 'mm-btn mm-btn-2', onclick: () => { closeModal(); switchMode('levels'); } }, 'К уровням')),
  ], { dismissible: mode === 'levels' || Boolean(game && !game.done) });
}

function openStats() {
  const freeRows = Object.entries(stats.free).map(([id, v]) => {
    const [size, group] = id.split(':');
    return el('div', { class: 'mm-free-row' },
      el('span', {}, `${size.replace('x', '×')}${group === '3' ? ' тройки' : ''}`),
      el('span', {}, `игр ${v.played} · рекорд ${v.bestMoves} ${movesWord(v.bestMoves)}`));
  });
  const rows = [
    ['Уровень', level], ['Лучший уровень', stats.bestLevel], ['Пройдено', stats.levelsCleared], ['Звёзд', stats.stars],
    ['Без ошибок', stats.perfect], ['Лучшее комбо', `×${Math.min(stats.bestCombo, 5)}`],
  ];
  openModal([
    el('h2', {}, 'Статистика'),
    el('div', { class: 'mm-result' }, rows.map(([k, v]) => el('div', { class: 'mm-res' }, el('span', { class: 'mm-res-v' }, String(v)), el('span', { class: 'mm-res-k' }, k)))),
    freeRows.length > 0 && el('div', { class: 'mm-section' }, 'Своя игра'),
    freeRows.length > 0 && el('div', { class: 'mm-free' }, freeRows),
    el('button', { class: 'mm-btn', onclick: closeModal }, 'Закрыть'),
  ]);
}

function openHelp() {
  const specials = ['joker', 'gold', 'eye', 'vortex', 'clock', 'heart'];
  openModal([
    el('h2', {}, 'Как играть'),
    el('p', { class: 'mm-muted' }, 'Открывай по две карточки и ищи одинаковые. Не совпали — закроются, запоминай, где что лежит. '
      + 'В «Тройках» ищешь по три. В «Слове и картинке» пара — это картинка и её название.'),
    el('p', { class: 'mm-muted' }, 'Звёзды — за мало ошибок. Ошибка — когда открыл то, что уже видел, или не открыл пару, '
      + 'которую уже видел; промах вслепую ошибкой не считается.'),
    el('p', { class: 'mm-muted' }, 'В режиме «Жизни» любой промах — минус жизнь. Жизней тем больше, чем больше поле. '
      + 'В режиме «На время» надо успеть до конца отсчёта.'),
    el('div', { class: 'mm-section' }, 'Бонусные карточки'),
    el('div', { class: 'mm-legend' }, specials.map((k) => {
      const icon = el('span', { class: 'mm-legend-icon' });
      icon.innerHTML = specialSvg(k);
      return el('div', { class: 'mm-legend-row' }, icon, el('span', {}, el('b', {}, SPECIAL_INFO[k].title), ` — ${SPECIAL_INFO[k].text.toLowerCase()}`));
    })),
    el('div', { class: 'mm-section' }, 'Помощники'),
    el('p', { class: 'mm-muted' }, '«Подглядеть» — все карточки открываются на полторы секунды. «Магнит» — снимает одну пару '
      + '(если одна карточка уже открыта — её пару). Прошёл уровень без ошибок — получишь ещё.'),
    el('button', { class: 'mm-btn', onclick: closeModal }, 'Понятно'),
  ]);
}

const cssVar = (name) => (host ? getComputedStyle(host).getPropertyValue(name).trim() || '#888' : '#888');

// ---------- модуль ----------

export default {
  id: 'memory',
  title: 'Мемори',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    const keys = ['settings', 'freeCfg', 'stats', 'boosters', 'seenSpecials', 'progress', 'mode', 'level', 'free'];
    const loaded = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await api.storage.get(k)])));
    if (!api) return;
    settings = { ...settings, ...(loaded.settings ?? {}) };
    if (!['calm', 'lives', 'time'].includes(settings.pressure)) settings.pressure = 'calm';
    if (!SKINS.some((s) => s.id === settings.skin)) settings.skin = 'telegram';
    if (settings.set !== 'mix' && !findSet(settings.set)) settings.set = 'mix';
    freeCfg = { ...freeCfg, ...(loaded.freeCfg ?? {}) };
    if (!findSize(freeCfg.size)) freeCfg.size = '4x5';
    if (!findSet(freeCfg.set)) freeCfg.set = 'monsters';
    stats = isValidStats(loaded.stats) ? loaded.stats : emptyStats();
    if (loaded.boosters && Number.isInteger(loaded.boosters.peek) && Number.isInteger(loaded.boosters.magnet)) boosters = loaded.boosters;
    seenSpecials = Array.isArray(loaded.seenSpecials) ? loaded.seenSpecials : [];
    level = Number.isInteger(loaded.progress?.level) && loaded.progress.level >= 1 ? loaded.progress.level : 1;
    mode = loaded.mode === 'free' ? 'free' : 'levels';

    const iconBtn = (icon, label, onclick) => {
      const b = el('button', { class: 'mm-icon-btn', 'aria-label': label, title: label, onclick });
      b.innerHTML = icon;
      return b;
    };
    const booster = (icon, label, count, onclick) => {
      const b = el('button', { class: 'mm-booster', 'aria-label': label, onclick });
      b.innerHTML = icon;
      b.append(el('span', { class: 'mm-booster-name' }, label), count);
      return b;
    };

    ui = {
      title: el('div', { class: 'mm-title' }, 'Мемори'),
      sub: el('div', { class: 'mm-sub' }),
      modeBtn: iconBtn(ICONS.free, 'Своя игра', () => (mode === 'levels' ? openFree() : switchMode('levels'))),
      hud: el('div', { class: 'mm-hud' }),
      timer: el('div', { class: 'mm-timer', hidden: true }),
      timerFill: el('span', { class: 'mm-timer-fill' }),
      timerText: el('span', { class: 'mm-timer-text' }),
      boardWrap: el('div', { class: 'mm-board-wrap' }),
      board: el('div', { class: 'mm-board' }),
      combo: el('div', { class: 'mm-combo', hidden: true }),
      peekCount: el('span', { class: 'mm-booster-count' }),
      magnetCount: el('span', { class: 'mm-booster-count' }),
      modal: el('div', { class: 'mm-modal', hidden: true, onclick: (e) => { if (e.target === ui.modal && dismissible) closeModal(); } }),
    };
    ui.timer.append(ui.timerFill, ui.timerText);
    ui.peekBtn = booster(ICONS.peek, 'Подглядеть', ui.peekCount, () => useBooster('peek'));
    ui.magnetBtn = booster(ICONS.magnet, 'Магнит', ui.magnetCount, () => useBooster('magnet'));
    const defs = el('div', { class: 'mm-defs' });
    defs.innerHTML = DEFS;
    ui.boardWrap.append(ui.board, ui.combo, defs);

    container.replaceChildren(el('div', { class: 'mm' },
      el('header', { class: 'mm-header' },
        el('div', { class: 'mm-head-text' }, ui.title, ui.sub),
        el('div', { class: 'mm-actions' },
          ui.modeBtn,
          iconBtn(ICONS.stats, 'Статистика', openStats),
          iconBtn(ICONS.gear, 'Настройки', openSettings),
          iconBtn(ICONS.help, 'Как играть', openHelp),
        ),
      ),
      ui.hud,
      ui.timer,
      ui.boardWrap,
      el('div', { class: 'mm-bar' },
        ui.peekBtn,
        ui.magnetBtn,
        iconBtn(ICONS.restart, 'Заново', restart),
      ),
      ui.modal,
    ), toast.el);

    fx = createFx(ui.boardWrap, 'mm-fx');
    ui.boardWrap.append(fx.canvas);
    ui.board.addEventListener('click', onCardTap);
    ui.resize = new ResizeObserver(() => layout());
    ui.resize.observe(ui.boardWrap);
    host.dataset.skin = settings.skin;

    const saved = mode === 'levels' ? loaded.level : loaded.free;
    const resumable = isValidState(saved) && !saved.done && !saved.failed && saved.mode === mode
      && (mode !== 'levels' || saved.level === level);
    if (resumable) startGame(saved, { intro: true });
    else if (mode === 'levels') startGame(newLevel(level, settings));
    else startFree();
  },

  getState() {
    return null;                               // партия хранится в api.storage игры
  },

  destroy() {
    if (game && api) api.storage.set(storageKey(), game);
    stopTicker();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    ui?.resize?.disconnect();
    fx?.dispose?.();
    audio?.ctx.close().catch(() => {});
    toast?.el.remove();
    audio = null;
    fx = null;
    toast = null;
    ui = null;
    host = null;
    api = null;
    game = null;
    cardEls = [];
    busy = false;
    modalActive = false;
    started = false;
    mode = 'levels';
    level = 1;
    stats = emptyStats();
    boosters = { peek: 2, magnet: 2 };
    seenSpecials = [];
  },
};

