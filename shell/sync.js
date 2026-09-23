// Синхронизация прогресса с сервером аккаунтов.
//
// Правила простые:
// — играем всегда в локальное хранилище, оно быстрое и работает без сети;
// — после изменений прогресс уезжает на сервер не сразу, а через паузу (SYNC_DELAY) и при уходе
//   со страницы — так один ход не превращается в один запрос;
// — при входе прогресс берётся с сервера; если на сервере пусто, а локально что-то есть
//   (играл гостем) — наоборот, локальное уезжает в аккаунт;
// — если с другого устройства сохранили новее, сервер отвечает «конфликт» и присылает свой прогресс:
//   он и побеждает, о чём игроку показывается сообщение.

import { snapshot, restore, onStorageChange } from '../platform/storage.js';

export const SYNC_DELAY = 4000;
const BASE_KEY = 'tggames-sync';   // вне пространства `tggames:` — иначе синхронизировался бы сам

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

export function createSync({ account, onMessage = () => {}, delay = SYNC_DELAY }) {
  let timer = null;
  let applying = false;      // мы сами пишем в хранилище — это не повод слать его обратно
  let pushing = null;        // текущая отправка, чтобы не слать две сразу
  let dirty = false;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function push() {
    if (!account.current) return;
    if (pushing) {                       // уже отправляем — отметим, что нужен ещё заход
      dirty = true;
      return pushing;
    }
    stop();
    dirty = false;
    const data = JSON.stringify(snapshot());
    pushing = account.saveState(data, readBase())
      .then(async (res) => {
        if (res.ok) {
          writeBase(res.data.updatedAt);
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
          onMessage('Прогресс обновлён с другого устройства');
          return;
        }
        if (res.error === 'network') return;      // сеть моргнула, попробуем со следующим изменением
        if (res.error === 'unauthorized') {
          onMessage('Сессия истекла, войди заново');
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

    if (afterLogin && pickOnLogin(serverData, snapshot()) === 'local') {
      writeBase(res.data.updatedAt);
      await push();
      return;
    }

    applying = true;
    try {
      restore(serverData);
    } finally {
      applying = false;
    }
    writeBase(res.data.updatedAt);
  }

  const unsubscribe = onStorageChange(() => {
    if (applying) return;
    schedule();
  });

  // Уход со страницы: последний шанс сохранить. Браузер уже не ждёт ответа, но запрос уходит.
  const onHide = () => {
    if (document.visibilityState === 'hidden') push();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => push());

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
    },
    destroy() {
      stop();
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
