// Скины плиток «Круга слов»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const VARS = ['--wc-cell', '--wc-cell-edge', '--wc-tile', '--wc-tile-ink', '--wc-wheel', '--wc-wheel-ink', '--wc-glass', '--wc-glass-ink'];

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

test('скины: палитра каждого задаёт клетки, буквы, круг и «стекло» кнопок — и для образца в настройках', () => {
  const base = block('[data-game="word-circle"], [data-game="word-circle"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию всё — из цветов темы
  assert.match(base, /--wc-tile: var\(--tg-theme-button-color\)/);
  assert.match(base, /--wc-tile-ink: var\(--tg-theme-button-text-color\)/);
  assert.match(base, /--wc-cell: [^;]*var\(--tg-theme-bg-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="word-circle"][data-skin="${id}"], [data-game="word-circle"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: тема не перебивает выбранный скин', () => {
  assert.ok(!/:root\[data-theme="dark"\] \[data-game="word-circle"\][^{]*\{[^}]*--wc-(cell|tile|wheel|glass)/.test(css));
});

test('пейзажи в настройках: «По главам», все пейзажи и «Без пейзажа»', () => {
  assert.match(js, /const SCENE_IDS = \['auto', \.\.\.SCENES\.map\(\(s\) => s\.id\), 'none'\];/);
  assert.match(js, /sceneAuto: 'По главам'/);
  assert.match(js, /sceneNone: 'Без пейзажа'/);
});
