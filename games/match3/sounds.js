// Звуки «Три в ряд» — мягкие, «дорогие», без аркадных 8-бит (владелец, 2026-09-27: «звуки не понравились, сделай
// получше, не как в аркадах»). Свой маленький синтез: только синусы с быстрой атакой и плавным затуханием,
// шум — лишь как мягкий «воздух» через фильтр; всё проходит через лёгкое эхо «комнаты» и срезанный верх.
//   маримба — фишки лопаются: с каждым звеном каскада нота выше по пентатонике (каскад звучит мелодией);
//   стекло — выбор, новые спецфишки, призма, лёд, цепи, сундук, открытие уровня;
//   воздух — обмен, ракета, пропеллер, перемешивание; деревянный стук — ящики, приземление, таймер;
//   бомба — глубокий приглушённый «бум»; победа — мелодия маримбы на тёплом аккорде, поражение — ноты вниз.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = [
  'select', 'swap', 'bad', 'pop', 'create', 'rocket', 'bomb', 'propeller', 'prism', 'combo', 'ice', 'crate', 'steel',
  'chain', 'slime', 'grow', 'treasure', 'tick', 'land', 'shuffle', 'bonus', 'win', 'medal', 'lose', 'click', 'booster',
  'unlock',
];

export function createSounds(ctx) {
  // выход: компрессор ← срез верха ← громкость; параллельно — короткое эхо с затуханием («комната»)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 6500;
  tone.Q.value = 0.5;
  tone.connect(comp);
  const master = ctx.createGain();
  master.gain.value = 0.42;
  master.connect(tone);
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.11;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2200;
  damp.Q.value = 0.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
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

  function env(t, peak, decay, attack = 0.004) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }

  /** Синус с огибающей; slide — тон к концу атаки съезжает от freq*slide к freq. */
  function sine(freq, t, { peak = 0.1, decay = 0.3, attack = 0.004, slide = 1, type = 'sine' } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * slide, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq, t + Math.max(0.02, attack * 6));
    o.connect(env(t, peak, decay, attack));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** Маримба: основной тон + тихий 4-й обертон, быстро гаснущий, и лёгкий стук палочки. */
  function marimba(freq, t, { peak = 0.16, decay = 0.5 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.003 });
    sine(freq * 3.98, t, { peak: peak * 0.14, decay: decay * 0.16, attack: 0.002 });
    sine(freq * 2.5, t, { peak: peak * 0.08, decay: 0.03, attack: 0.001 });
  }

  /** Стекло: чистый тон с неровными обертонами (как бокал), мягкая атака. */
  function glass(freq, t, { peak = 0.07, decay = 0.7 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.006 });
    sine(freq * 2.76, t, { peak: peak * 0.22, decay: decay * 0.45, attack: 0.005 });
    sine(freq * 5.4, t, { peak: peak * 0.06, decay: decay * 0.25, attack: 0.004 });
  }

  /** Воздух: шум через мягкий полосовой фильтр, частота которого едет from → to. */
  function air(t, dur, from, to, peak = 0.05, q = 0.8) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    s.connect(f);
    f.connect(env(t, peak, dur * 0.6, dur * 0.4));
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /** Деревянный стук: короткий синус с падением тона через срез верха. */
  function knock(freq, t, { peak = 0.12, decay = 0.07 } = {}) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq * 3;
    o.connect(f);
    f.connect(env(t, peak, decay, 0.002));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** Глубокий мягкий «бум»: низкий синус вниз и приглушённый шорох. */
  function boom(t, { peak = 0.3, decay = 0.6 } = {}) {
    sine(46, t, { peak, decay, attack: 0.006, slide: 2 });
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    s.connect(f);
    f.connect(env(t, peak * 0.5, decay * 0.55, 0.005));
    s.start(t);
    s.stop(t + decay);
  }

  /** Тёплый аккорд с медленной атакой. */
  function chord(freqs, t, { peak = 0.035, attack = 0.25, decay = 1.6 } = {}) {
    for (const f of freqs) sine(f, t, { peak, decay, attack });
  }

  const note = (step, octave = 0) => freqOf(pentaStep(Math.max(0, step)) + octave * 12);

  const play = {
    select: (t) => glass(freqOf(12), t, { peak: 0.045, decay: 0.25 }),
    swap: (t) => air(t, 0.16, 500, 1700, 0.035),
    bad: (t) => {
      marimba(freqOf(-5), t, { peak: 0.1, decay: 0.25 });
      marimba(freqOf(-8), t + 0.1, { peak: 0.09, decay: 0.3 });
    },
    // каскад поднимается по пентатонике: 1-е звено — до, 2-е — ре, 3-е — ми…
    pop: (t, { step = 1 }) => {
      const f = note(step - 1);
      marimba(f, t, { peak: 0.15, decay: 0.45 });
      sine(f * 0.5, t, { peak: 0.05, decay: 0.12, slide: 1.6 });
    },
    create: (t) => [12, 16, 19].forEach((s, k) => glass(freqOf(s), t + k * 0.05, { peak: 0.06, decay: 0.6 })),
    rocket: (t) => {
      air(t, 0.34, 350, 2600, 0.07, 0.9);
      knock(140, t, { peak: 0.09, decay: 0.1 });
    },
    bomb: (t) => boom(t),
    propeller: (t) => {
      for (let k = 0; k < 4; k++) air(t + k * 0.06, 0.08, 700 + k * 200, 1100 + k * 250, 0.03, 2);
      glass(freqOf(19), t + 0.2, { peak: 0.04, decay: 0.4 });
    },
    prism: (t) => {
      [12, 16, 19, 24, 28].forEach((s, k) => glass(freqOf(s), t + k * 0.045, { peak: 0.05, decay: 0.7 }));
      chord([freqOf(0), freqOf(7), freqOf(12)], t, { peak: 0.02, attack: 0.15, decay: 1 });
    },
    combo: (t) => {
      boom(t, { peak: 0.34, decay: 0.8 });
      air(t, 0.5, 300, 3000, 0.06);
      chord([freqOf(0), freqOf(7), freqOf(12), freqOf(16)], t + 0.05, { peak: 0.03, attack: 0.1, decay: 1.4 });
    },
    ice: (t) => {
      glass(freqOf(28), t, { peak: 0.03, decay: 0.18 });
      glass(freqOf(31), t + 0.03, { peak: 0.025, decay: 0.15 });
    },
    crate: (t) => {
      knock(190, t, { peak: 0.14, decay: 0.08 });
      knock(250, t + 0.03, { peak: 0.07, decay: 0.06 });
    },
    steel: (t) => {
      glass(1050, t, { peak: 0.05, decay: 0.35 });
      glass(1470, t, { peak: 0.03, decay: 0.3 });
    },
    chain: (t) => {
      glass(2100, t, { peak: 0.025, decay: 0.12 });
      glass(2520, t + 0.05, { peak: 0.022, decay: 0.12 });
    },
    slime: (t) => sine(freqOf(-17), t, { peak: 0.16, decay: 0.18, slide: 2.2, attack: 0.008 }),
    grow: (t) => {
      sine(freqOf(-20), t, { peak: 0.1, decay: 0.2, slide: 0.6, attack: 0.02 });
      sine(freqOf(-15), t + 0.09, { peak: 0.07, decay: 0.16, slide: 0.7, attack: 0.02 });
    },
    treasure: (t) => {
      [7, 12, 16, 19, 24].forEach((s, k) => glass(freqOf(s), t + k * 0.06, { peak: 0.06, decay: 0.7 }));
      chord([freqOf(-5), freqOf(0), freqOf(4)], t, { peak: 0.025, attack: 0.1, decay: 1.2 });
    },
    tick: (t) => knock(1150, t, { peak: 0.04, decay: 0.03 }),
    land: (t, { step = 1 }) => knock(170 - Math.min(6, step) * 6, t, { peak: 0.035, decay: 0.05 }),
    shuffle: (t) => {
      air(t, 0.35, 600, 2400, 0.05);
      air(t + 0.22, 0.3, 2400, 700, 0.04);
    },
    bonus: (t, { step = 1 }) => {
      for (let k = 0; k < Math.min(6, step); k++) glass(note(k + 2, 1), t + k * 0.05, { peak: 0.045, decay: 0.45 });
    },
    win: (t) => {
      [0, 4, 7, 12].forEach((s, k) => marimba(freqOf(s), t + k * 0.12, { peak: 0.15, decay: 0.6 }));
      chord([freqOf(-12), freqOf(-5), freqOf(0), freqOf(4)], t + 0.3, { peak: 0.035, attack: 0.3, decay: 2 });
    },
    medal: (t) => {
      glass(freqOf(24), t, { peak: 0.08, decay: 1.2 });
      glass(freqOf(19), t + 0.04, { peak: 0.05, decay: 1 });
    },
    lose: (t) => {
      [7, 4, 2, 0].forEach((s, k) => marimba(freqOf(s - 5), t + k * 0.18, { peak: 0.1, decay: 0.5 }));
      chord([freqOf(-17), freqOf(-10)], t + 0.5, { peak: 0.03, attack: 0.3, decay: 1.4 });
    },
    click: (t) => glass(freqOf(19), t, { peak: 0.03, decay: 0.12 }),
    booster: (t) => {
      air(t, 0.18, 1800, 600, 0.05);
      knock(220, t + 0.1, { peak: 0.13, decay: 0.1 });
    },
    unlock: (t) => [7, 12, 19].forEach((s, k) => glass(freqOf(s), t + k * 0.08, { peak: 0.06, decay: 0.8 })),
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
