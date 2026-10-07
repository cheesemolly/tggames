// «Слоги» — слова темы разрезаны на слоги, каждый слог — кружок в общей куче. Касаешься кружков по порядку, и когда
// слоги складываются в слово темы, кружки лопаются. Первый экран — список тем: звёзды за скорость открывают новые.
// «Классика» — найти все слова уровня (время идёт вверх, звёзды — за секунды на слово); «На время» — 45 секунд,
// слова подсыпаются, длинное слово дороже. Лампочка называет слово, которое надо найти.
// Кучу кружков двигает physics.js (притяжение к середине и расталкивание); кадры идут, только пока куча не уснула.
// С компьютера: Esc — снять выбор, Backspace — убрать последний слог.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { TOPICS } from './topics.js';
import { createWorld, radiusOf, unitFor, spawnPoint } from './physics.js';
import {
  TIMED_SECONDS, TIMED_BOARD, HINT_PENALTY, STAR_SECONDS,
  syllables, display, keyOf, pickWords, piecesOf, check, wordsIn, starsFor, wordScore,
  emptyProgress, migrateProgress, totalStars, starsToOpen, isOpen, recordClassic, recordTimed,
  emptyStats, migrateStats, isValidRun, formatTime, plural,
} from './logic.js';

const SKINS = ['telegram', 'pastel', 'candy', 'ocean', 'sunset', 'graphite'];
const COLORS = 6;                  // цветов кружков в скине: --sw-b1 … --sw-b6
const TOPIC_IDS = TOPICS.map((t) => t.id);

const T = {
  title: 'Слоги',
  modes: { classic: 'Классика', timed: 'На время' },
  modeHint: { classic: 'Найди все слова темы. Чем быстрее — тем больше звёзд.', timed: `${TIMED_SECONDS} секунд: собери как можно больше слов. Длинное слово — больше очков.` },
  stars: (n) => `${n} ${plural(n, ['звезда', 'звезды', 'звёзд'])}`,
  need: (n) => `ещё ${n} ★`,
  locked: (n) => `Тема откроется, когда соберёте ещё ${T.stars(n)}`,
  record: (n) => `рекорд ${n}`,
  resume: 'Продолжить',
  found: (a, b) => `${a} из ${b}`,
  score: (n) => `${n} ${plural(n, ['очко', 'очка', 'очков'])}`,
  back: 'К темам',
  hint: 'Подсказка',
  clue: (word) => `Ищи: ${word}`,
  none: 'Так слово не собрать',
  praise: ['', 'Пройдено', 'Хорошо!', 'Отлично!'],
  time: 'Время',
  best: 'Лучшее',
  newBest: 'новый рекорд',
  penalty: (n) => `в том числе +${n * HINT_PENALTY} с за ${n === 1 ? 'подсказку' : 'подсказки'}`,
  opened: (names) => (names.length === 1 ? `Открыта тема: ${names[0]}` : `Открыты темы: ${names.join(', ')}`),
  words: 'Слова уровня',
  next: 'Дальше',
  again: 'Ещё раз',
  topics: 'Темы',
  timeUp: 'Время вышло',
  timedScore: 'Счёт',
  timedWords: (n) => `${n} ${plural(n, ['слово', 'слова', 'слов'])}`,
  close: 'Закрыть',
  help: { open: 'Правила', title: 'Правила' },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Цвета', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', pastel: 'Пастель', candy: 'Леденцы', ocean: 'Море', sunset: 'Закат', graphite: 'Графит' },
  stats: { words: 'Собрано слов', levels: 'Пройдено уровней', runs: 'Забегов на время', hints: 'Подсказок' },
  rules: [
    'У каждого уровня своя тема — фрукты, планеты, герои сказок. Слова темы разрезаны на слоги, каждый слог — кружок.',
    'Касайтесь кружков по порядку: выбранные слоги встают в строку внизу. Сложилось слово темы — кружки лопнут. Ошиблись — коснитесь слога ещё раз, он вернётся.',
    `«Классика»: найдите все слова. Три звезды — быстрее ${STAR_SECONDS[0]} секунд на слово, две — быстрее ${STAR_SECONDS[1]}. Звёзды открывают новые темы: по звезде на тему.`,
    `«На время»: ${TIMED_SECONDS} секунд, слова подсыпаются взамен найденных. За слово — очко за букву, длинным словам надбавка.`,
    `Лампочка называет слово, которое есть на поле. В «Классике» подсказка стоит ${HINT_PENALTY} секунд.`,
  ],
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  bulb: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  back: svgIcon('<path d="m6 6 12 12"/><path d="M18 6 6 18"/>'),
  lock: svgIcon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  star: svgIcon('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>', true),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('swdebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let progress = emptyProgress();
let stats = emptyStats();
let settings = { skin: 'telegram' };
let mode = 'classic';
let saved = null;                  // начатый уровень «Классики», к которому можно вернуться
let screen = 'home';
let run = null;                    // идущий уровень: { v, topic, mode, words, found, ms, hints }
let topicIndex = 0;
let world = null;
let unit = 20;                     // радиус самого маленького кружка, px
let bubbles = new Map();           // id кусочка → { piece, node, text, body, color }
let selected = [];                 // выбранные кружки по порядку
let board = [];                    // «На время»: слова, которые сейчас на поле
let queue = [];                    // «На время»: слова, которые подсыплются
let score = 0;
let leftMs = 0;                    // «На время»: сколько осталось
let nextId = 0;
let clued = new Set();             // слова, уже названные подсказкой
let finished = false;
let rejecting = false;
let clockId = 0;
let clockLast = 0;
let clockBeat = 0;
let raf = 0;
let frameLast = 0;
let resizeWatch = null;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
// звуки — один AudioContext на страницу, заводится при первом звуке
const audio = createAudio(createSounds);
const timers = new Set();

function sfx(name, opts) {
  if (!soundOn) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function later(fn, ms) {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      timers.delete(id);
      resolve(fn?.());
    }, ms);
    timers.add(id);
  });
}

const topicOf = (id) => TOPICS.find((t) => t.id === id);
/** Четыре цвета кружков уровня из шести цветов скина — у каждой темы свой набор. */
const paletteOf = (index) => [0, 1, 3, 4].map((k) => `var(--sw-b${((index + k) % COLORS) + 1})`);
const saveProgress = () => api?.storage.set('progress', progress);
const saveStats = () => api?.storage.set('stats', stats);
const remaining = () => (run.mode === 'classic' ? run.words.filter((w) => !run.found.includes(keyOf(w))) : board);
const playing = () => Boolean(run && !finished && screen === 'play' && !modalActive);

/** Есть ли что сохранять: уровень «Классики», в котором уже что-то найдено или прошло несколько секунд. */
const worthSaving = () => Boolean(run && !finished && run.mode === 'classic' && (run.found.length || run.ms >= 3000));

function saveRun() {
  if (!worthSaving()) return;
  saved = { v: 1, topic: run.topic, words: run.words, found: run.found, ms: Math.round(run.ms), hints: run.hints };
  api?.storage.set('current', saved);
}

function dropSaved() {
  saved = null;
  api?.storage.remove('current');
}

function reportProgress() {
  const n = totalStars(progress);
  api?.progress(n ? `Звёзд: ${n}` : null);
}

// ---------- список тем ----------

const POP_IN = [{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1.12, offset: 0.6 }, { opacity: 1, scale: 1 }];
const BUMP = [{ scale: 1 }, { scale: 1.2 }, { scale: 1 }];

function starsRow(count, cls = 'sw-stars') {
  return el('span', { class: cls, 'aria-label': T.stars(count) }, [0, 1, 2].map((k) => {
    const s = el('i', { class: k < count ? 'sw-star-on' : '' });
    s.innerHTML = ICONS.star;
    return s;
  }));
}

function topicCard(topic, index) {
  const open = isOpen(index, progress);
  const colors = paletteOf(index);
  const dots = el('span', { class: 'sw-dots' }, colors.slice(0, 3).map((c) => {
    const d = el('i', {});
    d.style.background = c;
    return d;
  }));
  let info;
  if (!open) {
    const lock = el('i', { class: 'sw-lock' });
    lock.innerHTML = ICONS.lock;
    info = el('span', { class: 'sw-topic-info' }, lock, T.need(starsToOpen(index) - totalStars(progress)));
  } else if (mode === 'classic') {
    const time = progress.time[topic.id];
    info = el('span', { class: 'sw-topic-info' }, starsRow(progress.stars[topic.id] ?? 0), time ? el('em', {}, formatTime(time)) : null);
  } else {
    const best = progress.timed[topic.id];
    info = el('span', { class: 'sw-topic-info' }, best ? el('em', {}, T.record(best)) : el('em', { class: 'sw-dim' }, '—'));
  }
  return el('button', {
    class: `sw-topic${open ? '' : ' sw-locked'}`,
    onclick: () => {
      if (open) {
        sfx('click');
        startRun(index);
      } else {
        toast.show(T.locked(starsToOpen(index) - totalStars(progress)), 2000);
        sfx('none');
      }
    },
  }, dots, el('b', {}, topic.title), info);
}

function renderHome() {
  ui.total.textContent = String(totalStars(progress));
  ui.tabs.forEach((tab, k) => tab.setAttribute('aria-selected', String(['classic', 'timed'][k] === mode)));
  ui.modeHint.textContent = T.modeHint[mode];
  const cards = TOPICS.map(topicCard);
  const resume = saved && mode === 'classic' ? topicOf(saved.topic) : null;
  ui.list.replaceChildren(
    ...(resume ? [el('button', {
      class: 'sw-resume',
      onclick: () => {
        sfx('click');
        startRun(TOPICS.indexOf(resume), saved);
      },
    }, el('span', {}, T.resume), el('b', {}, resume.title), el('em', {}, T.found(saved.found.length, saved.words.length)))] : []),
    ...cards,
  );
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  api.storage.set('mode', mode);
  sfx('click');
  renderHome();
  if (!reducedMotion()) animate(ui.list, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}

function showScreen(name) {
  screen = name;
  if (name === 'home') {
    hideLayer(ui.play, () => screen === 'home');
    renderHome();
    showLayer(ui.home);
  } else {
    hideLayer(ui.home, () => screen === 'play');
    showLayer(ui.play);
  }
}

// ---------- поле ----------

function schedule() {
  if (raf || !world) return;
  frameLast = performance.now();
  raf = requestAnimationFrame(frame);
}

function paint() {
  for (const b of bubbles.values()) {
    b.node.style.translate = `${(b.body.x - b.body.r).toFixed(1)}px ${(b.body.y - b.body.r).toFixed(1)}px`;
    b.text.style.rotate = `${b.body.angle.toFixed(1)}deg`;
  }
}

function frame(now) {
  raf = 0;
  if (!world) return;
  const dt = Math.max(0, now - frameLast) / 1000;        // метка rAF бывает раньше performance.now()
  frameLast = now;
  const asleep = world.step(dt);
  paint();
  if (!asleep) raf = requestAnimationFrame(frame);
}

function wake() {
  world?.wake();
  schedule();
}

function addBubble(piece, at, delay = 0) {
  const r = radiusOf(piece.text, unit);
  const palette = paletteOf(topicIndex);
  const color = palette[Math.floor(Math.random() * palette.length)];
  const text = el('span', {}, piece.text);
  const node = el('button', { class: 'sw-bub', 'data-id': piece.id }, text);
  node.style.width = `${r * 2}px`;
  node.style.height = `${r * 2}px`;
  node.style.fontSize = `${Math.max(12, unit * 0.84).toFixed(1)}px`;
  node.style.setProperty('--c', color);
  const body = world.add({ id: piece.id, x: at.x, y: at.y, r, tilt: (Math.random() - 0.5) * 76 });
  bubbles.set(piece.id, { piece, node, text, body, color });
  ui.stage.append(node);
  if (!reducedMotion()) animate(node, POP_IN, { duration: 320, delay, easing: 'ease-out', fill: 'backwards' });
}

/** Кружки слов появляются по кругу у краёв поля (drop — сверху, как подсыпанные) и стягиваются в кучу. */
function addWords(words, drop = false) {
  const pieces = piecesOf(words, nextId);
  nextId += pieces.length;
  pieces.forEach((piece, k) => {
    const at = drop
      ? { x: world.width * (0.2 + Math.random() * 0.6), y: radiusOf(piece.text, unit) + Math.random() * 24 }
      : spawnPoint(k, pieces.length, world.width, world.height);
    addBubble(piece, at, drop ? k * 60 : k * 22);
  });
  if (reducedMotion()) {
    world.settle();
    paint();
  } else {
    wake();
  }
}

function clearBoard() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  for (const b of bubbles.values()) b.node.remove();
  bubbles = new Map();
  selected = [];
  world = null;
}

/** Кружок лопается: исчезает, от него разлетаются брызги его цвета. */
function popBubble(id, k = 0) {
  const b = bubbles.get(id);
  if (!b) return;
  bubbles.delete(id);
  world.remove(id);
  const { node, body, color } = b;
  node.classList.add('sw-popping');
  sfx('pop', { step: k });
  if (reducedMotion()) {
    node.remove();
    return;
  }
  animate(node, [{ scale: 1.1, opacity: 1 }, { scale: 1.35, opacity: 0.9, offset: 0.35 }, { scale: 0.2, opacity: 0 }],
    { duration: 300, delay: k * 70, easing: 'ease-in', fill: 'forwards' }).then(() => node.remove());
  later(() => {
    if (!ui) return;
    for (let p = 0; p < 7; p++) {
      const a = (p / 7) * Math.PI * 2 + Math.random();
      const dist = body.r * (1.2 + Math.random() * 0.9);
      const dot = el('i', { class: 'sw-drop' });
      Object.assign(dot.style, { left: `${body.x}px`, top: `${body.y}px`, background: color });
      ui.stage.append(dot);
      animate(dot, [{ translate: '-50% -50%', scale: 1, opacity: 1 }, { translate: `calc(-50% + ${Math.cos(a) * dist}px) calc(-50% + ${Math.sin(a) * dist}px)`, scale: 0.3, opacity: 0 }],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' }).then(() => dot.remove());
    }
  }, k * 70 + 90);
}

// ---------- строка выбранных слогов ----------

function renderTray(fresh = false) {
  const chips = selected.map((id, k) => {
    const b = bubbles.get(id);
    const chip = el('button', { class: 'sw-chip', 'data-id': id }, b.piece.text);
    chip.style.setProperty('--c', b.color);
    if (fresh && k === selected.length - 1 && !reducedMotion()) animate(chip, POP_IN, { duration: 200, easing: 'ease-out' });
    return chip;
  });
  ui.tray.replaceChildren(...chips);
  for (const b of bubbles.values()) b.node.classList.toggle('sw-picked', selected.includes(b.piece.id));
}

function renderBar() {
  if (!run) return;
  if (run.mode === 'classic') {
    ui.clock.textContent = formatTime(run.ms + run.hints * HINT_PENALTY * 1000);
    ui.count.textContent = T.found(run.found.length, run.words.length);
    ui.timeBar.hidden = true;
  } else {
    ui.clock.textContent = formatTime(leftMs + 999);
    ui.count.textContent = T.score(score);
    ui.timeBar.hidden = false;
    ui.timeFill.style.scale = `${Math.max(0, leftMs / (TIMED_SECONDS * 1000)).toFixed(4)} 1`;
    ui.timeBar.classList.toggle('sw-hurry', leftMs <= 10000);
  }
}

function clearSelection() {
  selected = [];
  renderTray();
}

/** Выбранные слоги не складываются ни в одно слово — строка трясётся и очищается. */
function rejectSelection() {
  rejecting = true;
  sfx('none');
  api.platform.haptic.notification('error');
  ui.tray.classList.add('sw-bad');
  shake(ui.tray, { distance: 6, duration: 320 });
  later(() => {
    rejecting = false;
    if (!ui) return;
    ui.tray.classList.remove('sw-bad');
    clearSelection();
  }, reducedMotion() ? 0 : 380);
}

/** Слово собрано: кружки лопаются, слово всплывает над строкой. */
function solve(word) {
  const key = keyOf(word);
  const ids = selected;
  selected = [];
  stats.words += 1;
  saveStats();
  sfx('word', { step: ids.length });
  api.platform.haptic.notification('success');
  // слово целиком на месте строки слогов
  const pill = el('div', { class: 'sw-word' }, display(word));
  ui.tray.replaceChildren(pill);
  if (!reducedMotion()) {
    animate(pill, [{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1.08, offset: 0.3 }, { opacity: 1, scale: 1, offset: 0.7 }, { opacity: 0, translate: '0 -18px' }],
      { duration: 900, easing: 'ease-out', fill: 'forwards' }).then(() => pill.isConnected && pill.remove());
  } else {
    later(() => pill.isConnected && pill.remove(), 500);
  }
  ids.forEach((id, k) => popBubble(id, k));
  wake();
  if (ui.clue.dataset.word === key) hideClue();
  if (run.mode === 'classic') {
    run.found.push(key);
    saveRun();
    renderBar();
    if (run.found.length >= run.words.length) later(() => ui && run && completeClassic(), reducedMotion() ? 0 : 600);
    return;
  }
  const gain = wordScore(word);
  score += gain;
  run.found.push(key);
  board = board.filter((w) => keyOf(w) !== key);
  floatGain(gain);
  renderBar();
  animate(ui.count, BUMP, { duration: 240, easing: 'ease-out' });
  later(() => ui && run && !finished && refill(), reducedMotion() ? 0 : 280);
}

function floatGain(gain) {
  if (reducedMotion()) return;
  const node = el('span', { class: 'sw-gain' }, `+${gain}`);
  ui.trayRow.append(node);
  animate(node, [{ opacity: 0, translate: '-50% 0' }, { opacity: 1, translate: '-50% -22px', offset: 0.3 }, { opacity: 0, translate: '-50% -48px' }],
    { duration: 900, easing: 'ease-out', fill: 'forwards' }).then(() => node.remove());
}

/** «На время»: на место найденного слова подсыпается следующее из очереди. */
function refill() {
  while (board.length < TIMED_BOARD) {
    if (!queue.length) {
      const onBoard = new Set(board.map(keyOf));
      queue = topicOf(run.topic).words.filter((w) => !onBoard.has(keyOf(w))).sort(() => Math.random() - 0.5);
      if (!queue.length) break;
    }
    const word = queue.shift();
    board.push(word);
    addWords([word], true);
  }
}

/** Игрок коснулся кружка или слога в строке. */
function toggle(id) {
  if (!playing() || rejecting || !bubbles.has(id)) return;
  const at = selected.indexOf(id);
  if (at >= 0) {
    selected.splice(at, 1);
    sfx('unpick', { step: selected.length });
    api.platform.haptic.selection();
    renderTray();
    return;
  }
  selected.push(id);
  sfx('pick', { step: selected.length - 1 });
  api.platform.haptic.selection();
  renderTray(true);
  const res = check(selected.map((x) => bubbles.get(x).piece.text), remaining());
  if (res?.word) solve(res.word);
  else if (res?.dead) rejectSelection();
}

function onStageTap(e) {
  const node = e.target.closest('.sw-bub');
  if (!node) return;
  e.preventDefault();
  toggle(Number(node.dataset.id));
}

function onTrayTap(e) {
  const node = e.target.closest('.sw-chip');
  if (node) toggle(Number(node.dataset.id));
}

// ---------- подсказка ----------

function hideClue() {
  ui.clue.hidden = true;
  delete ui.clue.dataset.word;
  for (const b of bubbles.values()) b.node.classList.remove('sw-hinted');
}

/** Лампочка: называет слово, которое есть на поле, и подсвечивает его первый слог. */
function onHint() {
  if (!playing() || rejecting) return;
  const words = remaining();
  if (!words.length) return;
  // сначала слова, которые ещё не называли; все названы — напоминаем одно из них бесплатно
  const fresh = words.filter((w) => !clued.has(keyOf(w)));
  const pool = fresh.length ? fresh : words;
  const word = pool[Math.floor(Math.random() * pool.length)];
  const key = keyOf(word);
  if (fresh.length) {
    clued.add(key);
    if (run.mode === 'classic') run.hints += 1;
    stats.hints += 1;
    saveStats();
    saveRun();
  }
  sfx('hint');
  api.platform.haptic.impact('light');
  hideClue();
  ui.clue.textContent = T.clue(display(word));
  ui.clue.dataset.word = key;
  ui.clue.hidden = false;
  if (!reducedMotion()) animate(ui.clue, POP_IN, { duration: 260, easing: 'ease-out' });
  const first = syllables(word)[0];
  const target = [...bubbles.values()].find((b) => b.piece.word === key && b.piece.text === first) ?? [...bubbles.values()].find((b) => b.piece.text === first);
  target?.node.classList.add('sw-hinted');
  renderBar();
  if (run.mode === 'classic' && !reducedMotion()) animate(ui.clock, BUMP, { duration: 260, easing: 'ease-out' });
}

// ---------- время ----------

function stopClock() {
  clearInterval(clockId);
  clockId = 0;
}

function tick() {
  const now = performance.now();
  const dt = Math.max(0, Math.min(now - clockLast, 1000));
  clockLast = now;
  if (!playing() || document.hidden) return;
  if (run.mode === 'classic') {
    run.ms += dt;
    renderBar();
    return;
  }
  leftMs -= dt;
  const sec = Math.ceil(leftMs / 1000);
  if (sec !== clockBeat) {
    clockBeat = sec;
    if (sec > 0 && sec <= 5) sfx('tick', { step: sec });
  }
  renderBar();
  if (leftMs <= 0) completeTimed();
}

function startClock() {
  stopClock();
  clockLast = performance.now();
  clockBeat = TIMED_SECONDS;
  clockId = setInterval(tick, 100);
}

// ---------- уровень ----------

/** Начать уровень темы index (resume — сохранённый уровень «Классики»). */
function startRun(index, resume = null) {
  const topic = TOPICS[index];
  topicIndex = index;
  finished = false;
  rejecting = false;
  clued = new Set();
  nextId = 0;
  score = 0;
  board = [];
  queue = [];
  leftMs = TIMED_SECONDS * 1000;
  if (resume) {
    run = { v: 1, topic: topic.id, mode: 'classic', words: [...resume.words], found: [...resume.found], ms: resume.ms, hints: resume.hints };
  } else {
    run = { v: 1, topic: topic.id, mode, words: mode === 'classic' ? pickWords(topic, wordsIn(index)) : [], found: [], ms: 0, hints: 0 };
    if (mode === 'classic') dropSaved();
  }
  ui.result.hidden = true;
  ui.result.replaceChildren();
  hideClue();
  ui.topic.textContent = topic.title;
  ui.tray.replaceChildren();
  root.style.setProperty('--sw-lead', paletteOf(index)[0]);
  showScreen('play');
  clearBoard();
  // размеры поля известны только после показа экрана
  const box = ui.stage.getBoundingClientRect();
  world = createWorld(Math.max(120, box.width), Math.max(120, box.height));
  if (run.mode === 'classic') {
    const words = remaining();
    unit = unitFor(run.words.flatMap((w) => syllables(w)), world.width, world.height);
    addWords(words);
  } else {
    queue = [...topic.words].sort(() => Math.random() - 0.5);
    const first = queue.splice(0, TIMED_BOARD);
    // размер кружков — по самому тесному случаю: пять слов и ещё одно на подлёте
    unit = unitFor([...first, ...queue.slice(0, 1)].flatMap((w) => syllables(w)), world.width, world.height, { fill: 0.4 });
    board = [...first];
    addWords(first);
  }
  renderTray();
  renderBar();
  startClock();
}

function leaveRun() {
  if (!run) return;
  sfx('click');
  stopClock();
  saveRun();
  run = null;
  clearBoard();
  showScreen('home');
}

function resultCard(...children) {
  ui.result.replaceChildren(el('div', { class: 'sw-result-card' }, ...children));
  showLayer(ui.result);
}

function completeClassic() {
  if (finished || !run) return;
  finished = true;
  stopClock();
  const topic = TOPICS[topicIndex];
  const total = run.ms + run.hints * HINT_PENALTY * 1000;
  const stars = starsFor(total / 1000, run.words.length);
  const before = totalStars(progress);
  const hadTime = Boolean(progress.time[topic.id]);
  const res = recordClassic(progress, topic.id, total, stars);
  const after = totalStars(progress);
  const opened = TOPICS.filter((_, i) => starsToOpen(i) > before && starsToOpen(i) <= after).map((t) => t.title);
  stats.levels += 1;
  saveProgress();
  saveStats();
  dropSaved();
  reportProgress();
  sfx('win');
  api.platform.haptic.notification('success');
  const row = starsRow(0, 'sw-stars sw-stars-big');
  const next = TOPICS[topicIndex + 1] && isOpen(topicIndex + 1, progress) ? topicIndex + 1 : -1;
  resultCard(
    row,
    el('h2', {}, T.praise[stars]),
    el('div', { class: 'sw-result-line' },
      el('span', {}, T.time), el('b', {}, formatTime(total)),
      res.best && hadTime ? el('em', {}, T.newBest) : hadTime ? el('em', {}, `${T.best} ${formatTime(progress.time[topic.id])}`) : null),
    run.hints ? el('p', { class: 'sw-note' }, T.penalty(run.hints)) : null,
    opened.length ? el('p', { class: 'sw-opened' }, T.opened(opened.slice(0, 3))) : null,
    el('div', { class: 'sw-result-words' }, run.words.map((w) => el('span', {}, display(w)))),
    el('div', { class: 'sw-result-actions' },
      next >= 0 ? el('button', { class: 'btn', onclick: () => startRun(next) }, T.next) : null,
      el('button', { class: `btn${next >= 0 ? ' btn-secondary' : ''}`, onclick: () => startRun(topicIndex) }, T.again),
      el('button', { class: 'btn btn-secondary', onclick: leaveRun }, T.topics),
    ),
  );
  // звёзды зажигаются по одной
  [...row.children].slice(0, stars).forEach((star, k) => {
    later(() => {
      if (!ui) return;
      star.classList.add('sw-star-on');
      sfx('star', { step: k });
      if (!reducedMotion()) animate(star, POP_IN, { duration: 320, easing: 'ease-out' });
    }, reducedMotion() ? 0 : 350 + k * 320);
  });
}

function completeTimed() {
  if (finished || !run) return;
  finished = true;
  leftMs = 0;
  stopClock();
  renderBar();
  clearSelection();
  const topic = TOPICS[topicIndex];
  const record = recordTimed(progress, topic.id, score);
  stats.runs += 1;
  saveProgress();
  saveStats();
  sfx(record && score ? 'win' : 'timeup');
  api.platform.haptic.notification(record && score ? 'success' : 'warning');
  resultCard(
    el('h2', {}, T.timeUp),
    el('div', { class: 'sw-result-line' },
      el('span', {}, T.timedScore), el('b', {}, String(score)),
      record && score ? el('em', {}, T.newBest) : el('em', {}, T.record(progress.timed[topic.id] ?? 0))),
    el('p', { class: 'sw-note' }, T.timedWords(run.found.length)),
    el('div', { class: 'sw-result-words' }, run.found.map((key) => el('span', {}, display(topic.words.find((w) => keyOf(w) === key) ?? key)))),
    el('div', { class: 'sw-result-actions' },
      el('button', { class: 'btn', onclick: () => startRun(topicIndex) }, T.again),
      el('button', { class: 'btn btn-secondary', onclick: leaveRun }, T.topics),
    ),
  );
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  clockLast = performance.now();
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
}

function sheet(title, ...children) {
  return el('div', { class: 'sw-sheet', role: 'dialog', 'aria-label': title },
    el('div', { class: 'sw-sheet-head' },
      el('h2', {}, title),
      el('button', { class: 'sw-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showHelp() {
  openModal(sheet(T.help.title, T.rules.map((text) => el('p', { class: 'sw-rule' }, text))));
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'sw-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
      sfx('pick', { step: SKINS.indexOf(id) });
    },
  }, el('span', { class: 'sw-swatch', 'data-skin': id }, [1, 2, 3, 4].map((k) => el('i', { class: `sw-swatch-${k}` }))), T.skins[id]));
  openModal(sheet(T.settings.title,
    el('h3', { class: 'sw-section' }, T.settings.skin),
    el('div', { class: 'sw-skins', role: 'radiogroup' }, buttons),
    el('h3', { class: 'sw-section' }, T.settings.stats),
    el('dl', { class: 'sw-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, stats[k])])),
    pointsInfo(api, 'subwords'),
  ));
}

function iconButton(icon, label, onclick, cls = 'sw-icon-btn') {
  const button = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('sw-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else if (playing() && selected.length) clearSelection();
    return;
  }
  if (e.key === 'Backspace' && playing() && selected.length && !rejecting) {
    e.preventDefault();
    toggle(selected[selected.length - 1]);
  }
}

/** Поле изменило размер (поворот, клавиатура) — куча собирается заново в новых границах. */
function onResize() {
  if (!world || !ui) return;
  const box = ui.stage.getBoundingClientRect();
  if (box.width < 40 || box.height < 40) return;
  if (Math.abs(box.width - world.width) < 1 && Math.abs(box.height - world.height) < 1) return;
  world.resize(box.width, box.height);
  wake();
}

// ---------- отладка (?swdebug) ----------

function debugHooks() {
  globalThis.__subwords = {
    get run() { return run; },
    get progress() { return progress; },
    get score() { return score; },
    get finished() { return finished; },
    get asleep() { return !world || world.asleep; },
    get world() { return world; },
    /** Слова, которые сейчас можно собрать. */
    words: () => (run ? remaining().map(display) : []),
    /** Кружки слова по порядку слогов: [{ id, x, y }] в координатах экрана (для касаний). */
    path(word) {
      const key = keyOf(word);
      const used = new Set();
      const box = ui.stage.getBoundingClientRect();
      return syllables(remaining().find((w) => keyOf(w) === key) ?? word).map((text) => {
        const b = [...bubbles.values()].find((x) => x.piece.text === text && !used.has(x.piece.id) && x.piece.word === key)
          ?? [...bubbles.values()].find((x) => x.piece.text === text && !used.has(x.piece.id));
        if (!b) return null;
        used.add(b.piece.id);
        return { id: b.piece.id, x: box.left + b.body.x, y: box.top + b.body.y };
      });
    },
    tap: (id) => toggle(id),
    /** Собрать слово касаниями. */
    solve(word) {
      if (selected.length) clearSelection();
      for (const p of this.path(word)) if (p) toggle(p.id);
    },
    start: (index, m = 'classic') => {
      mode = m;
      startRun(index);
    },
    /** Время уровня (мс): проверить звёзды и конец «На время». */
    time(ms) {
      if (run?.mode === 'classic') run.ms = ms;
      else leftMs = ms;
    },
    /** Выдать звёзды первым n темам. */
    stars(n, each = 3) {
      TOPICS.slice(0, n).forEach((t) => { progress.stars[t.id] = each; });
      saveProgress();
      if (screen === 'home') renderHome();
    },
    home: leaveRun,
  };
}

export default {
  id: 'subwords',
  title: 'Слоги',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedProgress, savedRun, savedStats, savedSettings, savedSound, savedMode] = await Promise.all([
      api.storage.get('progress'), api.storage.get('current'), api.storage.get('stats'), api.storage.get('settings'),
      api.storage.get('sound'), api.storage.get('mode'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = migrateProgress(savedProgress, TOPIC_IDS);
    stats = migrateStats(savedStats);
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    mode = savedMode === 'timed' ? 'timed' : 'classic';
    saved = isValidRun(savedRun, TOPICS) ? savedRun : null;
    host.dataset.skin = settings.skin;

    ui = {
      total: el('b', {}),
      modeHint: el('p', { class: 'sw-mode-hint' }),
      list: el('div', { class: 'sw-list' }),
      topic: el('div', { class: 'sw-topic-name' }),
      clock: el('b', { class: 'sw-clock' }),
      count: el('span', { class: 'sw-count' }),
      timeFill: el('i', {}),
      stage: el('div', { class: 'sw-stage' }),
      clue: el('div', { class: 'sw-clue', hidden: true }),
      tray: el('div', { class: 'sw-tray' }),
      result: el('div', { class: 'sw-result', hidden: true }),
      modal: el('div', { class: 'sw-modal', hidden: true }),
    };
    ui.timeBar = el('div', { class: 'sw-timebar', hidden: true }, ui.timeFill);
    ui.trayRow = el('div', { class: 'sw-tray-row' }, ui.tray);
    ui.tabs = ['classic', 'timed'].map((m) => el('button', { class: 'sw-tab', role: 'tab', onclick: () => setMode(m) }, T.modes[m]));
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    const totalIcon = el('i', { class: 'sw-total-star' });
    totalIcon.innerHTML = ICONS.star;
    ui.home = el('div', { class: 'sw-home' },
      el('div', { class: 'sw-header' },
        el('div', { class: 'sw-heading' }, el('div', { class: 'sw-title' }, T.title), el('div', { class: 'sw-total' }, totalIcon, ui.total)),
        el('div', { class: 'sw-actions' },
          ui.soundBtn,
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'sw-tabs', role: 'tablist' }, ui.tabs),
      ui.modeHint,
      ui.list,
    );
    ui.play = el('div', { class: 'sw-play', hidden: true },
      el('div', { class: 'sw-bar' },
        iconButton(ICONS.back, T.back, leaveRun, 'sw-round'),
        el('div', { class: 'sw-bar-mid' }, ui.topic, el('div', { class: 'sw-bar-sub' }, ui.clock, ui.count)),
        iconButton(ICONS.bulb, T.hint, onHint, 'sw-round sw-bulb'),
      ),
      ui.timeBar,
      el('div', { class: 'sw-stage-wrap' }, ui.stage, ui.clue),
      ui.trayRow,
      ui.result,
    );
    ui.stage.addEventListener('pointerdown', onStageTap);
    ui.tray.addEventListener('click', onTrayTap);

    root = el('div', { class: 'sw' }, ui.home, ui.play, ui.modal, toast.el);
    container.append(root);
    renderSoundBtn();
    renderHome();
    reportProgress();
    document.addEventListener('keydown', onKeydown);
    if (typeof ResizeObserver === 'function') {
      resizeWatch = new ResizeObserver(onResize);
      resizeWatch.observe(ui.stage);
    }
    if (isDebug()) debugHooks();
    // начатый уровень «Классики» — сразу к нему
    if (saved) startRun(Math.max(0, TOPICS.findIndex((t) => t.id === saved.topic)), saved);
  },

  getState() {
    saveRun();
    return saved ? { topic: saved.topic } : null;
  },

  destroy() {
    saveRun();
    stopClock();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('keydown', onKeydown);
    resizeWatch?.disconnect();
    toast?.dispose();
    root?.remove();
    if (globalThis.__subwords) delete globalThis.__subwords;
    api = host = root = ui = toast = run = world = saved = resizeWatch = null;
    bubbles = new Map();
    selected = [];
    board = [];
    queue = [];
    clued = new Set();
    finished = rejecting = modalActive = false;
    screen = 'home';
    mode = 'classic';
    score = 0;
    nextId = 0;
    progress = emptyProgress();
    stats = emptyStats();
    settings = { skin: 'telegram' };
  },
};
