// Логика нонограммы (японского кроссворда) без DOM: подсказки по картинке, решение строки, решение поля «по
// линиям», проверка единственности перебором.
//
// Клетка: -1 — неизвестна, 0 — пустая, 1 — закрашена. Подсказка строки — длины отрезков подряд закрашенных клеток
// ([] — строка пустая).
// solveLine() — полный разбор строки: для каждой клетки — может ли она быть пустой и может ли быть закрашенной хотя
// бы в одной расстановке отрезков, согласной с уже известным (динамика вперёд и назад, O(отрезков × длина²)).
// Что возможно только одним способом — известно наверняка. Так решают люди «по линиям», без перебора всего поля.
// propagate() — разбор строк и столбцов по очереди, пока что-то меняется; считается и число проходов (сложность).
// countSolutions() — перебор с разбором линий на каждом шаге: 0, 1 или «2 и больше» решений.

/** Подсказка линии: длины отрезков подряд закрашенных клеток. */
export function cluesOf(line) {
  const out = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out;
}

/** Подсказки картинки: { rows, cols } по маске (массив строк из 0/1). */
export function cluesOfGrid(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const rows = grid.map((r) => cluesOf(r));
  const cols = [];
  for (let x = 0; x < w; x++) {
    const col = [];
    for (let y = 0; y < h; y++) col.push(grid[y][x]);
    cols.push(cluesOf(col));
  }
  return { rows, cols };
}

/**
 * Разбор одной линии: cells — известное (-1/0/1), clue — подсказка. → новая линия (известное дополнено) или null —
 * противоречие (ни одной расстановки).
 */
export function solveLine(cells, clue) {
  const n = cells.length;
  const m = clue.length;
  const canFill = (i) => cells[i] !== 0;
  const canEmpty = (i) => cells[i] !== 1;
  // noFill[i] — сколько клеток из [0, i) не могут быть закрашены (проверка отрезка за O(1))
  const noFill = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) noFill[i + 1] = noFill[i] + (canFill(i) ? 0 : 1);
  const fillable = (s, e) => noFill[e] - noFill[s] === 0;      // [s, e) можно закрасить
  // F[k][i]: первые k отрезков укладываются в [0, i), а клетки до i, не занятые ими, — пустые
  const F = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));
  F[0][0] = 1;
  for (let i = 1; i <= n; i++) F[0][i] = F[0][i - 1] && canEmpty(i - 1) ? 1 : 0;
  for (let k = 1; k <= m; k++) {
    const L = clue[k - 1];
    for (let i = 1; i <= n; i++) {
      let ok = F[k][i - 1] && canEmpty(i - 1);
      if (!ok && i >= L && fillable(i - L, i)) {
        const s = i - L;
        if (k === 1) ok = s === 0 ? true : F[0][s];
        else ok = s >= 1 && canEmpty(s - 1) && F[k - 1][s - 1] === 1;
      }
      F[k][i] = ok ? 1 : 0;
    }
  }
  if (!F[m][n]) return null;
  // B[k][i]: отрезки k..m-1 укладываются в [i, n), остальные клетки — пустые
  const B = Array.from({ length: m + 1 }, () => new Uint8Array(n + 2));
  B[m][n] = 1;
  for (let i = n - 1; i >= 0; i--) B[m][i] = B[m][i + 1] && canEmpty(i) ? 1 : 0;
  for (let k = m - 1; k >= 0; k--) {
    const L = clue[k];
    for (let i = n - 1; i >= 0; i--) {
      let ok = B[k][i + 1] && canEmpty(i);
      if (!ok && i + L <= n && fillable(i, i + L)) {
        const e = i + L;
        if (k === m - 1) ok = e === n ? true : B[m][e];
        else ok = e < n && canEmpty(e) && B[k + 1][e + 1] === 1;
      }
      B[k][i] = ok ? 1 : 0;
    }
  }
  const mayEmpty = new Uint8Array(n);
  const mayFill = new Uint8Array(n);
  // пустая клетка i: какие-то первые k отрезков левее, остальные — правее
  for (let i = 0; i < n; i++) {
    if (!canEmpty(i)) continue;
    for (let k = 0; k <= m; k++) {
      if (F[k][i] && B[k][i + 1]) {
        mayEmpty[i] = 1;
        break;
      }
    }
  }
  // отрезок k в [s, s + L): разметка «закрашено» по разности (накопление на отрезке)
  const diff = new Int32Array(n + 1);
  for (let k = 0; k < m; k++) {
    const L = clue[k];
    for (let s = 0; s + L <= n; s++) {
      if (!fillable(s, s + L)) continue;
      const leftOk = k === 0 ? (s === 0 || F[0][s]) : (s >= 1 && canEmpty(s - 1) && F[k][s - 1]);
      if (!leftOk) continue;
      const e = s + L;
      const rightOk = k === m - 1 ? (e === n || B[m][e]) : (e < n && canEmpty(e) && B[k + 1][e + 1]);
      if (!rightOk) continue;
      diff[s]++;
      diff[e]--;
    }
  }
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += diff[i];
    if (run > 0) mayFill[i] = 1;
  }
  const out = cells.slice();
  for (let i = 0; i < n; i++) {
    if (!mayEmpty[i] && !mayFill[i]) return null;
    if (out[i] === -1) {
      if (!mayEmpty[i]) out[i] = 1;
      else if (!mayFill[i]) out[i] = 0;
    }
  }
  return out;
}

/**
 * Разбор поля по линиям до неподвижной точки. grid — плоский массив w×h (-1/0/1, меняется на месте).
 * → { ok: false } — противоречие; иначе { ok: true, passes, unknown } (unknown — сколько клеток не определилось).
 */
export function propagate(grid, w, h, clues) {
  const rowDirty = new Uint8Array(h).fill(1);
  const colDirty = new Uint8Array(w).fill(1);
  let passes = 0;
  let changed = true;
  while (changed) {
    changed = false;
    passes++;
    for (let y = 0; y < h; y++) {
      if (!rowDirty[y]) continue;
      rowDirty[y] = 0;
      const line = grid.slice(y * w, y * w + w);
      const res = solveLine(line, clues.rows[y]);
      if (!res) return { ok: false, passes };
      for (let x = 0; x < w; x++) {
        if (line[x] === -1 && res[x] !== -1) {
          grid[y * w + x] = res[x];
          colDirty[x] = 1;
          changed = true;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      if (!colDirty[x]) continue;
      colDirty[x] = 0;
      const line = new Array(h);
      for (let y = 0; y < h; y++) line[y] = grid[y * w + x];
      const res = solveLine(line, clues.cols[x]);
      if (!res) return { ok: false, passes };
      for (let y = 0; y < h; y++) {
        if (line[y] === -1 && res[y] !== -1) {
          grid[y * w + x] = res[y];
          rowDirty[y] = 1;
          changed = true;
        }
      }
    }
  }
  let unknown = 0;
  for (const v of grid) if (v === -1) unknown++;
  return { ok: true, passes, unknown };
}

/** Решается ли поле одной логикой по линиям: { solved, passes, grid }. */
export function lineSolve(w, h, clues) {
  const grid = new Array(w * h).fill(-1);
  const r = propagate(grid, w, h, clues);
  return { solved: r.ok && r.unknown === 0, passes: r.passes, unknown: r.ok ? r.unknown : -1, grid };
}

/**
 * Сколько решений (0, 1 или 2 = «два и больше»): перебор неизвестной клетки с разбором линий на каждом шаге.
 * budget — предел узлов перебора (превышен — null: не знаем).
 */
export function countSolutions(w, h, clues, budget = 20000) {
  let nodes = 0;
  let found = 0;
  let first = null;
  const rec = (grid) => {
    if (found >= 2 || nodes > budget) return;
    nodes++;
    const r = propagate(grid, w, h, clues);
    if (!r.ok) return;
    if (r.unknown === 0) {
      found++;
      if (!first) first = grid.slice();
      return;
    }
    const i = grid.indexOf(-1);
    for (const v of [1, 0]) {
      const next = grid.slice();
      next[i] = v;
      rec(next);
      if (found >= 2 || nodes > budget) return;
    }
  };
  rec(new Array(w * h).fill(-1));
  if (nodes > budget && found < 2) return { count: null, first };
  return { count: found, first };
}
