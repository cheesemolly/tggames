// Точка входа оболочки: связывает платформу, аккаунт, роутер, меню и хост игры.

import { platform } from '../platform/telegram.js';
import { account } from '../platform/account.js';
import { deviceId } from '../platform/device-id.js';
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
import { renderTop, overallLine } from './top.js';
import { openFeedback } from './feedback.js';
import { setBetaViewer, seesBeta, feature, inBeta, playerView, BETA } from './beta.js';
import { lockPageScroll } from './no-scroll.js';
import { finishSplash, SEES_BETA_KEY } from './splash.js';
import { createLogin } from './login.js';
// новый интерфейс (в бете 'new-ui', концепт 7 «Пиксель») — shell/nui/
import { renderHome } from './nui/home.js';
import { renderCatalog } from './nui/catalog.js';
import { renderProfile, renderNoRating, streakSheet } from './nui/profile.js';
import { tabBar, skeleton } from './nui/ui.js';
import { installAudioGate, applyPrefs, DEFAULT_PREFS } from './nui/prefs.js';
import { markVisit, noteOpened } from './nui/store.js';

const root = document.getElementById('app');
// ряды игр и баннеры нового интерфейса листаются вбок — там палец не гасим
lockPageScroll(document, { horizontal: () => nuiOn() });
let session = null;

const toast = createToast();
document.body.appendChild(toast.el);

const sync = createSync({
  account,
  onMessage: (text) => toast.show(text, 2600),
  afterRestore: migrateStats,      // серверный прогресс может быть ещё со старыми рекордами
  // бета sync-refresh: прогресс с другого устройства принимается через перезапуск открытой игры (adoptFresh)
  fresh: () => syncBeta() || mergeBeta(),
  // бета sync-merge: сервер сливает прогресс по ключам (server/merge.js); счётчики — по номеру устройства
  merge: () => mergeBeta(),
  device: () => deviceId(platform),
  onFresh: (apply, keys) => adoptFresh(apply, keys),
});

// Владелец — по /me (решает сервер). Для проверки на локальном сервере — ещё ?owner в адресе:
// только localhost, на GitHub Pages не работает; панели игроков это не открывает (её закрывает сервер).
const LOCAL_OWNER = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('owner');
const isOwner = () => account.isAdmin || LOCAL_OWNER;

// Бету (shell/beta.js) видят владелец и бета-тестеры (отмечаются в панели, решает сервер) — пока не включили
// «Смотреть как игрок». Панель игроков — только владельцу (isAdmin; её и так закрывает сервер).
const isTester = () => isOwner() || account.beta;
setBetaViewer(() => isTester() && !playerView());

/**
 * Бета sync-refresh — по аккаунту, а не по устройству: «Смотреть как игрок» её не выключает. Иначе на одном устройстве
 * работал бы новый клиент, а на другом — старый, и старый снова откатывал бы прогресс. Сервер (server/worker.js)
 * тоже принимает сохранения таких игроков только от нового клиента — это закрывает и закэшированный старый код.
 */
function syncBeta() {
  return !inBeta('sync-refresh') || isOwner() || account.beta;
}

/** Бета sync-merge (слияние по ключам) — тоже по аккаунту: на всех устройствах игрока один и тот же обмен. */
function mergeBeta() {
  return !inBeta('sync-merge') || isOwner() || account.beta;
}

/** Ключ хранилища принадлежит игре: её данные и её сохранённая партия (для перезапуска при слиянии). */
const ownsKey = (gameId, key) => key.startsWith(`game:${gameId}:`) || key === `shell:saves:${gameId}`;

/** Игры, которые видит этот игрок: игры из беты — только владельцу. */
const visibleGames = () => games.filter((g) => feature(g.id));

function show(route) {
  session?.close();
  session = null;
  applyChrome();
  // вошли посреди партии (shell/login.js) — прогресс подтягивается, когда игрок из неё вышел
  if (route.name !== 'game' && login) setTimeout(() => login.leftGame()?.catch((err) => console.error(err)), 0);

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
    if (nuiOn()) noteOpened(entry.id).catch(() => {});    // «Сначала недавние» и баннер «Продолжить»
    // «Назад» из игры возвращает в её папку, а не на главную.
    session = openGame(screen, entry, {
      platform, beta: seesBeta(), feature, perk: hasPerk, fresh: () => syncBeta() || mergeBeta(), onExit: () => backFrom(route),
    });
    return;
  }

  if (route.name === 'beta') {
    if (!isTester()) {
      goToMenu();
      return;
    }
    platform.backButton.show();
    renderBeta(screen, { games, onBack: () => backFrom(route), backLabel: nuiOn() ? 'Профиль' : 'Все игры', onChange: redraw });
    return;
  }

  // новый интерфейс: главная, игры, рейтинг, профиль — с вкладками внизу
  if (nuiOn() && ['menu', 'folder', 'games', 'profile', 'top'].includes(route.name)) {
    renderNui(screen, route);
    return;
  }
  if (route.name === 'games' || route.name === 'profile') {   // адреса нового интерфейса — в старом их нет
    goToMenu();
    return;
  }

  if (route.name === 'top') {
    // рейтинг — в бете (shell/beta.js) и только с аккаунтом: вне Telegram его нет
    if (!feature('leaderboard') || !account.enabled) {
      if (feature('leaderboard')) toast.show('Рейтинг работает внутри Telegram', 2500);
      goToMenu();
      return;
    }
    const overall = feature('leaderboard-overall');
    // вкладки общего рейтинга (#/top — «Общий», #/top/games — «По играм»): «Назад» из таблицы игры и профиля
    // возвращает на ту вкладку, откуда пришли
    if (route.game && route.game !== 'games') lastBoard = route.game;
    else if (!route.pid) {
      lastBoard = null;
      lastTab = route.game === 'games' ? '#/top/games' : '#/top';
    }
    platform.backButton.show();
    renderTop(screen, {
      route,
      overall,
      games: visibleGames(),
      source: {
        summary: () => account.topSummary(),
        game: (id) => account.topGame(id),
        player: (pid) => account.topPlayer(pid),
        find: (username) => account.findPlayer(username),
        suggest: feature('player-suggest') ? (q) => account.suggestPlayers(q) : null,
      },
      search: feature('player-search'),
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
    renderAdmin(screen, { onBack: () => backFrom(route), toast, onOwnSave: (text, updatedAt) => sync.adopt(text, updatedAt) });
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
  renderMenu(screen, {
    games: visibleGames(), account, beta: isTester(), top: feature('leaderboard'),
    topLine: feature('leaderboard-overall') ? async () => overallLine((await account.topSummary()).data) : null,
    feedback: feature('feedback') ? () => openFeedback({ account, toast }) : null,
    onRetry: login ? () => login.retry() : null,
  })
    .catch((err) => console.error(err));
}

// Из профиля игрока «Назад» ведёт в таблицу, из которой его открыли.
let lastBoard = null;
let lastTab = '#/top';          // вкладка рейтинга, с которой ушли в таблицу игры или профиль

/**
 * Особый скин (shell/perks.js): выдан владельцем в панели. Владелец видит все, пока не включил «Смотреть как игрок»
 * (на локальном сервере — и с ?owner) — даже если в Cloudflare ещё старый воркер, не отдающий perks. Бета-тестеру
 * особые скины сами не выдаются: они — подарок конкретному игроку.
 */
const hasPerk = (id) => (isOwner() && !playerView()) || account.perks.includes(id);

/** Куда ведёт «Назад»: из игры — в её папку, из папки — на главную, в рейтинге — на шаг вверх. */
function backFrom(route = currentRoute()) {
  // новый интерфейс: из игры — туда, откуда её открыли (главная, «Игры», рейтинг); бета и панель — в профиль
  if (nuiOn()) {
    if (route.name === 'game') {
      location.replace(lastPlace);
      return;
    }
    if (route.name === 'beta' || route.name === 'admin') {
      location.replace('#/profile');
      return;
    }
  }
  if (route.name === 'top' && route.game === 'games') {
    goToMenu();
    return;
  }
  if (route.name === 'top' && (route.game || route.pid)) {
    const overall = feature('leaderboard-overall');
    // профиль → таблица игры, из которой открыт, иначе вкладка; таблица игры → вкладка «По играм»
    if (route.pid) location.replace(lastBoard ? `#/top/${encodeURIComponent(lastBoard)}` : overall ? lastTab : '#/top');
    else location.replace(overall ? '#/top/games' : '#/top');
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

/**
 * На сервере прогресс новее (играли на другом устройстве; бета sync-refresh). Порядок важен: сначала открытая игра
 * помечается устаревшей — всё, что она сохранит дальше (в том числе в destroy()), отбрасывается; потом прогресс
 * ложится в хранилище (apply); потом игра перезапускается уже с ним. Только после этого sync сдвигает отметку обмена.
 * На экранах меню — просто перерисовка; панель и «Бета» не трогаем (там могут что-то набирать).
 */
async function adoptFresh(apply, keys = null) {
  const game = session;                           // открытая игра или null
  // слияние (бета sync-merge) сообщает, какие ключи изменились: игру перезапускаем, только если задеты её данные
  const hit = Boolean(game) && (!keys || keys.some((key) => ownsKey(game.gameId, key)));
  if (hit) game.markStale();
  await apply();
  if (hit && session === game) await game.reload();
  else if (['menu', 'folder', 'games', 'profile', 'top'].includes(currentRoute().name)) redraw();
  if (!keys || hit) toast.show('Прогресс обновлён с другого устройства', 2600);
}

// Вернулись в приложение — перечитать прогресс (бета sync-refresh; sync.refresh сам проверяет флаг и не
// спрашивает сервер дважды, когда приходят оба события)
const onReturn = () => sync.refresh().catch((err) => console.error(err));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onReturn();
});
platform.onActivated(onReturn);

// ---------- новый интерфейс (в бете 'new-ui') ----------

let lastPlace = '#/';          // экран, с которого открыли игру: «Назад» из игры ведёт туда

/**
 * Включён ли новый интерфейс. До ответа сервера (он скажет, владелец ли это) — по отметке с прошлого запуска,
 * как у заставки: иначе у владельца сначала мелькало бы старое меню. Вне Telegram — ?owner на localhost.
 */
function nuiOn() {
  if (!inBeta('new-ui')) return true;
  if (account.current || !account.enabled) return seesBeta();
  if (playerView()) return false;
  if (LOCAL_OWNER) return true;
  try {
    return localStorage.getItem(SEES_BETA_KEY) === '1';
  } catch {
    return false;
  }
}

const NUI_BG = '#110e20';
let chromeOn = null;

/** Новый интерфейс всегда тёмный (выбор владельца): тема, цвет шапки Telegram, настройки из шторки профиля. */
function applyChrome() {
  const on = nuiOn();
  if (on === chromeOn) return;
  const was = chromeOn;
  chromeOn = on;
  document.documentElement.classList.toggle('nui', on);
  if (on) {
    platform.forceScheme('dark');
    platform.setChrome(NUI_BG);
    installAudioGate();
    applyPrefs(platform);
  } else if (was) {
    // «Смотреть как игрок» — всё как у игроков; у тех, кто нового не видел, ничего не трогаем
    platform.forceScheme(null);
    platform.setChrome(null);
    applyPrefs(platform, DEFAULT_PREFS);
  }
}

function renderNui(screen, route) {
  if (route.name === 'folder') {                  // старые ссылки на папки — вкладка «Игры» с этой папкой
    location.replace(`#/games/${encodeURIComponent(route.id)}`);
    return;
  }
  const tab = { menu: 'home', games: 'games', top: 'top', profile: 'profile' }[route.name];
  const sub = route.name === 'top' && Boolean(route.pid || (route.game && route.game !== 'games'));
  if (sub) platform.backButton.show();
  else platform.backButton.hide();
  lastPlace = location.hash || '#/';

  screen.classList.add('nscreen');
  const body = el('div', { class: 'nbody' });
  screen.append(body, tabBar(tab, {
    onTab: (_, same) => {
      platform.haptic.selection();
      if (same) body.querySelector('.scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    },
  }));
  markVisit().catch(() => {});                    // огонёк серии: день засчитывается за то, что зашёл

  const summary = account.current && feature('leaderboard') ? () => account.topSummary() : null;
  const beta = (id) => inBeta(id) && seesBeta();
  const fail = (err) => console.error(err);
  if (route.name === 'menu') {
    renderHome(body, {
      games: visibleGames(), account, platform, summary, beta,
      onRetry: login ? () => login.retry() : null,
      onStreak: () => streakSheet().catch(fail),
    }).catch(fail);
  } else if (route.name === 'games') {
    renderCatalog(body, { games: visibleGames(), route, account, summary, beta }).catch(fail);
  } else if (route.name === 'profile') {
    renderProfile(body, {
      games: visibleGames(), account, platform, summary,
      betaCount: isTester() ? BETA.length : null,
      admin: account.isAdmin,
      feedback: () => openFeedback({ account, toast }),
      onPrefs: (prefs) => applyPrefs(platform, prefs),
    });
  } else if (!account.enabled) {
    renderNoRating(body, { platform });
  } else {
    if (route.game && route.game !== 'games') lastBoard = route.game;
    else if (!route.pid) {
      lastBoard = null;
      lastTab = route.game === 'games' ? '#/top/games' : '#/top';
    }
    renderTop(body, {
      route,
      overall: feature('leaderboard-overall'),
      games: visibleGames(),
      source: {
        summary: () => account.topSummary(),
        game: (id) => account.topGame(id),
        player: (pid) => account.topPlayer(pid),
        find: (username) => account.findPlayer(username),
        suggest: feature('player-suggest') ? (q) => account.suggestPlayers(q) : null,
      },
      search: feature('player-search'),
      tabbed: true,
      skeleton: () => skeleton('row', 6),
      onBack: () => backFrom(route),
    }).catch(fail);
  }
}

// Вход на сервер (shell/login.js) — в бете stable-login; игрокам пока по-старому (ниже).
const LOGIN_TIMEOUT_MS = 20000;
let login = null;

/**
 * Видит ли бету — ещё до ответа сервера (он и скажет, владелец ли это): как у заставки, по отметке с прошлого
 * запуска (rememberBeta). Иначе новый вход включился бы у владельца только после старого.
 */
function stableLogin() {
  if (!inBeta('stable-login')) return true;
  if (LOCAL_OWNER) return !playerView();
  try {
    return localStorage.getItem(SEES_BETA_KEY) === '1';
  } catch {
    return false;
  }
}

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
if (account.enabled && stableLogin()) {
  // бета stable-login: имя и рейтинг сразу после входа, повторы, запросы не висят дольше LOGIN_TIMEOUT_MS
  account.timeoutMs = LOGIN_TIMEOUT_MS;
  login = createLogin({
    account,
    sync,
    inGame: () => currentRoute().name === 'game',
    redraw: () => {
      if (account.current) rememberBeta();      // без ответа сервера не знаем, владелец ли, — отметку не трогаем
      redraw();
    },
    onError: (res) => toast.show(message(res.error), 3000),
  });
  login.start().catch((err) => console.error(err)).finally(finishSplash);
} else if (account.enabled) {
  (async () => {
    const res = await account.signIn();
    if (res.ok) rememberBeta();                 // без ответа сервера не знаем, владелец ли, — отметку не трогаем
    if (!res.ok) {
      if (res.error !== 'network') toast.show(message(res.error), 3000);
      return;
    }
    await sync.pull();
    redraw();
  })().catch((err) => console.error(err)).finally(finishSplash);
} else {
  finishSplash();
}

/**
 * Заставка (shell/splash.js) стартует раньше, чем сервер скажет, владелец ли это. Поэтому видит ли человек бету —
 * запоминается на устройстве: пока заставка в бете, она покажется ему со следующего запуска.
 */
function rememberBeta() {
  try {
    if (seesBeta()) localStorage.setItem(SEES_BETA_KEY, '1');
    else localStorage.removeItem(SEES_BETA_KEY);
  } catch {
    // приватный режим — заставка просто не покажется
  }
}
