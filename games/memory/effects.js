// Звуковые эффекты Мемори (просьба владельца, 2026-09-26: «у карт должны быть звуки перелистывания карт или
// что-то похожее»). Не путать с sounds.js — там звуки набора картинок «Звуки» (их угадывают).
// Карта — картон: открыть — сухой «фрр-т» (короткий шум, тон которого едет вниз, плюс лёгкий «тук» самой карты),
// закрыть — тише и короче; раздача и «Подглядеть» — веер щелчков, будто колоду пролистывают большим пальцем;
// «Вихрь» — тасовка (riffle): две половины колоды сыплются друг в друга. Пара — щелчок и мягкое двузвучие
// (комбо — выше), золото — звон монеток, сердце — «тук-тук», часы — «тик-так», джокер — перелив вверх.
// Из общих кирпичиков shared/sfx.js. createEffects(ctx) принимает готовый AudioContext — в тестах поддельный.

import { createSfx, freqOf, pentaStep } from '../../shared/sfx.js';

export const EFFECTS = [
  'flip', 'unflip', 'deal', 'fan', 'shuffle', 'match', 'miss', 'gold', 'heart', 'clock', 'joker',
  'magnet', 'win', 'fail', 'click',
];

export function createEffects(ctx) {
  const { now, grain, tock, bell, bup, swoosh, thud } = createSfx(ctx);

  /** Щелчок карты: «фрр-т» картона. soft — закрыть (тише, выше, короче). */
  const flick = (t, { soft = false, peak = 0.13 } = {}) => {
    const f0 = (soft ? 2600 : 3400) * (0.9 + Math.random() * 0.2);
    grain(t, soft ? 0.022 : 0.034, { f0, f1: f0 * 0.55, q: 0.9, peak: soft ? peak * 0.6 : peak, attack: 0.002, release: 0.018 });
    tock(soft ? 270 : 240, t + 0.004, { peak: soft ? 0.03 : 0.05, decay: 0.03 });
  };

  /** Веер: count щелчков подряд, чуть неровно, к концу тише (пролистывание колоды). */
  const riffle = (t, count, { gap = 0.028, peak = 0.09 } = {}) => {
    const n = Math.max(3, Math.min(24, count));
    for (let k = 0; k < n; k++) flick(t + k * gap + Math.random() * gap * 0.35, { soft: k % 2 === 1, peak: peak * (1 - (k / n) * 0.4) });
  };

  const play = {
    flip: (t) => flick(t),
    unflip: (t, { step: n = 1 }) => {
      for (let k = 0; k < Math.max(1, Math.min(4, n)); k++) flick(t + k * 0.05, { soft: true });
    },
    // раздача: карты ложатся волной (step — число карт)
    deal: (t, { step: n = 12 }) => riffle(t + 0.05, Math.ceil(n / 2), { gap: 0.045, peak: 0.08 }),
    // все карты открываются или закрываются разом («Подглядеть», «Глаз», показ в начале)
    fan: (t, { step: n = 12 }) => riffle(t, Math.ceil(n / 2), { gap: 0.02, peak: 0.07 }),
    // «Вихрь»: тасовка — две половины колоды сыплются друг в друга и «прижимаются»
    shuffle: (t) => {
      swoosh(t, 1200, 3200, 0.2, 0.04);
      riffle(t + 0.1, 20, { gap: 0.018, peak: 0.08 });
      tock(200, t + 0.55, { peak: 0.1, decay: 0.06 });
    },
    // пара (или тройка): щелчок и мягкое двузвучие; комбо — выше по пентатонике
    match: (t, { step: combo = 1 }) => {
      flick(t, { peak: 0.08 });
      const s = pentaStep(Math.max(0, Math.min(8, combo - 1)));
      bell(freqOf(s), t + 0.02, { peak: 0.16, decay: 0.45 });
      bell(freqOf(s + 7), t + 0.09, { peak: 0.13, decay: 0.55 });
    },
    // промах с ошибкой — мягкий низкий «бум»
    miss: (t) => thud(190, t, { peak: 0.2, decay: 0.16, slide: 0.8 }),
    // бонусные карточки
    gold: (t) => {
      [28, 31, 33, 36, 31].forEach((s, k) => bell(freqOf(s), t + k * 0.045, { peak: 0.08, decay: 0.3 }));
    },
    heart: (t) => {
      bup(freqOf(-17), t, { peak: 0.24, decay: 0.12, drop: 1.4 });
      bup(freqOf(-19), t + 0.16, { peak: 0.18, decay: 0.14, drop: 1.4 });
    },
    clock: (t) => {
      for (let k = 0; k < 4; k++) tock(k % 2 ? 900 : 1200, t + k * 0.12, { peak: 0.08, decay: 0.03 });
    },
    joker: (t) => {
      swoosh(t, 800, 5000, 0.35, 0.05);
      [12, 16, 19, 24, 28].forEach((s, k) => bell(freqOf(s), t + 0.05 + k * 0.05, { peak: 0.09, decay: 0.4 }));
    },
    // «Магнит»: карточки притягиваются — шорох и «щёлк»
    magnet: (t) => {
      swoosh(t, 600, 2400, 0.22, 0.06);
      flick(t + 0.22);
    },
    win: (t) => {
      riffle(t, 10, { gap: 0.025, peak: 0.06 });
      [0, 4, 7].forEach((s, k) => bell(freqOf(s), t + 0.3 + k * 0.09, { peak: 0.2, decay: 0.5 }));
      [0, 4, 7, 12].forEach((s) => bell(freqOf(s + 12), t + 0.6, { peak: 0.12, decay: 1.2 }));
    },
    fail: (t) => {
      [7, 3, 0].forEach((s, k) => bell(freqOf(s - 12), t + k * 0.22, { peak: 0.18, decay: 0.5 }));
      thud(130, t + 0.66, { peak: 0.2, decay: 0.4, slide: 0.7 });
    },
    click: (t) => flick(t, { soft: true, peak: 0.08 }),
  };

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (fn) fn(now(), opts);
    },
  };
}
