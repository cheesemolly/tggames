// Данные нового интерфейса (в бете 'new-ui'), которые едут с прогрессом на сервер (shell:player):
//   favs   — избранные игры (сердечко);
//   recent — когда игру открывали последний раз (сортировка «Сначала недавние», баннер «Продолжить»);
//   visits — дни, в которые заходил (серия-огонёк и календарь).
// Всё это — прогресс игрока, как статистика: в privacy.html оно описано.

import { createStorage } from '../../platform/storage.js';
import { addVisit, dayKey, toggleFav, touchRecent } from './logic.js';

const store = createStorage('shell:player');

export async function getFavs() {
  const list = await store.get('favs');
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

/** Переключить сердечко; возвращает, в избранном ли игра теперь. */
export async function flipFav(id) {
  const next = toggleFav(await getFavs(), id);
  await store.set('favs', next);
  return next.includes(id);
}

export async function getRecent() {
  const map = await store.get('recent');
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

export async function noteOpened(id) {
  await store.set('recent', touchRecent(await getRecent(), id, Date.now()));
}

export async function getVisits() {
  const days = await store.get('visits');
  return Array.isArray(days) ? days : [];
}

/** Отметить сегодняшний заход (повторно в тот же день ничего не пишет — лишней синхронизации нет). */
export async function markVisit() {
  const days = await getVisits();
  const today = dayKey();
  if (days.includes(today)) return days;
  const next = addVisit(days, today);
  await store.set('visits', next);
  return next;
}
