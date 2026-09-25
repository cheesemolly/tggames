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

// ---------- страницы подсказки: что подсвечено, то и правда ----------

import { PEERS, UNITS, ROW_OF, COL_OF, BOX_OF } from '../grid.js';

const MARKS = new Set(['key', 'area', 'unit', 'target', 'elim', 'wrong']);

test('страницы подсказок: зелёные цифры действительно закрывают клетки, последняя страница — ответ', () => {
  const kinds = new Set();
  for (const difficulty of DIFFICULTIES) {
    for (const text of bank[difficulty].slice(0, 12)) {
      const values = parseGrid(text);
      const { solution } = countSolutions(values, 1);
      while (values.some((v) => !v)) {
        const hint = buildHint(values, solution);
        const found = nextHint(values);
        const { cell, digit } = hint.action;
        assert.ok(hint.pages.length >= 1);
        for (const page of hint.pages) {
          assert.ok(page.title && page.text.length, 'пустая страница');
          for (const seg of page.text) if (typeof seg !== 'string') assert.ok(MARKS.has(seg.m) && seg.t, `метка ${seg.m}`);
        }
        const last = hint.pages.at(-1).show;
        assert.equal(last.target, cell, 'последняя страница показывает клетку ответа');
        assert.equal(last.reveal, digit, 'и цифру ответа');

        const step = found.step;
        kinds.add(step.type);
        const excluded = new Set();
        for (const s of found.chain) for (const e of s.eliminations) if (e.digit === digit) excluded.add(e.cell);
        const first = hint.pages[found.chain.length].show;       // первая страница расстановки
        if (step.type === 'hiddenSingle') {
          for (const k of first.key) assert.equal(values[k], digit, 'зелёные — цифры той же');
          for (const e of UNITS[step.unit]) {
            if (values[e] || e === cell || excluded.has(e)) continue;
            const holder = [...first.key].find((k) => PEERS[e].includes(k));
            assert.ok(holder !== undefined, `клетка ${e} ничем не закрыта`);
            assert.ok(first.area.has(e), 'закрытая клетка лежит в голубой области');
          }
          assert.deepEqual(hint.pages[found.chain.length + 1].show.units, [step.unit], 'вторая страница обводит группу');
        }
        if (step.type === 'nakedSingle') {
          const shown = new Set([...hint.pages[found.chain.length + 1].show.key].map((k) => values[k]));
          for (const k of hint.pages[found.chain.length + 1].show.key) {
            assert.ok(ROW_OF[k] === ROW_OF[cell] || COL_OF[k] === COL_OF[cell] || BOX_OF[k] === BOX_OF[cell], 'зелёная — соседка');
          }
          for (let d = 1; d <= 9; d++) {
            if (d === digit) continue;
            const chainOut = found.chain.some((s) => s.eliminations.some((e) => e.cell === cell && e.digit === d));
            assert.ok(shown.has(d) || chainOut, `цифра ${d} не показана как занятая`);
          }
        }
        // страницы исключений отмечают ровно исключённые варианты
        found.chain.forEach((s, n) => {
          const elim = hint.pages[n].show.elim;
          for (const e of s.eliminations) assert.ok(elim.get(e.cell)?.includes(e.digit), 'исключение отмечено');
        });
        values[cell] = digit;
      }
    }
  }
  for (const kind of ['hiddenSingle', 'nakedSingle', 'lastCell']) assert.ok(kinds.has(kind), `не встретилось: ${kind}`);
});
