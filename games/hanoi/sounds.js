// Звуки Ханойской башни — деревянные и тихие, как у детской башенки: свой маленький синтез (только синусы и
// треугольники, шум — мягким «воздухом» через фильтр), лёгкое эхо «комнаты» и срезанный верх.
//   поднять диск — короткий «вжух» вверх и тихий стук;
//   положить — деревянный «ток» и нота маримбы: у каждого диска своя (меньше диск — выше нота, по пентатонике),
//     поэтому лучшая сборка звучит мелодией — самый маленький диск ходит через раз;
//   положить обратно — глухой «ток»; нельзя (больший на меньший) — мягкий «бум»;
//   отмена — «воздух» вниз; подсказка — тихое стекло; новая башня — диски ложатся один за другим снизу вверх;
//   собрано — каждый диск звенит по очереди снизу вверх на тёплом аккорде, «идеально» — ещё колокольчики.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { freqOf, pentaStep } from '../../shared/sfx.js';

export const SOUNDS = ['lift', 'drop', 'back', 'blocked', 'undo', 'hint', 'stack', 'note', 'win', 'perfect', 'click'];

/** Нота диска: самый большой — до малой октавы, каждый меньше — ступенью пентатоники выше. */
export const diskNote = (disk, n) => freqOf(pentaStep(Math.max(0, n - 1 - disk)) - 12);

export function createSounds(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 6000;
  tone.Q.value = 0.5;
  tone.connect(comp);
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(tone);
  // «комната»: короткое затухающее эхо
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.12;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2000;
  damp.Q.value = 0.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.25;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
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

  function env(t, peak, decay, attack = 0.004) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }

  /** Синус (или треугольник) с огибающей; slide — тон за миг съезжает от freq*slide к freq. */
  function sine(freq, t, { peak = 0.1, decay = 0.3, attack = 0.004, slide = 1, type = 'sine' } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * slide, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq, t + Math.max(0.02, attack * 6));
    o.connect(env(t, peak, decay, attack));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** Маримба: основной тон, тихий 4-й обертон и лёгкий стук палочки. */
  function marimba(freq, t, { peak = 0.13, decay = 0.5 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.003 });
    sine(freq * 3.98, t, { peak: peak * 0.12, decay: decay * 0.16, attack: 0.002 });
    sine(freq * 2.5, t, { peak: peak * 0.07, decay: 0.03, attack: 0.001 });
  }

  /** Деревянный «ток»: низкий тон с быстрым спадом через фильтр — без звона. */
  function knock(freq, t, { peak = 0.12, decay = 0.07 } = {}) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq * 2.4;
    f.Q.value = 0.6;
    o.connect(f);
    f.connect(env(t, peak, decay, 0.002));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** Воздух: шум через мягкий полосовой фильтр, частота едет from → to. */
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
    f.connect(env(t, peak, dur * 0.7, dur * 0.3));
  }

  /** Стекло: чистый тон с неровными обертонами, мягкая атака. */
  function glass(freq, t, { peak = 0.05, decay = 0.6 } = {}) {
    sine(freq, t, { peak, decay, attack: 0.006 });
    sine(freq * 2.76, t, { peak: peak * 0.2, decay: decay * 0.45, attack: 0.005 });
  }

  /** Тёплый аккорд: медленная атака, долгое затухание. */
  function chord(freqs, t, { peak = 0.035, attack = 0.25, decay = 1.8 } = {}) {
    for (const f of freqs) for (const d of [1, 1.004]) sine(f * d, t, { peak, decay, attack });
  }

  const play = {
    lift: (t, { disk = 0, n = 5 }) => {
      air(t, 0.12, 500, 1600, 0.03, 1.2);
      knock(diskNote(disk, n) * 1.5 * wobble(), t, { peak: 0.05, decay: 0.04 });
    },
    drop: (t, { disk = 0, n = 5 }) => {
      knock(180 + (n - 1 - disk) * 22 * wobble(), t, { peak: 0.13, decay: 0.07 });
      marimba(diskNote(disk, n), t + 0.004, { peak: 0.1, decay: 0.45 });
    },
    back: (t, { disk = 0, n = 5 }) => knock(150 + (n - 1 - disk) * 14, t, { peak: 0.11, decay: 0.08 }),
    blocked: (t) => {
      sine(120, t, { peak: 0.13, decay: 0.16, slide: 1.35, type: 'triangle' });
      knock(95, t + 0.07, { peak: 0.08, decay: 0.1 });
    },
    undo: (t) => air(t, 0.18, 1800, 600, 0.035),
    hint: (t) => glass(freqOf(16), t, { peak: 0.045, decay: 0.5 }),
    // диски ложатся на стержень снизу вверх через gap секунд — в такт анимации появления
    stack: (t, { n = 5, gap = 0.07 }) => {
      for (let k = 0; k < Math.min(n, 10); k++) knock((170 + k * 24) * wobble(), t + k * gap, { peak: 0.09, decay: 0.06 });
    },
    note: (t, { disk = 0, n = 5 }) => marimba(diskNote(disk, n), t, { peak: 0.09, decay: 0.6 }),
    win: (t) => chord([freqOf(-24), freqOf(-17), freqOf(-12), freqOf(-8)], t, { peak: 0.03, attack: 0.3, decay: 2.2 }),
    perfect: (t) => [12, 16, 19, 24].forEach((s, k) => glass(freqOf(s), t + k * 0.09, { peak: 0.04, decay: 0.9 })),
    click: (t) => sine(freqOf(7), t, { peak: 0.05, decay: 0.05, slide: 0.8 }),
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
