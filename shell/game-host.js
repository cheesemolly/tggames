// Хост игры: загружает модуль, проверяет контракт, даёт игре api, ведёт жизненный цикл.
//
// Жизненный цикл:
//   открытие      → init(container, api), api.savedState — сохранённая партия или null
//   уход / сворачивание → getState(); не null — партия сохраняется, null — сохранение стирается
//   api.finish()  → сохранение стирается, результат пишется в статистику, показывается экран результата
//   закрытие      → destroy(), оболочка снимает обработчики MainButton и прячет её

import { el, loadCss } from '../shared/dom.js';
import { formatDuration } from '../shared/format.js';
import { createStorage } from '../platform/storage.js';
import { recordResult } from './stats.js';
import { LOCALES, shellText } from './i18n.js';
import { saves } from './saves.js';
import { progress } from './progress.js';

const OUTCOMES = ['win', 'lose', 'draw', 'quit'];

const EYE_PATH = 'M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z';
const EYE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${EYE_PATH}"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${EYE_PATH}"/>`
  + '<path d="M3 4.5 4.5 3l16.5 16.5-1.5 1.5Z"/></svg>';

export function openGame(container, entry, { platform, onExit }) {
  const gameStorage = createStorage(`game:${entry.id}`);
  let game = null;
  let scoped = null;
  let cssLink = null;
  let run = 0;          // номер запуска: finish() от прошлого запуска игнорируется
  let finished = false;
  let closed = false;
  let startedAt = 0;
  let elapsedBefore = 0;

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') saveProgress();
  };
  document.addEventListener('visibilitychange', onVisibility);

  start().catch(showError);

  return { close };

  async function start() {
    const thisRun = ++run;
    container.replaceChildren(el('div', { class: 'scroll' }, el('p', { class: 'hint' }, 'Загрузка…')));

    const [module, save] = await Promise.all([entry.load(), saves.get(entry.id)]);
    if (closed || thisRun !== run) return;
    const candidate = module.default;
    assertContract(candidate, entry);

    if (entry.css && !cssLink) cssLink = await loadCss(entry.css);
    if (closed || thisRun !== run) return;

    game = candidate;
    finished = false;
    elapsedBefore = save?.elapsedMs ?? 0;
    startedAt = performance.now();
    scoped = createScopedPlatform(platform);

    const gameRoot = el('div', { class: 'scroll game-root', 'data-game': entry.id });
    container.replaceChildren(gameRoot);

    await game.init(gameRoot, {
      platform: scoped.api,
      storage: gameStorage,
      savedState: save?.state ?? null,
      finish: (result) => {
        if (thisRun === run) onFinish(result).catch(showError);
      },
      // Короткая строка для меню («Уровень 14») — у игр с уровнями партии и победы ничего не говорят.
      progress: (text) => {
        if (thisRun === run) progress.set(entry.id, text);
      },
    });
  }

  async function onFinish(result) {
    if (finished || closed || !game) return;
    finished = true;
    const full = normalizeResult(result);
    await saves.remove(entry.id);
    const stats = await recordResult(full);
    if (!closed) showResult(full, stats);
  }

  function normalizeResult(result = {}) {
    if (!OUTCOMES.includes(result.outcome)) {
      console.warn(`Игра "${entry.id}": неизвестный outcome "${result.outcome}", считаю "quit"`);
    }
    return {
      gameId: entry.id,
      outcome: OUTCOMES.includes(result.outcome) ? result.outcome : 'quit',
      score: typeof result.score === 'number' ? result.score : null,
      durationMs: typeof result.durationMs === 'number' ? result.durationMs : elapsed(),
      message: typeof result.message === 'string' ? result.message : null,
      variant: typeof result.variant === 'string' && result.variant ? result.variant : null,
      locale: LOCALES.includes(result.locale) ? result.locale : 'ru',
      share: typeof result.share === 'string' && result.share ? result.share : null,
      title: typeof result.title === 'string' && result.title ? result.title : null,
    };
  }

  function showResult(result, stats) {
    const t = shellText(result.locale);

    // «Глаз»: карточка прячется, остаётся только значок «показать» — доску можно заскринить.
    // Оверлей при этом остаётся прозрачным слоем поверх игры: тап где угодно возвращает карточку.
    const hideButton = el('button', {
      class: 'result-eye',
      'aria-label': t.hide,
      title: t.hide,
      onclick: () => overlay.classList.add('result-hidden'),
    });
    hideButton.innerHTML = EYE_OFF_ICON;
    const showHint = el('div', { class: 'result-show', 'aria-label': t.show, role: 'button' });
    showHint.innerHTML = EYE_ICON;

    const shareButton = result.share && el('button', {
      class: 'btn btn-secondary',
      onclick: async () => {
        const status = await platform.share(result.share);
        const label = { copied: t.copied, failed: t.shareFailed }[status];
        if (!label) return;
        shareButton.textContent = label;
        setTimeout(() => { shareButton.textContent = t.share; }, 2000);
      },
    }, t.share);

    const overlay = el('div', {
      class: 'result',
      lang: result.locale,
      onclick: () => overlay.classList.remove('result-hidden'),
    },
      el('div', { class: 'result-card', onclick: (e) => e.stopPropagation() },
        hideButton,
        el('h2', { class: 'result-title' }, result.title ?? t.outcome[result.outcome]),
        result.message && el('p', { class: 'result-message' }, result.message),
        result.score !== null && el('p', { class: 'result-line' }, `${t.score}: ${result.score}`),
        el('p', { class: 'result-line' }, `${t.time}: ${formatDuration(result.durationMs)}`),
        stats.best !== null && el('p', { class: 'result-line' }, `${t.best}: ${stats.best}`),
        el('button', { class: 'btn', onclick: restart }, t.again),
        shareButton,
        el('button', { class: 'btn btn-secondary', onclick: onExit }, t.menu),
      ),
      showHint,
    );
    container.append(overlay);
  }

  function restart() {
    teardown();
    start().catch(showError);
  }

  function saveProgress() {
    if (!game || finished) return;
    let state = null;
    try {
      state = game.getState();
    } catch (err) {
      console.error(`Игра "${entry.id}": getState() упал`, err);
    }
    if (state == null) saves.remove(entry.id);
    else saves.set(entry.id, { state, elapsedMs: elapsed() });
  }

  function elapsed() {
    return elapsedBefore + (performance.now() - startedAt);
  }

  function teardown() {
    if (game) {
      try {
        game.destroy();
      } catch (err) {
        console.error(`Игра "${entry.id}": destroy() упал`, err);
      }
    }
    scoped?.dispose();
    game = null;
    scoped = null;
  }

  function close() {
    if (closed) return;
    saveProgress();
    closed = true;
    teardown();
    cssLink?.remove();
    document.removeEventListener('visibilitychange', onVisibility);
    container.replaceChildren();
  }

  function showError(err) {
    console.error(err);
    if (closed) return;
    teardown();
    container.replaceChildren(el('div', { class: 'scroll' },
      el('h2', {}, 'Не удалось запустить игру'),
      el('p', { class: 'error-text' }, String(err?.message ?? err)),
      el('button', { class: 'btn', onclick: onExit }, 'В меню'),
    ));
  }
}

function assertContract(game, entry) {
  if (!game || typeof game !== 'object') {
    throw new Error(`Модуль игры "${entry.id}" не экспортирует объект по умолчанию`);
  }
  const problems = [];
  if (game.id !== entry.id) problems.push(`id "${game.id}" не совпадает с реестром`);
  for (const method of ['init', 'getState', 'destroy']) {
    if (typeof game[method] !== 'function') problems.push(`нет метода ${method}()`);
  }
  if (problems.length) {
    throw new Error(`Игра "${entry.id}" нарушает контракт: ${problems.join('; ')}`);
  }
  if (game.title !== entry.title) {
    console.warn(`Игра "${entry.id}": title в модуле и в реестре различаются`);
  }
}

// Платформа для игры: без backButton (им владеет оболочка), а MainButton
// после закрытия игры гарантированно спрятана и без обработчиков — даже если игра забыла убрать.
function createScopedPlatform(platform) {
  const handlers = new Set();
  const { mainButton } = platform;

  return {
    api: {
      isTelegram: platform.isTelegram,
      user: platform.user,
      get colorScheme() { return platform.colorScheme; },
      haptic: platform.haptic,
      mainButton: {
        show: () => mainButton.show(),
        hide: () => mainButton.hide(),
        setText: (text) => mainButton.setText(text),
        onClick(cb) {
          handlers.add(cb);
          mainButton.onClick(cb);
        },
        offClick(cb) {
          handlers.delete(cb);
          mainButton.offClick(cb);
        },
      },
    },
    dispose() {
      handlers.forEach((cb) => mainButton.offClick(cb));
      handlers.clear();
      mainButton.hide();
    },
  };
}
