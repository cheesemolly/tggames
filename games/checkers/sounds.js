// Звуки шашек — простые (просьба владельца, 2026-09-26), из shared/sfx.js: деревянная доска и шашки.
//   выбрал шашку — тихий «тук»; шашка встала на поле (каждый прыжок боя тоже) — деревянный «ток»,
//   ход бота — чуть ниже, чтобы на слух отличать; побитые снимаются — сухой «щёлк» (несколько — россыпью);
//   дамка — два тёплых колокольчика; «бить обязательно» — глухой «бум»; отмена — шорох; подсказка — «плип»;
//   победа — колокольчики вверх, поражение — ноты вниз, ничья — две ровные ноты.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step, bot }) — step: сколько шашек снято (capture); bot: ход бота (move).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['select', 'move', 'capture', 'king', 'must', 'undo', 'hint', 'win', 'lose', 'draw', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, swoosh, thud } = createSfx(ctx, { volume: 0.55 });

  /** Шашка о доску: глухой деревянный тон и короткое касание. */
  const wood = (t, freq, peak = 0.16) => {
    tock(freq, t, { peak, decay: 0.07 });
    grain(t, 0.014, { f0: 1800, q: 0.8, peak: peak * 0.3, attack: 0.002, release: 0.012 });
  };

  const play = {
    select: (t) => wood(t, 330, 0.08),
    move: (t, { bot = false }) => wood(t, bot ? 200 : 240),
    // сухой «щёлк» — шашка снимается с доски; несколько — россыпью
    capture: (t, { step: n = 1 }) => {
      for (let k = 0; k < Math.max(1, Math.min(6, n)); k++) {
        grain(t + k * 0.06, 0.02, { f0: 2600, f1: 1400, q: 1, peak: 0.1, attack: 0.001, release: 0.015 });
        tock(360, t + k * 0.06, { peak: 0.07, decay: 0.03 });
      }
    },
    king: (t) => {
      bell(freqOf(0), t, { peak: 0.14, decay: 0.6 });
      bell(freqOf(7), t + 0.1, { peak: 0.12, decay: 0.8 });
    },
    must: (t) => thud(160, t, { peak: 0.18, decay: 0.14, slide: 0.85 }),
    undo: (t) => swoosh(t, 2000, 600, 0.2, 0.05),
    hint: (t) => plip(freqOf(7), t, { peak: 0.12, decay: 0.08 }),
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.14, decay: 0.7 })),
    lose: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.2, { peak: 0.15, decay: 0.6 })),
    draw: (t) => {
      bell(freqOf(0), t, { peak: 0.12, decay: 0.5 });
      bell(freqOf(0), t + 0.25, { peak: 0.1, decay: 0.7 });
    },
    click: (t) => wood(t, 320, 0.06),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
