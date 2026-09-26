// Правила партии судоку (как на sudoku.com) — без DOM, тестируется в Node.
// Состояние партии — обычный объект (его же игра кладёт в api.storage):
//   { difficulty, puzzle[81], solution[81], values[81], notes[81] (битовые маски), mistakes, score,
//     scored[81] (очки за клетку уже начислены), hintsLeft, elapsedMs, undo: [[{ i, value, notes }]] }
// Верная цифра закрепляется (как данная), неверная остаётся красной и считается ошибкой.

import { PEERS, UNITS, bit, ALL_DIGITS, popcount } from './grid.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
export const MAX_MISTAKES = 3;
export const HINTS_PER_GAME = 3;
export const CELL_POINTS = { easy: 20, medium: 40, hard: 60, expert: 90 };
const UNDO_LIMIT = 200;

export function newGame(difficulty, puzzle, solution) {
  return {
    difficulty,
    puzzle: [...puzzle],
    solution: [...solution],
    values: [...puzzle],
    notes: Array(81).fill(0),
    mistakes: 0,
    score: 0,
    scored: Array(81).fill(false),
    hintsLeft: HINTS_PER_GAME,
    elapsedMs: 0,
    undo: [],
  };
}

export const isGiven = (s, i) => s.puzzle[i] !== 0;
export const isCorrect = (s, i) => s.values[i] !== 0 && s.values[i] === s.solution[i];
/** Клетку нельзя менять: данная или уже верно заполненная. */
export const isLocked = (s, i) => isGiven(s, i) || isCorrect(s, i);
export const isWrong = (s, i) => s.values[i] !== 0 && s.values[i] !== s.solution[i];

function snapshot(s, cells) {
  return cells.map((i) => ({ i, value: s.values[i], notes: s.notes[i] }));
}

function pushUndo(s, entry) {
  s.undo.push(entry);
  if (s.undo.length > UNDO_LIMIT) s.undo.shift();
}

/** Верная цифра убирает такую же заметку у соседей. Возвращает затронутые клетки. */
function clearPeerNotes(s, i, d) {
  return PEERS[i].filter((p) => s.notes[p] & bit(d));
}

/** Поставить цифру. 'ignored' | 'correct' | 'wrong'. */
export function placeDigit(s, i, d) {
  if (isLocked(s, i) || s.values[i] === d) return 'ignored';
  const correct = d === s.solution[i];
  const peers = correct ? clearPeerNotes(s, i, d) : [];
  pushUndo(s, snapshot(s, [i, ...peers]));

  s.values[i] = d;
  s.notes[i] = 0;
  if (!correct) {
    s.mistakes++;
    return 'wrong';
  }
  for (const p of peers) s.notes[p] &= ~bit(d);
  if (!s.scored[i]) {                       // очки за клетку — один раз, даже после отмены
    s.score += CELL_POINTS[s.difficulty];
    s.scored[i] = true;
  }
  return 'correct';
}

/** Переключить заметку. Только в пустой клетке. */
export function toggleNote(s, i, d) {
  if (isLocked(s, i) || s.values[i]) return false;
  pushUndo(s, snapshot(s, [i]));
  s.notes[i] ^= bit(d);
  return true;
}

/** Стереть неверную цифру или заметки. Верные и данные цифры не стираются. */
export function erase(s, i) {
  if (isLocked(s, i) || (!s.values[i] && !s.notes[i])) return false;
  pushUndo(s, snapshot(s, [i]));
  s.values[i] = 0;
  s.notes[i] = 0;
  return true;
}

/** Отменить последнее действие. Возвращает клетку, которую стоит выделить, или -1. Ошибки и очки не откатываются. */
export function undo(s) {
  const entry = s.undo.pop();
  if (!entry) return -1;
  for (const { i, value, notes } of entry) {
    s.values[i] = value;
    s.notes[i] = notes;
  }
  return entry[0].i;
}

/** Применить подсказку-расстановку: цифра верная, очков не даёт, история отмен сбрасывается. */
export function applyHintDigit(s, i, d) {
  for (const p of clearPeerNotes(s, i, d)) s.notes[p] &= ~bit(d);
  s.values[i] = d;
  s.notes[i] = 0;
  s.scored[i] = true;
  s.undo = [];
}

/** Подсказка «здесь ошибка» — стереть неверную цифру. */
export function applyHintErase(s, i) {
  s.values[i] = 0;
  s.notes[i] = 0;
  s.undo = [];
}

// ---------- автозаполнение (настройка игрока, по умолчанию выключено) ----------
// Как «Smart Fill» в мобильных судоку (идея игрока и владельца, 2026-09-26):
//   'end'     — в каждой пустой клетке остался ровно один вариант: головоломка по сути решена, остаток дописывается;
//   'obvious' — ещё и очевидное по ходу: последняя свободная клетка строки/столбца/блока и девятая цифра, когда
//               восемь таких уже стоят (её место определено однозначно), — и так по цепочке; потом — как 'end'.
// Пока на доске неверная цифра — ничего: иначе дописывалось бы от ошибки.

export const AUTOFILL_MODES = ['off', 'end', 'obvious'];

/** Что дописать: [{ i, d }] в порядке дописывания. Состояние партии не меняется. */
export function autofillPlan(s, mode) {
  if (mode !== 'end' && mode !== 'obvious') return [];
  if (s.values.some((v, i) => v !== 0 && v !== s.solution[i])) return [];
  const values = [...s.values];
  const plan = [];
  const put = (i) => {
    values[i] = s.solution[i];
    plan.push({ i, d: s.solution[i] });
  };
  if (mode === 'obvious') {
    for (let changed = true; changed;) {
      changed = false;
      for (const unit of UNITS) {
        const empty = unit.filter((i) => !values[i]);
        if (empty.length === 1) { put(empty[0]); changed = true; }
      }
      const counts = Array(10).fill(0);
      for (const v of values) if (v) counts[v]++;
      for (let d = 1; d <= 9; d++) {
        if (counts[d] !== 8) continue;
        const i = values.findIndex((v, k) => !v && s.solution[k] === d);
        if (i >= 0) { put(i); changed = true; }
      }
    }
  }
  const empty = [];
  values.forEach((v, i) => { if (!v) empty.push(i); });
  const single = (i) => {
    let mask = ALL_DIGITS;
    for (const p of PEERS[i]) if (values[p]) mask &= ~bit(values[p]);
    return popcount(mask) === 1;
  };
  if (empty.length && empty.every(single)) empty.forEach(put);
  return plan;
}

/** Дописать одну клетку автозаполнением: как верный ход (очки за клетку — как обычно), отмена после него не нужна. */
export function applyAutofill(s, i, d) {
  for (const p of clearPeerNotes(s, i, d)) s.notes[p] &= ~bit(d);
  s.values[i] = d;
  s.notes[i] = 0;
  if (!s.scored[i]) {
    s.score += CELL_POINTS[s.difficulty];
    s.scored[i] = true;
  }
  s.undo = [];
}

export const isSolved = (s) => s.values.every((v, i) => v === s.solution[i]);
/** Поражение — только при включённом лимите ошибок (настройка игрока). */
export const isLost = (s, mistakesLimit = true) => mistakesLimit && s.mistakes >= MAX_MISTAKES;

// ---------- настройки (общие для всех партий) ----------

export const SKINS = ['telegram', 'classic', 'claude', 'sepia', 'forest', 'night', 'hedgehog'];
// особые скины — только тем, кому выдал владелец (api.perk, shell/perks.js); id скина = id перка
export const PERK_SKINS = ['hedgehog'];

export function defaultSettings() {
  return { mistakesLimit: true, skin: 'telegram', autofill: 'off' };
}

/** Сохранённые настройки → полные и корректные (неизвестное отбрасывается). */
export function normalizeSettings(saved) {
  const s = defaultSettings();
  if (typeof saved?.mistakesLimit === 'boolean') s.mistakesLimit = saved.mistakesLimit;
  if (SKINS.includes(saved?.skin)) s.skin = saved.skin;
  if (AUTOFILL_MODES.includes(saved?.autofill)) s.autofill = saved.autofill;
  return s;
}

/** Сколько раз каждая цифра стоит верно (для скрытия законченных цифр на панели). */
export function digitCounts(s) {
  const counts = Array(10).fill(0);
  s.values.forEach((v, i) => {
    if (v && v === s.solution[i]) counts[v]++;
  });
  return counts;
}

/** Клетки с одинаковыми цифрами в одной группе — подсвечиваются красным. */
export function conflicts(s) {
  const out = new Set();
  for (const unit of UNITS) {
    const byDigit = new Map();
    for (const i of unit) {
      const v = s.values[i];
      if (!v) continue;
      if (!byDigit.has(v)) byDigit.set(v, []);
      byDigit.get(v).push(i);
    }
    for (const cells of byDigit.values()) if (cells.length > 1) cells.forEach((i) => out.add(i));
  }
  return out;
}

/** Первая неверная цифра на доске или -1. */
export function firstMistake(s) {
  return s.values.findIndex((v, i) => v && v !== s.solution[i]);
}

export function isValidState(s) {
  const grid = (a, max) => Array.isArray(a) && a.length === 81 && a.every((v) => Number.isInteger(v) && v >= 0 && v <= max);
  return Boolean(s)
    && DIFFICULTIES.includes(s.difficulty)
    && grid(s.puzzle, 9) && grid(s.solution, 9) && grid(s.values, 9) && grid(s.notes, 0x3fe)
    && s.solution.every((v) => v >= 1)
    && s.puzzle.every((v, i) => v === 0 || (v === s.solution[i] && s.values[i] === v))
    && Array.isArray(s.scored) && s.scored.length === 81
    && Array.isArray(s.undo)
    && [s.mistakes, s.score, s.hintsLeft, s.elapsedMs].every((n) => Number.isFinite(n) && n >= 0);
}

// ---------- статистика одной сложности ----------
// { played, wins, streak, maxStreak, bestMs, totalWinMs }

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, bestMs: null, totalWinMs: 0 };
}

export function recordGame(stats, won, elapsedMs) {
  const next = { ...stats, played: stats.played + 1 };
  if (won) {
    next.wins += 1;
    next.streak += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    next.bestMs = next.bestMs === null ? elapsedMs : Math.min(next.bestMs, elapsedMs);
    next.totalWinMs += elapsedMs;
  } else {
    next.streak = 0;
  }
  return next;
}

export function isValidStats(s) {
  const count = (n) => Number.isFinite(n) && n >= 0;
  return Boolean(s)
    && ['played', 'wins', 'streak', 'maxStreak', 'totalWinMs'].every((k) => count(s[k]))
    && (s.bestMs === null || count(s.bestMs));
}
