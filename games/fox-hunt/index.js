// Лисья охота — альбомная игра на двух джойстиках: лиса бегает по закрытым комнатам, рывком ловит кроликов и бьёт
// врагов, уходит от красных зон, собирает вещи; три жизни, локации идут одна за другой, пока жизни не кончатся.
//
// Этот файл — «клей» модуля: каркас страницы, цикл кадров, хранилище, звук с музыкой и жизненный цикл. Всё остальное
// живёт в своих файлах: расчёт — logic.js (без DOM, шаг строго 1/60 с), холст — render.js, окна и надписи поверх
// поля — ui.js, джойстики, мышь и клавиши — input.js, звуки и музыка — sounds.js.
//
// Кадр: время копится, и расчёт делает столько шагов по 1/60 с, сколько накопилось (не больше четырёх: иначе
// медленный телефон не догнал бы сам себя), а рендер рисует между шагами плавно (alpha). Расчёт стоит, пока открыто
// окно, игрок выбирает дар, страница скрыта или партия окончена, — музыка тогда молчит.
// На экране, кроме кнопки паузы, ничего нет: выход, рюкзак, настройки и статистика — в окне паузы (ui.js). «Назад»
// тоже ведёт в паузу (onBack), а не из игры: случайно выйти нельзя. Незаконченная партия сохраняется (getState) и
// продолжается с паузы.

import { el } from '../../shared/dom.js';
import { reducedMotion } from '../../shared/motion.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { createRenderer } from './render.js';
import { createUi } from './ui.js';
import { createInput } from './input.js';
import { createFullscreen, isDesktop, desktopFacts, readFullscreen } from './fullscreen.js';
import { F_WALK, F_LEAP, emit, kindOf } from './core.js';
import { BASE, DASH } from './balance.js';
import { SIDES, DIR, dangerAt, escapeDir, fieldTo, fieldDir, castRay, entryPoint } from './world.js';
import {
  H, newRun, restore, snapshot, step, drain, runSummary, emptyStats, isValidStats, applyRun,
  equip, unequip, dropItem, usePotion, chooseGift, cheat,
} from './logic.js';

const MAX_STEPS = 4;                 // шагов расчёта за кадр — не больше
const MAX_GAP = 0.1;                 // с: кадр дольше — это заминка, а не игровое время
const OVER_DELAY = 900;              // мс: лиса упала — и только потом карточка итога
const HAPTIC_GAP = 100;              // мс: отклики телефона — не чаще
const GIFT_PATIENCE = 3000;          // мс: дар ждёт выбора, а окна всё нет — напомнить окнам ещё раз
const SEEN_MAX = 400;                // больше вещей в «коллекции» не бывает
const HINTS_MAX = 40;
const HINT_ID = /^[a-z0-9-]{1,24}$/;
const FAULTS_SHOWN = 5;              // столько сбойных кадров попадёт в консоль — дальше молча
// Слабый телефон: если из SLOW_WINDOW кадров подряд больше SLOW_SHARE шли дольше SLOW_FRAME, холст становится на
// ступень грубее (render.js, QUALITY). Только вниз и не чаще, чем раз в окно — туда-сюда качество не скачет.
const SLOW_FRAME = 1 / 42;
const SLOW_WINDOW = 150;
const SLOW_SHARE = 0.35;
// отклики телефона по важности: в одну «щель» HAPTIC_GAP проходит только тот, что важнее прошлого
const HAPTIC_RANK = { light: 1, medium: 2, heavy: 3, warning: 4, success: 4, error: 5 };

const plural = (n, one, few, many) => {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
};
const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// свои строки — только для карточки итога: всё, что на экране игры, пишет ui.js
const T = {
  over: 'Охота окончена',
  result: (floor, rabbits) => `Локация ${floor} · кроликов: ${digits(rabbits)}`,
  record: 'новый рекорд',
  share: (score, floor) => `🦊 Лисья охота: ${digits(score)} ${plural(score, 'очко', 'очка', 'очков')} · локация ${floor}`,
};

const param = (name) => new URLSearchParams(location.search).get(name);

let api = null;
let root = null;
let dom = null;                      // { stage, canvas, sticks, probe, observer, offScreen }
let renderer = null;
let input = null;
let fs = null;                       // полный экран — только на компьютере, иначе null
let lockWant = false;                // что последний раз сказано input.setLock
let autoTries = 0;                   // сколько раз полный экран «по умолчанию» уже не дали
let armed = null;                    // ждём первого нажатия, чтобы вернуть полный экран из сохранения
let ui = null;
let G = null;                        // идущая партия — состояние расчёта
let stats = emptyStats();
let settings = readSettings(null);
let seen = [];                       // id вещей, встреченных за все партии, — «коллекция»
let soundOn = true;
let pressed = false;                 // было нажатие (палец, кнопка мыши, клавиша) — можно звучать
let mood = null;                     // какая музыка сейчас заказана (null — тишина)
let finished = false;                // партия окончена: расчёт стоит, идёт последняя анимация
let handed = false;                  // итог уже отдан оболочке
let record = false;                  // эта партия побила рекорд
let raf = 0;
let lastFrame = 0;
let acc = 0;                         // время, которое расчёт ещё не прошёл
let cold = false;                    // прошлым кадром расчёт стоял
let dirty = false;                   // пока расчёт стоит, кадр рисуется только по делу — вот оно
let offered = null;                  // выбор дара (G.pending), о котором окнам уже сказано
let offeredAt = 0;
let sizeW = 0;                       // размер сцены, под который настроен холст
let sizeH = 0;
let box = null;                      // ?fhbox=ШxВ — поле ровно такого размера (запись ролика)
let buzzAt = 0;
let buzzRank = 0;
let frames = 0;                      // кадров в окне замера плавности
let slowFrames = 0;                  // из них — медленных
let faults = 0;
let bot = null;                      // отладка: играет автомат
const timers = new Set();
const audio = createAudio(createSounds);
// что рендер получает каждый кадр — один и тот же объект
const view = { alpha: 0, calm: false, input: null };
// ввод для второго и следующих шагов кадра
const held = { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 };

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

/** Музыка места ('forest' … 'boss') или тишина (null). То же самое второй раз — ничего не делает. */
function music(next) {
  if (next === mood || (next && !pressed)) return;
  mood = next;
  try {
    audio.get()?.music(next);
  } catch (err) {
    console.warn('музыка', err);
  }
}

const running = () => Boolean(G) && !finished;
/** Расчёт стоит: открыто окно, выбирается дар, страница скрыта или партия окончена. */
const frozen = () => finished || Boolean(G.pending) || document.hidden || ui.isOpen;

// ---------- настройки и коллекция ----------

/** Настройки собираются по полям: чего в сохранённом нет или что в нём не то — берётся по умолчанию. */
function readSettings(v) {
  const hints = {};
  const src = v?.hints;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    let n = 0;
    for (const id of Object.keys(src)) {
      if (src[id] === true && HINT_ID.test(id) && n < HINTS_MAX) {
        hints[id] = true;
        n += 1;
      }
    }
  }
  // джойстики: нет поля (старое сохранение) или что-то не то — «статичные»
  return { lefty: v?.lefty === true, flip: v?.flip === true, music: v?.music !== false, stick: v?.stick === 'float' ? 'float' : 'static', weaponBtn: v?.weaponBtn === true, fullscreen: readFullscreen(v), hints };
}

/** Сохранённая «коллекция»: только строки, без повторов и не длиннее положенного. */
function readSeen(v) {
  const out = [];
  if (!Array.isArray(v)) return out;
  for (const id of v) {
    if (typeof id === 'string' && id && id.length <= 40 && out.length < SEEN_MAX && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Вещи встречены: новые — в «коллекцию», и сразу в хранилище (стирать этот ключ нельзя — он сливается как множество). */
function sawItems(ids) {
  let grew = false;
  for (const id of ids) {
    if (typeof id !== 'string' || !id || id.length > 40 || seen.length >= SEEN_MAX || seen.includes(id)) continue;
    seen.push(id);
    grew = true;
  }
  if (grew) api.storage.set('seen', seen);
}

function setOption(key, value) {
  if (!api || typeof key !== 'string') return;
  const on = Boolean(value);
  if (key === 'sound') {
    soundOn = on;
    api.storage.set('sound', soundOn);
    return;
  }
  if (key === 'lefty') {
    settings.lefty = on;
    input?.setLefty(on);
  } else if (key === 'flip') {
    settings.flip = on;
    api.screen?.flip(on);
  } else if (key === 'music') settings.music = on;
  else if (key === 'stick') {
    // здесь не логический переключатель: on — «плавающие»
    settings.stick = on ? 'float' : 'static';
    input?.setStick(settings.stick);
  }
  else if (key === 'weaponBtn') {
    settings.weaponBtn = on;
    input?.setWeaponBtn(on);
  }
  else if (key === 'fullscreen') {
    if (!fs) return;                 // не компьютер: ничего не меняем
    settings.fullscreen = on;
    if (on) enterFullscreen();       // это нажатие переключателя — браузер разрешает
    else {
      fs.leave();
      syncLock(true);
    }
  }
  else if (key.startsWith('hint:') && HINT_ID.test(key.slice(5))) {
    // подсказка показана (true) — больше не нужна; false — показать снова
    if (on && Object.keys(settings.hints).length < HINTS_MAX) settings.hints[key.slice(5)] = true;
    else delete settings.hints[key.slice(5)];
  } else return;
  api.storage.set('settings', settings);
}

// ---------- полный экран и захват курсора (только компьютер) ----------

/** Включить полный экран. Отказ — тихо: переключатель возвращается в «выключено», игра как раньше. */
function enterFullscreen(auto = false) {
  const promise = fs.enter();
  promise.then((ok) => {
    if (!fs || !api) return;
    if (ok) syncLock(true);
    else if (auto) {
      // по умолчанию включено, а браузер сам по себе не даёт: не выключаем — пробуем на следующем нажатии (до трёх раз)
      autoTries += 1;
      if (autoTries < 3) armFullscreen();
    } else if (settings.fullscreen) {
      settings.fullscreen = false;
      api.storage.set('settings', settings);
      ui?.refreshSettings();
    }
  });
}

/** Курсор держим пойманным, пока открыт полный экран и идёт игра; любое окно или выбор дара — отпускаем. */
function wantLock() {
  return Boolean(fs?.active) && settings.fullscreen && running() && !ui?.isOpen && !G.pending && !document.hidden;
}

/** Сказать вводу, ловить ли курсор. Только при смене (fresh — всегда и с забытыми отказами). */
function syncLock(fresh = false) {
  if (!input) return;
  const want = wantLock();
  if (want === lockWant && !fresh) return;
  lockWant = want;
  input.setLock(want, fresh);
}

/** Полный экран кончился не по нашей воле (Esc без захвата клавиши, жест браузера): пауза, переключатель «выключено». */
function onFullscreenLost() {
  if (!api || !settings.fullscreen) return;
  settings.fullscreen = false;
  api.storage.set('settings', settings);
  syncLock(true);
  if (ui && running() && !ui.isOpen && !G.pending) ui.openPause(false);
  ui?.refreshSettings();
  dirty = true;
  kick();
}

/** Полный экран (по умолчанию он включён) нельзя включить без нажатия: ждём первого и пробуем (Esc не считается). */
function armFullscreen() {
  if (!fs || !settings.fullscreen) return;
  const go = (e) => {
    if (e.type === 'keydown' && e.code === 'Escape') return;
    disarmFullscreen();
    if (fs && settings.fullscreen && !fs.active) enterFullscreen(true);
  };
  document.addEventListener('pointerup', go, true);
  document.addEventListener('keydown', go, true);
  armed = go;
}

function disarmFullscreen() {
  if (!armed) return;
  document.removeEventListener('pointerup', armed, true);
  document.removeEventListener('keydown', armed, true);
  armed = null;
}

// ---------- звук и отклик ----------

/** Музыка следует за игрой: место, живой хозяин места, а пока расчёт стоит — тишина. */
function syncMusic() {
  if (!ui || !G) return;
  const boss = G.room.boss;
  music(!settings.music || frozen() ? null : boss && !boss.dead ? 'boss' : G.biome);
}

function buzz(kind) {
  const rank = Object.hasOwn(HAPTIC_RANK, kind) ? HAPTIC_RANK[kind] : 0;
  if (!rank) return;
  const now = performance.now();
  // рывки и удары идут пачками: не чаще раза в HAPTIC_GAP, но важное (ранение сразу после рывка) не теряется
  if (now - buzzAt < HAPTIC_GAP && rank <= buzzRank) return;
  buzzAt = now;
  buzzRank = rank;
  const haptic = api.platform?.haptic;
  if (!haptic) return;
  if (rank <= HAPTIC_RANK.heavy) haptic.impact(kind);
  else haptic.notification(kind);
}

function onPress() {
  pressed = true;
  // музыка заказана, а браузер ещё держит звук спящим — будим (звуки будят его сами, но они бывают выключены)
  if (mood) audio.get();
}

// ---------- кадр ----------

function draw(dt = 0) {
  if (!renderer || !ui || !G) return;
  // значок на правом джойстике: что сделает нажатие без движения (табличку-подсказку нажатие не «берёт»)
  const focus = G.room.focus;
  input.setAction(focus && focus.type !== 'hint' ? 'use' : G.inv.weapon ? 'fire' : 'none');
  ui.sync(G);
  view.calm = reducedMotion();
  renderer.frame(G, dt, view);
  ui.place(G);
}

function resize() {
  if (!dom || !renderer) return;
  let w = 0;
  let h = 0;
  if (box) {
    w = box.w;
    h = box.h;
  } else if (api.screen) {
    // экран может лежать на боку: его размер в осях игры знает оболочка
    const size = api.screen.size();
    w = size.w;
    h = size.h;
  }
  if (!(w > 0 && h > 0)) {
    w = dom.stage.clientWidth;
    h = dom.stage.clientHeight;
  }
  w = Math.round(w);
  h = Math.round(h);
  if (!(w > 0 && h > 0) || (w === sizeW && h === sizeH)) return;
  sizeW = w;
  sizeH = h;
  renderer.resize(w, h);
  draw();                            // холст при смене размера очищается — рисуем сразу, не дожидаясь кадра
  kick();
}

/** Тот же ввод без разовых команд — для второго и следующих шагов кадра: рывок и «действие» уже сыграл первый. */
function withoutOneShots(inp) {
  held.mx = inp.mx;
  held.my = inp.my;
  held.fire = inp.fire;
  held.aim = inp.aim;
  held.ax = inp.ax;
  held.ay = inp.ay;
  held.ap = inp.ap;
  held.hasT = inp.hasT;
  held.tx = inp.tx;
  held.ty = inp.ty;
  held.act = false;
  held.dash = false;
  held.dx = 0;
  held.dy = 0;
  held.dp = 0;
  return held;
}

/** Расчёт остановился: пальцы отпущены, музыка смолкла, кадр дорисуется один раз. */
function freeze() {
  cold = true;
  dirty = true;
  input.reset();
  music(null);
}

function thaw() {
  cold = false;
  acc = 0;
  frames = slowFrames = 0;
}

/** Кадр идущей игры: шаги расчёта по накопленному времени, события, рисунок. */
function advance(gap) {
  if (cold) thaw();
  watchPace(gap);
  const dt = Math.min(gap, MAX_GAP);
  acc += dt;
  if (acc >= H) {
    const P = G.player;
    // ввод читается только в кадре, где будут шаги: разовые команды (рывок, «действие») живут один вызов
    const inp = bot ? bot(G) : input.frame(P.x, P.y, P.dir, P.st.dashDist);
    view.input = inp;
    let n = 0;
    while (acc >= H && n < MAX_STEPS) {
      step(G, n ? withoutOneShots(inp) : inp, H);
      acc -= H;
      n += 1;
    }
    // не успеваем — остаток отбрасывается: игра пойдёт медленнее, зато не захлебнётся
    if (acc >= H) acc = 0;
    flush();
  }
  syncMusic();
  view.alpha = acc / H;
  draw(dt);
}

/** Кадр, пока расчёт стоит: окно, выбор дара, конец партии. */
function idle(dt) {
  if (!cold) freeze();
  view.alpha = 1;
  if (finished) {
    // картинка ещё живёт: лиса падает — и только потом оболочка покажет итог
    dirty = false;
    flush();
    draw(dt);
    return;
  }
  if (G.pending) offerGift();
  if (!dirty) return;
  // что-то изменилось под окном (надели вещь, выпили зелье, сменился размер) — события и один кадр
  dirty = false;
  flush();
  draw();
}

// ?fhdebug: время идёт медленнее (для разглядывания движений), 1 — как обычно
let debugSlow = 1;

function loop(now) {
  raf = 0;
  if (!ui || !G) return;
  // метка кадра бывает раньше performance.now() из kick() — время не должно идти назад
  const gap = Math.max(0, (now - lastFrame) / 1000) * debugSlow;
  lastFrame = now;
  try {
    syncLock();
    if (frozen()) idle(Math.min(gap, MAX_GAP));
    else advance(gap);
  } catch (err) {
    // сбой в одном кадре (редкий зверь, редкая вещь) не должен останавливать игру насовсем
    if (faults < FAULTS_SHOWN) console.error('лисья охота: кадр не удался', err);
    faults += 1;
  }
  // Пока открыто окно, кадры идут вхолостую: окна закрывает ui.js, и узнать об этом можно только спросив. Совсем
  // они прекращаются, когда страницу свернули или итог уже у оболочки, — вернёт их kick().
  if (!raf && ui && !document.hidden && !handed) raf = requestAnimationFrame(loop);
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
  if (slowFrames > SLOW_WINDOW * SLOW_SHARE) renderer.lowerQuality();
  frames = slowFrames = 0;
}

// ---------- события расчёта ----------

/**
 * Разобрать очередь событий: рендеру и окнам — все подряд, остальное — по назначению (звук, отклик телефона,
 * новая комната, «коллекция», конец партии).
 */
function flush() {
  if (!G || !G.events.length) return;
  const events = drain(G);
  // комнат за один разбор бывает несколько (отладка: сразу через три локации) — фон печём только для последней
  let room = -1;
  for (let i = events.length - 1; i >= 0 && room < 0; i--) if (events[i].t === 'room') room = i;
  let props = false;
  for (let i = 0; i < events.length; i++) {
    if (!ui) return;                 // обработчик события закрыл игру
    const e = events[i];
    if (i === room) {
      // сначала сама комната (фон и обстановка), потом всё, что в ней случилось
      renderer.enterRoom(G);
      props = false;
    }
    if (e.t === 'gift') {
      if (bot) {
        // автомат выбирает сам — окно выбора ему ни к чему
        chooseGift(G, 0);
        dirty = true;
        continue;
      }
      offered = G.pending;
      offeredAt = performance.now();
    }
    renderer.onEvent(e, G);
    ui.onEvent(e, G);
    if (e.t === 'sfx') sfx(e.id, e);
    else if (e.t === 'haptic') buzz(e.kind);
    else if (e.t === 'tiles' || e.t === 'doors') props = true;
    else if (e.t === 'item') sawItems([e.id]);
    else if (e.t === 'over') gameOver();
  }
  // сломан куст, открылись или закрылись двери: фон тот же, обстановка — заново
  if (props && renderer) renderer.refreshProps(G);
}

/**
 * Дар ждёт выбора, а окна выбора нет: партию продолжили с сохранения (событие «дар» ушло ещё в прошлый раз) или
 * окно закрылось, не дождавшись выбора. Без напоминания игра так и стояла бы.
 */
function offerGift() {
  if (bot) {
    chooseGift(G, 0);
    dirty = true;
    return;
  }
  if (ui.isOpen) return;
  const now = performance.now();
  if (G.pending === offered && now - offeredAt < GIFT_PATIENCE) return;
  offered = G.pending;
  offeredAt = now;
  ui.onEvent({ t: 'gift', options: [...G.pending.options] }, G);
}

function gameOver() {
  if (finished) return;
  finished = true;
  record = G.score > stats.best;
  stats = applyRun(stats, G);
  api.storage.set('stats', stats);
  sawItems(G.seen);
  later(handOver, reducedMotion() ? 0 : OVER_DELAY);
}

/** Отдать итог оболочке (один раз): она запишет результат и покажет карточку. */
function handOver() {
  if (handed || !finished || !api || !G) return;
  handed = true;
  if (record) sfx('record');
  const sum = runSummary(G);
  api.finish({
    outcome: 'lose', title: T.over, score: sum.score, locale: 'ru',
    message: `${T.result(sum.floor, sum.rabbits)}${record ? ` — ${T.record}` : ''}`,
    share: T.share(sum.score, sum.floor),
  });
}

/**
 * Начать партию: с сохранения (saved) или новую. opts: seed — зерно (иначе из ?fhseed, иначе случайное), floor —
 * с какой локации (отладка). Возвращает true, если партия продолжена с сохранения.
 */
function startRun(saved = null, opts = null) {
  timers.forEach((id) => clearTimeout(id));
  timers.clear();
  let resumed = null;
  if (saved) {
    try {
      resumed = restore(saved);
    } catch (err) {
      console.warn('лисья охота: сохранённая партия не прочиталась', err);
    }
  }
  const seed = opts?.seed || Number(param('fhseed')) || Math.floor(Math.random() * 0xffffffff) + 1;
  G = resumed ?? newRun(seed, { donated: stats.donated, floor: opts?.floor });
  finished = handed = record = false;
  acc = 0;
  offered = null;
  renderer.reset();
  sawItems(G.seen);
  // события новой партии (комната, место) — сразу: рендер не должен рисовать комнату, о которой ещё не знает
  flush();
  dirty = true;
  return Boolean(resumed);
}

// ---------- пауза, «Назад», сворачивание ----------

/** «Назад» или Esc: закрыть верхнее окно, а если окон нет — открыть паузу. Что именно — решает ui.js. */
function back() {
  if (!ui || !G || finished) return;
  if (!ui.back() && !ui.isOpen && !G.pending) ui.openPause(false);
  dirty = true;
  kick();
}

/** Игру свернули или скрыли: ввод сброшен, музыка смолкла, идущая партия встаёт на паузу. */
function hide() {
  if (!ui || !G) return;
  input.reset();
  music(null);
  if (finished) {
    handOver();                      // последняя анимация уже не важна — итог не должен потеряться
    return;
  }
  if (!ui.isOpen && !G.pending) ui.openPause(false);
  dirty = true;
}

function onVisibility() {
  if (document.hidden) hide();
  else {
    dirty = true;                    // пока страницы не было видно, браузер мог выбросить картинку холста
    kick();
  }
}

// ---------- что видят и чем командуют окна (ui.js) ----------

// После действия из окна расчёт ещё стоит: его события (звук, «рюкзак полон») разберёт ближайший кадр.
const act = (fn) => (...args) => {
  if (!running()) return false;
  const ok = fn(G, ...args);
  dirty = true;
  kick();
  return ok;
};

const actions = {
  resume() {
    kick();
  },
  /** Новая партия; брошенная в статистику не идёт — как будто её не было. */
  restart() {
    if (!ui || !G) return;
    if (finished) handOver();        // лиса уже упала: итог этой партии покажет оболочка, «ещё раз» — там же
    else startRun();
    kick();
  },
  /** «В меню»: партию сохранит оболочка (getState). */
  exit() {
    if (!api) return;
    fs?.leave();                     // из полного экрана выходим сразу, не дожидаясь destroy
    syncLock(true);
    if (finished) handOver();
    else api.exit?.();
  },
  equip: act(equip),
  unequip: act(unequip),
  drop: act(dropItem),
  usePotion: act(usePotion),
  chooseGift: act(chooseGift),
  set: setOption,
  sfx,
};

const get = {
  game: () => G,
  stats: () => stats,
  settings: () => settings,
  sound: () => soundOn,
  seen: () => seen,
  toScreen: (wx, wy, out) => renderer?.toScreen(wx, wy, out) ?? out,
  screen: () => api?.screen ?? null,
  /** Есть ли переключатель «Полный экран» (компьютер). */
  fullscreen: () => Boolean(fs),
  /** Блок «Очки в рейтинге» для окна статистики (или null). */
  pointsInfo: () => pointsInfo(api, 'fox-hunt'),
};

// ---------- автомат (отладка и запись ролика) ----------

/**
 * Игрок-автомат: bot(G) → ввод на этот кадр. Уходит из красных зон; идёт к ближайшей добыче или врагу и прыгает,
 * когда достаёт (в колючего — нет); держит огонь, если есть оружие; ломает пни заданий; подбирает вещи и открывает
 * сундуки; ходит через открытые двери туда, где ещё не был, а после хозяина места уходит в портал.
 */
function createBot() {
  const out = { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 };
  const front = { x: 0, y: 0 };
  const dull = new WeakSet();        // к чему шли слишком долго и не дошли — больше не цель
  let lastX = 0;
  let lastY = 0;
  let stuck = 0;
  let wiggle = 0;
  let planned = null;                // комната, для которой уже выбрана дверь
  let side = null;
  let want = null;                   // к чему идём сейчас и сколько кадров
  let wantT = 0;

  // шаг к точке: напрямик, если путь свободен, иначе — по полю путей комнаты
  function go(room, P, x, y) {
    const dx = x - P.x;
    const dy = y - P.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    out.mx = dx / d;
    out.my = dy / d;
    if (d < 28 || castRay(room, P.x, P.y, x, y, F_WALK) >= 1) return;
    const field = fieldTo(room, x, y);
    if (field && fieldDir(room, field, P.x, P.y)) {
      out.mx = DIR.x;
      out.my = DIR.y;
    }
  }

  // рывок в точку, если до неё достать и на пути нет высокого
  function leap(room, P, x, y, range) {
    const d = Math.hypot(x - P.x, y - P.y);
    if (d > range || d < 5 || P.charges <= 0 || P.dash || castRay(room, P.x, P.y, x, y, F_LEAP) < 1) return;
    out.dash = true;
    out.dx = (x - P.x) / d;
    out.dy = (y - P.y) / d;
    out.dp = Math.max(0, Math.min(1, ((d + 24) / P.st.dashDist - DASH.minPower) / (1 - DASH.minPower)));
  }

  // через какую дверь идти: к ближайшей комнате, где лиса ещё не была; все пройдены — к хозяину места (там портал)
  function doorTo(map) {
    const { rooms, cur, bossId } = map;
    const first = new Map([[cur, null]]);                    // комната → через какую дверь к ней выходить отсюда
    const queue = [cur];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const s of SIDES) {
        const to = rooms[id].doors[s];
        if (!(to >= 0) || first.has(to)) continue;
        first.set(to, first.get(id) ?? s);
        if (rooms[to].state === 'new') return first.get(to);
        queue.push(to);
      }
    }
    return first.get(bossId) ?? null;
  }

  function think(G, room, P) {
    const armed = Boolean(G.inv.weapon);
    let target = null;
    let best = Infinity;
    let foes = false;
    for (let i = 0; i < room.mobs.length; i++) {
      const m = room.mobs[i];
      if (m.dead || m.hide) continue;
      if (m.kind !== 0) foes = true;
      const d = Math.hypot(m.x - P.x, m.y - P.y) - (m.kind === 0 ? 30 : 0);      // добыча чуть важнее врага
      if (d < best) {
        best = d;
        target = m;
      }
    }
    // из красной зоны — прочь, отстреливаясь
    const zone = dangerAt(room, P.x, P.y, 14);
    if (zone) {
      const away = escapeDir(zone, P.x, P.y);
      out.mx = away.x;
      out.my = away.y;
      out.fire = armed && foes;
      return null;
    }
    if (target) {
      const d = Math.hypot(target.x - P.x, target.y - P.y);
      const foe = target.kind !== 0;
      const spiky = foe && Boolean(target.def.spiky?.(target, G, P.x, P.y));
      out.fire = armed && foe;
      if (spiky && d < 90) {
        out.mx = (P.x - target.x) / (d || 1);
        out.my = (P.y - target.y) / (d || 1);
      } else go(room, P, target.x, target.y);
      if (!spiky && target.inv <= 0) leap(room, P, target.x, target.y, 125);
      return null;
    }
    // ломкое (пни задания, мишени) — рывком
    for (let i = 0; i < room.things.length; i++) {
      const th = room.things[i];
      if (!th.breakable || th.broken) continue;
      go(room, P, th.x, th.y);
      leap(room, P, th.x, th.y, 110);
      return null;
    }
    // охота ждёт, пока лиса зайдёт в комнату
    if (room.dir.mode === 'enter') {
      go(room, P, room.center.x, room.center.y);
      return null;
    }
    // подбираемое: вещи (если есть куда положить), сердца и мана (если нужны), монеты
    let goal = null;
    let goalD = Infinity;
    let use = false;
    const bagFree = G.inv.bag.includes(null);
    for (let i = 0; i < room.picks.length; i++) {
      const p = room.picks[i];
      if (dull.has(p)) continue;
      if (p.kind === 'item') {
        const kind = kindOf(p.id);
        const fits = kind === 'acc' ? G.inv.acc.includes(null) : kind !== 'potion' && !G.inv[kind];
        if (!fits && !bagFree) continue;
      } else if (!p.tag && (p.kind === 'heart' || p.kind === 'berry') && P.hp >= P.st.maxHp) continue;
      else if (!p.tag && p.kind === 'mana' && P.mana >= P.st.maxMana) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < goalD) {
        goal = p;
        goalD = d;
        use = p.kind === 'item';
      }
    }
    // сундуки; портал — в последнюю очередь (покупать и жертвовать автомат не берётся)
    if (!goal) {
      for (let i = 0; i < room.things.length; i++) {
        const th = room.things[i];
        if (!th.usable || th.broken || dull.has(th) || (th.kind !== 'chest' && th.kind !== 'portal')) continue;
        const d = Math.hypot(th.x - P.x, th.y - P.y) + (th.kind === 'portal' ? 1e6 : 0);
        if (d < goalD) {
          goal = th;
          goalD = d;
          use = true;
        }
      }
    }
    if (goal) {
      if (use && room.focus && room.focus.ref === goal) out.act = true;
      else go(room, P, goal.x, goal.y);
      return goal;
    }
    // делать здесь больше нечего — в дверь
    if (planned !== room) {
      planned = room;
      side = doorTo(G.map);
    }
    const door = side && room.doors[side];
    if (!door || !door.open) return null;
    // сначала на клетку перед проёмом, потом в него
    entryPoint(room, side, front);
    const far = Math.hypot(front.x - P.x, front.y - P.y) > 14 && castRay(room, P.x, P.y, door.x, door.y, F_WALK) < 1;
    go(room, P, far ? front.x : door.x, far ? front.y : door.y);
    return null;
  }

  return function pilot(G) {
    out.mx = out.my = out.dx = out.dy = out.dp = 0;
    out.fire = out.act = out.dash = false;
    const P = G.player;
    if (G.over || G.pending || P.down > 0) return out;
    // упёрлась и стоит — немного в сторону
    stuck = Math.hypot(P.x - lastX, P.y - lastY) < 0.3 ? stuck + 1 : 0;
    lastX = P.x;
    lastY = P.y;
    if (stuck > 40) {
      wiggle = 30;
      stuck = 0;
    }
    const goal = think(G, G.room, P);
    // одна и та же цель шесть секунд подряд — до неё не добраться
    wantT = goal && goal === want ? wantT + 1 : 0;
    want = goal;
    if (wantT > 360) dull.add(goal);
    if (wiggle > 0) {
      wiggle -= 1;
      const mx = out.mx;
      out.mx = -out.my;
      out.my = mx;
    }
    return out;
  };
}

// ---------- отладка (?fhdebug) ----------

function debugHooks() {
  // после правки состояния руками: события — сразу (вдруг сменилась комната), и кадр
  const touched = (result) => {
    flush();
    dirty = true;
    kick();
    return result;
  };
  globalThis.__foxHunt = {
    get game() { return G; },
    get stats() { return stats; },
    get settings() { return settings; },
    get scale() { return renderer.scale; },
    get quality() { return renderer.quality; },
    /** Ввод, с которым считается игра: джойстики, мышь и клавиши — или автомат. */
    get input() { return view.input; },
    /** Играет автомат (true) или игрок (false). */
    bot(on = true) {
      bot = on ? createBot() : null;
      input.reset();
      view.input = input.state;
      kick();
    },
    /** Медленное время: slow(0.2) — в пять раз медленнее, slow() — как обычно. */
    slow(k = 1) {
      debugSlow = Math.min(1, Math.max(0.05, Number(k) || 1));
    },
    /** Как рисуется хозяин комнаты (или данный зверь) сейчас: прозрачность, масштаб, тень, нить. */
    look: (m = G.room.boss) => renderer.bossLook(m, view.calm),
    /** Неуязвимость лисы. */
    god(on = true) {
      cheat.god(G, on);
    },
    /** Выдать вещь, дар или спутника по id; 'coins', 'mana', 'heart'. */
    give: (id) => touched(cheat.give(G, id)),
    /** Перенестись в комнату такого типа ('hunt', 'boss', 'shop', 'treasure'…). */
    warp: (type) => touched(cheat.warp(G, type)),
    /** Перейти на локацию n: вперёд — как через порталы (вещи остаются), назад — новой партией с неё. */
    floor(n) {
      const to = Math.max(1, Math.floor(Number(n)) || 1);
      if (to >= G.floor && to - G.floor <= 60) {
        while (G.floor < to) cheat.nextFloor(G);
      } else startRun(null, { seed: G.seed, floor: to });
      return touched(G.floor);
    },
    /** Зверь id неподалёку от лисы. */
    spawn: (id) => touched(Boolean(cheat.spawn(G, id))),
    /** Закончить бой в комнате сразу. */
    clear: () => touched(cheat.clear(G)),
    /** Сколько миллисекунд стоит один кадр (среднее по n кадрам): расчёт мира + рисование; играет автомат. */
    cost(n = 120) {
      const pilot = bot ?? createBot();
      const t0 = performance.now();
      for (let k = 0; k < n && !G.over; k++) {
        if (G.pending) chooseGift(G, 0);
        step(G, pilot(G), H);
        flush();
        draw(H);
      }
      return (performance.now() - t0) / n;
    },
    pause() {
      if (running() && !ui.isOpen) ui.openPause(false);
      kick();
    },
    /** Открыть окно по имени ('pause' | 'bag' | 'stats' | 'settings' | 'gift'), для проверки окон. */
    win: (name, arg) => ui.open(name, arg),
    /** Закрыть все окна и играть дальше. */
    resume() {
      for (let k = 0; k < 6 && ui.isOpen; k++) ui.back();
      kick();
    },
    /** Новая партия (с зерном seed, если оно дано). */
    restart(seed) {
      startRun(null, { seed: Number(seed) || 0 });
      kick();
    },
    /** Закончить партию прямо сейчас. */
    over() {
      if (!running() || G.over) return;
      G.lives = 0;
      G.over = true;
      G.player.act = 'down';
      emit(G, { t: 'over' });
      touched();
    },
  };
}

export default {
  id: 'fox-hunt',
  title: 'Лисья охота',

  async init(container, gameApi) {
    api = gameApi;
    const [savedStats, savedSettings, savedSound, savedSeen] = await Promise.all([
      api.storage.get('stats'), api.storage.get('settings'), api.storage.get('sound'), api.storage.get('seen'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    settings = readSettings(savedSettings);
    seen = readSeen(savedSeen);

    dom = {
      canvas: el('canvas', { class: 'fh-canvas' }),
      sticks: el('div', { class: 'fh-sticks' }),
      probe: el('span', { class: 'fh-probe' }),
    };
    dom.stage = el('div', { class: 'fh-stage' }, dom.canvas, dom.sticks);
    // слои поверх сцены (надписи, окна, всплывающее сообщение) добавит ui.js
    root = el('div', { class: 'fh' }, dom.stage, dom.probe);
    const m = /^(\d{2,4})x(\d{2,4})$/.exec(param('fhbox') ?? '');
    if (m) {
      // запись ролика: поле заданного размера посреди экрана
      box = { w: Number(m[1]), h: Number(m[2]) };
      Object.assign(root.style, { flex: 'none', width: `${box.w}px`, height: `${box.h}px`, margin: 'auto' });
    }
    container.append(root);
    api.screen?.flip(settings.flip);

    renderer = createRenderer({ canvas: dom.canvas, probe: dom.probe });
    input = createInput({
      stage: dom.stage, sticksEl: dom.sticks, screen: api.screen ?? null,
      toWorld: (x, y, out) => renderer.toWorld(x, y, out),
      onPause: back,
      lefty: settings.lefty,
      stick: settings.stick,
      weaponBtn: settings.weaponBtn,
      // сила рывка мышью считается теми же числами, что и сам рывок
      tune: { reach: BASE.dashDist, reachMin: DASH.minPower },
    });
    view.input = input.state;
    if (isDesktop(desktopFacts(window, api.screen ?? null))) {
      fs = createFullscreen({ doc: document, nav: navigator, host: container, tg: api.platform?.fullscreen ?? null, onLost: onFullscreenLost });
    }
    ui = createUi({ root, api, actions, get });

    // размер: у альбомного экрана его знает оболочка (и говорит, когда он сменился), без неё — сама сцена;
    // input.js за сценой следит сам
    dom.observer = new ResizeObserver(resize);
    dom.observer.observe(dom.stage);
    dom.offScreen = api.screen?.onChange(resize) ?? null;
    resize();

    const resumed = startRun(api.savedState);
    if (new URLSearchParams(location.search).has('fhdebug')) debugHooks();

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onPress, true);
    armFullscreen();

    // начатая партия ждёт на паузе
    if (resumed) ui.openPause(true);
    view.alpha = 1;
    draw();
    kick();
  },

  getState() {
    return running() ? snapshot(G) : null;
  },

  /** «Назад»: из игры не выходим — открываем паузу (выход — её кнопкой «В меню»). */
  onBack() {
    // игра ещё грузится или итог уже отдан оболочке — пусть выходит она
    if (!ui || !G || handed) return false;
    back();
    return true;
  },

  /** Приложение свернули или скрыли. */
  onHide() {
    hide();
  },

  destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    music(null);                     // звук один на всю страницу и переживает игру — музыку останавливаем сами
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('keydown', onPress, true);
    disarmFullscreen();
    // из полного экрана выйти и клавишу вернуть; курсор отпустит input.destroy
    try {
      fs?.destroy();
    } catch (err) {
      console.error('лисья охота: полный экран не закрылся', err);
    }
    dom?.observer?.disconnect();
    dom?.offScreen?.();
    // части закрываются по одной: сбой в одной не должен оставить остальные (и состояние модуля) неубранными
    for (const part of [input, ui, renderer]) {
      try {
        part?.destroy();
      } catch (err) {
        console.error('лисья охота: часть игры не закрылась', err);
      }
    }
    root?.remove();
    if (globalThis.__foxHunt) delete globalThis.__foxHunt;
    debugSlow = 1;
    api = root = dom = renderer = input = ui = G = bot = box = offered = mood = fs = null;
    lockWant = false;
    autoTries = 0;
    stats = emptyStats();
    settings = readSettings(null);
    seen = [];
    soundOn = true;
    pressed = finished = handed = record = cold = dirty = false;
    raf = lastFrame = acc = offeredAt = sizeW = sizeH = buzzAt = buzzRank = frames = slowFrames = faults = 0;
    view.alpha = 0;
    view.calm = false;
    view.input = null;
  },
};
