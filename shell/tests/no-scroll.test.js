import test from 'node:test';
import assert from 'node:assert/strict';

import { scrollableAncestor } from '../no-scroll.js';

const node = (overflowY, scrollHeight, clientHeight, parentElement = null) => ({ nodeType: 1, overflowY, scrollHeight, clientHeight, parentElement });
const style = (n) => ({ overflowY: n.overflowY });

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
