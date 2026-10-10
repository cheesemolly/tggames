// Собирает базу «Алхимии» из списков (tools/alchemy-data/*.txt) → games/alchemy/data.json.
//   node tools/alchemy-build.mjs            — проверить, собрать и записать
//   node tools/alchemy-build.mjs --dry      — только проверить и показать сводку
//   node tools/alchemy-build.mjs --list     — ещё и подробности: слои, тупиковые элементы, одинаковые значки
//
// Списки читаются по порядку имён файлов. Строка списка:
//   # ключ: Название           — категория: к ней относятся элементы ниже
//   вода 💧 *                  — стартовый элемент (открыт сразу)
//   время ⏳ @50               — дар: рецепта нет, вручается, когда открыто 50 элементов
//   пар ♨️ = вода + огонь | вода + лава      — элемент и его рецепты (пары через «|»)
//   пар += гейзер + воздух     — ещё рецепты уже описанного элемента (можно в любом файле)
//   // …                       — заметка
// Названия нарицательные — со строчной буквы (игра сама пишет с заглавной), имена собственные — как есть.
// Пара даёт только один итог: одна и та же пара в двух рецептах — ошибка.
//
// Номера элементов (id) живут в tools/alchemy-data/ids.json и НЕ меняются: по ним игроки хранят открытое.
// Новому названию сборка сама даёт следующий номер. Переименовываешь элемент — поправь название и в ids.json
// (иначе у игроков он пропадёт, а под новым именем появится неоткрытый). Убранный элемент остаётся в ids.json —
// его номер больше никому не достанется.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PAIR, pairKey, fold, indexData, dataProblems, unlockAll, RANKS } from '../games/alchemy/logic.js';

const DATA = new URL('./alchemy-data/', import.meta.url);
const IDS = new URL('./alchemy-data/ids.json', import.meta.url);
const OUT = new URL('../games/alchemy/data.json', import.meta.url);

export const MAX_NAME = 20;        // букв в названии: длиннее не помещается в плитку в две строки
export const MAX_WORD = 13;        // букв в слове названия: длиннее не помещается в строку плитки

const ZWJ = '‍';
const VS16 = '️';
// значки новее Emoji 12.0 (2019): на Windows 10 и Android 10 вместо них пустой квадрат
const TOO_NEW = /[⚧\u{1F979}\u{1F9CC}\u{1F6D6}-\u{1F6DF}\u{1F6FB}-\u{1F6FF}\u{1F7F0}\u{1F90C}\u{1F972}\u{1F977}\u{1F978}\u{1F9A3}\u{1F9A4}\u{1F9AB}-\u{1F9AD}\u{1F9CB}\u{1FA74}-\u{1FA77}\u{1FA7B}-\u{1FA7F}\u{1FA83}-\u{1FA8F}\u{1FA96}-\u{1FAFF}]/u;

/** Значок в полной записи: символам с «текстовым» видом по умолчанию (☀, ⚙, 🌪) дописывается селектор U+FE0F. */
export function normEmoji(text) {
  const points = [...String(text).replaceAll(VS16, '')];
  return points.map((ch) => (/\p{Emoji}/u.test(ch) && !/\p{Emoji_Presentation}/u.test(ch) && !/[\d#*]/.test(ch) ? ch + VS16 : ch)).join('');
}

/** Что не так со значком (или null). */
export function emojiProblem(emoji) {
  const points = [...emoji].filter((ch) => ch !== VS16 && ch !== ZWJ);
  if (!points.length) return 'нет значка';
  if (points.some((ch) => !/\p{Emoji}/u.test(ch) || /[\d#*]/.test(ch))) return 'в значке не только эмодзи';
  if (TOO_NEW.test(emoji)) return 'значок новее Emoji 12.0 — на старых телефонах и Windows 10 будет квадрат';
  if (emoji.includes(ZWJ)) {
    // составные: только давние «мужчина/женщина + занятие», «… + ♂/♀», пиратский флаг, собака-поводырь
    const ok = /^[\u{1F468}\u{1F469}]‍/u.test(emoji) || /‍[♀♂]️$/u.test(emoji)
      || emoji === '🏴‍☠️' || emoji === '🐕‍🦺';
    if (!ok) return 'составной значок, которого может не быть на старых телефонах';
  }
  return null;
}

const files = () => readdirSync(DATA).filter((f) => f.endsWith('.txt')).sort();
const clean = (text) => text.trim().replace(/\s+/g, ' ');

function pairsOf(text, at, errors) {
  const out = [];
  for (const part of text.split('|')) {
    const names = part.split('+').map(clean);
    if (names.length !== 2 || names.some((n) => !n)) {
      errors.push(`${at} — в рецепте «${clean(part)}» должно быть два элемента`);
      continue;
    }
    out.push({ a: names[0], b: names[1], at });
  }
  return out;
}

/** Прочитать списки. → { cats: [{ id, title }], elements: [{ name, emoji, cat, start, gift, pairs, at }], errors }. */
export function readSource() {
  const errors = [];
  const cats = [];
  const elements = [];
  const byName = new Map();          // свёрнутое название → элемент
  const extra = [];                  // «+=» — разбираются, когда известны все элементы
  for (const file of files()) {
    let cat = -1;
    readFileSync(new URL(file, DATA), 'utf8').split(/\r?\n/).forEach((raw, k) => {
      const at = `${file}:${k + 1}`;
      const text = raw.trim();
      if (!text || text.startsWith('//')) return;
      if (text.startsWith('#')) {
        const m = text.match(/^#\s*([a-z]+)\s*:\s*(.+)$/);
        if (!m) return errors.push(`${at} — категория пишется «# ключ: Название»`);
        cat = cats.findIndex((c) => c.id === m[1]);
        if (cat < 0) cat = cats.push({ id: m[1], title: clean(m[2]) }) - 1;
        return undefined;
      }
      const more = text.match(/^(.+?)\s*\+=\s*(.+)$/);
      if (more) return extra.push({ name: clean(more[1]), pairs: pairsOf(more[2], at, errors), at });
      const cut = text.indexOf('=');
      const head = clean(cut < 0 ? text : text.slice(0, cut)).split(' ');
      let start = false;
      let gift = 0;
      const mark = head.at(-1);
      if (mark === '*') {
        start = true;
        head.pop();
      } else if (/^@\d+$/.test(mark)) {
        gift = Number(mark.slice(1));
        head.pop();
      }
      const emoji = normEmoji(head.pop() ?? '');
      const name = head.join(' ');
      if (cat < 0) return errors.push(`${at} — элемент до первой категории`);
      if (!name) return errors.push(`${at} — нет названия`);
      const bad = emojiProblem(emoji);
      if (bad) errors.push(`${at} — «${name}»: ${bad}`);
      if (!/^[А-Яа-яЁё0-9][А-Яа-яЁё0-9 -]*$/.test(name)) errors.push(`${at} — «${name}»: в названии только русские буквы, цифры, пробел и дефис`);
      if (name.length > MAX_NAME) errors.push(`${at} — «${name}»: название длиннее ${MAX_NAME} букв`);
      if (name.split(/[ -]/).some((w) => w.length > MAX_WORD)) errors.push(`${at} — «${name}»: слово длиннее ${MAX_WORD} букв`);
      if (byName.has(fold(name))) return errors.push(`${at} — «${name}» уже есть (${byName.get(fold(name)).at})`);
      const pairs = cut < 0 ? [] : pairsOf(text.slice(cut + 1), at, errors);
      if ((start || gift) && pairs.length) errors.push(`${at} — «${name}»: стартовому элементу и дару рецепт не нужен`);
      const element = { name, emoji, cat, start, gift, pairs, at };
      elements.push(element);
      byName.set(fold(name), element);
      return undefined;
    });
  }
  for (const e of extra) {
    const element = byName.get(fold(e.name));
    if (!element) errors.push(`${e.at} — «${e.name} +=»: такого элемента нет`);
    else element.pairs.push(...e.pairs);
  }
  return { cats, elements, byName, errors };
}

/** Номера элементов: прежние — из ids.json, новым — следующие по порядку. */
export function assignIds(elements, saved) {
  const ids = { ...(saved?.ids ?? {}) };
  let next = Math.max(saved?.next ?? 1, 1, ...Object.values(ids).map((v) => v + 1));
  const used = new Set();
  for (const e of elements) {
    if (!(e.name in ids)) ids[e.name] = next++;
    e.id = ids[e.name];
    used.add(e.name);
  }
  const retired = Object.keys(ids).filter((name) => !used.has(name));
  return { ids, next, retired };
}

/** Собрать базу. → { data, ids, errors, source }. */
export function build({ saved = readIds() } = {}) {
  const source = readSource();
  const errors = [...source.errors];
  const { ids, next, retired } = assignIds(source.elements, saved);
  if (next > PAIR) errors.push(`номеров элементов больше ${PAIR - 1} — не помещаются в ключ пары`);
  const recipes = [];
  const seen = new Map();            // ключ пары → рецепт
  for (const e of source.elements) {
    if (!e.start && !e.gift && !e.pairs.length) errors.push(`${e.at} — «${e.name}»: нет рецепта`);
    for (const p of e.pairs) {
      const a = source.byName.get(fold(p.a));
      const b = source.byName.get(fold(p.b));
      if (!a || !b) {
        errors.push(`${p.at} — «${e.name}»: нет элемента «${!a ? p.a : p.b}»`);
        continue;
      }
      if (a === e || b === e) {
        errors.push(`${p.at} — «${e.name}» получается из самого себя`);
        continue;
      }
      const key = pairKey(a.id, b.id);
      const was = seen.get(key);
      if (was) {
        if (was.c !== e) errors.push(`${p.at} — «${a.name} + ${b.name}» даёт и «${e.name}», и «${was.c.name}» (${was.at})`);
        continue;                    // та же пара у того же элемента дважды — просто повтор
      }
      seen.set(key, { c: e, at: p.at });
      recipes.push([a.id, b.id, e.id]);
    }
  }
  const data = {
    cats: source.cats.map((c) => [c.id, c.title]),
    items: source.elements.map((e) => [e.id, e.name, e.emoji, e.cat]).sort((x, y) => x[0] - y[0]),
    start: source.elements.filter((e) => e.start).map((e) => e.id),
    gifts: source.elements.filter((e) => e.gift).map((e) => [e.id, e.gift]),
    recipes,
  };
  let db = null;
  try {
    db = indexData(data);
    errors.push(...dataProblems(db));
    if (RANKS.at(-1).at > db.total) errors.push(`последнее звание — за ${RANKS.at(-1).at} элементов, а в базе их ${db.total}`);
  } catch (err) {
    errors.push(String(err.message ?? err));
  }
  return { data, db, ids: { next, ids }, retired, errors, source };
}

function readIds() {
  try {
    return JSON.parse(readFileSync(IDS, 'utf8'));
  } catch {
    return null;
  }
}

/** База строками: элемент и рецепт — по строке (так правки видны в истории). */
export function serialize(data) {
  const rows = (list) => list.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return `{\n  "cats": ${JSON.stringify(data.cats)},\n  "start": ${JSON.stringify(data.start)},\n  "gifts": ${JSON.stringify(data.gifts)},\n`
    + `  "items": [\n${rows(data.items)}\n  ],\n  "recipes": [\n${rows(data.recipes)}\n  ]\n}\n`;
}

const serializeIds = (ids) => `${JSON.stringify({ next: ids.next, ids: ids.ids }, null, 1)}\n`;

function summary({ data, db, retired, source }, list) {
  const lines = [];
  lines.push(`элементов: ${data.items.length}, рецептов: ${data.recipes.length} (в среднем ${(data.recipes.length / data.items.length).toFixed(2)} на элемент)`);
  if (!db) return lines.join('\n');
  lines.push(source.cats.map((c, k) => `${c.title}: ${db.cats[k].total}`).join(' · '));
  const { granted } = unlockAll(db);
  for (const g of granted) lines.push(`дар «${db.items.get(g.id).name}» — при ${g.at} открытых (без него набирается ${g.had})`);
  const tiers = new Map();
  for (const it of db.items.values()) tiers.set(it.tier, (tiers.get(it.tier) ?? 0) + 1);
  lines.push(`слои: ${[...tiers].sort((x, y) => x[0] - y[0]).map(([t, n]) => `${t}: ${n}`).join(', ')}`);
  const dead = [...db.items.values()].filter((it) => !it.uses.length);
  lines.push(`тупиковых (ни с чем не смешиваются): ${dead.length}`);
  if (retired.length) lines.push(`в ids.json остались убранные: ${retired.join(', ')}`);
  if (list) {
    lines.push('', `тупиковые: ${dead.map((it) => it.name).join(', ')}`);
    const one = [...db.items.values()].filter((it) => it.makes.length === 1 && !it.gift);
    lines.push('', `с одним рецептом (${one.length}): ${one.map((it) => it.name).join(', ')}`);
    const byEmoji = new Map();
    for (const it of db.items.values()) byEmoji.set(it.emoji, [...(byEmoji.get(it.emoji) ?? []), it.name]);
    const same = [...byEmoji].filter(([, names]) => names.length > 1);
    lines.push('', `одинаковые значки (${same.length}):`, ...same.map(([emoji, names]) => `  ${emoji} ${names.join(', ')}`));
    const top = [...db.items.values()].sort((x, y) => y.uses.length - x.uses.length).slice(0, 25);
    lines.push('', `чаще всего в рецептах: ${top.map((it) => `${it.name} ${it.uses.length}`).join(', ')}`);
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dry = process.argv.includes('--dry');
  const list = process.argv.includes('--list');
  const result = build();
  console.log(summary(result, list));
  if (result.errors.length) {
    console.error(`\nошибок: ${result.errors.length}\n${result.errors.join('\n')}`);
    process.exit(1);
  }
  if (!dry) {
    writeFileSync(OUT, serialize(result.data));
    writeFileSync(IDS, serializeIds(result.ids));
    console.log('\nзаписано: games/alchemy/data.json, tools/alchemy-data/ids.json');
  }
}
