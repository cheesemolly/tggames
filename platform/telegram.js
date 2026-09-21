// Адаптер Telegram WebApp. Оболочка и игры обращаются к Telegram только через него.
// Вне Telegram подставляется браузерная заглушка с тем же интерфейсом:
// она рисует фейковую шапку (кнопка «Назад», переключатель темы) и фейковую MainButton.
//
// Интерфейс platform:
//   isTelegram, user, colorScheme
//   ready(), expand()
//   mainButton: show(), hide(), setText(text), onClick(cb), offClick(cb)
//   backButton: show(), hide(), onClick(cb), offClick(cb)
//   haptic: impact(style), notification(type), selection()

import { el, loadCss } from '../shared/dom.js';

const FAKE_USER = { id: 1, first_name: 'Тестер', username: 'tester', language_code: 'ru' };

const webApp = window.Telegram?.WebApp;
// telegram-web-app.js создаёт WebApp и в обычном браузере, но initData там пустая.
const inTelegram = Boolean(webApp?.initData);

export const platform = inTelegram ? createTelegramPlatform(webApp) : createBrowserPlatform();

function createTelegramPlatform(tg) {
  const root = document.documentElement;
  const syncScheme = () => { root.dataset.theme = tg.colorScheme; };
  syncScheme();
  tg.onEvent('themeChanged', syncScheme);

  return {
    isTelegram: true,
    user: tg.initDataUnsafe?.user ?? null,
    get colorScheme() { return tg.colorScheme; },

    ready: () => tg.ready(),
    expand: () => tg.expand(),

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
      impact: (style = 'light') => tg.HapticFeedback?.impactOccurred(style),
      notification: (type) => tg.HapticFeedback?.notificationOccurred(type),
      selection: () => tg.HapticFeedback?.selectionChanged(),
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
  const applyScheme = () => { root.dataset.theme = scheme; };
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
    user: FAKE_USER,
    get colorScheme() { return scheme; },

    ready: () => log('ready()'),
    expand: () => log('expand()'),

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
  };
}
