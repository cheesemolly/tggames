// Аккаунт игрока: внутри Telegram он появляется сам, без регистраций и паролей.
//
// Мини-приложение получает от Telegram строку initData с подписью; она уходит серверу в заголовке
// `Authorization: tma <initData>`, сервер проверяет подпись токеном бота и узнаёт игрока.
// Вне Telegram (обычный браузер) аккаунтов нет вовсе: игра работает как гостевая, прогресс в браузере.

import { API_URL } from '../shell/config.js';
import { platform } from './telegram.js';
export { ERRORS, message } from './errors.js';

let me = null;              // { id, tgId, name, username, isAdmin, banned } или null

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

  /** Почему не сошлась подпись: сервер перебирает способы подсчёта и говорит, какой подходит. */
  diagnose() {
    return this.request('/debug/initdata');
  },

  fetchState() {
    return this.request('/state');
  },

  saveState(data, base, { keepalive = false } = {}) {
    return this.request('/state', { method: 'PUT', payload: { data, base }, keepalive });
  },

  // ---------- рейтинг (в ответах только имя игрока — без ника и id) ----------

  topSummary() {
    return this.request('/top');
  },

  topGame(game) {
    return this.request(`/top/${encodeURIComponent(game)}`);
  },

  topPlayer(pid) {
    return this.request(`/top/player/${encodeURIComponent(pid)}`);
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
