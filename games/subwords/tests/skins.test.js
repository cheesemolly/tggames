// Наборы цветов «Слогов»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const BUBBLES = [1, 2, 3, 4, 5, 6].map((k) => `--sw-b${k}`);
const VARS = ['--sw-bg', '--sw-ink', '--sw-hint', '--sw-panel', '--sw-accent', '--sw-accent-text', ...BUBBLES, '--sw-on', '--sw-tone'];

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

test('скины: палитра каждого задаёт фон, текст, кнопки и шесть цветов кружков — и для образца в настройках', () => {
  const base = block('[data-game="subwords"], [data-game="subwords"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию фон, текст и кнопки — из цветов темы
  assert.match(base, /--sw-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--sw-ink: var\(--tg-theme-text-color\)/);
  assert.match(base, /--sw-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--sw-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--sw-accent-text: var\(--tg-theme-button-text-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="subwords"][data-skin="${id}"], [data-game="subwords"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: кружки по умолчанию заданы для обеих тем, и тёмная тема не перебивает выбранный скин', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="subwords"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(dark.length >= 1);
  const colors = dark.find((rule) => rule.includes('--sw-b1:'));
  assert.ok(colors, 'нет цветов кружков для тёмной темы');
  for (const v of [...BUBBLES, '--sw-on', '--sw-tone']) assert.ok(colors.includes(`${v}:`), v);
  for (const rule of dark) {
    if (!/--sw-(bg|ink|hint|panel|accent|b\d|on|tone):/.test(rule)) continue;
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужой скин: ${s}`);
  }
});

test('цвета кружков — шестнадцатеричные, в палитре все шесть разные', () => {
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="subwords"][data-skin="${id}"], [data-game="subwords"] [data-skin="${id}"]`);
    const colors = BUBBLES.map((v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1]);
    assert.ok(colors.every(Boolean), `${id}: ${colors}`);
    assert.equal(new Set(colors).size, 6, id);
  }
});

test('уровень красит кружки четырьмя из шести цветов палитры', () => {
  assert.match(js, /const paletteOf = \(index\) => \[0, 1, 3, 4\]\.map\(\(k\) => `var\(--sw-b\$\{\(\(index \+ k\) % COLORS\) \+ 1\}\)`\);/);
  assert.match(js, /const COLORS = 6;/);
});
