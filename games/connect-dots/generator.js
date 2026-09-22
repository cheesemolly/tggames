// Генератор уровней «Соедини точки» с единственным решением (для банка levels.json; в браузере не нужен).
//
// 1) Стены и тоннели. 2) Поле целиком разбивается на линии случайными «блужданиями» (Варнсдорф: сначала
// в узлы, у которых меньше свободных соседей, — так не остаётся дыр). Концы линий — точки.
// 3) Решатель ищет второе решение; если нашлось — линия разрезается там, где решения расходятся
// (появляется ещё пара точек), и так до единственности. Не вышло — новая попытка.

import { buildGraph, solve } from './solver.js';

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function layout(size, walls, tunnels, rng) {
  const n = size * size;
  const orth = (i) => {
    const r = Math.floor(i / size);
    const c = i % size;
    return [r > 0 && i - size, r < size - 1 && i + size, c > 0 && i - 1, c < size - 1 && i + 1].filter((x) => x !== false);
  };
  const tunnelCells = [];
  const interior = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    if (r > 0 && r < size - 1 && c > 0 && c < size - 1) interior.push(i);
  }
  for (const i of shuffle(interior, rng)) {
    if (tunnelCells.length >= tunnels) break;
    if (orth(i).some((j) => tunnelCells.includes(j))) continue;
    tunnelCells.push(i);
  }
  if (tunnelCells.length < tunnels) return null;
  const wallCells = [];
  for (const i of shuffle([...Array(n).keys()], rng)) {
    if (wallCells.length >= walls) break;
    if (tunnelCells.includes(i) || orth(i).some((j) => tunnelCells.includes(j))) continue;
    wallCells.push(i);
  }
  if (wallCells.length < walls) return null;
  return {
    size,
    walls: wallCells,
    tunnels: tunnelCells.map((cell) => ({ cell, axis: rng() < 0.5 ? 'h' : 'v' })),
    dots: [],
    solution: [],
  };
}

/** Разбиение всех узлов графа на линии (массивы узлов) длиной ≥ 3 с концами не в тоннелях. */
function partition(g, avgLen, rng) {
  const used = new Uint8Array(g.total);
  for (let x = 0; x < g.total; x++) if (!g.exists[x]) used[x] = 1;
  const freeDeg = (x) => g.adj[x].reduce((d, y) => d + (used[y] ? 0 : 1), 0);
  const paths = [];
  const owner = new Int32Array(g.total).fill(-1);

  for (;;) {
    const free = [];
    for (let x = 0; x < g.total; x++) if (!used[x]) free.push(x);
    if (!free.length) break;
    const starts = free.filter((x) => !g.isTunnelNode(x));
    if (!starts.length) return null;
    const minDeg = Math.min(...starts.map(freeDeg));
    const start = pick(starts.filter((x) => freeDeg(x) === minDeg), rng);
    const path = [start];
    used[start] = 1;
    const want = 3 + Math.floor(rng() * avgLen * 1.6);
    for (;;) {
      const h = path.at(-1);
      const next = g.adj[h].filter((y) => !used[y] && !(g.partner[y] >= 0 && path.includes(g.partner[y])));
      if (!next.length) break;
      let chosen;
      if (rng() < 0.75) {
        const m = Math.min(...next.map(freeDeg));
        chosen = pick(next.filter((y) => freeDeg(y) === m), rng);
      } else chosen = pick(next, rng);
      path.push(chosen);
      used[chosen] = 1;
      if (path.length >= want && !g.isTunnelNode(chosen)) break;
    }
    while (path.length && g.isTunnelNode(path.at(-1))) used[path.pop()] = 0;
    if (path.length >= 3) {
      paths.push(path);
      for (const x of path) owner[x] = paths.length - 1;
      continue;
    }
    // короткий обрывок — пристраиваем к концу соседней линии
    let merged = false;
    for (const [end, other] of [[path[0], path.at(-1)], [path.at(-1), path[0]]]) {
      for (const y of g.adj[end]) {
        const k = owner[y];
        if (k < 0) continue;
        const p = paths[k];
        if (p[0] !== y && p.at(-1) !== y) continue;
        const piece = end === path[0] ? [...path].reverse() : [...path];   // piece кончается на end
        // piece: ... → end, потом y — начало/конец p
        const joined = p[0] === y ? [...piece, ...p] : [...p, ...piece.reverse()];
        if (!joined.every((x) => g.partner[x] < 0 || !joined.includes(g.partner[x]))) continue;
        paths[k] = joined;
        for (const x of path) owner[x] = k;
        merged = true;
        break;
      }
      if (merged) break;
      void other;
    }
    if (!merged) return null;
  }
  return paths;
}

function toLevel(base, g, paths) {
  const solution = paths.map((p) => p.map((x) => g.cellOf(x)));
  return { ...base, dots: solution.map((p) => [p[0], p.at(-1)]), solution };
}

/**
 * Уровень с единственным решением или null (попытка не удалась).
 * pairs: [min, max] — сколько пар допускается.
 */
export function generatePuzzle({ size, walls, tunnels, pairs: [minPairs, maxPairs] }, rng = Math.random, budget = 400_000) {
  const base = layout(size, walls, tunnels, rng);
  if (!base) return null;
  const g = buildGraph(base);
  // все узлы связаны
  const seen = new Set();
  const first = [...Array(g.total).keys()].find((x) => g.exists[x]);
  const stack = [first];
  seen.add(first);
  while (stack.length) for (const y of g.adj[stack.pop()]) if (!seen.has(y)) {
    seen.add(y);
    stack.push(y);
  }
  const nodes = g.exists.filter(Boolean).length;
  if (seen.size !== nodes) return null;

  const paths = partition(g, nodes / ((minPairs + maxPairs) / 2), rng);
  if (!paths || paths.length > maxPairs) return null;

  for (;;) {
    const level = toLevel(base, g, paths);
    const { solutions, aborted } = solve(level, { limit: 2, budget });
    if (aborted || !solutions.length) return null;
    if (solutions.length === 1) return paths.length >= minPairs ? level : null;
    if (paths.length >= maxPairs) return null;
    // разрезать нашу линию там, где другое решение с ней не согласно
    const other = solutions.find((s) => paths.some((p, c) => p.some((x) => s[x] !== c)));
    const cuts = [];
    paths.forEach((p, c) => {
      for (let k = 2; k <= p.length - 4; k++) {
        // режем между k и k+1: обе части ≥ 3 узлов, концы — не тоннели
        if (g.isTunnelNode(p[k]) || g.isTunnelNode(p[k + 1])) continue;
        if (other[p[k]] !== c || other[p[k + 1]] !== c) cuts.push([c, k]);
      }
    });
    if (!cuts.length) return null;
    const [c, k] = pick(cuts, rng);
    const p = paths[c];
    paths.splice(c, 1, p.slice(0, k + 1), p.slice(k + 1));
  }
}

/** Случайная решаемая (но не обязательно однозначная) расстановка — для тестов решателя. */
export function randomLevel({ size, walls, tunnels, pairs }, rng = Math.random) {
  const base = layout(size, walls, tunnels, rng);
  if (!base) return null;
  const g = buildGraph(base);
  const paths = partition(g, (g.exists.filter(Boolean).length) / pairs, rng);
  return paths ? toLevel(base, g, paths) : null;
}
