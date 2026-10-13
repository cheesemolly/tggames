// Звери «Лисьей охоты»: появление, шаг (действия на них → «мысль» → движение → касание лисы), поведение добычи,
// спутники лисы и набор готовых действий для описаний зверей. Без DOM.
//
// ── КАК ПИСАТЬ ЗВЕРЯ (mobs.js, mobs2.js, bosses.js, minions.js) ──────────────────────────────────────────────
// У зверя есть think(m, G, dt, ai): раз в шаг она решает, куда идти и что делать. Сама ничего не двигает —
// задаёт желаемую скорость (m.wx, m.wy) через ai.chase / ai.flee / …, а движок разгоняет, ведёт вокруг
// преград, расталкивает зверей и поворачивает лицом. Думать удобно автоматом состояний:
//
//   think(m, G, dt, ai) {
//     if (m.state === '') ai.go(m, 'walk');                 // первое состояние
//     if (m.state === 'walk') {
//       ai.chase(m, G, 60);                                 // идти к лисе в обход преград
//       if (ai.near(m, G, 120) && m.cd <= 0) ai.go(m, 'windup');
//     } else if (m.state === 'windup') {                    // замах: игрок должен его ясно видеть
//       ai.stop(m);
//       ai.pose(m, 'windup', m.t / 0.6);
//       if (m.t === 0) ai.cone(m, G, ai.angle(m, G), 70, 1.2, 0.6);   // красный сектор на 0,6 с, потом бьёт
//       if (m.t >= ai.tele(G, 0.6)) { m.cd = 2; ai.go(m, 'walk'); }
//     }
//   }
//
// Что движок ведёт сам: m.t — секунды в текущем состоянии (ai.go обнуляет; в первый шаг состояния m.t === 0),
// m.cd — убывающий счётчик «когда снова можно», m.bump — упёрся ли в преграду на прошлом шаге,
// m.data — свои числа зверя (чистый объект), m.hide = true — зверь спрятался: его не задеть и не выбрать целью.
// Поза: m.act и m.k (0…1). Не задала think позу — движок поставит 'move' или 'idle' (а сразу после удара —
// 'hurt'). Общие позы: 'spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stun', 'hurt'; свои перечисляйте
// в описании зверя.
// Пока зверь «проявляется» из метки (0,7 с), оглушён, заморожен или летит в прыжке ai.leap — think не зовётся.
//
// ── ЧТО УМЕЕТ ai ─────────────────────────────────────────────────────────────────────────────────────────────
// Цель — лиса (или спутник-приманка, если он ближе): все «к цели» ниже — про неё.
//   состояние  ai.go(m, state)            перейти в состояние, m.t = 0
//              ai.pose(m, act, k)         поза и её ход 0…1
//              ai.hp(m)                   доля здоровья 0…1
//   что видит  ai.dist(m, G)  ai.angle(m, G)  ai.near(m, G, r)   расстояние, угол и «ближе r» до цели
//              ai.los(m, G)               видна ли цель (для выстрела)
//              ai.lead(m, G, t)           где цель будет через t секунд → { x, y } (общий объект: прочитать сразу)
//              ai.foxAir(G)  ai.foxDown(G)   лиса в прыжке / лежит
//              ai.count(G, id)            сколько таких зверей живо
//   движение   ai.stop(m)                 стоять
//              ai.move(m, ang, speed)     идти под углом
//              ai.face(m, G)              повернуться лицом к цели
//              ai.chase(m, G, speed)      к цели в обход преград (летающие — напрямик); возвращает расстояние
//              ai.flee(m, G, speed)       от цели, не забиваясь в углы; возвращает, насколько свободен путь 0…1
//              ai.wander(m, G, speed)     бродить; false — стоит
//              ai.keepRange(m, G, min, max, speed)   держаться на расстоянии, обходя по кругу
//              ai.orbit(m, G, radius, speed)         кружить вокруг цели
//              ai.goTo(m, G, x, y, speed) к точке в обход преград; true — пришёл
//              ai.charge(m, ang, speed)   рвануть по прямой сразу на полной скорости; ai.bumped(m) — врезался
//              ai.leap(m, G, x, y, dur, height, act)   прыжок по дуге в точку (вода и пни не мешают, стены — да)
//              ai.leaping(m)
//   угрозы     ai.lane(m, G, ang, len, width, t, o)     красная полоса от зверя
//              ai.circle(m, G, x, y, r, t, o)           красный круг в точке
//              ai.cone(m, G, ang, r, arc, t, o)         красный сектор от зверя
//              ai.ring(m, G, x, y, r, width, t, o)      красное кольцо
//                t — сколько секунд предупреждает, потом бьёт сама (урон 1, у вожака и хозяина 2). o — поля зоны
//                из world.addZone: { dmg, hitsMobs, linger, slow, root, kb, run, delay, on(G, zone), look, actor }.
//                Зверь погиб до удара — зона отменяется. dmg: 0 — только показать (бить будет сам зверь).
//              ai.tele(G, t)                            сколько на самом деле продлится предупреждение в t секунд:
//                у лисы бывает вещь «красные зоны видны раньше» — замах зверя должен ждать столько же
//   выстрелы   ai.shoot(m, G, ang, spec)                один снаряд; spec — как shot у оружия (combat.fireShot)
//              ai.fan(m, G, ang, n, arc, spec)          веер из n
//              ai.ringShots(m, G, n, spec, phase)       кольцо из n во все стороны
//              ai.lob(m, G, x, y, spec)                 бросок навесом: красный круг там, куда упадёт
//   удар       ai.strike(m, G, reach, dmg)              ударить лису прямо сейчас, если она ближе reach
//   подмога    ai.spawn(G, id, x, y, o)                 зверь в точке; o: { elite, warm, noLoot, noScore }
//              ai.summon(m, G, id, n, radius)           n зверей вокруг себя; возвращает, сколько появилось
//   случай     ai.rnd(G)  ai.rand(G, a, b)  ai.randInt(G, a, b)  ai.chance(G, p)   — только так: вся случайность —
//                от зерна партии, иначе сохранённая партия пойдёт по-другому
//   звук       ai.sfx(G, 'growl', x, y)                 имя — из sounds.js
//   спутникам  ai.foe(n, G, range)        ближайший враг (или null)
//              ai.follow(n, G, speed)     держаться возле лисы
//              ai.hit(n, G, mob, dmg, kb) ударить врага
//              ai.palShoot(n, G, ang, spec)
//              ai.angleTo(a, b)  ai.distTo(a, b)   между любыми двумя с полями x, y

import {
  H, T, TILE, F_WALK, F_MOB, FOX_R, CAPS, REG, TAU, rnd, rand, randInt, chance, clamp, segDist2, emit, sfx, toast, swapRemove,
} from './core.js';
import { MOB, STATUS, DASH, POSE, PREY, mobHp } from './balance.js';
import {
  tileAt, tileIndex, circleHits, moveCircle, castRay, hasLos, solveDash, updateFlow, fieldTo, fieldDir, DIR, freeSpot,
  nearestOf, addZone, dangerAt, escapeDir, standable, unstick, pushFromThings,
} from './world.js';
import { hurtPlayer } from './player.js';
import { hurtMob, hitOf, catchPrey, fireShot, lobShot } from './combat.js';

// ---------- тело ----------

// Общие поля зверя и спутника: всё, чем пользуются шаг, движение и готовые действия.
function body(uid, id, def, x, y, r, hp) {
  return {
    uid, id, def, kind: 1, x, y, px: x, py: y, vx: 0, vy: 0, wx: 0, wy: 0, z: def.flying ? def.z ?? 18 : 0, r, hp, maxHp: hp,
    face: 1, state: '', t: 0, cd: 0, elite: false, inv: 0, warm: 0,
    burn: 0, poison: 0, pstacks: 0, slow: 0, freeze: 0, stun: 0, tickB: 0, tickP: 0,
    kbx: 0, kby: 0, act: 'idle', k: 0, data: {}, hitBy: 0, zoneHit: 0, flash: 0, dead: false, hide: false,
    bump: 0, sx: 0, sy: 0, touchT: 0, tx: x, ty: y, target: null, fresh: false,
    leapT: 0, leapD: 1, lx0: 0, ly0: 0, lx1: 0, ly1: 0, leapH: 0, leapAct: 'leap',
    wanT: 0, wanX: x, wanY: y, fleeT: 0, fa: 0, open: 1, bolt: 0, strafe: 1, strafeT: 0,
    life: 0, run: 0, hopCd: 0, tame: false, noLoot: false, noScore: false,
  };
}

/**
 * Зверь в точке (x, y). o: elite — вожак; warm — сколько секунд «проявляется» (по умолчанию 0,7 для врагов и 0
 * для добычи); tame — ручная добыча (подпускает близко и не убегает в нору); noLoot, noScore — без добычи и очков.
 * Возвращает зверя или null (нет такого id или зверей уже слишком много).
 */
export function spawnMob(G, id, x, y, o = null) {
  const room = G.room;
  const def = REG.MOBS[id];
  if (!def || room.mobs.length >= CAPS.mobs) return null;
  const kind = def.kind === 'prey' ? 0 : def.kind === 'boss' ? 2 : 1;
  const elite = kind === 1 && Boolean(o?.elite);
  const hp = kind === 0 ? def.hp ?? 1 : mobHp(def.hp ?? 1, G.floor, elite);
  const m = body(++room.uid, id, def, x, y, (def.r ?? 10) * (elite ? MOB.eliteSize : 1), hp);
  // точка пришлась на дерево или воду — зверь встаёт на ближайшее свободное место
  if (!def.flying) unstick(room, m, Math.min(m.r, 12), F_WALK | F_MOB);
  m.px = m.x;
  m.py = m.y;
  m.kind = kind;
  m.elite = elite;
  m.warm = o?.warm ?? (kind === 0 ? 0 : MOB.warm);
  m.inv = m.warm;
  m.tame = Boolean(o?.tame);
  m.noLoot = Boolean(o?.noLoot);
  m.noScore = Boolean(o?.noScore);
  m.strafe = rnd(G) < 0.5 ? 1 : -1;
  if (kind === 0) {
    m.life = m.tame ? 1e9 : (def.life ?? 16) * G.player.st.preyStay;
    m.state = 'graze';
    m.act = 'graze';
    m.wanT = rnd(G) * 0.6;
  } else if (m.warm > 0) m.act = 'spawn';
  if (def.init) def.init(m, G);
  room.mobs.push(m);
  if (kind === 2) room.boss = m;
  if (m.warm > 0) emit(G, { t: 'spawn', x: m.x, y: m.y, id });
  return m;
}

// ---------- готовые действия ----------

const OUT = { x: 0, y: 0 };
const dmgOf = (m) => (m.elite || m.kind === 2 ? MOB.eliteDmg : 1);

function go(m, state) {
  m.state = state;
  m.t = 0;
  m.fresh = true;                           // в следующий раз «мысль» увидит m.t === 0: первый шаг состояния
}
function pose(m, act, k = 0) {
  m.act = act;
  m.k = k < 0 ? 0 : k > 1 ? 1 : k;
}
const dist = (m) => Math.hypot(m.tx - m.x, m.ty - m.y);
const angle = (m) => Math.atan2(m.ty - m.y, m.tx - m.x);
const near = (m, G, r) => (m.tx - m.x) * (m.tx - m.x) + (m.ty - m.y) * (m.ty - m.y) < r * r;

function stop(m) {
  m.wx = 0;
  m.wy = 0;
}
function move(m, ang, speed) {
  m.wx = Math.cos(ang) * speed;
  m.wy = Math.sin(ang) * speed;
}
function face(m) {
  if (Math.abs(m.tx - m.x) > 2) m.face = m.tx > m.x ? 1 : -1;
}

function chase(m, G, speed) {
  const room = G.room;
  const dx = m.tx - m.x;
  const dy = m.ty - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    stop(m);
    return d;
  }
  // рядом, в воздухе или к приманке — напрямик; иначе по полю путей до лисы
  if (m.def.flying || m.target || d < T * 1.5 || !fieldDir(room, room.flow, m.x, m.y)) {
    m.wx = (dx / d) * speed;
    m.wy = (dy / d) * speed;
  } else {
    m.wx = DIR.x * speed;
    m.wy = DIR.y * speed;
  }
  return d;
}

// От цели — но не в стену: из двенадцати направлений выбирается то, что уводит дальше и где свободнее.
// Только что зажатый в угол (m.bolt) рвётся туда, где просторнее, — хоть мимо самой лисы.
function flee(m, G, speed) {
  const room = G.room;
  m.fleeT -= H;
  if (m.bolt > 0) m.bolt -= H;
  const away = m.bolt > 0 ? 0.2 : 1;
  const wide = m.bolt > 0 ? 2.2 : 1.3;
  if (m.fleeT <= 0) {
    m.fleeT = 0.1;
    let ax = m.x - m.tx;
    let ay = m.y - m.ty;
    const l = Math.hypot(ax, ay) || 1;
    ax /= l;
    ay /= l;
    const base = Math.atan2(ay, ax);
    const air = Boolean(m.def.flying);
    let best = -Infinity;
    let ba = base;
    let bo = 1;
    for (let k = 0; k < 12; k++) {
      const a = base + (k * TAU) / 12;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const open = air ? 1 : castRay(room, m.x, m.y, m.x + c * 72, m.y + s * 72, F_WALK | F_MOB);
      const score = (c * ax + s * ay) * away + open * wide + 0.25 * Math.cos(a - m.fa);
      if (score > best) {
        best = score;
        ba = a;
        bo = open;
      }
    }
    m.fa = ba;
    m.open = bo;
  }
  m.wx = Math.cos(m.fa) * speed;
  m.wy = Math.sin(m.fa) * speed;
  return m.open;
}

function wander(m, G, speed) {
  const room = G.room;
  m.wanT -= H;
  if (m.wanT <= 0) {
    m.wanT = rand(G, 1.4, 3.6);
    m.wanX = m.x;
    m.wanY = m.y;
    // несколько мест рядом; добыча предпочитает высокую траву
    const grass = m.kind === 0 && room.special === 'grass';
    for (let k = 0; k < 4; k++) {
      const a = rnd(G) * TAU;
      const d = rand(G, 30, 90);
      const x = m.x + Math.cos(a) * d;
      const y = m.y + Math.sin(a) * d;
      const i = tileIndex(room, x, y);
      if (i < 0 || (room.flags[i] & (F_WALK | F_MOB))) continue;
      if (!m.def.flying && castRay(room, m.x, m.y, x, y, F_WALK | F_MOB) < 1) continue;
      m.wanX = x;
      m.wanY = y;
      if (!grass || room.tiles[i] === TILE.SPECIAL) break;
    }
  }
  const dx = m.wanX - m.x;
  const dy = m.wanY - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 5) {
    stop(m);
    return false;
  }
  m.wx = (dx / d) * speed;
  m.wy = (dy / d) * speed;
  return true;
}

function keepRange(m, G, min, max, speed) {
  const d = dist(m);
  if (d > max) {
    chase(m, G, speed);
    return d;
  }
  const ax = (m.tx - m.x) / (d || 1);
  const ay = (m.ty - m.y) / (d || 1);
  m.strafeT -= H;
  if (m.strafeT <= 0 || (m.bump && m.strafeT < 1)) {
    m.strafeT = 1.4 + rnd(G) * 1.6;
    m.strafe = -m.strafe;
  }
  if (d < min) {
    m.wx = (-ax - ay * m.strafe * 0.5) * speed;
    m.wy = (-ay + ax * m.strafe * 0.5) * speed;
  } else {
    m.wx = -ay * m.strafe * speed * 0.7;
    m.wy = ax * m.strafe * speed * 0.7;
  }
  return d;
}

function orbit(m, G, radius, speed) {
  const d = dist(m) || 1;
  const ax = (m.tx - m.x) / d;
  const ay = (m.ty - m.y) / d;
  const err = clamp((d - radius) / Math.max(1, radius), -1, 1);
  if (m.bump) {
    m.strafeT -= H;
    if (m.strafeT <= 0) {
      m.strafeT = 0.8;
      m.strafe = -m.strafe;
    }
  }
  m.wx = (-ay * m.strafe + ax * err * 1.4) * speed;
  m.wy = (ax * m.strafe + ay * err * 1.4) * speed;
  return d;
}

function goTo(m, G, x, y, speed) {
  const room = G.room;
  const dx = x - m.x;
  const dy = y - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) {
    stop(m);
    return true;
  }
  let ux = dx / d;
  let uy = dy / d;
  if (!m.def.flying && d > T * 1.2) {
    const f = fieldTo(room, x, y);
    if (f && fieldDir(room, f, m.x, m.y)) {
      ux = DIR.x;
      uy = DIR.y;
    }
  }
  m.wx = ux * speed;
  m.wy = uy * speed;
  return false;
}

function charge(m, ang, speed) {
  m.wx = Math.cos(ang) * speed;
  m.wy = Math.sin(ang) * speed;
  m.vx = m.wx;
  m.vy = m.wy;
}

function leap(m, G, x, y, dur = 0.3, height = 16, act = 'leap') {
  const room = G.room;
  let ex = x;
  let ey = y;
  if (m.def.flying) {
    ex = clamp(x, T + m.r, room.w * T - T - m.r);
    ey = clamp(y, T + m.r, room.h * T - T - m.r);
  } else {
    const dx = x - m.x;
    const dy = y - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    const r = Math.min(m.r, 12);
    const out = solveDash(room, m.x, m.y, dx / d, dy / d, d, r);
    if (!out.ok || out.len < 4 || circleHits(room, out.x, out.y, r, F_WALK | F_MOB)) return false;
    ex = out.x;
    ey = out.y;
  }
  m.lx0 = m.x;
  m.ly0 = m.y;
  m.lx1 = ex;
  m.ly1 = ey;
  m.leapD = Math.max(0.05, dur);
  m.leapT = m.leapD;
  m.leapH = height;
  m.leapAct = act;
  return true;
}

function lead(m, G, t) {
  const P = G.player;
  const room = G.room;
  if (m.target) {
    OUT.x = m.tx;
    OUT.y = m.ty;
    return OUT;
  }
  if (P.dash) {
    OUT.x = P.dash.ex;
    OUT.y = P.dash.ey;
  } else {
    OUT.x = P.x + clamp(P.vx, -200, 200) * t;
    OUT.y = P.y + clamp(P.vy, -200, 200) * t;
  }
  OUT.x = clamp(OUT.x, T + 4, room.w * T - T - 4);
  OUT.y = clamp(OUT.y, T + 4, room.h * T - T - 4);
  return OUT;
}

function count(G, id) {
  const mobs = G.room.mobs;
  let n = 0;
  for (let i = 0; i < mobs.length; i++) if (!mobs[i].dead && mobs[i].id === id) n += 1;
  return n;
}

function lane(m, G, ang, len, width, t, o) {
  return addZone(G, Object.assign({
    shape: 'lane', x: m.x, y: m.y, x2: m.x + Math.cos(ang) * len, y2: m.y + Math.sin(ang) * len, w: width, t, dmg: dmgOf(m), owner: m.uid, from: 1,
  }, o));
}
function circle(m, G, x, y, r, t, o) {
  return addZone(G, Object.assign({ shape: 'circle', x, y, r, t, dmg: dmgOf(m), owner: m.uid, from: 1 }, o));
}
function cone(m, G, ang, r, arc, t, o) {
  return addZone(G, Object.assign({ shape: 'cone', x: m.x, y: m.y, a: ang, arc, r, t, dmg: dmgOf(m), owner: m.uid, from: 1 }, o));
}
function ring(m, G, x, y, r, width, t, o) {
  return addZone(G, Object.assign({ shape: 'ring', x, y, r, w: width, t, dmg: dmgOf(m), owner: m.uid, from: 1 }, o));
}

// урон вражеского снаряда: у вожака не меньше двух; явный ноль — снаряд без урона (паутина, пыль)
const shotDmg = (m, spec) => (spec.dmg === 0 ? 0 : Math.max(spec.dmg ?? 1, m.elite ? MOB.eliteDmg : 1));

function volley(G, m, spec, ang) {
  emit(G, { t: 'shot', look: spec.look ?? 'shot.orb', x: m.x, y: m.y, a: ang, from: 1 });
  sfx(G, 'spit', m.x, m.y);
}
function shoot(m, G, ang, spec) {
  const s = fireShot(G, 1, m.x, m.y, ang, spec, shotDmg(m, spec), m.uid);
  if (s) volley(G, m, spec, ang);
  return s;
}
function fan(m, G, ang, n, arc, spec) {
  let made = 0;
  for (let i = 0; i < n; i++) {
    const a = n > 1 ? ang + (i / (n - 1) - 0.5) * arc : ang;
    if (fireShot(G, 1, m.x, m.y, a, spec, shotDmg(m, spec), m.uid)) made += 1;
  }
  if (made) volley(G, m, spec, ang);
  return made;
}
function ringShots(m, G, n, spec, phase = 0) {
  let made = 0;
  for (let i = 0; i < n; i++) if (fireShot(G, 1, m.x, m.y, phase + (i / n) * TAU, spec, shotDmg(m, spec), m.uid)) made += 1;
  if (made) volley(G, m, spec, phase);
  return made;
}
function lob(m, G, x, y, spec) {
  const s = lobShot(G, 1, m.x, m.y, x, y, spec, shotDmg(m, spec), m.uid);
  if (s) volley(G, m, spec, Math.atan2(y - m.y, x - m.x));
  return s;
}

function strike(m, G, reach, dmg) {
  const P = G.player;
  if (Math.hypot(P.x - m.x, P.y - m.y) > reach + FOX_R) return false;
  return hurtPlayer(G, dmg ?? dmgOf(m), m.x, m.y, 'touch');
}

function summon(m, G, id, n, radius = 60) {
  const room = G.room;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const a = rnd(G) * TAU;
    let x = m.x + Math.cos(a) * radius;
    let y = m.y + Math.sin(a) * radius;
    if (!standable(room, x, y, 10) || circleHits(room, x, y, 10, F_MOB)) {
      const p = freeSpot(G, 0, 1e9);
      if (!p) continue;
      x = p.x;
      y = p.y;
    }
    if (spawnMob(G, id, x, y, { warm: 0.5 })) made += 1;
  }
  return made;
}

// спутникам
function foe(n, G, range) {
  const mobs = G.room.mobs;
  let best = null;
  let bestD = range * range;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0 || m.kind === 0) continue;
    const d = (m.x - n.x) * (m.x - n.x) + (m.y - n.y) * (m.y - n.y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
function follow(n, G, speed) {
  const P = G.player;
  const d = Math.hypot(P.x - n.x, P.y - n.y);
  if (d < 40 + n.slot * 14) {
    stop(n);
    return d;
  }
  const room = G.room;
  if (n.def.flying || d < T * 1.5 || !fieldDir(room, room.flow, n.x, n.y)) {
    n.wx = ((P.x - n.x) / d) * speed;
    n.wy = ((P.y - n.y) / d) * speed;
  } else {
    n.wx = DIR.x * speed;
    n.wy = DIR.y * speed;
  }
  return d;
}
function hit(n, G, m, dmg, kb = 0) {
  const h = hitOf('pal');
  const d = Math.hypot(m.x - n.x, m.y - n.y) || 1;
  h.ax = (m.x - n.x) / d;
  h.ay = (m.y - n.y) / d;
  h.kx = h.ax * kb;
  h.ky = h.ay * kb;
  return hurtMob(G, m, dmg, h);
}
function palShoot(n, G, ang, spec) {
  const s = fireShot(G, 2, n.x, n.y, ang, spec, spec.dmg ?? 1, n.uid);
  if (s) emit(G, { t: 'shot', look: spec.look ?? 'shot.orb', x: n.x, y: n.y, a: ang, from: 2 });
  return s;
}

/** Готовые действия для think зверей и спутников — приходят четвёртым аргументом. Что есть что — в начале файла. */
export const ACTS = Object.freeze({
  go, pose, hp: (m) => (m.maxHp > 0 ? clamp(m.hp / m.maxHp, 0, 1) : 0),
  dist, angle, near, los: (m, G) => hasLos(G.room, m.x, m.y, m.tx, m.ty), lead,
  foxAir: (G) => Boolean(G.player.dash), foxDown: (G) => G.player.down > 0 || G.over, count,
  stop, move, face, chase, flee, wander, keepRange, orbit, goTo, charge, bumped: (m) => m.bump !== 0, leap, leaping: (m) => m.leapT > 0,
  tele: (G, t) => t + G.player.st.warn,
  lane, circle, cone, ring, shoot, fan, ringShots, lob, strike,
  spawn: spawnMob, summon,
  rnd, rand, randInt, chance, sfx,
  foe, follow, hit, palShoot,
  angleTo: (a, b) => Math.atan2(b.y - a.y, b.x - a.x), distTo: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
});

// ---------- добыча ----------

function runFromZone(m, z, speed) {
  escapeDir(z, m.x, m.y);
  m.wx = DIR.x * speed;
  m.wy = DIR.y * speed;
}

/**
 * Поведение добычи — одно на всех, различия заданы числами описания (mobs.js): пасётся → заметила лису,
 * замерла на четверть секунды → убегает → устала и еле идёт → снова бежит. Вышло время — уходит в ближайшую
 * нору. Из красной зоны уходит всегда. Загнанная в угол на миг замирает.
 */
function thinkPrey(G, m, dt) {
  const def = m.def;
  const room = G.room;
  const P = G.player;
  const d = Math.hypot(P.x - m.x, P.y - m.y);
  const aware = (def.aware ?? 90) * P.st.aware * (m.tame ? 0.45 : 1);
  const foxNear = P.down <= 0 && d < aware;
  if (m.hopCd > 0) m.hopCd -= dt;
  if (m.state !== 'escape' && m.state !== 'dive') {
    m.life -= dt;
    if (m.life <= 0) go(m, 'escape');
  }
  const danger = m.state === 'dive' ? null : dangerAt(room, m.x, m.y, m.r);
  const speed = def.speed ?? 150;
  switch (m.state) {
    case 'graze':
      m.act = 'graze';
      if (danger) {
        runFromZone(m, danger, speed);
        m.act = 'flee';
      } else if (foxNear) {
        go(m, 'alert');
        stop(m);
      } else wander(m, G, def.walk ?? 26);
      break;
    case 'alert':
      m.act = 'alert';
      stop(m);
      face(m);
      if (m.t >= PREY.alert) go(m, 'flee');
      break;
    case 'flee':
      m.act = 'flee';
      if (danger) runFromZone(m, danger, speed);
      else if (flee(m, G, speed) < 0.22 && foxNear && m.bolt <= 0) {
        // загнали в угол: на миг замирает, потом рванёт на простор
        go(m, 'freeze');
        stop(m);
        break;
      }
      m.run += dt;
      if (m.run >= (def.tire ?? 4)) {
        m.run = 0;
        go(m, 'tired');
      } else if (m.t > 1 && d > aware * PREY.calm) {
        m.run = 0;
        go(m, 'graze');
      }
      break;
    case 'tired':
      m.act = 'tired';
      if (danger) runFromZone(m, danger, speed * 0.7);
      else if (foxNear) flee(m, G, speed * (def.tiredSpeed ?? 0.4));
      else stop(m);
      if (m.t >= (def.rest ?? 1.6)) go(m, foxNear ? 'flee' : 'graze');
      break;
    case 'freeze':
      m.act = 'freeze';
      stop(m);
      if (m.t >= PREY.freeze) {
        m.bolt = PREY.bolt;
        m.fleeT = 0;
        go(m, 'flee');
      }
      break;
    case 'hop':
      go(m, 'flee');
      m.act = 'flee';
      break;
    case 'escape': {
      m.act = 'flee';
      const b = nearestOf(room.burrows, m.x, m.y);
      if (danger) runFromZone(m, danger, speed);
      else if (!b || goTo(m, G, b.x, b.y, speed) || m.t > 12) go(m, 'dive');
      break;
    }
    default:
      // ныряет в нору
      stop(m);
      m.act = 'dive';
      m.k = Math.min(1, m.t / PREY.dive);
      if (m.t >= PREY.dive) {
        m.dead = true;
        emit(G, { t: 'escape', x: m.x, y: m.y, id: m.id });
        sfx(G, 'escape', m.x, m.y);
      }
  }
}

/**
 * Лиса начала рывок (D — его запись): добыча, умеющая отпрыгивать (hop в описании), уходит вбок с его пути —
 * если рывок начат издалека и отпрыгивать есть куда.
 */
export function preyDashAlert(G, D) {
  const room = G.room;
  const mobs = room.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    const hop = m.def.hop;
    if (m.dead || m.kind !== 0 || !hop || m.hopCd > 0 || m.leapT > 0 || m.state === 'dive' || m.freeze > 0 || m.stun > 0) continue;
    if (Math.hypot(m.x - D.sx, m.y - D.sy) < (hop.far ?? DASH.sweep * 5)) continue;        // вблизи не успевает
    const reach = DASH.sweep + m.r + 6;
    if (segDist2(D.sx, D.sy, D.ex, D.ey, m.x, m.y) > reach * reach) continue;
    const side = (m.x - D.sx) * -D.uy + (m.y - D.sy) * D.ux >= 0 ? 1 : -1;
    const len = hop.dist ?? 46;
    if (!leap(m, G, m.x - D.uy * len * side, m.y + D.ux * len * side, 0.16, 12, 'hop')
      && !leap(m, G, m.x + D.uy * len * side, m.y - D.ux * len * side, 0.16, 12, 'hop')) continue;
    m.hopCd = hop.cd ?? 3;
    go(m, 'hop');
  }
}

// ---------- шаг зверей ----------

function statuses(G, m, dt) {
  if (m.burn > 0) {
    m.burn -= dt;
    m.tickB -= dt;
    if (m.tickB <= 0) {
      m.tickB += STATUS.tick;
      hurtMob(G, m, STATUS.burnDps * STATUS.tick, hitOf('burn'));
    }
  }
  if (m.poison > 0 && !m.dead) {
    m.poison -= dt;
    m.tickP -= dt;
    if (m.tickP <= 0) {
      m.tickP += STATUS.tick;
      hurtMob(G, m, STATUS.poisonDps * STATUS.tick * m.pstacks, hitOf('poison'));
    }
    if (m.poison <= 0) m.pstacks = 0;
  }
  if (m.slow > 0) m.slow -= dt;
  if (m.freeze > 0) m.freeze -= dt;
  if (m.stun > 0) m.stun -= dt;
}

function stepLeap(m, dt) {
  m.leapT -= dt;
  const k = m.leapT <= 0 ? 1 : 1 - m.leapT / m.leapD;
  m.x = m.lx0 + (m.lx1 - m.lx0) * k;
  m.y = m.ly0 + (m.ly1 - m.ly0) * k;
  m.z = (m.def.flying ? m.def.z ?? 18 : 0) + 4 * m.leapH * k * (1 - k);
  m.vx = (m.lx1 - m.lx0) / m.leapD;
  m.vy = (m.ly1 - m.ly0) / m.leapD;
  m.act = m.leapAct;
  m.k = k;
  if (Math.abs(m.vx) > 6) m.face = m.vx > 0 ? 1 : -1;
  if (k >= 1) {
    m.leapT = 0;
    m.vx = 0;
    m.vy = 0;
  }
}

// Желаемая скорость → настоящая, отдача, расталкивание, клетки.
function integrate(room, m, dt) {
  const def = m.def;
  let k = m.slow > 0 ? STATUS.slow : 1;
  if (!def.flying && room.special === 'mud' && tileAt(room, m.x, m.y) === TILE.SPECIAL) k *= 0.6;
  const a = Math.min(1, dt * (def.accel ?? 10));
  m.vx += (m.wx * k - m.vx) * a;
  m.vy += (m.wy * k - m.vy) * a;
  let dx = (m.vx + m.kbx) * dt + m.sx;
  let dy = (m.vy + m.kby) * dt + m.sy;
  if (m.kbx !== 0 || m.kby !== 0) {
    m.kbx *= 0.86;
    m.kby *= 0.86;
    if (m.kbx * m.kbx + m.kby * m.kby < 4) {
      m.kbx = 0;
      m.kby = 0;
    }
  }
  if (dx === 0 && dy === 0) {
    m.bump = 0;
    return;
  }
  if (def.flying) {
    const x = clamp(m.x + dx, T + m.r, room.w * T - T - m.r);
    const y = clamp(m.y + dy, T + m.r, room.h * T - T - m.r);
    m.bump = (x !== m.x + dx ? 1 : 0) | (y !== m.y + dy ? 2 : 0);
    m.x = x;
    m.y = y;
  } else {
    if (dx > 12) dx = 12;
    else if (dx < -12) dx = -12;
    if (dy > 12) dy = 12;
    else if (dy < -12) dy = -12;
    const r = m.r > 14 ? 14 : m.r;
    const ox = m.x;
    const oy = m.y;
    m.bump = moveCircle(room, m, dx, dy, r, F_WALK | F_MOB);
    // сундуки и пни обходит, а не проходит насквозь
    if (room.things.length && pushFromThings(room, m, r) && circleHits(room, m.x, m.y, r, F_WALK | F_MOB)) {
      m.x = ox;
      m.y = oy;
    }
  }
  if (Math.abs(m.vx) > 6) m.face = m.vx > 0 ? 1 : -1;
}

// Наземные звери не стоят друг в друге: накопить, на сколько каждого отодвинуть (лёгкого — сильнее).
function separation(mobs, n) {
  for (let i = 0; i < n; i++) {
    mobs[i].sx = 0;
    mobs[i].sy = 0;
  }
  for (let i = 0; i < n; i++) {
    const a = mobs[i];
    if (a.dead || a.def.flying || a.inv > 0 || a.hide || a.leapT > 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = mobs[j];
      const min = a.r + b.r;
      const dx = b.x - a.x;
      if (dx > min || dx < -min) continue;
      const dy = b.y - a.y;
      if (dy > min || dy < -min) continue;
      if (b.dead || b.def.flying || b.inv > 0 || b.hide || b.leapT > 0) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d < 0.01 ? 1 : dx / d;
      const ny = d < 0.01 ? 0 : dy / d;
      const push = Math.min(3, (min - d) * 0.5);
      const ma = a.def.mass ?? 1;
      const mb = b.def.mass ?? 1;
      const ka = mb / (ma + mb);
      a.sx -= nx * push * 2 * ka;
      a.sy -= ny * push * 2 * ka;
      b.sx += nx * push * 2 * (1 - ka);
      b.sy += ny * push * 2 * (1 - ka);
    }
  }
}

function touch(G, m) {
  const P = G.player;
  if (m.hide || P.down > 0) return;
  const dx = P.x - m.x;
  const dy = P.y - m.y;
  const rr = m.r + FOX_R - 2;
  if (dx * dx + dy * dy > rr * rr) return;
  const f = P.st.flags;
  if (f.contact > 0 && m.touchT <= 0) {
    m.touchT = MOB.touchGap;
    hurtMob(G, m, f.contact, hitOf('thorns'));
    if (m.dead) return;
  }
  const dmg = m.def.touch ?? 0;
  if (dmg <= 0 || P.dash || m.freeze > 0 || m.stun > 0) return;
  if (hurtPlayer(G, m.elite ? Math.max(dmg, MOB.eliteDmg) : dmg, m.x, m.y, 'touch') && f.thorns > 0) hurtMob(G, m, f.thorns, hitOf('thorns'));
}

/** Шаг всех зверей комнаты. */
export function stepMobs(G, dt) {
  const room = G.room;
  const mobs = room.mobs;
  const P = G.player;
  for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].dead) swapRemove(mobs, i);
  const n = mobs.length;
  if (!n) return;
  updateFlow(room, P.x, P.y);
  separation(mobs, n);
  // спутник-приманка перетягивает врагов на себя
  let bait = null;
  for (let i = 0; i < room.pals.length; i++) if (!room.pals[i].dead && room.pals[i].def.taunt) bait = room.pals[i];
  for (let i = 0; i < n; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    m.px = m.x;
    m.py = m.y;
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dt);
    if (m.inv > 0) {
      // проявляется из метки: безвреден и неуязвим
      m.inv -= dt;
      m.act = 'spawn';
      m.k = m.warm > 0 ? clamp(1 - m.inv / m.warm, 0, 1) : 1;
      if (m.inv <= 0) {
        m.inv = 0;
        sfx(G, 'spawn', m.x, m.y);
      }
      continue;
    }
    statuses(G, m, dt);
    if (m.dead) continue;
    if (m.cd > 0) m.cd -= dt;
    if (m.touchT > 0) m.touchT -= dt;
    m.target = null;
    m.tx = P.x;
    m.ty = P.y;
    if (bait && m.kind !== 0 && Math.hypot(bait.x - m.x, bait.y - m.y) < Math.max(90, Math.hypot(P.x - m.x, P.y - m.y) * 1.3)) {
      m.target = bait;
      m.tx = bait.x;
      m.ty = bait.y;
    }
    if (m.leapT > 0) stepLeap(m, dt);
    else {
      if (m.freeze > 0 || m.stun > 0) {
        stop(m);
        m.act = m.kind === 0 ? 'freeze' : 'stun';
        m.k = 0;
      } else {
        m.act = '';
        // у добычи поведение общее — если описание не дало своего (бабочка задания); но и своенравная
        // добыча не вечна: вышло её время — пропадает, иначе волна не кончилась бы никогда
        if (m.kind === 0 && !m.def.think) thinkPrey(G, m, dt);
        else {
          if (m.def.think) m.def.think(m, G, dt, ACTS);
          if (m.kind === 0 && !m.dead && (m.life -= dt) <= 0) {
            m.dead = true;
            emit(G, { t: 'escape', x: m.x, y: m.y, id: m.id });
            sfx(G, 'escape', m.x, m.y);
          }
        }
        if (m.dead) continue;
        if (m.act === '') {
          // «мысль» позу не задала: только что ударенный вздрагивает, идущий идёт, остальные стоят
          m.act = m.flash > 0 ? 'hurt' : m.wx !== 0 || m.wy !== 0 ? 'move' : 'idle';
          m.k = m.flash > 0 ? 1 - m.flash / POSE.flash : 0;
        }
        // время состояния идёт после «мысли», а в шаг, когда состояние сменилось, стоит на нуле
        if (m.fresh) m.fresh = false;
        else m.t += dt;
      }
      if (m.leapT <= 0) integrate(room, m, dt);
    }
    if (m.kind !== 0) touch(G, m);
    else if (!P.dash && P.down <= 0 && !m.hide) {
      // добычу ловит и просто касание
      const rr = m.r + FOX_R;
      if ((P.x - m.x) * (P.x - m.x) + (P.y - m.y) * (P.y - m.y) < rr * rr) catchPrey(G, m, 0);
    }
  }
}

// ---------- спутники ----------

function addPal(G, rec, slot) {
  const room = G.room;
  const P = G.player;
  const def = REG.MINIONS[rec.id];
  if (!def || room.pals.length >= CAPS.pals) return null;
  const maxHp = Math.max(1, Math.round((def.hp ?? 5) * P.st.palHp));
  let x = P.x - P.face * (18 + slot * 14);
  let y = P.y + (slot % 2 ? 14 : -10);
  if (!standable(room, x, y, 9) || circleHits(room, x, y, 9, F_MOB)) {
    x = P.x;
    y = P.y;
  }
  const n = body(++room.uid, rec.id, def, x, y, def.r ?? 8, Math.min(Math.max(1, rec.hp), maxHp));
  n.maxHp = maxHp;
  n.rec = rec;
  n.slot = slot;
  n.pal = true;
  room.pals.push(n);
  return n;
}

/** Поставить спутников лисы в только что открытую комнату. */
export function spawnPals(G) {
  G.room.pals.length = 0;
  for (let i = 0; i < G.minions.length; i++) addPal(G, G.minions[i], i);
}

/** Нанять спутника (id из minions.js). false — нет такого или все места заняты. */
export function hireMinion(G, id) {
  const def = REG.MINIONS[id];
  const P = G.player;
  if (!def || G.minions.length >= P.st.palSlots) return false;
  const rec = { id, hp: Math.max(1, Math.round((def.hp ?? 5) * P.st.palHp)) };
  G.minions.push(rec);
  if (G.room) addPal(G, rec, G.minions.length - 1);
  sfx(G, 'hire', P.x, P.y);
  emit(G, { t: 'ui' });
  return true;
}

/** Ударить спутника. Без здоровья он выбывает насовсем. */
export function hurtPal(G, n, dmg) {
  if (n.dead || n.touchT > 0 || !(dmg > 0)) return false;
  n.touchT = 0.8;                           // короткая передышка после удара
  n.hp -= dmg;
  n.flash = 0.12;
  n.rec.hp = Math.max(0, n.hp);
  emit(G, { t: 'hit', x: n.x, y: n.y, dmg, crit: false, kind: 'pal' });
  if (n.hp > 0) return true;
  n.dead = true;
  const at = G.minions.indexOf(n.rec);
  if (at >= 0) G.minions.splice(at, 1);
  emit(G, { t: 'die', x: n.x, y: n.y, id: n.id, elite: false, pal: true });
  toast(G, `${n.def.name ?? 'Спутник'} выбыл`);
  emit(G, { t: 'ui' });
  return true;
}

/** Шаг спутников: думают своей think, ходят за лисой, получают от врагов. */
export function stepPals(G, dt) {
  const room = G.room;
  const pals = room.pals;
  if (!pals.length) return;
  const P = G.player;
  updateFlow(room, P.x, P.y);
  for (let i = pals.length - 1; i >= 0; i--) {
    const n = pals[i];
    if (n.dead) {
      swapRemove(pals, i);
      continue;
    }
    n.px = n.x;
    n.py = n.y;
    if (n.flash > 0) n.flash = Math.max(0, n.flash - dt);
    if (n.cd > 0) n.cd -= dt;
    if (n.touchT > 0) n.touchT -= dt;
    n.tx = P.x;
    n.ty = P.y;
    n.sx = 0;
    n.sy = 0;
    if (n.leapT > 0) stepLeap(n, dt);
    else {
      n.act = '';
      if (n.def.think) n.def.think(n, G, dt, ACTS);
      if (n.act === '') {
        n.act = n.wx !== 0 || n.wy !== 0 ? 'move' : 'idle';
        n.k = 0;
      }
      if (n.fresh) n.fresh = false;
      else n.t += dt;
      if (n.leapT <= 0) integrate(room, n, dt);
    }
    // отстал или застрял — оказывается рядом с лисой
    if (Math.hypot(P.x - n.x, P.y - n.y) > 330 && !P.dash && standable(room, P.x, P.y, n.r)) {
      n.x = P.x;
      n.y = P.y;
      n.px = n.x;
      n.py = n.y;
    }
    if (n.touchT > 0) continue;
    const mobs = room.mobs;
    for (let j = 0; j < mobs.length; j++) {
      const m = mobs[j];
      if (m.dead || m.hide || m.inv > 0 || m.kind === 0 || !(m.def.touch > 0) || m.freeze > 0 || m.stun > 0) continue;
      const rr = m.r + n.r - 2;
      if ((m.x - n.x) * (m.x - n.x) + (m.y - n.y) * (m.y - n.y) > rr * rr) continue;
      hurtPal(G, n, 1);
      break;
    }
  }
}
