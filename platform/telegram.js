// Адаптер Telegram WebApp. Оболочка и игры обращаются к Telegram только через него.
// Вне Telegram подставляется браузерная заглушка с тем же интерфейсом:
// она рисует фейковую шапку (кнопка «Назад», переключатель темы) и фейковую MainButton.
//
// Интерфейс platform:
//   isTelegram, user, initData (подписанная строка для сервера; вне Telegram — пустая), colorScheme
//   isDesktop — открыто на компьютере (Telegram Desktop, macOS, веб-версия): там полный экран не нужен
//   ready(), expand()
//   lockSwipes()  — запретить Telegram сворачивать мини-апп свайпом (в играх свайп — это ход)
//   fullscreen: supported, isActive, request(), exit(), onChange(cb)
//   mainButton: show(), hide(), setText(text), onClick(cb), offClick(cb)
//   backButton: show(), hide(), onClick(cb), offClick(cb)
//   haptic: impact(style), notification(type), selection()
//   share(text) → Promise<'shared' | 'copied' | 'cancelled' | 'failed'>
// Для нового интерфейса (в бете 'new-ui'; в старом не вызываются):
//   forceScheme('dark' | null) — тема всегда тёмная, что бы ни выбрал Telegram (null — снова как в Telegram)
//   setChrome(color | null)    — цвет шапки и фона Telegram вокруг мини-приложения (null — цвета темы)
//   setHaptics(on)             — общий выключатель вибрации (игры зовут haptic как раньше)
//   openLink(url), openTelegramLink(url) — ссылка наружу / в Telegram (бот, канал)
//   onActivated(cb) — мини-приложение снова на экране (Telegram 'activated', Bot API 8.0; вне Telegram — нет:
//                     там хватает visibilitychange). Для перечитывания прогресса (бета 'sync-refresh').
//   deviceStorage: get(key) → Promise<строка | null>, set(key, value) → Promise<boolean> — хранилище ЭТОГО устройства
//                  (Telegram DeviceStorage, Bot API 9.0; с другими устройствами не синхронизируется, в отличие от
//                  CloudStorage). Номер устройства для счётчиков по устройствам (бета 'sync-merge'). Нет — null/false.

import { el, loadCss } from '../shared/dom.js';
import { isMobilePlatform } from './device.js';

const FAKE_USER = { id: 1, first_name: 'Тестер', username: 'tester', language_code: 'ru' };

const webApp = window.Telegram?.WebApp;
// telegram-web-app.js создаёт WebApp и в обычном браузере, но initData там пустая.
const inTelegram = Boolean(webApp?.initData);

/** Вызов Telegram DeviceStorage (Bot API 9.0) с ответом через колбэк; нет хранилища или ошибка — fallback. */
function deviceCall(run, fallback) {
  return new Promise((resolve) => {
    const ds = webApp?.DeviceStorage;
    if (!ds || !webApp.isVersionAtLeast?.('9.0')) {
      resolve(fallback);
      return;
    }
    try {
      run(ds, resolve);
    } catch {
      resolve(fallback);
    }
  });
}

export const platform = inTelegram ? createTelegramPlatform(webApp) : createBrowserPlatform();

/** Системное меню «Поделиться» (Web Share API), а где его нет — копирование в буфер обмена. */
async function webShare(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';   // закрыл меню «Поделиться»
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function createTelegramPlatform(tg) {
  const root = document.documentElement;
  let forced = null;
  let hapticsOn = true;
  const syncScheme = () => { root.dataset.theme = forced ?? tg.colorScheme; };
  syncScheme();
  tg.onEvent('themeChanged', syncScheme);
  // цвет вокруг мини-приложения: шапка (hex — с Bot API 6.9), фон при оттягивании, нижняя панель (7.10)
  const chrome = (color) => {
    try {
      if (!tg.isVersionAtLeast?.('6.9')) return;
      tg.setHeaderColor?.(color ?? 'bg_color');
      tg.setBackgroundColor?.(color ?? 'bg_color');
      if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.(color ?? 'bottom_bar_bg_color');
    } catch (err) {
      console.warn('не удалось сменить цвет шапки', err);
    }
  };

  // В полноэкранном режиме Telegram убирает свою шапку, но рисует поверх страницы кнопки «закрыть»
  // и «меню», а сверху ещё часы и вырез устройства. По этому признаку вёрстка добавляет отступы
  // (styles/app.css), иначе заголовок уезжает под статус-бар.
  const syncFullscreen = () => { root.dataset.fullscreen = tg.isFullscreen ? 'on' : 'off'; };
  syncFullscreen();
  tg.onEvent?.('fullscreenChanged', syncFullscreen);
  tg.onEvent?.('fullscreenFailed', syncFullscreen);

  return {
    isTelegram: true,
    user: tg.initDataUnsafe?.user ?? null,
    // Параметр из ссылки t.me/<бот>?startapp=<игра> (инлайн-режим бота) — какую игру открыть сразу.
    startParam: tg.initDataUnsafe?.start_param ?? null,
    // Сырая строка с подписью: сервер по ней узнаёт игрока. Читается каждый раз — Telegram её обновляет.
    get initData() { return tg.initData; },
    get colorScheme() { return forced ?? tg.colorScheme; },

    ready: () => tg.ready(),
    expand: () => tg.expand(),

    forceScheme(scheme) {
      forced = scheme;
      syncScheme();
    },
    setChrome: chrome,
    setHaptics(on) { hapticsOn = Boolean(on); },
    openLink(url) {
      try {
        tg.openLink(url);
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    },
    openTelegramLink(url) {
      try {
        tg.openTelegramLink(url);
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    },
    onActivated(cb) {
      try {
        tg.onEvent?.('activated', cb);
      } catch {
        // старый клиент — остаётся visibilitychange
      }
    },
    deviceStorage: {
      get: (key) => deviceCall((ds, done) => ds.getItem(key, (err, value) => done(err ? null : value ?? null)), null),
      set: (key, value) => deviceCall((ds, done) => ds.setItem(key, value, (err, ok) => done(!err && ok !== false)), false),
    },

    /**
     * Свайп вниз сворачивает мини-апп, а в 2048 и «Соедини точки» свайп — это ход:
     * Telegram забирал жест себе (замечание владельца). disableVerticalSwipes появился в Bot API 7.7,
     * на старых клиентах метода просто нет — тогда ничего не делаем.
     */
    lockSwipes() {
      try {
        tg.disableVerticalSwipes?.();
      } catch (err) {
        console.warn('не удалось запретить свайпы', err);
      }
    },

    isDesktop: !isMobilePlatform(tg.platform),

    // Полноэкранный режим (Bot API 8.0): приложение занимает весь экран, шапка Telegram убирается.
    fullscreen: {
      get supported() { return typeof tg.requestFullscreen === 'function' && tg.isVersionAtLeast?.('8.0'); },
      get isActive() { return Boolean(tg.isFullscreen); },
      request() {
        try {
          tg.requestFullscreen?.();
        } catch (err) {
          console.warn('не удалось открыть во весь экран', err);
        }
      },
      exit() {
        try {
          tg.exitFullscreen?.();
        } catch (err) {
          console.warn('не удалось выйти из полноэкранного режима', err);
        }
      },
      onChange(cb) {
        tg.onEvent?.('fullscreenChanged', cb);
        tg.onEvent?.('fullscreenFailed', cb);
      },
      get version() { return tg.version ?? '?'; },

      /**
       * Позвать один раз при старте. onProblem получает причину отказа: старый клиент, отказ
       * Telegram (`fullscreenFailed`) или исключение. Без этого непонятно, почему шапка осталась
       * на месте — отладчика внутри Telegram нет.
       */
      tryEnable(onProblem = () => {}) {
        if (typeof tg.requestFullscreen !== 'function') {
          onProblem({ error: 'СТАРЫЙ_КЛИЕНТ', version: tg.version });
          return false;
        }
        tg.onEvent?.('fullscreenFailed', (event) => onProblem({ error: event?.error ?? 'ОТКАЗ', version: tg.version }));
        try {
          tg.requestFullscreen();
        } catch (err) {
          onProblem({ error: String(err?.message ?? err), version: tg.version });
          return false;
        }
        // Часть клиентов принимает запрос только после того, как окно устоялось.
        setTimeout(() => {
          if (!tg.isFullscreen) {
            try {
              tg.requestFullscreen();
            } catch {
              // вторая попытка молча: о первой уже сообщили
            }
          }
        }, 800);
        return true;
      },
    },

    mainButton: {
      show: () => tg.MainButton.show(),
      hide: () => tg.MainButton.hide(),
      setText: (text) => tg.MainButton.setText(text),
      onClick: (cb) => tg.MainButton.onClick(cb),
      offClick: (cb) => tg.MainButton.offClick(cb),
    },

    backButton: {
      show: () => tg.BackButton.show(),
      hide: () => tg.BackButton.hide(),
      onClick: (cb) => tg.BackButton.onClick(cb),
      offClick: (cb) => tg.BackButton.offClick(cb),
    },

    haptic: {
      impact: (style = 'light') => hapticsOn && tg.HapticFeedback?.impactOccurred(style),
      notification: (type) => hapticsOn && tg.HapticFeedback?.notificationOccurred(type),
      selection: () => hapticsOn && tg.HapticFeedback?.selectionChanged(),
    },

    // Внутри Telegram ещё не проверено: если Web Share недоступен — окно выбора чата через t.me/share.
    async share(text) {
      if (navigator.share) return webShare(text);
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(text)}`);
      return 'shared';
    },
  };
}

function createBrowserPlatform() {
  const root = document.documentElement;

  // Тема: ?theme=dark|light в URL, иначе — системная. Переключается кнопкой в шапке.
  const fromUrl = new URLSearchParams(location.search).get('theme');
  let scheme = fromUrl === 'dark' || fromUrl === 'light'
    ? fromUrl
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let forced = null;
  const applyScheme = () => { root.dataset.theme = forced ?? scheme; };
  applyScheme();

  loadCss(new URL('./stub.css', import.meta.url));

  const backHandlers = new Set();
  const mainHandlers = new Set();
  // Копия множества: обработчик может отписаться прямо во время вызова.
  const fire = (handlers) => [...handlers].forEach((cb) => cb());

  const backEl = el('button', { class: 'tg-stub-back', hidden: true, onclick: () => fire(backHandlers) }, '‹ Назад');
  const themeEl = el('button', {
    class: 'tg-stub-theme',
    title: 'Сменить тему',
    onclick: () => {
      scheme = scheme === 'dark' ? 'light' : 'dark';
      applyScheme();
    },
  }, '◐');
  const header = el('header', { class: 'tg-stub-header' },
    backEl,
    el('span', { class: 'tg-stub-title' }, 'Mini App · браузер'),
    themeEl,
  );
  const mainEl = el('button', { class: 'tg-stub-main', hidden: true, onclick: () => fire(mainHandlers) }, 'Продолжить');

  document.body.prepend(header);
  document.body.append(mainEl);

  const log = (...args) => console.debug('[tg-stub]', ...args);

  return {
    isTelegram: false,
    startParam: new URLSearchParams(location.search).get('startapp'),   // как ?startapp= в ссылке Telegram
    isDesktop: false,                // заглушка изображает телефон (разработка в мобильном режиме)
    initData: '',                    // вне Telegram подписывать нечего — аккаунтов тут нет
    user: FAKE_USER,
    get colorScheme() { return forced ?? scheme; },

    ready: () => log('ready()'),
    expand: () => log('expand()'),

    forceScheme(value) {
      forced = value;
      applyScheme();
    },
    setChrome: (color) => log('setChrome', color),
    setHaptics: (on) => log('setHaptics', on),
    openLink: (url) => window.open(url, '_blank', 'noopener'),
    openTelegramLink: (url) => window.open(url, '_blank', 'noopener'),
    onActivated: () => {},
    deviceStorage: { get: async () => null, set: async () => false },
    lockSwipes: () => log('lockSwipes()'),
    fullscreen: {
      supported: false,
      isActive: false,
      request: () => log('fullscreen.request()'),
      exit: () => log('fullscreen.exit()'),
      onChange: () => {},
      version: 'браузер',
      tryEnable: () => false,
    },

    mainButton: {
      show: () => { mainEl.hidden = false; },
      hide: () => { mainEl.hidden = true; },
      setText: (text) => { mainEl.textContent = text; },
      onClick: (cb) => mainHandlers.add(cb),
      offClick: (cb) => mainHandlers.delete(cb),
    },

    backButton: {
      show: () => { backEl.hidden = false; },
      hide: () => { backEl.hidden = true; },
      onClick: (cb) => backHandlers.add(cb),
      offClick: (cb) => backHandlers.delete(cb),
    },

    haptic: {
      impact: (style = 'light') => log('haptic impact', style),
      notification: (type) => log('haptic notification', type),
      selection: () => log('haptic selection'),
    },

    share: webShare,
  };
}
