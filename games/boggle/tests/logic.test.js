// Правила «слов на сетке» и словарь. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIZES, WORDS_BY_SIZE, createDictionary, hasPrefix, lineCells, snapLine, cellsWord, lineWords,
  generatePuzzle, checkSelection, applyWord, bankPoints, bonusPoints, isComplete, newGame, isValidState,
  emptyStats, recordGame, isValidStats, normalize,
} from '../logic.js';

const data = JSON.parse(readFileSync(new URL('../words/ru.json', import.meta.url), 'utf8'));
const dict = createDictionary(data.words, data.common);

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('словарь: только строчные а–я, от 3 букв, без ё и ъ, частые — подмножество', () => {
  assert.ok(data.words.length > 40000);
  for (const w of data.words) assert.match(w, /^[а-я]{3,16}$/u, w);
  assert.ok(!data.words.some((w) => w.includes('ъ')));
  const all = new Set(data.words);
  assert.ok(data.common.every((w) => all.has(w)));
  for (const w of ['кот', 'торт', 'дом', 'слово']) assert.ok(dict.set.has(w), w);
  assert.ok(hasPrefix(dict, 'тор'));
  assert.equal(hasPrefix(dict, 'ъъъ'), false);
});

test('lineCells: только прямые — горизонталь, вертикаль, диагональ, в любую сторону', () => {
  assert.deepEqual(lineCells(0, 3, 8), [0, 1, 2, 3]);
  assert.deepEqual(lineCells(3, 0, 8), [3, 2, 1, 0]);
  assert.deepEqual(lineCells(0, 24, 8), [0, 8, 16, 24]);
  assert.deepEqual(lineCells(0, 27, 8), [0, 9, 18, 27]);
  assert.deepEqual(lineCells(7, 21, 8), [7, 14, 21]);
  assert.equal(lineCells(0, 10, 8), null, 'ход конём — не прямая');
  assert.equal(lineCells(0, 17, 8), null);
  assert.deepEqual(lineCells(5, 5, 8), [5]);
});

test('snapLine: палец чуть мимо — прямая всё равно ровная и не выходит за поле', () => {
  // старт (0,0), палец в (2.6, 3.4) — ближе к диагонали вниз-вправо
  assert.deepEqual(snapLine(0, 2.6, 3.4, 8), lineCells(0, 27, 8));
  // почти горизонтально вправо
  assert.deepEqual(snapLine(0, 0.9, 4.5, 8), [0, 1, 2, 3, 4]);
  // за край поля — обрезается
  assert.deepEqual(snapLine(6, 0.5, 20, 8), [6, 7]);
  // на месте — одна клетка
  assert.deepEqual(snapLine(9, 1.5, 1.6, 8), [9]);
  for (let k = 0; k < 300; k++) {
    const size = 12;
    const start = Math.floor(Math.random() * 144);
    const cells = snapLine(start, Math.random() * 16 - 2, Math.random() * 16 - 2, size);
    assert.ok(cells.every((i) => i >= 0 && i < 144));
    assert.deepEqual(lineCells(cells[0], cells.at(-1), size), cells, 'всегда прямая');
  }
});

test('генерация: банк нужного размера, слова частые, стоят по прямой там, где записаны', () => {
  const rng = seeded(5);
  const common = new Set(dict.common);
  for (const size of SIZES) {
    const { grid, bank, bonusTotal } = generatePuzzle(size, dict, rng);
    assert.equal(bank.length, WORDS_BY_SIZE[size]);
    assert.equal(new Set(bank.map((b) => b.word)).size, bank.length);
    for (const { word, cells } of bank) {
      assert.ok(common.has(word), word);
      assert.deepEqual(lineCells(cells[0], cells.at(-1), size), cells, `${word} не по прямой`);
      assert.equal(cellsWord(grid, cells), word);
    }
    assert.ok(!bank.some((a) => bank.some((b) => a !== b && b.word.includes(a.word))), 'слова не входят одно в другое');
    assert.ok(grid.every((l) => /^[а-я]$/u.test(l)));
    assert.ok(bonusTotal >= 0);
  }
});

test('lineWords находит слова банка, бонусные — только по прямой', () => {
  const rng = seeded(8);
  const { grid, bank } = generatePuzzle(10, dict, rng);
  const words = lineWords(grid, 10, dict);
  for (const b of bank) assert.ok(words.has(b.word), b.word);
  for (const w of words) assert.ok(dict.set.has(w) && w.length >= 3);
});

test('выделение: слово банка, в обратную сторону, повтор, бонус, мусор', () => {
  const size = 8;
  // поле из «щ», в первой строке — «торт», во второй — «кот» (бонус)
  const grid = Array(64).fill('щ');
  [...'торт'].forEach((ch, k) => { grid[k] = ch; });
  [...'кот'].forEach((ch, k) => { grid[8 + k] = ch; });
  const s = newGame(size, { grid, bank: [{ word: 'торт', cells: [0, 1, 2, 3] }], bonusTotal: 1 });

  assert.equal(checkSelection(s, [0, 1], dict).verdict, 'short');
  const back = checkSelection(s, [3, 2, 1, 0], dict);
  assert.deepEqual(back, { verdict: 'bank', word: 'торт' }, 'читается и справа налево');
  assert.equal(applyWord(s, 'bank', 'торт', [3, 2, 1, 0]), bankPoints('торт'));
  assert.equal(checkSelection(s, [0, 1, 2, 3], dict).verdict, 'repeat');
  assert.ok(isComplete(s));

  const bonus = checkSelection(s, [8, 9, 10], dict);
  assert.deepEqual(bonus, { verdict: 'bonus', word: 'кот' });
  assert.equal(applyWord(s, 'bonus', 'кот', [8, 9, 10]), bonusPoints('кот'));
  assert.equal(checkSelection(s, [8, 9, 10], dict).verdict, 'repeat');
  // справа налево «кот» читается как «ток» — это другое слово, тоже бонус
  assert.deepEqual(checkSelection(s, [10, 9, 8], dict), { verdict: 'bonus', word: 'ток' });
  assert.equal(checkSelection(s, [16, 17, 18], dict).verdict, 'unknown');
  assert.equal(s.score, 40 + 15);
  assert.equal(normalize('ЁЖ'), 'еж');
});

test('сохранение и статистика', () => {
  const s = newGame(8, generatePuzzle(8, dict, seeded(2)));
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, size: 9 }), false);
  assert.equal(isValidState({ ...s, grid: s.grid.slice(1) }), false);
  let st = emptyStats();
  st = recordGame(st, { ...s, score: 300, bonus: ['кот', 'дом'] });
  st = recordGame(st, { ...s, score: 100, bonus: [] });
  assert.deepEqual(st, { played: 2, best: 300, bonus: 2 });
  assert.ok(isValidStats(st));
});
