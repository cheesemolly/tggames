// Лисья охота, комната: шаблоны и их отражения, клетки, движение круга со скольжением, путь рывка, двери,
// поле путей до лисы, лучи, красные зоны, подбираемое, предметы и «фокус».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  T, TILE, F_WALK, F_SHOT, F_LEAP, F_MOB, F_ALL, CAPS, FOX_R, REG, TAU, rngFrom, tileX, tileY,
} from '../core.js';
import {
  SIDES, OPPOSITE, SIDE_STEP, tplChar, doorTiles, doorFront, validateTemplate, makeRoom, tileIndex, tileAt, blockedAt,
  circleHits, standable, setTile, breakBush, hitTile, moveCircle, unstick, castRay, hasLos, DASH_OUT, solveDash, setDoors,
  doorAt, entryPoint, nearestOf, updateFlow, fieldTo, DIR, fieldDir, SPOT, freeSpot, LANE, laneThrough, addZone, removeZone,
  clearZones, cancelZonesOf, inZone, dangerAt, escapeDir, addPick, removePick, dropCoins, addThing, removeThing,
  pushFromThings, addActor, stepActors, updateFocus, disposeRoom,
} from '../world.js';
import { ROOMS } from '../content.js';

const ALL_DOORS = { n: 1, e: 2, s: 3, w: 4 };

/** Комната по шаблону без зверей и вещей; лиса — у своей норы. */
function bare(tpl = 'forest-glade', { flip = 0, doors = ALL_DOORS, seed = 1, biome = 'forest', warn = 0 } = {}) {
  const G = {
    seed, rs: seed, floor: 1, biome, loop: 0, events: [],
    player: { x: 0, y: 0, down: 0, dash: null, st: { warn } },
  };
  G.room = makeRoom(G, { id: 0, type: 'hunt', tpl, flip, doors, mod: null, data: {} });
  const p = entryPoint(G.room, 'c', {});
  G.player.x = p.x;
  G.player.y = p.y;
  return G;
}

const walkTiles = (room, mask = F_WALK) => {
  const out = [];
  for (let i = 0; i < room.tiles.length; i++) if (!(room.flags[i] & mask)) out.push(i);
  return out;
};
const centerOf = (room, i) => ({ x: tileX(i % room.w), y: tileY(Math.floor(i / room.w)) });
const events = (G, t) => G.events.filter((e) => e.t === t);

// ---------- шаблоны ----------

test('каждый шаблон годен; годных хватает на игру: охота ×3, начало, место, лавка, хозяин', () => {
  const kinds = {};
  const ids = new Set();
  for (const tpl of ROOMS) {
    assert.deepEqual(validateTemplate(tpl), [], tpl.id);
    assert.ok(!ids.has(tpl.id), `id ${tpl.id} повторяется`);
    ids.add(tpl.id);
    assert.ok(tpl.w * tpl.h <= 459, 'поле путей рассчитано на 459 клеток');
    kinds[tpl.kind] = (kinds[tpl.kind] ?? 0) + 1;
  }
  assert.ok(kinds.hunt >= 3 && kinds.start >= 1 && kinds.boss >= 1 && kinds.place >= 2, JSON.stringify(kinds));
  assert.ok(ROOMS.some((t) => t.kind === 'place' && !t.place), 'есть шаблон для любого места');
  assert.ok(ROOMS.some((t) => t.place === 'shop'), 'есть лавка');
});

test('каждый шаблон в каждом отражении: стена по краю, двери на месте, всё связано, метки — на земле', () => {
  for (const tpl of ROOMS) {
    for (let flip = 0; flip < 4; flip++) {
      const { room } = bare(tpl.id, { flip });
      const { w, h } = room;
      const tag = `${tpl.id} / отражение ${flip}`;
      const doorSet = new Set();
      for (const side of SIDES) {
        const d = room.doors[side];
        assert.ok(d && d.open && d.to === ALL_DOORS[side], tag);
        const cells = doorTiles(w, h, side);
        assert.equal(cells.length, 3);
        for (const [tx, ty] of cells) {
          doorSet.add(ty * w + tx);
          assert.equal(room.tiles[ty * w + tx], TILE.DOOR, tag);
          assert.equal(room.flags[ty * w + tx], F_MOB, 'открытая дверь: лиса проходит, звери нет');
        }
        assert.equal(tileIndex(room, d.x, d.y), cells[1][1] * w + cells[1][0], 'дверь стоит на средней клетке проёма');
        for (const [tx, ty] of doorFront(w, h, side)) assert.equal(room.flags[ty * w + tx], 0, `${tag}: перед дверью ${side} свободно`);
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          if (edge && !doorSet.has(y * w + x)) assert.equal(room.tiles[y * w + x], TILE.WALL, tag);
        }
      }
      // связность — по готовым клеткам, вместе с проёмами
      const free = walkTiles(room);
      const seen = new Set([free[0]]);
      const stack = [free[0]];
      while (stack.length) {
        const i = stack.pop();
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (j < 0 || j >= w * h || seen.has(j) || (room.flags[j] & F_WALK)) continue;
          if (Math.abs((j % w) - (i % w)) > 1) continue;
          seen.add(j);
          stack.push(j);
        }
      }
      assert.equal(seen.size, free.length, `${tag}: часть комнаты отрезана`);
      // метки
      assert.ok(room.dens.length >= 1, tag);
      if (tpl.kind === 'hunt') assert.ok(room.burrows.length >= 3 && room.spawns.length >= 3, tag);
      for (const p of [...room.dens, ...room.burrows, ...room.spawns, ...room.slots, room.center]) {
        assert.ok(!blockedAt(room, p.x, p.y, F_WALK), `${tag}: метка на преграде`);
        assert.ok(standable(room, p.x, p.y), `${tag}: на метке можно стоять`);
      }
      for (const b of room.burrows) assert.equal(tileAt(room, b.x, b.y), TILE.BURROW);
      for (const d of room.dens) assert.equal(tileAt(room, d.x, d.y), TILE.DEN);
      assert.deepEqual(room.slots.map((s) => s.n), [...room.slots.map((s) => s.n)].sort(), 'места идут по номерам');
    }
  }
});

test('отражение переставляет клетки, а не теряет их', () => {
  const tpl = ROOMS.find((t) => t.id === 'forest-pond');
  const count = (room, code) => room.tiles.filter((c) => c === code).length;
  const base = bare(tpl.id, { doors: {} }).room;
  for (let flip = 1; flip < 4; flip++) {
    const room = bare(tpl.id, { flip, doors: {} }).room;
    for (const code of Object.values(TILE)) assert.equal(count(room, code), count(base, code), `отражение ${flip}, клетка ${code}`);
    for (let y = 0; y < tpl.h; y++) {
      for (let x = 0; x < tpl.w; x++) {
        const sx = flip & 1 ? tpl.w - 1 - x : x;
        const sy = flip & 2 ? tpl.h - 1 - y : y;
        assert.equal(room.tiles[y * tpl.w + x], base.tiles[sy * tpl.w + sx]);
        assert.equal(tplChar(tpl, x, y, flip), tpl.rows[sy][sx]);
      }
    }
  }
  assert.equal(bare(tpl.id, { doors: {} }).room.dens[0].x, base.dens[0].x);
  assert.notEqual(bare(tpl.id, { flip: 1, doors: {} }).room.dens[0].x, base.dens[0].x, 'нора переехала вместе с комнатой');
});

test('двери ставятся только туда, где есть сосед', () => {
  const { room } = bare('forest-glade', { doors: { n: 3, e: -1, s: -1, w: -1 } });
  assert.ok(room.doors.n && !room.doors.e && !room.doors.s && !room.doors.w);
  assert.equal(room.tiles.filter((c) => c === TILE.DOOR).length, 3);
  for (const [tx, ty] of doorTiles(room.w, room.h, 'e')) assert.equal(room.tiles[ty * room.w + tx], TILE.WALL);
});

test('негодные шаблоны проверка ловит', () => {
  const good = ROOMS.find((t) => t.id === 'forest-glade');
  const broken = (change) => {
    const t = { ...good, rows: [...good.rows] };
    change(t);
    return t;
  };
  const put = (t, x, y, ch) => {
    t.rows[y] = t.rows[y].slice(0, x) + ch + t.rows[y].slice(x + 1);
  };
  const cases = {
    'нет id': broken((t) => { t.id = ''; }),
    'не тот вид': broken((t) => { t.kind = 'лабиринт'; }),
    'не тот размер': broken((t) => { t.w = 18; t.rows = t.rows.map((r) => `${r}#`); }),
    'строк не хватает': broken((t) => { t.rows.pop(); }),
    'строка короче': broken((t) => { t.rows[3] = t.rows[3].slice(1); }),
    'дыра в стене': broken((t) => put(t, 0, 3, '.')),
    'чужая буква': broken((t) => put(t, 5, 5, 'Z')),
    'дерево перед дверью': broken((t) => put(t, 8, 1, 'T')),
    'куст перед боковой дверью': broken((t) => put(t, 15, 5, 'b')),
    'нет лисьей норы': broken((t) => put(t, 8, 5, '.')),
    'мало кроличьих нор': broken((t) => put(t, 1, 1, '.')),
    'мало меток врагов': broken((t) => put(t, 14, 1, '.')),
    'отрезанный угол': broken((t) => { put(t, 14, 8, 'T'); put(t, 13, 9, 'T'); put(t, 15, 8, 'T'); put(t, 14, 9, '.'); put(t, 15, 9, 'S'); }),
    'слишком тесно': broken((t) => { for (let y = 2; y <= 8; y += 2) for (let x = 2; x <= 14; x++) if (![7, 8, 9].includes(x)) put(t, x, y, 'o'); }),
    'хозяин не в большой комнате': broken((t) => { t.kind = 'boss'; }),
  };
  for (const [name, tpl] of Object.entries(cases)) assert.ok(validateTemplate(tpl).length > 0, name);
  assert.ok(validateTemplate(null).length > 0);
  assert.deepEqual(validateTemplate(good), []);
});

// ---------- клетки ----------

test('клетки: за комнатой — стена, преграды по виду клетки', () => {
  const { room } = bare('forest-pond');
  assert.equal(tileAt(room, -5, 40), TILE.WALL);
  assert.equal(tileAt(room, 40, room.h * T + 3), TILE.WALL);
  assert.equal(tileIndex(room, -1, 0), -1);
  assert.ok(blockedAt(room, -5, 40, F_WALK | F_SHOT | F_LEAP));
  const find = (code) => centerOf(room, room.tiles.indexOf(code));
  const water = find(TILE.WATER);
  assert.ok(blockedAt(room, water.x, water.y, F_WALK) && !blockedAt(room, water.x, water.y, F_SHOT) && !blockedAt(room, water.x, water.y, F_LEAP));
  const tall = find(TILE.TALL);
  assert.ok(blockedAt(room, tall.x, tall.y, F_WALK) && blockedAt(room, tall.x, tall.y, F_SHOT) && blockedAt(room, tall.x, tall.y, F_LEAP));
  const low = find(TILE.LOW);
  assert.ok(blockedAt(room, low.x, low.y, F_WALK) && !blockedAt(room, low.x, low.y, F_SHOT | F_LEAP));
  const bush = find(TILE.BUSH);
  assert.ok(blockedAt(room, bush.x, bush.y, F_WALK) && !blockedAt(room, bush.x, bush.y, F_SHOT | F_LEAP));
  for (const code of [TILE.FLOOR, TILE.PATH, TILE.SPECIAL, TILE.BURROW, TILE.DEN]) {
    const p = find(code);
    assert.ok(!blockedAt(room, p.x, p.y, F_ALL), `клетка ${code} проходима для всех`);
  }
  assert.ok(circleHits(room, tall.x + T / 2 + 5, tall.y, 6, F_WALK), 'круг у дерева его задевает');
  assert.ok(!circleHits(room, tall.x + T / 2 + 7, tall.y, 6, F_WALK) || blockedAt(room, tall.x + T, tall.y, F_WALK));
});

test('куст: рывок ломает сразу, выстрелы — с двух единиц урона; ломаясь, меняет клетку и пути', () => {
  const G = bare('forest-glade', { seed: 3 });
  const { room } = G;
  const i = room.tiles.indexOf(TILE.BUSH);
  hitTile(G, i, 1);
  assert.equal(room.tiles[i], TILE.BUSH, 'одной единицы мало');
  updateFlow(room, G.player.x, G.player.y);
  assert.equal(room.flow[i], -1, 'сквозь куст дороги нет');
  hitTile(G, i, 1);
  assert.equal(room.tiles[i], TILE.FLOOR);
  assert.equal(room.flags[i], 0);
  assert.equal(events(G, 'tiles').length, 1);
  assert.deepEqual(events(G, 'break').map((e) => e.what), ['bush']);
  assert.ok(events(G, 'sfx').some((e) => e.id === 'bush'));
  updateFlow(room, G.player.x, G.player.y);
  assert.ok(room.flow[i] >= 0, 'путь через сломанный куст появился');
  const j = room.tiles.indexOf(TILE.BUSH);
  assert.ok(breakBush(G, j));
  assert.ok(!breakBush(G, j), 'второй раз ломать нечего');
  assert.ok(!breakBush(G, -1));
  hitTile(G, room.tiles.indexOf(TILE.TALL), 50);
  assert.ok(room.tiles.includes(TILE.TALL), 'дерево выстрелом не сломать');
  // монеты из кустов выпадают иногда — на многих кустах хотя бы раз, но не всегда
  let coins = 0;
  let bushes = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = bare('forest-thicket', { seed });
    for (let k = 0; k < g.room.tiles.length; k++) if (breakBush(g, k)) bushes += 1;
    coins += g.room.picks.filter((p) => p.kind === 'coin').length;
  }
  assert.ok(coins > bushes * 0.15 && coins < bushes * 0.5, `монет ${coins} из ${bushes} кустов`);
});

// ---------- движение ----------

test('круг никогда не оказывается в преграде: 10 000 случайных шагов', () => {
  const r = rngFrom(77);
  for (const tpl of ['forest-thicket', 'forest-pond', 'forest-glade']) {
    const { room } = bare(tpl, { flip: r.int(0, 3) });
    for (const rad of [FOX_R, 5, 13]) {
      const e = { ...centerOf(room, r.pick(walkTiles(room, F_WALK | F_MOB))) };
      for (let k = 0; k < 1120; k++) {
        const a = r.range(0, TAU);
        const len = r.chance(0.1) ? r.range(20, 400) : r.range(0, 14);
        moveCircle(room, e, Math.cos(a) * len, Math.sin(a) * len, rad, F_WALK | F_MOB);
        assert.ok(!circleHits(room, e.x, e.y, rad, F_WALK | F_MOB), `${tpl}: круг ${rad} в преграде в (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
        assert.ok(e.x > T && e.x < room.w * T - T && e.y > T && e.y < room.h * T - T, 'из комнаты не выйти');
      }
    }
  }
});

test('движение: в стену упирается, вдоль неё скользит, сквозь неё не проскакивает', () => {
  const { room } = bare('forest-arena');
  const e = { x: 5 * T, y: T + FOX_R + 1 };
  let bump = moveCircle(room, e, 30, -30, FOX_R, F_WALK);
  assert.ok(bump & 2, 'упёрлась по вертикали');
  assert.ok(Math.abs(e.x - (5 * T + 30)) < 0.5, 'вдоль стены проехала всё');
  assert.ok(Math.abs(e.y - (T + FOX_R)) < 0.05, 'прижата к стене');
  bump = moveCircle(room, e, 0, -2000, FOX_R, F_WALK);
  assert.ok(e.y > T && bump !== 0, 'огромный шаг стену не пробил');
  assert.equal(moveCircle(room, e, 12, 6, FOX_R, F_WALK), 0, 'по чистому месту — без помех');
  assert.equal(moveCircle(room, e, 0, 0, FOX_R, F_WALK), 0);
  // вдоль воды тоже скользит
  const pond = bare('forest-pond').room;
  const wi = pond.tiles.indexOf(TILE.WATER);
  const wx = wi % pond.w;
  const wy = Math.floor(wi / pond.w);
  const f = { x: tileX(wx) - 4, y: wy * T - FOX_R - 0.5 };
  moveCircle(pond, f, 20, 20, FOX_R, F_WALK);
  assert.ok(f.x > tileX(wx) + 10 && f.y < wy * T - FOX_R + 0.1, 'вода держит, вдоль берега идём');
});

test('закрытая дверь держит всех, открытая — только зверей', () => {
  const G = bare('forest-glade');
  const { room } = G;
  const d = room.doors.n;
  const fox = { x: d.x, y: d.y + T };
  moveCircle(room, fox, 0, -T, FOX_R, F_WALK);
  assert.equal(doorAt(room, fox.x, fox.y), 'n', 'лиса вошла в открытый проём');
  const mob = { x: d.x, y: d.y + T };
  moveCircle(room, mob, 0, -T, 9, F_WALK | F_MOB);
  assert.equal(doorAt(room, mob.x, mob.y), null, 'зверь в проём не заходит');
  setDoors(G, false);
  assert.equal(room.open, false);
  assert.deepEqual(events(G, 'doors').map((e) => e.open), [false]);
  for (const side of SIDES) {
    assert.equal(room.doors[side].open, false);
    for (const [tx, ty] of doorTiles(room.w, room.h, side)) assert.equal(room.flags[ty * room.w + tx], F_ALL);
  }
  const shut = { x: d.x, y: d.y + T };
  moveCircle(room, shut, 0, -T * 2, FOX_R, F_WALK);
  assert.ok(shut.y > T + FOX_R - 0.1, 'в закрытую дверь не пройти');
  assert.equal(doorAt(room, d.x, d.y), null, 'закрытая дверь не выход');
  assert.ok(!hasLos(room, d.x, d.y + T, d.x, d.y - 1), 'и не прострелить');
  setDoors(G, false);
  assert.equal(events(G, 'doors').length, 1, 'повторное закрытие — не событие');
  setDoors(G, true);
  assert.equal(doorAt(room, d.x, d.y), 'n');
  assert.equal(doorAt(room, room.doors.s.x, room.doors.s.y), 's');
  assert.equal(doorAt(room, room.doors.w.x, room.doors.w.y), 'w');
  assert.equal(doorAt(room, room.doors.e.x, room.doors.e.y), 'e');
  assert.equal(doorAt(room, room.center.x, room.center.y), null);
});

test('вход: лиса встаёт на клетку перед дверью, а без двери — у своей норы', () => {
  for (const tpl of ROOMS) {
    const { room } = bare(tpl.id);
    for (const side of SIDES) {
      const p = entryPoint(room, side, {});
      assert.ok(standable(room, p.x, p.y), `${tpl.id}: вход ${side}`);
      const d = room.doors[side];
      assert.equal(Math.hypot(p.x - d.x, p.y - d.y), T, 'ровно в клетке от проёма');
      assert.equal(doorAt(room, p.x, p.y), null);
    }
    const c = entryPoint(room, 'c', {});
    assert.ok(room.dens.some((d) => d.x === c.x && d.y === c.y), 'без двери — у норы');
  }
  assert.deepEqual(OPPOSITE, { n: 's', s: 'n', e: 'w', w: 'e' });
  for (const side of SIDES) {
    const [dx, dy] = SIDE_STEP[side];
    const [ox, oy] = SIDE_STEP[OPPOSITE[side]];
    assert.deepEqual([dx + ox, dy + oy], [0, 0]);
  }
  assert.deepEqual(nearestOf([{ x: 0, y: 0 }, { x: 10, y: 0 }], 7, 1), { x: 10, y: 0 });
  assert.equal(nearestOf([], 1, 1), null);
});

test('unstick: из преграды переставляет на ближайшее свободное место, со свободного не трогает', () => {
  const { room } = bare('forest-pond');
  const w = centerOf(room, room.tiles.indexOf(TILE.WATER));
  const e = { x: w.x, y: w.y };
  assert.ok(unstick(room, e));
  assert.ok(standable(room, e.x, e.y));
  assert.ok(Math.hypot(e.x - w.x, e.y - w.y) < T * 4);
  const before = { ...e };
  assert.ok(!unstick(room, e));
  assert.deepEqual(e, before);
});

// ---------- рывок ----------

test('рывок всегда кончается там, где можно стоять, и внутри комнаты: 10 000 случайных рывков', () => {
  const r = rngFrom(123);
  let cut = 0;
  let full = 0;
  for (const tpl of ['forest-thicket', 'forest-pond', 'forest-glade', 'forest-shop']) {
    for (let flip = 0; flip < 4; flip++) {
      const G = bare(tpl, { flip });
      const { room } = G;
      if (flip === 2) setDoors(G, false);
      const free = walkTiles(room, F_WALK | F_MOB);
      let e = centerOf(room, r.pick(free));
      for (let k = 0; k < 625; k++) {
        const a = r.range(0, TAU);
        const len = r.range(20, 240);
        const out = solveDash(room, e.x, e.y, Math.cos(a), Math.sin(a), len);
        assert.ok(out.ok);
        assert.ok(standable(room, out.x, out.y), `${tpl}/${flip}: рывок кончился в преграде (${out.x.toFixed(1)}, ${out.y.toFixed(1)})`);
        assert.ok(out.x >= 0 && out.y >= 0 && out.x <= room.w * T && out.y <= room.h * T);
        assert.ok(out.len <= len + 1.2 * T + 6 + 1e-6, 'дальше 1,2 клетки не дотягивается');
        assert.ok(Math.abs(Math.hypot(out.x - e.x, out.y - e.y) - out.len) < 1e-6);
        // на пути нет высокого
        for (let s = 0; s <= out.len; s += 4) assert.ok(!circleHits(room, e.x + Math.cos(a) * s, e.y + Math.sin(a) * s, FOX_R - 0.5, F_LEAP));
        if (out.len < len - 0.5) cut += 1;
        else full += 1;
        e = doorAt(room, out.x, out.y) || k % 40 === 39 ? centerOf(room, r.pick(free)) : { x: out.x, y: out.y };
      }
    }
  }
  assert.ok(cut > 1000 && full > 1000, `рывков обрезано ${cut}, полных ${full}`);
});

test('рывок: воду и пни перелетает, перед деревом и стеной останавливается', () => {
  const { room } = bare('forest-pond');
  // пруд: с левого берега на правый
  const row = 6;
  let left = 0;
  while (room.tiles[row * room.w + left + 1] !== TILE.WATER) left += 1;
  let right = left + 1;
  while (room.tiles[row * room.w + right] === TILE.WATER) right += 1;
  const sx = tileX(left);
  const sy = tileY(row);
  const wide = (right - left) * T;
  const over = solveDash(room, sx, sy, 1, 0, wide);
  assert.ok(Math.abs(over.x - tileX(right)) < 1e-6 && over.y === sy, 'перелетела пруд и встала на том берегу');
  // конец над водой, до берега меньше 1,2 клетки — дотягивается
  const short = solveDash(room, sx, sy, 1, 0, wide - 30);
  assert.ok(short.x > right * T + FOX_R - 0.01, `дотянулась до берега: ${short.x}`);
  assert.ok(short.len > wide - 30 && short.len <= wide - 30 + 1.2 * T + 6);
  // до берега далеко — возвращается назад
  const back = solveDash(room, sx, sy, 1, 0, 70);
  assert.ok(back.x < (left + 1) * T - FOX_R + 0.01 && back.len < 70, 'осталась на своём берегу');
  assert.ok(back.len > 0, 'но сколько могла — пролетела');
  // дерево: рывок кончается перед ним
  const ti = room.tiles.indexOf(TILE.TALL);
  const tx = ti % room.w;
  const ty = Math.floor(ti / room.w);
  const stop = solveDash(room, tileX(tx) - 80, tileY(ty), 1, 0, 200);
  assert.ok(stop.x <= tx * T - FOX_R + 0.01 && stop.x > tx * T - FOX_R - 6.5, `остановилась перед деревом: ${stop.x}`);
  // стена
  const wall = solveDash(room, 3 * T, tileY(2), -1, 0, 300);
  assert.ok(wall.x >= T + FOX_R - 0.01 && wall.x < T + FOX_R + 6.5);
  assert.equal(solveDash(room, 3 * T, tileY(2), 1, 0, 0.001).len > 0, true);
  assert.equal(DASH_OUT, wall, 'итог пишется в один и тот же объект — в шаге расчёта ничего не создаётся');
});

test('рывок в открытую дверь выводит из комнаты, в закрытую — нет', () => {
  const G = bare('forest-glade');
  const { room } = G;
  const d = room.doors.e;
  const out = solveDash(room, d.x - 3 * T, d.y, 1, 0, 148);
  assert.equal(doorAt(room, out.x, out.y), 'e', 'приземлилась в проёме');
  setDoors(G, false);
  const shut = solveDash(room, d.x - 3 * T, d.y, 1, 0, 148);
  assert.equal(tileAt(room, shut.x, shut.y) === TILE.DOOR, false);
  assert.ok(shut.x < d.x - T / 2 - FOX_R + 0.01);
});

// ---------- лучи ----------

test('луч: деревья и стены закрывают, вода, пни и кусты — нет; доля пути до преграды', () => {
  const { room } = bare('forest-pond');
  const row = 6;
  const y = tileY(row);
  assert.ok(hasLos(room, tileX(2), y, tileX(18), y), 'через пруд видно');
  const ti = room.tiles.indexOf(TILE.TALL);
  const tx = ti % room.w;
  const ty = Math.floor(ti / room.w);
  assert.ok(!hasLos(room, tileX(tx - 2), tileY(ty), tileX(tx + 2), tileY(ty)), 'через дерево — нет');
  const f = castRay(room, tileX(tx - 2), tileY(ty), tileX(tx + 2), tileY(ty), F_SHOT);
  assert.ok(Math.abs(f - (T * 1.5) / (T * 4)) < 1e-9, `луч упёрся в ближний край дерева: ${f}`);
  assert.equal(castRay(room, tileX(tx), tileY(ty), 0, 0, F_SHOT), 0, 'из преграды — сразу стоп');
  assert.equal(castRay(room, tileX(2), y, tileX(2), y, F_SHOT), 1, 'нулевой луч свободен');
  assert.ok(castRay(room, tileX(2), y, -500, y, F_SHOT) < 0.2, 'за комнату луч не уходит');
  const li = room.tiles.indexOf(TILE.LOW);
  const lx = li % room.w;
  const ly = Math.floor(li / room.w);
  assert.ok(hasLos(room, tileX(lx - 1), tileY(ly), tileX(lx + 1), tileY(ly)), 'поверх пня видно');
  assert.ok(castRay(room, tileX(lx - 1), tileY(ly), tileX(lx + 1), tileY(ly), F_WALK) < 1, 'но пешком не пройти');
  // сверка с проходом по точкам
  const r = rngFrom(5);
  for (let k = 0; k < 400; k++) {
    const x1 = r.range(T, room.w * T - T);
    const y1 = r.range(T, room.h * T - T);
    const x2 = r.range(T, room.w * T - T);
    const y2 = r.range(T, room.h * T - T);
    if (blockedAt(room, x1, y1, F_SHOT)) continue;
    let clear = true;
    for (let i = 1; i <= 600 && clear; i++) clear = !blockedAt(room, x1 + ((x2 - x1) * i) / 600, y1 + ((y2 - y1) * i) / 600, F_SHOT);
    if (clear) assert.ok(hasLos(room, x1, y1, x2, y2), 'свободный путь луч не закрывает');
  }
});

// ---------- пути ----------

test('поле путей до лисы покрывает всё проходимое; по нему зверь доходит до лисы в обход преград', () => {
  for (const tpl of ROOMS) {
    for (const flip of [0, 3]) {
      const G = bare(tpl.id, { flip });
      const { room } = G;
      updateFlow(room, G.player.x, G.player.y);
      const free = walkTiles(room, F_WALK | F_MOB);
      for (const i of free) assert.ok(room.flow[i] >= 0, `${tpl.id}: до клетки ${i} поле не дошло`);
      for (let i = 0; i < room.tiles.length; i++) if (room.flags[i] & (F_WALK | F_MOB)) assert.equal(room.flow[i], -1);
      assert.equal(room.flow[tileIndex(room, G.player.x, G.player.y)], 0);
      // зверь из каждой десятой клетки идёт по полю и приходит
      for (let k = 0; k < free.length; k += 10) {
        const m = { ...centerOf(room, free[k]) };
        let steps = 0;
        while (Math.hypot(m.x - G.player.x, m.y - G.player.y) > T && steps++ < 2000) {
          assert.ok(fieldDir(room, room.flow, m.x, m.y), `${tpl.id}: из (${m.x}, ${m.y}) дороги нет`);
          moveCircle(room, m, DIR.x * 3, DIR.y * 3, 9, F_WALK | F_MOB);
        }
        assert.ok(steps < 2000, `${tpl.id}: зверь из клетки ${free[k]} до лисы не дошёл`);
      }
    }
  }
});

test('поле путей пересчитывается, только когда лиса сменила клетку', () => {
  const G = bare('forest-pond');
  const { room } = G;
  updateFlow(room, G.player.x, G.player.y);
  const tile = room.flowTile;
  room.flow[5] = 123;                                       // пометка: пересчёт её сотрёт
  updateFlow(room, G.player.x + 3, G.player.y - 3);
  assert.equal(room.flow[5], 123, 'в той же клетке — не пересчитано');
  updateFlow(room, G.player.x + T, G.player.y);
  assert.notEqual(room.flowTile, tile);
  assert.notEqual(room.flow[5], 123);
  // лиса над водой (в прыжке): поле остаётся прежним
  const w = centerOf(room, room.tiles.indexOf(TILE.WATER));
  const kept = room.flowTile;
  updateFlow(room, w.x, w.y);
  assert.equal(room.flowTile, kept);
  // сменилась клетка комнаты — поле считается заново
  setTile(G, 3, 3, TILE.TALL);
  assert.equal(room.flowTile, -1);
  updateFlow(room, G.player.x, G.player.y);
  assert.equal(room.flow[3 * room.w + 3], -1);
  assert.equal(fieldDir(room, room.flow, -50, -50), false);
  assert.equal(fieldDir(room, room.flow, G.player.x, G.player.y), false, 'на месте — идти некуда');
});

test('поле до неподвижной точки (норы) считается один раз и ведёт к ней', () => {
  const G = bare('forest-thicket');
  const { room } = G;
  const b = room.burrows[0];
  const f = fieldTo(room, b.x, b.y);
  assert.equal(fieldTo(room, b.x + 5, b.y - 5), f, 'для той же клетки — то же поле');
  assert.equal(f[tileIndex(room, b.x, b.y)], 0);
  const m = { x: room.burrows[2].x, y: room.burrows[2].y };
  let steps = 0;
  while (Math.hypot(m.x - b.x, m.y - b.y) > T && steps++ < 3000) {
    assert.ok(fieldDir(room, f, m.x, m.y));
    moveCircle(room, m, DIR.x * 3, DIR.y * 3, 7, F_WALK | F_MOB);
  }
  assert.ok(steps < 3000);
  assert.equal(fieldTo(room, -10, -10), null);
  const t = centerOf(room, room.tiles.indexOf(TILE.TALL));
  assert.equal(fieldTo(room, t.x, t.y), null, 'к дереву поля нет');
  for (let k = 0; k < 40; k++) fieldTo(room, tileX(1 + (k % 20)), tileY(1 + (k % 9)));
  assert.ok(room.fields.size <= 12, 'запас полей ограничен');
});

test('свободное место: на земле, достижимо, на нужном расстоянии от лисы и не под предметом', () => {
  const G = bare('forest-thicket', { seed: 9 });
  const { room } = G;
  for (let k = 0; k < 200; k++) {
    const p = freeSpot(G, 5 * T, 12 * T);
    assert.equal(p, SPOT);
    const i = tileIndex(room, p.x, p.y);
    assert.equal(room.flags[i], 0);
    assert.ok(![TILE.THORN, TILE.BURROW, TILE.DEN].includes(room.tiles[i]));
    assert.ok(room.flow[i] >= 0);
    const d = Math.hypot(p.x - G.player.x, p.y - G.player.y);
    assert.ok(d >= 5 * T && d <= 12 * T, `расстояние ${d}`);
  }
  addThing(G, { kind: 'stump', x: 200, y: 200 });
  for (let k = 0; k < 200; k++) {
    const p = freeSpot(G);
    assert.ok(Math.abs(p.x - 200) >= 30 || Math.abs(p.y - 200) >= 30);
  }
  assert.ok(freeSpot(G, 5000, 6000), 'невозможное расстояние — всё равно какое-то место');
  const own = rngFrom(4);
  const a = { ...freeSpot(G, 0, 1e9, own) };
  const again = rngFrom(4);
  assert.deepEqual({ ...freeSpot(G, 0, 1e9, again) }, a, 'со своей случайностью — одно и то же место');
});

test('полоса через всю комнату: от стены до стены через заданную точку', () => {
  const { room } = bare('forest-arena');
  const r = rngFrom(8);
  for (let k = 0; k < 300; k++) {
    const x = r.range(T + 5, room.w * T - T - 5);
    const y = r.range(T + 5, room.h * T - T - 5);
    const a = r.range(0, TAU);
    const l = laneThrough(room, x, y, a);
    assert.equal(l, LANE);
    for (const [px, py] of [[l.x1, l.y1], [l.x2, l.y2]]) {
      assert.ok(px >= T - 1e-6 && px <= room.w * T - T + 1e-6 && py >= T - 1e-6 && py <= room.h * T - T + 1e-6);
      const edge = Math.min(px - T, room.w * T - T - px, py - T, room.h * T - T - py);
      assert.ok(edge < 1e-6, 'конец полосы — на краю комнаты');
    }
    const off = Math.abs((l.x2 - l.x1) * (l.y1 - y) - (l.x1 - x) * (l.y2 - l.y1)) / Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    assert.ok(off < 1e-6, 'полоса проходит через точку');
    assert.ok(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 5);
  }
  const h = laneThrough(room, 300, 200, 0);
  assert.deepEqual([h.x1, h.y1, h.x2, h.y2], [T, 200, room.w * T - T, 200]);
});

// ---------- зоны ----------

test('зоны: четыре формы задевают то, что внутри', () => {
  const G = bare('forest-arena');
  const circle = addZone(G, { shape: 'circle', x: 100, y: 100, r: 50 });
  assert.ok(inZone(circle, 140, 100) && !inZone(circle, 151, 100) && inZone(circle, 155, 100, 6));
  const lane = addZone(G, { shape: 'lane', x: 100, y: 200, x2: 300, y2: 200, w: 40 });
  assert.ok(inZone(lane, 200, 219) && !inZone(lane, 200, 221) && inZone(lane, 200, 225, 6));
  assert.ok(!inZone(lane, 330, 200) && inZone(lane, 315, 200), 'концы полосы скруглены');
  assert.equal(lane.a, 0, 'угол полосы — по её концам');
  const cone = addZone(G, { shape: 'cone', x: 400, y: 100, a: Math.PI / 2, arc: Math.PI / 3, r: 80 });
  assert.ok(inZone(cone, 400, 150) && !inZone(cone, 400, 60) && !inZone(cone, 460, 110) && !inZone(cone, 400, 185));
  const ring = addZone(G, { shape: 'ring', x: 500, y: 300, r: 60, w: 16 });
  assert.ok(inZone(ring, 560, 300) && !inZone(ring, 500, 300) && !inZone(ring, 540, 300) && !inZone(ring, 575, 300));
  assert.deepEqual(events(G, 'zone').map((e) => e.zone.shape), ['circle', 'lane', 'cone', 'ring']);
  assert.equal(events(G, 'sfx').filter((e) => e.id === 'warn').length, 4);
  assert.equal(addZone(G, { shape: 'клякса', x: 1, y: 1, r: 5 }).shape, 'circle', 'неизвестная форма — круг');
});

test('зоны: «раньше предупреждать» удлиняет только вражеские; задержка прячет зону до срока', () => {
  const G = bare('forest-arena', { warn: 0.4 });
  const foe = addZone(G, { x: 100, y: 100, r: 30, t: 1 });
  const mine = addZone(G, { x: 100, y: 100, r: 30, t: 1, from: 0 });
  assert.ok(Math.abs(foe.total - 1.4) < 1e-9);
  assert.equal(mine.total, 1);
  assert.equal(events(G, 'sfx').filter((e) => e.id === 'warn').length, 1, 'о своей зоне лису не предупреждают');
  const late = addZone(G, { x: 300, y: 300, r: 30, t: 1, delay: 0.5 });
  assert.equal(late.wait, 0.5);
  assert.equal(events(G, 'zone').length, 2, 'отложенная зона ещё не объявлена');
  assert.equal(dangerAt(G.room, 300, 300), null, 'и не пугает');
  assert.equal(dangerAt(G.room, 100, 100), foe);
  assert.equal(dangerAt(G.room, 100, 140, 12), foe);
  assert.equal(dangerAt(G.room, 500, 100), null);
});

test('зоны берутся из запаса чистыми; лишние не появляются; зоны погибшего зверя отменяются', () => {
  const G = bare('forest-arena');
  const { room } = G;
  const rich = addZone(G, {
    shape: 'lane', x: 50, y: 50, x2: 90, y2: 90, w: 20, dmg: 3, owner: 7, hitsMobs: true, kb: 100, linger: 2,
    run: { speed: 500 }, status: { burn: 2, poison: 3, slow: 1, freeze: 1, stun: 1, root: 1 }, on() {}, actor: 'haz.moose', tag: 'x', look: 'fire',
  });
  assert.deepEqual([rich.burn, rich.poison, rich.slow, rich.freeze, rich.stun, rich.root], [2, 3, 1, 1, 1, 1]);
  removeZone(room, room.zones.indexOf(rich));
  const plain = addZone(G, { x: 10, y: 10, r: 5 });
  assert.equal(plain, rich, 'объект взят из запаса');
  assert.deepEqual(
    [plain.shape, plain.dmg, plain.owner, plain.hitsMobs, plain.kb, plain.linger, plain.run, plain.burn, plain.poison, plain.slow, plain.freeze, plain.stun, plain.root, plain.on, plain.actor, plain.tag, plain.look, plain.phase, plain.t],
    ['circle', 1, 0, false, 0, 0, null, 0, 0, 0, 0, 0, 0, null, null, null, 'red', 0, 0],
  );
  clearZones(room);
  for (let k = 0; k < CAPS.zones + 10; k++) addZone(G, { x: 10, y: 10, r: 5, owner: k % 2 ? 5 : 6, from: k % 3 ? 1 : 0 });
  assert.equal(room.zones.length, CAPS.zones);
  assert.equal(addZone(G, { x: 1, y: 1, r: 1 }), null);
  const mine = room.zones.filter((z) => z.owner === 5).length;
  room.zones.find((z) => z.owner === 5).phase = 1;          // уже ударившая зона остаётся
  cancelZonesOf(room, 5);
  assert.equal(room.zones.filter((z) => z.owner === 5).length, 1);
  assert.equal(room.zones.length, CAPS.zones - mine + 1);
  clearZones(room, 0);
  assert.ok(room.zones.length > 0 && room.zones.every((z) => z.from === 1));
  clearZones(room);
  assert.equal(room.zones.length, 0);
});

test('из любой зоны есть короткий путь наружу', () => {
  const G = bare('forest-arena');
  const r = rngFrom(31);
  const zones = [
    addZone(G, { shape: 'circle', x: 300, y: 240, r: 54 }),
    addZone(G, { shape: 'lane', x: 100, y: 100, x2: 600, y2: 380, w: 44 }),
    addZone(G, { shape: 'cone', x: 400, y: 240, a: 2.2, arc: 1.4, r: 110 }),
    addZone(G, { shape: 'ring', x: 400, y: 240, r: 90, w: 30 }),
  ];
  for (const z of zones) {
    let tried = 0;
    for (let k = 0; k < 4000 && tried < 150; k++) {
      const p = { x: r.range(40, 760), y: r.range(40, 440) };
      if (!inZone(z, p.x, p.y)) continue;
      tried += 1;
      const d = escapeDir(z, p.x, p.y);
      assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9);
      const dx = d.x;
      const dy = d.y;
      let walked = 0;
      while (inZone(z, p.x, p.y) && walked < 400) {
        p.x += dx * 2;
        p.y += dy * 2;
        walked += 2;
      }
      const limit = z.shape === 'circle' ? z.r + 2 : z.shape === 'lane' ? z.w / 2 + 2 : z.shape === 'ring' ? z.w + 2 : z.r * 2;
      assert.ok(walked <= limit, `${z.shape}: до края ${walked}`);
    }
    assert.ok(tried > 50, `${z.shape}: мало проб`);
  }
  assert.ok(Number.isFinite(escapeDir(zones[0], 300, 240).x), 'из самой середины круга тоже есть куда');
});

// ---------- подбираемое ----------

test('подбираемое: выпрыгивает в сторону, запас ограничен, монеты складываются, вещь мелочь вытесняет', () => {
  const G = bare('forest-arena', { seed: 5 });
  const { room } = G;
  const p = addPick(G, 'coin', 300, 200, 3);
  assert.ok(p.on && p.v === 3 && (p.vx !== 0 || p.vy !== 0) && p.vz > 0);
  const still = addPick(G, 'item', 300, 200, 1, 'pinecone', 2, false);
  assert.deepEqual([still.vx, still.vy, still.vz, still.id, still.lvl], [0, 0, 0, 'pinecone', 2]);
  const twin = bare('forest-arena', { seed: 5 });
  const q = addPick(twin, 'coin', 300, 200, 3);
  assert.deepEqual([q.vx, q.vy, q.vz], [p.vx, p.vy, p.vz], 'одно зерно — тот же прыжок');
  removePick(room, room.picks.indexOf(p));
  assert.equal(p.on, false);
  assert.equal(addPick(G, 'heart', 10, 10), p, 'запись взята из запаса');
  assert.deepEqual([p.kind, p.v, p.id, p.lvl, p.tag, p.t], ['heart', 1, null, 0, null, 0]);
  while (room.picks.length < CAPS.picks) addPick(G, 'coin', 300, 200, 1);
  const sum = () => room.picks.reduce((s, x) => s + (x.kind === 'coin' ? x.v : 0), 0);
  const before = sum();
  addPick(G, 'coin', 300, 200, 7);
  assert.equal(room.picks.length, CAPS.picks);
  assert.equal(sum(), before + 7, 'лишняя монета прибавилась к лежащей');
  const item = addPick(G, 'item', 300, 200, 1, 'claws');
  assert.ok(item && room.picks.includes(item), 'вещь не теряется');
  assert.equal(room.picks.length, CAPS.picks);
  assert.equal(addPick(G, 'mana', 1, 1), null, 'а маны среди лежащего нет — класть некуда');
  disposeRoom(room);
  assert.equal(room.picks.length, 0);
  const g = bare('forest-arena');
  dropCoins(g, 100, 100, 37);
  assert.equal(g.room.picks.reduce((s, x) => s + x.v, 0), 37);
  assert.ok(g.room.picks.length <= 6);
  dropCoins(g, 100, 100, 0);
  dropCoins(g, 100, 100, 2);
  assert.equal(g.room.picks.reduce((s, x) => s + x.v, 0), 39);
});

// ---------- предметы и фокус ----------

test('предметы: сквозь них не пройти, лишние не появляются', () => {
  const G = bare('forest-arena');
  const { room } = G;
  const chest = addThing(G, { kind: 'chest', x: 300, y: 200, r: 12 });
  const e = { x: 305, y: 203 };
  assert.ok(pushFromThings(room, e, FOX_R));
  assert.ok(Math.hypot(e.x - 300, e.y - 200) >= 12 + FOX_R - 1e-6);
  assert.ok(!pushFromThings(room, e, FOX_R));
  const ghost = addThing(G, { kind: 'sign', x: 400, y: 200, solid: false });
  const f = { x: 401, y: 200 };
  assert.ok(!pushFromThings(room, f, FOX_R), 'табличка не мешает');
  const mid = { x: 300, y: 200 };
  pushFromThings(room, mid, FOX_R);
  assert.ok(Math.hypot(mid.x - 300, mid.y - 200) >= 12 + FOX_R - 1e-6, 'из самой середины тоже выталкивает');
  removeThing(room, chest);
  removeThing(room, ghost);
  assert.equal(room.things.length, 0);
  for (let k = 0; k < CAPS.things + 5; k++) addThing(G, { kind: 'stump', x: 40 + k * 20, y: 100 });
  assert.equal(room.things.length, CAPS.things);
  assert.equal(addThing(G, { kind: 'stump', x: 1, y: 1 }), null);
});

test('фокус: ближайшее, с чем можно что-то сделать, и подпись к нему', () => {
  const G = bare('forest-arena');
  const { room } = G;
  const P = G.player;
  P.x = 300;
  P.y = 200;
  updateFocus(G);
  assert.equal(room.focus, null);
  const chest = addThing(G, { kind: 'chest', x: 330, y: 200, usable: true });
  updateFocus(G);
  assert.deepEqual([room.focus.type, room.focus.ref, room.focus.title, room.focus.cost, room.focus.ok], ['thing', chest, 'Открыть', 0, true]);
  // вещь на земле ближе — фокус на ней (только что выпавшую взять нельзя)
  const pick = addPick(G, 'item', 310, 200, 1, 'нет такой', 0, false);
  updateFocus(G);
  assert.equal(room.focus.ref, chest);
  pick.t = 1;
  updateFocus(G);
  assert.deepEqual([room.focus.type, room.focus.ref, room.focus.title], ['pick', pick, 'Взять']);
  removePick(room, room.picks.indexOf(pick));
  // предмет места: подпись и цена — от места
  REG.PLACES['test-stall'] = { label: (g, th) => ({ title: 'Купить', sub: 'Шишка', cost: th.cost, ok: false }) };
  const stall = addThing(G, { kind: 'pedestal', x: 300, y: 215, usable: true, place: 'test-stall', cost: 30 });
  updateFocus(G);
  assert.deepEqual([room.focus.ref, room.focus.title, room.focus.sub, room.focus.cost, room.focus.ok], [stall, 'Купить', 'Шишка', 30, false]);
  delete REG.PLACES['test-stall'];
  // табличка — только когда больше ничего нет рядом
  const sign = addThing(G, { kind: 'sign', x: 300, y: 205, text: 'Иди сюда', solid: false });
  updateFocus(G);
  assert.equal(room.focus.ref, stall);
  removeThing(room, stall);
  assert.equal(room.focus, null, 'убранный предмет из фокуса пропадает сразу');
  removeThing(room, chest);
  updateFocus(G);
  assert.deepEqual([room.focus.type, room.focus.ref, room.focus.title, room.focus.ok], ['hint', sign, 'Иди сюда', false]);
  const portal = addThing(G, { kind: 'portal', x: 320, y: 200, usable: true });
  updateFocus(G);
  assert.deepEqual([room.focus.ref, room.focus.title], [portal, 'Дальше']);
  // далеко, лёжа и в рывке — ничего
  P.x = 500;
  updateFocus(G);
  assert.equal(room.focus, null);
  P.x = 300;
  P.down = 1;
  updateFocus(G);
  assert.equal(room.focus, null);
  P.down = 0;
  P.dash = {};
  updateFocus(G);
  assert.equal(room.focus, null);
});

test('бегущие фигуры напастей живут своё время и сами пропадают', () => {
  const { room } = bare('forest-arena');
  const a = addActor(room, 'haz.moose', 100, 100, 300, 0, 0.5, 'charge');
  assert.deepEqual([a.rig, a.face, a.act, a.k], ['haz.moose', 1, 'charge', 0]);
  assert.equal(addActor(room, 'haz.moose', 100, 100, -300, 0).face, -1);
  for (let k = 0; k < 15; k++) stepActors(room, 1 / 60);
  assert.ok(Math.abs(a.x - 175) < 1e-6 && Math.abs(a.px - 170) < 1e-6 && Math.abs(a.k - 0.5) < 1e-6);
  for (let k = 0; k < 16; k++) stepActors(room, 1 / 60);
  assert.equal(room.actors.length, 0);
  for (let k = 0; k < CAPS.actors + 3; k++) addActor(room, 'haz.paw', 1, 1);
  assert.equal(room.actors.length, CAPS.actors);
});
