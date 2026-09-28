// Звуки пинбола — «прикольные и не режущие уши» (просьба владельца): всё тональное — в одной тональности
// (ре минорная пентатоника), поэтому серия ударов складывается в мелодию, а аккорды событий звучат вместе с фоном.
// Синусы и треугольники вместо квадратов и пил, шум — только через фильтр ниже 3–4 кГц (самая чувствительная для уха
// полоса 2–5 кГц — тихо), у каждого удара чуть гуляют высота (±25 центов) и громкость; у частых звуков — предел
// одновременных голосов и повтора (не чаще 35 мс). Общая шина — компрессор, отдельная — эхо для «космоса».
// Фон (по желанию) — тихий гул ре и ля с плавающим фильтром и редкими «звёздными» нотами.
// createSounds(ctx) принимает готовый AudioContext — в тестах подставляется поддельный.

export const SOUNDS = [
  'flipper', 'flipperDown', 'bumper', 'sling', 'rollover', 'lanesDone', 'target', 'targetBank', 'spinner', 'ramp',
  'catch', 'eject', 'pull', 'launch', 'drain', 'ballSave', 'extraBall', 'missionStart', 'missionComplete', 'rankUp',
  'multiball', 'jackpot', 'tiltWarn', 'tilt', 'hyperspace', 'wormhole', 'click', 'gameOver',
];

// ре минорная пентатоника: D F G A C по октавам (Гц)
const D4 = 293.66;
const SCALE = [0, 3, 5, 7, 10];
export const noteOf = (step, base = D4) => {
  const oct = Math.floor(step / SCALE.length);
  const deg = ((step % SCALE.length) + SCALE.length) % SCALE.length;
  return base * 2 ** (oct + SCALE[deg] / 12);
};
const semi = (f, s) => f * 2 ** (s / 12);

export function createSounds(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(ctx.destination);
  // эхо «космоса»: задержка с затуханием и срезом верхов
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 1800;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.35;
  echo.connect(echoLp);
  echoLp.connect(fb);
  fb.connect(echo);
  echoLp.connect(echoOut);
  echoOut.connect(master);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const now = () => ctx.currentTime + 0.005;
  const cents = () => 2 ** ((Math.random() - 0.5) * 0.5 / 12);            // ±25 центов
  const loud = () => 10 ** ((Math.random() - 0.5) * 3 / 20);               // ±1,5 дБ

  function env(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Тон: sine/triangle, скольжение высоты, срез фильтром, отправка в эхо. */
  function tone(freq, t, { type = 'sine', peak = 0.2, attack = 0.004, decay = 0.2, glide = null, glideTime = 0.05, lp = 0, wet = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
    const g = env(t, peak, attack, decay);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(echo);
    }
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** FM-колокольчик: несущая freq, модулятор ×ratio, глубина index → 0. */
  function fm(freq, t, { ratio = 2, index = 2, peak = 0.16, decay = 0.28, wet = 0.2 } = {}) {
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    depth.gain.setValueAtTime(freq * index, t);
    depth.gain.exponentialRampToValueAtTime(1, t + 0.15);
    mod.connect(depth);
    depth.connect(car.frequency);
    const g = env(t, peak, 0.003, decay);
    car.connect(g);
    g.connect(master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(echo);
    }
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  /** Шум через фильтр (полоса или срез), с движением частоты. */
  function noise(t, dur, { type = 'lowpass', f0 = 900, f1 = f0, q = 1, peak = 0.1, attack = 0.002 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = env(t, peak, attack, dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + dur + 0.05);
  }

  /** Аккорд пилами через срез — «медь» для событий (приглушённая, без звона). */
  function brass(freqs, t, { dur = 0.35, peak = 0.07, lp = 1800 } = {}) {
    for (const f of freqs) {
      for (const d of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f * 2 ** (d / 1200);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(400, t);
        flt.frequency.exponentialRampToValueAtTime(lp, t + 0.08);
        flt.frequency.exponentialRampToValueAtTime(lp * 0.5, t + dur);
        const g = env(t, peak / freqs.length, 0.02, dur);
        o.connect(flt);
        flt.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  let bumperStep = 0;
  let bumperAt = 0;
  const last = new Map();                       // звук → время последнего запуска
  const MIN_GAP = { bumper: 0.035, sling: 0.035, rollover: 0.035, target: 0.035, spinner: 0.04, flipper: 0.03, flipperDown: 0.03 };

  const play = {
    flipper: (t) => {
      tone(120, t, { peak: 0.14, decay: 0.05, glide: 70, glideTime: 0.04 });
      noise(t, 0.025, { f0: 900, peak: 0.05 });
    },
    flipperDown: (t) => tone(100, t, { peak: 0.06, decay: 0.04, glide: 65, glideTime: 0.03 }),
    // бампер: мягкий «бум» корпуса + колокольчик — следующая нота пентатоники (серия — арпеджио)
    bumper: (t) => {
      if (t - bumperAt > 1.2) bumperStep = 0;
      bumperAt = t;
      const f = noteOf(bumperStep % 8) * cents();
      bumperStep += 1;
      tone(160, t, { peak: 0.16 * loud(), decay: 0.09, glide: 55, glideTime: 0.09 });
      fm(f, t, { peak: 0.13 * loud() });
    },
    sling: (t) => {
      noise(t, 0.02, { type: 'bandpass', f0: 1200, q: 1, peak: 0.08 });
      tone(noteOf(4) * 1.5 * cents(), t, { type: 'triangle', peak: 0.08, decay: 0.1, glide: noteOf(4) * 1.65, glideTime: 0.04 });
    },
    rollover: (t, { lane = 0 }) => tone(noteOf(5 + lane) * cents(), t, { peak: 0.1, attack: 0.001, decay: 0.12, wet: 0.2 }),
    lanesDone: (t) => [5, 6, 7, 8, 10].forEach((s, k) => tone(noteOf(s), t + k * 0.06, { type: 'triangle', peak: 0.08, decay: 0.18, wet: 0.3 })),
    target: (t) => {
      noise(t, 0.02, { f0: 1200, peak: 0.07 });
      tone(330 * cents(), t, { type: 'triangle', peak: 0.09, decay: 0.12, glide: 165, glideTime: 0.12 });
    },
    targetBank: (t) => brass([noteOf(0), noteOf(1), noteOf(3)], t, { dur: 0.22, peak: 0.12 }),
    spinner: (t, { speed = 0.5 }) => tone(700 * (1 + 0.2 * speed), t, { peak: 0.035, attack: 0.001, decay: 0.012 }),
    // рампа: шорох по трубе вверх и арпеджио Ре-Фа-Ля-Ре
    ramp: (t) => {
      noise(t, 0.4, { type: 'bandpass', f0: 400, f1: 2000, q: 2, peak: 0.06 });
      [0, 1, 3, 5].forEach((s, k) => tone(noteOf(s), t + 0.08 + k * 0.055, { type: 'triangle', peak: 0.08, decay: 0.16, wet: 0.25 }));
    },
    catch: (t) => tone(400, t, { peak: 0.12, decay: 0.15, glide: 120, glideTime: 0.15 }),
    eject: (t) => {
      tone(150, t, { peak: 0.15, decay: 0.1, glide: 60, glideTime: 0.08 });
      noise(t, 0.06, { f0: 800, peak: 0.07 });
    },
    // пружина: чем сильнее натянута (level 0…1), тем выше гул
    pull: (t, { level = 0.5 }) => tone(70 + level * 70, t, { type: 'triangle', peak: 0.03, decay: 0.08, lp: 200 + level * 700 }),
    launch: (t, { level = 0.8 }) => {
      tone(110, t, { peak: 0.18 * (0.5 + level / 2), decay: 0.15, glide: 45, glideTime: 0.15 });
      noise(t, 0.12, { type: 'bandpass', f0: 800, f1: 300, peak: 0.06 });
    },
    // шарик ушёл: грустно, но не наказанием
    drain: (t) => {
      [7, 5, 3].forEach((s, k) => tone(noteOf(s - 5), t + k * 0.15, { type: 'triangle', peak: 0.09, decay: 0.3, lp: 3000 - k * 1100 }));
      tone(55, t + 0.1, { peak: 0.1, decay: 0.4 });
    },
    ballSave: (t) => {
      brass([noteOf(5), noteOf(8)], t, { dur: 0.5, peak: 0.08, lp: 2500 });
      [10, 12, 15].forEach((s, k) => tone(noteOf(s), t + 0.1 + k * 0.07, { peak: 0.05, decay: 0.3, wet: 0.3 }));
    },
    extraBall: (t) => {
      const D = noteOf(0);
      [0, 4, 7, 12, 16].forEach((s, k) => tone(semi(D, s), t + k * 0.09, { type: 'triangle', peak: 0.1, decay: 0.25, wet: 0.3 }));
      brass([semi(D, 12), semi(D, 16), semi(D, 19)], t + 0.45, { dur: 0.8, peak: 0.1, lp: 2200 });
    },
    // миссия: «сонар» Ля → Ре с эхом
    missionStart: (t) => {
      tone(noteOf(3), t, { peak: 0.12, decay: 0.25, glide: noteOf(5), glideTime: 0.18, wet: 0.5 });
      fm(noteOf(5), t + 0.2, { peak: 0.08, index: 1, wet: 0.5 });
    },
    missionComplete: (t) => {
      const chords = [[0, 3, 7], [-2, 2, 5], [0, 4, 7], [2, 5, 9]].map((c) => c.map((s) => semi(noteOf(0), s)));
      chords.forEach((c, k) => brass(c, t + k * 0.13, { dur: 0.16, peak: 0.12 }));
      tone(noteOf(10), t + 0.52, { peak: 0.08, decay: 0.6, wet: 0.4 });
    },
    rankUp: (t) => {
      const D = noteOf(0);
      tone(semi(D, -12), t, { type: 'triangle', peak: 0.08, decay: 0.6, glide: semi(D, 0), glideTime: 0.5 });
      brass([D, semi(D, 4), semi(D, 7), semi(D, 12)], t + 0.45, { dur: 1.1, peak: 0.14, lp: 2500 });
    },
    multiball: (t) => {
      for (let k = 0; k < 6; k++) tone(k % 2 ? noteOf(3) : noteOf(5), t + k * 0.12, { type: 'triangle', peak: 0.08, decay: 0.14 });
      brass([noteOf(0), noteOf(3), noteOf(5)], t + 0.75, { dur: 0.5, peak: 0.1 });
    },
    jackpot: (t) => {
      tone(50, t, { peak: 0.22, decay: 0.3 });
      noise(t, 0.08, { f0: 2000, peak: 0.08 });
      const D = noteOf(0);
      brass([D, semi(D, 4), semi(D, 7), semi(D, 12), semi(D, 16)], t + 0.02, { dur: 0.9, peak: 0.16, lp: 2600 });
      [12, 16, 19, 24].forEach((s, k) => tone(semi(D, s), t + 0.1 + k * 0.08, { peak: 0.06, decay: 0.4, wet: 0.5 }));
    },
    tiltWarn: (t) => {
      for (let k = 0; k < 2; k++) {
        tone(110, t + k * 0.3, { type: 'triangle', peak: 0.09, decay: 0.22, lp: 600 });
        tone(116.5, t + k * 0.3, { type: 'triangle', peak: 0.09, decay: 0.22, lp: 600 });
      }
    },
    tilt: (t) => {
      tone(110, t, { type: 'triangle', peak: 0.12, decay: 1, lp: 500 });
      tone(116.5, t, { type: 'triangle', peak: 0.12, decay: 1, lp: 500 });
    },
    // гиперпространство: вихрь вверх и мерцание
    hyperspace: (t) => {
      noise(t, 0.6, { type: 'bandpass', f0: 300, f1: 2400, q: 3, peak: 0.07 });
      tone(noteOf(0), t, { peak: 0.1, decay: 0.6, glide: noteOf(10), glideTime: 0.5, wet: 0.5 });
    },
    // червоточина: «вжух» вниз и отзвук
    wormhole: (t) => {
      tone(noteOf(10), t, { type: 'triangle', peak: 0.1, decay: 0.45, glide: noteOf(0) / 2, glideTime: 0.4, wet: 0.5 });
      noise(t, 0.4, { type: 'bandpass', f0: 1800, f1: 250, q: 2, peak: 0.05 });
    },
    click: (t) => tone(noteOf(5), t, { peak: 0.06, decay: 0.05 }),
    gameOver: (t) => {
      [5, 3, 1, 0].forEach((s, k) => tone(noteOf(s), t + k * 0.22, { type: 'triangle', peak: 0.09, decay: 0.4, wet: 0.3 }));
      tone(noteOf(0) / 2, t + 0.9, { peak: 0.1, decay: 1.2 });
    },
  };

  // ---------- фон: тихий гул (ре + ля), фильтр плывёт, редкие «звёзды» ----------
  let ambient = null;
  function startAmbient() {
    if (ambient) return;
    const t = now();
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.05, t + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    const oscs = [73.42, 110, 146.83].flatMap((f) => [-3, 3].map((c) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * 2 ** (c / 1200);
      o.connect(lp);
      o.start(t);
      return o;
    }));
    lp.connect(out);
    out.connect(master);
    lfo.start(t);
    const timer = setInterval(() => {
      if (Math.random() < 0.5) tone(noteOf(10 + Math.floor(Math.random() * 5)), now(), { peak: 0.025, decay: 0.8, wet: 0.8 });
    }, 3500);
    ambient = { out, oscs, lfo, timer };
  }
  function stopAmbient() {
    if (!ambient) return;
    const t = now();
    ambient.out.gain.cancelScheduledValues(t);
    ambient.out.gain.setValueAtTime(Math.max(0.0001, ambient.out.gain.value), t);
    ambient.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const { oscs, lfo, timer } = ambient;
    clearInterval(timer);
    for (const o of oscs) o.stop(t + 0.7);
    lfo.stop(t + 0.7);
    ambient = null;
  }

  return {
    has: (name) => name in play,
    play(name, opts = {}) {
      const fn = play[name];
      if (!fn) return;
      const t = now();
      const gap = MIN_GAP[name];
      if (gap && t - (last.get(name) ?? -1) < gap) return;         // не чаще — иначе трещит
      last.set(name, t);
      fn(t, opts);
    },
    ambient(on) {
      if (on) startAmbient();
      else stopAmbient();
    },
  };
}
