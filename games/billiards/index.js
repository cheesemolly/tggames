// Бильярд — пул-«восьмёрка» против бота или вдвоём на одном телефоне.
// Стол стоит вертикально (играем «от себя»). Прицел — водить пальцем по столу: кий поворачивается вслед за
// пальцем вокруг битка (чем дальше палец от шара, тем точнее); касание — навести прямо в точку. Слева — колесо
// точной наводки и кнопка винта (точка удара по битку), справа — шкала силы: потянуть вниз и отпустить — удар.
// Биток «с руки» перетаскивается пальцем. С клавиатуры: ←/→ — наводка (с Shift — грубо), ↑/↓ — сила, пробел — удар.
//
// Удар считается сразу и целиком (physics.js — расчёт всегда даёт одно и то же), партия сохраняется уже с итогом,
// а на экране тот же расчёт проигрывается по шагам. Поэтому выход посреди удара ничего не ломает и не даёт
// «переиграть» неудачный удар.

import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createSounds } from './sounds.js';
import { createRenderer, SKINS, SKIN_IDS, fromTheme } from './render.js';
import { identity, rotate, orthonormalize, randomOrientation, colorOf } from './sphere.js';
import { W, L, R, HEAD_Y, STEP, createSim, strike, step, aimRay } from './physics.js';
import {
  LEVEL_IDS, MODES, SOLIDS, STRIPES, newGame, groupFor, remaining, onEight, legalFirst, canPlaceCue, placeCue, shoot,
  isValidState, emptyStats, migrateStats, recordGame,
} from './logic.js';
import { planShot } from './bot.js';

const GUIDES = ['full', 'short', 'off'];
const PULL = 22;                    // см: на столько кий отводится при полной силе
const T = {
  title: 'Бильярд',
  levels: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', master: 'Мастер' },
  levelHint: {
    easy: 'Часто мажет, бьёт не думая',
    medium: 'Забивает простое',
    hard: 'Точный, думает о выходе',
    master: 'Почти не ошибается',
  },
  friend: 'Вдвоём',
  friendHint: 'на одном телефоне по очереди',
  names: { bot: ['Вы', 'Бот'], friend: ['Игрок 1', 'Игрок 2'] },
  sub: (game) => (game.mode === 'friend' ? 'Вдвоём' : T.levels[game.level]),
  groups: { solids: 'сплошные', stripes: 'полосатые' },
  open: 'стол открыт',
  eight: 'восьмёрка',
  status: {
    breakYou: 'Разбой: наведите кий и потяните шкалу справа вниз',
    hand: 'Биток с руки: перетащите его куда угодно',
    you: 'Ваш удар',
    eight: 'Бейте восьмёрку',
    bot: 'Бот целится',
    turn: (name) => `Бьёт ${name}`,
    breakOf: (name) => `Разбивает ${name}: шкала справа — сила удара`,
    handOf: (name) => `${name}: биток с руки, перетащите его`,
    eightOf: (name) => `${name} бьёт восьмёрку`,
  },
  fouls: { scratch: 'Фол: биток в лузе', noHit: 'Фол: биток ничего не задел', wrongBall: 'Фол: первым задет не свой шар' },
  handTo: (name) => `Биток с руки — ${name === 'Вы' ? 'у вас' : name === 'Бот' ? 'у бота' : name}`,
  assigned: (name, group) => (name === 'Вы' ? `Ваши шары — ${group}` : `${name}: ${group}`),
  respot: 'Восьмёрка возвращена на стол',
  power: 'Сила удара',
  wheel: 'Точная наводка',
  spin: 'Винт',
  spinTitle: 'Точка удара по битку',
  spinNote: 'Выше центра — накат: биток катится за шаром. Ниже — оттяжка: возвращается. Сбоку — боковое вращение: меняет отскок от борта.',
  spinReset: 'В центр',
  done: 'Готово',
  newGame: 'Новая партия',
  rival: 'Соперник',
  start: 'Играть',
  abandon: 'Начатая партия засчитается как поражение.',
  close: 'Закрыть',
  win: 'Победа!',
  lose: 'Поражение',
  reasons: {
    eight: ['Вы забили восьмёрку', 'Бот забил восьмёрку'],
    early8: ['Бот забил восьмёрку раньше времени', 'Вы забили восьмёрку раньше времени'],
    foul8: ['Бот забил восьмёрку с фолом', 'Вы забили восьмёрку с фолом'],
  },
  friendWin: (name) => `Победил ${name}`,
  friendReasons: { eight: 'Восьмёрка в лузе', early8: 'Соперник забил восьмёрку раньше времени', foul8: 'Соперник забил восьмёрку с фолом' },
  again: 'Ещё раз',
  stats: { open: 'Статистика', title: 'Статистика', played: 'Партий', wins: 'Побед', losses: 'Пораж.', friend: 'Вдвоём сыграно партий', run: 'Лучшая серия шаров подряд' },
  help: { open: 'Правила', title: 'Правила' },
  rules: [
    'Пул-«восьмёрка». У одного игрока сплошные шары (1–7), у другого полосатые (9–15). Кто первым забьёт все свои, а потом восьмёрку, — победил.',
    'Стол открыт, пока кто-то не забьёт шар после разбоя: какой забил — та группа его. Забил свой шар — бьёшь ещё.',
    'Фол — если биток упал в лузу, ничего не задел или первым задел не свой шар (восьмёрку — пока свои не кончились). После фола соперник ставит биток с руки куда угодно.',
    'Восьмёрка, забитая раньше своих шаров или с фолом, — поражение. На разбое она просто возвращается на стол.',
    'Прицел: ведите пальцем по столу — кий поворачивается за ним; чем дальше палец от битка, тем точнее. Касание наводит прямо в точку. Слева — колесо точной наводки.',
    'Удар: потяните шкалу справа вниз и отпустите. Кнопка с шаром слева — винт: накат, оттяжка, боковое вращение.',
  ],
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Стол', guide: 'Линии прицела' },
  skins: { green: 'Классика', blue: 'Турнир', wine: 'Бордо', night: 'Ночь', telegram: 'Как в Telegram' },
  guides: { full: 'Полные', short: 'Только до шара', off: 'Без линий' },
  guideHint: { full: 'Видно, куда уйдут шар и биток', short: 'Линия до первого касания', off: 'Только кий' },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.9"/><path d="M12 17.2v.1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
};

const isDebug = () => new URLSearchParams(globalThis.location?.search ?? '').has('bidebug');

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let renderer = null;
let observer = null;
let game = null;
let stats = emptyStats();
let setup = { mode: 'bot', level: 'easy' };
let settings = { skin: 'green', guide: 'full' };
let view = null;                   // что на экране: шары с ориентацией, прицел, сила, винт, фаза, анимация
let frame = 0;
let last = 0;
let pointer = null;                // текущий жест на столе: { id, kind: 'aim' | 'hand', … }
let modalActive = false;
let modalToken = 0;
let soundOn = true;
let lastClack = 0;
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

function save() {
  if (!game || !api) return;
  if (game.over) api.storage.remove('current');
  else api.storage.set('current', game);
}

const names = () => T.names[game.mode];
const isHuman = (who) => game.mode === 'friend' || who === 0;
const aiming = () => Boolean(game && view && view.phase === 'aim' && !modalActive);

// ---------- то, что на экране ----------

/** Шары на экране — по партии; ориентация шаров, которые уже были на столе, сохраняется. */
function syncView() {
  const old = view?.balls;
  const balls = game.balls.map((b, id) => ({
    x: b ? b[0] : 0, y: b ? b[1] : 0, on: Boolean(b), M: old?.[id]?.M ?? (id === 0 ? identity() : randomOrientation()), drop: null,
    fade: old && b && !old[id].on && !old[id].drop ? 0 : 1,
  }));
  view = { phase: 'idle', aim: -Math.PI / 2, power: 0, spin: [0, 0], anim: null, bot: null, handOk: true, t: 0, ...view, balls };
}

/** Навести кий на ближайший шар, по которому можно бить. */
function aimAtNearest() {
  const cue = game.balls[0];
  let best = null;
  for (const id of legalFirst(game)) {
    const b = game.balls[id];
    const d = Math.hypot(b[0] - cue[0], b[1] - cue[1]);
    if (!best || d < best.d) best = { d, angle: Math.atan2(b[1] - cue[1], b[0] - cue[0]) };
  }
  if (best) view.aim = best.angle;
}

function scene() {
  const cue = view.balls[0];
  const human = view.phase === 'aim';
  const showCue = cue.on && !cue.drop && (human || view.phase === 'bot' || view.phase === 'strike');
  let pull = view.power * PULL;
  if (view.phase === 'strike') {
    // кий идёт вперёд и чуть «проваливается» в шар
    const k = view.anim.strike > 0 ? Math.min(1, view.anim.t / view.anim.strike) : 1;
    pull = view.anim.pull0 * (1 - k) - 0.6 * k;
  }
  const guide = human && settings.guide !== 'off' && cue.on
    ? { x: cue.x, y: cue.y, angle: view.aim, hit: aimRay(game.balls, cue.x, cue.y, view.aim), level: settings.guide }
    : null;
  return {
    balls: view.balls,
    cue: showCue ? { x: cue.x, y: cue.y, angle: view.aim, pull, alpha: 1 } : null,
    guide,
    hand: human && game.hand ? { x: cue.x, y: cue.y, ok: view.handOk, t: view.t } : null,
    mark: human && !game.breakShot && game.group != null ? legalFirst(game) : null,
  };
}

function draw() {
  if (renderer?.ready && view) renderer.draw(scene());
}

/** Нужны ли кадры подряд: идёт удар, целится бот, падает шар, крутится кольцо «с руки». */
function busy() {
  if (!view) return false;
  if (view.phase === 'strike' || view.phase === 'roll' || view.bot) return true;
  if (view.phase === 'aim' && game.hand) return true;
  return view.balls.some((b) => b.drop || b.fade < 1);
}

function wake() {
  if (frame || !ui) return;
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = 0;
  if (!ui || !view) return;
  const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
  last = now;
  update(dt);
  draw();
  if (busy()) frame = requestAnimationFrame(tick);
}

function update(dt) {
  view.t += dt;
  for (const b of view.balls) {
    if (b.drop) {
      b.drop.k += dt / 0.3;
      if (b.drop.k >= 1) b.drop = null;
    }
    if (b.fade < 1) b.fade = Math.min(1, b.fade + dt / 0.35);
  }
  if (view.bot) updateBot(dt);
  if (view.phase === 'strike') {
    const a = view.anim;
    a.t += dt;
    if (a.t >= a.strike) {
      strike(a.sim, a.shot);
      sfx('cue', { v: a.shot.power });
      api.platform.haptic.impact(a.shot.power > 0.6 ? 'heavy' : a.shot.power > 0.3 ? 'medium' : 'light');
      view.phase = 'roll';
      view.power = 0;
      renderPower();
    }
  } else if (view.phase === 'roll') {
    roll(dt);
  }
}

/** Проиграть расчёт удара по шагам: те же шаги, что уже посчитаны для партии. */
function roll(dt) {
  const a = view.anim;
  const { sim } = a;
  a.acc += dt;
  let steps = 0;
  while (a.acc >= STEP && sim.moving && steps < 48) {
    step(sim);
    a.acc -= STEP;
    steps += 1;
    for (let i = 0; i < sim.n; i++) {
      if (sim.on[i] && (sim.wx[i] || sim.wy[i] || sim.wz[i])) rotate(view.balls[i].M, sim.wx[i], sim.wy[i], sim.wz[i], STEP);
    }
  }
  if (steps === 48) a.acc = 0;             // медленное устройство: удар идёт медленнее, но не рывками
  for (let i = 0; i < sim.n; i++) {
    const b = view.balls[i];
    if (sim.on[i]) {
      b.x = sim.x[i];
      b.y = sim.y[i];
    }
  }
  // звуки и падения — по событиям расчёта
  for (; a.ev < sim.events.length; a.ev++) {
    const e = sim.events[a.ev];
    if (e.type === 'pocket') {
      const b = view.balls[e.id];
      b.on = false;
      b.drop = { pocket: e.pocket, k: 0 };
      sfx('pocket', { v: e.speed / 300 });
      api.platform.haptic.impact('medium');
    } else if (e.speed > 4) {
      // частые стуки (разбой) прореживаем
      const nowMs = performance.now();
      if (nowMs - lastClack > 28) {
        lastClack = nowMs;
        sfx(e.type, { v: e.speed / (e.type === 'ball' ? 420 : 360) });
      }
    }
  }
  if (!sim.moving) settle();
}

/** Шары остановились: картинка — по партии (она уже посчитана), сообщение, следующий удар. */
function settle() {
  const { res, who } = view.anim;
  view.anim = null;
  for (const b of view.balls) orthonormalize(b.M);
  syncView();
  view.phase = 'idle';
  announce(res, who);
  renderHud();
  if (game.over) finishGame();
  else startTurn();
}

function announce(res, who) {
  const nm = names();
  const parts = [];
  if (res.foul) {
    parts.push(T.fouls[res.foul]);
    if (!game.over) parts.push(T.handTo(nm[1 - who]));
    sfx('foul');
    api.platform.haptic.notification('warning');
  } else if (res.assigned) {
    parts.push(T.assigned(nm[who], T.groups[res.assigned]));
    sfx('group');
  }
  if (res.respotted) parts.push(T.respot);
  if (parts.length && !game.over) toast.show(parts.join('. '), 2400);
  if (!res.foul && !res.keep && !game.over) sfx('turn');
}

// ---------- ход ----------

function statusText() {
  if (!game || !view || view.phase === 'over') return '';
  if (view.phase === 'strike' || view.phase === 'roll') return '';
  const who = game.turn;
  const nm = names();
  if (!isHuman(who)) return T.status.bot;
  if (game.mode === 'friend') {
    if (game.breakShot) return T.status.breakOf(nm[who]);
    if (game.hand) return T.status.handOf(nm[who]);
    return onEight(game, who) ? T.status.eightOf(nm[who]) : T.status.turn(nm[who]);
  }
  if (game.breakShot) return T.status.breakYou;
  if (game.hand) return T.status.hand;
  return onEight(game, who) ? T.status.eight : T.status.you;
}

function startTurn() {
  view.spin = [0, 0];
  view.power = 0;
  view.handOk = true;
  aimAtNearest();
  renderSpin();
  renderPower();
  if (isHuman(game.turn)) {
    view.phase = 'aim';
  } else {
    view.phase = 'bot';
    botTurn();
  }
  renderHud();
  draw();
  wake();
}

/** Удар: партия считается и сохраняется сразу, анимация идёт своим расчётом из прежней расстановки. */
function fire(shot) {
  const before = game.balls.map((b) => (b ? [...b] : null));
  const who = game.turn;
  const res = shoot(game, { angle: shot.angle, power: shot.power, spin: shot.spin });
  save();
  view.bot = null;
  view.aim = shot.angle;
  view.anim = {
    sim: createSim(before), shot, res, who, t: 0, acc: 0, ev: 0,
    pull0: shot.power * PULL, strike: reducedMotion() ? 0 : 0.1,
  };
  view.phase = 'strike';
  renderHud();
  wake();
}

async function botTurn() {
  const snapshot = game;
  const started = performance.now();
  const shot = await planShot(game, game.level, Math.random, () => later(null, 0));
  if (!ui || game !== snapshot || view.phase !== 'bot') return;
  if (shot.cue && game.hand && placeCue(game, shot.cue[0], shot.cue[1])) {
    const b = view.balls[0];
    b.x = game.balls[0][0];
    b.y = game.balls[0][1];
    b.fade = 0;
    sfx('place');
  }
  // бот «думает» хотя бы полсекунды, потом наводит кий и набирает силу
  const wait = Math.max(0, 500 - (performance.now() - started));
  if (wait && !reducedMotion()) await later(null, wait);
  if (!ui || game !== snapshot || view.phase !== 'bot') return;
  let turn = shot.angle - view.aim;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  view.bot = { from: view.aim, turn, shot, t: 0, aim: reducedMotion() ? 0 : 0.7, hold: reducedMotion() ? 0 : 0.35 };
  wake();
}

function updateBot(dt) {
  const b = view.bot;
  b.t += dt;
  const k = b.aim > 0 ? Math.min(1, b.t / b.aim) : 1;
  const ease = k * k * (3 - 2 * k);
  view.aim = b.from + b.turn * ease;
  view.power = b.shot.power * Math.max(0, Math.min(1, (b.t - b.aim * 0.5) / (b.aim * 0.5 + b.hold || 1)));
  renderPower();
  if (b.t >= b.aim + b.hold) fire({ angle: b.shot.angle, power: b.shot.power, spin: b.shot.spin });
}

function finishGame() {
  view.phase = 'over';
  const { winner, reason } = game.over;
  recordGame(stats, game, winner);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  renderHud();
  draw();
  if (game.mode === 'friend') {
    sfx('win');
    api.platform.haptic.notification('success');
    later(() => ui && showFriendResult(winner, reason), reducedMotion() ? 0 : 900);
    return;
  }
  const outcome = winner === 0 ? 'win' : 'lose';
  sfx(outcome);
  api.platform.haptic.notification(outcome === 'win' ? 'success' : 'error');
  later(() => api?.finish({
    outcome, title: outcome === 'win' ? T.win : T.lose, locale: 'ru', variant: game.level,
    message: `${T.levels[game.level]} · ${T.reasons[reason][winner]}`,
  }), reducedMotion() ? 0 : 1100);
}

// ---------- управление: стол ----------

function tablePoint(e) {
  const rect = ui.canvas.getBoundingClientRect();
  return { px: e.clientX - rect.left, py: e.clientY - rect.top, at: renderer.toTable(e.clientX - rect.left, e.clientY - rect.top) };
}

function onDown(e) {
  if (!aiming() || pointer) return;
  const p = tablePoint(e);
  const cue = game.balls[0];
  const grab = Math.max(R * 2.4, 26 / renderer.scale);
  if (game.hand && Math.hypot(p.at[0] - cue[0], p.at[1] - cue[1]) < grab) {
    pointer = { id: e.pointerId, kind: 'hand', dx: cue[0] - p.at[0], dy: cue[1] - p.at[1] };
  } else {
    pointer = {
      id: e.pointerId, kind: 'aim', sx: p.px, sy: p.py, moved: false,
      from: Math.atan2(p.at[1] - cue[1], p.at[0] - cue[0]), aim: view.aim,
    };
  }
  ui.canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}

function onMove(e) {
  if (!pointer || e.pointerId !== pointer.id || !aiming()) return;
  const p = tablePoint(e);
  const cue = game.balls[0];
  if (pointer.kind === 'hand') {
    const x = Math.max(R + 0.01, Math.min(W - R - 0.01, p.at[0] + pointer.dx));
    const y = Math.max(game.hand === 'kitchen' ? HEAD_Y : R + 0.01, Math.min(L - R - 0.01, p.at[1] + pointer.dy));
    view.handOk = canPlaceCue(game, x, y);
    if (view.handOk && placeCue(game, x, y)) {
      view.balls[0].x = game.balls[0][0];
      view.balls[0].y = game.balls[0][1];
    }
  } else {
    if (Math.hypot(p.px - pointer.sx, p.py - pointer.sy) > 6) pointer.moved = true;
    if (pointer.moved) {
      // кий поворачивается на тот же угол, на какой палец обошёл биток
      const now = Math.atan2(p.at[1] - cue[1], p.at[0] - cue[0]);
      view.aim = pointer.aim + Math.atan2(Math.sin(now - pointer.from), Math.cos(now - pointer.from));
    }
  }
  draw();
}

function onUp(e) {
  if (!pointer || e.pointerId !== pointer.id) return;
  const was = pointer;
  pointer = null;
  if (!aiming()) return;
  if (was.kind === 'hand') {
    view.handOk = true;
    aimAtNearest();
    sfx('place');
    api.platform.haptic.selection();
    save();
  } else if (!was.moved && e.type === 'pointerup') {
    // касание — навести прямо в точку
    const p = tablePoint(e);
    const cue = game.balls[0];
    if (Math.hypot(p.at[0] - cue[0], p.at[1] - cue[1]) > R) view.aim = Math.atan2(p.at[1] - cue[1], p.at[0] - cue[0]);
  }
  draw();
}

// ---------- управление: сила, колесо, винт ----------

function renderPower() {
  if (!ui) return;
  const p = Math.max(0, Math.min(1, view?.power ?? 0));
  ui.powerFill.style.setProperty('--p', `${p * 100}%`);
  ui.powerKnob.style.top = `${p * 100}%`;
  ui.power.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  ui.power.classList.toggle('bl-charging', p > 0);
}

function powerAt(e) {
  const rect = ui.powerTrack.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
}

function bindPower() {
  let id = null;
  ui.power.addEventListener('pointerdown', (e) => {
    if (!aiming() || id !== null) return;
    id = e.pointerId;
    ui.power.setPointerCapture?.(id);
    view.power = powerAt(e);
    renderPower();
    draw();
    e.preventDefault();
  });
  ui.power.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || !aiming()) return;
    view.power = powerAt(e);
    renderPower();
    draw();
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!aiming()) return;
    const power = view.power;
    if (e.type === 'pointerup' && power >= 0.03) {
      fire({ angle: view.aim, power, spin: view.spin });
    } else {
      view.power = 0;
      renderPower();
      draw();
    }
  };
  ui.power.addEventListener('pointerup', end);
  ui.power.addEventListener('pointercancel', end);
}

function bindWheel() {
  let id = null;
  let y = 0;
  let turn = 0;
  ui.wheel.addEventListener('pointerdown', (e) => {
    if (!aiming() || id !== null) return;
    id = e.pointerId;
    y = e.clientY;
    ui.wheel.setPointerCapture?.(id);
    e.preventDefault();
  });
  ui.wheel.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || !aiming()) return;
    const d = e.clientY - y;
    y = e.clientY;
    // 1 пиксель — 0,04°: сотня пикселей — четыре градуса
    view.aim += d * 0.0007;
    turn += d;
    ui.wheel.style.backgroundPositionY = `${turn}px`;
    draw();
  });
  const end = (e) => {
    if (e.pointerId === id) id = null;
  };
  ui.wheel.addEventListener('pointerup', end);
  ui.wheel.addEventListener('pointercancel', end);
}

function renderSpin() {
  if (!ui) return;
  const [a, b] = view?.spin ?? [0, 0];
  ui.spinDot.style.left = `${50 + a * 34}%`;
  ui.spinDot.style.top = `${50 - b * 34}%`;
  ui.spinBtn.classList.toggle('bl-spin-on', a !== 0 || b !== 0);
}

function showSpin() {
  if (!aiming()) return;
  const dot = el('i', { class: 'bl-spin-dot' });
  const ball = el('div', { class: 'bl-spin-ball' }, el('span', { class: 'bl-spin-cross' }), dot);
  const place = () => {
    dot.style.left = `${50 + view.spin[0] * 38}%`;
    dot.style.top = `${50 - view.spin[1] * 38}%`;
  };
  const set = (e) => {
    const rect = ball.getBoundingClientRect();
    let a = ((e.clientX - rect.left) / rect.width - 0.5) / 0.38;
    let b = -((e.clientY - rect.top) / rect.height - 0.5) / 0.38;
    const m = Math.hypot(a, b);
    if (m > 1) {
      a /= m;
      b /= m;
    }
    // у самого центра — «прилипает» к нулю
    view.spin = Math.hypot(a, b) < 0.1 ? [0, 0] : [Math.round(a * 100) / 100, Math.round(b * 100) / 100];
    place();
    renderSpin();
  };
  let id = null;
  ball.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    ball.setPointerCapture?.(id);
    set(e);
    e.preventDefault();
  });
  ball.addEventListener('pointermove', (e) => {
    if (e.pointerId === id) set(e);
  });
  const end = (e) => {
    if (e.pointerId === id) id = null;
  };
  ball.addEventListener('pointerup', end);
  ball.addEventListener('pointercancel', end);
  place();
  openModal(card(T.spinTitle,
    ball,
    el('p', { class: 'bl-note' }, T.spinNote),
    el('div', { class: 'bl-card-actions' },
      el('button', {
        class: 'btn btn-secondary',
        onclick: () => {
          view.spin = [0, 0];
          place();
          renderSpin();
        },
      }, T.spinReset),
      el('button', { class: 'btn', onclick: closeModal }, T.done),
    ),
  ));
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if (!aiming() || e.ctrlKey || e.metaKey || e.altKey) return;
  const fine = e.shiftKey ? 0.03 : 0.004;
  if (e.key === 'ArrowLeft') view.aim -= fine;
  else if (e.key === 'ArrowRight') view.aim += fine;
  else if (e.key === 'ArrowUp') view.power = Math.min(1, view.power + 0.05);
  else if (e.key === 'ArrowDown') view.power = Math.max(0, view.power - 0.05);
  else if ((e.key === ' ' || e.key === 'Enter') && view.power >= 0.03) {
    e.preventDefault();
    fire({ angle: view.aim, power: view.power, spin: view.spin });
    return;
  } else return;
  e.preventDefault();
  renderPower();
  draw();
}

// ---------- табло ----------

function miniBall(id, gone) {
  const c = colorOf(id);
  const node = el('i', { class: `bl-mini${id > 8 ? ' bl-stripe' : ''}${id === 8 ? ' bl-eight' : ''}${gone ? ' bl-gone' : ''}` });
  node.style.setProperty('--c', `rgb(${c.join(',')})`);
  return node;
}

function renderHud() {
  if (!ui || !game) return;
  const nm = names();
  ui.sub.textContent = T.sub(game);
  // партия уже посчитана на удар вперёд — пока шары катятся, табло показывает то, что было до удара
  const rolling = view && (view.phase === 'strike' || view.phase === 'roll');
  for (const who of rolling ? [] : [0, 1]) {
    const side = ui.sides[who];
    const group = groupFor(game, who);
    side.name.textContent = nm[who];
    side.card.classList.toggle('bl-active', !game.over && view?.phase !== 'over' && game.turn === who);
    if (group == null) {
      side.group.textContent = T.open;
      side.balls.replaceChildren();
    } else {
      const left = remaining(game, group);
      side.group.textContent = left.length ? T.groups[group] : T.eight;
      const ids = group === 'solids' ? SOLIDS : STRIPES;
      side.balls.replaceChildren(...(left.length ? ids.map((id) => miniBall(id, !game.balls[id])) : [miniBall(8, false)]));
    }
  }
  const text = statusText();
  ui.status.textContent = text;
  ui.status.classList.toggle('bl-thinking', Boolean(game && view && view.phase === 'bot'));
  const can = aiming();
  ui.spinBtn.disabled = !can;
  ui.power.classList.toggle('bl-off', !can);
  ui.wheel.classList.toggle('bl-off', !can);
}

function renderSoundBtn() {
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('bl-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  renderHud();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
  renderHud();
  draw();
}

function card(title, ...children) {
  return el('div', { class: 'bl-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'bl-card-head' },
      el('h2', {}, title),
      el('button', { class: 'bl-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

/** Окно новой партии: бот одного из уровней или второй игрок. */
function showNewGame(closable = true) {
  const options = [
    ...LEVEL_IDS.map((id) => ({ id, title: T.levels[id], hint: T.levelHint[id] })),
    { id: 'friend', title: T.friend, hint: T.friendHint },
  ];
  const chosen = () => (setup.mode === 'friend' ? 'friend' : setup.level);
  const buttons = options.map((o) => el('button', {
    class: 'bl-option', role: 'radio', 'aria-checked': String(chosen() === o.id),
    onclick: () => {
      if (o.id === 'friend') setup.mode = 'friend';
      else setup = { mode: 'bot', level: o.id };
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(options[k].id === o.id)));
      sfx('click');
    },
  }, el('b', {}, o.title), el('span', {}, o.hint)));
  const started = game && !game.over && game.mode === 'bot' && game.shots > 0;
  openModal(el('div', { class: 'bl-card', role: 'dialog', 'aria-label': T.newGame },
    el('div', { class: 'bl-card-head' },
      el('h2', {}, T.newGame),
      closable ? el('button', { class: 'bl-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕') : null,
    ),
    el('h3', { class: 'bl-section' }, T.rival),
    el('div', { class: 'bl-options', role: 'radiogroup' }, buttons),
    started ? el('p', { class: 'bl-note' }, T.abandon) : null,
    el('button', {
      class: 'btn bl-start',
      onclick: () => {
        closeModal();
        startGame();
      },
    }, T.start),
  ));
}

function startGame() {
  api.storage.set('setup', setup);
  if (game && !game.over && game.mode === 'bot' && game.shots > 0) {
    // брошенная партия с ботом — поражение
    recordGame(stats, game, 1);
    api.storage.set('stats', stats);
  }
  game = newGame(setup);
  view = null;
  pointer = null;
  syncView();
  for (const b of view.balls) b.fade = 0;
  save();
  startTurn();
}

function showFriendResult(winner, reason) {
  openModal(el('div', { class: 'bl-card bl-result', role: 'dialog', 'aria-label': T.friendWin(names()[winner]) },
    el('h2', {}, T.friendWin(names()[winner])),
    el('p', { class: 'bl-note' }, T.friendReasons[reason]),
    el('button', {
      class: 'btn bl-start',
      onclick: () => {
        closeModal();
        startGame();
      },
    }, T.again),
  ));
}

function showStats() {
  openModal(card(T.stats.title,
    el('table', { class: 'bl-stats' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, T.stats.played), el('th', {}, T.stats.wins), el('th', {}, T.stats.losses))),
      el('tbody', {}, LEVEL_IDS.map((id) => {
        const s = stats[id];
        return el('tr', {}, el('td', {}, T.levels[id]), el('td', {}, s.played), el('td', {}, s.wins), el('td', {}, s.losses));
      }))),
    el('p', { class: 'bl-line' }, T.stats.friend, el('b', {}, stats.friend.played)),
    el('p', { class: 'bl-line' }, T.stats.run, el('b', {}, stats.bestRun)),
  ));
}

function showHelp() {
  openModal(card(T.help.title, T.rules.map((text) => el('p', { class: 'bl-rule' }, text))));
}

function palette(id) {
  return SKINS[id] ?? fromTheme(host);
}

function applySkin() {
  host.dataset.skin = settings.skin;
  renderer?.setSkin(palette(settings.skin));
  draw();
}

function showSettings() {
  const skins = SKIN_IDS.map((id) => {
    const p = palette(id);
    const sw = el('span', { class: 'bl-swatch' }, el('i', {}));
    sw.style.setProperty('--wood', p.wood);
    sw.style.setProperty('--cloth', p.cloth);
    sw.style.setProperty('--cushion', p.cushion);
    return el('button', {
      class: 'bl-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
      onclick: () => {
        settings.skin = id;
        api.storage.set('settings', settings);
        applySkin();
        skins.forEach((b, k) => b.setAttribute('aria-checked', String(SKIN_IDS[k] === id)));
        sfx('click');
      },
    }, sw, T.skins[id]);
  });
  const guides = GUIDES.map((id) => el('button', {
    class: 'bl-option', role: 'radio', 'aria-checked': String(id === settings.guide),
    onclick: () => {
      settings.guide = id;
      api.storage.set('settings', settings);
      guides.forEach((b, k) => b.setAttribute('aria-checked', String(GUIDES[k] === id)));
      sfx('click');
      draw();
    },
  }, el('b', {}, T.guides[id]), el('span', {}, T.guideHint[id])));
  openModal(card(T.settings.title,
    el('h3', { class: 'bl-section' }, T.settings.skin),
    el('div', { class: 'bl-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'bl-section' }, T.settings.guide),
    el('div', { class: 'bl-options', role: 'radiogroup' }, guides),
    pointsInfo(api, 'billiards'),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'bl-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function resize() {
  if (!ui || !renderer) return;
  const rect = ui.wrap.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  renderer.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2.5));
  draw();
}

// ---------- отладка (?bidebug) ----------

function debugHooks() {
  globalThis.__billiards = {
    get game() { return game; },
    get view() { return view; },
    get renderer() { return renderer; },
    /** Удар как с экрана: { angle, power, spin }. */
    fire,
    /** Навести на шар id так, чтобы он пошёл в лузу pocket (точка касания «шар-призрак»). */
    aimAt(id, aimPoint) {
      const b = game.balls[id];
      const cue = game.balls[0];
      const d = Math.hypot(aimPoint[0] - b[0], aimPoint[1] - b[1]);
      const gx = b[0] - ((aimPoint[0] - b[0]) / d) * 2 * R;
      const gy = b[1] - ((aimPoint[1] - b[1]) / d) * 2 * R;
      view.aim = Math.atan2(gy - cue[1], gx - cue[0]);
      draw();
      return view.aim;
    },
    /** Подменить расстановку: { номер: [x, y] } и поля партии. */
    set(spots, patch = {}) {
      game.balls = new Array(16).fill(null);
      for (const [id, at] of Object.entries(spots)) game.balls[id] = at;
      Object.assign(game, { breakShot: false, hand: null }, patch);
      view = null;
      syncView();
      startTurn();
    },
    draw,
  };
}

export default {
  id: 'billiards',
  title: 'Бильярд',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedStats, savedSetup, savedSettings, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('setup'), api.storage.get('settings'),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    stats = migrateStats(savedStats);
    setup = {
      mode: MODES.includes(savedSetup?.mode) ? savedSetup.mode : 'bot',
      level: LEVEL_IDS.includes(savedSetup?.level) ? savedSetup.level : 'easy',
    };
    settings = {
      skin: SKIN_IDS.includes(savedSettings?.skin) ? savedSettings.skin : 'green',
      guide: GUIDES.includes(savedSettings?.guide) ? savedSettings.guide : 'full',
    };
    host.dataset.skin = settings.skin;

    const side = () => {
      const name = el('b', { class: 'bl-name' });
      const group = el('span', { class: 'bl-group' });
      const balls = el('div', { class: 'bl-balls' });
      return { name, group, balls, card: el('div', { class: 'bl-player' }, el('div', { class: 'bl-who' }, name, group), balls) };
    };
    ui = {
      sub: el('div', { class: 'bl-sub' }),
      sides: [side(), side()],
      canvas: el('canvas', { class: 'bl-canvas' }),
      status: el('div', { class: 'bl-status', role: 'status' }),
      modal: el('div', { class: 'bl-modal', hidden: true }),
      spinDot: el('i', { class: 'bl-spin-dot' }),
      powerFill: el('i', { class: 'bl-power-fill' }),
      powerKnob: el('i', { class: 'bl-power-knob' }),
      wheel: el('div', { class: 'bl-wheel', role: 'slider', 'aria-label': T.wheel, title: T.wheel }),
    };
    ui.wrap = el('div', { class: 'bl-wrap' }, ui.canvas);
    ui.spinBtn = el('button', { class: 'bl-spin', 'aria-label': T.spin, title: T.spin, onclick: showSpin }, el('span', { class: 'bl-spin-mini' }, ui.spinDot));
    ui.powerTrack = el('div', { class: 'bl-power-track' }, ui.powerFill, ui.powerKnob);
    ui.power = el('div', { class: 'bl-power', role: 'slider', 'aria-label': T.power, title: T.power, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, ui.powerTrack);
    ui.soundBtn = iconButton(ICONS.soundOn, 'Выключить звук', toggleSound);

    root = el('div', { class: 'bl' },
      el('div', { class: 'bl-header' },
        el('div', {}, el('div', { class: 'bl-title' }, T.title), ui.sub),
        el('div', { class: 'bl-actions' },
          ui.soundBtn,
          iconButton(ICONS.restart, T.newGame, () => showNewGame(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
          iconButton(ICONS.help, T.help.open, showHelp),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'bl-players' }, ui.sides[0].card, ui.sides[1].card),
      el('div', { class: 'bl-play' },
        el('div', { class: 'bl-left' }, ui.spinBtn, ui.wheel),
        ui.wrap,
        ui.power,
      ),
      ui.status,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();

    renderer = createRenderer(ui.canvas);
    renderer.setSkin(palette(settings.skin));
    ui.canvas.addEventListener('pointerdown', onDown);
    ui.canvas.addEventListener('pointermove', onMove);
    ui.canvas.addEventListener('pointerup', onUp);
    ui.canvas.addEventListener('pointercancel', onUp);
    bindPower();
    bindWheel();
    document.addEventListener('keydown', onKeydown);
    observer = new ResizeObserver(resize);
    observer.observe(ui.wrap);
    resize();
    if (isDebug()) debugHooks();

    if (isValidState(saved)) {
      game = saved;
      syncView();
      startTurn();
    } else {
      // до первой партии на столе — пирамида, поверх — выбор соперника
      game = newGame(setup);
      syncView();
      renderHud();
      renderPower();
      renderSpin();
      draw();
      showNewGame(false);
    }
  },

  getState() {
    if (!game || game.over || game.shots === 0) return null;
    save();
    return { mode: game.mode, level: game.level };
  },

  destroy() {
    if (game && !game.over && game.shots > 0) save();
    cancelAnimationFrame(frame);
    frame = 0;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    observer?.disconnect();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    if (globalThis.__billiards) delete globalThis.__billiards;
    api = host = root = ui = toast = renderer = observer = game = view = pointer = null;
    modalActive = false;
    stats = emptyStats();
    setup = { mode: 'bot', level: 'easy' };
    settings = { skin: 'green', guide: 'full' };
  },
};
