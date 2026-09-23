// Аккаунт игрока: регистрация, вход, выход и обмен прогрессом с сервером (server/worker.js).
// Токен хранится вне пространства `tggames:` — он не часть прогресса и не уезжает на сервер.
//
// Если адрес сервера не задан (shell/config.js), аккаунтов нет вовсе: игра работает как раньше,
// полностью локально. Так сайт не ломается, пока обработчик не выложен.

import { API_URL } from '../shell/config.js';

const TOKEN_KEY = 'tggames-account';

// Понятные игроку тексты вместо кодов ошибок сервера.
export const ERRORS = {
  name_empty: 'Введи имя',
  name_bad: 'Имя: 3–20 букв, цифр, дефис или подчёркивание',
  name_taken: 'Такое имя уже занято',
  password_short: 'Пароль — не меньше 6 символов',
  password_long: 'Слишком длинный пароль',
  bad_credentials: 'Неверное имя или пароль',
  too_many: 'Слишком много попыток. Попробуй через 15 минут',
  unauthorized: 'Нужно войти заново',
  state_big: 'Прогресс слишком большой для сохранения',
  network: 'Сервер не отвечает. Прогресс сохранён на этом устройстве',
  server: 'Ошибка на сервере. Попробуй позже',
};

export const message = (code) => ERRORS[code] ?? ERRORS.server;

function read() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // приватный режим: аккаунт будет забыт после перезагрузки, играть это не мешает
  }
}

export const account = {
  /** Настроен ли сервер аккаунтов вообще. */
  get enabled() {
    return Boolean(API_URL);
  },

  /** { name, token } вошедшего игрока или null. */
  get current() {
    return read();
  },

  get name() {
    return read()?.name ?? null;
  },

  async request(path, { method = 'GET', payload = null, auth = true } = {}) {
    if (!API_URL) return { ok: false, error: 'server' };
    const headers = {};
    if (payload) headers['Content-Type'] = 'application/json';
    const token = auth ? read()?.token : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(API_URL + path, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
      });
    } catch {
      return { ok: false, error: 'network' };
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      // сервер ответил не JSON — ниже это станет ошибкой по коду ответа
    }
    if (response.status === 401 && auth && token) this.forget();
    if (!response.ok) return { ok: false, error: data.error ?? 'server', status: response.status, data };
    return { ok: true, data };
  },

  async register(name, password, state) {
    const res = await this.request('/register', { method: 'POST', auth: false, payload: { name, password, state } });
    if (res.ok) write({ name: res.data.name, token: res.data.token });
    return res;
  },

  async login(name, password) {
    const res = await this.request('/login', { method: 'POST', auth: false, payload: { name, password } });
    if (res.ok) write({ name: res.data.name, token: res.data.token });
    return res;
  },

  async logout() {
    const res = await this.request('/logout', { method: 'POST' });
    this.forget();
    return res;
  },

  /** Забыть аккаунт на этом устройстве (выход, истёкший токен). */
  forget() {
    write(null);
  },

  fetchState() {
    return this.request('/state');
  },

  saveState(data, base) {
    return this.request('/state', { method: 'PUT', payload: { data, base } });
  },
};
