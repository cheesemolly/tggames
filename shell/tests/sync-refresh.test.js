// Бета sync-refresh: прогресс с другого устройства и откат уровня (тестер: «на ПК 60-й уровень „Петли“, на
// телефоне 35-й»). Телефон — настоящий shell/sync.js поверх подставного localStorage; сервер ведёт себя как
// putState в server/worker.js (на сервере новее base — 409 со свежим прогрессом); ПК пишет прямо на сервер.
// Игра — как «Петля»: держит уровень в памяти и сохраняет его на каждом ходу и в destroy().

import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document ??= { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

const { createSync } = await import('../sync.js');
const { createStorage } = await import('../../platform/storage.js');
const { gatedStorage } = await import('../game-host.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOOP = 'game:loop:current';
const levelOf = (data) => data[LOOP]?.level;

function fakeServer(level, at = 1000) {
  const srv = { data: JSON.stringify({ [LOOP]: { level } }), updatedAt: at, levels: [], conflicts: 0, gets: 0, puts: 0, slow: 0 };
  srv.put = async (data, base) => {
    srv.puts += 1;
    if (srv.slow) await wait(srv.slow);
    if (typeof base === 'number' && srv.updatedAt > base) {
      srv.conflicts += 1;
      return { ok: false, status: 409, error: 'conflict', data: { conflict: true, data: srv.data, updatedAt: srv.updatedAt } };
    }
    srv.updatedAt = Math.max(Date.now(), srv.updatedAt + 1);
    srv.data = data;
    srv.levels.push(levelOf(JSON.parse(data)));
    return { ok: true, data: { updatedAt: srv.updatedAt } };
  };
  srv.get = async () => {
    srv.gets += 1;
    return { ok: true, data: { data: srv.data, updatedAt: srv.updatedAt } };
  };
  // на ПК прошли уровни — сохранение пришло на сервер с другого устройства
  srv.otherDevice = (next) => {
    srv.data = JSON.stringify({ ...JSON.parse(srv.data), [LOOP]: { level: next } });
    srv.updatedAt = Math.max(Date.now(), srv.updatedAt + 1);
  };
  return srv;
}

/** Игра как «Петля»: уровень в памяти; сессия с поколениями, как в shell/game-host.js (markStale / reload). */
function fakeGame() {
  const raw = createStorage('game:loop');
  let run = 0;
  let staleBefore = 0;
  const g = { level: 0, reloads: 0, baseAtReload: null };
  g.start = async () => {
    const r = ++run;
    g.storage = gatedStorage(raw, () => r > staleBefore);
    g.level = (await raw.get('current'))?.level ?? 1;
  };
  g.move = () => g.storage.set('current', { level: g.level });   // ход: сохраняет состояние из памяти
  g.win = () => {
    g.level += 1;
    return g.move();
  };
  g.markStale = () => { staleBefore = run; };
  g.reload = async () => {
    g.baseAtReload = localStorage.getItem('tggames-sync');       // отметка обмена в момент перезапуска
    await g.move();                                               // destroy() «Петли» тоже сохраняет — должно отброситься
    g.reloads += 1;
    await g.start();
  };
  return g;
}

/** Телефон: на устройстве и на сервере уровень 35, обмен был (base = время сервера). */
async function phone({ fresh = true, onWindow = null, duringReload = null } = {}) {
  store.clear();
  const srv = fakeServer(35);
  store.set(`tggames:${LOOP}`, JSON.stringify({ level: 35 }));
  store.set('tggames-sync', String(srv.updatedAt));
  const game = fakeGame();
  await game.start();
  const warnings = [];
  const messages = [];
  const account = { current: { id: 7 }, saveState: (data, base) => srv.put(data, base), fetchState: () => srv.get() };
  const sync = createSync({
    account,
    delay: 5,
    fresh: () => fresh,
    onMessage: (text) => messages.push(text),
    log: { warn: (...args) => warnings.push(args), error: () => {} },
    // как adoptFresh в shell/app.js: пометить игру устаревшей → прогресс в хранилище → перезапуск
    onFresh: async (apply) => {
      game.markStale();
      await onWindow?.(game);                  // окно между 409 и перезапуском: старая игра ещё живёт
      await apply();
      await duringReload?.();                  // перезапуск идёт — прогресс уже свежий
      await game.reload();
    },
  });
  return { srv, game, sync, warnings, messages };
}

const localLevel = () => JSON.parse(store.get(`tggames:${LOOP}`)).level;

test('вернулся в приложение: телефон подтягивает свежий уровень, следующее сохранение не откатывает сервер', async () => {
  const { srv, game, sync } = await phone();
  srv.otherDevice(60);
  await sync.refresh();

  assert.equal(game.reloads, 1, 'открытая игра перезапущена');
  assert.equal(game.level, 60, 'в игре уровень с ПК');
  assert.equal(localLevel(), 60, 'сохранение старой игры в destroy() отброшено');
  assert.equal(game.baseAtReload, '1000', 'отметка обмена не сдвинулась, пока свежее не загружено в игру');
  assert.equal(store.get('tggames-sync'), String(srv.updatedAt), 'после перезапуска — сдвинулась');

  await game.win();
  await wait(40);
  assert.equal(levelOf(JSON.parse(srv.data)), 61, 'сохранение с телефона — уже от 60-го');
  assert.ok(srv.levels.every((l) => l >= 60), `на сервер не ушло ни 35, ни 36: ${srv.levels}`);
  assert.equal(srv.conflicts, 0);
  sync.destroy();
});

test('сохранение со старого состояния успело уйти до перезапуска — сервер его отбивает, игра перезапускается', async () => {
  const { srv, game, sync, warnings } = await phone({
    // пока ждём перезапуска, старая игра делает ещё ход — это тоже должно отброситься
    onWindow: (g) => g.win(),
  });
  srv.otherDevice(60);
  await game.win();                            // телефон прошёл уровень на 35-м → 36, отправка с base = 1000
  await wait(60);

  assert.equal(srv.conflicts, 1, 'сервер ответил 409');
  assert.equal(game.reloads, 1);
  assert.equal(game.level, 60);
  assert.equal(levelOf(JSON.parse(srv.data)), 60, 'на сервере остался 60-й');
  assert.deepEqual(srv.levels, [], 'ни 36, ни 37 на сервер не записаны');
  assert.equal(localLevel(), 60, 'и на устройстве старое не осталось');
  assert.equal(warnings.length, 1, 'перекрытые серверными неотправленные изменения — в журнале');

  await game.win();
  await wait(40);
  assert.equal(levelOf(JSON.parse(srv.data)), 61);
  assert.equal(srv.conflicts, 1, 'после перезапуска конфликтов нет: base свежий');
  sync.destroy();
});

test('пока свежий прогресс принимается, ничего не уходит на сервер; изменения за это время — потом, с новым base', async () => {
  const { srv, game, sync } = await phone({
    // за время перезапуска что-то записала оболочка (день захода и т. п.) — это не старое состояние игры
    duringReload: () => createStorage('shell:player').set('visits', ['2026-09-28']),
  });
  srv.otherDevice(60);
  await sync.refresh();
  assert.deepEqual(srv.levels, [], 'во время приёма — ни одной отправки');
  await wait(40);
  assert.equal(srv.conflicts, 0, 'отправка после приёма — с новым base, без конфликта');
  assert.deepEqual(JSON.parse(srv.data)['shell:player:visits'], ['2026-09-28']);
  assert.equal(levelOf(JSON.parse(srv.data)), 60);
  assert.equal(game.level, 60);
  sync.destroy();
});

test('сервер не новее — при возврате ничего не перезапускается', async () => {
  const { srv, game, sync } = await phone();
  await sync.refresh();
  assert.equal(srv.gets, 1);
  assert.equal(game.reloads, 0);
  assert.equal(game.level, 35);
  sync.destroy();
});

test('своё сохранение ещё в пути — его ответ не принимается за прогресс с другого устройства', async () => {
  const { srv, game, sync } = await phone();
  srv.slow = 30;
  await game.win();                            // 36
  const sending = sync.push();                 // уходит сразу, сервер отвечает медленно
  await sync.refresh();                        // вернулись в приложение, пока отправка в пути
  await sending;
  assert.equal(game.reloads, 0, 'своё не перезапускает игру');
  assert.equal(levelOf(JSON.parse(srv.data)), 36);
  sync.destroy();
});

test('без беты — как раньше: при возврате не перечитываем, 409 сразу меняет прогресс', async () => {
  const { srv, game, sync, messages } = await phone({ fresh: false });
  srv.otherDevice(60);
  await sync.refresh();
  assert.equal(srv.gets, 0, 'не спрашивали сервер');
  await game.win();
  await wait(40);
  assert.equal(srv.conflicts, 1);
  assert.equal(game.reloads, 0, 'игру не перезапускаем');
  assert.equal(localLevel(), 60, 'прогресс на устройстве заменён');
  assert.deepEqual(messages, ['Прогресс обновлён с другого устройства']);
  sync.destroy();
});

test('одинаковый прогресс не отправляется: сворачивание без изменений не сдвигает время на сервере', async () => {
  const { srv, game, sync } = await phone();
  srv.otherDevice(60);
  await sync.refresh();                        // приняли 60-й
  const stamp = srv.updatedAt;
  await game.move();                           // игра пересохранила то же самое (например, при сворачивании)
  await sync.push({ final: true });
  await wait(30);
  assert.equal(srv.puts, 0, 'на сервер ничего не ушло');
  assert.equal(srv.updatedAt, stamp);
  await game.win();                            // а настоящее изменение уходит
  await wait(40);
  assert.equal(srv.puts, 1);
  assert.equal(levelOf(JSON.parse(srv.data)), 61);
  sync.destroy();
});
