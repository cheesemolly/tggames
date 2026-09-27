// Поля «Игры и подсказки» панели владельца: правка не должна ломать сохранение игры — игры проверяют его
// целиком и при одной ошибке молча выбрасывают всё (раздел «Панель» в заметках).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_FIELDS, fieldId, gameFieldsOf, applyGameFields } from '../admin-fields.js';
import { games } from '../registry.js';

import * as words from '../../games/words/logic.js';
import * as bubble from '../../games/bubble-shooter/logic.js';
import * as g2048 from '../../games/2048/logic.js';
import * as brick from '../../games/brick-blast/logic.js';
import * as sudoku from '../../games/sudoku/logic.js';
import * as dots from '../../games/connect-dots/logic.js';
import * as flags from '../../games/flags/logic.js';
import * as bongo from '../../games/bongo-cat/logic.js';

const rng = () => 0.42;
const id = (game, key, path) => fieldId({ game, key, path: path.split('.') });

test('поля панели: только игры из реестра, пределы — целые, id не повторяются', () => {
  const ids = new Set(games.map((g) => g.id));
  for (const f of GAME_FIELDS) {
    assert.ok(ids.has(f.game), `нет игры ${f.game}`);
    assert.ok(Number.isInteger(f.min) && Number.isInteger(f.max) && f.min <= f.max, fieldId(f));
    assert.ok(f.label, fieldId(f));
  }
  assert.equal(new Set(GAME_FIELDS.map(fieldId)).size, GAME_FIELDS.length);
});

test('поля панели: показываются только те, что есть в прогрессе; поля партии — только при начатой партии', () => {
  const data = {
    'game:words:progress': words.newProgress(),
    'game:memory:boosters': { peek: 2, magnet: 0 },
    'game:sudoku:stats': {},                       // партии нет — подсказок партии не показываем
    'game:bongo-cat:stats': { hits: 'много' },     // не число — пропускаем
  };
  const groups = gameFieldsOf(data);
  assert.deepEqual(groups.map((g) => [g.game, g.fields.map((f) => [f.label, f.value])]), [
    ['words', [['Подсказки', 5]]],
    ['memory', [['Помощник «Подглядеть»', 2], ['Помощник «Магнит»', 0]]],
  ]);
});

test('поля панели: правка — копией, только целые в пределах', () => {
  const data = { 'game:memory:boosters': { peek: 2, magnet: 1 }, other: 1 };
  const res = applyGameFields(data, { [id('memory', 'boosters', 'peek')]: ' 7 ', 'no:such:field': '5' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data['game:memory:boosters'], { peek: 7, magnet: 1 });
  assert.equal(res.data.other, 1);
  assert.deepEqual(data['game:memory:boosters'], { peek: 2, magnet: 1 }, 'исходный прогресс не тронут');
  for (const bad of ['2.5', '-1', '', 'abc', '100', '1e2', '0x10']) {
    const r = applyGameFields(data, { [id('memory', 'boosters', 'magnet')]: bad });
    assert.equal(r.ok, false, bad);
    assert.equal(r.label, 'Помощник «Магнит»');
  }
  // поля, которого в прогрессе нет, правка не заводит
  assert.equal(applyGameFields({}, { [id('memory', 'boosters', 'peek')]: '5' }).data['game:memory:boosters'], undefined);
});

test('поля панели: после правки на границах сохранения проходят проверки самих игр', () => {
  const solved = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
  const puzzle = solved.replace(/[1-4]/g, '0');
  const bank = JSON.parse(readFileSync(new URL('../../games/connect-dots/levels.json', import.meta.url), 'utf8'));
  const levels = JSON.parse(readFileSync(new URL('../../games/words/levels.json', import.meta.url), 'utf8'));
  const data = {
    'game:words:progress': words.newProgress(),
    'game:bubble-shooter:current': bubble.newLevel(3, rng),
    'game:2048:current': g2048.newGame(4, rng),
    'game:brick-blast:current': brick.newLevel(2, rng),
    'game:brick-blast:stats': brick.emptyStats(),
    'game:sudoku:current': sudoku.newGame('easy', [...puzzle].map(Number), [...solved].map(Number)),
    'game:connect-dots:current': dots.newGame(bank, rng),
    'game:flags:stats': flags.emptyStats(),
    'game:bongo-cat:stats': bongo.emptyStats(),
  };
  const checks = {
    'game:words:progress': (p) => words.isValidProgress(p, levels),
    'game:bubble-shooter:current': bubble.isValidState,
    'game:2048:current': g2048.isValidState,
    'game:brick-blast:current': brick.isValidState,
    'game:brick-blast:stats': brick.isValidStats,
    'game:sudoku:current': sudoku.isValidState,
    'game:connect-dots:current': dots.isValidState,
    'game:flags:stats': flags.isValidStats,
    'game:bongo-cat:stats': bongo.isValidStats,
  };
  for (const [key, ok] of Object.entries(checks)) assert.ok(ok(data[key]), `исходное ${key}`);
  const fields = gameFieldsOf(data).flatMap((g) => g.fields);
  assert.ok(fields.length >= 14, `полей: ${fields.length}`);
  for (const edge of ['min', 'max']) {
    const res = applyGameFields(data, Object.fromEntries(fields.map((f) => [f.id, String(f[edge])])));
    assert.equal(res.ok, true, edge);
    for (const [key, ok] of Object.entries(checks)) assert.ok(ok(res.data[key]), `${key} с ${edge}`);
  }
});
