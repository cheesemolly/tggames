// Правила «Алхимии» на маленькой базе: смешивание, запечатанная категория, дары, задания, подсказки, прогресс.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAIR, START_HINTS, MAX_HINTS, RANKS, pairKey, questReward, rankOf, titleOf, fold, plural,
  indexData, unlockAll, dataProblems, emptyProgress, migrateProgress, isValidProgress, emptyStats, migrateStats,
  isValidStats, stateOf, recipeOf, isSpent, sealOf, mix, grantGifts, nextGift, frontier, readyRecipe, pickQuest,
  newQuest, loadQuest, questRecipe, useHint, spendHint, addHints, catProgress, shelf,
} from '../logic.js';

// 1 вода, 2 огонь — стартовые; 3 пар, 4 лёд, 5 туман, 6 облако; 9 магия — дар за 4 открытых; 7 зелье, 8 дракон — «магия»
const RAW = {
  cats: [['base', 'Стихии'], ['magic', 'Магия']],
  items: [
    [1, 'вода', '💧', 0], [2, 'огонь', '🔥', 0], [3, 'пар', '♨️', 0], [4, 'лёд', '🧊', 0], [5, 'туман', '🌁', 0],
    [6, 'облако', '☁️', 0], [9, 'магия', '✨', 1], [7, 'зелье', '🧪', 1], [8, 'Дракон', '🐉', 1],
  ],
  start: [1, 2],
  gifts: [[9, 4]],
  recipes: [[1, 2, 3], [1, 1, 4], [3, 1, 5], [3, 3, 6], [5, 2, 6], [9, 1, 7], [3, 2, 8], [7, 2, 8]],
};
const db = indexData(RAW);
const fresh = () => {
  const progress = emptyProgress();
  return { progress, state: stateOf(db, progress) };
};

test('ключ пары не зависит от порядка и помещает оба номера', () => {
  assert.equal(pairKey(3, 7), pairKey(7, 3));
  assert.equal(pairKey(3, 7), 3 * PAIR + 7);
  assert.notEqual(pairKey(1, 2), pairKey(2, 2));
  assert.equal(pairKey(PAIR - 1, PAIR - 1), (PAIR - 1) * PAIR + PAIR - 1);
});

test('база: слои от стартовых, кто в каких рецептах, порядок списка — по алфавиту', () => {
  assert.equal(db.total, 9);
  assert.deepEqual([1, 2, 9].map((id) => db.items.get(id).tier), [0, 0, 0]);
  assert.equal(db.items.get(3).tier, 1);
  assert.equal(db.items.get(6).tier, 2, 'облако: пар + пар короче, чем через туман');
  assert.equal(db.items.get(8).tier, 2);
  assert.equal(db.items.get(3).uses.length, 3);
  assert.equal(db.items.get(1).uses.length, 4, 'вода + вода считается один раз');
  assert.equal(db.items.get(6).makes.length, 2);
  assert.deepEqual(db.list.map((it) => it.name), ['вода', 'Дракон', 'зелье', 'лёд', 'магия', 'облако', 'огонь', 'пар', 'туман']);
  assert.equal(db.items.get(9).gift, 4);
  assert.deepEqual(dataProblems(db), []);
  assert.equal(unlockAll(db).found.size, 9);
});

test('негодная база не разбирается', () => {
  assert.throws(() => indexData(null));
  assert.throws(() => indexData({ ...RAW, items: [...RAW.items, [3, 'ещё пар', '♨️', 0]] }), /элемент 3/);
  assert.throws(() => indexData({ ...RAW, recipes: [...RAW.recipes, [2, 1, 4]] }), /рецепт/);
  assert.throws(() => indexData({ ...RAW, recipes: [[1, 2, 99]] }), /рецепт/);
  assert.throws(() => indexData({ ...RAW, items: [...RAW.items, [10, 'время', '⏳', 1]], gifts: [[9, 4], [10, 6]] }), /два дара/);
});

test('что не так с базой: недостижимое, без рецепта, дар без нужного числа', () => {
  const lonely = indexData({ ...RAW, items: [...RAW.items, [10, 'камень', '🗿', 0]] });
  assert.ok(dataProblems(lonely).some((p) => p.includes('камень') && p.includes('нет рецепта')));
  const far = indexData({ ...RAW, gifts: [[9, 40]] });
  assert.ok(dataProblems(far).some((p) => p.includes('дар «магия»')));
  assert.ok(dataProblems(far).some((p) => p.includes('зелье')));
  const loop = indexData({ ...RAW, items: [...RAW.items, [10, 'камень', '🗿', 0], [11, 'песок', '🟨', 0]], recipes: [...RAW.recipes, [11, 1, 10], [10, 1, 11]] });
  assert.ok(dataProblems(loop).some((p) => p.includes('камень') && p.includes('не получить')));
});

test('смешивание: новый элемент, новая пара, уже было, ничего не вышло', () => {
  const { progress, state } = fresh();
  assert.deepEqual(mix(db, progress, state, 1, 2), { kind: 'new', id: 3, recipe: recipeOf(db, 1, 2), gift: null });
  assert.deepEqual(progress.found, [3]);
  assert.deepEqual(progress.recipes, [pairKey(1, 2)]);
  assert.equal(mix(db, progress, state, 2, 1).kind, 'known', 'порядок не важен');
  assert.deepEqual(progress.recipes, [pairKey(1, 2)]);
  assert.equal(mix(db, progress, state, 2, 2).kind, 'none');
  assert.equal(mix(db, progress, state, 3, 3).kind, 'new');
  assert.equal(mix(db, progress, state, 3, 1).kind, 'new');
  const again = mix(db, progress, state, 5, 2);
  assert.equal(again.kind, 'recipe', 'облако уже есть, а туман + огонь — впервые');
  assert.equal(again.id, 6);
  assert.deepEqual(progress.found, [3, 6, 5]);
  assert.equal(progress.recipes.length, 4);
  // неоткрытое смешать нельзя
  assert.equal(mix(db, progress, state, 4, 1).kind, 'none');
  assert.equal(progress.recipes.length, 4);
});

test('запечатанная категория: пара верная, но итог ждёт дара', () => {
  const { progress, state } = fresh();
  mix(db, progress, state, 1, 2);
  const res = mix(db, progress, state, 3, 2);
  assert.equal(res.kind, 'sealed');
  assert.equal(res.gift.id, 9);
  assert.equal(res.id, null);
  assert.ok(!state.found.has(8));
  assert.ok(!state.recipes.has(pairKey(3, 2)));
  assert.equal(sealOf(db, state.found, 8).at, 4);
  assert.equal(sealOf(db, state.found, 3), null);
  assert.equal(sealOf(db, state.found, 9), null, 'сам дар не запечатан');
  assert.ok(!frontier(db, state.found).includes(8));
  assert.equal(readyRecipe(db, state.found, 8), null);
});

test('дары выдаются по числу открытых (со стартовыми) и снимают печать', () => {
  const { progress, state } = fresh();
  mix(db, progress, state, 1, 2);
  assert.deepEqual(grantGifts(db, progress, state), [], 'открыто три — рано');
  assert.deepEqual(nextGift(db, state), { id: 9, at: 4 });
  mix(db, progress, state, 1, 1);
  assert.deepEqual(grantGifts(db, progress, state), [9]);
  assert.deepEqual(progress.found, [3, 4, 9]);
  assert.deepEqual(grantGifts(db, progress, state), [], 'второй раз не выдаётся');
  assert.equal(nextGift(db, state), null);
  assert.equal(mix(db, progress, state, 3, 2).kind, 'new');
  assert.deepEqual(frontier(db, state.found).sort(), [5, 6, 7]);
});

test('исчерпанный элемент — когда найдены все его пары', () => {
  const { progress, state } = fresh();
  assert.equal(state.left.get(2), 4);
  assert.ok(!isSpent(state, 2));
  mix(db, progress, state, 1, 2);
  mix(db, progress, state, 1, 1);
  grantGifts(db, progress, state);
  assert.ok(isSpent(state, 4), 'лёд ни с чем не смешивается');
  for (const [a, b] of [[3, 2], [3, 1], [5, 2], [9, 1], [7, 2]]) mix(db, progress, state, a, b);
  assert.ok(isSpent(state, 2));
  assert.ok(!isSpent(state, 3), 'пар + пар ещё не пробовали');
  // то же самое — из сохранения
  const again = stateOf(db, structuredClone(progress));
  assert.deepEqual([...again.left], [...state.left]);
});

test('задание: цель — то, что можно открыть сейчас; «другое» не повторяет прошлое', () => {
  const { progress, state } = fresh();
  assert.deepEqual(frontier(db, state.found).sort(), [3, 4]);
  for (let k = 0; k < 30; k++) {
    const id = pickQuest(db, state.found, Math.random, 3);
    assert.equal(id, 4, 'кроме пара остаётся только лёд');
  }
  // пар откроет туман и облако, лёд — ничего: пар выпадает намного чаще, но и лёд бывает
  const count = { 3: 0, 4: 0 };
  let seed = 11;
  const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 600; k++) count[pickQuest(db, state.found, rng)] += 1;
  assert.ok(count[3] > count[4] * 8, JSON.stringify(count));
  assert.ok(count[4] > 0, 'тупиковая цель тоже выпадает');
  assert.equal(pickQuest(db, state.found, () => 0), 3);
  assert.equal(pickQuest(db, state.found, () => 0.999999), 4);
  mix(db, progress, state, 1, 2);
  mix(db, progress, state, 1, 1);
  // единственную цель «другое задание» всё равно выдаст
  const only = stateOf(db, { ...emptyProgress(), found: [3, 4, 5] });
  assert.equal(pickQuest(db, only.found, Math.random, 6), 6);
  const all = stateOf(db, { ...emptyProgress(), found: [3, 4, 5, 6, 9, 7, 8] });
  assert.equal(pickQuest(db, all.found), null);
});

test('подсказка: стоит одну штуку, открывает рецепт по частям и держится за выбранный рецепт', () => {
  const { progress, state } = fresh();
  mix(db, progress, state, 1, 2);
  const quest = newQuest(6);
  assert.deepEqual(quest, { id: 6, hint: 0, key: 0 });
  const first = useHint(db, progress, state, quest);
  assert.deepEqual([first.a, first.b], [3, 3]);
  assert.deepEqual(quest, { id: 6, hint: 1, key: pairKey(3, 3) });
  assert.equal(progress.hints, START_HINTS - 1);
  // появился туман — рецепт подсказки не меняется
  mix(db, progress, state, 3, 1);
  assert.equal(useHint(db, progress, state, quest), first);
  assert.equal(quest.hint, 2);
  assert.equal(useHint(db, progress, state, quest), null, 'подсказано всё');
  assert.equal(progress.hints, START_HINTS - 2);
  // подсказок нет
  const empty = { ...emptyProgress(), hints: 0 };
  const other = newQuest(5);
  assert.equal(useHint(db, empty, state, other), null);
  assert.deepEqual(other, { id: 5, hint: 0, key: 0 });
  assert.equal(spendHint(empty), false);
  addHints(empty, 3);
  assert.equal(empty.hints, 3);
  addHints(empty, MAX_HINTS * 2);
  assert.equal(empty.hints, MAX_HINTS);
  addHints(empty, -5);
  assert.equal(empty.hints, MAX_HINTS);
});

test('сохранённое задание: годится, пока цель не открыта и собирается; подсказка — пока её рецепт собирается', () => {
  const { progress, state } = fresh();
  mix(db, progress, state, 1, 2);
  assert.deepEqual(loadQuest({ id: 6, hint: 1, key: pairKey(3, 3) }, db, state.found), { id: 6, hint: 1, key: pairKey(3, 3) });
  assert.deepEqual(loadQuest({ id: 6, hint: 2, key: pairKey(5, 2) }, db, state.found), { id: 6, hint: 0, key: 0 }, 'тумана ещё нет');
  assert.deepEqual(loadQuest({ id: 6, hint: 7, key: 'x' }, db, state.found), { id: 6, hint: 0, key: 0 });
  assert.deepEqual(loadQuest({ id: 6 }, db, state.found), { id: 6, hint: 0, key: 0 });
  assert.equal(loadQuest({ id: 3, hint: 0, key: 0 }, db, state.found), null, 'цель уже открыта');
  assert.equal(loadQuest({ id: 8, hint: 0, key: 0 }, db, state.found), null, 'цель запечатана');
  assert.equal(loadQuest({ id: 7, hint: 0, key: 0 }, db, state.found), null, 'цель пока не собрать');
  assert.equal(loadQuest({ id: 77 }, db, state.found), null);
  for (const bad of [null, undefined, 'мусор', 5, []]) assert.equal(loadQuest(bad, db, state.found), null);
  assert.equal(questRecipe(db, state.found, { id: 6, hint: 0, key: pairKey(5, 2) }), recipeOf(db, 3, 3), 'негодный ключ — первый собираемый рецепт');
});

test('прогресс: пустой годен, мусор вычищается, с базой — ещё и неизвестное', () => {
  assert.deepEqual(emptyProgress(), { found: [], recipes: [], quests: 0, hints: START_HINTS });
  assert.ok(isValidProgress(emptyProgress()));
  assert.ok(isValidProgress({ found: [3, 9, 5], recipes: [pairKey(1, 2)], quests: 4, hints: 0 }));
  assert.ok(!isValidProgress({ found: [3, 3], recipes: [], quests: 0, hints: 5 }));
  assert.ok(!isValidProgress({ found: [3], recipes: [], quests: -1, hints: 5 }));
  for (const bad of [null, undefined, 'x', 7]) assert.deepEqual(migrateProgress(bad), emptyProgress());
  assert.deepEqual(migrateProgress({ found: [3, 'пар', 3, -1, PAIR, 5.5, 4], recipes: 'нет', quests: 2.5, hints: -3 }),
    { found: [3, 4], recipes: [], quests: 0, hints: START_HINTS });
  assert.equal(migrateProgress({ hints: 1e9 }).hints, MAX_HINTS);
  // с базой: стартовые не хранятся, неизвестных элементов и пар нет, пара без открытых частей не считается
  const kept = migrateProgress({
    found: [1, 3, 77, 6], recipes: [pairKey(1, 2), pairKey(3, 3), pairKey(5, 2), pairKey(2, 2), 0, 12345678], quests: 3, hints: 2,
  }, db);
  assert.deepEqual(kept, { found: [3, 6], recipes: [pairKey(1, 2), pairKey(3, 3)], quests: 3, hints: 2 });
  const state = stateOf(db, kept);
  assert.deepEqual([...state.found].sort(), [1, 2, 3, 6]);
});

test('статистика: пустая годна, мусор обнуляется', () => {
  assert.deepEqual(emptyStats(), { mixes: 0, fails: 0, hints: 0 });
  assert.ok(isValidStats(emptyStats()));
  assert.ok(isValidStats({ mixes: 10, fails: 3, hints: 1 }));
  assert.ok(!isValidStats({ mixes: 10, fails: 3 }));
  assert.deepEqual(migrateStats({ mixes: 5, fails: -2, hints: 'много', лишнее: 1 }), { mixes: 5, fails: 0, hints: 0 });
  assert.deepEqual(migrateStats(null), emptyStats());
});

test('полка: по алфавиту или сначала новые, по категории, без исчерпанных, поиск', () => {
  const progress = { ...emptyProgress(), found: [3, 4, 9, 8, 7] };
  const state = stateOf(db, progress);
  const names = (opts) => shelf(db, state, opts).map((it) => it.name);
  assert.deepEqual(names(), ['вода', 'Дракон', 'зелье', 'лёд', 'магия', 'огонь', 'пар']);
  assert.deepEqual(names({ order: 'new', opened: progress.found }), ['зелье', 'Дракон', 'магия', 'лёд', 'пар', 'вода', 'огонь']);
  assert.deepEqual(names({ cat: 1 }), ['Дракон', 'зелье', 'магия']);
  assert.deepEqual(names({ hideSpent: true }), ['вода', 'зелье', 'магия', 'огонь', 'пар'], 'лёд и дракон ни с чем не смешиваются');
  assert.deepEqual(names({ query: ' ДРА ' }), ['Дракон']);
  assert.deepEqual(names({ query: 'а' }), ['вода', 'Дракон', 'магия', 'пар']);
  assert.deepEqual(names({ query: 'м' }), ['магия'], 'неоткрытый туман не находится');
  assert.deepEqual(names({ query: 'лед' }), ['лёд'], 'ё и е — одно');
  assert.deepEqual(names({ query: 'ЗЕЛЬЁ' }), ['зелье']);
  assert.deepEqual(names({ query: 'ябв' }), []);
  assert.deepEqual(catProgress(db, state.found).map((c) => [c.id, c.found, c.total]), [['base', 4, 6], ['magic', 3, 3]]);
});

test('звания и награды', () => {
  assert.equal(rankOf(0), 0);
  assert.equal(rankOf(RANKS[1].at - 1), 0);
  assert.equal(rankOf(RANKS[1].at), 1);
  assert.equal(rankOf(1e6), RANKS.length - 1);
  assert.deepEqual([1, 2, 4, 5, 6, 10, 11].map(questReward), [1, 1, 1, 2, 1, 2, 1]);
});

test('подписи', () => {
  assert.equal(titleOf('пар'), 'Пар');
  assert.equal(titleOf('Баба-яга'), 'Баба-яга');
  assert.equal(titleOf(''), '');
  assert.equal(fold(' Ёлка '), 'елка');
  const w = ['элемент', 'элемента', 'элементов'];
  assert.deepEqual([1, 2, 5, 11, 21, 104, 112].map((n) => plural(n, w)), ['элемент', 'элемента', 'элементов', 'элементов', 'элемент', 'элемента', 'элементов']);
});
