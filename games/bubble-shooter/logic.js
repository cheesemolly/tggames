// «Шарики» (bubble shooter) по видео владельца: шары висят шестиугольной сеткой, снизу стрелок.
// Прицел и полёт — как в Brick Blast: тянешь по полю, видишь пунктир с отражением от стен, отпускаешь.
// Шар прилипает к сетке; три и больше одного цвета подряд лопаются; всё, что после этого повисло
// в воздухе, падает. Логика чистая: без DOM, случайность передаётся параметром.
//
// Система координат — в диаметрах шара: радиус 0.5, ширина поля COLS. Чётные ряды начинаются у левого
// края, нечётные сдвинуты на полшара (это и есть шестиугольная упаковка).

export const COLS = 11;                    // шаров в чётном ряду; в нечётном на один меньше
export const R = 0.5;                      // радиус шара
export const ROW_H = Math.sqrt(3) / 2;     // высота ряда при плотной упаковке
export const WIDTH = COLS;                 // ширина поля
export const DEADLINE_ROW = 13;            // ниже этого ряда шарам опускаться нельзя — проигрыш
export const MAX_ROWS = DEADLINE_ROW + 1;

export const COLORS = 6;                   // всего цветов в игре
export const MATCH = 3;                    // сколько одинаковых подряд лопается
export const SPEED = 18;                   // скорость полёта, диаметров в секунду
export const STEP = 0.06;                  // шаг проверки столкновений

export const POP_POINTS = 10;              // за лопнувший шар
export const DROP_POINTS = 20;             // за упавший (отцепившийся) — как в видео
export const CLEAR_BONUS = 500;            // поле очищено

/** Ряд нечётный — значит сдвинут вправо на полшара и в нём на один шар меньше. */
export const rowCols = (r) => (r % 2 === 0 ? COLS : COLS - 1);

export const cellX = (r, c) => c + R + (r % 2 === 0 ? 0 : R);
export const cellY = (r) => r * ROW_H + R;

export const inGrid = (r, c) => r >= 0 && r < MAX_ROWS && c >= 0 && c < rowCols(r);

/** Шесть соседей в шестиугольной сетке: сдвиг по диагонали зависит от чётности ряда. */
export function neighbors(r, c) {
  const odd = r % 2 !== 0;
  const around = [
    [r, c - 1], [r, c + 1],
    [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
    [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c],
  ];
  return around.filter(([rr, cc]) => inGrid(rr, cc));
}

// ---------- поле ----------

export const emptyGrid = () => Array.from({ length: MAX_ROWS }, (_, r) => Array(rowCols(r)).fill(null));

export const at = (grid, r, c) => (inGrid(r, c) ? grid[r][c] : null);

/** Все занятые клетки. */
export function* filled(grid) {
  for (let r = 0; r < MAX_ROWS; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (grid[r][c] !== null) yield [r, c, grid[r][c]];
    }
  }
}

export const countBubbles = (grid) => [...filled(grid)].length;

/** Цвета, которые сейчас на поле, — стрелок не должен выдавать то, чего уже нет. */
export function colorsOnField(grid) {
  const set = new Set();
  for (const [, , color] of filled(grid)) set.add(color);
  return [...set].sort((a, b) => a - b);
}

/** Самый нижний занятый ряд. */
export function lowestRow(grid) {
  let low = -1;
  for (const [r] of filled(grid)) low = Math.max(low, r);
  return low;
}

// ---------- полёт и прилипание ----------

/** Свободная клетка, ближе всего к точке, и при этом соседняя с занятой (или в верхнем ряду). */
export function snapCell(grid, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (let r = 0; r < MAX_ROWS; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      if (grid[r][c] !== null) continue;
      const attached = r === 0 || neighbors(r, c).some(([rr, cc]) => grid[rr][cc] !== null);
      if (!attached) continue;
      const dx = cellX(r, c) - x;
      const dy = cellY(r) - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = [r, c];
      }
    }
  }
  return best;
}

/**
 * Полёт шара от стрелка до прилипания. Возвращает { path, cell } — путь для анимации и клетку,
 * куда шар встал (null — места не нашлось, шар пропал).
 * angle: 0 — вертикально вверх, положительный — вправо (как у стрелка в видео).
 */
export function fly(grid, start, angle, { maxSteps = 4000 } = {}) {
  let x = start.x;
  let y = start.y;
  const vx = Math.sin(angle);
  const vy = -Math.cos(angle);
  const path = [{ x, y }];

  for (let i = 0; i < maxSteps; i += 1) {
    x += vx * STEP;
    y += vy * STEP;

    if (x < R) {                       // отражение от стен, как в Brick Blast
      x = R + (R - x);
      path.push({ x, y, bounce: true });
    } else if (x > WIDTH - R) {
      x = (WIDTH - R) - (x - (WIDTH - R));
      path.push({ x, y, bounce: true });
    }

    if (y <= R) {                      // потолок
      y = R;
      path.push({ x, y });
      return { path, cell: snapCell(grid, x, y) };
    }

    if (hits(grid, x, y)) {
      path.push({ x, y });
      return { path, cell: snapCell(grid, x, y) };
    }
    path.push({ x, y });
  }
  return { path, cell: null };
}

function hits(grid, x, y) {
  for (const [r, c] of nearbyCells(x, y)) {
    if (grid[r][c] === null) continue;
    const dx = cellX(r, c) - x;
    const dy = cellY(r) - y;
    if (dx * dx + dy * dy < 0.92) return true;    // чуть меньше диаметра: касание считается попаданием
  }
  return false;
}

/** Клетки вокруг точки — перебирать всю сетку на каждый шаг незачем. */
function* nearbyCells(x, y) {
  const r0 = Math.round((y - R) / ROW_H);
  for (let r = r0 - 1; r <= r0 + 1; r += 1) {
    if (r < 0 || r >= MAX_ROWS) continue;
    const c0 = Math.round(x - R - (r % 2 === 0 ? 0 : R));
    for (let c = c0 - 1; c <= c0 + 1; c += 1) {
      if (c >= 0 && c < rowCols(r)) yield [r, c];
    }
  }
}

// ---------- лопание и падение ----------

/** Связная область одного цвета от клетки. */
export function cluster(grid, r, c) {
  const color = at(grid, r, c);
  if (color === null) return [];
  const seen = new Set([`${r}:${c}`]);
  const stack = [[r, c]];
  const out = [];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    out.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc)) {
      const key = `${nr}:${nc}`;
      if (seen.has(key) || grid[nr][nc] !== color) continue;
      seen.add(key);
      stack.push([nr, nc]);
    }
  }
  return out;
}

/** Шары, потерявшие связь с верхним рядом: они падают. */
export function floating(grid) {
  const attached = new Set();
  const stack = [];
  for (let c = 0; c < rowCols(0); c += 1) {
    if (grid[0][c] !== null) {
      attached.add(`0:${c}`);
      stack.push([0, c]);
    }
  }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c)) {
      const key = `${nr}:${nc}`;
      if (attached.has(key) || grid[nr][nc] === null) continue;
      attached.add(key);
      stack.push([nr, nc]);
    }
  }
  const out = [];
  for (const [r, c] of filled(grid)) {
    if (!attached.has(`${r}:${c}`)) out.push([r, c]);
  }
  return out;
}

// ---------- партия ----------

export const shotsFor = (level) => 30 + Math.min(level, 10) * 2;
export const paletteFor = (level) => Math.min(3 + Math.floor((level - 1) / 3), COLORS);
export const rowsFor = (level) => Math.min(4 + Math.floor((level - 1) / 2), 9);

/** Уровень: несколько верхних рядов заполнены, в нижних попадаются дырки. */
export function newLevel(level, rng = Math.random) {
  const grid = emptyGrid();
  const palette = paletteFor(level);
  const rows = rowsFor(level);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < rowCols(r); c += 1) {
      const hole = r >= rows - 2 && rng() < 0.28;     // нижние ряды рваные, как в видео
      grid[r][c] = hole ? null : Math.floor(rng() * palette);
    }
  }
  // Висящие в воздухе шары в начале не нужны — убираем.
  for (const [r, c] of floating(grid)) grid[r][c] = null;
  return {
    level,
    grid,
    shots: shotsFor(level),
    score: 0,
    combo: 0,
    current: pickColor(grid, palette, rng),
    next: pickColor(grid, palette, rng),
    over: null,                                      // 'win' | 'lose' | null
  };
}

/** Цвет для стрелка: только тот, что есть на поле (иначе выстрел заведомо бесполезен). */
export function pickColor(grid, palette, rng = Math.random) {
  const present = colorsOnField(grid);
  const pool = present.length ? present : Array.from({ length: palette }, (_, i) => i);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Выстрел под углом angle. Меняет state. Возвращает подробности для анимации:
 * { path, cell, popped, dropped, gained, combo, over }.
 */
export function shoot(state, angle, rng = Math.random) {
  if (state.over) return null;
  const start = { x: WIDTH / 2, y: DEADLINE_ROW * ROW_H + R };
  const { path, cell } = fly(state.grid, start, angle);

  state.shots -= 1;
  let popped = [];
  let dropped = [];

  if (cell) {
    const [r, c] = cell;
    state.grid[r][c] = state.current;
    const group = cluster(state.grid, r, c);
    if (group.length >= MATCH) {
      popped = group;
      for (const [pr, pc] of group) state.grid[pr][pc] = null;
      dropped = floating(state.grid);
      for (const [dr, dc] of dropped) state.grid[dr][dc] = null;
    }
  }

  state.combo = popped.length ? state.combo + 1 : 0;
  const multiplier = Math.max(1, state.combo);
  const gained = (popped.length * POP_POINTS + dropped.length * DROP_POINTS) * multiplier;
  state.score += gained;

  const left = countBubbles(state.grid);
  if (left === 0) {
    state.score += CLEAR_BONUS;
    state.over = 'win';
  } else if (lowestRow(state.grid) >= DEADLINE_ROW) {
    state.over = 'lose';
  } else if (state.shots <= 0) {
    state.over = 'lose';
  }

  const palette = paletteFor(state.level);
  state.current = state.next;
  state.next = pickColor(state.grid, palette, rng);

  return { path, cell, popped, dropped, gained, combo: state.combo, over: state.over };
}

/** Поменять текущий шар со следующим (тап по стрелку, как в видео). */
export function swap(state) {
  if (state.over) return false;
  const now = state.current;
  state.current = state.next;
  state.next = now;
  return true;
}

// ---------- прицел ----------

/** Пунктир прицела: до первого касания плюс отражённый отрезок (как в Brick Blast). */
export function aimPath(grid, angle, { maxLen = 60 } = {}) {
  const start = { x: WIDTH / 2, y: DEADLINE_ROW * ROW_H + R };
  const { path } = fly(grid, start, angle, { maxSteps: Math.round(maxLen / STEP) });
  return path;
}

export const MAX_ANGLE = 1.35;              // примерно 77° — почти горизонтально, но не в пол

export const clampAngle = (angle) => Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));

/** Угол на точку поля: 0 — вверх, вправо — положительный. */
export function angleTo(x, y) {
  const start = { x: WIDTH / 2, y: DEADLINE_ROW * ROW_H + R };
  return clampAngle(Math.atan2(x - start.x, start.y - y));
}

// ---------- сохранение ----------

export function isValidState(s) {
  if (!s || !Array.isArray(s.grid) || s.grid.length !== MAX_ROWS) return false;
  for (let r = 0; r < MAX_ROWS; r += 1) {
    const row = s.grid[r];
    if (!Array.isArray(row) || row.length !== rowCols(r)) return false;
    if (!row.every((v) => v === null || (Number.isInteger(v) && v >= 0 && v < COLORS))) return false;
  }
  return Number.isInteger(s.level) && s.level >= 1
    && [s.shots, s.score, s.combo].every((n) => Number.isInteger(n) && n >= 0)
    && [s.current, s.next].every((v) => Number.isInteger(v) && v >= 0 && v < COLORS)
    && (s.over === null || s.over === 'win' || s.over === 'lose');
}

// ---------- статистика ----------

export const emptyStats = () => ({ played: 0, cleared: 0, bestLevel: 0, popped: 0, bestScore: 0 });

export function recordGame(stats, state, won) {
  return {
    played: stats.played + 1,
    cleared: stats.cleared + (won ? 1 : 0),
    bestLevel: Math.max(stats.bestLevel, won ? state.level : state.level - 1),
    popped: stats.popped,
    bestScore: Math.max(stats.bestScore, state.score),
  };
}

export const isValidStats = (s) => Boolean(s)
  && ['played', 'cleared', 'bestLevel', 'popped', 'bestScore'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
