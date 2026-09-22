// Brick Blast (по видео владельца «Brick Blast: Ball Breaker»): шарики вылетают снизу по прицелу, отскакивают
// от стен и блоков; удар снимает у блока 1 прочности. После хода уровень сдвигается на ряд вниз; блок дошёл до
// нижнего ряда — проигрыш; разбиты все блоки — уровень пройден. Без DOM, тестируется в Node.
//
// Координаты — в клетках: поле COLS×ROWS, x вправо, y вниз, шарики стартуют с нижнего края (y = ROWS).
// Блок: { id, r, c, shape, hp, max }; shape — 'sq' или прямоугольный треугольник, названный по углу с прямым
// углом: 'tl' | 'tr' | 'bl' | 'br'. r < 0 — ряд уровня ещё выше экрана (невидим и неосязаем).
// Бонус (кольцо, шарики пролетают сквозь): 'laserH' | 'laserV' | 'laserX' — удар по всем блокам ряда/столбца,
// 'triple' — следующий бросок ×3 шарика (исчезает), 'scatter' — шарик отлетает в случайную сторону.
// Лазеры не входят в картинку уровня: они появляются в случайных пустых клетках, где в их ряду/столбце есть
// блоки, и живут LASER_LIFE секунд полёта шариков (время идёт только во время хода — прицел их не «съедает»).

export const COLS = 8;
export const ROWS = 12;                 // ряд ROWS-1 — нижний: блок в нём — проигрыш
export const BALL_R = 0.13;
export const SPEED = 16;                // клеток в секунду
export const LAUNCH_GAP = 0.055;        // с между шариками
export const POWER_R = 0.3;
export const START_ROW = 4;             // где стоит нижний ряд уровня в начале
export const STATE_VERSION = 1;
export const SHAPES = ['sq', 'tl', 'tr', 'bl', 'br'];
export const POWERS = ['laserH', 'laserV', 'laserX', 'triple', 'scatter'];
export const MIN_ANGLE = (8 * Math.PI) / 180;       // угол от горизонта: 8°…172°
export const LASER_LIFE = 15;           // с полёта — столько живёт лазер
export const LASER_EVERY = 12;          // с полёта между появлениями лазеров (подобрано ботом, см. CLAUDE.md)
export const LASER_MAX = 1;             // одновременно на поле
export const LASERS = ['laserH', 'laserV', 'laserX'];

// ---------- геометрия ----------

/** Вершины фигуры блока (по часовой в экранных координатах). */
export function polygon(shape, r, c) {
  const tl = [c, r];
  const tr = [c + 1, r];
  const br = [c + 1, r + 1];
  const bl = [c, r + 1];
  switch (shape) {
    case 'tl': return [tl, tr, bl];
    case 'tr': return [tl, tr, br];
    case 'br': return [tr, br, bl];
    case 'bl': return [tl, br, bl];
    default: return [tl, tr, br, bl];
  }
}

/** Столкновение круга (cx, cy, rad) с выпуклым многоугольником: { nx, ny, px, py } — нормаль наружу и точка, или null. */
export function circlePolygon(cx, cy, rad, poly) {
  let best = Infinity;
  let qx = 0;
  let qy = 0;
  let inside = true;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k];
    const [bx, by] = poly[(k + 1) % poly.length];
    const ex = bx - ax;
    const ey = by - ay;
    // многоугольник по часовой (y вниз) — внутренность справа от ребра: cross < 0 — снаружи
    if (ex * (cy - ay) - ey * (cx - ax) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((cx - ax) * ex + (cy - ay) * ey) / (ex * ex + ey * ey)));
    const px = ax + ex * t;
    const py = ay + ey * t;
    const d = Math.hypot(cx - px, cy - py);
    if (d < best) {
      best = d;
      qx = px;
      qy = py;
    }
  }
  if (!inside && best >= rad) return null;
  let nx;
  let ny;
  if (best < 1e-9) {
    // центр ровно на границе — нормаль ребра
    nx = 0;
    ny = -1;
  } else if (inside) {
    nx = (qx - cx) / best;
    ny = (qy - cy) / best;
  } else {
    nx = (cx - qx) / best;
    ny = (cy - qy) / best;
  }
  return { nx, ny, px: qx, py: qy };
}

// ---------- уровень ----------

/** Сколько шариков на уровне (в видео: 1-й — 60, 6-й — 70). */
export const ballsFor = (level) => Math.min(150, 58 + level * 2);

/** Сколько рядов в уровне. */
export const rowsFor = (level) => Math.min(30, 11 + level);

/** Прочность блока: растёт с уровнем и к верху уровня (дальние ряды крепче), кратно 10 (у мелких — любое). */
export function hpFor(level, k, rows, rng) {
  const lo = 8 + level * 2;
  const hi = 55 + level * 6;
  const v = (lo + (hi - lo) * (k / Math.max(1, rows - 1))) * (0.8 + rng() * 0.35);
  return v >= 20 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
}

function smoothMask(mask, rows, half, iterations = 2) {
  let m = mask;
  for (let it = 0; it < iterations; it++) {
    const next = m.map((row) => row.slice());
    for (let k = 0; k < rows; k++) {
      for (let c = 0; c < half; c++) {
        let n = 0;
        for (let dk = -1; dk <= 1; dk++) for (let dc = -1; dc <= 1; dc++) {
          if (!dk && !dc) continue;
          const kk = k + dk;
          const cc = c + dc;
          if (kk >= 0 && kk < rows && cc >= 0 && cc < half && m[kk][cc]) n++;
        }
        next[k][c] = n >= 5 ? 1 : n <= 2 ? 0 : m[k][c];
      }
    }
    m = next;
  }
  return m;
}

/**
 * Уровень: картинка из блоков шириной COLS (часто зеркальная), с треугольниками на «углах» фигур и бонусами
 * в пустых клетках. Возвращает { rows, cells: [{ k, c, shape, hp }], powers: [{ k, c, kind }] }, k — ряд от низа.
 */
export function generateLevel(level, rng = Math.random) {
  for (;;) {
    const lv = tryLevel(level, rng);
    // не меньше 40% клеток занято — иначе уровень «пустой» и проходится за ход
    if (lv.cells.length >= lv.rows * COLS * 0.4) return lv;
  }
}

function tryLevel(level, rng) {
  const rows = rowsFor(level);
  const mirror = rng() < 0.7;
  const width = mirror ? COLS / 2 : COLS;
  const density = 0.5 + rng() * 0.15;
  let mask = Array.from({ length: rows }, () => Array.from({ length: width }, () => (rng() < density ? 1 : 0)));
  mask = smoothMask(mask, rows, width);
  // пустые полосы — «воздух» между фигурами
  for (let k = 2; k < rows; k += 4 + Math.floor(rng() * 3)) if (rng() < 0.5) mask[k].fill(0);
  const full = mask.map((row) => (mirror ? [...row, ...row.slice().reverse()] : row));
  const filled = (k, c) => k >= 0 && k < rows && c >= 0 && c < COLS && full[k][c] === 1;

  const cells = [];
  for (let k = 0; k < rows; k++) {
    for (let c = 0; c < COLS; c++) {
      if (!filled(k, c)) continue;
      // k растёт вверх: сосед «сверху» — k + 1
      const up = filled(k + 1, c);
      const down = filled(k - 1, c);
      const left = filled(k, c - 1);
      const right = filled(k, c + 1);
      let shape = 'sq';
      // уголок фигуры → треугольник, скошенный в сторону пустоты
      if (rng() < 0.55) {
        if (!up && !left && (down || right)) shape = 'br';
        else if (!up && !right && (down || left)) shape = 'bl';
        else if (!down && !left && (up || right)) shape = 'tr';
        else if (!down && !right && (up || left)) shape = 'tl';
      }
      cells.push({ k, c, shape, hp: hpFor(level, k, rows, rng) });
    }
  }
  if (mirror) {
    // зеркальной половине — зеркальные треугольники и та же прочность
    const flip = { tl: 'tr', tr: 'tl', bl: 'br', br: 'bl', sq: 'sq' };
    const left = new Map(cells.filter((x) => x.c < COLS / 2).map((x) => [`${x.k}:${x.c}`, x]));
    for (const x of cells) {
      if (x.c < COLS / 2) continue;
      const twin = left.get(`${x.k}:${COLS - 1 - x.c}`);
      if (twin) {
        x.shape = flip[twin.shape];
        x.hp = twin.hp;
      }
    }
  }
  // бонусы — в пустых клетках рядом с блоками
  const powers = [];
  const empties = [];
  for (let k = 1; k < rows; k++) for (let c = 0; c < COLS; c++) {
    if (!filled(k, c) && (filled(k, c - 1) || filled(k, c + 1) || filled(k + 1, c) || filled(k - 1, c))) empties.push([k, c]);
  }
  const count = Math.min(empties.length, 1 + Math.floor(rows / 8));
  const pool = level < 2 ? ['triple'] : ['triple', 'scatter'];
  for (let n = 0; n < count; n++) {
    const j = Math.floor(rng() * empties.length);
    const [k, c] = empties.splice(j, 1)[0];
    if (powers.some((p) => Math.abs(p.k - k) + Math.abs(p.c - c) < 2)) continue;
    powers.push({ k, c, kind: pool[Math.floor(rng() * pool.length)] });
  }
  if (!cells.length) cells.push({ k: 0, c: 3, shape: 'sq', hp: 10 }, { k: 0, c: 4, shape: 'sq', hp: 10 });
  return { rows, cells, powers };
}

/** Начальное состояние уровня. */
export function newLevel(level, rng = Math.random) {
  const pattern = generateLevel(level, rng);
  let id = 1;
  const blocks = pattern.cells.map((x) => ({ id: id++, r: START_ROW - x.k, c: x.c, shape: x.shape, hp: x.hp, max: x.hp }));
  const powers = pattern.powers.map((p) => ({ id: id++, r: START_ROW - p.k, c: p.c, kind: p.kind }));
  const total = blocks.reduce((s, b) => s + b.hp, 0);
  return {
    v: STATE_VERSION, level, balls: ballsFor(level), x: COLS / 2, turn: 0, triple: false,
    blocks, powers, total, dealt: 0, pattern, nextId: id, clock: 0, nextLaser: 0,
  };
}

export const progress = (state) => (state.total ? state.dealt / state.total : 1);

// ---------- ход ----------

const clampAngle = (a) => Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));

/** Угол прицела (от горизонта, 0 — вправо, π/2 — вверх) по точке (tx, ty) и точке запуска. */
export function aimAngle(x, tx, ty) {
  return clampAngle(Math.atan2(ROWS - ty, tx - x));
}

/** Бросок: сколько шариков, откуда и куда. Состояние хода (sim) меняется step(); state — уровень. */
export function startTurn(state, angle) {
  const a = clampAngle(angle);
  const count = state.triple ? state.balls * 3 : state.balls;
  return {
    angle: a, count, launched: 0, t: 0, nextLaunch: 0, balls: [], firstX: null, done: false, cleared: false,
    tripled: state.triple, caughtTriple: false, x0: state.x, events: [],
  };
}

function reflect(ball, nx, ny) {
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
}

/** Не даём шарику лететь почти горизонтально — иначе ход не кончится. */
function fixSteep(ball) {
  const min = SPEED * 0.12;
  if (Math.abs(ball.vy) < min) {
    ball.vy = ball.vy < 0 ? -min : min;
    const k = SPEED / Math.hypot(ball.vx, ball.vy);
    ball.vx *= k;
    ball.vy *= k;
  }
}

/** Пустая видимая клетка, чей ряд/столбец не пуст; лазер ставится туда, где он полезнее. */
export function spawnLaser(state, rng = Math.random) {
  const busy = new Set([...state.blocks, ...state.powers].map((x) => `${x.r}:${x.c}`));
  const rowCount = new Map();
  const colCount = new Map();
  for (const b of state.blocks) {
    if (b.r < 0) continue;
    rowCount.set(b.r, (rowCount.get(b.r) ?? 0) + 1);
    colCount.set(b.c, (colCount.get(b.c) ?? 0) + 1);
  }
  const options = [];
  for (let r = 0; r < ROWS - 3; r++) for (let c = 0; c < COLS; c++) {
    if (busy.has(`${r}:${c}`)) continue;
    const h = rowCount.get(r) ?? 0;
    const v = colCount.get(c) ?? 0;
    if (Math.max(h, v) < 2) continue;
    options.push({ r, c, h, v, w: Math.max(h, v) });
  }
  if (!options.length) return null;
  // случайно, но полезные клетки — чаще
  let t = rng() * options.reduce((a, o) => a + o.w, 0);
  const o = options.find((x) => (t -= x.w) <= 0) ?? options[options.length - 1];
  const kind = o.h >= 2 && o.v >= 2 && rng() < 0.25 ? 'laserX' : o.h >= o.v ? 'laserH' : 'laserV';
  const power = { id: state.nextId++, r: o.r, c: o.c, kind, born: state.clock };
  state.powers.push(power);
  return power;
}

/** Время полёта: старые лазеры гаснут, новые появляются. */
function tickLasers(state, sim, dt, rng) {
  state.clock += dt;
  const before = state.powers.length;
  state.powers = state.powers.filter((p) => {
    if (!LASERS.includes(p.kind) || state.clock - p.born < LASER_LIFE) return true;
    sim.events.push({ type: 'expire', id: p.id, r: p.r, c: p.c, kind: p.kind });
    return false;
  });
  if (state.powers.length !== before) sim.grid = null;
  if (state.clock >= state.nextLaser) {
    state.nextLaser = state.clock + LASER_EVERY;
    if (state.powers.filter((p) => LASERS.includes(p.kind)).length < LASER_MAX) {
      const p = spawnLaser(state, rng);
      if (p) sim.events.push({ type: 'spawn', id: p.id });
    }
  }
}

/** Сетка клеток → блок с готовым контуром (чтобы шарик проверял только 9 клеток вокруг себя). */
function buildGrid(state) {
  const grid = new Array(COLS * ROWS).fill(null);
  for (const b of state.blocks) {
    if (b.r < 0 || b.r >= ROWS) continue;
    grid[b.r * COLS + b.c] = { b, poly: polygon(b.shape, b.r, b.c) };
  }
  return grid;
}

function damage(state, sim, block, amount = 1) {
  if (block.hp <= 0) return;
  const dealt = Math.min(amount, block.hp);
  block.hp -= dealt;
  state.dealt += dealt;
  sim.events.push({ type: 'hit', id: block.id });
  if (block.hp <= 0) {
    sim.events.push({ type: 'break', id: block.id, r: block.r, c: block.c, max: block.max, shape: block.shape });
    state.blocks = state.blocks.filter((b) => b !== block);
    if (!state.blocks.length) sim.cleared = true;
  }
}

function triggerPower(state, sim, ball, power, rng) {
  const inRow = (b) => b.r === power.r && b.r >= 0;
  const inCol = (b) => b.c === power.c && b.r >= 0;
  if (power.kind === 'laserH' || power.kind === 'laserX') {
    sim.events.push({ type: 'laser', axis: 'h', r: power.r, c: power.c });
    for (const b of state.blocks.filter(inRow)) damage(state, sim, b);
  }
  if (power.kind === 'laserV' || power.kind === 'laserX') {
    sim.events.push({ type: 'laser', axis: 'v', r: power.r, c: power.c });
    for (const b of state.blocks.filter(inCol)) damage(state, sim, b);
  }
  if (power.kind === 'triple') {
    state.triple = true;
    sim.caughtTriple = true;
    state.powers = state.powers.filter((p) => p !== power);
    sim.events.push({ type: 'triple', id: power.id });
  }
  if (power.kind === 'scatter') {
    const a = -Math.PI * (0.1 + rng() * 0.8) * (rng() < 0.8 ? 1 : -1);
    ball.vx = Math.cos(a) * SPEED;
    ball.vy = Math.sin(a) * SPEED;
    fixSteep(ball);
    sim.events.push({ type: 'scatter', id: power.id });
  }
}

/** Сдвинуть шарик на h секунд с отскоками. */
function moveBall(state, sim, ball, h, rng) {
  ball.x += ball.vx * h;
  ball.y += ball.vy * h;
  // стены и потолок
  if (ball.x < BALL_R) { ball.x = BALL_R; if (ball.vx < 0) { ball.vx = -ball.vx; fixSteep(ball); } }
  if (ball.x > COLS - BALL_R) { ball.x = COLS - BALL_R; if (ball.vx > 0) { ball.vx = -ball.vx; fixSteep(ball); } }
  if (ball.y < BALL_R) { ball.y = BALL_R; if (ball.vy < 0) ball.vy = -ball.vy; }
  // пол: шарик вернулся
  if (ball.y >= ROWS - BALL_R && ball.vy > 0) {
    ball.active = false;
    ball.y = ROWS - BALL_R;
    if (sim.firstX === null) sim.firstX = Math.max(BALL_R * 2, Math.min(COLS - BALL_R * 2, ball.x));
    return;
  }
  // блоки в 9 клетках вокруг шарика — берём самое глубокое касание
  const r0 = Math.floor(ball.y);
  const c0 = Math.floor(ball.x);
  const grid = sim.grid;
  let hit = null;
  let hitBlock = null;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      const cellItem = grid[r * COLS + c];
      if (!cellItem || cellItem.b.hp <= 0) continue;
      const res = circlePolygon(ball.x, ball.y, BALL_R, cellItem.poly);
      if (!res) continue;
      const depth = BALL_R - Math.hypot(ball.x - res.px, ball.y - res.py);
      if (!hit || depth > hit.depth) {
        hit = { ...res, depth };
        hitBlock = cellItem.b;
      }
    }
  }
  if (hit) {
    ball.x = hit.px + hit.nx * BALL_R;
    ball.y = hit.py + hit.ny * BALL_R;
    if (ball.vx * hit.nx + ball.vy * hit.ny < 0) {
      reflect(ball, hit.nx, hit.ny);
      fixSteep(ball);
      damage(state, sim, hitBlock);
    }
  }
  // бонусы
  for (const p of state.powers) {
    if (p.r < 0) continue;
    const inside = Math.hypot(ball.x - (p.c + 0.5), ball.y - (p.r + 0.5)) < POWER_R + BALL_R;
    const key = p.id;
    if (inside && !ball.inPower.has(key)) {
      ball.inPower.add(key);
      triggerPower(state, sim, ball, p, rng);
    } else if (!inside) ball.inPower.delete(key);
  }
}

/** Продвинуть ход на dt секунд. */
export function step(state, sim, dt, rng = Math.random) {
  if (sim.done) return;
  sim.t += dt;
  while (sim.launched < sim.count && sim.nextLaunch <= sim.t) {
    const age = sim.t - sim.nextLaunch;
    sim.balls.push({
      x: sim.x0, y: ROWS - BALL_R, vx: Math.cos(sim.angle) * SPEED, vy: -Math.sin(sim.angle) * SPEED,
      active: true, inPower: new Set(), age,
    });
    sim.launched++;
    sim.nextLaunch += LAUNCH_GAP;
  }
  tickLasers(state, sim, dt, rng);
  if (!sim.grid) sim.grid = buildGrid(state);
  const subs = Math.max(1, Math.ceil((SPEED * dt) / 0.07));
  const h = dt / subs;
  for (const ball of sim.balls) {
    if (!ball.active) continue;
    for (let s = 0; s < subs && ball.active; s++) moveBall(state, sim, ball, h, rng);
  }
  if (sim.cleared) recall(sim);
  if (sim.launched >= sim.count && sim.balls.every((b) => !b.active)) sim.done = true;
}

/** Вернуть все шарики (кнопка ↓ или уровень пройден): невылетевшие не вылетят. */
export function recall(sim) {
  sim.count = sim.launched;
  for (const b of sim.balls) b.active = false;
  sim.done = true;
}

/**
 * Конец хода: уровень сдвигается на ряд вниз (пустые ходы пропускаются). Возвращает 'win' | 'lose' | 'next'.
 */
export function endTurn(state, sim) {
  state.turn += 1;
  if (sim.firstX !== null) state.x = sim.firstX;
  // ×3 — на следующий бросок, если его поймали в этом ходу (в том числе во время броска ×3: иначе новый бонус
  // сгорал вместе со старым)
  state.triple = Boolean(sim.caughtTriple);
  if (!state.blocks.length) return 'win';
  const shift = () => {
    for (const b of state.blocks) b.r += 1;
    for (const p of state.powers) p.r += 1;
    state.powers = state.powers.filter((p) => p.r < ROWS - 1);
  };
  shift();
  // пока на экране пусто (весь остаток уровня выше), двигаем дальше
  while (Math.max(...state.blocks.map((b) => b.r)) < 1) shift();
  if (state.blocks.some((b) => b.r >= ROWS - 1)) return 'lose';
  return 'next';
}

/** Блоки в предпоследнем ряду — следующий ход может стать последним. */
export const danger = (state) => state.blocks.some((b) => b.r >= ROWS - 2);

// ---------- траектория прицела ----------

/** Точки траектории: до первого касания и отражённый отрезок (как в видео). */
export function tracePath(state, x, angle, reflectLen = 2.5) {
  const ball = { x, y: ROWS - BALL_R, vx: Math.cos(clampAngle(angle)) * SPEED, vy: -Math.sin(clampAngle(angle)) * SPEED };
  const pts = [[ball.x, ball.y]];
  const h = 0.004;
  let bounced = false;
  let after = 0;
  for (let i = 0; i < 4000; i++) {
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    let n = null;
    if (ball.x < BALL_R) n = [1, 0];
    else if (ball.x > COLS - BALL_R) n = [-1, 0];
    else if (ball.y < BALL_R) n = [0, 1];
    else {
      for (const b of state.blocks) {
        if (b.r < 0 || Math.abs(b.r - Math.floor(ball.y)) > 1 || Math.abs(b.c - Math.floor(ball.x)) > 1) continue;
        const res = circlePolygon(ball.x, ball.y, BALL_R, polygon(b.shape, b.r, b.c));
        if (res) {
          n = [res.nx, res.ny];
          break;
        }
      }
    }
    if (bounced) {
      after += SPEED * h;
      if (after >= reflectLen || n || ball.y > ROWS) {
        pts.push([ball.x, ball.y]);
        break;
      }
      continue;
    }
    if (n) {
      ball.x = px;
      ball.y = py;
      pts.push([px, py]);
      reflect(ball, n[0], n[1]);
      bounced = true;
    }
  }
  return pts;
}

// ---------- сохранение и статистика ----------

/** Сохранение первой версии (без часов лазеров) — дополнить. */
export function normalizeState(s) {
  if (!Number.isFinite(s.clock)) s.clock = 0;
  if (!Number.isFinite(s.nextLaser)) s.nextLaser = 0;
  for (const p of s.powers) if (LASERS.includes(p.kind) && !Number.isFinite(p.born)) p.born = s.clock;
  return s;
}

export function isValidState(s) {
  if (s?.v !== STATE_VERSION) return false;
  const int = (v) => Number.isInteger(v);
  return int(s.level) && s.level >= 1 && int(s.balls) && s.balls > 0 && Number.isFinite(s.x) && s.x > 0 && s.x < COLS
    && Array.isArray(s.blocks) && s.blocks.every((b) => int(b.id) && int(b.r) && int(b.c) && b.c >= 0 && b.c < COLS
      && b.r < ROWS - 1 && SHAPES.includes(b.shape) && int(b.hp) && b.hp > 0 && int(b.max))
    && Array.isArray(s.powers) && s.powers.every((p) => int(p.r) && int(p.c) && POWERS.includes(p.kind))
    && int(s.total) && int(s.dealt) && int(s.turn) && typeof s.triple === 'boolean' && s.pattern && int(s.nextId)
    && (s.clock === undefined || Number.isFinite(s.clock)) && (s.nextLaser === undefined || Number.isFinite(s.nextLaser));
}

export function emptyStats() {
  return { cleared: 0, bestLevel: 0, bricks: 0, shots: 0, fails: 0 };
}

export function isValidStats(s) {
  return Boolean(s) && Object.keys(emptyStats()).every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
