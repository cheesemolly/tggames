// «Слова из слова»: уровни (100, без грубых слов, всё составляется из букв), проверка слов, прохождение 50%,
// звёзды, открытие уровней, подсказки. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVEL_COUNT, MIN_LEN, START_HINTS, HINTS_PER_LEVEL, normalize, canCompose, target, check, stars, passed,
  newProgress, levelState, unlockedMax, isUnlocked, submit, hint, isValidProgress,
} from '../logic.js';

const levels = JSON.parse(readFileSync(new URL('../levels.json', import.meta.url), 'utf8'));
const dict = JSON.parse(readFileSync(new URL('../../boggle/words/ru.json', import.meta.url), 'utf8'));

test('уровни: 100 разных слов, лёгкие сначала, всё составляется из букв, есть в словаре, без грубых слов', () => {
  assert.equal(levels.length, LEVEL_COUNT);
  assert.equal(new Set(levels.map((l) => l.word)).size, LEVEL_COUNT);
  const words = new Set(dict.words);
  const common = new Set(dict.common);
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (i) assert.ok(l.common.length >= levels[i - 1].common.length, 'обычных слов не меньше, чем на прошлом уровне');
    assert.ok(l.common.length >= 14, `${l.word}: мало слов`);
    assert.ok(common.has(l.word), `${l.word}: исходное слово — частое`);
    for (const w of [...l.common, ...l.rare]) {
      assert.ok(w.length >= MIN_LEN && canCompose(w, l.word) && w !== l.word, `${l.word}: ${w}`);
      assert.ok(words.has(w), `${w} нет в словаре`);
    }
    for (const w of l.common) assert.ok(common.has(w), `${w} — не частое`);
    assert.ok(!l.rare.some((w) => l.common.includes(w)), 'редкие не пересекаются с обычными');
    for (const bad of ['негр', 'мент', 'жопа', 'сука', 'труп']) assert.ok(![...l.common, ...l.rare].includes(bad), bad);
  }
});

test('проверка слова: обычное, редкое, повтор, короткое, само слово, чужие буквы, нет в словаре; ё = е', () => {
  const l = { word: 'диаграмма', common: ['грамм', 'рама', 'гид'], rare: ['мига'] };
  assert.equal(check(l, 'Рама', []), 'common');
  assert.equal(check(l, 'мига', []), 'rare');
  assert.equal(check(l, 'рама', ['рама']), 'found');
  assert.equal(check(l, 'ад', []), 'short');
  assert.equal(check(l, 'диаграмма', []), 'self');
  assert.equal(check(l, 'гамма', []), 'unknown');
  assert.equal(check(l, 'драма', []), 'unknown');
  assert.equal(check(l, 'мамма', []), 'letters', 'трёх «м» нет');
  assert.equal(normalize('Ёлка!'), 'елка');
  assert.ok(canCompose('грамм', 'диаграмма') && !canCompose('граммм', 'диаграмма'));
});

test('прохождение: половина обычных (редкие засчитываются), звёзды, открытие следующего, +подсказки', () => {
  const p = newProgress();
  assert.equal(unlockedMax(p, levels), 0);
  assert.ok(!isUnlocked(p, levels, 1));
  const l0 = levels[0];
  const need = target(l0);
  assert.equal(need, Math.ceil(l0.common.length / 2));
  // редкое + обычные до половины
  if (l0.rare.length) assert.equal(submit(p, levels, 0, l0.rare[0]).result, 'rare');
  let res;
  for (const w of l0.common) {
    res = submit(p, levels, 0, w);
    if (passed(l0, levelState(p, 0).found)) break;
  }
  assert.ok(res.justPassed, 'пройден этим словом');
  assert.equal(p.hints, START_HINTS + HINTS_PER_LEVEL);
  assert.equal(stars(l0, levelState(p, 0).found), 1);
  assert.equal(unlockedMax(p, levels), 1, 'открыт следующий');
  assert.ok(isUnlocked(p, levels, 1) && !isUnlocked(p, levels, 2));
  assert.equal(submit(p, levels, 0, l0.common[0]).result, 'found');
  assert.equal(p.passedCount, 1);
  // все обычные — три звезды
  for (const w of l0.common) submit(p, levels, 0, w);
  assert.equal(stars(l0, levelState(p, 0).found), 3);
  assert.equal(p.passedCount, 1, 'повторно не засчитывается');
  assert.ok(isValidProgress(JSON.parse(JSON.stringify(p)), levels));
});

test('подсказки: по букве в ненайденном слове, сначала начатое; без подсказок — null', () => {
  const p = newProgress();
  const w = hint(p, levels, 3, () => 0);
  assert.ok(levels[3].common.includes(w));
  assert.equal(levelState(p, 3).hinted[w], 1);
  assert.equal(hint(p, levels, 3, () => 0.99), w, 'та же, уже начатая');
  assert.equal(levelState(p, 3).hinted[w], 2);
  assert.equal(p.hints, START_HINTS - 2);
  p.hints = 0;
  assert.equal(hint(p, levels, 3), null);
});
