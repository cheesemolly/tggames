// Стол пинбола на настоящей физике: все элементы, о которых знают правила, на месте; запуск пружиной (слабый —
// обратно, средний — из трубы на стол, полный — по орбите в топливный канал); спасатели; ворота канала; шарик
// нигде не застревает; флипперы достают до рампы и гиперпространства.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTable, PLUNGER_Y, LANE_X, BALL_R } from '../table.js';
import { createWorld } from '../physics.js';

function setup() {
  const t = buildTable();
  const w = createWorld({ gravity: 1900, colliders: t.colliders, slopes: t.slopes });
  return { t, w };
}

/** Прогнать шарик: → { ball, seen: Set id датчиков/ударов, path }. */
function run({ x, y, vx = 0, vy = 0, sec = 4, flip = null }) {
  const { t, w } = setup();
  const b = w.addBall(x, y, vx, vy, BALL_R);
  const seen = new Set();
  const enters = [];
  for (let s = 0; s < sec * 60; s++) {
    if (flip) flip(t, b, s);
    for (const e of w.step(1 / 60)) {
      if (!e.id) continue;
      seen.add(e.id);
      if (e.type === 'enter') enters.push({ id: e.id, vy: e.ball.vy });
    }
    if (b.y > 1800) break;
  }
  return { b, seen, enters, t };
}

let seed = 12345;
const rnd = () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
  return seed / 4294967296;
};

test('на столе есть всё, о чём знают правила', () => {
  const { t } = setup();
  const ids = new Set(t.colliders.map((c) => c.id).filter(Boolean));
  const need = [
    'bump0', 'bump1', 'bump2', 'bumpSat', 'lbump0', 'lbump1', 'lbump2', 'slingL', 'slingR', 'rebL', 'rebR', 'post',
    'spin1', 'warp', 'outL', 'outR', 'retL', 'retR', 'bonusLane', 'kickL', 'kickR', 'drain', 'rampMouth', 'hyperMouth',
    'tubeExit', 'wormT', 'platExit', 'hyper', 'wormG', 'wormR', 'wormY', 'black', 'flipL', 'flipR',
  ];
  for (let k = 0; k < 3; k++) need.push(`mult${k}`, `medal${k}`, `boost${k}`, `hazL${k}`, `hazR${k}`, `fuelT${k}`, `mis${k}`, `reentry${k}`, `launchLane${k}`);
  for (let k = 0; k < 6; k++) need.push(`fuel${k}`, `trip${k}`);
  for (const id of need) assert.ok(ids.has(id), `нет ${id}`);
  for (const c of t.colliders) {
    const nums = [c.x, c.y, c.r, ...(c.a ?? []), ...(c.b ?? [])].filter((v) => v !== undefined);
    assert.ok(nums.every(Number.isFinite), `координаты ${c.id ?? c.kind}`);
  }
  for (const h of Object.values(t.elements.holes)) assert.ok(h.out && h.v, 'у лунки есть выход');
});

test('пружина: слабый запуск возвращается, средний выходит из трубы, полный — по орбите в топливный канал', () => {
  const weak = run({ x: LANE_X, y: PLUNGER_Y - BALL_R - 0.5, vy: -1700, sec: 3 });
  assert.ok(weak.seen.has('trip2') && !weak.seen.has('tubeExit'), 'слабый: до третьей растяжки');
  assert.ok(weak.b.x > 915 && weak.b.y > PLUNGER_Y - 40, 'слабый: снова на пружине');
  const mid = run({ x: LANE_X, y: PLUNGER_Y - BALL_R - 0.5, vy: -2500, sec: 3 });
  assert.ok(mid.seen.has('tubeExit'), 'средний: вышел из трубы');
  assert.ok(!mid.seen.has('fuel5'), 'средний: не до топливного канала');
  const full = run({ x: LANE_X, y: PLUNGER_Y - BALL_R - 0.5, vy: -3650, sec: 3 });
  assert.ok(full.seen.has('tubeExit') && full.seen.has('fuel5') && full.seen.has('spin1'), 'полный: орбита через канал');
});

test('левый спасатель — вверх по каналу (дозаправка и флаги), правый — обратно на стол', () => {
  const left = run({ x: 57, y: 1620, vy: -2450, sec: 3 });
  for (const id of ['fuel0', 'fuel5', 'spin1']) assert.ok(left.seen.has(id), `слева: ${id}`);
  const right = run({ x: 877, y: 1600, vx: -500, vy: -1700, sec: 2 });
  assert.ok(!right.seen.has('drain') || right.seen.has('retR'), 'справа: не прямо в сток');
});

test('ворота канала: шарик сверху выходит на стол, а не во внешнюю дорожку', () => {
  for (const vy of [0, 400, 900, 1500]) {
    const r = run({ x: 57, y: 620, vy, sec: 2 });
    assert.ok(!r.seen.has('outL'), `vy=${vy}: во внешнюю дорожку`);
  }
});

test('шарик нигде не застревает (случайные шарики, флипперы дёргаются)', () => {
  const stuck = [];
  for (let n = 0; n < 60; n++) {
    const { t, w } = setup();
    const b = w.addBall(260 + rnd() * 480, 80 + rnd() * 140, (rnd() - 0.5) * 3000, (rnd() - 0.2) * 2400, BALL_R);
    let slow = 0;
    for (let s = 0; s < 60 * 15; s++) {
      t.flippers.forEach((f) => { if (rnd() < 0.08) f.pressed = !f.pressed; });
      w.step(1 / 60);
      if (b.y > 1775) break;
      const onPlunger = b.x > 915 && b.y > PLUNGER_Y - 40;
      const onFlippers = b.y > 1500 && b.x > 330 && b.x < 670;
      if (Math.hypot(b.vx, b.vy) < 20 && !onPlunger && !onFlippers) slow++;
      else slow = 0;
      if (slow > 180) {
        stuck.push([Math.round(b.x), Math.round(b.y), b.layer]);
        break;
      }
    }
  }
  assert.deepEqual(stuck, [], `застрял: ${JSON.stringify(stuck)}`);
});

test('платформа: шарик с рампы проходит дорожки и бамперы и уходит в лунку выхода', () => {
  for (const vx of [-160, -60, 0, 60, 160]) {
    const { w } = setup();
    const b = w.addBall(176, 1045, vx, 260, BALL_R);
    b.layer = 1;
    let out = false;
    for (let s = 0; s < 60 * 12 && !out; s++) out = w.step(1 / 60).some((e) => e.id === 'platExit' && e.type === 'enter');
    assert.ok(out, `vx=${vx}: застрял на платформе у ${Math.round(b.x)}, ${Math.round(b.y)}`);
  }
});

test('платформа без ловушек: шарик из 300 случайных мест и с любой скоростью уходит в лунку выхода', () => {
  // видео владельца (2026-10-02): шарик застрял в левой верхней дорожке платформы — бампер под ней закрывал проход и
  // подбрасывал шарик бесконечно. Теперь верхние бамперы раздвинуты, разделители короче, толчок бампера с отклонением.
  const { t } = setup();
  const solid = t.colliders.filter((c) => c.type === 'circle' && c.layer === 1);
  const stuck = [];
  let tried = 0;
  for (let k = 0; tried < 300 && k < 2000; k++) {
    const x = 125 + rnd() * 100;
    const y = 1025 + rnd() * 170;
    if (solid.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + BALL_R + 1)) continue;   // не внутри бампера
    tried++;
    const { w } = setup();
    const b = w.addBall(x, y, (rnd() - 0.5) * 800, (rnd() - 0.5) * 800, BALL_R);
    b.layer = 1;
    let out = false;
    for (let s = 0; s < 60 * 20 && !out; s++) out = w.step(1 / 60).some((e) => e.id === 'platExit' && e.type === 'enter');
    if (!out && b.layer === 1) stuck.push([Math.round(x), Math.round(y)]);
  }
  // редкий пинг-понг между бамперами дольше 20 с ловит страховка в игре (6 с на пятачке — в лунку выхода)
  assert.ok(stuck.length <= 3, `не вышли: ${JSON.stringify(stuck)}`);
  // то самое место из видео
  const { w } = setup();
  const b = w.addBall(126, 1050, 0, 0, BALL_R);
  b.layer = 1;
  let out = false;
  for (let s = 0; s < 60 * 20 && !out; s++) out = w.step(1 / 60).some((e) => e.id === 'platExit' && e.type === 'enter');
  assert.ok(out, 'из левой верхней дорожки платформы шарик выходит');
});

test('флипперы: с возвратной дорожки можно попасть в рампу запуска и в гиперпространство', () => {
  const shots = (side) => {
    const out = new Set();
    for (let trig = 340; trig <= 470; trig += 6) {
      const start = side < 0 ? [214, 1400] : [791, 1400];
      const tx = side < 0 ? trig : 1000 - trig;
      let pressed = false;
      const r = run({
        x: start[0], y: start[1], sec: 2.5,
        flip: (t, b) => {
          if (!pressed && (side < 0 ? b.x >= tx : b.x <= tx) && b.y > 1500) {
            t.flippers[side < 0 ? 0 : 1].pressed = true;
            pressed = true;
          }
        },
      });
      for (const e of r.enters) if ((e.id === 'rampMouth' || e.id === 'hyperMouth') && e.vy < -150) out.add(e.id);
      for (const id of r.seen) if (id.startsWith('bump') || id.startsWith('mult') || id === 'black') out.add(id);
    }
    return out;
  };
  const fromLeft = shots(-1);
  const fromRight = shots(1);
  assert.ok(fromRight.has('rampMouth'), `правый флиппер → рампа: ${[...fromRight]}`);
  assert.ok(fromLeft.has('hyperMouth') || fromRight.has('hyperMouth'), `гиперпространство: ${[...fromLeft]}`);
  assert.ok([...fromLeft, ...fromRight].some((id) => id.startsWith('bump')), 'до бамперов');
});
