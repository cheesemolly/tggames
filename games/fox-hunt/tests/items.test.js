// Вещи «Лисьей охоты» (items.js): данные, точный эффект каждой брони, украшения и дара, зелья, эликсиры и дары
// в самой игре — вещь меняет ровно то, что обещает, и ничего больше.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REG } from '../core.js';
import '../content.js';
import { BASE, LIMITS, PERK, FOX, DASH } from '../balance.js';
import { STAT_KEYS, FLAG_KEYS, FLAG_RULES, recalc, hurtPlayer, addEffect, heal, gainCoins } from '../player.js';
import { ARMOR, ACCESSORIES, POTIONS, GIFTS, EFFECTS, POTION_TIME } from '../items.js';
import { giveItem, usePotion, takeGift, giftOptions, chooseGift, itemInfo, ACC_SLOTS } from '../inventory.js';
import { hurtMob, hitOf } from '../combat.js';
import { addPick } from '../world.js';
import { spawnMob } from '../ai.js';
import { arena, dummy, put, makeInput, runSteps, runUntil, of } from './helpers.js';

const NAME_LIMIT = 22;
const DESC_LIMIT = 70;

// Что обещает каждая вещь: итоговые значения характеристик и флагов. Всё остальное должно остаться как у голой лисы.
const ARMOR_FX = {
  vest: { maxShield: 1 },
  bark: { maxShield: 2 },
  thornmail: { maxShield: 1, thorns: 3 },
  fur: { maxShield: 1, slowImmune: true },
  shadowcloak: { maxShield: 1, iframes: BASE.iframes * 3 },
  shell: { maxShield: 3, speed: BASE.speed * 0.92 },
  feathers: { maxShield: 1, speed: BASE.speed * 1.1 },
  silkmail: { maxShield: 2, dodge: 0.2 },
  moonrobe: { maxShield: 2, maxMana: BASE.maxMana + 20, shieldRegen: 2 },
};
const ACC_FX = {
  clover: { luck: 1 },
  rabbitfoot: { speed: BASE.speed * 1.15 },
  fang: { dashDmg: BASE.dashDmg + 2 },
  owlfeather: { dashCd: BASE.dashCd * 0.8 },
  heartberry: { maxHp: BASE.maxHp + 1 },
  crystal: { maxMana: BASE.maxMana + 30 },
  dew: { manaRegen: 1 },
  magnet: { magnet: BASE.magnet * 2.5 },
  twintail: { dashCharges: 2 },
  firetail: { fireTrail: true },
  icetrail: { iceDash: true },
  proboscis: { killHeal: 12 },
  acornshield: { roomBlock: 1 },
  pouch: { coinMul: 1.5 },
  owleye: { revealMap: true },
  horseshoe: { crit: BASE.crit + 0.15 },
  collar: { contact: 1 },
  bell: { shockwave: true },
  springpaws: { dashDist: BASE.dashDist * 1.25 },
  hushbell: { aware: 0.7 },
  carrot: { rabbitsPlus: 1 },
  mirror: { dupShot: 0.15 },
  honey: { healBonus: 1 },
  whetstone: { wDmg: 1.25 },
  quickpaws: { wCd: 0.8 },
  thrift: { wCost: 0.7 },
  antler: { warn: 0.4, kbImmune: true },
  bearcharm: { hazardCut: 1 },
  phoenix: { revive: true },
  sporecap: { sporeOnHit: true },
  silk: { slowDash: true },
  eagleeye: { wRange: 1.3, shotSpeed: 1.2 },
  greedacorn: { coinPerRabbit: 1 },
  goldcarrot: { rabbitPts: 1 },
  pocketwatch: { projSlow: 0.3 },
  glowbug: { glowbug: true },
};
const GIFT_FX = {
  vigor: { maxHp: BASE.maxHp + 1 },
  wisdom: { maxMana: BASE.maxMana + 40 },
  swift: { speed: BASE.speed * 1.1 },
  pounce: { dashCharges: 2 },
  sharp: { dashDmg: BASE.dashDmg * 1.5 },
  thickfur: { maxShield: 1 },
  frugal: { wCost: 0.75 },
  bargain: { shopMul: 0.7 },
  pack: { palSlots: BASE.palSlots + 1, palHp: 1.5 },
  guard: { roomBlock: 1 },
  bounty: { rabbitsPlus: 1 },
  fortune: { crit: BASE.crit + 0.1 },
  antidote: { cloudImmune: true },
  surefoot: { floorImmune: true },
  leech: { killHeal: 15 },
  tracker: { preyStay: 1.3 },
  spark: { manaPerRabbit: 3 },
  secondwind: { secondWind: true },
};
const EFFECT_FX = {
  slow: { speed: BASE.speed * 0.5 },
  root: {},
  haste: { speed: BASE.speed * 1.35 },
  rage: { dashDmg: BASE.dashDmg * 2 },
  stone: { maxShield: 3 },
  wind: { maxShield: 2 },
};

const flagDefault = (k) => (FLAG_RULES[k] === 'or' ? false : 0);
const near = (a, b) => Math.abs(a - b) < 1e-9;

/** Свежая тихая арена; лисе надето только то, что передано. */
function bare() {
  const G = arena();
  put(G, 200, 240);
  return G;
}
function wearArmor(G, id) {
  G.inv.armor = { id, lvl: 0 };
  recalc(G);
}
function wearAcc(G, id) {
  G.inv.acc[G.inv.acc.indexOf(null)] = { id };
  recalc(G);
}
function addGift(G, id) {
  G.gifts.push(id);
  recalc(G);
}

/** Что изменилось у лисы против голой: { характеристика | флаг: значение }. */
function diffOf(G) {
  const st = G.player.st;
  const out = {};
  for (const k of STAT_KEYS) if (!near(st[k], BASE[k])) out[k] = st[k];
  for (const k of FLAG_KEYS) if (st.flags[k] !== flagDefault(k)) out[k] = st.flags[k];
  return out;
}
function assertExactly(got, want, what) {
  const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
  for (const k of keys) {
    const a = got[k];
    const b = want[k];
    const ok = typeof b === 'number' && typeof a === 'number' ? near(a, b) : a === b;
    assert.ok(ok, `${what}: ${k} — ${a}, а обещано ${b}`);
  }
}

// ---------- данные ----------

test('вещи: списки и числа сходятся с реестром', () => {
  assert.equal(Object.keys(ARMOR).length, 9);
  assert.equal(Object.keys(ACCESSORIES).length, 36);
  assert.equal(Object.keys(POTIONS).length, 6);
  assert.equal(Object.keys(GIFTS).length, 18);
  assert.deepEqual(Object.keys(ARMOR).sort(), Object.keys(ARMOR_FX).sort());
  assert.deepEqual(Object.keys(ACCESSORIES).sort(), Object.keys(ACC_FX).sort());
  assert.deepEqual(Object.keys(GIFTS).sort(), Object.keys(GIFT_FX).sort());
  assert.deepEqual(Object.keys(EFFECTS).sort(), Object.keys(EFFECT_FX).sort());
  assert.deepEqual(Object.keys(POTION_TIME).sort(), ['haste', 'rage', 'stone']);
  for (const id of Object.keys(ARMOR)) assert.equal(REG.ARMOR[id], ARMOR[id]);
  for (const id of Object.keys(ACCESSORIES)) assert.equal(REG.ACCESSORIES[id], ACCESSORIES[id]);
  for (const id of Object.keys(POTIONS)) assert.equal(REG.POTIONS[id], POTIONS[id]);
  for (const id of Object.keys(GIFTS)) assert.equal(REG.GIFTS[id], GIFTS[id]);
  for (const id of Object.keys(EFFECTS)) assert.equal(REG.EFFECTS[id], EFFECTS[id]);
  assert.ok(ACC_SLOTS >= 3);
});

test('вещи: имена, описания, редкость, ключи add / mul / flags', () => {
  const kinds = [['броня', ARMOR], ['украшение', ACCESSORIES], ['зелье', POTIONS], ['дар', GIFTS]];
  for (const [kind, list] of kinds) {
    for (const [id, d] of Object.entries(list)) {
      const who = `${kind} ${id}`;
      assert.ok(typeof d.name === 'string' && d.name.length > 0 && d.name.length <= NAME_LIMIT, `${who}: имя «${d.name}»`);
      assert.ok(!d.name.endsWith('.') && !d.desc.endsWith('..'), `${who}: имя без точки`);
      assert.ok(typeof d.desc === 'string' && d.desc.length >= 5 && d.desc.length <= DESC_LIMIT, `${who}: описание ${d.desc?.length} знаков`);
      assert.ok(/\.$/.test(d.desc), `${who}: описание кончается точкой`);
      if (kind !== 'дар') assert.ok(Number.isInteger(d.rarity) && d.rarity >= 0 && d.rarity <= 3, `${who}: редкость`);
      if (kind === 'броня') assert.ok(Number.isInteger(d.shield) && d.shield >= 1 && d.shield <= 3, `${who}: щит`);
      if (kind === 'зелье') assert.equal(typeof d.use, 'function', who);
      for (const [part, map] of [['add', d.add], ['mul', d.mul]]) {
        for (const [k, v] of Object.entries(map ?? {})) {
          assert.ok(STAT_KEYS.includes(k), `${who}: ${part}.${k} — нет такой характеристики`);
          assert.ok(Number.isFinite(v), `${who}: ${part}.${k} — не число`);
          if (part === 'mul') assert.ok(v > 0 && v !== 1, `${who}: mul.${k}`);
          if (part === 'add') assert.ok(v !== 0, `${who}: add.${k}`);
        }
      }
      for (const [k, v] of Object.entries(d.flags ?? {})) {
        assert.ok(FLAG_KEYS.includes(k), `${who}: флаг ${k} движок не знает`);
        assert.ok(v === true || (typeof v === 'number' && v > 0), `${who}: флаг ${k} = ${v}`);
      }
      if (kind !== 'зелье') assert.ok(d.shield || d.add || d.mul || d.flags, `${who}: ничего не меняет`);
    }
  }
  for (const [id, d] of Object.entries(EFFECTS)) {
    assert.ok(d.name, id);
    for (const k of Object.keys({ ...d.add, ...d.mul })) assert.ok(STAT_KEYS.includes(k), `${id}: ${k}`);
    for (const k of Object.keys(d.flags ?? {})) assert.ok(FLAG_KEYS.includes(k), `${id}: ${k}`);
  }
});

test('вещи: у даров once и offer стоят только там, где нужно', () => {
  const once = Object.keys(GIFTS).filter((id) => GIFTS[id].once).sort();
  assert.deepEqual(once, ['antidote', 'leech', 'secondwind', 'surefoot']);
  // once — только у даров-умений, которые второй раз ничего не прибавят
  for (const id of once) assert.ok(!GIFTS[id].add && !GIFTS[id].mul, id);
  for (const id of Object.keys(GIFTS)) assert.notEqual(GIFTS[id].offer, false, `${id}: не предлагается`);
});

test('вещи: пять видов редкости представлены, у каждой редкости есть и броня, и украшения не пусты', () => {
  const count = [0, 0, 0, 0];
  for (const d of [...Object.values(ARMOR), ...Object.values(ACCESSORIES)]) count[d.rarity] += 1;
  for (let r = 0; r < 4; r++) assert.ok(count[r] > 0, `редкость ${r}: вещей нет`);
  assert.ok(count[0] > count[3], 'обычных больше, чем легендарных');
  assert.ok(POTIONS.heal.rarity === 0, 'лечение — обычное');
});

// ---------- что каждая вещь меняет ----------

test('броня: меняет ровно обещанное', () => {
  for (const id of Object.keys(ARMOR)) {
    const G = bare();
    wearArmor(G, id);
    assertExactly(diffOf(G), ARMOR_FX[id], `броня ${id}`);
    assert.equal(G.player.st.maxShield, ARMOR[id].shield, `${id}: щитов`);
  }
});

test('украшения: каждое меняет ровно обещанное', () => {
  for (const id of Object.keys(ACCESSORIES)) {
    const G = bare();
    wearAcc(G, id);
    assertExactly(diffOf(G), ACC_FX[id], `украшение ${id}`);
  }
});

test('дары: каждый меняет ровно обещанное', () => {
  for (const id of Object.keys(GIFTS)) {
    const G = bare();
    addGift(G, id);
    assertExactly(diffOf(G), GIFT_FX[id], `дар ${id}`);
  }
});

test('временные действия: каждое меняет ровно обещанное и проходит без следа', () => {
  for (const id of Object.keys(EFFECTS)) {
    const G = bare();
    assert.ok(addEffect(G, id, 1), id);
    assertExactly(diffOf(G), EFFECT_FX[id], `действие ${id}`);
    runSteps(G, 62);
    assert.equal(G.player.fx[id] ?? 0, 0, `${id}: кончилось`);
    assertExactly(diffOf(G), {}, `после ${id}`);
  }
});

test('описания не врут: числа в тексте сходятся с числами вещи', () => {
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  const checks = [
    [ACCESSORIES.rabbitfoot, 15], [ACCESSORIES.owlfeather, 20], [ACCESSORIES.pouch, 50], [ACCESSORIES.springpaws, 25],
    [ACCESSORIES.hushbell, 30], [ACCESSORIES.whetstone, 25], [ACCESSORIES.quickpaws, 20], [ACCESSORIES.thrift, 30],
    [ARMOR.shell, 8], [ARMOR.feathers, 10], [GIFTS.swift, 10], [GIFTS.sharp, 50], [GIFTS.frugal, 25], [GIFTS.bargain, 30],
    [GIFTS.pack, 50], [GIFTS.tracker, 30], [EFFECTS.haste, 35],
  ];
  for (const [d, n] of checks) {
    const v = Object.values(d.mul)[0];
    assert.equal(pct(v), n, `${d.name}: ${v}`);
    if (d.desc) assert.ok(d.desc.includes(`${n} %`), `${d.name}: в описании нет «${n} %»: ${d.desc}`);
  }
  assert.ok(ACCESSORIES.magnet.desc.includes('2,5') && ACCESSORIES.magnet.mul.magnet === 2.5);
  assert.ok(ACCESSORIES.eagleeye.desc.includes('30 %') && ACCESSORIES.eagleeye.desc.includes('20 %'));
  assert.ok(ARMOR.shadowcloak.desc.includes('втрое') && near(BASE.iframes + ARMOR.shadowcloak.add.iframes, BASE.iframes * 3));
  assert.ok(ARMOR.silkmail.desc.includes('20 %') && ARMOR.silkmail.add.dodge === 0.2);
  assert.ok(ACCESSORIES.horseshoe.desc.includes('15 %') && ACCESSORIES.horseshoe.add.crit === 0.15);
  assert.ok(GIFTS.fortune.desc.includes('10 %') && GIFTS.fortune.add.crit === 0.1);
  assert.ok(ACCESSORIES.mirror.desc.includes('15 %') && ACCESSORIES.mirror.flags.dupShot === 0.15);
  assert.ok(ACCESSORIES.proboscis.desc.includes('12') && ACCESSORIES.proboscis.flags.killHeal === 12);
  assert.ok(GIFTS.leech.desc.includes('15') && GIFTS.leech.flags.killHeal === 15);
  assert.ok(GIFTS.spark.desc.includes('3 маны') && GIFTS.spark.flags.manaPerRabbit === 3);
  assert.ok(ACCESSORIES.antler.desc.includes('0,4') && ACCESSORIES.antler.add.warn === 0.4);
  assert.ok(ACCESSORIES.pocketwatch.desc.includes('30 %') && ACCESSORIES.pocketwatch.flags.projSlow === 0.3);
  assert.ok(ARMOR.thornmail.desc.includes('урон 3') && ARMOR.thornmail.flags.thorns === 3);
  assert.ok(ACCESSORIES.bell.desc.includes('урон 2'));
  assert.ok(ACCESSORIES.glowbug.desc.includes('урон 1') && PERK.bugDmg === 1);
  assert.ok(ACCESSORIES.glowbug.desc.includes('раз в секунду') && PERK.bugGap === 1);
  assert.ok(ACCESSORIES.sporecap.desc.includes(`${PERK.sporeTime} с`));
  assert.ok(GIFTS.secondwind.desc.includes(`${FOX.windTime} с`) && EFFECTS.wind.add.maxShield === 2 && EFFECTS.haste.mul.speed === 1.35);
  assert.ok(POTIONS.haste.desc.includes(`${POTION_TIME.haste} с`) && POTIONS.rage.desc.includes(`${POTION_TIME.rage} с`));
  assert.ok(POTIONS.stone.desc.includes(`${POTION_TIME.stone} с`) && POTIONS.stone.desc.includes('три'));
  assert.ok(POTIONS.rage.desc.includes('вдвое') && EFFECTS.rage.mul.dashDmg === 2);
});

test('всё сразу: пределы держат, числа целы', () => {
  const G = bare();
  wearArmor(G, 'silkmail');
  for (const id of ['twintail', 'honey', 'heartberry']) wearAcc(G, id);
  for (const id of Object.keys(GIFTS)) for (let i = 0; i < 6; i++) G.gifts.push(id);
  recalc(G);
  const st = G.player.st;
  for (const k of STAT_KEYS) {
    assert.ok(Number.isFinite(st[k]) && st[k] >= LIMITS[k][0] && st[k] <= LIMITS[k][1], `${k}: ${st[k]}`);
  }
  assert.ok(G.player.hp <= st.maxHp && G.player.shield <= st.maxShield);
});

test('карточка вещи: у каждой брони и украшения есть строки с числами', () => {
  for (const id of [...Object.keys(ARMOR), ...Object.keys(ACCESSORIES)]) {
    const info = itemInfo({ id, lvl: 0 });
    assert.ok(info && info.name && info.desc, id);
    assert.ok(info.lines.every((s) => typeof s === 'string' && !s.includes('NaN') && !s.includes('undefined')), `${id}: ${info.lines}`);
    if (ARMOR[id]) assert.ok(info.lines[0].startsWith('Щит'), id);
  }
});

// ---------- зелья и эликсиры ----------

/** Зелье в рюкзаке; возвращает номер ячейки. */
function bagPotion(G, id) {
  assert.ok(giveItem(G, { id }));
  return G.inv.bag.findIndex((it) => it?.id === id);
}

test('зелье лечения: все сердца, а при целых — не тратится', () => {
  const G = bare();
  const P = G.player;
  const cell = bagPotion(G, 'heal');
  assert.equal(usePotion(G, cell), false);
  assert.equal(G.inv.bag[cell]?.id, 'heal', 'при целых сердцах осталось');
  P.hp = 1;
  assert.equal(usePotion(G, cell), true);
  assert.equal(P.hp, P.st.maxHp);
  assert.equal(G.inv.bag[cell], null, 'выпито');
  // с большим запасом сердец — тоже все
  wearAcc(G, 'heartberry');
  P.hp = 2;
  const c2 = bagPotion(G, 'heal');
  usePotion(G, c2);
  assert.equal(P.hp, 6);
});

test('зелье маны: вся мана, а при полной — не тратится', () => {
  const G = bare();
  const P = G.player;
  wearAcc(G, 'crystal');
  const cell = bagPotion(G, 'manapot');
  P.mana = P.st.maxMana;
  assert.equal(usePotion(G, cell), false);
  assert.ok(G.inv.bag[cell]);
  P.mana = 3;
  assert.equal(usePotion(G, cell), true);
  assert.equal(P.mana, BASE.maxMana + 30);
  assert.equal(G.inv.bag[cell], null);
});

test('эликсиры: действуют своё время, второй при идущем не пьётся', () => {
  for (const [id, fx, check] of [
    ['haste', 'haste', (P) => near(P.st.speed, BASE.speed * 1.35)],
    ['rage', 'rage', (P) => near(P.st.dashDmg, BASE.dashDmg * 2)],
    ['stone', 'stone', (P) => P.st.maxShield === 3 && P.shield === 3],
  ]) {
    const G = bare();
    const P = G.player;
    const cell = bagPotion(G, id);
    assert.equal(usePotion(G, cell), true, id);
    assert.equal(P.fx[fx], POTION_TIME[id], `${id}: время`);
    assert.ok(check(P), id);
    const again = bagPotion(G, id);
    assert.equal(usePotion(G, again), false, `${id}: второй при идущем`);
    assert.ok(G.inv.bag[again], `${id}: остался в рюкзаке`);
    assert.equal(P.fx[fx], POTION_TIME[id], `${id}: время не сложилось`);
    runSteps(G, Math.ceil(POTION_TIME[id] * 60) + 3);
    assert.equal(P.fx[fx], 0, `${id}: кончилось`);
    assertExactly(diffOf(G), {}, `после ${id}`);
    assert.equal(P.shield, 0, `${id}: щит ушёл вместе с шкурой`);
  }
});

test('каменная шкура даёт щиты сверх брони и сбрасывает только свои', () => {
  const G = bare();
  const P = G.player;
  wearArmor(G, 'bark');
  P.shield = 2;
  usePotion(G, bagPotion(G, 'stone'));
  assert.equal(P.st.maxShield, 5);
  assert.equal(P.shield, 5);
  runSteps(G, POTION_TIME.stone * 60 + 3);
  assert.equal(P.st.maxShield, 2);
  assert.equal(P.shield, 2, 'щиты брони остались');
});

test('свиток-карта: открывает все комнаты, а когда открыты — не тратится', () => {
  const G = bare();
  for (const r of G.map.rooms) r.seen = false;
  const cell = bagPotion(G, 'mapscroll');
  assert.equal(usePotion(G, cell), true);
  assert.ok(G.map.rooms.every((r) => r.seen));
  assert.equal(G.inv.bag[cell], null);
  const again = bagPotion(G, 'mapscroll');
  assert.equal(usePotion(G, again), false);
  assert.ok(G.inv.bag[again]);
});

test('зелье не пьётся, пока лиса лежит, и не пьётся вещь, которая не зелье', () => {
  const G = bare();
  G.player.hp = 1;
  const cell = bagPotion(G, 'heal');
  G.player.down = 1;
  assert.equal(usePotion(G, cell), false);
  assert.ok(G.inv.bag[cell]);
  G.player.down = 0;
  giveItem(G, { id: 'fang' });
  const fang = G.inv.bag.findIndex((it) => it?.id === 'fang');
  if (fang >= 0) assert.equal(usePotion(G, fang), false);
});

test('зелья: лечение «мёдом» не ломает зелье (лишнее не выходит за сердца)', () => {
  const G = bare();
  wearAcc(G, 'honey');
  G.player.hp = 1;
  usePotion(G, bagPotion(G, 'heal'));
  assert.equal(G.player.hp, G.player.st.maxHp);
});

// ---------- дары ----------

test('дары: «Крепость» и «Мудрость» приносят новое сердце и ману сразу', () => {
  const G = bare();
  const P = G.player;
  P.hp = 3;
  P.mana = 10;
  assert.ok(takeGift(G, 'vigor'));
  assert.equal(P.st.maxHp, 6);
  assert.equal(P.hp, 4, 'лечит на одно сердце');
  assert.ok(takeGift(G, 'wisdom'));
  assert.equal(P.st.maxMana, 140);
  assert.equal(P.mana, 50, '+40 маны');
  assert.equal(takeGift(G, 'нет-такого'), false);
  assert.deepEqual(G.gifts, ['vigor', 'wisdom']);
});

test('дары: повторный дар прибавляет ещё раз, умения — нет', () => {
  const G = bare();
  takeGift(G, 'pounce');
  takeGift(G, 'pounce');
  assert.equal(G.player.st.dashCharges, 3);
  takeGift(G, 'swift');
  takeGift(G, 'swift');
  assert.ok(near(G.player.st.speed, BASE.speed * 1.1 * 1.1));
  takeGift(G, 'leech');
  takeGift(G, 'leech');
  assert.equal(G.player.st.flags.killHeal, 15, 'умение одно');
  takeGift(G, 'guard');
  takeGift(G, 'guard');
  assert.equal(G.player.st.flags.roomBlock, 2, 'два оберега — два удара');
});

test('дары: предлагается три разных, сначала новые, умения не повторяются', () => {
  const G = bare();
  for (let i = 0; i < 40; i++) {
    const o = giftOptions(G);
    assert.equal(o.length, 3);
    assert.equal(new Set(o).size, 3);
    for (const id of o) assert.ok(GIFTS[id]);
  }
  // всё взято: остаются только те, что можно повторять
  for (const id of Object.keys(GIFTS)) G.gifts.push(id);
  for (let i = 0; i < 40; i++) {
    for (const id of giftOptions(G)) assert.ok(!GIFTS[id].once, `${id} повторно`);
  }
  // выбор из окна
  const H = bare();
  H.pending = { kind: 'gift', options: ['vigor', 'swift', 'pounce'] };
  assert.equal(chooseGift(H, 3), false);
  assert.ok(chooseGift(H, 2));
  assert.equal(H.player.st.dashCharges, 2);
  assert.equal(H.pending, null);
});

// ---------- настоящие вещи в игре ----------

/** Враг-кусака: касанием бьёт на 1, сам почти не умирает. */
function biter(G, x, y) {
  if (!REG.MOBS['test-biter']) REG.MOBS['test-biter'] = { name: 'Кусака', kind: 'hostile', hp: 1000, r: 10, pts: 1, touch: 1, wave: false };
  return spawnMob(G, 'test-biter', x, y, { warm: 0 });
}

test('«Колючая броня»: ударивший вплотную зверь получает 3, щит принимает удар', () => {
  const G = bare();
  const P = G.player;
  wearArmor(G, 'thornmail');
  P.shield = P.st.maxShield;
  const m = biter(G, 204, 240);
  runSteps(G, 3);
  assert.equal(P.shield, 0, 'удар принял щит');
  assert.equal(P.hp, P.st.maxHp);
  assert.equal(m.hp, 1000 - 3);
});

test('«Колючий ошейник»: касающийся зверь получает 1 не чаще раза в полсекунды', () => {
  const G = bare();
  G.god = true;
  const m = dummy(G, 205, 240);
  wearAcc(G, 'collar');
  runSteps(G, 61);
  assert.ok(m.hp <= 1000 - 1 && m.hp >= 1000 - 3, `hp ${m.hp}`);
  const none = bare();
  const d = dummy(none, 205, 240);
  runSteps(none, 61);
  assert.equal(d.hp, 1000, 'без ошейника не бьёт');
});

test('«Паутинная кольчуга»: каждый пятый удар мимо', () => {
  const G = bare();
  const P = G.player;
  wearArmor(G, 'silkmail');
  let dodged = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    P.inv = 0;
    P.hp = 5;
    P.shield = 0;
    P.down = 0;
    if (!hurtPlayer(G, 1, 300, 240, 'touch')) dodged += 1;
  }
  assert.ok(Math.abs(dodged / n - 0.2) < 0.03, `увернулась ${dodged / n}`);
});

test('«Лесной оберег» и «Жёлудь-оберег»: первый удар в комнате не проходит, потом проходит', () => {
  for (const wear of [(G) => addGift(G, 'guard'), (G) => wearAcc(G, 'acornshield')]) {
    const G = bare();
    const P = G.player;
    wear(G);
    P.blocks = P.st.flags.roomBlock;
    assert.equal(hurtPlayer(G, 1, 300, 240, 'touch'), false);
    assert.equal(P.hp, P.st.maxHp);
    P.inv = 0;
    assert.equal(hurtPlayer(G, 1, 300, 240, 'touch'), true);
    assert.equal(P.hp, P.st.maxHp - 1);
  }
});

test('«Медвежий амулет»: красная зона на 2 бьёт на 1, на 1 — тоже на 1, касание — как было', () => {
  const G = bare();
  const P = G.player;
  wearAcc(G, 'bearcharm');
  assert.ok(hurtPlayer(G, 2, 300, 240, 'zone'));
  assert.equal(P.hp, 4);
  P.inv = 0;
  assert.ok(hurtPlayer(G, 1, 300, 240, 'zone'));
  assert.equal(P.hp, 3);
  P.inv = 0;
  assert.ok(hurtPlayer(G, 2, 300, 240, 'touch'));
  assert.equal(P.hp, 1, 'касание амулет не смягчает');
});

test('«Рог лося»: лису не отбрасывает', () => {
  const G = bare();
  const P = G.player;
  wearAcc(G, 'antler');
  hurtPlayer(G, 1, 100, 240, 'touch');
  assert.equal(P.vx, 0);
  const H = bare();
  hurtPlayer(H, 1, 100, 240, 'touch');
  assert.ok(H.player.vx > 0, 'без рога отбросило');
});

test('«Перо жар-птицы»: один раз поднимает вместо потери жизни и сгорает', () => {
  const G = bare();
  const P = G.player;
  wearAcc(G, 'phoenix');
  const lives = G.lives;
  P.hp = 1;
  hurtPlayer(G, 1, 300, 240, 'touch');
  assert.equal(G.lives, lives, 'жизнь цела');
  assert.equal(P.hp, P.st.maxHp);
  assert.ok(P.inv >= FOX.reviveInv - 1e-9);
  assert.equal(G.inv.acc.filter((it) => it?.id === 'phoenix').length, 0, 'перо сгорело');
  assert.equal(P.st.flags.revive, false);
  P.inv = 0;
  P.hp = 1;
  hurtPlayer(G, 1, 300, 240, 'touch');
  assert.equal(G.lives, lives - 1, 'второй раз — обычная потеря жизни');
});

test('«Второе дыхание»: после потери жизни ускорение и два щита на 6 с', () => {
  const G = bare();
  const P = G.player;
  addGift(G, 'secondwind');
  P.hp = 1;
  hurtPlayer(G, 1, 300, 240, 'touch');
  runSteps(G, 90);                                 // лежит и встаёт
  assert.ok(P.down <= 0);
  assert.ok(P.fx.haste > 0 && P.fx.wind > 0);
  assert.equal(P.st.maxShield, 2);
  assert.equal(P.shield, 2);
  assert.ok(near(P.st.speed, BASE.speed * 1.35));
  runSteps(G, FOX.windTime * 60);
  assert.equal(P.fx.wind, 0);
  assert.equal(P.st.maxShield, 0);
});

test('«Грибная шляпка»: когда лису бьют, вокруг встаёт облако', () => {
  const G = bare();
  wearAcc(G, 'sporecap');
  const before = G.room.zones?.length ?? 0;
  hurtPlayer(G, 1, 300, 240, 'touch');
  const after = G.room.zones?.length ?? 0;
  assert.equal(after, before + 1);
  const H = bare();
  hurtPlayer(H, 1, 300, 240, 'touch');
  assert.equal(H.room.zones?.length ?? 0, before, 'без шляпки облака нет');
});

test('добыча: «Жадный жёлудь», «Искра», «Золотая морковь» — по числу на каждого кролика', () => {
  const G = bare();
  wearAcc(G, 'greedacorn');
  wearAcc(G, 'goldcarrot');
  addGift(G, 'spark');
  G.player.mana = 0;
  const score = G.score;
  const coins = G.coins;
  const r = spawnMob(G, 'rabbit', 212, 240, { tame: true });
  const events = runSteps(G, 2);
  assert.ok(r.dead);
  assert.equal(G.coins - coins >= 1, true, `монет ${G.coins - coins}`);
  assert.equal(G.player.mana, 3);
  assert.equal(of(events, 'catch')[0].pts, (REG.MOBS.rabbit.pts ?? 1) + 1, 'очков на одно больше');
  assert.ok(G.score > score);
});

test('«Кошель барсука»: монеты на 50 % больше', () => {
  const G = bare();
  wearAcc(G, 'pouch');
  assert.equal(gainCoins(G, 10), 15);
  assert.equal(G.coins, 15);
});

test('«Комариный хоботок»: сердце не сверх запаса, а «Мёд» — на одно больше', () => {
  const G = bare();
  wearAcc(G, 'honey');
  G.player.hp = 1;
  assert.equal(heal(G, 1), 2, 'сердечко с земли лечит два');
  assert.equal(heal(G, 10), 2, 'лишнее не выходит за запас');
  assert.equal(G.player.hp, G.player.st.maxHp);
});

test('«Глаз совы»: карта видна сразу, а «Свиток-карта» после него не нужен', () => {
  const G = bare();
  for (const r of G.map.rooms) r.seen = false;
  wearAcc(G, 'owleye');
  assert.ok(G.map.rooms.every((r) => r.seen));
  const cell = bagPotion(G, 'mapscroll');
  assert.equal(usePotion(G, cell), false);
});

test('«Двойной хвост» и «Прыть»: заряды рывка копятся и тратятся по одному', () => {
  const G = bare();
  wearAcc(G, 'twintail');
  addGift(G, 'pounce');
  assert.equal(G.player.st.dashCharges, 3);
  G.player.charges = 3;
  runSteps(G, 1, makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }));
  assert.equal(G.player.charges, 2, 'один заряд потрачен, остальные целы');
});

// ---------- рывок с вещами ----------

function dashWith(G) {
  return runUntil(G, (g) => !g.player.dash, { seconds: 2, input: makeInput({ dash: true, dx: 1, dy: 0, dp: 1 }) });
}

test('«Ледяной след» и «Паучий шёлк»: задетый рывком замёрз или замедлен, без вещей — нет', () => {
  for (const [id, field, secs] of [['icetrail', 'freeze', DASH.freeze], ['silk', 'slow', DASH.slow]]) {
    const G = bare();
    wearAcc(G, id);
    const m = dummy(G, 250, 240);
    dashWith(G);
    assert.ok(m.hp < 1000, id);
    assert.ok(m[field] > 0 && m[field] <= secs, `${id}: ${field} ${m[field]}`);
    const H = bare();
    const n = dummy(H, 250, 240);
    dashWith(H);
    assert.ok(n.hp < 1000);
    assert.equal(n.freeze + n.slow, 0, `${id}: без вещи нет`);
  }
});

test('«Огненный хвост»: за рывком остаётся огонь на 2 с, без хвоста — нет', () => {
  const G = bare();
  wearAcc(G, 'firetail');
  const zones = () => G.room.zones.filter((z) => z.look === 'fire').length;
  dashWith(G);
  assert.ok(zones() >= 3, `огней ${zones()}`);
  assert.ok(Math.abs(DASH.trailTime - 2) <= 0.25);
  const H = bare();
  dashWith(H);
  assert.equal(H.room.zones.filter((z) => z.look === 'fire').length, 0);
});

test('«Громовой бубенец»: приземление бьёт на 2 тех, кто рядом, и не бьёт дальних', () => {
  const run = (bell) => {
    const G = bare();
    if (bell) wearAcc(G, 'bell');
    const close = dummy(G, 348 + 30, 240);
    const far1 = dummy(G, 348 + 120, 240);
    dashWith(G);
    return [1000 - close.hp, 1000 - far1.hp];
  };
  const [plainNear, plainFar] = run(false);
  const [bellNear, bellFar] = run(true);
  assert.equal(bellNear - plainNear, DASH.shockDmg);
  assert.equal(bellFar, plainFar, 'дальних не бьёт');
});

test('«Друг-светлячок»: бьёт ближнего врага на 1 примерно раз в секунду, дальнего не трогает', () => {
  const G = bare();
  G.god = true;
  wearAcc(G, 'glowbug');
  const m = dummy(G, 200 + PERK.bugRange - 20, 240);
  const far1 = dummy(G, 200 + PERK.bugRange + 60, 240);
  runSteps(G, 60 * 5 + 20);
  assert.ok(m.hp <= 1000 - 4 && m.hp >= 1000 - 6, `ударов ${1000 - m.hp}`);
  assert.equal(far1.hp, 1000);
});
