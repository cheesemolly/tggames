// «Флаги»: угадай страну по флагу. Режим «Тест» — четыре варианта; режим «Ввод» — своя русская клавиатура (не
// системная), под полем — автодополнение (напишешь «Р» — Россия, Руанда, Румыния…). Длина: 10, 20 или марафон
// (все флаги региона, до трёх ошибок); регион — весь мир или часть света. Партия, статистика и выбор — в
// api.storage игры.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  MODES, LENGTHS, REGIONS, MARATHON_LIVES, WIN_SHARE, findCountry, suggest, newGame, answer, next, isOver, current,
  asked, isValidState, emptyStats, recordGame, isValidStats, regionPool,
} from './logic.js';

const T = {
  title: 'Флаги',
  sub: (s) => `${T.regions[s.region]} · ${T.modes[s.mode]}`,
  progress: (s) => (s.lives !== null ? `Флаг ${s.index + 1} из ${s.queue.length}` : `Флаг ${s.index + 1} из ${s.queue.length}`),
  modes: { test: 'Тест', type: 'Ввод' },
  modeHint: { test: 'Четыре варианта ответа', type: 'Напиши название, подскажет список' },
  lengths: { 10: '10 флагов', 20: '20 флагов', marathon: 'Марафон' },
  lengthHint: { 10: 'Быстрая игра', 20: 'Подольше', marathon: 'Все флаги, до трёх ошибок' },
  regions: { world: 'Весь мир', europe: 'Европа', asia: 'Азия', africa: 'Африка', americas: 'Америка', oceania: 'Океания' },
  newGame: 'Новая игра',
  mode: 'Как отвечать',
  length: 'Сколько флагов',
  region: 'Где',
  play: 'Играть',
  placeholder: 'Начни писать название…',
  dontKnow: 'Не знаю',
  next: 'Дальше',
  finish: 'Итоги',
  unknown: 'Такой страны нет в списке',
  right: 'Верно!',
  wrong: (name) => `Это ${name}`,
  resultTitle: (s) => `${s.correct} из ${asked(s)}`,
  message: (s) => `${T.regions[s.region]} · ${T.modes[s.mode]}${s.bestStreak > 1 ? ` · лучшая серия ${s.bestStreak}` : ''}`,
  stats: {
    open: 'Статистика', title: 'Статистика', games: 'Игр', accuracy: 'Точность', bestTest: 'Рекорд (тест)',
    bestType: 'Рекорд (ввод)', streak: 'Лучшая серия', hard: 'Трудные флаги', none: 'Пока нет', close: 'Закрыть',
  },
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>', true),
};
// своя русская клавиатура (ё — через е: ввод сравнивается без различия ё/е)
const KEYS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];

let api = null;
let root = null;
let ui = null;
let toast = null;
let countries = null;
let byCode = null;
let game = null;
let stats = emptyStats();
let setup = { mode: 'test', length: 10, region: 'world' };
let typed = '';
let busy = false;
let modalActive = false;
let modalToken = 0;
let soundOn = true;
// звуки (в бете: api.feature('flags-sounds')) — один AudioContext на страницу, заводится при первом звуке
const audio = createAudio(createSounds);

const soundFeature = () => Boolean(api?.feature?.('flags-sounds'));

function sfx(name, opts) {
  if (!soundFeature() || !soundOn) return;
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
  const label = soundOn ? 'Выключить звук' : 'Включить звук';
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('fl-muted', !soundOn);
}

function toggleSound() {
  soundOn = !soundOn;
  api.storage.set('sound', soundOn);
  renderSoundBtn();
  sfx('click');
}
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const flagUrl = (code) => new URL(`./flags/${code}.svg`, import.meta.url).href;
const save = () => game && api?.storage.set('current', game);

// ---------- вопрос ----------

function renderQuestion(animateIn) {
  const code = current(game);
  ui.flag.src = flagUrl(code);
  ui.flag.alt = '';
  ui.sub.textContent = T.sub(game);
  ui.progress.textContent = T.progress(game);
  ui.score.textContent = game.correct;
  ui.lives.hidden = game.lives === null;
  ui.lives.textContent = game.lives !== null ? '❤'.repeat(Math.max(0, game.lives)) + '♡'.repeat(MARATHON_LIVES - Math.max(0, game.lives)) : '';
  ui.bar.style.transform = `scaleX(${game.index / game.queue.length})`;
  ui.verdict.textContent = '';
  ui.verdict.className = 'fl-verdict';
  ui.answerArea.dataset.mode = game.mode;
  // предзагрузка следующего флага
  if (game.queue[game.index + 1]) new Image().src = flagUrl(game.queue[game.index + 1]);
  if (game.mode === 'test') renderChoices();
  else {
    typed = '';
    renderTyped();
  }
  ui.nextBtn.hidden = true;
  if (animateIn && !reducedMotion()) {
    animate(ui.card, [{ opacity: 0, transform: 'translateX(40px) rotate(3deg)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}

function renderChoices() {
  const buttons = game.choices.map((code) => el('button', {
    class: 'fl-choice', 'data-code': code,
    onclick: () => choose(code),
  }, byCode.get(code).name));
  ui.choices.replaceChildren(...buttons);
  buttons.forEach((b, k) => animate(b, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: 60 + k * 50, easing: 'ease-out', fill: 'backwards' }));
}

// ---------- ввод ----------

function renderTyped() {
  ui.field.textContent = typed;
  ui.field.classList.toggle('fl-field-empty', !typed);
  const list = typed ? suggest(countries, typed, 6) : [];
  ui.suggest.replaceChildren(...list.map((c) => el('button', {
    class: 'fl-suggestion',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => choose(c.code),
  }, c.name)));                                          // без флажков — иначе ответ можно «сличить»
}

function typeKey(ch) {
  if (busy || game.answered) return;
  if (ch === '⌫') typed = typed.slice(0, -1);
  else if (typed.length < 40) typed += ch;
  sfx('key');
  api.platform.haptic.selection();
  renderTyped();
}

function submitTyped() {
  if (busy || game.answered || !typed.trim()) return;
  const c = findCountry(countries, typed);
  if (!c) {
    // точного совпадения нет — если в подсказках ровно одна страна, берём её
    const list = suggest(countries, typed, 2);
    if (list.length === 1) {
      choose(list[0].code);
      return;
    }
    toast.show(T.unknown);
    sfx('unknown');
    shake(ui.fieldWrap, { distance: 5, duration: 300 });
    api.platform.haptic.notification('warning');
    return;
  }
  choose(c.code);
}

// ---------- ответ ----------

function choose(code) {
  if (busy || !game || game.answered) return;
  answer(game, code);
  save();
  showAnswered(true);
}

/** Показать итог ответа на текущий флаг (и после восстановления партии). */
function showAnswered(fresh) {
  const res = game.answered;
  const { code } = res;
  const right = byCode.get(current(game));
  ui.score.textContent = game.correct;
  if (game.lives !== null) ui.lives.textContent = '❤'.repeat(Math.max(0, game.lives)) + '♡'.repeat(MARATHON_LIVES - Math.max(0, game.lives));
  if (res.ok) {
    ui.verdict.textContent = `✅ ${T.right} ${right.name}`;
    ui.verdict.className = 'fl-verdict fl-ok';
    if (fresh) {
      sfx('right', { step: game.streak });
      api.platform.haptic.notification('success');
      pop(ui.card, { from: 0.9, duration: 320 });
    }
  } else {
    ui.verdict.textContent = `❌ ${T.wrong(right.name)}`;
    ui.verdict.className = 'fl-verdict fl-bad';
    if (fresh) {
      sfx('wrong');
      api.platform.haptic.notification('error');
      shake(ui.card, { distance: 8, duration: 380 });
    }
  }
  pop(ui.verdict, { from: 0.8, duration: 260 });
  if (game.mode === 'test') {
    for (const b of ui.choices.children) {
      b.disabled = true;
      if (b.dataset.code === right.code) b.classList.add('fl-right');
      else if (b.dataset.code === code) b.classList.add('fl-wrong');
    }
  } else {
    ui.suggest.replaceChildren();
    ui.field.textContent = code ? byCode.get(code)?.name ?? typed : typed;
    ui.fieldWrap.classList.add(res.ok ? 'fl-field-ok' : 'fl-field-bad');
  }
  const over = isOver(game);
  ui.nextBtn.textContent = over ? T.finish : T.next;
  ui.nextBtn.hidden = false;
  pop(ui.nextBtn, { from: 0.9, duration: 220 });
  // верный ответ — дальше сам через секунду; неверный — ждём «Дальше», чтобы успеть запомнить
  if (fresh && res.ok && !over) later(() => goNext(), reducedMotion() ? 300 : 1000);
}

function goNext() {
  if (!game?.answered || busy) return;
  if (isOver(game)) {
    finishGame();
    return;
  }
  busy = true;
  sfx('next');
  ui.fieldWrap.classList.remove('fl-field-ok', 'fl-field-bad');
  const out = reducedMotion() ? Promise.resolve() : animate(ui.card, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-40px) rotate(-3deg)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
  out.then(() => {
    if (!ui) return;
    ui.card.getAnimations().forEach((a) => a.cancel());
    next(game, countries);
    save();
    busy = false;
    renderQuestion(true);
  });
}

function finishGame() {
  busy = true;
  stats = recordGame(stats, game);
  api.storage.set('stats', stats);
  api.storage.remove('current');
  const total = asked(game);
  const outcome = total && game.correct / total >= WIN_SHARE ? 'win' : 'lose';
  const s = game;
  game = null;
  sfx(outcome);
  api.finish({ outcome, score: s.correct, title: T.resultTitle(s), message: T.message(s), variant: s.mode, locale: 'ru' });
}

// ---------- окна ----------

function openModal(content) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
}

function radioGroup(ids, get, set, label, hint, cls = 'fl-option') {
  const buttons = ids.map((id) => el('button', {
    class: cls, role: 'radio', 'aria-checked': String(get() === id),
    onclick: () => {
      set(id);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(ids[k] === id)));
    },
  }, el('b', {}, label(id)), hint ? el('span', {}, hint(id)) : null));
  return buttons;
}

function showSetup(closable) {
  const content = el('div', { class: 'fl-card-modal', role: 'dialog', 'aria-label': T.newGame },
    el('div', { class: 'fl-card-head' },
      el('h2', {}, T.newGame),
      closable ? el('button', { class: 'fl-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕') : null,
    ),
    el('h3', { class: 'fl-section' }, T.mode),
    el('div', { class: 'fl-options', role: 'radiogroup' },
      radioGroup(MODES, () => setup.mode, (v) => { setup.mode = v; }, (id) => T.modes[id], (id) => T.modeHint[id])),
    el('h3', { class: 'fl-section' }, T.length),
    el('div', { class: 'fl-options', role: 'radiogroup' },
      radioGroup(LENGTHS, () => setup.length, (v) => { setup.length = v; }, (id) => T.lengths[id], (id) => T.lengthHint[id])),
    el('h3', { class: 'fl-section' }, T.region),
    el('div', { class: 'fl-regions', role: 'radiogroup' },
      radioGroup(REGIONS, () => setup.region, (v) => { setup.region = v; }, (id) => T.regions[id], (id) => `${regionPool(countries, id).length}`, 'fl-region')),
    el('button', { class: 'btn fl-play', onclick: () => { closeModal(); startGame(); } }, T.play),
  );
  openModal(content);
}

function startGame() {
  api.storage.set('setup', setup);
  game = newGame(countries, setup);
  busy = false;
  save();
  renderQuestion(true);
}

function showStats() {
  const acc = stats.answers ? `${Math.round((stats.correct / stats.answers) * 100)}%` : '—';
  const item = (value, label) => el('div', { class: 'fl-stat' }, el('div', { class: 'fl-stat-value' }, value), el('div', { class: 'fl-stat-label' }, label));
  const hard = Object.entries(stats.misses).sort((a, b) => b[1] - a[1]).slice(0, 8).filter(([code]) => byCode.has(code));
  openModal(el('div', { class: 'fl-card-modal', role: 'dialog', 'aria-label': T.stats.title },
    el('div', { class: 'fl-card-head' },
      el('h2', {}, T.stats.title),
      el('button', { class: 'fl-icon-btn', 'aria-label': T.stats.close, title: T.stats.close, onclick: closeModal }, '✕'),
    ),
    el('div', { class: 'fl-stats-grid' },
      item(stats.games, T.stats.games), item(acc, T.stats.accuracy),
      item(stats.best.test ?? 0, T.stats.bestTest), item(stats.best.type ?? 0, T.stats.bestType),
    ),
    el('h3', { class: 'fl-section' }, T.stats.hard),
    hard.length
      ? el('div', { class: 'fl-hard' }, hard.map(([code, n]) => el('div', { class: 'fl-hard-item' },
        el('img', { src: flagUrl(code), alt: '' }), el('span', {}, byCode.get(code).name), el('b', {}, `×${n}`))))
      : el('p', { class: 'fl-note' }, T.stats.none),
  ));
}

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'fl-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape' && modalActive) {
    closeModal();
    return;
  }
  if (!game || modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (game.answered && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    goNext();
    return;
  }
  if (game.mode === 'test') {
    const n = Number(e.key);
    if (n >= 1 && n <= 4 && game.choices[n - 1]) choose(game.choices[n - 1]);
    return;
  }
  if (e.key === 'Enter') submitTyped();
  else if (e.key === 'Backspace') typeKey('⌫');
  else if (/^[а-яёa-z \-]$/i.test(e.key)) typeKey(e.key.toLowerCase() === 'ё' ? 'е' : e.key.toLowerCase());
  else return;
  e.preventDefault();
}

function buildKeyboard() {
  const key = (label, onclick, cls = '') => el('button', {
    class: `fl-key ${cls}`.trim(), onmousedown: (e) => e.preventDefault(), onclick,
  }, label);
  const rows = KEYS.map((row, k) => el('div', { class: 'fl-krow' },
    [...row].map((ch) => key(ch, () => typeKey(ch))),
    k === 2 ? key('⌫', () => typeKey('⌫'), 'fl-key-wide') : null));
  rows.push(el('div', { class: 'fl-krow' },
    key('-', () => typeKey('-')),
    key('пробел', () => typeKey(' '), 'fl-key-space'),
    key(T.dontKnow, () => { if (!game?.answered) choose(null); }, 'fl-key-wide fl-key-soft'),
    key('⏎', submitTyped, 'fl-key-wide fl-key-enter')));
  return el('div', { class: 'fl-keyboard' }, rows);
}

export default {
  id: 'flags',
  title: 'Флаги',

  async init(container, gameApi) {
    api = gameApi;
    toast = createToast();
    const [saved, savedStats, savedSetup, list, savedSound] = await Promise.all([
      api.storage.get('current'), api.storage.get('stats'), api.storage.get('setup'),
      countries ?? fetch(new URL('./countries.json', import.meta.url)).then((r) => r.json()),
      api.storage.get('sound'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    countries = list;
    byCode = new Map(countries.map((c) => [c.code, c]));
    stats = isValidStats(savedStats) ? savedStats : emptyStats();
    setup = {
      mode: MODES.includes(savedSetup?.mode) ? savedSetup.mode : 'test',
      length: LENGTHS.includes(savedSetup?.length) ? savedSetup.length : 10,
      region: REGIONS.includes(savedSetup?.region) ? savedSetup.region : 'world',
    };

    ui = {
      sub: el('div', { class: 'fl-sub' }),
      progress: el('span', { class: 'fl-progress' }),
      score: el('b', {}),
      lives: el('span', { class: 'fl-lives' }),
      bar: el('div', { class: 'fl-bar-fill' }),
      flag: el('img', { class: 'fl-flag', alt: '', draggable: false }),
      verdict: el('div', { class: 'fl-verdict' }),
      choices: el('div', { class: 'fl-choices' }),
      field: el('div', { class: 'fl-field' }),
      suggest: el('div', { class: 'fl-suggest' }),
      modal: el('div', { class: 'fl-modal', hidden: true }),
    };
    ui.card = el('div', { class: 'fl-card' }, ui.flag);
    ui.soundBtn = soundFeature() ? iconButton(ICONS.soundOn, 'Выключить звук', toggleSound) : null;
    ui.fieldWrap = el('div', { class: 'fl-field-wrap' }, ui.field);
    ui.field.dataset.placeholder = T.placeholder;
    ui.nextBtn = el('button', { class: 'btn fl-next', hidden: true, onclick: goNext }, T.next);
    ui.typeArea = el('div', { class: 'fl-type' }, ui.fieldWrap, ui.suggest, buildKeyboard());
    ui.answerArea = el('div', { class: 'fl-answer' }, ui.choices, ui.typeArea);

    root = el('div', { class: 'fl' },
      el('div', { class: 'fl-header' },
        el('div', {}, el('div', { class: 'fl-title' }, T.title), ui.sub),
        el('div', { class: 'fl-actions' },
          ui.soundBtn,
          iconButton(ICONS.restart, T.newGame, () => showSetup(true)),
          iconButton(ICONS.stats, T.stats.open, showStats),
        ),
      ),
      el('div', { class: 'fl-info' }, ui.progress, ui.lives, el('span', {}, '✓ ', ui.score)),
      el('div', { class: 'fl-bar' }, ui.bar),
      el('div', { class: 'fl-stage' }, ui.card, ui.verdict),
      ui.nextBtn,
      ui.answerArea,
      ui.modal,
      toast.el,
    );
    container.append(root);
    renderSoundBtn();
    document.addEventListener('keydown', onKeydown);

    if (isValidState(saved, countries)) {
      game = saved;
      renderQuestion(false);
      if (game.answered) showAnswered(false);             // ответ уже дан — показать итог и «Дальше»
    } else {
      game = newGame(countries, setup);
      renderQuestion(false);
      showSetup(false);
    }
  },

  getState() {
    if (!game || (game.index === 0 && !game.answered)) return null;
    save();
    return { index: game.index };
  },

  destroy() {
    save();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    api = root = ui = toast = game = null;
    typed = '';
    busy = modalActive = false;
  },
};
