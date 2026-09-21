// Словари: каждое слово должно быть набираемо на экранной клавиатуре своего языка —
// иначе такое загаданное слово не угадать никогда. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, LANG_ORDER, toLetter } from '../languages.js';
import { WORD_LEN } from '../logic.js';

for (const id of LANG_ORDER) {
  const { answers, allowed } = JSON.parse(readFileSync(LANGUAGES[id].words, 'utf8'));

  test(`${id}: словарь не пустой и без дублей`, () => {
    assert.ok(answers.length > 500, `загадок всего ${answers.length}`);
    assert.equal(new Set(answers).size, answers.length);
    assert.equal(new Set(allowed).size, allowed.length);
    // allowed хранит только слова сверх загадок — пересечение было бы лишним весом
    assert.equal(answers.filter((w) => allowed.includes(w)).length, 0);
  });

  test(`${id}: каждое слово — ${WORD_LEN} букв, набираемых на клавиатуре`, () => {
    for (const word of [...answers, ...allowed]) {
      const letters = [...word];
      assert.equal(letters.length, WORD_LEN, word);
      for (const ch of letters) assert.equal(toLetter(id, ch), ch, `«${word}»: буквы «${ch}» нет на клавиатуре`);
    }
  });

  test(`${id}: на клавиатуре нет повторов`, () => {
    const keys = [...LANGUAGES[id].rows.join('')];
    assert.equal(new Set(keys).size, keys.length);
  });
}
