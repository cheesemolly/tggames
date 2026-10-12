// Звуки «Баскетбола» — мягкие, «зальные»: сетка шуршит, дужка глухо звякает, мяч стукается о стену. Чистое
// попадание — «шух» и нота, которая с каждым чистым подряд выше; мяч загорелся — «вжух» вверх и аккорд.
// Всё из shared/sfx.js; дужка, стена и натяжение звучат часто, поэтому они низкие и короткие.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { n, v, power }) — n: серия чистых (swish), v: скорость удара (rim, wall), power: сила 0…1 (pull, shoot).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['pull', 'shoot', 'wall', 'rim', 'net', 'score', 'swish', 'bank', 'ignite', 'blue', 'fizzle', 'back', 'miss',
  'record', 'click'];

export function createSounds(ctx) {
  const { now, bell, plip, bup, chip, swoosh, thud, rustle, tock } = createSfx(ctx, { volume: 0.5 });
  const wobble = (f, by = 0.04) => f * (1 - by + Math.random() * by * 2);
  /** Насколько v между lo и hi: 0…1 (мусор — 0). */
  const amount = (v, lo, hi) => Math.max(0, Math.min(1, ((Number(v) || 0) - lo) / (hi - lo)));

  const play = {
    // сетку тянут: тихий «тук» — чем сильнее натянута, тем выше
    pull: (t, { power = 0 } = {}) => tock(150 + 130 * amount(power, 0, 1), t, { peak: 0.07, decay: 0.05 }),
    // бросок: сетка хлопает, мяч уходит
    shoot: (t, { power = 0.5 } = {}) => {
      const p = amount(power, 0, 1);
      swoosh(t, 500, 1300 + 500 * p, 0.14, 0.05 + 0.03 * p);
      bup(wobble(freqOf(-17)), t, { peak: 0.2, decay: 0.09, drop: 1.6 });
    },
    // стена: глухой стук мяча — чем быстрее летел, тем громче
    wall: (t, { v = 400 } = {}) => thud(wobble(118), t, { peak: 0.12 + 0.18 * amount(v, 60, 900), decay: 0.12, slide: 0.7 }),
    // дужка: короткий глухой «донг»
    rim: (t, { v = 300 } = {}) => {
      const p = amount(v, 60, 900);
      bell(wobble(freqOf(-9), 0.04), t, { peak: 0.05 + 0.12 * p, decay: 0.22 });
      tock(190, t, { peak: 0.06 + 0.1 * p, decay: 0.05 });
    },
    // мяч задел сетку снаружи
    net: (t) => rustle(t, 0.1, { peak: 0.04, from: 1500, to: 2300 }),
    // попал, задев кольцо: мяч плюхается в сетку
    score: (t) => {
      rustle(t, 0.16, { peak: 0.06, from: 1900, to: 1100 });
      bup(freqOf(-10), t + 0.01, { peak: 0.22, decay: 0.12 });
    },
    // чисто: «шух» сетки и нота — с каждым чистым подряд выше
    swish: (t, { n = 1 } = {}) => {
      swoosh(t, 2600, 900, 0.22, 0.09);
      const step = Math.max(0, Math.min(9, Math.round(Number(n) || 1) - 1));
      bell(freqOf(pentaStep(step) - 12), t + 0.03, { peak: 0.16, decay: 0.5 });
    },
    // с отскоком от стены: вторая нота вдогонку
    bank: (t) => plip(freqOf(7), t, { peak: 0.12, decay: 0.12 }),
    // мяч загорелся: «вжух» вверх и аккорд
    ignite: (t) => {
      swoosh(t, 320, 1500, 0.45, 0.1);
      [0, 4, 7].forEach((s, i) => bell(freqOf(s), t + 0.05 + i * 0.07, { peak: 0.12, decay: 0.6 }));
    },
    // синее пламя: выше и звонче
    blue: (t) => {
      swoosh(t, 500, 2200, 0.5, 0.1);
      [4, 7, 12, 16].forEach((s, i) => bell(freqOf(s), t + 0.05 + i * 0.06, { peak: 0.11, decay: 0.7 }));
    },
    // огонь погас: «пш-ш»
    fizzle: (t) => {
      swoosh(t, 1900, 380, 0.32, 0.07);
      plip(freqOf(-12), t + 0.02, { up: false, peak: 0.08, decay: 0.14 });
    },
    // упал обратно в свою корзину
    back: (t) => {
      rustle(t, 0.12, { peak: 0.05, from: 1700, to: 1100 });
      plip(freqOf(-7), t, { up: false, peak: 0.13, decay: 0.12 });
    },
    // мимо: «фью-у» вниз
    miss: (t) => chip(freqOf(8), t, { dur: 0.6, slideTo: freqOf(-15), type: 'triangle', peak: 0.09, cutoff: 1500 }),
    record: (t) => [0, 4, 7, 12].forEach((s, i) => bell(freqOf(s), t + i * 0.09, { peak: 0.13, decay: 0.55 })),
    click: (t) => plip(freqOf(5), t, { peak: 0.09, decay: 0.05 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
