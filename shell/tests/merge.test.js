// Слияние прогресса по ключам (бета 'sync-merge', server/merge.js): свойства слияния, правила ключей, откат уровня
// «Петли», счётчики и расходуемое по устройствам, переход без удвоения, правка панели. И главное для игр: слитое
// значение проходит собственную проверку каждой игры (иначе игра молча выбросила бы весь прогресс).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RULES, ruleFor, kindAt, mergeEntry, sameEntry, absorb, legacyEntry, loadDoc, saveDoc, applyPush, applyAdmin,
  entriesSince, cleanEntry, same, fingerprint,
} from '../../server/merge.js';
import { games } from '../registry.js';

const A = 'aaaaaaaa-0001';
const B = 'bbbbbbbb-0002';
const C = 'cccccccc-0003';

// детерминированный генератор, чтобы падение повторялось
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 2 ** 32;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, list) => list[Math.floor(r() * list.length)];

const eq = (a, b) => sameEntry(a, b) && a.t === b.t;

// ---------- правила ----------

test('правила: каждое разбирается, игры в правилах существуют', () => {
  const ids = new Set(games.map((g) => g.id));
  for (const [pattern] of RULES) {
    ruleFor(pattern.replace(/\*$/, 'x'));                       // не бросает — правило понятно
    const m = pattern.match(/^game:([^:]+):/);
    if (m) assert.ok(ids.has(m[1]), `в правилах незнакомая игра: ${pattern}`);
  }
  assert.equal(kindAt('shell:stats:2048:4', 'played'), 'count');
  assert.equal(kindAt('shell:stats:spider', 'best'), null, 'у Паука рекорд от записанного позже');
  assert.equal(kindAt('game:wordle:stats', 'ru.dist.5'), 'count');
  assert.equal(kindAt('game:words:progress', 'hints'), 'spend');
  assert.equal(ruleFor('game:loop:current').type, 'level');
  assert.equal(ruleFor('game:chess:current').type, 'lww', 'начатая партия — целиком от записанного позже');
  assert.equal(ruleFor('shell:saves:chess').type, 'lww');
});

// ---------- свойства ----------

/**
 * Случайная запись ключа: значение согласовано со счётчиками (как всегда бывает после absorb). times — откуда брать
 * время записи: одинаковое время (на сервере не бывает — его ставит сервер) проверяется только на коммутативность.
 */
function randomEntry(r, key, make, times = null) {
  const base = legacyEntry(key, make(r, 0), int(r, 0, 3), 0);
  let entry = base;
  for (const dev of [A, B, C]) {
    if (r() < 0.5) continue;
    entry = absorb(key, entry, make(r, int(r, 1, 6)), dev);
  }
  entry.t = times ? times.pop() : int(r, 0, 6);
  entry.e = r() < 0.15 ? 1 : 0;
  if (r() < 0.1) {
    delete entry.v;
    entry.del = true;
  }
  // значение приводим к счётчикам: такая запись и лежит на сервере
  return mergeEntry(key, entry, { ...entry });
}

const MAKERS = {
  'game:loop:current': (r) => ({ v: 1, level: int(r, 30, 62), moves: int(r, 0, 9) }),
  'game:chess:current': (r) => ({ v: 1, moves: ['e2e4', 'e7e5'].slice(0, int(r, 0, 2)), hints: int(r, 0, 3) }),
  'shell:stats:chess': (r, k) => ({ played: 10 + k * 2, wins: 4 + k, best: r() < 0.3 ? null : int(r, 1, 900) }),
  'game:wordle:stats': (r, k) => ({
    [pick(r, ['en', 'ru', 'ua'])]: {
      played: 5 + k, wins: 3 + k, streak: int(r, 0, 4), maxStreak: int(r, 0, 9), dist: [0, 1, k, 2, 0, int(r, 0, 3)],
    },
    ru: { played: 2, wins: 1, streak: 0, maxStreak: 1, dist: [0, 0, 1, 0, 0, 0] },
  }),
  'game:words:progress': (r, k) => ({
    v: 1, current: int(r, 0, 20), passedCount: int(r, 0, 5), hints: Math.max(0, 5 + int(r, -3, 4)),
    levels: { [String(int(r, 0, 3))]: { found: [pick(r, ['кот', 'ток', 'рот', 'торт'])], hinted: { торт: int(r, 0, 3) } } },
    ...(k ? {} : {}),
  }),
  'shell:player:visits': (r) => Array.from({ length: int(r, 0, 5) }, () => `2026-09-${String(int(r, 1, 29)).padStart(2, '0')}`),
  'game:match3:progress': (r) => ({
    v: 2, done: Array.from({ length: 6 }, () => (r() < 0.5 ? 1 : 0)),
    boosters: { hammer: int(r, 0, 5), row: int(r, 0, 5), shuffle: int(r, 0, 5), moves: int(r, 0, 3) },
  }),
  'game:spider:stats': (r, k) => ({
    1: { played: 3 + k, wins: 1 + k, bestTime: r() < 0.3 ? 0 : int(r, 60, 900), fewestMoves: r() < 0.3 ? 0 : int(r, 90, 400), streak: int(r, 0, 3), bestStreak: int(r, 0, 5) },
  }),
};

test('слияние коммутативно и идемпотентно: merge(a,b) = merge(b,a), merge(a,a) = a (случайные записи всех видов правил)', () => {
  const r = rng(20260929);
  for (const [key, make] of Object.entries(MAKERS)) {
    for (let i = 0; i < 400; i += 1) {
      const a = randomEntry(r, key, make);
      const b = randomEntry(r, key, make);
      const ab = mergeEntry(key, a, b);
      assert.ok(eq(ab, mergeEntry(key, b, a)), `${key}: merge(a,b) ≠ merge(b,a)`);
      assert.ok(eq(mergeEntry(key, a, a), a), `${key}: merge(a,a) ≠ a`);
      assert.ok(eq(mergeEntry(key, ab, ab), ab), `${key}: итог слияния с собой меняется`);
    }
  }
});

/**
 * Накопленное в записи: счётчики по устройствам и поля с правилами (рекорды, множества, числа счётчиков), а у ключей
 * «целиком» — всё значение. Прочие поля внутри статистики (серии) берутся «от записанного позже» и при трёх
 * одновременных сохранениях могут зависеть от порядка их прихода — итог всё равно один на всех: его решает сервер.
 */
function accumulated(key, entry) {
  if (ruleFor(key).type !== 'fields') return entry;
  const pick = (node, path) => {
    const kind = kindAt(key, path);
    if (kind === 'union' && Array.isArray(node)) return [...node].map((x) => JSON.stringify(x)).sort();   // множество
    if (kind) return node;
    if (node === null || typeof node !== 'object') return undefined;
    const out = {};
    for (const k of Object.keys(node)) {
      const x = pick(node[k], [...path, k]);
      if (x !== undefined) out[k] = x;
    }
    return out;
  };
  return { t: entry.t, e: entry.e, f: entry.f, del: entry.del, v: pick(entry.v, []) };
}
const eqAcc = (key, a, b) => a.t === b.t && same(accumulated(key, a), accumulated(key, b));

test('слияние ассоциативно: порядок, в котором сервер получил сохранения, не меняет накопленное', () => {
  const r = rng(29092026);
  for (const [key, make] of Object.entries(MAKERS)) {
    for (let i = 0; i < 400; i += 1) {
      const times = [int(r, 0, 9) * 3, int(r, 0, 9) * 3 + 1, int(r, 0, 9) * 3 + 2].sort(() => r() - 0.5);
      const [a, b, c] = [randomEntry(r, key, make, times), randomEntry(r, key, make, times), randomEntry(r, key, make, times)];
      const left = mergeEntry(key, mergeEntry(key, a, b), c);
      assert.ok(eqAcc(key, left, mergeEntry(key, a, mergeEntry(key, b, c))), `${key}: (a·b)·c ≠ a·(b·c)`);
      assert.ok(eqAcc(key, left, mergeEntry(key, mergeEntry(key, c, a), b)), `${key}: (c·a)·b ≠ (a·b)·c`);
      assert.ok(eqAcc(key, mergeEntry(key, left, a), left), `${key}: повтор уже слитого меняет итог`);
    }
  }
});

// ---------- «Петля»: 60 → 35 ----------

/** Все перестановки. */
function* permutations(list) {
  if (list.length <= 1) {
    yield list;
    return;
  }
  for (let i = 0; i < list.length; i += 1) {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
  }
}

test('«Петля»: уровень не опускается ни в каком порядке сохранений (ПК на 60-м, телефон застрял на 35-м)', () => {
  const key = 'game:loop:current';
  const saves = [
    { device: B, level: 35, moves: 4 },            // телефон: ход на старом уровне
    { device: A, level: 36, moves: 0 },
    { device: A, level: 60, moves: 0 },            // ПК ушёл далеко
    { device: B, level: 35, moves: 9 },            // телефон ещё раз, по-прежнему 35
    { device: A, level: 61, moves: 2 },
  ];
  for (const order of permutations(saves)) {
    let doc = loadDoc({ [key]: { v: 1, level: 35, moves: 0 } }, null, 1000);
    let top = 35;
    let stamp = 2000;
    for (const save of order) {
      // эпоху устройство знает от сервера (1000 — прогресс перешёл на слияние в 1000)
      doc = applyPush(doc, { device: save.device, seq: stamp, keys: { [key]: { v: { v: 1, level: save.level, moves: save.moves }, e: 1000 } } }, stamp += 10).doc;
      const level = doc.k[key].v.level;
      assert.ok(level >= top, `уровень опустился: ${top} → ${level} (порядок ${order.map((s) => s.level)})`);
      top = level;
    }
    assert.equal(top, 61);
  }
});

// ---------- счётчики и расходуемое ----------

test('два устройства без связи: по 3 партии и по 2 подсказки на каждом → +6 партий и −4 подсказки', () => {
  let doc = loadDoc({
    'shell:stats:sudoku': { played: 10, wins: 5, best: null },
    'game:words:progress': { v: 1, levels: {}, current: 0, hints: 9, passedCount: 0 },
  }, null, 1000);
  // оба устройства знают прогресс сервера (перешли на слияние) — записи у них те же
  const known = Object.fromEntries(Object.entries(entriesSince(doc, 0)).map(([k, raw]) => [k, cleanEntry(k, raw)]));
  const play = (dev) => ({
    'shell:stats:sudoku': absorb('shell:stats:sudoku', known['shell:stats:sudoku'], { played: 13, wins: 6, best: null }, dev),
    'game:words:progress': absorb('game:words:progress', known['game:words:progress'], { v: 1, levels: {}, current: 0, hints: 7, passedCount: 0 }, dev),
  });
  const wire = (entries) => Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, { v: e.v, f: e.f, e: e.e }]));
  const fromA = play(A);
  const fromB = play(B);
  for (const order of [[A, fromA, B, fromB], [B, fromB, A, fromA]]) {
    let d = doc;
    d = applyPush(d, { device: order[0], seq: 1, keys: wire(order[1]) }, 2000).doc;
    d = applyPush(d, { device: order[2], seq: 1, keys: wire(order[3]) }, 2010).doc;
    // и повтор той же отправки (ответ не дошёл) — ничего не удваивает
    d = applyPush(d, { device: order[0], seq: 2, keys: wire(order[1]) }, 2020).doc;
    assert.equal(d.k['shell:stats:sudoku'].v.played, 16);
    assert.equal(d.k['shell:stats:sudoku'].v.wins, 7);
    assert.equal(d.k['game:words:progress'].v.hints, 5);
  }
});

test('расходуемое не уходит в минус; начисленное и потраченное считаются по устройствам', () => {
  const key = 'game:memory:boosters';
  const base = legacyEntry(key, { peek: 2, magnet: 1 }, 1, 1);
  const a = { ...absorb(key, base, { peek: 0, magnet: 1 }, A), t: 5 };      // A потратил 2
  const b = { ...absorb(key, base, { peek: 0, magnet: 3 }, B), t: 6 };      // B потратил 2 и получил 2 магнита
  const m = mergeEntry(key, a, b);
  assert.equal(m.v.peek, 0, '2 − 2 − 2 → не меньше нуля');
  assert.equal(m.v.magnet, 3);
});

// ---------- переход на слияние ----------

test('переход на слияние: счётчики двух устройств не удваиваются', () => {
  const key = 'shell:stats:flags';
  const old = { [key]: { played: 10, wins: 4, best: 7 } };
  // сервер ещё со старым прогрессом (без записей по устройствам), последний обмен — в 1000
  let doc = loadDoc(old, null, 1000);
  // устройство A — как на сервере (не сыграло ничего), B — сыграло 2 партии без связи
  doc = applyPush(doc, { device: A, seq: 1, migrate: { oldBase: 1000 }, keys: { [key]: { v: { played: 10, wins: 4, best: 7 } } } }, 2000).doc;
  doc = applyPush(doc, { device: B, seq: 1, migrate: { oldBase: 1000 }, keys: { [key]: { v: { played: 12, wins: 5, best: 9 } } } }, 2010).doc;
  assert.deepEqual(doc.k[key].v, { played: 12, wins: 5, best: 9 }, 'перенесено по максимуму — без удвоения');
  // A потом сыграл ещё 3
  const known = cleanEntry(key, entriesSince(doc, 0)[key]);
  doc = applyPush(doc, { device: A, seq: 2, keys: { [key]: absorb(key, known, { played: 15, wins: 5, best: 9 }, A) } }, 2020).doc;
  assert.equal(doc.k[key].v.played, 15);
  // третье устройство переходит позже, его прогресс взят у сервера уже после перехода (старым клиентом) и
  // оно сыграло ещё одну: засчитывается только прибавка сверх итога
  doc = applyPush(doc, { device: C, seq: 1, migrate: { oldBase: 2020 }, keys: { [key]: { v: { played: 16, wins: 5, best: 9 } } } }, 2030).doc;
  assert.equal(doc.k[key].v.played, 16);
  // и оно же со старым (тем же, что на сервере) — ничего не добавляется
  doc = applyPush(doc, { device: C, seq: 2, migrate: { oldBase: 2020 }, keys: { [key]: { v: { played: 16, wins: 5, best: 9 } } } }, 2040).doc;
  assert.equal(doc.k[key].v.played, 16);
});

test('переход: расходуемое — текущий баланс становится стартовым, без удвоения', () => {
  const key = 'game:match3:progress';
  const value = (hammer) => ({ v: 2, done: [1, 1, 0], boosters: { hammer, row: 2, shuffle: 2, moves: 1 } });
  let doc = loadDoc({ [key]: value(6) }, null, 1000);
  doc = applyPush(doc, { device: A, seq: 1, migrate: { oldBase: 1000 }, keys: { [key]: { v: value(6) } } }, 2000).doc;
  doc = applyPush(doc, { device: B, seq: 1, migrate: { oldBase: 1000 }, keys: { [key]: { v: value(6) } } }, 2010).doc;
  assert.equal(doc.k[key].v.boosters.hammer, 6);
});

test('переход: изменённое на устройстве после прошлого обмена побеждает, изменённое на сервере позже — тоже', () => {
  let doc = loadDoc({ 'game:2048:settings': { size: 4, skin: 'telegram' }, 'game:chess:setup': { level: 3 } }, null, 1000);
  // другое устройство уже поменяло шахматы после 1000
  doc = applyPush(doc, { device: A, seq: 1, keys: { 'game:chess:setup': { v: { level: 5 }, e: 1000 } } }, 1500).doc;
  // B был в обмене в 1000, без связи сменил скин 2048 и (по старой памяти) шахматы
  doc = applyPush(doc, {
    device: B, seq: 1, migrate: { oldBase: 1000 },
    keys: { 'game:2048:settings': { v: { size: 4, skin: 'neon' } }, 'game:chess:setup': { v: { level: 3 } } },
  }, 2000).doc;
  assert.equal(doc.k['game:2048:settings'].v.skin, 'neon', 'его изменение');
  assert.equal(doc.k['game:chess:setup'].v.level, 5, 'сервер менялся позже — сервер');
});

// ---------- повтор и правка панели ----------

test('повтор отправки, ответ на которую не дошёл, не перебивает то, что позже записало другое устройство', () => {
  const key = 'game:2048:settings';
  let doc = loadDoc({}, null, 0);
  doc = applyPush(doc, { device: A, seq: 7, keys: { [key]: { v: { size: 4, skin: 'neon' }, s: 7 } } }, 1000).doc;
  doc = applyPush(doc, { device: B, seq: 1, keys: { [key]: { v: { size: 5, skin: 'candy' }, s: 1 } } }, 2000).doc;
  const again = applyPush(doc, { device: A, seq: 8, keys: { [key]: { v: { size: 4, skin: 'neon' }, s: 7 } } }, 3000);
  assert.equal(again.doc.k[key].v.skin, 'candy');
  assert.equal(again.doc.acks[A], 8);
});

test('правка в панели: новая эпоха — счётчики устройств из старой не возвращают правленое', () => {
  const key = 'game:words:progress';
  const value = (hints) => ({ v: 1, levels: {}, current: 0, hints, passedCount: 0 });
  let doc = loadDoc({ [key]: value(9) }, null, 1000);
  const old = cleanEntry(key, entriesSince(doc, 0)[key]);
  doc = applyAdmin(doc, { [key]: value(1) }, 5000);          // владелец поставил 1
  // устройство ещё не знает о правке: тратит подсказку из «своих» 9
  const stale = absorb(key, old, value(8), A);
  doc = applyPush(doc, { device: A, seq: 1, keys: { [key]: { v: stale.v, f: stale.f, e: stale.e } } }, 6000).doc;
  assert.equal(doc.k[key].v.hints, 1, 'правка устояла');
  // узнав о правке, устройство тратит из 1
  const fresh = cleanEntry(key, entriesSince(doc, 0)[key]);
  const spent = absorb(key, fresh, value(0), A);
  doc = applyPush(doc, { device: A, seq: 2, keys: { [key]: { v: spent.v, f: spent.f, e: spent.e } } }, 7000).doc;
  assert.equal(doc.k[key].v.hints, 0);
});

test('удаление: начатая партия удаляется по времени, накопленное удалением не стирается', () => {
  let doc = loadDoc({ 'game:chess:current': { v: 1, moves: ['e2e4'] }, 'shell:stats:chess': { played: 3, wins: 1, best: null } }, null, 1000);
  doc = applyPush(doc, { device: A, seq: 1, keys: { 'game:chess:current': { del: 1, e: 1000 }, 'shell:stats:chess': { del: 1, e: 1000 } } }, 2000).doc;
  assert.ok(doc.k['game:chess:current'].del, 'партия закончена на A — её нет');
  assert.equal(doc.k['shell:stats:chess'].v.played, 3, 'статистику удаление не стирает');
  const saved = saveDoc(doc);
  assert.ok(!('game:chess:current' in saved.data));
  assert.equal(saved.meta.k['game:chess:current'].del, 1);
});

// ---------- слитое проходит проверки игр ----------

/**
 * Для каждого ключа со слиянием по полям: база — пустая статистика игры, два устройства меняют её «как игра»
 * (счётчики растут, рекорды лучше, расходуемое туда-сюда, новые варианты и строки), обе версии игра принимает.
 * Слитое должно приниматься тоже, а счётчики — быть суммой прибавок.
 */
async function cases() {
  const mod = (id, file = 'logic.js') => import(`../../games/${id}/${file}`);
  const words = await mod('words');
  const levels = Array.from({ length: 100 });
  const buckets = (m, keys) => {
    const out = {};
    for (const k of keys) out[k] = m.emptyStats();
    return out;
  };
  const everyBucket = (m) => (v) => Object.values(v).every((s) => m.isValidStats(s));
  const g = {};
  for (const id of ['flags', 'checkers', 'flappy-burger', 'bongo-cat', 'snake', 'memory', 'bubble-shooter', 'brick-blast',
    'loop', 'connect-dots', 'mahjong', '2048', 'boggle', 'block-blast', 'sudoku', 'tictactoe', 'wordle', 'chess', 'spider', 'klondike',
    'minesweeper', 'fifteen', 'rubik', 'hanoi', 'repair', 'arkanoid', 'erudit']) {
    g[id] = await mod(id);
  }
  const pinball = await mod('pinball', 'rules.js');
  return [
    ['game:words:progress', words.newProgress(), (v) => words.isValidProgress(v, levels)],
    ['game:flags:stats', g.flags.emptyStats(), g.flags.isValidStats],
    ['game:checkers:stats', g.checkers.emptyStats(), g.checkers.isValidStats],
    ['game:flappy-burger:stats', g['flappy-burger'].emptyStats(), g['flappy-burger'].isValidStats],
    ['game:bongo-cat:stats', g['bongo-cat'].emptyStats(), g['bongo-cat'].isValidStats],
    ['game:snake:stats', { ...g.snake.emptyStats() }, g.snake.isValidStats],
    ['game:memory:stats', g.memory.emptyStats(), g.memory.isValidStats],
    ['game:bubble-shooter:stats', g['bubble-shooter'].emptyStats(), g['bubble-shooter'].isValidStats],
    ['game:brick-blast:stats', g['brick-blast'].emptyStats(), g['brick-blast'].isValidStats],
    ['game:arkanoid:stats', g.arkanoid.emptyStats(), g.arkanoid.isValidStats],
    ['game:erudit:stats', g.erudit.emptyStats(), g.erudit.isValidStats],
    ['game:loop:stats', g.loop.emptyStats(), g.loop.isValidStats],
    ['game:connect-dots:stats', g['connect-dots'].emptyStats(), g['connect-dots'].isValidStats],
    ['game:mahjong:stats', buckets(g.mahjong, ['kid', 'butterfly', 'turtle']), everyBucket(g.mahjong)],
    ['game:2048:stats', buckets(g['2048'], ['3', '4', '5', '6']), everyBucket(g['2048'])],
    ['game:boggle:stats', buckets(g.boggle, ['5', '6', '7', '8']), everyBucket(g.boggle)],
    ['game:block-blast:stats', g['block-blast'].emptyStats(), g['block-blast'].isValidStats],
    ['game:sudoku:stats', buckets(g.sudoku, ['easy', 'medium', 'hard', 'expert']), everyBucket(g.sudoku)],
    ['game:tictactoe:stats', g.tictactoe.emptyStats(), g.tictactoe.isValidStats],
    ['game:wordle:stats', buckets(g.wordle, ['en', 'ua', 'ru']), everyBucket(g.wordle)],
    ['game:chess:stats', g.chess.emptyStats(), g.chess.isValidStats],
    ['game:spider:stats', g.spider.emptyStats(), g.spider.isValidStats],
    ['game:klondike:stats', g.klondike.emptyStats(), g.klondike.isValidStats],
    ['game:pinball:stats', pinball.emptyStats(), pinball.isValidStats],
    ['game:minesweeper:stats', g.minesweeper.emptyStats(), g.minesweeper.isValidStats],
    ['game:fifteen:stats', g.fifteen.emptyStats(), g.fifteen.isValidStats],
    ['game:rubik:stats', g.rubik.emptyStats(), g.rubik.isValidStats],
    ['game:hanoi:stats', g.hanoi.emptyStats(), g.hanoi.isValidStats],
    ['game:repair:progress', { level: 5, stars: 11, perfect: 2, sparks: 1, money: 2300, earned: 4100, stock: { 'phone-display': 1, 'deck-fan': 2 } }, g.repair.isValidProgress],
    ['game:match3:progress', { v: 2, done: Array(100).fill(0), boosters: { hammer: 3, row: 2, shuffle: 2, moves: 1 } },
      (v) => v.v === 2 && v.done.length === 100 && v.done.every((x) => x === 0 || x === 1)
        && ['hammer', 'row', 'shuffle', 'moves'].every((k) => Number.isInteger(v.boosters[k]) && v.boosters[k] >= 0)],
    ['game:memory:boosters', { peek: 2, magnet: 2 }, (v) => Number.isInteger(v.peek) && Number.isInteger(v.magnet) && v.peek >= 0 && v.magnet >= 0],
    ['game:snake:levels', { level: 3, best: 2 }, (v) => Number.isInteger(v.level) && v.level >= 1 && Number.isInteger(v.best)],
    ['shell:stats:chess', { played: 0, wins: 0, best: null }, (v) => Number.isInteger(v.played) && Number.isInteger(v.wins)],
  ];
}

/** Изменить значение «как игра» на одном устройстве. */
function playOn(r, key, value) {
  const v = structuredClone(value);
  const walk = (node, path) => {
    if (Array.isArray(node) || (node && typeof node === 'object')) {
      for (const k of Object.keys(node)) {
        const kind = kindAt(key, [...path, k]);
        const x = node[k];
        if (kind === 'count' && typeof x === 'number') node[k] = x + int(r, 0, 4);
        else if (kind === 'spend' && typeof x === 'number') node[k] = Math.max(0, x + int(r, -2, 3));
        else if (kind === 'max' && typeof x === 'number') node[k] = key === 'game:match3:progress' ? x : x + int(r, 0, 3);
        else if (kind === 'max' && x === null) node[k] = int(r, 1, 50);
        else if (kind === 'min') node[k] = typeof x === 'number' && x > 0 ? Math.max(1, x - int(r, 0, 2)) : (r() < 0.5 ? int(r, 5, 99) : x);
        else if (x && typeof x === 'object') walk(x, [...path, k]);
      }
    }
  };
  walk(v, []);
  // новое — как у игр: страна с ошибкой, инструмент, вариант змейки, уровень «Слов», поле «Своей игры» Мемори
  const add = (map, k, n) => { map[k] = (map[k] ?? 0) + n; };
  if (key === 'game:flags:stats') add(v.misses, pick(r, ['ru', 'fr', 'td']), int(r, 1, 3));
  if (key === 'game:bongo-cat:stats') add(v.by, pick(r, ['bongo', 'keyboard', 'meow']), int(r, 1, 50));
  if (key === 'game:snake:stats') {
    const k = pick(r, ['snake:medium:classic', 'rabbit:large:walls']);
    v.best[k] = Math.max(v.best[k] ?? 0, int(r, 1, 300));
  }
  if (key === 'game:memory:stats') {
    const k = pick(r, ['4x5:2', '6x6:3']);
    const was = v.free[k] ?? { played: 0, bestMoves: null };
    const moves = int(r, 10, 40);
    v.free[k] = { played: was.played + 1, bestMoves: was.bestMoves === null ? moves : Math.min(was.bestMoves, moves) };
  }
  if (key === 'game:words:progress') {
    const lvl = String(int(r, 0, 5));
    v.levels[lvl] ??= { found: [], hinted: {} };
    v.levels[lvl].found.push(pick(r, ['кот', 'ток', 'рот', 'торт', 'сор']));
    v.levels[lvl].hinted.торт = int(r, 0, 3);
    v.current = int(r, 0, 5);
  }
  if (key === 'game:match3:progress') v.done[int(r, 0, 20)] = 1;
  return v;
}

test('слитое значение принимает сама игра (все ключи со слиянием по полям), счётчики — сумма прибавок', async () => {
  const r = rng(7);
  for (const [key, empty, valid] of await cases()) {
    assert.ok(valid(empty), `${key}: пустое значение игра не принимает — тест устарел`);
    for (let i = 0; i < 40; i += 1) {
      const base = playOn(r, key, empty);
      const baseEntry = legacyEntry(key, base, 1, 1);
      const va = playOn(r, key, base);
      const vb = playOn(r, key, base);
      assert.ok(valid(va) && valid(vb), `${key}: тест сделал недопустимое значение`);
      const a = { ...absorb(key, baseEntry, va, A), t: 10 };
      const b = { ...absorb(key, baseEntry, vb, B), t: 11 };
      const merged = mergeEntry(key, a, b);
      assert.ok(valid(merged.v), `${key}: слитое игра не примет: ${JSON.stringify(merged.v)}`);
      // счётчики: база + прибавка A + прибавка B
      const check = (node, pa, pb, pbase, path) => {
        if (node && typeof node === 'object') {
          for (const k of Object.keys(node)) check(node[k], pa?.[k], pb?.[k], pbase?.[k], [...path, k]);
          return;
        }
        if (kindAt(key, path) !== 'count' || typeof pbase !== 'number') return;
        const want = (pa ?? pbase) + (pb ?? pbase) - pbase;
        assert.ok(Math.abs(node - want) < 1e-9, `${key}.${path.join('.')}: ${node} вместо ${want}`);
      };
      check(merged.v, va, vb, base, []);
      assert.ok(same(mergeEntry(key, merged, merged).v, merged.v));
    }
  }
});

// ---------- явный сброс, эпохи ----------

test('явный сброс (storage.reset): записанное раньше — на любом устройстве — при слиянии не учитывается', () => {
  const key = 'shell:stats:flags';
  let doc = loadDoc({ [key]: { played: 10, wins: 4, best: 9 } }, null, 1000);
  const known = cleanEntry(key, entriesSince(doc, 0)[key]);
  // устройство B без связи сыграло ещё 2 (рекорд 12) — его данные из старой эпохи
  const stale = absorb(key, known, { played: 12, wins: 5, best: 12 }, B);
  // A сбрасывает статистику
  doc = applyPush(doc, { device: A, seq: 1, keys: { [key]: { v: { played: 0, wins: 0, best: null }, e: known.e, r: 1 } } }, 2000).doc;
  // B приходит со своими старыми данными
  doc = applyPush(doc, { device: B, seq: 1, keys: { [key]: { v: stale.v, f: stale.f, e: stale.e } } }, 3000).doc;
  assert.deepEqual(doc.k[key].v, { played: 0, wins: 0, best: null }, 'сброс устоял: ни рекорд, ни партии B не вернулись');
  // после сброса B узнал новую эпоху — его новые партии считаются
  const fresh = cleanEntry(key, entriesSince(doc, 0)[key]);
  const after = absorb(key, fresh, { played: 1, wins: 1, best: 3 }, B);
  doc = applyPush(doc, { device: B, seq: 2, keys: { [key]: { v: after.v, f: after.f, e: after.e } } }, 4000).doc;
  assert.deepEqual(doc.k[key].v, { played: 1, wins: 1, best: 3 });
});

test('правка в панели уровня «Петли» вниз не отменяется большим уровнем со старого устройства', () => {
  const key = 'game:loop:current';
  let doc = loadDoc({ [key]: { v: 1, level: 60 } }, null, 1000);
  doc = applyAdmin(doc, { [key]: { v: 1, level: 10 } }, 5000);
  doc = applyPush(doc, { device: B, seq: 1, keys: { [key]: { v: { v: 1, level: 61 }, e: 1000 } } }, 6000).doc;
  assert.equal(doc.k[key].v.level, 10);
});

// ---------- Филворд: уровень общий для всех размеров ----------

test('Филворд: партия с большим уровнем побеждает (как «Петля»), при равном — записанная позже', () => {
  const key = 'game:boggle:current';
  let doc = loadDoc({ [key]: { level: 30, size: 8, found: [] } }, null, 1000);
  doc = applyPush(doc, { device: B, seq: 1, keys: { [key]: { v: { level: 12, size: 8, found: [{ word: 'кот' }] }, e: 1000 } } }, 2000).doc;
  assert.equal(doc.k[key].v.level, 30, 'старая партия с другого устройства уровень не откатывает');
  doc = applyPush(doc, { device: A, seq: 1, keys: { [key]: { v: { level: 30, size: 5, found: [] }, e: 1000 } } }, 3000).doc;
  assert.equal(doc.k[key].v.size, 5, 'сменил размер на том же уровне — новое поле');
});

// ---------- Wordle: партии по языкам ----------

test('Wordle: партии языков сливаются по отдельности; старые данные переходят по языку без потерь', () => {
  const key = 'game:wordle:boards';
  const en = { secret: 'crane', guesses: ['slate'] };
  const ru = { secret: 'пятно', guesses: [] };
  // было записано старым обменом одним ключом
  let doc = loadDoc({ [key]: { en, ua: null, ru } }, null, 1000);
  const known = cleanEntry(key, entriesSince(doc, 0)[key]);
  assert.deepEqual(known.c, { en: 1000, ua: 1000, ru: 1000 }, 'у каждой партии — время прежнего ключа');
  // устройство знает, какими партии были на сервере (отпечатки) — как после обмена
  const meta = { ...known, h: { en: fingerprint(en), ua: fingerprint(null), ru: fingerprint(ru) } };
  // телефон ходит в EN, ПК — в RU; каждый шлёт весь объект, но изменённой — только свою часть
  const phone = absorb(key, meta, { en: { ...en, guesses: ['slate', 'crony'] }, ua: null, ru }, A);
  const pc = absorb(key, meta, { en, ua: null, ru: { ...ru, guesses: ['кошка'] } }, B);
  assert.deepEqual(phone.ch, ['en']);
  assert.deepEqual(pc.ch, ['ru']);
  doc = applyPush(doc, { device: A, seq: 1, keys: { [key]: { v: phone.v, ch: phone.ch, e: 1000 } } }, 2000).doc;
  doc = applyPush(doc, { device: B, seq: 1, keys: { [key]: { v: pc.v, ch: pc.ch, e: 1000 } } }, 2010).doc;
  assert.deepEqual(doc.k[key].v, { en: { ...en, guesses: ['slate', 'crony'] }, ua: null, ru: { ...ru, guesses: ['кошка'] } });
  // обе партии одного языка — побеждает записанная позже
  doc = applyPush(doc, { device: A, seq: 2, keys: { [key]: { v: { en: null, ua: null, ru }, ch: ['en'], e: 1000 } } }, 2020).doc;
  assert.equal(doc.k[key].v.en, null, 'EN закончена на телефоне');
  assert.deepEqual(doc.k[key].v.ru.guesses, ['кошка'], 'а RU с ПК не тронута, хотя телефон прислал старую');
});

test('Wordle: слияние частей коммутативно, идемпотентно и ассоциативно', () => {
  const r = rng(314);
  const key = 'game:wordle:boards';
  const make = (t) => {
    const v = {};
    const c = {};
    for (const lang of ['en', 'ua', 'ru']) {
      if (r() < 0.2) continue;
      c[lang] = t * 10 + int(r, 0, 9);
      if (r() < 0.85) v[lang] = r() < 0.3 ? null : { secret: pick(r, ['crane', 'pилот', 'слово']), guesses: ['a'].slice(0, int(r, 0, 1)) };
    }
    return cleanEntry(key, { t: t * 10 + 9, e: 0, v, c });
  };
  for (let i = 0; i < 400; i += 1) {
    const [a, b, c] = [make(int(r, 0, 5)), make(int(r, 0, 5)), make(int(r, 0, 5))];
    const ab = mergeEntry(key, a, b);
    assert.ok(eq(ab, mergeEntry(key, b, a)));
    assert.ok(eq(mergeEntry(key, a, a), a));
    assert.ok(eq(mergeEntry(key, ab, c), mergeEntry(key, a, mergeEntry(key, b, c))));
  }
});
