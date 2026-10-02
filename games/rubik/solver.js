// Решатель кубика 3×3 — двухфазный алгоритм Коцембы, своя реализация (без DOM; в игре работает в worker.js).
//
// Кубик — «кубики» (CubieCube): cp/co — какой угол стоит на месте i и как повёрнут (0…2), ep/eo — то же для рёбер
// (0/1). Произведение a·b: c.cp[i] = a.cp[b.cp[i]], c.co[i] = a.co[b.cp[i]] + b.co[i] (mod 3), так же рёбра.
// Ход M на кубике A — это A·M.
//
// Фаза 1 доводит кубик до подгруппы G1 = ⟨U, D, R2, L2, F2, B2⟩: все углы и рёбра «правильно повёрнуты» и четыре
// ребра среднего слоя E — в своём слое. Координаты: twist (2187), flip (2048), slice (495 мест для четырёх рёбер).
// Фаза 2 собирает внутри G1 ходами U, D (любыми) и R2, L2, F2, B2: перестановки углов (8! = 40320), восьми рёбер
// верха и низа (40320) и четырёх рёбер среднего слоя (24). Обе фазы — IDA* с таблицами расстояний (поиск в ширину по
// парам координат: max из двух оценок). Решение ищется по нарастающей длине первой фазы; найдено — предел общей
// длины уменьшается, пока не кончится время. Обычно 19–22 хода за десятки миллисекунд.
//
// Таблицы строятся один раз (≈ 1 с на ПК) — buildTables(); в игре это делает воркер заранее.
//
// Наклейки — 54 номера граней в порядке URFDLB (по 9 на грань, раскладка Коцембы), их связь с кубиками —
// CORNER_FACELET / EDGE_FACELET.

export const FACES = 'URFDLB';
const SUFFIX = ['', '2', "'"];

// ---------- кубики ----------

// углы: URF UFL ULB UBR DFR DLF DBL DRB; рёбра: UR UF UL UB DR DF DL DB FR FL BL BR
const MOVE_CUBES = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

export const solvedCubie = () => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

export function multiply(a, b) {
  const c = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
  for (let i = 0; i < 8; i++) {
    c.cp[i] = a.cp[b.cp[i]];
    c.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    c.ep[i] = a.ep[b.ep[i]];
    c.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return c;
}

/** 18 ходов: m = 3 × грань + (сила − 1); грани URFDLB, сила 1, 2, 3 (3 — против часовой). */
export const MOVES = (() => {
  const out = [];
  for (let f = 0; f < 6; f++) {
    let c = solvedCubie();
    for (let p = 0; p < 3; p++) {
      c = multiply(c, MOVE_CUBES[f]);
      out.push(c);
    }
  }
  return out;
})();

export const moveName = (m) => FACES[Math.floor(m / 3)] + SUFFIX[m % 3];
export const moveIndex = (name) => {
  const f = FACES.indexOf(name[0]);
  const p = name.length === 1 ? 0 : name[1] === '2' ? 1 : 2;
  return f * 3 + p;
};

export function applyCubie(c, moves) {
  let r = c;
  for (const m of moves) r = multiply(r, MOVES[m]);
  return r;
}

// ---------- наклейки ----------

const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;
export const CORNER_FACELET = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
export const EDGE_FACELET = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const CORNER_COLOR = [[U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B]];
const EDGE_COLOR = [[U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]];

export function cubieToFacelets(c) {
  const f = new Array(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i;
  for (let i = 0; i < 8; i++) {
    for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + c.co[i]) % 3]] = CORNER_COLOR[c.cp[i]][n];
  }
  for (let i = 0; i < 12; i++) {
    for (let n = 0; n < 2; n++) f[EDGE_FACELET[i][(n + c.eo[i]) % 2]] = EDGE_COLOR[c.ep[i]][n];
  }
  return f;
}

const parity = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s ^= 1;
  return s;
};

/** Наклейки → кубики; null — такой кубик не собрать (перекрученный угол, лишний цвет, нечётная перестановка). */
export function faceletsToCubie(f) {
  if (!Array.isArray(f) || f.length !== 54) return null;
  for (let i = 0; i < 6; i++) if (f[i * 9 + 4] !== i) return null;
  const c = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    while (ori < 3 && f[CORNER_FACELET[i][ori]] !== U && f[CORNER_FACELET[i][ori]] !== D) ori++;
    if (ori === 3) return null;
    const c1 = f[CORNER_FACELET[i][(ori + 1) % 3]];
    const c2 = f[CORNER_FACELET[i][(ori + 2) % 3]];
    const j = CORNER_COLOR.findIndex((cc) => cc[1] === c1 && cc[2] === c2 && cc[0] === f[CORNER_FACELET[i][ori]]);
    if (j < 0) return null;
    c.cp[i] = j;
    c.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELET[i][0]];
    const b = f[EDGE_FACELET[i][1]];
    let j = EDGE_COLOR.findIndex((e) => e[0] === a && e[1] === b);
    if (j >= 0) {
      c.ep[i] = j;
      c.eo[i] = 0;
      continue;
    }
    j = EDGE_COLOR.findIndex((e) => e[0] === b && e[1] === a);
    if (j < 0) return null;
    c.ep[i] = j;
    c.eo[i] = 1;
  }
  if (new Set(c.cp).size !== 8 || new Set(c.ep).size !== 12) return null;
  if (c.co.reduce((s, v) => s + v, 0) % 3 || c.eo.reduce((s, v) => s + v, 0) % 2) return null;
  if (parity(c.cp) !== parity(c.ep)) return null;
  return c;
}

// ---------- координаты ----------

const C = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

export const getTwist = (co) => {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + co[i];
  return t;
};
function setTwist(co, t) {
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    co[i] = t % 3;
    s += co[i];
    t = Math.floor(t / 3);
  }
  co[7] = (3 - (s % 3)) % 3;
}
export const getFlip = (eo) => {
  let t = 0;
  for (let i = 0; i < 11; i++) t = t * 2 + eo[i];
  return t;
};
function setFlip(eo, t) {
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    eo[i] = t % 2;
    s += eo[i];
    t = Math.floor(t / 2);
  }
  eo[11] = s % 2;
}

/** Места четырёх рёбер среднего слоя (8…11) среди 12 — номер сочетания 0…494. */
export const getSlice = (ep) => {
  let r = 0;
  let k = 0;
  for (let s = 0; s < 12; s++) {
    if (ep[s] >= 8) {
      k++;
      r += C(s, k);
    }
  }
  return r;
};
function setSlice(ep, r) {
  const slots = [];
  for (let k = 4; k >= 1; k--) {
    let s = k - 1;
    while (C(s + 1, k) <= r) s++;
    r -= C(s, k);
    slots.push(s);
  }
  const set = new Set(slots);
  let a = 8;
  let b = 0;
  for (let s = 0; s < 12; s++) ep[s] = set.has(s) ? a++ : b++;
}

const permRank = (p, n) => {
  let r = 0;
  for (let i = 0; i < n; i++) {
    let less = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) less++;
    r = r * (n - i) + less;
  }
  return r;
};
function permUnrank(r, n) {
  const digits = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = r % (n - i);
    r = Math.floor(r / (n - i));
  }
  const pool = Array.from({ length: n }, (_, i) => i);
  return digits.map((d) => pool.splice(d, 1)[0]);
}

export const getCornerPerm = (cp) => permRank(cp, 8);
export const getUDEdgePerm = (ep) => permRank(ep, 8);
export const getSlicePerm = (ep) => permRank(ep.slice(8).map((v) => v - 8), 4);

export const SOLVED_SLICE = getSlice([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

// ---------- таблицы ----------

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM8 = 40320;
const N_PERM4 = 24;
/** Ходы второй фазы: U, U2, U', D, D2, D', R2, L2, F2, B2. */
export const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

let T = null;

function buildMoveTables() {
  const twistMove = new Uint16Array(N_TWIST * 18);
  const flipMove = new Uint16Array(N_FLIP * 18);
  const sliceMove = new Uint16Array(N_SLICE * 18);
  const cpMove = new Uint16Array(N_PERM8 * 10);
  const epMove = new Uint16Array(N_PERM8 * 10);
  const spMove = new Uint8Array(N_PERM4 * 10);
  const co = new Array(8);
  const eo = new Array(12);
  const ep = new Array(12);
  for (let t = 0; t < N_TWIST; t++) {
    setTwist(co, t);
    for (let m = 0; m < 18; m++) {
      const mv = MOVES[m];
      const n = new Array(8);
      for (let i = 0; i < 8; i++) n[i] = (co[mv.cp[i]] + mv.co[i]) % 3;
      twistMove[t * 18 + m] = getTwist(n);
    }
  }
  for (let t = 0; t < N_FLIP; t++) {
    setFlip(eo, t);
    for (let m = 0; m < 18; m++) {
      const mv = MOVES[m];
      const n = new Array(12);
      for (let i = 0; i < 12; i++) n[i] = (eo[mv.ep[i]] + mv.eo[i]) % 2;
      flipMove[t * 18 + m] = getFlip(n);
    }
  }
  for (let t = 0; t < N_SLICE; t++) {
    setSlice(ep, t);
    for (let m = 0; m < 18; m++) {
      const mv = MOVES[m];
      const n = new Array(12);
      for (let i = 0; i < 12; i++) n[i] = ep[mv.ep[i]];
      sliceMove[t * 18 + m] = getSlice(n);
    }
  }
  for (let t = 0; t < N_PERM8; t++) {
    const p = permUnrank(t, 8);
    for (let k = 0; k < 10; k++) {
      const mv = MOVES[P2_MOVES[k]];
      const nc = new Array(8);
      const ne = new Array(8);
      for (let i = 0; i < 8; i++) {
        nc[i] = p[mv.cp[i]];
        ne[i] = p[mv.ep[i]];
      }
      cpMove[t * 10 + k] = permRank(nc, 8);
      epMove[t * 10 + k] = permRank(ne, 8);
    }
  }
  for (let t = 0; t < N_PERM4; t++) {
    const p = permUnrank(t, 4).map((v) => v + 8);
    const full = [0, 1, 2, 3, 4, 5, 6, 7, ...p];
    for (let k = 0; k < 10; k++) {
      const mv = MOVES[P2_MOVES[k]];
      const n = new Array(12);
      for (let i = 0; i < 12; i++) n[i] = full[mv.ep[i]];
      spMove[t * 10 + k] = getSlicePerm(n);
    }
  }
  return { twistMove, flipMove, sliceMove, cpMove, epMove, spMove };
}

/** Поиск в ширину по паре координат (a — «быстрая», размер nA; b — вторая): таблица расстояний. */
function pruning(nA, nB, start, moveA, moveB, nMoves) {
  const size = nA * nB;
  const dist = new Int8Array(size).fill(-1);
  let frontier = new Int32Array([start]);
  dist[start] = 0;
  for (let depth = 0; frontier.length; depth++) {
    const next = [];
    for (let q = 0; q < frontier.length; q++) {
      const idx = frontier[q];
      const b = Math.floor(idx / nA);
      const a = idx - b * nA;
      for (let m = 0; m < nMoves; m++) {
        const j = moveB[b * nMoves + m] * nA + moveA[a * nMoves + m];
        if (dist[j] < 0) {
          dist[j] = depth + 1;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Построить таблицы (один раз). → время в мс. */
export function buildTables() {
  if (T) return 0;
  const t0 = Date.now();
  const mt = buildMoveTables();
  T = {
    ...mt,
    p1ts: pruning(N_TWIST, N_SLICE, SOLVED_SLICE * N_TWIST, mt.twistMove, mt.sliceMove, 18),
    p1fs: pruning(N_FLIP, N_SLICE, SOLVED_SLICE * N_FLIP, mt.flipMove, mt.sliceMove, 18),
    p2cs: pruning(N_PERM4, N_PERM8, 0, mt.spMove, mt.cpMove, 10),
    p2es: pruning(N_PERM4, N_PERM8, 0, mt.spMove, mt.epMove, 10),
  };
  return Date.now() - t0;
}

export const tablesReady = () => Boolean(T);

// ---------- поиск ----------

const now = () => (globalThis.performance?.now ? performance.now() : Date.now());

/**
 * Решение кубика: массив номеров ходов (0…17) или null (кубик не собрать). timeLimit — сколько искать короче
 * первого найденного, maxLength — предел длины, который ищется сразу.
 */
export function solveCubie(cube, { maxLength = 22, timeLimit = 120 } = {}) {
  buildTables();
  const { twistMove, flipMove, sliceMove, cpMove, epMove, spMove, p1ts, p1fs, p2cs, p2es } = T;
  const t0 = getTwist(cube.co);
  const f0 = getFlip(cube.eo);
  const s0 = getSlice(cube.ep);
  const deadline = now() + timeLimit;
  let limit = maxLength;
  let best = null;
  let stop = false;
  const path1 = [];
  const path2 = [];

  const h1 = (t, f, s) => Math.max(p1ts[s * N_TWIST + t], p1fs[s * N_FLIP + f]);

  function search2(cp, ep, sp, togo, lastFace) {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0;
    for (let k = 0; k < 10; k++) {
      const m = P2_MOVES[k];
      const face = Math.floor(m / 3);
      if (face === lastFace || (face + 3) % 6 === lastFace && face < lastFace) continue;
      const ncp = cpMove[cp * 10 + k];
      const nep = epMove[ep * 10 + k];
      const nsp = spMove[sp * 10 + k];
      if (Math.max(p2cs[ncp * 24 + nsp], p2es[nep * 24 + nsp]) > togo - 1) continue;
      path2.push(m);
      if (search2(ncp, nep, nsp, togo - 1, face)) return true;
      path2.pop();
    }
    return false;
  }

  function phase2() {
    const c = applyCubie(cube, path1);
    const cp = getCornerPerm(c.cp);
    const ep = getUDEdgePerm(c.ep);
    const sp = getSlicePerm(c.ep);
    const lastFace = path1.length ? Math.floor(path1[path1.length - 1] / 3) : -1;
    const h = Math.max(p2cs[cp * 24 + sp], p2es[ep * 24 + sp]);
    const maxD = limit - path1.length;
    for (let d = h; d <= maxD; d++) {
      path2.length = 0;
      if (search2(cp, ep, sp, d, lastFace)) {
        best = [...path1, ...path2];
        limit = best.length - 1;
        if (now() > deadline) stop = true;
        return;
      }
    }
  }

  function search1(t, f, s, togo, lastFace) {
    if (stop) return;
    if (togo === 0) {
      if (t || f || s !== SOLVED_SLICE) return;
      // последний ход первой фазы — четверть R, L, F или B: иначе это решение уже найдено короче
      if (path1.length) {
        const m = path1[path1.length - 1];
        if (P2_MOVES.includes(m)) return;
      }
      phase2();
      if (best && now() > deadline) stop = true;
      return;
    }
    for (let face = 0; face < 6; face++) {
      if (face === lastFace || ((face + 3) % 6 === lastFace && face < lastFace)) continue;
      for (let p = 0; p < 3; p++) {
        const m = face * 3 + p;
        const nt = twistMove[t * 18 + m];
        const nf = flipMove[f * 18 + m];
        const ns = sliceMove[s * 18 + m];
        if (h1(nt, nf, ns) > togo - 1) continue;
        path1.push(m);
        search1(nt, nf, ns, togo - 1, face);
        path1.pop();
        if (stop) return;
      }
    }
  }

  for (let d1 = h1(t0, f0, s0); d1 <= limit && !stop; d1++) {
    search1(t0, f0, s0, d1, -1);
    if (best && now() > deadline) break;
    if (!best && d1 >= 20) break;
  }
  return best;
}

/** Наклейки (номера граней URFDLB) → решение в нотации: ['R', "U'", 'F2', …]; null — не собрать. */
export function solveFacelets(facelets, opts) {
  const c = faceletsToCubie(facelets);
  if (!c) return null;
  const m = solveCubie(c, opts);
  return m ? m.map(moveName) : null;
}

// ---------- случайное положение ----------

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Равновероятное случайное положение кубика (любое из 43 квинтиллионов). */
export function randomCubie(rng = Math.random) {
  const cp = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng);
  const ep = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rng);
  if (parity(cp) !== parity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]];
  const co = new Array(8);
  const eo = new Array(12);
  setTwist(co, Math.floor(rng() * N_TWIST));
  setFlip(eo, Math.floor(rng() * N_FLIP));
  return { cp, co, ep, eo };
}

/**
 * Перемешивание «из случайного положения», как у WCA: случайный кубик решается, перемешивание — решение задом
 * наперёд. → { moves: ['R', …], cube } (cube — к чему приводит перемешивание).
 */
export function randomScramble(rng = Math.random, opts = {}) {
  for (;;) {
    const cube = randomCubie(rng);
    const sol = solveCubie(cube, { maxLength: 22, timeLimit: 60, ...opts });
    if (!sol || sol.length < 2) continue;
    const inv = sol.slice().reverse().map((m) => Math.floor(m / 3) * 3 + (2 - (m % 3)));
    return { moves: inv.map(moveName), cube };
  }
}

/**
 * Запасное перемешивание без таблиц: 25 случайных ходов, без повтора грани и без «R L R»
 * (две противоположные грани подряд — только в одном порядке).
 */
export function randomMoveScramble(rng = Math.random, length = 25) {
  const out = [];
  let last = -1;
  let prev = -1;
  while (out.length < length) {
    const f = Math.floor(rng() * 6);
    if (f === last) continue;
    if (last >= 0 && (f + 3) % 6 === last && (f === prev || f < last)) continue;
    out.push(FACES[f] + SUFFIX[Math.floor(rng() * 3)]);
    prev = last;
    last = f;
  }
  return out;
}
