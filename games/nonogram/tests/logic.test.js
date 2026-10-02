// Правила японского кроссворда: ход с проверкой и без, отмена, кисть, погашенные числа, автокрестики, победа,
// подсказка-линия, сохранение, прогресс и открытие уровней; все 100 уровней решаются логикой.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY, FILL, CROSS, prepare, newRun, setCell, undoChanges, brushValue, doneNumbers, doneClues, autoCross,
  isSolved, hintLine, serializeRun, deserializeRun, isValidRun, emptyProgress, normalizeProgress, recordSolve,
  solvedCount, isOpen, normalizeSettings, maskOf, fmtTime, strokeCells,
} from '../logic.js';
import { LEVELS, SECTIONS } from '../levels.js';
import { cluesOfGrid, lineSolve } from '../solver.js';

const heart = { title: 'Сердце', pal: { r: '#e5484d' }, art: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'] };

test('ход с проверкой: верный — ставится, неверный — ошибка, клетка показывает правду и закрепляется', () => {
  const run = newRun(heart, 0);
  assert.deepEqual(setCell(run, heart, 1, FILL), { i: 1, from: EMPTY, to: FILL, mistake: false });
  const bad = setCell(run, heart, 0, FILL);
  assert.equal(bad.mistake, true);
  assert.equal(run.cells[0], CROSS, 'на месте ошибки — крестик');
  assert.equal(run.mistakes, 1);
  assert.equal(setCell(run, heart, 0, EMPTY), null, 'показанную ошибку не стереть');
  const bad2 = setCell(run, heart, 5, CROSS);
  assert.equal(bad2.mistake, true);
  assert.equal(run.cells[5], FILL);
  undoChanges(run, [bad, bad2]);
  assert.equal(run.cells[0], CROSS, 'ошибки не отменяются');
  assert.equal(run.mistakes, 2);
});

test('без проверки: ставится что угодно, ошибок нет; победа — когда закрашено ровно то, что нужно', () => {
  const run = newRun(heart, 0);
  setCell(run, heart, 0, FILL, { check: false });
  assert.equal(run.cells[0], FILL);
  assert.equal(run.mistakes, 0);
  const { solution } = prepare(heart);
  solution.forEach((v, i) => { run.cells[i] = v ? FILL : EMPTY; });
  assert.equal(isSolved(run, heart), true, 'крестики не обязательны');
  run.cells[0] = FILL;
  assert.equal(isSolved(run, heart), false);
});

test('кисть: на пустой — красит, на закрашенной — стирает; отрезок по строке или столбцу', () => {
  assert.equal(brushValue(EMPTY, FILL), FILL);
  assert.equal(brushValue(FILL, FILL), EMPTY);
  assert.equal(brushValue(CROSS, FILL), FILL);
  assert.equal(brushValue(EMPTY, CROSS), CROSS);
  assert.equal(brushValue(CROSS, CROSS), EMPTY);
  assert.deepEqual(strokeCells(5, 6, 9), [6, 7, 8, 9]);
  assert.deepEqual(strokeCells(5, 21, 6), [21, 16, 11, 6]);
  assert.deepEqual(strokeCells(5, 6, 13), [6, 7, 8], 'по большему сдвигу');
});

test('погашенные числа: всё совпало — все; с краёв — закрытые крестиком отрезки по порядку', () => {
  // подсказка 2 1 3 в 10 клетках
  const clue = [2, 1, 3];
  assert.deepEqual(doneNumbers([1, 1, 0, -1, -1, -1, -1, -1, -1, -1], clue), [true, false, false]);
  assert.deepEqual(doneNumbers([1, 1, -1, -1, -1, -1, -1, -1, -1, -1], clue), [false, false, false], 'не закрыт — мог бы вырасти');
  assert.deepEqual(doneNumbers([-1, -1, -1, -1, -1, -1, 0, 1, 1, 1], clue), [false, false, true]);
  assert.deepEqual(doneNumbers([0, 1, 1, 0, 1, 0, 1, 1, 1, -1], clue), [true, true, true], 'закрашенное совпало целиком');
  assert.deepEqual(doneNumbers([1, 1, 1, 0, -1, -1, -1, -1, -1, -1], clue), [false, false, false], 'не то число');
  assert.deepEqual(doneNumbers([0, 0, 0], []), []);
});

test('автокрестики: в решённой линии нетронутые клетки становятся крестиками; с ошибкой — нет', () => {
  const run = newRun(heart, 0);
  // строка 0: .r.r.
  setCell(run, heart, 1, FILL);
  setCell(run, heart, 3, FILL);
  const added = autoCross(run, heart, [['row', 0]]);
  assert.deepEqual(added.sort(), [0, 2, 4]);
  assert.deepEqual(run.cells.slice(0, 5), [CROSS, FILL, CROSS, FILL, CROSS]);
  const free = newRun(heart, 0);
  setCell(free, heart, 0, FILL, { check: false });
  setCell(free, heart, 2, FILL, { check: false });
  assert.deepEqual(autoCross(free, heart, [['row', 0]], { check: true }), [], 'числа совпали, но не с решением');
  const d = doneClues(run, heart);
  assert.ok(d.rows[0].every(Boolean));
});

test('подсказка-линия: выводы верны и их больше всего; неверные клетки — раньше', () => {
  const run = newRun(heart, 0);
  const h = hintLine(run, heart);
  const { solution } = prepare(heart);
  assert.ok(h && h.cells.length >= 5);
  for (const { i, v } of h.cells) assert.equal(v, solution[i]);
  setCell(run, heart, 0, FILL, { check: false });
  assert.equal(hintLine(run, heart).kind, 'wrong');
});

test('сохранение: туда-обратно; мусор отбраковывается', () => {
  const run = newRun(LEVELS[3], 3);
  setCell(run, LEVELS[3], 7, FILL);
  run.time = 4321;
  const s = serializeRun(run);
  assert.ok(isValidRun(s, LEVELS));
  const back = deserializeRun(JSON.parse(JSON.stringify(s)), LEVELS);
  assert.deepEqual(back.cells, run.cells);
  assert.equal(isValidRun({ ...s, id: 999 }, LEVELS), false);
  assert.equal(isValidRun({ ...s, cells: `${s.cells}0` }, LEVELS), false);
  assert.equal(isValidRun({ ...s, cells: s.cells.replace(/^./, '7') }, LEVELS), false);
  assert.equal(isValidRun(null, LEVELS), false);
});

test('прогресс: решён/чисто — максимум, лучшее время — минимум; открыты первые три и по мере решения', () => {
  const p = emptyProgress(100);
  recordSolve(p, 0, { ms: 30000, clean: false });
  recordSolve(p, 0, { ms: 20000, clean: true });
  recordSolve(p, 0, { ms: 40000, clean: false });
  assert.equal(p.done[0], 2);
  assert.equal(p.best[0], 20000);
  assert.equal(solvedCount(p), 1);
  assert.ok(isOpen(p, 0) && isOpen(p, 2) && isOpen(p, 3));
  assert.equal(isOpen(p, 4), false);
  recordSolve(p, 2, { ms: 1, clean: false });
  assert.ok(isOpen(p, 4), 'решено два из первых четырёх — открыт пятый');
  assert.deepEqual(normalizeProgress({ done: [2, 'x', 1], best: [-5, 7] }, 3), { v: 1, done: [2, 0, 1], best: [0, 7, 0] });
  assert.deepEqual(normalizeSettings({ check: false, skin: 'zzz' }), { check: false, autoCross: true, highlight: true, skin: 'telegram' });
  assert.equal(fmtTime(65_000), '1:05');
});

test('все уровни: 100, разделы покрывают их по порядку, у каждого — палитра на все символы', () => {
  assert.equal(LEVELS.length, 100);
  let next = 0;
  for (const s of SECTIONS) {
    assert.equal(s.from, next);
    next = s.to + 1;
  }
  assert.equal(next, LEVELS.length);
  LEVELS.forEach((lvl, k) => {
    assert.ok(lvl.title && typeof lvl.title === 'string', `уровень ${k + 1}: название`);
    const w = lvl.art[0].length;
    assert.ok(lvl.art.every((r) => r.length === w), `уровень ${k + 1}: строки одной длины`);
    for (const ch of lvl.art.join('')) if (ch !== '.') assert.ok(lvl.pal[ch], `уровень ${k + 1}: нет цвета «${ch}»`);
    const mask = maskOf(lvl);
    assert.ok(mask.flat().some(Boolean), `уровень ${k + 1}: пустой`);
  });
});

test('все уровни решаются одной логикой по линиям (значит, решение у каждого одно)', () => {
  LEVELS.forEach((lvl, k) => {
    const mask = maskOf(lvl);
    const res = lineSolve(mask[0].length, mask.length, cluesOfGrid(mask));
    assert.ok(res.solved, `уровень ${k + 1} «${lvl.title}»: без угадывания не решается`);
    assert.deepEqual(res.grid, mask.flat(), `уровень ${k + 1}: решение не совпало с картинкой`);
  });
});
