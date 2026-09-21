// Реестр игр — единственное место, где оболочка узнаёт об играх.
// Модуль игры грузится лениво, только при открытии; title здесь — для меню без загрузки модуля.
// css (необязательно) — подключается оболочкой на время игры.

export const games = [
  {
    id: '_stub-a',
    title: 'Заглушка A · кликер',
    load: () => import('../games/_stub-a/index.js'),
    css: new URL('../games/_stub-a/game.css', import.meta.url),
  },
  {
    id: '_stub-b',
    title: 'Заглушка B · таймер',
    load: () => import('../games/_stub-b/index.js'),
  },
];
