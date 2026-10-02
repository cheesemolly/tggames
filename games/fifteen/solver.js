// Решатель пятнашек для подсказок, без DOM.
//
// optimal(): IDA* с оценкой «манхэттенское расстояние + линейные конфликты» (две плитки одной строки, обе из этой
// строки, стоят в обратном порядке — одной придётся уйти и вернуться: +2). Оценка допустимая, путь — кратчайший.
// Для 3×3 мгновенно, для 4×4 — обычно доли секунды, на трудных — больше: есть предел узлов (budget).
// staged(): для больших полей и как запасной путь — по-человечески: ставим плитки первой строки, потом первого
// столбца, и так «сужаем» поле до 3×3 (его — optimal). Каждая подцель — поиск A* с оценкой только по плиткам
// подцели, поставленные раньше плитки не трогаются; две последние плитки строки (столбца) ставятся вместе — по
// одной их не поставить, не сдвинув соседку. Путь не кратчайший, но всегда находится и годится для подсказки.

const solvedOf = (n) => Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));

/** Оценка: манхэттен + 2 за каждую пару в линейном конфликте. */
export function heuristic(grid, n) {
  let md = 0;
  let lc = 0;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (!v) continue;
    const g = v - 1;
    md += Math.abs((i % n) - (g % n)) + Math.abs(Math.floor(i / n) - Math.floor(g / n));
  }
  for (let r = 0; r < n; r++) lc += lineConflicts(grid, n, r, true);
  for (let c = 0; c < n; c++) lc += lineConflicts(grid, n, c, false);
  return md + 2 * lc;
}

/** Линейные конфликты в строке (row = true) или столбце k: сколько плиток надо убрать, чтобы порядок стал верным. */
function lineConflicts(grid, n, k, row) {
  const goals = [];
  for (let j = 0; j < n; j++) {
    const i = row ? k * n + j : j * n + k;
    const v = grid[i];
    if (!v) continue;
    const g = v - 1;
    if (row ? Math.floor(g / n) === k : g % n === k) goals.push(row ? g % n : Math.floor(g / n));
  }
  if (goals.length < 2) return 0;
  // наибольшая возрастающая подпоследовательность — остальные плитки в конфликте
  const tails = [];
  for (const x of goals) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return goals.length - tails.length;
}

const NB = new Map();
function neighbors(n) {
  if (!NB.has(n)) {
    NB.set(n, Array.from({ length: n * n }, (_, i) => {
      const x = i % n;
      const y = Math.floor(i / n);
      const out = [];
      if (y > 0) out.push(i - n);
      if (y < n - 1) out.push(i + n);
      if (x > 0) out.push(i - 1);
      if (x < n - 1) out.push(i + 1);
      return out;
    }));
  }
  return NB.get(n);
}

/**
 * Кратчайшее решение (IDA*): массив номеров плиток по порядку (каждая — сдвиг в пустую клетку) или null —
 * предел узлов исчерпан. [] — уже собрано. Оценка пересчитывается по приращению: манхэттен — по одной плитке,
 * линейные конфликты — только в двух задетых линиях (ход вдоль строки меняет столбцы, и наоборот).
 */
export function optimal(start, n, { budget = 3e6 } = {}) {
  const grid = Int8Array.from(start);
  const nb = neighbors(n);
  const gx = new Int8Array(n * n);
  const gy = new Int8Array(n * n);
  for (let v = 1; v < n * n; v++) {
    gx[v] = (v - 1) % n;
    gy[v] = Math.floor((v - 1) / n);
  }
  const dist = (v, i) => Math.abs((i % n) - gx[v]) + Math.abs(Math.floor(i / n) - gy[v]);
  const rowLc = new Int8Array(n);
  const colLc = new Int8Array(n);
  let md = 0;
  for (let i = 0; i < n * n; i++) if (grid[i]) md += dist(grid[i], i);
  for (let k = 0; k < n; k++) {
    rowLc[k] = lineConflicts(grid, n, k, true);
    colLc[k] = lineConflicts(grid, n, k, false);
  }
  let lc = rowLc.reduce((a, b) => a + b, 0) + colLc.reduce((a, b) => a + b, 0);
  if (md + 2 * lc === 0) return [];
  let nodes = 0;
  const path = [];
  let blank = grid.indexOf(0);
  let bound = md + 2 * lc;
  const search = (g, prev) => {
    const h = md + 2 * lc;
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return -1;
    if (++nodes > budget) return Infinity;
    let min = Infinity;
    for (const t of nb[blank]) {
      if (t === prev) continue;
      const v = grid[t];
      const e = blank;
      const dmd = dist(v, e) - dist(v, t);
      grid[e] = v;
      grid[t] = 0;
      blank = t;
      md += dmd;
      // ход по строке (одна строка) меняет столбцы t и e; по столбцу — строки
      const horiz = Math.floor(t / n) === Math.floor(e / n);
      let a;
      let b;
      let oa;
      let ob;
      if (horiz) {
        a = t % n;
        b = e % n;
        oa = colLc[a];
        ob = colLc[b];
        colLc[a] = lineConflicts(grid, n, a, false);
        colLc[b] = lineConflicts(grid, n, b, false);
        lc += colLc[a] + colLc[b] - oa - ob;
      } else {
        a = Math.floor(t / n);
        b = Math.floor(e / n);
        oa = rowLc[a];
        ob = rowLc[b];
        rowLc[a] = lineConflicts(grid, n, a, true);
        rowLc[b] = lineConflicts(grid, n, b, true);
        lc += rowLc[a] + rowLc[b] - oa - ob;
      }
      path.push(v);
      const r = search(g + 1, e);
      if (r === -1) return -1;
      path.pop();
      if (horiz) {
        lc -= colLc[a] + colLc[b] - oa - ob;
        colLc[a] = oa;
        colLc[b] = ob;
      } else {
        lc -= rowLc[a] + rowLc[b] - oa - ob;
        rowLc[a] = oa;
        rowLc[b] = ob;
      }
      md -= dmd;
      blank = e;
      grid[t] = v;
      grid[e] = 0;
      if (r < min) min = r;
    }
    return min;
  };
  for (;;) {
    const r = search(0, -1);
    if (r === -1) return path.slice();
    if (r === Infinity) return null;
    bound = r;
  }
}

// ---------- по шагам: строка за строкой, столбец за столбцом ----------

/**
 * Поставить плитки targets на их места, не трогая клетки frozen. Остальные плитки для подцели не важны, поэтому
 * поиск в ширину идёт только по положениям пустой клетки и плиток подцели (одна плитка — до 36², две — до 36³
 * состояний). → путь — номера плиток по порядку — или null.
 */
function placeTiles(grid, n, targets, frozen) {
  const N = n * n;
  const nb = neighbors(n);
  const goal = targets.map((v) => v - 1);
  const pos0 = targets.map((v) => grid.indexOf(v));
  const enc = (b, p) => p.reduce((acc, x) => acc * N + x, b);
  const startKey = enc(grid.indexOf(0), pos0);
  const prev = new Map([[startKey, -1]]);
  const queue = [[grid.indexOf(0), pos0]];
  let found = null;
  for (let q = 0; q < queue.length && found === null; q++) {
    const [b, p] = queue[q];
    if (p.every((x, k) => x === goal[k])) {
      found = enc(b, p);
      break;
    }
    const key = enc(b, p);
    for (const t of nb[b]) {
      if (frozen.has(t)) continue;
      const np = p.map((x) => (x === t ? b : x));
      const nk = enc(t, np);
      if (prev.has(nk)) continue;
      prev.set(nk, key);
      queue.push([t, np]);
    }
  }
  if (found === null) return null;
  // путь пустой клетки назад → ходы на настоящем поле
  const blanks = [];
  for (let k = found; k !== -1; k = prev.get(k)) blanks.push(Math.floor(k / N ** targets.length));
  blanks.reverse();
  const g = grid.slice();
  const out = [];
  for (let k = 1; k < blanks.length; k++) {
    const t = blanks[k];
    const e = blanks[k - 1];
    out.push(g[t]);
    g[e] = g[t];
    g[t] = 0;
  }
  return out;
}

/**
 * Решение по шагам для любого размера: верхняя строка, левый столбец, потом то же для поля поменьше; 3×3 в углу —
 * кратчайшим путём. → массив номеров плиток или null.
 */
export function staged(start, n) {
  const grid = start.slice();
  const frozen = new Set();
  const out = [];
  const apply = (moves) => {
    for (const v of moves) {
      const i = grid.indexOf(v);
      const e = grid.indexOf(0);
      grid[e] = v;
      grid[i] = 0;
      out.push(v);
    }
  };
  for (let k = 0; k < n - 3; k++) {
    const row = [];
    for (let x = k; x < n; x++) row.push(k * n + x + 1);
    const col = [];
    for (let y = k + 1; y < n; y++) col.push(y * n + k + 1);
    for (const line of [row, col]) {
      for (let q = 0; q < line.length; q++) {
        // по одной; две последние — вместе (по одной их не поставить, не сдвинув соседку)
        const targets = q === line.length - 2 ? [line[q], line[q + 1]] : [line[q]];
        const moves = placeTiles(grid, n, targets, frozen);
        if (!moves) return null;
        apply(moves);
        targets.forEach((v) => frozen.add(v - 1));
        if (targets.length === 2) q++;
      }
    }
  }
  const off = n - 3;
  const sub = [];
  const map = [];
  for (let y = off; y < n; y++) {
    for (let x = off; x < n; x++) {
      const v = grid[y * n + x];
      map.push(v);
      if (!v) sub.push(0);
      else {
        const g = v - 1;
        sub.push((Math.floor(g / n) - off) * 3 + ((g % n) - off) + 1);
      }
    }
  }
  const rest = optimal(sub, 3, { budget: 1e6 });
  if (!rest) return null;
  const back = new Map();
  map.forEach((v, k) => { if (v) back.set(sub[k], v); });
  for (const v of rest) out.push(back.get(v));
  return out;
}

/**
 * Путь для подсказки: { path, optimal }. 3×3 — всегда кратчайший; 4×4 — кратчайший, если уложились в предел
 * (~0,1 с), иначе по шагам; больше — по шагам. null — не нашли (не бывает на решаемом поле).
 */
export function solvePath(grid, n) {
  if (n <= 4) {
    const p = optimal(grid, n, { budget: n === 3 ? 1e6 : 4e5 });
    if (p) return { path: p, optimal: true };
  }
  const p = staged(grid, n);
  return p ? { path: p, optimal: false } : null;
}

/** Следующий ход для подсказки: { tile, left, optimal } или null. */
export function hint(grid, n) {
  const r = solvePath(grid, n);
  return r ? { tile: r.path[0] ?? null, left: r.path.length, optimal: r.optimal } : null;
}

export { solvedOf };
