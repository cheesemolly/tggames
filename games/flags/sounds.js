// Звуки «Флагов» — простые (просьба владельца, 2026-09-26), из shared/sfx.js.
//   клавиша своей клавиатуры — тихий щелчок; верный ответ — два колокольчика вверх, каждая пятая верная подряд —
//   ещё «блёстка»; неверный — мягкое «у-у» (два «бупа» вниз); введённой страны нет — глухой «тук»;
//   следующий флаг — шорох (флаг уезжает); конец партии — колокольчики вверх (≥ 70% верных) или ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: серия верных ответов подряд (right).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['key', 'right', 'wrong', 'unknown', 'next', 'win', 'lose', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, bup, swoosh, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    key: (t) => {
      tock(420, t, { peak: 0.05, decay: 0.025 });
      grain(t, 0.01, { f0: 3000, q: 0.9, peak: 0.02, attack: 0.001, release: 0.008 });
    },
    right: (t, { step: streak = 1 }) => {
      bell(freqOf(0), t, { peak: 0.15, decay: 0.5 });
      bell(freqOf(7), t + 0.08, { peak: 0.13, decay: 0.6 });
      if (streak > 0 && streak % 5 === 0) [12, 16, 19].forEach((s, k) => bell(freqOf(s), t + 0.2 + k * 0.06, { peak: 0.07, decay: 0.5 }));
    },
    wrong: (t) => {
      bup(freqOf(-12), t, { peak: 0.2, decay: 0.14, drop: 1.3 });
      bup(freqOf(-16), t + 0.16, { peak: 0.18, decay: 0.2, drop: 1.3 });
    },
    unknown: (t) => thud(170, t, { peak: 0.16, decay: 0.12, slide: 0.85 }),
    next: (t) => swoosh(t, 1800, 700, 0.18, 0.04),
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.14, decay: 0.7 })),
    lose: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.2, { peak: 0.15, decay: 0.6 })),
    click: (t) => tock(320, t, { peak: 0.06, decay: 0.03 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
