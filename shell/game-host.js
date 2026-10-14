// Хост игры: загружает модуль, проверяет контракт, даёт игре api, ведёт жизненный цикл.
//
// Жизненный цикл:
//   открытие      → init(container, api), api.savedState — сохранённая партия или null
//   уход / сворачивание → getState(); не null — партия сохраняется, null — сохранение стирается
//   api.finish()  → сохранение стирается, результат пишется в статистику, показывается экран результата
//   закрытие      → destroy(), оболочка снимает обработчики MainButton и прячет её
//   устарела      → markStale(): с сервера пришёл прогресс новее (другое устройство, бета 'sync-refresh') —
//                   всё, что эта сессия игры сохранит дальше, отбрасывается; reload() — запустить игру заново
//                   уже со свежим сохранением. Иначе старое состояние из памяти игры (её destroy() и getState()
//                   тоже сохраняют) снова уехало бы на сервер и откатило прогресс.
// Необязательное у игры (контракт, раздел 5):
//   «Назад»       → back() спрашивает onBack(): вернула true — игра разобралась сама (открыла паузу), из неё не выходим
//   свернули      → onHide() (вкладку скрыли, страницу закрывают, Telegram свернул мини-приложение) и сразу сохранение
//   api.exit()    → выйти в меню своей кнопкой — тем же путём, что «В меню» на карточке итога
// Альбомная игра (landscape: true в реестре): экран маршрута кладётся набок (shell/landscape.js, игре — api.screen),
// а Telegram, пока она открыта, переспрашивает перед закрытием.
// Свой экран загрузки (loader в реестре): вместо «Загрузка…» и поверх игры, пока идёт init; уводит его сама игра.

import { el, loadCss } from '../shared/dom.js';
import { formatDuration } from '../shared/format.js';
import { createStorage } from '../platform/storage.js';
import { recordResult } from './stats.js';
import { LOCALES, shellText } from './i18n.js';
import { saves } from './saves.js';
import { progress } from './progress.js';
import { createLandscape } from './landscape.js';

const OUTCOMES = ['win', 'lose', 'draw', 'quit'];
const HIDE_ONCE_MS = 500;      // «свернули» приходит пачкой (deactivated, visibilitychange, pagehide) — onHide() зовём раз
const TAP_ECHO_MS = 400;       // click, который браузер шлёт вслед за касанием, уже обработанным по pointerup
const RESULT_GRACE_MS = 400;   // карточка итога альбомной игры возникает под пальцами — первые мгновения нажатий не ждёт
const COVER_WAIT_MS = 700;     // заставка игры не пришла за это время — пока она грузится, прежний текст «Загрузка…»

const EYE_PATH = 'M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z';
const EYE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${EYE_PATH}"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${EYE_PATH}"/>`
  + '<path d="M3 4.5 4.5 3l16.5 16.5-1.5 1.5Z"/></svg>';

/** Хранилище игры, которое молчит, пока allowed() ложно (сессия устарела): запись просто не происходит. */
export function gatedStorage(storage, allowed) {
  return {
    get: (key) => storage.get(key),
    set: (key, value) => (allowed() ? storage.set(key, value) : Promise.resolve()),
    reset: (key, value) => (allowed() ? storage.reset(key, value) : Promise.resolve()),
    remove: (key) => (allowed() ? storage.remove(key) : Promise.resolve()),
  };
}

export function openGame(container, entry, {
  platform, onExit, beta = false, feature = () => true, perk = () => false, fresh = () => false, online = () => null,
}) {
  const gameStorage = createStorage(`game:${entry.id}`);
  let game = null;
  let scoped = null;
  let cssLink = null;
  let run = 0;          // номер запуска (поколение сессии): finish() от прошлого запуска игнорируется
  let staleBefore = 0;  // запуски с номером не больше этого устарели — их сохранения отбрасываются
  const live = (r) => r > staleBefore;
  // Бета sync-refresh: партия не изменилась — при сворачивании не пересохраняем (менялось бы только время игры).
  // Иначе устройство, которое просто свернули, сдвигало бы прогресс на сервере, а второе устройство, где в это
  // время играют, получало бы 409 и теряло свой несохранённый ход.
  const quiet = () => Boolean(fresh());
  let savedJson = null;
  let finished = false;
  let closed = false;
  let startedAt = 0;
  let elapsedBefore = 0;
  let hiddenAt = -Infinity;
  let resultAt = -Infinity;

  // Альбомная игра: экран маршрута лежит на боку с первого кадра — вместе с «Загрузка…», экраном ошибки и карточкой
  // итога. Пока она открыта, Telegram переспрашивает перед закрытием: случайно выйти из неё нельзя (просьба владельца).
  const land = entry.landscape ? createLandscape(container, { platform, app: container.parentElement }) : null;
  if (land) platform.confirmClose?.(true);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && !hideGame()) saveProgress();
  };
  // страницу закрывают или Telegram свернул мини-приложение: это слышат только игры с onHide() — остальным как было
  const onGone = () => {
    hideGame();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onGone);
  const offDeactivated = platform.onDeactivated?.(onGone);

  start().catch(showError);

  return {
    close,
    gameId: entry.id,
    /**
     * Нажали «Назад». Игра может разобраться сама (onBack() вернула true — открыла паузу): тогда из неё не выходим.
     * Пока игра грузится, после конца партии и у игр без onBack() — false: оболочка выходит, как раньше.
     */
    back() {
      if (closed || finished || typeof game?.onBack !== 'function') return false;
      try {
        return game.onBack() === true;
      } catch (err) {
        console.error(`Игра "${entry.id}": onBack() упал`, err);
        return false;
      }
    },
    /** Прогресс на сервере новее: всё, что эта сессия сохранит дальше, отбрасывается. */
    markStale() {
      staleBefore = run;
    },
    /** Запустить игру заново со свежим сохранением (после markStale и замены прогресса). */
    reload() {
      if (closed) return Promise.resolve();
      teardown();
      return start().catch(showError);
    },
  };

  async function start() {
    const thisRun = ++run;
    const cover = entry.loader ? await showCover(thisRun) : null;
    if (closed || thisRun !== run) return;
    if (!cover) container.replaceChildren(loadingText());

    const [module, save] = await Promise.all([entry.load(), saves.get(entry.id)]);
    if (closed || thisRun !== run) return;
    const candidate = module.default;
    assertContract(candidate, entry);

    if (entry.css && !cssLink) cssLink = await loadCss(entry.css);
    if (closed || thisRun !== run) return;

    game = candidate;
    finished = false;
    elapsedBefore = save?.elapsedMs ?? 0;
    savedJson = save ? JSON.stringify(save.state) : null;
    startedAt = performance.now();
    scoped = createScopedPlatform(platform);

    const gameRoot = el('div', { class: 'scroll game-root', 'data-game': entry.id });
    container.replaceChildren(gameRoot, ...(cover ? [cover] : []));

    await game.init(gameRoot, {
      platform: scoped.api,
      storage: gatedStorage(gameStorage, () => live(thisRun)),
      savedState: save?.state ?? null,
      // true, если игрок видит бету (владелец); новое в игре лучше спрашивать по id — api.feature('<id>'):
      // так релиз (очистка shell/beta.js) включает его всем без правки игры
      beta: Boolean(beta),
      feature: (id) => Boolean(feature(id)),
      // особый скин, выданный владельцем этому игроку (shell/perks.js)
      perk: (id) => Boolean(perk(id)),
      // партии с другом по сети (shell/online.js); null — недоступны: игрок не вошёл (вне Telegram) или функция в бете
      get online() {
        return online() ?? null;
      },
      finish: (result) => {
        if (thisRun === run && live(thisRun)) onFinish(result).catch(showError);
      },
      // Короткая строка для меню («Уровень 14») — у игр с уровнями партии и победы ничего не говорят.
      progress: (text) => {
        if (thisRun === run && live(thisRun)) progress.set(entry.id, text);
      },
      // Своя кнопка «В меню» (окно паузы): тем же путём, что «В меню» на карточке итога; партию сохранит close().
      exit: () => {
        if (thisRun !== run || closed) return;
        muteNextClick();
        onExit();
      },
      // Альбомный экран (shell/landscape.js): поворот, размер, касания и отступы в осях игры; у обычных игр — null.
      screen: land ? land.api : null,
    });
    // заставку уводит игра (плавно, в конце init); забыла — не оставлять же её поверх
    cover?.remove();
  }

  /**
   * Заставка игры вместо «Загрузка…»: её модуль и стили игры грузятся вместе, экран пока пуст (дольше COVER_WAIT_MS —
   * прежний текст). Возвращает элемент заставки, уже лежащий в экране, или null — тогда как было.
   */
  async function showCover(thisRun) {
    const slow = setTimeout(() => {
      if (!closed && thisRun === run) container.replaceChildren(loadingText());
    }, COVER_WAIT_MS);
    try {
      const [module] = await Promise.all([
        entry.loader(),
        entry.css && !cssLink && loadCss(entry.css).then((link) => {
          if (closed) link.remove();
          else cssLink ??= link;
        }),
      ]);
      if (closed || thisRun !== run) return null;
      const cover = module.default.show();
      container.replaceChildren(cover);
      return cover;
    } catch (err) {
      console.error(`Игра "${entry.id}": заставка не открылась`, err);
      return null;
    } finally {
      clearTimeout(slow);
    }
  }

  async function onFinish(result) {
    if (finished || closed || !game || !live(run)) return;
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
      ...press(async () => {
        const status = await platform.share(result.share);
        const label = { copied: t.copied, failed: t.shareFailed }[status];
        if (!label) return;
        shareButton.textContent = label;
        setTimeout(() => { shareButton.textContent = t.share; }, 2000);
      }),
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
        el('button', { class: 'btn', ...press(restart) }, t.again),
        shareButton,
        el('button', { class: 'btn btn-secondary', ...press(onExit) }, t.menu),
      ),
      showHint,
    );
    resultAt = performance.now();
    container.append(overlay);
  }

  /**
   * Обработчики кнопки карточки итога. У обычных игр — click, как было. В альбомной игре:
   *   — нажатие вторым пальцем, пока первый ещё лежит на экране (держал джойстик), события click не даёт вовсе —
   *     такое нажатие ловится по отпусканию пальца;
   *   — первые мгновения карточка нажатий не принимает: она возникает под пальцами, которые только что играли,
   *     и click от последнего нажатия в игре пришёлся бы по её кнопке.
   */
  function press(action) {
    if (!land) return { onclick: action };
    let armed = false;
    let firedAt = -Infinity;
    const early = () => performance.now() - resultAt < RESULT_GRACE_MS;
    return {
      // «не главный» палец лёг на экран, когда другой уже лежал: click от него не придёт
      onpointerdown: (e) => { armed = !e.isPrimary && !early(); },
      onpointercancel: () => { armed = false; },
      onpointerup: (e) => {
        if (!armed) return;
        armed = false;
        // у касания pointerup приходит туда же, где оно началось: палец увели с кнопки — это не нажатие
        if (!e.currentTarget.contains(document.elementFromPoint(e.clientX, e.clientY))) return;
        firedAt = performance.now();
        action(e);
      },
      onclick: (e) => {
        if (early() || performance.now() - firedAt < TAP_ECHO_MS) return;
        action(e);
      },
    };
  }

  function restart() {
    teardown();
    start().catch(showError);
  }

  /**
   * Приложение свернули или скрыли: игра с onHide() встаёт на паузу, и партия сразу сохраняется. Возвращает false,
   * если onHide() у игры нет, — тогда всё как раньше (сохранение только по visibilitychange).
   */
  function hideGame() {
    if (typeof game?.onHide !== 'function') return false;
    const now = performance.now();
    if (now - hiddenAt < HIDE_ONCE_MS) return true;
    hiddenAt = now;
    try {
      game.onHide();
    } catch (err) {
      console.error(`Игра "${entry.id}": onHide() упал`, err);
    }
    saveProgress();
    return true;
  }

  function saveProgress() {
    if (!game || finished || !live(run)) return;   // устаревшая сессия: getState() тоже сохраняет — не зовём
    let state = null;
    try {
      state = game.getState();
    } catch (err) {
      console.error(`Игра "${entry.id}": getState() упал`, err);
    }
    if (state == null) {
      if (!quiet() || savedJson !== null) saves.remove(entry.id);
      savedJson = null;
      return;
    }
    const json = JSON.stringify(state);
    if (quiet() && json === savedJson) return;
    savedJson = json;
    saves.set(entry.id, { state, elapsedMs: elapsed() });
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
    land?.forget();       // обработчики api.screen.onChange закрытой игры — тоже снимаются сами
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
    window.removeEventListener('pagehide', onGone);
    offDeactivated?.();
    if (land) {
      land.dispose();
      platform.confirmClose?.(false);
    }
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

const loadingText = () => el('div', { class: 'scroll' }, el('p', { class: 'hint' }, 'Загрузка…'));

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

/**
 * api.exit() игра зовёт из своей кнопки «В меню», а нажатие такой кнопки ловит по отпусканию пальца (в альбомной игре —
 * всегда). Браузер следом шлёт в ту же точку click — к этому мигу там может быть уже меню, и он открыл бы плитку под
 * пальцем. Один такой click гасится.
 */
function muteNextClick() {
  const until = performance.now() + TAP_ECHO_MS;
  const stop = (e) => {
    document.removeEventListener('click', stop, true);
    if (performance.now() > until) return;
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener('click', stop, true);
  setTimeout(() => document.removeEventListener('click', stop, true), TAP_ECHO_MS);
}

// Платформа для игры: без backButton (им владеет оболочка), а MainButton
// после закрытия игры гарантированно спрятана и без обработчиков — даже если игра забыла убрать.
function createScopedPlatform(platform) {
  const handlers = new Set();
  const { mainButton } = platform;
  const full = platform.fullscreen;
  const fullListeners = new Set();
  let live = true;
  let fullHooked = false;

  return {
    api: {
      isTelegram: platform.isTelegram,
      user: platform.user,
      // параметр ссылки t.me/<бот>?startapp=… — для отладочных крючков игры (в Telegram своего ?…debug не задать)
      startParam: platform.startParam ?? null,
      get colorScheme() { return platform.colorScheme; },
      haptic: platform.haptic,
      // Полный экран самого Telegram (Bot API 8.0): окно мини-приложения на компьютере разворачивает только он
      fullscreen: {
        get supported() { return Boolean(platform.isTelegram && full?.supported); },
        get isActive() { return Boolean(full?.isActive); },
        request: () => full?.request(),
        exit: () => full?.exit(),
        onChange(cb) {
          fullListeners.add(cb);
          if (fullHooked || !full) return;
          fullHooked = true;
          full.onChange(() => { if (live) fullListeners.forEach((fn) => fn()); });
        },
        offChange: (cb) => fullListeners.delete(cb),
      },
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
      live = false;
      fullListeners.clear();
      handlers.forEach((cb) => mainButton.offClick(cb));
      handlers.clear();
      mainButton.hide();
    },
  };
}
