// Звуки мастерской — тихие и «настольные»: свой маленький синтез (синусы и треугольники, шум — только мягким
// «воздухом» через фильтр), лёгкое эхо комнаты и срезанный верх.
//   фен — тёплый поток воздуха; прогрелось — тихий колокольчик; присоска — «чпок»;
//   отвёртка — мелкие щелчки трещотки (выкрутить — вверх, закрутить — вниз и тугой щелчок), винт на коврик — «динь»;
//   шлейф — защёлка (снять — выше, вставить — ниже); искра — короткий низкий треск и гул, без визга;
//   пинцет — «вжух», деталь на место — мягкий стук, новая деталь — блеск;
//   кисточка — шорох, спирт — шипение, чисто — искорки; лупа — стекло;
//   зарядка — две ноты вверх (заряжается) или вниз (нет); включение — мелодия, глухая у пыльного динамика и
//   хриплый щелчок у порванного; выключение — вниз; антивирус — «скан», жук — «буп», реклама — «плип»;
//   прошивка — тики и аккорд; сдать — тёплый аккорд и звёзды по одной; возврат — мягкий «бум».
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { freqOf } from '../../shared/sfx.js';

export const SOUNDS = [
  'click', 'tool', 'flip', 'heat', 'heated', 'suction', 'unscrew', 'screw', 'clink', 'unplug', 'plug', 'spark', 'lift',
  'place', 'newpart', 'scrub', 'fizz', 'clean', 'inspect', 'charge', 'nocharge', 'boot', 'off', 'blink', 'scan',
  'squash', 'ad', 'flash', 'flashed', 'deliver', 'star', 'return', 'error', 'hint',
];

export function createSounds(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 5500;
  tone.Q.value = 0.5;
  tone.connect(comp);
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(tone);
  // комната: короткое затухающее эхо
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.09;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1800;
  damp.Q.value = 0.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.2;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  master.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(wet);
  wet.connect(tone);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const now = () => ctx.currentTime + 0.005;
  const wobble = (k = 0.06) => 1 + (Math.random() - 0.5) * k;

  function env(t, peak, decay, attack = 0.004, out = master) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }

  /** Синус (или треугольник) с огибающей; slide — тон за миг съезжает от freq*slide к freq. */
  function sine(freq, t, { peak = 0.1, decay = 0.3, attack = 0.004, slide = 1, type = 'sine', out = master } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * slide, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq, t + Math.max(0.02, attack * 6));
    o.connect(env(t, peak, decay, attack, out));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** Короткий щелчок: треугольник через фильтр, без звона. */
  function tick(freq, t, { peak = 0.08, decay = 0.025 } = {}) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq * 2.5;
    f.Q.value = 0.7;
    o.connect(f);
    f.connect(env(t, peak, decay, 0.001));
    o.start(t);
    o.stop(t + decay + 0.04);
  }

  /** Воздух: шум через полосовой фильтр, частота едет from → to. */
  function air(t, dur, from, to, peak = 0.04, q = 0.9) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    s.connect(f);
    f.connect(env(t, peak, dur * 0.65, dur * 0.35));
  }

  /** Стекло/колокольчик: чистый тон с неровным обертоном. */
  function glass(freq, t, { peak = 0.05, decay = 0.6 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.005 });
    sine(freq * 2.76, t, { peak: peak * 0.18, decay: decay * 0.4, attack: 0.004 });
  }

  /** Мягкий стук: низкий треугольник с быстрым спадом. */
  function knock(freq, t, { peak = 0.12, decay = 0.08 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.002, slide: 1.5, type: 'triangle' });
  }

  /** Тёплый аккорд: медленная атака, долгое затухание. */
  function chord(freqs, t, { peak = 0.03, attack = 0.2, decay = 1.6 } = {}) {
    for (const f of freqs) for (const d of [1, 1.004]) sine(f * d, t, { peak, decay, attack });
  }

  /** Мелодия включения: у пыльного динамика глухая (через низкий фильтр), у порванного — хрип и тишина. */
  function boot(t, quality) {
    if (quality === 'none') {
      tick(140, t, { peak: 0.06, decay: 0.05 });
      air(t + 0.03, 0.12, 300, 200, 0.02, 2);
      return;
    }
    let out = master;
    if (quality === 'quiet') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 450;
      f.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.45;
      f.connect(g);
      g.connect(master);
      out = f;
    }
    [0, 4, 7, 12].forEach((st, k) => sine(freqOf(st - 5), t + k * 0.11, { peak: 0.08, decay: 0.5, out }));
    sine(freqOf(7), t + 0.44, { peak: 0.05, decay: 0.9, attack: 0.02, out });
  }

  const play = {
    click: (t) => sine(freqOf(7), t, { peak: 0.05, decay: 0.05, slide: 0.8 }),
    tool: (t) => {
      tick(900 * wobble(), t, { peak: 0.05 });
      sine(freqOf(12), t + 0.01, { peak: 0.03, decay: 0.08 });
    },
    flip: (t) => air(t, 0.28, 400, 1400, 0.035, 0.8),
    heat: (t) => air(t, 0.3, 700, 900, 0.03, 0.6),
    heated: (t) => glass(freqOf(9), t, { peak: 0.04, decay: 0.5 }),
    suction: (t) => {
      sine(160, t, { peak: 0.12, decay: 0.09, slide: 0.6 });
      air(t + 0.05, 0.25, 2500, 700, 0.025, 1.2);
      knock(240, t + 0.25, { peak: 0.06 });
    },
    unscrew: (t) => {
      for (let k = 0; k < 6; k++) tick((1100 + k * 70) * wobble(0.04), t + k * 0.055, { peak: 0.05 });
    },
    screw: (t) => {
      for (let k = 0; k < 6; k++) tick((1450 - k * 70) * wobble(0.04), t + k * 0.055, { peak: 0.05 });
      knock(330, t + 0.36, { peak: 0.08, decay: 0.05 });
    },
    clink: (t) => glass(freqOf(19) * wobble(0.03), t, { peak: 0.035, decay: 0.25 }),
    unplug: (t) => {
      tick(1300, t, { peak: 0.09 });
      sine(freqOf(2), t + 0.01, { peak: 0.03, decay: 0.06 });
    },
    plug: (t) => {
      tick(900, t, { peak: 0.1 });
      knock(280, t + 0.015, { peak: 0.06, decay: 0.05 });
    },
    spark: (t) => {
      air(t, 0.16, 2400, 900, 0.07, 3);
      sine(110, t, { peak: 0.09, decay: 0.3, type: 'triangle' });
      sine(117, t + 0.01, { peak: 0.06, decay: 0.28, type: 'triangle' });
      for (let k = 0; k < 4; k++) tick(1800 * wobble(0.3), t + k * 0.03, { peak: 0.05, decay: 0.015 });
    },
    lift: (t) => air(t, 0.14, 600, 1700, 0.03, 1.1),
    place: (t) => knock(210 * wobble(), t, { peak: 0.11, decay: 0.08 }),
    newpart: (t) => {
      knock(230, t, { peak: 0.09, decay: 0.07 });
      [12, 16, 19, 24].forEach((st, k) => glass(freqOf(st), t + 0.06 + k * 0.06, { peak: 0.03, decay: 0.5 }));
    },
    scrub: (t) => air(t, 0.12, 1800 * wobble(0.2), 1200, 0.03, 1.5),
    fizz: (t) => air(t, 0.18, 3000, 2200, 0.02, 2),
    clean: (t) => [19, 24, 28].forEach((st, k) => glass(freqOf(st), t + k * 0.07, { peak: 0.03, decay: 0.4 })),
    inspect: (t) => glass(freqOf(14), t, { peak: 0.04, decay: 0.45 }),
    charge: (t) => {
      tick(900, t, { peak: 0.08 });
      glass(freqOf(4), t + 0.12, { peak: 0.05, decay: 0.4 });
      glass(freqOf(11), t + 0.26, { peak: 0.05, decay: 0.6 });
    },
    nocharge: (t) => {
      tick(900, t, { peak: 0.08 });
      sine(freqOf(-5), t + 0.14, { peak: 0.07, decay: 0.2 });
      sine(freqOf(-10), t + 0.3, { peak: 0.07, decay: 0.35 });
    },
    boot: (t, { quality = 'ok' }) => boot(t, quality),
    off: (t) => [7, 2, -5].forEach((st, k) => sine(freqOf(st), t + k * 0.08, { peak: 0.05, decay: 0.25 })),
    blink: (t) => {
      sine(freqOf(0), t, { peak: 0.05, decay: 0.12 });
      sine(freqOf(-12), t + 0.25, { peak: 0.06, decay: 0.4, slide: 1.4 });
    },
    scan: (t) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freqOf(-5), t);
      o.frequency.exponentialRampToValueAtTime(freqOf(7), t + 0.9);
      o.connect(env(t, 0.04, 0.6, 0.35));
      o.start(t);
      o.stop(t + 1);
    },
    squash: (t) => {
      sine(freqOf(-2) * wobble(0.1), t, { peak: 0.13, decay: 0.12, slide: 1.9 });
      tick(500, t, { peak: 0.04 });
    },
    ad: (t) => sine(freqOf(9) * wobble(0.05), t, { peak: 0.08, decay: 0.1, slide: 0.72 }),
    flash: (t, { k = 0 }) => sine(freqOf((k % 5) * 2), t, { peak: 0.035, decay: 0.07 }),
    flashed: (t) => chord([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.03, attack: 0.08, decay: 1.2 }),
    deliver: (t) => chord([freqOf(-17), freqOf(-12), freqOf(-8), freqOf(-5)], t, { peak: 0.03, attack: 0.25, decay: 2 }),
    star: (t, { k = 0 }) => glass(freqOf([12, 16, 19][k % 3]), t, { peak: 0.05, decay: 0.8 }),
    return: (t) => {
      sine(120, t, { peak: 0.13, decay: 0.2, slide: 1.35, type: 'triangle' });
      knock(90, t + 0.1, { peak: 0.08, decay: 0.12 });
    },
    error: (t) => {
      sine(150, t, { peak: 0.1, decay: 0.12, slide: 1.3, type: 'triangle' });
    },
    hint: (t) => glass(freqOf(16), t, { peak: 0.045, decay: 0.5 }),
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
