import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENTS, findInstrument, padForCode, noteFreq, SONGS, songKeys, songPhrases, followSong, expectedNote,
  emptyStats, isValidStats, recordHit, progressLine, NOTE_COUNT,
} from '../logic.js';
import { createSynth } from '../sounds.js';
import { tableY } from '../art.js';

test('клавиши — как на bongo.cat', () => {
  const expect = {
    KeyA: 'bongo', KeyD: 'bongo', KeyC: 'cymbal', KeyB: 'tambourine', KeyF: 'cowbell', Space: 'meow',
    Digit1: 'keyboard', Digit0: 'keyboard', KeyQ: 'marimba', KeyP: 'marimba', KeyY: 'marimba',
  };
  for (const [code, inst] of Object.entries(expect)) assert.equal(padForCode(code)?.instrument, inst, code);
  assert.equal(padForCode('KeyZ'), null, 'лишних клавиш нет');
  assert.equal(padForCode('Digit1').pad.note, 0, '1 — до');
  assert.equal(padForCode('Digit0').pad.note, 9, '0 — ля');
  assert.equal(padForCode('KeyT').pad.note, 4, 'T — пятая нота маримбы');
});

test('цифровой блок играет пианино — только в обкатке (withAlt)', () => {
  assert.equal(padForCode('Numpad5'), null, 'у игроков пока как на bongo.cat');
  for (let d = 0; d <= 9; d++) {
    const hit = padForCode(`Numpad${d}`, { withAlt: true });
    assert.equal(hit?.instrument, 'keyboard');
    assert.equal(hit.pad, padForCode(`Digit${d}`).pad, `Numpad${d} — та же нота, что ${d}`);
  }
  assert.equal(padForCode('KeyA', { withAlt: true })?.instrument, 'bongo', 'основные клавиши не мешают');
});

test('у каждой клавиши своя кнопка, лапа и подпись', () => {
  const codes = new Set();
  for (const inst of INSTRUMENTS) {
    assert.ok(inst.title && inst.pads.length > 0, inst.id);
    for (const pad of inst.pads) {
      for (const code of [pad.code, pad.alt].filter(Boolean)) {
        assert.ok(!codes.has(code), `клавиша ${code} занята дважды`);
        codes.add(code);
      }
      assert.ok(['left', 'right', 'mouth'].includes(pad.paw), `${inst.id}/${pad.id}: лапа`);
      assert.ok(pad.label && pad.name, `${inst.id}/${pad.id}: подпись`);
    }
  }
  for (const id of ['keyboard', 'marimba']) {
    const pads = findInstrument(id).pads;
    assert.equal(pads.length, NOTE_COUNT);
    assert.deepEqual(pads.map((p) => p.note), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(pads.filter((p) => p.black).map((p) => p.note), [1, 3, 6, 8], 'диезы — чёрные клавиши');
    assert.ok(pads.slice(0, 5).every((p) => p.paw === 'left') && pads.slice(5).every((p) => p.paw === 'right'));
  }
  assert.equal(findInstrument('bongo').pads[0].paw, 'left');
  assert.equal(findInstrument('bongo').pads[1].paw, 'right');
  assert.equal(findInstrument('meow').pads[0].paw, 'mouth');
});

test('ноты: по полутонам от до первой октавы', () => {
  assert.ok(Math.abs(noteFreq(0) - 261.63) < 0.01, 'до');
  assert.ok(Math.abs(noteFreq(9) - 440) < 0.01, 'ля — 440 Гц');
  assert.ok(Math.abs(noteFreq(0, 1) - 523.25) < 0.01, 'октавой выше');
});

test('мелодии: только существующие клавиши, «Ода к радости» — как в README bongo.cat', () => {
  for (const song of SONGS) {
    const keys = songKeys(song);
    assert.ok(keys.length > 5, song.id);
    for (const k of keys) assert.ok(padForCode(`Digit${k}`), `${song.id}: нет клавиши ${k}`);
    assert.equal(songPhrases(song).flat().length, keys.length);
  }
  const ode = SONGS.find((s) => s.id === 'ode');
  // ми ми фа соль соль фа ми ре до до ре ми ми ре ре
  const semitones = songKeys(ode).slice(0, 15).map((k) => padForCode(`Digit${k}`).pad.note);
  assert.deepEqual(semitones, [4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 4, 2, 2]);
});

test('разучивание: верная нота двигает, неверная — нет, конец мелодии', () => {
  const song = { notes: '1 3 / 5' };
  let r = followSong(song, 0, 4);
  assert.deepEqual(r, { pos: 0, hit: false, done: false });
  r = followSong(song, 0, 0);
  assert.deepEqual(r, { pos: 1, hit: true, done: false });
  assert.equal(expectedNote(song, 1), 2);
  r = followSong(song, 1, 2);
  r = followSong(song, r.pos, 4);
  assert.deepEqual(r, { pos: 3, hit: true, done: true });
  assert.equal(expectedNote(song, 3), null);
  assert.equal(expectedNote({ notes: '0' }, 0), 9, '0 — последняя нота');
});

test('статистика и строка меню', () => {
  let s = emptyStats();
  assert.ok(isValidStats(s));
  s = recordHit(s, 'bongo');
  s = recordHit(s, 'bongo');
  s = recordHit(s, 'meow');
  assert.equal(s.hits, 3);
  assert.equal(s.meows, 1);
  assert.equal(s.by.bongo, 2);
  assert.equal(progressLine(s), 'Ударов: 3');
  assert.match(progressLine({ ...s, hits: 12345 }), /^Ударов: 12\s345$/u);
  assert.equal(isValidStats(null), false);
  assert.equal(isValidStats({ hits: -1, meows: 0, by: {} }), false);
  assert.equal(isValidStats({ hits: 1, meows: 0, by: {} }), true, 'старая запись без songs годится');
});

test('стол — под 13,5°, как у bongo.cat', () => {
  assert.equal(tableY(400), 142);
  assert.ok(Math.abs((tableY(500) - tableY(400)) / 100 - Math.tan((13.5 * Math.PI) / 180)) < 1e-9);
});

// ---------- звук на поддельном AudioContext ----------

function fakeContext() {
  const created = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v) { assert.ok(v > 0, 'экспоненциальный спад до нуля невозможен'); },
  });
  const node = (kind, extra = {}) => {
    const n = {
      kind, connections: 0, started: false, stopped: false,
      connect(target) { assert.ok(target, `${kind}: соединение в пустоту`); n.connections++; return target; },
      ...extra,
    };
    created.push(n);
    return n;
  };
  const source = (kind, extra) => node(kind, {
    start() { n0(); }, stop() {}, ...extra,
  });
  let n0 = () => {};
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    destination: { kind: 'destination' },
    createGain: () => node('gain', { gain: param() }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), ratio: param() }),
    createBiquadFilter: () => node('filter', { frequency: param(), Q: param(), type: '' }),
    createOscillator: () => source('osc', { frequency: param(), type: '' }),
    createBufferSource: () => source('buffer', { buffer: null, loop: false }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { ctx, created };
}

test('каждый инструмент звучит и все его узлы подключены', () => {
  const { ctx, created } = fakeContext();
  const synth = createSynth(ctx);
  for (const inst of INSTRUMENTS) {
    assert.ok(synth.has(inst.id), `нет звука для ${inst.id}`);
    for (const pad of inst.pads) {
      const before = created.length;
      synth.play(inst.id, pad.note);
      const fresh = created.slice(before);
      assert.ok(fresh.some((n) => n.kind === 'osc' || n.kind === 'buffer'), `${inst.id}: нет источника звука`);
      for (const n of fresh) assert.ok(n.connections > 0, `${inst.id}: узел ${n.kind} ни к чему не подключён`);
    }
  }
});
