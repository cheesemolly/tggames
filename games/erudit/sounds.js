// Звуки «Эрудита» — из shared/sfx.js, мягкие: фишки стучат по полю, как костяшки по картону.
//   взял фишку с руки — тихий «тук»; фишка встала на поле — деревянный «ток», каждая следующая буква слова чуть
//   выше; фишки бота — ниже, чтобы на слух отличать; вернул фишку — «ток» вниз; курсор — еле слышный «плип»;
//   перемешал руку — шелест; ход принят — колокольчики вверх (дороже ход — больше нот); все семь фишек —
//   аккорд и россыпь; слова нет — два мягких «бума»; обмен — шорох туда и обратно; пас — «буп»;
//   победа, поражение, ничья — свои колокольчики.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step, bot }) — step: номер буквы в слове (place) или число нот (play); bot: фишка бота.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'pick', 'place', 'back', 'cursor', 'shuffle', 'play', 'bingo', 'error', 'swap', 'pass', 'win', 'lose', 'draw', 'click',
];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, bup, swoosh, thud, rustle, pad } = createSfx(ctx, { volume: 0.55 });

  /** Фишка о поле: глухой тон и короткое касание. */
  const knock = (t, freq, peak = 0.15) => {
    tock(freq, t, { peak, decay: 0.07 });
    grain(t, 0.012, { f0: 1700, q: 0.8, peak: peak * 0.25, attack: 0.002, release: 0.01 });
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));

  const play = {
    pick: (t) => knock(t, 340, 0.07),
    place: (t, { step = 0, bot = false }) => knock(t, freqOf(pentaStep(clamp(step, 0, 6)), bot ? 185 : 235)),
    back: (t) => knock(t, 175, 0.1),
    cursor: (t) => plip(freqOf(0), t, { peak: 0.05, decay: 0.05 }),
    shuffle: (t) => rustle(t, 0.3, { peak: 0.06, from: 1800, to: 3600 }),
    play: (t, { step = 2 }) => {
      const notes = clamp(step, 2, 5);
      for (let k = 0; k < notes; k++) bell(freqOf(pentaStep(k + 2)), t + k * 0.08, { peak: 0.13, decay: 0.6 });
    },
    bingo: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.4 });
      for (let k = 0; k < 7; k++) bell(freqOf(pentaStep(k + 3)), t + k * 0.07, { peak: 0.12, decay: 0.7 });
    },
    error: (t) => {
      thud(170, t, { peak: 0.16, decay: 0.12, slide: 0.85 });
      thud(150, t + 0.13, { peak: 0.14, decay: 0.14, slide: 0.85 });
    },
    swap: (t) => {
      swoosh(t, 2200, 700, 0.18, 0.05);
      swoosh(t + 0.2, 700, 2200, 0.18, 0.05);
    },
    pass: (t) => bup(220, t, { peak: 0.14, decay: 0.12 }),
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.14, decay: 0.7 })),
    lose: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.2, { peak: 0.15, decay: 0.6 })),
    draw: (t) => {
      bell(freqOf(0), t, { peak: 0.12, decay: 0.5 });
      bell(freqOf(0), t + 0.25, { peak: 0.1, decay: 0.7 });
    },
    click: (t) => knock(t, 320, 0.06),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
