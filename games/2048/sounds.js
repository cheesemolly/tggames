// Звуки 2048 — простые (просьба владельца, 2026-09-26), из общих кирпичиков shared/sfx.js:
//   ход — короткий шорох скольжения; слияние — «поп», и чем больше получилась плитка, тем выше нота
//   (4 — низко … 2048 — высоко, по пентатонике); несколько слияний разом — второй «поп» чуть позже;
//   ход в стену — глухой «бум»; отмена — шорох назад; новая партия — две плитки появляются «плипами»;
//   2048 — фанфара; ходов нет — три ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: значение слитой плитки (merge), число слияний (merge — { count }).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['slide', 'merge', 'blocked', 'undo', 'spawn', 'win', 'over', 'click'];

/** Ступень ноты по значению плитки: 4 → 0, 8 → 1, … 2048 → 9 (дальше — выше). */
export const mergeStep = (value) => Math.max(0, Math.round(Math.log2(Math.max(4, value))) - 2);

export function createSounds(ctx) {
  const { now, bell, plip, bup, swoosh, thud } = createSfx(ctx);

  const play = {
    slide: (t) => swoosh(t, 1800, 700, 0.1, 0.07),
    merge: (t, { step: value = 4, count = 1 }) => {
      const f = freqOf(pentaStep(mergeStep(value)) - 5);
      bup(f, t, { peak: 0.26, decay: 0.12, drop: 1.5 });
      if (value >= 128) bell(f * 2, t + 0.02, { peak: 0.08, decay: 0.35 });   // большие плитки — с отзвуком
      if (count > 1) bup(f * 0.84, t + 0.07, { peak: 0.16, decay: 0.1, drop: 1.5 });
    },
    blocked: (t) => thud(170, t, { peak: 0.2, decay: 0.12, slide: 0.85 }),
    undo: (t) => {
      swoosh(t, 700, 1800, 0.14, 0.06);
      plip(freqOf(0), t + 0.1, { up: false, peak: 0.12, decay: 0.08 });
    },
    spawn: (t, { step: k = 0 }) => plip(freqOf(k ? 7 : 0), t, { peak: 0.14, decay: 0.08 }),
    win: (t) => {
      [0, 4, 7].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.22, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.32, { peak: 0.14, decay: 1.2 }));
    },
    over: (t) => {
      [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.22, { peak: 0.18, decay: 0.5 }));
      thud(130, t + 0.66, { peak: 0.2, decay: 0.4, slide: 0.7 });
    },
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
