// Бой «Лисьей охоты»: урон зверям и действия на них, очки и добыча, выстрелы (свои и вражеские), взрывы и
// срабатывание красных зон. Без DOM.
//
// Выстрелы, зоны и подбираемое берутся из запаса и возвращаются в него: за шаг расчёта ничего не создаётся.
// Быстрый выстрел проверяется отрезком «откуда → куда», так что цель он не проскочит. Цели ищутся не среди
// всех зверей, а по сетке соседей.
//
// Погибший зверь не убирается из списка сразу (его помечают dead, а чистит шаг зверей) — поэтому все обходы
// здесь пропускают мёртвых, а обработчики содержимого могут спокойно убивать и создавать зверей посреди обхода.

import {
  T, TILE, F_SHOT, FOX_R, CAPS, REG, rnd, randInt, angDiff, segDist2, createGrid, swapRemove, emit, sfx, haptic, shake,
} from './core.js';
import { STATUS, MOB, DROPS, PICK, POSE, POINTS, bossPts } from './balance.js';
import {
  tileIndex, castRay, hitTile, breakBush, addZone, removeZone, announce, cancelZonesOf, inZone, addPick, dropCoins, addActor,
} from './world.js';
import { hurtPlayer, heal, addMana, gainCoins, addEffect, setAct } from './player.js';
import { rollItem } from './inventory.js';
import { hurtPal } from './ai.js';
import { bossDied } from './director.js';

// ---------- попадание ----------

/**
 * Описание попадания для hurtMob. Один и тот же объект на всех: взяли через hitOf(kind), заполнили, передали.
 *   kind — 'dash' | 'shot' | 'burn' | 'poison' | 'zone' | 'pal' | 'thorns';
 *   crit — урон вдвое; kx, ky — отбрасывание (скорость, ед./с; делится на массу зверя);
 *   ax, ay — куда летел удар (единичный вектор; 0, 0 — неизвестно): по нему зверь с панцирем поймёт, спереди ли били;
 *   burn, slow, freeze, stun — на сколько секунд поджечь, замедлить, заморозить, оглушить; poison — сколько стопок яда.
 */
export const HIT = { kind: 'shot', crit: false, kx: 0, ky: 0, ax: 0, ay: 0, burn: 0, poison: 0, slow: 0, freeze: 0, stun: 0 };
const NO_HIT = Object.freeze({ kind: 'zone', crit: false, kx: 0, ky: 0, ax: 0, ay: 0, burn: 0, poison: 0, slow: 0, freeze: 0, stun: 0 });

/** Чистое описание попадания вида kind (общий объект HIT — заполнить и сразу передать в hurtMob). */
export function hitOf(kind) {
  HIT.kind = kind;
  HIT.crit = false;
  HIT.kx = 0;
  HIT.ky = 0;
  HIT.ax = 0;
  HIT.ay = 0;
  HIT.burn = 0;
  HIT.poison = 0;
  HIT.slow = 0;
  HIT.freeze = 0;
  HIT.stun = 0;
  return HIT;
}

/** Очки: в счёт и всплывающей цифрой над местом. */
export function addScore(G, n, x, y) {
  if (!(n > 0)) return;
  G.score += n;
  emit(G, { t: 'score', x, y, n });
}

/**
 * Ударить зверя. Возвращает true, если удар прошёл. Зверь в метке появления, спрятавшийся (hide) и уже погибший
 * не задеваются; описание зверя может отменить удар (onHurt вернул false). Добыча от любого удара поймана.
 * Заморозка и оглушение на хозяев мест не действуют — вместо них замедление.
 */
export function hurtMob(G, m, dmg, hit = NO_HIT) {
  if (m.dead || m.hide || m.inv > 0) return false;
  if (m.kind === 0) {
    catchPrey(G, m, 0);
    return true;
  }
  const def = m.def;
  if (def.onHurt && def.onHurt(m, G, hit) === false) return false;
  const kind = hit.kind ?? 'zone';
  const crit = Boolean(hit.crit);
  if (hit.burn > 0) m.burn = Math.max(m.burn, hit.burn);
  if (hit.poison > 0) {
    m.pstacks = Math.min(STATUS.poisonMax, m.pstacks + hit.poison);
    m.poison = STATUS.poisonTime;
  }
  if (hit.slow > 0) m.slow = Math.max(m.slow, hit.slow);
  const hold = Math.max(hit.freeze || 0, hit.stun || 0);
  if (hold > 0) {
    if (m.kind === 2) m.slow = Math.max(m.slow, hold);
    else if (hit.freeze > 0) m.freeze = Math.max(m.freeze, hit.freeze);
    else m.stun = Math.max(m.stun, hit.stun);
  }
  const mass = def.mass ?? 1;
  if (hit.kx || hit.ky) {
    m.kbx += hit.kx / mass;
    m.kby += hit.ky / mass;
  }
  if (!(dmg > 0)) return true;                              // только навесили действие
  const d = crit ? dmg * 2 : dmg;
  m.hp -= d;
  m.flash = POSE.flash;
  emit(G, { t: 'hit', x: m.x, y: m.y, dmg: d, crit, kind });
  if (kind === 'burn' || kind === 'poison') {
    // тление и яд тикают молча
  } else if (crit) sfx(G, 'crit', m.x, m.y);
  else sfx(G, 'hit', m.x, m.y);
  if (m.hp <= 0) killMob(G, m);
  return true;
}

/** Зверь погиб: очки, счётчики, добыча, обработчик onDie; хозяин места — конец боя. */
export function killMob(G, m) {
  if (m.dead) return;
  m.dead = true;
  m.hp = 0;
  const P = G.player;
  const def = m.def;
  cancelZonesOf(G.room, m.uid);
  if (m.kind === 0) return;
  const pts = m.noScore ? 0 : m.kind === 2 ? bossPts(def, G.loop) : (def.pts ?? 1) * (m.elite ? MOB.elitePts : 1);
  addScore(G, pts, m.x, m.y);
  G.cnt.kills += 1;
  P.kills += 1;
  const every = P.st.flags.killHeal;
  if (every > 0 && P.kills % every === 0 && heal(G, 1) > 0) sfx(G, 'heal', P.x, P.y);
  emit(G, { t: 'die', x: m.x, y: m.y, id: m.id, elite: m.elite });
  sfx(G, 'kill', m.x, m.y);
  if (!m.noLoot) dropLoot(G, m);
  if (def.onDie) def.onDie(m, G);
  if (m.kind === 2) bossDied(G, m);
}

function dropExtra(G, m) {
  const drops = m.def.drops;
  if (!drops) return;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (rnd(G) < (d.p ?? 1)) addPick(G, d.kind, m.x, m.y, d.v ?? 1, d.id ?? null);
  }
}

function dropLoot(G, m) {
  const def = m.def;
  const luck = G.player.st.luck;
  if (def.coins) {
    const n = randInt(G, def.coins[0], def.coins[1]) * (m.elite ? 2 : 1);
    if (n > 0) dropCoins(G, m.x, m.y, n);
  }
  dropExtra(G, m);
  if (m.kind === 2) return;                                 // хозяин места: его награда — сундук и дар
  if (rnd(G) < (m.elite ? DROPS.eliteHeart : DROPS.heart) + luck * DROPS.luckHeart) addPick(G, 'heart', m.x, m.y, 1);
  if (rnd(G) < DROPS.mana) addPick(G, 'mana', m.x, m.y, PICK.mana);
  if (m.elite) addPick(G, 'mana', m.x, m.y, PICK.mana);
  if (rnd(G) < (m.elite ? DROPS.eliteItem : DROPS.item) + luck * DROPS.luckItem) {
    const it = rollItem(G, { minRarity: m.elite ? 1 : 0 });
    if (it) addPick(G, 'item', m.x, m.y, 1, it.id, 0);
  }
}

/**
 * Добыча поймана: очки (плюс за каждую следующую в том же рывке), монеты, счётчики. chain — какая по счёту в
 * этом рывке (0 — поймана не рывком: телом, выстрелом, спутником).
 */
export function catchPrey(G, m, chain = 0) {
  if (m.dead) return;
  m.dead = true;
  const P = G.player;
  const st = P.st;
  const f = st.flags;
  const def = m.def;
  const room = G.room;
  const mod = room.mod ? REG.MODS[room.mod] : null;
  const pts = (def.pts ?? 1) + st.rabbitPts + (mod?.preyPts ?? 0) + (chain > 1 ? POINTS.chain : 0);
  addScore(G, pts, m.x, m.y);
  G.cnt.rabbits += 1;
  emit(G, { t: 'catch', x: m.x, y: m.y, id: m.id, pts, chain });
  sfx(G, 'catch', m.x, m.y, Math.max(1, chain));
  haptic(G, 'light');
  if (def.coins && rnd(G) < (def.coinChance ?? 1)) {
    const n = randInt(G, def.coins[0], def.coins[1]);
    if (n > 0) dropCoins(G, m.x, m.y, n);
  }
  dropExtra(G, m);
  if (f.coinPerRabbit > 0) gainCoins(G, f.coinPerRabbit, m.x, m.y);
  if (f.manaPerRabbit > 0) addMana(G, f.manaPerRabbit);
  if (!P.dash) setAct(P, 'bite', POSE.bite);
  if (def.onCatch) def.onCatch(m, G);
  const task = room.task;
  if (task && task.def.onCatch) task.def.onCatch(G, task, m);
}

/**
 * Сломать ломкий предмет (пень задания, мишень): dmg снимается с его прочности. true — сломался.
 * О поломке узнают задание (onBreak) и место, которому предмет принадлежит.
 */
export function breakThing(G, th, dmg) {
  if (th.broken || !th.breakable) return false;
  th.hp -= dmg;
  th.flash = POSE.flash;
  if (th.hp > 0) return false;
  th.broken = true;
  th.v = 1;
  th.usable = false;
  th.solid = false;
  emit(G, { t: 'break', x: th.x, y: th.y, what: th.kind });
  sfx(G, 'stump', th.x, th.y);
  const task = G.room.task;
  if (task && task.def.onBreak) task.def.onBreak(G, task, th);
  if (th.place) REG.PLACES[th.place]?.onBreak?.(G, th);
  return true;
}

// ---------- выстрелы ----------

const SPOOL = [];
const GRID = createGrid(64, 512, CAPS.mobs);
const NEAR = new Int16Array(CAPS.mobs);
const MOB_R_MAX = 32;                       // запас поиска по сетке: радиус самого большого зверя
const TRAP = 3;                             // mode: капкан лежит и ждёт

function newShot() {
  return {
    on: false, uid: 0, look: 'shot.orb', v: 0, from: 0, owner: 0,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, z: 8, a: 0, speed: 0, r: 4, dmg: 1, life: 1, t: 0,
    pierce: 0, bounce: 0, homing: 0, chain: 0, chainR: 110, kb: 0,
    burn: 0, poison: 0, slow: 0, freeze: 0, stun: 0, root: 0,
    lob: null, lobBuf: { sx: 0, sy: 0, tx: 0, ty: 0, t: 0, dur: 1, r: 40, h: 44 },
    last: [0, 0, 0, 0], ln: 0, tgt: null,
    mode: 0,                                // 0 — летит прямо, 1 — бумеранг туда, 2 — обратно, 3 — капкан
    through: false, spin: false, ghost: false,
    radius: 0, linger: 0, zoneLook: 'poison', zoneDmg: 0, tile: -1,
  };
}

/**
 * Выпустить выстрел из (x, y) под углом ang. from: 0 — лиса, 1 — враг, 2 — спутник. spec — описание (поле shot
 * оружия или то, чем стреляет зверь):
 *   look, v — картинка и её вариант ('shot.cone', 'shot.orb' + v 0…5 …); speed — скорость; r — радиус попадания;
 *   range — дальность (или life — секунды полёта); dmg — урон (если не задан отдельно аргументом);
 *   pierce — сквозь сколько целей пролетит; bounce — сколько раз отскочит от стен; homing — как круто
 *   доворачивает к цели (рад/с); chain — на сколько целей перескочит; kb — отбрасывание;
 *   burn, slow, freeze, stun (секунды), poison (стопки) — что навешивает; radius — взрыв такого радиуса при
 *   попадании; linger — после взрыва на столько секунд остаётся облако (zoneLook, zoneDmg — его вид и урон);
 *   through — летит сквозь стены; spin — картинка вращается; z — высота над землёй для рисунка.
 * Возвращает выстрел или null, если их уже слишком много.
 */
export function fireShot(G, from, x, y, ang, spec, dmg, owner = 0) {
  const room = G.room;
  if (room.shots.length >= CAPS.shots) return null;
  const st = G.player.st;
  const s = SPOOL.pop() ?? newShot();
  let speed = spec.speed ?? 300;
  if (from === 0) speed *= st.shotSpeed;
  else if (from === 1 && st.flags.projSlow > 0) speed *= 1 - st.flags.projSlow;
  const range = spec.range != null ? spec.range * (from === 0 ? st.wRange : 1) : 0;
  s.on = true;
  s.uid = ++room.uid;
  s.look = spec.look ?? 'shot.orb';
  s.v = spec.v ?? 0;
  s.from = from;
  s.owner = owner;
  s.x = x;
  s.y = y;
  s.px = x;
  s.py = y;
  s.vx = Math.cos(ang) * speed;
  s.vy = Math.sin(ang) * speed;
  s.a = ang;
  s.speed = speed;
  s.z = spec.z ?? 8;
  s.r = spec.r ?? 4;
  s.dmg = dmg ?? spec.dmg ?? 1;
  s.life = spec.life ?? (range > 0 && speed > 0 ? range / speed : 1.2);
  s.t = 0;
  s.pierce = spec.pierce ?? 0;
  s.bounce = spec.bounce ?? 0;
  s.homing = spec.homing ?? 0;
  s.chain = spec.chain ?? 0;
  s.chainR = spec.chainR ?? 110;
  s.kb = spec.kb ?? 0;
  s.burn = spec.burn ?? 0;
  s.poison = spec.poison ?? 0;
  s.slow = spec.slow ?? 0;
  s.freeze = spec.freeze ?? 0;
  s.stun = spec.stun ?? 0;
  s.root = spec.root ?? 0;
  s.lob = null;
  forget(s);
  s.tgt = null;
  s.mode = 0;
  s.through = Boolean(spec.through);
  s.spin = Boolean(spec.spin);
  s.ghost = false;
  s.radius = spec.radius ?? 0;
  s.linger = spec.linger ?? 0;
  s.zoneLook = spec.zoneLook ?? 'poison';
  s.zoneDmg = spec.zoneDmg ?? 0;
  s.tile = -1;
  room.shots.push(s);
  return s;
}

/**
 * Бросить навесом из (x, y) в точку (tx, ty): в полёте стены не мешают, в точке — взрыв радиуса spec.radius.
 * spec.time — сколько летит (иначе по speed), spec.arc — высота дуги. Вражеский бросок заранее рисует красный
 * круг там, куда упадёт: бьёт сам круг, а снаряд только летит.
 */
export function lobShot(G, from, x, y, tx, ty, spec, dmg, owner = 0) {
  // за стену не бросить: цель — внутри комнаты
  const room = G.room;
  tx = tx < T ? T : tx > room.w * T - T ? room.w * T - T : tx;
  ty = ty < T ? T : ty > room.h * T - T ? room.h * T - T : ty;
  const d = Math.hypot(tx - x, ty - y);
  let dur = spec.time ?? Math.min(1.1, Math.max(0.35, d / (spec.speed ?? 260)));
  const r = spec.radius ?? 40;
  let ghost = false;
  if (from === 1) {
    const z = addZone(G, {
      shape: 'circle', x: tx, y: ty, r, t: dur, dmg: dmg ?? spec.dmg ?? 1, owner, from: 1,
      linger: spec.linger ?? 0, slow: spec.slow ?? 0, root: spec.root ?? 0, look: spec.linger > 0 ? spec.zoneLook ?? 'red' : 'red',
    });
    if (z) {
      dur = z.total;
      ghost = true;
    }
  }
  const s = fireShot(G, from, x, y, Math.atan2(ty - y, tx - x), spec, dmg, owner);
  if (!s) return null;
  const L = s.lobBuf;
  L.sx = x;
  L.sy = y;
  L.tx = tx;
  L.ty = ty;
  L.t = 0;
  L.dur = dur;
  L.r = r;
  L.h = spec.arc ?? 44;
  s.lob = L;
  s.ghost = ghost;
  s.life = dur + 1;
  s.vx = (tx - x) / dur;
  s.vy = (ty - y) / dur;
  return s;
}

function removeShot(room, i) {
  const s = room.shots[i];
  swapRemove(room.shots, i);
  s.on = false;
  s.lob = null;
  s.tgt = null;
  SPOOL.push(s);
}

/** Убрать выстрелы: вражеские (from 1), свои (0) или все (−1). */
export function clearShots(room, from = -1) {
  for (let i = room.shots.length - 1; i >= 0; i--) {
    if (from < 0 || room.shots[i].from === from) removeShot(room, i);
  }
}

const wasHit = (s, uid) => s.last[0] === uid || s.last[1] === uid || s.last[2] === uid || s.last[3] === uid;
function remember(s, uid) {
  s.last[s.ln & 3] = uid;
  s.ln += 1;
}
// После отскока и на обратном пути бумеранга снаряд снова может задеть тех же.
function forget(s) {
  s.ln = 0;
  s.last[0] = 0;
  s.last[1] = 0;
  s.last[2] = 0;
  s.last[3] = 0;
}

function shotHit(G, s, m) {
  const sp = Math.hypot(s.vx, s.vy) || 1;
  const hit = hitOf(s.from === 2 ? 'pal' : 'shot');
  hit.crit = s.from === 0 && rnd(G) < G.player.st.crit;
  hit.ax = s.vx / sp;
  hit.ay = s.vy / sp;
  hit.kx = hit.ax * s.kb;
  hit.ky = hit.ay * s.kb;
  hit.burn = s.burn;
  hit.poison = s.poison;
  hit.slow = s.slow;
  hit.freeze = s.freeze;
  hit.stun = s.stun > 0 ? s.stun : s.root;
  hurtMob(G, m, s.dmg, hit);
}

// Взрыв снаряда с его действиями (и облако, если оно положено).
function burst(G, s, x, y, r) {
  explode(G, x, y, r, s.dmg, s.from, { burn: s.burn, poison: s.poison, slow: s.slow, freeze: s.freeze, stun: s.stun > 0 ? s.stun : s.root, kb: s.kb });
  if (s.linger > 0) {
    addZone(G, {
      shape: 'circle', x, y, r, t: 0.02, from: s.from === 1 ? 1 : 0, dmg: s.zoneDmg, linger: s.linger,
      burn: s.burn, poison: s.poison, slow: s.slow, look: s.zoneLook,
    });
  }
}

// Ближайший враг для самонаводящегося и для перескока молнии (кроме уже задетых).
function nearestFoe(G, s, x, y, range) {
  const mobs = G.room.mobs;
  let best = null;
  let bestD = range * range;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0 || m.kind === 0 || wasHit(s, m.uid)) continue;
    const d = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

function steer(G, s, dt) {
  let tx;
  let ty;
  if (s.from === 1) {
    tx = G.player.x;
    ty = G.player.y;
  } else {
    // цель ищется не каждый шаг: выстрелов много, а зверь далеко не убежит
    if (!s.tgt || s.tgt.dead || s.tgt.hide || (s.ln + ((s.t * 60) | 0)) % 8 === 0) s.tgt = nearestFoe(G, s, s.x, s.y, 260);
    if (!s.tgt) return;
    tx = s.tgt.x;
    ty = s.tgt.y;
  }
  const a = Math.atan2(s.vy, s.vx);
  const turn = s.homing * dt;
  const d = angDiff(a, Math.atan2(ty - s.y, tx - s.x));
  const na = a + (d > turn ? turn : d < -turn ? -turn : d);
  s.vx = Math.cos(na) * s.speed;
  s.vy = Math.sin(na) * s.speed;
  s.a = na;
}

function stepLob(G, s, dt) {
  const L = s.lob;
  L.t += dt;
  const k = L.t >= L.dur ? 1 : L.t / L.dur;
  s.x = L.sx + (L.tx - L.sx) * k;
  s.y = L.sy + (L.ty - L.sy) * k;
  s.z = 8 + 4 * L.h * k * (1 - k);
  if (k < 1) return false;
  if (s.ghost) {
    emit(G, { t: 'boom', x: L.tx, y: L.ty, r: L.r, look: s.look });
    sfx(G, 'boom', L.tx, L.ty);
  } else burst(G, s, L.tx, L.ty, L.r);
  return true;
}

function stepTrap(G, s, dt) {
  s.life -= dt;
  if (s.life <= 0) return true;
  if (s.t < 0.5) return false;                              // взводится
  const reach = s.r + MOB_R_MAX;
  const n = GRID.query(s.x - reach, s.y - reach, s.x + reach, s.y + reach, NEAR);
  const mobs = G.room.mobs;
  for (let j = 0; j < n; j++) {
    const m = mobs[NEAR[j]];
    if (!m || m.dead || m.hide || m.inv > 0 || m.kind === 0 || m.def.flying) continue;
    const rr = s.r + m.r;
    if ((m.x - s.x) * (m.x - s.x) + (m.y - s.y) * (m.y - s.y) > rr * rr) continue;
    sfx(G, 'trap', s.x, s.y);
    burst(G, s, s.x, s.y, Math.max(s.radius, s.r));
    return true;
  }
  return false;
}

function stepBullet(G, s, dt) {
  const room = G.room;
  const P = G.player;
  if (s.homing > 0) steer(G, s, dt);
  if (s.mode === 2) {
    // бумеранг возвращается к лисе
    const dx = P.x - s.x;
    const dy = P.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 14) return true;
    s.vx = (dx / d) * s.speed;
    s.vy = (dy / d) * s.speed;
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.spin) s.a += 16 * dt;

  // клетки
  const i = tileIndex(room, s.x, s.y);
  if (i < 0) return true;
  if (!s.through && s.mode !== 2) {
    // очень быстрый снаряд за шаг пролетает больше полклетки — стену на пути ищем лучом, а не по точке
    if ((room.flags[i] & F_SHOT) || (s.speed * dt > T / 2 && castRay(room, s.px, s.py, s.x, s.y, F_SHOT) < 1)) {
      if (s.mode === 1) {
        s.mode = 2;
        s.life = 5;
        forget(s);
        s.x = s.px;
        s.y = s.py;
        return false;
      }
      if (s.bounce > 0) {
        // от какой стороны клетки отскочить: пробуем сдвиг только по x и только по y
        const hx = tileIndex(room, s.x, s.py);
        const hy = tileIndex(room, s.px, s.y);
        const bx = hx < 0 || (room.flags[hx] & F_SHOT) !== 0;
        const by = hy < 0 || (room.flags[hy] & F_SHOT) !== 0;
        if (bx || !by) s.vx = -s.vx;
        if (by || !bx) s.vy = -s.vy;
        s.x = s.px;
        s.y = s.py;
        s.bounce -= 1;
        s.a = Math.atan2(s.vy, s.vx);
        forget(s);
        return false;
      }
      if (s.radius > 0) burst(G, s, s.px, s.py, s.radius);
      else emit(G, { t: 'boom', x: s.px, y: s.py, r: 6, look: 'fx.spark' });      // искра о стену, без звука
      return true;
    }
    if (s.from !== 1 && i !== s.tile) {
      s.tile = i;
      if (room.tiles[i] === TILE.BUSH && s.dmg > 0) hitTile(G, i, s.dmg);
    }
  }

  // цели
  if (s.from === 1) {
    if (s.dmg > 0 && P.inv <= 0 && P.down <= 0) {
      const rr = s.r + FOX_R - 2;
      if (segDist2(s.px, s.py, s.x, s.y, P.x, P.y) <= rr * rr) {
        if (s.radius > 0) burst(G, s, s.x, s.y, s.radius);
        else {
          hurtPlayer(G, s.dmg, s.px, s.py, 'shot');
          if (s.slow > 0) addEffect(G, 'slow', s.slow);
          if (s.root > 0) addEffect(G, 'root', s.root);
        }
        return true;
      }
    }
    const pals = room.pals;
    for (let j = 0; j < pals.length; j++) {
      const n = pals[j];
      if (n.dead || s.dmg <= 0) continue;
      const rr = s.r + n.r;
      if (segDist2(s.px, s.py, s.x, s.y, n.x, n.y) > rr * rr) continue;
      hurtPal(G, n, 1);
      return true;
    }
  } else if (!s.ghost) {
    const pad = s.r + MOB_R_MAX;
    const n = GRID.query(
      (s.px < s.x ? s.px : s.x) - pad, (s.py < s.y ? s.py : s.y) - pad,
      (s.px > s.x ? s.px : s.x) + pad, (s.py > s.y ? s.py : s.y) + pad, NEAR,
    );
    const mobs = room.mobs;
    for (let j = 0; j < n; j++) {
      const m = mobs[NEAR[j]];
      if (!m || m.dead || m.hide || m.inv > 0) continue;
      const rr = s.r + m.r;
      if (segDist2(s.px, s.py, s.x, s.y, m.x, m.y) > rr * rr || wasHit(s, m.uid)) continue;
      if (s.radius > 0) {
        burst(G, s, s.x, s.y, s.radius);
        return true;
      }
      shotHit(G, s, m);
      remember(s, m.uid);
      if (s.chain > 0) {
        // молния перескакивает на ближнего
        s.chain -= 1;
        const next = nearestFoe(G, s, m.x, m.y, s.chainR);
        if (!next) return true;
        const d = Math.hypot(next.x - m.x, next.y - m.y) || 1;
        s.x = m.x;
        s.y = m.y;
        s.vx = ((next.x - m.x) / d) * s.speed;
        s.vy = ((next.y - m.y) / d) * s.speed;
        s.a = Math.atan2(s.vy, s.vx);
        s.life = Math.max(s.life, d / s.speed + 0.05);
        return false;
      }
      if (s.mode === 1 || s.mode === 2) continue;           // бумеранг летит дальше
      if (s.pierce > 0) {
        s.pierce -= 1;
        continue;
      }
      return true;
    }
    const things = room.things;
    for (let j = 0; j < things.length; j++) {
      const th = things[j];
      if (!th.breakable || th.broken || s.dmg <= 0) continue;
      const rr = s.r + th.r;
      if (segDist2(s.px, s.py, s.x, s.y, th.x, th.y) > rr * rr) continue;
      breakThing(G, th, s.dmg);
      if (s.pierce > 0 || s.mode !== 0) continue;
      return true;
    }
  }

  s.life -= dt;
  if (s.life > 0) return false;
  if (s.mode === 1) {
    // долетел до своей дальности: назад, к лисе (не дольше пяти секунд — если лиса убегает)
    s.mode = 2;
    s.life = 5;
    forget(s);
    return false;
  }
  if (s.radius > 0 && s.from !== 1) burst(G, s, s.x, s.y, s.radius);
  return true;
}

/** Шаг всех выстрелов. */
export function stepShots(G, dt) {
  const room = G.room;
  const shots = room.shots;
  if (!shots.length) return;
  GRID.build(room.mobs, room.mobs.length, room.w * T, room.h * T);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (!s) continue;
    s.px = s.x;
    s.py = s.y;
    s.t += dt;
    const gone = s.lob ? stepLob(G, s, dt) : s.mode === TRAP ? stepTrap(G, s, dt) : stepBullet(G, s, dt);
    if (!gone) continue;
    // обработчики могли переставить список — ищем выстрел заново
    const at = shots[i] === s ? i : shots.indexOf(s);
    if (at >= 0) removeShot(room, at);
  }
}

// ---------- взрывы ----------

/**
 * Взрыв в точке: радиус r, урон dmg. from 0 или 2 — бьёт зверей (и ловит добычу), ломает кусты и ломкие предметы;
 * from 1 — бьёт лису. o: { burn, poison, slow, freeze, stun, kb, look, quiet } — действия, отбрасывание, вид
 * вспышки для рисунка и «без звука».
 */
export function explode(G, x, y, r, dmg, from = 0, o = null) {
  const room = G.room;
  emit(G, { t: 'boom', x, y, r, look: o?.look ?? 'fx.puff' });
  if (!o?.quiet) sfx(G, 'boom', x, y);
  if (r >= 40) shake(G, 0.25);
  if (from === 1) {
    const P = G.player;
    if (dmg > 0 && Math.hypot(P.x - x, P.y - y) <= r + 3) hurtPlayer(G, dmg, x, y, 'shot');
    const pals = room.pals;
    for (let i = 0; i < pals.length; i++) {
      if (!pals[i].dead && Math.hypot(pals[i].x - x, pals[i].y - y) <= r) hurtPal(G, pals[i], 1);
    }
    return;
  }
  const kind = from === 2 ? 'pal' : 'shot';
  const burn = o?.burn ?? 0;
  const poison = o?.poison ?? 0;
  const slow = o?.slow ?? 0;
  const freeze = o?.freeze ?? 0;
  const stun = o?.stun ?? 0;
  const kb = o?.kb ?? 0;
  const mobs = room.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d = Math.hypot(dx, dy);
    if (d > r + m.r) continue;
    const hit = hitOf(kind);
    hit.burn = burn;
    hit.poison = poison;
    hit.slow = slow;
    hit.freeze = freeze;
    hit.stun = stun;
    if (d > 0.01) {
      hit.ax = dx / d;
      hit.ay = dy / d;
      hit.kx = hit.ax * kb;
      hit.ky = hit.ay * kb;
    }
    hurtMob(G, m, dmg, hit);
  }
  if (dmg > 0) {
    const x0 = Math.max(1, Math.floor((x - r) / T));
    const x1 = Math.min(room.w - 2, Math.floor((x + r) / T));
    const y0 = Math.max(1, Math.floor((y - r) / T));
    const y1 = Math.min(room.h - 2, Math.floor((y + r) / T));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * room.w + tx;
        if (room.tiles[i] !== TILE.BUSH) continue;
        if (Math.hypot(tx * T + T / 2 - x, ty * T + T / 2 - y) <= r + 8) breakBush(G, i);
      }
    }
    const things = room.things;
    for (let i = 0; i < things.length; i++) {
      const th = things[i];
      if (th.breakable && !th.broken && Math.hypot(th.x - x, th.y - y) <= r + th.r) breakThing(G, th, dmg);
    }
  }
}

// ---------- зоны ----------

// Лиса в зоне в момент удара (или пока та остаётся вредной).
function foxInZone(G, z, strike) {
  const P = G.player;
  const f = P.st.flags;
  if (P.dash || P.down > 0) return;                        // в прыжке зоны не страшны
  const soft = z.look === 'poison' || z.look === 'fire' || z.look === 'web';
  if (soft && f.cloudImmune) return;
  const cx = z.sh === 1 ? (z.x + z.x2) / 2 : z.x;
  const cy = z.sh === 1 ? (z.y + z.y2) / 2 : z.y;
  if (z.slow > 0) addEffect(G, 'slow', strike ? z.slow : 0.35);
  if (strike && z.root > 0) addEffect(G, 'root', z.root);
  if (z.dmg > 0 && P.inv <= 0 && hurtPlayer(G, z.dmg, cx, cy, 'zone') && z.kb > 0 && !f.kbImmune) {
    const d = Math.hypot(P.x - cx, P.y - cy);
    if (d > 0.01) {
      P.vx = ((P.x - cx) / d) * z.kb;
      P.vy = ((P.y - cy) / d) * z.kb;
    }
  }
}

function mobsInZone(G, z, dmg) {
  const uid = z.uid;
  const mobs = G.room.mobs;
  const cx = z.sh === 1 ? (z.x + z.x2) / 2 : z.x;
  const cy = z.sh === 1 ? (z.y + z.y2) / 2 : z.y;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0 || m.kind === 0 || m.uid === z.owner) continue;
    if (!inZone(z, m.x, m.y, m.r * 0.6)) continue;
    const hit = hitOf('zone');
    hit.burn = z.burn;
    hit.poison = z.poison;
    hit.slow = z.slow;
    hit.freeze = z.freeze;
    hit.stun = z.stun > 0 ? z.stun : z.root;
    const d = Math.hypot(m.x - cx, m.y - cy);
    if (d > 0.01) {
      hit.ax = (m.x - cx) / d;
      hit.ay = (m.y - cy) / d;
      hit.kx = hit.ax * z.kb;
      hit.ky = hit.ay * z.kb;
    }
    hurtMob(G, m, dmg, hit);
    if (z.uid !== uid) return;
  }
}

// Сам удар зоны: по лисе и её спутникам (вражеская) или по зверям (лисья и та, что «топчет всех»).
function zoneHit(G, z) {
  const room = G.room;
  const P = G.player;
  if (z.from !== 1) {
    mobsInZone(G, z, z.dmg);
    return;
  }
  const uid = z.uid;
  if (inZone(z, P.x, P.y, 3)) foxInZone(G, z, true);
  if (z.uid !== uid) return;
  if (z.dmg > 0) {
    const pals = room.pals;
    for (let i = 0; i < pals.length; i++) if (!pals[i].dead && inZone(z, pals[i].x, pals[i].y, 2)) hurtPal(G, pals[i], 1);
  }
  if (z.hitsMobs) mobsInZone(G, z, z.mobDmg >= 0 ? z.mobDmg : MOB.zoneDmg);
}

// Зона осталась вредной: лису задевает, пока та внутри, зверей — раз в полсекунды.
function lingerZone(G, z, dt) {
  const P = G.player;
  const uid = z.uid;
  z.left -= dt;
  if (z.from === 1 && inZone(z, P.x, P.y, 3)) foxInZone(G, z, false);
  if (z.uid !== uid) return;
  z.tick -= dt;
  if (z.tick > 0) return;
  z.tick += STATUS.tick;
  if (z.from !== 1) mobsInZone(G, z, z.dmg);
  else if (z.hitsMobs) mobsInZone(G, z, z.mobDmg >= 0 ? z.mobDmg : MOB.zoneDmg);
}

// Предупреждение кончилось. true — зону пора убрать.
function strike(G, z) {
  const uid = z.uid;
  const room = G.room;
  emit(G, { t: 'strike', zone: z });
  if (z.on) z.on(G, z);
  if (z.uid !== uid) return false;                          // обработчик сам убрал зону
  if (z.run) {
    z.phase = 1;
    z.rt = 0;
    z.rx = z.x;
    z.ry = z.y;
    if (z.actor) {
      const sp = z.run.speed ?? 480;
      const len = z.run.len ?? Math.hypot(z.x2 - z.x, z.y2 - z.y);
      addActor(room, z.actor, z.x, z.y, Math.cos(z.a) * sp, Math.sin(z.a) * sp, len / sp, 'charge');
    }
    return false;
  }
  if (z.actor) addActor(room, z.actor, z.x, z.y, 0, 0, 0.45, 'attack');
  if (z.from === 1 && (z.dmg >= 2 || z.r >= 50)) shake(G, 0.3);
  zoneHit(G, z);
  if (z.uid !== uid) return false;
  if (z.linger > 0) {
    z.phase = 1;
    z.left = z.linger;
    z.tick = STATUS.tick;
    return false;
  }
  return true;
}

// По полосе бежит «тело» (лось): бьёт тех, кого задело на этом шаге. true — добежало.
function runLane(G, z, dt) {
  const room = G.room;
  const P = G.player;
  const uid = z.uid;
  const sp = z.run.speed ?? 480;
  const len = z.run.len ?? Math.hypot(z.x2 - z.x, z.y2 - z.y);
  const ox = z.rx;
  const oy = z.ry;
  z.rt += dt;
  const d = Math.min(len, z.rt * sp);
  z.rx = z.x + Math.cos(z.a) * d;
  z.ry = z.y + Math.sin(z.a) * d;
  const half = z.w / 2;
  if (z.from === 1) {
    if (!z.hitFox && z.dmg > 0 && !P.dash && P.down <= 0 && P.inv <= 0 && segDist2(ox, oy, z.rx, z.ry, P.x, P.y) <= (half + 3) * (half + 3)) {
      z.hitFox = hurtPlayer(G, z.dmg, z.rx, z.ry, 'zone');
      if (z.uid !== uid) return false;
    }
    const pals = room.pals;
    for (let i = 0; i < pals.length; i++) {
      const n = pals[i];
      if (!n.dead && n.zoneHit !== uid && segDist2(ox, oy, z.rx, z.ry, n.x, n.y) <= half * half) {
        n.zoneHit = uid;
        hurtPal(G, n, 1);
      }
    }
  }
  if (z.from !== 1 || z.hitsMobs) {
    const dmg = z.from !== 1 ? z.dmg : z.mobDmg >= 0 ? z.mobDmg : MOB.zoneDmg;
    const mobs = room.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || m.hide || m.inv > 0 || m.kind === 0 || m.zoneHit === uid || m.uid === z.owner) continue;
      const rr = half + m.r * 0.6;
      if (segDist2(ox, oy, z.rx, z.ry, m.x, m.y) > rr * rr) continue;
      m.zoneHit = uid;
      const hit = hitOf('zone');
      hit.ax = Math.cos(z.a);
      hit.ay = Math.sin(z.a);
      hit.kx = -hit.ay * 160;                 // топчущий отбрасывает вбок от своего пути
      hit.ky = hit.ax * 160;
      hurtMob(G, m, dmg, hit);
      if (z.uid !== uid) return false;
    }
  }
  return d >= len;
}

/** Шаг красных зон: предупреждают, бьют, бегут по полосе, остаются вредными и пропадают. */
export function stepZones(G, dt) {
  const room = G.room;
  const zones = room.zones;
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (!z) continue;
    const uid = z.uid;
    let gone = false;
    if (z.wait > 0) {
      z.wait -= dt;
      if (z.wait <= 0) {
        z.wait = 0;
        announce(G, z);
      }
      continue;
    }
    if (z.phase === 0) {
      z.t += dt;
      if (z.t < z.total) continue;
      z.t = z.total;
      gone = strike(G, z);
    } else if (z.run) gone = runLane(G, z, dt);
    else {
      lingerZone(G, z, dt);
      gone = z.left <= 0;
    }
    if (!gone || z.uid !== uid) continue;
    const at = zones[i] === z ? i : zones.indexOf(z);
    if (at >= 0) removeZone(room, at);
  }
}
