// Ряды вбок тянутся мышью (shell/nui/drag.js): сдвиг ряда за курсором, щелчок после перетаскивания не открывает
// карточку, короткое движение — обычный щелчок, палец и выключенная бета не трогаются.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMouseDrag } from '../nui/drag.js';

function fakeDoc() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter((f) => f !== fn); },
    fire(type, e) { for (const fn of handlers[type] ?? []) fn(e); },
  };
}

function fakeRow() {
  const classes = new Set();
  const row = {
    scrollLeft: 100, scrollWidth: 1000, clientWidth: 300,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
  };
  const target = { closest: () => row };
  return { row, target, classes };
}

const ev = (target, extra) => {
  const e = { target, pointerType: 'mouse', button: 0, prevented: false, stopped: false, ...extra };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};

test('мышью: ряд едет за курсором, щелчок после перетаскивания гасится', () => {
  globalThis.requestAnimationFrame = (fn) => fn();
  const doc = fakeDoc();
  const { row, target, classes } = fakeRow();
  installMouseDrag(doc, () => true);
  doc.fire('pointerdown', ev(target, { clientX: 200 }));
  doc.fire('pointermove', ev(target, { clientX: 150 }));
  assert.equal(row.scrollLeft, 150, 'курсор влево на 50 — ряд вправо на 50');
  assert.ok(classes.has('ndragging'));
  doc.fire('pointerup', ev(target, {}));
  assert.ok(!classes.has('ndragging'), 'прилипание вернулось');
  const click = ev(target, {});
  doc.fire('click', click);
  assert.ok(click.prevented && click.stopped, 'щелчок после перетаскивания не открывает карточку');
  const next = ev(target, {});
  doc.fire('click', next);
  assert.ok(!next.prevented, 'следующий щелчок — обычный');
});

test('короткое движение — щелчок; палец и выключенная бета не трогаются', () => {
  const doc = fakeDoc();
  const { row, target } = fakeRow();
  let on = true;
  installMouseDrag(doc, () => on);
  doc.fire('pointerdown', ev(target, { clientX: 200 }));
  doc.fire('pointermove', ev(target, { clientX: 197 }));
  doc.fire('pointerup', ev(target, {}));
  assert.equal(row.scrollLeft, 100);
  const click = ev(target, {});
  doc.fire('click', click);
  assert.ok(!click.prevented);
  doc.fire('pointerdown', ev(target, { clientX: 200, pointerType: 'touch' }));
  doc.fire('pointermove', ev(target, { clientX: 100, pointerType: 'touch' }));
  assert.equal(row.scrollLeft, 100, 'палец — браузер листает сам');
  on = false;
  doc.fire('pointerdown', ev(target, { clientX: 200 }));
  doc.fire('pointermove', ev(target, { clientX: 100 }));
  assert.equal(row.scrollLeft, 100, 'без беты — как было');
});
