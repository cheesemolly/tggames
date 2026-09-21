// Хранилище ключ-значение с пространствами имён.
// Сейчас поверх localStorage. API асинхронный уже сейчас, чтобы позже без переделок
// перейти на Telegram CloudStorage (он асинхронный).

const ROOT = 'tggames';

export function createStorage(namespace) {
  const prefix = `${ROOT}:${namespace}:`;

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
      } catch (err) {
        console.warn(`storage.set(${prefix}${key}) не удался`, err);
      }
    },

    async remove(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        // хранилище недоступно — удалять нечего
      }
    },
  };
}
