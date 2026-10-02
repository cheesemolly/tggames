// Таймер и статистика кубика без DOM — как у спидкуберов (правила WCA): осмотр 15 с (по желанию): до 15 с — без
// штрафа, 15–17 с — +2 с, дольше — DNF (не засчитано). Среднее из 5 и из 12 — без лучшей и худшей сборки; DNF —
// худшая, две DNF в пяти — среднее тоже DNF. Сборка — { t: мс, p: 0 | 2000 | DNF, m: ходов, s: перемешивание, d: дата }.

import { decodeModel, relativeFacelets } from './cube.js';
import { faceletsToCubie } from './solver.js';

export const INSPECTION_MS = 15000;
export const DNF = -1;
export const HISTORY_MAX = 100;

export function penaltyFor(inspectMs) {
  if (inspectMs <= INSPECTION_MS) return 0;
  if (inspectMs <= INSPECTION_MS + 2000) return 2000;
  return DNF;
}

export const solveValue = (s) => (s.p === DNF ? Infinity : s.t + s.p);

/** Среднее последних n (без ceil(5 %) лучших и худших): мс, Infinity (DNF) или null — сборок меньше n. */
export function averageOf(solves, n) {
  if (solves.length < n) return null;
  const vals = solves.slice(-n).map(solveValue).sort((a, b) => a - b);
  const trim = Math.max(1, Math.ceil(n * 0.05));
  const mid = vals.slice(trim, n - trim);
  if (mid.some((v) => v === Infinity)) return Infinity;
  return Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
}

/** 12.34 / 1:02.34 (сотые вниз), DNF, «—». */
export function fmtTime(ms) {
  if (ms === Infinity) return 'DNF';
  if (ms == null || !Number.isFinite(ms)) return '—';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = String(cs % 100).padStart(2, '0');
  return m ? `${m}:${String(s).padStart(2, '0')}.${c}` : `${s}.${c}`;
}

export const emptyStats = () => ({ count: 0, dnf: 0, best: 0, bestMoves: 0, bestAo5: 0, bestAo12: 0 });

export function isValidStats(s) {
  return Boolean(s) && typeof s === 'object'
    && ['count', 'dnf', 'best', 'bestMoves', 'bestAo5', 'bestAo12'].every((k) => Number.isFinite(s[k]) && s[k] >= 0);
}

export const isValidSolve = (s) => Boolean(s) && typeof s === 'object'
  && Number.isFinite(s.t) && s.t >= 0 && (s.p === 0 || s.p === 2000 || s.p === DNF)
  && Number.isInteger(s.m) && s.m >= 0 && (s.s === undefined || typeof s.s === 'string') && Number.isFinite(s.d);

export const isValidHistory = (h) => Array.isArray(h) && h.length <= HISTORY_MAX && h.every(isValidSolve);

/** Записать сборку → { stats, history, record } (record — лучшая одиночная сборка побита). */
export function recordSolve(stats, history, solve) {
  const h = [...history, solve].slice(-HISTORY_MAX);
  const st = { ...stats, count: stats.count + 1 };
  let record = false;
  if (solve.p === DNF) st.dnf++;
  else {
    const v = solveValue(solve);
    if (!st.best || v < st.best) {
      record = true;
      st.best = v;
    }
    if (!st.bestMoves || solve.m < st.bestMoves) st.bestMoves = solve.m;
  }
  for (const [n, key] of [[5, 'bestAo5'], [12, 'bestAo12']]) {
    const a = averageOf(h, n);
    if (a !== null && a !== Infinity && (!st[key] || a < st[key])) st[key] = a;
  }
  return { stats: st, history: h, record };
}

// ---------- настройки и сохранение ----------

export const SKINS = ['classic', 'stickerless', 'light', 'pastel', 'neon', 'retro'];
export const SPEEDS = {
  fast: { scramble: 55, solve: 120, key: 70 },
  normal: { scramble: 85, solve: 190, key: 100 },
  slow: { scramble: 140, solve: 300, key: 150 },
};
export const defaultSettings = () => ({ skin: 'classic', inspection: false, speed: 'normal' });

export function normalizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  return {
    skin: SKINS.includes(s.skin) ? s.skin : d.skin,
    inspection: s.inspection === true,
    speed: Object.hasOwn(SPEEDS, s.speed) ? s.speed : d.speed,
  };
}

export const STATUSES = ['free', 'inspect', 'ready', 'running'];

/** Сохранённая партия: кубик (сжатый), что идёт, перемешивание, ходы, время, история поворотов для отмены. */
export function isValidSave(g) {
  if (!g || typeof g !== 'object' || g.v !== 1 || !STATUSES.includes(g.status)) return false;
  const model = decodeModel(g.cubies);
  if (!model || !faceletsToCubie(relativeFacelets(model))) return false;
  if (typeof g.scramble !== 'string' || g.scramble.length > 200) return false;
  if (!Number.isInteger(g.moves) || g.moves < 0 || !Number.isFinite(g.time) || g.time < 0) return false;
  if (!Number.isFinite(g.inspect) || g.inspect < 0) return false;
  return Array.isArray(g.turns) && g.turns.length <= 500 && g.turns.every((t) => Array.isArray(t) && t.length === 3
    && [0, 1, 2].includes(t[0]) && [-1, 0, 1].includes(t[1]) && Number.isInteger(t[2]) && Math.abs(t[2]) <= 3);
}
