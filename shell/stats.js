// Статистика по играм: сколько сыграно, побед, лучший счёт.
// Ведётся по игре целиком (ключ gameId — её показывает меню) и, если игра передала result.variant,
// ещё и по варианту (ключ gameId:variant — например, язык Wordle).
// Пока «лучший» = максимальный; для игр, где меньше — лучше (время), понадобится настройка в реестре.

import { createStorage } from '../platform/storage.js';

const store = createStorage('shell:stats');
const EMPTY = { played: 0, wins: 0, best: null };

/**
 * Разовая чистка при смене смысла рекорда (2026-09-23): в 2048 счёт был очками, а стал лучшей плиткой,
 * в «Соедини точки» очки убраны совсем — рекорд теперь номер уровня. Старые числа показывались бы
 * как «Рекорд: Уровень 500», поэтому обнуляются. Заодно выбрасывается статистика удалённых игр.
 */
const RESET_BEST = ['2048', '2048:3', '2048:4', '2048:5', '2048:6', 'connect-dots'];
const REMOVED_GAMES = ['guess-number', '_stub-a', '_stub-b'];

export async function migrateStats() {
  if ((await store.get('__v')) >= 2) return;
  for (const key of RESET_BEST) {
    const stats = await store.get(key);
    if (stats && stats.best !== null && stats.best !== undefined) await store.set(key, { ...stats, best: null });
  }
  for (const key of REMOVED_GAMES) await store.remove(key);
  await store.set('__v', 2);
}

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
