// Партия без экрана: проверка сохранения, статистика по уровням, съеденные фигуры, запись ходов по-русски и
// партия с другом по сети (проверка присланных ходов, итог). Отдельно от index.js — чтобы проверять в тестах без браузера.

import { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, START_FEN, typeOf, colorOf, fromFen, make, moveFromUci, outcome } from './rules.js';
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

// ---------- партия с другом по сети (api.online; в бете 'chess-online') ----------

const COUNTS = ['played', 'wins', 'losses', 'draws'];

/** Мой цвет в партии с другом: белыми играет тот, кто ходит первым. room — комната с сервера. */
export const onlineColor = (room) => (room.you === room.first ? WHITE : BLACK);

/** Имя соперника (второго игрока может ещё не быть). */
export const rivalName = (room) => room.players?.[1 - room.you]?.name ?? null;

/**
 * Ходы партии с другом: сервер правил не знает, поэтому проверяем сами — все ходы законны с начальной позиции
 * и после конца партии ходов нет. → { ok, over } — over: итог позиции по правилам (как outcome) или null.
 */
export function checkLine(moves) {
  const bad = { ok: false, over: null };
  if (!Array.isArray(moves)) return bad;
  try {
    const p = fromFen(START_FEN);
    let over = null;
    for (const u of moves) {
      if (over) return bad;
      const m = typeof u === 'string' ? moveFromUci(p, u) : 0;
      if (!m) return bad;
      make(p, m);
      over = outcome(p);
    }
    return { ok: true, over };
  } catch {
    return bad;
  }
}

/**
 * Чем партия с другом кончилась для меня: { result: 'win' | 'lose' | 'draw' | 'void', reason } или null — ещё идёт.
 * over — итог позиции по правилам (outcome) или null; иначе итог берётся из комнаты (сдача). 'void' — сдались,
 * не успев сделать по ходу: партия не состоялась и в статистику не идёт.
 */
export function onlineResult(room, over) {
  if (over) {
    const result = over.winner === undefined ? 'draw' : over.winner === onlineColor(room) ? 'win' : 'lose';
    return { result, reason: over.result };
  }
  if (room.status !== 'over' || !room.result) return null;
  const reason = room.result.by === 'resign' ? 'resign' : 'ended';
  if (reason === 'resign' && room.moves.length < 2) return { result: 'void', reason };
  const { winner } = room.result;
  return { result: winner == null ? 'draw' : winner === room.you ? 'win' : 'lose', reason };
}

export const emptyOnline = () => ({ played: 0, wins: 0, losses: 0, draws: 0 });

const isCounts = (row) => Boolean(row) && COUNTS.every((k) => Number.isInteger(row[k]) && row[k] >= 0);

/** Статистика партий с другом — stats.online, рядом с уровнями бота (у старых сохранений её нет). */
export const onlineStats = (stats) => (isCounts(stats?.online) ? stats.online : emptyOnline());

/** Итог партии с другом в статистику: 'win' | 'lose' | 'draw' (отменённая партия не считается). */
export function recordOnline(stats, result) {
  if (!['win', 'lose', 'draw'].includes(result)) return stats;
  const row = { ...onlineStats(stats) };
  row.played += 1;
  if (result === 'win') row.wins += 1;
  else if (result === 'lose') row.losses += 1;
  else row.draws += 1;
  stats.online = row;
  return stats;
}

/** Запись о начатой партии с другом (хранилище 'online'): { code, name, on } — on: открывать её, а не бота. */
export function isValidOnline(s) {
  return Boolean(s) && typeof s.code === 'string' && /^[a-z0-9]{10}$/.test(s.code)
    && (s.name === null || typeof s.name === 'string') && typeof s.on === 'boolean';
}
