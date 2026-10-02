// Звуки го — как камни на деревянной доске, мягко (из shared/sfx.js):
//   камень — сухой «пачи»: короткий звонкий щелчок раковины/сланца о доску и глухой отзвук дерева, высота каждый
//   раз чуть гуляет; камень соперника чуть ниже; взятие — камни ссыпаются в крышку чаши: несколько тихих
//   щелчков по числу взятых (не больше 6); пас — шорох; примерка хода — едва слышный щелчок; нельзя — глухой
//   «бум»; подсчёт — тихий тёплый аккорд; победа — колокольчики вверх, поражение — вниз; окна — щелчок.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['stone', 'capture', 'pass', 'ghost', 'illegal', 'start', 'score', 'win', 'lose', 'draw', 'undo', 'hint', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, thud, plip, swoosh, pad, rustle } = createSfx(ctx, { volume: 0.55 });
  const wobble = () => 1 + (Math.random() - 0.5) * 0.1;

  const clack = (t, low = false, peak = 0.22) => {
    const k = wobble();
    tock((low ? 1050 : 1250) * k, t, { peak: peak * 0.7, decay: 0.035 });
    grain(t, 0.012, { f0: 4200 * k, q: 1.4, peak: peak * 0.35, attack: 0.0008, release: 0.012 });
    tock((low ? 190 : 220) * k, t + 0.004, { peak: peak * 0.8, decay: 0.07 });
  };

  const play = {
    stone: (t, { opponent = false }) => clack(t, opponent),
    capture: (t, { count = 1 }) => {
      const n = Math.max(1, Math.min(6, count));
      for (let k = 0; k < n; k++) {
        const at = t + 0.12 + k * (0.05 + Math.random() * 0.03);
        tock((1500 + Math.random() * 500), at, { peak: 0.06, decay: 0.025 });
        grain(at, 0.01, { f0: 5000, q: 1.2, peak: 0.03, attack: 0.0008, release: 0.01 });
      }
    },
    pass: (t) => rustle(t, 0.28, { peak: 0.05, from: 1800, to: 3200 }),
    ghost: (t) => tock(1400, t, { peak: 0.035, decay: 0.02 }),
    illegal: (t) => thud(140, t, { peak: 0.16, decay: 0.14 }),
    start: (t) => {
      clack(t, false, 0.16);
      clack(t + 0.15, true, 0.16);
    },
    score: (t) => pad([freqOf(-12), freqOf(-5), freqOf(4)], t, { peak: 0.05, attack: 0.25, decay: 1.6 }),
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.1, decay: 1 })),
    lose: (t) => [7, 4, 0, -5].forEach((s, k) => bell(freqOf(s - 5), t + k * 0.16, { peak: 0.08, decay: 0.6 })),
    draw: (t) => {
      bell(freqOf(0), t, { peak: 0.08, decay: 0.7 });
      bell(freqOf(0), t + 0.2, { peak: 0.07, decay: 0.7 });
    },
    undo: (t) => swoosh(t, 3000, 900, 0.18, 0.05),
    hint: (t) => [0, 7].forEach((s, k) => plip(freqOf(s + 12), t + k * 0.07, { peak: 0.07, decay: 0.08 })),
    click: (t) => plip(freqOf(12), t, { peak: 0.07, decay: 0.04 }),
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
