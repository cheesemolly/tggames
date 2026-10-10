// Уровни «Логических схем»: каждый разбирается и раскладывается, решается из деталей лотка, у подобранных уровней
// решение ровно одно; главы идут подряд и знакомят с новым по порядку; схема помещается на экран телефона.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, LEVELS } from '../levels.js';
import { parseLevel, solve, check, fitsTray, emptySetup, isComplete } from '../logic.js';
import { layout } from '../layout.js';
import { CHAPTERS as RECIPE, PER_CHAPTER } from '../../../tools/logic-gates-levels.mjs';
import { LOGIC_GATES, GAMES } from '../../../server/lib.js';

const levels = LEVELS.map((text) => parseLevel(text));
const chapterOf = (n) => CHAPTERS.findIndex((c) => n >= c.from && n < c.from + c.count);
const hand = new Set(RECIPE.flatMap((c) => c.hand));

test('уровней сто, главы идут подряд по двадцать — как считает сервер', () => {
  assert.equal(LEVELS.length, 100);
  assert.equal(new Set(LEVELS).size, LEVELS.length, 'уровни не повторяются');
  let next = 1;
  for (const chapter of CHAPTERS) {
    assert.equal(chapter.from, next);
    assert.equal(chapter.count, PER_CHAPTER);
    assert.ok(chapter.title.length > 2);
    next += chapter.count;
  }
  assert.equal(next - 1, LEVELS.length);
  assert.deepEqual(CHAPTERS.map((c) => c.title), RECIPE.map((c) => c.title));
  assert.equal(LOGIC_GATES.levels, LEVELS.length);
  assert.equal(LOGIC_GATES.chapter, PER_CHAPTER);
  assert.match(GAMES.find((g) => g.id === 'logic-gates').about, new RegExp(`${LEVELS.length} схем`));
});

test('каждый уровень решается из деталей лотка; у подобранных решение ровно одно', () => {
  levels.forEach((level, k) => {
    const found = solve(level, { limit: 3 });
    assert.ok(found.length >= 1, `уровень ${k + 1} не решается: ${level.text}`);
    for (const s of found) {
      assert.ok(isComplete(s) && fitsTray(level, s) && check(level, s).ok, level.text);
    }
    if (!hand.has(level.text)) assert.equal(found.length, 1, `уровень ${k + 1}: решений больше одного — ${level.text}`);
    // «ничего не делать» не проходит: либо остались пустые гнёзда, либо лампы не сходятся
    const empty = emptySetup(level);
    assert.ok(!isComplete(empty) || !check(level, empty).ok, `уровень ${k + 1} решён без единой детали: ${level.text}`);
  });
});

test('написанные руками уровни стоят в начале своих глав', () => {
  RECIPE.forEach((chapter, c) => {
    chapter.hand.forEach((text, k) => assert.equal(LEVELS[CHAPTERS[c].from - 1 + k], text));
    assert.equal(chapter.hand.length + chapter.stages.reduce((sum, s) => sum + s.count, 0), PER_CHAPTER, chapter.title);
  });
});

test('новое появляется по главам: «НЕ» — со второй, лампы, которым гореть нельзя, — с третьей, проверки — с четвёртой', () => {
  levels.forEach((level, k) => {
    const c = chapterOf(k + 1);
    const marks = [...level.gates.flatMap((g) => g.ins), ...level.outs].some((p) => p.mark);
    const wantsOff = level.rows.some((row) => row.want.includes(0));
    if (c === 0) assert.ok(!marks && level.tray.not === 0, `уровень ${k + 1}: «НЕ» в первой главе`);
    if (c <= 1) assert.ok(level.rows.length === 1 && !wantsOff && level.outs.length === 1, `уровень ${k + 1}: рано для ламп и проверок`);
    if (c === 2) assert.ok(level.rows.length === 1 && level.outs.length >= 2 && wantsOff, `уровень ${k + 1}: в «Гирлянде» — несколько ламп, часть гореть не должна`);
    if (c === 3) assert.ok(level.rows.length >= 2, `уровень ${k + 1}: в «Проверках» — несколько проверок`);
  });
  // первые уровни глав знакомят с новым на самой маленькой схеме
  for (const n of [1, 2, 21, 22, 61, 62]) assert.equal(levels[n - 1].gates.length, 1, `уровень ${n}`);
  assert.equal(levels[0].sockets.length, 1);
  assert.deepEqual(levels[0].tray, { and: 1, or: 0, not: 0 });
  assert.equal(levels[20].gates[0].ins.some((p) => p.mark === 'not'), true, 'уровень 21 — впаянное НЕ');
  assert.equal(levels[21].rings.length, 1, 'уровень 22 — колечко');
});

test('в лотке нет бесполезного: колечки — только когда есть «НЕ», лишних вентилей — не больше одного', () => {
  levels.forEach((level, k) => {
    if (level.rings.length) assert.ok(level.tray.not >= 1, `уровень ${k + 1}: колечки без «НЕ» в лотке`);
    else assert.equal(level.tray.not, 0);
    const spare = level.tray.and + level.tray.or - level.sockets.length;
    assert.ok(spare >= 0 && spare <= 1, `уровень ${k + 1}: лишних вентилей ${spare}`);
    assert.ok(level.sockets.length + level.rings.length >= 1, `уровень ${k + 1}: нечего расставлять`);
    assert.ok(level.rows.length <= 4 && level.outs.length <= 3 && level.sources.length <= 4, `уровень ${k + 1}`);
    // проверки не повторяются
    assert.equal(new Set(level.rows.map((r) => r.src.join(''))).size, level.rows.length, `уровень ${k + 1}`);
  });
});

test('схема помещается на экран телефона, пересечений проводов — не больше двух', () => {
  levels.forEach((level, k) => {
    const lay = layout(level);
    assert.ok(lay.crossings <= 2, `уровень ${k + 1}: пересечений ${lay.crossings}`);
    // на экране 320×568 схеме остаётся около 300×300 px: вентиль при этом не уже 34 px
    const scale = Math.min(300 / lay.box.w, 300 / lay.box.h);
    assert.ok(scale * 68 >= 34, `уровень ${k + 1}: схема ${Math.round(lay.box.w)}×${Math.round(lay.box.h)} слишком велика`);
    assert.ok(lay.box.w <= 340, `уровень ${k + 1}: шире экрана`);
  });
});

test('сложность растёт: в последней главе выбирать приходится из десятков расстановок, в первой — из нескольких', () => {
  const space = (level) => {
    let count = 0;
    const ns = level.sockets.length;
    const nr = level.rings.length;
    for (let km = 0; km < 1 << ns; km++) {
      const ors = level.sockets.filter((_, i) => (km >> i) & 1).length;
      if (ors > level.tray.or || ns - ors > level.tray.and) continue;
      for (let rm = 0; rm < 1 << nr; rm++) {
        if (level.rings.filter((_, i) => (rm >> i) & 1).length <= level.tray.not) count += 1;
      }
    }
    return count;
  };
  const mean = (c) => {
    const list = levels.slice(CHAPTERS[c].from - 1, CHAPTERS[c].from - 1 + CHAPTERS[c].count).map(space);
    return list.reduce((a, b) => a + b, 0) / list.length;
  };
  assert.ok(mean(0) < 5);
  assert.ok(mean(4) > 20);
  // «Проверки» вводят новое на маленьких схемах — у них вариантов не больше, чем в «Гирлянде»; остальные главы растут
  assert.ok(mean(1) > mean(0) && mean(2) > mean(1));
  for (let c = 0; c < 4; c++) assert.ok(mean(4) > 2 * mean(c), `последняя глава не труднее главы ${c + 1}`);
  assert.ok(space(levels[99]) >= 100, 'последний уровень — самый богатый на варианты');
});

test('подсказки первых уровней в игре привязаны к уровням, где появляется новое', () => {
  const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const tips = js.slice(js.indexOf('const TIPS = {'), js.indexOf('};', js.indexOf('const TIPS = {')));
  const nums = [...tips.matchAll(/^\s+(\d+): '/gm)].map((m) => Number(m[1]));
  assert.deepEqual(nums, [1, 2, 3, 21, 22, 41, 61, 62]);
  for (const n of nums) assert.ok(hand.has(LEVELS[n - 1]), `подсказка у уровня ${n}, а он подобран, а не написан руками`);
  assert.equal(hand.size, nums.length, 'у каждого уровня, написанного руками, есть подсказка');
});
