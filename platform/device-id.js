// Номер этого устройства для счётчиков по устройствам (бета 'sync-merge', server/merge.js): «сыграно» и подсказки
// считаются у каждого устройства отдельно, а итог — сумма. К входу номер отношения не имеет (вход — подпись Telegram),
// с железом и личностью не связан: это случайная строка, заведённая при первом запуске.
//
// Хранится в Telegram DeviceStorage (Bot API 9.0: только на этом устройстве, не синхронизируется — в отличие от
// CloudStorage, который общий для всех устройств и дал бы двум устройствам один номер) и копией в localStorage.
// Нет DeviceStorage (старый клиент, браузер) — только localStorage.

import { isDeviceId } from '../server/merge.js';

const KEY = 'tggames-device';
const WAIT_MS = 1500;          // DeviceStorage отвечает через Telegram — не ждём его дольше

let pending = null;

export function deviceId(platform) {
  pending ??= resolve(platform);
  return pending;
}

async function resolve(platform) {
  let local = null;
  try {
    local = localStorage.getItem(KEY);
  } catch {
    // приватный режим — номер будет новым при каждом запуске, счётчики всё равно не удвоятся
  }
  const fromTelegram = await Promise.race([
    platform?.deviceStorage?.get(KEY).catch(() => null) ?? null,
    new Promise((r) => setTimeout(() => r(null), WAIT_MS)),
  ]);
  const id = isDeviceId(fromTelegram) ? fromTelegram : (isDeviceId(local) ? local : newId());
  if (id !== local) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // приватный режим
    }
  }
  if (id !== fromTelegram) platform?.deviceStorage?.set(KEY, id).catch(() => {});
  return id;
}

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Для тестов: забыть найденный номер. */
export function resetDeviceId() {
  pending = null;
}
