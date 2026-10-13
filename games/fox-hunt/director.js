// Ход комнаты «Лисьей охоты»: вход, волны охоты, появление зверей из меток, напасти, задания в передышку,
// зачистка и награда, бой с хозяином места, переход на следующую локацию; действие лисы с тем, что в фокусе.
// Без DOM.
//
// Охотничья комната: лиса зашла на две клетки — двери закрываются; через 0,8 с выходит волна (добыча из нор по
// одной, враги — из меток с предупреждением). Волна кончается, когда врагов не осталось, а добыча поймана или
// ушла в норы. Между волнами — передышка, иногда с заданием. После последней двери открываются.
// Комната хозяина: закрылись двери → плашка и выход хозяина → бой (его ведёт описание хозяина) → после гибели:
// портал, сундук, выбор дара.
//
// Состояние хода — room.dir: { mode, t, wave, waves, queue, … }. mode: 'enter' (ждём, пока лиса зайдёт),
// 'ready' (двери закрыты), 'wave', 'calm', 'intro', 'boss', 'fight' (бой, затеянный местом), 'reward', 'cleared'.

import {
  T, F_MOB, REG, BIOME_NAMES, rnd, rndOf, rngFrom, hash2, pickOf, kindOf, own, emit, sfx, banner, haptic, shake,
} from './core.js';
import { HUNT, MOB, PICK, PREY, CLEAR_REWARD, planWave, hazardsFor, hazardGap, wavesPerRoom } from './balance.js';
import {
  makeRoom, disposeRoom, entryPoint, setDoors, updateFlow, freeSpot, standable, circleHits, addThing, addPick,
  dropCoins, clearZones, updateFocus, SPOT,
} from './world.js';
import { placePlayer, recalc } from './player.js';
import { spawnMob, spawnPals } from './ai.js';
import { clearShots, killMob } from './combat.js';
import { takeItemPick, rollItem, giftOptions } from './inventory.js';
import { generateFloor, biomeOf, loopOf } from './floor.js';

const newDir = () => ({
  mode: 'cleared', kind: '', t: 0, wave: 0, waves: 0, queue: [],
  hazT: 0, hazI: 0, strikeEnd: -99, giftT: -1, done: null, challenge: false,
});

const modOf = (room) => (room.mod && own(REG.MODS, room.mod) ? REG.MODS[room.mod] : null);

// ---------- вход и выход ----------

const LEFT_MAX = 12;

/** Что остаётся лежать в комнате, когда лиса уходит: вещи и сердца (монеты и ману она и так забирает). */
export function leftOf(room) {
  const out = [];
  for (const p of room.picks) {
    if (out.length >= LEFT_MAX) break;
    if (p.kind === 'item' && p.id) out.push({ k: 'item', x: Math.round(p.x), y: Math.round(p.y), id: p.id, lvl: p.lvl | 0 });
    else if (p.kind === 'heart' && !p.tag) out.push({ k: 'heart', x: Math.round(p.x), y: Math.round(p.y), v: Math.max(1, p.v | 0) });
  }
  return out;
}

function restoreLeft(G, mr) {
  const left = mr.data.left;
  delete mr.data.left;
  if (!Array.isArray(left)) return;
  for (const e of left) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    let p = null;
    if (e.k === 'item' && kindOf(e.id)) p = addPick(G, 'item', e.x, e.y, 1, e.id, e.lvl | 0, false);
    else if (e.k === 'heart') p = addPick(G, 'heart', e.x, e.y, Math.max(1, e.v | 0), null, 0, false);
    if (p) p.t = 1;
  }
}

/**
 * Войти в комнату id карты через сторону entry ('n' | 'e' | 's' | 'w' — дверь, 'c' — у своей норы). Прежняя
 * комната запоминает оставленные вещи; новая собирается из шаблона, место строит свою обстановку.
 */
export function enterRoom(G, id, entry) {
  const map = G.map;
  const P = G.player;
  if (G.room) {
    const old = map.rooms[G.room.id];
    if (old && G.room.floor === G.floor) {
      const left = leftOf(G.room);
      if (left.length) old.data.left = left;
    }
    disposeRoom(G.room);
    clearShots(G.room);
  }
  const mr = map.rooms[id];
  map.cur = id;
  map.entry = entry;
  mr.seen = true;
  const room = makeRoom(G, mr);
  room.floor = G.floor;
  room.dir = newDir();
  G.room = room;
  G.exit = null;
  // обстановка комнаты случайна от её собственного зерна: сколько раз в неё ни войди (и после загрузки тоже),
  // она соберётся одинаково, а случайность партии останется нетронутой
  const keep = G.rs;
  G.rs = hash2(room.seed, 0x1ee7) || 1;
  const at = entryPoint(room, entry, SPOT);
  placePlayer(G, at.x, at.y);
  P.blocks = P.st.flags.roomBlock;
  updateFlow(room, P.x, P.y);
  spawnPals(G);
  restoreLeft(G, mr);

  const dir = room.dir;
  if (mr.type === 'hunt' || mr.type === 'boss') {
    if (mr.state === 'cleared') {
      if (mr.type === 'boss') restoreBossRoom(G, mr);
    } else {
      mr.state = 'new';
      dir.mode = 'enter';
      dir.kind = mr.type;
      if (mr.type === 'hunt') {
        const mod = modOf(room);
        dir.waves = wavesPerRoom(G.floor);
        room.hazards = mod?.noHazards ? [] : hazardsFor(G.floor, G.loop, G.biome, map.hunts, rngFrom(room.seed ^ 0x77));
        if (mod?.hazards) for (const h of mod.hazards) if (own(REG.HAZARDS, h) && !room.hazards.includes(h)) room.hazards.push(h);
      }
    }
  } else {
    // особая комната и начало локации: боя нет, обстановку ставит место
    mr.state = 'cleared';
    const r = rngFrom(room.seed ^ 0x51ed);
    if (mr.type === 'start') {
      for (const pid of Object.keys(REG.PLACES)) if (REG.PLACES[pid].spot === 'start') REG.PLACES[pid].build?.(G, room, mr, r);
    } else if (own(REG.PLACES, mr.type)) REG.PLACES[mr.type].build?.(G, room, mr, r);
  }
  // где боя нет, монеты и мана летят к лисе сами (в охоте — только когда комната зачищена)
  room.vacuum = mr.state === 'cleared';
  emit(G, { t: 'room', id, type: mr.type });
  const mod = modOf(room);
  if (mod && mr.state !== 'cleared') {
    banner(G, mod.name ?? '', mod.text ?? '', 'mod');
    sfx(G, 'banner');
  }
  if (mod?.apply) mod.apply(G, room);
  G.rs = keep;
  return room;
}

/** Новая локация: карта, первая комната, плашка. */
export function nextFloor(G) {
  G.cnt.floors += 1;
  G.floor += 1;
  G.loop = loopOf(G.floor);
  G.biome = biomeOf(G.floor);
  G.map = generateFloor(G.seed, G.floor);
  enterRoom(G, G.map.startId, 'c');
  recalc(G);                                // «глаз совы» открывает и новую карту
  emit(G, { t: 'floor', n: G.floor, biome: G.biome });
  banner(G, `Локация ${G.floor}`, BIOME_NAMES[G.biome] ?? '', 'floor');
  sfx(G, 'floor');
}

// ---------- двери и бои ----------

function lock(G) {
  const room = G.room;
  const dir = room.dir;
  setDoors(G, false);
  sfx(G, 'lock');
  G.map.rooms[room.id].state = 'active';
  dir.mode = 'ready';
  dir.t = 0;
}

function unlock(G) {
  setDoors(G, true);
  sfx(G, 'door');
}

// зашла ли лиса в комнату на две клетки от двери
function inside(G) {
  const room = G.room;
  const P = G.player;
  const d = room.doors[G.map.entry];
  return !d || Math.hypot(P.x - d.x, P.y - d.y) >= HUNT.inside + 8;
}

/** Поставить в очередь появления: зверь id выйдет через delay секунд (добыча — из норы, враг — из метки). */
export function queueMob(G, id, elite = false, delay = 0) {
  const def = REG.MOBS[id];
  if (!def) return;
  G.room.dir.queue.push({ id, elite, at: delay, prey: def.kind === 'prey' });
}

// Где появиться врагу: метка S не ближе пяти клеток от лисы; нет такой — свободная клетка подальше.
function hostileSpot(G) {
  const room = G.room;
  const P = G.player;
  let pick = null;
  let seen = 0;
  let far = null;
  let farD = -1;
  for (let i = 0; i < room.spawns.length; i++) {
    const s = room.spawns[i];
    const d = Math.hypot(s.x - P.x, s.y - P.y);
    if (d > farD) {
      farD = d;
      far = s;
    }
    if (d < MOB.farSpawn) continue;
    seen += 1;
    if (rnd(G) * seen < 1) pick = s;
  }
  if (!pick) pick = freeSpot(G, MOB.farSpawn, 1e9) ?? far ?? room.center;
  let x = pick.x + (rnd(G) - 0.5) * 16;
  let y = pick.y + (rnd(G) - 0.5) * 16;
  if (!standable(room, x, y, 12) || circleHits(room, x, y, 12, F_MOB)) {
    x = pick.x;
    y = pick.y;
  }
  SPOT.x = x;
  SPOT.y = y;
  return SPOT;
}

function spawnQueued(G, e) {
  const room = G.room;
  if (e.prey) {
    const b = room.burrows.length ? pickOf(G, room.burrows) : freeSpot(G, 3 * T, 1e9) ?? room.center;
    const m = spawnMob(G, e.id, b.x, b.y);
    if (m) {
      // выскакивает из норы: сразу настороже
      m.state = 'alert';
      m.t = PREY.alert - PREY.pop;
    }
    return;
  }
  const at = hostileSpot(G);
  spawnMob(G, e.id, at.x, at.y, { elite: e.elite });
}

function stepQueue(G, dt) {
  const q = G.room.dir.queue;
  for (let i = q.length - 1; i >= 0; i--) {
    q[i].at -= dt;
    if (q[i].at > 0) continue;
    const e = q[i];
    q[i] = q[q.length - 1];
    q.pop();
    spawnQueued(G, e);
  }
}

// жив ли кто-то из зверей (добыча считается: волна ждёт, пока её поймают или она уйдёт)
function anyAlive(room, hostileOnly) {
  const mobs = room.mobs;
  for (let i = 0; i < mobs.length; i++) if (!mobs[i].dead && (!hostileOnly || mobs[i].kind !== 0)) return true;
  return false;
}

function startWave(G, i) {
  const room = G.room;
  const dir = room.dir;
  const st = G.player.st;
  const r = rndOf(G);
  const mod = modOf(room);
  dir.mode = 'wave';
  dir.t = 0;
  dir.wave = i;
  const plan = planWave(G.floor, G.loop, G.map.hunts, i, r);
  const prey = plan.prey ?? [];
  const total = prey.length ? Math.min(24, Math.round(prey.length * (mod?.preyMul ?? 1)) + st.rabbitsPlus + (mod?.preyPlus ?? 0)) : 0;
  for (let k = 0; k < total; k++) dir.queue.push({ id: prey[k % prey.length], elite: false, at: 0.3 + k * HUNT.preyGap, prey: true });
  const mobs = plan.mobs ?? [];
  for (let k = 0; k < mobs.length; k++) dir.queue.push({ id: mobs[k].id, elite: Boolean(mobs[k].elite), at: 0.2 + k * HUNT.mobGap, prey: false });
  dir.hazT = hazardGap(G.floor, G.loop, r) * (0.45 + 0.4 * r()) / (mod?.hazardMul ?? 1);
  emit(G, { t: 'wave', n: i + 1, of: dir.waves });
}

function endWave(G) {
  const room = G.room;
  const dir = room.dir;
  if (room.task) finishTask(G, true);                       // задание «на всю волну» дожило до её конца
  if (dir.wave + 1 >= dir.waves) {
    if (dir.challenge) endFight(G);
    else clearRoom(G);
    return;
  }
  dir.mode = 'calm';
  dir.t = 0;
  // в самой первой охоте заданий нет — сначала знакомство с добычей
  const novice = G.floor === 1 && G.loop === 0 && G.map.hunts === 0;
  if (!dir.challenge && !novice && rnd(G) < HUNT.taskChance) startTask(G);
}

function stepHazards(G, dt) {
  const room = G.room;
  const dir = room.dir;
  if (!room.hazards.length) return;
  dir.hazT -= dt;
  if (dir.hazT > 0) return;
  // два удара напастей подряд — не чаще strikeGap: следующая предупреждает не раньше, чем можно
  if (G.time < dir.strikeEnd + HUNT.strikeGap - HUNT.minWarn) {
    dir.hazT = 0.1;
    return;
  }
  const def = REG.HAZARDS[room.hazards[dir.hazI % room.hazards.length]];
  dir.hazI += 1;
  const r = rndOf(G);
  dir.hazT = hazardGap(G.floor, G.loop, r) / (modOf(room)?.hazardMul ?? 1);
  if (!def?.fire) return;
  const zones = room.zones;
  const before = zones.length;
  def.fire(G, room, r);
  let end = G.time + HUNT.minWarn;
  for (let i = before; i < zones.length; i++) {
    const z = zones[i];
    if (z.from === 1 && z.total < HUNT.minWarn) z.total = HUNT.minWarn;
    end = Math.max(end, G.time + z.wait + z.total);
  }
  dir.strikeEnd = end;
}

function reward(G) {
  const room = G.room;
  const P = G.player;
  let total = 0;
  for (const e of CLEAR_REWARD) total += e[0];
  let at = rnd(G) * total;
  let what = 'none';
  for (const e of CLEAR_REWARD) {
    at -= e[0];
    if (at < 0) {
      what = e[1];
      break;
    }
  }
  const x = standable(room, room.center.x, room.center.y) ? room.center.x : P.x;
  const y = standable(room, room.center.x, room.center.y) ? room.center.y : P.y;
  if (what === 'coins') dropCoins(G, x, y, 3 + Math.floor(rnd(G) * 4) + Math.min(6, G.floor));
  else if (what === 'heart') addPick(G, 'heart', x, y, 1);
  else if (what === 'mana') {
    addPick(G, 'mana', x, y, PICK.mana);
    addPick(G, 'mana', x, y, PICK.mana);
  } else if (what === 'item') {
    const it = rollItem(G);
    if (it) addPick(G, 'item', x, y, 1, it.id, 0);
  }
}

function clearRoom(G) {
  const room = G.room;
  const dir = room.dir;
  const mr = G.map.rooms[room.id];
  dir.mode = 'cleared';
  dir.t = 0;
  dir.queue.length = 0;
  mr.state = 'cleared';
  if (mr.type === 'hunt') G.map.hunts += 1;
  G.cnt.rooms += 1;
  clearZones(room, 1);
  clearShots(room, 1);
  unlock(G);
  sfx(G, 'clear');
  emit(G, { t: 'clear' });
  haptic(G, 'success');
  room.vacuum = true;
  reward(G);
  for (const n of room.pals) {
    if (n.dead || n.hp >= n.maxHp) continue;
    n.hp += 1;
    n.rec.hp = n.hp;
  }
}

/**
 * Бой, который затеяло место (зубастый сундук, засада): двери закрываются и откроются, когда врагов не останется.
 * Врагов место ставит само (spawnMob) или в очередь (queueMob). done(G) — что сделать после победы.
 */
export function startFight(G, done = null) {
  const dir = G.room.dir;
  if (dir.mode !== 'cleared') return false;
  setDoors(G, false);
  sfx(G, 'lock');
  dir.mode = 'fight';
  dir.t = 0;
  dir.done = done;
  dir.challenge = false;
  G.room.vacuum = false;
  return true;
}

/** Испытание: waves волн, как в охотничьей комнате, по желанию игрока (тотем). done(G) — после последней. */
export function startChallenge(G, waves = 3, done = null) {
  const room = G.room;
  const dir = room.dir;
  if (dir.mode !== 'cleared') return false;
  setDoors(G, false);
  sfx(G, 'lock');
  dir.mode = 'ready';
  dir.kind = 'hunt';
  dir.t = 0;
  dir.waves = Math.max(1, waves);
  dir.done = done;
  dir.challenge = true;
  room.vacuum = false;
  return true;
}

function endFight(G) {
  const room = G.room;
  const dir = room.dir;
  const done = dir.done;
  dir.mode = 'cleared';
  dir.t = 0;
  dir.done = null;
  dir.challenge = false;
  dir.queue.length = 0;
  clearZones(room, 1);
  clearShots(room, 1);
  unlock(G);
  sfx(G, 'clear');
  emit(G, { t: 'clear' });
  room.vacuum = true;
  if (done) done(G);
}

// ---------- задания ----------

/**
 * Начать задание (id из quests.js; без id — случайное из подходящих). false — не началось: такого нет или
 * описание отказалось (start вернул false).
 */
export function startTask(G, id = null) {
  const room = G.room;
  if (room.task) return false;
  const r = rndOf(G);
  let pick = id;
  if (!pick) {
    const fits = Object.keys(REG.TASKS).filter((k) => (REG.TASKS[k].minFloor ?? 1) <= G.floor);
    pick = r.weighted(fits, (k) => REG.TASKS[k].weight ?? 1);
  }
  const def = pick && own(REG.TASKS, pick) ? REG.TASKS[pick] : null;
  if (!def) return false;
  const task = { id: pick, def, name: def.name ?? '', text: def.text ?? '', t: 0, time: def.time ?? 0, n: 0, goal: 0, data: {} };
  room.task = task;
  if (def.start && def.start(G, room, r) === false) {
    room.task = null;
    return false;
  }
  emit(G, { t: 'task', id: pick, state: 'start' });
  sfx(G, 'task');
  return true;
}

function finishTask(G, ok) {
  const room = G.room;
  const task = room.task;
  if (!task) return;
  room.task = null;
  if (task.def.finish) task.def.finish(G, task, ok);
  if (ok) G.cnt.tasks += 1;
  emit(G, { t: 'task', id: task.id, state: ok ? 'ok' : 'fail' });
  if (ok) sfx(G, 'taskok');
  else sfx(G, 'taskfail');
}

function stepTask(G, dt) {
  const task = G.room.task;
  if (!task) return;
  task.t += dt;
  let res = task.def.step ? task.def.step(G, task, dt) : 'run';
  if (res !== 'ok' && res !== 'fail' && task.time > 0 && task.t >= task.time) res = 'fail';
  if (res === 'ok' || res === 'fail') finishTask(G, res === 'ok');
}

// ---------- хозяин места ----------

function bossFor(G, room) {
  const all = Object.keys(REG.MOBS).filter((id) => REG.MOBS[id].kind === 'boss');
  const local = all.filter((id) => REG.MOBS[id].biome === G.biome);
  const list = local.length ? local : all;
  return list.length ? rngFrom(room.seed ^ 0xb055).pick(list) : null;
}

function bossIntro(G) {
  const room = G.room;
  const dir = room.dir;
  const id = bossFor(G, room);
  if (!id) {
    clearRoom(G);
    placePortal(G);
    G.map.rooms[room.id].data.portal = 1;
    return;
  }
  // хозяин выходит напротив лисы
  const P = G.player;
  let x = room.center.x * 2 - P.x;
  let y = room.center.y * 2 - P.y;
  if (!standable(room, x, y, 16) || Math.hypot(x - P.x, y - P.y) < 4 * T) {
    x = room.center.x;
    y = room.center.y;
  }
  const m = spawnMob(G, id, x, y, { warm: HUNT.bossIntro });
  dir.mode = 'intro';
  dir.t = 0;
  emit(G, { t: 'boss', id, state: 'intro' });
  banner(G, m?.def.name ?? '', 'Хозяин места', 'boss');
  sfx(G, 'boss', x, y);
}

function placePortal(G) {
  const room = G.room;
  return addThing(G, { kind: 'portal', x: room.center.x, y: room.center.y, r: 14, solid: false, usable: true, reach: 34 });
}

function placeBossChest(G, opened) {
  const room = G.room;
  let x = room.center.x + 2 * T;
  const y = room.center.y;
  if (!standable(room, x, y, 12)) x = room.center.x - 2 * T;
  return addThing(G, { kind: 'chest', x, y, r: 12, v: opened ? 1 : 0, usable: !opened, tag: 'boss', loot: { minRarity: 1, coins: 8 + 2 * G.floor } });
}

function restoreBossRoom(G, mr) {
  // хозяин побеждён, а дар ещё не выбран (игру закрыли или лиса сразу вышла) — предложить снова
  if (mr.data.gift) G.room.dir.giftT = HUNT.giftDelay;
  if (mr.data.portal) placePortal(G);
  if (mr.data.chest) placeBossChest(G, mr.data.chest === 2);
  if (Array.isArray(mr.data.extra)) {
    const r = rngFrom(G.room.seed ^ 0x51ed);
    for (const id of mr.data.extra) if (own(REG.PLACES, id)) REG.PLACES[id].build?.(G, G.room, mr, r);
  }
}

/** Хозяин места погиб (зовёт killMob): подмога разбегается, двери открыты, портал, сундук и скоро — выбор дара. */
export function bossDied(G, m) {
  const room = G.room;
  const dir = room.dir;
  const mr = G.map.rooms[room.id];
  if (room.boss === m) room.boss = null;
  if (mr.type !== 'boss' || mr.state === 'cleared') return;
  for (const o of room.mobs) {
    if (o.dead || o === m) continue;
    o.dead = true;
    emit(G, { t: 'die', x: o.x, y: o.y, id: o.id, elite: o.elite });
  }
  dir.queue.length = 0;
  clearZones(room, 1);
  clearShots(room, 1);
  G.cnt.bosses += 1;
  G.cnt.rooms += 1;
  mr.state = 'cleared';
  dir.mode = 'reward';
  dir.t = 0;
  emit(G, { t: 'boss', id: m.id, state: 'dead' });
  sfx(G, 'bossdie', m.x, m.y);
  shake(G, 0.8);
  haptic(G, 'success');
  unlock(G);
  emit(G, { t: 'clear' });
  room.vacuum = true;
  mr.data.portal = 1;
  mr.data.chest = 1;
  mr.data.gift = 1;
  placePortal(G);
  placeBossChest(G, false);
  // места, которые появляются у выхода (ворон-меняла)
  const r = rndOf(G);
  for (const id of Object.keys(REG.PLACES)) {
    const def = REG.PLACES[id];
    if (def.spot !== 'boss' || r() >= (def.chance ?? 1)) continue;
    mr.data.extra = [...(mr.data.extra ?? []), id];
    def.build?.(G, room, mr, r);
  }
  dir.giftT = HUNT.giftDelay;
}

function offerGift(G) {
  delete G.map.rooms[G.room.id].data.gift;
  const options = giftOptions(G, 3);
  if (!options.length) return;
  G.pending = { kind: 'gift', options };
  emit(G, { t: 'gift', options });
  sfx(G, 'gift');
}

// ---------- шаг ----------

/** Шаг хода комнаты. */
export function stepDirector(G, dt) {
  const room = G.room;
  const dir = room.dir;
  room.t += dt;
  dir.t += dt;
  if (room.shake > 0) room.shake = Math.max(0, room.shake - dt * 2.5);
  const mod = modOf(room);
  if (mod?.step) mod.step(G, room, dt);
  if (own(REG.PLACES, room.type) && REG.PLACES[room.type].step) REG.PLACES[room.type].step(G, room, dt);
  if (dir.giftT >= 0) {
    dir.giftT -= dt;
    if (dir.giftT < 0) offerGift(G);
  }
  switch (dir.mode) {
    case 'enter':
      if (inside(G)) lock(G);
      break;
    case 'ready':
      if (dir.t < HUNT.enter) break;
      if (dir.kind === 'boss') bossIntro(G);
      else startWave(G, 0);
      break;
    case 'wave':
      stepQueue(G, dt);
      stepHazards(G, dt);
      stepTask(G, dt);
      if (!dir.queue.length && !anyAlive(room, false)) endWave(G);
      break;
    case 'calm':
      stepTask(G, dt);
      if (dir.t >= HUNT.calm && (!room.task || room.task.def.during === 'wave')) startWave(G, dir.wave + 1);
      break;
    case 'intro':
      if (dir.t >= HUNT.bossIntro) {
        dir.mode = 'boss';
        dir.t = 0;
      }
      break;
    case 'boss':
      stepQueue(G, dt);
      break;
    case 'fight':
      stepQueue(G, dt);
      if (!dir.queue.length && !anyAlive(room, true)) endFight(G);
      break;
    default:
      stepTask(G, dt);
  }
}

/** Закончить всё, что идёт в комнате, сразу (отладка): звери пропадают, волны считаются пройденными. */
export function forceClear(G) {
  const room = G.room;
  const dir = room.dir;
  dir.queue.length = 0;
  for (const m of room.mobs.slice()) {
    if (m.dead) continue;
    if (m.kind === 2) killMob(G, m);
    else m.dead = true;
  }
  if (room.task) finishTask(G, false);
  if (dir.mode === 'enter' || dir.mode === 'ready' || dir.mode === 'wave' || dir.mode === 'calm') {
    if (dir.mode === 'enter') lock(G);
    if (dir.kind === 'boss') {
      bossIntro(G);
      if (room.boss) killMob(G, room.boss);
    } else if (dir.challenge) endFight(G);
    else clearRoom(G);
  } else if (dir.mode === 'intro' || dir.mode === 'boss') {
    if (room.boss) {
      room.boss.inv = 0;
      killMob(G, room.boss);
    }
  } else if (dir.mode === 'fight') endFight(G);
}

// ---------- действие ----------

/**
 * Открыть сундук: картинка меняется, содержимое высыпается рядом. loot (или th.loot):
 * { item: { id, lvl } — что именно лежит; иначе случайная находка (minRarity, kinds); coins, heart — сверху }.
 */
export function openChest(G, th, loot = th.loot) {
  if (th.v === 1) return false;
  th.v = 1;
  th.usable = false;
  th.act = 'open';
  th.t = 0;
  sfx(G, 'chest', th.x, th.y);
  const x = th.x;
  const y = th.y + 16;
  if (loot?.item) addPick(G, 'item', x, y, 1, loot.item.id, loot.item.lvl ?? 0);
  else if (loot?.roll !== false) {
    const it = rollItem(G, { minRarity: loot?.minRarity ?? 0, kinds: loot?.kinds });
    if (it) addPick(G, 'item', x, y, 1, it.id, 0);
  }
  if (loot?.coins) dropCoins(G, x, y, loot.coins);
  if (loot?.heart) addPick(G, 'heart', x, y, 1);
  if (th.tag === 'boss') G.map.rooms[G.room.id].data.chest = 2;
  return true;
}

/** Сделать то, что сейчас в фокусе: взять вещь, открыть сундук, войти в портал, купить у места. */
export function useFocus(G) {
  const room = G.room;
  const F = room.focus;
  if (!F || F.type === 'hint') return false;
  const ref = F.ref;
  F.left = 0;                               // подпись после действия обновится
  if (F.type === 'pick') return takeItemPick(G, ref);
  if (ref.place && own(REG.PLACES, ref.place)) {
    const def = REG.PLACES[ref.place];
    if (def.use) def.use(G, ref);
    return true;
  }
  if (ref.kind === 'portal') {
    // дар за хозяина ещё не выбран — сначала он: с ним на следующую локацию, а не без него
    if (G.map.rooms[room.id].data.gift) {
      room.dir.giftT = -1;
      offerGift(G);
      if (G.pending) return true;
    }
    nextFloor(G);
    return true;
  }
  if (ref.kind === 'chest') return openChest(G, ref);
  return false;
}

/** Шаг предметов: их таймеры, фокус и действие лисы (нажатие правого стика рядом с предметом или кнопка). */
export function stepThings(G, dt) {
  const room = G.room;
  const P = G.player;
  const things = room.things;
  for (let i = 0; i < things.length; i++) {
    const th = things[i];
    th.t += dt;
    if (th.flash > 0) th.flash = Math.max(0, th.flash - dt);
  }
  updateFocus(G);
  if (!P.useNow) return;
  P.useNow = false;
  if (P.down <= 0 && !P.dash) useFocus(G);
}
