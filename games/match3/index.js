// «Три в ряд»: карта из 100 уровней (каждый 10-й — босс) и сам уровень. Правила — logic.js, уровни — levels.js,
// рисование и анимация — render.js, карта — map.js, звуки — sounds.js.
//
// Экран уровня: сверху ходы и цели; поле; снизу бонусы (молоток — клетка,
// ракета — ряд, перемешать; ход они не тратят). Управление: провести пальцем с фишки на соседнюю или нажать
// две соседние по очереди; нажатие на спецфишку запускает её (ход тратится). Долго думаешь — подсветится ход.
// Прогресс ('progress'): пройденные уровни и запас бонусов; начатый уровень ('run') сохраняется после
// каждого хода. В меню — «Уровень N». Звёзд нет (владелец, 2026-09-27: цели выполняются раньше, чем копятся очки).
// Финал короткий: часть оставшихся ходов разом — в ракеты; нажатие по полю его ускоряет.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion, pop, shake } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  newGame, playMove, tapMove, useBooster, finale, swapValid, adjacent, isSpecial, goalLeft,
  isValidState, botMove, findMoves,
} from './logic.js';
import { levelSpec, LEVEL_COUNT, CHAPTERS, TIPS } from './levels.js';
import { createRenderer, makeIcon } from './render.js';
import { createMap } from './map.js';

const T = {
  title: 'Три в ряд',
  level: (n) => `Уровень ${n}`,
  moves: 'Ходы',
  play: 'Играть',
  next: 'Дальше',
  retry: 'Ещё раз',
  toMap: 'На карту',
  goals: 'Цели',
  boss: 'Босс',
  won: 'Уровень пройден!',
  bossWon: 'Босс побеждён!',
  lostMoves: 'Ходы кончились',
  lostTimer: 'Бомба взорвалась!',
  almost: 'Осталось совсем чуть-чуть:',
  plus5: (n) => `+5 ходов (${n})`,
  reward: 'Награда',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  back: 'К карте',
  close: 'Закрыть',
  allDone: 'Все 100 уровней пройдены! Можно переигрывать на три звезды.',
};

const BOOSTERS = [
  { id: 'hammer', title: 'Молоток', hint: 'Нажми на клетку — молоток её разобьёт' },
  { id: 'row', title: 'Ракета', hint: 'Нажми на клетку — ракета снесёт весь ряд' },
  { id: 'shuffle', title: 'Перемешать', hint: '' },
];
const START_BOOSTERS = { hammer: 3, row: 2, shuffle: 2, moves: 1 };

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  back: svgIcon('<path d="m15 18-6-6 6-6"/>'),
  hammer: svgIcon('<path d="m14 12-8.5 8.5a2.1 2.1 0 0 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6-4 4Z"/><path d="m17.5 4.5 2 2"/>'),
  row: svgIcon('<path d="M3 12h15"/><path d="m14 7 5 5-5 5"/><path d="M3 9v6"/>'),
  shuffle: svgIcon('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>'),
};

let api = null;
let root = null;
let ui = null;
let toast = null;
let progress = null;           // { v: 2, done: [100 × 0/1], boosters }
let game = null;               // состояние уровня (logic.js)
let spec = null;
let renderer = null;
let map = null;
let busy = false;
let selected = -1;
let armed = null;
let drag = null;
let hintTimer = 0;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let usedExtra = false;         // «+5 ходов» — один раз за попытку
let finaleRunning = false;     // идёт финал — нажатие по полю его ускоряет
let screen = 'map';
const timers = new Set();
const audio = createAudio(createSounds);
const rng = Math.random;

function sfx(name, opts) {
  if (!soundOn) return;
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

// ---------- прогресс ----------

function emptyProgress() {
  return { v: 2, done: Array(LEVEL_COUNT).fill(0), boosters: { ...START_BOOSTERS } };
}

/** Прогресс из хранилища; первая версия (со звёздами 0–3) переводится: пройден = была хоть одна звезда. */
function loadProgress(p) {
  const boostersOk = (b) => b && typeof b === 'object'
    && ['hammer', 'row', 'shuffle', 'moves'].every((k) => Number.isInteger(b[k]) && b[k] >= 0);
  if (p?.v === 1 && Array.isArray(p.stars) && p.stars.length === LEVEL_COUNT && boostersOk(p.boosters)) {
    return { v: 2, done: p.stars.map((s) => (Number(s) > 0 ? 1 : 0)), boosters: p.boosters };
  }
  if (p?.v === 2 && Array.isArray(p.done) && p.done.length === LEVEL_COUNT && p.done.every((d) => d === 0 || d === 1) && boostersOk(p.boosters)) return p;
  return emptyProgress();
}

/** Первый непройденный уровень (все пройдены — последний). */
const currentLevel = () => {
  const n = progress.done.findIndex((d) => !d);
  return n < 0 ? LEVEL_COUNT : n + 1;
};
const passed = () => progress.done.reduce((a, b) => a + b, 0);
const isOpen = (n) => n <= currentLevel() || progress.done[n - 1] === 1;
const progressLine = () => (passed() >= LEVEL_COUNT ? 'Все 100 уровней пройдены' : `Уровень ${currentLevel()}`);

function saveProgress() {
  api?.storage.set('progress', progress);
  api?.progress(progressLine());
}

function saveRun() {
  if (!api) return;
  if (game && !game.over) api.storage.set('run', { level: spec.level, state: game, extra: usedExtra });
  else api.storage.remove('run');
}

// ---------- общие окна ----------

function openModal(content, { onClose } = {}) {
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = (e) => {
    if (e.target === ui.modal && onClose) {
      closeModal();
      onClose();
    }
  };
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

function iconButton(icon, label, onclick, extra = '') {
  const b = el('button', { class: `m3-icon-btn ${extra}`.trim(), 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function soundButton() {
  const b = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
    soundOn = !soundOn;
    api.storage.set('sound', soundOn);
    b.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
    b.setAttribute('aria-label', soundOn ? T.soundOn : T.soundOff);
    b.title = soundOn ? T.soundOn : T.soundOff;
    sfx('click');
  });
  return b;
}

/** Значок цели и число. */
function goalChip(goal, left, size = 30) {
  const chip = el('div', { class: 'm3-goal', 'data-t': goal.t, 'data-c': goal.c ?? '' },
    makeIcon(goalIcon(goal, spec), goal.c, size),
    el('span', { class: 'm3-goal-n' }, left > 0 ? String(left) : '✓'),
  );
  chip.classList.toggle('m3-goal-done', left <= 0);
  return chip;
}

// ---------- карта ----------

function showMap({ celebrate = 0 } = {}) {
  screen = 'map';
  stopHint();
  renderer?.destroy();
  renderer = null;
  game = null;
  root.dataset.screen = 'map';
  delete root.dataset.theme;
  map?.destroy();
  map = createMap({
    levelState: (n) => ({ done: progress.done[n - 1] === 1, open: isOpen(n), current: n === currentLevel() && !progress.done[n - 1] }),
    onPick: (n) => {
      sfx('click');
      showLevelCard(n);
    },
  });
  const passedBadge = el('div', { class: 'm3-star-total', title: 'Пройдено уровней' }, '✓ ', `${passed()} / ${LEVEL_COUNT}`);
  root.replaceChildren(
    el('div', { class: 'm3-header' },
      el('div', { class: 'm3-head-text' }, el('div', { class: 'm3-title' }, T.title), el('div', { class: 'm3-sub' }, T.level(currentLevel()))),
      el('div', { class: 'm3-actions' }, passedBadge, soundButton()),
    ),
    map.root,
    ui.modal,
    ui.fx,
    toast.el,
  );
  const target = celebrate ? Math.min(LEVEL_COUNT, celebrate + 1) : currentLevel();
  requestAnimationFrame(() => {
    if (!map) return;
    map.paint();
    map.scrollTo(celebrate || target);
    if (celebrate) {
      later(() => {
        if (!map) return;
        map.scrollTo(target, true);
        const node = map.node(target);
        if (node && celebrate < LEVEL_COUNT) {
          sfx('unlock');
          animate(node, [
            { transform: 'translate(-50%, -50%) scale(0.6)', filter: 'brightness(2)' },
            { transform: 'translate(-50%, -50%) scale(1.25)', filter: 'brightness(1.4)', offset: 0.6 },
            { transform: 'translate(-50%, -50%) scale(1)', filter: 'none' },
          ], { duration: 650, easing: 'ease-out' });
          later(() => { if (map && screen === 'map') showLevelCard(target); }, 900);
        } else if (celebrate >= LEVEL_COUNT) toast.show(T.allDone, 4000);
      }, reducedMotion() ? 0 : 450);
    }
  });
}

function showLevelCard(n) {
  const sp = levelSpec(n);
  const boss = sp.boss;
  const done = progress.done[n - 1] === 1;
  const card = el('div', { class: `m3-card${boss ? ' m3-card-boss' : ''}`, role: 'dialog' },
    el('button', { class: 'm3-close', 'aria-label': T.close, onclick: closeModal }, '✕'),
    boss && el('div', { class: 'm3-boss-badge' }, '👑 ', T.boss),
    el('h2', {}, T.level(n)),
    done && el('div', { class: 'm3-card-done' }, '✓ Пройден'),
    el('div', { class: 'm3-card-label' }, T.goals),
    el('div', { class: 'm3-card-goals' }, goalCardChips(sp)),
    el('div', { class: 'm3-card-moves' }, `${sp.moves} ходов`),
    el('button', { class: 'm3-btn m3-btn-play', onclick: () => { closeModal(); startLevel(n); } }, T.play),
  );
  openModal(card, { onClose: () => {} });
}

/** Цели на карточке уровня: сколько каждой на старте. */
function goalCardChips(sp) {
  const s = newGame(sp, rng);
  return s.goals.map((g) => el('div', { class: 'm3-goal' }, makeIcon(goalIcon(g, sp), g.c, 34), el('span', { class: 'm3-goal-n' }, String(goalLeft(s, g)))));
}

/** Значок цели: у «ящиков» — сейф, если на уровне только сейфы. */
function goalIcon(g, sp) {
  if (g.t !== 'box' || !sp) return g.t;
  const crates = sp.layout.some((r) => /[cCKh]/.test(r));
  return crates ? 'box' : 'steel';
}

// ---------- уровень ----------

function startLevel(n, saved = null) {
  screen = 'level';
  map?.destroy();
  map = null;
  spec = levelSpec(n);
  game = saved && isValidState(saved.state) && saved.level === n ? saved.state : newGame(spec, rng);
  usedExtra = Boolean(saved?.extra);
  selected = -1;
  armed = null;
  busy = true;
  root.dataset.screen = 'level';
  root.dataset.theme = CHAPTERS[spec.chapter].theme;

  const board = el('canvas', { class: 'm3-board' });
  ui.board = board;
  ui.moves = el('div', { class: 'm3-moves-n' });
  ui.goals = el('div', { class: 'm3-goals' });
  ui.boosters = el('div', { class: 'm3-boosters' });
  ui.boardWrap = el('div', { class: 'm3-board-wrap' }, board);

  root.replaceChildren(
    el('div', { class: 'm3-header m3-level-head' },
      iconButton(ICONS.back, T.back, () => leaveLevel(), 'm3-back'),
      el('div', { class: 'm3-head-text' },
        el('div', { class: 'm3-title' }, T.level(n), spec.boss && el('span', { class: 'm3-boss-tag' }, T.boss)),
        el('div', { class: 'm3-sub' }, `Глава ${spec.chapter + 1} · ${CHAPTERS[spec.chapter].name}`),
      ),
      el('div', { class: 'm3-actions' }, soundButton()),
    ),
    el('div', { class: 'm3-hud' },
      el('div', { class: 'm3-moves' }, ui.moves, el('span', {}, T.moves)),
      ui.goals,
    ),
    ui.boardWrap,
    ui.boosters,
    ui.modal,
    ui.fx,
    toast.el,
  );

  renderer = createRenderer({ board, fx: ui.fx, host: root, getGoalTarget });
  renderer.sync(game);
  paintHud(true);
  paintBoosters();
  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('pointermove', onPointerMove);
  board.addEventListener('pointerup', onPointerUp);
  board.addEventListener('pointercancel', () => { drag = null; });
  board.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
  requestAnimationFrame(async () => {
    if (!renderer) return;
    renderer.layout();
    await renderer.intro();
    busy = false;
    if (spec.tip && !progress.done[n - 1]) showTip(spec);
    else armHint();
  });
  saveRun();
}

// значок механики для карточки-подсказки
const TIP_ICON = {
  swap: ['color', 2], rocket: ['rocket', 0], bomb: ['bomb', 5], propeller: ['propeller', 3], prism: ['prism', 0],
  combo: ['bomb', 1], ice: ['ice', 0], ice2: ['ice', 0], crate: ['box', 0], treasure: ['treasure', 0],
  chain: ['chain', 0], steel: ['steel', 0], slime: ['slime', 0], timer: ['timer', 0],
};

/** Карточка о новой механике (или о боссе) перед первым прохождением уровня. */
function showTip(sp) {
  const boss = sp.boss;
  const [type, color] = boss ? ['treasure', 0] : TIP_ICON[sp.tip] ?? ['color', 0];
  const card = el('div', { class: `m3-card m3-card-tip${boss ? ' m3-card-boss' : ''}`, role: 'dialog' },
    boss ? el('div', { class: 'm3-boss-badge' }, '👑 ', T.boss) : el('div', { class: 'm3-tip-icon' }, makeIcon(type, color, 64)),
    el('p', { class: 'm3-tip-text' }, boss ? 'Сложный уровень: много целей и мало ходов. Береги спецфишки для комбо!' : TIPS[sp.tip]),
    boss && el('div', { class: 'm3-card-goals' }, game.goals.map((g) => goalChip(g, goalLeft(game, g), 34))),
    el('button', { class: 'm3-btn m3-btn-play', onclick: () => { closeModal(); armHint(); } }, 'Понятно'),
  );
  openModal(card, { onClose: () => armHint() });
}

function getGoalTarget(kind, color) {
  if (!ui?.goals) return null;
  const sel = kind === 'color' ? `.m3-goal[data-t="color"][data-c="${color}"]` : `.m3-goal[data-t="${kind}"]`;
  const node = ui.goals.querySelector(sel);
  if (!node || node.classList.contains('m3-goal-done')) return null;
  const r = node.getBoundingClientRect();
  const h = root.getBoundingClientRect();
  return { x: r.left - h.left + 16, y: r.top - h.top + 16, onArrive: () => pop(node, { from: 0.8, duration: 160 }) };
}

function paintHud(first = false) {
  if (!game || !ui.moves) return;
  const prevMoves = ui.moves.textContent;
  ui.moves.textContent = String(game.moves);
  ui.moves.classList.toggle('m3-low', game.moves <= 5);
  if (!first && prevMoves !== ui.moves.textContent) pop(ui.moves, { from: 0.8, duration: 180 });
  const chips = game.goals.map((g) => goalChip(g, goalLeft(game, g)));
  if (first || ui.goals.children.length !== chips.length) ui.goals.replaceChildren(...chips);
  else {
    [...ui.goals.children].forEach((node, k) => {
      const left = goalLeft(game, game.goals[k]);
      const n = node.querySelector('.m3-goal-n');
      const text = left > 0 ? String(left) : '✓';
      if (n.textContent !== text) {
        n.textContent = text;
        if (left <= 0 && !node.classList.contains('m3-goal-done')) {
          node.classList.add('m3-goal-done');
          pop(node, { from: 0.6, duration: 260 });
        }
      }
    });
  }
}

function paintBoosters() {
  if (!ui.boosters) return;
  ui.boosters.replaceChildren(...BOOSTERS.map((b) => {
    const count = progress.boosters[b.id];
    const btn = el('button', {
      class: `m3-booster${armed === b.id ? ' on' : ''}${count ? '' : ' empty'}`,
      'aria-label': `${b.title}: ${count}`,
      onclick: () => onBooster(b),
    });
    btn.innerHTML = ICONS[b.id];
    btn.append(el('span', { class: 'm3-booster-title' }, b.title), el('span', { class: 'm3-booster-n' }, String(count)));
    return btn;
  }));
}

function onBooster(b) {
  if (busy || modalActive || !game || game.over) return;
  if (!progress.boosters[b.id]) {
    shake(ui.boosters);
    toast.show('Бонусы даются за боссов и за уровни 5, 15, 25…', 2600);
    return;
  }
  sfx('click');
  if (b.id === 'shuffle') {
    armed = null;
    progress.boosters.shuffle -= 1;
    saveProgress();
    paintBoosters();
    runPhases(useBooster(game, 'shuffle', 0, rng));
    return;
  }
  armed = armed === b.id ? null : b.id;
  selectCell(-1);
  paintBoosters();
  if (armed) toast.show(b.hint, 2200);
}

// ---------- ввод ----------

function selectCell(i) {
  selected = i;
  renderer?.select(i);
}

function onPointerDown(e) {
  if (finaleRunning) {
    renderer?.setSpeed(6);
    return;
  }
  if (busy || modalActive || !game || game.over || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = renderer.cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  audio.get();
  stopHint();
  drag = { i, x: e.clientX, y: e.clientY, id: e.pointerId };
  try {
    ui.board.setPointerCapture(e.pointerId);
  } catch {
    // старые браузеры
  }
}

function onPointerMove(e) {
  if (!drag || drag.id !== e.pointerId || armed) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  const need = renderer.cellSize() * 0.3;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < need) return;
  const from = drag.i;
  drag = null;
  const r = Math.floor(from / game.cols);
  const c = from % game.cols;
  const [nr, nc] = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
  if (nr < 0 || nc < 0 || nr >= game.rows || nc >= game.cols) return;
  attemptSwap(from, nr * game.cols + nc);
}

function onPointerUp(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const i = drag.i;
  drag = null;
  onTap(i);
}

function onTap(i) {
  if (busy || !game || game.over) return;
  if (armed) {
    const kind = armed;
    armed = null;
    progress.boosters[kind] -= 1;
    saveProgress();
    paintBoosters();
    sfx('booster');
    runPhases(useBooster(game, kind, i, rng));
    return;
  }
  const p = game.pieces[i];
  if (selected >= 0 && selected !== i && adjacent(game, selected, i)) {
    const from = selected;
    selectCell(-1);
    attemptSwap(from, i);
    return;
  }
  if (isSpecial(p) && !p.lock) {
    selectCell(-1);
    runPhases(tapMove(game, i, rng));
    return;
  }
  if (!p || p.lock || game.block[i]) {
    selectCell(-1);
    armHint();
    return;
  }
  sfx('select');
  api.platform.haptic.selection();
  selectCell(selected === i ? -1 : i);
  armHint();
}

function attemptSwap(a, b) {
  if (busy) return;
  selectCell(-1);
  if (!swapValid(game, a, b)) {
    if (game.pieces[a] && game.pieces[b] && !game.block[a] && !game.block[b]) {
      busy = true;
      sfx('bad');
      renderer.play({ t: 'bad', a, b }).then(() => {
        busy = false;
        armHint();
      });
    }
    return;
  }
  sfx('swap');
  api.platform.haptic.impact('light');
  runPhases(playMove(game, a, b, rng));
}

// ---------- ход ----------

async function runPhases(gen) {
  busy = true;
  stopHint();
  try {
    for (const phase of gen) {
      if (!renderer) return;
      if (phase.t === 'bad') {
        sfx('bad');
        await renderer.play(phase);
        continue;
      }
      await renderer.play(phase, sfx);
      if (!renderer) return;
      if (phase.t === 'clear' && phase.cascade >= 3) api.platform.haptic.impact(phase.cascade >= 5 ? 'heavy' : 'medium');
      paintHud();
    }
  } finally {
    if (renderer) renderer.sync(game);
    paintHud();
    busy = false;
  }
  saveRun();
  if (game.over === 'win') await winLevel();
  else if (game.over === 'lose') loseLevel();
  else armHint();
}

// ---------- подсказка ----------

function stopHint() {
  clearTimeout(hintTimer);
  renderer?.hint(null);
}

function armHint() {
  stopHint();
  if (!game || game.over) return;
  hintTimer = setTimeout(() => {
    if (!renderer || busy || modalActive || !game || game.over) return;
    const move = botMove(game, rng) ?? findMoves(game)[0];
    if (move) renderer.hint(move[0] === move[1] ? [move[0]] : move);
  }, 6000);
}

// ---------- победа и поражение ----------

async function winLevel() {
  busy = true;
  api.platform.haptic.notification('success');
  sfx('win');
  toast.show(game.moves > 0 ? 'Цели выполнены! Оставшиеся ходы — в ракеты' : 'Цели выполнены!', 1800);
  await sleep(350);
  if (!renderer) return;
  await runFinale();
  const n = spec.level;
  const first = !progress.done[n - 1];
  progress.done[n - 1] = 1;
  // награды за первое прохождение: босс — по бонусу каждого вида, уровни 5, 15, 25… — случайный бонус
  const reward = [];
  if (first && spec.boss) {
    for (const k of ['hammer', 'row', 'shuffle', 'moves']) progress.boosters[k] += 1;
    reward.push('hammer', 'row', 'shuffle', 'moves');
  } else if (first && n % 10 === 5) {
    const k = ['hammer', 'row', 'shuffle'][Math.floor(rng() * 3)];
    progress.boosters[k] += 1;
    reward.push(k);
  }
  saveProgress();
  api.storage.remove('run');
  busy = false;
  showWinCard(n, reward);
}

/** Финал: короткая вспышка ракет; нажатие по полю — ещё быстрее. */
async function runFinale() {
  finaleRunning = true;
  renderer.setSpeed(1.6);
  try {
    for (const phase of finale(game, rng)) {
      if (!renderer) return;
      await renderer.play(phase, sfx);
      paintHud();
    }
  } finally {
    finaleRunning = false;
    renderer?.setSpeed(1);
  }
  renderer?.sync(game);
  paintHud();
}

const sleep = (ms) => new Promise((resolve) => later(resolve, reducedMotion() ? 0 : ms));

function showWinCard(n, reward) {
  const names = { hammer: 'Молоток', row: 'Ракета', shuffle: 'Перемешать', moves: '+5 ходов' };
  const card = el('div', { class: `m3-card m3-card-win${spec.boss ? ' m3-card-boss' : ''}`, role: 'dialog' },
    el('div', { class: 'm3-rays' }),
    el('h2', {}, spec.boss ? T.bossWon : T.won),
    el('div', { class: 'm3-win-medal' }, spec.boss ? '👑' : '✓'),
    el('div', { class: 'm3-win-sub' }, n >= LEVEL_COUNT ? T.allDone : `Открыт уровень ${n + 1}`),
    reward.length > 0 && el('div', { class: 'm3-reward' }, el('span', { class: 'm3-card-label' }, T.reward),
      el('div', { class: 'm3-reward-list' }, reward.map((k) => el('span', { class: 'm3-reward-chip' }, `${names[k]} +1`)))),
    el('div', { class: 'm3-card-btns' },
      el('button', { class: 'm3-btn m3-btn-ghost', onclick: () => { closeModal(); startLevel(n); } }, T.retry),
      el('button', { class: 'm3-btn m3-btn-play', onclick: () => { closeModal(); showMap({ celebrate: n }); } }, T.next),
    ),
  );
  openModal(card);
  const medal = card.querySelector('.m3-win-medal');
  later(() => {
    sfx('medal');
    pop(medal, { from: 0.3, duration: 420 });
  }, reducedMotion() ? 0 : 250);
  if (!reducedMotion()) later(() => renderer?.confettiAt(Math.floor(game.cells.length / 2)), 300);
}

function loseLevel() {
  api.platform.haptic.notification('error');
  sfx('lose');
  const left = game.goals.map((g) => ({ g, n: goalLeft(game, g) })).filter((x) => x.n > 0);
  const near = left.reduce((a, x) => a + x.n, 0) <= 4;
  const canExtra = game.reason === 'moves' && !usedExtra && progress.boosters.moves > 0;
  const card = el('div', { class: 'm3-card m3-card-lose', role: 'dialog' },
    el('h2', {}, game.reason === 'timer' ? T.lostTimer : T.lostMoves),
    near && el('div', { class: 'm3-card-label' }, T.almost),
    el('div', { class: 'm3-card-goals' }, left.map((x) => goalChip(x.g, x.n, 34))),
    el('div', { class: 'm3-card-btns m3-card-btns-col' },
      canExtra && el('button', { class: 'm3-btn m3-btn-play', onclick: () => continueWithMoves() }, T.plus5(progress.boosters.moves)),
      el('div', { class: 'm3-card-btns' },
        el('button', { class: 'm3-btn m3-btn-ghost', onclick: () => { closeModal(); showMap(); } }, T.toMap),
        el('button', { class: canExtra ? 'm3-btn m3-btn-ghost' : 'm3-btn m3-btn-play', onclick: () => { closeModal(); startLevel(spec.level); } }, T.retry),
      ),
    ),
  );
  openModal(card);
  api.storage.remove('run');
}

function continueWithMoves() {
  closeModal();
  progress.boosters.moves -= 1;
  usedExtra = true;
  saveProgress();
  game.over = null;
  game.reason = null;
  game.moves += 5;
  paintHud();
  pop(ui.moves, { from: 0.4, duration: 400 });
  saveRun();
  armHint();
}

function leaveLevel() {
  if (busy) return;
  sfx('click');
  saveRun();
  showMap();
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else if (armed) {
      armed = null;
      paintBoosters();
    }
  }
}

function onResize() {
  renderer?.layout();
}

export default {
  id: 'match3',
  title: 'Три в ряд',

  async init(container, gameApi) {
    api = gameApi;
    toast = createToast();
    const [savedProgress, savedRun, savedSound] = await Promise.all([
      api.storage.get('progress'), api.storage.get('run'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = loadProgress(savedProgress);
    if (savedProgress?.v === 1) api.storage.set('progress', progress);
    ui = {
      modal: el('div', { class: 'm3-modal', hidden: true }),
      fx: el('canvas', { class: 'm3-fx' }),
    };
    root = el('div', { class: 'm3' });
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    api.progress(progressLine());
    if (savedRun && Number.isInteger(savedRun.level) && isOpen(savedRun.level) && isValidState(savedRun.state)) startLevel(savedRun.level, savedRun);
    else showMap();
    // для проверки (страница-обёртка с автоигроком): ?m3debug в адресе
    if (new URLSearchParams(location.search).has('m3debug')) {
      window.__m3 = {
        get game() { return game; },
        get busy() { return busy; },
        get modal() { return modalActive; },
        start: (n) => { closeModal(); startLevel(n); },
        swap: (a, b) => attemptSwap(a, b),
        tap: (i) => onTap(i),
        bot: () => botMove(game, rng),
        map: () => showMap(),
      };
    }
  },

  getState() {
    if (screen === 'level' && game && !game.over) {
      saveRun();
      return { level: spec.level };
    }
    return null;
  },

  destroy() {
    if (screen === 'level' && game && !game.over) saveRun();
    stopHint();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
    renderer?.destroy();
    map?.destroy();
    toast?.dispose();
    root?.remove();
    api = root = ui = toast = game = spec = renderer = map = progress = null;
    busy = modalActive = false;
    selected = -1;
    armed = null;
    drag = null;
    screen = 'map';
  },
};

