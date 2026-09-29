// Аккаунт игрока: внутри Telegram он появляется сам, без регистраций и паролей.
//
// Мини-приложение получает от Telegram строку initData с подписью; она уходит серверу в заголовке
// `Authorization: tma <initData>`, сервер проверяет подпись токеном бота и узнаёт игрока.
// Вне Telegram (обычный браузер) аккаунтов нет вовсе: игра работает как гостевая, прогресс в браузере.

import { API_URL } from '../shell/config.js';
import { platform } from './telegram.js';
export { ERRORS, message } from './errors.js';

let topCache = null;        // { at, promise } — последняя сводка рейтинга
const TOP_CACHE_MS = 30 * 1000;
let me = null;              // { id, tgId, name, username, isAdmin, beta, banned, perks } или null

export const account = {
  /** Аккаунты работают, только если выложен сервер и игра открыта внутри Telegram. */
  get enabled() {
    return Boolean(API_URL) && platform.isTelegram;
  },

  /** Данные игрока после успешного входа. */
  get current() {
    return me;
  },

  get name() {
    return me?.name ?? null;
  },

  get isAdmin() {
    return Boolean(me?.isAdmin);
  },

  /** Видит ли бету: владелец или бета-тестер (отмечается в панели). Панель — только isAdmin. */
  get beta() {
    return Boolean(me?.beta ?? me?.isAdmin);
  },

  /** Особые скины этого игрока (shell/perks.js); владельцу сервер отдаёт все. */
  get perks() {
    return Array.isArray(me?.perks) ? me.perks : [];
  },

  /** Нет связи с сервером после попытки входа (shell/login.js) — меню пишет об этом и даёт «Повторить». */
  offline: false,

  /**
   * Сколько ждать ответа, мс (0 — сколько угодно, как раньше). Зависший запрос (связь «подвисла» посреди ответа)
   * иначе держал бы меню без имени и рейтинга до перезапуска. Задаёт оболочка (бета stable-login).
   */
  timeoutMs: 0,

  // bounded — и отправку при уходе (keepalive) обрывать по таймауту (бета sync-refresh): приложение свернули, а не
  // закрыли — зависшая отправка иначе держала бы все следующие сохранения и перечитывание. Если страницу закрывают,
  // таймер уже не сработает, и браузер доведёт запрос до конца, как раньше.
  async request(path, { method = 'GET', payload = null, keepalive = false, bounded = false } = {}) {
    if (!this.enabled) return { ok: false, error: 'no_init_data' };
    const headers = { Authorization: `tma ${platform.initData}` };
    if (payload) headers['Content-Type'] = 'application/json';

    // отправку при закрытии не обрываем: её и так доводит браузер
    const limit = keepalive && !bounded ? 0 : this.timeoutMs;
    const abort = limit > 0 ? new AbortController() : null;
    const timer = abort && setTimeout(() => abort.abort(), limit);
    const send = (alive) => fetch(API_URL + path, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      keepalive: alive,   // отправка при закрытии мини-приложения: браузер доводит запрос до конца
      signal: abort?.signal,
    });
    // зависший запрос — та же «нет связи» (все, кто проверяет 'network', так его и поймут), с пометкой timeout
    const noNetwork = () => (abort?.signal.aborted ? { ok: false, error: 'network', timeout: true } : { ok: false, error: 'network' });
    let response;
    try {
      response = await send(keepalive);
    } catch {
      // Часть браузеров не пускает keepalive-запрос с предварительной CORS-проверкой (у нас заголовок
      // Authorization) — тогда обычным запросом, как раньше.
      try {
        if (!keepalive) throw new Error('network');
        response = await send(false);
      } catch {
        clearTimeout(timer);
        return noNetwork();
      }
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      // сервер ответил не JSON — ниже это станет ошибкой по коду ответа; тело оборвалось по таймауту — нет связи
      if (abort?.signal.aborted) return noNetwork();
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return { ok: false, error: data.error ?? 'server', status: response.status, data };
    return { ok: true, data };
  },

  /** Вход: подпись проверяет сервер, он же заводит игрока при первом заходе. */
  async signIn() {
    const res = await this.request('/me');
    me = res.ok ? res.data : null;
    return res;
  },

  fetchState() {
    return this.request('/state');
  },

  /** sync — версия синхронизации клиента (shell/sync.js SYNC_PROTOCOL), у тех, кому открыта бета sync-refresh. */
  saveState(data, base, { keepalive = false, sync = null } = {}) {
    return this.request('/state', { method: 'PUT', payload: sync ? { data, base, sync } : { data, base }, keepalive, bounded: Boolean(sync) });
  },

  /**
   * Слияние по ключам (бета 'sync-merge', server/merge.js): что изменилось на сервере позже since (0 — всё)
   * и какую отправку этого устройства сервер уже принял (ack).
   */
  fetchMerged(since, device) {
    const q = new URLSearchParams({ sync: '3', since: String(since || 0), device: String(device ?? '') });
    return this.request(`/state?${q}`);
  },

  /** Отправить изменённые ключи на слияние: payload = { sync: 3, device, seq, base, keys, migrate? }. */
  saveMerged(payload, { keepalive = false } = {}) {
    return this.request('/state', { method: 'PUT', payload, keepalive, bounded: true });
  },

  /** Обратная связь (как /report в боте): отзыв сразу приходит владельцу. */
  report(text) {
    return this.request('/report', { method: 'POST', payload: { text } });
  },

  // ---------- рейтинг (в ответах только имя игрока — без ника и id) ----------

  // сводку просят и меню (подпись «Ты: 4-е место»), и экран рейтинга — полминуты хватает одного запроса
  topSummary() {
    const now = Date.now();
    if (topCache && now - topCache.at < TOP_CACHE_MS) return topCache.promise;
    const promise = this.request('/top');
    topCache = { at: now, promise };
    promise.then((res) => {
      if (!res.ok && topCache?.promise === promise) topCache = null;
    });
    return promise;
  },

  // в адрес — только то, что может быть id игры или pid (иначе «..» в пути уводил бы запрос на другой адрес)
  topGame(game) {
    if (!/^[a-z0-9-]{1,40}$/.test(String(game))) return Promise.resolve({ ok: false, error: 'not_found' });
    return this.request(`/top/${game}`);
  },

  /** Поиск игрока по @нику (только точное совпадение) → { pid }. Ник проверяет и сервер. */
  findPlayer(username) {
    return this.request('/top/find', { method: 'POST', payload: { username } });
  },

  /** Автодополнение поиска: до 10 игроков, чей @ник начинается с q → { players: [{ pid, name, username }] }. */
  suggestPlayers(q) {
    return this.request('/top/suggest', { method: 'POST', payload: { q } });
  },

  topPlayer(pid) {
    if (!/^[a-z0-9]{1,32}$/.test(String(pid))) return Promise.resolve({ ok: false, error: 'no_player' });
    return this.request(`/top/player/${pid}`);
  },

  // ---------- панель владельца ----------

  players(query = '', { limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query) params.set('q', query);
    return this.request(`/admin/players?${params}`);
  },

  player(id) {
    return this.request(`/admin/player/${id}`);
  },

  savePlayerState(id, data) {
    return this.request(`/admin/player/${id}/state`, { method: 'PUT', payload: { data } });
  },

  setPerk(id, perk, on) {
    return this.request(`/admin/player/${id}/perk`, { method: 'POST', payload: { perk, on } });
  },

  /** Сделать игрока бета-тестером (видит бету, панели не получает) или снять. */
  setTester(id, on) {
    return this.request(`/admin/player/${id}/tester`, { method: 'POST', payload: { on } });
  },

  /** Убрать из рейтинга (подделанные очки) или вернуть; прогресс не трогается. */
  hideFromBoard(id, hidden) {
    return this.request(`/admin/player/${id}/board`, { method: 'POST', payload: { hidden } });
  },

  banPlayer(id, banned) {
    return this.request(`/admin/player/${id}/ban`, { method: 'POST', payload: { banned } });
  },

  deletePlayer(id) {
    return this.request(`/admin/player/${id}`, { method: 'DELETE' });
  },

  broadcast(text) {
    return this.request('/admin/broadcast', { method: 'POST', payload: { text } });
  },
};
