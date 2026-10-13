// Альбомный экран (shell/landscape.js): когда и в какую сторону кладётся экран, куда попадает касание (сверяется с
// независимым прямым преобразованием — тем самым transform, который получает браузер), как пересчитываются отступы;
// и сам помощник на подставных окне и платформе: стили, оповещения только при настоящем изменении, закрепление
// ориентации только на лежащем телефоне, уборка за собой.

import test from 'node:test';
import assert from 'node:assert/strict';

import { turnOf, placeOf, toLocal, insetsOf, createLandscape } from '../landscape.js';

const TURNS = [0, 90, -90];
const near = (a, b, note) => assert.ok(Math.abs(a - b) < 1e-9, `${note}: ${a} вместо ${b}`);

/**
 * Прямое преобразование, как его делает браузер: точка экрана игры → точка устройства. Матрица собирается из строки
 * transform, которую выдаёт placeOf (translate, потом rotate, начало — левый верхний угол), плюс left/top.
 */
function forward(box, turn, lx, ly) {
  const css = placeOf(box, turn);
  const shift = css.transform.match(/translate\((-?[\d.]+)(?:px)?, (-?[\d.]+)(?:px)?\)/);
  const angle = css.transform.match(/rotate\((-?[\d.]+)deg\)/);
  const a = ((angle ? Number(angle[1]) : 0) * Math.PI) / 180;
  const tx = shift ? Number(shift[1]) : 0;
  const ty = shift ? Number(shift[2]) : 0;
  return {
    x: parseFloat(css.left) + tx + lx * Math.cos(a) - ly * Math.sin(a),
    y: parseFloat(css.top) + ty + lx * Math.sin(a) + ly * Math.cos(a),
  };
}

test('поворот: набок кладётся только высокий экран телефона; компьютер и широкий экран — как есть', () => {
  const table = [
    [{ w: 390, h: 844 }, 90, 'телефон стоя'],
    [{ w: 390, h: 844, flip: true }, -90, 'телефон стоя, на другой бок'],
    [{ w: 844, h: 390 }, 0, 'телефон уже повёрнут'],
    [{ w: 844, h: 390, flip: true }, 0, 'повёрнут — другой бок ни при чём'],
    [{ w: 500, h: 500 }, 0, 'квадрат поворачивать незачем'],
    [{ w: 390, h: 391 }, 90, 'чуть выше, чем шире'],
    [{ w: 380, h: 640, desktop: true }, 0, 'узкое окно на компьютере'],
    [{ w: 380, h: 640, desktop: true, flip: true }, 0, 'на компьютере не поворачиваем никогда'],
    [{ w: 1100, h: 800, desktop: true }, 0, 'широкое окно на компьютере'],
  ];
  for (const [args, want, note] of table) assert.equal(turnOf(args), want, note);
});

test('стили экрана: место — рамка, размер — «шире, чем выше», поворот вокруг левого верхнего угла', () => {
  const box = { x: 0, y: 48, w: 390, h: 796 };
  assert.deepEqual(placeOf(box, 0), {
    position: 'fixed', left: '0px', top: '48px', width: '390px', height: '796px', 'transform-origin': '0 0', transform: 'none',
  });
  assert.deepEqual(placeOf(box, 90), {
    position: 'fixed', left: '0px', top: '48px', width: '796px', height: '390px', 'transform-origin': '0 0',
    transform: 'translate(390px, 0) rotate(90deg)',
  });
  assert.deepEqual(placeOf(box, -90), {
    position: 'fixed', left: '0px', top: '48px', width: '796px', height: '390px', 'transform-origin': '0 0',
    transform: 'translate(0, 796px) rotate(-90deg)',
  });
});

test('касание → оси игры: углы и центр рамки при всех трёх поворотах', () => {
  const box = { x: 10, y: 48, w: 390, h: 796 };
  const at = (turn, cx, cy) => toLocal(box, turn, cx, cy);
  const [L, T, R, B] = [box.x, box.y, box.x + box.w, box.y + box.h];
  // без поворота — просто от угла рамки
  assert.deepEqual(at(0, L, T), { x: 0, y: 0 });
  assert.deepEqual(at(0, R, B), { x: 390, y: 796 });
  assert.deepEqual(at(0, L + 195, T + 398), { x: 195, y: 398 });
  // 90: лево игры — верх телефона, верх игры — правый край телефона
  assert.deepEqual(at(90, R, T), { x: 0, y: 0 }, 'левый верхний угол игры — правый верхний угол телефона');
  assert.deepEqual(at(90, R, B), { x: 796, y: 0 }, 'правый верхний');
  assert.deepEqual(at(90, L, B), { x: 796, y: 390 }, 'правый нижний');
  assert.deepEqual(at(90, L, T), { x: 0, y: 390 }, 'левый нижний');
  assert.deepEqual(at(90, L + 195, T + 398), { x: 398, y: 195 }, 'центр');
  // −90: лево игры — низ телефона, верх игры — левый край телефона
  assert.deepEqual(at(-90, L, B), { x: 0, y: 0 }, 'левый верхний угол игры — левый нижний угол телефона');
  assert.deepEqual(at(-90, L, T), { x: 796, y: 0 }, 'правый верхний');
  assert.deepEqual(at(-90, R, T), { x: 796, y: 390 }, 'правый нижний');
  assert.deepEqual(at(-90, R, B), { x: 0, y: 390 }, 'левый нижний');
  assert.deepEqual(at(-90, L + 195, T + 398), { x: 398, y: 195 }, 'центр');
  // свой объект для ответа — пишется в него (без новых объектов на каждое движение пальца)
  const out = { x: 0, y: 0 };
  assert.equal(toLocal(box, 90, R, T + 7, out), out);
  assert.deepEqual(out, { x: 7, y: 0 });
});

test('касание → оси игры обратно преобразованию браузера: точка игры → экран → снова та же точка', () => {
  const boxes = [{ x: 0, y: 0, w: 390, h: 844 }, { x: 0, y: 48, w: 390, h: 796 }, { x: 7, y: 13, w: 320, h: 568 }, { x: 0, y: 0, w: 844, h: 390 }];
  for (const box of boxes) {
    for (const turn of TURNS) {
      const w = turn === 0 ? box.w : box.h;
      const h = turn === 0 ? box.h : box.w;
      for (const [lx, ly] of [[0, 0], [w, 0], [w, h], [0, h], [w / 2, h / 2], [33.5, 71.25], [w - 1, 1]]) {
        const p = forward(box, turn, lx, ly);
        // точка игры после поворота не вылетает за рамку…
        assert.ok(p.x >= box.x - 1e-9 && p.x <= box.x + box.w + 1e-9 && p.y >= box.y - 1e-9 && p.y <= box.y + box.h + 1e-9,
          `поворот ${turn}: (${lx}, ${ly}) ушла за рамку — (${p.x}, ${p.y})`);
        // …и касание в этом месте экрана возвращается в ту же точку игры
        const back = toLocal(box, turn, p.x, p.y);
        near(back.x, lx, `поворот ${turn}, x`);
        near(back.y, ly, `поворот ${turn}, y`);
      }
    }
  }
});

test('отступы: полосы устройства оказываются у тех краёв игры, куда их унёс поворот', () => {
  const device = { top: 105, right: 3, bottom: 34, left: 7 };
  assert.deepEqual(insetsOf(device, 0), { top: 105, right: 3, bottom: 34, left: 7 });
  assert.deepEqual(insetsOf(device, 90), { left: 105, top: 3, right: 34, bottom: 7 }, 'верх телефона (часы, кнопки Telegram) — слева');
  assert.deepEqual(insetsOf(device, -90), { left: 34, top: 7, right: 105, bottom: 3 }, 'верх телефона — справа');
  // то же — геометрией: полоса у края устройства, прогнанная через toLocal, прижата к ожидаемому краю игры
  const box = { x: 0, y: 0, w: 390, h: 844 };
  const strips = {
    top: [0, 0, box.w, device.top],
    right: [box.w - device.right, 0, box.w, box.h],
    bottom: [0, box.h - device.bottom, box.w, box.h],
    left: [0, 0, device.left, box.h],
  };
  for (const turn of TURNS) {
    const w = turn === 0 ? box.w : box.h;
    const h = turn === 0 ? box.h : box.w;
    const got = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const [x0, y0, x1, y1] of Object.values(strips)) {
      const a = toLocal(box, turn, x0, y0);
      const b = toLocal(box, turn, x1, y1);
      const [lx0, lx1, ly0, ly1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
      // полоса идёт вдоль одной из сторон игры во всю её длину; её толщина — отступ с этой стороны
      if (lx1 - lx0 === w) got[ly0 === 0 ? 'top' : 'bottom'] = ly1 - ly0;
      else got[lx0 === 0 ? 'left' : 'right'] = lx1 - lx0;
    }
    assert.deepEqual(insetsOf(device, turn), got, `поворот ${turn}`);
  }
});

test('отступы: мусор и пустое — нули, дробное — до пикселя', () => {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  assert.deepEqual(insetsOf(null, 90), zero);
  assert.deepEqual(insetsOf(undefined, 0), zero);
  assert.deepEqual(insetsOf({ top: -5, right: NaN, bottom: '34', left: Infinity }, 0), zero);
  assert.deepEqual(insetsOf({ top: 47.4, right: 0, bottom: 33.6, left: 0 }, 0), { top: 47, right: 0, bottom: 34, left: 0 });
});

// ---------- помощник на подставных окне и платформе ----------

function fakeEl() {
  const classes = new Set();
  const style = new Map();
  return {
    classes,
    css: style,
    faded: 0,
    dataset: {},
    parentElement: null,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: { setProperty: (k, v) => style.set(k, v), removeProperty: (k) => style.delete(k) },
    animate() { this.faded += 1; },
  };
}

/** Окно w × h; рамка #app — всё окно без шапки высотой top; body — всё окно. */
function world({ w = 390, h = 844, top = 0, desktop = false, calm = false } = {}) {
  const state = { w, h, top, insets: { top: 0, right: 0, bottom: 0, left: 0 }, calls: [] };
  const handlers = new Map();
  const subs = { insets: new Set(), activated: new Set() };
  let frames = [];
  let timers = 0;
  const rect = (x, y, bw, bh) => ({ left: x, top: y, right: x + bw, bottom: y + bh, width: bw, height: bh });
  const win = {
    get innerWidth() { return state.w; },
    get innerHeight() { return state.h; },
    addEventListener: (type, fn) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    removeEventListener: (type, fn) => handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn)),
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    setTimeout: () => { timers += 1; return timers; },
    clearTimeout: () => {},
    matchMedia: () => ({ matches: calm }),
  };
  const rootCss = new Map();
  const doc = {
    documentElement: {
      css: rootCss,
      dataset: { fullscreen: 'off' },
      classList: { contains: () => false },
      style: { setProperty: (k, v) => rootCss.set(k, v), removeProperty: (k) => rootCss.delete(k) },
    },
    body: { getBoundingClientRect: () => rect(0, 0, state.w, state.h) },
  };
  const app = { getBoundingClientRect: () => rect(0, state.top, state.w, state.h - state.top) };
  const platform = {
    isDesktop: desktop,
    insets: () => state.insets,
    onInsets(cb) { subs.insets.add(cb); return () => subs.insets.delete(cb); },
    onActivated(cb) { subs.activated.add(cb); return () => subs.activated.delete(cb); },
    orientation: { lock: () => state.calls.push('lock'), unlock: () => state.calls.push('unlock') },
  };
  return {
    state, win, doc, app, platform, subs, handlers,
    /** Событие окна и следующий кадр. */
    fire(type) {
      for (const fn of handlers.get(type) ?? []) fn();
      this.frame();
    },
    frame() {
      const run = frames;
      frames = [];
      run.forEach((fn) => fn());
    },
    listeners: () => [...handlers.values()].reduce((n, list) => n + list.length, 0) + subs.insets.size + subs.activated.size,
  };
}

test('помощник: телефон стоя — экран лежит на боку под шапкой, игре достаётся «шире, чем выше»', () => {
  const W = world({ top: 48 });
  const el = fakeEl();
  const land = createLandscape(el, W);
  assert.ok(el.classes.has('screen-land'));
  assert.equal(el.dataset.turn, '90');
  assert.equal(el.css.get('position'), 'fixed');
  assert.equal(el.css.get('top'), '48px');
  assert.equal(el.css.get('width'), '796px');
  assert.equal(el.css.get('height'), '390px');
  assert.equal(el.css.get('transform'), 'translate(390px, 0) rotate(90deg)');
  assert.equal(el.css.get('transform-origin'), '0 0');
  assert.equal(land.api.turn, 90);
  assert.equal(land.api.rotated, true);
  assert.deepEqual(land.api.size(), { w: 796, h: 390 });
  assert.deepEqual(land.api.toLocal(390, 48), { x: 0, y: 0 }, 'правый верхний угол рамки — начало осей игры');
  assert.deepEqual(land.api.toLocal(0, 844), { x: 796, y: 390 });
  assert.deepEqual(land.api.insets(), { top: 0, right: 0, bottom: 0, left: 0 });
  for (const name of ['--ls-t', '--ls-r', '--ls-b', '--ls-l']) assert.equal(el.css.get(name), '0px', name);
  assert.deepEqual(W.state.calls, [], 'стоя ориентацию не закрепляем — закрепился бы портрет');
});

test('помощник: полный экран Telegram — рамка весь body, отступы устройства переходят в оси игры', () => {
  const W = world({ top: 105 });                      // поля body (часы и кнопки Telegram) съели верх #app
  W.doc.documentElement.dataset.fullscreen = 'on';
  W.state.insets = { top: 105, right: 0, bottom: 34, left: 0 };
  const el = fakeEl();
  const land = createLandscape(el, W);
  assert.equal(el.css.get('top'), '0px', 'игра — в край, под часы и кнопки');
  assert.deepEqual(land.api.size(), { w: 844, h: 390 });
  assert.deepEqual(land.api.insets(), { left: 105, top: 0, right: 34, bottom: 0 });
  assert.equal(el.css.get('--ls-l'), '105px');
  assert.equal(el.css.get('--ls-r'), '34px');
  land.api.flip(true);
  assert.equal(el.dataset.turn, '-90');
  assert.equal(el.css.get('transform'), 'translate(0, 844px) rotate(-90deg)');
  assert.deepEqual(land.api.insets(), { left: 34, top: 0, right: 105, bottom: 0 }, 'на другом боку часы — справа');
  assert.equal(land.api.flipped, true);
});

test('помощник: сообщениям оболочки (они вне экрана игры) — поворот и верхний отступ игры на <html>', () => {
  const W = world();
  const root = W.doc.documentElement;
  W.state.insets = { top: 59, right: 12, bottom: 34, left: 0 };
  const land = createLandscape(fakeEl(), W);
  assert.equal(root.dataset.land, '90');
  assert.equal(root.css.get('--land-t'), '12px', 'верх игры — правый край телефона');
  land.api.flip(true);
  assert.equal(root.dataset.land, '-90');
  assert.equal(root.css.get('--land-t'), '0px', 'на другом боку верх игры — левый край телефона');
  land.dispose();
  assert.ok(!('land' in root.dataset), 'игра закрыта — признака нет');
  assert.equal(root.css.size, 0);
  assert.equal(root.dataset.fullscreen, 'off', 'чужие признаки на месте');
});

test('помощник: обработчики зовутся только при настоящем изменении и после стилей', () => {
  const W = world();
  const el = fakeEl();
  const land = createLandscape(el, W);
  const seen = [];
  const off = land.api.onChange(() => seen.push(`${land.api.turn} ${el.css.get('width')} ${el.css.get('--ls-l')}`));
  // Telegram шлёт события пачками и без изменений
  for (let i = 0; i < 5; i += 1) W.subs.insets.forEach((cb) => cb());
  W.fire('resize');
  W.fire('orientationchange');
  assert.deepEqual(seen, [], 'ничего не изменилось — никого не зовём');
  // пришли отступы
  W.state.insets = { top: 59, right: 0, bottom: 34, left: 0 };
  for (let i = 0; i < 3; i += 1) W.subs.insets.forEach((cb) => cb());
  W.frame();
  assert.deepEqual(seen, ['90 844px 59px'], 'три события за кадр — одно оповещение, стили уже стоят');
  // окно стало другим
  W.state.h = 800;
  W.fire('resize');
  assert.deepEqual(seen.at(-1), '90 800px 59px');
  assert.equal(seen.length, 2);
  // отписка
  off();
  W.state.h = 700;
  W.fire('resize');
  assert.equal(seen.length, 2);
  assert.equal(el.css.get('width'), '700px', 'стили при этом обновились');
});

test('помощник: переворот на другой бок — сразу, с проявлением; при «уменьшить движение» — без него', () => {
  const W = world();
  const el = fakeEl();
  const land = createLandscape(el, W);
  let calls = 0;
  land.api.onChange(() => { calls += 1; });
  assert.equal(el.faded, 0, 'первая укладка — без проявления (экран и так появляется плавно)');
  land.api.flip(true);
  assert.equal(land.api.turn, -90);
  assert.equal(calls, 1);
  assert.equal(el.faded, 1);
  land.api.flip(true);
  assert.equal(calls, 1, 'повтор — не изменение');
  land.api.flip(false);
  assert.equal(land.api.turn, 90);
  assert.equal(el.faded, 2);

  const quiet = world({ calm: true });
  const el2 = fakeEl();
  createLandscape(el2, quiet).api.flip(true);
  assert.equal(el2.dataset.turn, '-90');
  assert.equal(el2.faded, 0);
});

test('помощник: телефон повёрнут — без поворота, ориентация закрепляется; встал обратно — отпускается', () => {
  const W = world({ w: 844, h: 390 });
  const el = fakeEl();
  const land = createLandscape(el, W);
  assert.equal(land.api.turn, 0);
  assert.equal(land.api.rotated, false);
  assert.equal(el.css.get('transform'), 'none');
  assert.deepEqual(land.api.size(), { w: 844, h: 390 });
  assert.deepEqual(W.state.calls, ['lock']);
  W.fire('resize');
  W.subs.insets.forEach((cb) => cb());
  W.frame();
  assert.deepEqual(W.state.calls, ['lock'], 'закрепляем один раз');
  // свернули, встали, вернулись: клиент закрепил бы портрет — отпускаем и кладём экран набок сами
  [W.state.w, W.state.h] = [390, 844];
  W.subs.activated.forEach((cb) => cb());
  W.frame();
  assert.deepEqual(W.state.calls, ['lock', 'unlock']);
  assert.equal(land.api.turn, 90);
  // снова положили телефон
  [W.state.w, W.state.h] = [844, 390];
  W.fire('resize');
  assert.deepEqual(W.state.calls, ['lock', 'unlock', 'lock']);
  // вернулись в приложение лёжа — просьба повторяется (клиент мог отпустить, пока был свёрнут)
  W.subs.activated.forEach((cb) => cb());
  W.frame();
  assert.deepEqual(W.state.calls, ['lock', 'unlock', 'lock', 'lock']);
  land.dispose();
  assert.deepEqual(W.state.calls, ['lock', 'unlock', 'lock', 'lock', 'unlock'], 'игра закрыта — ориентация свободна');
});

test('помощник: широкая рамка у стоящего телефона (мини-приложение на пол-экрана) — ориентацию не трогаем', () => {
  const W = world({ w: 390, h: 844 });
  W.app.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: 360, width: 390, height: 360 });
  const el = fakeEl();
  const land = createLandscape(el, W);
  assert.equal(land.api.turn, 0, 'рамка широкая — не поворачиваем');
  assert.deepEqual(W.state.calls, [], 'но окно стоит — закрепился бы портрет');
});

test('помощник: на компьютере — ни поворота, ни закрепления, каким бы ни было окно', () => {
  for (const [w, h] of [[380, 640], [1100, 800]]) {
    const W = world({ w, h, desktop: true });
    const el = fakeEl();
    const land = createLandscape(el, W);
    assert.equal(land.api.turn, 0);
    assert.equal(el.css.get('transform'), 'none');
    assert.deepEqual(land.api.size(), { w, h });
    assert.deepEqual(land.api.toLocal(100, 50), { x: 100, y: 50 });
    land.api.flip(true);
    assert.equal(land.api.turn, 0);
    assert.deepEqual(W.state.calls, []);
  }
});

test('помощник: экран ещё не разложен (нулевая рамка) — ждём, стили не трогаем', () => {
  const W = world();
  W.app.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  const el = fakeEl();
  const land = createLandscape(el, W);
  assert.equal(el.css.size, 0);
  assert.ok(!el.classes.has('screen-land'));
  assert.deepEqual(land.api.size(), { w: 0, h: 0 });
  W.app.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 });
  W.fire('resize');
  assert.equal(el.dataset.turn, '90');
});

test('помощник: forget снимает обработчики игры, dispose возвращает экран как был и отписывается от всего', () => {
  const W = world();
  const el = fakeEl();
  const land = createLandscape(el, W);
  let calls = 0;
  land.api.onChange(() => { calls += 1; });
  land.forget();
  land.api.flip(true);
  assert.equal(calls, 0, 'закрытую игру больше не зовём, даже если она не отписалась');
  assert.ok(W.listeners() > 0);
  land.dispose();
  assert.equal(el.css.size, 0, 'ни стилей, ни переменных');
  assert.ok(!el.classes.has('screen-land'));
  assert.ok(!('turn' in el.dataset));
  assert.equal(W.listeners(), 0, 'обработчики окна и платформы сняты');
  // после уборки события ничего не меняют
  W.state.h = 500;
  W.fire('resize');
  land.sync();
  land.api.flip(false);
  assert.equal(el.css.size, 0);
  land.dispose();
});

test('помощник: упавший обработчик не мешает остальным', () => {
  const W = world();
  const el = fakeEl();
  const land = createLandscape(el, W);
  const error = console.error;
  console.error = () => {};
  try {
    let ok = 0;
    land.api.onChange(() => { throw new Error('игра сломалась'); });
    land.api.onChange(() => { ok += 1; });
    land.api.flip(true);
    assert.equal(ok, 1);
  } finally {
    console.error = error;
  }
});
