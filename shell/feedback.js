// Обратная связь (в бете: feedback) — окно из главного меню: игрок пишет идею, ошибку или пожелание, отзыв уходит
// на сервер (POST /report) и сразу приходит владельцу в личку от бота. То же самое делает команда бота /report.
// Окно прижато к верху экрана: иначе экранная клавиатура закрыла бы поле (правило раздела 4 про клавиатуру).
// Вне Telegram аккаунта нет — окно подсказывает написать боту /report.

import { el } from '../shared/dom.js';
import { showLayer, hideLayer, shake } from '../shared/motion.js';
import { message } from '../platform/errors.js';

const MAX = 1000;

export function openFeedback({ account, toast }) {
  const field = el('textarea', {
    class: 'field feedback-field',
    placeholder: 'Например: добавьте бильярд. Или: в судоку не нажимается кнопка…',
    maxLength: MAX,
  });
  const counter = el('span', { class: 'feedback-count' }, `0 / ${MAX}`);
  field.addEventListener('input', () => { counter.textContent = `${field.value.length} / ${MAX}`; });

  const online = account.enabled && account.current;
  const card = el('div', { class: 'adm-card feedback-card', role: 'dialog', 'aria-label': 'Обратная связь' },
    el('button', { class: 'overlay-close', onclick: close, 'aria-label': 'Закрыть' }, '✕'),
    el('h2', { class: 'overlay-title' }, 'Обратная связь'),
    online
      ? [
        el('p', { class: 'hint' }, 'Идея, ошибка, какую игру добавить — напиши, разработчик прочитает.'),
        field,
        el('div', { class: 'feedback-foot' }, counter),
        el('div', { class: 'adm-actions' },
          el('button', { class: 'btn', onclick: send }, 'Отправить'),
          el('button', { class: 'btn btn-secondary', onclick: close }, 'Отмена'),
        ),
      ]
      : [
        el('p', { class: 'hint' }, 'Здесь отзыв можно отправить, только если игры открыты через бота в Telegram. '
          + 'Или напиши боту: /report и свой текст — например, «/report добавьте бильярд».'),
        el('div', { class: 'adm-actions' }, el('button', { class: 'btn', onclick: close }, 'Понятно')),
      ],
  );
  const layer = el('div', { class: 'overlay overlay-top', onclick: (e) => { if (e.target === layer) close(); } }, card);
  document.body.appendChild(layer);
  showLayer(layer);
  if (online) setTimeout(() => field.focus(), 250);

  function close() {
    field.blur();
    hideLayer(layer).then(() => layer.remove());
  }

  let sending = false;
  async function send() {
    const text = field.value.trim();
    if (!text || sending) {
      if (!text) shake(card);
      return;
    }
    sending = true;
    const res = await account.report(text);
    sending = false;
    if (res.ok) {
      toast.show('Спасибо! Отзыв отправлен 🙌', 2600);
      close();
      return;
    }
    toast.show(res.error === 'too_many' ? 'Много отзывов за час — попробуй чуть позже'
      : res.error === 'too_long' ? `Не длиннее ${MAX} символов`
        : message(res.error), 3000);
  }
}
