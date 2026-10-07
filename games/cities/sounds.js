// Звуки «Городов» — из shared/sfx.js, мягкие, «дорожные»:
//   клавиша — тихий деревянный «ток» (тон чуть гуляет, чтобы набор не звучал пулемётом), стирание — «ток» ниже;
//   город принят — три колокольчика вверх и шорох полёта; город бота — два колокольчика пониже;
//   не тот город — два мягких «бума»; подсказка — россыпь вверх; тик таймера — «плип» (на последних секундах выше);
//   победа — аккорд и колокольчики, поражение — три ноты вниз; кнопки и окна — «клик».
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер клавиши (key) или сколько секунд осталось (tick).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['key', 'erase', 'accept', 'bot', 'error', 'hint', 'tick', 'win', 'lose', 'click', 'pick'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, swoosh, thud, pad } = createSfx(ctx, { volume: 0.5 });

  const knock = (t, freq, peak = 0.1) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.01, { f0: 1500, q: 0.8, peak: peak * 0.2, attack: 0.002, release: 0.008 });
  };
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));

  const play = {
    key: (t, { step = 0 }) => knock(t, 250 + (int(step, 0, 99) % 5) * 14, 0.07),
    erase: (t) => knock(t, 170, 0.07),
    accept: (t) => {
      [2, 4, 6].forEach((s, k) => bell(freqOf(pentaStep(s)), t + k * 0.07, { peak: 0.13, decay: 0.6 }));
      swoosh(t + 0.05, 600, 1500, 0.5, 0.03);
    },
    bot: (t) => {
      [3, 1].forEach((s, k) => bell(freqOf(pentaStep(s) - 12), t + k * 0.1, { peak: 0.14, decay: 0.6 }));
      swoosh(t + 0.05, 500, 1200, 0.5, 0.025);
    },
    error: (t) => {
      thud(170, t, { peak: 0.15, decay: 0.12, slide: 0.85 });
      thud(150, t + 0.13, { peak: 0.13, decay: 0.14, slide: 0.85 });
    },
    hint: (t) => [0, 2, 4, 7].forEach((s, k) => bell(freqOf(pentaStep(s + 2)), t + k * 0.05, { peak: 0.08, decay: 0.4 })),
    tick: (t, { step = 10 }) => plip(freqOf(int(step, 0, 60) <= 3 ? 7 : 0), t, { peak: 0.07, decay: 0.06 }),
    win: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.4 });
      [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.13, decay: 0.7 }));
    },
    lose: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.2, { peak: 0.14, decay: 0.6 })),
    click: (t) => knock(t, 320, 0.06),
    pick: (t) => knock(t, 360, 0.07),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
