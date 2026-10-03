// Сведения об играх для карточек нового интерфейса (в бете 'new-ui'): строка прогресса (как в старом меню —
// shell/menu-line.js), начатая партия, избранное, когда открывал.

import { getStats } from '../stats.js';
import { saves } from '../saves.js';
import { progress } from '../progress.js';
import { menuLine } from '../menu-line.js';
import { categories } from '../categories.js';
import { getFavs, getRecent } from './store.js';
import { triedGame } from './logic.js';

/** Игры в порядке папок (порядок в реестре — про загрузку, а не про вид). */
export function inFolderOrder(games) {
  const order = categories.flatMap((c) => c.games);
  return [...games].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** [{ id, title, cat, line, save, fav, at, tried }] для всех переданных игр, в порядке папок. */
export async function collectGames(games) {
  const [favs, recent] = await Promise.all([getFavs(), getRecent()]);
  return Promise.all(inFolderOrder(games).map(async (g) => {
    const [stats, line, save] = await Promise.all([getStats(g.id), progress.get(g.id), saves.get(g.id)]);
    return {
      id: g.id,
      title: g.title,
      cat: categories.find((c) => c.games.includes(g.id))?.id ?? 'words',
      line: menuLine(stats, { menu: g.menu, progress: line, save }),
      save: save != null,
      fav: favs.includes(g.id),
      at: Number(recent[g.id]) || 0,
      tried: triedGame({ played: stats?.played, progress: line, save: save != null, at: Number(recent[g.id]) || 0 }),
    };
  }));
}
