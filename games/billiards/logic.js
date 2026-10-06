// Бильярд, пул-«восьмёрка» — правила без DOM: партия, чья очередь, группы шаров, фолы, конец, статистика.
// Сам удар считает physics.js; здесь — что из него следует.
//
// Правила (упрощённые правила WPA, как в большинстве мобильных игр):
//   • Разбой — с руки из «дома». Забил что-то на разбое — бьёшь дальше, но стол остаётся открытым.
//     Восьмёрка, упавшая на разбое, возвращается на стол.
//   • Стол открыт, пока кто-то не забьёт шар без фола: сплошные (1–7) или полосатые (9–15) — эта группа его.
//   • Первым биток должен коснуться своего шара (на открытом столе — любого, кроме восьмёрки; когда свои
//     кончились — восьмёрки). Иначе фол. Фол и когда биток ничего не задел или сам упал в лузу.
//   • После фола соперник ставит биток с руки куда угодно.
//   • Забил свой шар без фола — бьёшь ещё.
//   • Восьмёрку бьют последней: забил её после всех своих и без фола — победа; раньше или с фолом — поражение.
//
// Партия: игрок 0 — человек (в режиме «вдвоём» — «Игрок 1»), игрок 1 — бот или «Игрок 2».
// Шары: 0 — биток, 1–7 — сплошные, 8 — восьмёрка, 9–15 — полосатые; место — [x, y] или null (в лузе).

import {
  W, L, R, D, HEAD_Y, HEAD_SPOT, FOOT_SPOT, POCKETS, rack, createSim, strike, run, positions, spotFree, nearestFree,
} from './physics.js';

export const LEVEL_IDS = ['easy', 'medium', 'hard', 'master'];
export const MODES = ['bot', 'friend'];
export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export const kindOf = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solids' : 'stripes');
export const otherGroup = (group) => (group === 'solids' ? 'stripes' : 'solids');

/** Новая партия: пирамида, биток в «доме», разбивает игрок 0. */
export function newGame({ mode = 'bot', level = 'easy' } = {}, rng = Math.random) {
  return {
    v: 1,
    mode: MODES.includes(mode) ? mode : 'bot',
    level: LEVEL_IDS.includes(level) ? level : 'easy',
    balls: rack(rng),
    turn: 0,
    group: null,           // группа игрока 0: 'solids' | 'stripes' | null — стол открыт
    breakShot: true,
    hand: 'kitchen',       // биток с руки: 'kitchen' — только в «доме» (разбой), 'any' — где угодно, null — нет
    over: null,            // { winner, reason: 'eight' | 'early8' | 'foul8' }
    shots: 0,
    run: 0,                // шаров подряд у бьющего
    bestRun: [0, 0],
    last: null,            // итог прошлого удара: { by, potted, foul, assigned, keep, firstHit }
  };
}

/** Группа игрока: 'solids' | 'stripes' | null, пока стол открыт. */
export const groupFor = (game, who) => (game.group == null ? null : who === 0 ? game.group : otherGroup(game.group));

/** Шары группы, которые ещё на столе. */
export const remaining = (game, group) => (group === 'solids' ? SOLIDS : STRIPES).filter((id) => game.balls[id]);

/** Игрок забил все свои шары — бьёт восьмёрку. */
export function onEight(game, who = game.turn) {
  const group = groupFor(game, who);
  return group != null && remaining(game, group).length === 0;
}

/** Шары, которых битку можно коснуться первыми. */
export function legalFirst(game, who = game.turn) {
  const table = [];
  for (let id = 1; id < 16; id++) if (game.balls[id]) table.push(id);
  if (game.breakShot) return table;
  const group = groupFor(game, who);
  if (group == null) {
    const open = table.filter((id) => id !== 8);
    return open.length ? open : table;
  }
  const mine = remaining(game, group);
  return mine.length ? mine : table.filter((id) => id === 8);
}

/** Можно ли поставить биток с руки в эту точку. */
export function canPlaceCue(game, x, y) {
  if (!game.hand) return false;
  if (game.hand === 'kitchen' && y < HEAD_Y) return false;
  return spotFree(game.balls, x, y, 0);
}

export function placeCue(game, x, y) {
  if (!canPlaceCue(game, x, y)) return false;
  game.balls[0] = [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
  return true;
}

/**
 * Удар: shot = { angle, power, spin }. Считает движение до остановки, применяет правила и меняет партию.
 * → { by, potted: [номера по порядку], pockets: [лузы], foul: null | 'scratch' | 'noHit' | 'wrongBall',
 *     assigned: группа бьющего, если определилась этим ударом, keep: бьёт ли он дальше, firstHit, over, time }.
 */
export function shoot(game, shot) {
  const who = game.turn;
  const legal = legalFirst(game, who);
  const wasOnEight = onEight(game, who);
  const wasBreak = game.breakShot;

  const sim = createSim(game.balls, { record: false });
  strike(sim, shot);
  run(sim);

  const potted = sim.potted.map((p) => p.id);
  const scratch = potted.includes(0);
  const eight = potted.includes(8);
  let foul = null;
  if (scratch) foul = 'scratch';
  else if (sim.firstHit < 0) foul = 'noHit';
  else if (!legal.includes(sim.firstHit)) foul = 'wrongBall';

  game.balls = positions(sim);
  game.shots += 1;
  game.hand = null;
  game.breakShot = false;

  const objects = potted.filter((id) => id !== 0 && id !== 8);
  let assigned = null;
  let keep = false;
  let over = null;
  let respotted = false;

  if (eight) {
    if (wasBreak) {
      game.balls[8] = nearestFree(game.balls, FOOT_SPOT[0], FOOT_SPOT[1], 8);
      respotted = true;
    } else if (wasOnEight && !foul) {
      over = { winner: who, reason: 'eight' };
    } else {
      over = { winner: 1 - who, reason: foul ? 'foul8' : 'early8' };
    }
  }

  let made = 0;
  if (!over && !foul) {
    if (wasBreak) {
      keep = objects.length > 0;
      made = objects.length;
    } else {
      if (game.group == null && objects.length) {
        assigned = kindOf(objects[0]);
        game.group = who === 0 ? assigned : otherGroup(assigned);
      }
      const mine = groupFor(game, who);
      made = mine ? objects.filter((id) => kindOf(id) === mine).length : 0;
      keep = made > 0;
    }
  }

  // упавший биток возвращается на стол — соперник всё равно переставит его с руки
  if (scratch) game.balls[0] = nearestFree(game.balls, HEAD_SPOT[0], HEAD_SPOT[1], 0);

  if (keep) {
    game.run += made;
    game.bestRun[who] = Math.max(game.bestRun[who], game.run);
  } else {
    game.run = 0;
  }
  if (over) {
    game.over = over;
  } else if (!keep) {
    game.turn = 1 - who;
    if (foul) game.hand = 'any';
  }
  game.last = { by: who, potted, foul, assigned, keep, firstHit: sim.firstHit, respotted };
  return { ...game.last, pockets: sim.potted.map((p) => p.pocket), over, time: sim.t };
}

// ---------- сохранение ----------

const isCount = (n, max = 1e7) => Number.isInteger(n) && n >= 0 && n <= max;

/** Сохранённая партия цела: шары на сукне и не друг в друге, биток и восьмёрка на столе, поля — в пределах. */
export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!MODES.includes(s.mode) || !LEVEL_IDS.includes(s.level)) return false;
  if (s.turn !== 0 && s.turn !== 1) return false;
  if (s.group !== null && s.group !== 'solids' && s.group !== 'stripes') return false;
  if (typeof s.breakShot !== 'boolean' || ![null, 'kitchen', 'any'].includes(s.hand)) return false;
  if (s.over !== null) return false;                       // законченные партии не хранятся
  if (!isCount(s.shots) || !isCount(s.run, 15)) return false;
  if (!Array.isArray(s.bestRun) || s.bestRun.length !== 2 || !s.bestRun.every((n) => isCount(n, 15))) return false;
  if (!Array.isArray(s.balls) || s.balls.length !== 16) return false;
  if (!s.balls[0] || !s.balls[8]) return false;
  if (s.breakShot && (s.shots !== 0 || s.group !== null || s.balls.some((b) => !b))) return false;
  for (let i = 0; i < 16; i++) {
    const b = s.balls[i];
    if (b === null) continue;
    if (!Array.isArray(b) || b.length !== 2 || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) return false;
    // шар может «висеть» в створе лузы — чуть за линией борта, но не над самой лузой
    if (b[0] < -R || b[0] > W + R || b[1] < -R || b[1] > L + R) return false;
    for (const p of POCKETS) if ((b[0] - p.x) ** 2 + (b[1] - p.y) ** 2 < p.r * p.r) return false;
    for (let j = 0; j < i; j++) {
      const o = s.balls[j];
      if (o && Math.hypot(b[0] - o[0], b[1] - o[1]) < D - 0.01) return false;
    }
  }
  if (s.last != null) {
    const l = s.last;
    if (typeof l !== 'object' || (l.by !== 0 && l.by !== 1)) return false;
    if (!Array.isArray(l.potted) || !l.potted.every((id) => isCount(id, 15))) return false;
    if (![null, 'scratch', 'noHit', 'wrongBall'].includes(l.foul)) return false;
    if (![null, 'solids', 'stripes'].includes(l.assigned ?? null)) return false;
  }
  return true;
}

// ---------- статистика ----------

const emptyLevel = () => ({ played: 0, wins: 0, losses: 0 });

/** По уровням бота — партий, побед, поражений; вдвоём — партий; лучшая серия шаров подряд. */
export function emptyStats() {
  return { ...Object.fromEntries(LEVEL_IDS.map((id) => [id, emptyLevel()])), friend: { played: 0 }, bestRun: 0 };
}

export function isValidStats(s) {
  if (!s || typeof s !== 'object') return false;
  if (!LEVEL_IDS.every((id) => s[id] && typeof s[id] === 'object' && ['played', 'wins', 'losses'].every((k) => isCount(s[id][k])))) return false;
  return Boolean(s.friend) && isCount(s.friend.played) && isCount(s.bestRun, 15);
}

/** Статистика из хранилища: чего нет или испорчено — нули. */
export function migrateStats(saved) {
  const stats = emptyStats();
  for (const id of LEVEL_IDS) {
    for (const k of ['played', 'wins', 'losses']) if (isCount(saved?.[id]?.[k])) stats[id][k] = saved[id][k];
  }
  if (isCount(saved?.friend?.played)) stats.friend.played = saved.friend.played;
  if (isCount(saved?.bestRun, 15)) stats.bestRun = saved.bestRun;
  return stats;
}

/** Записать законченную партию: winner — кто победил (0 или 1). Серия — у человека, вдвоём — лучшая из двух. */
export function recordGame(stats, game, winner) {
  if (game.mode === 'friend') {
    stats.friend.played += 1;
    stats.bestRun = Math.max(stats.bestRun, game.bestRun[0], game.bestRun[1]);
    return stats;
  }
  const lv = stats[game.level];
  lv.played += 1;
  if (winner === 0) lv.wins += 1;
  else lv.losses += 1;
  stats.bestRun = Math.max(stats.bestRun, game.bestRun[0]);
  return stats;
}
