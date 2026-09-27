// Звуки шахмат — как у деревянной доски, мягко (из shared/sfx.js):
//   ход — деревянный «ток» фигуры о доску (у соперника чуть ниже); взятие — «ток» плотнее и сухой щелчок;
//   рокировка — два «тока» подряд; шах — короткий тихий колокольчик; превращение — перелив вверх;
//   нельзя так ходить — глухой «бум»; начало партии — два «тока»; победа — колокольчики вверх,
//   поражение — ноты вниз, ничья — два одинаковых; окна — щелчок.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = ['move', 'capture', 'castle', 'check', 'promote', 'illegal', 'start', 'win', 'lose', 'draw', 'click', 'select'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, thud, plip } = createSfx(ctx, { volume: 0.55 });

  const knock = (t, f, peak = 0.26) => {
    tock(f, t, { peak, decay: 0.08 });
    grain(t, 0.018, { f0: 2600, q: 0.8, peak: 0.05, attack: 0.001, release: 0.015 });
  };

  const play = {
    move: (t, { opponent = false }) => knock(t, opponent ? 250 : 290),
    capture: (t, { opponent = false }) => {
      knock(t, opponent ? 210 : 240, 0.32);
      grain(t + 0.012, 0.05, { f0: 1500, q: 0.6, peak: 0.08, attack: 0.001, release: 0.04 });
    },
    castle: (t) => {
      knock(t, 280);
      knock(t + 0.13, 250);
    },
    check: (t) => bell(freqOf(12), t + 0.04, { peak: 0.08, decay: 0.45 }),
    promote: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s + 7), t + k * 0.06, { peak: 0.07, decay: 0.5 })),
    illegal: (t) => thud(140, t, { peak: 0.18, decay: 0.14 }),
    start: (t) => {
      knock(t, 300, 0.2);
      knock(t + 0.16, 300, 0.2);
    },
    win: (t) => [0, 4, 7, 12].forEach((s, k) => bell(freqOf(s), t + k * 0.1, { peak: 0.1, decay: 1 })),
    lose: (t) => [7, 4, 0, -5].forEach((s, k) => bell(freqOf(s - 5), t + k * 0.16, { peak: 0.08, decay: 0.6 })),
    draw: (t) => {
      bell(freqOf(0), t, { peak: 0.08, decay: 0.7 });
      bell(freqOf(0), t + 0.2, { peak: 0.07, decay: 0.7 });
    },
    click: (t) => plip(freqOf(12), t, { peak: 0.07, decay: 0.04 }),
    select: (t) => tock(420, t, { peak: 0.06, decay: 0.03 }),
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
