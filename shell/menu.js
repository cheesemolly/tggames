// Экран меню: список игр со статистикой и отметкой о незаконченной партии.

import { el } from '../shared/dom.js';
import { getStats } from './stats.js';
import { saves } from './saves.js';

export async function renderMenu(container, { games, platform }) {
  const items = await Promise.all(games.map(async (game) => ({
    game,
    stats: await getStats(game.id),
    hasSave: (await saves.get(game.id)) != null,
  })));

  const name = platform.user?.first_name;

  container.replaceChildren(el('div', { class: 'scroll' },
    el('h1', {}, 'Игры'),
    el('p', { class: 'hint' }, name ? `Привет, ${name}! Выбери игру.` : 'Выбери игру.'),
    el('ul', { class: 'menu-list' }, items.map(({ game, stats, hasSave }, index) => el('li', {},
      el('a', { class: 'game-card', href: `#/game/${encodeURIComponent(game.id)}`, style: `--i: ${index}` },
        el('span', { class: 'game-card-title' }, game.title),
        el('span', { class: 'game-card-meta' }, statsLine(stats)),
        hasSave && el('span', { class: 'badge' }, 'продолжить'),
      ),
    ))),
  ));
}

function statsLine({ played, wins, best }) {
  if (played === 0) return 'Ещё не играли';
  const parts = [`Сыграно: ${played}`, `Побед: ${wins}`];
  if (best !== null) parts.push(`Рекорд: ${best}`);
  return parts.join(' · ');
}
