// Уровни «Кростика» (levels.json): каждый проходится — ответы на вопросы открывают всю фразу; вопросы не выдают
// ответов; файл собран генератором из текущих списков фраз и вопросов (иначе списки и игра разошлись бы).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  ALPHABET, MAX_ANSWER, MAX_WORD, givesAway, groupsOf, guess, isDone, levelProblems, newState, numberOf, parseLevel, phraseLetters, related,
} from '../logic.js';
import { GAP, MAX_USES, build, fileText, loadClues, loadPhrases, notes } from '../../../tools/crostic-levels.mjs';

const file = new URL('../levels.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
const levels = data.levels.map(parseLevel);

test('файл уровней: больше шестисот строк, не тяжелее трети мегабайта', () => {
  assert.equal(data.v, 1);
  assert.ok(levels.length >= 600, String(levels.length));
  assert.ok(statSync(file).size < 340 * 1024, `размер ${statSync(file).size}`);
  for (const text of data.levels) {
    assert.equal(typeof text, 'string');
    assert.equal(text.split('|').length, 5, text);
  }
});

test('файл собран из текущих списков фраз и вопросов', () => {
  const built = build();
  assert.equal(fileText(built.levels), raw.replace(/\r\n/g, '\n'), 'списки изменились — пересоберите: node tools/crostic-levels.mjs');
  assert.deepEqual(notes, [], 'в списках есть негодные строки');
  assert.deepEqual(built.failed, [], 'к какой-то фразе не подобрались вопросы');
});

test('каждый уровень годится (независимая проверка)', () => {
  levels.forEach((lv, i) => assert.deepEqual(levelProblems(lv), [], `уровень ${i + 1}: ${data.levels[i]}`));
});

test('шифр уровня — ровно буквы фразы и ответов, у каждой свой номер', () => {
  levels.forEach((lv, i) => {
    const used = new Set([...phraseLetters(lv), ...lv.clues.flatMap((c) => [...c.answer])]);
    assert.equal([...lv.order].sort().join(''), [...used].sort().join(''), `уровень ${i + 1}`);
    assert.ok([...lv.order].every((ch) => ALPHABET.includes(ch)));
    assert.ok(lv.order.length >= 7 && lv.order.length <= 24, `уровень ${i + 1}: букв ${lv.order.length}`);
    for (const ch of used) assert.ok(numberOf(lv, ch) >= 1);
  });
});

test('уровень проходится одними ответами: они открывают всю фразу', () => {
  levels.forEach((lv, i) => {
    const st = newState(i + 1, lv);
    for (const clue of lv.clues) for (const ch of clue.answer) guess(lv, st, numberOf(lv, ch), ch);
    assert.equal(st.mistakes, 0);
    assert.ok(isDone(lv, st), `уровень ${i + 1}: после всех ответов закрыты ${[...lv.order].filter((ch) => !st.open.includes(ch)).join('')}`);
  });
});

test('у каждого вопроса есть что отгадывать, лишних букв почти нет', () => {
  let extraTotal = 0;
  levels.forEach((lv, i) => {
    const inPhrase = new Set(phraseLetters(lv));
    const extra = new Set();
    for (const clue of lv.clues) {
      const hidden = new Set([...clue.answer].filter((ch) => !lv.start.includes(ch)));
      assert.ok(hidden.size >= 2, `уровень ${i + 1}: ${clue.answer}`);
      const own = [...new Set(clue.answer)].filter((ch) => !inPhrase.has(ch));
      assert.ok(own.length <= 1, `уровень ${i + 1}: в ответе «${clue.answer}» лишние буквы ${own.join('')}`);
      own.forEach((ch) => extra.add(ch));
    }
    assert.ok(extra.size <= 2, `уровень ${i + 1}: лишних букв ${extra.size}`);
    extraTotal += extra.size;
    // открыто сразу немного — фразу надо разгадывать
    assert.ok(lv.start.length >= 1 && lv.start.length <= 6, `уровень ${i + 1}: открыто ${lv.start.length}`);
    assert.ok([...inPhrase].filter((ch) => !lv.start.includes(ch)).length >= 5, `уровень ${i + 1}`);
  });
  assert.ok(extraTotal / levels.length < 0.5);
});

test('вопросы: не выдают ответ, не подсказывают слова фразы, помещаются в две строки', () => {
  levels.forEach((lv, i) => {
    const words = groupsOf(lv).filter((g) => g.zone === 'phrase').map((g) => g.letters.join(''));
    for (const clue of lv.clues) {
      assert.ok(clue.answer.length >= 3 && clue.answer.length <= MAX_ANSWER);
      assert.ok(clue.text.length >= 3 && clue.text.length <= 48, `уровень ${i + 1}: «${clue.text}»`);
      assert.ok(!givesAway(clue.text, clue.answer), `уровень ${i + 1}: «${clue.text}» выдаёт «${clue.answer}»`);
      assert.ok(!/[|;=]/.test(clue.text));
      for (const w of words) assert.ok(w.length < 3 || !related(clue.answer, w), `уровень ${i + 1}: «${clue.answer}» подсказывает «${w}»`);
    }
  });
});

test('фразы: не повторяются, слова помещаются в строку, у каждой есть источник', () => {
  const seen = new Set();
  const sources = new Map();
  levels.forEach((lv, i) => {
    const key = phraseLetters(lv).join('');
    assert.ok(!seen.has(key), `уровень ${i + 1}: фраза повторяется — ${lv.phrase}`);
    seen.add(key);
    assert.ok(key.length >= 12 && key.length <= 48, `уровень ${i + 1}: букв ${key.length}`);
    assert.ok(lv.words.every((w) => w.cells.length <= MAX_WORD), `уровень ${i + 1}`);
    assert.match(lv.phrase, /^[А-ЯЁ«]/, `уровень ${i + 1}: фраза с маленькой буквы`);
    assert.ok(lv.source.length >= 4 && lv.source.length <= 24, `уровень ${i + 1}: «${lv.source}»`);
    sources.set(lv.source, (sources.get(lv.source) ?? 0) + 1);
  });
  // пословицы, классики и факты — всего понемногу
  assert.ok(sources.get('Пословица') >= 250);
  assert.ok(sources.get('Факт') >= 70);
  assert.ok(sources.get('А. С. Пушкин') >= 15);
  assert.ok(sources.size >= 30, String(sources.size));
});

test('ответ не повторяется чаще положенного и ближе положенного', () => {
  const where = new Map();
  levels.forEach((lv, i) => {
    assert.equal(new Set(lv.clues.map((c) => c.answer)).size, lv.clues.length, `уровень ${i + 1}`);
    for (const clue of lv.clues) {
      const list = where.get(clue.answer) ?? [];
      if (list.length) assert.ok(i - list[list.length - 1] >= GAP, `«${clue.answer}»: уровни ${list[list.length - 1] + 1} и ${i + 1}`);
      list.push(i);
      where.set(clue.answer, list);
    }
  });
  for (const [answer, list] of where) assert.ok(list.length <= MAX_USES, `«${answer}»: ${list.length} раз`);
  assert.ok(where.size >= 1500, `разных ответов ${where.size}`);
});

test('сложность растёт: сначала короткие поговорки и три вопроса, дальше — шесть-семь', () => {
  const lettersOf = (lv) => phraseLetters(lv).length;
  assert.deepEqual(levels.slice(0, 4).map((lv) => lv.clues.length), [3, 3, 3, 3]);
  assert.ok(levels.slice(0, 14).every((lv) => lv.clues.length <= 4));
  assert.ok(levels.slice(0, 40).every((lv) => lv.clues.length <= 5 && lettersOf(lv) <= 26 && ['Пословица', 'Поговорка'].includes(lv.source)));
  assert.ok(levels.slice(40).every((lv) => lv.clues.length >= 6 && lv.clues.length <= 7));
  // на первых уровнях открыто побольше букв (но закрытых во фразе всегда не меньше пяти)
  const openAvg = (list) => list.reduce((s, lv) => s + lv.start.length, 0) / list.length;
  assert.ok(levels.slice(0, 6).every((lv) => lv.start.length >= 2));
  assert.ok(openAvg(levels.slice(0, 6)) >= 3 && openAvg(levels.slice(0, 30)) > openAvg(levels.slice(120)));
  assert.ok(levels.slice(120).every((lv) => lv.start.length <= 2));
  const avg = (list) => list.reduce((s, lv) => s + lettersOf(lv), 0) / list.length;
  assert.ok(avg(levels.slice(0, 40)) < avg(levels.slice(40, 140)));
  assert.ok(avg(levels.slice(40, 140)) < avg(levels.slice(140)));
});

test('списки: каждый ответ — слово из 3–10 букв, вопросы короткие, трудности три', () => {
  const bank = loadClues();
  assert.ok(bank.size >= 1700, String(bank.size));
  const byD = [0, 0, 0, 0];
  for (const c of bank.values()) {
    assert.match(c.answer, /^[а-я]{3,10}$/);
    assert.ok(c.d >= 1 && c.d <= 3);
    byD[c.d]++;
    assert.ok(c.texts.length >= 1);
    for (const text of c.texts) assert.ok(text.length <= 48 && !givesAway(text, c.answer), `${c.answer}: «${text}»`);
  }
  assert.ok(byD[1] >= 700 && byD[2] >= 650 && byD[3] >= 200, byD.join(' '));
  const phrases = loadPhrases();
  assert.equal(phrases.length, levels.length, 'каждая фраза стала уровнем');
});
