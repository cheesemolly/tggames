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
  emptyStats, isValidStats, recordHit, progressLine, octavePads, octaveKey,
} from './logic.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAW_MIN_MS = 90;
const PAW_LIFT_MS = 60;           // на столько лапа поднимается перед повторным ударом, пока держится прежний               // короткий тап всё равно виден: лапа внизу хотя бы столько

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" `
  + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  songs: svgIcon('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  stats: svgIcon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
  rotate: svgIcon('<rect x="7" y="2" width="10" height="16" rx="2"/><path d="M11 15h2"/><path d="M20 13a8 8 0 0 1-6 7.7"/><path d="M16.5 19.8 14 20.7l.8 2.3"/>'),
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
const lifting = { left: 0, right: 0, mouth: 0 };   // таймер «подъёма» лапы перед повторным ударом
const pointers = new Map();      // pointerId → { instrument, pad, at }
const keysHeld = new Map();      // code → { instrument, pad, at }
const timers = new Set();
// Две октавы и альбомный вид (в бете 'bongo-octaves'): octaves — выбор игрока для вертикального экрана (1 или 2),
// rotated — игра повёрнута кнопкой, landscape — сейчас альбомная раскладка (повёрнута или экран и так широкий).
const OCTAVE_INSTRUMENTS = ['keyboard', 'marimba'];
let octaves = 1;
let rotated = false;
let landscape = false;

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const octavesOn = () => Boolean(api?.feature?.('bongo-octaves'));

/** Клавиши инструмента на экране: у пианино и маримбы в режиме октав — полная октава или две (в альбомном виде — две). */
function padsOf(id) {
  if (octavesOn() && OCTAVE_INSTRUMENTS.includes(id)) return landscape ? octavePads(id, 2, true) : octavePads(id, octaves);
  return findInstrument(id).pads;
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

/**
 * Лапа внизу, пока держится хоть одна её клавиша. Новая клавиша той же лапы, пока прежняя ещё
 * зажата (держишь 1 — жмёшь 2), — лапа на миг поднимается и бьёт снова, иначе второй удар не виден.
 */
function setPaw(paw, delta) {
  const cls = `bc-${paw}-down`;
  const wasDown = pawDown[paw] > 0;
  pawDown[paw] = Math.max(0, pawDown[paw] + delta);
  if (delta > 0 && wasDown) {
    host.classList.remove(cls);
    if (lifting[paw]) {
      clearTimeout(lifting[paw]);
      timers.delete(lifting[paw]);
    }
    lifting[paw] = later(() => {
      lifting[paw] = 0;
      host?.classList.toggle(cls, pawDown[paw] > 0);
    }, PAW_LIFT_MS);
    return;
  }
  if (lifting[paw]) return;                     // лапа как раз поднимается для удара — решит таймер
  host.classList.toggle(cls, pawDown[paw] > 0);
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
    // на рисунке 10 клавиш: ноты выше «ля» и вторая октава нажимают ближайшую нарисованную
    inst.querySelector(`.bc-key[data-note="${Math.min(pad.note % 12, 9)}"]`)?.classList.add('down');
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
  ui.scene.querySelector(`.bc-inst[data-inst="${instrument}"] .bc-key[data-note="${Math.min(pad.note % 12, 9)}"]`)?.classList.remove('down');
}

// ---------- удар ----------

/**
 * Удар. background — клавиша чужого инструмента с клавиатуры: звучит тот инструмент, но выбранный
 * остаётся (на столе и внизу — прежний), лапа не бьёт — удар по инструменту на столе был бы «фантомным».
 * На bongo.cat в этом случае инструмент переключается — мы отказались (решение владельца, 2026-09-24).
 */
function press(instrument, pad, { background = false } = {}) {
  const a = ensureAudio();
  a?.synth.play(instrument, pad.note);
  if (!background) {
    if (instrument !== current) selectInstrument(instrument, { quiet: true });
    showInstrument(instrument);
  }
  // Фоном лапа не бьёт: на столе другой инструмент, удар по нему выглядел бы «фантомным».
  // «Мяу» — не инструмент на столе, рот открывается и фоном.
  const paw = !background || pad.paw === 'mouth' ? pad.paw : null;
  if (paw) {
    setPaw(paw, 1);
    spawnNote(paw);
  }
  if (!background) shakeInstrument(instrument, pad);
  api.platform.haptic.impact(instrument === 'meow' ? 'soft' : 'light');

  stats = recordHit(stats, instrument);
  ui.sub.textContent = progressLine(stats);
  scheduleSave();

  if (song && (instrument === 'keyboard' || instrument === 'marimba')) advanceSong(pad.note);
  return { at: performance.now(), paw };
}

function release(held) {
  const wait = Math.max(0, PAW_MIN_MS - (performance.now() - held.at));
  const up = () => {
    if (!ui) return;
    if (held.paw) setPaw(held.paw, -1);
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
  const pad = instrument && padsOf(instrument.id).find((p) => p.id === padEl.dataset.pad);
  if (!pad) return;
  try { padEl.setPointerCapture(e.pointerId); } catch { /* синтетические указатели не захватываются */ }
  markPad(padEl, true);
  const { at, paw } = press(instrument.id, pad);
  pointers.set(e.pointerId, { instrument: instrument.id, pad, at, paw, padEl });
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
  let hit = padForCode(e.code);
  if (octavesOn()) {
    // «-» «=» (у маримбы «[» «]») — ля♯ и си, с Shift — октавой выше
    const k = octaveKey(e.code, e.shiftKey);
    if (k) hit = { instrument: k.instrument, pad: padsOf(k.instrument).find((p) => p.note === k.note) ?? octavePads(k.instrument, 2)[k.note] };
  }
  if (!hit) return;
  e.preventDefault();
  if (e.repeat || keysHeld.has(e.code)) return;             // зажатая клавиша не «строчит», как и на bongo.cat
  // клавиша чужого инструмента (и «мяу») звучит фоном, выбранный инструмент остаётся
  const background = hit.instrument !== current;
  const { at, paw } = press(hit.instrument, hit.pad, { background });
  const padEl = ui.pads.querySelector(`.bc-pad[data-inst="${hit.instrument}"][data-pad="${hit.pad.id}"]`);
  markPad(padEl, true);
  keysHeld.set(e.code, { ...hit, at, paw, padEl });
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
  const pads = padsOf(current);
  const pad = (p, extra = '') => el('button', {
    class: `bc-pad ${extra}`.trim(),
    'data-inst': instrument.id,
    'data-pad': p.id,
    'aria-label': p.name,
  },
    el('span', { class: 'bc-pad-name' }, p.name),
    el('span', { class: 'bc-pad-key' }, p.label),
  );

  // как настоящая клавиатура: белые клавиши, чёрные сверху между ними (--whites — сколько белых в ряду)
  const piano = (list) => {
    const whites = list.filter((p) => !p.black);
    const blacks = list.filter((p) => p.black);
    const node = el('div', { class: `bc-piano ${instrument.id === 'marimba' ? 'bc-piano-marimba' : ''} ${whites.length > 7 ? 'bc-piano-dense' : ''}`.trim() },
      el('div', { class: 'bc-piano-whites' }, whites.map((p) => pad(p, 'bc-pad-white'))),
      el('div', { class: 'bc-piano-blacks' }, blacks.map((p) => {
        const before = whites.findIndex((w) => w.note > p.note);
        const key = pad(p, 'bc-pad-black');
        key.style.setProperty('--at', before < 0 ? whites.length : before);
        return key;
      })),
    );
    node.style.setProperty('--whites', whites.length);
    return node;
  };

  let body;
  if (OCTAVE_INSTRUMENTS.includes(instrument.id)) {
    // две октавы на вертикальном экране — два ряда, верхняя октава сверху (идея игрока); в альбомном — один ряд
    body = pads.length === 24 && !landscape
      ? el('div', { class: 'bc-piano-rows' }, piano(pads.slice(12)), piano(pads.slice(0, 12)))
      : piano(pads);
  } else {
    body = el('div', { class: `bc-big bc-big-${pads.length}` }, pads.map((p) => pad(p, `bc-pad-big bc-pad-${instrument.id}`)));
  }
  ui.pads.replaceChildren(body);
  markSongTarget();
}

function renderChips() {
  const chips = INSTRUMENTS.map((inst) => el('button', {
    class: `bc-chip ${inst.id === current ? 'on' : ''}`.trim(),
    onclick: () => {
      ensureAudio();
      selectInstrument(inst.id);
    },
  }, inst.title));
  if (octavesOn() && OCTAVE_INSTRUMENTS.includes(current) && !landscape) {
    chips.push(el('button', {
      class: `bc-chip bc-chip-oct ${octaves === 2 ? 'on' : ''}`.trim(),
      'aria-pressed': String(octaves === 2),
      onclick: () => {
        octaves = octaves === 2 ? 1 : 2;
        api.storage.set('octaves', octaves);
        api.platform.haptic.selection();
        renderChips();
        renderPads();
        if (!reducedMotion()) animate(ui.pads, [{ opacity: 0.4, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
      },
    }, '2 октавы'));
  }
  ui.chips.replaceChildren(...chips);
}

/**
 * Раскладка: альбомная — если игру повернули кнопкой или экран и так шире, чем выше (телефон боком, окно на ПК).
 * Поворот — вся игра разворачивается на 90° (держать телефон боком); animated — плавно, из маленькой картинки.
 */
function applyLayout(animated = false) {
  if (!ui || !host) return;
  const W = host.clientWidth, H = host.clientHeight;
  const wide = W > H;
  if (wide) rotated = false;                          // телефон и так боком — поворачивать нечего
  const was = ui.root.classList.contains('bc-rot');
  landscape = octavesOn() && (rotated || wide);
  host.classList.toggle('bc-host-rot', rotated);
  ui.root.classList.toggle('bc-rot', rotated);
  ui.root.classList.toggle('bc-land', landscape);
  if (rotated) {
    ui.root.style.setProperty('--rot-w', `${H}px`);
    ui.root.style.setProperty('--rot-h', `${W}px`);
  }
  if (ui.rotateBtn) {
    ui.rotateBtn.hidden = wide;
    ui.rotateBtn.setAttribute('aria-pressed', String(rotated));
  }
  renderChips();
  renderPads();
  if (animated && was !== rotated && !reducedMotion() && H > 0) {
    const k = (W / H).toFixed(3);
    animate(ui.root, rotated
      ? [{ transform: `translate(-50%, -50%) rotate(0deg) scale(${k})`, opacity: 0.35 }, { transform: 'translate(-50%, -50%) rotate(90deg) scale(1)', opacity: 1 }]
      : [{ transform: `rotate(90deg) scale(${k})`, opacity: 0.35 }, { transform: 'none', opacity: 1 }],
    { duration: 480, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}

function toggleRotate() {
  releaseAll();
  rotated = !rotated;
  api.platform.haptic.impact('medium');
  applyLayout(true);
}

const onResize = () => applyLayout(false);

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
      line('Пианино', octavesOn() ? ['1', '…', '0', '-', '='] : ['1', '…', '0']),
      line('Маримба', octavesOn() ? ['Q', '…', 'P', '[', ']'] : ['Q', '…', 'P']),
      ...(octavesOn() ? [line('Октавой выше', ['Shift', '+', 'клавиша'])] : []),
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

    const [savedStats, savedInstrument, savedOctaves] = await Promise.all([
      api.storage.get('stats'), api.storage.get('instrument'), api.storage.get('octaves'),
    ]);
    octaves = savedOctaves === 2 ? 2 : 1;
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
      rotateBtn: octavesOn() ? iconBtn(ICONS.rotate, 'Повернуть: альбомный вид, две октавы', () => toggleRotate()) : null,
      modal: el('div', { class: 'bc-modal', hidden: true, onclick: (e) => { if (e.target === ui.modal) closeModal(); } }),
    };

    ui.root = el('div', { class: 'bc' },
      el('header', { class: 'bc-header' },
        el('div', {}, el('div', { class: 'bc-title' }, 'Bongo Cat'), ui.sub),
        el('div', { class: 'bc-actions' },
          ui.rotateBtn,
          iconBtn(ICONS.songs, 'Мелодии', openSongs),
          iconBtn(ICONS.stats, 'Статистика', openStats),
          iconBtn(ICONS.help, 'Как играть', openHelp),
        ),
      ),
      ui.stage,
      el('div', { class: 'bc-side' }, ui.chips, ui.songBar),
      ui.pads,
      ui.modal,
    );
    container.replaceChildren(ui.root, toast.el);

    ui.pads.addEventListener('pointerdown', onPadDown);
    ui.pads.addEventListener('pointerup', onPadUp);
    ui.pads.addEventListener('pointercancel', onPadUp);
    ui.pads.addEventListener('contextmenu', (e) => e.preventDefault());
    // долгое нажатие на айфоне не должно выделять текст и звать лупу
    ui.pads.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    window.addEventListener('resize', onResize);

    showInstrument(current);
    applyLayout(false);
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
    window.removeEventListener('resize', onResize);
    host?.classList.remove('bc-host-rot');
    octaves = 1;
    rotated = false;
    landscape = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    audio?.ctx.close().catch(() => {});
    audio = null;
    pointers.clear();
    keysHeld.clear();
    pawDown.left = 0;
    pawDown.right = 0;
    pawDown.mouth = 0;
    lifting.left = 0;
    lifting.right = 0;
    lifting.mouth = 0;
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
