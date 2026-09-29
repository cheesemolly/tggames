// Бета sync-merge: два устройства одного игрока, у каждого своё хранилище и настоящий shell/sync.js, сервер —
// настоящий server/worker.js поверх SQLite (как в server/tests). Проверяется то, ради чего слияние: ни одно устройство
// не теряет прогресс — без связи, при почти одновременной игре, при переходе со старого обмена; уровень «Петли» не
// откатывается; открытая игра перезапускается, только если пришло что-то про неё.

import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../server/worker.js';
import { makeInitData, createEnv, TOKEN, USER } from '../../server/tests/helpers.js';

globalThis.document ??= { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

// У каждого устройства своё хранилище; код обращается к localStorage — подставляется хранилище того устройства,
// которое сейчас действует (устройства действуют по очереди).
let active = null;
Object.defineProperty(globalThis, 'localStorage', { get: () => active, configurable: true });

function memoryStorage() {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const { createSync } = await import('../sync.js');
const { createStorage } = await import('../../platform/storage.js');
const { gatedStorage } = await import('../game-host.js');
const { recordResult } = await import('../stats.js');

const ORIGIN = 'https://cheesemolly.github.io';

/** Сервер: настоящий обработчик. */
async function server() {
  const env = createEnv();
  const initData = await makeInitData(TOKEN, USER);
  const http = async (method, path, payload) => {
    const res = await worker.fetch(new Request(`https://api.test${path}`, {
      method,
      headers: { Origin: ORIGIN, Authorization: `tma ${initData}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    }), env);
    const data = await res.json();
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'server', status: res.status, data };
  };
  const srv = { env, http, levels: [] };
  srv.state = async () => JSON.parse((await http('GET', '/state')).data.data);
  return srv;
}

/**
 * Устройство: своё хранилище, свой номер, sync создаётся на время действия (в жизни он один на страницу; здесь так
 * обработчики изменений хранилища одного устройства не слышат записи другого).
 */
function device(srv, id) {
  const dev = { id, store: memoryStorage(), down: false, dropReply: false, restarts: 0, freshCalls: 0, messages: [], session: null };
  const call = async (...args) => {
    if (dev.down) return { ok: false, error: 'network' };
    const res = await srv.http(...args);
    if (res.ok && args[0] === 'PUT' && res.data.keys) {
      const level = JSON.parse((await srv.http('GET', '/state')).data.data)['game:loop:current']?.level;
      if (level !== undefined) srv.levels.push(level);
    }
    if (dev.dropReply) {                        // сервер принял, а ответ до устройства не дошёл
      dev.dropReply = false;
      return { ok: false, error: 'network' };
    }
    return res;
  };
  const account = {
    current: { id: 1 },
    fetchMerged: (since, d) => call('GET', `/state?sync=3&since=${since}&device=${d}`),
    saveMerged: (payload) => call('PUT', '/state', payload),
    fetchState: () => call('GET', '/state'),
    saveState: (data, base) => call('PUT', '/state', { data, base }),
  };
  dev.run = async (fn) => {
    const prev = active;
    active = dev.store;
    const sync = createSync({
      account,
      delay: 1e9,                                // сами по таймеру не шлём — только когда тест скажет
      refreshGap: 0,
      merge: () => true,
      fresh: () => true,
      device: async () => dev.id,
      onMessage: (text) => dev.messages.push(text),
      log: { warn() {}, error: (...a) => dev.messages.push(String(a[0])) },
      // как adoptFresh в shell/app.js: перезапуск, только если задеты ключи открытой игры
      onFresh: async (apply, keys) => {
        dev.freshCalls += 1;
        const s = dev.session;
        const hit = s && (!keys || keys.some((k) => k.startsWith(`game:${s.gameId}:`) || k === `shell:saves:${s.gameId}`));
        if (hit) s.markStale();
        await apply();
        if (hit) {
          await s.reload();
          dev.restarts += 1;
        }
      },
    });
    try {
      return await fn(sync);
    } finally {
      sync.destroy();
      active = prev;
    }
  };
  dev.local = (key) => {
    const raw = dev.store.getItem(`tggames:${key}`);
    return raw === null ? undefined : JSON.parse(raw);
  };
  dev.put = (key, value) => dev.store.setItem(`tggames:${key}`, JSON.stringify(value));
  return dev;
}

/** Открытая игра с поколениями, как в shell/game-host.js: состояние в памяти, markStale / reload. */
function openGame(dev, gameId, key = 'current') {
  const raw = createStorage(`game:${gameId}`);
  let run = 0;
  let staleBefore = 0;
  const g = { gameId, state: null };
  g.start = async () => {
    const r = ++run;
    g.storage = gatedStorage(raw, () => r > staleBefore);
    g.state = await raw.get(key);
  };
  g.save = () => g.storage.set(key, g.state);
  g.markStale = () => { staleBefore = run; };
  g.reload = async () => {
    await g.save();                              // destroy() игры тоже сохраняет — у устаревшей не должно пройти
    await g.start();
  };
  dev.session = g;
  return g;
}

test('два устройства без связи: по 3 партии и по 2 подсказки на каждом → после синхронизации +6 партий и −4 подсказки', async () => {
  const srv = await server();
  const pc = device(srv, 'pc-device-0001');
  const phone = device(srv, 'phone-device-02');
  pc.put('shell:stats:sudoku', { played: 10, wins: 5, best: null });
  pc.put('game:words:progress', { v: 1, levels: {}, current: 0, hints: 9, passedCount: 0 });
  await pc.run((sync) => sync.pull());                      // первый обмен: прогресс гостя уходит на сервер
  await phone.run((sync) => sync.pull());                   // второе устройство берёт его
  assert.equal(phone.local('shell:stats:sudoku').played, 10);

  for (const dev of [pc, phone]) {
    dev.down = true;
    await dev.run(async (sync) => {
      for (let i = 0; i < 3; i += 1) await recordResult({ gameId: 'sudoku', outcome: i ? 'lose' : 'win', score: null });
      const words = createStorage('game:words');
      for (let i = 0; i < 2; i += 1) {
        const p = await words.get('progress');
        await words.set('progress', { ...p, hints: p.hints - 1 });
      }
      await sync.push();                                     // без связи — остаётся на устройстве
    });
    assert.equal(dev.local('shell:stats:sudoku').played, 13, 'на устройстве — своё');
  }
  for (const dev of [pc, phone]) {
    dev.down = false;
    await dev.run((sync) => sync.push());
  }
  await pc.run((sync) => sync.refresh());
  const state = await srv.state();
  assert.equal(state['shell:stats:sudoku'].played, 16);
  assert.equal(state['shell:stats:sudoku'].wins, 7);
  assert.equal(state['game:words:progress'].hints, 5);
  for (const dev of [pc, phone]) {
    assert.equal(dev.local('shell:stats:sudoku').played, 16, `${dev.id}: партии сложились`);
    assert.equal(dev.local('game:words:progress').hints, 5, `${dev.id}: подсказки — 9 − 4`);
  }
});

test('переход со старого обмена: счётчики двух устройств не удваиваются, сыгранное без связи не теряется', async () => {
  const srv = await server();
  // старый клиент (игрок без беты) записал прогресс снимком
  const old = await srv.http('PUT', '/state', { data: JSON.stringify({ 'shell:stats:flags': { played: 10, wins: 4, best: 7 } }), base: 0 });
  assert.equal(old.status ?? 200, 200);
  const t0 = old.data.updatedAt;
  const a = device(srv, 'device-aaaa-01');
  const b = device(srv, 'device-bbbb-02');
  const c = device(srv, 'device-cccc-03');
  for (const [dev, played, dirty] of [[a, 10, false], [b, 12, true], [c, 10, false]]) {
    dev.put('shell:stats:flags', { played, wins: 4, best: 7 });
    dev.store.setItem('tggames-sync', String(t0));           // последний обмен по-старому
    if (dirty) dev.store.setItem('tggames-sync-dirty', '1'); // B сыграл 2 партии без связи
  }
  await a.run((sync) => sync.pull());                        // A просто берёт серверное
  await a.run(async (sync) => {
    for (let i = 0; i < 3; i += 1) await recordResult({ gameId: 'flags', outcome: 'lose', score: null });
    await sync.push();
  });
  await b.run((sync) => sync.pull());                        // B переходит со своим несохранённым
  await c.run((sync) => sync.pull());
  await a.run((sync) => sync.refresh());
  assert.equal((await srv.state())['shell:stats:flags'].played, 15, '10 + 3 (A) + 2 (B), без удвоения');
  for (const dev of [a, b, c]) assert.equal(dev.local('shell:stats:flags').played, 15, dev.id);
});

test('почти одновременная игра в разные игры (в пределах 4 с): сохраняются обе, чужая игра ничего не перезапускает', async () => {
  const srv = await server();
  const pc = device(srv, 'pc-device-0001');
  const phone = device(srv, 'phone-device-02');
  await pc.run((sync) => sync.pull());
  await phone.run((sync) => sync.pull());

  const loop = openGame(pc, 'loop');
  const tiles = openGame(phone, '2048', 'stats');
  await pc.run(async () => {
    await loop.start();
    loop.state = { v: 1, level: 7, moves: 3 };
    await loop.save();
  });
  await phone.run(async () => {
    await tiles.start();
    tiles.state = { 4: { played: 1, bestTile: 256, wins: 0 } };
    await tiles.save();
  });
  // оба отправили, не видя друг друга: у телефона отметка обмена старая
  await pc.run((sync) => sync.push());
  await phone.run((sync) => sync.push());
  await pc.run((sync) => sync.refresh());

  const state = await srv.state();
  assert.equal(state['game:loop:current'].level, 7);
  assert.equal(state['game:2048:stats'][4].bestTile, 256);
  assert.equal(pc.local('game:2048:stats')[4].bestTile, 256, 'ПК получил 2048 с телефона');
  assert.equal(phone.local('game:loop:current').level, 7, 'телефон получил «Петлю» с ПК');
  assert.equal(pc.restarts + phone.restarts, 0, 'открытые игры не перезапускались — пришло не про них');
});

test('«Петля»: ПК на 60-м, телефон застрял на 35-м и ходит — уровень не опускается, телефон перезапускается на 60-м', async () => {
  const srv = await server();
  const pc = device(srv, 'pc-device-0001');
  const phone = device(srv, 'phone-device-02');
  pc.put('game:loop:current', { v: 1, level: 35, moves: 0 });
  await pc.run((sync) => sync.pull());
  await phone.run((sync) => sync.pull());
  const onPhone = openGame(phone, 'loop');
  await phone.run(() => onPhone.start());
  assert.equal(onPhone.state.level, 35);

  // ПК проходит уровни до 60-го
  const onPc = openGame(pc, 'loop');
  await pc.run(async (sync) => {
    await onPc.start();
    for (let level = 36; level <= 60; level += 1) {
      onPc.state = { v: 1, level, moves: 0 };
      await onPc.save();
    }
    await sync.push();
  });
  srv.levels.length = 0;
  // телефон, не зная об этом, делает ход на 35-м (и сохраняет это из памяти)
  await phone.run(async (sync) => {
    onPhone.state = { ...onPhone.state, moves: onPhone.state.moves + 1 };
    await onPhone.save();
    await sync.push();
  });
  assert.equal(phone.restarts, 1, 'открытая «Петля» на телефоне перезапущена');
  assert.equal(onPhone.state.level, 60, 'уже на 60-м');
  assert.equal(phone.local('game:loop:current').level, 60, 'сохранение старой игры при перезапуске отброшено');
  // дальше телефон играет от 60-го
  await phone.run(async (sync) => {
    onPhone.state = { v: 1, level: 61, moves: 0 };
    await onPhone.save();
    await sync.push();
  });
  assert.ok(srv.levels.every((l) => l >= 60), `на сервере не было уровня ниже 60: ${srv.levels}`);
  assert.equal((await srv.state())['game:loop:current'].level, 61);
});

test('ответ не дошёл: повтор отправки не перебивает то, что позже записало другое устройство', async () => {
  const srv = await server();
  const a = device(srv, 'device-aaaa-01');
  const b = device(srv, 'device-bbbb-02');
  await a.run((sync) => sync.pull());
  await b.run((sync) => sync.pull());
  await a.run(async (sync) => {
    await createStorage('game:2048').set('settings', { size: 4, skin: 'neon' });
    a.dropReply = true;                                    // сервер принял, ответ потерялся
    await sync.push();
  });
  await b.run(async (sync) => {
    await sync.refresh();
    await createStorage('game:2048').set('settings', { size: 5, skin: 'candy' });
    await sync.push();
  });
  await a.run(async (sync) => {
    await createStorage('game:2048').set('sound', false); // что-то ещё изменилось — отправка повторится
    await sync.push();
  });
  assert.equal((await srv.state())['game:2048:settings'].skin, 'candy', 'повтор старого «neon» не перебил');
  assert.equal(a.local('game:2048:settings').skin, 'candy', 'A взял записанное позже');
});

test('нет связи при возврате: игра не перезапускается, изменения ждут и уходят, когда связь есть', async () => {
  const srv = await server();
  const a = device(srv, 'device-aaaa-01');
  const b = device(srv, 'device-bbbb-02');
  await a.run((sync) => sync.pull());
  await b.run((sync) => sync.pull());
  const game = openGame(a, 'loop');
  await a.run(async (sync) => {
    await game.start();
    a.down = true;
    game.state = { v: 1, level: 3, moves: 1 };
    await game.save();
    await sync.refresh();                                  // вернулись в приложение — сервера нет
    await sync.refresh();
  });
  assert.equal(a.restarts, 0);
  assert.equal(a.freshCalls, 0, 'ничего не применялось');
  assert.equal(a.local('game:loop:current').level, 3, 'своё на месте');
  a.down = false;
  await a.run((sync) => sync.refresh());                   // связь есть — неотправленное ушло
  assert.equal((await srv.state())['game:loop:current'].level, 3);
  assert.equal(a.restarts, 0, 'итог совпал с игрой — без перезапуска');
});

test('сброс на одном устройстве, потом синхронизируется второе со старыми данными — сброс сохраняется', async () => {
  const srv = await server();
  const a = device(srv, 'device-aaaa-01');
  const b = device(srv, 'device-bbbb-02');
  a.put('game:flags:stats', { games: 10, answers: 100, correct: 70, best: { test: 9, type: 7 }, bestStreak: 12, misses: { fr: 3 } });
  await a.run((sync) => sync.pull());
  await b.run((sync) => sync.pull());
  // B без связи сыграл ещё: счётчики и рекорд выросли
  b.down = true;
  await b.run(async (sync) => {
    const flags = createStorage('game:flags');
    const s = await flags.get('stats');
    await flags.set('stats', { ...s, games: 11, answers: 110, correct: 78, best: { test: 10, type: 7 }, bestStreak: 14 });
    await sync.push();
  });
  // A сбрасывает статистику (явно)
  const empty = { games: 0, answers: 0, correct: 0, best: { test: 0, type: 0 }, bestStreak: 0, misses: {} };
  await a.run(async (sync) => {
    await createStorage('game:flags').reset('stats', empty);
    await sync.push();
  });
  b.down = false;
  await b.run((sync) => sync.push());
  await a.run((sync) => sync.refresh());
  assert.deepEqual((await srv.state())['game:flags:stats'], empty, 'на сервере — сброшенное');
  assert.deepEqual(b.local('game:flags:stats'), empty, 'у B старое не вернулось, он взял сброс');
  assert.deepEqual(a.local('game:flags:stats'), empty);
  // и дальше обычный счёт
  await b.run(async (sync) => {
    await createStorage('game:flags').set('stats', { ...empty, games: 1, answers: 10, correct: 6, best: { test: 6, type: 0 } });
    await sync.push();
  });
  assert.equal((await srv.state())['game:flags:stats'].games, 1);
});

test('Wordle: партия на EN с одного устройства и на RU с другого (оба не видят друг друга) — обе сохраняются', async () => {
  const srv = await server();
  const a = device(srv, 'device-aaaa-01');
  const b = device(srv, 'device-bbbb-02');
  const boards = { en: { secret: 'crane', guesses: [] }, ua: null, ru: { secret: 'пятно', guesses: [] } };
  a.put('game:wordle:boards', boards);
  await a.run((sync) => sync.pull());
  await b.run((sync) => sync.pull());
  await a.run(async () => createStorage('game:wordle').set('boards', { ...boards, en: { secret: 'crane', guesses: ['slate'] } }));
  await b.run(async () => createStorage('game:wordle').set('boards', { ...boards, ru: { secret: 'пятно', guesses: ['кошка'] } }));
  await a.run((sync) => sync.push());
  await b.run((sync) => sync.push());
  await a.run((sync) => sync.refresh());
  const want = { en: { secret: 'crane', guesses: ['slate'] }, ua: null, ru: { secret: 'пятно', guesses: ['кошка'] } };
  assert.deepEqual((await srv.state())['game:wordle:boards'], want);
  assert.deepEqual(a.local('game:wordle:boards'), want);
  assert.deepEqual(b.local('game:wordle:boards'), want);
});
