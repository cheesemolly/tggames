// Звери леса и болота (mobs.js): оса, ворон, жаба, гадюка, комар, гриб-споровик — данные, предупреждения, бой до гибели.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, REG, BIOMES } from '../core.js';
import '../content.js';
import { MOBS } from '../mobs.js';
import { spawnMob } from '../ai.js';
import { step } from '../logic.js';
import { arena, put, createBot, findNaN, makeInput } from './helpers.js';

const NEW = ['wasp', 'crow', 'frog', 'snake', 'mosquito', 'shroom'];
const SWARM = ['wasp', 'mosquito'];                       // бьют касанием после замаха, красных зон нет
const POSES = new Set(['idle', 'walk', 'move', 'spawn', 'windup', 'attack', 'recover', 'stun', 'hurt', 'fly', 'dive', 'hop']);

test('звери леса и болота: данные', () => {
  for (const id of NEW) {
    const d = MOBS[id];
    assert.ok(d, `${id}: описан`);
    assert.equal(REG.MOBS[id], d, `${id}: в реестре`);
    assert.equal(d.kind, 'hostile', id);
    assert.ok(d.name && BIOMES.includes(d.biome), `${id}: имя и место`);
    assert.ok(d.hp > 0 && d.r >= 4 && d.pts >= 1 && d.cost >= 1, `${id}: числа`);
    assert.ok(Array.isArray(d.coins) && d.coins[0] <= d.coins[1], `${id}: монеты`);
    assert.equal(typeof d.think, 'function', id);
    assert.equal(d.touch > 0, SWARM.includes(id), `${id}: касание`);
    if (d.pack) assert.ok(d.pack[0] <= d.pack[1], `${id}: стая`);
  }
  assert.deepEqual(NEW.filter((id) => MOBS[id].biome === 'swamp').sort(), ['frog', 'mosquito', 'shroom', 'snake']);
  assert.deepEqual(NEW.filter((id) => MOBS[id].biome === 'forest').sort(), ['crow', 'wasp']);
  for (const id of ['wasp', 'mosquito']) assert.equal(MOBS[id].hp, 1, `${id}: одно очко здоровья`);
  for (const id of ['wasp', 'crow', 'mosquito']) assert.equal(MOBS[id].flying, true, `${id}: летает`);
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
  // бот не делает рывок вплотную и может стоять на звере в углу; живой игрок отступил бы — отступаем и мы
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

for (const id of NEW) {
  test(`зверь ${id}: бой в режиме бога доходит до смерти, без нарушений`, () => {
    const n = MOBS[id].pack ? MOBS[id].pack[0] : 1;
    for (const seed of [3, 11]) {
      for (const elite of [false, true]) {
        const r = fight(id, seed, { elite, n });
        assert.deepEqual(r.problems, [], `${id}/${seed}/${elite}`);
        assert.ok(r.mobs.every((m) => m.dead), `${id}/${seed}/${elite}: живы после ${r.time.toFixed(0)} с, состояния: ${[...r.states]}`);
      }
    }
  });
}

test('зверь: поздние локации и вожак без сбоев', () => {
  for (const id of NEW) {
    const r = fight(id, 5, { floor: 9, limit: 120, elite: true });
    assert.deepEqual(r.problems, [], id);
  }
});

// Каждый удар виден заранее: зона не короче 0,5 с (у вожака 0,8 с), снаряд — только после зоны того же зверя,
// показанной не меньше 0,5 с назад. Рой бьёт касанием: перед броском он стоит в позе замаха не меньше этого времени.
for (const id of NEW) {
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
      const windup = new Map();                               // зверь → когда начал замах
      let harm = 0;
      const problems = [];
      for (let i = 0; i < 60 * 60 && problems.length < 5; i++) {
        put(G, G.room.center.x - 60 + Math.sin(i / 90) * 40, G.room.center.y + Math.cos(i / 70) * 50);
        step(G, makeInput());
        G.events.length = 0;
        for (const z of G.room.zones) {
          if (zones.has(z.uid) || z.from !== 1) continue;
          zones.set(z.uid, { at: G.time, owner: z.owner, total: z.total });
          if (z.dmg > 0) {
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
        if (SWARM.includes(id)) {
          for (const m of mobs) {
            if (m.state === 'windup' && !windup.has(m)) windup.set(m, G.time);
            else if (m.state === 'sting' && windup.has(m)) {
              harm += 1;
              if (G.time - windup.get(m) < need - 1e-9) problems.push(`бросок после замаха в ${(G.time - windup.get(m)).toFixed(2)} с`);
              windup.delete(m);
            } else if (m.state === 'flit') windup.delete(m);
          }
        }
      }
      assert.deepEqual(problems, [], id);
      assert.ok(harm > 0, `${id}: за минуту ни одного удара`);
      assert.equal(findNaN(G), null);
    });
  }
}

test('оса и комар кусают касанием, а гриб и ворон — нет', () => {
  for (const id of ['wasp', 'mosquito']) {
    const G = arena({ seed: 8, floor: 5 });
    const m = spawnMob(G, id, G.room.center.x + 30, G.room.center.y, { warm: 0 });
    const hearts = G.player.hp;
    for (let i = 0; i < 20 * 60 && G.player.hp === hearts; i++) {
      put(G, m.x - 4, m.y);
      step(G, makeInput());
      G.events.length = 0;
    }
    assert.ok(G.player.hp < hearts, `${id}: за 20 с не ранил лису, стоящую рядом`);
  }
  for (const id of ['crow', 'shroom', 'frog', 'snake']) {
    const G = arena({ seed: 8, floor: 5 });
    const m = spawnMob(G, id, G.room.center.x + 30, G.room.center.y, { warm: 0 });
    m.hp = m.maxHp = 1e6;
    const hearts = G.player.hp;
    // лиса стоит прямо на звере, но ни одного замаха не ждёт: пока зверь «думает», ранить его телом нельзя
    for (let i = 0; i < 20; i++) {
      put(G, m.x, m.y);
      step(G, makeInput());
      G.events.length = 0;
    }
    assert.equal(G.player.hp, hearts, `${id}: ранил касанием`);
  }
});

test('жаба прыгает и бьёт языком, гадюка плюёт, гриб выпускает кольцо из восьми', () => {
  const run = (id, until, floor = 5) => {
    const G = arena({ seed: 2, floor });
    G.god = true;
    const m = spawnMob(G, id, G.room.center.x + 120, G.room.center.y, { warm: 0 });
    m.hp = m.maxHp = 1e6;
    const seen = { states: new Set(), shots: 0, max: 0 };
    const known = new Set();
    for (let i = 0; i < 40 * 60; i++) {
      put(G, G.room.center.x - 40, G.room.center.y + Math.sin(i / 80) * 30);
      step(G, makeInput());
      G.events.length = 0;
      seen.states.add(m.state);
      let fresh = 0;
      for (const s of G.room.shots) {
        if (known.has(s.uid)) continue;
        known.add(s.uid);
        if (s.from === 1) fresh += 1;
      }
      seen.shots += fresh;
      seen.max = Math.max(seen.max, fresh);
    }
    until(seen);
  };
  run('frog', (s) => {
    assert.ok(s.states.has('hop'), 'не прыгала');
    assert.ok(s.states.has('lash'), 'не била языком');
  });
  run('snake', (s) => {
    assert.ok(s.states.has('spit'), 'не плевала');
    assert.ok(s.shots > 0);
  });
  run('shroom', (s) => {
    assert.ok(s.states.has('puff'), 'не выпускал споры');
    assert.equal(s.max, 8, 'кольцо — ровно восемь спор разом');
  });
});
