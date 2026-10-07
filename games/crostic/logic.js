// Правила «Кростика» без DOM: разбор уровня, проверка уровня, ввод букв, подсказка, звёзды, прогресс.
//
// Уровень — спрятанная фраза (пословица, крылатая строка, факт) и несколько вопросов с ответами. Буквы зашифрованы
// номерами: одинаковый номер — одинаковая буква, во фразе и во всех ответах. Игрок выбирает клетку и называет букву:
// угадал — буква встаёт во все клетки с этим номером, ошибся — минус попытка. Ответил на вопрос — его буквы
// открылись и во фразе. Уровень пройден, когда открыты все буквы; попытки кончились — уровень начинается заново.
//
// Строка уровня: «фраза|источник|буквы по номерам|буквы, открытые сразу|ответ=вопрос;ответ=вопрос…».

export const MAX_MISTAKES = 5;               // столько ошибок — и уровень заново
export const START_COINS = 60;
export const HINT_COST = 20;                 // монет за открытую букву
export const ALPHABET = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';     // ё пишется как е
export const KEY_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
export const MAX_WORD = 12;                  // клеток в слове фразы — больше не помещается в строку на 320 px
export const MAX_ANSWER = 10;                // букв в ответе

/** Буква или слово, как они сравниваются: строчные, ё → е. */
export const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const isLetter = (ch) => ALPHABET.includes(ch);

/**
 * Слова фразы для сетки: [{ cells: [{ ch } | { mark }], before, after }]. Знаки препинания клеток не занимают:
 * кавычка перед словом — before, запятая, точка и тире после — after; дефис внутри слова — клетка-знак.
 */
export function phraseWords(phrase) {
  const words = [];
  for (const token of String(phrase).trim().split(/\s+/)) {
    const chars = [...token];
    let from = 0;
    let to = chars.length;
    while (from < to && !isLetter(norm(chars[from]))) from++;
    while (to > from && !isLetter(norm(chars[to - 1]))) to--;
    if (from >= to) {
      // одни знаки (тире) — приписываются к слову слева
      if (words.length) words[words.length - 1].after += ` ${token}`;
      continue;
    }
    words.push({
      before: chars.slice(0, from).join(''),
      after: chars.slice(to).join(''),
      cells: chars.slice(from, to).map((c) => (isLetter(norm(c)) ? { ch: norm(c) } : { mark: c })),
    });
  }
  return words;
}

/** Выдаёт ли вопрос ответ: в нём есть само слово-ответ или слово, которое с него начинается («лес» — «лесной»). */
export function givesAway(text, answer) {
  const a = norm(answer);
  return norm(text).split(/[^а-я]+/).some((w) => w === a || (a.length >= 4 && w.startsWith(a)));
}

/** Однокоренные на вид слова: общее начало в четыре буквы (или в три, если одно из слов короткое). */
export function related(a, b) {
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  return same >= 4 || (same >= 3 && Math.min(a.length, b.length) <= 5);
}

/** Разбор строки уровня. Проверка — отдельно, в levelProblems. */
export function parseLevel(text) {
  const [phrase = '', source = '', order = '', start = '', rest = ''] = String(text ?? '').split('|');
  const clues = rest.split(';').filter(Boolean).map((part) => {
    const at = part.indexOf('=');
    return { answer: at < 0 ? part : part.slice(0, at), text: at < 0 ? '' : part.slice(at + 1) };
  });
  return { phrase, source, order, start, clues, words: phraseWords(phrase) };
}

/** Номер буквы в уровне (с единицы) или 0. */
export const numberOf = (level, ch) => level.order.indexOf(ch) + 1;

/** Буквы фразы по порядку (без знаков). */
export const phraseLetters = (level) => level.words.flatMap((w) => w.cells.filter((c) => c.ch).map((c) => c.ch));

/**
 * Группы клеток по порядку на странице: сначала слова фразы, потом ответы. → [{ zone: 'phrase' | 'clue', index,
 * letters: [буква…] }]. Место клетки — { g: номер группы, i: номер буквы в группе }.
 */
export function groupsOf(level) {
  return [
    ...level.words.map((w, index) => ({ zone: 'phrase', index, letters: w.cells.filter((c) => c.ch).map((c) => c.ch) })),
    ...level.clues.map((c, index) => ({ zone: 'clue', index, letters: [...c.answer] })),
  ];
}

/**
 * Что не так с уровнем (пустой список — годится). Независимая проверка генератора: шифр — взаимно однозначный,
 * каждую букву фразы можно узнать — она открыта сразу или стоит в ответе на вопрос, у каждого вопроса есть что
 * отгадывать, всё помещается на экран.
 */
export function levelProblems(level) {
  const out = [];
  const { order, start, clues, words } = level;
  const letters = new Set(order);
  if (!level.phrase.trim()) out.push('нет фразы');
  if (!level.source.trim()) out.push('нет источника');
  if (letters.size !== order.length) out.push('буква повторяется в шифре');
  if (![...order].every(isLetter)) out.push('в шифре не буква');
  if (new Set(start).size !== start.length) out.push('открытая буква повторяется');
  for (const ch of start) if (!letters.has(ch)) out.push(`открыта буква не из шифра: ${ch}`);
  if (!words.length) out.push('во фразе нет слов');
  const inPhrase = new Set(phraseLetters(level));
  if (inPhrase.size < 6) out.push('во фразе меньше шести разных букв');
  for (const w of words) {
    if (w.cells.length > MAX_WORD) out.push(`слово фразы длиннее ${MAX_WORD} клеток`);
    if (!w.cells.some((c) => c.ch)) out.push('слово без букв');
    for (const c of w.cells) if (c.mark && c.mark !== '-') out.push(`знак внутри слова: ${c.mark}`);
  }
  if (clues.length < 3 || clues.length > 8) out.push(`вопросов ${clues.length}`);
  const inClues = new Set();
  const seen = new Set();
  const phraseWordList = words.map((w) => w.cells.filter((c) => c.ch).map((c) => c.ch).join(''));
  for (const clue of clues) {
    const a = clue.answer;
    if (a.length < 3 || a.length > MAX_ANSWER || ![...a].every(isLetter)) out.push(`ответ не годится: ${a}`);
    if (!clue.text.trim()) out.push(`нет вопроса к ответу ${a}`);
    if (givesAway(clue.text, a)) out.push(`вопрос выдаёт ответ: ${a}`);
    if (seen.has(a)) out.push(`ответ повторяется: ${a}`);
    if (phraseWordList.some((w) => w.length >= 3 && related(a, w))) out.push(`ответ подсказывает слово фразы: ${a}`);
    seen.add(a);
    for (const ch of a) inClues.add(ch);
    if (new Set([...a].filter((ch) => !start.includes(ch))).size < 2) out.push(`в ответе нечего отгадывать: ${a}`);
  }
  for (const ch of inPhrase) {
    if (!letters.has(ch)) out.push(`буквы фразы нет в шифре: ${ch}`);
    if (!inClues.has(ch) && !start.includes(ch)) out.push(`букву фразы неоткуда узнать: ${ch}`);
  }
  for (const ch of inClues) if (!letters.has(ch)) out.push(`буквы ответа нет в шифре: ${ch}`);
  for (const ch of order) if (!inPhrase.has(ch) && !inClues.has(ch)) out.push(`лишняя буква в шифре: ${ch}`);
  if ([...inPhrase].every((ch) => start.includes(ch))) out.push('фраза открыта сразу');
  return out;
}

/** Строка уровня с номером n (с единицы). Уровни кончились — идут по кругу. */
export function levelText(levels, n) {
  const total = levels.length;
  if (!total) return '';
  return levels[(((Math.max(1, Math.floor(n)) - 1) % total) + total) % total];
}

// ---------- игра ----------

/** Начало уровня n: open — открытые буквы (сразу — стартовые), mistakes — ошибки, hints — подсказки. */
export const newState = (n, level) => ({ v: 1, level: n, open: level.start, mistakes: 0, hints: 0 });

export function isValidState(state, level, n) {
  if (!state || typeof state !== 'object' || state.v !== 1 || state.level !== n) return false;
  if (typeof state.open !== 'string' || new Set(state.open).size !== state.open.length) return false;
  if (![...state.open].every((ch) => level.order.includes(ch))) return false;
  if (![...level.start].every((ch) => state.open.includes(ch))) return false;
  if (state.open.length >= level.order.length) return false;            // пройденный уровень не продолжают
  if (!Number.isInteger(state.mistakes) || state.mistakes < 0 || state.mistakes >= MAX_MISTAKES) return false;
  return Number.isInteger(state.hints) && state.hints >= 0 && state.hints <= level.order.length;
}

export const isOpen = (state, ch) => state.open.includes(ch);
export const isDone = (level, state) => state.open.length >= level.order.length;
export const isFailed = (state) => state.mistakes >= MAX_MISTAKES;
export const livesLeft = (state) => Math.max(0, MAX_MISTAKES - state.mistakes);

/** Открыты ли все буквы группы (слова фразы или ответа). */
export const groupDone = (group, state) => group.letters.every((ch) => state.open.includes(ch));

/**
 * Игрок назвал букву letter для клеток с номером num.
 * → { kind: 'hit', ch } — угадал, буква открыта везде; { kind: 'miss' } — ошибка (минус попытка);
 *   { kind: 'skip' } — номер уже открыт, буква уже стоит под другим номером или это не буква: ход не считается.
 */
export function guess(level, state, num, letter) {
  const ch = level.order[num - 1];
  const said = norm(letter);
  if (!ch || isOpen(state, ch) || said.length !== 1 || !isLetter(said) || isOpen(state, said)) return { kind: 'skip' };
  if (isFailed(state)) return { kind: 'skip' };
  if (said !== ch) {
    state.mistakes += 1;
    return { kind: 'miss' };
  }
  state.open += ch;
  return { kind: 'hit', ch };
}

/** Подсказка: открыть букву номера num. → буква или null (номер уже открыт). */
export function reveal(level, state, num) {
  const ch = level.order[num - 1];
  if (!ch || isOpen(state, ch) || isFailed(state)) return null;
  state.open += ch;
  state.hints += 1;
  return ch;
}

/**
 * Куда перейти после клетки at = { g, i }: следующая закрытая клетка той же группы (по кругу), иначе — первая
 * закрытая в следующих группах той же зоны (вопросы за вопросами, слова фразы за словами), иначе — в другой зоне.
 * → { g, i } или null (закрытых не осталось).
 */
export function nextHidden(groups, state, at) {
  const hiddenIn = (g, from = 0) => {
    const { letters } = groups[g];
    for (let k = 0; k < letters.length; k++) {
      const i = (from + k) % letters.length;
      if (!state.open.includes(letters[i])) return { g, i };
    }
    return null;
  };
  const here = groups[at?.g];
  if (!here) {
    for (let g = 0; g < groups.length; g++) {
      const found = groups[g].zone === 'clue' ? hiddenIn(g) : null;
      if (found) return found;
    }
    for (let g = 0; g < groups.length; g++) {
      const found = hiddenIn(g);
      if (found) return found;
    }
    return null;
  }
  const same = hiddenIn(at.g, at.i + 1);
  if (same) return same;
  const zone = groups.map((_, g) => g).filter((g) => groups[g].zone === here.zone);
  const other = groups.map((_, g) => g).filter((g) => groups[g].zone !== here.zone);
  const pos = zone.indexOf(at.g);
  for (let k = 1; k < zone.length; k++) {
    const found = hiddenIn(zone[(pos + k) % zone.length]);
    if (found) return found;
  }
  for (const g of other) {
    const found = hiddenIn(g);
    if (found) return found;
  }
  return null;
}

/** Соседняя клетка (dir = ±1) по порядку на странице — для стрелок клавиатуры. */
export function stepCell(groups, at, dir) {
  if (!groups[at?.g]) return groups.length ? { g: 0, i: 0 } : null;
  let { g, i } = at;
  i += dir;
  if (i < 0) {
    g = (g - 1 + groups.length) % groups.length;
    i = groups[g].letters.length - 1;
  } else if (i >= groups[g].letters.length) {
    g = (g + 1) % groups.length;
    i = 0;
  }
  return { g, i };
}

/** Звёзды за уровень: без ошибок и подсказок — три, до двух — две, иначе одна. */
export function starsFor(mistakes, hints) {
  const faults = mistakes + hints;
  return faults <= 0 ? 3 : faults <= 2 ? 2 : 1;
}

/** Монеты за уровень. */
export const reward = (stars) => 10 + 5 * Math.max(1, Math.min(3, stars));

// ---------- прогресс и статистика ----------

const nat = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

/** level — уровень, на котором игрок (пройдено level − 1); coins — монеты на подсказки. */
export const emptyProgress = () => ({ level: 1, coins: START_COINS });

export function migrateProgress(raw) {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  return {
    level: Math.max(1, nat(raw.level)),
    coins: Number.isInteger(raw.coins) && raw.coins >= 0 ? Math.min(raw.coins, 1e7) : START_COINS,
  };
}

export const isValidProgress = (raw) => JSON.stringify(migrateProgress(raw)) === JSON.stringify(raw);

/** Списать монеты. → хватило ли. */
export function spend(progress, cost) {
  if (!(cost > 0) || progress.coins < cost) return false;
  progress.coins -= cost;
  return true;
}

/** levels — пройдено уровней, perfect — из них без ошибок и подсказок, mistakes — ошибок, hints — подсказок, fails — уровней заново. */
export const emptyStats = () => ({ levels: 0, perfect: 0, mistakes: 0, hints: 0, fails: 0 });

export function migrateStats(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const k of Object.keys(stats)) stats[k] = nat(raw[k]);
  return stats;
}

export const isValidStats = (raw) => JSON.stringify(migrateStats(raw)) === JSON.stringify(raw);

export function plural(n, forms) {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
