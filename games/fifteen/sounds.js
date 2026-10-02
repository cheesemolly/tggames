// Звуки пятнашек — деревянные и тихие (из shared/sfx.js):
//   ход — мягкий «тк» деревянной плитки о рамку (высота чуть гуляет); несколько плиток разом — быстрые «тк» по одной
//   на плитку (не больше пяти); нельзя — глухой «тук»; ряд или столбец встал на место — тихий «плип» (выше с номером
//   ряда); отмена — шорох назад; перемешивание — шорох и россыпь «тк»; собрано — тёплый аккорд и колокольчики
//   снизу вверх; окна — щелчок.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['move', 'multi', 'blocked', 'line', 'undo', 'shuffle', 'win', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, plip, thud, swoosh, pad, bell, rustle } = createSfx(ctx, { volume: 0.55 });
  const wobble = (k = 0.08) => 1 + (Math.random() - 0.5) * k;

  const clack = (t, peak = 0.13) => {
    tock(560 * wobble(), t, { peak, decay: 0.05 });
    grain(t, 0.014, { f0: 2600 * wobble(0.2), q: 1.2, peak: peak * 0.22, attack: 0.001, release: 0.012 });
  };

  const play = {
    move: (t) => clack(t),
    multi: (t, { count = 2 }) => {
      const n = Math.max(1, Math.min(5, count));
      for (let k = 0; k < n; k++) clack(t + k * 0.035, 0.12 - k * 0.012);
    },
    blocked: (t) => thud(150, t, { peak: 0.12, decay: 0.12 }),
    line: (t, { step = 0 }) => plip(freqOf(pentaStep(Math.min(8, step)) + 7), t + 0.05, { peak: 0.06, decay: 0.1 }),
    undo: (t) => swoosh(t, 2400, 900, 0.16, 0.04),
    shuffle: (t) => {
      rustle(t, 0.35, { peak: 0.04, from: 1400, to: 2800 });
      for (let k = 0; k < 6; k++) clack(t + 0.05 + k * 0.05 + Math.random() * 0.02, 0.06);
    },
    win: (t) => {
      pad([freqOf(-12), freqOf(-8), freqOf(-5), freqOf(-1)], t, { peak: 0.045, attack: 0.22, decay: 1.9 });
      [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s), t + 0.08 + k * 0.1, { peak: 0.06, decay: 0.9 }));
    },
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
