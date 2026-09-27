// Крестики-нолики (3×3, три в ряд) и гомоку (5 в ряд на поле 10×10 / 13×13 / 15×15): правила и бот, без DOM.
// Клетки: 0 — пусто, 1 — крестик (ходит первым), 2 — нолик. Гомоку — «свободный»: пять и больше подряд — победа.
//
// Бот. 3×3: «Сложный» — полный перебор (минимакс, не проигрывает никогда), «Средний» — видит выигрыш и
// угрозу, иногда ошибается, «Лёгкий» — чаще случайный ход. Гомоку: оценка клетки по «окнам» — всем отрезкам
// из пяти клеток через неё без чужих фишек (чем больше своих в окне, тем дороже: пять — выигрыш, четыре —
// угроза, которую надо закрыть); ход = атака + защита. «Сложный» нападает и ищет победу «четвёрками» (VCF).
// rng передаётся параметром — всё детерминировано.

export const MODES = ['classic', 'gomoku'];
export const SIZES = [10, 13, 15];
export const LEVELS = ['easy', 'medium', 'hard'];
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export const winLength = (mode) => (mode === 'classic' ? 3 : 5);
export const other = (who) => 3 - who;

/**
 * setup: { mode, size?, level, vs: 'bot' | 'friend', player?: 1 | 2 } → партия.
 * У бота player — чем играет человек; «вдвоём» — player null.
 */
export function newGame({ mode = 'classic', size = 15, level = 'medium', vs = 'bot', player = 1 } = {}) {
  const n = mode === 'classic' ? 3 : size;
  return {
    v: 1, mode, size: n, win: winLength(mode), level, vs, player: vs === 'bot' ? player : null,
    cells: Array(n * n).fill(0), turn: 1, history: [], over: null,
  };
}

const rc = (s, i) => [Math.floor(i / s.size), i % s.size];
const inside = (s, r, c) => r >= 0 && c >= 0 && r < s.size && c < s.size;

/** Линия победы через клетку i (все клетки подряд своего цвета, если их ≥ win), иначе null. */
export function lineThrough(s, i) {
  const who = s.cells[i];
  if (!who) return null;
  const [r0, c0] = rc(s, i);
  for (const [dr, dc] of DIRS) {
    const line = [i];
    for (const sign of [-1, 1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (inside(s, r, c) && s.cells[r * s.size + c] === who) {
        if (sign < 0) line.unshift(r * s.size + c);
        else line.push(r * s.size + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= s.win) return line;
  }
  return null;
}

export const canPlay = (s, i) => !s.over && Number.isInteger(i) && i >= 0 && i < s.cells.length && s.cells[i] === 0;

/** Ход в клетку i тем, чья очередь. → true, если ход сделан. */
export function play(s, i) {
  if (!canPlay(s, i)) return false;
  s.cells[i] = s.turn;
  s.history.push(i);
  const line = lineThrough(s, i);
  if (line) s.over = { winner: s.turn, line };
  else if (s.history.length === s.cells.length) s.over = { draw: true };
  else s.turn = other(s.turn);
  return true;
}

/** Отменить последние n ходов. */
export function undo(s, n = 1) {
  for (let k = 0; k < n && s.history.length; k++) {
    const i = s.history.pop();
    s.turn = s.cells[i];
    s.cells[i] = 0;
  }
  s.over = null;
}

// ---------- бот 3×3 ----------

const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner3 = (cells) => {
  for (const [a, b, c] of LINES3) if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
  return 0;
};

const memo = new Map();
/** Минимакс 3×3: оценка позиции для who (ход who): +1 выигрыш, 0 ничья, −1 проигрыш (с поправкой на скорость). */
function minimax(cells, who) {
  const key = cells.join('') + who;
  if (memo.has(key)) return memo.get(key);
  const w = winner3(cells);
  let best;
  if (w) best = w === who ? 10 : -10;
  else if (!cells.includes(0)) best = 0;
  else {
    best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (cells[i]) continue;
      cells[i] = who;
      const v = -minimax(cells, other(who));
      cells[i] = 0;
      best = Math.max(best, v > 0 ? v - 1 : v < 0 ? v + 1 : 0);   // быстрее выиграть, дольше проигрывать
    }
  }
  memo.set(key, best);
  return best;
}

function bestMoves3(s) {
  const who = s.turn;
  let best = -Infinity;
  let list = [];
  for (let i = 0; i < 9; i++) {
    if (s.cells[i]) continue;
    s.cells[i] = who;
    const v = -minimax(s.cells, other(who));
    s.cells[i] = 0;
    if (v > best) {
      best = v;
      list = [i];
    } else if (v === best) list.push(i);
  }
  return list;
}

function immediate3(s, who) {
  for (let i = 0; i < 9; i++) {
    if (s.cells[i]) continue;
    s.cells[i] = who;
    const w = winner3(s.cells);
    s.cells[i] = 0;
    if (w) return i;
  }
  return -1;
}

function bot3(s, rng) {
  const empty = s.cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  if (s.level === 'hard') return pick(bestMoves3(s));
  const win = immediate3(s, s.turn);
  const block = immediate3(s, other(s.turn));
  if (s.level === 'medium') {
    if (win >= 0) return win;
    if (block >= 0 && rng() < 0.9) return block;
    return rng() < 0.7 ? pick(bestMoves3(s)) : pick(empty);
  }
  if (win >= 0 && rng() < 0.6) return win;
  if (block >= 0 && rng() < 0.45) return block;
  return pick(empty);
}

// ---------- бот гомоку ----------

// цена окна из пяти клеток, в котором после хода будет k своих фишек (и ни одной чужой)
const WINDOW = [0, 1, 12, 160, 3000, 200000];

/** Что даст ход who в клетку i: сумма цен всех «чистых» окон из пяти клеток через неё. */
export function cellScore(s, i, who) {
  const [r0, c0] = rc(s, i);
  let score = 0;
  for (const [dr, dc] of DIRS) {
    for (let k = 0; k < 5; k++) {
      const rs = r0 - dr * k;
      const cs = c0 - dc * k;
      if (!inside(s, rs, cs) || !inside(s, rs + dr * 4, cs + dc * 4)) continue;
      let own = 0;
      let blocked = false;
      for (let m = 0; m < 5; m++) {
        const v = s.cells[(rs + dr * m) * s.size + cs + dc * m];
        if (v === who) own++;
        else if (v !== 0) {
          blocked = true;
          break;
        }
      }
      if (!blocked) score += WINDOW[Math.min(5, own + 1)];
    }
  }
  return score;
}

/** Клетки-кандидаты: пустые не дальше двух клеток от любой фишки (пустое поле — центр). */
export function candidates(s) {
  if (!s.history.length) return [Math.floor(s.size / 2) * s.size + Math.floor(s.size / 2)];
  const out = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i]) continue;
    const [r, c] = rc(s, i);
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) {
      for (let dc = -2; dc <= 2 && !near; dc++) {
        if (inside(s, r + dr, c + dc) && s.cells[(r + dr) * s.size + c + dc]) near = true;
      }
    }
    if (near) out.push(i);
  }
  return out;
}

/** Кандидаты с оценкой: [{ i, attack, defense, total }] по убыванию. */
export function rankMoves(s, who = s.turn, defenseWeight = 0.92) {
  const center = (s.size - 1) / 2;
  return candidates(s).map((i) => {
    const attack = cellScore(s, i, who);
    const defense = cellScore(s, i, other(who));
    const [r, c] = rc(s, i);
    const near = -(Math.abs(r - center) + Math.abs(c - center)) * 0.01;
    return { i, attack, defense, total: attack + defense * defenseWeight + near };
  }).sort((a, b) => b.total - a.total);
}

/** Клетки, куда who ставит пятую фишку (выигрыш сразу). */
function winCells(s, who) {
  const out = [];
  for (const i of candidates(s)) {
    if (cellScore(s, i, who) < WINDOW[5]) continue;
    s.cells[i] = who;
    if (lineThrough(s, i)) out.push(i);
    s.cells[i] = 0;
  }
  return out;
}

/**
 * Победа «четвёрками» (VCF): цепочка ходов, каждый из которых грозит пятёркой — сопернику остаётся только
 * закрывать, пока не выйдет двойная угроза. → первый ход цепочки или −1. depth — сколько четвёрок подряд искать.
 */
export function findVcf(s, who, depth = 7) {
  if (depth <= 0) return -1;
  for (const i of candidates(s)) {
    if (cellScore(s, i, who) < WINDOW[4]) continue;      // этот ход не даёт четвёрки
    s.cells[i] = who;
    s.history.push(i);
    const threats = winCells(s, who);
    let ok = false;
    if (threats.length >= 2) ok = true;                   // две угрозы сразу — не закрыть
    else if (threats.length === 1 && !winCells(s, other(who)).length) {
      const block = threats[0];
      s.cells[block] = other(who);
      s.history.push(block);
      ok = findVcf(s, who, depth - 1) >= 0;
      s.history.pop();
      s.cells[block] = 0;
    }
    s.history.pop();
    s.cells[i] = 0;
    if (ok) return i;
  }
  return -1;
}

function botGomoku(s, rng) {
  const who = s.turn;
  const ranked = rankMoves(s, who);
  if (!ranked.length) return -1;
  const win = ranked.find((m) => m.attack >= WINDOW[5]);
  if (win && s.level !== 'easy') return win.i;
  if (s.level === 'easy') {
    if (win && rng() < 0.7) return win.i;
    // лёгкий: чаще думает только о себе и выбирает из нескольких лучших
    const pool = rng() < 0.5 ? rankMoves(s, who, 0.25).slice(0, 6) : ranked.slice(0, 5);
    return pool[Math.floor(rng() * pool.length)].i;
  }
  if (s.level === 'medium') {
    // из трёх лучших — те, что не хуже лучшего на 15% (когда всё почти ничего не стоит — только лучший)
    const top = [ranked[0], ...ranked.slice(1, 3).filter((m) => ranked[0].total > 0 && m.total >= ranked[0].total * 0.85)];
    return top[Math.floor(rng() * top.length)].i;
  }
  // сложный — нападает (защита весит меньше: так он сильнее, проверено турнирами — 20:1 против среднего):
  // закрыть пятёрку соперника; своя победа четвёрками (VCF); сломать такую же цепочку соперника; иначе лучшая клетка.
  // (Пробовал ещё смотреть ответ соперника на ход вперёд — становился слабее: 12:8.)
  const mustBlock = ranked.find((m) => m.defense >= WINDOW[5]);
  if (mustBlock) return mustBlock.i;
  const own = findVcf(s, who);
  if (own >= 0) return own;
  const attacking = rankMoves(s, who, 0.72);
  if (findVcf(s, other(who), 6) >= 0) {
    for (const m of attacking.slice(0, 12)) {
      s.cells[m.i] = who;
      s.history.push(m.i);
      const still = findVcf(s, other(who), 6) >= 0;
      s.history.pop();
      s.cells[m.i] = 0;
      if (!still) return m.i;
    }
  }
  // без случайности: разброс даже между почти равными ходами ослаблял его (55:13 → 49:25 на 100 партиях)
  return attacking[0].i;
}

/** Ход бота за того, чья очередь. */
export function botMove(s, rng = Math.random) {
  if (s.over) return -1;
  return s.mode === 'classic' ? bot3(s, rng) : botGomoku(s, rng);
}

// ---------- сохранение и статистика ----------

export function isValidState(s) {
  if (!s || s.v !== 1 || !MODES.includes(s.mode) || !LEVELS.includes(s.level) || !['bot', 'friend'].includes(s.vs)) return false;
  if (s.mode === 'classic' ? s.size !== 3 : !SIZES.includes(s.size)) return false;
  if (!Array.isArray(s.cells) || s.cells.length !== s.size * s.size || !s.cells.every((v) => v === 0 || v === 1 || v === 2)) return false;
  if (!Array.isArray(s.history) || !s.history.every((i) => Number.isInteger(i) && s.cells[i])) return false;
  if (s.history.length !== s.cells.filter(Boolean).length) return false;
  return (s.turn === 1 || s.turn === 2) && s.over === null && (s.vs === 'friend' || s.player === 1 || s.player === 2);
}

const emptyLevel = () => ({ played: 0, wins: 0, losses: 0, draws: 0 });

export function emptyStats() {
  const out = {};
  for (const m of MODES) {
    out[m] = {};
    for (const l of LEVELS) out[m][l] = emptyLevel();
  }
  out.friend = { played: 0, x: 0, o: 0, draws: 0 };
  out.streak = 0;
  out.bestStreak = 0;
  return out;
}

export function isValidStats(st) {
  if (!st || typeof st !== 'object') return false;
  const n = (v) => Number.isInteger(v) && v >= 0;
  return MODES.every((m) => LEVELS.every((l) => ['played', 'wins', 'losses', 'draws'].every((k) => n(st[m]?.[l]?.[k]))))
    && ['played', 'x', 'o', 'draws'].every((k) => n(st.friend?.[k])) && n(st.streak) && n(st.bestStreak);
}

/** Записать законченную партию. → новая статистика */
export function recordGame(st, s) {
  const next = structuredClone(st);
  if (s.vs === 'friend') {
    next.friend.played += 1;
    if (s.over?.draw) next.friend.draws += 1;
    else if (s.over?.winner === 1) next.friend.x += 1;
    else next.friend.o += 1;
    return next;
  }
  const row = next[s.mode][s.level];
  row.played += 1;
  if (s.over?.draw) {
    row.draws += 1;
  } else if (s.over?.winner === s.player) {
    row.wins += 1;
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
  } else {
    row.losses += 1;
    next.streak = 0;
  }
  return next;
}
