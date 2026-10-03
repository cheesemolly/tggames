// Правила Ханойской башни без DOM: стержни (3 или 4), диски 0…n−1 (0 — самый маленький), башня стоит на первом
// стержне и переезжает на последний. Брать можно только верхний диск, класть — на пустой стержень или на больший
// диск. Отмена без ограничений (каждая — тоже ход). Минимум ходов: 3 стержня — 2ⁿ − 1, 4 стержня — числа
// Фрейма — Стюарта (их оптимальность доказана, Bousch 2014; тест сверяет с поиском в ширину).
//
// Подсказка — лучший ход из ЛЮБОЙ позиции (и после ошибок): поиск в ширину от собранной башни по всем
// расстановкам (стержень каждого диска — цифра числа в системе по основанию «стержней»): 3ⁿ или 4ⁿ позиций,
// не больше 4¹⁰ ≈ 1 млн — таблица расстояний строится один раз на размер (сотня миллисекунд) и кэшируется.

export const DISKS = [3, 4, 5, 6, 7, 8, 9, 10];
export const PEGS = [3, 4];
export const DEFAULT_DISKS = 4;
export const DEFAULT_PEGS = 3;

/** Минимум ходов, чтобы перенести башню из n дисков на p стержнях. */
export function minMoves(n, p = 3) {
  if (p === 3) return 2 ** n - 1;
  // Фрейм — Стюарт: часть из k дисков — на свободный стержень (всеми четырьмя), остальные — тремя, потом k обратно
  const fs = [0];
  for (let m = 1; m <= n; m++) {
    let best = Infinity;
    for (let k = 0; k < m; k++) best = Math.min(best, 2 * fs[k] + 2 ** (m - k) - 1);
    fs.push(best);
  }
  return fs[n];
}

export const target = (game) => game.pegs - 1;

export function newGame(n = DEFAULT_DISKS, pegs = DEFAULT_PEGS) {
  const towers = Array.from({ length: pegs }, () => []);
  for (let d = n - 1; d >= 0; d--) towers[0].push(d);
  return { v: 1, n, pegs, towers, moves: 0, time: 0, history: [], hints: 0, done: false };
}

export const top = (game, p) => {
  const t = game.towers[p];
  return t.length ? t[t.length - 1] : -1;
};

/** Можно ли переложить верхний диск со стержня from на to. */
export function canMove(game, from, to) {
  if (from === to || from < 0 || to < 0 || from >= game.pegs || to >= game.pegs) return false;
  const d = top(game, from);
  if (d < 0) return false;
  const under = top(game, to);
  return under < 0 || under > d;
}

export const isSolved = (game) => game.towers[target(game)].length === game.n;

/** Ход: → { disk, from, to } или null (нельзя). Собранная башня — партия окончена. */
export function move(game, from, to) {
  if (game.done || !canMove(game, from, to)) return null;
  const disk = game.towers[from].pop();
  game.towers[to].push(disk);
  game.moves++;
  game.history.push([from, to]);
  if (game.history.length > 2000) game.history.shift();
  if (isSolved(game)) game.done = true;
  return { disk, from, to };
}

/** Отмена последнего хода (тоже ход). → { disk, from, to } или null. */
export function undo(game) {
  if (game.done || !game.history.length) return null;
  const [from, to] = game.history.pop();
  const disk = game.towers[to].pop();
  game.towers[from].push(disk);
  game.moves++;
  return { disk, from: to, to: from };
}

/** Законные ходы позиции: [from, to]. */
export function legalMoves(game) {
  const out = [];
  for (let a = 0; a < game.pegs; a++) for (let b = 0; b < game.pegs; b++) if (canMove(game, a, b)) out.push([a, b]);
  return out;
}

// ---------- подсказка: расстояние до собранной башни ----------

/** Номер позиции: Σ стержень(диск d) · pᵈ. */
export function encode(towers, p) {
  let code = 0;
  towers.forEach((t, peg) => t.forEach((d) => { code += peg * p ** d; }));
  return code;
}

const tables = new Map();

/**
 * Расстояние (в ходах) от каждой позиции до собранной башни на последнем стержне — поиск в ширину.
 * Ходы обратимы, поэтому расстояние «до цели» = расстояние «от цели».
 */
export function distances(n, p) {
  const key = `${p}-${n}`;
  if (tables.has(key)) return tables.get(key);
  const size = p ** n;
  const pow = Array.from({ length: n }, (_, d) => p ** d);
  const dist = new Uint16Array(size).fill(65535);
  const queue = new Uint32Array(size);
  const goal = size - 1;                                  // все диски на последнем стержне: Σ (p − 1)·pᵈ
  dist[goal] = 0;
  queue[0] = goal;
  let head = 0;
  let tail = 1;
  const tops = new Int8Array(p);
  const pegOf = new Int8Array(n);
  while (head < tail) {
    const s = queue[head++];
    const next = dist[s] + 1;
    tops.fill(-1);
    // верхний диск стержня — самый маленький на нём: идём от больших к меньшим, перезаписывая
    let rest = s;
    for (let d = 0; d < n; d++) {
      pegOf[d] = rest % p;
      rest = (rest - pegOf[d]) / p;
    }
    for (let d = n - 1; d >= 0; d--) tops[pegOf[d]] = d;
    for (let a = 0; a < p; a++) {
      const d = tops[a];
      if (d < 0) continue;
      for (let b = 0; b < p; b++) {
        if (b === a || (tops[b] >= 0 && tops[b] < d)) continue;
        const t = s + (b - a) * pow[d];
        if (dist[t] === 65535) {
          dist[t] = next;
          queue[tail++] = t;
        }
      }
    }
  }
  tables.set(key, dist);
  return dist;
}

/** Сколько ходов осталось при лучшей игре. */
export const remaining = (game) => distances(game.n, game.pegs)[encode(game.towers, game.pegs)];

/** Лучший ход из текущей позиции: [from, to] (при равенстве — первый по порядку) или null (уже собрано). */
export function bestMove(game) {
  const dist = distances(game.n, game.pegs);
  const here = dist[encode(game.towers, game.pegs)];
  if (here === 0) return null;
  for (const [a, b] of legalMoves(game)) {
    const d = top(game, a);
    const code = encode(game.towers, game.pegs) + (b - a) * game.pegs ** d;
    if (dist[code] === here - 1) return [a, b];
  }
  return null;
}

// ---------- сохранение и статистика ----------

export function isValidGame(g) {
  if (!g || typeof g !== 'object' || g.v !== 1 || !DISKS.includes(g.n) || !PEGS.includes(g.pegs)) return false;
  if (!Array.isArray(g.towers) || g.towers.length !== g.pegs) return false;
  const seen = new Set();
  for (const t of g.towers) {
    if (!Array.isArray(t)) return false;
    for (let k = 0; k < t.length; k++) {
      const d = t[k];
      if (!Number.isInteger(d) || d < 0 || d >= g.n || seen.has(d)) return false;
      if (k > 0 && t[k - 1] < d) return false;            // больший диск на меньшем
      seen.add(d);
    }
  }
  if (seen.size !== g.n) return false;
  if (!Array.isArray(g.history) || !g.history.every((h) => Array.isArray(h) && h.length === 2
    && h.every((x) => Number.isInteger(x) && x >= 0 && x < g.pegs) && h[0] !== h[1])) return false;
  return Number.isInteger(g.moves) && g.moves >= 0 && Number.isFinite(g.time) && g.time >= 0
    && Number.isInteger(g.hints) && g.hints >= 0 && typeof g.done === 'boolean';
}

/** Ключ статистики: «3-5» — 3 стержня, 5 дисков. */
export const statKey = (pegs, n) => `${pegs}-${n}`;
export const STAT_KEYS = PEGS.flatMap((p) => DISKS.map((n) => statKey(p, n)));
const FIELDS = ['played', 'wins', 'perfect', 'bestMoves', 'bestTime'];
const emptyRow = () => ({ played: 0, wins: 0, perfect: 0, bestMoves: 0, bestTime: 0 });
export const emptyStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, emptyRow()]));

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object' && STAT_KEYS.every((k) => {
    const r = s[k];
    return r && FIELDS.every((f) => Number.isFinite(r[f]) && r[f] >= 0);
  });
}

/**
 * Записать партию: собрана — победа; без подсказок — ещё рекорды ходов и времени и «идеально» (ровно минимум).
 * Брошенная — только «сыграно».
 */
export function recordGame(stats, game, { win }) {
  const key = statKey(game.pegs, game.n);
  const r = stats[key] ?? (stats[key] = emptyRow());
  r.played++;
  if (!win) return stats;
  r.wins++;
  if (game.hints) return stats;
  if (game.moves === minMoves(game.n, game.pegs)) r.perfect++;
  if (!r.bestMoves || game.moves < r.bestMoves) r.bestMoves = game.moves;
  if (game.time > 0 && (!r.bestTime || game.time < r.bestTime)) r.bestTime = Math.round(game.time);
  return stats;
}

/** Самая большая собранная башня (любое число стержней) — для строки меню; 0 — не было. */
export function biggestTower(stats) {
  let best = 0;
  for (const p of PEGS) for (const n of DISKS) if (stats[statKey(p, n)]?.wins && n > best) best = n;
  return best;
}

export function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}
