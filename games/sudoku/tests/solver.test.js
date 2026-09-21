// Решатель и перемешивание. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSolutions, hasUniqueSolution, randomSolution, isValidSolution } from '../solver.js';
import { transformGrid, transformPair } from '../generator.js';
import { parseGrid, UNITS, PEERS } from '../grid.js';

// Классическая сетка из Википедии — единственное решение.
const WIKI = parseGrid('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
const WIKI_SOLUTION = parseGrid('534678912672195348198342567859761423426853791713924856961537284287419635345286179');

test('геометрия: 27 групп по 9 клеток, у каждой клетки 20 соседей', () => {
  assert.equal(UNITS.length, 27);
  assert.ok(UNITS.every((u) => u.length === 9 && new Set(u).size === 9));
  assert.ok(PEERS.every((p) => p.length === 20));
});

test('countSolutions: единственное решение находится верно', () => {
  const { count, solution } = countSolutions(WIKI, 2);
  assert.equal(count, 1);
  assert.deepEqual(solution, WIKI_SOLUTION);
});

test('countSolutions: пустая сетка — больше одного решения, противоречие — ни одного', () => {
  assert.equal(countSolutions(Array(81).fill(0), 2).count, 2);
  const broken = [...WIKI];
  broken[1] = 5;                          // вторая 5 в первой строке
  assert.equal(countSolutions(broken, 2).count, 0);
  assert.equal(hasUniqueSolution(Array(81).fill(0)), false);
  assert.equal(hasUniqueSolution(WIKI), true);
});

test('randomSolution даёт корректные и разные сетки', () => {
  const a = randomSolution();
  const b = randomSolution();
  assert.ok(isValidSolution(a));
  assert.ok(isValidSolution(b));
  assert.notDeepEqual(a, b);
});

test('перемешивание сохраняет корректность решения и единственность', () => {
  for (let k = 0; k < 200; k++) {
    const { puzzle, solution } = transformPair(WIKI, WIKI_SOLUTION);
    assert.ok(isValidSolution(solution));
    assert.ok(puzzle.every((v, i) => v === 0 || v === solution[i]), 'сетка не совпадает с решением');
    assert.equal(countSolutions(puzzle, 2).count, 1);
    assert.equal(puzzle.filter(Boolean).length, WIKI.filter(Boolean).length);
  }
  assert.notDeepEqual(transformGrid(WIKI), transformGrid(WIKI));
});
