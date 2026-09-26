// Звуки Brick Blast — аркадные (просьба владельца, 2026-09-26), из shared/sfx.js.
//   бросок — «фьють» очереди шариков; удар о блок — короткий «тик» (высота гуляет по пентатонике, чтобы
//   сотни ударов звучали россыпью, а не пулемётом; в игре — не чаще раза в 45 мс); блок разбит — «поп»,
//   крепкие блоки ниже и сочнее; лазер — «пью» вниз; «×3» — перелив вверх; «разброс» — «боинг»;
//   «вернуть шарики» — шорох вниз; ряд сдвинулся — глухой «дум»; блоки у дна — тревожное «пи-пу»;
//   уровень пройден — фанфара; проигрыш — ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.
// play(name, { step }) — step: прочность разбитого блока (break).

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['shoot', 'hit', 'break', 'laser', 'triple', 'scatter', 'recall', 'shift', 'danger', 'win', 'lose', 'click'];

export function createSounds(ctx) {
  const { now, chip, bup, bell, swoosh, thud } = createSfx(ctx, { volume: 0.5 });
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const play = {
    shoot: (t) => {
      swoosh(t, 900, 2600, 0.14, 0.05);
      chip(freqOf(0), t, { dur: 0.08, slideTo: freqOf(12), type: 'triangle', peak: 0.06 });
    },
    // удар: короткий «тик» треугольной волной
    hit: (t) => chip(freqOf(pentaStep(pick([5, 6, 7, 8, 9]))), t, { dur: 0.025, type: 'triangle', peak: 0.05 }),
    // разбит: «поп»; прочнее блок — ниже и громче
    break: (t, { step: hp = 10 }) => {
      const tier = Math.max(0, Math.min(4, Math.floor(hp / 40)));
      bup(freqOf(12 - tier * 3) * (0.95 + Math.random() * 0.1), t, { peak: 0.14 + tier * 0.02, decay: 0.08 + tier * 0.02, drop: 1.8 });
    },
    laser: (t) => chip(freqOf(24), t, { dur: 0.16, slideTo: freqOf(5), peak: 0.045 }),
    triple: (t) => [0, 4, 7, 12, 16].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.05, { dur: 0.06, peak: 0.05 })),
    scatter: (t) => chip(freqOf(-5), t, { dur: 0.18, slideTo: freqOf(7), type: 'triangle', peak: 0.08 }),
    recall: (t) => swoosh(t, 2400, 600, 0.25, 0.07),
    shift: (t) => thud(110, t, { peak: 0.16, decay: 0.14, slide: 0.8 }),
    // опасно: блоки у дна
    danger: (t) => {
      chip(freqOf(7), t, { dur: 0.1, peak: 0.05 });
      chip(freqOf(0), t + 0.13, { dur: 0.14, peak: 0.05 });
    },
    win: (t) => {
      [0, 4, 7, 12].forEach((s, k) => chip(freqOf(s), t + k * 0.08, { dur: 0.07, peak: 0.05 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.34, { peak: 0.1, decay: 1 }));
    },
    lose: (t) => {
      [7, 3, 0].forEach((s, k) => chip(freqOf(s - 5), t + k * 0.18, { dur: 0.15, slideTo: freqOf(s - 6), peak: 0.05 }));
      thud(110, t + 0.55, { peak: 0.2, decay: 0.35, slide: 0.7 });
    },
    click: (t) => chip(freqOf(12), t, { dur: 0.03, peak: 0.035 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
