// «Соедини точки» (по видео My Talking Tom Connect, правила как во Flow Free) — без DOM, тестируется в Node.
//
// Поле size×size (size ≤ 8). Пары точек одного цвета соединяются линиями по клеткам (вверх/вниз/влево/вправо);
// линии не пересекаются и не проходят через чужие точки и стены. Раунд пройден, когда соединены все пары
// И ЗАПОЛНЕНЫ ВСЕ КЛЕТКИ. Тоннель — клетка-перекрёсток: сквозь него только прямо, и его надо пройти в обе
// стороны — одна линия вдоль, другая поперёк (одной линии нельзя пересечь саму себя). axis — только для
// рисунка (какая линия «внутри трубы»).
//
// Уровни — из банка levels.json (tools/generate-bank.js): у каждого ровно одно решение (проверено перебором,
// solver.js). В партии уровень случайно поворачивается/отражается и перекрашивается — единственность сохраняется.

export const MAX_SIZE = 8;
export const HINTS_PER_GAME = 3;
export const STATE_VERSION = 2;

// ---------- уровни ----------

/** Раунды 1–20 по порядку (размер, стены, тоннели), дальше — по кругу варианты 8×8. */
const ROUNDS = [
  [3, 0, 0], [4, 0, 0], [4, 0, 0], [5, 0, 0], [5, 0, 0], [5, 1, 0], [6, 0, 0], [6, 1, 0], [6, 2, 0], [6, 0, 1],
  [7, 0, 0], [7, 1, 1], [7, 2, 0], [7, 0, 1], [7, 2, 1], [8, 0, 0], [8, 2, 0], [8, 0, 1], [8, 2, 1], [8, 1, 2],
];
const LOOP = [[8, 0, 1], [8, 2, 1], [8, 1, 2], [8, 3, 1], [8, 0, 2], [8, 2, 2], [8, 1, 3], [8, 0, 3]];

/** Сколько пар допускает генератор для размера поля (меньше пар — длиннее линии, сложнее). */
export const PAIRS = { 3: [2, 3], 4: [3, 4], 5: [4, 5], 6: [5, 6], 7: [5, 7], 8: [6, 9] };

export const tierKey = (size, walls, tunnels) => `${size}:${walls}:${tunnels}`;

/** Все варианты поля, которые встречаются на уровнях (для генератора банка). */
export const ALL_TIERS = [...new Map([...ROUNDS, ...LOOP].map((t) => [tierKey(...t), t])).values()];

/** Размер, стены, тоннели, ключ банка и время на уровень (с) — по номеру уровня (с 1). */
export function levelParams(round) {
  const r = Math.max(1, round);
  const [size, walls, tunnels] = r <= ROUNDS.length ? ROUNDS[r - 1] : LOOP[(r - ROUNDS.length - 1) % LOOP.length];
  const cells = size * size - walls + tunnels;          // тоннель проходится дважды
  const timeSec = Math.round(6 + cells * 0.8 + tunnels * 3);
  return { size, walls, tunnels, key: tierKey(size, walls, tunnels), timeSec };
}

// ---------- геометрия ----------

const rowOf = (i, size) => Math.floor(i / size);
const colOf = (i, size) => i % size;

export function neighbors(i, size) {
  const r = rowOf(i, size);
  const c = colOf(i, size);
  const out = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

export const isAdjacent = (a, b, size) => neighbors(a, size).includes(b);

/** Направление шага a → b: 'h' (влево/вправо) или 'v' (вверх/вниз). */
export const axisOf = (a, b, size) => (rowOf(a, size) === rowOf(b, size) ? 'h' : 'v');

/** Клетка за b по прямой a → b → ? или -1, если за краем. */
export function straightAfter(a, b, size) {
  const dr = rowOf(b, size) - rowOf(a, size);
  const dc = colOf(b, size) - colOf(a, size);
  const r = rowOf(b, size) + dr;
  const c = colOf(b, size) + dc;
  return r >= 0 && r < size && c >= 0 && c < size ? r * size + c : -1;
}

// ---------- банк уровней ----------

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

/** Уровень в строку банка: «размер.стены.тоннели.линии» (клетка — один символ, тоннель — клетка + h/v). */
export function encodeLevel(level) {
  const c = (i) => ALPHABET[i];
  return [
    level.size,
    level.walls.map(c).join(''),
    level.tunnels.map((t) => c(t.cell) + t.axis).join(''),
    level.solution.map((p) => p.map(c).join('')).join(','),
  ].join('.');
}

export function decodeLevel(str) {
  const [size, walls, tunnels, paths] = str.split('.');
  const d = (ch) => ALPHABET.indexOf(ch);
  const solution = paths.split(',').map((p) => [...p].map(d));
  const tunnelList = [];
  for (let k = 0; k < tunnels.length; k += 2) tunnelList.push({ cell: d(tunnels[k]), axis: tunnels[k + 1] });
  return {
    size: Number(size),
    walls: [...walls].map(d),
    tunnels: tunnelList,
    dots: solution.map((p) => [p[0], p.at(-1)]),
    solution,
  };
}

/** Поворот/отражение (t = 0…7) и перестановка цветов — у уровня остаётся ровно одно решение. */
export function transformLevel(level, t, colorOrder = null) {
  const n = level.size;
  const swap = t >= 4;                                   // транспонирование — оси тоннелей меняются
  const map = (i) => {
    let r = Math.floor(i / n);
    let c = i % n;
    if (swap) [r, c] = [c, r];
    if (t & 1) c = n - 1 - c;
    if (t & 2) r = n - 1 - r;
    return r * n + c;
  };
  const order = colorOrder ?? level.solution.map((_, k) => k);
  const solution = order.map((k) => level.solution[k].map(map));
  return {
    size: n,
    walls: level.walls.map(map),
    tunnels: level.tunnels.map(({ cell, axis }) => ({ cell: map(cell), axis: swap ? (axis === 'h' ? 'v' : 'h') : axis })),
    dots: solution.map((p) => [p[0], p.at(-1)]),
    solution,
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Поле уровня из банка ({ tiers: { key: [строки] } }) — случайный, повёрнутый и перекрашенный. */
export function pickLevel(bank, round, rng = Math.random) {
  const { key } = levelParams(round);
  const list = bank.tiers[key];
  if (!list?.length) throw new Error(`В банке нет уровней ${key}`);
  const base = decodeLevel(list[Math.floor(rng() * list.length)]);
  const order = shuffle(base.solution.map((_, k) => k), rng);
  return transformLevel(base, Math.floor(rng() * 8), order);
}

// ---------- проверка линий ----------

/**
 * Проверка набора линий paths (по цвету — массив клеток, начиная с точки). Возвращает
 * { valid, connected: [bool по цвету], filled, total, complete }: filled/total — занято «мест» (клетка;
 * тоннель — два места, вдоль и поперёк); complete — всё соединено, всё заполнено, нарушений нет.
 */
export function checkPaths(level, paths) {
  const { size } = level;
  const walls = new Set(level.walls);
  const tunnels = new Map(level.tunnels.map((t) => [t.cell, t.axis]));
  const dotColor = new Map(level.dots.flatMap(([a, b], color) => [[a, color], [b, color]]));
  const taken = new Set();                     // клетка или «клетка:ось» для тоннеля
  let valid = true;
  const connected = level.dots.map(() => false);

  paths.forEach((path, color) => {
    if (!path?.length) return;
    const [a, b] = level.dots[color];
    if (path[0] !== a && path[0] !== b) valid = false;
    const seen = new Set();
    path.forEach((cell, k) => {
      if (walls.has(cell) || seen.has(cell)) valid = false;      // в т.ч. крест линии с самой собой
      seen.add(cell);
      if (k > 0 && !isAdjacent(path[k - 1], cell, size)) valid = false;
      if (dotColor.has(cell) && dotColor.get(cell) !== color) valid = false;
      if (dotColor.get(cell) === color && k > 0 && k < path.length - 1) valid = false;
      let key = cell;
      if (tunnels.has(cell)) {
        const axis = k > 0 ? axisOf(path[k - 1], cell, size) : 'h';
        if (k > 0 && k < path.length - 1 && axisOf(cell, path[k + 1], size) !== axis) valid = false;   // не поворачивают
        key = `${cell}:${axis}`;
      }
      if (taken.has(key)) valid = false;
      taken.add(key);
    });
    const last = path.at(-1);
    connected[color] = path.length > 1 && (path[0] === a ? last === b : last === a) && !tunnels.has(last);
  });
  const total = size * size - walls.size + tunnels.size;
  const filled = Math.min(taken.size, total);
  return { valid, connected, filled, total, complete: valid && connected.every(Boolean) && filled === total };
}

// ---------- рисование пальцем ----------

/** Копия линий (массив массивов). */
const clone = (paths) => paths.map((p) => [...p]);

function ownerAt(level, paths, cell, axis, except) {
  const isTunnel = level.tunnels.some((t) => t.cell === cell);
  for (let color = 0; color < paths.length; color++) {
    if (color === except) continue;
    const path = paths[color];
    const k = path.indexOf(cell);
    if (k < 0) continue;
    if (!isTunnel) return { color, index: k };
    const along = k > 0 ? axisOf(path[k - 1], cell, level.size) : axisOf(cell, path[k + 1], level.size);
    if (along === axis) return { color, index: k };
  }
  return null;
}

/**
 * Начать линию с клетки: с точки — линия этого цвета начинается заново; с клетки своей линии —
 * линия обрезается до неё и продолжается. Возвращает { color, paths } или null.
 */
export function startAt(level, paths, cell) {
  const dot = level.dots.findIndex(([a, b]) => a === cell || b === cell);
  const next = clone(paths);
  if (dot >= 0) {
    next[dot] = [cell];
    return { color: dot, paths: next };
  }
  for (let color = 0; color < paths.length; color++) {
    const k = paths[color].indexOf(cell);
    if (k >= 0) {
      next[color] = paths[color].slice(0, k + 1);
      return { color, paths: next };
    }
  }
  return null;
}

/**
 * Шаг линии color в соседнюю клетку cell. Возвращает { paths, event }:
 *   'append' — продолжили, 'back' — шаг назад, 'connect' — дошли до своей второй точки,
 *   'cut' — продолжили, разрезав чужую линию, 'blocked' — нельзя (paths не меняются).
 */
export function stepTo(level, paths, color, cell) {
  const { size } = level;
  const path = paths[color];
  const last = path.at(-1);
  const blocked = { paths, event: 'blocked' };
  if (cell === last || !isAdjacent(last, cell, size)) return blocked;

  // шаг назад
  if (path.length > 1 && path.at(-2) === cell) {
    const next = clone(paths);
    next[color].pop();
    return { paths: next, event: 'back' };
  }
  const [a, b] = level.dots[color];
  const target = path[0] === a ? b : a;
  if (last === target && path.length > 1) return blocked;          // уже соединено
  if (level.walls.includes(cell)) return blocked;

  const tunnelHere = level.tunnels.some((t) => t.cell === last);
  const tunnelNext = level.tunnels.some((t) => t.cell === cell);
  const axis = axisOf(last, cell, size);
  // из тоннеля выходят только прямо
  if (tunnelHere && path.length > 1 && axisOf(path.at(-2), last, size) !== axis) return blocked;

  // чужая точка
  const dotColor = level.dots.findIndex(([x, y]) => x === cell || y === cell);
  if (dotColor >= 0 && dotColor !== color) return blocked;

  // своя линия: вернулись на свою клетку — обрезаем до неё (в тоннеле — если на той же оси)
  const own = path.indexOf(cell);
  if (own >= 0) {
    if (tunnelNext && own > 0 && axisOf(path[own - 1], cell, size) !== axis) return blocked;
    const next = clone(paths);
    next[color] = path.slice(0, own + 1);
    return { paths: next, event: 'back' };
  }

  const next = clone(paths);
  let event = 'append';
  const other = ownerAt(level, paths, cell, axis, color);
  if (other) {
    next[other.color] = paths[other.color].slice(0, other.index);   // режем чужую линию перед клеткой
    event = 'cut';
  }
  next[color] = [...path, cell];
  if (cell === target) event = 'connect';
  return { paths: next, event };
}

export function emptyPaths(level) {
  return level.dots.map(() => []);
}

// ---------- партия ----------

export function newGame(bank, rng = Math.random) {
  const level = pickLevel(bank, 1, rng);
  return { v: STATE_VERSION, round: 1, hintsLeft: HINTS_PER_GAME, level, paths: emptyPaths(level), timeLeftMs: null };
}

export function nextRound(state, bank, rng = Math.random) {
  state.round += 1;
  state.level = pickLevel(bank, state.round, rng);
  state.paths = emptyPaths(state.level);
  state.timeLeftMs = null;
}

/**
 * Подсказка: одна линия из решения — сначала несоединённая, иначе соединённая не так, как в решении
 * (чужие линии, мешающие ей, обрезаются). Возвращает цвет или -1.
 */
export function applyHint(state) {
  if (state.hintsLeft <= 0) return -1;
  const { connected } = checkPaths(state.level, state.paths);
  const sol = state.level.solution;
  const same = (p, s) => p.join() === s.join() || p.join() === [...s].reverse().join();
  let color = connected.findIndex((c) => !c);
  if (color < 0) color = state.paths.findIndex((p, k) => !same(p, sol[k]));
  if (color < 0) return -1;
  const solution = sol[color];
  let paths = state.paths.map((p, k) => (k === color ? [] : [...p]));
  paths[color] = [solution[0]];
  for (const cell of solution.slice(1)) paths = stepTo(state.level, paths, color, cell).paths;
  state.paths = paths;
  state.hintsLeft -= 1;
  return color;
}

export function isValidState(s) {
  const lv = s?.level;
  if (s?.v !== STATE_VERSION) return false;             // сохранения старых правил — новая партия
  if (!lv || !Number.isInteger(lv.size) || lv.size < 3 || lv.size > MAX_SIZE) return false;
  const n = lv.size * lv.size;
  const cellOk = (i) => Number.isInteger(i) && i >= 0 && i < n;
  return Array.isArray(lv.dots) && lv.dots.every((d) => Array.isArray(d) && d.length === 2 && d.every(cellOk))
    && Array.isArray(lv.walls) && lv.walls.every(cellOk)
    && Array.isArray(lv.tunnels) && lv.tunnels.every((t) => cellOk(t.cell) && (t.axis === 'h' || t.axis === 'v'))
    && Array.isArray(lv.solution) && lv.solution.length === lv.dots.length
    && lv.solution.every((p) => Array.isArray(p) && p.every(cellOk))
    && Array.isArray(s.paths) && s.paths.length === lv.dots.length && s.paths.every((p) => Array.isArray(p) && p.every(cellOk))
    && [s.round, s.hintsLeft].every((v) => Number.isInteger(v) && v >= 0)
    && (s.timeLeftMs === null || (Number.isFinite(s.timeLeftMs) && s.timeLeftMs >= 0));
}

// ---------- статистика ----------

// Очков в игре нет (решение владельца): успех — насколько далеко удалось зайти.
export function emptyStats() {
  return { played: 0, bestRound: 0, rounds: 0 };
}

export function recordGame(stats, roundsCleared) {
  return {
    played: stats.played + 1,
    bestRound: Math.max(stats.bestRound, roundsCleared),
    rounds: stats.rounds + roundsCleared,
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'bestRound', 'rounds'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
