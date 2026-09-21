// Рисунки плиток: в каждом стиле 36 различимых видов. Запуск: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, STYLE_NAMES, faceHTML } from '../faces.js';
import { KINDS } from '../logic.js';

test('каждый стиль: 36 разных рисунков видов, у цветов и сезонов (китайский) — по 4 разных', () => {
  for (const style of STYLES) {
    assert.ok(STYLE_NAMES[style], style);
    const faces = Array.from({ length: KINDS }, (_, kind) => faceHTML(style, kind, 0));
    assert.ok(faces.every((f) => typeof f === 'string' && f.length > 10), `${style}: пустой рисунок`);
    assert.equal(new Set(faces).size, KINDS, `${style}: рисунки видов повторяются`);
  }
  for (const kind of [34, 35]) {
    const variants = [0, 1, 2, 3].map((face) => faceHTML('chinese', kind, face));
    assert.equal(new Set(variants).size, 4);
  }
});
