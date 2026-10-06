// Бот бильярда: выбирает удар так же, как человек, — ищет шар, который «смотрит» в лузу, целится в точку
// касания («шар-призрак»), а потом проверяет задуманное настоящим расчётом (physics.js): упадёт ли шар, не
// улетит ли биток в лузу, не заденет ли он сначала чужой шар. Уровни отличаются точностью руки и тем, сколько
// вариантов бот успевает обдумать; сильные ещё и смотрят, удобно ли встанет биток под следующий удар.

import {
  W, L, R, D, POCKET_AIM, HEAD_Y, createSim, strike, run, positions, laneClear,
} from './physics.js';
import { legalFirst, groupFor, kindOf, otherGroup, onEight, canPlaceCue } from './logic.js';

const DEG = Math.PI / 180;

/**
 * aim — разброс прицела (градусы, среднеквадратичный), power — разброс силы (доля), look — сколько лучших
 * вариантов проверять расчётом, powers — какие силы пробовать, spins — точки удара по высоте (0 — центр),
 * plan — учитывать ли выход под следующий шар, sure — перепроверять ли удар «дрогнувшей рукой»,
 * slip — как часто бить «не подумав» по первому попавшемуся шару.
 * Подобрано партиями бота с самим собой — шаров за подход: ≈ 0,6 / 1,3 / 2,3 / 4.
 */
export const LEVELS = {
  easy: { aim: 1.05, power: 0.16, look: 3, powers: [0.3, 0.5], spins: [0], plan: false, sure: false, slip: 0.3 },
  medium: { aim: 0.38, power: 0.09, look: 5, powers: [0.26, 0.4, 0.58], spins: [0], plan: false, sure: false, slip: 0.08 },
  hard: { aim: 0.24, power: 0.05, look: 8, powers: [0.22, 0.33, 0.46, 0.62], spins: [0, -0.6], plan: true, sure: false, slip: 0 },
  master: { aim: 0.1, power: 0.03, look: 14, powers: [0.2, 0.3, 0.42, 0.56, 0.72], spins: [0, -0.6, 0.6], plan: true, sure: true, slip: 0 },
};

/** Случайная величина с нормальным распределением (Бокс — Мюллер). */
function gauss(rng) {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// ось каждой лузы — куда в неё удобно катить шар
const AXIS = [
  [-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0], [1, 0],
];
const MAX_CUT = Math.cos(72 * DEG);
const MIN_ENTRY = [Math.cos(52 * DEG), Math.cos(62 * DEG)];   // угловая, средняя: под каким углом шар ещё пройдёт

/**
 * Прямые удары «шар — в лузу» из положения битка cue: для каждого разрешённого шара и каждой лузы —
 * куда целить, угол резки, расстояния. Только те, где обе дорожки свободны. По возрастанию трудности.
 */
export function directShots(balls, cue, targets) {
  const out = [];
  for (const id of targets) {
    const b = balls[id];
    if (!b) continue;
    for (let k = 0; k < 6; k++) {
      const tx = POCKET_AIM[k][0] - b[0];
      const ty = POCKET_AIM[k][1] - b[1];
      const d2 = Math.hypot(tx, ty);
      if (d2 < 1e-6) continue;
      const ux = tx / d2;
      const uy = ty / d2;
      if (ux * AXIS[k][0] + uy * AXIS[k][1] < MIN_ENTRY[k < 4 ? 0 : 1]) continue;
      const gx = b[0] - ux * D;
      const gy = b[1] - uy * D;
      if (gx < R || gx > W - R || gy < R || gy > L - R) continue;
      const vx = gx - cue[0];
      const vy = gy - cue[1];
      const d1 = Math.hypot(vx, vy);
      if (d1 < 0.5) continue;
      const cut = (vx * ux + vy * uy) / d1;
      if (cut < MAX_CUT) continue;
      if (!laneClear(balls, cue[0], cue[1], gx, gy, [0, id])) continue;
      if (!laneClear(balls, b[0], b[1], POCKET_AIM[k][0], POCKET_AIM[k][1], [0, id])) continue;
      // трудность: чем дальше и чем тоньше резка, тем труднее попасть
      const hard = (d1 * (d2 + 12)) / (cut * cut);
      out.push({ id, pocket: k, angle: Math.atan2(vy, vx), d1, d2, cut, hard });
    }
  }
  return out.sort((a, b) => a.hard - b.hard);
}

/** Что будет после удара: расчёт на копии стола. → { legal, potted, scratch, firstHit, balls } */
export function preview(game, shot) {
  const sim = createSim(game.balls, { record: false });
  strike(sim, shot);
  run(sim);
  const potted = sim.potted.map((p) => p.id);
  return { potted, scratch: potted.includes(0), firstHit: sim.firstHit, balls: positions(sim) };
}

/** Оценка удара для бьющего: победа, свой шар, фол, проигрыш на восьмёрке. */
function judge(game, shot, cfg) {
  const who = game.turn;
  const legal = legalFirst(game, who);
  const res = preview(game, shot);
  const eight = res.potted.includes(8);
  const foul = res.scratch || res.firstHit < 0 || !legal.includes(res.firstHit);
  const mine = groupFor(game, who);
  const own = res.potted.filter((id) => id !== 0 && id !== 8 && (game.breakShot || mine == null || kindOf(id) === mine));
  let score = 0;
  if (eight && !game.breakShot) score = onEight(game, who) && !foul ? 1000 : -1000;
  else if (foul) score = -200;
  else score = own.length * 100;
  if (score > 0 && score < 1000 && cfg.plan && res.balls[0]) {
    // выход: сколько простых ударов останется с нового места битка
    let group = game.group;
    if (group == null && !game.breakShot) group = who === 0 ? kindOf(own[0]) : otherGroup(kindOf(own[0]));
    const next = { ...game, balls: res.balls, breakShot: false, group };
    const shots = directShots(res.balls, res.balls[0], legalFirst(next, who));
    if (shots.length) score += 30 - Math.min(25, shots[0].hard / 400);
    else score -= 15;
  }
  // сильный удар без нужды — хуже контроль
  score -= shot.power * 6;
  return { score, foul, own: own.length, res };
}

/** Где поставить биток с руки: за шаром на линии «луза — шар», откуда удар прямой. */
function placeForHand(game, rng) {
  const who = game.turn;
  if (game.breakShot) return [W / 2 + (rng() - 0.5) * 30, HEAD_Y + 6 + rng() * 6];
  const targets = legalFirst(game, who);
  let best = null;
  for (const id of targets) {
    const b = game.balls[id];
    for (let k = 0; k < 6; k++) {
      const tx = POCKET_AIM[k][0] - b[0];
      const ty = POCKET_AIM[k][1] - b[1];
      const d2 = Math.hypot(tx, ty);
      const ux = tx / d2;
      const uy = ty / d2;
      if (ux * AXIS[k][0] + uy * AXIS[k][1] < MIN_ENTRY[k < 4 ? 0 : 1]) continue;
      if (!laneClear(game.balls, b[0], b[1], POCKET_AIM[k][0], POCKET_AIM[k][1], [0, id])) continue;
      for (const back of [28, 40, 18, 55]) {
        const px = b[0] - ux * (D + back);
        const py = b[1] - uy * (D + back);
        if (!canPlaceCue(game, px, py)) continue;
        if (!laneClear(game.balls, px, py, b[0] - ux * D, b[1] - uy * D, [0, id])) continue;
        const cost = d2 + back * 0.3;
        if (!best || cost < best.cost) best = { cost, at: [px, py] };
        break;
      }
    }
  }
  if (best) return best.at;
  // прямого удара нет нигде — ставим туда, откуда хотя бы виден свой шар
  for (let tries = 0; tries < 300; tries++) {
    const px = R + rng() * (W - D);
    const py = R + rng() * (L - D);
    if (!canPlaceCue(game, px, py)) continue;
    if (targets.some((id) => laneClear(game.balls, px, py, game.balls[id][0], game.balls[id][1], [0, id]))) return [px, py];
  }
  return game.balls[0];
}

/**
 * Выбор удара. → { cue: [x, y] | null (куда поставить биток с руки), angle, power, spin }.
 * pause — необязательная функция «передышки» между расчётами (чтобы экран не замирал).
 */
export async function planShot(game, level = game.level, rng = Math.random, pause = null) {
  const cfg = LEVELS[level] ?? LEVELS.easy;
  const who = game.turn;
  let cue = null;
  let table = game;
  if (game.hand) {
    cue = placeForHand(game, rng);
    const balls = game.balls.slice();
    balls[0] = cue;
    table = { ...game, balls };
  }
  const from = table.balls[0];
  const noisy = (shot) => ({
    cue,
    angle: shot.angle + gauss(rng) * cfg.aim * DEG,
    power: Math.max(0.05, Math.min(1, shot.power * (1 + gauss(rng) * cfg.power))),
    spin: shot.spin,
  });

  // разбой: в переднюю точку пирамиды, со всей силы
  if (game.breakShot) {
    let apex = null;
    for (let id = 1; id < 16; id++) if (table.balls[id] && (!apex || table.balls[id][1] > apex[1])) apex = table.balls[id];
    const angle = Math.atan2(apex[1] - from[1], apex[0] - from[0]);
    return noisy({ angle, power: 0.96, spin: [0, 0.15] });
  }

  const targets = legalFirst(table, who);
  let sims = 0;
  const breathe = async () => {
    sims += 1;
    if (pause && sims % 6 === 0) await pause();
  };

  // «не подумав»: слабый бот иногда просто бьёт по ближайшему своему шару
  if (rng() < cfg.slip) {
    const seen = targets.filter((id) => laneClear(table.balls, from[0], from[1], table.balls[id][0], table.balls[id][1], [0, id]));
    if (seen.length) {
      const b = table.balls[seen[Math.floor(rng() * seen.length)]];
      return noisy({ angle: Math.atan2(b[1] - from[1], b[0] - from[0]) + (rng() - 0.5) * 0.05, power: 0.3 + rng() * 0.3, spin: [0, 0] });
    }
  }

  // прямые удары в лузу — лучшие проверяем расчётом
  const shots = directShots(table.balls, from, targets).slice(0, cfg.look);
  const options = [];
  for (const s of shots) {
    for (const power of cfg.powers) {
      for (const top of cfg.spins) {
        const shot = { angle: s.angle, power, spin: [0, top] };
        const j = judge(table, shot, cfg);
        await breathe();
        // лёгкий удар надёжнее: при равных очках — тот, что проще
        if (j.score > 0) options.push({ value: j.score - s.hard / 2000, shot });
      }
    }
  }
  options.sort((a, b) => b.value - a.value);
  if (options.length) {
    let best = options[0];
    if (cfg.sure) {
      // Сильнейший бот перепроверяет лучшие варианты «дрогнувшей рукой»: чуть левее и сильнее, чуть правее и тише.
      // Удар, который забивает только при идеальном исполнении (или роняет биток следом за шаром), отпадает.
      const wobble = Math.max(cfg.aim, 0.12) * DEG;
      let sure = -Infinity;
      for (const o of options.slice(0, 5)) {
        let worst = o.value;
        for (const [da, dp] of [[wobble, 1.06], [-wobble, 0.94]]) {
          const j = judge(table, { ...o.shot, angle: o.shot.angle + da, power: Math.min(1, o.shot.power * dp) }, cfg);
          await breathe();
          worst = Math.min(worst, j.score);
        }
        if (worst > sure) {
          sure = worst;
          best = o;
        }
      }
    }
    return noisy(best.shot);
  }

  // забить нечего — хотя бы сыграть по правилам: коснуться своего шара и не уронить биток
  let safe = null;
  const consider = async (shot) => {
    const j = judge(table, shot, cfg);
    await breathe();
    if (!j.foul && j.score > -500 && (!safe || j.score > safe.score)) safe = { score: j.score, shot };
  };
  for (const id of targets) {
    const b = table.balls[id];
    if (!laneClear(table.balls, from[0], from[1], b[0], b[1], [0, id])) continue;
    const angle = Math.atan2(b[1] - from[1], b[0] - from[0]);
    for (const power of [0.22, 0.38]) await consider({ angle, power, spin: [0, 0] });
    if (safe) break;
  }
  // своих шаров не видно — от борта: перебор направлений
  if (!safe) {
    const start = rng() * Math.PI * 2;
    for (let k = 0; k < 72 && !safe; k++) {
      await consider({ angle: start + (k / 72) * Math.PI * 2, power: 0.45, spin: [0, 0] });
    }
  }
  if (safe) return noisy(safe.shot);
  // ничего законного не нашлось — тихо в сторону ближайшего своего шара
  const near = targets.map((id) => table.balls[id]).sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]))[0];
  return noisy({ angle: near ? Math.atan2(near[1] - from[1], near[0] - from[0]) : -Math.PI / 2, power: 0.3, spin: [0, 0] });
}
