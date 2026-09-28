import test from 'node:test';
import assert from 'node:assert/strict';

import { scrollableAncestor } from '../no-scroll.js';

const node = (overflowY, scrollHeight, clientHeight, parentElement = null) => ({ nodeType: 1, overflowY, scrollHeight, clientHeight, parentElement });
const style = (n) => ({ overflowY: n.overflowY, overflowX: n.overflowX ?? 'visible' });

test('прокрутку оставляем только там, где действительно есть что прокрутить', () => {
  const page = node('hidden', 900, 700);
  const fitsGame = node('auto', 700, 700, page);            // игра влезает — прокручивать нечего
  const board = node('visible', 400, 400, fitsGame);
  assert.equal(scrollableAncestor(board, style), null, 'палец по доске — страница не едет');

  const longModal = node('auto', 1200, 600, fitsGame);       // длинное окно настроек
  const option = node('visible', 40, 40, longModal);
  assert.equal(scrollableAncestor(option, style), longModal, 'в длинном окне прокрутка есть');

  const hiddenTall = node('hidden', 2000, 600, page);        // overflow: hidden — не прокручивается
  assert.equal(scrollableAncestor(node('visible', 10, 10, hiddenTall), style), null);
});

test('ряды, прокручиваемые вбок (новый интерфейс), — только когда он включён', () => {
  const page = node('hidden', 700, 700);
  const row = { ...node('hidden', 200, 200, page), overflowX: 'auto', scrollWidth: 900, clientWidth: 390 };
  const card = node('visible', 150, 150, row);
  assert.equal(scrollableAncestor(card, style), null, 'старый интерфейс — как раньше');
  assert.equal(scrollableAncestor(card, style, { horizontal: true }), row, 'новый — ряд листается пальцем');
  const short = { ...node('hidden', 200, 200, page), overflowX: 'auto', scrollWidth: 390, clientWidth: 390 };
  assert.equal(scrollableAncestor(node('visible', 10, 10, short), style, { horizontal: true }), null, 'всё влезло — листать нечего');
});
