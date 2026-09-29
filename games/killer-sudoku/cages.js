// Клетки-«клетки» (cages) судоку-киллера: группа соседних клеток с суммой, цифры внутри не повторяются.
// Раскладка — { cages: [{ sum, cells: [i…] }], cageOf: [81] (номер клетки-группы для каждой клетки) }.
// Здесь же — таблица сочетаний: какими разными цифрами 1..9 набирается сумма в k клетках (битовые маски).

import { bit, popcount, digitsOf } from './grid.js';

// COMBOS[k][s] — маски всех наборов из k разных цифр 1..9 с суммой s (k = 1..9, s = 0..45)
export const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let mask = 0; mask < 1 << 9; mask++) {
  let sum = 0;
  let k = 0;
  for (let d = 1; d <= 9; d++) {
    if (mask & (1 << (d - 1))) {
      sum += d;
      k++;
    }
  }
  COMBOS[k][sum].push(mask << 1);                // бит d = цифра d
}

/** Наборы цифр для суммы в k клетках: [[1,2], …]. */
export function combosOf(k, sum) {
  return (COMBOS[k]?.[sum] ?? []).map(digitsOf);
}

const allowCache = new Map();

/**
 * Какие цифры ещё могут встать в свободные клетки группы: осталось free клеток, недобрано rest, уже стоят used.
 * Объединение всех наборов из free цифр с суммой rest, не задевающих used. 0 — противоречие.
 */
export function cageAllowed(free, rest, used) {
  if (free === 0) return rest === 0 ? 0 : -1;
  if (rest < 0 || rest > 45) return 0;
  const key = (free * 46 + rest) * 1024 + used;
  let mask = allowCache.get(key);
  if (mask === undefined) {
    mask = 0;
    for (const m of COMBOS[free][rest]) if (!(m & used)) mask |= m;
    allowCache.set(key, mask);
  }
  return mask;
}

/**
 * Раскладка → строка для банка: по символу на клетку, '0'–'3' = (сосед справа из той же группы ? 1 : 0) +
 * (сосед снизу из той же группы ? 2 : 0). Групп бывает за 40, поэтому не номера, а «швы»; суммы — из решения.
 */
export function cageMapText(cageOf) {
  return cageOf.map((c, i) => (i % 9 < 8 && cageOf[i + 1] === c ? 1 : 0) + (i < 72 && cageOf[i + 9] === c ? 2 : 0)).join('');
}

/** Строка «швов» и решение → { cages, cageOf }; группы нумеруются по первой клетке (сверху вниз, слева направо). */
export function cagesFromMap(map, solution) {
  const parent = Array.from({ length: 81 }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => { parent[find(b)] = find(a); };
  [...map].forEach((ch, i) => {
    const m = Number(ch);
    if (m & 1) join(i, i + 1);
    if (m & 2) join(i, i + 9);
  });
  const number = new Map();
  const cageOf = Array(81);
  const cages = [];
  for (let i = 0; i < 81; i++) {
    const root = find(i);
    if (!number.has(root)) {
      number.set(root, cages.length);
      cages.push({ sum: 0, cells: [] });
    }
    const c = number.get(root);
    cageOf[i] = c;
    cages[c].cells.push(i);
    cages[c].sum += solution[i];
  }
  return { cages, cageOf };
}

/** Запись банка: 'решение:швы' (к шву прибавляется 4, если цифра клетки открыта). */
export function encodePuzzle(solution, cageOf, givens) {
  const seams = cageMapText(cageOf);
  return `${solution.join('')}:${[...seams].map((ch, i) => Number(ch) + (givens[i] ? 4 : 0)).join('')}`;
}

/** Запись банка → { solution, givens, cages, cageOf }. */
export function decodePuzzle(text) {
  const [digits, seams] = text.split(':');
  const solution = [...digits].map(Number);
  const givens = [...seams].map((ch, i) => (Number(ch) & 4 ? solution[i] : 0));
  const { cages, cageOf } = cagesFromMap([...seams].map((ch) => Number(ch) & 3).join(''), solution);
  return { solution, givens, cages, cageOf };
}

/** cageOf по списку групп. */
export function cageIndex(cages) {
  const cageOf = Array(81).fill(-1);
  cages.forEach((cage, c) => cage.cells.forEach((i) => { cageOf[i] = c; }));
  return cageOf;
}

/** Все цифры группы в решении разные, сумма верна, группы покрывают поле ровно по разу и связны. */
export function isValidLayout(cages, solution) {
  const seen = Array(81).fill(false);
  for (const cage of cages) {
    if (!cage.cells.length || cage.cells.length > 9) return false;
    let used = 0;
    let sum = 0;
    for (const i of cage.cells) {
      if (!Number.isInteger(i) || i < 0 || i > 80 || seen[i]) return false;
      seen[i] = true;
      if (solution) {
        if (used & bit(solution[i])) return false;
        used |= bit(solution[i]);
        sum += solution[i];
      }
    }
    if (solution && sum !== cage.sum) return false;
    if (!isConnected(cage.cells)) return false;
  }
  return seen.every(Boolean);
}

export function isConnected(cells) {
  const set = new Set(cells);
  const stack = [cells[0]];
  const reached = new Set(stack);
  while (stack.length) {
    const i = stack.pop();
    for (const n of neighbours(i)) {
      if (set.has(n) && !reached.has(n)) {
        reached.add(n);
        stack.push(n);
      }
    }
  }
  return reached.size === set.size;
}

/** Соседи по стороне. */
export function neighbours(i) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const out = [];
  if (r > 0) out.push(i - 9);
  if (r < 8) out.push(i + 9);
  if (c > 0) out.push(i - 1);
  if (c < 8) out.push(i + 1);
  return out;
}

/** Сколько сочетаний у суммы в k клетках (1 — «уникальная» сумма: 3 в двух — только 1 + 2). */
export const comboCount = (k, sum) => COMBOS[k]?.[sum]?.length ?? 0;

/** Цифры, которые есть в каждом сочетании (обязательные): 17 в двух — 8 и 9. */
export function requiredDigits(k, sum) {
  const list = COMBOS[k]?.[sum] ?? [];
  if (!list.length) return 0;
  return list.reduce((m, x) => m & x, 0x3fe);
}

export { popcount };
