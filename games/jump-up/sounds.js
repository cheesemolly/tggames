// Звуки «Прыгалки вверх» — мягкие, «бумажные»: прыжок — круглый «пум», пружинка — «боинг» вверх, ластик — резиновый
// «бум» с подъёмом, карандашная платформа хрустит, пунктирная стирается ластиком, клякса чавкает. Всё из
// shared/sfx.js; прыжок звучит каждую секунду, поэтому он самый тихий и короткий, а высота чуть гуляет.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { kind, n }) — kind: 'plane' | 'rocket' (fly), n: цифра отсчёта (count).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['jump', 'spring', 'eraser', 'crumble', 'vanish', 'back', 'stomp', 'fly', 'flyend', 'shield', 'shieldend',
  'hit', 'fall', 'hole', 'record', 'click', 'count'];

export function createSounds(ctx) {
  const { now, bell, plip, bup, chip, swoosh, thud, grain, rub, rustle, tock } = createSfx(ctx, { volume: 0.5 });
  const wobble = (f, by = 0.04) => f * (1 - by + Math.random() * by * 2);

  const play = {
    jump: (t) => bup(wobble(freqOf(-7)), t, { peak: 0.2, decay: 0.09, drop: 1.7 }),
    // пружинка: «боинг» — тон едет вверх
    spring: (t) => {
      bup(freqOf(-12), t, { peak: 0.24, decay: 0.1 });
      chip(freqOf(-12), t + 0.02, { dur: 0.2, slideTo: freqOf(7), type: 'triangle', peak: 0.11, cutoff: 1800 });
    },
    // ластик: ниже и длиннее, резиновый
    eraser: (t) => {
      thud(105, t, { peak: 0.3, decay: 0.16, slide: 0.7 });
      chip(freqOf(-19), t + 0.03, { dur: 0.32, slideTo: freqOf(5), type: 'triangle', peak: 0.12, cutoff: 1500 });
    },
    // карандашная платформа: сухой хруст
    crumble: (t) => {
      grain(t, 0.06, { f0: 2200, f1: 900, q: 0.9, peak: 0.08, attack: 0.003, release: 0.03 });
      tock(170, t + 0.01, { peak: 0.16, decay: 0.07 });
      tock(120, t + 0.07, { peak: 0.1, decay: 0.07 });
    },
    // пунктирную стёрло ластиком
    vanish: (t) => rub(t, 2, { peak: 0.06, len: 0.045 }),
    // …и нарисовало снова: короткий штрих
    back: (t) => grain(t, 0.07, { f0: 2600, f1: 3400, q: 1.5, peak: 0.035, attack: 0.01, release: 0.02 }),
    // раздавил кляксу: чавк
    stomp: (t) => {
      bup(150, t, { peak: 0.3, decay: 0.13, drop: 2.2 });
      plip(freqOf(-2), t + 0.06, { up: false, peak: 0.14, decay: 0.1 });
    },
    // взлёт: самолётик шелестит, карандаш гудит
    fly: (t, { kind } = {}) => {
      if (kind === 'rocket') {
        swoosh(t, 260, 900, 0.7, 0.1);
        chip(freqOf(-24), t, { dur: 0.6, slideTo: freqOf(-7), type: 'triangle', peak: 0.1, cutoff: 1200 });
        return;
      }
      rustle(t, 0.4, { peak: 0.07, from: 1200, to: 2600 });
      chip(freqOf(-5), t, { dur: 0.3, slideTo: freqOf(7), type: 'triangle', peak: 0.08, cutoff: 1800 });
    },
    flyend: (t) => plip(freqOf(0), t, { up: false, peak: 0.12, decay: 0.12 }),
    shield: (t) => {
      bell(freqOf(7), t, { peak: 0.13, decay: 0.5 });
      bell(freqOf(12), t + 0.09, { peak: 0.11, decay: 0.6 });
    },
    shieldend: (t) => plip(freqOf(-5), t, { up: false, peak: 0.1, decay: 0.14 }),
    // врезался во врага
    hit: (t) => {
      thud(140, t, { peak: 0.3, decay: 0.18, slide: 0.6 });
      chip(freqOf(3), t + 0.04, { dur: 0.32, slideTo: freqOf(-10), type: 'triangle', peak: 0.1, cutoff: 1400 });
    },
    // сорвался: «фью-у-у» вниз
    fall: (t) => chip(freqOf(10), t, { dur: 0.62, slideTo: freqOf(-14), type: 'triangle', peak: 0.09, cutoff: 1600 }),
    // затянуло в дырку
    hole: (t) => {
      swoosh(t, 1400, 240, 0.6, 0.09);
      chip(freqOf(5), t, { dur: 0.7, slideTo: freqOf(-24), type: 'triangle', peak: 0.09, cutoff: 1400 });
    },
    record: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.09, { peak: 0.13, decay: 0.55 })),
    click: (t) => plip(freqOf(5), t, { peak: 0.09, decay: 0.05 }),
    // отсчёт после паузы: n = 3, 2, 1 — «пип», n = 0 — поехали
    count: (t, { n = 3 } = {}) => (n > 0
      ? plip(freqOf(2), t, { peak: 0.13, decay: 0.09 })
      : plip(freqOf(9), t, { peak: 0.16, decay: 0.16 })),
  };

  return {
    has: (name) => name in play,
    play(name, opts) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
