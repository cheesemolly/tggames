// Точка входа оболочки: связывает платформу, аккаунт, роутер, меню и хост игры.

import { platform } from '../platform/telegram.js';
import { account } from '../platform/account.js';
import { el } from '../shared/dom.js';
import { createToast } from '../shared/toast.js';
import { games } from './registry.js';
import { currentRoute, onRouteChange, goToMenu } from './router.js';
import { renderMenu } from './menu.js';
import { migrateStats } from './stats.js';
import { openGame } from './game-host.js';
import { createSync } from './sync.js';
import { openAuth, guestChosen, rememberGuest, forgetGuest } from './auth.js';

const root = document.getElementById('app');
let session = null;

const toast = createToast();
document.body.appendChild(toast.el);

const sync = createSync({ account, onMessage: (text) => toast.show(text, 2600) });

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
  renderMenu(screen, { games, platform, account, onAccount: openAccountScreen })
    .catch((err) => console.error(err));
}

const redraw = () => show(currentRoute());

/** Экран входа из меню: после входа прогресс приезжает с сервера, меню перерисовывается. */
async function openAccountScreen() {
  if (account.name) {                       // вошедший игрок — это выход из аккаунта
    await sync.push();                      // не теряем несохранённое
    await account.logout();
    sync.reset();
    rememberGuest();
    toast.show('Вы вышли. Прогресс остался на этом устройстве');
    redraw();
    return;
  }
  const result = await openAuth({ canCancel: true });
  if (result === 'account') {
    await sync.pull({ afterLogin: true });
    toast.show(`Привет, ${account.name}!`);
  }
  redraw();
}

// Смысл рекорда у части игр изменился — старые числа чистятся один раз (shell/stats.js).
await migrateStats();

platform.backButton.onClick(goToMenu);
onRouteChange(show);
show(currentRoute());

platform.ready();
platform.expand();

// Аккаунты работают, только если выложен обработчик (shell/config.js). Без него — как раньше,
// весь прогресс живёт в браузере, и никаких экранов входа не появляется.
if (account.enabled) {
  (async () => {
    if (account.current) {
      await sync.pull();
      redraw();
      return;
    }
    if (guestChosen()) return;
    const result = await openAuth();
    if (result === 'account') {
      forgetGuest();
      await sync.pull({ afterLogin: true });
      toast.show(`Привет, ${account.name}!`);
    }
    redraw();
  })().catch((err) => console.error(err));
}
