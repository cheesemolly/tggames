// Правила «Круга слов»: разбор уровня, независимая проверка кроссворда, слова, подсказки, монеты, сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_COINS, COSTS, ROCKET_CELLS, CHAPTER, MAX_COLS, MAX_ROWS,
  parseLevel, canForm, levelProblems, levelText, chapterOf, endsChapter, reward, reorder, newState, isValidState,
  shownCells, settle, isDone, submit, hiddenCells, revealRandom, revealCell,
  emptyProgress, migrateProgress, isValidProgress, spend, emptyStats, migrateStats, isValidStats,
} from '../logic.js';

// к о р т        «корт» по горизонтали, «кот» и «рот» вниз от К и Р, «ток» по нижнему ряду не стоит — он бонусный
// о · о ·
// т · т ·
const TEXT = 'ткро|корт,0,0,0;кот,0,0,1;рот,2,0,1|ток,орт,рок,торк';
const level = () => parseLevel(TEXT);

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('разбор уровня: буквы, слова, общие клетки на пересечениях, размер, бонусные', () => {
  const lv = level();
  assert.deepEqual(lv.letters, ['т', 'к', 'р', 'о']);
  assert.deepEqual(lv.words.map((w) => [w.word, w.x, w.y, w.dir]), [['корт', 0, 0, 0], ['кот', 0, 0, 1], ['рот', 2, 0, 1]]);
  assert.equal(lv.cells.length, 8, 'четыре клетки «корта» и по две своих у «кота» и «рота»');
  assert.equal(lv.cols, 4);
  assert.equal(lv.rows, 3);
  assert.deepEqual(lv.words[1].cells[0], lv.words[0].cells[0], 'К — одна клетка на два слова');
  assert.deepEqual(lv.cells[lv.words[0].cells[2]].words, [0, 2]);
  assert.deepEqual([...lv.bonus], ['ток', 'орт', 'рок', 'торк']);
  assert.deepEqual(levelProblems(lv), []);
  const empty = parseLevel('');
  assert.deepEqual([empty.letters.length, empty.words.length, empty.cells.length, empty.bonus.size], [0, 0, 0, 0]);
});

test('слово складывается из букв круга, только если букв хватает', () => {
  assert.ok(canForm('корт', [...'ткро']));
  assert.ok(canForm('ток', [...'ткро']));
  assert.ok(!canForm('торт', [...'ткро']), 'второй Т нет');
  assert.ok(canForm('торт', [...'ттро']));
  assert.ok(!canForm('кора', [...'ткро']));
});

test('проверка кроссворда ловит всё, что портит уровень', () => {
  const bad = (text, pattern) => {
    const problems = levelProblems(parseLevel(text));
    assert.ok(problems.some((p) => pattern.test(p)), `${text}: ${problems.join('; ') || 'ошибок не найдено'}`);
  };
  bad('ткро|корт,0,0,0;кот,1,0,1|', /в клетке уже|лишняя цепочка/);            // «кот» вниз от О: К ≠ О
  bad('ткро|корт,0,0,0;кот,0,0,1;рот,1,1,0|', /лишняя цепочка|цепочек/);        // «рот» вплотную под «кортом»
  bad('ткро|корт,0,0,0;кот,0,2,0|', /не связан|цепочек|лишняя/);                // слова не касаются
  bad('ткро|корт,0,0,0;кора,0,0,1|', /не складывается/);
  bad('ткро|корт,0,0,0;корт,0,0,1|', /дважды|в клетке уже/);
  bad('ткро|корт,0,0,0|', /слов: 1/);
  bad('тк|кот,0,0,0;ток,0,0,1|', /букв в круге|не складывается/);
  bad('ткро|корт,0,0,0;кот,0,0,1|кот', /стоит в кроссворде/);
  bad('ткро|корт,0,0,0;кот,0,0,1|кора', /бонусное «кора» не складывается/);
  bad('ткро|корт,0,0,0;кот,0,0,1|от', /бонусное «от»/);
  bad('ткро|ко,0,0,0;кот,0,0,1|', /слово «ко»/);
  assert.deepEqual(levelProblems(parseLevel('абвгдеж|абвгдеж,0,0,0;агд,0,0,1;вед,2,0,1|')), []);
  assert.ok(MAX_COLS >= 7 && MAX_ROWS >= 6);
  bad('абвгдежз|абвгдежз,0,0,0;агд,0,0,1|', /букв в круге/);
  bad('абвгдеж|абвгдеж,0,0,0;агдежба,0,0,1;бегажвд,1,0,1|', /кроссворд 7×7|лишняя|цепочек/);
});

test('слово: найдено, уже есть, бонусное, короткое, нет такого', () => {
  const lv = level();
  const st = newState(1, lv);
  assert.deepEqual(submit(lv, st, 'ко'), { kind: 'short' });
  assert.deepEqual(submit(lv, st, 'кор'), { kind: 'none' });
  assert.deepEqual(submit(lv, st, 'КОТ'), { kind: 'found', index: 1, also: [] });
  assert.deepEqual(submit(lv, st, 'кот'), { kind: 'again', index: 1 });
  assert.deepEqual(submit(lv, st, 'ток'), { kind: 'bonus' });
  assert.deepEqual(submit(lv, st, 'ток'), { kind: 'bonus-again' });
  assert.deepEqual(st.found, [1]);
  assert.deepEqual(st.bonus, ['ток']);
  assert.ok(!isDone(lv, st));
  submit(lv, st, 'рот');
  assert.deepEqual(submit(lv, st, 'корт'), { kind: 'found', index: 0, also: [] });
  assert.ok(isDone(lv, st));
  // ё и е — одна буква
  const lv2 = parseLevel('еклна|елка,0,0,0;лен,1,0,1|');
  assert.equal(submit(lv2, newState(1, lv2), 'ёлка').kind, 'found');
});

test('слово, у которого открыты все буквы, считается найденным само', () => {
  // к о т      «кот» и «ток» по горизонтали, «кот»… нет: проверяем на трёх словах-рамке
  // у · о      «кот» сверху, «кук» слева вниз, «ток» справа вниз, «кок» снизу — последнее закроется само
  // к о к
  const lv = parseLevel('ккотуо|кот,0,0,0;кук,0,0,1;ток,2,0,1;кок,0,2,0|');
  assert.deepEqual(levelProblems(lv), []);
  const st = newState(3, lv);
  submit(lv, st, 'кук');
  submit(lv, st, 'ток');
  assert.deepEqual(st.found, [1, 2]);
  // у «кок» открыты К и К, не хватает О — открываем подсказкой именно её
  const middle = lv.words[3].cells[1];
  assert.deepEqual(revealCell(lv, st, middle), { cells: [middle], words: [3] });
  assert.ok(st.found.includes(3));
  assert.deepEqual(submit(lv, st, 'кок'), { kind: 'again', index: 3 });
  // последнее слово закрывается находкой — и уровень пройден
  assert.deepEqual(submit(lv, st, 'кот'), { kind: 'found', index: 0, also: [] });
  assert.ok(isDone(lv, st));
});

test('находка слова заодно закрывает слово, которое осталось без закрытых букв', () => {
  const lv = parseLevel('ккотуо|кот,0,0,0;кук,0,0,1;ток,2,0,1;кок,0,2,0|');
  const st = newState(1, lv);
  st.open.push(lv.words[3].cells[1]);                 // О в «кок» открыта подсказкой
  submit(lv, st, 'кук');
  assert.deepEqual(submit(lv, st, 'ток'), { kind: 'found', index: 2, also: [3] });
  assert.deepEqual(settle(lv, st), [], 'повторный пересчёт ничего не добавляет');
});

test('подсказки: случайные клетки без повторов, клетка по выбору, закрытые слова', () => {
  const lv = level();
  const st = newState(1, lv);
  assert.equal(hiddenCells(lv, st).length, 8);
  const one = revealRandom(lv, st, 1, rngOf(3));
  assert.equal(one.cells.length, 1);
  assert.equal(hiddenCells(lv, st).length, 7);
  assert.equal(revealCell(lv, st, one.cells[0]), null, 'открытую клетку второй раз не открыть');
  assert.equal(revealCell(lv, st, 99), null);
  assert.equal(revealCell(lv, st, -1), null);
  const five = revealRandom(lv, st, ROCKET_CELLS, rngOf(5));
  assert.equal(five.cells.length, 5);
  assert.equal(new Set([...st.open]).size, 6);
  const rest = revealRandom(lv, st, ROCKET_CELLS, rngOf(7));
  assert.equal(rest.cells.length, 2, 'открывается столько, сколько осталось');
  assert.ok(isDone(lv, st));
  assert.deepEqual([...shownCells(lv, st)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(revealRandom(lv, st, 1, rngOf(1)), { cells: [], words: [] });
  // сколько бы подсказок ни было, слова закрываются ровно по разу
  assert.equal(new Set(st.found).size, st.found.length);
  assert.equal(st.found.length, 3);
});

test('перемешивание: те же буквы в другом порядке', () => {
  for (let seed = 1; seed < 40; seed++) {
    const order = [0, 1, 2, 3, 4];
    const next = reorder(order, rngOf(seed));
    assert.deepEqual([...next].sort(), order);
    assert.notDeepEqual(next, order);
  }
  assert.deepEqual(reorder([0], rngOf(1)), [0]);
  assert.notDeepEqual(reorder([0, 1], () => 0.99), [0, 1], 'даже если случай выдаёт тот же порядок');
});

test('сохранённый уровень: принимается целый, испорченный — нет', () => {
  const lv = level();
  const ok = () => ({ v: 1, level: 7, found: [1], open: [3], bonus: ['ток'], order: [3, 2, 1, 0] });
  assert.ok(isValidState(ok(), lv, 7));
  assert.ok(isValidState(newState(7, lv), lv, 7));
  const broken = [
    null, 5, [], { ...ok(), v: 2 }, { ...ok(), level: 0 }, { ...ok(), level: 7.5 },
    { ...ok(), found: [3] }, { ...ok(), found: [1, 1] }, { ...ok(), found: 'кот' },
    { ...ok(), open: [8] }, { ...ok(), open: [-1] },
    { ...ok(), bonus: ['кора'] }, { ...ok(), bonus: ['ток', 'ток'] }, { ...ok(), bonus: null },
    { ...ok(), order: [0, 1, 2] }, { ...ok(), order: [0, 1, 2, 2] }, { ...ok(), order: [0, 1, 2, 4] },
  ];
  for (const s of broken) assert.equal(isValidState(s, lv, 7), false, JSON.stringify(s));
  assert.equal(isValidState(ok(), lv, 8), false, 'сохранение другого уровня');
});

test('уровни идут по кругу, главы — по двадцать, награда растёт с кроссвордом', () => {
  const levels = ['а', 'б', 'в'];
  assert.equal(levelText(levels, 1), 'а');
  assert.equal(levelText(levels, 3), 'в');
  assert.equal(levelText(levels, 4), 'а');
  assert.equal(levelText(levels, 0), 'а');
  assert.equal(levelText(levels, 7.9), 'а');
  assert.equal(levelText([], 1), '');
  assert.equal(CHAPTER, 20);
  assert.deepEqual([1, 20, 21, 40, 41].map(chapterOf), [0, 0, 1, 1, 2]);
  assert.deepEqual([19, 20, 21, 40].map(endsChapter), [false, true, false, true]);
  const small = parseLevel('кот|кот,0,0,0;ток,2,0,1|');
  const big = parseLevel('ккотуо|кот,0,0,0;кук,0,0,1;ток,2,0,1;кок,0,2,0|');
  assert.ok(reward(big) > reward(small));
  assert.ok(reward(small) >= 10 && reward(big) <= 40);
  // одной награды за уровень хватает не больше чем на одну букву-подсказку: подсказки не обесценивают игру
  assert.ok(reward(big) < COSTS.cell);
  assert.ok(COSTS.letter < COSTS.cell && COSTS.cell < COSTS.rocket && COSTS.rocket < COSTS.letter * ROCKET_CELLS);
});

test('прогресс и монеты', () => {
  assert.deepEqual(emptyProgress(), { level: 1, coins: START_COINS });
  assert.ok(isValidProgress(emptyProgress()));
  assert.deepEqual(migrateProgress({ level: 14, coins: 37 }), { level: 14, coins: 37 });
  assert.deepEqual(migrateProgress({ level: -2, coins: -5 }), { level: 1, coins: START_COINS });
  assert.deepEqual(migrateProgress({ level: 3, coins: 0 }), { level: 3, coins: 0 });
  assert.deepEqual(migrateProgress('мусор'), emptyProgress());
  assert.equal(isValidProgress({ level: 2 }), false);
  const p = { level: 1, coins: 60 };
  assert.equal(spend(p, 25), true);
  assert.equal(p.coins, 35);
  assert.equal(spend(p, 50), false);
  assert.equal(p.coins, 35);
  assert.equal(spend(p, 0), false);
  assert.equal(spend(p, 35), true);
  assert.equal(p.coins, 0);
});

test('статистика: мусор из хранилища превращается в нули', () => {
  assert.deepEqual(emptyStats(), { levels: 0, words: 0, bonus: 0, hints: 0 });
  assert.ok(isValidStats(emptyStats()));
  assert.deepEqual(migrateStats({ levels: 5, words: -1, bonus: 'много', hints: 2.5, чужое: 1 }), { levels: 5, words: 0, bonus: 0, hints: 0 });
  assert.deepEqual(migrateStats(null), emptyStats());
  assert.equal(isValidStats({ levels: 1 }), false);
});
