// Диагностика экрана (diag.js): строки окна «Диагностика» по снятым числам — что считается тревогой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagLines, overOf, sides, span } from '../diag.js';

/** Числа телефона стоя (поворот 90): окно 393×851, всё верно; over — что поменять. */
function facts(over = {}) {
  return {
    win: { w: 393, h: 851, dpr: 2.75 }, device: { w: 393, h: 851, orient: 'portrait-primary' },
    vv: { w: 393, h: 851, x: 0, y: 0, k: 1 }, full: 'on',
    tg: { vh: 851, stable: 851, safe: { top: 30, right: 0, bottom: 0, left: 0 }, content: { top: 46, right: 0, bottom: 0, left: 0 } },
    env: { top: 30, right: 0, bottom: 0, left: 0 },
    body: { l: 0, t: 0, r: 393, b: 851 }, frame: { l: 0, t: 0, r: 393, b: 851 },
    ls: { top: 0, right: 0, bottom: 0, left: 76 }, turn: 90, flipped: false,
    size: { w: 851, h: 393 }, insets: { top: 0, right: 0, bottom: 0, left: 76 }, root: { w: 851, h: 393 }, zoom: 1.228,
    parts: [
      // пауза у правого верхнего угла игры: в осях игры x 793…837, y 14…58; на стекле — низ справа
      { name: 'пауза', game: { l: 793, t: 14, r: 837, b: 58 }, dev: { l: 335, t: 793, r: 379, b: 837 } },
      { name: 'карта', none: true },
    ],
    ...over,
  };
}

const warns = (lines) => lines.filter((l) => l.startsWith('!'));

test('диагностика: подписи отступов и прямоугольников', () => {
  assert.equal(sides({ top: 30, right: 0, bottom: 48.4, left: 76 }), 'в30 п0 н48 л76');
  assert.equal(sides(null), '—');
  assert.equal(span({ l: 0, t: 0, r: 393, b: 851 }), '0,0→393,851');
  assert.equal(overOf({ l: 0, t: 0, r: 10, b: 10 }, { l: 0, t: 0, r: 10, b: 10 }), 0, 'край в край — внутри');
  assert.equal(overOf({ l: 335, t: 793, r: 379, b: 896 }, { l: 0, t: 0, r: 393, b: 851 }), 45);
  assert.equal(overOf({ l: -3, t: 5, r: 10, b: 10 }, { l: 0, t: 0, r: 393, b: 851 }), 3);
});

test('диагностика: всё на месте — тревог нет, числа Telegram, веб-вида и игры — в строках', () => {
  const lines = diagLines(facts());
  assert.deepEqual(warns(lines), []);
  const text = lines.join('\n');
  for (const part of ['окно 393×851', 'dpr 2.75', 'полный экран: on', 'стаб. 851', 'TG safe в30 п0 н0 л0', 'content в46 п0 н0 л0',
    'env() в30', 'поворот 90', 'игра 851×393', 'отступы игры в0 п0 н0 л76', 'zoom HUD 1.228', 'карта: не видно']) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(lines.some((l) => l.startsWith('пауза: игра 793,14→837,58 · стекло 335,793→379,837')));
});

test('диагностика: Telegram назвал высоту больше окна — тревога про body, а часть HUD за окном — тревога с числом', () => {
  // как было у владельца до правки: body и рамка игры на 51 px ниже окна, пауза за краем на 45 px
  const lines = diagLines(facts({
    win: { w: 393, h: 800, dpr: 2.75 },
    frame: { l: 0, t: 0, r: 393, b: 851 },
    parts: [{ name: 'пауза', game: { l: 793, t: 6, r: 837, b: 50 }, dev: { l: 343, t: 793, r: 387, b: 845 } }],
  }));
  const w = warns(lines);
  assert.ok(w.some((l) => l.includes('body больше окна: вылезает на 51 px')), w.join('\n'));
  assert.ok(w.some((l) => l.includes('рамка игры больше окна: вылезает на 51 px')));
  assert.ok(w.some((l) => l.startsWith('! пауза:') && l.includes('ЗА ОКНОМ 45')));
});

test('диагностика: часть HUD залезла в отступ (под часы, вырез) — тревога «в отступе»', () => {
  const lines = diagLines(facts({
    parts: [{ name: 'левая колонка', game: { l: 60, t: 14, r: 300, b: 100 }, dev: { l: 293, t: 60, r: 379, b: 300 } }],
  }));
  assert.ok(warns(lines).some((l) => l.startsWith('! левая колонка:') && l.includes('в отступе 16')), lines.join('\n'));
});

test('диагностика: нет чисел — одна строка, без падения', () => {
  assert.deepEqual(diagLines(null), ['нет данных']);
  // без api.screen (компьютер): отступов нет, тревог нет
  assert.deepEqual(warns(diagLines(facts({ insets: null, turn: 0, size: { w: 1280, h: 720 }, win: { w: 1280, h: 720, dpr: 1 },
    body: { l: 0, t: 0, r: 1280, b: 720 }, frame: { l: 0, t: 0, r: 1280, b: 720 }, parts: [] }))), []);
});
