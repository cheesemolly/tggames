// Правила пинбола (как в Space Cadet): миссии от выбора до выполнения, звания, топливо, множитель, гиперпространство,
// червоточины, сток и сохранение шарика, удар умения, наклон, сохранение партии и статистика.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rules.js';

const fresh = () => R.newGame();

/** Действие стола, которое порождает событие миссии (для прогона каждой миссии до конца). */
function act(g, on, step = 0) {
  const k = step % 3;
  switch (on) {
    case 'ramp': return R.hit(g, 'rampMouth');
    case 'reentry': return R.hit(g, `reentry${k}`);
    case 'attackBumper': return R.hit(g, `bump${k}`);
    case 'drop': {
      const grp = ['mult', 'medal', 'boost'][Math.floor(step / 3) % 3];
      return R.hit(g, `${grp}${k}`);
    }
    case 'anyTarget': case 'spot': return R.hit(g, `hazL${k}`);
    case 'flagsUpgraded': return R.hit(g, `boost${k}`);
    case 'hyperspace': return R.hole(g, 'hyper');
    case 'attackUpgrade': return R.hit(g, `reentry${k}`);
    case 'hazRBank': return R.hit(g, `hazR${k}`);
    case 'hazLBank': return R.hit(g, `hazL${k}`);
    case 'wormhole': return R.hole(g, 'wormG');
    case 'launchUpgrade': return R.hit(g, `launchLane${k}`);
    case 'blackHole': return R.hole(g, 'black');
    case 'spin': return R.hit(g, 'spin1');
    case 'warp': return R.hit(g, 'warp');
    case 'satellite': return R.hit(g, 'bumpSat');
    case 'lane': return R.hit(g, 'outL');
    case 'outlane': return R.hit(g, 'outL');
    case 'wormY': case 'wormR': case 'wormG': return R.hole(g, on);
    case 'rebound': return R.hit(g, 'slingL');
    case 'topFuel': return R.hit(g, 'fuel5');
    case 'timeWarpExit': return R.hit(g, 'rampMouth');
    default: throw new Error(`нет действия для ${on}`);
  }
}

function startMission(g, id) {
  g.missionPick = id;
  R.hit(g, 'rampMouth');
  assert.equal(g.mission?.id, id, `миссия ${id} принята рампой`);
}

test('каждая миссия каждого звания выполнима действиями на столе', () => {
  const ids = new Set(R.TIERS.flat());
  assert.equal(ids.size, Object.keys(R.MISSIONS).length, 'все миссии есть в таблице званий');
  for (const id of ids) {
    const g = fresh();
    g.rank = 7;                                 // без повышения до конца (кроме «Искривления времени»)
    startMission(g, id);
    let n = 0;
    while (g.mission && n < 400) {
      const m = g.mission;
      act(g, R.MISSIONS[m.id].steps[m.step].on, n);
      n++;
    }
    assert.equal(g.mission, null, `${id}: не выполнена за 400 действий`);
    assert.ok(g.missionsDone === 1, `${id}: засчитана`);
  }
});

test('миссия: мишень выбирает, рампа принимает (очки), выполнение — награда и огни звания', () => {
  const g = fresh();
  R.hit(g, 'mis1');
  assert.equal(g.missionPick, 'reentryTraining');
  R.hit(g, 'rampMouth');
  assert.equal(g.mission.id, 'reentryTraining');
  const before = g.score;
  for (let k = 0; k < 3; k++) R.hit(g, `reentry${k}`);
  assert.equal(g.mission, null);
  assert.ok(g.score - before >= 500000);
  assert.equal(g.progress, 6);
  // все три мишени — четвёртая миссия звания
  const h = fresh();
  for (let k = 0; k < 3; k++) R.hit(h, `mis${k}`);
  assert.equal(h.missionPick, 'science');
});

test('18 огней — повышение; «Искривление времени»: рампа повышает, гиперпространство понижает', () => {
  const g = fresh();
  g.progress = 16;
  startMission(g, 'targetPractice');
  for (let k = 0; k < 8; k++) R.hit(g, `bump${k % 3}`);
  assert.equal(g.rank, 1);
  assert.equal(g.progress, 4);
  for (const [exit, want] of [['rampMouth', 5], ['hyper', 3]]) {
    const t = fresh();
    t.rank = 4;
    startMission(t, 'timeWarp');
    for (let k = 0; k < 25; k++) R.hit(t, 'slingL');
    if (exit === 'hyper') R.hole(t, 'hyper');
    else R.hit(t, 'rampMouth');
    assert.equal(t.rank, want, `выход через ${exit}`);
  }
});

test('топливо: миссия прерывается, когда бак пуст; без миссии топливо не тратится; заправка', () => {
  const g = fresh();
  R.tick(g, 100);
  assert.equal(g.fuel, R.FUEL_FULL, 'без миссии бак полон');
  startMission(g, 'bugHunt');
  for (let t = 0; t < 200 && g.mission; t++) R.tick(g, 1);
  assert.equal(g.mission, null, 'миссия прервана');
  assert.ok(g.fx.some((f) => f.t === 'msg' && f.text === 'Миссия прервана'));
  R.hit(g, 'bonusLane');
  assert.equal(g.fuel, R.FUEL_FULL);
  g.fuel = 0;
  g.missionPick = 'bugHunt';
  R.hit(g, 'rampMouth');
  assert.equal(g.mission, null, 'без топлива миссию не принять');
  for (let k = 0; k < 3; k++) R.hit(g, `fuelT${k}`);
  assert.equal(g.fuel, R.FUEL_FULL, 'три мишени заправки');
});

test('множитель поля: ×2 → ×3 → ×5 → ×10, очки умножаются, через 30 с спадает', () => {
  const g = fresh();
  const bank = () => ['mult0', 'mult1', 'mult2'].forEach((id) => R.hit(g, id));
  bank();
  assert.equal(R.multiplier(g), 2);
  bank(); bank(); bank(); bank();
  assert.equal(R.multiplier(g), 10);
  const s = g.score;
  R.hit(g, 'bump0');
  assert.equal(g.score - s, 5000, 'бампер 500 × 10');
  R.tick(g, 31);
  assert.equal(R.multiplier(g), 5);
});

test('гиперпространство: 10 000 → джекпот → стойка → доп. шарик во внешних → колодец', () => {
  const g = fresh();
  g.jackpot = 300000;
  let s = g.score;
  R.hole(g, 'hyper');
  assert.equal(g.score - s, 10000);
  R.tick(g, 6);                                  // без «рефлекс-удара» (второй заезд быстрее 5 с — ещё 25 000)
  s = g.score;
  R.hole(g, 'hyper');
  assert.equal(g.score - s, 300000, 'джекпот');
  R.hole(g, 'hyper');
  assert.ok(g.postTimer > 0, 'центральная стойка');
  R.hole(g, 'hyper');
  assert.ok(g.extraLit > 0);
  R.hit(g, 'outR');
  assert.equal(g.extraBalls, 1, 'внешняя дорожка дала шарик');
  R.hole(g, 'hyper');
  assert.equal(g.wellActive, true);
  assert.equal(R.gravityWell(g), true);
  assert.equal(g.wellActive, false);
});

test('червоточины: закрытая возвращает шарик в ту же; открытая переносит, в ту же — повтор шарика', () => {
  const g = fresh();
  assert.deepEqual(R.hole(g, 'wormR'), { hold: 0.8, exit: 'wormR' });
  R.hit(g, 'wormT');
  assert.equal(g.wormOpen, true);
  const exit = `worm${g.wormExit}`;
  const res = R.hole(g, exit);
  assert.equal(res.exit, exit);
  assert.equal(g.extraBalls, 1, 'та же лунка — повтор шарика');
  assert.equal(g.wormOpen, false);
});

test('сток: первые секунды шарик сохраняется, потом бонус и следующий; доп. шарик; после третьего — конец', () => {
  const g = fresh();
  R.hit(g, 'bump0');
  assert.ok(g.ballSave > 0);
  assert.equal(R.drain(g), 'save');
  assert.equal(g.ball, 1);
  R.hit(g, 'bump0');
  R.tick(g, 11);
  g.bonus = 40000;
  const s = g.score;
  assert.equal(R.drain(g), 'next');
  assert.equal(g.score - s, 40000, 'бонус за вылет');
  assert.equal(g.ball, 2);
  g.extraBalls = 1;
  R.hit(g, 'bump0');
  R.tick(g, 11);
  assert.equal(R.drain(g), 'next');
  assert.equal(g.ball, 2, 'доп. шарик — тот же номер');
  R.hit(g, 'bump0');
  R.tick(g, 11);
  assert.equal(R.drain(g), 'next');
  R.hit(g, 'bump0');
  R.tick(g, 11);
  assert.equal(R.drain(g), 'over');
  assert.equal(g.over, true);
});

test('удар умения: по высшей растяжке, один раз за шарик; выход из трубы — без награды, бак полон', () => {
  const g = fresh();
  for (let k = 0; k <= 2; k++) R.trip(g, k);
  const s = g.score;
  R.fellBack(g);
  assert.equal(g.score - s, 75000);
  for (let k = 0; k <= 2; k++) R.trip(g, k);
  R.fellBack(g);
  assert.equal(g.score - s, 75000, 'второй раз — ничего');
  g.fuel = 10;
  R.launched(g);
  assert.equal(g.launching, false);
  assert.equal(g.fuel, R.FUEL_FULL);
});

test('флипперы переключают горящие дорожки; три дорожки — прокачка бамперов (очки выше)', () => {
  const g = fresh();
  g.reentryLit = [true, false, false];
  R.laneChange(g, 1);
  assert.deepEqual(g.reentryLit, [false, true, false]);
  R.laneChange(g, -1);
  assert.deepEqual(g.reentryLit, [true, false, false]);
  R.hit(g, 'reentry1');
  R.hit(g, 'reentry2');
  assert.equal(g.attackLevel, 1);
  const s = g.score;
  R.hit(g, 'bump0');
  assert.equal(g.score - s, 1000);
});

test('наклон: частые толчки — «НАКЛОН», очков нет, следующий шарик сбрасывает', () => {
  const g = fresh();
  R.nudge(g);
  R.nudge(g);
  assert.equal(g.tilted, false);
  R.nudge(g);
  R.nudge(g);
  assert.equal(g.tilted, true);
  const s = g.score;
  R.hit(g, 'bump0');
  assert.equal(g.score, s);
  R.tick(g, 20);
  R.drain(g);
  assert.equal(g.tilted, false);
  // редкие толчки не наклоняют
  const h = fresh();
  for (let k = 0; k < 10; k++) {
    R.nudge(h);
    R.tick(h, 3);
  }
  assert.equal(h.tilted, false);
});

test('сохранение партии: копия проходит проверку, продолжение — шарик на пружине; битое — отбрасывается', () => {
  const g = fresh();
  startMission(g, 'launchTraining');
  R.hit(g, 'bump0');
  const snap = R.snapshot(g);
  assert.equal(snap.fx, undefined);
  assert.ok(R.isValidGame(snap));
  const back = R.resume(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.score, g.score);
  assert.equal(back.mission.id, 'launchTraining');
  assert.equal(back.launching, true);
  assert.deepEqual(back.fx, []);
  for (const bad of [null, 5, { ...snap, score: -1 }, { ...snap, rank: 99 }, { ...snap, mission: { id: 'nope', step: 0, left: 1 } },
    { ...snap, drops: { mult: [true], medal: [true, true, true], boost: [true, true, true] } }, { ...snap, over: true }]) {
    assert.equal(R.isValidGame(bad), false, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('статистика: партия записывается, рекорд и высшее звание — максимум', () => {
  let s = R.emptyStats();
  assert.ok(R.isValidStats(s));
  const g = fresh();
  g.score = 1234000;
  g.rank = 3;
  g.missionsDone = 2;
  s = R.recordGame(s, g);
  const h = fresh();
  h.score = 500;
  s = R.recordGame(s, h);
  assert.deepEqual([s.played, s.best, s.bestRank, s.missions], [2, 1234000, 3, 2]);
  assert.ok(R.isValidStats(s));
  assert.equal(R.isValidStats({ ...s, bestRank: 42 }), false);
});
