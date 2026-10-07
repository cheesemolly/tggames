// Правила «Городов»: названия и буквы, проверка хода, разбор сохранённой партии, бот, подсказки, статистика.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVEL_IDS, LEVELS, BOT_LIMIT, TIMERS, HINTS, ALPHABET,
  keyOf, titleCase, createAtlas, lastLetter, needOf, hasFree, distance, newGame, replay, isValidState, checkMove,
  chance, knows, botMove, examples, hint, turnOf, mineOf,
  emptyStats, migrateStats, isValidStats, recordGame, formatKm, formatPop, citiesWord,
} from '../logic.js';

const real = createAtlas(JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8')));

/** Маленькая база для точных проверок: города по убыванию известности. */
const small = createAtlas({
  countries: ['Россия', 'Франция', 'Турция'],
  names: ['Москва', 'Анкара', 'Архангельск', 'Курск', 'Казань', 'Нант', 'Тверь', 'Рязань', 'Адана', 'Ыгдыр', 'Нью-Йорк', 'Орёл', 'Королёв'],
  country: [0, 2, 0, 0, 0, 1, 0, 0, 2, 2, 0, 0, 0],
  lat: [5575, 3993, 6454, 5173, 5579, 4722, 5686, 5463, 3700, 3992, 4071, 5297, 5591],
  lon: [3762, 3286, 4054, 3619, 4912, -155, 3590, 3974, 3532, 4404, -7401, 3607, 3782],
  pop: [12600, 5700, 350, 440, 1250, 300, 420, 540, 1700, 100, 8800, 300, 220],
  aliases: [['Ленинград', 99], ['Калинин', 6], ['Белокаменная', 0]],
});

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('название: регистр, ё, пробелы и дефисы не важны', () => {
  assert.equal(keyOf('Нью-Йорк'), 'ньюйорк');
  assert.equal(keyOf('  нью йорк '), 'ньюйорк');
  assert.equal(keyOf('Орёл'), keyOf('орел'));
  assert.equal(keyOf('Кот-д’Ивуар'), 'котдивуар');
  assert.equal(keyOf('New York'), '');
  assert.equal(keyOf(null), '');
});

test('набранное показывается с заглавных, частицы внутри названия — со строчной', () => {
  assert.equal(titleCase('ростов-на-дону'), 'Ростов-на-Дону');
  assert.equal(titleCase('нью-йорк'), 'Нью-Йорк');
  assert.equal(titleCase('нижний новгород'), 'Нижний Новгород');
  assert.equal(titleCase('РИО-ДЕ-ЖАНЕЙРО'), 'Рио-де-Жанейро');
  assert.equal(titleCase('ёлка'), 'Ёлка');
  assert.equal(titleCase(''), '');
});

test('буква следующего хода: последняя, кроме ь, ъ и ы', () => {
  assert.deepEqual(lastLetter('Москва'), { letter: 'а', pos: 5 });
  assert.deepEqual(lastLetter('Казань'), { letter: 'н', pos: 4 });
  assert.deepEqual(lastLetter('Чебоксары'), { letter: 'р', pos: 7 });
  assert.deepEqual(lastLetter('Грозный'), { letter: 'й', pos: 6 });
  assert.deepEqual(lastLetter('Королёв'), { letter: 'в', pos: 6 });
  assert.deepEqual(lastLetter('Сан-Хосе'), { letter: 'е', pos: 7 });
  assert.equal(lastLetter('Ы'), null);
  assert.equal(lastLetter(''), null);
  // ё на конце — это е
  assert.equal(lastLetter('Шевё').letter, 'е');
});

test('буква, на которую городов не осталось, пропускается — берётся предыдущая', () => {
  assert.deepEqual(lastLetter('Москва', (ch) => ch !== 'а'), { letter: 'в', pos: 4 });
  const used = new Set([1, 2, 8]);                       // все города на А названы
  assert.equal(hasFree(small, used, 'а'), false);
  assert.equal(hasFree(small, used, 'к'), true);
  assert.deepEqual(needOf(small, [{ name: 'Москва', by: 0 }], new Set([0, 1, 2, 8])), { letter: 'к', pos: 3 });
  assert.equal(needOf(small, [], new Set()), null);
});

test('база: поиск по названию и по другому названию, города на букву — по известности', () => {
  assert.equal(small.size, 13);
  assert.deepEqual(small.find('москва'), { city: 0, name: 'Москва' });
  assert.deepEqual(small.find('НЬЮ ЙОРК'), { city: 10, name: 'Нью-Йорк' });
  assert.deepEqual(small.find('орел'), { city: 11, name: 'Орёл' });
  assert.deepEqual(small.find('Калинин'), { city: 6, name: 'Калинин' });
  assert.equal(small.find('Ленинград'), null, 'другое название несуществующего города не берётся');
  assert.equal(small.find('Лондон'), null);
  assert.deepEqual([...small.startsWith('а')], [1, 2, 8]);
  assert.deepEqual([...small.startsWith('щ')], []);
  assert.equal(small.letterRank(8), 2);
  assert.equal(small.country(5), 'Франция');
  assert.equal(small.pop(0), 12600000);
  assert.equal(small.lat(0), 55.75);
});

test('проверка хода: пусто, не та буква, нет такого города, уже был', () => {
  const used = new Set([0]);
  const need = { letter: 'а', pos: 5 };
  assert.deepEqual(checkMove(small, used, need, '  '), { ok: false, error: 'empty' });
  assert.deepEqual(checkMove(small, used, need, 'Курск'), { ok: false, error: 'letter', letter: 'а' });
  assert.deepEqual(checkMove(small, used, need, 'Атлантида'), { ok: false, error: 'unknown' });
  assert.deepEqual(checkMove(small, new Set([0, 1]), need, 'анкара'), { ok: false, error: 'used', city: 1 });
  assert.deepEqual(checkMove(small, used, need, 'анкара'), { ok: true, city: 1, name: 'Анкара' });
  // первый ход — любой город; другое название считается тем же городом
  assert.deepEqual(checkMove(small, new Set(), null, 'белокаменная'), { ok: true, city: 0, name: 'Белокаменная' });
  assert.deepEqual(checkMove(small, used, null, 'Белокаменная'), { ok: false, error: 'used', city: 0 });
});

test('новая партия и разбор цепочки: города, перелёты, буква', () => {
  const game = newGame('medium', 60, 5);
  assert.deepEqual(game, { v: 1, level: 'medium', timer: 60, seed: 5, chain: [], hints: HINTS });
  assert.equal(turnOf(game), 0);
  game.chain.push({ name: 'Москва', by: 0 }, { name: 'Архангельск', by: 1 }, { name: 'Казань', by: 0 });
  const view = replay(small, game);
  assert.deepEqual(view.cities, [0, 2, 4]);
  assert.deepEqual([...view.used], [0, 2, 4]);
  assert.equal(view.legs.length, 2);
  assert.equal(view.km, view.legs[0] + view.legs[1]);
  assert.ok(Math.abs(view.legs[0] - 990) < 40, `Москва — Архангельск: ${view.legs[0]}`);
  assert.deepEqual(view.need, { letter: 'н', pos: 4 });
  assert.equal(turnOf(game), 1);
  assert.equal(mineOf(game), 2);
  const empty = replay(small, newGame());
  assert.deepEqual({ cities: empty.cities, km: empty.km, need: empty.need }, { cities: [], km: 0, need: null });
});

test('испорченная партия не принимается', () => {
  const ok = () => ({ v: 1, level: 'easy', timer: 0, seed: 1, hints: 2, chain: [{ name: 'Москва', by: 0 }, { name: 'Анкара', by: 1 }] });
  assert.ok(isValidState(small, ok()));
  const broken = [
    null, 5, 'партия', [],
    { ...ok(), v: 2 },
    { ...ok(), level: 'god' },
    { ...ok(), timer: 45 },
    { ...ok(), seed: -1 },
    { ...ok(), seed: 1.5 },
    { ...ok(), hints: HINTS + 1 },
    { ...ok(), hints: -1 },
    { ...ok(), chain: 'Москва' },
    { ...ok(), chain: [{ name: 'Москва', by: 1 }] },                                        // первым ходит игрок
    { ...ok(), chain: [{ name: 'Москва', by: 0 }, { name: 'Анкара', by: 0 }] },             // два хода подряд
    { ...ok(), chain: [{ name: 'Москва', by: 0 }, { name: 'Курск', by: 1 }] },              // не та буква
    { ...ok(), chain: [{ name: 'Москва', by: 0 }, { name: 'Атлантида', by: 1 }] },          // нет такого города
    { ...ok(), chain: [{ name: 'Анкара', by: 0 }, { name: 'Адана', by: 1 }, { name: 'Анкара', by: 0 }] },   // повтор
    { ...ok(), chain: [{ name: 'Москва', by: 0 }, { name: 'Анкара', by: 1 }, { name: 'Белокаменная', by: 0 }] },   // тот же город под другим названием
    { ...ok(), chain: [{ name: 'Москва', by: 0 }, null] },
    { ...ok(), chain: [{ name: 5, by: 0 }] },
  ];
  for (const g of broken) assert.equal(isValidState(small, g), false, JSON.stringify(g));
  assert.ok(isValidState(small, { ...ok(), chain: [] }));
});

test('бот: знает больше с каждым уровнем, на каждую букву — не меньше положенного', () => {
  for (const seed of [1, 777, 123456]) {
    let prev = 0;
    for (const level of LEVEL_IDS) {
      let count = 0;
      for (let city = 0; city < real.size; city++) {
        const k = knows(real, level, seed, city);
        if (k) count++;
        if (city >= BOT_LIMIT) assert.equal(k, false, 'малоизвестные города бот не называет');
        // что знает слабый бот, знает и сильный
        if (k) for (const stronger of LEVEL_IDS.slice(LEVEL_IDS.indexOf(level) + 1)) assert.ok(knows(real, stronger, seed, city), `${level} → ${stronger}: ${real.name(city)}`);
      }
      assert.ok(count > prev, `${level}: ${count}`);
      prev = count;
      for (const ch of ALPHABET) {
        const list = real.startsWith(ch).filter((c) => c < BOT_LIMIT);
        const known = list.filter((c) => knows(real, level, seed, c)).length;
        assert.ok(known >= Math.min(LEVELS[level].each, list.length), `${level}, буква ${ch}: ${known}`);
      }
    }
    assert.equal(prev, BOT_LIMIT, 'мастер знает все города, которые бот вообще называет');
  }
  const easy = Array.from({ length: BOT_LIMIT }, (_, c) => c).filter((c) => knows(real, 'easy', 1, c)).length;
  assert.ok(easy > 90 && easy < 220, `лёгкий знает ${easy}`);
});

test('бот: край знаний у разных партий разный, у одной — один и тот же', () => {
  const edge = Array.from({ length: 300 }, (_, c) => c + 60);
  const a = edge.filter((c) => knows(real, 'easy', 1, c));
  const b = edge.filter((c) => knows(real, 'easy', 2, c));
  assert.deepEqual(a, edge.filter((c) => knows(real, 'easy', 1, c)));
  assert.notDeepEqual(a, b);
  for (const c of [0, 5, 1000]) assert.ok(chance(7, c) >= 0 && chance(7, c) < 1);
});

test('бот: называет город на нужную букву из известных и неназванных; не знает — сдаётся', () => {
  const game = { ...newGame('master', 0, 3), chain: [{ name: 'Москва', by: 0 }] };
  const used = new Set([0]);
  const need = needOf(small, game.chain, used);
  for (let k = 0; k < 40; k++) assert.ok([1, 2, 8].includes(botMove(small, game, used, need, rngOf(k))));
  assert.equal(botMove(small, game, new Set([0, 1, 2]), need, rngOf(1)), 8);
  assert.equal(botMove(small, game, new Set([0, 1, 2, 8]), { letter: 'а', pos: 5 }, rngOf(1)), null);
  assert.equal(botMove(small, game, used, { letter: 'щ', pos: 0 }, rngOf(1)), null);
  // известные города называются чаще малоизвестных
  const count = [0, 0, 0];
  for (let k = 0; k < 600; k++) count[[1, 2, 8].indexOf(botMove(small, { ...game, level: 'easy' }, used, need, rngOf(k * 7 + 1)))]++;
  assert.ok(count[0] > count[2], count.join(' '));
});

test('бот против бота на настоящей базе: все ходы по правилам, партия кончается сдачей', () => {
  for (const [level, seed] of [['easy', 11], ['medium', 22], ['hard', 33], ['master', 44]]) {
    const rng = rngOf(seed);
    const game = newGame(level, 0, seed);
    const used = new Set();
    let stuck = false;
    for (let step = 0; step < 400; step++) {
      const need = needOf(real, game.chain, used);
      // за «игрока» ходит такой же бот, но он знает только самые известные города
      const move = botMove(real, { ...game, level: step % 2 ? level : 'easy' }, used, need, rng);
      if (move == null) {
        stuck = true;
        break;
      }
      assert.ok(!used.has(move));
      if (need) assert.equal(real.key(move)[0], need.letter);
      used.add(move);
      game.chain.push({ name: real.name(move), by: step % 2 });
    }
    assert.ok(game.chain.length >= 4, `${level}: ходов ${game.chain.length}`);
    const view = replay(real, game);
    assert.ok(view, `${level}: партия разбирается`);
    assert.equal(view.cities.length, game.chain.length);
    assert.ok(view.km > 0);
    assert.ok(stuck || game.chain.length === 400);
  }
});

test('подсказка и «можно было»: известные неназванные города на букву', () => {
  const used = new Set([1]);
  const need = { letter: 'а', pos: 0 };
  assert.deepEqual(examples(small, used, need, 3), [2, 8]);
  assert.deepEqual(examples(small, new Set([1, 2, 8]), need, 3), []);
  assert.deepEqual(examples(small, used, null), []);
  for (let k = 0; k < 20; k++) assert.ok([2, 8].includes(hint(small, used, need, rngOf(k))));
  assert.equal(hint(small, new Set([1, 2, 8]), need), null);
  // в начале партии — любой известный
  const first = hint(real, new Set(), null, rngOf(4));
  assert.ok(first >= 0 && first < 40);
});

test('расстояние между городами', () => {
  const moscow = real.find('Москва').city;
  const piter = real.find('Санкт-Петербург').city;
  const sydney = real.find('Сидней').city;
  assert.ok(Math.abs(distance(real, moscow, piter) - 634) < 15, String(distance(real, moscow, piter)));
  assert.ok(Math.abs(distance(real, moscow, sydney) - 14500) < 300, String(distance(real, moscow, sydney)));
  assert.equal(distance(real, moscow, moscow), 0);
  assert.equal(distance(real, moscow, piter), distance(real, piter, moscow));
});

test('статистика: партии, победы, рекорд городов, маршруты', () => {
  const stats = emptyStats();
  assert.ok(isValidStats(stats));
  recordGame(stats, 'easy', 'win', 12, 30000);
  recordGame(stats, 'easy', 'lose', 20, 52000);
  recordGame(stats, 'hard', 'lose', 3, 4000);
  assert.deepEqual(stats.easy, { played: 2, wins: 1, losses: 1, best: 20 });
  assert.deepEqual(stats.hard, { played: 1, wins: 0, losses: 1, best: 3 });
  assert.deepEqual(stats.total, { cities: 35, km: 86000, far: 52000 });
  assert.ok(isValidStats(stats));
  recordGame(stats, 'нет такого', 'win', 5, 5);
  assert.deepEqual(stats.total, { cities: 35, km: 86000, far: 52000 });
  // мусор из хранилища превращается в нули
  const fixed = migrateStats({ easy: { played: -2, wins: 'много', best: 7.5 }, total: { cities: 9, km: null }, чужое: 1 });
  assert.deepEqual(fixed.easy, { played: 0, wins: 0, losses: 0, best: 0 });
  assert.deepEqual(fixed.total, { cities: 9, km: 0, far: 0 });
  assert.deepEqual(migrateStats(null), emptyStats());
  assert.equal(isValidStats({ easy: {} }), false);
});

test('подписи: километры, население, «города»', () => {
  assert.equal(formatKm(12480), '12 480 км');
  assert.equal(formatKm(910), '910 км');
  assert.equal(formatPop(12600000), '12,6 млн');
  assert.equal(formatPop(1000000), '1 млн');
  assert.equal(formatPop(301000), '301 тыс.');
  assert.equal(formatPop(400), '1 тыс.');
  assert.equal(formatPop(0), '');
  assert.equal(citiesWord(1), '1 город');
  assert.equal(citiesWord(3), '3 города');
  assert.equal(citiesWord(12), '12 городов');
  assert.equal(citiesWord(21), '21 город');
  assert.deepEqual(TIMERS, [0, 60, 30]);
});
