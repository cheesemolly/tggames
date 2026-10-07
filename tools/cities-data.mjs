// База «Городов» (games/cities/data/cities.json):
//   node tools/cities-data.mjs <папка с исходниками> [--stats]
// В папке (в репозиторий она не кладётся):
//   cities5000.txt, cities1000.txt — GeoNames (CC BY 4.0, download.geonames.org/export/dump): координаты, страна,
//                   население, названия на разных языках;
//   wd.tsv        — Wikidata (CC0) по номеру GeoNames: «номер, объект, русская метка, число разделов Википедии, типы»
//                   (запрос к query.wikidata.org пачками: ?item wdt:P1566 "<номер>"; rdfs:label; wikibase:sitelinks; wdt:P31);
//   wd2.tsv       — Wikidata по русской метке: «метка, объект, разделов, координаты» (?item rdfs:label "<название>"@ru;
//                   wdt:P625; wikibase:sitelinks) — для городов, у которых номер GeoNames записан у района или у
//                   малоизвестного двойника (Мюнхен, Сан-Паулу, Мадрид); метки — кириллические названия из GeoNames;
//   countries.tsv — русские названия стран по коду ISO (?c wdt:P297 ?code; rdfs:label).
// Что на выходе: города по убыванию известности (сначала те, что знает каждый) — по ним бот и выбирает, что он
// «знает» на своём уровне; столбцы — названия, номер страны, широта и долгота ×100, население в тысячах.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { keyOf } from '../games/cities/logic.js';

const dir = process.argv[2];
const stats = process.argv.includes('--stats');
if (!dir) {
  console.error('node tools/cities-data.mjs <папка с исходниками> [--stats]');
  process.exit(1);
}

const rows = (file) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const unq = (s) => String(s ?? '').replace(/^"|"(@ru)?$/g, '');
const RAD = Math.PI / 180;
function km(a, b) {
  const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lon - a.lon) * RAD) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- страны ----------

// короткие привычные названия вместо официальных
const COUNTRY = {
  NL: 'Нидерланды', AE: 'ОАЭ', KR: 'Южная Корея', KP: 'Северная Корея', TW: 'Тайвань', XK: 'Косово', PS: 'Палестина',
  CD: 'ДР Конго', CG: 'Конго', FM: 'Микронезия', DK: 'Дания', CN: 'Китай', US: 'США', GB: 'Великобритания',
  IE: 'Ирландия', MK: 'Северная Македония', BS: 'Багамы', GM: 'Гамбия', VA: 'Ватикан', CI: 'Кот-д’Ивуар',
  MD: 'Молдавия', BY: 'Белоруссия', KG: 'Киргизия', TL: 'Восточный Тимор', CZ: 'Чехия', HK: 'Гонконг', MO: 'Макао',
};
// бывший СССР: [прибавка к известности, ещё столько же — за размер города]
const near = [35, 25];
const far = [10, 10];
const EX_USSR = { RU: [60, 40], UA: near, BY: near, KZ: near, UZ: far, KG: far, TJ: far, TM: far, AZ: far, AM: far, GE: far, MD: far, LV: far, LT: far, EE: far };
const countryName = new Map();
for (const r of rows('countries.tsv').slice(1)) {
  const code = unq(r[0]);
  const name = unq(r[1]);
  if (!countryName.has(code) || name.length < countryName.get(code).length) countryName.set(code, name);
}
for (const [code, name] of Object.entries(COUNTRY)) countryName.set(code, name);
// Крым: у GeoNames — Украина, по российским картам — Россия; чтобы не спорить, пишем просто «Крым»
const CRIMEA = new Set(['UA.11', 'UA.20']);

// ---------- исходные города ----------

const geo = new Map();
for (const file of ['cities1000.txt', 'cities5000.txt']) {
  for (const r of rows(file)) {
    geo.set(r[0], { id: r[0], en: r[1], alt: r[3], lat: Number(r[4]), lon: Number(r[5]), fcode: r[7], cc: r[8], adm1: r[10], pop: Number(r[14]) });
  }
}

// название годится: кириллица, каждое слово с заглавной (части через дефис — любые: Ростов-на-Дону), без цифр и скобок
const NAME = /^[А-ЯЁ][а-яё]+(?:[-’'][А-ЯЁа-яё]+)*(?: [А-ЯЁ][а-яё]*(?:[-’'][А-ЯЁа-яё]+)*)*$/;
// у части городов России объект Wikidata — «городской округ Воткинск»: берём само название
const PREFIX = /^(?:городской округ|городское поселение|муниципальное образование|город|посёлок)\s+(?=[А-ЯЁ])/;
const STRESS = String.fromCharCode(0x301);   // знак ударения в метках («Новосиби́рск»)
const clean = (name) => name.replaceAll(STRESS, '').replace(/'/g, '’').replace(/\s*\([^)]*\)$/, '').trim().replace(PREFIX, '');
// районы и кварталы, а не города (типы Wikidata) — если у объекта нет ещё и «городского» типа
const DISTRICT = new Set([
  'Q604435', 'Q22674925', 'Q27587207', 'Q123705', 'Q2983893', 'Q15715406', 'Q3840711', 'Q21507948', 'Q4389092',
  'Q27587491', 'Q2264924', 'Q97660032', 'Q771444', 'Q2023000', 'Q18511725', 'Q1195098', 'Q5084', 'Q532',
]);
const CITY = new Set(['Q7930989', 'Q515', 'Q1549591', 'Q1637706', 'Q5119', 'Q3957', 'Q174844', 'Q200250', 'Q106389302']);

const picked = new Map();   // объект Wikidata → город
function take(g, ru, links, q, types = []) {
  const name = clean(ru);
  if (!NAME.test(name) || g.fcode === 'PPLX' || links < 8) return;
  const isCity = types.some((t) => CITY.has(t));
  if (!isCity && types.some((t) => DISTRICT.has(t)) && (g.pop < 15000 || links < 25)) return;
  // один объект Wikidata мог найтись у города и у его района — оставляем запись с большим населением
  const prev = picked.get(q);
  if (prev && prev.pop >= g.pop) return;
  picked.set(q, { name, links, q, lat: g.lat, lon: g.lon, cc: g.cc, adm1: g.adm1, pop: g.pop, capital: g.fcode === 'PPLC', id: g.id });
}

// города, у которых метка в Wikidata не годится («Киришское городское поселение») или не нашлась, — вручную
const MANUAL = { 548442: 'Кириши', 548602: 'Кингисепп', 6940394: 'Сайтама', 1622786: 'Макасар', 1586203: 'Кантхо' };

// 1) по номеру GeoNames (P1566); у одного номера бывает несколько объектов — берём известнейший
const direct = new Map();
for (const r of rows('wd.tsv')) {
  const id = unq(r[0]);
  const rec = {
    ru: unq(r[2]), links: Number(r[3]), q: r[1].replace(/.*\/(Q\d+)>/, '$1'),
    types: unq(r[4]).split('|').map((t) => t.replace(/.*\//, '')).filter(Boolean),
  };
  if (!direct.has(id) || rec.links > direct.get(id).links) direct.set(id, rec);
}

// 2) по русской метке: она должна быть среди названий города в GeoNames, а объект — рядом с ним. Нужен, когда номер
//    GeoNames в Wikidata записан у района или у малоизвестного двойника («Мадрид-сити» вместо Мадрида)
const byLabel = new Map();
for (const r of rows('wd2.tsv')) {
  const m = /Point\(([-\d.e]+) ([-\d.e]+)\)/.exec(r[3] ?? '');
  if (!m) continue;
  const label = unq(r[0]);
  if (!byLabel.has(label)) byLabel.set(label, []);
  byLabel.get(label).push({ q: r[1].replace(/.*\/(Q\d+)>/, '$1'), links: Number(r[2]), lon: Number(m[1]), lat: Number(m[2]) });
}
function byName(g) {
  let best = null;
  const reach = g.pop >= 1e6 ? 60 : 30;
  for (const label of g.alt.split(',')) {
    for (const cand of byLabel.get(label) ?? []) {
      if (km(g, cand) > reach) continue;
      if (!best || cand.links > best.links) best = { ...cand, label };
    }
  }
  return best;
}
let second = 0;
for (const g of geo.values()) {
  const d = direct.get(g.id);
  const named = !d || d.links < 30 ? byName(g) : null;
  if (MANUAL[g.id]) {
    take(g, MANUAL[g.id], Math.max(d?.links ?? 0, 40), d?.q ?? `geo${g.id}`, d?.types);
  } else if (named && (!d || named.links > d.links)) {
    second++;
    take(g, named.label, named.links, named.q);
  } else if (d) {
    take(g, d.ru, d.links, d.q, d.types);
  }
}

// ---------- известность и отбор ----------

const all = [...picked.values()];
// Известность: число разделов Википедии, приглушённое у маленьких городов (у иных городков разделов сотни — их
// наплодили боты), плюс прибавка столицам и городам бывшего СССР — играют по-русски, свои города на слуху.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
for (const c of all) {
  const size = clamp(Math.log10(Math.max(c.pop, 1000) / 1e5), 0, 1.2);
  const home = EX_USSR[c.cc];
  c.fame = c.links * clamp((Math.log10(Math.max(c.pop, 1000)) - 3.5) / 2.5, 0.25, 1)
    + (c.capital ? 25 : 0)
    + (home ? (c.pop < 50000 ? home[0] / 2 : home[0] + home[1] * size) : 0);
}
// маленькие и малоизвестные города за пределами бывшего СССР не берём — их никто не назовёт, а файл тяжелеет
const kept = all.filter((c) => (c.cc in EX_USSR ? (c.pop >= 5000 || c.links >= 20) : (c.pop >= 15000 || c.links >= 30 || c.capital)));
kept.sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name, 'ru'));

// одно название — один город (самый известный)
const byKey = new Map();
const cities = [];
for (const c of kept) {
  const key = keyOf(c.name);
  if (key.length < 2 || byKey.has(key)) continue;
  byKey.set(key, cities.length);
  cities.push(c);
}

// ---------- другие названия того же города ----------

// привычное, старое или новое название → название в базе (как в русской Википедии)
const ALIASES = {
  'Алматы': 'Алма-Ата', 'Ленинград': 'Санкт-Петербург', 'Петербург': 'Санкт-Петербург', 'Петроград': 'Санкт-Петербург',
  'Свердловск': 'Екатеринбург', 'Горький': 'Нижний Новгород', 'Куйбышев': 'Самара', 'Сталинград': 'Волгоград',
  'Царицын': 'Волгоград', 'Калинин': 'Тверь', 'Орджоникидзе': 'Владикавказ', 'Нур-Султан': 'Астана', 'Целиноград': 'Астана',
  'Акмола': 'Астана', 'Фрунзе': 'Бишкек', 'Бомбей': 'Мумбаи', 'Мумбай': 'Мумбаи', 'Колката': 'Калькутта', 'Мадрас': 'Ченнаи',
  'Сайгон': 'Хошимин', 'Рангун': 'Янгон', 'Константинополь': 'Стамбул', 'Таллинн': 'Таллин', 'Ашгабат': 'Ашхабад',
  'Кёнигсберг': 'Калининград', 'Днепропетровск': 'Днепр', 'Кировоград': 'Кропивницкий', 'Жданов': 'Мариуполь',
  'Ворошиловград': 'Луганск', 'Тифлис': 'Тбилиси', 'Вятка': 'Киров', 'Симбирск': 'Ульяновск', 'Екатеринодар': 'Краснодар',
  'Новониколаевск': 'Новосибирск', 'Бенгалуру': 'Бангалор', 'Кантон': 'Гуанчжоу', 'Нью-Йорк-Сити': 'Нью-Йорк',
  'Лос-Анжелес': 'Лос-Анджелес', 'Семипалатинск': 'Семей', 'Гурьев': 'Атырау', 'Чимкент': 'Шымкент',
  'Актюбинск': 'Актобе', 'Кустанай': 'Костанай', 'Ленинабад': 'Худжанд', 'Кишинэу': 'Кишинёв',
  'Ставрополь-на-Волге': 'Тольятти', 'Молотов': 'Пермь', 'Чкалов': 'Оренбург', 'Сталино': 'Донецк', 'Юзовка': 'Донецк',
  'Ленинакан': 'Гюмри', 'Кировабад': 'Гянджа', 'Красноводск': 'Туркменбаши', 'Данциг': 'Гданьск', 'Бреслау': 'Вроцлав',
  'Пресбург': 'Братислава', 'Христиания': 'Осло', 'Эдо': 'Токио', 'Батавия': 'Джакарта', 'Леопольдвиль': 'Киншаса',
  'Сантьяго-де-Чили': 'Сантьяго', 'Мехико-Сити': 'Мехико', 'Сянган': 'Гонконг', 'Аомынь': 'Макао', 'Йокогама': 'Иокогама',
  'Нью-Орлеан': 'Новый Орлеан', 'Франкфурт': 'Франкфурт-на-Майне', 'Ростов': 'Ростов Великий',
};
const aliases = [];
const missing = [];
for (const [alias, canon] of Object.entries(ALIASES)) {
  const at = byKey.get(keyOf(canon));
  if (at == null) {
    missing.push(canon);
    continue;
  }
  if (!NAME.test(alias) || byKey.has(keyOf(alias))) continue;        // такое название уже занято другим городом
  byKey.set(keyOf(alias), at);
  aliases.push([alias, at]);
}

// ---------- запись ----------

const countries = [];
const countryAt = new Map();
function countryIndex(c) {
  const name = CRIMEA.has(`${c.cc}.${c.adm1}`) ? 'Крым' : countryName.get(c.cc) ?? c.cc;
  if (!countryAt.has(name)) {
    countryAt.set(name, countries.length);
    countries.push(name);
  }
  return countryAt.get(name);
}
const data = {
  source: 'GeoNames (CC BY 4.0), Wikidata (CC0)',
  countries: [],
  names: cities.map((c) => c.name),
  country: cities.map(countryIndex),
  lat: cities.map((c) => Math.round(c.lat * 100)),
  lon: cities.map((c) => Math.round(c.lon * 100)),
  pop: cities.map((c) => Math.round(c.pop / 1000)),
  aliases,
};
data.countries = countries;

if (stats) {
  const got = new Set(all.map((c) => c.id));
  const lost = [...geo.values()].filter((g) => !got.has(g.id) && g.fcode !== 'PPLX' && direct.has(g.id) && direct.get(g.id).links >= 30 && !NAME.test(clean(direct.get(g.id).ru)) && g.pop >= 20000).sort((a, b) => b.pop - a.pop);
  console.log('известные города с негодной меткой:', lost.length, lost.slice(0, 200).map((g) => `${g.id}/${g.en}/${g.cc}: ${direct.get(g.id).ru}`).join(' | '));
  console.log('по P1566:', direct.size, 'по метке:', second, 'объектов:', all.length, 'после отбора:', kept.length, 'названий:', cities.length);
  console.log('нет в базе (из списка других названий):', missing.join(', ') || '—');
  const line = (from, to) => cities.slice(from, to).map((c) => c.name).join(', ');
  for (const [from, to] of [[0, 120], [120, 240], [400, 460], [1000, 1050], [2000, 2050], [3000, 3050], [5000, 5050], [8000, 8040], [12000, 12040], [cities.length - 40, cities.length]]) {
    console.log(`\n#${from}:`, line(from, to));
  }
  const first = new Map();
  for (const c of cities) {
    const ch = keyOf(c.name)[0];
    first.set(ch, (first.get(ch) ?? 0) + 1);
  }
  console.log('\nпо первой букве:', [...first].sort((a, b) => a[0].localeCompare(b[0], 'ru')).map(([ch, n]) => `${ch}:${n}`).join(' '));
  console.log('страны:', countries.length, countries.filter((n) => n.length > 16 || /[A-Z]/.test(n)).join(' | '));
}

const out = new URL('../games/cities/data/cities.json', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(out, json);
console.log('городов', cities.length, 'других названий', aliases.length, 'стран', countries.length, 'байт', Buffer.byteLength(json));
