// Лисья охота, ход комнаты и звери: охота волнами (и что она всегда кончается), состав волны, напасти, задания,
// особые условия комнат, награда, бой с хозяином места и переход на следующую локацию, места (сундук, лавка,
// начало пути), поведение добычи и образцовых врагов, спутник.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H, T, TILE, BIOMES, REG, rngFrom, kindOf, tileX, tileY } from '../core.js';
import {
  BASE, HUNT, MOB, DASH, planWave, hazardsFor, hazardGap, waveBudget, preyPerWave, wavesPerRoom, hazardCount, eliteChance, price,
  rollRarity,
} from '../balance.js';
import { OPPOSITE, dangerAt, addZone, inZone, standable, tileAt } from '../world.js';
import { hurtPlayer, recalc } from '../player.js';
import { hurtMob, hitOf } from '../combat.js';
import { spawnMob, hireMinion, ACTS, preyDashAlert } from '../ai.js';
import { enterRoom, startTask, startFight, startChallenge, queueMob, useFocus, openChest, leftOf } from '../director.js';
import { giveItem, shopPrice, rollItem } from '../inventory.js';
import { newRun, step, drain, cheat, chooseGift } from '../logic.js';
import { arena, dummy, put, makeInput, runSteps, runUntil, of, sounds, createBot, playBot } from './helpers.js';

BASE.crit = 0;

/** Партия, в которой лиса только что перенесена в охотничью комнату (она сразу «внутри», двери закроются). */
function hunt(seed, { god = true, floor = 1 } = {}) {
  const G = newRun(seed, { floor });
  cheat.god(G, god);
  cheat.warp(G, 'hunt');
  drain(G);
  return G;
}
const mapRoom = (G) => G.map.rooms[G.room.id];
/** Убивать всех врагов, как только они проявились (лиса при этом может стоять). */
function slay(G) {
  for (const m of G.room.mobs) if (!m.dead && m.kind !== 0 && m.inv <= 0) hurtMob(G, m, 1e6, hitOf('shot'));
}
const hostiles = (G) => G.room.mobs.filter((m) => !m.dead && m.kind !== 0);
const prey = (G) => G.room.mobs.filter((m) => !m.dead && m.kind === 0);

// ---------- охота ----------

test('охота: двери закрываются, когда лиса зашла на две клетки; через 0,8 с — первая волна', () => {
  // лиса входит через дверь по-настоящему: ищем партию, где рядом с началом есть охотничья комната
  let G = null;
  let side = null;
  for (let seed = 1; seed < 60 && !side; seed++) {
    G = newRun(seed);
    side = ['n', 'e', 's', 'w'].find((s) => G.map.rooms[G.room.doors[s]?.to]?.type === 'hunt') ?? null;
  }
  assert.ok(side, 'нашлась партия с охотой за первой дверью');
  cheat.god(G, true);
  const door = G.room.doors[side];
  put(G, door.x, door.y);
  step(G, makeInput());
  const room = G.room;
  const mr = mapRoom(G);
  assert.equal(mr.type, 'hunt');
  assert.equal(G.map.entry, OPPOSITE[side]);
  assert.deepEqual([room.dir.mode, mr.state, room.open], ['enter', 'new', true]);
  assert.ok(mr.seen);
  let ev = runSteps(G, 90);
  assert.equal(room.dir.mode, 'enter', 'стоит у двери — ничего не начинается');
  assert.equal(of(ev, 'doors').length, 0);
  // можно выйти обратно
  const back = room.doors[OPPOSITE[side]];
  assert.ok(Math.hypot(G.player.x - back.x, G.player.y - back.y) <= T + 1e-6);
  // идёт внутрь
  const inward = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side];
  ev = runUntil(G, (g) => g.room.dir.mode !== 'enter', { seconds: 3, input: makeInput({ mx: inward[0], my: inward[1] }) });
  assert.ok(Math.hypot(G.player.x - back.x, G.player.y - back.y) >= HUNT.inside, 'зашла на две клетки');
  assert.deepEqual(of(ev, 'doors').map((e) => e.open), [false]);
  assert.ok(sounds(ev).includes('lock'));
  assert.deepEqual([room.dir.mode, mr.state, room.open], ['ready', 'active', false]);
  const t0 = G.time;
  ev = runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 2 });
  assert.ok(Math.abs(G.time - t0 - HUNT.enter) < 0.04, `волна через ${G.time - t0}`);
  assert.deepEqual(of(ev, 'wave').map((e) => [e.n, e.of]), [[1, wavesPerRoom(1)]]);
  assert.ok(room.dir.queue.length > 0);
});

test('волна: добыча выходит из нор по одной, враги — из меток вдали от лисы и сначала безвредны', () => {
  const G = hunt(11);
  const room = G.room;
  runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 2 });
  const queued = room.dir.queue.filter((e) => e.prey).length;
  assert.equal(queued, preyPerWave(1));
  const born = [];
  const spawnEv = [];
  runSteps(G, 200, makeInput(), (g) => {
    for (const m of g.room.mobs) {
      if (born.some((b) => b.m === m)) continue;
      born.push({ m, t: g.time, x: m.x, y: m.y, d: Math.hypot(m.x - g.player.x, m.y - g.player.y) });
    }
  }).forEach((e) => e.t === 'spawn' && spawnEv.push(e));
  const rabbits = born.filter((b) => b.m.kind === 0);
  const foes = born.filter((b) => b.m.kind === 1);
  assert.equal(rabbits.length, queued);
  for (const b of rabbits) assert.ok(room.burrows.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 12), 'кролик вышел из норы');
  for (let i = 1; i < rabbits.length; i++) {
    assert.ok(Math.abs(rabbits[i].t - rabbits[i - 1].t - HUNT.preyGap) < 0.04, 'по одному, с паузой');
  }
  assert.ok(foes.length >= 1);
  assert.equal(spawnEv.length, foes.length, 'у каждого врага — метка-предупреждение');
  for (const b of foes) {
    assert.ok(b.d >= MOB.farSpawn - 12, `враг появился в ${b.d.toFixed(0)} от лисы`);
    assert.ok(standable(room, b.x, b.y, 9));
  }
  assert.equal(foes[0].m.id, 'hedgehog', 'первая охота — с ежом');
});

test('охота всегда кончается: добыча сама уходит в норы (лиса стоит), врагов убивают — 8 партий', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const G = hunt(seed * 131);
    const room = G.room;
    const mr = mapRoom(G);
    const waves = wavesPerRoom(1);
    const hunts = G.map.hunts;
    const all = [];
    let guard = 0;
    while (room.dir.mode !== 'cleared' && guard++ < 60 * 90) {
      step(G, makeInput());
      slay(G);
      all.push(...drain(G));
    }
    assert.equal(room.dir.mode, 'cleared', `зерно ${seed}: за 90 секунд охота не кончилась (волна ${room.dir.wave})`);
    assert.deepEqual(of(all, 'wave').map((e) => e.n), Array.from({ length: waves }, (_, i) => i + 1));
    assert.deepEqual(of(all, 'doors').map((e) => e.open), [false, true]);
    assert.equal(of(all, 'clear').length, 1);
    assert.ok(sounds(all).includes('clear') && sounds(all).includes('door'));
    assert.equal(mr.state, 'cleared');
    assert.equal(G.map.hunts, hunts + 1);
    assert.equal(G.cnt.rooms, 1);
    assert.ok(of(all, 'escape').length >= 1, 'непойманная добыча ушла в норы');
    assert.ok(sounds(all).includes('escape'));
    assert.ok(room.open && room.vacuum);
    assert.equal(room.zones.filter((z) => z.from === 1).length, 0);
    // зачищенная комната — навсегда: вошли снова, а она тихая
    enterRoom(G, room.id, 'c');
    runSteps(G, 120);
    assert.deepEqual([G.room.dir.mode, G.room.mobs.length, G.room.open], ['cleared', 0, true]);
  }
});

test('враги сами не уходят: пока жив хоть один, волна не кончается и двери закрыты', () => {
  const G = hunt(5);
  runSteps(G, 60 * 45);
  assert.equal(G.room.dir.mode, 'wave');
  assert.equal(G.room.dir.wave, 0);
  assert.equal(prey(G).length, 0, 'добыча за это время ушла');
  assert.ok(hostiles(G).length >= 1);
  assert.equal(G.room.open, false);
  assert.equal(mapRoom(G).state, 'active');
  slay(G);
  runUntil(G, (g) => g.room.dir.mode !== 'wave', { seconds: 1 });
  assert.equal(G.room.dir.mode, 'calm', 'убит последний — передышка');
  const t0 = G.time;
  runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 20, each: (g) => { if (g.room.task) g.room.task.t = 99; } });
  assert.ok(G.time - t0 >= HUNT.calm - 0.03, `передышка длилась ${G.time - t0}`);
  assert.equal(G.room.dir.wave, 1);
});

test('охотник по сценарию зачищает комнату рывками — 6 партий', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const G = hunt(seed * 977);
    const bot = createBot({ doors: false });
    playBot(G, bot, 80, (g) => (g.room.dir.mode === 'cleared' ? (g.over = false) : null));
    let guard = 0;
    while (G.room.dir.mode !== 'cleared' && guard++ < 60 * 60) {
      step(G, bot(G));
      G.events.length = 0;
    }
    assert.equal(G.room.dir.mode, 'cleared', `зерно ${seed}`);
    assert.ok(G.cnt.rabbits >= 3, `зерно ${seed}: поймано ${G.cnt.rabbits}`);
    assert.ok(G.cnt.kills >= 2, `зерно ${seed}: убито ${G.cnt.kills}`);
    assert.ok(G.score >= G.cnt.rabbits + G.cnt.kills * 2);
  }
});

// ---------- состав волны ----------

test('planWave: чистая функция; на первой локации новое вводится по одному', () => {
  const plan = (floor, loop, hunts, wave, seed = 1) => planWave(floor, loop, hunts, wave, rngFrom(seed));
  assert.deepEqual(plan(1, 0, 0, 0, 7), plan(1, 0, 0, 0, 7), 'одно зерно — один состав');
  for (let seed = 1; seed <= 40; seed++) {
    const first = plan(1, 0, 0, 0, seed);
    assert.equal(first.prey.length, preyPerWave(1));
    assert.ok(first.prey.every((id) => REG.MOBS[id].kind === 'prey'));
    assert.deepEqual(first.mobs.map((m) => m.id), ['hedgehog'], 'первая охота: кролики и один ёж');
    assert.ok(first.mobs.every((m) => m.elite === false), 'на первой локации вожаков нет');
    assert.ok(plan(1, 0, 1, 0, seed).mobs.every((m) => m.id === 'hedgehog'), 'кабанов ещё нет');
    const later = plan(1, 0, 4, 1, seed);
    assert.ok(later.mobs.length >= 2 && later.mobs.length <= 4);
    const cost = later.mobs.reduce((s, m) => s + REG.MOBS[m.id].cost, 0);
    assert.ok(cost <= waveBudget(1, 0), `состав не дороже бюджета: ${cost}`);
  }
  const boars = Array.from({ length: 60 }, (_, i) => plan(1, 0, 4, 1, i + 1)).filter((p) => p.mobs.some((m) => m.id === 'boar')).length;
  assert.ok(boars > 20, `кабаны с четвёртой охоты: в ${boars} составах из 60`);
});

test('planWave: дальше — больше врагов, появляются вожаки и зайцы; врагов не больше предела', () => {
  const count = (floor, loop) => {
    let mobs = 0;
    let elite = 0;
    let hares = 0;
    let gold = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const p = planWave(floor, loop, 3, 2, rngFrom(seed * 17));
      assert.ok(p.mobs.length <= HUNT.maxMobs);
      assert.equal(p.prey.length, preyPerWave(floor));
      assert.ok(p.prey.filter((id) => id === 'gold').length <= 1, 'золотой кролик — не больше одного за волну');
      mobs += p.mobs.length;
      elite += p.mobs.filter((m) => m.elite).length;
      hares += p.prey.filter((id) => id === 'hare').length;
      gold += p.prey.filter((id) => id === 'gold').length;
    }
    return { mobs: mobs / 200, elite: elite / Math.max(1, mobs), hares, gold };
  };
  const f1 = count(1, 0);
  const f3 = count(3, 0);
  const f8 = count(8, 1);
  assert.ok(f1.mobs < f3.mobs && f3.mobs < f8.mobs, `врагов в волне: ${f1.mobs} → ${f3.mobs} → ${f8.mobs}`);
  assert.equal(f1.elite, 0);
  assert.ok(f3.elite > 0.03 && f3.elite < 0.2, `вожаков на третьей: ${f3.elite}`);
  assert.ok(f8.elite > f3.elite);
  assert.equal(f1.hares + f1.gold, 0, 'на первой локации — только кролики и толстяки');
  assert.ok(f3.hares > 100 && f3.gold > 2);
  // числа из правил
  assert.deepEqual([1, 2, 3, 4, 9, 50].map(eliteChance).map((x) => Math.round(x * 100)), [0, 6, 10, 14, 34, 35]);
  assert.deepEqual([waveBudget(1, 0), waveBudget(4, 0), waveBudget(6, 1)], [7.5, 15, 26]);
  assert.deepEqual([1, 2, 5, 9].map(preyPerWave), [4, 5, 8, 8]);
  assert.deepEqual([1, 2, 3, 7].map(wavesPerRoom), [2, 2, 3, 3]);
  assert.deepEqual([1, 3, 4, 9].map(hazardCount), [1, 1, 2, 2]);
  // места без своих зверей пока обходятся чужими — пустых волн нет
  for (let floor = 2; floor <= 5; floor++) assert.ok(planWave(floor, 0, 0, 0, rngFrom(floor)).mobs.length >= 1, `локация ${floor}`);
});

// ---------- напасти ----------

test('напасти: в первой охоте их нет, потом лось, потом и медведь; с четвёртой локации — по две', () => {
  const r = () => rngFrom(3);
  assert.deepEqual(hazardsFor(1, 0, 'forest', 0, r()), []);
  assert.deepEqual(hazardsFor(1, 0, 'forest', 1, r()), ['moose']);
  for (let seed = 1; seed <= 30; seed++) {
    const third = hazardsFor(1, 0, 'forest', 2, rngFrom(seed));
    assert.equal(third.length, 1);
    assert.ok(['moose', 'bear'].includes(third[0]));
    assert.deepEqual(hazardsFor(4, 0, 'cave', 0, rngFrom(seed)).sort(), ['bear', 'moose']);
  }
  REG.HAZARDS['test-local'] = { name: 'Здешняя', biomes: ['swamp'], minFloor: 3, fire() {} };
  REG.HAZARDS['test-manual'] = { name: 'По вызову', auto: false, fire() {} };
  assert.ok(!hazardsFor(5, 0, 'forest', 0, r()).includes('test-local'), 'чужое место');
  assert.ok(!hazardsFor(2, 0, 'swamp', 0, r()).includes('test-local'), 'рано');
  let seen = false;
  for (let seed = 1; seed <= 40; seed++) {
    const list = hazardsFor(4, 0, 'swamp', 0, rngFrom(seed));
    seen ||= list.includes('test-local');
    assert.ok(!list.includes('test-manual'), 'напасть «по вызову» сама не выбирается');
  }
  assert.ok(seen);
  delete REG.HAZARDS['test-local'];
  delete REG.HAZARDS['test-manual'];
  for (let seed = 1; seed <= 200; seed++) {
    const a = hazardGap(1, 0, rngFrom(seed));
    const b = hazardGap(9, 1, rngFrom(seed));
    assert.ok(a >= 7 && a <= 11 && b >= 3.5 && b <= 6, `паузы: ${a}, ${b}`);
  }
});

test('напасти бьют только во время волны и не чаще, чем раз в 1,2 с — даже если их торопить', () => {
  let fired = 0;
  REG.HAZARDS['test-rush'] = {
    name: 'Спешка',
    fire(G, room) {
      fired += 1;
      addZone(G, { x: 100 + (fired % 5) * 60, y: 100, r: 20, t: fired % 2 ? 0.2 : 0.9, dmg: 1 });
    },
  };
  const G = hunt(21);
  const room = G.room;
  room.hazards = ['test-rush'];
  const strikes = [];
  for (let i = 0; i < 60 * 14; i++) {
    room.dir.hazT = 0;                                       // торопим: «пора» на каждом шагу
    step(G, makeInput());
    for (const e of drain(G)) if (e.t === 'strike') strikes.push(G.time);
    if (room.dir.mode !== 'wave') assert.equal(room.zones.length === 0 || room.dir.mode !== 'ready', true);
  }
  assert.ok(strikes.length >= 6, `ударов: ${strikes.length}`);
  for (let i = 1; i < strikes.length; i++) {
    assert.ok(strikes[i] - strikes[i - 1] >= HUNT.strikeGap - 0.02, `между ударами ${(strikes[i] - strikes[i - 1]).toFixed(2)} с`);
  }
  assert.ok(room.zones.every((z) => z.total >= HUNT.minWarn - 1e-9), 'слишком короткое предупреждение растянуто');
  // до волны и в передышку — тишина
  const calm = hunt(22);
  calm.room.hazards = ['test-rush'];
  fired = 0;
  runUntil(calm, (g) => g.room.dir.mode === 'wave', { seconds: 2, each: (g) => { g.room.dir.hazT = 0; } });
  assert.equal(fired, 0);
  delete REG.HAZARDS['test-rush'];
});

test('лось и медведь: полоса через всю комнату мимо лисы и круг под лису', () => {
  const G = arena({ seed: 4 });
  const P = G.player;
  put(G, 400, 240);
  cheat.god(G, true);
  REG.HAZARDS.moose.fire(G, G.room, rngFrom(1));
  const lane = G.room.zones[0];
  assert.equal(lane.shape, 'lane');
  assert.ok(lane.run && lane.hitsMobs && lane.actor === 'haz.moose' && lane.dmg === 1);
  assert.ok(Math.hypot(lane.x2 - lane.x, lane.y2 - lane.y) > 300, 'через всю комнату');
  assert.ok(inZone(lane, P.x, P.y, 30), 'мимо лисы');
  assert.ok(Math.abs(lane.total - 1.1) < 1e-9);
  let ev = drain(G);
  assert.ok(sounds(ev).includes('moose') && sounds(ev).includes('warn'));
  ev = runSteps(G, 200);
  assert.ok(of(ev, 'strike').length === 1);
  assert.equal(G.room.zones.length, 0);
  P.vx = 100;
  REG.HAZARDS.bear.fire(G, G.room, rngFrom(1));
  const paw = G.room.zones[0];
  assert.deepEqual([paw.shape, paw.r, paw.total, paw.actor], ['circle', 54, 1, 'haz.paw']);
  assert.ok(paw.x > P.x && paw.x < P.x + 60, 'с упреждением по ходу лисы');
  ev = runSteps(G, 70);
  assert.ok(sounds(ev).includes('paw'));
  assert.ok(of(ev, 'shake').length >= 1);
  assert.ok(G.room.actors.some((a) => a.rig === 'haz.paw') || of(ev, 'strike').length === 1);
});

// ---------- задания ----------

test('задание «Три пенька»: три ломких пня; сломала все рывком — очки и монеты', () => {
  const G = arena({ seed: 6 });
  const P = G.player;
  put(G, 400, 240);
  assert.equal(startTask(G, 'stumps'), true);
  const task = G.room.task;
  assert.deepEqual([task.id, task.name, task.goal, task.n, task.time], ['stumps', 'Три пенька', 3, 0, 12]);
  const stumps = G.room.things.filter((t) => t.kind === 'stump');
  assert.equal(stumps.length, 3);
  for (const s of stumps) {
    assert.ok(s.breakable && standable(G.room, s.x, s.y, 9));
    assert.ok(Math.hypot(s.x - 400, s.y - 240) >= 2.5 * T - 1);
  }
  let ev = drain(G);
  assert.deepEqual(of(ev, 'task').map((e) => [e.id, e.state]), [['stumps', 'start']]);
  assert.ok(sounds(ev).includes('task'));
  assert.equal(startTask(G, 'stumps'), false, 'второе задание поверх первого не начинается');
  // выстрел пень не ломает
  hurtMob(G, dummy(G, 60, 60, { hp: 1 }), 5, hitOf('shot'));
  const score0 = G.score;
  ev = [];
  for (const s of stumps) {
    put(G, s.x - 40, s.y);
    P.charges = 1;
    ev.push(...runUntil(G, (g) => !g.player.dash, { seconds: 1, input: makeInput({ dash: true, dx: 1, dy: 0, dp: 0.2 }) }));
  }
  ev.push(...runSteps(G, 3));
  assert.equal(G.room.task, null);
  assert.deepEqual(of(ev, 'task').map((e) => e.state), ['ok']);
  assert.ok(sounds(ev).includes('taskok') && sounds(ev).filter((s) => s === 'stump').length === 3);
  assert.equal(G.score, score0 + 3 * 2 + 4, 'по два за пень и четыре за все');
  assert.equal(G.cnt.tasks, 1);
  assert.equal(G.room.things.filter((t) => t.kind === 'stump').length, 0, 'пни убраны');
  assert.ok(G.room.picks.some((p) => p.kind === 'coin') || G.coins > 0);
});

test('задание не успела — провал без награды; задания «на всю волну» и отказ задания начаться', () => {
  const G = arena({ seed: 6 });
  startTask(G, 'stumps');
  const ev = runSteps(G, 60 * 12 + 5);
  assert.deepEqual(of(ev, 'task').map((e) => e.state), ['start', 'fail']);
  assert.ok(sounds(ev).includes('taskfail'));
  assert.equal(G.cnt.tasks, 0);
  assert.equal(G.score, 0);
  assert.equal(G.room.things.length, 0);
  assert.equal(startTask(G, 'нет такого'), false);
  let finished = null;
  REG.TASKS['test-refuse'] = { name: 'Отказ', start: () => false };
  REG.TASKS['test-clean'] = {
    name: 'Чисто', text: 'Без урона', during: 'wave',
    start(g, room) { room.task.data.hurt = g.cnt.hurt; },
    step: (g, task) => (g.cnt.hurt > task.data.hurt ? 'fail' : 'run'),
    finish(g, task, ok) { finished = ok; },
  };
  assert.equal(startTask(G, 'test-refuse'), false);
  assert.equal(G.room.task, null);
  // «на всю волну»: передышка его не ждёт, конец волны — успех
  const H1 = hunt(31);
  runUntil(H1, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
  for (let i = 0; i < 60 * 40 && H1.room.dir.mode !== 'calm'; i++) {
    step(H1, makeInput());
    slay(H1);
  }
  H1.room.task && (H1.room.task.t = 999);
  runSteps(H1, 5);
  assert.equal(H1.room.task, null);
  startTask(H1, 'test-clean');
  drain(H1);
  let all = [];
  for (let i = 0; i < 60 * 40 && H1.room.dir.mode !== 'cleared'; i++) {
    step(H1, makeInput());
    slay(H1);
    all.push(...drain(H1));
    if (H1.room.dir.mode === 'wave') assert.ok(H1.room.task || finished !== null, 'задание живёт всю волну');
  }
  assert.equal(finished, true);
  assert.ok(of(all, 'task').some((e) => e.id === 'test-clean' && e.state === 'ok'));
  // а с уроном — провал
  finished = null;
  const A = arena();
  startTask(A, 'test-clean');
  hurtPlayer(A, 1, 0, 0, 'touch');
  runSteps(A, 2);
  assert.equal(finished, false);
  delete REG.TASKS['test-refuse'];
  delete REG.TASKS['test-clean'];
});

test('в передышку бывает задание — но не в самой первой охоте; пока оно идёт, волна ждёт', () => {
  let withTask = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const G = hunt(seed * 53);
    G.map.hunts = 2;                                         // будто две охоты уже позади
    runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
    for (let i = 0; i < 60 * 40 && G.room.dir.mode !== 'calm'; i++) {
      step(G, makeInput());
      slay(G);
    }
    assert.equal(G.room.dir.mode, 'calm');
    if (!G.room.task) continue;
    withTask += 1;
    runSteps(G, Math.round((HUNT.calm + 1) * 60));
    assert.equal(G.room.dir.mode, 'calm', 'задание идёт — следующая волна ждёт');
    runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 20 });
    assert.equal(G.room.task, null);
  }
  assert.ok(withTask >= 6 && withTask <= 18, `заданий в 24 передышках: ${withTask}`);
  for (let seed = 1; seed <= 10; seed++) {
    const G = hunt(seed * 59);
    assert.equal(G.map.hunts, 0);
    for (let i = 0; i < 60 * 40 && G.room.dir.mode !== 'calm'; i++) {
      step(G, makeInput());
      slay(G);
    }
    assert.equal(G.room.task, null, 'в первой охоте заданий нет');
  }
});

// ---------- особые условия комнаты ----------

test('особое условие комнаты: плашка, больше добычи и очков, свои напасти или тишина, свои обработчики', () => {
  const log = [];
  REG.MODS['test-plenty'] = {
    name: 'Изобилие', text: 'Добычи вдвое больше', preyMul: 2, preyPlus: 1, preyPts: 1, noHazards: true,
    apply(G, room) { log.push(`apply ${room.id}`); },
    step() { log.push('step'); },
  };
  REG.MODS['test-storm'] = { name: 'Гроза', text: 'Бьют молнии', hazards: ['test-bolt'], hazardMul: 2 };
  REG.HAZARDS['test-bolt'] = { name: 'Молния', auto: false, fire() {} };
  const G = newRun(40);
  cheat.god(G, true);
  drain(G);
  const mr = G.map.rooms.find((r) => r.type === 'hunt');
  mr.mod = 'test-plenty';
  G.map.hunts = 2;
  enterRoom(G, mr.id, 'c');
  const ev = drain(G);
  assert.deepEqual(of(ev, 'banner').map((e) => [e.title, e.sub, e.kind]), [['Изобилие', 'Добычи вдвое больше', 'mod']]);
  assert.ok(sounds(ev).includes('banner'));
  assert.equal(G.room.mod, 'test-plenty');
  assert.deepEqual(G.room.hazards, [], '«тишина»: напастей нет');
  assert.equal(log[0], `apply ${mr.id}`);
  runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
  assert.ok(log.includes('step'));
  assert.equal(G.room.dir.queue.filter((e) => e.prey).length, preyPerWave(1) * 2 + 1);
  runUntil(G, (g) => prey(g).length > 0, { seconds: 3 });
  const r = prey(G)[0];
  put(G, r.x, r.y);
  const got = runSteps(G, 2);
  assert.equal(of(got, 'catch')[0].pts, REG.MOBS[r.id].pts + 1, 'за добычу на очко больше');
  // условие с напастью «по вызову»
  const S = newRun(41);
  const sr = S.map.rooms.find((x) => x.type === 'hunt');
  sr.mod = 'test-storm';
  S.map.hunts = 3;
  enterRoom(S, sr.id, 'c');
  assert.ok(S.room.hazards.includes('test-bolt'));
  assert.ok(S.room.hazards.length >= 2);
  // в зачищенную комнату плашка не лезет
  sr.state = 'cleared';
  drain(S);
  enterRoom(S, sr.id, 'c');
  assert.equal(of(drain(S), 'banner').length, 0);
  for (const id of ['test-plenty', 'test-storm']) delete REG.MODS[id];
  delete REG.HAZARDS['test-bolt'];
});

test('награда за зачищенную комнату: иногда монеты, сердце, мана, изредка вещь — и часто ничего', () => {
  const got = { none: 0, coin: 0, heart: 0, mana: 0, item: 0 };
  const n = 160;
  for (let seed = 1; seed <= n; seed++) {
    const G = hunt(seed * 7);
    G.room.dir.wave = G.room.dir.waves - 1;
    runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
    G.room.dir.wave = G.room.dir.waves - 1;
    G.room.dir.queue.length = 0;
    for (const m of G.room.mobs) m.dead = true;
    G.room.picks.length = 0;
    runSteps(G, 2);
    assert.equal(G.room.dir.mode, 'cleared');
    const kinds = new Set(G.room.picks.map((p) => p.kind));
    if (!kinds.size) got.none += 1;
    for (const k of kinds) got[k] += 1;
  }
  assert.ok(got.none > n * 0.25 && got.none < n * 0.55, JSON.stringify(got));
  assert.ok(got.coin > n * 0.2 && got.heart > n * 0.04 && got.mana > n * 0.04, JSON.stringify(got));
  assert.ok(got.item <= n * 0.12);
});

// ---------- хозяин места ----------

/** Партия у хозяина: лиса перенесена в его комнату. */
function bossRun(seed, floor = 1) {
  const G = newRun(seed, { floor });
  cheat.god(G, true);
  drain(G);
  cheat.warp(G, 'boss');
  return G;
}

test('хозяин места: плашка и выход, бой, гибель — портал, сундук и выбор дара; шаги ждут выбора', () => {
  const G = bossRun(3);
  const room = G.room;
  const mr = mapRoom(G);
  assert.deepEqual([mr.type, room.dir.mode, room.w, room.h], ['boss', 'enter', 25, 15]);
  let ev = runUntil(G, (g) => g.room.dir.mode === 'intro', { seconds: 2 });
  assert.ok(sounds(ev).includes('lock') && sounds(ev).includes('boss'));
  assert.deepEqual(of(ev, 'boss').map((e) => [e.id, e.state]), [['bear', 'intro']]);
  assert.deepEqual(of(ev, 'banner').map((e) => [e.title, e.kind]), [['Медведь-хозяин', 'boss']]);
  const boss = room.boss;
  assert.ok(boss && boss.kind === 2 && boss.act === 'spawn' && boss.inv > 1.4);
  assert.ok(Math.hypot(boss.x - G.player.x, boss.y - G.player.y) >= 4 * T, 'выходит не под носом у лисы');
  assert.equal(hurtMob(G, boss, 5, hitOf('shot')), false, 'пока выходит — неуязвим');
  runUntil(G, (g) => g.room.dir.mode === 'boss', { seconds: 3 });
  runSteps(G, 30);
  assert.ok(boss.inv <= 0 && boss.act !== 'spawn');
  assert.equal(room.open, false);
  // подмога и её судьба
  const add = spawnMob(G, 'hedgehog', 300, 300, { warm: 0 });
  addZone(G, { x: 100, y: 100, r: 30, t: 9, owner: boss.uid });
  const score0 = G.score;
  drain(G);
  hurtMob(G, boss, 1e6, hitOf('dash'));
  ev = drain(G);
  assert.ok(boss.dead && add.dead, 'подмога разбежалась');
  assert.equal(G.score, score0 + REG.MOBS.bear.pts);
  assert.deepEqual(of(ev, 'boss').map((e) => [e.id, e.state]), [['bear', 'dead']]);
  assert.ok(sounds(ev).includes('bossdie') && sounds(ev).includes('door'));
  assert.deepEqual([G.cnt.bosses, G.cnt.rooms, mr.state, room.open, room.boss], [1, 1, 'cleared', true, null]);
  assert.equal(room.zones.length, 0);
  const portal = room.things.find((t) => t.kind === 'portal');
  const chest = room.things.find((t) => t.kind === 'chest');
  assert.ok(portal && portal.usable && chest && chest.usable && chest.v === 0);
  assert.deepEqual([mr.data.portal, mr.data.chest, mr.data.gift], [1, 1, 1]);
  // дар — чуть погодя
  assert.equal(G.pending, null);
  ev = runUntil(G, (g) => g.pending, { seconds: 3 });
  assert.ok(Math.abs(room.dir.t - HUNT.giftDelay) < 0.05);
  const options = G.pending.options;
  assert.equal(G.pending.kind, 'gift');
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
  assert.ok(options.every((id) => REG.GIFTS[id]));
  assert.deepEqual(of(ev, 'gift').map((e) => e.options), [options]);
  assert.ok(sounds(ev).includes('gift'));
  assert.equal(mr.data.gift, undefined, 'дар предложен — долг снят');
  // пока дар не выбран — время стоит
  const t = G.time;
  const x = G.player.x;
  runSteps(G, 120, makeInput({ mx: 1, dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.deepEqual([G.time, G.player.x], [t, x]);
  assert.equal(chooseGift(G, 7), false);
  assert.equal(chooseGift(G, -1), false);
  assert.equal(chooseGift(G, 1), true);
  assert.equal(G.pending, null);
  assert.deepEqual(G.gifts, [options[1]]);
  assert.equal(chooseGift(G, 0), false, 'выбирать больше нечего');
  runSteps(G, 30, makeInput({ mx: 1 }));
  assert.ok(G.time > t && G.player.x > x, 'партия пошла дальше');
  // сундук хозяина — вещь не ниже редкой
  put(G, chest.x - 24, chest.y);
  runSteps(G, 2);
  runSteps(G, 2, makeInput({ act: true }));
  assert.equal(chest.v, 1);
  assert.equal(mr.data.chest, 2);
  const item = room.picks.find((p) => p.kind === 'item');
  assert.ok(item && (REG.WEAPONS[item.id] ?? REG.ARMOR[item.id] ?? REG.ACCESSORIES[item.id]).rarity >= 1, `в сундуке хозяина: ${item?.id}`);
});

test('портал ведёт на следующую локацию: новое место, новая карта; после пятой — снова лес, круг второй', () => {
  const G = bossRun(8);
  runUntil(G, (g) => g.room.dir.mode === 'boss', { seconds: 4 });
  hurtMob(G, G.room.boss, 1e6, hitOf('shot'));
  runUntil(G, (g) => g.pending, { seconds: 3 });
  chooseGift(G, 0);
  const portal = G.room.things.find((t) => t.kind === 'portal');
  // вернуться в комнату хозяина — портал и сундук на месте
  const id = G.room.id;
  enterRoom(G, id, 'c');
  assert.ok(G.room.things.some((t) => t.kind === 'portal') && G.room.things.some((t) => t.kind === 'chest' && t.v === 0));
  assert.equal(G.room.dir.mode, 'cleared');
  const p = G.room.things.find((t) => t.kind === 'portal');
  assert.deepEqual([p.x, p.y], [portal.x, portal.y]);
  put(G, p.x, p.y - 10);
  runSteps(G, 2);
  assert.deepEqual([G.room.focus.title, G.room.focus.ref], ['Дальше', p]);
  assert.ok(G.room.vacuum, 'в спокойной комнате монеты летят к лисе сами');
  const oldMap = G.map;
  drain(G);
  const ev = runSteps(G, 1, makeInput({ act: true }));
  assert.deepEqual([G.floor, G.biome, G.loop], [2, 'swamp', 0]);
  assert.notEqual(G.map, oldMap);
  assert.deepEqual([G.room.type, G.map.cur, G.map.entry, G.cnt.floors], ['start', G.map.startId, 'c', 1]);
  assert.equal(G.room.biome, 'swamp');
  assert.equal(G.room.special, 'mud');
  assert.deepEqual(of(ev, 'floor').map((e) => [e.n, e.biome]), [[2, 'swamp']]);
  assert.deepEqual(of(ev, 'banner').map((e) => [e.title, e.sub, e.kind]), [['Локация 2', 'Болото', 'floor']]);
  assert.ok(sounds(ev).includes('floor'));
  assert.equal(G.room.things.filter((t) => t.kind === 'sign').length, 0, 'обучение — только на первой локации');
  assert.equal(G.room.mobs.length, 0);
  // круги
  const order = [];
  for (let i = 0; i < 9; i++) {
    cheat.nextFloor(G);
    order.push([G.floor, G.biome, G.loop]);
  }
  assert.deepEqual(order.slice(0, 5), [[3, 'taiga', 0], [4, 'cave', 0], [5, 'autumn', 0], [6, 'forest', 1], [7, 'swamp', 1]]);
  assert.deepEqual(order[8], [11, 'forest', 2]);
  assert.deepEqual(BIOMES, ['forest', 'swamp', 'taiga', 'cave', 'autumn']);
  // портал раньше дара не уводит: сначала выбор
  const H2 = bossRun(8);
  runUntil(H2, (g) => g.room.dir.mode === 'boss', { seconds: 4 });
  hurtMob(H2, H2.room.boss, 1e6, hitOf('shot'));
  const gate = H2.room.things.find((t) => t.kind === 'portal');
  put(H2, gate.x, gate.y - 10);
  runSteps(H2, 2);
  assert.equal(H2.pending, null);
  runSteps(H2, 1, makeInput({ act: true }));
  assert.equal(H2.floor, 1, 'пока дар не выбран, лиса остаётся');
  assert.equal(H2.pending?.options.length, 3);
  chooseGift(H2, 0);
  runSteps(H2, 2);
  runSteps(H2, 1, makeInput({ act: true }));
  assert.deepEqual([H2.floor, H2.gifts.length], [2, 1]);
});

test('бой с медведем по-настоящему: замахи видны, приёмы чередуются, охотник по сценарию его побеждает', () => {
  const G = bossRun(17);
  const bot = createBot({ doors: false });
  const states = new Set();
  const acts = new Set();
  let zones = 0;
  let guard = 0;
  let boss = null;
  while (mapRoom(G).state !== 'cleared' && guard++ < 60 * 120) {
    const before = G.room.zones.length;
    step(G, bot(G));
    G.events.length = 0;
    boss ??= G.room.boss;
    if (boss && !boss.dead) {
      states.add(boss.state);
      acts.add(boss.act);
      assert.ok(boss.k >= 0 && boss.k <= 1);
    }
    if (G.room.zones.length > before) zones += 1;
  }
  assert.equal(mapRoom(G).state, 'cleared', `медведь не побеждён за две минуты (здоровье ${boss?.hp})`);
  assert.ok(G.time < 110);
  for (const s of ['walk', 'slam']) assert.ok(states.has(s), `состояние ${s}`);
  assert.ok(states.has('aim') || states.has('tired'), [...states].join(','));
  for (const a of ['spawn', 'move', 'windup', 'attack']) assert.ok(acts.has(a), `поза ${a}: ${[...acts].join(',')}`);
  assert.ok(zones >= 3, 'красные зоны были');
  assert.equal(G.cnt.bosses, 1);
});

test('медведь бьёт по-настоящему: удар лапой снимает два сердца, бег — тоже', () => {
  const G = bossRun(3);
  cheat.god(G, false);
  const P = G.player;
  runUntil(G, (g) => g.room.dir.mode === 'boss', { seconds: 4 });
  const boss = G.room.boss;
  runUntil(G, () => boss.state === 'slam' || boss.state === 'aim', { seconds: 12, each: (g) => { g.player.hp = 5; g.player.inv = 9; } });
  runSteps(G, 2);
  P.inv = 0;
  if (boss.state === 'slam') {
    const z = G.room.zones.find((o) => o.owner === boss.uid);
    assert.ok(z && z.dmg === 2 && z.shape === 'circle');
    put(G, z.x, z.y);
    const ev = runUntil(G, (g) => g.player.hp < 5, { seconds: 2 });
    assert.equal(P.hp, 3, 'удар хозяина — два сердца');
    assert.ok(sounds(ev).includes('paw'));
  } else {
    const z = G.room.zones.find((o) => o.owner === boss.uid);
    assert.ok(z && z.dmg === 0 && z.shape === 'lane', 'полоса только показывает путь');
    put(G, (z.x + z.x2) / 2, (z.y + z.y2) / 2);
    runUntil(G, (g) => g.player.hp < 5, { seconds: 3 });
    assert.equal(P.hp, 3, 'сбил на бегу — два сердца');
  }
});

// ---------- места ----------

test('начало пути: на первой локации — два ручных кролика, сундук с простым оружием и три таблички', () => {
  const G = newRun(9);
  const room = G.room;
  assert.equal(room.type, 'start');
  assert.equal(mapRoom(G).state, 'cleared');
  assert.ok(room.open);
  const rabbits = room.mobs.filter((m) => m.id === 'rabbit');
  assert.equal(rabbits.length, 2);
  assert.ok(rabbits.every((m) => m.tame));
  const signs = room.things.filter((t) => t.kind === 'sign');
  assert.equal(signs.length, 3);
  assert.ok(signs.every((s) => s.text.length > 5 && !s.solid && !s.usable));
  const chest = room.things.find((t) => t.kind === 'chest');
  assert.ok(chest.usable && chest.place === 'start');
  assert.deepEqual([G.player.x, G.player.y], [room.dens[0].x, room.dens[0].y], 'лиса — у своей норы');
  // ручные кролики не уходят в норы и подпускают близко
  runSteps(G, 60 * 25);
  assert.equal(room.mobs.filter((m) => !m.dead).length, 2);
  // табличка показывает подсказку и стрельбе не мешает
  put(G, signs[0].x, signs[0].y + 20);
  runSteps(G, 2);
  assert.deepEqual([room.focus.type, room.focus.title], ['hint', signs[0].text]);
  // сундук
  put(G, chest.x - 22, chest.y);
  runSteps(G, 2);
  assert.deepEqual([room.focus.type, room.focus.title], ['thing', 'Открыть']);
  const ev = runSteps(G, 2, makeInput({ fire: true }));
  assert.equal(chest.v, 1);
  assert.ok(sounds(ev).includes('chest'));
  const p = room.picks.find((x) => x.kind === 'item');
  assert.ok(p && kindOf(p.id) === 'weapon' && REG.WEAPONS[p.id].rarity === 0);
  assert.equal(mapRoom(G).data.opened, 1);
  // взять
  runSteps(G, 30);
  put(G, p.x, p.y);
  runSteps(G, 2);
  assert.equal(room.focus.title, 'Взять');
  assert.equal(room.focus.sub, REG.WEAPONS[p.id].name);
  runSteps(G, 2, makeInput({ act: true }));
  assert.equal(G.inv.weapon?.id, p.id);
  // вернулась в комнату: сундук открыт, кроликов заново не дают
  const id = room.id;
  enterRoom(G, id, 'c');
  assert.equal(G.room.things.find((t) => t.kind === 'chest').v, 1);
  assert.equal(G.room.mobs.length, 0);
});

test('сундук: одна бесплатная находка; открытый остаётся открытым', () => {
  const G = newRun(15);
  cheat.warp(G, 'treasure');
  const room = G.room;
  assert.deepEqual([room.type, room.dir.mode, room.open, mapRoom(G).state], ['treasure', 'cleared', true, 'cleared']);
  const chest = room.things.find((t) => t.kind === 'chest');
  assert.deepEqual([chest.x, chest.y], [room.center.x, room.center.y]);
  put(G, chest.x, chest.y + 24);
  runSteps(G, 2);
  runSteps(G, 2, makeInput({ act: true }));
  assert.equal(chest.v, 1);
  assert.equal(room.picks.filter((p) => p.kind === 'item').length, 1);
  assert.ok(room.picks.some((p) => p.kind === 'coin'));
  runSteps(G, 2);
  assert.notEqual(room.focus?.ref, chest, 'второй раз не открыть');
  // вещь осталась лежать — и дождалась
  const left = room.picks.find((p) => p.kind === 'item');
  enterRoom(G, G.map.startId, 'c');
  assert.deepEqual(G.map.rooms[room.id].data.left.map((e) => [e.k, e.id]), [['item', left.id]]);
  enterRoom(G, room.id, 'c');
  assert.equal(G.room.things.find((t) => t.kind === 'chest').v, 1);
  assert.deepEqual(G.room.picks.map((p) => [p.kind, p.id]), [['item', left.id]], 'монеты не хранятся, вещь — да');
  assert.deepEqual(leftOf(G.room).map((e) => e.id), [left.id]);
});

test('зубастый сундук: если такой зверь описан, иногда вместо находки — бой при закрытых дверях', () => {
  REG.MOBS.mimic = { name: 'Зубастый сундук', kind: 'hostile', hp: 12, r: 12, pts: 4, touch: 1, wave: false };
  let fights = 0;
  let opened = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const G = newRun(seed);
    cheat.god(G, true);
    cheat.warp(G, 'treasure');
    const chest = G.room.things.find((t) => t.kind === 'chest');
    put(G, chest.x, chest.y + 24);
    runSteps(G, 2);
    runSteps(G, 2, makeInput({ act: true }));
    const m = G.room.mobs.find((x) => x.id === 'mimic');
    if (!m) {
      opened += 1;
      assert.equal(chest.v, 1);
      continue;
    }
    fights += 1;
    assert.deepEqual([G.room.dir.mode, G.room.open], ['fight', false]);
    assert.ok(!G.room.things.includes(chest));
    runSteps(G, 60);
    hurtMob(G, m, 99, hitOf('shot'));
    const ev = runSteps(G, 3);
    assert.deepEqual([G.room.dir.mode, G.room.open], ['cleared', true]);
    assert.ok(sounds(ev).includes('door'));
    enterRoom(G, G.room.id, 'c');
    assert.equal(G.room.mobs.length, 0, 'второй раз не кусается');
  }
  delete REG.MOBS.mimic;
  assert.ok(fights >= 3 && fights <= 22, `зубастых ${fights} из 120`);
  assert.equal(fights + opened, 120);
});

test('лавка: три вещи и два расходника; покупка за монеты, проданное не возвращается', () => {
  const G = newRun(15);
  cheat.warp(G, 'shop');
  const room = G.room;
  const mr = mapRoom(G);
  assert.equal(room.type, 'shop');
  const stock = mr.data.stock;
  assert.equal(stock.length, 5);
  assert.equal(stock.filter((e) => e.k === 'item' && kindOf(e.id) !== 'potion').length, 3);
  assert.equal(new Set(stock.filter((e) => e.k === 'item').map((e) => e.id)).size, stock.filter((e) => e.k === 'item').length, 'без повторов');
  assert.ok(room.things.some((t) => t.rig === 'trader'));
  const stalls = room.things.filter((t) => t.kind === 'pedestal');
  assert.equal(stalls.length, 5);
  const stall = stalls.find((t) => t.item);
  const ware = stock[stall.tag];
  assert.equal(ware.price, price({ id: ware.id }, 1));
  put(G, stall.x, stall.y + 22);
  runSteps(G, 2);
  assert.deepEqual([room.focus.title, room.focus.sub, room.focus.cost, room.focus.ok], ['Купить', REG.WEAPONS[ware.id]?.name ?? REG.ARMOR[ware.id]?.name ?? REG.ACCESSORIES[ware.id].name, ware.price, false]);
  // денег нет
  let ev = runSteps(G, 2, makeInput({ act: true }));
  assert.ok(sounds(ev).includes('deny'));
  assert.ok(of(ev, 'toast').length === 1);
  assert.equal(ware.sold, false);
  // деньги есть
  G.coins = ware.price + 3;
  runSteps(G, 25);
  assert.equal(room.focus.ok, true, 'подпись заметила монеты');
  ev = runSteps(G, 2, makeInput({ act: true }));
  assert.equal(G.coins, 3);
  assert.ok(sounds(ev).includes('buy'));
  assert.ok(ware.sold && !stall.usable && stall.item === null);
  assert.ok([G.inv.weapon, G.inv.armor, ...G.inv.acc, ...G.inv.bag].some((it) => it?.id === ware.id));
  assert.ok(G.seen.includes(ware.id));
  // расходники: сердце не продаётся здоровой лисе
  const heart = stalls.find((t) => stock[t.tag].k === 'heart');
  if (heart) {
    G.coins = 99;
    put(G, heart.x, heart.y + 22);
    runSteps(G, 2);
    assert.equal(room.focus.sub, 'Сердце');
    ev = runSteps(G, 2, makeInput({ act: true }));
    assert.equal(G.coins, 99);
    assert.ok(sounds(ev).includes('deny'));
    G.player.hp = 2;
    runSteps(G, 2, makeInput({ act: true }));
    assert.equal(G.player.hp, 4);
    assert.equal(G.coins, 99 - stock[heart.tag].price);
  }
  // вышла и вернулась: тот же товар, проданное продано
  const id = room.id;
  enterRoom(G, G.map.startId, 'c');
  enterRoom(G, id, 'c');
  assert.deepEqual(mapRoom(G).data.stock, stock);
  const again = G.room.things.filter((t) => t.kind === 'pedestal');
  assert.equal(again.filter((t) => !t.usable).length, stock.filter((e) => e.sold).length);
  // скидка
  REG.ACCESSORIES['test-bargain'] = { name: 'Скидка', rarity: 0, drop: false, mul: { shopMul: 0.5 } };
  G.inv.acc[2] = { id: 'test-bargain' };
  recalc(G);
  const other = again.find((t) => t.usable && t.item);
  put(G, other.x, other.y + 22);
  runSteps(G, 2);
  assert.equal(G.room.focus.cost, shopPrice(G, stock[other.tag].price));
  assert.equal(G.room.focus.cost, Math.max(1, Math.round(stock[other.tag].price * 0.5)));
});

test('места могут затеять бой и испытание: двери закрыты до победы', () => {
  const G = arena({ door: true });
  cheat.god(G, true);
  let done = 0;
  assert.equal(startFight(G, () => { done += 1; }), true);
  assert.deepEqual([G.room.dir.mode, G.room.open], ['fight', false]);
  assert.equal(startFight(G), false, 'второй бой поверх первого не начинается');
  queueMob(G, 'hedgehog', true, 0.2);
  runSteps(G, 30);
  const m = G.room.mobs[0];
  assert.ok(m && m.elite);
  runSteps(G, 60);
  assert.equal(G.room.dir.mode, 'fight');
  hurtMob(G, m, 1e6, hitOf('shot'));
  runSteps(G, 3);
  assert.deepEqual([G.room.dir.mode, G.room.open, done], ['cleared', true, 1]);
  // испытание: три волны, как в охоте
  let won = 0;
  assert.equal(startChallenge(G, 3, () => { won += 1; }), true);
  const waves = [];
  for (let i = 0; i < 60 * 150 && G.room.dir.mode !== 'cleared'; i++) {
    step(G, makeInput());
    slay(G);
    for (const e of drain(G)) if (e.t === 'wave') waves.push([e.n, e.of]);
    assert.equal(G.room.task, null, 'в испытании заданий нет');
  }
  assert.deepEqual(waves, [[1, 3], [2, 3], [3, 3]]);
  assert.deepEqual([G.room.dir.mode, G.room.open, won], ['cleared', true, 1]);
  assert.equal(G.cnt.rooms, 0, 'испытание — не «зачищенная комната»');
});

// ---------- отладка ----------

test('отладка: перенос, зверь по заказу, мгновенная зачистка, выдача вещей', () => {
  const G = newRun(2);
  assert.equal(cheat.warp(G, 'нет такого'), false);
  assert.equal(cheat.warp(G, 'hunt'), true);
  runUntil(G, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
  cheat.clear(G);
  assert.deepEqual([G.room.dir.mode, G.room.open, mapRoom(G).state], ['cleared', true, 'cleared']);
  runSteps(G, 3);
  assert.equal(G.room.mobs.length, 0);
  const m = cheat.spawn(G, 'boar');
  assert.ok(m && m.id === 'boar' && Math.hypot(m.x - G.player.x, m.y - G.player.y) >= 3 * T - 1);
  assert.equal(cheat.spawn(G, 'нет такого'), null);
  assert.equal(cheat.warp(G, 'boss'), true);
  cheat.clear(G);
  assert.equal(mapRoom(G).state, 'cleared');
  assert.ok(G.room.things.some((t) => t.kind === 'portal'));
  assert.equal(G.cnt.bosses, 1);
  assert.ok(cheat.give(G, 'pinecone') && G.inv.weapon.id === 'pinecone');
  assert.ok(cheat.give(G, 'vigor') && G.gifts.includes('vigor') && G.player.st.maxHp === 6);
  assert.ok(cheat.give(G, 'hedgie') && G.minions.length === 1);
  assert.ok(cheat.give(G, 'minion:hedgie') && G.minions.length === 2);
  assert.ok(cheat.give(G, 'gift:swift') && G.gifts.includes('swift'));
  assert.ok(cheat.give(G, 'coins') && G.coins >= 100);
  assert.equal(cheat.give(G, 'нет такого'), false);
  assert.equal(cheat.give(G, 42), false);
});

// ---------- добыча ----------

test('добыча: пасётся → заметила лису → убегает быстрее, чем лиса ходит → устаёт → отдыхает', () => {
  const G = arena();
  const P = G.player;
  put(G, 150, 240);
  const r = spawnMob(G, 'rabbit', 400, 240);
  const def = REG.MOBS.rabbit;
  runSteps(G, 120);
  assert.deepEqual([r.state, r.act], ['graze', 'graze']);
  assert.ok(Math.hypot(r.vx, r.vy) <= def.walk + 1, 'пасётся шагом');
  // лиса подходит
  put(G, r.x - def.aware + 10, r.y);
  runSteps(G, 3);
  assert.deepEqual([r.state, r.act], ['alert', 'alert']);
  assert.equal(r.face, -1, 'смотрит на лису');
  runSteps(G, 20);
  assert.equal(r.state, 'flee');
  // погоня пешком, не прижимая к стене: кролик быстрее
  const acts = new Set();
  let tiredAt = -1;
  let fled = 0;
  const t0 = G.time;
  for (let i = 0; i < 60 * 7; i++) {
    const d = Math.hypot(r.x - P.x, r.y - P.y);
    const input = makeInput({ mx: (r.x - P.x) / d, my: (r.y - P.y) / d });
    if (d < 130) Object.assign(input, { mx: 0, my: 0 });    // не ловим и в угол не загоняем: смотрим, как бегает
    step(G, input);
    acts.add(r.act);
    if (r.state === 'flee') fled = Math.max(fled, Math.hypot(r.vx, r.vy));
    if (r.state === 'tired' && tiredAt < 0) tiredAt = G.time - t0;
    if (r.dead) break;
  }
  assert.ok(fled > BASE.speed + 5, `бежит со скоростью ${fled}`);
  assert.ok(fled <= def.speed + 1);
  assert.ok(tiredAt > def.tire - 0.6 && tiredAt < def.tire + 1.2, `устал через ${tiredAt}`);
  assert.ok(acts.has('flee') && acts.has('tired'));
  // лиса отстала — успокаивается
  put(G, 60, 60);
  const calm = spawnMob(G, 'rabbit', 700, 400);
  calm.state = 'flee';
  runSteps(G, 150);
  assert.equal(calm.state, 'graze');
});

test('добыча: по времени уходит в ближайшую нору — и не считается пойманной', () => {
  const G = arena({ tpl: 'forest-thicket' });
  put(G, 60, 240);
  const room = G.room;
  const r = spawnMob(G, 'rabbit', tileX(12), tileY(8));
  r.life = 1;
  const ev = runUntil(G, () => r.dead, { seconds: 15 });
  assert.ok(r.dead);
  const burrow = room.burrows.find((b) => Math.hypot(b.x - r.x, b.y - r.y) < 12);
  assert.ok(burrow, 'исчез у норы');
  assert.deepEqual(of(ev, 'escape').map((e) => e.id), ['rabbit']);
  assert.equal(of(ev, 'catch').length, 0);
  assert.deepEqual([G.score, G.cnt.rabbits], [0, 0]);
  const dive = spawnMob(G, 'rabbit', tileX(12), tileY(8));
  dive.life = 0.01;
  const acts = [];
  runUntil(G, () => dive.dead, { seconds: 15, each: () => acts.push([dive.act, dive.k]) });
  const diving = acts.filter(([a]) => a === 'dive');
  assert.ok(diving.length >= 10 && diving[0][1] < 0.2 && diving[diving.length - 1][1] > 0.9, 'нырок в нору идёт от 0 до 1');
  // сроки у разных зверей
  assert.ok(REG.MOBS.gold.life === 8 && REG.MOBS.gold.speed > REG.MOBS.hare.speed && REG.MOBS.hare.speed > REG.MOBS.rabbit.speed);
  assert.ok(REG.MOBS.fat.speed < BASE.speed, 'толстяка догонишь и пешком');
  assert.ok(REG.MOBS.rabbit.speed > BASE.speed);
});

test('добыча всегда уходит из красной зоны, а загнанная в угол на миг замирает', () => {
  const G = arena();
  put(G, 60, 420);
  for (const [x, y] of [[400, 240], [420, 250], [380, 230]]) spawnMob(G, 'rabbit', x, y);
  runSteps(G, 30);
  addZone(G, { x: 400, y: 240, r: 70, t: 2, dmg: 1 });
  runSteps(G, 100);
  for (const m of G.room.mobs) assert.equal(dangerAt(G.room, m.x, m.y, 0), null, 'кролик вышел из зоны');
  // угол
  const C = arena();
  const corner = { x: C.room.w * T - T - 20, y: C.room.h * T - T * 3 };
  const r = spawnMob(C, 'rabbit', corner.x, corner.y);
  put(C, corner.x - 150, corner.y - 30);
  let froze = false;
  for (let i = 0; i < 60 * 6 && !r.dead; i++) {
    const d = Math.hypot(r.x - C.player.x, r.y - C.player.y);
    step(C, makeInput(d > 30 ? { mx: (r.x - C.player.x) / d, my: (r.y - C.player.y) / d } : {}));
    froze ||= r.act === 'freeze';
  }
  assert.ok(froze || r.dead, 'загнанный кролик замер (или уже пойман)');
  // замерев, он рвётся из угла на простор, а не стоит там вечно
  const B = arena();
  const hole = { x: tileX(22), y: tileY(13) };                 // закуток между деревом в углу и стеной
  assert.equal(tileAt(B.room, hole.x + T, hole.y), TILE.TALL);
  const b = spawnMob(B, 'rabbit', hole.x + 4, hole.y + 4);
  put(B, hole.x - 44, hole.y - 26);
  cheat.god(B, true);
  let away = 0;
  runSteps(B, 60 * 4, makeInput(), () => { away = Math.max(away, Math.hypot(b.x - hole.x, b.y - hole.y)); });
  assert.ok(b.dead || away > 60, `из угла вырвался на ${away.toFixed(0)}`);
});

test('заяц отпрыгивает вбок от рывка, начатого издалека, — не чаще раза в три секунды; от близкого не успевает', () => {
  const far = arena();
  put(far, 200, 240);
  const hare = spawnMob(far, 'hare', 330, 240, { tame: true });
  runSteps(far, 1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(hare.state, 'hop');
  assert.ok(hare.leapT > 0);
  const acts = new Set();
  runUntil(far, (g) => !g.player.dash, { seconds: 1, each: () => acts.add(hare.act) });
  assert.ok(!hare.dead, 'ушёл из-под рывка');
  assert.ok(Math.abs(hare.y - 240) > 30, `отпрыгнул вбок на ${Math.abs(hare.y - 240)}`);
  assert.ok(acts.has('hop'));
  assert.ok(Math.abs(hare.hopCd - 3) < 0.4);
  // сразу второй рывок — отпрыгнуть ещё не может
  far.player.charges = 1;
  put(far, hare.x - 110, hare.y);
  runSteps(far, 1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  runUntil(far, (g) => !g.player.dash, { seconds: 1 });
  assert.ok(hare.dead, 'второй рывок подряд — пойман');
  // рывок вблизи
  const near = arena();
  put(near, 200, 240);
  const h2 = spawnMob(near, 'hare', 255, 240, { tame: true });
  runSteps(near, 1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  runUntil(near, (g) => !g.player.dash, { seconds: 1 });
  assert.ok(h2.dead, 'с 55 единиц — не успел');
  // добыча со своим поведением (бабочка задания): думает сама, но срок у неё всё равно есть
  let thoughts = 0;
  REG.MOBS['test-moth'] = { name: 'Бабочка', kind: 'prey', pts: 3, r: 7, life: 2, flying: true, think(m, g, dt, ai) { thoughts += 1; ai.move(m, m.t * 5, 60); } };
  const M = arena();
  put(M, 100, 100);
  const moth = spawnMob(M, 'test-moth', 500, 300);
  const mev = runSteps(M, 150);
  assert.ok(thoughts > 100 && moth.dead, 'время вышло — улетела');
  assert.deepEqual(of(mev, 'escape').map((e) => e.id), ['test-moth']);
  const caught = spawnMob(M, 'test-moth', 500, 300);
  put(M, 495, 300);
  assert.deepEqual(of(runSteps(M, 2), 'catch').map((e) => [e.id, e.pts]), [['test-moth', 3]]);
  assert.ok(caught.dead);
  delete REG.MOBS['test-moth'];
  // кролик отпрыгивать не умеет
  const plain = arena();
  put(plain, 200, 240);
  const rabbit = spawnMob(plain, 'rabbit', 330, 240, { tame: true });
  preyDashAlert(plain, { sx: 200, sy: 240, ex: 348, ey: 240, ux: 1, uy: 0 });
  assert.equal(rabbit.leapT, 0);
  assert.equal(DASH.sweep, 14);
});

// ---------- образцовые враги ----------

test('ёж: идёт к лисе (его можно бить) → замах → колючий шар → отдых; колюч только свернувшись', () => {
  const G = arena();
  cheat.god(G, true);
  put(G, 300, 240);
  const m = spawnMob(G, 'hedgehog', 500, 240, { warm: 0 });
  const def = REG.MOBS.hedgehog;
  const seen = [];
  const spikyIn = new Set();
  runSteps(G, 60 * 16, makeInput(), () => {
    if (seen[seen.length - 1] !== m.state) seen.push(m.state);
    if (def.spiky(m, G, 0, 0)) spikyIn.add(m.state);
    if (m.state === 'curl' && m.t > 0) assert.equal(m.act, 'curl');
    if (m.state === 'windup' && m.t > 0) assert.equal(m.act, 'windup');
    assert.ok(m.k >= 0 && m.k <= 1);
  });
  assert.deepEqual(seen.slice(0, 5), ['walk', 'windup', 'curl', 'recover', 'walk']);
  assert.deepEqual([...spikyIn], ['curl']);
  assert.ok(Math.hypot(m.x - 300, m.y - 240) < 60, 'дошёл до лисы');
});

test('кабан: красная полоса → бросок по ней → врезался в стену — оглушён', () => {
  const G = arena();
  cheat.god(G, true);
  put(G, 150, 240);
  const m = spawnMob(G, 'boar', 420, 240, { warm: 0 });
  const seen = [];
  let lane = null;
  let top = 0;
  const ev = runSteps(G, 60 * 12, makeInput(), () => {
    if (seen[seen.length - 1] !== m.state) seen.push(m.state);
    lane ??= G.room.zones.find((z) => z.owner === m.uid) && { ...G.room.zones.find((z) => z.owner === m.uid) };
    if (m.state === 'charge') top = Math.max(top, Math.hypot(m.vx, m.vy));
  });
  assert.ok(seen.includes('windup') && seen.includes('charge'), seen.join(' → '));
  assert.ok(seen.indexOf('windup') < seen.indexOf('charge'));
  assert.ok(lane && lane.shape === 'lane' && lane.dmg === 0 && Math.abs(lane.total - 0.6) < 1e-9, 'полоса только показывает бросок');
  assert.ok(top > 300, `скорость броска ${top}`);
  assert.ok(seen.includes('stun') || seen.includes('recover'));
  assert.ok(sounds(ev).includes('growl'));
  // прямо в стену
  const W = arena();
  cheat.god(W, true);
  put(W, 50, 240);
  const b = spawnMob(W, 'boar', 200, 240, { warm: 0 });
  b.cd = 0;
  const states = [];
  runSteps(W, 60 * 5, makeInput(), () => {
    if (states[states.length - 1] !== b.state) states.push(b.state);
    if (b.state === 'stun' && b.t > 0) assert.equal(b.act, 'stun');
  });
  assert.ok(states.includes('stun'), `врезался и оглушён: ${states.join(' → ')}`);
  // «раньше предупреждать»: кабан ждёт столько же, сколько горит полоса
  assert.equal(ACTS.tele(W, 0.6), 0.6);
  W.player.st.warn = 0.4;
  assert.equal(ACTS.tele(W, 0.6), 1);
});

test('враги обходят преграды по полю путей и не стоят друг в друге', () => {
  const walker = 'test-chaser';
  REG.MOBS[walker] = { name: 'Ходок', kind: 'hostile', hp: 10, r: 10, pts: 1, touch: 0, wave: false, think(m, G, dt, ai) { ai.chase(m, G, 90); } };
  const G = arena({ tpl: 'forest-pond' });
  cheat.god(G, true);
  // лиса и звери — по разные стороны пруда
  put(G, tileX(16), tileY(6));
  const pack = [];
  for (let i = 0; i < 6; i++) pack.push(spawnMob(G, walker, tileX(5), tileY(6), { warm: 0 }));
  runSteps(G, 60 * 9, makeInput(), () => {
    for (const m of pack) assert.notEqual(tileAt(G.room, m.x, m.y), TILE.WATER, 'по воде не ходят');
  });
  for (const m of pack) assert.ok(Math.hypot(m.x - G.player.x, m.y - G.player.y) < 70, 'все обошли пруд и пришли');
  let overlaps = 0;
  for (let i = 0; i < pack.length; i++) {
    for (let j = i + 1; j < pack.length; j++) if (Math.hypot(pack[i].x - pack[j].x, pack[i].y - pack[j].y) < 12) overlaps += 1;
  }
  assert.equal(overlaps, 0, 'не слиплись в одну точку');
  delete REG.MOBS[walker];
});

test('готовые действия зверей: держать расстояние, кружить, убегать, прыгать, звать подмогу', () => {
  const G = arena();
  cheat.god(G, true);
  put(G, 400, 240);
  const make = (id, think, extra = {}) => {
    REG.MOBS[id] = { name: id, kind: 'hostile', hp: 10, r: 9, pts: 1, touch: 0, wave: false, think, ...extra };
    return spawnMob(G, id, 400, 120, { warm: 0 });
  };
  const keeper = make('test-keeper', (m, g, dt, ai) => { ai.keepRange(m, g, 110, 150, 80); });
  const circler = make('test-circler', (m, g, dt, ai) => { ai.orbit(m, g, 100, 80); });
  const coward = make('test-coward', (m, g, dt, ai) => { ai.flee(m, g, 90); });
  const flyer = make('test-flyer', (m, g, dt, ai) => { ai.chase(m, g, 100); }, { flying: true });
  keeper.x = 430;
  flyer.x = 700;
  flyer.y = 400;
  let turned = 0;
  let last = Math.atan2(circler.y - 240, circler.x - 400);
  runSteps(G, 60 * 6, makeInput(), () => {
    const a = Math.atan2(circler.y - 240, circler.x - 400);
    let d = a - last;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turned += d;
    last = a;
  });
  const dist = (m) => Math.hypot(m.x - 400, m.y - 240);
  assert.ok(dist(keeper) > 100 && dist(keeper) < 160, `держит расстояние: ${dist(keeper)}`);
  assert.ok(dist(circler) > 80 && dist(circler) < 125, `кружит на ${dist(circler)}`);
  assert.ok(Math.abs(turned) > 2.5, `обошёл на ${turned.toFixed(1)} рад`);
  assert.ok(dist(coward) > 200, 'убежал подальше');
  assert.ok(dist(flyer) < 20, 'летун прилетел напрямик');
  assert.ok(flyer.z > 0, 'и держится в воздухе');
  // прыжок: по дуге в точку, пока летит — «мысль» не зовётся
  let thoughts = 0;
  const jumper = make('test-jumper', () => { thoughts += 1; });
  jumper.x = 200;
  jumper.y = 300;
  assert.equal(ACTS.leap(jumper, G, 320, 300, 0.4, 20, 'leap'), true);
  assert.ok(ACTS.leaping(jumper));
  const before = thoughts;
  let top = 0;
  runSteps(G, 20, makeInput(), () => { top = Math.max(top, jumper.z); assert.equal(jumper.act, 'leap'); });
  assert.equal(thoughts, before);
  assert.ok(top > 15 && top <= 20.01);
  runSteps(G, 10);
  assert.ok(Math.abs(jumper.x - 320) < 1 && jumper.z === 0 && !ACTS.leaping(jumper));
  assert.ok(thoughts > before);
  assert.equal(ACTS.leap(jumper, G, jumper.x, jumper.y), false, 'прыгать на месте некуда');
  // в стену прыжок не уносит
  assert.equal(ACTS.leap(jumper, G, -500, 300, 0.3), true);
  runSteps(G, 30);
  assert.ok(jumper.x > T && standable(G.room, jumper.x, jumper.y, 9));
  // подмога
  const n = G.room.mobs.length;
  assert.equal(ACTS.summon(jumper, G, 'hedgehog', 3, 50), 3);
  assert.equal(G.room.mobs.length, n + 3);
  assert.equal(ACTS.count(G, 'hedgehog'), 3);
  assert.ok(G.room.mobs.slice(-3).every((m) => m.inv > 0 && standable(G.room, m.x, m.y, 9)));
  // упреждение и доля здоровья
  G.player.vx = 100;
  const p = ACTS.lead(jumper, G, 0.5);
  assert.deepEqual([p.x, p.y], [450, 240]);
  jumper.hp = 5;
  assert.equal(ACTS.hp(jumper), 0.5);
  assert.equal(ACTS.strike(jumper, G, 5, 1), false, 'далеко — удар не достаёт');
  for (const id of ['test-keeper', 'test-circler', 'test-coward', 'test-flyer', 'test-jumper']) delete REG.MOBS[id];
});

// ---------- спутник ----------

test('спутник-ёжик: ходит за лисой, катится во врагов, переходит с ней в другую комнату, подлечивается после охоты', () => {
  const G = arena({ door: true });
  cheat.god(G, true);
  put(G, 300, 240);
  assert.ok(hireMinion(G, 'hedgie'));
  const ev = drain(G);
  assert.ok(sounds(ev).includes('hire'));
  assert.equal(G.minions.length, 1);
  const n = G.room.pals[0];
  assert.deepEqual([n.id, n.hp, n.maxHp], ['hedgie', 6, 6]);
  // идёт следом
  runSteps(G, 120, makeInput({ mx: 1 }));
  assert.ok(Math.hypot(n.x - G.player.x, n.y - G.player.y) < 90, 'не отстал');
  runSteps(G, 60);
  assert.ok(Math.hypot(n.vx, n.vy) < 5 || Math.hypot(n.x - G.player.x, n.y - G.player.y) < 60, 'рядом с лисой стоит');
  // враг рядом — катится
  const m = dummy(G, G.player.x + 110, G.player.y);
  const acts = new Set();
  runSteps(G, 60 * 5, makeInput(), () => acts.add(n.act));
  assert.ok(m.hp <= 1000 - 4, `ёжик ударил ${Math.round((1000 - m.hp) / 2)} раз`);
  assert.ok(acts.has('roll'));
  m.dead = true;
  // в другую комнату
  const d = G.room.doors.e;
  put(G, d.x - T, d.y);
  runUntil(G, (g) => g.room.id === 1, { seconds: 2, input: makeInput({ mx: 1 }) });
  assert.equal(G.room.pals.length, 1);
  assert.ok(Math.hypot(G.room.pals[0].x - G.player.x, G.room.pals[0].y - G.player.y) < 60, 'появился рядом');
  // подлечивается, когда комната зачищена
  const H2 = hunt(12);
  hireMinion(H2, 'hedgie');
  H2.minions[0].hp = 2;
  H2.room.pals[0].hp = 2;
  for (let i = 0; i < 60 * 80 && H2.room.dir.mode !== 'cleared'; i++) {
    step(H2, makeInput());
    slay(H2);
    H2.room.pals[0] && (H2.room.pals[0].touchT = 1);          // чтобы ежа не покусали раньше времени
  }
  assert.equal(H2.room.dir.mode, 'cleared');
  assert.equal(H2.minions[0].hp, 3);
});

// ---------- подбор вещей ----------

test('вещи с земли: в свободную ячейку своего вида, иначе в рюкзак; случайная находка — по редкости и без повторов', () => {
  const G = arena({ seed: 2 });
  assert.equal(giveItem(G, { id: 'pinecone' }), 'equip');
  assert.equal(giveItem(G, { id: 'claws' }), 'bag');
  assert.equal(giveItem(G, { id: 'нет такой' }), false);
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const it = rollItem(G);
    assert.ok(it && kindOf(it.id) && kindOf(it.id) !== 'potion', 'зелья сами не выпадают');
    assert.ok(it.id !== 'pinecone' && it.id !== 'claws', 'того, что уже есть, не дают');
    ids.add(it.id);
  }
  assert.ok(ids.size >= 4, [...ids].join(','));
  assert.equal(rollItem(G, { kinds: ['potion'] }).id, 'heal');
  assert.equal(rollItem(G, { kinds: [] }), null);
  for (let i = 0; i < 50; i++) {
    const rare = rollItem(G, { minRarity: 2 });
    assert.ok((REG.WEAPONS[rare.id] ?? REG.ARMOR[rare.id] ?? REG.ACCESSORIES[rare.id]).rarity >= 1, 'нет нужной редкости — берётся ближайшая');
  }
  // редкость растёт с локацией и удачей
  const share = (floor, luck) => {
    const r = rngFrom(5);
    let rare = 0;
    for (let i = 0; i < 4000; i++) if (rollRarity(floor, luck, r) >= 2) rare += 1;
    return rare / 4000;
  };
  assert.ok(share(1, 0) < 0.12 && share(8, 0) > share(1, 0) * 1.8 && share(1, 4) > share(1, 0) * 2);
  // открыть сундук с заданной вещью
  const chest = { kind: 'chest', x: 300, y: 200, v: 0, usable: true, loot: null, tag: null };
  assert.equal(openChest(G, chest, { item: { id: 'vest', lvl: 0 }, coins: 5, heart: true }), true);
  assert.equal(openChest(G, chest), false);
  assert.deepEqual(G.room.picks.filter((p) => p.kind === 'item').map((p) => p.id), ['vest']);
  assert.ok(G.room.picks.some((p) => p.kind === 'heart'));
  assert.equal(useFocus(G), false, 'в фокусе пусто — делать нечего');
});
