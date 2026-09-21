// Собирает банк сеток: node games/sudoku/tools/generate-bank.js [сколько на сложность, по умолчанию 100]
// Результат — games/sudoku/puzzles.json: { easy: ['0030…', …], medium, hard, expert }.
// В браузере сетка берётся из банка и перемешивается (transformPair) — так партии не повторяются.

import { writeFileSync } from 'node:fs';
import { generatePuzzle, DIFFICULTY_RULES } from '../generator.js';
import { formatGrid } from '../grid.js';

const perLevel = Number(process.argv[2] ?? 100);
const bank = {};

for (const difficulty of Object.keys(DIFFICULTY_RULES)) {
  const started = Date.now();
  const seen = new Set();
  bank[difficulty] = [];
  while (bank[difficulty].length < perLevel) {
    const { puzzle } = generatePuzzle(difficulty);
    const text = formatGrid(puzzle);
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
