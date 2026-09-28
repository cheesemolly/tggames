// Чистая логика нового интерфейса (в бете 'new-ui') — без DOM и хранилища, чтобы проверять тестами:
// серия дней (огонёк), календарь, поиск и сортировка игр, лучшие места, выбор баннеров.

// ---------- серия дней ----------
// День захода — местная дата «ГГГГ-ММ-ДД». Серия считается просто за то, что зашёл (решение владельца).

const pad = (n) => String(n).padStart(2, '0');

/** Местная дата дня: «2026-09-28». */
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Дата из ключа дня (полдень — чтобы переход на летнее время не сдвигал день). */
const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DAYS = 400;         // больше года истории не храним

/** Дни с добавленным today: без повторов, по порядку, не больше MAX_DAYS последних. Мусор отбрасывается. */
export function addVisit(days, today) {
  const set = new Set((Array.isArray(days) ? days : []).filter((d) => typeof d === 'string' && VALID_DAY.test(d)));
  set.add(today);
  return [...set].sort().slice(-MAX_DAYS);
}

/** Соседний день: shiftDay('2026-09-28', -1) → '2026-09-27'. */
export function shiftDay(key, delta) {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

/**
 * Серия: сколько дней подряд до сегодня (если сегодня ещё не заходил — до вчера) и лучшая серия за всё время.
 */
export function streakOf(days, today) {
  const set = new Set(Array.isArray(days) ? days : []);
  let start = set.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (set.has(start)) {
    current += 1;
    start = shiftDay(start, -1);
  }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of [...set].filter((x) => VALID_DAY.test(x)).sort()) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Клетки календаря месяца (month — 0…11): недели с понедельника, дни соседних месяцев — out. */
export function monthCells(year, month) {
  const first = new Date(year, month, 1, 12);
  const lead = (first.getDay() + 6) % 7;                 // сколько дней прошлого месяца до понедельника
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = -lead; cells.length < lead + days || cells.length % 7; i++) {
    const d = new Date(year, month, 1 + i, 12);
    cells.push({ n: d.getDate(), key: dayKey(d), out: i < 0 || i >= days });
  }
  return cells;
}

// ---------- игры: поиск, фильтр, сортировка ----------

/** Для поиска: регистр и «ё» не важны, лишние пробелы тоже. */
export const fold = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * items — [{ id, title, cat, fav }]. query — по началу любого слова названия (или по подстроке, если
 * совпадений по началу нет), cats — папки (пусто — все), fav — только избранное.
 */
export function filterGames(items, { query = '', cats = [], fav = false } = {}) {
  let list = items.filter((g) => (!cats.length || cats.includes(g.cat)) && (!fav || g.fav));
  const q = fold(query);
  if (!q) return list;
  const words = (g) => fold(g.title).split(/[\s-]+/);
  const byStart = list.filter((g) => fold(g.title).startsWith(q) || words(g).some((w) => w.startsWith(q)));
  list = byStart.length ? byStart : list.filter((g) => fold(g.title).includes(q));
  return list;
}

export const SORTS = {
  recent: 'Сначала недавние',
  name: 'По названию',
};

/** recent — сначала те, во что играл недавно (recent: id → время), остальные в прежнем порядке; name — по алфавиту. */
export function sortGames(items, mode, recent = {}) {
  const list = [...items];
  if (mode === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return list
    .map((g, i) => ({ g, i, t: Number(recent[g.id]) || 0 }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.g);
}

/** Сохранить время открытия игры: не больше 60 записей (старые выбрасываются). */
export function touchRecent(recent, id, now) {
  const next = { ...(recent && typeof recent === 'object' ? recent : {}), [id]: now };
  return Object.fromEntries(Object.entries(next)
    .filter(([, t]) => Number.isFinite(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60));
}

/** Избранное: переключить игру в списке. */
export function toggleFav(list, id) {
  const set = new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

// ---------- рейтинг ----------

/** Место игрока в каждой игре из сводки рейтинга (GET /top): id игры → { place, total, text }. */
export function placesOf(summary) {
  const out = {};
  for (const g of summary?.games ?? []) {
    if (g?.me?.place) out[g.game] = { place: g.me.place, total: g.total ?? 0, text: g.me.text ?? '' };
  }
  return out;
}

/** Лучшие места (для профиля): по месту, при равенстве — где игроков больше; только видимые игры. */
export function bestPlaces(summary, visibleIds, limit = 3) {
  return Object.entries(placesOf(summary))
    .filter(([id]) => visibleIds.includes(id))
    .map(([game, p]) => ({ game, ...p }))
    .sort((a, b) => a.place - b.place || b.total - a.total)
    .slice(0, limit);
}

// ---------- тексты ----------

export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** «1 240» — неразрывный пробел между разрядами. */
export const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** «58-м месте» — для «Ты на 58-м месте». */
export const placeOn = (n) => `${n}-м месте`;

// ---------- баннеры главной ----------

/**
 * Какие баннеры показать (по порядку): продолжить начатую партию, место в рейтинге, новая игра.
 * saved — [{ id, at }] начатых партий (at — когда открывал), overall — { place, total, points } или null,
 * rated — есть ли рейтинг (аккаунт в Telegram), fresh — первая видимая игра из списка новинок.
 */
export function pickBanners({ saved = [], rated = false, overall = null, fresh = null }) {
  const out = [];
  const last = [...saved].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  if (last) out.push({ kind: 'continue', game: last.id });
  if (rated) out.push({ kind: 'rating', overall });
  if (fresh && fresh !== last?.id) out.push({ kind: 'new', game: fresh });
  return out;
}
