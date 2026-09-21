// Правила маджонга-пасьянса — без DOM, тестируется в Node.
//
// Плитка свободна, если на ней ничего не лежит (плитка уровнем выше, перекрывающая её хоть частично)
// и открыт левый или правый бок (нет соседа вплотную слева или нет — справа). Снимаются две свободные
// плитки одного вида. Виды: 36 по 4 плитки (144). В китайском наборе вид 34 — «цветы», 35 — «сезоны»:
// у их четырёх плиток разные рисунки (face), но сходятся они между собой как один вид.
//
// Раздача — «по построению» (гарантия решаемости, раздел 7 CLAUDE.md): с пустой раскладки по очереди
// снимаются две случайные свободные позиции, пока не кончатся, и этим парам назначаются одинаковые плитки.
// Раскладка решается ровно в этом порядке. «Перемешать» строится так же — тупика после него не бывает.

import { LAYOUT_BY_ID } from './layouts.js';

export const KINDS = 36;
export const GROUP_KINDS = [34, 35];           // «цветы» и «сезоны» — 4 разных рисунка на вид

// ---------- геометрия: кто кого накрывает и подпирает с боков ----------

const relationCache = new Map();

/** Для каждой плитки раскладки: above — кто на ней лежит, left/right — соседи вплотную на том же уровне. */
export function relations(layoutId) {
  if (relationCache.has(layoutId)) return relationCache.get(layoutId);
  const tiles = LAYOUT_BY_ID[layoutId].tiles;
  const rel = tiles.map(() => ({ above: [], left: [], right: [] }));
  tiles.forEach((a, i) => {
    tiles.forEach((b, j) => {
      if (i === j) return;
      const overlapY = Math.abs(a.y - b.y) < 2;
      if (b.z === a.z + 1 && Math.abs(a.x - b.x) < 2 && overlapY) rel[i].above.push(j);
      if (b.z === a.z && overlapY && b.x === a.x - 2) rel[i].left.push(j);
      if (b.z === a.z && overlapY && b.x === a.x + 2) rel[i].right.push(j);
    });
  });
  relationCache.set(layoutId, rel);
  return rel;
}

/** Свободна ли плитка i, если на поле лежат плитки из alive (Set или массив флагов). */
export function isFree(rel, i, alive) {
  const has = (j) => (alive instanceof Set ? alive.has(j) : alive[j]);
  if (rel[i].above.some(has)) return false;
  return !rel[i].left.some(has) || !rel[i].right.some(has);
}

// ---------- раздача ----------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Порядок снятия для позиций positions (индексы раскладки): пары [a, b], которые можно снимать именно так.
 * null — если попался тупик (например, две последние плитки лежат одна на другой); вызывающий повторяет.
 */
function buildOrder(rel, positions, rng) {
  const alive = new Set(positions);
  const order = [];
  while (alive.size) {
    const free = [...alive].filter((i) => isFree(rel, i, alive));
    if (free.length < 2) return null;
    shuffle(free, rng);
    const [a, b] = free;
    alive.delete(a);
    alive.delete(b);
    order.push([a, b]);
  }
  return order;
}

/** Пары плиток { kind, faces: [f1, f2] } для count плиток: виды по 4 (последний, если нужно, — 2). */
function makePairs(count, rng) {
  const kinds = shuffle([...Array(KINDS).keys()], rng);
  const pairs = [];
  for (const kind of kinds) {
    const left = count / 2 - pairs.length;
    if (left <= 0) break;
    const faces = GROUP_KINDS.includes(kind) ? shuffle([0, 1, 2, 3], rng) : [0, 0, 0, 0];
    pairs.push({ kind, faces: [faces[0], faces[1]] });
    if (left > 1) pairs.push({ kind, faces: [faces[2], faces[3]] });
  }
  return pairs;
}

/** Назначить парам порядка плитки: tiles[i] = { kind, face }. */
function assign(order, pairs, rng) {
  const tiles = {};
  shuffle(pairs, rng);
  order.forEach(([a, b], k) => {
    const { kind, faces } = pairs[k];
    const [fa, fb] = rng() < 0.5 ? faces : [faces[1], faces[0]];
    tiles[a] = { kind, face: fa };
    tiles[b] = { kind, face: fb };
  });
  return tiles;
}

/** Новая раздача: { tiles: [{ kind, face, alive }], solution: [[a, b], …] }. */
export function deal(layoutId, rng = Math.random) {
  const rel = relations(layoutId);
  const n = LAYOUT_BY_ID[layoutId].tiles.length;
  const positions = [...Array(n).keys()];
  for (let attempt = 0; attempt < 500; attempt++) {
    const order = buildOrder(rel, positions, rng);
    if (!order) continue;
    const assigned = assign(order, makePairs(n, rng), rng);
    return { tiles: positions.map((i) => ({ ...assigned[i], alive: true })), solution: order };
  }
  throw new Error(`Не удалось разложить «${layoutId}»`);
}

/**
 * Перемешать оставшиеся плитки так, чтобы их снова можно было разобрать до конца.
 * Меняет state.tiles; возвращает порядок решения (для тестов).
 */
export function reshuffle(state, rng = Math.random) {
  const rel = relations(state.layout);
  const positions = state.tiles.flatMap((t, i) => (t.alive ? [i] : []));
  // пары из оставшихся плиток: по виду, рисунки сохраняются
  const byKind = new Map();
  for (const i of positions) {
    const { kind, face } = state.tiles[i];
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(face);
  }
  const pairs = [];
  for (const [kind, faces] of byKind) {
    for (let k = 0; k + 1 < faces.length; k += 2) pairs.push({ kind, faces: [faces[k], faces[k + 1]] });
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    const order = buildOrder(rel, positions, rng);
    if (!order) continue;
    const assigned = assign(order, pairs.map((p) => ({ ...p, faces: [...p.faces] })), rng);
    for (const i of positions) state.tiles[i] = { ...assigned[i], alive: true };
    state.shuffles += 1;
    state.history = [];                          // после перемешивания отмена прошлых ходов теряет смысл
    return order;
  }
  return null;
}

// ---------- ходы ----------

export const aliveFlags = (state) => state.tiles.map((t) => t.alive);

export function freeTiles(state) {
  const rel = relations(state.layout);
  const alive = aliveFlags(state);
  return state.tiles.flatMap((t, i) => (t.alive && isFree(rel, i, alive) ? [i] : []));
}

export const canMatch = (state, a, b) => a !== b && state.tiles[a].kind === state.tiles[b].kind;

/** Все доступные пары [a, b] (свободные плитки одного вида). */
export function availablePairs(state) {
  const byKind = new Map();
  for (const i of freeTiles(state)) {
    const kind = state.tiles[i].kind;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(i);
  }
  const pairs = [];
  for (const list of byKind.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) pairs.push([list[a], list[b]]);
  }
  return pairs;
}

/** Снять пару. true — снята. */
export function removePair(state, a, b) {
  const free = new Set(freeTiles(state));
  if (!free.has(a) || !free.has(b) || !canMatch(state, a, b)) return false;
  state.tiles[a].alive = false;
  state.tiles[b].alive = false;
  state.history.push([a, b]);
  state.moves += 1;
  return true;
}

/** Вернуть последнюю снятую пару. Возвращает [a, b] или null. */
export function undo(state) {
  const pair = state.history.pop();
  if (!pair) return null;
  for (const i of pair) state.tiles[i].alive = true;
  state.moves -= 1;
  return pair;
}

export const tilesLeft = (state) => state.tiles.filter((t) => t.alive).length;
export const isWon = (state) => tilesLeft(state) === 0;
export const isStuck = (state) => !isWon(state) && availablePairs(state).length === 0;

export function newGame(layoutId, rng = Math.random) {
  const { tiles } = deal(layoutId, rng);
  return { layout: layoutId, tiles, history: [], moves: 0, hints: 0, shuffles: 0 };
}

export function isValidState(s) {
  const layout = LAYOUT_BY_ID[s?.layout];
  if (!layout || !Array.isArray(s.tiles) || s.tiles.length !== layout.tiles.length) return false;
  const tilesOk = s.tiles.every((t) => Number.isInteger(t.kind) && t.kind >= 0 && t.kind < KINDS
    && Number.isInteger(t.face) && t.face >= 0 && t.face < 4 && typeof t.alive === 'boolean');
  // вид на поле — чётное число плиток (иначе не разобрать)
  const counts = new Map();
  for (const t of s.tiles) if (t.alive) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  return tilesOk && [...counts.values()].every((n) => n % 2 === 0)
    && Array.isArray(s.history) && [s.moves, s.hints, s.shuffles].every((n) => Number.isInteger(n) && n >= 0);
}

// ---------- статистика по раскладке ----------

export function emptyStats() {
  return { played: 0, wins: 0, clean: 0 };      // clean — победы без подсказок и перемешиваний
}

export function recordGame(stats, state, won) {
  return {
    played: stats.played + 1,
    wins: stats.wins + (won ? 1 : 0),
    clean: stats.clean + (won && !state.hints && !state.shuffles ? 1 : 0),
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'wins', 'clean'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
