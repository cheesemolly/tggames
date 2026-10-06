// Слияние прогресса между устройствами по ключам (бета 'sync-merge'). Один файл на сервер и клиент: сервер
// (worker.js, в сборку встраивается целиком) сливает присланное со своей копией, клиент (shell/sync.js)
// превращает свои изменения в записи слияния и так же сливает ответ сервера со своим неотправленным.
//
// Прогресс — это ключи хранилища (snapshot() в platform/storage.js): «game:loop:current» → значение. У каждого ключа
// на сервере есть запись: { v — значение, t — время записи по часам СЕРВЕРА, e — эпоха (правка в панели, переход
// на слияние), f — счётчики по устройствам, del — ключ удалён }. Как сливать значение, решает правило ключа (RULES):
//   lww    — целиком побеждает записанное позже (t); так — по умолчанию (настройки, начатые партии);
//   level  — партия с уровнем внутри («Петля», Филворд): больший уровень, при равном — позже записанное;
//   map    — объект из независимых частей (партии Wordle по языкам): у каждой части своё время, побеждает
//            записанное позже по каждой части отдельно;
//   fields — объект по полям: у поля своё правило, остальное — от записанного позже; вложенные объекты с правилами
//            внутри объединяются (вариант статистики, заведённый на другом устройстве, не пропадает).
// Правила полей:
//   max / min — рекорд (min — «меньше лучше»; 0 и пусто = рекорда нет);
//   union     — множество (массив без повторов);
//   count     — счётчик по устройствам: f = { l: перенесённое при переходе, d: { устройство: сколько } },
//               значение = l + сумма d; каждое устройство увеличивает только своё, при слиянии — максимум;
//   spend     — расходуемое (подсказки, бонусы): f = { s: стартовое, d: { устройство: [начислено, потрачено] } },
//               значение = s + сумма начисленного − сумма потраченного, не меньше 0.
// Эпоха (e): правка в панели и явный сброс (storage.reset) начинают ключ заново; запись из более старой эпохи при
// слиянии не учитывается вовсе — иначе максимум вернул бы сброшенный рекорд, а счётчики другого устройства —
// сброшенную статистику.
// Слияние коммутативно и идемпотентно: merge(a, b) = merge(b, a), merge(a, a) = a (тест shell/tests/merge.test.js).

export const MERGE_PROTOCOL = 3;
export const MAX_DEVICES = 50;           // устройств на одно поле: больше не бывает, а мусор раздувал бы запись
const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;
export const isDeviceId = (id) => typeof id === 'string' && DEVICE_RE.test(id);

// ---------- правила ----------

const COUNT4 = (prefix) => ({
  [`${prefix}played`]: 'count', [`${prefix}wins`]: 'count', [`${prefix}losses`]: 'count', [`${prefix}draws`]: 'count',
});
const CARDS = {
  '*.played': 'count', '*.wins': 'count', '*.bestTime': 'min', '*.fewestMoves': 'min', '*.bestStreak': 'max',
  // '*.streak' — серия: растёт и сбрасывается (спорное, пока — от записанного позже)
};

// Правило ключа: { type: 'level', at: 'level' } | { type: 'map' } | { type: 'fields', fields: { путь: правило } };
// нет правила — lww.
// Путь поля — через точку, '*' — любой ключ объекта или индекс массива, '' — всё значение целиком.
// Правило поля: 'max' | 'min' | 'union' | 'count' | { spend: стартовое } | { union: true, sort: true, keep: N }.
// Ключ — как в snapshot() (без «tggames:»); '*' в конце — любое продолжение. Берётся первое подходящее.
// Карта ключей всех игр с объяснением — в заметках (раздел «Слияние прогресса»).
export const RULES = [
  // ---- оболочка ----
  ['shell:stats:__v', { type: 'fields', fields: { '': 'max' } }],
  // у Паука рекорда нет с 2026-09-28 (очки убраны), migrateStats обнуляет старый: best — от записанного позже,
  // иначе максимум возвращал бы обнулённое
  ['shell:stats:spider', { type: 'fields', fields: { played: 'count', wins: 'count' } }],
  ['shell:stats:spider:*', { type: 'fields', fields: { played: 'count', wins: 'count' } }],
  ['shell:stats:*', { type: 'fields', fields: { played: 'count', wins: 'count', best: 'max' } }],
  ['shell:player:visits', { type: 'fields', fields: { '': { union: true, sort: true, keep: 400 } } }],
  // shell:saves:*, shell:progress:*, shell:player:favs — lww

  // ---- игры ----
  ['game:words:progress', { type: 'fields', fields: {
    'levels.*.found': 'union', 'levels.*.hinted.*': 'max', hints: { spend: 5 }, passedCount: 'max',
  } }],
  ['game:flags:stats', { type: 'fields', fields: {
    games: 'count', answers: 'count', correct: 'count', 'best.test': 'max', 'best.type': 'max', bestStreak: 'max',
    'misses.*': 'count', 'won.*': 'count', 'marathon.*': 'max',
  } }],
  ['game:checkers:stats', { type: 'fields', fields: COUNT4('*.*.') }],
  ['game:flappy-burger:stats', { type: 'fields', fields: { games: 'count', best: 'max', total: 'count', streets: 'count' } }],
  ['game:bongo-cat:stats', { type: 'fields', fields: { hits: 'count', meows: 'count', songs: 'count', 'by.*': 'count' } }],
  ['game:snake:stats', { type: 'fields', fields: {
    games: 'count', 'best.*': 'max', bestLength: 'max', apples: 'count', levelsCleared: 'count', bestLevel: 'max',
  } }],
  ['game:snake:levels', { type: 'fields', fields: { best: 'max' } }],   // level — выбранный уровень, от записанного позже
  ['game:snake:seenPowers', { type: 'fields', fields: { '': 'union' } }],
  ['game:memory:progress', { type: 'fields', fields: { level: 'max' } }],
  ['game:memory:stats', { type: 'fields', fields: {
    levelsCleared: 'count', bestLevel: 'max', stars: 'count', perfect: 'count', fails: 'count', bestCombo: 'max',
    'free.*.played': 'count', 'free.*.bestMoves': 'min', 'byPressure.*': 'count',
  } }],
  ['game:memory:boosters', { type: 'fields', fields: { peek: { spend: 2 }, magnet: { spend: 2 } } }],
  ['game:memory:seenSpecials', { type: 'fields', fields: { '': 'union' } }],
  ['game:connect-dots:tips', { type: 'fields', fields: { '': 'union' } }],
  ['game:bubble-shooter:stats', { type: 'fields', fields: { played: 'count', cleared: 'count', bestLevel: 'max', bestScore: 'max' } }],
  ['game:brick-blast:stats', { type: 'fields', fields: {
    cleared: 'count', bestLevel: 'max', bricks: 'count', shots: 'count', fails: 'count',
  } }],
  ['game:arkanoid:stats', { type: 'fields', fields: {
    cleared: 'count', bestLevel: 'max', bricks: 'count', bonuses: 'count', fails: 'count',
  } }],
  // game:arkanoid:current — lww: уровень можно выбрать и ниже (переиграть), открытые уровни — в stats.bestLevel
  ['game:loop:current', { type: 'level', at: 'level' }],
  // Филворд: уровень общий для всех размеров поля (смена размера уровень не сбрасывает — с беты sync-merge)
  ['game:boggle:current', { type: 'level', at: 'level' }],
  // Wordle: партии трёх языков — независимые части (партия на EN с телефона и на RU с ПК уживаются)
  ['game:wordle:boards', { type: 'map' }],
  ['game:loop:stats', { type: 'fields', fields: { solved: 'count', taps: 'count', bestLevel: 'max' } }],
  ['game:connect-dots:stats', { type: 'fields', fields: { played: 'count', bestRound: 'max', rounds: 'count' } }],
  // уровни с прогрессом (бета 'connect-dots-levels'): уровень — максимум, подсказки — расходуемое
  ['game:connect-dots:progress', { type: 'fields', fields: { level: 'max', hints: { spend: 3 } } }],
  ['game:mahjong:stats', { type: 'fields', fields: { '*.played': 'count', '*.wins': 'count', '*.clean': 'count' } }],
  ['game:2048:stats', { type: 'fields', fields: { '*.played': 'count', '*.wins': 'count', '*.bestTile': 'max' } }],
  ['game:rubik:stats', { type: 'fields', fields: { count: 'count', dnf: 'count', best: 'min', bestMoves: 'min', bestAo5: 'min', bestAo12: 'min' } }],
  ['game:repair:current', { type: 'level', at: 'level' }],
  // деньги и склад запчастей — расходуемое: заработал/купил на одном устройстве, потратил на другом — сходится
  ['game:repair:progress', { type: 'fields', fields: {
    level: 'max', stars: 'count', perfect: 'count', sparks: 'count', earned: 'count', money: { spend: 100 }, 'stock.*': { spend: 0 },
  } }],
  ['game:repair:seen', { type: 'fields', fields: { '': 'union' } }],
  ['game:hanoi:stats', { type: 'fields', fields: { '*.played': 'count', '*.wins': 'count', '*.perfect': 'count', '*.bestMoves': 'min', '*.bestTime': 'min' } }],
  ['game:fifteen:stats', { type: 'fields', fields: { '*.played': 'count', '*.wins': 'count', '*.totalMoves': 'count', '*.bestMoves': 'min', '*.bestTime': 'min' } }],
  ['game:boggle:stats', { type: 'fields', fields: { '*.played': 'count', '*.best': 'max', '*.bonus': 'count' } }],
  ['game:erudit:stats', { type: 'fields', fields: { ...COUNT4('*.'), '*.best': 'max', '*.bestMove': 'max' } }],
  ['game:block-blast:stats', { type: 'fields', fields: {
    played: 'count', best: 'max', totalScore: 'count', maxCombo: 'max', lines: 'count',
  } }],
  ['game:sudoku:stats', { type: 'fields', fields: {
    '*.played': 'count', '*.wins': 'count', '*.maxStreak': 'max', '*.bestMs': 'min', '*.totalWinMs': 'count',
  } }],
  ['game:killer-sudoku:stats', { type: 'fields', fields: {
    '*.played': 'count', '*.wins': 'count', '*.maxStreak': 'max', '*.bestMs': 'min', '*.totalWinMs': 'count',
  } }],
  ['game:tictactoe:stats', { type: 'fields', fields: {
    ...COUNT4('*.*.'), 'friend.played': 'count', 'friend.x': 'count', 'friend.o': 'count', 'friend.draws': 'count',
    bestStreak: 'max',
  } }],
  ['game:wordle:stats', { type: 'fields', fields: {
    '*.played': 'count', '*.wins': 'count', '*.maxStreak': 'max', '*.dist.*': 'count',
  } }],
  ['game:chess:stats', { type: 'fields', fields: COUNT4('*.') }],
  ['game:go:stats', { type: 'fields', fields: {
    ...COUNT4('*.*.'), 'friend.played': 'count', 'friend.black': 'count', 'friend.white': 'count', bestStreak: 'max',
  } }],
  ['game:spider:stats', { type: 'fields', fields: CARDS }],
  // японский кроссворд: решён — максимум (0/1/2), лучшее время — минимум без нуля
  ['game:nonogram:progress', { type: 'fields', fields: { 'done.*': 'max', 'best.*': 'min' } }],
  ['game:minesweeper:stats', { type: 'fields', fields: {
    '*.played': 'count', '*.wins': 'count', '*.best': 'min', '*.bestNg': 'min', '*.bestStreak': 'max',
  } }],
  ['game:klondike:stats', { type: 'fields', fields: CARDS }],
  ['game:match3:progress', { type: 'fields', fields: {
    'done.*': 'max',
    'boosters.hammer': { spend: 3 }, 'boosters.row': { spend: 2 }, 'boosters.shuffle': { spend: 2 }, 'boosters.moves': { spend: 1 },
  } }],
  ['game:pinball:stats', { type: 'fields', fields: {
    played: 'count', best: 'max', bestRank: 'max', missions: 'count', jackpots: 'count', hyper: 'count',
  } }],
];

const compiled = new Map();

function compile(rule) {
  if (rule.type !== 'fields') return rule;
  const list = Object.entries(rule.fields).map(([path, spec]) => ({
    segs: path === '' ? [] : path.split('.'),
    spec: normalizeSpec(spec),
  }));
  return { ...rule, list };
}

function normalizeSpec(spec) {
  if (typeof spec === 'string' && ['max', 'min', 'union', 'count'].includes(spec)) return { kind: spec };
  if (spec && typeof spec === 'object' && 'spend' in spec) return { kind: 'spend', start: Number(spec.spend) || 0 };
  if (spec && typeof spec === 'object' && spec.union) return { kind: 'union', sort: Boolean(spec.sort), keep: spec.keep ?? 0 };
  throw new Error(`непонятное правило поля: ${JSON.stringify(spec)}`);
}

const keyMatch = (pattern, key) => (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : pattern === key);

/** Правило ключа (с разобранными путями полей). */
export function ruleFor(key, rules = RULES) {
  const cache = rules === RULES ? compiled : null;
  if (cache?.has(key)) return cache.get(key);
  let found = { type: 'lww' };
  for (const [pattern, rule] of rules) {
    if (keyMatch(pattern, key)) {
      found = compile(rule);
      break;
    }
  }
  cache?.set(key, found);
  return found;
}

function specAt(rule, segs) {
  if (rule.type !== 'fields') return null;
  for (const field of rule.list) {
    if (field.segs.length !== segs.length) continue;
    if (field.segs.every((s, i) => s === '*' || s === String(segs[i]))) return field.spec;
  }
  return null;
}

/** Вид правила поля по пути (для тестов и заметок): 'count' | 'spend' | 'max' | 'min' | 'union' | null. */
export function kindAt(key, path, rules = RULES) {
  return specAt(ruleFor(key, rules), Array.isArray(path) ? path : splitPath(path))?.kind ?? null;
}

/** Есть ли правила глубже этого пути (тогда объекты и массивы здесь сливаются по частям). */
function rulesBelow(rule, segs) {
  if (rule.type !== 'fields') return false;
  return rule.list.some((field) => field.segs.length > segs.length
    && segs.every((s, i) => field.segs[i] === '*' || field.segs[i] === String(s)));
}

// ---------- мелочи ----------

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/**
 * Строка для сравнения значений: ключи объектов по порядку — {a,b} и {b,a} одинаковы; числа — до 6 знаков после
 * запятой (сумма счётчика по устройствам может отличаться от того же числа на устройстве на 1e-12).
 */
export function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (isObj(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
  if (isNum(value)) return String(Math.round(value * 1e6) / 1e6);
  return JSON.stringify(value) ?? 'undefined';
}

export const same = (a, b) => canon(a) === canon(b);

/** Короткий отпечаток значения (FNV-1a по canon): устройство помнит, какими части были на сервере. */
export function fingerprint(value) {
  let h = 0x811c9dc5;
  const text = canon(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const splitPath = (p) => (p === '' ? [] : p.split('.'));

function getAt(value, segs) {
  let cur = value;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object' || !hasOwn(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

/** Записать по пути, создавая промежуточные объекты. Возвращает корень (путь '' — само значение). */
function setAt(root, segs, value) {
  if (segs.length === 0) return value;
  const out = root !== null && typeof root === 'object' ? root : {};
  let cur = out;
  for (let i = 0; i < segs.length - 1; i += 1) {
    // числовой ключ ниже корня — индекс массива (распределение попыток Wordle), иначе объект
    if (cur[segs[i]] === null || typeof cur[segs[i]] !== 'object') cur[segs[i]] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = value;
  return out;
}

/** Пути полей нужных видов (count/spend), встреченные в значении: ['classic.played', …]. */
function counterPaths(rule, value, kinds) {
  const out = [];
  if (rule.type !== 'fields') return out;
  const walk = (node, segs) => {
    const spec = specAt(rule, segs);
    if (spec) {
      if (kinds.includes(spec.kind) && isNum(node)) out.push(segs.join('.'));
      return;
    }
    if (!rulesBelow(rule, segs)) return;
    if (Array.isArray(node)) node.forEach((x, i) => walk(x, [...segs, String(i)]));
    else if (isObj(node)) for (const k of Object.keys(node)) walk(node[k], [...segs, k]);
  };
  walk(value, []);
  return out;
}

// ---------- счётчики по устройствам ----------

const nonNeg = (x) => (isNum(x) && x > 0 ? x : 0);

function cleanCount(f) {
  const out = { l: 0, d: {} };
  if (!isObj(f)) return out;
  out.l = nonNeg(f.l);
  if (isObj(f.d)) {
    for (const [dev, n] of Object.entries(f.d)) if (isDeviceId(dev) && nonNeg(n)) out.d[dev] = n;
  }
  return out;
}

function cleanSpend(f, start) {
  const out = { s: start, d: {} };
  if (!isObj(f)) return out;
  if (isNum(f.s) && f.s >= 0) out.s = Math.floor(f.s);
  if (isObj(f.d)) {
    for (const [dev, pair] of Object.entries(f.d)) {
      if (!isDeviceId(dev) || !Array.isArray(pair)) continue;
      const e = Math.floor(nonNeg(pair[0]));
      const s = Math.floor(nonNeg(pair[1]));
      if (e || s) out.d[dev] = [e, s];
    }
  }
  return out;
}

function mergeDevices(a, b, pick) {
  const out = {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().slice(0, MAX_DEVICES);
  for (const k of keys) out[k] = hasOwn(a, k) && hasOwn(b, k) ? pick(a[k], b[k]) : (hasOwn(a, k) ? a[k] : b[k]);
  return out;
}

const mergeCount = (a, b) => ({ l: Math.max(a.l, b.l), d: mergeDevices(a.d, b.d, (x, y) => Math.max(x, y)) });
const mergeSpend = (a, b) => ({
  s: Math.max(a.s, b.s),
  d: mergeDevices(a.d, b.d, (x, y) => [Math.max(x[0], y[0]), Math.max(x[1], y[1])]),
});

export function countValue(f) {
  let sum = f.l;
  for (const n of Object.values(f.d)) sum += n;
  return sum;
}

export function spendValue(f) {
  let sum = f.s;
  for (const [e, s] of Object.values(f.d)) sum += e - s;
  return Math.max(0, sum);
}

const fieldValue = (spec, f) => (spec.kind === 'count' ? countValue(f) : spendValue(f));
const cleanField = (spec, f) => (spec.kind === 'count' ? cleanCount(f) : cleanSpend(f, spec.start));

// ---------- записи ----------

/** Запись ключа в порядок: чистые счётчики (только поля, для которых есть правило), числа — числа. */
export function cleanEntry(key, entry, rules = RULES) {
  const rule = ruleFor(key, rules);
  const out = { t: isNum(entry?.t) ? entry.t : 0, e: isNum(entry?.e) ? entry.e : 0 };
  if (entry?.del || entry?.v === undefined) out.del = true;
  else out.v = entry.v;
  if (rule.type === 'map') out.c = cleanParts(entry, out.t);
  if (rule.type === 'fields') {
    out.f = {};
    for (const [path, raw] of Object.entries(isObj(entry?.f) ? entry.f : {})) {
      const spec = specAt(rule, splitPath(path));
      if (spec && (spec.kind === 'count' || spec.kind === 'spend')) out.f[path] = cleanField(spec, raw);
    }
  }
  return out;
}

/**
 * Кто записан позже. Одновременно (переход двух устройств с одним и тем же прошлым обменом) — «большее» значение,
 * чтобы слияние было коммутативным; у объектов по полям сравнивается только то, что берётся от победителя (без
 * накопленного — оно при слиянии меняется, и порядок слияний менял бы победителя).
 */
function winner(a, b, rule) {
  if (a.t !== b.t) return a.t > b.t ? a : b;
  const ca = a.del ? '' : canon(rule?.type === 'fields' ? ownOnly(rule, [], a.v) : a.v);
  const cb = b.del ? '' : canon(rule?.type === 'fields' ? ownOnly(rule, [], b.v) : b.v);
  return ca >= cb ? a : b;
}

/** Времена частей объекта-«карты»: у присланного без них — время всего ключа (так переходят старые данные). */
function cleanParts(entry, t) {
  const out = {};
  const src = isObj(entry?.c) ? entry.c : {};
  for (const [part, at] of Object.entries(src)) if (isNum(at) || at === Infinity) out[part] = at;
  if (isObj(entry?.v)) for (const part of Object.keys(entry.v)) if (!(part in out)) out[part] = t;
  return out;
}

function entryLevel(entry, at) {
  if (entry.del) return null;
  const lv = getAt(entry.v, splitPath(at));
  return isNum(lv) ? lv : null;
}

/** Слить две записи одного ключа. */
export function mergeEntry(key, a, b, rules = RULES) {
  if (!a) return b;
  if (!b) return a;
  const rule = ruleFor(key, rules);
  // новая эпоха (правка в панели, явный сброс) — записанное раньше неё не учитывается вовсе
  if (a.e !== b.e) return a.e > b.e ? a : b;
  const t = Math.max(a.t, b.t);
  const e = a.e;

  if (rule.type === 'map' && !a.del && !b.del && isObj(a.v) && isObj(b.v)) return mergeParts(a, b, t, e);

  if (rule.type !== 'fields') {
    let win = null;
    if (rule.type === 'level') {
      // больший уровень; удалённое или без уровня — ниже любого (иначе порядок слияний менял бы итог)
      const la = entryLevel(a, rule.at) ?? -Infinity;
      const lb = entryLevel(b, rule.at) ?? -Infinity;
      if (la !== lb) win = la > lb ? a : b;
    }
    win ??= winner(a, b);
    // время — победителя: иначе при равных уровнях порядок слияний менял бы итог
    const out = win.del ? { t: win.t, e, del: true } : { t: win.t, e, v: win.v };
    if (win.c) out.c = win.c;
    return out;
  }

  const f = {};
  for (const path of new Set([...Object.keys(a.f ?? {}), ...Object.keys(b.f ?? {})])) {
    const spec = specAt(rule, splitPath(path));
    if (!spec) continue;
    const fa = a.f?.[path];
    const fb = b.f?.[path];
    if (fa && fb) f[path] = spec.kind === 'count' ? mergeCount(fa, fb) : mergeSpend(fa, fb);
    else if (fa || fb) f[path] = fa ?? fb;
  }
  // Ключи с полями (статистика, прогресс) игры не удаляют: удаление такого ключа ничего не стирает — накопленное
  // (счётчики других устройств, рекорды) удалением не отменяется, а «частичное» воскрешение сломало бы проверки игр.
  if (a.del && b.del) return { t, e, f, del: true };
  if (a.del) return b;
  if (b.del) return a;
  const win = winner(a, b, rule);
  const lose = win === a ? b : a;
  return { t, e, f, v: materialize(rule, mergeValue(rule, [], win.v, lose.v), f) };
}

/**
 * «Карта»: каждая часть — сама по себе, побеждает записанная позже (время части в c; нет в значении, но есть время —
 * часть удалена). Одновременно — «большее» значение, чтобы слияние было коммутативным.
 */
function mergeParts(a, b, t, e) {
  const v = {};
  const c = {};
  const parts = new Set([...Object.keys(a.v), ...Object.keys(a.c ?? {}), ...Object.keys(b.v), ...Object.keys(b.c ?? {})]);
  for (const part of [...parts].sort()) {
    const side = (x) => ({ at: x.c?.[part] ?? (hasOwn(x.v, part) ? x.t : -Infinity), has: hasOwn(x.v, part), val: x.v[part] });
    const pa = side(a);
    const pb = side(b);
    let win;
    if (pa.at !== pb.at) win = pa.at > pb.at ? pa : pb;
    else win = (pa.has ? canon(pa.val) : '') >= (pb.has ? canon(pb.val) : '') ? pa : pb;
    if (win.at !== -Infinity) c[part] = win.at;
    if (win.has) v[part] = win.val;
  }
  return { t, e, v, c };
}

/** Значение без полей с правилами (без накопленного) — то, что при слиянии берётся целиком от победителя. */
function ownOnly(rule, segs, value) {
  if (specAt(rule, segs)) return undefined;
  if (!rulesBelow(rule, segs) || value === null || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const k of Object.keys(value)) {
    const child = ownOnly(rule, [...segs, k], value[k]);
    if (child !== undefined) out[k] = child;
  }
  return out;
}

function mergeValue(rule, segs, win, lose) {
  const spec = specAt(rule, segs);
  if (spec) return mergeLeaf(spec, win, lose);
  // без правил внутри — целиком от записанного позже (в том числе «поля нет»: игра его убрала — не возвращаем)
  if (!rulesBelow(rule, segs)) return win;
  if (win === undefined) return lose;
  if (lose === undefined) return win;
  if (isObj(win) && isObj(lose)) {
    const out = {};
    for (const k of [...Object.keys(win), ...Object.keys(lose).filter((x) => !hasOwn(win, x))]) {
      const child = mergeValue(rule, [...segs, k], win[k], lose[k]);
      if (child !== undefined) out[k] = child;
    }
    return out;
  }
  if (Array.isArray(win) && Array.isArray(lose)) {
    const out = [];
    for (let i = 0; i < Math.max(win.length, lose.length); i += 1) {
      out.push(mergeValue(rule, [...segs, String(i)], win[i], lose[i]));
    }
    return out;
  }
  return win;
}

function mergeLeaf(spec, win, lose) {
  if (spec.kind === 'count' || spec.kind === 'spend') return win ?? lose;   // число потом берётся из f
  if (spec.kind === 'max' || spec.kind === 'min') {
    const ok = (x) => isNum(x) && (spec.kind === 'max' || x > 0);
    if (!ok(win)) return ok(lose) || win === undefined ? lose : win;     // «нет рекорда»: null лучше, чем ничего
    if (!ok(lose)) return win;
    return spec.kind === 'max' ? Math.max(win, lose) : Math.min(win, lose);
  }
  // union
  if (!Array.isArray(win)) return Array.isArray(lose) ? lose : win;
  if (!Array.isArray(lose)) return win;
  const seen = new Set();
  let out = [];
  for (const x of [...win, ...lose]) {
    const c = canon(x);
    if (!seen.has(c)) {
      seen.add(c);
      out.push(x);
    }
  }
  if (spec.sort) out.sort((x, y) => (canon(x) < canon(y) ? -1 : canon(x) > canon(y) ? 1 : 0));
  if (spec.keep && out.length > spec.keep) out = out.slice(out.length - spec.keep);
  return out;
}

/** Поставить в значение числа счётчиков и расходуемого из f. */
function materialize(rule, value, f) {
  let out = clone(value);
  for (const [path, meta] of Object.entries(f)) {
    const segs = splitPath(path);
    const spec = specAt(rule, segs);
    if (spec) out = setAt(out, segs, fieldValue(spec, meta));
  }
  return out;
}

export function sameEntry(a, b) {
  if (!a || !b) return !a && !b;
  if (Boolean(a.del) !== Boolean(b.del)) return false;
  if ((a.e ?? 0) !== (b.e ?? 0)) return false;
  if (!a.del && !same(a.v, b.v)) return false;
  return same(a.f ?? {}, b.f ?? {});
}

// ---------- устройство: свои изменения → запись ----------

/**
 * Вписать значение ключа на устройстве в его запись: на сколько счётчик вырос с последнего известного (из f) —
 * столько прибавляется «своему» устройству; расходуемое — в начислено или потрачено. Уменьшение счётчика не
 * учитывается (счётчики только растут). Возвращает { t, e, v | del, f } (t и e — из прежней записи).
 */
export function absorb(key, entry, value, device, rules = RULES) {
  const rule = ruleFor(key, rules);
  const out = { t: entry?.t ?? 0, e: entry?.e ?? 0 };
  if (value === undefined) out.del = true;
  else out.v = value;
  if (rule.type === 'map') {
    // изменённые части — те, что отличаются от последних известных с сервера (h — их отпечатки); они «новее всего»
    const known = isObj(entry?.h) ? entry.h : null;
    out.c = { ...(entry?.c ?? {}) };
    out.ch = [];
    const now = isObj(value) ? value : {};
    for (const part of new Set([...Object.keys(now), ...Object.keys(known ?? {})])) {
      const fp = hasOwn(now, part) ? fingerprint(now[part]) : null;
      if (known && (known[part] ?? null) === fp) continue;
      out.ch.push(part);
      out.c[part] = Infinity;
    }
    return out;
  }
  if (rule.type !== 'fields') return out;
  const f = {};
  for (const [path, meta] of Object.entries(entry?.f ?? {})) f[path] = clone(meta);
  if (value !== undefined && isDeviceId(device)) {
    for (const path of counterPaths(rule, value, ['count', 'spend'])) {
      const segs = splitPath(path);
      const spec = specAt(rule, segs);
      const meta = f[path] ?? cleanField(spec, null);
      const delta = getAt(value, segs) - fieldValue(spec, meta);
      if (spec.kind === 'count') {
        if (delta > 1e-9) meta.d[device] = (meta.d[device] ?? 0) + delta;
      } else if (Math.round(delta) !== 0) {
        const pair = meta.d[device] ?? [0, 0];
        const n = Math.round(delta);
        meta.d[device] = n > 0 ? [pair[0] + n, pair[1]] : [pair[0], pair[1] - n];
      }
      f[path] = meta;
    }
  }
  out.f = f;
  return out;
}

/**
 * Что устройство помнит о ключе после обмена: время и эпоха — как на сервере, счётчики — слитые (со своими
 * неотправленными прибавками), у «карты» — времена и отпечатки частей, КАК НА СЕРВЕРЕ (по ним видно, что изменилось).
 */
export function keepMeta(key, result, server, rules = RULES) {
  const rule = ruleFor(key, rules);
  const out = { t: server.t };
  if (result.e) out.e = result.e;
  if (result.f && Object.keys(result.f).length) out.f = result.f;
  if (rule.type === 'map') {
    out.c = server.c ?? {};
    out.h = {};
    if (!server.del && isObj(server.v)) for (const [part, val] of Object.entries(server.v)) out.h[part] = fingerprint(val);
  }
  return out;
}

// ---------- переход на слияние ----------

/**
 * Запись из старого прогресса (без счётчиков по устройствам): всё насчитанное — «перенесённое» (l у счётчика,
 * s у расходуемого). Так прогресс переходит на слияние один раз и без удвоения.
 */
export function legacyEntry(key, value, t, e = 0, rules = RULES) {
  const rule = ruleFor(key, rules);
  const out = { t, e };
  if (value === undefined) out.del = true;
  else out.v = value;
  if (rule.type === 'map') out.c = cleanParts(out, t);
  if (rule.type !== 'fields') return out;
  out.f = {};
  if (value === undefined) return out;
  for (const path of counterPaths(rule, value, ['count', 'spend'])) {
    const segs = splitPath(path);
    const spec = specAt(rule, segs);
    const n = nonNeg(getAt(value, segs));
    out.f[path] = spec.kind === 'count' ? { l: n, d: {} } : { s: Math.floor(n), d: {} };
  }
  return out;
}

// ---------- документ на сервере ----------

/**
 * Документ из хранимого: data — прогресс (ключ → значение), meta — { at, mig, acks, k: { ключ: { t, e, f, del } } }
 * или null. Без meta прогресс ещё не переходил на слияние: записи выводятся из значений как перенесённые; момент
 * перехода (mig) и эпоха — время последней записи (updatedAt), поэтому документ одинаков при каждом чтении.
 * meta.at — к какой записи прогресса относятся записи слияния: если прогресс потом записали без них (старый
 * обработчик после отката), они устарели и выводятся заново — иначе старые счётчики перекрыли бы новый прогресс.
 */
export function loadDoc(data, meta, updatedAt = 0, rules = RULES) {
  const values = isObj(data) ? data : {};
  if (isObj(meta) && isObj(meta.k) && (meta.at === undefined || meta.at === updatedAt)) {
    const doc = { mig: isNum(meta.mig) ? meta.mig : 0, acks: {}, k: {} };
    if (isObj(meta.acks)) {
      for (const [dev, n] of Object.entries(meta.acks)) if (isDeviceId(dev) && isNum(n)) doc.acks[dev] = n;
    }
    for (const [key, raw] of Object.entries(meta.k)) {
      const has = hasOwn(values, key);
      doc.k[key] = cleanEntry(key, { ...raw, v: has ? values[key] : undefined, del: !has }, rules);
    }
    // значение без записи (не бывает, но на всякий случай) — как перенесённое
    for (const key of Object.keys(values)) {
      if (!doc.k[key]) doc.k[key] = legacyEntry(key, values[key], updatedAt, doc.mig, rules);
    }
    return doc;
  }
  const doc = { mig: updatedAt, acks: {}, k: {} };
  for (const key of Object.keys(values)) doc.k[key] = legacyEntry(key, values[key], updatedAt, updatedAt, rules);
  return doc;
}

/** Документ → прогресс (ключ → значение, как хранится и отдаётся старым клиентам) и meta для записи с временем at. */
export function saveDoc(doc, at = 0) {
  const data = {};
  const k = {};
  for (const key of Object.keys(doc.k).sort()) {
    const entry = doc.k[key];
    if (!entry.del) data[key] = entry.v;
    const m = { t: entry.t };
    if (entry.e) m.e = entry.e;
    if (entry.del) m.del = 1;
    if (entry.f && Object.keys(entry.f).length) m.f = entry.f;
    if (entry.c && Object.keys(entry.c).length) m.c = entry.c;
    k[key] = m;
  }
  return { data, meta: { at, mig: doc.mig, acks: doc.acks, k } };
}

/** Запись для ответа клиенту. */
export function wireEntry(entry) {
  const out = { t: entry.t };
  if (entry.e) out.e = entry.e;
  if (entry.del) out.del = 1;
  else out.v = entry.v;
  if (entry.f && Object.keys(entry.f).length) out.f = entry.f;
  if (entry.c && Object.keys(entry.c).length) out.c = entry.c;
  return out;
}

/** Ключи, изменившиеся на сервере позже since (0 — всё, что есть), и ещё extra. */
export function entriesSince(doc, since, extra = []) {
  const out = {};
  for (const [key, entry] of Object.entries(doc.k)) {
    if (since > 0 ? entry.t > since : !entry.del) out[key] = wireEntry(entry);
  }
  for (const key of extra) if (doc.k[key] && !out[key]) out[key] = wireEntry(doc.k[key]);
  return out;
}

/**
 * Принять сохранение устройства: push = { device, seq, keys: { ключ: { v | del, e, f, s, ch, r } }, migrate?: { oldBase } }.
 *   r  — явный сброс (storage.reset): значение становится новым началом ключа (новая эпоха), всё записанное раньше
 *        при слиянии больше не учитывается;
 *   ch — какие части «карты» изменены на устройстве (остальные части присланного значения не трогаются).
 * Время записи ставит сервер (stamp): часам устройства не доверяем.
 *   s — номер отправки, в которой это значение ушло впервые: если сервер уже принял отправку с таким номером от
 *       этого устройства (acks), ключ пропускается — повтор (ответ не дошёл) не перебьёт то, что позже записало
 *       другое устройство.
 *   migrate — первый обмен устройства по-новому (раньше — снимком целиком): его значения записаны «сразу после
 *       oldBase» (его последнего обмена по-старому), поэтому всё, что на сервере менялось позже, побеждает.
 *       Счётчики — «перенесённое» по максимуму, если его прогресс не новее перехода сервера (mig); если новее
 *       (взят у сервера уже после перехода), устройству засчитывается только прибавка сверх серверного итога.
 * Возвращает { doc, changed: ключи, у которых изменилось что-то кроме времени, dirty: документ надо записать }.
 */
export function applyPush(doc, push, stamp, rules = RULES) {
  const next = { mig: doc.mig, acks: { ...doc.acks }, k: { ...doc.k } };
  const changed = [];
  const device = isDeviceId(push?.device) ? push.device : null;
  const seq = isNum(push?.seq) ? push.seq : 0;
  const acked = device ? (doc.acks[device] ?? 0) : 0;
  const migrate = isObj(push?.migrate);
  const oldBase = migrate && isNum(push.migrate.oldBase) ? Math.max(0, Math.min(push.migrate.oldBase, stamp)) : 0;
  for (const [key, raw] of Object.entries(isObj(push?.keys) ? push.keys : {})) {
    if (!key || key.length > 200 || !isObj(raw)) continue;
    if (!migrate && device && isNum(raw.s) && raw.s > 0 && raw.s <= acked) continue;   // повтор уже принятого
    const stored = next.k[key];
    const value = raw.del ? undefined : raw.v;
    if (raw.r && !migrate) {
      next.k[key] = legacyEntry(key, value, stamp, stamp, rules);
      changed.push(key);
      continue;
    }
    let incoming;
    if (migrate) {
      const at = oldBase + 0.5;
      if (!stored || oldBase <= doc.mig) incoming = legacyEntry(key, value, at, stored?.e ?? 0, rules);
      else incoming = excessEntry(key, stored, value, at, device, rules);
    } else {
      incoming = cleanEntry(key, { ...raw, t: stamp }, rules);
      incoming.e = stored ? Math.min(incoming.e, stored.e) : 0;   // эпоху устройство знает только от сервера
      if (ruleFor(key, rules).type === 'map' && !incoming.del && isObj(incoming.v)) incoming = changedParts(incoming, raw, stamp);
    }
    const merged = mergeEntry(key, stored, incoming, rules);
    if (!stored || !sameEntry(stored, merged)) {
      merged.t = stamp;
      next.k[key] = merged;
      changed.push(key);
    }
  }
  let dirty = changed.length > 0;
  if (device && seq > acked) {
    next.acks[device] = seq;
    dirty = true;
  }
  return { doc: next, changed, dirty };
}

/** Из присланной «карты» — только изменённые на устройстве части (ch; не сказано — все), со временем сервера. */
function changedParts(incoming, raw, stamp) {
  const parts = Array.isArray(raw.ch) ? raw.ch.filter((p) => typeof p === 'string') : Object.keys(incoming.v);
  const v = {};
  const c = {};
  for (const part of parts) {
    if (hasOwn(incoming.v, part)) v[part] = incoming.v[part];
    c[part] = stamp;
  }
  return { t: stamp, e: incoming.e, v, c };
}

/** Устройство взяло уже слитый прогресс старым клиентом: засчитать ему только то, что сверх серверного итога. */
function excessEntry(key, stored, value, t, device, rules) {
  const rule = ruleFor(key, rules);
  const out = { t, e: stored.e };
  if (value === undefined) out.del = true;
  else out.v = value;
  if (rule.type !== 'fields') return out;
  out.f = {};
  if (value === undefined || !device) return out;
  for (const path of counterPaths(rule, value, ['count'])) {
    const have = stored.f?.[path] ?? { l: 0, d: {} };
    const extra = getAt(value, splitPath(path)) - countValue(have);
    if (extra > 1e-9) out.f[path] = { l: 0, d: { [device]: (have.d[device] ?? 0) + extra } };
  }
  return out;
}

/**
 * Правка в панели владельца: присланное значение ключа становится новым началом — эпоха e = stamp, счётчики
 * перенесены заново. Записи устройств старой эпохи при слиянии отбрасываются — иначе правка «вниз» не прошла бы.
 */
export function applyAdmin(doc, data, stamp, rules = RULES) {
  const next = { mig: doc.mig, acks: { ...doc.acks }, k: { ...doc.k } };
  const values = isObj(data) ? data : {};
  for (const key of new Set([...Object.keys(next.k), ...Object.keys(values)])) {
    const stored = next.k[key];
    const has = hasOwn(values, key);
    if (stored && !stored.del && has && same(stored.v, values[key])) continue;
    if ((!stored || stored.del) && !has) continue;
    next.k[key] = legacyEntry(key, has ? values[key] : undefined, stamp, stamp, rules);
  }
  return next;
}
