// Правила 2048 (как в оригинале Габриэле Чирулли, MIT) — без DOM, тестируется в Node.
//
// Поле size×size: массив чисел, 0 — пусто. Ход в одну из сторон сдвигает все плитки до упора;
// две одинаковые соседние плитки сливаются в одну (сумма идёт в счёт), каждая плитка — не больше одного
// слияния за ход (2 2 2 2 → 4 4). Если ход что-то сдвинул — появляется новая плитка: 2 (90%) или 4 (10%).
// Цель — плитка 2048 (дальше можно продолжать); конец — когда ходов нет.

export const SIZES = [3, 4, 5, 6];
export const DEFAULT_SIZE = 4;
export const WIN_VALUE = 2048;
export const UNDO_PER_GAME = 3;
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

/** Индексы клеток каждой линии в порядке «от края, к которому едем». */
function lines(size, dir) {
  const out = [];
  for (let k = 0; k < size; k++) {
    const line = [];
    for (let j = 0; j < size; j++) {
      if (dir === 'left') line.push(k * size + j);
      else if (dir === 'right') line.push(k * size + (size - 1 - j));
      else if (dir === 'up') line.push(j * size + k);
      else line.push((size - 1 - j) * size + k);
    }
    out.push(line);
  }
  return out;
}

/**
 * Ход. Возвращает { grid, moved, gain, moves, merges }:
 *   moves  — [{ from, to, value }] для каждой сдвинувшейся или слившейся плитки (для анимации);
 *   merges — [{ at, value }] — куда встала слитая плитка и её новое значение.
 * Исходное поле не меняется.
 */
export function move(grid, size, dir) {
  const next = Array(size * size).fill(0);
  const moves = [];
  const merges = [];
  let gain = 0;
  for (const line of lines(size, dir)) {
    let target = 0;          // следующая свободная позиция в линии
    let lastValue = 0;       // значение последней поставленной плитки, если она ещё может слиться
    for (const from of line) {
      const value = grid[from];
      if (!value) continue;
      if (lastValue === value) {
        // слияние с предыдущей плиткой — она стоит на позиции target-1
        const at = line[target - 1];
        next[at] = value * 2;
        gain += value * 2;
        merges.push({ at, value: value * 2 });
        moves.push({ from, to: at, value });
        lastValue = 0;
      } else {
        const to = line[target];
        next[to] = value;
        if (to !== from) moves.push({ from, to, value });
        lastValue = value;
        target++;
      }
    }
  }
  const moved = moves.length > 0;
  return { grid: moved ? next : [...grid], moved, gain, moves, merges };
}

export const emptyCells = (grid) => grid.flatMap((v, i) => (v ? [] : [i]));

/** Новая плитка в случайную пустую клетку: 2 (90%) или 4 (10%). Возвращает { grid, at, value } или null. */
export function spawn(grid, rng = Math.random) {
  const empty = emptyCells(grid);
  if (!empty.length) return null;
  const at = empty[Math.floor(rng() * empty.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const next = [...grid];
  next[at] = value;
  return { grid: next, at, value };
}

/** Есть ли хоть один ход. */
export function canMove(grid, size) {
  if (grid.some((v) => !v)) return true;
  for (let i = 0; i < grid.length; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    if (c + 1 < size && grid[i] === grid[i + 1]) return true;
    if (r + 1 < size && grid[i] === grid[i + size]) return true;
  }
  return false;
}

export const maxTile = (grid) => Math.max(0, ...grid);

export function newGame(size, rng = Math.random) {
  let grid = Array(size * size).fill(0);
  grid = spawn(grid, rng).grid;
  grid = spawn(grid, rng).grid;
  return { size, grid, score: 0, moves: 0, won: false, keepPlaying: false, undo: null, undoLeft: UNDO_PER_GAME };
}

/**
 * Сделать ход в состоянии партии (меняет state). Возвращает { moved, gain, moves, merges, spawned, won }
 * — won = только что впервые собрана 2048.
 */
export function play(state, dir, rng = Math.random) {
  const result = move(state.grid, state.size, dir);
  if (!result.moved) return { moved: false };
  state.undo = { grid: [...state.grid], score: state.score };
  const spawned = spawn(result.grid, rng);
  state.grid = spawned ? spawned.grid : result.grid;
  state.score += result.gain;
  state.moves += 1;
  const won = !state.won && maxTile(state.grid) >= WIN_VALUE;
  if (won) state.won = true;
  return { moved: true, gain: result.gain, moves: result.moves, merges: result.merges, spawned, won };
}

/** Отменить последний ход (один шаг, UNDO_PER_GAME раз за партию). */
export function undo(state) {
  if (!state.undo || state.undoLeft <= 0) return false;
  state.grid = state.undo.grid;
  state.score = state.undo.score;
  state.undo = null;
  state.undoLeft -= 1;
  return true;
}

export function isValidState(s) {
  const grid = (g) => Array.isArray(g) && g.length === s.size * s.size
    && g.every((v) => v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0));
  return Boolean(s)
    && SIZES.includes(s.size)
    && grid(s.grid)
    && (s.undo === null || (s.undo && grid(s.undo.grid) && Number.isFinite(s.undo.score)))
    && [s.score, s.moves, s.undoLeft].every((n) => Number.isFinite(n) && n >= 0)
    && typeof s.won === 'boolean' && typeof s.keepPlaying === 'boolean';
}

// ---------- статистика по размеру поля ----------

export function emptyStats() {
  return { played: 0, best: 0, bestTile: 0, wins: 0 };
}

export function recordGame(stats, state) {
  return {
    played: stats.played + 1,
    best: Math.max(stats.best, state.score),
    bestTile: Math.max(stats.bestTile, maxTile(state.grid)),
    wins: stats.wins + (state.won ? 1 : 0),
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'best', 'bestTile', 'wins'].every((k) => Number.isFinite(s[k]) && s[k] >= 0);
}
