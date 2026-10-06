// Арканоид — чистая логика (без DOM): поле, платформа, шарики, кирпичи и бонусы. Случайность — параметром rng.
//
// Поле — W × H единиц; кирпич — 32 × 18. Кирпичи стоят свободно (не по сетке), бывают повёрнутые и
// треугольные, поэтому каждый — выпуклый многоугольник; сталкиваются с шариком как «круг с многоугольником».
// Чтобы не перебирать все кирпичи, поле разбито на клетки CELL × CELL: шарик смотрит только кирпичи своих клеток.
//
// Виды кирпичей: n — обычный (1 удар), h — на три удара, p — с бонусом, e — взрывной (сносит соседей, цепочкой),
// x — неразрушаемый (для победы не нужен; ломается взрывом, огнём, рельсой, ракетой и после WEAR ударов — чтобы
// шарик не мог застрять навсегда), t — запертый шарик (задел — он падает, поймал платформой — он твой).
// Уровень пройден, когда не осталось кирпичей n, h, p, e. Если HELP_AFTER секунд ничего не разбито, сверху падает
// сильный бонус (огонь, рельса, ракеты, ×8) — последние кирпичи за стенкой не превращаются в мучение.

import { ALPHABET, CODES, LEVELS } from './levels.js';

export const W = 616;
export const H = 720;
export const BRICK_W = 32;
export const BRICK_H = 18;
export const LEVEL_COUNT = LEVELS.length;
export const CHAPTER_SIZE = 30;                    // уровней в главе
export const CHAPTERS = Math.ceil(LEVEL_COUNT / CHAPTER_SIZE);
export const TONES = 6;                            // оттенков обычного кирпича в главе
export const PADDLE_Y = 672;                       // верх платформы
export const PADDLE_H = 14;
export const PADDLE_WIDTHS = [58, 88, 122, 158];   // размеры платформы; обычный — 1
export const BALL_R = 7;
export const SMALL_R = 4.5;
export const BALL_SPEED = 460;                     // единиц в секунду
export const SPEED_K = [0.72, 1, 1.35];            // медленно / обычно / быстро
export const MAX_BALLS = 60;
export const LIVES = 3;
export const MAX_LIVES = 5;
export const WEAR = 10;                            // ударов до разрушения «неразрушаемого» кирпича
export const BLAST_R = 40;                         // взрыв кирпича: соседи со всех сторон
export const MISSILE_R = 50;
export const FIRE_R = 34;                          // огненный шар: кирпич и соседи вплотную
export const DROP_R = 21;                          // радиус падающего бонуса
export const DROP_SPEED = 150;
export const MAX_ANGLE = 1.08;                     // отскок от края платформы — 62° от вертикали

// 15 бонусов: шарик — split3, split8, fast, slow, fire, rail, small, normal; платформа — catch, laser, missile,
// expand, shrink; прочее — bomb (ловить нельзя), life.
export const BONUSES = ['split3', 'split8', 'fast', 'slow', 'fire', 'rail', 'small', 'normal', 'catch', 'laser',
  'missile', 'expand', 'shrink', 'bomb', 'life'];
/** Как часто выпадает каждый бонус из кирпича без заданного бонуса. */
export const BONUS_WEIGHTS = {
  split3: 14, split8: 5, fast: 7, slow: 9, fire: 6, rail: 4, small: 6, normal: 5, catch: 9, laser: 9, missile: 4,
  expand: 10, shrink: 7, bomb: 6, life: 3,
};
export const BAD_BONUSES = ['fast', 'small', 'shrink', 'bomb'];
export const FIRE_TIME = 12;
export const RAIL_TIME = 7;
export const CATCH_TIME = 20;
export const LASER_TIME = 10;
export const MISSILES = 6;
export const HELP_AFTER = 20;                      // столько секунд ничего не разбито — сверху падает сильный бонус
export const HELP_BONUSES = ['fire', 'rail', 'missile', 'split8'];

const BREAKABLE = { n: true, h: true, p: true, e: true };
const HP = { n: 1, h: 3, p: 1, e: 1, x: WEAR, t: 1 };
const CELL = 40;
const GRID_W = Math.ceil(W / CELL);
const GRID_H = Math.ceil(H / CELL);
const BLAST_DELAY = 0.07;                          // взрывы идут цепочкой, а не все разом
const MIN_DY = 0.2;                                // шарик не летает почти горизонтально
const LOOSE_SPEED = 190;
const TRAPPED_R = 9;

const SHAPES = {
  R: [[0, 0], [32, 0], [32, 18], [0, 18]],
  a: [[32, 0], [32, 18], [0, 18]],                 // срезан левый верхний угол
  b: [[0, 0], [32, 18], [0, 18]],                  // правый верхний
  c: [[0, 0], [32, 0], [32, 18]],                  // левый нижний
  d: [[0, 0], [32, 0], [0, 18]],                   // правый нижний
  U: [[0, 18], [16, 0], [32, 18]],
  D: [[0, 0], [32, 0], [16, 18]],
  C: Array.from({ length: 12 }, (_, k) => [16 + TRAPPED_R * Math.cos((k / 6) * Math.PI), 9 + TRAPPED_R * Math.sin((k / 6) * Math.PI)]),
};

// ---------- уровни ----------

const d36 = (s) => parseInt(s, 36);

/** Раскладка уровня n (с 1): { chapter, bricks: [{ kind, tone, shape, bonus, x, y, rot, scale }] }. */
export function parseLevel(n) {
  const src = LEVELS[n - 1];
  if (typeof src !== 'string') throw new RangeError(`нет уровня ${n}`);
  const [main, extra = ''] = src.slice(1).split('|');
  const bricks = [];
  const add = (x, y, c, rot = 0, scale = 100) => {
    const code = CODES[ALPHABET.indexOf(c)];
    if (!code) throw new Error(`уровень ${n}: неизвестный кирпич «${c}»`);
    bricks.push({ kind: code[0], tone: Number(code[1]), shape: code[2], bonus: code.slice(3) || null, x, y, rot, scale: scale / 100 });
  };
  for (const row of main.split(' ')) {
    if (!row) continue;
    const y = d36(row.slice(0, 2));
    for (let i = 2; i < row.length; i += 3) add(d36(row.slice(i, i + 2)), y, row[i + 2]);
  }
  for (const t of extra.split(' ')) {
    if (t) add(d36(t.slice(0, 2)), d36(t.slice(2, 4)), t[4], d36(t.slice(5, 7)), d36(t.slice(7, 9)));
  }
  return { chapter: d36(src[0]), bricks };
}

/** Контур кирпича: форма в рамке 32 × 18 с левым верхним углом (x, y), размер и поворот — вокруг центра. */
export function polygon(shape, x, y, rot = 0, scale = 1) {
  const a = (rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return SHAPES[shape].map(([px, py]) => {
    const dx = (px - BRICK_W / 2) * scale;
    const dy = (py - BRICK_H / 2) * scale;
    return [x + BRICK_W / 2 + dx * cos - dy * sin, y + BRICK_H / 2 + dx * sin + dy * cos];
  });
}

/**
 * Ближайшая к точке (px, py) точка контура выпуклого многоугольника.
 * → out: { x, y, d2 — квадрат расстояния, inside — точка внутри многоугольника }.
 */
export function closestPoint(pts, px, py, out = {}) {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  let sign = 0;
  let inside = true;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[i + 1 === n ? 0 : i + 1];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const wx = px - p[0];
    const wy = py - p[1];
    const cross = ex * wy - ey * wx;
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) inside = false;
    }
    let t = (wx * ex + wy * ey) / (ex * ex + ey * ey);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = p[0] + ex * t;
    const cy = p[1] + ey * t;
    const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d < best) {
      best = d;
      bx = cx;
      by = cy;
    }
  }
  out.x = bx;
  out.y = by;
  out.d2 = best;
  out.inside = inside;
  return out;
}

function makeBrick(src, id) {
  const pts = polygon(src.shape, src.x, src.y, src.rot, src.scale);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = src.x + BRICK_W / 2;
  const cy = src.y + BRICK_H / 2;
  const rad = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  return { id, kind: src.kind, tone: src.tone, shape: src.shape, bonus: src.bonus, x: src.x, y: src.y, rot: src.rot,
    scale: src.scale, pts, cx, cy, rad, minX, maxX, minY, maxY, hp: HP[src.kind], max: HP[src.kind], seen: 0 };
}

function buildGrid(bricks) {
  const grid = Array.from({ length: GRID_W * GRID_H }, () => []);
  for (const b of bricks) {
    const x0 = Math.max(0, Math.floor(b.minX / CELL));
    const x1 = Math.min(GRID_W - 1, Math.floor(b.maxX / CELL));
    const y0 = Math.max(0, Math.floor(b.minY / CELL));
    const y1 = Math.min(GRID_H - 1, Math.floor(b.maxY / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * GRID_W + x].push(b);
  }
  return grid;
}

const paddleWidth = (g) => PADDLE_WIDTHS[g.paddle.size];
export const paddleW = paddleWidth;
export const ballRadius = (g) => (g.fx.small ? SMALL_R : BALL_R);
export const ballSpeed = (g) => BALL_SPEED * SPEED_K[g.fx.speed + 1];
const freshFx = () => ({ fire: 0, rail: 0, catch: 0, laser: 0, missile: 0, speed: 0, small: false, cool: 0 });

function stuckBall(g) {
  const off = paddleWidth(g) * 0.12;
  return { x: g.paddle.x + off, y: PADDLE_Y - ballRadius(g), dx: 0, dy: -1, stuck: off, idle: 0 };
}

/** Новая партия на уровне n: три шарика в запасе, первый лежит на платформе и ждёт запуска. */
export const newGame = (n) => gameFrom(parseLevel(n), n);

/** Партия по готовой раскладке { chapter, bricks } — так генератор уровней и тесты проверяют уровень до записи. */
export function gameFrom(src, n = 1) {
  const bricks = src.bricks.map(makeBrick);
  const g = {
    level: n, chapter: src.chapter, lives: LIVES, status: 'ready', time: 0,
    bricks, grid: buildGrid(bricks),
    total: bricks.filter((b) => BREAKABLE[b.kind]).length, left: 0, broken: 0,
    paddle: { x: W / 2, size: 1 },
    balls: [], drops: [], shots: [], loose: [], blasts: [],
    fx: freshFx(), events: [], nextId: 1, stamp: 0, dry: 0,
  };
  g.left = g.total;
  g.balls.push(stuckBall(g));
  return g;
}

/** Доля разбитого (0…1). */
export const progress = (g) => (g.total ? 1 - g.left / g.total : 1);

// ---------- сохранение ----------

/** Что сохраняется: уровень, запас шариков и прочность каждого кирпича (шарик после возврата снова на платформе). */
export function snapshot(g) {
  return { v: 1, level: g.level, lives: Math.max(1, g.lives), hp: g.bricks.map((b) => b.hp), time: Math.round(g.time) };
}

const counts = new Map();
function levelShape(n) {
  if (!counts.has(n)) counts.set(n, parseLevel(n).bricks.map((b) => b.kind));
  return counts.get(n);
}

export function isValidState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return false;
  if (!Number.isInteger(s.level) || s.level < 1 || s.level > LEVEL_COUNT) return false;
  if (!Number.isInteger(s.lives) || s.lives < 1 || s.lives > MAX_LIVES) return false;
  if (!Number.isFinite(s.time) || s.time < 0) return false;
  const kinds = levelShape(s.level);
  if (!Array.isArray(s.hp) || s.hp.length !== kinds.length) return false;
  let left = 0;
  for (let i = 0; i < kinds.length; i++) {
    const hp = s.hp[i];
    if (!Number.isInteger(hp) || hp < 0 || hp > HP[kinds[i]]) return false;
    if (hp > 0 && BREAKABLE[kinds[i]]) left++;
  }
  return left > 0;
}

/** Номер уровня из сохранения, которое не прошло проверку (раскладки менялись) — партия начнётся на нём заново. */
export const savedLevel = (s) => (Number.isInteger(s?.level) && s.level >= 1 && s.level <= LEVEL_COUNT ? s.level : null);

export function restore(s) {
  const g = newGame(s.level);
  g.lives = s.lives;
  g.time = s.time;
  g.bricks.forEach((b, i) => {
    b.hp = s.hp[i];
  });
  g.left = g.bricks.filter((b) => b.hp > 0 && BREAKABLE[b.kind]).length;
  g.broken = g.total - g.left;
  return g;
}

export const emptyStats = () => ({ cleared: 0, bestLevel: 0, bricks: 0, bonuses: 0, fails: 0 });
export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object'
    && ['cleared', 'bestLevel', 'bricks', 'bonuses', 'fails'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}

// ---------- платформа ----------

export function movePaddle(g, x) {
  const half = paddleWidth(g) / 2;
  g.paddle.x = Math.max(half, Math.min(W - half, x));
  const r = ballRadius(g);
  for (const b of g.balls) {
    if (b.stuck === null) continue;
    b.stuck = Math.max(-half, Math.min(half, b.stuck));
    b.x = Math.max(r, Math.min(W - r, g.paddle.x + b.stuck));
    b.y = PADDLE_Y - r;
  }
}

/** Направление отскока от платформы: чем дальше от середины, тем положе. */
function paddleDir(g, ball) {
  const k = Math.max(-1, Math.min(1, (ball.x - g.paddle.x) / (paddleWidth(g) / 2)));
  const a = k * MAX_ANGLE;
  ball.dx = Math.sin(a);
  ball.dy = -Math.cos(a);
}

/** Запустить шарики, лежащие на платформе. → запущен ли хоть один. */
export function launch(g) {
  if (g.status !== 'ready' && g.status !== 'play') return false;
  let any = false;
  for (const b of g.balls) {
    if (b.stuck === null) continue;
    paddleDir(g, b);
    b.stuck = null;
    b.idle = 0;
    any = true;
  }
  if (any) {
    g.status = 'play';
    g.events.push({ type: 'launch' });
  }
  return any;
}

// ---------- кирпичи ----------

function pickBonus(rng) {
  let total = 0;
  for (const id of BONUSES) total += BONUS_WEIGHTS[id];
  let roll = rng() * total;
  for (const id of BONUSES) {
    roll -= BONUS_WEIGHTS[id];
    if (roll < 0) return id;
  }
  return BONUSES[0];
}

function destroy(g, b, rng) {
  if (b.hp <= 0) return;
  b.hp = 0;
  if (BREAKABLE[b.kind]) {
    g.left -= 1;
    g.dry = 0;
  }
  g.broken += 1;
  g.events.push({ type: 'break', id: b.id, kind: b.kind, tone: b.tone, x: b.cx, y: b.cy });
  if (b.kind === 'e') g.blasts.push({ x: b.cx, y: b.cy, t: BLAST_DELAY });
  else if (b.kind === 'p') g.drops.push({ id: g.nextId++, type: b.bonus ?? pickBonus(rng), x: b.cx, y: b.cy });
  else if (b.kind === 't') {
    g.loose.push({ id: g.nextId++, x: b.cx, y: b.cy });
    g.events.push({ type: 'free', x: b.cx, y: b.cy });
  }
}

/** Удар по кирпичу: n — сколько прочности снять (Infinity — снести). */
function hurt(g, b, n, rng) {
  if (b.hp <= 0) return;
  if (b.hp - n > 0) {
    b.hp -= n;
    g.events.push({ type: 'hit', id: b.id, kind: b.kind, x: b.cx, y: b.cy });
    return;
  }
  destroy(g, b, rng);
}

/** Взрыв: сносит всё, чей центр в радиусе; взрывные кирпичи взрываются следом. */
function blast(g, x, y, radius, rng) {
  g.events.push({ type: 'explode', x, y, r: radius });
  for (const b of g.bricks) {
    if (b.hp <= 0) continue;
    const dx = b.cx - x;
    const dy = b.cy - y;
    if (dx * dx + dy * dy <= radius * radius) destroy(g, b, rng);
  }
}

const near = { x: 0, y: 0, d2: 0, inside: false };

/** Кирпич, которого касается круг (ближайший), или null; точка касания остаётся в near. */
function touching(g, x, y, r) {
  const stamp = ++g.stamp;
  const x0 = Math.max(0, Math.floor((x - r) / CELL));
  const x1 = Math.min(GRID_W - 1, Math.floor((x + r) / CELL));
  const y0 = Math.max(0, Math.floor((y - r) / CELL));
  const y1 = Math.min(GRID_H - 1, Math.floor((y + r) / CELL));
  let hit = null;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  let inside = false;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = g.grid[cy * GRID_W + cx];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.hp <= 0 || b.seen === stamp) continue;
        b.seen = stamp;
        if (x + r < b.minX || x - r > b.maxX || y + r < b.minY || y - r > b.maxY) continue;
        closestPoint(b.pts, x, y, near);
        const d = near.inside ? -near.d2 : near.d2;
        if ((near.inside || near.d2 < r * r) && d < best) {
          best = d;
          hit = b;
          bx = near.x;
          by = near.y;
          inside = near.inside;
        }
      }
    }
  }
  near.x = bx;
  near.y = by;
  near.inside = inside;
  near.d2 = Math.abs(best);
  return hit;
}

// ---------- бонусы ----------

function fixDir(ball) {
  const len = Math.hypot(ball.dx, ball.dy) || 1;
  ball.dx /= len;
  ball.dy /= len;
  if (Math.abs(ball.dy) < MIN_DY) {
    ball.dy = (ball.dy > 0 ? 1 : -1) * MIN_DY;
    ball.dx = (ball.dx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_DY * MIN_DY);
  }
}

function turn(ball, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = ball.dx * cos - ball.dy * sin;
  ball.dy = ball.dx * sin + ball.dy * cos;
  ball.dx = dx;
  fixDir(ball);
}

/** Каждый шарик делится на n: 3 — веером, 8 — во все стороны. Больше MAX_BALLS шариков не бывает. */
function split(g, n) {
  for (const src of g.balls.slice()) {
    const base = src.stuck === null ? Math.atan2(src.dy, src.dx) : -Math.PI / 2;
    for (let k = 1; k < n; k++) {
      if (g.balls.length >= MAX_BALLS) return;
      const a = n === 3 ? base + (k === 1 ? -0.42 : 0.42) : base + (k / n) * Math.PI * 2;
      const ball = { x: src.x, y: src.y, dx: Math.cos(a), dy: Math.sin(a), stuck: null, idle: 0 };
      fixDir(ball);
      g.balls.push(ball);
    }
  }
}

function die(g) {
  g.lives -= 1;
  g.balls = [];
  g.drops = [];
  g.shots = [];
  g.loose = [];
  g.fx = freshFx();
  g.dry = 0;
  g.paddle.size = 1;
  movePaddle(g, g.paddle.x);
  g.events.push({ type: 'die', lives: g.lives });
  if (g.lives <= 0) {
    g.status = 'lost';
    g.events.push({ type: 'lose' });
    return;
  }
  g.status = 'ready';
  g.balls.push(stuckBall(g));
}

/** Применить бонус (пойман платформой). */
export function applyBonus(g, type) {
  const fx = g.fx;
  g.events.push({ type: 'bonus', bonus: type });
  if (type === 'split3') split(g, 3);
  else if (type === 'split8') split(g, 8);
  else if (type === 'fast') fx.speed = Math.min(1, fx.speed + 1);
  else if (type === 'slow') fx.speed = Math.max(-1, fx.speed - 1);
  else if (type === 'fire') {
    fx.fire = FIRE_TIME;
    fx.rail = 0;
  } else if (type === 'rail') {
    fx.rail = RAIL_TIME;
    fx.fire = 0;
  } else if (type === 'small') fx.small = true;
  else if (type === 'normal') {
    fx.fire = 0;
    fx.rail = 0;
    fx.small = false;
    fx.speed = 0;
  } else if (type === 'catch') fx.catch = CATCH_TIME;
  else if (type === 'laser') {
    fx.laser = LASER_TIME;
    fx.missile = 0;
    fx.cool = Math.min(fx.cool, 0.15);
  } else if (type === 'missile') {
    fx.missile = MISSILES;
    fx.laser = 0;
    fx.cool = Math.min(fx.cool, 0.25);
  } else if (type === 'expand') g.paddle.size = Math.min(PADDLE_WIDTHS.length - 1, g.paddle.size + 1);
  else if (type === 'shrink') g.paddle.size = Math.max(0, g.paddle.size - 1);
  else if (type === 'life') g.lives = Math.min(MAX_LIVES, g.lives + 1);
  else if (type === 'bomb') {
    die(g);
    return;
  }
  movePaddle(g, g.paddle.x);              // размер платформы и шарика мог смениться
}

const overPaddle = (g, x, y, r) => Math.abs(x - g.paddle.x) <= paddleWidth(g) / 2 + r * 0.8
  && y + r >= PADDLE_Y && y - r <= PADDLE_Y + PADDLE_H;

// ---------- шаг ----------

function moveBall(g, ball, dist, rng) {
  const r = ballRadius(g);
  const fire = g.fx.fire > 0;
  const rail = g.fx.rail > 0;
  const steps = Math.max(1, Math.ceil(dist / (r * 0.45)));
  const d = dist / steps;
  for (let s = 0; s < steps; s++) {
    ball.x += ball.dx * d;
    ball.y += ball.dy * d;
    // стены
    let wall = false;
    if (ball.x < r) {
      ball.x = r;
      ball.dx = Math.abs(ball.dx);
      wall = true;
    } else if (ball.x > W - r) {
      ball.x = W - r;
      ball.dx = -Math.abs(ball.dx);
      wall = true;
    }
    if (ball.y < r) {
      ball.y = r;
      ball.dy = Math.abs(ball.dy);
      wall = true;
    }
    if (wall) {
      // шарик давно ничего не задевал — стена слегка меняет угол, чтобы он не ходил по кругу
      if (ball.idle > 8) {
        turn(ball, (rng() - 0.5) * 0.5);
        ball.idle = 4;
      }
      g.events.push({ type: 'wall', x: ball.x, y: ball.y });
    }
    // низ: шарик потерян
    if (ball.y - r > H) return false;
    // платформа
    if (ball.dy > 0 && ball.y <= PADDLE_Y + PADDLE_H / 2 && overPaddle(g, ball.x, ball.y, r)) {
      ball.y = PADDLE_Y - r;
      ball.idle = 0;
      if (g.fx.catch > 0) {
        ball.stuck = ball.x - g.paddle.x;
        g.events.push({ type: 'catch' });
        return true;
      }
      paddleDir(g, ball);
      g.events.push({ type: 'paddle', x: ball.x });
      continue;
    }
    // бомбу можно сбить шариком
    for (let i = g.drops.length - 1; i >= 0; i--) {
      const p = g.drops[i];
      if (p.type !== 'bomb' || Math.hypot(p.x - ball.x, p.y - ball.y) > DROP_R + r) continue;
      g.drops.splice(i, 1);
      g.events.push({ type: 'defuse', x: p.x, y: p.y });
    }
    // кирпичи
    const b = touching(g, ball.x, ball.y, r);
    if (!b) continue;
    if (rail) {
      destroy(g, b, rng);                // рельса проходит насквозь
      ball.idle = 0;
      continue;
    }
    let nx = ball.x - near.x;
    let ny = ball.y - near.y;
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) {
      nx = -ball.dx;
      ny = -ball.dy;
    } else {
      nx /= len;
      ny /= len;
    }
    if (near.inside) {
      nx = -nx;
      ny = -ny;
    }
    ball.x = near.x + nx * r;
    ball.y = near.y + ny * r;
    const dot = ball.dx * nx + ball.dy * ny;
    if (dot < 0) {
      ball.dx -= 2 * dot * nx;
      ball.dy -= 2 * dot * ny;
    }
    // от неразрушаемого шарик отлетает чуть неровно — иначе может зациклиться между двумя стенками
    if (b.kind === 'x') turn(ball, (rng() - 0.5) * (ball.idle > 8 ? 0.5 : 0.06));
    else fixDir(ball);
    if (BREAKABLE[b.kind] || b.kind === 't') ball.idle = 0;
    if (fire) {
      const cx = b.cx;
      const cy = b.cy;
      destroy(g, b, rng);
      g.events.push({ type: 'burn', x: cx, y: cy });
      for (const o of g.bricks) {
        if (o.hp > 0 && (o.cx - cx) * (o.cx - cx) + (o.cy - cy) * (o.cy - cy) <= FIRE_R * FIRE_R) destroy(g, o, rng);
      }
    } else hurt(g, b, 1, rng);
  }
  return true;
}

function moveShots(g, dt, rng) {
  for (let i = g.shots.length - 1; i >= 0; i--) {
    const s = g.shots[i];
    const dist = s.speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 8));
    let gone = false;
    for (let k = 0; k < steps && !gone; k++) {
      s.y -= dist / steps;
      if (s.y < 0) {
        gone = true;
        break;
      }
      const b = touching(g, s.x, s.y, 3);
      if (!b) continue;
      gone = true;
      if (s.kind === 'missile') blast(g, s.x, s.y, MISSILE_R, rng);
      else if (b.kind === 'x' || b.kind === 'e') g.events.push({ type: 'spark', x: s.x, y: s.y });   // лазер их не берёт
      else hurt(g, b, 1, rng);
    }
    if (gone) g.shots.splice(i, 1);
  }
}

/**
 * Шаг игры на dt секунд. События для звука и анимаций копятся в g.events (их забирает и очищает тот, кто рисует).
 * status: ready — шарик на платформе ждёт launch(); play; won; lost.
 */
export function step(g, dt, rng = Math.random) {
  if (g.status === 'won' || g.status === 'lost') return;
  g.time += dt;
  const fx = g.fx;

  // отложенные взрывы
  for (let i = g.blasts.length - 1; i >= 0; i--) {
    const e = g.blasts[i];
    e.t -= dt;
    if (e.t > 0) continue;
    g.blasts.splice(i, 1);
    blast(g, e.x, e.y, BLAST_R, rng);
  }

  if (g.status === 'play') {
    // давно ничего не разбито (последние кирпичи за стенкой) — сверху падает сильный бонус, чтобы уровень не затягивался
    g.dry += dt;
    if (g.dry >= HELP_AFTER) {
      g.dry = 0;
      const type = HELP_BONUSES[Math.floor(rng() * HELP_BONUSES.length)];
      g.drops.push({ id: g.nextId++, type, x: 60 + rng() * (W - 120), y: -DROP_R });
      g.events.push({ type: 'help', bonus: type });
    }
    for (const key of ['fire', 'rail', 'catch', 'laser']) {
      if (fx[key] <= 0) continue;
      fx[key] = Math.max(0, fx[key] - dt);
      if (fx[key] === 0) g.events.push({ type: 'expire', bonus: key });
    }
    // пушки стреляют сами
    if (fx.laser > 0 || fx.missile > 0) {
      fx.cool -= dt;
      if (fx.cool <= 0) {
        if (fx.laser > 0) {
          const off = paddleWidth(g) / 2 - 8;
          g.shots.push({ id: g.nextId++, kind: 'laser', x: g.paddle.x - off, y: PADDLE_Y - 2, speed: 900 });
          g.shots.push({ id: g.nextId++, kind: 'laser', x: g.paddle.x + off, y: PADDLE_Y - 2, speed: 900 });
          fx.cool = 0.3;
          g.events.push({ type: 'shot', kind: 'laser' });
        } else {
          g.shots.push({ id: g.nextId++, kind: 'missile', x: g.paddle.x, y: PADDLE_Y - 4, speed: 520 });
          fx.missile -= 1;
          fx.cool = 0.75;
          g.events.push({ type: 'shot', kind: 'missile' });
          if (fx.missile === 0) g.events.push({ type: 'expire', bonus: 'missile' });
        }
      }
    }
  }
  moveShots(g, dt, rng);

  // падающие бонусы
  for (let i = g.drops.length - 1; i >= 0; i--) {
    const p = g.drops[i];
    p.y += DROP_SPEED * dt;
    if (overPaddle(g, p.x, p.y, DROP_R)) {
      g.drops.splice(i, 1);
      applyBonus(g, p.type);
      if (p.type === 'bomb') return;            // платформа взорвана: шарик потерян, дальше — заново
    } else if (p.y - DROP_R > H) g.drops.splice(i, 1);
  }

  // освобождённые шарики падают; пойманный платформой — твой
  for (let i = g.loose.length - 1; i >= 0; i--) {
    const p = g.loose[i];
    p.y += LOOSE_SPEED * dt;
    if (overPaddle(g, p.x, p.y, BALL_R)) {
      g.loose.splice(i, 1);
      if (g.balls.length < MAX_BALLS) {
        const ball = { x: p.x, y: PADDLE_Y - ballRadius(g), dx: 0, dy: -1, stuck: null, idle: 0 };
        paddleDir(g, ball);
        g.balls.push(ball);
        g.events.push({ type: 'gain' });
      }
    } else if (p.y - BALL_R > H) g.loose.splice(i, 1);
  }

  // шарики
  const dist = ballSpeed(g) * dt;
  for (let i = g.balls.length - 1; i >= 0; i--) {
    const ball = g.balls[i];
    if (ball.stuck !== null) continue;
    ball.idle += dt;
    if (!moveBall(g, ball, dist, rng)) {
      g.balls.splice(i, 1);
      g.events.push({ type: 'lost', x: ball.x });
    }
    if (g.left === 0) break;
  }

  if (g.left === 0) {
    g.status = 'won';
    g.events.push({ type: 'win' });
  } else if (!g.balls.length) die(g);
}

// ---------- бот (для проверок) ----------

/**
 * Куда вести платформу: под ближайший падающий шарик так, чтобы отбить его в сторону оставшихся кирпичей;
 * шариков нет в полёте — под полезный бонус. Бомбы обходит.
 */
export function botTarget(g) {
  let soon = Infinity;
  let ball = null;
  for (const b of g.balls) {
    if (b.stuck !== null || b.dy <= 0) continue;
    const t = (PADDLE_Y - b.y) / b.dy;
    if (t >= 0 && t < soon) {
      soon = t;
      ball = b;
    }
  }
  const half = paddleWidth(g) / 2;
  let x = g.paddle.x;
  if (ball) {
    // где шарик пересечёт линию платформы (с отражениями от боковых стен)
    const r = ballRadius(g);
    let hit = ball.x + ball.dx * soon;
    const span = W - 2 * r;
    hit = ((hit - r) % (2 * span) + 2 * span) % (2 * span);
    hit = r + (hit > span ? 2 * span - hit : hit);
    // целимся в самый нижний из оставшихся кирпичей
    let aim = null;
    for (const b of g.bricks) if (b.hp > 0 && BREAKABLE[b.kind] && (!aim || b.cy > aim.cy)) aim = b;
    let k = 0;
    if (aim) k = Math.max(-0.85, Math.min(0.85, Math.atan2(aim.cx - hit, PADDLE_Y - aim.cy) / MAX_ANGLE));
    x = hit - k * half;
  } else {
    const good = g.drops.filter((p) => p.type !== 'bomb' && !BAD_BONUSES.includes(p.type)).sort((a, b) => b.y - a.y)[0];
    const free = g.loose.slice().sort((a, b) => b.y - a.y)[0];
    if (free) x = free.x;
    else if (good) x = good.x;
  }
  // от бомбы — в сторону
  for (const p of g.drops) {
    if (p.type !== 'bomb' || p.y < PADDLE_Y - 220) continue;
    if (Math.abs(p.x - x) < half + DROP_R + 6) x = p.x + (x >= p.x ? 1 : -1) * (half + DROP_R + 8);
  }
  return Math.max(half, Math.min(W - half, x));
}
