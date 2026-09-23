// Точка входа оболочки: связывает платформу, аккаунт, роутер, меню и хост игры.

import { platform } from '../platform/telegram.js';
import { account } from '../platform/account.js';
import { message } from '../platform/errors.js';
import { el } from '../shared/dom.js';
import { createToast } from '../shared/toast.js';
import { games } from './registry.js';
import { currentRoute, onRouteChange, goToMenu, goToFolder } from './router.js';
import { renderMenu, renderFolder } from './menu.js';
import { findCategory, categoryOfGame } from './categories.js';
import { migrateStats } from './stats.js';
import { openGame } from './game-host.js';
import { createSync } from './sync.js';
import { renderAdmin } from './admin.js';

const root = document.getElementById('app');
let session = null;

const toast = createToast();
document.body.appendChild(toast.el);

const sync = createSync({
  account,
  onMessage: (text) => toast.show(text, 2600),
  afterRestore: migrateStats,      // серверный прогресс может быть ещё со старыми рекордами
});

function show(route) {
  session?.close();
  session = null;

  // Каждый маршрут — новый экран. Если маршрут сменится во время асинхронной отрисовки,
  // старый экран уже отсоединён и дорисуется «в пустоту», не затирая новый.
  const screen = el('main', { class: 'screen' });
  root.replaceChildren(screen);

  if (route.name === 'game') {
    const entry = games.find((g) => g.id === route.id);
    if (!entry) {
      console.warn(`Неизвестная игра "${route.id}", возвращаюсь в меню`);
      goToMenu();
      return;
    }
    platform.backButton.show();
    // «Назад» из игры возвращает в её папку, а не на главную.
    session = openGame(screen, entry, { platform, onExit: () => backFrom(route) });
    return;
  }

  if (route.name === 'admin') {
    if (!account.isAdmin) {
      goToMenu();
      return;
    }
    platform.backButton.show();
    renderAdmin(screen, { onBack: goToMenu, toast });
    return;
  }

  if (route.name === 'folder') {
    const category = findCategory(route.id);
    if (!category) {
      goToMenu();
      return;
    }
    platform.backButton.show();
    renderFolder(screen, { category, games, onBack: goToMenu }).catch((err) => console.error(err));
    return;
  }

  platform.backButton.hide();
  renderMenu(screen, { games, account }).catch((err) => console.error(err));
}

/** Куда ведёт «Назад»: из игры — в её папку, из папки — на главную. */
function backFrom(route = currentRoute()) {
  if (route.name === 'game') {
    const category = categoryOfGame(route.id);
    if (category) {
      goToFolder(category.id);
      return;
    }
  }
  goToMenu();
}

const redraw = () => show(currentRoute());

// Смысл рекорда у части игр изменился — старые числа чистятся один раз (shell/stats.js).
await migrateStats();

platform.backButton.onClick(() => backFrom());
onRouteChange(show);
show(currentRoute());

platform.ready();
platform.expand();

// Внутри Telegram вход происходит сам: подпись initData проверяет сервер (platform/account.js).
// В обычном браузере аккаунтов нет — игра остаётся гостевой, прогресс живёт в браузере.
if (account.enabled) {
  (async () => {
    const res = await account.signIn();
    if (!res.ok) {
      if (res.error !== 'network') toast.show(message(res.error), 3000);
      return;
    }
    await sync.pull();
    redraw();
  })().catch((err) => console.error(err));
}
