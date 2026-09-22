// Строки оболочки, которые видит игрок внутри игры (экран результата).
// Язык выбирает игра через result.locale; меню пока только на русском.

const STRINGS = {
  ru: {
    outcome: { win: 'Победа!', lose: 'Поражение', draw: 'Ничья', quit: 'Игра окончена' },
    score: 'Очки',
    time: 'Время',
    best: 'Рекорд',
    again: 'Ещё раз',
    menu: 'В меню',
    share: 'Поделиться',
    copied: 'Скопировано!',
    shareFailed: 'Не удалось поделиться',
    hide: 'Скрыть результат',
    show: 'Показать результат',
  },
  uk: {
    outcome: { win: 'Перемога!', lose: 'Поразка', draw: 'Нічия', quit: 'Гру завершено' },
    score: 'Очки',
    time: 'Час',
    best: 'Рекорд',
    again: 'Ще раз',
    menu: 'До меню',
    share: 'Поділитися',
    copied: 'Скопійовано!',
    shareFailed: 'Не вдалося поділитися',
    hide: 'Сховати результат',
    show: 'Показати результат',
  },
  en: {
    outcome: { win: 'You won!', lose: 'You lost', draw: 'Draw', quit: 'Game over' },
    score: 'Score',
    time: 'Time',
    best: 'Best',
    again: 'Play again',
    menu: 'Menu',
    share: 'Share',
    copied: 'Copied!',
    shareFailed: "Couldn't share",
    hide: 'Hide result',
    show: 'Show result',
  },
};

export const LOCALES = Object.keys(STRINGS);

export function shellText(locale) {
  return STRINGS[locale] ?? STRINGS.ru;
}
