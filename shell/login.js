// Вход на сервер при запуске — так, чтобы имя и рейтинг не пропадали «раз через раз» (владелец, 2026-09-28: «иногда
// нет надписи Аккаунт Telegram и, следовательно, рейтинга»).
//
// Было: меню перерисовывалось с именем только после двух запросов — входа (/me, маленький ответ) и загрузки всего
// прогресса (/state, десятки килобайт). Завис второй — имени и рейтинга нет, пока приложение не перезапустят;
// не ответил первый — приложение молча сдавалось.
// Стало: имя и рейтинг — сразу после входа; сервер не ответил (нет сети, запрос завис, ошибка сервера) — повтор через
// 3, 8, 20 и 60 с и при возвращении в приложение, в меню строка «Нет связи с сервером» с кнопкой «Повторить».
// Вход, случившийся посреди партии, ничего в ней не трогает: прогресс подтягивается, когда игрок выйдет из игры.

export const RETRY_DELAYS = [3000, 8000, 20000, 60000];

/** Ошибки, после которых есть смысл попробовать ещё раз (подпись, бан, устаревший вход повтор не исправит). */
export const retryable = (res) => res.error === 'network' || res.error === 'server' || (res.status ?? 0) >= 500;

/**
 * account — platform/account.js (signIn, offline), sync — shell/sync.js (pull),
 * inGame() — открыта ли сейчас игра, redraw() — перерисовать экран, onError(res) — ошибка, которую повтор не исправит,
 * onReady() — вошли и прогресс подтянут (здесь оболочка открывает ссылку-приглашение в партию с другом).
 */
export function createLogin({
  account, sync, inGame, redraw, onError = () => {}, onReady = () => {},
  delays = RETRY_DELAYS, schedule = setTimeout, cancel = clearTimeout, doc = globalThis.document,
}) {
  let timer = null;
  let attempt = 0;
  let running = null;
  let done = false;
  let deferred = false;       // вошли посреди партии — прогресс подтянем после выхода из игры

  const onVisible = () => {
    if (doc.visibilityState === 'visible' && !done) run();
  };
  doc?.addEventListener('visibilitychange', onVisible);

  async function afterLogin() {
    redraw();                 // имя и рейтинг — сразу, не дожидаясь прогресса
    await sync.pull();
    redraw();                 // прогресс мог смениться серверным
    onReady();
  }

  async function attemptOnce() {
    cancel(timer);
    timer = null;
    const res = await account.signIn();
    if (res.ok) {
      done = true;
      account.offline = false;
      doc?.removeEventListener('visibilitychange', onVisible);
      if (inGame()) deferred = true;
      else await afterLogin();
      return res;
    }
    if (!retryable(res)) {
      account.offline = false;
      onError(res);
      return res;
    }
    const first = !account.offline;
    account.offline = true;
    if (first && !inGame()) redraw();      // строка «Нет связи с сервером» в меню
    if (attempt < delays.length) timer = schedule(run, delays[attempt++]);
    return res;
  }

  function run() {
    if (done) return Promise.resolve({ ok: true });
    running ??= attemptOnce().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    /** Первая попытка при запуске (промис — когда она и загрузка прогресса закончились). */
    start: run,
    /** Кнопка «Повторить»: сразу и с начала расписания повторов. */
    retry() {
      attempt = 0;
      return run();
    },
    /** Игрок вышел из игры — если вошли посреди партии, теперь подтянуть прогресс. */
    leftGame() {
      if (!deferred) return null;
      deferred = false;
      return afterLogin();
    },
    stop() {
      cancel(timer);
      doc?.removeEventListener('visibilitychange', onVisible);
    },
  };
}
