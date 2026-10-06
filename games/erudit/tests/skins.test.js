// Скины поля «Эрудита»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого скина).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const VARS = [
  '--er-cell', '--er-frame', '--er-center', '--er-accent', '--er-accent-text',
  '--er-tile', '--er-tile-fresh', '--er-tile-edge', '--er-tile-ink', '--er-star', '--er-last',
  '--er-p-d', '--er-p-t', '--er-p-2', '--er-p-3', '--er-mark',
];

/** Тело правила с данным селектором. */
function block(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `нет правила ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

test('скины: первый — «По умолчанию», у каждого своё название', () => {
  assert.equal(SKINS[0], 'telegram');
  assert.ok(SKINS.length >= 4);
  assert.equal(new Set(SKINS).size, SKINS.length);
  const names = js.match(/skins: \{(.*?)\}/)[1];
  for (const id of SKINS) assert.match(names, new RegExp(`${id}: '[^']+'`), id);
  assert.match(names, /telegram: 'По умолчанию'/);
});

test('скины: палитра каждого задаёт все цвета поля, премий и фишек — и для образца в настройках', () => {
  const base = block('[data-game="erudit"], [data-game="erudit"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию поле — из цветов темы
  assert.match(base, /--er-cell: [^;]*var\(--tg-theme-/);
  assert.match(base, /--er-accent: var\(--tg-theme-button-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="erudit"][data-skin="${id}"], [data-game="erudit"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: тёмные цвета темы не перебивают выбранный скин', () => {
  // правило тёмной темы относится только к скину по умолчанию
  const dark = css.match(/:root\[data-theme="dark"\] \[data-game="erudit"\][^{]*\{[^}]*--er-p-d/g) ?? [];
  assert.equal(dark.length, 1);
  assert.match(dark[0], /\[data-skin="telegram"\]/);
  assert.ok(!/:root\[data-theme="dark"\] \[data-game="erudit"\] \{[^}]*--er-(tile|p-|cell)/.test(css));
});
