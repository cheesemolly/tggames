// Словарь «Эрудита» (words/ru.json): только то, что можно выложить фишками набора, и запись в лицензиях.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIZE, TILES, BLANKS } from '../logic.js';

const data = JSON.parse(readFileSync(new URL('../words/ru.json', import.meta.url), 'utf8'));

test('слова: строчные а–я без ё, от 2 до 15 букв, по алфавиту и без повторов', () => {
  assert.ok(data.words.length > 45000);
  for (const w of data.words) assert.match(w, /^[а-я]{2,15}$/u, w);
  assert.ok(data.words.every((w) => w.length <= SIZE));
  for (let k = 1; k < data.words.length; k++) assert.ok(data.words[k - 1] < data.words[k], data.words[k]);
});

test('слова: есть двухбуквенные (без них не приставить слово вплотную) и слова с «ъ»', () => {
  const two = data.words.filter((w) => w.length === 2);
  assert.ok(two.length >= 30 && two.length <= 60, `двухбуквенных: ${two.length}`);
  for (const w of ['ад', 'ар', 'еж', 'ил', 'ом', 'уж', 'ум', 'ус', 'щи', 'юг', 'яд', 'як', 'ям']) assert.ok(two.includes(w), w);
  // междометия, местоимения и частицы из исходного списка не берём
  for (const w of ['ах', 'ох', 'ау', 'он', 'за', 'ни', 'но', 'то']) assert.ok(!two.includes(w), w);
  assert.ok(data.words.includes('подъезд'));
  assert.ok(data.words.includes('объем'), 'ё = е');
  for (const w of ['кот', 'слово', 'эрудит', 'еж', 'елка']) assert.ok(data.words.includes(w), w);
});

test('слова: каждое можно собрать из набора фишек (со звёздочками)', () => {
  for (const w of data.words) {
    const need = {};
    for (const ch of w) need[ch] = (need[ch] ?? 0) + 1;
    const lack = Object.entries(need).reduce((n, [ch, k]) => n + Math.max(0, k - TILES[ch][0]), 0);
    assert.ok(lack <= BLANKS, w);
  }
});

test('частые слова — подмножество словаря, от 3 букв', () => {
  const all = new Set(data.words);
  assert.ok(data.common.length > 2000);
  for (const w of data.common) {
    assert.ok(all.has(w), w);
    assert.ok(w.length >= 3, w);
  }
});

test('источник словаря назван в обеих лицензиях', () => {
  for (const file of ['LICENSE', 'LICENSE.ru.md']) {
    const text = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
    assert.ok(text.includes('games/erudit/words/ru.json'), file);
    assert.ok(text.includes('Harrix/Russian-Nouns'), file);
  }
});
