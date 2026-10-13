// Лисья охота: расчёт игры одним входом. Лиса бегает по закрытым комнатам, рывком ловит кроликов и бьёт врагов,
// уходит от красных зон (лось, медвежья лапа), между охотами выполняет задания, собирает вещи и оружие; три
// жизни, локации идут одна за другой, пока жизни не кончатся. Счёт — очки. Без DOM, тестируется в Node.
//
// Расчёт разложен по файлам: core (числа, случайность, геометрия), world (комната и клетки), player (лиса),
// inventory (вещи), combat и patterns (бой и оружие), ai (звери), director (ход комнаты), floor (карта локации),
// balance (все числа). Содержимое — звери, оружие, вещи, комнаты, места, задания — лежит данными в своих файлах
// и собирается в content.js. Здесь — то, чем пользуются игра, окна, бот и тесты: новая партия, шаг, действия
// с рюкзаком, сохранение, статистика.
//
// Шаг — всегда 1/60 с; случайность — от зерна в состоянии (G.rs), так что одна партия с одним вводом идёт
// одинаково. Рисование и звук ничего не решают: они читают состояние и разбирают очередь событий (drain).

import './content.js';
import {
  VERSION, H, T, REG, BIOME_NAMES, hash2, clamp, own, kindOf, emit, banner,
} from './core.js';
import { FOX, LIMITS, PICK } from './balance.js';
import { OPPOSITE, standable, doorAt, updateFlow, stepActors, freeSpot } from './world.js';
import { newPlayer, recalc, stepPlayer, placePlayer, heal, addMana, BUILTIN_FX } from './player.js';
import {
  newInventory, giveItem, takeGift, equip, unequip, dropItem, usePotion, chooseGift, itemInfo, stepPicks, ACC_SLOTS, BAG_SLOTS,
} from './inventory.js';
import { stepShots, stepZones } from './combat.js';
import { spawnMob, stepMobs, stepPals, hireMinion } from './ai.js';
import { enterRoom, nextFloor, stepDirector, stepThings, forceClear, leftOf } from './director.js';
import { generateFloor, checkMap, biomeOf, loopOf } from './floor.js';

export { VERSION, H, T };
export { equip, unequip, dropItem, usePotion, chooseGift, itemInfo };

const COUNTERS = ['rabbits', 'kills', 'bosses', 'tasks', 'dashes', 'hurt', 'coins', 'items', 'rooms', 'floors', 'donated'];

// ---------- новая партия ----------

/**
 * Новая партия с зерном seed. opts: floor — с какой локации начать (отладка); donated — сколько монет игрок
 * уже пожертвовал колодцу за все партии (вехи колодца считаются от этого).
 */
export function newRun(seed, opts = {}) {
  const s = (seed >>> 0) || 1;
  const floor = Number.isInteger(opts.floor) && opts.floor >= 1 ? Math.min(opts.floor, 9999) : 1;
  const cnt = {};
  for (const k of COUNTERS) cnt[k] = 0;
  const G = {
    v: VERSION, seed: s, rs: hash2(s, 0x5eed) || 1, time: 0,
    floor, biome: biomeOf(floor), loop: loopOf(floor),
    score: 0, coins: 0, lives: FOX.lives, over: false, pending: null,
    player: newPlayer(), inv: newInventory(), gifts: [], minions: [],
    map: null, room: null, cnt, seen: [], flags: {}, events: [],
    exit: null, god: false,
  };
  if (Number.isInteger(opts.donated) && opts.donated > 0) G.flags.donated = opts.donated;
  recalc(G);
  G.map = generateFloor(s, floor);
  enterRoom(G, G.map.startId, 'c');
  emit(G, { t: 'floor', n: floor, biome: G.biome });
  banner(G, `Локация ${floor}`, BIOME_NAMES[G.biome] ?? '', 'floor');
  return G;
}

// ---------- шаг ----------

const IDLE = Object.freeze({ mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 });

function tick(G, input, first) {
  stepPlayer(G, input, first);
  if (G.over) return;
  if (G.exit) {
    // лиса вышла в дверь: соседняя комната, вход с противоположной стороны
    const side = G.exit;
    G.exit = null;
    const door = G.room.doors[side];
    if (door && G.map.rooms[door.to]) {
      emit(G, { t: 'leave', side, to: door.to });
      enterRoom(G, door.to, OPPOSITE[side]);
      G.time += H;
      return;
    }
  }
  stepDirector(G, H);
  stepMobs(G, H);
  stepPals(G, H);
  stepShots(G, H);
  stepZones(G, H);
  stepActors(G.room, H);
  stepPicks(G, H);
  stepThings(G, H);
  G.time += H;
}

/**
 * Продвинуть партию. input — ввод (один и тот же объект каждый кадр, числа):
 *   mx, my — куда идти (длина до 1); fire — правый стик зажат на месте (действие рядом с предметом, иначе
 *   выстрел); act — разовое «действие» (клавиша); aim, ax, ay, ap — идёт прицеливание рывка: направление и сила
 *   0…1; dash, dx, dy, dp — разовый рывок: направление и сила; hasT, tx, ty — точка, куда стрелять (мышь), без неё
 *   оружие целится само.
 * dt — кратно шагу H (обычно ровно H); разовые команды учитываются только в первом шаге. Пока партия окончена
 * или ждёт выбора дара (G.pending), шаг ничего не делает.
 */
export function step(G, input = IDLE, dt = H) {
  if (!G || G.over || G.pending || !(dt > 0)) return;
  const n = clamp(Math.round(dt / H), 1, 4);
  for (let i = 0; i < n; i++) {
    tick(G, input, i === 0);
    if (G.over || G.pending) break;
  }
}

/** Забрать накопившиеся события (и очистить очередь). */
export function drain(G) {
  const out = G.events;
  G.events = [];
  return out;
}

// ---------- итоги и статистика ----------

/** Итог партии — для экрана результата и статистики. */
export function runSummary(G) {
  return {
    score: G.score, floor: G.floor, biome: G.biome, rabbits: G.cnt.rabbits, kills: G.cnt.kills, bosses: G.cnt.bosses,
    tasks: G.cnt.tasks, coins: G.cnt.coins, time: Math.round(G.time),
  };
}

export const emptyStats = () => ({ games: 0, best: 0, rabbits: 0, foes: 0, bosses: 0, rooms: 0, tasks: 0, coins: 0, deep: 0, donated: 0 });

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const nat = (v) => Number.isInteger(v) && v >= 0;
const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Годится ли статистика: все её поля — целые неотрицательные (устройства сливают их по одному, без связей между полями). */
export function isValidStats(v) {
  return plain(v) && Object.keys(emptyStats()).every((k) => nat(v[k]));
}

/** Статистика после партии: счётчики прибавляются, рекорд и самая дальняя локация — наибольшие. */
export function applyRun(stats, G) {
  const c = G.cnt;
  return {
    games: stats.games + 1,
    best: Math.max(stats.best, G.score),
    rabbits: stats.rabbits + c.rabbits,
    foes: stats.foes + c.kills,
    bosses: stats.bosses + c.bosses,
    rooms: stats.rooms + c.rooms,
    tasks: stats.tasks + c.tasks,
    coins: stats.coins + c.coins,
    deep: Math.max(stats.deep, G.floor),
    donated: stats.donated + c.donated,
  };
}

// ---------- сохранение ----------

const SIDE_NAMES = ['n', 'e', 's', 'w'];
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Снимок идущей партии — чистые данные для сохранения (или null: партия окончена). Живая комната не
 * сохраняется: после загрузки лиса заново входит в неё той же стороной, а недобитая охота начинается сначала.
 */
export function snapshot(G) {
  if (!G || G.over || !G.map || !G.room) return null;
  const P = G.player;
  const rooms = G.map.rooms.map((r) => ({
    id: r.id, gx: r.gx, gy: r.gy, type: r.type, tpl: r.tpl, flip: r.flip, state: r.state, seen: Boolean(r.seen),
    doors: { n: r.doors.n, e: r.doors.e, s: r.doors.s, w: r.doors.w }, data: clone(r.data ?? {}), mod: r.mod ?? null,
  }));
  const left = leftOf(G.room);
  if (left.length) rooms[G.map.cur].data.left = left;
  const fx = {};
  for (const k of Object.keys(P.fx)) if (P.fx[k] > 0) fx[k] = P.fx[k];
  return {
    v: VERSION, seed: G.seed, rs: G.rs, time: G.time,
    floor: G.floor, biome: G.biome, loop: G.loop,
    score: G.score, coins: G.coins, lives: G.lives, over: false,
    pending: G.pending ? { kind: 'gift', options: [...G.pending.options] } : null,
    player: {
      x: P.x, y: P.y, face: P.face, dir: P.dir,
      // потеряла жизнь и ещё лежит — поднимется уже с полными сердцами
      hp: P.down > 0 ? P.st.maxHp : P.hp, mana: P.mana, shield: P.shield, shieldT: P.shieldT, regenT: P.regenT,
      inv: P.inv, charges: P.charges, chargeT: P.chargeT, wcd: Math.max(0, P.wcd), fx, kills: P.kills, blocks: P.blocks,
    },
    inv: clone(G.inv), gifts: [...G.gifts], minions: G.minions.map((m) => ({ id: m.id, hp: m.hp })),
    map: { rooms, cur: G.map.cur, entry: G.map.entry, bossId: G.map.bossId, startId: G.map.startId, hunts: G.map.hunts },
    cnt: { ...G.cnt }, seen: [...G.seen], flags: clone(G.flags),
  };
}

function validItem(it, kind) {
  if (it === null) return true;
  if (!plain(it) || !Object.keys(it).every((k) => k === 'id' || k === 'lvl')) return false;
  const k = kindOf(it.id);
  if (!k || (kind && k !== kind)) return false;
  return it.lvl === undefined || (nat(it.lvl) && it.lvl <= 9);
}

// Свои данные места в записи комнаты: что угодно, но только то, что переживает JSON, и в разумных пределах.
function validData(v, depth = 0) {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.length <= 80;
  if (depth >= 5) return false;
  if (Array.isArray(v)) return v.length <= 40 && v.every((x) => validData(x, depth + 1));
  if (!plain(v)) return false;
  const keys = Object.keys(v);
  return keys.length <= 32 && keys.every((k) => k.length <= 32 && validData(v[k], depth + 1));
}

function validLeft(left) {
  if (left === undefined) return true;
  if (!Array.isArray(left) || left.length > 12) return false;
  return left.every((e) => plain(e) && num(e.x) && num(e.y) && e.x >= 0 && e.y >= 0 && e.x <= 2000 && e.y <= 2000
    && ((e.k === 'item' && kindOf(e.id) && nat(e.lvl) && e.lvl <= 9) || (e.k === 'heart' && nat(e.v) && e.v >= 1 && e.v <= 9)));
}

/** Годится ли сохранённая партия, чтобы её продолжить: типы, пределы, известные id, целая карта. */
export function isValidState(d) {
  if (!plain(d) || d.v !== VERSION || d.over !== false) return false;
  if (!nat(d.seed) || d.seed < 1 || d.seed > 0xffffffff || !nat(d.rs) || d.rs > 0xffffffff) return false;
  if (!num(d.time) || d.time < 0 || d.time > 1e7) return false;
  if (!nat(d.floor) || d.floor < 1 || d.floor > 9999 || d.biome !== biomeOf(d.floor) || d.loop !== loopOf(d.floor)) return false;
  if (!nat(d.score) || !nat(d.coins) || d.coins > 1e7 || !nat(d.lives) || d.lives < 1 || d.lives > 9) return false;
  if (d.pending !== null) {
    const o = d.pending;
    if (!plain(o) || o.kind !== 'gift' || !Array.isArray(o.options) || o.options.length < 1 || o.options.length > 3) return false;
    if (!o.options.every((id) => own(REG.GIFTS, id))) return false;
  }

  const p = d.player;
  if (!plain(p) || !num(p.x) || !num(p.y) || p.x < 0 || p.y < 0 || p.x > 2000 || p.y > 2000) return false;
  if ((p.face !== 1 && p.face !== -1) || !num(p.dir) || Math.abs(p.dir) > 100) return false;
  if (!nat(p.hp) || p.hp < 1 || p.hp > LIMITS.maxHp[1] || !num(p.mana) || p.mana < 0 || p.mana > LIMITS.maxMana[1]) return false;
  if (!nat(p.shield) || p.shield > LIMITS.maxShield[1] || !nat(p.charges) || p.charges > LIMITS.dashCharges[1]) return false;
  for (const k of ['shieldT', 'regenT', 'inv', 'chargeT', 'wcd']) if (!num(p[k]) || p[k] < 0 || p[k] > 100) return false;
  if (!nat(p.kills) || !nat(p.blocks) || p.blocks > 20) return false;
  if (!plain(p.fx)) return false;
  for (const k of Object.keys(p.fx)) {
    if (!BUILTIN_FX.includes(k) && !own(REG.EFFECTS, k)) return false;
    if (!num(p.fx[k]) || p.fx[k] < 0 || p.fx[k] > 3600) return false;
  }

  const inv = d.inv;
  if (!plain(inv) || !validItem(inv.weapon ?? null, 'weapon') || !validItem(inv.armor ?? null, 'armor')) return false;
  if (inv.weapon === undefined || inv.armor === undefined) return false;
  if (!Array.isArray(inv.acc) || inv.acc.length !== ACC_SLOTS || !inv.acc.every((it) => validItem(it, 'acc'))) return false;
  if (!Array.isArray(inv.bag) || inv.bag.length !== BAG_SLOTS || !inv.bag.every((it) => validItem(it))) return false;
  if (!Array.isArray(d.gifts) || d.gifts.length > 80 || !d.gifts.every((id) => own(REG.GIFTS, id))) return false;
  if (!Array.isArray(d.minions) || d.minions.length > LIMITS.palSlots[1]) return false;
  if (!d.minions.every((m) => plain(m) && own(REG.MINIONS, m.id) && nat(m.hp) && m.hp >= 1 && m.hp <= 999)) return false;

  const map = d.map;
  if (!plain(map) || checkMap(map).length) return false;
  if (!nat(map.cur) || map.cur >= map.rooms.length || !nat(map.hunts) || map.hunts > map.rooms.length) return false;
  if (map.entry !== 'c' && !(SIDE_NAMES.includes(map.entry) && map.rooms[map.cur].doors[map.entry] >= 0)) return false;
  for (const r of map.rooms) {
    if (!['new', 'active', 'cleared'].includes(r.state) || typeof r.seen !== 'boolean') return false;
    if (r.mod !== null && !own(REG.MODS, r.mod)) return false;
    if (!plain(r.data) || !validData(r.data) || !validLeft(r.data.left)) return false;
    if (!SIDE_NAMES.every((s) => Number.isInteger(r.doors[s]))) return false;
  }
  if (!map.rooms[map.cur].seen) return false;

  if (!plain(d.cnt) || !COUNTERS.every((k) => nat(d.cnt[k]))) return false;
  if (!Array.isArray(d.seen) || d.seen.length > 400 || new Set(d.seen).size !== d.seen.length || !d.seen.every((id) => kindOf(id))) return false;
  return plain(d.flags) && validData(d.flags);
}

/** Партия из снимка — или null, если снимок не годится. Лиса заново входит в свою комнату. */
export function restore(data) {
  if (!isValidState(data)) return null;
  const d = clone(data);
  const G = {
    v: VERSION, seed: d.seed, rs: d.rs, time: d.time,
    floor: d.floor, biome: d.biome, loop: d.loop,
    score: d.score, coins: d.coins, lives: d.lives, over: false, pending: d.pending,
    player: newPlayer(), inv: d.inv, gifts: d.gifts, minions: d.minions,
    map: d.map, room: null, cnt: d.cnt, seen: d.seen, flags: d.flags, events: [],
    exit: null, god: false,
  };
  const P = G.player;
  const s = d.player;
  P.face = s.face;
  P.hp = s.hp;
  P.mana = s.mana;
  P.shield = s.shield;
  P.shieldT = s.shieldT;
  P.regenT = s.regenT;
  P.inv = s.inv;
  P.charges = s.charges;
  P.chargeT = s.chargeT;
  P.wcd = s.wcd;
  P.kills = s.kills;
  for (const k of Object.keys(s.fx)) P.fx[k] = s.fx[k];
  // недобитая охота начинается сначала
  for (const r of G.map.rooms) if (r.state === 'active') r.state = 'new';
  recalc(G);
  const calm = G.map.rooms[G.map.cur].state === 'cleared';
  enterRoom(G, G.map.cur, G.map.entry);
  P.dir = s.dir;
  P.blocks = Math.min(s.blocks, P.st.flags.roomBlock);
  // в спокойной комнате лиса остаётся там, где стояла
  if (calm && standable(G.room, s.x, s.y) && !doorAt(G.room, s.x, s.y)) {
    placePlayer(G, s.x, s.y);
    updateFlow(G.room, P.x, P.y);
  }
  emit(G, { t: 'floor', n: G.floor, biome: G.biome, resumed: true });
  return G;
}

// ---------- отладка ----------

export const cheat = {
  /** Выдать: вещь, дар или спутника по id ('gift:id', 'minion:id' — если имена совпали); 'coins', 'mana', 'heart'. */
  give(G, id) {
    if (id === 'coins') {
      G.coins += 100;
      return true;
    }
    if (id === 'mana') return addMana(G, PICK.flask * 3) >= 0;
    if (id === 'heart') return heal(G, 99) >= 0;
    if (typeof id !== 'string') return false;
    if (id.startsWith('gift:')) return takeGift(G, id.slice(5));
    if (id.startsWith('minion:')) return hireMinion(G, id.slice(7));
    if (kindOf(id)) return Boolean(giveItem(G, { id, lvl: 0 }));
    if (own(REG.GIFTS, id)) return takeGift(G, id);
    if (own(REG.MINIONS, id)) return hireMinion(G, id);
    return false;
  },
  /** Перенестись в комнату такого типа на этой локации ('hunt', 'boss', 'shop', 'treasure'…). */
  warp(G, type) {
    const rooms = G.map.rooms;
    const to = rooms.find((r) => r.type === type && r.id !== G.map.cur) ?? rooms.find((r) => r.type === type);
    if (!to) return false;
    enterRoom(G, to.id, 'c');
    return true;
  },
  nextFloor(G) {
    nextFloor(G);
    return true;
  },
  /** Зверь id в свободном месте неподалёку от лисы. */
  spawn(G, id) {
    const at = freeSpot(G, 3 * T, 8 * T) ?? G.room.center;
    return spawnMob(G, id, at.x, at.y);
  },
  /** Неуязвимость лисы. */
  god(G, on) {
    G.god = Boolean(on);
  },
  /** Закончить бой в комнате сразу. */
  clear(G) {
    forceClear(G);
  },
};
