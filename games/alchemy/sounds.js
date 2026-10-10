// Звуки «Алхимии» — из shared/sfx.js, мягкие, «стеклянные»:
//   элемент лёг в котёл — «буль» (второй выше первого); убран — «буль» вниз; смешивание — тихий шорох-вихрь;
//   новый элемент — колокольчики вверх (чем дальше элемент от стартовых, тем их больше); новая пара — два «плипа»;
//   уже открыто — тихий стук; ничего не вышло — два мягких «бума»; запечатано — глухой колокол;
//   задание выполнено — короткая фанфара; подсказка — шорох и «блёстка»; новое звание — аккорд и перелив;
//   дар — долгий перелив вверх; «клик» — кнопки, окна и вкладки.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: номер ячейки котла (pick) или слой элемента (new).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['pick', 'drop', 'swirl', 'new', 'recipe', 'known', 'fail', 'sealed', 'quest', 'hint', 'rank', 'gift', 'click'];

export function createSounds(ctx) {
  const { now, tock, grain, bell, plip, bup, swoosh, thud, pad } = createSfx(ctx, { volume: 0.5 });
  const int = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n) || 0));

  const play = {
    pick: (t, { step = 0 }) => bup(freqOf(int(step, 0, 1) ? 4 : -3), t, { peak: 0.12, decay: 0.1, drop: 1.5 }),
    drop: (t) => plip(freqOf(-5), t, { up: false, peak: 0.07, decay: 0.09 }),
    swirl: (t) => swoosh(t, 500, 1700, 0.22, 0.035),
    new: (t, { step = 1 }) => {
      const notes = int(step, 1, 10) > 5 ? [0, 4, 7, 12, 16] : int(step, 1, 10) > 2 ? [0, 4, 7, 12] : [0, 7, 12];
      notes.forEach((s, k) => bell(freqOf(s), t + k * 0.07, { peak: 0.13, decay: 0.7 }));
      grain(t, 0.25, { f0: 2200, f1: 4200, q: 1.5, peak: 0.02, attack: 0.02, release: 0.2 });
    },
    recipe: (t) => {
      plip(freqOf(pentaStep(4)), t, { peak: 0.11, decay: 0.1 });
      plip(freqOf(pentaStep(6)), t + 0.08, { peak: 0.11, decay: 0.14 });
    },
    known: (t) => tock(360, t, { peak: 0.06, decay: 0.06 }),
    fail: (t) => {
      thud(180, t, { peak: 0.12, decay: 0.11, slide: 0.85 });
      thud(150, t + 0.12, { peak: 0.1, decay: 0.13, slide: 0.85 });
    },
    sealed: (t) => {
      bell(freqOf(-17), t, { peak: 0.13, decay: 0.9 });
      thud(120, t, { peak: 0.08, decay: 0.2, slide: 0.9 });
    },
    quest: (t) => [0, 4, 7, 12, 16].forEach((s, k) => bell(freqOf(s + 2), t + k * 0.08, { peak: 0.12, decay: 0.7 })),
    hint: (t) => {
      swoosh(t, 700, 2200, 0.25, 0.04);
      bell(freqOf(16), t + 0.2, { peak: 0.11, decay: 0.6 });
    },
    rank: (t) => {
      pad([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.05, attack: 0.1, decay: 1.6 });
      [0, 4, 7, 12, 16, 19].forEach((s, k) => bell(freqOf(s), t + 0.1 + k * 0.09, { peak: 0.12, decay: 0.9 }));
    },
    gift: (t) => {
      pad([freqOf(-10), freqOf(-3), freqOf(2), freqOf(9)], t, { peak: 0.05, attack: 0.2, decay: 2 });
      [2, 5, 9, 14, 17, 21, 26].forEach((s, k) => bell(freqOf(s), t + 0.15 + k * 0.11, { peak: 0.1, decay: 1 }));
    },
    click: (t) => {
      tock(320, t, { peak: 0.06, decay: 0.05 });
      grain(t, 0.01, { f0: 1500, q: 0.8, peak: 0.012, attack: 0.002, release: 0.008 });
    },
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts ?? {});
    },
  };
}
