import test from 'node:test';
import assert from 'node:assert/strict';

import { PERKS } from '../perks.js';
import { PERKS as SERVER_PERKS } from '../../server/lib.js';
import { PERK_SKINS as SUDOKU_PERK_SKINS, SKINS as SUDOKU_SKINS, normalizeSettings } from '../../games/sudoku/logic.js';

test('особые скины: список в приложении совпадает с серверным (выдаёт сервер, показывает приложение)', () => {
  assert.deepEqual(PERKS, SERVER_PERKS);
});

test('особые скины игр — из общего списка, и сохранённый особый скин не теряется при чтении настроек', () => {
  for (const id of SUDOKU_PERK_SKINS) {
    assert.ok(PERKS[id], `${id} есть в shell/perks.js`);
    assert.ok(SUDOKU_SKINS.includes(id));
    assert.equal(normalizeSettings({ skin: id }).skin, id, 'доступ проверяет игра по api.perk, а не чтение настроек');
  }
});
