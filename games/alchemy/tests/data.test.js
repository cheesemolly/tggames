// База «Алхимии» (data.json): собрана из списков и не отстала от них, номера элементов не меняются, всё достижимо,
// дары выдаются, задания ведут до последнего элемента.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, serialize, emojiProblem, MAX_NAME, MAX_WORD } from '../../../tools/alchemy-build.mjs';
import {
  PAIR, RANKS, pairKey, fold, indexData, dataProblems, unlockAll, emptyProgress, stateOf, mix, grantGifts, frontier,
  pickQuest, readyRecipe, recipeOf, sealOf,
} from '../logic.js';

const text = readFileSync(new URL('../data.json', import.meta.url), 'utf8');
const raw = JSON.parse(text);
const ids = JSON.parse(readFileSync(new URL('../../../tools/alchemy-data/ids.json', import.meta.url), 'utf8'));
const db = indexData(raw);
const idOf = (name) => db.list.find((it) => it.name === name)?.id ?? assert.fail(`нет элемента «${name}»`);

function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('data.json собран из списков и не отстал от них (node tools/alchemy-build.mjs)', () => {
  const result = build();
  assert.deepEqual(result.errors, []);
  assert.equal(serialize(result.data), text.replace(/\r\n/g, '\n'), 'списки менялись, а база не пересобрана');
  assert.deepEqual(result.ids, { next: ids.next, ids: ids.ids }, 'ids.json отстал от списков');
});

test('номера элементов: у каждого свой, из ids.json, и меньше предела ключа пары', () => {
  const seen = new Set();
  for (const [id, name] of raw.items) {
    assert.equal(ids.ids[name], id, name);
    assert.ok(Number.isInteger(id) && id > 0 && id < PAIR, name);
    assert.ok(!seen.has(id), `номер ${id} занят дважды`);
    seen.add(id);
  }
  assert.ok(ids.next > Math.max(...seen), 'следующий номер уже занят');
  assert.equal(new Set(Object.values(ids.ids)).size, Object.keys(ids.ids).length, 'в ids.json один номер у двух названий');
});

test('контента много: больше тысячи элементов и пяти тысяч рецептов, у элемента в среднем больше четырёх', () => {
  assert.ok(db.total >= 1100, `элементов ${db.total}`);
  assert.ok(db.recipes.length >= 5000, `рецептов ${db.recipes.length}`);
  assert.ok(db.recipes.length / db.total > 4);
  assert.equal(db.cats.length, 14);
  for (const c of db.cats) assert.ok(c.total >= 40, `${c.title}: ${c.total}`);
});

test('названия: не повторяются, короткие, со строчной буквы или имя собственное; значок есть на старых телефонах', () => {
  const seen = new Set();
  for (const it of db.items.values()) {
    assert.ok(!seen.has(fold(it.name)), `повтор: ${it.name}`);
    seen.add(fold(it.name));
    assert.ok(it.name.length <= MAX_NAME, `длинное название: ${it.name}`);
    assert.ok(it.name.split(/[ -]/).every((w) => w.length <= MAX_WORD), `длинное слово: ${it.name}`);
    assert.match(it.name, /^[А-Яа-яЁё0-9][А-Яа-яЁё0-9 -]*$/, it.name);
    assert.equal(emojiProblem(it.emoji), null, `${it.name} ${it.emoji}`);
  }
});

test('пара даёт один итог, порядок в паре не важен; элемент не получается из самого себя', () => {
  const seen = new Set();
  for (const r of db.recipes) {
    assert.equal(r.key, pairKey(r.a, r.b));
    assert.equal(pairKey(r.a, r.b), pairKey(r.b, r.a));
    assert.ok(!seen.has(r.key), `пара дважды: ${db.items.get(r.a).name} + ${db.items.get(r.b).name}`);
    seen.add(r.key);
    assert.ok(r.c !== r.a && r.c !== r.b);
    assert.equal(recipeOf(db, r.b, r.a), r);
  }
});

test('всё достижимо из четырёх стихий; у стартовых и даров рецептов нет', () => {
  assert.deepEqual(dataProblems(db), []);
  assert.deepEqual(db.start.map((id) => db.items.get(id).name), ['вода', 'огонь', 'земля', 'воздух']);
  const { found } = unlockAll(db);
  assert.equal(found.size, db.total);
  for (const it of db.items.values()) assert.ok(Number.isFinite(it.tier), it.name);
});

test('первые шаги: любая пара стихий (и стихия сама с собой) что-то даёт, и всё разное', () => {
  const results = new Set();
  for (let i = 0; i < 4; i++) {
    for (let j = i; j < 4; j++) {
      const r = recipeOf(db, db.start[i], db.start[j]);
      assert.ok(r, `${db.items.get(db.start[i]).name} + ${db.items.get(db.start[j]).name}`);
      results.add(r.c);
    }
  }
  assert.equal(results.size, 10);
  assert.equal(recipeOf(db, idOf('вода'), idOf('огонь')).c, idOf('пар'));
});

test('дары: время, магия и разум — на 50, 150 и 300 элементах, у каждого своя категория; без дара набирается с запасом', () => {
  assert.deepEqual(db.gifts.map((g) => [db.items.get(g.id).name, g.at]), [['время', 50], ['магия', 150], ['разум', 300]]);
  const { granted } = unlockAll(db);
  assert.equal(granted.length, 3);
  for (const g of granted) assert.ok(g.had >= g.at * 2, `${db.items.get(g.id).name}: до дара открывается только ${g.had}`);
  assert.deepEqual(db.gifts.map((g) => db.cats[db.items.get(g.id).cat].id), ['time', 'magic', 'mind']);
});

test('категория дара запечатана: до дара её элементы не открыть, после — те же рецепты работают', () => {
  const progress = emptyProgress();
  const state = stateOf(db, progress);
  // открыть всё, что можно без даров (их никто не выдаёт)
  for (let id = frontier(db, state.found)[0]; id !== undefined; id = frontier(db, state.found)[0]) {
    const r = readyRecipe(db, state.found, id);
    assert.equal(mix(db, progress, state, r.a, r.b).kind, 'new');
  }
  const sealed = new Set(db.gifts.map((g) => db.items.get(g.id).cat));
  for (const id of state.found) assert.ok(!sealed.has(db.items.get(id).cat), `${db.items.get(id).name} открыт без дара`);
  assert.ok(state.found.size >= 600, `без даров открывается ${state.found.size}`);
  // ящерица + огонь = дракон, но дракон — из «Магии»
  const [a, b] = [idOf('ящерица'), idOf('огонь')];
  const before = structuredClone(progress);
  const res = mix(db, progress, state, a, b);
  assert.equal(res.kind, 'sealed');
  assert.equal(db.items.get(res.gift.id).name, 'магия');
  assert.equal(res.id, null, 'что получится — не говорится');
  assert.deepEqual(progress, before, 'запечатанная пара в прогресс не идёт');
  assert.equal(sealOf(db, state.found, idOf('дракон')).at, 150);
  assert.deepEqual(grantGifts(db, progress, state).map((id) => db.items.get(id).name), ['время', 'магия', 'разум']);
  assert.equal(sealOf(db, state.found, idOf('дракон')), null);
  assert.equal(mix(db, progress, state, a, b).kind, 'new');
  assert.ok(state.found.has(idOf('дракон')));
});

test('звания: пороги растут, первое — с нуля, последнее достижимо', () => {
  assert.equal(RANKS[0].at, 0);
  for (let k = 1; k < RANKS.length; k++) assert.ok(RANKS[k].at > RANKS[k - 1].at);
  assert.ok(RANKS.at(-1).at <= db.total);
  assert.equal(new Set(RANKS.map((r) => r.title)).size, RANKS.length);
  // дары приходят вместе со званием
  for (const g of db.gifts) assert.ok(RANKS.some((r) => r.at === g.at), `дар на ${g.at}`);
});

test('задания ведут до конца: цель всегда можно собрать, и так открывается вся база', () => {
  for (const seed of [1, 2, 3]) {
    const rng = rngOf(seed);
    const progress = emptyProgress();
    const state = stateOf(db, progress);
    let last = null;
    for (;;) {
      const id = pickQuest(db, state.found, rng, last);
      if (id === null) break;
      assert.ok(!state.found.has(id) && !sealOf(db, state.found, id));
      const r = readyRecipe(db, state.found, id);
      assert.ok(r, `цель «${db.items.get(id).name}» не собрать`);
      assert.equal(mix(db, progress, state, r.a, r.b).kind, 'new');
      grantGifts(db, progress, state);
      last = id;
    }
    assert.equal(state.found.size, db.total, `зерно ${seed}`);
    assert.equal(progress.found.length, db.total - db.start.length);
  }
});
