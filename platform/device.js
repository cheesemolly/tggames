// На чём открыто мини-приложение — по Telegram.WebApp.platform.
// Телефоны: android, android_x, ios. Остальное — компьютер: tdesktop (Telegram Desktop), macos,
// веб-версии (web, weba, webk), unigram (Windows). Незнакомое значение считаем компьютером:
// на телефоне Telegram всегда сообщает android или ios.

const MOBILE = new Set(['android', 'android_x', 'ios']);

export const isMobilePlatform = (name) => MOBILE.has(String(name ?? '').toLowerCase());
