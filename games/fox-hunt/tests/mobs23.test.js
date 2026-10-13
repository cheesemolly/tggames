// Звери зимнего бора, пещер и осенней чащи (mobs2.js, mobs3.js): данные, предупреждения, бой с каждым до гибели.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, REG, BIOMES } from '../core.js';
import '../content.js';
import { MOBS2 } from '../mobs2.js';
import { MOBS3 } from '../mobs3.js';
import { spawnMob } from '../ai.js';
import { step } from '../logic.js';
import { startFight } from '../director.js';
import { arena, put, createBot, findNaN, makeInput } from './helpers.js';

const ALL = { ...MOBS2, ...MOBS3 };
const IDS = Object.keys(ALL);
const POSES = new Set(['idle', 'walk', 'move', 'spawn', 'windup', 'attack', 'recover', 'stun', 'hurt', 'dead', 'leap', 'rage', 'burrow', 'emerge', 'dig', 'dash', 'sleep', 'reveal']);

test('звери 2–3: данные', () => {
  assert.deepEqual(Object.keys(MOBS2).sort(), ['bat', 'beetle', 'lynx', 'mole', 'spider', 'wolf', 'wolverine']);
  assert.deepEqual(Object.keys(MOBS3).sort(), ['darkfox', 'hound', 'hunter', 'mimic', 'scarecrow']);
  for (const id of IDS) {
    const d = ALL[id];
    assert.equal(REG.MOBS[id], d, `${id}: в реестре`);
    assert.equal(d.kind, 'hostile', id);
    assert.ok(d.name && (id === 'mimic' || BIOMES.includes(d.biome)), `${id}: имя и место`);
    assert.ok(d.hp > 0 && d.r >= 5 && d.pts >= 1 && d.cost >= 1, `${id}: числа`);
    assert.equal(d.touch, 0, `${id}: телом не бьёт`);
    assert.ok(Array.isArray(d.coins) && d.coins[0] <= d.coins[1], `${id}: монеты`);
    assert.equal(typeof d.think, 'function', id);
    if (d.pack) assert.ok(d.pack[0] <= d.pack[1], `${id}: стая`);
  }
});

// Бой: зверь (стая) один на один с лисой-ботом в режиме бога. Следим за каждой зоной и каждым выстрелом.
function fight(id, seed, { floor = 5, limit = 90, elite = false, n = 1 } = {}) {
  const G = arena({ seed, floor });
  G.god = true;
  const room = G.room;
  const mobs = [];
  for (let i = 0; i < n; i++) {
    const m = spawnMob(G, id, room.center.x + (3 + i) * T, room.center.y + (i % 2 ? 1 : -1) * i * 12, { warm: 0, elite });
    assert.ok(m, `${id}: не создался`);
    mobs.push(m);
  }
  const base = createBot({ doors: false });
  // бот не делает рывок вплотную (ближе 4) и тогда может часами стоять на звере в углу; живой игрок отступил бы — отступаем и мы
  let hug = 0;
  const bot = (g) => {
    hug = mobs.some((m) => !m.dead && Math.hypot(m.x - g.player.x, m.y - g.player.y) < 8) ? hug + 1 : 0;
    if (hug > 90) {
      hug = 0;
      const t = mobs.find((m) => !m.dead);
      const a = Math.atan2(g.room.center.y - t.y, g.room.center.x - t.x);
      put(g, t.x + Math.cos(a) * 60, t.y + Math.sin(a) * 60);
    }
    return base(g);
  };
  const seenZones = new Set();
  const states = new Set();
  const problems = [];
  for (let i = 0; i < limit * 60 && mobs.some((m) => !m.dead); i++) {
    step(G, bot(G));
    G.events.length = 0;
    for (const m of mobs) {
      states.add(m.state);
      if (!m.dead && !POSES.has(m.act)) problems.push(`поза «${m.act}» (${m.state})`);
      if (m.x < 0 || m.y < 0 || m.x > room.w * T || m.y > room.h * T) problems.push(`${id} за комнатой (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) в ${m.state}`);
    }
    for (const z of room.zones) {
      if (seenZones.has(z.uid)) continue;
      seenZones.add(z.uid);
      if (z.from !== 1 || !(z.dmg > 0)) continue;
      const need = z.dmg >= 2 ? 0.8 : 0.5;
      if (z.total < need - 1e-9) problems.push(`зона ${z.shape} урон ${z.dmg} предупреждает ${z.total.toFixed(2)} с`);
    }
    if (i % 60 === 0) {
      const bad = findNaN(G);
      if (bad) problems.push(`не число: ${bad}`);
    }
    if (problems.length > 5) break;
  }
  return { G, mobs, states, problems, time: G.time };
}

for (const id of IDS) {
  if (id === 'mimic') continue;
  test(`зверь ${id}: бой в режиме бога доходит до смерти, без нарушений`, () => {
    const n = ALL[id].pack ? ALL[id].pack[0] : 1;
    for (const seed of [3, 11]) {
      for (const elite of [false, true]) {
        const r = fight(id, seed, { elite, n });
        assert.deepEqual(r.problems, [], `${id}/${seed}/${elite}`);
        assert.ok(r.mobs.every((m) => m.dead), `${id}/${seed}/${elite}: живы после ${r.time.toFixed(0)} с, состояния: ${[...r.states]}`);
      }
    }
  });
}

test('зверь mimic: спит, просыпается в бою, бьёт заметно и погибает', () => {
  for (const elite of [false, true]) {
    const G = arena({ seed: 4, floor: 5 });
    G.god = true;
    const m = spawnMob(G, 'mimic', G.room.center.x + 3 * T, G.room.center.y, { warm: 0, elite });
    assert.ok(m);
    assert.equal(m.act, 'sleep');
    const bot = createBot({ doors: false });
    for (let i = 0; i < 120; i++) step(G, bot(G));
    assert.equal(m.act, 'sleep', 'без боя спит');
    assert.ok(!m.dead);
    startFight(G);
    const seen = new Set();
    const problems = [];
    const states = new Set();
    for (let i = 0; i < 90 * 60 && !m.dead; i++) {
      step(G, bot(G));
      G.events.length = 0;
      states.add(m.state);
      for (const z of G.room.zones) {
        if (seen.has(z.uid) || z.from !== 1) continue;
        seen.add(z.uid);
        if (z.dmg > 0 && z.total < (elite ? 0.8 : 0.5) - 1e-9) problems.push(`зона ${z.shape} урон ${z.dmg}: ${z.total.toFixed(2)} с`);
      }
    }
    assert.deepEqual(problems, []);
    assert.ok(m.dead, `сундук жив, состояния: ${[...states]}`);
    assert.ok(states.has('reveal'));
  }
});

test('зверь: поздние локации и элита без сбоев', () => {
  for (const id of IDS) {
    if (id === 'mimic') continue;
    const r = fight(id, 5, { floor: 9, limit: 120, elite: true });
    assert.deepEqual(r.problems, [], id);
  }
});

// Каждый зверь бьёт, и каждый удар виден заранее: зона не короче 0,5 с (у вожака 0,8 с), выстрел — только после
// зоны того же зверя, показанной не меньше 0,5 с назад (или своей зоной у брошенного), а касание не ранит.
for (const id of IDS) {
  if (id === 'mimic') continue;
  for (const elite of [false, true]) {
    test(`зверь ${id}${elite ? ' (вожак)' : ''}: бьёт и всякий удар виден заранее`, () => {
      const G = arena({ seed: 5, floor: 6 });
      G.god = true;
      const mobs = [];
      for (let i = 0; i < 3; i++) {
        const m = spawnMob(G, id, G.room.center.x + 100 + i * 20, G.room.center.y + i * 30 - 30, { warm: 0, elite });
        m.hp = m.maxHp = 1e6;
        mobs.push(m);
      }
      const need = elite ? 0.8 : 0.5;
      const zones = new Map();                                // зона → когда показана
      const shots = new Set();
      let harm = 0;
      const problems = [];
      for (let i = 0; i < 60 * 60 && problems.length < 5; i++) {
        put(G, G.room.center.x - 60 + Math.sin(i / 90) * 40, G.room.center.y + Math.cos(i / 70) * 50);
        step(G, makeInput());
        G.events.length = 0;
        for (const z of G.room.zones) {
          if (zones.has(z.uid) || z.from !== 1) continue;
          zones.set(z.uid, { at: G.time, owner: z.owner, total: z.total });
          // жук бьёт самим разбегом: его красная полоса сама не ранит, но показывает, где он пронесётся
          if (z.dmg > 0 || id === 'beetle') {
            harm += 1;
            if (z.total < need - 1e-9) problems.push(`зона ${z.shape} урон ${z.dmg}: ${z.total.toFixed(2)} с`);
          }
        }
        for (const s of G.room.shots) {
          if (shots.has(s.uid)) continue;
          shots.add(s.uid);
          if (s.from !== 1 || s.ghost || !(s.dmg > 0)) continue;
          harm += 1;
          const shown = [...zones.values()].some((z) => z.owner === s.owner && z.total >= need - 1e-9 && G.time - z.at >= 0.5 - 1e-9 && G.time - z.at < 3);
          if (!shown) problems.push(`выстрел без показа, t=${G.time.toFixed(2)}`);
        }
      }
      assert.deepEqual(problems, [], id);
      assert.ok(harm > 0, `${id}: за минуту ни одного удара`);
      assert.equal(findNaN(G), null);
    });
  }
}
