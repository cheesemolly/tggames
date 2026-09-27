// Звуки «Крестиков-ноликов» — простые (просьба владельца, 2026-09-27), из shared/sfx.js:
//   крестик — лёгкий высокий «плип», нолик — чуть ниже и круглее («буп»); примерка хода на большом поле —
//   тихий щелчок; выигрышная линия — «вжух» и колокольчики вверх; поражение — ноты вниз; ничья — два тихих
//   колокольчика; отмена — шорох назад; окна — щелчок.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['x', 'o', 'ghost', 'win', 'lose', 'draw', 'undo', 'click', 'start'];

export function createSounds(ctx) {
  const { now, plip, bup, bell, swoosh, tock } = createSfx(ctx, { volume: 0.5 });

  const play = {
    x: (t) => plip(freqOf(7), t, { peak: 0.2, decay: 0.1 }),
    o: (t) => bup(freqOf(0), t, { peak: 0.22, decay: 0.12, drop: 1.5 }),
    ghost: (t) => tock(900, t, { peak: 0.04, decay: 0.03 }),
    win: (t) => {
      swoosh(t, 800, 4000, 0.3, 0.06);
      [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + 0.15 + k * 0.09, { peak: 0.12, decay: 0.8 }));
    },
    lose: (t) => [7, 4, 0, -5].forEach((s, k) => bell(freqOf(s - 5), t + k * 0.15, { peak: 0.08, decay: 0.5 })),
    draw: (t) => {
      bell(freqOf(0), t, { peak: 0.08, decay: 0.6 });
      bell(freqOf(0), t + 0.18, { peak: 0.07, decay: 0.6 });
    },
    undo: (t) => swoosh(t, 3000, 900, 0.18, 0.05),
    click: (t) => plip(freqOf(12), t, { peak: 0.08, decay: 0.04 }),
    start: (t) => [0, 7].forEach((s, k) => plip(freqOf(s), t + k * 0.08, { peak: 0.1, decay: 0.07 })),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (!fn) return;
      fn(now(), opts);
    },
  };
}
