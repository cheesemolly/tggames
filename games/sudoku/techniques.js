// Логические приёмы решения судоку — для подсказок и для оценки сложности сетки.
// Работают с кандидатами (что ещё может стоять в клетке), считанными только по цифрам на доске —
// заметки игрока не учитываются, чтобы подсказка не зависела от его ошибок в заметках.
//
// Шаг — объект { type, ... }:
//   расстановка: lastCell | hiddenSingle | nakedSingle  → { cell, digit, unit? }
//   исключение:  pointing | boxLine | nakedPair | nakedTriple | hiddenPair | hiddenTriple | xWing
//                → { eliminations: [{ cell, digit }], cells, unit/…, digit(s) }
// Сложность приёма (LEVEL): 1 — одиночки, 2 — пары и пересечения, 3 — скрытые группы и X-крыло.

import { UNITS, PEERS, ROW_OF, COL_OF, BOX_OF, rowUnit, colUnit, boxUnit, bit, popcount, digitsOf, ALL_DIGITS } from './grid.js';

export const LEVEL = {
  lastCell: 1,
  hiddenSingle: 1,
  nakedSingle: 1,
  pointing: 2,
  boxLine: 2,
  nakedPair: 2,
  nakedTriple: 2,
  hiddenPair: 3,
  hiddenTriple: 3,
  xWing: 3,
};

const PLACEMENTS = new Set(['lastCell', 'hiddenSingle', 'nakedSingle']);
export const isPlacement = (step) => PLACEMENTS.has(step.type);

export function candidatesFor(grid) {
  const cand = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    let mask = ALL_DIGITS;
    for (const p of PEERS[i]) if (grid[p]) mask &= ~bit(grid[p]);
    cand[i] = mask;
  }
  return cand;
}

function unitPlaced(grid, u) {
  let mask = 0;
  for (const i of UNITS[u]) if (grid[i]) mask |= bit(grid[i]);
  return mask;
}

function combos(arr, k, start = 0, acc = [], out = []) {
  if (acc.length === k) {
    out.push([...acc]);
    return out;
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    combos(arr, k, i + 1, acc, out);
    acc.pop();
  }
  return out;
}

// ---------- расстановки ----------

function findLastCell(grid) {
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u].filter((i) => !grid[i]);
    if (empty.length !== 1) continue;
    const [digit] = digitsOf(ALL_DIGITS & ~unitPlaced(grid, u));
    if (digit) return { type: 'lastCell', cell: empty[0], digit, unit: u };
  }
  return null;
}

// Блоки — первыми: «единственное место в блоке» замечают легче, чем в строке.
const UNIT_ORDER = [...Array.from({ length: 9 }, (_, b) => boxUnit(b)), ...Array.from({ length: 18 }, (_, u) => u)];

function findHiddenSingle(grid, cand) {
  for (const u of UNIT_ORDER) {
    const placed = unitPlaced(grid, u);
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const cells = UNITS[u].filter((i) => cand[i] & bit(d));
      if (cells.length === 1) return { type: 'hiddenSingle', cell: cells[0], digit: d, unit: u };
    }
  }
  return null;
}

function findNakedSingle(grid, cand) {
  for (let i = 0; i < 81; i++) {
    if (!grid[i] && popcount(cand[i]) === 1) return { type: 'nakedSingle', cell: i, digit: digitsOf(cand[i])[0] };
  }
  return null;
}

// ---------- исключения ----------

function elimsFor(cells, digit, cand, except) {
  return cells.filter((i) => !except.includes(i) && cand[i] & bit(digit)).map((cell) => ({ cell, digit }));
}

/** Указывающая пара/тройка: в блоке цифра только в одной строке/столбце → убрать из остальной линии. */
function findPointing(grid, cand) {
  for (let b = 0; b < 9; b++) {
    const box = UNITS[boxUnit(b)];
    for (let d = 1; d <= 9; d++) {
      const cells = box.filter((i) => cand[i] & bit(d));
      if (cells.length < 2 || cells.length > 3) continue;
      for (const [of, toUnit] of [[ROW_OF, rowUnit], [COL_OF, colUnit]]) {
        if (!cells.every((i) => of[i] === of[cells[0]])) continue;
        const line = toUnit(of[cells[0]]);
        const eliminations = elimsFor(UNITS[line], d, cand, box);
        if (eliminations.length) return { type: 'pointing', digit: d, unit: boxUnit(b), line, cells, eliminations };
      }
    }
  }
  return null;
}

/** Блок и линия: в строке/столбце цифра только внутри одного блока → убрать из остального блока. */
function findBoxLine(grid, cand) {
  for (let u = 0; u < 18; u++) {
    const line = UNITS[u];
    for (let d = 1; d <= 9; d++) {
      const cells = line.filter((i) => cand[i] & bit(d));
      if (cells.length < 2 || cells.length > 3) continue;
      if (!cells.every((i) => BOX_OF[i] === BOX_OF[cells[0]])) continue;
      const box = boxUnit(BOX_OF[cells[0]]);
      const eliminations = elimsFor(UNITS[box], d, cand, line);
      if (eliminations.length) return { type: 'boxLine', digit: d, unit: u, box, cells, eliminations };
    }
  }
  return null;
}

/** Открытая пара/тройка: n клеток группы на n цифр → эти цифры убрать из остальных клеток группы. */
function findNakedSubset(grid, cand, size) {
  for (let u = 0; u < 27; u++) {
    const pool = UNITS[u].filter((i) => !grid[i] && popcount(cand[i]) >= 2 && popcount(cand[i]) <= size);
    for (const cells of combos(pool, size)) {
      const mask = cells.reduce((m, i) => m | cand[i], 0);
      if (popcount(mask) !== size) continue;
      const eliminations = [];
      for (const i of UNITS[u]) {
        if (cells.includes(i) || !(cand[i] & mask)) continue;
        for (const d of digitsOf(cand[i] & mask)) eliminations.push({ cell: i, digit: d });
      }
      if (eliminations.length) {
        return { type: size === 2 ? 'nakedPair' : 'nakedTriple', unit: u, cells, digits: mask, eliminations };
      }
    }
  }
  return null;
}

/** Скрытая пара/тройка: n цифр группы помещаются только в n клеток → прочие кандидаты этих клеток убрать. */
function findHiddenSubset(grid, cand, size) {
  for (let u = 0; u < 27; u++) {
    const free = digitsOf(ALL_DIGITS & ~unitPlaced(grid, u));
    for (const digits of combos(free, size)) {
      const mask = digits.reduce((m, d) => m | bit(d), 0);
      const cells = UNITS[u].filter((i) => cand[i] & mask);
      if (cells.length !== size) continue;
      if (!digits.every((d) => cells.some((i) => cand[i] & bit(d)))) continue;
      const eliminations = [];
      for (const i of cells) for (const d of digitsOf(cand[i] & ~mask)) eliminations.push({ cell: i, digit: d });
      if (eliminations.length) {
        return { type: size === 2 ? 'hiddenPair' : 'hiddenTriple', unit: u, cells, digits: mask, eliminations };
      }
    }
  }
  return null;
}

/** X-крыло: в двух строках цифра только в тех же двух столбцах → убрать из остальных клеток этих столбцов (и наоборот). */
function findXWing(grid, cand) {
  for (let d = 1; d <= 9; d++) {
    for (const [lineUnit, crossOf, crossUnit] of [[rowUnit, COL_OF, colUnit], [colUnit, ROW_OF, rowUnit]]) {
      const pairs = [];
      for (let n = 0; n < 9; n++) {
        const cells = UNITS[lineUnit(n)].filter((i) => cand[i] & bit(d));
        if (cells.length === 2) pairs.push({ line: lineUnit(n), cells, cross: cells.map((i) => crossOf[i]) });
      }
      for (const [a, b] of combos(pairs, 2)) {
        if (a.cross[0] !== b.cross[0] || a.cross[1] !== b.cross[1]) continue;
        const cells = [...a.cells, ...b.cells];
        const crosses = a.cross.map(crossUnit);
        const eliminations = crosses.flatMap((cu) => elimsFor(UNITS[cu], d, cand, cells));
        if (eliminations.length) return { type: 'xWing', digit: d, lines: [a.line, b.line], crosses, cells, eliminations };
      }
    }
  }
  return null;
}

// Порядок — от простого к сложному: подсказка и оценка всегда берут самый простой доступный приём.
const FINDERS = [
  ['lastCell', (g) => findLastCell(g)],
  ['hiddenSingle', findHiddenSingle],
  ['nakedSingle', findNakedSingle],
  ['pointing', findPointing],
  ['boxLine', findBoxLine],
  ['nakedPair', (g, c) => findNakedSubset(g, c, 2)],
  ['nakedTriple', (g, c) => findNakedSubset(g, c, 3)],
  ['hiddenPair', (g, c) => findHiddenSubset(g, c, 2)],
  ['hiddenTriple', (g, c) => findHiddenSubset(g, c, 3)],
  ['xWing', findXWing],
];

export function findStep(grid, cand, maxLevel = 3) {
  for (const [type, find] of FINDERS) {
    if (LEVEL[type] > maxLevel) continue;
    const step = find(grid, cand);
    if (step) return step;
  }
  return null;
}

export function placeDigit(grid, cand, cell, digit) {
  grid[cell] = digit;
  cand[cell] = 0;
  for (const p of PEERS[cell]) cand[p] &= ~bit(digit);
}

export function applyStep(step, grid, cand) {
  if (isPlacement(step)) placeDigit(grid, cand, step.cell, step.digit);
  else for (const { cell, digit } of step.eliminations) cand[cell] &= ~bit(digit);
}

/**
 * Решает только логикой. { solved, level (самый сложный понадобившийся приём), grid }.
 * onStep(step, grid, cand) вызывается перед применением каждого шага — для тестов.
 */
export function logicalSolve(input, { maxLevel = 3, onStep } = {}) {
  const grid = Array.from(input);
  const cand = candidatesFor(grid);
  let level = 0;
  for (;;) {
    const step = findStep(grid, cand, maxLevel);
    if (!step) break;
    onStep?.(step, grid, cand);
    level = Math.max(level, LEVEL[step.type]);
    applyStep(step, grid, cand);
  }
  return { solved: grid.every(Boolean), level, grid };
}

/** Можно ли по текущим кандидатам сделать именно эту расстановку. */
function placementHolds(step, grid, cand) {
  if (grid[step.cell] || !(cand[step.cell] & bit(step.digit))) return false;
  if (step.type === 'lastCell') return UNITS[step.unit].filter((i) => !grid[i]).length === 1;
  if (step.type === 'nakedSingle') return popcount(cand[step.cell]) === 1;
  return UNITS[step.unit].filter((i) => cand[i] & bit(step.digit)).length === 1;
}

/**
 * Следующая подсказка для позиции: { chain: [шаги-исключения], step: расстановка } или null.
 * Из цепочки выкидываются исключения, без которых расстановка всё равно получается.
 */
export function nextHint(input, maxLevel = 3) {
  const grid = Array.from(input);
  const cand = candidatesFor(grid);
  const chain = [];
  for (;;) {
    const step = findStep(grid, cand, maxLevel);
    if (!step) return null;
    if (isPlacement(step)) return { chain: pruneChain(input, chain, step), step };
    chain.push(step);
    applyStep(step, grid, cand);
  }
}

/** Выполняется ли условие приёма-исключения при текущих кандидатах (для чистки цепочки). */
function eliminationHolds(step, cand) {
  const withDigit = (u, d) => UNITS[u].filter((i) => cand[i] & bit(d));
  const inside = (cells, u) => cells.every((i) => UNITS[u].includes(i));
  switch (step.type) {
    case 'pointing': return inside(withDigit(step.unit, step.digit), step.line);
    case 'boxLine': return inside(withDigit(step.unit, step.digit), step.box);
    case 'nakedPair':
    case 'nakedTriple':
      return step.cells.every((i) => cand[i] && !(cand[i] & ~step.digits));
    case 'hiddenPair':
    case 'hiddenTriple':
      return UNITS[step.unit].filter((i) => cand[i] & step.digits).every((i) => step.cells.includes(i));
    case 'xWing':
      return step.lines.every((u) => withDigit(u, step.digit).every((i) => step.cells.includes(i)));
    default: return false;
  }
}

/**
 * Убирает из цепочки шаги, без которых расстановка всё равно получается. Шаг выкидывается, только если
 * все оставшиеся шаги по-прежнему выполняются — иначе объяснение ссылалось бы на невидимый вывод.
 */
function pruneChain(input, chain, step) {
  let kept = [...chain];
  for (let k = kept.length - 1; k >= 0; k--) {
    const without = kept.filter((_, j) => j !== k);
    const grid = Array.from(input);
    const cand = candidatesFor(grid);
    let valid = true;
    for (const s of without) {
      if (!eliminationHolds(s, cand)) {
        valid = false;
        break;
      }
      applyStep(s, grid, cand);
    }
    if (valid && placementHolds(step, grid, cand)) kept = without;
  }
  return kept;
}
