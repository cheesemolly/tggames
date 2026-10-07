// Правила «Слогов»: деление на слоги, набор слов уровня, проверка выбранных слогов, звёзды, прогресс.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINT_PENALTY, MAX_PIECE, MAX_PIECES, MODES, OPEN_AT_START, STAR_SECONDS, TIMED_BOARD, TIMED_SECONDS,
  check, display, emptyProgress, emptyStats, formatTime, isClearSet, isOpen, isValidProgress, isValidRun, isValidStats,
  keyOf, migrateProgress, migrateStats, pickWords, piecesOf, plural, recordClassic, recordTimed, starsFor, starsToOpen,
  syllables, tilings, totalStars, wordScore, wordsIn,
} from '../logic.js';

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const split = (word) => syllables(word).join('-');

test('слоги: одна гласная в слоге, одна согласная уходит к следующему', () => {
  assert.equal(split('малина'), 'ма-ли-на');
  assert.equal(split('клубника'), 'клуб-ни-ка');
  assert.equal(split('яблоко'), 'я-бло-ко');
  assert.equal(split('какао'), 'ка-ка-о');
  assert.equal(split('июнь'), 'и-юнь');
  assert.equal(split('ёжик'), 'ё-жик');
  assert.equal(split('Токио'), 'то-ки-о');
});

test('слоги: й, ь и сонорные остаются слева', () => {
  assert.equal(split('майка'), 'май-ка');
  assert.equal(split('письмо'), 'пись-мо');
  assert.equal(split('апельсин'), 'а-пель-син');
  assert.equal(split('карман'), 'кар-ман');
  assert.equal(split('солнце'), 'солн-це');
  assert.equal(split('семья'), 'се-мья');
  assert.equal(split('обезьяна'), 'о-бе-зья-на');
});

test('слоги: из стечения вправо уходит последняя согласная или пара «взрывная + л/р»', () => {
  assert.equal(split('кошка'), 'кош-ка');
  assert.equal(split('куртка'), 'курт-ка');
  assert.equal(split('лестница'), 'лест-ни-ца');
  assert.equal(split('кислород'), 'кис-ло-род');
  assert.equal(split('виноград'), 'ви-но-град');
  assert.equal(split('зебра'), 'зе-бра');
  assert.equal(split('метро'), 'ме-тро');
  assert.equal(split('африка'), 'а-фри-ка');
  assert.equal(split('сестра'), 'сес-тра');
});

test('слоги: разделительный ъ не отрывается, слово без гласных и с одной — целиком', () => {
  assert.equal(split('подъезд'), 'подъ-езд');
  assert.equal(split('объявление'), 'объ-я-вле-ни-е');
  assert.equal(split('слон'), 'слон');
  assert.equal(split('дождь'), 'дождь');
  assert.deepEqual(syllables(''), []);
  assert.deepEqual(syllables(null), []);
});

test('слоги: дефис задаёт деление вручную, показ и сравнение — без дефисов', () => {
  assert.deepEqual(syllables('Ав-стри-я'), ['ав', 'стри', 'я']);
  assert.deepEqual(syllables('Ки-ли-ман-джа-ро'), ['ки', 'ли', 'ман', 'джа', 'ро']);
  assert.equal(display('Ав-стри-я'), 'Австрия');
  assert.equal(keyOf('Ав-стри-я'), 'австрия');
  assert.equal(keyOf('Сатурн'), 'сатурн');
});

test('слоги: склеенные обратно дают слово', () => {
  for (const w of ['мороженое', 'виолончель', 'Чай-ков-ский', 'лиственница', 'объявление', 'электричество']) {
    assert.equal(syllables(w).join(''), keyOf(w), w);
    for (const part of syllables(w)) assert.equal([...part].filter((ch) => 'аеёиоуыэюя'.includes(ch)).length, 1, `${w}: ${part}`);
  }
});

test('способы сложить слово из кусочков: путаница ловится', () => {
  assert.equal(tilings('малина', ['ма', 'ли', 'на']), 1);
  assert.equal(tilings('малина', ['ма', 'ли']), 0);
  // «пиро» + «жное» и «пи» + «ро» + «жное» — два способа
  assert.equal(tilings('пирожное', ['пи', 'ро', 'пиро', 'жное']), 2);
  assert.equal(tilings('аб', new Set(['а', 'б', 'аб'])), 2);
  assert.ok(isClearSet(['малина', 'вишня', 'арбуз']));
  // одно слово, разрезанное двумя способами, — путаница
  assert.ok(!isClearSet(['ба-нан', 'бан-ан']));
});

test('слов в уровне всё больше, но не больше, чем есть в теме', () => {
  assert.equal(wordsIn(0), 6);
  assert.equal(wordsIn(3), 6);
  assert.equal(wordsIn(4), 7);
  assert.equal(wordsIn(11), 7);
  assert.equal(wordsIn(12), 8);
  assert.equal(wordsIn(27), 8);
  assert.equal(wordsIn(28), 9);
  assert.equal(wordsIn(999), 9);
  for (let i = 1; i < 60; i++) assert.ok(wordsIn(i) >= wordsIn(i - 1));
});

test('набор слов уровня: слова темы без повторов, кружков не больше предела, набор однозначный', () => {
  const topic = { id: 't', words: ['малина', 'клубника', 'вишня', 'черника', 'смородина', 'арбуз', 'виноград', 'клюква', 'ежевика', 'крыжовник', 'брусника', 'облепиха'] };
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const words = pickWords(topic, 7, rngOf(seed));
    assert.equal(words.length, 7);
    assert.equal(new Set(words).size, 7);
    for (const w of words) assert.ok(topic.words.includes(w));
    assert.ok(piecesOf(words).length <= MAX_PIECES);
    assert.ok(isClearSet(words));
    seen.add(words.join());
  }
  assert.ok(seen.size > 20, 'наборы разные');
  assert.deepEqual(pickWords(topic, 7, rngOf(5)), pickWords(topic, 7, rngOf(5)), 'одно зерно — один набор');
  assert.equal(pickWords({ id: 's', words: ['дуб', 'клён'] }, 6, rngOf(1)).length, 2);
});

test('набор слов уровня: длинные слова — слов меньше, зато кружки помещаются', () => {
  const long = { id: 'l', words: ['Ки-ли-ман-джа-ро', 'мороженое', 'объявление', 'математика', 'литература', 'астрономия', 'география', 'биология', 'экономика', 'психология'] };
  for (let seed = 1; seed <= 30; seed++) {
    const words = pickWords(long, 9, rngOf(seed));
    assert.ok(words.length >= 2 && words.length < 9, String(words.length));
    assert.ok(piecesOf(words).length <= MAX_PIECES);
  }
});

test('набор слов уровня: путающиеся слова в один уровень не попадают', () => {
  // рядом с «пи» и «ро» кусочек «пиро» даёт слову два способа сложиться — вместе эти слова в уровень не идут
  const topic = { id: 'x', words: ['пиро-жное', 'пи-ро-га', 'малина', 'вишня', 'арбуз'] };
  for (let seed = 1; seed <= 40; seed++) {
    const words = pickWords(topic, 5, rngOf(seed));
    assert.ok(isClearSet(words), words.join());
    assert.ok(!(words.includes('пиро-жное') && words.includes('пи-ро-га')));
  }
});

test('кусочки: по слогу на кружок, номера подряд, у каждого — чьё слово', () => {
  assert.deepEqual(piecesOf(['малина', 'Ав-стри-я'], 10), [
    { id: 10, text: 'ма', word: 'малина' }, { id: 11, text: 'ли', word: 'малина' }, { id: 12, text: 'на', word: 'малина' },
    { id: 13, text: 'ав', word: 'австрия' }, { id: 14, text: 'стри', word: 'австрия' }, { id: 15, text: 'я', word: 'австрия' },
  ]);
  assert.deepEqual(piecesOf([]), []);
  assert.equal(piecesOf(['слон'])[0].id, 0);
});

test('проверка выбранных слогов: слово, продолжение, тупик', () => {
  const words = ['малина', 'машина', 'слон', 'Ав-стри-я'];
  assert.deepEqual(check(['ма', 'ли', 'на'], words), { word: 'малина' });
  assert.deepEqual(check(['слон'], words), { word: 'слон' });
  assert.deepEqual(check(['ав', 'стри', 'я'], words), { word: 'Ав-стри-я' });
  // начало слова — можно продолжать
  assert.equal(check(['ма'], words), null);
  assert.equal(check(['ма', 'ши'], words), null);
  // не начало, но длиннее слова ещё бывают — молчим, чтобы перебором слоги не угадывались
  assert.equal(check(['на'], words), null);
  assert.equal(check(['на', 'ли'], words), null);
  // слогов столько, сколько в самом длинном слове, а слова нет — тупик
  assert.deepEqual(check(['на', 'ли', 'ма'], words), { dead: true });
  assert.deepEqual(check(['ма', 'ли', 'ши'], words), { dead: true });
  // порядок важен
  assert.deepEqual(check(['ли', 'ма', 'на'], words), { dead: true });
  // слов не осталось — любой выбор тупик
  assert.deepEqual(check(['ма'], []), { dead: true });
});

test('проверка: одинаковые слоги разных слов взаимозаменяемы', () => {
  const words = ['малина', 'машина'];
  const pieces = piecesOf(words);
  const ma = pieces.filter((p) => p.text === 'ма');
  assert.equal(ma.length, 2);
  // «ма» от «машины» + «ли» + «на» от «малины» — всё равно «малина»
  assert.deepEqual(check([ma[1].text, 'ли', pieces.find((p) => p.text === 'на' && p.word === 'машина').text], words), { word: 'малина' });
});

test('звёзды: по секундам на слово', () => {
  const [three, two] = STAR_SECONDS;
  assert.equal(starsFor(three * 6, 6), 3);
  assert.equal(starsFor(three * 6 + 1, 6), 2);
  assert.equal(starsFor(two * 6, 6), 2);
  assert.equal(starsFor(two * 6 + 1, 6), 1);
  assert.equal(starsFor(0, 6), 3);
  assert.equal(starsFor(9999, 6), 1);
  assert.equal(starsFor(5, 0), 3, 'без слов не делим на ноль');
  // подсказка стоит времени: одна на уровне из шести слов не отнимает звезду у быстрого игрока
  assert.equal(starsFor(30 + HINT_PENALTY, 6), 3);
  assert.equal(starsFor(40 + HINT_PENALTY, 6), 2);
});

test('очки «На время»: буква — очко, длинному слову надбавка', () => {
  assert.equal(wordScore('слон'), 4);
  assert.equal(wordScore('зебра'), 5);
  assert.equal(wordScore('малина'), 6 + 2);
  assert.equal(wordScore('Ав-стри-я'), 7 + 2, 'дефисы деления не считаются');
  assert.equal(wordScore('мороженое'), 9 + 6);
  assert.ok(wordScore('обезьяна') > wordScore('жираф'));
});

test('постоянные режимов', () => {
  assert.deepEqual(MODES, ['classic', 'timed']);
  assert.equal(TIMED_SECONDS, 45);
  assert.ok(TIMED_BOARD >= 4 && TIMED_BOARD <= 6);
  assert.ok(MAX_PIECE >= 5);
  assert.ok(HINT_PENALTY > 0);
});

test('темы открываются звёздами: три сразу, дальше — по звезде на тему', () => {
  assert.equal(OPEN_AT_START, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(starsToOpen), [0, 0, 0, 1, 2, 8]);
  const p = emptyProgress();
  assert.ok(isOpen(0, p) && isOpen(2, p));
  assert.ok(!isOpen(3, p));
  p.stars.a = 1;
  assert.ok(isOpen(3, p) && !isOpen(4, p));
  p.stars.b = 3;
  assert.equal(totalStars(p), 4);
  assert.ok(isOpen(6, p) && !isOpen(7, p));
  // на одну звезду за тему открываются все 56 тем
  const all = emptyProgress();
  for (let i = 0; i < 56; i++) {
    assert.ok(isOpen(i, all), `тема ${i} закрыта, хотя все прежние пройдены`);
    all.stars[`t${i}`] = 1;
  }
});

test('итог «Классики»: звёзды только растут, время — лучшее', () => {
  const p = emptyProgress();
  assert.deepEqual(recordClassic(p, 'fruits', 50000, 2), { stars: 2, best: true, more: true });
  assert.deepEqual(p, { stars: { fruits: 2 }, time: { fruits: 50000 }, timed: {} });
  assert.deepEqual(recordClassic(p, 'fruits', 70000, 1), { stars: 1, best: false, more: false });
  assert.deepEqual(p.stars, { fruits: 2 });
  assert.equal(p.time.fruits, 50000);
  assert.deepEqual(recordClassic(p, 'fruits', 30000.4, 3), { stars: 3, best: true, more: true });
  assert.deepEqual(p, { stars: { fruits: 3 }, time: { fruits: 30000 }, timed: {} });
  recordClassic(p, 'pets', 0, 3);
  assert.equal(p.time.pets, 1, 'время — положительное целое');
  assert.ok(isValidProgress(p));
});

test('итог «На время»: рекорд темы', () => {
  const p = emptyProgress();
  assert.equal(recordTimed(p, 'fruits', 0), false);
  assert.deepEqual(p.timed, {});
  assert.equal(recordTimed(p, 'fruits', 40), true);
  assert.equal(recordTimed(p, 'fruits', 40), false);
  assert.equal(recordTimed(p, 'fruits', 12), false);
  assert.equal(recordTimed(p, 'fruits', 41), true);
  assert.deepEqual(p.timed, { fruits: 41 });
  assert.ok(isValidProgress(p));
});

test('прогресс: мусор чистится, лишние темы отбрасываются', () => {
  assert.deepEqual(migrateProgress(null), emptyProgress());
  assert.deepEqual(migrateProgress('мусор'), emptyProgress());
  assert.deepEqual(migrateProgress({ stars: { fruits: 9, pets: -1, 'Плохой id': 2, sea: 2.5, home: 1 }, time: { fruits: 1e12, pets: 'x' }, timed: { fruits: 5000, sea: 0 } }),
    { stars: { fruits: 3, home: 1 }, time: { fruits: 36e5 }, timed: { fruits: 999 } });
  assert.deepEqual(migrateProgress({ stars: { fruits: 2, gone: 3 }, time: { gone: 5 }, timed: { gone: 5 } }, ['fruits']),
    { stars: { fruits: 2 }, time: {}, timed: {} });
  assert.ok(isValidProgress(emptyProgress()));
  assert.ok(isValidProgress({ stars: { fruits: 3 }, time: { fruits: 41000 }, timed: { pets: 77 } }));
  assert.ok(!isValidProgress({ stars: { fruits: 4 }, time: {}, timed: {} }));
  assert.ok(!isValidProgress({ stars: {} }));
  assert.ok(!isValidProgress(null));
  // запись с __proto__ ничего не ломает, а имена не из списка тем отбрасываются
  const dirty = JSON.parse('{"stars":{"__proto__":3,"constructor":2,"fruits":1},"time":{"__proto__":5},"timed":{}}');
  assert.deepEqual(migrateProgress(dirty, ['fruits']), { stars: { fruits: 1 }, time: {}, timed: {} });
  assert.ok(!Object.keys(migrateProgress(dirty).stars).includes('__proto__'));
  assert.equal(Object.getPrototypeOf(migrateProgress(dirty).stars), Object.prototype);
});

test('статистика: только целые неотрицательные счётчики', () => {
  assert.deepEqual(emptyStats(), { words: 0, levels: 0, runs: 0, hints: 0 });
  assert.deepEqual(migrateStats({ words: 5, levels: -1, runs: 2.5, hints: '3', extra: 9 }), { words: 5, levels: 0, runs: 0, hints: 0 });
  assert.deepEqual(migrateStats(undefined), emptyStats());
  assert.ok(isValidStats({ words: 5, levels: 1, runs: 0, hints: 2 }));
  assert.ok(!isValidStats({ words: 5 }));
  assert.ok(!isValidStats({ words: 5, levels: 1, runs: 0, hints: -2 }));
});

test('начатый уровень: годится только целый и из слов своей темы', () => {
  const topics = [{ id: 'berries', words: ['малина', 'вишня', 'арбуз', 'Ав-стри-я'] }];
  const run = { v: 1, topic: 'berries', words: ['малина', 'вишня', 'арбуз'], found: ['вишня'], ms: 12000, hints: 1 };
  assert.ok(isValidRun(run, topics));
  assert.ok(isValidRun({ ...run, found: [] }, topics));
  assert.ok(isValidRun({ ...run, words: ['малина', 'Ав-стри-я'], found: ['австрия'] }, topics));
  for (const bad of [
    null, 'x', { ...run, v: 2 }, { ...run, topic: 'нет' }, { ...run, words: ['малина'] }, { ...run, words: ['малина', 'груша'] },
    { ...run, words: ['малина', 'малина', 'вишня'] }, { ...run, words: 'малина' }, { ...run, found: ['груша'] },
    { ...run, found: ['вишня', 'вишня'] }, { ...run, found: ['малина', 'вишня', 'арбуз'] }, { ...run, found: null },
    { ...run, ms: -1 }, { ...run, ms: NaN }, { ...run, ms: 1e9 }, { ...run, hints: 1.5 }, { ...run, hints: -1 }, { ...run, hints: 1000 },
    { ...run, words: [1, 2, 3] },
  ]) assert.ok(!isValidRun(bad, topics), JSON.stringify(bad));
});

test('подписи: время и склонения', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(9999), '0:09');
  assert.equal(formatTime(61000), '1:01');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(formatTime(600000), '10:00');
  const f = ['слово', 'слова', 'слов'];
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111, 101].map((n) => plural(n, f)),
    ['слово', 'слова', 'слов', 'слов', 'слов', 'слово', 'слова', 'слов', 'слов', 'слово']);
});
