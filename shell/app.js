// Точка входа оболочки: связывает платформу, аккаунт, роутер, меню и хост игры.

import { platform } from '../platform/telegram.js';
import { account } from '../platform/account.js';
import { message } from '../platform/errors.js';
import { el } from '../shared/dom.js';
import { createToast } from '../shared/toast.js';
import { games } from './registry.js';
import { currentRoute, onRouteChange, goToMenu, goToFolder } from './router.js';
import { renderMenu, renderFolder } from './menu.js';
import { findCategory, categoryOfGame, gamesOf } from './categories.js';
import { migrateStats } from './stats.js';
import { openGame } from './game-host.js';
import { createSync } from './sync.js';
import { renderAdmin } from './admin.js';
import { renderBeta } from './beta-screen.js';
import { renderTop } from './top.js';
import { setBetaViewer, seesBeta, feature, inBeta, playerView } from './beta.js';
import { lockPageScroll } from './no-scroll.js';

const root = document.getElementById('app');
lockPageScroll();
let session = null;

const toast = createToast();
document.body.appendChild(toast.el);

const sync = createSync({
  account,
  onMessage: (text) => toast.show(text, 2600),
  afterRestore: migrateStats,      // серверный прогресс может быть ещё со старыми рекордами
});

// Владелец — по /me (решает сервер). Для проверки из Claude на локальном сервере — ещё ?owner в адресе:
// только localhost, на GitHub Pages не работает; панели игроков это не открывает (её закрывает сервер).
const LOCAL_OWNER = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('owner');
const isOwner = () => account.isAdmin || LOCAL_OWNER;

// Бету (shell/beta.js) видит только владелец — и то пока не включил «Смотреть как игрок».
setBetaViewer(() => isOwner() && !playerView());

/** Игры, которые видит этот игрок: игры из беты — только владельцу. */
const visibleGames = () => games.filter((g) => feature(g.id));

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
    if (!feature(entry.id)) {                       // чужая ссылка на игру в бете
      goToMenu();
      return;
    }
    platform.backButton.show();
    // «Назад» из игры возвращает в её папку, а не на главную.
    session = openGame(screen, entry, { platform, beta: seesBeta(), feature, onExit: () => backFrom(route) });
    return;
  }

  if (route.name === 'beta') {
    if (!isOwner()) {
      goToMenu();
      return;
    }
    platform.backButton.show();
    renderBeta(screen, { games, onBack: goToMenu, onChange: redraw });
    return;
  }

  if (route.name === 'top') {
    // рейтинг — в бете (shell/beta.js) и только с аккаунтом: вне Telegram его нет
    if (!feature('leaderboard') || !account.enabled) {
      if (feature('leaderboard')) toast.show('Рейтинг работает внутри Telegram', 2500);
      goToMenu();
      return;
    }
    if (route.game) lastBoard = route.game;
    platform.backButton.show();
    renderTop(screen, {
      route,
      games: visibleGames(),
      source: {
        summary: () => account.topSummary(),
        game: (id) => account.topGame(id),
        player: (pid) => account.topPlayer(pid),
      },
      onBack: () => backFrom(route),
    }).catch((err) => console.error(err));
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
    if (!category || gamesOf(category, visibleGames()).length === 0) {
      goToMenu();
      return;
    }
    platform.backButton.show();
    renderFolder(screen, { category, games: visibleGames(), onBack: goToMenu }).catch((err) => console.error(err));
    return;
  }

  platform.backButton.hide();
  renderMenu(screen, { games: visibleGames(), account, owner: isOwner(), top: feature('leaderboard') })
    .catch((err) => console.error(err));
}

// Из профиля игрока «Назад» ведёт в таблицу, из которой его открыли.
let lastBoard = null;

/** Куда ведёт «Назад»: из игры — в её папку, из папки — на главную, в рейтинге — на шаг вверх. */
function backFrom(route = currentRoute()) {
  if (route.name === 'top' && (route.game || route.pid)) {
    location.replace(route.pid && lastBoard ? `#/top/${encodeURIComponent(lastBoard)}` : '#/top');
    if (!route.pid) lastBoard = null;
    return;
  }
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
// Ссылка из инлайн-режима бота (t.me/<бот>?startapp=sudoku) открывает сразу игру, а не меню.
// replaceState, а не location.replace: без лишнего hashchange (иначе игра открылась бы дважды).
const startGame = platform.startParam && games.find((g) => g.id === platform.startParam && !inBeta(g.id));
if (startGame && currentRoute().name === 'menu') history.replaceState(null, '', `#/game/${startGame.id}`);
show(currentRoute());

platform.ready();
platform.expand();
// Иначе Telegram сворачивает мини-апп свайпом вниз прямо во время хода (2048, «Соедини точки»).
platform.lockSwipes();
// Полноэкранный режим — только на телефоне: жесты сворачивания клиенту больше не отдаются, игра занимает весь
// экран. На компьютере (Telegram Desktop, macOS, веб) он не нужен — там обычное окно (просьба владельца);
// если окно всё же развёрнуто (осталось с прошлого раза), возвращаем обычное.
// На клиентах без поддержки (старее Bot API 8.0) ничего не меняется.
if (platform.isDesktop) {
  if (platform.fullscreen.isActive) platform.fullscreen.exit();
} else {
  platform.fullscreen.tryEnable((problem) => {
    console.warn('полноэкранный режим:', problem);
    if (problem.error === 'ALREADY_FULLSCREEN') return;
    offerFullscreen(`не вышло: ${problem.error}`);
  });
}

/**
 * Запрос при старте срабатывает не всегда (клиент может его проглотить). Тогда показываем кнопку:
 * по явному нажатию Telegram открывает полный экран надёжнее, и заодно человек сам решает.
 * Кнопка исчезает, как только режим включился, и сама убирается через 12 секунд.
 */
function offerFullscreen(reason = '') {
  if (!platform.isTelegram || platform.fullscreen.isActive) return;
  if (document.querySelector('.fs-offer')) return;
  console.info('предлагаю полный экран', reason);

  const button = el('button', {
    class: 'fs-offer',
    onclick: () => {
      platform.fullscreen.request();
      setTimeout(() => {
        if (platform.fullscreen.isActive) button.remove();
        else toast.show(`Telegram не даёт полный экран · версия ${platform.fullscreen.version}`, 5000);
      }, 400);
    },
  }, '⛶ Во весь экран');

  document.body.appendChild(button);
  platform.fullscreen.onChange(() => {
    if (platform.fullscreen.isActive) button.remove();
  });
  setTimeout(() => button.remove(), 12000);
}

// Если через полторы секунды шапка Telegram всё ещё на месте — предлагаем кнопку (только на телефоне).
if (!platform.isDesktop) setTimeout(() => offerFullscreen('запрос при старте не сработал'), 1500);

// Внутри Telegram вход происходит сам: подпись initData проверяет сервер (platform/account.js).
// В обычном браузере аккаунтов нет — игра остаётся гостевой, прогресс живёт в браузере.
if (account.enabled) {
  (async () => {
    const res = await account.signIn();
    if (!res.ok) {
      if (res.error !== 'network') toast.show(message(res.error), 3000);
      // Подпись не сошлась при заведомо верном токене — редкий случай, сразу показываем причину,
      // иначе её не видно без отладчика внутри Telegram.
      if (res.error === 'bad_signature' || res.error === 'bad_init_data') {
        const d = await account.diagnose();
        const info = d.ok ? d.data : { error: d.error };
        console.warn('Диагностика входа:', info);
        const variant = Object.entries(info.matches ?? {}).find(([, match]) => match)?.[0];
        toast.show(variant
          ? `Подпись считается иначе: подходит вариант «${variant}»`
          : `Подпись не от этого бота. Полей: ${info.fields?.length ?? '?'}`
            + `${info.hasSignature ? ', есть signature' : ''}`
            + `${info.ageSec != null ? `, возраст ${info.ageSec} с` : ''}`, 8000);
      }
      return;
    }
    await sync.pull();
    redraw();
  })().catch((err) => console.error(err));
}
