// Правила «Слогов» без DOM: деление слова на слоги, набор слов уровня, выбор кусочков, звёзды, прогресс.
//
// Уровень — тема (фрукты, планеты, мифы): её слова разрезаны на слоги, каждый слог — кружок в общей куче. Игрок
// касается кружков по порядку; как только выбранные слоги складываются в слово темы, кружки лопаются.
// «Классика» — найти все слова уровня, звёзды — за скорость; звёзды открывают следующие темы.
// «На время» — 45 секунд: слов на поле немного, найденные сменяются новыми, длинное слово — больше очков.

export const MODES = ['classic', 'timed'];
export const TIMED_SECONDS = 45;
export const TIMED_BOARD = 5;                // слов на поле одновременно в режиме «На время»
export const HINT_PENALTY = 10;              // секунд к времени за подсказку в «Классике»
export const STAR_SECONDS = [7, 14];         // секунд на слово: уложился в первое — три звезды, во второе — две
export const OPEN_AT_START = 3;              // сколько тем открыто сразу
export const MAX_PIECE = 6;                  // букв в кусочке — больше в кружок не помещается

const VOWELS = 'аеёиоуыэюя';
const LIQUIDS = 'лр';
const STOPS = 'бпдтгкфв';                   // после них л и р не отрываются: зе-бра, ме-тро, а-фри-ка
const SONORANTS = 'лмнр';
const isVowel = (ch) => VOWELS.includes(ch);

/**
 * Слово по слогам: «клубника» → ['клуб', 'ни', 'ка']. В каждом слоге одна гласная. Согласные между гласными:
 * одна — к следующему слогу (ма-ли-на); й, ь и ъ остаются слева (май-ка, пись-мо); сонорные в начале стечения —
 * тоже слева (кар-ман, солн-це); из остальных вправо уходит последняя (кош-ка, курт-ка, лест-ни-ца, кис-ло-род)
 * или пара «взрывная + л/р» (ви-но-град, зе-бра, сес-тра). Дефис в слове задаёт деление вручную («ав-стри-я»).
 */
export function syllables(word) {
  const text = String(word ?? '').toLowerCase();
  if (text.includes('-')) return text.split('-').filter(Boolean);
  const letters = [...text];
  const vowelAt = letters.map((ch, i) => (isVowel(ch) ? i : -1)).filter((i) => i >= 0);
  if (vowelAt.length <= 1) return letters.length ? [text] : [];
  const cuts = [];                            // с какой буквы начинается каждый следующий слог
  for (let v = 0; v < vowelAt.length - 1; v++) {
    const from = vowelAt[v] + 1;
    const to = vowelAt[v + 1];                // согласные между гласными: letters[from … to − 1]
    // согласные с их ь/ъ — как одно целое
    const units = [];
    for (let i = from; i < to; i++) {
      if ((letters[i] === 'ь' || letters[i] === 'ъ') && units.length) units[units.length - 1].end = i + 1;
      else units.push({ ch: letters[i], start: i, end: i + 1 });
    }
    let left = 0;                             // сколько согласных остаётся в слоге слева
    if (units.length >= 1 && units[0].ch === 'й') left = 1;
    if (units.length - left >= 2) {
      let rest = units.slice(left);
      let son = 0;
      while (son < rest.length - 1 && SONORANTS.includes(rest[son].ch)) son++;
      left += son;
      rest = rest.slice(son);
      if (rest.length >= 2) {
        // последние две согласные «шумная + л/р» уходят вправо вместе, иначе вправо уходит одна
        const before = rest[rest.length - 2];
        const pair = LIQUIDS.includes(rest[rest.length - 1].ch) && STOPS.includes(before.ch) && before.end - before.start === 1;
        left += rest.length - (pair ? 2 : 1);
      }
    }
    // разделительный ъ не отрывается от приставки: подъ-езд
    if (units.length && letters[units[units.length - 1].end - 1] === 'ъ') left = units.length;
    cuts.push(left < units.length ? units[left].start : to);
  }
  const out = [];
  let start = 0;
  for (const cut of cuts) {
    out.push(letters.slice(start, cut).join(''));
    start = cut;
  }
  out.push(letters.slice(start).join(''));
  return out;
}

/** Слово темы для показа («Сатурн», «под-ъезд» → «подъезд»). */
export const display = (word) => String(word).replace(/-/g, '');
/** Как слово сравнивается: строчными, без дефисов деления. */
export const keyOf = (word) => display(word).toLowerCase();

/** Сколькими способами слово складывается из кусочков (texts — какие тексты есть на поле). Больше одного — путаница. */
export function tilings(word, texts) {
  const set = texts instanceof Set ? texts : new Set(texts);
  const ways = new Array(word.length + 1).fill(0);
  ways[0] = 1;
  for (let i = 0; i < word.length; i++) {
    if (!ways[i]) continue;
    for (let len = 1; len <= MAX_PIECE && i + len <= word.length; len++) {
      if (set.has(word.slice(i, i + len))) ways[i + len] += ways[i];
    }
  }
  return ways[word.length];
}

/** Годится ли набор слов для одного поля: каждое слово складывается из кусочков поля ровно одним способом. */
export function isClearSet(words) {
  const texts = new Set(words.flatMap((w) => syllables(w)));
  return words.every((w) => tilings(keyOf(w), texts) === 1);
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Сколько слов в уровне «Классики» у темы с номером index: дальше — больше. */
export const wordsIn = (index) => (index < 4 ? 6 : index < 12 ? 7 : index < 28 ? 8 : 9);

export const MAX_PIECES = 26;                // больше кружков на поле телефона не помещается

/**
 * Слова уровня: count случайных слов темы, которые не путаются между собой и дают не больше MAX_PIECES кружков
 * (в темах с длинными словами — «Науки» — слов выходит меньше).
 */
export function pickWords(topic, count, rng = Math.random) {
  const want = Math.min(count, topic.words.length);
  let best = null;
  for (let tries = 0; tries < 40; tries++) {
    const words = [];
    let pieces = 0;
    for (const w of shuffle(topic.words, rng)) {
      const n = syllables(w).length;
      if (words.length >= want) break;
      if (pieces + n > MAX_PIECES) continue;
      words.push(w);
      pieces += n;
    }
    if (isClearSet(words)) return words;
    best ??= words;
  }
  // не подобралось — убираем путающиеся слова по одному
  let words = best;
  while (words.length > 2 && !isClearSet(words)) {
    const texts = new Set(words.flatMap((w) => syllables(w)));
    const bad = words.findIndex((w) => tilings(keyOf(w), texts) !== 1);
    words = words.filter((_, i) => i !== (bad < 0 ? words.length - 1 : bad));
  }
  return words;
}

/** Кусочки слов для поля: [{ id, text, word }] — word: чьё это слово (для подсказки и появления), id — по порядку. */
export function piecesOf(words, firstId = 0) {
  let id = firstId;
  return words.flatMap((word) => syllables(word).map((text) => ({ id: id++, text, word: keyOf(word) })));
}

/**
 * Выбранные кусочки (их тексты по порядку) против ненайденных слов. → { word } — слово собрано;
 * { dead: true } — так ни одно слово не начинается и длиннее собирать некуда; иначе null — можно продолжать.
 */
export function check(texts, words) {
  const joined = texts.join('|');
  let alive = false;
  let longest = 0;
  for (const word of words) {
    const parts = syllables(word);
    longest = Math.max(longest, parts.length);
    if (parts.length === texts.length && parts.join('|') === joined) return { word };
    if (parts.length > texts.length && parts.slice(0, texts.length).join('|') === joined) alive = true;
  }
  if (!alive && texts.length >= longest) return { dead: true };
  return null;
}

/** Звёзды «Классики»: секунд на слово (с надбавкой за подсказки). */
export function starsFor(seconds, wordCount) {
  const per = seconds / Math.max(1, wordCount);
  return per <= STAR_SECONDS[0] ? 3 : per <= STAR_SECONDS[1] ? 2 : 1;
}

/** Очки за слово в режиме «На время»: по букве за очко, длинное слово — с надбавкой. */
export const wordScore = (word) => keyOf(word).length + Math.max(0, syllables(word).length - 2) * 2;

// ---------- прогресс ----------

/** stars — звёзды «Классики» по темам (1…3), time — лучшее время темы (мс), timed — рекорд «На время» по темам. */
export const emptyProgress = () => ({ stars: {}, time: {}, timed: {} });

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

export function migrateProgress(raw, topicIds = null) {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const ok = (id) => typeof id === 'string' && /^[a-z0-9-]{1,24}$/.test(id) && (!topicIds || topicIds.includes(id));
  for (const [id, v] of Object.entries(raw.stars ?? {})) if (ok(id) && nat(v)) out.stars[id] = Math.min(3, nat(v));
  for (const [id, v] of Object.entries(raw.time ?? {})) if (ok(id) && nat(v)) out.time[id] = Math.min(nat(v), 36e5);
  for (const [id, v] of Object.entries(raw.timed ?? {})) if (ok(id) && nat(v)) out.timed[id] = Math.min(nat(v), 999);
  return out;
}

export const isValidProgress = (raw) => JSON.stringify(migrateProgress(raw)) === JSON.stringify(raw);

export const totalStars = (progress) => Object.values(progress.stars).reduce((a, b) => a + b, 0);

/** Сколько звёзд нужно, чтобы открылась тема с номером index: три открыты сразу, дальше — по звезде на тему. */
export const starsToOpen = (index) => Math.max(0, index - (OPEN_AT_START - 1));
export const isOpen = (index, progress) => totalStars(progress) >= starsToOpen(index);

/** Записать итог «Классики». → { stars, best: стало ли время лучшим, more: стало ли звёзд больше }. */
export function recordClassic(progress, topicId, ms, stars) {
  const was = progress.stars[topicId] ?? 0;
  const prev = progress.time[topicId] ?? 0;
  if (stars > was) progress.stars[topicId] = stars;
  const best = !prev || ms < prev;
  if (best) progress.time[topicId] = Math.max(1, Math.round(ms));
  return { stars, best, more: stars > was };
}

/** Записать итог «На время». → стал ли счёт рекордом. */
export function recordTimed(progress, topicId, score) {
  const prev = progress.timed[topicId] ?? 0;
  if (score > prev) progress.timed[topicId] = score;
  return score > prev;
}

/** words — найдено слов, levels — пройдено уровней «Классики», runs — забегов «На время», hints — подсказок. */
export const emptyStats = () => ({ words: 0, levels: 0, runs: 0, hints: 0 });

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const k of Object.keys(stats)) stats[k] = nat(raw[k]);
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);

/** Начатый уровень «Классики» годится для продолжения: тема есть, слова — её слова, найденные — из них. */
export function isValidRun(run, topics) {
  if (!run || typeof run !== 'object' || run.v !== 1) return false;
  const topic = topics.find((t) => t.id === run.topic);
  if (!topic) return false;
  const own = new Set(topic.words.map(keyOf));
  if (!Array.isArray(run.words) || run.words.length < 2 || run.words.length > 12) return false;
  if (!run.words.every((w) => typeof w === 'string' && own.has(keyOf(w))) || new Set(run.words.map(keyOf)).size !== run.words.length) return false;
  if (!Array.isArray(run.found) || !run.found.every((w) => run.words.some((x) => keyOf(x) === w))) return false;
  if (new Set(run.found).size !== run.found.length || run.found.length >= run.words.length) return false;
  if (!Number.isFinite(run.ms) || run.ms < 0 || run.ms > 36e5) return false;
  return Number.isInteger(run.hints) && run.hints >= 0 && run.hints <= 99;
}

// ---------- подписи ----------

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function plural(n, forms) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
