// Звуки Bongo Cat — синтез через Web Audio, без файлов. У bongo.cat звуки — записи неизвестного
// происхождения, поэтому не копируем их, а собираем похожие из генераторов и шума:
//   бонго — синус с «падающим» тоном + щелчок ладони;   пианино — затухающие обертоны;
//   маримба — синус + быстро гаснущие 4-й и 10-й обертоны (как у деревянного бруска);
//   тарелка и колокольчик — квадратные волны на негармоничных частотах (как у драм-машины TR-808);
//   бубен — пачки высокого шума (звон тарелочек) + глухой удар;   «мяу» — пила через фильтры-форманты
//   гласных «и → а → у» с плавающим тоном.
//
// createSynth(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

import { noteFreq } from './logic.js';

export function createSynth(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.8;
  // компрессор сглаживает пики, когда много ударов звучат разом
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(ctx.destination);

  // секунда белого шума на все шумовые звуки
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const now = () => ctx.currentTime + 0.005;

  /** Огибающая: быстрый подъём до peak и экспоненциальный спад за decay секунд. */
  function env(t, peak, decay, attack = 0.003) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function osc(type, freq, t, stopAt) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stopAt);
    return o;
  }

  function noiseSource(t, stopAt) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(stopAt);
    return s;
  }

  function filter(type, freq, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Соединяет узлы цепочкой и в конце — в общий выход. */
  function chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(master);
  }

  const voices = {
    bongo(note) {
      const t = now();
      const f0 = note === 0 ? 205 : 305;            // левый барабан больше и ниже
      const body = osc('sine', f0 * 1.45, t, t + 0.4);
      body.frequency.exponentialRampToValueAtTime(f0, t + 0.035);
      chain(body, env(t, 0.9, 0.26));
      const ring = osc('sine', f0 * 2.3, t, t + 0.2);
      chain(ring, env(t, 0.18, 0.08));
      const slap = noiseSource(t, t + 0.06);
      chain(slap, filter('bandpass', 1800 + f0 * 2, 1.2), env(t, 0.35, 0.03, 0.001));
    },

    keyboard(note) {
      const t = now();
      const f = noteFreq(note);
      const partials = [[1, 0.55, 1.6], [2, 0.3, 1.1], [3, 0.16, 0.7], [4, 0.09, 0.5], [5, 0.05, 0.35], [6, 0.03, 0.25]];
      for (const [n, amp, decay] of partials) {
        const o = osc('sine', f * n * (1 + 0.0004 * n * n), t, t + decay + 0.1);
        chain(o, env(t, amp, decay, 0.004));
      }
      const hammer = noiseSource(t, t + 0.03);
      chain(hammer, filter('bandpass', f * 4, 2), env(t, 0.06, 0.015, 0.001));
    },

    marimba(note) {
      const t = now();
      const f = noteFreq(note);
      chain(osc('sine', f, t, t + 1), env(t, 0.75, 0.85, 0.002));
      chain(osc('sine', f * 3.93, t, t + 0.2), env(t, 0.22, 0.12, 0.001));
      chain(osc('sine', f * 9.94, t, t + 0.08), env(t, 0.07, 0.04, 0.001));
      const knock = noiseSource(t, t + 0.02);
      chain(knock, filter('lowpass', 1500), env(t, 0.1, 0.012, 0.001));
    },

    cymbal() {
      const t = now();
      const hp = filter('highpass', 6500, 0.7);
      const bright = env(t, 0.5, 1.6, 0.002);
      hp.connect(bright);
      bright.connect(master);
      for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) osc('square', f * 2.2, t, t + 1.8).connect(hp);
      const wash = noiseSource(t, t + 1.8);
      chain(wash, filter('highpass', 4200, 0.5), env(t, 0.32, 1.4, 0.002));
      const crash = noiseSource(t, t + 0.3);
      chain(crash, filter('bandpass', 3000, 0.8), env(t, 0.35, 0.18, 0.001));
    },

    cowbell() {
      const t = now();
      const bp = filter('bandpass', 1450, 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);       // резкий первый спад — «звяк»
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);     // и хвост
      bp.connect(g);
      g.connect(master);
      osc('square', 562, t, t + 0.6).connect(bp);
      osc('square', 845, t, t + 0.6).connect(bp);
    },

    tambourine() {
      const t = now();
      // три быстрые пачки звона: тарелочки бубна бьются друг о друга не разом
      [0, 0.018, 0.041].forEach((dt, i) => {
        const s = noiseSource(t + dt, t + dt + 0.25);
        chain(s, filter('bandpass', 8200 - i * 600, 1.5), filter('highpass', 5000), env(t + dt, 0.5 - i * 0.12, 0.12, 0.001));
      });
      const shimmer = noiseSource(t, t + 0.5);
      chain(shimmer, filter('highpass', 9000), env(t, 0.12, 0.38));
      const skin = osc('sine', 190, t, t + 0.12);
      skin.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      chain(skin, env(t, 0.3, 0.07));
    },

    meow() {
      const t = now();
      const len = 0.62 + Math.random() * 0.12;
      const pitch = 0.92 + Math.random() * 0.16;              // каждый раз чуть другой кот
      const voice = osc('sawtooth', 520 * pitch, t, t + len + 0.05);
      voice.frequency.linearRampToValueAtTime(760 * pitch, t + len * 0.25);
      voice.frequency.linearRampToValueAtTime(700 * pitch, t + len * 0.55);
      voice.frequency.linearRampToValueAtTime(430 * pitch, t + len);
      const vibrato = osc('sine', 6, t, t + len + 0.05);
      const depth = ctx.createGain();
      depth.gain.value = 9;
      vibrato.connect(depth);
      depth.connect(voice.frequency);

      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
      amp.gain.setValueAtTime(0.5, t + len * 0.6);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
      amp.connect(master);

      // форманты гласных: «и» (300/2300) → «а» (850/1500) → «у» (350/800)
      const formants = [[300, 850, 350, 1], [2300, 1500, 800, 0.6], [3000, 2800, 2400, 0.25]];
      for (const [a, b, c, gain] of formants) {
        const f = filter('bandpass', a, 7);
        f.frequency.setValueAtTime(a, t);
        f.frequency.linearRampToValueAtTime(b, t + len * 0.35);
        f.frequency.linearRampToValueAtTime(c, t + len);
        const g = ctx.createGain();
        g.gain.value = gain * 3;
        voice.connect(f);
        f.connect(g);
        g.connect(amp);
      }
    },
  };

  return {
    play(instrumentId, note = 0) {
      voices[instrumentId]?.(note);
    },
    has: (instrumentId) => instrumentId in voices,
  };
}
