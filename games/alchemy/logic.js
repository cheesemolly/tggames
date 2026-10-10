// «Алхимия» — правила без DOM: база элементов и рецептов, смешивание, что можно открыть прямо сейчас, задания,
// подсказки, звания, прогресс и статистика.
//
// База (data.json, собирает tools/alchemy-build.mjs):
//   { cats: [[ключ, название]…], items: [[id, название, значок, номер категории]…], start: [id…],
//     gifts: [[id, при скольких открытых]…], recipes: [[a, b, итог]…] }
// Пара элементов даёт не больше одного итога; порядок в паре не важен. Стартовые элементы открыты сразу, «дары»
// рецептов не имеют — их вручают, когда открыто нужное число элементов. Категория дара до этого «запечатана»:
// её элементы не открыть, даже если пара верная (смешал ящерицу с огнём до «магии» — дракон подождёт).

export const PAIR = 2048;          // id элемента меньше PAIR; ключ пары — меньший id * PAIR + больший
export const START_HINTS = 5;
export const RANK_HINTS = 3;       // подсказок за новое звание
export const QUEST_EVERY = 5;      // каждое пятое задание — «большое»
export const MAX_HINTS = 9999;
const QUEST_GAIN_CAP = 30;         // больше стольких новых пар цель задания «весомее» не становится

export const pairKey = (a, b) => (a < b ? a * PAIR + b : b * PAIR + a);

/** Подсказок за задание номер n (с единицы). */
export const questReward = (n) => (n % QUEST_EVERY === 0 ? 2 : 1);

// Звания — по числу открытых элементов (стартовые считаются). Порог не больше числа элементов в базе (тест).
export const RANKS = [
  { at: 0, title: 'Новичок' },
  { at: 10, title: 'Ученик' },
  { at: 25, title: 'Подмастерье' },
  { at: 50, title: 'Травник' },
  { at: 90, title: 'Зельевар' },
  { at: 150, title: 'Алхимик' },
  { at: 220, title: 'Чародей' },
  { at: 300, title: 'Мастер' },
  { at: 400, title: 'Магистр' },
  { at: 520, title: 'Мудрец' },
  { at: 650, title: 'Архимаг' },
  { at: 800, title: 'Великий алхимик' },
  { at: 950, title: 'Философ' },
  { at: 1100, title: 'Творец' },
];

/** Номер звания по числу открытых. */
export function rankOf(count) {
  let k = 0;
  while (k + 1 < RANKS.length && count >= RANKS[k + 1].at) k++;
  return k;
}

const isId = (v) => Number.isInteger(v) && v > 0 && v < PAIR;
const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

export const fold = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е').trim();

/** Название с заглавной буквы — для плиток и заданий (в базе нарицательные — со строчной). */
export const titleOf = (name) => (name ? name[0].toUpperCase() + name.slice(1) : '');

// ---------- база ----------

/**
 * Разобрать базу. → { cats, items: Map id → элемент, list, start, gifts, recipes, byPair, total }.
 * Элемент: { id, name, emoji, cat, tier, uses: [номера рецептов, где он — часть пары], makes: [где он — итог], gift }.
 * tier — на каком шаге от стартовых его можно получить (стартовые и дары — 0).
 */
export function indexData(raw) {
  if (!raw || !Array.isArray(raw.cats) || !Array.isArray(raw.items) || !Array.isArray(raw.recipes)
    || !Array.isArray(raw.start) || !Array.isArray(raw.gifts)) throw new Error('алхимия: база не разобрана');
  const cats = raw.cats.map(([id, title]) => ({ id, title, total: 0 }));
  const items = new Map();
  for (const [id, name, emoji, cat] of raw.items) {
    if (!isId(id) || items.has(id) || !cats[cat]) throw new Error(`алхимия: элемент ${id}`);
    items.set(id, { id, name, emoji, cat, tier: Infinity, uses: [], makes: [], gift: 0 });
    cats[cat].total += 1;
  }
  const start = raw.start.filter((id) => items.has(id));
  const gifts = raw.gifts.filter(([id]) => items.has(id)).map(([id, at]) => ({ id, at })).sort((x, y) => x.at - y.at);
  const giftOfCat = new Map();           // номер категории → её дар
  for (const g of gifts) {
    const it = items.get(g.id);
    it.gift = g.at;
    if (giftOfCat.has(it.cat)) throw new Error(`алхимия: два дара в категории ${cats[it.cat].id}`);
    giftOfCat.set(it.cat, g);
  }
  const recipes = [];
  const byPair = new Map();
  for (const [a, b, c] of raw.recipes) {
    const key = pairKey(a, b);
    if (!items.has(a) || !items.has(b) || !items.has(c) || byPair.has(key)) throw new Error(`алхимия: рецепт ${a}+${b}`);
    const k = recipes.length;
    recipes.push({ a, b, c, key });
    byPair.set(key, k);
    items.get(a).uses.push(k);
    if (b !== a) items.get(b).uses.push(k);
    items.get(c).makes.push(k);
  }
  for (const id of start) items.get(id).tier = 0;
  for (const g of gifts) items.get(g.id).tier = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const r of recipes) {
      const t = 1 + Math.max(items.get(r.a).tier, items.get(r.b).tier);
      const it = items.get(r.c);
      if (t < it.tier) {
        it.tier = t;
        changed = true;
      }
    }
  }
  const list = [...items.values()].sort((x, y) => fold(x.name).localeCompare(fold(y.name), 'ru'));
  return { cats, items, list, start, gifts, giftOfCat, recipes, byPair, total: items.size };
}

/** Дар, без которого элемент не открыть (его категория запечатана), или null. */
export function sealOf(db, found, id) {
  const gift = db.giftOfCat.get(db.items.get(id)?.cat);
  return gift && !found.has(gift.id) && gift.id !== id ? gift : null;
}

/** Можно ли открыть итог рецепта прямо сейчас: обе части есть, сам он ещё не открыт и не запечатан. */
const opens = (db, found, r) => !found.has(r.c) && found.has(r.a) && found.has(r.b) && !sealOf(db, found, r.c);

/** Что откроется, если смешивать всё подряд: стартовые → всё доступное → дар, когда набралось нужное число, → … */
export function unlockAll(db) {
  const found = new Set(db.start);
  const granted = [];                    // { id, at, had } — had: сколько было открыто без этого дара
  for (;;) {
    for (let changed = true; changed;) {
      changed = false;
      for (const r of db.recipes) {
        if (opens(db, found, r)) {
          found.add(r.c);
          changed = true;
        }
      }
    }
    const gift = db.gifts.find((g) => !found.has(g.id));
    if (!gift || found.size < gift.at) break;
    granted.push({ ...gift, had: found.size });
    found.add(gift.id);
  }
  return { found, granted };
}

/** Что не так с базой (для сборки и тестов): недостижимые элементы, дары без нужного числа, элементы без рецептов. */
export function dataProblems(db) {
  const out = [];
  const gifts = new Set(db.gifts.map((g) => g.id));
  const start = new Set(db.start);
  for (const it of db.items.values()) {
    if (start.has(it.id) || gifts.has(it.id)) {
      if (it.makes.length) out.push(`«${it.name}» выдаётся сразу или даром — рецепт ему не нужен`);
    } else if (!it.makes.length) out.push(`«${it.name}» — нет рецепта`);
    for (const k of it.makes) {
      const r = db.recipes[k];
      if (r.a === it.id || r.b === it.id) out.push(`«${it.name}» получается из самого себя`);
    }
  }
  const { found, granted } = unlockAll(db);
  for (const g of db.gifts) {
    if (!granted.some((x) => x.id === g.id)) out.push(`дар «${db.items.get(g.id).name}» не выдать: нужно ${g.at} открытых, а без него набирается меньше`);
  }
  for (const it of db.items.values()) if (!found.has(it.id)) out.push(`«${it.name}» не получить из стартовых`);
  return out;
}

// ---------- прогресс ----------

/** found — открытые элементы по порядку открытия (без стартовых), recipes — ключи найденных пар. */
export const emptyProgress = () => ({ found: [], recipes: [], quests: 0, hints: START_HINTS });

const uniqueInts = (list, ok) => {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const v of list) {
    if (!Number.isInteger(v) || seen.has(v) || !ok(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

/**
 * Привести сохранение к виду, с которым игра работает. С базой (db) — ещё и выбросить то, чего в ней нет:
 * неизвестные элементы и пары, пары с неоткрытыми элементами.
 */
export function migrateProgress(raw, db = null) {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  const start = new Set(db?.start ?? []);
  const found = uniqueInts(raw.found, (id) => isId(id) && (!db || (db.items.has(id) && !start.has(id))));
  const have = new Set([...start, ...found]);
  const recipes = uniqueInts(raw.recipes, (key) => {
    if (key <= 0 || key >= PAIR * PAIR) return false;
    if (!db) return true;
    const r = db.recipes[db.byPair.get(key)];
    return Boolean(r) && have.has(r.a) && have.has(r.b) && have.has(r.c);
  });
  return {
    found,
    recipes,
    quests: Math.min(nat(raw.quests), 1e6),
    hints: Number.isInteger(raw.hints) && raw.hints >= 0 ? Math.min(raw.hints, MAX_HINTS) : START_HINTS,
  };
}

export const isValidProgress = (raw) => JSON.stringify(migrateProgress(raw)) === JSON.stringify(raw);

/** mixes — сколько раз смешивал, fails — из них впустую, hints — подсказок потрачено. */
export const emptyStats = () => ({ mixes: 0, fails: 0, hints: 0 });

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const k of Object.keys(stats)) stats[k] = nat(raw[k]);
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);

// ---------- игра ----------

/**
 * Рабочее состояние по прогрессу: found и recipes — множества, left — сколько у элемента ещё не найденных пар.
 */
export function stateOf(db, progress) {
  const found = new Set([...db.start, ...progress.found]);
  const recipes = new Set(progress.recipes);
  const left = new Map();
  for (const it of db.items.values()) left.set(it.id, it.uses.length);
  for (const key of recipes) {
    const r = db.recipes[db.byPair.get(key)];
    if (!r) continue;
    left.set(r.a, left.get(r.a) - 1);
    if (r.b !== r.a) left.set(r.b, left.get(r.b) - 1);
  }
  return { found, recipes, left };
}

/** Что даёт пара (рецепт или null). */
export const recipeOf = (db, a, b) => db.recipes[db.byPair.get(pairKey(a, b))] ?? null;

/** Все пары элемента уже найдены — смешивать его больше не с чем. */
export const isSpent = (state, id) => state.left.get(id) === 0;

/**
 * Смешать два открытых элемента. → { kind, id, recipe, gift }:
 *   'none' — ничего не вышло; 'new' — новый элемент; 'recipe' — элемент уже был, а такая пара — впервые;
 *   'known' — эту пару уже находили; 'sealed' — пара верная, но итог запечатан до дара gift (что получится,
 *   не говорится). Прогресс и состояние меняются на месте.
 */
export function mix(db, progress, state, a, b) {
  const none = { kind: 'none', id: null, recipe: null, gift: null };
  if (!state.found.has(a) || !state.found.has(b)) return none;
  const recipe = recipeOf(db, a, b);
  if (!recipe) return none;
  const gift = sealOf(db, state.found, recipe.c);
  if (gift) return { kind: 'sealed', id: null, recipe: null, gift };
  let kind = 'known';
  if (!state.recipes.has(recipe.key)) {
    kind = 'recipe';
    state.recipes.add(recipe.key);
    progress.recipes.push(recipe.key);
    state.left.set(recipe.a, state.left.get(recipe.a) - 1);
    if (recipe.b !== recipe.a) state.left.set(recipe.b, state.left.get(recipe.b) - 1);
  }
  if (!state.found.has(recipe.c)) {
    kind = 'new';
    state.found.add(recipe.c);
    progress.found.push(recipe.c);
  }
  return { kind, id: recipe.c, recipe, gift: null };
}

/** Вручить дары, до которых игрок дошёл. → id выданных (по порядку). */
export function grantGifts(db, progress, state) {
  const given = [];
  for (const g of db.gifts) {
    if (state.found.has(g.id)) continue;
    if (state.found.size < g.at) break;
    state.found.add(g.id);
    progress.found.push(g.id);
    given.push(g.id);
  }
  return given;
}

/** Ближайший невыданный дар: { id, at } или null. */
export const nextGift = (db, state) => db.gifts.find((g) => !state.found.has(g.id)) ?? null;

/** Элементы, которые можно открыть одним смешиванием из уже открытых. */
export function frontier(db, found) {
  const out = new Set();
  for (const r of db.recipes) if (opens(db, found, r)) out.add(r.c);
  return [...out];
}

/** Рецепт цели, для которого у игрока уже есть оба элемента (первый по порядку базы), или null. */
export function readyRecipe(db, found, target) {
  const it = db.items.get(target);
  if (!it || sealOf(db, found, target)) return null;
  for (const k of it.makes) {
    const r = db.recipes[k];
    if (found.has(r.a) && found.has(r.b)) return r;
  }
  return null;
}

/**
 * Цель следующего задания: элемент, который можно открыть уже сейчас. Чаще — тот, что сразу откроет больше нового
 * (у него много пар с уже открытым, итог которых ещё не открыт): так задания ведут к жизни, человеку, инструменту,
 * а тупиковые элементы остаются на потом. Ранние слои немного предпочтительнее. avoid — прошлая цель (чтобы
 * «другое задание» правда было другим). Нечего открывать — null.
 */
export function pickQuest(db, found, rng = Math.random, avoid = null) {
  let pool = frontier(db, found);
  if (pool.length > 1) pool = pool.filter((id) => id !== avoid);
  if (!pool.length) return null;
  const gain = new Map(pool.map((id) => [id, 0]));
  for (const r of db.recipes) {
    if (found.has(r.c) || sealOf(db, found, r.c)) continue;
    if (gain.has(r.a) && (found.has(r.b) || r.b === r.a)) gain.set(r.a, gain.get(r.a) + 1);
    else if (gain.has(r.b) && found.has(r.a)) gain.set(r.b, gain.get(r.b) + 1);
  }
  const low = Math.min(...pool.map((id) => db.items.get(id).tier));
  const weights = pool.map((id) => (1 + Math.min(gain.get(id), QUEST_GAIN_CAP)) ** 3 / Math.sqrt(1 + db.items.get(id).tier - low));
  let roll = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let k = 0; k < pool.length; k++) {
    roll -= weights[k];
    if (roll <= 0) return pool[k];
  }
  return pool[pool.length - 1];
}

/** Задание: { id — что создать, hint — сколько частей рецепта подсказано (0…2), key — какой рецепт подсказывается }. */
export const newQuest = (id) => ({ id, hint: 0, key: 0 });

/**
 * Сохранённое задание → годное или null: цель ещё не открыта и её можно получить из открытого. Подсказка остаётся,
 * только если её рецепт по-прежнему собирается.
 */
export function loadQuest(raw, db, found) {
  if (!raw || typeof raw !== 'object' || !db.items.has(raw.id) || found.has(raw.id)) return null;
  if (!readyRecipe(db, found, raw.id)) return null;
  const quest = { id: raw.id, hint: [1, 2].includes(raw.hint) ? raw.hint : 0, key: 0 };
  const r = db.recipes[db.byPair.get(raw.key)];
  if (quest.hint && r && r.c === raw.id && found.has(r.a) && found.has(r.b)) quest.key = r.key;
  else quest.hint = 0;
  return quest;
}

/** Рецепт, который подсказывает задание: уже выбранный (key) или первый, для которого всё есть. */
export function questRecipe(db, found, quest) {
  const pinned = quest.key ? db.recipes[db.byPair.get(quest.key)] : null;
  if (pinned && pinned.c === quest.id && found.has(pinned.a) && found.has(pinned.b)) return pinned;
  return readyRecipe(db, found, quest.id);
}

/** Подсказать ещё одну часть рецепта задания (за подсказку). → рецепт или null: подсказано всё или подсказок нет. */
export function useHint(db, progress, state, quest) {
  if (!quest || quest.hint >= 2) return null;
  const recipe = questRecipe(db, state.found, quest);
  if (!recipe || !spendHint(progress)) return null;
  quest.key = recipe.key;
  quest.hint += 1;
  return recipe;
}

/** Списать подсказку. → хватило ли. */
export function spendHint(progress) {
  if (progress.hints < 1) return false;
  progress.hints -= 1;
  return true;
}

export function addHints(progress, n) {
  progress.hints = Math.min(MAX_HINTS, progress.hints + Math.max(0, n));
}

// ---------- списки ----------

/** Сколько открыто в каждой категории: [{ id, title, total, found }]. */
export function catProgress(db, found) {
  const counts = db.cats.map((c) => ({ ...c, found: 0 }));
  for (const id of found) {
    const it = db.items.get(id);
    if (it) counts[it.cat].found += 1;
  }
  return counts;
}

/**
 * Открытые элементы для полки: cat — номер категории или null (все); order — 'name' (по алфавиту) или 'new'
 * (последние открытые — первыми; order — массив id по порядку открытия); hideSpent — без тех, с кем всё найдено.
 */
export function shelf(db, state, { cat = null, order = 'name', opened = [], hideSpent = false, query = '' } = {}) {
  const q = fold(query);
  let list = db.list.filter((it) => state.found.has(it.id)
    && (cat === null || it.cat === cat)
    && !(hideSpent && isSpent(state, it.id))
    && (!q || fold(it.name).includes(q)));
  if (q) {
    // начинается с запроса — выше
    const head = list.filter((it) => fold(it.name).startsWith(q));
    list = [...head, ...list.filter((it) => !head.includes(it))];
  } else if (order === 'new') {
    const at = new Map(opened.map((id, k) => [id, k]));
    list = [...list].sort((x, y) => (at.get(y.id) ?? -1) - (at.get(x.id) ?? -1));
  }
  return list;
}

export function plural(n, forms) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
