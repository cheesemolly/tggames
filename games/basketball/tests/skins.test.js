// Площадки «Баскетбола»: у каждой есть название и полная палитра в game.css (иначе цвет «протёк» бы из другой);
// холст и мяч берут ровно эти цвета; игровые цвета площадки «По умолчанию» заданы для обеих тем.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../art.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const js = read('index.js');
const css = read('game.css');
const render = read('render.js');
const ball = read('ball.js');
const scenes = read('scenes.js');

const SKINS = js.match(/const SKINS = \[(.*?)\];/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const KEYS = render.match(/export const PALETTE_KEYS = \[([^\]]*)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
const UI = ['--bk-bg', '--bk-text', '--bk-hint', '--bk-panel', '--bk-accent', '--bk-accent-text'];
// игровые цвета: у площадки «По умолчанию» от темы не зависят и заданы для светлой и тёмной отдельно
const GAME = ['ball', 'ball2', 'ball3', 'ball4', 'gloss', 'fire1', 'fire2', 'fire3', 'hot1', 'hot2', 'hot3', 'smoke', 'spark'];
const SCENE = KEYS.slice(0, KEYS.indexOf('ghost'));
const VARS = [...UI, ...KEYS.map((k) => `--bk-${k}`)];

/** Тело правила с данным селектором. */
function block(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `нет правила ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}
const skinRule = (id) => block(`[data-game="basketball"][data-skin="${id}"], [data-game="basketball"] [data-skin="${id}"]`);
const hex = (body, v) => body.match(new RegExp(`${v}: (#[0-9a-f]{6})\\b`))?.[1];
const light = (color) => {
  const n = parseInt(color.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

test('площадки: первая — «По умолчанию», у каждой своё название, сцена и мяч', () => {
  assert.equal(SKINS[0], 'telegram');
  assert.ok(SKINS.length >= 5);
  assert.equal(new Set(SKINS).size, SKINS.length);
  assert.deepEqual(Object.keys(LOOKS), SKINS, 'список площадок в игре и в рисунках — один');
  const names = js.match(/skins: \{(.*?)\}/)[1];
  for (const id of SKINS) assert.match(names, new RegExp(`${id}: '[^']+'`), id);
  assert.match(names, /telegram: 'По умолчанию'/);
  assert.equal(new Set(Object.values(LOOKS).map((l) => l.scene)).size, SKINS.length, 'у каждой площадки своя сцена');
});

test('холст, мяч и сцены рисуют только цветами палитры — и все они нужны', () => {
  assert.equal(new Set(KEYS).size, KEYS.length);
  assert.equal(SCENE.length, 18);
  const used = new Set([...render.matchAll(/pal\.([a-z0-9]+)/g)].map((m) => m[1]));
  for (const m of ball.matchAll(/colors\.([a-z0-9]+)/g)) used.add(m[1]);
  for (const k of used) assert.ok(KEYS.includes(k), `в рисунках цвет ${k}, которого нет в палитре`);
  // цвета сцены берут рисунки слоёв (проверено в scenes.test.js) — остальные должны быть заняты здесь
  for (const k of KEYS) assert.ok(used.has(k) || SCENE.includes(k), `цвет ${k} в палитре не нужен — нигде не рисуется`);
  for (const k of SCENE) assert.match(scenes, new RegExp(`p\\.${k}\\b|'${k}'`), `цвет сцены ${k}`);
  assert.match(render, /colors: pal/, 'мяч красится цветами площадки');
});

test('площадки: палитра каждой полная и своя; «По умолчанию» — из цветов темы', () => {
  const base = block('[data-game="basketball"], [data-game="basketball"] [data-skin="telegram"]');
  for (const v of VARS) assert.ok(base.includes(`${v}:`), `по умолчанию: ${v}`);
  assert.match(base, /--bk-bg: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--bk-text: var\(--tg-theme-text-color\)/);
  assert.match(base, /--bk-hint: var\(--tg-theme-hint-color\)/);
  assert.match(base, /--bk-panel: var\(--tg-theme-secondary-bg-color\)/);
  assert.match(base, /--bk-accent: var\(--tg-theme-button-color\)/);
  assert.match(base, /--bk-accent-text: var\(--tg-theme-button-text-color\)/);
  assert.match(base, /--bk-sky3: var\(--tg-theme-bg-color\)/);
  assert.match(base, /--bk-rim: var\(--tg-theme-button-color\)/);
  assert.match(base, /--bk-ink: var\(--tg-theme-text-color\)/);
  // всё, что не игровой цвет, у неё — от темы
  for (const k of KEYS.filter((key) => !GAME.includes(key))) {
    assert.match(base, new RegExp(`--bk-${k}: [^;]*var\\(--tg-theme-`), `по умолчанию: ${k} — от темы`);
  }
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    for (const v of VARS) assert.ok(body.includes(`${v}:`), `${id}: ${v}`);
    assert.ok(!body.includes('--tg-theme-'), `${id}: палитра своя, от темы не зависит`);
    for (const v of VARS) assert.ok(hex(body, v), `${id}: ${v} — шестнадцатеричный цвет`);
  }
});

test('игровые цвета «По умолчанию» заданы для обеих тем, и тёмная тема не перебивает выбранную площадку', () => {
  const dark = [...css.matchAll(/:root\[data-theme="dark"\] \[data-game="basketball"\][^{]*\{[^}]*\}/g)].map((m) => m[0]);
  assert.equal(dark.length, 1);
  for (const k of GAME) assert.ok(dark[0].includes(`--bk-${k}:`), `тёмная тема: --bk-${k}`);
  const base = block('[data-game="basketball"], [data-game="basketball"] [data-skin="telegram"]');
  for (const k of GAME) assert.ok(hex(base, `--bk-${k}`), `светлая тема: --bk-${k} — свой цвет, не от темы`);
  const selectors = dark[0].slice(0, dark[0].indexOf('{')).split(',').map((s) => s.trim());
  for (const s of selectors) assert.ok(s.includes(':not([data-skin])') || s.includes('[data-skin="telegram"]'), `тёмная тема лезет в чужую площадку: ${s}`);
});

test('на каждой площадке всё видно: надписи, пунктир, кольцо, сетка и огонь', () => {
  for (const id of SKINS.slice(1)) {
    const body = skinRule(id);
    const c = (k) => hex(body, `--bk-${k}`);
    const far = (a, b, min, what) => assert.ok(Math.abs(light(c(a)) - light(c(b))) > min, `${id}: ${what} — ${a} ${c(a)} и ${b} ${c(b)}`);
    far('text', 'bg', 0.45, 'текст шапки');
    far('accent-text', 'accent', 0.45, 'надпись на кнопке');
    far('text', 'panel', 0.4, 'текст окна');
    // у точек пунктира, надписей и нитей сетки — контур другого тона: видны на любом небе
    far('aim', 'ink2', 0.5, 'пунктир и его контур');
    far('ink', 'ink2', 0.5, 'надпись и её контур');
    far('net', 'ink2', 0.5, 'сетка и её подложка');
    far('rim', 'rim2', 0.12, 'кольцо и его тень');
    far('net', 'net2', 0.12, 'ближняя и дальняя сетка');
    // небо меняется с высотой, планы сцены различимы
    assert.notEqual(c('sky0'), c('sky4'), `${id}: небо одного цвета`);
    assert.equal(new Set([c('far'), c('mid'), c('near')]).size, 3, `${id}: планы сцены`);
    // огонь: от тёмного края к светлой середине — и обычный, и синий
    assert.ok(light(c('fire1')) < light(c('fire2')) && light(c('fire2')) < light(c('fire3')), `${id}: огонь`);
    assert.ok(light(c('hot1')) < light(c('hot2')) && light(c('hot2')) < light(c('hot3')), `${id}: синее пламя`);
    // шапка игры — тёмная или светлая под стать верху неба в начале партии
    assert.ok(Math.abs(light(c('bg')) - light(c('sky3'))) < 0.35, `${id}: шапка и небо`);
  }
});

test('образец площадки в настройках и картинки правил берут цвета площадки', () => {
  for (const [cls, v] of [['bk-sw-orb', 'orb'], ['bk-sw-far', 'mid'], ['bk-sw-near', 'near'], ['bk-sw-net', 'net'], ['bk-sw-rim', 'rim'],
    ['bk-sw-ball', 'ball'], ['bk-sw-seam', 'ball2']]) {
    assert.ok(js.includes(`class="${cls}"`), cls);
    assert.match(block(`[data-game="basketball"] .${cls}`), new RegExp(`var\\(--bk-${v}\\)`));
  }
  const swatch = block('[data-game="basketball"] .bk-swatch');
  for (const k of ['sky0', 'sky1', 'sky2', 'sky3']) assert.ok(swatch.includes(`var(--bk-${k})`), `образец: небо ${k}`);
  assert.match(js, /'data-skin': id/);
  // у каждой строки правил есть картинка, и лишних картинок нет
  const rows = [...js.match(/rows: \[([\s\S]*?)\n {4}\],/)[1].matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
  const pics = [...js.match(/const HELP_PICS = \{([\s\S]*?)\n\};/)[1].matchAll(/^ {2}([a-z]+):/gm)].map((m) => m[1]);
  assert.ok(rows.length >= 4);
  assert.deepEqual([...rows].sort(), [...pics].sort());
  for (const cls of ['bk-pic-rim', 'bk-pic-net', 'bk-pic-ball', 'bk-pic-fire', 'bk-pic-wall', 'bk-pic-line']) {
    assert.ok(js.includes(`class="${cls}"`), cls);
    assert.match(block(`[data-game="basketball"] .${cls}`), /var\(--bk-[a-z0-9]+\)/);
  }
});

test('правила интерфейса: корень изолирован, слои невысокие, обводки текста нет, «уменьшить движение» — ровно 0s', () => {
  assert.match(block('[data-game="basketball"] .bk'), /isolation: isolate;/);
  for (const m of css.matchAll(/z-index: (\d+)/g)) assert.ok(Number(m[1]) <= 10, `z-index ${m[1]}`);
  assert.ok(!css.includes('-webkit-text-stroke'));
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /transition-duration: 0s !important/);
  assert.match(reduce, /animation: none/);
  assert.match(block('[data-game="basketball"] .bk-stage'), /touch-action: none;/);
  assert.match(block('.game-root[data-game="basketball"]'), /-webkit-touch-callout: none;/);
  // цвета в стилях интерфейса — только переменные (палитры — выше, в правилах площадок)
  const layout = css.slice(css.indexOf('/* ---------- раскладка ---------- */'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(layout), 'в раскладке — конкретный цвет');
  // в кадре — без теней и градиентов: они только в заготовках сцен (scenes.js), которые рисуются один раз
  assert.ok(!/shadowBlur|createLinearGradient|createRadialGradient|'lighter'/.test(render));
  assert.ok(!/shadowBlur|createLinearGradient|createRadialGradient|'lighter'/.test(ball));
  assert.match(scenes, /createLinearGradient/);
});
