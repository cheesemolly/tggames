// Адрес обработчика аккаунтов (Cloudflare Worker из server/worker.js).
// Пусто — аккаунтов нет: сайт работает полностью локально, прогресс живёт в браузере.
// После выкладывания обработчика сюда вписывается его адрес, например:
//   export const API_URL = 'https://tggames-api.ИМЯ.workers.dev';
// Без косой черты в конце.

export const API_URL = 'https://tggames-api.cheesemolly3.workers.dev';

// Имя бота (без @) — ссылка «Наш бот» в профиле нового интерфейса.
export const BOT_USERNAME = 'anygametg_bot';
