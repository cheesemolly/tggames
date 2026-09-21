// Точка входа оболочки: связывает платформу, роутер, меню и хост игры.

import { platform } from '../platform/telegram.js';
import { el } from '../shared/dom.js';
import { games } from './registry.js';
import { currentRoute, onRouteChange, goToMenu } from './router.js';
import { renderMenu } from './menu.js';
import { openGame } from './game-host.js';

const root = document.getElementById('app');
let session = null;

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
    session = openGame(screen, entry, { platform, onExit: goToMenu });
    return;
  }

  platform.backButton.hide();
  renderMenu(screen, { games, platform }).catch((err) => console.error(err));
}

platform.backButton.onClick(goToMenu);
onRouteChange(show);
show(currentRoute());

platform.ready();
platform.expand();
