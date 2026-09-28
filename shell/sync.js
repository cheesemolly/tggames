// Синхронизация прогресса с сервером аккаунтов.
//
// Правила простые:
// — играем всегда в локальное хранилище, оно быстрое и работает без сети;
// — после изменений прогресс уезжает на сервер не сразу, а через паузу (SYNC_DELAY) и при уходе
//   со страницы — так один ход не превращается в один запрос;
// — при первом входе прогресс берётся с сервера; если на сервере пусто, а локально что-то есть
//   (играл в браузере до Telegram) — наоборот, локальное уезжает в аккаунт;
// — если с другого устройства сохранили новее, сервер отвечает «конфликт» и присылает свой прогресс:
//   он и побеждает, о чём игроку показывается сообщение;
// — несохранённые на сервере изменения помечаются в localStorage (DIRTY_KEY). Telegram закрывает
//   мини-приложение сразу, и последняя отправка часто не доходит; раньше при следующем запуске серверная
//   (старая) копия затирала локальную — пропадали законченные партии (замечание владельца, 2026-09-25:
//   «проиграл в шашки раз 5, а пишет — ещё не играли»). Теперь, если сервер с прошлого обмена не менялся,
//   при запуске на сервер уезжает локальное.
// — бета 'sync-refresh' (тестер: «на ПК 60-й уровень „Петли“, на телефоне 35-й»): при возврате в приложение
//   прогресс перечитывается (refresh). Если сервер новее — и так же при 409 — свежий прогресс принимается через
//   оболочку (onFresh): открытая игра помечается устаревшей (её сохранения отбрасываются), прогресс ложится в
//   хранилище, игра перезапускается уже с ним, и только ПОСЛЕ этого сдвигается отметка обмена (base). Пока это идёт,
//   на сервер ничего не отправляется (hold). Раньше после 409 base сдвигался сразу, а игра из памяти следующим
//   сохранением отправляла старый уровень уже с новым base — и сервер откатывался. Неотправленные изменения этого
//   устройства в таком случае пока проигрывают серверу (слияние — следующий шаг) — это пишется в консоль.

import { snapshot, restore, onStorageChange } from '../platform/storage.js';

export const SYNC_DELAY = 4000;
const BASE_KEY = 'tggames-sync';   // вне пространства `tggames:` — иначе синхронизировался бы сам
const DIRTY_KEY = 'tggames-sync-dirty';   // есть изменения, которых сервер ещё не видел
// Запрос с keepalive браузер доводит до конца и после закрытия страницы, но тело — не больше 64 КБ.
export const KEEPALIVE_LIMIT = 60000;
// возврат в приложение шлёт и visibilitychange, и Telegram 'activated' — перечитываем один раз
export const REFRESH_GAP = 1500;

export const isEmpty = (data) => !data || Object.keys(data).length === 0;

/**
 * Что делать при входе в аккаунт: взять серверное или залить локальное.
 * Локальное уезжает только когда на сервере пусто — иначе чужой гостевой прогресс
 * затёр бы то, что игрок наиграл на другом устройстве.
 */
export function pickOnLogin(serverData, localData) {
  if (isEmpty(serverData) && !isEmpty(localData)) return 'local';
  return 'server';
}

/**
 * Что делать при открытии: взять серверное или отправить локальное.
 * Локальное побеждает, только если в нём есть неотправленные изменения, а сервер с нашего
 * последнего обмена (base) не менялся — значит, это мы просто не успели сохранить перед закрытием.
 * Если сервер тоже изменился (играли на другом устройстве) — как раньше, побеждает сервер.
 */
export function pickOnOpen({ serverData, serverUpdatedAt = 0, localData, base = 0, localDirty = false, afterLogin = false }) {
  if (afterLogin && pickOnLogin(serverData, localData) === 'local') return 'local';
  if (localDirty && !isEmpty(localData) && base > 0 && serverUpdatedAt <= base) return 'local';
  return 'server';
}

function readDirty() {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDirty(value) {
  try {
    if (value) localStorage.setItem(DIRTY_KEY, '1');
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    // приватный режим — без отметки, как было раньше
  }
}

function readBase() {
  try {
    return Number(localStorage.getItem(BASE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBase(value) {
  try {
    localStorage.setItem(BASE_KEY, String(value ?? 0));
  } catch {
    // приватный режим — в худшем случае лишний раз словим конфликт
  }
}

/**
 * afterRestore — вызывается каждый раз, когда серверный прогресс заменил локальный.
 * Оболочка чистит там устаревшие рекорды (migrateStats): иначе сервер возвращал бы
 * старые значения уже после чистки, и в меню снова появлялось бы «Рекорд: Уровень 640».
 *
 * fresh() — включено ли перечитывание при возврате и приём свежего прогресса через onFresh (бета 'sync-refresh').
 * onFresh(apply) — оболочка: пометить открытую игру устаревшей, вызвать apply() (замена прогресса), перезапустить
 * игру; когда промис выполнен, свежее состояние уже в игре. log — куда писать о перекрытых локальных изменениях.
 */
export function createSync({
  account, onMessage = () => {}, delay = SYNC_DELAY, afterRestore = () => {},
  fresh = () => false, onFresh = (apply) => apply(), log = console,
}) {
  let timer = null;
  let applying = false;      // мы сами пишем в хранилище — это не повод слать его обратно
  let pushing = null;        // текущая отправка, чтобы не слать две сразу
  let pulling = null;        // загрузка при входе
  let dirty = false;
  let changes = 0;           // счётчик изменений: отметку DIRTY_KEY снимаем, только если за отправку ничего не менялось
  let hold = false;          // принимаем свежий прогресс — ничего не отправляем, пока игра не перезапустится
  let holdPending = false;   // за это время что-то изменилось — отправить после
  let adopting = null;       // идёт приём свежего прогресса
  let queued = null;         // пока принимали, пришёл ещё новее
  let lastRefresh = 0;
  // Прогресс, который точно совпадает с серверным (бета): такой же не отправляем. Иначе каждое сворачивание
  // слало бы всё заново и сдвигало время на сервере — у второго устройства чаще случался бы 409.
  let lastSynced = null;
  const remember = (text) => {
    if (fresh()) lastSynced = text;
  };

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** final — отправка при уходе со страницы: с keepalive, чтобы запрос пережил закрытие. */
  async function push({ final = false } = {}) {
    if (!account.current) return;
    if (hold) {                          // свежий прогресс ещё не в игре — со старым base не отправляем
      holdPending = true;
      return;
    }
    if (pushing) {                       // уже отправляем — отметим, что нужен ещё заход
      dirty = true;
      return pushing;
    }
    stop();
    dirty = false;
    const sent = changes;
    const data = JSON.stringify(snapshot());
    if (fresh() && data === lastSynced) {           // с прошлого обмена ничего не изменилось
      writeDirty(false);
      return;
    }
    pushing = account.saveState(data, readBase(), { keepalive: final && data.length < KEEPALIVE_LIMIT })
      .then(async (res) => {
        if (res.ok) {
          writeBase(res.data.updatedAt);
          remember(data);
          if (changes === sent) writeDirty(false);
          return;
        }
        if (res.status === 409 && res.data?.data && fresh()) {
          // На другом устройстве прогресс новее — берём его, перезапустив открытую игру (бета 'sync-refresh').
          await adoptServer(res.data.data, res.data.updatedAt, 'conflict');
          return;
        }
        if (res.status === 409 && res.data?.data) {
          // На другом устройстве прогресс новее — берём его.
          applying = true;
          try {
            restore(JSON.parse(res.data.data));
          } finally {
            applying = false;
          }
          writeBase(res.data.updatedAt);
          writeDirty(false);
          await afterRestore();
          onMessage('Прогресс обновлён с другого устройства');
          return;
        }
        if (res.error === 'network') return;      // сеть моргнула, попробуем со следующим изменением
        if (res.error === 'too_many') {           // сервер пускает сохранения раз в пару секунд — повторим сами
          dirty = true;
          return;
        }
        if (res.error === 'expired' || res.error === 'bad_signature') {
          onMessage('Сессия устарела — перезапусти игру');
          return;
        }
        onMessage(res.error === 'state_big' ? 'Прогресс слишком большой для сохранения' : 'Не удалось сохранить прогресс');
      })
      .finally(() => {
        pushing = null;
        if (dirty) schedule();
      });
    return pushing;
  }

  function schedule() {
    if (!account.current) return;
    if (hold) {
      holdPending = true;
      return;
    }
    stop();
    timer = setTimeout(() => push(), delay);
  }

  /**
   * Принять прогресс с сервера, который новее нашего (409 или перечитывание при возврате). Отметка обмена
   * сдвигается, только когда onFresh вернул управление — свежее уже загружено в игру.
   */
  function adoptServer(text, updatedAt, reason) {
    if (adopting) {                      // уже принимаем — самое свежее примем следом
      if (!queued || updatedAt > queued.updatedAt) queued = { text, updatedAt, reason };
      return adopting;
    }
    adopting = (async () => {
      let data = {};
      try {
        data = JSON.parse(text ?? '{}');
      } catch {
        data = {};
      }
      if (readDirty() || reason === 'conflict') {
        log.warn?.(`синхронизация: на сервере прогресс новее (${reason}) — несохранённые изменения этого устройства`
          + ' перекрыты серверными', { base: readBase(), server: updatedAt });
      }
      hold = true;
      stop();
      let applied = false;
      let changesAfter = changes;
      try {
        await onFresh(async () => {
          applying = true;
          try {
            restore(data);
          } finally {
            applying = false;
          }
          applied = true;
          changesAfter = changes;
          await afterRestore();
          remember(JSON.stringify(snapshot()));
        });
      } catch (err) {
        log.error?.('синхронизация: не удалось перезапустить игру со свежим прогрессом', err);
      } finally {
        if (applied) {
          writeBase(updatedAt);
          // перезапущенная игра уже что-то сохранила (свежее) — это уедет с новым base
          if (changes === changesAfter) writeDirty(false);
          else holdPending = true;
        }
        hold = false;
        adopting = null;
      }
      const next = queued;
      queued = null;
      if (next && next.updatedAt > readBase()) await adoptServer(next.text, next.updatedAt, next.reason);
      if (holdPending) {
        holdPending = false;
        schedule();
      }
    })();
    return adopting;
  }

  /**
   * Вернулись в приложение (бета 'sync-refresh'): перечитать прогресс. Сервер новее нашего обмена — значит, играли
   * на другом устройстве: принимаем. Не новее — ничего не делаем (неотправленное своё уедет как обычно).
   */
  async function refresh() {
    if (!account.current || !fresh() || adopting || pulling) return;
    const now = Date.now();
    if (now - lastRefresh < REFRESH_GAP) return;
    lastRefresh = now;
    // своё сохранение может быть в пути: дождёмся, иначе его ответ приняли бы за чужой прогресс
    if (pushing) await pushing;
    const res = await account.fetchState();
    if (!res.ok || pushing || adopting || pulling) return;
    const updatedAt = res.data.updatedAt ?? 0;
    if (updatedAt <= readBase()) return;
    await adoptServer(res.data.data ?? '{}', updatedAt, 'return');
  }

  /** Забрать прогресс с сервера (после входа или при открытии страницы). */
  function pull(opts) {
    pulling = pullOnce(opts).finally(() => {
      pulling = null;
    });
    return pulling;
  }

  async function pullOnce({ afterLogin = false } = {}) {
    if (!account.current) return;
    const res = await account.fetchState();
    if (!res.ok) {
      if (res.error === 'network') onMessage('Сервер не отвечает, играем на этом устройстве');
      return;
    }
    let serverData = {};
    try {
      serverData = JSON.parse(res.data.data ?? '{}');
    } catch {
      serverData = {};
    }

    const serverUpdatedAt = res.data.updatedAt ?? 0;
    const choice = pickOnOpen({
      serverData, serverUpdatedAt, localData: snapshot(), base: readBase(), localDirty: readDirty(), afterLogin,
    });
    if (choice === 'local') {
      writeBase(serverUpdatedAt);
      await push();
      return;
    }

    applying = true;
    try {
      restore(serverData);
    } finally {
      applying = false;
    }
    writeBase(serverUpdatedAt);
    writeDirty(false);
    await afterRestore();
    remember(JSON.stringify(snapshot()));
  }

  const unsubscribe = onStorageChange(() => {
    if (applying) return;
    changes++;
    writeDirty(true);
    schedule();
  });

  // Уход со страницы: последний шанс сохранить. Браузер уже не ждёт ответа, но запрос уходит.
  const onHide = () => {
    if (document.visibilityState === 'hidden') push({ final: true });
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => push({ final: true }));

  return {
    pull,
    push,
    refresh,
    /** Новый аккаунт: считаем, что сервер пуст, и заливаем то, что есть. */
    afterRegister(updatedAt) {
      writeBase(updatedAt ?? 0);
    },
    /**
     * Прогресс этого же игрока только что записан на сервер в обход устройства (владелец правит себя в панели):
     * кладём его и сюда. Иначе устройство держало бы старую копию — игра открылась бы со старыми значениями,
     * а следующее её сохранение затёрло бы правку на сервере (видео владельца, 2026-09-27: подсказки 0 → 999
     * в панели, в «Словах» всё равно 0).
     */
    async adopt(text, updatedAt) {
      stop();
      applying = true;
      try {
        restore(JSON.parse(text));
      } finally {
        applying = false;
      }
      writeBase(updatedAt);
      writeDirty(false);
      await afterRestore();
      remember(JSON.stringify(snapshot()));
    },
    /** Выход: локальный прогресс остаётся как гостевой, отметка синхронизации сбрасывается. */
    reset() {
      stop();
      writeBase(0);
      writeDirty(false);
    },
    destroy() {
      stop();
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
