// Лисья охота, партия целиком: новая партия и шаг (одно зерно и один ввод — одна и та же партия), карта локации
// (300 зёрен), рюкзак и вещи, сохранение и испорченные снимки, статистика, содержимое реестра, имена звуков и
// долгие прогоны игрока по сценарию — с неуязвимостью (партия идёт вперёд и ничего не ломается) и без неё
// (партия кончается).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { H, T, TILE, CAPS, REG, BIOMES, kindOf, rngFrom } from '../core.js';
import { BASE, FOX, roomCount } from '../balance.js';
import { validateTemplate, breakBush, hitTile } from '../world.js';
import { generateFloor, checkMap, pickTemplate, tplKind, biomeOf, loopOf } from '../floor.js';
import { hurtPlayer } from '../player.js';
import { giveItem, hasItem, takeGift, giftOptions, spend, itemPrice, ACC_SLOTS, BAG_SLOTS } from '../inventory.js';
import { enterRoom } from '../director.js';
import * as content from '../content.js';
import {
  VERSION, newRun, step, drain, snapshot, restore, isValidState, equip, unequip, dropItem, usePotion, chooseGift, itemInfo,
  runSummary, emptyStats, isValidStats, applyRun, cheat,
} from '../logic.js';
import { arena, put, makeInput, runSteps, runUntil, of, sounds, stateHash, findNaN, findOutside, createBot, playBot } from './helpers.js';

const HERE = new URL('..', import.meta.url);
const sources = () => readdirSync(HERE).filter((f) => f.endsWith('.js'));
const read = (file) => readFileSync(new URL(file, HERE), 'utf8');

/** Ввод по номеру шага: лиса бродит, время от времени делает рывок и стреляет. Одинаков для всех партий. */
function scripted(i, input) {
  input.mx = Math.sin(i / 37);
  input.my = Math.cos(i / 53);
  input.fire = i % 240 > 150;
  input.dash = i % 47 === 0;
  input.dx = Math.cos(i * 0.7);
  input.dy = Math.sin(i * 0.7);
  input.dp = (i % 5) / 4;
  input.act = i % 90 === 45;
  return input;
}
function play(G, steps, from = 0) {
  const input = makeInput();
  for (let i = from; i < from + steps; i++) {
    step(G, scripted(i, input));
    if (G.pending) chooseGift(G, 0);
    G.events.length = 0;
  }
  return G;
}

// ---------- новая партия и шаг ----------

test('новая партия: лиса у своей норы в первой комнате первой локации, всё на местах', () => {
  const G = newRun(2024);
  assert.equal(G.v, VERSION);
  assert.deepEqual([G.seed, G.floor, G.biome, G.loop, G.score, G.coins, G.lives, G.over, G.pending, G.time], [2024, 1, 'forest', 0, 0, 0, FOX.lives, false, null, 0]);
  assert.equal(G.room.type, 'start');
  assert.equal(G.map.cur, G.map.startId);
  assert.deepEqual(checkMap(G.map), []);
  const P = G.player;
  assert.deepEqual([P.hp, P.mana, P.shield, P.charges, P.act], [BASE.maxHp, BASE.maxMana, 0, 1, 'idle']);
  assert.deepEqual(G.inv, { weapon: null, armor: null, acc: [null, null, null], bag: Array(8).fill(null) });
  assert.deepEqual([G.gifts, G.minions, G.seen], [[], [], []]);
  assert.deepEqual(Object.keys(G.cnt).sort(), ['bosses', 'coins', 'dashes', 'donated', 'floors', 'hurt', 'items', 'kills', 'rabbits', 'rooms', 'tasks'].sort());
  assert.ok(Object.values(G.cnt).every((v) => v === 0));
  const ev = drain(G);
  assert.deepEqual(ev.filter((e) => ['room', 'floor', 'banner'].includes(e.t)).map((e) => e.t), ['room', 'floor', 'banner']);
  assert.deepEqual(of(ev, 'banner')[0], { t: 'banner', title: 'Локация 1', sub: 'Опушка', kind: 'floor' });
  assert.deepEqual(drain(G), [], 'очередь событий разобрана');
  // зерно: ноль и мусор заменяются, остальное — как есть
  assert.equal(newRun(0).seed, 1);
  assert.equal(newRun(-1).seed, 0xffffffff);
  assert.equal(newRun(7.9).seed, 7);
  assert.equal(newRun('пять').seed, 1);
  // с какой локации начать и сколько уже пожертвовано
  const deep = newRun(5, { floor: 7, donated: 120 });
  assert.deepEqual([deep.floor, deep.biome, deep.loop, deep.flags.donated], [7, 'swamp', 1, 120]);
  assert.equal(newRun(5, { floor: -3 }).floor, 1);
});

test('одно зерно и один ввод — одна и та же партия (3000 шагов); другое зерно — другая', () => {
  const a = play(newRun(31337), 3000);
  const b = play(newRun(31337), 3000);
  assert.equal(stateHash(a), stateHash(b));
  assert.deepEqual(runSummary(a), runSummary(b));
  assert.equal(a.rs, b.rs);
  assert.ok(a.time > 49.9, 'партия и правда шла');
  const c = play(newRun(31338), 3000);
  assert.notEqual(stateHash(a), stateHash(c));
  // и с неуязвимостью, через несколько комнат
  const run = (seed) => {
    const G = newRun(seed);
    cheat.god(G, true);
    const bot = createBot();
    playBot(G, bot, 60);
    return G;
  };
  const x = run(99);
  const y = run(99);
  assert.equal(stateHash(x), stateHash(y));
  assert.ok(x.map.rooms.filter((r) => r.seen).length >= 2);
});

test('шаг: кратен 1/60, разовые команды — только в первом; пустой, отрицательный и нечисловой шаг ничего не меняют', () => {
  const G = arena();
  put(G, 200, 240);
  step(G, makeInput({ mx: 1 }), H * 3);
  assert.ok(Math.abs(G.time - H * 3) < 1e-12);
  step(G, makeInput({ mx: 1 }), 5);
  assert.ok(Math.abs(G.time - H * 7) < 1e-12, 'за один вызов — не больше четырёх шагов');
  const before = stateHash(G);
  for (const dt of [0, -1, NaN]) step(G, makeInput({ mx: 1 }), dt);
  assert.equal(stateHash(G), before);
  step(G);
  assert.ok(Math.abs(G.time - H * 8) < 1e-12, 'без ввода — просто шаг');
  // рывок в четырёхшаговом вызове делается один раз
  const D = arena();
  put(D, 200, 240);
  D.player.st.dashCharges = 3;
  D.player.charges = 3;
  for (let i = 0; i < 30; i++) step(D, makeInput({ dash: true, dx: 1, dy: 0, dp: 0 }), H * 4);
  assert.ok(D.cnt.dashes <= 30 && D.cnt.dashes >= 2);
  step(null);
});

test('итог партии: счёт, локация, счётчики, время', () => {
  const G = play(newRun(4), 1200);
  const s = runSummary(G);
  assert.deepEqual(Object.keys(s), ['score', 'floor', 'biome', 'rabbits', 'kills', 'bosses', 'tasks', 'coins', 'time']);
  assert.deepEqual([s.score, s.floor, s.biome, s.rabbits, s.time], [G.score, 1, 'forest', G.cnt.rabbits, 20]);
});

// ---------- карта локации ----------

test('карта локации: 300 зёрен — связна, двери парные, начало и хозяин по одному, сундук и торговец есть всегда', () => {
  const sizes = new Set();
  let deadEnds = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const floor = 1 + (seed % 9);
    const map = generateFloor(seed * 7919, floor);
    assert.deepEqual(checkMap(map), [], `зерно ${seed}`);
    const { rooms } = map;
    const n = rooms.length;
    sizes.add(n);
    assert.ok(n >= 7 && n <= 12, `зерно ${seed}: комнат ${n}`);
    const lo = Math.min(9, 6 + floor);
    const hi = Math.min(12, 7 + floor);
    assert.ok(n >= lo && n <= hi, `локация ${floor}: комнат ${n}`);
    const count = (type) => rooms.filter((r) => r.type === type).length;
    assert.equal(count('start'), 1);
    assert.equal(count('boss'), 1);
    assert.equal(count('treasure'), 1);
    assert.equal(count('shop'), 1);
    assert.ok(count('hunt') >= 3, `зерно ${seed}: охот ${count('hunt')}`);
    const known = ['start', 'boss', 'treasure', 'shop', 'hunt'];
    for (const r of rooms) assert.ok(known.includes(r.type) || REG.PLACES[r.type], `зерно ${seed}: неизвестное место ${r.type}`);
    assert.deepEqual([map.cur, map.startId, map.entry, map.hunts], [0, 0, 'c', 0]);
    // расстояния от начала: хозяин — в самом дальнем тупике
    const dist = Array(n).fill(-1);
    dist[0] = 0;
    const queue = [0];
    for (let head = 0; head < queue.length; head++) {
      for (const to of Object.values(rooms[queue[head]].doors)) {
        if (to >= 0 && dist[to] < 0) {
          dist[to] = dist[queue[head]] + 1;
          queue.push(to);
        }
      }
    }
    assert.ok(dist.every((d) => d >= 0), 'до каждой комнаты можно дойти');
    const doors = (r) => Object.values(r.doors).filter((to) => to >= 0).length;
    const boss = rooms[map.bossId];
    assert.equal(doors(boss), 1, 'хозяин — в тупике');
    assert.ok(dist[boss.id] >= 2);
    for (const r of rooms) {
      if (r.id !== 0 && doors(r) === 1) {
        deadEnds += 1;
        assert.ok(dist[r.id] <= dist[boss.id], `зерно ${seed}: тупик ${r.id} дальше хозяина`);
      }
      assert.ok(Math.abs(r.gx) <= 4 && Math.abs(r.gy) <= 4, 'карта помещается на мини-карте 9×9');
      assert.deepEqual([r.state, r.data], ['new', {}]);
      assert.ok(r.mod === null || Object.hasOwn(REG.MODS, r.mod), 'условие комнаты — из списка');
      assert.ok(r.mod === null || (r.type === 'hunt' && floor >= 2), 'условия — только охотничьим комнатам со 2-й локации');
      assert.equal(r.seen, r.id === 0);
      const tpl = REG.ROOM_BY_ID[r.tpl];
      assert.equal(tpl.kind, tplKind(r.type));
      if (r.type === 'shop') assert.equal(tpl.place, 'shop');
      if (r.type === 'treasure') assert.equal(tpl.place, undefined);
    }
  }
  assert.ok(sizes.size >= 5, `размеры локаций разные: ${[...sizes].sort()}`);
  assert.ok(deadEnds > 300 * 2, 'тупиков хватает');
});

test('карта локации: одно зерно — одна карта; разные локации одной партии — разные', () => {
  assert.deepEqual(generateFloor(555, 3), generateFloor(555, 3));
  assert.notDeepEqual(generateFloor(555, 3).rooms.map((r) => [r.gx, r.gy, r.type]), generateFloor(555, 4).rooms.map((r) => [r.gx, r.gy, r.type]));
  assert.notDeepEqual(generateFloor(555, 3).rooms.map((r) => [r.gx, r.gy]), generateFloor(556, 3).rooms.map((r) => [r.gx, r.gy]));
  assert.deepEqual([1, 5, 6, 10, 11].map(biomeOf), ['forest', 'autumn', 'forest', 'autumn', 'forest']);
  assert.deepEqual([1, 5, 6, 10, 11].map(loopOf), [0, 0, 1, 1, 2]);
  for (let f = 1; f <= 12; f++) for (let s = 1; s <= 30; s++) assert.ok(roomCount(f, rngFrom(s)) >= 7 && roomCount(f, rngFrom(s)) <= 12);
});

test('карта локации: новое место из реестра само попадает на карту — генератор править не надо', () => {
  REG.PLACES['test-altar'] = { name: 'Алтарь', weight: 3, build() {} };
  REG.PLACES['test-late'] = { name: 'Позже', weight: 3, minFloor: 4, build() {} };
  REG.PLACES['test-guest'] = { name: 'У хозяина', spot: 'boss', build() {} };
  let seen = 0;
  let late = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const floor = 2 + (seed % 4);
    const map = generateFloor(seed, floor);
    assert.deepEqual(checkMap(map), []);
    const types = map.rooms.map((r) => r.type);
    assert.ok(!types.includes('test-guest'), 'место «у хозяина» своей комнаты не получает');
    assert.ok(types.filter((t) => t === 'test-altar').length <= 1, 'одно место — не больше раза за локацию');
    assert.ok(types.filter((t) => t === 'hunt').length >= 3);
    assert.ok(types.includes('treasure') && types.includes('shop'));
    if (types.includes('test-altar')) {
      seen += 1;
      assert.equal(REG.ROOM_BY_ID[map.rooms[types.indexOf('test-altar')].tpl].kind, 'place');
    }
    if (types.includes('test-late')) {
      late += 1;
      assert.ok(floor >= 4);
    }
  }
  assert.ok(seen > 40, `новое место появилось в ${seen} локациях из 200`);
  assert.ok(late > 10);
  // в комнату нового места можно войти: боя нет, двери открыты
  const G = newRun(3, { floor: 5 });
  const mr = G.map.rooms.find((r) => r.type === 'test-altar') ?? G.map.rooms.find((r) => r.type === 'treasure');
  enterRoom(G, mr.id, 'c');
  assert.deepEqual([G.room.dir.mode, G.room.open, mr.state], ['cleared', true, 'cleared']);
  for (const id of ['test-altar', 'test-late', 'test-guest']) delete REG.PLACES[id];
  assert.deepEqual(checkMap(generateFloor(3, 5)), []);
});

test('шаблон комнаты подбирается по виду, месту (биому) и локации; чужое место обходится здешними', () => {
  const r = rngFrom(1);
  for (let k = 0; k < 50; k++) {
    assert.equal(REG.ROOM_BY_ID[pickTemplate('hunt', 'forest', 1, r)].kind, 'hunt');
    assert.equal(REG.ROOM_BY_ID[pickTemplate('hunt', 'cave', 4, r)].kind, 'hunt', 'у пещер свои шаблоны');
    assert.equal(pickTemplate('place', 'forest', 1, r, 'shop'), 'forest-shop');
    assert.equal(pickTemplate('place', 'forest', 1, r, 'treasure'), 'forest-nook');
    assert.equal(pickTemplate('boss', 'taiga', 3, r), 'taiga-arena');
    assert.equal(pickTemplate('start', 'swamp', 2, r), 'swamp-start');
    assert.equal(pickTemplate('place', 'cave', 4, r, 'shop'), 'cave-shop');
  }
  assert.equal(pickTemplate('нет такого вида', 'forest', 1, r), null);
  const kinds = new Set(Array.from({ length: 200 }, () => pickTemplate('hunt', 'forest', 1, r)));
  assert.ok(kinds.size >= 3, 'охотничьи шаблоны чередуются');
});

test('проверка карты ловит порчу: непарные двери, двери не к соседу, два начала, отрезанная комната', () => {
  const good = () => generateFloor(42, 2);
  const broken = (change) => {
    const m = good();
    change(m);
    return m;
  };
  const a = good().rooms.find((r) => Object.values(r.doors).filter((x) => x >= 0).length >= 2);
  const side = Object.keys(a.doors).find((s) => a.doors[s] >= 0);
  const cases = [
    null, {}, { rooms: [] }, { rooms: 'нет' },
    broken((m) => { m.rooms[a.id].doors[side] = -1; }),
    broken((m) => { m.rooms[a.id].doors[side] = 99; }),
    broken((m) => { m.rooms[a.id].doors[side] = a.id; }),
    broken((m) => { const far = m.rooms.find((r) => r.id !== a.id && !Object.values(a.doors).includes(r.id)); m.rooms[a.id].doors[side] = far.id; }),
    broken((m) => { m.rooms[1].id = 5; }),
    broken((m) => { m.rooms[1].gx = m.rooms[0].gx; m.rooms[1].gy = m.rooms[0].gy; }),
    broken((m) => { m.rooms[1].gx = 1.5; }),
    broken((m) => { m.rooms[2].type = 'start'; }),
    broken((m) => { m.rooms[m.bossId].type = 'hunt'; }),
    broken((m) => { m.bossId = 0; }),
    broken((m) => { m.startId = 1; }),
    broken((m) => { m.rooms[1].tpl = 'нет такого'; }),
    broken((m) => { m.rooms[1].tpl = 'forest-arena'; m.rooms[1].type = 'hunt'; }),
    broken((m) => { m.rooms[1].type = 'дворец'; }),
    broken((m) => { m.rooms[1].flip = 4; }),
    broken((m) => { delete m.rooms[1].doors; }),
    broken((m) => { m.rooms.pop(); }),
  ];
  for (const [k, m] of cases.entries()) assert.ok(checkMap(m).length > 0, `случай ${k}`);
  assert.deepEqual(checkMap(good()), []);
});

// ---------- рюкзак ----------

test('рюкзак: подобранное надевается в свободную ячейку, иначе — в рюкзак; надеть, снять, выбросить', () => {
  const G = arena();
  drain(G);
  assert.equal(giveItem(G, { id: 'pinecone' }), 'equip');
  assert.equal(giveItem(G, { id: 'claws', lvl: 2 }), 'bag');
  assert.equal(giveItem(G, { id: 'vest' }), 'equip');
  assert.equal(giveItem(G, { id: 'fang' }), 'equip');
  assert.equal(giveItem(G, { id: 'heal' }), 'bag', 'зелья — только в рюкзак');
  assert.deepEqual(G.inv.weapon, { id: 'pinecone', lvl: 0 });
  assert.deepEqual(G.inv.armor, { id: 'vest', lvl: 0 });
  assert.deepEqual(G.inv.acc, [{ id: 'fang', lvl: 0 }, null, null]);
  assert.deepEqual(G.inv.bag.slice(0, 3), [{ id: 'claws', lvl: 2 }, { id: 'heal', lvl: 0 }, null]);
  assert.equal(G.player.st.maxShield, 1);
  assert.equal(G.player.st.dashDmg, BASE.dashDmg + 2);
  assert.deepEqual(G.seen, ['pinecone', 'claws', 'vest', 'fang', 'heal']);
  assert.equal(G.cnt.items, 5);
  let ev = drain(G);
  assert.deepEqual(of(ev, 'item').map((e) => [e.id, e.how]).slice(0, 2), [['pinecone', 'equip'], ['claws', 'bag']]);
  assert.ok(of(ev, 'ui').length >= 5 && sounds(ev).includes('pick'));
  assert.ok(hasItem(G, 'claws') && hasItem(G, 'vest') && hasItem(G, 'fang') && !hasItem(G, 'magnet'));
  // надеть из рюкзака: старое ложится на то же место
  assert.equal(equip(G, 0), true);
  assert.deepEqual([G.inv.weapon, G.inv.bag[0]], [{ id: 'claws', lvl: 2 }, { id: 'pinecone', lvl: 0 }]);
  ev = drain(G);
  assert.ok(sounds(ev).includes('equip') && of(ev, 'ui').length === 1);
  assert.equal(equip(G, 1), false, 'зелье не надеть');
  assert.equal(equip(G, 5), false, 'пустая ячейка');
  assert.equal(equip(G, 99), false);
  // снять
  assert.equal(unequip(G, 'armor'), true);
  assert.equal(G.inv.armor, null);
  assert.equal(G.player.st.maxShield, 0);
  assert.deepEqual(G.inv.bag[2], { id: 'vest', lvl: 0 });
  assert.equal(unequip(G, 'armor'), false, 'снимать нечего');
  assert.equal(unequip(G, 'bag', 0), false);
  assert.equal(unequip(G, 'acc', 0), true);
  assert.equal(G.player.st.dashDmg, BASE.dashDmg);
  // выбросить: вещь лежит рядом и её можно взять снова
  assert.equal(dropItem(G, 'weapon'), true);
  assert.equal(G.inv.weapon, null);
  const p = G.room.picks.find((x) => x.kind === 'item');
  assert.deepEqual([p.id, p.lvl], ['claws', 2]);
  assert.ok(Math.hypot(p.x - G.player.x, p.y - G.player.y) < 30);
  assert.equal(dropItem(G, 'weapon'), false);
  assert.equal(dropItem(G, 'bag', 7), false);
  assert.equal(dropItem(G, 'пояс', 0), false);
  runSteps(G, 2, makeInput({ act: true }));
  assert.ok(G.room.picks.includes(p), 'только что выброшенное тем же нажатием не подбирается');
  runSteps(G, 60);
  runSteps(G, 2, makeInput({ act: true }));
  assert.deepEqual(G.inv.weapon, { id: 'claws', lvl: 2 }, 'уровень вещи сохранился');
});

test('рюкзак полон: новая вещь меняется с надетой того же вида, старая падает на землю; зелье не берётся', () => {
  REG.ACCESSORIES['test-bead'] = { name: 'Бусина', rarity: 0, drop: false };
  const G = arena();
  put(G, 300, 240);
  giveItem(G, { id: 'pinecone' });
  giveItem(G, { id: 'vest' });
  for (const id of ['fang', 'twintail', 'magnet']) giveItem(G, { id });
  for (let i = 0; i < BAG_SLOTS; i++) assert.equal(giveItem(G, { id: 'heal' }), 'bag');
  assert.ok(G.inv.bag.every(Boolean));
  drain(G);
  // оружие
  assert.equal(giveItem(G, { id: 'shroombomb' }, 320, 240), 'swap');
  assert.equal(G.inv.weapon.id, 'shroombomb');
  let fallen = G.room.picks.filter((p) => p.kind === 'item').map((p) => p.id);
  assert.deepEqual(fallen, ['pinecone']);
  // украшение — с первой ячейкой
  assert.equal(giveItem(G, { id: 'test-bead' }, 320, 240), 'swap');
  assert.equal(G.inv.acc[0].id, 'test-bead');
  fallen = G.room.picks.filter((p) => p.kind === 'item').map((p) => p.id);
  assert.deepEqual(fallen, ['pinecone', 'fang']);
  assert.equal(G.player.st.dashDmg, BASE.dashDmg, 'клык снят — урон рывка прежний');
  // зелье
  const ev0 = drain(G);
  assert.equal(of(ev0, 'item').filter((e) => e.how === 'swap').length, 2);
  assert.equal(giveItem(G, { id: 'heal' }), false);
  const ev = drain(G);
  assert.ok(sounds(ev).includes('deny') && of(ev, 'toast').some((e) => e.s === 'Рюкзак полон'));
  assert.equal(unequip(G, 'weapon'), false, 'снять некуда');
  assert.equal(G.inv.weapon.id, 'shroombomb');
  // с земли при полном рюкзаке
  const p = G.room.picks.find((x) => x.id === 'pinecone');
  p.t = 1;
  put(G, p.x, p.y);
  runSteps(G, 2);
  runSteps(G, 2, makeInput({ act: true }));
  assert.equal(G.inv.weapon.id, 'pinecone');
  assert.ok(G.room.picks.some((x) => x.id === 'shroombomb'), 'прежнее оружие упало на землю');
  // украшения: в рюкзаке — надеть в выбранную ячейку
  G.inv.bag[3] = { id: 'fang', lvl: 0 };
  assert.equal(equip(G, 3, 2), true);
  assert.equal(G.inv.acc[2].id, 'fang');
  assert.equal(G.inv.bag[3].id, 'magnet', 'то, что было в ячейке, легло в рюкзак');
  G.inv.acc[1] = null;
  G.inv.bag[4] = { id: 'twintail', lvl: 0 };
  assert.equal(equip(G, 4), true);
  assert.equal(G.inv.acc[1].id, 'twintail', 'свободная ячейка занимается первой');
  assert.equal(G.inv.bag[4], null);
  assert.equal(ACC_SLOTS, 3);
});

test('зелье лечения: возвращает все сердца и тратится; здоровой лисе не нужно', () => {
  const G = arena();
  giveItem(G, { id: 'heal' });
  drain(G);
  assert.equal(usePotion(G, 0), false, 'сердца целы — зелье не тратится');
  assert.ok(sounds(drain(G)).includes('deny'));
  assert.ok(G.inv.bag[0]);
  G.player.hp = 1;
  assert.equal(usePotion(G, 0), true);
  assert.equal(G.player.hp, BASE.maxHp);
  assert.equal(G.inv.bag[0], null);
  const ev = drain(G);
  assert.ok(sounds(ev).includes('potion') && sounds(ev).includes('heal') && of(ev, 'ui').length === 1);
  assert.equal(usePotion(G, 0), false);
  giveItem(G, { id: 'fang' });
  G.inv.bag[1] = G.inv.acc[0];
  assert.equal(usePotion(G, 1), false, 'клык — не зелье');
});

test('дары леса: навсегда до конца партии; три разных на выбор — сначала те, которых нет', () => {
  const G = arena({ seed: 12 });
  assert.equal(takeGift(G, 'vigor'), true);
  assert.deepEqual([G.player.st.maxHp, G.player.hp], [6, 6], 'сердце добавлено и сразу полное');
  assert.equal(takeGift(G, 'pounce'), true);
  assert.equal(G.player.st.dashCharges, 2);
  assert.equal(takeGift(G, 'swift'), true);
  assert.ok(Math.abs(G.player.st.speed - BASE.speed * 1.1) < 1e-9);
  assert.equal(takeGift(G, 'нет такого'), false);
  assert.deepEqual(G.gifts, ['vigor', 'pounce', 'swift']);
  const fresh = arena({ seed: 12 });
  const all = Object.keys(REG.GIFTS);
  const opts = giftOptions(fresh, 3);
  assert.equal(new Set(opts).size, Math.min(3, all.length));
  fresh.gifts.push(opts[0]);
  REG.GIFTS['test-new'] = { name: 'Новый' };
  for (let k = 0; k < 20; k++) assert.ok(giftOptions(fresh, 1)[0] !== opts[0] || all.length < 2, 'взятый дар предлагается последним');
  delete REG.GIFTS['test-new'];
  assert.equal(chooseGift(G, 0), false, 'выбора сейчас нет');
  // «дар», который выдаёт только место (плата ворону), на выбор не предлагается
  REG.GIFTS['test-pact'] = { name: 'Уговор', offer: false, add: { maxHp: -1 } };
  for (let k = 0; k < 30; k++) assert.ok(!giftOptions(arena({ seed: k + 1 }), 3).includes('test-pact'));
  const pact = newRun(5);
  assert.equal(takeGift(pact, 'test-pact'), true);
  assert.deepEqual([pact.player.st.maxHp, pact.player.hp], [4, 4], 'сердце ушло насовсем');
  assert.ok(isValidState(JSON.parse(JSON.stringify(snapshot(pact)))));
  delete REG.GIFTS['test-pact'];
});

test('карточка вещи: имя, редкость и числа, которые важны игроку', () => {
  const pine = itemInfo({ id: 'pinecone' });
  assert.deepEqual([pine.kind, pine.name, pine.rarity], ['weapon', 'Шишкомёт', 0]);
  assert.deepEqual(pine.lines, ['Урон 3 · Мана 2 · 3,1 выстр./с']);
  assert.ok(pine.desc.length > 5);
  assert.deepEqual(itemInfo({ id: 'pinecone', lvl: 2 }).lines, ['Урон 4,5 · Мана 2 · 3,1 выстр./с', 'Заточка +2']);
  assert.deepEqual(itemInfo({ id: 'claws' }).lines, ['Урон 3 · Без маны · 2,4 выстр./с']);
  assert.deepEqual(itemInfo({ id: 'vest' }).lines, ['Щит 1']);
  assert.deepEqual(itemInfo({ id: 'fang' }).lines, ['Урон рывка +2']);
  assert.deepEqual(itemInfo({ id: 'twintail' }).lines, ['Заряды рывка +1']);
  assert.deepEqual(itemInfo({ id: 'magnet' }).lines, ['Радиус подбора +150 %']);
  assert.deepEqual(itemInfo({ id: 'heal' }).lines, []);
  assert.equal(itemInfo({ id: 'heal' }).kind, 'potion');
  assert.equal(itemInfo({ id: 'нет такой' }), null);
  assert.equal(itemInfo(null), null);
  REG.WEAPONS['test-info'] = { name: 'Проба', rarity: 3, dmg: 12, mana: 9, cd: 0.05, pattern: 'beam', shot: { burn: 2, slow: 1 }, drop: false };
  REG.WEAPONS['test-fan'] = { name: 'Веер', rarity: 1, dmg: 2, mana: 4, cd: 0.5, pattern: 'spread', shot: { n: 5 }, drop: false };
  REG.ARMOR['test-robe'] = { name: 'Мантия', rarity: 2, shield: 2, add: { maxMana: 20, crit: 0.1, hazardCut: 1, warn: 0.4 }, mul: { speed: 0.92, shieldRegen: 2 }, drop: false };
  assert.deepEqual(itemInfo({ id: 'test-info' }).lines, ['Урон 12/с · Мана 9/с', 'Поджигает, замедляет']);
  assert.deepEqual(itemInfo({ id: 'test-fan' }).lines, ['Урон 2 ×5 · Мана 4 · 2 выстр./с']);
  assert.deepEqual(itemInfo({ id: 'test-robe' }).lines, [
    'Щит 2', 'Запас маны +20', 'Шанс двойного урона +10 %', 'Урон от напастей −1', 'Напасти видны раньше +0,4 с', 'Скорость −8 %', 'Восстановление щита +100 %',
  ]);
  assert.equal(itemInfo({ id: 'test-robe' }).rarity, 2);
  for (const id of ['test-info', 'test-fan']) delete REG.WEAPONS[id];
  delete REG.ARMOR['test-robe'];
});

test('деньги: плата проходит, только если монет хватает; цена растёт с локацией и редкостью', () => {
  const G = arena();
  G.coins = 10;
  assert.equal(spend(G, 11), false);
  assert.equal(G.coins, 10);
  assert.ok(sounds(drain(G)).includes('deny'));
  assert.equal(spend(G, 10), true);
  assert.equal(G.coins, 0);
  const cheap = itemPrice(G, { id: 'pinecone' });
  const rare = itemPrice(G, { id: 'shroombomb' });
  assert.ok(rare > cheap && cheap >= 10);
  const deep = arena({ floor: 6 });
  assert.ok(itemPrice(deep, { id: 'pinecone' }) > cheap);
  assert.ok(itemPrice(G, { id: 'pinecone', lvl: 2 }) > cheap, 'заточенное дороже');
});

// ---------- сохранение ----------

/** Партия, прошедшая несколько комнат: с вещами, даром, спутником и следами в комнатах. */
function seasoned(seed = 777) {
  const G = newRun(seed);
  cheat.god(G, true);
  playBot(G, createBot(), 75);
  cheat.god(G, false);
  cheat.give(G, 'vest');
  cheat.give(G, 'fang');
  cheat.give(G, 'heal');
  cheat.give(G, 'swift');
  cheat.give(G, 'hedgie');
  G.coins += 40;
  drain(G);
  return G;
}

test('снимок — чистые данные без живой комнаты; из него партия продолжается с того же', () => {
  const G = seasoned();
  const snap = snapshot(G);
  const text = JSON.stringify(snap);
  assert.deepEqual(JSON.parse(text), snap, 'переживает JSON');
  assert.ok(text.length < 12000, `снимок ${text.length} байт`);
  assert.ok(isValidState(snap));
  assert.deepEqual(Object.keys(snap).sort(), ['biome', 'cnt', 'coins', 'flags', 'floor', 'gifts', 'inv', 'lives', 'loop', 'map', 'minions', 'over', 'pending', 'player', 'rs', 'score', 'seed', 'seen', 'time', 'v'].sort());
  assert.ok(!('room' in snap) && !('events' in snap) && !('st' in snap.player) && !('dash' in snap.player) && !('aim' in snap.player));
  const R = restore(JSON.parse(text));
  assert.ok(R);
  assert.deepEqual(
    [R.seed, R.rs, R.time, R.floor, R.biome, R.score, R.coins, R.lives, R.cnt, R.gifts, R.minions, R.inv, R.seen, R.flags],
    [G.seed, G.rs, G.time, G.floor, G.biome, G.score, G.coins, G.lives, G.cnt, G.gifts, G.minions, G.inv, G.seen, G.flags],
  );
  assert.deepEqual([R.player.hp, R.player.mana, R.player.shield, R.player.charges], [G.player.hp, G.player.mana, G.player.shield, G.player.charges]);
  assert.deepEqual(R.player.st, G.player.st, 'характеристики пересчитаны из вещей');
  assert.deepEqual([R.map.cur, R.map.entry, R.room.id, R.room.type], [G.map.cur, G.map.entry, G.room.id, G.room.type]);
  assert.equal(R.room.pals.length, 1, 'спутник на месте');
  const ev = drain(R);
  assert.ok(of(ev, 'room').length === 1 && of(ev, 'floor')[0].resumed === true);
  assert.equal(of(ev, 'banner').length, 0, 'плашка локации при возвращении не нужна');
  assert.equal(snapshot(null), null);
  // снимок от живой партии не зависит
  G.inv.bag.fill(null);
  G.map.rooms[0].data.x = 1;
  assert.ok(isValidState(snap));
  assert.ok(snap.inv.bag.some(Boolean));
});

test('сохранение у входа в комнату: загруженная партия идёт точно так же, как шла бы без загрузки', () => {
  for (const seed of [11, 222, 3333]) {
    const G = newRun(seed);
    cheat.god(G, true);
    const bot = createBot();
    // до первой смены комнаты после 20-й секунды
    let room = G.room.id;
    let guard = 0;
    while (guard++ < 60 * 200) {
      step(G, bot(G));
      G.events.length = 0;
      if (G.room.id !== room) {
        room = G.room.id;
        if (G.time > 20) break;
      }
    }
    assert.ok(G.time > 20 && guard < 60 * 200, `зерно ${seed}: комната сменилась`);
    const R = restore(JSON.parse(JSON.stringify(snapshot(G))));
    cheat.god(R, true);
    assert.equal(stateHash(R), stateHash(G), `зерно ${seed}: сразу после загрузки — то же состояние`);
    const input = makeInput();
    for (let i = 0; i < 1500; i++) {
      scripted(i, input);
      step(G, input);
      step(R, input);
      if (G.pending) chooseGift(G, 0);
      if (R.pending) chooseGift(R, 0);
    }
    assert.equal(stateHash(R), stateHash(G), `зерно ${seed}: через 25 секунд — то же состояние`);
    assert.equal(R.rs, G.rs);
  }
});

test('загрузка посреди охоты: комната начинается заново, лиса — у двери; в спокойной комнате лиса остаётся на месте', () => {
  const G = newRun(8);
  cheat.god(G, true);
  // войти в охоту через дверь и дождаться волны
  const bot = createBot();
  let guard = 0;
  while (!(G.room.type === 'hunt' && G.room.dir.mode === 'wave') && guard++ < 60 * 120) {
    step(G, bot(G));
    G.events.length = 0;
  }
  assert.equal(G.room.dir.mode, 'wave');
  const score = G.score;
  const snap = JSON.parse(JSON.stringify(snapshot(G)));
  assert.equal(snap.map.rooms[snap.map.cur].state, 'active');
  const R = restore(snap);
  const mr = R.map.rooms[R.map.cur];
  assert.deepEqual([mr.state, R.room.dir.mode, R.room.open, R.room.mobs.length], ['new', 'enter', true, 0]);
  assert.equal(R.score, score, 'заработанное остаётся');
  const door = R.room.doors[R.map.entry];
  assert.ok(Math.abs(Math.hypot(R.player.x - door.x, R.player.y - door.y) - T) < 1e-6, 'лиса снова у двери, через которую вошла');
  // спокойная комната: остаётся там, где стояла
  const C = newRun(8);
  runSteps(C, 40, makeInput({ mx: 1, my: 0.4 }));
  const at = [C.player.x, C.player.y];
  const back = restore(snapshot(C));
  assert.deepEqual([back.player.x, back.player.y], at);
  assert.equal(back.room.type, 'start');
  // лежит, потеряв жизнь: после загрузки — на ногах с полными сердцами
  const D = newRun(8);
  D.player.hp = 1;
  hurtPlayer(D, 1, 0, 0, 'touch');
  assert.ok(D.player.down > 0);
  const up = restore(snapshot(D));
  assert.deepEqual([up.lives, up.player.hp, up.player.down], [2, BASE.maxHp, 0]);
  // оконченную партию не сохранить
  D.lives = 1;
  D.player.down = 0;
  D.player.inv = 0;
  D.player.hp = 1;
  hurtPlayer(D, 1, 0, 0, 'touch');
  assert.ok(D.over);
  assert.equal(snapshot(D), null);
});

test('выбор дара переживает сохранение', () => {
  const G = newRun(3);
  cheat.god(G, true);
  cheat.warp(G, 'boss');
  cheat.clear(G);
  runUntil(G, (g) => g.pending, { seconds: 3 });
  const options = [...G.pending.options];
  const R = restore(JSON.parse(JSON.stringify(snapshot(G))));
  assert.deepEqual(R.pending, { kind: 'gift', options });
  const t = R.time;
  runSteps(R, 30, makeInput({ mx: 1 }));
  assert.equal(R.time, t, 'шаги ждут выбора');
  assert.equal(chooseGift(R, 2), true);
  assert.deepEqual(R.gifts, [options[2]]);
  assert.ok(R.room.things.some((x) => x.kind === 'portal') && R.room.things.some((x) => x.kind === 'chest'), 'портал и сундук хозяина на месте');
  assert.equal(R.map.rooms[R.map.cur].state, 'cleared');
  // сохранились раньше, чем дар был предложен, — после загрузки его предложат
  const E = newRun(3);
  cheat.god(E, true);
  cheat.warp(E, 'boss');
  cheat.clear(E);
  runSteps(E, 10);
  assert.equal(E.pending, null);
  const late = restore(JSON.parse(JSON.stringify(snapshot(E))));
  assert.equal(late.pending, null);
  runUntil(late, (g) => g.pending, { seconds: 3 });
  assert.equal(late.pending?.options.length, 3, 'дар не потерялся');
  chooseGift(late, 0);
  // и второй раз за того же хозяина его не дадут
  const again = restore(JSON.parse(JSON.stringify(snapshot(late))));
  runSteps(again, 200);
  assert.equal(again.pending, null);
  assert.equal(again.gifts.length, 1);
});

test('испорченное сохранение не принимается', () => {
  const G = seasoned(31);
  G.map.rooms[G.map.cur].data.note = { a: [1, 2, 'три'] };
  const good = JSON.parse(JSON.stringify(snapshot(G)));
  assert.ok(isValidState(good));
  assert.ok(restore(good));
  const broken = (change) => {
    const d = JSON.parse(JSON.stringify(good));
    change(d);
    return d;
  };
  const deep = (n) => (n ? { a: deep(n - 1) } : 1);
  const cases = [
    null, undefined, 5, 'x', [], {},
    broken((d) => { d.v = 99; }),
    broken((d) => { d.over = true; }),
    broken((d) => { d.seed = 0; }),
    broken((d) => { d.rs = -1; }),
    broken((d) => { d.rs = 1.5; }),
    broken((d) => { d.time = null; }),
    broken((d) => { d.time = -3; }),
    broken((d) => { d.floor = 0; }),
    broken((d) => { d.floor += 1; }),                         // место и круг с локацией не сходятся
    broken((d) => { d.biome = 'луна'; }),
    broken((d) => { d.loop = 3; }),
    broken((d) => { d.score = -5; }),
    broken((d) => { d.coins = 1.5; }),
    broken((d) => { d.lives = 0; }),
    broken((d) => { d.lives = 99; }),
    broken((d) => { d.pending = { kind: 'gift', options: [] }; }),
    broken((d) => { d.pending = { kind: 'gift', options: ['нет такого'] }; }),
    broken((d) => { d.pending = { kind: 'лотерея', options: ['vigor'] }; }),
    broken((d) => { delete d.player; }),
    broken((d) => { d.player.x = null; }),
    broken((d) => { d.player.y = 1e9; }),
    broken((d) => { d.player.face = 0; }),
    broken((d) => { d.player.hp = 0; }),
    broken((d) => { d.player.hp = 99; }),
    broken((d) => { d.player.hp = 2.5; }),
    broken((d) => { d.player.mana = -1; }),
    broken((d) => { d.player.mana = 'много'; }),
    broken((d) => { d.player.shield = 50; }),
    broken((d) => { d.player.charges = -1; }),
    broken((d) => { d.player.inv = NaN; }),
    broken((d) => { d.player.wcd = -2; }),
    broken((d) => { d.player.fx = { 'нет такого': 5 }; }),
    broken((d) => { d.player.fx = { haste: -1 }; }),
    broken((d) => { d.player.kills = -1; }),
    broken((d) => { delete d.inv; }),
    broken((d) => { d.inv.weapon = { id: 'vest' }; }),          // броня в ячейке оружия
    broken((d) => { d.inv.weapon = { id: 'нет такого' }; }),
    broken((d) => { d.inv.weapon = { id: 'pinecone', lvl: -1 }; }),
    broken((d) => { d.inv.weapon = { id: 'pinecone', hack: 1 }; }),
    broken((d) => { d.inv.armor = 'vest'; }),
    broken((d) => { delete d.inv.armor; }),
    broken((d) => { d.inv.acc = [null, null]; }),
    broken((d) => { d.inv.acc[1] = { id: 'pinecone' }; }),
    broken((d) => { d.inv.bag.push(null); }),
    broken((d) => { d.inv.bag[0] = { id: 'constructor' }; }),
    broken((d) => { d.gifts = ['vigor', 'нет такого']; }),
    broken((d) => { d.gifts = 'vigor'; }),
    broken((d) => { d.minions = [{ id: 'дракон', hp: 5 }]; }),
    broken((d) => { d.minions = [{ id: 'hedgie', hp: 0 }]; }),
    broken((d) => { d.minions = Array(5).fill({ id: 'hedgie', hp: 3 }); }),
    broken((d) => { delete d.map; }),
    broken((d) => { d.map.cur = 99; }),
    broken((d) => { d.map.cur = -1; }),
    broken((d) => { d.map.entry = 'x'; }),
    broken((d) => { const r = d.map.rooms[d.map.cur]; d.map.entry = ['n', 'e', 's', 'w'].find((s) => r.doors[s] < 0); }),
    broken((d) => { d.map.hunts = -1; }),
    broken((d) => { d.map.rooms[1].state = 'горит'; }),
    broken((d) => { d.map.rooms[1].seen = 1; }),
    broken((d) => { d.map.rooms[1].mod = 'нет такого'; }),
    broken((d) => { d.map.rooms[1].tpl = 'нет такого'; }),
    broken((d) => { d.map.rooms[1].data = null; }),
    broken((d) => { d.map.rooms[1].data = deep(9); }),
    broken((d) => { d.map.rooms[1].data = { big: 'x'.repeat(500) }; }),
    broken((d) => { d.map.rooms[1].data.left = [{ k: 'item', x: 10, y: 10, id: 'нет такого', lvl: 0 }]; }),
    broken((d) => { d.map.rooms[1].data.left = [{ k: 'heart', x: -5, y: 10, v: 1 }]; }),
    broken((d) => { d.map.rooms[1].data.left = Array(20).fill({ k: 'heart', x: 50, y: 50, v: 1 }); }),
    broken((d) => { d.map.rooms[d.map.cur].seen = false; }),
    broken((d) => { const r = d.map.rooms.find((x) => Object.values(x.doors).some((to) => to >= 0)); r.doors[Object.keys(r.doors).find((s) => r.doors[s] >= 0)] = -1; }),
    broken((d) => { d.map.rooms[2].type = 'start'; }),
    broken((d) => { d.map.bossId = 0; }),
    broken((d) => { d.map.rooms.length = 1; }),
    broken((d) => { delete d.cnt.rabbits; }),
    broken((d) => { d.cnt.kills = -2; }),
    broken((d) => { d.seen = ['pinecone', 'pinecone']; }),
    broken((d) => { d.seen = ['нет такого']; }),
    broken((d) => { d.flags = null; }),
    broken((d) => { d.flags = { f: undefined, g: () => 1 }; d.flags.h = Infinity; }),
  ];
  for (const [k, d] of cases.entries()) {
    assert.equal(isValidState(d), false, `случай ${k}`);
    assert.equal(restore(d), null, `случай ${k}`);
  }
  assert.ok(cases.length >= 75);
  // лишнее в данных места — не беда, пока это обычные данные
  assert.ok(isValidState(broken((d) => { d.map.rooms[1].data = { stock: [{ k: 'item', id: 'что-то новое', price: 5, sold: false }] }; })));
  assert.ok(restore(broken((d) => { d.map.rooms[1].data = { stock: [{ k: 'item', id: 'что-то новое', price: 5, sold: false }], opened: 1 }; })));
});

test('сохранённая лавка с вещью, которой больше нет, не роняет игру', () => {
  const G = newRun(15);
  cheat.warp(G, 'shop');
  const d = JSON.parse(JSON.stringify(snapshot(G)));
  d.map.rooms[d.map.cur].data.stock[0] = { k: 'item', id: 'снятая с игры вещь', price: 9, sold: false };
  d.map.rooms[d.map.cur].data.stock[1] = null;
  const R = restore(d);
  assert.ok(R);
  assert.equal(R.room.things.filter((t) => t.kind === 'pedestal').length, 3);
  runSteps(R, 30, makeInput({ mx: 1, fire: true }));
});

const bushesOf = (room) => [...room.tiles].flatMap((c, i) => (c === TILE.BUSH ? [i] : []));
const coinsOf = (room) => room.picks.filter((p) => p.kind === 'coin').length;

/** Настоящая охота, лиса — в охотничьей комнате с кустами (у своей норы). */
function bushyRun(seed = 3) {
  const G = newRun(seed);
  const mr = G.map.rooms.find((r) => r.type === 'hunt' && REG.ROOM_BY_ID[r.tpl].rows.join('').includes('b'));
  enterRoom(G, mr.id, 'c');
  drain(G);
  return G;
}

test('сломанный куст не вырастает: вышла и вернулась — на его месте земля, монет из него больше нет', () => {
  const G = arena({ tpl: 'forest-thicket', door: true });
  const all = bushesOf(G.room);
  assert.ok(all.length >= 3);
  const [a, b] = all;
  assert.ok(breakBush(G, a));
  hitTile(G, b, 1);
  hitTile(G, b, 1);
  assert.deepEqual(G.map.rooms[0].data.bush, [a, b]);
  enterRoom(G, 1, 'w');
  enterRoom(G, 0, 'e');
  assert.deepEqual(bushesOf(G.room), all.slice(2), 'вышла и зашла — куста нет');
  assert.equal(G.room.flags[a], 0, 'по месту куста можно ходить');
  assert.ok(!breakBush(G, a), 'ломать нечего');
  // фарма нет: сломала всё, потом 20 раз туда-обратно — ни одного куста и ни одной новой монеты
  for (const i of bushesOf(G.room)) breakBush(G, i);
  assert.deepEqual([...G.map.rooms[0].data.bush].sort((x, y) => x - y), all);
  let coins = 0;
  for (let k = 0; k < 20; k++) {
    enterRoom(G, 1, 'w');
    enterRoom(G, 0, 'e');
    assert.deepEqual(bushesOf(G.room), []);
    for (let i = 0; i < G.room.tiles.length; i++) breakBush(G, i);
    coins += coinsOf(G.room);
  }
  assert.equal(coins, 0);
  assert.equal(G.map.rooms[0].data.bush.length, all.length, 'список не растёт');
});

test('сломанные кусты переживают сохранение и загрузку', () => {
  const G = bushyRun();
  const id = G.map.cur;
  const all = bushesOf(G.room);
  assert.ok(all.length >= 2);
  breakBush(G, all[0]);
  const R = restore(JSON.parse(JSON.stringify(snapshot(G))));
  assert.ok(R);
  assert.equal(R.map.cur, id);
  assert.deepEqual(bushesOf(R.room), all.slice(1));
  assert.deepEqual(R.map.rooms[id].data.bush, [all[0]]);
});

test('кусты в сохранении: старое без списка — все на месте; кривой список не роняет игру', () => {
  const G = bushyRun();
  const id = G.map.cur;
  const all = bushesOf(G.room);
  const d = JSON.parse(JSON.stringify(snapshot(G)));
  assert.equal(d.map.rooms[id].data.bush, undefined, 'пока ничего не сломано, поля нет');
  assert.deepEqual(bushesOf(restore(d).room), all, 'старое сохранение — кусты на месте');
  const wall = G.room.tiles.indexOf(TILE.TALL);
  for (const bad of ['кусты', 7, null, true, { a: 1 }, [-1, 1.5, 99999, 'x', null, wall, all[0], all[0]]]) {
    const x = JSON.parse(JSON.stringify(d));
    x.map.rooms[id].data.bush = bad;
    const R = restore(x);
    assert.ok(R, JSON.stringify(bad));
    assert.deepEqual(bushesOf(R.room), Array.isArray(bad) ? all.slice(1) : all, JSON.stringify(bad));
    assert.ok(R.room.tiles.includes(TILE.TALL), 'стена осталась стеной');
    assert.ok(breakBush(R, all[1]));
    assert.ok(R.map.rooms[id].data.bush.includes(all[1]));
    runSteps(R, 20, makeInput({ mx: 1, fire: true }));
  }
});

// ---------- статистика ----------

test('статистика: партия добавляет своё, рекорд и самая дальняя локация — наибольшие', () => {
  assert.deepEqual(emptyStats(), { games: 0, best: 0, rabbits: 0, foes: 0, bosses: 0, rooms: 0, tasks: 0, coins: 0, deep: 0, donated: 0 });
  assert.ok(isValidStats(emptyStats()));
  const G = seasoned(5);
  G.cnt.donated = 15;
  const one = applyRun(emptyStats(), G);
  assert.ok(isValidStats(one));
  assert.deepEqual(one, {
    games: 1, best: G.score, rabbits: G.cnt.rabbits, foes: G.cnt.kills, bosses: G.cnt.bosses, rooms: G.cnt.rooms, tasks: G.cnt.tasks,
    coins: G.cnt.coins, deep: G.floor, donated: 15,
  });
  assert.ok(one.rabbits > 3 && one.rooms >= 1);
  const low = newRun(2);
  const two = applyRun(one, low);
  assert.deepEqual([two.games, two.best, two.rabbits, two.deep, two.donated], [2, one.best, one.rabbits, one.deep, 15]);
  const far = newRun(2, { floor: 9 });
  assert.equal(applyRun(two, far).deep, 9);
  assert.notEqual(applyRun(one, low), one, 'прежняя статистика не меняется');
  // поля сливаются между устройствами по одному: годится любой набор целых неотрицательных
  assert.ok(isValidStats({ games: 0, best: 999999999, rabbits: 0, foes: 7, bosses: 5000, rooms: 0, tasks: 3, coins: 0, deep: 400, donated: 1 }));
  for (const bad of [null, undefined, 5, [], {}, { ...emptyStats(), best: -1 }, { ...emptyStats(), games: 1.5 }, { ...emptyStats(), deep: '7' }, { ...emptyStats(), donated: NaN }]) {
    assert.equal(isValidStats(bad), false);
  }
  const partial = emptyStats();
  delete partial.tasks;
  assert.equal(isValidStats(partial), false);
});

// ---------- содержимое ----------

test('содержимое первого этапа на месте и собрано в реестр', () => {
  const { MOBS, WEAPONS, ARMOR, ACCESSORIES, POTIONS, GIFTS, EFFECTS, PLACES, TASKS, HAZARDS, MINIONS, MODS, ROOMS } = content;
  for (const id of ['rabbit', 'hare', 'gold', 'fat']) assert.equal(MOBS[id].kind, 'prey', id);
  for (const id of ['hedgehog', 'boar']) assert.equal(MOBS[id].kind, 'hostile', id);
  assert.equal(MOBS.bear.kind, 'boss');
  assert.deepEqual(content.mobIds('prey'), ['rabbit', 'hare', 'gold', 'fat']);
  assert.deepEqual(content.mobIds('boss').sort(), ['bear', 'moose', 'owl', 'spiderqueen', 'toad']);
  assert.deepEqual([WEAPONS.pinecone.pattern, WEAPONS.claws.pattern, WEAPONS.shroombomb.pattern], ['bullet', 'cone', 'lob']);
  assert.ok(ARMOR.vest && ACCESSORIES.fang && ACCESSORIES.twintail && ACCESSORIES.magnet && POTIONS.heal);
  assert.ok(GIFTS.vigor && GIFTS.pounce && GIFTS.swift);
  for (const id of ['slow', 'root', 'haste', 'rage', 'stone', 'wind']) assert.ok(EFFECTS[id], id);
  assert.ok(PLACES.treasure && PLACES.shop && PLACES.start && TASKS.stumps && HAZARDS.moose && HAZARDS.bear && MINIONS.hedgie);
  assert.equal(typeof MODS, 'object');
  assert.ok(ROOMS.length >= 7);
  assert.equal(content.MOBS, REG.MOBS);
  assert.equal(content.ROOMS, REG.ROOMS);
  assert.deepEqual(content.itemIds().sort(), [...Object.keys(WEAPONS), ...Object.keys(ARMOR), ...Object.keys(ACCESSORIES), ...Object.keys(POTIONS)].sort());
  // вещи: вид по id, редкость в пределах, описание есть
  for (const id of content.itemIds()) {
    const kind = kindOf(id);
    assert.ok(['weapon', 'armor', 'acc', 'potion'].includes(kind), id);
    const info = itemInfo({ id });
    assert.ok(info.name.length > 1 && info.rarity >= 0 && info.rarity <= 3, id);
    if (!id.startsWith('test-')) assert.ok(info.desc.length > 5, `${id}: нет описания`);
  }
  // звери: числа на месте
  for (const [id, d] of Object.entries(MOBS)) {
    if (id.startsWith('test-')) continue;
    assert.ok(d.name && ['prey', 'hostile', 'boss'].includes(d.kind), id);
    assert.ok(d.r > 0 && (d.kind === 'prey' || d.hp > 0) && d.pts >= 1, id);
    if (d.kind === 'hostile') assert.ok(typeof d.think === 'function' && d.cost >= 1 && BIOMES.includes(d.biome), id);
    if (d.kind === 'prey') assert.ok(d.speed > 0 && d.life > 0 && d.aware > 0 && d.tire > 0, id);
  }
  for (const tpl of ROOMS) assert.deepEqual(validateTemplate(tpl), [], tpl.id);
});

test('файлы содержимого объясняют свой формат: в начале каждого — описание записи и что можно звать', () => {
  const stubs = ['mobs.js', 'mobs2.js', 'bosses.js', 'hazards.js', 'weapons.js', 'items.js', 'rooms.js', 'places.js', 'quests.js', 'minions.js'];
  for (const file of stubs) {
    const text = read(file);
    const header = text.slice(0, text.indexOf('\nexport ') >= 0 ? text.indexOf('\nexport ') : text.length);
    const lines = header.split('\n').filter((l) => l.startsWith('//'));
    assert.ok(lines.length >= 6, `${file}: в начале должно быть описание`);
    assert.ok(/[а-яё]{4,}/i.test(header), `${file}: описание — по-русски`);
    assert.ok(!/import .*['"]\.\/(content|logic)\.js['"]/.test(text), `${file}: content.js и logic.js файлам содержимого подключать нельзя`);
  }
  assert.ok(read('ai.js').split('\n').slice(0, 80).filter((l) => l.includes('ai.')).length >= 30, 'в начале ai.js перечислены готовые действия');
});

test('расчёт не знает ни экрана, ни часов, ни случайности «со стороны»', () => {
  const engine = ['core.js', 'world.js', 'player.js', 'inventory.js', 'combat.js', 'patterns.js', 'ai.js', 'director.js', 'logic.js', 'floor.js', 'content.js', 'balance.js',
    'mobs.js', 'mobs2.js', 'bosses.js', 'hazards.js', 'weapons.js', 'items.js', 'rooms.js', 'places.js', 'quests.js', 'minions.js', 'tiles.js'];
  for (const file of engine) {
    const code = read(file).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')
      .replace(/\/\/.*$/gm, '');
    for (const bad of [/\bwindow\b/, /\bdocument\b/, /\bperformance\b/, /\bDate\b/, /Math\.random/, /\bsetTimeout\b/, /\brequestAnimationFrame\b/, /\blocalStorage\b/]) {
      assert.ok(!bad.test(code), `${file}: ${bad}`);
    }
    assert.ok(!/from ['"]\.\.\/\.\.\/shared\/motion\.js['"]/.test(code), `${file}: shared/motion.js расчёту нельзя`);
    for (const m of code.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(m[1].startsWith('./'), `${file}: подключает ${m[1]}`);
  }
});

// Имена звуков — общий список игры (03-presentation, «Audio»): расчёт зовёт только их.
const SOUND_NAMES = ('tap open close equip deny buy coin pick heart mana potion chest banner gift dash land hurt shield die respawn nomana '
  + 'catch escape hit crit kill bush stump spiky shot heavy spread bow magic zap beam lob boom ice fire swing trap warn moose paw growl spit spawn '
  + 'door lock clear task taskok taskfail boss bossdie floor gameover record hire altar well forge heal').split(' ');

test('звуки: расчёт зовёт их только через sfx(G, …) и только по именам из общего списка', () => {
  const used = new Map();
  for (const file of sources()) {
    const js = read(file);
    for (const re of [/\bsfx\(\s*G\s*,\s*'([a-z]+)'/g, /\bsfx:\s*'([a-z]+)'/g]) {
      for (const m of js.matchAll(re)) if (!used.has(m[1])) used.set(m[1], file);
    }
  }
  for (const [name, file] of used) assert.ok(SOUND_NAMES.includes(name), `${file}: звук «${name}», которого нет в списке`);
  // всё, за что отвечает расчёт, и правда звучит
  const mine = ['equip', 'deny', 'buy', 'coin', 'pick', 'heart', 'mana', 'potion', 'chest', 'banner', 'gift', 'dash', 'land', 'hurt', 'shield', 'die',
    'respawn', 'nomana', 'catch', 'escape', 'hit', 'crit', 'kill', 'bush', 'stump', 'spiky', 'shot', 'swing', 'lob', 'zap', 'boom', 'trap', 'warn', 'moose',
    'paw', 'growl', 'spit', 'spawn', 'door', 'lock', 'clear', 'task', 'taskok', 'taskfail', 'boss', 'bossdie', 'floor', 'gameover', 'hire', 'heal'];
  for (const name of mine) assert.ok(used.has(name), `звук «${name}» расчёт не зовёт`);
  assert.equal(new Set(SOUND_NAMES).size, SOUND_NAMES.length);
  // и ни один файл расчёта не шлёт событие звука в обход sfx
  for (const file of ['world.js', 'player.js', 'inventory.js', 'combat.js', 'patterns.js', 'ai.js', 'director.js', 'logic.js', 'places.js', 'quests.js', 'hazards.js', 'mobs.js', 'bosses.js', 'minions.js', 'items.js']) {
    assert.ok(!/t:\s*'sfx'/.test(read(file)), `${file}: событие звука собрано вручную`);
  }
});

// ---------- долгие прогоны ----------

test('игрок по сценарию, 20 партий по 5 минут с неуязвимостью: ничего не ломается, партия идёт вперёд', () => {
  let reached = 0;
  let cleared = 0;
  const slow = [];
  for (let seed = 1; seed <= 20; seed++) {
    const G = newRun(seed * 104729);
    cheat.god(G, true);
    const bot = createBot();
    let steps = 0;
    playBot(G, bot, 300, (g) => {
      steps += 1;
      const out = findOutside(g, CAPS);
      assert.equal(out, null, `зерно ${seed}, ${g.time.toFixed(1)} с: ${out}`);
      if (steps % 20 === 0) {
        const bad = findNaN(g);
        assert.equal(bad, null, `зерно ${seed}, ${g.time.toFixed(1)} с: ${bad}`);
      }
    });
    assert.equal(findNaN(G), null);
    assert.equal(G.over, false);
    assert.equal(G.lives, FOX.lives);
    assert.ok(G.time >= 299.9, `зерно ${seed}: прошло ${G.time}`);
    assert.ok(G.cnt.rooms >= 2, `зерно ${seed}: зачищено комнат ${G.cnt.rooms}`);
    assert.ok(G.cnt.rabbits >= 10, `зерно ${seed}: поймано ${G.cnt.rabbits}`);
    assert.ok(G.score > 20, `зерно ${seed}: счёт ${G.score}`);
    assert.ok(isValidState(JSON.parse(JSON.stringify(snapshot(G)))), `зерно ${seed}: снимок годен`);
    cleared += G.cnt.rooms;
    if (G.floor >= 2 && G.cnt.bosses >= 1) reached += 1;
    else slow.push(`${seed}: локация ${G.floor}, хозяев ${G.cnt.bosses}, комнат ${G.cnt.rooms}`);
  }
  assert.ok(reached >= 16, `до второй локации дошли ${reached} партий из 20; отстали — ${slow.join('; ')}`);
  assert.ok(cleared >= 20 * 4, `всего зачищено комнат: ${cleared}`);
});

test('хаотичный ввод и случайные действия с рюкзаком, отладкой и сохранением: расчёт не падает и не портится', () => {
  const items = content.itemIds().filter((id) => !id.startsWith('test-'));
  const gifts = Object.keys(REG.GIFTS).filter((id) => !id.startsWith('test-'));
  const junk = [NaN, undefined, null, 'лево', Infinity, -Infinity, {}, 1e9];
  let steps = 0;
  let loads = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const r = rngFrom(seed * 911);
    let G = newRun(seed * 13);
    const input = makeInput();
    let hold = 0;
    for (let i = 0; i < 60 * 60; i++) {
      if (hold-- <= 0) {
        hold = r.int(3, 50);
        const a = r.range(0, 6.3);
        const m = r.chance(0.2) ? 0 : r.chance(0.1) ? 40 : 1;
        Object.assign(input, {
          mx: Math.cos(a) * m, my: Math.sin(a) * m, fire: r.chance(0.5), aim: r.chance(0.2), ax: Math.cos(a), ay: Math.sin(a), ap: r(),
          hasT: r.chance(0.2), tx: r.range(-300, 1200), ty: r.range(-300, 900),
        });
      }
      Object.assign(input, { dash: r.chance(0.05), dx: r.range(-1, 1), dy: r.range(-1, 1), dp: r(), act: r.chance(0.05) });
      if (r.chance(0.02)) input[r.pick(['mx', 'my', 'ax', 'ay', 'ap', 'dx', 'dy', 'dp', 'tx', 'ty'])] = r.pick(junk);
      step(G, input, r.chance(0.05) ? 1 / 30 : undefined);
      drain(G);
      steps += 1;
      if (G.pending) chooseGift(G, r.int(0, 2));
      const k = r();
      if (k < 0.01) equip(G, r.int(-1, 9), r.int(-1, 3));
      else if (k < 0.02) unequip(G, r.pick(['weapon', 'armor', 'acc', 'bag', 'хвост']), r.int(-1, 3));
      else if (k < 0.025) dropItem(G, r.pick(['weapon', 'armor', 'acc', 'bag']), r.int(-1, 9));
      else if (k < 0.035) usePotion(G, r.int(-1, 9));
      else if (k < 0.04) cheat.give(G, r.pick(items));
      else if (k < 0.042) cheat.give(G, r.pick(gifts));
      else if (k < 0.044) cheat.give(G, 'hedgie');
      else if (k < 0.046) cheat.warp(G, r.pick(['hunt', 'boss', 'shop', 'treasure', 'start']));
      else if (k < 0.0465) cheat.nextFloor(G);
      else if (k < 0.048) cheat.spawn(G, r.pick(['hedgehog', 'boar', 'rabbit', 'hare', 'gold', 'fat', 'bear']));
      else if (k < 0.0485) cheat.clear(G);
      else if (k < 0.05) cheat.give(G, 'coins');
      else if (k < 0.052 && !G.over) {
        const snap = JSON.parse(JSON.stringify(snapshot(G)));
        assert.ok(isValidState(snap), `зерно ${seed}, шаг ${i}: снимок не годен`);
        G = restore(snap);
        assert.ok(G);
        loads += 1;
      }
      if (G.over) G = newRun(seed * 13 + i);
      const out = findOutside(G, CAPS);
      assert.equal(out, null, `зерно ${seed}, шаг ${i}: ${out}`);
      if (i % 40 === 0) assert.equal(findNaN(G), null, `зерно ${seed}, шаг ${i}`);
    }
  }
  assert.ok(steps === 16 * 3600 && loads > 50);
});

test('без неуязвимости беспечная лиса теряет все жизни: партия кончается, итог и статистика в порядке', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const G = newRun(seed * 31 + 5);
    const bot = createBot({ careless: true });
    const lives = [];
    playBot(G, bot, 600, (g) => {
      if (lives[lives.length - 1] !== g.lives) lives.push(g.lives);
      const out = findOutside(g, CAPS);
      assert.equal(out, null, `зерно ${seed}: ${out}`);
    });
    assert.equal(G.over, true, `зерно ${seed}: за 10 минут партия не кончилась (жизней ${G.lives}, комната ${G.room.type})`);
    assert.deepEqual(lives, [3, 2, 1, 0]);
    assert.equal(findNaN(G), null);
    assert.equal(snapshot(G), null);
    const s = runSummary(G);
    assert.ok(Number.isInteger(s.score) && s.score >= 0 && s.floor >= 1 && BIOMES.includes(s.biome) && s.time > 5);
    for (const k of ['rabbits', 'kills', 'bosses', 'tasks', 'coins', 'time']) assert.ok(Number.isInteger(s[k]) && s[k] >= 0, k);
    const stats = applyRun(emptyStats(), G);
    assert.ok(isValidStats(stats));
    assert.deepEqual([stats.games, stats.best, stats.deep], [1, G.score, G.floor]);
    assert.ok(G.cnt.hurt >= 15, 'каждое сердце каждой жизни кто-то снял');
    const t = G.time;
    step(G, makeInput({ mx: 1 }));
    assert.equal(G.time, t, 'после конца шаги ничего не делают');
  }
});
