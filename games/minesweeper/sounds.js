// Звуки сапёра — мягкие, без звона и шипения (из shared/sfx.js):
//   открыть клетку — глухой «тк» с шорохом травы, высота чуть гуляет; пустота раскрылась — тихий выдох и
//   несколько низких «бупов» вверх по пентатонике (больше область — больше нот, не больше пяти); флажок —
//   «фьють» ткани и круглый «буп», снять — то же вниз; «?» — тихий «плип»; аккорд — два «тк»; нельзя (флажков
//   не столько, сколько цифра; касание флажка) — глухой «тук»; мина — низкий приглушённый «бум» (тон с
//   падением и шум только ниже 500 Гц — без треска), остальные мины — тихие «туки»; победа — тёплый аккорд и
//   колокольчики, поражение — низкий тихий аккорд; подсказка — два «плипа»; новая партия — шелест.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['open', 'cascade', 'flag', 'unflag', 'mark', 'chord', 'blocked', 'boom', 'mine', 'win', 'lose', 'hint', 'start', 'mode', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bup, plip, thud, swoosh, pad, bell, rustle } = createSfx(ctx, { volume: 0.55 });
  const wobble = (k = 0.08) => 1 + (Math.random() - 0.5) * k;

  const play = {
    open: (t) => {
      tock(720 * wobble(), t, { peak: 0.1, decay: 0.045 });
      grain(t, 0.018, { f0: 1700 * wobble(0.2), q: 0.8, peak: 0.022, attack: 0.002, release: 0.02 });
    },
    cascade: (t, { count = 10 }) => {
      tock(640 * wobble(), t, { peak: 0.09, decay: 0.05 });
      swoosh(t, 600, 1700, 0.28, 0.035);
      const notes = Math.max(2, Math.min(5, Math.round(Math.log2(count + 1))));
      for (let k = 0; k < notes; k++) bup(freqOf(pentaStep(k) - 12), t + 0.05 + k * 0.055, { peak: 0.05, decay: 0.09, drop: 1.4 });
    },
    flag: (t) => {
      grain(t, 0.05, { f0: 1300, f1: 2600, q: 0.9, peak: 0.045, attack: 0.006, release: 0.02 });
      bup(freqOf(-5) * wobble(0.04), t + 0.03, { peak: 0.13, decay: 0.1, drop: 1.6 });
    },
    unflag: (t) => {
      grain(t, 0.045, { f0: 2600, f1: 1300, q: 0.9, peak: 0.035, attack: 0.006, release: 0.02 });
      bup(freqOf(-9), t + 0.02, { peak: 0.08, decay: 0.08, drop: 1.3 });
    },
    mark: (t) => plip(freqOf(7), t, { peak: 0.05, decay: 0.05 }),
    chord: (t) => {
      tock(820 * wobble(), t, { peak: 0.08, decay: 0.04 });
      tock(980 * wobble(), t + 0.05, { peak: 0.07, decay: 0.04 });
    },
    blocked: (t) => thud(170, t, { peak: 0.1, decay: 0.1 }),
    boom: (t) => {
      thud(95, t, { peak: 0.32, decay: 0.6, slide: 0.45 });
      grain(t, 0.45, { f0: 480, f1: 150, q: 0.5, peak: 0.16, attack: 0.004, release: 0.4 });
      tock(60, t + 0.02, { peak: 0.2, decay: 0.3 });
    },
    mine: (t) => tock(170 * wobble(0.2), t, { peak: 0.06, decay: 0.07 }),
    win: (t) => {
      pad([freqOf(-12), freqOf(-8), freqOf(-5), freqOf(-1)], t, { peak: 0.045, attack: 0.2, decay: 1.8 });
      [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + 0.08 + k * 0.1, { peak: 0.07, decay: 0.9 }));
    },
    lose: (t) => pad([freqOf(-24), freqOf(-21), freqOf(-17)], t, { peak: 0.035, attack: 0.3, decay: 1.6, cutoff: 900 }),
    hint: (t) => [0, 7].forEach((s, k) => plip(freqOf(s + 7), t + k * 0.07, { peak: 0.06, decay: 0.07 })),
    start: (t) => rustle(t, 0.3, { peak: 0.045, from: 1500, to: 3000 }),
    mode: (t) => tock(900, t, { peak: 0.07, decay: 0.035 }),
    click: (t) => plip(freqOf(12), t, { peak: 0.06, decay: 0.04 }),
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
