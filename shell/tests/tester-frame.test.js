import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIZES, FRAME, TOOLS_ART, shine, shineSteps, toolsSvg } from '../tester-frame.js';
import { BETA } from '../beta.js';
import { SERVER_BETA } from '../../server/lib.js';

const css = readFileSync(new URL('../../styles/app.css', import.meta.url), 'utf8');
const AVATARS = { lg: 78, md: 44, sm: 34 };       // профиль, пьедестал, строка таблицы

test('рамка тестера: три размера одного вида; блик — ступеньки во всю высоту, целое число шагов; числа в стилях те же', () => {
  assert.equal(FRAME, SIZES.lg);
  for (const [size, box] of Object.entries(SIZES)) {
    const { main, tail, width } = shine(box);
    const rows = box.h / box.step;
    assert.equal(box.w, box.h, `${size}: рамка квадратная — надписи под аватаром нет`);
    assert.equal(box.w - 2 * box.pad, AVATARS[size], `${size}: аватар внутри — своего размера`);
    assert.ok(Number.isInteger(rows), `${size}: высота делится на шаг пикселя`);
    assert.equal(main.split('M').length - 1, rows);
    assert.equal(tail.split('M').length - 1, rows);
    assert.ok(main.startsWith(`M${box.step * 5} ${box.h - box.step}`), 'нижняя ступенька — у нижнего края');
    assert.ok(box.step * (5 + rows - 1) + box.step * 2 <= width, 'правая ступенька помещается в SVG');
    assert.ok(Number.isInteger(shineSteps(box)), `${size}: блик идёт ровно по пикселю за шаг`);

    const icon = (TOOLS_ART.length + 2) * box.icon;
    assert.match(css, new RegExp(`\\.tframe-${size} \\{ --tf-box: ${box.w}px; --tf-pad: ${box.pad}px; [^}]*--tf-icon: ${icon}px; `),
      `${size}: сторона, кайма и значок`);
    assert.ok(Number.isInteger((box.w - icon) / 2), `${size}: значок встаёт по центру без полупикселей`);
    assert.ok(css.includes(`.tframe-${size} .tframe-shine { translate: -${width}px 0; animation-name: tframe-sweep-${size}; }`),
      `${size}: в покое блик целиком слева за рамкой`);
    assert.match(css, new RegExp(`@keyframes tframe-sweep-${size} \\{\\s+0% \\{ translate: -${width}px 0; animation-timing-function: steps\\(${shineSteps(box)}\\); \\}\\s+40%, 100% \\{ translate: ${box.w}px 0; \\}`),
      `${size}: и уходит целиком вправо`);
  }
  assert.ok(css.includes('.tframe-rv, .tframe-shine { animation: none; }'), 'уменьшить движение — без блика и искр');
});

test('значок рамки — ключ и молот 16×16 с обводкой в пиксель', () => {
  assert.equal(TOOLS_ART.length, 16);
  assert.ok(TOOLS_ART.every((row) => row.length === 16 && /^[.LMhSDYy]+$/.test(row)));
  const svg = toolsSvg();
  assert.ok(svg.startsWith('<svg viewBox="0 0 18 18"'));
  // симметрия силуэта: левая и правая половины занимают одни и те же строки и доходят до своих краёв
  const span = (from, to) => {
    const ys = TOOLS_ART.flatMap((row, y) => (/[^.]/.test(row.slice(from, to)) ? [y] : []));
    return [ys[0], ys.at(-1)];
  };
  assert.deepEqual(span(0, 8), span(8, 16), 'ключ и молот — на одной высоте сверху и снизу');
  const top = (from, to) => TOOLS_ART.findIndex((row) => /[^.]/.test(row.slice(from, to)));
  assert.equal(top(0, 7), top(9, 16), 'зев ключа и боёк молота начинаются с одной строки');
  const edge = (x) => TOOLS_ART.some((row) => row[x] !== '.');
  assert.ok(edge(0) && edge(15), 'и слева, и справа рисунок доходит до края');
  // стержни — отражения друг друга: рукоять молота идёт по x + y = 14…15, ключ — по x − y = 0…1
  for (let y = 8; y <= 10; y++) {
    assert.match(TOOLS_ART[y][14 - y] + TOOLS_ART[y][15 - y], /^Yy$/, `рукоять, строка ${y}`);
    assert.match(TOOLS_ART[y][y] + TOOLS_ART[y][y + 1], /^ML$/, `ключ, строка ${y}`);
  }
  // одиночный пиксель: обводка 3×3 вокруг него, сам он сдвинут на пиксель обводки
  const dot = toolsSvg(['...', '.L.', '...']);
  assert.ok(dot.includes('<path fill="#000" d="M1 1h3v1h-3zM1 2h3v1h-3zM1 3h3v1h-3z"/>'));
  assert.ok(dot.includes('<path fill="#eef2f8" d="M2 2h1v1h-1z"/>'));
});

test('рамка тестера: пока в бете — и на сервере, и в оболочке', () => {
  const inShell = BETA.some((b) => b.id === 'tester-frame');
  assert.equal(SERVER_BETA.includes('tester-frame'), inShell);
});
