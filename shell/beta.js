// Бета — всё новое, что владелец обкатывает до выпуска игрокам (требование владельца, 2026-09-26: «за день ввожу
// в админ-доступ игру, систему рейтинга, новый интерфейс — а потом одной командой выпускаю всё в паблик»).
//
// Одна запись — одно новое:
//   kind: 'game'    — игра целиком (id как в shell/registry.js): игрокам её не видно ни в меню, ни по ссылке;
//   kind: 'feature' — функция оболочки или игры: код спрашивает feature('<id>') (в игре — api.feature('<id>'))
//                     и включает новое только тому, кто видит бету.
// title и note — для вкладки «Бета» и для текста девлога при релизе, since — когда добавлено.
//
// Релиз — `npm run release` (tools/release.js): список ниже очищается целиком, всё из него видят все.
// Проверки feature('<id>') после релиза остаются и просто всегда true (id больше нет в списке).
//
// Бету видит только владелец (account.isAdmin из /me — решает сервер), и то пока не включил «Смотреть как
// игрок» на вкладке «Бета». Это не защита — код публичный, — а «кому показывать».

export const BETA = [
  // >>> список беты (tools/release.js очищает всё между этими строками)
  // <<< конец списка беты
];

export const KINDS = ['game', 'feature'];

export const inBeta = (id) => BETA.some((b) => b.id === id);
export const betaGames = () => BETA.filter((b) => b.kind === 'game').map((b) => b.id);

let viewer = () => false;

/** Кто видит бету — задаёт оболочка при старте (владелец и не «как игрок»). */
export function setBetaViewer(fn) {
  viewer = fn;
}

export const seesBeta = () => Boolean(viewer());

/** Включено ли новое: вне беты — у всех, в бете — только у того, кто видит бету. */
export const feature = (id) => !inBeta(id) || seesBeta();

// «Смотреть как игрок» — только на этом устройстве, вне пространства tggames: (не синхронизируется).
const PLAYER_VIEW_KEY = 'tggames-beta-player-view';

export function playerView() {
  try {
    return localStorage.getItem(PLAYER_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPlayerView(on) {
  try {
    if (on) localStorage.setItem(PLAYER_VIEW_KEY, '1');
    else localStorage.removeItem(PLAYER_VIEW_KEY);
  } catch {
    // приватный режим — переключатель просто не запомнится
  }
}
