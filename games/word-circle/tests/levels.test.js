// Уровни «Круга слов» (levels.json): каждый — целый кроссворд из слов, которые складываются из букв круга;
// без грубых и неуместных слов; раскладка генератора сверяется с независимой проверкой.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { parseLevel, levelProblems, canForm, MAX_COLS, MAX_ROWS, CHAPTER } from '../logic.js';
import { layout, layoutOnce, rngOf, shapeOf, TOTAL } from '../../../tools/word-circle-levels.mjs';
import { KNOWN_EXTRA, BONUS_EXTRA, RUDE, AVOID } from '../../../tools/word-circle-words.mjs';

const file = new URL('../levels.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const levels = data.levels.map(parseLevel);
const norm = (w) => w.toLowerCase().replace(/ё/g, 'е');

test('файл уровней: шестьсот строк, целое число глав, не тяжелее четверти мегабайта', () => {
  assert.equal(data.v, 1);
  assert.equal(data.levels.length, TOTAL);
  assert.equal(TOTAL % CHAPTER, 0);
  assert.ok(statSync(file).size < 256 * 1024, `размер ${statSync(file).size}`);
  assert.ok(data.levels.every((t) => typeof t === 'string' && /^[а-я]{3,7}\|[а-я0-9,;]+\|[а-я,]*$/.test(t)));
});

test('каждый уровень — правильный кроссворд (независимая проверка)', () => {
  levels.forEach((lv, i) => {
    assert.deepEqual(levelProblems(lv), [], `уровень ${i + 1}: ${data.levels[i]}`);
    assert.ok(lv.cols <= MAX_COLS && lv.rows <= MAX_ROWS, `уровень ${i + 1}: ${lv.cols}×${lv.rows}`);
  });
});

test('первое слово уровня — из всех букв круга, а буквы в круге его не выдают', () => {
  levels.forEach((lv, i) => {
    const base = lv.words[0].word;
    assert.equal([...base].sort().join(''), [...lv.letters].sort().join(''), `уровень ${i + 1}`);
    if (new Set(lv.letters).size > 1) assert.notEqual(lv.letters.join(''), base, `уровень ${i + 1}: буквы стоят готовым словом`);
    assert.equal(lv.words[0].dir, 0, 'основа лежит по горизонтали');
  });
});

test('сложность растёт: три буквы → четыре → пять → шесть и семь; слов — от двух до девяти', () => {
  const lettersOf = (i) => levels[i - 1].letters.length;
  assert.deepEqual([1, 2, 3].map(lettersOf), [3, 3, 3]);
  for (let n = 4; n <= 15; n++) assert.equal(lettersOf(n), 4, `уровень ${n}`);
  for (let n = 16; n <= 50; n++) assert.equal(lettersOf(n), 5, `уровень ${n}`);
  for (let n = 51; n <= TOTAL; n++) assert.ok(lettersOf(n) >= 5 && lettersOf(n) <= 7, `уровень ${n}`);
  assert.ok(levels.slice(120).filter((lv) => lv.letters.length === 7).length > 120, 'семибуквенных хватает');
  const rng = rngOf(1);
  levels.forEach((lv, i) => {
    assert.ok(lv.words.length >= 2 && lv.words.length <= 9, `уровень ${i + 1}: слов ${lv.words.length}`);
    if (i + 1 <= 120) {
      const [letters, lo] = shapeOf(i + 1, rng);
      assert.equal(lv.letters.length, letters, `уровень ${i + 1}`);
      assert.ok(lv.words.length >= lo, `уровень ${i + 1}: слов ${lv.words.length}, надо от ${lo}`);
    }
  });
  const avg = (list) => list.reduce((a, lv) => a + lv.words.length, 0) / list.length;
  assert.ok(avg(levels.slice(300)) > avg(levels.slice(0, 50)) + 1.5, 'дальше — больше слов');
});

test('наборы букв не повторяются, одно слово загадывается не чаще шести раз', () => {
  const sets = new Set(levels.map((lv) => [...lv.letters].sort().join('')));
  assert.equal(sets.size, levels.length);
  const uses = new Map();
  for (const lv of levels) for (const w of lv.words) uses.set(w.word, (uses.get(w.word) ?? 0) + 1);
  for (const [w, k] of uses) assert.ok(k <= 6, `«${w}» загадано ${k} раз`);
  assert.ok(uses.size > 1200, `разных слов в кроссвордах: ${uses.size}`);
  // одно и то же слово не идёт на соседних уровнях
  for (let i = 1; i < levels.length; i++) {
    const prev = new Set(levels[i - 1].words.map((w) => w.word));
    for (const w of levels[i].words) assert.ok(!prev.has(w.word), `«${w.word}» на уровнях ${i} и ${i + 1}`);
  }
});

test('в кроссвордах нет грубых и неуместных слов, в бонусных — грубых', () => {
  const rude = new Set(RUDE.map(norm));
  const avoid = new Set([...RUDE, ...AVOID].map(norm));
  levels.forEach((lv, i) => {
    for (const w of lv.words) assert.ok(!avoid.has(w.word), `уровень ${i + 1}: «${w.word}»`);
    for (const b of lv.bonus) assert.ok(!rude.has(b), `уровень ${i + 1}: бонусное «${b}»`);
  });
});

test('словарь современный: новые слова принимаются и загадываются', () => {
  const grid = new Set(levels.flatMap((lv) => lv.words.map((w) => w.word)));
  const all = new Set([...grid, ...levels.flatMap((lv) => [...lv.bonus])]);
  for (const w of ['сайт', 'чат', 'блог', 'лайк', 'мем', 'дрон', 'спам', 'стрим', 'логин', 'квест', 'донат', 'латте', 'релиз', 'трек']) {
    assert.ok(all.has(w), `«${w}» нигде не принимается`);
  }
  const modern = KNOWN_EXTRA.map(norm).filter((w) => grid.has(w));
  assert.ok(modern.length >= 90, `современных слов в кроссвордах: ${modern.length}`);
  // и встречаются они с самого начала, а не только к концу игры
  assert.ok(modern.filter((w) => levels.slice(0, 100).some((lv) => lv.words.some((x) => x.word === w))).length >= 15);
  // свои списки не спорят друг с другом
  const known = new Set(KNOWN_EXTRA.map(norm));
  for (const w of RUDE.map(norm)) assert.ok(!known.has(w) && !BONUS_EXTRA.map(norm).includes(w), w);
  for (const w of AVOID.map(norm)) assert.ok(!known.has(w), `«${w}» и загадывается, и нет`);
  for (const list of [KNOWN_EXTRA, BONUS_EXTRA]) for (const w of list) assert.match(norm(w), /^[а-я]{3,7}$/, w);
});

test('бонусные слова: складываются из букв, не стоят в кроссворде, идут по алфавиту', () => {
  let total = 0;
  levels.forEach((lv, i) => {
    const list = [...lv.bonus];
    total += list.length;
    for (const b of list) assert.ok(canForm(b, lv.letters), `уровень ${i + 1}: «${b}»`);
    assert.deepEqual(list, [...list].sort(), `уровень ${i + 1}`);
  });
  assert.ok(total / levels.length > 8, `бонусных в среднем ${(total / levels.length).toFixed(1)}`);
});

test('раскладка генератора: что бы ни разложили — получается правильный кроссворд', () => {
  const rng = rngOf(42);
  let placedAll = 0;
  for (let i = 0; i < levels.length; i += 3) {
    const lv = levels[i];
    const words = lv.words.map((w) => w.word);
    const bonus = [...lv.bonus].filter((b) => b.length >= 3).slice(0, 4);
    for (const res of [layout(words, rng, 12), layoutOnce([...words, ...bonus], rng)]) {
      assert.equal(res.placed[0].word, words[0]);
      assert.ok(res.cols <= MAX_COLS && res.rows <= MAX_ROWS);
      if (res.placed.length < 2) continue;
      const text = `${lv.letters.join('')}|${res.placed.map((p) => `${p.word},${p.x},${p.y},${p.dir}`).join(';')}|`;
      assert.deepEqual(levelProblems(parseLevel(text)), [], text);
    }
    if (layout(words, rng, 30).placed.length === words.length) placedAll++;
  }
  assert.ok(placedAll > (levels.length / 3) * 0.9, `слова уровня раскладываются заново: ${placedAll} из ${Math.ceil(levels.length / 3)}`);
});
