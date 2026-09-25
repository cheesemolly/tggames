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

import { snapshot, restore, onStorageChange } from '../platform/storage.js';

export const SYNC_DELAY = 4000;
const BASE_KEY = 'tggames-sync';   // вне пространства `tggames:` — иначе синхронизировался бы сам
const DIRTY_KEY = 'tggames-sync-dirty';   // есть изменения, которых сервер ещё не видел
// Запрос с keepalive браузер доводит до конца и после закрытия страницы, но тело — не больше 64 КБ.
export const KEEPALIVE_LIMIT = 60000;

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
 */
export function createSync({ account, onMessage = () => {}, delay = SYNC_DELAY, afterRestore = () => {} }) {
  let timer = null;
  let applying = false;      // мы сами пишем в хранилище — это не повод слать его обратно
  let pushing = null;        // текущая отправка, чтобы не слать две сразу
  let dirty = false;
  let changes = 0;           // счётчик изменений: отметку DIRTY_KEY снимаем, только если за отправку ничего не менялось

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** final — отправка при уходе со страницы: с keepalive, чтобы запрос пережил закрытие. */
  async function push({ final = false } = {}) {
    if (!account.current) return;
    if (pushing) {                       // уже отправляем — отметим, что нужен ещё заход
      dirty = true;
      return pushing;
    }
    stop();
    dirty = false;
    const sent = changes;
    const data = JSON.stringify(snapshot());
    pushing = account.saveState(data, readBase(), { keepalive: final && data.length < KEEPALIVE_LIMIT })
      .then(async (res) => {
        if (res.ok) {
          writeBase(res.data.updatedAt);
          if (changes === sent) writeDirty(false);
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
    stop();
    timer = setTimeout(() => push(), delay);
  }

  /** Забрать прогресс с сервера (после входа или при открытии страницы). */
  async function pull({ afterLogin = false } = {}) {
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
    /** Новый аккаунт: считаем, что сервер пуст, и заливаем то, что есть. */
    afterRegister(updatedAt) {
      writeBase(updatedAt ?? 0);
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
