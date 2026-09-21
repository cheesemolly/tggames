// Генератор сеток (запускается заранее скриптом tools/generate-bank.js, не в браузере)
// и перемешивание готовой сетки (в браузере, при каждой новой партии).

import { countSolutions, randomSolution, shuffle } from './solver.js';
import { logicalSolve } from './techniques.js';

// Сложность = самый сложный приём, без которого сетку не решить, + число открытых цифр.
//   Лёгкий и средний — только одиночки (уровень 1), различаются количеством подсказанных цифр.
//   Сложный — нужны пары и пересечения (2). Эксперт — скрытые группы или X-крыло (3).
export const DIFFICULTY_RULES = {
  easy: { level: 1, stopAt: 38, maxGivens: 42 },
  medium: { level: 1, stopAt: 30, maxGivens: 34 },
  hard: { level: 2, stopAt: 0, maxGivens: 32 },
  expert: { level: 3, stopAt: 0, maxGivens: 30 },
};

/**
 * Сетка заданной сложности: { puzzle, solution, givens }.
 * Из полной сетки по одной убираются цифры в случайном порядке; убранная возвращается, если решение
 * перестаёт быть единственным или сетку уже не решить приёмами не сложнее нужного уровня.
 */
export function generatePuzzle(difficulty, rng = Math.random, maxAttempts = 500) {
  const rule = DIFFICULTY_RULES[difficulty];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = randomSolution(rng);
    const grid = [...solution];
    let givens = 81;
    for (const i of shuffle([...Array(81).keys()], rng)) {
      if (givens <= rule.stopAt) break;
      const digit = grid[i];
      grid[i] = 0;
      if (countSolutions(grid, 2).count !== 1 || !logicalSolve(grid, { maxLevel: rule.level }).solved) {
        grid[i] = digit;
      } else {
        givens--;
      }
    }
    if (givens <= rule.maxGivens && logicalSolve(grid).level === rule.level) {
      return { puzzle: grid, solution, givens };
    }
  }
  throw new Error(`Не удалось сгенерировать сетку «${difficulty}» за ${maxAttempts} попыток`);
}

/**
 * Случайное перемешивание, не меняющее ни единственности решения, ни сложности:
 * перестановка цифр, строк внутри полос, самих полос, то же для столбцов, и транспонирование.
 */
export function transformGrid(grid, rng = Math.random) {
  const digitMap = [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)];
  const order = () => shuffle([0, 1, 2], rng);
  const lineOrder = () => {
    const bands = order();
    return bands.flatMap((band) => order().map((k) => band * 3 + k));
  };
  const rows = lineOrder();
  const cols = lineOrder();
  const transpose = rng() < 0.5;
  const out = Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const src = transpose ? cols[c] * 9 + rows[r] : rows[r] * 9 + cols[c];
      out[r * 9 + c] = digitMap[grid[src]];
    }
  }
  return out;
}

/** То же перемешивание сразу для сетки и её решения (один и тот же rng-поток). */
export function transformPair(puzzle, solution, rng = Math.random) {
  const seed = [];
  const recorder = () => {
    const v = rng();
    seed.push(v);
    return v;
  };
  const player = () => seed.shift();
  const puzzleOut = transformGrid(puzzle, recorder);
  const solutionOut = transformGrid(solution, player);
  return { puzzle: puzzleOut, solution: solutionOut };
}
