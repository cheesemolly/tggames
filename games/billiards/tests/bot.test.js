// Бот бильярда: находит прямые удары, забивает простое, ставит биток с руки, не фолит без нужды, уровни.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, L, D, HEAD_Y, POCKET_AIM } from '../physics.js';
import { LEVEL_IDS, newGame, shoot, placeCue, canPlaceCue, legalFirst, isValidState } from '../logic.js';
import { LEVELS, directShots, preview, planShot } from '../bot.js';

function rngOf(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function axis(k) {
  const aim = POCKET_AIM[k];
  const sx = aim[0] < W / 2 ? 1 : -1;
  return k < 4 ? [sx * Math.SQRT1_2, (aim[1] < L / 2 ? 1 : -1) * Math.SQRT1_2] : [sx, 0];
}
const onAxis = (k, dist) => [POCKET_AIM[k][0] + axis(k)[0] * dist, POCKET_AIM[k][1] + axis(k)[1] * dist];
function midGame(spots, patch = {}) {
  const game = newGame({ mode: 'bot', level: 'easy' }, rngOf(1));
  game.balls = new Array(16).fill(null);
  for (const [id, at] of Object.entries(spots)) game.balls[id] = at;
  Object.assign(game, { breakShot: false, hand: null, shots: 5 }, patch);
  return game;
}
/** Сделать задуманный ботом удар. */
async function act(game, level, seed = 1) {
  const shot = await planShot(game, level, rngOf(seed));
  if (shot.cue) assert.equal(placeCue(game, shot.cue[0], shot.cue[1]), true, 'бот ставит биток в разрешённое место');
  return { shot, res: shoot(game, shot) };
}

test('уровни: описаны все, каждый следующий точнее и думает над большим числом вариантов', () => {
  assert.deepEqual(Object.keys(LEVELS), LEVEL_IDS);
  for (let k = 1; k < LEVEL_IDS.length; k++) {
    const a = LEVELS[LEVEL_IDS[k - 1]];
    const b = LEVELS[LEVEL_IDS[k]];
    assert.ok(b.aim < a.aim && b.power < a.power && b.look > a.look && b.slip <= a.slip);
    assert.ok(b.powers.length >= a.powers.length);
  }
});

test('прямые удары: простой впереди, закрытые дорожки и слишком тонкие резки отброшены', () => {
  const balls = new Array(16).fill(null);
  balls[0] = onAxis(0, 70);
  balls[1] = onAxis(0, 35);          // прямо в левую верхнюю
  balls[2] = [W / 2, 150];
  const shots = directShots(balls, balls[0], [1, 2]);
  assert.ok(shots.length >= 2);
  assert.equal(shots[0].id, 1);
  assert.equal(shots[0].pocket, 0);
  assert.ok(shots[0].cut > 0.999, 'в лоб');
  for (let k = 1; k < shots.length; k++) assert.ok(shots[k].hard >= shots[k - 1].hard);
  for (const s of shots) assert.ok(s.cut >= Math.cos((72 * Math.PI) / 180));
  // чужой шар на дорожке к лузе — этого удара больше нет
  balls[9] = onAxis(0, 18);
  assert.ok(!directShots(balls, balls[0], [1]).some((s) => s.pocket === 0));
  // и на дорожке битка
  balls[9] = onAxis(0, 52);
  assert.ok(!directShots(balls, balls[0], [1]).some((s) => s.pocket === 0));
  assert.deepEqual(directShots(balls, balls[0], []), []);
});

test('расчёт удара не меняет партию', () => {
  const game = midGame({ 0: onAxis(0, 70), 1: onAxis(0, 35), 8: [W / 2, 30], 9: [80, 150] });
  const before = JSON.stringify(game);
  const res = preview(game, { angle: Math.atan2(-axis(0)[1], -axis(0)[0]), power: 0.4, spin: [0, -0.5] });
  assert.deepEqual(res.potted, [1]);
  assert.equal(res.scratch, false);
  assert.equal(res.balls[1], null);
  assert.equal(JSON.stringify(game), before);
});

test('простой шар у лузы забивают все уровни, кроме самого слабого, — почти всегда', async () => {
  const made = {};
  for (const level of LEVEL_IDS) {
    made[level] = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const game = midGame({ 0: [W / 2, 120], 1: onAxis(1, 30), 8: [20, 40], 9: [20, 170], 2: [80, 170] }, { group: 'stripes', turn: 1 });
      const { res } = await act(game, level, seed);
      assert.notEqual(res.foul, 'noHit', `${level}: мимо всего`);
      if (res.keep) made[level] += 1;                     // забит свой шар (1 или 2 — какой бот счёл проще)
    }
  }
  assert.ok(made.master >= 19, `мастер: ${made.master} из 20`);
  assert.ok(made.hard >= 15, `сложный: ${made.hard} из 20`);
  assert.ok(made.medium >= 11, `средний: ${made.medium} из 20`);
  assert.ok(made.easy <= made.medium && made.easy >= 2, `лёгкий: ${made.easy} из 20`);
});

test('биток с руки: бот ставит его под прямой удар и забивает', async () => {
  let made = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const game = midGame({ 0: [10, 190], 3: [60, 60], 8: [20, 100], 9: [80, 150], 10: [30, 150] }, { group: 'solids', turn: 0, hand: 'any' });
    const shot = await planShot(game, 'master', rngOf(seed));
    assert.ok(shot.cue, 'место для битка выбрано');
    assert.ok(canPlaceCue(game, shot.cue[0], shot.cue[1]));
    placeCue(game, shot.cue[0], shot.cue[1]);
    const res = shoot(game, shot);
    assert.equal(res.foul, null);
    if (res.potted.includes(3)) made += 1;
  }
  assert.ok(made >= 7, `забито ${made} из 8`);
});

test('разбой бота: биток из «дома», пирамида задета', async () => {
  for (const level of LEVEL_IDS) {
    const game = newGame({ mode: 'bot', level }, rngOf(7));
    game.turn = 1;
    const shot = await planShot(game, level, rngOf(3));
    assert.ok(shot.cue && shot.cue[1] >= HEAD_Y, 'биток в доме');
    assert.ok(shot.power > 0.8, 'разбой — сильный удар');
    assert.equal(placeCue(game, shot.cue[0], shot.cue[1]), true);
    const res = shoot(game, shot);
    assert.ok(res.firstHit > 0, `${level}: пирамида задета`);
    assert.ok(isValidState(game) || game.over);
  }
});

test('свой шар закрыт чужим: бот находит законный удар от борта', async () => {
  // биток — чужой шар вплотную — свой: прямой дорожки нет
  const game = midGame({ 0: [W / 2, 120], 9: [W / 2, 100], 1: [W / 2, 80], 8: [20, 30] }, { group: 'solids', turn: 0 });
  assert.deepEqual(legalFirst(game), [1]);
  const { res } = await act(game, 'master', 2);
  assert.equal(res.foul, null, `первым задет шар ${res.firstHit}`);
  assert.equal(res.firstHit, 1);
});

test('бот не бьёт восьмёрку раньше времени, даже если она висит в лузе', async () => {
  for (let seed = 1; seed <= 6; seed++) {
    const game = midGame({ 0: onAxis(2, 60), 8: onAxis(2, 12), 9: [70, 60], 10: [30, 60], 2: [80, 150] }, { group: 'solids', turn: 1 });
    const { res } = await act(game, 'hard', seed);
    assert.ok(!res.potted.includes(8), 'восьмёрка осталась на столе');
    assert.equal(game.over, null);
  }
});

test('на восьмёрке бот её забивает и выигрывает', async () => {
  let wins = 0;
  for (let seed = 1; seed <= 6; seed++) {
    // у бота (игрок 1) полосатые — все забиты; восьмёрка у средней лузы, биток чуть в стороне от её оси
    const game = midGame({ 0: [onAxis(4, 70)[0], onAxis(4, 70)[1] + 9], 8: onAxis(4, 30), 2: [80, 150], 3: [20, 40] }, { group: 'solids', turn: 1 });
    await act(game, 'master', seed);
    if (game.over?.winner === 1 && game.over.reason === 'eight') wins += 1;
  }
  assert.ok(wins >= 5, `побед ${wins} из 6`);
});

test('партии бота с самим собой: всё по правилам, партия кончается, сильный обыгрывает слабого', async () => {
  let strong = 0;
  for (let g = 0; g < 6; g++) {
    const rng = rngOf(200 + g);
    const game = newGame({ mode: 'bot', level: 'easy' }, rng);
    game.turn = g % 2;
    let guard = 0;
    while (!game.over) {
      assert.ok(guard++ < 300, 'партия не кончается');
      const who = game.turn;
      const shot = await planShot(game, who === 0 ? 'master' : 'easy', rng);
      if (shot.cue) assert.equal(placeCue(game, shot.cue[0], shot.cue[1]), true);
      assert.ok(Number.isFinite(shot.angle) && shot.power > 0 && shot.power <= 1);
      const res = shoot(game, shot);
      assert.ok(res.time < 60);
      if (!game.over) assert.ok(isValidState(game), 'состояние после удара цело');
    }
    assert.ok(['eight', 'early8', 'foul8'].includes(game.over.reason));
    if (game.over.winner === 0) strong += 1;
  }
  assert.ok(strong >= 5, `мастер выиграл ${strong} из 6`);
});
