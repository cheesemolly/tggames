// Заглушка для проверки каркаса: останови таймер как можно ближе к нулю.
// Проверяет: MainButton, очистку таймера в destroy (выйти посреди отсчёта — ничего не должно
// «доиграть» в фоне), getState() = null (партия не сохраняется).

import { el } from '../../shared/dom.js';

const START_MS = 5000;

let api = null;
let root = null;
let display = null;
let timerId = null;
let deadline = 0;

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  api.platform.mainButton.hide();
}

function tick() {
  const left = deadline - performance.now();
  if (left <= 0) {
    display.textContent = '0.00';
    stopTimer();
    api.platform.haptic.notification('error');
    api.finish({ outcome: 'lose', score: 0 });
    return;
  }
  display.textContent = (left / 1000).toFixed(2);
}

function onStop() {
  if (timerId === null) return;
  const left = deadline - performance.now();
  stopTimer();
  if (left <= 0) return tick();
  api.platform.haptic.notification('success');
  api.finish({ outcome: 'win', score: Math.round(START_MS - left) });
}

export default {
  id: '_stub-b',
  title: 'Заглушка B · таймер',

  init(container, gameApi) {
    api = gameApi;
    display = el('div', { class: 'stub-b-display' }, (START_MS / 1000).toFixed(2));
    root = el('div', {},
      el('p', { class: 'hint' }, 'Жми «Стоп» (кнопка внизу) как можно ближе к нулю. Не успел — проигрыш.'),
      display,
    );
    display.style.cssText = 'font-size: 64px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;';
    container.append(root);

    api.platform.mainButton.setText('Стоп');
    api.platform.mainButton.onClick(onStop);
    api.platform.mainButton.show();

    deadline = performance.now() + START_MS;
    timerId = setInterval(tick, 30);
  },

  getState() {
    return null;
  },

  destroy() {
    clearInterval(timerId);
    timerId = null;
    api?.platform.mainButton.offClick(onStop);
    api?.platform.mainButton.hide();
    root?.remove();
    root = display = api = null;
  },
};
