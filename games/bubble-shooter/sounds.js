// Звуки «Шариков» — аркадные (просьба владельца, 2026-09-26), из shared/sfx.js.
//   выстрел — «пью» и «блуп» цветом шара (у каждого цвета своя нота); отскок от стены — «тинь»;
//   шар встал, ничего не лопнув, — мягкий «плюп»; лопание — «попы» волной, каждый следующий чуть выше
//   (step — номер в волне); цепь слетела — металлический «дзынь»; повисшие падают — «вжух» вниз и «плюхи»;
//   бомба — «бум» и треск; огонь — треск горения; радуга — перелив; смена шаров — «вжик»; бонус взведён / снят —
//   щелчок вверх / вниз; бонус за серию — перелив-награда; комбо — по ступеням анимации (×2–3, ×4–5, ×6–8, ×9+);
//   новый уровень — поле спускается «вжух»; победа — фанфара; проигрыш — ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step, color, tier }) — color: номер цвета шара, step: номер в волне, tier: ступень комбо.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'shoot', 'bounce', 'stick', 'pop', 'chain', 'drop', 'bomb', 'burn', 'rainbow', 'swap', 'arm', 'disarm',
  'reward', 'combo', 'level', 'win', 'lose', 'click',
];

/** Нота цвета шара: 6 цветов — 6 ступеней пентатоники. */
export const colorNote = (color) => pentaStep(((color % 6) + 6) % 6);

export function createSounds(ctx) {
  const { now, bup, plip, chip, bell, swoosh, grain, thud } = createSfx(ctx, { volume: 0.55 });

  const play = {
    shoot: (t, { color = 0 }) => {
      swoosh(t, 900, 2800, 0.12, 0.05);
      bup(freqOf(colorNote(color) - 5), t, { peak: 0.16, decay: 0.08, drop: 0.6 });     // тон вверх — «блуп»
    },
    bounce: (t) => chip(freqOf(24), t, { dur: 0.03, type: 'triangle', peak: 0.05 }),
    stick: (t, { color = 0 }) => bup(freqOf(colorNote(color) - 12), t, { peak: 0.16, decay: 0.08, drop: 1.4 }),
    // лопнул: «поп», по волне выше
    pop: (t, { step: k = 0 }) => bup(freqOf(pentaStep(Math.min(12, k)) - 2) * (0.97 + Math.random() * 0.06), t, { peak: 0.12, decay: 0.06, drop: 2.2 }),
    chain: (t) => {
      chip(freqOf(26), t, { dur: 0.04, type: 'square', peak: 0.03 });
      chip(freqOf(31), t + 0.03, { dur: 0.06, type: 'triangle', peak: 0.05 });
    },
    // повисшие падают: «вжух» вниз и «плюхи»
    drop: (t, { step: n = 3 }) => {
      swoosh(t, 2200, 500, 0.35, 0.05);
      for (let k = 0; k < Math.min(5, n); k++) bup(freqOf(-10 - k * 2), t + 0.15 + k * 0.06, { peak: 0.08, decay: 0.07, drop: 1.4 });
    },
    bomb: (t) => {
      thud(70, t, { peak: 0.32, decay: 0.35, slide: 0.5 });
      grain(t, 0.3, { f0: 1500, f1: 300, q: 0.5, peak: 0.12, attack: 0.002, release: 0.25 });
    },
    burn: (t) => grain(t, 0.07, { f0: 2500 + Math.random() * 1500, f1: 900, q: 0.8, peak: 0.06, attack: 0.002, release: 0.05 }),
    rainbow: (t) => [0, 2, 4, 7, 9, 12, 14].forEach((s, k) => chip(freqOf(s + 12), t + k * 0.035, { dur: 0.05, type: 'triangle', peak: 0.045 })),
    swap: (t) => chip(freqOf(5), t, { dur: 0.09, slideTo: freqOf(17), type: 'triangle', peak: 0.06 }),
    arm: (t) => {
      plip(freqOf(7), t, { peak: 0.12, decay: 0.05 });
      plip(freqOf(14), t + 0.06, { peak: 0.12, decay: 0.06 });
    },
    disarm: (t) => {
      plip(freqOf(14), t, { up: false, peak: 0.1, decay: 0.05 });
      plip(freqOf(7), t + 0.06, { up: false, peak: 0.1, decay: 0.06 });
    },
    reward: (t) => {
      [0, 4, 7, 12].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.06, { dur: 0.06, peak: 0.05 }));
      bell(freqOf(26), t + 0.26, { peak: 0.1, decay: 0.6 });
    },
    // комбо — по ступеням, как анимация
    combo: (t, { tier = 1 }) => {
      bell(freqOf(7), t, { peak: 0.14, decay: 0.45 });
      bell(freqOf(12), t + 0.07, { peak: 0.12, decay: 0.5 });
      if (tier >= 2) [16, 19].forEach((s, k) => bell(freqOf(s), t + 0.14 + k * 0.07, { peak: 0.1, decay: 0.5 }));
      if (tier >= 3) [0, 4, 7, 12, 16, 19].forEach((s, k) => chip(freqOf(s + 12), t + 0.25 + k * 0.04, { dur: 0.05, peak: 0.04 }));
      if (tier >= 4) {
        [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 19), t + 0.55, { peak: 0.09, decay: 1.2 }));
        grain(t + 0.5, 0.4, { f0: 3000, f1: 8000, q: 0.5, peak: 0.04, attack: 0.1, release: 0.25 });
      }
    },
    level: (t) => swoosh(t, 3000, 800, 0.4, 0.05),
    win: (t) => {
      [0, 4, 7, 12, 7, 12].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.08, { dur: 0.07, peak: 0.055 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 19), t + 0.5, { peak: 0.09, decay: 1.2 }));
    },
    lose: (t) => {
      [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.22, { peak: 0.18, decay: 0.5 }));
      thud(130, t + 0.66, { peak: 0.2, decay: 0.4, slide: 0.7 });
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.1, decay: 0.04 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
