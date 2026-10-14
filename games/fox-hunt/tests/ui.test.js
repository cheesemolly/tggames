import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { miniPage, press } from './mini-dom.js';
import { arena } from './helpers.js';

// ui.js тянет shared/motion.js, а тот спрашивает matchMedia при загрузке — страница нужна до импорта
const page = miniPage();
globalThis.document = page.doc;
globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
const { createUi, T, BOX, SET_H, BAG_H, zoomFor, stopAt } = await import('../ui.js');

/** Окно открыто, партия идёт; вернуть всё, что нужно проверять. rotated — экран лежит на боку. */
function make({ rotated = false, over = false, pc = false } = {}) {
  const root = page.doc.createElement('div');
  root.ownerDocument = page.doc;
  const G = arena();
  G.over = over;
  const calls = [];
  const settings = { music: true, lefty: false, flip: false };
  const actions = {
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    restart: () => calls.push('restart'),
    exit: () => calls.push('exit'),
    set: (key, value) => {
      calls.push(`set:${key}:${value}`);
      settings[key] = key === 'stick' ? (value ? 'float' : 'static') : value;   // как в index.js
    },
    sfx: () => {},
  };
  const get = {
    game: () => G,
    stats: () => ({}),
    settings: () => settings,
    sound: () => true,
    seen: () => ({}),
    toScreen: (x, y, out) => out,
    fullscreen: () => pc,
    screen: () => (rotated ? { rotated: true, insets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) } : null),
  };
  const ui = createUi({ root, api: { screen: get.screen() }, actions, get });
  const btn = (text) => ui.top.el.byText(text)[0];
  const labels = () => ui.top.el.find((n) => n.localName === 'button').map((n) => n.textContent);
  return { ui, root, G, calls, settings, btn, labels };
}

const SIDE = T.pause;

test('в HUD две кнопки: рюкзак слева от паузы', () => {
  const { root } = make();
  const row = root.byClass('fh-btns')[0];
  assert.ok(row, 'ряд кнопок есть');
  const kids = row.children.filter((c) => c.localName === 'button');
  assert.equal(kids.length, 2);
  assert.ok(kids[0].classList.contains('fh-bag-btn'), 'слева — рюкзак');
  assert.equal(kids[0].getAttribute('aria-label'), T.bagBtn);
  assert.equal(kids[1].getAttribute('aria-label'), T.pauseBtn);
  assert.equal(root.byClass('fh-pause-btn').length, 2);
});

test('кнопка рюкзака открывает рюкзак, закрытие возвращает игру', () => {
  const { ui, root, calls } = make();
  press(root.byClass('fh-bag-btn')[0]);
  assert.equal(ui.top.name, 'bag');
  assert.deepEqual(calls, ['pause'], 'игра встала');
  ui.back();
  assert.equal(ui.isOpen, false);
  assert.deepEqual(calls, ['pause', 'resume']);
});

test('кнопки для прицела при пойманном курсоре: рюкзак и пауза, их действие — то же, что у нажатия пальцем', () => {
  const { ui, root, calls } = make();
  const [bag, pause] = root.byClass('fh-pause-btn');
  assert.deepEqual(ui.hudButtons.map((b) => b.el), [bag, pause]);
  assert.ok(Object.isFrozen(ui.hudButtons) && ui.hudButtons.every((b) => typeof b.press === 'function'));
  ui.hudButtons[1].press();
  assert.equal(ui.top.name, 'pause');
  ui.hudButtons[0].press();                                // поверх паузы рюкзак не открывается — как пальцем
  assert.equal(ui.top.name, 'pause');
  ui.back();
  assert.equal(ui.isOpen, false);
  ui.hudButtons[0].press();
  assert.equal(ui.top.name, 'bag');
  ui.back();
  assert.deepEqual(calls, ['pause', 'resume', 'pause', 'resume']);
  // плашки и мини-карта нажатий не ловят — прицелу там нажимать нечего
  assert.equal(root.byClass('fh-map')[0].getAttribute('aria-hidden'), 'true');
});

test('рюкзака в паузе больше нет; пауза: ровно четыре кнопки и «Настройки»', () => {
  const { ui, labels } = make();
  ui.open('pause');
  assert.deepEqual(labels(), [SIDE.resume, SIDE.stats, SIDE.settings, SIDE.restart, SIDE.exit]);
  assert.ok(!labels().includes(T.bagBtn));
  assert.equal(SIDE.exit, 'В главное меню');
});

test('кнопки окон срабатывают по pointerup, а не по click', () => {
  const { ui, btn, calls } = make();
  ui.open('pause');
  btn(SIDE.exit).fire('click');
  assert.deepEqual(calls, ['pause'], 'click ничего не делает');
  press(btn(SIDE.exit));
  assert.deepEqual(calls, ['pause', 'exit']);
});

test('«Заново» переспрашивает в этом же окне; «Отмена» возвращает кнопки', () => {
  const { ui, btn, labels, calls } = make();
  ui.open('pause');
  const win = ui.top;
  assert.ok(btn(SIDE.restart).classList.contains('fh-btn--danger'), '«Заново» красная');
  press(btn(SIDE.restart));
  assert.equal(ui.top, win, 'окно то же');
  assert.deepEqual(calls, ['pause'], 'пока ничего не стёрто');
  assert.equal(win.el.textContent.includes('Начать заново? Охота пропадёт'), true);
  assert.deepEqual(labels(), ['Да, заново', 'Отмена']);
  press(btn('Отмена'));
  assert.deepEqual(labels(), [SIDE.resume, SIDE.stats, SIDE.settings, SIDE.restart, SIDE.exit]);
  assert.deepEqual(calls, ['pause']);
});

test('«Назад» во время вопроса снимает вопрос, а не паузу', () => {
  const { ui, labels } = make();
  ui.open('pause');
  press(ui.top.el.byText(SIDE.restart)[0]);
  assert.equal(ui.back(), true);
  assert.equal(ui.top.name, 'pause');
  assert.equal(labels()[0], SIDE.resume);
});

test('«Да, заново» начинает охоту сначала и продолжает игру', () => {
  const { ui, btn, calls } = make();
  ui.open('pause');
  press(btn(SIDE.restart));
  press(btn('Да, заново'));
  assert.deepEqual(calls, ['pause', 'restart', 'resume']);
  assert.equal(ui.isOpen, false);
});

test('«Продолжить» закрывает всё и продолжает игру', () => {
  const { ui, btn, calls } = make();
  ui.open('pause');
  press(btn(SIDE.resume));
  assert.equal(ui.isOpen, false);
  assert.deepEqual(calls, ['pause', 'resume']);
});

test('«Настройки» вложены в паузу; «Назад» возвращает в паузу', () => {
  const { ui, btn, calls } = make();
  ui.open('pause');
  press(btn(SIDE.settings));
  assert.equal(ui.top.name, 'settings');
  assert.deepEqual(calls, ['pause'], 'игра уже стоит — второй раз не ставится');
  press(btn(T.back));
  assert.equal(ui.top.name, 'pause');
  assert.deepEqual(calls, ['pause'], 'игра не продолжилась');
  press(btn(SIDE.settings));
  assert.equal(ui.back(), true, 'и «Назад» оболочки закрывает настройки');
  assert.equal(ui.top.name, 'pause');
});

test('настройки: музыка, звуки, левша; «Перевернуть» — только у повёрнутого экрана', () => {
  const flat = make();
  flat.ui.open('settings');
  assert.deepEqual(flat.labels(), [T.set.music, T.set.sound, T.set.lefty, `${T.set.stick}: ${T.set.stickStatic}`, T.set.weaponBtn, T.back]);
  const turned = make({ rotated: true });
  turned.ui.open('settings');
  assert.deepEqual(turned.labels(), [T.set.music, T.set.sound, T.set.lefty, `${T.set.stick}: ${T.set.stickStatic}`, T.set.weaponBtn, T.set.flip, T.back]);
});

test('переключатель в настройках зовёт игру и показывает её ответ', () => {
  const { ui, btn, calls, settings } = make();
  ui.open('settings');
  const lefty = btn(T.set.lefty);
  assert.equal(lefty.getAttribute('aria-checked'), 'false');
  press(lefty);
  assert.deepEqual(calls, ['pause', 'set:lefty:true']);
  assert.equal(settings.lefty, true);
  assert.equal(lefty.getAttribute('aria-checked'), 'true');
});

test('джойстики: нет поля в настройках — «Статичные»; переключатель меняет подпись', () => {
  const { ui, labels, calls } = make();
  ui.open('settings');
  const sw = ui.top.el.find((n) => n.localName === 'button' && n.textContent.startsWith(T.set.stick))[0];
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  press(sw);
  assert.ok(calls.includes('set:stick:true'));
  assert.ok(labels().includes(`${T.set.stick}: ${T.set.stickFloat}`));
  assert.equal(sw.getAttribute('aria-checked'), 'true');
});

test('нет окон — «Назад» открывает паузу; конец партии окон не открывает', () => {
  const live = make();
  assert.equal(live.ui.back(), true);
  assert.equal(live.ui.top.name, 'pause');
  const done = make({ over: true });
  done.root.byClass('fh-bag-btn')[0].fire('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0 });
  press(done.root.byClass('fh-bag-btn')[0]);
  assert.equal(done.ui.isOpen, false);
});

test('стили: обе кнопки HUD не меньше 44×44, окна — рамка BOX без прокрутки', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  const rule = css.match(/\.fh-pause-btn \{[^}]*\}/)[0];
  assert.match(rule, /width: max\(44px, /);
  assert.match(rule, /height: max\(44px, /);
  // все окна — одна рамка BOX, растёт целиком (scale): ни прокрутки, ни своих размеров у паузы и настроек
  const win = css.match(/\[data-game="fox-hunt"\] \.fh-win \{[^}]*\}/)[0];
  assert.match(win, new RegExp(`width: ${BOX.w}px;`));
  assert.match(win, new RegExp(`height: ${BOX.h}px;`));
  assert.match(win, /scale: var\(--fh-zoom/);
  assert.doesNotMatch(css, /\.fh-(win|pause|settings|pause-body|set-list) \{[^}]*overflow[^;]*(auto|scroll)/);
  assert.doesNotMatch(css, /\] \.fh-(pause|settings) \{[^}]*(width|height)/);
  // настройки выше остальных ровно на SET_H и растут по своему масштабу
  const set = css.match(/\.fh-win\.fh-settings \{[^}]*\}/)[0];
  assert.match(set, new RegExp(`height: ${SET_H}px;`));
  assert.match(set, /scale: var\(--fh-zoom-set/);
  // рюкзак выше остальных ровно на BAG_H и растёт по своему масштабу
  const bag = css.match(/\.fh-win\.fh-bag \{[^}]*\}/)[0];
  assert.match(bag, new RegExp(`height: ${BAG_H}px;`));
  assert.match(bag, /scale: var\(--fh-zoom-bag/);
});

test('HUD: кнопки не выходят за безопасные отступы (правый край идёт от ls-r)', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  assert.match(css.match(/\.fh-hud \{[^}]*\}/)[0], /var\(--ls-r, 0px\)/);
  assert.match(css.match(/\.fh-hud \{[^}]*\}/)[0], /var\(--ls-t, 0px\)/);
});

test('«Отдельная кнопка для оружия»: по умолчанию выключена, переключатель зовёт игру и показывает её ответ', () => {
  const { ui, btn, calls, settings } = make();
  ui.open('settings');
  const sw = btn(T.set.weaponBtn);
  assert.equal(T.set.weaponBtn, 'Отдельная кнопка для оружия');
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  press(sw);
  assert.deepEqual(calls, ['pause', 'set:weaponBtn:true']);
  assert.equal(settings.weaponBtn, true);
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  press(sw);
  assert.equal(settings.weaponBtn, false);
  assert.equal(sw.getAttribute('aria-checked'), 'false');
});

test('пауза: у кнопок значок слева, надпись — отдельно; пока рисунка нет, окошко пустое', () => {
  const { ui, btn } = make();
  ui.open('pause');
  for (const text of [SIDE.resume, SIDE.stats, SIDE.settings, SIDE.restart, SIDE.exit]) {
    const b = btn(text);
    assert.ok(b, text);
    const kids = b.children.filter((c) => typeof c !== 'string' && c.localName);
    assert.ok(kids[0].classList.contains('fh-ic'), `${text}: значок первым`);
    assert.ok(kids[1].classList.contains('fh-btn-text'), `${text}: надпись вторым`);
    assert.equal(kids[1].textContent, text);
    assert.equal(b.textContent, text, `${text}: заглушка значка без буквы`);
  }
});

test('шрифт окон Podkova лежит в репозитории и указан в лицензиях', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  for (const part of ['cyrillic', 'latin']) {
    assert.ok(css.includes(`url(../../styles/fonts/podkova-${part}.woff2)`), part);
    const font = readFileSync(new URL(`../../../styles/fonts/podkova-${part}.woff2`, import.meta.url));
    assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  }
  readFileSync(new URL('../../../styles/fonts/OFL-podkova.txt', import.meta.url));
  for (const name of ['LICENSE', 'LICENSE.ru.md']) {
    assert.match(readFileSync(new URL(`../../../${name}`, import.meta.url), 'utf8'), /styles\/fonts\/podkova-\*\.woff2/);
  }
});

test('тема Telegram в игре не используется: ни в стилях, ни в коде (одна палитра на обе темы)', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /tg-theme|data-theme|prefers-color-scheme/);
  for (const name of ['ui.js', 'index.js', 'render.js', 'input.js']) {
    const src = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /tg-theme|colorScheme|data-theme/, name);
  }
});

test('статистика: на плитках и в подписях страниц нет многоточий, у чисел нет обрезки', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* статистика */'), css.indexOf('/* дар леса'));
  assert.doesNotMatch(block, /text-overflow/);
  assert.doesNotMatch(block, /line-clamp/);
  // числа не переносятся и не режутся; длинное «Локация 15 · Осенняя чаща» — на широкой плитке и переносится
  assert.match(block, /\.fh-tile-num \{[^}]*white-space: nowrap/);
  assert.doesNotMatch(block.match(/\.fh-tile-num \{[^}]*\}/)[0], /overflow/);
  assert.match(block, /\.fh-tiles--run \.fh-tile--wide \{ grid-column: span 3/);
});

test('статистика: самые длинные значения целиком в плитках; «Локация» — число и место отдельно', () => {
  const { ui } = make();
  const win = ui.open('stats', 'run');
  const tiles = win.el.byClass('fh-tile');
  assert.equal(tiles.length, 8);
  const floor = tiles.find((t) => t.textContent.includes(T.stats.run.floor));
  assert.ok(floor.className.includes('fh-tile--wide'));
  assert.match(floor.textContent, /^\d+ · .+Локация$/);
  ui.destroy();
});

test('окна: z-index не больше 10, при «уменьшить движение» переходы ровно 0s, цвета — переменные --fh-*', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  for (const m of css.matchAll(/z-index:\s*(-?\d+)/g)) assert.ok(Number(m[1]) <= 10, `z-index ${m[1]}`);
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
  assert.match(reduced, /transition(-duration)?: (none|0s)/);
  assert.doesNotMatch(reduced, /\b1ms\b/);
  const modal = css.match(/\.fh-modal \{[^}]*\}/)[0];
  assert.match(modal, /var\(--fh-w-/);
  assert.match(css, /--fh-w-plank:/);
  assert.match(css, /--fh-danger:/);
});

test('настройки: «Полный экран» и подсказка — только на ПК, ответ игры виден после refreshSettings', () => {
  const phone = make();
  phone.ui.open('settings');
  assert.equal(phone.ui.top.el.byText(T.set.fullscreen).length, 0);
  assert.equal(phone.ui.top.el.byClass('fh-set-hint').length, 0);
  const { ui, settings, calls } = make({ pc: true });
  settings.fullscreen = false;
  ui.open('settings');
  const sw = ui.top.el.byText(T.set.fullscreen)[0];
  assert.ok(sw);
  assert.equal(ui.top.el.byClass('fh-set-hint')[0].textContent, T.set.fullscreenHint);
  const row = () => ui.top.el.find((n) => n.localName === 'button' && n.textContent.includes(T.set.fullscreen))[0];
  assert.equal(row().getAttribute('aria-checked'), 'false');
  press(row());
  assert.ok(calls.includes('set:fullscreen:true'));
  assert.equal(row().getAttribute('aria-checked'), 'true');
  settings.fullscreen = false;           // игра: браузер отказал или вышли по Esc
  ui.refreshSettings();
  assert.equal(row().getAttribute('aria-checked'), 'false');
});

test('настройки: ползунок «Графика» — стрелки, касание, подпись, окно влезает в рамки', () => {
  const { ui, calls, settings } = make();
  ui.open('settings');
  const bar = ui.top.el.byClass('fh-gfx-bar')[0];
  assert.ok(bar, 'ползунок есть');
  assert.equal(bar.getAttribute('role'), 'slider');
  const val = () => ui.top.el.byClass('fh-gfx-val')[0].textContent;
  assert.equal(val(), T.set.gfx[1], 'нет поля — средняя');
  const key = (k) => bar.fire('keydown', { key: k, stopPropagation() {} });
  assert.equal(key('ArrowLeft').defaultPrevented, true);
  assert.equal(settings.graphics, 0);
  assert.equal(val(), T.set.gfx[0]);
  key('ArrowLeft');                                  // ниже низкой не бывает
  assert.equal(settings.graphics, 0);
  key('End');
  assert.equal(settings.graphics, 2);
  assert.equal(bar.getAttribute('aria-valuenow'), '2');
  assert.equal(bar.getAttribute('aria-valuetext'), T.set.gfx[2]);
  key('ArrowUp');
  assert.equal(settings.graphics, 2);
  assert.equal(calls.filter((c) => c.startsWith('set:graphics')).length, 2, 'без перемены — без записи');
  // касание: полоса 100 пикселей, x=50 — середина, x=-20 и 400 — края
  bar.getBoundingClientRect = () => ({ left: 0, width: 100 });
  bar.fire('pointerdown', { pointerId: 1, button: 0, clientX: 50 });
  assert.equal(settings.graphics, 1);
  bar.fire('pointermove', { pointerId: 1, clientX: -20 });
  assert.equal(settings.graphics, 0);
  bar.fire('pointerup', { pointerId: 1 });
  bar.fire('pointermove', { pointerId: 1, clientX: 400 });
  assert.equal(settings.graphics, 0, 'после отпускания палец не тянет');
  assert.equal(stopAt(49, { left: 0, width: 100 }), 1);
  assert.equal(stopAt(10, { left: 0, width: 0 }), null);
  // окно настроек влезает в рамку 454×284 и меньше: масштаб считается от его высоты
  for (const [w, h] of [[454, 284], [320, 180], [568, 320], [360, 640]]) {
    const k = zoomFor(w, h, undefined, SET_H);
    assert.ok(SET_H * k <= h - BOX.gap * 2 + 1e-6 || k === 0.5, `${w}×${h}`);
    assert.ok(BOX.w * k <= w - BOX.gap * 2 + 1e-6 || k === 0.5, `${w}×${h}`);
  }
  for (const [w, h] of [[454, 284], [320, 180], [568, 320], [360, 640]]) {
    const k = zoomFor(w, h, undefined, BAG_H);
    assert.ok(BAG_H * k <= h - BOX.gap * 2 + 1e-6 || k === 0.5, `рюкзак ${w}×${h}`);
  }
});
