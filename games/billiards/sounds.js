// Звуки бильярда — из shared/sfx.js, мягкие: без резких щелчков, громкость — от силы удара.
//   удар кием — глухой «ток»; шар о шар — короткий костяной стук (тише удар — тише и ниже); борт — мягкий «бум»;
//   шар в лузе — два стука вниз и шорох; биток поставлен с руки — «плип»; фол — два низких «бума»;
//   определились группы — два колокольчика; смена бьющего — тихий «плип»; победа и поражение — колокольчики.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { v }) — v: сила 0…1 (cue, ball, cushion, pocket).

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['cue', 'ball', 'cushion', 'pocket', 'place', 'foul', 'group', 'turn', 'win', 'lose', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, thud } = createSfx(ctx, { volume: 0.55 });
  const level = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  const play = {
    cue: (t, { v = 0.5 }) => {
      const k = level(v);
      tock(170 + 60 * k, t, { peak: 0.1 + 0.16 * k, decay: 0.06 });
      grain(t, 0.012, { f0: 1500, q: 0.8, peak: 0.02 + 0.04 * k, attack: 0.002, release: 0.01 });
    },
    ball: (t, { v = 0.5 }) => {
      const k = level(v);
      tock(620 + 380 * k, t, { peak: 0.03 + 0.15 * k, decay: 0.028 });
      grain(t, 0.008, { f0: 2100, f1: 1500, q: 1, peak: 0.01 + 0.035 * k, attack: 0.001, release: 0.007 });
    },
    cushion: (t, { v = 0.5 }) => thud(120 + 40 * level(v), t, { peak: 0.04 + 0.12 * level(v), decay: 0.09, slide: 0.8 }),
    pocket: (t, { v = 0.5 }) => {
      const k = level(v);
      tock(230, t, { peak: 0.1 + 0.08 * k, decay: 0.06 });
      tock(150, t + 0.07, { peak: 0.12, decay: 0.09 });
      grain(t + 0.05, 0.18, { f0: 700, f1: 300, q: 0.7, peak: 0.035, attack: 0.03, release: 0.12 });
    },
    place: (t) => plip(freqOf(-5), t, { peak: 0.08, decay: 0.07 }),
    foul: (t) => {
      thud(170, t, { peak: 0.16, decay: 0.12, slide: 0.85 });
      thud(140, t + 0.14, { peak: 0.14, decay: 0.15, slide: 0.85 });
    },
    group: (t) => {
      bell(freqOf(0), t, { peak: 0.12, decay: 0.5 });
      bell(freqOf(7), t + 0.1, { peak: 0.11, decay: 0.7 });
    },
    turn: (t) => plip(freqOf(-12), t, { peak: 0.06, decay: 0.08 }),
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.14, decay: 0.7 })),
    lose: (t) => [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.2, { peak: 0.15, decay: 0.6 })),
    click: (t) => tock(320, t, { peak: 0.06, decay: 0.05 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
