// Собирает банк сеток: node games/killer-sudoku/tools/generate-bank.js [сколько на сложность, по умолчанию 200]
// Результат — games/killer-sudoku/puzzles.json: { easy: ['решение:швы', …], medium, hard, expert }.
//   решение — 81 цифра; швы — 81 символ '0'–'7': (сосед справа из той же группы ? 1 : 0) + (снизу ? 2 : 0) +
//   (цифра открыта ? 4 : 0). Суммы групп считаются из решения.
// В браузере сетка берётся из банка и перемешивается (transformGrids) — так партии не повторяются.

import { writeFileSync } from 'node:fs';
import { generatePuzzle, DIFFICULTY_RULES } from '../generator.js';
import { encodePuzzle } from '../cages.js';

const perLevel = Number(process.argv[2] ?? 200);
const bank = {};

for (const difficulty of Object.keys(DIFFICULTY_RULES)) {
  const started = Date.now();
  const seen = new Set();
  bank[difficulty] = [];
  while (bank[difficulty].length < perLevel) {
    const { solution, cageOf, givens } = generatePuzzle(difficulty);
    const text = encodePuzzle(solution, cageOf, givens);
    if (seen.has(text)) continue;
    seen.add(text);
    bank[difficulty].push(text);
    process.stdout.write(`\r${difficulty}: ${bank[difficulty].length}/${perLevel}`);
  }
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} с)`);
}

const out = new URL('../puzzles.json', import.meta.url);
writeFileSync(out, JSON.stringify(bank));
console.log(`Записано: ${out.pathname}`);
