// Заставка (loader.js): список файлов для предзагрузки совпадает с тем, что игра на самом деле импортирует, полоса
// растёт только вперёд и доходит до конца, подписи идут по порядку. Сам рисунок — в браузере (tools/fox-hunt-loader.html).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// loader.js тянет shared/motion.js, а тот спрашивает matchMedia при загрузке
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { FILES, FILES_PART, barOf, sayOf } = await import('../loader.js');

const DIR = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, DIR), 'utf8');

/** Модули игры, до которых index.js дотягивается import'ами (только свои, из папки игры). */
function reachable(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = read(file);
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]\.\/([\w.-]+\.js)['"]/g)) queue.push(m[1]);
  }
  return seen;
}

test('заставка: в списке ровно те файлы, что импортирует игра (кроме самой заставки)', () => {
  const used = reachable('index.js');
  used.delete('loader.js');
  assert.deepEqual([...FILES].sort(), [...used].sort());
  assert.equal(new Set(FILES).size, FILES.length, 'повторы в списке');
  // и ни одного модуля в папке игры, который ни к чему не подключён (иначе список и игра разойдутся молча)
  const all = readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'loader.js');
  assert.deepEqual(all.sort(), [...FILES].sort());
});

test('заставка: index.js и реестр подключают её', () => {
  assert.match(read('index.js'), /import \{ loading \} from '\.\/loader\.js'/);
  assert.match(read('index.js'), /await loading\.done\(\)/);
  const registry = readFileSync(new URL('../../../shell/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /loader: \(\) => import\('\.\.\/games\/fox-hunt\/loader\.js'\)/);
});

test('заставка: полоса растёт только вперёд, файлы — до FILES_PART, подготовка — до конца', () => {
  assert.equal(barOf(0), 0);
  assert.equal(barOf(1), FILES_PART);
  assert.equal(barOf(1, 0), FILES_PART);
  assert.equal(barOf(0.3, 0), FILES_PART, 'подготовка началась — файлы уже все');
  assert.equal(barOf(1, 1), 1);
  assert.equal(barOf(2, 5), 1, 'больше конца не бывает');
  assert.equal(barOf(-1), 0);
  let last = -1;
  for (let i = 0; i <= FILES.length; i++) {
    const p = barOf(i / FILES.length);
    assert.ok(p > last);
    last = p;
  }
  for (let i = 0; i <= 20; i++) {
    const p = barOf(1, i / 20);
    assert.ok(p >= last);
    last = p;
  }
  assert.equal(last, 1);
});

test('заставка: подписи по порядку, последняя — только на полной полосе', () => {
  const seen = [];
  for (let i = 0; i <= 100; i++) {
    const say = sayOf(i / 100);
    assert.ok(say && say.length <= 24, `подпись «${say}» слишком длинная для записки`);
    if (seen.at(-1) !== say) seen.push(say);
  }
  assert.equal(new Set(seen).size, seen.length, 'подпись вернулась к прежней');
  assert.equal(sayOf(0.99), sayOf(FILES_PART));
  assert.notEqual(sayOf(1), sayOf(0.99));
});

test('заставка: без DOM при импорте, стили — в своём блоке game.css', () => {
  const css = read('game.css');
  const block = css.slice(css.indexOf('/* ---------- заставка ---------- */'), css.indexOf('/* ---------- конец: заставка ---------- */'));
  assert.ok(block.length > 1000, 'нет блока «заставка» в game.css');
  for (const cls of ['fh-load-sky', 'fh-load-stand', 'fh-load-fill', 'fh-load-run', 'fh-load-fox', 'fh-load-say', 'fh-load--out', 'fh-load--font']) {
    assert.ok(block.includes(`.${cls}`), `нет стиля .${cls}`);
  }
  // «Уменьшить движение» — и системное, и своё в приложении
  assert.match(block, /prefers-reduced-motion: reduce/);
  assert.match(block, /:root\.reduce-motion/);
  // анимации заставки — только transform и opacity (идут, пока init занимает поток)
  const frames = [...block.matchAll(/@keyframes [\w-]+ \{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  assert.ok(frames.length >= 8, 'анимации заставки не нашлись');
  for (const m of frames) {
    for (const prop of m[1].matchAll(/([a-z-]+)\s*:/g)) assert.ok(['transform', 'opacity'].includes(prop[1]), `в анимации ${prop[1]}`);
  }
});
