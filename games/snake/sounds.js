// Звуки «Змейки» — аркадные, 8-битные (просьба владельца, 2026-09-26: «при съедении еды — ням, гриба — yuk!,
// остальное на твоё усмотрение, должно подходить под аркады»). Из общих кирпичиков shared/sfx.js.
//   еда — «ням» (синтез голоса: пила через форманты «н-я-м») с хрустом укуса; высота чуть гуляет, чтобы сотый
//   «ням» не звучал как первый; бургер — «ням-ням» и монетка; бонусная еда — «ням» и аркадная «монетка»;
//   ядовитый гриб — «юк!» (формант «ю» → «у» и резкое «к»), недовольно и ниже;
//   усилители — 8-битные: магнит — вой вверх, замедление — «вау-вау» вниз, щит — аккорд, ×2 — двойная монетка;
//   щит спас — металлический «бонг»; портал — «вжух» тона вверх-вниз; кирпич — сухой щелчок;
//   старт — «пи-пи-пиу»; пауза — два «пика»; смерть — аркадное «ва-ва-ва-ваа» вниз и шум удара;
//   уровень пройден — 8-битная фанфара.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { createSfx, freqOf } from '../../shared/sfx.js';

export const SOUNDS = [
  'nom', 'burger', 'bonus', 'yuk', 'magnet', 'slow', 'shield', 'double', 'saved', 'portal', 'brick',
  'start', 'pause', 'die', 'level', 'click',
];

export function createSounds(ctx) {
  const { now, chip, voice, grain, thud } = createSfx(ctx, { volume: 0.6 });
  const wobble = () => 0.94 + Math.random() * 0.12;        // «ням» каждый раз чуть другой

  /** «Ням»: н — рот закрыт, я — открывается (F2 высоко → ниже), м — закрывается. */
  const nom = (t, { pitch = 1, peak = 0.22 } = {}) => {
    grain(t, 0.025, { f0: 2200, f1: 1200, q: 1, peak: 0.08, attack: 0.002, release: 0.015 });     // хрусть
    voice(t + 0.01, {
      dur: 0.2,
      pitch: [270 * pitch, 235 * pitch],
      peak,
      marks: [[0, 280, 1500], [0.05, 700, 1900], [0.11, 760, 1300], [0.2, 260, 900]],
    });
  };

  /** Аркадная монетка: две ноты квадратной волной — вторая выше. */
  const coin = (t, { up = 12, peak = 0.06 } = {}) => {
    chip(freqOf(19), t, { dur: 0.06, peak });
    chip(freqOf(19 + up), t + 0.06, { dur: 0.16, peak });
  };

  const play = {
    nom: (t) => nom(t, { pitch: wobble() }),
    burger: (t) => {
      nom(t, { pitch: 0.92, peak: 0.24 });
      nom(t + 0.22, { pitch: 1.05, peak: 0.24 });
      coin(t + 0.42, { peak: 0.05 });
    },
    bonus: (t) => {
      nom(t, { pitch: 1.1 });
      coin(t + 0.2);
    },
    // «юк!»: й-у, тон вниз (недовольно), в конце — резкое «к»
    yuk: (t) => {
      voice(t, {
        dur: 0.19,
        pitch: [230, 165],
        peak: 0.24,
        marks: [[0, 300, 2200], [0.05, 330, 900], [0.19, 300, 750]],
      });
      grain(t + 0.19, 0.025, { f0: 2400, q: 1.2, peak: 0.12, attack: 0.001, release: 0.012 });
    },
    magnet: (t) => chip(freqOf(-5), t, { dur: 0.3, slideTo: freqOf(19), type: 'triangle', peak: 0.1 }),
    slow: (t) => {
      chip(freqOf(7), t, { dur: 0.18, slideTo: freqOf(0), peak: 0.06 });
      chip(freqOf(3), t + 0.2, { dur: 0.25, slideTo: freqOf(-7), peak: 0.06 });
    },
    shield: (t) => [0, 4, 7, 12].forEach((s, k) => chip(freqOf(s + 7), t + k * 0.05, { dur: 0.12, type: 'triangle', peak: 0.09 })),
    double: (t) => {
      coin(t);
      coin(t + 0.2, { up: 7 });
    },
    // щит спас от удара — металлический «бонг»
    saved: (t) => {
      chip(freqOf(-5), t, { dur: 0.35, slideTo: freqOf(-8), type: 'triangle', peak: 0.14 });
      chip(freqOf(6), t, { dur: 0.25, peak: 0.04 });
    },
    // портал — «вжух»: тон взлетает и падает
    portal: (t) => {
      chip(freqOf(-7), t, { dur: 0.1, slideTo: freqOf(17), type: 'triangle', peak: 0.08 });
      chip(freqOf(17), t + 0.1, { dur: 0.1, slideTo: freqOf(0), type: 'triangle', peak: 0.06 });
    },
    brick: (t) => chip(freqOf(-17), t, { dur: 0.05, peak: 0.07, cutoff: 1500 }),
    // старт забега: «пи-пи-пиу»
    start: (t) => {
      chip(freqOf(7), t, { dur: 0.07, peak: 0.06 });
      chip(freqOf(7), t + 0.12, { dur: 0.07, peak: 0.06 });
      chip(freqOf(19), t + 0.24, { dur: 0.16, peak: 0.07 });
    },
    pause: (t) => {
      chip(freqOf(12), t, { dur: 0.05, peak: 0.05 });
      chip(freqOf(7), t + 0.08, { dur: 0.06, peak: 0.05 });
    },
    // смерть: удар и «ва-ва-ва-ваа» вниз
    die: (t) => {
      thud(140, t, { peak: 0.28, decay: 0.2, slide: 0.6 });
      grain(t, 0.12, { f0: 900, f1: 300, q: 0.7, peak: 0.1, attack: 0.002, release: 0.08 });
      [7, 5, 3].forEach((s, k) => chip(freqOf(s), t + 0.2 + k * 0.17, { dur: 0.15, slideTo: freqOf(s - 1), peak: 0.07 }));
      chip(freqOf(0), t + 0.71, { dur: 0.45, slideTo: freqOf(-7), peak: 0.07 });
    },
    // уровень: 8-битная фанфара
    level: (t) => {
      [0, 4, 7, 12, 7, 12].forEach((s, k) => chip(freqOf(s), t + k * 0.09, { dur: 0.08, peak: 0.07 }));
      chip(freqOf(16), t + 0.56, { dur: 0.35, peak: 0.08 });
      chip(freqOf(4), t + 0.56, { dur: 0.35, type: 'triangle', peak: 0.08 });
    },
    click: (t) => chip(freqOf(12), t, { dur: 0.03, peak: 0.04 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
