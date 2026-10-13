// Как стреляет оружие лисы: готовые «рисунки выстрела» (PATTERNS) и общий порядок одного выстрела. Без DOM.
//
// Оружие в weapons.js — данные: { pattern, dmg, range, mana, cd, shot: {…} }. Здесь по имени рисунка выстрел
// превращается в снаряды, удар по дуге или луч. Нового кода под обычное оружие не нужно; совсем особенное может
// дать свою функцию fire(G, w, lvl, x, y, ang, tx, ty) — тогда рисунок не используется.
//
// Рисунки и поля shot, которые они читают (сверх общих: look, v, speed, r, burn, poison, slow, freeze, stun, kb):
//   bullet    один снаряд по прямой
//   spread    веер: n снарядов (3) на раствор arc (0,45 рад)
//   burst     очередь: n снарядов (3) подряд с паузой gap (0,07 с)
//   pierce    снаряд пролетает сквозь pierce целей (2)
//   bounce    снаряд отскакивает от стен bounce раз (3)
//   boomerang летит на дальность и возвращается к лисе, задевая всех по пути туда и обратно
//   homing    n снарядов (1) доворачивают к ближнему врагу: homing рад/с (5)
//   lob       бросок навесом в цель: в полёте стены не мешают, в точке взрыв радиуса radius (40)
//   beam      непрерывный луч: dmg и mana оружия — в секунду, cd — как часто «тикает» (0,08 с)
//   chain     молния: попав, перескакивает на ближнего врага chain раз (3) в радиусе chainR (110)
//   cone      удар по дуге прямо сейчас: радиус — range оружия, раствор arc (1,5 рад)
//   nova      n снарядов (10) во все стороны
//   trap      капкан под лапы: срабатывает под врагом, взрыв radius (36); одновременно лежит не больше max (3)
//   cloud     бросок навесом, после которого linger секунд (4) висит облако (zoneLook 'poison', zoneDmg 1)
//   rain      n бросков (5) вокруг цели в разбросе spread (50), один за другим
//   ray       мгновенный луч шириной width (10) до первой стены: бьёт всех на линии
//   wave      широкая волна (r 22): летит сквозь стены и сквозь всех

import { F_SHOT, REG, TAU, T, TILE, rnd, inCone, segDist2, emit, sfx } from './core.js';
import { weaponDmg } from './balance.js';
import { castRay, breakBush, tileIndex } from './world.js';
import { fireShot, lobShot, hurtMob, hitOf, breakThing } from './combat.js';

const MUZZLE = 10;                          // снаряд появляется чуть впереди лисы
const NO_SHOT = Object.freeze({});
const TRAP = 3;

/** Сколько маны стоит одно срабатывание оружия (у луча mana — в секунду). */
export function weaponCost(w) {
  return w.pattern === 'beam' ? (w.mana ?? 0) * (w.cd ?? 0.08) : w.mana ?? 0;
}

// Один снаряд оружия: дальность — из оружия (с учётом вещей лисы).
function shoot(G, w, x, y, a, dmg) {
  const sh = w.shot ?? NO_SHOT;
  const s = fireShot(G, 0, x + Math.cos(a) * MUZZLE, y + Math.sin(a) * MUZZLE, a, sh, dmg);
  if (s && sh.range == null && sh.life == null) s.life = ((w.range ?? 260) * G.player.st.wRange) / (s.speed || 1);
  return s;
}

// Куда бросать навесом: в цель, но не дальше дальности оружия.
function lobTo(G, w, x, y, tx, ty, dmg, spec) {
  const range = (w.range ?? 220) * G.player.st.wRange;
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  const k = d > range ? range / d : 1;
  return lobShot(G, 0, x, y, x + dx * k, y + dy * k, spec, dmg);
}

export const PATTERNS = {
  bullet(G, w, x, y, a, dmg) {
    shoot(G, w, x, y, a, dmg);
  },
  spread(G, w, x, y, a, dmg) {
    const n = Math.max(2, w.shot?.n ?? 3);
    const arc = w.shot?.arc ?? 0.45;
    for (let i = 0; i < n; i++) shoot(G, w, x, y, a + (i / (n - 1) - 0.5) * arc, dmg);
  },
  burst(G, w, x, y, a, dmg) {
    const P = G.player;
    shoot(G, w, x, y, a, dmg);
    P.burst = Math.max(0, (w.shot?.n ?? 3) - 1);
    P.burstT = w.shot?.gap ?? 0.07;
    P.burstA = a;
    P.burstDmg = dmg;
  },
  pierce(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg);
    if (s && !(s.pierce > 0)) s.pierce = 2;
  },
  bounce(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg);
    if (s && !(s.bounce > 0)) s.bounce = 3;
  },
  boomerang(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg);
    if (s) {
      s.mode = 1;
      s.spin = true;
    }
  },
  homing(G, w, x, y, a, dmg) {
    const n = Math.max(1, w.shot?.n ?? 1);
    const arc = w.shot?.arc ?? 0.7;
    for (let i = 0; i < n; i++) {
      const s = shoot(G, w, x, y, n > 1 ? a + (i / (n - 1) - 0.5) * arc : a, dmg);
      if (s && !(s.homing > 0)) s.homing = 5;
    }
  },
  lob(G, w, x, y, a, dmg, tx, ty) {
    lobTo(G, w, x, y, tx, ty, dmg, w.shot ?? NO_SHOT);
  },
  beam(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg * (w.cd ?? 0.08));
    if (!s) return;
    const speed = (w.shot?.speed ?? 1500) * G.player.st.shotSpeed;
    s.speed = speed;
    s.vx = Math.cos(a) * speed;
    s.vy = Math.sin(a) * speed;
    s.life = ((w.range ?? 240) * G.player.st.wRange) / speed;
    s.pierce = 99;
  },
  chain(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg);
    if (s && !(s.chain > 0)) s.chain = 3;
  },
  cone(G, w, x, y, a, dmg) {
    const room = G.room;
    const st = G.player.st;
    const sh = w.shot ?? NO_SHOT;
    const r = (w.range ?? 46) * st.wRange;
    const arc = sh.arc ?? 1.5;
    const kb = sh.kb ?? 0;
    const mobs = room.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || m.hide || m.inv > 0 || !inCone(x, y, a, arc, r, m.x, m.y, m.r)) continue;
      const hit = hitOf('shot');
      hit.crit = rnd(G) < st.crit;
      hit.ax = Math.cos(a);
      hit.ay = Math.sin(a);
      hit.kx = hit.ax * kb;
      hit.ky = hit.ay * kb;
      hit.burn = sh.burn ?? 0;
      hit.poison = sh.poison ?? 0;
      hit.slow = sh.slow ?? 0;
      hit.freeze = sh.freeze ?? 0;
      hit.stun = sh.stun ?? 0;
      hurtMob(G, m, dmg, hit);
    }
    // кусты и ломкие предметы в дуге
    const x0 = Math.max(1, Math.floor((x - r) / T));
    const x1 = Math.min(room.w - 2, Math.floor((x + r) / T));
    const y0 = Math.max(1, Math.floor((y - r) / T));
    const y1 = Math.min(room.h - 2, Math.floor((y + r) / T));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * room.w + tx;
        if (room.tiles[i] === TILE.BUSH && inCone(x, y, a, arc, r, tx * T + T / 2, ty * T + T / 2, 12)) breakBush(G, i);
      }
    }
    const things = room.things;
    for (let i = 0; i < things.length; i++) {
      const th = things[i];
      if (th.breakable && !th.broken && inCone(x, y, a, arc, r, th.x, th.y, th.r)) breakThing(G, th, dmg);
    }
  },
  nova(G, w, x, y, a, dmg) {
    const n = Math.max(3, w.shot?.n ?? 10);
    for (let i = 0; i < n; i++) shoot(G, w, x, y, a + (i / n) * TAU, dmg);
  },
  trap(G, w, x, y, a, dmg) {
    const sh = w.shot ?? NO_SHOT;
    const shots = G.room.shots;
    // лишний капкан — самый старый — пропадает
    let count = 0;
    let oldest = null;
    for (let i = 0; i < shots.length; i++) {
      const o = shots[i];
      if (o.mode !== TRAP || o.from !== 0) continue;
      count += 1;
      if (!oldest || o.uid < oldest.uid) oldest = o;
    }
    if (count >= (sh.max ?? 3) && oldest) oldest.life = 0;
    const s = fireShot(G, 0, x + Math.cos(a) * 16, y + Math.sin(a) * 16, a, sh, dmg);
    if (!s) return;
    s.vx = 0;
    s.vy = 0;
    s.z = 0;
    s.mode = TRAP;
    s.life = sh.life ?? 25;
    s.r = sh.r ?? 12;
    if (!(s.radius > 0)) s.radius = 36;
  },
  cloud(G, w, x, y, a, dmg, tx, ty) {
    const s = lobTo(G, w, x, y, tx, ty, dmg, w.shot ?? NO_SHOT);
    if (!s) return;
    if (!(s.linger > 0)) s.linger = 4;
    if (!(s.zoneDmg > 0)) s.zoneDmg = 1;
  },
  rain(G, w, x, y, a, dmg, tx, ty) {
    const sh = w.shot ?? NO_SHOT;
    const n = Math.max(1, sh.n ?? 5);
    const spread = sh.spread ?? 50;
    for (let i = 0; i < n; i++) {
      const ra = rnd(G) * TAU;
      const rr = i === 0 ? 0 : Math.sqrt(rnd(G)) * spread;
      const s = lobTo(G, w, x, y, tx + Math.cos(ra) * rr, ty + Math.sin(ra) * rr, dmg, sh);
      if (!s) break;
      s.lob.dur += i * 0.12;
      s.life = s.lob.dur + 1;
    }
  },
  ray(G, w, x, y, a, dmg) {
    const room = G.room;
    const st = G.player.st;
    const sh = w.shot ?? NO_SHOT;
    const range = (w.range ?? 400) * st.wRange;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const len = range * castRay(room, x, y, x + c * range, y + sn * range, F_SHOT);
    const ex = x + c * len;
    const ey = y + sn * len;
    const half = (sh.width ?? 10) / 2;
    const mobs = room.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || m.hide || m.inv > 0) continue;
      const rr = half + m.r;
      if (segDist2(x, y, ex, ey, m.x, m.y) > rr * rr) continue;
      const hit = hitOf('shot');
      hit.crit = rnd(G) < st.crit;
      hit.ax = c;
      hit.ay = sn;
      hit.burn = sh.burn ?? 0;
      hit.poison = sh.poison ?? 0;
      hit.slow = sh.slow ?? 0;
      hit.freeze = sh.freeze ?? 0;
      hit.stun = sh.stun ?? 0;
      hurtMob(G, m, dmg, hit);
    }
    for (let d = T / 2; d < len; d += T / 2) {
      const i = tileIndex(room, x + c * d, y + sn * d);
      if (i >= 0 && room.tiles[i] === TILE.BUSH) breakBush(G, i);
    }
    const things = room.things;
    for (let i = 0; i < things.length; i++) {
      const th = things[i];
      const rr = half + th.r;
      if (th.breakable && !th.broken && segDist2(x, y, ex, ey, th.x, th.y) <= rr * rr) breakThing(G, th, dmg);
    }
    // сам луч — снаряд-призрак: он только виден
    const s = fireShot(G, 0, x, y, a, sh, 0);
    if (!s) return;
    const speed = sh.speed ?? 2600;
    s.ghost = true;
    s.through = true;
    s.speed = speed;
    s.vx = c * speed;
    s.vy = sn * speed;
    s.life = len / speed;
  },
  wave(G, w, x, y, a, dmg) {
    const s = shoot(G, w, x, y, a, dmg);
    if (!s) return;
    s.through = true;
    if (!(s.pierce > 0)) s.pierce = 99;
    if (w.shot?.r == null) s.r = 22;
  },
};

/**
 * Один выстрел из оружия item ({ id, lvl }) из точки (x, y) под углом ang в сторону цели (tx, ty).
 * Ману и перезарядку считает тот, кто зовёт (player.js). false — такого оружия нет или оно отказалось стрелять.
 */
export function fireWeapon(G, item, x, y, ang, tx, ty) {
  const w = REG.WEAPONS[item.id];
  if (!w) return false;
  const st = G.player.st;
  const lvl = item.lvl ?? 0;
  const dmg = weaponDmg(w, lvl) * st.wDmg;
  const run = PATTERNS[w.pattern ?? 'bullet'];
  if (tx === undefined || ty === undefined) {
    const reach = (w.range ?? 260) * st.wRange * 0.7;
    tx = x + Math.cos(ang) * reach;
    ty = y + Math.sin(ang) * reach;
  }
  if (typeof w.fire === 'function') {
    if (w.fire(G, w, lvl, x, y, ang, tx, ty) === false) return false;
  } else if (run) run(G, w, x, y, ang, dmg, tx, ty);
  else return false;
  // «зеркальце»: иногда выстрел двоится
  if (st.flags.dupShot > 0 && rnd(G) < st.flags.dupShot) {
    if (typeof w.fire === 'function') w.fire(G, w, lvl, x, y, ang + 0.14, tx, ty);
    else run(G, w, x, y, ang + 0.14, dmg, tx, ty);
  }
  emit(G, { t: 'shot', look: w.shot?.look ?? 'fx.slash', x, y, a: ang, id: item.id });
  sfx(G, w.sfx ?? 'shot', x, y);
  return true;
}

/** Следующий снаряд очереди (рисунок burst): зовёт шаг лисы, пока очередь не кончится. */
export function burstShot(G) {
  const P = G.player;
  const item = G.inv.weapon;
  const w = item && REG.WEAPONS[item.id];
  if (!w) {
    P.burst = 0;
    return;
  }
  P.burst -= 1;
  P.burstT += w.shot?.gap ?? 0.07;
  shoot(G, w, P.x, P.y, P.burstA, P.burstDmg ?? weaponDmg(w, item.lvl) * P.st.wDmg);
  sfx(G, w.sfx ?? 'shot', P.x, P.y);
}
