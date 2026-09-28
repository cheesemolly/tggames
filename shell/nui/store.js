// Данные нового интерфейса (в бете 'new-ui'), которые едут с прогрессом на сервер (shell:player):
//   favs   — избранные игры (сердечко);
//   visits — дни, в которые заходил (серия-огонёк и календарь).
// Всё это — прогресс игрока, как статистика: в privacy.html оно описано.
// «Когда открывал игру» (сортировка «Сначала недавние», баннер «Продолжить») — только на этом устройстве
// (localStorage вне tggames:): на сервер не едет. Иначе каждое открытие игры сдвигало бы прогресс на сервере,
// и у второго устройства, где в это время играют, сохранение упиралось бы в 409 (бета sync-refresh).

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

const RECENT_KEY = 'tggames-recent';

export async function getRecent() {
  try {
    const map = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null');
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

export async function noteOpened(id) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(touchRecent(await getRecent(), id, Date.now())));
  } catch {
    // приватный режим — сортировка «недавние» просто не запомнится
  }
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
