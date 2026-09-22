// «Соедини точки» (по видео My Talking Tom Connect) — правила и генерация уровней, без DOM, тестируется в Node.
//
// Поле size×size (size ≤ 8). Пары точек одного цвета соединяются линиями по клеткам (вверх/вниз/влево/вправо);
// линии не пересекаются и не проходят через чужие точки и стены. Заполнять всё поле НЕ нужно.
// Тоннель — клетка-перекрёсток: через неё можно пройти только насквозь (не поворачивая), по одной линии
// на каждое направление — одна вдоль (горизонталь), другая поперёк (вертикаль). axis — только для рисунка
// (какая линия «внутри трубы»).
//
// Уровень строится от решения: сначала прокладываются случайные линии, потом их концы становятся точками —
// поэтому любой уровень решаем. Раунды усложняются: поле растёт, с 7-го — стены, с 12-го — тоннели.

export const MAX_SIZE = 8;
export const HINTS_PER_GAME = 3;

// ---------- параметры раунда ----------

/** Размер поля, число пар, стен и тоннелей, время на раунд (с) — по номеру раунда (с 1). */
export function levelParams(round) {
  const r = Math.max(1, round);
  const size = r <= 2 ? 3 : r <= 5 ? 4 : r <= 9 ? 5 : r <= 14 ? 6 : r <= 20 ? 7 : MAX_SIZE;
  const pairsBase = { 3: 3, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7 }[size];
  const pairs = Math.min(pairsBase + (r % 3 === 0 ? 1 : 0) + (r > 26 ? 1 : 0) + (r > 34 ? 1 : 0), size + 1);
  const walls = r < 7 ? 0 : Math.min(1 + Math.floor((r - 7) / 4), 4);
  const tunnels = r < 12 ? 0 : Math.min(1 + Math.floor((r - 12) / 5), 3);
  const timeSec = 12 + pairs * 5 + size * 2 + tunnels * 4;
  return { size, pairs, walls, tunnels, timeSec };
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

// ---------- генерация ----------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Одна попытка: стены и тоннели, затем линии-случайные блуждания (через тоннели — только насквозь).
 * Возвращает уровень или null.
 */
function tryLevel({ size, pairs, walls, tunnels }, rng) {
  const n = size * size;
  const wallSet = new Set();
  const tunnelMap = new Map();          // клетка → 'h' | 'v' (рисунок)
  const interior = [];
  for (let i = 0; i < n; i++) {
    const r = rowOf(i, size);
    const c = colOf(i, size);
    if (r > 0 && r < size - 1 && c > 0 && c < size - 1) interior.push(i);
  }
  for (const i of shuffle([...interior], rng).slice(0, tunnels)) tunnelMap.set(i, rng() < 0.5 ? 'h' : 'v');
  const free = shuffle([...Array(n).keys()].filter((i) => !tunnelMap.has(i)), rng);
  for (const i of free) {
    if (wallSet.size >= walls) break;
    // стена не рядом с тоннелем (иначе сквозь него не пройти)
    if (neighbors(i, size).some((j) => tunnelMap.has(j))) continue;
    wallSet.add(i);
  }

  const cellColor = new Map();          // обычная клетка → цвет
  const tunnelUse = new Map([...tunnelMap.keys()].map((i) => [i, { h: -1, v: -1 }]));
  const solution = [];
  const budget = Math.max(3, Math.floor(((n - wallSet.size) * 0.8) / pairs));

  const enterable = (cell) => !wallSet.has(cell) && !tunnelMap.has(cell) && !cellColor.has(cell);

  for (let color = 0; color < pairs; color++) {
    const starts = shuffle([...Array(n).keys()].filter(enterable), rng);
    let placed = null;
    for (const start of starts.slice(0, 12)) {
      const target = 3 + Math.floor(rng() * Math.max(1, budget - 1));
      const path = [start];
      const used = new Set([start]);
      const tunnelSteps = [];
      while (path.length < target) {
        const cur = path.at(-1);
        let moved = false;
        for (const next of shuffle(neighbors(cur, size), rng)) {
          if (used.has(next)) continue;
          if (tunnelMap.has(next)) {
            const axis = axisOf(cur, next, size);
            const beyond = straightAfter(cur, next, size);
            if (tunnelUse.get(next)[axis] !== -1 || beyond < 0 || used.has(beyond) || !enterable(beyond)) continue;
            path.push(next, beyond);
            used.add(next);
            used.add(beyond);
            tunnelSteps.push([next, axis]);
            moved = true;
            break;
          }
          if (!enterable(next)) continue;
          path.push(next);
          used.add(next);
          moved = true;
          break;
        }
        if (!moved) break;
      }
      if (path.length >= 3) {
        placed = { path, tunnelSteps };
        break;
      }
    }
    if (!placed) return null;
    for (const cell of placed.path) if (!tunnelMap.has(cell)) cellColor.set(cell, color);
    for (const [cell, axis] of placed.tunnelSteps) tunnelUse.get(cell)[axis] = color;
    solution.push(placed.path);
  }

  // тоннель должен быть нужен: сквозь каждый проходит хотя бы одна линия решения
  for (const use of tunnelUse.values()) if (use.h === -1 && use.v === -1) return null;

  return {
    size,
    walls: [...wallSet],
    tunnels: [...tunnelMap].map(([cell, axis]) => ({ cell, axis })),
    dots: solution.map((p) => [p[0], p.at(-1)]),
    solution,
  };
}

export function generateLevel(round, rng = Math.random) {
  const params = levelParams(round);
  for (let attempt = 0; attempt < 400; attempt++) {
    const level = tryLevel(params, rng);
    if (level) return level;
  }
  // запасной путь: без тоннелей и стен (не должен понадобиться — проверено тестом)
  for (let attempt = 0; attempt < 400; attempt++) {
    const level = tryLevel({ ...params, walls: 0, tunnels: 0 }, rng);
    if (level) return level;
  }
  throw new Error(`Не удалось собрать раунд ${round}`);
}

// ---------- проверка линий ----------

/**
 * Проверка набора линий paths (по цвету — массив клеток, начиная с точки). Возвращает
 * { valid, connected: [bool по цвету], complete } — complete: все пары соединены и нет нарушений.
 */
export function checkPaths(level, paths) {
  const { size } = level;
  const walls = new Set(level.walls);
  const tunnels = new Map(level.tunnels.map((t) => [t.cell, t.axis]));
  const dotColor = new Map(level.dots.flatMap(([a, b], color) => [[a, color], [b, color]]));
  const cellOwner = new Map();
  const tunnelOwner = new Map();
  let valid = true;
  const connected = level.dots.map(() => false);

  paths.forEach((path, color) => {
    if (!path?.length) return;
    const [a, b] = level.dots[color];
    if (path[0] !== a && path[0] !== b) valid = false;
    const seen = new Set();
    path.forEach((cell, k) => {
      if (walls.has(cell) || seen.has(cell)) valid = false;
      seen.add(cell);
      if (k > 0 && !isAdjacent(path[k - 1], cell, size)) valid = false;
      if (dotColor.has(cell) && dotColor.get(cell) !== color) valid = false;
      if (dotColor.get(cell) === color && k > 0 && k < path.length - 1) valid = false;
      if (tunnels.has(cell)) {
        if (k === 0 || k === path.length - 1) return;       // незаконченная линия может стоять в тоннеле
        const axis = axisOf(path[k - 1], cell, size);
        if (axisOf(cell, path[k + 1], size) !== axis) valid = false;   // в тоннеле не поворачивают
        const key = `${cell}:${axis}`;
        if (tunnelOwner.has(key)) valid = false;
        tunnelOwner.set(key, color);
      } else {
        if (cellOwner.has(cell)) valid = false;
        cellOwner.set(cell, color);
      }
    });
    const last = path.at(-1);
    connected[color] = path.length > 1 && (path[0] === a ? last === b : last === a) && !tunnels.has(last);
  });
  return { valid, connected, complete: valid && connected.every(Boolean) };
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

export function newGame(rng = Math.random) {
  const level = generateLevel(1, rng);
  return { round: 1, score: 0, hintsLeft: HINTS_PER_GAME, level, paths: emptyPaths(level), timeLeftMs: null };
}

/** Очки за раунд: за пары и размер + бонус за оставшееся время (если таймер включён). */
export function roundPoints(level, timeLeftMs = null) {
  const base = level.dots.length * level.size * 5;
  const bonus = timeLeftMs === null ? 0 : Math.round(timeLeftMs / 1000) * 3;
  return base + bonus;
}

export function nextRound(state, rng = Math.random) {
  state.round += 1;
  state.level = generateLevel(state.round, rng);
  state.paths = emptyPaths(state.level);
  state.timeLeftMs = null;
}

/** Подсказка: одна ещё не соединённая линия из решения (чужие линии, мешающие ей, обрезаются). */
export function applyHint(state) {
  if (state.hintsLeft <= 0) return -1;
  const { connected } = checkPaths(state.level, state.paths);
  const color = connected.findIndex((c) => !c);
  if (color < 0) return -1;
  const solution = state.level.solution[color];
  let paths = state.paths.map((p, k) => (k === color ? [] : [...p]));
  paths[color] = [solution[0]];
  for (const cell of solution.slice(1)) paths = stepTo(state.level, paths, color, cell).paths;
  state.paths = paths;
  state.hintsLeft -= 1;
  return color;
}

export function isValidState(s) {
  const lv = s?.level;
  if (!lv || !Number.isInteger(lv.size) || lv.size < 3 || lv.size > MAX_SIZE) return false;
  const n = lv.size * lv.size;
  const cellOk = (i) => Number.isInteger(i) && i >= 0 && i < n;
  return Array.isArray(lv.dots) && lv.dots.every((d) => Array.isArray(d) && d.length === 2 && d.every(cellOk))
    && Array.isArray(lv.walls) && lv.walls.every(cellOk)
    && Array.isArray(lv.tunnels) && lv.tunnels.every((t) => cellOk(t.cell) && (t.axis === 'h' || t.axis === 'v'))
    && Array.isArray(lv.solution) && lv.solution.length === lv.dots.length
    && Array.isArray(s.paths) && s.paths.length === lv.dots.length && s.paths.every((p) => Array.isArray(p) && p.every(cellOk))
    && [s.round, s.score, s.hintsLeft].every((v) => Number.isInteger(v) && v >= 0)
    && (s.timeLeftMs === null || (Number.isFinite(s.timeLeftMs) && s.timeLeftMs >= 0));
}

// ---------- статистика ----------

export function emptyStats() {
  return { played: 0, bestRound: 0, bestScore: 0, rounds: 0 };
}

export function recordGame(stats, state, roundsCleared) {
  return {
    played: stats.played + 1,
    bestRound: Math.max(stats.bestRound, roundsCleared),
    bestScore: Math.max(stats.bestScore, state.score),
    rounds: stats.rounds + roundsCleared,
  };
}

export function isValidStats(s) {
  return Boolean(s) && ['played', 'bestRound', 'bestScore', 'rounds'].every((k) => Number.isInteger(s[k]) && s[k] >= 0);
}
