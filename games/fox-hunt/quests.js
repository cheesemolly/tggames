// Задания «Лисьей охоты»: короткие дела в передышку между волнами — сломать три пенька, поймать золотого
// кролика, собрать ягоды. Выполнила — очки и награда; не успела — ничего страшного. Только описания.
//
// Запись — { id: задание }:
//   stumps: {
//     name: 'Три пенька',                 // заголовок панели задания (до 22 знаков)
//     text: 'Сломай рывком три пенька',   // что делать (до 50 знаков, без точки)
//     time: 12,                           // сколько секунд даётся (0 — без срока: задание само решит, когда кончиться)
//     weight: 1, minFloor: 1,             // как часто и с какой локации
//     during: 'wave',                     // по желанию: задание идёт не в передышку, а всю следующую волну
//                                         // («без урона»); дожило до конца волны — выполнено
//     start(G, room, r) {},               // расставить нужное; вернуть false — задание не началось (нет места)
//     step(G, task, dt) {},               // каждый шаг: 'run' — идёт, 'ok' — выполнено, 'fail' — провалено
//     finish(G, task, ok) {},             // убрать за собой и наградить (зовётся всегда: и при успехе, и при провале)
//     onBreak(G, task, thing) {},         // по желанию: сломан ломкий предмет
//     onCatch(G, task, mob) {},           // по желанию: поймана добыча
//     onPick(G, task, pick) {},           // по желанию: подобрано то, у чего есть tag
//   }
// Запись идущего задания — room.task (внутри start она уже есть): { id, name, text, t, time, n, goal, data }.
// t — сколько секунд идёт; n и goal — ход для панели («2 из 3»): ставьте их сами; data — всё своё.
// Срок (time) движок проверяет сам: вышел — 'fail'. Предметы и зверей задания убирайте в finish.
//
// Что можно звать:
//   из world.js: addThing(G, { kind: 'stump' | 'target', x, y, r, breakable: true, hp }) — ломкий предмет
//                (рывок ломает любой; выстрел снимает с hp свой урон), removeThing(room, thing),
//                addPick(G, 'berry', x, y, 1) — подбираемое (p.tag = 'task' — и о нём сообщит onPick),
//                freeSpot(G, min, max, r) → { x, y } | null — свободная клетка на расстоянии от лисы
//                (общий объект: прочитать сразу), addZone(G, {…}) — красная зона, dropCoins(G, x, y, n);
//   из combat.js: addScore(G, очки, x, y);
//   из ai.js: spawnMob(G, id, x, y) — зверь (золотой кролик);
//   из player.js: heal(G, n), addMana(G, n), gainCoins(G, n), hurtPlayer(G, 1, x, y, 'zone');
//   из core.js: sfx(G, 'имя', x, y), floatText(G, x, y, 'текст'); G.cnt.hurt — сколько раз лису ударили за партию
//   (запомнить в start и сравнить — «без урона»); r — случайность партии (в step её нет: там rnd(G), rand(G, a, b)).
//
// Как устроены задания ниже:
//   • всё своё задание убирает в finish — при любом исходе: предметы и подбираемое пропадают с дымком, красные
//     зоны отменяются, недопойманная добыча ныряет в землю (треть секунды — и её нет);
//   • подбираемое и зоны движок берёт из общего запаса и пускает в дело заново, поэтому ссылок на них задание
//     не держит, а находит свои по метке tag: 'task'. Предметы и звери — обычные объекты: они лежат в data;
//   • вне room.task ничего не хранится: комната не сохраняется, после загрузки охота начинается сначала, и от
//     задания не остаётся следов;
//   • провал ничем не наказывает. Больно может быть только в «Ведьмином круге»: там падают красные круги.
//
// Картинки: пень и мишень — thing.stump и thing.target, ягода — pick.berry. Два предмета — свои: гриб ведьмина
// круга thing.toadstool (v 0…2 — три разных гриба) и бабочка thing.butterfly (v 0 — крылья раскрыты, 1 — сложены;
// face — куда летит; z — высота над землёй).

import { T, TAU, TILE, F_WALK, F_MOB, FOX_R, CAPS, rnd, rand, segDist2, emit, sfx, haptic } from './core.js';
import { POINTS, PICK, PREY } from './balance.js';
import {
  addThing, removeThing, addPick, removePick, addZone, removeZone, inZone, freeSpot, dropCoins, blockedAt, standable, tileAt,
} from './world.js';
import { addScore } from './combat.js';
import { spawnMob } from './ai.js';
import { hurtPlayer } from './player.js';

const TAG = 'task';

/**
 * Числа заданий — стартовые, их подбирает прогон бота. pts — очки за задание целиком (сверх того, что даёт сама
 * добыча), each — очки за каждый шаг (пень, мишень), coins — монеты в награду (к ним прибавляется номер локации).
 */
export const QUEST = {
  stumps: { n: 3, each: POINTS.stump, pts: 4, coins: 3 },
  goldrush: { pts: 2, far: 4 * T },                       // far — кролик выскакивает не ближе
  ring: { r: 56, need: 4, pts: 5, orbs: 3, caps: 8, zoneR: 18, warn: 0.9, gap: 0.85 },
  berries: { n: 6, pts: 3, heal: 1, spread: 80, gap: 26 },
  targets: { n: 4, each: 1, pts: 3, coins: 2 },
  butterfly: { pts: 3, r: 6, speed: 92, dart: 150, near: 70, shy: 36, reach: FOX_R + 10 },
  speedhunt: { n: 4, rabbits: 6, pts: 4 },
  flawless: { pts: 6, coins: 4 },
};

// ---------- общее ----------

// дымок там, где задание что-то убрало: молча ничего не пропадает
const puff = (G, x, y) => emit(G, { t: 'boom', x, y, r: 9, look: 'fx.puff' });

// Убрать предметы задания, которые ещё стоят.
function dropThings(G, list, quiet = false) {
  const room = G.room;
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const th = list[i];
    if (room.things.indexOf(th) < 0) continue;
    if (!quiet) puff(G, th.x, th.y);
    removeThing(room, th);
  }
}

// Убрать подбираемое задания — по метке (см. начало файла).
function dropPicks(G, quiet = false) {
  const room = G.room;
  for (let i = room.picks.length - 1; i >= 0; i--) {
    const p = room.picks[i];
    if (p.tag !== TAG) continue;
    if (!quiet) puff(G, p.x, p.y);
    removePick(room, i);
  }
}

function dropZones(room) {
  for (let i = room.zones.length - 1; i >= 0; i--) if (room.zones[i].tag === TAG) removeZone(room, i);
}

// Недопойманная добыча задания уходит: ныряет в землю там, где стоит.
function sendHome(list) {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.dead || m.state === 'dive') continue;
    m.state = 'dive';
    m.t = 0;
    m.fresh = false;
  }
}

// Добыча задания выскакивает из норы и сразу настороже — как в волне.
function popPrey(G, id, at) {
  const m = at ? spawnMob(G, id, at.x, at.y) : null;
  if (!m) return null;
  m.state = 'alert';
  m.t = PREY.alert - PREY.pop;
  return m;
}

// Можно ли здесь стоять и не обжечься: колючки и горячие трещины заданиям не годятся.
function quiet(room, x, y, r) {
  if (!standable(room, x, y, r)) return false;
  const code = tileAt(room, x, y);
  return code !== TILE.THORN && !(code === TILE.SPECIAL && room.special === 'hot');
}

// Хватит ли места под круг радиуса r с серединой в (x, y): середина и почти весь обод свободны.
function roomy(room, x, y, r) {
  if (!quiet(room, x, y, 10)) return false;
  let free = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    if (quiet(room, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, 6)) free += 1;
  }
  return free >= 7;
}

// Красный круг «Ведьмина круга» бьёт только лису: спутники рядом с ней ни при чём.
function sting(G, z) {
  const P = G.player;
  if (P.dash || P.down > 0 || !inZone(z, P.x, P.y, 3)) return;
  hurtPlayer(G, 1, z.x, z.y, 'zone');
}

// очки за задание — над лисой, монеты — к её лапам
function prize(G, pts, coins = 0) {
  const P = G.player;
  addScore(G, pts, P.x, P.y - 12);
  if (coins > 0) dropCoins(G, P.x, P.y, coins + G.floor);
}

// ---------- задания ----------

export const TASKS = {
  // Три пенька: каждый ломается только рывком.
  stumps: {
    name: 'Три пенька', text: 'Сломай рывком три пенька', time: 12,
    start(G, room, r) {
      const task = room.task;
      const q = QUEST.stumps;
      const stumps = [];
      for (let i = 0; i < q.n; i++) {
        const p = freeSpot(G, 2.5 * T, 9 * T, r);
        // пень выдерживает любой выстрел: ломает его только рывок
        const th = p && addThing(G, { kind: 'stump', x: p.x, y: p.y, r: 11, breakable: true, hp: 99, tag: TAG });
        if (th) stumps.push(th);
      }
      if (stumps.length < q.n) {
        dropThings(G, stumps, true);
        return false;
      }
      task.data.things = stumps;
      task.goal = q.n;
      return true;
    },
    onBreak(G, task, th) {
      if (th.tag !== TAG) return;
      task.n += 1;
      addScore(G, QUEST.stumps.each, th.x, th.y);
    },
    step: (G, task) => (task.n >= task.goal ? 'ok' : 'run'),
    finish(G, task, ok) {
      dropThings(G, task.data.things);
      if (ok) prize(G, QUEST.stumps.pts, QUEST.stumps.coins);
    },
  },

  // Золотой кролик: один, очень быстрый; уйдёт в нору — провал. Очки и монеты за него самого — как за обычного.
  goldrush: {
    name: 'Золотой кролик', text: 'Поймай золотого кролика, пока не сбежал', time: 8, weight: 0.7,
    start(G, room, r) {
      const task = room.task;
      const P = G.player;
      // из норы не под носом у лисы, но и не с другого конца комнаты: ближайшая из дальних
      let at = null;
      let best = Infinity;
      let far = null;
      let farD = -1;
      for (let i = 0; i < room.burrows.length; i++) {
        const b = room.burrows[i];
        const d = Math.hypot(b.x - P.x, b.y - P.y);
        if (d > farD) {
          farD = d;
          far = b;
        }
        if (d >= QUEST.goldrush.far && d < best) {
          best = d;
          at = b;
        }
      }
      const m = popPrey(G, 'gold', at ?? far ?? freeSpot(G, QUEST.goldrush.far, 9 * T, r));
      if (!m) return false;
      task.data.prey = [m];
      task.goal = 1;
      return true;
    },
    onCatch(G, task, m) {
      if (m === task.data.prey[0]) task.n = 1;
    },
    // пропал непойманным (сам ушёл в нору) — провал
    step: (G, task) => (task.n >= task.goal ? 'ok' : task.data.prey[0].dead ? 'fail' : 'run'),
    finish(G, task, ok) {
      sendHome(task.data.prey);
      if (ok) prize(G, QUEST.goldrush.pts);
    },
  },

  // Ведьмин круг: кольцо грибов, внутри которого надо простоять четыре секунды (не обязательно подряд), пока
  // туда падают красные круги — через раз прямо под лапы, так что на месте не отстоишься.
  ring: {
    name: 'Ведьмин круг', text: 'Постой в грибном круге четыре секунды', time: 10, minFloor: 2,
    start(G, room, r) {
      const task = room.task;
      const q = QUEST.ring;
      let cx = 0;
      let cy = 0;
      let found = false;
      for (let k = 0; k < 12 && !found; k++) {
        const p = freeSpot(G, 2.5 * T, 7 * T, r);
        if (!p) break;
        cx = p.x;
        cy = p.y;
        found = roomy(room, cx, cy, q.r);
      }
      if (!found) return false;
      const caps = [];
      const turn = r() * TAU;
      for (let i = 0; i < q.caps; i++) {
        const a = turn + (i / q.caps) * TAU;
        const x = cx + Math.cos(a) * q.r;
        const y = cy + Math.sin(a) * q.r;
        if (blockedAt(room, x, y, F_WALK)) continue;        // гриб в воде или в дереве не растёт
        const th = addThing(G, { kind: 'toadstool', v: i % 3, x, y, r: 5, solid: false, tag: TAG });
        if (th) caps.push(th);
      }
      if (caps.length < q.caps - 2) {
        dropThings(G, caps, true);
        return false;
      }
      const d = task.data;
      d.things = caps;
      d.x = cx;
      d.y = cy;
      d.r = q.r;
      d.in = 0;                               // сколько секунд лиса уже простояла внутри
      d.next = q.gap;                         // через сколько упадёт следующий красный круг
      d.k = 0;
      task.goal = q.need;
      return true;
    },
    step(G, task, dt) {
      const q = QUEST.ring;
      const d = task.data;
      const P = G.player;
      const inside = P.down <= 0 && Math.hypot(P.x - d.x, P.y - d.y) <= d.r;
      if (inside) d.in += dt;
      task.n = Math.min(task.goal, Math.floor(d.in + 1e-6));
      if (d.in >= q.need - 1e-6) return 'ok';
      d.next -= dt;
      if (d.next <= 0) {
        d.next += q.gap;
        d.k += 1;
        let x = P.x;
        let y = P.y;
        if (!inside || d.k % 2 === 0) {
          const a = rnd(G) * TAU;
          const far = Math.sqrt(rnd(G)) * (d.r - q.zoneR);
          x = d.x + Math.cos(a) * far;
          y = d.y + Math.sin(a) * far;
        }
        // сама зона без урона: бьёт её обработчик — и только лису
        addZone(G, { shape: 'circle', x, y, r: q.zoneR, t: q.warn, dmg: 0, from: 1, tag: TAG, on: sting });
      }
      return 'run';
    },
    finish(G, task, ok) {
      dropZones(G.room);
      dropThings(G, task.data.things);
      if (!ok) return;
      const P = G.player;
      prize(G, QUEST.ring.pts);
      for (let i = 0; i < QUEST.ring.orbs; i++) addPick(G, 'mana', P.x, P.y, PICK.mana);
    },
  },

  // Ягодная поляна: шесть ягод кучкой. Каждая лечит, как ягода кролика-толстяка; несобранные пропадают.
  berries: {
    name: 'Ягодная поляна', text: 'Собери шесть ягод', time: 8,
    start(G, room, r) {
      const task = room.task;
      const q = QUEST.berries;
      if (room.picks.length > CAPS.picks - 2 * q.n) return false;
      const c = freeSpot(G, 2.5 * T, 6 * T, r);
      if (!c) return false;
      const cx = c.x;
      const cy = c.y;
      const xs = [];
      const ys = [];
      for (let k = 0; k < 80 && xs.length < q.n; k++) {
        const a = r() * TAU;
        const far = Math.sqrt(r()) * q.spread;
        const x = cx + Math.cos(a) * far;
        const y = cy + Math.sin(a) * far;
        if (!quiet(room, x, y, 7)) continue;
        let close = false;
        for (let i = 0; i < xs.length && !close; i++) close = Math.hypot(xs[i] - x, ys[i] - y) < q.gap;
        if (close) continue;
        xs.push(x);
        ys.push(y);
      }
      if (xs.length < q.n) return false;
      for (let i = 0; i < q.n; i++) {
        const p = addPick(G, 'berry', xs[i], ys[i], q.heal, null, 0, false);
        if (p) p.tag = TAG;
      }
      task.goal = q.n;
      return true;
    },
    onPick(G, task, p) {
      if (p.tag === TAG && task.n < task.goal) task.n += 1;
    },
    step: (G, task) => (task.n >= task.goal ? 'ok' : 'run'),
    finish(G, task, ok) {
      dropPicks(G);
      if (ok) prize(G, QUEST.berries.pts);
    },
  },

  // Мишени: падают от чего угодно — рывка, выстрела, взрыва, ореха белки.
  targets: {
    name: 'Мишени', text: 'Попади в четыре мишени — рывком или выстрелом', time: 10,
    start(G, room, r) {
      const task = room.task;
      const q = QUEST.targets;
      const list = [];
      for (let i = 0; i < q.n; i++) {
        const p = freeSpot(G, 3 * T, 10 * T, r);
        // прочность меньше любого урона: хватит одного попадания чем угодно
        const th = p && addThing(G, { kind: 'target', x: p.x, y: p.y, r: 10, breakable: true, hp: 0.1, tag: TAG });
        if (th) list.push(th);
      }
      if (list.length < q.n) {
        dropThings(G, list, true);
        return false;
      }
      task.data.things = list;
      task.goal = q.n;
      return true;
    },
    onBreak(G, task, th) {
      if (th.tag !== TAG) return;
      task.n += 1;
      addScore(G, QUEST.targets.each, th.x, th.y);
    },
    step(G, task) {
      // сбитая мишень пропадает сразу: у неё нет картинки «сломана» (убирать её прямо в onBreak нельзя —
      // движок в этот миг идёт по списку предметов)
      const list = task.data.things;
      for (let i = 0; i < list.length; i++) if (list[i].broken) removeThing(G.room, list[i]);
      return task.n >= task.goal ? 'ok' : 'run';
    },
    finish(G, task, ok) {
      dropThings(G, task.data.things);
      if (ok) prize(G, QUEST.targets.pts, QUEST.targets.coins);
    },
  },

  // Бабочка: не зверь, а предмет, который задание само водит по комнате. Мечется куда попало, а от лисы
  // упархивает быстрее, чем та идёт, — догонять рывком. Поймана, когда лиса задела её телом или в рывке.
  butterfly: {
    name: 'Бабочка', text: 'Поймай бабочку', time: 10,
    start(G, room, r) {
      const q = QUEST.butterfly;
      const p = freeSpot(G, 3 * T, 7 * T, r);
      const th = p && addThing(G, { kind: 'butterfly', x: p.x, y: p.y, r: q.r, solid: false, tag: TAG });
      if (!th) return false;
      const d = room.task.data;
      d.things = [th];
      d.a = r() * TAU;                        // куда летит
      d.sp = q.speed;
      d.turn = 0;                             // через сколько снова сменит направление
      d.scared = 0;
      room.task.goal = 1;
      return true;
    },
    step(G, task, dt) {
      if (task.n >= task.goal) return 'ok';
      const q = QUEST.butterfly;
      const room = G.room;
      const P = G.player;
      const d = task.data;
      const th = d.things[0];
      const dx = th.x - P.x;
      const dy = th.y - P.y;
      const far = Math.hypot(dx, dy);
      d.turn -= dt;
      // лиса совсем рядом — шарахается сразу, не дожидаясь своего поворота
      if (far < q.shy && !d.scared) {
        d.scared = 1;
        d.turn = 0;
      } else if (far > q.near) d.scared = 0;
      if (d.turn <= 0) {
        d.turn = rand(G, 0.25, 0.7);
        if (far < q.near) {
          d.a = Math.atan2(dy, dx) + rand(G, -1, 1);
          d.sp = q.dart;
        } else {
          d.a = rnd(G) * TAU;
          d.sp = q.speed;
        }
      }
      const x = th.x + Math.cos(d.a) * d.sp * dt;
      const y = th.y + Math.sin(d.a) * d.sp * dt;
      // держится над местами, куда лиса может дойти: упёрлась — летит в другую сторону
      if (blockedAt(room, x + Math.cos(d.a) * 8, y + Math.sin(d.a) * 8, F_WALK | F_MOB)) d.a = rnd(G) * TAU;
      else {
        th.x = x;
        th.y = y;
      }
      th.face = Math.cos(d.a) >= 0 ? 1 : -1;
      th.v = Math.floor(task.t * 10) & 1;
      th.z = 9 + 3 * Math.sin(task.t * 8);
      if (P.down <= 0 && segDist2(P.px, P.py, P.x, P.y, th.x, th.y) <= q.reach * q.reach) {
        task.n = 1;
        sfx(G, 'catch', th.x, th.y, 1);
        haptic(G, 'light');
        return 'ok';
      }
      return 'run';
    },
    finish(G, task, ok) {
      const th = task.data.things[0];
      if (ok) addScore(G, QUEST.butterfly.pts, th.x, th.y);
      dropThings(G, task.data.things);
    },
  },

  // Быстрая охота: из нор разом выскакивают кролики, поймать надо четырёх. Очки за самих кроликов — обычные.
  speedhunt: {
    name: 'Быстрая охота', text: 'Поймай четырёх кроликов', time: 10,
    start(G, room, r) {
      const task = room.task;
      const q = QUEST.speedhunt;
      const prey = [];
      for (let i = 0; i < q.rabbits; i++) {
        const m = popPrey(G, 'rabbit', room.burrows.length ? r.pick(room.burrows) : freeSpot(G, 3 * T, 1e9, r));
        if (m) prey.push(m);
      }
      if (prey.length < q.n) {
        for (let i = 0; i < prey.length; i++) prey[i].dead = true;
        return false;
      }
      task.data.prey = prey;
      task.goal = q.n;
      return true;
    },
    onCatch(G, task) {
      if (task.n < task.goal) task.n += 1;
    },
    step: (G, task) => (task.n >= task.goal ? 'ok' : 'run'),
    finish(G, task, ok) {
      sendHome(task.data.prey);
      if (ok) prize(G, QUEST.speedhunt.pts);
    },
  },

  // Чистая охота: идёт всю следующую волну; любой удар по лисе (и принятый щитом) — провал.
  flawless: {
    name: 'Чистая охота', text: 'Пройди волну без единого удара', during: 'wave', minFloor: 2, weight: 0.8,
    start(G, room) {
      room.task.data.hurt = G.cnt.hurt;
      return true;
    },
    step: (G, task) => (G.cnt.hurt > task.data.hurt ? 'fail' : 'run'),
    finish(G, task, ok) {
      if (ok) prize(G, QUEST.flawless.pts, QUEST.flawless.coins);
    },
  },
};
