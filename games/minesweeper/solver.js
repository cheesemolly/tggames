// Логика сапёра: что можно вывести наверняка по открытым цифрам и сколько шансов на мину у остальных клеток.
//
// Знание игрока — know: { open (1 — открыта), num (цифра открытой), mine (1 — мина известна), total (мин всего) }.
// Ограничение — открытая цифра с закрытыми соседями: «среди cells ровно need мин».
// deduce() ищет выводы по ступеням, от простых к сложным, и отдаёт выводы самой простой ступени, где они есть:
//   1 'single' — цифра уже набрала свои мины (остальные соседи свободны) или закрытых соседей ровно столько,
//     сколько мин осталось (все — мины);
//   2 'pair'   — две цифры с общими соседями: сколько мин может быть в общей части, столько остаётся «только своим»;
//   3 'global' — счётчик мин: мины кончились или осталось столько, сколько закрытых клеток;
//   4 'enum'   — перебор: граница (закрытые клетки у цифр) делится на независимые части, в каждой перебираются
//     все расстановки; вместе со счётчиком мин клетка, свободная (или заминированная) во всех возможных
//     расстановках, известна наверняка. Часть больше MAX_PART клеток или дольше NODE_BUDGET шагов не
//     перебирается — для неё считается, что в ней может быть любое число мин (выводы остаются верными).
// probabilities() — тот же перебор с весами: расстановка границы с s минами встречается C(I, R − s) раз, где
// I — клетки вдали от цифр, R — сколько мин не найдено (их «биномиальный вес»).
// solveFrom() — прохождение поля одной логикой от первого хода: так генератор проверяет «без угадываний».

export const LEVELS = { single: 1, pair: 2, global: 3, enum: 4 };
const MAX_PART = 40;
const NODE_BUDGET = 60000;

const ctxCache = new Map();

/** Соседи каждой клетки поля w×h (кэшируются). */
export function makeCtx(w, h) {
  const key = `${w}x${h}`;
  if (ctxCache.has(key)) return ctxCache.get(key);
  const n = w * h;
  const nb = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) list.push(yy * w + xx);
      }
    }
    nb[i] = list;
  }
  const ctx = { w, h, n, nb };
  ctxCache.set(key, ctx);
  return ctx;
}

/** Цифры поля: число мин вокруг каждой клетки (у мины — 9). */
export function numbersOf(ctx, mine) {
  const nums = new Int8Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) {
    if (mine[i]) {
      nums[i] = 9;
      continue;
    }
    let c = 0;
    for (const j of ctx.nb[i]) c += mine[j];
    nums[i] = c;
  }
  return nums;
}

/** Ограничения от открытых цифр: { src, cells, need }. */
export function constraintsOf(ctx, know) {
  const list = [];
  for (let i = 0; i < ctx.n; i++) {
    if (!know.open[i]) continue;                  // открытый ноль с закрытыми соседями (в игре так не бывает) — тоже ограничение
    let need = know.num[i];
    const cells = [];
    for (const j of ctx.nb[i]) {
      if (know.mine[j]) need--;
      else if (!know.open[j]) cells.push(j);
    }
    if (cells.length) list.push({ src: i, cells, need });
  }
  return list;
}

function unknownCount(ctx, know) {
  let u = 0;
  let m = 0;
  for (let i = 0; i < ctx.n; i++) {
    if (know.mine[i]) m++;
    else if (!know.open[i]) u++;
  }
  return { u, rest: know.total - m };
}

// ---------- ступени ----------

function single(list) {
  const out = new Map();
  for (const c of list) {
    if (c.need === 0) for (const j of c.cells) if (!out.has(j)) out.set(j, { i: j, mine: false, rule: 'single', from: [c.src] });
    if (c.need === c.cells.length) for (const j of c.cells) if (!out.has(j)) out.set(j, { i: j, mine: true, rule: 'single', from: [c.src] });
  }
  return [...out.values()];
}

function pair(list) {
  const byCell = new Map();
  list.forEach((c, k) => c.cells.forEach((j) => {
    if (!byCell.has(j)) byCell.set(j, []);
    byCell.get(j).push(k);
  }));
  const out = new Map();
  const put = (cells, mine, a, b) => {
    for (const j of cells) if (!out.has(j)) out.set(j, { i: j, mine, rule: 'pair', from: [a.src, b.src] });
  };
  for (let ka = 0; ka < list.length; ka++) {
    const a = list[ka];
    const seen = new Set();
    for (const j of a.cells) for (const kb of byCell.get(j)) if (kb !== ka) seen.add(kb);
    for (const kb of seen) {
      const b = list[kb];
      const inB = new Set(b.cells);
      const both = a.cells.filter((j) => inB.has(j));
      const inA = new Set(a.cells);
      const aOnly = a.cells.filter((j) => !inB.has(j));
      const bOnly = b.cells.filter((j) => !inA.has(j));
      const minI = Math.max(0, a.need - aOnly.length, b.need - bOnly.length);
      const maxI = Math.min(both.length, a.need, b.need);
      if (minI > maxI) continue;                       // противоречие (не бывает на настоящем поле)
      // «только у b»: мин там от b.need − maxI до b.need − minI
      if (bOnly.length) {
        if (b.need - maxI === bOnly.length) put(bOnly, true, a, b);
        else if (b.need - minI === 0) put(bOnly, false, a, b);
      }
      if (aOnly.length) {
        if (a.need - maxI === aOnly.length) put(aOnly, true, b, a);
        else if (a.need - minI === 0) put(aOnly, false, b, a);
      }
    }
  }
  return [...out.values()];
}

function global(ctx, know) {
  const { u, rest } = unknownCount(ctx, know);
  if (!u || (rest !== 0 && rest !== u)) return [];
  const out = [];
  for (let i = 0; i < ctx.n; i++) if (!know.open[i] && !know.mine[i]) out.push({ i, mine: rest !== 0, rule: 'global', from: [] });
  return out;
}

// ---------- перебор границы ----------

/** Части границы: { cells, cons: [{ idx: [номера клеток части], need, src }] }. */
function partsOf(list) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const c of list) for (const j of c.cells) if (!parent.has(j)) parent.set(j, j);
  for (const c of list) for (let k = 1; k < c.cells.length; k++) {
    const a = find(c.cells[0]);
    const b = find(c.cells[k]);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map();
  for (const c of list) {
    const r = find(c.cells[0]);
    if (!groups.has(r)) groups.set(r, { cons: [], cellSet: new Set() });
    const g = groups.get(r);
    g.cons.push(c);
    c.cells.forEach((j) => g.cellSet.add(j));
  }
  return [...groups.values()].map((g) => {
    // порядок перебора: клетки по ходу ограничений — чтобы противоречия находились рано
    const order = [];
    const placed = new Set();
    for (const c of g.cons) for (const j of c.cells) if (!placed.has(j)) {
      placed.add(j);
      order.push(j);
    }
    const pos = new Map(order.map((j, k) => [j, k]));
    const cons = g.cons.map((c) => ({ src: c.src, need: c.need, idx: c.cells.map((j) => pos.get(j)) }));
    return { cells: order, cons };
  });
}

/**
 * Все расстановки мин в части: byK — Map(число мин → { count, cell: Float64Array — во скольких расстановках
 * клетка заминирована }). null — часть слишком велика.
 */
function enumerate(part) {
  const m = part.cells.length;
  if (m > MAX_PART) return null;
  // для каждой клетки — ограничения, в которых она последняя по порядку (там проверяем точное равенство)
  const consOf = Array.from({ length: m }, () => []);
  const lastOf = Array.from({ length: m }, () => []);
  part.cons.forEach((c, k) => {
    c.idx.forEach((p) => consOf[p].push(k));
    lastOf[Math.max(...c.idx)].push(k);
  });
  const left = part.cons.map((c) => c.idx.length);   // ещё не решённых клеток в ограничении
  const got = part.cons.map(() => 0);                  // уже поставленных мин
  const val = new Uint8Array(m);
  const byK = new Map();
  let nodes = 0;
  let aborted = false;
  const rec = (p, k) => {
    if (aborted) return;
    if (++nodes > NODE_BUDGET) {
      aborted = true;
      return;
    }
    if (p === m) {
      let e = byK.get(k);
      if (!e) {
        e = { count: 0, cell: new Float64Array(m) };
        byK.set(k, e);
      }
      e.count++;
      for (let q = 0; q < m; q++) if (val[q]) e.cell[q]++;
      return;
    }
    for (const v of [0, 1]) {
      let ok = true;
      for (const c of consOf[p]) {
        const g = got[c] + v;
        const l = left[c] - 1;
        const need = part.cons[c].need;
        if (g > need || g + l < need) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      val[p] = v;
      for (const c of consOf[p]) {
        got[c] += v;
        left[c]--;
      }
      rec(p + 1, k + v);
      for (const c of consOf[p]) {
        got[c] -= v;
        left[c]++;
      }
      val[p] = 0;
    }
  };
  rec(0, 0);
  return aborted ? null : byK;
}

/** Возможные суммы: выпуклая свёртка множеств чисел мин (булевы — без плавающих весов). */
function sumsOf(sets) {
  let acc = new Set([0]);
  for (const s of sets) {
    const next = new Set();
    for (const a of acc) for (const b of s) next.add(a + b);
    acc = next;
  }
  return acc;
}

function enumStep(ctx, know, list) {
  if (!list.length) return [];
  const { u, rest } = unknownCount(ctx, know);
  const parts = partsOf(list).map((p) => ({ ...p, byK: enumerate(p) }));
  const frontier = parts.reduce((s, p) => s + p.cells.length, 0);
  const interior = u - frontier;
  // возможные числа мин у части: у неперебранной — любое от 0 до её размера
  const ks = parts.map((p) => (p.byK ? new Set(p.byK.keys()) : new Set(Array.from({ length: p.cells.length + 1 }, (_, k) => k))));
  const fits = (s) => rest - s >= 0 && rest - s <= interior;
  const out = [];
  parts.forEach((p, j) => {
    if (!p.byK) return;
    const others = sumsOf(ks.filter((_, q) => q !== j));
    const feasible = [...p.byK.entries()].filter(([k]) => [...others].some((s) => fits(k + s)));
    if (!feasible.length) return;
    const from = p.cons.map((c) => c.src);
    p.cells.forEach((cell, q) => {
      if (feasible.every(([, e]) => e.cell[q] === 0)) out.push({ i: cell, mine: false, rule: 'enum', from });
      else if (feasible.every(([, e]) => e.cell[q] === e.count)) out.push({ i: cell, mine: true, rule: 'enum', from });
    });
  });
  // клетки вдали от цифр: все возможные итоги дают им 0 мин или все — полностью заминированы
  if (interior > 0) {
    const totals = [...sumsOf(ks)].filter(fits).map((s) => rest - s);
    if (totals.length && (totals.every((r) => r === 0) || totals.every((r) => r === interior))) {
      const mine = totals[0] !== 0;
      const front = new Set(parts.flatMap((p) => p.cells));
      for (let i = 0; i < ctx.n; i++) if (!know.open[i] && !know.mine[i] && !front.has(i)) out.push({ i, mine, rule: 'enum', from: [] });
    }
  }
  return out;
}

/**
 * Выводы самой простой ступени, где они есть: { level: 'single'|'pair'|'global'|'enum', items: [{ i, mine, rule,
 * from }] } или null — без угадывания дальше нельзя. maxLevel — до какой ступени искать (1…4).
 */
export function deduce(ctx, know, { maxLevel = 4 } = {}) {
  const list = constraintsOf(ctx, know);
  let items = single(list);
  if (items.length) return { level: 'single', items };
  if (maxLevel < 2) return null;
  items = pair(list);
  if (items.length) return { level: 'pair', items };
  if (maxLevel < 3) return null;
  items = global(ctx, know);
  if (items.length) return { level: 'global', items };
  if (maxLevel < 4) return null;
  items = enumStep(ctx, know, list);
  if (items.length) return { level: 'enum', items };
  return null;
}

// ---------- вероятности ----------

const logFact = [0];
function lf(k) {
  while (logFact.length <= k) logFact.push(logFact[logFact.length - 1] + Math.log(logFact.length));
  return logFact[k];
}
const logC = (n, k) => (k < 0 || k > n ? -Infinity : lf(n) - lf(k) - lf(n - k));

/**
 * Вероятность мины у каждой закрытой неизвестной клетки (NaN — открытые и известные мины). Если какую-то часть
 * перебрать не удалось — ей и клеткам вдали от цифр достаётся средняя плотность оставшихся мин.
 */
export function probabilities(ctx, know) {
  const prob = new Float64Array(ctx.n).fill(NaN);
  const list = constraintsOf(ctx, know);
  const { u, rest } = unknownCount(ctx, know);
  const parts = partsOf(list).map((p) => ({ ...p, byK: enumerate(p) }));
  const solved = parts.filter((p) => p.byK);
  const rough = parts.filter((p) => !p.byK);
  const front = new Set(parts.flatMap((p) => p.cells));
  // неперебранные части считаются вместе с «дальними» клетками — по средней плотности
  const roughCells = rough.reduce((s, p) => s + p.cells.length, 0);
  const interior = u - front.size + roughCells;
  // распределения чисел мин у частей: Map(k → count)
  const dists = solved.map((p) => new Map([...p.byK.entries()].map(([k, e]) => [k, e.count])));
  const conv = (ds) => {
    let acc = new Map([[0, 1]]);
    for (const d of ds) {
      const next = new Map();
      for (const [a, wa] of acc) for (const [b, wb] of d) next.set(a + b, (next.get(a + b) ?? 0) + wa * wb);
      acc = next;
    }
    return acc;
  };
  const all = conv(dists);
  // веса итогов: число способов × C(interior, rest − s), в лог-масштабе относительно наибольшего
  const logs = [...all.entries()].map(([s, cnt]) => [s, Math.log(cnt) + logC(interior, rest - s)]);
  const top = Math.max(...logs.map(([, l]) => l));
  if (!Number.isFinite(top)) {
    const avg = u ? rest / u : 0;
    for (let i = 0; i < ctx.n; i++) if (!know.open[i] && !know.mine[i]) prob[i] = avg;
    return prob;
  }
  const weight = (cnt, s) => (cnt > 0 ? Math.exp(Math.log(cnt) + logC(interior, rest - s) - top) : 0);
  let total = 0;
  let interiorMines = 0;
  for (const [s, cnt] of all) {
    const w = weight(cnt, s);
    total += w;
    if (interior > 0) interiorMines += (w * (rest - s)) / interior;
  }
  solved.forEach((p, j) => {
    const others = conv(dists.filter((_, q) => q !== j));
    const acc = new Float64Array(p.cells.length);
    for (const [k, e] of p.byK) {
      let wk = 0;
      for (const [s, cnt] of others) wk += weight(cnt, k + s);
      if (!wk) continue;
      for (let q = 0; q < p.cells.length; q++) acc[q] += e.cell[q] * wk;
    }
    p.cells.forEach((cell, q) => { prob[cell] = total ? acc[q] / total : 0; });
  });
  const pi = total && interior ? interiorMines / total : 0;
  for (let i = 0; i < ctx.n; i++) if (!know.open[i] && !know.mine[i] && Number.isNaN(prob[i])) prob[i] = pi;
  return prob;
}

// ---------- прохождение одной логикой ----------

/**
 * Пройти поле от первого хода одной логикой. mine — 0/1 по клеткам. → { solved, level (самая сложная
 * понадобившаяся ступень, 0 — хватило первого хода), opened, steps }.
 */
export function solveFrom(w, h, mine, first, { maxLevel = 4 } = {}) {
  const ctx = makeCtx(w, h);
  const num = numbersOf(ctx, mine);
  const open = new Uint8Array(ctx.n);
  const known = new Uint8Array(ctx.n);
  let total = 0;
  for (let i = 0; i < ctx.n; i++) total += mine[i];
  const safe = ctx.n - total;
  let opened = 0;
  const stack = [];
  const openAt = (i) => {
    if (open[i] || mine[i]) return;
    stack.push(i);
    open[i] = 1;
    while (stack.length) {
      const c = stack.pop();
      opened++;
      if (num[c] !== 0) continue;
      for (const j of ctx.nb[c]) if (!open[j] && !mine[j]) {
        open[j] = 1;
        stack.push(j);
      }
    }
  };
  if (mine[first]) return { solved: false, level: 0, opened: 0, steps: 0 };
  openAt(first);
  const know = { open, num, mine: known, total };
  let level = 0;
  let steps = 0;
  while (opened < safe) {
    const r = deduce(ctx, know, { maxLevel });
    if (!r) return { solved: false, level, opened, steps };
    level = Math.max(level, LEVELS[r.level]);
    steps++;
    for (const it of r.items) {
      // вывод сверяется с настоящим полем: ошибка решателя — это ошибка кода, а не «повезло»
      if (it.mine !== Boolean(mine[it.i])) throw new Error(`решатель ошибся: ${it.rule} в клетке ${it.i}`);
      if (it.mine) known[it.i] = 1;
      else openAt(it.i);
    }
  }
  return { solved: true, level, opened, steps };
}
