import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { miniPage, press } from './mini-dom.js';
import { arena } from './helpers.js';

// ui.js тянет shared/motion.js, а тот спрашивает matchMedia при загрузке — страница нужна до импорта
const page = miniPage();
globalThis.document = page.doc;
globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
const { createUi, T } = await import('../ui.js');

/** Окно открыто, партия идёт; вернуть всё, что нужно проверять. rotated — экран лежит на боку. */
function make({ rotated = false, over = false } = {}) {
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
      settings[key] = value;
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
  assert.deepEqual(flat.labels(), [T.set.music, T.set.sound, T.set.lefty, T.back]);
  const turned = make({ rotated: true });
  turned.ui.open('settings');
  assert.deepEqual(turned.labels(), [T.set.music, T.set.sound, T.set.lefty, T.set.flip, T.back]);
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

test('нет окон — «Назад» открывает паузу; конец партии окон не открывает', () => {
  const live = make();
  assert.equal(live.ui.back(), true);
  assert.equal(live.ui.top.name, 'pause');
  const done = make({ over: true });
  done.root.byClass('fh-bag-btn')[0].fire('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0 });
  press(done.root.byClass('fh-bag-btn')[0]);
  assert.equal(done.ui.isOpen, false);
});

test('стили: обе кнопки HUD не меньше 44×44, окна без прокрутки и в 568×320', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  const rule = css.match(/\.fh-pause-btn \{[^}]*\}/)[0];
  assert.match(rule, /width: max\(44px, /);
  assert.match(rule, /height: max\(44px, /);
  assert.doesNotMatch(css.match(/\.fh-pause \{[^}]*\}/)[0], /overflow[^;]*(auto|scroll)/);
  assert.doesNotMatch(css.match(/\.fh-settings \{[^}]*\}/)[0], /overflow[^;]*(auto|scroll)/);
  for (const sel of ['fh-pause', 'fh-settings']) {
    const h = Number(css.match(new RegExp(`\\.${sel} \\{[^}]*max-height: (\\d+)px`))[1]);
    assert.ok(h <= 284 && h + 36 <= 320, `${sel}: ${h}`);
  }
});

test('HUD: кнопки не выходят за безопасные отступы (правый край идёт от ls-r)', () => {
  const css = readFileSync(new URL('../game.css', import.meta.url), 'utf8');
  assert.match(css.match(/\.fh-hud \{[^}]*\}/)[0], /var\(--ls-r, 0px\)/);
  assert.match(css.match(/\.fh-hud \{[^}]*\}/)[0], /var\(--ls-t, 0px\)/);
});
