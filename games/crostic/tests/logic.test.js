// Правила «Кростика»: разбор и проверка уровня, ввод букв, подсказка, переходы между клетками, звёзды, прогресс.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABET, HINT_COST, KEY_ROWS, MAX_ANSWER, MAX_MISTAKES, MAX_WORD, START_COINS,
  emptyProgress, emptyStats, givesAway, groupDone, groupsOf, guess, isDone, isFailed, isOpen, isValidProgress, isValidState,
  isValidStats, levelProblems, levelText, livesLeft, migrateProgress, migrateStats, newState, nextHidden, norm, numberOf,
  parseLevel, phraseLetters, phraseWords, plural, related, reveal, reward, spend, starsFor, stepCell,
} from '../logic.js';

// «Тише едешь — дальше будешь»: т и ш е д ь а л б у (10 букв); ответы закрывают все буквы, «ь» открыта сразу
const TEXT = 'Тише едешь — дальше будешь|Пословица|тишедьалбу|ь|беда=Друг познаётся в ней;шуба=Меховая зимняя одежда;лебедь=Птица из балета;диета=Режим питания';
const level = () => parseLevel(TEXT);

test('буквы: 32 клавиши в трёх рядах, ё — это е', () => {
  assert.equal(ALPHABET.length, 32);
  assert.equal(new Set(ALPHABET).size, 32);
  assert.ok(!ALPHABET.includes('ё'));
  assert.equal([...KEY_ROWS.join('')].sort().join(''), [...ALPHABET].sort().join(''));
  assert.deepEqual(KEY_ROWS.map((r) => r.length), [12, 11, 9]);
  assert.equal(norm('ЁЖИК'), 'ежик');
  assert.equal(norm(null), '');
});

test('слова фразы: знаки не занимают клеток, дефис — клетка-знак, ё становится е', () => {
  const words = phraseWords('«Слона-то я и не приметил», — сказал он: всё!');
  assert.deepEqual(words.map((w) => w.cells.map((c) => c.ch ?? c.mark).join('')), ['слона-то', 'я', 'и', 'не', 'приметил', 'сказал', 'он', 'все']);
  assert.equal(words[0].before, '«');
  assert.equal(words[0].after, '');
  assert.deepEqual(words[0].cells[5], { mark: '-' });
  assert.equal(words[4].after, '», —');
  assert.equal(words[6].after, ':');
  assert.equal(words[7].after, '!');
  assert.deepEqual(phraseWords('  '), []);
  assert.deepEqual(phraseWords('— Да!').map((w) => [w.before, w.cells.length, w.after]), [['', 2, '!']]);
});

test('разбор уровня: фраза, источник, шифр, открытые буквы, вопросы', () => {
  const lv = level();
  assert.equal(lv.phrase, 'Тише едешь — дальше будешь');
  assert.equal(lv.source, 'Пословица');
  assert.equal(lv.order, 'тишедьалбу');
  assert.equal(lv.start, 'ь');
  assert.deepEqual(lv.clues.map((c) => c.answer), ['беда', 'шуба', 'лебедь', 'диета']);
  assert.equal(lv.clues[0].text, 'Друг познаётся в ней');
  assert.equal(lv.words.length, 4);
  assert.equal(lv.words[1].after, ' —');
  assert.equal(phraseLetters(lv).join(''), 'тишеедешьдальшебудешь');
  assert.equal(numberOf(lv, 'т'), 1);
  assert.equal(numberOf(lv, 'у'), 10);
  assert.equal(numberOf(lv, 'я'), 0);
  assert.deepEqual(levelProblems(lv), []);
  // мусор не роняет разбор
  assert.deepEqual(parseLevel('').clues, []);
  assert.deepEqual(parseLevel(null).words, []);
  assert.equal(parseLevel('а|б|в|г|слово').clues[0].text, '');
});

test('группы клеток: сначала слова фразы, потом ответы', () => {
  const groups = groupsOf(level());
  assert.deepEqual(groups.map((g) => `${g.zone}${g.index}:${g.letters.join('')}`),
    ['phrase0:тише', 'phrase1:едешь', 'phrase2:дальше', 'phrase3:будешь', 'clue0:беда', 'clue1:шуба', 'clue2:лебедь', 'clue3:диета']);
  // дефис в слове фразы буквой не считается
  assert.deepEqual(groupsOf(parseLevel('Кто-то там|П|ктоам||кот=Мяу')).map((g) => g.letters.join('')), ['ктото', 'там', 'кот']);
});

test('проверка уровня ловит негодное', () => {
  const bad = (text, part) => {
    const problems = levelProblems(parseLevel(text));
    assert.ok(problems.some((p) => p.includes(part)), `ждали «${part}», получили: ${problems.join('; ') || 'ничего'}`);
  };
  bad(TEXT.replace('тишедьалбу', 'тишедьалбт'), 'повторяется в шифре');
  bad(TEXT.replace('тишедьалбу', 'тишедьалб'), 'нет в шифре');
  bad(TEXT.replace('тишедьалбу', 'тишедьалбуя'), 'лишняя буква');
  bad(TEXT.replace('|ь|', '||').replace(';лебедь=Птица из балета', ''), 'неоткуда узнать: ь');
  bad(TEXT.replace('|ь|', '|я|'), 'не из шифра');
  bad(TEXT.replace('|ь|', '|ьь|'), 'открытая буква повторяется');
  bad(TEXT.replace('|Пословица|', '||'), 'нет источника');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'шуба='), 'нет вопроса');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'шуба=Шуба из норки'), 'выдаёт ответ');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'беда=Горе'), 'ответ повторяется');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'тише=Не шуми'), 'подсказывает слово фразы');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'дальний=Не близкий'), 'подсказывает слово фразы');
  bad(TEXT.replace('шуба=Меховая зимняя одежда', 'ша=Тихо'), 'ответ не годится');
  bad(TEXT.replace('|ь|', '|ьбед|'), 'нечего отгадывать: беда');
  bad('Тише, дети|П|тишед||шее=Чья?;диете=Чему?;тест=Проба', 'меньше шести');
  bad(TEXT.split(';').slice(0, 2).join(';'), 'вопросов 2');
  bad(TEXT.replace('Тише едешь', 'Перевыполнениеплана едешь'), 'длиннее');
  bad(TEXT.replace('|ь|', '|тишедьалбу|'), 'фраза открыта сразу');
});

test('вопрос не выдаёт ответ и не подсказывает слово фразы', () => {
  assert.ok(givesAway('Густой лес', 'лес'));
  assert.ok(!givesAway('Лесной житель', 'лес'), 'короткое слово — только целиком');
  assert.ok(givesAway('Звонит на колокольне', 'колокол'));
  assert.ok(givesAway('Ёлочная игрушка', 'елочная'));
  assert.ok(!givesAway('Крупнейший левый приток Волги', 'лев'));
  assert.ok(!givesAway('12 месяцев', 'год'));
  assert.ok(related('тайна', 'тайное'));
  assert.ok(related('гусь', 'гуся'));
  assert.ok(related('дом', 'дома'));
  assert.ok(!related('друг', 'дрова'));
  assert.ok(!related('стол', 'сталь'));
  assert.ok(!related('вода', 'воробей'));
});

test('состояние уровня: новое, годное и негодное', () => {
  const lv = level();
  const st = newState(7, lv);
  assert.deepEqual(st, { v: 1, level: 7, open: 'ь', mistakes: 0, hints: 0 });
  assert.ok(isValidState(st, lv, 7));
  assert.ok(isValidState({ ...st, open: 'ьбед', mistakes: 4, hints: 2 }, lv, 7));
  for (const badState of [
    null, 'x', { ...st, v: 2 }, { ...st, level: 8 }, { ...st, open: 'бед' }, { ...st, open: 'ьь' }, { ...st, open: 'ья' }, { ...st, open: 5 },
    { ...st, open: lv.order }, { ...st, mistakes: MAX_MISTAKES }, { ...st, mistakes: -1 }, { ...st, mistakes: 1.5 }, { ...st, hints: -1 },
    { ...st, hints: 99 }, { ...st, hints: '1' },
  ]) assert.ok(!isValidState(badState, lv, 7), JSON.stringify(badState));
});

test('буква: угадал — открыта везде, ошибся — минус попытка, лишнее не считается', () => {
  const lv = level();
  const st = newState(1, lv);
  const num = (ch) => numberOf(lv, ch);
  assert.deepEqual(guess(lv, st, num('б'), 'Б'), { kind: 'hit', ch: 'б' });
  assert.ok(isOpen(st, 'б'));
  assert.equal(st.mistakes, 0);
  // та же клетка ещё раз, открытая буква под другим номером, не буква — ход не считается
  assert.deepEqual(guess(lv, st, num('б'), 'б'), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, num('е'), 'б'), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, num('е'), '7'), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, num('е'), ''), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, num('е'), 'ей'), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, 0, 'е'), { kind: 'skip' });
  assert.deepEqual(guess(lv, st, 99, 'е'), { kind: 'skip' });
  assert.equal(st.mistakes, 0);
  // ё — это е
  assert.deepEqual(guess(lv, st, num('е'), 'Ё'), { kind: 'hit', ch: 'е' });
  // ошибка
  assert.deepEqual(guess(lv, st, num('д'), 'а'), { kind: 'miss' });
  assert.equal(st.mistakes, 1);
  assert.equal(livesLeft(st), MAX_MISTAKES - 1);
  assert.ok(!isOpen(st, 'а') && !isOpen(st, 'д'));
  assert.equal(st.open, 'ьбе');
});

test('пять ошибок — уровень провален, дальше ввод не принимается', () => {
  const lv = level();
  const st = newState(1, lv);
  for (let k = 0; k < MAX_MISTAKES; k++) {
    assert.ok(!isFailed(st));
    assert.deepEqual(guess(lv, st, 1, 'я'), { kind: 'miss' });
  }
  assert.ok(isFailed(st));
  assert.equal(livesLeft(st), 0);
  assert.deepEqual(guess(lv, st, 1, 'т'), { kind: 'skip' });
  assert.equal(reveal(lv, st, 1), null);
  assert.equal(st.open, 'ь');
  assert.ok(!isValidState(st, lv, 1), 'проваленный уровень не продолжают');
});

test('подсказка открывает букву номера и считается', () => {
  const lv = level();
  const st = newState(1, lv);
  assert.equal(reveal(lv, st, 1), 'т');
  assert.equal(st.hints, 1);
  assert.equal(reveal(lv, st, 1), null, 'уже открыта');
  assert.equal(reveal(lv, st, 0), null);
  assert.equal(st.hints, 1);
  assert.equal(st.mistakes, 0);
});

test('ответы на вопросы открывают всю фразу', () => {
  const lv = level();
  const st = newState(1, lv);
  const groups = groupsOf(lv);
  for (const g of groups.filter((x) => x.zone === 'clue')) {
    for (const ch of g.letters) guess(lv, st, numberOf(lv, ch), ch);
    assert.ok(groupDone(g, st));
  }
  assert.ok(isDone(lv, st));
  assert.ok(groups.every((g) => groupDone(g, st)));
  assert.equal(st.mistakes, 0);
  assert.equal(new Set(st.open).size, lv.order.length);
});

test('следующая закрытая клетка: в том же слове по кругу, потом в следующих вопросах, потом во фразе', () => {
  const lv = level();
  const groups = groupsOf(lv);
  const st = newState(1, lv);
  // начало уровня — первый вопрос, первая закрытая клетка
  assert.deepEqual(nextHidden(groups, st, null), { g: 4, i: 0 });
  assert.deepEqual(nextHidden(groups, st, { g: 4, i: 0 }), { g: 4, i: 1 });
  // «беда»: открыты б и д — после «е» идёт «а», после «а» по кругу — «е»
  st.open += 'бд';
  assert.deepEqual(nextHidden(groups, st, { g: 4, i: 1 }), { g: 4, i: 3 });
  assert.deepEqual(nextHidden(groups, st, { g: 4, i: 3 }), { g: 4, i: 1 });
  // вопрос отвечен — к следующему вопросу с закрытыми клетками
  st.open += 'еа';
  assert.deepEqual(nextHidden(groups, st, { g: 4, i: 3 }), { g: 5, i: 0 });
  // последний вопрос отвечен — по кругу к первому незаконченному
  st.open += 'ти';
  assert.deepEqual(nextHidden(groups, st, { g: 7, i: 4 }), { g: 5, i: 0 });
  // во фразе — по словам фразы
  assert.deepEqual(nextHidden(groups, st, { g: 0, i: 0 }), { g: 0, i: 2 });
  st.open += 'ш';
  assert.deepEqual(nextHidden(groups, st, { g: 0, i: 2 }), { g: 2, i: 2 }, '«тише» и «едешь» открыты — дальше «дальше»');
  // все вопросы отвечены, а закрытая буква осталась только во фразе — идём во фразу
  const lone = parseLevel('Юла и дом|П|юлаидом||лад=Мир;мода=Стиль;ида=Гора');
  const g2 = groupsOf(lone);
  const s2 = { ...newState(1, lone), open: 'ладмои' };
  assert.deepEqual(nextHidden(g2, s2, { g: 3, i: 0 }), { g: 0, i: 0 });
  // закрытых не осталось
  s2.open += 'ю';
  assert.equal(nextHidden(g2, s2, { g: 0, i: 0 }), null);
  assert.equal(nextHidden(g2, s2, null), null);
});

test('стрелки: соседняя клетка по порядку на странице, по кругу', () => {
  const groups = groupsOf(level());
  assert.deepEqual(stepCell(groups, { g: 0, i: 0 }, 1), { g: 0, i: 1 });
  assert.deepEqual(stepCell(groups, { g: 0, i: 3 }, 1), { g: 1, i: 0 });
  assert.deepEqual(stepCell(groups, { g: 1, i: 0 }, -1), { g: 0, i: 3 });
  assert.deepEqual(stepCell(groups, { g: 0, i: 0 }, -1), { g: 7, i: 4 });
  assert.deepEqual(stepCell(groups, { g: 7, i: 4 }, 1), { g: 0, i: 0 });
  assert.deepEqual(stepCell(groups, null, 1), { g: 0, i: 0 });
  assert.equal(stepCell([], null, 1), null);
});

test('звёзды и монеты: чем меньше ошибок и подсказок, тем больше', () => {
  assert.equal(starsFor(0, 0), 3);
  assert.equal(starsFor(1, 0), 2);
  assert.equal(starsFor(0, 2), 2);
  assert.equal(starsFor(1, 1), 2);
  assert.equal(starsFor(2, 1), 1);
  assert.equal(starsFor(4, 9), 1);
  assert.deepEqual([1, 2, 3].map(reward), [15, 20, 25]);
  assert.equal(reward(0), 15);
  assert.equal(reward(9), 25);
  assert.ok(reward(3) > HINT_COST, 'уровень без ошибок окупает подсказку');
  assert.ok(START_COINS >= HINT_COST * 2);
});

test('уровни по номеру идут по кругу', () => {
  const list = ['а', 'б', 'в'];
  assert.equal(levelText(list, 1), 'а');
  assert.equal(levelText(list, 3), 'в');
  assert.equal(levelText(list, 4), 'а');
  assert.equal(levelText(list, 302), 'б');
  assert.equal(levelText(list, 0), 'а');
  assert.equal(levelText(list, -5), 'а');
  assert.equal(levelText(list, 2.9), 'б');
  assert.equal(levelText([], 1), '');
});

test('прогресс: уровень и монеты, мусор чистится', () => {
  assert.deepEqual(emptyProgress(), { level: 1, coins: START_COINS });
  assert.deepEqual(migrateProgress(null), emptyProgress());
  assert.deepEqual(migrateProgress({ level: 14, coins: 5 }), { level: 14, coins: 5 });
  assert.deepEqual(migrateProgress({ level: -3, coins: -1 }), emptyProgress());
  assert.deepEqual(migrateProgress({ level: 2.5, coins: 1e12, extra: 1 }), { level: 1, coins: 1e7 });
  assert.deepEqual(migrateProgress({ level: 9 }), { level: 9, coins: START_COINS });
  assert.ok(isValidProgress({ level: 3, coins: 0 }));
  assert.ok(!isValidProgress({ level: 0, coins: 0 }));
  assert.ok(!isValidProgress({ level: 3 }));
  const p = { level: 1, coins: 30 };
  assert.equal(spend(p, HINT_COST), true);
  assert.equal(p.coins, 30 - HINT_COST);
  assert.equal(spend(p, HINT_COST), false, 'не хватает');
  assert.equal(p.coins, 30 - HINT_COST);
  assert.equal(spend(p, 0), false);
  assert.equal(spend(p, -5), false);
});

test('статистика: только целые неотрицательные счётчики', () => {
  assert.deepEqual(emptyStats(), { levels: 0, perfect: 0, mistakes: 0, hints: 0, fails: 0 });
  assert.deepEqual(migrateStats({ levels: 5, perfect: -1, mistakes: 2.5, hints: '3', fails: 1, extra: 9 }), { levels: 5, perfect: 0, mistakes: 0, hints: 0, fails: 1 });
  assert.deepEqual(migrateStats(undefined), emptyStats());
  assert.ok(isValidStats({ levels: 5, perfect: 1, mistakes: 0, hints: 2, fails: 0 }));
  assert.ok(!isValidStats({ levels: 5 }));
});

test('пределы и склонения', () => {
  assert.ok(MAX_WORD >= 10 && MAX_WORD <= 12);
  assert.ok(MAX_ANSWER >= 9 && MAX_ANSWER <= 10);
  assert.equal(MAX_MISTAKES, 5);
  const f = ['ошибка', 'ошибки', 'ошибок'];
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 112].map((k) => plural(k, f)), ['ошибка', 'ошибки', 'ошибок', 'ошибок', 'ошибка', 'ошибки', 'ошибок', 'ошибок']);
});
