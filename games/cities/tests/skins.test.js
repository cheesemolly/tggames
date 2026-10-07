// Скины глобуса «Городов»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого скина).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLOBE_COLORS } from '../colors.js';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const VARS = [
  '--ct-stage-a', '--ct-stage-b', '--ct-stars', '--ct-ink', '--ct-chip', '--ct-accent', '--ct-accent-text', '--ct-bot', '--ct-bot-text',
  ...GLOBE_COLORS.map((name) => `--ct-g-${name}`),
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

test('скины: палитра каждого задаёт все цвета сцены, шара и маршрутов — и для образца в настройках', () => {
  const base = block('[data-game="cities"], [data-game="cities"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию сцена и шар — из цветов темы
  assert.match(base, /--ct-stage-b: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--ct-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--ct-g-base: [^;]*var\(--tg-theme-/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="cities"][data-skin="${id}"], [data-game="cities"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: тёмные цвета темы не перебивают выбранный скин', () => {
  // правило тёмной темы относится только к скину по умолчанию
  const dark = css.match(/:root\[data-theme="dark"\] \[data-game="cities"\][^{]*\{[^}]*--ct-g-bot/g) ?? [];
  assert.equal(dark.length, 1);
  assert.match(dark[0], /\[data-skin="telegram"\]/);
  assert.ok(!/:root\[data-theme="dark"\] \[data-game="cities"\] \{[^}]*--ct-(g-|stage|accent|bot)/.test(css));
});

test('глобус читает ровно те цвета, что задают скины', () => {
  assert.match(js, /--ct-g-\$\{key\}/);
  const used = new Set([...css.matchAll(/--ct-g-([a-z]+):/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...GLOBE_COLORS].sort());
});
