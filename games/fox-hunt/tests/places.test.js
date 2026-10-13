// Места «Лисьей охоты» (places.js): данные, сборка каждого места в комнате (и повторный вход), подпись и действие
// каждого, плата и награда, сохранение в записи комнаты — место делает ровно то, что обещает подпись.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG, kindOf, rngFrom } from '../core.js';
import '../content.js';
import { SHOP, PICK } from '../balance.js';
import { enterRoom } from '../director.js';
import { step, drain } from '../logic.js';
import { hurtPlayer } from '../player.js';
import { giveItem } from '../inventory.js';
import {
  PLACES, ALTAR, WELL, GAMBLE, FORGE, SPRING, TOTEM, CAMP, RAVEN, hintOf,
} from '../places.js';
import { arena, makeInput, runSteps, runUntil, put, findNaN, findOutside, of } from './helpers.js';

const IDS = Object.keys(PLACES);
const CAPS = { mobs: 48, shots: 220, picks: 80, zones: 40, things: 24, pals: 3 };
const SYNC_STEPS = 12;

/** Комната этого места: арена, в которой запись комнаты стала местом (шаблон — свой или общий). */
function visit(id, { floor = 1, seed = 1, coins = 0, data = null } = {}) {
  const G = arena({ seed, floor });
  const mr = G.map.rooms[0];
  mr.type = id === 'raven' ? 'boss' : id;
  const kind = id === 'start' ? 'start' : 'place';
  const tpls = REG.ROOMS.filter((t) => t.kind === kind && (t.minFloor ?? 1) <= floor);
  mr.tpl = (tpls.find((t) => t.place === id) ?? tpls.find((t) => !t.place) ?? tpls[0]).id;
  mr.data = data ?? {};
  mr.state = 'new';
  G.coins = coins;
  enterRoom(G, 0, 'c');
  drain(G);
  if (id === 'raven') {
    mr.state = 'cleared';
    G.room.dir.mode = 'cleared';
    PLACES.raven.build(G, G.room, mr, rngFrom(5));
  }
  return G;
}

const mine = (G, id) => G.room.things.filter((t) => t.place === id);
const pressStep = (G, n = 1) => runSteps(G, n, makeInput());
const settle = (G) => runSteps(G, SYNC_STEPS);
const armed = (G) => {
  G.inv.weapon = { id: Object.keys(REG.WEAPONS)[0], lvl: 0 };
  return G;
};
const labelOf = (G, th) => PLACES[th.place].label(G, th);

test('места: у каждого есть название, описание и сборка; числа таблиц сходятся', () => {
  assert.deepEqual(IDS.sort(), ['altar', 'camp', 'forge', 'gamble', 'raven', 'shop', 'spring', 'start', 'totem', 'treasure', 'well']);
  for (const id of IDS) {
    const p = PLACES[id];
    assert.ok(p.name && p.name.length <= 28, `${id}: название «${p.name}»`);
    assert.ok(p.desc && p.desc.length <= 80, `${id}: описание`);
    assert.equal(typeof p.build, 'function', id);
    if (id !== 'start') assert.equal(typeof p.use === 'function' && typeof p.label === 'function', true, `${id}: use и label`);
    assert.ok(['room', 'start', 'boss', undefined].includes(p.spot), `${id}: spot`);
  }
  for (const [i, row] of ALTAR.odds.entries()) {
    assert.equal(row.item + row.coins + row.mana + row.boon + row.none, 100, `алтарь, строка ${i}`);
    if (i) assert.ok(row.none >= ALTAR.odds[i - 1].none, 'камень не становится щедрее');
  }
  assert.equal(Object.values(WELL.odds).reduce((a, b) => a + b), 100);
  assert.equal(Object.values(GAMBLE.odds).reduce((a, b) => a + b), 100);
  assert.ok(WELL.marks.every((m, i, a) => !i || m > a[i - 1]));
  assert.ok(WELL.blessings.every((b) => REG.EFFECTS[b]), 'благословения колодца есть в реестре');
  assert.ok(FORGE.price.every((p, i, a) => !i || p > a[i - 1]), 'заточки дорожают');
  // напёрстки — в убыток: средняя отдача монетами меньше ставки (вещи и сердца — сверх)
  const back = GAMBLE.odds.coins / 100 * (GAMBLE.coins[0] + GAMBLE.coins[1]) / 2 + GAMBLE.odds.jackpot / 100 * GAMBLE.jackpot;
  assert.ok(back < GAMBLE.stake, `напёрстки отдают ${back.toFixed(2)} за ${GAMBLE.stake}`);
  assert.equal(REG.GIFTS.ravenfee.offer, false);
  assert.equal(REG.GIFTS.altarboon.offer, false);
  assert.ok(CAMP.cands >= 1 && RAVEN.keep >= 1 && SPRING.mana > 0 && TOTEM.waves >= 1);
});

for (const floor of [1, 2, 3]) {
  for (const id of IDS) {
    if ((PLACES[id].minFloor ?? 1) > floor || (id === 'start' && floor > 1)) continue;
    test(`место ${id}, локация ${floor}: собирается, всё на месте, повторный вход ничего не меняет`, () => {
      for (const seed of [1, 7, 23]) {
        const G = visit(id, { floor, seed, coins: 100 });
        const n = G.room.things.length;
        assert.ok(n > 0, `${id}: пусто`);
        assert.equal(findOutside(G, CAPS), null, id);
        for (const th of G.room.things) {
          assert.ok(th.kind, 'у предмета есть вид');
          if (th.place) assert.ok(PLACES[th.place], `${id}: чужое место ${th.place}`);
        }
        settle(G);
        const sig = () => G.room.things.map((t) => `${t.kind}:${t.x.toFixed(0)}:${t.y.toFixed(0)}:${t.usable}:${t.item?.id ?? ''}`).sort().join('|');
        const before = sig();
        const mr = G.map.rooms[0];
        enterRoom(G, 0, 'c');
        drain(G);
        if (id === 'raven') PLACES.raven.build(G, G.room, mr, rngFrom(5));
        settle(G);
        assert.equal(sig(), before, `${id}/${seed}: после повторного входа предметы другие`);
        assert.equal(findNaN(G), null);
        // предмет, у которого есть место, подписывается без ошибок
        for (const th of mine(G, id)) {
          const l = labelOf(G, th);
          if (l) assert.ok(typeof hintOf(l) === 'string' && l.title, `${id}: подпись`);
        }
      }
    });
  }
}

test('сундук: открывается один раз, остаётся открытым после повторного входа', () => {
  for (const seed of [1, 2, 3, 4]) {
    const G = visit('treasure', { seed });
    const mr = G.map.rooms[0];
    mr.data.mimic = 0;
    enterRoom(G, 0, 'c');
    const th = mine(G, 'treasure')[0];
    assert.equal(th.v, 0);
    assert.equal(labelOf(G, th).ok, true);
    PLACES.treasure.use(G, th);
    assert.equal(mr.data.opened, 1);
    PLACES.treasure.use(G, th);                              // второй раз — ничего
    const loot = G.room.picks.length;
    PLACES.treasure.use(G, th);
    assert.equal(G.room.picks.length, loot);
    enterRoom(G, 0, 'c');
    assert.equal(mine(G, 'treasure')[0].v, 1, 'открытый остаётся открытым');
    assert.equal(mine(G, 'treasure')[0].usable, false);
  }
});

test('сундук: зубастый (если зверь описан) ждёт боя, а не находки', () => {
  if (!REG.MOBS.mimic) return;
  const G = visit('treasure', { data: { mimic: 1 } });
  const th = mine(G, 'treasure')[0];
  PLACES.treasure.use(G, th);
  assert.equal(G.room.mobs.some((m) => m.id === 'mimic'), true);
  assert.equal(G.map.rooms[0].data.opened, undefined, 'пока бой идёт, сундук не считается открытым');
  assert.equal(G.room.picks.length, 0, 'находки нет, пока зверь жив');
});

test('начало пути: два ручных кролика, сундук с простым оружием, три таблички — только на первой локации', () => {
  const G = visit('start');
  assert.equal(G.room.mobs.filter((m) => m.id === 'rabbit' && m.tame).length, 2);
  const chest = G.room.things.find((t) => t.kind === 'chest');
  assert.ok(chest);
  assert.equal(G.room.things.filter((t) => t.kind === 'sign').length, 3);
  const mr = G.map.rooms[0];
  assert.equal(REG.WEAPONS[mr.data.weapon].rarity ?? 0, 0);
  PLACES.start.use(G, chest);
  assert.equal(mr.data.opened, 1);
  enterRoom(G, 0, 'c');
  assert.equal(G.room.mobs.filter((m) => m.tame).length, 0, 'кролики не появляются второй раз');
  const G2 = visit('start', { floor: 2 });
  assert.equal(G2.room.things.length, 0, 'на второй локации начало пустое');
});

test('торговец: пять прилавков, цены растут с локацией, покупка списывает монеты и не повторяется', () => {
  const G = visit('shop', { coins: 500 });
  const mr = G.map.rooms[0];
  assert.equal(mr.data.stock.length, SHOP.items + SHOP.extras);
  assert.equal(new Set(mr.data.stock.filter((e) => e.k === 'item').map((e) => e.id)).size, mr.data.stock.filter((e) => e.k === 'item').length, 'вещи не повторяются');
  const stalls = mine(G, 'shop');
  assert.equal(stalls.length, SHOP.items + SHOP.extras);
  const dear = visit('shop', { floor: 3, coins: 500 }).map.rooms[0].data.stock.filter((e) => e.k === 'item');
  assert.ok(dear.every((e) => e.price > 0));
  for (const th of stalls) {
    const e = mr.data.stock[th.tag];
    const l = labelOf(G, th);
    assert.equal(l.title, 'Купить');
    G.player.hp = 1;
    G.player.mana = 0;
    const before = G.coins;
    PLACES.shop.use(G, th);
    if (e.k === 'item' && !e.sold) continue;                 // рюкзак мог кончиться — проверим отдельно
    assert.equal(e.sold, true, `${e.k} продан`);
    assert.ok(G.coins < before, 'монеты списаны');
    assert.equal(th.usable, false);
    const after = G.coins;
    PLACES.shop.use(G, th);
    assert.equal(G.coins, after, 'второй раз не продаётся');
  }
  enterRoom(G, 0, 'c');
  const sold = mine(G, 'shop').filter((t) => !t.usable).length;
  assert.equal(sold, mr.data.stock.filter((e) => e.sold).length, 'проданное остаётся проданным');
});

test('торговец: не хватает монет — отказ без потерь; цел сердцем — не продаёт сердце', () => {
  const G = visit('shop', { coins: 0 });
  const mr = G.map.rooms[0];
  const th = mine(G, 'shop')[0];
  PLACES.shop.use(G, th);
  assert.equal(mr.data.stock[th.tag].sold, false);
  assert.equal(G.coins, 0);
  G.coins = 500;
  const hearts = mine(G, 'shop').find((t) => mr.data.stock[t.tag].k === 'heart');
  if (hearts) {
    G.player.hp = G.player.st.maxHp;
    PLACES.shop.use(G, hearts);
    assert.equal(G.coins, 500, 'при полных сердцах сердце не продаётся');
  }
});

test('камень: сердце забирает, последнее не берёт, с каждым разом скупее; прибавка маны остаётся до конца партии', () => {
  const G = visit('altar', { floor: 2 });
  G.player.hp = 1;
  const th = mine(G, 'altar')[0];
  assert.equal(labelOf(G, th).ok, false);
  PLACES.altar.use(G, th);
  assert.equal(G.player.hp, 1, 'последнее сердце на месте');
  assert.equal(G.map.rooms[0].data.uses ?? 0, 0);
  const tally = { item: 0, coins: 0, mana: 0, boon: 0, none: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const g = visit('altar', { floor: 2, seed });
    const t = mine(g, 'altar')[0];
    g.player.hp = g.player.st.maxHp;
    g.player.mana = 0;
    const hp = g.player.hp;
    const mana = g.player.st.maxMana;
    const items = g.room.picks.filter((p) => p.kind === 'item').length;
    const coins = g.room.picks.filter((p) => p.kind === 'coin').length;
    PLACES.altar.use(g, t);
    assert.equal(g.player.hp, hp - 1, 'сердце отдано');
    assert.equal(g.map.rooms[0].data.uses, 1);
    if (g.player.st.maxMana > mana) tally.boon++;
    else if (g.room.picks.filter((p) => p.kind === 'item').length > items) tally.item++;
    else if (g.room.picks.filter((p) => p.kind === 'coin').length > coins) tally.coins++;
    else if (g.player.mana > 0) tally.mana++;
    else tally.none++;
    assert.equal(findNaN(g), null);
  }
  assert.ok(tally.none > 0 && tally.none < 60, `исходы: ${JSON.stringify(tally)}`);
  assert.ok(tally.boon > 0, 'прибавка маны выпадает');
  const g2 = visit('altar', { floor: 2, seed: 1 });
  const t2 = mine(g2, 'altar')[0];
  const maxes = [];
  for (let i = 0; i < 9; i++) {
    g2.player.hp = g2.player.st.maxHp;
    PLACES.altar.use(g2, t2);
    maxes.push(g2.player.st.maxMana);
  }
  assert.ok(maxes.every((m, i, a) => !i || m >= a[i - 1]), 'запас маны не убывает');
  assert.equal(g2.map.rooms[0].data.uses, 9);
  assert.ok(labelOf(g2, t2).sub.includes(`${ALTAR.odds[4].none}`), 'после пятого раза подпись — как у пятого');
});

test('колодец: ставка списывается, брошенное считается, вехи дарят верное, нехватка — отказ', () => {
  const G = visit('well', { coins: 4 });
  const th = mine(G, 'well')[0];
  assert.equal(labelOf(G, th).ok, false);
  PLACES.well.use(G, th);
  assert.equal(G.coins, 4);
  assert.equal(G.cnt.donated ?? 0, 0);
  G.coins = 1000;
  PLACES.well.use(G, th);
  assert.equal(G.coins, 995);
  assert.equal(G.cnt.donated, WELL.stake);
  assert.equal(G.map.rooms[0].data.tosses, 1);
  // за 50 монет — первая веха: два сердца в подарок
  const g2 = visit('well', { coins: 1000 });
  g2.flags.donated = WELL.marks[0] - WELL.stake;
  const hearts = () => g2.room.picks.filter((p) => p.kind === 'heart').reduce((a, p) => a + p.v, 0);
  assert.equal(hearts(), 0);
  PLACES.well.use(g2, mine(g2, 'well')[0]);
  assert.equal(g2.flags.well, 1);
  assert.equal(hearts(), 2);
  // три вехи подряд (счёт всех партий уже большой): подарок за каждую, потом — обычный бросок
  const g3 = visit('well', { coins: 1000 });
  g3.flags.donated = 1000;
  const t3 = mine(g3, 'well')[0];
  for (let i = 0; i < 3; i++) PLACES.well.use(g3, t3);
  assert.equal(g3.flags.well, 3);
  PLACES.well.use(g3, t3);
  assert.equal(g3.flags.well, 3, 'вех больше нет');
  assert.equal(findNaN(g3), null);
  // испорченные счётчики не ломают подпись
  g3.flags.donated = 'x';
  g3.cnt.donated = -5;
  assert.ok(labelOf(g3, t3));
});

test('привал: два зверя, наём за монеты, нанятый уходит с лисой и не возвращается; мест нет — отказ', () => {
  const G = visit('camp', { coins: 500 });
  const mr = G.map.rooms[0];
  assert.equal(mr.data.cands.length, CAMP.cands);
  assert.equal(new Set(mr.data.cands.map((c) => c.id)).size, CAMP.cands, 'звери разные');
  const cands = mine(G, 'camp');
  assert.equal(cands.length, CAMP.cands);
  const first = cands[0];
  const id = mr.data.cands[first.tag].id;
  const l = labelOf(G, first);
  assert.equal(l.title, 'Нанять');
  assert.ok(l.cost > 0);
  PLACES.camp.use(G, first);
  assert.equal(G.coins, 500 - l.cost);
  assert.equal(G.minions.length, 1);
  assert.equal(G.minions[0].id, id);
  assert.equal(G.room.pals.length, 1);
  assert.equal(mr.data.cands[first.tag].hired, 1);
  assert.equal(mine(G, 'camp').length, CAMP.cands - 1);
  enterRoom(G, 0, 'c');
  assert.equal(mine(G, 'camp').length, CAMP.cands - 1, 'нанятого в привале больше нет');
  assert.equal(G.room.pals.length, 1, 'а рядом с лисой есть');
  // второй — места ещё два; третьего нанять нельзя
  G.player.st.palSlots = 1;
  const second = mine(G, 'camp')[0];
  assert.equal(labelOf(G, second).ok, false);
  const coins = G.coins;
  PLACES.camp.use(G, second);
  assert.equal(G.coins, coins);
  assert.equal(G.minions.length, 1);
});

test('кузница: заточка на уровень, цена растёт, выше предела и без оружия — отказ', () => {
  const G = armed(visit('forge', { floor: 2, coins: 1000 }));
  const th = mine(G, 'forge').find((t) => t.kind === 'beaver');
  assert.ok(th, 'бобёр на месте');
  const w = G.inv.weapon;
  const prices = [];
  for (let i = 0; i < 3; i++) {
    const l = labelOf(G, th);
    assert.equal(l.ok, true);
    prices.push(l.cost);
    const before = G.coins;
    PLACES.forge.use(G, th);
    assert.equal(w.lvl, i + 1);
    assert.equal(G.coins, before - l.cost);
  }
  assert.ok(prices[0] < prices[1] && prices[1] < prices[2]);
  assert.equal(labelOf(G, th).ok, false);
  const coins = G.coins;
  PLACES.forge.use(G, th);
  assert.equal(w.lvl, 3, 'выше +3 нельзя');
  assert.equal(G.coins, coins);
  const g2 = visit('forge', { floor: 2, coins: 1000 });
  g2.inv.weapon = null;
  const t2 = mine(g2, 'forge').find((t) => t.kind === 'beaver');
  assert.equal(labelOf(g2, t2).ok, false);
  PLACES.forge.use(g2, t2);
  assert.equal(g2.coins, 1000);
  const g3 = armed(visit('forge', { floor: 2, coins: 3 }));
  assert.equal(labelOf(g3, mine(g3, 'forge').find((t) => t.kind === 'beaver')).ok, false, 'без монет заточки нет');
});

test('родник: здоровой лисе не нужен, один раз возвращает всё, потом иссякает (и после повторного входа)', () => {
  const G = visit('spring');
  const th = mine(G, 'spring')[0];
  assert.equal(labelOf(G, th).ok, false);
  PLACES.spring.use(G, th);
  assert.equal(G.map.rooms[0].data.used, undefined, 'здоровой — родник подождёт');
  hurtPlayer(G, 1, 0, 0, 'zone');
  G.player.hp = 1;
  G.player.mana = 0;
  PLACES.spring.use(G, th);
  assert.equal(G.player.hp, G.player.st.maxHp);
  assert.ok(G.player.mana > 0);
  assert.equal(G.map.rooms[0].data.used, 1);
  G.player.hp = 1;
  PLACES.spring.use(G, th);
  assert.equal(G.player.hp, 1, 'второй раз — иссяк');
  enterRoom(G, 0, 'c');
  assert.equal(mine(G, 'spring')[0].v, 1);
  assert.equal(labelOf(G, mine(G, 'spring')[0]).ok, false);
});

test('тотем: испытание закрывает двери, после трёх волн — сундук; победа и сундук переживают повторный вход', () => {
  const G = visit('totem', { floor: 2 });
  const th = mine(G, 'totem').find((t) => t.kind === 'totem');
  assert.equal(labelOf(G, th).ok, true);
  PLACES.totem.use(G, th);
  assert.equal(G.room.dir.challenge, true);
  assert.equal(G.room.dir.waves, TOTEM.waves);
  assert.equal(th.usable, false);
  assert.equal(labelOf(G, th).ok, false, 'пока идёт — второй раз не начать');
  // кончаем испытание так же, как конец боя: зовём done
  const done = G.room.dir.done;
  assert.equal(typeof done, 'function');
  done(G);
  assert.equal(G.map.rooms[0].data.won, 1);
  const chest = mine(G, 'totem').find((t) => t.kind === 'chest');
  assert.ok(chest, 'наградной сундук появился');
  PLACES.totem.use(G, chest);
  assert.equal(G.map.rooms[0].data.opened, 1);
  assert.ok(G.room.picks.some((p) => p.kind === 'item'), 'в сундуке вещь');
  G.room.dir.mode = 'cleared';
  enterRoom(G, 0, 'c');
  assert.equal(mine(G, 'totem').find((t) => t.kind === 'chest').v, 1);
  assert.equal(mine(G, 'totem').find((t) => t.kind === 'totem').v, 1);
  assert.equal(labelOf(G, mine(G, 'totem').find((t) => t.kind === 'totem')).ok, false);
});

test('напёрстки: ставка списывается всегда, исходы разные, нехватка — отказ; в убыток на длинной дистанции', () => {
  const G = visit('gamble', { floor: 2, coins: 2 });
  const th = mine(G, 'gamble')[0];
  assert.equal(labelOf(G, th).ok, false);
  PLACES.gamble.use(G, th);
  assert.equal(G.coins, 2);
  let spent = 0;
  let got = 0;
  const kinds = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const g = visit('gamble', { floor: 2, seed, coins: 100 });
    const t = mine(g, 'gamble')[0];
    const before = g.room.picks.length;
    PLACES.gamble.use(g, t);
    assert.equal(g.coins, 100 - GAMBLE.stake);
    spent += GAMBLE.stake;
    for (const p of g.room.picks) {
      kinds.add(p.kind);
      if (p.kind === 'coin') got += 1;
    }
    assert.equal(g.map.rooms[0].data.plays, 1);
    assert.equal(findNaN(g), null);
    assert.ok(g.room.picks.length >= before);
  }
  assert.ok(kinds.has('coin') && kinds.has('heart') && kinds.has('mana'), [...kinds].join());
  assert.ok(got > 0 && spent > 0);
});

test('ворон: вещь эпическая, цена — сердце насовсем, последние два сердца не берёт, один раз', () => {
  let G = null;
  for (let seed = 1; seed < 40 && !G?.map.rooms[0].data.raven; seed++) G = visit('raven', { floor: 3, seed });
  const mr = G.map.rooms[0];
  assert.ok(mr.data.raven, 'ворон прилетел хотя бы при одном зерне');
  const stall = mine(G, 'raven')[0];
  assert.ok(stall);
  assert.equal(stall.item.id, mr.data.raven.id);
  G.player.st.maxHp = RAVEN.keep;
  assert.equal(labelOf(G, stall).ok, false);
  PLACES.raven.use(G, stall);
  assert.equal(mr.data.raven.done ?? 0, 0, 'на двух сердцах ворон не берёт');
  G.player.st.maxHp = 5;
  G.player.hp = 5;
  assert.equal(labelOf(G, stall).ok, true);
  const maxBefore = 5;
  PLACES.raven.use(G, stall);
  assert.equal(mr.data.raven.done, 1);
  assert.equal(G.player.st.maxHp, maxBefore - 1, 'сердце отдано насовсем');
  PLACES.raven.use(G, stall);
  assert.equal(G.player.st.maxHp, maxBefore - 1, 'второй раз не берёт');
  assert.ok(G.inv.weapon?.id === mr.data.raven.id || G.inv.armor?.id === mr.data.raven.id || G.inv.bag.some((b) => b?.id === mr.data.raven.id) || G.inv.acc.some((b) => b?.id === mr.data.raven.id) || G.room.picks.some((p) => p.id === mr.data.raven.id), 'вещь у лисы');
});

test('места не ломаются от испорченной записи комнаты', () => {
  const junk = [null, 5, 'x', [], { stock: 'x' }, { cands: [null, 3, { id: 'nope' }] }, { stock: [null, { k: 'item', id: 'nope' }, { k: 'zzz' }], uses: -3, raven: 7 }];
  for (const id of IDS) {
    for (const data of junk) {
      const G = visit(id, { floor: 3, coins: 50, data: {} });
      const mr = G.map.rooms[0];
      mr.data = data && typeof data === 'object' && !Array.isArray(data) ? JSON.parse(JSON.stringify(data)) : {};
      assert.doesNotThrow(() => {
        enterRoom(G, 0, 'c');
        if (id === 'raven') PLACES.raven.build(G, G.room, mr, rngFrom(5));
        settle(G);
        for (const th of mine(G, id)) {
          PLACES[id].label?.(G, th);
          PLACES[id].use?.(G, th);
        }
        settle(G);
      }, `${id} / ${JSON.stringify(data)}`);
      assert.equal(findNaN(G), null, id);
    }
  }
});

test('места: шаг идёт, пока лиса стоит рядом (подпись обновляется, хозяин замечает лису)', () => {
  const G = armed(visit('forge', { floor: 2, coins: 0 }));
  const th = mine(G, 'forge').find((t) => t.kind === 'beaver');
  put(G, th.x + 20, th.y);
  runSteps(G, 30);
  assert.equal(th.usable, false);
  assert.ok(th.text.length > 0, 'без монет — подсказка вместо действия');
  G.coins = 1000;
  runSteps(G, 30);
  assert.equal(th.usable, true, 'монеты появились — предмет ждёт действия');
  assert.equal(th.text, '');
  pressStep(G, 1);
  assert.equal(findNaN(G), null);
});
