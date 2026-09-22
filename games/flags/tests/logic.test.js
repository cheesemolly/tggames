// «Флаги»: база стран и флагов, нормализация и поиск по вводу, автодополнение, варианты теста, ход игры.
// Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  normalize, findCountry, suggest, options, newGame, answer, next, isOver, current, asked, regionPool,
  isValidState, emptyStats, recordGame, isValidStats, spellings, REGIONS, MARATHON_LIVES,
} from '../logic.js';

const countries = JSON.parse(readFileSync(new URL('../countries.json', import.meta.url), 'utf8'));

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

test('база: 196 стран, у каждой флаг, регион, названия не пересекаются', () => {
  assert.equal(countries.length, 196);
  const all = new Map();
  for (const c of countries) {
    assert.ok(existsSync(new URL(`../flags/${c.code}.svg`, import.meta.url)), `нет флага ${c.code}`);
    assert.ok(REGIONS.includes(c.region) && c.region !== 'world', `${c.code}: регион ${c.region}`);
    assert.ok(/^[А-ЯЁ]/.test(c.name), `${c.code}: ${c.name}`);
    for (const n of spellings(c)) {
      assert.ok(!all.has(n) || all.get(n) === c.code, `«${n}» — и ${all.get(n)}, и ${c.code}`);
      all.set(n, c.code);
    }
  }
  for (const code of ['ru', 'us', 'gb', 'va', 'ps', 'xk']) assert.ok(countries.some((c) => c.code === code), code);
  for (const r of REGIONS.slice(1)) assert.ok(regionPool(countries, r).length >= 14, r);
});

test('ввод: регистр, ё, дефисы и варианты названий', () => {
  assert.equal(normalize('  Кот-д’Ивуар '), 'кот д ивуар');
  assert.equal(findCountry(countries, 'россия').code, 'ru');
  assert.equal(findCountry(countries, 'РОССИЙСКАЯ федерация').code, 'ru');
  assert.equal(findCountry(countries, 'сша').code, 'us');
  assert.equal(findCountry(countries, 'Соединенные Штаты Америки').code, 'us', 'ё = е');
  assert.equal(findCountry(countries, 'белоруссия').code, 'by');
  assert.equal(findCountry(countries, 'Беларусь').code, 'by');
  assert.equal(findCountry(countries, 'кот д ивуар').code, 'ci');
  assert.equal(findCountry(countries, 'гвинея бисау').code, 'gw');
  assert.equal(findCountry(countries, 'Росс'), null, 'только полное название');
  assert.equal(findCountry(countries, ''), null);
});

test('автодополнение: «Р» — Россия, Румыния, Руанда…; по вариантам и по словам', () => {
  const r = suggest(countries, 'р', 10).map((c) => c.name);
  assert.ok(r.includes('Россия') && r.includes('Румыния') && r.includes('Руанда'), r.join(', '));
  assert.ok(r.slice(0, 3).every((n) => normalize(n).startsWith('р')), 'сначала — те, чьё название начинается с «Р»');
  assert.deepEqual(suggest(countries, 'Рос').map((c) => c.name), ['Россия']);
  assert.equal(suggest(countries, 'белор')[0].code, 'by', 'по варианту');
  assert.ok(suggest(countries, 'гвин').length >= 4, 'Гвинея, Гвинея-Бисау, Экваториальная Гвинея, Папуа — Новая Гвинея');
  assert.ok(suggest(countries, 'гвин').some((c) => c.code === 'gq'), 'по слову внутри названия');
  assert.equal(suggest(countries, 'ё', 50).length, suggest(countries, 'е', 50).length);
  assert.ok(suggest(countries, 'а', 6).length <= 6);
  assert.deepEqual(suggest(countries, 'щщщ'), []);
});

test('тест: четыре разных варианта, верный среди них, подставные чаще из того же региона', () => {
  const rng = seeded(3);
  let sameRegion = 0;
  let total = 0;
  for (const c of countries) {
    const opts = options(countries, c.code, rng);
    assert.equal(opts.length, 4);
    assert.equal(new Set(opts).size, 4);
    assert.ok(opts.includes(c.code));
    for (const o of opts) {
      if (o === c.code) continue;
      total++;
      if (countries.find((x) => x.code === o).region === c.region) sameRegion++;
    }
  }
  assert.ok(sameRegion / total > 0.6, `из того же региона ${sameRegion}/${total}`);
});

test('игра: 10 флагов без повторов, ответы, конец; марафон — до трёх ошибок', () => {
  const rng = seeded(7);
  const s = newGame(countries, { mode: 'test', length: 10, region: 'europe' }, rng);
  assert.equal(s.queue.length, 10);
  assert.equal(new Set(s.queue).size, 10);
  assert.ok(s.queue.every((code) => countries.find((c) => c.code === code).region === 'europe'));
  assert.ok(isValidState(JSON.parse(JSON.stringify(s)), countries));
  for (let k = 0; k < 10; k++) {
    assert.ok(s.choices.includes(current(s)));
    answer(s, k % 3 === 0 ? 'xx' : current(s));
    assert.equal(answer(s, current(s)).ok, k % 3 !== 0, 'повторный ответ не меняет итог');
    if (k < 9) {
      assert.equal(isOver(s), false);
      next(s, countries, rng);
    }
  }
  assert.ok(isOver(s));
  assert.equal(s.correct, 6);
  assert.equal(s.wrong.length, 4);
  assert.equal(asked(s), 10);
  const m = newGame(countries, { mode: 'type', length: 'marathon', region: 'world' }, rng);
  assert.equal(m.queue.length, 196);
  assert.equal(m.choices, null);
  for (let k = 0; k < MARATHON_LIVES; k++) {
    answer(m, null);
    if (k < MARATHON_LIVES - 1) next(m, countries, rng);
  }
  assert.ok(isOver(m), 'три ошибки — конец марафона');
  let st = recordGame(emptyStats(), s);
  st = recordGame(st, m);
  assert.equal(st.games, 2);
  assert.equal(st.best.test, 6);
  assert.equal(st.correct, 6);
  assert.ok(Object.values(st.misses).reduce((a, b) => a + b, 0) === 7);
  assert.ok(isValidStats(st));
});
