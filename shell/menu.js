// Экран меню: список игр со строкой прогресса и отметкой о незаконченной партии.
// Сверху — строка аккаунта (если сервер аккаунтов настроен): имя игрока и выход
// либо предложение войти, чтобы прогресс сохранялся на сервере.

import { el } from '../shared/dom.js';
import { getStats } from './stats.js';
import { saves } from './saves.js';
import { progress } from './progress.js';
import { menuLine } from './menu-line.js';

export async function renderMenu(container, { games, account = null, onAccount = null }) {
  const items = await Promise.all(games.map(async (game) => ({
    game,
    line: menuLine(await getStats(game.id), { menu: game.menu, progress: await progress.get(game.id) }),
    hasSave: (await saves.get(game.id)) != null,
  })));

  container.replaceChildren(el('div', { class: 'scroll' },
    el('h1', {}, 'Игры'),
    el('p', { class: 'hint' }, 'Выбери игру ниже.'),
    accountRow(account, onAccount),
    el('ul', { class: 'menu-list' }, items.map(({ game, line, hasSave }, index) => el('li', {},
      el('a', { class: 'game-card', href: `#/game/${encodeURIComponent(game.id)}`, style: `--i: ${index}` },
        el('span', { class: 'game-card-title' }, game.title),
        el('span', { class: 'game-card-meta' }, line),
        hasSave && el('span', { class: 'badge' }, 'продолжить'),
      ),
    ))),
  ));
}

function accountRow(account, onAccount) {
  if (!account?.enabled || !onAccount) return null;
  const player = account.name;
  return el('div', { class: 'account-row' },
    el('span', { class: 'account-name' },
      player ? `Аккаунт: ${player}` : 'Прогресс хранится только в этом браузере'),
    el('button', { class: 'account-btn', onclick: onAccount }, player ? 'Выйти' : 'Войти'),
  );
}
