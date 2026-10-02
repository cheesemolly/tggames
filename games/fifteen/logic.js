// Правила пятнашек без DOM: поле n×n (плитки 1…n²−1 и пустая клетка 0), честное перемешивание (случайная
// решаемая расстановка), ходы — плитка в пустую клетку (по направлению, как свайп в 2048) или несколько плиток
// разом (касание плитки в одной строке или столбце с пустой), отмена, победа, сохранение, статистика.
//
// Решаемость: для нечётной ширины — чётное число инверсий; для чётной — инверсии + строка пустой клетки
// (считая снизу с 1) должны давать нечётную сумму. Перемешивание — равномерно случайная перестановка; если она
// нерешаемая, меняются местами две плитки (не пустая) — это меняет чётность и не портит равномерность.

export const SIZES = [3, 4, 5, 6, 7, 8];
export const DEFAULT_SIZE = 4;

/** Собранное поле: 1, 2, …, n²−1, 0. */
export const solved = (n) => Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));

export function inversions(grid) {
  const t = grid.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) inv++;
  return inv;
}

export function isSolvable(grid, n) {
  const inv = inversions(grid);
  if (n % 2 === 1) return inv % 2 === 0;
  const rowFromBottom = n - Math.floor(grid.indexOf(0) / n);
  return (inv + rowFromBottom) % 2 === 1;
}

export const isSolved = (grid) => grid.every((v, i) => v === (i === grid.length - 1 ? 0 : i + 1));

/** Сколько плиток не на своём месте (пустая не считается). */
export const misplaced = (grid) => grid.reduce((s, v, i) => s + (v !== 0 && v !== i + 1 ? 1 : 0), 0);

/** Сумма манхэттенских расстояний плиток до своих мест. */
export function manhattan(grid, n) {
  let d = 0;
  grid.forEach((v, i) => {
    if (!v) return;
    const g = v - 1;
    d += Math.abs((i % n) - (g % n)) + Math.abs(Math.floor(i / n) - Math.floor(g / n));
  });
  return d;
}

/**
 * Случайная решаемая расстановка, не слишком близкая к собранной (манхэттен не меньше minDist — по умолчанию
 * половина среднего для размера).
 */
export function scramble(n, rng = Math.random, minDist = Math.round(n * n * (n - 1) * 0.33)) {
  for (;;) {
    const g = solved(n);
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    if (!isSolvable(g, n)) {
      // поменять две первые непустые плитки — чётность меняется
      const a = g.findIndex((v) => v !== 0);
      const b = g.findIndex((v, k) => v !== 0 && k !== a);
      [g[a], g[b]] = [g[b], g[a]];
    }
    if (!isSolved(g) && manhattan(g, n) >= minDist) return g;
  }
}

/** Направление свайпа → какая клетка двигается в пустую: свайп вправо двигает плитку слева от пустой вправо. */
const DIR = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] };

/** Индекс плитки, которую сдвигает свайп dir, или −1 (у края). */
export function tileForDir(grid, n, dir) {
  const e = grid.indexOf(0);
  const [dx, dy] = DIR[dir];
  const x = (e % n) + dx;
  const y = Math.floor(e / n) + dy;
  if (x < 0 || y < 0 || x >= n || y >= n) return -1;
  return y * n + x;
}

/**
 * Плитки, которые сдвинутся при касании клетки i: от пустой к i по строке или столбцу (ближняя к пустой — первой).
 * [] — не в одной линии с пустой.
 */
export function lineTo(grid, n, i) {
  const e = grid.indexOf(0);
  if (i === e) return [];
  const ex = e % n;
  const ey = Math.floor(e / n);
  const x = i % n;
  const y = Math.floor(i / n);
  if (x !== ex && y !== ey) return [];
  const out = [];
  const sx = Math.sign(x - ex);
  const sy = Math.sign(y - ey);
  for (let cx = ex + sx, cy = ey + sy; ; cx += sx, cy += sy) {
    out.push(cy * n + cx);
    if (cx === x && cy === y) break;
  }
  return out;
}

export function newGame(n = DEFAULT_SIZE, rng = Math.random) {
  const grid = scramble(n, rng);
  return { v: 1, n, grid, start: grid.slice(), moves: 0, time: 0, history: [], done: false };
}

/**
 * Сдвинуть плитки cells (по порядку от пустой) в сторону пустой. → [{ from, to, value }] — движения для анимации.
 * Каждая плитка — один ход (так считают пятнашки: «ходов» = сдвинутых плиток).
 */
export function slide(game, cells) {
  if (game.done || !cells.length) return [];
  const { grid } = game;
  const moved = [];
  let e = grid.indexOf(0);
  for (const i of cells) {
    moved.push({ from: i, to: e, value: grid[i] });
    grid[e] = grid[i];
    grid[i] = 0;
    e = i;
  }
  game.moves += moved.length;
  game.history.push(moved.map((m) => m.value));
  if (game.history.length > 500) game.history.shift();
  if (isSolved(grid)) game.done = true;
  return moved;
}

export const moveDir = (game, dir) => {
  const i = tileForDir(game.grid, game.n, dir);
  return i < 0 ? [] : slide(game, [i]);
};

export const tapCell = (game, i) => slide(game, lineTo(game.grid, game.n, i));

/**
 * Отмена последнего хода (плитки возвращаются; ход считается — отмена тоже движение). → движения или [].
 */
export function undo(game) {
  if (game.done || !game.history.length) return [];
  const values = game.history.pop();
  const { grid, n } = game;
  const moved = [];
  for (let k = values.length - 1; k >= 0; k--) {
    const i = grid.indexOf(values[k]);
    const e = grid.indexOf(0);
    moved.push({ from: i, to: e, value: values[k] });
    grid[e] = values[k];
    grid[i] = 0;
  }
  void n;
  game.moves += moved.length;
  return moved;
}

// ---------- сохранение и статистика ----------

export function isValidGame(g) {
  if (!g || typeof g !== 'object' || g.v !== 1 || !SIZES.includes(g.n)) return false;
  const len = g.n * g.n;
  const okGrid = (a) => Array.isArray(a) && a.length === len && [...a].sort((p, q) => p - q).every((v, i) => v === i);
  if (!okGrid(g.grid) || !okGrid(g.start) || !isSolvable(g.grid, g.n)) return false;
  if (!Array.isArray(g.history) || !g.history.every((h) => Array.isArray(h) && h.every((v) => Number.isInteger(v) && v > 0 && v < len))) return false;
  return Number.isInteger(g.moves) && g.moves >= 0 && Number.isFinite(g.time) && g.time >= 0
    && typeof g.done === 'boolean';
}

const emptyRow = () => ({ played: 0, wins: 0, bestMoves: 0, bestTime: 0, totalMoves: 0 });
export const emptyStats = () => Object.fromEntries(SIZES.map((n) => [n, emptyRow()]));

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object' && SIZES.every((n) => {
    const r = s[n];
    return r && ['played', 'wins', 'bestMoves', 'bestTime', 'totalMoves'].every((k) => Number.isFinite(r[k]) && r[k] >= 0);
  });
}

/** Записать партию: собрана — победа, рекорды ходов и времени; брошена — только «сыграно». */
export function recordGame(stats, game, { win }) {
  const r = stats[game.n] ?? (stats[game.n] = emptyRow());
  r.played++;
  if (win) {
    r.wins++;
    r.totalMoves += game.moves;
    if (!r.bestMoves || game.moves < r.bestMoves) r.bestMoves = game.moves;
    if (game.time > 0 && (!r.bestTime || game.time < r.bestTime)) r.bestTime = Math.round(game.time);
  }
  return stats;
}

export function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}
