// Перебор с отсечениями: считает решения (до limit) и заполняет случайную полную сетку.
// Используется для проверки единственности решения и для генератора банка сеток.

import { ROW_OF, COL_OF, BOX_OF, popcount } from './grid.js';

/**
 * Считает решения, останавливаясь на limit.
 * Возвращает { count, solution } — solution: первое найденное решение или null.
 * Сетка с противоречием (две одинаковые цифры в группе) — 0 решений.
 */
export function countSolutions(grid, limit = 2, rng = null) {
  const g = Int8Array.from(grid);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const b = 1 << d;
    if ((rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]) & b) return { count: 0, solution: null };
    rows[ROW_OF[i]] |= b;
    cols[COL_OF[i]] |= b;
    boxes[BOX_OF[i]] |= b;
  }

  let count = 0;
  let solution = null;

  function search() {
    // Клетка с наименьшим числом вариантов.
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]) & 0x3fe;
      const n = popcount(mask);
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = Array.from(g);
      return count >= limit;
    }
    if (bestCount === 0) return false;

    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rng) shuffle(digits, rng);

    const r = ROW_OF[best];
    const c = COL_OF[best];
    const bx = BOX_OF[best];
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d;
      rows[r] |= b;
      cols[c] |= b;
      boxes[bx] |= b;
      if (search()) return true;
      rows[r] &= ~b;
      cols[c] &= ~b;
      boxes[bx] &= ~b;
    }
    g[best] = 0;
    return false;
  }

  search();
  return { count, solution };
}

export function hasUniqueSolution(grid) {
  return countSolutions(grid, 2).count === 1;
}

/** Случайная полностью заполненная корректная сетка. */
export function randomSolution(rng = Math.random) {
  return countSolutions(Array(81).fill(0), 1, rng).solution;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Сетка заполнена и корректна: в каждой группе все цифры 1..9. */
export function isValidSolution(grid) {
  if (grid.length !== 81 || grid.some((d) => !(d >= 1 && d <= 9))) return false;
  return countSolutions(grid, 1).count === 1;
}
