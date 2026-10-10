// Оформления «Алхимии»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из другого).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const MARKERS = [1, 2, 3, 4, 5, 6].map((k) => `--al-m${k}`);
const VARS = ['--al-bg', '--al-panel', '--al-tile', '--al-ink', '--al-hint', '--al-line', '--al-accent', '--al-accent-text',
  ...MARKERS, '--al-tint'];

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

test('скины: палитра каждого задаёт фон, панели, плитки, текст, кнопки и шесть цветов категорий — и для образца в настройках', () => {
  const base = block('[data-game="alchemy"], [data-game="alchemy"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию фон, панели, текст и кнопки — из цветов темы
  assert.match(base, /--al-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--al-panel: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--al-ink: var\(--tg-theme-text-color\)/);
  assert.match(base, /--al-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--al-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--al-accent-text: var\(--tg-theme-button-text-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="alchemy"][data-skin="${id}"], [data-game="alchemy"] [data-skin="${id}"]`);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
  }
});

test('скины: цвета категорий по умолчанию заданы для обеих тем, и тёмная тема не перебивает выбранный скин', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="alchemy"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(dark.length >= 1);
  const colors = dark.find((rule) => rule.includes('--al-m1:'));
  assert.ok(colors, 'нет цветов категорий для тёмной темы');
  for (const v of [...MARKERS, '--al-tint']) assert.ok(colors.includes(`${v}:`), v);
  for (const rule of dark) {
    if (!/--al-[a-z0-9-]+:/.test(rule)) continue;
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужой скин: ${s}`);
  }
});

test('цвета категорий — шестнадцатеричные, в палитре все шесть разные', () => {
  for (const id of SKINS.slice(1)) {
    const body = block(`[data-game="alchemy"][data-skin="${id}"], [data-game="alchemy"] [data-skin="${id}"]`);
    const colors = MARKERS.map((v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1]);
    assert.ok(colors.every(Boolean), `${id}: ${colors}`);
    assert.equal(new Set(colors).size, 6, id);
  }
});

test('цвет плитки — по категории элемента, один из шести', () => {
  assert.match(js, /const MARKERS = 6;/);
  assert.match(js, /node\.style\.setProperty\('--m', `var\(--al-m\$\{\(it\.cat % MARKERS\) \+ 1\}\)`\);/);
  assert.match(block('[data-game="alchemy"] .al-tile'), /background: color-mix\(in srgb, var\(--m\) var\(--al-tint\), var\(--al-tile\)\)/);
});

test('поиск: буквы в поле не меньше 16 px (иначе телефон увеличивает страницу), поле — наверху экрана', () => {
  assert.match(block('[data-game="alchemy"] .al-search-input'), /font-size: (1[6-9]|2\d)px/);
  assert.match(block('[data-game="alchemy"] .al-search'), /inset: 0/);
  assert.match(js, /onmousedown: \(e\) => e\.preventDefault\(\)/);
});

test('«уменьшить движение»: переходы ровно 0s, свечение итога не мигает', () => {
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /transition-duration: 0s !important/);
  assert.match(reduce, /\.al-res-new \.al-orb \{ animation: none; \}/);
});
