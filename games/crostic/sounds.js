// Звуки «Кростика» — из shared/sfx.js, мягкие, «карандашные»:
//   клетка выбрана — тихий стук; буква угадана — «плип» (чем больше клеток открылось, тем выше) с колокольчиком;
//   ошибка — два мягких «бума»; вопрос отвечен — три колокольчика вверх; подсказка — шорох и «блёстка»;
//   монеты — два звонких «плипа»; звезда — «динь» (каждая выше); уровень пройден — аккорд и фанфара;
//   попытки кончились — три ноты вниз; «клик» — кнопки и окна.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: сколько клеток открылось (hit), номер звезды (star).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['select', 'hit', 'miss', 'word', 'hint', 'coin', 'star', 'win', 'fail', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, swoosh, thud, pad } = createSfx(ctx, { volume: 0.5 });
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));
  const knock = (t, freq, peak = 0.07) => {
    tock(freq, t, { peak, decay: 0.05 });
    grain(t, 0.01, { f0: 1500, q: 0.8, peak: peak * 0.2, attack: 0.002, release: 0.008 });
  };

  const play = {
    select: (t) => tock(420, t, { peak: 0.035, decay: 0.04 }),
    hit: (t, { step = 1 }) => {
      const n = int(step, 1, 8);
      plip(freqOf(pentaStep(n + 1)), t, { peak: 0.13, decay: 0.12 });
      bell(freqOf(pentaStep(n + 3)), t + 0.05, { peak: 0.06, decay: 0.4 });
    },
    miss: (t) => {
      thud(170, t, { peak: 0.14, decay: 0.12, slide: 0.85 });
      thud(150, t + 0.13, { peak: 0.12, decay: 0.14, slide: 0.85 });
    },
    word: (t) => [4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.08, { peak: 0.12, decay: 0.6 })),
    hint: (t) => {
      swoosh(t, 700, 2200, 0.25, 0.04);
      bell(freqOf(16), t + 0.2, { peak: 0.11, decay: 0.6 });
    },
    coin: (t) => {
      plip(freqOf(19), t, { peak: 0.09, decay: 0.08 });
      plip(freqOf(24), t + 0.07, { peak: 0.09, decay: 0.12 });
    },
    star: (t, { step = 0 }) => bell(freqOf([7, 12, 16][int(step, 0, 2)]), t, { peak: 0.14, decay: 0.7 }),
    win: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.5 });
      [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.12, decay: 0.8 }));
    },
    fail: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.18, { peak: 0.13, decay: 0.6 })),
    click: (t) => knock(t, 320, 0.06),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
