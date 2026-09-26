// Звуки «Петли» — строго «дзен» (решение владельца, 2026-09-26): ни звона, ни «плипов».
//   поворот плитки — мягкий глухой «ток» камня и лёгкий шорох (высота — тихая пентатоника по месту плитки,
//   чтобы сотня поворотов не звучала одинаково); плитка сошлась со всеми соседями — едва слышный тёплый тон;
//   поле решено — долгий тёплый аккорд на «вдохе» (в такт «дыханию» поля) и ветер; новое поле — ветер.
// Из общих кирпичиков shared/sfx.js. createSounds(ctx) принимает готовый AudioContext — в тестах поддельный.
// play(name, { step }) — step: номер плитки (turn, fit).

import { createSfx, freqOf, PENTA } from '../../shared/sfx.js';

export const SOUNDS = ['turn', 'fit', 'win', 'intro', 'shuffle', 'click'];

// низкие ноты пентатоники: камешки звучат по-разному, но всегда в одном ладу
const stone = (i) => freqOf(PENTA[((i * 7) % 6 + 6) % 6] - 24);
const warm = (i) => freqOf(PENTA[((i * 5) % 7 + 7) % 7] - 12);
const chord = (...semitones) => semitones.map((s) => freqOf(s - 12));

export function createSounds(ctx) {
  const { now, grain, rustle, tock, pad } = createSfx(ctx, { volume: 0.6 });

  const play = {
    // поворот: глухой «ток» и короткий шорох камня по камню
    turn: (t, { step: i = 0 }) => {
      tock(stone(i), t, { peak: 0.13, decay: 0.08 });
      grain(t, 0.05, { f0: 900, f1: 600, q: 0.8, peak: 0.035, attack: 0.004, release: 0.03 });
    },
    // плитка сошлась с соседями: тот же поворот и едва слышный тёплый тон
    fit: (t, { step: i = 0 }) => {
      play.turn(t, { step: i });
      pad([warm(i)], t + 0.03, { peak: 0.028, attack: 0.06, decay: 1.1, cutoff: 1100 });
    },
    // поле решено: долгий аккорд на вдохе и ветер
    win: (t) => {
      pad(chord(0, 7, 14, 16), t, { peak: 0.04, attack: 0.7, decay: 3, cutoff: 1500 });
      rustle(t + 0.1, 1.4, { peak: 0.035, from: 400, to: 1400 });
    },
    // плитки нового поля появляются — лёгкий ветер
    intro: (t) => rustle(t, 0.7, { peak: 0.03, from: 500, to: 1600 }),
    // «Другое поле» — ветер вниз
    shuffle: (t) => rustle(t, 0.4, { peak: 0.035, from: 1800, to: 600 }),
    click: (t) => grain(t, 0.03, { f0: 1500, q: 0.7, peak: 0.03, attack: 0.004, release: 0.02 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
