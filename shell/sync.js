// Синхронизация прогресса с сервером аккаунтов.
//
// Правила простые:
// — играем всегда в локальное хранилище, оно быстрое и работает без сети;
// — после изменений прогресс уезжает на сервер не сразу, а через паузу (SYNC_DELAY) и при уходе
//   со страницы — так один ход не превращается в один запрос;
// — при первом входе прогресс берётся с сервера; если на сервере пусто, а локально что-то есть
//   (играл в браузере до Telegram) — наоборот, локальное уезжает в аккаунт;
// — если с другого устройства сохранили новее, сервер отвечает «конфликт» и присылает свой прогресс:
//   он и побеждает, о чём игроку показывается сообщение;
// — несохранённые на сервере изменения помечаются в localStorage (DIRTY_KEY). Telegram закрывает
//   мини-приложение сразу, и последняя отправка часто не доходит; раньше при следующем запуске серверная
//   (старая) копия затирала локальную — пропадали законченные партии (замечание владельца, 2026-09-25:
//   «проиграл в шашки раз 5, а пишет — ещё не играли»). Теперь, если сервер с прошлого обмена не менялся,
//   при запуске на сервер уезжает локальное.
// — бета 'sync-refresh' (тестер: «на ПК 60-й уровень „Петли“, на телефоне 35-й»): при возврате в приложение
//   прогресс перечитывается (refresh). Если сервер новее — и так же при 409 — свежий прогресс принимается через
//   оболочку (onFresh): открытая игра помечается устаревшей (её сохранения отбрасываются), прогресс ложится в
//   хранилище, игра перезапускается уже с ним, и только ПОСЛЕ этого сдвигается отметка обмена (base). Пока это идёт,
//   на сервер ничего не отправляется (hold). Раньше после 409 base сдвигался сразу, а игра из памяти следующим
//   сохранением отправляла старый уровень уже с новым base — и сервер откатывался. Неотправленные изменения этого
//   устройства в таком случае пока проигрывают серверу (слияние — следующий шаг) — это пишется в консоль.
// — бета 'sync-merge' (слияние по ключам, server/merge.js): сервер не отвергает устаревшее, а сливает. Устройство
//   помнит, какие ключи изменились с последнего обмена (PENDING_KEY), и шлёт только их — вместе со своими счётчиками
//   по устройствам (META_KEY: записи ключей, как их знает сервер). Сервер отвечает итогом: присланными ключами и
//   всем, что с прошлого обмена изменили другие устройства. Итог ложится в хранилище; если он задевает открытую
//   игру (её ключи стали другими) — игра перезапускается через onFresh (поколения, как в sync-refresh), иначе
//   ничего не перезапускается. Без связи изменения копятся и уходят, когда связь есть. Первый обмен устройства
//   по-новому — переход (migrate): прогресс уходит целиком «на момент прошлого обмена», сервер сливает без удвоения.

import { snapshot, restore, onStorageChange, readValue, writeValues } from '../platform/storage.js';
import {
  MERGE_PROTOCOL, absorb, cleanEntry, mergeEntry, sameEntry, same,
} from '../server/merge.js';

export const SYNC_DELAY = 4000;
const BASE_KEY = 'tggames-sync';   // вне пространства `tggames:` — иначе синхронизировался бы сам
const DIRTY_KEY = 'tggames-sync-dirty';   // есть изменения, которых сервер ещё не видел
// Слияние (бета 'sync-merge'). Всё — вне пространства `tggames:`, на сервер как прогресс не уезжает.
const META_KEY = 'tggames-sync-meta';       // { k: { ключ: { t, e, f } } } — записи слияния; есть — устройство перешло
const PENDING_KEY = 'tggames-sync-pending'; // { ключ: s } — изменено, сервер ещё не подтвердил (s — номер отправки, 0 — не слали)
const SEQ_KEY = 'tggames-sync-seq';         // номер последней отправки этого устройства
// Запрос с keepalive браузер доводит до конца и после закрытия страницы, но тело — не больше 64 КБ.
export const KEEPALIVE_LIMIT = 60000;
// возврат в приложение шлёт и visibilitychange, и Telegram 'activated' — перечитываем один раз
export const REFRESH_GAP = 1500;
// Версия синхронизации (server/lib.js SYNC_PROTOCOL): уходит с каждым сохранением при бете 'sync-refresh' — сервер
// принимает сохранения таких игроков только от клиента, который умеет перезапускать устаревшую игру.
export const SYNC_PROTOCOL = 2;

export const isEmpty = (data) => !data || Object.keys(data).length === 0;

/**
 * Что делать при входе в аккаунт: взять серверное или залить локальное.
 * Локальное уезжает только когда на сервере пусто — иначе чужой гостевой прогресс
 * затёр бы то, что игрок наиграл на другом устройстве.
 */
export function pickOnLogin(serverData, localData) {
  if (isEmpty(serverData) && !isEmpty(localData)) return 'local';
  return 'server';
}

/**
 * Что делать при открытии: взять серверное или отправить локальное.
 * Локальное побеждает, только если в нём есть неотправленные изменения, а сервер с нашего
 * последнего обмена (base) не менялся — значит, это мы просто не успели сохранить перед закрытием.
 * Если сервер тоже изменился (играли на другом устройстве) — как раньше, побеждает сервер.
 */
export function pickOnOpen({ serverData, serverUpdatedAt = 0, localData, base = 0, localDirty = false, afterLogin = false }) {
  if (afterLogin && pickOnLogin(serverData, localData) === 'local') return 'local';
  if (localDirty && !isEmpty(localData) && base > 0 && serverUpdatedAt <= base) return 'local';
  return 'server';
}

function readDirty() {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDirty(value) {
  try {
    if (value) localStorage.setItem(DIRTY_KEY, '1');
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    // приватный режим — без отметки, как было раньше
  }
}

function readBase() {
  try {
    return Number(localStorage.getItem(BASE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBase(value) {
  try {
    localStorage.setItem(BASE_KEY, String(value ?? 0));
  } catch {
    // приватный режим — в худшем случае лишний раз словим конфликт
  }
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим
  }
}

const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function readMeta() {
  const meta = readJson(META_KEY);
  return isMap(meta) && isMap(meta.k) ? meta : null;
}

function readPending() {
  const pending = readJson(PENDING_KEY);
  return isMap(pending) ? pending : {};
}

/** Ключ изменён на устройстве: отправить при следующем обмене (0 — эту версию ещё не отправляли). */
function markPending(key) {
  const pending = readPending();
  if (pending[key] === 0) return;
  pending[key] = 0;
  writeJson(PENDING_KEY, pending);
}

function nextSeq() {
  const seq = (Number(readJson(SEQ_KEY)) || 0) + 1;
  writeJson(SEQ_KEY, seq);
  return seq;
}

/** Запись ключа, как её помнит устройство: время на сервере, эпоха, счётчики по устройствам. */
function keepEntry(entry, t) {
  const out = { t: Number.isFinite(entry.t) ? entry.t : t };
  if (entry.e) out.e = entry.e;
  if (entry.f && Object.keys(entry.f).length) out.f = entry.f;
  return out;
}

/**
 * afterRestore — вызывается каждый раз, когда серверный прогресс заменил локальный.
 * Оболочка чистит там устаревшие рекорды (migrateStats): иначе сервер возвращал бы
 * старые значения уже после чистки, и в меню снова появлялось бы «Рекорд: Уровень 640».
 *
 * fresh() — включено ли перечитывание при возврате и приём свежего прогресса через onFresh (бета 'sync-refresh').
 * onFresh(apply) — оболочка: пометить открытую игру устаревшей, вызвать apply() (замена прогресса), перезапустить
 * игру; когда промис выполнен, свежее состояние уже в игре. log — куда писать о перекрытых локальных изменениях.
 */
export function createSync({
  account, onMessage = () => {}, delay = SYNC_DELAY, afterRestore = () => {},
  fresh = () => false, onFresh = (apply) => apply(), log = console, refreshGap = REFRESH_GAP,
  merge = () => false, device = async () => null,
}) {
  let timer = null;
  let applying = false;      // мы сами пишем в хранилище — это не повод слать его обратно
  let pushing = null;        // текущая отправка, чтобы не слать две сразу
  let pulling = null;        // загрузка при входе
  let dirty = false;
  let changes = 0;           // счётчик изменений: отметку DIRTY_KEY снимаем, только если за отправку ничего не менялось
  let hold = false;          // принимаем свежий прогресс — ничего не отправляем, пока игра не перезапустится
  let holdPending = false;   // за это время что-то изменилось — отправить после
  let adopting = null;       // идёт приём свежего прогресса
  let queued = null;         // пока принимали, пришёл ещё новее
  let lastRefresh = 0;
  let refreshing = null;     // перечитывание при возврате: второе, пока идёт первое, не запускаем
  // Прогресс, который точно совпадает с серверным (бета): такой же не отправляем. Иначе каждое сворачивание
  // слало бы всё заново и сдвигало время на сервере — у второго устройства чаще случался бы 409.
  let lastSynced = null;
  const remember = (text) => {
    if (fresh()) lastSynced = text;
  };

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** final — отправка при уходе со страницы: с keepalive, чтобы запрос пережил закрытие. */
  async function push({ final = false } = {}) {
    if (!account.current) return;
    if (merge()) return exchange({ final });
    if (hold) {                          // свежий прогресс ещё не в игре — со старым base не отправляем
      holdPending = true;
      return;
    }
    if (pushing) {                       // уже отправляем — отметим, что нужен ещё заход
      dirty = true;
      return pushing;
    }
    stop();
    dirty = false;
    const sent = changes;
    const data = JSON.stringify(snapshot());
    if (fresh() && data === lastSynced) {           // с прошлого обмена ничего не изменилось
      writeDirty(false);
      return;
    }
    pushing = account.saveState(data, readBase(), {
      keepalive: final && data.length < KEEPALIVE_LIMIT,
      sync: fresh() ? SYNC_PROTOCOL : null,
    })
      .then(async (res) => {
        if (res.ok) {
          writeBase(res.data.updatedAt);
          remember(data);
          if (changes === sent) {
            writeDirty(false);
            writeJson(PENDING_KEY, null);    // на сервере весь прогресс — для слияния отправлять нечего
          }
          return;
        }
        if (res.status === 409 && res.data?.data && fresh()) {
          // На другом устройстве прогресс новее — берём его, перезапустив открытую игру (бета 'sync-refresh').
          await adoptServer(res.data.data, res.data.updatedAt, 'conflict');
          return;
        }
        if (res.status === 409 && res.data?.data) {
          // На другом устройстве прогресс новее — берём его.
          applying = true;
          try {
            restore(JSON.parse(res.data.data));
          } finally {
            applying = false;
          }
          writeBase(res.data.updatedAt);
          writeDirty(false);
          await afterRestore();
          onMessage('Прогресс обновлён с другого устройства');
          return;
        }
        if (res.error === 'network') return;      // сеть моргнула, попробуем со следующим изменением
        if (res.error === 'too_many') {           // сервер пускает сохранения раз в пару секунд — повторим сами
          dirty = true;
          return;
        }
        if (res.error === 'update_required') {    // сервер ждёт новый клиент — этот устарел
          onMessage('Приложение обновилось — закрой игры и открой заново');
          return;
        }
        if (res.error === 'expired' || res.error === 'bad_signature') {
          onMessage('Сессия устарела — перезапусти игру');
          return;
        }
        onMessage(res.error === 'state_big' ? 'Прогресс слишком большой для сохранения' : 'Не удалось сохранить прогресс');
      })
      .finally(() => {
        pushing = null;
        if (dirty) schedule();
      });
    return pushing;
  }

  function schedule() {
    if (!account.current) return;
    if (hold) {
      holdPending = true;
      return;
    }
    stop();
    timer = setTimeout(() => push(), delay);
  }

  /**
   * Принять прогресс с сервера, который новее нашего (409 или перечитывание при возврате). Отметка обмена
   * сдвигается, только когда onFresh вернул управление — свежее уже загружено в игру.
   */
  function adoptServer(text, updatedAt, reason) {
    if (adopting) {                      // уже принимаем — самое свежее примем следом
      if (!queued || updatedAt > queued.updatedAt) queued = { text, updatedAt, reason };
      return adopting;
    }
    adopting = (async () => {
      let data = {};
      try {
        data = JSON.parse(text ?? '{}');
      } catch {
        data = {};
      }
      if (readDirty() || reason === 'conflict') {
        log.warn?.(`синхронизация: на сервере прогресс новее (${reason}) — несохранённые изменения этого устройства`
          + ' перекрыты серверными', { base: readBase(), server: updatedAt });
      }
      hold = true;
      stop();
      let applied = false;
      let changesAfter = changes;
      try {
        await onFresh(async () => {
          applying = true;
          try {
            restore(data);
          } finally {
            applying = false;
          }
          applied = true;
          changesAfter = changes;
          await afterRestore();
          remember(JSON.stringify(snapshot()));
        });
      } catch (err) {
        log.error?.('синхронизация: не удалось перезапустить игру со свежим прогрессом', err);
      } finally {
        if (applied) {
          writeBase(updatedAt);
          // перезапущенная игра уже что-то сохранила (свежее) — это уедет с новым base
          if (changes === changesAfter) writeDirty(false);
          else holdPending = true;
        }
        hold = false;
        adopting = null;
      }
      const next = queued;
      queued = null;
      if (next && next.updatedAt > readBase()) await adoptServer(next.text, next.updatedAt, next.reason);
      if (holdPending) {
        holdPending = false;
        schedule();
      }
    })();
    return adopting;
  }

  /**
   * Вернулись в приложение (бета 'sync-refresh'): перечитать прогресс. Сервер новее нашего обмена — значит, играли
   * на другом устройстве: принимаем. Не новее — ничего не делаем (неотправленное своё уедет как обычно).
   */
  function refresh() {
    if (!account.current || !(fresh() || merge()) || adopting || pulling || refreshing) return Promise.resolve();
    const now = Date.now();
    if (now - lastRefresh < refreshGap) return Promise.resolve();
    lastRefresh = now;
    refreshing = refreshOnce().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function refreshOnce() {
    if (merge()) {
      // нет связи — ничего не трогаем, повтора нет; неотправленное уйдёт, когда получится
      await exchange({ read: true });
      return;
    }
    // своё сохранение может быть в пути: дождёмся, иначе его ответ приняли бы за чужой прогресс
    if (pushing) await pushing;
    const res = await account.fetchState();
    // нет связи, таймаут, сервер недоступен — ничего не трогаем: игра остаётся как есть, повтора в цикле нет;
    // проверим снова при следующем возврате, а несохранённое уйдёт при следующем изменении или сворачивании
    if (!res.ok || pushing || adopting || pulling) return;
    const updatedAt = res.data.updatedAt ?? 0;
    if (updatedAt > readBase()) {
      await adoptServer(res.data.data ?? '{}', updatedAt, 'return');
      return;
    }
    // сервер не новее, а у нас есть неотправленное (например, пока не было связи) — отправляем сейчас
    if (readDirty()) await push();
  }

  /** Забрать прогресс с сервера (после входа или при открытии страницы). */
  function pull(opts) {
    pulling = pullOnce(opts).finally(() => {
      pulling = null;
    });
    return pulling;
  }

  async function pullOnce({ afterLogin = false } = {}) {
    if (!account.current) return;
    if (merge()) {
      await exchange({ read: true, opening: true });
      return;
    }
    const res = await account.fetchState();
    if (!res.ok) {
      if (res.error === 'network') onMessage('Сервер не отвечает, играем на этом устройстве');
      return;
    }
    let serverData = {};
    try {
      serverData = JSON.parse(res.data.data ?? '{}');
    } catch {
      serverData = {};
    }

    const serverUpdatedAt = res.data.updatedAt ?? 0;
    const choice = pickOnOpen({
      serverData, serverUpdatedAt, localData: snapshot(), base: readBase(), localDirty: readDirty(), afterLogin,
    });
    if (choice === 'local') {
      writeBase(serverUpdatedAt);
      await push();
      return;
    }

    applying = true;
    try {
      restore(serverData);
    } finally {
      applying = false;
    }
    writeBase(serverUpdatedAt);
    writeDirty(false);
    await afterRestore();
    remember(JSON.stringify(snapshot()));
  }

  // ---------- слияние по ключам (бета 'sync-merge') ----------

  /**
   * Один обмен с сервером (отправки и чтения не идут параллельно): есть изменённые ключи — отправить их, иначе
   * (read) — прочитать изменившееся с прошлого обмена. Ответ сливается с неотправленным и ложится в хранилище.
   * Устройство ещё не переходило на слияние — сначала переход.
   */
  function exchange({ final = false, read = false, opening = false } = {}) {
    if (pushing) {
      if (!read) dirty = true;             // уже идёт обмен — отправим после
      return pushing;
    }
    stop();
    dirty = false;
    pushing = (async () => {
      const dev = await device();
      if (!readMeta()) {
        await migrate(dev, { opening });
        return;
      }
      const sending = buildPush(dev);
      let res;
      if (sending) {
        const size = JSON.stringify(sending).length;
        res = await account.saveMerged(sending, { keepalive: final && size < KEEPALIVE_LIMIT });
      } else if (read) {
        res = await account.fetchMerged(readBase(), dev);
      } else {
        writeDirty(false);
        return;
      }
      if (res.ok) {
        await takeReply(res.data, dev);
        return;
      }
      failed(res, { sending: Boolean(sending), opening });
    })()
      .catch((err) => log.error?.('синхронизация: обмен не удался', err))
      .finally(() => {
        pushing = null;
        if (dirty) schedule();
      });
    return pushing;
  }

  /** Изменённые ключи → отправка: свои прибавки к счётчикам вписываются в записи (absorb) и запоминаются. */
  function buildPush(dev) {
    const pending = readPending();
    const keys = Object.keys(pending);
    if (!keys.length) return null;
    const meta = readMeta();
    const seq = nextSeq();
    const out = {};
    for (const key of keys) {
      const entry = absorb(key, meta.k[key], readValue(key), dev);
      meta.k[key] = keepEntry(entry, meta.k[key]?.t ?? 0);
      pending[key] ||= seq;
      out[key] = { ...(entry.del ? { del: 1 } : { v: entry.v }), s: pending[key] };
      if (entry.e) out[key].e = entry.e;
      if (entry.f) out[key].f = entry.f;
    }
    writeJson(META_KEY, meta);
    writeJson(PENDING_KEY, pending);
    return { sync: MERGE_PROTOCOL, device: dev, seq, base: readBase(), keys: out };
  }

  function failed(res, { sending, opening }) {
    if (res.error === 'network') {
      if (opening) onMessage('Сервер не отвечает, играем на этом устройстве');
      return;                                  // без связи: изменения ждут, уйдут при следующем обмене
    }
    if (!sending) return;
    if (res.error === 'too_many') {
      dirty = true;
      return;
    }
    if (res.error === 'expired' || res.error === 'bad_signature') {
      onMessage('Сессия устарела — перезапусти игру');
      return;
    }
    onMessage(res.error === 'state_big' ? 'Прогресс слишком большой для сохранения' : 'Не удалось сохранить прогресс');
  }

  /**
   * Первый обмен по-новому. На сервере пусто, а тут есть прогресс (играл гостем) или есть неотправленное с прошлого
   * обмена — прогресс уходит целиком «на момент прошлого обмена» (oldBase), сервер сливает: что менялось на сервере
   * позже — побеждает, счётчики переносятся по максимуму. Иначе просто берём серверное (как раньше при входе).
   */
  async function migrate(dev, { opening }) {
    const res = await account.fetchMerged(0, dev);
    if (!res.ok) {
      if (res.error === 'network' && opening) onMessage('Сервер не отвечает, играем на этом устройстве');
      return;
    }
    const server = isMap(res.data.keys) ? res.data.keys : {};
    const serverHas = Object.values(server).some((entry) => entry && !entry.del);
    const local = snapshot();
    const base = readBase();
    const upload = !isEmpty(local) && (!serverHas || (readDirty() && base > 0));
    if (!upload) {
      await takeReply(res.data, dev, { full: true });
      return;
    }
    const seq = nextSeq();
    const keys = {};
    const pending = {};
    for (const [key, v] of Object.entries(local)) {
      keys[key] = { v };
      pending[key] = seq;
    }
    for (const [key, entry] of Object.entries(server)) {
      if (!(key in local) && !entry?.del) {
        keys[key] = { del: 1 };                  // удалено тут после прошлого обмена (или не было)
        pending[key] = seq;
      }
    }
    writeJson(PENDING_KEY, pending);
    const put = await account.saveMerged({
      sync: MERGE_PROTOCOL, device: dev, seq, base: 0, keys, migrate: { oldBase: serverHas ? base : 0 },
    });
    if (!put.ok) {
      failed(put, { sending: true, opening });
      return;
    }
    await takeReply(put.data, dev, { full: true });
  }

  /**
   * Ответ сервера → хранилище. Ключ, изменённый тут и ещё не подтверждённый, сливается со своим (неотправленное
   * новее всего на сервере); остальные берутся как есть. full — пришёл весь прогресс: чего в нём нет — удаляется.
   * Если итог задевает открытую игру — она перезапускается (onFresh), отметка обмена сдвигается после.
   */
  async function takeReply(reply, dev, { full = false } = {}) {
    const incoming = isMap(reply.keys) ? reply.keys : {};
    const plan = () => {
      const meta = readMeta() ?? { k: {} };
      const next = full ? { k: {} } : { k: { ...meta.k } };
      const pending = readPending();
      const ack = Number(reply.ack) || 0;
      for (const [key, s] of Object.entries(pending)) if (s > 0 && s <= ack) delete pending[key];   // доставлено
      const writes = {};
      for (const [key, raw] of Object.entries(incoming)) {
        const server = cleanEntry(key, raw);
        const local = readValue(key);
        let result = server;
        if (key in pending) {
          const mine = { ...absorb(key, meta.k[key], local, dev), t: Infinity };
          result = mergeEntry(key, server, mine);
          if (sameEntry(result, server)) delete pending[key];     // своё проиграло или уже там — слать нечего
        }
        next.k[key] = keepEntry(result, server.t);
        const value = result.del ? undefined : result.v;
        if (!same(value, local)) writes[key] = value;
      }
      if (full) {
        for (const key of Object.keys(snapshot())) {
          if (key in incoming) continue;
          if (key in pending) {
            if (meta.k[key]) next.k[key] = meta.k[key];
          } else {
            writes[key] = undefined;
          }
        }
      }
      return { next, pending, writes };
    };
    const commit = (p) => {
      applying = true;
      try {
        if (Object.keys(p.writes).length) writeValues(p.writes);
      } finally {
        applying = false;
      }
      writeJson(META_KEY, p.next);
      writeJson(PENDING_KEY, p.pending);
    };

    const preview = plan();
    const touched = Object.keys(preview.writes);
    if (touched.length) {
      await onFresh(async () => {
        commit(plan());                          // заново: между предпросмотром и записью могли что-то сохранить
        await afterRestore();
      }, touched);
    } else {
      commit(preview);
    }
    writeBase(reply.updatedAt ?? 0);
    if (!Object.keys(readPending()).length) writeDirty(false);
    else dirty = true;
  }

  const unsubscribe = onStorageChange((key, sameValue) => {
    if (applying) return;
    // что изменилось — помним на слиянии и пока вход не ответил (после него устройство может оказаться на слиянии)
    if (key && !sameValue && (merge() || !account.current)) markPending(key);
    if (merge() && sameValue) return;
    changes++;
    writeDirty(true);
    schedule();
  });

  // Уход со страницы: последний шанс сохранить. Браузер уже не ждёт ответа, но запрос уходит.
  const onHide = () => {
    if (document.visibilityState === 'hidden') push({ final: true });
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => push({ final: true }));

  return {
    pull,
    push,
    refresh,
    /** Новый аккаунт: считаем, что сервер пуст, и заливаем то, что есть. */
    afterRegister(updatedAt) {
      writeBase(updatedAt ?? 0);
    },
    /**
     * Прогресс этого же игрока только что записан на сервер в обход устройства (владелец правит себя в панели):
     * кладём его и сюда. Иначе устройство держало бы старую копию — игра открылась бы со старыми значениями,
     * а следующее её сохранение затёрло бы правку на сервере (видео владельца, 2026-09-27: подсказки 0 → 999
     * в панели, в «Словах» всё равно 0).
     */
    async adopt(text, updatedAt) {
      if (merge()) {                   // правка в панели — новая эпоха на сервере: просто перечитать
        if (pushing) await pushing;
        await exchange({ read: true });
        return;
      }
      stop();
      applying = true;
      try {
        restore(JSON.parse(text));
      } finally {
        applying = false;
      }
      writeBase(updatedAt);
      writeDirty(false);
      await afterRestore();
      remember(JSON.stringify(snapshot()));
    },
    /** Выход: локальный прогресс остаётся как гостевой, отметка синхронизации сбрасывается. */
    reset() {
      stop();
      writeBase(0);
      writeDirty(false);
      writeJson(META_KEY, null);
      writeJson(PENDING_KEY, null);
    },
    destroy() {
      stop();
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
