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
import { saves } from './saves.js';

const OUTCOMES = ['win', 'lose', 'quit'];

const OUTCOME_TITLES = {
  win: 'Победа!',
  lose: 'Поражение',
  quit: 'Игра окончена',
};

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
    };
  }

  function showResult(result, stats) {
    container.append(el('div', { class: 'result' },
      el('div', { class: 'result-card' },
        el('h2', { class: 'result-title' }, OUTCOME_TITLES[result.outcome]),
        result.score !== null && el('p', { class: 'result-line' }, `Очки: ${result.score}`),
        el('p', { class: 'result-line' }, `Время: ${formatDuration(result.durationMs)}`),
        stats.best !== null && el('p', { class: 'result-line' }, `Рекорд: ${stats.best}`),
        el('button', { class: 'btn', onclick: restart }, 'Ещё раз'),
        el('button', { class: 'btn btn-secondary', onclick: onExit }, 'В меню'),
      ),
    ));
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
