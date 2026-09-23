// Короткая строка о прогрессе игры для меню («Уровень 14»): игра шлёт её через api.progress(),
// меню читает. Держится отдельно от статистики: у уровневых игр партий и побед просто нет.

import { createStorage } from '../platform/storage.js';

const store = createStorage('shell:progress');

export const progress = {
  get: (gameId) => store.get(gameId),
  set(gameId, text) {
    if (typeof text === 'string' && text.trim()) return store.set(gameId, text.trim());
    return store.remove(gameId);
  },
};
