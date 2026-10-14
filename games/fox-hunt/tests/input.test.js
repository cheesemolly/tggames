// Управление «Лисьей охоты»: правила джойстиков, мыши и клавиш проверяются на ядре (createStickCore — без страницы,
// со своими часами); обёртка createInput — на подставной странице: события указателя в повёрнутом экране доходят до
// ядра в осях игры, раскладка в обработчиках не читается; по исходнику — что в кадре не создаётся объектов, а
// джойстики двигаются только через transform; блок «стики» в game.css — на месте и без своих цветов.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STICK, KEY_FREE, KEY_TAKEN, KEY_PAUSE, createStickCore, createInput } from '../input.js';

const src = readFileSync(new URL('../input.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');

const W = 844;
const H = 390;
const R = STICK.radius;
const LEFT = W * 0.2;              // середина левой половины
const RIGHT = W * 0.8;             // и правой
const Y = 250;
const DT = 1 / 60;
const FIELDS = ['mx', 'my', 'fire', 'act', 'aim', 'ax', 'ay', 'ap', 'dash', 'dx', 'dy', 'dp', 'hasT', 'tx', 'ty'];
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

/** Ядро со своими часами: tick() — следующий кадр (время идёт на dt), wait(s) — кадры подряд s секунд. */
function make(opts = {}) {
  const clock = { t: 10 };
  const core = createStickCore({ w: W, h: H, now: () => clock.t, ...opts });
  const tick = (dt = DT, ...fox) => {
    clock.t += dt;
    return core.frame(...fox);
  };
  const wait = (seconds, ...fox) => {
    let input = core.input;
    for (let t = 0; t < seconds - 1e-9; t += DT) input = tick(DT, ...fox);
    return input;
  };
  tick();
  return { core, clock, tick, wait, sticks: core.sticks };
}
const HOLD = STICK.holdDelay + DT;         // столько держать, чтобы огонь точно начался
const MID = (STICK.aim + R) / 2;           // оттянуто на полсилы
const FAR = R - 4;                         // почти до упора
const BETWEEN = (STICK.hold + STICK.aim) / 2;   // между порогами «держу» и «прицел»

// ---------- объект ввода ----------

test('объект ввода: ровно те поля, что читает симуляция, и каждый кадр — один и тот же объект', () => {
  const { core, tick } = make();
  const a = tick();
  assert.deepEqual(Object.keys(a), FIELDS);
  assert.equal(tick(), a);
  assert.equal(core.input, a);
  assert.deepEqual(a, { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 });
});

test('все числа управления — в STICK, и они согласованы между собой (крутить можно, ломать — нет)', () => {
  for (const key of ['zone', 'radius', 'edge', 'padX', 'padY', 'dead', 'hold', 'aim', 'holdDelay', 'still', 'tapFire', 'stale', 'reach', 'reachMin', 'mouseDead']) {
    assert.ok(Number.isFinite(STICK[key]) && STICK[key] > 0, key);
  }
  assert.ok(STICK.zone > 0.3 && STICK.zone < 0.5 - 4 / W, 'между половинами остаётся ничья полоса');
  assert.ok(STICK.still < STICK.hold && STICK.hold < STICK.aim && STICK.aim + 8 <= STICK.radius, 'неподвижно < держу < прицел < радиус');
  assert.ok(STICK.dead < 0.5 && STICK.reachMin < 1);
  assert.ok(STICK.edge >= 32, 'у самого края экрана — системные жесты');
  assert.ok(STICK.tapFire >= 2 / 60 && STICK.tapFire < STICK.stale, 'импульс огня виден хотя бы одному шагу игры');
  // поправки — только через tune, общий STICK ядро не меняет
  const radius = STICK.radius;
  const { core, tick } = make({ tune: { radius: 100 } });
  core.down(1, LEFT, Y);
  core.move(1, LEFT + 50, Y);
  close(tick().mx, 0.5);
  assert.equal(STICK.radius, radius);
});

// ---------- половины экрана ----------

test('половины: левая часть экрана — ходьба, правая — действие', () => {
  for (const [x, want] of [[2, 0], [LEFT, 0], [W * STICK.zone - 1, 0], [W * (1 - STICK.zone) + 1, 1], [RIGHT, 1], [W - 2, 1]]) {
    const { core } = make();
    assert.equal(core.down(1, x, Y), want, `x = ${x}`);
  }
  // высота не важна: палец может лечь где угодно
  for (const y of [4, H / 2, H - 4]) assert.equal(make().core.down(1, LEFT, y), 0);
});

test('режим левши меняет половины местами — и места, где джойстики ждут палец', () => {
  const usual = make();
  const lefty = make({ lefty: true });
  assert.equal(lefty.core.lefty, true);
  assert.equal(lefty.core.down(1, LEFT, Y), 1);
  assert.equal(lefty.core.down(2, RIGHT, Y), 0);
  assert.equal(lefty.sticks.move.x, usual.sticks.act.x);
  assert.equal(lefty.sticks.act.x, usual.sticks.move.x);
  assert.ok(usual.sticks.move.x < W / 2 && usual.sticks.act.x > W / 2);
  // переключили на ходу — пальцы отпущены: их половины уже значат другое
  usual.core.down(1, LEFT, Y);
  usual.core.move(1, LEFT + R, Y);
  assert.equal(usual.tick().mx, 1);
  usual.core.setLefty(true);
  assert.equal(usual.tick().mx, 0);
  assert.equal(usual.sticks.move.on, false);
  assert.ok(usual.sticks.move.x > W / 2);
  assert.equal(usual.core.down(3, LEFT, Y), 1);
});

test('ничья полоса посередине: тому, кто свободен и ближе', () => {
  const a = W / 2 - 3;
  const b = W / 2 + 3;
  assert.equal(make().core.down(1, a, Y), 0);
  assert.equal(make().core.down(1, b, Y), 1);
  // ближний занят — достаётся другому
  const one = make();
  one.core.down(1, LEFT, Y);
  assert.equal(one.core.down(2, a, Y), 1);
  const two = make();
  two.core.down(1, RIGHT, Y);
  assert.equal(two.core.down(2, b, Y), 0);
  // оба заняты — никому
  one.core.down(3, RIGHT, Y);
  assert.equal(one.core.down(4, b, Y), -1);
  // у левши — наоборот
  assert.equal(make({ lefty: true }).core.down(1, a, Y), 1);
});

test('второй палец в занятой половине и третий палец — лишние: ничего не меняют', () => {
  const { core, tick } = make();
  assert.equal(core.down(1, LEFT, Y), 0);
  core.move(1, LEFT + R, Y);
  assert.equal(core.down(2, LEFT + 30, Y - 40), -1);       // та же половина
  assert.equal(core.holds(2), false);
  assert.equal(core.down(3, RIGHT, Y), 1);
  assert.equal(core.down(4, RIGHT - 20, Y), -1);           // третий
  assert.equal(core.down(5, W / 2, Y), -1);
  core.move(4, 0, 0);
  core.move(5, W, H);
  core.up(4);
  core.cancel(5);
  const i = tick();
  assert.equal(i.mx, 1);
  assert.equal(i.dash, false);
  assert.equal(core.holds(1) && core.holds(3), true);
});

// ---------- ходьба ----------

test('ходьба: вектор = сдвиг / радиус, в мёртвой зоне — ноль, длина не больше 1', () => {
  const { core, tick } = make();
  core.down(1, LEFT, Y);
  assert.deepEqual([tick().mx, tick().my], [0, 0]);
  core.move(1, LEFT + R * (STICK.dead - 0.01), Y);         // в мёртвой зоне
  assert.equal(tick().mx, 0);
  core.move(1, LEFT + R * 0.5, Y);
  close(tick().mx, 0.5);
  core.move(1, LEFT, Y - R);
  close(tick().my, -1);
  close(core.input.mx, 0);
  core.move(1, LEFT - R * 0.6, Y + R * 0.8);               // по диагонали, ровно на радиусе
  close(tick().mx, -0.6);
  close(core.input.my, 0.8);
  core.move(1, LEFT - 300, Y + 400);                       // далеко: длина 1, направление то же
  const i = tick();
  close(Math.hypot(i.mx, i.my), 1);
  close(i.mx / i.my, -300 / 400, 1e-6);
  core.up(1);
  assert.deepEqual([tick().mx, core.input.my], [0, 0]);
});

test('кольцо едет за далеко ушедшим пальцем: назад — всегда короткий путь', () => {
  const { core, tick, sticks } = make();
  core.down(1, 200, 200);
  core.move(1, 300, 200);                                  // на 100 px: кольцо подтянулось, палец — на его краю
  assert.equal(tick().mx, 1);
  assert.equal(sticks.move.x, 300 - R);
  assert.equal(sticks.move.kx, R);
  core.move(1, 300 - R, 200);                              // вернулся на радиус — уже стоим
  assert.equal(tick().mx, 0);
  core.move(1, 300 - 2 * R, 200);                          // ещё радиус — полный ход назад
  assert.equal(tick().mx, -1);
  assert.equal(sticks.move.x, 300 - R);
  // и у джойстика действия: рывок отменяется коротким возвратом, а не через пол-экрана
  core.down(2, 700, 200);
  core.move(2, 700, 60);
  assert.equal(tick().aim, true);
  core.move(2, 700, 60 + R - STICK.hold + 1);
  assert.equal(tick().aim, false);
});

// ---------- джойстик действия ----------

test('держит на месте → огонь: не в миг касания, а через holdDelay', () => {
  const { core, tick, wait, sticks } = make();
  assert.equal(core.down(1, RIGHT, Y), 1);
  let i = tick();
  assert.equal(i.fire, false);
  assert.equal(sticks.act.state, 'on');
  i = wait(STICK.holdDelay - 2 * DT);
  assert.equal(i.fire, false, 'рано');
  i = wait(3 * DT);
  assert.equal(i.fire, true);
  assert.equal(i.aim, false);
  assert.equal(sticks.act.state, 'hold');
  core.move(1, RIGHT + STICK.hold - 1, Y);                 // пошевелился внутри мёртвой зоны — всё ещё огонь
  assert.equal(wait(0.5).fire, true);
  core.up(1);
  i = tick();
  assert.equal(i.fire, false, 'отпустил — огня нет');
  assert.equal(i.dash, false);
  assert.equal(sticks.act.state, 'idle');
});

test('короткое нажатие — огонь импульсом: хотя бы один кадр и не короче tapFire', () => {
  const { core, tick, clock } = make();
  core.down(1, RIGHT, Y);
  assert.equal(tick().fire, false);
  core.up(1);
  let frames = 0;
  const from = clock.t;
  while (tick().fire && frames < 100) frames += 1;
  assert.ok(frames >= 1 && clock.t - from >= STICK.tapFire, `${frames} кадров`);
  assert.ok(clock.t - from < STICK.tapFire + 3 * DT, 'импульс не тянется');
  assert.equal(core.input.dash, false);
  // кадр пришёл поздно — импульс всё равно виден ровно одному кадру
  core.down(2, RIGHT, Y);
  core.up(2);
  assert.equal(tick(STICK.tapFire * 3).fire, true);
  assert.equal(tick().fire, false);
});

test('нажал и отпустил между кадрами — огонь не теряется и при holdDelay = 0', () => {
  const { core, tick, wait } = make({ tune: { holdDelay: 0 } });
  core.down(1, RIGHT, Y);
  core.up(1);
  assert.equal(tick().fire, true);
  assert.equal(wait(0.2).fire, false);
  // а обычное удержание при нулевой задержке — огонь с первого же кадра и без «хвоста» после отпускания
  core.down(2, RIGHT, Y);
  assert.equal(tick().fire, true);
  core.up(2);
  assert.equal(tick().fire, false);
});

test('оттянул → прицел: направление — куда тянут, сила растёт от порога прицела до края кольца; огня нет', () => {
  const { core, tick, sticks } = make();
  core.down(1, RIGHT, Y);
  core.move(1, RIGHT, Y - STICK.aim + 1);                  // ещё не прицел
  assert.equal(tick().aim, false);
  core.move(1, RIGHT, Y - MID);
  let i = tick();
  assert.equal(i.aim, true);
  assert.equal(i.fire, false);
  close(i.ax, 0);
  close(i.ay, -1);
  close(i.ap, 0.5);
  assert.equal(sticks.act.state, 'aim');
  assert.equal(sticks.act.ky, -MID);
  core.move(1, RIGHT + 3 * R, Y - 4 * R);                  // далеко за кольцом: сила 1
  i = tick();
  close(i.ap, 1);
  close(i.ax, 0.6);
  close(i.ay, -0.8);
  close(Math.hypot(i.ax, i.ay), 1);
  assert.equal(tick(1).fire, false, 'пока целимся, огня нет, сколько ни держи');
  const edge = make();                                     // чуть за порогом — сила почти ноль
  edge.core.down(1, RIGHT, Y);
  edge.core.move(1, RIGHT + STICK.aim + 0.5, Y);
  i = edge.tick();
  assert.equal(i.aim, true);
  assert.ok(i.ap > 0 && i.ap < 0.05);
});

test('отпустил с прицела → ровно один рывок с тем же направлением и силой', () => {
  const { core, tick } = make();
  core.down(1, RIGHT, Y);
  core.move(1, RIGHT - MID, Y);
  const aimed = { ...tick() };
  core.up(1);
  const i = tick();
  assert.equal(i.dash, true);
  assert.deepEqual([i.dx, i.dy, i.dp], [aimed.ax, aimed.ay, aimed.ap]);
  close(i.dx, -1);
  close(i.dp, 0.5);
  assert.equal(i.aim, false);
  assert.equal(i.fire, false);
  // разовая команда: следующий кадр её уже не видит
  tick();
  assert.deepEqual([i.dash, i.dx, i.dy, i.dp], [false, 0, 0, 0]);
  for (let k = 0; k < 30; k++) assert.equal(tick().dash, false);
});

test('быстрый взмах — рывок без выстрела: огня не было ни в одном кадре', () => {
  const { core, tick } = make();
  core.down(1, RIGHT, Y);
  let fired = Number(tick().fire);                          // в скольких кадрах был огонь
  let dashes = 0;
  for (let k = 1; k <= 4; k++) {                             // до края кольца за четыре кадра
    core.move(1, RIGHT + (k * R) / 4, Y);
    fired += Number(tick().fire);
  }
  core.up(1);
  for (let k = 0; k < 20; k++) {
    const i = tick();
    fired += Number(i.fire);
    if (i.dash) dashes += 1;
  }
  assert.equal(fired, 0);
  assert.equal(dashes, 1);
});

test('медленно тянут к прицелу — это не «держу»: пока палец в движении, огня нет', () => {
  const slow = make();
  slow.core.down(1, RIGHT, Y);
  let fired = 0;
  let frames = 0;
  while (!slow.core.input.aim && frames < 100) {           // 2 px за кадр: до прицела — дольше, чем holdDelay
    frames += 1;
    slow.core.move(1, RIGHT + frames * 2, Y);
    fired += Number(slow.tick().fire);
  }
  assert.equal(slow.core.input.aim, true);
  assert.ok(frames * DT > STICK.holdDelay, `${frames} кадров`);
  assert.equal(fired, 0);
  // остановился на полпути — вот теперь «держу»
  const half = make();
  half.core.down(1, RIGHT, Y);
  const step = STICK.still + 1;                             // каждый шаг заметен — отсчёт начинается с последнего
  for (let k = 1; k * step < STICK.aim; k++) {
    half.wait(STICK.holdDelay - 3 * DT);
    half.core.move(1, RIGHT, Y + k * step);
    assert.equal(half.tick().fire, false);
  }
  assert.equal(half.wait(STICK.holdDelay - 2 * DT).fire, false, 'отсчёт — с того мига, как палец замер');
  assert.equal(half.wait(3 * DT).fire, true);
  // дрожь лежащего пальца отсчёт не сбивает
  const shaky = make();
  shaky.core.down(1, RIGHT, Y);
  for (let t = 0; t < HOLD; t += DT) {
    shaky.core.move(1, RIGHT + (Math.round(t / DT) % 2) * (STICK.still - 1), Y);
    shaky.tick();
  }
  assert.equal(shaky.core.input.fire, true);
});

test('вернул в середину → рывок отменён; между порогами «держу» и «прицел» остаётся как было', () => {
  const { core, tick, wait, sticks } = make();
  core.down(1, RIGHT, Y);
  core.move(1, RIGHT + FAR, Y);
  assert.equal(tick().aim, true);
  core.move(1, RIGHT + BETWEEN, Y);                        // между порогами — всё ещё прицел
  let i = tick();
  assert.equal(i.aim, true);
  assert.equal(i.ap, 0);
  core.move(1, RIGHT + STICK.hold - 1, Y);                 // в середине — отмена
  i = tick();
  assert.equal(i.aim, false);
  assert.equal(i.fire, false, 'огонь после отмены — не сразу');
  assert.equal(sticks.act.state, 'on');
  core.move(1, RIGHT + BETWEEN, Y);                        // и обратно между порогами — уже не прицел
  assert.equal(tick().aim, false);
  core.up(1);
  for (let k = 0; k < 20; k++) {
    i = tick();
    assert.equal(i.dash, false, 'отменённый рывок не случается');
    assert.equal(i.fire, false, 'и огнём не становится');
  }
  // вернул и держит — снова огонь
  core.down(2, RIGHT, Y);
  core.move(2, RIGHT + FAR, Y);
  tick();
  core.move(2, RIGHT + 1, Y);
  assert.equal(wait(HOLD).fire, true);
  core.move(2, RIGHT + FAR, Y);                            // и снова можно оттянуть
  assert.equal(tick().aim, true);
  // отпустил между порогами, не дойдя до середины, — рывок самой малой силы
  core.move(2, RIGHT + BETWEEN, Y);
  tick();
  core.up(2);
  i = tick();
  assert.deepEqual([i.dash, i.dx, i.dp], [true, 1, 0]);
});

test('два пальца независимы: ходьба не замечает ни огня, ни прицела, ни рывка', () => {
  const { core, tick, wait } = make();
  core.down(7, LEFT, Y);
  core.move(7, LEFT + R / 2, Y - R / 2);
  const walk = { mx: tick().mx, my: core.input.my };
  assert.ok(walk.mx > 0 && walk.my < 0);
  const same = (label) => assert.deepEqual({ mx: core.input.mx, my: core.input.my }, walk, label);
  core.down(8, RIGHT, Y);
  assert.equal(wait(HOLD).fire, true);
  same('огонь');
  core.move(8, RIGHT, Y - FAR);
  assert.equal(tick().aim, true);
  same('прицел');
  core.up(8);
  assert.equal(tick().dash, true);
  same('рывок');
  assert.equal(core.holds(7), true);
  tick();
  same('после рывка');
  // и наоборот: отпустили ходьбу — огонь держится
  core.down(9, RIGHT, Y);
  wait(HOLD);
  core.up(7);
  const i = tick();
  assert.deepEqual([i.mx, i.my, i.fire], [0, 0, true]);
});

test('касание оборвалось (pointercancel): отпущено без рывка и без огня', () => {
  const { core, tick } = make();
  core.down(1, RIGHT, Y);
  core.move(1, RIGHT, Y - FAR);
  assert.equal(tick().aim, true);
  core.cancel(1);
  for (let k = 0; k < 10; k++) {
    const i = tick();
    assert.deepEqual([i.dash, i.aim, i.fire], [false, false, false]);
  }
  core.down(2, RIGHT, Y);                                  // короткое нажатие, но оборванное — не огонь
  core.cancel(2);
  assert.equal(tick().fire, false);
  core.down(3, LEFT, Y);
  core.move(3, LEFT + R, Y);
  assert.equal(tick().mx, 1);
  core.cancel(3);
  assert.equal(tick().mx, 0);
  assert.equal(core.holds(3), false);
});

test('тот же номер указателя лёг снова — прежнее касание считается отпущенным', () => {
  const { core, tick } = make();
  core.down(1, LEFT, Y);
  core.move(1, LEFT + R, Y);
  assert.equal(core.down(1, RIGHT, Y), 1);
  assert.equal(tick().mx, 0);
});

// ---------- где стоят кольца ----------

test('кольца стоят в безопасной зоне: целиком не ближе 32 px к краю и внутри отступов', () => {
  const inside = (v, ins = { top: 0, right: 0, bottom: 0, left: 0 }) => {
    assert.ok(v.x - R >= Math.max(ins.left, STICK.edge), `слева: ${v.x}`);
    assert.ok(v.x + R <= W - Math.max(ins.right, STICK.edge), `справа: ${v.x}`);
    assert.ok(v.y - R >= Math.max(ins.top, STICK.edge), `сверху: ${v.y}`);
    assert.ok(v.y + R <= H - Math.max(ins.bottom, STICK.edge), `снизу: ${v.y}`);
  };
  const free = make();
  inside(free.sticks.move);
  inside(free.sticks.act);
  assert.equal(free.sticks.move.y, free.sticks.act.y);
  assert.equal(free.sticks.move.x, W - free.sticks.act.x, 'места покоя симметричны');
  assert.ok(free.sticks.move.y > H / 2, 'внизу — под большими пальцами');
  // кнопки Telegram и вырез: джойстики отступают
  const ins = { top: 8, right: 21, bottom: 40, left: 105 };
  const tight = make({ insets: ins });
  inside(tight.sticks.move, ins);
  inside(tight.sticks.act, ins);
  assert.ok(tight.sticks.move.x > free.sticks.move.x && tight.sticks.move.y < free.sticks.move.y);
  // палец лёг в самый угол — кольцо рисуется в безопасной зоне
  for (const [x, y] of [[3, H - 3], [3, 3], [W * 0.4, H - 1], [110, 20]]) {
    const { core, tick, sticks } = make({ insets: ins });
    core.down(1, x, y);
    tick();
    inside(sticks.move, ins);
    assert.equal(sticks.move.on, true);
  }
  // экран теснее отступов — кольца всё равно где-то стоят, числа конечны
  const tiny = make({ w: 120, h: 90 });
  for (const v of [tiny.sticks.move, tiny.sticks.act]) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
});

test('палец у самого края ручку сам не оттягивает: правила считаются от настоящей точки касания', () => {
  const { core, tick, wait, sticks } = make();
  core.down(1, W - 3, H - 3);                              // действие: в углу — это всё равно «держу», а не прицел
  assert.equal(tick().aim, false);
  const i = wait(HOLD);
  assert.deepEqual([i.fire, i.aim], [true, false]);
  assert.deepEqual([sticks.act.kx, sticks.act.ky], [0, 0]);
  core.up(1);
  assert.equal(tick().dash, false);
  core.down(2, 3, H - 3);                                  // ходьба: в углу лиса стоит, пока палец не поведут
  assert.deepEqual([tick().mx, core.input.my], [0, 0]);
  core.move(2, 3 + R, H - 3);
  assert.equal(tick().mx, 1);
});

test('смена размера экрана отпускает пальцы и переставляет кольца; смена одних отступов — пальцы не трогает', () => {
  const { core, tick, sticks } = make();
  core.down(1, LEFT, Y);
  core.move(1, LEFT + R, Y);
  assert.equal(tick().mx, 1);
  core.resize(W, H, { top: 0, right: 0, bottom: 0, left: 60 });
  assert.equal(tick().mx, 1);
  core.resize(568, 320, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(tick().mx, 0);
  assert.equal(core.holds(1), false);
  assert.equal(sticks.act.x, 568 - sticks.move.x);
  assert.ok(sticks.act.y + R <= 320 - STICK.edge);
});

// ---------- сброс и пауза ----------

test('reset отпускает всё: пальцы, клавиши, мышь и несыгранные команды', () => {
  const { core, tick } = make({ toWorld: (x, y, out) => Object.assign(out, { x, y }) });
  core.down(1, LEFT, Y);
  core.move(1, LEFT + R, Y);
  core.down(2, RIGHT, Y);
  core.move(2, RIGHT, Y - FAR);
  core.key('KeyW', true);
  core.key('ShiftLeft', true);
  core.mouse(3, 500, 100);
  tick(DT, 400, 200);
  core.up(2);                                              // рывок ждёт кадра…
  core.key('KeyE', true);
  core.key('Space', true);
  core.reset();                                            // …но открылось окно
  const zero = { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 };
  assert.deepEqual(core.input, zero);
  assert.deepEqual([core.sticks.move.state, core.sticks.act.state], ['idle', 'idle']);
  assert.deepEqual(tick(DT, 400, 200), zero);
  assert.equal(core.holds(1) || core.holds(2), false);
});

test('пока кадры не шли (пауза), разовые команды не копятся', () => {
  const { core, tick, clock } = make();
  core.key('Space', true);
  core.key('KeyE', true);
  clock.t += STICK.stale + 0.1;                            // окно закрыли через полсекунды
  let i = tick();
  assert.deepEqual([i.dash, i.act], [false, false]);
  core.key('Space', false);
  core.key('Space', true);                                 // а во время игры — исполняются даже при редких кадрах
  i = tick(STICK.stale - 0.05);
  assert.equal(i.dash, true);
  // то же с касанием: палец подняли, когда игра уже стояла
  core.down(1, RIGHT, Y);
  core.move(1, RIGHT, Y - FAR);
  tick();
  core.up(1);
  clock.t += 2;
  assert.equal(tick().dash, false);
});

// ---------- клавиши ----------

test('клавиши: WASD и стрелки; по диагонали длина 1; две клавиши одного направления', () => {
  const { core, tick } = make();
  const press = (code, on = true) => assert.equal(core.key(code, on), KEY_TAKEN, code);
  press('KeyW');
  assert.deepEqual([tick().mx, core.input.my], [0, -1]);
  press('KeyD');
  close(tick().mx, Math.SQRT1_2);
  close(core.input.my, -Math.SQRT1_2);
  press('ArrowUp');
  press('KeyW', false);                                    // ↑ ещё зажата
  close(tick().my, -Math.SQRT1_2);
  press('ArrowUp', false);
  assert.deepEqual([tick().mx, core.input.my], [1, 0]);
  press('KeyA');                                           // влево и вправо разом — стоим
  assert.equal(tick().mx, 0);
  press('KeyD', false);
  press('KeyA', false);
  for (const [code, mx, my] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowDown', 0, 1], ['KeyS', 0, 1], ['KeyA', -1, 0]]) {
    press(code);
    assert.deepEqual([tick().mx, core.input.my], [mx, my], code);
    press(code, false);
  }
  assert.deepEqual([tick().mx, core.input.my], [0, 0]);
  // клавиши и джойстик складываются, длина всё равно не больше 1
  press('KeyD');
  core.down(1, LEFT, Y);
  core.move(1, LEFT + R, Y);
  assert.equal(tick().mx, 1);
  core.move(1, LEFT - R, Y);
  close(tick().mx, 0);
  // чужие клавиши не трогаем
  for (const code of ['KeyQ', 'Enter', 'Tab', 'F5', 'Digit1', '']) assert.equal(core.key(code, true), KEY_FREE, code);
});

test('пробел — рывок во весь размах по ходу, а стоя — куда лиса смотрит', () => {
  const { core, tick } = make();
  core.key('KeyS', true);
  tick();
  assert.equal(core.key('Space', true), KEY_TAKEN);
  let i = tick();
  assert.deepEqual([i.dash, i.dx, i.dy, i.dp], [true, 0, 1, 1]);
  assert.equal(tick().dash, false);
  assert.equal(core.key('Space', true, true), KEY_TAKEN);   // повтор от удержания — не новый рывок
  assert.equal(tick().dash, false);
  core.key('Space', false);
  core.key('Space', true);                                 // идём вниз, а смотрит лиса вбок (стреляла) — рывок всё равно по ходу
  i = tick(DT, 0, 0, 0);
  assert.deepEqual([i.dash, i.dx, i.dy], [true, 0, 1]);
  core.key('Space', false);
  core.key('KeyS', false);
  tick();
  core.key('Space', true);                                 // стоим, лиса смотрит влево и чуть вверх
  i = tick(DT, 0, 0, Math.atan2(-3, -4));
  assert.equal(i.dash, true);
  close(i.dx, -0.8);
  close(i.dy, -0.6);
  core.key('Space', false);
  core.key('Space', true);                                 // куда смотрит, не сказали — куда шли последним
  i = tick();
  assert.deepEqual([i.dash, i.dx, i.dy], [true, 0, 1]);
  // с джойстика, по диагонали
  core.key('Space', false);
  core.down(1, LEFT, Y);
  core.move(1, LEFT + 20, Y - 20);
  core.key('Space', true);
  i = tick();
  close(i.dx, Math.SQRT1_2);
  close(i.dy, -Math.SQRT1_2);
  assert.equal(i.dp, 1);
});

test('E — разовое действие, Shift — огонь, Esc и P — пауза', () => {
  const { core, tick } = make();
  assert.equal(core.key('KeyE', true), KEY_TAKEN);
  assert.equal(tick().act, true);
  assert.equal(tick().act, false);
  core.key('KeyE', true, true);
  assert.equal(tick().act, false);
  for (const code of ['ShiftLeft', 'ShiftRight']) {
    assert.equal(core.key(code, true), KEY_TAKEN);
    const i = tick();
    assert.deepEqual([i.fire, i.hasT], [true, false], 'без мыши — огонь с автоприцелом');
    core.key(code, false);
    assert.equal(tick().fire, false);
  }
  for (const code of ['Escape', 'KeyP']) {
    assert.equal(core.key(code, true), KEY_PAUSE);
    assert.equal(core.key(code, true, true), KEY_TAKEN, 'повтор — не вторая пауза');
    assert.equal(core.key(code, false), KEY_TAKEN);
  }
  const i = tick();
  assert.deepEqual([i.dash, i.act, i.fire], [false, false, false]);
  // окно потеряло фокус — зажатые клавиши отпускаются сами
  core.key('KeyD', true);
  core.key('ShiftLeft', true);
  core.blur();
  assert.deepEqual([tick().mx, core.input.fire], [0, false]);
});

// ---------- мышь ----------

const half = (x, y, out) => {                               // мир вдвое мельче сцены
  out.x = x / 2;
  out.y = y / 2;
  return out;
};

test('мышь: левая кнопка — прицел от лисы к курсору, отпустил — рывок; сила — чтобы допрыгнуть до курсора', () => {
  const { core, tick } = make({ toWorld: half });
  const fox = [100, 100];
  const near = STICK.reach * STICK.reachMin;
  core.mouse(0, 500, 200);                                 // просто водит — ничего
  let i = tick(DT, ...fox);
  assert.deepEqual([i.aim, i.fire, i.hasT], [false, false, false]);
  core.mouse(1, 2 * (100 + STICK.reach), 200);             // курсор в мире — на длину рывка правее лисы
  i = tick(DT, ...fox);
  assert.deepEqual([i.aim, i.ax, i.ay, i.ap, i.fire], [true, 1, 0, 1, false]);
  core.mouse(1, 200, 2 * (100 - (near + STICK.reach) / 2));  // вверх, на середину между слабым и полным
  i = tick(DT, ...fox);
  close(i.ay, -1);
  close(i.ap, 0.5);
  core.mouse(1, 200, 2 * (100 + near - 5));                // ближе самого слабого рывка — сила 0
  i = tick(DT, ...fox);
  assert.deepEqual([i.aim, i.ap], [true, 0]);
  close(i.ay, 1);
  // лиса идёт — прицел считается от её нового места
  core.mouse(1, 2 * 300, 2 * 300);
  i = tick(DT, 300, 100);
  close(i.ax, 0);
  close(i.ay, 1);
  core.mouse(0, 2 * 300, 2 * 300);                         // отпустил
  i = tick(DT, 300, 100);
  assert.deepEqual([i.dash, i.dy, i.dp, i.aim], [true, 1, 1, false]);
  close(i.dx, 0);
  assert.equal(tick(DT, 300, 100).dash, false);
  // длина рывка у лисы другая — сила считается по ней
  core.mouse(1, 2 * 400, 200);
  i = tick(DT, 100, 100, 0, 300);
  close(i.ap, 1);
  core.mouse(1, 2 * (100 + 300 * (STICK.reachMin + 1) / 2), 200);
  close(tick(DT, 100, 100, 0, 300).ap, 0.5, 1e-6);
});

test('мышь: курсор на самой лисе — рывка нет; быстрый щелчок — рывок', () => {
  const { core, tick } = make({ toWorld: half });
  core.mouse(1, 204, 204);
  assert.equal(tick(DT, 100, 100).aim, false);
  core.mouse(0, 204, 204);
  assert.equal(tick(DT, 100, 100).dash, false);
  core.mouse(1, 400, 200);                                 // нажал и отпустил между кадрами
  core.mouse(0, 400, 200);
  const i = tick(DT, 100, 100);
  assert.deepEqual([i.dash, i.dx, i.dy], [true, 1, 0]);
  // кнопка «отпала» вместе с фокусом окна — это не рывок
  core.mouse(1, 400, 200);
  tick(DT, 100, 100);
  core.blur();
  assert.deepEqual([tick(DT, 100, 100).dash, core.input.aim], [false, false]);
});

test('мышь: правая кнопка или Shift — огонь в курсор (hasT, tx, ty)', () => {
  const { core, tick } = make({ toWorld: half });
  core.mouse(2, 640, 300);
  let i = tick(DT, 100, 100);
  assert.deepEqual([i.fire, i.hasT, i.tx, i.ty, i.aim], [true, true, 320, 150, false]);
  core.mouse(0, 640, 300);
  i = tick(DT, 100, 100);
  assert.deepEqual([i.fire, i.hasT, i.tx, i.ty], [false, false, 0, 0]);
  core.key('ShiftLeft', true);
  core.mouse(0, 100, 50);
  i = tick(DT, 100, 100);
  assert.deepEqual([i.fire, i.hasT, i.tx, i.ty], [true, true, 50, 25]);
  core.mouseOut();                                         // курсор ушёл со сцены — огонь остаётся, цель сама
  i = tick(DT, 100, 100);
  assert.deepEqual([i.fire, i.hasT], [true, false]);
  core.key('ShiftLeft', false);
  // обе кнопки: и прицел рывка, и огонь
  core.mouse(3, 600, 200);
  i = tick(DT, 100, 100);
  assert.deepEqual([i.fire, i.aim, i.hasT], [true, true, true]);
  core.mouse(2, 600, 200);                                 // левую отпустили, правая держится
  i = tick(DT, 100, 100);
  assert.deepEqual([i.dash, i.fire], [true, true]);
});

test('мышь без перевода в мир не целит; без места лисы — целит от середины экрана и говорит об этом один раз', () => {
  const blind = make();
  blind.core.mouse(3, 600, 200);
  let i = blind.tick(DT, 100, 100);
  assert.deepEqual([i.aim, i.hasT, i.fire], [false, false, true]);
  const junk = make({ toWorld: () => ({ x: NaN, y: 5 }) });
  junk.core.mouse(3, 600, 200);
  i = junk.tick(DT, 100, 100);
  assert.deepEqual([i.aim, i.hasT], [false, false]);
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(args.join(' '));
  try {
    const { core, tick } = make({ toWorld: half });
    core.mouse(1, W, H / 2);                               // правее середины экрана
    i = tick();
    assert.deepEqual([i.aim, i.ax, i.ay], [true, 1, 0]);
    tick();
    core.mouse(0, W, H / 2);
    assert.equal(tick().dash, true);
  } finally {
    console.warn = warn;
  }
  assert.equal(said.length, 1);
});

// ---------- обёртка на подставной странице ----------

/** Подставной элемент: классы, стили, слушатели — ровно то, чем пользуется createInput. */
function fakeEl(tag, doc) {
  const listeners = new Map();
  const classes = new Set();
  const el = {
    localName: tag,
    ownerDocument: doc,
    children: [],
    parent: null,
    dataset: {},
    attrs: {},
    style: {
      vars: {},
      setProperty(name, value) { this.vars[name] = value; },
      removeProperty(name) { delete this.vars[name]; },
    },
    classList: {
      contains: (c) => classes.has(c),
      remove: (...list) => list.forEach((c) => classes.delete(c)),
      toggle(c, on) {
        if (on) classes.add(c);
        else classes.delete(c);
        return Boolean(on);
      },
    },
    get className() { return [...classes].join(' '); },
    set className(value) {
      classes.clear();
      for (const c of String(value).split(/\s+/).filter(Boolean)) classes.add(c);
    },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    append(...kids) {
      for (const k of kids) {
        k.parent = el;
        el.children.push(k);
      }
    },
    remove() {
      if (!el.parent) return;
      el.parent.children = el.parent.children.filter((k) => k !== el);
      el.parent = null;
    },
    closest: () => null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    /** Событие как от браузера; возвращает его (посмотреть defaultPrevented). */
    fire(type, props = {}) {
      const e = { type, target: el, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
      for (const fn of [...(listeners.get(type) ?? [])]) fn(e);
      return e;
    },
    listening: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
  return el;
}

/**
 * Подставная страница. turn — как лежит экран: 0 — окно 844×390, сцена прямо; 90 и −90 — окно 390×844, сцена
 * на боку (формулы — из shell/landscape.js). screen: false — без api.screen. offset — где экран стоит в окне;
 * pad — поля между краями экрана и сценой в осях игры [лево, верх, право, низ] (обычно сцена — весь экран).
 */
function page({ turn = 0, screen = true, insets = { top: 0, right: 0, bottom: 0, left: 0 }, mouse = false, offset = [0, 0], pad = [0, 0, 0, 0], tune = null, weaponBtn = false } = {}) {
  const clock = { t: 10 };
  const doc = fakeEl('#document', null);
  const win = fakeEl('#window', null);
  doc.defaultView = win;
  doc.hidden = false;
  doc.createElement = (tag) => fakeEl(tag, doc);
  win.matchMedia = () => ({ matches: mouse });
  const observers = [];
  win.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.on = false; observers.push(this); }
    observe() { this.on = true; }
    disconnect() { this.on = false; }
  };
  const stage = fakeEl('div', doc);
  const canvas = fakeEl('canvas', doc);
  const sticksEl = fakeEl('div', doc);
  stage.append(canvas, sticksEl);
  const DW = turn ? H : W;                                  // окно в осях устройства
  const DH = turn ? W : H;
  const box = { x: offset[0], y: offset[1] };
  const stat = { rects: 0, captured: [], pauses: 0, changes: [] };
  /** Точка экрана в осях игры → точка окна. */
  const toDevice = (gx, gy) => {
    if (api.turn === 90) return [box.x + DW - gy, box.y + gx];
    if (api.turn === -90) return [box.x + gy, box.y + DH - gx];
    return [box.x + gx, box.y + gy];
  };
  stage.getBoundingClientRect = () => {
    stat.rects += 1;
    // у повёрнутой сцены рамка «стоячая»: по двум противоположным углам
    const [x1, y1] = toDevice(pad[0], pad[1]);
    const [x2, y2] = toDevice(W - pad[2], H - pad[3]);
    const [left, top, right, bottom] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  stage.setPointerCapture = (id) => stat.captured.push(id);
  const api = {
    turn,
    size: () => ({ w: W, h: H }),
    insets: () => ({ ...insets }),
    toLocal(cx, cy, out) {
      const x = cx - box.x;
      const y = cy - box.y;
      if (api.turn === 90) [out.x, out.y] = [y, DW - x];
      else if (api.turn === -90) [out.x, out.y] = [DH - y, x];
      else [out.x, out.y] = [x, y];
      return out;
    },
    onChange(cb) {
      stat.changes.push(cb);
      return () => stat.changes.splice(stat.changes.indexOf(cb), 1);
    },
  };
  /** Точка сцены в осях игры → точка окна: куда на самом деле ложится палец. */
  const at = (gx, gy) => {
    const [clientX, clientY] = toDevice(pad[0] + gx, pad[1] + gy);
    return { clientX, clientY };
  };
  const input = createInput({
    stage, sticksEl, screen: screen ? api : null, toWorld: (x, y, out) => Object.assign(out, { x, y }),
    onPause: () => { stat.pauses += 1; }, now: () => clock.t, tune, weaponBtn,
  });
  const frame = (dt = DT, ...fox) => {
    clock.t += dt;
    return input.frame(...fox);
  };
  const touch = (type, id, gx, gy, more = {}) => canvas.fire(type, { pointerType: 'touch', pointerId: id, ...at(gx, gy), ...more });
  // события всплывают со сцены: слушатели стоят на ней, а цель — холст
  canvas.fire = (type, props = {}) => stage.fire(type, { target: canvas, ...props });
  frame();
  return { doc, win, stage, canvas, sticksEl, input, frame, touch, at, stat, api, clock, observers };
}
const translate = (el) => el.style.transform.match(/^translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\)$/).slice(1).map(Number);

test('обёртка: рисует два джойстика на местах покоя — сразу там, без переезда из угла', () => {
  const p = page();
  assert.equal(p.sticksEl.children.length, 2);
  const [move, act] = p.sticksEl.children;
  assert.match(move.className, /^fh-stick fh-stick--move fh-stick--idle$/);
  assert.match(act.className, /^fh-stick fh-stick--act fh-stick--idle$/);
  assert.deepEqual(translate(move), [p.input.sticks.move.x, p.input.sticks.move.y]);
  assert.deepEqual(translate(act), [p.input.sticks.act.x, p.input.sticks.act.y]);
  assert.deepEqual(move.children.map((k) => k.className), ['fh-stick-ring', 'fh-stick-knob']);
  assert.deepEqual(act.children[1].children.map((k) => k.className), ['fh-stick-glyph fh-stick-glyph--fire', 'fh-stick-glyph fh-stick-glyph--use']);
  assert.equal(move.attrs['aria-hidden'], 'true');
  assert.equal(p.sticksEl.style.vars['--fh-stick-r'], `${R}px`);
  assert.equal(p.stage.style.touchAction, 'none');
  assert.equal(p.input.state, p.frame());
  // поправки к числам доходят и до правил, и до стилей
  const big = page({ tune: { radius: 60 } });
  assert.equal(big.sticksEl.style.vars['--fh-stick-r'], '60px');
  big.touch('pointerdown', 1, 200, 200);
  big.touch('pointermove', 1, 230, 200);
  close(big.frame().mx, 0.5);
  // сцена ещё не разложена — джойстики на страницу не ставятся, пока не узнают своё место
  const doc = fakeEl('#document', null);
  doc.defaultView = fakeEl('#window', null);
  doc.createElement = (tag) => fakeEl(tag, doc);
  const stage = fakeEl('div', doc);
  const sticksEl = fakeEl('div', doc);
  let size = 0;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: size, bottom: size / 2, width: size, height: size / 2 });
  const late = createInput({ stage, sticksEl, now: () => 0 });
  assert.equal(sticksEl.children.length, 0);
  size = 800;
  late.resize();
  assert.equal(sticksEl.children.length, 2);
  assert.deepEqual(translate(sticksEl.children[0]), [late.sticks.move.x, late.sticks.move.y]);
});

for (const turn of [0, 90, -90]) {
  test(`обёртка, поворот ${turn}: одни и те же жесты в осях игры дают один и тот же ввод`, () => {
    const p = page({ turn, offset: [5, 7] });
    const [move, act] = p.sticksEl.children;
    p.touch('pointerdown', 11, 150, 280);
    p.touch('pointermove', 11, 150 + R, 280);              // левый палец — вправо по игре
    let i = p.frame();
    assert.deepEqual([i.mx, i.my], [1, 0]);
    assert.deepEqual(translate(move), [150, 280]);
    assert.deepEqual(translate(move.children[1]), [R, 0]);
    assert.equal(move.classList.contains('fh-stick--idle'), false);
    p.touch('pointerdown', 12, 700, 260);                  // правый лёг и лежит
    for (let t = 0; t < HOLD; t += DT) i = p.frame();
    assert.deepEqual([i.fire, i.mx], [true, 1]);
    assert.equal(act.classList.contains('fh-stick--hold'), true);
    p.touch('pointermove', 12, 700, 260 - MID);             // вверх по игре
    i = p.frame();
    assert.deepEqual([i.aim, i.fire, i.mx], [true, false, 1]);
    close(i.ax, 0);
    close(i.ay, -1);
    close(i.ap, 0.5);
    assert.equal(act.classList.contains('fh-stick--aim'), true);
    assert.equal(act.classList.contains('fh-stick--hold'), false);
    assert.deepEqual(translate(act.children[1]), [0, -MID]);
    p.touch('pointerup', 12, 700, 260 - MID);               // отпущен только правый
    i = p.frame();
    assert.equal(i.dash, true);
    close(i.dx, 0);
    close(i.dy, -1);
    assert.equal(i.mx, 1, 'левый держится');
    assert.equal(p.frame().dash, false);
    assert.equal(act.classList.contains('fh-stick--idle'), true);
    assert.deepEqual(translate(act), [p.input.sticks.act.x, p.input.sticks.act.y]);
    assert.deepEqual(translate(act.children[1]), [0, 0]);
    assert.deepEqual(p.stat.captured, [11, 12]);
  });
}

test('обёртка: сцена не в углу экрана и отступы — пересчитываются в оси сцены', () => {
  const p = page({ turn: 90, offset: [14, 30], insets: { top: 0, right: 0, bottom: 21, left: 105 } });
  assert.equal(p.input.sticks.move.x, 105 + R + STICK.padX);
  assert.equal(p.input.sticks.move.y, H - STICK.edge - R - STICK.padY);
  p.touch('pointerdown', 1, 200, 200);
  p.touch('pointermove', 1, 200, 200 + R);
  assert.deepEqual([p.frame().mx, p.input.state.my], [0, 1]);
  assert.deepEqual(translate(p.sticksEl.children[0]), [200, 200]);
  // сцена меньше экрана (над ней шапка, по бокам поля): и касания, и отступы считаются от неё
  for (const turn of [0, 90, -90]) {
    const q = page({ turn, offset: [6, 9], pad: [20, 50, 30, 40], insets: { top: 60, right: 100, bottom: 90, left: 105 } });
    const w = W - 50;
    const h = H - 90;
    assert.deepEqual([q.input.sticks.move.x, q.input.sticks.act.x], [85 + R + STICK.padX, w - 70 - R - STICK.padX], `поворот ${turn}`);
    assert.equal(q.input.sticks.move.y, h - 50 - R - STICK.padY);
    q.touch('pointerdown', 1, 200, 150);
    q.touch('pointermove', 1, 200 + R, 150);
    assert.deepEqual([q.frame().mx, q.input.state.my], [1, 0], `поворот ${turn}`);
    assert.deepEqual(translate(q.sticksEl.children[0]), [200, 150]);
    q.touch('pointerdown', 2, w - 5, 150);                 // у правого края сцены — это половина действия
    for (let t = 0; t < HOLD; t += DT) q.frame();
    assert.equal(q.input.state.fire, true);
  }
  // без api.screen — просто от рамки сцены
  const plain = page({ screen: false, offset: [40, 25] });
  plain.touch('pointerdown', 1, 200, 200);
  plain.touch('pointermove', 1, 200 - R, 200);
  assert.equal(plain.frame().mx, -1);
  assert.deepEqual(translate(plain.sticksEl.children[0]), [200, 200]);
});

test('обёртка: раскладка читается только в resize — ни касания, ни движения, ни кадры её не трогают', () => {
  const p = page({ turn: 90 });
  const before = p.stat.rects;
  assert.ok(before >= 1);
  p.touch('pointerdown', 1, 150, 280);
  p.touch('pointerdown', 2, 700, 260);
  for (let k = 0; k < 50; k++) {
    p.touch('pointermove', 1, 150 + k, 280 - k);
    p.touch('pointermove', 2, 700 - k, 260 + k);
    p.stage.fire('pointermove', { pointerType: 'mouse', buttons: 0, ...p.at(400, 100) });
    p.frame();
  }
  p.touch('pointerup', 2, 650, 310);
  p.touch('pointercancel', 1, 0, 0);
  p.frame();
  assert.equal(p.stat.rects, before);
  p.input.resize();
  assert.equal(p.stat.rects, before + 1);
  // и за размером обёртка следит сама: сменился экран — пересчитала
  assert.equal(p.observers.length, 1);
  assert.equal(p.observers[0].on, true);
  p.observers[0].cb();
  p.stat.changes[0]();
  assert.equal(p.stat.rects, before + 3);
});

test('обёртка: экран перевернули на другой бок — пальцы отпущены, новые касания считаются по-новому', () => {
  const p = page({ turn: 90 });
  p.touch('pointerdown', 1, 150, 280);
  p.touch('pointermove', 1, 150 + R, 280);
  assert.equal(p.frame().mx, 1);
  p.api.turn = -90;
  p.stat.changes[0]();
  assert.equal(p.frame().mx, 0);
  p.touch('pointerdown', 2, 150, 280);
  p.touch('pointermove', 2, 150, 280 - R);
  assert.deepEqual([p.frame().mx, p.input.state.my], [0, -1]);
});

test('обёртка: касание не сцены, третий палец и чужие указатели не в счёт', () => {
  const p = page();
  const button = fakeEl('button', p.doc);
  let e = p.stage.fire('pointerdown', { target: button, pointerType: 'touch', pointerId: 1, ...p.at(150, 280) });
  assert.equal(e.defaultPrevented, false, 'кнопку не трогаем');
  p.stage.fire('pointermove', { target: button, pointerType: 'touch', pointerId: 1, ...p.at(250, 280) });
  assert.equal(p.frame().mx, 0);
  assert.equal(p.sticksEl.children[0].classList.contains('fh-stick--idle'), true);
  e = p.touch('pointerdown', 2, 150, 280);
  assert.equal(e.defaultPrevented, true);
  p.touch('pointerdown', 3, 700, 280);
  p.touch('pointerdown', 4, 400, 100);                     // третий
  p.touch('pointermove', 4, 800, 380);
  p.touch('pointerup', 4, 800, 380);
  p.touch('pointermove', 2, 150 + R, 280);
  const i = p.frame();
  assert.deepEqual([i.mx, i.dash], [1, false]);
  assert.deepEqual(p.stat.captured, [2, 3], 'лишний палец не захватывается');
  // слои самой сцены — наши
  for (const layer of ['stage', 'sticksEl']) {
    const q = page();
    const target = q[layer];
    q.stage.fire('pointerdown', { target, pointerType: 'touch', pointerId: 1, ...q.at(150, 280) });
    q.stage.fire('pointermove', { target, pointerType: 'touch', pointerId: 1, ...q.at(150, 280 - R) });
    assert.equal(q.frame().my, -1);
  }
});

test('обёртка: pointercancel отпускает без рывка', () => {
  const p = page();
  p.touch('pointerdown', 1, 700, 260);
  p.touch('pointermove', 1, 700, 200);
  assert.equal(p.frame().aim, true);
  p.touch('pointercancel', 1, 0, 0);
  const i = p.frame();
  assert.deepEqual([i.aim, i.dash], [false, false]);
  assert.equal(p.sticksEl.children[1].classList.contains('fh-stick--idle'), true);
});

test('обёртка: отпускание потерялось (pointerup не пришёл) — следующее касание это чинит, живые пальцы не трогает', () => {
  const touches = (type, count) => p.canvas.fire(type, { touches: { length: count } });
  const p = page();
  p.touch('pointerdown', 1, 150, 280);
  assert.equal(touches('touchstart', 1).defaultPrevented, true);
  p.touch('pointermove', 1, 150 + R, 280);
  assert.equal(p.frame().mx, 1);
  // второй палец приходит и уходит как положено — первый при этом жив
  p.touch('pointerdown', 2, 700, 260);
  touches('touchstart', 2);
  p.touch('pointerup', 2, 700, 260);
  assert.equal(touches('touchend', 1).defaultPrevented, true);
  p.touch('pointerdown', 3, 700, 260);
  touches('touchstart', 2);
  assert.equal(p.frame().mx, 1, 'пока палец на экране, его джойстик никто не отбирает');
  p.touch('pointerup', 3, 700, 260);
  touches('touchend', 1);
  // а теперь пальцев на экране не осталось, но pointerup первого так и не пришёл: лиса «бежит сама»
  touches('touchend', 0);
  assert.equal(p.frame().mx, 1);
  p.touch('pointerdown', 4, 160, 270);                     // игрок кладёт палец снова — в ту же, «занятую» половину
  touches('touchstart', 1);
  let i = p.frame();
  assert.equal(i.mx, 0, 'потерянное касание снято');
  p.touch('pointermove', 4, 160, 270 - R);
  i = p.frame();
  assert.deepEqual([i.mx, i.my], [0, -1], 'и новое работает');
  assert.deepEqual(translate(p.sticksEl.children[0]), [160, 270]);
  // обычный порядок: все пальцы подняты как положено — следующее касание ничего лишнего не делает
  p.touch('pointerup', 4, 160, 270 - R);
  touches('touchend', 0);
  p.touch('pointerdown', 5, 700, 260);
  touches('touchstart', 1);
  p.touch('pointermove', 5, 700, 200);
  assert.equal(p.frame().aim, true);
  touches('touchcancel', 0);                               // touch-события обогнали pointer-события — не беда
  p.touch('pointerup', 5, 700, 200);
  assert.equal(p.frame().dash, true);
});

test('обёртка: мышь прячет джойстики, палец возвращает; левая кнопка — рывок к курсору', () => {
  const p = page();
  assert.equal(p.sticksEl.classList.contains('fh-sticks--off'), false);
  const mouse = (type, buttons, gx, gy) => p.canvas.fire(type, { pointerType: 'mouse', pointerId: 1, buttons, ...p.at(gx, gy) });
  mouse('pointermove', 0, 300, 100);
  assert.equal(p.sticksEl.classList.contains('fh-sticks--off'), true);
  const e = mouse('pointerdown', 1, 500, 100);
  assert.equal(e.defaultPrevented, true);
  let i = p.frame(DT, 300, 100);
  assert.deepEqual([i.aim, i.ax, i.ay, i.ap], [true, 1, 0, 1]);
  mouse('pointermove', 1, 300, 300);
  i = p.frame(DT, 300, 100);
  close(i.ax, 0);
  close(i.ay, 1);
  mouse('pointerup', 0, 300, 300);
  i = p.frame(DT, 300, 100);
  assert.deepEqual([i.dash, i.dy], [true, 1]);
  mouse('pointerdown', 2, 420, 60);                        // правая — огонь в курсор
  i = p.frame(DT, 300, 100);
  assert.deepEqual([i.fire, i.hasT, i.tx, i.ty], [true, true, 420, 60]);
  mouse('pointerup', 0, 420, 60);
  assert.equal(p.stage.fire('contextmenu').defaultPrevented, true);
  p.touch('pointerdown', 5, 150, 280);
  assert.equal(p.sticksEl.classList.contains('fh-sticks--off'), false);
  // на компьютере с мышью джойстиков нет с самого начала
  assert.equal(page({ mouse: true }).sticksEl.classList.contains('fh-sticks--off'), true);
});

test('обёртка: клавиши — ходьба, пауза, свои не отдаёт странице, чужие и сочетания не трогает', () => {
  const p = page();
  let e = p.doc.fire('keydown', { code: 'KeyD', target: p.doc });
  assert.equal(e.defaultPrevented, true);
  assert.equal(p.frame().mx, 1);
  assert.equal(p.sticksEl.classList.contains('fh-sticks--off'), true, 'клавиатура — джойстики не нужны');
  p.doc.fire('keyup', { code: 'KeyD', target: p.doc });
  assert.equal(p.frame().mx, 0);
  e = p.doc.fire('keydown', { code: 'Escape', target: p.doc });
  assert.deepEqual([e.defaultPrevented, p.stat.pauses], [true, 1]);
  p.doc.fire('keydown', { code: 'KeyP', target: p.doc, repeat: true });
  assert.equal(p.stat.pauses, 1);
  p.doc.fire('keydown', { code: 'KeyP', target: p.doc });
  assert.equal(p.stat.pauses, 2);
  for (const props of [{ code: 'KeyW', ctrlKey: true }, { code: 'KeyW', metaKey: true }, { code: 'KeyW', altKey: true }, { code: 'KeyQ' }, { code: 'KeyW', defaultPrevented: true }]) {
    e = p.doc.fire('keydown', { target: p.doc, ...props });
    assert.equal(p.frame().my, 0, JSON.stringify(props));
    if (!props.defaultPrevented) assert.equal(e.defaultPrevented, false, JSON.stringify(props));
  }
  // пробел на кнопке — нажатие кнопки, а в поле ввода клавиши — буквы
  const button = { closest: (sel) => (sel === 'button' ? button : null) };
  p.doc.fire('keydown', { code: 'Space', target: button });
  assert.equal(p.frame().dash, false);
  const field = { closest: (sel) => (sel.includes('input') ? field : null) };
  p.doc.fire('keydown', { code: 'KeyD', target: field });
  assert.equal(p.frame().mx, 0);
  p.doc.fire('keydown', { code: 'Space', target: p.doc });
  assert.equal(p.frame().dash, true);
  // окно потеряло фокус или страницу скрыли — всё отпущено
  p.doc.fire('keydown', { code: 'KeyD', target: p.doc });
  p.win.fire('blur');
  assert.equal(p.frame().mx, 0);
  p.touch('pointerdown', 1, 150, 280);
  p.touch('pointermove', 1, 150 + R, 280);
  assert.equal(p.frame().mx, 1);
  p.doc.hidden = true;
  p.doc.fire('visibilitychange');
  assert.equal(p.input.state.mx, 0);
  assert.equal(p.sticksEl.children[0].classList.contains('fh-stick--idle'), true);
});

test('обёртка: значок действия, режим левши, reset и destroy', () => {
  const p = page();
  const [move, act] = p.sticksEl.children;
  assert.equal(act.dataset.action, 'none');
  for (const [kind, want] of [['fire', 'fire'], ['use', 'use'], ['none', 'none'], ['что-то', 'none'], [undefined, 'none']]) {
    p.input.setAction(kind);
    assert.equal(act.dataset.action, want);
  }
  assert.equal(move.dataset.action, undefined);
  const home = translate(move);
  p.input.setLefty(true);
  assert.deepEqual(translate(act), home);
  assert.ok(translate(move)[0] > W / 2);
  p.touch('pointerdown', 1, 150, 280);  // слева теперь действие
  for (let t = 0; t < HOLD; t += DT) p.frame();
  assert.equal(p.input.state.fire, true);
  p.input.reset();
  assert.equal(p.input.state.fire, false);
  assert.equal(act.classList.contains('fh-stick--idle'), true);
  assert.deepEqual(translate(act), home);
  assert.ok(p.stage.listening() >= 8 && p.doc.listening() >= 2 && p.win.listening() === 1);
  p.input.destroy();
  assert.deepEqual([p.stage.listening(), p.doc.listening(), p.win.listening()], [0, 0, 0]);
  assert.equal(p.sticksEl.children.length, 0);
  assert.equal(p.observers[0].on, false);
  assert.equal(p.stat.changes.length, 0);
  assert.equal(p.stage.style.touchAction, undefined);
  assert.deepEqual(p.sticksEl.style.vars, {});
  p.input.destroy();                                       // повторно — тихо
  p.input.resize();
});

// ---------- исходник: кадр без мусора, раскладка — только в resize ----------

/** Тела вложенных функций с таким именем (в ядре и в обёртке): от заголовка до скобки с тем же отступом. */
function bodies(name) {
  const out = [];
  for (const m of src.matchAll(new RegExp(`^( +)function ${name}\\([^)]*\\) \\{$`, 'gm'))) {
    const from = m.index + m[0].length;
    const to = src.indexOf(`\n${m[1]}}\n`, from);
    assert.ok(to > from, name);
    out.push(src.slice(from, to).replace(/\/\/.*$/gm, ''));
  }
  return out;
}
const OBJECT = /(?:[=(,:?[]|\breturn|=>)\s*\{/;             // { … } как значение (блоки if / for / else сюда не попадают)
const ARRAY = /(?:^|[^\w)\]$'"`\s]|\breturn)\s*\[/m;         // [ … ] как значение (обращение по номеру — нет)
const MAKES = /\bnew\b|=>|\bfunction\b|\.\.\./;             // объекты, замыкания, расклейка массивов

test('в кадре ничего не создаётся: ни объектов, ни массивов, ни замыканий', () => {
  assert.match('x = { a: 1 }', OBJECT);
  assert.match('f({ a })', OBJECT);
  assert.match('return {', OBJECT);
  assert.doesNotMatch('if (a) {\n} else {\n}\nfor (;;) {', OBJECT);
  assert.doesNotMatch('`translate3d(${x}px, ${y}px, 0)`', OBJECT);
  assert.match('x = [1, 2]', ARRAY);
  assert.match('f([a])', ARRAY);
  assert.match('return [a]', ARRAY);
  assert.doesNotMatch('pads[MOVE].on = views[i].x + homeX[i]', ARRAY);
  const frames = bodies('frame');
  assert.equal(frames.length, 2, 'frame() — в ядре и в обёртке');
  // всё, что зовётся каждый кадр и на каждое движение указателя
  const hot = ['frame', 'sync', 'move', 'world', 'origin', 'mouseAim', 'mouseAt', 'paintStick', 'paint', 'locate', 'onMouse', 'onPointerMove', 'hide'];
  for (const name of hot) {
    const list = bodies(name);
    assert.ok(list.length >= 1, `нет функции ${name}`);
    for (const body of list) {
      assert.doesNotMatch(body, OBJECT, `${name}: объект`);
      assert.doesNotMatch(body, ARRAY, `${name}: массив`);
      assert.doesNotMatch(body, MAKES, `${name}: new / замыкание`);
      // Math.hypot в V8 на каждый вызов заводит массив под аргументы (замер: ~30 байт мусора и вдвое медленнее корня)
      assert.doesNotMatch(body, /Math\.hypot/, `${name}: Math.hypot`);
    }
  }
});

test('раскладку читает только resize(); в обработчике движения её нет — ни прямо, ни через вызовы', () => {
  const LAYOUT = /getBoundingClientRect|getComputedStyle|offset(?:Width|Height|Left|Top|Parent)|client(?:Width|Height|Left|Top)\b|scroll(?:Width|Height|Left|Top)|getClientRects|inner(?:Width|Height)/;
  assert.equal(src.match(new RegExp(LAYOUT.source, 'g')).length, 1, 'раскладка читается в одном месте');
  assert.match(bodies('resize').join('\n'), /getBoundingClientRect/);
  const [onMove] = bodies('onPointerMove');
  for (const name of ['onPointerMove', 'onPointerUp', 'onPointerCancel', 'onPointerLeave', 'onMouse', 'locate', 'frame', 'paint', 'paintStick', 'hide']) {
    for (const body of bodies(name)) {
      assert.doesNotMatch(body, LAYOUT, name);
      assert.doesNotMatch(body, /\bresize\(/, `${name} зовёт resize()`);
    }
  }
  // и то, что обработчик движения зовёт, — всё из проверенного выше
  const calls = [...onMove.matchAll(/(?<![.\w])([a-zA-Z]+)\(/g)].map((m) => m[1]).filter((n) => n !== 'if');
  assert.deepEqual([...new Set(calls)].sort(), ['locate', 'onMouse']);
});

test('джойстики двигаются только через transform (translate3d), остальное — классами', () => {
  const sets = [...src.matchAll(/\.style\.([a-zA-Z]+)\s*=(?!=)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(sets)].sort(), ['touchAction', 'transform']);
  for (const m of src.matchAll(/\.style\.transform = (.*);/g)) assert.match(m[1], /^`translate3d\(\$\{\w+\}px, \$\{\w+\}px, 0\)`$/);
  assert.equal(src.match(/\.style\.transform = /g).length, 3, 'кольцо, ручка и кнопка оружия');
  assert.doesNotMatch(src, /\.style\.(?:left|top|width|height|opacity)\b/);
  assert.doesNotMatch(src, /^import /m, 'без зависимостей: модуль грузится и в Node');
  assert.doesNotMatch(src, /\bwindow\.|\bdocument\./, 'страница — только через stage.ownerDocument');
});

// ---------- game.css: блок «стики» ----------

const OPEN = '/* ---------- стики ---------- */';
const END = '/* ---------- конец: стики ---------- */';
const block = css.slice(css.indexOf(OPEN), css.indexOf(END));
const rules = block.replace(/\/\*[\s\S]*?\*\//g, '');

test('game.css: блок «стики» на месте, все правила — под игрой', () => {
  assert.ok(css.includes(OPEN) && css.includes(END) && css.indexOf(OPEN) < css.indexOf(END));
  assert.equal(css.split(OPEN).length, 2);
  assert.equal(css.split(END).length, 2);
  for (const m of rules.matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
    const selector = m[2].trim();
    if (selector === 'from' || selector === 'to' || /^\d+%$/.test(selector)) continue;
    for (const part of selector.split(',')) assert.match(part.trim(), /^\[data-game="fox-hunt"\] \.fh-stick/, part.trim());
  }
  assert.match(rules, /\[data-game="fox-hunt"\] \.fh-sticks \{[^}]*pointer-events: none;/);
  assert.doesNotMatch(rules, /z-index|-webkit-text-stroke|backdrop-filter|filter:/);
});

test('game.css: у каждого класса, который ставит игра, есть правило — и лишних классов в блоке нет', () => {
  const used = new Set([...src.matchAll(/fh-stick[\w-]*/g)].map((m) => m[0]));
  // имена, собранные из частей: `fh-stick--${kind}` и `fh-stick-glyph--${what}`
  assert.ok(used.delete('fh-stick--') && used.delete('fh-stick-glyph--'));
  for (const name of ['fh-stick--move', 'fh-stick-glyph--fire', 'fh-stick-glyph--use']) used.add(name);
  assert.match(src, /makeStick\('move'\), makeStick\('act'\)/);
  assert.match(src, /for \(const what of \['fire', 'use'\]\)/);
  // .fh-stick--act своего вида не имеет (от ходьбы отличается значком); --fh-stick-r — переменная, не класс;
  // сам слой .fh-sticks создаёт index.js
  assert.ok(used.delete('fh-stick-r'));
  used.add('fh-sticks');
  const styled = new Set([...rules.matchAll(/\.(fh-stick[\w-]*)/g)].map((m) => m[1]));
  for (const c of used) assert.ok(styled.has(c), `нет правила для .${c}`);
  for (const c of styled) assert.ok(used.has(c), `в game.css класс .${c}, которого игра не ставит`);
  assert.match(rules, /\.fh-stick\[data-action="fire"\][^{]*\.fh-stick-glyph--fire/);
  assert.match(rules, /\.fh-stick\[data-action="use"\][^{]*\.fh-stick-glyph--use/);
  // радиус кольца стили берут из игры, а запасной (если переменная не дошла) — тот же, что в STICK
  const radius = `var(--fh-stick-r, ${STICK.radius}px)`;
  assert.ok(rules.includes(radius), radius);
  assert.ok(!rules.replaceAll(radius, '').includes('--fh-stick-r'), 'запасной радиус в стилях разошёлся с STICK.radius');
});

test('game.css: цвета джойстиков — переменные с запасом из темы, без своих цветов', () => {
  for (const name of ['--fh-stick', '--fh-stick-knob', '--fh-stick-aim']) {
    const uses = [...rules.matchAll(new RegExp(`var\\(${name}(?![\\w-])([^;]*)`, 'g'))];
    assert.ok(uses.length >= 1, name);
    for (const m of uses) assert.match(m[1], /^, [^;]*var\(--tg-theme-[a-z-]+\)/, `${name}: запас из цветов темы`);
  }
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b/i, 'конкретный цвет');
  // кроме переменных — только чёрный и белый с прозрачностью: кайма, тени и «разбавить белым» (кольцо светлое в любой теме)
  for (const m of rules.matchAll(/rgba?\(([^)]*)\)/g)) assert.match(m[1], /^(?:0, 0, 0|255, 255, 255), 0\.\d+$/, m[0]);
  assert.doesNotMatch(rules, /tg-theme-(?:text|bg|button-text)-color/, 'эти цвета в одной теме светлые, в другой тёмные — кольцу не годятся');
});

test('game.css: что оживает — на вложенных частях, свойствами scale и opacity; «уменьшить движение» — ровно 0s', () => {
  // сам джойстик и точка ручки стоят на transform из игры: ни scale, ни translate, ни анимаций им не положено
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    const own = selectors.some((s) => /\.fh-stick(--[a-z]+)?$/.test(s) || /\.fh-stick-knob$/.test(s));
    if (own) assert.doesNotMatch(m[2], /\b(?:scale|translate|rotate|animation)\s*:/, selectors.join(', '));
    assert.doesNotMatch(m[2], /(?<![-\w])transform\s*:/, `${selectors.join(', ')}: transform ставит только игра`);
  }
  const frames = rules.match(/@keyframes fh-stick-wave \{([\s\S]*?\})\s*\}/)[1];
  assert.doesNotMatch(frames, /transform/);
  assert.match(frames, /scale: /);
  const reduce = rules.slice(rules.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /\.fh-sticks \*[^{]*\{ transition-duration: 0s !important; \}/);
  assert.match(reduce, /animation: none;/);
  assert.doesNotMatch(rules, /transition[^;]*\b1ms\b/);
});

// ---------- «статичные» джойстики (настройка stick: 'static') ----------

test('статичные: касание вне круга игнорируется, внутри — берёт свой джойстик', () => {
  const { core, sticks } = make({ stick: 'static' });
  const mh = sticks.move;
  const ah = sticks.act;
  assert.equal(core.stick, 'static');
  assert.equal(core.down(1, mh.x + R * STICK.catchK + 2, mh.y), -1);
  assert.equal(core.down(1, W / 2, Y), -1);
  assert.equal(core.down(1, mh.x + R * STICK.catchK - 2, mh.y), 0);
  assert.equal(core.down(2, ah.x, ah.y - R * 1.5), 1);
  assert.equal(sticks.move.x, mh.x);               // основание не сдвинулось
});

test('статичные: основание на месте и нарисовано всегда, ручка — до края круга', () => {
  const { core, sticks, tick } = make({ stick: 'static' });
  const hx = sticks.move.x;
  const hy = sticks.move.y;
  assert.equal(sticks.move.state, 'idle');
  core.down(1, hx + 10, hy);
  core.move(1, hx + 500, hy - 500);
  const input = tick();
  assert.equal(sticks.move.x, hx);
  assert.equal(sticks.move.y, hy);
  close(Math.hypot(sticks.move.kx, sticks.move.ky), R, 1e-6);
  close(Math.hypot(input.mx, input.my), 1, 1e-6);
  assert.ok(input.mx > 0 && input.my < 0);
  core.up(1);
  tick();
  assert.equal(sticks.move.state, 'idle');
  assert.equal(sticks.move.x, hx);
});

test('статичные: ходьба считается от основания, а не от места касания', () => {
  const { core, sticks, tick } = make({ stick: 'static' });
  core.down(1, sticks.move.x + R, sticks.move.y);  // лёг на краю круга — уже идёт вправо
  const input = tick();
  close(input.mx, 1, 1e-6);
  close(input.my, 0, 1e-6);
});

test('статичные: режим левши меняет джойстики местами', () => {
  const usual = make({ stick: 'static' });
  const lefty = make({ stick: 'static', lefty: true });
  assert.equal(lefty.sticks.move.x, usual.sticks.act.x);
  assert.equal(lefty.sticks.act.x, usual.sticks.move.x);
  assert.equal(lefty.core.down(1, lefty.sticks.move.x, lefty.sticks.move.y), 0);
  assert.equal(lefty.core.down(2, lefty.sticks.act.x, lefty.sticks.act.y), 1);
});

test('статичные: два пальца вместе; занятый джойстик второй палец не берёт', () => {
  const { core, sticks, tick, wait } = make({ stick: 'static' });
  assert.equal(core.down(1, sticks.move.x + 20, sticks.move.y), 0);
  assert.equal(core.down(2, sticks.act.x, sticks.act.y), 1);
  assert.equal(core.down(3, sticks.move.x, sticks.move.y), -1);
  core.move(1, sticks.move.x + 20, sticks.move.y);
  const input = wait(HOLD);
  assert.ok(input.mx > 0);
  assert.equal(input.fire, true);                  // «держу на месте» — как раньше
  core.move(2, sticks.act.x + R, sticks.act.y);
  core.up(2);
  const after = tick();
  assert.equal(after.dash, true);                  // рывок отпусканием
  close(after.dx, 1, 1e-6);
  assert.equal(after.dp, 1);
});

test('переключение на лету отпускает пальцы и переставляет правила', () => {
  const { core, sticks, tick } = make({ stick: 'static' });
  core.down(1, sticks.move.x, sticks.move.y);
  core.setStick('float');
  assert.equal(core.stick, 'float');
  assert.equal(tick().mx, 0);
  assert.equal(core.down(2, W / 2 - 30, 100), 0);  // у плавающего берётся где угодно в своей половине
  core.setStick('static');
  assert.equal(core.down(3, W / 2, 100), -1);
  core.setStick('nonsense');                       // всё, кроме 'static', — плавающие
  assert.equal(core.stick, 'float');
});

test('«float» не изменился: кольцо там, где лёг палец, и едет за ним', () => {
  const { core, sticks, tick } = make();           // по умолчанию в ядре — плавающие
  assert.equal(core.stick, 'float');
  const X = 200;
  core.down(1, X, Y);
  tick();
  assert.equal(sticks.move.x, X);
  core.move(1, X + R * 3, Y);
  const input = tick();
  assert.equal(sticks.move.x, X + R * 2);                 // кольцо уехало за пальцем
  close(input.mx, 1, 1e-6);
});

// ---------- кнопка оружия (настройка weaponBtn) ----------

/** Где кнопка: середина в осях игры. */
const btnAt = (core) => ({ x: core.sticks.btn.x, y: core.sticks.btn.y });
/** Где ручка стика действия ждёт палец (кнопка оружия стоит выше и левее, так что не мешает). */
const actAt = (core) => ({ x: core.sticks.act.x, y: core.sticks.act.y });

test('кнопка оружия: выключена по умолчанию — ни кнопки, ни касаний, всё как раньше', () => {
  const { core, tick, wait } = make();
  assert.equal(core.weaponBtn, false);
  assert.equal(core.sticks.btn.shown, false);
  const b = btnAt(core);
  assert.notEqual(core.down(1, b.x, b.y), 2, 'касание там — не кнопка');
  core.cancelAll();
  core.down(2, RIGHT, Y);
  assert.equal(wait(HOLD).fire, true, 'удержание на стике стреляет');
  tick();
});

test('кнопка оружия: круглая, не меньше 56×56, над правым джойстиком слева, целиком в безопасных отступах', () => {
  const { core } = make({ weaponBtn: true });
  const v = core.sticks.btn;
  assert.equal(v.shown, true);
  assert.ok(v.r * 2 >= 56, 'не меньше 56×56');
  assert.ok(v.x < core.sticks.act.x && v.y < core.sticks.act.y, 'над стиком и левее');
  assert.ok(Math.hypot(v.x - core.sticks.act.x, v.y - core.sticks.act.y) > v.r + R, 'кольцо стика не закрыто');
  assert.ok(v.x - v.r >= STICK.edge && v.y - v.r >= STICK.edge && v.x + v.r <= W - STICK.edge && v.y + v.r <= H - STICK.edge);
  // тесный экран с большими отступами: кнопка всё равно внутри
  const ins = { top: 40, right: 60, bottom: 30, left: 50 };
  const t = make({ weaponBtn: true, insets: ins }).core.sticks.btn;
  assert.ok(t.x - t.r >= ins.left && t.x + t.r <= W - ins.right && t.y - t.r >= ins.top && t.y + t.r <= H - ins.bottom);
});

test('кнопка оружия: огонь, пока держат — и при зажатом левом джойстике', () => {
  const { core, wait } = make({ weaponBtn: true });
  core.down(1, LEFT, Y);
  core.move(1, LEFT + R, Y);
  const b = btnAt(core);
  assert.equal(core.down(2, b.x, b.y), 2);
  assert.equal(core.holds(2), true);
  const i = wait(DT * 5);
  assert.equal(core.sticks.btn.on, true);
  assert.equal(i.fire, true, 'огонь с кнопки');
  close(i.mx, 1);                                          // ходьба продолжается
  core.up(2);
  assert.equal(core.holds(2), false);
  const off = wait(STICK.tapFire + DT * 3);
  assert.equal(off.fire, false, 'отпустили — огонь кончился');
  close(off.mx, 1);
});

test('кнопка оружия: нажал и отпустил между кадрами — огонь не теряется', () => {
  const { core, tick, wait } = make({ weaponBtn: true });
  const b = btnAt(core);
  core.down(1, b.x, b.y);
  core.up(1);
  assert.equal(tick().fire, true);
  assert.equal(wait(STICK.tapFire + DT * 3).fire, false);
});

test('кнопка оружия: стик действия не стреляет — ни удержанием, ни коротким нажатием; рывок работает', () => {
  const { core, tick, wait, sticks } = make({ weaponBtn: true });
  const A = actAt(core);
  core.down(1, A.x, A.y);
  assert.equal(wait(HOLD * 3).fire, false, 'держу на месте — огня нет');
  assert.equal(sticks.act.state, 'on');
  core.up(1);
  assert.equal(wait(STICK.tapFire + DT * 3).fire, false, 'и импульса после отпускания нет');
  core.down(2, A.x, A.y);
  core.up(2);
  assert.equal(tick().fire, false, 'короткое нажатие на стик — не огонь');
  // рывок как прежде
  core.down(3, A.x, A.y);
  core.move(3, A.x, A.y - FAR);
  const a = tick();
  assert.equal(a.aim, true);
  assert.equal(a.fire, false);
  core.up(3);
  const d = tick();
  assert.equal(d.dash, true);
  close(d.dy, -1);
});

test('кнопка оружия и стик действия — разными пальцами: тянешь рывок, кнопка держится', () => {
  const { core, tick, wait } = make({ weaponBtn: true });
  const b = btnAt(core);
  const A = actAt(core);
  core.down(1, b.x, b.y);
  core.down(2, A.x, A.y);
  core.move(2, A.x, A.y - FAR);
  const i = wait(DT * 3);
  assert.deepEqual([i.fire, i.aim], [true, true]);
  core.up(2);
  const d = tick();
  assert.deepEqual([d.dash, d.fire], [true, true]);
  core.up(1);
  assert.equal(wait(STICK.tapFire + DT * 3).fire, false);
});

test('кнопка оружия: «взять» — тот же огонь (что делать, решает расчёт по предмету рядом), разового act нет', () => {
  const { core, wait } = make({ weaponBtn: true });
  const b = btnAt(core);
  core.down(1, b.x, b.y);
  const i = wait(DT * 4, 100, 100, 0);
  assert.equal(i.fire, true);
  assert.equal(i.aim, false);
  assert.equal(i.act, false, 'разовое «действие» — только клавиша E');
});

test('кнопка оружия: режим левши — зеркально, над левым джойстиком справа', () => {
  const a = make({ weaponBtn: true }).core;
  const l = make({ weaponBtn: true, lefty: true }).core;
  const bl = l.sticks.btn;
  assert.ok(bl.x > l.sticks.act.x && bl.y < l.sticks.act.y, 'правее стика действия (он слева) и выше');
  assert.ok(bl.x - bl.r >= STICK.edge && bl.x + bl.r <= W - STICK.edge);
  assert.ok(Math.abs(bl.x + a.sticks.btn.x - W) < 40, 'зеркало с точностью до отступов');
  close(bl.y, a.sticks.btn.y);
  // касание у левши берёт кнопку
  const { core, wait } = make({ weaponBtn: true, lefty: true });
  assert.equal(core.down(1, bl.x, bl.y), 2);
  assert.equal(wait(DT * 3).fire, true);
  // а переключение руки на лету переставляет кнопку и отпускает пальцы
  const s = make({ weaponBtn: true });
  const before = btnAt(s.core);
  s.core.down(1, before.x, before.y);
  s.core.setLefty(true);
  assert.equal(s.core.holds(1), false);
  assert.equal(s.tick().fire, false);
  assert.ok(s.core.sticks.btn.x < before.x, 'теперь у левого края');
});

test('кнопка оружия: потеря пальца (pointercancel) — отпущено без огня и без импульса', () => {
  const { core, tick, wait } = make({ weaponBtn: true });
  const b = btnAt(core);
  core.down(1, b.x, b.y);
  assert.equal(wait(DT * 3).fire, true);
  core.cancel(1);
  assert.equal(core.holds(1), false);
  assert.equal(wait(STICK.tapFire + DT * 3).fire, false);
  assert.equal(core.sticks.btn.on, false);
  // оборванное нажатие, которого кадр не видел, — тоже не огонь
  core.down(2, b.x, b.y);
  core.cancel(2);
  assert.equal(tick().fire, false);
  // чужой номер и повторный cancel ничего не ломают
  core.cancel(99);
  core.cancel(2);
  assert.equal(tick().fire, false);
});

test('кнопка оружия: второй палец на кнопке лишний; тот же номер лёг снова — прошлое касание отпущено', () => {
  const { core, tick } = make({ weaponBtn: true });
  const b = btnAt(core);
  assert.equal(core.down(1, b.x, b.y), 2);
  assert.notEqual(core.down(2, b.x, b.y), 2, 'кнопка занята');
  core.cancelAll();
  core.down(5, b.x, b.y);
  core.down(5, b.x, b.y);
  core.up(5);
  tick();
  assert.equal(core.holds(5), false);
});

test('кнопка оружия: включение и выключение на лету отпускает пальцы; reset и смена размера — тоже', () => {
  const { core, tick, wait } = make();
  core.setWeaponBtn(true);
  assert.equal(core.weaponBtn, true);
  const b = btnAt(core);
  core.down(1, b.x, b.y);
  wait(DT * 2);
  core.setWeaponBtn(false);
  assert.equal(core.holds(1), false);
  assert.equal(core.sticks.btn.shown, false);
  assert.equal(wait(STICK.tapFire + DT * 3).fire, false);
  core.setWeaponBtn(true);
  core.down(2, b.x, b.y);
  core.reset();
  assert.equal(core.holds(2), false);
  core.down(3, b.x, b.y);
  core.resize(W + 10, H);
  assert.equal(core.holds(3), false);
  assert.equal(tick().fire, false);
});

test('кнопка оружия, обёртка: pointerdown/pointerup на экране, мультитач, pointercancel, значок', () => {
  const p = page({ weaponBtn: true });
  assert.equal(p.sticksEl.children.length, 3);
  const el = p.sticksEl.children[2];
  assert.match(el.className, /^fh-stick-btn$/);
  assert.equal(el.attrs['aria-hidden'], 'true');
  const b = p.input.sticks.btn;
  const [tx, ty] = translate(el);
  assert.ok(Math.abs(tx - b.x) <= 0.25 && Math.abs(ty - b.y) <= 0.25, 'кнопка нарисована на своём месте (до полпикселя)');
  // левый стик тянут, второй рукой держат кнопку
  p.touch('pointerdown', 1, LEFT, Y);
  p.touch('pointermove', 1, LEFT + R, Y);
  p.touch('pointerdown', 2, b.x, b.y);
  assert.ok(p.stat.captured.includes(2));
  p.frame(DT);
  assert.match(el.className, /fh-stick-btn--on/);
  const i = p.frame(DT * 3);
  assert.equal(i.fire, true);
  close(i.mx, 1);
  p.touch('pointerup', 2, b.x, b.y);
  p.frame(DT);
  assert.doesNotMatch(el.className, /fh-stick-btn--on/);
  p.frame(STICK.tapFire + DT * 3);
  assert.equal(p.frame().fire, false);
  // pointercancel
  p.touch('pointerdown', 3, b.x, b.y);
  assert.equal(p.frame().fire, true);
  p.touch('pointercancel', 3, b.x, b.y);
  assert.equal(p.frame(STICK.tapFire + DT * 3).fire, false);
  // значок «огонь» / «взять» — на кнопке, а не на стике
  p.input.setAction('use');
  assert.equal(el.dataset.action, 'use');
  assert.equal(p.sticksEl.children[1].dataset.action, 'none');
  // выключили — кнопки на странице нет, значок вернулся на стик
  p.input.setWeaponBtn(false);
  assert.equal(p.sticksEl.children.length, 2);
  assert.equal(p.sticksEl.children[1].dataset.action, 'use');
  p.input.setWeaponBtn(true);
  assert.equal(p.sticksEl.children.length, 3);
  p.input.destroy();
  assert.equal(p.sticksEl.children.length, 0);
});

test('game.css: у кнопки оружия есть стили и своих цветов нет', () => {
  assert.match(rules, /\.fh-stick-btn\s*\{/);
  assert.match(rules, /\.fh-stick-btn--on/);
  assert.doesNotMatch(rules, /#[0-9a-fA-F]{3,8}\b/);
});
