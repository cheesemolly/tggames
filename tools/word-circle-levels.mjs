// Уровни «Круга слов» (games/word-circle/levels.json):
//   node tools/word-circle-levels.mjs <папка с исходниками> [--stats]
// В папке (в репозиторий она не кладётся):
//   freqrnc2011.csv — О. Н. Ляшевская, С. А. Шаров, «Частотный словарь современного русского языка» (2009;
//                     dict.ruslang.ru): лемма, часть речи, частота на миллион, охват, равномерность;
//   harrix.txt      — список существительных Harrix/Russian-Nouns (MIT), dist/russian_nouns.txt.
// Свои списки (современные слова, грубые и неуместные) — tools/word-circle-words.mjs.
//
// Словарь уровня — два круга слов, все от 3 до 7 букв, существительные в начальной форме, ё = е:
//   принимаются (бонусом) — список Harrix + свои списки, без грубых;
//   загадываются в кроссворде — из них только то, что знают все: частота от 4 на миллион при равномерности от 75
//   (слово встречается по всему корпусу, а не в паре текстов), плюс свой список современных слов, без неуместных.
// Уровень: слово-основа (все буквы круга) → все слова, что складываются из его букв → часть из них раскладывается
// в кроссворд (перебор случайных порядков, слова ставятся с пересечением и без случайных соседств), остальные —
// бонусные. Одно и то же слово загадывается не чаще MAX_USES раз и не раньше, чем через GAP уровней.
// Порядок уровней: 3 буквы → 4 → 5 → 6 → 6–7; среди равных — сначала с более частыми словами.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KNOWN_EXTRA, BONUS_EXTRA, RUDE, AVOID } from './word-circle-words.mjs';
import { parseLevel, levelProblems, MAX_COLS, MAX_ROWS, MIN_WORD } from '../games/word-circle/logic.js';

export const TOTAL = 600;
const MAX_LETTERS = 7;
const MAX_USES = 6;
const GAP = 10;
const KNOWN_IPM = 4;
const KNOWN_D = 75;
const EXTRA_IPM = 9;                    // «частота» современных слов, которых нет в частотном словаре

export function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (w) => w.trim().toLowerCase().replace(/ё/g, 'е');
const fits = (w) => w.length >= MIN_WORD && w.length <= MAX_LETTERS && /^[а-я]+$/.test(w);

/** Словари из исходников: accept — что принимается, known — что загадывается (слово → частота). */
export function loadWords(dir) {
  const rude = new Set(RUDE.map(norm));
  const avoid = new Set(AVOID.map(norm));
  const accept = new Set();
  for (const line of readFileSync(join(dir, 'harrix.txt'), 'utf8').split(/\r?\n/)) {
    const w = norm(line);
    if (fits(w)) accept.add(w);
  }
  for (const w of [...KNOWN_EXTRA, ...BONUS_EXTRA].map(norm)) if (fits(w)) accept.add(w);
  for (const w of rude) accept.delete(w);

  const known = new Map();
  for (const line of readFileSync(join(dir, 'freqrnc2011.csv'), 'utf8').split('\n').slice(1)) {
    const [lemma, pos, ipm, , d] = line.split('\t');
    if (pos !== 's') continue;
    const w = norm(lemma ?? '');
    if (!accept.has(w) || avoid.has(w)) continue;
    if (Number(ipm) >= KNOWN_IPM && Number(d) >= KNOWN_D) known.set(w, Math.max(known.get(w) ?? 0, Number(ipm)));
  }
  for (const w of KNOWN_EXTRA.map(norm)) {
    if (accept.has(w) && !avoid.has(w) && !known.has(w)) known.set(w, EXTRA_IPM);
  }
  return { accept, known };
}

// ---------- раскладка кроссворда ----------

const key = (x, y) => (y + 32) * 64 + (x + 32);

/**
 * Разложить слова в кроссворд: первое — по горизонтали, каждое следующее пересекает уже стоящие и нигде не
 * касается чужих букв боком. Что не встало — пропускается. → { placed: [{ word, x, y, dir }], cols, rows }.
 */
export function layoutOnce(words, rng, { maxCols = MAX_COLS, maxRows = MAX_ROWS } = {}) {
  const grid = new Map();          // клетка → { ch, h, v }: буква и в каких направлениях через неё идёт слово
  const placed = [];
  let minX = 0;
  let maxX = -1;
  let minY = 0;
  let maxY = -1;

  const put = (word, x, y, dir) => {
    [...word].forEach((ch, k) => {
      const cx = x + (dir ? 0 : k);
      const cy = y + (dir ? k : 0);
      const cell = grid.get(key(cx, cy)) ?? { ch, h: false, v: false };
      if (dir) cell.v = true;
      else cell.h = true;
      grid.set(key(cx, cy), cell);
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    });
    placed.push({ word, x, y, dir });
  };

  /** Сколько пересечений даст слово в этом месте; −1 — так ставить нельзя. */
  const crossings = (word, x, y, dir) => {
    const dx = dir ? 0 : 1;
    const dy = dir ? 1 : 0;
    const n = word.length;
    if (grid.has(key(x - dx, y - dy)) || grid.has(key(x + dx * n, y + dy * n))) return -1;
    let cross = 0;
    for (let k = 0; k < n; k++) {
      const cx = x + dx * k;
      const cy = y + dy * k;
      const cell = grid.get(key(cx, cy));
      if (cell) {
        if (cell.ch !== word[k] || (dir ? cell.v : cell.h)) return -1;
        cross++;
      } else if (grid.has(key(cx + dy, cy + dx)) || grid.has(key(cx - dy, cy - dx))) {
        return -1;                                    // буква встала бы вплотную к чужому слову
      }
    }
    return cross > 0 && cross < n ? cross : -1;
  };

  put(words[0], 0, 0, 0);
  for (const word of words.slice(1)) {
    let best = null;
    for (const [k0, cell] of grid) {
      const cx = (k0 % 64) - 32;
      const cy = Math.floor(k0 / 64) - 32;
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell.ch) continue;
        for (const dir of [0, 1]) {
          if (dir ? cell.v : cell.h) continue;
          const x = cx - (dir ? 0 : i);
          const y = cy - (dir ? i : 0);
          const cross = crossings(word, x, y, dir);
          if (cross < 0) continue;
          const w = Math.max(maxX, x + (dir ? 0 : word.length - 1)) - Math.min(minX, x) + 1;
          const h = Math.max(maxY, y + (dir ? word.length - 1 : 0)) - Math.min(minY, y) + 1;
          if (w > maxCols || h > maxRows) continue;
          // плотнее и ниже — лучше: высота кроссворда на экране дороже ширины
          const score = cross * 4 - w - h * 1.7 + rng() * 2.5;
          if (!best || score > best.score) best = { x, y, dir, score };
        }
      }
    }
    if (best) put(word, best.x, best.y, best.dir);
  }
  return {
    placed: placed.map((p) => ({ word: p.word, x: p.x - minX, y: p.y - minY, dir: p.dir })),
    cols: maxX - minX + 1,
    rows: maxY - minY + 1,
  };
}

/** Лучшая из нескольких раскладок: больше слов, потом ниже и уже. Первое слово всегда на месте. */
export function layout(words, rng, tries = 60, limits = {}) {
  let best = null;
  for (let t = 0; t < tries; t++) {
    const rest = words.slice(1).map((w) => ({ w, k: w.length + rng() * 3 })).sort((a, b) => b.k - a.k).map((o) => o.w);
    const res = layoutOnce([words[0], ...rest], rng, limits);
    const value = res.placed.length * 100 - res.rows * 3 - res.cols * 1.5;
    if (!best || value > best.value) best = { ...res, value };
  }
  return best;
}

// ---------- уровни ----------

const maskOf = (w) => {
  let m = 0;
  for (const ch of w) m |= 1 << (ch.charCodeAt(0) - 1072);
  return m;
};
const countsOf = (w) => {
  const c = new Uint8Array(32);
  for (const ch of w) c[ch.charCodeAt(0) - 1072]++;
  return c;
};
const sig = (w) => [...w].sort().join('');

/** Сколько букв в круге на уровне n (с единицы) и сколько слов нужно в кроссворде: [букв, от, до]. */
export function shapeOf(n, rng) {
  if (n <= 3) return [3, 2, 2];
  if (n <= 15) return [4, 3, 4];
  if (n <= 50) return [5, 3, n < 30 ? 4 : 5];
  if (n <= 120) return n % 4 === 0 ? [5, 3, 5] : [6, 4, n < 85 ? 5 : 6];
  const roll = rng();
  if (roll < 0.1) return [5, 4, 5];
  const seven = 0.3 + 0.3 * Math.min(1, (n - 120) / 300);
  return roll < 0.1 + seven ? [7, 5, n < 300 ? 8 : 9] : [6, 4, 7];
}

/** Все уровни: строки для levels.json. */
export function buildLevels({ accept, known }, total = TOTAL, seed = 20261007) {
  const rng = rngOf(seed);
  const all = [...accept].map((w) => ({ w, mask: maskOf(w), counts: countsOf(w) }));
  const formable = (base) => {
    const mask = maskOf(base);
    const counts = countsOf(base);
    return all.filter((o) => (o.mask & ~mask) === 0 && o.counts.every((c, i) => c <= counts[i])).map((o) => o.w);
  };

  const modern = new Set(KNOWN_EXTRA.map(norm));
  // наборы букв: по одному на набор (анаграммы одной основы — один уровень), с запасом слов
  const pools = new Map();
  const seenSig = new Set();
  for (const [base, ipm] of known) {
    const s = sig(base);
    if (seenSig.has(s)) continue;
    seenSig.add(s);
    const words = formable(base);
    const good = words.filter((w) => known.has(w));
    const n = base.length;
    const need = n === 3 ? 2 : n === 4 ? 3 : n === 5 ? 3 : n === 6 ? 4 : 5;
    if (good.length < need) continue;
    // лёгкость набора: средняя частота пяти самых частых слов (в логарифме)
    const top = good.map((w) => Math.log(known.get(w))).sort((a, b) => b - a).slice(0, 5);
    // наборы с современными словами идут в дело раньше прочих — иначе до «сайта» и «блога» очередь не доходит
    const fresh = (modern.has(base) ? 1.5 : 0) + Math.min(1.5, good.filter((w) => w !== base && modern.has(w)).length * 0.6);
    const ease = top.reduce((a, b) => a + b, 0) / top.length + Math.log(ipm) * 0.5 + fresh;
    if (!pools.has(n)) pools.set(n, []);
    pools.get(n).push({ base, words, good, ease });
  }
  for (const list of pools.values()) list.sort((a, b) => b.ease - a.ease || (a.base < b.base ? -1 : 1));
  // первые уровни — самые простые и понятные пары
  for (const [n, firsts] of [[3, ['кот', 'нос', 'лес']]]) {
    const list = pools.get(n) ?? [];
    for (const base of [...firsts].reverse()) {
      const at = list.findIndex((c) => sig(c.base) === sig(base));
      if (at > 0) list.unshift(list.splice(at, 1)[0]);
    }
  }

  const uses = new Map();
  const lastAt = new Map();
  const levels = [];
  const report = [];
  for (let n = 1; n <= total; n++) {
    const [letters, lo, hi] = shapeOf(n, rng);
    const pool = pools.get(letters) ?? [];
    let made = null;
    const later = [];
    while (pool.length && !made) {
      // из начала списка — лёгкие; чтобы соседние уровни не шли по алфавиту частот, берём из первых восьми наугад
      const cand = pool.splice(n <= 3 ? 0 : Math.floor(rng() * Math.min(8, pool.length)), 1)[0];
      const free = cand.good.filter((w) => w !== cand.base && (uses.get(w) ?? 0) < MAX_USES);
      // слова набора (или сама основа) уже загаданы слишком часто — набор больше не нужен
      if (free.length + 1 < lo || (uses.get(cand.base) ?? 0) >= MAX_USES) continue;
      const fresh = free.filter((w) => n - (lastAt.get(w) ?? -1000) > GAP);
      if (fresh.length + 1 < lo || n - (lastAt.get(cand.base) ?? -1000) <= GAP) {
        later.push(cand);                                              // слова были недавно — набор пригодится позже
        continue;
      }
      const want = lo + Math.floor(rng() * (hi - lo + 1));
      // сначала частые и редко загадывавшиеся; трёхбуквенных — не больше половины
      const ranked = fresh.map((w) => ({ w, k: Math.log(known.get(w)) - (uses.get(w) ?? 0) * 0.7 + w.length * 0.25 + (modern.has(w) ? 1.5 : 0) + rng() * 1.2 }))
        .sort((a, b) => b.k - a.k).map((o) => o.w);
      const chosen = [cand.base];
      let short = 0;
      for (const w of ranked) {
        if (chosen.length >= want + 2) break;
        if (w.length === 3 && letters > 4) {
          if (short >= Math.ceil(want / 2)) continue;
          short++;
        }
        chosen.push(w);
      }
      const res = layout(chosen, rng);
      if (res.placed.length < lo) continue;
      const order = [...cand.base];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.join('') === cand.base && order.length > 1) order.push(order.shift());
      const make = (list) => {
        const minX = Math.min(...list.map((p) => p.x));
        const minY = Math.min(...list.map((p) => p.y));
        const inGrid = new Set(list.map((p) => p.word));
        const bonus = cand.words.filter((w) => !inGrid.has(w)).sort();
        return `${order.join('')}|${list.map((p) => `${p.word},${p.x - minX},${p.y - minY},${p.dir}`).join(';')}|${bonus.join(',')}`;
      };
      // лишние слова снимаем с конца по одному — только те, без которых кроссворд остаётся целым
      let list = res.placed;
      while (list.length > want) {
        let cut = -1;
        for (let k = list.length - 1; k >= 1 && cut < 0; k--) {
          const rest = list.filter((_, i) => i !== k);
          if (!levelProblems(parseLevel(make(rest))).length) cut = k;
        }
        if (cut < 0) break;
        list = list.filter((_, i) => i !== cut);
      }
      const text = make(list);
      if (levelProblems(parseLevel(text)).length) continue;
      made = { text, cand };
    }
    pool.unshift(...later);
    if (!made) throw new Error(`уровень ${n}: кончились наборы из ${letters} букв`);
    const level = parseLevel(made.text);
    for (const w of level.words) {
      uses.set(w.word, (uses.get(w.word) ?? 0) + 1);
      lastAt.set(w.word, n);
    }
    levels.push(made.text);
    report.push({ n, letters, base: made.cand.base, words: level.words.length, cols: level.cols, rows: level.rows, bonus: level.bonus.size });
  }
  return { levels, report, pools, uses };
}

function draw(level) {
  const rows = Array.from({ length: level.rows }, () => Array(level.cols).fill('·'));
  for (const c of level.cells) rows[c.y][c.x] = c.ch;
  return rows.map((r) => r.join(' ')).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('node tools/word-circle-levels.mjs <папка с freqrnc2011.csv и harrix.txt> [--stats]');
    process.exit(1);
  }
  const dict = loadWords(dir);
  const { levels, report, pools, uses } = buildLevels(dict);
  const out = new URL('../games/word-circle/levels.json', import.meta.url);
  const json = `${JSON.stringify({ v: 1, levels })}\n`;
  writeFileSync(out, json);
  console.log(`принимается слов: ${dict.accept.size}, загадывается: ${dict.known.size}; уровней: ${levels.length}, байт: ${Buffer.byteLength(json)}`);
  if (process.argv.includes('--stats')) {
    console.log('осталось наборов:', [...pools].map(([n, l]) => `${n} букв — ${l.length}`).join(', '));
    const avg = (f) => (report.reduce((a, r) => a + f(r), 0) / report.length).toFixed(1);
    console.log(`в среднем: слов ${avg((r) => r.words)}, ширина ${avg((r) => r.cols)}, высота ${avg((r) => r.rows)}, бонусных ${avg((r) => r.bonus)}`);
    console.log('высота:', [3, 4, 5, 6, 7, 8].map((h) => `${h} — ${report.filter((r) => r.rows === h).length}`).join(', '),
      '| ширина:', [3, 4, 5, 6, 7, 8, 9].map((w) => `${w} — ${report.filter((r) => r.cols === w).length}`).join(', '));
    console.log('самые частые слова:', [...uses].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, k]) => `${w}×${k}`).join(' '), '| разных слов:', uses.size);
    for (const n of [1, 2, 4, 10, 20, 40, 70, 100, 150, 250, 400, 600]) {
      const level = parseLevel(levels[n - 1]);
      console.log(`\n— уровень ${n}: буквы ${level.letters.join('').toUpperCase()}, слова: ${level.words.map((w) => w.word).join(', ')}; бонусных ${level.bonus.size}: ${[...level.bonus].slice(0, 14).join(', ')}`);
      console.log(draw(level));
    }
  }
}
