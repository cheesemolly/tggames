// «Петля» (как Infinity Loop / ∞ Loop): каждая плитка поворачивается нажатием на 90°; уровень решён, когда у
// всех линий нет свободных концов — каждое соединение плитки встречает соединение соседа, к краю поля не ведёт.
// Без DOM, тестируется в Node.
//
// Плитка — маска соединений: N=1, E=2, S=4, W=8. Уровень строится от решения: между соседними клетками
// случайно проводятся связи, затем каждая плитка поворачивается случайно — поэтому любой уровень решаем
// (подходит и любое другое замкнутое положение, не только исходное).

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const MAX_DIM = 10;
export const MIN_DIM = 3;
export const STATE_VERSION = 1;
export const SHAPES = ['round', 'square'];

/** Маска после k поворотов на 90° по часовой стрелке. */
export function rotateMask(mask, k) {
  const r = ((k % 4) + 4) % 4;
  return ((mask << r) | (mask >> (4 - r))) & 15;
}

export const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };

export const bitCount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** Вид плитки и поворот канонической формы: end (N), straight (N|S), corner (N|E), tee (N|E|S), cross. */
export function tileKind(mask) {
  const count = bitCount(mask);
  if (count === 0) return null;
  let kind;
  let base;
  if (count === 1) [kind, base] = ['end', N];
  else if (count === 4) [kind, base] = ['cross', 15];
  else if (count === 3) [kind, base] = ['tee', N | E | S];
  else if (mask === (N | S) || mask === (E | W)) [kind, base] = ['straight', N | S];
  else [kind, base] = ['corner', N | E];
  for (let k = 0; k < 4; k++) if (rotateMask(base, k) === mask) return { kind, turns: k };
  return null;
}

// ---------- размер поля ----------

/**
 * Размер уровня: сначала поле растёт (3×3 → 10×10 за ~22 уровня), потом — случайно в пределах 7–10.
 * Каждая сторона меняется от уровня к уровню не больше чем на 1 — резких скачков нет.
 */
export function dimsFor(level, prev, rng = Math.random) {
  const ramp = Math.min(MAX_DIM, MIN_DIM + Math.floor((level - 1) / 3));
  const lo = ramp < MAX_DIM ? Math.max(MIN_DIM, ramp - 1) : 7;
  const pickDim = (p) => {
    let d = lo + Math.floor(rng() * (ramp - lo + 1));
    if (p) d = Math.min(p + 1, Math.max(p - 1, d));
    return Math.min(MAX_DIM, Math.max(MIN_DIM, d));
  };
  let cols = pickDim(prev?.cols);
  let rows = pickDim(prev?.rows);
  // экран вертикальный: строк не меньше, чем столбцов (если так можно без скачка)
  if (cols > rows && (!prev || (Math.abs(rows - prev.cols) <= 1 && Math.abs(cols - prev.rows) <= 1))) [cols, rows] = [rows, cols];
  return { rows, cols };
}

// ---------- генерация ----------

/**
 * Решённое поле rows×cols: связи между соседями с вероятностью density. Не меньше 60% клеток заняты.
 * Возвращает массив масок.
 */
export function generateSolution(rows, cols, rng = Math.random, density = 0.55) {
  for (let attempt = 0; ; attempt++) {
    const masks = new Array(rows * cols).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1 && rng() < density) {
          masks[i] |= E;
          masks[i + 1] |= W;
        }
        if (r < rows - 1 && rng() < density) {
          masks[i] |= S;
          masks[i + cols] |= N;
        }
      }
    }
    const used = masks.filter(Boolean).length;
    if (used >= masks.length * 0.6 || attempt > 200) return masks;
  }
}

/** Решено ли поле: masks — текущие маски плиток (уже с поворотом). */
export function isSolved(masks, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = masks[r * cols + c];
      if (m & N && (r === 0 || !(masks[(r - 1) * cols + c] & S))) return false;
      if (m & S && (r === rows - 1 || !(masks[(r + 1) * cols + c] & N))) return false;
      if (m & W && (c === 0 || !(masks[r * cols + c - 1] & E))) return false;
      if (m & E && (c === cols - 1 || !(masks[r * cols + c + 1] & W))) return false;
    }
  }
  return true;
}

export const currentMasks = (state) => state.base.map((m, i) => rotateMask(m, state.rot[i]));

/** Сошлась ли плитка i со всеми соседями: каждый её конец встречает конец соседа, к краю поля не ведёт. */
export function tileFits(masks, rows, cols, i) {
  const m = masks[i];
  if (!m) return false;
  const r = Math.floor(i / cols);
  const c = i % cols;
  if (m & N && (r === 0 || !(masks[i - cols] & S))) return false;
  if (m & S && (r === rows - 1 || !(masks[i + cols] & N))) return false;
  if (m & W && (c === 0 || !(masks[i - 1] & E))) return false;
  if (m & E && (c === cols - 1 || !(masks[i + 1] & W))) return false;
  return true;
}

/** Перемешать: каждая плитка — в случайный поворот; решённым поле не остаётся. */
export function scramble(base, rows, cols, rng = Math.random) {
  for (;;) {
    const rot = base.map(() => Math.floor(rng() * 4));
    if (!isSolved(base.map((m, i) => rotateMask(m, rot[i])), rows, cols)) return rot;
    if (base.every((m) => m === 0 || m === 15)) return rot;       // перемешивать нечего (не бывает)
  }
}

// ---------- партия ----------

/**
 * Новый уровень. prev — предыдущее состояние (для размера, формы и палитры) или null.
 * settings: { shape: 'mix'|'round'|'square', palette: 'random'|<id> }, palettes — id палитр для случайного выбора.
 */
export function newLevel(level, prev, settings, palettes, rng = Math.random) {
  const { rows, cols } = dimsFor(level, prev && { rows: prev.rows, cols: prev.cols }, rng);
  const base = generateSolution(rows, cols, rng);
  const rot = scramble(base, rows, cols, rng);
  let shape = settings.shape;
  if (shape === 'mix') {
    // «иногда меняем»: примерно каждый третий уровень — другая форма
    const was = prev?.shape ?? 'round';
    shape = level > 1 && rng() < 0.35 ? (was === 'round' ? 'square' : 'round') : was;
  }
  let palette = settings.palette;
  if (palette === 'random') {
    const choices = palettes.filter((p) => p !== prev?.palette);
    palette = choices[Math.floor(rng() * choices.length)];
  }
  return { v: STATE_VERSION, level, rows, cols, base, rot, shape, palette, moves: 0 };
}

/** Повернуть плитку i на 90° по часовой. Возвращает true, если после этого поле решено. */
export function rotateTile(state, i) {
  state.rot[i] = (state.rot[i] + 1) % 4;
  state.moves += 1;
  return isSolved(currentMasks(state), state.rows, state.cols);
}

export function isValidState(s) {
  if (s?.v !== STATE_VERSION) return false;
  const dimOk = (d) => Number.isInteger(d) && d >= MIN_DIM && d <= MAX_DIM;
  if (!dimOk(s.rows) || !dimOk(s.cols)) return false;
  const n = s.rows * s.cols;
  return Number.isInteger(s.level) && s.level >= 1
    && Array.isArray(s.base) && s.base.length === n && s.base.every((m) => Number.isInteger(m) && m >= 0 && m < 16)
    && Array.isArray(s.rot) && s.rot.length === n && s.rot.every((r) => Number.isInteger(r) && r >= 0 && r < 4)
    && SHAPES.includes(s.shape) && typeof s.palette === 'string'
    && Number.isInteger(s.moves) && s.moves >= 0
    && isSolved(s.base, s.rows, s.cols);
}

// ---------- статистика ----------

export function emptyStats() {
  return { solved: 0, taps: 0, bestLevel: 0 };
}

export function recordSolved(stats, state) {
  return {
    solved: stats.solved + 1,
    taps: stats.taps + state.moves,
    bestLevel: Math.max(stats.bestLevel, state.level),
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['solved', 'taps', 'bestLevel'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
