// Банк сеток — зона риска из CLAUDE.md: у каждой сетки должно быть ЕДИНСТВЕННОЕ решение.
// Проверяются все сетки банка и ещё 1000 случайно перемешанных (так их получает игрок),
// а заодно — что сложность сетки соответствует её разделу. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countSolutions } from '../solver.js';
import { logicalSolve, LEVEL } from '../techniques.js';
import { transformPair, DIFFICULTY_RULES } from '../generator.js';
import { parseGrid } from '../grid.js';
import { DIFFICULTIES } from '../logic.js';

const bank = JSON.parse(readFileSync(new URL('../puzzles.json', import.meta.url), 'utf8'));

test('в банке все сложности, по 100+ сеток, без дублей', () => {
  assert.deepEqual(Object.keys(bank).sort(), [...DIFFICULTIES].sort());
  const all = DIFFICULTIES.flatMap((d) => bank[d]);
  for (const d of DIFFICULTIES) assert.ok(bank[d].length >= 100, `${d}: ${bank[d].length}`);
  assert.equal(new Set(all).size, all.length);
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty}: у каждой сетки единственное решение и нужная сложность`, () => {
    const rule = DIFFICULTY_RULES[difficulty];
    for (const text of bank[difficulty]) {
      const puzzle = parseGrid(text);
      assert.equal(countSolutions(puzzle, 2).count, 1, `не единственное решение: ${text}`);
      assert.ok(puzzle.filter(Boolean).length <= rule.maxGivens, `много подсказанных цифр: ${text}`);
      const { solved, level } = logicalSolve(puzzle);
      assert.ok(solved, `не решается логикой: ${text}`);
      assert.equal(level, rule.level, `сложность ${level} вместо ${rule.level}: ${text}`);
    }
  });
}

test('1000 перемешанных сеток: решение единственное и совпадает с перемешанным решением', () => {
  const all = DIFFICULTIES.flatMap((d) => bank[d]);
  for (let k = 0; k < 1000; k++) {
    const puzzle = parseGrid(all[Math.floor(Math.random() * all.length)]);
    const { solution } = countSolutions(puzzle, 1);
    const pair = transformPair(puzzle, solution);
    const check = countSolutions(pair.puzzle, 2);
    assert.equal(check.count, 1);
    assert.deepEqual(check.solution, pair.solution);
  }
});

test('приёмы не ошибаются: каждая расстановка и каждое исключение сверяются с решением', () => {
  const used = new Set();
  for (const difficulty of DIFFICULTIES) {
    for (const text of bank[difficulty]) {
      const puzzle = parseGrid(text);
      const { solution } = countSolutions(puzzle, 1);
      logicalSolve(puzzle, {
        onStep(step) {
          used.add(step.type);
          if (step.eliminations) {
            for (const { cell, digit } of step.eliminations) {
              assert.notEqual(solution[cell], digit, `${step.type} убрал верную цифру ${digit} из клетки ${cell}`);
            }
          } else {
            assert.equal(step.digit, solution[step.cell], `${step.type} поставил неверную цифру`);
          }
        },
      });
    }
  }
  // Банк должен задействовать все приёмы — иначе какой-то из них не проверен.
  for (const type of Object.keys(LEVEL)) assert.ok(used.has(type), `приём ${type} ни разу не встретился`);
});
