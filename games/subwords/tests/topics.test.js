// Темы «Слогов»: слова делятся на слоги, которые помещаются в кружок, и ни в одной теме слоги не путаются —
// каждое слово складывается из кружков поля ровно одним способом, даже если на поле вся тема целиком.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS } from '../topics.js';
import { MAX_PIECE, MAX_PIECES, TIMED_BOARD, display, isClearSet, keyOf, pickWords, piecesOf, syllables, tilings, wordsIn } from '../logic.js';

const VOWELS = 'аеёиоуыэюя';

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('темы: 56 штук, у каждой свой id и название, по 12 слов', () => {
  assert.equal(TOPICS.length, 56);
  assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length);
  assert.equal(new Set(TOPICS.map((t) => t.title)).size, TOPICS.length);
  for (const t of TOPICS) {
    assert.match(t.id, /^[a-z0-9-]{1,24}$/, t.id);
    // длиннее двадцати букв название не помещается в шапку уровня на экране 320 px
    assert.ok(t.title.length >= 3 && t.title.length <= 20, `${t.id}: «${t.title}»`);
    assert.equal(t.words.length, 12, t.id);
    assert.equal(new Set(t.words.map(keyOf)).size, 12, `${t.id}: слова повторяются`);
  }
});

test('темы: слово встречается только в одной теме', () => {
  const where = new Map();
  for (const t of TOPICS) {
    for (const w of t.words) {
      assert.ok(!where.has(keyOf(w)), `«${display(w)}»: ${where.get(keyOf(w))} и ${t.id}`);
      where.set(keyOf(w), t.id);
    }
  }
  assert.equal(where.size, 56 * 12);
});

test('слова: только русские буквы, от трёх до тринадцати, с большой буквы — только имена', () => {
  for (const t of TOPICS) {
    for (const w of t.words) {
      assert.match(w, /^[А-ЯЁа-яё]+(-[а-яё]+)*$/, `${t.id}: ${w}`);
      const shown = display(w);
      assert.ok(shown.length >= 3 && shown.length <= 13, `${t.id}: ${shown}`);
      assert.equal(shown.slice(1), shown.slice(1).toLowerCase(), `${t.id}: ${shown}`);
    }
  }
});

test('слоги: складываются обратно в слово, в каждом одна гласная, в кружок помещаются', () => {
  let pieces = 0;
  for (const t of TOPICS) {
    for (const w of t.words) {
      const parts = syllables(w);
      assert.equal(parts.join(''), keyOf(w), w);
      assert.ok(parts.length >= 1 && parts.length <= 5, `${w}: ${parts.join('-')}`);
      pieces += parts.length;
      for (const part of parts) {
        assert.ok(part.length >= 1 && part.length <= MAX_PIECE, `${w}: «${part}» не поместится в кружок`);
        const vowels = [...part].filter((ch) => VOWELS.includes(ch)).length;
        // слово без гласных не бывает; в слоге — ровно одна
        assert.equal(vowels, 1, `${w}: в «${part}» гласных ${vowels}`);
      }
    }
  }
  assert.ok(pieces > 1500, String(pieces));
});

test('деление вручную — только там, где правило ошибается, и оно правда другое', () => {
  const manual = TOPICS.flatMap((t) => t.words).filter((w) => w.includes('-'));
  assert.ok(manual.length >= 1 && manual.length <= 12, String(manual.length));
  for (const w of manual) assert.notDeepEqual(syllables(display(w)), syllables(w), `${w}: дефисы лишние`);
});

test('каждая тема целиком — однозначный набор: слово складывается из её слогов одним способом', () => {
  for (const t of TOPICS) {
    const texts = new Set(t.words.flatMap((w) => syllables(w)));
    for (const w of t.words) assert.equal(tilings(keyOf(w), texts), 1, `${t.id}: «${display(w)}» складывается не одним способом`);
    assert.ok(isClearSet(t.words), t.id);
  }
});

test('в теме ни одно слово не начало другого по слогам (иначе короткое лопнуло бы раньше длинного)', () => {
  for (const t of TOPICS) {
    const all = t.words.map((w) => syllables(w).join('|'));
    for (const a of all) for (const b of all) assert.ok(a === b || !b.startsWith(`${a}|`), `${t.id}: ${a} — начало ${b}`);
  }
});

test('уровни «Классики»: слова темы помещаются на поле, набор всегда однозначный', () => {
  TOPICS.forEach((t, index) => {
    for (let seed = 1; seed <= 25; seed++) {
      const words = pickWords(t, wordsIn(index), rngOf(seed * 7 + index));
      assert.ok(words.length >= 5 && words.length <= wordsIn(index), `${t.id}: слов ${words.length}`);
      assert.ok(piecesOf(words).length <= MAX_PIECES, `${t.id}: кружков ${piecesOf(words).length}`);
      assert.ok(piecesOf(words).length >= 8, `${t.id}: кружков слишком мало`);
      assert.ok(isClearSet(words), t.id);
    }
  });
});

test('«На время»: любые слова темы на поле вместе — тоже не больше предела кружков', () => {
  for (const t of TOPICS) {
    const longest = t.words.map((w) => syllables(w).length).sort((a, b) => b - a).slice(0, TIMED_BOARD).reduce((a, b) => a + b, 0);
    assert.ok(longest <= MAX_PIECES, `${t.id}: ${longest}`);
  }
});

test('первые темы — простые: слова короткие', () => {
  for (const t of TOPICS.slice(0, 6)) {
    for (const w of t.words) assert.ok(syllables(w).length <= 4, `${t.id}: ${w}`);
  }
});
