// Звери «Лисьей охоты», часть третья: враги осенней чащи — охотник, гончая, чёрный лис, пугало — и зубастый
// сундук, который встречается где угодно. Формат записи и разобранный пример — в начале mobs.js, готовые
// действия для think — в начале ai.js.
//
// Осенняя чаща — пятая локация, и дерутся здесь по-новому: никто из этих зверей не кусает касанием (touch: 0).
// Каждый удар сперва показан красной зоной — не меньше полсекунды, а у вожака, который бьёт на два, не меньше
// 0,8 с. Колючих тут нет: рывок сквозь любого из них безопасен.
//   охотник    — стрелок: тонкая красная линия на 0,9 с, потом быстрая пуля по ней. Медленный, пятится от
//                лисы, а рывок в него (или оглушение) сбивает прицел — вблизи он почти беспомощен;
//   гончая     — очень быстрая и хлипкая, приходит по три. Кружит рядом и бросается наперерез по короткой
//                полосе; бросаются по очереди, а после броска переводят дух;
//   чёрный лис — соперник: бьёт рывком, как сама лиса, и в рывке его не задеть; от выстрелов иногда
//                отпрыгивает вбок. Раненый отдыхает меньше;
//   пугало     — вкопано: кидает тыквы туда, куда лиса бежит, а каждый третий раз — вторую следом, в неё саму;
//   зубастый сундук — спит под видом сундука, пока его не разбудит место, потом скачет за лисой, кусает перед
//                собой и прыгает сверху; из него падает хорошая вещь.
//
// Как устроен удар с прыжком (гончая, лис, сундук): бьёт красная зона, а зверь прыгает так, чтобы прилететь к
// самому её удару, — зона живёт «замах + полёт» секунд, прыжок занимает последние. Зверь погиб, оглушён или
// заморожен посреди замаха — зона снимается, удара не будет; очнувшись, он начинает заново (см. held).
// Куда направлен удар, лежит в m.data.a (радианы) — как у кабана и медведя: по нему рисунок целит ружьё и морду.
//
// ── ЗУБАСТЫЙ СУНДУК И МЕСТО «СУНДУК» ─────────────────────────────────────────────────────────────────────────
// Сундук появляется спящим: поза 'sleep' (рисуется как закрытый сундук), его не задеть и не выбрать целью
// (m.hide), сам он ничего не делает. Разбудить можно двумя способами — месту годится любой:
//   1) поставить и сразу начать бой:
//        spawnMob(G, 'mimic', x, y, { warm: 0 });       // warm: 0 — сразу стоит «сундуком», без метки появления
//        startFight(G);                                  // двери закрылись — он просыпается сам
//   2) поставить заранее (спит сколько угодно, двери открыты) и разбудить, когда пора:
//        import { wakeMimic } from './mobs3.js';
//        const m = spawnMob(G, 'mimic', x, y, { warm: 0 });
//        …
//        if (wakeMimic(m, G)) startFight(G);             // true — проснулся
// Проснувшись: 'reveal' 0,6 с (крышка распахивается; уже уязвим, ещё не опасен), дальше скачет и кусает.
// Спящий сундук никогда не держит двери запертыми: начался бой — он проснётся и без wakeMimic.

import { H, F_WALK, F_LEAP, F_SHOT, F_MOB, clamp, emit, sfx } from './core.js';
import { MOB } from './balance.js';
import { castRay, solveDash, circleHits, cancelZonesOf, addPick } from './world.js';
import { fireShot, lobShot } from './combat.js';
import { rollItem } from './inventory.js';
import { ACTS } from './ai.js';

// ---------- числа ----------

const ELITE_WARN = 0.8;                     // удар на два сердца предупреждает не меньше этого
const SHOW = Object.freeze({ dmg: 0 });     // зона только показывает: бить будет пуля

const HUNTER = Object.freeze({
  near: 92,                                 // лиса ближе — пятится
  min: 170, max: 250,                       // на каком расстоянии держится
  far: 430,                                 // дальше не стреляет
  walk: 50, run: 76,                        // шагом и пятясь: лиса ходит 132, догнать его легко
  laser: 0.9,                               // сколько горит красная линия
  width: 20,                                // её ширина — ровно во столько пуля и задевает
  recoil: 0.28,                             // отдача после выстрела
  shaken: 0.7,                              // сбили прицел — столько приходит в себя
  jolt: 14,                                 // оттолкнули дальше этого, пока целился, — выстрел сорван
});
const BULLET = Object.freeze({ look: 'shot.orb', v: 4, speed: 720, r: 3, range: 960 });

const HOUND = Object.freeze({
  speed: 176, circle: 150,                  // бегом к лисе и по кругу возле неё
  ring: 64,                                 // на каком расстоянии кружит
  sniff: 104,                               // с какого бросается
  lead: 0.5,                                // на сколько секунд вперёд метит: бросается наперерез
  over: 30, min: 64, max: 108,              // бросок: на столько дальше цели; не короче и не длиннее
  width: 22,
  wait: 0.5, fly: 0.14,                     // присела — и летит
  rest: 0.5,                                // после броска переводит дух: лучшее время для рывка
});

const DFOX = Object.freeze({
  speed: 116, min: 88, max: 150,            // кружит на таком расстоянии
  start: 124,                               // с какого начинает рывок: пролетает сквозь лису и дальше
  lead: 0.25,
  len: 156, width: 26,                      // рывок — как у самой лисы
  wait: 0.55, fly: 0.17,
  rest: 0.55, angry: 0.34,                  // отдых после рывка: целый и раненый (меньше половины здоровья)
  see: 0.28, soon: 0.09,                    // выстрел замечает за столько секунд до попадания; ближе — уже не успеть
  hop: 46, hopT: 0.16,                      // отскок вбок
  luck: 0.6,                                // с каким шансом успевает отпрыгнуть
  blink: 0.6,                               // прозевал — столько секунд не пробует снова
});

const SCARE = Object.freeze({
  range: 340,                               // докуда добрасывает
  wind: 0.5,                                // замах
  lead: 0.76,                               // на сколько секунд вперёд метит: чуть меньше, чем летит тыква
  again: 0.5,                               // замах перед второй тыквой
  swing: 0.3,
  pair: 3,                                  // каждый какой бросок — двойной
});
const PUMPKIN = Object.freeze({ look: 'shot.pumpkin', radius: 34, time: 0.95, arc: 58, spin: true });

const MIMIC = Object.freeze({
  speed: 86,
  close: 34,                                // ближе к лисе не подходит
  reveal: 0.6,                              // сколько распахивает крышку
  bite: 54, reach: 56, arc: 2,              // укус: с какого расстояния начинает; радиус и раствор красного сектора
  gape: 0.55, snap: 0.22,
  jumpMin: 96, jumpMax: 176, lead: 0.3,     // прыжок сверху: с какого расстояния и на сколько вперёд метит
  crouch: 0.6, fly: 0.36, slam: 36,         // присел, летит, радиус круга там, куда упадёт
  rest: 0.75,                               // после удара стоит — его можно бить
});
const LOOT_RARE = Object.freeze({ minRarity: 1 });
const LOOT_EPIC = Object.freeze({ minRarity: 2 });

// ---------- общее ----------

/** Сколько предупреждать: вожак бьёт на два сердца — ему положено не меньше 0,8 с. */
const warned = (m, t) => (m.elite ? Math.max(t, ELITE_WARN) : t);

/** Повернуть морду по углу удара (а не к лисе: она за время замаха могла перебежать). */
function turn(m, a) {
  const c = Math.cos(a);
  if (c > 0.1) m.face = 1;
  else if (c < -0.1) m.face = -1;
}

/**
 * «Мысль» зовут каждый шаг — кроме шагов, когда зверь оглушён, заморожен или летит в прыжке. Вернулась после
 * пропуска посреди замаха — значит, зверя держали: красная зона могла уже отгореть, а бить без неё нельзя.
 * true — шаги были пропущены. Звать первой строкой think.
 */
function held(m, G) {
  const was = m.data.at;
  m.data.at = G.time;
  return was >= 0 && G.time - was > H * 1.5;
}

/** Замах сорван: предупреждение снять и начать заново из состояния state через cd секунд. */
function spoil(m, G, ai, state, cd) {
  cancelZonesOf(G.room, m.uid);
  m.cd = cd;
  ai.go(m, state);
}

/** onHurt: оглушили или заморозили — красная зона гаснет сразу, а не бьёт за того, кто ударить уже не может. */
function stagger(m, G, hit) {
  if (hit.stun > 0 || hit.freeze > 0) cancelZonesOf(G.room, m.uid);
}

/** Есть ли в комнате другой такой же зверь в состоянии state: замахиваются по очереди, а не все разом. */
function other(G, m, state) {
  const mobs = G.room.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const o = mobs[i];
    if (o !== m && !o.dead && o.id === m.id && o.state === state) return true;
  }
  return false;
}

/**
 * Запомнить бросок под углом a на длину want — до первого дерева или стены (низкое зверь перелетает, как лиса).
 * false — места для броска меньше least.
 */
function lockRun(m, G, a, want, least) {
  const len = want * castRay(G.room, m.x, m.y, m.x + Math.cos(a) * want, m.y + Math.sin(a) * want, F_LEAP);
  if (len < least) return false;
  m.data.a = a;
  m.data.len = len;
  return true;
}

/** Прыгнуть по запомненному броску — к удару своей зоны. Прыгать стало некуда — зона снимается: удара не будет. */
function runLock(m, G, ai, fly, height, act) {
  if (ai.leap(m, G, m.x + Math.cos(m.data.a) * m.data.len, m.y + Math.sin(m.data.a) * m.data.len, fly, height, act)) return true;
  cancelZonesOf(G.room, m.uid);
  return false;
}

// ---------- чёрный лис: отскок от выстрела ----------

// Летит ли в лиса выстрел лисы или её спутника. Да — угол, под которым отпрыгнуть вбок с его пути; нет — null.
// Броски навесом, капканы и мгновенные лучи не в счёт: от них не отпрыгнешь.
function dodgeAngle(m, G) {
  const shots = G.room.shots;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.from === 1 || s.lob || s.ghost || s.mode === 3 || !(s.dmg > 0)) continue;
    const v2 = s.vx * s.vx + s.vy * s.vy;
    if (v2 < 400) continue;
    const rx = m.x - s.x;
    const ry = m.y - s.y;
    const t = (rx * s.vx + ry * s.vy) / v2;                 // через сколько секунд снаряд будет ближе всего
    if (t < DFOX.soon || t > DFOX.see) continue;
    const ox = rx - s.vx * t;
    const oy = ry - s.vy * t;
    const hit = s.r + m.r + 5;
    if (ox * ox + oy * oy > hit * hit) continue;
    // с какой стороны от пути снаряда стоит лис — туда и прыгать
    const side = s.vx * ry - s.vy * rx >= 0 ? 1 : -1;
    return Math.atan2(s.vx * side, -s.vy * side);
  }
  return null;
}

// Отпрыгнуть от выстрела — если заметил, повезло и есть куда. true — прыгнул.
function sidestep(m, G, ai) {
  const a = dodgeAngle(m, G);
  if (a === null) return false;
  const dx = Math.cos(a) * DFOX.hop;
  const dy = Math.sin(a) * DFOX.hop;
  if (!ai.chance(G, DFOX.luck) || (!ai.leap(m, G, m.x + dx, m.y + dy, DFOX.hopT, 8, 'dash') && !ai.leap(m, G, m.x - dx, m.y - dy, DFOX.hopT, 8, 'dash'))) {
    m.data.dcd = DFOX.blink;
    return false;
  }
  m.data.dcd = ai.rand(G, 1.5, 2.4);
  return true;
}

// ---------- пугало: бросок ----------

// Тыква навесом: красный круг там, куда она упадёт, горит всё время полёта. ahead — на сколько секунд вперёд метить.
function toss(m, G, ai, ahead) {
  const p = ai.lead(m, G, ahead);
  const x = p.x;
  const y = p.y;
  m.data.a = Math.atan2(y - m.y, x - m.x);
  if (!lobShot(G, 1, m.x, m.y, x, y, PUMPKIN, m.elite ? MOB.eliteDmg : 1, m.uid)) return;
  emit(G, { t: 'shot', look: PUMPKIN.look, x: m.x, y: m.y, a: m.data.a, from: 1 });
  sfx(G, 'lob', m.x, m.y);
}

// ---------- зубастый сундук ----------

// Проснуться: крышка распахивается, с этого мига его можно бить.
function rouse(m, G) {
  m.hide = false;
  sfx(G, 'growl', m.x, m.y);
  ACTS.go(m, 'reveal');
}

/**
 * Разбудить спящий зубастый сундук m (зовёт место «Сундук» — см. начало файла). true — проснулся; false — это не
 * спящий сундук (не тот зверь, уже проснулся или погиб).
 */
export function wakeMimic(m, G) {
  if (!m || m.dead || m.id !== 'mimic' || m.state !== 'sleep') return false;
  rouse(m, G);
  return true;
}

// Куда сундук допрыгнет: точка на пути к лисе, где можно встать. false — прыгать некуда или слишком близко.
function lockJump(m, G, ai) {
  const p = ai.lead(m, G, MIMIC.lead);
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy);
  if (d < MIMIC.jumpMin) return false;
  const r = Math.min(m.r, 12);
  const out = solveDash(G.room, m.x, m.y, dx / d, dy / d, Math.min(d, MIMIC.jumpMax), r);
  if (!out.ok || out.len < MIMIC.jumpMin * 0.6 || circleHits(G.room, out.x, out.y, r, F_WALK | F_MOB)) return false;
  m.data.a = Math.atan2(dy, dx);
  m.data.tx = out.x;
  m.data.ty = out.y;
  return true;
}

// ---------- звери ----------

export const MOBS3 = {
  hunter: {
    name: 'Охотник', kind: 'hostile', biome: 'autumn',
    hp: 6, r: 10, pts: 5, cost: 5, touch: 0, coins: [2, 4], mass: 1.3, accel: 6, minFloor: 5, intro: 1,
    init(m) {
      m.data.at = -1;
      m.data.a = 0;                         // куда целится
      m.data.sx = m.x;                      // откуда пойдёт пуля: где стоял, когда зажёг линию
      m.data.sy = m.y;
      m.data.off = 0;                       // прицел сбит
    },
    // рывок в охотника сбивает прицел (как и оглушение с заморозкой): красная линия гаснет, выстрела не будет
    onHurt(m, G, hit) {
      if (m.state !== 'aim' || (hit.kind !== 'dash' && !(hit.stun > 0) && !(hit.freeze > 0))) return;
      cancelZonesOf(G.room, m.uid);
      m.data.off = 1;
    },
    think(m, G, dt, ai) {
      const skipped = held(m, G);
      if (m.state === '') {
        m.cd = ai.rand(G, 0.8, 1.6);
        ai.go(m, 'stalk');
      }
      if (m.state === 'stalk') {
        const d = ai.dist(m, G);
        const seen = ai.los(m, G);
        // лиса рядом — пятится; не видно её — выходит на прямую; иначе держится поодаль
        if (d < HUNTER.near) ai.flee(m, G, HUNTER.run);
        else if (!seen) ai.chase(m, G, HUNTER.walk);
        else ai.keepRange(m, G, HUNTER.min, HUNTER.max, HUNTER.walk);
        if (m.cd <= 0 && seen && d <= HUNTER.far && !ai.foxDown(G) && !other(G, m, 'aim')) {
          m.data.off = 0;
          ai.go(m, 'aim');
        }
      } else if (m.state === 'aim') {
        const wait = ai.tele(G, HUNTER.laser);
        ai.stop(m);
        if (skipped || m.data.off || ai.foxDown(G) || (m.t > 0 && Math.hypot(m.x - m.data.sx, m.y - m.data.sy) > HUNTER.jolt)) {
          m.data.off = 0;
          spoil(m, G, ai, 'shaken', ai.rand(G, 1, 1.6));
          return;
        }
        if (m.t === 0) {
          // красная линия до первой стены: по ней и полетит пуля. Сама линия не бьёт
          const a = ai.angle(m, G);
          m.data.a = a;
          m.data.sx = m.x;
          m.data.sy = m.y;
          const len = BULLET.range * castRay(G.room, m.x, m.y, m.x + Math.cos(a) * BULLET.range, m.y + Math.sin(a) * BULLET.range, F_SHOT);
          ai.lane(m, G, a, len, HUNTER.width, HUNTER.laser, SHOW);
        }
        turn(m, m.data.a);
        ai.pose(m, 'windup', m.t / wait);
        if (m.t >= wait) {
          // пуля идёт оттуда, где горела линия, — даже если охотника чуть подвинули
          if (fireShot(G, 1, m.data.sx, m.data.sy, m.data.a, BULLET, m.elite ? MOB.eliteDmg : 1, m.uid)) {
            emit(G, { t: 'shot', look: BULLET.look, x: m.data.sx, y: m.data.sy, a: m.data.a, from: 1 });
            sfx(G, 'heavy', m.x, m.y);
          }
          m.cd = ai.rand(G, 2.2, 3.2);
          ai.go(m, 'shot');
        }
      } else if (m.state === 'shot') {
        ai.stop(m);
        turn(m, m.data.a);
        ai.pose(m, 'attack', m.t / HUNTER.recoil);
        if (m.t >= HUNTER.recoil) ai.go(m, 'stalk');
      } else {
        // 'shaken': прицел сбили — приходит в себя; самое время добить
        ai.stop(m);
        ai.pose(m, 'recover', m.t / HUNTER.shaken);
        if (m.t >= HUNTER.shaken) ai.go(m, 'stalk');
      }
    },
  },

  hound: {
    name: 'Гончая', kind: 'hostile', biome: 'autumn',
    hp: 2, r: 9, pts: 2, cost: 2, touch: 0, coins: [0, 1], mass: 0.8, accel: 8, pack: [3, 3], minFloor: 5, intro: 0, weight: 1.2,
    // свои позы: 'leap' — бросок с укусом
    init(m) {
      m.data.at = -1;
      m.data.a = 0;                         // куда бросится
      m.data.len = 0;                       // и на сколько
    },
    onHurt: stagger,
    think(m, G, dt, ai) {
      const skipped = held(m, G);
      if (m.state === '') {
        m.cd = ai.rand(G, 0.4, 1.4);
        ai.go(m, 'run');
      }
      if (m.state === 'run') {
        const d = ai.dist(m, G);
        const seen = ai.los(m, G);
        if (!seen || d > HOUND.ring * 2) ai.chase(m, G, HOUND.speed);
        else ai.orbit(m, G, HOUND.ring, HOUND.circle);
        if (m.cd <= 0 && seen && d < HOUND.sniff && !ai.foxDown(G) && !other(G, m, 'crouch')) {
          // наперерез: туда, где лиса окажется, и чуть дальше
          const p = ai.lead(m, G, HOUND.lead);
          const far = Math.hypot(p.x - m.x, p.y - m.y);
          if (lockRun(m, G, Math.atan2(p.y - m.y, p.x - m.x), clamp(far + HOUND.over, HOUND.min, HOUND.max), HOUND.min * 0.5)) ai.go(m, 'crouch');
        }
      } else if (m.state === 'crouch') {
        const t = warned(m, HOUND.wait);
        const wait = ai.tele(G, t);
        ai.stop(m);
        turn(m, m.data.a);
        ai.pose(m, 'windup', m.t / wait);
        if (skipped || ai.foxDown(G)) spoil(m, G, ai, 'rest', 0.8);
        else if (m.t === 0) {
          ai.lane(m, G, m.data.a, m.data.len, HOUND.width, t + HOUND.fly);
          ai.sfx(G, 'growl', m.x, m.y);
        } else if (m.t >= wait) {
          ai.go(m, 'bite');
          runLock(m, G, ai, HOUND.fly, 7, 'leap');
        }
      } else if (m.state === 'bite') {
        // приземлилась (или прыгать было некуда): кусает красная полоса — ровно в этот миг
        ai.stop(m);
        ai.pose(m, 'attack', m.t / HOUND.fly);
        if (m.t >= HOUND.fly) {
          m.cd = ai.rand(G, 1.2, 2);
          ai.go(m, 'rest');
        }
      } else {
        // 'rest': переводит дух
        ai.stop(m);
        ai.pose(m, 'recover', m.t / HOUND.rest);
        if (m.t >= HOUND.rest) ai.go(m, 'run');
      }
    },
  },

  darkfox: {
    name: 'Чёрный лис', kind: 'hostile', biome: 'autumn',
    hp: 9, r: 10, pts: 6, cost: 6, touch: 0, coins: [3, 5], accel: 12, minFloor: 5, intro: 3, weight: 0.6,
    // свои позы: 'dash' — рывок (и отскок вбок от выстрела)
    init(m) {
      m.data.at = -1;
      m.data.a = 0;
      m.data.len = 0;
      m.data.fly = 0;                       // летит в рывке: не задеть
      m.data.dcd = 0;                       // когда снова сможет отпрыгнуть от выстрела
    },
    onHurt(m, G, hit) {
      if (m.data.fly) return false;         // в рывке его не задеть — как и саму лису
      return stagger(m, G, hit);
    },
    think(m, G, dt, ai) {
      const skipped = held(m, G);
      m.data.fly = 0;                       // «мысль» вернулась — значит, приземлился
      if (m.data.dcd > 0) m.data.dcd -= dt;
      if (m.state === '') {
        m.cd = ai.rand(G, 1, 1.8);
        ai.go(m, 'stalk');
      }
      if (m.state === 'stalk') {
        // кружит поодаль; готов к рывку — подходит на его длину
        const d = ai.keepRange(m, G, DFOX.min, m.cd <= 0 ? DFOX.start - 12 : DFOX.max, DFOX.speed);
        if (m.data.dcd <= 0 && sidestep(m, G, ai)) return;
        if (m.cd <= 0 && d < DFOX.start && ai.los(m, G) && !ai.foxDown(G) && !other(G, m, 'aim')) {
          // через лису и дальше, на всю длину рывка
          const p = ai.lead(m, G, DFOX.lead);
          if (lockRun(m, G, Math.atan2(p.y - m.y, p.x - m.x), DFOX.len, DFOX.len * 0.4)) ai.go(m, 'aim');
        }
      } else if (m.state === 'aim') {
        // припал к земле, как лиса перед рывком; пока целится — от выстрелов не уходит
        const t = warned(m, DFOX.wait);
        const wait = ai.tele(G, t);
        ai.stop(m);
        turn(m, m.data.a);
        ai.pose(m, 'windup', m.t / wait);
        if (skipped || ai.foxDown(G)) spoil(m, G, ai, 'land', 1);
        else if (m.t === 0) {
          ai.lane(m, G, m.data.a, m.data.len, DFOX.width, t + DFOX.fly);
          ai.sfx(G, 'growl', m.x, m.y);
        } else if (m.t >= wait) {
          m.cd = ai.hp(m) <= 0.5 ? ai.rand(G, 1, 1.6) : ai.rand(G, 1.7, 2.5);
          ai.go(m, 'land');
          if (runLock(m, G, ai, DFOX.fly, 10, 'dash')) m.data.fly = 1;
        }
      } else {
        // 'land': приземлился и замер — тут его и бить
        const rest = ai.hp(m) <= 0.5 ? DFOX.angry : DFOX.rest;
        ai.stop(m);
        ai.pose(m, 'recover', m.t / rest);
        if (m.t >= rest) ai.go(m, 'stalk');
      }
    },
  },

  scarecrow: {
    name: 'Пугало', kind: 'hostile', biome: 'autumn',
    hp: 8, r: 11, pts: 4, cost: 4, touch: 0, coins: [1, 3], mass: 30, minFloor: 5, intro: 2, weight: 0.8,
    init(m) {
      m.data.at = -1;
      m.data.hx = m.x;                      // где вкопано
      m.data.hy = m.y;
      m.data.n = 0;                         // сколько бросков сделано
      m.data.a = 0;
    },
    think(m, G, dt, ai) {
      const skipped = held(m, G);
      // вкопано: сдвинули (рывком, взрывом, другим зверем) — возвращается на своё место
      const hx = m.data.hx - m.x;
      const hy = m.data.hy - m.y;
      const off = Math.hypot(hx, hy);
      if (off > 1) ai.move(m, Math.atan2(hy, hx), off > 12 ? 60 : 6);
      else ai.stop(m);
      if (m.state === '') {
        m.cd = ai.rand(G, 0.8, 1.8);
        ai.go(m, 'watch');
      }
      if (m.state === 'watch') {
        ai.face(m, G);
        if (m.flash <= 0) ai.pose(m, 'idle');
        if (m.cd <= 0 && ai.near(m, G, SCARE.range) && !ai.foxDown(G)) ai.go(m, 'windup');
      } else if (m.state === 'windup' || m.state === 'again') {
        // замах; 'again' — перед второй тыквой двойного броска: она летит туда, где лиса сейчас
        const second = m.state === 'again';
        const wind = second ? SCARE.again : SCARE.wind;
        ai.face(m, G);
        ai.pose(m, 'windup', m.t / wind);
        if (skipped || ai.foxDown(G)) {
          m.cd = 0.4;
          ai.go(m, 'watch');
        } else if (m.t >= wind) {
          if (!second) m.data.n += 1;
          toss(m, G, ai, second ? 0 : SCARE.lead);
          ai.go(m, !second && m.data.n % SCARE.pair === 0 ? 'again' : 'throw');
        }
      } else {
        // 'throw': рука пошла вперёд
        ai.pose(m, 'attack', m.t / SCARE.swing);
        if (m.t >= SCARE.swing) {
          m.cd = ai.rand(G, 2.3, 3.1);
          ai.go(m, 'watch');
        }
      }
    },
  },

  mimic: {
    // место (биом) — для порядка: в волны сундук не ходит (wave: false), его ставит место «Сундук» на любой локации
    name: 'Зубастый сундук', kind: 'hostile', biome: 'autumn',
    hp: 12, r: 12, pts: 4, cost: 4, touch: 0, coins: [6, 10], mass: 2.4, accel: 9, wave: false,
    drops: [{ kind: 'heart', v: 1 }],
    // свои позы: 'sleep' — притворяется сундуком; 'reveal' — крышка распахивается в зубастую пасть
    init(m) {
      m.data.at = -1;
      m.data.a = 0;
      m.data.tx = m.x;                      // куда прыгнет
      m.data.ty = m.y;
      m.state = 'sleep';
      m.act = 'sleep';
      m.hide = true;                        // спит: не задеть и не выбрать целью
    },
    onHurt: stagger,
    // вещь на ступень реже, чем из обычного сундука: редкая, а с третьей локации — эпическая
    onDie(m, G) {
      if (m.noLoot) return;
      const it = rollItem(G, G.floor >= 3 ? LOOT_EPIC : LOOT_RARE);
      if (it) addPick(G, 'item', m.x, m.y, 1, it.id, 0);
    },
    think(m, G, dt, ai) {
      const skipped = held(m, G);
      if (m.state === 'sleep') {
        ai.stop(m);
        ai.pose(m, 'sleep');
        // двери закрыты — идёт бой: спящий сундук просыпается сам, иначе комната не откроется никогда
        if (!G.room.open) rouse(m, G);
      } else if (m.state === 'reveal') {
        ai.stop(m);
        ai.face(m, G);
        ai.pose(m, 'reveal', m.t / MIMIC.reveal);
        if (m.t >= MIMIC.reveal) {
          m.cd = ai.rand(G, 0.3, 0.7);
          ai.go(m, 'hop');
        }
      } else if (m.state === 'hop') {
        // скачет за лисой (вплотную не лезет — встаёт рядом); вблизи кусает, издали прыгает сверху
        const d = ai.dist(m, G);
        if (d > MIMIC.close) ai.chase(m, G, MIMIC.speed);
        else {
          ai.stop(m);
          ai.face(m, G);
        }
        if (m.cd > 0 || ai.foxDown(G)) return;
        if (d < MIMIC.bite) {
          if (ai.los(m, G)) {
            m.data.a = ai.angle(m, G);
            ai.go(m, 'gape');
          }
        } else if (d < MIMIC.jumpMax + 40 && lockJump(m, G, ai)) ai.go(m, 'crouch');
      } else if (m.state === 'gape') {
        // пасть нараспашку: красный сектор перед ним, потом щёлк
        const t = warned(m, MIMIC.gape);
        const wait = ai.tele(G, t);
        ai.stop(m);
        turn(m, m.data.a);
        ai.pose(m, 'windup', m.t / wait);
        if (skipped || ai.foxDown(G)) spoil(m, G, ai, 'tired', 1);
        else if (m.t === 0) {
          ai.cone(m, G, m.data.a, MIMIC.reach, MIMIC.arc, t);
          ai.sfx(G, 'growl', m.x, m.y);
        } else if (m.t >= wait) ai.go(m, 'snap');
      } else if (m.state === 'snap') {
        ai.stop(m);
        ai.pose(m, 'attack', m.t / MIMIC.snap);
        if (m.t >= MIMIC.snap) {
          m.cd = ai.rand(G, 1.4, 2);
          ai.go(m, 'tired');
        }
      } else if (m.state === 'crouch') {
        // присел: красный круг там, куда упадёт
        const t = warned(m, MIMIC.crouch);
        const wait = ai.tele(G, t);
        ai.stop(m);
        turn(m, m.data.a);
        ai.pose(m, 'windup', m.t / wait);
        if (skipped || ai.foxDown(G)) spoil(m, G, ai, 'tired', 1);
        else if (m.t === 0) ai.circle(m, G, m.data.tx, m.data.ty, MIMIC.slam, t + MIMIC.fly);
        else if (m.t >= wait) {
          m.cd = ai.rand(G, 2, 2.8);
          ai.go(m, 'tired');
          // прыгать стало некуда (оттолкнули к стене) — круг снимается: без сундука он не бьёт
          if (!ai.leap(m, G, m.data.tx, m.data.ty, MIMIC.fly, 26, 'attack')) cancelZonesOf(G.room, m.uid);
        }
      } else {
        // 'tired': после удара стоит и отдувается — окно для рывков
        ai.stop(m);
        ai.pose(m, 'recover', m.t / MIMIC.rest);
        if (m.t >= MIMIC.rest) ai.go(m, 'hop');
      }
    },
  },
};
