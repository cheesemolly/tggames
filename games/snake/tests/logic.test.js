import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newGame, turn, step, tickMs, idx, xy, spikeUp, moverCell, isValidState, emptyStats, isValidStats, recordRun, bestKey,
  DIRS, SPEEDS, SIZES, MODES, QUEUE_MAX, BONUS_EVERY, BONUS_TTL, SHIELD_FREEZE, START_LEN, POWER_TIME,
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

test('«Летающая еда» двигается, «Яд» укорачивает', () => {
  const s = classic({ modes: ['winged'] });
  s.started = true;
  const apple = s.foods.find((f) => f.kind === 'apple');
  assert.ok(apple.wing);
  const cells = new Set();
  for (let k = 0; k < 12; k++) {
    step(s);
    if (s.dead) break;
    cells.add(s.foods.find((f) => f.kind === 'apple')?.idx);
  }
  assert.ok(cells.size > 1, 'яблоко летает');

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

/** Простой автопилот: кратчайший путь к яблоку по безопасным клеткам, иначе — туда, где больше места. */
function autopilot(s) {
  const n = s.cols * s.rows;
  const body = new Set(s.snake.slice(0, -1));
  const danger = (c, t) => s.cells[c] !== 0 || body.has(c)
    || s.spikes.some((sp) => sp.idx === c && (spikeUp(sp, s.steps + t) || spikeUp(sp, s.steps + t + 1)))
    || s.movers.some((m) => m.path.includes(c) && Math.abs(m.path.indexOf(c) - m.pos) <= 2);
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
  const apples = new Set(s.foods.filter((f) => f.kind === 'apple').map((f) => f.idx));
  const opposite = { U: 'D', D: 'U', L: 'R', R: 'L' };
  const from = s.snake[0];
  const prev = new Map([[from, null]]);
  const firstDir = new Map();
  const q = [[from, 0]];
  let goal = null;
  while (q.length && goal == null) {
    const [c, t] = q.shift();
    for (const d of 'UDLR') {
      if (c === from && d === opposite[s.dir]) continue;
      const to = move(c, d);
      if (to < 0 || prev.has(to) || danger(to, t)) continue;
      prev.set(to, c);
      firstDir.set(to, c === from ? d : firstDir.get(c));
      if (apples.has(to)) { goal = to; break; }
      q.push([to, t + 1]);
    }
  }
  const space = (start) => {
    const seen = new Set([start]);
    const qq = [start];
    while (qq.length && seen.size < n) {
      const c = qq.shift();
      for (const d of 'UDLR') {
        const to = move(c, d);
        if (to >= 0 && !seen.has(to) && !danger(to, 0)) { seen.add(to); qq.push(to); }
      }
    }
    return seen.size;
  };
  if (goal != null) {
    const d = firstDir.get(goal);
    if (space(move(from, d)) > s.snake.length) return d;
  }
  let best = null;
  let bestSpace = -1;
  for (const d of 'UDLR') {
    if (d === opposite[s.dir]) continue;
    const to = move(from, d);
    if (to < 0 || danger(to, 0)) continue;
    const sp = space(to);
    if (sp > bestSpace) { bestSpace = sp; best = d; }
  }
  return best ?? s.dir;
}

test('автопилот проходит каждый уровень (хотя бы 6 из 8 попыток) — уровни проходимы', () => {
  for (let level = 1; level <= MAP_COUNT; level++) {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const rng = seeded(level * 100 + seed);
      const s = newGame({ mode: 'levels', speed: 'snake', level, map: levelMap(level) }, rng);
      s.started = true;
      for (let k = 0; k < 4000 && !s.dead && !s.won; k++) {
        const d = autopilot(s);
        if (d !== s.dir) turn(s, d);
        step(s, rng);
      }
      if (s.won) wins++;
    }
    assert.ok(wins >= 6, `уровень ${level} «${levelMap(level).title}»: автопилот прошёл ${wins} из 8`);
  }
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
