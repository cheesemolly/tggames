// Карта локации «Лисьей охоты»: комнаты на сетке, двери между соседними, кто из них кто. Без DOM.
//
// Локация растёт от первой комнаты по одной клетке — чаще «коридором», чем «пятном», чтобы были тупики.
// Хозяин места сидит в самом дальнем тупике. В каждой локации обязательно есть сундук и торговец; остальные
// особые комнаты берутся из того, что описано в places.js (вес — из balance.js), так что новое место появится на
// карте само. Остальное — охотничьи комнаты (их не меньше трёх). Одно зерно — одна и та же карта.

import { REG, BIOMES, rngFrom, hash2, own } from './core.js';
import { HUNT, PLACE_WEIGHTS, roomCount, extraPlaces } from './balance.js';
import { SIDES, OPPOSITE, SIDE_STEP } from './world.js';

const SPAN = 4;                             // дальше стольких клеток от начала карта не растёт (чтобы помещалась на мини-карте)
const key = (x, y) => `${x},${y}`;

export const biomeOf = (floor) => BIOMES[(((floor - 1) % BIOMES.length) + BIOMES.length) % BIOMES.length];
export const loopOf = (floor) => Math.floor((floor - 1) / BIOMES.length);

/** Вид шаблона для комнаты такого типа ('start', 'hunt', 'boss' или id места). */
export const tplKind = (type) => (type === 'start' || type === 'hunt' || type === 'boss' ? type : 'place');

/**
 * Шаблон для комнаты: вида kind, по возможности здешнего места (biome), доступный на этой локации; для особой
 * комнаты — сначала «её собственный» (place), потом общий. Возвращает id шаблона или null.
 */
export function pickTemplate(kind, biome, floor, r, place = null) {
  let list = REG.ROOMS.filter((t) => t.kind === kind && (t.minFloor ?? 1) <= floor);
  if (kind === 'place') {
    const mine = list.filter((t) => t.place === place);
    list = mine.length ? mine : list.filter((t) => !t.place);
  }
  const local = list.filter((t) => t.biome === biome || t.biome === 'any');
  if (local.length) list = local;
  const tpl = r.weighted(list, (t) => t.weight ?? 1);
  return tpl ? tpl.id : null;
}

// Места, у которых бывает своя комната: всё из places.js, кроме тех, что живут в чужой (spot 'start' / 'boss').
function roomPlaces(floor) {
  return Object.keys(REG.PLACES).filter((id) => {
    const d = REG.PLACES[id];
    return (d.spot ?? 'room') === 'room' && (d.minFloor ?? 1) <= floor;
  });
}

function tryFloor(r, floor) {
  const biome = biomeOf(floor);
  const n = roomCount(floor, r);
  const cells = new Map([[key(0, 0), 0]]);
  const rooms = [{ gx: 0, gy: 0 }];
  for (let guard = 0; rooms.length < n && guard < 600; guard++) {
    // чаще растём от недавних комнат — получаются ветки
    const from = r() < 0.6 ? rooms[Math.max(0, rooms.length - 1 - r.int(0, 2))] : r.pick(rooms);
    const [dx, dy] = SIDE_STEP[r.pick(SIDES)];
    const gx = from.gx + dx;
    const gy = from.gy + dy;
    if (Math.abs(gx) > SPAN || Math.abs(gy) > SPAN || cells.has(key(gx, gy))) continue;
    let near = 0;
    for (const s of SIDES) if (cells.has(key(gx + SIDE_STEP[s][0], gy + SIDE_STEP[s][1]))) near += 1;
    if (near > 1 && r() < 0.8) continue;
    cells.set(key(gx, gy), rooms.length);
    rooms.push({ gx, gy });
  }
  if (rooms.length < n) return null;

  for (const room of rooms) {
    room.doors = {};
    for (const s of SIDES) room.doors[s] = cells.get(key(room.gx + SIDE_STEP[s][0], room.gy + SIDE_STEP[s][1])) ?? -1;
  }
  const doorsOf = (room) => SIDES.filter((s) => room.doors[s] >= 0).length;

  // расстояния от начала
  const dist = Array(n).fill(-1);
  dist[0] = 0;
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    for (const s of SIDES) {
      const to = rooms[queue[head]].doors[s];
      if (to >= 0 && dist[to] < 0) {
        dist[to] = dist[queue[head]] + 1;
        queue.push(to);
      }
    }
  }

  // хозяин — в самом дальнем тупике
  let boss = -1;
  for (let i = 1; i < n; i++) {
    if (doorsOf(rooms[i]) !== 1) continue;
    if (boss < 0 || dist[i] > dist[boss] || (dist[i] === dist[boss] && r() < 0.5)) boss = i;
  }
  if (boss < 0 || dist[boss] < 2) return null;

  const types = Array(n).fill('hunt');
  types[0] = 'start';
  types[boss] = 'boss';
  // особые комнаты: сначала тупики, потом остальные; рядом с началом — в последнюю очередь
  const rest = [];
  for (let i = 1; i < n; i++) if (i !== boss) rest.push(i);
  r.shuffle(rest);
  rest.sort((a, b) => (doorsOf(rooms[a]) === 1 ? 0 : 1) - (doorsOf(rooms[b]) === 1 ? 0 : 1));
  const places = roomPlaces(floor);
  const always = ['treasure', 'shop'].filter((id) => places.includes(id));
  const extra = places.filter((id) => !always.includes(id) && (PLACE_WEIGHTS[id] ?? REG.PLACES[id].weight ?? 1) > 0);
  const chosen = [...always];
  for (let k = extraPlaces(n, r); k > 0 && extra.length; k--) {
    const id = r.weighted(extra, (x) => PLACE_WEIGHTS[x] ?? REG.PLACES[x].weight ?? 1);
    chosen.push(id);
    extra.splice(extra.indexOf(id), 1);
  }
  if (rest.length - chosen.length < 3) return null;
  chosen.forEach((id, k) => {
    types[rest[k]] = id;
  });

  const mods = Object.keys(REG.MODS).filter((id) => (REG.MODS[id].minFloor ?? 2) <= floor);
  const out = [];
  for (let i = 0; i < n; i++) {
    const type = types[i];
    const kind = tplKind(type);
    const tpl = pickTemplate(kind, biome, floor, r, kind === 'place' ? type : null);
    if (!tpl) return null;
    let mod = null;
    if (type === 'hunt' && mods.length && floor >= 2 && r() < HUNT.modChance) mod = r.weighted(mods, (id) => REG.MODS[id].weight ?? 1);
    out.push({
      id: i, gx: rooms[i].gx, gy: rooms[i].gy, type, tpl, flip: r.int(0, 3), state: 'new', seen: i === 0,
      doors: rooms[i].doors, data: {}, mod,
    });
  }
  return { rooms: out, cur: 0, entry: 'c', bossId: boss, startId: 0, hunts: 0 };
}

/** Карта локации номер floor для партии с зерном seed: { rooms, cur, entry, bossId, startId, hunts }. */
export function generateFloor(seed, floor) {
  const r = rngFrom(hash2(seed >>> 0, (floor | 0) + 77));
  for (let attempt = 0; attempt < 200; attempt++) {
    const map = tryFloor(r, floor);
    if (map) return map;
  }
  throw new Error('карта локации не собралась: не хватает шаблонов комнат');
}

/**
 * Проверка карты: список ошибок (пустой — карта годится). Комнаты стоят в разных клетках сетки, двери ведут к
 * соседу по сетке и есть с обеих сторон, до каждой комнаты можно дойти, начало и хозяин — по одному, у хозяина
 * одна дверь, шаблон каждой комнаты существует и подходит ей по виду.
 */
export function checkMap(map) {
  const errs = [];
  if (!map || !Array.isArray(map.rooms) || map.rooms.length < 2 || map.rooms.length > 20) return ['нет комнат'];
  const { rooms } = map;
  const n = rooms.length;
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const room = rooms[i];
    if (!room || typeof room !== 'object' || room.id !== i) return [`комната ${i}: не тот id`];
    if (!Number.isInteger(room.gx) || !Number.isInteger(room.gy) || Math.abs(room.gx) > 9 || Math.abs(room.gy) > 9) return [`комната ${i}: клетка`];
    if (cells.has(key(room.gx, room.gy))) errs.push(`комната ${i}: клетка занята`);
    cells.set(key(room.gx, room.gy), i);
    if (!room.doors || typeof room.doors !== 'object') return [`комната ${i}: нет дверей`];
  }
  for (let i = 0; i < n; i++) {
    const room = rooms[i];
    for (const s of SIDES) {
      const to = room.doors[s];
      if (to === -1) continue;
      if (!Number.isInteger(to) || to < 0 || to >= n || to === i) {
        errs.push(`комната ${i}: дверь ${s} ведёт в никуда`);
        continue;
      }
      if (cells.get(key(room.gx + SIDE_STEP[s][0], room.gy + SIDE_STEP[s][1])) !== to) errs.push(`комната ${i}: дверь ${s} ведёт не к соседу`);
      if (rooms[to].doors[OPPOSITE[s]] !== i) errs.push(`комната ${i}: за дверью ${s} нет обратной`);
    }
    const tpl = own(REG.ROOM_BY_ID, room.tpl) ? REG.ROOM_BY_ID[room.tpl] : null;
    const known = room.type === 'start' || room.type === 'hunt' || room.type === 'boss' || own(REG.PLACES, room.type);
    if (!known) errs.push(`комната ${i}: тип «${room.type}»`);
    else if (!tpl || tpl.kind !== tplKind(room.type)) errs.push(`комната ${i}: шаблон «${room.tpl}» не подходит`);
    if (![0, 1, 2, 3].includes(room.flip)) errs.push(`комната ${i}: отражение`);
  }
  if (errs.length) return errs;
  const starts = rooms.filter((x) => x.type === 'start');
  const bosses = rooms.filter((x) => x.type === 'boss');
  if (starts.length !== 1 || starts[0].id !== map.startId) errs.push('начало — не одно или не там');
  if (bosses.length !== 1 || bosses[0].id !== map.bossId) errs.push('хозяин — не один или не там');
  else if (SIDES.filter((s) => bosses[0].doors[s] >= 0).length !== 1) errs.push('у хозяина не одна дверь');
  const seen = new Set([map.startId]);
  const stack = [map.startId];
  while (stack.length) {
    const room = rooms[stack.pop()];
    if (!room) break;
    for (const s of SIDES) {
      const to = room.doors[s];
      if (to >= 0 && !seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  if (seen.size !== n) errs.push('до части комнат не дойти');
  return errs;
}
