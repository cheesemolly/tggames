// Статистика по играм: сколько сыграно, побед, лучший счёт.
// Пока «лучший» = максимальный; для игр, где меньше — лучше (время), понадобится настройка в реестре.

import { createStorage } from '../platform/storage.js';

const store = createStorage('shell:stats');
const EMPTY = { played: 0, wins: 0, best: null };

export async function getStats(gameId) {
  return { ...EMPTY, ...(await store.get(gameId)) };
}

export async function recordResult(result) {
  const stats = await getStats(result.gameId);
  stats.played += 1;
  if (result.outcome === 'win') stats.wins += 1;
  if (typeof result.score === 'number' && (stats.best === null || result.score > stats.best)) {
    stats.best = result.score;
  }
  await store.set(result.gameId, stats);
  return stats;
}
