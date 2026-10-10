// Прыгалка вверх — каракуля сама прыгает по платформам на тетрадном листе, игрок ведёт её влево-вправо.
// Правила, генератор и бот — logic.js (без DOM), рисунки «от руки» — art.js, холст — render.js.
// Управление: палец ведёт каракулю (на сколько сдвинул палец, на столько она и едет) или нажатия по краям экрана;
// мышь ведёт без нажатия; клавиши ← → / A D. Незаконченная партия сохраняется (getState) и продолжается с паузы.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { createRenderer } from './render.js';
import {
  W, VIEW_MIN, VIEW_MAX, JUMP_H, START_CAM, FLIGHTS, SHIELD_TIME,
  newGame, step, score, snapshot, restore, createBot, clampView, emptyStats, isValidStats, recordGame,
} from './logic.js';

const SKINS = ['telegram', 'notebook', 'kraft', 'chalk', 'blueprint', 'gel'];
const CONTROLS = ['drag', 'sides'];
const MAX_W = 480;                   // на широком экране лист не растягивается
const DRAG_GAIN = 1.25;              // палец проехал треть экрана — каракуля чуть больше
const MOUSE_V = 1500;                // как быстро каракуля догоняет мышь
const PAUSE_COUNT = 3;               // секунд на готовность после паузы
const RECORD_FROM = 20;              // рекорд ниже — ещё не повод для поздравлений
const HINT_ABOVE = JUMP_H + 58;      // на такой высоте над землёй подсказка каракуле не мешает
// Слабый телефон: если из SLOW_WINDOW кадров подряд больше SLOW_SHARE шли дольше SLOW_FRAME, холст становится на
// ступень грубее (render.js, QUALITY). Только вниз и не чаще, чем раз в окно — туда-сюда качество не скачет.
const SLOW_FRAME = 1 / 42;
const SLOW_WINDOW = 150;
const SLOW_SHARE = 0.35;

const cellsWord = (n) => {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return 'клеток';
  if (last === 1) return 'клетка';
  return last >= 2 && last <= 4 ? 'клетки' : 'клеток';
};
const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const T = {
  title: 'Прыгалка вверх',
  best: (n) => `Рекорд: ${digits(n)}`,
  hint: { drag: 'Веди пальцем влево и вправо', sides: 'Нажимай слева и справа', keys: 'Стрелки ← → или мышь' },
  over: 'Игра окончена',
  cause: { fall: 'Сорвалась вниз', blot: 'Вляпалась в кляксу', two: 'Схватила двойку', hole: 'Затянуло в дырку' },
  result: (n) => `Высота: ${digits(n)} ${cellsWord(n)}`,
  record: 'Новый рекорд!',
  share: (n) => `🟡 Прыгалка вверх: ${digits(n)} ${cellsWord(n)}`,
  pause: 'Пауза',
  resume: 'Продолжить',
  restart: 'Начать заново',
  pauseNote: 'После «Продолжить» — 3 секунды, чтобы приготовиться.',
  height: (n) => `Высота: ${digits(n)} ${cellsWord(n)}`,
  close: 'Закрыть',
  settings: {
    open: 'Настройки', title: 'Настройки', skin: 'Оформление', control: 'Управление пальцем', stats: 'Статистика',
    drag: 'Вести пальцем', sides: 'Нажимать по краям',
    dragNote: 'Каракуля едет туда же, куда палец, — веди им в любом месте экрана.',
    sidesNote: 'Держишь палец слева — едет влево, справа — вправо.',
  },
  skins: { telegram: 'По умолчанию', notebook: 'Тетрадь', kraft: 'Крафт', chalk: 'Доска', blueprint: 'Чертёж', gel: 'Гелевые ручки' },
  stats: { best: 'Рекорд', games: 'Игр', cells: 'Всего клеток', jumps: 'Прыжков', springs: 'Пружинок и ластиков', stomps: 'Раздавлено врагов', flights: 'Полётов' },
  help: {
    open: 'Что есть в игре', title: 'Что есть в игре',
    how: 'Каракуля прыгает сама — ты ведёшь её влево и вправо. Ушла за край листа — выйдет с другой стороны. Упала ниже экрана — игра окончена. Счёт — сколько клеток набрано по высоте.',
    groups: [
      ['Платформы', [
        ['plat-solid', 'Обычная', 'Держит всегда.'],
        ['plat-move', 'Ездит', 'Влево-вправо, по пунктиру.'],
        ['plat-vert', 'Качели', 'Вверх-вниз.'],
        ['plat-once', 'Пунктирная', 'Выдерживает один прыжок и стирается, чуть позже проявляется снова.'],
        ['plat-crumble', 'Карандашная', 'Обманка: ломается под ногами.'],
      ]],
      ['Помощники', [
        ['spring0', 'Пружинка', 'Подбрасывает в два с половиной раза выше.'],
        ['eraser', 'Ластик', 'Батут: ещё выше, с кувырком.'],
        ['plane', 'Самолётик', 'Несёт вверх три секунды.'],
        ['rocket', 'Карандаш-ракета', 'Летит дальше и быстрее.'],
        ['star', 'Звёздочка', '10 секунд кляксы и двойки не страшны.'],
      ]],
      ['Враги', [
        ['blot', 'Клякса', 'Сидит на месте. Сверху её можно раздавить, сбоку и снизу лучше не трогать.'],
        ['two', 'Двойка', 'Ходит туда-сюда. Тоже давится сверху.'],
        ['hole', 'Дырка', 'Затягивает, обходи подальше.'],
      ]],
    ],
  },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
  + `>${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  pause: svgIcon('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', true),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.3 1-1.3 2"/><path d="M12 17.2v.1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>'),
  hand: svgIcon('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 11a1.5 1.5 0 0 1 3 0v3.5c0 3-2 5.5-5 5.5h-1c-2 0-3.2-.8-4.4-2.6L5 13.5a1.5 1.5 0 0 1 2.6-1.5L9 14"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let renderer = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram', control: 'drag' };
let bestAtStart = 0;                 // рекорд на начало партии — его линия на листе
let recordSaid = false;
let finished = false;
let raf = 0;
let lastFrame = 0;
let modalActive = false;
let modalToken = 0;
let countdown = -1;                  // отсчёт после паузы (секунд осталось) или −1
let hinted = false;                  // игрок уже двигал каракулю — подсказка не нужна
let pressed = false;                 // было нажатие (палец, кнопка мыши, клавиша) — можно звучать
let soundOn = true;
let soundAt = 0;
let frames = 0;                      // кадров в окне замера плавности
let slowFrames = 0;                  // из них — медленных
let bot = null;                      // отладка: играет бот
// ввод
let drag = null;                     // { id, x } — палец ведёт
let pendingDx = 0;                   // сколько палец сдвинул каракулю с прошлого кадра (единицы мира)
let side = null;                     // { id, dir } — палец держит край
let mouseX = null;                   // куда показывает мышь (единицы мира) или null
const keys = new Set();
const timers = new Set();
const audio = createAudio(createSounds);

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function sfx(name, opts) {
  if (!soundOn || !pressed) return;  // до первого нажатия молчим: звук без него браузер всё равно не даст
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

const running = () => Boolean(game) && !finished && game.phase === 'play';
/** Каракуля уже ушла со старта: теперь упасть — значит проиграть. */
const climbing = () => running() && game.cam > 0;
const frozen = () => modalActive || document.hidden;

// ---------- кадр ----------

function draw(dt = 0) {
  if (!renderer || !game) return;
  renderer.frame(game, dt, { best: bestAtStart, count: countdown, calm: reducedMotion() });
}

function resize() {
  if (!ui || !renderer) return;
  const box = ui.stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  // лист не шире MAX_W; в низком окне он уже, чтобы по высоте было видно хотя бы VIEW_MIN
  const width = Math.max(120, Math.min(box.width, MAX_W, (box.height * W) / VIEW_MIN));
  const height = Math.min(box.height, (width / W) * VIEW_MAX);
  const viewH = renderer.resize(Math.round(width), Math.round(height));
  if (game) game.viewH = clampView(viewH);
  // подсказка — над головой каракули в верхней точке её прыжка на старте
  const above = (box.height - height) / 2 + (HINT_ABOVE - START_CAM) * renderer.scale;
  ui.hint.style.setProperty('--ju-hint-bottom', `${Math.round(Math.min(above, box.height - 110))}px`);
  draw();
}

function input(dt) {
  if (bot) return { dx: bot(game, dt) };
  let dx = pendingDx;
  pendingDx = 0;
  let dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  if (side) dir = side.dir;
  if (mouseX !== null && !drag && !side && !dir) {
    // мышь над листом — каракуля идёт к ней; за краем листа — едет в ту сторону и выходит с другой
    if (mouseX < 0 || mouseX > W) dir = mouseX < 0 ? -1 : 1;
    else dx += Math.max(-MOUSE_V * dt, Math.min(MOUSE_V * dt, mouseX - game.p.x));
  }
  return { dx, dir };
}

function loop(now) {
  raf = 0;
  if (!ui || !game) return;
  // метка кадра бывает раньше performance.now() из kick() — время не должно идти назад
  const gap = Math.max(0, (now - lastFrame) / 1000);
  const dt = Math.min(1 / 30, gap);
  lastFrame = now;
  if (frozen()) {
    draw();
    return;
  }
  watchPace(gap);
  if (countdown >= 0) {
    const before = Math.ceil(countdown);
    countdown -= dt;
    if (countdown <= 0) {
      countdown = -1;
      sfx('count', { n: 0 });
    } else if (Math.ceil(countdown) < before) sfx('count', { n: Math.ceil(countdown) });
    pendingDx = 0;
    draw();
  } else {
    const events = step(game, dt, input(dt));
    for (const e of events) onEvent(e);
    if (!recordSaid && bestAtStart >= RECORD_FROM && score(game) > bestAtStart && game.phase === 'play') {
      recordSaid = true;
      toast.show(T.record, 1600);
      sfx('record');
      if (!reducedMotion()) renderer.recordBurst(game);
      api.platform.haptic.notification('success');
    }
    draw(dt);
  }
  if (game.phase !== 'over') raf = requestAnimationFrame(loop);
}

function kick() {
  if (!ui || raf) return;
  lastFrame = performance.now();
  frames = slowFrames = 0;
  raf = requestAnimationFrame(loop);
}

/** Плавность: кадры не успевают — рисуем холст грубее (долгие паузы — свёрнутое окно, а не слабый телефон). */
function watchPace(gap) {
  if (gap > 0.25) return;
  frames += 1;
  if (gap > SLOW_FRAME) slowFrames += 1;
  if (frames < SLOW_WINDOW) return;
  if (slowFrames > SLOW_WINDOW * SLOW_SHARE && renderer.lowerQuality()) draw();
  frames = slowFrames = 0;
}

const SOUND_OF = { jump: 'jump', spring: 'spring', eraser: 'eraser', crumble: 'crumble', back: 'back', stomp: 'stomp', bump: 'stomp',
  flyend: 'flyend', shield: 'shield', shieldend: 'shieldend' };

function onEvent(e) {
  renderer.onEvent(e, game);
  const haptic = api.platform.haptic;
  if (e.type === 'jump') {
    // прыжок — раз в секунду: тихо, и не чаще, чем раз в 80 мс (на дрожащей платформе)
    if (game.t - soundAt > 0.08) sfx('jump');
    soundAt = game.t;
    if (e.plat === 'once') later(() => sfx('vanish'), 60);
  } else if (e.type === 'fly') {
    sfx('fly', { kind: e.kind });
    haptic.impact('medium');
  } else if (e.type === 'die') {
    sfx(e.cause === 'fall' ? 'fall' : e.cause === 'hole' ? 'hole' : 'hit');
    haptic.notification('error');
    syncPauseBtn();
  } else if (e.type === 'over') gameOver();
  else if (SOUND_OF[e.type]) {
    sfx(SOUND_OF[e.type]);
    if (e.type === 'spring' || e.type === 'eraser' || e.type === 'stomp') haptic.impact('light');
  }
}

function gameOver() {
  if (finished) return;
  finished = true;
  syncPauseBtn();
  const cells = score(game);
  const isBest = cells > stats.best && cells > 0;
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  ui.sub.textContent = T.best(stats.best);
  const cause = T.cause[game.cause] ?? T.cause.fall;
  later(() => api?.finish({
    outcome: 'lose', title: T.over, score: cells, locale: 'ru',
    message: `${cause}. ${T.result(cells)}${isBest ? ` — ${T.record.toLowerCase()}` : ''}`,
    share: T.share(cells),
  }), reducedMotion() ? 0 : 250);
}

function startGame(saved = null) {
  const seed = Number(new URLSearchParams(location.search).get('juseed')) || Math.floor(Math.random() * 0xffffffff) + 1;
  game = (saved && restore(saved, renderer.viewH)) || newGame({ seed, viewH: renderer.viewH });
  finished = false;
  recordSaid = false;
  countdown = -1;
  pendingDx = 0;
  bestAtStart = stats.best;
  syncPauseBtn();
}

// ---------- ввод ----------

function touched() {
  if (hinted) return;
  hinted = true;
  ui.hint.classList.add('ju-hint-hide');
}

function worldX(e) {
  const box = ui.canvas.getBoundingClientRect();
  return ((e.clientX - box.left) / box.width) * W;
}

function onPointerDown(e) {
  if (modalActive || !game) return;
  if (e.pointerType === 'mouse') {
    if (e.button !== 0) return;
    mouseX = worldX(e);
    touched();
    kick();
    return;
  }
  e.preventDefault();
  try {
    ui.stage.setPointerCapture(e.pointerId);                       // палец может уйти за край листа — ведём дальше
  } catch {
    // касание уже кончилось — вести нечего
  }
  if (settings.control === 'sides') side = { id: e.pointerId, dir: worldX(e) < W / 2 ? -1 : 1 };
  else drag = { id: e.pointerId, x: e.clientX };
  touched();
  kick();
}

function onPointerMove(e) {
  if (!game) return;
  if (e.pointerType === 'mouse') {
    if (modalActive) return;
    mouseX = worldX(e);
    touched();
    return;
  }
  if (drag && e.pointerId === drag.id) {
    pendingDx += ((e.clientX - drag.x) / renderer.scale) * DRAG_GAIN;
    drag.x = e.clientX;
  } else if (side && e.pointerId === side.id) side.dir = worldX(e) < W / 2 ? -1 : 1;
}

function onPointerUp(e) {
  if (drag && e.pointerId === drag.id) drag = null;
  if (side && e.pointerId === side.id) side = null;
}

function onPointerLeave(e) {
  if (e.pointerType === 'mouse') mouseX = null;
}

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', KeyA: 'left', KeyD: 'right' };

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if ((e.key === 'Escape' || e.code === 'KeyP') && !e.repeat && running() && !modalActive) {
    e.preventDefault();
    showPause();
    return;
  }
  const dir = KEYS[e.code];
  if (!dir || modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  keys.add(dir);
  mouseX = null;
  touched();
  kick();
}

function onKeyup(e) {
  const dir = KEYS[e.code];
  if (dir) keys.delete(dir);
}

function dropInput() {
  drag = side = null;
  pendingDx = 0;
  keys.clear();
}

function onVisibility() {
  if (document.hidden) {
    dropInput();
    if (climbing() && !modalActive) showPause();                   // свернул посреди подъёма — пауза, а не падение
  } else kick();
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  dropInput();
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  draw();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  // после паузы и любого окна посреди подъёма — три секунды, чтобы приготовиться
  if (climbing()) countdown = PAUSE_COUNT;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  if (countdown > 0) sfx('count', { n: PAUSE_COUNT });
  kick();
}

function sheet(title, ...children) {
  return el('div', { class: 'ju-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'ju-card-head' },
      el('h2', {}, title),
      el('button', { class: 'ju-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function syncPauseBtn() {
  if (ui?.pauseBtn) ui.pauseBtn.hidden = !running();
}

function showPause() {
  if (!running() || modalActive) return;
  countdown = -1;
  openModal(el('div', { class: 'ju-card ju-pause', role: 'dialog', 'aria-label': T.pause },
    el('h2', {}, T.pause),
    el('p', { class: 'ju-pause-height' }, T.height(score(game))),
    el('p', { class: 'ju-note' }, T.pauseNote),
    el('button', { class: 'btn', onclick: closeModal }, T.resume),
    el('button', {
      class: 'btn btn-secondary',
      onclick: () => {
        // начатая партия в статистику не идёт — как будто её не было
        startGame();
        closeModal();
      },
    }, T.restart),
  ));
}

function showHelp() {
  const item = ([name, title, text]) => el('div', { class: 'ju-help-row' },
    el('span', { class: 'ju-help-pic' }, renderer.icon(name, 46)),
    el('p', {}, el('b', {}, title), ` — ${text.charAt(0).toLowerCase()}${text.slice(1)}`),
  );
  openModal(sheet(T.help.title,
    el('p', { class: 'ju-note' }, T.help.how),
    T.help.groups.flatMap(([title, list]) => [el('h3', { class: 'ju-section' }, title), ...list.map(item)]),
  ));
}

// образец скина: клетка листа, платформа, каракуля и клякса в его цветах
const SWATCH = '<svg viewBox="0 0 78 54" width="78" height="54" aria-hidden="true">'
  + '<rect class="ju-sw-paper" width="78" height="54"/><path class="ju-sw-grid" d="M0 13.5h78M0 27h78M0 40.5h78M13 0v54M26 0v54M39 0v54M52 0v54M65 0v54"/>'
  + '<path class="ju-sw-margin" d="M62 0v54"/><rect class="ju-sw-plat" x="8" y="36" width="34" height="9" rx="4.5"/>'
  + '<circle class="ju-sw-hero" cx="25" cy="23" r="9.5"/><circle class="ju-sw-eye" cx="22" cy="21.5" r="2.6"/><circle class="ju-sw-eye" cx="28.4" cy="21.5" r="2.6"/>'
  + '<path class="ju-sw-blot" d="M49 14c3-4 9-4 12 0 4 0 6 4 4 8 1 4-3 7-7 6-3 3-8 2-9-2-4-1-5-6-2-8-1-2 0-4 2-4Z"/></svg>';

function showSettings() {
  const skins = SKINS.map((id) => {
    const swatch = el('span', { class: 'ju-swatch', 'data-skin': id });
    swatch.innerHTML = SWATCH;
    return el('button', {
      class: 'ju-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
      onclick: () => {
        settings.skin = id;
        host.dataset.skin = id;
        api.storage.set('settings', settings);
        skins.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
        renderer.setSkin();
        draw();
        sfx('click');
      },
    }, swatch, T.skins[id]);
  });
  const note = el('p', { class: 'ju-note' }, T.settings[`${settings.control}Note`]);
  const controls = CONTROLS.map((id) => el('button', {
    class: 'ju-option', role: 'radio', 'aria-checked': String(id === settings.control),
    onclick: () => {
      settings.control = id;
      api.storage.set('settings', settings);
      controls.forEach((b, k) => b.setAttribute('aria-checked', String(CONTROLS[k] === id)));
      note.textContent = T.settings[`${id}Note`];
      renderHint();
      sfx('click');
    },
  }, T.settings[id]));
  openModal(sheet(T.settings.title,
    el('h3', { class: 'ju-section' }, T.settings.skin),
    el('div', { class: 'ju-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'ju-section' }, T.settings.control),
    el('div', { class: 'ju-options', role: 'radiogroup' }, controls),
    note,
    el('h3', { class: 'ju-section' }, T.settings.stats),
    el('dl', { class: 'ju-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, digits(stats[k]))])),
    pointsInfo(api, 'jump-up'),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'ju-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('ju-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

function onPress() {
  pressed = true;
}

function renderHint() {
  const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
  ui.hintText.textContent = mouse ? T.hint.keys : T.hint[settings.control];
}

// ---------- отладка (?judebug) ----------

function debugHooks() {
  globalThis.__jumpUp = {
    get game() { return game; },
    get stats() { return stats; },
    get countdown() { return countdown; },
    get scale() { return renderer.scale; },
    get quality() { return renderer.quality; },
    /** Играет бот (true) или игрок (false). */
    bot(on = true) {
      bot = on ? createBot() : null;
      touched();
      kick();
    },
    /** Новая партия, бот без показа поднимается до высоты cells клеток (не дольше 10 минут игрового времени). */
    climb(cells) {
      startGame();
      const pilot = createBot();
      while (game.phase === 'play' && score(game) < cells && game.t < 600) step(game, 1 / 60, { dx: pilot(game, 1 / 60) });
      touched();
      draw();
      kick();
      return score(game);
    },
    /**
     * Бот без показа играет дальше, пока на экране не окажется нужное: враг ('blot' | 'two' | 'hole'), предмет
     * ('spring' | 'eraser' | 'plane' | 'rocket' | 'star') или платформа ('move' | 'vert' | 'once' | 'crumble').
     */
    seek(what, seconds = 300) {
      const pilot = createBot();
      const seen = (y) => y > game.cam + game.viewH * 0.45 && y < game.cam + game.viewH - 60;
      const found = () => game.foes.some((f) => f.kind === what && f.dead < 0 && seen(f.y))
        || game.plats.some((a) => seen(a.y) && a.gone < 0 && (a.type === what || (a.item?.kind === what && !a.item.taken)));
      const until = game.t + seconds;
      while (game.phase === 'play' && game.t < until && !(found() && !game.p.fly)) step(game, 1 / 60, { dx: pilot(game, 1 / 60) });
      touched();
      draw();
      kick();
      return found();
    },
    /** Дать полёт ('plane' | 'rocket') или щит ('star'). */
    give(kind) {
      if (FLIGHTS[kind]) game.p.fly = { kind, left: FLIGHTS[kind].time };
      else game.p.shield = SHIELD_TIME;
      kick();
    },
    /** Сколько миллисекунд стоит один кадр (среднее по n кадрам): расчёт мира + рисование. */
    cost(n = 120) {
      const pilot = createBot();
      const t0 = performance.now();
      for (let k = 0; k < n && game.phase === 'play'; k++) {
        for (const e of step(game, 1 / 60, { dx: pilot(game, 1 / 60) })) renderer.onEvent(e, game);
        draw(1 / 60);
      }
      return (performance.now() - t0) / n;
    },
    /** Сменить оформление. */
    skin(id) {
      settings.skin = id;
      host.dataset.skin = id;
      renderer.setSkin();
      draw();
    },
    pause: showPause,
    resume: closeModal,
    /** Убрать отсчёт после паузы (для записи ролика). */
    skipCount() {
      countdown = -1;
    },
    restart() {
      startGame();
      kick();
    },
  };
}

export default {
  id: 'jump-up',
  title: 'Прыгалка вверх',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedStats, savedSettings, savedSound] = await Promise.all([
      api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = {
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
      control: CONTROLS.includes(savedSettings?.control) ? savedSettings.control : 'drag',
    };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'ju-sub' }, T.best(stats.best)),
      canvas: el('canvas', { class: 'ju-canvas' }),
      probe: el('span', { class: 'ju-probe' }),
      hintText: el('span', {}),
      modal: el('div', { class: 'ju-modal', hidden: true }),
    };
    const hand = el('span', { class: 'ju-hint-hand' });
    hand.innerHTML = ICONS.hand;
    ui.hint = el('div', { class: 'ju-hint' }, hand, ui.hintText);
    ui.stage = el('div', { class: 'ju-stage' }, ui.canvas, ui.hint);
    ui.pauseBtn = iconButton(ICONS.pause, T.pause, showPause);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    root = el('div', { class: 'ju' },
      el('div', { class: 'ju-header' },
        el('div', { class: 'ju-heading' }, el('div', { class: 'ju-title' }, T.title), ui.sub),
        el('div', { class: 'ju-actions' },
          ui.pauseBtn,
          ui.soundBtn,
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      ui.stage,
      ui.modal,
      ui.probe,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    renderHint();

    renderer = createRenderer({ canvas: ui.canvas, probe: ui.probe });
    ui.resizeObserver = new ResizeObserver(resize);
    ui.resizeObserver.observe(ui.stage);
    resize();
    hinted = false;
    startGame(api.savedState);
    if (new URLSearchParams(location.search).has('judebug')) debugHooks();

    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerUp);
    ui.stage.addEventListener('pointerleave', onPointerLeave);
    // iOS: частые касания не должны приближать страницу
    ui.stage.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    // касание мимо окна закрывает его
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('keyup', onKeyup);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onPress, true);

    // начатая партия ждёт на паузе
    if (score(game) > 0) {
      hinted = true;
      ui.hint.classList.add('ju-hint-hide');
      showPause();
    } else pop(ui.hint, { from: 0.85, duration: 360 });
    draw();
    kick();
  },

  getState() {
    return running() ? snapshot(game) : null;
  },

  destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('keyup', onKeyup);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('keydown', onPress, true);
    ui?.resizeObserver?.disconnect();
    toast?.dispose();
    root?.remove();
    if (globalThis.__jumpUp) delete globalThis.__jumpUp;
    api = host = root = ui = toast = renderer = game = bot = drag = side = mouseX = null;
    stats = emptyStats();
    settings = { skin: 'telegram', control: 'drag' };
    bestAtStart = 0;
    recordSaid = finished = modalActive = hinted = pressed = false;
    countdown = -1;
    pendingDx = 0;
    soundAt = 0;
    frames = slowFrames = 0;
    keys.clear();
  },
};
