// Банк сеток — зона риска: у каждой сетки должно быть ЕДИНСТВЕННОЕ решение (ошибки считаются по сохранённому
// решению — при втором решении верная цифра игрока была бы «ошибкой»). Проверяются все сетки банка и перемешанные
// (так их получает игрок), а заодно — что сложность соответствует разделу. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countSolutions } from '../solver.js';
import { logicalSolve, LEVEL } from '../techniques.js';
import { transformGrids, DIFFICULTY_RULES, rateLayout } from '../generator.js';
import { decodePuzzle, encodePuzzle, isValidLayout, cagesFromMap, cageMapText } from '../cages.js';
import { DIFFICULTIES } from '../logic.js';

const bank = JSON.parse(readFileSync(new URL('../puzzles.json', import.meta.url), 'utf8'));

test('в банке все сложности, по 150+ сеток, без дублей, запись читается обратно', () => {
  assert.deepEqual(Object.keys(bank).sort(), [...DIFFICULTIES].sort());
  const all = DIFFICULTIES.flatMap((d) => bank[d]);
  for (const d of DIFFICULTIES) assert.ok(bank[d].length >= 150, `${d}: ${bank[d].length}`);
  assert.equal(new Set(all).size, all.length);
  for (const text of all.slice(0, 50)) {
    const p = decodePuzzle(text);
    assert.equal(encodePuzzle(p.solution, p.cageOf, p.givens), text);
  }
});

for (const difficulty of DIFFICULTIES) {
  test(`${difficulty}: раскладка верна, решение единственное, сложность как у раздела`, () => {
    const rule = DIFFICULTY_RULES[difficulty];
    for (const text of bank[difficulty]) {
      const p = decodePuzzle(text);
      assert.ok(isValidLayout(p.cages, p.solution), `раскладка: ${text}`);
      assert.ok(p.cages.every((c) => c.cells.length <= 6), `группа больше 6 клеток: ${text}`);
      assert.ok(p.cages.filter((c) => c.cells.length === 1).length <= rule.maxSingles, `много одиночек: ${text}`);
      const givens = p.givens.filter(Boolean).length;
      assert.ok(givens >= rule.minGivens && givens <= rule.givens, `открытых цифр ${givens}: ${text}`);
      // единственность — даже без открытых цифр (они только помогают)
      const res = countSolutions(Array(81).fill(0), p, 2);
      assert.equal(res.count, 1, `не единственное решение: ${text}`);
      assert.deepEqual(res.solution, p.solution);
      const rating = rateLayout(p, p.givens, rule.maxLevel);
      assert.ok(rating.solved, `не решается приёмами уровня ${rule.maxLevel}: ${text}`);
      assert.equal(rating.level, rule.maxLevel, `самый сложный приём ${rating.level}, а нужен ${rule.maxLevel}: ${text}`);
    }
  });
}

test('перемешанные сетки (поворот, отражение, 10 − d): решение единственное и совпадает с перемешанным', () => {
  const all = DIFFICULTIES.flatMap((d) => bank[d]);
  for (let k = 0; k < 300; k++) {
    const p = decodePuzzle(all[Math.floor(Math.random() * all.length)]);
    const [solution, givens, cageOf] = transformGrids([p.solution, p.givens, p.cageOf]);
    const layout = cagesFromMap(cageMapText(cageOf), solution);
    assert.ok(isValidLayout(layout.cages, solution));
    assert.ok(givens.every((v, i) => !v || v === solution[i]));
    const check = countSolutions(givens, layout, 2);
    assert.equal(check.count, 1);
    assert.deepEqual(check.solution, solution);
  }
});

test('приёмы не ошибаются: каждая расстановка и каждое исключение сверяются с решением', () => {
  const used = new Set();
  for (const difficulty of DIFFICULTIES) {
    for (const text of bank[difficulty].slice(0, 60)) {
      const p = decodePuzzle(text);
      const { solved } = logicalSolve(p.givens, p, {
        onStep(step) {
          used.add(step.type);
          if (step.eliminations) {
            for (const { cell, digit } of step.eliminations) {
              assert.notEqual(p.solution[cell], digit, `${step.type} убрал верную цифру ${digit} из клетки ${cell}: ${text}`);
            }
          } else {
            assert.equal(step.digit, p.solution[step.cell], `${step.type} поставил неверную цифру: ${text}`);
          }
        },
      });
      assert.ok(solved);
    }
  }
  // Банк должен задействовать почти все приёмы — иначе какой-то из них не проверен.
  const missing = Object.keys(LEVEL).filter((type) => !used.has(type));
  assert.ok(missing.length <= 3, `приёмы ни разу не встретились: ${missing.join(', ')}`);
});
