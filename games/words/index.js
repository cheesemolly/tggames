// «Слова из слова» по видео владельца: внизу — буквы длинного слова, касаниями собираешь слово, ✓ — проверить.
// На поле — слоты обычных (частых) слов точками по числу букв; вкладка «Редкие» — найденные редкие слова (тоже идут
// в зачёт). Уровень пройден при 50% (звёзды 50/75/100%); выбор уровня — пройденные и следующий.
// Прогресс и настройки — в api.storage игры.
// Звуки (sounds.js) — в бете у владельца: api.feature('words-sounds'); кнопка в шапке включает и выключает их.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, shake, pop, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createSounds } from './sounds.js';
import {
  normalize, target, stars, passed, share, newProgress, levelState, unlockedMax, isUnlocked, submit, hint,
  isValidProgress,
} from './logic.js';

const SKINS = ['telegram', 'notebook', 'board'];
const T = {
  title: 'Слова из слова',
  sub: (n, w) => `Уровень ${n} · ${w.toUpperCase()}`,
  progress: (found, need) => `Найдено ${found} из ${need}`,
  common: 'Обычные',
  rare: 'Редкие',
  rareInfo: (n, total) => `Найдено ${n} из ${total}. Редкие слова тоже идут в зачёт уровня.`,
  rareEmpty: 'Пока ни одного. Редкие — слова, которые знают не все.',
  levels: 'Уровни',
  levelsTitle: 'Выбор уровня',
  levelsNote: 'Открыты пройденные уровни и следующий за ними',
  hint: 'Подсказка',
  noHints: 'Подсказки закончились — они даются за пройденные уровни',
  nothingToHint: 'Все обычные слова уже найдены',
  results: {
    common: (w) => `+ ${w}`,
    rare: (w) => `Редкое слово: ${w}!`,
    found: 'Это слово уже найдено',
    short: 'Слово — от трёх букв',
    self: 'Это само слово уровня',
    letters: 'Не хватает букв',
    unknown: 'Нет такого слова',
  },
  passed: (n) => `Уровень ${n} пройден!`,
  passedNote: 'Можно искать дальше — за 75% и 100% ещё звёзды',
  next: 'Следующий уровень',
  stay: 'Искать ещё',
  allDone: 'Все 100 уровней пройдены!',
  settings: { open: 'Настройки', title: 'Настройки', skin: 'Оформление', close: 'Закрыть' },
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  skins: { telegram: 'По умолчанию', notebook: 'Тетрадь', board: 'Школьная доска' },
  close: 'Закрыть',
};

const svgIcon = (body, fill = false) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" `
  + (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">')
  + `${body}</svg>`;
const ICONS = {
  levels: svgIcon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  hint: svgIcon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
};

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let levels = null;
let progress = newProgress();
let settings = { skin: 'telegram', sound: true };
let audio = null;                   // { ctx, sounds } — один на всю жизнь страницы (iOS ограничивает число AudioContext)
let picked = [];                    // индексы выбранных букв исходного слова
let tab = 'common';
let modalActive = false;
let modalToken = 0;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// Меню показывает у этой игры не партии, а уровень — он уходит оболочке при каждом сохранении.
const report = () => api?.progress(`Уровень ${progress.current + 1}`);
const save = () => {
  report();
  return api?.storage.set('progress', progress);
};
const cur = () => levels[progress.current];
const st = () => levelState(progress, progress.current);

// ---------- отрисовка ----------

// ---------- звук ----------

const soundFeature = () => Boolean(api?.feature?.('words-sounds'));

/** AudioContext можно завести только из обработчика нажатия — поэтому лениво, при первом звуке. */
function ensureAudio() {
  if (audio) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return audio;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    const ctx = new Ctx({ latencyHint: 'interactive' });
    audio = { ctx, sounds: createSounds(ctx) };
  } catch {
    return null;
  }
  return audio;
}

function sfx(name, opts) {
  if (!soundFeature() || !settings.sound) return;
  try {
    ensureAudio()?.sounds.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function renderSoundBtn() {
  if (!ui?.soundBtn) return;
  ui.soundBtn.innerHTML = settings.sound ? ICONS.soundOn : ICONS.soundOff;
  const label = settings.sound ? T.soundOn : T.soundOff;
  ui.soundBtn.setAttribute('aria-label', label);
  ui.soundBtn.title = label;
  ui.soundBtn.classList.toggle('wd-muted', !settings.sound);
}

function toggleSound() {
  settings.sound = !settings.sound;
  api.storage.set('settings', settings);
  renderSoundBtn();
  pop(ui.soundBtn, { from: 0.8, duration: 220 });
  sfx('click');
}

function renderAll(animateIn = false) {
  const level = cur();
  ui.sub.textContent = T.sub(progress.current + 1, level.word);
  picked = [];
  renderTiles(animateIn);
  renderWord();
  renderSlots(animateIn);
  renderRare();
  renderProgress();
  renderTabs();
}

function renderProgress() {
  const level = cur();
  const found = st().found;
  const need = target(level);
  const s = stars(level, found);
  ui.progress.textContent = T.progress(Math.min(found.length, need), need);
  ui.stars.replaceChildren(...[1, 2, 3].map((k) => el('span', { class: `wd-star${s >= k ? ' wd-star-on' : ''}` }, '★')));
  ui.bar.style.transform = `scaleX(${Math.min(1, share(level, found))})`;
  ui.bar.classList.toggle('wd-bar-passed', passed(level, found));
  ui.hintBadge.textContent = progress.hints;
}

function renderTabs() {
  const level = cur();
  const found = st().found;
  const commonFound = found.filter((w) => level.common.includes(w)).length;
  const rareFound = found.length - commonFound;
  ui.tabCommon.textContent = `${T.common} ${commonFound}/${level.common.length}`;
  ui.tabRare.textContent = `${T.rare} ${rareFound}`;
  ui.tabCommon.setAttribute('aria-selected', String(tab === 'common'));
  ui.tabRare.setAttribute('aria-selected', String(tab === 'rare'));
  ui.slots.hidden = tab !== 'common';
  ui.rare.hidden = tab !== 'rare';
}

/** Слоты обычных слов: по длине, по алфавиту; найденное — словом, остальное — точками (и буквами подсказки). */
function renderSlots(animateIn) {
  const level = cur();
  const { found, hinted } = st();
  const words = [...level.common].sort((a, b) => a.length - b.length || a.localeCompare(b, 'ru'));
  const nodes = words.map((w, k) => {
    const done = found.includes(w);
    const open = hinted[w] ?? 0;
    const slot = el('div', { class: `wd-slot${done ? ' wd-slot-done' : ''}`, 'data-word': w },
      [...w].map((ch, i) => el('span', { class: `wd-cell${done || i < open ? ' wd-cell-open' : ''}` }, done || i < open ? ch : '')));
    if (animateIn && !reducedMotion()) animate(slot, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: Math.min(k * 18, 400), easing: 'ease-out', fill: 'backwards' });
    return slot;
  });
  ui.slots.replaceChildren(...nodes);
}

function renderRare() {
  const level = cur();
  const rare = st().found.filter((w) => !level.common.includes(w));
  ui.rare.replaceChildren(
    el('p', { class: 'wd-note' }, rare.length ? T.rareInfo(rare.length, level.rare.length) : T.rareEmpty),
    el('div', { class: 'wd-rare-list' }, rare.map((w) => el('span', { class: 'wd-rare-word' }, w))),
  );
}

function renderTiles(animateIn) {
  const word = cur().word;
  const tiles = [...word].map((ch, i) => el('button', {
    class: 'wd-tile', 'data-i': i, onmousedown: (e) => e.preventDefault(), onclick: () => pick(i),
  }, ch.toUpperCase()));
  ui.tiles.replaceChildren(...tiles);
  ui.tiles.style.setProperty('--n', word.length);
  if (animateIn && !reducedMotion()) tiles.forEach((t, k) => animate(t, [{ opacity: 0, transform: 'translateY(16px) rotate(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 60 + k * 45, easing: 'ease-out', fill: 'backwards' }));
}

function renderWord() {
  const word = cur().word;
  ui.word.replaceChildren(...picked.map((i) => el('span', { class: 'wd-letter' }, word[i].toUpperCase())));
  ui.word.classList.toggle('wd-word-empty', !picked.length);
  for (const t of ui.tiles.children) t.classList.toggle('wd-tile-used', picked.includes(Number(t.dataset.i)));
  ui.clear.disabled = !picked.length;
  ui.ok.disabled = picked.length < 3;
}

// ---------- ввод ----------

function pick(i) {
  if (modalActive || picked.includes(i)) return;
  picked.push(i);
  sfx('tap', { step: picked.length - 1 });
  api.platform.haptic.selection();
  renderWord();
  const last = ui.word.lastElementChild;
  if (last) pop(last, { from: 0.5, duration: 180 });
}

function backspace() {
  if (!picked.length) return;
  picked.pop();
  sfx('back', { step: picked.length });
  renderWord();
}

function clearWord() {
  picked = [];
  renderWord();
}

/** Стереть по кнопке ✕ или Escape — со звуком (clearWord зовётся и сам, после проверки слова). */
function clearByPlayer() {
  if (picked.length) sfx('clear');
  clearWord();
}

function typeLetter(ch) {
  const word = cur().word;
  const c = normalize(ch);
  if (!c) return;
  const i = [...word].findIndex((x, k) => x === c && !picked.includes(k));
  if (i >= 0) pick(i);
  else {
    sfx('empty');
    shake(ui.word, { distance: 4, duration: 200 });
  }
}

function submitWord() {
  if (modalActive || picked.length < 3) return;
  const word = cur().word;
  const text = picked.map((i) => word[i]).join('');
  const wasPassedIndex = progress.current;
  const res = submit(progress, levels, progress.current, text);
  if (res.result === 'common' || res.result === 'rare') {
    save();
    sfx(res.result, { step: text.length });
    api.platform.haptic.notification('success');
    flyWord(text, res.result);
    clearWord();
    renderProgress();
    renderTabs();
    if (res.result === 'common') {
      renderSlots(false);
      const slot = ui.slots.querySelector(`[data-word="${text}"]`);
      if (slot) {
        tab = 'common';
        renderTabs();
        slot.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
        [...slot.children].forEach((c, k) => animate(c, [{ transform: 'scale(0.3) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: 320, delay: k * 50, easing: 'ease-out', fill: 'backwards' }));
      }
    } else {
      renderRare();
      toast.show(T.results.rare(text), 1600);
      pop(ui.tabRare, { from: 0.7, duration: 360 });
    }
    if (res.newStars) for (const s of ui.stars.querySelectorAll('.wd-star-on')) pop(s, { from: 0.4, duration: 420 });
    if (res.justPassed) later(() => levelPassed(wasPassedIndex), 650);
    return;
  }
  // ошибка
  sfx(res.result === 'found' ? 'found' : 'wrong');
  api.platform.haptic.notification('error');
  toast.show(T.results[res.result], 1300);
  shake(ui.word, { distance: 8, duration: 360 });
  if (res.result === 'found') {
    const slot = ui.slots.querySelector(`[data-word="${normalize(text)}"]`);
    if (slot && tab === 'common') pop(slot, { from: 0.85, duration: 300 });
  }
  later(() => clearWord(), 380);
}

/** Слово «влетает» на поле (или во вкладку редких). */
function flyWord(text, kind) {
  if (reducedMotion()) return;
  const node = el('div', { class: `wd-fly wd-fly-${kind}` }, text.toUpperCase());
  root.append(node);
  const from = ui.word.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  node.style.left = `${from.left - rr.left + from.width / 2}px`;
  node.style.top = `${from.top - rr.top + from.height / 2}px`;
  animate(node, [
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    { transform: 'translate(-50%, -260%) scale(0.7)', opacity: 0 },
  ], { duration: 520, easing: 'ease-in' }).then(() => node.remove());
}

function onHint() {
  if (modalActive) return;
  if (progress.hints <= 0) {
    sfx('empty');
    toast.show(T.noHints, 2200);
    shake(ui.hintBtn, { distance: 4, duration: 300 });
    return;
  }
  const w = hint(progress, levels, progress.current);
  if (!w) {
    toast.show(T.nothingToHint);
    return;
  }
  save();
  sfx('hint');
  api.platform.haptic.impact('light');
  tab = 'common';
  renderSlots(false);
  renderTabs();
  renderProgress();
  const slot = ui.slots.querySelector(`[data-word="${w}"]`);
  if (slot) {
    slot.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const open = [...slot.querySelectorAll('.wd-cell-open')];
    const cell = open[open.length - 1];
    if (cell) pop(cell, { from: 0.3, duration: 420 });
    slot.classList.add('wd-slot-hint');
    later(() => slot.classList.remove('wd-slot-hint'), 1200);
  }
}

// ---------- уровни ----------

function levelPassed(i) {
  if (!ui) return;
  const hasNext = i + 1 < levels.length;
  const s = stars(levels[i], levelState(progress, i).found);
  openModal(el('div', { class: 'wd-card wd-won', role: 'dialog', 'aria-label': T.passed(i + 1) },
    el('div', { class: 'wd-won-stars' }, [1, 2, 3].map((k) => el('span', { class: `wd-star${s >= k ? ' wd-star-on' : ''}` }, '★'))),
    el('h2', {}, hasNext ? T.passed(i + 1) : T.allDone),
    el('p', { class: 'wd-note' }, T.passedNote),
    el('div', { class: 'wd-card-actions' },
      el('button', { class: 'btn btn-secondary', onclick: closeModal }, T.stay),
      hasNext ? el('button', { class: 'btn', onclick: () => { closeModal(); goLevel(i + 1); } }, T.next) : null,
    ),
  ));
  sfx('level');
  for (let k = 0; k < s; k++) later(() => sfx('star', { step: k }), 400 + k * 150);
  for (const [k, star] of [...ui.modal.querySelectorAll('.wd-won-stars .wd-star')].entries()) {
    animate(star, [{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1.3) rotate(8deg)', offset: 0.6 }, { transform: 'none' }], { duration: 420, delay: 150 + k * 150, easing: 'ease-out', fill: 'backwards' });
  }
}

function goLevel(i) {
  if (!isUnlocked(progress, levels, i)) return;
  progress.current = i;
  tab = 'common';
  save();
  sfx('click');
  renderAll(true);
}

function showLevels() {
  const max = unlockedMax(progress, levels);
  const cells = levels.map((level, i) => {
    const found = levelState(progress, i).found;
    const s = stars(level, found);
    const open = i <= max;
    return el('button', {
      class: `wd-lvl${open ? '' : ' wd-lvl-locked'}${i === progress.current ? ' wd-lvl-current' : ''}${s ? ' wd-lvl-passed' : ''}`,
      disabled: !open,
      onclick: () => { closeModal(); goLevel(i); },
    }, el('b', {}, open ? String(i + 1) : '🔒'), el('span', { class: 'wd-lvl-stars' }, open && s ? '★'.repeat(s) : ''));
  });
  openModal(el('div', { class: 'wd-card', role: 'dialog', 'aria-label': T.levelsTitle },
    el('div', { class: 'wd-card-head' },
      el('h2', {}, T.levelsTitle),
      el('button', { class: 'wd-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    el('p', { class: 'wd-note' }, T.levelsNote),
    el('div', { class: 'wd-levels' }, cells),
  ));
  ui.modal.querySelector('.wd-lvl-current')?.scrollIntoView({ block: 'center' });
}

function showSettings() {
  const buttons = SKINS.map((id) => el('button', {
    class: 'wd-skin', role: 'radio', 'aria-checked': String(id === settings.skin),
    onclick: () => {
      settings.skin = id;
      host.dataset.skin = id;
      api.storage.set('settings', settings);
      buttons.forEach((b, k) => b.setAttribute('aria-checked', String(SKINS[k] === id)));
    },
  }, el('span', { class: 'wd-swatch', 'data-skin': id }), T.skins[id]));
  openModal(el('div', { class: 'wd-card', role: 'dialog', 'aria-label': T.settings.title },
    el('div', { class: 'wd-card-head' },
      el('h2', {}, T.settings.title),
      el('button', { class: 'wd-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    el('h3', { class: 'wd-section' }, T.settings.skin),
    el('div', { class: 'wd-skins', role: 'radiogroup' }, buttons),
  ));
}

// ---------- окна ----------

function openModal(content) {
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

function iconButton(icon, label, onclick) {
  const button = el('button', { class: 'wd-icon-btn', 'aria-label': label, title: label, onclick });
  button.innerHTML = icon;
  return button;
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (modalActive) closeModal();
    else clearByPlayer();
    return;
  }
  if (modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') submitWord();
  else if (e.key === 'Backspace') backspace();
  else if (/^[а-яё]$/i.test(e.key)) typeLetter(e.key);
  else return;
  e.preventDefault();
}

export default {
  id: 'words',
  title: 'Слова из слова',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [savedProgress, savedSettings, data] = await Promise.all([
      api.storage.get('progress'), api.storage.get('settings'),
      levels ?? fetch(new URL('./levels.json', import.meta.url)).then((r) => r.json()),
    ]);
    if (!api) return;
    levels = data;
    progress = isValidProgress(savedProgress, levels) ? savedProgress : newProgress();
    settings = {
      skin: SKINS.includes(savedSettings?.skin) ? savedSettings.skin : 'telegram',
      sound: savedSettings?.sound !== false,
    };
    host.dataset.skin = settings.skin;
    report();                      // уровень в меню — сразу, не дожидаясь первого слова

    ui = {
      sub: el('div', { class: 'wd-sub' }),
      progress: el('span', { class: 'wd-progress' }),
      stars: el('span', { class: 'wd-stars' }),
      bar: el('div', { class: 'wd-bar-fill' }),
      tabCommon: el('button', { class: 'wd-tab', role: 'tab', onclick: () => { if (tab !== 'common') sfx('click'); tab = 'common'; renderTabs(); } }),
      tabRare: el('button', { class: 'wd-tab', role: 'tab', onclick: () => { if (tab !== 'rare') sfx('click'); tab = 'rare'; renderTabs(); } }),
      slots: el('div', { class: 'wd-slots' }),
      rare: el('div', { class: 'wd-rare', hidden: true }),
      word: el('div', { class: 'wd-word', onclick: backspace }),
      tiles: el('div', { class: 'wd-tiles' }),
      hintBadge: el('span', { class: 'wd-badge' }),
      modal: el('div', { class: 'wd-modal', hidden: true }),
    };
    ui.clear = el('button', { class: 'wd-action wd-clear', 'aria-label': 'Стереть', onmousedown: (e) => e.preventDefault(), onclick: clearByPlayer }, '✕');
    ui.ok = el('button', { class: 'wd-action wd-ok', 'aria-label': 'Проверить', onmousedown: (e) => e.preventDefault(), onclick: submitWord }, '✓');
    ui.hintBtn = el('button', { class: 'wd-action wd-hint', 'aria-label': T.hint, title: T.hint, onmousedown: (e) => e.preventDefault(), onclick: onHint }, el('span', { class: 'wd-hint-icon' }), ui.hintBadge);
    ui.hintBtn.firstChild.innerHTML = ICONS.hint;
    ui.soundBtn = soundFeature() ? iconButton(ICONS.soundOn, T.soundOn, toggleSound) : null;

    root = el('div', { class: 'wd' },
      el('div', { class: 'wd-header' },
        el('div', { class: 'wd-head-text' }, el('div', { class: 'wd-title' }, T.title), ui.sub),
        el('div', { class: 'wd-actions' },
          ui.soundBtn,
          iconButton(ICONS.levels, T.levels, showLevels),
          iconButton(ICONS.gear, T.settings.open, showSettings),
        ),
      ),
      el('div', { class: 'wd-info' }, ui.progress, ui.stars),
      el('div', { class: 'wd-bar' }, ui.bar),
      el('div', { class: 'wd-tabs', role: 'tablist' }, ui.tabCommon, ui.tabRare),
      el('div', { class: 'wd-field' }, ui.slots, ui.rare),
      el('div', { class: 'wd-compose' }, ui.hintBtn, ui.word, ui.clear, ui.ok),
      ui.tiles,
      ui.modal,
      toast.el,
    );
    container.append(root);
    document.addEventListener('keydown', onKeydown);
    renderSoundBtn();
    renderAll(true);
  },

  getState() {
    save();
    return progress.passedCount || Object.keys(progress.levels).length ? { level: progress.current + 1 } : null;
  },

  destroy() {
    save();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    document.removeEventListener('keydown', onKeydown);
    toast?.dispose();
    root?.remove();
    api = host = root = ui = toast = null;
    picked = [];
    tab = 'common';
    modalActive = false;
  },
};
