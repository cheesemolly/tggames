// Строка под названием игры в меню.
//
// По умолчанию — «Сыграно · Побед · Рекорд» из статистики оболочки, но у игр разные понятия успеха:
// в бесконечных играх побед не бывает, в уровневых важен текущий уровень, а не число партий.
// Что показывать — задаётся полем `menu` в реестре, а сама строка уровня приходит от игры
// через `api.progress(...)` (контракт, раздел 5).

export const DEFAULT_MENU = {
  played: true,
  wins: true,
  best: true,
  bestLabel: 'Рекорд',
  bestValue: null,         // как показать рекорд: (n) => 'Уровень 7' и т.п.
  progress: null,          // 'replace' — вместо статистики, 'append' — в конец строки
  saveLine: null,          // (state из getState()) => 'Сейчас: уровень 8' — что сказать о начатой партии
};

export const NOT_PLAYED = 'Ещё не играли';
export const IN_PROGRESS = 'Идёт партия';

/**
 * stats — статистика оболочки (считает только законченные партии), progress — строка от игры,
 * save — сохранённая незаконченная партия ({ state } или null).
 * «Ещё не играли» — только если нет ни законченных партий, ни начатой, ни строки от игры
 * (замечание владельца, 2026-09-25: в начатой партии судоку, 2048, на 8-м уровне «Соедини точки»
 * меню писало «Ещё не играли»).
 */
export function menuLine(stats, { menu = {}, progress = null, save = null } = {}) {
  const cfg = { ...DEFAULT_MENU, ...menu };

  // Уровневые игры (Петля, Слова из слова, Brick Blast, Филворд) сами говорят, что писать.
  if (cfg.progress === 'replace') return progress || (save ? IN_PROGRESS : NOT_PLAYED);

  const appended = cfg.progress === 'append' && progress ? progress : null;
  const now = save && cfg.saveLine ? cfg.saveLine(save.state ?? {}) : null;

  if (stats.played === 0) {
    const parts = [save && !now ? IN_PROGRESS : now, appended].filter(Boolean);
    return parts.length ? parts.join(' · ') : NOT_PLAYED;
  }

  const parts = [];
  if (cfg.played) parts.push(`Сыграно: ${stats.played}`);
  if (cfg.wins) parts.push(`Побед: ${stats.wins}`);
  if (cfg.best && stats.best !== null) {
    parts.push(`${cfg.bestLabel}: ${cfg.bestValue ? cfg.bestValue(stats.best) : stats.best}`);
  }
  if (appended) parts.push(appended);
  if (now) parts.push(now);
  return parts.length ? parts.join(' · ') : NOT_PLAYED;
}
