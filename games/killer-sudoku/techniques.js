// Логические приёмы судоку-киллера — для подсказок и оценки сложности. Кандидаты (что ещё может стоять в клетке)
// считаются по цифрам на доске, как в судоку; всё, что даёт сумма группы, — отдельные шаги (игроку их объясняют):
//   расстановка: cageLast (последняя клетка группы) | innie | outie (правило 45) | lastCell | hiddenSingle | nakedSingle
//                → { cell, digit, … }
//   исключение:  cageCombo (сочетания суммы) | cageHouse (обязательная цифра группы внутри строки/столбца/блока) |
//                pointing | boxLine | nakedPair | nakedTriple | hiddenPair | hiddenTriple | xWing
//                → { eliminations: [{ cell, digit }], cells, … }
// Сложность приёма (LEVEL) — лестница из разборов SudokuWiki и Logic Wiz: 1 — одиночки и последняя клетка группы;
// 2 — сочетания суммы; 3 — правило 45 по одной строке/столбцу/блоку, обязательная цифра группы, пересечения, пары;
// 4 — правило 45 по нескольким линиям и «невидимые» группы, тройки, скрытые пары и тройки, X-крыло.

import { UNITS, PEERS, ROW_OF, COL_OF, BOX_OF, rowUnit, colUnit, boxUnit, bit, popcount, digitsOf, ALL_DIGITS } from './grid.js';
import { COMBOS } from './cages.js';

export const LEVEL = {
  cageLast: 1,
  lastCell: 1,
  hiddenSingle: 1,
  nakedSingle: 1,
  cageCombo: 2,
  innie: 3,
  outie: 3,
  pointing: 3,
  boxLine: 3,
  cageHouse: 3,
  nakedPair: 3,
  innieMulti: 4,
  outieMulti: 4,
  innieCage: 4,
  outieCage: 4,
  nakedTriple: 4,
  hiddenPair: 4,
  hiddenTriple: 4,
  xWing: 4,
};
export const MAX_LEVEL = 4;

const PLACEMENTS = new Set(['cageLast', 'innie', 'outie', 'innieMulti', 'outieMulti', 'lastCell', 'hiddenSingle', 'nakedSingle']);
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

// ---------- группы: что ещё возможно ----------

/** Свободные клетки группы, недобор суммы и уже стоящие цифры. */
export function cageState(grid, cage) {
  let rest = cage.sum;
  let used = 0;
  const empty = [];
  for (const i of cage.cells) {
    if (grid[i]) {
      rest -= grid[i];
      used |= bit(grid[i]);
    } else {
      empty.push(i);
    }
  }
  return { rest, used, empty };
}

/**
 * Какие цифры реально возможны в каждой свободной клетке группы с учётом кандидатов: цифра d в клетке x
 * возможна, если найдётся расстановка разных цифр по всем свободным клеткам из их кандидатов с нужной суммой,
 * где в x стоит d. Возвращает { allow: Map(клетка → маска), sets: [маски подходящих наборов] }.
 */
export function cagePossible(grid, cand, cage) {
  const { rest, used, empty } = cageState(grid, cage);
  const allow = new Map(empty.map((i) => [i, 0]));
  const sets = [];
  if (!empty.length) return { allow, sets, empty, rest };
  for (const set of COMBOS[empty.length]?.[rest] ?? []) {
    if (set & used) continue;
    // расстановки набора по клеткам: перебор с отсечением по кандидатам
    const assign = [];
    let any = false;
    const place = (k, left) => {
      if (k === empty.length) {
        any = true;
        empty.forEach((i, n) => allow.set(i, allow.get(i) | bit(assign[n])));
        return;
      }
      const i = empty[k];
      for (const d of digitsOf(left & cand[i])) {
        assign[k] = d;
        place(k + 1, left & ~bit(d));
      }
    };
    place(0, set);
    if (any) sets.push(set);
  }
  return { allow, sets, empty, rest };
}

// ---------- расстановки ----------

function findCageLast(grid, cand, layout) {
  for (const [c, cage] of layout.cages.entries()) {
    const { rest, empty } = cageState(grid, cage);
    if (empty.length !== 1 || rest < 1 || rest > 9) continue;
    if (!(cand[empty[0]] & bit(rest))) continue;
    return { type: 'cageLast', cell: empty[0], digit: rest, cage: c };
  }
  return null;
}

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

// Правило 45: в любой строке, столбце и блоке сумма цифр — 45 (в n строках подряд — 45·n).
// «Внутри» (innie): группы, целиком лежащие в области, дают сумму; оставшиеся клетки области добирают до 45·n.
// «Снаружи» (outie): группы, задевающие область, вместе больше 45·n ровно на клетки, торчащие наружу.
// Шаг — когда такая «лишняя» часть — одна пустая клетка: её цифра считается.
const REGIONS_1 = Array.from({ length: 27 }, (_, u) => ({ units: [u], cells: UNITS[u] }));
const REGIONS_MULTI = [];
for (const [lineUnit] of [[rowUnit], [colUnit]]) {
  for (let start = 0; start < 9; start++) {
    for (const len of [2, 3]) {
      if (start + len > 9) continue;
      const units = Array.from({ length: len }, (_, k) => lineUnit(start + k));
      REGIONS_MULTI.push({ units, cells: units.flatMap((u) => UNITS[u]) });
    }
  }
}

function lawOf45(grid, cand, layout, regions, multi) {
  const { cages, cageOf } = layout;
  for (const region of regions) {
    const inRegion = new Set(region.cells);
    const total = 45 * region.units.length;
    const touching = [...new Set(region.cells.map((i) => cageOf[i]))];
    const inside = touching.filter((c) => cages[c].cells.every((i) => inRegion.has(i)));
    const insideCells = new Set(inside.flatMap((c) => cages[c].cells));

    // innie: клетки области вне «внутренних» групп
    const innies = region.cells.filter((i) => !insideCells.has(i));
    const innieEmpty = innies.filter((i) => !grid[i]);
    if (innieEmpty.length === 1) {
      const known = innies.reduce((s, i) => s + grid[i], 0);
      const digit = total - inside.reduce((s, c) => s + cages[c].sum, 0) - known;
      const cell = innieEmpty[0];
      if (digit >= 1 && digit <= 9 && cand[cell] & bit(digit)) {
        return { type: multi ? 'innieMulti' : 'innie', cell, digit, units: region.units, inside, innies };
      }
    }
    // outie: клетки задевающих групп вне области
    const outies = touching.flatMap((c) => cages[c].cells.filter((i) => !inRegion.has(i)));
    const outieEmpty = outies.filter((i) => !grid[i]);
    if (outieEmpty.length === 1 && outies.length <= 6) {
      const known = outies.reduce((s, i) => s + grid[i], 0);
      const digit = touching.reduce((s, c) => s + cages[c].sum, 0) - total - known;
      const cell = outieEmpty[0];
      if (digit >= 1 && digit <= 9 && cand[cell] & bit(digit)) {
        return { type: multi ? 'outieMulti' : 'outie', cell, digit, units: region.units, touching, outies };
      }
    }
  }
  return null;
}

/**
 * Правило 45 для нескольких клеток: «лишние» клетки области (2–4 пустые) вместе дают известную сумму и все
 * разные (лежат в одной строке/столбце/блоке или в одной группе) — это та же группа, только невидимая;
 * к ней применяются сочетания суммы.
 */
function findVirtualCage(grid, cand, layout) {
  const { cages, cageOf } = layout;
  for (const region of REGIONS_1) {
    const inRegion = new Set(region.cells);
    const touching = [...new Set(region.cells.map((i) => cageOf[i]))];
    const inside = touching.filter((c) => cages[c].cells.every((i) => inRegion.has(i)));
    const insideCells = new Set(inside.flatMap((c) => cages[c].cells));
    const innies = region.cells.filter((i) => !insideCells.has(i));
    const outies = touching.flatMap((c) => cages[c].cells.filter((i) => !inRegion.has(i)));
    const variants = [
      ['innieCage', innies, 45 - inside.reduce((s, c) => s + cages[c].sum, 0)],
      ['outieCage', outies, touching.reduce((s, c) => s + cages[c].sum, 0) - 45],
    ];
    for (const [type, cells, sum] of variants) {
      const empty = cells.filter((i) => !grid[i]);
      if (empty.length < 2 || empty.length > 4 || cells.length > 6) continue;
      if (!allDistinct(cells, cageOf)) continue;
      const virtual = { sum, cells };
      const { allow, sets, rest } = cagePossible(grid, cand, virtual);
      const eliminations = [];
      for (const i of empty) for (const d of digitsOf(cand[i] & ~allow.get(i))) eliminations.push({ cell: i, digit: d });
      if (eliminations.length) {
        return { type, units: region.units, inside, touching, virtual, cells: empty, rest, sets, eliminations, allow };
      }
    }
  }
  return null;
}

/** Цифры в клетках обязаны быть разными: все в одной строке/столбце/блоке или в одной группе. */
function allDistinct(cells, cageOf) {
  if (cells.every((i) => cageOf[i] === cageOf[cells[0]])) return true;
  return UNITS.some((unit) => cells.every((i) => unit.includes(i)));
}

// ---------- исключения ----------

function elimsFor(cells, digit, cand, except) {
  return cells.filter((i) => !except.includes(i) && cand[i] & bit(digit)).map((cell) => ({ cell, digit }));
}

/** Сочетания суммы: в клетках группы остаются только цифры, из которых сумма реально набирается. */
function findCageCombo(grid, cand, layout) {
  let best = null;
  for (const [c, cage] of layout.cages.entries()) {
    const { allow, sets, empty, rest } = cagePossible(grid, cand, cage);
    if (!empty.length) continue;
    const eliminations = [];
    for (const i of empty) for (const d of digitsOf(cand[i] & ~allow.get(i))) eliminations.push({ cell: i, digit: d });
    if (!eliminations.length) continue;
    // объяснять проще группу с меньшим числом наборов — её и берём первой
    const step = { type: 'cageCombo', cage: c, cells: empty, rest, sets, eliminations, allow };
    if (!best || sets.length < best.sets.length || (sets.length === best.sets.length && empty.length < best.cells.length)) best = step;
  }
  return best;
}

/**
 * Обязательная цифра группы: цифра есть в каждом подходящем наборе группы, а все клетки группы, где она может
 * стоять, — в одной строке/столбце/блоке → в остальных клетках этой строки/столбца/блока её нет.
 */
function findCageHouse(grid, cand, layout) {
  for (const [c, cage] of layout.cages.entries()) {
    const { allow, sets, empty } = cagePossible(grid, cand, cage);
    if (empty.length < 2 || !sets.length) continue;
    const required = sets.reduce((m, s) => m & s, ALL_DIGITS);
    for (const d of digitsOf(required)) {
      const holders = empty.filter((i) => allow.get(i) & bit(d));
      if (!holders.length) continue;
      for (const u of UNIT_ORDER) {
        if (!holders.every((i) => UNITS[u].includes(i))) continue;
        const eliminations = elimsFor(UNITS[u], d, cand, cage.cells);
        if (eliminations.length) return { type: 'cageHouse', cage: c, digit: d, unit: u, cells: holders, eliminations };
      }
    }
  }
  return null;
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
  ['cageLast', findCageLast],
  ['lastCell', (g) => findLastCell(g)],
  ['hiddenSingle', findHiddenSingle],
  ['nakedSingle', findNakedSingle],
  ['cageCombo', findCageCombo],
  ['innie', (g, c, l) => lawOf45(g, c, l, REGIONS_1, false)],
  ['pointing', findPointing],
  ['boxLine', findBoxLine],
  ['cageHouse', findCageHouse],
  ['nakedPair', (g, c) => findNakedSubset(g, c, 2)],
  ['innieMulti', (g, c, l) => lawOf45(g, c, l, REGIONS_MULTI, true)],
  ['innieCage', findVirtualCage],
  ['nakedTriple', (g, c) => findNakedSubset(g, c, 3)],
  ['hiddenPair', (g, c) => findHiddenSubset(g, c, 2)],
  ['hiddenTriple', (g, c) => findHiddenSubset(g, c, 3)],
  ['xWing', findXWing],
];

export function findStep(grid, cand, layout, maxLevel = MAX_LEVEL) {
  for (const [type, find] of FINDERS) {
    if (LEVEL[type] > maxLevel) continue;
    const step = find(grid, cand, layout);
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
 * Решает только логикой. { solved, level (самый сложный понадобившийся приём), steps, grid }.
 * onStep(step, grid, cand) вызывается перед применением каждого шага — для тестов.
 */
export function logicalSolve(input, layout, { maxLevel = MAX_LEVEL, onStep } = {}) {
  const grid = Array.from(input);
  const cand = candidatesFor(grid);
  let level = 0;
  let steps = 0;
  const used = new Set();
  for (;;) {
    const step = findStep(grid, cand, layout, maxLevel);
    if (!step) break;
    onStep?.(step, grid, cand);
    level = Math.max(level, LEVEL[step.type]);
    used.add(step.type);
    steps++;
    applyStep(step, grid, cand);
  }
  return { solved: grid.every(Boolean), level, steps, used, grid };
}

/** Можно ли по текущим кандидатам сделать именно эту расстановку. */
function placementHolds(step, grid, cand, layout) {
  if (grid[step.cell] || !(cand[step.cell] & bit(step.digit))) return false;
  switch (step.type) {
    case 'cageLast': return cageState(grid, layout.cages[step.cage]).empty.length === 1;
    case 'lastCell': return UNITS[step.unit].filter((i) => !grid[i]).length === 1;
    case 'nakedSingle': return popcount(cand[step.cell]) === 1;
    case 'hiddenSingle': return UNITS[step.unit].filter((i) => cand[i] & bit(step.digit)).length === 1;
    default: return true;                 // правило 45 от кандидатов не зависит
  }
}

/**
 * Следующая подсказка для позиции: { chain: [шаги-исключения], step: расстановка } или null.
 * Из цепочки выкидываются исключения, без которых расстановка всё равно получается.
 */
export function nextHint(input, layout, maxLevel = MAX_LEVEL) {
  const grid = Array.from(input);
  const cand = candidatesFor(grid);
  const chain = [];
  for (;;) {
    const step = findStep(grid, cand, layout, maxLevel);
    if (!step) return null;
    if (isPlacement(step)) return { chain: pruneChain(input, chain, step, layout), step };
    chain.push(step);
    applyStep(step, grid, cand);
  }
}

/** Выполняется ли условие приёма-исключения при текущих кандидатах (для чистки цепочки). */
function eliminationHolds(step, grid, cand, layout) {
  const withDigit = (u, d) => UNITS[u].filter((i) => cand[i] & bit(d));
  const inside = (cells, u) => cells.every((i) => UNITS[u].includes(i));
  switch (step.type) {
    case 'cageCombo': {
      const { allow } = cagePossible(grid, cand, layout.cages[step.cage]);
      return step.eliminations.every(({ cell, digit }) => !(allow.get(cell) & bit(digit)));
    }
    case 'innieCage':
    case 'outieCage': {
      const { allow } = cagePossible(grid, cand, step.virtual);
      return step.eliminations.every(({ cell, digit }) => !(allow.get(cell) & bit(digit)));
    }
    case 'cageHouse': {
      const { allow, sets } = cagePossible(grid, cand, layout.cages[step.cage]);
      const required = sets.reduce((m, s) => m & s, ALL_DIGITS);
      if (!sets.length || !(required & bit(step.digit))) return false;
      return [...allow].filter(([, m]) => m & bit(step.digit)).every(([i]) => UNITS[step.unit].includes(i));
    }
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

function pruneChain(input, chain, step, layout) {
  let kept = [...chain];
  for (let k = kept.length - 1; k >= 0; k--) {
    const without = kept.filter((_, j) => j !== k);
    const grid = Array.from(input);
    const cand = candidatesFor(grid);
    let valid = true;
    for (const s of without) {
      if (!eliminationHolds(s, grid, cand, layout)) {
        valid = false;
        break;
      }
      applyStep(s, grid, cand);
    }
    if (valid && placementHolds(step, grid, cand, layout)) kept = without;
  }
  return kept;
}
