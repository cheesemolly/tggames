// Bongo Cat по мотивам bongo.cat: нажимаешь — кот бьёт лапой по инструменту. Инструменты, клавиши и
// «слои» касаний — как у оригинала (A/D, 1…0, Q…P, C, B, F, пробел). Рисунок и звуки свои (art.js,
// sounds.js). Сверх оригинала: разучивание мелодий (нужная клавиша подсвечивается), счётчик ударов.
// Партий нет — getState() возвращает null, в меню «Ударов: N».

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { sceneMarkup, HIT_POINT } from './art.js';
import { createSynth } from './sounds.js';
import {
  INSTRUMENTS, findInstrument, padForCode, SONGS, songKeys, songPhrases, followSong, expectedNote,
  emptyStats, isValidStats, recordHit, progressLine,
} from './logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAW_MIN_MS = 90;               // короткий тап всё равно виден: лапа внизу хотя бы столько

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" `
  + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  songs: svgIcon('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  stats: svgIcon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
};

let api = null;
let host = null;
let ui = null;
let toast = null;
let stats = emptyStats();
let current = 'bongo';           // инструмент, чьи клавиши на экране
let shown = 'bongo';             // инструмент на столе (после «мяу» остаётся прежний)
let audio = null;                // { ctx, synth } — создаётся по первому касанию (иначе браузер не даст звук)
let song = null;                 // { song, pos } — разучивание мелодии
let modalActive = false;
let saveTimer = 0;
const pawDown = { left: 0, right: 0, mouth: 0 };
const pointers = new Map();      // pointerId → { instrument, pad, at }
const keysHeld = new Map();      // code → { instrument, pad, at }
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

// ---------- звук ----------

/** AudioContext можно завести только из обработчика нажатия — поэтому лениво. */
function ensureAudio() {
  if (audio) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return audio;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    // Safari 16.4+: звук и при беззвучном режиме айфона — как у видео, а не как у рингтона
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* не поддерживается — не страшно */ }
  const ctx = new Ctx({ latencyHint: 'interactive' });
  audio = { ctx, synth: createSynth(ctx) };
  return audio;
}

// ---------- сохранение ----------

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 1200);
}

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!api) return;
  api.storage.set('stats', stats);
  api.progress(progressLine(stats));
}

// ---------- сцена ----------

function showInstrument(id) {
  if (findInstrument(id)?.voice) return;           // «мяу» не меняет инструмент на столе
  shown = id;
  for (const node of ui.scene.querySelectorAll('.bc-inst')) node.classList.toggle('on', node.dataset.inst === id);
}

function setPaw(paw, delta) {
  pawDown[paw] = Math.max(0, pawDown[paw] + delta);
  host.classList.toggle(`bc-${paw}-down`, pawDown[paw] > 0);
}

/** Нотка вылетает из места удара. */
function spawnNote(paw) {
  if (reducedMotion()) return;
  const [x, y] = HIT_POINT[paw];
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', x + (Math.random() - 0.5) * 30);
  text.setAttribute('y', y - 10);
  text.setAttribute('class', 'bc-note');
  text.textContent = paw === 'mouth' ? 'мяу' : ['♪', '♫', '♩', '♬'][Math.floor(Math.random() * 4)];
  ui.notes.append(text);
  const dx = (paw === 'left' ? -1 : 1) * (20 + Math.random() * 30);
  animate(text, [
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(${dx * 0.3}px, -20px) scale(1.1)`, opacity: 1, offset: 0.2 },
    { transform: `translate(${dx}px, -70px) scale(1)`, opacity: 0 },
  ], { duration: 900, easing: 'ease-out' }).then(() => text.remove());
}

/** Инструмент отзывается на удар: барабан приседает, тарелка качается, клавиша нажимается. */
function shakeInstrument(instrument, pad) {
  const inst = ui.scene.querySelector(`.bc-inst[data-inst="${instrument}"]`);
  if (!inst) return;
  if (instrument === 'bongo') {
    const drum = inst.querySelector(`.bc-drum[data-pad="${pad.id}"]`);
    if (drum) animate(drum, [{ transform: 'translateY(0)' }, { transform: 'translateY(4px) scaleY(0.985)' }, { transform: 'none' }], { duration: 140 });
  } else if (instrument === 'keyboard' || instrument === 'marimba') {
    inst.querySelector(`.bc-key[data-note="${pad.note}"]`)?.classList.add('down');
  } else {
    const swing = inst.querySelector('.bc-swing');
    if (swing) {
      const k = instrument === 'cymbal' ? 1 : 0.6;
      animate(swing, [
        { transform: 'rotate(0)' }, { transform: `rotate(${4 * k}deg)` }, { transform: `rotate(${-3 * k}deg)` },
        { transform: `rotate(${1.5 * k}deg)` }, { transform: 'rotate(0)' },
      ], { duration: instrument === 'cymbal' ? 700 : 320, easing: 'ease-out' });
    }
  }
}

function releaseKeyVisual(instrument, pad) {
  if (instrument !== 'keyboard' && instrument !== 'marimba') return;
  ui.scene.querySelector(`.bc-inst[data-inst="${instrument}"] .bc-key[data-note="${pad.note}"]`)?.classList.remove('down');
}

// ---------- удар ----------

function press(instrument, pad) {
  const a = ensureAudio();
  a?.synth.play(instrument, pad.note);
  if (instrument !== current) selectInstrument(instrument, { quiet: true });
  showInstrument(instrument);
  setPaw(pad.paw, 1);
  shakeInstrument(instrument, pad);
  spawnNote(pad.paw);
  api.platform.haptic.impact(instrument === 'meow' ? 'soft' : 'light');

  stats = recordHit(stats, instrument);
  ui.sub.textContent = progressLine(stats);
  scheduleSave();

  if (song && (instrument === 'keyboard' || instrument === 'marimba')) advanceSong(pad.note);
  return performance.now();
}

function release(held) {
  const wait = Math.max(0, PAW_MIN_MS - (performance.now() - held.at));
  const up = () => {
    if (!ui) return;
    setPaw(held.pad.paw, -1);
    releaseKeyVisual(held.instrument, held.pad);
  };
  if (wait) later(up, wait);
  else up();
}

function markPad(padEl, on) {
  padEl?.classList.toggle('pressed', on);
}

function onPadDown(e) {
  if (modalActive) return;
  const padEl = e.target.closest('.bc-pad');
  if (!padEl) return;
  e.preventDefault();
  const instrument = findInstrument(padEl.dataset.inst);
  const pad = instrument?.pads.find((p) => p.id === padEl.dataset.pad);
  if (!pad) return;
  try { padEl.setPointerCapture(e.pointerId); } catch { /* синтетические указатели не захватываются */ }
  markPad(padEl, true);
  const at = press(instrument.id, pad);
  pointers.set(e.pointerId, { instrument: instrument.id, pad, at, padEl });
}

function onPadUp(e) {
  const held = pointers.get(e.pointerId);
  if (!held) return;
  pointers.delete(e.pointerId);
  markPad(held.padEl, false);
  release(held);
}

function onKeyDown(e) {
  if (!ui || modalActive || e.ctrlKey || e.metaKey || e.altKey) return;
  const hit = padForCode(e.code);
  if (!hit) return;
  e.preventDefault();
  if (e.repeat || keysHeld.has(e.code)) return;             // зажатая клавиша не «строчит», как и на bongo.cat
  const at = press(hit.instrument, hit.pad);
  const padEl = ui.pads.querySelector(`.bc-pad[data-inst="${hit.instrument}"][data-pad="${hit.pad.id}"]`);
  markPad(padEl, true);
  keysHeld.set(e.code, { ...hit, at, padEl });
}

function onKeyUp(e) {
  const held = keysHeld.get(e.code);
  if (!held) return;
  keysHeld.delete(e.code);
  markPad(held.padEl, false);
  release(held);
}

/** Потеряли фокус с зажатыми клавишами — отпускаем всё, иначе лапа так и останется внизу. */
function releaseAll() {
  for (const held of [...pointers.values(), ...keysHeld.values()]) {
    markPad(held.padEl, false);
    release(held);
  }
  pointers.clear();
  keysHeld.clear();
}

// ---------- клавиши на экране ----------

function renderPads() {
  const instrument = findInstrument(current);
  const pads = instrument.pads;
  const pad = (p, extra = '') => el('button', {
    class: `bc-pad ${extra}`.trim(),
    'data-inst': instrument.id,
    'data-pad': p.id,
    'aria-label': p.name,
  },
    el('span', { class: 'bc-pad-name' }, p.name),
    el('span', { class: 'bc-pad-key' }, p.label),
  );

  let body;
  if (pads.length === 10) {
    // как настоящая клавиатура: 6 белых клавиш, 4 чёрные сверху между ними
    const whites = pads.filter((p) => !p.black);
    const blacks = pads.filter((p) => p.black);
    body = el('div', { class: `bc-piano ${instrument.id === 'marimba' ? 'bc-piano-marimba' : ''}`.trim() },
      el('div', { class: 'bc-piano-whites' }, whites.map((p) => pad(p, 'bc-pad-white'))),
      el('div', { class: 'bc-piano-blacks' }, blacks.map((p) => {
        const before = whites.findIndex((w) => w.note > p.note);
        const node = pad(p, 'bc-pad-black');
        node.style.setProperty('--at', before);
        return node;
      })),
    );
  } else {
    body = el('div', { class: `bc-big bc-big-${pads.length}` }, pads.map((p) => pad(p, `bc-pad-big bc-pad-${instrument.id}`)));
  }
  ui.pads.replaceChildren(body);
  markSongTarget();
}

function renderChips() {
  ui.chips.replaceChildren(...INSTRUMENTS.map((inst) => el('button', {
    class: `bc-chip ${inst.id === current ? 'on' : ''}`.trim(),
    onclick: () => {
      ensureAudio();
      selectInstrument(inst.id);
    },
  }, inst.title)));
}

function selectInstrument(id, { quiet = false } = {}) {
  if (id === current && !quiet) return;
  current = id;
  api.storage.set('instrument', id);
  showInstrument(id);
  renderChips();
  renderPads();
  if (!quiet) {
    api.platform.haptic.selection();
    if (!reducedMotion()) animate(ui.pads, [{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }
  if (song && id !== 'keyboard' && id !== 'marimba') stopSong();
}

// ---------- мелодии ----------

function startSong(s) {
  song = { song: s, pos: 0 };
  if (current !== 'keyboard' && current !== 'marimba') selectInstrument('keyboard');
  renderSongBar();
  markSongTarget();
}

function stopSong() {
  song = null;
  renderSongBar();
  markSongTarget();
}

function advanceSong(note) {
  const res = followSong(song.song, song.pos, note);
  if (!res.hit) {
    if (ui.songBar && !reducedMotion()) animate(ui.songBar, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 200 });
    return;
  }
  song.pos = res.pos;
  if (res.done) {
    stats = { ...stats, songs: (stats.songs ?? 0) + 1 };
    scheduleSave();
    api.platform.haptic.notification('success');
    toast.show(`«${song.song.title}» сыграна! 🎉`, 2400);
    later(() => ui && stopSong(), 600);
  }
  renderSongBar();
  markSongTarget();
}

function renderSongBar() {
  if (!song) {
    ui.songBar.hidden = true;
    return;
  }
  const keys = songKeys(song.song);
  const upcoming = keys.slice(song.pos, song.pos + 10);
  ui.songBar.hidden = false;
  ui.songBar.replaceChildren(
    el('div', { class: 'bc-song-text' },
      el('span', { class: 'bc-song-title' }, song.song.title),
      el('span', { class: 'bc-song-count' }, `${Math.min(song.pos, keys.length)} / ${keys.length}`),
    ),
    el('div', { class: 'bc-song-next' }, upcoming.map((k, i) => el('span', { class: i === 0 ? 'now' : '' }, k))),
    el('button', { class: 'bc-song-close', 'aria-label': 'Закончить разучивание', onclick: stopSong }, '✕'),
  );
}

function markSongTarget() {
  for (const node of ui.pads.querySelectorAll('.bc-pad.next')) node.classList.remove('next');
  if (!song) return;
  const note = expectedNote(song.song, song.pos);
  if (note == null) return;
  ui.pads.querySelector(`.bc-pad[data-pad="n${note}"]`)?.classList.add('next');
}

// ---------- окна ----------

function openModal(content) {
  ui.modal.replaceChildren(el('div', { class: 'bc-card' }, content));
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  releaseAll();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  hideLayer(ui.modal, () => !modalActive);
}

function openSongs() {
  openModal([
    el('h2', {}, 'Мелодии'),
    el('p', { class: 'bc-muted' }, 'Номера — клавиши пианино (на маримбе те же ноты). Выбери мелодию — нужная клавиша будет подсвечиваться.'),
    el('div', { class: 'bc-songs' }, SONGS.map((s) => el('button', {
      class: 'bc-song',
      onclick: () => {
        closeModal();
        startSong(s);
      },
    },
      el('span', { class: 'bc-song-name' }, s.title),
      el('span', { class: 'bc-song-notes' }, songPhrases(s).map((p) => el('span', {}, p.join(' ')))),
    ))),
    el('button', { class: 'bc-btn', onclick: closeModal }, 'Закрыть'),
  ]);
}

function openStats() {
  const favorite = Object.entries(stats.by).filter(([id]) => id !== 'meow').sort((a, b) => b[1] - a[1])[0];
  const rows = [
    ['Ударов', stats.hits],
    ['Мяу', stats.meows],
    ['Сыграно мелодий', stats.songs ?? 0],
    ['Любимый инструмент', favorite ? findInstrument(favorite[0]).title : '—'],
  ];
  openModal([
    el('h2', {}, 'Статистика'),
    el('div', { class: 'bc-stats' }, rows.map(([k, v]) => el('div', { class: 'bc-stat' },
      el('span', { class: 'bc-stat-v' }, typeof v === 'number' ? v.toLocaleString('ru-RU') : v),
      el('span', { class: 'bc-stat-k' }, k),
    ))),
    el('button', { class: 'bc-btn', onclick: closeModal }, 'Закрыть'),
  ]);
}

function openHelp() {
  const line = (title, keys) => el('div', { class: 'bc-help-row' },
    el('span', {}, title), el('span', { class: 'bc-help-keys' }, keys.map((k) => el('kbd', {}, k))));
  openModal([
    el('h2', {}, 'Как играть'),
    el('p', { class: 'bc-muted' }, 'Жми на клавиши внизу — кот бьёт лапой. Можно двумя пальцами сразу. Инструмент меняется кнопками над клавишами.'),
    el('p', { class: 'bc-muted' }, 'С клавиатуры компьютера — как на bongo.cat:'),
    el('div', { class: 'bc-help' },
      line('Бонго', ['A', 'D']),
      line('Пианино', ['1', '…', '0']),
      line('Маримба', ['Q', '…', 'P']),
      line('Тарелка', ['C']),
      line('Бубен', ['B']),
      line('Колокольчик', ['F']),
      line('Мяу', ['Пробел']),
    ),
    el('p', { class: 'bc-muted bc-small' }, 'Нет звука на айфоне? Проверь громкость и беззвучный режим. '
      + 'По мотивам bongo.cat (Externalizable, мем DitzyFlama, кот StrayRogue); рисунок и звуки здесь свои.'),
    el('button', { class: 'bc-btn', onclick: closeModal }, 'Понятно'),
  ]);
}

// ---------- модуль ----------

export default {
  id: 'bongo-cat',
  title: 'Bongo Cat',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();

    const [savedStats, savedInstrument] = await Promise.all([api.storage.get('stats'), api.storage.get('instrument')]);
    if (!api) return;                              // успели закрыть, пока читали
    stats = isValidStats(savedStats) ? { songs: 0, ...savedStats } : emptyStats();
    current = findInstrument(savedInstrument) && !findInstrument(savedInstrument).voice ? savedInstrument : 'bongo';
    api.progress(progressLine(stats));

    const iconBtn = (icon, label, onclick) => {
      const b = el('button', { class: 'bc-icon-btn', 'aria-label': label, title: label, onclick });
      b.innerHTML = icon;
      return b;
    };

    const stage = el('div', { class: 'bc-stage' });
    stage.innerHTML = sceneMarkup();
    ui = {
      stage,
      scene: stage.querySelector('svg'),
      notes: stage.querySelector('.bc-notes'),
      sub: el('div', { class: 'bc-sub' }, progressLine(stats)),
      chips: el('div', { class: 'bc-chips' }),
      songBar: el('div', { class: 'bc-songbar', hidden: true }),
      pads: el('div', { class: 'bc-pads' }),
      modal: el('div', { class: 'bc-modal', hidden: true, onclick: (e) => { if (e.target === ui.modal) closeModal(); } }),
    };

    container.replaceChildren(el('div', { class: 'bc' },
      el('header', { class: 'bc-header' },
        el('div', {}, el('div', { class: 'bc-title' }, 'Bongo Cat'), ui.sub),
        el('div', { class: 'bc-actions' },
          iconBtn(ICONS.songs, 'Мелодии', openSongs),
          iconBtn(ICONS.stats, 'Статистика', openStats),
          iconBtn(ICONS.help, 'Как играть', openHelp),
        ),
      ),
      ui.stage,
      ui.chips,
      ui.songBar,
      ui.pads,
      ui.modal,
    ), toast.el);

    ui.pads.addEventListener('pointerdown', onPadDown);
    ui.pads.addEventListener('pointerup', onPadUp);
    ui.pads.addEventListener('pointercancel', onPadUp);
    ui.pads.addEventListener('contextmenu', (e) => e.preventDefault());
    // долгое нажатие на айфоне не должно выделять текст и звать лупу
    ui.pads.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);

    showInstrument(current);
    renderChips();
    renderPads();
    if (!reducedMotion()) {
      animate(ui.scene.querySelector('.bc-cat'), [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  },

  getState() {
    return null;                                   // партий нет — продолжать нечего
  },

  destroy() {
    if (saveTimer) flushSave();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    audio?.ctx.close().catch(() => {});
    audio = null;
    pointers.clear();
    keysHeld.clear();
    pawDown.left = 0;
    pawDown.right = 0;
    pawDown.mouth = 0;
    song = null;
    modalActive = false;
    toast?.el.remove();
    toast = null;
    ui = null;
    host = null;
    api = null;
    stats = emptyStats();
    current = 'bongo';
    shown = 'bongo';
  },
};
