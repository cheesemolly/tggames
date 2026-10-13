// Лисья охота, бой: каждый рисунок выстрела оружия, действия на зверей (огонь, яд, замедление, заморозка),
// удар и гибель зверя, выстрелы врагов и неуязвимость, красные зоны (сроки, бегущий лось, остаточный вред),
// взрывы, запас выстрелов.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H, T, TILE, CAPS, REG, TAU, tileX, tileY } from '../core.js';
import { BASE, STATUS, MOB, DROPS, POINTS, weaponDmg, mobHp, bossPts } from '../balance.js';
import { addZone, removeZone, addThing } from '../world.js';
import { recalc } from '../player.js';
import {
  HIT, hitOf, hurtMob, killMob, catchPrey, addScore, breakThing, fireShot, lobShot, clearShots, explode, stepShots, stepZones,
} from '../combat.js';
import { PATTERNS, weaponCost, fireWeapon } from '../patterns.js';
import { spawnMob, hireMinion, ACTS } from '../ai.js';
import { step, drain, cheat } from '../logic.js';
import { arena, dummy, put, makeInput, runSteps, runUntil, of, sounds } from './helpers.js';

BASE.crit = 0;                              // двойной урон проверяется отдельно — здесь числа должны быть точными

let seq = 0;
/** Пробное оружие с таким рисунком выстрела — сразу в лапы лисе. */
function gun(G, pattern, over = {}) {
  const id = `test-gun-${++seq}`;
  REG.WEAPONS[id] = {
    name: id, rarity: 0, drop: false, mana: 2, cd: 0.25, dmg: 3, range: 300, pattern,
    shot: { look: 'shot.orb', speed: 400, r: 5 }, sfx: 'shot', ...over,
  };
  G.inv.weapon = { id, lvl: 0 };
  return REG.WEAPONS[id];
}
/** Один выстрел в точку (tx, ty) и n шагов после него; возвращает события. */
function shootAt(G, tx, ty, n = 60) {
  const first = runSteps(G, 1, makeInput({ fire: true, hasT: true, tx, ty }));
  return first.concat(runSteps(G, n));
}
const mob = (id, def) => {
  REG.MOBS[id] = { name: id, kind: 'hostile', hp: 20, r: 10, pts: 1, touch: 0, wave: false, ...def };
  return id;
};

// ---------- рисунки выстрела ----------

test('bullet: один снаряд по прямой — попал, урон и мана списаны, снаряд пропал', () => {
  const G = arena();
  put(G, 200, 240);
  const w = gun(G, 'bullet');
  const m = dummy(G, 320, 240);
  const ev = shootAt(G, 320, 240);
  assert.equal(m.hp, 1000 - w.dmg);
  assert.equal(G.player.mana, 100 - w.mana);
  assert.equal(G.room.shots.length, 0);
  assert.deepEqual(of(ev, 'shot').map((e) => [e.look, e.x, e.y, e.a]), [['shot.orb', 200, 240, 0]]);
  assert.deepEqual(of(ev, 'hit').map((e) => [e.dmg, e.kind]), [[3, 'shot']]);
  assert.ok(sounds(ev).includes('shot') && sounds(ev).includes('hit'));
  // дальше дальности не летит
  const far = dummy(G, 200 + w.range + 40, 300);
  shootAt(G, far.x, far.y, 80);
  assert.equal(far.hp, 1000);
  assert.equal(G.room.shots.length, 0, 'снаряд кончился сам');
  // уровень оружия (кузница): +25 % за уровень
  G.inv.weapon.lvl = 2;
  shootAt(G, 320, 240);
  assert.equal(m.hp, 1000 - w.dmg - w.dmg * 1.5);
  assert.equal(weaponDmg(w, 2), 4.5);
});

test('spread: веер из n снарядов; burst: очередь из n подряд', () => {
  const G = arena();
  put(G, 200, 240);
  gun(G, 'spread', { shot: { look: 'shot.acorn', speed: 400, r: 5, n: 5, arc: 0.8 } });
  const m = dummy(G, 260, 240);
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  assert.equal(G.room.shots.length, 5);
  const angles = G.room.shots.map((s) => s.a).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[0] + 0.4) < 1e-9 && Math.abs(angles[4] - 0.4) < 1e-9 && Math.abs(angles[2]) < 1e-9);
  assert.equal(G.player.mana, 98, 'мана — за выстрел, а не за каждый снаряд');
  runSteps(G, 30);
  assert.ok(m.hp < 1000 && m.hp >= 1000 - 15);

  const B = arena();
  put(B, 200, 240);
  gun(B, 'burst', { cd: 1, shot: { look: 'shot.thorn', speed: 500, r: 4, n: 4, gap: 0.05 } });
  const d = dummy(B, 330, 240);
  const ev = runSteps(B, 1, makeInput({ fire: true, hasT: true, tx: 330, ty: 240 }));
  assert.equal(B.room.shots.length, 1);
  ev.push(...runSteps(B, 40));
  assert.equal(d.hp, 1000 - 4 * 3, 'все четыре долетели');
  assert.equal(B.player.mana, 98);
  assert.equal(sounds(ev).filter((s) => s === 'shot').length, 4);
  assert.equal(B.player.burst, 0);
});

test('pierce: сквозь нескольких; bounce: отскакивает от стен', () => {
  const G = arena();
  put(G, 200, 240);
  gun(G, 'pierce', { shot: { look: 'shot.arrow', speed: 500, r: 4, pierce: 2 } });
  const row = [dummy(G, 260, 240), dummy(G, 300, 240), dummy(G, 340, 240), dummy(G, 380, 240)];
  shootAt(G, 400, 240);
  assert.deepEqual(row.map((m) => 1000 - m.hp), [3, 3, 3, 0], 'сквозь двоих — в третьего, до четвёртого не дошёл');

  const B = arena();
  put(B, 300, 100);
  gun(B, 'bounce', { range: 900, shot: { look: 'shot.nut', speed: 500, r: 5, bounce: 2 } });
  // чучело стоит за спиной: достать можно только отскоком от верхней стены
  const m = dummy(B, 300, 200);
  shootAt(B, 300, 0, 80);
  assert.equal(m.hp, 1000 - 3);
  // без отскоков снаряд гаснет о стену
  gun(B, 'bullet', { range: 900 });
  shootAt(B, 300, 0, 80);
  assert.equal(m.hp, 1000 - 3);
});

test('boomerang: летит на дальность и возвращается к лисе, задевая и туда, и обратно', () => {
  const G = arena();
  put(G, 200, 240);
  gun(G, 'boomerang', { range: 180, shot: { look: 'shot.boomerang', speed: 360, r: 7 } });
  const m = dummy(G, 300, 240);
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  const s = G.room.shots[0];
  assert.equal(s.mode, 1);
  let far = 0;
  runUntil(G, (g) => g.room.shots.length === 0, { seconds: 4, each: () => { far = Math.max(far, s.x); } });
  assert.equal(G.room.shots.length, 0, 'вернулся к лисе и пропал');
  assert.ok(far > 360 && far < 400, `долетел до ${far}`);
  assert.equal(m.hp, 1000 - 6, 'задел дважды');
  // стена на пути туда — поворачивает назад раньше
  const W = arena();
  put(W, 80, 240);
  gun(W, 'boomerang', { range: 300, shot: { look: 'shot.boomerang', speed: 360, r: 7 } });
  runSteps(W, 1, makeInput({ fire: true, hasT: true, tx: 0, ty: 240 }));
  runUntil(W, (g) => g.room.shots.length === 0, { seconds: 4 });
  assert.equal(W.room.shots.length, 0);
});

test('homing: снаряд доворачивает к врагу', () => {
  const G = arena();
  put(G, 200, 240);
  gun(G, 'homing', { range: 500, shot: { look: 'shot.wasp', speed: 220, r: 5, homing: 6, n: 3 } });
  const m = dummy(G, 380, 330);
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  assert.equal(G.room.shots.length, 3);
  runSteps(G, 150);
  assert.equal(m.hp, 1000 - 9, 'все три нашли цель в стороне от прицела');
  // без наведения тот же выстрел проходит мимо
  gun(G, 'bullet', { range: 500 });
  shootAt(G, 400, 240, 150);
  assert.equal(m.hp, 1000 - 9);
});

test('lob: навесом через дерево, взрыв задевает всех рядом; cloud: после взрыва остаётся облако; rain: несколько бросков', () => {
  const G = arena({ tpl: 'forest-thicket' });
  put(G, tileX(9), tileY(3));
  assert.equal(G.room.tiles[3 * G.room.w + 11], TILE.TALL);
  gun(G, 'lob', { cd: 2, dmg: 5, range: 260, shot: { look: 'shot.spore', speed: 300, radius: 44, arc: 40 } });
  const a = dummy(G, tileX(14), tileY(3));
  const b = dummy(G, tileX(14) + 30, tileY(3) + 20);
  const c = dummy(G, tileX(14) + 90, tileY(3));
  const ev = shootAt(G, a.x, a.y, 90);
  assert.deepEqual([a, b, c].map((m) => 1000 - m.hp), [5, 5, 0], 'взрыв задел двоих за деревом');
  assert.deepEqual(of(ev, 'boom').map((e) => [e.x, e.y, e.r]), [[a.x, a.y, 44]]);
  assert.ok(sounds(ev).includes('boom'));
  // обычная пуля туда не долетает — дерево
  gun(G, 'bullet');
  shootAt(G, a.x, a.y, 60);
  assert.equal(a.hp, 995);
  // в полёте снаряд поднимается по дуге
  gun(G, 'lob', { shot: { look: 'shot.spore', speed: 300, radius: 30, arc: 40 } });
  G.player.wcd = 0;
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: a.x, ty: a.y }));
  let top = 0;
  runUntil(G, (g) => g.room.shots.length === 0, { seconds: 2, each: (g) => { top = Math.max(top, g.room.shots[0]?.z ?? 0); } });
  assert.ok(top > 40 && top < 60, `высота дуги ${top}`);
  // цель дальше дальности — падает на пределе дальности
  const far = arena();
  put(far, 100, 240);
  gun(far, 'lob', { range: 150, shot: { look: 'shot.spore', speed: 300, radius: 30 } });
  const fev = shootAt(far, 600, 240, 80);
  assert.ok(Math.abs(of(fev, 'boom')[0].x - 250) < 1e-6);

  const C = arena();
  put(C, 200, 240);
  gun(C, 'cloud', { dmg: 1, shot: { look: 'shot.spore', speed: 300, radius: 40, linger: 3, poison: 2, zoneLook: 'poison', zoneDmg: 0 } });
  const m = dummy(C, 360, 240);
  shootAt(C, 360, 240, 60);
  const zone = C.room.zones.find((z) => z.from === 0);
  assert.ok(zone && zone.look === 'poison' && zone.phase === 1, 'облако висит');
  runSteps(C, 120);
  assert.ok(m.pstacks >= 2 && m.hp < 999, 'и травит');
  runSteps(C, 120);
  assert.equal(C.room.zones.length, 0, 'потом рассеивается');

  const R = arena();
  put(R, 200, 240);
  gun(R, 'rain', { dmg: 4, shot: { look: 'shot.star', speed: 300, radius: 34, n: 6, spread: 60 } });
  const t = dummy(R, 400, 240);
  runSteps(R, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  assert.equal(R.room.shots.length, 6);
  const rev = runSteps(R, 150);
  assert.equal(of(rev, 'boom').length, 6);
  assert.ok(t.hp <= 1000 - 4, 'первый бросок — точно в цель');
  assert.equal(R.player.mana, 98);
});

test('beam: непрерывный луч — урон и мана в секунду', () => {
  const G = arena();
  put(G, 200, 240);
  const w = gun(G, 'beam', { dmg: 12, mana: 10, cd: 0.05, range: 200, shot: { look: 'shot.orb', v: 4, speed: 1500, r: 5 } });
  const near = dummy(G, 280, 240);
  const behind = dummy(G, 360, 240);
  const tooFar = dummy(G, 480, 240);
  runSteps(G, 120, makeInput({ fire: true, hasT: true, tx: 600, ty: 240 }));
  runSteps(G, 10);
  assert.ok(Math.abs(1000 - near.hp - 24) < 2.5, `урон за 2 с: ${1000 - near.hp}`);
  assert.ok(Math.abs(near.hp - behind.hp) < 1, 'луч проходит сквозь первого');
  assert.equal(tooFar.hp, 1000, 'дальше своей дальности не бьёт');
  assert.ok(Math.abs(100 - G.player.mana - 20) < 1.5, `маны за 2 с: ${100 - G.player.mana}`);
  assert.ok(Math.abs(weaponCost(w) - 0.5) < 1e-9);
});

test('chain: молния перескакивает на соседних врагов', () => {
  const G = arena();
  put(G, 200, 240);
  gun(G, 'chain', { dmg: 4, shot: { look: 'shot.orb', v: 4, speed: 600, r: 5, chain: 3, chainR: 100 } });
  const a = dummy(G, 300, 240);
  const b = dummy(G, 350, 300);
  const c = dummy(G, 300, 360);
  const d = dummy(G, 240, 400);
  const lone = dummy(G, 600, 120);
  shootAt(G, 300, 240, 90);
  assert.deepEqual([a, b, c, d, lone].map((m) => 1000 - m.hp), [4, 4, 4, 4, 0], 'цепочка из четырёх, дальний не задет');
  assert.equal(G.room.shots.length, 0);
});

test('cone: удар по дуге перед собой — сразу, без снаряда; ломает кусты', () => {
  const G = arena({ tpl: 'forest-glade' });
  const room = G.room;
  const bi = room.tiles.indexOf(TILE.BUSH);
  const bx = tileX(bi % room.w);
  const by = tileY(Math.floor(bi / room.w));
  put(G, bx - 38, by);
  const w = gun(G, 'cone', { mana: 0, dmg: 3, range: 46, shot: { look: 'fx.slash', arc: 1.6, kb: 150 } });
  const front = dummy(G, bx - 38 + 30, by - 14);
  const back = dummy(G, bx - 38 - 30, by);
  const side = dummy(G, bx - 38, by + 34);
  const ev = runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: bx, ty: by }));
  assert.deepEqual([front, back, side].map((m) => 1000 - m.hp), [3, 0, 0], 'бьёт только перед собой — и в тот же шаг');
  assert.ok(front.kbx > 0, 'отбрасывает');
  assert.equal(room.tiles[bi], TILE.FLOOR, 'куст снесён');
  assert.equal(G.room.shots.length, 0);
  assert.equal(of(ev, 'shot')[0].look, 'fx.slash');
  assert.equal(G.player.mana, 100, 'когти маны не просят');
  assert.equal(weaponCost(w), 0);
});

test('nova: снаряды во все стороны; wave: широкая волна сквозь стены и всех; ray: мгновенный луч до стены', () => {
  const G = arena();
  put(G, 400, 240);
  gun(G, 'nova', { shot: { look: 'shot.thorn', speed: 400, r: 6, n: 12 } });
  const ring = [];
  for (let i = 0; i < 6; i++) ring.push(dummy(G, 400 + Math.cos((i * TAU) / 6) * 70, 240 + Math.sin((i * TAU) / 6) * 70));
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: 500, ty: 240 }));
  assert.equal(G.room.shots.length, 12);
  runSteps(G, 30);
  assert.ok(ring.every((m) => m.hp < 1000), 'задеты все вокруг');

  const W = arena({ tpl: 'forest-thicket' });
  put(W, tileX(9), tileY(3));
  gun(W, 'wave', { dmg: 5, range: 260, shot: { look: 'shot.wave', speed: 320 } });
  const a = dummy(W, tileX(13), tileY(3) + 16);
  const b = dummy(W, tileX(15), tileY(3) - 14);
  runSteps(W, 1, makeInput({ fire: true, hasT: true, tx: tileX(15), ty: tileY(3) }));
  assert.equal(W.room.shots[0].r, 22, 'волна широкая');
  runSteps(W, 70);
  assert.deepEqual([a, b].map((m) => 1000 - m.hp), [5, 5], 'прошла сквозь дерево и обоих');

  const R = arena({ tpl: 'forest-thicket' });
  put(R, tileX(5), tileY(7));
  gun(R, 'ray', { dmg: 7, range: 600, shot: { look: 'shot.orb', v: 4, width: 12 } });
  const row = [dummy(R, tileX(7), tileY(7)), dummy(R, tileX(10), tileY(7) + 12), dummy(R, tileX(16), tileY(7))];
  const off = dummy(R, tileX(8), tileY(7) + 40);
  runSteps(R, 1, makeInput({ fire: true, hasT: true, tx: tileX(20), ty: tileY(7) }));
  assert.deepEqual(row.map((m) => 1000 - m.hp), [7, 7, 7], 'все на линии — в тот же шаг');
  assert.equal(off.hp, 1000);
  assert.ok(R.room.shots.length === 1 && R.room.shots[0].ghost, 'сам луч — только видимость');
  runSteps(R, 30);
  assert.equal(R.room.shots.length, 0);
  // дерево луч останавливает
  const T2 = arena({ tpl: 'forest-thicket' });
  put(T2, tileX(9), tileY(3));
  gun(T2, 'ray', { dmg: 7, range: 600, shot: { look: 'shot.orb', v: 4 } });
  const hidden = dummy(T2, tileX(14), tileY(3));
  runSteps(T2, 1, makeInput({ fire: true, hasT: true, tx: tileX(14), ty: tileY(3) }));
  assert.equal(hidden.hp, 1000);
});

test('trap: капкан лежит и ждёт врага; больше трёх разом не бывает', () => {
  mob('test-walker', { hp: 50, think(m, G, dt, ai) { ai.move(m, Math.PI, 60); } });
  const G = arena();
  put(G, 300, 240);
  gun(G, 'trap', { dmg: 6, cd: 0.2, shot: { look: 'shot.trap', radius: 36, stun: 1.5, max: 3 } });
  runSteps(G, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  const trap = G.room.shots[0];
  assert.deepEqual([trap.mode, trap.vx, trap.vy], [3, 0, 0]);
  assert.ok(Math.abs(trap.x - 316) < 1e-9, 'лёг перед лисой');
  const m = spawnMob(G, 'test-walker', 430, 240, { warm: 0 });
  const ev = runUntil(G, (g) => g.room.shots.length === 0, { seconds: 4 });
  assert.equal(m.hp, 50 - 6);
  assert.ok(m.stun > 0, 'капкан оглушил');
  assert.ok(sounds(ev).includes('trap'));
  assert.ok(Math.abs(m.x - trap.x) < 30, 'сработал под зверем');
  // только что положенный ещё не взведён
  const A = arena();
  put(A, 300, 240);
  gun(A, 'trap', { dmg: 6, shot: { look: 'shot.trap' } });
  const near = dummy(A, 318, 240);
  runSteps(A, 1, makeInput({ fire: true, hasT: true, tx: 400, ty: 240 }));
  runSteps(A, 20);
  assert.equal(near.hp, 1000);
  runSteps(A, 20);
  assert.equal(near.hp, 994);
  // четвёртый вытесняет самый старый
  const M = arena();
  put(M, 300, 240);
  gun(M, 'trap', { cd: 0.1, shot: { look: 'shot.trap', max: 3 } });
  for (let i = 0; i < 5; i++) {
    put(M, 200 + i * 60, 240);
    runSteps(M, 1, makeInput({ fire: true, hasT: true, tx: 900, ty: 240 }));
    runSteps(M, 8);
  }
  assert.equal(M.room.shots.filter((s) => s.mode === 3).length, 3);
});

test('оружие со своей функцией fire; неизвестный рисунок не стреляет и ману не берёт', () => {
  const G = arena();
  put(G, 200, 240);
  const calls = [];
  gun(G, undefined, {
    mana: 5,
    fire(g, w, lvl, x, y, ang, tx, ty) {
      calls.push([lvl, x, y, ang, tx, ty]);
      if (calls.length > 1) return false;
      fireShot(g, 0, x, y, ang, w.shot, 9);
      return true;
    },
  });
  G.inv.weapon.lvl = 2;
  const m = dummy(G, 300, 240);
  shootAt(G, 300, 240, 40);
  assert.deepEqual(calls[0], [2, 200, 240, 0, 300, 240]);
  assert.equal(m.hp, 991);
  assert.equal(G.player.mana, 95);
  shootAt(G, 300, 240, 40);
  assert.equal(calls.length > 1, true);
  assert.equal(G.player.mana, 95, 'fire вернула false — выстрела не было');
  gun(G, 'нет такого');
  shootAt(G, 300, 240, 10);
  assert.equal(G.player.mana, 95);
  assert.equal(fireWeapon(G, { id: 'нет такого оружия' }, 0, 0, 0), false);
  assert.deepEqual(Object.keys(PATTERNS).sort(), ['beam', 'boomerang', 'bounce', 'bullet', 'burst', 'chain', 'cloud', 'cone', 'homing', 'lob', 'nova', 'pierce', 'rain', 'ray', 'spread', 'trap', 'wave']);
});

// ---------- действия на зверей ----------

test('огонь: 1,5 урона в секунду, пока горит', () => {
  const G = arena();
  const m = dummy(G, 400, 240);
  const hit = hitOf('shot');
  hit.burn = 2;
  hurtMob(G, m, 0, hit);
  assert.equal(m.hp, 1000, 'нулевой удар только поджигает');
  assert.equal(m.burn, 2);
  const ev = runSteps(G, 150);
  assert.ok(Math.abs(1000 - m.hp - STATUS.burnDps * 2) < 0.8, `сгорело ${1000 - m.hp}`);
  assert.ok(m.burn <= 0);
  assert.ok(of(ev, 'hit').every((e) => e.kind === 'burn'));
  assert.ok(!sounds(ev).includes('hit'), 'тление не стучит по ушам');
  const hp = m.hp;
  runSteps(G, 60);
  assert.equal(m.hp, hp, 'погас');
});

test('яд: стопки до пяти, 0,5 урона в секунду за стопку, четыре секунды', () => {
  const G = arena();
  const m = dummy(G, 400, 240);
  const poison = (n) => {
    const hit = hitOf('shot');
    hit.poison = n;
    hurtMob(G, m, 0, hit);
  };
  poison(2);
  assert.deepEqual([m.pstacks, m.poison], [2, STATUS.poisonTime]);
  runSteps(G, 60);
  assert.ok(Math.abs(1000 - m.hp - 1) < 0.3, `за секунду от двух стопок: ${1000 - m.hp}`);
  poison(9);
  assert.equal(m.pstacks, STATUS.poisonMax);
  assert.equal(m.poison, STATUS.poisonTime, 'новая стопка продлевает яд');
  const hp = m.hp;
  runSteps(G, 60 * 5);
  assert.ok(Math.abs(hp - m.hp - STATUS.poisonMax * STATUS.poisonDps * STATUS.poisonTime) < 1.5, `пять стопок за 4 с: ${hp - m.hp}`);
  assert.equal(m.pstacks, 0, 'яд вышел');
});

test('замедление вдвое; заморозка и оглушение — зверь не думает; на хозяина они не действуют (только замедление)', () => {
  let thoughts = 0;
  mob('test-runner', { think(m, G, dt, ai) { thoughts += 1; ai.move(m, 0, 100); } });
  mob('test-lord', { kind: 'boss', hp: 100, r: 14, think(m, G, dt, ai) { ai.move(m, 0, 100); } });
  const G = arena();
  put(G, 100, 100);
  const m = spawnMob(G, 'test-runner', 200, 300, { warm: 0 });
  runSteps(G, 60);
  assert.ok(Math.abs(m.vx - 100) < 0.5);
  assert.equal(m.act, 'move');
  let hit = hitOf('shot');
  hit.slow = 1;
  hurtMob(G, m, 0, hit);
  runSteps(G, 40);
  assert.ok(Math.abs(m.vx - 100 * STATUS.slow) < 0.5, `замедлен: ${m.vx}`);
  runSteps(G, 60);
  assert.ok(Math.abs(m.vx - 100) < 0.5, 'замедление прошло');
  hit = hitOf('shot');
  hit.freeze = 0.5;
  hurtMob(G, m, 0, hit);
  const before = thoughts;
  runSteps(G, 25);
  assert.equal(thoughts, before, 'замороженный не думает');
  assert.equal(m.act, 'stun');
  assert.ok(Math.abs(m.vx) < 5, 'и стоит');
  runSteps(G, 30);
  assert.ok(thoughts > before && m.act === 'move');
  hit = hitOf('shot');
  hit.stun = 0.3;
  hurtMob(G, m, 0, hit);
  assert.equal(m.stun, 0.3);

  const lord = spawnMob(G, 'test-lord', 300, 150, { warm: 0 });
  hit = hitOf('shot');
  hit.freeze = 2;
  hurtMob(G, lord, 0, hit);
  assert.deepEqual([lord.freeze, lord.stun, lord.slow], [0, 0, 2]);
  hit = hitOf('shot');
  hit.stun = 3;
  hurtMob(G, lord, 0, hit);
  assert.deepEqual([lord.freeze, lord.stun, lord.slow], [0, 0, 3]);
});

// ---------- удар и гибель ----------

test('hurtMob: двойной урон, отбрасывание по массе, отмена удара описанием зверя, событие', () => {
  const seen = [];
  mob('test-armor', { hp: 20, mass: 4, onHurt(m, G, hit) { seen.push(hit.kind); return hit.kind !== 'shot'; } });
  const G = arena();
  const m = spawnMob(G, 'test-armor', 300, 240, { warm: 0 });
  assert.equal(hurtMob(G, m, 5, hitOf('shot')), false, 'панцирь отбил выстрел');
  assert.equal(m.hp, 20);
  const hit = hitOf('dash');
  hit.crit = true;
  hit.kx = 200;
  assert.equal(hurtMob(G, m, 5, hit), true);
  assert.equal(m.hp, 10, 'двойной урон');
  assert.equal(m.kbx, 50, 'тяжёлого отбрасывает слабее');
  assert.ok(m.flash > 0);
  assert.deepEqual(seen, ['shot', 'dash']);
  const ev = drain(G);
  assert.deepEqual(of(ev, 'hit').map((e) => [e.x, e.y, e.dmg, e.crit, e.kind]), [[300, 240, 10, true, 'dash']]);
  assert.ok(sounds(ev).includes('crit'));
  // без описания попадания — тоже удар
  assert.equal(hurtMob(G, m, 1), true);
  assert.equal(m.hp, 9);
  assert.equal(hitOf('zone'), HIT);
  assert.deepEqual({ ...HIT }, { kind: 'zone', crit: false, kx: 0, ky: 0, ax: 0, ay: 0, burn: 0, poison: 0, slow: 0, freeze: 0, stun: 0 });
  // зверь знает, откуда прилетело: панцирь спереди держит, сзади — нет
  const dirs = [];
  mob('test-shell', { hp: 50, onHurt(b, g, hit) { dirs.push([hit.kind, Math.round(hit.ax), Math.round(hit.ay)]); return hit.ax > 0; } });
  const A = arena();
  put(A, 200, 240);
  const shell = spawnMob(A, 'test-shell', 300, 240, { warm: 0 });
  fireShot(A, 0, 250, 240, 0, { speed: 400, r: 4, life: 1 }, 2);
  runSteps(A, 12);
  fireShot(A, 0, 350, 240, Math.PI, { speed: 400, r: 4, life: 1 }, 2);
  runSteps(A, 12);
  explode(A, 300, 280, 60, 1, 0);
  runSteps(A, 1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  runSteps(A, 12);
  assert.deepEqual(dirs, [['shot', 1, 0], ['shot', -1, 0], ['shot', 0, -1], ['dash', 1, 0]]);
  assert.equal(shell.hp, 50 - 2 - BASE.dashDmg, 'прошли только удары «слева направо»');
  // отброшенный зверь проезжает и останавливается
  const light = dummy(G, 400, 300);
  const push = hitOf('dash');
  push.kx = 240;
  hurtMob(G, light, 1, push);
  runSteps(G, 60);
  assert.ok(light.x > 415 && light.x < 440, `отъехал на ${light.x - 400}`);
  assert.equal(light.kbx, 0);
});

test('гибель зверя: очки (вожаку — вдвое), счётчики, монеты, обработчик onDie, событие; зверь убирается', () => {
  const died = [];
  mob('test-prey-of-fox', { hp: 3, pts: 3, coins: [2, 2], onDie(m) { died.push(m.uid); } });
  const G = arena({ seed: 3 });
  put(G, 100, 100);
  const m = spawnMob(G, 'test-prey-of-fox', 400, 240, { warm: 0 });
  const elite = spawnMob(G, 'test-prey-of-fox', 500, 240, { warm: 0, elite: true });
  assert.equal(elite.elite, true);
  assert.equal(elite.maxHp, mobHp(3, 1, true));
  assert.ok(Math.abs(elite.r - 10 * MOB.eliteSize) < 1e-9);
  hurtMob(G, m, 3, hitOf('shot'));
  assert.ok(m.dead);
  assert.equal(G.score, 3);
  assert.deepEqual([G.cnt.kills, G.player.kills], [1, 1]);
  assert.deepEqual(died, [m.uid]);
  let ev = drain(G);
  assert.deepEqual(of(ev, 'die').map((e) => [e.x, e.y, e.id, e.elite]), [[400, 240, 'test-prey-of-fox', false]]);
  assert.deepEqual(of(ev, 'score').map((e) => e.n), [3]);
  assert.ok(sounds(ev).includes('kill'));
  assert.equal(G.room.picks.filter((p) => p.kind === 'coin').reduce((s, p) => s + p.v, 0), 2);
  hurtMob(G, elite, 999, hitOf('shot'));
  assert.equal(G.score, 3 + 3 * MOB.elitePts);
  ev = drain(G);
  assert.equal(of(ev, 'die')[0].elite, true);
  assert.ok(G.room.picks.some((p) => p.kind === 'mana'), 'из вожака всегда падает мана');
  assert.equal(G.room.picks.filter((p) => p.kind === 'coin').reduce((s, p) => s + p.v, 0), 2 + 4, 'и вдвое больше монет');
  killMob(G, m);
  assert.equal(G.cnt.kills, 2, 'дважды не гибнут');
  assert.equal(G.room.mobs.length, 2);
  runSteps(G, 1);
  assert.equal(G.room.mobs.length, 0, 'погибшие убраны на шаге зверей');
  // здоровье растёт с локацией
  assert.equal(mobHp(10, 1, false), 10);
  assert.equal(mobHp(10, 6, false), 21);
  const deep = arena({ floor: 6 });
  assert.equal(spawnMob(deep, 'test-prey-of-fox', 300, 200).maxHp, mobHp(3, 6, false));
});

test('зверь в метке появления и спрятавшийся неуязвимы и безвредны', () => {
  mob('test-biter2', { hp: 10, touch: 1 });
  const G = arena();
  put(G, 300, 240);
  const m = spawnMob(G, 'test-biter2', 306, 240);
  assert.ok(Math.abs(m.inv - MOB.warm) < 1e-9);
  assert.equal(m.act, 'spawn');
  const ev = drain(G);
  assert.deepEqual(of(ev, 'spawn').map((e) => [e.x, e.y, e.id]), [[306, 240, 'test-biter2']]);
  assert.equal(hurtMob(G, m, 5, hitOf('shot')), false);
  let k = -1;
  runSteps(G, 30, makeInput(), () => {
    assert.ok(m.k >= k && m.k <= 1, 'метка «наливается»');
    k = m.k;
  });
  assert.equal(G.player.hp, BASE.maxHp, 'пока проявляется — не кусает');
  assert.equal(m.hp, 10);
  const later = runSteps(G, 20);
  assert.ok(sounds(later).includes('spawn'));
  assert.equal(G.player.hp, BASE.maxHp - 1, 'проявился — укусил');
  m.hide = true;
  G.player.inv = 0;
  runSteps(G, 10);
  assert.equal(G.player.hp, BASE.maxHp - 1, 'спрятавшийся не кусает');
  assert.equal(hurtMob(G, m, 5, hitOf('shot')), false, 'и его не задеть');
  explode(G, m.x, m.y, 60, 5, 0);
  assert.equal(m.hp, 10);
});

test('добыча: любое попадание — поймана; очки, монеты и ягода из толстяка', () => {
  const G = arena({ seed: 9 });
  put(G, 100, 100);
  const r = spawnMob(G, 'rabbit', 400, 240);
  hurtMob(G, r, 1, hitOf('shot'));
  assert.ok(r.dead);
  assert.equal(G.score, 1);
  assert.equal(G.cnt.rabbits, 1);
  assert.equal(G.cnt.kills, 0, 'добыча — не «убитый враг»');
  const fat = spawnMob(G, 'fat', 400, 300);
  const gold = spawnMob(G, 'gold', 500, 300);
  const hare = spawnMob(G, 'hare', 500, 200);
  catchPrey(G, fat, 0);
  catchPrey(G, gold, 0);
  catchPrey(G, hare, 0);
  catchPrey(G, hare, 0);
  assert.equal(G.score, 1 + 1 + 5 + 2);
  assert.ok(G.room.picks.some((p) => p.kind === 'berry'), 'из толстяка — ягода');
  assert.ok(G.room.picks.filter((p) => p.kind === 'coin').reduce((s, p) => s + p.v, 0) >= 10, 'из золотого — десять монет');
  const ev = drain(G);
  assert.deepEqual(of(ev, 'catch').map((e) => e.id), ['rabbit', 'fat', 'gold', 'hare']);
  assert.equal(POINTS.chain, 1);
  addScore(G, 0, 1, 1);
  addScore(G, -5, 1, 1);
  assert.equal(G.score, 9, 'пустые очки не считаются');
  for (const id of ['rabbit', 'hare', 'gold', 'fat']) assert.equal(REG.MOBS[id].kind, 'prey');
  assert.deepEqual(['rabbit', 'hare', 'gold', 'fat'].map((id) => REG.MOBS[id].pts), [1, 2, 5, 1]);
});

test('добыча из убитых: с удачей вещей и сердец больше; из хозяина — только монеты', () => {
  mob('test-loot', { hp: 1, pts: 1 });
  mob('test-king', { kind: 'boss', hp: 1, pts: 30, coins: [5, 5] });
  const count = (elite, n = 600) => {
    const G = arena({ seed: 21 });
    const got = { heart: 0, mana: 0, item: 0 };
    for (let i = 0; i < n; i++) {
      const m = spawnMob(G, 'test-loot', 300, 240, { warm: 0, elite });
      hurtMob(G, m, 99, hitOf('shot'));
      for (const p of G.room.picks) got[p.kind] += 1;
      G.room.picks.length = 0;
      G.room.mobs.length = 0;
    }
    return got;
  };
  const plain = count(false);
  assert.ok(Math.abs(plain.mana / 600 - DROPS.mana) < 0.06, `мана из обычных: ${plain.mana}`);
  assert.ok(plain.item < 25, `вещей из обычных: ${plain.item}`);
  const elite = count(true);
  assert.ok(elite.mana >= 600 && elite.item > 120 && elite.heart > 70, JSON.stringify(elite));
  const G = arena();
  const king = spawnMob(G, 'test-king', 300, 240, { warm: 0 });
  hurtMob(G, king, 99, hitOf('shot'));
  assert.ok(G.room.picks.every((p) => p.kind === 'coin'));
  assert.equal(G.score, bossPts(REG.MOBS['test-king'], 0));
  assert.equal(bossPts({ pts: 30 }, 2), 50, '+10 очков за каждый пройденный круг');
});

// ---------- выстрелы ----------

test('вражеский выстрел: ранит лису и пропадает; неуязвимую — пролетает насквозь; гаснет о дерево, но не о воду', () => {
  const G = arena();
  const P = G.player;
  put(G, 300, 240);
  fireShot(G, 1, 200, 240, 0, { speed: 300, r: 5, life: 3 }, 1);
  let ev = runSteps(G, 30);
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.equal(G.room.shots.length, 0);
  assert.deepEqual(of(ev, 'hurt').map((e) => e.kind), ['shot']);
  // неуязвима — насквозь
  fireShot(G, 1, 200, 240, 0, { speed: 300, r: 5, life: 3 }, 1);
  runSteps(G, 30);
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.equal(G.room.shots.length, 1, 'снаряд летит дальше');
  runSteps(G, 120);
  assert.equal(G.room.shots.length, 0, 'до стены');
  // снаряд с замедлением
  P.inv = 0;
  fireShot(G, 1, 250, 240, 0, { speed: 300, r: 5, life: 3, slow: 2 }, 1);
  runSteps(G, 15);
  assert.ok(P.fx.slow > 1.5);
  // о дерево гаснет, над водой и пнём летит
  const W = arena({ tpl: 'forest-pond' });
  put(W, tileX(15), tileY(6));
  fireShot(W, 1, tileX(6), tileY(6), 0, { speed: 400, r: 5, life: 3 }, 1);
  runSteps(W, 60);
  assert.equal(W.player.hp, BASE.maxHp - 1, 'через пруд долетел');
  const ti = W.room.tiles.indexOf(TILE.TALL);
  put(W, tileX((ti % W.room.w) + 2), tileY(Math.floor(ti / W.room.w)));
  W.player.inv = 0;
  fireShot(W, 1, tileX((ti % W.room.w) - 2), tileY(Math.floor(ti / W.room.w)), 0, { speed: 400, r: 5, life: 3 }, 1);
  ev = runSteps(W, 60);
  assert.equal(W.player.hp, BASE.maxHp - 1, 'дерево закрыло');
  assert.ok(of(ev, 'boom').some((e) => e.look === 'fx.spark' && e.r < 10), 'о преграду — искра');
  assert.equal(of(ev, 'hit').length, 0);
  // даже очень быстрый снаряд стену не проскакивает
  W.player.inv = 0;
  fireShot(W, 1, tileX((ti % W.room.w) - 2), tileY(Math.floor(ti / W.room.w)), 0, { speed: 5000, r: 5, life: 3 }, 1);
  runSteps(W, 10);
  assert.equal(W.player.hp, BASE.maxHp - 1);
});

test('выстрел лисы: ломает куст с двух единиц урона, ловит добычу, бьёт ломкие предметы', () => {
  const G = arena({ tpl: 'forest-glade' });
  const room = G.room;
  const bi = room.tiles.indexOf(TILE.BUSH);
  const bx = tileX(bi % room.w);
  const by = tileY(Math.floor(bi / room.w));
  fireShot(G, 0, bx - 60, by, 0, { speed: 300, r: 4, life: 0.5 }, 1);
  runSteps(G, 40);
  assert.equal(room.tiles[bi], TILE.BUSH, 'одна единица — ещё стоит');
  fireShot(G, 0, bx - 60, by, 0, { speed: 300, r: 4, life: 0.5 }, 1);
  runSteps(G, 40);
  assert.equal(room.tiles[bi], TILE.FLOOR);

  const A = arena();
  put(A, 100, 100);
  const r = spawnMob(A, 'rabbit', 400, 240, { tame: true });
  fireShot(A, 0, 300, 240, 0, { speed: 400, r: 4, life: 1 }, 1);
  const ev = runSteps(A, 30);
  assert.ok(r.dead);
  assert.deepEqual(of(ev, 'catch').map((e) => e.chain), [0], 'поймана не рывком');
  const target = addThing(A, { kind: 'target', x: 500, y: 300, r: 10, breakable: true, hp: 3 });
  fireShot(A, 0, 400, 300, 0, { speed: 400, r: 4, life: 1 }, 2);
  runSteps(A, 30);
  assert.equal(target.broken, false);
  assert.equal(target.hp, 1);
  fireShot(A, 0, 400, 300, 0, { speed: 400, r: 4, life: 1 }, 2);
  const brk = runSteps(A, 30);
  assert.ok(target.broken && target.v === 1 && !target.solid);
  assert.deepEqual(of(brk, 'break').map((e) => e.what), ['target']);
  assert.ok(sounds(brk).includes('stump'));
  assert.equal(breakThing(A, target, 5), false, 'сломанное не ломается');
  const chest = addThing(A, { kind: 'chest', x: 300, y: 100 });
  assert.equal(breakThing(A, chest, 99), false, 'а обычный предмет — не ломкий');
});

test('быстрый выстрел цель не проскакивает; очень много выстрелов — лишние не появляются, запас переиспользуется', () => {
  const G = arena();
  const m = dummy(G, 500, 240);
  fireShot(G, 0, 100, 240, 0, { speed: 6000, r: 2, life: 1 }, 1);
  runSteps(G, 6);
  assert.equal(m.hp, 999, '100 единиц за шаг — и всё равно попал');
  const made = [];
  for (let i = 0; i < CAPS.shots + 30; i++) made.push(fireShot(G, 1, 400, 100, 0, { speed: 0, life: 9 }, 0));
  assert.equal(G.room.shots.length, CAPS.shots);
  assert.equal(made.filter(Boolean).length, CAPS.shots);
  assert.equal(made[made.length - 1], null);
  clearShots(G.room, 0);
  assert.equal(G.room.shots.length, CAPS.shots);
  clearShots(G.room, 1);
  assert.equal(G.room.shots.length, 0);
  const again = fireShot(G, 0, 100, 100, 1, { speed: 50, look: 'shot.leaf', pierce: 3 }, 2);
  assert.ok(made.includes(again), 'объект взят из запаса');
  assert.deepEqual([again.from, again.look, again.pierce, again.dmg, again.mode, again.lob, again.ghost, again.t], [0, 'shot.leaf', 3, 2, 0, null, false, 0]);
  clearShots(G.room);
  stepShots(G, H);
  assert.equal(G.room.shots.length, 0);
});

test('взрыв: задевает всех в радиусе, отбрасывает, ломает кусты и ломкое; вражеский — бьёт лису', () => {
  const G = arena({ tpl: 'forest-glade' });
  const room = G.room;
  const bi = room.tiles.indexOf(TILE.BUSH);
  const bx = tileX(bi % room.w);
  const by = tileY(Math.floor(bi / room.w));
  put(G, 60, 60);
  const near = dummy(G, bx + 30, by);
  const far = dummy(G, bx + 90, by);
  const stump = addThing(G, { kind: 'stump', x: bx - 20, y: by + 30, r: 10, breakable: true, hp: 2 });
  explode(G, bx, by, 50, 4, 0, { kb: 200, burn: 1 });
  assert.equal(near.hp, 996);
  assert.ok(near.kbx > 0 && near.burn === 1);
  assert.equal(far.hp, 1000);
  assert.equal(room.tiles[bi], TILE.FLOOR);
  assert.ok(stump.broken);
  const ev = drain(G);
  assert.deepEqual(of(ev, 'boom').map((e) => [e.x, e.y, e.r, e.look]), [[bx, by, 50, 'fx.puff']]);
  assert.equal(G.player.hp, BASE.maxHp, 'свой взрыв лису не ранит');
  explode(G, 80, 60, 40, 1, 1);
  assert.equal(G.player.hp, BASE.maxHp - 1);
  explode(G, 400, 300, 40, 1, 1);
  assert.equal(G.player.hp, BASE.maxHp - 1, 'далёкий — мимо');
  explode(G, 80, 60, 40, 1, 1, { quiet: true, look: 'fx.ring' });
  const quiet = drain(G);
  assert.ok(!sounds(quiet.slice(-3)).includes('boom'));
});

// ---------- красные зоны ----------

test('зона бьёт ровно по окончании предупреждения: кто внутри — ранен, кто вышел — нет', () => {
  const G = arena();
  const P = G.player;
  put(G, 300, 240);
  let struck = 0;
  const z = addZone(G, { shape: 'circle', x: 300, y: 240, r: 50, t: 1, dmg: 1, on: () => { struck += 1; } });
  let ev = runSteps(G, 58);
  assert.equal(P.hp, BASE.maxHp);
  assert.equal(struck, 0);
  assert.ok(z.t > 0.9 && z.t < 1 && z.phase === 0, 'зона «наливается»');
  ev = runSteps(G, 4);
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.equal(struck, 1, 'обработчик зоны вызван один раз');
  assert.deepEqual(of(ev, 'strike').map((e) => e.zone.shape), ['circle']);
  assert.deepEqual(of(ev, 'hurt').map((e) => e.kind), ['zone']);
  assert.equal(G.room.zones.length, 0);
  // успела выйти
  P.inv = 0;
  put(G, 300, 240);
  addZone(G, { shape: 'circle', x: 300, y: 240, r: 50, t: 0.8, dmg: 1 });
  runSteps(G, 60, makeInput({ mx: 1 }));
  assert.ok(P.x > 355);
  assert.equal(P.hp, BASE.maxHp - 1);
  // сильный удар — два сердца
  P.inv = 0;
  addZone(G, { shape: 'circle', x: P.x, y: P.y, r: 30, t: 0.1, dmg: 2, kb: 300 });
  runSteps(G, 8);
  assert.equal(P.hp, BASE.maxHp - 3);
  // сектор и кольцо
  for (const o of [
    { shape: 'cone', x: 200, y: 240, a: 0, arc: 1, r: 120 },
    { shape: 'ring', x: 300, y: 240, r: 60, w: 20 },
    { shape: 'lane', x: 200, y: 240, x2: 500, y2: 240, w: 30 },
  ]) {
    const g = arena();
    put(g, 300, 240);
    if (o.shape === 'ring') put(g, 360, 240);
    addZone(g, { ...o, t: 0.1, dmg: 1 });
    runSteps(g, 8);
    assert.equal(g.player.hp, BASE.maxHp - 1, o.shape);
    const out = arena();
    put(out, 300, 320);
    addZone(out, { ...o, t: 0.1, dmg: 1 });
    runSteps(out, 8);
    assert.equal(out.player.hp, BASE.maxHp, `${o.shape}: в стороне не задевает`);
  }
});

test('«раньше предупреждать» (warn): зона бьёт на столько же позже; задержанная — появляется и бьёт в свой срок', () => {
  REG.ACCESSORIES['test-antler'] = { name: 'Рог', rarity: 0, drop: false, add: { warn: 0.4 } };
  const G = arena();
  put(G, 300, 240);
  G.inv.acc[0] = { id: 'test-antler' };
  recalc(G);
  cheat.god(G, true);
  let at = -1;
  addZone(G, { x: 300, y: 240, r: 40, t: 1, on: (g) => { at = g.time; } });
  runSteps(G, 100);
  assert.ok(Math.abs(at - 1.4) < 0.02, `удар в ${at}`);
  const D = arena();
  cheat.god(D, true);
  let hitAt = -1;
  const z = addZone(D, { x: 300, y: 240, r: 40, t: 0.5, delay: 0.7, on: (g) => { hitAt = g.time; } });
  const ev = runSteps(D, 30);
  assert.equal(of(ev, 'zone').length, 0, 'ещё не показана');
  assert.equal(z.t, 0);
  const later = runSteps(D, 60);
  assert.equal(of(later, 'zone').length, 1);
  assert.ok(sounds(later).includes('warn'));
  assert.ok(Math.abs(hitAt - 1.2) < 0.02, `удар в ${hitAt}`);
});

test('полоса с бегущим телом (лось): бьёт не в конце предупреждения, а когда добежит; топчет зверей, добычу не трогает', () => {
  const G = arena();
  const P = G.player;
  put(G, 600, 240);
  const speed = 500;
  const z = addZone(G, { shape: 'lane', x: 100, y: 240, x2: 700, y2: 240, w: 46, t: 0.5, dmg: 1, hitsMobs: true, run: { speed }, actor: 'haz.moose' });
  const foe = dummy(G, 300, 250);
  const side = dummy(G, 300, 300);
  const prey = spawnMob(G, 'rabbit', 400, 244, { tame: true });
  prey.freeze = 9;                                           // чтобы не убежала из полосы
  runSteps(G, 31);
  assert.equal(z.phase, 1, 'тело побежало');
  assert.equal(P.hp, BASE.maxHp, 'до лисы ещё не добежало');
  assert.equal(G.room.actors.length, 1);
  assert.deepEqual([G.room.actors[0].rig, G.room.actors[0].act], ['haz.moose', 'charge']);
  const t0 = G.time;
  runUntil(G, (g) => g.player.hp < BASE.maxHp, { seconds: 3 });
  assert.ok(Math.abs(G.time - t0 - (500 - 23) / speed) < 0.06, `добежало до лисы через ${G.time - t0}`);
  assert.ok(Math.abs(z.rx - P.x) < 46, 'тело рядом с лисой');
  assert.equal(foe.hp, 1000 - MOB.zoneDmg, 'зверя на пути потоптало');
  assert.equal(side.hp, 1000);
  assert.ok(!prey.dead, 'добычу лось не трогает');
  runSteps(G, 30);
  assert.equal(G.room.zones.length, 0, 'добежал — полоса пропала');
  assert.equal(foe.hp, 1000 - MOB.zoneDmg, 'каждого — один раз');
  // рывок сквозь бегущего
  const D = arena();
  put(D, 400, 300);
  addZone(D, { shape: 'lane', x: 100, y: 240, x2: 700, y2: 240, w: 46, t: 0.2, dmg: 1, run: { speed: 300 } });
  runSteps(D, 60);
  runSteps(D, 1, makeInput({ dash: true, dx: 0, dy: -1, dp: 1 }));
  runSteps(D, 60);
  assert.equal(D.player.hp, BASE.maxHp, 'перепрыгнула');
});

test('зона, которая остаётся вредной: лису жжёт, пока та внутри; своя (лисья) — бьёт зверей раз в полсекунды', () => {
  const G = arena();
  const P = G.player;
  put(G, 300, 240);
  addZone(G, { x: 300, y: 240, r: 40, t: 0.1, dmg: 1, linger: 3, look: 'fire' });
  runSteps(G, 10);
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.equal(G.room.zones[0].phase, 1);
  runSteps(G, 80);
  assert.equal(P.hp, BASE.maxHp - 2, 'осталась внутри — получила ещё, как только прошла неуязвимость');
  put(G, 500, 240);
  P.inv = 0;
  runSteps(G, 60);
  assert.equal(P.hp, BASE.maxHp - 2, 'вышла — не жжёт');
  runSteps(G, 60);
  assert.equal(G.room.zones.length, 0, 'через три секунды зона пропала');
  // паутина: без урона, только замедляет
  addZone(G, { x: P.x, y: P.y, r: 40, t: 0.05, dmg: 0, linger: 2, slow: 1, look: 'web' });
  runSteps(G, 10);
  assert.ok(P.fx.slow > 0);
  assert.equal(P.hp, BASE.maxHp - 2);
  runSteps(G, 200);
  assert.equal(P.fx.slow, 0);
  // капкан врага держит
  addZone(G, { x: P.x, y: P.y, r: 30, t: 0.05, dmg: 0, root: 0.8 });
  runSteps(G, 6);
  assert.ok(P.fx.root > 0.6);
  // зона лисы
  const M = arena();
  put(M, 100, 100);
  const m = dummy(M, 400, 240);
  addZone(M, { x: 400, y: 240, r: 40, t: 0.02, from: 0, dmg: 2, linger: 2 });
  runSteps(M, 130);
  assert.ok(1000 - m.hp >= 8 && 1000 - m.hp <= 10, `за две секунды: ${1000 - m.hp}`);
  assert.equal(M.player.hp, BASE.maxHp);
  put(M, 400, 240);
  addZone(M, { x: 400, y: 240, r: 40, t: 0.02, from: 0, dmg: 2 });
  runSteps(M, 5);
  assert.equal(M.player.hp, BASE.maxHp, 'своя зона лису не трогает');
});

test('зона погибшего зверя отменяется; зона «топчет всех» своего хозяина не задевает', () => {
  mob('test-caster', { hp: 10 });
  const G = arena();
  put(G, 300, 240);
  const m = spawnMob(G, 'test-caster', 500, 240, { warm: 0 });
  ACTS.circle(m, G, 300, 240, 50, 1);
  const lane = ACTS.lane(m, G, Math.PI, 300, 30, 1, { hitsMobs: true });
  assert.equal(G.room.zones.length, 2);
  assert.deepEqual([lane.owner, lane.from, lane.dmg, lane.x, lane.x2], [m.uid, 1, 1, 500, 200]);
  const other = dummy(G, 400, 240);
  runSteps(G, 70);
  assert.equal(m.hp, 10, 'своя полоса хозяина не бьёт');
  assert.equal(other.hp, 1000 - MOB.zoneDmg);
  G.player.inv = 0;
  G.player.hp = BASE.maxHp;
  ACTS.circle(m, G, 300, 240, 50, 1);
  ACTS.cone(m, G, Math.PI, 260, 1, 1);
  ACTS.ring(m, G, 300, 240, 30, 80, 1);
  runSteps(G, 20);
  hurtMob(G, m, 99, hitOf('shot'));
  assert.equal(G.room.zones.length, 0, 'все его предупреждения сняты');
  runSteps(G, 80);
  assert.equal(G.player.hp, BASE.maxHp);
  // вожак и хозяин бьют зонами на 2
  const elite = spawnMob(G, 'test-caster', 500, 300, { warm: 0, elite: true });
  assert.equal(ACTS.circle(elite, G, 1, 1, 10, 1).dmg, 2);
});

test('зоны идут через stepZones и не ломаются, если обработчик удара сам убирает и ставит зоны', () => {
  const G = arena();
  cheat.god(G, true);
  let chain = 0;
  const again = (g, z) => {
    chain += 1;
    // убрать чужую зону и поставить новую — прямо посреди обхода
    const other = g.room.zones.findIndex((o) => o !== z && o.tag === 'лишняя');
    if (other >= 0) removeZone(g.room, other);
    if (chain < 5) addZone(g, { x: 300, y: 240, r: 20, t: 0.05, on: again });
  };
  addZone(G, { x: 300, y: 240, r: 20, t: 0.05, on: again });
  for (let i = 0; i < 8; i++) addZone(G, { x: 100 + i * 40, y: 100, r: 10, t: 0.4 + i * 0.01, tag: 'лишняя' });
  for (let i = 0; i < 120; i++) stepZones(G, H);
  assert.equal(chain, 5);
  assert.equal(G.room.zones.length, 0);
});

// ---------- бросок врага и спутники под огнём ----------

test('бросок врага навесом: красный круг там, куда упадёт, и удар в момент падения', () => {
  mob('test-thrower', { hp: 10 });
  const G = arena();
  const P = G.player;
  put(G, 500, 240);
  const m = spawnMob(G, 'test-thrower', 200, 240, { warm: 0 });
  drain(G);
  const s = ACTS.lob(m, G, 500, 240, { look: 'shot.pumpkin', speed: 260, radius: 40, dmg: 1 });
  assert.ok(s.ghost && s.lob, 'сам снаряд только летит — бьёт круг');
  const z = G.room.zones[0];
  assert.deepEqual([z.shape, z.x, z.y, z.r, z.owner], ['circle', 500, 240, 40, m.uid]);
  assert.ok(Math.abs(s.lob.dur - z.total) < 1e-9, 'снаряд падает ровно в момент удара');
  const ev = runUntil(G, (g) => g.room.shots.length === 0, { seconds: 3 });
  runSteps(G, 2);
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.ok(of(ev, 'boom').length === 1 && sounds(ev).includes('spit'));
  // обычные выстрелы врага: один, веер, кольцо
  P.inv = 9;
  assert.ok(ACTS.shoot(m, G, 0, { speed: 200, look: 'shot.orb', v: 3 }));
  assert.equal(ACTS.fan(m, G, 0, 5, 1, { speed: 200 }), 5);
  assert.equal(ACTS.ringShots(m, G, 8, { speed: 200 }), 8);
  assert.equal(G.room.shots.filter((x) => x.from === 1).length, 14);
  assert.ok(G.room.shots.every((x) => x.owner === m.uid && x.dmg === 1));
  const before = lobShot(G, 1, 200, 240, 300, 300, { radius: 20, time: 0.5 }, 1, m.uid);
  assert.ok(Math.abs(before.lob.dur - 0.5) < 1e-9);
  // снаряд и бросок «без урона» (паутина): урон — ровно ноль, даже у вожака
  const elite = spawnMob(G, 'test-thrower', 300, 100, { warm: 0, elite: true });
  assert.equal(ACTS.shoot(elite, G, 0, { speed: 100, dmg: 0 }).dmg, 0);
  assert.equal(ACTS.shoot(elite, G, 0, { speed: 100 }).dmg, 2);
  clearShots(G.room);
  G.room.zones.length = 0;
  P.inv = 0;
  P.hp = BASE.maxHp;
  ACTS.lob(elite, G, P.x, P.y, { look: 'shot.web', speed: 400, radius: 40, dmg: 0, linger: 2, slow: 1, zoneLook: 'web' });
  assert.deepEqual([G.room.zones[0].dmg, G.room.zones[0].look, G.room.zones[0].linger], [0, 'web', 2]);
  runSteps(G, 60);
  assert.equal(P.hp, BASE.maxHp, 'паутина не ранит');
  assert.ok(P.fx.slow > 0, 'но замедляет');
});

test('спутник получает от вражеских выстрелов и зон, а без здоровья выбывает', () => {
  const G = arena();
  put(G, 300, 240);
  cheat.god(G, true);
  hireMinion(G, 'hedgie');
  const n = G.room.pals[0];
  const hp = n.hp;
  fireShot(G, 1, n.x - 60, n.y, 0, { speed: 300, r: 5, life: 2 }, 1);
  runSteps(G, 20);
  assert.equal(n.hp, hp - 1);
  assert.equal(G.minions[0].hp, hp - 1, 'здоровье спутника хранится в партии');
  n.touchT = 0;
  addZone(G, { x: n.x, y: n.y, r: 60, t: 0.05, dmg: 1 });
  runSteps(G, 6);
  assert.equal(n.hp, hp - 2);
  n.hp = 1;
  n.touchT = 0;
  explode(G, n.x, n.y, 30, 1, 1);
  const ev = drain(G);
  assert.ok(n.dead);
  assert.equal(G.minions.length, 0);
  assert.ok(of(ev, 'toast').some((e) => e.s.includes('Ёжик')));
  runSteps(G, 2);
  assert.equal(G.room.pals.length, 0);
});
