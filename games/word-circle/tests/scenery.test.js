// Пейзажи «Круга слов»: каждый — цельный SVG без мусора в числах, один и тот же при одном зерне.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, sceneSvg, sceneUrl, sceneOfChapter } from '../scenery.js';

/** Все ли теги закрыты (простая проверка стеком; одиночные теги — с «/>»). */
function balanced(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

test('список пейзажей: у каждого своё имя и название', () => {
  assert.ok(SCENES.length >= 10);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length);
  assert.equal(new Set(SCENES.map((s) => s.name)).size, SCENES.length);
  for (const s of SCENES) {
    assert.match(s.id, /^[a-z]+$/);
    assert.match(s.name, /^[А-ЯЁ][а-яё]+$/);
  }
});

test('каждый пейзаж — цельный SVG: теги закрыты, числа настоящие, ссылки на градиенты есть', () => {
  for (const s of SCENES) {
    for (const seed of [0, 1, 7, 29]) {
      const svg = sceneSvg(s.id, seed);
      assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"'), s.id);
      assert.ok(svg.endsWith('</svg>'), s.id);
      assert.ok(balanced(svg), `${s.id}/${seed}: теги не сходятся`);
      assert.ok(!/NaN|undefined|Infinity|null/.test(svg), `${s.id}/${seed}: мусор в числах`);
      assert.ok(svg.length > 2000 && svg.length < 40000, `${s.id}/${seed}: ${svg.length} знаков`);
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${s.id}: повтор id`);
      for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref[1]), `${s.id}: нет #${ref[1]}`);
      // без внешних ссылок и скриптов — картинка идёт фоном как data:-адрес
      assert.ok(!/<script|href=|<image|<foreignObject/.test(svg), s.id);
    }
  }
});

test('одно зерно — одна картинка, другое — другая; пейзажи между собой разные', () => {
  for (const s of SCENES) {
    assert.equal(sceneSvg(s.id, 3), sceneSvg(s.id, 3));
    assert.notEqual(sceneSvg(s.id, 3), sceneSvg(s.id, 4), `${s.id}: зерно ничего не меняет`);
  }
  assert.equal(new Set(SCENES.map((s) => sceneSvg(s.id, 1))).size, SCENES.length);
  assert.equal(sceneSvg('нет такого', 1), sceneSvg(SCENES[0].id, 1).replace(/^/, ''), 'неизвестный пейзаж — первый');
});

test('пейзаж главы идёт по кругу списка, адрес для фона — data: с закодированным SVG', () => {
  assert.equal(sceneOfChapter(0), SCENES[0]);
  assert.equal(sceneOfChapter(SCENES.length), SCENES[0]);
  assert.equal(sceneOfChapter(SCENES.length + 2), SCENES[2]);
  assert.equal(sceneOfChapter(-1), SCENES[SCENES.length - 1]);
  const url = sceneUrl('sea', 2);
  assert.ok(url.startsWith('url("data:image/svg+xml,%3Csvg'));
  assert.ok(url.endsWith('")'));
  assert.ok(!/[<>#\s]/.test(url.slice(5, -2).replace('data:image/svg+xml,', '')), 'всё закодировано');
});
