// Перебор для судоку-киллера: считает решения (до limit) с учётом групп — сумма и неповторяющиеся цифры.
// Нужен генератору банка (единственность решения) и тестам. На каждом шаге — распространение ограничений:
// в клетке остаются цифры, разрешённые и строкой/столбцом/блоком, и её группами (cageAllowed: наборы с нужной
// суммой из оставшихся цифр); клетка с одной цифрой, цифра с одним местом в строке/столбце/блоке и обязательная
// цифра группы с одним местом ставятся сразу. Ветвление — по клетке с наименьшим числом вариантов.
// Кроме настоящих групп — «правило 45»: клетки строки/столбца/блока вне целиком лежащих в ней групп тоже
// группа с известной суммой (45 минус суммы этих групп) и разными цифрами. Перебор с ними в сотни раз короче.

import { ROW_OF, COL_OF, BOX_OF, UNITS, popcount } from './grid.js';
import { cageAllowed, COMBOS } from './cages.js';

/** Группы для перебора: настоящие + «остатки» строк/столбцов/блоков по правилу 45. */
export function constraintsOf(layout) {
  const { cages, cageOf } = layout;
  const out = cages.map((c) => ({ cells: c.cells, sum: c.sum }));
  if (!cages.length) return out;
  const seen = new Set(out.map((c) => [...c.cells].sort((a, b) => a - b).join()));
  for (const unit of UNITS) {
    const inUnit = new Set(unit);
    let inside = 0;
    const covered = new Set();
    for (const c of new Set(unit.map((i) => cageOf[i]))) {
      if (c < 0 || !cages[c].cells.every((i) => inUnit.has(i))) continue;
      inside += cages[c].sum;
      for (const i of cages[c].cells) covered.add(i);
    }
    const rest = unit.filter((i) => !covered.has(i));
    if (!rest.length || rest.length === 9) continue;
    const key = rest.join();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cells: rest, sum: 45 - inside });
  }
  return out;
}

const lowBit = (m) => 31 - Math.clz32(m & -m);

/**
 * values — цифры на доске (0 — пусто), layout — { cages, cageOf } (cageOf[i] = −1 — клетка вне групп).
 * Возвращает { count, solution, solutions, nodes, aborted } — solution: первое найденное решение или null,
 * solutions — все найденные (не больше limit); aborted — перебор превысил maxNodes (ответ неизвестен).
 */
export function countSolutions(values, layout, limit = 2, rng = null, maxNodes = Infinity) {
  const cons = constraintsOf(layout);
  const cageCells = cons.map((c) => c.cells);
  const consOf = Array.from({ length: 81 }, () => []);
  cons.forEach((c, k) => c.cells.forEach((i) => consOf[i].push(k)));
  let count = 0;
  let solution = null;
  const solutions = [];
  let nodes = 0;

  const put = (s, i, d) => {
    const b = 1 << d;
    if ((s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]) & b) return false;
    s.g[i] = d;
    s.rows[ROW_OF[i]] |= b;
    s.cols[COL_OF[i]] |= b;
    s.boxes[BOX_OF[i]] |= b;
    for (const c of consOf[i]) {
      if (s.used[c] & b) return false;
      s.used[c] |= b;
      s.rest[c] -= d;
      s.free[c] -= 1;
      if (s.free[c] === 0 ? s.rest[c] !== 0 : s.rest[c] <= 0) return false;
    }
    return true;
  };

  const init = {
    g: new Int8Array(81),
    rows: new Uint16Array(9), cols: new Uint16Array(9), boxes: new Uint16Array(9),
    used: new Uint16Array(cons.length), rest: Int16Array.from(cons.map((c) => c.sum)),
    free: Int8Array.from(cons.map((c) => c.cells.length)),
  };
  for (let i = 0; i < 81; i++) {
    if (values[i] && !put(init, i, values[i])) return { count: 0, solution: null, solutions, nodes };
  }

  const allowed = (s, i) => {
    let mask = ~(s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]) & 0x3fe;
    for (const c of consOf[i]) mask &= cageAllowed(s.free[c], s.rest[c], s.used[c]);
    return mask;
  };

  const clone = (s) => ({
    g: Int8Array.from(s.g), rows: Uint16Array.from(s.rows), cols: Uint16Array.from(s.cols), boxes: Uint16Array.from(s.boxes),
    used: Uint16Array.from(s.used), rest: Int16Array.from(s.rest), free: Int8Array.from(s.free),
  });

  /** Цифре d в клетках cells осталось одно место — поставить; ни одного — противоречие. 1 | 0 | −1 */
  const single = (s, mask, cells, d) => {
    const b = 1 << d;
    let spot = -1;
    let n = 0;
    for (const i of cells) {
      if (!s.g[i] && mask[i] & b) {
        spot = i;
        if (++n > 1) return 0;
      }
    }
    if (n === 0) return -1;
    return put(s, spot, d) ? 1 : -1;
  };

  /** Одиночки до упора. false — противоречие. */
  function propagate(s, mask) {
    for (;;) {
      let changed = false;
      for (let i = 0; i < 81; i++) {
        if (s.g[i]) continue;
        const m = allowed(s, i);
        mask[i] = m;
        if (!m) return false;
        if (!(m & (m - 1))) {
          if (!put(s, i, lowBit(m))) return false;
          changed = true;
        }
      }
      if (changed) continue;
      // наборы группы: у каждой цифры набора должно найтись место — иначе набор отпадает
      for (let c = 0; c < cageCells.length; c++) {
        if (s.free[c] < 2) continue;
        let union = 0;
        let homes = 0;
        for (const i of cageCells[c]) if (!s.g[i]) homes |= mask[i];
        for (const set of COMBOS[s.free[c]][s.rest[c]] ?? []) {
          if (set & s.used[c]) continue;
          if ((homes & set) !== set) continue;
          union |= set;
        }
        if (!union) return false;
        for (const i of cageCells[c]) {
          if (s.g[i] || !(mask[i] & ~union)) continue;
          mask[i] &= union;
          if (!mask[i]) return false;
          if (!(mask[i] & (mask[i] - 1))) {
            if (!put(s, i, lowBit(mask[i]))) return false;
            changed = true;
          }
        }
      }
      if (changed) continue;
      for (const unit of UNITS) {
        let placed = 0;
        for (const i of unit) if (s.g[i]) placed |= 1 << s.g[i];
        for (let d = 1; d <= 9; d++) {
          if (placed & (1 << d)) continue;
          const r = single(s, mask, unit, d);
          if (r < 0) return false;
          if (r > 0) changed = true;
        }
        if (changed) break;
      }
      if (changed) continue;
      for (let c = 0; c < cageCells.length && !changed; c++) {
        if (!s.free[c]) continue;
        const need = required(s.free[c], s.rest[c], s.used[c]);
        if (need < 0) return false;
        for (let d = 1; d <= 9; d++) {
          if (!(need & (1 << d))) continue;
          const r = single(s, mask, cageCells[c], d);
          if (r < 0) return false;
          if (r > 0) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return true;
    }
  }

  let aborted = false;
  function search(s) {
    if (++nodes > maxNodes) {
      aborted = true;
      return true;
    }
    const mask = new Uint16Array(81);
    if (!propagate(s, mask)) return false;
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (s.g[i]) continue;
      const n = popcount(mask[i]);
      if (n < bestCount) {
        best = i;
        bestCount = n;
        if (n <= 2) break;
      }
    }
    if (best < 0) {
      count++;
      const sol = Array.from(s.g);
      if (!solution) solution = sol;
      solutions.push(sol);
      return count >= limit;
    }
    const digits = [];
    for (let d = 1; d <= 9; d++) if (mask[best] & (1 << d)) digits.push(d);
    if (rng) shuffle(digits, rng);
    for (const d of digits) {
      const next = clone(s);
      if (put(next, best, d) && search(next)) return true;
    }
    return false;
  }

  search(init);
  return { count, solution, solutions, nodes, aborted };
}

const requiredCache = new Map();
/** Цифры, которые есть в каждом наборе группы (free клеток, недобор rest, стоят used); −1 — наборов нет. */
function required(free, rest, used) {
  const key = (free * 46 + rest) * 1024 + used;
  let need = requiredCache.get(key);
  if (need === undefined) {
    const sets = free >= 1 && rest >= 0 && rest <= 45 ? COMBOS[free][rest].filter((m) => !(m & used)) : [];
    need = sets.length ? sets.reduce((m, x) => m & x, 0x3fe) : -1;
    requiredCache.set(key, need);
  }
  return need;
}

export function hasUniqueSolution(values, layout) {
  return countSolutions(values, layout, 2).count === 1;
}

/** Случайная полностью заполненная сетка судоку (без групп). */
export function randomSolution(rng = Math.random) {
  return countSolutions(Array(81).fill(0), { cages: [], cageOf: Array(81).fill(-1) }, 1, rng).solution;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
