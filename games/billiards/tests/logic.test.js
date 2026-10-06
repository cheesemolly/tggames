// Правила «восьмёрки»: разбой, открытый стол, группы, фолы, биток с руки, победа и поражение на восьмёрке.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, L, R, D, HEAD_Y, HEAD_SPOT, FOOT_SPOT, POCKET_AIM, spotFree } from '../physics.js';
import {
  LEVEL_IDS, MODES, SOLIDS, STRIPES, kindOf, otherGroup, newGame, groupFor, remaining, onEight, legalFirst,
  canPlaceCue, placeCue, shoot, isValidState, emptyStats, isValidStats, migrateStats, recordGame,
} from '../logic.js';

function rngOf(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ось лузы k — от лузы к середине стола. */
function axis(k) {
  const aim = POCKET_AIM[k];
  const sx = aim[0] < W / 2 ? 1 : -1;
  return k < 4 ? [sx * Math.SQRT1_2, (aim[1] < L / 2 ? 1 : -1) * Math.SQRT1_2] : [sx, 0];
}
/** Точка на оси лузы k в dist сантиметрах от неё. */
function onAxis(k, dist) {
  const a = axis(k);
  return [POCKET_AIM[k][0] + a[0] * dist, POCKET_AIM[k][1] + a[1] * dist];
}
/** Удар вдоль оси в лузу k (с оттяжкой — чтобы биток не укатился следом). */
const into = (k, power = 0.4, spin = [0, -0.5]) => ({ angle: Math.atan2(-axis(k)[1], -axis(k)[0]), power, spin });

/** Партия посреди игры с заданными шарами: { номер: [x, y] }. */
function midGame(spots, patch = {}) {
  const game = newGame({ mode: 'bot', level: 'easy' }, rngOf(1));
  game.balls = new Array(16).fill(null);
  for (const [id, at] of Object.entries(spots)) game.balls[id] = at;
  Object.assign(game, { breakShot: false, hand: null, shots: 5 }, patch);
  return game;
}
const FAR = { 8: [W / 2, 30], 9: [20, 40], 10: [80, 40], 2: [20, 170], 3: [80, 170] };

test('новая партия: пирамида, биток в «доме», разбивает первый игрок, стол открыт', () => {
  const game = newGame({ mode: 'friend', level: 'hard' }, rngOf(2));
  assert.equal(game.mode, 'friend');
  assert.equal(game.level, 'hard');
  assert.equal(game.turn, 0);
  assert.equal(game.group, null);
  assert.equal(game.breakShot, true);
  assert.equal(game.hand, 'kitchen');
  assert.deepEqual(game.balls[0], HEAD_SPOT);
  assert.equal(game.balls.filter(Boolean).length, 16);
  assert.ok(isValidState(game));
  assert.ok(isValidState(JSON.parse(JSON.stringify(game))), 'переживает JSON');
  assert.equal(newGame({ mode: 'нет', level: 'нет' }).mode, 'bot');
  assert.equal(newGame({ mode: 'нет', level: 'нет' }).level, 'easy');
  assert.deepEqual(MODES, ['bot', 'friend']);
  assert.equal(legalFirst(game).length, 15, 'на разбое можно бить в любой шар');
});

test('шары: сплошные 1–7, восьмёрка, полосатые 9–15', () => {
  assert.equal(kindOf(0), 'cue');
  assert.equal(kindOf(8), 'eight');
  for (const id of SOLIDS) assert.equal(kindOf(id), 'solids');
  for (const id of STRIPES) assert.equal(kindOf(id), 'stripes');
  assert.equal(otherGroup('solids'), 'stripes');
  assert.equal(otherGroup('stripes'), 'solids');
});

test('разбой: стол остаётся открытым; забил — бьёшь дальше, не забил — ход переходит', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const game = newGame({}, rngOf(seed));
    let apex = null;
    for (let id = 1; id < 16; id++) if (!apex || game.balls[id][1] > apex[1]) apex = game.balls[id];
    const res = shoot(game, { angle: Math.atan2(apex[1] - HEAD_SPOT[1], apex[0] - HEAD_SPOT[0]) + (seed - 6) * 0.0015, power: 1, spin: [0, 0.2] });
    assert.equal(game.breakShot, false);
    assert.equal(game.group, null, 'группы после разбоя не определяются');
    assert.equal(game.shots, 1);
    assert.ok(game.balls[8], 'восьмёрка на столе');
    assert.ok(game.balls[0], 'биток на столе');
    const objects = res.potted.filter((id) => id !== 0 && id !== 8);
    if (res.foul) {
      assert.equal(res.keep, false);
      assert.equal(game.hand, 'any');
      assert.equal(game.turn, 1);
    } else {
      assert.equal(res.keep, objects.length > 0);
      assert.equal(game.turn, objects.length > 0 ? 0 : 1);
      assert.equal(game.hand, null);
    }
    seen.add(res.foul ? 'foul' : res.keep ? 'keep' : 'pass');
    assert.ok(isValidState(game));
  }
  assert.ok(seen.has('keep') && seen.has('pass'), `исходы разбоя: ${[...seen].join(', ')}`);
});

test('разбой мимо пирамиды — фол, сопернику биток с руки', () => {
  const game = newGame({}, rngOf(3));
  const res = shoot(game, { angle: Math.PI / 2, power: 0.1, spin: [0, 0] });
  assert.equal(res.foul, 'noHit');
  assert.equal(game.turn, 1);
  assert.equal(game.hand, 'any');
  assert.equal(game.last.foul, 'noHit');
});

test('восьмёрка, упавшая на разбое, возвращается на стол, партия продолжается', () => {
  const game = midGame({ 0: onAxis(1, 65), 8: onAxis(1, 35), 2: [20, 170], 9: [80, 170] }, { breakShot: true, shots: 0 });
  const res = shoot(game, into(1));
  assert.deepEqual(res.potted, [8]);
  assert.equal(res.over, null);
  assert.equal(game.over, null);
  assert.ok(game.balls[8]);
  assert.ok(Math.hypot(game.balls[8][0] - FOOT_SPOT[0], game.balls[8][1] - FOOT_SPOT[1]) < D * 2);
  assert.equal(res.respotted, true);
  assert.equal(game.turn, 1, 'больше ничего не упало — ход переходит');
});

test('открытый стол: забитый шар определяет группы, бьющий продолжает', () => {
  for (const who of [0, 1]) {
    for (const id of [3, 12]) {
      const game = midGame({ ...FAR, 0: onAxis(0, 65), [id]: onAxis(0, 35) }, { turn: who });
      assert.equal(groupFor(game, who), null);
      assert.ok(!legalFirst(game).includes(8), 'на открытом столе восьмёрку первой бить нельзя');
      const res = shoot(game, into(0));
      assert.deepEqual(res.potted, [id]);
      assert.equal(res.foul, null);
      assert.equal(res.assigned, kindOf(id));
      assert.equal(groupFor(game, who), kindOf(id));
      assert.equal(groupFor(game, 1 - who), otherGroup(kindOf(id)));
      assert.equal(res.keep, true);
      assert.equal(game.turn, who);
      assert.equal(game.run, 1);
      assert.equal(game.balls[id], null);
      assert.ok(isValidState(game));
    }
  }
});

test('открытый стол: первой задета восьмёрка — фол', () => {
  const game = midGame({ 0: [W / 2, 60], 8: [W / 2, 30], 2: [20, 170], 9: [80, 170] });
  const res = shoot(game, { angle: -Math.PI / 2, power: 0.2, spin: [0, 0] });
  assert.equal(res.firstHit, 8);
  assert.equal(res.foul, 'wrongBall');
  assert.equal(game.hand, 'any');
  assert.equal(game.group, null);
});

test('свои шары: первым задет чужой — фол; свой без забитого — ход просто переходит', () => {
  // у игрока 0 сплошные; биток смотрит на полосатый 9
  const foul = midGame({ ...FAR, 0: [20, 70] }, { group: 'solids' });
  assert.deepEqual(legalFirst(foul).sort(), [2, 3]);
  const r1 = shoot(foul, { angle: -Math.PI / 2, power: 0.2, spin: [0, 0] });
  assert.equal(r1.firstHit, 9);
  assert.equal(r1.foul, 'wrongBall');
  assert.equal(foul.turn, 1);
  assert.equal(foul.hand, 'any');
  // тот же удар за игрока 1 (у него полосатые) — законный, но шар не забит
  const fair = midGame({ ...FAR, 0: [20, 70] }, { group: 'solids', turn: 1 });
  const r2 = shoot(fair, { angle: -Math.PI / 2, power: 0.2, spin: [0, 0] });
  assert.equal(r2.foul, null);
  assert.equal(r2.keep, false);
  assert.equal(fair.turn, 0);
  assert.equal(fair.hand, null);
});

test('забил чужой шар после касания своего — не фол, но ход переходит, шар остаётся в лузе', () => {
  // биток → свой (сплошной 1) → чужой полосатый 9 → луза: три шара на оси
  const game = midGame({ 8: [W / 2, 30], 0: onAxis(3, 80), 1: onAxis(3, 52), 9: onAxis(3, 24), 2: [20, 40] }, { group: 'solids' });
  const res = shoot(game, into(3, 0.5));
  assert.equal(res.firstHit, 1);
  assert.equal(res.foul, null);
  assert.ok(res.potted.includes(9));
  assert.equal(game.balls[9], null);
  if (!res.potted.includes(1)) {
    assert.equal(res.keep, false);
    assert.equal(game.turn, 1);
    assert.equal(game.hand, null);
  }
});

test('биток в лузе — фол: он возвращается на стол, сопернику — с руки куда угодно', () => {
  const game = midGame({ ...FAR, 0: onAxis(5, 40) }, { group: 'solids' });
  const res = shoot(game, into(5, 0.4, [0, 0]));
  assert.deepEqual(res.potted, [0]);
  assert.equal(res.foul, 'scratch');
  assert.ok(game.balls[0], 'биток снова на столе');
  assert.ok(spotFree(game.balls, game.balls[0][0], game.balls[0][1], 0));
  assert.equal(game.turn, 1);
  assert.equal(game.hand, 'any');
  assert.ok(isValidState(game));
  // соперник ставит биток куда угодно
  assert.equal(canPlaceCue(game, 50, 20), true);
  assert.equal(placeCue(game, 50, 20), true);
  assert.deepEqual(game.balls[0], [50, 20]);
});

test('биток с руки: на разбое — только в «доме», нигде — на шаре, в борту или в створе лузы', () => {
  const game = newGame({}, rngOf(4));
  assert.equal(canPlaceCue(game, W / 2, HEAD_Y + 10), true);
  assert.equal(canPlaceCue(game, W / 2, HEAD_Y - 1), false, 'выше линии дома');
  assert.equal(canPlaceCue(game, 1, HEAD_Y + 10), false, 'в борту');
  assert.equal(canPlaceCue(game, 4, L - 4), false, 'в лузе');
  assert.equal(placeCue(game, W / 2, 100), false);
  assert.deepEqual(game.balls[0], HEAD_SPOT);
  const play = midGame({ ...FAR, 0: [50, 100] }, { hand: 'any' });
  assert.equal(canPlaceCue(play, 20 + R, 40), false, 'на шаре');
  assert.equal(canPlaceCue(play, 50, 100), true, 'на своём же месте');
  assert.equal(canPlaceCue(midGame({ ...FAR, 0: [50, 100] }), 60, 100), false, 'без права руки — нельзя');
});

test('победа: свои забиты, восьмёрка в лузе без фола', () => {
  for (const who of [0, 1]) {
    // у игрока 0 сплошные, у игрока 1 полосатые; на столе остались только чужие для бьющего шары
    const game = midGame({ 0: onAxis(4, 65), 8: onAxis(4, 35), 9: [20, 40], 10: [80, 40] }, { group: 'solids', turn: who });
    if (who === 1) {
      game.balls[9] = null;
      game.balls[10] = null;
      game.balls[2] = [20, 40];
    }
    assert.equal(onEight(game, who), true);
    assert.deepEqual(legalFirst(game, who), [8]);
    const res = shoot(game, into(4));
    assert.deepEqual(res.potted, [8]);
    assert.deepEqual(res.over, { winner: who, reason: 'eight' });
    assert.deepEqual(game.over, { winner: who, reason: 'eight' });
    assert.equal(isValidState(game), false, 'законченная партия не сохраняется');
  }
});

test('поражение: восьмёрка забита раньше своих шаров', () => {
  // биток → свой сплошной 1 → восьмёрка → луза
  const game = midGame({ 0: onAxis(5, 80), 1: onAxis(5, 52), 8: onAxis(5, 24), 9: [20, 40] }, { group: 'solids' });
  assert.equal(onEight(game, 0), false);
  // тихо и с оттяжкой: на сильном ударе биток оттягивается через весь стол в среднюю лузу напротив
  const res = shoot(game, into(5, 0.35, [0, -0.6]));
  assert.equal(res.firstHit, 1);
  assert.deepEqual(res.potted, [8]);
  assert.equal(res.foul, null);
  assert.deepEqual(res.over, { winner: 1, reason: 'early8' });
});

test('поражение: восьмёрка забита с фолом — задета первой не в свой черёд или биток упал следом', () => {
  const wrong = midGame({ 0: onAxis(0, 65), 8: onAxis(0, 35), 1: [80, 170], 9: [20, 170] }, { group: 'solids' });
  const r1 = shoot(wrong, into(0));
  assert.equal(r1.foul, 'wrongBall');
  assert.deepEqual(r1.over, { winner: 1, reason: 'foul8' });
  // свои забиты, но биток с накатом укатился в ту же лузу
  const scratch = midGame({ 0: onAxis(0, 34), 8: onAxis(0, 14), 9: [80, 170] }, { group: 'solids' });
  const r2 = shoot(scratch, into(0, 0.55, [0, 1]));
  assert.ok(r2.potted.includes(8) && r2.potted.includes(0), `упали: ${r2.potted}`);
  assert.deepEqual(r2.over, { winner: 1, reason: 'foul8' });
});

test('серия: шары подряд за один подход, лучшая запоминается, после промаха — с нуля', () => {
  const game = midGame({ 8: [W / 2, 30], 9: [20, 40], 0: onAxis(1, 65), 1: onAxis(1, 35), 2: onAxis(3, 35), 3: [20, 170] }, { group: 'solids' });
  shoot(game, into(1));
  assert.equal(game.run, 1);
  assert.equal(game.turn, 0);
  game.balls[0] = onAxis(3, 65);
  shoot(game, into(3));
  assert.equal(game.run, 2);
  assert.deepEqual(game.bestRun, [2, 0]);
  assert.deepEqual(remaining(game, 'solids'), [3]);
  game.balls[0] = [W / 2, 100];
  const miss = shoot(game, { angle: Math.PI / 2, power: 0.05, spin: [0, 0] });
  assert.equal(miss.foul, 'noHit');
  assert.equal(game.run, 0);
  assert.deepEqual(game.bestRun, [2, 0]);
});

test('сохранение: испорченное не принимается', () => {
  const good = () => midGame({ ...FAR, 0: [50, 100] }, { group: 'solids' });
  assert.ok(isValidState(good()));
  const withBall = (id, at) => {
    const g = good();
    g.balls[id] = at;
    return g;
  };
  const broken = [
    null, 7, {},
    { ...good(), v: 2 },
    { ...good(), mode: 'сеть' },
    { ...good(), level: 'бог' },
    { ...good(), turn: 2 },
    { ...good(), group: 'красные' },
    { ...good(), hand: 'везде' },
    { ...good(), breakShot: 'да' },
    { ...good(), over: { winner: 0, reason: 'eight' } },
    { ...good(), run: 16 },
    { ...good(), bestRun: [1] },
    { ...good(), balls: good().balls.slice(1) },
    { ...good(), breakShot: true },
    { ...good(), last: { by: 0, potted: [99], foul: null } },
    { ...good(), last: { by: 0, potted: [], foul: 'толчок' } },
    withBall(0, null),
    withBall(8, null),
    withBall(5, [NaN, 3]),
    withBall(5, [500, 3]),
    withBall(5, [50, 100 + R]),
    withBall(5, [-0.4, -0.4]),
    withBall(5, '50,50'),
  ];
  for (const s of broken) assert.equal(isValidState(s), false, JSON.stringify(s)?.slice(0, 90));
});

test('статистика: по уровням бота, отдельно «вдвоём», лучшая серия', () => {
  const stats = emptyStats();
  assert.deepEqual(Object.keys(stats), [...LEVEL_IDS, 'friend', 'bestRun']);
  assert.ok(isValidStats(stats));
  const bot = newGame({ mode: 'bot', level: 'hard' }, rngOf(1));
  bot.bestRun = [4, 7];
  recordGame(stats, bot, 0);
  recordGame(stats, bot, 1);
  assert.deepEqual(stats.hard, { played: 2, wins: 1, losses: 1 });
  assert.equal(stats.bestRun, 4, 'серия бота в счёт не идёт');
  const friend = newGame({ mode: 'friend' }, rngOf(1));
  friend.bestRun = [2, 6];
  recordGame(stats, friend, 1);
  assert.deepEqual(stats.friend, { played: 1 });
  assert.equal(stats.bestRun, 6);
  assert.equal(stats.easy.played, 0, 'партия вдвоём в уровни не пишется');
  assert.ok(isValidStats(stats));
  assert.equal(isValidStats({ ...stats, friend: null }), false);
  assert.equal(isValidStats({ ...stats, bestRun: 99 }), false);
  assert.equal(isValidStats(null), false);
  const fixed = migrateStats({ easy: { played: 3, wins: 'много' }, friend: { played: -1 }, bestRun: 5 });
  assert.ok(isValidStats(fixed));
  assert.deepEqual(fixed.easy, { played: 3, wins: 0, losses: 0 });
  assert.equal(fixed.friend.played, 0);
  assert.equal(fixed.bestRun, 5);
  assert.deepEqual(migrateStats(undefined), emptyStats());
});
