// Звуки и музыка «Лисьей охоты» — мягкие, «лесные»: ничего не бьёт по ушам. Только синусы и треугольники, шум —
// лишь через фильтр и тихо; всё тональное — в одной пентатонике (до ре ми соль ля), поэтому поимка, монеты и
// колокольчики попадают в тон музыке любого места. Всё собрано из shared/sfx.js и нескольких своих кирпичиков
// (тон, щипок, шорох из смягчённого шума, тон с громкостью по точкам).
//
// Частые звуки (FREQUENT: рывок, выстрел, попадание…) — тихие, короткие и не выше 1400 Гц. Все звуки редеют по
// часам звука: один и тот же — не чаще своего MIN_GAP, а за один отсчёт часов — не больше нескольких. Так бой не
// трещит, а когда звук выключен в профиле (контекст стоит на паузе, его часы не идут), звуки не копятся, чтобы
// потом грянуть разом.
//
// Музыка — тихая и сочиняется на ходу: гул опорной ноты, пары нот-подложки, перебор и мелодия из мотивов. У каждого
// места своя опора (лад той же пентатоники), темп и тембр; форма — 16–32 такта, и каждый круг мелодия пишется
// заново по зерну — composeMusic(mood, seed), чистая функция. Ноты ставятся понемногу, на полсекунды вперёд по
// часам звука: стоят часы — не ставится ничего.
//
// createSounds(ctx, timers) принимает готовый AudioContext (в тестах — поддельный) и, если нужно, свои
// setInterval / clearInterval. play(name, { n }) — n: какая по счёту поимка в цепочке (catch); годится и само
// событие расчёта { id, x, y, v } — тогда счёт берётся из v.
// music(mood | null, seed?) — музыка места ('forest', 'swamp', 'taiga', 'cave', 'autumn', 'boss') или тишина.

import { createSfx } from '../../shared/sfx.js';

export const SOUNDS = [
  // окна и вещи
  'tap', 'open', 'close', 'equip', 'deny', 'buy', 'coin', 'pick', 'heart', 'mana', 'potion', 'chest', 'banner', 'gift',
  // лиса
  'dash', 'land', 'hurt', 'shield', 'die', 'respawn', 'nomana',
  // охота
  'catch', 'escape', 'hit', 'crit', 'kill', 'bush', 'stump', 'spiky',
  // оружие
  'shot', 'heavy', 'spread', 'bow', 'magic', 'zap', 'beam', 'lob', 'boom', 'ice', 'fire', 'swing', 'trap',
  // враги и красные зоны
  'warn', 'moose', 'paw', 'growl', 'spit', 'spawn',
  // комнаты и события
  'door', 'lock', 'clear', 'task', 'taskok', 'taskfail', 'boss', 'bossdie', 'floor', 'gameover', 'record', 'hire',
  'altar', 'well', 'forge', 'heal',
];

// то, что в бою звучит по многу раз в секунду: громкость меньше 0.12, тоны и шум не выше 1400 Гц, узлов — до восьми
export const FREQUENT = [
  'tap', 'coin', 'pick', 'heart', 'mana', 'deny', 'dash', 'land', 'shield', 'nomana',
  'catch', 'escape', 'hit', 'crit', 'kill', 'bush', 'stump', 'spiky',
  'shot', 'heavy', 'spread', 'bow', 'magic', 'zap', 'beam', 'lob', 'boom', 'ice', 'fire', 'swing', 'trap',
  'warn', 'growl', 'spit', 'spawn',
];

export const MOODS = ['forest', 'swamp', 'taiga', 'cave', 'autumn', 'boss'];

// не чаще (секунды по часам звука): частым — чтобы не трещали, остальным (REST_GAP) — чтобы звук не лёг сам на себя
const MIN_GAP = {
  tap: 0.04, coin: 0.05, pick: 0.07, heart: 0.09, mana: 0.06, deny: 0.25,
  dash: 0.09, land: 0.09, hurt: 0.2, shield: 0.12, nomana: 0.3,
  catch: 0, escape: 0.1, hit: 0.05, crit: 0.07, kill: 0.06, bush: 0.08, stump: 0.08, spiky: 0.15,
  shot: 0.06, heavy: 0.09, spread: 0.09, bow: 0.08, magic: 0.11, zap: 0.08, beam: 0.11, lob: 0.1, boom: 0.09, ice: 0.08,
  fire: 0.09, swing: 0.09, trap: 0.1,
  warn: 0.22, moose: 0.5, paw: 0.2, growl: 0.4, spit: 0.07, spawn: 0.09,
};
const REST_GAP = 0.15;
// сколько звуков можно начать за один отсчёт часов: частых, всего (редкие важнее — им оставлен запас) и пока
// контекст на паузе (звук выключен в профиле или браузер ещё не запустил контекст)
const CROWD = 6;
const CROWD_MAX = 10;
const CROWD_HELD = 2;

// ---------- ноты ----------

const SCALE = [0, 2, 4, 7, 9];
const C2 = 65.406;
/** Нота пентатоники по номеру: 0 — до большой октавы (65 Гц), 5 — до малой, 10 — до первой, 15 — до второй. */
export const noteOf = (i) => {
  const oct = Math.floor(i / 5);
  return C2 * 2 ** (oct + SCALE[i - oct * 5] / 12);
};
const mod5 = (i) => ((i % 5) + 5) % 5;

// ---------- музыка: из чего сложена ----------

const MUSIC_LEVEL = 0.05;      // громкость дорожки: ноты (до 0.25) × 0.05 — заметно тише звуков игры
const FADE_IN = 1.5;           // новая дорожка входит, прежняя за то же время уходит
const FADE_OUT = 0.6;          // music(null)
const AHEAD = 0.5;             // на сколько секунд вперёд ставятся ноты
const TICK_MS = 200;
const LATE = 0.1;              // таймер опоздал сильнее — пропущенные шаги не играем
const PAD_IN = 1.2;            // подложка: входит, держится, уходит — заходя под следующую
const PAD_OUT = 1.6;
const PAD_TAIL = 1.4;
const WIDE = 2 ** (5 / 1200);  // второй голос верхней ноты подложки — на 5 центов выше: медленное «дыхание»
const ECHO_BACK = 0.3;
const LOW = 11;                // мелодия — от ре первой октавы (294 Гц)…
const HIGH = 19;               // …до ля второй (880 Гц)

// У каждого места — своя дорожка. Ноты общие, разная опора (лад), темп и тембр.
//   root — нота гула; bpm — темп; bar — шагов-восьмушек в такте (8 — на четыре четверти, 6 — на три)
//   wave, ring — чем и как долго звучит щипок; cutoff — срез верха; echo, echoSteps — громкость и задержка эха
//   centre — середина мелодии; rest — как часто мелодия пропускает второй мотив фразы
//   hum, pad, arp, lead, pulse — громкости голосов (до общей MUSIC_LEVEL)
//   a, b — четвёрки созвучий (пара нот над гулом, каждое — на два такта)
//   form — части по восемь тактов: какая четвёрка, есть ли перебор (arp) и мелодия (lead: 1 — да, 2 — повыше)
//   cells — ритмы такта для мотивов; arps — рисунки перебора на такт: [шаг, что брать]
//           (0 и 1 — ноты созвучия, 2 — опора октавой выше гула, 3 — нижняя нота созвучия октавой выше)
const TUNES = {
  // опушка: светло и неторопливо — деревянный перестук по четвертям
  forest: {
    root: 5, bpm: 84, bar: 8, wave: 'triangle', ring: 1.2, cutoff: 1800, echo: 0.16, echoSteps: 1.5,
    centre: 15, rest: 0.2, hum: 0.13, pad: 0.1, arp: 0.12, lead: 0.24,
    a: [[12, 15], [12, 14], [11, 13], [10, 13]],
    b: [[10, 14], [11, 14], [12, 14], [11, 13]],
    form: [{ ch: 'a', arp: 1, lead: 0 }, { ch: 'a', arp: 1, lead: 1 }, { ch: 'b', arp: 0, lead: 2 }, { ch: 'a', arp: 1, lead: 1 }],
    cells: [[0, 4], [0, 3, 6], [0, 2, 4], [0, 4, 6], [2, 4], [0], [0, 3, 4], [4, 6]],
    arps: [[[0, 2], [2, 0], [4, 1], [6, 0]], [[0, 0], [2, 1], [4, 2], [6, 1]], [[0, 2], [3, 1], [6, 0]]],
  },
  // болото: ниже, медленнее, глуше; капли с эхом
  swamp: {
    root: 4, bpm: 66, bar: 8, wave: 'sine', ring: 1.5, cutoff: 1200, echo: 0.24, echoSteps: 1.5,
    centre: 13, rest: 0.35, hum: 0.14, pad: 0.11, arp: 0.13, lead: 0.24,
    a: [[9, 12], [9, 11], [8, 11], [9, 12]],
    b: [[10, 13], [11, 14], [10, 13], [8, 11]],
    form: [{ ch: 'a', arp: 1, lead: 0 }, { ch: 'b', arp: 0, lead: 1 }, { ch: 'a', arp: 1, lead: 1 }],
    cells: [[0, 4], [0, 6], [0], [2, 4], [0, 3, 6], [4]],
    arps: [[[0, 2], [3, 0], [6, 1]], [[0, 0], [4, 1]], [[0, 2], [4, 0], [6, 1]]],
  },
  // зимний бор: на три четверти, высоко и стеклянно, долгое эхо
  taiga: {
    root: 6, bpm: 72, bar: 6, wave: 'sine', ring: 1.9, cutoff: 2000, echo: 0.26, echoSteps: 3,
    centre: 17, rest: 0.25, hum: 0.12, pad: 0.1, arp: 0.09, lead: 0.18,
    a: [[14, 16], [13, 16], [14, 17], [13, 15]],
    b: [[12, 15], [13, 16], [12, 14], [14, 16]],
    form: [{ ch: 'a', arp: 0, lead: 1 }, { ch: 'a', arp: 1, lead: 1 }, { ch: 'b', arp: 1, lead: 0 }, { ch: 'a', arp: 1, lead: 2 }],
    cells: [[0, 2, 4], [0, 4], [0, 3], [0], [2, 4], [0, 2]],
    arps: [[[0, 0], [2, 1], [4, 3]], [[0, 2], [2, 1], [4, 0]], [[0, 0], [3, 1]]],
  },
  // пещеры: совсем редко и гулко — капля, тишина, отзвук
  cave: {
    root: 2, bpm: 58, bar: 8, wave: 'sine', ring: 2.4, cutoff: 1100, echo: 0.3, echoSteps: 3,
    centre: 14, rest: 0.4, hum: 0.15, pad: 0.11, arp: 0.12, lead: 0.24,
    a: [[9, 11], [8, 11], [10, 13], [9, 12]],
    b: [[10, 13], [11, 13], [9, 12], [8, 11]],
    form: [{ ch: 'a', arp: 0, lead: 1 }, { ch: 'b', arp: 1, lead: 1 }],
    cells: [[0], [0, 5], [4], [0, 3], [2]],
    arps: [[[0, 1], [5, 0]], [[2, 0]], [[0, 2], [4, 1]]],
  },
  // осенняя чаща: тепло и чуть грустно — перебор, как на гитаре
  autumn: {
    root: 3, bpm: 76, bar: 8, wave: 'triangle', ring: 1.3, cutoff: 1500, echo: 0.18, echoSteps: 1.5,
    centre: 15, rest: 0.15, hum: 0.14, pad: 0.1, arp: 0.1, lead: 0.24,
    a: [[11, 13], [12, 14], [12, 15], [11, 14]],
    b: [[12, 15], [11, 13], [10, 14], [11, 14]],
    form: [{ ch: 'a', arp: 1, lead: 0 }, { ch: 'a', arp: 1, lead: 1 }, { ch: 'b', arp: 1, lead: 2 }, { ch: 'a', arp: 1, lead: 1 }],
    cells: [[0, 4], [0, 3, 6], [0, 2, 4, 6], [0, 4, 6], [2, 4], [0, 3, 4], [0, 2, 3]],
    arps: [
      [[0, 2], [1, 0], [2, 1], [3, 0], [4, 2], [5, 1], [6, 0], [7, 1]],
      [[0, 2], [2, 0], [3, 1], [4, 0], [6, 1], [7, 0]],
      [[0, 0], [1, 1], [2, 0], [4, 2], [5, 1], [6, 0]],
    ],
  },
  // хозяин места: тот же лад, что у болота, но быстрее — низкий пульс на каждую долю и перебор восьмушками
  boss: {
    root: 4, bpm: 112, bar: 8, wave: 'triangle', ring: 0.7, cutoff: 1300, echo: 0.1, echoSteps: 1.5,
    centre: 14, rest: 0.1, hum: 0.15, pad: 0.1, arp: 0.11, lead: 0.22, pulse: 0.24,
    a: [[9, 12], [10, 13], [11, 14], [9, 12]],
    b: [[10, 14], [8, 11], [10, 13], [12, 14]],
    form: [{ ch: 'a', arp: 1, lead: 1 }, { ch: 'b', arp: 1, lead: 2 }],
    cells: [[0, 2, 3, 4], [0, 3, 6], [0, 1, 2, 4], [0, 2, 4, 6], [0, 4], [2, 3, 4, 6], [0, 3, 4, 6]],
    arps: [
      [[0, 2], [1, 2], [2, 0], [3, 2], [4, 1], [5, 2], [6, 0], [7, 2]],
      [[0, 2], [2, 0], [3, 2], [4, 1], [6, 0], [7, 1]],
    ],
  },
};

/** Случайные числа по зерну (mulberry32): одна и та же музыка для одного и того же зерна. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Мотив на два такта: на каких шагах звучат ноты и куда идёт мелодия (сдвиги по нотам пентатоники). */
function motif(rnd, m) {
  const on = [];
  for (let b = 0; b < 2; b++) {
    for (const s of m.cells[Math.floor(rnd() * m.cells.length)]) on.push(b * m.bar + s);
  }
  const moves = [];
  let dir = rnd() < 0.5 ? 1 : -1;
  for (let k = 1; k < on.length; k++) {
    if (rnd() < 0.35) dir = -dir;                    // мелодия чаще идёт дальше, чем поворачивает
    const r = rnd();
    moves.push(r < 0.12 ? 0 : r < 0.82 ? dir : dir * 2);
  }
  return { on, moves };
}

/** Ближайшая к i нота, которая входит в созвучие (tones — ступени 0…4). */
function near(i, tones) {
  for (let d = 0; d < 3; d++) {
    if (tones.includes(mod5(i + d))) return i + d;
    if (tones.includes(mod5(i - d))) return i - d;
  }
  return i;
}

/**
 * Один круг музыки места по зерну — чистая функция: тот же mood и seed дают те же ноты.
 * Возвращает { mood, bpm, bar, unit, bars, steps, stepDur, at }: at[шаг] — ноты, которые начинаются на этом шаге,
 * { kind: 'pad' | 'arp' | 'lead' | 'pulse', f (Гц), vel (громкость), len (секунды) }; одна нота — один осциллятор.
 * Фраза мелодии — восемь тактов: мотив, он же от другой ноты (или пауза), второй мотив повыше, начало первого и
 * долгая нота-точка (в конце круга — на опоре лада).
 */
export function composeMusic(mood, seed = 0) {
  if (!Object.hasOwn(TUNES, mood)) return null;
  const m = TUNES[mood];
  const rnd = rng(seed);
  const { bar } = m;
  const unit = bar * 2;
  const stepDur = 30 / m.bpm;
  const steps = m.form.length * unit * 4;
  const at = Array.from({ length: steps }, () => []);
  const put = (step, kind, f, vel, len) => at[step].push({ kind, f, vel, len });
  const padLen = unit * stepDur + PAD_TAIL;
  const home = mod5(m.root);

  m.form.forEach((part, p) => {
    const chords = m[part.ch];
    const first = motif(rnd, m);
    const second = motif(rnd, m);
    const arp = part.arp ? m.arps[Math.floor(rnd() * m.arps.length)] : null;
    const centre = Math.min(HIGH - 2, m.centre + (part.lead === 2 ? 2 : 0));
    const lo = Math.max(LOW, centre - 4);
    const hi = Math.min(HIGH, centre + 4);
    const fit = (i) => (i > hi ? i - 5 : i < lo ? i + 5 : i);
    const closing = p === m.form.length - 1;
    let voice = centre;

    /** Спеть мотив с ноты start, начиная с шага s (cut — сколько шагов мотива брать); вернуть последнюю ноту. */
    const sing = (mo, start, s, cut = unit) => {
      let i = start;
      for (let k = 0; k < mo.on.length && mo.on[k] < cut; k++) {
        if (k) {
          i += mo.moves[k - 1];
          if (i > hi || i < lo) i -= mo.moves[k - 1] * 2;      // упёрлись в край — отражаемся
        }
        put(s + mo.on[k], 'lead', noteOf(i), m.lead * (k ? 0.78 + rnd() * 0.17 : 1), m.ring);
      }
      return i;
    };

    chords.forEach(([a, b], c) => {
      const s = (p * 4 + c) * unit;
      // подложка: нижняя нота, верхняя и её чуть расстроенный двойник
      put(s, 'pad', noteOf(a), m.pad, padLen);
      put(s, 'pad', noteOf(b), m.pad * 0.8, padLen);
      put(s, 'pad', noteOf(b) * WIDE, m.pad * 0.36, padLen);

      if (arp) {
        for (let half = 0; half < 2; half++) {
          for (const [st, tone] of arp) {
            if (st && rnd() < 0.1) continue;                    // изредка нота выпадает — перебор «дышит»
            const i = tone === 0 ? a : tone === 1 ? b : tone === 2 ? m.root + 5 : a + 5;
            put(s + half * bar + st, 'arp', noteOf(i), m.arp * (st ? 0.72 + rnd() * 0.2 : 1), m.ring * 0.8);
          }
        }
      }

      if (m.pulse) {
        for (let st = 0; st < unit; st += 2) {
          put(s + st, 'pulse', noteOf(m.root), m.pulse * (st % bar ? 0.7 : 1), 0.3);
        }
        if (c === 3) put(s + unit - 1, 'pulse', noteOf(m.root), m.pulse * 0.55, 0.22);    // затакт к новой части
      }

      if (!part.lead) return;
      const tones = [mod5(a), mod5(b), home];
      const start = fit(near(voice + (c === 2 ? 2 : c === 1 ? (rnd() < 0.5 ? 1 : -1) : 0), tones));
      if (c === 3) {
        const i = sing(first, start, s, bar);
        put(s + bar, 'lead', noteOf(fit(near(i, closing ? [home] : [mod5(b)]))), m.lead * 0.95, m.ring * 1.5);
      } else if (c === 2) {
        voice = sing(second, start, s);
      } else if (c === 1 && rnd() < m.rest) {
        // пауза: фраза дышит
      } else {
        voice = sing(first, start, s);
      }
      voice = Math.round((voice + centre) / 2);                  // далеко от середины мелодия не уходит
    });
  });

  return { mood, bpm: m.bpm, bar, unit, bars: steps / bar, steps, stepDur, at };
}

// ---------- громкость по точкам: топот и рык ----------

/** «Катится»: удары тройками с паузой (та-да-дам ·), громче к середине — зверь проносится мимо. */
function gallop(peak, dur, beat = 0.09) {
  const pts = [];
  for (let k = 0; (k + 1) * beat < dur; k++) {
    const at = k * beat;
    const swell = peak * Math.sin((Math.PI * (at + beat / 2)) / dur) ** 0.6;
    if (k % 4 === 3) pts.push([at + beat, swell * 0.08]);
    else pts.push([at + 0.025, swell * (k % 4 === 2 ? 1 : 0.7)], [at + beat, swell * 0.22]);
  }
  pts.push([dur, 0]);
  return pts;
}

/** «Дрожит»: громкость качается rate раз в секунду — рык без жужжания. */
function rattle(peak, dur, rate) {
  const pts = [];
  const half = 0.5 / rate;
  for (let k = 1; k * half < dur - half; k++) {
    const at = k * half;
    const body = Math.min(1, at / 0.05) * Math.min(1, (dur - at) / 0.14);
    pts.push([at, peak * body * (k % 2 ? 1 : 0.4)]);
  }
  pts.push([dur, 0]);
  return pts;
}

const scaled = (pts, by) => pts.map(([at, v]) => [at, v * by]);

// огибающие считаются один раз: топот лося (низкий голос и октава над ним) и рык
const ROLL = gallop(0.2, 1.1);
const ROLL_HIGH = scaled(ROLL, 0.7);
const GROWL = rattle(0.11, 0.42, 26);
const GROWL_HIGH = scaled(GROWL, 0.8);

// ---------- звуки и музыка ----------

export function createSounds(ctx, { setInterval: every = globalThis.setInterval, clearInterval: cancel = globalThis.clearInterval } = {}) {
  const { now, bell, plip, bup, thud, tock, pad } = createSfx(ctx, { volume: 0.5 });
  // свои кирпичики — на отдельной шине той же громкости (общая шина shared/sfx.js наружу не выдаётся)
  const own = ctx.createGain();
  own.gain.value = 0.5;
  own.connect(ctx.destination);

  // свой шум — заранее смягчённый: белый шум четырежды пропущен через простой срез на 1,5 кГц, так что выше
  // 2–3 кГц в нём почти ничего нет, как бы широко ни стоял фильтр звука. Края записи сведены в ноль — по кругу
  // она идёт без щелчка.
  const hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  {
    const data = hiss.getChannelData(0);
    const k = 1 - Math.exp((-2 * Math.PI * 1500) / ctx.sampleRate);
    const edge = Math.floor(ctx.sampleRate * 0.005);
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    let top = 0;
    for (let i = 0; i < data.length; i++) {
      a += k * (Math.random() * 2 - 1 - a);
      b += k * (a - b);
      c += k * (b - c);
      d += k * (c - d);
      data[i] = d * Math.min(1, i / edge, (data.length - 1 - i) / edge);
      top = Math.max(top, Math.abs(data[i]));
    }
    for (let i = 0; i < data.length; i++) data[i] /= top || 1;
  }

  const wobble = (f, by = 0.035) => f * (1 - by + Math.random() * by * 2);
  const N = noteOf;

  /** Осциллятор → срез верха (если lp) → громкость → своя шина. */
  function wire(o, g, lp) {
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = 0.6;
      o.connect(f);
      f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(own);
  }

  /** Тон: синус или треугольник; по желанию высота скользит к to, верх срезан (lp). */
  function tone(freq, t, { type = 'sine', to = 0, glide = 0.06, peak = 0.08, attack = 0.005, decay = 0.15, lp = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + glide);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    wire(o, g, lp);
    o.start(t);
    o.stop(t + attack + decay + 0.04);
  }

  /** Щипок: треугольник со срезанным верхом и быстрым спадом; from — откуда подъезжает высота (1 — ровно). */
  const pluck = (freq, t, { peak = 0.1, decay = 0.16, from = 0.86 } = {}) => tone(freq * from, t, {
    type: 'triangle', to: freq, glide: 0.03, peak, attack: 0.004, decay, lp: freq * 2.4,
  });

  /** Низкая нота, которую слышно и в маленьком динамике: треугольник со срезом и синус октавой выше. */
  const low = (freq, t, { peak = 0.16, decay = 0.5 } = {}) => {
    tone(freq, t, { type: 'triangle', peak, attack: 0.03, decay, lp: freq * 3.2 });
    tone(freq * 2, t, { peak: peak * 0.8, attack: 0.03, decay: decay * 0.8 });
  };

  /** Шорох: мягкий шум через полосовой фильтр, полоса едет от from к to; громкость входит и уходит плавно. */
  function whoosh(t, dur, { from, to = from, q = 0.9, peak = 0.08, attack = dur * 0.3, release = dur * 0.4 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = hiss;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(own);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.03);
  }

  /** Тон с громкостью по точкам [[время, громкость], …] — то, что дрожит и катится. Высота плывёт к to. */
  function shape(freq, t, pts, { type = 'triangle', to = 0, lp = 0 } = {}) {
    const dur = pts[pts.length - 1][0];
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const [at, v] of pts) g.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + at);
    wire(o, g, lp);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  let coinStep = 0;              // монеты подряд идут вверх по нотам
  let coinAt = -9;
  let catchAt = -9;              // когда прозвучит последняя поставленная поимка
  let hurtAt = -9;               // ранение, потеря жизни и конец охоты приходят одним кадром — разводим их
  let dieAt = -9;

  const play = {
    // ---------- окна и вещи ----------
    tap: (t) => plip(N(17), t, { peak: 0.08, decay: 0.05 }),
    open: (t) => {
      whoosh(t, 0.16, { from: 380, to: 900, peak: 0.07 });
      tone(N(13), t, { peak: 0.06, decay: 0.1 });
      tone(N(15), t + 0.07, { peak: 0.07, decay: 0.16 });
    },
    close: (t) => {
      whoosh(t, 0.14, { from: 900, to: 380, peak: 0.06 });
      tone(N(15), t, { peak: 0.06, decay: 0.1 });
      tone(N(13), t + 0.07, { peak: 0.06, decay: 0.16 });
    },
    // надел вещь: застёжка, шорох, нота
    equip: (t) => {
      tock(250, t, { peak: 0.1, decay: 0.05 });
      whoosh(t, 0.09, { from: 900, to: 1300, peak: 0.05 });
      pluck(N(13), t + 0.06, { peak: 0.09, decay: 0.14 });
    },
    // нельзя: два глухих «не-а»
    deny: (t) => {
      tock(N(10), t, { peak: 0.1, decay: 0.07 });
      tock(N(9), t + 0.11, { peak: 0.1, decay: 0.1 });
    },
    buy: (t) => {
      tock(210, t, { peak: 0.1, decay: 0.06 });
      [17, 18, 20].forEach((i, k) => tone(N(i), t + 0.04 + k * 0.06, { peak: 0.07, decay: 0.12 + k * 0.05 }));
    },
    // монета: две ноты; монеты подряд — каждая на ступень выше
    coin: (t) => {
      coinStep = t - coinAt < 0.7 ? Math.min(coinStep + 1, 4) : 0;
      coinAt = t;
      tone(N(15 + coinStep), t, { peak: 0.06, decay: 0.07 });
      tone(N(17 + coinStep), t + 0.055, { peak: 0.07, decay: 0.16 });
    },
    pick: (t) => {
      plip(N(15), t, { peak: 0.09, decay: 0.08 });
      tone(N(18), t + 0.06, { peak: 0.05, decay: 0.16 });
    },
    // сердечко: тепло и низко
    heart: (t) => {
      tone(N(12), t, { peak: 0.09, attack: 0.012, decay: 0.2 });
      tone(N(13), t + 0.09, { peak: 0.1, attack: 0.012, decay: 0.3 });
      tone(N(18), t + 0.09, { peak: 0.03, decay: 0.22 });
    },
    // шарик маны: «буль» вверх
    mana: (t) => plip(wobble(N(16), 0.02), t, { peak: 0.08, decay: 0.11 }),
    // зелье: три глотка и вздох
    potion: (t) => {
      [9, 10, 11].forEach((i, k) => bup(N(i), t + k * 0.12, { peak: 0.13, decay: 0.08, drop: 1.5 }));
      tone(N(14), t + 0.4, { peak: 0.06, attack: 0.02, decay: 0.35 });
    },
    // сундук: щеколда, крышка вверх и три колокольчика
    chest: (t) => {
      tock(140, t, { peak: 0.13, decay: 0.07 });
      tone(N(6), t + 0.03, { type: 'triangle', to: N(8), glide: 0.2, peak: 0.08, attack: 0.03, decay: 0.24, lp: 600 });
      [15, 17, 18].forEach((i, k) => bell(N(i), t + 0.22 + k * 0.08, { peak: 0.085, decay: 0.5 + k * 0.1 }));
    },
    // надпись о новом месте: аккорд-вдох и колокольчик
    banner: (t) => {
      pad([N(10), N(13)], t, { peak: 0.035, attack: 0.3, decay: 1.4, cutoff: 1200 });
      bell(N(13), t + 0.12, { peak: 0.06, decay: 0.9 });
    },
    gift: (t) => {
      pad([N(10), N(12), N(13)], t, { peak: 0.035, attack: 0.25, decay: 1.8, cutoff: 1300 });
      [15, 18, 20].forEach((i, k) => bell(N(i), t + 0.08 + k * 0.11, { peak: 0.09, decay: 0.8 }));
    },

    // ---------- лиса ----------
    // рывок: короткий мягкий «вжух» и тон вверх
    dash: (t) => {
      whoosh(t, 0.18, { from: wobble(480, 0.06), to: wobble(1150, 0.06), q: 0.8, peak: 0.115, attack: 0.05, release: 0.09 });
      tone(N(10), t, { to: N(13), glide: 0.1, peak: 0.045, attack: 0.012, decay: 0.12 });
    },
    land: (t) => tock(wobble(200, 0.06), t, { peak: 0.09, decay: 0.07 }),
    // больно: глухой низкий стук и короткое «ой» вниз — не гудок
    hurt: (t) => {
      hurtAt = t;
      thud(150, t, { peak: 0.24, decay: 0.16, slide: 0.6 });
      tone(N(13), t + 0.02, { to: N(10), glide: 0.14, peak: 0.1, decay: 0.2 });
    },
    // удар принял щит: стук по коре с тихим отзвуком
    shield: (t) => {
      tock(330, t, { peak: 0.11, decay: 0.07 });
      tone(N(17), t, { peak: 0.045, decay: 0.22 });
    },
    // жизнь потеряна: удар (если его только что не дало ранение) и три ноты вниз
    die: (t) => {
      dieAt = t;
      if (t - hurtAt > 0.15) thud(110, t, { peak: 0.22, decay: 0.3, slide: 0.5 });
      [13, 12, 10].forEach((i, k) => pluck(N(i), t + 0.08 + k * 0.24, { peak: 0.12, decay: k === 2 ? 0.65 : 0.3, from: 1 }));
    },
    // возрождение у норы: аккорд и четыре ноты вверх
    respawn: (t) => {
      pad([N(10), N(13)], t, { peak: 0.035, attack: 0.25, decay: 1 });
      [10, 12, 13, 15].forEach((i, k) => tone(N(i), t + 0.1 + k * 0.09, { peak: 0.07, attack: 0.01, decay: 0.3 }));
    },
    // маны нет: пустое «пу-пу» вниз
    nomana: (t) => {
      tock(N(10), t, { peak: 0.09, decay: 0.06 });
      tock(N(8), t + 0.09, { peak: 0.08, decay: 0.08 });
    },

    // ---------- охота ----------
    // поимка: весёлый щипок из двух нот; чем длиннее цепочка (n), тем выше. Пойманные одним рывком звучат друг
    // за другом, по ноте, — выходит пробежка вверх
    catch: (t, { n, v } = {}) => {
      const step = Math.max(0, Math.min(7, Math.round(Number(n) || Number(v) || 1) - 1));
      const next = catchAt + 0.055;
      if (next > t) {
        if (next - t > 0.3) return;                                // очередь не копим
        catchAt = next;                                            // прежняя поимка ещё звучит — эта встаёт следом
      } else {
        pluck(N(12 + step), t, { peak: 0.075, decay: 0.07 });
        catchAt = t + 0.055;
      }
      pluck(N(13 + step), catchAt, { peak: 0.115, decay: 0.2 });
    },
    // кролик ушёл в нору: «у-у» вниз
    escape: (t) => tone(N(14), t, { to: N(12), glide: 0.12, peak: 0.06, decay: 0.17 }),
    hit: (t) => tock(wobble(250), t, { peak: 0.1, decay: 0.06 }),
    crit: (t) => {
      tock(wobble(250), t, { peak: 0.11, decay: 0.07 });
      pluck(N(19), t + 0.015, { peak: 0.08, decay: 0.13 });
    },
    // враг повержен: «пуф»
    kill: (t) => {
      bup(wobble(N(8)), t, { peak: 0.11, decay: 0.14, drop: 2 });
      whoosh(t, 0.12, { from: 900, to: 400, q: 0.8, peak: 0.07, attack: 0.01, release: 0.08 });
    },
    bush: (t) => {
      whoosh(t, 0.16, { from: 1100, to: 700, peak: 0.1, attack: 0.03, release: 0.09 });
      tock(wobble(180), t, { peak: 0.06, decay: 0.06 });
    },
    // пенёк: деревянное «ту-тук»
    stump: (t) => {
      tock(wobble(230), t, { peak: 0.11, decay: 0.07 });
      tock(wobble(160), t + 0.06, { peak: 0.09, decay: 0.09 });
    },
    // укололась о колючего: «тык» вниз и стук
    spiky: (t) => {
      tone(700, t, { type: 'triangle', to: 350, glide: 0.09, peak: 0.1, decay: 0.12, lp: 1400 });
      tock(170, t + 0.02, { peak: 0.1, decay: 0.08 });
    },

    // ---------- оружие ----------
    shot: (t) => bup(wobble(330), t, { peak: 0.1, decay: 0.07, drop: 1.6 }),
    heavy: (t) => {
      bup(wobble(175), t, { peak: 0.11, decay: 0.11, drop: 1.8 });
      tock(95, t, { peak: 0.09, decay: 0.08 });
    },
    // дробь: хлопок с шорохом
    spread: (t) => {
      bup(wobble(294), t, { peak: 0.09, decay: 0.06, drop: 1.5 });
      whoosh(t, 0.08, { from: 1100, to: 600, q: 0.8, peak: 0.08, attack: 0.004, release: 0.05 });
    },
    // лук: тетива и свист стрелы
    bow: (t) => {
      tone(wobble(494), t, { type: 'triangle', to: 370, glide: 0.06, peak: 0.09, decay: 0.09, lp: 1100 });
      whoosh(t, 0.08, { from: 700, to: 1200, q: 1, peak: 0.06 });
    },
    // посох: две ноты плывут вверх
    magic: (t) => {
      tone(N(16), t, { to: N(18), glide: 0.12, peak: 0.07, attack: 0.012, decay: 0.2 });
      tone(N(19), t + 0.02, { to: N(21), glide: 0.12, peak: 0.035, attack: 0.012, decay: 0.16 });
    },
    // молния: два быстрых «пиу» вниз, верх срезан — без треска
    zap: (t) => {
      tone(1100, t, { type: 'triangle', to: 280, glide: 0.06, peak: 0.08, decay: 0.08, lp: 1300 });
      tone(880, t + 0.05, { type: 'triangle', to: 330, glide: 0.05, peak: 0.05, decay: 0.07, lp: 1300 });
    },
    // луч: мягкая волна гула — плавно входит и уходит; подряд (раз в MIN_GAP) волны сливаются в ровное гудение
    beam: (t) => {
      shape(N(13), t, [[0.1, 0.035], [0.26, 0]], { type: 'sine' });
      shape(N(16), t, [[0.1, 0.02], [0.24, 0]], { type: 'sine' });
    },
    lob: (t) => tone(N(10), t, { to: N(15), glide: 0.14, peak: 0.09, attack: 0.01, decay: 0.16 }),
    // взрыв: мягкий «бумф» — низкий удар и глухой шум
    boom: (t) => {
      tock(wobble(165), t, { peak: 0.115, decay: 0.18 });
      whoosh(t, 0.18, { from: 620, to: 200, q: 0.6, peak: 0.115, attack: 0.005, release: 0.12 });
    },
    // лёд: стеклянное «тинь»
    ice: (t) => {
      tone(N(22), t, { peak: 0.04, attack: 0.003, decay: 0.12 });
      tone(N(19), t, { peak: 0.05, attack: 0.003, decay: 0.18 });
    },
    fire: (t) => {
      whoosh(t, 0.22, { from: 450, to: 1000, q: 0.8, peak: 0.1, attack: 0.06, release: 0.11 });
      tone(N(8), t, { to: N(11), glide: 0.16, peak: 0.07, attack: 0.02, decay: 0.2 });
    },
    swing: (t) => whoosh(t, 0.11, { from: wobble(600, 0.08), to: wobble(1200, 0.08), q: 0.8, peak: 0.115, attack: 0.03, release: 0.06 }),
    trap: (t) => {
      tock(310, t, { peak: 0.1, decay: 0.05 });
      tock(465, t + 0.045, { peak: 0.08, decay: 0.05 });
    },

    // ---------- враги и красные зоны ----------
    // красная зона: два низких приглушённых толчка
    warn: (t) => {
      tock(N(10), t, { peak: 0.115, decay: 0.11 });
      tock(N(10), t + 0.14, { peak: 0.1, decay: 0.13 });
    },
    // лось несётся: низкий катящийся топот
    moose: (t) => {
      shape(96, t, ROLL, { to: 72, lp: 380 });
      shape(192, t, ROLL_HIGH, { type: 'sine', to: 144 });
      whoosh(t, 1, { from: 380, to: 230, q: 0.7, peak: 0.14, attack: 0.3, release: 0.5 });
    },
    // медвежья лапа: глубокий удар
    paw: (t) => {
      thud(96, t, { peak: 0.15, decay: 0.26, slide: 0.55 });
      tock(230, t, { peak: 0.13, decay: 0.12 });
      whoosh(t, 0.14, { from: 480, to: 200, q: 0.7, peak: 0.1, attack: 0.004, release: 0.1 });
    },
    growl: (t) => {
      shape(wobble(110), t, GROWL, { to: 86, lp: 520 });
      shape(220, t, GROWL_HIGH, { type: 'sine', to: 172 });
    },
    spit: (t) => tone(wobble(520), t, { to: 300, glide: 0.07, peak: 0.07, decay: 0.09 }),
    // враг вылезает: тихое «вуп» вверх
    spawn: (t) => tone(wobble(262), t, { to: 392, glide: 0.1, peak: 0.07, attack: 0.012, decay: 0.14 }),

    // ---------- комнаты и события ----------
    // двери открылись: шорох веток и два стука вверх
    door: (t) => {
      whoosh(t, 0.3, { from: 700, to: 1300, q: 0.7, peak: 0.07 });
      tock(N(7), t, { peak: 0.12, decay: 0.09 });
      tock(N(9), t + 0.12, { peak: 0.1, decay: 0.1 });
    },
    // …закрылись: шорох и два стука вниз, второй тяжёлый
    lock: (t) => {
      whoosh(t, 0.25, { from: 1300, to: 600, q: 0.7, peak: 0.07 });
      tock(N(9), t, { peak: 0.12, decay: 0.08 });
      thud(N(4), t + 0.12, { peak: 0.2, decay: 0.16, slide: 0.7 });
    },
    // комната пройдена: маленький тёплый перезвон
    clear: (t) => {
      pad([N(10), N(13)], t, { peak: 0.03, attack: 0.15, decay: 1.2, cutoff: 1200 });
      [13, 15, 17].forEach((i, k) => bell(N(i), t + k * 0.1, { peak: 0.075, decay: 0.55 + k * 0.12 }));
    },
    task: (t) => {
      bell(N(13), t, { peak: 0.08, decay: 0.4 });
      bell(N(16), t + 0.14, { peak: 0.08, decay: 0.55 });
    },
    taskok: (t) => [15, 17, 18, 20].forEach((i, k) => bell(N(i), t + k * 0.07, { peak: 0.085, decay: 0.5 })),
    taskfail: (t) => {
      pluck(N(13), t, { peak: 0.09, decay: 0.2, from: 1 });
      pluck(N(12), t + 0.17, { peak: 0.09, decay: 0.32, from: 1.06 });
    },
    // хозяин места: медленный низкий мотив над гулом
    boss: (t) => {
      pad([N(4), N(7)], t, { peak: 0.04, attack: 0.5, decay: 2.2, cutoff: 700 });
      [4, 5, 4, 3].forEach((i, k) => low(N(i), t + 0.1 + k * 0.46, { peak: 0.18, decay: k === 3 ? 1.3 : 0.5 }));
    },
    bossdie: (t) => {
      thud(98, t, { peak: 0.24, decay: 0.4, slide: 0.6 });
      [14, 15, 17, 19].forEach((i, k) => bell(N(i), t + 0.12 + k * 0.11, { peak: 0.11, decay: 0.7 }));
      pad([N(10), N(12), N(13), N(15)], t + 0.5, { peak: 0.03, attack: 0.4, decay: 2.2, cutoff: 1300 });
    },
    // следующая локация: «вжух» и пробежка вверх
    floor: (t) => {
      whoosh(t, 0.6, { from: 300, to: 1300, q: 1, peak: 0.09 });
      [10, 11, 12, 13, 14, 15].forEach((i, k) => tone(N(i), t + 0.05 + k * 0.07, { peak: 0.07, decay: 0.2 }));
      bell(N(18), t + 0.5, { peak: 0.09, decay: 0.8 });
    },
    // охота окончена: четыре ноты плавно вниз и тихий аккорд — после того, как доиграет «жизнь потеряна»
    gameover: (t) => {
      const at = Math.max(t, dieAt + 0.9);
      [14, 13, 12, 10].forEach((i, k) => pluck(N(i), at + k * 0.27, { peak: 0.12, decay: k === 3 ? 1 : 0.45, from: 1 }));
      pad([N(5), N(8)], at + 0.8, { peak: 0.04, attack: 0.4, decay: 1.8, cutoff: 900 });
    },
    record: (t) => {
      [13, 15, 17, 18, 20].forEach((i, k) => bell(N(i), t + k * 0.09, { peak: 0.11, decay: 0.6 }));
      bell(N(17), t + 0.52, { peak: 0.09, decay: 1.1 });
      bell(N(20), t + 0.52, { peak: 0.09, decay: 1.1 });
    },
    hire: (t) => {
      plip(N(15), t, { peak: 0.1, decay: 0.09 });
      plip(N(17), t + 0.1, { peak: 0.1, decay: 0.12 });
      bell(N(18), t + 0.22, { peak: 0.07, decay: 0.5 });
    },
    // жертвенный камень: низкий колокол и тон, уходящий вниз
    altar: (t) => {
      thud(82, t, { peak: 0.22, decay: 0.35, slide: 0.7 });
      bell(N(9), t + 0.04, { peak: 0.12, decay: 1.2 });
      tone(N(14), t + 0.1, { to: N(9), glide: 0.45, peak: 0.06, attack: 0.03, decay: 0.5 });
    },
    // колодец: монетка звякнула, булькнула — и отзвук из глубины
    well: (t) => {
      tone(N(19), t, { peak: 0.05, attack: 0.003, decay: 0.08 });
      plip(N(12), t + 0.34, { peak: 0.13, decay: 0.13 });
      plip(N(12), t + 0.52, { peak: 0.05, decay: 0.13 });
    },
    // кузница: два удара молотка со звоном
    forge: (t) => [0, 0.24].forEach((at, k) => {
      tock(190, t + at, { peak: 0.14, decay: 0.06 });
      tone(N(17 + k), t + at, { peak: 0.06, attack: 0.003, decay: 0.26 });
      tone(N(19 + k), t + at, { peak: 0.03, attack: 0.003, decay: 0.18 });
    }),
    heal: (t) => {
      pad([N(10), N(12), N(13)], t, { peak: 0.035, attack: 0.2, decay: 1.2 });
      [12, 13, 15].forEach((i, k) => tone(N(i), t + 0.08 + k * 0.11, { peak: 0.07, attack: 0.012, decay: 0.4 }));
    },
  };

  const last = new Map();        // звук → когда звучал в последний раз
  const frequent = new Set(FREQUENT);
  let beat = -1;                 // последний отсчёт часов, на котором что-то звучало…
  let crowd = 0;                 // …и сколько звуков на нём начато

  // ---------- музыка ----------

  let cur = null;                // дорожка, которая играет
  let fading = [];               // уходящие дорожки — до конца затухания
  let timer = null;
  let volume = 1;
  const marks = new Map();       // место → где его музыка остановилась: в другой раз продолжит с того же созвучия
  let turn = Math.floor(Math.random() * 0x100000000);        // зерно очередной дорожки, если игра не дала своего

  /** Запомнить, где дорожка остановилась: с начала созвучия, которое сейчас звучит. */
  const remember = (tr) => marks.set(tr.mood, { seed: tr.seed, pass: tr.pass, step: tr.step - (tr.step % tr.score.unit) });

  const levelAt = ({ fade }, t) => (t >= fade.t1 ? fade.to
    : t <= fade.t0 ? fade.from
      : fade.from + ((fade.to - fade.from) * (t - fade.t0)) / (fade.t1 - fade.t0));

  /** Плавно довести громкость дорожки до to. Где она сейчас, считаем сами: читать параметр браузеры умеют по-разному. */
  function fade(tr, to, t, dur) {
    const from = levelAt(tr, t);
    const g = tr.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, from), t);
    g.linearRampToValueAtTime(Math.max(0.0001, to), t + dur);
    tr.fade = { from, to, t0: t, t1: t + dur };
  }

  const passSeed = (seed, pass) => (seed + Math.imul(pass, 0x9e3779b1)) >>> 0;

  /** Новая дорожка: своя шина (громкость → срез верха → выход), эхо для щипков и гул опорной ноты. */
  function begin(mood, seed, pass, step, t) {
    const m = TUNES[mood];
    const score = composeMusic(mood, passSeed(seed, pass));
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = m.cutoff;
    lp.Q.value = 0.5;
    out.connect(lp);
    lp.connect(ctx.destination);
    const send = ctx.createGain();
    send.gain.value = m.echo;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = m.echoSteps * score.stepDur;
    const back = ctx.createGain();
    back.gain.value = ECHO_BACK;
    send.connect(delay);
    delay.connect(back);
    back.connect(delay);
    delay.connect(out);
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.setValueAtTime(noteOf(m.root), t);
    const humGain = ctx.createGain();
    humGain.gain.value = m.hum;
    hum.connect(humGain);
    humGain.connect(out);
    hum.start(t);
    const tr = {
      mood, seed, pass, score, step, next: t + 0.08, wave: m.wave, out, send, hum,
      parts: [out, lp, send, delay, back, humGain],
      live: [],                  // ноты, которые ещё звучат: { o, end }
      born: t, end: Infinity, gone: false,
      fade: { from: 0, to: 0, t0: t, t1: t },
    };
    hum.onended = () => drop(tr);
    fade(tr, MUSIC_LEVEL * volume, t, FADE_IN);
    return tr;
  }

  /** Одна нота дорожки: осциллятор и его громкость. Щипки (перебор, мелодия) идут ещё и в эхо. */
  function voice(tr, n, t) {
    const end = t + n.len;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    if (n.kind === 'pad') {
      o.type = 'sine';
      o.frequency.setValueAtTime(n.f, t);
      g.gain.linearRampToValueAtTime(n.vel, t + PAD_IN);
      g.gain.setValueAtTime(n.vel, end - PAD_OUT);
      g.gain.linearRampToValueAtTime(0.0001, end);
    } else if (n.kind === 'pulse') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(n.f * 1.7, t);
      o.frequency.exponentialRampToValueAtTime(n.f, t + 0.05);
      g.gain.exponentialRampToValueAtTime(n.vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, end);
    } else {
      o.type = tr.wave;
      o.frequency.setValueAtTime(n.f, t);
      g.gain.exponentialRampToValueAtTime(n.vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, end);
      g.connect(tr.send);
    }
    o.connect(g);
    g.connect(tr.out);
    o.start(t);
    o.stop(end + 0.05);
    tr.live.push({ o, end: end + 0.05 });
  }

  function hush(o, at) {
    try {
      o.stop(at);
    } catch {
      // старый браузер не даёт остановить дважды — нота доиграет сама, её уже не слышно
    }
  }

  /** Отыгравшую дорожку — отключить от выхода. */
  function drop(tr) {
    if (tr.gone) return;
    tr.gone = true;
    for (const node of tr.parts) node.disconnect();
    tr.live.length = 0;
  }

  /** Увести дорожку за dur секунд и остановить всё, что в ней звучит. */
  function retire(tr, t, dur) {
    if (tr.gone) return;
    const heard = ctx.currentTime > tr.born;         // часы не шли с её рождения — её никто не слышал: убрать сразу
    const stopAt = heard ? t + dur + 0.05 : t;
    if (tr.end <= stopAt) return;                    // уже уходит, и не медленнее
    tr.end = stopAt;
    if (heard) fade(tr, 0, t, dur);
    for (const v of tr.live) {
      if (v.end > stopAt) {
        v.end = stopAt;
        hush(v.o, stopAt);
      }
    }
    hush(tr.hum, stopAt);
    if (!heard) drop(tr);
  }

  /** Уборка: отыгравшие ноты — забыть, затихшие дорожки — отключить. */
  function sweep(t) {
    if (fading.length) {
      for (const tr of fading) if (tr.end + 0.2 <= t) drop(tr);
      fading = fading.filter((tr) => !tr.gone);
    }
    if (cur) {
      let k = 0;
      for (const v of cur.live) if (v.end > t) cur.live[k++] = v;
      cur.live.length = k;
    }
  }

  /** Шаг расписания: поставить ноты, которые начнутся в ближайшие полсекунды. Зовёт таймер; можно и руками. */
  function tick() {
    const t = ctx.currentTime;
    sweep(t);
    const tr = cur;
    if (!tr) return;
    const { steps, stepDur } = tr.score;
    if (tr.next < t - LATE) {                        // таймер проспал (вкладку усыпляли): пропущенное скопом не играем
      const skip = Math.ceil((t - tr.next) / stepDur);
      tr.step += skip;
      tr.next += skip * stepDur;
    }
    while (tr.next < t + AHEAD) {
      if (tr.step >= steps) {                        // круг пройден — следующий сочиняется заново
        tr.pass += Math.floor(tr.step / steps);
        tr.step %= steps;
        tr.score = composeMusic(tr.mood, passSeed(tr.seed, tr.pass));
      }
      const at = Math.max(tr.next, t + 0.01);
      for (const n of tr.score.at[tr.step]) voice(tr, n, at);
      tr.step += 1;
      tr.next += stepDur;
    }
  }

  return {
    has: (name) => Object.hasOwn(play, name),
    play(name, opts) {
      if (!Object.hasOwn(play, name)) return;
      const t = now();
      if (t - (last.get(name) ?? -9) < (MIN_GAP[name] ?? REST_GAP)) return;      // не чаще — иначе трещит
      if (t !== beat) {
        beat = t;
        crowd = 0;
      }
      // слишком много разом — или часы стоят: пока контекст на паузе, всё поставленное грянет разом, когда звук включат
      if (crowd >= (ctx.state === 'suspended' ? CROWD_HELD : frequent.has(name) ? CROWD : CROWD_MAX)) return;
      crowd += 1;
      last.set(name, t);
      play[name](t, opts ?? {});
    },
    /**
     * Музыка места или тишина (null). Смена места — плавный переход за полторы секунды; тишина — за 0,6 с, и все
     * осцилляторы и таймер останавливаются. Место, которое уже играло, продолжает с того созвучия, где его
     * остановили (пауза, комната хозяина и обратно), а не с начала.
     * seed — зерно мелодии: без него у нового места каждый раз своё; с другим зерном место начинает заново.
     */
    music(mood, seed) {
      const t = ctx.currentTime;
      sweep(t);
      if (mood == null) {
        if (cur) {
          remember(cur);
          fading.push(cur);
          cur = null;
        }
        for (const tr of fading) retire(tr, t, FADE_OUT);
        if (timer !== null) {
          cancel(timer);
          timer = null;
        }
        return;
      }
      if (!Object.hasOwn(TUNES, mood) || cur?.mood === mood) return;
      if (cur) {
        remember(cur);
        retire(cur, t, FADE_IN);
        fading.push(cur);
        if (fading.length > 2) retire(fading[0], t, 0.15);      // места меняют слишком быстро — старое уходит сразу
      }
      const given = Number.isFinite(seed);
      const mark = marks.get(mood);
      if (mark && (!given || mark.seed === seed >>> 0)) {
        cur = begin(mood, mark.seed, mark.pass, mark.step, t);
      } else {
        turn = (turn + 0x9e3779b9) >>> 0;
        cur = begin(mood, given ? seed >>> 0 : turn, 0, 0, t);
      }
      if (timer === null) timer = every(tick, TICK_MS);
      tick();
    },
    tick,
    /** Громкость музыки 0…1 (доля от обычной). */
    setMusicVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (cur) fade(cur, MUSIC_LEVEL * volume, ctx.currentTime, 0.25);
    },
    /** Какое место сейчас играет (null — тишина). */
    get mood() {
      return cur?.mood ?? null;
    },
  };
}
