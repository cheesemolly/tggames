// Спутники лисы: маленькие звери, которых нанимают в привале. Ходят за лисой и дерутся сами. Только описания.
//
// Запись — { id: спутник }:
//   hedgie: {
//     name: 'Ёжик',
//     hp: 6,                 // здоровье (дар «стая» прибавляет половину); без здоровья спутник выбывает насовсем
//     r: 8,                  // радиус
//     speed: 150,            // как быстро бегает за лисой (лиса ходит 132)
//     price: 25,             // цена найма в монетах
//     desc: '…',             // одна фраза для карточки (до 60 знаков)
//     taunt: true,           // по желанию: приманка — враги рядом бросаются на него, а не на лису
//     flying: true, z: 16,   // по желанию: летает (преграды не мешают) на такой высоте
//     think(n, G, dt, ai) {} // раз в шаг: куда идти и что делать
//   }
// think устроена как у зверей (см. начало ai.js): состояние n.state и время в нём n.t, счётчик n.cd, свои числа
// n.data, поза n.act / n.k. «Цель» для спутника — лиса: ai.dist(n, G) — расстояние до неё.
// Чем пользоваться:
//   ai.follow(n, G, speed)        держаться возле лисы (в обход преград)
//   ai.foe(n, G, range)           ближайший враг в радиусе или null (у врага есть x, y, r)
//   ai.hit(n, G, mob, dmg, kb)    ударить врага (kb — отбрасывание)
//   ai.palShoot(n, G, ang, spec)  выстрелить (spec — как shot у оружия, урон — spec.dmg)
//   ai.angleTo(n, mob), ai.distTo(n, mob), ai.move, ai.stop, ai.charge, ai.bumped, ai.goTo, ai.leap, ai.pose, ai.go
// Движок сам: ставит спутников рядом с лисой при входе в комнату, подтягивает отставших, бьёт их врагами (касание,
// выстрелы, красные зоны — по единице), подлечивает на единицу после зачищенной комнаты.
// Нанять: hireMinion(G, id) из ai.js (false — нет места: их два, с даром «стая» — три).
// Спутник, который делает что-то не с врагами (собирает монеты, даёт ману), берёт нужное из world.js / player.js:
// G.room.picks — подбираемое (у каждого kind, x, y; поставить pick.pull = true — и оно само полетит к лисе
// откуда угодно), addMana(G, n).
//
// Что общего у всех шестерых:
//   • цель — только враг: ai.foe добычу не видит, а стрелки не бросают, пока на линии броска кролик. Ловить
//     добычу — дело лисы;
//   • далеко от лисы в драку не лезут (LEASH), из красных зон уходят сами, а между ударами держатся на шаг от
//     врага: здоровья у них мало, и оно не возвращается;
//   • вся команда вместе бьёт заметно слабее лисы: спутники помогают, а не играют за игрока. С локациями их
//     урон не растёт — чем дальше, тем их доля меньше;
//   • в n.data — только числа: угол удара a и свои счётчики.
// Свои позы (сверх общих 'idle', 'move', 'windup', 'attack', 'hurt'): ёжик — 'roll', волчонок — 'leap',
// белка — 'carry' (бежит с добычей).

import { segDist2, emit } from './core.js';
import { POSE, PICK } from './balance.js';
import { hasLos, dangerAt, escapeDir, DIR } from './world.js';
import { addMana } from './player.js';

const LEASH = 240;                          // дальше от лисы спутник не дерётся — возвращается к ней
const FETCH = 280;                          // белка не бегает за тем, что лежит дальше от лисы
const MANA = 0.5;                           // светлячок: маны в секунду

// волчонок: сколько летит к врагу и обратно, сколько не долетает, как далеко отпрыгивает, пауза между укусами
const CUB = Object.freeze({ in: 0.2, out: 0.16, gap: 7, bite: 0.08, back: 36, cd: 0.8 });

const FEATHER = Object.freeze({ look: 'shot.feather', speed: 320, r: 4, dmg: 1, range: 240, z: 16 });
const NUT = Object.freeze({ look: 'shot.nut', speed: 270, r: 4, dmg: 1, range: 220, spin: true });

// ---------- общее ----------

// Только что ударенный вздрагивает; «идёт» и «стоит» движок поставит сам.
function flinch(n, ai) {
  if (n.flash > 0) ai.pose(n, 'hurt', 1 - n.flash / POSE.flash);
}

// Из красной зоны спутник уходит кратчайшим путём. true — уходит, остальное подождёт.
function dodge(n, G, ai) {
  const z = dangerAt(G.room, n.x, n.y, n.r + 3);
  if (!z) return false;
  escapeDir(z, n.x, n.y);
  ai.move(n, Math.atan2(DIR.y, DIR.x), n.def.speed * 1.15);
  return true;
}

// Колючего (свернувшийся ёж, жук спереди) в лоб не бьют: ждут, пока раскроется.
const spiky = (m, G, n) => Boolean(m.def.spiky && m.def.spiky(m, G, n.x, n.y));

// Отойти от врага, если до него (от края до края) меньше gap. Начав отходить, отходит с запасом — чтобы не
// топтаться на границе. true — отходит.
function backOff(n, ai, m, gap, speed) {
  const d = n.data;
  if (!m || ai.distTo(n, m) - m.r - n.r > gap + (d.shy ? 10 : 0)) {
    d.shy = 0;
    return false;
  }
  d.shy = 1;
  ai.move(n, ai.angleTo(m, n), speed);
  return true;
}

// Есть ли добыча на линии броска: спутник не должен ловить кроликов вместо лисы.
function preyInWay(G, n, m) {
  const mobs = G.room.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const p = mobs[i];
    if (p.dead || p.kind !== 0) continue;
    const rr = p.r + 14;
    if (segDist2(n.x, n.y, m.x, m.y, p.x, p.y) <= rr * rr) return true;
  }
  return false;
}

// Можно ли бросать во врага: его видно, и на пути нет добычи.
const clear = (n, G, m) => hasLos(G.room, n.x, n.y, m.x, m.y) && !preyInWay(G, n, m);

// Бросок с упреждением — туда, где враг будет, когда снаряд долетит.
function throwAt(n, G, m, spec, ai) {
  const t = ai.distTo(n, m) / spec.speed;
  const a = Math.atan2(m.y + m.vy * t - n.y, m.x + m.vx * t - n.x);
  n.data.a = a;
  n.face = Math.cos(a) >= 0 ? 1 : -1;
  return ai.palShoot(n, G, a, spec);
}

// Что белке нести: ближайшее к ней из того, что лисе сейчас пригодится. Вещи, предметы заданий и то, что лиса
// и так вот-вот подберёт, не трогает.
function pickFor(G, n) {
  const room = G.room;
  const P = G.player;
  const st = P.st;
  if (P.down > 0) return null;
  const picks = room.picks;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (p.kind === 'item' || p.tag || p.pull || p.t < PICK.delay || p.z > 0 || p.vx !== 0 || p.vy !== 0) continue;
    // в зачищенной комнате монеты и мана летят к лисе сами
    if (p.kind === 'coin' ? room.vacuum : p.kind === 'mana' ? room.vacuum || P.mana >= st.maxMana : P.hp >= st.maxHp) continue;
    const far = (p.x - P.x) * (p.x - P.x) + (p.y - P.y) * (p.y - P.y);
    if (far > FETCH * FETCH || far < st.magnet * st.magnet) continue;
    const d = (p.x - n.x) * (p.x - n.x) + (p.y - n.y) * (p.y - n.y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

// ---------- спутники ----------

export const MINIONS = {
  // Ёжик: разгоняется, бьёт собой и отскакивает, как мячик. Простой и надёжный.
  hedgie: {
    name: 'Ёжик', hp: 6, r: 8, speed: 150, price: 25,
    desc: 'Катится в ближнего врага колючим шаром.',
    // свои позы: 'roll' — катится
    think(n, G, dt, ai) {
      if (n.state === 'roll') {
        ai.pose(n, 'roll', (n.t * 3) % 1);
        const m = ai.foe(n, G, 60);
        if (m && ai.distTo(n, m) < m.r + n.r + 6) {
          // удар приходится за шаг до касания: вплотную к тому, кто кусается, ёжик не подкатывается
          ai.hit(n, G, m, 2, 160);
          n.cd = 2.1;
          ai.charge(n, n.data.a + Math.PI, 130);
          ai.go(n, 'bounce');
          return;
        }
        ai.charge(n, n.data.a, 250);
        if (n.t >= 0.6 || (n.t > 0.05 && ai.bumped(n))) {
          n.cd = 0.8;
          ai.go(n, 'back');
        }
        return;
      }
      if (n.state === 'bounce') {
        ai.charge(n, n.data.a + Math.PI, 130);
        ai.pose(n, 'roll', (n.t * 3) % 1);
        if (n.t >= 0.22 || (n.t > 0.05 && ai.bumped(n))) ai.go(n, 'back');
        return;
      }
      // рядом с лисой; увидел врага — покатился
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 150);
      const near = ai.dist(n, G) < LEASH;
      if (!near || !backOff(n, ai, m, 14, n.def.speed)) ai.follow(n, G, n.def.speed);
      flinch(n, ai);
      if (!m || !near || n.cd > 0 || spiky(m, G, n)) return;
      n.data.a = ai.angleTo(n, m);
      ai.go(n, 'roll');
    },
  },

  // Совёнок: летает над преградами, бьёт издалека и сам к врагам не лезет. Хрупкий.
  owlet: {
    name: 'Совёнок', hp: 4, r: 7, speed: 150, price: 34, flying: true, z: 16,
    desc: 'Летает рядом и мечет перья во врагов издалека.',
    think(n, G, dt, ai) {
      if (n.state === 'aim') {
        // завис и целится
        ai.stop(n);
        ai.pose(n, 'windup', n.t / 0.3);
        if (n.t < 0.3) return;
        const m = ai.foe(n, G, 210);
        if (m && clear(n, G, m)) {
          throwAt(n, G, m, FEATHER, ai);
          n.cd = 1;
          ai.go(n, 'throw');
        } else {
          n.cd = 0.3;
          ai.go(n, 'fly');
        }
        return;
      }
      if (n.state === 'throw') {
        ai.stop(n);
        ai.pose(n, 'attack', n.t / 0.25);
        if (n.t >= 0.25) ai.go(n, 'fly');
        return;
      }
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 180);
      const near = ai.dist(n, G) < LEASH;
      if (!near || !backOff(n, ai, m, 48, n.def.speed)) ai.follow(n, G, n.def.speed);
      flinch(n, ai);
      if (m && near && n.cd <= 0 && clear(n, G, m)) ai.go(n, 'aim');
    },
  },

  // Волчонок: прыжок к врагу, укус — и прыжок назад. Кусает слабо, но часто.
  cub: {
    name: 'Волчонок', hp: 7, r: 8, speed: 180, price: 30,
    desc: 'Прыгает на врагов и быстро кусает.',
    // свои позы: 'leap' — прыжок
    think(n, G, dt, ai) {
      if (n.state === 'crouch') {
        ai.stop(n);
        ai.pose(n, 'windup', n.t / 0.15);
        if (n.t < 0.15) return;
        const m = ai.foe(n, G, 150);
        if (!m || spiky(m, G, n)) {
          n.cd = 0.3;
          ai.go(n, 'run');
          return;
        }
        // прыгает к врагу, а не в него самого — туда, где тот окажется: до касания остаётся шаг.
        // Враг и так рядом — кусает с места
        const reach = m.r + n.r + CUB.gap;
        n.data.a = ai.angleTo(n, m);
        if (ai.distTo(n, m) > reach + 6) {
          const mx = m.x + m.vx * CUB.in;
          const my = m.y + m.vy * CUB.in;
          const a = Math.atan2(my - n.y, mx - n.x);
          const d = Math.hypot(mx - n.x, my - n.y) - reach;
          if (d > 0) ai.leap(n, G, n.x + Math.cos(a) * d, n.y + Math.sin(a) * d, CUB.in, 9, 'leap');
        }
        ai.go(n, 'bite');
        return;
      }
      if (n.state === 'bite') {
        // приземлился: пока летел, сюда не заходили
        ai.stop(n);
        if (n.t === 0) {
          const m = ai.foe(n, G, 60);
          if (!m || ai.distTo(n, m) > m.r + n.r + CUB.gap + 10) {
            // враг ушёл или прыжок не вышел
            n.cd = 0.4;
            ai.go(n, 'run');
            return;
          }
          n.data.a = ai.angleTo(n, m);
          n.face = m.x >= n.x ? 1 : -1;
          ai.hit(n, G, m, 1, 70);
        }
        ai.pose(n, 'attack', n.t / CUB.bite);
        if (n.t >= CUB.bite) {
          // куснул — и сразу отпрыгнул: рядом с тем, кто кусается в ответ, не задерживается
          n.cd = CUB.cd;
          ai.leap(n, G, n.x - Math.cos(n.data.a) * CUB.back, n.y - Math.sin(n.data.a) * CUB.back, CUB.out, 7, 'leap');
          ai.go(n, 'run');
        }
        return;
      }
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 140);
      const near = ai.dist(n, G) < LEASH;
      if (!near || !backOff(n, ai, m, 20, n.def.speed * 0.8)) ai.follow(n, G, n.def.speed);
      flinch(n, ai);
      if (m && near && n.cd <= 0 && !spiky(m, G, n)) ai.go(n, 'crouch');
    },
  },

  // Светлячок: держится у лисы и по капле возвращает ей ману; врага, который подошёл близко, бьёт искрой.
  firefly: {
    name: 'Светлячок', hp: 3, r: 5, speed: 165, price: 30, flying: true, z: 13,
    desc: 'Понемногу возвращает ману и бьёт врагов искрой.',
    think(n, G, dt, ai) {
      const near = ai.dist(n, G) < 150;
      if (near) addMana(G, MANA * dt);
      if (n.state === 'zap') {
        ai.stop(n);
        ai.pose(n, 'attack', n.t / 0.25);
        if (n.t >= 0.25) ai.go(n, 'hover');
        return;
      }
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 96);
      if (!near || !backOff(n, ai, m, 34, n.def.speed)) ai.follow(n, G, n.def.speed);
      flinch(n, ai);
      if (!m || !near || n.cd > 0) return;
      // искра бьёт сразу: снаряда нет, только вспышка от светлячка до врага
      n.data.a = ai.angleTo(n, m);
      emit(G, { t: 'shot', look: 'fx.bolt', x: n.x, y: n.y, a: n.data.a, x2: m.x, y2: m.y, from: 2 });
      ai.sfx(G, 'zap', m.x, m.y);
      ai.hit(n, G, m, 1, 0);
      n.cd = 2.3;
      ai.go(n, 'zap');
    },
  },

  // Барсучонок: приманка. Сам идёт на врага, и те, кто рядом, бросаются на него, а не на лису. Не отступает,
  // бьёт редко, зато далеко отбрасывает.
  badger: {
    name: 'Барсучонок', hp: 14, r: 10, speed: 135, price: 40, taunt: true,
    desc: 'Крепкий: враги бросаются на него, а не на лису.',
    think(n, G, dt, ai) {
      if (n.state === 'swing') {
        ai.stop(n);
        ai.pose(n, 'windup', n.t / 0.3);
        if (n.t >= 0.3) {
          const m = ai.foe(n, G, 70);
          if (m && ai.distTo(n, m) < m.r + n.r + 14) {
            n.data.a = ai.angleTo(n, m);
            ai.hit(n, G, m, 2, 220);
          }
          ai.go(n, 'claw');
        }
        return;
      }
      if (n.state === 'claw') {
        ai.stop(n);
        ai.pose(n, 'attack', n.t / 0.25);
        if (n.t >= 0.25) {
          n.cd = 2;
          ai.go(n, 'walk');
        }
        return;
      }
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 130);
      if (m && ai.dist(n, G) < LEASH) {
        if (ai.distTo(n, m) > m.r + n.r + 8) ai.move(n, ai.angleTo(n, m), n.def.speed);
        else {
          ai.stop(n);
          n.face = m.x >= n.x ? 1 : -1;
          if (n.cd <= 0) ai.go(n, 'swing');
        }
      } else ai.follow(n, G, n.def.speed);
      flinch(n, ai);
    },
  },

  // Белка: бегает за монетами, маной и сердцами, которые лежат в стороне, — добежала, и находка летит к лисе.
  // Между делом кидает орехи.
  squirrel: {
    name: 'Белка', hp: 5, r: 7, speed: 170, price: 28,
    desc: 'Приносит монеты, ману и сердца, кидается орехами.',
    // свои позы: 'carry' — бежит с добычей
    think(n, G, dt, ai) {
      const d = n.data;
      if (n.state === 'throw') {
        ai.stop(n);
        ai.pose(n, 'attack', n.t / 0.3);
        if (!d.thrown && n.t >= 0.1) {
          // орех вылетает на замахе, а не в первый же миг
          d.thrown = 1;
          const m = ai.foe(n, G, 190);
          if (m && clear(n, G, m)) throwAt(n, G, m, NUT, ai);
        }
        if (n.t >= 0.3) {
          n.cd = 1.8;
          ai.go(n, 'run');
        }
        return;
      }
      if (dodge(n, G, ai)) return;
      const m = ai.foe(n, G, 160);
      const near = ai.dist(n, G) < LEASH;
      if (near && backOff(n, ai, m, 18, n.def.speed)) {
        flinch(n, ai);
        return;
      }
      if (m && near && n.cd <= 0 && clear(n, G, m)) {
        d.thrown = 0;
        ai.stop(n);
        ai.go(n, 'throw');
        return;
      }
      const p = pickFor(G, n);
      if (!p) ai.follow(n, G, n.def.speed);
      else if (ai.goTo(n, G, p.x, p.y, n.def.speed)) {
        p.pull = true;                        // добежала: дальше находка летит к лисе сама
        d.carry = 0.8;
      }
      if (d.carry > 0) {
        d.carry -= dt;
        if (n.wx !== 0 || n.wy !== 0) ai.pose(n, 'carry', 0);
      }
      if (n.act === '') flinch(n, ai);
    },
  },
};
