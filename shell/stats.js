// Статистика по играм: сколько сыграно, побед, лучший счёт.
// Ведётся по игре целиком (ключ gameId — её показывает меню) и, если игра передала result.variant,
// ещё и по варианту (ключ gameId:variant — например, язык Wordle).
// Пока «лучший» = максимальный; для игр, где меньше — лучше (время), понадобится настройка в реестре.

import { createStorage } from '../platform/storage.js';

const store = createStorage('shell:stats');
const EMPTY = { played: 0, wins: 0, best: null };

export async function getStats(gameId, variant = null) {
  return { ...EMPTY, ...(await store.get(statsKey(gameId, variant))) };
}

/** Записывает результат; возвращает статистику варианта (если он есть) или игры. */
export async function recordResult(result) {
  const total = await update(result.gameId, null, result);
  return result.variant ? update(result.gameId, result.variant, result) : total;
}

async function update(gameId, variant, result) {
  const stats = await getStats(gameId, variant);
  stats.played += 1;
  if (result.outcome === 'win') stats.wins += 1;
  if (typeof result.score === 'number' && (stats.best === null || result.score > stats.best)) {
    stats.best = result.score;
  }
  await store.set(statsKey(gameId, variant), stats);
  return stats;
}

function statsKey(gameId, variant) {
  return variant ? `${gameId}:${variant}` : gameId;
}
