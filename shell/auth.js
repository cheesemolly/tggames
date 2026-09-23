// Экран входа и регистрации. Показывается поверх всего при первом заходе (если сервер аккаунтов
// настроен) и по кнопке из меню. Всегда есть выход «Играть без аккаунта» — заставлять регистрироваться
// ради игры не нужно (решение владельца).
//
// Поле ввода — вверху экрана, шрифт 16px, своя кнопка отправки: правила для экранной клавиатуры
// из CLAUDE.md, иначе на айфоне клавиатура перекрывает форму.

import { el } from '../shared/dom.js';
import { showLayer, hideLayer, shake } from '../shared/motion.js';
import { account, message } from '../platform/account.js';
import { snapshot, hasProgress } from '../platform/storage.js';

const GUEST_KEY = 'tggames-guest';

export const guestChosen = () => {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
};

export function rememberGuest() {
  try {
    localStorage.setItem(GUEST_KEY, '1');
  } catch {
    // приватный режим: спросим ещё раз при следующем заходе
  }
}

export function forgetGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // нечего забывать
  }
}

/**
 * Открывает экран. Возвращает 'account' (вошёл или зарегистрировался), 'guest' (играет без аккаунта)
 * или 'cancel' (закрыл, ничего не выбрав — бывает только когда его открыли из меню).
 */
export function openAuth({ canCancel = false } = {}) {
  return new Promise((resolve) => {
    let mode = 'login';       // 'login' | 'register'
    let busy = false;

    const nameInput = el('input', {
      class: 'auth-input', type: 'text', name: 'username', autocomplete: 'username',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: '20',
      placeholder: 'Имя',
    });
    const passInput = el('input', {
      class: 'auth-input', type: 'password', name: 'password', autocomplete: 'current-password',
      maxlength: '200', placeholder: 'Пароль',
    });

    const error = el('p', { class: 'auth-error', hidden: true });
    const submit = el('button', { class: 'btn auth-submit', type: 'submit' }, 'Войти');
    const tabLogin = el('button', { class: 'auth-tab', type: 'button', 'aria-selected': 'true' }, 'Вход');
    const tabRegister = el('button', { class: 'auth-tab', type: 'button', 'aria-selected': 'false' }, 'Регистрация');
    const note = el('p', { class: 'auth-note' });
    const guestBtn = el('button', { class: 'btn btn-secondary auth-guest', type: 'button' }, 'Играть без аккаунта');

    const form = el('form', { class: 'auth-form', novalidate: '' },
      nameInput, passInput, error, submit);

    const card = el('div', { class: 'auth-card' },
      el('h2', { class: 'auth-title' }, 'Сохранение прогресса'),
      el('p', { class: 'auth-lead' },
        'С аккаунтом прогресс хранится на сервере: открытые уровни и рекорды будут на любом устройстве.'),
      el('div', { class: 'auth-tabs' }, tabLogin, tabRegister),
      form,
      note,
      guestBtn,
    );

    const layer = el('div', { class: 'auth-layer' }, card);
    document.body.appendChild(layer);
    showLayer(layer);

    function setMode(next) {
      mode = next;
      const isLogin = mode === 'login';
      tabLogin.setAttribute('aria-selected', String(isLogin));
      tabRegister.setAttribute('aria-selected', String(!isLogin));
      submit.textContent = isLogin ? 'Войти' : 'Создать аккаунт';
      passInput.autocomplete = isLogin ? 'current-password' : 'new-password';
      note.textContent = isLogin
        ? 'Забытый пароль восстановить нельзя — почты мы не спрашиваем.'
        : (hasProgress()
          ? 'Прогресс, который уже наигран на этом устройстве, перенесётся в аккаунт.'
          : 'Не используй пароль, который у тебя где-то ещё: это просто игры.');
      hideError();
    }

    function showError(text) {
      error.textContent = text;
      error.hidden = false;
      shake(card);
    }

    const hideError = () => { error.hidden = true; };

    function finish(result) {
      hideLayer(layer).then(() => layer.remove());
      resolve(result);
    }

    tabLogin.onclick = () => setMode('login');
    tabRegister.onclick = () => setMode('register');

    guestBtn.onclick = () => {
      rememberGuest();
      finish('guest');
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      const name = nameInput.value.trim();
      const password = passInput.value;
      if (!name) return showError('Введи имя');
      if (!password) return showError('Введи пароль');

      busy = true;
      submit.disabled = true;
      submit.textContent = 'Подождите…';
      const res = mode === 'login'
        ? await account.login(name, password)
        : await account.register(name, password, JSON.stringify(snapshot()));
      busy = false;
      submit.disabled = false;
      setMode(mode);

      if (res.ok) {
        forgetGuest();
        finish('account');
        return;
      }
      showError(message(res.error));
    };

    // Кнопка не должна забирать фокус у поля — иначе на iOS закрывается клавиатура.
    submit.addEventListener('mousedown', (e) => e.preventDefault());

    if (canCancel) {
      const close = el('button', { class: 'auth-close', type: 'button', 'aria-label': 'Закрыть' }, '✕');
      close.onclick = () => finish('cancel');
      card.appendChild(close);
      layer.onclick = (e) => { if (e.target === layer) finish('cancel'); };
    }

    setMode('login');
  });
}
