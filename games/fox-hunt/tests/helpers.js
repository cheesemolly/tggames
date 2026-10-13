// Общие помощники тестов «Лисьей охоты»: пустая арена, ввод, прогон шагов, отпечаток состояния, поиск «не чисел»
// и простой игрок по сценарию (ловит добычу, бьёт врагов, уходит из красных зон, идёт к хозяину места).

import assert from 'node:assert/strict';
import { H, T, F_WALK, F_LEAP, REG, FOX_R, kindOf } from '../core.js';
import { newRun, step, drain, chooseGift } from '../logic.js';
import { enterRoom } from '../director.js';
import { dangerAt, escapeDir, fieldTo, fieldDir, DIR, castRay, entryPoint, circleHits } from '../world.js';
import { spawnMob } from '../ai.js';

export const DT = H;

/** Чистый ввод (все поля — как у настоящего), поверх — свои значения. */
export function makeInput(over = {}) {
  return { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0, ...over };
}

/** Сделать n шагов с одним вводом (разовые команды — только в первом); вернуть все события. */
export function runSteps(G, n, input = makeInput(), each = null) {
  const all = [];
  const held = { ...input, dash: false, act: false };
  for (let i = 0; i < n; i++) {
    step(G, i === 0 ? input : held);
    for (const e of drain(G)) all.push(e);
    if (each && each(G, i) === false) break;
  }
  return all;
}

/** Шагать, пока cond(G) не станет правдой (или не выйдет время); вернуть события. */
export function runUntil(G, cond, { seconds = 10, input = makeInput(), each = null } = {}) {
  const all = [];
  const held = { ...input, dash: false, act: false };
  for (let i = 0; i < seconds * 60; i++) {
    step(G, i === 0 ? input : held);
    for (const e of drain(G)) all.push(e);
    if (each) each(G, i);
    if (cond(G)) break;
  }
  return all;
}

export const of = (events, t) => events.filter((e) => e.t === t);
export const sounds = (events) => events.filter((e) => e.t === 'sfx').map((e) => e.id);

const quietRoom = (id, type, tpl, doors) => ({
  id, gx: id, gy: 0, type, tpl, flip: 0, state: 'cleared', seen: true, doors: { n: -1, e: -1, s: -1, w: -1, ...doors }, data: {}, mod: null,
});

/**
 * Тихая арена для опытов: партия, в которой лиса стоит в пустой зачищенной комнате (без хода, зверей и вещей).
 * tpl — шаблон комнаты; door — есть ли дверь на восток (за ней вторая такая же комната).
 */
export function arena({ seed = 1, tpl = 'forest-arena', floor = 1, door = false } = {}) {
  const G = newRun(seed, { floor });
  G.map = {
    rooms: [quietRoom(0, 'hunt', tpl, door ? { e: 1 } : {}), quietRoom(1, 'hunt', tpl, door ? { w: 0 } : {})],
    cur: 0, entry: 'c', bossId: 1, startId: 0, hunts: 0,
  };
  enterRoom(G, 0, 'c');
  drain(G);
  return G;
}

/** Неподвижное чучело-враг для опытов (описание заводится в реестре один раз). */
export function dummy(G, x, y, over = {}) {
  if (!REG.MOBS['test-dummy']) REG.MOBS['test-dummy'] = { name: 'Чучело', kind: 'hostile', hp: 1000, r: 10, pts: 1, touch: 0, wave: false };
  const m = spawnMob(G, 'test-dummy', x, y, { warm: 0 });
  return Object.assign(m, over);
}

/** Поставить лису в точку (без скорости и недобитых действий). */
export function put(G, x, y) {
  const P = G.player;
  Object.assign(P, { x, y, px: x, py: y, vx: 0, vy: 0, dash: null, z: 0, inv: 0 });
}

// ---------- отпечаток и проверка чисел ----------

/** Отпечаток состояния партии: одинаковые партии дают одинаковую строку. Комната — вместе со всем живым в ней. */
export function stateHash(G) {
  const skip = new Set(['def', 'rec', 'events', 'focusObj', 'fields', 'dashBuf', 'aimBuf', 'lobBuf', 'tgt', 'target', 'on', 'run', 'done', 'st', 'focus']);
  const seen = new Set();
  let h = 2166136261;
  const mix = (s) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  };
  const walk = (v) => {
    if (v === null || v === undefined) return mix('~');
    if (typeof v === 'number') return mix(Number.isInteger(v) ? String(v) : v.toFixed(6));
    if (typeof v === 'string' || typeof v === 'boolean') return mix(String(v));
    if (typeof v === 'function') return undefined;
    if (ArrayBuffer.isView(v)) return mix(Array.from(v).join(','));
    if (seen.has(v)) return undefined;
    seen.add(v);
    if (Array.isArray(v)) {
      mix('[');
      for (const x of v) walk(x);
      return mix(']');
    }
    if (v instanceof Map) return undefined;
    for (const k of Object.keys(v).sort()) {
      if (skip.has(k)) continue;
      mix(k);
      walk(v[k]);
    }
    return undefined;
  };
  walk(G);
  return (h >>> 0).toString(16);
}

/** Пройти всё состояние и убедиться, что нигде нет «не числа» и бесконечности. Возвращает путь к первой беде или null. */
export function findNaN(G) {
  const seen = new Set();
  const stack = [[G, 'G']];
  while (stack.length) {
    const [v, path] = stack.pop();
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return `${path} = ${v}`;
      continue;
    }
    if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v) || seen.has(v)) continue;
    seen.add(v);
    if (v instanceof Map) continue;
    for (const k of Object.keys(v)) {
      if (k === 'def') continue;                              // описания из реестра — не состояние
      stack.push([v[k], `${path}.${k}`]);
    }
  }
  return null;
}

/** Всё ли живое внутри комнаты и в пределах запасов; лиса — не в преграде. Возвращает описание беды или null. */
export function findOutside(G, caps) {
  const room = G.room;
  const P = G.player;
  const w = room.w * T;
  const h = room.h * T;
  const inRoom = (e) => e.x >= 0 && e.y >= 0 && e.x <= w && e.y <= h;
  for (const [name, list] of [['mobs', room.mobs], ['shots', room.shots], ['picks', room.picks], ['zones', room.zones], ['things', room.things], ['pals', room.pals]]) {
    if (list.length > caps[name]) return `${name}: ${list.length} > ${caps[name]}`;
    if (name === 'zones') continue;
    for (const e of list) if (!e.dead && !inRoom(e)) return `${name}: (${e.x}, ${e.y}) за комнатой`;
  }
  if (!inRoom(P)) return `лиса за комнатой: (${P.x}, ${P.y})`;
  if (!P.dash && circleHits(room, P.x, P.y, FOX_R - 0.5, F_WALK)) return `лиса в преграде: (${P.x.toFixed(1)}, ${P.y.toFixed(1)})`;
  return null;
}

// ---------- игрок по сценарию ----------

const reach = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Куда шагнуть, чтобы дойти до точки: напрямик, если путь свободен, иначе — по полю путей комнаты.
function stepTo(room, P, x, y, out) {
  const dx = x - P.x;
  const dy = y - P.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return false;
  out.mx = dx / d;
  out.my = dy / d;
  if (d < 28 || castRay(room, P.x, P.y, x, y, F_WALK) >= 1) return true;
  const f = fieldTo(room, x, y);
  if (f && fieldDir(room, f, P.x, P.y)) {
    out.mx = DIR.x;
    out.my = DIR.y;
  }
  return true;
}

// К какой двери идти: кратчайшим путём по карте к цели (хозяин места, пока он жив).
function doorTowards(G, goal) {
  const { rooms, cur } = G.map;
  const prev = new Map([[cur, null]]);
  const queue = [cur];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    if (id === goal) break;
    for (const side of ['n', 'e', 's', 'w']) {
      const to = rooms[id].doors[side];
      if (to >= 0 && !prev.has(to)) {
        prev.set(to, [id, side]);
        queue.push(to);
      }
    }
  }
  let at = goal;
  let side = null;
  while (prev.get(at)) {
    const [from, s] = prev.get(at);
    side = s;
    at = from;
    if (from === cur) break;
  }
  return side;
}

/**
 * Игрок по сценарию. bot(G) → ввод на этот шаг. Идёт к ближайшей добыче или врагу и делает рывок, когда достаёт
 * (в колючего не прыгает); держит выстрел, если есть оружие; уходит из красных зон; берёт вещи, открывает
 * сундуки, идёт через двери к хозяину места, а после него — в портал. careless — «беспечный»: зон не боится,
 * не стреляет и лезет к врагам вплотную (так партия без неуязвимости точно кончится). doors: false — из комнаты
 * не уходит.
 */
export function createBot({ careless = false, doors = true } = {}) {
  const input = makeInput();
  let stuck = 0;
  let lastX = 0;
  let lastY = 0;
  let wiggle = 0;
  return function bot(G) {
    Object.assign(input, { mx: 0, my: 0, fire: false, act: false, dash: false, dx: 0, dy: 0, dp: 0, aim: false });
    if (G.pending) {
      chooseGift(G, 0);
      return input;
    }
    const room = G.room;
    const P = G.player;
    if (P.down > 0 || G.over) return input;

    // застрял (упёрся во что-то) — немного в сторону
    if (Math.hypot(P.x - lastX, P.y - lastY) < 0.3) stuck += 1;
    else stuck = 0;
    lastX = P.x;
    lastY = P.y;
    if (stuck > 40) {
      wiggle = 30;
      stuck = 0;
    }

    if (!careless) {
      const z = dangerAt(room, P.x, P.y, 14);
      if (z) {
        const d = escapeDir(z, P.x, P.y);
        input.mx = d.x;
        input.my = d.y;
        input.fire = Boolean(G.inv.weapon) && room.mobs.some((m) => !m.dead && m.kind !== 0);
        return input;
      }
    }

    // ближайший зверь
    let target = null;
    let best = Infinity;
    for (const m of room.mobs) {
      if (m.dead || m.hide) continue;
      const d = reach(m, P) - (m.kind === 0 ? 30 : 0);
      if (d < best) {
        best = d;
        target = m;
      }
    }
    if (target) {
      const d = reach(target, P);
      const spiky = target.kind !== 0 && Boolean(target.def.spiky?.(target, G, P.x, P.y));
      input.fire = !careless && Boolean(G.inv.weapon) && target.kind !== 0;
      if (careless && target.kind !== 0) {
        stepTo(room, P, target.x, target.y, input);
        return input;
      }
      if (spiky && d < 90) {
        input.mx = (P.x - target.x) / (d || 1);
        input.my = (P.y - target.y) / (d || 1);
      } else stepTo(room, P, target.x, target.y, input);
      if (!spiky && target.inv <= 0 && d < 125 && d > 4 && P.charges > 0 && !P.dash && castRay(room, P.x, P.y, target.x, target.y, F_LEAP) >= 1) {
        input.dash = true;
        input.dx = (target.x - P.x) / d;
        input.dy = (target.y - P.y) / d;
        input.dp = Math.min(1, Math.max(0, (d + 24) / P.st.dashDist - 0.45) / 0.55);
      }
      if (wiggle > 0) {
        wiggle -= 1;
        [input.mx, input.my] = [-input.my, input.mx];
      }
      return input;
    }

    // пни задания (и всё ломкое) — рывком
    const stump = room.things.find((th) => th.breakable && !th.broken);
    if (stump) {
      const d = reach(stump, P);
      stepTo(room, P, stump.x, stump.y, input);
      if (d < 110 && d > 4 && P.charges > 0 && !P.dash && castRay(room, P.x, P.y, stump.x, stump.y, F_LEAP) >= 1) {
        input.dash = true;
        input.dx = (stump.x - P.x) / d;
        input.dy = (stump.y - P.y) / d;
        input.dp = Math.min(1, Math.max(0, (d + 24) / P.st.dashDist - 0.45) / 0.55);
      }
      return input;
    }
    // комната ещё ждёт, пока лиса зайдёт, — заходим
    if (room.dir.mode === 'enter') {
      stepTo(room, P, room.center.x, room.center.y, input);
      return input;
    }

    // вещи на земле, сердца, сундуки, портал
    let goal = null;
    let act = false;
    const bagFree = G.inv.bag.includes(null);
    for (const p of room.picks) {
      if (p.kind === 'item') {
        const kind = kindOf(p.id);
        const fits = kind === 'acc' ? G.inv.acc.includes(null) : kind !== 'potion' && !G.inv[kind];
        if (!fits && !bagFree) continue;
      } else if ((p.kind === 'heart' || p.kind === 'berry') && P.hp >= P.st.maxHp) continue;
      else if (p.kind === 'mana' && P.mana >= P.st.maxMana) continue;
      if (!goal || reach(p, P) < reach(goal, P)) {
        goal = p;
        act = p.kind === 'item';
      }
    }
    if (!goal) {
      for (const th of room.things) {
        if (!th.usable || th.broken) continue;
        if (th.kind === 'portal' && G.map.rooms[G.map.bossId].state !== 'cleared') continue;
        if (th.kind === 'pedestal') continue;                 // в лавке сценарий ничего не покупает
        if (!goal || th.kind !== 'portal') {
          goal = th;
          act = true;
        }
      }
    }
    if (goal) {
      stepTo(room, P, goal.x, goal.y, input);
      if (act && room.focus && room.focus.ref === goal) {
        input.act = true;
        input.mx = 0;
        input.my = 0;
      }
    } else if (doors) {
      const side = doorTowards(G, G.map.bossId);
      const door = side && room.doors[side];
      if (door && door.open) {
        // сначала на клетку перед проёмом, потом в него
        const front = entryPoint(room, side, { x: 0, y: 0 });
        if (reach(front, P) > 14 && castRay(room, P.x, P.y, door.x, door.y, F_WALK) < 1) stepTo(room, P, front.x, front.y, input);
        else stepTo(room, P, door.x, door.y, input);
      }
    }
    if (wiggle > 0) {
      wiggle -= 1;
      [input.mx, input.my] = [-input.my, input.mx];
    }
    return input;
  };
}

/** Прогнать партию сценарием seconds секунд игрового времени (или до конца партии); each(G) — проверка каждый шаг. */
export function playBot(G, bot, seconds, each = null) {
  const until = G.time + seconds;
  let guard = seconds * 60 + 600;
  while (!G.over && G.time < until && guard-- > 0) {
    step(G, bot(G));
    G.events.length = 0;
    if (each) each(G);
  }
  return G;
}

export { assert };
