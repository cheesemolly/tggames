// Прыгалка вверх: физика прыжка, платформы и предметы, враги, гибель, счёт; генератор листа (путь наверх есть
// всегда, под врагами не стоят платформы, ничего не налезает), бот проходит партии без тупиков; сохранение.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, CELL, VIEW_MIN, VIEW_MAX, CAM_AT, GRAVITY, JUMP, JUMP_H, SPRING, ERASER, MAX_GAP, MAX_REACH, ONCE_BACK, PLAT_W, FOOT, BODY_H,
  KEY_V, FLIGHTS, FLY_EXIT, FLY_GRACE, SHIELD_TIME, TYPES, RELIABLE, ITEMS, ITEM_REACH, FOES, HOLE_PULL, HOLE_TIME, OUT_TIME, OPEN,
  START_CAM, START_FREE, wrap, wrapDist, tri, clampView, cellsOf, score, diff, newGame, grow, step, landTime, createBot,
  foeKeep, underFoe, isValidState, snapshot, restore, emptyStats, isValidStats, recordGame,
} from '../logic.js';

const DT = 1 / 60;

/**
 * Пустой лист: только то, что положено в тесте (генератор не достраивает — он уже «дошёл» далеко вверх).
 * Экран стоит так, чтобы всё положенное было на нём (то, что ниже экрана, игра убирает).
 */
function bare({ plats = [], foes = [], x = W / 2, y = 0, vy = 0, viewH = 640 } = {}) {
  const s = newGame({ seed: 1, viewH });
  s.plats = plats.map((a, i) => ({ id: 100 + i, w: PLAT_W, item: null, gone: -1, hit: -1, type: 'solid', ...a }));
  s.foes = foes.map((f, i) => ({ id: 200 + i, dead: -1, ...f }));
  s.gen.y = 1e9;
  Object.assign(s.p, { x, y, vy });
  s.cam = Math.min(y, ...s.plats.map((a) => a.y), ...s.foes.map((f) => f.y)) - 60;
  assert.ok(y <= s.cam + s.viewH * CAM_AT, 'тест: каракуля выше линии камеры — экран уедет');
  return s;
}

/** Шагать, пока не случится событие нужного вида (или не выйдет время); возвращает все события. */
function until(s, type, { seconds = 5, input = {} } = {}) {
  const all = [];
  for (let t = 0; t < seconds; t += DT) {
    const ev = step(s, DT, input);
    all.push(...ev);
    if (ev.some((e) => e.type === type)) return all;
  }
  return all;
}
const has = (events, type) => events.some((e) => e.type === type);

/** Лист без каракули: генератор строит его вверх до cells клеток; возвращает всё, что на нём появилось. */
function sheet(seed, cells) {
  const s = newGame({ seed, viewH: 640 });
  const plats = new Map();
  const foes = new Map();
  while (s.cam < cells * CELL) {
    for (const a of s.plats) plats.set(a.id, structuredClone(a));
    for (const f of s.foes) foes.set(f.id, structuredClone(f));
    s.cam += 300;
    grow(s);
  }
  return { plats: [...plats.values()], foes: [...foes.values()] };
}
const baseY = (a) => (a.type === 'vert' ? a.by : a.y);

// ---------- мелочи ----------

test('лист замкнут: wrap и кратчайший путь через край', () => {
  assert.equal(wrap(-10), W - 10);
  assert.equal(wrap(W + 25), 25);
  assert.equal(wrapDist(10, 30), 20);
  assert.equal(wrapDist(W - 10, 10), 20, 'через правый край ближе');
  assert.equal(wrapDist(10, W - 10), -20);
  assert.equal(Math.abs(wrapDist(0, W / 2)), W / 2);
});

test('пила: туда-обратно с постоянной скоростью, период 1', () => {
  assert.equal(tri(0), -1);
  assert.equal(tri(0.25), 0);
  assert.equal(tri(0.5), 1);
  assert.equal(tri(0.75), 0);
  assert.equal(tri(1.25), tri(0.25));
  assert.equal(tri(-0.75), tri(0.25));
  for (let u = 0; u < 3; u += 0.013) assert.ok(Math.abs(tri(u)) <= 1);
});

test('экран: высота в пределах, счёт в клетках', () => {
  assert.equal(clampView(100), VIEW_MIN);
  assert.equal(clampView(5000), VIEW_MAX);
  assert.equal(clampView(NaN), 640);
  assert.equal(cellsOf(-5), 0);
  assert.equal(cellsOf(CELL * 7 + 3), 7);
  assert.equal(diff(0), 0);
  assert.equal(diff(1e9), 1);
});

// ---------- прыжок ----------

test('на старте каракуля стоит на земле и прыгает на месте: высота прыжка одна и та же, счёт 0', () => {
  const s = newGame({ seed: 5 });
  assert.equal(s.cam, START_CAM);
  assert.equal(score(s), 0);
  let top = 0;
  let jumps = 0;
  for (let t = 0; t < 6; t += DT) {
    for (const e of step(s, DT)) if (e.type === 'jump') jumps += 1;
    top = Math.max(top, s.p.y);
  }
  assert.ok(Math.abs(top - JUMP_H) < 0.05, `высота прыжка ${top}`);
  assert.ok(jumps >= 6 && jumps <= 8, `прыжков за 6 секунд: ${jumps}`);
  assert.equal(score(s), 0, 'пока не ушла с земли — счёт 0');
  assert.equal(s.cam, START_CAM, 'лист не поехал');
  assert.equal(s.phase, 'play');
  assert.equal(s.run.jumps, 0, 'прыжки на земле в статистику не идут');
});

test('над местом старта пусто на высоту прыжка — сама наверх каракуля не уйдёт (60 зёрен)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame({ seed });
    for (const a of s.plats) {
      if (a.type === 'ground' || a.y > JUMP_H + 20) continue;
      assert.ok(Math.abs(a.x - W / 2) >= START_FREE - 0.01, `зерно ${seed}: платформа над стартом, x ${a.x}`);
    }
    for (let t = 0; t < 4; t += DT) step(s, DT);
    assert.equal(s.cam, START_CAM, `зерно ${seed}`);
  }
});

test('сквозь платформу снизу проходит, сверху — отскок', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0 }, { x: W / 2, y: 100 }], y: 0, vy: JUMP });
  const first = until(s, 'jump');
  const jump = first.find((e) => e.type === 'jump');
  assert.ok(Math.abs(jump.y - 100) < 0.001, 'пролетела сквозь верхнюю снизу и приземлилась на неё');
  assert.ok(s.p.y >= 100 && s.p.y < 108 && s.p.vy > JUMP - 20 && s.p.vy <= JUMP, 'отскочила вверх со скоростью прыжка');
});

test('мимо платформы — падает дальше; на краю хватает ступни', () => {
  const edge = PLAT_W / 2 + FOOT;
  const on = bare({ plats: [{ x: 100, y: 0 }], x: 100 + edge - 1, y: 50 });
  assert.ok(has(until(on, 'jump', { seconds: 1 }), 'jump'));
  const off = bare({ plats: [{ x: 100, y: 0 }], x: 100 + edge + 2, y: 50 });
  assert.ok(!has(until(off, 'jump', { seconds: 1 }), 'jump'));
});

test('платформа у края листа ловит каракулю с другой стороны', () => {
  const s = bare({ plats: [{ x: W - 20, y: 0 }], x: 14, y: 40 });
  assert.ok(has(until(s, 'jump', { seconds: 1 }), 'jump'), 'каракуля у левого края — над платформой у правого');
});

test('большой шаг времени делится: сквозь платформу не проваливается', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0 }], y: 220 });
  const events = [];
  for (let k = 0; k < 6; k++) events.push(...step(s, 0.5));
  assert.ok(has(events, 'jump'));
  assert.equal(s.phase, 'play');
});

test('пустой, отрицательный и нечисловой шаг ничего не меняют', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0 }], y: 30 });
  const before = JSON.stringify(s);
  for (const dt of [0, -1, NaN, undefined]) assert.deepEqual(step(s, dt), []);
  assert.equal(JSON.stringify(s), before);
});

// ---------- управление ----------

test('палец ведёт напрямую, клавиши — с разгоном; за край листа — выход с другой стороны', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0, w: W, type: 'ground' }] });
  step(s, DT, { dx: 37 });
  assert.ok(Math.abs(s.p.x - (W / 2 + 37)) < 1e-9);
  assert.equal(s.p.face, 1);
  step(s, DT, { dx: -200 });
  assert.equal(s.p.face, -1);
  assert.ok(Math.abs(s.p.x - 17) < 1e-9);
  step(s, DT, { dx: -40 });
  assert.ok(Math.abs(s.p.x - (W - 23)) < 1e-9, 'ушла за левый край — вышла справа');

  const k = bare({ plats: [{ x: W / 2, y: 0, w: W, type: 'ground' }] });
  step(k, DT, { dir: 1 });
  assert.ok(k.p.vx > 0 && k.p.vx < KEY_V, 'разгон не мгновенный');
  for (let t = 0; t < 0.5; t += DT) step(k, DT, { dir: 1 });
  assert.ok(Math.abs(k.p.vx - KEY_V) < 1e-6);
  for (let t = 0; t < 0.5; t += DT) step(k, DT, {});
  assert.equal(k.p.vx, 0, 'отпустил — остановилась');
});

// ---------- платформы ----------

test('карандашная обманка ломается и не подбрасывает', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0, type: 'crumble' }], y: 40 });
  const events = until(s, 'crumble', { seconds: 1 });
  assert.ok(has(events, 'crumble') && !has(events, 'jump'));
  assert.ok(s.p.vy < 0, 'падает дальше');
  assert.ok(s.plats[0].gone >= 0);
});

test('пунктирная выдерживает один прыжок, стирается и через ONCE_BACK проявляется снова', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0, w: W, type: 'ground' }, { x: W / 2, y: 60, type: 'once' }], y: 100 });
  const once = s.plats[1];
  assert.ok(has(until(s, 'jump', { seconds: 1 }), 'jump'));
  assert.ok(once.gone >= 0, 'стёрлась');
  const next = until(s, 'jump', { seconds: 2 }).find((e) => e.type === 'jump');
  assert.equal(next.y, 0, 'второй раз на неё не встать — приземлилась на землю');
  const events = until(s, 'back', { seconds: ONCE_BACK + 0.5 });
  assert.ok(has(events, 'back'));
  assert.equal(once.gone, -1, 'проявилась');
  assert.ok(Math.abs(once.back - (once.hit + ONCE_BACK)) < 0.02);
});

test('ездящая платформа ходит туда-обратно в своих пределах, качели — вверх-вниз', () => {
  // каракуля прыгает на земле, платформы — выше её прыжка
  const s = bare({
    plats: [
      { x: W / 2, y: 0, w: W, type: 'ground' },
      { x: 100, y: 250, type: 'move', bx: 180, range: 90, period: 2, ph: 0 },
      { x: 60, y: 320, type: 'vert', by: 320, range: 30, period: 1.5, ph: 0.3 },
    ],
  });
  const [, m, v] = s.plats;
  const xs = [];
  const ys = [];
  for (let t = 0; t < 4; t += DT) {
    step(s, DT);
    xs.push(m.x);
    ys.push(v.y);
  }
  assert.ok(Math.min(...xs) >= 90 - 1e-9 && Math.max(...xs) <= 270 + 1e-9);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 170, 'проходит весь путь');
  assert.ok(Math.min(...ys) >= 290 - 1e-9 && Math.max(...ys) <= 350 + 1e-9);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 55);
});

test('качели, идущие навстречу, каракулю ловят (не пролетает насквозь)', () => {
  for (const ph of [0, 0.2, 0.4, 0.6, 0.8]) {
    const s = bare({ plats: [{ x: W / 2, y: 100, type: 'vert', by: 100, range: 32, period: 0.9, ph }], y: 260 });
    const jump = until(s, 'jump', { seconds: 1 }).find((e) => e.type === 'jump');
    assert.ok(jump, `фаза ${ph}`);
    assert.ok(jump.y >= 68 - 1e-6 && jump.y <= 132 + 1e-6);
  }
});

// ---------- предметы ----------

test('пружинка подбрасывает в 2,5 раза выше — только если встать на неё; ластик — ещё выше, с кувырком', () => {
  const height = (kind, ox, x) => {
    const s = bare({ plats: [{ x: 100, y: 0, item: kind ? { kind, ox, hit: -1, taken: false } : null }], x, y: 30 });
    const events = until(s, kind ?? 'jump', { seconds: 1 });
    let top = 0;
    for (let t = 0; t < 2; t += DT) {
      step(s, DT);
      top = Math.max(top, s.p.y);
    }
    return { top, events, s };
  };
  const plain = height(null, 0, 100).top;
  const spring = height('spring', 15, 100 + 15);
  assert.ok(has(spring.events, 'spring'));
  assert.ok(Math.abs(spring.top / plain - (SPRING / JUMP) ** 2) < 0.03, `пружинка: ×${(spring.top / plain).toFixed(2)}`);
  assert.ok(spring.top / plain > 2.4);
  const missed = height('spring', 15, 100 + 15 - ITEM_REACH.spring - 3);
  assert.ok(has(missed.events, 'jump') && !has(missed.events, 'spring'), 'мимо пружинки — обычный прыжок');
  const eraser = height('eraser', 0, 100);
  assert.ok(has(eraser.events, 'eraser'));
  assert.ok(eraser.top / plain > 4.2 && Math.abs(eraser.top / plain - (ERASER / JUMP) ** 2) < 0.05);
  assert.equal(spring.s.run.springs, 1);
});

test('кувырок после ластика кончается', () => {
  const s = bare({ plats: [{ x: 100, y: 0, item: { kind: 'eraser', ox: 0, hit: -1, taken: false } }], x: 100, y: 30 });
  until(s, 'eraser', { seconds: 1 });
  assert.ok(s.p.flip > 0.9);
  for (let t = 0; t < 1; t += DT) step(s, DT);
  assert.equal(s.p.flip, 0);
});

test('самолётик и карандаш несут вверх положенное время, сквозь платформы и врагов; потом — прыжок и короткая защита', () => {
  for (const kind of ['plane', 'rocket']) {
    const { speed, time } = FLIGHTS[kind];
    const s = bare({
      plats: [{ x: 100, y: 0, item: { kind, ox: 0, hit: -1, taken: false } }, { x: 100, y: 400 }, { x: 100, y: 900 }],
      foes: [{ kind: 'blot', x: 100, y: 650 }, { kind: 'hole', x: 100, y: 1200 }],
      x: 100, y: 60, viewH: 860,
    });
    const item = s.plats[0].item;
    const events = until(s, 'flyend', { seconds: time + 2 });
    const fly = events.find((e) => e.type === 'fly');
    assert.equal(fly.kind, kind);
    assert.ok(!has(events, 'jump'), 'в полёте платформы не задеваются');
    assert.ok(has(events, 'bump'), 'клякса на пути сбита');
    assert.equal(s.phase, 'play', 'дырка в полёте не страшна');
    assert.ok(Math.abs(s.p.y - speed * time) < speed * 0.1, `${kind}: поднялась на ${Math.round(s.p.y)}`);
    assert.equal(s.p.fly, null);
    assert.equal(s.p.vy, FLY_EXIT);
    assert.ok(Math.abs(s.p.grace - FLY_GRACE) < 0.02);
    assert.equal(s.run.flights, 1);
    assert.ok(item.taken);
  }
});

test('после полёта FLY_GRACE секунд враги не страшны, потом — снова опасны', () => {
  // клякса — прямо над каракулей, на высоте above: полёт кончается под ней
  const make = (above) => {
    const s = bare({ plats: [], foes: [{ kind: 'blot', x: 100, y: 3000 + above }], x: 100, y: 3000 });
    s.p.fly = { kind: 'plane', left: DT / 2 };
    return until(s, 'die', { seconds: 2 });
  };
  const soon = make(BODY_H + 40);
  assert.ok(has(soon, 'bump') && !soon.some((e) => e.type === 'die' && e.cause === 'blot'), 'сразу после полёта клякса сбита');
  // защита тает: через FLY_GRACE её уже нет
  const g = bare({ plats: [{ x: W / 2, y: 2990, w: W, type: 'ground' }], x: 100, y: 3000 });
  g.p.fly = { kind: 'plane', left: DT / 2 };
  step(g, DT);
  assert.ok(g.p.grace > FLY_GRACE - 0.02);
  for (let t = 0; t < FLY_GRACE + 0.1; t += DT) step(g, DT);
  assert.equal(g.p.grace, 0);
  const late = bare({ plats: [], foes: [{ kind: 'blot', x: 100, y: 3000 + 120 }], x: 100, y: 3000, vy: JUMP });
  assert.equal(until(late, 'die', { seconds: 2 }).find((e) => e.type === 'die')?.cause, 'blot', 'без защиты снизу — гибель');
});

test('звёздочка: 10 секунд кляксы и двойки сбиваются касанием, дырка всё равно затягивает', () => {
  const s = bare({
    plats: [{ x: 100, y: 0, item: { kind: 'star', ox: 0, hit: -1, taken: false } }],
    foes: [{ kind: 'blot', x: 100, y: 120 }],
    x: 100, y: 10, vy: JUMP,
  });
  const events = until(s, 'bump', { seconds: 1 });
  assert.ok(has(events, 'shield') && has(events, 'bump'));
  assert.equal(s.phase, 'play');
  assert.ok(s.p.shield > SHIELD_TIME - 1);
  const end = until(s, 'shieldend', { seconds: SHIELD_TIME + 1 });
  assert.ok(has(end, 'shieldend'));
  assert.equal(s.p.shield, 0);

  const h = bare({ plats: [], foes: [{ kind: 'hole', x: 100, y: 0 }], x: 100, y: 60 });
  h.p.shield = SHIELD_TIME;
  assert.ok(has(until(h, 'die', { seconds: 1 }), 'die'), 'щит от дырки не спасает');
  assert.equal(h.cause, 'hole');
});

// ---------- враги ----------

test('на кляксу и двойку можно прыгнуть сверху: враг раздавлен, каракуля подлетает', () => {
  for (const kind of ['blot', 'two']) {
    const foe = kind === 'two' ? { kind, x: 100, y: 0, bx: 100, range: 0.001, period: 1, ph: 0 } : { kind, x: 100, y: 0 };
    const s = bare({ plats: [], foes: [foe], x: 100, y: 80 });
    const events = until(s, 'stomp', { seconds: 1 });
    assert.ok(has(events, 'stomp') && !has(events, 'die'), kind);
    assert.ok(s.p.vy > JUMP - 20 && s.p.vy <= JUMP);
    assert.ok(s.foes[0].dead >= 0);
    assert.equal(s.run.stomps, 1);
  }
});

test('снизу и сбоку враг убивает; причина — в событии', () => {
  const below = bare({ plats: [], foes: [{ kind: 'blot', x: 100, y: 120 }], x: 100, y: 0, vy: JUMP });
  const die = until(below, 'die', { seconds: 1 }).find((e) => e.type === 'die');
  assert.equal(die.cause, 'blot');
  assert.equal(below.phase, 'dying');
  const side = bare({ plats: [{ x: 100, y: 0, w: W, type: 'ground' }], foes: [{ kind: 'two', x: 200, y: 18, bx: 200, range: 0.001, period: 1, ph: 0 }], x: 100, y: 0 });
  const events = until(side, 'die', { seconds: 2, input: { dir: 1 } });
  assert.equal(events.find((e) => e.type === 'die').cause, 'two');
});

test('в стороне от врага — не задевает', () => {
  const keep = FOES.blot.hw + 14;
  const s = bare({ plats: [], foes: [{ kind: 'blot', x: 100, y: 120 }], x: 100 + keep + 2, y: 0, vy: JUMP });
  const events = until(s, 'die', { seconds: 0.6 });
  assert.ok(!has(events, 'die') && !has(events, 'stomp'));
});

test('двойка ходит в своих пределах', () => {
  const s = bare({ plats: [], foes: [{ kind: 'two', x: 150, y: 5000, bx: 150, range: 40, period: 2, ph: 0.1 }], y: 0 });
  s.plats = [{ id: 1, type: 'ground', x: W / 2, y: 0, w: W, item: null, gone: -1, hit: -1 }];
  const xs = [];
  for (let t = 0; t < 4; t += DT) {
    step(s, DT);
    xs.push(s.foes[0]?.x ?? 150);
  }
  assert.ok(Math.min(...xs) >= 110 - 1e-9 && Math.max(...xs) <= 190 + 1e-9);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 70);
});

test('дырка тянет к себе тем сильнее, чем ближе, и затягивает насовсем', () => {
  const far = bare({ plats: [{ x: W / 2, y: 0, w: W, type: 'ground' }], foes: [{ kind: 'hole', x: 100, y: 18 }], x: 100 + HOLE_PULL + 20, y: 0 });
  for (let t = 0; t < 2; t += DT) step(far, DT);
  assert.equal(far.p.x, 100 + HOLE_PULL + 20, 'дальше HOLE_PULL не тянет');
  const near = bare({ plats: [{ x: W / 2, y: 0, w: W, type: 'ground' }], foes: [{ kind: 'hole', x: 100, y: 18 }], x: 100 + HOLE_PULL - 25, y: 0 });
  const events = until(near, 'over', { seconds: 6 });
  assert.equal(events.find((e) => e.type === 'die').cause, 'hole');
  assert.ok(has(events, 'over'));
  assert.ok(Math.abs(near.dieT - HOLE_TIME) < 0.05);
  assert.ok(Math.abs(wrapDist(near.p.x, 100)) < 6, 'каракулю втянуло в дырку');
});

// ---------- гибель, камера, счёт ----------

test('упала ниже экрана — гибель, через OUT_TIME — конец; дальше мир стоит', () => {
  const s = bare({ plats: [], y: 300 });
  s.cam = 250;
  const events = until(s, 'over', { seconds: 5 });
  const order = events.filter((e) => e.type === 'die' || e.type === 'over').map((e) => e.type);
  assert.deepEqual(order, ['die', 'over']);
  assert.equal(s.cause, 'fall');
  assert.equal(s.phase, 'over');
  assert.ok(Math.abs(s.dieT - OUT_TIME) < 0.02);
  const frozen = JSON.stringify(s);
  assert.deepEqual(step(s, DT, { dx: 50 }), []);
  assert.equal(JSON.stringify(s), frozen);
});

test('то, что лежит ниже экрана, уже не спасает: ни платформа, ни самолётик на ней', () => {
  // платформа чуть ниже нижнего края (её ещё не убрали): каракуля скрывается за краем раньше, чем долетает до неё
  for (const item of [null, { kind: 'plane', ox: 0, hit: -1, taken: false }, { kind: 'spring', ox: 0, hit: -1, taken: false }]) {
    const s = bare({ plats: [{ x: W / 2, y: 0, item }], y: 200 });
    s.cam = 66;
    const events = until(s, 'over', { seconds: 4 });
    assert.deepEqual(events.map((e) => e.type), ['die', 'over'], `на платформе ${item?.kind ?? 'ничего'}`);
    assert.equal(s.cause, 'fall');
    assert.equal(s.p.fly, null);
  }
  // а платформа у самого края, пока каракулю ещё видно, — ловит
  const edge = bare({ plats: [{ x: W / 2, y: 0 }], y: 200 });
  edge.cam = 20;
  assert.ok(has(until(edge, 'jump', { seconds: 2 }), 'jump'));
  assert.equal(edge.phase, 'play');
});

test('сбитая врагом каракуля подскакивает, падает сквозь платформы и за экраном — конец', () => {
  const s = bare({ plats: [{ x: 100, y: -150 }], foes: [{ kind: 'blot', x: 100, y: 60 }], x: 100, y: 0, vy: 600 });
  s.cam = -260;
  const events = until(s, 'over', { seconds: 6 });
  assert.ok(has(events, 'die') && has(events, 'over') && !has(events, 'jump'));
  assert.ok(s.out > 0, 'сначала долетела до нижнего края');
  assert.ok(Math.abs(s.dieT - s.out - OUT_TIME) < 0.02);
});

test('лист едет только вверх; счёт — высота опоры, с которой прыгала выше всего', () => {
  const s = bare({ plats: [{ x: W / 2, y: 0 }, { x: W / 2, y: 140 }, { x: W / 2, y: 280 }, { x: W / 2, y: 420 }], y: 10 });
  let cam = s.cam;
  for (let t = 0; t < 6; t += DT) {
    step(s, DT);
    assert.ok(s.cam >= cam - 1e-9, 'камера не опускается');
    cam = s.cam;
    assert.ok(s.p.y <= s.cam + s.viewH * CAM_AT + 1e-6, 'каракуля не выше своей линии на экране');
  }
  assert.equal(score(s), cellsOf(420), 'стоит на верхней платформе');
  assert.ok(Math.abs(s.top - (420 + JUMP_H)) < 0.05);
});

// ---------- генератор ----------

test('путь наверх есть всегда: между соседними надёжными платформами — не дальше прыжка (80 зёрен × 3000 клеток)', () => {
  let worst = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { plats } = sheet(seed * 7919, 3000);
    const steps = plats.filter((a) => a.type === 'ground' || RELIABLE.has(a.type)).sort((a, b) => baseY(a) - baseY(b));
    assert.equal(steps[0].type, 'ground');
    for (let k = 1; k < steps.length; k++) {
      const gap = baseY(steps[k]) - baseY(steps[k - 1]);
      // качели: снизу они могут быть в нижней точке, сверху — в верхней
      const reach = (steps[k].type === 'vert' ? steps[k].range : 0) + (steps[k - 1].type === 'vert' ? steps[k - 1].range : 0);
      worst = Math.max(worst, gap + reach);
      assert.ok(gap <= MAX_GAP + 0.01, `зерно ${seed}: разрыв ${gap.toFixed(1)} на высоте ${Math.round(baseY(steps[k - 1]))}`);
      assert.ok(gap + reach <= MAX_REACH + 0.01, `зерно ${seed}: с размахом качелей ${(gap + reach).toFixed(1)}`);
    }
  }
  assert.ok(MAX_REACH < JUMP_H - 10 && MAX_GAP < JUMP_H - 25, 'запас до высоты прыжка');
  assert.ok(worst > MAX_GAP - 5, `наверху платформы и правда редкие (самый большой разрыв ${worst.toFixed(0)})`);
});

test('платформы — в пределах листа и не налезают друг на друга', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { plats } = sheet(seed * 31 + 7, 2600);
    for (const a of plats) {
      if (a.type === 'ground') continue;
      assert.ok(TYPES.includes(a.type));
      const lo = a.type === 'move' ? a.bx - a.range : a.x;
      const hi = a.type === 'move' ? a.bx + a.range : a.x;
      assert.ok(lo - a.w / 2 >= -0.01 && hi + a.w / 2 <= W + 0.01, `зерно ${seed}: ${a.type} за краем листа (${lo.toFixed(0)}…${hi.toFixed(0)})`);
      if (a.type === 'move' || a.type === 'vert') assert.ok(a.period > 0.5 && a.range > 0);
      if (a.item) assert.ok(ITEMS.includes(a.item.kind) && Math.abs(a.item.ox) <= a.w / 2);
    }
    const fixed = plats.filter((a) => a.type === 'solid' || a.type === 'once' || a.type === 'crumble').sort((a, b) => a.y - b.y);
    for (let i = 0; i < fixed.length; i++) {
      for (let j = i + 1; j < fixed.length && fixed[j].y - fixed[i].y < 20; j++) {
        assert.ok(Math.abs(fixed[i].x - fixed[j].x) >= (fixed[i].w + fixed[j].w) / 2 + 6,
          `зерно ${seed}: платформы налезают на высоте ${Math.round(fixed[i].y)}`);
      }
    }
    // качели не задевают соседей по высоте
    for (const v of plats.filter((a) => a.type === 'vert')) {
      for (const a of plats) {
        if (a === v || a.type === 'ground') continue;
        const dy = Math.abs(baseY(a) - v.by) - v.range - (a.type === 'vert' ? a.range : 0);
        if (dy < 16) assert.ok(Math.abs(a.x - v.x) >= (a.w + v.w) / 2 + 4 || a.type === 'move', `зерно ${seed}: качели задевают ${a.type}`);
      }
    }
  }
});

test('под врагом нет платформ, с которых прыгаешь прямо в него, — в том числе с пружинки и ластика', () => {
  let foes = 0;
  const kinds = {};
  for (let seed = 1; seed <= 60; seed++) {
    const made = sheet(seed * 104729, 3600);
    for (const f of made.foes) {
      foes += 1;
      kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
      assert.ok(f.kind === 'hole' || FOES[f.kind]);
      const fx = f.kind === 'two' ? f.bx : f.x;
      for (const a of made.plats) {
        if (a.type === 'ground' || a.type === 'crumble' || !underFoe(a, f)) continue;
        const keep = foeKeep(a, f);
        const apart = a.type === 'move' ? Math.abs(fx - a.bx) - a.range : Math.abs(wrapDist(fx, a.x));
        assert.ok(apart >= keep - 0.01, `зерно ${seed}: ${f.kind} на ${Math.round(f.y)} над платформой ${a.type}${a.item ? `+${a.item.kind}` : ''} (до неё ${apart.toFixed(0)}, нужно ${keep.toFixed(0)})`);
      }
    }
  }
  assert.ok(foes > 60 * 15, `врагов хватает: ${foes}`);
  assert.ok(kinds.blot > kinds.two && kinds.two > kinds.hole && kinds.hole > 30, JSON.stringify(kinds));
});

test('всё появляется со своей высоты: сначала только обычные платформы', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const made = sheet(seed * 13 + 1, 1300);
    for (const a of made.plats) {
      const cells = baseY(a) / CELL;
      if (a.type !== 'ground' && a.type !== 'solid') assert.ok(cells >= OPEN[a.type], `зерно ${seed}: ${a.type} на ${cells.toFixed(0)}`);
      if (a.item && a.item.kind !== 'spring') assert.ok(cells >= OPEN[a.item.kind], `зерно ${seed}: ${a.item.kind} на ${cells.toFixed(0)}`);
    }
    for (const f of made.foes) assert.ok(f.y / CELL >= OPEN[f.kind], `зерно ${seed}: ${f.kind} на ${(f.y / CELL).toFixed(0)}`);
    const first = made.plats.filter((a) => a.type === 'solid' && a.y < 700);
    assert.ok(first.some((a) => a.item?.kind === 'spring'), `зерно ${seed}: в начале есть пружинка — познакомиться`);
  }
});

test('с высотой платформ меньше, а обманок и врагов больше', () => {
  const count = (list, lo, hi, ok) => list.filter((a) => baseY(a) >= lo * CELL && baseY(a) < hi * CELL && ok(a)).length;
  let low = 0;
  let high = 0;
  let fakeLow = 0;
  let fakeHigh = 0;
  let foeLow = 0;
  let foeHigh = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const made = sheet(seed * 977, 3400);
    low += count(made.plats, 0, 400, (a) => RELIABLE.has(a.type));
    high += count(made.plats, 2800, 3200, (a) => RELIABLE.has(a.type));
    fakeLow += count(made.plats, 0, 400, (a) => a.type === 'crumble');
    fakeHigh += count(made.plats, 2800, 3200, (a) => a.type === 'crumble');
    foeLow += count(made.foes.map((f) => ({ ...f, type: 'foe' })), 300, 700, () => true);
    foeHigh += count(made.foes.map((f) => ({ ...f, type: 'foe' })), 2800, 3200, () => true);
  }
  assert.ok(high < low * 0.7, `надёжных: внизу ${low}, наверху ${high}`);
  assert.ok(fakeHigh > fakeLow * 1.5, `обманок: внизу ${fakeLow}, наверху ${fakeHigh}`);
  assert.ok(foeHigh > foeLow, `врагов: внизу ${foeLow}, наверху ${foeHigh}`);
});

test('самолётики и карандаши редки: между ними — тысячи единиц высоты', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const flights = sheet(seed * 61, 3000).plats.filter((a) => FLIGHTS[a.item?.kind]).sort((a, b) => a.y - b.y);
    for (let k = 1; k < flights.length; k++) assert.ok(flights[k].y - flights[k - 1].y >= 4000, `зерно ${seed}`);
  }
});

test('одно зерно — один и тот же лист; разные зёрна — разные', () => {
  const a = sheet(4242, 600);
  const b = sheet(4242, 600);
  assert.deepEqual(a, b);
  assert.notDeepEqual(sheet(4243, 600).plats.slice(0, 20), a.plats.slice(0, 20));
});

// ---------- бот ----------

test('landTime: когда каракуля опустится на высоту', () => {
  const p = { y: 0, vy: JUMP };
  assert.ok(Math.abs(landTime(p, 0) - (2 * JUMP) / GRAVITY) < 1e-9);
  assert.equal(landTime(p, JUMP_H + 1), null, 'выше прыжка не достанет');
  assert.ok(landTime({ y: 100, vy: 0 }, 0) > 0);
});

test('бот проходит лист: 30 зёрен по 3 минуты — жив, не застревает, набирает высоту', () => {
  let dead = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = newGame({ seed: seed * 7919, viewH: 640 });
    const bot = createBot();
    let top = 0;
    let topAt = 0;
    let stall = 0;
    while (s.phase !== 'over' && s.t < 180) {
      step(s, DT, { dx: bot(s, DT) });
      if (s.top > top + 1) {
        top = s.top;
        topAt = s.t;
      }
      stall = Math.max(stall, s.t - topAt);
    }
    if (s.phase === 'over') dead += 1;
    // тупик — когда выше идти некуда: бот прыгал бы на месте до конца
    assert.ok(stall < 12, `зерно ${seed}: бот ${stall.toFixed(0)} с не мог подняться (высота ${score(s)})`);
    if (s.phase !== 'over') assert.ok(score(s) > 1700, `зерно ${seed}: за 3 минуты только ${score(s)}`);
    assert.ok(score(s) > 500, `зерно ${seed}: высота ${score(s)}`);
  }
  assert.ok(dead <= 1, `бот погиб в ${dead} партиях из 30`);
});

test('бот проходит и на самом низком, и на самом высоком экране', () => {
  for (const viewH of [VIEW_MIN, VIEW_MAX]) {
    let alive = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame({ seed: seed * 104729, viewH });
      const bot = createBot();
      while (s.phase !== 'over' && s.t < 120) step(s, DT, { dx: bot(s, DT) });
      if (s.phase !== 'over') alive += 1;
    }
    assert.ok(alive >= 10, `экран ${viewH}: выжил в ${alive} из 12`);
  }
});

// ---------- сохранение ----------

function played(seed, seconds) {
  const s = newGame({ seed, viewH: 640 });
  const bot = createBot();
  while (s.phase === 'play' && s.t < seconds) step(s, DT, { dx: bot(s, DT) });
  return s;
}

test('партию можно сохранить и продолжить с того же места: дальше она идёт так же', () => {
  const s = played(777, 40);
  assert.equal(s.phase, 'play');
  const saved = JSON.parse(JSON.stringify(snapshot(s)));
  assert.ok(isValidState(saved));
  assert.ok(JSON.stringify(saved).length < 40000, `снимок ${JSON.stringify(saved).length} байт`);
  const copy = restore(saved, 640);
  assert.ok(copy);
  assert.equal(score(copy), score(s));
  // одинаковый ввод — одинаковое продолжение (генератор продолжает с того же зерна)
  const moves = [];
  for (let k = 0; k < 600; k++) moves.push(Math.sin(k / 9) * 6);
  for (const dx of moves) {
    step(s, DT, { dx });
    step(copy, DT, { dx });
  }
  assert.equal(copy.phase, s.phase);
  assert.ok(Math.abs(copy.p.x - s.p.x) < 1e-6 && Math.abs(copy.p.y - s.p.y) < 1e-6);
  assert.equal(copy.gen.id, s.gen.id);
  assert.deepEqual(copy.plats.map((a) => [a.id, a.type]), s.plats.map((a) => [a.id, a.type]));
});

test('сохраняется только идущая партия; на другом экране она подстраивается под его высоту', () => {
  assert.equal(snapshot(newGame({ seed: 3 })), null, 'каракуля ещё на земле — сохранять нечего');
  const dying = bare({ plats: [], y: 300 });
  dying.cam = 250;
  until(dying, 'die', { seconds: 3 });
  assert.equal(snapshot(dying), null);
  assert.equal(snapshot(null), null);
  const s = played(91, 20);
  const tall = restore(snapshot(s), 5000);
  assert.equal(tall.viewH, VIEW_MAX);
  assert.ok(tall.gen.y >= tall.cam + tall.viewH, 'платформы достроены до верха нового экрана');
  assert.equal(restore(snapshot(s), 100).viewH, VIEW_MIN);
});

test('испорченное сохранение не принимается', () => {
  const good = snapshot(played(55, 25));
  assert.ok(isValidState(good));
  const broken = (change) => {
    const d = JSON.parse(JSON.stringify(good));
    change(d);
    return d;
  };
  const cases = [
    null, undefined, 5, 'x', [], {},
    broken((d) => { d.v = 99; }),
    broken((d) => { d.phase = 'dying'; }),
    broken((d) => { d.rs = -1; }),
    broken((d) => { d.rs = 1.5; }),
    broken((d) => { d.t = null; }),
    broken((d) => { d.cam = 'высоко'; }),
    broken((d) => { d.p.x = W + 5; }),
    broken((d) => { d.p.y = null; }),
    broken((d) => { d.p.y = d.cam - 500; }),
    broken((d) => { d.p.vy = 1e9; }),
    broken((d) => { d.p.face = 0; }),
    broken((d) => { d.p.fly = { kind: 'ufo', left: 1 }; }),
    broken((d) => { d.p.fly = { kind: 'plane', left: 99 }; }),
    broken((d) => { d.p.shield = 999; }),
    broken((d) => { d.p.grace = -1; }),
    broken((d) => { delete d.p; }),
    broken((d) => { d.plats = 'нет'; }),
    broken((d) => { d.plats[0].type = 'лава'; }),
    broken((d) => { d.plats[0].x = null; }),
    broken((d) => { d.plats.push({ id: 1, type: 'move', x: 1, y: 1, w: 62, gone: -1, hit: -1, item: null }); }),
    broken((d) => { d.plats[0].item = { kind: 'бомба', ox: 0, hit: -1, taken: false }; }),
    broken((d) => { d.plats = Array(500).fill(d.plats[0]); }),
    broken((d) => { d.foes = [{ id: 1, kind: 'дракон', x: 1, y: 1, dead: -1 }]; }),
    broken((d) => { d.foes = [{ id: 1, kind: 'two', x: 1, y: 1, dead: -1 }]; }),
    broken((d) => { d.gen.y = d.cam - 10; }),
    broken((d) => { d.gen.last = 'нет такого куска'; }),
    broken((d) => { d.gen.id = -3; }),
    broken((d) => { delete d.gen; }),
    broken((d) => { d.run.jumps = -1; }),
    broken((d) => { delete d.run; }),
  ];
  for (const [k, d] of cases.entries()) {
    assert.equal(isValidState(d), false, `случай ${k}`);
    assert.equal(restore(d, 640), null, `случай ${k}`);
  }
});

// ---------- статистика ----------

test('статистика: партия добавляет своё, рекорд — лучший счёт', () => {
  assert.ok(isValidStats(emptyStats()));
  const s = played(321, 30);
  const one = recordGame(emptyStats(), s);
  assert.ok(isValidStats(one));
  assert.equal(one.games, 1);
  assert.equal(one.best, score(s));
  assert.equal(one.cells, score(s));
  assert.equal(one.jumps, s.run.jumps);
  assert.ok(one.jumps > 10);
  const low = newGame({ seed: 2 });
  const two = recordGame(one, low);
  assert.equal(two.games, 2);
  assert.equal(two.best, one.best, 'рекорд не падает');
  assert.equal(two.cells, one.cells);
  for (const bad of [null, {}, [], { ...emptyStats(), best: -1 }, { ...emptyStats(), games: 1.5 }, { ...emptyStats(), jumps: '7' }]) {
    assert.equal(isValidStats(bad), false);
  }
});
