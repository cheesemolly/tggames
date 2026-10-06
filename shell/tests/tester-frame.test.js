import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FRAME, shine, shineSteps } from '../tester-frame.js';
import { BETA } from '../beta.js';
import { SERVER_BETA } from '../../server/lib.js';

test('рамка тестера: блик — ступеньки во всю высоту, целое число шагов; числа в стилях те же', () => {
  const { main, tail, width } = shine();
  const rows = FRAME.h / FRAME.step;
  assert.ok(Number.isInteger(rows), 'высота делится на шаг пикселя');
  assert.equal(main.split('M').length - 1, rows);
  assert.equal(tail.split('M').length - 1, rows);
  assert.ok(main.startsWith(`M${FRAME.step * 5} ${FRAME.h - FRAME.step}`), 'нижняя ступенька — у нижнего края');
  // самая правая ступенька широкой линии помещается в SVG
  assert.ok(FRAME.step * (5 + rows - 1) + FRAME.step * 2 <= width);
  assert.ok(Number.isInteger(shineSteps()), 'блик идёт ровно по пикселю за шаг');

  const css = readFileSync(new URL('../../styles/app.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.tframe {'), css.indexOf('.top-profile .tframe'));
  assert.match(block, new RegExp(`width: ${FRAME.w}px;\\s+height: ${FRAME.h}px;`), 'размер рамки');
  assert.ok(block.includes(`translate: -${width}px 0; animation: tframe-sweep`), 'в покое блик целиком слева за рамкой');
  assert.ok(block.includes(`0% { translate: -${width}px 0; animation-timing-function: steps(${shineSteps()}); }`));
  assert.ok(block.includes(`40%, 100% { translate: ${FRAME.w}px 0; }`), 'и уходит целиком вправо');
  assert.ok(block.includes('prefers-reduced-motion') || css.includes('.tframe-rv, .tframe-shine { animation: none; }'));
});

test('рамка тестера: пока в бете — и на сервере, и в оболочке', () => {
  const inShell = BETA.some((b) => b.id === 'tester-frame');
  assert.equal(SERVER_BETA.includes('tester-frame'), inShell);
});
