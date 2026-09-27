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
let me = null;              // { id, tgId, name, username, isAdmin, banned, perks } или null

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

  /** Особые скины этого игрока (shell/perks.js); владельцу сервер отдаёт все. */
  get perks() {
    return Array.isArray(me?.perks) ? me.perks : [];
  },

  async request(path, { method = 'GET', payload = null, keepalive = false } = {}) {
    if (!this.enabled) return { ok: false, error: 'no_init_data' };
    const headers = { Authorization: `tma ${platform.initData}` };
    if (payload) headers['Content-Type'] = 'application/json';

    const send = (alive) => fetch(API_URL + path, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      keepalive: alive,   // отправка при закрытии мини-приложения: браузер доводит запрос до конца
    });
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
        return { ok: false, error: 'network' };
      }
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      // сервер ответил не JSON — ниже это станет ошибкой по коду ответа
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

  saveState(data, base, { keepalive = false } = {}) {
    return this.request('/state', { method: 'PUT', payload: { data, base }, keepalive });
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
