// «Три в ряд»: правила без DOM. Поле до 9×9 с дырами, фишки 6 цветов, спецфишки, препятствия, цели уровня.
//
// Фишка: { id, k, c, lock?, timer? }
//   k: 'n' обычная, 'rh'/'rv' ракета (ряд/столбец), 'b' бомба, 'p' пропеллер, 'x' призма (без цвета), 't' сундук;
//   c — цвет 0…5 (у призмы и сундука нет); lock — цепи 1–2 (фишка не двигается, совпадение снимает слой);
//   timer — ходов до взрыва (не убрал вовремя — поражение).
// Клетка: cells[i] — 0 дыра / 1 поле; ice[i] — лёд под фишкой 0–2; block[i] — { t, hp }: 'crate' ящик 1–3,
//   'steel' сейф (ломают только спецфишки), 'slime' слизь (растёт, если за ход её не тронули).
//
// Как рождаются спецфишки (как в Royal Match): 4 в линию — ракета вдоль линии; квадрат 2×2 — пропеллер;
// «Г» или «Т» (две линии по 3+) — бомба; 5 в линию — призма. Спецфишку можно сдвинуть с любой фишкой или
// нажать — она сработает (ход тратится). Две спецфишки рядом — комбо (см. swapCombo).
//
// Ход — генератор фаз (playMove / tapMove / useBooster): интерфейс анимирует каждую фазу, бот и тесты
// прокручивают до конца. rng передаётся параметром — всё детерминировано.

export const MAX_SIDE = 9;
export const COLOR_COUNT = 6;
export const SPECIALS = ['rh', 'rv', 'b', 'p', 'x'];
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export const isSpecial = (p) => Boolean(p) && SPECIALS.includes(p.k);
export const hasColor = (p) => Boolean(p) && p.k !== 'x' && p.k !== 't';
export const canSwap = (p) => Boolean(p) && !p.lock;

// ---------- очки ----------
export const SCORE = {
  piece: 20, special: 60, ice: 40, block: 60, chain: 40, treasure: 600, created: { rh: 120, rv: 120, b: 180, p: 120, x: 300 },
  bonusMove: 400,
};

// ---------- геометрия ----------
export const idx = (s, r, c) => r * s.cols + c;
export const rowOf = (s, i) => Math.floor(i / s.cols);
export const colOf = (s, i) => i % s.cols;
const inside = (s, r, c) => r >= 0 && c >= 0 && r < s.rows && c < s.cols;
export const isCell = (s, i) => i >= 0 && i < s.cells.length && s.cells[i] === 1;

export function neighbors(s, i) {
  const r = rowOf(s, i);
  const c = colOf(s, i);
  const out = [];
  for (const [dr, dc] of DIRS) if (inside(s, r + dr, c + dc) && s.cells[idx(s, r + dr, c + dc)]) out.push(idx(s, r + dr, c + dc));
  return out;
}

export const adjacent = (s, a, b) => Math.abs(rowOf(s, a) - rowOf(s, b)) + Math.abs(colOf(s, a) - colOf(s, b)) === 1;

// ---------- создание уровня ----------

/**
 * spec: { level, rows, cols, layout: [строки], colors, moves, goals, treasure?, timer?, slime?, stars? }
 * Символы layout: '.' поле, '_' дыра, 'i'/'I' лёд 1/2, 'c'/'C'/'K' ящик 1/2/3, 'S' сейф, 's' слизь,
 * 'l'/'L' цепь 1/2, 'j' лёд + цепь, 't' фишка с таймером, 'T' сундук на старте, 'h' лёд под ящиком (ящик 1).
 */
export function newGame(spec, rng = Math.random) {
  const { rows, cols } = spec;
  const n = rows * cols;
  const s = {
    v: 1, level: spec.level, rows, cols, colors: spec.colors, moves: spec.moves, movesStart: spec.moves,
    cells: Array(n).fill(0), pieces: Array(n).fill(null), ice: Array(n).fill(0), block: Array(n).fill(null),
    goals: spec.goals.map((g) => ({ ...g, done: 0 })), score: 0, nextId: 1, turn: 0, over: null, reason: null,
    stars: spec.stars ?? [0, 0, 0],
    treasure: spec.treasure ? { total: spec.treasure.total, max: spec.treasure.max ?? 1, spawned: 0, collected: 0, every: spec.treasure.every ?? 4, wait: 0 } : null,
    timer: spec.timer ? { start: spec.timer.start, every: spec.timer.every ?? 0, wait: spec.timer.every ?? 0 } : null,
    slimeHit: false, boss: Boolean(spec.boss),
  };
  const timers = [];
  const treasures = [];
  for (let r = 0; r < rows; r++) {
    const line = spec.layout[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const ch = line[c] ?? '_';
      const i = r * cols + c;
      if (ch === '_' || ch === ' ') continue;
      s.cells[i] = 1;
      if (ch === 'i') s.ice[i] = 1;
      else if (ch === 'I') s.ice[i] = 2;
      else if (ch === 'c') s.block[i] = { t: 'crate', hp: 1 };
      else if (ch === 'C') s.block[i] = { t: 'crate', hp: 2 };
      else if (ch === 'K') s.block[i] = { t: 'crate', hp: 3 };
      else if (ch === 'h') { s.block[i] = { t: 'crate', hp: 1 }; s.ice[i] = 1; }
      else if (ch === 'S') s.block[i] = { t: 'steel', hp: 2 };
      else if (ch === 's') s.block[i] = { t: 'slime', hp: 1 };
      else if (ch === 'l' || ch === 'L' || ch === 'j') s.pieces[i] = { lock: ch === 'L' ? 2 : 1 };
      if (ch === 'j') s.ice[i] = 1;
      if (ch === 't') timers.push(i);
      if (ch === 'T') treasures.push(i);
    }
  }
  for (const i of treasures) {
    s.pieces[i] = { id: s.nextId++, k: 't' };
    if (s.treasure) s.treasure.spawned += 1;
  }
  fillBoard(s, rng);
  for (const i of timers) if (s.pieces[i]) s.pieces[i].timer = s.timer?.start ?? 10;
  return s;
}

/** Все свободные клетки — случайными цветами без готовых совпадений; ходы обязательно есть. */
function fillBoard(s, rng) {
  const empty = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (!s.cells[i] || s.block[i]) continue;
    const p = s.pieces[i];
    if (!p || p.c === undefined && p.k === undefined) empty.push(i);
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const i of empty) {
      const keep = s.pieces[i]?.lock ? { lock: s.pieces[i].lock } : {};
      s.pieces[i] = { id: s.nextId++, k: 'n', c: safeColor(s, i, rng), ...keep };
    }
    if (findMoves(s).length > 0) return;
  }
}

/** Цвет, который не собирает три в ряд и квадрат с уже стоящими соседями (сверху и слева). */
function safeColor(s, i, rng) {
  const options = [];
  for (let c = 0; c < s.colors; c++) if (!wouldMatch(s, i, c)) options.push(c);
  const pool = options.length ? options : Array.from({ length: s.colors }, (_, c) => c);
  return pool[Math.floor(rng() * pool.length)];
}

function colorAt(s, r, c) {
  if (!inside(s, r, c)) return -1;
  const p = s.pieces[idx(s, r, c)];
  return hasColor(p) ? p.c : -1;
}

/** Встала бы фишка цвета color в клетку i в совпадение (в любую сторону)? */
function wouldMatch(s, i, color) {
  const r = rowOf(s, i);
  const c = colOf(s, i);
  const same = (rr, cc) => colorAt(s, rr, cc) === color;
  let h = 1;
  for (let cc = c - 1; same(r, cc); cc--) h++;
  for (let cc = c + 1; same(r, cc); cc++) h++;
  if (h >= 3) return true;
  let v = 1;
  for (let rr = r - 1; same(rr, c); rr--) v++;
  for (let rr = r + 1; same(rr, c); rr++) v++;
  if (v >= 3) return true;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    if (same(r + dr, c) && same(r, c + dc) && same(r + dr, c + dc)) return true;
  }
  return false;
}

// ---------- поиск совпадений ----------

/**
 * Группы совпадений: линии по 3+ и квадраты 2×2 одного цвета, слитые по соседству.
 * → [{ color, cells, maxH, maxV, hv, square, runs: [{ cells, horizontal }] }]
 */
export function findMatches(s) {
  const marked = new Map();          // клетка → { h, v, sq }
  const runs = [];
  const mark = (i, key) => {
    if (!marked.has(i)) marked.set(i, { h: 0, v: 0, sq: false });
    const m = marked.get(i);
    if (key === 'sq') m.sq = true;
    else m[key] = Math.max(m[key], 1);
  };
  for (let r = 0; r < s.rows; r++) {
    let c = 0;
    while (c < s.cols) {
      const color = colorAt(s, r, c);
      let e = c + 1;
      if (color >= 0) while (colorAt(s, r, e) === color) e++;
      if (color >= 0 && e - c >= 3) {
        const cells = [];
        for (let k = c; k < e; k++) {
          cells.push(idx(s, r, k));
          mark(idx(s, r, k), 'h');
        }
        runs.push({ cells, horizontal: true, color });
      }
      c = e;
    }
  }
  for (let c = 0; c < s.cols; c++) {
    let r = 0;
    while (r < s.rows) {
      const color = colorAt(s, r, c);
      let e = r + 1;
      if (color >= 0) while (colorAt(s, e, c) === color) e++;
      if (color >= 0 && e - r >= 3) {
        const cells = [];
        for (let k = r; k < e; k++) {
          cells.push(idx(s, k, c));
          mark(idx(s, k, c), 'v');
        }
        runs.push({ cells, horizontal: false, color });
      }
      r = e;
    }
  }
  const squares = [];
  for (let r = 0; r < s.rows - 1; r++) {
    for (let c = 0; c < s.cols - 1; c++) {
      const color = colorAt(s, r, c);
      if (color < 0 || colorAt(s, r, c + 1) !== color || colorAt(s, r + 1, c) !== color || colorAt(s, r + 1, c + 1) !== color) continue;
      const cells = [idx(s, r, c), idx(s, r, c + 1), idx(s, r + 1, c), idx(s, r + 1, c + 1)];
      cells.forEach((i) => mark(i, 'sq'));
      squares.push({ cells, color });
    }
  }
  if (!marked.size) return [];

  // группы: соседние отмеченные клетки одного цвета
  const seen = new Set();
  const groups = [];
  for (const start of marked.keys()) {
    if (seen.has(start)) continue;
    const color = s.pieces[start].c;
    const cells = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop();
      cells.push(i);
      for (const j of neighbors(s, i)) {
        if (!seen.has(j) && marked.has(j) && hasColor(s.pieces[j]) && s.pieces[j].c === color) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    const set = new Set(cells);
    const own = runs.filter((run) => set.has(run.cells[0]));
    const maxH = Math.max(0, ...own.filter((x) => x.horizontal).map((x) => x.cells.length));
    const maxV = Math.max(0, ...own.filter((x) => !x.horizontal).map((x) => x.cells.length));
    groups.push({ color, cells, maxH, maxV, hv: maxH >= 3 && maxV >= 3, square: squares.some((q) => set.has(q.cells[0])), runs: own });
  }
  return groups;
}

/** Какая спецфишка рождается из группы: 'x' | 'b' | 'rh' | 'rv' | 'p' | null. */
export function specialFor(group) {
  if (Math.max(group.maxH, group.maxV) >= 5) return 'x';
  if (group.hv) return 'b';
  if (group.maxH === 4) return 'rh';
  if (group.maxV === 4) return 'rv';
  if (group.square) return 'p';
  return null;
}

/** Где встанет спецфишка: в клетке, куда сдвинули фишку, иначе на пересечении линий, иначе в середине. */
function specialCell(s, group, prefer) {
  for (const i of prefer ?? []) if (group.cells.includes(i)) return i;
  if (group.hv) {
    const h = group.runs.filter((x) => x.horizontal).flatMap((x) => x.cells);
    const cross = group.runs.filter((x) => !x.horizontal).flatMap((x) => x.cells).find((i) => h.includes(i));
    if (cross !== undefined) return cross;
  }
  const longest = [...group.runs].sort((a, b) => b.cells.length - a.cells.length)[0];
  if (longest) return longest.cells[Math.floor((longest.cells.length - 1) / 2)];
  return [...group.cells].sort((a, b) => a - b)[0];
}

/** Даст ли фишка в клетке i совпадение (для проверки хода). */
function matchAt(s, i) {
  const p = s.pieces[i];
  if (!hasColor(p)) return false;
  const saved = s.pieces[i];
  s.pieces[i] = null;
  const hit = wouldMatch(s, i, saved.c);
  s.pieces[i] = saved;
  return hit;
}

/** Все ходы: пары соседних клеток, обмен которых что-то даёт. → [[a, b], …] */
export function findMoves(s) {
  const out = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (!s.cells[i] || s.block[i]) continue;
    const r = rowOf(s, i);
    const c = colOf(s, i);
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (!inside(s, r + dr, c + dc)) continue;
      const j = idx(s, r + dr, c + dc);
      if (swapValid(s, i, j)) out.push([i, j]);
    }
  }
  return out;
}

export function swapValid(s, a, b) {
  if (!isCell(s, a) || !isCell(s, b) || !adjacent(s, a, b) || s.block[a] || s.block[b]) return false;
  const pa = s.pieces[a];
  const pb = s.pieces[b];
  if (!canSwap(pa) || !canSwap(pb)) return false;
  if (isSpecial(pa) || isSpecial(pb)) return true;          // спецфишка срабатывает от любого сдвига
  s.pieces[a] = pb;
  s.pieces[b] = pa;
  const ok = matchAt(s, a) || matchAt(s, b);
  s.pieces[a] = pa;
  s.pieces[b] = pb;
  return ok;
}

// ---------- удары и спецфишки ----------

function cellsOfRow(s, r) {
  const out = [];
  for (let c = 0; c < s.cols; c++) if (s.cells[idx(s, r, c)]) out.push(idx(s, r, c));
  return out;
}

function cellsOfCol(s, c) {
  const out = [];
  for (let r = 0; r < s.rows; r++) if (s.cells[idx(s, r, c)]) out.push(idx(s, r, c));
  return out;
}

/** Клетки в квадрате радиуса rad вокруг i (бомба — 5×5, две бомбы — 9×9, как в Royal Match); cut — без углов. */
function area(s, i, rad, cut = false) {
  const r0 = rowOf(s, i);
  const c0 = colOf(s, i);
  const out = [];
  for (let r = r0 - rad; r <= r0 + rad; r++) {
    for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (!inside(s, r, c) || !s.cells[idx(s, r, c)]) continue;
      if (cut && Math.abs(r - r0) === rad && Math.abs(c - c0) === rad) continue;
      out.push(idx(s, r, c));
    }
  }
  return out;
}

export const BOMB_RADIUS = 2;

/** Самый частый цвет на поле (для призмы, которую задело). */
function commonColor(s) {
  const count = Array(s.colors).fill(0);
  for (const p of s.pieces) if (hasColor(p) && p.k === 'n') count[p.c] += 1;
  let best = 0;
  for (let c = 1; c < s.colors; c++) if (count[c] > count[best]) best = c;
  return best;
}

/**
 * Куда летит пропеллер: сначала то, что нужно по целям уровня (ящики, слизь, лёд, цепи, фишки нужного цвета),
 * потом любая обычная фишка. rng — чтобы при равенстве выбор был разным.
 */
export function propellerTarget(s, from, rng, taken = new Set()) {
  const want = new Set(s.goals.filter((g) => goalLeft(s, g) > 0).map((g) => g.t));
  const colors = new Set(s.goals.filter((g) => g.t === 'color' && goalLeft(s, g) > 0).map((g) => g.c));
  let best = [];
  let bestScore = 0;
  for (let i = 0; i < s.cells.length; i++) {
    if (!s.cells[i] || i === from || taken.has(i)) continue;
    const b = s.block[i];
    const p = s.pieces[i];
    let score = 0;
    if (b) score = (b.t === 'slime' && want.has('slime')) || ((b.t === 'crate' || b.t === 'steel') && want.has('box')) ? 5 : 1;
    else if (p) {
      if (p.lock && want.has('chain')) score = 4;
      else if (s.ice[i] && want.has('ice')) score = 3 + s.ice[i];
      else if (hasColor(p) && colors.has(p.c)) score = 3;
      else if (p.timer) score = 6;
      else if (p.k === 'n') score = 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = [i];
    } else if (score === bestScore && score > 0) best.push(i);
  }
  if (!best.length) return -1;
  return best[Math.floor(rng() * best.length)];
}

// ---------- цели ----------

export const GOAL_TYPES = ['color', 'ice', 'box', 'slime', 'chain', 'treasure'];

/** Сколько осталось по цели (для льда, ящиков, слизи, цепей — считается по полю). */
export function goalLeft(s, g) {
  if (g.t === 'color' || g.t === 'treasure') return Math.max(0, g.n - g.done);
  let left = 0;
  for (let i = 0; i < s.cells.length; i++) {
    if (!s.cells[i]) continue;
    if (g.t === 'ice') left += s.ice[i] > 0 ? 1 : 0;
    else if (g.t === 'box') left += s.block[i] && (s.block[i].t === 'crate' || s.block[i].t === 'steel') ? 1 : 0;
    else if (g.t === 'slime') left += s.block[i]?.t === 'slime' ? 1 : 0;
    else if (g.t === 'chain') left += s.pieces[i]?.lock ? 1 : 0;
  }
  return left;
}

export const goalsDone = (s) => s.goals.every((g) => goalLeft(s, g) === 0);

// ---------- волна ударов ----------

/**
 * Применяет удары по клеткам и цепную реакцию спецфишек. hits — [{ i, match? }] (match — удар совпадением:
 * он же бьёт соседние ящики и слизь). created — спецфишки, которые встанут после волны ([{ i, piece }]).
 * Возвращает фазу для анимации: removed, activations, blocks, ice, chains, created, score.
 */
function wave(s, hits, created, rng, cascade = 1, seeds = []) {
  const phase = { t: 'clear', removed: [], activations: [], blocks: [], ice: [], chains: [], created: [], score: 0, cascade, timersCleared: 0 };
  const hitOnce = new Set();
  const blockHit = new Set();
  const queue = seeds.map((x) => ({ i: x.i, piece: x.piece }));
  const keep = new Set(created.map((x) => x.i));
  const flyTaken = new Set();

  const hitBlock = (i, bySpecial) => {
    const b = s.block[i];
    if (!b || blockHit.has(i)) return;
    if (b.t === 'steel' && !bySpecial) return;
    blockHit.add(i);
    b.hp -= 1;
    phase.score += SCORE.block;
    if (b.t === 'slime') s.slimeHit = true;
    if (b.hp <= 0) s.block[i] = null;
    phase.blocks.push({ i, t: b.t, hp: Math.max(0, b.hp) });
  };

  const hitCell = (i, { match = false, special = false } = {}) => {
    if (!s.cells[i] || hitOnce.has(i)) return;
    hitOnce.add(i);
    if (s.block[i]) {
      hitBlock(i, special);
      return;
    }
    const p = s.pieces[i];
    if (s.ice[i] > 0 && (!p || p.k !== 't')) {
      s.ice[i] -= 1;
      phase.score += SCORE.ice;
      phase.ice.push({ i, v: s.ice[i] });
    }
    if (!p) return;
    if (p.lock) {
      p.lock -= 1;
      if (!p.lock) delete p.lock;
      phase.score += SCORE.chain;
      phase.chains.push({ i, v: p.lock ?? 0 });
      return;
    }
    if (p.k === 't') return;                                  // сундук не бьётся — его доводят до низа
    if (keep.has(i) && match) {
      // на этом месте рождается спецфишка: старая фишка «вливается» в неё
      phase.removed.push({ i, id: p.id, k: p.k, c: p.c, into: true });
      s.pieces[i] = null;
      countColor(s, p);
      phase.score += SCORE.piece * cascade;
      if (isSpecial(p)) queue.push({ i, piece: p });
      return;
    }
    s.pieces[i] = null;
    countColor(s, p);
    if (p.timer) phase.timersCleared += 1;
    phase.score += isSpecial(p) ? SCORE.special : SCORE.piece * cascade;
    phase.removed.push({ i, id: p.id, k: p.k, c: p.c });
    if (isSpecial(p)) queue.push({ i, piece: p });
  };

  for (const h of hits) {
    hitCell(h.i, h);
    // совпадение бьёт соседние ящики и слизь
    if (h.match) for (const j of neighbors(s, h.i)) if (s.block[j] && s.block[j].t !== 'steel') hitBlock(j, false);
  }

  // цепная реакция спецфишек
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const { i, piece } = queue.shift();
    const act = activation(s, i, piece, rng, flyTaken);
    phase.activations.push(act);
    for (const j of act.cells) hitCell(j, { special: true });
    for (const extra of act.spawn ?? []) queue.push(extra);   // пропеллер принёс ракету/бомбу
  }

  for (const c of created) {
    if (s.pieces[c.i] || s.block[c.i]) continue;
    const piece = { id: s.nextId++, ...c.piece };
    s.pieces[c.i] = piece;
    phase.created.push({ i: c.i, piece: { ...piece } });
    phase.score += SCORE.created[piece.k] ?? 0;
  }
  s.score += phase.score;
  return phase;
}

function countColor(s, p) {
  if (!hasColor(p)) return;
  for (const g of s.goals) if (g.t === 'color' && g.c === p.c && g.done < g.n) g.done += 1;
}

/**
 * Что делает спецфишка, сработав в клетке i: { i, k, cells, target?, targets?, spawn?, turned? }.
 * Кроме обычных видов — комбо (piece.k): 'rr' ракета+ракета (крест), 'rb' ракета+бомба (3 ряда и 3 столбца),
 * 'bb' бомба+бомба (большой взрыв), 'pp' три пропеллера, 'p' с carry — пропеллер несёт ракету/бомбу к цели,
 * 'xx' две призмы (всё поле), 'xn' призма+фишка (весь цвет), 'xs' призма+спецфишка (цвет превращается в неё).
 */
function activation(s, i, piece, rng, flyTaken) {
  const k = piece.k;
  const r = rowOf(s, i);
  const c = colOf(s, i);
  const base = { i, k, c: piece.c };
  if (k === 'rh') return { ...base, cells: cellsOfRow(s, r) };
  if (k === 'rv') return { ...base, cells: cellsOfCol(s, c) };
  if (k === 'b') return { ...base, cells: area(s, i, BOMB_RADIUS) };
  if (k === 'rr') return { ...base, cells: [...cellsOfRow(s, r), ...cellsOfCol(s, c)] };
  if (k === 'rb') {
    const cells = [];
    for (let d = -1; d <= 1; d++) {
      if (r + d >= 0 && r + d < s.rows) cells.push(...cellsOfRow(s, r + d));
      if (c + d >= 0 && c + d < s.cols) cells.push(...cellsOfCol(s, c + d));
    }
    return { ...base, cells };
  }
  if (k === 'bb') return { ...base, cells: area(s, i, BOMB_RADIUS * 2) };
  if (k === 'xx') return { ...base, cells: s.cells.map((v, j) => (v ? j : -1)).filter((j) => j >= 0) };
  if (k === 'x' || k === 'xn') {
    const color = k === 'xn' ? piece.color : commonColor(s);
    return { ...base, color, cells: s.pieces.map((p, j) => (p && p.k === 'n' && p.c === color ? j : -1)).filter((j) => j >= 0) };
  }
  if (k === 'xs') {
    // все обычные фишки цвета становятся такой же спецфишкой — удары их тут же и запускают
    const turned = [];
    for (let j = 0; j < s.pieces.length; j++) {
      const p = s.pieces[j];
      if (!p || p.lock || p.k !== 'n' || p.c !== piece.color) continue;
      const kind = piece.as === 'rh' || piece.as === 'rv' ? (rng() < 0.5 ? 'rh' : 'rv') : piece.as;
      p.k = kind;
      turned.push({ i: j, id: p.id, k: kind, c: p.c });
    }
    return { ...base, color: piece.color, turned, cells: [...turned.map((t) => t.i), ...(piece.other >= 0 ? [piece.other] : [])] };
  }
  if (k === 'p' || k === 'pp') {
    // пропеллер: бьёт крестик вокруг себя и улетает к цели (у 'pp' — три пропеллера к трём целям)
    const around = [i, ...neighbors(s, i)];
    const targets = [];
    for (let n = 0; n < (k === 'pp' ? 3 : 1); n++) {
      const t = propellerTarget(s, i, rng, flyTaken);
      if (t < 0) break;
      flyTaken.add(t);
      targets.push(t);
    }
    const act = { ...base, cells: around, target: targets[0] ?? -1, targets, carry: piece.carry ?? null };
    if (piece.carry && targets.length) act.spawn = [{ i: targets[0], piece: { k: piece.carry, c: piece.c } }];
    else act.cells = [...around, ...targets];
    return act;
  }
  return { ...base, cells: [] };
}

/**
 * Комбо при обмене: две спецфишки или призма с чем угодно. Фишки уже переставлены (a ↔ b).
 * Спецфишки снимаются с поля, вместо них в клетке b срабатывает комбо. → { seed, removed }
 */
function swapCombo(s, a, b) {
  const pa = s.pieces[a];
  const pb = s.pieces[b];
  const take = (i) => {
    const p = s.pieces[i];
    s.pieces[i] = null;
    return { i, id: p.id, k: p.k, c: p.c };
  };
  const kinds = [pa.k, pb.k];
  const rocket = (k) => k === 'rh' || k === 'rv';
  if (kinds[0] === 'x' && kinds[1] === 'x') return { seed: { i: b, piece: { k: 'xx' } }, removed: [take(a), take(b)] };
  if (kinds.includes('x')) {
    const prism = pa.k === 'x' ? a : b;
    const other = prism === a ? b : a;
    const po = s.pieces[other];
    const color = hasColor(po) ? po.c : commonColor(s);
    const removed = [take(prism)];
    if (po.k === 'n' || po.k === 't') return { seed: { i: prism, piece: { k: 'xn', color } }, removed };
    return { seed: { i: prism, piece: { k: 'xs', color, as: po.k, other } }, removed };
  }
  const color = pb.c ?? pa.c;
  const removed = [take(a), take(b)];
  let k;
  let carry;
  if (rocket(kinds[0]) && rocket(kinds[1])) k = 'rr';
  else if (kinds.includes('b') && (rocket(kinds[0]) || rocket(kinds[1]))) k = 'rb';
  else if (kinds[0] === 'b' && kinds[1] === 'b') k = 'bb';
  else if (kinds[0] === 'p' && kinds[1] === 'p') k = 'pp';
  else {
    k = 'p';
    carry = kinds.find((x) => x !== 'p');
  }
  return { seed: { i: b, piece: { k, c: color, ...(carry ? { carry } : {}) } }, removed };
}

// ---------- падение ----------

/**
 * Падение и новые фишки. Фишки падают вниз по столбцу сквозь дыры; ящики, сейфы, слизь и фишки в цепях
 * держат всё, что над ними. Пустую клетку под препятствием заполняет сосед сверху наискосок (как в Royal Match).
 * Новые фишки появляются в верхней клетке столбца, если путь сверху свободен. → { t: 'fall', moves, spawns }
 */
export function settle(s, rng) {
  const moves = new Map();                   // id → { id, from, to }
  const spawns = [];
  const spawnDepth = Array(s.cols).fill(0);
  const blocked = (i) => Boolean(s.block[i]) || Boolean(s.pieces[i]?.lock);
  const fallable = (p) => Boolean(p) && !p.lock;
  const record = (p, from, to) => {
    const m = moves.get(p.id);
    if (m) m.to = to;
    else moves.set(p.id, { id: p.id, from, to });
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 400) {
    changed = false;
    // по столбцам снизу вверх: пустая клетка забирает ближайшую фишку сверху
    for (let c = 0; c < s.cols; c++) {
      for (let r = s.rows - 1; r >= 0; r--) {
        const i = idx(s, r, c);
        if (!s.cells[i] || s.block[i] || s.pieces[i]) continue;
        let found = -1;
        let open = true;                       // путь до верха свободен (для новой фишки)
        for (let rr = r - 1; rr >= 0; rr--) {
          const j = idx(s, rr, c);
          if (!s.cells[j]) continue;           // дыра — проваливаемся сквозь
          if (blocked(j)) {
            open = false;
            break;
          }
          if (s.pieces[j]) {
            found = j;
            break;
          }
        }
        if (found >= 0 && fallable(s.pieces[found])) {
          const p = s.pieces[found];
          s.pieces[found] = null;
          s.pieces[i] = p;
          record(p, found, i);
          changed = true;
        } else if (found < 0 && open) {
          const p = spawnPiece(s, rng);
          s.pieces[i] = p;
          spawnDepth[c] += 1;
          spawns.push({ id: p.id, to: i, depth: spawnDepth[c], piece: { ...p } });
          changed = true;
        }
      }
    }
    if (changed) continue;
    // наискосок: пустая клетка, над которой препятствие, берёт фишку сверху-сбоку, если той некуда падать прямо
    for (let r = s.rows - 1; r >= 1 && !changed; r--) {
      for (let c = 0; c < s.cols && !changed; c++) {
        const i = idx(s, r, c);
        if (!s.cells[i] || s.block[i] || s.pieces[i]) continue;
        for (const dc of [-1, 1]) {
          if (!inside(s, r - 1, c + dc)) continue;
          const j = idx(s, r - 1, c + dc);
          const p = s.pieces[j];
          if (!s.cells[j] || !fallable(p) || s.block[j]) continue;
          const below = idx(s, r, c + dc);
          if (inside(s, r, c + dc) && s.cells[below] && !s.block[below] && !s.pieces[below]) continue;  // упадёт прямо
          s.pieces[j] = null;
          s.pieces[i] = p;
          record(p, j, i);
          changed = true;
          break;
        }
      }
    }
  }
  return { t: 'fall', moves: [...moves.values()].filter((m) => m.from !== m.to), spawns };
}

function spawnPiece(s, rng) {
  const tr = s.treasure;
  if (tr && tr.spawned < tr.total) {
    const onBoard = s.pieces.filter((p) => p?.k === 't').length;
    if (onBoard < tr.max && tr.wait <= 0) {
      tr.spawned += 1;
      tr.wait = tr.every;
      return { id: s.nextId++, k: 't' };
    }
  }
  const p = { id: s.nextId++, k: 'n', c: Math.floor(rng() * s.colors) };
  const tm = s.timer;
  if (tm && tm.every > 0 && tm.wait <= 0) {
    p.timer = tm.start;
    tm.wait = tm.every;
  }
  return p;
}

/** Нижняя клетка столбца — выход для сундуков. */
export function exitCells(s) {
  const out = [];
  for (let c = 0; c < s.cols; c++) {
    for (let r = s.rows - 1; r >= 0; r--) {
      if (s.cells[idx(s, r, c)]) {
        out.push(idx(s, r, c));
        break;
      }
    }
  }
  return out;
}

function collectTreasures(s) {
  const removed = [];
  for (const i of exitCells(s)) {
    const p = s.pieces[i];
    if (p?.k !== 't') continue;
    s.pieces[i] = null;
    removed.push({ i, id: p.id });
    s.treasure && (s.treasure.collected += 1);
    for (const g of s.goals) if (g.t === 'treasure' && g.done < g.n) g.done += 1;
    s.score += SCORE.treasure;
  }
  return removed.length ? { t: 'collect', removed } : null;
}

// ---------- ход ----------

/** Каскад после первой волны: совпадения → падение → сундуки → … пока что-то происходит. */
function* cascade(s, rng, firstPrefer) {
  let prefer = firstPrefer;
  let level = 1;
  for (let guard = 0; guard < 60; guard++) {
    const fall = settle(s, rng);
    if (fall.moves.length || fall.spawns.length) yield fall;
    const got = collectTreasures(s);
    if (got) {
      yield got;
      continue;
    }
    const groups = findMatches(s);
    if (!groups.length) break;
    level += 1;
    yield matchWave(s, groups, prefer, rng, level);
    prefer = null;
  }
}

function matchWave(s, groups, prefer, rng, level) {
  const hits = [];
  const created = [];
  for (const g of groups) {
    const kind = specialFor(g);
    if (kind) created.push({ i: specialCell(s, g, prefer), piece: { k: kind, ...(kind === 'x' ? {} : { c: g.color }) } });
    for (const i of g.cells) hits.push({ i, match: true });
  }
  return wave(s, hits, created, rng, level);
}

/** Конец хода: таймеры, рост слизи, перемешивание без ходов, победа / поражение. */
function* endTurn(s, rng) {
  const phase = { t: 'end', timers: [], slime: null, shuffle: null, over: null };
  s.turn += 1;
  if (s.treasure) s.treasure.wait -= 1;
  if (s.timer && s.timer.every > 0) s.timer.wait -= 1;
  if (!goalsDone(s)) {
    for (let i = 0; i < s.pieces.length; i++) {
      const p = s.pieces[i];
      if (!p?.timer) continue;
      p.timer -= 1;
      phase.timers.push({ i, v: p.timer });
      if (p.timer <= 0) {
        s.over = 'lose';
        s.reason = 'timer';
      }
    }
    if (!s.over && !s.slimeHit) phase.slime = growSlime(s, rng);
  }
  s.slimeHit = false;
  if (!s.over && goalsDone(s)) {
    s.over = 'win';
  } else if (!s.over && s.moves <= 0) {
    s.over = 'lose';
    s.reason = 'moves';
  }
  if (!s.over && !findMoves(s).length && !s.pieces.some(isSpecial)) phase.shuffle = shuffle(s, rng);
  phase.over = s.over;
  yield phase;
}

function growSlime(s, rng) {
  const from = [];
  for (let i = 0; i < s.cells.length; i++) if (s.block[i]?.t === 'slime') from.push(i);
  if (!from.length) return null;
  const options = [];
  for (const i of from) {
    for (const j of neighbors(s, i)) {
      const p = s.pieces[j];
      if (!s.block[j] && p && p.k === 'n' && !p.lock && !p.timer) options.push([i, j]);
    }
  }
  if (!options.length) return null;
  const [src, to] = options[Math.floor(rng() * options.length)];
  const p = s.pieces[to];
  s.pieces[to] = null;
  s.block[to] = { t: 'slime', hp: 1 };
  return { from: src, to, id: p.id };
}

/** Перемешать обычные фишки: без готовых совпадений и с ходом. → { moves: [{ id, from, to }] } */
export function shuffle(s, rng) {
  const cells = [];
  for (let i = 0; i < s.pieces.length; i++) {
    const p = s.pieces[i];
    if (p && p.k === 'n' && !p.lock && !p.timer) cells.push(i);
  }
  const original = cells.map((i) => s.pieces[i]);
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = original.slice();
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    cells.forEach((i, k) => { s.pieces[i] = order[k]; });
    if (attempt > 150) cells.forEach((i) => { s.pieces[i].c = Math.floor(rng() * s.colors); });
    if (!findMatches(s).length && findMoves(s).length) break;
  }
  const moves = [];
  cells.forEach((i) => {
    const from = cells[original.indexOf(s.pieces[i])];
    if (from !== i) moves.push({ id: s.pieces[i].id, from, to: i, c: s.pieces[i].c });
  });
  return { moves };
}

/**
 * Ход обменом a ↔ b. Фазы: swap (или bad) → волны и падения → end.
 */
export function* playMove(s, a, b, rng = Math.random) {
  if (s.over || !swapValid(s, a, b)) {
    yield { t: 'bad', a, b };
    return;
  }
  const pa = s.pieces[a];
  const pb = s.pieces[b];
  s.pieces[a] = pb;
  s.pieces[b] = pa;
  s.moves -= 1;
  yield { t: 'swap', a, b, ida: pa.id, idb: pb.id };

  // pa теперь в b, pb — в a
  const specialA = isSpecial(pa);
  const specialB = isSpecial(pb);
  if ((specialA && specialB) || pa.k === 'x' || pb.k === 'x') {
    const combo = swapCombo(s, a, b);
    const first = wave(s, [], [], rng, 1, [combo.seed]);
    first.removed.unshift(...combo.removed);
    first.combo = combo.seed.piece.k;
    first.score += SCORE.special * 2;
    s.score += SCORE.special * 2;
    yield first;
  } else {
    // обычный обмен: совпадения; сдвинутая спецфишка срабатывает там, куда её сдвинули
    const hits = [];
    const created = [];
    const groups = findMatches(s);
    for (const g of groups) {
      const kind = specialFor(g);
      if (kind) created.push({ i: specialCell(s, g, [b, a]), piece: { k: kind, ...(kind === 'x' ? {} : { c: g.color }) } });
      for (const i of g.cells) hits.push({ i, match: true });
    }
    for (const [p, at] of [[pa, b], [pb, a]]) if (isSpecial(p) && !hits.some((h) => h.i === at)) hits.push({ i: at, special: true });
    yield wave(s, hits, created, rng, 1);
  }
  yield* cascade(s, rng, null);
  yield* endTurn(s, rng);
}

/** Нажатие на спецфишку: она срабатывает на месте (ход тратится). */
export function* tapMove(s, i, rng = Math.random) {
  const p = s.pieces[i];
  if (s.over || !isSpecial(p) || p.lock) {
    yield { t: 'bad', a: i, b: i };
    return;
  }
  s.moves -= 1;
  yield wave(s, [{ i, special: true }], [], rng, 1);
  yield* cascade(s, rng, null);
  yield* endTurn(s, rng);
}

/**
 * Бонусы (ход не тратят): 'hammer' — одна клетка, 'row' — весь ряд, 'shuffle' — перемешать.
 */
export function* useBooster(s, kind, i, rng = Math.random) {
  if (s.over) return;
  if (kind === 'shuffle') {
    yield { t: 'shuffle', ...shuffle(s, rng) };
    return;
  }
  const cells = kind === 'row' ? cellsOfRow(s, rowOf(s, i)) : [i];
  yield { ...wave(s, cells.map((j) => ({ i: j, special: true })), [], rng, 1), booster: kind, at: i };
  yield* cascade(s, rng, null);
  // бонус — не ход: таймеры и слизь не трогаем, но победа и нехватка ходов проверяются
  if (goalsDone(s)) s.over = 'win';
  if (!s.over && !findMoves(s).length && !s.pieces.some(isSpecial)) yield { t: 'end', timers: [], slime: null, shuffle: shuffle(s, rng), over: null };
  else yield { t: 'end', timers: [], slime: null, shuffle: null, over: s.over };
}

/**
 * Финал после победы: оставшиеся ходы превращаются в ракеты (каждая — в случайную обычную фишку) и
 * срабатывают, потом срабатывают спецфишки, что остались на поле. Очки идут в счёт.
 */
export function* finale(s, rng = Math.random) {
  let left = s.moves;
  let guard = 0;
  while (left > 0 && guard++ < 60) {
    const options = [];
    for (let i = 0; i < s.pieces.length; i++) if (s.pieces[i]?.k === 'n' && !s.pieces[i].lock) options.push(i);
    if (!options.length) break;
    const i = options[Math.floor(rng() * options.length)];
    const p = s.pieces[i];
    const k = rng() < 0.5 ? 'rh' : 'rv';
    s.pieces[i] = { ...p, k };
    left -= 1;
    s.moves = left;
    s.score += SCORE.bonusMove;
    yield { t: 'bonus', i, id: p.id, k, c: p.c, left };
    yield wave(s, [{ i, special: true }], [], rng, 1);
    yield* cascade(s, rng, null);
  }
  s.moves = 0;
  for (let round = 0; round < 10; round++) {
    const specials = [];
    for (let i = 0; i < s.pieces.length; i++) if (isSpecial(s.pieces[i]) && !s.pieces[i].lock) specials.push(i);
    if (!specials.length) break;
    yield wave(s, specials.map((i) => ({ i, special: true })), [], rng, 1);
    yield* cascade(s, rng, null);
  }
}

/** Звёзды за счёт: 1 — пройден, 2 и 3 — по порогам уровня. */
export function starsFor(s) {
  if (s.over !== 'win') return 0;
  const [, two, three] = s.stars;
  return s.score >= three ? 3 : s.score >= two ? 2 : 1;
}

/** Прокрутить генератор хода до конца (бот, тесты). → последняя фаза */
export function run(gen) {
  let last = null;
  for (const phase of gen) last = phase;
  return last;
}

// ---------- бот (баланс уровней и тесты) ----------

/**
 * Жадный бот: оценивает каждый возможный ход по тому, что даст первая волна (без каскада) и пользе для целей:
 * фишки нужного цвета, лёд, ящики и слизь рядом, цепи, бомбы с таймером (чем меньше осталось — тем срочнее),
 * клетки под сундуками. Спецфишку оценивает по области, которую она снесёт. Примерно как внимательный человек.
 */
export function botMove(s, rng = Math.random) {
  const moves = findMoves(s);
  let best = null;
  let bestScore = -Infinity;
  const goalColors = new Set(s.goals.filter((g) => g.t === 'color' && goalLeft(s, g) > 0).map((g) => g.c));
  const want = new Set(s.goals.filter((g) => goalLeft(s, g) > 0).map((g) => g.t));
  // самый нижний сундук в каждом столбце: всё, что ниже, выгодно убирать
  const chestRow = new Map();
  for (let i = 0; i < s.pieces.length; i++) {
    if (s.pieces[i]?.k === 't') chestRow.set(colOf(s, i), Math.max(chestRow.get(colOf(s, i)) ?? -1, rowOf(s, i)));
  }
  const below = (i) => chestRow.has(colOf(s, i)) && rowOf(s, i) > chestRow.get(colOf(s, i));
  const cellValue = (i, bySpecial) => {
    const p = s.pieces[i];
    const bl = s.block[i];
    let v = 0;
    if (bl) v += (bl.t === 'steel' && !bySpecial) ? 0 : (want.has(bl.t === 'slime' ? 'slime' : 'box') ? 6 : 1);
    else if (p) {
      if (p.lock) v += want.has('chain') ? 5 : 1;
      else if (p.k !== 't') {
        v += 1;
        if (hasColor(p) && goalColors.has(p.c)) v += 3;
        if (p.timer) v += 4 + Math.max(0, 6 - p.timer) + (p.timer <= 2 ? 60 : 0);
      }
      if (s.ice[i] && want.has('ice')) v += 4;
    }
    if (below(i)) v += 8;
    return v;
  };
  const value = (cells, bySpecial) => cells.reduce((sum, i) => sum + cellValue(i, bySpecial), 0);
  const specialArea = (p, at) => {
    const r = rowOf(s, at);
    const c = colOf(s, at);
    if (p.k === 'rh') return cellsOfRow(s, r);
    if (p.k === 'rv') return cellsOfCol(s, c);
    if (p.k === 'b') return area(s, at, BOMB_RADIUS);
    if (p.k === 'p') return [at, ...neighbors(s, at)];
    return [];
  };
  for (const [a, b] of moves) {
    const pa = s.pieces[a];
    const pb = s.pieces[b];
    let score;
    if (isSpecial(pa) || isSpecial(pb)) {
      if (isSpecial(pa) && isSpecial(pb)) score = 60 + value([...specialArea(pa, b), ...specialArea(pb, b)], true);
      else if (pa.k === 'x' || pb.k === 'x') {
        const other = pa.k === 'x' ? pb : pa;
        const color = hasColor(other) ? other.c : -1;
        const cells = s.pieces.map((p, i) => (p && p.k === 'n' && p.c === color ? i : -1)).filter((i) => i >= 0);
        score = 20 + value(cells, true);
      } else {
        const sp = isSpecial(pa) ? pa : pb;
        const at = sp === pa ? b : a;
        score = 6 + value(specialArea(sp, at), true);
      }
    } else {
      s.pieces[a] = pb;
      s.pieces[b] = pa;
      const groups = findMatches(s);
      score = 0;
      for (const g of groups) {
        score += value(g.cells, false);
        const kind = specialFor(g);
        if (kind === 'x') score += 30;
        else if (kind === 'b') score += 16;
        else if (kind) score += 10;
        // соседние ящики / слизь
        for (const i of g.cells) for (const j of neighbors(s, i)) if (s.block[j] && s.block[j].t !== 'steel') score += want.has(s.block[j].t === 'slime' ? 'slime' : 'box') ? 4 : 0.5;
      }
      s.pieces[a] = pa;
      s.pieces[b] = pb;
      score += (rowOf(s, a) + rowOf(s, b)) * 0.05;           // пониже — больше каскадов
    }
    score += rng() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  // спецфишку можно просто нажать — если это выгоднее любого обмена
  for (let i = 0; i < s.pieces.length; i++) {
    const p = s.pieces[i];
    if (!isSpecial(p) || p.lock || p.k === 'x') continue;
    const score = value(specialArea(p, i), true) - 2;
    if (score > bestScore) {
      bestScore = score;
      best = [i, i];
    }
  }
  return best;
}

/** Сыграть уровень ботом до конца. → итоговое состояние */
export function botPlay(spec, rng) {
  const s = newGame(spec, rng);
  let guard = 0;
  while (!s.over && guard++ < 400) {
    const move = botMove(s, rng);
    if (!move || move[0] === move[1]) {
      const special = move ? move[0] : s.pieces.findIndex((p) => isSpecial(p) && !p.lock);
      if (special < 0) break;
      run(tapMove(s, special, rng));
      continue;
    }
    run(playMove(s, move[0], move[1], rng));
  }
  if (s.over === 'win') run(finale(s, rng));
  return s;
}

// ---------- сохранение ----------

export function isValidState(s) {
  if (!s || s.v !== 1 || !Number.isInteger(s.rows) || !Number.isInteger(s.cols)) return false;
  if (s.rows < 3 || s.cols < 3 || s.rows > MAX_SIDE || s.cols > MAX_SIDE) return false;
  const n = s.rows * s.cols;
  if (![s.cells, s.pieces, s.ice, s.block].every((a) => Array.isArray(a) && a.length === n)) return false;
  if (!Number.isInteger(s.moves) || s.moves < 0 || !Number.isInteger(s.score) || s.score < 0) return false;
  if (!Array.isArray(s.goals) || !s.goals.every((g) => GOAL_TYPES.includes(g.t) && Number.isInteger(g.done))) return false;
  if (!Number.isInteger(s.colors) || s.colors < 3 || s.colors > COLOR_COUNT) return false;
  for (let i = 0; i < n; i++) {
    const p = s.pieces[i];
    if (p === null) continue;
    if (typeof p !== 'object' || !Number.isInteger(p.id) || !['n', 't', ...SPECIALS].includes(p.k)) return false;
    if (hasColor(p) && !(Number.isInteger(p.c) && p.c >= 0 && p.c < COLOR_COUNT)) return false;
  }
  return s.over === null;
}
