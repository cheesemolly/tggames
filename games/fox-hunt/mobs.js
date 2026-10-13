// Звери «Лисьей охоты», часть первая: добыча и враги леса. Только описания — двигает, бьёт и считает движок.
//
// Запись реестра — { id: описание }. Вид зверя — поле kind:
//
// ── ДОБЫЧА (kind: 'prey') ────────────────────────────────────────────────────────────────────────────────────
// Вся добыча ведёт себя одинаково (пасётся → заметила лису → убегает → устала → …, по времени уходит в нору;
// поведение — в ai.js), различия — только числа:
//   name   — имя;                 pts  — очки за поимку;           r — радиус (обычно 8);
//   speed  — скорость бегом (лиса ходит 132: быстрее — догонять только рывком);
//   walk   — скорость, когда пасётся;
//   aware  — с какого расстояния замечает лису;
//   tire   — сколько секунд бежит, прежде чем устанет; rest — сколько отдыхает; tiredSpeed — доля скорости уставшей (0,4);
//   life   — через сколько секунд уходит в нору насовсем (так волна всегда кончается);
//   hop    — { cd, far, dist }: отпрыгивает вбок от рывка, начатого дальше far, не чаще раза в cd секунд;
//   coins  — [от, до] монет за поимку; coinChance — с каким шансом они вообще выпадут (по умолчанию 1);
//   drops  — [{ kind: 'berry' | 'heart' | 'mana' | 'coin', v, p }] — что ещё выпадает (p — шанс, по умолчанию 1);
//   onCatch(m, G) — что сделать при поимке (не обязательно);
//   think(m, G, dt, ai) — своё поведение вместо общего (бабочка задания). Срок life всё равно действует: вышел —
//            добыча пропадает.
//
// ── ВРАГ (kind: 'hostile') ───────────────────────────────────────────────────────────────────────────────────
//   wolf: {
//     name: 'Волк', kind: 'hostile',
//     biome: 'taiga',        // в каком месте живёт: 'forest' | 'swamp' | 'taiga' | 'cave' | 'autumn'
//     hp: 6,                 // здоровье на первой локации (дальше растёт само: +22 % за локацию)
//     r: 11,                 // радиус: и для попаданий, и для касания
//     pts: 3,                // очки за убийство (вожак — вдвое)
//     cost: 3,               // «цена» в бюджете волны (обычно равна pts)
//     touch: 1,              // урон лисе при касании (0 — не кусается сам)
//     coins: [1, 2],         // монеты из убитого: от и до
//     mass: 1,               // масса: тяжёлого слабее отбрасывает и труднее растолкать (по умолчанию 1)
//     flying: false,         // летает: клетки не мешают, держится в воздухе на высоте z (18)
//     accel: 10,             // как резво меняет скорость (по умолчанию 10; 4 — «тяжёлый на подъём»)
//     minFloor: 1,           // с какой локации встречается
//     intro: 0,              // на самой первой локации — начиная с какой по счёту охотничьей комнаты (0 — сразу)
//     weight: 1,             // как часто выбирается в волну среди подходящих
//     pack: [4, 6],          // приходит стаей такого размера (осы, комары)
//     wave: false,           // не ставить в обычные волны (только по вызову: подмога хозяина, зубастый сундук)
//     drops: [...],          // как у добычи
//     // свои позы (сверх общих 'idle', 'move', 'windup', 'attack', 'recover', 'stun'): 'lunge' — бросок
//     init(m, G) {},                        // один раз при появлении: завести свои числа в m.data
//     think(m, G, dt, ai) {},               // раз в шаг: куда идти и что делать — см. начало ai.js
//     onHurt(m, G, hit) {},                 // перед уроном; вернуть false — удар не прошёл (панцирь, блок).
//                                           // hit.kind — чем ударили ('dash', 'shot', 'zone', 'pal'…),
//                                           // hit.ax, hit.ay — куда летел удар (для «бить только сзади»)
//     onDie(m, G) {},                       // при гибели (взорваться, оставить лужу, позвать подмогу)
//     spiky(m, G, fromX, fromY) {},         // true — рывок в него бьёт саму лису (fromX, fromY — откуда рывок)
//   }
// Любого врага волна может прислать «вожаком»: 2,2× здоровья, крупнее, бьёт на 2, вдвое больше очков.
//
// Что можно звать из think и обработчиков:
//   • всё из ai (четвёртый аргумент think) — движение, красные зоны, выстрелы, подмога, случайность, звук;
//   • из combat.js: hurtMob(G, m, dmg, hitOf('zone')), explode(G, x, y, r, dmg, from), fireShot(…), lobShot(…);
//   • из world.js: addZone(G, {…}), addPick(G, kind, x, y, v), dropCoins(G, x, y, n), hasLos(room, x1, y1, x2, y2),
//     freeSpot(G, min, max) → { x, y } | null;
//   • из player.js: hurtPlayer(G, dmg, fromX, fromY, 'touch' | 'shot' | 'zone'), addEffect(G, 'slow' | 'root', sec);
//   • из core.js: sfx(G, 'имя', x, y), emit(G, событие), floatText(G, x, y, 'текст').
// Нельзя: своя случайность и часы (в расчёте всё идёт от зерна партии и её времени G.time), свои переменные вне
// m.data (комнату могут собрать заново), удалять зверей из списка (чтобы убрать зверя — m.dead = true),
// подключать content.js и logic.js.
//
// Имена поз, картинок выстрелов (look) и звуков — из общего списка (03-presentation: «Fixed names»).

import { H, TAU, F_SHOT } from './core.js';
import { castRay, removeZone } from './world.js';

// ---------- общее (такое же, как в mobs2.js: замах виден заранее, сорванный замах не бьёт) ----------

/** Зона только показывает, куда придётся удар: бить будет сам зверь или его снаряды. */
const SHOW = Object.freeze({ dmg: 0 });

/** Сколько предупреждает замах в t секунд: не короче полусекунды, у вожака — не короче 0,8 с (он бьёт на два). */
const warnOf = (m, t) => Math.max(t, m.elite ? 0.8 : 0.5);

/** Сколько зверей той же породы (кроме m) сейчас в состоянии a или закончили бросок меньше gap секунд назад. */
function others(G, m, a, gap) {
  const mobs = G.room.mobs;
  let n = 0;
  for (let i = 0; i < mobs.length; i++) {
    const o = mobs[i];
    if (o !== m && !o.dead && o.id === m.id && (o.state === a || o.state === 'sting' || G.time - o.data.done < gap)) n += 1;
  }
  return n;
}

/** Скольким из стаи можно нападать разом: до четырёх зверей — одному, дальше — ещё по одному на каждую четвёрку. */
const turns = (G, m, ai) => 1 + ((ai.count(G, m.id) - 1) >> 2);

/** Убрать недобитые угрозы зверя (предупреждения, что ещё не ударили). */
function dropAttack(G, m) {
  const zones = G.room.zones;
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.owner === m.uid && (z.phase === 0 || z.run)) removeZone(G.room, i);
  }
}

/** Замах сорван? Зона уже пропала, а бить ей ещё рано (или зверь проспал свой миг оглушённым) — удара не будет. */
function spoiled(m, G) {
  const left = m.data.at - G.time;
  if (left < -0.12) return true;
  if (left < 0.06) return false;
  const zones = G.room.zones;
  for (let i = 0; i < zones.length; i++) if (zones[i].owner === m.uid && zones[i].phase === 0) return false;
  return true;
}

// Лёгкого зверя рывок сбивает с замаха; заморозка и оглушение — любого.
function flinch(m, G, hit) {
  if (hit.kind === 'dash' || hit.freeze > 0 || hit.stun > 0) dropAttack(G, m);
}
function fall(m, G) {
  dropAttack(G, m);
}

/** Красная полоса там, где пролетит снаряд: до первого дерева или стены, но не дальше range. */
function shotLane(m, G, ai, a, range, width, warn) {
  const len = range * castRay(G.room, m.x, m.y, m.x + Math.cos(a) * range, m.y + Math.sin(a) * range, F_SHOT);
  if (len > 12) ai.lane(m, G, a, len, width, warn, SHOW);
}

// ---------- числа ----------

const DIVE = 0.4;                           // сколько ворон пикирует
const DIVE_R = 20;                          // круг, куда он падает
const TONGUE = 92;                          // докуда достаёт язык жабы от её середины
const HOP = 0.34;                           // сколько жаба в прыжке
const VENOM = Object.freeze({ look: 'shot.orb', v: 3, speed: 120, r: 5, range: 300 });
const SPORE = Object.freeze({ look: 'shot.spore', speed: 84, r: 5, range: 200 });
const PUFF_R = 44;                          // круг, который показывает, что гриб сейчас выстрелит

/**
 * Мелкий рой (оса, комар): мечется возле лисы, а колет по очереди — замах, потом короткий бросок вперёд. Урон —
 * касанием (touch), а читать удар помогает поза 'windup'. p: ring — на каком расстоянии мечется, speed — скорость,
 * near — с какого расстояния начинает замах, warn — длина замаха, dart / dartT — скорость и время броска, rest — отдых.
 */
function swarm(p) {
  return function think(m, G, dt, ai) {
    const D = m.data;
    if (m.state === '') {
      m.cd = ai.rand(G, 1, 2.6);
      ai.go(m, 'flit');
    }
    if (m.state === 'flit') {
      D.wt -= dt;
      if (D.wt <= 0 || ai.bumped(m)) {
        D.wt = ai.rand(G, 0.25, 0.7);
        D.wa = ai.rnd(G) * TAU;
        D.wr = ai.rand(G, p.ring[0], p.ring[1]);
      }
      const gx = m.tx + Math.cos(D.wa) * D.wr - m.x;
      const gy = m.ty + Math.sin(D.wa) * D.wr - m.y;
      ai.move(m, Math.atan2(gy, gx) + Math.sin(G.time * 11 + m.uid) * 0.7, gx * gx + gy * gy > 100 ? p.speed : p.speed / 3);
      if (m.cd <= 0 && ai.near(m, G, p.near) && !ai.foxDown(G) && others(G, m, 'windup', 0.25) < turns(G, m, ai)) ai.go(m, 'windup');
    } else if (m.state === 'windup') {
      const wait = ai.tele(G, warnOf(m, p.warn));
      ai.stop(m);
      ai.face(m, G);
      ai.pose(m, 'windup', m.t / wait);
      if (m.t >= wait) {
        D.a = ai.angle(m, G);
        ai.go(m, 'sting');
      }
    } else {
      ai.charge(m, D.a, p.dart);
      ai.pose(m, 'attack', m.t / p.dartT);
      if (m.t >= p.dartT) {
        D.done = G.time;
        m.cd = ai.rand(G, p.rest[0], p.rest[1]);
        ai.stop(m);
        ai.go(m, 'flit');
      }
    }
  };
}

function swarmInit(m) {
  const D = m.data;
  D.wa = 0;                                 // куда сейчас метнулся: угол и расстояние от лисы
  D.wr = 60;
  D.wt = 0;                                 // через сколько метнётся снова
  D.a = 0;
  D.done = -9;                              // когда закончил прошлый бросок
}

export const MOBS = {
  // ---------- добыча ----------
  rabbit: {
    name: 'Кролик', kind: 'prey', pts: 1, r: 8,
    speed: 150, walk: 26, aware: 92, tire: 4, rest: 1.6, life: 16,
    coins: [1, 1], coinChance: 0.15,
  },
  hare: {
    name: 'Заяц-беляк', kind: 'prey', pts: 2, r: 8,
    speed: 176, walk: 30, aware: 106, tire: 4.5, rest: 1.3, life: 14,
    hop: { cd: 3, far: 70, dist: 46 },
    coins: [1, 1], coinChance: 0.2,
  },
  gold: {
    name: 'Золотой кролик', kind: 'prey', pts: 5, r: 8,
    speed: 206, walk: 42, aware: 132, tire: 6, rest: 0.8, life: 8,
    coins: [10, 10],
  },
  fat: {
    name: 'Кролик-толстяк', kind: 'prey', pts: 1, r: 10,
    speed: 98, walk: 18, aware: 80, tire: 3, rest: 2.2, life: 20,
    drops: [{ kind: 'berry', v: 1 }],
  },

  // ---------- враги леса ----------
  hedgehog: {
    name: 'Ёж', kind: 'hostile', biome: 'forest',
    hp: 5, r: 9, pts: 2, cost: 2, touch: 1, coins: [0, 2], intro: 0,
    // свои позы: 'curl' — свернулся в колючий шар и катится
    spiky: (m) => m.state === 'curl',
    think(m, G, dt, ai) {
      if (m.state === '') {
        m.cd = ai.rand(G, 1.4, 2.8);
        ai.go(m, 'walk');
      }
      if (m.state === 'walk') {
        // идёт к лисе: сейчас его можно бить рывком
        ai.chase(m, G, 44);
        if (m.cd <= 0 && ai.near(m, G, 150)) ai.go(m, 'windup');
      } else if (m.state === 'windup') {
        ai.stop(m);
        ai.face(m, G);
        ai.pose(m, 'windup', m.t / 0.4);
        if (m.t >= 0.4) ai.go(m, 'curl');
      } else if (m.state === 'curl') {
        // колючий шар: рывок в него — себе дороже
        ai.chase(m, G, 72);
        ai.pose(m, 'curl', (m.t * 2) % 1);
        if (m.t >= 2) ai.go(m, 'recover');
      } else {
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.5);
        if (m.t >= 0.5) {
          m.cd = ai.rand(G, 2.2, 3.6);
          ai.go(m, 'walk');
        }
      }
    },
  },

  boar: {
    name: 'Кабан', kind: 'hostile', biome: 'forest',
    hp: 9, r: 12, pts: 3, cost: 3, touch: 1, mass: 2.2, coins: [1, 3], intro: 3,
    // свои позы: 'charge' — несётся по прямой
    think(m, G, dt, ai) {
      if (m.state === '') {
        m.cd = ai.rand(G, 0.8, 2);
        ai.go(m, 'roam');
      }
      if (m.state === 'roam') {
        const d = ai.dist(m, G);
        if (d > 190) ai.chase(m, G, 54);
        else ai.orbit(m, G, 140, 30);
        if (m.cd <= 0 && d < 260 && ai.los(m, G)) {
          m.data.a = ai.angle(m, G);
          ai.go(m, 'windup');
        }
      } else if (m.state === 'windup') {
        // красная полоса показывает, куда понесётся: сама она не бьёт — бьёт кабан
        const wait = ai.tele(G, 0.6);
        ai.stop(m);
        ai.face(m, G);
        ai.pose(m, 'windup', m.t / wait);
        if (m.t === 0) {
          ai.lane(m, G, m.data.a, 250, 26, 0.6, { dmg: 0 });
          ai.sfx(G, 'growl', m.x, m.y);
        }
        if (m.t >= wait) ai.go(m, 'charge');
      } else if (m.state === 'charge') {
        ai.charge(m, m.data.a, 330);
        ai.pose(m, 'charge', (m.t * 3) % 1);
        if (m.t > 0.05 && ai.bumped(m)) ai.go(m, 'stun');           // врезался в стену или дерево
        else if (m.t >= 0.75) ai.go(m, 'recover');
      } else if (m.state === 'stun') {
        // оглушён: секунда, когда его можно бить безнаказанно
        ai.stop(m);
        ai.pose(m, 'stun', m.t);
        if (m.t >= 1) {
          m.cd = ai.rand(G, 1.2, 2.2);
          ai.go(m, 'roam');
        }
      } else {
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.4);
        if (m.t >= 0.4) {
          m.cd = ai.rand(G, 1.6, 2.8);
          ai.go(m, 'roam');
        }
      }
    },
  },

  // Рой из 3–5: цена в бюджете волны — 2 за осу (а не 1, как очки), иначе на первой локации волна целиком из ос.
  wasp: {
    name: 'Оса', kind: 'hostile', biome: 'forest',
    hp: 1, r: 6, pts: 1, cost: 2, touch: 1, coins: [0, 1], flying: true, z: 18, mass: 0.5, accel: 9, pack: [3, 5], weight: 1.2, intro: 2,
    init: swarmInit,
    think: swarm({ ring: [44, 96], speed: 138, near: 84, warn: 0.5, dart: 250, dartT: 0.3, rest: [1.6, 3] }),
  },

  // Летает над деревьями. Зависает и каркает, а потом пикирует в красный круг там, где стояла лиса; после падения отдувается.
  crow: {
    name: 'Ворон', kind: 'hostile', biome: 'forest',
    hp: 3, r: 9, pts: 2, cost: 2, touch: 0, coins: [1, 2], flying: true, z: 22, mass: 0.8, accel: 7, weight: 0.9, intro: 4,
    // свои позы: 'fly' — летит, 'dive' — пикирует
    init(m) {
      const D = m.data;
      D.ex = 0;
      D.ey = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 1.4, 3);
        ai.go(m, 'fly');
      }
      if (m.state === 'fly') {
        if (ai.dist(m, G) > 200) ai.chase(m, G, 84);
        else ai.orbit(m, G, 130, 70);
        ai.pose(m, 'fly', (m.t * 2) % 1);
        if (m.cd <= 0 && ai.near(m, G, 260) && !ai.foxDown(G)) ai.go(m, 'hover');
      } else if (m.state === 'hover') {
        // красный круг — там, где упадёт; последние DIVE секунд — само падение
        const warn = warnOf(m, 0.9);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          const p = ai.lead(m, G, 0.3);
          D.ex = p.x;
          D.ey = p.y;
          ai.circle(m, G, D.ex, D.ey, DIVE_R, warn);
          D.at = G.time + wait;
          if (Math.abs(D.ex - m.x) > 2) m.face = D.ex > m.x ? 1 : -1;
          ai.sfx(G, 'warn', m.x, m.y);
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          dropAttack(G, m);
          m.cd = ai.rand(G, 0.8, 1.6);
          ai.go(m, 'fly');
        } else if (m.t >= wait - DIVE - H * 1.01) {
          ai.leap(m, G, D.ex, D.ey, DIVE, -14, 'dive');
          ai.go(m, 'land');
        }
      } else if (m.state === 'land') {
        // упал (пока пикировал, «мысль» не звалась)
        ai.stop(m);
        ai.pose(m, 'recover', 0);
        ai.go(m, 'rest');
      } else {
        // отдувается: тут его и бить
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.7);
        if (m.t >= 0.7) {
          m.cd = ai.rand(G, 2.2, 3.6);
          ai.go(m, 'fly');
        }
      }
    },
  },

  // ---------- враги болота ----------

  // Сидит и прыгает к лисе; вблизи надувает щёки и бьёт языком по короткой красной полосе.
  frog: {
    name: 'Жаба', kind: 'hostile', biome: 'swamp',
    hp: 5, r: 10, pts: 2, cost: 2, touch: 0, coins: [1, 2], minFloor: 2, intro: 0,
    // свои позы: 'hop' — прыжок
    init(m) {
      const D = m.data;
      D.a = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 0.6, 1.6);
        ai.go(m, 'sit');
      }
      if (m.state === 'sit') {
        ai.stop(m);
        ai.face(m, G);
        if (m.cd > 0 || ai.foxDown(G)) return;
        const d = ai.dist(m, G);
        if (d < TONGUE - 12 && ai.los(m, G)) {
          ai.go(m, 'windup');
        } else {
          // подпрыгивает ближе: не на саму лису, а чтобы встать в двух шагах от неё
          const a = ai.angle(m, G) + ai.rand(G, -0.4, 0.4);
          const len = Math.min(Math.max(d - 54, 24), 60);
          if (ai.leap(m, G, m.x + Math.cos(a) * len, m.y + Math.sin(a) * len, HOP, 12, 'hop')) {
            ai.sfx(G, 'land', m.x, m.y);
            ai.go(m, 'hop');
          } else m.cd = 0.4;
        }
      } else if (m.state === 'hop') {
        // приземлилась
        m.cd = ai.rand(G, 0.5, 1);
        ai.go(m, 'sit');
      } else if (m.state === 'windup') {
        // надувает щёки; красная полоса — куда ударит язык
        const warn = warnOf(m, 0.6);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          ai.face(m, G);
          D.a = ai.angle(m, G);
          ai.lane(m, G, D.a, TONGUE, 18, warn);
          D.at = G.time + wait;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          m.cd = 0.6;
          ai.go(m, 'sit');
        } else if (m.t >= wait) ai.go(m, 'lash');
      } else if (m.state === 'lash') {
        ai.stop(m);
        if (m.t === 0) ai.sfx(G, 'swing', m.x, m.y);
        ai.pose(m, 'attack', m.t / 0.25);
        if (m.t >= 0.25) ai.go(m, 'rest');
      } else {
        // язык убран, жаба переводит дух
        ai.stop(m);
        ai.pose(m, 'recover', m.t / 0.6);
        if (m.t >= 0.6) {
          m.cd = ai.rand(G, 1.2, 2.2);
          ai.go(m, 'sit');
        }
      }
    },
  },

  // Держится поодаль и плюёт медленными шариками яда: перед плевком поднимается, а красная полоса показывает, куда он полетит.
  snake: {
    name: 'Гадюка', kind: 'hostile', biome: 'swamp',
    hp: 4, r: 9, pts: 2, cost: 2, touch: 0, coins: [1, 2], minFloor: 2, intro: 1, weight: 0.9,
    init(m) {
      const D = m.data;
      D.a = 0;
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 1, 2);
        ai.go(m, 'stalk');
      }
      if (m.state === 'stalk') {
        ai.keepRange(m, G, 110, 170, 60);
        if (m.cd <= 0 && ai.near(m, G, 230) && !ai.foxDown(G) && ai.los(m, G)) ai.go(m, 'aim');
      } else if (m.state === 'aim') {
        const warn = warnOf(m, 0.6);
        const wait = ai.tele(G, warn);
        ai.stop(m);
        if (m.t === 0) {
          ai.face(m, G);
          D.a = ai.angle(m, G);
          shotLane(m, G, ai, D.a, VENOM.range, 10, warn);
          D.at = G.time + wait;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          m.cd = ai.rand(G, 0.6, 1.2);
          ai.go(m, 'stalk');
        } else if (m.t >= wait) {
          ai.shoot(m, G, D.a, VENOM);
          ai.go(m, 'spit');
        }
      } else {
        ai.stop(m);
        ai.pose(m, 'attack', m.t / 0.3);
        if (m.t >= 0.3) {
          m.cd = ai.rand(G, 1.8, 2.8);
          ai.go(m, 'stalk');
        }
      }
    },
  },

  mosquito: {
    name: 'Комар', kind: 'hostile', biome: 'swamp',
    hp: 1, r: 5, pts: 1, cost: 1.5, touch: 1, coins: [0, 1], flying: true, z: 16, mass: 0.4, accel: 10, pack: [4, 6], weight: 1.2, minFloor: 2, intro: 0,
    init: swarmInit,
    think: swarm({ ring: [36, 80], speed: 160, near: 76, warn: 0.5, dart: 300, dartT: 0.25, rest: [1.2, 2.4] }),
  },

  // Стоит на месте. Раздувается и выпускает кольцо из восьми медленных спор; следующее кольцо — со сдвигом.
  shroom: {
    name: 'Гриб-споровик', kind: 'hostile', biome: 'swamp',
    hp: 8, r: 11, pts: 3, cost: 3, touch: 0, coins: [1, 3], mass: 6, minFloor: 2, intro: 2, weight: 0.8,
    init(m) {
      const D = m.data;
      D.ph = 0;                             // с какого угла пойдёт кольцо
      D.at = 0;
    },
    onHurt: flinch,
    onDie: fall,
    think(m, G, dt, ai) {
      const D = m.data;
      if (m.state === '') {
        m.cd = ai.rand(G, 1, 2);
        ai.go(m, 'stand');
      }
      ai.stop(m);
      if (m.state === 'stand') {
        if (m.cd <= 0 && ai.near(m, G, 300) && !ai.foxDown(G)) ai.go(m, 'swell');
      } else if (m.state === 'swell') {
        // раздувается; красный круг — докуда долетят первые споры
        const warn = warnOf(m, 0.7);
        const wait = ai.tele(G, warn);
        if (m.t === 0) {
          ai.circle(m, G, m.x, m.y, PUFF_R, warn, SHOW);
          D.at = G.time + wait;
        }
        ai.pose(m, 'windup', m.t / wait);
        if (spoiled(m, G)) {
          m.cd = 0.8;
          ai.go(m, 'stand');
        } else if (m.t >= wait) {
          ai.ringShots(m, G, 8, SPORE, D.ph);
          D.ph = D.ph ? 0 : Math.PI / 8;
          ai.go(m, 'puff');
        }
      } else {
        ai.pose(m, 'attack', m.t / 0.4);
        if (m.t >= 0.4) {
          m.cd = ai.rand(G, 2.4, 3.4);
          ai.go(m, 'stand');
        }
      }
    },
  },
};
