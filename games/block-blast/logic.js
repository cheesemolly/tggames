// Правила Block Blast — без DOM, тестируется в Node.
//
// Поле 8×8: массив из 64 чисел, 0 — пусто, 1..8 — цвет блока. Лоток — 3 фигуры { shape, color } или null.
// Очки (правила собраны по реимплементации игры и видео, коэффициенты подобраны под видео):
//   размещение — +1 за клетку фигуры;
//   сгорание — 10 × сгоревшие клетки × (1 + 0.25 × (линий − 1)) × номер комбо;
//   чистое поле после сгорания — ещё +300.
// Комбо: каждый ход, сжигающий линии, увеличивает счётчик на 1; комбо сбрасывается на 3-м подряд
// ходе без сгорания (два «пустых» хода между сгораниями комбо не рвут).

import { SHAPES, SHAPE_BY_ID, COLORS } from './pieces.js';

export const SIZE = 8;
export const TRAY_SIZE = 3;
export const COMBO_MISSES = 3;
export const ALL_CLEAR_BONUS = 300;

const idx = (r, c) => r * SIZE + c;

export function emptyBoard() {
  return Array(SIZE * SIZE).fill(0);
}

export function canPlace(board, shape, r, c) {
  return shape.cells.every(([dr, dc]) => {
    const rr = r + dr;
    const cc = c + dc;
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[idx(rr, cc)] === 0;
  });
}

/** Все позиции (левый верхний угол фигуры), куда она влезает. */
export function placements(board, shape) {
  const out = [];
  for (let r = 0; r <= SIZE - shape.rows; r++) {
    for (let c = 0; c <= SIZE - shape.cols; c++) {
      if (canPlace(board, shape, r, c)) out.push([r, c]);
    }
  }
  return out;
}

export function fitsAnywhere(board, shape) {
  for (let r = 0; r <= SIZE - shape.rows; r++) {
    for (let c = 0; c <= SIZE - shape.cols; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

/** Какие строки и столбцы заполнены целиком. */
export function fullLines(board) {
  const rows = [];
  const cols = [];
  for (let k = 0; k < SIZE; k++) {
    let row = true;
    let col = true;
    for (let j = 0; j < SIZE; j++) {
      if (!board[idx(k, j)]) row = false;
      if (!board[idx(j, k)]) col = false;
    }
    if (row) rows.push(k);
    if (col) cols.push(k);
  }
  return { rows, cols };
}

/** Какие линии сгорят, если поставить фигуру сюда (для подсветки при перетаскивании). */
export function linesAfter(board, shape, r, c) {
  const next = [...board];
  for (const [dr, dc] of shape.cells) next[idx(r + dr, c + dc)] = 1;
  return fullLines(next);
}

/** Клетки сгорающих линий (без повторов на пересечении строки и столбца). */
export function lineCells({ rows, cols }) {
  const set = new Set();
  for (const r of rows) for (let c = 0; c < SIZE; c++) set.add(idx(r, c));
  for (const c of cols) for (let r = 0; r < SIZE; r++) set.add(idx(r, c));
  return [...set];
}

export function clearBonus(clearedCells, lines, combo) {
  if (!lines) return 0;
  return Math.round(10 * clearedCells * (1 + 0.25 * (lines - 1)) * combo);
}

/**
 * Поставить фигуру из лотка. Меняет state, возвращает событие для анимаций:
 * { cells, color, rows, cols, cleared, clearedColors, lines, combo, placePoints, bonus, allClear }
 * или null, если поставить нельзя.
 */
export function placePiece(state, slot, r, c) {
  const piece = state.tray[slot];
  if (!piece) return null;
  const shape = SHAPE_BY_ID[piece.shape];
  if (!canPlace(state.board, shape, r, c)) return null;

  const cells = shape.cells.map(([dr, dc]) => idx(r + dr, c + dc));
  for (const i of cells) state.board[i] = piece.color;
  state.tray[slot] = null;

  const lines = fullLines(state.board);
  const cleared = lineCells(lines);
  const clearedColors = cleared.map((i) => state.board[i]);
  for (const i of cleared) state.board[i] = 0;
  const lineCount = lines.rows.length + lines.cols.length;

  let bonus = 0;
  let allClear = false;
  if (lineCount) {
    state.combo += 1;
    state.misses = 0;
    bonus = clearBonus(cleared.length, lineCount, state.combo);
    allClear = state.board.every((v) => v === 0);
    if (allClear) bonus += ALL_CLEAR_BONUS;
    state.lines += lineCount;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
  } else {
    state.misses += 1;
    if (state.misses >= COMBO_MISSES) {
      state.combo = 0;
      state.misses = 0;
    }
  }

  const placePoints = cells.length;
  state.score += placePoints + bonus;
  state.moves += 1;
  return {
    cells, color: piece.color, rows: lines.rows, cols: lines.cols, cleared, clearedColors,
    lines: lineCount, combo: state.combo, placePoints, bonus, allClear,
  };
}

export const trayEmpty = (state) => state.tray.every((p) => p === null);

/** Конец игры: ни одна из оставшихся фигур никуда не влезает. */
export function isGameOver(state) {
  const left = state.tray.filter(Boolean);
  return left.length > 0 && left.every((p) => !fitsAnywhere(state.board, SHAPE_BY_ID[p.shape]));
}

// ---------- выдача фигур ----------

/**
 * Вес фигуры с учётом заполненности поля: чем плотнее поле, тем чаще мелкие (до 3 клеток)
 * и тем реже крупные (от 6 клеток) — как в оригинале.
 */
export function shapeWeight(shape, fill) {
  const size = shape.cells.length;
  if (fill < 0.4) return shape.weight;
  if (size <= 3) return shape.weight * (1 + 2.5 * fill);
  if (size >= 6) return shape.weight * Math.max(0.15, 1 - 1.6 * fill);
  return shape.weight;
}

function pickShape(board, rng) {
  const fill = board.filter(Boolean).length / board.length;
  const weights = SHAPES.map((s) => shapeWeight(s, fill));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < SHAPES.length; k++) {
    roll -= weights[k];
    if (roll <= 0) return SHAPES[k];
  }
  return SHAPES.at(-1);
}

/** Поставить фигуру «жадно» (туда, где сгорит больше линий) на копии поля. Возвращает новое поле или null. */
function greedyPlace(board, shape) {
  let best = null;
  let bestLines = -1;
  for (const [r, c] of placements(board, shape)) {
    const lines = linesAfter(board, shape, r, c);
    const n = lines.rows.length + lines.cols.length;
    if (n > bestLines) {
      bestLines = n;
      best = [r, c];
    }
  }
  if (!best) return null;
  const next = [...board];
  for (const [dr, dc] of shape.cells) next[idx(best[0] + dr, best[1] + dc)] = 1;
  for (const i of lineCells(fullLines(next))) next[i] = 0;
  return next;
}

const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/** Тройку можно поставить целиком хотя бы в одном порядке (жадная проверка). */
export function trioPlayable(board, shapes) {
  return ORDERS.some((order) => {
    let b = board;
    for (const k of order) {
      b = greedyPlace(b, shapes[k]);
      if (!b) return false;
    }
    return true;
  });
}

function colorTrio(rng) {
  const colors = [];
  while (colors.length < TRAY_SIZE) {
    const color = 1 + Math.floor(rng() * COLORS);
    if (!colors.includes(color)) colors.push(color);
  }
  return colors;
}

/**
 * Новая тройка. Сначала ищется тройка, которую можно поставить целиком (до 30 попыток);
 * не нашлась — хотя бы одна фигура гарантированно влезает (заменяется на мелкую, что влезает).
 */
export function dealTray(board, rng = Math.random, attempts = 30) {
  let shapes = null;
  for (let k = 0; k < attempts; k++) {
    const trio = [pickShape(board, rng), pickShape(board, rng), pickShape(board, rng)];
    if (trioPlayable(board, trio)) {
      shapes = trio;
      break;
    }
  }
  if (!shapes) {
    shapes = [pickShape(board, rng), pickShape(board, rng), pickShape(board, rng)];
    if (!shapes.some((s) => fitsAnywhere(board, s))) {
      const fitting = SHAPES.filter((s) => s.cells.length <= 3 && fitsAnywhere(board, s));
      shapes[0] = fitting.length ? fitting[Math.floor(rng() * fitting.length)] : SHAPE_BY_ID.dot;
    }
  }
  const colors = colorTrio(rng);
  return shapes.map((s, k) => ({ shape: s.id, color: colors[k] }));
}

export function newGame(rng = Math.random) {
  const board = emptyBoard();
  return {
    board,
    tray: dealTray(board, rng),
    score: 0,
    combo: 0,
    misses: 0,
    moves: 0,
    lines: 0,
    maxCombo: 0,
    elapsedMs: 0,
  };
}

export function isValidState(s) {
  const count = (n) => Number.isFinite(n) && n >= 0;
  return Boolean(s)
    && Array.isArray(s.board) && s.board.length === SIZE * SIZE
    && s.board.every((v) => Number.isInteger(v) && v >= 0 && v <= COLORS)
    && Array.isArray(s.tray) && s.tray.length === TRAY_SIZE
    && s.tray.every((p) => p === null || (SHAPE_BY_ID[p?.shape] && Number.isInteger(p.color) && p.color >= 1 && p.color <= COLORS))
    && ['score', 'combo', 'misses', 'moves', 'lines', 'maxCombo', 'elapsedMs'].every((k) => count(s[k]));
}

// ---------- статистика ----------

export function emptyStats() {
  return { played: 0, best: 0, totalScore: 0, maxCombo: 0, lines: 0 };
}

export function recordGame(stats, state) {
  return {
    played: stats.played + 1,
    best: Math.max(stats.best, state.score),
    totalScore: stats.totalScore + state.score,
    maxCombo: Math.max(stats.maxCombo, state.maxCombo),
    lines: stats.lines + state.lines,
  };
}

export function isValidStats(s) {
  const count = (n) => Number.isFinite(n) && n >= 0;
  return Boolean(s) && ['played', 'best', 'totalScore', 'maxCombo', 'lines'].every((k) => count(s[k]));
}
