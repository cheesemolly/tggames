// Подсказки: последовательное применение подсказок решает любую сетку банка, каждая подсказка верна,
// цепочка объяснений не ссылается на невидимые выводы. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countSolutions } from '../solver.js';
import { buildHint } from '../hints.js';
import { nextHint, candidatesFor, applyStep, isPlacement } from '../techniques.js';
import { parseGrid } from '../grid.js';
import { DIFFICULTIES } from '../logic.js';

const bank = JSON.parse(readFileSync(new URL('../puzzles.json', import.meta.url), 'utf8'));

test('цепочка подсказок решает сетку до конца, каждая цифра — верная', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const text of bank[difficulty].slice(0, 25)) {
      const values = parseGrid(text);
      const { solution } = countSolutions(values, 1);
      let guard = 0;
      while (values.some((v) => !v)) {
        const hint = buildHint(values, solution);
        assert.ok(hint, 'подсказки нет, а доска не решена');
        assert.equal(hint.action.kind, 'place');
        assert.equal(hint.action.digit, solution[hint.action.cell], `${difficulty}: неверная подсказка`);
        assert.notEqual(hint.steps[0].title, 'Открываем клетку', `${difficulty}: логики не хватило: ${text}`);
        assert.ok(hint.steps.every((s) => s.title && s.text), 'пустой текст подсказки');
        values[hint.action.cell] = hint.action.digit;
        assert.ok(++guard <= 81);
      }
    }
  }
});

test('ошибка на доске — первая подсказка указывает на неё', () => {
  const values = parseGrid(bank.easy[0]);
  const { solution } = countSolutions(values, 1);
  const empty = values.findIndex((v) => !v);
  values[empty] = (solution[empty] % 9) + 1;   // заведомо неверная цифра
  const hint = buildHint(values, solution);
  assert.equal(hint.action.kind, 'erase');
  assert.equal(hint.action.cell, empty);
  assert.equal(hint.highlight.target, empty);
});

test('цепочка исключений: каждый шаг выполним после предыдущих, в конце — сама расстановка', () => {
  let chains = 0;
  for (const text of [...bank.hard.slice(0, 40), ...bank.expert.slice(0, 40)]) {
    const values = parseGrid(text);
    const { solution } = countSolutions(values, 1);
    while (values.some((v) => !v)) {
      const found = nextHint(values);
      if (found.chain.length) {
        chains++;
        // Проигрываем цепочку: каждый шаг должен находиться поиском в позиции после предыдущих.
        const grid = [...values];
        const cand = candidatesFor(grid);
        for (const step of found.chain) {
          for (const { cell, digit } of step.eliminations) assert.notEqual(solution[cell], digit);
          applyStep(step, grid, cand);
        }
        assert.ok(isPlacement(found.step));
      }
      values[found.step.cell] = found.step.digit;
    }
  }
  assert.ok(chains > 0, 'в сложных сетках не встретилось ни одной цепочки');
});
