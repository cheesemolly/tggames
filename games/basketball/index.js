// Баскетбол — мяч лежит в корзине; оттягиваешь его, как рогатку, отпускаешь — он летит в следующую корзину.
// Правила, физика, генератор корзин и бот — logic.js (без DOM), рисунки стен и мячей — art.js, холст — render.js.
// Управление: палец или мышь — нажал где угодно, потянул назад, отпустил. Незаконченная партия сохраняется
// (getState) и продолжается с того же места.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { createRenderer } from './render.js';
import {
  W, VIEW_MIN, VIEW_MAX, PULL_MAX, FIRE_AT, BLUE_AT, CLEAN_MAX,
  newGame, step, aim, shoot, preview, aimTime, solve, snapshot, restore, emptyStats, isValidStats, recordGame,
} from './logic.js';

const SKINS = ['telegram', 'yard', 'arena', 'night', 'beach', 'space'];
const MAX_W = 480;                   // на широком экране стена не растягивается
const PULL_PX = 140;                 // оттянул на столько пикселей — бросок в полную силу
const DOT_EVERY = 0.05;              // точки пунктира — через столько секунд полёта
const RECORD_FROM = 5;               // рекорд ниже — ещё не повод для поздравлений
const BOT_PULL = 0.62;               // бот: сколько секунд «тянет» мяч перед броском
const BOT_REST = 0.5;                // …и сколько ждёт, пока мяч уляжется
// Слабый телефон: если из SLOW_WINDOW кадров подряд больше SLOW_SHARE шли дольше SLOW_FRAME, холст становится на
// ступень грубее (render.js, QUALITY). Только вниз и не чаще, чем раз в окно — туда-сюда качество не скачет.
const SLOW_FRAME = 1 / 42;
const SLOW_WINDOW = 150;
const SLOW_SHARE = 0.35;

const plural = (n, one, few, many) => {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
};
const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const T = {
  title: 'Баскетбол',
  best: (n) => `Рекорд: ${digits(n)}`,
  hint: { touch: 'Потяни назад и отпусти', mouse: 'Зажми, потяни назад и отпусти' },
  over: 'Игра окончена',
  result: (made, clean) => `Мимо. Корзин: ${digits(made)}, чистых: ${digits(clean)}.`,
  record: 'Новый рекорд!',
  share: (n) => `🏀 Баскетбол: ${digits(n)} ${plural(n, 'очко', 'очка', 'очков')}`,
  resumed: (n) => `Продолжаем — счёт ${digits(n)}`,
  pause: 'Пауза',
  resume: 'Продолжить',
  restart: 'Начать заново',
  score: (n) => `Счёт: ${digits(n)}`,
  close: 'Закрыть',
  pop: {
    clean: 'Чисто!', cleanN: (n) => `Чисто ×${n}`, bank: 'От стены ×2', fire: 'В огне!', blue: 'Синее пламя!',
  },
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Площадка', stats: 'Статистика' },
  skins: { telegram: 'По умолчанию', yard: 'Двор', arena: 'Арена', night: 'Ночь', beach: 'Пляж', space: 'Космос' },
  stats: {
    best: 'Рекорд', games: 'Игр', baskets: 'Забито корзин', clean: 'Чистых попаданий', streak: 'Лучшая серия чистых',
    banks: 'С отскоком от стены', fires: 'Мяч загорался',
  },
  help: {
    open: 'Как играть', title: 'Как играть',
    how: 'Мяч лежит в корзине. Нажми где угодно, потяни назад, как рогатку, и отпусти — мяч полетит в другую сторону. Пунктир показывает начало полёта. Мяч должен упасть в следующую корзину сверху; улетел вниз — игра окончена.',
    rows: [
      ['clean', 'Чисто', `Мяч не задел кольцо — 2 очка вместо одного, а за каждое следующее чистое подряд — ещё на очко больше, до ${CLEAN_MAX}.`],
      ['fire', 'В огне', `${FIRE_AT} чистых подряд — мяч загорается, ${BLUE_AT} — горит синим. Задел кольцо — огонь гаснет, серия начинается заново.`],
      ['bank', 'От стены', 'Попал с отскоком от стены — очки за бросок удваиваются.'],
      ['move', 'Корзины', 'Чем дальше, тем чаще они ездят и стоят с наклоном, а пунктир становится короче.'],
      ['back', 'Обратно в свою', 'Мяч упал назад в свою корзину — не страшно, бросай ещё раз. Но серия чистых сбрасывается.'],
    ],
  },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
  + `>${body}</svg>`;
const ICONS = {
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.5c-.9.5-1.3 1-1.3 2"/><path d="M12 17.2v.1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>'),
  hand: svgIcon('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 11a1.5 1.5 0 0 1 3 0v3.5c0 3-2 5.5-5 5.5h-1c-2 0-3.2-.8-4.4-2.6L5 13.5a1.5 1.5 0 0 1 2.6-1.5L9 14"/>'),
};

// картинки к правилам: мяч, кольцо и то, о чём строка (цвета — из скина)
const RING = '<ellipse class="bk-pic-rim" cx="24" cy="27" rx="13" ry="3.6"/><path class="bk-pic-net" d="M12 28l4 11h16l4-11M18 29l2 10M24 30v9M30 29l-2 10"/>';
const HELP_PICS = {
  clean: `${RING}<circle class="bk-pic-ball" cx="24" cy="13" r="7"/><path class="bk-pic-line" d="M24 21v3"/>`,
  fire: '<path class="bk-pic-fire" d="M24 4c1 6 9 9 9 19a9 9 0 0 1-18 0c0-4 2-6 3-9 2 2 3 3 3 5 2-4 2-9 3-15Z"/><circle class="bk-pic-ball" cx="24" cy="26" r="8"/>',
  bank: '<path class="bk-pic-wall" d="M41 4v38"/><path class="bk-pic-line" d="M9 34C17 14 30 10 39 18M39 18c-5 3-8 8-9 14"/><circle class="bk-pic-ball" cx="29" cy="35" r="6"/>',
  move: `${RING}<path class="bk-pic-line" d="M4 14h40M4 14l5-4M4 14l5 4M44 14l-5-4M44 14l-5 4"/>`,
  back: `${RING}<circle class="bk-pic-ball" cx="24" cy="12" r="6"/><path class="bk-pic-line" d="M34 22c4-7 2-14-4-17M30 5l1 5M30 5l5-1"/>`,
};
const helpPic = (name) => `<svg viewBox="0 0 48 46" width="48" height="46" aria-hidden="true">${HELP_PICS[name]}</svg>`;

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let renderer = null;
let game = null;
let stats = emptyStats();
let settings = { skin: 'telegram' };
let bestAtStart = 0;                 // рекорд на начало партии
let recordSaid = false;
let finished = false;
let raf = 0;
let lastFrame = 0;
let modalActive = false;
let modalToken = 0;
let hinted = false;                  // игрок уже бросал — подсказка не нужна
let pressed = false;                 // было нажатие (палец, кнопка мыши, клавиша) — можно звучать
let soundOn = true;
let rimAt = 0;                       // когда в последний раз звенела дужка (частые удары прореживаются)
let pullStep = 0;                    // на какой «ступеньке» натяжения скрипнуло в последний раз
let frames = 0;                      // кадров в окне замера плавности
let slowFrames = 0;                  // из них — медленных
// ввод
let grab = null;                     // { id, x0, y0, x, y, live } — палец на экране; live — мяч уже можно тянуть
let pull = null;                     // { px, py } — натяжение в единицах игры (y вверх)
let auto = null;                     // отладка: играет бот — { rest, plan }
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

const running = () => Boolean(game) && !finished && game.phase !== 'over';
const frozen = () => modalActive || document.hidden;

// ---------- кадр ----------

/** Бросок, который даёт натяжение под пальцем (или у бота), и его пунктир. */
function aimNow() {
  if (!pull || !game || game.phase !== 'aim') return null;
  const a = aim(pull.px, pull.py);
  if (!a) return null;
  // точки бегут вдоль дуги — видно, куда полетит
  const shift = reducedMotion() ? 1 : 1 - ((renderer.wave * 1.3) % 1);
  a.dots = preview(game, a.vx, a.vy, aimTime(game.made), DOT_EVERY, DOT_EVERY * shift);
  return a;
}

function draw(dt = 0) {
  if (!renderer || !game) return;
  renderer.frame(game, dt, { pull, aim: aimNow(), calm: reducedMotion() });
}

function resize() {
  if (!ui || !renderer) return;
  const box = ui.stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  // стена не шире MAX_W; в низком окне она уже, чтобы по высоте было видно хотя бы VIEW_MIN
  const width = Math.max(120, Math.min(box.width, MAX_W, (box.height * W) / VIEW_MIN));
  const height = Math.min(box.height, (width / W) * VIEW_MAX);
  renderer.resize(Math.round(width), Math.round(height));
  draw();
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
  if (grab && !grab.live && game.phase === 'aim') {
    // палец уже лежал на экране, когда мяч упал в корзину, — тянуть можно с этого места
    Object.assign(grab, { x0: grab.x, y0: grab.y, live: true });
  }
  let left = dt;
  if (auto) left = botPlay(dt);
  for (const e of step(game, left)) onEvent(e);
  if (!recordSaid && bestAtStart >= RECORD_FROM && game.score > bestAtStart) {
    recordSaid = true;
    toast.show(T.record, 1600);
    sfx('record');
    if (!reducedMotion()) renderer.recordBurst();
    api.platform.haptic.notification('success');
  }
  draw(dt);
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

/** Что написать над корзиной после попадания. */
function popText(e) {
  let note = null;
  if (e.heat === 3 && e.was < 3) note = T.pop.blue;
  else if (e.heat === 2 && e.was < 2) note = T.pop.fire;
  else if (e.clean) note = e.streak > 1 ? T.pop.cleanN(e.streak) : T.pop.clean;
  if (e.bank) note = note ? `${note} · ${T.pop.bank.toLowerCase()}` : T.pop.bank;
  return { main: `+${e.pts}`, note };
}

function onEvent(e) {
  const haptic = api.platform.haptic;
  if (e.type === 'score') {
    renderer.onEvent(e, game, popText(e));
    if (e.clean) sfx('swish', { n: e.streak });
    else sfx('score');
    if (e.bank) later(() => sfx('bank'), 90);
    if (e.heat === 3 && e.was < 3) later(() => sfx('blue'), 120);
    else if (e.heat === 2 && e.was < 2) later(() => sfx('ignite'), 120);
    else if (e.was >= 2 && e.heat < 2) later(() => sfx('fizzle'), 60);
    if (e.heat >= 2 && e.was < e.heat) haptic.notification('success');
    else haptic.impact(e.clean ? 'medium' : 'light');
    return;
  }
  renderer.onEvent(e, game);
  if (e.type === 'rim') {
    // дужка звенит не чаще, чем раз в 70 мс, и только от заметного удара
    if (e.v > 60 && game.t - rimAt > 0.07) {
      sfx('rim', { v: e.v });
      rimAt = game.t;
      if (e.v > 260) haptic.impact('light');
    }
  } else if (e.type === 'wall') {
    if (e.v > 60) sfx('wall', { v: e.v });
  } else if (e.type === 'net') {
    if (e.v > 80 && game.t - rimAt > 0.07) {
      sfx('net');
      rimAt = game.t;
    }
  } else if (e.type === 'back') {
    sfx('back');
    if (e.was >= 2) later(() => sfx('fizzle'), 60);
    haptic.impact('light');
  } else if (e.type === 'miss') {
    sfx('miss');
    if (e.was >= 2) sfx('fizzle');
    haptic.notification('error');
  } else if (e.type === 'over') gameOver();
}

function gameOver() {
  if (finished) return;
  finished = true;
  const points = game.score;
  const isBest = points > stats.best && points > 0;
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  ui.sub.textContent = T.best(stats.best);
  later(() => api?.finish({
    outcome: 'lose', title: T.over, score: points, locale: 'ru',
    message: `${T.result(game.made, game.run.clean)}${isBest ? ` ${T.record}` : ''}`,
    share: T.share(points),
  }), reducedMotion() ? 0 : 300);
}

function startGame(saved = null) {
  const seed = Number(new URLSearchParams(location.search).get('bkseed')) || Math.floor(Math.random() * 0xffffffff) + 1;
  game = (saved && restore(saved)) || newGame({ seed });
  finished = false;
  recordSaid = false;
  grab = pull = null;
  pullStep = 0;
  rimAt = 0;
  if (auto) auto = { rest: 0, plan: null };
  bestAtStart = stats.best;
}

// ---------- ввод ----------

function hideHint() {
  if (hinted) return;
  hinted = true;
  ui.hint.classList.add('bk-hint-hide');
}

/** Натяжение по тому, куда ушёл палец от места нажатия (экранный y — вниз, в игре — вверх). */
function pullOf(g) {
  return { px: ((g.x - g.x0) / PULL_PX) * PULL_MAX, py: (-(g.y - g.y0) / PULL_PX) * PULL_MAX };
}

function throwBall(a) {
  const events = shoot(game, a.vx, a.vy);
  if (!events) return false;
  hideHint();
  for (const e of events) {
    renderer.onEvent(e, game);
    sfx('shoot', { power: e.power });
  }
  api.platform.haptic.impact('light');
  pullStep = 0;
  return true;
}

function onPointerDown(e) {
  if (modalActive || !game || auto || grab) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  try {
    ui.stage.setPointerCapture(e.pointerId);                       // палец может уйти за край стены — тянем дальше
  } catch {
    // касание уже кончилось — тянуть нечего
  }
  grab = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, live: game.phase === 'aim' };
  pull = grab.live ? { px: 0, py: 0 } : null;
  kick();
}

function onPointerMove(e) {
  if (!grab || e.pointerId !== grab.id) return;
  grab.x = e.clientX;
  grab.y = e.clientY;
  if (!grab.live || !game || game.phase !== 'aim') return;
  pull = pullOf(grab);
  // сетка «скрипит», пока её тянут: по щелчку на каждую шестую часть силы
  const a = aim(pull.px, pull.py);
  const notch = a ? 1 + Math.floor(a.power * 6) : 0;
  if (notch !== pullStep) {
    if (notch > pullStep) sfx('pull', { power: a.power });
    if (a && notch !== pullStep) api.platform.haptic.selection();
    pullStep = notch;
  }
}

function onPointerUp(e) {
  if (!grab || e.pointerId !== grab.id) return;
  const g = grab;
  grab = null;
  if (g.live && game?.phase === 'aim' && e.type === 'pointerup' && !modalActive) {
    const p = pullOf({ ...g, x: e.clientX, y: e.clientY });
    const a = aim(p.px, p.py);
    if (a) throwBall(a);
  }
  pull = null;
  pullStep = 0;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) closeModal();
}

function dropInput() {
  grab = pull = null;
  pullStep = 0;
}

function onVisibility() {
  if (document.hidden) dropInput();
  else kick();
}

// ---------- бот (отладка и запись ролика) ----------

/**
 * Бот: ждёт, пока мяч уляжется, «тянет» его BOT_PULL секунд и отпускает ровно в тот миг, под который считал
 * бросок (корзина ездит). Возвращает, сколько времени шага осталось после броска.
 */
function botPlay(dt) {
  if (game.phase !== 'aim') {
    auto.rest = 0;
    auto.plan = null;
    pull = null;
    return dt;
  }
  if (!auto.plan) {
    auto.rest += dt;
    if (auto.rest < BOT_REST) return dt;
    // бросок считается под то место, где корзина будет, когда бот дотянет
    const ahead = JSON.parse(JSON.stringify(game));
    step(ahead, BOT_PULL);
    const shot = solve(ahead);
    if (!shot) return dt;
    auto.plan = { at: game.t + BOT_PULL, shot };
  }
  const { at, shot } = auto.plan;
  if (game.t + dt < at) {
    const u = 1 - (at - game.t - dt) / BOT_PULL;
    const ease = 1 - (1 - Math.min(1, u * 1.35)) ** 3;               // тянет быстро, под конец замирает и целится
    pull = { px: shot.px * ease, py: shot.py * ease };
    return dt;
  }
  const before = Math.max(0, at - game.t);
  for (const e of step(game, before)) onEvent(e);
  pull = null;
  auto.plan = null;
  auto.rest = 0;
  throwBall(shot);
  return dt - before;
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
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  kick();
}

function sheet(title, ...children) {
  return el('div', { class: 'bk-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bk-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bk-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Партию оставили, пока мяч летел: она ждёт на паузе, чтобы бросок доигрался на глазах. */
function showPause() {
  openModal(el('div', { class: 'bk-card bk-pause', role: 'dialog', 'aria-label': T.pause },
    el('h2', {}, T.pause),
    el('p', { class: 'bk-pause-score' }, T.score(game.score)),
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
  const row = ([pic, title, text]) => {
    const art = el('span', { class: 'bk-help-pic' });
    art.innerHTML = helpPic(pic);
    return el('div', { class: 'bk-help-row' }, art, el('p', {}, el('b', {}, title), ` — ${text.charAt(0).toLowerCase()}${text.slice(1)}`));
  };
  openModal(sheet(T.help.title, el('p', { class: 'bk-note' }, T.help.how), T.help.rows.map(row)));
}

// образец площадки: её небо (фоном), светило, силуэты, кольцо с сеткой и мяч в её цветах
const SWATCH = '<svg viewBox="0 0 78 54" width="78" height="54" aria-hidden="true">'
  + '<circle class="bk-sw-orb" cx="58" cy="15" r="6.5"/>'
  + '<path class="bk-sw-far" d="M0 54V38h9v-7h8v10h6V27h10v14h7v-9h9v12h8V34h9v8h12v12Z"/>'
  + '<path class="bk-sw-near" d="M0 54v-8h12v-6h9v9h14v-5h10v7h13v-9h8v6h12v6Z"/>'
  + '<path class="bk-sw-net" d="M31 27l4 14h13l4-14M36.5 28l2 13M41.5 29v12M46.5 28l-2 13"/>'
  + '<ellipse class="bk-sw-rim" cx="41.5" cy="26" rx="13" ry="3.6"/>'
  + '<circle class="bk-sw-ball" cx="19" cy="14" r="8"/><path class="bk-sw-seam" d="M11 14h16M19 6c2 5 2 11 0 16"/></svg>';

function showSettings() {
  const skins = SKINS.map((id) => {
    const swatch = el('span', { class: 'bk-swatch', 'data-skin': id });
    swatch.innerHTML = SWATCH;
    return el('button', {
      class: 'bk-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
      onclick: () => {
        setSkin(id);
        api.storage.set('settings', settings);
        skins.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
        sfx('click');
      },
    }, swatch, T.skins[id]);
  });
  openModal(sheet(T.settings.title,
    el('h3', { class: 'bk-section' }, T.settings.skin),
    el('div', { class: 'bk-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'bk-section' }, T.settings.stats),
    el('dl', { class: 'bk-totals' }, Object.keys(T.stats).flatMap((k) => [el('dt', {}, T.stats[k]), el('dd', {}, digits(stats[k]))])),
    pointsInfo(api, 'basketball'),
  ));
}

function setSkin(id) {
  settings.skin = id;
  host.dataset.skin = id;
  renderer.setSkin(id);
  draw();
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bk-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('bk-muted', !soundOn);
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

// ---------- отладка (?bkdebug) ----------

function debugHooks() {
  globalThis.__basketball = {
    get game() { return game; },
    get stats() { return stats; },
    get scale() { return renderer.scale; },
    get viewH() { return renderer.viewH; },
    get view() { return renderer.view; },
    get quality() { return renderer.quality; },
    get pull() { return pull; },
    /** Играет бот (true) или игрок (false). */
    bot(on = true) {
      auto = on ? { rest: 0, plan: null } : null;
      pull = grab = null;
      if (on) hideHint();
      kick();
    },
    /** Надёжный бросок из нынешнего положения: { vx, vy, px, py, clean } — px, py в единицах натяжения. */
    shot: () => solve(game),
    /** Натяжение в пикселях экрана для броска shot (куда вести палец от места нажатия). */
    drag: (shot) => ({ dx: (shot.px / PULL_MAX) * PULL_PX, dy: (-shot.py / PULL_MAX) * PULL_PX }),
    /** Бросить со скоростью (vx, vy). */
    fire: (vx, vy) => {
      const ok = throwBall({ vx, vy });
      kick();
      return ok;
    },
    /** Бот без показа забивает n корзин (партия идёт дальше с того места). */
    skip(n = 10) {
      const goal = game.made + n;
      while (game.phase !== 'over' && game.made < goal) {
        if (game.phase === 'aim') {
          const shot = solve(game, { careful: false });
          if (!shot || !shoot(game, shot.vx, shot.vy)) break;
        }
        step(game, 1 / 120);
      }
      hideHint();
      draw();
      kick();
      return game.made;
    },
    /** Поставить серию чистых (2 — дымится, 3 — горит, 7 — синее пламя). */
    streak(n) {
      game.streak = n;
      game.run.streak = Math.max(game.run.streak, n);
      kick();
    },
    /** Сколько миллисекунд стоит один кадр (среднее по n кадрам): расчёт мира + рисование. */
    cost(n = 120) {
      const t0 = performance.now();
      for (let k = 0; k < n && game.phase !== 'over'; k++) {
        for (const e of step(game, 1 / 60)) renderer.onEvent(e, game);
        draw(1 / 60);
      }
      return (performance.now() - t0) / n;
    },
    skin: setSkin,
    restart() {
      startGame();
      kick();
    },
  };
}

export default {
  id: 'basketball',
  title: 'Баскетбол',

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
    settings = { skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram' };
    host.dataset.skin = settings.skin;

    ui = {
      sub: el('div', { class: 'bk-sub' }, T.best(stats.best)),
      canvas: el('canvas', { class: 'bk-canvas' }),
      probe: el('span', { class: 'bk-probe' }),
      hintText: el('span', {}, matchMedia('(hover: hover) and (pointer: fine)').matches ? T.hint.mouse : T.hint.touch),
      modal: el('div', { class: 'bk-modal', hidden: true }),
    };
    const hand = el('span', { class: 'bk-hint-hand' });
    hand.innerHTML = ICONS.hand;
    ui.hint = el('div', { class: 'bk-hint' }, hand, ui.hintText);
    ui.stage = el('div', { class: 'bk-stage' }, ui.canvas, ui.hint);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);
    root = el('div', { class: 'bk' },
      el('div', { class: 'bk-header' },
        el('div', { class: 'bk-heading' }, el('div', { class: 'bk-title' }, T.title), ui.sub),
        el('div', { class: 'bk-actions' },
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

    renderer = createRenderer({ canvas: ui.canvas, probe: ui.probe });
    renderer.setSkin(settings.skin);
    ui.resizeObserver = new ResizeObserver(resize);
    ui.resizeObserver.observe(ui.stage);
    resize();
    hinted = false;
    startGame(api.savedState);
    if (new URLSearchParams(location.search).has('bkdebug')) debugHooks();

    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerUp);
    // iOS: частые касания не должны приближать страницу
    ui.stage.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    // касание мимо окна закрывает его
    ui.modal.addEventListener('click', (e) => {
      if (e.target === ui.modal) closeModal();
    });
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onPress, true);

    if (game.shots > 0) {
      // начатая партия: подсказка уже не нужна; мяч в полёте ждёт на паузе
      hinted = true;
      ui.hint.classList.add('bk-hint-hide');
      if (game.phase === 'aim') toast.show(T.resumed(game.score), 1800);
      else showPause();
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
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('keydown', onPress, true);
    ui?.resizeObserver?.disconnect();
    toast?.dispose();
    root?.remove();
    if (globalThis.__basketball) delete globalThis.__basketball;
    api = host = root = ui = toast = renderer = game = grab = pull = auto = null;
    stats = emptyStats();
    settings = { skin: 'telegram' };
    bestAtStart = 0;
    recordSaid = finished = modalActive = hinted = pressed = false;
    rimAt = 0;
    pullStep = 0;
    frames = slowFrames = 0;
  },
};
