// Правила Boggle и словарь. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIZES, TIME_BY_SIZE, createDictionary, hasPrefix, neighbors, isAdjacent, isValidPath, pathWord,
  randomGrid, solve, findPath, generateGrid, wordScore, checkWord, addWord, newGame, isValidState,
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

// 4×4, где точно есть «кот», «ток», «рот», «торт»: к о т . / . р т . / ...
const G = [
  'к', 'о', 'т', 'ы',
  'щ', 'р', 'т', 'ф',
  'щ', 'щ', 'щ', 'щ',
  'щ', 'щ', 'щ', 'щ',
];

test('словарь: только строчные а–я, от 3 букв, без ё и ъ, частые — подмножество', () => {
  assert.ok(data.words.length > 40000);
  for (const w of data.words) assert.match(w, /^[а-яё]{3,16}$/u, w);
  assert.ok(!data.words.some((w) => w.includes('ё') || w.includes('ъ')));
  const all = new Set(data.words);
  assert.ok(data.common.every((w) => all.has(w)));
  for (const w of ['кот', 'торт', 'дом', 'слово']) assert.ok(dict.set.has(w), w);
});

test('префиксы', () => {
  assert.ok(hasPrefix(dict, 'то'));
  assert.ok(hasPrefix(dict, 'торт'));
  assert.equal(hasPrefix(dict, 'ъъъ'), false);
  assert.equal(hasPrefix(dict, 'щщщщ'), false);
});

test('соседи и пути: 8 направлений, без повторов клеток', () => {
  assert.equal(neighbors(4)[0].length, 3);
  assert.equal(neighbors(4)[5].length, 8);
  assert.equal(neighbors(10)[99].length, 3);
  assert.ok(isAdjacent(0, 5, 4));             // диагональ
  assert.equal(isAdjacent(0, 2, 4), false);
  assert.equal(isAdjacent(3, 4, 4), false, 'конец строки и начало следующей — не соседи');
  assert.ok(isValidPath([0, 1, 2], 4));
  assert.equal(isValidPath([0, 1, 0], 4), false);
  assert.equal(isValidPath([0, 2], 4), false);
  assert.equal(pathWord(G, [0, 1, 2]), 'кот');
});

test('solve находит слова, и у каждого найденного есть корректный путь', () => {
  const words = solve(G, 4, dict);
  for (const w of ['кот', 'ток', 'рот', 'торт']) assert.ok(words.has(w), w);
  for (const w of words) {
    const path = findPath(G, 4, w);
    assert.ok(path && isValidPath(path, 4) && pathWord(G, path) === w, w);
  }
  assert.equal(findPath(G, 4, 'кок'), null, 'клетку нельзя использовать дважды');
});

test('solve на случайных сетках: всё найденное — слова словаря с корректным путём', () => {
  const rng = seeded(3);
  for (const size of SIZES) {
    const grid = randomGrid(size, rng);
    const words = solve(grid, size, dict);
    for (const w of words) {
      assert.ok(dict.set.has(w) && w.length >= 3);
      const path = findPath(grid, size, w);
      assert.ok(path && isValidPath(path, size) && pathWord(grid, path) === w, `${size}: ${w}`);
    }
  }
});

test('generateGrid: большие поля дают много слов', () => {
  const rng = seeded(9);
  const small = generateGrid(4, dict, rng, 4);
  const big = generateGrid(10, dict, rng, 2);
  assert.equal(small.grid.length, 16);
  assert.equal(big.grid.length, 100);
  assert.ok(small.words.length >= 5, `4×4: ${small.words.length}`);
  assert.ok(big.words.length > small.words.length * 5, `10×10: ${big.words.length}`);
  assert.ok(big.words.every((w, k) => k === 0 || big.words[k - 1].length >= w.length), 'сначала длинные');
});

test('очки как в Boggle', () => {
  assert.deepEqual(['ab', 'кот', 'торт', 'слово', 'солнце', 'автобус', 'велосипед'].map(wordScore), [0, 1, 1, 2, 3, 5, 11]);
});

test('проверка слова: коротко, нет в словаре, повтор; ё = е', () => {
  const s = newGame(4, G, 10);
  assert.equal(checkWord(s, 'ко', dict), 'short');
  assert.equal(checkWord(s, 'ткт', dict), 'unknown');
  assert.equal(checkWord(s, 'КОТ', dict), 'ok');
  assert.equal(addWord(s, 'кот'), 1);
  assert.equal(checkWord(s, 'кот', dict), 'repeat');
  assert.equal(normalize('ЁЖ'), 'еж');
  assert.equal(s.score, 1);
  assert.equal(s.remainingMs, TIME_BY_SIZE[4] * 1000);
});

test('сохранение и статистика', () => {
  const s = newGame(4, G, 10);
  addWord(s, 'торт');
  assert.ok(isValidState(JSON.parse(JSON.stringify(s))));
  assert.equal(isValidState({ ...s, size: 7 }), false);
  assert.equal(isValidState({ ...s, grid: [...G.slice(1), 'q'] }), false);
  let st = emptyStats();
  st = recordGame(st, s);
  st = recordGame(st, { ...s, score: 0, found: ['кот'] });
  assert.deepEqual(st, { played: 2, best: 1, words: 2, longest: 'торт' });
  assert.ok(isValidStats(st));
});
