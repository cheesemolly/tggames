// Хозяева мест и напасти «Лисьей охоты»: данные, предупреждения, бой с каждым хозяином до гибели.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, REG, BIOMES, rndOf } from '../core.js';
import '../content.js';
import { BOSSES } from '../bosses.js';
import { HAZARDS } from '../hazards.js';
import { spawnMob } from '../ai.js';
import { step, drain } from '../logic.js';
import { arena, put, runSteps, createBot, findNaN, makeInput } from './helpers.js';

const BOSS_IDS = Object.keys(BOSSES);
const POSES = new Set(['idle', 'walk', 'move', 'spawn', 'windup', 'attack', 'recover', 'stun', 'charge', 'roar', 'tired', 'hop', 'spit', 'cast', 'drop', 'summon', 'teleport', 'dive', 'stomp', 'hurt']);

test('хозяева: данные', () => {
  assert.deepEqual(BOSS_IDS.sort(), ['bear', 'moose', 'owl', 'spiderqueen', 'toad']);
  const biomes = new Set();
  for (const id of BOSS_IDS) {
    const d = BOSSES[id];
    assert.equal(REG.MOBS[id], d, `${id}: в реестре`);
    assert.equal(d.kind, 'boss');
    assert.ok(d.name && BIOMES.includes(d.biome), `${id}: имя и место`);
    assert.ok(!biomes.has(d.biome), `${id}: у места один хозяин`);
    biomes.add(d.biome);
    assert.ok(d.hp >= 80 && d.r >= 20 && d.mass >= 6 && d.pts >= 30, `${id}: числа`);
    assert.equal(d.touch, 0, `${id}: телом не бьёт`);
    assert.ok(Array.isArray(d.coins) && d.coins[0] <= d.coins[1]);
    assert.equal(typeof d.think, 'function');
    assert.equal(typeof d.init, 'function');
  }
  assert.deepEqual([...biomes].sort(), [...BIOMES].sort(), 'у каждого места свой хозяин');
});

test('напасти: данные', () => {
  assert.deepEqual(Object.keys(HAZARDS).sort(), ['bear', 'geyser', 'gunshot', 'icicles', 'lightning', 'moose', 'rockfall']);
  for (const [id, d] of Object.entries(HAZARDS)) {
    assert.equal(REG.HAZARDS[id], d);
    assert.ok(d.name && typeof d.fire === 'function', id);
    for (const b of d.biomes ?? []) assert.ok(BIOMES.includes(b), `${id}: место ${b}`);
  }
});

test('напасти: каждая зона предупреждает и не бьёт сразу', () => {
  for (const id of Object.keys(HAZARDS)) {
    for (let seed = 1; seed <= 25; seed++) {
      const G = arena({ seed, floor: 1 + (seed % 4) });
      G.loop = seed % 3;
      const P = G.player;
      put(G, G.room.center.x + (seed % 5) * 20 - 40, G.room.center.y + (seed % 3) * 15);
      P.vx = (seed % 2) * 120;
      P.vy = 60;
      const room = G.room;
      const before = room.zones.length;
      HAZARDS[id].fire(G, room, rndOf(G));
      const made = room.zones.slice(before);
      assert.ok(made.length > 0, `${id}/${seed}: ни одной зоны`);
      for (const z of made) {
        assert.equal(z.from, 1, `${id}: зона бьёт лису`);
        assert.ok(z.total >= 0.8 - 1e-9, `${id}/${seed}: предупреждение ${z.total} с`);
        assert.ok(z.x >= 0 && z.y >= 0 && z.x <= room.w * T && z.y <= room.h * T, `${id}/${seed}: зона за комнатой`);
        assert.ok(Number.isFinite(z.x2) && Number.isFinite(z.y2) && Number.isFinite(z.r), `${id}: числа зоны`);
      }
      // лису ставим в середину первой зоны: пока она предупреждает — здоровье цело
      const z0 = made[0];
      const hp = P.hp;
      put(G, z0.x, z0.y);
      const quiet = Math.floor((z0.wait + z0.total - 0.1) * 60);
      runSteps(G, quiet, undefined, () => {
        put(G, z0.x, z0.y);
      });
      assert.equal(P.hp, hp, `${id}/${seed}: ударила без предупреждения`);
      assert.equal(findNaN(G), null);
    }
  }
});

test('напасти: движок выпускает их и они доходят до удара', () => {
  for (const id of ['moose', 'bear', 'geyser', 'icicles', 'rockfall', 'gunshot', 'lightning']) {
    const G = arena({ seed: 7 });
    G.god = true;
    HAZARDS[id].fire(G, G.room, rndOf(G));
    const seen = new Set();
    for (let i = 0; i < 6 * 60; i++) {
      step(G, { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 });
      for (const e of drain(G)) if (e.t === 'strike') seen.add(e.zone.uid);
      if (!G.room.zones.length) break;
    }
    assert.ok(seen.size > 0, `${id}: удара не было`);
    assert.equal(G.room.zones.length, 0, `${id}: зоны не убрались`);
  }
});

// Бой: хозяин один на один с лисой-ботом в режиме бога. Следим за каждой зоной и каждым выстрелом.
function fight(id, seed, { floor = 1, limit = 420, tank = 1, still = null, hpK = 1 } = {}) {
  const G = arena({ seed, floor });
  G.god = true;
  const room = G.room;
  const m = spawnMob(G, id, room.center.x + 3 * T, room.center.y, { warm: 0 });
  assert.ok(m, `${id}: не создался`);
  assert.equal(room.boss, m);
  m.hp *= tank;
  m.maxHp *= tank;
  m.hp *= hpK;
  const bot = still ? (g) => { put(g, still.x, still.y); return makeInput(); } : createBot({ doors: false });
  const seenZones = new Set();
  const seenShots = new Set();
  const warnAt = [];                    // когда показали сектор без урона
  const states = new Set();
  const phases = new Set();
  const problems = [];
  const hpMax = m.hp;
  for (let i = 0; i < limit * 60 && !m.dead; i++) {
    step(G, bot(G));
    G.events.length = 0;
    states.add(m.state);
    phases.add(m.data.ph);
    if (!POSES.has(m.act)) problems.push(`поза «${m.act}» (${m.state})`);
    if (m.hp > hpMax + 1e-9) problems.push('здоровье выросло');
    for (const z of room.zones) {
      if (seenZones.has(z.uid)) continue;
      seenZones.add(z.uid);
      if (z.from !== 1) continue;
      if (z.dmg === 0 && z.shape === 'cone') warnAt.push(G.time);
      const need = z.dmg >= 2 ? 0.8 : z.dmg >= 1 ? 0.5 : 0;
      if (z.total < need - 1e-9) problems.push(`зона ${z.shape} урон ${z.dmg} предупреждает ${z.total.toFixed(2)} с (${m.state})`);
    }
    for (const s of room.shots) {
      if (seenShots.has(s.uid)) continue;
      seenShots.add(s.uid);
      if (s.from !== 1 || s.ghost || !(s.dmg > 0)) continue;
      if (!warnAt.some((t) => G.time - t >= 0.5 - 1e-9 && G.time - t < 2)) problems.push(`выстрел без замаха (${m.state}, t=${m.t.toFixed(2)})`);
    }
    if (m.x < 0 || m.y < 0 || m.x > room.w * T || m.y > room.h * T) problems.push(`хозяин за комнатой (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) в ${m.state}`);
    if (i % 60 === 0) {
      const bad = findNaN(G);
      if (bad) problems.push(`не число: ${bad}`);
    }
    if (problems.length > 5) break;
  }
  return { G, m, states, phases, problems, time: G.time };
}

for (const id of BOSS_IDS) {
  test(`хозяин ${id}: бой в режиме бога доходит до смерти, без нарушений`, () => {
    for (const seed of [3, 11]) {
      const r = fight(id, seed);
      assert.deepEqual(r.problems, [], `${id}/${seed}`);
      assert.ok(r.m.dead, `${id}/${seed}: жив после ${r.time.toFixed(0)} с, hp ${r.m.hp.toFixed(0)}/${r.m.maxHp}, состояния: ${[...r.states]}`);
      assert.ok(r.phases.has(3), `${id}/${seed}: треть 3 не дошла (${[...r.phases]})`);
      assert.ok(r.states.size >= 4, `${id}/${seed}: приёмов мало: ${[...r.states]}`);
    }
  });
}

test('хозяин: на поздних локациях бой тоже идёт', () => {
  for (const id of BOSS_IDS) {
    const r = fight(id, 5, { floor: 6, limit: 600 });
    assert.deepEqual(r.problems, [], id);
    assert.ok(r.m.dead, `${id}: жив после ${r.time.toFixed(0)} с`);
  }
});

// Длинный бой: хозяин с запасом здоровья показывает все свои приёмы (по состояниям мысли), и все они честные.
const MOVES = {
  bear: ['walk', 'slam', 'aim', 'charge', 'roar', 'tired'],
  toad: ['sit', 'crouch', 'land', 'lick', 'spit', 'croak', 'tired'],
  moose: ['walk', 'aim', 'charge', 'turn', 'sweep', 'stomp', 'tired'],
  spiderqueen: ['walk', 'fan', 'web', 'climb', 'aloft', 'land', 'tired'],
  owl: ['hover', 'fan', 'stars', 'blink', 'eye', 'dive', 'down'],
};
for (const id of BOSS_IDS) {
  test(`хозяин ${id}: в долгом бою показывает все приёмы`, () => {
    // медведь с вплотную стоящей лисой почти не разбегается — для него лиса ждёт в дальнем углу
    const far = id === 'bear' ? { x: 2 * T, y: 7.5 * T } : null;
    const r = fight(id, 9, { tank: 12, limit: 900, still: far, hpK: far ? 0.2 : 1 });
    assert.deepEqual(r.problems, [], id);
    for (const s of MOVES[id]) if (id !== 'moose' || s !== 'stun') assert.ok(r.states.has(s), `${id}: ни разу не было «${s}» (были: ${[...r.states]})`);
    assert.ok(r.phases.has(3) && (far || r.phases.has(2)), `${id}: трети ${[...r.phases]}`);
  });
}
