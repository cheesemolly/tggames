// Генератор судоку-киллера (запускается заранее скриптом tools/generate-bank.js, не в браузере) и перемешивание
// готовой сетки (в браузере, при каждой новой партии).
//
// 1) Случайная полная сетка судоку.
// 2) Разбиение на группы: группа начинается с самой «зажатой» свободной клетки (края поля и занятые соседи —
//    иначе в углах остаются одиночки, приём из ksudoku) и растёт по соседям без повторов цифр до случайного
//    размера из распределения.
// 3) Суммы — из решения. Решение неединственное — два решения сравниваются, группа с расходящейся клеткой
//    делится (сначала крупные: разрез пары даёт две одиночки).
// 4) Сложность — как на sudoku.com (разбор 120 их сеток): размеры групп на всех уровнях почти одинаковые (в
//    среднем 2,45 клетки), сложность задают открытые цифры. У нас их открывается ровно столько, чтобы сетка
//    решалась приёмами своего уровня (techniques.js, LEVEL), — и самый сложный из них всё же понадобился.

import { countSolutions, randomSolution, shuffle } from './solver.js';
import { cageIndex, neighbours, isConnected } from './cages.js';
import { logicalSolve, LEVEL, MAX_LEVEL } from './techniques.js';
import { bit } from './grid.js';

// Сложности:
//   maxLevel   — какие приёмы разрешены; нужен хотя бы один приём этого уровня (иначе это уровень попроще);
//   givens     — сколько цифр можно открыть; minGivens — открыть не меньше (добираются случайными: у sudoku.com в
//                лёгком 31 цифра, в среднем 26 — так партия короче и приятнее); maxSingles — одиночных групп не больше;
//   sizes      — веса размеров групп 1..6 (у эксперта группы чуть крупнее).
const SIZES = [0.03, 0.55, 0.3, 0.09, 0.03, 0];
export const DIFFICULTY_RULES = {
  easy: { sizes: SIZES, maxLevel: 1, givens: 40, minGivens: 24, maxSingles: 4 },
  medium: { sizes: SIZES, maxLevel: 2, givens: 30, minGivens: 10, maxSingles: 4 },
  hard: { sizes: SIZES, maxLevel: 3, givens: 8, minGivens: 0, maxSingles: 4 },
  expert: { sizes: [0.02, 0.45, 0.32, 0.13, 0.06, 0.02], maxLevel: 4, givens: 0, minGivens: 0, maxSingles: 3 },
};

const EMPTY = Array(81).fill(0);

/** Оценка: { solved, level (самый сложный понадобившийся приём), score (приёмы уровней 2/3/4 — 1/3/8 очков), grid }. */
export function rateLayout(layout, givens = EMPTY, maxLevel = MAX_LEVEL) {
  let score = 0;
  const { solved, level, grid } = logicalSolve(givens, layout, {
    maxLevel,
    onStep: (step) => { score += [0, 0, 1, 3, 8][LEVEL[step.type]]; },
  });
  return { solved, level, score, grid };
}

/**
 * Открыть цифры под сложность: пока приёмами rule.maxLevel не решается, открывается случайная клетка из тех,
 * на которых решатель застрял. { givens, rating } или null (цифр не хватило или сетка для уровня слишком простая).
 */
export function fitDifficulty(layout, solution, rule, rng = Math.random) {
  if (layout.cages.filter((c) => c.cells.length === 1).length > rule.maxSingles) return null;
  const givens = Array(81).fill(0);
  for (let n = 0; ; n++) {
    const rating = rateLayout(layout, givens, rule.maxLevel);
    if (rating.solved) break;
    if (n >= rule.givens) return null;
    const stuck = rating.grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const cell = stuck[Math.floor(rng() * stuck.length)];
    givens[cell] = solution[cell];
  }
  // добрать до минимума — не в одиночных группах (там цифра и так известна)
  const open = shuffle(givens.map((v, i) => (!v && layout.cages[layout.cageOf[i]].cells.length > 1 ? i : -1))
    .filter((i) => i >= 0), rng);
  for (let n = givens.filter(Boolean).length; n < rule.minGivens && open.length; n++) {
    const cell = open.pop();
    givens[cell] = solution[cell];
  }
  const rating = rateLayout(layout, givens, rule.maxLevel);
  return rating.solved && rating.level === rule.maxLevel ? { givens, rating } : null;
}

function pickSize(weights, rng) {
  let x = rng();
  for (let k = 0; k < weights.length; k++) {
    x -= weights[k];
    if (x <= 0) return k + 1;
  }
  return 2;
}

/** Разбиение поля на группы: [[клетки…], …]. */
export function partition(solution, weights, rng = Math.random) {
  const owner = Array(81).fill(-1);
  const groups = [];
  const closed = (i) => 4 - neighbours(i).filter((n) => owner[n] < 0).length;
  for (let left = 81; left > 0;) {
    let start = -1;
    let best = -1;
    let ties = 0;
    for (let i = 0; i < 81; i++) {
      if (owner[i] >= 0) continue;
      const k = closed(i);
      if (k > best) {
        best = k;
        start = i;
        ties = 1;
      } else if (k === best && rng() < 1 / ++ties) {
        start = i;
      }
    }
    const target = pickSize(weights, rng);
    const cells = [start];
    let used = bit(solution[start]);
    owner[start] = groups.length;
    while (cells.length < target) {
      const options = [];
      for (const i of cells) {
        for (const n of neighbours(i)) {
          if (owner[n] < 0 && !(used & bit(solution[n])) && !options.includes(n)) options.push(n);
        }
      }
      if (!options.length) break;
      const next = options[Math.floor(rng() * options.length)];
      cells.push(next);
      used |= bit(solution[next]);
      owner[next] = groups.length;
    }
    left -= cells.length;
    groups.push(cells);
  }
  // одиночки сверх задуманного (группе некуда было расти) приклеиваем к соседней группе без повторов
  for (let g = 0; g < groups.length; g++) {
    if (groups[g].length !== 1 || rng() < weights[0]) continue;
    const i = groups[g][0];
    const host = neighbours(i).map((n) => owner[n]).find((o) => o !== g && groups[o].length < 6
      && !groups[o].some((k) => solution[k] === solution[i]));
    if (host === undefined) continue;
    groups[host].push(i);
    groups[g] = [];
    owner[i] = host;
  }
  return groups.filter((cells) => cells.length);
}

function toLayout(groups, solution) {
  const cages = groups.map((cells) => ({ sum: cells.reduce((s, i) => s + solution[i], 0), cells: [...cells].sort((a, b) => a - b) }));
  return { cages, cageOf: cageIndex(cages) };
}

/** Разрезать группу на две связные части по клетке split (клетка уходит в меньшую часть). */
function splitGroup(cells, split, rng) {
  if (cells.length < 2) return null;
  const set = new Set(cells);
  // растим часть от split, пока она не станет примерно половиной, и проверяем связность остатка
  for (let attempt = 0; attempt < 12; attempt++) {
    const part = [split];
    const want = Math.max(1, Math.floor(cells.length / 2) - (attempt % 2));
    while (part.length < want) {
      const options = part.flatMap((i) => neighbours(i)).filter((n) => set.has(n) && !part.includes(n));
      if (!options.length) break;
      part.push(options[Math.floor(rng() * options.length)]);
    }
    const rest = cells.filter((i) => !part.includes(i));
    if (rest.length && isConnected(rest) && isConnected(part)) return [part, rest];
  }
  return [[split], cells.filter((i) => i !== split)].every((p) => p.length && isConnected(p))
    ? [[split], cells.filter((i) => i !== split)] : null;
}

// Бюджет перебора на одну проверку единственности: редкие разбиения требуют миллионов шагов — их выбрасываем.
export const UNIQUE_BUDGET = 20000;

/**
 * Раскладка с единственным решением: пока решений два, группа клетки, где они расходятся, делится надвое.
 * Возвращает { layout, groups } или null (не удалось).
 */
export function makeUnique(groups0, solution, rng = Math.random, limit = 40, maxNodes = UNIQUE_BUDGET) {
  const groups = groups0.map((g) => [...g]);
  for (let k = 0; k < limit; k++) {
    const layout = toLayout(groups, solution);
    const res = countSolutions(Array(81).fill(0), layout, 2, null, maxNodes);
    if (res.aborted) return null;                 // перебор слишком долгий — проще взять другое разбиение
    if (res.count === 1) return { layout, groups };
    if (res.count === 0) return null;
    // второе решение: сравниваем с настоящим и режем группу, где разница
    const other = res.solutions.find((sol) => sol.some((d, i) => d !== solution[i]));
    if (!other) return null;
    // сначала крупные группы: разрез группы из двух клеток даёт две одиночки
    const sizeOf = (i) => groups.find((cells) => cells.includes(i)).length;
    const diff = shuffle(other.map((d, i) => (d !== solution[i] ? i : -1)).filter((i) => i >= 0), rng)
      .sort((a, b) => sizeOf(b) - sizeOf(a));
    let done = false;
    for (const cell of diff) {
      const g = groups.findIndex((cells) => cells.includes(cell));
      if (groups[g].length < 2) continue;
      const parts = splitGroup(groups[g], cell, rng);
      if (!parts) continue;
      groups.splice(g, 1, ...parts);
      done = true;
      break;
    }
    if (!done) return null;
  }
  return null;
}

/**
 * Сетка заданной сложности: { solution, cages, cageOf, givens, rating }. Разбиение, проверка единственности,
 * подбор открытых цифр под уровень; не подошло — следующая попытка.
 */
export function generatePuzzle(difficulty, rng = Math.random, maxAttempts = 2000) {
  const rule = DIFFICULTY_RULES[difficulty];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = randomSolution(rng);
    const made = makeUnique(partition(solution, rule.sizes, rng), solution, rng);
    if (!made) continue;
    const fit = fitDifficulty(made.layout, solution, rule, rng);
    if (!fit) continue;
    return { solution, ...made.layout, givens: fit.givens, rating: fit.rating };
  }
  throw new Error(`Не удалось сгенерировать «${difficulty}» за ${maxAttempts} попыток`);
}

/**
 * Перемешивание, не меняющее ни единственности, ни сложности, ни формы групп: поворот и отражение поля
 * (8 вариантов) и «зеркало цифр» d → 10 − d (сумма группы из k клеток становится 10·k − сумма) — всего 16.
 * Перестановки строк внутри полосы, как в судоку, тут не годятся — соседние клетки группы перестали бы быть
 * соседними; произвольная перестановка цифр — тоже: суммы перестали бы сходиться.
 * grids — [решение, открытые цифры, номера групп] (по 81); цифры зеркалятся, номера групп — нет.
 */
export function transformGrids([solution, givens, cageOf], rng = Math.random) {
  const turns = Math.floor(rng() * 4);
  const mirror = rng() < 0.5;
  const flipDigits = rng() < 0.5;
  const out = [Array(81), Array(81), Array(81)];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      let rr = r;
      let cc = mirror ? 8 - c : c;
      for (let t = 0; t < turns; t++) [rr, cc] = [cc, 8 - rr];
      const from = r * 9 + c;
      const to = rr * 9 + cc;
      const flip = (d) => (flipDigits && d ? 10 - d : d);
      out[0][to] = flip(solution[from]);
      out[1][to] = flip(givens[from]);
      out[2][to] = cageOf[from];
    }
  }
  return out;
}
