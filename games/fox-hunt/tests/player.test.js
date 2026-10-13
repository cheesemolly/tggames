// Лисья охота, лиса: ходьба (и лёд, грязь, колючки), рывок (длина, время, неуязвимость, возврат заряда, колючие,
// помощь в прицеливании), оружие, урон и возрождение, позы, а ещё каждая характеристика и каждый флаг вещей —
// что они и правда делают то, что обещают.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H, T, TILE, FOX_R, REG, tileX, tileY } from '../core.js';
import { BASE, LIMITS, FOX, DASH, POSE, PICK, DROPS } from '../balance.js';
import { tileAt, standable, addZone, addPick, addThing, updateFocus } from '../world.js';
import {
  STAT_KEYS, FLAG_KEYS, FLAG_RULES, FLAG_DEFAULT, recalc, hurtPlayer, heal, addMana, gainCoins, addEffect, setAct, payHearts,
} from '../player.js';
import { fireShot, hurtMob, hitOf } from '../combat.js';
import { spawnMob, hireMinion } from '../ai.js';
import { shopPrice } from '../inventory.js';
import { newRun, step, drain, cheat } from '../logic.js';
import { arena, dummy, put, makeInput, runSteps, runUntil, of, sounds } from './helpers.js';

// двойной урон случаен — чтобы числа в опытах были точными, по умолчанию его нет (сам он проверяется отдельно)
BASE.crit = 0;

let seq = 0;
/** Надеть на лису пробное украшение с такими add / mul / flags. */
function wear(G, def) {
  const id = `test-acc-${++seq}`;
  REG.ACCESSORIES[id] = { name: id, rarity: 0, drop: false, ...def };
  G.inv.acc[G.inv.acc.indexOf(null)] = { id };
  recalc(G);
  return id;
}
const speedOf = (P) => Math.hypot(P.vx, P.vy);
/** Комната с особой землёй: лиса стоит на полосе «=» шаблона forest-thicket; floor задаёт место (биом). */
function special(floor, over = {}) {
  const G = arena({ tpl: 'forest-thicket', floor, ...over });
  put(G, tileX(17), tileY(4));
  assert.equal(tileAt(G.room, G.player.x, G.player.y), TILE.SPECIAL);
  return G;
}
/** Рывок вправо полной силы и шаги до приземления; возвращает события. */
function dashRight(G, power = 1, dx = 1, dy = 0) {
  return runUntil(G, (g) => !g.player.dash, { seconds: 2, input: makeInput({ dash: true, dx, dy, dp: power }) });
}

// ---------- ходьба ----------

test('ходьба: разгон, ровная скорость 132, по диагонали не быстрее, отпустил — встала', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  step(G, makeInput({ mx: 1 }));
  assert.ok(Math.abs(P.vx - FOX.accel * H) < 1e-9, 'разгон не мгновенный');
  runSteps(G, 30, makeInput({ mx: 1 }));
  assert.ok(Math.abs(P.vx - BASE.speed) < 1e-9);
  const x0 = P.x;
  runSteps(G, 60, makeInput({ mx: 1 }));
  assert.ok(Math.abs(P.x - x0 - BASE.speed) < 1e-6, `за секунду прошла ${P.x - x0}`);
  assert.equal(P.act, 'run');
  assert.equal(P.face, 1);
  assert.equal(P.dir, 0);
  runSteps(G, 30, makeInput({ mx: -3, my: 3 }));
  assert.ok(Math.abs(speedOf(P) - BASE.speed) < 1e-6, 'длинный вектор стика скорости не прибавляет');
  assert.equal(P.face, -1);
  runSteps(G, 10, makeInput({ mx: 0.5 }));
  assert.ok(Math.abs(P.vx - BASE.speed / 2) < 1e-6, 'слабый наклон стика — шаг');
  runSteps(G, 6, makeInput());
  assert.equal(speedOf(P), 0);
  assert.equal(P.act, 'idle');
  assert.ok(Math.abs(P.px - P.x) < 1e-9, 'px, py — место в начале шага');
});

test('лёд, грязь и трава: особая земля действует по месту (биому)', () => {
  const ice = special(3);
  assert.equal(ice.room.special, 'ice');
  step(ice, makeInput({ mx: 1 }));
  assert.ok(Math.abs(ice.player.vx - FOX.iceAccel * H) < 1e-9, 'на льду разгон слабый');
  runSteps(ice, 20, makeInput({ mx: 1 }));
  const v = ice.player.vx;
  runSteps(ice, 6, makeInput());
  assert.ok(ice.player.vx > v - FOX.iceAccel * H * 6 - 1e-6 && ice.player.vx > 20, 'отпустил — скользит дальше');

  const mud = special(2);
  assert.equal(mud.room.special, 'mud');
  runSteps(mud, 12, makeInput({ mx: 1 }));
  assert.ok(Math.abs(mud.player.vx - BASE.speed * FOX.mud) < 1e-6, `в грязи ${mud.player.vx}`);

  for (const floor of [1, 5]) {
    const grass = special(floor);
    assert.equal(grass.room.special, 'grass');
    runSteps(grass, 12, makeInput({ mx: 1 }));
    assert.ok(Math.abs(grass.player.vx - BASE.speed) < 1e-6, 'трава и листья не мешают');
    assert.equal(grass.player.hp, BASE.maxHp);
  }
});

test('колючки и горячая трещина: стоишь — больно раз в секунду, в прыжке не задевают', () => {
  const G = arena({ tpl: 'forest-thicket' });
  const P = G.player;
  put(G, tileX(4), tileY(3));
  assert.equal(tileAt(G.room, P.x, P.y), TILE.THORN);
  const first = runUntil(G, (g) => g.player.hp < BASE.maxHp, { seconds: 2 });
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.ok(G.time < 0.5, `первый укол через ${G.time}`);
  assert.equal(of(first, 'hurt')[0].kind, 'floor');
  const t0 = G.time;
  runUntil(G, (g) => g.player.hp < BASE.maxHp - 1, { seconds: 3 });
  assert.ok(G.time - t0 > 0.95 && G.time - t0 < 1.2, `следующий через ${G.time - t0}`);
  // шаг в сторону — и колоть перестаёт
  put(G, tileX(8), tileY(2));
  runSteps(G, 150);
  assert.equal(P.hp, BASE.maxHp - 2);
  // рывок над колючками
  put(G, tileX(2) + 4, tileY(3));
  dashRight(G);
  assert.ok(P.x > tileX(5), 'перелетела колючки');
  assert.equal(P.hp, BASE.maxHp - 2);

  const hot = special(4);
  assert.equal(hot.room.special, 'hot');
  runSteps(hot, 40);
  assert.equal(hot.player.hp, BASE.maxHp - 1, 'горячая трещина жжёт, как колючки');
});

test('дверь: шаг в открытый проём переносит в соседнюю комнату к противоположной двери', () => {
  const G = arena({ door: true });
  const P = G.player;
  const d = G.room.doors.e;
  put(G, d.x - T, d.y);
  const events = runUntil(G, (g) => g.room.id === 1, { seconds: 2, input: makeInput({ mx: 1 }) });
  assert.equal(G.room.id, 1);
  assert.equal(G.map.cur, 1);
  assert.equal(G.map.entry, 'w');
  assert.deepEqual(of(events, 'room').map((e) => e.id), [1]);
  const w = G.room.doors.w;
  assert.ok(Math.abs(P.x - (w.x + T)) < 1e-9 && Math.abs(P.y - w.y) < 1e-9, 'встала на клетку у западной двери');
  assert.ok(G.map.rooms[1].seen);
  // и обратно — рывком
  dashRight(G, 1, -1, 0);
  step(G, makeInput());
  assert.equal(G.room.id, 0);
  assert.equal(G.map.entry, 'e');
});

// ---------- рывок ----------

test('рывок: 148 единиц за 0,17 с, слабый — 45 % длины; прыжок по дуге; заряд тратится и возвращается', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  step(G, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.ok(P.dash);
  assert.equal(P.charges, 0);
  assert.equal(P.act, 'dash');
  let top = 0;
  let steps = 1;
  const events = [...drain(G)];
  while (P.dash) {
    top = Math.max(top, P.z);
    step(G, makeInput());
    events.push(...drain(G));
    steps += 1;
    assert.ok(P.k >= 0 && P.k <= 1);
  }
  assert.ok(Math.abs(P.x - 200 - BASE.dashDist) < 1e-6 && P.y === 240, `пролетела ${P.x - 200}`);
  assert.ok(Math.abs(steps * H - BASE.dashDur) <= H + 1e-9, `за ${steps * H} с`);
  assert.ok(top > DASH.height * 0.8 && top <= DASH.height + 1e-9, `высота прыжка ${top}`);
  assert.equal(P.z, 0);
  assert.deepEqual(of(events, 'dash').map((e) => [e.x1, e.y1, Math.round(e.x2), e.y2]), [[200, 240, 348, 240]]);
  assert.equal(of(events, 'land').length, 1);
  assert.ok(sounds(events).includes('dash') && sounds(events).includes('land'));
  assert.equal(P.act, 'land');
  assert.equal(G.cnt.dashes, 1);
  // без заряда рывка нет
  step(G, makeInput({ dash: true, dx: -1, dy: 0, dp: 1 }));
  assert.equal(P.dash, null);
  runUntil(G, (g) => g.player.charges > 0, { seconds: 2 });
  assert.ok(Math.abs(G.time - BASE.dashCd) < 0.03, `заряд вернулся через ${G.time} с после начала рывка`);
  // слабый рывок
  put(G, 200, 300);
  dashRight(G, 0);
  assert.ok(Math.abs(P.x - 200 - BASE.dashDist * DASH.minPower) < 1e-6, `слабый: ${P.x - 200}`);
  // без направления — туда, куда лиса смотрит
  runSteps(G, 60);
  put(G, 400, 300);
  P.dir = Math.PI;
  dashRight(G, 1, 0, 0);
  assert.ok(P.x < 300);
});

test('рывок: пока лиса в воздухе (и чуть после), ей ничего не страшно', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  // красная зона по всему пути бьёт как раз посреди рывка, а на пути — вражеские выстрелы
  addZone(G, { shape: 'lane', x: 150, y: 240, x2: 450, y2: 240, w: 60, t: 0.06, dmg: 1 });
  for (let x = 240; x < 340; x += 20) fireShot(G, 1, x, 240, 0, { speed: 0, r: 6, life: 2 }, 1);
  step(G, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  let checked = 0;
  while (P.dash) {
    assert.ok(P.inv > 0);
    assert.equal(hurtPlayer(G, 1, 0, 0, 'touch'), false);
    checked += 1;
    step(G, makeInput());
  }
  assert.ok(checked >= 8);
  assert.equal(P.hp, BASE.maxHp);
  assert.ok(G.room.shots.length >= 4, 'выстрелы лису не задели и остались');
  assert.ok(P.inv > 0 && P.inv <= BASE.iframes + H, 'после приземления — ещё мгновение');
  runSteps(G, 5);
  assert.equal(P.inv, 0);
  assert.equal(hurtPlayer(G, 1, 0, 0, 'touch'), true, 'а потом — снова уязвима');
});

test('рывок ловит добычу и сразу возвращает заряд; вторая в том же рывке — на очко дороже', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  const a = spawnMob(G, 'rabbit', 260, 244);
  const b = spawnMob(G, 'rabbit', 315, 236);
  step(G, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(P.charges, 0);
  const events = runUntil(G, (g) => !g.player.dash, { seconds: 1 });
  assert.ok(a.dead && b.dead);
  assert.equal(P.charges, 1, 'заряд вернулся сразу');
  assert.deepEqual(of(events, 'catch').map((e) => [e.id, e.pts, e.chain]), [['rabbit', 1, 1], ['rabbit', 2, 2]]);
  assert.equal(G.score, 3);
  assert.equal(G.cnt.rabbits, 2);
  assert.deepEqual(events.filter((e) => e.t === 'sfx' && e.id === 'catch').map((e) => e.v), [1, 2], 'звук знает, какая по счёту');
  assert.equal(P.act, 'bite');
  // и снова рывок — сразу
  step(G, makeInput({ dash: true, dx: -1, dy: 0, dp: 1 }));
  assert.ok(P.dash, 'охота цепочкой');
  // мимо добычи — заряд не возвращается
  const far = arena();
  put(far, 200, 240);
  spawnMob(far, 'rabbit', 260, 320);
  dashRight(far);
  assert.equal(far.player.charges, 0);
  // добычу ловит и простое касание
  const touch = arena();
  put(touch, 200, 240);
  const r = spawnMob(touch, 'rabbit', 212, 240, { tame: true });
  const got = runSteps(touch, 2);
  assert.ok(r.dead);
  assert.deepEqual(of(got, 'catch').map((e) => e.chain), [0]);
  assert.equal(touch.player.act, 'bite');
});

test('рывок бьёт каждого врага на пути один раз и отбрасывает его', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  const a = dummy(G, 250, 240);
  const b = dummy(G, 310, 250);
  const off = dummy(G, 280, 300);
  const events = dashRight(G);
  assert.equal(a.hp, 1000 - BASE.dashDmg);
  assert.equal(b.hp, 1000 - BASE.dashDmg);
  assert.equal(off.hp, 1000, 'в стороне — не задет');
  assert.deepEqual(of(events, 'hit').map((e) => [e.dmg, e.kind, e.crit]), [[4, 'dash', false], [4, 'dash', false]]);
  assert.ok(a.kbx > 0 || a.x > 250, 'отброшен по ходу рывка');
  assert.equal(P.dash, null);
  assert.equal(P.charges, 0, 'врага ударила — заряд не возвращается');
  assert.ok(a.flash > 0 || a.flash === 0);
});

test('колючий враг: рывок в него ранит лису даже в прыжке и отбрасывает назад', () => {
  REG.MOBS['test-spiky'] = { name: 'Колючка', kind: 'hostile', hp: 50, r: 10, pts: 1, touch: 0, wave: false, spiky: () => true };
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  const m = spawnMob(G, 'test-spiky', 300, 240, { warm: 0 });
  const events = runUntil(G, (g) => !g.player.dash, { seconds: 1, input: makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }) });
  assert.equal(m.hp, m.maxHp, 'колючему рывок не вредит');
  assert.equal(P.hp, BASE.maxHp - 1);
  assert.equal(of(events, 'spiky').length, 1);
  assert.equal(of(events, 'hurt')[0].kind, 'spiky');
  assert.ok(sounds(events).includes('spiky'));
  assert.ok(P.x < 300 - m.r - DASH.sweep, `отскочила назад: ${P.x}`);
  assert.ok(P.x > 200, 'но не до самого начала');
  assert.ok(standable(G.room, P.x, P.y));
  assert.equal(P.act, 'hurt');
  // на колючего рывок сам не наводится (а на обычного врага в том же месте — наводится)
  const aim = arena();
  put(aim, 200, 240);
  spawnMob(aim, 'test-spiky', 330, 268, { warm: 0 });
  dashRight(aim);
  assert.equal(aim.player.hp, BASE.maxHp, 'прошла мимо: рывок не довернул');
  assert.equal(aim.player.y, 240);
  const soft = arena();
  put(soft, 200, 240);
  const target = dummy(soft, 330, 268);
  dashRight(soft);
  assert.ok(target.hp < 1000 && soft.player.y > 250, 'обычного врага там же рывок находит');
});

test('помощь в прицеливании: цель в узком секторе притягивает рывок, чуть шире — уже нет', () => {
  const at = (deg, dist = 100) => {
    const G = arena();
    put(G, 200, 240);
    const a = (deg * Math.PI) / 180;
    const m = spawnMob(G, 'rabbit', 200 + Math.cos(a) * dist, 240 + Math.sin(a) * dist, { tame: true });
    const events = dashRight(G);
    return { G, m, events };
  };
  const near = at(12);
  assert.ok(near.m.dead, 'в 12° — поймала');
  assert.ok(near.G.player.y > 245, 'рывок довернул к цели');
  const wide = at(26);
  assert.ok(!wide.m.dead, 'в 26° — мимо');
  assert.equal(wide.G.player.y, 240, 'и рывок пошёл, как целились');
  // цель чуть дальше длины рывка — дотягивается
  const far = at(5, BASE.dashDist + 14);
  assert.ok(far.m.dead, 'до цели чуть дальше длины рывок дотянулся');
  const tooFar = at(0, BASE.dashDist + 60);
  assert.ok(!tooFar.m.dead);
  // из двух — та, что точнее по направлению
  const G = arena();
  put(G, 200, 240);
  const a = spawnMob(G, 'rabbit', 290, 250, { tame: true });
  const b = spawnMob(G, 'rabbit', 290, 216, { tame: true });
  dashRight(G);
  assert.ok(a.dead && !b.dead);
});

test('рывок ломает кусты, перелетает воду, а в стену не тратится', () => {
  const G = arena({ tpl: 'forest-pond' });
  const P = G.player;
  const room = G.room;
  const bi = room.tiles.indexOf(TILE.BUSH);
  const bx = bi % room.w;
  const by = Math.floor(bi / room.w);
  put(G, tileX(bx - 2), tileY(by));
  const events = dashRight(G);
  assert.equal(room.tiles[bi], TILE.FLOOR, 'куст сломан');
  assert.ok(of(events, 'break').some((e) => e.what === 'bush'));
  // через пруд — там, где он уже рывка
  runSteps(G, 60);
  put(G, tileX(8), tileY(4));
  assert.equal(room.tiles[4 * room.w + 9], TILE.WATER);
  assert.equal(room.tiles[4 * room.w + 12], TILE.WATER);
  dashRight(G, 1);
  assert.ok(standable(room, P.x, P.y));
  assert.ok(P.x > 13 * T, `над водой пролетела: ${P.x}`);
  // вплотную к стене: рывка нет, заряд цел
  runSteps(G, 60);
  put(G, T + FOX_R + 0.5, tileY(6));
  const none = runSteps(G, 3, makeInput({ dash: true, dx: -1, dy: 0, dp: 1 }));
  assert.equal(P.charges, 1);
  assert.equal(of(none, 'dash').length, 0);
});

// ---------- оружие ----------

test('оружие: стреляет, пока зажато; тратит ману; целится само — во врага, которого видно', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  cheat.give(G, 'pinecone');
  const w = REG.WEAPONS.pinecone;
  const far = dummy(G, 420, 240);
  const near = dummy(G, 200, 340);
  const events = runSteps(G, 60, makeInput({ fire: true }));
  const shots = of(events, 'shot');
  assert.ok(Math.abs(shots.length - 1 / w.cd) <= 1, `выстрелов за секунду: ${shots.length}`);
  assert.ok(Math.abs(P.mana - (BASE.maxMana - shots.length * w.mana)) < 1e-9);
  assert.ok(shots.every((e) => Math.abs(e.a - Math.PI / 2) < 1e-6), 'бьёт по ближнему');
  assert.ok(near.hp < 1000 && far.hp === 1000);
  assert.ok(sounds(events).includes('shot'));
  assert.equal(P.face, 1);
  // ближний погиб — переключается на дальнего
  near.dead = true;
  const next = runSteps(G, 30, makeInput({ fire: true }));
  assert.ok(of(next, 'shot').every((e) => Math.abs(e.a) < 1e-6));
  // отпустил — не стреляет
  assert.equal(of(runSteps(G, 30), 'shot').length, 0);
});

test('оружие: за деревом врага не видит — тогда в добычу, а никого нет — куда смотрит лиса; мышь целит явно', () => {
  const G = arena({ tpl: 'forest-pond' });
  const P = G.player;
  const room = G.room;
  cheat.give(G, 'pinecone');
  const ti = room.tiles.indexOf(TILE.TALL);
  const tx = ti % room.w;
  const ty = Math.floor(ti / room.w);
  put(G, tileX(tx - 2), tileY(ty));
  const hidden = dummy(G, tileX(tx + 2), tileY(ty));
  const prey = spawnMob(G, 'rabbit', tileX(tx - 2), tileY(ty) + 70, { tame: true });
  const first = runSteps(G, 2, makeInput({ fire: true }));
  assert.ok(Math.abs(of(first, 'shot')[0].a - Math.PI / 2) < 1e-6, 'врага за деревом не видно — стреляет в кролика');
  prey.dead = true;
  hidden.dead = true;
  runSteps(G, 30);
  P.dir = -Math.PI / 2;
  const blind = runSteps(G, 2, makeInput({ fire: true }));
  assert.ok(Math.abs(of(blind, 'shot')[0].a + Math.PI / 2) < 1e-6, 'целей нет — по взгляду');
  runSteps(G, 30);
  const mouse = runSteps(G, 2, makeInput({ fire: true, hasT: true, tx: P.x - 100, ty: P.y }));
  assert.ok(Math.abs(Math.abs(of(mouse, 'shot')[0].a) - Math.PI) < 1e-6, 'мышь задаёт цель сама');
  assert.equal(P.face, -1);
});

test('оружие: без маны — событие «нет маны» не чаще раза в 0,6 с и ни одного выстрела; без оружия — ничего', () => {
  const G = arena();
  const P = G.player;
  const none = runSteps(G, 30, makeInput({ fire: true }));
  assert.equal(of(none, 'shot').length + of(none, 'nomana').length, 0);
  cheat.give(G, 'pinecone');
  P.mana = 1;
  const events = runSteps(G, 120, makeInput({ fire: true }));
  assert.equal(of(events, 'shot').length, 0);
  const n = of(events, 'nomana').length;
  assert.ok(n >= 3 && n <= 4, `«нет маны» за 2 секунды: ${n}`);
  assert.equal(P.mana, 1);
  // бесплатному оружию мана не нужна
  cheat.give(G, 'claws');
  G.inv.weapon = { id: 'claws' };
  P.mana = 0;
  assert.ok(of(runSteps(G, 30, makeInput({ fire: true })), 'shot').length >= 1);
});

test('правый стик рядом с предметом — действие, а не стрельба; выстрел, уже идущий, предмет не перебивает', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  cheat.give(G, 'pinecone');
  const chest = addThing(G, { kind: 'chest', x: 228, y: 240, usable: true, loot: { roll: false } });
  runSteps(G, 2);
  assert.equal(G.room.focus?.ref, chest);
  const press = runSteps(G, 40, makeInput({ fire: true }));
  assert.equal(chest.v, 1, 'сундук открыт');
  assert.equal(of(press, 'shot').length, 0, 'это нажатие — действие: пока держим, не стреляем');
  runSteps(G, 2);
  assert.ok(of(runSteps(G, 30, makeInput({ fire: true })), 'shot').length >= 1, 'новое нажатие — уже выстрел');
  // стреляем и подходим к вещи: она не берётся сама
  const p = addPick(G, 'item', 300, 240, 1, 'claws', 0, false);
  p.t = 1;
  const walk = runSteps(G, 80, makeInput({ fire: true, mx: 1 }));
  assert.ok(of(walk, 'shot').length >= 3);
  assert.ok(G.room.picks.includes(p), 'вещь лежит: зажатый выстрел её не подобрал');
  // отдельная кнопка действия берёт
  put(G, 290, 240);
  runSteps(G, 2);
  runSteps(G, 2, makeInput({ act: true }));
  assert.ok(!G.room.picks.includes(p));
  assert.ok(G.inv.bag.some((it) => it?.id === 'claws'));
});

// ---------- урон ----------

test('урон: сначала щит, потом сердца; после удара 1,1 с неуязвимости; щит возвращается через 4 с', () => {
  const G = arena();
  const P = G.player;
  cheat.give(G, 'vest');
  P.shield = 1;
  drain(G);
  assert.equal(hurtPlayer(G, 1, P.x - 10, P.y, 'touch'), true);
  assert.deepEqual([P.shield, P.hp], [0, BASE.maxHp], 'щит принял удар');
  let ev = drain(G);
  assert.deepEqual(of(ev, 'hurt').map((e) => [e.dmg, e.shield]), [[0, 1]]);
  assert.ok(sounds(ev).includes('shield') && !sounds(ev).includes('hurt'));
  assert.ok(Math.abs(P.inv - FOX.hurtInv) < 1e-9);
  assert.equal(hurtPlayer(G, 1, P.x - 10, P.y, 'touch'), false, 'неуязвима');
  assert.equal(hurtPlayer(G, 1, P.x - 10, P.y, 'touch', true), true, 'кроме удара «насквозь»');
  assert.equal(P.hp, BASE.maxHp - 1);
  P.inv = 0;
  hurtPlayer(G, 3, P.x - 10, P.y, 'touch');
  assert.equal(P.hp, BASE.maxHp - 4);
  ev = drain(G);
  assert.ok(sounds(ev).includes('hurt'));
  assert.ok(P.vx > 0, 'отбросило от удара');
  assert.equal(P.act, 'hurt');
  assert.ok(Math.abs(P.flash - POSE.flash) < 1e-9);
  assert.equal(G.cnt.hurt, 3);
  // щит
  const t0 = G.time;
  runUntil(G, (g) => g.player.shield > 0, { seconds: 8 });
  assert.ok(Math.abs(G.time - t0 - (FOX.shieldDelay + FOX.shieldStep)) < 0.05, `щит вернулся через ${G.time - t0}`);
  assert.equal(hurtPlayer(G, 0, 0, 0), false);
  assert.equal(hurtPlayer(G, -1, 0, 0), false);
  assert.equal(P.flash, 0, 'вспышка от удара гаснет');
});

test('жизнь потеряна: лиса лежит 1,2 с и встаёт у ближайшей норы с полными сердцами; вражеские зоны отменяются', () => {
  const G = arena({ tpl: 'forest-pond' });
  const P = G.player;
  const den = G.room.dens[0];
  put(G, den.x + 150, den.y + 60);
  addZone(G, { x: P.x, y: P.y, r: 60, t: 5, dmg: 1 });
  P.hp = 1;
  hurtPlayer(G, 1, P.x - 5, P.y, 'touch');
  let ev = drain(G);
  assert.equal(G.lives, 2);
  assert.deepEqual(of(ev, 'life').map((e) => e.lives), [2]);
  assert.ok(sounds(ev).includes('die'));
  assert.ok(Math.abs(P.down - FOX.respawnTime) < 1e-9);
  assert.equal(P.act, 'down');
  assert.equal(hurtPlayer(G, 1, 0, 0, 'touch', true), false, 'лежачую не бьют');
  const at = { x: P.x, y: P.y };
  runSteps(G, 30, makeInput({ mx: 1, dash: true, dx: 1, dy: 0, dp: 1, fire: true }));
  assert.deepEqual({ x: P.x, y: P.y }, at, 'лёжа — ни шагу');
  assert.equal(P.act, 'down');
  assert.ok(P.k > 0.3 && P.k < 0.6);
  ev = runUntil(G, (g) => g.player.down <= 0, { seconds: 2 });
  assert.ok(Math.abs(G.time - FOX.respawnTime) < 0.03);
  assert.deepEqual([P.x, P.y], [den.x, den.y]);
  assert.equal(P.hp, BASE.maxHp);
  assert.ok(Math.abs(P.inv - FOX.respawnInv) < 1e-9);
  assert.deepEqual(of(ev, 'respawn').map((e) => [e.x, e.y]), [[den.x, den.y]]);
  assert.ok(sounds(ev).includes('respawn'));
  assert.equal(G.room.zones.length, 0, 'то, что целилось в лису, отменено');
  assert.equal(P.act, 'rise');
  step(G, makeInput({ mx: 1 }));
  assert.equal(P.vx, 0, 'пока встаёт — стоит');
  runSteps(G, 40, makeInput({ mx: 1 }));
  assert.ok(P.vx > 0 && P.act === 'run');
  assert.equal(G.over, false);
});

test('последняя жизнь: конец партии, дальше шаги ничего не меняют', () => {
  const G = arena();
  const P = G.player;
  G.lives = 1;
  P.hp = 2;
  hurtPlayer(G, 5, 0, 0, 'touch');
  const ev = drain(G);
  assert.equal(G.over, true);
  assert.equal(G.lives, 0);
  assert.equal(of(ev, 'over').length, 1);
  assert.ok(sounds(ev).includes('gameover'));
  assert.equal(P.act, 'down');
  const frozen = JSON.stringify([P.x, P.y, G.time, G.rs, G.score]);
  runSteps(G, 60, makeInput({ mx: 1, dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(JSON.stringify([P.x, P.y, G.time, G.rs, G.score]), frozen);
  assert.equal(hurtPlayer(G, 1, 0, 0), false);
});

test('плата сердцами: мимо щита и неуязвимости, но последнее сердце не отдаётся', () => {
  const G = arena();
  const P = G.player;
  cheat.give(G, 'vest');
  P.shield = 1;
  P.inv = 5;
  drain(G);
  assert.equal(payHearts(G, 2), true);
  assert.deepEqual([P.hp, P.shield, P.inv, G.lives], [3, 1, 5, 3]);
  assert.deepEqual(of(drain(G), 'hurt').map((e) => [e.dmg, e.kind]), [[2, 'pay']]);
  assert.equal(payHearts(G, 3), false, 'последнее сердце не отдаётся');
  assert.equal(P.hp, 3);
  assert.equal(payHearts(G, 2), true);
  assert.equal(P.hp, 1);
  assert.equal(payHearts(G, 1), false);
  assert.equal(payHearts(G, 0), false);
  assert.equal(G.cnt.hurt, 0, 'плата — не удар');
});

test('неуязвимость для проверок: с ней лису не ранит ничто', () => {
  const G = arena();
  cheat.god(G, true);
  assert.equal(hurtPlayer(G, 9, 0, 0, 'touch', true), false);
  assert.equal(G.player.hp, BASE.maxHp);
  cheat.god(G, false);
  assert.equal(hurtPlayer(G, 1, 0, 0, 'touch'), true);
});

// ---------- позы ----------

test('позы лисы: каждая держится своё время, ход k — от 0 до 1, более важная не перебивается менее важной', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  const acts = new Set();
  const watch = (events) => {
    acts.add(P.act);
    assert.ok(P.k >= 0 && P.k <= 1, `${P.act}: k = ${P.k}`);
    assert.ok(P.face === 1 || P.face === -1);
    return events;
  };
  const run = (n, input) => runSteps(G, n, input, () => watch());
  run(3, makeInput());
  assert.equal(P.act, 'idle');
  run(5, makeInput({ mx: 1 }));
  assert.equal(P.act, 'run');
  run(3, makeInput({ aim: true, ax: 0, ay: -1, ap: 0.6 }));
  assert.equal(P.act, 'aim');
  assert.equal(P.k, 0.6, 'у прицела k — сила рывка');
  assert.deepEqual(P.aim, { x: 0, y: -1, p: 0.6 });
  assert.ok(Math.abs(P.dir + Math.PI / 2) < 1e-9, 'лиса смотрит, куда целится');
  run(1, makeInput());
  assert.equal(P.aim, null);
  // рывок → приземление
  run(1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(P.act, 'dash');
  runUntil(G, (g) => !g.player.dash, { each: () => watch() });
  assert.equal(P.act, 'land');
  let n = 0;
  while (P.act === 'land') {
    run(1, makeInput());
    n += 1;
  }
  assert.ok(Math.abs(n * H - POSE.land) <= H + 1e-9, `приземление ${n * H} с`);
  // выстрел
  cheat.give(G, 'pinecone');
  run(1, makeInput({ fire: true }));
  assert.equal(P.act, 'fire');
  n = 0;
  while (P.act === 'fire') {
    run(1, makeInput());
    n += 1;
  }
  assert.ok(Math.abs(n * H - POSE.fire) <= H + 1e-9);
  // удар важнее выстрела
  hurtPlayer(G, 1, P.x - 5, P.y, 'touch');
  assert.equal(P.act, 'hurt');
  setAct(P, 'fire', POSE.fire);
  assert.equal(P.act, 'hurt', 'выстрел позу удара не перебивает');
  n = 0;
  while (P.act === 'hurt') {
    run(1, makeInput());
    n += 1;
  }
  assert.ok(Math.abs(n * H - POSE.hurt) <= H + 1e-9);
  assert.ok(acts.has('idle') && acts.has('run') && acts.has('aim') && acts.has('dash') && acts.has('land') && acts.has('fire') && acts.has('hurt'));
});

// ---------- временные действия ----------

test('временные действия: ускорение, ярость, каменная шкура, капкан — на своё время', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  assert.ok(addEffect(G, 'haste', 1));
  assert.ok(Math.abs(P.st.speed - BASE.speed * 1.35) < 1e-9);
  assert.ok(addEffect(G, 'haste', 0.5), 'повтор идущее не укорачивает');
  assert.equal(P.fx.haste, 1);
  runSteps(G, 61);
  assert.equal(P.fx.haste, 0);
  assert.equal(P.st.speed, BASE.speed);
  addEffect(G, 'rage', 5);
  assert.equal(P.st.dashDmg, BASE.dashDmg * 2);
  addEffect(G, 'stone', 5);
  assert.equal(P.st.maxShield, 3);
  assert.equal(P.shield, 3, 'временный щит даётся сразу полным');
  runSteps(G, 5 * 60 + 2);
  assert.deepEqual([P.st.maxShield, P.shield, P.st.dashDmg], [0, 0, BASE.dashDmg]);
  // капкан: ни идти, ни прыгать
  addEffect(G, 'root', 0.5);
  const x = P.x;
  runSteps(G, 20, makeInput({ mx: 1, dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(P.x, x);
  assert.equal(P.charges, 1);
  runSteps(G, 30, makeInput({ mx: 1 }));
  assert.ok(P.x > x);
  // замедление
  addEffect(G, 'slow', 1);
  assert.equal(P.st.speed, BASE.speed * 0.5);
  assert.equal(addEffect(G, 'нет такого', 5), false);
  assert.equal(addEffect(G, 'haste', 0), false);
});

// ---------- характеристики ----------

test('recalc: каждая характеристика считается как (основа + add) × mul и не выходит за свои пределы', () => {
  assert.deepEqual(STAT_KEYS, Object.keys(BASE));
  assert.deepEqual(Object.keys(LIMITS).sort(), [...STAT_KEYS].sort(), 'у каждой характеристики есть пределы');
  for (const key of STAT_KEYS) {
    const [lo, hi] = LIMITS[key];
    const base = key === 'crit' ? 0 : BASE[key];
    assert.ok(base >= lo && base <= hi, `${key}: основа вне пределов`);
    const whole = Number.isInteger(BASE[key]) && ['maxHp', 'maxShield', 'maxMana', 'dashCharges', 'palSlots', 'rabbitsPlus', 'rabbitPts', 'healBonus', 'hazardCut'].includes(key);
    const fresh = () => {
      const G = arena();
      G.player.mana = 0;
      return G;
    };
    const plus = fresh();
    wear(plus, { add: { [key]: 1 } });
    const want = Math.min(hi, base + 1);
    assert.ok(Math.abs(plus.player.st[key] - want) < 1e-9, `${key}: +1 → ${plus.player.st[key]}`);
    const twice = fresh();
    wear(twice, { add: { [key]: 1 } });
    wear(twice, { mul: { [key]: 2 } });
    const got = twice.player.st[key];
    const exact = Math.min(hi, Math.max(lo, (base + 1) * 2));
    assert.ok(Math.abs(got - (whole ? Math.round(exact) : exact)) < 1e-9, `${key}: (основа + 1) × 2 → ${got}`);
    const huge = fresh();
    wear(huge, { add: { [key]: 1e6 } });
    assert.equal(huge.player.st[key], hi, `${key}: сверху ограничена`);
    const tiny = fresh();
    wear(tiny, { add: { [key]: -1e6 } });
    assert.equal(tiny.player.st[key], lo, `${key}: снизу ограничена`);
    if (whole) assert.ok(Number.isInteger(got), `${key} — целое`);
  }
  // чужие ключи и мусор в описании вещи ничего не ломают
  const G = arena();
  wear(G, { add: { 'нет такой': 5, speed: 'быстро' }, mul: { speed: NaN, toString: 3 }, flags: { 'нет такого': true } });
  for (const key of STAT_KEYS) assert.equal(G.player.st[key], key === 'crit' ? 0 : BASE[key], key);
});

test('recalc: порядок — броня, украшения, дары, временные действия; снял вещь — всё вернулось', () => {
  REG.ARMOR['test-plate'] = { name: 'Латы', rarity: 0, drop: false, shield: 2, mul: { speed: 0.9 } };
  REG.GIFTS['test-gift'] = { name: 'Дар', add: { speed: 10 } };
  const G = arena();
  const P = G.player;
  G.inv.armor = { id: 'test-plate' };
  wear(G, { add: { speed: 20 } });
  G.gifts.push('test-gift');
  addEffect(G, 'haste', 5);
  assert.ok(Math.abs(P.st.speed - (BASE.speed + 20 + 10) * 0.9 * 1.35) < 1e-9, `скорость ${P.st.speed}`);
  assert.equal(P.st.maxShield, 2);
  P.shield = 2;
  G.inv.armor = null;
  recalc(G);
  assert.equal(P.st.maxShield, 0);
  assert.equal(P.shield, 0, 'сняла броню — щита нет');
  // текущие сердца, мана и заряды подрезаются под новые пределы
  const H2 = arena();
  const id = wear(H2, { add: { maxHp: 3, maxMana: 100, dashCharges: 2 } });
  Object.assign(H2.player, { hp: 8, mana: 200, charges: 3 });
  H2.inv.acc[H2.inv.acc.findIndex((it) => it?.id === id)] = null;
  recalc(H2);
  assert.deepEqual([H2.player.hp, H2.player.mana, H2.player.charges], [5, 100, 1]);
});

test('флаги: каждый складывается по своему правилу', () => {
  assert.deepEqual(Object.keys(FLAG_RULES), FLAG_KEYS);
  assert.equal(FLAG_KEYS.length, 21);
  for (const key of FLAG_KEYS) {
    const rule = FLAG_RULES[key];
    const none = arena();
    assert.equal(none.player.st.flags[key], rule === 'or' ? false : 0, `${key}: без вещей выключен`);
    const one = arena();
    wear(one, { flags: { [key]: true } });
    const on = one.player.st.flags[key];
    if (rule === 'or') assert.equal(on, true, key);
    else assert.equal(on, FLAG_DEFAULT[key], `${key}: true — значение по умолчанию`);
    if (rule === 'or') continue;
    const two = arena();
    wear(two, { flags: { [key]: 2 } });
    wear(two, { flags: { [key]: 5 } });
    const want = rule === 'sum' ? 7 : rule === 'max' ? 5 : 2;
    assert.equal(two.player.st.flags[key], want, `${key}: правило ${rule}`);
    const off = arena();
    wear(off, { flags: { [key]: 0 } });
    assert.equal(off.player.st.flags[key], 0, `${key}: ноль — выключен`);
  }
});

// Каждая характеристика — в деле.

test('характеристики: сердца, щит, мана и её приток', () => {
  const G = arena();
  const P = G.player;
  wear(G, { add: { maxHp: 2, maxShield: 2, maxMana: 50, manaRegen: 4 } });
  P.hp = 1;
  assert.equal(heal(G, 99), 6);
  assert.equal(P.hp, 7, 'лечение — до нового предела');
  P.mana = 0;
  assert.equal(addMana(G, 999), 150);
  P.mana = 100;
  runSteps(G, 60);
  assert.ok(Math.abs(P.mana - 104) < 1e-6, `приток маны: ${P.mana}`);
  runSteps(G, 60 * 12);
  assert.equal(P.mana, 150, 'выше предела не растёт');
  P.shieldT = 99;
  runSteps(G, Math.ceil((FOX.shieldStep * 2) / H) + 2);
  assert.equal(P.shield, 2, 'щит дорос до предела');
  runSteps(G, 120);
  assert.equal(P.shield, 2);
});

test('характеристики: скорость и всё про рывок', () => {
  const G = arena();
  const P = G.player;
  put(G, 150, 240);
  wear(G, { mul: { speed: 1.15, dashDist: 1.25, dashDur: 2, dashCd: 0.5 }, add: { dashDmg: 2, dashCharges: 1, iframes: 0.2 } });
  runSteps(G, 30, makeInput({ mx: 1 }));
  assert.ok(Math.abs(P.vx - BASE.speed * 1.15) < 1e-6);
  runSteps(G, 10);
  put(G, 150, 240);
  const m = dummy(G, 220, 240);
  assert.equal(P.charges, 2);
  step(G, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(P.charges, 1, 'второй заряд цел');
  let steps = 1;
  while (P.dash) {
    step(G, makeInput());
    steps += 1;
  }
  assert.ok(Math.abs(P.x - 150 - BASE.dashDist * 1.25) < 1e-6, `длина ${P.x - 150}`);
  assert.ok(Math.abs(steps * H - BASE.dashDur * 2) <= H + 1e-9, `время ${steps * H}`);
  assert.equal(m.hp, 1000 - (BASE.dashDmg + 2));
  assert.ok(Math.abs(P.inv - (BASE.iframes + 0.2)) < H + 1e-9, `неуязвимость после рывка ${P.inv}`);
  // два рывка подряд, и оба заряда возвращаются вдвое быстрее
  P.charges = 2;
  P.chargeT = 0;
  step(G, makeInput({ dash: true, dx: -1, dy: 0, dp: 0 }));
  runUntil(G, (g) => !g.player.dash, { seconds: 1 });
  step(G, makeInput({ dash: true, dx: 1, dy: 0, dp: 0 }));
  assert.ok(P.dash, 'два рывка подряд');
  const t0 = G.time;
  runUntil(G, (g) => g.player.charges === 2, { seconds: 3 });
  assert.ok(G.time - t0 < BASE.dashCd * 0.5 * 2 + 0.05, `заряды вернулись за ${G.time - t0}`);
});

test('характеристика crit: двойной урон с таким шансом — и у рывка, и у выстрела', () => {
  const G = arena();
  put(G, 200, 240);
  wear(G, { add: { crit: 0.5 } });
  assert.equal(G.player.st.crit, 0.5);
  const m = dummy(G, 300, 240, { hp: 1e9 });
  let crits = 0;
  const n = 600;
  for (let i = 0; i < n; i++) {
    const s = fireShot(G, 0, 250, 240, 0, { speed: 600, r: 4, life: 0.3 }, 1);
    assert.ok(s);
    const ev = runSteps(G, 8);
    const hit = of(ev, 'hit')[0];
    assert.ok(hit);
    assert.equal(hit.dmg, hit.crit ? 2 : 1);
    if (hit.crit) crits += 1;
  }
  assert.ok(crits > n * 0.42 && crits < n * 0.58, `двойных ${crits} из ${n}`);
  assert.ok(m.hp < 1e9);
  // без шанса — ни одного
  const calm = arena();
  put(calm, 200, 240);
  dummy(calm, 260, 240);
  const ev = dashRight(calm);
  assert.equal(of(ev, 'hit')[0].crit, false);
  assert.ok(!sounds(ev).includes('crit') && sounds(ev).includes('hit'));
});

test('характеристики: удача, монеты, радиус подбора, прибавка к лечению', () => {
  // удача: из убитых чаще выпадают сердца
  const hearts = (luck) => {
    const G = arena({ seed: 7 });
    if (luck) wear(G, { add: { luck } });
    let n = 0;
    for (let i = 0; i < 500; i++) {
      const m = dummy(G, 300, 240, { hp: 1 });
      hurtMob(G, m, 5, hitOf('shot'));
      n += G.room.picks.filter((p) => p.kind === 'heart').length;
      G.room.picks.length = 0;
      G.room.mobs.length = 0;
    }
    return n;
  };
  const plain = hearts(0);
  const lucky = hearts(5);
  assert.ok(plain > 500 * DROPS.heart * 0.4 && plain < 500 * DROPS.heart * 2, `без удачи сердец ${plain}`);
  assert.ok(lucky > plain * 2, `с удачей ${lucky} против ${plain}`);

  const G = arena();
  const P = G.player;
  wear(G, { mul: { coinMul: 1.5, magnet: 2.5 }, add: { healBonus: 1 } });
  assert.equal(gainCoins(G, 10), 15);
  assert.deepEqual([G.coins, G.cnt.coins], [15, 15]);
  let sum = 0;
  for (let i = 0; i < 400; i++) sum += gainCoins(G, 1);
  assert.ok(sum > 560 && sum < 640, `по одной монете ×1,5: ${sum} из 400`);
  // подбор издалека
  put(G, 200, 240);
  P.hp = 2;
  const far = addPick(G, 'heart', 200 + BASE.magnet * 2, 240, 1, null, 0, false);
  runUntil(G, (g) => !g.room.picks.includes(far), { seconds: 3 });
  assert.ok(!G.room.picks.includes(far), 'сердце прилетело издалека');
  assert.equal(P.hp, 4, 'и вылечило на одно больше');
  const calm = arena();
  put(calm, 200, 240);
  calm.player.hp = 2;
  const stay = addPick(calm, 'heart', 200 + BASE.magnet * 2, 240, 1, null, 0, false);
  runSteps(calm, 120);
  assert.ok(calm.room.picks.includes(stay), 'без магнита — лежит');
  const close = addPick(calm, 'heart', 200 + BASE.magnet - 4, 240, 1, null, 0, false);
  runSteps(calm, 60);
  assert.ok(!calm.room.picks.includes(close));
  assert.equal(calm.player.hp, 3);
});

test('характеристики оружия: урон, частота, расход маны, дальность, скорость выстрела', () => {
  const shoot = (def) => {
    const G = arena();
    put(G, 200, 240);
    cheat.give(G, 'pinecone');
    if (def) wear(G, def);
    const m = dummy(G, 200 + 330, 240);
    const events = runSteps(G, 120, makeInput({ fire: true, hasT: true, tx: 900, ty: 240 }));
    return { G, m, shots: of(events, 'shot').length, hits: of(events, 'hit') };
  };
  const w = REG.WEAPONS.pinecone;
  const base = shoot(null);
  assert.equal(base.m.hp, 1000, 'обычной дальности до чучела не хватает');
  assert.ok(Math.abs(base.G.player.mana - (100 - base.shots * w.mana)) < 1e-9);
  const strong = shoot({ mul: { wDmg: 2, wRange: 1.3 } });
  assert.ok(strong.hits.length > 0, 'дальность выросла — достало');
  assert.ok(strong.hits.every((e) => e.dmg === w.dmg * 2), 'урон вдвое');
  const fast = shoot({ mul: { wCd: 0.5 } });
  assert.ok(Math.abs(fast.shots - base.shots * 2) <= 1, `выстрелов ${fast.shots} против ${base.shots}`);
  const cheap = shoot({ mul: { wCost: 0.5 } });
  assert.ok(Math.abs(cheap.G.player.mana - (100 - cheap.shots * w.mana * 0.5)) < 1e-9);
  const G = arena();
  cheat.give(G, 'pinecone');
  wear(G, { mul: { shotSpeed: 1.5 } });
  runSteps(G, 2, makeInput({ fire: true }));
  assert.ok(Math.abs(Math.hypot(G.room.shots[0].vx, G.room.shots[0].vy) - w.shot.speed * 1.5) < 1e-6);
});

test('характеристики охоты: чуткость добычи, срок её ухода, очки и число в волне', () => {
  // aware: с вещью добыча замечает лису позже
  const notices = (def) => {
    const G = arena();
    put(G, 200, 240);
    if (def) wear(G, def);
    const r = spawnMob(G, 'rabbit', 200 + REG.MOBS.rabbit.aware * 0.85, 240);
    runSteps(G, 30);
    return r.state !== 'graze';
  };
  assert.equal(notices(null), true);
  assert.equal(notices({ mul: { aware: 0.7 } }), false, '«колокольчик тишины»: подпускает ближе');
  // preyStay
  const G = arena();
  wear(G, { mul: { preyStay: 1.3 }, add: { rabbitPts: 1 } });
  const r = spawnMob(G, 'rabbit', 500, 300);
  assert.ok(Math.abs(r.life - REG.MOBS.rabbit.life * 1.3) < 1e-9);
  // rabbitPts
  put(G, r.x - 5, r.y);
  const ev = runSteps(G, 2);
  assert.deepEqual(of(ev, 'catch').map((e) => e.pts), [2]);
  assert.equal(G.score, 2);
  // rabbitsPlus: в волне на столько больше добычи
  const prey = (def) => {
    const run = newRun(77);
    cheat.god(run, true);
    if (def) wear(run, def);
    cheat.warp(run, 'hunt');
    runUntil(run, (g) => g.room.dir.mode === 'wave', { seconds: 3 });
    return run.room.dir.queue.filter((e) => e.prey).length + run.room.mobs.filter((m) => m.kind === 0).length;
  };
  assert.equal(prey({ add: { rabbitsPlus: 2 } }), prey(null) + 2);
});

test('характеристики: цены, спутники, урон напастей, щит, уворот, ранние предупреждения', () => {
  const G = arena();
  const P = G.player;
  wear(G, { mul: { shopMul: 0.7, palHp: 1.5, shieldRegen: 2 }, add: { palSlots: 1, hazardCut: 1, maxShield: 1, warn: 0.4 } });
  assert.equal(shopPrice(G, 30), 21);
  assert.equal(shopPrice(G, 1), 1, 'дешевле монеты не бывает');
  // спутники
  assert.ok(hireMinion(G, 'hedgie') && hireMinion(G, 'hedgie') && hireMinion(G, 'hedgie'));
  assert.equal(hireMinion(G, 'hedgie'), false, 'мест — три');
  assert.equal(G.room.pals[0].maxHp, Math.round(REG.MINIONS.hedgie.hp * 1.5));
  const plain = arena();
  assert.ok(hireMinion(plain, 'hedgie') && hireMinion(plain, 'hedgie'));
  assert.equal(hireMinion(plain, 'hedgie'), false, 'без вещи мест два');
  assert.equal(plain.room.pals[0].maxHp, REG.MINIONS.hedgie.hp);
  // hazardCut: удар красной зоны слабее на 1, но не меньше 1; касание — как было
  hurtPlayer(G, 2, 0, 0, 'zone');
  assert.equal(P.hp, BASE.maxHp - 1);
  P.inv = 0;
  hurtPlayer(G, 1, 0, 0, 'zone');
  assert.equal(P.hp, BASE.maxHp - 2);
  P.inv = 0;
  hurtPlayer(G, 2, 0, 0, 'touch');
  assert.equal(P.hp, BASE.maxHp - 4);
  // shieldRegen: вдвое быстрее
  P.inv = 0;
  P.shieldT = 99;
  runUntil(G, (g) => g.player.shield > 0, { seconds: 3 });
  assert.equal(P.shield, 1);
  // warn
  const z = addZone(G, { x: 100, y: 100, r: 20, t: 1 });
  assert.ok(Math.abs(z.total - 1.4) < 1e-9);

  const D = arena({ seed: 3 });
  wear(D, { add: { dodge: 0.5 } });
  let dodged = 0;
  let blocks = 0;
  for (let i = 0; i < 400; i++) {
    D.player.inv = 0;
    D.player.hp = 5;
    if (!hurtPlayer(D, 1, 0, 0, 'touch')) dodged += 1;
    blocks += of(drain(D), 'block').length;
  }
  assert.ok(dodged > 160 && dodged < 240, `увернулась ${dodged} раз из 400`);
  assert.equal(blocks, dodged);
});

// Каждый флаг — в деле.

test('флаги рывка: огненный след, лёд, паутина, гром при приземлении', () => {
  const dashWith = (flags, at = [260, 240]) => {
    const G = arena();
    put(G, 200, 240);
    wear(G, { flags });
    const m = dummy(G, at[0], at[1]);
    const events = dashRight(G);
    return { G, m, events };
  };
  const fire = dashWith({ fireTrail: true }, [300, 262]);
  const trail = fire.G.room.zones.filter((z) => z.from === 0 && z.look === 'fire');
  assert.ok(trail.length >= 4, `огней на пути: ${trail.length}`);
  runSteps(fire.G, 40);
  assert.ok(fire.m.burn > 0, 'стоящий у следа загорелся');
  const hp = fire.m.hp;
  runSteps(fire.G, 60);
  assert.ok(fire.m.hp < hp, 'и горит');
  runSteps(fire.G, 200);
  assert.equal(fire.G.room.zones.length, 0, 'след гаснет');

  const ice = dashWith({ iceDash: true });
  assert.ok(Math.abs(ice.m.freeze - DASH.freeze) < 0.2, `заморожен на ${ice.m.freeze}`);
  const web = dashWith({ slowDash: true });
  assert.ok(Math.abs(web.m.slow - DASH.slow) < 0.2);
  const plain = dashWith({});
  assert.deepEqual([plain.m.freeze, plain.m.slow, plain.G.room.zones.length], [0, 0, 0]);

  const boom = dashWith({ shockwave: true }, [200 + BASE.dashDist + 30, 250]);
  assert.equal(boom.m.hp, 1000 - DASH.shockDmg, 'в стороне от пути, но рядом с приземлением');
  assert.ok(of(boom.events, 'boom').length === 1);
  const quiet = dashWith({}, [200 + BASE.dashDist + 30, 250]);
  assert.equal(quiet.m.hp, 1000);
});

test('флаги касания: колючая броня и колючий ошейник', () => {
  REG.MOBS['test-biter'] = { name: 'Кусака', kind: 'hostile', hp: 100, r: 10, pts: 1, touch: 1, wave: false };
  const G = arena();
  put(G, 200, 240);
  wear(G, { flags: { thorns: true } });
  const m = spawnMob(G, 'test-biter', 210, 240, { warm: 0 });
  runSteps(G, 2);
  assert.equal(G.player.hp, BASE.maxHp - 1);
  assert.equal(m.hp, 100 - FLAG_DEFAULT.thorns, 'укусивший получил своё');
  runSteps(G, 30);
  assert.equal(m.hp, 100 - FLAG_DEFAULT.thorns, 'пока лиса неуязвима, шипы не бьют');

  const C = arena();
  put(C, 200, 240);
  wear(C, { flags: { contact: true } });
  cheat.god(C, true);
  const c = spawnMob(C, 'test-biter', 210, 240, { warm: 0 });
  runSteps(C, 61);
  assert.ok(c.hp <= 100 - 2 && c.hp >= 100 - 3, `ошейник за секунду: ${100 - c.hp}`);
  const none = arena();
  put(none, 200, 240);
  const n = spawnMob(none, 'test-biter', 210, 240, { warm: 0 });
  runSteps(none, 61);
  assert.equal(n.hp, 100);
});

test('флаги защиты: оберег комнаты, перо жар-птицы, споры, без отбрасывания, второе дыхание', () => {
  // roomBlock
  const G = arena({ door: true });
  const P = G.player;
  wear(G, { flags: { roomBlock: true } });
  P.blocks = P.st.flags.roomBlock;
  assert.equal(hurtPlayer(G, 2, 0, 0, 'touch'), false);
  assert.equal(P.hp, BASE.maxHp);
  assert.equal(of(drain(G), 'block').length, 1);
  P.inv = 0;
  assert.equal(hurtPlayer(G, 1, 0, 0, 'touch'), true, 'второй удар проходит');
  const d = G.room.doors.e;
  put(G, d.x - T, d.y);
  runUntil(G, (g) => g.room.id === 1, { seconds: 2, input: makeInput({ mx: 1 }) });
  assert.equal(P.blocks, 1, 'в новой комнате оберег снова цел');

  // revive
  const R = arena();
  const id = wear(R, { flags: { revive: true } });
  R.player.hp = 1;
  hurtPlayer(R, 3, 0, 0, 'touch');
  assert.deepEqual([R.lives, R.player.hp, R.player.down, R.over], [3, BASE.maxHp, 0, false]);
  assert.ok(!R.inv.acc.some((it) => it?.id === id), 'перо сгорело');
  assert.equal(R.player.st.flags.revive, false);
  R.player.inv = 0;
  R.player.hp = 1;
  hurtPlayer(R, 3, 0, 0, 'touch');
  assert.equal(R.lives, 2, 'второй раз не спасает');

  // sporeOnHit
  const S = arena();
  put(S, 200, 240);
  wear(S, { flags: { sporeOnHit: true } });
  const m = dummy(S, 230, 240);
  hurtPlayer(S, 1, 0, 0, 'touch');
  assert.ok(S.room.zones.some((z) => z.from === 0 && z.look === 'poison'));
  runSteps(S, 40);
  assert.ok(m.pstacks > 0 && m.hp < 1000, 'облако травит тех, кто рядом');

  // kbImmune
  const K = arena();
  wear(K, { flags: { kbImmune: true } });
  hurtPlayer(K, 1, K.player.x - 10, K.player.y, 'touch');
  assert.deepEqual([K.player.vx, K.player.vy], [0, 0]);

  // secondWind
  const W = arena();
  wear(W, { flags: { secondWind: true } });
  W.player.hp = 1;
  hurtPlayer(W, 1, 0, 0, 'touch');
  runUntil(W, (g) => g.player.down <= 0, { seconds: 2 });
  assert.ok(W.player.fx.haste > FOX.windTime - 0.1);
  assert.ok(Math.abs(W.player.st.speed - BASE.speed * 1.35) < 1e-9);
  assert.equal(W.player.shield, 2, 'и два щита');
  runSteps(W, FOX.windTime * 60 + 5);
  assert.deepEqual([W.player.st.speed, W.player.st.maxShield, W.player.shield], [BASE.speed, 0, 0]);
});

test('флаги стойкости: к замедлению, к облакам, к плохой земле', () => {
  // slowImmune: грязь не мешает, замедление не действует
  const mud = special(2);
  wear(mud, { flags: { slowImmune: true } });
  runSteps(mud, 12, makeInput({ mx: 1 }));
  assert.ok(Math.abs(mud.player.vx - BASE.speed) < 1e-6);
  assert.equal(addEffect(mud, 'slow', 3), false);
  const ice = special(3);
  wear(ice, { flags: { slowImmune: true } });
  step(ice, makeInput({ mx: 1 }));
  assert.ok(Math.abs(ice.player.vx - FOX.accel * H) < 1e-9, 'и на льду не скользит');

  // cloudImmune: ядовитое облако врага не вредит, обычная красная зона — вредит
  const cloud = (flags) => {
    const G = arena();
    put(G, 300, 240);
    wear(G, { flags });
    addZone(G, { x: 300, y: 240, r: 50, t: 0.05, dmg: 1, linger: 2, slow: 1, look: 'poison' });
    runSteps(G, 30);
    return G;
  };
  const safe = cloud({ cloudImmune: true });
  assert.deepEqual([safe.player.hp, safe.player.fx.slow], [BASE.maxHp, 0]);
  const hurt = cloud({});
  assert.equal(hurt.player.hp, BASE.maxHp - 1);
  assert.ok(hurt.player.fx.slow > 0, 'а без стойкости облако ещё и замедляет');
  const red = arena();
  put(red, 300, 240);
  wear(red, { flags: { cloudImmune: true } });
  addZone(red, { x: 300, y: 240, r: 50, t: 0.05, dmg: 1 });
  runSteps(red, 10);
  assert.equal(red.player.hp, BASE.maxHp - 1, 'от обычного удара стойкость к облакам не спасает');

  // floorImmune: колючки, горячее, грязь, лёд, капкан
  const thorn = arena({ tpl: 'forest-thicket' });
  put(thorn, tileX(4), tileY(3));
  wear(thorn, { flags: { floorImmune: true } });
  runSteps(thorn, 200);
  assert.equal(thorn.player.hp, BASE.maxHp);
  assert.equal(addEffect(thorn, 'root', 2), false, 'капкан не держит');
  const hot = special(4);
  wear(hot, { flags: { floorImmune: true } });
  runSteps(hot, 200);
  assert.equal(hot.player.hp, BASE.maxHp);
  const mud2 = special(2);
  wear(mud2, { flags: { floorImmune: true } });
  runSteps(mud2, 12, makeInput({ mx: 1 }));
  assert.ok(Math.abs(mud2.player.vx - BASE.speed) < 1e-6);
});

test('флаги добычи и боя: монеты и мана за кролика, сердце за убитых, двойной выстрел, медленные снаряды врагов', () => {
  const G = arena();
  const P = G.player;
  wear(G, { flags: { coinPerRabbit: 2, manaPerRabbit: true, killHeal: 3 } });
  P.mana = 50;
  const r = spawnMob(G, 'gold', 400, 300);
  put(G, 395, 300);
  runSteps(G, 2);
  assert.ok(r.dead);
  assert.equal(G.coins, 2, 'монеты за кролика — сразу в кошелёк (десять золотых ещё лежат)');
  assert.equal(P.mana, 50 + FLAG_DEFAULT.manaPerRabbit);
  // killHeal
  P.hp = 2;
  for (let i = 0; i < 2; i++) hurtMob(G, dummy(G, 100, 100, { hp: 1 }), 5, hitOf('shot'));
  assert.equal(P.hp, 2);
  hurtMob(G, dummy(G, 100, 100, { hp: 1 }), 5, hitOf('shot'));
  assert.equal(P.hp, 3, 'третий убитый — сердце');
  assert.equal(P.kills, 3);

  // dupShot
  const D = arena();
  cheat.give(D, 'pinecone');
  wear(D, { flags: { dupShot: 1 } });
  runSteps(D, 2, makeInput({ fire: true }));
  assert.equal(D.room.shots.length, 2, 'выстрел сдвоился');
  assert.ok(Math.abs(D.player.mana - (100 - REG.WEAPONS.pinecone.mana)) < 1e-9, 'а маны ушло как за один');
  const one = arena();
  cheat.give(one, 'pinecone');
  runSteps(one, 2, makeInput({ fire: true }));
  assert.equal(one.room.shots.length, 1);

  // projSlow
  const S = arena();
  wear(S, { flags: { projSlow: true } });
  const slow = fireShot(S, 1, 100, 100, 0, { speed: 200 }, 1);
  assert.ok(Math.abs(slow.vx - 200 * (1 - FLAG_DEFAULT.projSlow)) < 1e-9);
  const mine = fireShot(S, 0, 100, 100, 0, { speed: 200 }, 1);
  assert.equal(mine.vx, 200, 'свои выстрелы не замедляются');
});

test('флаги: светлячок бьёт ближнего врага; «глаз совы» открывает карту', () => {
  const G = arena();
  put(G, 200, 240);
  wear(G, { flags: { glowbug: true } });
  const near = dummy(G, 260, 240);
  const far = dummy(G, 420, 240);
  const ev = runSteps(G, 200);
  assert.ok(near.hp <= 1000 - 2 && near.hp >= 1000 - 4, `светлячок за 3,3 с: ${1000 - near.hp}`);
  assert.equal(far.hp, 1000, 'до дальнего не достаёт');
  assert.ok(of(ev, 'shot').some((e) => e.look === 'fx.bolt'));
  assert.ok(sounds(ev).includes('zap'));
  const none = arena();
  put(none, 200, 240);
  const m = dummy(none, 260, 240);
  runSteps(none, 200);
  assert.equal(m.hp, 1000);

  const run = newRun(5);
  assert.ok(run.map.rooms.some((r) => !r.seen));
  wear(run, { flags: { revealMap: true } });
  assert.ok(run.map.rooms.every((r) => r.seen));
  cheat.nextFloor(run);
  assert.ok(run.map.rooms.every((r) => r.seen), 'и на следующей локации тоже');
});

test('фокус и подбор: сердце не берётся при полных сердцах, мана — при полной мане', () => {
  const G = arena();
  const P = G.player;
  put(G, 200, 240);
  const heart = addPick(G, 'heart', 205, 240, 1, null, 0, false);
  const mana = addPick(G, 'mana', 205, 245, PICK.mana, null, 0, false);
  const coin = addPick(G, 'coin', 205, 235, 3, null, 0, false);
  const ev = runSteps(G, 40);
  assert.ok(G.room.picks.includes(heart) && G.room.picks.includes(mana), 'лишнее лежит');
  assert.ok(!G.room.picks.includes(coin));
  assert.equal(G.coins, 3);
  assert.deepEqual(of(ev, 'pick').map((e) => [e.kind, e.v]), [['coin', 3]]);
  assert.ok(sounds(ev).includes('coin'));
  P.hp = 3;
  P.mana = 50;
  const got = runSteps(G, 5);
  assert.equal(G.room.picks.length, 0);
  assert.deepEqual([P.hp, P.mana], [4, 50 + PICK.mana]);
  assert.ok(sounds(got).includes('heart') && sounds(got).includes('mana'));
  updateFocus(G);
  assert.equal(G.room.focus, null);
  // подбираемое с пометкой pull летит к лисе откуда угодно (его тащит спутник)
  G.room.vacuum = false;                                    // как в комнате, где ещё идёт охота
  const far = addPick(G, 'coin', 700, 400, 2, null, 0, false);
  runSteps(G, 60);
  assert.ok(G.room.picks.includes(far), 'обычная монета вдали лежит');
  far.pull = true;
  runUntil(G, (g) => !g.room.picks.includes(far), { seconds: 4 });
  assert.equal(G.coins, 5);
});
