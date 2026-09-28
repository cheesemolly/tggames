// Звуки пасьянсов (Паук, Косынка) — как у настоящих карт на столе (из shared/sfx.js, без мелодий там, где их нет у карт):
//   взял — лёгкое скольжение; положил — «шлёп» картона о сукно (короткий шум + мягкий удар корпуса), на пустое место —
//   глуше; карта открылась — «фрр-т»; раздача — щелчки в такт анимации (count карт через step мс); собрана масть —
//   13 карт одна за другой с ускорением и тихий колокольчик; карта в «дом» (Косынка) — шлепок и тихий тон, выше с
//   достоинством; колода перевёрнута — шорох и «прижим»; отмена — скольжение назад; нельзя — глухой «тук»; новая партия —
//   тасовка (riffle) и «прижим» колоды; подсказка — тихий «плип»; победа — каскад карт и тёплый аккорд.
// Высота и громкость каждого щелчка чуть гуляют — как вживую.
// createCardSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf, pentaStep } from './sfx.js';

export const CARD_SOUNDS = [
  'pick', 'place', 'placeEmpty', 'flip', 'deal', 'complete', 'foundation', 'recycle', 'undo', 'illegal', 'shuffle', 'hint', 'win', 'click',
];

export function createCardSounds(ctx) {
  const { now, grain, tock, bell, thud, plip, swoosh, pad } = createSfx(ctx, { volume: 0.6 });
  const vary = (x, amount = 0.15) => x * (1 - amount + Math.random() * amount * 2);

  /** Щелчок карты: сухой «фрр-т» картона. */
  const flick = (t, { peak = 0.11, soft = false } = {}) => {
    const f0 = vary(soft ? 2800 : 3600);
    grain(t, soft ? 0.024 : 0.034, { f0, f1: f0 * 0.55, q: 0.9, peak: vary(soft ? peak * 0.6 : peak, 0.2), attack: 0.002, release: 0.018 });
  };

  /** Карта легла: шум полосой 1,8–3 кГц и мягкий удар корпуса, тон едет вниз. */
  const slap = (t, { peak = 0.16, muffled = false } = {}) => {
    grain(t, 0.04, { f0: vary(muffled ? 1300 : 2400), f1: muffled ? 900 : 1700, q: 1, peak: vary(muffled ? peak * 0.7 : peak, 0.2), attack: 0.0015, release: 0.03 });
    tock(vary(muffled ? 150 : 185, 0.08), t + 0.002, { peak: muffled ? 0.06 : 0.09, decay: 0.035 });
  };

  /** Скольжение карты по сукну. */
  const slide = (t, { up = true, peak = 0.05, dur = 0.09 } = {}) => {
    grain(t, dur, { f0: up ? 1300 : 3800, f1: up ? 3800 : 1300, q: 0.7, peak, attack: 0.008, release: 0.04 });
  };

  /** Тасовка: половины колоды сыплются друг в друга (щелчки с разбросом), потом колоду прижимают. */
  const riffle = (t, count = 36) => {
    for (let k = 0; k < count; k++) {
      const x = k / count;
      const env = Math.sin(Math.PI * Math.min(1, x * 1.15)) * 0.8 + 0.2;     // нарастает и стихает
      grain(t + k * 0.013 + Math.random() * 0.005, 0.012, { f0: vary(4500), f1: 3000, q: 2, peak: 0.07 * env, attack: 0.001, release: 0.008 });
    }
    swoosh(t + count * 0.013, 2400, 900, 0.35, 0.05);
    tock(170, t + count * 0.013 + 0.3, { peak: 0.1, decay: 0.07 });
  };

  const play = {
    pick: (t) => slide(t, { peak: 0.04, dur: 0.06 }),
    place: (t) => slap(t),
    placeEmpty: (t) => slap(t, { muffled: true }),
    flip: (t) => {
      flick(t, { soft: true, peak: 0.08 });
      flick(t + 0.035, { peak: 0.11 });
    },
    // раздача: по щелчку на карту — в такт анимации (count карт, step — интервал, мс)
    deal: (t, { step = 55, count = 10 }) => {
      for (let k = 0; k < Math.min(count, 40); k++) {
        slide(t + (k * step) / 1000, { peak: 0.035, dur: 0.05 });
        slap(t + (k * step) / 1000 + 0.05, { peak: 0.09 });
      }
    },
    // собрана масть (Паук): 13 карт одна за другой, всё быстрее, и тихий колокольчик
    complete: (t) => {
      let at = t;
      for (let k = 0; k < 13; k++) {
        flick(at, { peak: 0.08 + k * 0.002 });
        at += Math.max(0.018, 0.05 - k * 0.003);
      }
      bell(freqOf(12), at + 0.05, { peak: 0.1, decay: 0.8 });
      bell(freqOf(19), at + 0.12, { peak: 0.08, decay: 0.9 });
    },
    // карта в «дом» (Косынка): шлепок и тихий тон — чем старше карта, тем выше (rank 1…13)
    foundation: (t, { rank = 1 }) => {
      slap(t, { peak: 0.13 });
      bell(freqOf(pentaStep(Math.max(0, Math.min(12, rank - 1)))), t + 0.02, { peak: 0.06, decay: 0.5 });
    },
    // колода перевёрнута (сброс — обратно в колоду): шорох и «прижим»
    recycle: (t) => {
      swoosh(t, 3200, 1100, 0.28, 0.06);
      for (let k = 0; k < 6; k++) flick(t + 0.03 + k * 0.025, { soft: true, peak: 0.06 });
      tock(175, t + 0.3, { peak: 0.09, decay: 0.06 });
    },
    undo: (t) => slide(t, { up: false, peak: 0.05 }),
    illegal: (t) => thud(150, t, { peak: 0.18, decay: 0.14 }),
    shuffle: (t) => riffle(t),
    hint: (t) => plip(freqOf(7), t, { peak: 0.12, decay: 0.12 }),
    win: (t) => {
      riffle(t, 48);
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t + 0.5, { peak: 0.07, attack: 0.3, decay: 2.4, cutoff: 1800 });
      [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + 0.7 + k * 0.12, { peak: 0.09, decay: 1 }));
    },
    click: (t) => tock(420, t, { peak: 0.06, decay: 0.03 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
