// База городов (data/cities.json): целая, без повторов и мусора, знакомые города на месте, источники в лицензиях.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { keyOf, createAtlas, lastLetter, ALPHABET, SKIP_LETTERS, BOT_LIMIT } from '../logic.js';

const file = new URL('../data/cities.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const atlas = createAtlas(data);
const n = data.names.length;

test('столбцы одной длины, файл не тяжелее мегабайта', () => {
  assert.ok(n > 20000 && n < 30000, `городов ${n}`);
  for (const col of ['country', 'lat', 'lon', 'pop']) assert.equal(data[col].length, n, col);
  assert.ok(statSync(file).size < 1024 * 1024, `размер ${statSync(file).size}`);
  assert.ok(n > BOT_LIMIT);
});

test('названия: кириллица с заглавной, без цифр и скобок, без повторов', () => {
  const seen = new Set();
  for (const name of data.names) {
    assert.match(name, /^[А-ЯЁ][а-яё]+(?:[-’][А-ЯЁа-яё]+)*(?: [А-ЯЁ][а-яё]*(?:[-’][А-ЯЁа-яё]+)*)*$/, name);
    const key = keyOf(name);
    assert.ok(key.length >= 2, name);
    assert.ok(!seen.has(key), `повтор: ${name}`);
    seen.add(key);
    assert.ok(lastLetter(name), `${name}: нет буквы для следующего хода`);
  }
});

test('страна, координаты и население — в разумных пределах', () => {
  assert.ok(data.countries.length > 150);
  for (const c of data.countries) assert.match(c, /^[А-ЯЁ][А-Яа-яЁё’ ,-—]+$/, c);
  for (let i = 0; i < n; i++) {
    assert.ok(Number.isInteger(data.country[i]) && data.country[i] >= 0 && data.country[i] < data.countries.length, data.names[i]);
    assert.ok(Number.isInteger(data.lat[i]) && Math.abs(data.lat[i]) <= 9000, data.names[i]);
    assert.ok(Number.isInteger(data.lon[i]) && Math.abs(data.lon[i]) <= 18000, data.names[i]);
    assert.ok(Number.isInteger(data.pop[i]) && data.pop[i] >= 0 && data.pop[i] < 40000, data.names[i]);
  }
});

test('знакомые города на месте и там, где должны быть', () => {
  const check = (name, country, lat, lon) => {
    const hit = atlas.find(name);
    assert.ok(hit, `нет города ${name}`);
    if (country) assert.equal(atlas.country(hit.city), country, name);
    if (lat != null) assert.ok(Math.abs(atlas.lat(hit.city) - lat) < 1 && Math.abs(atlas.lon(hit.city) - lon) < 1, `${name}: ${atlas.lat(hit.city)}, ${atlas.lon(hit.city)}`);
  };
  check('Москва', 'Россия', 55.75, 37.62);
  check('Санкт-Петербург', 'Россия', 59.94, 30.31);
  check('Нью-Йорк', 'США', 40.71, -74.01);
  check('Лондон', 'Великобритания', 51.51, -0.13);
  check('Париж', 'Франция', 48.85, 2.35);
  check('Токио', 'Япония', 35.69, 139.69);
  check('Сидней', 'Австралия', -33.87, 151.21);
  check('Рио-де-Жанейро', 'Бразилия', -22.9, -43.2);
  check('Мадрид', 'Испания', 40.42, -3.7);
  check('Мюнхен', 'Германия', 48.14, 11.58);
  check('Киев', 'Украина');
  check('Минск', 'Белоруссия');
  check('Амстердам', 'Нидерланды');
  check('Дубай', 'ОАЭ');
  check('Сеул', 'Южная Корея');
  check('Симферополь', 'Крым');
  for (const name of [
    'Архангельск', 'Курск', 'Казань', 'Новосибирск', 'Екатеринбург', 'Владивосток', 'Йошкар-Ола', 'Ростов-на-Дону',
    'Нижний Новгород', 'Набережные Челны', 'Великие Луки', 'Воткинск', 'Кириши', 'Суздаль', 'Плёс', 'Орёл', 'Щёлково',
    'Электросталь', 'Юрмала', 'Якутск', 'Цюрих', 'Чита', 'Шымкент', 'Эр-Рияд', 'Хельсинки', 'Фрязино', 'Уфа', 'Тверь',
    'Жуковский', 'Барселона', 'Сан-Паулу', 'Сингапур', 'Баку', 'Гонконг', 'Сарагоса', 'Антверпен', 'Чанша', 'Канны',
    'Венеция', 'Оксфорд', 'Кейптаун', 'Буэнос-Айрес', 'Лос-Анджелес', 'Сан-Франциско', 'Франкфурт-на-Майне',
  ]) check(name);
});

test('самые известные города — в начале: их знает даже лёгкий бот', () => {
  const top = new Set(data.names.slice(0, 60));
  for (const name of ['Москва', 'Париж', 'Лондон', 'Рим', 'Берлин', 'Токио', 'Нью-Йорк', 'Санкт-Петербург', 'Киев', 'Минск', 'Пекин']) {
    assert.ok(top.has(name), `${name} не в первых 60`);
  }
  // города-миллионники России — в первых трёхстах
  const first = new Set(data.names.slice(0, 300));
  for (const name of ['Казань', 'Новосибирск', 'Екатеринбург', 'Самара', 'Омск', 'Челябинск', 'Уфа', 'Пермь', 'Воронеж', 'Волгоград', 'Красноярск']) {
    assert.ok(first.has(name), `${name} не в первых 300`);
  }
});

test('на каждую букву, кроме пропускаемых, есть города — и среди тех, что называет бот', () => {
  for (const ch of ALPHABET) {
    const list = atlas.startsWith(ch);
    if (SKIP_LETTERS.includes(ch) && ch !== 'ы') {
      assert.equal(list.length, 0, `на «${ch}» городов не бывает`);
      continue;
    }
    if (ch === 'ы') continue;                              // на Ы города есть, но буква всё равно пропускается
    assert.ok(list.length >= 10, `на «${ch}» городов: ${list.length}`);
    assert.ok(list.filter((c) => c < BOT_LIMIT).length >= 5, `бот на «${ch}»: ${list.filter((c) => c < BOT_LIMIT).length}`);
  }
});

test('другие названия ведут к существующим городам и не совпадают с настоящими', () => {
  assert.ok(data.aliases.length >= 40);
  const names = new Set(data.names.map(keyOf));
  const seen = new Set();
  for (const [alias, city] of data.aliases) {
    assert.ok(Number.isInteger(city) && city >= 0 && city < n, alias);
    assert.ok(!names.has(keyOf(alias)), `${alias} — уже название города`);
    assert.ok(!seen.has(keyOf(alias)), `${alias} — дважды`);
    seen.add(keyOf(alias));
    assert.equal(atlas.find(alias).city, city);
  }
  for (const [alias, canon] of [['Ленинград', 'Санкт-Петербург'], ['Алматы', 'Алма-Ата'], ['Горький', 'Нижний Новгород'], ['Бомбей', 'Мумбаи'], ['Сталинград', 'Волгоград']]) {
    assert.equal(atlas.find(alias)?.city, atlas.find(canon).city, alias);
    assert.equal(atlas.find(alias).name, alias);
  }
  // старое название, которое носит другой город, остаётся за ним (Свердловск в Луганской области)
  assert.notEqual(atlas.find('Свердловск')?.city, atlas.find('Екатеринбург').city);
});

test('источники данных названы в лицензиях', () => {
  for (const name of ['LICENSE', 'LICENSE.ru.md']) {
    const text = readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8');
    assert.match(text, /games\/cities\/data\/cities\.json/, name);
    assert.match(text, /GeoNames/, name);
    assert.match(text, /Wikidata/, name);
    assert.match(text, /Natural Earth/, name);
  }
  assert.match(data.source, /GeoNames.*CC BY 4\.0/);
});
