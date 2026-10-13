// Лиса: ходьба, рывок, выстрел из оружия, урон, потеря жизни и возрождение, характеристики с учётом вещей.
// Без DOM.
//
// Рывок — главное действие: короткий прыжок по прямой. Пока лиса в воздухе, ей ничего не страшно; по пути она
// ловит добычу, бьёт врагов (каждого один раз), ломает кусты и пни заданий и перелетает воду и пни. Поймала
// хоть кого-то — заряд рывка возвращается сразу. Единственное наказание — колючий враг: в него рывком нельзя.
//
// Характеристики (P.st) пересчитывает recalc: основа из balance.js → броня → украшения → дары → временные
// действия → пределы. Вещь меняет их только данными (add, mul, flags) — кода под каждую вещь нет; что умеют
// флаги, написано у FLAG_RULES.

import {
  H, TILE, F_WALK, FOX_R, REG, rnd, clamp, angDiff, segDist2, emit, sfx, floatText, haptic, shake, own,
} from './core.js';
import { BASE, LIMITS, WHOLE, FOX, DASH, POSE, PERK, dashTime } from './balance.js';
import {
  tileAt, tileIndex, circleHits, moveCircle, unstick, solveDash, doorAt, nearestOf, clearZones, addZone,
  pushFromThings, hasLos, breakBush, updateFlow,
} from './world.js';
import { hurtMob, hitOf, catchPrey, explode, breakThing } from './combat.js';
import { fireWeapon, weaponCost, burstShot } from './patterns.js';
import { preyDashAlert } from './ai.js';

export const STAT_KEYS = Object.keys(BASE);

/**
 * Флаги — умения, которые нельзя выразить числом характеристики. Как складываются от нескольких вещей:
 * 'or' — есть или нет; 'sum' — числа складываются; 'max' — берётся большее; 'min' — меньшее.
 *
 *   fireTrail     рывок оставляет горящий след            iceDash    рывок замораживает задетых на секунду
 *   slowDash      рывок замедляет задетых на 2 с          shockwave  удар по земле там, где лиса приземлилась
 *   thorns        зверь, ударивший касанием, получает столько урона (true — 3)
 *   contact       зверь, который трётся о лису, получает столько урона раз в полсекунды (true — 1)
 *   roomBlock     столько ударов за комнату не проходит (true — 1)
 *   revive        раз за партию: вместо потери жизни — подъём на месте; вещь с этим флагом сгорает
 *   sporeOnHit    когда лису ударили — вокруг ядовитое облако
 *   dupShot       шанс двойного выстрела (true — 0,15)
 *   killHeal      каждые столько убитых врагов — одно сердце (true — 12)
 *   coinPerRabbit столько монет за каждую добычу (true — 1)
 *   revealMap     вся карта локации открыта
 *   kbImmune      лису не отбрасывает                      slowImmune  грязь, лёд и паутина не замедляют
 *   cloudImmune   не страшны ядовитые облака, огонь и паутина на земле
 *   floorImmune   не страшны грязь, лёд, колючки, горячие трещины и капканы
 *   projSlow      вражеские выстрелы медленнее на эту долю (true — 0,3)
 *   glowbug       светлячок рядом с лисой бьёт ближнего врага
 *   manaPerRabbit столько маны за каждую добычу (true — 3)
 *   secondWind    после потери жизни — 6 с ускорения и два щита
 */
export const FLAG_RULES = {
  fireTrail: 'or', iceDash: 'or', slowDash: 'or', shockwave: 'or', thorns: 'max', contact: 'max', roomBlock: 'sum',
  revive: 'or', sporeOnHit: 'or', dupShot: 'max', killHeal: 'min', coinPerRabbit: 'sum', revealMap: 'or',
  kbImmune: 'or', slowImmune: 'or', cloudImmune: 'or', floorImmune: 'or', projSlow: 'max', glowbug: 'or',
  manaPerRabbit: 'sum', secondWind: 'or',
};
export const FLAG_KEYS = Object.keys(FLAG_RULES);
/** Значение числового флага, если вещь написала просто true. */
export const FLAG_DEFAULT = { thorns: 3, contact: 1, roomBlock: 1, dupShot: 0.15, killHeal: 12, coinPerRabbit: 1, projSlow: 0.3, manaPerRabbit: 3 };

/** Временные действия, которые движок знает сам (остальные — из EFFECTS в items.js). */
export const BUILTIN_FX = ['slow', 'root', 'haste', 'rage', 'stone'];

// ввод приходит снаружи: всё, что не обычное число, считается нулём
const fin = (v) => (Number.isFinite(v) ? v : 0);

// какая поза важнее: менее важная более важную не перебивает
const ACT_RANK = { fire: 1, bite: 2, land: 2, hurt: 3, rise: 4 };

export function newPlayer() {
  const st = { ...BASE, flags: {} };
  for (const k of FLAG_KEYS) st.flags[k] = FLAG_RULES[k] === 'or' ? false : 0;
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, z: 0, face: 1, dir: 0,
    hp: BASE.maxHp, mana: BASE.maxMana, shield: 0, shieldT: 0, regenT: 0, inv: 0,
    st, charges: BASE.dashCharges, chargeT: 0,
    dash: null, dashBuf: { t: 0, dur: 0, sx: 0, sy: 0, ex: 0, ey: 0, caught: 0, hits: 0, id: 0, bounce: false, trail: 0, ux: 1, uy: 0 },
    dashId: 0,
    wcd: 0, aim: null, aimBuf: { x: 1, y: 0, p: 0 },
    fx: { slow: 0, root: 0, haste: 0, rage: 0, stone: 0 },
    act: 'idle', k: 0, actT: 0, actD: 0, flash: 0,
    kills: 0, down: 0, blocks: 0,
    fireWas: false, fireUse: false, useNow: false,
    floorT: 0, nomanaT: 0, bugT: 0, burst: 0, burstT: 0, burstA: 0, burstDmg: 0,
  };
}

// ---------- характеристики ----------

const ADD = {};
const MUL = {};

function mergeFlag(f, k, v) {
  const rule = FLAG_RULES[k];
  if (!rule || !v) return;
  if (rule === 'or') {
    f[k] = true;
    return;
  }
  const n = v === true ? FLAG_DEFAULT[k] ?? 1 : Number(v);
  if (!(n > 0)) return;
  if (rule === 'sum') f[k] += n;
  else if (rule === 'max') f[k] = Math.max(f[k], n);
  else f[k] = f[k] > 0 ? Math.min(f[k], n) : n;
}

function applyDef(d, f) {
  if (!d) return;
  if (d.add) for (const k in d.add) if (own(ADD, k)) ADD[k] += Number(d.add[k]) || 0;
  if (d.mul) for (const k in d.mul) if (own(MUL, k) && Number.isFinite(d.mul[k])) MUL[k] *= d.mul[k];
  if (d.flags) for (const k in d.flags) mergeFlag(f, k, d.flags[k]);
}

/**
 * Пересчитать характеристики лисы: (основа + все add) × все mul, потом пределы. Зовётся, когда сменилась вещь,
 * взят дар, началось или кончилось временное действие. Текущие сердца, щит, мана и заряды подрезаются под новое.
 */
export function recalc(G) {
  const P = G.player;
  const st = P.st;
  const f = st.flags;
  for (const k of STAT_KEYS) {
    ADD[k] = 0;
    MUL[k] = 1;
  }
  for (const k of FLAG_KEYS) f[k] = FLAG_RULES[k] === 'or' ? false : 0;
  const inv = G.inv;
  if (inv.armor) {
    const d = REG.ARMOR[inv.armor.id];
    if (d) ADD.maxShield += d.shield ?? 0;
    applyDef(d, f);
  }
  for (let i = 0; i < inv.acc.length; i++) if (inv.acc[i]) applyDef(REG.ACCESSORIES[inv.acc[i].id], f);
  for (let i = 0; i < G.gifts.length; i++) applyDef(REG.GIFTS[G.gifts[i]], f);
  for (const k in P.fx) if (P.fx[k] > 0) applyDef(REG.EFFECTS[k], f);
  for (const k of STAT_KEYS) {
    const lim = LIMITS[k];
    st[k] = clamp((BASE[k] + ADD[k]) * MUL[k], lim[0], lim[1]);
  }
  for (const k of WHOLE) st[k] = Math.round(st[k]);
  if (P.hp > st.maxHp) P.hp = st.maxHp;
  if (P.mana > st.maxMana) P.mana = st.maxMana;
  if (P.shield > st.maxShield) P.shield = st.maxShield;
  if (P.charges > st.dashCharges) P.charges = st.dashCharges;
  if (f.revealMap && G.map) for (const r of G.map.rooms) r.seen = true;
}

// ---------- мелочи ----------

/** Поставить позу на время (секунды); менее важная более важную не перебивает. */
export function setAct(P, act, dur) {
  if (P.actT > 0 && (ACT_RANK[P.act] ?? 0) > (ACT_RANK[act] ?? 0)) return;
  P.act = act;
  P.actT = dur;
  P.actD = dur;
  P.k = 0;
}

/** Поставить лису в точку: без скорости, рывка и недобитых поз. */
export function placePlayer(G, x, y) {
  const P = G.player;
  P.x = x;
  P.y = y;
  P.px = x;
  P.py = y;
  P.vx = 0;
  P.vy = 0;
  P.z = 0;
  P.dash = null;
  P.aim = null;
  P.burst = 0;
  P.floorT = 0;
  P.fireUse = false;
  P.useNow = false;
  // мелочи, которые в сохранение не попадают: после загрузки партия должна пойти точно так же
  P.act = 'idle';
  P.k = 0;
  P.actT = 0;
  P.actD = 0;
  P.dashId = 0;
  if (P.wcd < 0) P.wcd = 0;
}

/** Вылечить на n сердец (плюс «мёд»); возвращает, сколько сердец прибавилось. */
export function heal(G, n) {
  const P = G.player;
  if (P.down > 0 || G.over || !(n > 0)) return 0;
  const before = P.hp;
  P.hp = Math.min(P.st.maxHp, P.hp + n + P.st.healBonus);
  return P.hp - before;
}

/**
 * Плата сердцами (жертвенный камень): снимает n сердец мимо щита, оберегов и неуязвимости — но последнее сердце
 * не отдаётся. false — сердец не хватает, ничего не снято.
 */
export function payHearts(G, n = 1) {
  const P = G.player;
  if (G.over || P.down > 0 || !(n > 0) || P.hp - n < 1) return false;
  P.hp -= n;
  P.flash = POSE.flash;
  emit(G, { t: 'hurt', dmg: n, shield: 0, kind: 'pay' });
  sfx(G, 'hurt', P.x, P.y);
  return true;
}

/** Добавить маны; возвращает, сколько прибавилось. */
export function addMana(G, n) {
  const P = G.player;
  const before = P.mana;
  P.mana = clamp(P.mana + n, 0, P.st.maxMana);
  return P.mana - before;
}

/** Монеты в кошелёк (с учётом «кошеля барсука»): дробная часть разыгрывается. Возвращает, сколько пришло. */
export function gainCoins(G, n, x, y) {
  const raw = Math.max(0, n) * G.player.st.coinMul;
  let got = Math.floor(raw);
  if (raw > got && rnd(G) < raw - got) got += 1;
  if (got <= 0) return 0;
  G.coins += got;
  G.cnt.coins += got;
  emit(G, { t: 'pick', x: x ?? G.player.x, y: y ?? G.player.y, kind: 'coin', v: got });
  return got;
}

/**
 * Временное действие на лису на sec секунд: 'slow', 'root', 'haste', 'rage', 'stone' или любое из EFFECTS.
 * Уже идущее не укорачивается. Замедление и капкан не действуют на тех, кто к ним невосприимчив.
 */
export function addEffect(G, id, sec) {
  const P = G.player;
  const f = P.st.flags;
  if (!(sec > 0) || (!BUILTIN_FX.includes(id) && !own(REG.EFFECTS, id))) return false;
  if (id === 'slow' && (f.slowImmune || f.cloudImmune)) return false;
  if (id === 'root' && f.floorImmune) return false;
  const was = P.fx[id] ?? 0;
  P.fx[id] = Math.max(was, sec);
  if (!(was > 0)) {
    recalc(G);
    // временный щит даётся сразу полным
    const d = REG.EFFECTS[id];
    if (d?.add?.maxShield > 0) P.shield = Math.min(P.st.maxShield, P.shield + d.add.maxShield);
  }
  return true;
}

function tickEffects(G, dt) {
  const fx = G.player.fx;
  let ended = false;
  for (const k in fx) {
    if (fx[k] > 0) {
      fx[k] -= dt;
      if (fx[k] <= 0) {
        fx[k] = 0;
        ended = true;
      }
    }
  }
  if (ended) recalc(G);
}

// ---------- шаг ----------

/** Шаг лисы. first — первый шаг кадра: только в нём учитываются разовые команды (рывок, действие). */
export function stepPlayer(G, input, first = true) {
  const P = G.player;
  const st = P.st;
  const room = G.room;
  const dt = H;
  P.px = P.x;
  P.py = P.y;
  if (P.inv > 0) P.inv = Math.max(0, P.inv - dt);
  // перезарядка оружия уходит ниже нуля не больше чем на шаг: этот «перелёт» зачтётся следующему выстрелу,
  // и частота стрельбы не зависит от того, делится ли пауза на шаг расчёта
  if (P.wcd > -dt) P.wcd -= dt;
  if (P.flash > 0) P.flash = Math.max(0, P.flash - dt);
  if (P.nomanaT > 0) P.nomanaT -= dt;
  tickEffects(G, dt);

  if (P.down > 0) {
    P.down -= dt;
    P.vx = 0;
    P.vy = 0;
    P.act = 'down';
    P.k = clamp(1 - P.down / FOX.respawnTime, 0, 1);
    if (P.down <= 0) respawn(G);
    return;
  }

  // щит возвращается, если давно не били; мана — если есть чем
  if (P.shieldT < 99) P.shieldT += dt;
  if (P.shield < st.maxShield && P.shieldT >= FOX.shieldDelay) {
    P.regenT += dt * st.shieldRegen;
    if (P.regenT >= FOX.shieldStep) {
      P.regenT = 0;
      P.shield += 1;
    }
  }
  if (st.manaRegen > 0 && P.mana < st.maxMana) P.mana = Math.min(st.maxMana, P.mana + st.manaRegen * dt);
  if (P.charges < st.dashCharges) {
    P.chargeT += dt;
    if (P.chargeT >= st.dashCd) {
      P.chargeT = 0;
      P.charges += 1;
    }
  } else P.chargeT = 0;

  // прицел рывка и «действие или выстрел» правого стика
  if (input.aim) {
    P.aimBuf.x = fin(input.ax);
    P.aimBuf.y = fin(input.ay);
    P.aimBuf.p = clamp(fin(input.ap), 0, 1);
    P.aim = P.aimBuf;
  } else P.aim = null;
  const fire = Boolean(input.fire);
  if (fire && !P.fireWas && room.focus && room.focus.type !== 'hint') {
    // палец лёг, когда рядом было что взять или открыть: это нажатие — действие, а не стрельба
    P.fireUse = true;
    P.useNow = true;
  }
  if (!fire) P.fireUse = false;
  P.fireWas = fire;
  if (first && input.act) P.useNow = true;

  if (first && input.dash && !P.dash) startDash(G, input.dx, input.dy, input.dp);
  if (P.dash) advanceDash(G, dt);
  else walk(G, input, dt);
  if (G.over || P.down > 0) return;

  if (P.burst > 0) {
    P.burstT -= dt;
    if (P.burstT <= 0) burstShot(G);
  }
  if (!P.dash && fire && !P.fireUse) tryFire(G, input);
  floorEffects(G, dt);
  if (st.flags.glowbug) glowbug(G, dt);
  if (G.over || P.down > 0) return;

  pose(G, dt);
  if (!P.dash) {
    if (circleHits(room, P.x, P.y, 5, F_WALK)) unstick(room, P);
    const side = doorAt(room, P.x, P.y);
    if (side) G.exit = side;
  }
}

function pose(G, dt) {
  const P = G.player;
  if (P.dash) {
    P.act = P.dash.bounce ? 'hurt' : 'dash';
    P.k = Math.min(1, P.dash.t / P.dash.dur);
    return;
  }
  if (P.actT > 0) {
    P.actT -= dt;
    P.k = clamp(1 - P.actT / P.actD, 0, 1);
    if (P.actT > 0) return;
  }
  if (P.aim) {
    P.act = 'aim';
    P.k = P.aim.p;
  } else {
    P.act = P.vx * P.vx + P.vy * P.vy > 144 ? 'run' : 'idle';
    P.k = 0;
  }
}

// ---------- ходьба ----------

function walk(G, input, dt) {
  const P = G.player;
  const st = P.st;
  const f = st.flags;
  const room = G.room;
  let mx = fin(input.mx);
  let my = fin(input.my);
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  let speed = st.speed;
  let accel = FOX.accel;
  if (!f.floorImmune && !f.slowImmune && tileAt(room, P.x, P.y) === TILE.SPECIAL) {
    if (room.special === 'mud') speed *= FOX.mud;
    else if (room.special === 'ice') accel = FOX.iceAccel;
  }
  if (P.fx.root > 0 || (P.actT > 0 && P.act === 'rise')) speed = 0;
  const dvx = mx * speed - P.vx;
  const dvy = my * speed - P.vy;
  const dv = Math.hypot(dvx, dvy);
  const max = accel * dt;
  if (dv <= max) {
    P.vx += dvx;
    P.vy += dvy;
  } else {
    P.vx += (dvx / dv) * max;
    P.vy += (dvy / dv) * max;
  }
  if (P.vx !== 0 || P.vy !== 0) {
    const bump = moveCircle(room, P, P.vx * dt, P.vy * dt, FOX_R, F_WALK);
    if (bump & 1) P.vx = 0;
    if (bump & 2) P.vy = 0;
    if (room.things.length && pushFromThings(room, P, FOX_R) && circleHits(room, P.x, P.y, FOX_R, F_WALK)) {
      P.x = P.px;
      P.y = P.py;
    }
  }
  if (P.aim) {
    P.dir = Math.atan2(P.aim.y, P.aim.x);
    if (Math.abs(P.aim.x) > 0.15) P.face = P.aim.x > 0 ? 1 : -1;
  } else if (ml > 0.1) {
    P.dir = Math.atan2(my, mx);
    if (Math.abs(mx) > 0.15) P.face = mx > 0 ? 1 : -1;
  }
}

// колючки и горячая трещина: стоишь — больно; в прыжке не задевают
function floorEffects(G, dt) {
  const P = G.player;
  const room = G.room;
  if (P.dash) return;
  const code = tileAt(room, P.x, P.y);
  const hot = code === TILE.THORN || (code === TILE.SPECIAL && room.special === 'hot');
  if (!hot || P.st.flags.floorImmune) {
    P.floorT = 0;
    return;
  }
  // первый укол — почти сразу, дальше раз в секунду (а если лиса как раз неуязвима — как только это пройдёт)
  if (P.floorT === 0) P.floorT = FOX.floorHurt * 0.7;
  P.floorT += dt;
  if (P.floorT >= FOX.floorHurt && hurtPlayer(G, 1, P.x, P.y, 'floor')) P.floorT = 1e-6;
}

function glowbug(G, dt) {
  const P = G.player;
  P.bugT -= dt;
  if (P.bugT > 0) return;
  P.bugT = 0.25;
  const mobs = G.room.mobs;
  let best = null;
  let bestD = PERK.bugRange * PERK.bugRange;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0 || m.kind === 0) continue;
    const d = (m.x - P.x) * (m.x - P.x) + (m.y - P.y) * (m.y - P.y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  if (!best) return;
  P.bugT = PERK.bugGap;
  emit(G, { t: 'shot', look: 'fx.bolt', x: P.x, y: P.y, a: Math.atan2(best.y - P.y, best.x - P.x), x2: best.x, y2: best.y });
  sfx(G, 'zap', best.x, best.y);
  hurtMob(G, best, PERK.bugDmg, hitOf('pal'));
}

// ---------- рывок ----------

function startDash(G, dx, dy, power) {
  const P = G.player;
  const st = P.st;
  const room = G.room;
  if (P.charges <= 0 || P.fx.root > 0) return false;
  let ux = fin(dx);
  let uy = fin(dy);
  const l = Math.hypot(ux, uy);
  if (l < 1e-3) {
    ux = Math.cos(P.dir);
    uy = Math.sin(P.dir);
  } else {
    ux /= l;
    uy /= l;
  }
  const p = power === undefined || power === null ? 1 : clamp(fin(power), 0, 1);
  let len = st.dashDist * (DASH.minPower + (1 - DASH.minPower) * p);

  // помощь в прицеливании: лучшая цель в узком секторе по направлению стика
  const a = Math.atan2(uy, ux);
  const mobs = room.mobs;
  let best = null;
  let bestScore = Infinity;
  let bestD = 0;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0) continue;
    const ex = m.x - P.x;
    const ey = m.y - P.y;
    const d = Math.hypot(ex, ey);
    if (d < 6 || d > len + DASH.assistExtra + m.r) continue;
    const off = Math.abs(angDiff(a, Math.atan2(ey, ex)));
    if (off > DASH.assistArc) continue;
    if (m.kind !== 0 && m.def.spiky && m.def.spiky(m, G, P.x, P.y)) continue;      // на колючего не наводим
    const score = off / DASH.assistArc + d / (len + 40) - (m.kind === 0 ? 0.35 : 0);
    if (score < bestScore) {
      best = m;
      bestScore = score;
      bestD = d;
    }
  }
  if (best) {
    ux = (best.x - P.x) / bestD;
    uy = (best.y - P.y) / bestD;
    if (bestD + 10 > len) len = bestD + 10;
  }

  const out = solveDash(room, P.x, P.y, ux, uy, len);
  if (!out.ok || out.len < DASH.minLen) return false;       // упёрлась в стену: заряд не тратится
  const D = P.dashBuf;
  D.t = 0;
  D.dur = dashTime(st, out.len);
  D.sx = P.x;
  D.sy = P.y;
  D.ex = out.x;
  D.ey = out.y;
  D.caught = 0;
  D.hits = 0;
  D.id = ++P.dashId;
  D.bounce = false;
  D.trail = 0;
  D.ux = ux;
  D.uy = uy;
  P.dash = D;
  P.charges -= 1;
  P.burst = 0;
  P.inv = Math.max(P.inv, D.dur + st.iframes);
  P.dir = Math.atan2(uy, ux);
  if (Math.abs(ux) > 0.15) P.face = ux > 0 ? 1 : -1;
  G.cnt.dashes += 1;
  emit(G, { t: 'dash', x1: D.sx, y1: D.sy, x2: D.ex, y2: D.ey });
  sfx(G, 'dash', P.x, P.y);
  haptic(G, 'light');
  preyDashAlert(G, D);
  return true;
}

function advanceDash(G, dt) {
  const P = G.player;
  const D = P.dash;
  D.t += dt;
  const k = D.t >= D.dur ? 1 : D.t / D.dur;
  const ox = P.x;
  const oy = P.y;
  P.x = D.sx + (D.ex - D.sx) * k;
  P.y = D.sy + (D.ey - D.sy) * k;
  P.z = DASH.height * Math.sin(Math.PI * k);
  P.vx = (P.x - ox) / dt;
  P.vy = (P.y - oy) / dt;
  if (!D.bounce) {
    if (sweep(G, ox, oy, P.x, P.y)) return;
    if (P.st.flags.fireTrail) {
      D.trail += Math.hypot(P.x - ox, P.y - oy);
      if (D.trail >= DASH.trailStep) {
        D.trail = 0;
        addZone(G, { shape: 'circle', x: P.x, y: P.y, r: DASH.trailR, t: 0.02, from: 0, dmg: 1, linger: DASH.trailTime, burn: DASH.trailBurn, look: 'fire' });
      }
    }
  }
  if (k >= 1) land(G);
}

// Что рывок задел на отрезке пути. true — налетели на колючего: рывок сменился отскоком (или лиса упала).
function sweep(G, x1, y1, x2, y2) {
  const P = G.player;
  const D = P.dash;
  const st = P.st;
  const f = st.flags;
  const room = G.room;
  const mobs = room.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || m.hide || m.inv > 0) continue;
    const rr = DASH.sweep + m.r;
    if (segDist2(x1, y1, x2, y2, m.x, m.y) > rr * rr) continue;
    if (m.kind === 0) {
      D.caught += 1;
      catchPrey(G, m, D.caught);
      if (D.caught === 1 && P.charges < st.dashCharges) {
        // поймала — заряд рывка возвращается сразу: можно охотиться цепочкой
        P.charges += 1;
        P.chargeT = 0;
      }
      continue;
    }
    if (m.hitBy === D.id) continue;
    m.hitBy = D.id;
    if (m.def.spiky && m.def.spiky(m, G, D.sx, D.sy)) {
      spikyBounce(G, m);
      return true;
    }
    const hit = hitOf('dash');
    hit.crit = rnd(G) < st.crit;
    hit.ax = D.ux;
    hit.ay = D.uy;
    hit.kx = D.ux * DASH.kb;
    hit.ky = D.uy * DASH.kb;
    hit.freeze = f.iceDash ? DASH.freeze : 0;
    hit.slow = f.slowDash ? DASH.slow : 0;
    hurtMob(G, m, st.dashDmg, hit);
    D.hits += 1;
  }
  // кусты под лапами
  for (let k = 0; k < 4; k++) {
    const i = tileIndex(room, x2 + (k & 1 ? 9 : -9), y2 + (k & 2 ? 9 : -9));
    if (i >= 0 && room.tiles[i] === TILE.BUSH) breakBush(G, i);
  }
  // пни заданий и мишени
  const things = room.things;
  for (let i = 0; i < things.length; i++) {
    const th = things[i];
    if (!th.breakable || th.broken) continue;
    const rr = DASH.sweep + th.r;
    if (segDist2(x1, y1, x2, y2, th.x, th.y) <= rr * rr) breakThing(G, th, 99);
  }
  return false;
}

function spikyBounce(G, m) {
  const P = G.player;
  const D = P.dash;
  const room = G.room;
  emit(G, { t: 'spiky', x: m.x, y: m.y });
  sfx(G, 'spiky', m.x, m.y);
  hurtPlayer(G, 1, m.x, m.y, 'spiky', true);
  if (G.over || P.down > 0 || !P.dash) return;
  // короткий отскок назад по своему же пути: там лиса уже пролетела
  const out = solveDash(room, P.x, P.y, -D.ux, -D.uy, DASH.bounceLen);
  let ex = out.x;
  let ey = out.y;
  if (!out.ok || circleHits(room, ex, ey, FOX_R, F_WALK)) {
    ex = D.sx;
    ey = D.sy;
  }
  D.sx = P.x;
  D.sy = P.y;
  D.ex = ex;
  D.ey = ey;
  D.t = 0;
  D.dur = DASH.bounceDur;
  D.bounce = true;
  P.inv = Math.max(P.inv, D.dur);
}

function land(G) {
  const P = G.player;
  const D = P.dash;
  const st = P.st;
  P.dash = null;
  P.z = 0;
  P.vx = 0;
  P.vy = 0;
  P.inv = Math.max(P.inv, st.iframes);
  if (D.bounce) setAct(P, 'hurt', POSE.hurt);
  else if (D.caught > 0) setAct(P, 'bite', POSE.bite);
  else setAct(P, 'land', POSE.land);
  emit(G, { t: 'land', x: P.x, y: P.y });
  sfx(G, 'land', P.x, P.y);
  if (!D.bounce && st.flags.shockwave) explode(G, P.x, P.y, DASH.shockR, DASH.shockDmg, 0, { kb: DASH.shockKb, look: 'fx.ring' });
}

// ---------- оружие ----------

// Ближайшая цель для выстрела: враг в пределах дальности, которого видно; нет врагов — добыча.
function autoAim(G, range) {
  const P = G.player;
  const room = G.room;
  const mobs = room.mobs;
  for (let pass = 0; pass < 2; pass++) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.dead || m.hide || m.inv > 0 || (m.kind === 0) !== (pass === 1)) continue;
      const d = (m.x - P.x) * (m.x - P.x) + (m.y - P.y) * (m.y - P.y);
      const reach = range + m.r;
      if (d > reach * reach || d >= bestD) continue;
      if (!hasLos(room, P.x, P.y, m.x, m.y)) continue;
      best = m;
      bestD = d;
    }
    if (best) return best;
  }
  return null;
}

function tryFire(G, input) {
  const P = G.player;
  const st = P.st;
  const item = G.inv.weapon;
  if (!item || P.wcd > 1e-9) return;
  const w = REG.WEAPONS[item.id];
  if (!w) return;
  const cost = weaponCost(w) * st.wCost;
  if (P.mana < cost - 1e-9) {
    if (P.nomanaT <= 0) {
      P.nomanaT = FOX.nomanaGap;
      emit(G, { t: 'nomana' });
      sfx(G, 'nomana', P.x, P.y);
    }
    return;
  }
  const range = (w.range ?? 260) * st.wRange;
  let tx;
  let ty;
  let ang;
  if (input.hasT) {
    tx = fin(input.tx);
    ty = fin(input.ty);
    ang = Math.atan2(ty - P.y, tx - P.x);
  } else {
    const m = autoAim(G, range);
    if (m) {
      tx = m.x;
      ty = m.y;
      ang = Math.atan2(ty - P.y, tx - P.x);
    } else {
      ang = P.dir;
      tx = P.x + Math.cos(ang) * range * 0.7;
      ty = P.y + Math.sin(ang) * range * 0.7;
    }
  }
  if (!fireWeapon(G, item, P.x, P.y, ang, tx, ty)) return;
  P.mana = Math.max(0, P.mana - cost);
  P.wcd = Math.max(P.wcd, -H) + (w.cd ?? 0.3) * st.wCd;
  P.dir = ang;
  if (Math.abs(Math.cos(ang)) > 0.15) P.face = Math.cos(ang) > 0 ? 1 : -1;
  setAct(P, 'fire', POSE.fire);
}

// ---------- урон ----------

/**
 * Удар по лисе: dmg сердец из точки (fromX, fromY). kind — откуда: 'touch' (касание зверя), 'shot', 'zone'
 * (красная зона), 'floor' (колючки), 'spiky'. Пока лиса неуязвима (после удара, в рывке, после возрождения),
 * удар не проходит — если не force. Порядок: оберег комнаты → уворот → щит → сердца. true — урон нанесён.
 */
export function hurtPlayer(G, dmg, fromX, fromY, kind = 'touch', force = false) {
  const P = G.player;
  const st = P.st;
  const f = st.flags;
  if (G.over || G.god || P.down > 0 || !(dmg > 0)) return false;
  if (P.inv > 0 && !force) return false;
  if (kind === 'zone' && st.hazardCut > 0) dmg = Math.max(1, dmg - st.hazardCut);
  if (!force) {
    if (P.blocks > 0) {
      P.blocks -= 1;
      P.inv = Math.max(P.inv, PERK.blockInv);
      emit(G, { t: 'block' });
      sfx(G, 'shield', P.x, P.y);
      floatText(G, P.x, P.y - 22, 'Оберег');
      return false;
    }
    if (st.dodge > 0 && rnd(G) < st.dodge) {
      P.inv = Math.max(P.inv, PERK.dodgeInv);
      emit(G, { t: 'block' });
      floatText(G, P.x, P.y - 22, 'Мимо');
      return false;
    }
  }
  const absorbed = Math.min(P.shield, dmg);
  const left = dmg - absorbed;
  P.shield -= absorbed;
  P.hp -= left;
  P.shieldT = 0;
  P.regenT = 0;
  P.inv = FOX.hurtInv;
  P.flash = POSE.flash;
  G.cnt.hurt += 1;
  if (!f.kbImmune && !P.dash) {
    const dx = P.x - (fromX ?? P.x);
    const dy = P.y - (fromY ?? P.y);
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      P.vx = (dx / d) * FOX.knock;
      P.vy = (dy / d) * FOX.knock;
    }
  }
  emit(G, { t: 'hurt', dmg: left, shield: absorbed, kind });
  if (left > 0) sfx(G, 'hurt', P.x, P.y);
  else sfx(G, 'shield', P.x, P.y);
  haptic(G, left > 0 ? 'heavy' : 'medium');
  shake(G, 0.4);
  setAct(P, 'hurt', POSE.hurt);
  if (f.sporeOnHit) {
    addZone(G, { shape: 'circle', x: P.x, y: P.y, r: PERK.sporeR, t: 0.02, from: 0, dmg: 1, linger: PERK.sporeTime, poison: PERK.sporePoison, look: 'poison' });
  }
  if (P.hp <= 0) loseLife(G);
  return true;
}

// «Перо жар-птицы» сгорает и поднимает лису на месте
function consumeRevive(G) {
  const acc = G.inv.acc;
  for (let i = 0; i < acc.length; i++) {
    if (acc[i] && REG.ACCESSORIES[acc[i].id]?.flags?.revive) {
      acc[i] = null;
      return true;
    }
  }
  if (!G.flags.revived) {
    G.flags.revived = true;                 // флаг пришёл не от вещи (дар): тоже один раз за партию
    return true;
  }
  return false;
}

function loseLife(G) {
  const P = G.player;
  const st = P.st;
  if (st.flags.revive && consumeRevive(G)) {
    recalc(G);
    P.hp = P.st.maxHp;
    P.inv = FOX.reviveInv;
    floatText(G, P.x, P.y - 22, 'Вторая жизнь');
    sfx(G, 'respawn', P.x, P.y);
    emit(G, { t: 'ui' });
    return;
  }
  G.lives -= 1;
  P.hp = 0;
  P.dash = null;
  P.z = 0;
  P.vx = 0;
  P.vy = 0;
  P.burst = 0;
  P.aim = null;
  P.act = 'down';
  P.actT = 0;
  P.k = 0;
  emit(G, { t: 'life', lives: G.lives });
  sfx(G, 'die', P.x, P.y);
  haptic(G, 'error');
  if (G.lives <= 0) {
    G.lives = 0;
    G.over = true;
    emit(G, { t: 'over' });
    sfx(G, 'gameover');
    return;
  }
  P.down = FOX.respawnTime;
}

function respawn(G) {
  const P = G.player;
  const st = P.st;
  const room = G.room;
  const den = nearestOf(room.dens, P.x, P.y) ?? room.center;
  P.x = den.x;
  P.y = den.y;
  P.px = den.x;
  P.py = den.y;
  P.down = 0;
  P.hp = st.maxHp;
  P.inv = FOX.respawnInv;
  P.z = 0;
  P.actT = 0;
  setAct(P, 'rise', POSE.rise);
  clearZones(room, 1);                       // всё, что целилось в лису, отменяется
  updateFlow(room, P.x, P.y);
  emit(G, { t: 'respawn', x: P.x, y: P.y });
  sfx(G, 'respawn', P.x, P.y);
  if (st.flags.secondWind) {
    addEffect(G, 'haste', FOX.windTime);
    addEffect(G, 'wind', FOX.windTime);
  }
}
