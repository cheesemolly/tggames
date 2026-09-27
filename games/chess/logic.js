// Партия против бота без экрана: проверка сохранения, статистика по уровням, съеденные фигуры и запись
// ходов по-русски. Отдельно от index.js — чтобы проверять в тестах без браузера.

import { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, typeOf, colorOf, fromFen, make, moveFromUci, outcome } from './rules.js';
import { LEVELS } from './engine.js';
import { RU_LETTER } from './pieces.js';

export const HINTS_PER_GAME = 3;

export function emptyStats() {
  const out = {};
  for (const l of LEVELS) out[l.id] = { played: 0, wins: 0, losses: 0, draws: 0 };
  return out;
}

export function isValidStats(s) {
  return Boolean(s) && LEVELS.every((l) => ['played', 'wins', 'losses', 'draws'].every((k) => Number.isInteger(s[l.id]?.[k]) && s[l.id][k] >= 0));
}

/** Сохранённая партия годится: ходы законны с начальной позиции и партия не окончена. */
export function isValidGame(g) {
  if (!g || g.v !== 1 || typeof g.startFen !== 'string' || !Array.isArray(g.moves) || !LEVELS.some((l) => l.id === g.level)) return false;
  if (g.player !== WHITE && g.player !== BLACK) return false;
  if (!Number.isInteger(g.hints) || g.hints < 0 || g.hints > HINTS_PER_GAME) return false;
  try {
    const p = fromFen(g.startFen);
    for (const u of g.moves) {
      const m = typeof u === 'string' ? moveFromUci(p, u) : 0;
      if (!m) return false;
      make(p, m);
    }
    return !outcome(p);
  } catch {
    return false;
  }
}

const START_COUNT = [0, 8, 2, 2, 2, 1, 0];
const WORTH = [0, 1, 3, 3, 5, 9, 0];

/**
 * Сколько фигур каждого вида у цвета снято с доски и его материал (пешка 1, лёгкая 3, ладья 5, ферзь 9).
 * Превращённая пешка не считается съеденной: лишний ферзь «возвращает» пешку.
 */
export function capturedOf(board, color) {
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (p && colorOf(p) === color) count[typeOf(p)] += 1;
  }
  let promoted = 0;
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const t of [KNIGHT, BISHOP, ROOK, QUEEN]) {
    promoted += Math.max(0, count[t] - START_COUNT[t]);
    out[t] = Math.max(0, START_COUNT[t] - count[t]);
  }
  out[PAWN] = Math.max(0, 8 - count[PAWN] - promoted);
  const material = count.reduce((sum, n, t) => sum + n * WORTH[t], 0);
  return { out, material };
}

/** Запись хода по-русски: Nf3 → Кf3, Kxe2 → Крxe2, e8=Q → e8=Ф, O-O — как есть. */
export const ruSan = (s) => s.replace(/^[KQRBN]/, (ch) => RU_LETTER[ch]).replace(/=([QRBN])/, (_, ch) => `=${RU_LETTER[ch]}`);

/** Итог партии в статистику уровня: 'win' | 'lose' | 'draw'. */
export function recordGame(stats, level, result) {
  const row = stats[level];
  row.played += 1;
  if (result === 'win') row.wins += 1;
  else if (result === 'lose') row.losses += 1;
  else row.draws += 1;
  return stats;
}
