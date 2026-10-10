// Оформления «Прыгалки вверх»: у каждого есть название и полная палитра в game.css (иначе цвет «протёк» бы из
// другого); холст читает ровно эти цвета; игровые цвета скина «По умолчанию» заданы для обеих тем.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
const render = readFileSync(new URL('../render.js', import.meta.url), 'utf8');
const art = readFileSync(new URL('../art.js', import.meta.url), 'utf8');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const KEYS = render.match(/export const PALETTE_KEYS = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
const UI = ['--ju-bg', '--ju-text', '--ju-hint', '--ju-panel', '--ju-accent', '--ju-accent-text'];
// игровые цвета: в скине «По умолчанию» от темы не зависят и заданы для светлой и тёмной отдельно
const GAME = ['margin', 'blot', 'red', 'red2', 'green', 'green2', 'blue', 'violet', 'yellow', 'pink', 'wood', 'metal', 'hole', 'eye', 'pupil'];
const VARS = [...UI, ...KEYS.map((k) => `--ju-${k}`)];

/** Тело правила с данным селектором. */
function block(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `нет правила ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}
const skinRule = (id) => block(`[data-game="jump-up"][data-skin="${id}"], [data-game="jump-up"] [data-skin="${id}"]`);
const hex = (body, v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1];
const light = (color) => {
  const n = parseInt(color.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

test('скины: первый — «По умолчанию», у каждого своё название', () => {
  assert.equal(SKINS[0], 'telegram');
  assert.ok(SKINS.length >= 5);
  assert.equal(new Set(SKINS).size, SKINS.length);
  const names = js.match(/skins: \{(.*?)\}/)[1];
  for (const id of SKINS) assert.match(names, new RegExp(`${id}: '[^']+'`), id);
  assert.match(names, /telegram: 'По умолчанию'/);
});

test('холст рисует только цветами палитры — и все они есть в каждом скине', () => {
  assert.ok(KEYS.length >= 20);
  const used = new Set([...`${render}\n${art}`.matchAll(/pal\.([a-z0-9]+)/g)].map((m) => m[1]));
  for (const k of used) assert.ok(KEYS.includes(k), `в рисунках цвет pal.${k}, которого нет в палитре`);
  for (const k of KEYS) assert.ok(used.has(k), `цвет ${k} в палитре не нужен — нигде не рисуется`);
});

test('скины: палитра каждого полная и своя; «По умолчанию» — из цветов темы', () => {
  const base = block('[data-game="jump-up"], [data-game="jump-up"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  assert.match(base, /--ju-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--ju-paper: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--ju-text: var\(--tg-theme-text-color\)/);
  assert.match(base, /--ju-ink: var\(--tg-theme-text-color\)/);
  assert.match(base, /--ju-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--ju-panel: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--ju-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--ju-accent-text: var\(--tg-theme-button-text-color\)/);
  assert.match(base, /--ju-hero: var\(--tg-theme-button-color\)/);
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
    for (const v of VARS) assert.ok(hex(body, v), `${id}: ${v} — шестнадцатеричный цвет`);
  }
});

test('игровые цвета «По умолчанию» заданы для обеих тем, и тёмная тема не перебивает выбранный скин', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="jump-up"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.equal(dark.length, 1);
  for (const k of GAME) assert.ok(dark[0].includes(`--ju-${k}:`), `тёмная тема: --ju-${k}`);
  const base = block('[data-game="jump-up"], [data-game="jump-up"] [data-skin="telegram"]');
  for (const k of GAME) assert.ok(hex(base, `--ju-${k}`), `светлая тема: --ju-${k} — свой цвет, не от темы`);
  const selectors = dark[0].slice(0, dark[0].indexOf('{')).split(',').map((s) => s.trim());
  for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужой скин: ${s}`);
});

test('в каждой палитре всё видно: ручка, каракуля, клякса и двойка не сливаются с листом', () => {
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    const c = (k) => hex(body, `--ju-${k}`);
    const paper = light(c('paper'));
    for (const k of ['ink', 'hero', 'blot', 'red', 'dark']) {
      assert.ok(Math.abs(light(c(k)) - paper) > 0.22, `${id}: ${k} ${c(k)} на листе ${c('paper')}`);
    }
    // клетка и поля — видны, но не спорят с рисунком
    assert.notEqual(c('grid'), c('paper'), `${id}: клетки не видно`);
    assert.ok(Math.abs(light(c('grid')) - paper) < 0.2, `${id}: клетка слишком яркая`);
    // глаза каракули видны на ней, зрачок — на глазу
    assert.ok(Math.abs(light(c('eye')) - light(c('hero'))) > 0.3, `${id}: глаза на каракуле`);
    assert.ok(Math.abs(light(c('pupil')) - light(c('eye'))) > 0.5, `${id}: зрачки`);
    // дырка темнее листа — или хотя бы заметно другая
    assert.ok(Math.abs(light(c('hole')) - paper) > 0.05, `${id}: дырка`);
    assert.equal(c('bg'), c('paper'), `${id}: фон вокруг листа — того же цвета`);
    assert.ok(Math.abs(light(c('text')) - light(c('bg'))) > 0.45, `${id}: текст шапки`);
    assert.ok(Math.abs(light(c('accent-text')) - light(c('accent'))) > 0.45, `${id}: надпись на кнопке`);
  }
});

test('образец скина в настройках берёт цвета скина', () => {
  for (const [cls, v] of [['ju-sw-paper', 'paper'], ['ju-sw-grid', 'grid'], ['ju-sw-margin', 'margin'], ['ju-sw-plat', 'green'], ['ju-sw-hero', 'hero'],
    ['ju-sw-eye', 'eye'], ['ju-sw-blot', 'blot']]) {
    assert.ok(js.includes(`class="${cls}"`), cls);
    assert.match(block(`[data-game="jump-up"] .${cls}`), new RegExp(`var\\(--ju-${v}\\)`));
  }
  assert.match(js, /'data-skin': id/);
});

test('правила интерфейса: корень изолирован, слои невысокие, обводки текста нет, «уменьшить движение» — ровно 0s', () => {
  assert.match(block('[data-game="jump-up"] .ju'), /isolation: isolate;/);
  for (const m of css.matchAll(/z-index: (\d+)/g)) assert.ok(Number(m[1]) <= 10, `z-index ${m[1]}`);
  assert.ok(!css.includes('-webkit-text-stroke'));
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /transition-duration: 0s !important/);
  assert.match(reduce, /animation: none/);
  assert.match(block('[data-game="jump-up"] .ju-stage'), /touch-action: none;/);
  assert.match(block('.game-root[data-game="jump-up"]'), /-webkit-touch-callout: none;/);
  // цвета в стилях интерфейса — только переменные (палитры — выше, в правилах скинов)
  const layout = css.slice(css.indexOf('/* ---------- раскладка ---------- */'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(layout), 'в раскладке — конкретный цвет');
  // в кадре — без теней и градиентов: всё готовыми картинками
  assert.ok(!/shadowBlur|createLinearGradient|createRadialGradient|'lighter'/.test(render));
});
