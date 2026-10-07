// Собирает уровни «Кростика» из фраз и вопросов (tools/crostic-data/*.txt) → games/crostic/levels.json.
//   node tools/crostic-levels.mjs            — собрать и записать
//   node tools/crostic-levels.mjs --dry      — только показать сводку
//
// Уровень — фраза и вопросы к ней. Вопросы подбираются так, чтобы их ответы вместе закрывали буквы фразы: тогда,
// ответив на вопросы, игрок открывает всю фразу. Буквы фразы, которых нет ни в одном ответе, открыты сразу.
// Ответ почти целиком состоит из букв фразы (лишних — не больше одной на ответ), повторяется не чаще MAX_USES раз
// и не ближе GAP уровней. Первые уровни — короткие пословицы и простые вопросы, дальше — длиннее и труднее.
// Каждый собранный уровень проверяется правилами игры (levelProblems) — негодный не записывается.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseLevel, levelProblems, norm, phraseWords, givesAway, related, MAX_WORD, MAX_ANSWER, ALPHABET } from '../games/crostic/logic.js';

const DATA = new URL('./crostic-data/', import.meta.url);
const OUT = new URL('../games/crostic/levels.json', import.meta.url);

const SEED = 20261007;
export const MAX_USES = 5;       // сколько раз ответ встречается во всех уровнях
export const GAP = 45;           // не ближе стольких уровней
const MIN_LETTERS = 12;          // букв во фразе
const MAX_LETTERS = 48;
const MIN_DISTINCT = 7;
const EASY_SOURCES = new Set(['Пословица', 'Поговорка']);

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

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const files = (re) => readdirSync(DATA).filter((f) => re.test(f)).sort();
const linesOf = (file) => readFileSync(new URL(file, DATA), 'utf8').split(/\r?\n/)
  .map((text, k) => ({ text: text.trim(), at: `${file}:${k + 1}` }))
  .filter((l) => l.text && !l.text.startsWith('#'));

export const notes = [];         // что отброшено и почему
const note = (at, why) => notes.push(`${at} — ${why}`);

/** Вопросы: ответ → { answer, d: трудность 1…3 (по имени файла), texts: [вопрос…] }. */
export function loadClues() {
  const bank = new Map();
  for (const file of files(/^clues-\d-.*\.txt$/)) {
    const d = Number(file[6]);
    for (const line of linesOf(file)) {
      const cut = line.text.indexOf('|');
      const answer = norm(line.text.slice(0, Math.max(0, cut)).trim());
      const text = line.text.slice(cut + 1).trim();
      if (cut < 0 || !text) { note(line.at, 'нет вопроса'); continue; }
      if (answer.length < 3 || answer.length > MAX_ANSWER || ![...answer].every((ch) => ALPHABET.includes(ch))) { note(line.at, `ответ не годится: «${answer}»`); continue; }
      if (text.length > 48) { note(line.at, `вопрос длиннее 48 знаков: «${text}»`); continue; }
      if (/[|;=]/.test(text)) { note(line.at, 'в вопросе служебный знак'); continue; }
      if (givesAway(text, answer)) { note(line.at, `вопрос выдаёт ответ: ${answer} — «${text}»`); continue; }
      const entry = bank.get(answer) ?? { answer, d, texts: [] };
      entry.d = Math.min(entry.d, d);
      if (entry.texts.includes(text)) { note(line.at, `повтор вопроса: ${answer}`); continue; }
      entry.texts.push(text);
      bank.set(answer, entry);
    }
  }
  return bank;
}

/** Фразы: [{ phrase, source, letters: [буква…], set, words: [слово…] }]. */
export function loadPhrases() {
  const list = [];
  const seen = new Map();
  for (const file of files(/^phrases-.*\.txt$/)) {
    for (const line of linesOf(file)) {
      const [phrase = '', source = ''] = line.text.split('|').map((s) => s.trim());
      if (!phrase || !source) { note(line.at, 'нет фразы или источника'); continue; }
      if (!/^[А-Яа-яЁё ,.!?:;—«»-]+$/.test(phrase)) { note(line.at, `лишний знак во фразе: «${phrase}»`); continue; }
      const cells = phraseWords(phrase);
      const words = cells.map((w) => w.cells.filter((c) => c.ch).map((c) => c.ch).join(''));
      const letters = [...words.join('')];
      const set = new Set(letters);
      if (letters.length < MIN_LETTERS || letters.length > MAX_LETTERS) { note(line.at, `букв ${letters.length}: «${phrase}»`); continue; }
      if (set.size < MIN_DISTINCT) { note(line.at, `разных букв ${set.size}: «${phrase}»`); continue; }
      if (cells.some((w) => w.cells.length > MAX_WORD)) { note(line.at, `слово длиннее ${MAX_WORD} клеток: «${phrase}»`); continue; }
      if (cells.some((w) => w.cells.some((c) => c.mark && c.mark !== '-'))) { note(line.at, `знак внутри слова: «${phrase}»`); continue; }
      // та же фраза или почти та же (слова совпадают на три четверти) — берётся первая
      const bag = new Set(words.filter((w) => w.length > 2));
      let twin = seen.get(words.join(' '));
      if (!twin) {
        for (const other of list) {
          const common = [...bag].filter((w) => other.bag.has(w)).length;
          if (common / Math.max(1, Math.min(bag.size, other.bag.size)) >= 0.75 && common >= 2) { twin = other.phrase; break; }
        }
      }
      if (twin) { note(line.at, `похожа на «${twin}»: «${phrase}»`); continue; }
      seen.set(words.join(' '), phrase);
      list.push({ phrase, source, letters, set, words, bag });
    }
  }
  return list;
}

/** Порядок фраз: сначала короткие пословицы, потом недлинное вперемешку, дальше — всё подряд вперемешку. */
function arrange(phrases, rng) {
  const byLength = (a, b) => a.letters.length - b.letters.length || a.set.size - b.set.size;
  const easy = phrases.filter((p) => EASY_SOURCES.has(p.source) && p.letters.length <= 26).sort(byLength).slice(0, 40);
  const first = [];
  for (let k = 0; k < easy.length; k += 8) first.push(...shuffle(easy.slice(k, k + 8), rng));
  const taken = new Set(first);
  const middle = shuffle(phrases.filter((p) => !taken.has(p) && p.letters.length <= 31), rng).slice(0, 100);
  middle.sort((a, b) => Math.floor(a.letters.length / 6) - Math.floor(b.letters.length / 6));
  for (const p of middle) taken.add(p);
  return [...first, ...middle, ...shuffle(phrases.filter((p) => !taken.has(p)), rng)];
}

/** Что положено уровню с номером i (с нуля). */
function planOf(i, phrase) {
  const big = phrase.set.size >= 17;
  return {
    clues: i < 4 ? 3 : i < 14 ? 4 : i < 40 ? 5 : big ? 7 : 6,
    maxD: i < 20 ? 1 : i < 60 ? 2 : 3,
    mid: i < 60 ? 2 : 9,              // сколько вопросов средней трудности можно
    hard: i < 150 ? 1 : 2,
    start: i < 6 ? 4 : i < 30 ? 3 : i < 120 ? 2 : 1,
    extras: i < 30 ? 1 : 2,
  };
}

/** Вопросы для фразы: несколько попыток жадного подбора, лучшая — где меньше всего непокрытых букв. */
function pickClues(phrase, i, bank, use, rng) {
  const plan = planOf(i, phrase);
  const P = phrase.set;
  const own = phrase.words.filter((w) => w.length >= 3);
  const pool = [];
  for (const c of bank.values()) {
    const u = use.get(c.answer);
    if (u && (u.count >= MAX_USES || i - u.last < GAP)) continue;
    if (c.d > plan.maxD || own.some((w) => related(c.answer, w))) continue;
    const letters = new Set(c.answer);
    const extra = [...letters].filter((ch) => !P.has(ch));
    if (extra.length > 1 || letters.size - extra.length < 3) continue;
    pool.push({ c, letters, extra, uses: u?.count ?? 0 });
  }
  let best = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const chosen = [];
    const covered = new Set();
    const extras = new Set();
    let mid = 0;
    let hard = 0;
    while (chosen.length < plan.clues) {
      let top = null;
      let topScore = -Infinity;
      for (const item of pool) {
        if (chosen.includes(item)) continue;
        if (item.c.d === 2 && mid >= plan.mid) continue;
        if (item.c.d === 3 && hard >= plan.hard) continue;
        const newExtra = item.extra.filter((ch) => !extras.has(ch)).length;
        if (extras.size + newExtra > plan.extras) continue;
        let gain = 0;
        for (const ch of item.letters) if (P.has(ch) && !covered.has(ch)) gain++;
        const len = item.c.answer.length;
        const score = gain * 3 - newExtra * 2.5 - item.uses * 0.9 - (len === 3 ? 1.2 : len >= 9 ? 0.8 : 0)
          - (item.c.d - 1) * 0.6 + rng() * 3;
        if (score > topScore) {
          topScore = score;
          top = item;
        }
      }
      if (!top) break;
      chosen.push(top);
      for (const ch of top.letters) (P.has(ch) ? covered : extras).add(ch);
      if (top.c.d === 2) mid++;
      if (top.c.d === 3) hard++;
    }
    if (chosen.length < Math.min(3, plan.clues)) continue;
    const uncovered = [...P].filter((ch) => !covered.has(ch));
    const cost = uncovered.length * 10 + (plan.clues - chosen.length) * 6 + extras.size * 2 + chosen.reduce((s, x) => s + x.uses, 0) * 0.5;
    if (!best || cost < best.cost) best = { chosen, uncovered, cost, plan };
    if (best.uncovered.length === 0 && attempt >= 5) break;
  }
  return best;
}

/** Буквы, открытые сразу: те, что не стоят ни в одном ответе, и ещё частые буквы фразы — до положенного числа. */
function startersOf(phrase, picked, rng) {
  const start = [...picked.uncovered];
  const answers = picked.chosen.map((x) => x.c.answer);
  const hiddenAfter = (open) => answers.every((a) => new Set([...a].filter((ch) => !open.includes(ch))).size >= 2);
  const freq = new Map();
  for (const ch of phrase.letters) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const order = [...phrase.set].filter((ch) => !start.includes(ch)).sort((a, b) => freq.get(b) - freq.get(a) || rng() - 0.5);
  for (const ch of order) {
    if (start.length >= picked.plan.start) break;
    if (phrase.set.size - start.length <= 5) break;
    if (hiddenAfter([...start, ch])) start.push(ch);
  }
  return start;
}

/** Собрать все уровни. → { levels: [строка…], info, failed, bank, use }. */
export function build() {
  notes.length = 0;
  const rng = rngOf(SEED);
  const bank = loadClues();
  const phrases = arrange(loadPhrases(), rng);
  const use = new Map();           // ответ → { count, last }
  const levels = [];
  const info = [];
  const failed = [];
  for (const phrase of phrases) {
    const i = levels.length;
    const picked = pickClues(phrase, i, bank, use, rng);
    if (!picked || picked.uncovered.length > 5) {
      failed.push(`«${phrase.phrase}» — не закрыты буквы: ${picked ? picked.uncovered.join('') : 'нет вопросов'}`);
      continue;
    }
    const start = startersOf(phrase, picked, rng);
    const all = new Set(phrase.letters);
    for (const x of picked.chosen) for (const ch of x.c.answer) all.add(ch);
    const order = shuffle([...all].sort(), rng).join('');
    const clues = [...picked.chosen].sort((a, b) => a.c.d - b.c.d || a.c.answer.length - b.c.answer.length);
    const text = [
      phrase.phrase, phrase.source, order, start.join(''),
      clues.map((x) => `${x.c.answer}=${x.c.texts[(use.get(x.c.answer)?.count ?? 0) % x.c.texts.length]}`).join(';'),
    ].join('|');
    const problems = levelProblems(parseLevel(text));
    if (problems.length) {
      failed.push(`«${phrase.phrase}» — ${problems.join('; ')}`);
      continue;
    }
    for (const x of picked.chosen) {
      const u = use.get(x.c.answer) ?? { count: 0, last: -1e9 };
      u.count += 1;
      u.last = i;
      use.set(x.c.answer, u);
    }
    levels.push(text);
    info.push({ clues: clues.length, start: start.length, uncovered: picked.uncovered.length, letters: order.length, extra: order.length - phrase.set.size, phrase: phrase.letters.length });
  }
  return { levels, info, failed, bank, use };
}

/** Текст файла уровней: по строке на уровень. */
export const fileText = (levels) => `${JSON.stringify({ v: 1, levels }).replace('"levels":[', '"levels":[\n').replace(/","/g, '",\n"').replace(/\]\}$/, '\n]}')}\n`;

function main() {
  const DRY = process.argv.includes('--dry');
  const { levels, info, failed, bank, use } = build();
  const avg = (key) => (info.reduce((s, x) => s + x[key], 0) / Math.max(1, info.length)).toFixed(2);
  const hist = (key) => {
    const h = {};
    for (const x of info) h[x[key]] = (h[x[key]] ?? 0) + 1;
    return JSON.stringify(h);
  };
  console.log(`вопросов: ${[...bank.values()].reduce((s, c) => s + c.texts.length, 0)} (ответов ${bank.size}; лёгких ${[...bank.values()].filter((c) => c.d === 1).length}, средних ${[...bank.values()].filter((c) => c.d === 2).length}, трудных ${[...bank.values()].filter((c) => c.d === 3).length})`);
  console.log(`уровней: ${levels.length}; вопросов на уровень ${avg('clues')} ${hist('clues')}; букв в шифре ${avg('letters')}; букв во фразе ${avg('phrase')}`);
  console.log(`открыто сразу ${avg('start')} ${hist('start')}; из них непокрытых ${avg('uncovered')} ${hist('uncovered')}; лишних букв ${avg('extra')}`);
  const counts = [...bank.values()].map((c) => use.get(c.answer)?.count ?? 0);
  console.log(`ответы по числу появлений: ${JSON.stringify(counts.reduce((h, n) => ({ ...h, [n]: (h[n] ?? 0) + 1 }), {}))}`);
  if (notes.length) console.log(`\nотброшено строк: ${notes.length}\n  ${notes.join('\n  ')}`);
  if (failed.length) console.log(`\nне собрано уровней: ${failed.length}\n  ${failed.join('\n  ')}`);
  if (!DRY) {
    writeFileSync(OUT, fileText(levels));
    console.log(`\nзаписано: ${OUT.pathname} (${levels.length} уровней)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
