// «Угадай число»: загадано число от 1 до 100, 7 попыток, подсказки «больше / меньше».
// Поле ввода стоит вверху экрана — экранная клавиатура его не перекрывает.

import { el } from '../../shared/dom.js';
import { pop, shake } from '../../shared/motion.js';
import {
  MIN, MAX, MAX_ATTEMPTS,
  createGame, parseGuess, makeGuess, compare, getStatus,
  attemptsLeft, knownRange, getScore, isValidState,
} from './logic.js';

const VERDICT_TEXT = {
  higher: (v) => `Больше, чем ${v}`,
  lower: (v) => `Меньше, чем ${v}`,
  correct: (v) => `Да, это ${v}!`,
};
const VERDICT_ARROW = { higher: '↑', lower: '↓', correct: '✓' };

let api = null;
let root = null;
let state = null;
let ui = null;

function render(message, isError = false) {
  const { low, high } = knownRange(state);
  ui.message.textContent = message;
  ui.message.classList.toggle('gn-error', isError);
  ui.info.textContent = `Число от ${low} до ${high} · Попыток: ${attemptsLeft(state)}`;
  ui.history.replaceChildren(...state.guesses.map((g) => {
    const verdict = compare(state.secret, g);
    return el('li', { class: `gn-chip gn-${verdict}` }, `${g} ${VERDICT_ARROW[verdict]}`);
  }));
}

function onSubmit(event) {
  event.preventDefault();
  const parsed = parseGuess(state, ui.input.value);
  if (parsed.error) {
    api.platform.haptic.notification('warning');
    render(parsed.error, true);
    shake(ui.form);
    ui.input.focus();
    ui.input.select();
    return;
  }

  state = makeGuess(state, parsed.value);
  ui.input.value = '';
  const status = getStatus(state);
  render(VERDICT_TEXT[compare(state.secret, parsed.value)](parsed.value));
  pop(ui.history.lastChild);                // новая фишка хода впрыгивает
  pop(ui.message, { from: 0.9, duration: 200 });

  if (status === 'playing') {
    api.platform.haptic.selection();
    ui.input.focus();   // страховка к mousedown-трюку; внутри жеста пользователя iOS это разрешает
    return;
  }

  // Партия окончена: убрать клавиатуру и отдать результат оболочке.
  ui.input.disabled = true;
  ui.submit.disabled = true;
  ui.input.blur();
  const tries = state.guesses.length;
  if (status === 'won') {
    api.platform.haptic.notification('success');
    api.finish({ outcome: 'win', score: getScore(state), message: `Загадано ${state.secret}. Попыток: ${tries}.` });
  } else {
    api.platform.haptic.notification('error');
    api.finish({ outcome: 'lose', message: `Попытки кончились. Было загадано ${state.secret}.` });
  }
}

export default {
  id: 'guess-number',
  title: 'Угадай число',

  init(container, gameApi) {
    api = gameApi;
    state = isValidState(api.savedState) ? api.savedState : createGame();

    ui = {
      input: el('input', {
        class: 'gn-input',
        type: 'text',
        inputMode: 'numeric',       // цифровая клавиатура на телефоне
        pattern: '[0-9]*',
        enterKeyHint: 'go',
        autocomplete: 'off',
        maxLength: 3,
        placeholder: `${MIN}–${MAX}`,
        'aria-label': 'Твоё число',
      }),
      // preventDefault на mousedown: кнопка не забирает фокус у поля — на iOS клавиатура не закрывается.
      submit: el('button', { class: 'btn gn-submit', type: 'submit', onmousedown: (e) => e.preventDefault() }, 'Проверить'),
      message: el('p', { class: 'gn-message', 'aria-live': 'polite' }),
      info: el('p', { class: 'hint gn-info' }),
      history: el('ul', { class: 'gn-history' }),
    };
    // noValidate: pattern нужен iOS для цифровой клавиатуры, но проверку ввода делаем сами.
    ui.form = el('form', { class: 'gn-form', noValidate: true, onsubmit: onSubmit }, ui.input, ui.submit);

    root = el('div', { class: 'gn' },
      el('p', { class: 'hint' }, `Я загадал число от ${MIN} до ${MAX}. У тебя ${MAX_ATTEMPTS} попыток.`),
      ui.form,
      ui.message,
      ui.info,
      ui.history,
    );
    container.append(root);

    const last = state.guesses.at(-1);
    render(last === undefined ? 'Твой вариант?' : VERDICT_TEXT[compare(state.secret, last)](last));
    ui.input.focus({ preventScroll: true });
  },

  getState() {
    return state && state.guesses.length > 0 && getStatus(state) === 'playing' ? state : null;
  },

  destroy() {
    root?.remove();
    api = root = state = ui = null;
  },
};
