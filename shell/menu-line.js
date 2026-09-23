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
};

export const NOT_PLAYED = 'Ещё не играли';

export function menuLine(stats, { menu = {}, progress = null } = {}) {
  const cfg = { ...DEFAULT_MENU, ...menu };

  // Уровневые игры (Петля, Слова из слова, Brick Blast, Филворд) сами говорят, что писать.
  if (cfg.progress === 'replace') return progress || NOT_PLAYED;

  const parts = [];
  if (cfg.played) parts.push(`Сыграно: ${stats.played}`);
  if (cfg.wins) parts.push(`Побед: ${stats.wins}`);
  if (cfg.best && stats.best !== null) {
    parts.push(`${cfg.bestLabel}: ${cfg.bestValue ? cfg.bestValue(stats.best) : stats.best}`);
  }
  if (cfg.progress === 'append' && progress) parts.push(progress);

  const appended = cfg.progress === 'append' && Boolean(progress);
  if (!parts.length || (stats.played === 0 && !appended)) return NOT_PLAYED;
  return parts.join(' · ');
}
