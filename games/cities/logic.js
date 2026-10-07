// Правила «Городов» без DOM: база городов, цепочка, проверка хода, бот, подсказки, статистика.
//
// Ходят по очереди, первым — игрок. Город должен начинаться на последнюю букву предыдущего; ь, ъ и ы пропускаются
// (берётся буква перед ними), ё = е. Повторять города нельзя. Бот «знает» не все города: чем выше уровень, тем больше;
// не знает города на нужную букву — сдаётся, это победа игрока. Игрок проигрывает, когда сдаётся или кончается время.
//
// База (data/cities.json) отсортирована по известности — номер города и есть его место: «бот знает первые N».
// Партия хранит названия, а не номера: база может пересобраться, и номера съедут.

export const LEVEL_IDS = ['easy', 'medium', 'hard', 'master'];
/**
 * know — сколько самых известных городов знает бот (край размыт: ближе к краю — знает через раз, для каждой партии
 * по-своему); each — сколько городов на каждую букву он знает в любом случае (иначе на Й или Щ сдавался бы сразу);
 * trick — насколько охотно подсовывает трудную букву.
 */
export const LEVELS = {
  easy: { know: 110, each: 2, trick: 0 },
  medium: { know: 320, each: 4, trick: 0 },
  hard: { know: 1000, each: 9, trick: 0.6 },
  master: { know: Infinity, each: Infinity, trick: 1.5 },
};
/** Города дальше этого места бот не называет вовсе: там малоизвестные — от игрока они принимаются. */
export const BOT_LIMIT = 6000;
export const TIMERS = [0, 60, 30];          // секунд на ход; 0 — без ограничения
export const HINTS = 3;                      // подсказок на партию
export const ALPHABET = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';
export const SKIP_LETTERS = 'ьъы';

const fold = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е');

/** Название без регистра, ё, пробелов и дефисов: «Нью-Йорк» и «нью йорк» — одно и то же. */
export const keyOf = (name) => fold(name).replace(/[^а-я]/g, '');

/** Как показать набранное: «ростов-на-дону» → «Ростов-на-Дону». */
const PARTICLES = /-(На|Де|Ла|Ле|Лез|Эль|Аль|Эн|Ан|Ам|Ин|Сюр|Су|Дель|Делла|Ди|Да|Ду|Дас|Дус|Эс|Эд|Эш|Апон|Он|Оф|Об|Об-Дер|Ан-Дер|И)(?=-)/g;
export function titleCase(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/(^|[\s-])([а-яё])/g, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(PARTICLES, (m) => m.toLowerCase());
}

const EMPTY = Object.freeze([]);

/** База городов из data/cities.json. Город — его номер (место по известности). */
export function createAtlas(data) {
  const names = data.names;
  const keys = names.map(keyOf);
  const index = new Map();
  keys.forEach((key, city) => {
    if (!index.has(key)) index.set(key, { city, name: names[city] });
  });
  for (const [alias, city] of data.aliases ?? []) {
    const key = keyOf(alias);
    if (key && !index.has(key) && city >= 0 && city < names.length) index.set(key, { city, name: alias });
  }
  const byLetter = new Map();
  const rank = new Int32Array(names.length);
  keys.forEach((key, city) => {
    const ch = key[0];
    if (!byLetter.has(ch)) byLetter.set(ch, []);
    rank[city] = byLetter.get(ch).length;
    byLetter.get(ch).push(city);
  });
  return {
    size: names.length,
    name: (city) => names[city],
    key: (city) => keys[city],
    country: (city) => data.countries[data.country[city]] ?? '',
    lat: (city) => data.lat[city] / 100,
    lon: (city) => data.lon[city] / 100,
    pop: (city) => (data.pop[city] ?? 0) * 1000,
    /** Город по набранному тексту (в том числе по другому названию) → { city, name } | null. */
    find: (text) => index.get(keyOf(text)) ?? null,
    /** Города на букву — по убыванию известности. */
    startsWith: (letter) => byLetter.get(letter) ?? EMPTY,
    /** Место города среди городов на ту же букву. */
    letterRank: (city) => rank[city],
  };
}

const RAD = Math.PI / 180;
/** Расстояние между городами по дуге большого круга, км. */
export function distance(atlas, a, b) {
  const lat1 = atlas.lat(a) * RAD;
  const lat2 = atlas.lat(b) * RAD;
  const h = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(((atlas.lon(b) - atlas.lon(a)) * RAD) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Остались ли неназванные города на букву. */
export function hasFree(atlas, used, letter) {
  const list = atlas.startsWith(letter);
  for (let k = 0; k < list.length; k++) if (!used.has(list[k])) return true;
  return false;
}

/**
 * На какую букву следующий город: последняя буква названия, кроме ь, ъ, ы и букв, на которые городов не осталось.
 * → { letter, pos } (pos — место этой буквы в названии, для подсветки) или null (подходит любой город).
 */
export function lastLetter(name, free = () => true) {
  const text = String(name ?? '');
  for (let pos = text.length - 1; pos >= 0; pos--) {
    const ch = fold(text[pos]);
    if (ch.length !== 1 || !ALPHABET.includes(ch) || SKIP_LETTERS.includes(ch)) continue;
    if (free(ch)) return { letter: ch, pos };
  }
  return null;
}

/** Буква для следующего хода по цепочке и названным городам. */
export function needOf(atlas, chain, used) {
  if (!chain.length) return null;
  return lastLetter(chain[chain.length - 1].name, (ch) => hasFree(atlas, used, ch));
}

/** Кто ходит: 0 — игрок, 1 — бот. Игрок всегда первый. */
export const turnOf = (game) => game.chain.length % 2;
export const mineOf = (game) => Math.ceil(game.chain.length / 2);

export const randomSeed = (rng = Math.random) => Math.floor(rng() * 0x7fffffff);

export function newGame(level = 'easy', timer = 0, seed = randomSeed()) {
  return { v: 1, level, timer, seed, chain: [], hints: HINTS };
}

/**
 * Разбор партии: номера названных городов, длины перелётов, буква следующего хода. → { used, cities, legs, km, need }
 * или null, если партия испорчена (неизвестный город, повтор, не та буква).
 */
export function replay(atlas, game) {
  if (!game || typeof game !== 'object' || game.v !== 1) return null;
  if (!LEVEL_IDS.includes(game.level) || !TIMERS.includes(game.timer)) return null;
  if (!Number.isInteger(game.seed) || game.seed < 0) return null;
  if (!Number.isInteger(game.hints) || game.hints < 0 || game.hints > HINTS) return null;
  if (!Array.isArray(game.chain) || game.chain.length > 5000) return null;
  const used = new Set();
  const cities = [];
  const legs = [];
  let need = null;
  let km = 0;
  for (let k = 0; k < game.chain.length; k++) {
    const step = game.chain[k];
    if (!step || typeof step.name !== 'string' || step.by !== k % 2) return null;
    const hit = atlas.find(step.name);
    if (!hit || used.has(hit.city)) return null;
    if (need && keyOf(step.name)[0] !== need.letter) return null;
    if (k) {
      const leg = distance(atlas, cities[k - 1], hit.city);
      legs.push(leg);
      km += leg;
    }
    used.add(hit.city);
    cities.push(hit.city);
    need = lastLetter(step.name, (ch) => hasFree(atlas, used, ch));
  }
  return { used, cities, legs, km, need };
}

export const isValidState = (atlas, game) => Boolean(replay(atlas, game));

/**
 * Проверка названного города. → { ok: true, city, name } или { ok: false, error }:
 * 'empty' — пусто, 'letter' — не на ту букву (letter — на какую надо), 'unknown' — нет в базе, 'used' — уже был (city).
 */
export function checkMove(atlas, used, need, text) {
  const key = keyOf(text);
  if (!key) return { ok: false, error: 'empty' };
  if (need && key[0] !== need.letter) return { ok: false, error: 'letter', letter: need.letter };
  const hit = atlas.find(text);
  if (!hit) return { ok: false, error: 'unknown' };
  if (used.has(hit.city)) return { ok: false, error: 'used', city: hit.city };
  return { ok: true, city: hit.city, name: hit.name };
}

// ---------- бот ----------

/** Число от 0 до 1 для пары «партия — город»: одно и то же при каждом вызове. */
export function chance(seed, city) {
  let h = (seed ^ Math.imul(city + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Знает ли бот этот город в этой партии. */
export function knows(atlas, level, seed, city) {
  if (city >= BOT_LIMIT) return false;
  const { know, each } = LEVELS[level];
  if (!Number.isFinite(know) || atlas.letterRank(city) < each) return true;
  if (city < know * 0.5) return true;
  if (city >= know * 1.5) return false;
  return chance(seed, city) < 1 - (city - know * 0.5) / know;
}

/** Насколько трудна буква для игрока: чем меньше осталось известных городов на неё, тем труднее (0…1). */
function hardness(atlas, used, letter) {
  const list = atlas.startsWith(letter);
  let free = 0;
  for (let k = 0; k < list.length && list[k] < 1500 && free < 12; k++) if (!used.has(list[k])) free++;
  return 1 - free / 12;
}

/**
 * Ход бота: город на нужную букву из тех, что он знает, — чаще известный; на сильных уровнях — с прицелом на
 * трудную для игрока букву. → номер города или null (не знает — сдаётся).
 */
export function botMove(atlas, game, used, need, rng = Math.random) {
  const { trick } = LEVELS[game.level];
  // буквы нет (на все буквы прошлого города города кончились — почти невозможно) — подойдёт любой город
  const list = need ? atlas.startsWith(need.letter) : Array.from({ length: Math.min(atlas.size, BOT_LIMIT) }, (_, city) => city);
  const options = [];
  let total = 0;
  for (let k = 0; k < list.length && options.length < 60; k++) {
    const city = list[k];
    if (city >= BOT_LIMIT) break;
    if (used.has(city) || !knows(atlas, game.level, game.seed, city)) continue;
    let weight = 1 / (options.length + 2);
    if (trick) {
      const after = new Set(used).add(city);
      const next = lastLetter(atlas.name(city), (ch) => hasFree(atlas, after, ch));
      if (next) weight *= 1 + trick * 4 * hardness(atlas, after, next.letter) ** 2;
    }
    options.push({ city, weight });
    total += weight;
  }
  if (!options.length) return null;
  let roll = rng() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.city;
  }
  return options[options.length - 1].city;
}

/** Самые известные неназванные города на букву (что можно было назвать). */
export function examples(atlas, used, need, count = 3) {
  const out = [];
  const list = need ? atlas.startsWith(need.letter) : [];
  for (let k = 0; k < list.length && out.length < count; k++) if (!used.has(list[k])) out.push(list[k]);
  return out;
}

/** Подсказка: один из известных неназванных городов на букву (в начале партии — любой из известных) или null. */
export function hint(atlas, used, need, rng = Math.random) {
  const pool = [];
  if (need) pool.push(...examples(atlas, used, need, 6));
  else for (let city = 0; city < Math.min(40, atlas.size); city++) if (!used.has(city)) pool.push(city);
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

// ---------- статистика ----------

const emptyLevel = () => ({ played: 0, wins: 0, losses: 0, best: 0 });

/** По уровням — партии, победы, поражения, рекорд (городов за партию); total — всего городов, км и самый длинный маршрут. */
export function emptyStats() {
  const stats = { total: { cities: 0, km: 0, far: 0 } };
  for (const id of LEVEL_IDS) stats[id] = emptyLevel();
  return stats;
}

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const id of LEVEL_IDS) {
    const s = raw[id];
    if (!s || typeof s !== 'object') continue;
    stats[id] = { played: nat(s.played), wins: nat(s.wins), losses: nat(s.losses), best: nat(s.best) };
  }
  const t = raw.total;
  if (t && typeof t === 'object') stats.total = { cities: nat(t.cities), km: nat(t.km), far: nat(t.far) };
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);

/** Итог партии в статистику: outcome — 'win' | 'lose', mine — сколько городов назвал игрок, km — длина маршрута. */
export function recordGame(stats, level, outcome, mine, km) {
  const s = stats[level];
  if (!s) return stats;
  s.played++;
  if (outcome === 'win') s.wins++;
  else s.losses++;
  s.best = Math.max(s.best, nat(mine));
  stats.total.cities += nat(mine);
  stats.total.km += nat(km);
  stats.total.far = Math.max(stats.total.far, nat(km));
  return stats;
}

// ---------- подписи ----------

const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const formatKm = (km) => `${group(km)} км`;

/** «12,6 млн», «301 тыс.»; неизвестное население — пустая строка. */
export function formatPop(pop) {
  if (!(pop > 0)) return '';
  if (pop >= 1e6) return `${(Math.round(pop / 1e5) / 10).toString().replace('.', ',')} млн`;
  return `${group(Math.max(1, Math.round(pop / 1000)))} тыс.`;
}

export function plural(n, forms) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
export const citiesWord = (n) => `${n} ${plural(n, ['город', 'города', 'городов'])}`;
