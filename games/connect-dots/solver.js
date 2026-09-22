// Решатель «Соедини точки» по правилам «заполни всё поле»: перебором находит до limit решений.
// Используется генератором банка (проверка единственности) и тестами.
//
// Поле — граф: у обычной клетки один узел, у тоннеля — два: «горизонтальная полоса» (узел = номер клетки,
// соседи только слева и справа) и «вертикальная» (узел n + k, соседи только сверху и снизу). Так «через
// тоннель только прямо» и «тоннель пройден в обе стороны» получаются сами: каждый узел должен быть занят.
// Одной линии нельзя пройти тоннель дважды (крест с самой собой) — как и при рисовании пальцем.

export function buildGraph(level) {
  const { size } = level;
  const n = size * size;
  const walls = new Set(level.walls);
  const tunnelIdx = new Map(level.tunnels.map((t, k) => [t.cell, k]));
  const total = n + level.tunnels.length;
  const nodeOf = (cell, axis) => (tunnelIdx.has(cell) && axis === 'v' ? n + tunnelIdx.get(cell) : cell);
  const cellOf = (node) => (node < n ? node : level.tunnels[node - n].cell);
  const exists = new Array(total).fill(false);
  const adj = Array.from({ length: total }, () => []);
  const partner = new Array(total).fill(-1);
  level.tunnels.forEach((t, k) => {
    partner[t.cell] = n + k;
    partner[n + k] = t.cell;
    exists[n + k] = true;
  });
  for (let a = 0; a < n; a++) {
    if (walls.has(a)) continue;
    exists[a] = true;
    const r = Math.floor(a / size);
    const c = a % size;
    const steps = [];
    if (c > 0) steps.push([a - 1, 'h']);
    if (c < size - 1) steps.push([a + 1, 'h']);
    if (r > 0) steps.push([a - size, 'v']);
    if (r < size - 1) steps.push([a + size, 'v']);
    for (const [b, axis] of steps) if (!walls.has(b)) adj[nodeOf(a, axis)].push(nodeOf(b, axis));
  }
  return { n, total, exists, adj, partner, nodeOf, cellOf, isTunnelNode: (x) => partner[x] >= 0 };
}

/**
 * До limit различных решений: массив «владелец узла» (цвет) для каждого решения. budget — предел шагов перебора;
 * превышен — { aborted: true }.
 */
export function solve(level, { limit = 2, budget = 3_000_000 } = {}) {
  const g = buildGraph(level);
  const { total, adj, partner } = g;
  const owner = new Int16Array(total).fill(-1);
  for (let x = 0; x < total; x++) if (!g.exists[x]) owner[x] = -2;
  const P = level.dots.length;
  const head = new Array(P);
  const target = new Array(P);
  const done = new Array(P).fill(false);
  level.dots.forEach(([a, b], c) => {
    owner[a] = c;
    owner[b] = c;
    // линию ведём от конца, у которого меньше выходов
    const deg = (x) => adj[x].filter((y) => owner[y] === -1).length;
    [head[c], target[c]] = deg(a) <= deg(b) ? [a, b] : [b, a];
  });
  let free = 0;
  for (let x = 0; x < total; x++) if (owner[x] === -1) free++;

  const results = [];
  const keys = new Set();
  let steps = 0;
  let aborted = false;
  const comp = new Int32Array(total);
  const queue = new Int32Array(total);

  const moves = (c) => {
    const out = [];
    for (const x of adj[head[c]]) {
      if (x === target[c]) out.push(x);
      else if (owner[x] === -1 && !(partner[x] >= 0 && owner[partner[x]] === c)) out.push(x);
    }
    return out;
  };

  const active = (y) => {
    const o = owner[y];
    return o >= 0 && !done[o] && (head[o] === y || target[o] === y);
  };

  function feasible() {
    // свободному узлу нужны две связи
    for (let x = 0; x < total; x++) {
      if (owner[x] !== -1) continue;
      let d = 0;
      for (const y of adj[x]) {
        if (owner[y] === -1 || active(y)) d++;
        if (d >= 2) break;
      }
      if (d < 2) return false;
    }
    // области свободных узлов: каждую должна пройти линия, у которой оба конца к ней примыкают
    comp.fill(-1);
    let comps = 0;
    for (let s = 0; s < total; s++) {
      if (owner[s] !== -1 || comp[s] >= 0) continue;
      let qh = 0;
      let qt = 0;
      queue[qt++] = s;
      comp[s] = comps;
      while (qh < qt) {
        const x = queue[qh++];
        for (const y of adj[x]) if (owner[y] === -1 && comp[y] < 0) {
          comp[y] = comps;
          queue[qt++] = y;
        }
      }
      comps++;
    }
    const served = new Uint8Array(comps);
    for (let c = 0; c < P; c++) {
      if (done[c]) continue;
      const hc = new Set();
      let direct = false;
      for (const y of adj[head[c]]) {
        if (owner[y] === -1) hc.add(comp[y]);
        if (y === target[c]) direct = true;
      }
      let shared = false;
      for (const y of adj[target[c]]) if (owner[y] === -1 && hc.has(comp[y])) {
        served[comp[y]] = 1;
        shared = true;
      }
      if (!shared && !direct) return false;
    }
    for (let k = 0; k < comps; k++) if (!served[k]) return false;
    return true;
  }

  function rec() {
    if (results.length >= limit || aborted) return;
    if (++steps > budget) {
      aborted = true;
      return;
    }
    let best = -1;
    let bestMoves = null;
    for (let c = 0; c < P; c++) {
      if (done[c]) continue;
      const m = moves(c);
      if (m.length === 0) return;
      if (best < 0 || m.length < bestMoves.length) {
        best = c;
        bestMoves = m;
        if (m.length === 1) break;
      }
    }
    if (best < 0) {
      // решения различаем по раскраске клеток: другой обход тех же клеток той же линией — то же решение
      if (free === 0) {
        const key = owner.join(',');
        if (!keys.has(key)) {
          keys.add(key);
          results.push(Array.from(owner));
        }
      }
      return;
    }
    const prev = head[best];
    for (const x of bestMoves) {
      head[best] = x;
      if (x === target[best]) done[best] = true;
      else {
        owner[x] = best;
        free--;
      }
      if (feasible()) rec();
      if (x === target[best]) done[best] = false;
      else {
        owner[x] = -1;
        free++;
      }
      head[best] = prev;
      if (results.length >= limit || aborted) return;
    }
  }

  if (feasible()) rec();
  return { solutions: results, aborted, steps };
}
