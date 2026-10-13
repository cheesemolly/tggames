// Лисья охота: замер скорости расчёта (не тест — запускается руками: node games/fox-hunt/tests/bench.mjs).
// Комната «на пределе»: 40 зверей, 150 выстрелов, 20 красных зон, лиса бегает, делает рывки и стреляет.
// Печатает, сколько микросекунд занимает один шаг (на кадр их один, изредка два). Цель — меньше 300.

import { performance } from 'node:perf_hooks';
import { T, TAU, REG, rngFrom } from '../core.js';
import { addZone } from '../world.js';
import { fireShot } from '../combat.js';
import { spawnMob } from '../ai.js';
import { step, cheat } from '../logic.js';
import { arena, makeInput } from './helpers.js';

const MOBS = 40;
const SHOTS = 150;
const ZONES = 20;
const WARM = 4000;
const STEPS = 30000;

const G = arena({ tpl: 'forest-thicket', seed: 7 });
const room = G.room;
const r = rngFrom(99);
cheat.god(G, true);
cheat.give(G, 'pinecone');
// «глупый» преследователь — чтобы в куче были и те, кто идёт по полю путей
REG.MOBS['bench-chaser'] = { name: 'Бегун', kind: 'hostile', hp: 10, r: 9, pts: 1, touch: 1, wave: false, think(m, g, dt, ai) { ai.chase(m, g, 70); } };
REG.MOBS['bench-shooter'] = {
  name: 'Стрелок', kind: 'hostile', hp: 10, r: 9, pts: 1, touch: 0, wave: false,
  think(m, g, dt, ai) {
    ai.keepRange(m, g, 120, 200, 60);
    if (m.cd <= 0 && ai.los(m, g)) {
      m.cd = 1.5;
      ai.shoot(m, g, ai.angle(m, g), { speed: 160, r: 4, life: 2.5 });
    }
  },
};
const KINDS = ['hedgehog', 'boar', 'bench-chaser', 'bench-shooter', 'rabbit', 'hare'];

const W = room.w * T;
const Hh = room.h * T;
const spot = () => ({ x: r.range(T * 1.5, W - T * 1.5), y: r.range(T * 1.5, Hh - T * 1.5) });

function refill() {
  let alive = 0;
  for (const m of room.mobs) if (!m.dead) alive += 1;
  for (let i = alive; i < MOBS; i++) {
    const p = spot();
    const m = spawnMob(G, KINDS[i % KINDS.length], p.x, p.y, { warm: 0 });
    if (m && m.kind !== 0) m.hp = 1e9;                      // чтобы звери не кончались
  }
  for (let i = room.shots.length; i < SHOTS; i++) {
    const p = spot();
    fireShot(G, i % 3 === 0 ? 0 : 1, p.x, p.y, r.range(0, TAU), { speed: r.range(120, 320), r: 4, life: r.range(1, 3), bounce: i % 5 === 0 ? 2 : 0 }, 1);
  }
  for (let i = room.zones.length; i < ZONES; i++) {
    const p = spot();
    const k = i % 4;
    if (k === 0) addZone(G, { shape: 'circle', x: p.x, y: p.y, r: 50, t: r.range(0.6, 1.5), dmg: 1, hitsMobs: true, mobDmg: 1 });
    else if (k === 1) addZone(G, { shape: 'lane', x: T, y: p.y, x2: W - T, y2: p.y, w: 44, t: r.range(0.6, 1.5), dmg: 1, hitsMobs: true, mobDmg: 1, run: { speed: 520 } });
    else if (k === 2) addZone(G, { shape: 'cone', x: p.x, y: p.y, a: r.range(0, TAU), arc: 1.2, r: 110, t: r.range(0.6, 1.5), dmg: 1 });
    else addZone(G, { shape: 'ring', x: p.x, y: p.y, r: 70, w: 24, t: r.range(0.6, 1.5), dmg: 1, linger: 1, from: i % 8 === 3 ? 0 : 1 });
  }
}

const input = makeInput();
function drive(i) {
  input.mx = Math.cos(i / 90);
  input.my = Math.sin(i / 70);
  input.fire = true;
  input.dash = i % 40 === 0;
  input.dx = Math.cos(i * 1.3);
  input.dy = Math.sin(i * 1.3);
  input.dp = 1;
  G.player.mana = 100;
}

let mobsSum = 0;
let shotsSum = 0;
let zonesSum = 0;
function run(n, from, measure) {
  let spent = 0;
  for (let i = from; i < from + n; i++) {
    refill();
    drive(i);
    if (measure) {
      mobsSum += room.mobs.length;
      shotsSum += room.shots.length;
      zonesSum += room.zones.length;
    }
    const t0 = performance.now();
    step(G, input);
    spent += performance.now() - t0;
    G.events.length = 0;
  }
  return spent;
}

run(WARM, 0, false);
const ms = run(STEPS, WARM, true);
const us = (ms * 1000) / STEPS;
console.log(`шагов: ${STEPS}; в среднем зверей ${(mobsSum / STEPS).toFixed(1)}, выстрелов ${(shotsSum / STEPS).toFixed(1)}, зон ${(zonesSum / STEPS).toFixed(1)}`);
console.log(`один шаг: ${us.toFixed(1)} мкс (цель — меньше 300)`);
console.log(`за 60 шагов в секунду расчёт занимает ${((us * 60) / 10000).toFixed(2)} % времени`);
if (us >= 300) process.exitCode = 1;
