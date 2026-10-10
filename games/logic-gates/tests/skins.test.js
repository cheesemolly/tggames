// Оформления «Логических схем»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из
// другого); цвет тока скина «По умолчанию» задан для обеих тем; правила, на которых держится бег тока по проводу.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
const art = readFileSync(new URL('../art.js', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const GAME = ['--lg-on', '--lg-on-ink', '--lg-lamp'];
const VARS = ['--lg-bg', '--lg-panel', '--lg-ink', '--lg-hint', '--lg-line', '--lg-wire', '--lg-grid', '--lg-chip', '--lg-chip-ink',
  '--lg-fixed', '--lg-accent', '--lg-accent-text', ...GAME, '--lg-pattern', '--lg-cell'];

/** Тело правила с данным селектором. */
function block(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `нет правила ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

const skinRule = (id) => block(`[data-game="logic-gates"][data-skin="${id}"], [data-game="logic-gates"] [data-skin="${id}"]`);

test('скины: первый — «По умолчанию», у каждого своё название', () => {
  assert.equal(SKINS[0], 'telegram');
  assert.ok(SKINS.length >= 5);
  assert.equal(new Set(SKINS).size, SKINS.length);
  const names = js.match(/skins: \{(.*?)\}/)[1];
  for (const id of SKINS) assert.match(names, new RegExp(`${id}: '[^']+'`), id);
  assert.match(names, /telegram: 'По умолчанию'/);
});

test('скины: палитра каждого задаёт фон, провода, детали, цвет тока и узор — и для образца в настройках', () => {
  const base = block('[data-game="logic-gates"], [data-game="logic-gates"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  // по умолчанию фон, текст и кнопки — из цветов темы
  assert.match(base, /--lg-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--lg-panel: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--lg-ink: var\(--tg-theme-text-color\)/);
  assert.match(base, /--lg-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--lg-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--lg-accent-text: var\(--tg-theme-button-text-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
    assert.match(body, /--lg-pattern: var\(--lg-(dots|lines)\)/, `${id}: узор — точки или клетка`);
  }
});

test('цвет тока по умолчанию задан для обеих тем, и тёмная тема не перебивает выбранный скин', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="logic-gates"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(dark.length >= 1);
  const colors = dark.find((rule) => rule.includes('--lg-on:'));
  assert.ok(colors, 'нет цвета тока для тёмной темы');
  for (const v of GAME) assert.ok(colors.includes(`${v}:`), v);
  for (const rule of dark) {
    if (!/--lg-[a-z0-9-]+:/.test(rule)) continue;
    const selectors = rule.slice(0, rule.indexOf('{')).split(',').map((s) => s.trim());
    for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужой скин: ${s}`);
  }
});

test('цвет тока в каждой палитре — шестнадцатеричный и не совпадает ни с фоном, ни с погашенным проводом', () => {
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    const hex = (v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1];
    const [on, bg, wire, chipColor] = ['--lg-on', '--lg-bg', '--lg-wire', '--lg-chip'].map(hex);
    assert.ok(on && bg && wire && chipColor, `${id}: ${[on, bg, wire, chipColor]}`);
    assert.equal(new Set([on, bg, wire]).size, 3, id);
    assert.notEqual(chipColor, bg, `${id}: вентиль сливается с фоном`);
  }
});

test('бег тока: длина провода принята за единицу, штрих прячет его целиком и открывает от начала', () => {
  assert.match(art, /pathLength="1"/);
  const live = block('[data-game="logic-gates"] .lg-live, [data-game="logic-gates"] .lg-glow');
  assert.match(live, /stroke-dasharray: 1 2;/);
  assert.match(live, /stroke-dashoffset: 1;/);
  assert.match(block('[data-game="logic-gates"] .lg-live.lg-lit, [data-game="logic-gates"] .lg-glow.lg-lit'), /stroke-dashoffset: 0;/);
  assert.match(js, /\{ strokeDashoffset: 1 \}, \{ strokeDashoffset: 0 \}/);
  // подложка под проводом — цвета фона: на пересечении верхний провод разрывает нижний
  assert.match(block('[data-game="logic-gates"] .lg-case'), /stroke: var\(--lg-bg\)/);
});

test('правила интерфейса: корень изолирован, слои невысокие, обводки текста нет, «уменьшить движение» — ровно 0s', () => {
  assert.match(block('[data-game="logic-gates"] .lg'), /isolation: isolate;/);
  for (const m of css.matchAll(/z-index: (\d+)/g)) assert.ok(Number(m[1]) <= 10, `z-index ${m[1]}`);
  assert.ok(!css.includes('-webkit-text-stroke'));
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /transition-duration: 0s !important/);
  assert.match(reduce, /animation: none/);
  // части схемы стоят на местах через transform в разметке — в игре их двигают только scale и translate
  assert.ok(!/\{ transform:/.test(js), 'анимация transform сорвала бы деталь с места');
  assert.match(block('[data-game="logic-gates"] .lg-board'), /touch-action: none;/);
});
