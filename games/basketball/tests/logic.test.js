// Баскетбол: натяжение и прицел, полёт и стены, дужки и сетка, попадание только сверху, очки и серия чистых,
// промах; генератор корзин (в пределах стены, выше стартовой, до каждой можно добросить), бот; сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, STEP, R, GRAVITY, RIM, TUBE, NET_H, SEAT, E_WALL, PULL_MIN, PULL_MAX, V_MIN, V_MAX, AIM_MAX, AIM_LONG, AIM_SHORT,
  AIM_EASE, CLEAN_MAX, FIRE_AT, BLUE_AT, BANK, LOST_TIME, AIR_MAX, EDGE, RISE_MIN, RISE_MAX, APART,
  heatOf, aimTime, clampView, aim, pullFor, preview, placeAt, shapeOf, levelOf, canReach, fits, newGame, shoot, step, trial,
  solve, isValidState, snapshot, restore, emptyStats, isValidStats, recordGame, VIEW_MIN, VIEW_MAX,
} from '../logic.js';

const DT = 1 / 60;
const has = (events, type) => events.some((e) => e.type === type);

/** Шагать, пока мяч летит (или не выйдет время); возвращает все события. */
function fly(s, seconds = 6) {
  const all = [];
  for (let t = 0; t < seconds && (s.phase === 'fly' || s.phase === 'lost'); t += DT) all.push(...step(s, DT));
  return all;
}

/** Партия с корзинами там, где нужно тесту: стартовая — (fx, 0), целевая — to. */
function court({ fx = 80, to = {} } = {}) {
  const s = newGame({ seed: 1 });
  Object.assign(s.from, { x: fx, bx: fx, y: 0, by: 0 });
  const k = { x: 215, y: 110, a: 0, mv: null, ...to };
  Object.assign(s.to, { ...k, bx: k.x, by: k.y, vx: 0, vy: 0 });
  Object.assign(s.ball, { x: fx, y: -SEAT, vx: 0, vy: 0 });
  return s;
}

/** Положить мяч в воздух со скоростью: как будто он уже летит (своя корзина снова ловит). */
function airborne(s, x, y, vx, vy) {
  Object.assign(s.ball, { x, y, vx, vy, walls: 0, rim: false, armed: true, air: 0.5 });
  s.phase = 'fly';
  s.shots = Math.max(1, s.shots);
  return s;
}

/** Чистый бросок бота; если сейчас так бросить нельзя (корзина проезжает над стартовой) — подождать. */
function botShot(s, opts) {
  let shot = solve(s, opts);
  for (let t = 0; !shot?.clean && t < 8; t += 0.1) {
    step(s, 0.1);
    shot = solve(s, opts);
  }
  return shot;
}

// ---------- натяжение ----------

test('натяжение: мяч летит в обратную сторону; короткое и «вверх» — не бросок', () => {
  assert.equal(aim(0, 0), null);
  assert.equal(aim(3, -PULL_MIN + 2), null, 'палец дрогнул');
  assert.equal(aim(0, 60), null, 'тянуть вверх — значит бросать вниз');
  const a = aim(-30, -40);
  assert.ok(a.vx > 0 && a.vy > 0, 'тянул влево-вниз — летит вправо-вверх');
  assert.ok(Math.abs(a.vy / a.vx - 40 / 30) < 1e-9, 'ровно против натяжения');
  assert.ok(Math.abs(Math.hypot(a.dx, a.dy) - 1) < 1e-9);
});

test('сила растёт с натяжением: от V_MIN до V_MAX, дальше PULL_MAX — не растёт', () => {
  const speed = (len) => Math.hypot(aim(0, -len).vx, aim(0, -len).vy);
  assert.ok(Math.abs(speed(PULL_MIN) - V_MIN) < 1e-6);
  assert.ok(Math.abs(speed(PULL_MAX) - V_MAX) < 1e-6);
  assert.ok(Math.abs(speed(PULL_MAX * 3) - V_MAX) < 1e-6);
  let prev = 0;
  for (let len = PULL_MIN; len <= PULL_MAX; len += 4) {
    assert.ok(speed(len) > prev);
    prev = speed(len);
  }
  assert.equal(aim(0, -PULL_MIN).power, 0);
  assert.equal(aim(0, -PULL_MAX).power, 1);
  assert.ok(Math.abs(aim(0, -(PULL_MIN + PULL_MAX) / 2).power - 0.5) < 1e-9);
});

test('слишком пологий бросок приподнимается до AIM_MAX — в ту же сторону', () => {
  for (const side of [-1, 1]) {
    const a = aim(-side * 80, -2);
    assert.ok(Math.abs(Math.atan2(Math.abs(a.dx), a.dy) - AIM_MAX) < 1e-9);
    assert.equal(Math.sign(a.vx), side);
    const b = aim(-side * 80, 10);                                 // чуть вверх — тоже приподнимается
    assert.ok(Math.abs(Math.atan2(Math.abs(b.dx), b.dy) - AIM_MAX) < 1e-9);
  }
});

test('pullFor — обратное к aim: то же натяжение даёт тот же бросок', () => {
  for (const [px, py] of [[-30, -40], [50, -70], [0, -PULL_MAX], [-12, -20], [70, -30]]) {
    const a = aim(px, py);
    const p = pullFor(a.vx, a.vy);
    const b = aim(p.px, p.py);
    assert.ok(Math.abs(a.vx - b.vx) < 1e-6 && Math.abs(a.vy - b.vy) < 1e-6);
  }
});

test('жар мяча по серии; пунктир прицела укорачивается к AIM_EASE-й корзине; высота экрана — в пределах', () => {
  assert.deepEqual([0, 1, FIRE_AT - 1, FIRE_AT, BLUE_AT - 1, BLUE_AT, 50].map(heatOf), [0, 0, 1, 2, 2, 3, 3]);
  assert.equal(aimTime(0), AIM_LONG);
  assert.equal(aimTime(AIM_EASE), AIM_SHORT);
  assert.equal(aimTime(500), AIM_SHORT);
  assert.ok(aimTime(3) < aimTime(2));
  assert.equal(clampView(100), VIEW_MIN);
  assert.equal(clampView(5000), VIEW_MAX);
  assert.equal(clampView(NaN), 640);
});

// ---------- полёт ----------

test('бросок вверх: высота — v²/2g, мяч вылетает со дна сетки и возвращается в свою корзину', () => {
  const s = court({ to: { x: 220, y: 200 } });
  const v = 600;
  const ev = shoot(s, 0, v);
  assert.equal(ev[0].type, 'shoot');
  assert.equal(s.phase, 'fly');
  assert.equal(s.shots, 1);
  assert.ok(Math.abs(s.ball.y + SEAT) < 1e-9);
  let top = -Infinity;
  const all = [];
  for (let t = 0; t < 3 && s.phase === 'fly'; t += DT) {
    all.push(...step(s, DT));
    top = Math.max(top, s.ball.y);
  }
  assert.ok(Math.abs(top - (-SEAT + (v * v) / (2 * GRAVITY))) < 1, `верхняя точка ${top}`);
  assert.ok(has(all, 'back'));
  assert.equal(s.phase, 'aim');
  assert.equal(s.made, 0);
  assert.equal(s.score, 0);
  assert.ok(Math.abs(s.ball.x - s.from.x) < 1e-9 && Math.abs(s.ball.y - (s.from.y - SEAT)) < 1e-9, 'мяч снова лежит в корзине');
});

test('пунктир прицела совпадает с настоящим полётом — и после отскока от стены', () => {
  for (const [vx, vy] of [[220, 760], [-420, 700], [560, 620], [-700, 500]]) {
    const s = court({ fx: 150, to: { x: 150, y: 215 } });
    s.to.y = s.to.by = 5000;                                       // корзина далеко — полёту не мешает
    const dots = preview(s, vx, vy, 0.6, 0.05);
    assert.equal(dots.length, 12);
    shoot(s, vx, vy);
    let walls = 0;
    for (const [x, y] of dots) {
      walls += step(s, 0.05).filter((e) => e.type === 'wall').length;
      assert.ok(Math.abs(s.ball.x - x) < 1e-6 && Math.abs(s.ball.y - y) < 1e-6, `(${s.ball.x}, ${s.ball.y}) ≠ (${x}, ${y})`);
    }
    if (Math.abs(vx) > 400) assert.ok(walls > 0, 'тест: этот бросок должен был задеть стену');
  }
});

test('пунктир: первая точка — где попросили, у целевой корзины он кончается', () => {
  const s = court();
  const shot = solve(s);
  const a = preview(s, shot.vx, shot.vy, 0.5, 0.05, 0.02);
  const b = preview(s, shot.vx, shot.vy, 0.5, 0.05, 0.05);
  assert.ok(a[0][1] < b[0][1], 'первая точка ближе к мячу');
  const long = preview(s, shot.vx, shot.vy, 3, 0.02);
  const last = long[long.length - 1];
  assert.ok(long.length * 0.02 < shot.time + 0.1, 'пунктир не идёт дальше корзины');
  assert.ok(Math.hypot(last[0] - s.to.x, last[1] - s.to.y) < RIM + R, 'и кончается у кольца');
});

test('стена отбивает: скорость гаснет до E_WALL, мяч за стену не выходит, отскоки считаются', () => {
  const s = court({ to: { x: 150, y: 5000 } });
  shoot(s, -700, 500);
  const events = [];
  for (let t = 0; t < 1.2; t += DT) {
    events.push(...step(s, DT));
    assert.ok(s.ball.x >= R - 1e-9 && s.ball.x <= W - R + 1e-9);
  }
  const hits = events.filter((e) => e.type === 'wall');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].side, -1);
  assert.ok(Math.abs(hits[0].v - 700) < 1e-6);
  assert.ok(Math.abs(Math.abs(s.ball.vx) - 700 * E_WALL ** hits.length) < 1e-6);
  assert.equal(s.ball.walls, hits.length);
});

test('своя корзина не мешает вылету: под любым углом мяч уходит, не задев её', () => {
  for (let deg = -78; deg <= 78; deg += 6) {
    const s = court({ fx: 150, to: { x: 150, y: 5000 } });
    const a = (deg * Math.PI) / 180;
    shoot(s, Math.sin(a) * 900, Math.cos(a) * 900);
    const events = [];
    for (let t = 0; t < 0.12; t += STEP) events.push(...step(s, STEP));
    assert.ok(!has(events, 'rim') && !has(events, 'net'), `угол ${deg}°`);
    assert.equal(s.ball.rim, false);
  }
});

// ---------- корзина ----------

test('мяч, упавший в середину кольца, пойман чисто: +2, серия 1, корзина становится стартовой', () => {
  const s = court();
  const target = s.to.id;
  airborne(s, 215, 170, 0, -200);
  const ev = fly(s);
  const hit = ev.find((e) => e.type === 'score');
  assert.ok(hit);
  assert.deepEqual([hit.pts, hit.clean, hit.bank, hit.streak, hit.heat, hit.was], [2, true, false, 1, 0, 0]);
  assert.ok(!has(ev, 'rim'));
  assert.equal(s.score, 2);
  assert.equal(s.made, 1);
  assert.equal(s.phase, 'aim');
  assert.equal(s.from.id, target);
  assert.equal(hit.next, s.to.id);
  assert.notEqual(s.to.id, target);
  assert.ok(Math.abs(s.ball.x - s.from.x) < 1e-9 && Math.abs(s.ball.y - (s.from.y - SEAT)) < 1e-9);
});

test('чуть в стороне — мяч задевает дужку: попал, но не чисто (+1, серия сброшена)', () => {
  const s = court();
  s.streak = 4;
  airborne(s, 215 + 17, 170, 0, -200);
  const ev = fly(s);
  const hit = ev.find((e) => e.type === 'score');
  assert.ok(has(ev, 'rim'), 'дужка задета');
  assert.ok(hit, 'мяч скатился в кольцо');
  assert.deepEqual([hit.pts, hit.clean, hit.streak, hit.heat, hit.was], [1, false, 0, 0, 2]);
  assert.equal(s.streak, 0);
});

test('на дужку — отскок; мимо кольца — промах', () => {
  const s = court();
  airborne(s, 215 + RIM, 170, 0, -300);
  let bounced = false;
  for (let t = 0; t < 0.5; t += STEP) {
    const ev = step(s, STEP);
    if (has(ev, 'rim')) {
      bounced = true;
      assert.ok(s.ball.vy > 0, 'мяч отлетел вверх');
      break;
    }
  }
  assert.ok(bounced);
  const far = court();
  airborne(far, 215 + RIM + R + TUBE + 14, 170, 0, -300);
  const ev = fly(far);
  assert.ok(!has(ev, 'score') && has(ev, 'miss') && has(ev, 'over'));
});

test('снизу и сбоку в корзину не попасть: сетка отбивает', () => {
  for (const [x, y, vx, vy] of [[215, 20, 0, 700], [215 - 8, 30, 30, 600], [215 + 10, 25, -20, 800], [120, 92, 520, 60], [300 - 20, 96, -500, 80]]) {
    const s = court();
    airborne(s, x, y, vx, vy);
    const ev = [];
    for (let t = 0; t < 0.5; t += STEP) ev.push(...step(s, STEP));
    assert.ok(!has(ev, 'score'), `снизу/сбоку: (${x}, ${y})`);
    assert.ok(has(ev, 'net') || has(ev, 'rim'), 'мяч задел корзину снаружи');
  }
});

test('мяч не проходит ни сквозь дужки, ни сквозь сетку — сотни случайных бросков', () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let touched = 0;
  for (let n = 0; n < 400; n++) {
    const s = court({ to: { x: 150 + (rnd() - 0.5) * 120, y: 90 + rnd() * 100, a: (rnd() - 0.5) * 1.1 } });
    const ang = (rnd() - 0.5) * 2.4;
    const v = V_MIN + rnd() * (V_MAX - V_MIN);
    shoot(s, Math.sin(ang) * v, Math.cos(ang) * v);
    const k = { ...s.to };
    const p = shapeOf(k);
    while (s.phase === 'fly') {
      const before = s.made;
      const ev = step(s, STEP);
      if (s.made > before) {
        // пойман: значит, был внутри кольца — между дужками и ниже их
        const e = ev.find((x) => x.type === 'score');
        const lx = (e.x - k.x) * Math.cos(k.a) + (e.y - k.y) * Math.sin(k.a);
        const ly = (e.y - k.y) * Math.cos(k.a) - (e.x - k.x) * Math.sin(k.a);
        assert.ok(Math.abs(lx) < RIM - TUBE && ly < 0, `пойман вне кольца: ${lx}, ${ly}`);
        break;
      }
      if (has(ev, 'rim') || has(ev, 'net')) touched += 1;
      for (const [x, y] of [p.l, p.r]) {
        assert.ok(Math.hypot(s.ball.x - x, s.ball.y - y) >= R + TUBE - 1.5, 'мяч в дужке');
      }
    }
  }
  assert.ok(touched > 100, 'тест: броски должны задевать корзину');
});

test('наклонное кольцо ловит мяч, который входит в него сверху по его оси', () => {
  for (const a of [0.5, -0.5]) {
    const s = court({ to: { x: 150, y: 120, a } });
    // ось кольца смотрит вверх и в сторону: мяч летит вдоль неё вниз
    const ux = -Math.sin(a);
    const uy = Math.cos(a);
    airborne(s, 150 + ux * 70, 120 + uy * 70, -ux * 500, -uy * 500);
    const ev = fly(s);
    const hit = ev.find((e) => e.type === 'score');
    assert.ok(hit && hit.clean, `наклон ${a}`);
    assert.equal(hit.tilt, a);
    assert.equal(s.from.a, 0, 'поймав мяч, корзина выпрямилась');
  }
});

test('ездящая корзина ходит по своему пути; поймав мяч — останавливается', () => {
  const s = court({ to: { x: 190, y: 120, mv: { rx: 40, ry: 0, per: 3, ph: 0, sh: 0 } } });
  const xs = [];
  for (let t = 0; t < 3; t += DT) {
    step(s, DT);
    xs.push(s.to.x);
    assert.equal(s.to.y, 120);
  }
  assert.ok(Math.min(...xs) < 151 && Math.min(...xs) >= 150 - 1e-9);
  assert.ok(Math.max(...xs) > 229 && Math.max(...xs) <= 230 + 1e-9);
  // по кругу
  const o = placeAt({ bx: 150, by: 100, mv: { rx: 30, ry: 20, per: 4, ph: 0, sh: Math.PI / 2 } }, 1);
  assert.ok(Math.abs(o.x - 180) < 1e-9 && Math.abs(o.y - 100) < 1e-9);
  assert.ok(Math.abs(o.vx) < 1e-9 && o.vy < 0);
  // мяч сверху — корзина ловит на ходу и встаёт
  const shot = botShot(s);
  assert.ok(shot);
  shoot(s, shot.vx, shot.vy);
  fly(s);
  assert.equal(s.made, 1);
  assert.equal(s.from.mv, null);
  const x = s.from.x;
  step(s, 1);
  assert.equal(s.from.x, x);
  assert.equal(s.ball.x, x);
});

// ---------- очки ----------

/** Забить n корзин подряд ботом; flags(i) — что подменить в полёте: { rim, walls }. Возвращает события score. */
function series(s, n, flags = () => null) {
  const hits = [];
  for (let i = 0; i < n; i++) {
    const shot = botShot(s);
    assert.ok(shot && shot.clean, `бросок ${i}`);
    shoot(s, shot.vx, shot.vy);
    const f = flags(i);
    if (f) step(s, 0.05);
    if (f?.rim) s.ball.rim = true;
    if (f?.walls) s.ball.walls = f.walls;
    hits.push(fly(s).find((e) => e.type === 'score'));
    assert.ok(hits[i], `попадание ${i}`);
  }
  return hits;
}

test('чистые подряд: 2, 3, 4 … не больше CLEAN_MAX; с третьего мяч горит, с седьмого — синим', () => {
  const s = newGame({ seed: 5 });
  const hits = series(s, 12);
  assert.deepEqual(hits.map((e) => e.pts), [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]);
  assert.equal(Math.max(...hits.map((e) => e.pts)), CLEAN_MAX);
  assert.deepEqual(hits.map((e) => e.heat), [0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(hits.map((e) => e.was), [0, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  assert.equal(s.score, 84);
  assert.equal(s.streak, 12);
  assert.deepEqual(s.run, { clean: 12, banks: 0, streak: 12, fires: 1 });
});

test('задел кольцо — серия с начала: одно очко, огонь гаснет; потом снова 2, 3…', () => {
  const s = newGame({ seed: 6 });
  const hits = series(s, 8, (i) => (i === 4 ? { rim: true } : null));
  assert.deepEqual(hits.map((e) => e.pts), [2, 3, 4, 5, 1, 2, 3, 4]);
  assert.deepEqual(hits.map((e) => e.streak), [1, 2, 3, 4, 0, 1, 2, 3]);
  assert.deepEqual([hits[4].was, hits[4].heat, hits[4].clean], [2, 0, false]);
  assert.equal(s.run.fires, 2, 'мяч загорался дважды');
  assert.equal(s.run.streak, 4);
  assert.equal(s.run.clean, 7);
});

test('с отскоком от стены очки броска удваиваются — и у чистого, и у обычного', () => {
  const s = newGame({ seed: 7 });
  const hits = series(s, 4, (i) => (i === 1 ? { walls: 1 } : i === 3 ? { walls: 2, rim: true } : null));
  assert.deepEqual(hits.map((e) => e.pts), [2, 3 * BANK, 4, 1 * BANK]);
  assert.deepEqual(hits.map((e) => e.bank), [false, true, false, true]);
  assert.equal(s.run.banks, 2);
});

test('настоящий бросок от стены: находится перебором, попадает и даёт ×2', () => {
  const s = court({ fx: 205, to: { x: 215, y: 140 } });
  s.from.x = s.from.bx = 95;
  Object.assign(s.to, { x: 205, bx: 205 });
  let found = null;
  for (let deg = 8; deg <= 76 && !found; deg += 1) {
    for (let v = 620; v <= V_MAX && !found; v += 10) {
      const a = (deg * Math.PI) / 180;
      const res = trial(s, Math.sin(a) * v, Math.cos(a) * v);
      if (!res.scored) continue;
      const c = JSON.parse(JSON.stringify(s));
      shoot(c, Math.sin(a) * v, Math.cos(a) * v);
      const ev = fly(c);
      const hit = ev.find((e) => e.type === 'score');
      if (hit?.bank) found = { hit, walls: ev.filter((e) => e.type === 'wall').length };
    }
  }
  assert.ok(found, 'бросок от стены есть');
  assert.ok(found.walls >= 1);
  assert.equal(found.hit.pts, (found.hit.clean ? 2 : 1) * BANK);
});

test('мяч вернулся в свою корзину: очков нет, серия сброшена, можно бросать снова', () => {
  const s = newGame({ seed: 8 });
  series(s, 3);
  const before = { score: s.score, made: s.made, to: s.to.id, from: s.from.id };
  shoot(s, 0, V_MIN);
  const ev = fly(s);
  const back = ev.find((e) => e.type === 'back');
  assert.ok(back);
  assert.equal(back.was, 2, 'мяч горел');
  assert.deepEqual({ score: s.score, made: s.made, to: s.to.id, from: s.from.id }, before);
  assert.equal(s.streak, 0);
  assert.equal(s.phase, 'aim');
  assert.equal(s.shots, 4);
  assert.equal(series(s, 1)[0].pts, 2);
});

test('промах: мяч ниже стартовой корзины — потерян, через LOST_TIME — конец; дальше мир стоит', () => {
  const s = newGame({ seed: 9 });
  series(s, 2);
  const score = s.score;
  const side = s.to.x > s.from.x ? -1 : 1;                         // в сторону от целевой корзины
  shoot(s, side * Math.sin(1.3) * V_MIN, Math.cos(1.3) * V_MIN);
  let missAt = -1;
  let overAt = -1;
  for (let t = 0; t < 4 && s.phase !== 'over'; t += STEP) {
    const ev = step(s, STEP);
    if (has(ev, 'miss')) {
      missAt = s.t;
      assert.equal(s.phase, 'lost');
      assert.ok(s.ball.y < s.from.y - NET_H - R);
    }
    if (has(ev, 'over')) overAt = s.t;
  }
  assert.ok(missAt > 0 && overAt > 0);
  assert.ok(Math.abs(overAt - missAt - LOST_TIME) < STEP * 1.5);
  assert.equal(s.score, score);
  assert.equal(s.phase, 'over');
  const frozen = JSON.stringify(s);
  assert.deepEqual(step(s, 1), []);
  assert.equal(shoot(s, 0, 600), null);
  assert.equal(JSON.stringify(s), frozen);
});

test('бросать можно только из корзины и только допустимым броском', () => {
  const s = court();
  assert.equal(shoot(s, 0, V_MIN - 5), null, 'слишком слабо');
  assert.equal(shoot(s, 0, V_MAX + 5), null, 'слишком сильно');
  assert.equal(shoot(s, 900, 20), null, 'слишком полого');
  assert.equal(shoot(s, 100, -700), null, 'вниз');
  assert.equal(shoot(s, NaN, 700), null);
  assert.equal(s.shots, 0);
  assert.ok(shoot(s, 100, 700));
  assert.equal(shoot(s, 100, 700), null, 'мяч уже летит');
  assert.equal(shoot(null, 0, 700), null);
});

test('мяч не летает вечно: через AIR_MAX секунд он потерян', () => {
  const s = court({ to: { x: 150, y: 5000 } });
  shoot(s, 0, 900);
  s.ball.air = AIR_MAX - 0.01;
  s.ball.y = 100;
  s.ball.vy = 50;
  const ev = [...step(s, DT), ...step(s, DT)];
  assert.ok(has(ev, 'miss'));
  assert.equal(s.phase, 'lost');
});

test('пустой, отрицательный и нечисловой шаг ничего не меняют; большой — делится на мелкие', () => {
  const s = court();
  shoot(s, 120, 700);
  const before = JSON.stringify(s);
  for (const dt of [0, -1, NaN, Infinity, undefined]) assert.deepEqual(step(s, dt), []);
  assert.equal(JSON.stringify(s), before);
  // шаг в секунду: мяч не пролетает сквозь корзину, а попадает в неё, как и мелкими шагами
  const a = court();
  const b = court();
  const shot = solve(a);
  shoot(a, shot.vx, shot.vy);
  shoot(b, shot.vx, shot.vy);
  const big = [...step(a, 0.5), ...step(a, 0.5), ...step(a, 0.5)];
  fly(b);
  assert.ok(has(big, 'score'));
  assert.equal(a.made, b.made);
  assert.equal(a.score, b.score);
});

// ---------- генератор ----------

/** Корзины партии по порядку: бот забивает n корзин; о каждой — что она такое и откуда в неё бросали. */
function tour(seed, n) {
  const s = newGame({ seed });
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({ n: i, k: JSON.parse(JSON.stringify(s.to)), from: { x: s.from.x, y: s.from.y } });
    const shot = botShot(s, { careful: false });
    assert.ok(shot, `зерно ${seed}, корзина ${i}: бросок не найден`);
    shoot(s, shot.vx, shot.vy);
    fly(s);
    assert.equal(s.made, i + 1, `зерно ${seed}, корзина ${i}: бот промахнулся`);
    list[i].clean = s.streak > 0;
  }
  return list;
}

/** Все точки пути корзины. */
function pathOf(k) {
  if (!k.mv) return [[k.bx, k.by]];
  const out = [];
  for (let i = 0; i < 48; i++) {
    const p = placeAt({ ...k }, (i / 48 - k.mv.ph) * k.mv.per);
    out.push([p.x, p.y]);
  }
  return out;
}
const kindOf = (k) => (!k.mv ? 'none' : k.mv.sh ? 'o' : k.mv.rx && k.mv.ry ? 'd' : k.mv.rx ? 'h' : 'v');

const TOURS = [];
function tours() {
  if (!TOURS.length) for (let seed = 1; seed <= 60; seed++) TOURS.push(tour(seed, 60));
  return TOURS;
}

test('каждую корзину можно забить чисто: бот забивает 60 корзин подряд на 60 зёрнах, не задев ни одного кольца', () => {
  const all = tours().flat();
  assert.equal(all.length, 3600);
  assert.equal(all.filter((b) => !b.clean).length, 0);
});

test('корзина всегда в пределах стены, выше стартовой, видна и не вплотную — на всём своём пути', () => {
  for (const list of tours()) {
    for (const { k, from, n } of list) {
      for (const [x, y] of pathOf(k)) {
        assert.ok(x >= EDGE - 1e-6 && x <= W - EDGE + 1e-6, `корзина ${n}: x = ${x}`);
        assert.ok(y >= from.y + RISE_MIN - 1e-6 && y <= from.y + RISE_MAX + 1e-6, `корзина ${n}: выше на ${y - from.y}`);
        assert.ok(Math.hypot(x - from.x, y - from.y) >= APART - 1e-6, `корзина ${n}: вплотную к стартовой`);
      }
      assert.ok(fits(k, { x: from.x, y: from.y }), `корзина ${n}`);
      assert.ok(Math.abs(k.a) <= 0.66 + 1e-9);
    }
  }
});

test('между стеной и кольцом мяч проходит: застрять негде', () => {
  assert.ok(EDGE - RIM - TUBE >= 2 * R + 4);
  assert.ok(APART - 2 * (RIM + TUBE) >= 2 * R, 'и между двумя корзинами тоже');
});

test('первые две корзины и каждая шестая стоят ровно; ездить начинают с третьей, наклон — с седьмой', () => {
  const seen = new Set();
  for (const list of tours()) {
    for (const { k, n } of list) {
      if (n < 2 || n % 6 === 5) {
        assert.equal(k.mv, null, `корзина ${n} — передышка`);
        assert.equal(k.a, 0);
      }
      if (n < 6) assert.equal(k.a, 0, `корзина ${n} наклонена`);
      const kind = kindOf(k);
      if (kind === 'v') assert.ok(n >= 9);
      if (kind === 'd') assert.ok(n >= 15);
      if (kind === 'o') assert.ok(n >= 22);
      seen.add(kind);
    }
  }
  assert.deepEqual([...seen].sort(), ['d', 'h', 'none', 'o', 'v'], 'бывают все виды');
  assert.equal(levelOf(0).rest, true);
  assert.equal(levelOf(5).rest, true);
  assert.equal(levelOf(4).rest, false);
});

test('чем дальше, тем труднее: ездящих больше, наклон круче, размах шире и ход быстрее', () => {
  const part = (lo, hi) => tours().flat().filter((b) => b.n >= lo && b.n < hi);
  const share = (list, f) => list.filter(f).length / list.length;
  const mean = (list, f) => list.reduce((sum, b) => sum + f(b), 0) / list.length;
  const early = part(2, 12);
  const late = part(36, 60);
  assert.ok(share(late, (b) => b.k.mv) > share(early, (b) => b.k.mv) + 0.15);
  assert.ok(share(late, (b) => b.k.mv) > 0.6, 'дальше ездит больше половины корзин');
  assert.ok(mean(late, (b) => Math.abs(b.k.a)) > mean(early, (b) => Math.abs(b.k.a)) + 0.1);
  const movers = (list) => list.filter((b) => b.k.mv);
  assert.ok(mean(movers(late), (b) => Math.hypot(b.k.mv.rx, b.k.mv.ry)) > mean(movers(early), (b) => Math.hypot(b.k.mv.rx, b.k.mv.ry)) + 8);
  assert.ok(mean(movers(late), (b) => b.k.mv.per) < mean(movers(early), (b) => b.k.mv.per) - 0.5);
  assert.ok(levelOf(40).per < levelOf(3).per && levelOf(40).rx > levelOf(3).rx);
});

test('canReach: до корзины прямо над стартовой и до слишком далёкой не добросить', () => {
  assert.equal(canReach(80, -SEAT, 215, 110, 0), true);
  assert.equal(canReach(80, -SEAT, 80, 150, 0), false, 'прямо над собой — снизу сквозь сетку');
  assert.equal(canReach(80, -SEAT, 100, 160, 0), false, 'почти над собой');
  assert.equal(canReach(20, -SEAT, 280, 520, 0), false, 'слишком высоко');
  assert.equal(canReach(80, -SEAT, 215, 110, -1.2), false, 'кольцо отвернулось');
});

test('одно зерно — одни и те же корзины; разные зёрна — разные', () => {
  const sig = (list) => JSON.stringify(list.map((b) => b.k));
  assert.equal(sig(tour(77, 20)), sig(tour(77, 20)));
  assert.notEqual(sig(tour(77, 20)), sig(tour(78, 20)));
  assert.equal(JSON.stringify(newGame({ seed: 0 })), JSON.stringify(newGame({ seed: 1 })), 'нулевое зерно — как первое');
  const s = newGame();
  assert.ok(s.from.x >= EDGE && s.from.x <= W - EDGE);
  assert.equal(s.from.y, 0);
  assert.equal(s.phase, 'aim');
});

// ---------- бот ----------

test('бот выбирает надёжный бросок: небольшая ошибка в угле и силе его не портит', () => {
  let ok = 0;
  let total = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = newGame({ seed: seed * 13 });
    for (let i = 0; i < 16; i++) {
      const shot = botShot(s);
      assert.ok(shot && shot.clean);
      const v = Math.hypot(shot.vx, shot.vy);
      const ang = Math.atan2(shot.vy, shot.vx);
      for (const [da, dv] of [[0.012, 1], [-0.012, 1], [0, 1.01], [0, 0.99]]) {
        total += 1;
        const w = Math.max(V_MIN, Math.min(V_MAX, v * dv));
        if (trial(s, Math.cos(ang + da) * w, Math.sin(ang + da) * w).scored) ok += 1;
      }
      shoot(s, shot.vx, shot.vy);
      fly(s);
    }
  }
  assert.ok(ok > total * 0.97, `${ok} из ${total}`);
});

test('trial ничего не меняет в партии; solve не бросает, пока мяч летит', () => {
  const s = newGame({ seed: 3 });
  const before = JSON.stringify(s);
  const shot = solve(s);
  const res = trial(s, shot.vx, shot.vy);
  assert.equal(JSON.stringify(s), before);
  assert.ok(res.scored && res.clean && res.pts === 2 && res.time > 0.2);
  assert.deepEqual(trial(s, 0, 5), { scored: false, clean: false, pts: 0, back: false, time: 0 }, 'недопустимый бросок');
  assert.ok(Math.abs(Math.hypot(aim(shot.px, shot.py).vx - shot.vx, aim(shot.px, shot.py).vy - shot.vy)) < 1e-6);
  shoot(s, shot.vx, shot.vy);
  assert.equal(solve(s), null);
});

// ---------- сохранение ----------

test('партию можно сохранить посреди полёта и продолжить: дальше она идёт так же', () => {
  const a = newGame({ seed: 21 });
  series(a, 5);
  const shot = botShot(a);
  shoot(a, shot.vx, shot.vy);
  step(a, 0.2);
  const snap = snapshot(a);
  assert.equal(snap.phase, 'fly');
  const b = restore(JSON.parse(JSON.stringify(snap)));
  assert.ok(b);
  for (let i = 0; i < 6; i++) {
    fly(a);
    fly(b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    const next = botShot(a);
    botShot(b);
    shoot(a, next.vx, next.vy);
    shoot(b, next.vx, next.vy);
  }
  assert.equal(a.made, b.made);
  assert.ok(a.made >= 10);
});

test('сохраняется только начатая и не оконченная партия; мяч в корзине после загрузки лежит на месте', () => {
  const s = newGame({ seed: 22 });
  assert.equal(snapshot(s), null, 'бросков ещё не было');
  assert.equal(snapshot(null), null);
  series(s, 3);
  const snap = snapshot(s);
  assert.ok(isValidState(snap));
  snap.ball.x += 3;                                                // мусор в положении мяча — поправится
  const back = restore(snap);
  assert.equal(back.ball.x, back.from.x);
  assert.equal(back.ball.y, back.from.y - SEAT);
  shoot(s, 0.4 * V_MIN * (s.to.x > s.from.x ? -1 : 1), 0.92 * V_MIN);
  while (s.phase === 'fly') step(s, DT);
  if (s.phase === 'lost') {
    assert.ok(isValidState(snapshot(s)), 'падающий мяч тоже сохраняется — промах не отменить');
    fly(s);
    assert.equal(snapshot(s), null, 'партия кончилась');
  }
});

test('испорченное сохранение не принимается', () => {
  const s = newGame({ seed: 23 });
  series(s, 4);
  const shot = botShot(s);
  shoot(s, shot.vx, shot.vy);
  step(s, 0.1);
  const good = () => JSON.parse(JSON.stringify(snapshot(s)));
  assert.ok(isValidState(good()));
  for (const junk of [null, undefined, 5, 'x', [], {}]) assert.equal(isValidState(junk), false);
  const spoil = [
    (d) => { d.v = 99; },
    (d) => { d.phase = 'over'; },
    (d) => { d.phase = 'play'; },
    (d) => { d.rs = -1; },
    (d) => { d.rs = 1.5; },
    (d) => { d.t = -1; },
    (d) => { d.t = null; },
    (d) => { d.score = -1; },
    (d) => { d.score = 1e9; },
    (d) => { d.score = 0; },
    (d) => { d.made = 2.5; },
    (d) => { d.made = d.shots + 1; },
    (d) => { d.streak = d.made + 1; },
    (d) => { d.lostT = -1; },
    (d) => { delete d.nid; },
    (d) => { d.nid = d.to.id; },
    (d) => { d.from = null; },
    (d) => { d.from.x = 'a'; },
    (d) => { d.from.x = -5; },
    (d) => { d.from.a = 0.3; },
    (d) => { d.from.mv = { rx: 10, ry: 0, per: 2, ph: 0, sh: 0 }; },
    (d) => { d.to.id = d.from.id; },
    (d) => { d.to.a = 4; },
    (d) => { d.to.by = d.from.y; },
    (d) => { d.to.mv = { rx: 10 }; },
    (d) => { d.to.mv = { rx: 10, ry: 0, per: 0, ph: 0, sh: 0 }; },
    (d) => { d.to.mv = { rx: 1e6, ry: 0, per: 2, ph: 0, sh: 0 }; },
    (d) => { d.to.mv = 7; },
    (d) => { d.ball = null; },
    (d) => { d.ball.x = NaN; },
    (d) => { d.ball.x = 9999; },
    (d) => { d.ball.vy = 1e9; },
    (d) => { d.ball.walls = -1; },
    (d) => { d.ball.rim = 1; },
    (d) => { delete d.ball.armed; },
    (d) => { d.ball.air = -1; },
    (d) => { d.run = null; },
    (d) => { d.run.clean = d.made + 1; },
    (d) => { d.run.streak = d.streak - 1; },
    (d) => { delete d.run.fires; },
  ];
  spoil.forEach((f, i) => {
    const d = good();
    f(d);
    assert.equal(isValidState(d), false, `порча ${i} принята`);
    assert.equal(restore(d), null);
  });
});

// ---------- статистика ----------

test('статистика: партия добавляет своё, рекорд и серия — лучшие', () => {
  assert.ok(isValidStats(emptyStats()));
  for (const bad of [null, 5, {}, { ...emptyStats(), best: -1 }, { ...emptyStats(), games: 1.5 }, { ...emptyStats(), clean: '3' }]) {
    assert.equal(isValidStats(bad), false);
  }
  const s = newGame({ seed: 31 });
  series(s, 6, (i) => (i === 2 ? { walls: 1 } : null));
  const one = recordGame(emptyStats(), s);
  assert.deepEqual(one, { games: 1, best: s.score, baskets: 6, clean: 6, banks: 1, streak: 6, fires: 1 });
  const small = newGame({ seed: 32 });
  series(small, 2);
  const two = recordGame(one, small);
  assert.deepEqual(two, { games: 2, best: s.score, baskets: 8, clean: 8, banks: 1, streak: 6, fires: 1 });
  assert.ok(isValidStats(two));
  assert.deepEqual(recordGame(emptyStats(), newGame({ seed: 1 })), { ...emptyStats(), games: 1 });
});
