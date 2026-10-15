// Живая комната «Лисьей охоты»: клетки из шаблона, двери, движение круга по клеткам со скольжением, путь рывка,
// поле расстояний до лисы (чтобы звери обходили преграды), красные зоны, подбираемое, предметы обстановки и то,
// с чем лиса может что-то сделать прямо сейчас («фокус»). Без DOM.
//
// Комната собирается из шаблона (rooms.js) и записи карты: шаблон можно отразить, а двери ставит карта — проём в
// три клетки посередине стороны, если там есть сосед. Клетки лежат в двух массивах: tiles — что это (коды из
// tiles.js), flags — что клетка не пропускает (пешком, выстрел, рывок, зверей). Закрытая дверь — стена для всех,
// открытая — проход для лисы, но не для зверей.
//
// Комната живёт, пока лиса в ней, и в сохранение не попадает: всё, что должно пережить уход, место записывает в
// data своей записи на карте.

import {
  T, TILE, F_WALK, F_SHOT, F_LEAP, F_MOB, F_ALL, BLOCK, CHAR, SIZES, SPECIAL_FX, CAPS, FOX_R, REG, TAU,
  clamp, hash2, rnd, rndOf, own, itemDef, segDist2, inCone, emit, sfx, tileX, tileY, swapRemove,
} from './core.js';
import { PICK, DROPS } from './balance.js';

export const SIDES = ['n', 'e', 's', 'w'];
export const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
/** Куда ведёт сторона на сетке карты. */
export const SIDE_STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// ---------- шаблоны ----------

/** Буква шаблона в клетке (x, y) с учётом отражения: бит 0 — по горизонтали, бит 1 — по вертикали. */
export function tplChar(tpl, x, y, flip = 0) {
  const row = tpl.rows[flip & 2 ? tpl.h - 1 - y : y];
  return row[flip & 1 ? tpl.w - 1 - x : x];
}

/** Три клетки проёма на стороне комнаты w×h: [[tx, ty] ×3], средняя — вторая. */
export function doorTiles(w, h, side) {
  const mx = (w - 1) >> 1;
  const my = (h - 1) >> 1;
  if (side === 'n') return [[mx - 1, 0], [mx, 0], [mx + 1, 0]];
  if (side === 's') return [[mx - 1, h - 1], [mx, h - 1], [mx + 1, h - 1]];
  if (side === 'w') return [[0, my - 1], [0, my], [0, my + 1]];
  return [[w - 1, my - 1], [w - 1, my], [w - 1, my + 1]];
}

/** Три клетки перед проёмом (внутри комнаты): их шаблон обязан оставить свободными. */
export function doorFront(w, h, side) {
  return doorTiles(w, h, side).map(([tx, ty]) => [
    tx + (side === 'w' ? 1 : side === 'e' ? -1 : 0),
    ty + (side === 'n' ? 1 : side === 's' ? -1 : 0),
  ]);
}

const WALKABLE = (ch) => own(CHAR, ch) && !(BLOCK[CHAR[ch]] & F_WALK);

/**
 * Проверка шаблона комнаты: список ошибок (пустой — всё в порядке). Прямоугольник нужного размера со стеной по
 * краю; перед каждой стороной свободно под дверь; есть лисья нора; всё, по чему можно ходить, связано между собой
 * и с четырьмя входами; в охотничьей комнате — не меньше трёх нор, трёх меток врагов и 55 % свободного места.
 */
export function validateTemplate(tpl) {
  const errs = [];
  if (!tpl || typeof tpl.id !== 'string' || !tpl.id) return ['нет id'];
  const { w, h, rows } = tpl;
  if (!['hunt', 'start', 'boss', 'place'].includes(tpl.kind)) errs.push(`вид «${tpl.kind}»`);
  if (!Object.values(SIZES).some(([sw, sh]) => sw === w && sh === h)) errs.push(`размер ${w}×${h} — не S, M или L`);
  if (tpl.kind === 'boss' && !(w === SIZES.L[0] && h === SIZES.L[1])) errs.push('комната хозяина — только L');
  if (!Array.isArray(rows) || rows.length !== h || rows.some((r) => typeof r !== 'string' || r.length !== w)) {
    errs.push('строки не складываются в прямоугольник');
    return errs;
  }
  const count = {};
  let free = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (!own(CHAR, ch)) errs.push(`буква «${ch}» в (${x}, ${y})`);
      count[ch] = (count[ch] ?? 0) + 1;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (edge && ch !== '#') errs.push(`край не стена в (${x}, ${y})`);
      if (!edge && WALKABLE(ch)) free += 1;
    }
  }
  if (errs.length) return errs;
  for (const side of SIDES) {
    for (const [x, y] of doorFront(w, h, side)) {
      if (rows[y][x] !== '.' && rows[y][x] !== ',') errs.push(`перед дверью «${side}» занято в (${x}, ${y})`);
    }
  }
  if (!count.R) errs.push('нет лисьей норы R');
  if (tpl.kind === 'hunt') {
    if ((count.B ?? 0) < 3) errs.push('кроличьих нор B меньше трёх');
    if ((count.S ?? 0) < 3) errs.push('меток врагов S меньше трёх');
    if (free < 0.55 * (w - 2) * (h - 2)) errs.push('свободно меньше 55 %');
  }
  if (errs.length) return errs;
  // связность: от входа «n» обходится всё проходимое
  const seen = new Uint8Array(w * h);
  const [sx, sy] = doorFront(w, h, 'n')[1];
  const stack = [sy * w + sx];
  seen[stack[0]] = 1;
  let reached = 0;
  while (stack.length) {
    const i = stack.pop();
    reached += 1;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * w + x + dx;
      if (!seen[j] && WALKABLE(rows[y + dy][x + dx])) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  if (reached !== free) errs.push(`часть комнаты отрезана: дойти можно до ${reached} клеток из ${free}`);
  return errs;
}

// ---------- сборка комнаты ----------

/** Живая комната по записи карты mr (шаблон, отражение, соседи) — пока пустая: зверей и вещи ставит director. */
export function makeRoom(G, mr) {
  const tpl = REG.ROOM_BY_ID[mr.tpl];
  const w = tpl.w;
  const h = tpl.h;
  const n = w * h;
  const room = {
    id: mr.id, w, h, tpl: tpl.id, type: mr.type, biome: G.biome, special: SPECIAL_FX[G.biome] ?? 'grass',
    seed: hash2(hash2(G.seed, G.floor), mr.id + 1),
    tiles: new Uint8Array(n), flags: new Uint8Array(n), dmgAt: new Uint8Array(n),
    mobs: [], shots: [], picks: [], things: [], zones: [], pals: [], actors: [],
    doors: { n: null, e: null, s: null, w: null }, open: true,
    dens: [], burrows: [], spawns: [], slots: [], center: { x: (w * T) / 2, y: (h * T) / 2 },
    focus: null, focusObj: { type: '', ref: null, title: '', sub: '', cost: 0, ok: true, left: 0 },
    dir: null, task: null, boss: null, mod: mr.mod ?? null, hazards: [],
    flow: new Int16Array(n).fill(-1), flowTile: -1, fields: new Map(),
    shake: 0, uid: 0, t: 0, vacuum: false,
  };
  let hasCenter = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = tplChar(tpl, x, y, mr.flip);
      const code = own(CHAR, ch) ? CHAR[ch] : TILE.FLOOR;
      const i = y * w + x;
      room.tiles[i] = code;
      room.flags[i] = BLOCK[code];
      if (ch === 'S') room.spawns.push({ x: tileX(x), y: tileY(y) });
      else if (ch === 'B') room.burrows.push({ x: tileX(x), y: tileY(y) });
      else if (ch === 'R') room.dens.push({ x: tileX(x), y: tileY(y) });
      else if (ch === 'C') {
        room.center.x = tileX(x);
        room.center.y = tileY(y);
        hasCenter = true;
      } else if (ch >= '1' && ch <= '5') room.slots.push({ n: Number(ch), x: tileX(x), y: tileY(y) });
    }
  }
  // кусты, сломанные раньше (номера клеток в mr.data.bush), не вырастают; кривое в списке пропускается
  const broken = mr.data?.bush;
  if (Array.isArray(broken)) {
    for (const i of broken) {
      if (!Number.isInteger(i) || i < 0 || i >= n || room.tiles[i] !== TILE.BUSH) continue;
      room.tiles[i] = TILE.FLOOR;
      room.flags[i] = BLOCK[TILE.FLOOR];
    }
  }
  room.slots.sort((a, b) => a.n - b.n || a.x - b.x || a.y - b.y);
  for (const side of SIDES) {
    const to = mr.doors?.[side] ?? -1;
    if (!(to >= 0)) continue;
    const cells = doorTiles(w, h, side);
    for (const [tx, ty] of cells) {
      room.tiles[ty * w + tx] = TILE.DOOR;
      room.flags[ty * w + tx] = F_MOB;
    }
    room.doors[side] = { side, to, open: true, x: tileX(cells[1][0]), y: tileY(cells[1][1]), tx: cells[1][0], ty: cells[1][1] };
  }
  if (!hasCenter) nearestFree(room, room.center.x, room.center.y, room.center);
  return room;
}

/** Ближайшая к точке свободная клетка (её середина) — в out. */
function nearestFree(room, x, y, out) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < room.tiles.length; i++) {
    if (room.flags[i] !== 0 || room.tiles[i] === TILE.THORN) continue;
    const cx = tileX(i % room.w);
    const cy = tileY(Math.floor(i / room.w));
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    out.x = tileX(best % room.w);
    out.y = tileY(Math.floor(best / room.w));
  }
  return best >= 0;
}

// ---------- клетки ----------

/** Номер клетки под точкой или −1, если точка за комнатой. */
export function tileIndex(room, x, y) {
  const tx = Math.floor(x / T);
  const ty = Math.floor(y / T);
  return tx < 0 || ty < 0 || tx >= room.w || ty >= room.h ? -1 : ty * room.w + tx;
}

/** Код клетки под точкой (за комнатой — стена). */
export function tileAt(room, x, y) {
  const i = tileIndex(room, x, y);
  return i < 0 ? TILE.WALL : room.tiles[i];
}

/** Не пропускает ли клетка под точкой то, что в mask (F_WALK, F_SHOT, F_LEAP, F_MOB). За комнатой — не пропускает. */
export function blockedAt(room, x, y, mask) {
  const i = tileIndex(room, x, y);
  return i < 0 || (room.flags[i] & mask) !== 0;
}

function solid(room, tx, ty, mask) {
  return tx < 0 || ty < 0 || tx >= room.w || ty >= room.h || (room.flags[ty * room.w + tx] & mask) !== 0;
}

/** Задевает ли круг хоть одну клетку, непроходимую по mask. */
export function circleHits(room, x, y, r, mask) {
  const x0 = Math.floor((x - r) / T);
  const x1 = Math.floor((x + r) / T);
  const y0 = Math.floor((y - r) / T);
  const y1 = Math.floor((y + r) / T);
  const rr = r * r - 1e-6;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!solid(room, tx, ty, mask)) continue;
      const lx = tx * T;
      const ly = ty * T;
      const dx = x - (x < lx ? lx : x > lx + T ? lx + T : x);
      const dy = y - (y < ly ? ly : y > ly + T ? ly + T : y);
      if (dx * dx + dy * dy < rr) return true;
    }
  }
  return false;
}

/** Можно ли здесь стоять кругом радиуса r. */
export const standable = (room, x, y, r = FOX_R) => !circleHits(room, x, y, r, F_WALK);

/** Поменять клетку (сломан куст, место что-то построило): преграды и пути пересчитаются. */
export function setTile(G, tx, ty, code) {
  const room = G.room;
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return;
  const i = ty * room.w + tx;
  room.tiles[i] = code;
  room.flags[i] = BLOCK[code];
  room.dmgAt[i] = 0;
  room.flowTile = -1;
  room.fields.clear();
  emit(G, { t: 'tiles', tx, ty, code });
}

const BUSH_MAX = 40;

/** Сломать куст в клетке i: земля, шорох, иногда монетка. Комната карты запоминает клетку — куст не вырастет. */
export function breakBush(G, i) {
  const room = G.room;
  if (i < 0 || room.tiles[i] !== TILE.BUSH) return false;
  const tx = i % room.w;
  const ty = Math.floor(i / room.w);
  setTile(G, tx, ty, TILE.FLOOR);
  const mr = G.map?.rooms?.[room.id];
  if (mr?.data && room.floor === G.floor) {
    if (!Array.isArray(mr.data.bush)) mr.data.bush = [];
    if (mr.data.bush.length < BUSH_MAX && !mr.data.bush.includes(i)) mr.data.bush.push(i);
  }
  const x = tileX(tx);
  const y = tileY(ty);
  emit(G, { t: 'break', x, y, what: 'bush' });
  sfx(G, 'bush', x, y);
  if (rnd(G) < DROPS.bushCoin) addPick(G, 'coin', x, y, 1);
  return true;
}

/** Выстрел задел клетку i с уроном dmg: куст выдерживает меньше двух единиц. */
export function hitTile(G, i, dmg) {
  const room = G.room;
  if (i < 0 || room.tiles[i] !== TILE.BUSH) return;
  const sum = room.dmgAt[i] + Math.max(1, Math.round(dmg));
  if (sum >= 2) breakBush(G, i);
  else room.dmgAt[i] = sum;
}

// ---------- движение круга ----------

// Вытолкнуть круг из клеток. Сначала — из тех, к чьей стороне он прижат «лицом», и только потом — от углов:
// иначе на ровной стене из нескольких клеток угол соседней клетки толкал бы вбок.
function pushOut(room, e, r, mask) {
  let bump = 0;
  let quiet = 0;
  for (let pass = 0; pass < 6; pass++) {
    const corners = pass & 1;
    let moved = false;
    const x0 = Math.floor((e.x - r) / T);
    const x1 = Math.floor((e.x + r) / T);
    const y0 = Math.floor((e.y - r) / T);
    const y1 = Math.floor((e.y + r) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!solid(room, tx, ty, mask)) continue;
        const lx = tx * T;
        const ly = ty * T;
        const nx = e.x < lx ? lx : e.x > lx + T ? lx + T : e.x;
        const ny = e.y < ly ? ly : e.y > ly + T ? ly + T : e.y;
        const dx = e.x - nx;
        const dy = e.y - ny;
        if ((dx !== 0 && dy !== 0) !== (corners === 1)) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d + 0.01;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
          bump |= Math.abs(dx) > Math.abs(dy) ? 1 : 2;
        } else {
          // середина круга внутри клетки: наружу через ближнюю сторону
          const l = e.x - lx;
          const rt = lx + T - e.x;
          const u = e.y - ly;
          const dn = ly + T - e.y;
          const m = Math.min(l, rt, u, dn);
          if (m === l) e.x = lx - r - 0.01;
          else if (m === rt) e.x = lx + T + r + 0.01;
          else if (m === u) e.y = ly - r - 0.01;
          else e.y = ly + T + r + 0.01;
          bump |= m === l || m === rt ? 1 : 2;
        }
        moved = true;
      }
    }
    // круг «от сторон, потом от углов» прошёл без единого толчка — всё свободно
    if (moved) quiet = 0;
    else if (++quiet >= 2) break;
  }
  return bump;
}

/**
 * Сдвинуть круг e (поля x, y) на (dx, dy), не заходя в клетки, непроходимые по mask: упёрся — скользит вдоль.
 * Возвращает, во что упёрся: бит 1 — по горизонтали, бит 2 — по вертикали (0 — путь был свободен).
 * Если круг стоял свободно, он и останется свободным: в крайнем случае шаг просто не делается.
 */
export function moveCircle(room, e, dx, dy, r, mask) {
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  if (d === 0) return 0;
  // шаг короче радиуса — середина круга не перескочит в стену
  const lim = r > 8 ? 8 : r < 3 ? 3 : r;
  const n = d > lim ? Math.ceil(d / lim) : 1;
  const sx = dx / n;
  const sy = dy / n;
  let bump = 0;
  for (let i = 0; i < n; i++) {
    const ox = e.x;
    const oy = e.y;
    e.x = ox + sx;
    e.y = oy + sy;
    const b = pushOut(room, e, r, mask);
    if (b === 0) continue;
    bump |= b;
    if (circleHits(room, e.x, e.y, r, mask)) {
      e.x = ox;
      e.y = oy;
      bump = 3;
      break;
    }
  }
  return bump;
}

/** Если круг оказался в преграде (чего быть не должно) — переставить на ближайшую свободную клетку. */
export function unstick(room, e, r = FOX_R, mask = F_WALK) {
  if (!circleHits(room, e.x, e.y, Math.min(r, 6), mask)) return false;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < room.tiles.length; i++) {
    if (room.flags[i] & (mask | F_MOB)) continue;
    const cx = tileX(i % room.w);
    const cy = tileY(Math.floor(i / room.w));
    const d = (cx - e.x) * (cx - e.x) + (cy - e.y) * (cy - e.y);
    if (d < bestD && !circleHits(room, cx, cy, r, mask)) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return false;
  e.x = tileX(best % room.w);
  e.y = tileY(Math.floor(best / room.w));
  return true;
}

// ---------- лучи ----------

/**
 * Доля пути от (x1, y1) до (x2, y2), пройденная до первой клетки, непроходимой по mask (1 — путь свободен).
 * Идёт по клеткам, а не по точкам: тонкую преграду не проскочит.
 */
export function castRay(room, x1, y1, x2, y2, mask) {
  let tx = Math.floor(x1 / T);
  let ty = Math.floor(y1 / T);
  if (solid(room, tx, ty, mask)) return 0;
  const ex = Math.floor(x2 / T);
  const ey = Math.floor(y2 / T);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const ddx = dx !== 0 ? T / Math.abs(dx) : Infinity;
  const ddy = dy !== 0 ? T / Math.abs(dy) : Infinity;
  let mx = dx !== 0 ? (dx > 0 ? (tx + 1) * T - x1 : x1 - tx * T) / Math.abs(dx) : Infinity;
  let my = dy !== 0 ? (dy > 0 ? (ty + 1) * T - y1 : y1 - ty * T) / Math.abs(dy) : Infinity;
  for (let guard = 0; guard < 96 && (tx !== ex || ty !== ey); guard++) {
    let t;
    if (mx < my) {
      t = mx;
      mx += ddx;
      tx += sx;
    } else {
      t = my;
      my += ddy;
      ty += sy;
    }
    if (t > 1) return 1;
    if (solid(room, tx, ty, mask)) return t;
  }
  return 1;
}

/** Видно ли из точки в точку (для выстрела: деревья и стены закрывают, пни и вода — нет). */
export const hasLos = (room, x1, y1, x2, y2) => castRay(room, x1, y1, x2, y2, F_SHOT) >= 1;

// ---------- рывок ----------

/** Чем кончился расчёт рывка: где приземлиться, сколько пролетели и нашлось ли место (ok). */
export const DASH_OUT = { x: 0, y: 0, len: 0, ok: true };

/**
 * Путь рывка из (x, y) в сторону (ux, uy) длиной len. Идём по отрезку шагами по 6: высокое (дерево, стена)
 * останавливает; низкое (вода, пень, куст) перелетаем. Если конец пришёлся на непроходимое — тянемся вперёд
 * до 1,2 клетки к первому свободному месту, а не вышло — возвращаемся назад. Итог всегда там, где можно стоять;
 * ok = false — такого места не нашлось вовсе (старт сам был в преграде), итог — старт.
 */
export function solveDash(room, x, y, ux, uy, len, r = FOX_R) {
  const STEP = 6;
  const n = Math.max(1, Math.ceil(len / STEP));
  const st = len / n;
  let flew = 0;
  for (let i = 1; i <= n; i++) {
    if (circleHits(room, x + ux * st * i, y + uy * st * i, r, F_LEAP)) break;
    flew = i;
  }
  let at = st * flew;
  if (circleHits(room, x + ux * at, y + uy * at, r, F_WALK)) {
    let found = -1;
    if (flew === n) {
      const extra = Math.ceil((1.2 * T) / STEP);
      for (let j = 1; j <= extra; j++) {
        const px = x + ux * (len + STEP * j);
        const py = y + uy * (len + STEP * j);
        if (circleHits(room, px, py, r, F_LEAP)) break;
        if (!circleHits(room, px, py, r, F_WALK)) {
          found = j;
          break;
        }
      }
    }
    if (found > 0) at = len + STEP * found;
    else {
      let k = flew - 1;
      while (k > 0 && circleHits(room, x + ux * st * k, y + uy * st * k, r, F_WALK)) k -= 1;
      at = st * Math.max(0, k);
    }
  }
  DASH_OUT.x = x + ux * at;
  DASH_OUT.y = y + uy * at;
  DASH_OUT.len = at;
  DASH_OUT.ok = at > 0 || !circleHits(room, x, y, r, F_WALK);
  return DASH_OUT;
}

// ---------- двери ----------

/** Открыть или закрыть все двери комнаты. Закрытая — стена для всех, открытая — проход для лисы. */
export function setDoors(G, open) {
  const room = G.room;
  if (room.open === open) return;
  room.open = open;
  for (const side of SIDES) {
    const d = room.doors[side];
    if (!d) continue;
    d.open = open;
    for (const [tx, ty] of doorTiles(room.w, room.h, side)) room.flags[ty * room.w + tx] = open ? F_MOB : F_ALL;
  }
  room.flowTile = -1;
  room.fields.clear();
  emit(G, { t: 'doors', open });
}

/** Сторона открытой двери, в проёме которой стоит точка, или null. */
export function doorAt(room, x, y) {
  const i = tileIndex(room, x, y);
  if (i < 0 || room.tiles[i] !== TILE.DOOR || !room.open) return null;
  const tx = i % room.w;
  const ty = (i - tx) / room.w;
  if (ty === 0) return 'n';
  if (ty === room.h - 1) return 's';
  return tx === 0 ? 'w' : 'e';
}

/** Где лиса встаёт, войдя через сторону side ('c' — у своей норы или посередине): в out. */
export function entryPoint(room, side, out) {
  const d = side === 'c' ? null : room.doors[side];
  if (d) {
    out.x = d.x + (side === 'w' ? T : side === 'e' ? -T : 0);
    out.y = d.y + (side === 'n' ? T : side === 's' ? -T : 0);
  } else if (room.dens.length) {
    const den = nearestOf(room.dens, room.center.x, room.center.y);
    out.x = den.x;
    out.y = den.y;
  } else {
    out.x = room.center.x;
    out.y = room.center.y;
  }
  return out;
}

/** Ближайшая к (x, y) точка из списка [{ x, y }] (или null). */
export function nearestOf(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// ---------- пути ----------

const QUEUE = new Int16Array(512);

// Расстояния в шагах по клеткам от клетки start до всех, куда можно дойти (−1 — нельзя). Ходы — по четырём сторонам.
function bfs(room, start, dist, mask) {
  const w = room.w;
  const n = room.tiles.length;
  const flags = room.flags;
  dist.fill(-1);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  QUEUE[tail++] = start;
  while (head < tail) {
    const i = QUEUE[head++];
    const d = dist[i] + 1;
    const x = i % w;
    if (x > 0 && dist[i - 1] < 0 && !(flags[i - 1] & mask)) {
      dist[i - 1] = d;
      QUEUE[tail++] = i - 1;
    }
    if (x < w - 1 && dist[i + 1] < 0 && !(flags[i + 1] & mask)) {
      dist[i + 1] = d;
      QUEUE[tail++] = i + 1;
    }
    if (i >= w && dist[i - w] < 0 && !(flags[i - w] & mask)) {
      dist[i - w] = d;
      QUEUE[tail++] = i - w;
    }
    if (i < n - w && dist[i + w] < 0 && !(flags[i + w] & mask)) {
      dist[i + w] = d;
      QUEUE[tail++] = i + w;
    }
  }
}

/**
 * Поле расстояний до лисы (room.flow): пересчитывается, только когда лиса перешла в другую клетку. По нему
 * наземные звери идут к лисе в обход преград. Пока лиса летит над водой или стоит в проёме — поле прежнее.
 */
export function updateFlow(room, x, y) {
  const i = tileIndex(room, x, y);
  if (i < 0 || i === room.flowTile) return;
  if (room.flags[i] & (F_WALK | F_MOB)) {
    if (room.flowTile >= 0) return;
    // совсем без поля нельзя: считаем от ближайшей свободной клетки
    const p = SPOT;
    if (!nearestFree(room, x, y, p)) return;
    bfs(room, tileIndex(room, p.x, p.y), room.flow, F_WALK | F_MOB);
    room.flowTile = i;
    return;
  }
  bfs(room, i, room.flow, F_WALK | F_MOB);
  room.flowTile = i;
}

/** Поле расстояний до неподвижной точки (нора, место сбора): считается один раз и хранится, пока клетки не менялись. */
export function fieldTo(room, x, y) {
  const i = tileIndex(room, x, y);
  if (i < 0 || (room.flags[i] & (F_WALK | F_MOB))) return null;
  let f = room.fields.get(i);
  if (!f) {
    if (room.fields.size >= 12) room.fields.clear();
    f = new Int16Array(room.tiles.length);
    bfs(room, i, f, F_WALK | F_MOB);
    room.fields.set(i, f);
  }
  return f;
}

/** Куда шагнуть по полю — сюда пишет fieldDir. */
export const DIR = { x: 0, y: 0 };

/**
 * Направление из (x, y) к цели поля dist: в соседнюю клетку, где расстояние меньше (по диагонали — только если
 * не срезается угол). false — отсюда дороги нет (или уже на месте).
 */
export function fieldDir(room, dist, x, y) {
  const w = room.w;
  const tx = Math.floor(x / T);
  const ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= w || ty >= room.h) return false;
  const i = ty * w + tx;
  const here = dist[i];
  let best = here < 0 ? 32767 : here;
  let bx = 0;
  let by = 0;
  for (let k = 0; k < 4; k++) {
    const ox = k === 0 ? 1 : k === 1 ? -1 : 0;
    const oy = k === 2 ? 1 : k === 3 ? -1 : 0;
    if (tx + ox < 0 || tx + ox >= w || ty + oy < 0 || ty + oy >= room.h) continue;
    const d = dist[i + ox + oy * w];
    if (d >= 0 && d < best) {
      best = d;
      bx = ox;
      by = oy;
    }
  }
  if (here >= 0 && tx > 0 && tx < w - 1 && ty > 0 && ty < room.h - 1) {
    for (let k = 0; k < 4; k++) {
      const ox = k & 1 ? 1 : -1;
      const oy = k & 2 ? 1 : -1;
      const d = dist[i + ox + oy * w];
      if (d >= 0 && d < best && dist[i + ox] >= 0 && dist[i + oy * w] >= 0) {
        best = d;
        bx = ox;
        by = oy;
      }
    }
  }
  if (bx === 0 && by === 0) return false;
  const gx = (tx + bx) * T + T / 2 - x;
  const gy = (ty + by) * T + T / 2 - y;
  const l = Math.hypot(gx, gy) || 1;
  DIR.x = gx / l;
  DIR.y = gy / l;
  return true;
}

// ---------- свободные места ----------

/** Сюда пишут freeSpot, entryPoint и другие поиски места. */
export const SPOT = { x: 0, y: 0 };

/**
 * Случайная свободная клетка, до которой лиса может дойти: не ближе min и не дальше max от лисы, не под
 * предметом обстановки. Возвращает SPOT (середина клетки) или null. Случайность — партии (или своя rnd).
 */
export function freeSpot(G, min = 0, max = 1e9, r = rndOf(G)) {
  const room = G.room;
  const P = G.player;
  updateFlow(room, P.x, P.y);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < 40; k++) {
      const tx = 1 + Math.floor(r() * (room.w - 2));
      const ty = 1 + Math.floor(r() * (room.h - 2));
      const i = ty * room.w + tx;
      const code = room.tiles[i];
      if (room.flags[i] !== 0 || code === TILE.THORN || code === TILE.BURROW || code === TILE.DEN) continue;
      if (room.flowTile >= 0 && room.flow[i] < 0) continue;
      const x = tileX(tx);
      const y = tileY(ty);
      const d = Math.hypot(x - P.x, y - P.y);
      if (pass === 0 && (d < min || d > max)) continue;
      if (thingNear(room, x, y, 30)) continue;
      SPOT.x = x;
      SPOT.y = y;
      return SPOT;
    }
  }
  return null;
}

function thingNear(room, x, y, gap) {
  for (let i = 0; i < room.things.length; i++) {
    const th = room.things[i];
    if (Math.abs(th.x - x) < gap && Math.abs(th.y - y) < gap) return true;
  }
  return false;
}

/** Концы полосы — сюда пишет laneThrough. */
export const LANE = { x1: 0, y1: 0, x2: 0, y2: 0 };

/** Полоса через всю комнату: прямая через (x, y) под углом a, обрезанная по внутреннему краю стен. */
export function laneThrough(room, x, y, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x0 = T;
  const x1 = room.w * T - T;
  const y0 = T;
  const y1 = room.h * T - T;
  const px = clamp(x, x0 + 1, x1 - 1);
  const py = clamp(y, y0 + 1, y1 - 1);
  let lo = -1e9;
  let hi = 1e9;
  if (Math.abs(c) > 1e-6) {
    const a1 = (x0 - px) / c;
    const a2 = (x1 - px) / c;
    lo = Math.max(lo, Math.min(a1, a2));
    hi = Math.min(hi, Math.max(a1, a2));
  }
  if (Math.abs(s) > 1e-6) {
    const a1 = (y0 - py) / s;
    const a2 = (y1 - py) / s;
    lo = Math.max(lo, Math.min(a1, a2));
    hi = Math.min(hi, Math.max(a1, a2));
  }
  LANE.x1 = px + c * lo;
  LANE.y1 = py + s * lo;
  LANE.x2 = px + c * hi;
  LANE.y2 = py + s * hi;
  return LANE;
}

// ---------- красные зоны ----------

const ZPOOL = [];
const SHAPES = { circle: 0, lane: 1, cone: 2, ring: 3 };

/**
 * Зона-предупреждение: сначала total секунд «наливается», потом бьёт. Поля o:
 *   shape 'circle' (x, y, r) | 'lane' (x, y → x2, y2, ширина w) | 'cone' (x, y, направление a, раствор arc, радиус r)
 *         | 'ring' (x, y, радиус r, толщина w);
 *   t — сколько предупреждает; delay — через сколько вообще появится (для ударов по очереди);
 *   from 1 — бьёт лису (по умолчанию), 0 — зона самой лисы: бьёт врагов; dmg — урон (0 — только показать);
 *   owner — uid зверя: погиб до удара — зона отменяется; hitsMobs — задевает и зверей (лось топчет всех);
 *   kb — отбрасывание; run { speed, len } — после предупреждения по полосе бежит «тело» и бьёт на ходу;
 *   linger — сколько секунд место остаётся вредным после удара; burn / poison / slow / freeze / stun / root —
 *   что навешивает (секунды; poison — стопки); look — как рисовать ('red', 'fire', 'poison', 'web', 'ice');
 *   actor — фигура, которая показывается в момент удара ('haz.moose', 'haz.paw'); on(G, zone) — что ещё сделать
 *   в момент удара; tag — что угодно своё.
 * Возвращает зону или null, если их уже слишком много.
 */
export function addZone(G, o) {
  const room = G.room;
  if (room.zones.length >= CAPS.zones) return null;
  const z = ZPOOL.pop() ?? {};
  const st = o.status;
  z.uid = ++room.uid;
  z.shape = own(SHAPES, o.shape) ? o.shape : 'circle';
  z.sh = SHAPES[z.shape];
  z.x = o.x;
  z.y = o.y;
  z.r = o.r ?? 0;
  z.x2 = o.x2 ?? o.x;
  z.y2 = o.y2 ?? o.y;
  z.w = o.w ?? 0;
  z.a = z.sh === 1 ? Math.atan2(z.y2 - z.y, z.x2 - z.x) : o.a ?? 0;
  z.arc = o.arc ?? 0;
  z.from = o.from ?? 1;
  z.t = 0;
  z.total = Math.max(0.02, (o.t ?? o.total ?? 1) + (z.from === 1 ? G.player.st.warn : 0));
  z.dmg = o.dmg ?? 1;
  z.mobDmg = o.mobDmg ?? -1;
  z.look = o.look ?? 'red';
  z.owner = o.owner ?? 0;
  z.hitsMobs = Boolean(o.hitsMobs);
  z.kb = o.kb ?? 0;
  z.run = o.run ?? null;
  z.linger = o.linger ?? 0;
  z.burn = st?.burn ?? o.burn ?? 0;
  z.poison = st?.poison ?? o.poison ?? 0;
  z.slow = st?.slow ?? o.slow ?? 0;
  z.freeze = st?.freeze ?? o.freeze ?? 0;
  z.stun = st?.stun ?? o.stun ?? 0;
  z.root = st?.root ?? o.root ?? 0;
  z.on = typeof o.on === 'function' ? o.on : null;
  z.actor = o.actor ?? null;
  z.tag = o.tag ?? null;
  z.wait = o.delay ?? 0;
  z.phase = 0;                              // 0 — предупреждает, 1 — бежит или остаётся вредной
  z.left = 0;
  z.tick = 0;
  z.rx = z.x;                               // где сейчас бегущее по полосе тело
  z.ry = z.y;
  z.rt = 0;
  z.hitFox = false;
  room.zones.push(z);
  if (z.wait <= 0) announce(G, z);
  return z;
}

/** Зона стала видна: событие и (для вражеской) звук предупреждения. */
export function announce(G, z) {
  emit(G, { t: 'zone', zone: z });
  if (z.from === 1) sfx(G, 'warn', z.x, z.y);
}

export function removeZone(room, i) {
  const z = room.zones[i];
  swapRemove(room.zones, i);
  z.uid = 0;                                // кто держит убранную зону, увидит по uid, что её больше нет
  z.on = null;
  z.run = null;
  z.tag = null;
  ZPOOL.push(z);
}

/** Убрать зоны: все вражеские (from 1), все лисьи (0) или вообще все (−1). */
export function clearZones(room, from = -1) {
  for (let i = room.zones.length - 1; i >= 0; i--) {
    if (from < 0 || room.zones[i].from === from) removeZone(room, i);
  }
}

/** Зверь погиб — его недобитые предупреждения пропадают. */
export function cancelZonesOf(room, uid) {
  for (let i = room.zones.length - 1; i >= 0; i--) {
    const z = room.zones[i];
    if (z.owner === uid && z.phase === 0) removeZone(room, i);
  }
}

/** Задевает ли зона круг (x, y, r). */
export function inZone(z, x, y, r = 0) {
  if (z.sh === 0) {
    const dx = x - z.x;
    const dy = y - z.y;
    return dx * dx + dy * dy <= (z.r + r) * (z.r + r);
  }
  if (z.sh === 1) return segDist2(z.x, z.y, z.x2, z.y2, x, y) <= (z.w / 2 + r) * (z.w / 2 + r);
  if (z.sh === 2) return inCone(z.x, z.y, z.a, z.arc, z.r, x, y, r);
  return Math.abs(Math.hypot(x - z.x, y - z.y) - z.r) <= z.w / 2 + r;
}

/** Вражеская зона, в которой стоит точка (предупреждающая или ещё вредная), или null: «отсюда надо уходить». */
export function dangerAt(room, x, y, r = 0) {
  for (let i = 0; i < room.zones.length; i++) {
    const z = room.zones[i];
    if (z.from !== 1 || z.wait > 0) continue;
    if (inZone(z, x, y, r)) return z;
  }
  return null;
}

/** Куда бежать из зоны кратчайшим путём — в DIR. */
export function escapeDir(z, x, y) {
  let dx;
  let dy;
  if (z.sh === 1 || z.sh === 2) {
    // от оси полосы (или сектора) вбок
    const ax = z.sh === 1 ? z.x2 - z.x : Math.cos(z.a);
    const ay = z.sh === 1 ? z.y2 - z.y : Math.sin(z.a);
    const l = Math.hypot(ax, ay) || 1;
    const side = (x - z.x) * (-ay / l) + (y - z.y) * (ax / l);
    const s = side >= 0 ? 1 : -1;
    dx = (-ay / l) * s;
    dy = (ax / l) * s;
  } else {
    dx = x - z.x;
    dy = y - z.y;
    const l = Math.hypot(dx, dy);
    if (l < 0.01) {
      dx = 1;
      dy = 0;
    } else {
      // из кольца — внутрь, если до середины ближе
      const s = z.sh === 3 && l < z.r ? -1 : 1;
      dx = (dx / l) * s;
      dy = (dy / l) * s;
    }
  }
  DIR.x = dx;
  DIR.y = dy;
  return DIR;
}

// ---------- подбираемое ----------

const PPOOL = [];

/**
 * Положить на землю подбираемое: kind 'coin' | 'heart' | 'mana' | 'berry' | 'item'. v — сколько (монет, сердец,
 * маны); для вещи — id и уровень lvl. pop — выпрыгивает ли в сторону (false — лежит ровно здесь).
 * Монеты, сердца и мана подбираются сами, вещь — действием. Возвращает запись или null.
 */
export function addPick(G, kind, x, y, v = 1, id = null, lvl = 0, pop = true) {
  const room = G.room;
  if (room.picks.length >= CAPS.picks) {
    // места нет: монета прибавляется к лежащей, вещь вытесняет мелочь
    let at = -1;
    for (let i = 0; i < room.picks.length && at < 0; i++) {
      const k = room.picks[i].kind;
      if (kind === 'item' ? k !== 'item' : k === kind) at = i;
    }
    if (at < 0) return null;
    if (kind !== 'item') {
      room.picks[at].v += v;
      return room.picks[at];
    }
    removePick(room, at);
  }
  // на воду и в стену ничего не кладётся: оттуда вещь было бы не достать
  if (blockedAt(room, x, y, F_WALK) && nearestFree(room, x, y, SPOT)) {
    x = SPOT.x;
    y = SPOT.y;
  }
  const p = PPOOL.pop() ?? {};
  p.on = true;
  p.kind = kind;
  p.id = id;
  p.lvl = lvl;
  p.v = v;
  p.x = x;
  p.y = y;
  p.px = x;
  p.py = y;
  p.z = 0;
  p.vz = 0;
  p.vx = 0;
  p.vy = 0;
  p.t = 0;
  p.tag = null;
  p.pull = false;                           // true — летит к лисе откуда угодно (её тащит белка-спутник)
  if (pop) {
    const a = rnd(G) * TAU;
    const sp = 40 + rnd(G) * 70;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.vz = 120 + rnd(G) * 60;
  }
  room.picks.push(p);
  return p;
}

export function removePick(room, i) {
  const p = room.picks[i];
  swapRemove(room.picks, i);
  p.on = false;
  p.tag = null;
  PPOOL.push(p);
}

/** Несколько монет на сумму n (по одной-две-пять, чтобы не сыпать сотню кружков). */
export function dropCoins(G, x, y, n) {
  let left = Math.max(0, Math.round(n));
  let guard = 0;
  while (left > 0 && guard++ < 6) {
    const v = left > 12 ? 5 : left > 5 ? 2 : 1;
    const piece = guard === 6 ? left : v;
    addPick(G, 'coin', x, y, piece);
    left -= piece;
  }
}

// ---------- предметы обстановки ----------

/**
 * Поставить предмет: сундук, прилавок, пень задания, торговца, портал. Поля o:
 *   kind — что это (картинка thing.<kind>): 'chest', 'pedestal', 'portal', 'stump', 'target', 'sign', 'altar'…;
 *   v — вариант картинки (сундук: 0 закрыт, 1 открыт); rig — вместо картинки живая фигура ('trader');
 *   x, y, r — место и радиус (сквозь solid-предмет не пройти);
 *   usable — с ним можно что-то сделать действием; reach — с какого расстояния (иначе r + 26);
 *   place — id места, которому он принадлежит: действие и подпись уйдут в PLACES[place].use / label;
 *   item { id, lvl } и cost — что лежит и почём (прилавок); icon — картинка над предметом, если лежит не вещь
 *   ('pick.heart', 'pick.mana'); text — подсказка (табличка);
 *   breakable, hp — ломается рывком и выстрелами (пень задания, мишень); tag, data — что угодно своё.
 * Возвращает предмет или null, если их уже слишком много.
 */
export function addThing(G, o) {
  const room = G.room;
  if (room.things.length >= CAPS.things) return null;
  const th = {
    uid: ++room.uid, kind: o.kind, v: o.v ?? 0, rig: o.rig ?? null,
    x: o.x, y: o.y, r: o.r ?? 12, solid: o.solid ?? true,
    usable: o.usable ?? false, reach: o.reach ?? 0, place: o.place ?? null,
    item: o.item ?? null, icon: o.icon ?? null, cost: o.cost ?? 0, text: o.text ?? '',
    breakable: Boolean(o.breakable), hp: o.hp ?? 1, broken: false,
    act: 'idle', k: 0, face: o.face ?? 1, flash: 0, t: 0, z: 0,
    tag: o.tag ?? null, data: o.data ?? {}, loot: o.loot ?? null,
  };
  room.things.push(th);
  return th;
}

export function removeThing(room, th) {
  const i = room.things.indexOf(th);
  if (i >= 0) swapRemove(room.things, i);
  if (room.focusObj.ref === th) {
    room.focus = null;
    room.focusObj.ref = null;
  }
}

/** Вытолкнуть круг e из предметов, сквозь которые не пройти. true — пришлось толкать. */
export function pushFromThings(room, e, r) {
  let pushed = false;
  for (let i = 0; i < room.things.length; i++) {
    const th = room.things[i];
    if (!th.solid || th.broken) continue;
    const dx = e.x - th.x;
    const dy = e.y - th.y;
    const min = r + th.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 0.01) e.x += min;
    else {
      e.x += (dx / d) * (min - d);
      e.y += (dy / d) * (min - d);
    }
    pushed = true;
  }
  return pushed;
}

// ---------- бегущие фигуры напастей ----------

/**
 * Чисто видимая фигура: лось, бегущий по полосе, лапа медведя. rig — какая, (x, y) — где, (vx, vy) — куда
 * бежит, life — сколько живёт; act и k (0…1) — поза для рисунка.
 */
export function addActor(room, rig, x, y, vx = 0, vy = 0, life = 0.5, act = 'attack') {
  if (room.actors.length >= CAPS.actors) return null;
  const a = { rig, x, y, px: x, py: y, vx, vy, z: 0, face: vx < 0 ? -1 : 1, act, k: 0, t: 0, life, flash: 0 };
  room.actors.push(a);
  return a;
}

export function stepActors(room, dt) {
  for (let i = room.actors.length - 1; i >= 0; i--) {
    const a = room.actors[i];
    a.px = a.x;
    a.py = a.y;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.t += dt;
    a.k = a.life > 0 ? Math.min(1, a.t / a.life) : 1;
    if (a.t >= a.life) swapRemove(room.actors, i);
  }
}

// ---------- фокус ----------

/**
 * С чем лиса может что-то сделать прямо сейчас: ближайшая вещь на земле или предмет, до которого она дотягивается.
 * room.focus = { type: 'pick' | 'thing' | 'hint', ref, title, sub, cost, ok } или null. title — что будет сделано
 * («Взять», «Купить», «Открыть»), sub — с чем, cost — цена в монетах (0 — даром), ok — получится ли сейчас.
 * 'hint' — табличка: её текст просто показывается, действие она не перехватывает.
 */
export function updateFocus(G) {
  const room = G.room;
  const P = G.player;
  const F = room.focusObj;
  let best = null;
  let type = '';
  let bestD = Infinity;
  if (P.down <= 0 && !P.dash) {
    for (let i = 0; i < room.picks.length; i++) {
      const p = room.picks[i];
      if (p.kind !== 'item' || p.t < 0.3) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < PICK.itemReach && d < bestD) {
        best = p;
        bestD = d;
        type = 'pick';
      }
    }
    for (let i = 0; i < room.things.length; i++) {
      const th = room.things[i];
      if (th.broken || (!th.usable && !th.text)) continue;
      const reach = th.reach || th.r + PICK.thingReach;
      let d = Math.hypot(th.x - P.x, th.y - P.y);
      if (d > reach) continue;
      if (!th.usable) d += 1000;                          // табличка — только если рядом нет ничего другого
      if (d < bestD) {
        best = th;
        bestD = d;
        type = th.usable ? 'thing' : 'hint';
      }
    }
  }
  if (!best) {
    room.focus = null;
    F.ref = null;
    return;
  }
  if (F.ref !== best || --F.left <= 0) {
    F.ref = best;
    F.type = type;
    F.left = 20;
    F.title = '';
    F.sub = '';
    F.cost = 0;
    F.ok = true;
    if (type === 'pick') {
      F.title = 'Взять';
      F.sub = itemDef(best.id)?.name ?? '';
    } else if (type === 'hint') {
      F.title = best.text;
      F.ok = false;
    } else {
      const label = best.place ? REG.PLACES[best.place]?.label?.(G, best) : null;
      if (label) {
        F.title = label.title ?? '';
        F.sub = label.sub ?? '';
        F.cost = label.cost ?? 0;
        F.ok = label.ok !== false;
      } else if (best.kind === 'portal') {
        F.title = 'Дальше';
        F.sub = 'Следующая локация';
      } else if (best.kind === 'chest') F.title = 'Открыть';
      else F.title = 'Осмотреть';
    }
  }
  room.focus = F;
}

/** Комната уходит: её зоны и подбираемое возвращаются в запас. */
export function disposeRoom(room) {
  if (!room) return;
  while (room.zones.length) removeZone(room, room.zones.length - 1);
  while (room.picks.length) removePick(room, room.picks.length - 1);
}
