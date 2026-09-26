// Два экрана меню: главная с папками-категориями и содержимое папки.
// Оба — сетка карточек с иконками (решение владельца, 2026-09-23: «папочки и grid»).
// Строка под названием игры — shell/menu-line.js, она у каждой игры своя по смыслу.

import { el } from '../shared/dom.js';
import { getStats } from './stats.js';
import { saves } from './saves.js';
import { progress } from './progress.js';
import { menuLine } from './menu-line.js';
import { visibleCategories, gamesOf, gameWord } from './categories.js';
import { GAME_ICONS, CATEGORY_ICONS } from './icons.js';
import { BETA, inBeta, seesBeta } from './beta.js';

/** Иконка в цветной плитке: цвет берётся из переменной папки. */
function tile(markup, extraClass = '') {
  const node = el('span', { class: `tile ${extraClass}`.trim() });
  node.innerHTML = markup;
  return node;
}

async function gameInfo(game) {
  const [stats, line, save] = await Promise.all([
    getStats(game.id), progress.get(game.id), saves.get(game.id),
  ]);
  return { game, line: menuLine(stats, { menu: game.menu, progress: line, save }), hasSave: save != null };
}

export async function renderMenu(container, { games, account = null, owner = false, top = false }) {
  // Незаконченные партии считаем заранее — по ним на папке загорается точка «есть что продолжить».
  const savedIds = new Set(
    (await Promise.all(games.map(async (g) => ((await saves.get(g.id)) != null ? g.id : null)))).filter(Boolean),
  );

  const cards = visibleCategories(games).map((category, index) => {
    const list = gamesOf(category, games);
    const card = el('a', {
      class: 'folder-card',
      href: `#/folder/${encodeURIComponent(category.id)}`,
      style: `--cat: var(${category.color}); --i: ${index}`,
    },
      tile(CATEGORY_ICONS[category.id] ?? '', 'tile-lg'),
      el('span', { class: 'folder-title' }, category.title),
      el('span', { class: 'folder-meta' }, `${list.length} ${gameWord(list.length)}`),
      el('span', { class: 'folder-hint' }, category.hint),
      list.some((g) => savedIds.has(g.id)) && el('span', { class: 'folder-dot', title: 'Есть незаконченная партия' }),
    );
    return card;
  });

  container.replaceChildren(el('div', { class: 'scroll' },
    el('h1', {}, 'Игры'),
    el('div', { class: 'title-rule' }),
    el('p', { class: 'hint' }, 'Выбери игру ниже.'),
    accountRow(account, owner),
    top && account?.enabled && account.current && topEntry(),
    el('div', { class: 'folder-grid' }, cards),
  ));
}

export async function renderFolder(container, { category, games, onBack }) {
  const list = gamesOf(category, games);
  const items = await Promise.all(list.map(gameInfo));

  container.replaceChildren(el('div', { class: 'scroll', style: `--cat: var(${category.color})` },
    el('div', { class: 'folder-head' },
      el('button', { class: 'back-chip', onclick: onBack, 'aria-label': 'Ко всем играм' }, '‹ Все игры'),
      el('div', { class: 'folder-head-text' },
        el('h1', {}, category.title),
        el('div', { class: 'title-rule' }),
        el('p', { class: 'hint' }, category.hint),
      ),
    ),
    el('div', { class: 'game-grid' }, items.map(({ game, line, hasSave }, index) => el('a', {
      class: 'game-tile',
      href: `#/game/${encodeURIComponent(game.id)}`,
      style: `--i: ${index}`,
    },
      tile(GAME_ICONS[game.id] ?? ''),
      el('span', { class: 'game-tile-title' }, game.title),
      el('span', { class: 'game-tile-meta' }, line),
      (hasSave || (inBeta(game.id) && seesBeta())) && el('span', { class: 'badge-stack' },
        inBeta(game.id) && seesBeta() && el('span', { class: 'badge badge-beta' }, 'бета'),
        hasSave && el('span', { class: 'badge badge-corner' }, 'продолжить'),
      ),
    ))),
  ));
}

/** Вход в рейтинг (shell/top.js) — карточкой над папками: так его видно сразу. */
function topEntry() {
  return el('a', { class: 'top-entry', href: '#/top' },
    el('span', { class: 'top-entry-cup' }, '🏆'),
    el('span', { class: 'top-row-main' },
      el('span', { class: 'top-row-name' }, 'Рейтинг'),
      el('span', { class: 'top-row-sub' }, 'Кто лучше всех в каждой игре'),
    ),
    el('span', { class: 'top-chevron' }, '›'),
  );
}

/**
 * Внутри Telegram — имя игрока (вход происходит сам) и кнопка панели у владельца.
 * В обычном браузере аккаунтов нет: честно пишем, что прогресс живёт только здесь.
 */
function accountRow(account, owner = false) {
  const betaBtn = owner && el('a', { class: 'account-btn account-btn-beta', href: '#/beta' }, BETA.length ? `Бета · ${BETA.length}` : 'Бета');
  if (!account?.enabled) {
    return el('div', { class: 'account-row' },
      el('span', { class: 'account-name' }, 'Прогресс хранится только в этом браузере'), betaBtn);
  }
  if (!account.current) return null;          // вход ещё идёт — не мигаем пустой строкой
  return el('div', { class: 'account-row' },
    el('span', { class: 'account-name' }, `Аккаунт Telegram: ${account.name}`),
    betaBtn,
    account.isAdmin && el('a', { class: 'account-btn', href: '#/admin' }, 'Панель'),
  );
}
