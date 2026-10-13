// Хозяева мест «Лисьей охоты»: по одному на каждое место (биом). Только описания — бой ведёт think хозяина.
//
// Запись — как у обычного врага (формат и разобранный пример — в начале mobs.js, готовые действия — в начале
// ai.js), но kind: 'boss':
//   bear: {
//     name: 'Медведь-хозяин', kind: 'boss',
//     biome: 'forest',       // чьё это место: хозяин выходит в последней комнате локаций этого места
//     hp: 95,                // здоровье на первой локации (растёт с локацией, как у всех)
//     r: 22, mass: 8,        // крупный и тяжёлый: его почти не отбрасывает
//     pts: 30,               // очки (30 / 40 / 50 / 60 / 70 по местам; +10 за каждый пройденный круг — само)
//     touch: 0, coins: [12, 18],
//     init(m, G) {}, think(m, G, dt, ai) {}, onHurt(m, G, hit) {}, onDie(m, G) {}, spiky(m, G, fromX, fromY) {},
//   }
// Чем хозяин отличается для движка:
//   • появляется сам, когда лиса вошла в его комнату: плашка с именем и 1,6 с «выхода» (поза 'spawn');
//   • заморозка и оглушение от оружия лисы на него не действуют — вместо них замедление;
//   • его удары по зонам бьют на 2 (как у вожака); полоска здоровья — G.room.boss;
//   • после гибели движок сам убирает его подмогу, открывает двери, ставит портал и сундук, даёт выбрать дар.
// Советы: бой — чередование ясных замахов (поза 'windup' + красная зона) и окон, когда хозяина можно бить
// ('recover', 'stun'); с потерей здоровья — новые приёмы (ai.hp(m) — доля здоровья). Подмогу зовите через
// ai.summon(m, G, id, n) и следите, чтобы её не стало слишком много (ai.count(G, id)).
//
// ── Как устроены здешние пятеро ──────────────────────────────────────────────────────────────────────────────
// У каждого три трети здоровья (m.data.ph — 1, 2, 3): с каждой — приём-другой сверху и подмога. Правила общие:
//   • телом хозяин не бьёт (touch: 0) — сквозь него можно прыгать рывком сколько угодно; больно только то, о чём
//     предупредили: красная зона не короче 0,8 с (удар на 2) или 0,5 с (на 1), у выстрелов — замах и сектор,
//     который сам не бьёт (dmg: 0), а только показывает, куда полетит;
//   • бегущий по полосе бьёт сам, и ровно на её ширину: за краем красного безопасно;
//   • после серии приёмов — окно: 'tired' (выдохся) или 'stun' (врезался, промахнулся);
//   • куда направлен приём, лежит в m.data.a (радианы) — по нему рисуются язык, рога и прицел;
//   • в воздухе и под потолком хозяина не достать (m.hide), зато и он никого не задевает;
//   • подмога (осы, жабы, пауки) — не больше нескольких разом и ограниченное число за бой; зверя с таким id ещё
//     не описали — хозяин обходится без неё.
// Свои числа каждого — только в m.data: ph — треть здоровья, combo — приёмов с прошлой передышки, i — номер
// приёма по кругу, n — сколько ударов осталось в серии, did — «уже сделал» внутри состояния, called — сколько
// подмоги позвал за бой, a — направление приёма, gx / gy — куда летит или падает.

import { T, TAU, F_WALK, REG, own, clamp, emit, sfx, shake } from './core.js';
import { addActor, solveDash, standable, castRay } from './world.js';
import { fireShot } from './combat.js';

// ---------- общее ----------

// треть здоровья: 1 — полон сил, 3 — на исходе
function phaseOf(m, ai) {
  const k = ai.hp(m);
  return k > 0.66 ? 1 : k > 0.33 ? 2 : 3;
}

// Началась ли новая треть (true — ровно один раз на каждую).
function nextPhase(m, ai) {
  const ph = phaseOf(m, ai);
  if (ph <= m.data.ph) return false;
  m.data.ph = ph;
  return true;
}

const known = (id) => own(REG.MOBS, id);

// Позвать подмогу: не больше alive разом и total за весь бой. Возвращает, сколько пришло.
function call(m, G, ai, id, n, alive, total) {
  if (!known(id)) return 0;
  const want = Math.min(n, alive - ai.count(G, id), total - m.data.called);
  if (want <= 0) return 0;
  const made = ai.summon(m, G, id, want, 72);
  m.data.called += made;
  return made;
}

// Можно ли звать ещё: прежних перебили, а запас не вышел.
const canCall = (m, G, ai, id, total) => known(id) && m.data.called < total && ai.count(G, id) === 0;

// Длина полосы разбега: до первой преграды на пути, но не длиннее max — видно, где зверь остановится.
function runway(room, m, a, max) {
  const k = castRay(room, m.x, m.y, m.x + Math.cos(a) * max, m.y + Math.sin(a) * max, F_WALK);
  return Math.max(70, Math.min(max, max * k + 18));
}

// Врезался ли бегущий под углом a лбом (а не чиркнул боком по стене вдоль своего пути).
function rammed(m, a) {
  return ((m.bump & 1) !== 0 && Math.abs(Math.cos(a)) > 0.5) || ((m.bump & 2) !== 0 && Math.abs(Math.sin(a)) > 0.5);
}

// Ближайшее к (x, y) место, где встанет крупный зверь: сама точка, потом кольца вокруг. Нашлось — true, а место
// записано в m.data.gx, m.data.gy.
function pickSpot(room, m, x, y) {
  const D = m.data;
  for (let ring = 0; ring < 4; ring++) {
    const n = ring === 0 ? 1 : 8;
    for (let k = 0; k < n; k++) {
      const a = (k * TAU) / 8 + ring;
      const cx = clamp(x + Math.cos(a) * ring * 26, T + 16, room.w * T - T - 16);
      const cy = clamp(y + Math.sin(a) * ring * 26, T + 16, room.h * T - T - 16);
      if (!standable(room, cx, cy, 14)) continue;
      D.gx = cx;
      D.gy = cy;
      return true;
    }
  }
  return false;
}

// что слышно и видно в момент удара зоны
function pawHits(G, z) {
  sfx(G, 'paw', z.x, z.y);
  shake(G, 0.45);
}
function thud(G, z) {
  sfx(G, 'paw', z.x, z.y);
  shake(G, 0.6);
}
const lash = (G, z) => sfx(G, 'swing', z.x, z.y);
const iceBreaks = (G, z) => sfx(G, 'ice', z.x, z.y);

// Удар лапой: красный круг, а над ним — лапа: опускается, пока круг предупреждает, и бьёт вместе с ним
// (фигура 'haz.paw' в позе 'strike': удар — на середине её жизни).
function pawSlam(m, G, ai, x, y, r, t) {
  const z = ai.circle(m, G, x, y, r, t, { on: pawHits });
  if (z) addActor(G.room, 'haz.paw', x, y, 0, 0, z.total * 2, 'strike');
  return z;
}

// Выстрел хозяина вылетает не из середины тела, а от его края по ходу полёта: лису, которая стоит вплотную
// сзади или сбоку, он не задевает. loud — со звуком (в залпе звучит только первый).
function shootOut(m, G, a, spec, loud = true) {
  const s = fireShot(G, 1, m.x + Math.cos(a) * (m.r + 4), m.y + Math.sin(a) * (m.r + 4), a, spec, spec.dmg ?? 1, m.uid);
  if (!s || !loud) return s;
  emit(G, { t: 'shot', look: spec.look, x: s.x, y: s.y, a, from: 1 });
  sfx(G, 'spit', m.x, m.y);
  return s;
}

// Веер выстрелов с предупреждением — одно состояние на всех, кто так стреляет. Сектор показывает, куда полетит
// (сам не бьёт); после залпа — короткая поза 'attack'. true — залп отстрелян и поза доиграна.
function volley(m, G, ai, n, arc, spec, reach) {
  const D = m.data;
  const wait = ai.tele(G, 0.6);
  ai.stop(m);
  if (m.t === 0) {
    const p = ai.lead(m, G, 0.3);
    D.a = Math.atan2(p.y - m.y, p.x - m.x);
    D.did = 0;
    ai.face(m, G);
    ai.cone(m, G, D.a, reach, arc + 0.2, 0.6, { dmg: 0 });
  }
  if (m.t < wait) {
    ai.pose(m, 'windup', m.t / wait);
    return false;
  }
  if (!D.did) {
    D.did = 1;
    for (let i = 0; i < n; i++) shootOut(m, G, n > 1 ? D.a + (i / (n - 1) - 0.5) * arc : D.a, spec, i === 0);
  }
  ai.pose(m, 'attack', (m.t - wait) / 0.4);
  return m.t >= wait + 0.4;
}

// чем стреляют и плюются
const BUBBLE = Object.freeze({ look: 'shot.bubble', radius: 34, time: 0.9, arc: 52, dmg: 1, linger: 2.6, zoneLook: 'poison' });
const VENOM = Object.freeze({ look: 'shot.orb', v: 3, speed: 165, r: 5, range: 380 });
const WEB = Object.freeze({ look: 'shot.web', radius: 46, time: 0.85, arc: 40, dmg: 0, linger: 4.5, slow: 1.5, zoneLook: 'web' });
const FEATHER = Object.freeze({ look: 'shot.feather', speed: 205, r: 5, range: 460 });
const STAR = Object.freeze({ look: 'shot.star', speed: 118, r: 6, homing: 1.5, life: 3.4, spin: true });

const ALOFT = 260;                          // высота «под потолком»: выше экрана

export const BOSSES = {
  // ---------- лес ----------
  // Медведь: удары лапой (один → два → три подряд), разбег по полосе (на последней трети — с разворотом), рёв,
  // на который слетаются осы. После трёх приёмов выдыхается; врезался в стену или дерево — оглушён.
  // Главное правило боя: замахнулся или бежит — не лезь (в эти мгновения он «колюч» для рывка); бить его надо
  // сразу после удара, пока идёт, пока ревёт, а лучше всего — когда выдохся или оглушён.
  bear: {
    name: 'Медведь-хозяин', kind: 'boss', biome: 'forest',
    hp: 95, r: 22, pts: 30, touch: 0, mass: 8, coins: [12, 18],
    // свои позы: 'charge' — бежит напролом, 'roar' — ревёт, 'tired' — выдохся
    spiky: (m) => m.state === 'aim' || m.state === 'charge' || (m.state === 'slam' && m.act === 'windup'),
    init(m) {
      const D = m.data;
      D.ph = 1;
      D.combo = 0;                          // сколько приёмов подряд: после трёх выдыхается
      D.n = 0;
      D.a = 0;
      D.again = 0;
      D.did = 0;
      D.called = 0;
    },
    think(m, G, dt, ai) {
      const D = m.data;
      switch (m.state) {
        case '':
          m.cd = 1;
          ai.go(m, 'walk');
          break;
        case 'walk': {
          const d = ai.chase(m, G, 50 + 8 * D.ph);
          if (nextPhase(m, ai)) {
            ai.go(m, 'roar');
            break;
          }
          if (m.cd > 0) break;
          if (D.combo >= 3) ai.go(m, 'tired');
          else if (ai.los(m, G) && (d > 190 || (d > 80 && D.combo === 1 && ai.chance(G, 0.6)))) {
            // издалека — всегда разбег; вблизи — иногда, вторым приёмом
            D.a = ai.angle(m, G);
            D.again = D.ph >= 3 ? 1 : 0;
            ai.go(m, 'aim');
          } else if (d > 160 && !ai.los(m, G)) {
            // лиса далеко и за деревьями — подходит ближе, лапой с другого конца комнаты не бьёт
            break;
          } else {
            D.n = D.ph;
            ai.go(m, 'slam');
          }
          break;
        }
        case 'slam': {
          // удар лапой: круг под лисой, чуть на упреждение; чем меньше здоровья, тем больше ударов подряд —
          // и каждый следующий целится заново
          const t = D.n === D.ph ? 0.9 : 0.8;
          const wait = ai.tele(G, t);
          ai.stop(m);
          ai.face(m, G);
          if (m.t === 0) {
            const p = ai.lead(m, G, 0.35);
            D.a = Math.atan2(p.y - m.y, p.x - m.x);
            pawSlam(m, G, ai, p.x, p.y, 54, t);
            ai.sfx(G, 'growl', m.x, m.y);
          }
          if (m.t < wait) ai.pose(m, 'windup', m.t / wait);
          else ai.pose(m, 'attack', (m.t - wait) / 0.45);
          if (m.t >= wait + 0.45) {
            D.n -= 1;
            if (D.n > 0) ai.go(m, 'slam');
            else {
              D.combo += 1;
              m.cd = ai.rand(G, 0.7, 1.1);
              ai.go(m, 'walk');
            }
          }
          break;
        }
        case 'aim': {
          // полоса: сейчас побежит. Сама она не бьёт — бьёт медведь
          const wait = ai.tele(G, 0.8);
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'windup', m.t / wait);
          if (m.t === 0) {
            ai.lane(m, G, D.a, runway(G.room, m, D.a, 430), 46, 0.8, { dmg: 0 });
            ai.sfx(G, 'growl', m.x, m.y);
          }
          if (m.t >= wait) ai.go(m, 'charge');
          break;
        }
        case 'charge':
          ai.charge(m, D.a, 360);
          ai.pose(m, 'charge', (m.t * 3) % 1);
          ai.strike(m, G, 14, 2);
          if (m.t > 0.06 && rammed(m, D.a)) {
            shake(G, 0.4);
            ai.sfx(G, 'boom', m.x, m.y);
            ai.go(m, 'stun');
          } else if (m.t >= 1.15) {
            if (D.again > 0 && ai.los(m, G)) {
              // на последней трети — разворот и ещё один разбег
              D.again -= 1;
              D.a = ai.angle(m, G);
              ai.go(m, 'aim');
            } else {
              D.combo += 1;
              m.cd = 0.8;
              ai.go(m, 'walk');
            }
          }
          break;
        case 'stun':
          // врезался: окно для рывков
          ai.stop(m);
          ai.pose(m, 'stun', m.t / 1.4);
          if (m.t >= 1.4) {
            D.combo += 1;
            m.cd = 0.6;
            ai.go(m, 'walk');
          }
          break;
        case 'roar':
          // рёв: на него слетаются осы
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'roar', m.t / 1.2);
          if (m.t === 0) {
            D.did = 0;
            ai.sfx(G, 'growl', m.x, m.y);
            shake(G, 0.5);
          }
          if (!D.did && m.t >= 0.5) {
            D.did = 1;
            call(m, G, ai, 'wasp', D.ph, 3, 7);
          }
          if (m.t >= 1.2) {
            m.cd = 0.4;
            ai.go(m, 'walk');
          }
          break;
        default:
          // выдохся после трёх приёмов
          ai.stop(m);
          ai.pose(m, 'tired', m.t / 2.2);
          if (m.t >= 2.2) {
            D.combo = 0;
            m.cd = 0.5;
            ai.go(m, D.ph >= 2 && canCall(m, G, ai, 'wasp', 7) ? 'roar' : 'walk');
          }
      }
    },
  },

  // ---------- болото ----------
  // Жаба: огромные прыжки (круг — куда упадёт, следом кольцо удара по земле), язык по сектору, со второй трети —
  // ядовитые пузыри; на каждой новой трети зовёт жаб поменьше. После трёх приёмов сдувается.
  toad: {
    name: 'Царь-жаба', kind: 'boss', biome: 'swamp',
    hp: 100, r: 26, pts: 40, touch: 0, mass: 10, coins: [16, 24],
    // свои позы: 'hop' — прыжок, 'spit' — плюётся пузырями, 'tired' — сдулась
    init(m) {
      const D = m.data;
      D.ph = 1;
      D.combo = 0;
      D.last = 0;                           // прошлый приём: 0 — прыжок, 1 — язык, 2 — пузыри
      D.n = 0;
      D.a = 0;
      D.did = 0;
      D.called = 0;
    },
    think(m, G, dt, ai) {
      const D = m.data;
      switch (m.state) {
        case '':
          m.cd = 1.2;
          ai.go(m, 'sit');
          break;
        case 'sit': {
          ai.stop(m);
          ai.face(m, G);
          if (nextPhase(m, ai)) {
            ai.go(m, 'croak');
            break;
          }
          if (m.cd > 0) break;
          if (D.combo >= 3) {
            ai.go(m, 'tired');
            break;
          }
          if (ai.near(m, G, 140) && D.last !== 1) {
            D.last = 1;
            ai.go(m, 'lick');
          } else if (D.ph >= 2 && D.last !== 2 && ai.chance(G, 0.45)) {
            D.last = 2;
            ai.go(m, 'spit');
          } else {
            D.last = 0;
            D.n = D.ph;                     // один прыжок, два, три подряд
            ai.go(m, 'crouch');
          }
          break;
        }
        case 'crouch': {
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'windup', m.t / 0.45);
          if (m.t < 0.45) break;
          // прыжок высокий и долгий: красный круг показывает, куда жаба упадёт; пока летит — её не задеть
          const p = ai.lead(m, G, 0.5);
          const dx = p.x - m.x;
          const dy = p.y - m.y;
          const d = Math.hypot(dx, dy);
          let jumped = false;
          if (d > 30) {
            const o = solveDash(G.room, m.x, m.y, dx / d, dy / d, d, 12);
            const lx = o.x;
            const ly = o.y;
            if (o.ok && o.len > 24 && ai.leap(m, G, lx, ly, ai.tele(G, 1), 64, 'hop')) {
              jumped = true;
              m.hide = true;
              ai.circle(m, G, lx, ly, 62, 1, { on: thud });
              // после последнего прыжка серии по земле расходится кольцо: вплотную к жабе безопасно
              if (D.n <= 1) ai.ring(m, G, lx, ly, 112, 44, 1, { delay: 0.5, dmg: 1 });
              ai.sfx(G, 'lob', m.x, m.y);
              ai.go(m, 'land');
            }
          }
          if (!jumped) {
            // лиса вплотную — прыгать некуда, бьёт языком
            D.last = 1;
            ai.go(m, 'lick');
          }
          break;
        }
        case 'land':
          ai.stop(m);
          if (m.t === 0) m.hide = false;
          ai.pose(m, 'recover', m.t / 0.55);
          if (m.t >= 0.55) {
            D.n -= 1;
            if (D.n > 0) ai.go(m, 'crouch');
            else {
              D.combo += 1;
              m.cd = 0.7;
              ai.go(m, 'sit');
            }
          }
          break;
        case 'lick': {
          // язык: сектор перед жабой
          const wait = ai.tele(G, 0.8);
          ai.stop(m);
          if (m.t === 0) {
            D.a = ai.angle(m, G);
            ai.face(m, G);
            ai.cone(m, G, D.a, 150, 1.15, 0.8, { on: lash });
            ai.sfx(G, 'growl', m.x, m.y);
          }
          if (m.t < wait) ai.pose(m, 'windup', m.t / wait);
          else if (m.t < wait + 0.3) ai.pose(m, 'attack', (m.t - wait) / 0.3);
          else ai.pose(m, 'recover', (m.t - wait - 0.3) / 0.5);
          if (m.t >= wait + 0.8) {
            D.combo += 1;
            m.cd = 0.5;
            ai.go(m, 'sit');
          }
          break;
        }
        case 'spit': {
          // пузыри по одному: каждый падает в свой красный круг и остаётся ядовитой лужей
          const n = D.ph + 1;
          ai.stop(m);
          ai.face(m, G);
          if (m.t === 0) D.did = 0;
          if (m.t < 0.5) {
            ai.pose(m, 'windup', m.t / 0.5);
            break;
          }
          const k = (m.t - 0.5) / (n * 0.25 + 0.25);
          ai.pose(m, 'spit', k);
          if (D.did < n && m.t >= 0.5 + D.did * 0.25) {
            const p = ai.lead(m, G, 0.6);
            const a = ai.rand(G, 0, TAU);
            const off = D.did === 0 ? 0 : ai.rand(G, 44, 92);
            ai.lob(m, G, p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, BUBBLE);
            D.did += 1;
          }
          if (k >= 1) {
            D.combo += 1;
            m.cd = 0.8;
            ai.go(m, 'sit');
          }
          break;
        }
        case 'croak':
          // раздувается и зовёт жаб поменьше
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'windup', m.t);
          if (m.t === 0) {
            D.did = 0;
            ai.sfx(G, 'growl', m.x, m.y);
            shake(G, 0.4);
          }
          if (!D.did && m.t >= 0.6) {
            D.did = 1;
            call(m, G, ai, 'frog', 2, 3, 6);
          }
          if (m.t >= 1) {
            m.cd = 0.5;
            ai.go(m, 'sit');
          }
          break;
        default:
          // сдулась после трёх приёмов
          ai.stop(m);
          ai.pose(m, 'tired', m.t / 2);
          if (m.t >= 2) {
            D.combo = 0;
            m.cd = 0.4;
            ai.go(m, 'sit');
          }
      }
    },
  },

  // ---------- зимний бор ----------
  // Лось: разбеги один за другим (два, с половины боя — три), каждый — по своей полосе; спереди на бегу он
  // колюч — рывком в рога нельзя. Последний разбег серии кончился стеной или деревом — оглушён надолго. Вблизи
  // бьёт рогами по широкому сектору, со второй трети — топает, и с веток сыплются сосульки.
  moose: {
    name: 'Лось-великан', kind: 'boss', biome: 'taiga',
    hp: 105, r: 26, pts: 50, touch: 0, mass: 12, coins: [20, 28],
    // свои позы: 'charge' — несётся, опустив рога, 'stomp' — бьёт копытом, 'tired' — запыхался
    spiky(m, G, fromX, fromY) {
      if (m.state !== 'charge') return false;
      const dx = fromX - m.x;
      const dy = fromY - m.y;
      const d = Math.hypot(dx, dy) || 1;
      return (dx * Math.cos(m.data.a) + dy * Math.sin(m.data.a)) / d > 0.3;
    },
    init(m) {
      const D = m.data;
      D.ph = 1;
      D.i = 0;
      D.last = 0;                           // прошлый приём: 0 — разбег, 1 — рога, 2 — копыто
      D.n = 0;
      D.a = 0;
      D.did = 0;
    },
    think(m, G, dt, ai) {
      const D = m.data;
      switch (m.state) {
        case '':
          m.cd = 1.2;
          ai.go(m, 'walk');
          break;
        case 'walk': {
          const d = ai.chase(m, G, 42 + 6 * D.ph);
          if (nextPhase(m, ai)) {
            ai.go(m, 'stomp');
            break;
          }
          if (m.cd > 0) break;
          const seen = ai.los(m, G);
          let move = 0;
          if (D.ph >= 2 && D.i % 3 === 2) move = 2;
          else if (d < 104 && (D.last !== 1 || !seen)) move = 1;
          else if (!seen) break;            // лису не видно — подходит ближе
          D.i += 1;
          D.last = move;
          if (move === 2) ai.go(m, 'stomp');
          else if (move === 1) ai.go(m, 'sweep');
          else {
            D.n = D.ph >= 2 ? 3 : 2;
            D.a = ai.angle(m, G);
            ai.go(m, 'aim');
          }
          break;
        }
        case 'aim': {
          // полоса: сейчас понесётся. Сама она не бьёт — бьёт лось
          const wait = ai.tele(G, 0.85);
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'windup', m.t / wait);
          if (m.t === 0) {
            ai.lane(m, G, D.a, runway(G.room, m, D.a, 560), 56, 0.85, { dmg: 0 });
            ai.sfx(G, 'moose', m.x, m.y);
          }
          if (m.t >= wait) ai.go(m, 'charge');
          break;
        }
        case 'charge': {
          ai.charge(m, D.a, 430);
          ai.pose(m, 'charge', (m.t * 3) % 1);
          ai.strike(m, G, 19, 2);
          const hit = m.t > 0.08 && rammed(m, D.a);
          if (!hit && m.t < 1.3) break;
          if (hit) {
            shake(G, 0.5);
            ai.sfx(G, 'boom', m.x, m.y);
          }
          D.n -= 1;
          // после последнего разбега серии — окно: врезался — оглушён, не врезался — запыхался
          if (D.n > 0) ai.go(m, 'turn');
          else ai.go(m, hit ? 'stun' : 'tired');
          break;
        }
        case 'turn':
          // разворачивается на следующий разбег
          ai.charge(m, D.a, 0);
          ai.face(m, G);
          ai.pose(m, 'recover', m.t / 0.4);
          if (m.t >= 0.4) {
            D.a = ai.angle(m, G);
            ai.go(m, 'aim');
          }
          break;
        case 'sweep': {
          // рога: широкий сектор перед собой
          const wait = ai.tele(G, 0.8);
          ai.stop(m);
          if (m.t === 0) {
            D.a = ai.angle(m, G);
            ai.face(m, G);
            ai.cone(m, G, D.a, 108, 2.3, 0.8, { on: lash });
            ai.sfx(G, 'growl', m.x, m.y);
          }
          if (m.t < wait) ai.pose(m, 'windup', m.t / wait);
          else if (m.t < wait + 0.3) ai.pose(m, 'attack', (m.t - wait) / 0.3);
          else ai.pose(m, 'recover', (m.t - wait - 0.3) / 0.7);
          if (m.t >= wait + 1) {
            m.cd = 0.5;
            ai.go(m, 'walk');
          }
          break;
        }
        case 'stomp':
          // бьёт копытом: с веток сыплются сосульки — первая под лису, остальные вокруг, по очереди
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'stomp', m.t / 0.8);
          if (m.t === 0) D.did = 0;
          if (!D.did && m.t >= 0.4) {
            D.did = 1;
            shake(G, 0.5);
            ai.sfx(G, 'paw', m.x, m.y);
            const room = G.room;
            const p = ai.lead(m, G, 0.4);
            const x = p.x;
            const y = p.y;
            for (let i = 0; i < 3 + D.ph; i++) {
              const a = ai.rand(G, 0, TAU);
              const off = i === 0 ? 0 : ai.rand(G, 44, 120);
              ai.circle(
                m, G, clamp(x + Math.cos(a) * off, T + 20, room.w * T - T - 20), clamp(y + Math.sin(a) * off, T + 20, room.h * T - T - 20), 28, 0.9,
                { delay: i * 0.22, dmg: 1, slow: 1, on: iceBreaks },
              );
            }
          }
          if (m.t >= 0.8) {
            m.cd = 0.9;
            ai.go(m, 'walk');
          }
          break;
        case 'stun':
          // врезался: долгое окно для рывков
          ai.charge(m, D.a, 0);
          ai.pose(m, 'stun', m.t / 1.8);
          if (m.t >= 1.8) {
            m.cd = 0.5;
            ai.go(m, 'walk');
          }
          break;
        default:
          // пробежал всю серию и ни во что не врезался — запыхался
          ai.stop(m);
          ai.pose(m, 'tired', m.t / 1.6);
          if (m.t >= 1.6) {
            m.cd = 0.5;
            ai.go(m, 'walk');
          }
      }
    },
  },

  // ---------- пещеры ----------
  // Паучиха держится поодаль и ходит по кругу приёмов: веер яда → паутина на землю (замедляет) → уходит под
  // потолок и падает туда, где стоит лиса (раз, два, три подряд). После падений выдыхается. Со второй трети
  // зовёт пауков.
  spiderqueen: {
    name: 'Паучья королева', kind: 'boss', biome: 'cave',
    hp: 85, r: 26, pts: 60, touch: 0, mass: 9, coins: [24, 32],
    // свои позы: 'cast' — плюёт паутиной, 'drop' — падает с потолка, 'summon' — зовёт пауков, 'tired' — выдохлась
    init(m) {
      const D = m.data;
      D.ph = 1;
      D.i = 0;
      D.n = 0;
      D.a = 0;
      D.did = 0;
      D.called = 0;
      D.gx = m.x;
      D.gy = m.y;
      D.w = 0;
    },
    think(m, G, dt, ai) {
      const D = m.data;
      switch (m.state) {
        case '':
          m.cd = 1.2;
          ai.go(m, 'walk');
          break;
        case 'walk': {
          ai.keepRange(m, G, 110, 210, 60);
          if (nextPhase(m, ai)) {
            ai.go(m, 'summon');
            break;
          }
          if (m.cd > 0) break;
          const move = D.i % 3;
          D.i += 1;
          if (move === 0) {
            D.n = D.ph >= 3 ? 2 : 1;        // на последней трети — два веера подряд
            ai.go(m, 'fan');
          } else if (move === 1) ai.go(m, 'web');
          else {
            D.n = D.ph;
            ai.go(m, 'climb');
          }
          break;
        }
        case 'fan':
          if (volley(m, G, ai, D.ph >= 2 ? 7 : 5, D.ph >= 2 ? 1.5 : 1.1, VENOM, 230)) {
            D.n -= 1;
            if (D.n > 0) ai.go(m, 'fan');
            else {
              m.cd = 1;
              ai.go(m, 'walk');
            }
          }
          break;
        case 'web': {
          // комки паутины по одному: первый — под лису, остальные — рядом; где упал, там земля липкая
          const n = D.ph >= 2 ? 3 : 2;
          ai.stop(m);
          ai.face(m, G);
          if (m.t === 0) D.did = 0;
          if (m.t < 0.5) {
            ai.pose(m, 'windup', m.t / 0.5);
            break;
          }
          const k = (m.t - 0.5) / (n * 0.3 + 0.2);
          ai.pose(m, 'cast', k);
          if (D.did < n && m.t >= 0.5 + D.did * 0.3) {
            const p = ai.lead(m, G, 0.5);
            const a = ai.rand(G, 0, TAU);
            const off = D.did === 0 ? 0 : ai.rand(G, 60, 110);
            ai.lob(m, G, p.x + Math.cos(a) * off, p.y + Math.sin(a) * off, WEB);
            D.did += 1;
          }
          if (k >= 1) {
            m.cd = 0.9;
            ai.go(m, 'walk');
          }
          break;
        }
        case 'climb':
          // уходит по нити под потолок: там её не достать
          ai.stop(m);
          if (m.t === 0) m.hide = true;
          m.z = ALOFT * Math.min(1, m.t / 0.45) ** 2;
          ai.pose(m, 'drop', 0);
          if (m.t >= 0.45) ai.go(m, 'aloft');
          break;
        case 'aloft': {
          // висит над тем местом, куда упадёт: красный круг — всё, что от неё видно
          ai.stop(m);
          if (m.t === 0) {
            const t = D.n === D.ph ? 1 : 0.85;
            const p = ai.lead(m, G, 0.45);
            if (pickSpot(G.room, m, p.x, p.y)) {
              m.x = D.gx;
              m.y = D.gy;
              m.px = m.x;
              m.py = m.y;
            }
            D.w = ai.tele(G, t);
            ai.circle(m, G, m.x, m.y, 58, t, { on: thud });
          }
          const left = D.w - m.t;
          m.z = left > 0.28 ? ALOFT : ALOFT * Math.max(0, left / 0.28);
          ai.pose(m, 'drop', left > 0.28 ? 0 : 1 - Math.max(0, left) / 0.28);
          if (left <= 0) {
            m.z = 0;
            m.hide = false;
            ai.go(m, 'land');
          }
          break;
        }
        case 'land':
          ai.stop(m);
          ai.pose(m, 'recover', m.t / 0.5);
          if (m.t >= 0.5) {
            D.n -= 1;
            ai.go(m, D.n > 0 ? 'climb' : 'tired');
          }
          break;
        case 'summon':
          ai.stop(m);
          ai.face(m, G);
          ai.pose(m, 'summon', m.t);
          if (m.t === 0) {
            D.did = 0;
            ai.sfx(G, 'growl', m.x, m.y);
          }
          if (!D.did && m.t >= 0.55) {
            D.did = 1;
            call(m, G, ai, 'spider', 2, 2, 4);
          }
          if (m.t >= 1) {
            m.cd = 0.6;
            ai.go(m, 'walk');
          }
          break;
        default:
          // выдохлась после падений
          ai.stop(m);
          ai.pose(m, 'tired', m.t / 2);
          if (m.t >= 2) {
            m.cd = 0.5;
            ai.go(m, D.ph >= 2 && canCall(m, G, ai, 'spider', 4) ? 'summon' : 'walk');
          }
      }
    },
  },

  // ---------- осенняя чаща ----------
  // Филин летает над преградами и держится поодаль. Круг приёмов: веер перьев → самонаводящиеся звёзды →
  // исчезает, появляется в другом месте и снова веер (после — переводит дух) → пике в красный круг. Промахнулся
  // — сидит на земле оглушённый: главное окно боя. На последней трети пикирует дважды.
  owl: {
    name: 'Филин-чародей', kind: 'boss', biome: 'autumn',
    hp: 85, r: 22, pts: 70, touch: 0, mass: 6, coins: [28, 36], flying: true, z: 26,
    // свои позы: 'cast' — колдует звёзды, 'teleport' — исчезает и появляется, 'dive' — пикирует, 'tired' — переводит дух
    init(m) {
      const D = m.data;
      D.ph = 1;
      D.i = 0;
      D.n = 0;
      D.a = 0;
      D.did = 0;
      D.rest = 0;                           // после этого веера перевести дух
      D.gx = m.x;
      D.gy = m.y;
      D.sp = 0;
    },
    think(m, G, dt, ai) {
      const D = m.data;
      const high = m.def.z;
      switch (m.state) {
        case '':
          m.cd = 1.2;
          ai.go(m, 'hover');
          break;
        case 'hover': {
          ai.keepRange(m, G, 150, 230, 64);
          if (nextPhase(m, ai)) {
            // на каждой новой трети — исчезает и тут же бьёт веером с нового места
            ai.go(m, 'blink');
            break;
          }
          if (m.cd > 0) break;
          const move = D.i % 4;
          D.i += 1;
          D.rest = 0;
          if (move === 0) {
            D.n = D.ph >= 3 ? 2 : 1;
            ai.go(m, 'fan');
          } else if (move === 1) ai.go(m, 'stars');
          else if (move === 2) {
            D.rest = 1;
            ai.go(m, 'blink');
          } else {
            D.n = D.ph >= 3 ? 2 : 1;
            ai.go(m, 'eye');
          }
          break;
        }
        case 'fan':
          if (volley(m, G, ai, 3 + 2 * D.ph, 0.8 + 0.3 * D.ph, FEATHER, 250)) {
            D.n -= 1;
            if (D.n > 0) ai.go(m, 'fan');
            else if (D.rest) ai.go(m, 'tired');
            else {
              m.cd = 0.9;
              ai.go(m, 'hover');
            }
          }
          break;
        case 'stars': {
          // звёзды по одной: летят медленнее лисы и доворачивают за ней — уводить за дерево или убегать
          const wait = ai.tele(G, 0.6);
          const n = D.ph + 1;
          ai.stop(m);
          if (m.t === 0) {
            D.did = 0;
            D.a = ai.angle(m, G);
            ai.face(m, G);
            ai.cone(m, G, D.a, 130, 1.9, 0.6, { dmg: 0 });
            ai.sfx(G, 'magic', m.x, m.y);
          }
          if (m.t < wait) {
            ai.pose(m, 'windup', m.t / wait);
            break;
          }
          const k = (m.t - wait) / (n * 0.22 + 0.2);
          ai.pose(m, 'cast', k);
          if (D.did < n && m.t >= wait + D.did * 0.22) {
            shootOut(m, G, D.a + (D.did - (n - 1) / 2) * 0.55, STAR);
            D.did += 1;
          }
          if (k >= 1) {
            m.cd = 1.1;
            ai.go(m, 'hover');
          }
          break;
        }
        case 'blink': {
          // исчезает в вихре перьев и появляется в другом месте; пока вихрь — его не задеть
          ai.charge(m, D.a, 0);
          if (m.t === 0) {
            m.hide = true;
            D.did = 0;
            ai.sfx(G, 'magic', m.x, m.y);
          }
          ai.pose(m, 'teleport', m.t / 0.7);
          if (!D.did && m.t >= 0.35) {
            // новое место — из четырёх случайных то, что дальше и от лисы, и от прежнего
            D.did = 1;
            const room = G.room;
            const P = G.player;
            const edge = T + m.r + 10;
            let bx = m.x;
            let by = m.y;
            let best = -1;
            for (let k = 0; k < 4; k++) {
              const a = ai.rand(G, 0, TAU);
              const far = ai.rand(G, 170, 230);
              const x = clamp(P.x + Math.cos(a) * far, edge, room.w * T - edge);
              const y = clamp(P.y + Math.sin(a) * far, edge, room.h * T - edge);
              const score = Math.min(Math.hypot(x - P.x, y - P.y), 200) + 0.4 * Math.min(Math.hypot(x - m.x, y - m.y), 250);
              if (score <= best) continue;
              best = score;
              bx = x;
              by = y;
            }
            m.x = bx;
            m.y = by;
            m.px = bx;
            m.py = by;
          }
          if (m.t >= 0.7) {
            m.hide = false;
            D.n = D.ph >= 3 ? 2 : 1;
            ai.go(m, 'fan');
          }
          break;
        }
        case 'eye': {
          // высматривает сверху: красный круг — куда спикирует
          const wait = ai.tele(G, 0.9);
          ai.stop(m);
          if (m.t === 0) {
            const p = ai.lead(m, G, 0.3);
            D.gx = p.x;
            D.gy = p.y;
            D.a = Math.atan2(D.gy - m.y, D.gx - m.x);
            D.sp = Math.hypot(D.gx - m.x, D.gy - m.y) / 0.3;
            ai.face(m, G);
            ai.circle(m, G, D.gx, D.gy, 52, 1.2, { on: thud });
            ai.sfx(G, 'growl', m.x, m.y);
          }
          ai.pose(m, 'windup', m.t / wait);
          if (m.t >= wait) ai.go(m, 'dive');
          break;
        }
        case 'dive': {
          // пике: за треть секунды — в середину круга; круг бьёт, когда филин долетел
          const left = Math.hypot(D.gx - m.x, D.gy - m.y);
          if (left > D.sp * dt + 1 && m.t < 0.34) {
            ai.charge(m, D.a, D.sp);
            m.z = high * (1 - Math.min(1, m.t / 0.3));
            ai.pose(m, 'dive', m.t / 0.3);
            break;
          }
          ai.charge(m, D.a, 0);
          m.z = 0;
          D.n -= 1;
          ai.go(m, D.n > 0 ? 'bounce' : 'down');
          break;
        }
        case 'bounce':
          // на последней трети после первого пике сразу взмывает — и пикирует ещё раз
          ai.stop(m);
          m.z = high * Math.min(1, m.t / 0.5);
          ai.pose(m, 'recover', m.t / 0.5);
          if (m.t >= 0.5) ai.go(m, 'eye');
          break;
        case 'down':
          // промахнулся и сидит на земле оглушённый
          ai.stop(m);
          m.z = 0;
          ai.pose(m, 'stun', m.t / 1.7);
          if (m.t >= 1.7) ai.go(m, 'rise');
          break;
        case 'rise':
          ai.stop(m);
          m.z = high * Math.min(1, m.t / 0.4);
          ai.pose(m, 'move', 0);
          if (m.t >= 0.4) {
            m.z = high;
            m.cd = 0.7;
            ai.go(m, 'hover');
          }
          break;
        default:
          // переводит дух после перелёта: висит на месте
          ai.stop(m);
          ai.pose(m, 'tired', m.t / 1.3);
          if (m.t >= 1.3) {
            m.cd = 0.6;
            ai.go(m, 'hover');
          }
      }
    },
  },
};
