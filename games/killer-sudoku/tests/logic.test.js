// Правила партии киллера, группы, контур пунктира, подсказки. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newGame, placeDigit, toggleNote, erase, undo, isSolved, isLost, isLocked, conflicts, isValidState, CELL_POINTS,
  cageInfo, cageCombos, autofillPlan, applyAutofill, layoutOf, normalizeSettings, defaultSettings,
  emptyStats, recordGame, isValidStats,
} from '../logic.js';
import { decodePuzzle, COMBOS, combosOf, cagesFromMap, cageMapText } from '../cages.js';
import { constraintsOf, countSolutions } from '../solver.js';
import { cageOutline } from '../outline.js';
import { buildHint } from '../hints.js';
import { digitsOf, bit } from '../grid.js';

const bank = JSON.parse(readFileSync(new URL('../puzzles.json', import.meta.url), 'utf8'));
const entry = (difficulty = 'easy', k = 0) => decodePuzzle(bank[difficulty][k]);
const fresh = (difficulty = 'easy', k = 0) => newGame(difficulty, entry(difficulty, k));

test('таблица сочетаний: 511 наборов, суммы как в справочниках', () => {
  const all = COMBOS.slice(1).flat().flat();          // COMBOS[0] — пустой набор
  assert.equal(all.length, 511);
  assert.deepEqual(combosOf(2, 3), [[1, 2]]);
  assert.deepEqual(combosOf(2, 17), [[8, 9]]);
  assert.deepEqual(combosOf(3, 24), [[7, 8, 9]]);
  assert.equal(combosOf(4, 20).length, 12);
  assert.deepEqual(combosOf(2, 10).map((s) => s.join('')).sort(), ['19', '28', '37', '46']);
});

test('«правило 45» в переборе: остатки строк/столбцов/блоков — с верной суммой', () => {
  const p = entry('expert', 3);
  for (const { cells, sum } of constraintsOf(p)) {
    assert.equal(cells.reduce((s, i) => s + p.solution[i], 0), sum);
    assert.equal(new Set(cells.map((i) => p.solution[i])).size, cells.length, 'цифры в группе разные');
  }
});

test('швы групп: запись и чтение дают те же группы', () => {
  const p = entry('hard', 5);
  const again = cagesFromMap(cageMapText(p.cageOf), p.solution);
  assert.deepEqual(again.cageOf, p.cageOf);
  assert.deepEqual(again.cages, p.cages);
});

test('контур: квадрат — 4 стороны внутрь, «Г» — 6 сторон, внутренний угол тоже внутрь', () => {
  const xs = Array.from({ length: 10 }, (_, k) => k * 40);
  const ys = xs;
  const square = cageOutline([0], xs, ys, 4);
  assert.equal(square.length, 4);
  for (const [x1, y1, x2, y2] of square) for (const v of [x1, y1, x2, y2]) assert.ok(v === 4 || v === 36, `${v}`);
  // «Г»: клетки (0,0), (1,0), (1,1)
  const ell = cageOutline([0, 9, 10], xs, ys, 4);
  assert.equal(ell.length, 6);
  const points = ell.map(([x, y]) => `${x},${y}`);
  assert.ok(points.includes('36,44'), 'внутренний угол сдвинут внутрь по обеим сторонам');
  // каждая сторона замыкается на следующую
  ell.forEach(([, , x2, y2], k) => assert.deepEqual([x2, y2], ell[(k + 1) % ell.length].slice(0, 2)));
});

test('верная цифра: очки, закрепление; заметка той же цифры убирается и в группе', () => {
  const s = fresh();
  const { cages, cageOf } = layoutOf(s);
  const i = s.values.findIndex((v, k) => !v && cages[cageOf[k]].cells.some((m) => m !== k && !s.values[m]));
  const mate = cages[cageOf[i]].cells.find((k) => k !== i && !s.values[k]);
  const d = s.solution[i];
  toggleNote(s, mate, d);
  assert.equal(placeDigit(s, i, d), 'correct');
  assert.equal(s.score, CELL_POINTS.easy);
  assert.ok(isLocked(s, i));
  assert.equal(s.notes[mate] & bit(d), 0);
  assert.equal(erase(s, i), false);
});

test('ошибки: неверная цифра остаётся, повтор в группе — конфликт, 3 ошибки — поражение', () => {
  const s = fresh();
  const { cages } = layoutOf(s);
  const cage = cages.find((c) => c.cells.filter((k) => !s.values[k]).length >= 2);
  const [a, b] = cage.cells.filter((k) => !s.values[k]);
  placeDigit(s, a, s.solution[a]);
  const wrong = s.solution[a];                     // та же цифра в той же группе
  assert.equal(placeDigit(s, b, wrong), 'wrong');
  assert.ok(conflicts(s).has(a) && conflicts(s).has(b), 'повтор в группе — конфликт');
  assert.equal(undo(s), b);
  assert.equal(s.mistakes, 1, 'отмена не возвращает ошибку');
  s.mistakes = 3;
  assert.ok(isLost(s));
  assert.ok(!isLost(s, false));
});

test('группа заполнена с неверной суммой — конфликт всей группы', () => {
  const s = fresh('expert');
  const cage = s.cages.find((c) => c.cells.length === 2);
  const [a, b] = cage.cells;
  s.values[a] = s.solution[a];
  s.values[b] = [9, 8, 7].find((d) => d !== s.solution[b] && d !== s.solution[a]);
  assert.ok(conflicts(s).has(a) && conflicts(s).has(b));
});

test('сводка группы и сочетания: учёт верных цифр группы и соседей', () => {
  const s = fresh('expert', 1);
  const c = s.cages.findIndex((cage) => cage.cells.length === 3);
  const cage = s.cages[c];
  const before = cageCombos(s, c);
  assert.ok(before.length >= 1 && before.every(({ mask }) => digitsOf(mask).length === 3));
  const whole = cage.cells.reduce((m, k) => m | bit(s.solution[k]), 0);
  assert.ok(before.some(({ mask, fits }) => fits && mask === whole), 'настоящий набор — среди подходящих');
  const i = cage.cells[0];
  placeDigit(s, i, s.solution[i]);
  const info = cageInfo(s, c);
  assert.deepEqual([info.free, info.left], [2, cage.sum - s.solution[i]]);
  const after = cageCombos(s, c);
  assert.ok(after.every(({ mask }) => !(mask & bit(s.solution[i]))), 'стоящая цифра в сочетаниях не повторяется');
  const real = cage.cells.slice(1).reduce((m, k) => m | bit(s.solution[k]), 0);
  assert.ok(after.some(({ mask, fits }) => mask === real && fits));
});

test('автозаполнение: последняя клетка группы — по сумме; при ошибке на доске — ничего', () => {
  const s = fresh('medium', 2);
  const cage = s.cages.find((c) => c.cells.length >= 3 && c.cells.some((k) => !s.values[k]));
  const last = cage.cells.filter((k) => !s.values[k]).at(-1);
  for (const k of cage.cells) if (k !== last && !s.values[k]) placeDigit(s, k, s.solution[k]);
  const plan = autofillPlan(s, 'obvious');
  assert.ok(plan.some(({ i, d }) => i === last && d === s.solution[last]));
  assert.ok(plan.every(({ i, d }) => s.solution[i] === d));
  assert.deepEqual(autofillPlan(s, 'off'), []);
  const other = s.values.findIndex((v) => !v);
  if (other >= 0) {
    placeDigit(s, other, s.solution[other] === 1 ? 2 : 1);
    assert.deepEqual(autofillPlan(s, 'obvious'), []);
  }
});

test('«В конце»: почти решённая доска дописывается целиком, и это победа', () => {
  const s = fresh('hard', 4);
  const empty = s.values.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (const i of empty.slice(4)) placeDigit(s, i, s.solution[i]);
  const plan = autofillPlan(s, 'end');
  assert.equal(plan.length, 4);
  for (const { i, d } of plan) applyAutofill(s, i, d);
  assert.ok(isSolved(s));
});

test('сохранение: проверка состояния и настроек', () => {
  const s = fresh();
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.ok(!isValidState({ ...s, v: undefined }));
  const broken = JSON.parse(JSON.stringify(s));
  broken.cages[0].sum += 1;
  assert.ok(!isValidState(broken), 'сумма группы не сходится с решением');
  const lost = JSON.parse(JSON.stringify(s));
  lost.cages.pop();
  assert.ok(!isValidState(lost), 'клетки без группы');
  assert.deepEqual(normalizeSettings(null), defaultSettings());
  assert.deepEqual(normalizeSettings({ combos: false, skin: 'night', autofill: 'end' }),
    { ...defaultSettings(), combos: false, skin: 'night', autofill: 'end' });
  assert.equal(normalizeSettings({ skin: 'hedgehog' }).skin, 'telegram');
});

test('статистика', () => {
  let st = emptyStats();
  st = recordGame(st, true, 5000);
  st = recordGame(st, false, 1000);
  st = recordGame(st, true, 3000);
  assert.deepEqual([st.played, st.wins, st.streak, st.maxStreak, st.bestMs], [3, 2, 1, 1, 3000]);
  assert.ok(isValidStats(st));
});

test('подсказки: цепочка подсказок решает сетки всех сложностей, каждая — верная цифра', () => {
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    for (let k = 0; k < 3; k++) {
      const p = entry(difficulty, k);
      const values = [...p.givens];
      while (values.some((v) => !v)) {
        const h = buildHint(values, p.solution, p);
        assert.equal(h.action.kind, 'place');
        assert.equal(h.action.digit, p.solution[h.action.cell]);
        assert.notEqual(h.pages.at(-1).title, 'Открываем клетку', 'логики подсказок хватает на банк');
        for (const page of h.pages) {
          assert.ok(page.title && page.text.length, 'страница с заголовком и текстом');
          assert.ok(page.show.cages.every((c) => c >= 0 && c < p.cages.length));
        }
        values[h.action.cell] = h.action.digit;
      }
    }
  }
});

test('подсказка на ошибку — стереть; «сочетания суммы» показывает группу и вычёркивает лишнее', () => {
  const p = entry('medium', 0);
  const values = [...p.givens];
  const i = values.findIndex((v) => !v);
  values[i] = p.solution[i] === 1 ? 2 : 1;
  assert.deepEqual(buildHint(values, p.solution, p).action, { kind: 'erase', cell: i });
  const clean = [...p.givens];
  for (let n = 0; n < 81; n++) {
    const h = buildHint(clean, p.solution, p);
    const page = h.pages.find((pg) => pg.title === 'Сочетания суммы');
    if (page) {
      assert.equal(page.show.cages.length, 1);
      assert.ok(page.show.elim.size > 0);
      for (const [cell, digits] of page.show.elim) for (const d of digits) assert.notEqual(p.solution[cell], d);
      return;
    }
    clean[h.action.cell] = h.action.digit;
  }
  assert.fail('в средней сетке не встретилось сочетаний суммы');
});

test('перебор: без групп решений много, с группами банка — одно', () => {
  const p = entry('easy', 0);
  const res = countSolutions(Array(81).fill(0), { cages: [], cageOf: Array(81).fill(-1) }, 3);
  assert.equal(res.count, 3);
  assert.equal(countSolutions(p.givens, p, 2).count, 1);
});
