// Словарь «Эрудита» (games/erudit/words/ru.json) из списка существительных Harrix/Russian-Nouns (MIT):
//   node tools/erudit-words.mjs <путь к russian_nouns.txt>
// Файл списка: https://github.com/Harrix/Russian-Nouns/blob/main/dist/russian_nouns.txt
//
// words  — все слова, которые можно выложить: от 2 до 15 букв (поле 15×15), ё = е (фишки Ё в наборе нет),
//          без дефисов; слова с «ъ» остаются (фишка Ъ есть). Двухбуквенные — только из списка TWO ниже.
// common — частые слова (банк Филворда: Ляшевская, Шаров, 2009) — словарный запас слабых уровней бота.

import { readFileSync, writeFileSync } from 'node:fs';

// В исходном списке среди двухбуквенных есть междометия, местоимения и частицы («ах», «он», «ни») — их не берём.
const TWO = ('ад аз аи ар ас га до еж ер ил ир ли ля ми ом па пе пи ре ро си су уд уж ум ус ут фа фи хи щи '
  + 'юг юз юр юс ют яд як ял ям яр').split(' ');

const source = process.argv[2];
if (!source) {
  console.error('Нужен путь к russian_nouns.txt');
  process.exit(1);
}

const two = new Set(TWO);
const all = new Set();
for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  const word = line.trim().toLowerCase().replace(/ё/g, 'е');
  if (!/^[а-я]{2,15}$/.test(word)) continue;
  if (word.length === 2 && !two.has(word)) continue;
  all.add(word);
}
const words = [...all].sort();

const bank = JSON.parse(readFileSync(new URL('../games/boggle/words/ru.json', import.meta.url), 'utf8')).common;
const common = bank.filter((w) => all.has(w)).sort();

const out = new URL('../games/erudit/words/ru.json', import.meta.url);
writeFileSync(out, `${JSON.stringify({ words, common })}\n`);
console.log(`слов: ${words.length}, частых: ${common.length}, двухбуквенных: ${words.filter((w) => w.length === 2).length}`);
