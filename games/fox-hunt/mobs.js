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
};
