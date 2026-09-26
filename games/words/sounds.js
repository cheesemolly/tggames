// Звуки «Слов из слова» — из общих кирпичиков shared/sfx.js (синтез Web Audio, без файлов).
// Идея: слово собирается «мелодией» — каждая следующая буква звучит на ступень выше (пентатоника,
// поэтому любое слово звучит складно), найденное слово — аккорд-колокольчик, редкое — с блёстками,
// прохождение уровня — фанфара. Ошибки — мягкие и низкие, чтобы не раздражать при частых промахах.
//
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер буквы (tap), номер звезды (star), длина слова (common/rare).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['tap', 'back', 'clear', 'common', 'rare', 'found', 'wrong', 'hint', 'empty', 'star', 'level', 'click'];

export function createSounds(ctx) {
  const { now, bell, plip, swoosh, thud } = createSfx(ctx);

  const play = {
    // буква: ступень по номеру буквы в слове
    tap: (t, { step: n = 0 }) => plip(freqOf(pentaStep(n)), t),
    // убрать букву — та же ступень, но пузырёк «сдувается» вниз
    back: (t, { step: n = 0 }) => plip(freqOf(pentaStep(n)), t, { up: false, peak: 0.22, decay: 0.1 }),
    clear: (t) => swoosh(t, 2400, 500, 0.22),
    // найдено слово: арпеджио вверх, чем длиннее слово — тем больше нот
    common: (t, { step: n = 3 }) => {
      const notes = [0, 4, 7, 12, 16, 19].slice(0, Math.max(3, Math.min(6, n - 1)));
      notes.forEach((s, k) => bell(freqOf(s), t + k * 0.07, { peak: 0.26, decay: 0.7 }));
    },
    // редкое слово: то же и «блёстки» — быстрый каскад высоких нот
    rare: (t, { step: n = 3 }) => {
      play.common(t, { step: n });
      [24, 28, 31, 36, 31, 36].forEach((s, k) => bell(freqOf(s), t + 0.12 + k * 0.045, { peak: 0.09, decay: 0.35 }));
    },
    // уже найдено: два коротких одинаковых тона — «было»
    found: (t) => {
      bell(freqOf(7), t, { peak: 0.16, decay: 0.2 });
      bell(freqOf(7), t + 0.11, { peak: 0.13, decay: 0.25 });
    },
    // нет такого слова: два низких мягких «бума» вниз
    wrong: (t) => {
      thud(220, t);
      thud(165, t + 0.12, { decay: 0.24 });
    },
    // подсказка: шорох вверх + восходящее глиссандо колокольчиков
    hint: (t) => {
      swoosh(t, 600, 5000, 0.35, 0.07);
      [12, 16, 19, 24].forEach((s, k) => bell(freqOf(s), t + 0.08 + k * 0.06, { peak: 0.13, decay: 0.5 }));
    },
    // подсказки кончились
    empty: (t) => thud(180, t, { decay: 0.14, slide: 0.9 }),
    // звезда в окне уровня: каждая следующая выше
    star: (t, { step: n = 0 }) => bell(freqOf([7, 12, 16][Math.max(0, Math.min(2, n))] + 12), t, { peak: 0.22, decay: 0.8 }),
    // уровень пройден: фанфара — аккорд вверх и финальная октава
    level: (t) => {
      [0, 4, 7].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.24, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.32, { peak: 0.16, decay: 1.3 }));
      swoosh(t + 0.3, 3000, 9000, 0.5, 0.04);
    },
    // вкладка, выбор уровня
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
