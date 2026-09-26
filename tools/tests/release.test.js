import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { clearBetaList, removeBetaEntries, unflagGames, unflagServerBeta, devlog } from '../release.js';

const SAMPLE = `export const BETA = [
  // >>> список беты (tools/release.js очищает всё между этими строками)
  { id: 'chess', kind: 'game', title: 'Шахматы', note: 'против бота', since: '2026-09-26' },
  {
    id: 'rating', kind: 'feature', title: 'Рейтинг', note: 'таблица лидеров',
  },
  // <<< конец списка беты
];
`;

test('релиз очищает список беты, метки остаются — следующий релиз найдёт их снова', () => {
  const out = clearBetaList(SAMPLE);
  assert.ok(!out.includes('chess') && !out.includes('rating'));
  assert.ok(out.includes('// >>> список беты') && out.includes('// <<< конец списка беты'));
  assert.equal(clearBetaList(out), out, 'повторный релиз ничего не ломает');
  // настоящий файл — с метками
  assert.doesNotThrow(() => clearBetaList(readFileSync(new URL('../../shell/beta.js', import.meta.url), 'utf8')));
  assert.throws(() => clearBetaList('export const BETA = [];'), /метки/);
});

test('релиз снимает beta: true только с выходящих игр бота', () => {
  const lib = [
    "  { id: 'chess', title: 'Шахматы', emoji: '♟', about: 'против бота', beta: true },",
    "  { id: 'go', title: 'Го', emoji: '⚪', about: 'позже', beta: true },",
    "  { id: 'sudoku', title: 'Судоку', emoji: '🧩', about: 'классика' },",
  ].join('\n');
  const out = unflagGames(lib, ['chess']);
  assert.ok(out.split('\n')[0].endsWith("about: 'против бота' },"), 'у шахмат пометки нет');
  assert.ok(out.split('\n')[1].includes('beta: true'), 'у го осталась');
  assert.equal(out.split('\n')[2], lib.split('\n')[2]);
});

test('черновик девлога — команда /broadcast, игры и функции отдельно, с маленьких букв', () => {
  const text = devlog([
    { id: 'chess', kind: 'game', title: 'Шахматы', note: 'против бота, 5 уровней' },
    { id: 'rating', kind: 'feature', title: 'Рейтинг', note: 'таблица лидеров по каждой игре' },
  ], new Date(2026, 8, 26));
  assert.equal(text, [
    '/broadcast обновление 26.09',
    '',
    'новые игры',
    '- шахматы: против бота, 5 уровней',
    '',
    'новое',
    '- рейтинг: таблица лидеров по каждой игре',
  ].join('\n'));
});

test('релиз убирает выпущенные id из серверной беты, остальные остаются', () => {
  const lib = [
    'export const SERVER_BETA = [',
    '  // >>> серверная бета',
    "  'feedback',",
    "  'duels',",
    '  // <<< конец серверной беты',
    '];',
  ].join('\n');
  const out = unflagServerBeta(lib, ['feedback', 'rating']);
  assert.ok(!out.includes("'feedback'"));
  assert.ok(out.includes("'duels'"));
  assert.ok(out.includes('>>> серверная бета') && out.includes('<<< конец серверной беты'));
  // настоящий lib.js — с метками
  const real = readFileSync(new URL('../../server/lib.js', import.meta.url), 'utf8');
  assert.ok(/>>> серверная бета[\s\S]*<<< конец серверной беты/.test(real));
});


test('частичный релиз (--only) убирает из беты только эти записи, остальные остаются и читаются', async () => {
  // образец в том же виде, что shell/beta.js (настоящий список после релиза пустой)
  const real = `export const BETA = [
  // >>> список беты (tools/release.js очищает всё между этими строками)
  {
    id: 'splash',
    kind: 'feature',
    title: 'Заставка',
    note: 'змейка, «скобки» {в тексте} не мешают',
    since: '2026-09-26',
  },
  {
    id: 'chess',
    kind: 'game',
    title: 'Шахматы',
    note: 'против бота',
    since: '2026-09-27',
  },
  // <<< конец списка беты
];
`;
  const BETA = [{ id: 'splash' }, { id: 'chess' }];
  const [first, second] = BETA.map((b) => b.id);
  const next = removeBetaEntries(real, [first]);
  const load = (src) => new Function(`${src.replace(/export const /g, 'const ').replace(/export function /g, 'function ')}; return BETA;`)();
  const left = load(next).map((b) => b.id);
  assert.deepEqual(left, BETA.map((b) => b.id).filter((id) => id !== first));
  assert.ok(left.includes(second));
  assert.ok(/>>> список беты[\s\S]*<<< конец списка беты/.test(next), 'метки на месте');
  assert.equal(removeBetaEntries(real, ['нет-такого']), real, 'чужой id ничего не меняет');
});
