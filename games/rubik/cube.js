// Модель кубика 3×3 без DOM: 26 кубиков, у каждого — место (x, y, z ∈ −1…1) и поворот (целая матрица 3×3) от
// собранного положения. Наклейка кубика красится по своей «родной» грани: куда смотрела в собранном кубике.
// Оси: x — вправо, y — вверх, z — к зрителю (лицевая грань F). Грани в порядке Коцембы URFDLB, цвета по умолчанию:
// U белая, R красная, F зелёная, D жёлтая, L оранжевая, B синяя.
//
// Поворот слоя — { axis, layer, q }: слой с координатой layer по оси axis поворачивается на q × 90° вокруг +axis
// (правило правой руки). Нотация: R = x, слой 1, −90°; U = y, 1, −90°; F = z, 1, −90°; L, D, B — наоборот; средние
// слои M (как L), E (как D), S (как F). Суффикс: «'» — против часовой, «2» — пол-оборота.

export const FACES = 'URFDLB';
export const FACE_NORMAL = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];

/** Буква → ось, слой и знак четверти «по часовой» (глядя на эту грань снаружи). */
export const MOVE_DEF = {
  U: { axis: 1, layer: 1, cw: -1 },
  D: { axis: 1, layer: -1, cw: 1 },
  R: { axis: 0, layer: 1, cw: -1 },
  L: { axis: 0, layer: -1, cw: 1 },
  F: { axis: 2, layer: 1, cw: -1 },
  B: { axis: 2, layer: -1, cw: 1 },
  M: { axis: 0, layer: 0, cw: 1 },
  E: { axis: 1, layer: 0, cw: 1 },
  S: { axis: 2, layer: 0, cw: -1 },
};

const SUFFIX = ['', '', '2', "'"];

/** Матрица поворота на q × 90° вокруг оси (строки подряд). */
export function rotMatrix(axis, q) {
  const k = ((q % 4) + 4) % 4;
  const c = [1, 0, -1, 0][k];
  const s = [0, 1, 0, -1][k];
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export const mulMat = (a, b) => {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return r;
};
export const mulVec = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
/** Обратная к повороту — транспонированная. */
export const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Все 24 поворота куба (для сохранения поворота кубика одним числом). */
export const ROTATIONS = (() => {
  const out = [];
  const key = (m) => m.join(',');
  const seen = new Set();
  const queue = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  while (queue.length) {
    const m = queue.shift();
    if (seen.has(key(m))) continue;
    seen.add(key(m));
    out.push(m);
    for (let a = 0; a < 3; a++) queue.push(mulMat(rotMatrix(a, 1), m));
  }
  return out;
})();
const ROT_INDEX = new Map(ROTATIONS.map((m, i) => [m.join(','), i]));
export const rotIndex = (m) => ROT_INDEX.get(m.join(',')) ?? -1;

/** Места кубиков (без сердцевины) в постоянном порядке. */
export const HOMES = (() => {
  const out = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) if (x || y || z) out.push([x, y, z]);
    }
  }
  return out;
})();

/** Наклейки кубика в собранном положении: [нормаль, номер грани]. */
export const stickersOf = (home) => FACE_NORMAL.map((n, f) => [n, f]).filter(([n]) => n.some((v, i) => v && v === home[i]));

export function newModel() {
  return { cubies: HOMES.map((h) => ({ home: h, pos: h.slice(), rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] })) };
}

export const cloneModel = (m) => ({ cubies: m.cubies.map((c) => ({ home: c.home, pos: c.pos.slice(), rot: c.rot.slice() })) });

/** Повернуть слой (layer = 'all' — весь кубик). */
export function turnModel(model, axis, layer, q) {
  if (!(((q % 4) + 4) % 4)) return;
  const r = rotMatrix(axis, q);
  for (const c of model.cubies) {
    if (layer !== 'all' && c.pos[axis] !== layer) continue;
    c.pos = mulVec(r, c.pos);
    c.rot = mulMat(r, c.rot);
  }
}

// ---------- нотация ----------

/** «R2» → { face: 'R', k: 2 } (k — сколько четвертей по часовой: 1, 2, 3). */
export function parseMove(token) {
  const m = /^([URFDLBMES])(2|'|2')?$/.exec(token);
  if (!m) return null;
  const k = m[2] === "'" ? 3 : m[2] ? 2 : 1;
  return { face: m[1], k };
}
export const parseMoves = (str) => str.trim().split(/\s+/).filter(Boolean).map(parseMove);
export const formatMove = ({ face, k }) => face + SUFFIX[((k % 4) + 4) % 4];

/** Ход нотации → поворот слоя. */
export function moveToTurn({ face, k }) {
  const d = MOVE_DEF[face];
  return { axis: d.axis, layer: d.layer, q: d.cw * k };
}

/** Поворот слоя → ход нотации (или null, если поворот на 0°). */
export function turnToMove(axis, layer, q) {
  const face = Object.keys(MOVE_DEF).find((f) => MOVE_DEF[f].axis === axis && MOVE_DEF[f].layer === layer);
  if (!face) return null;
  const k = (((q * MOVE_DEF[face].cw) % 4) + 4) % 4;
  return k ? { face, k } : null;
}

export const invertMoves = (moves) => moves.slice().reverse().map(({ face, k }) => ({ face, k: (4 - k) % 4 || 4 }));

export function applyMoves(model, moves) {
  for (const mv of moves) {
    const t = moveToTurn(mv);
    turnModel(model, t.axis, t.layer, t.q);
  }
  return model;
}

// ---------- наклейки ----------

/** Место наклейки i (0…8) на грани f: кубик и нормаль (раскладка граней — как у Коцембы). */
export function faceletPos(f, i) {
  const r = Math.floor(i / 3);
  const c = i % 3;
  switch (f) {
    case 0: return [c - 1, 1, r - 1];
    case 1: return [1, 1 - r, 1 - c];
    case 2: return [c - 1, 1 - r, 1];
    case 3: return [c - 1, -1, 1 - r];
    case 4: return [-1, 1 - r, c - 1];
    default: return [1 - c, 1 - r, -1];
  }
}

const posKey = (p) => (p[0] + 1) * 9 + (p[1] + 1) * 3 + (p[2] + 1);
const normalFace = (n) => FACE_NORMAL.findIndex((v) => v[0] === n[0] && v[1] === n[1] && v[2] === n[2]);

/** 54 цвета (номер родной грани наклейки) в порядке URFDLB по 9. */
export function faceletsOf(model) {
  const at = new Map(model.cubies.map((c) => [posKey(c.pos), c]));
  const out = new Array(54);
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 9; i++) {
      const c = at.get(posKey(faceletPos(f, i)));
      out[f * 9 + i] = normalFace(mulVec(transpose(c.rot), FACE_NORMAL[f]));
    }
  }
  return out;
}

/** Собран — на каждой грани один цвет (середины после M/E/S могут стоять не на своих местах). */
export function isSolvedModel(model) {
  const f = faceletsOf(model);
  for (let face = 0; face < 6; face++) {
    for (let i = 1; i < 9; i++) if (f[face * 9 + i] !== f[face * 9]) return false;
  }
  return true;
}

/**
 * Наклейки «относительно середин»: цвет → грань, на которой сейчас стоит середина этого цвета. Так кубик с
 * переставленными серединами (после M/E/S) — обычный кубик для решателя, а ходы решения — повороты граней мира.
 */
export function relativeFacelets(model) {
  const f = faceletsOf(model);
  const faceOfColor = new Array(6);
  for (let face = 0; face < 6; face++) faceOfColor[f[face * 9 + 4]] = face;
  return f.map((c) => faceOfColor[c]);
}

// ---------- сохранение ----------

/** Кубики → 52 числа: место (0…26) и номер поворота (0…23) каждого по порядку HOMES. */
export const encodeModel = (model) => model.cubies.flatMap((c) => [posKey(c.pos), rotIndex(c.rot)]);

const POS_OF = (k) => [Math.floor(k / 9) - 1, (Math.floor(k / 3) % 3) - 1, (k % 3) - 1];

/** Обратно; null — если записи нельзя верить (кубики не на местах, наклейки внутрь и т. п.). */
export function decodeModel(arr) {
  if (!Array.isArray(arr) || arr.length !== HOMES.length * 2) return null;
  const used = new Set();
  const cubies = [];
  for (let k = 0; k < HOMES.length; k++) {
    const p = arr[2 * k];
    const r = arr[2 * k + 1];
    if (!Number.isInteger(p) || !Number.isInteger(r) || p < 0 || p > 26 || p === 13 || r < 0 || r >= 24 || used.has(p)) return null;
    used.add(p);
    const home = HOMES[k];
    const pos = POS_OF(p);
    const rot = ROTATIONS[r].slice();
    // наклейки смотрят наружу: повёрнутая нормаль — внешняя грань места
    for (const [n] of stickersOf(home)) {
      const w = mulVec(rot, n);
      if (!w.some((v, i) => v && v === pos[i])) return null;
    }
    // кубик того же вида: угол, ребро или середина
    if (home.filter(Boolean).length !== pos.filter(Boolean).length) return null;
    cubies.push({ home, pos, rot });
  }
  return { cubies };
}
