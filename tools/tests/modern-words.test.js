// Современные слова для словесных игр (tools/modern-words.mjs): добавки к словарям собраны из текущих списков,
// в них нет грубого, каждое слово годится своей игре и не повторяет то, что в её словаре уже есть.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KNOWN, RARE, WORDLE_FORMS, build, lists } from '../modern-words.mjs';
import { RUDE, AVOID } from '../word-circle-words.mjs';
import { createDictionary, joinWords as joinBoggle, generatePuzzle, lineWords } from '../../games/boggle/logic.js';
import { createDict, joinWords as joinErudit } from '../../games/erudit/engine.js';
import { joinDict, checkGuess, newBoard } from '../../games/wordle/logic.js';
import { LANGUAGES } from '../../games/wordle/languages.js';
import { withExtra, check, canCompose, target } from '../../games/words/logic.js';

const root = new URL('../../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const { all, known } = lists();
const boggle = { main: read('games/boggle/words/ru.json'), extra: read('games/boggle/words/ru-modern.json') };
const erudit = { main: read('games/erudit/words/ru.json'), extra: read('games/erudit/words/ru-modern.json') };
const wordle = { main: read('games/wordle/words/ru.json'), extra: read('games/wordle/words/ru-modern.json') };
const words = { main: read('games/words/levels.json'), extra: read('games/words/modern.json') };

function rngOf(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('файлы добавок собраны из текущих списков', () => {
  for (const [path, text] of build()) {
    assert.equal(readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n'), text, `${path} устарел — пересоберите: node tools/modern-words.mjs`);
  }
});

test('списки: слова строчными русскими буквами, без ё и дефисов, известные входят во все', () => {
  assert.ok(all.length >= 850, String(all.length));
  assert.ok(known.length >= 350, String(known.length));
  for (const w of all) assert.match(w, /^[а-я]{3,15}$/, w);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), all);
  const everything = new Set(all);
  for (const w of known) assert.ok(everything.has(w), w);
  for (const w of [...KNOWN, ...RARE, ...WORDLE_FORMS]) assert.match(w, /^[а-яё]+$/, `в списке лишний знак: ${w}`);
});

test('списки: то, ради чего всё затевалось, на месте', () => {
  for (const w of ['сервер', 'чит', 'сайт', 'блог', 'чат', 'лайк', 'мем', 'селфи', 'дрон', 'интернет', 'смартфон', 'ноутбук', 'офис', 'бренд', 'интерфейс', 'читер']) {
    assert.ok(known.includes(w), `нет среди известных: ${w}`);
  }
  for (const w of ['нейросеть', 'блокчейн', 'стартапер', 'буллинг', 'коворкинг', 'респаун', 'фреймворк']) assert.ok(all.includes(w), w);
});

test('списки: грубого нет вовсе, мрачного нет среди слов, которые загадываются', () => {
  const rude = new Set(RUDE.map((w) => w.replace(/ё/g, 'е')));
  const avoid = new Set(AVOID.map((w) => w.replace(/ё/g, 'е')));
  for (const w of all) assert.ok(!rude.has(w), w);
  for (const w of known) assert.ok(!avoid.has(w), w);
});

test('Филворд: добавка — новые слова в 3–9 букв без «ъ»; слова для поля есть в словаре', () => {
  const { main, extra } = boggle;
  const have = new Set(main.words);
  const bank = new Set(main.common);
  assert.ok(extra.words.length >= 500 && extra.common.length >= 250, `${extra.words.length} / ${extra.common.length}`);
  for (const w of extra.words) {
    assert.match(w, /^[а-я]{3,9}$/, w);
    assert.ok(!w.includes('ъ') && !have.has(w), w);
    assert.ok(all.includes(w), w);
  }
  const whole = new Set([...main.words, ...extra.words]);
  for (const w of extra.common) {
    assert.ok(!bank.has(w), `уже есть в словах для поля: ${w}`);
    assert.ok(whole.has(w) && known.includes(w), w);
    assert.ok(w.length >= 3 && w.length <= 9, w);
  }
  assert.deepEqual([...extra.words].sort(), extra.words);
  assert.deepEqual([...extra.common].sort(), extra.common);
});

test('Филворд: со словарём-добавкой «сервер» — слово, поля собираются, и новые слова на них попадают', () => {
  const { main, extra } = boggle;
  const plain = createDictionary(main.words, main.common);
  const dict = createDictionary(joinBoggle(main.words, extra.words), joinBoggle(main.common, extra.common));
  assert.ok(!plain.set.has('сервер') && dict.set.has('сервер') && dict.set.has('чит'));
  assert.equal(dict.sorted.length, main.words.length + extra.words.length);
  assert.equal(dict.common.length, main.common.length + extra.common.length);
  assert.equal(joinBoggle(main.words, null), main.words);
  assert.equal(joinBoggle(main.words, undefined), main.words);
  assert.equal(joinBoggle(main.words, []), main.words);
  const fresh = new Set(extra.common);
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const puzzle = generatePuzzle(8, dict, rngOf(seed));
    assert.equal(puzzle.bank.length, 12);
    for (const b of puzzle.bank) assert.ok(dict.set.has(b.word), b.word);
    seen += puzzle.bank.filter((b) => fresh.has(b.word)).length;
    assert.ok(lineWords(puzzle.grid, 8, dict).size >= 12);
  }
  assert.ok(seen >= 20, `за 40 полей новых слов на поле: ${seen}`);
});

test('Эрудит: добавка — новые слова в 3–15 букв; со словарём-добавкой их можно выложить', () => {
  const { main, extra } = erudit;
  const have = new Set(main.words);
  assert.ok(extra.words.length >= 700 && extra.common.length >= 300, `${extra.words.length} / ${extra.common.length}`);
  for (const w of extra.words) {
    assert.match(w, /^[а-я]{3,15}$/, w);
    assert.ok(!have.has(w) && all.includes(w), w);
  }
  const bank = new Set(main.common);
  const whole = new Set([...main.words, ...extra.words]);
  for (const w of extra.common) assert.ok(!bank.has(w) && whole.has(w) && known.includes(w), w);
  const plain = createDict(main.words, main.common);
  const dict = createDict(joinErudit(main.words, extra.words), joinErudit(main.common, extra.common));
  assert.equal(dict.size, main.words.length + extra.words.length);
  for (const w of ['сервер', 'чит', 'интернет', 'электросамокат', 'криптовалюта']) {
    assert.ok(!plain.isWord(w), `${w} уже был в словаре`);
    assert.ok(dict.isWord(w), w);
  }
  assert.ok(dict.isCommon('сервер') && !dict.isCommon('респаун'));
  assert.ok(dict.isWord('кошка') && dict.isCommon('кошка'), 'старые слова на месте');
  assert.ok(!dict.isWord('серве') && !dict.isWord('серверр'));
  assert.equal(joinErudit(main.words, null), main.words);
});

test('Wordle: добавка — пятибуквенные слова, которые набираются на русской клавиатуре игры', () => {
  const { main, extra } = wordle;
  const keys = new Set(LANGUAGES.ru.rows.join(''));
  const answersHave = new Set(main.answers);
  const allowedHave = new Set([...main.answers, ...main.allowed]);
  assert.ok(extra.answers.length >= 40 && extra.allowed.length >= 30, `${extra.answers.length} / ${extra.allowed.length}`);
  for (const w of [...extra.answers, ...extra.allowed]) {
    assert.equal(w.length, 5, w);
    assert.ok([...w].every((ch) => keys.has(ch)), w);
  }
  for (const w of extra.answers) assert.ok(!answersHave.has(w) && known.includes(w), w);
  for (const w of extra.allowed) assert.ok(!allowedHave.has(w) && !extra.answers.includes(w), w);
  assert.equal(new Set([...extra.answers, ...extra.allowed]).size, extra.answers.length + extra.allowed.length);
  assert.ok(extra.answers.includes('селфи') && extra.answers.includes('логин') && extra.answers.includes('читер'));
  // формы слов: «сайты» и «блоги» в словаре игры уже были, «дроны» и «фейки» — добавлены
  assert.ok(allowedHave.has('сайты') && allowedHave.has('блоги'));
  assert.ok(extra.allowed.includes('дроны') && extra.allowed.includes('фейки'));
});

test('Wordle: словарь с добавкой — новые слова загадываются и принимаются, без добавки всё по-старому', () => {
  const { main, extra } = wordle;
  const plain = joinDict(main);
  assert.equal(plain.answers, main.answers);
  assert.equal(plain.allowed.size, new Set([...main.answers, ...main.allowed]).size);
  assert.ok(!plain.allowed.has('селфи'));
  const dict = joinDict(main, extra);
  assert.equal(dict.answers.length, main.answers.length + extra.answers.length);
  // часть новых загадок раньше принималась только как догадка — в словаре они не задваиваются
  assert.equal(dict.allowed.size, new Set([...plain.allowed, ...extra.answers, ...extra.allowed]).size);
  assert.ok(dict.allowed.size >= plain.allowed.size + extra.allowed.length + 15);
  for (const w of [...extra.answers, ...extra.allowed]) assert.ok(dict.allowed.has(w), w);
  const board = newBoard(dict.answers, () => 0.9999);
  assert.equal(board.secret, extra.answers[extra.answers.length - 1], 'новые слова — в конце списка загадок');
  assert.equal(checkGuess(board, 'селфи', dict.allowed), null);
  assert.equal(checkGuess(board, 'сайты', dict.allowed), null);
  assert.equal(checkGuess(board, 'селфи', plain.allowed), 'unknown');
  // битая добавка не ломает словарь
  for (const bad of [null, undefined, {}, { answers: 'x' }, { answers: [], allowed: null }]) {
    assert.equal(joinDict(main, bad).allowed.size, plain.allowed.size);
  }
});

test('Слова из слова: добавка — по списку на уровень, слова складываются из букв уровня и в нём новые', () => {
  const { main, extra } = words;
  assert.equal(extra.length, main.length);
  let total = 0;
  extra.forEach((list, i) => {
    const level = main[i];
    assert.ok(Array.isArray(list));
    assert.deepEqual([...list].sort(), list);
    for (const w of list) {
      assert.match(w, /^[а-я]{3,9}$/, w);
      assert.ok(canCompose(w, level.word), `уровень ${i + 1}: «${w}» не складывается из «${level.word}»`);
      assert.ok(w !== level.word && !level.common.includes(w) && !level.rare.includes(w), `уровень ${i + 1}: ${w}`);
      assert.ok(all.includes(w), w);
    }
    total += list.length;
  });
  assert.ok(total >= 200, String(total));
  assert.ok(extra[main.findIndex((l) => l.word === 'личность')].includes('чит'));
});

test('Слова из слова: с добавкой новые слова — редкие, обычные слова и пороги уровней не меняются', () => {
  const { main, extra } = words;
  const levels = withExtra(main, extra);
  assert.equal(levels.length, main.length);
  levels.forEach((level, i) => {
    assert.equal(level.word, main[i].word);
    assert.equal(level.common, main[i].common, 'обычные слова те же');
    assert.equal(target(level), target(main[i]));
    assert.equal(level.rare.length, main[i].rare.length + extra[i].length);
    assert.equal(new Set(level.rare).size, level.rare.length);
  });
  const i = main.findIndex((l) => l.word === 'личность');
  assert.equal(check(main[i], 'чит', []), 'unknown');
  assert.equal(check(levels[i], 'чит', []), 'rare');
  assert.equal(check(levels[i], 'чит', ['чит']), 'found');
  // без добавки и с битой добавкой — уровни как есть
  assert.equal(withExtra(main, null), main);
  assert.equal(withExtra(main, undefined), main);
  assert.equal(withExtra(main, 'мусор'), main);
  const partly = withExtra(main, [['чит', 5, main[0].word, main[0].common[0]]]);
  assert.deepEqual(partly[0].rare, [...main[0].rare, 'чит'], 'не строки, само слово уровня и уже известные слова отброшены');
  assert.equal(partly[1], main[1]);
});
