import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newGame, turn, step, tickMs, idx, xy, spikeUp, moverCell, isValidState, emptyStats, isValidStats, recordRun, bestKey,
  DIRS, SPEEDS, SIZES, MODES, QUEUE_MAX, BONUS_EVERY, BONUS_TTL, SHIELD_FREEZE, START_LEN, POWER_TIME, FRUITS, FRUIT_R,
} from '../logic.js';
import { levelMap, MAP_COUNT, LEVEL_COLS, LEVEL_ROWS, cycleOf } from '../levels.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const classic = (extra = {}) => newGame({ mode: 'classic', speed: 'snake', size: 'medium', ...extra }, seeded(1));
/** Положить яблоко в клетку (убрав остальные яблоки). */
function putApple(s, x, y) {
  s.foods = s.foods.filter((f) => f.kind !== 'apple');
  s.foods.push({ kind: 'apple', idx: idx(s, x, y) });
}
const head = (s) => xy(s, s.snake[0]);

// ---------- управление ----------

test('поворот: назад и в ту же сторону нельзя, очередь до 3, быстрый двойной свайп не разворачивает в шею', () => {
  const s = classic();
  assert.equal(s.dir, 'R');
  assert.equal(turn(s, 'L'), false, 'разворот назад');
  assert.equal(turn(s, 'R'), false, 'то же направление');
  assert.equal(s.started, true, 'но свайп запускает игру');
  // вверх и сразу влево за один шаг: «влево» проверяется по «вверх», а не по текущему «вправо»
  assert.equal(turn(s, 'U'), true);
  assert.equal(turn(s, 'L'), true);
  assert.equal(turn(s, 'D'), true);
  assert.equal(turn(s, 'R'), false, `очередь не длиннее ${QUEUE_MAX}`);
  const start = head(s);
  step(s);
  assert.deepEqual(head(s), { x: start.x, y: start.y - 1 });
  step(s);
  assert.deepEqual(head(s), { x: start.x - 1, y: start.y - 1 });
  assert.equal(s.dead, false, 'в шею не врезались');
});

test('до первого свайпа змейка стоит', () => {
  const s = classic();
  const before = s.snake.slice();
  step(s);
  assert.deepEqual(s.snake, before);
});

// ---------- основные правила ----------

test('ест яблоко — растёт на 1 и получает очки по скорости; новое яблоко появляется', () => {
  for (const speed of Object.keys(SPEEDS)) {
    const s = classic({ speed });
    s.started = true;
    const h = head(s);
    putApple(s, h.x + 1, h.y);
    const ev = step(s);
    assert.ok(ev.some((e) => e.type === 'eat' && e.points === 10 * SPEEDS[speed].mult));
    assert.equal(s.snake.length, START_LEN, 'рост — на следующем шаге');
    step(s);
    assert.equal(s.snake.length, START_LEN + 1);
    assert.equal(s.foods.filter((f) => f.kind === 'apple').length, 1);
  }
});

test('стена поля и своё тело — смерть; в клетку уходящего хвоста — можно', () => {
  const s = classic();
  s.started = true;
  let guard = 0;
  let ev = [];
  while (!s.dead && guard++ < 50) ev = step(s);
  assert.ok(s.dead);
  assert.equal(ev.find((e) => e.type === 'die').reason, 'wall');

  // квадрат из 4: голова идёт в клетку хвоста, который как раз уходит
  const t = classic();
  t.started = true;
  t.foods = [];
  t.snake = [idx(t, 5, 5), idx(t, 5, 6), idx(t, 6, 6), idx(t, 6, 5)];
  t.dir = 'U';
  turn(t, 'R');
  step(t);
  assert.equal(t.dead, false, 'хвост ушёл — можно');

  const u = classic();
  u.started = true;
  u.snake = [idx(u, 5, 5), idx(u, 5, 6), idx(u, 6, 6), idx(u, 6, 5), idx(u, 6, 4)];
  u.dir = 'U';
  turn(u, 'R');
  step(u);
  assert.equal(u.dead, true, 'в своё тело — смерть');
});

test('классика ускоряется по мере еды, но не быстрее 60% от начального', () => {
  const s = classic();
  const base = tickMs(s);
  s.eaten = 30;
  assert.ok(tickMs(s) < base);
  s.eaten = 1000;
  assert.equal(tickMs(s), Math.round(base * 0.6));
});

// ---------- бонусная еда и усилители ----------

test('бонусная еда: после 5 яблок, живёт ограниченно, очки за скорость, змейка не растёт', () => {
  const s = classic();
  s.started = true;
  let spawned = null;
  for (let k = 0; k < BONUS_EVERY; k++) {
    const h = head(s);
    s.snake = [idx(s, 2, 8), idx(s, 1, 8), idx(s, 0, 8)];
    s.dir = 'R';
    s.queue = [];
    s.grow = 0;
    putApple(s, 3, 8);
    const ev = step(s);
    spawned = ev.find((e) => e.type === 'spawn' && e.kind === 'bonus') ?? spawned;
    void h;
  }
  assert.ok(spawned, 'бонус появился');
  const bonus = s.foods.find((f) => f.kind === 'bonus');
  assert.ok(bonus.ttl >= BONUS_TTL - 1, 'таймер уже пошёл в этом шаге');
  // съесть бонус сразу
  const b = xy(s, bonus.idx);
  s.snake = [idx(s, b.x - 1 >= 0 ? b.x - 1 : b.x + 1, b.y)];
  s.snake.push(s.snake[0]);
  s.dir = b.x - 1 >= 0 ? 'R' : 'L';
  s.grow = 0;
  const len = s.snake.length;
  const ev = step(s);
  const eat = ev.find((e) => e.kind === 'bonus');
  assert.ok(eat.points > 20 * 2);
  assert.equal(s.snake.length, len, 'не растёт');

  // не съел — исчезает
  const t = classic();
  t.started = true;
  t.foods.push({ kind: 'bonus', idx: idx(t, 0, 0), ttl: 2 });
  step(t);
  const ev2 = step(t);
  assert.ok(ev2.some((e) => e.type === 'expire'));
  assert.ok(!t.foods.some((f) => f.kind === 'bonus'));
});

test('щит прощает удар: змейка стоит пару шагов, можно повернуть', () => {
  const s = classic();
  s.started = true;
  s.effects.shield = 1;
  s.snake = [idx(s, 12, 8), idx(s, 11, 8), idx(s, 10, 8)];
  s.dir = 'R';
  const ev = step(s);
  assert.ok(ev.some((e) => e.type === 'shield'));
  assert.equal(s.dead, false);
  assert.equal(s.freeze, SHIELD_FREEZE);
  turn(s, 'U');
  for (let k = 0; k < SHIELD_FREEZE; k++) step(s);
  step(s);
  assert.equal(s.dead, false);
  assert.deepEqual(head(s), { x: 12, y: 7 });
  // второй удар уже без щита
  s.snake = [idx(s, 12, 0), idx(s, 12, 1)];
  s.dir = 'U';
  step(s);
  assert.equal(s.dead, true);
});

test('замедление, ×2 очки, магнит', () => {
  const s = classic();
  s.started = true;
  const base = tickMs(s);
  s.effects.slow = 5;
  assert.equal(tickMs(s), Math.round(base * 1.6));
  s.effects.double = 5;
  const h = head(s);
  putApple(s, h.x + 1, h.y);
  const ev = step(s);
  assert.equal(ev.find((e) => e.type === 'eat').points, 10 * SPEEDS.snake.mult * 2);

  const m = classic();
  m.started = true;
  m.effects.magnet = POWER_TIME.magnet;
  m.snake = [idx(m, 3, 8), idx(m, 2, 8), idx(m, 1, 8)];
  m.dir = 'D';
  m.steps = 0;
  putApple(m, 8, 8);
  const before = xy(m, m.foods.find((f) => f.kind === 'apple').idx);
  for (let k = 0; k < 4; k++) step(m);
  const after = xy(m, m.foods.find((f) => f.kind === 'apple').idx);
  assert.ok(after.x < before.x, 'яблоко притягивается к голове');
});

// ---------- режимы классики ----------

test('«Стены»: каждое яблоко ставит кирпич, в кирпич врезаются', () => {
  const s = classic({ modes: ['walls'] });
  s.started = true;
  const h = head(s);
  putApple(s, h.x + 1, h.y);
  const ev = step(s);
  const brick = ev.find((e) => e.type === 'brick');
  assert.ok(brick);
  assert.equal(s.cells[brick.idx], 2);
  const b = xy(s, brick.idx);
  const dist = Math.abs(b.x - head(s).x) + Math.abs(b.y - head(s).y);
  assert.ok(dist > 3, 'кирпич не перед носом');
});

test('«Порталы»: яблоки парами, съел одно — голова у второго', () => {
  const s = classic({ modes: ['portal'] });
  s.started = true;
  const apples = s.foods.filter((f) => f.kind === 'apple');
  assert.equal(apples.length, 2);
  const h = head(s);
  apples[0].idx = idx(s, h.x + 1, h.y);
  const target = apples[1].idx;
  const ev = step(s);
  assert.ok(ev.some((e) => e.type === 'teleport' && e.to === target));
  assert.equal(s.snake[0], target);
  assert.equal(s.foods.filter((f) => f.kind === 'apple').length, 2, 'новая пара');
});

test('«Летающая еда»: летит плавно (доли клетки за шаг), отскакивает от краёв и стен, не вылетает за поле', () => {
  const s = classic({ modes: ['winged'] });
  s.started = true;
  const apple = s.foods.find((f) => f.kind === 'apple');
  assert.ok(apple.fx != null && apple.vx != null, 'у летающей — дробные координаты и скорость');
  s.snake = [idx(s, 0, 16), idx(s, 0, 15)];      // змейку убираем в угол, чтобы не мешала
  s.dir = 'D';
  s.freeze = 1e9;                                // стоит на месте (как после щита), а еда летает
  let bounces = 0;
  let prevVx = apple.vx;
  let prevVy = apple.vy;
  for (let k = 0; k < 600; k++) {
    const before = { x: apple.fx, y: apple.fy };
    step(s);
    const moved = Math.hypot(apple.fx - before.x, apple.fy - before.y);
    assert.ok(moved <= 0.3, 'за шаг — меньше трети клетки: плавно, без телепортов');
    assert.ok(apple.fx + 0.5 - FRUIT_R >= -1e-9 && apple.fx + 0.5 + FRUIT_R <= s.cols + 1e-9, 'не вылетает по x');
    assert.ok(apple.fy + 0.5 - FRUIT_R >= -1e-9 && apple.fy + 0.5 + FRUIT_R <= s.rows + 1e-9, 'не вылетает по y');
    if (apple.vx !== prevVx || apple.vy !== prevVy) bounces++;
    prevVx = apple.vx;
    prevVy = apple.vy;
  }
  assert.ok(bounces >= 4, `отскоков: ${bounces}`);

  // от стен (кирпичей) тоже отскакивает
  const w = classic({ modes: ['winged'] });
  w.started = true;
  w.snake = [idx(w, 0, 16), idx(w, 0, 15)];
  w.dir = 'D';
  w.freeze = 1e9;
  const f = w.foods.find((o) => o.kind === 'apple');
  Object.assign(f, { fx: 4, fy: 8, vx: 0.2, vy: 0 });
  w.cells[idx(w, 6, 8)] = 2;
  for (let k = 0; k < 30; k++) {
    step(w);
    assert.ok(f.fx + 0.5 + FRUIT_R <= 6 + 1e-9, 'в кирпич не влетает');
  }
  assert.ok(f.vx < 0, 'развернулась');
});

test('хитбокс летающей еды: съедается, когда фрукт касается головы, и не раньше', () => {
  const at = (dx, dy) => {
    const s = classic({ modes: ['winged'] });
    s.started = true;
    s.snake = [idx(s, 6, 8), idx(s, 5, 8), idx(s, 4, 8)];
    s.dir = 'R';
    s.foods = [{ kind: 'apple', fruit: 'apple', idx: idx(s, 7, 8), fx: 7 + dx, fy: 8 + dy, vx: 0, vy: 0 }];
    return step(s).some((e) => e.type === 'eat');
  };
  assert.equal(at(0, 0), true, 'ровно в клетке');
  assert.equal(at(0.5, 0.3), true, 'касается');
  assert.equal(at(-0.4, -0.5), true, 'касается сбоку');
  assert.equal(at(0.85, 0), false, 'на следующей клетке — ещё нет');
  assert.equal(at(0, 0.85), false, 'ниже — ещё нет');
  // фрукт сам влетает в голову, пока змейка стоит
  const s = classic({ modes: ['winged'] });
  s.started = true;
  s.snake = [idx(s, 6, 8), idx(s, 5, 8)];
  s.dir = 'R';
  s.foods = [{ kind: 'apple', fruit: 'pear', idx: idx(s, 9, 8), fx: 9, fy: 8, vx: -0.2, vy: 0 }];
  let eaten = false;
  for (let k = 0; k < 20 && !eaten; k++) {
    s.freeze = 1;
    eaten = step(s).some((e) => e.type === 'eat');
  }
  assert.ok(eaten, 'влетевший в голову фрукт съеден');
});

test('фрукты разные, бургер — ×2 очки и +2 длины', () => {
  const rng = seeded(3);
  const seen = new Set();
  for (let k = 0; k < 300; k++) {
    const s = newGame({ mode: 'classic', speed: 'snake', size: 'medium' }, rng);
    seen.add(s.foods.find((f) => f.kind === 'apple').fruit);
  }
  for (const fruit of [...FRUITS, 'burger']) assert.ok(seen.has(fruit), `нет ${fruit}`);
  const s = classic();
  s.started = true;
  const h = head(s);
  s.foods = [{ kind: 'apple', fruit: 'burger', idx: idx(s, h.x + 1, h.y) }];
  const ev = step(s);
  assert.equal(ev.find((e) => e.type === 'eat').points, 10 * SPEEDS.snake.mult * 2);
  step(s);
  step(s);
  assert.equal(s.snake.length, START_LEN + 2);
});

test('«Яд» укорачивает', () => {
  const p = classic({ modes: ['poison'] });
  p.started = true;
  assert.ok(p.foods.some((f) => f.kind === 'poison'));
  p.snake = [idx(p, 6, 8), idx(p, 5, 8), idx(p, 4, 8), idx(p, 3, 8), idx(p, 2, 8), idx(p, 1, 8)];
  p.dir = 'R';
  p.score = 100;
  p.foods = p.foods.filter((f) => f.kind !== 'poison');
  p.foods.push({ kind: 'poison', idx: idx(p, 7, 8), ttl: 50 });
  const ev = step(p);
  assert.ok(ev.some((e) => e.type === 'poison'));
  assert.equal(p.snake.length, 3);
  assert.equal(p.score, 80);
  assert.ok(p.foods.some((f) => f.kind === 'poison'), 'гриб появился снова');
});

test('«Инь-ян»: близнец ходит зеркально, его смерть — конец игры', () => {
  const s = classic({ modes: ['twin'] });
  s.started = true;
  assert.ok(s.twin);
  const h = head(s);
  const t0 = xy(s, s.twin.snake[0]);
  assert.equal(t0.x, s.cols - 1 - h.x, 'стоит зеркально');
  assert.equal(s.dir, 'U', 'старт вертикальный — не навстречу');
  turn(s, 'L');
  step(s);
  const t1 = xy(s, s.twin.snake[0]);
  assert.equal(t1.x, t0.x + 1, 'я влево — близнец вправо');
  // гоним влево до стены: близнец врежется в правую стену одновременно
  let ev = [];
  let guard = 0;
  while (!s.dead && guard++ < 30) ev = step(s);
  assert.ok(s.dead);
  assert.match(ev.find((e) => e.type === 'die').reason, /wall/);
});

test('«Инь-ян»: сталкиваются только по-настоящему; еда не в центральном столбце', () => {
  const mid = (SIZES.medium.cols - 1) / 2;
  const make = (main, twin, dir) => {
    const s = classic({ modes: ['twin'] });
    s.started = true;
    s.foods = [];
    s.snake = main.map(([x, y]) => idx(s, x, y));
    s.twin.snake = twin.map(([x, y]) => idx(s, x, y));
    s.dir = dir;
    s.twin.dir = dir === 'L' ? 'R' : dir === 'R' ? 'L' : dir;
    return s;
  };
  // голова встаёт туда, откуда как раз уходит хвост близнеца — не столкновение
  const a = make([[mid - 1, 7], [mid - 1, 8]], [[mid, 5], [mid, 6], [mid - 1, 6]], 'U');
  step(a);
  assert.equal(a.dead, false, 'хвост близнеца ушёл — прошли, не касаясь');
  // лоб в лоб в центральную клетку — столкновение
  const b = make([[mid - 1, 8], [mid - 2, 8]], [[mid + 1, 8], [mid + 2, 8]], 'R');
  step(b);
  assert.equal(b.dead, true, 'обе в одну клетку');
  // головы меняются местами — проходят сквозь друг друга: столкновение
  const c = make([[mid, 8], [mid - 1, 8]], [[mid + 1, 8], [mid + 2, 8]], 'R');
  step(c);
  assert.equal(c.dead, true, 'сквозь друг друга нельзя');
  // в тело близнеца (не хвост) — столкновение
  const d = make([[mid - 1, 7], [mid - 1, 8]], [[mid, 5], [mid - 1, 6], [mid - 1, 5], [mid - 2, 5]], 'U');
  step(d);
  assert.equal(d.dead, true, 'в тело — столкновение');
  // еда никогда не появляется в центральном столбце
  const rng = seeded(11);
  for (let k = 0; k < 200; k++) {
    const s = newGame({ mode: 'classic', speed: 'snake', size: 'medium', modes: ['twin', 'poison'] }, rng);
    for (const f of s.foods) assert.notEqual(xy(s, f.idx).x, mid, 'еда посередине — недоступна зеркальным змейкам');
  }
});

test('все режимы разом («Блендер») 3000 случайных шагов не ломают состояние', () => {
  const rng = seeded(7);
  for (let game = 0; game < 30; game++) {
    const size = Object.keys(SIZES)[game % 3];
    const s = newGame({ mode: 'classic', speed: 'rabbit', size, modes: MODES }, rng);
    s.started = true;
    for (let k = 0; k < 400 && !s.dead && !s.won; k++) {
      if (rng() < 0.3) turn(s, 'UDLR'[Math.floor(rng() * 4)]);
      step(s, rng);
      assert.ok(isValidState(JSON.parse(JSON.stringify(s))), `партия ${game}, шаг ${k}`);
      const all = [...s.snake, ...(s.twin?.snake ?? [])];
      for (const c of all) assert.notEqual(s.cells[c], 1, 'змейка не в стене');
      for (const f of s.foods) assert.ok(!s.snake.includes(f.idx) || s.dead, 'еда не под змейкой');
    }
  }
});

// ---------- уровни ----------

function neighbours(m, i) {
  const x = i % m.cols;
  const y = Math.floor(i / m.cols);
  const out = [];
  for (const d of Object.values(DIRS)) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) continue;
    out.push(ny * m.cols + nx);
  }
  return out;
}

test('карты уровней: размер, связность (с порталами), без тупиков, старт, порталы парами, пути патрулей', () => {
  for (let level = 1; level <= MAP_COUNT; level++) {
    const m = levelMap(level);
    assert.equal(m.raw.length, LEVEL_ROWS, `${level}: строк`);
    for (const row of m.raw) assert.equal(row.length, LEVEL_COLS, `${level}: «${row}»`);
    const wall = new Set(m.walls);
    const free = [];
    for (let i = 0; i < m.cols * m.rows; i++) if (!wall.has(i)) free.push(i);

    // связность (порталы — связи)
    const seen = new Set([free[0]]);
    const queue = [free[0]];
    while (queue.length) {
      const c = queue.shift();
      const next = neighbours(m, c).filter((n) => !wall.has(n));
      for (const p of m.portals) if (p.a === c) next.push(p.b); else if (p.b === c) next.push(p.a);
      for (const n of next) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    assert.equal(seen.size, free.length, `уровень ${level} «${m.title}»: есть отрезанные клетки`);

    // без тупиков
    for (const c of free) {
      const deg = neighbours(m, c).filter((n) => !wall.has(n)).length;
      assert.ok(deg >= 2, `уровень ${level}: тупик в ${c % m.cols},${Math.floor(c / m.cols)}`);
    }

    // старт: тело на свободных клетках, впереди ≥ 3 свободных
    assert.ok(m.start, `уровень ${level}: нет старта`);
    const s = newGame({ mode: 'levels', speed: 'snake', level, map: m }, seeded(level));
    assert.equal(s.snake.length, START_LEN);
    for (const c of s.snake) assert.equal(s.cells[c], 0, `уровень ${level}: тело в стене`);
    const d = DIRS[m.start.dir];
    for (let k = 1; k <= 3; k++) {
      const x = m.start.x + d.dx * k;
      const y = m.start.y + d.dy * k;
      assert.ok(x >= 0 && y >= 0 && x < m.cols && y < m.rows, `уровень ${level}: старт у стены`);
      const c = y * m.cols + x;
      assert.ok(!wall.has(c) && !m.spikes.some((sp) => sp.idx === c), `уровень ${level}: перед стартом препятствие`);
    }
    for (const p of m.portals) assert.ok(p.a != null && p.b != null && p.a !== p.b, `уровень ${level}: портал ${p.id} без пары`);
    for (const mv of m.movers) for (const c of mv.path) assert.ok(!wall.has(c), `уровень ${level}: патруль сквозь стену`);
    assert.ok(isValidState(s));
  }
});

test('после 12-го уровня карты по кругу: цель больше, темп быстрее', () => {
  assert.equal(cycleOf(12), 1);
  assert.equal(cycleOf(13), 2);
  const a = levelMap(1);
  const b = levelMap(1 + MAP_COUNT);
  assert.equal(b.goal, a.goal + 4);
  assert.ok(b.pace > a.pace);
  assert.deepEqual(b.raw, a.raw);
});

test('порталы уровня переносят голову; шипы убивают только поднятыми; патруль ждёт змейку', () => {
  const s = newGame({ mode: 'levels', speed: 'snake', level: 4, map: levelMap(4) }, seeded(1));
  s.started = true;
  const p = s.portals[0];
  const pa = xy(s, p.a);
  s.snake = [idx(s, pa.x - 1, pa.y), idx(s, pa.x - 2, pa.y)];
  s.dir = 'R';
  s.foods = [];
  const ev = step(s);
  assert.equal(s.snake[0], p.b);
  assert.ok(ev.some((e) => e.type === 'teleport'));

  const sp = { idx: 0, period: 10, on: 4, offset: 0 };
  assert.equal(spikeUp(sp, 0), true);
  assert.equal(spikeUp(sp, 4), false);
  const t = newGame({ mode: 'levels', speed: 'snake', level: 7, map: levelMap(7) }, seeded(1));
  t.started = true;
  const spike = t.spikes[0];
  const sx = xy(t, spike.idx);
  t.snake = [idx(t, sx.x, sx.y - 1), idx(t, sx.x, sx.y - 2)];
  t.dir = 'D';
  t.foods = [];
  t.steps = spike.period - spike.offset;           // шипы подняты
  step(t);
  assert.equal(t.dead, true, 'в поднятые шипы');
  const u = newGame({ mode: 'levels', speed: 'snake', level: 7, map: levelMap(7) }, seeded(1));
  u.started = true;
  u.snake = [idx(u, sx.x, sx.y - 1), idx(u, sx.x, sx.y - 2)];
  u.dir = 'D';
  u.foods = [];
  u.steps = spike.on + 1 - spike.offset + spike.period;     // опущены
  step(u);
  assert.equal(u.dead, false, 'по опущенным можно');

  // патруль не наезжает на змейку — ждёт, пока клетка освободится
  const w = newGame({ mode: 'levels', speed: 'snake', level: 5, map: levelMap(5) }, seeded(1));
  w.started = true;
  w.foods = [];
  const mv = w.movers[0];
  const blockedCell = mv.path[mv.pos + 1];
  const bc = xy(w, blockedCell);
  w.snake = [idx(w, bc.x, bc.y + 2), idx(w, bc.x, bc.y + 1), blockedCell];      // хвост на пути патруля
  w.dir = 'D';
  w.grow = 5;                                      // хвост не уходит
  w.steps = mv.every - 1;                          // на этом шаге патруль должен двинуться
  step(w);
  assert.equal(mv.pos, 0, 'патруль ждёт');
  assert.equal(w.dead, false);
});

// ---------- автопилот: уровни проходимы ----------

/**
 * Автопилот (как «безопасный» бот змейки): мысленно проходит кратчайший путь к еде и идёт туда, только если
 * после еды голова может добраться до собственного хвоста (значит, не запрёт себя). Иначе ползёт за хвостом,
 * а если и хвоста не видно — туда, где больше места. Шипы и патрули считаются опасными с запасом.
 */
const waited = new WeakMap();        // сколько шагов автопилот ходит за хвостом, не рискуя за едой

function autopilot(s) {
  const opposite = { U: 'D', D: 'U', L: 'R', R: 'L' };
  const move = (c, d) => {
    const x = c % s.cols;
    const y = Math.floor(c / s.cols);
    const nx = x + DIRS[d].dx;
    const ny = y + DIRS[d].dy;
    if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) return -1;
    let to = ny * s.cols + nx;
    const p = s.portals.find((pt) => pt.a === to || pt.b === to);
    if (p) to = p.a === to ? p.b : p.a;
    return to;
  };
  const hazard = (c, t) => s.cells[c] !== 0
    || s.spikes.some((sp) => sp.idx === c && (spikeUp(sp, s.steps + t) || spikeUp(sp, s.steps + t + 1)))
    || s.movers.some((m) => m.path.includes(c) && Math.abs(m.path.indexOf(c) - m.pos) <= 2);

  /** Кратчайший путь от головы тела body до любой клетки из targets, в обход тела (хвост уходит). */
  function path(body, targets, firstDirBan) {
    const blocked = new Set(body.slice(0, -1));
    const from = body[0];
    const prev = new Map([[from, null]]);
    const q = [[from, 0]];
    while (q.length) {
      const [c, t] = q.shift();
      for (const d of 'UDLR') {
        if (c === from && d === firstDirBan) continue;
        const to = move(c, d);
        if (to < 0 || prev.has(to) || blocked.has(to) || hazard(to, t)) continue;
        prev.set(to, [c, d]);
        if (targets.has(to)) {
          const steps = [];
          for (let k = to; prev.get(k); k = prev.get(k)[0]) steps.unshift(k);
          return steps;
        }
        q.push([to, t + 1]);
      }
    }
    return null;
  }

  const firstDir = (cell) => 'UDLR'.split('').find((d) => move(s.snake[0], d) === cell);
  const ban = opposite[s.dir];
  const food = new Set(s.foods.filter((f) => f.kind === 'apple').map((f) => f.idx));

  // 1. к еде — если после неё можно дотянуться до хвоста (или если слишком долго осторожничали)
  const toFood = path(s.snake, food, ban);
  const memo = waited.get(s) ?? { eaten: s.eaten, steps: 0 };
  if (memo.eaten !== s.eaten) Object.assign(memo, { eaten: s.eaten, steps: 0 });
  memo.steps++;
  waited.set(s, memo);
  if (toFood && memo.steps > 60) return firstDir(toFood[0]);
  if (toFood) {
    let body = s.snake.slice();
    toFood.forEach((cell, i) => {
      body = [cell, ...body];
      if (i < toFood.length - 1) body.pop();          // на последней клетке съели — растём
    });
    const tail = body[body.length - 1];
    if (path(body, new Set([tail]), null)) return firstDir(toFood[0]);
  }
  // 2. за хвостом
  const tail = s.snake[s.snake.length - 1];
  const toTail = path(s.snake, new Set([tail]), ban);
  if (toTail && toTail.length > 1) return firstDir(toTail[0]);
  // 3. туда, где больше места
  const blocked = new Set(s.snake.slice(0, -1));
  const space = (start) => {
    const seen = new Set([start]);
    const qq = [start];
    while (qq.length) {
      const c = qq.shift();
      for (const d of 'UDLR') {
        const to = move(c, d);
        if (to >= 0 && !seen.has(to) && !blocked.has(to) && !hazard(to, 0)) { seen.add(to); qq.push(to); }
      }
    }
    return seen.size;
  };
  let best = null;
  let bestSpace = -1;
  for (const d of 'UDLR') {
    if (d === ban) continue;
    const to = move(s.snake[0], d);
    if (to < 0 || blocked.has(to) || hazard(to, 0)) continue;
    const sp = space(to);
    if (sp > bestSpace) { bestSpace = sp; best = d; }
  }
  return best ?? s.dir;
}

test('автопилот проходит уровни: каждый — хотя бы 4 из 8 попыток, все вместе — не меньше 85%', () => {
  // Проходимость карт доказывает тест на связность и отсутствие тупиков; автопилот проверяет, что уровни
  // не «убийственные». Бот не идеален: на «Перегородках» он иногда сам заползает в угол узкой полосы.
  let total = 0;
  let wins = 0;
  for (let level = 1; level <= MAP_COUNT; level++) {
    let levelWins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const rng = seeded(level * 100 + seed);
      const s = newGame({ mode: 'levels', speed: 'snake', level, map: levelMap(level) }, rng);
      s.started = true;
      for (let k = 0; k < 4000 && !s.dead && !s.won; k++) {
        const d = autopilot(s);
        if (d !== s.dir) turn(s, d);
        step(s, rng);
      }
      total++;
      if (s.won) levelWins++;
    }
    wins += levelWins;
    assert.ok(levelWins >= 4, `уровень ${level} «${levelMap(level).title}»: автопилот прошёл ${levelWins} из 8`);
  }
  assert.ok(wins / total >= 0.85, `всего ${wins} из ${total}`);
});

// ---------- сохранение и статистика ----------

test('сохранение и статистика', () => {
  const s = classic({ modes: ['walls', 'twin'] });
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, v: 2 }), false);
  assert.equal(isValidState({ ...s, cells: [] }), false);
  assert.equal(bestKey(s), 'snake:medium:twin+walls');
  let st = emptyStats();
  assert.ok(isValidStats(st));
  s.score = 120;
  s.eaten = 6;
  st = recordRun(st, s);
  assert.equal(st.best['snake:medium:twin+walls'], 120);
  assert.equal(st.apples, 6);
  const lv = newGame({ mode: 'levels', speed: 'snake', level: 3, map: levelMap(3) });
  lv.won = true;
  st = recordRun(st, lv);
  assert.equal(st.levelsCleared, 1);
  assert.equal(st.bestLevel, 3);
});
