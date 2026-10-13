// Звери «Лисьей охоты», часть вторая: враги зимнего бора — волк, рысь, росомаха — и пещер — летучая мышь, паук,
// крот, жук-камнеед. Только описания — двигает, бьёт и считает движок. Звери леса и болота описаны в mobs.js,
// осенней чащи — в mobs3.js: файлов несколько лишь затем, чтобы их не правили разом. Формат записи тот же, что
// в mobs.js (там перечислены все поля), а полный список готовых действий для think — в начале ai.js.
//
// Запись — { id: описание }. id не должен повторять id из других файлов зверей и из bosses.js (о повторе
// content.js скажет ошибкой при запуске). Пример с разбором — стрелок, который держит расстояние (это только
// пример: сама гадюка описана в mobs.js, сюда её не добавлять):
//
//   snake: {
//     name: 'Гадюка', kind: 'hostile',
//     biome: 'swamp',          // в каком месте живёт: 'forest' | 'swamp' | 'taiga' | 'cave' | 'autumn'
//     hp: 5, r: 9,             // здоровье на первой локации (дальше растёт само) и радиус
//     pts: 2, cost: 2,         // очки за убийство и «цена» в бюджете волны
//     touch: 1,                // урон лисе при касании (0 — сам не кусается)
//     coins: [1, 2],           // монеты из убитого: от и до
//     minFloor: 2,             // с какой локации встречается (по желанию)
//     // по желанию ещё: mass, flying, accel, intro, weight, pack: [от, до], wave: false, drops, init, onHurt, onDie, spiky
//     // свои позы: 'spit' — плюёт
//     think(m, G, dt, ai) {
//       if (m.state === '') {                       // первое состояние
//         m.cd = ai.rand(G, 1, 2);
//         ai.go(m, 'stalk');
//       }
//       if (m.state === 'stalk') {
//         ai.keepRange(m, G, 110, 170, 60);         // не ближе 110 и не дальше 170 от лисы, обходя по кругу
//         if (m.cd <= 0 && ai.los(m, G)) ai.go(m, 'aim');
//       } else {                                    // 'aim': замах, который игрок должен успеть увидеть
//         ai.stop(m);
//         ai.face(m, G);
//         ai.pose(m, 'windup', m.t / 0.5);
//         if (m.t >= 0.5) {
//           ai.shoot(m, G, ai.angle(m, G), { look: 'shot.orb', v: 3, speed: 150, r: 5, range: 320 });
//           m.cd = ai.rand(G, 1.8, 2.6);            // пауза до следующего плевка
//           ai.go(m, 'stalk');
//         }
//       }
//     },
//   }
//
// Что нужно помнить:
//   • m.t — секунды в текущем состоянии (в первый шаг состояния ровно 0 — удобно для «сделать один раз»);
//     m.cd — счётчик, который движок сам уменьшает; m.data — свои числа; m.hide = true — спрятался (не задеть);
//   • красная зона с предупреждением: ai.lane / ai.circle / ai.cone / ai.ring — и ждать не свою константу, а
//     ai.tele(G, t): у лисы бывает вещь, с которой зоны видны раньше;
//   • случайность — только ai.rnd / ai.rand / ai.chance / ai.randInt; звук — ai.sfx(G, 'spit', m.x, m.y);
//   • картинки снарядов (look) и имена звуков — из общего списка игры; чего нет в списке — не нарисуют и не сыграют.
//
// ── КАК ДЕРУТСЯ ЗВЕРИ ЭТОГО ФАЙЛА ────────────────────────────────────────────────────────────────────────────
// У всех семи одни правила — чтобы каждый удар игрок успевал увидеть:
//   • касание не ранит (touch: 0). Урон — только от удара, о котором предупредили поза 'windup' и красная зона;
//   • предупреждение — не короче 0,5 с, а у вожака (он бьёт на два сердца) — не короче 0,8 с: warnOf;
//   • нет зоны — нет удара. Предупреждение пропало раньше срока (лиса потеряла жизнь и встала, зверя сбили
//     рывком или заморозили) или зверь его «проспал» оглушённым — удар отменяется: spoiled;
//   • бросок по прямой (волк, рысь) бьёт не всей полосой разом: по ней вместе со зверем бежит «тело» (run у
//     зоны), и достаётся лишь тому, мимо кого зверь пролетает;
//   • стая нападает по очереди, а не вся разом: others и turns.
// Свои числа зверь держит только в m.data (их заводит init), в файле — одни константы.

import { H, TAU, F_WALK, F_SHOT, F_MOB, clamp, rnd, rand, sfx, floatText } from './core.js';
import { solveDash, circleHits, castRay, removeZone } from './world.js';

// ---------- общее ----------

/** Зона только показывает, куда придётся удар: бить будет сам зверь или его камни. */
const SHOW = Object.freeze({ dmg: 0 });

/** Сколько предупреждает замах в t секунд: не короче полусекунды, у вожака — не короче 0,8 с (он бьёт на два). */
const warnOf = (m, t) => Math.max(t, m.elite ? 0.8 : 0.5);

/**
 * Ширина полосы под зверя, который по ней пронесётся. Телом он достаёт лису на r + 7 от своей середины, а зона
 * считает лису кругом радиуса 3 — значит, того, кто стоит вне полосы, зверь не заденет.
 */
const laneOf = (m) => 2 * m.r + 8;

/**
 * Сколько зверей той же породы (кроме самого m) сейчас нападают — в состоянии a или b — либо закончили меньше
 * gap секунд назад (когда — каждый пишет себе в m.data.done). По этому числу стая нападает по очереди.
 */
function others(G, m, a, b, gap) {
  const mobs = G.room.mobs;
  let n = 0;
  for (let i = 0; i < mobs.length; i++) {
    const o = mobs[i];
    if (o !== m && !o.dead && o.id === m.id && (o.state === a || o.state === b || G.time - o.data.done < gap)) n += 1;
  }
  return n;
}

/** Скольким из стаи можно нападать разом: до четырёх зверей — одному, дальше — ещё по одному на каждую четвёрку. */
const turns = (G, m, ai) => 1 + ((ai.count(G, m.id) - 1) >> 2);

/** Убрать недобитые угрозы зверя: предупреждения и «тела», бегущие по полосам. Паутина на земле остаётся. */
function dropAttack(G, m) {
  const zones = G.room.zones;
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.owner === m.uid && (z.phase === 0 || z.run)) removeZone(G.room, i);
  }
}

/**
 * Замах сорван? Начиная замах, зверь запоминает, когда ударит его зона (m.data.at). Если зоны уже нет, а бить
 * ей ещё рано — или зверь проспал этот миг оглушённым, — удара не будет: предупреждения игрок не видел.
 */
function spoiled(m, G) {
  const left = m.data.at - G.time;
  if (left < -0.12) return true;
  if (left < 0.06) return false;                            // зона вот-вот ударит или только что ударила
  const zones = G.room.zones;
  for (let i = 0; i < zones.length; i++) if (zones[i].owner === m.uid && zones[i].phase === 0) return false;
  return true;
}

// Лёгкого зверя рывок сбивает с замаха; заморозка и оглушение — любого (обработчики onHurt и onDie).
function flinch(m, G, hit) {
  if (hit.kind === 'dash' || hit.freeze > 0 || hit.stun > 0) dropAttack(G, m);
}
function stagger(m, G, hit) {
  if (hit.freeze > 0 || hit.stun > 0) dropAttack(G, m);
}
function fall(m, G) {
  dropAttack(G, m);
}

/**
 * Прицелиться для прыжка под углом a на длину len: где зверь приземлится (как и рывок лисы, прыжок перелетает
 * воду и пни, а деревья и стены его останавливают) и красная полоса до этого места. o — поля зоны: run со
 * скоростью полёта. false — прыгать некуда.
 */
function aimLeap(m, G, ai, a, len, warn, o) {
  const D = m.data;
  const r = Math.min(m.r, 12);
  const out = solveDash(G.room, m.x, m.y, Math.cos(a), Math.sin(a), len, r);
  const far = out.len;
  if (!out.ok || far < 48 || circleHits(G.room, out.x, out.y, r, F_WALK | F_MOB)) return false;
  D.sx = m.x;
  D.sy = m.y;
  D.ex = out.x;
  D.ey = out.y;
  D.dur = far / o.run.speed;
  D.at = G.time + ai.tele(G, warn);
  ai.lane(m, G, a, far, laneOf(m), warn, o);
  if (Math.abs(D.ex - m.x) > 2) m.face = D.ex > m.x ? 1 : -1;
  return true;
}

/**
 * Замах перед прыжком по полосе (волк и рысь). 0 — ещё ждёт, 1 — прыгнул, −1 — сорвалось (сбили, оттолкнули
 * с места, пропала зона). Прыгает на шаг раньше конца предупреждения — тогда «тело» зоны бежит вровень со зверем.
 */
function crouch(m, G, ai, warn, height) {
  const D = m.data;
  const wait = ai.tele(G, warn);
  const dx = m.x - D.sx;
  const dy = m.y - D.sy;
  ai.stop(m);
  ai.pose(m, 'windup', m.t / wait);
  if (spoiled(m, G) || dx * dx + dy * dy > 324) {
    dropAttack(G, m);
    return -1;
  }
  if (m.t < wait - H * 1.01) return 0;
  if (ai.leap(m, G, D.ex, D.ey, D.dur, height, 'leap')) {
    ai.sfx(G, 'swing', m.x, m.y);
    return 1;
  }
  dropAttack(G, m);
  return -1;
}

/** Красная полоса там, где пролетит снаряд: до первого дерева или стены, но не дальше range. */
function shotLane(m, G, ai, a, range, width, warn) {
  const len = range * castRay(G.room, m.x, m.y, m.x + Math.cos(a) * range, m.y + Math.sin(a) * range, F_SHOT);
  if (len > 12) ai.lane(m, G, a, len, width, warn, SHOW);
}

// ---------- числа ----------

const LUNGE = Object.freeze({ run: Object.freeze({ speed: 520 }) });       // бросок волка
const POUNCE = Object.freeze({ run: Object.freeze({ speed: 700 }) });      // прыжок рыси: почти как рывок лисы

const SWIPE_ARC = 2.1;                      // размах лапы росомахи, радианы (120°)
const SWIPE_REACH = 66;                     // …и докуда достаёт, считая от её бока

const BITE_R = 15;                          // круг укуса летучей мыши
const DART = 0.28;                          // сколько длится её бросок сквозь этот круг
const DIP = 15;                             // на сколько она при этом ныряет к земле

const WEB = Object.freeze({ look: 'shot.web', dmg: 0, radius: 40, time: 0.65, arc: 34, linger: 5, slow: 1, zoneLook: 'web' });
const JUMP = 0.32;                          // сколько паук летит в прыжке

const STONE = Object.freeze({ look: 'shot.stone', speed: 210, r: 5, range: 290, spin: true });
const STONE_ARC = 0.6;                      // веер из трёх камней, радианы
const DIG = 0.4;                            // сколько крот зарывается и вылезает

const FRONT = Math.tan((60 * Math.PI) / 180);        // панцирь жука прикрывает всё, что в 60° от «прямо перед ним»
const RAM_AIM = Math.tan((40 * Math.PI) / 180);      // а рогом он бьёт только то, что почти прямо по курсу
const RAM_SPEED = 250;
const RAM_LEN = 150;
const TURN = 0.9;                           // столько жук разворачивается

// Спереди ли от жука точка (dx, dy), считая от него: он смотрит только влево или вправо, как и нарисован.
const frontal = (m, dx, dy) => dx * m.data.f > 0 && Math.abs(dy) <= dx * m.data.f * FRONT;

export const MOBS2 = {
  // ---------- враги зимнего бора ----------

  // Стая: кружат вокруг лисы и бросаются по одному. Опасны числом — пока следишь за одним, присел другой.
  wolf: {
    name: 'Волк', kind: 'hostile', biome: 'taiga',
    hp: 6, r: 11, pts: 3, cost: 3, touch: 0, coins: [1, 2], pack: [2, 3], weight: 1.3, minFloor: 3, intro: 0,
    // свои позы: 'leap' — бросок, вытянувшись в струну
    init(m, G) {
      const D = m.data;
      D.ring = rand(G, 84, 108);            // у каждого свой круг, чтобы стая не ходила гуськом
      D.done = -9;                          // когда закончил прошлый бросок
      D.sx = 0;
      D.sy = 0;
      D.ex = 0;
      D.ey = 0;
      D.dur = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 0.8, 2.4);
        ai.go(m, 'prowl');
      }
      if (m.state === 'prowl') {
        // далеко — догоняет, вблизи — ходит вокруг лисы
        const d = ai.dist(m, G);
        if (d > D.ring + 64) ai.chase(m, G, 110);
        else ai.orbit(m, G, D.ring, 94);
        // по очереди: пока бросается другой волк (и ещё треть секунды после) — ждёт
        if (m.cd <= 0 && d > 36 && d < 160 && !ai.foxDown(G) && ai.los(m, G) && others(G, m, 'crouch', 'lunge', 0.35) < turns(G, m, ai)) ai.go(m, 'crouch');
      } else if (m.state === 'crouch') {
        const warn = warnOf(m, 0.6);
        if (m.t === 0) {
          // целит чуть на упреждение и пролетает лису насквозь
          const p = ai.lead(m, G, 0.18);
          const dx = p.x - m.x;
          const dy = p.y - m.y;
          if (!aimLeap(m, G, ai, Math.atan2(dy, dx), clamp(Math.hypot(dx, dy) + 34, 80, 172), warn, LUNGE)) {
            m.cd = 0.5;
            ai.go(m, 'prowl');
            return;
          }
          ai.sfx(G, 'growl', m.x, m.y);
        }
        const res = crouch(m, G, ai, warn, 9);
        if (res > 0) ai.go(m, 'lunge');
        else if (res < 0) {
          m.cd = ai.rand(G, 0.7, 1.3);
          ai.go(m, 'prowl');
        }
      } else if (m.state === 'lunge') {
        // приземлился (пока летел, «мысль» не звалась)
        D.done = G.time;
        ai.stop(m);
        ai.pose(m, 'recover', 0);
        ai.go(m, 'rest');
      } else {
        // отдышка после броска: тут его и бить
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.7);
        if (m.t >= 0.7) {
          m.cd = ai.rand(G, 2, 3.4);
          ai.go(m, 'prowl');
        }
      }
    },
  },

  // Одиночка: держится поодаль, прыгает издалека, как сама лиса, — и тут же отбегает. Ловить её — сразу после прыжка.
  lynx: {
    name: 'Рысь', kind: 'hostile', biome: 'taiga',
    hp: 8, r: 11, pts: 4, cost: 4, touch: 0, coins: [1, 3], minFloor: 3, intro: 1,
    // свои позы: 'leap' — длинный прыжок
    init(m) {
      const D = m.data;
      D.sx = 0;
      D.sy = 0;
      D.ex = 0;
      D.ey = 0;
      D.dur = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      if (m.state === '') {
        m.cd = ai.rand(G, 1, 2.2);
        ai.go(m, 'stalk');
      }
      if (m.state === 'stalk') {
        const d = ai.keepRange(m, G, 128, 178, 116);
        if (m.cd <= 0 && d < 200 && !ai.foxDown(G) && ai.los(m, G)) ai.go(m, 'crouch');
      } else if (m.state === 'crouch') {
        const warn = warnOf(m, 0.6);
        if (m.t === 0) {
          const p = ai.lead(m, G, 0.22);
          const dx = p.x - m.x;
          const dy = p.y - m.y;
          if (!aimLeap(m, G, ai, Math.atan2(dy, dx), clamp(Math.hypot(dx, dy) + 46, 110, 215), warn, POUNCE)) {
            m.cd = 0.5;
            ai.go(m, 'stalk');
            return;
          }
          ai.sfx(G, 'growl', m.x, m.y);
        }
        const res = crouch(m, G, ai, warn, 13);
        if (res > 0) ai.go(m, 'pounce');
        else if (res < 0) {
          m.cd = ai.rand(G, 0.8, 1.4);
          ai.go(m, 'stalk');
        }
      } else if (m.state === 'pounce') {
        // приземлилась
        ai.stop(m);
        ai.pose(m, 'recover', 0);
        ai.go(m, 'rest');
      } else if (m.state === 'rest') {
        // короткая заминка после прыжка — единственный миг, когда она рядом и стоит
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.45);
        if (m.t >= 0.45) ai.go(m, 'back');
      } else {
        // отбегает быстрее, чем лиса ходит
        ai.flee(m, G, 152);
        if (m.t >= 1.3 || (m.t > 0.5 && !ai.near(m, G, 170))) {
          m.cd = ai.rand(G, 1.2, 2.2);
          ai.go(m, 'stalk');
        }
      }
    },
  },

  // Здоровяк: идёт напролом и широко бьёт лапой перед собой. Потеряв половину здоровья, звереет — бегает быстрее,
  // замахивается короче и бьёт дважды подряд, зато потом дольше отдувается.
  wolverine: {
    name: 'Росомаха', kind: 'hostile', biome: 'taiga',
    hp: 18, r: 13, pts: 5, cost: 5, touch: 0, coins: [2, 4], mass: 3, accel: 6, weight: 0.7, minFloor: 3, intro: 2,
    // свои позы: 'rage' — ревёт, разъярившись; дальше m.data.rage = 1 (по нему рисуют красные глаза)
    init(m) {
      const D = m.data;
      D.rage = 0;
      D.combo = 0;                          // сколько ударов подряд уже сделано
      D.at = 0;
    },
    onHurt: stagger,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      const mad = D.rage === 1;
      if (m.state === '') {
        m.cd = 0.5;
        ai.go(m, 'walk');
      }
      if (m.state === 'walk') {
        if (!mad && ai.hp(m) <= 0.5) {
          ai.stop(m);
          ai.go(m, 'rage');
          return;
        }
        // подходит вплотную, но на саму лису не лезет
        const d = ai.dist(m, G);
        if (d > m.r + 22) ai.chase(m, G, mad ? 98 : 64);
        else {
          ai.stop(m);
          ai.face(m, G);
        }
        if (m.cd <= 0 && d < m.r + SWIPE_REACH - 18 && !ai.foxDown(G)) ai.go(m, 'swipe');
      } else if (m.state === 'rage') {
        ai.stop(m);
        ai.face(m, G);
        if (m.t === 0) {
          D.rage = 1;
          ai.sfx(G, 'growl', m.x, m.y);
        }
        ai.pose(m, 'rage', m.t / 0.9);
        if (m.t >= 0.9) {
          m.cd = 0;
          ai.go(m, 'walk');
        }
      } else if (m.state === 'swipe') {
        // лапа поднята: красный сектор перед ней ударит сам
        const warn = warnOf(m, mad ? 0.5 : 0.7);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          ai.face(m, G);
          ai.cone(m, G, ai.angle(m, G), m.r + SWIPE_REACH, SWIPE_ARC, warn);
          D.at = G.time + wait;
          ai.sfx(G, 'growl', m.x, m.y);
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          D.combo = 0;
          m.cd = 0.6;
          ai.go(m, 'walk');
        } else if (m.t >= wait) ai.go(m, 'slash');
      } else if (m.state === 'slash') {
        ai.stop(m);
        if (m.t === 0) ai.sfx(G, 'swing', m.x, m.y);
        ai.pose(m, 'attack', m.t / 0.28);
        if (m.t >= 0.28) {
          if (mad && D.combo < 1) {
            D.combo += 1;
            ai.go(m, 'swipe');
          } else {
            D.combo = 0;
            ai.go(m, 'tired');
          }
        }
      } else {
        // отдувается: бить сейчас
        const rest = mad ? 0.8 : 0.6;
        ai.stop(m);
        ai.pose(m, 'recover', m.t / rest);
        if (m.t >= rest) {
          m.cd = mad ? 0.45 : 0.9;
          ai.go(m, 'walk');
        }
      }
    },
  },

  // ---------- враги пещер ----------

  // Рой: мечутся вокруг лисы, а кусают по очереди — зависнув, а потом нырнув сквозь маленький красный круг.
  // Стоять нельзя: круг ставится туда, где лиса сейчас.
  bat: {
    name: 'Летучая мышь', kind: 'hostile', biome: 'cave',
    hp: 2, r: 7, pts: 1, cost: 1, touch: 0, coins: [0, 1], flying: true, z: 20, mass: 0.6, accel: 8, pack: [3, 5], weight: 1.2,
    minFloor: 4, intro: 0,
    init(m, G) {
      const D = m.data;
      D.wa = rnd(G) * TAU;                  // куда сейчас метнулась: угол и расстояние от лисы
      D.wr = rand(G, 50, 100);
      D.wt = 0;                             // через сколько метнётся снова
      D.done = -9;                          // когда закончила прошлый укус
      D.ex = 0;
      D.ey = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 1.2, 3);
        ai.go(m, 'flit');
      }
      if (m.state === 'flit') {
        // мечется: летит к точке возле лисы, которая то и дело меняется, и ещё рыскает из стороны в сторону
        D.wt -= dt;
        if (D.wt <= 0 || ai.bumped(m)) {
          D.wt = ai.rand(G, 0.25, 0.7);
          D.wa = ai.rnd(G) * TAU;
          D.wr = ai.rand(G, 40, 104);
        }
        const gx = m.tx + Math.cos(D.wa) * D.wr - m.x;
        const gy = m.ty + Math.sin(D.wa) * D.wr - m.y;
        ai.move(m, Math.atan2(gy, gx) + Math.sin(G.time * 11 + m.uid) * 0.7, gx * gx + gy * gy > 100 ? 132 : 44);
        // кусают по очереди: пока ныряет другая (и ещё четверть секунды после) — ждёт
        if (m.cd <= 0 && ai.near(m, G, 70) && !ai.foxDown(G) && others(G, m, 'hover', 'dart', 0.25) < turns(G, m, ai)) ai.go(m, 'hover');
      } else if (m.state === 'hover') {
        // зависла: круг укуса — там, где лиса; нырнёт так, чтобы оказаться в его середине в миг удара
        const warn = warnOf(m, 0.5);
        const wait = ai.tele(G, warn) - DART / 2;
        ai.stop(m);
        if (m.t === 0) {
          const p = ai.lead(m, G, 0.15);
          const x = p.x;
          const y = p.y;
          ai.circle(m, G, x, y, BITE_R, warn);
          D.ex = 2 * x - m.x;               // пролетит круг насквозь и вынырнет по ту сторону
          D.ey = 2 * y - m.y;
          D.at = G.time + wait + DART / 2;
          if (Math.abs(x - m.x) > 2) m.face = x > m.x ? 1 : -1;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          dropAttack(G, m);
          m.cd = ai.rand(G, 0.8, 1.6);
          ai.go(m, 'flit');
        } else if (m.t >= wait - H * 1.01) {
          ai.leap(m, G, D.ex, D.ey, DART, -DIP, 'attack');
          ai.go(m, 'dart');
        }
      } else {
        // вынырнула — снова мечется
        D.done = G.time;
        m.cd = ai.rand(G, 2.2, 3.8);
        ai.go(m, 'flit');
      }
    },
  },

  // Держится поодаль и плюёт паутиной: урона от неё нет, но лиса в ней еле идёт. На увязшую (или на третий раз,
  // если не попал) прыгает сам — в красный круг.
  spider: {
    name: 'Паук', kind: 'hostile', biome: 'cave',
    hp: 7, r: 10, pts: 3, cost: 3, touch: 0, coins: [1, 2], minFloor: 4, intro: 1,
    // свои позы: 'leap' — прыжок
    init(m) {
      const D = m.data;
      D.webs = 0;                           // сколько раз плюнул после прошлого прыжка
      D.ex = 0;
      D.ey = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 0.8, 1.8);
        ai.go(m, 'skitter');
      }
      if (m.state === 'skitter') {
        // на увязшую в паутине лису (или на третий раз, если паутина не помогла) пойдёт прыжком — подбирается ближе
        const hunt = G.player.fx.slow > 0 || D.webs >= 2;
        const d = ai.keepRange(m, G, hunt ? 70 : 92, hunt ? 130 : 166, 86);
        if (d < 6) ai.move(m, m.uid * 2.4, 86);              // приземлился прямо на лису — слезает в свою сторону
        if (m.cd > 0 || d > 196 || ai.foxDown(G) || !ai.los(m, G)) return;
        if (!hunt) ai.go(m, 'aim');
        else if (d > 44 && d < 156) ai.go(m, 'crouch');
      } else if (m.state === 'aim') {
        ai.stop(m);
        ai.face(m, G);
        ai.pose(m, 'windup', m.t / 0.45);
        if (m.t >= 0.45) {
          // паутина летит навесом: куда ляжет, видно заранее
          const p = ai.lead(m, G, 0.3);
          ai.lob(m, G, p.x, p.y, WEB);
          D.webs += 1;
          ai.go(m, 'spit');
        }
      } else if (m.state === 'spit') {
        ai.stop(m);
        ai.pose(m, 'attack', m.t / 0.3);
        if (m.t >= 0.3) {
          m.cd = ai.rand(G, 2, 3);
          ai.go(m, 'skitter');
        }
      } else if (m.state === 'crouch') {
        // красный круг — куда приземлится: круг ударит в тот миг, когда паук долетит
        const warn = warnOf(m, 0.55);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          const p = ai.lead(m, G, 0.25);
          const dx = p.x - m.x;
          const dy = p.y - m.y;
          const d = Math.hypot(dx, dy);
          const r = Math.min(m.r, 12);
          const out = d > 1 ? solveDash(G.room, m.x, m.y, dx / d, dy / d, Math.min(d, 170), r) : null;
          if (!out || !out.ok || out.len < 30 || circleHits(G.room, out.x, out.y, r, F_WALK | F_MOB)) {
            D.webs = 0;
            m.cd = 0.6;
            ai.go(m, 'skitter');
            return;
          }
          D.ex = out.x;
          D.ey = out.y;
          ai.circle(m, G, D.ex, D.ey, m.r + 14, warn + JUMP);
          D.at = G.time + wait + JUMP;
          if (Math.abs(dx) > 2) m.face = dx > 0 ? 1 : -1;
        }
        ai.pose(m, 'windup', m.t / wait);
        let ok = !spoiled(m, G);
        if (ok && m.t >= wait - H * 1.01) {
          ok = ai.leap(m, G, D.ex, D.ey, JUMP, 30, 'leap');
          if (ok) ai.go(m, 'land');
        }
        if (!ok) {
          dropAttack(G, m);
          m.cd = 0.8;
          ai.go(m, 'skitter');
        }
      } else if (m.state === 'land') {
        // приземлился
        D.webs = 0;
        ai.stop(m);
        ai.pose(m, 'recover', 0);
        ai.go(m, 'rest');
      } else {
        // после прыжка стоит рядом и приходит в себя
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.6);
        if (m.t >= 0.6) {
          m.cd = ai.rand(G, 1.4, 2.2);
          ai.go(m, 'skitter');
        }
      }
    },
  },

  // Под землёй его не достать и не выбрать целью — виден только ползущий холмик. Вылезает неподалёку от лисы,
  // бросает три камня веером и зарывается снова: ловить надо, пока он наверху.
  mole: {
    name: 'Крот', kind: 'hostile', biome: 'cave',
    hp: 5, r: 10, pts: 3, cost: 3, touch: 0, coins: [1, 3], mass: 1.5, weight: 0.9, minFloor: 4, intro: 2,
    // свои позы: 'burrow' — под землёй (холмик), 'emerge' — вылезает с камнем, 'dig' — зарывается
    init(m) {
      const D = m.data;
      D.near = 90;                          // на каком расстоянии от лисы вылезет в этот раз
      D.a = 0;
      D.at = 0;
    },
    onHurt(m, G, hit) {
      if (m.hide) return false;             // под землёй удар не проходит
      flinch(m, G, hit);
      return true;
    },
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') ai.go(m, 'dig');
      if (m.state === 'dig') {
        // зарывается: ещё можно успеть ударить
        ai.stop(m);
        ai.pose(m, 'dig', m.t / DIG);
        if (m.t >= DIG) {
          m.hide = true;
          D.near = ai.rand(G, 72, 112);
          m.cd = ai.rand(G, 1.3, 2.2);
          ai.go(m, 'under');
        }
      } else if (m.state === 'under') {
        // ползёт к лисе и кружит рядом; вылезает, когда видит её (а если она не отходит — всё равно вылезет)
        const d = ai.dist(m, G);
        m.hide = true;
        if (d > D.near + 40) ai.chase(m, G, 118);
        else ai.orbit(m, G, D.near, 100);
        ai.pose(m, 'burrow', 0);
        if (m.cd <= 0 && !ai.foxDown(G) && d < 230 && ai.los(m, G) && (m.t > 5 || (d > 44 && d < D.near + 46))) ai.go(m, 'emerge');
      } else if (m.state === 'emerge') {
        m.hide = false;
        ai.stop(m);
        ai.face(m, G);
        if (m.t === 0) ai.sfx(G, 'spawn', m.x, m.y);
        ai.pose(m, 'emerge', m.t / DIG);
        if (m.t >= DIG) ai.go(m, 'aim');
      } else if (m.state === 'aim') {
        // три красные полосы — три камня
        const warn = warnOf(m, 0.55);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          D.a = ai.angle(m, G);
          ai.face(m, G);
          for (let i = -1; i <= 1; i++) shotLane(m, G, ai, D.a + (i * STONE_ARC) / 2, STONE.range, 22, warn);
          D.at = G.time + wait;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) ai.go(m, 'rest');                 // сбили замах — камней не будет
        else if (m.t >= wait) ai.go(m, 'throw');
      } else if (m.state === 'throw') {
        ai.stop(m);
        if (m.t === 0) ai.fan(m, G, D.a, 3, STONE_ARC, STONE);
        ai.pose(m, 'attack', m.t / 0.3);
        if (m.t >= 0.3) ai.go(m, 'rest');
      } else {
        // переводит дух наверху
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.7);
        if (m.t >= 0.7) ai.go(m, 'dig');
      }
    },
  },

  // Спереди — каменный панцирь: выстрелы от него отскакивают, а рывок в лоб ранит саму лису. Сбоку и сзади жук
  // мягкий, а разворачивается неспешно — его надо обходить. Сам он бьёт рогом с разбега, только прямо перед собой;
  // промахнулся — стоит спиной.
  beetle: {
    name: 'Жук-камнеед', kind: 'hostile', biome: 'cave',
    hp: 9, r: 12, pts: 4, cost: 4, touch: 0, coins: [2, 3], mass: 3, accel: 5, weight: 0.8, minFloor: 4, intro: 2,
    init(m, G) {
      const D = m.data;
      D.f = G.player.x >= m.x ? 1 : -1;     // куда смотрит: 1 — вправо, −1 — влево (как нарисован)
      D.turn = 0;                           // сколько уже разворачивается
      D.a = 0;
      D.len = 0;
      D.at = 0;
      D.clank = -9;                         // когда панцирь последний раз звякнул
      m.face = D.f;
    },
    spiky: (m, G, fromX, fromY) => frontal(m, fromX - m.x, fromY - m.y),
    onHurt(m, G, hit) {
      // рывок уже рассудила spiky; яд, огонь и прочее «ниоткуда» панцирь не держит
      if (hit.kind !== 'dash' && (hit.ax !== 0 || hit.ay !== 0) && frontal(m, -hit.ax, -hit.ay)) {
        if (G.time - m.data.clank > 0.4) {
          m.data.clank = G.time;
          sfx(G, 'shield', m.x, m.y);
          floatText(G, m.x, m.y - 22, 'Броня');
        }
        return false;
      }
      stagger(m, G, hit);
      return true;
    },
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 1, 2);
        ai.go(m, 'walk');
      }
      if (m.state === 'walk') {
        const dx = m.tx - m.x;
        const dy = m.ty - m.y;
        const d = ai.chase(m, G, 44);
        if (d < m.r + 14) ai.stop(m);                        // вплотную: на саму лису не лезет
        else if (m.wx * D.f < -6) {
          // пятиться не умеет: идти надо назад (лиса за спиной) — стоит и разворачивается
          ai.stop(m);
          D.turn += dt;
          if (D.turn >= TURN) {
            D.turn = 0;
            D.f = -D.f;
          }
        } else {
          D.turn = 0;
          if (m.cd <= 0 && d < RAM_LEN && dx * D.f > 0 && Math.abs(dy) <= dx * D.f * RAM_AIM && !ai.foxDown(G) && ai.los(m, G)) ai.go(m, 'aim');
        }
      } else if (m.state === 'aim') {
        // рог вниз: полоса показывает разбег — до первой преграды
        const warn = warnOf(m, 0.7);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          D.a = ai.angle(m, G);
          D.len = RAM_LEN * castRay(G.room, m.x, m.y, m.x + Math.cos(D.a) * RAM_LEN, m.y + Math.sin(D.a) * RAM_LEN, F_WALK | F_MOB) - m.r;
          if (D.len < 50 || Math.cos(D.a) * D.f <= 0) {
            m.cd = 0.6;
            ai.go(m, 'walk');
            m.face = D.f;
            return;
          }
          ai.lane(m, G, D.a, D.len, laneOf(m), warn, SHOW);
          D.at = G.time + wait;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          m.cd = 0.8;
          ai.go(m, 'walk');
        } else if (m.t >= wait) ai.go(m, 'ram');
      } else if (m.state === 'ram') {
        const dur = D.len / RAM_SPEED;
        ai.charge(m, D.a, RAM_SPEED);
        ai.pose(m, 'attack', m.t / dur);
        ai.strike(m, G, m.r - 2);
        if (m.t >= dur || (m.t > 0.05 && ai.bumped(m))) ai.go(m, 'rest');
      } else {
        // проскочил и встал: пока отдувается и разворачивается, спина открыта
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.9);
        if (m.t >= 0.9) {
          m.cd = ai.rand(G, 1.4, 2.4);
          ai.go(m, 'walk');
        }
      }
      m.face = D.f;
    },
  },
};
