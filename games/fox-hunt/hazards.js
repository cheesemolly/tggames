// Напасти «Лисьей охоты»: то, что случается с комнатой само, пока идёт волна, — лось пробегает насквозь,
// медведь бьёт лапой, падают сосульки. Каждая напасть — красная зона (или несколько): сначала предупреждение,
// потом удар. Только описания.
//
// Запись — { id: { name, biomes?, minFloor?, intro?, auto?, fire(G, room, rnd) } }:
//   moose: {
//     name: 'Лось',
//     biomes: ['forest', 'taiga'],   // в каких местах бывает (нет поля — в любых)
//     minFloor: 1,                   // с какой локации
//     intro: 1,                      // на самой первой локации — с какой по счёту охотничьей комнаты (0 — сразу)
//     auto: false,                   // не выбирать в комнаты самой (только по вызову: молния «Грозы» — через MODS.hazards)
//     fire(G, room, rnd) {           // сработать один раз: поставить красные зоны
//       …addZone(G, { shape: 'lane', x, y, x2, y2, w: 46, t: 1.1, dmg: 1, hitsMobs: true, run: { speed: 540 } });
//     },
//   }
// Когда и как часто звать fire, решает движок (director.js и balance.js): только во время волны, раз в 7–11 с
// на первой локации и до 3,5–6 с дальше, и так, чтобы два удара не пришлись ближе 1,2 с друг к другу. Поэтому
// предупреждать надо не короче 0,8 с (меньшее движок сам растянет), а «очередь» ударов делать задержкой delay.
//
// Что нужно для fire:
//   • из world.js: addZone(G, {…}) — зона (все поля описаны у функции): shape 'circle' | 'lane' | 'cone' | 'ring',
//     t — сколько предупреждает, delay — когда появится, dmg, hitsMobs (задевает и зверей), run { speed } — по
//     полосе пробегает тело, linger — остаётся вредной, slow / root — действие на лису, actor — фигура в момент
//     удара ('haz.moose', 'haz.paw'), on(G, zone) — что ещё сделать в момент удара;
//     laneThrough(room, x, y, угол) → { x1, y1, x2, y2 } — полоса через всю комнату (общий объект: прочитать сразу);
//     freeSpot(G, min, max, rnd) → { x, y } | null — свободная клетка на расстоянии от лисы;
//     castRay(room, x1, y1, x2, y2, F_SHOT) → доля пути до первого дерева или стены;
//     addActor(room, 'haz.moose' | 'haz.paw', x, y, vx, vy, сколько живёт, поза) — фигура без удара, только для вида;
//   • G.player — лиса: x, y, vx, vy (для упреждения); room.w, room.h — размер в клетках (клетка T = 32);
//   • rnd — случайность партии: rnd() → 0…1, rnd.range(a, b), rnd.int(a, b), rnd.chance(p), rnd.pick(список);
//   • из core.js: sfx(G, 'имя', x, y), shake(G, сила).
//
// Что здесь есть: лось и медведь — в любом месте; у каждого места, кроме леса, — своя напасть (болотный газ,
// сосульки, обвал, выстрел); молния бьёт только в комнате с «Грозой». Всё, кроме выстрела, задевает и зверей:
// врага можно подвести под удар.
//
// Фигуры лося и лапы ставятся отсюда, а не полем actor зоны: по общему списку поз лось бежит в позе 'run', а
// лапа бьёт в позе 'strike' — тень растёт всё предупреждение, удар приходится на середину (k ≈ 0,5). Поле actor
// у зон оставлено (по нему рисование знает, чья зона), но в момент удара снимается — иначе движок поставил бы
// вторую фигуру.

import { T, TAU, F_SHOT, clamp, sfx, shake } from './core.js';
import { addZone, addActor, laneThrough, castRay, freeSpot } from './world.js';

// точка не вплотную к стене
const inX = (room, x, pad = 20) => clamp(x, T + pad, room.w * T - T - pad);
const inY = (room, y, pad = 20) => clamp(y, T + pad, room.h * T - T - pad);
// где лиса окажется через t секунд, если не свернёт
const aheadX = (G, room, t) => inX(room, G.player.x + clamp(G.player.vx, -160, 160) * t);
const aheadY = (G, room, t) => inY(room, G.player.y + clamp(G.player.vy, -160, 160) * t);

// ---------- что происходит в момент удара ----------

function mooseRuns(G, z) {
  const sp = z.run.speed;
  z.actor = null;
  addActor(G.room, 'haz.moose', z.x, z.y, Math.cos(z.a) * sp, Math.sin(z.a) * sp, Math.hypot(z.x2 - z.x, z.y2 - z.y) / sp, 'run');
  shake(G, 0.2);
}
function pawHits(G, z) {
  z.actor = null;
  sfx(G, 'paw', z.x, z.y);
  shake(G, 0.5);
}
const gasPops = (G, z) => sfx(G, 'boom', z.x, z.y);
const iceBreaks = (G, z) => sfx(G, 'ice', z.x, z.y);
function rockLands(G, z) {
  sfx(G, 'boom', z.x, z.y);
  shake(G, 0.2);
}
function gunFires(G, z) {
  sfx(G, 'heavy', z.x, z.y);
  shake(G, 0.15);
}
function boltStrikes(G, z) {
  sfx(G, 'zap', z.x, z.y);
  shake(G, 0.35);
}

// Лапа: красный круг, а над ним — лапа, которая опускается всё предупреждение и бьёт вместе с кругом.
function paw(G, room, x, y, r, t) {
  const z = addZone(G, { shape: 'circle', x, y, r, t, dmg: 1, hitsMobs: true, actor: 'haz.paw', on: pawHits });
  if (z) addActor(room, 'haz.paw', x, y, 0, 0, z.total * 2, 'strike');
  return z;
}

// Тонкая полоса выстрела через точку (x, y) под углом a: от края комнаты до первого дерева или стены.
// false — стрелять неоткуда (у самого края дерево).
function gunLane(G, room, x, y, a, delay) {
  const l = laneThrough(room, x, y, a);
  const x1 = l.x1;
  const y1 = l.y1;
  const dx = l.x2 - x1;
  const dy = l.y2 - y1;
  const k = castRay(room, x1 + Math.cos(a) * 2, y1 + Math.sin(a) * 2, x1 + dx, y1 + dy, F_SHOT);
  if (Math.hypot(dx, dy) * k < 96) return false;
  addZone(G, { shape: 'lane', x: x1, y: y1, x2: x1 + dx * k, y2: y1 + dy * k, w: 16, t: 0.8, delay, dmg: 1, kb: 160, on: gunFires });
  return true;
}

export const HAZARDS = {
  moose: {
    name: 'Лось', intro: 1,
    fire(G, room, rnd) {
      const P = G.player;
      // через раз лось несётся мимо лисы, через раз — куда глаза глядят, и тогда может её вовсе не задеть
      const near = rnd() >= 0.5;
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      let best = -1;
      // из трёх случайных направлений — самое длинное: лось бежит через всю комнату, а не срезает угол
      for (let k = 0; k < 3; k++) {
        const cx = near ? P.x + rnd.range(-18, 18) : rnd.range(2 * T, room.w * T - 2 * T);
        const cy = near ? P.y + rnd.range(-18, 18) : rnd.range(2 * T, room.h * T - 2 * T);
        const l = laneThrough(room, cx, cy, rnd.range(0, TAU));
        const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
        if (len <= best) continue;
        best = len;
        x1 = l.x1;
        y1 = l.y1;
        x2 = l.x2;
        y2 = l.y2;
      }
      addZone(G, {
        shape: 'lane', x: x1, y: y1, x2, y2, w: 46, t: 1.1, dmg: 1, hitsMobs: true, kb: 220, run: { speed: 540 }, actor: 'haz.moose', on: mooseRuns,
      });
      sfx(G, 'moose', x1, y1);
    },
  },

  bear: {
    name: 'Медведь', intro: 2,
    fire(G, room) {
      // лапа бьёт туда, куда лиса идёт
      paw(G, room, aheadX(G, room, 0.35), aheadY(G, room, 0.35), 54, 1);
    },
  },

  geyser: {
    name: 'Болотный газ', biomes: ['swamp'],
    fire(G, room, rnd) {
      const P = G.player;
      // три пузыря: один под лисой, два — рядом, куда тянет отойти; лопаются по очереди и ещё секунду висят облаком
      const turn = rnd.range(0, TAU);
      for (let i = 0; i < 3; i++) {
        const a = turn + (i * TAU) / 3 + rnd.range(-0.35, 0.35);
        const d = i === 0 ? rnd.range(0, 12) : rnd.range(64, 92);
        addZone(G, {
          shape: 'circle', x: inX(room, P.x + Math.cos(a) * d), y: inY(room, P.y + Math.sin(a) * d), r: 30, t: 0.9, delay: i * 0.3,
          dmg: 1, hitsMobs: true, mobDmg: 2, linger: 1.2, look: 'poison', on: gasPops,
        });
      }
    },
  },

  icicles: {
    name: 'Сосульки', biomes: ['taiga'],
    fire(G, room, rnd) {
      const P = G.player;
      // четыре сосульки цепочкой: первая — под лису, остальные — дальше по её ходу (стоит — в случайную сторону)
      const run = Math.hypot(P.vx, P.vy) > 30;
      const a = run ? Math.atan2(P.vy, P.vx) : rnd.range(0, TAU);
      let x = P.x;
      let y = P.y;
      for (let i = 0; i < 4; i++) {
        addZone(G, {
          shape: 'circle', x: inX(room, x), y: inY(room, y), r: 26, t: 0.9, delay: i * 0.28, dmg: 1, hitsMobs: true, slow: 1.2, on: iceBreaks,
        });
        const b = a + rnd.range(-0.7, 0.7);
        x += Math.cos(b) * 52;
        y += Math.sin(b) * 52;
      }
    },
  },

  rockfall: {
    name: 'Обвал', biomes: ['cave'],
    fire(G, room, rnd) {
      const P = G.player;
      // камни сыплются рядом через лису, волной от одного конца к другому; какой по счёту упадёт на неё — случай
      const a = rnd.range(0, TAU);
      const mine = rnd.int(1, 3);
      let first = true;
      for (let i = 0; i < 5; i++) {
        const d = (i - mine) * 54;
        const x = P.x + Math.cos(a) * d + rnd.range(-8, 8);
        const y = P.y + Math.sin(a) * d + rnd.range(-8, 8);
        // что пришлось бы на стену — не падает
        if (x !== inX(room, x, 8) || y !== inY(room, y, 8)) continue;
        addZone(G, { shape: 'circle', x, y, r: 28, t: 0.95, delay: first ? 0 : i * 0.16, dmg: 1, hitsMobs: true, on: rockLands });
        first = false;
      }
    },
  },

  gunshot: {
    name: 'Выстрел', biomes: ['autumn'],
    fire(G, room, rnd) {
      // охотник бьёт из-за деревьев: тонкая полоса от края комнаты туда, куда лиса идёт; за деревом можно укрыться
      const x = aheadX(G, room, 0.3);
      const y = aheadY(G, room, 0.3);
      let shots = G.loop >= 1 ? 2 : 1;          // со второго круга — дуплетом, с двух сторон
      for (let k = 0; k < 6 && shots > 0; k++) {
        if (gunLane(G, room, x, y, rnd.range(0, TAU), shots === 1 && G.loop >= 1 ? 0.45 : 0)) shots -= 1;
      }
    },
  },

  lightning: {
    name: 'Молния', auto: false,
    fire(G, room, rnd) {
      const P = G.player;
      // одна бьёт рядом с лисой (не всегда прямо в неё), вторая — куда придётся
      const a = rnd.range(0, TAU);
      const d = rnd.range(0, 46);
      addZone(G, {
        shape: 'circle', x: inX(room, P.x + Math.cos(a) * d), y: inY(room, P.y + Math.sin(a) * d), r: 42, t: 0.9, dmg: 1, hitsMobs: true, on: boltStrikes,
      });
      const far = freeSpot(G, 90, 1e9, rnd);
      if (far) addZone(G, { shape: 'circle', x: far.x, y: far.y, r: 42, t: 0.9, delay: 0.4, dmg: 1, hitsMobs: true, on: boltStrikes });
    },
  },
};
