// Звуки кубика — пластик и тишина (из shared/sfx.js):
//   поворот — сухой «клац» слоя (глухой тон + короткий шорох трения, высота гуляет), пол-оборота — два «клаца»;
//   перемешивание — те же щелчки, только тише; таймер пошёл — едва слышный «тик»; осмотр 8 и 12 с — мягкий «плип»;
//   отмена — шорох назад; собрано — тёплый аккорд и колокольчики снизу вверх; окна — щелчок.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['turn', 'half', 'scramble', 'start', 'beep', 'undo', 'solved', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, plip, swoosh, pad, bell } = createSfx(ctx, { volume: 0.55 });
  const wobble = (k = 0.1) => 1 + (Math.random() - 0.5) * k;

  const clack = (t, peak = 0.12) => {
    tock(300 * wobble(), t, { peak, decay: 0.045 });
    grain(t, 0.03, { f0: 2400 * wobble(0.25), q: 1.4, peak: peak * 0.3, attack: 0.002, release: 0.025 });
  };

  const play = {
    turn: (t) => clack(t),
    half: (t) => {
      clack(t);
      clack(t + 0.07, 0.1);
    },
    scramble: (t) => clack(t, 0.06),
    start: (t) => plip(freqOf(19), t, { peak: 0.035, decay: 0.05 }),
    beep: (t) => plip(freqOf(12), t, { peak: 0.06, decay: 0.12 }),
    undo: (t) => swoosh(t, 2200, 900, 0.14, 0.035),
    solved: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.045, attack: 0.2, decay: 2 });
      [0, 4, 7, 12, 16, 19].forEach((s, k) => bell(freqOf(s), t + 0.06 + k * 0.09, { peak: 0.055, decay: 0.9 }));
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.05, decay: 0.04 }),
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
