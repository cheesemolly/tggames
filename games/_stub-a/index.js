// Заглушка для проверки каркаса: счётчик тапов.
// Проверяет: savedState/getState (выйти и вернуться — счёт на месте), api.finish,
// api.storage (счётчик запусков), подключение game.css, haptic.

import { el } from '../../shared/dom.js';

let api = null;
let root = null;
let taps = 0;

export default {
  id: '_stub-a',
  title: 'Заглушка A · кликер',

  async init(container, gameApi) {
    api = gameApi;
    taps = api.savedState?.taps ?? 0;

    const launches = ((await api.storage.get('launches')) ?? 0) + 1;
    await api.storage.set('launches', launches);

    const counter = el('div', { class: 'stub-a-counter' }, taps);
    const onTap = () => {
      taps += 1;
      counter.textContent = taps;
      api.platform.haptic.impact('light');
    };

    root = el('div', { class: 'stub-a' },
      el('p', { class: 'hint' }, `Запуск №${launches}. Натапай, выйди «Назад» и вернись — счёт должен сохраниться.`),
      counter,
      el('button', { class: 'btn', onclick: onTap }, 'Тап'),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-secondary', onclick: () => api.finish({ outcome: 'win', score: taps }) }, 'Победить'),
        el('button', { class: 'btn btn-secondary', onclick: () => api.finish({ outcome: 'lose', score: taps }) }, 'Проиграть'),
      ),
    );
    container.append(root);
  },

  getState() {
    return taps > 0 ? { taps } : null;
  },

  destroy() {
    root?.remove();
    root = null;
    api = null;
    taps = 0;
  },
};
