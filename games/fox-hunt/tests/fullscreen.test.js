import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFullscreen, isDesktop, desktopFacts, readFullscreen } from '../fullscreen.js';
import { stepCursor } from '../input.js';

// Поддельные document / navigator: полный экран и клавиатура ведут журнал, отказы включаются флагами.
function make({ noFs = false, denyFs = false, noKeyboard = false, denyKey = false } = {}) {
  const log = [];
  const handlers = new Map();
  const doc = {
    fullscreenElement: null,
    addEventListener: (t, f) => handlers.set(t, f),
    removeEventListener: (t, f) => { if (handlers.get(t) === f) handlers.delete(t); },
    exitFullscreen: async () => {
      log.push('exit');
      doc.fullscreenElement = null;
      handlers.get('fullscreenchange')?.();
    },
  };
  const host = noFs ? {} : {
    requestFullscreen: async () => {
      log.push('request');
      if (denyFs) throw new Error('denied');
      doc.fullscreenElement = host;
      handlers.get('fullscreenchange')?.();
    },
  };
  const nav = noKeyboard ? {} : {
    keyboard: {
      lock: async (keys) => {
        log.push(`lock:${keys.join()}`);
        if (denyKey) throw new Error('denied');
      },
      unlock: () => log.push('unlock'),
    },
  };
  const lost = [];
  const fs = createFullscreen({ doc, nav, host, onLost: () => lost.push('lost') });
  // браузер вышел из полного экрана сам (Esc без захвата клавиши)
  const browserExit = () => {
    doc.fullscreenElement = null;
    handlers.get('fullscreenchange')?.();
  };
  return { fs, doc, log, lost, handlers, browserExit };
}

test('настройка: по умолчанию включено, выключает только явное false', () => {
  assert.equal(readFullscreen(undefined), true);
  assert.equal(readFullscreen(null), true);
  assert.equal(readFullscreen({ music: true }), true, 'старое сохранение');
  assert.equal(readFullscreen({ fullscreen: 'x' }), true);
  assert.equal(readFullscreen({ fullscreen: false }), false);
  assert.equal(readFullscreen({ fullscreen: true }), true);
});

test('«ПК или нет»: касания, неточный указатель, телефонный браузер и повёрнутый экран — не ПК', () => {
  const pc = { touchPoints: 0, fine: true, rotated: false, mobileUa: false };
  assert.equal(isDesktop(pc), true);
  assert.equal(isDesktop({ ...pc, touchPoints: 5 }), false);
  assert.equal(isDesktop({ ...pc, fine: false }), false);
  assert.equal(isDesktop({ ...pc, rotated: true }), false);
  assert.equal(isDesktop({ ...pc, mobileUa: true }), false);
  assert.equal(isDesktop(), false, 'ничего не известно — не ПК');

  const win = (touch, fine, ua) => ({ navigator: { maxTouchPoints: touch, userAgent: ua }, matchMedia: () => ({ matches: fine }) });
  assert.deepEqual(desktopFacts(win(0, true, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120'), null),
    { touchPoints: 0, fine: true, rotated: false, mobileUa: false });
  assert.equal(isDesktop(desktopFacts(win(0, true, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120'))), true);
  assert.equal(isDesktop(desktopFacts(win(5, false, 'Mozilla/5.0 (Linux; Android 13) Mobile'))), false);
  assert.equal(isDesktop(desktopFacts(win(0, true, 'Mozilla/5.0 (iPhone) Mobile'))), false);
  assert.equal(isDesktop(desktopFacts(win(0, true, 'x'), { rotated: true })), false);
  assert.equal(isDesktop(desktopFacts(undefined)), false);
});

test('включение: полный экран, затем захват Esc; выключение — выход и снятие захвата без onLost', async () => {
  const { fs, log, lost } = make();
  assert.equal(fs.active, false);
  assert.equal(await fs.enter(), true);
  assert.deepEqual(log, ['request', 'lock:Escape']);
  assert.equal(fs.active, true);
  assert.equal(fs.keyLocked, true);
  fs.leave();
  assert.deepEqual(log, ['request', 'lock:Escape', 'unlock', 'exit']);
  assert.equal(fs.active, false);
  assert.equal(fs.keyLocked, false);
  assert.deepEqual(lost, [], 'своя команда — не «потеряли»');
  fs.leave();
  assert.equal(log.length, 4, 'лишний leave ничего не делает');
});

test('отказ полного экрана и отсутствие API — тихо: false, ничего не сломано', async () => {
  for (const opts of [{ denyFs: true }, { noFs: true }]) {
    const { fs, log, lost } = make(opts);
    assert.equal(await fs.enter(), false);
    assert.equal(fs.active, false);
    assert.ok(!log.includes('lock:Escape'), 'без полного экрана клавишу не ловим');
    fs.leave();
    fs.destroy();
    assert.deepEqual(lost, []);
  }
});

test('нет Keyboard Lock или он отказал: полный экран есть, клавиша не поймана', async () => {
  for (const opts of [{ noKeyboard: true }, { denyKey: true }]) {
    const { fs, log } = make(opts);
    assert.equal(await fs.enter(), true);
    assert.equal(fs.active, true);
    assert.equal(fs.keyLocked, false);
    fs.leave();
    assert.ok(!log.includes('unlock'), 'снимать нечего');
    assert.equal(fs.active, false);
  }
});

test('Esc без захвата: браузер вышел сам — fullscreenchange зовёт onLost один раз', async () => {
  const { fs, lost, browserExit, log } = make({ noKeyboard: true });
  await fs.enter();
  browserExit();
  assert.deepEqual(lost, ['lost']);
  assert.equal(fs.active, false);
  browserExit();
  assert.deepEqual(lost, ['lost'], 'повторное событие — не новая потеря');
  assert.ok(!log.includes('exit'));
});

test('вышел сам при пойманной клавише (зажатый Esc): захват снимается, onLost зовётся', async () => {
  const { fs, lost, browserExit, log } = make();
  await fs.enter();
  browserExit();
  assert.deepEqual(lost, ['lost']);
  assert.equal(log.at(-1), 'unlock');
  assert.equal(fs.keyLocked, false);
});

test('выключили, пока включение ещё шло: полный экран не остаётся', async () => {
  const { fs, doc, lost } = make();
  const p = fs.enter();
  fs.leave();
  assert.equal(await p, false);
  assert.equal(doc.fullscreenElement, null);
  assert.equal(fs.active, false);
  assert.deepEqual(lost, []);
});

test('destroy: выход из полного экрана, снятие захвата, обработчик снят, onLost молчит', async () => {
  const { fs, doc, log, lost, handlers, browserExit } = make();
  await fs.enter();
  fs.destroy();
  assert.equal(doc.fullscreenElement, null);
  assert.equal(handlers.size, 0);
  assert.deepEqual(log, ['request', 'lock:Escape', 'unlock', 'exit']);
  assert.equal(fs.active, false);
  assert.equal(await fs.enter(), false, 'после destroy не включается');
  browserExit();
  assert.deepEqual(lost, []);
  fs.destroy();
});

test('прицел при захвате: сдвиги складываются и не выходят за поле', () => {
  const cur = { x: 10, y: 10 };
  stepCursor(cur, 5, -3, 100, 50);
  assert.deepEqual(cur, { x: 15, y: 7 });
  stepCursor(cur, 500, 500, 100, 50);
  assert.deepEqual(cur, { x: 100, y: 50 });
  stepCursor(cur, -900, -900, 100, 50);
  assert.deepEqual(cur, { x: 0, y: 0 });
  stepCursor(cur, undefined, NaN, 100, 50);
  assert.deepEqual(cur, { x: 0, y: 0 }, 'нет сдвига — прицел на месте');
  cur.x = 90;
  stepCursor(cur, 0, 0, 40, 50);
  assert.equal(cur.x, 40, 'поле сузилось — прицел подтянут внутрь');
});

// ---------- как это собрано в index.js / ui.js / input.js ----------

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('index.js: переключатель есть только на ПК, настройка читается через readFullscreen, destroy гасит полный экран', () => {
  const src = read('index.js');
  assert.match(src, /fullscreen: readFullscreen\(v\)/);
  assert.match(src, /isDesktop\(desktopFacts\(window, api\.screen \?\? null\)\)/);
  assert.match(src, /fs\?\.destroy\(\)/);
  assert.match(src, /fs\?\.leave\(\)/, '«В меню» выходит из полного экрана сразу');
  assert.match(src, /document\.removeEventListener\('pointerup', armed, true\)/);
  assert.doesNotMatch(src, /Telegram\.WebApp|window\.Telegram/);
});

test('ui.js: переключатель «Полный экран» и подсказка одной строкой — только если игра сказала, что она на ПК', () => {
  const src = read('ui.js');
  assert.match(src, /fullscreen: 'Полный экран'/);
  assert.match(src, /fullscreenHint: 'Esc — пауза\. Чтобы выйти из полного экрана, зажми Esc'/);
  assert.match(src, /get\.fullscreen\?\.\(\)/);
});

test('input.js: захват курсора снимается в destroy вместе со своими обработчиками', () => {
  const src = read('input.js');
  assert.match(src, /addEventListener\('pointerlockchange'/);
  assert.match(src, /removeEventListener\('pointerlockchange'/);
  assert.match(src, /removeEventListener\('pointerlockerror'/);
  assert.match(src, /exitPointerLock/);
});

// ---------- полный экран Telegram (окно мини-приложения на компьютере) ----------

function makeTg({ supported = true, answer = 'ok' } = {}) {
  const log = [];
  const subs = [];
  const tg = {
    supported,
    isActive: false,
    request() {
      log.push('request');
      if (answer === 'ok') { tg.isActive = true; subs.forEach((f) => f()); }
      else if (answer === 'fail') subs.forEach((f) => f());
    },
    exit() { log.push('exit'); tg.isActive = false; subs.forEach((f) => f()); },
    onChange: (f) => subs.push(f),
    offChange: (f) => subs.splice(subs.indexOf(f), 1),
  };
  const lost = [];
  const fs = createFullscreen({ doc: { addEventListener() {}, removeEventListener() {} }, nav: {}, host: {}, tg, onLost: () => lost.push('lost') });
  return { tg, fs, log, lost, subs };
}

test('Telegram: полный экран — через платформу, а не через requestFullscreen страницы', async () => {
  const { tg, fs, log, lost } = makeTg();
  assert.equal(await fs.enter(), true);
  assert.equal(fs.active, true);
  assert.deepEqual(log, ['request']);
  fs.leave();
  assert.deepEqual(log, ['request', 'exit']);
  assert.equal(fs.active, false);
  assert.deepEqual(lost, []);
  assert.equal(tg.isActive, false);
});

test('Telegram: отказ клиента — false; нет поддержки — прежний путь через страницу', async () => {
  const { fs, lost } = makeTg({ answer: 'fail' });
  assert.equal(await fs.enter(), false);
  assert.equal(fs.active, false);
  assert.deepEqual(lost, []);
  const plain = make();
  const viaTg = createFullscreen({ doc: plain.doc, nav: {}, host: {}, tg: { supported: false } });
  assert.equal(await viaTg.enter(), false, 'у поддельного host нет requestFullscreen');
});

test('Telegram: вышли сами (клиент закрыл полный экран) — onLost; destroy выходит и отписывается', async () => {
  const { tg, fs, lost, subs, log } = makeTg();
  await fs.enter();
  tg.isActive = false;
  subs.forEach((f) => f());
  assert.deepEqual(lost, ['lost']);
  await fs.enter();
  fs.destroy();
  assert.equal(log.at(-1), 'exit');
  assert.equal(subs.length, 0);
  assert.equal(lost.length, 1, 'свой выход — не потеря');
});
