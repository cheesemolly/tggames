// Хранилище ключ-значение с пространствами имён.
// Сейчас поверх localStorage. API асинхронный уже сейчас, чтобы позже без переделок
// перейти на Telegram CloudStorage (он асинхронный).
//
// Всё, что здесь лежит, — это и есть прогресс игрока: snapshot() отдаёт его целиком,
// restore() — принимает обратно (вход в аккаунт, перенос с другого устройства).

const ROOT = 'tggames';
const PREFIX = `${ROOT}:`;

// Кому сообщать, что данные изменились (синхронизация с сервером). Токен аккаунта лежит
// вне PREFIX, поэтому в выгрузку не попадает и по сети не гуляет.
const listeners = new Set();

export function onStorageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.warn('обработчик изменения хранилища упал', err);
    }
  }
}

export function createStorage(namespace) {
  const prefix = `${PREFIX}${namespace}:`;

  return {
    async get(key) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
        changed();
      } catch (err) {
        console.warn(`storage.set(${prefix}${key}) не удался`, err);
      }
    },

    async remove(key) {
      try {
        localStorage.removeItem(prefix + key);
        changed();
      } catch {
        // хранилище недоступно — удалять нечего
      }
    },
  };
}

/** Весь прогресс игрока: ключ (без общего префикса) → значение. */
export function snapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      try {
        out[key.slice(PREFIX.length)] = JSON.parse(raw);
      } catch {
        // битое значение просто не переносим — игра начнёт партию заново
      }
    }
  } catch {
    // хранилище недоступно (приватный режим) — прогресса нет
  }
  return out;
}

/** Заменяет весь прогресс на присланный. Ключи, которых нет в data, стираются. */
export function restore(data) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(data ?? {})) {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } catch (err) {
    console.warn('не удалось применить прогресс', err);
  }
  changed();
}

/** Есть ли что переносить в новый аккаунт (играл ли человек гостем). */
export function hasProgress() {
  return Object.keys(snapshot()).length > 0;
}
