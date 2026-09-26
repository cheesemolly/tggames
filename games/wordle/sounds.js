// Звуки Wordle (все три языка) — из общих кирпичиков shared/sfx.js (синтез Web Audio, без файлов).
// Идея: набор — мягкие клавиши, каждая следующая буква на ступень выше; переворот хода — у каждой клетки свой
// звук по цвету: серая — глухой деревянный стук, жёлтая — средний колокольчик, зелёная — яркий, и чем правее,
// тем выше, так что угаданное слово звучит восходящей мелодией. Победа — ноты в такт подпрыгиванию строки и
// фанфара, проигрыш — нисходящее «вау-вау». Ошибки хода — мягкие низкие «бумы».
//
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер клетки в строке (0…4) для key, back, tile-*, hop.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'key', 'back', 'reject', 'enter',
  'tile-absent', 'tile-present', 'tile-correct',
  'hop', 'win', 'lose', 'lang', 'click',
];

export function createSounds(ctx) {
  const { now, bell, plip, swoosh, thud } = createSfx(ctx);
  const clamp = (n) => Math.max(0, Math.min(4, n));

  const play = {
    // клавиша: пузырёк ниже, чем в «Словах», — ступень по номеру клетки
    key: (t, { step: n = 0 }) => plip(freqOf(pentaStep(clamp(n)) - 5), t, { peak: 0.24, decay: 0.09 }),
    back: (t, { step: n = 0 }) => plip(freqOf(pentaStep(clamp(n)) - 5), t, { up: false, peak: 0.16, decay: 0.07 }),
    // слова нет / не хватает букв
    reject: (t) => {
      thud(220, t);
      thud(165, t + 0.12, { decay: 0.24 });
    },
    // ход принят — лёгкий шорох перед переворотом
    enter: (t) => swoosh(t, 700, 2600, 0.16, 0.05),
    // переворот клетки — звук по цвету
    'tile-absent': (t) => thud(300, t, { peak: 0.2, decay: 0.08, slide: 0.9 }),
    'tile-present': (t, { step: n = 0 }) => bell(freqOf(pentaStep(clamp(n)) + 3), t, { peak: 0.18, decay: 0.45 }),
    'tile-correct': (t, { step: n = 0 }) => bell(freqOf(pentaStep(clamp(n) + 2)), t, { peak: 0.24, decay: 0.7 }),
    // угаданная строка подпрыгивает — нота на каждую букву вверх по аккорду
    hop: (t, { step: n = 0 }) => bell(freqOf([0, 4, 7, 12, 16][clamp(n)] + 12), t, { peak: 0.16, decay: 0.35 }),
    // победа: фанфара
    win: (t) => {
      [0, 4, 7].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.22, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.32, { peak: 0.15, decay: 1.3 }));
      swoosh(t + 0.3, 3000, 9000, 0.5, 0.04);
    },
    // проигрыш: три ноты вниз и мягкий «бум»
    lose: (t) => {
      [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.22, { peak: 0.2, decay: 0.5 }));
      thud(130, t + 0.66, { peak: 0.22, decay: 0.4, slide: 0.7 });
    },
    // смена языка
    lang: (t) => swoosh(t, 2800, 800, 0.25, 0.07),
    // окно статистики, кнопки
    click: (t) => plip(freqOf(12), t, { peak: 0.12, decay: 0.05 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
