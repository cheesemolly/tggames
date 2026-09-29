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
// fn(key, same): key — какой ключ (как в snapshot(), без общего префикса; null — заменено всё),
// same — записано то же значение, что уже лежало (слиянию, бета sync-merge, отправлять нечего).
const listeners = new Set();

export function onStorageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed(key = null, same = false) {
  for (const fn of listeners) {
    try {
      fn(key, same);
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
        const raw = JSON.stringify(value);
        const same = localStorage.getItem(prefix + key) === raw;
        localStorage.setItem(prefix + key, raw);
        changed(`${namespace}:${key}`, same);
      } catch (err) {
        console.warn(`storage.set(${prefix}${key}) не удался`, err);
      }
    },

    async remove(key) {
      try {
        const same = localStorage.getItem(prefix + key) === null;
        localStorage.removeItem(prefix + key);
        changed(`${namespace}:${key}`, same);
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

/** Одно значение (ключ как в snapshot()); нет — undefined. */
export function readValue(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Заменить отдельные ключи (слияние с сервером): значение undefined — ключ удаляется. */
export function writeValues(values) {
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, JSON.stringify(value));
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
