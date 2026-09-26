// Автозаполнение: дописывает только то, что выводится логикой, и молчит, пока на доске ошибка.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, placeDigit, autofillPlan, applyAutofill, CELL_POINTS, isSolved } from '../logic.js';
import { parseGrid, bit, PEERS, UNITS, UNITS_OF, ALL_DIGITS } from '../grid.js';

const SOLUTION = parseGrid('534678912672195348198342567859761423426853791713924856961537284287419635345286179');

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Партия, где пусты только клетки empty (остальное — данные цифры). */
function gameWithEmpty(empty) {
  const puzzle = SOLUTION.map((v, i) => (empty.includes(i) ? 0 : v));
  return newGame('easy', puzzle, SOLUTION);
}

const candidates = (values, i) => {
  let mask = ALL_DIGITS;
  for (const p of PEERS[i]) if (values[p]) mask &= ~bit(values[p]);
  return mask;
};

/** Можно ли вывести цифру d в клетку i по доске values — без решения. */
function justified(values, i, d) {
  const lastInUnit = UNITS_OF[i].some((u) => UNITS[u].every((c) => c === i || values[c])
    && !UNITS[u].some((c) => values[c] === d));
  const placed = values.filter((v) => v === d).length;
  const lastOfDigit = placed === 8 && values.every((v, k) => v || k === i || (candidates(values, k) & bit(d)) === 0);
  const singleCandidate = candidates(values, i) === bit(d);
  return lastInUnit || lastOfDigit || singleCandidate;
}

test('автозаполнение: выключено — ничего; неверная цифра на доске — ничего', () => {
  const s = gameWithEmpty([0, 1]);
  assert.deepEqual(autofillPlan(s, 'off'), []);
  assert.equal(autofillPlan(s, 'end').length, 2);
  const w = gameWithEmpty([0, 1, 40]);
  placeDigit(w, 40, SOLUTION[40] === 1 ? 2 : 1);   // ошибка
  assert.deepEqual(autofillPlan(w, 'end'), []);
  assert.deepEqual(autofillPlan(w, 'obvious'), []);
});

test('«В конце»: дописывает, только когда в каждой пустой клетке один вариант', () => {
  const few = gameWithEmpty([0, 40, 80]);
  assert.deepEqual(autofillPlan(few, 'end').map((x) => x.i).sort((a, b) => a - b), [0, 40, 80]);
  // позиция, где хоть в одной пустой клетке два варианта и больше, — «В конце» ждёт
  const r = rng(3);
  for (;;) {
    const empty = [...Array(81).keys()].sort(() => r() - 0.5).slice(0, 40);
    const s = gameWithEmpty(empty);
    if (empty.every((i) => candidates(s.values, i).toString(2).split('1').length === 2)) continue;
    assert.deepEqual(autofillPlan(s, 'end'), []);
    break;
  }
});

test('«Очевидное»: восемь девяток стоят — девятая встаёт сама (пример владельца)', () => {
  const nines = SOLUTION.map((v, i) => (v === 9 ? i : -1)).filter((i) => i >= 0);
  const target = nines[4];
  // перебором — позиция, где ни в одной строке, столбце и блоке нет единственной пустой клетки,
  // а из девяток пуста только одна: сработать может только правило «восьми девяток»
  const r = rng(11);
  for (;;) {
    const others = [...Array(81).keys()].filter((i) => SOLUTION[i] !== 9).sort(() => r() - 0.5).slice(0, 34);
    const empty = [target, ...others];
    if (UNITS.some((u) => u.filter((c) => empty.includes(c)).length === 1)) continue;
    const s = gameWithEmpty(empty);
    assert.deepEqual(autofillPlan(s, 'obvious')[0], { i: target, d: 9 });
    break;
  }
});

test('каждая дописанная клетка выводится логикой по доске (1000 случайных позиций)', () => {
  const r = rng(7);
  for (let n = 0; n < 1000; n++) {
    const count = 1 + Math.floor(r() * 60);
    const empty = [...Array(81).keys()].sort(() => r() - 0.5).slice(0, count);
    for (const mode of ['end', 'obvious']) {
      const s = gameWithEmpty(empty);
      const plan = autofillPlan(s, mode);
      const values = [...s.values];
      for (const { i, d } of plan) {
        assert.equal(values[i], 0, 'дописывается только пустая клетка');
        assert.ok(justified(values, i, d), `${mode}: клетка ${i} = ${d} не выводится`);
        values[i] = d;
      }
      if (mode === 'end' && plan.length) assert.equal(plan.length, count, '«В конце» — всё сразу');
    }
  }
});

test('дописанная клетка — как верный ход: очки, заметки у соседей убираются, отмена сбрасывается', () => {
  const s = gameWithEmpty([0, 1, 2]);
  const peer = PEERS[0].find((p) => p === 1);
  s.notes[peer] = bit(SOLUTION[0]) | bit(SOLUTION[1]);
  s.undo = [[{ i: 5, value: 0, notes: 0 }]];
  applyAutofill(s, 0, SOLUTION[0]);
  assert.equal(s.values[0], SOLUTION[0]);
  assert.equal(s.score, CELL_POINTS.easy);
  assert.equal(s.notes[peer] & bit(SOLUTION[0]), 0);
  assert.deepEqual(s.undo, []);
  for (const { i, d } of autofillPlan(s, 'end')) applyAutofill(s, i, d);
  assert.ok(isSolved(s));
});
