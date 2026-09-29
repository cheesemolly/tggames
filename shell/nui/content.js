// Содержимое нового интерфейса (в бете 'new-ui') без DOM — чтобы проверять тестами: истории (новые игры и
// обновления, советы, свои итоги), игры для баннера «Новая игра», имя для приветствия.
//
// Истории про игру показываются, только если игра видна игроку: про игры в бете — только тем, кто видит бету.
// Новая история — запись в STORIES (id не менять: по нему помнится «просмотрено»). В тексте — только правда
// об игре (что в ней есть на самом деле).

import { digits, plural, placeOn } from './logic.js';

export const STORIES = [
  {
    id: 'killer-new',
    label: 'Киллер',
    games: ['killer-sudoku'],
    slides: [
      { kicker: 'Новая игра', title: 'Судоку-киллер', text: 'Поле разбито на пунктирные группы: цифры группы складываются в число в её углу и не повторяются.' },
      { kicker: 'Совет', title: 'Правило 45', text: 'Сумма цифр любой строки, столбца и блока — 45. Вычти суммы групп, которые лежат в нём целиком, — и узнаешь, сколько в остальных клетках.', play: 'killer-sudoku' },
    ],
  },
  {
    id: 'pinball-new',
    label: 'Новая игра',
    games: ['pinball'],
    slides: [
      { kicker: 'Новая игра', title: 'Пинбол', text: 'Как в Windows XP: звания от кадета до адмирала флота, миссии, гиперпространство и червоточины.' },
      { kicker: 'Совет', title: 'Удар умения', text: 'Запусти шарик слабо, чтобы он скатился обратно на пружину, — за это до 75 000 очков.', play: 'pinball' },
    ],
  },
  {
    id: 'cards-new',
    label: 'Пасьянсы',
    games: ['klondike', 'spider'],
    slides: [
      { kicker: 'Новые игры', title: 'Косынка и Паук', text: 'Пасьянсы как в Windows. В Косынке каждую раскладку проверил решатель — выиграть можно всегда.', play: 'klondike' },
    ],
  },
  {
    id: 'chess-new',
    label: 'Шахматы',
    games: ['chess'],
    slides: [
      { kicker: 'Новая игра', title: 'Шахматы', text: 'Семь уровней бота: «Новичок» зевает фигуры, как человек, а «Максимум» думает над ходом две с половиной секунды.', play: 'chess' },
    ],
  },
  {
    id: 'match3-new',
    label: 'Три в ряд',
    games: ['match3'],
    slides: [
      { kicker: 'Новая игра', title: 'Три в ряд', text: '100 уровней в 10 главах, каждый десятый — босс.' },
      { kicker: 'Совет', title: 'Две ракеты', text: 'Поменяй местами две ракеты — взорвутся сразу строка и столбец.', play: 'match3' },
    ],
  },
  {
    id: 'tictactoe-new',
    label: 'Крестики',
    games: ['tictactoe'],
    slides: [
      { kicker: 'Новая игра', title: 'Крестики-нолики', text: 'Классика 3×3 и пять в ряд на большом поле — против бота или вдвоём на одном телефоне.', play: 'tictactoe' },
    ],
  },
  {
    id: 'rating-overall',
    label: 'Рейтинг',
    rated: true,
    slides: [
      { kicker: 'Обновление', title: 'Общий рейтинг', text: 'За место в каждой игре — очки, как в гонках: первое место — 100, второе — 93. Очки всех игр складываются.', href: '#/top', button: 'К рейтингу' },
    ],
  },
  {
    id: 'tip-sudoku',
    label: 'Совет',
    games: ['sudoku'],
    slides: [
      { kicker: 'Совет', title: 'Судоку допишет само', text: 'Включи «Автозаполнение» в настройках судоку — когда решение однозначно, последние клетки впишутся сами.', play: 'sudoku' },
    ],
  },
  {
    id: 'tip-snake',
    label: 'Совет',
    games: ['snake'],
    slides: [
      { kicker: 'Совет', title: 'Змейка без отрыва', text: 'Свайп можно вести, не отрывая палец: вверх, вправо, вниз — три поворота подряд.', play: 'snake' },
    ],
  },
  {
    id: 'tip-bongo',
    label: 'Совет',
    games: ['bongo-cat'],
    slides: [
      { kicker: 'Совет', title: 'Две октавы', text: 'В Bongo Cat включи «2 октавы» или поверни экран кнопкой в шапке — клавиш станет 24.', play: 'bongo-cat' },
    ],
  },
];

/** Номер недели (ISO) — у личных итогов свой id на каждую неделю, чтобы кружок загорался снова. */
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-w${week}`;
}

/**
 * Личная история «Итоги»: место в общем рейтинге и лучшие места в играх (из сводки рейтинга) или null.
 * best — [{ game, place }] (logic.bestPlaces), titleOf — название игры.
 */
export function weekStory(overall, best, titleOf, date = new Date()) {
  if (!overall?.place) return null;
  const slides = [{
    kicker: 'Итоги недели',
    title: `Ты на ${placeOn(overall.place)}`,
    text: `${digits(overall.points)} ${plural(overall.points, ['очко', 'очка', 'очков'])}${overall.total ? ` · всего игроков: ${digits(overall.total)}` : ''}. Сыграй ещё — места пересчитываются сразу.`,
    icon: 'trophy',
  }];
  if (best.length) {
    slides.push({
      kicker: 'Лучше всего',
      title: `${titleOf(best[0].game)}: ${best[0].place}-е место`,
      text: best.slice(1).map((b) => `${titleOf(b.game)} — ${b.place}-е`).join(', ') || 'Попробуй другие игры — за каждую добавляются очки.',
      game: best[0].game,
      href: '#/top',
      button: 'К рейтингу',
    });
  }
  return { id: `week-${weekId(date)}`, label: 'Итоги', mine: true, slides };
}

/**
 * Какие истории показать: только про видимые игры (visible(id)), рейтинговые — если он есть; личные итоги
 * первыми; непросмотренные — перед просмотренными (порядок внутри сохраняется).
 */
export function pickStories({ visible, rated = false, seen = [], week = null }) {
  const list = [week, ...STORIES].filter(Boolean)
    .filter((s) => (!s.games || s.games.every(visible)) && (!s.rated || rated));
  const isSeen = (s) => seen.includes(s.id);
  return [...list.filter((s) => !isSeen(s)), ...list.filter(isSeen)].map((s) => ({ ...s, seen: isSeen(s) }));
}

/** Что показать баннером «Новая игра»: первая видимая игроку из списка (новые — выше). */
export const NEW_GAMES = [
  { id: 'killer-sudoku', text: 'Суммы в группах, подсказки с объяснением' },
  { id: 'pinball', text: 'Миссии и звания, как в Windows XP' },
  { id: 'klondike', text: 'Только решаемые раскладки' },
  { id: 'spider', text: 'Пасьянс в 1, 2 или 4 масти' },
  { id: 'chess', text: 'Семь уровней бота' },
  { id: 'match3', text: '100 уровней, боссы и комбо' },
  { id: 'tictactoe', text: '3×3 и пять в ряд' },
  { id: 'bongo-cat', text: 'Кот-музыкант: бонго, пианино, маримба' },
  { id: 'snake', text: 'Уровни, порталы и режимы Google Snake' },
  { id: 'memory', text: 'Найди пары: уровни и своя игра' },
];

/** Имя для приветствия: первое слово имени из Telegram (без фамилии). */
export const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || null;
