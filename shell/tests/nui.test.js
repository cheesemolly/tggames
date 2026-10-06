import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addVisit, streakOf, shiftDay, monthCells, MAX_DAYS, fold, filterGames, sortGames, sortModes, triedGame, touchRecent, toggleFav,
  placesOf, bestPlaces, pickBanners,
} from '../nui/logic.js';
import { STORIES, NEW_GAMES, pickStories, weekStory, weekId, firstName } from '../nui/content.js';
import { getPrefs, DEFAULT_PREFS } from '../nui/prefs.js';
import { whichSplash } from '../splash.js';
import { BETA } from '../beta.js';
import { games } from '../registry.js';

const ids = games.map((g) => g.id);

test('новый интерфейс выпущен (2026-09-29): в бете его нет — он у всех', () => {
  assert.equal(BETA.find((b) => b.id === 'new-ui'), undefined);
});

test('серия: дни подряд до сегодня, пропуск рвёт серию, лучшая — за всё время', () => {
  const days = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-20', '2026-09-26', '2026-09-27', '2026-09-28'];
  assert.deepEqual(streakOf(days, '2026-09-28'), { current: 3, best: 4 });
  // сегодня ещё не заходил — серия до вчера не сгорает
  assert.deepEqual(streakOf(days.slice(0, -1), '2026-09-28'), { current: 2, best: 4 });
  assert.deepEqual(streakOf(['2026-09-20'], '2026-09-28'), { current: 0, best: 1 });
  assert.deepEqual(streakOf([], '2026-09-28'), { current: 0, best: 0 });
  // через границы месяца и года
  assert.deepEqual(streakOf(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01'), { current: 3, best: 3 });
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29');
});

test('дни захода: без повторов, по порядку, мусор выбрасывается, не больше MAX_DAYS', () => {
  assert.deepEqual(addVisit(['2026-09-27', '2026-09-26', 'мусор', 5, '2026-09-27'], '2026-09-28'), ['2026-09-26', '2026-09-27', '2026-09-28']);
  assert.deepEqual(addVisit(null, '2026-09-28'), ['2026-09-28']);
  const many = Array.from({ length: MAX_DAYS + 30 }, (_, i) => shiftDay('2026-09-28', -i - 1));
  const kept = addVisit(many, '2026-09-28');
  assert.equal(kept.length, MAX_DAYS);
  assert.equal(kept.at(-1), '2026-09-28');
});

test('календарь: недели с понедельника, дни соседних месяцев помечены', () => {
  const sep = monthCells(2026, 8);                // 1 сентября 2026 — вторник
  assert.equal(sep.length % 7, 0);
  assert.deepEqual(sep[0], { n: 31, key: '2026-08-31', out: true });
  assert.deepEqual(sep[1], { n: 1, key: '2026-09-01', out: false });
  assert.equal(sep.filter((c) => !c.out).length, 30);
  const feb = monthCells(2027, 1);                // 1 февраля 2027 — понедельник, 28 дней: ровно 4 недели
  assert.equal(feb.length, 28);
  assert.ok(feb.every((c) => !c.out));
});

test('поиск игр: регистр и ё не важны, по началу слова, иначе — по подстроке; папки и избранное', () => {
  const items = [
    { id: 'match3', title: 'Три в ряд', cat: 'puzzles', fav: false },
    { id: 'sudoku', title: 'Судоку', cat: 'puzzles', fav: true },
    { id: 'words', title: 'Слова из слова', cat: 'words', fav: false },
    { id: 'flappy-burger', title: 'Flappy Burger', cat: 'arcade', fav: true },
  ];
  assert.equal(fold(' Ёжик  В ЛЕСУ '), 'ежик в лесу');
  assert.deepEqual(filterGames(items, { query: 'сУд' }).map((g) => g.id), ['sudoku']);
  assert.deepEqual(filterGames(items, { query: 'ряд' }).map((g) => g.id), ['match3'], 'по началу второго слова');
  assert.deepEqual(filterGames(items, { query: 'burg' }).map((g) => g.id), ['flappy-burger']);
  assert.deepEqual(filterGames(items, { query: 'удо' }).map((g) => g.id), ['sudoku'], 'подстрока, когда по началу ничего');
  assert.deepEqual(filterGames(items, { cats: ['puzzles'] }).map((g) => g.id), ['match3', 'sudoku']);
  assert.deepEqual(filterGames(items, { fav: true }).map((g) => g.id), ['sudoku', 'flappy-burger']);
  assert.deepEqual(filterGames(items, { cats: ['words'], fav: true }), []);
});

test('сортировка: недавние сверху (остальные в прежнем порядке) или по названию', () => {
  const items = [{ id: 'a', title: 'Шашки' }, { id: 'b', title: 'Бонго' }, { id: 'c', title: 'Арбуз' }];
  assert.deepEqual(sortGames(items, 'recent', { c: 200, b: 100 }).map((g) => g.id), ['c', 'b', 'a']);
  assert.deepEqual(sortGames(items, 'recent', {}).map((g) => g.id), ['a', 'b', 'c']);
  assert.deepEqual(sortGames(items, 'name').map((g) => g.title), ['Арбуз', 'Бонго', 'Шашки']);
});

test('сортировка «Ещё не пробовал»: сначала нетронутые в прежнем порядке, потом остальные — недавние выше', () => {
  const items = [
    { id: 'a', title: 'А', tried: true }, { id: 'b', title: 'Б', tried: false },
    { id: 'c', title: 'В', tried: true }, { id: 'd', title: 'Г', tried: false },
  ];
  assert.deepEqual(sortGames(items, 'untried', { a: 100, c: 200 }).map((g) => g.id), ['b', 'd', 'c', 'a']);
  assert.deepEqual(sortModes(false), ['recent', 'name'], 'без беты — как раньше');
  assert.deepEqual(sortModes(true), ['recent', 'untried', 'name']);
  assert.equal(triedGame({}), false);
  assert.equal(triedGame({ played: 1 }), true);
  assert.equal(triedGame({ progress: 'Уровень 2' }), true);
  assert.equal(triedGame({ save: true }), true);
  assert.equal(triedGame({ at: 5 }), true);
});

test('недавние и избранное: не больше 60 записей, сердечко переключается', () => {
  let recent = {};
  for (let i = 0; i < 70; i++) recent = touchRecent(recent, `g${i}`, i);
  assert.equal(Object.keys(recent).length, 60);
  assert.ok(!('g0' in recent) && 'g69' in recent, 'выбрасываются самые старые');
  assert.deepEqual(toggleFav(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleFav(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleFav(null, 'a'), ['a']);
});

test('места из сводки рейтинга: лучшие три — только видимые игры, по месту', () => {
  const summary = {
    games: [
      { game: '2048', total: 90, me: { place: 9, text: 'плитка 1024' } },
      { game: 'wordle', total: 120, me: { place: 3, text: '31 слово' } },
      { game: 'pinball', total: 30, me: { place: 3, text: '1 000' } },
      { game: 'snake', total: 70, me: null },
      { game: 'chess', total: 10, me: { place: 1, text: '5 побед' } },
    ],
  };
  assert.deepEqual(Object.keys(placesOf(summary)).sort(), ['2048', 'chess', 'pinball', 'wordle']);
  assert.deepEqual(placesOf(null), {});
  // шахматы (бета) не видны — не показываются; при равном месте выше та, где игроков больше
  assert.deepEqual(bestPlaces(summary, ['2048', 'wordle', 'pinball', 'snake']).map((b) => b.game), ['wordle', 'pinball', '2048']);
});

test('баннеры: продолжить последнюю партию, место в рейтинге (если есть рейтинг), новая игра — без повтора', () => {
  const b = pickBanners({ saved: [{ id: 'sudoku', at: 5 }, { id: '2048', at: 9 }], rated: true, fresh: 'pinball' });
  assert.deepEqual(b.map((x) => x.kind), ['continue', 'rating', 'new']);
  assert.equal(b[0].game, '2048');
  assert.deepEqual(pickBanners({ saved: [], rated: false, fresh: 'pinball' }).map((x) => x.kind), ['new']);
  assert.deepEqual(pickBanners({ saved: [{ id: 'pinball', at: 1 }], fresh: 'pinball' }).map((x) => x.kind), ['continue']);
});

test('истории: про игры из реестра, с текстом; про невидимые игры — не показываются; непросмотренные — первыми', () => {
  const storyIds = STORIES.map((s) => s.id);
  assert.equal(new Set(storyIds).size, storyIds.length, 'id историй не повторяются');
  for (const s of STORIES) {
    assert.ok(s.label && s.slides.length, `${s.id}: подпись и карточки`);
    for (const g of s.games ?? []) assert.ok(ids.includes(g), `${s.id}: игра ${g} есть в реестре`);
    for (const sl of s.slides) {
      assert.ok(sl.kicker && sl.title && sl.text, `${s.id}: у карточки есть надпись, заголовок и текст`);
      if (sl.play) assert.ok(ids.includes(sl.play), `${s.id}: кнопка «Играть» — в игру из реестра`);
    }
  }
  const publicOnly = (id) => !['pinball', 'klondike', 'spider', 'chess', 'match3', 'tictactoe'].includes(id);
  const shown = pickStories({ visible: publicOnly, rated: false, seen: ['tip-sudoku'] });
  assert.ok(shown.every((s) => (s.games ?? []).every(publicOnly)), 'истории про игры в бете игрок не видит');
  assert.ok(!shown.some((s) => s.rated), 'без рейтинга (вне Telegram) — без истории про рейтинг');
  assert.equal(shown.at(-1).id, 'tip-sudoku', 'просмотренная — в конце');
  assert.equal(shown.at(-1).seen, true);
  const all = pickStories({ visible: () => true, rated: true, seen: [] });
  assert.equal(all.length, STORIES.length);
});

test('свои итоги: место и лучшие игры; без места — истории нет; новая неделя — новый id', () => {
  const titleOf = (id) => ({ wordle: 'Wordle', '2048': '2048' }[id] ?? id);
  const s = weekStory({ place: 58, points: 72, total: 412 }, [{ game: 'wordle', place: 3 }, { game: '2048', place: 9 }], titleOf, new Date(2026, 8, 28));
  assert.equal(s.slides[0].title, 'Ты на 58-м месте');
  assert.match(s.slides[0].text, /^72 очка · всего игроков: 412/);
  assert.equal(s.slides[1].title, 'Wordle: 3-е место');
  assert.equal(s.slides[1].text, '2048 — 9-е');
  assert.equal(weekStory(null, [], titleOf), null);
  assert.notEqual(weekId(new Date(2026, 8, 28)), weekId(new Date(2026, 9, 5)));
  assert.equal(weekId(new Date(2026, 8, 28)), weekId(new Date(2026, 9, 4)), 'пн–вс — одна неделя');
  const pinned = pickStories({ visible: () => true, rated: true, seen: [], week: s });
  assert.equal(pinned[0].id, s.id, 'свои итоги — первым кружком');
});

test('баннер «Новая игра» и приветствие', () => {
  for (const g of NEW_GAMES) assert.ok(ids.includes(g.id) && g.text, `${g.id}: есть в реестре и с подписью`);
  assert.equal(firstName('Мария Иванова'), 'Мария');
  assert.equal(firstName('  '), null);
  assert.equal(firstName(null), null);
});

test('настройки по умолчанию — всё включено (хранилища нет — не падает)', () => {
  assert.deepEqual(getPrefs(), DEFAULT_PREFS);
  assert.deepEqual(DEFAULT_PREFS, { sound: true, haptics: true, motion: true, dock: false });
});

test('заставка: новая пиксельная — у того, кто видит бету (не «как игрок»), после релиза — у всех', () => {
  assert.equal(whichSplash({ nuiReleased: false, marked: false, localOwner: false, asPlayer: false }), 'pulse');
  assert.equal(whichSplash({ nuiReleased: false, marked: true, localOwner: false, asPlayer: false }), 'pixel');
  assert.equal(whichSplash({ nuiReleased: false, marked: false, localOwner: true, asPlayer: false }), 'pixel');
  assert.equal(whichSplash({ nuiReleased: false, marked: true, localOwner: true, asPlayer: true }), 'pulse');
  assert.equal(whichSplash({ nuiReleased: true, marked: false, localOwner: false, asPlayer: false }), 'pixel');
});
