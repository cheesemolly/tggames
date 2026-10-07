// Оформления «Кростика»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const MARKERS = [1, 2, 3, 4, 5, 6].map((k) => `--cr-m${k}`);
const VARS = ['--cr-bg', '--cr-sheet', '--cr-ink', '--cr-hint', '--cr-line', '--cr-rule', '--cr-dock', '--cr-key', '--cr-key-ink',
  '--cr-accent', '--cr-accent-text', ...MARKERS, '--cr-on', '--cr-closed'];

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

test('скины: палитра каждого задаёт фон, лист, текст, клавиши и шесть цветов клеток — и для образца в настройках', () => {
  const base = block('[data-game="crostic"], [data-game="crostic"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию фон, лист, текст и кнопки — из цветов темы
  assert.match(base, /--cr-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--cr-sheet: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--cr-ink: var\(--tg-theme-text-color\)/);
  assert.match(base, /--cr-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--cr-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--cr-accent-text: var\(--tg-theme-button-text-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="crostic"][data-skin="${id}"], [data-game="crostic"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: клетки по умолчанию заданы для обеих тем, и тёмная тема не перебивает выбранный скин', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="crostic"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(dark.length >= 1);
  const colors = dark.find((rule) => rule.includes('--cr-m1:'));
  assert.ok(colors, 'нет цветов клеток для тёмной темы');
  for (const v of [...MARKERS, '--cr-on', '--cr-closed']) assert.ok(colors.includes(`${v}:`), v);
  for (const rule of dark) {
    if (!/--cr-[a-z0-9-]+:/.test(rule)) continue;
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужой скин: ${s}`);
  }
});

test('цвета клеток — шестнадцатеричные, в палитре все шесть разные', () => {
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="crostic"][data-skin="${id}"], [data-game="crostic"] [data-skin="${id}"]`);
    const colors = MARKERS.map((v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1]);
    assert.ok(colors.every(Boolean), `${id}: ${colors}`);
    assert.equal(new Set(colors).size, 6, id);
  }
});

test('цвет клетки — по её номеру, один из шести', () => {
  assert.match(js, /const MARKERS = 6;/);
  assert.match(js, /node\.style\.setProperty\('--m', `var\(--cr-m\$\{\(\(num - 1\) % MARKERS\) \+ 1\}\)`\);/);
});

test('клавиатура: размер букв не меньше 16 px (иначе телефон увеличивает страницу), зазор клеток совпадает с расчётом', () => {
  const key = block('[data-game="crostic"] .cr-key');
  assert.match(key, /font-size: (1[6-9]|2\d)px/);
  assert.match(js, /const GAP = 2;/);
  assert.match(block('[data-game="crostic"] .cr-word'), /gap: 2px/);
  assert.match(block('[data-game="crostic"] .cr-answer'), /gap: 2px/);
});
