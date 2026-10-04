// Ремонт телефона — правила без DOM: заказ (клиент, модель, поломки), устройство телефона, действия
// инструментами, проверка при сдаче, звёзды и подсказка «что делать дальше».
//
// Телефон устроен как настоящий (порядок — как в инструкциях iFixit), только проще:
//   сзади — задняя крышка на клею (прогреть феном → снять присоской); под ней экран платы (4 винта) — под ним
//   разъёмы батареи (bat), дисплея (disp) и камеры (cam) и плата; камера, батарея; внизу планка (2 винта) — под ней
//   динамик и плата зарядки с разъёмом usb. Спереди — дисплей на клею, шлейф которого подключён с обратной стороны.
//   Снаружи — гнездо зарядки (jack) и кнопка питания.
// Главное правило: шлейфы (disp, cam, usb) и мокрую плату трогать только при отключённой батарее — иначе искра
// (−1 звезда). Поставить новую деталь вместо исправной — тоже −1 звезда; сдать неисправный телефон — −1 звезда.
// Подсказка — не больше двух звёзд за заказ. Меньше одной звезды не бывает.

export const TOOLS = ['heat', 'suction', 'screwdriver', 'spudger', 'tweezers', 'parts', 'brush', 'alcohol', 'magnifier', 'charger', 'antivirus', 'flash'];
export const PARTS = ['cover', 'shield', 'bracket', 'battery', 'camera', 'speaker', 'port', 'display'];
/** Винт → деталь, которую он держит. */
export const SCREWS = { s1: 'shield', s2: 'shield', s3: 'shield', s4: 'shield', s5: 'bracket', s6: 'bracket' };
export const SCREW_IDS = Object.keys(SCREWS);
/** Разъём → деталь, чей это шлейф. */
export const CONNS = { bat: 'battery', disp: 'display', cam: 'camera', usb: 'port' };
export const CONN_IDS = Object.keys(CONNS);
/** Разъём → что его закрывает. */
const CONN_UNDER = { bat: 'shield', disp: 'shield', cam: 'shield', usb: 'bracket' };
const CONN_OF = { battery: 'bat', display: 'disp', camera: 'cam', port: 'usb' };
export const SIDE = {
  cover: 'back', shield: 'back', bracket: 'back', battery: 'back', camera: 'back', speaker: 'back', port: 'back', display: 'front',
};
const INSIDE = ['shield', 'bracket', 'battery', 'camera', 'speaker', 'port'];

// ---------- поломки ----------

export const FAULTS = [
  'virus', 'bootloop', 'screen-crack', 'screen-flex', 'battery-swollen', 'battery-worn', 'loose-battery', 'water',
  'port-dirty', 'port-broken', 'speaker-dust', 'speaker-broken', 'camera-glass', 'camera-module',
];
/** Поломки одной группы вместе не бывают (у телефона одна батарея и один экран). */
export const GROUPS = {
  soft: ['virus', 'bootloop'],
  screen: ['screen-crack', 'screen-flex'],
  battery: ['battery-swollen', 'battery-worn', 'loose-battery'],
  water: ['water'],
  port: ['port-dirty', 'port-broken'],
  speaker: ['speaker-dust', 'speaker-broken'],
  camera: ['camera-glass', 'camera-module'],
};
const GROUP_WEIGHT = { soft: 4, screen: 4, battery: 4, water: 2, port: 3, speaker: 2, camera: 2 };
/** Первые заказы — по одной новой поломке, от простого к сложному. */
export const TUTORIAL = [
  'virus', 'screen-crack', 'port-dirty', 'battery-swollen', 'screen-flex', 'speaker-dust', 'loose-battery',
  'camera-glass', 'bootloop', 'port-broken', 'water', 'speaker-broken', 'battery-worn', 'camera-module',
];

/** Жалобы клиентов: по несколько на поломку, похожие у разных поломок — чтобы было что диагностировать. */
export const COMPLAINTS = {
  virus: [
    'Везде реклама, и телефон сам что-то качает.',
    'Выскакивает «Вы выиграли миллион!», всё тормозит.',
    'Поставил «ускоритель телефона» — и началось: окна, реклама, жуки какие-то.',
  ],
  bootloop: [
    'Обновлялся ночью — теперь висит на логотипе.',
    'Включается, показывает логотип — и всё, дальше никак.',
  ],
  'screen-crack': [
    'Уронил на плитку — экран вдребезги.',
    'Сел на телефон. Экран в трещинах.',
    'Выпал из кармана на асфальт, стекло паутиной.',
  ],
  'screen-flex': [
    'После падения экран чёрный, но звонки слышно.',
    'Экран мигает и гаснет, хотя ни одной трещины.',
  ],
  'battery-swollen': [
    'Крышка сзади отходит, телефон стал толще.',
    'Телефон качается на столе, будто его раздуло.',
  ],
  'battery-worn': [
    'Включается на секунду и сразу гаснет.',
    'Садится мгновенно, даже если ничего не делать.',
  ],
  'loose-battery': [
    'Уронил — и он больше не включается.',
    'Не включается совсем, даже на зарядке.',
  ],
  water: [
    'Утопил в ванной, теперь не включается.',
    'Упал в лужу, выключился и больше не оживал.',
  ],
  'port-dirty': [
    'Зарядка вставляется не до конца и не заряжает.',
    'Заряжается, только если держать провод под углом.',
  ],
  'port-broken': [
    'Не заряжается, а разъём пахнет горелым.',
    'Поставил на дешёвую зарядку — щёлкнуло, и всё, не заряжается.',
  ],
  'speaker-dust': [
    'Музыку еле слышно, звук глухой.',
    'Звук будто через подушку.',
  ],
  'speaker-broken': [
    'Динамик хрипел, а теперь молчит.',
    'Звука нет совсем, даже будильник не слышно.',
  ],
  'camera-glass': [
    'На всех фото мутное пятно.',
    'Камера снимает как через туман.',
  ],
  'camera-module': [
    'Камера показывает чёрный экран.',
    'Камера не открывается — чёрный квадрат.',
  ],
};

export const MODELS = [
  { name: 'Грушафон 12', logo: 'pear' },
  { name: 'Комета S9', logo: 'star' },
  { name: 'Нимбус 5', logo: 'cloud' },
  { name: 'Ёжик Мини', logo: 'dot' },
  { name: 'Орбита Про', logo: 'ring' },
  { name: 'Листик 8', logo: 'leaf' },
  { name: 'Капля X', logo: 'drop' },
];
export const COLORS = ['graphite', 'white', 'mint', 'lavender', 'coral', 'blue', 'yellow', 'red'];
export const NAMES = [
  'Аня', 'Борис', 'Вика', 'Гоша', 'Даша', 'Егор', 'Женя', 'Зоя', 'Илья', 'Катя', 'Лёша', 'Маша', 'Никита', 'Оля',
  'Петя', 'Рита', 'Саша', 'Тимур', 'Уля', 'Фёдор', 'Баба Валя', 'Дед Миша',
];

/** Генератор случайных чисел по зерну (mulberry32): один заказ — одно зерно. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** Поломки заказа: сначала обучение по одной, дальше — 1–3 из разных групп (чем дальше, тем больше). */
export function faultsFor(level, rng) {
  if (level <= TUTORIAL.length) return [TUTORIAL[level - 1]];
  const r = rng();
  const n = level < 25 ? (r < 0.3 ? 2 : 1) : level < 50 ? (r < 0.55 ? 2 : 1) : (r < 0.3 ? 3 : r < 0.75 ? 2 : 1);
  const groups = Object.keys(GROUPS);
  const chosen = [];
  while (chosen.length < n) {
    const left = groups.filter((g) => !chosen.includes(g));
    const total = left.reduce((a, g) => a + GROUP_WEIGHT[g], 0);
    let x = rng() * total;
    let g = left[left.length - 1];
    for (const k of left) {
      x -= GROUP_WEIGHT[k];
      if (x < 0) {
        g = k;
        break;
      }
    }
    chosen.push(g);
  }
  return chosen.map((g) => pick(rng, GROUPS[g]));
}

export const bugsFor = (level) => Math.min(8, 3 + Math.floor(level / 8));

// ---------- заказ ----------

/** Заказ номер level (всегда один и тот же); faults — задать поломки самому (для проверки). */
export function newOrder(level, only = null) {
  const rng = seeded(level * 7919 + 101);
  const auto = faultsFor(level, rng);
  const faults = Array.isArray(only) ? only.filter((f) => FAULTS.includes(f)) : auto;
  const model = pick(rng, MODELS);
  const s = {
    v: 1,
    level,
    model: { name: model.name, logo: model.logo, color: pick(rng, COLORS), cams: rng() < 0.5 ? 2 : 3 },
    customer: {
      name: pick(rng, NAMES),
      skin: Math.floor(rng() * 4),
      hair: Math.floor(rng() * 5),
      hairColor: Math.floor(rng() * 5),
      bg: Math.floor(rng() * 6),
      glasses: rng() < 0.3,
    },
    complaint: faults.map((f) => [f, Math.floor(rng() * COMPLAINTS[f].length)]),
    crack: { x: 0.25 + rng() * 0.5, y: 0.2 + rng() * 0.5, seed: Math.floor(rng() * 1e9) },
    faults,
    view: 'front',
    parts: Object.fromEntries(PARTS.map((p) => [p, { in: true, broken: '', fresh: false }])),
    screws: Object.fromEntries(SCREW_IDS.map((id) => [id, true])),
    conns: { bat: 'on', disp: 'on', cam: 'on', usb: 'on' },
    hot: { cover: false, display: false },
    dirt: { jack: false, speaker: false, board: false },
    wet: false,
    virus: 0,
    scanned: false,
    bootloop: false,
    power: false,
    sparks: 0,
    waste: 0,
    returns: 0,
    hints: 0,
    moves: 0,
    notes: [],
    done: false,
  };
  for (const f of faults) applyFault(s, f);
  return s;
}

function applyFault(s, f) {
  const p = s.parts;
  switch (f) {
    case 'virus': s.virus = bugsFor(s.level); break;
    case 'bootloop': s.bootloop = true; break;
    case 'screen-crack': p.display.broken = 'crack'; break;
    case 'screen-flex': s.conns.disp = 'loose'; break;
    case 'battery-swollen': p.battery.broken = 'swollen'; break;
    case 'battery-worn': p.battery.broken = 'worn'; break;
    case 'loose-battery': s.conns.bat = 'loose'; break;
    case 'water': s.dirt.board = true; s.wet = true; break;
    case 'port-dirty': s.dirt.jack = true; break;
    case 'port-broken': p.port.broken = 'burnt'; break;
    case 'speaker-dust': s.dirt.speaker = true; break;
    case 'speaker-broken': p.speaker.broken = 'torn'; break;
    case 'camera-glass': p.cover.broken = 'glass'; break;
    case 'camera-module': p.camera.broken = 'dead'; break;
    default: break;
  }
}

// ---------- состояние телефона ----------

/** Есть ли питание: батарея на месте и подключена, плата не залита. Изношенная батарея гаснет сразу. */
export const canPower = (s) => s.parts.battery.in && s.conns.bat === 'on' && !s.dirt.board;
export const chargeOk = (s) => s.parts.port.in && !s.parts.port.broken && !s.dirt.jack && s.conns.usb === 'on';

/** Что на экране включённого телефона: none — выключен или нет дисплея, dark, flicker, logo, home. */
export function screenOf(s) {
  if (!s.power || !s.parts.display.in) return 'none';
  if (s.conns.disp === 'loose') return 'flicker';
  if (s.conns.disp !== 'on') return 'dark';
  if (s.bootloop) return 'logo';
  return 'home';
}

/** Телефон собран: все детали и винты на месте (разъёмы проверяет уже сдача). */
export const assembled = (s) => PARTS.every((p) => s.parts[p].in) && SCREW_IDS.every((id) => s.screws[id]);

/** Чего не хватает до сборки: детали и число винтов. */
export function missing(s) {
  return {
    parts: PARTS.filter((p) => !s.parts[p].in),
    screws: SCREW_IDS.filter((id) => !s.screws[id]).length,
  };
}

/** Что не так с телефоном (проверка при сдаче): пусто — всё работает. */
export function symptoms(s) {
  const p = s.parts;
  const out = [];
  if (p.battery.broken === 'swollen') out.push('swollen');
  if (!canPower(s)) {
    out.push('no-power');
    return out;
  }
  if (p.battery.broken === 'worn') out.push('drains');
  if (s.bootloop) out.push('bootloop');
  if (!p.display.in || s.conns.disp !== 'on') out.push('no-screen');
  else if (p.display.broken) out.push('cracked');
  if (!chargeOk(s)) out.push('no-charge');
  if (!p.speaker.in || p.speaker.broken) out.push('no-sound');
  else if (s.dirt.speaker) out.push('quiet');
  if (!p.camera.in || p.camera.broken || s.conns.cam !== 'on') out.push('no-camera');
  else if (p.cover.broken) out.push('blurry');
  if (s.virus > 0 && !s.bootloop) out.push('virus');
  return out;
}

/** Звёзды за заказ: 3 (с подсказкой — 2) минус искры, лишние детали и возвраты; не меньше 1. */
export const starsFor = (s) => Math.max(1, (s.hints ? 2 : 3) - s.sparks - s.waste - s.returns);

// ---------- действия ----------

const no = (why, extra = {}) => ({ ok: false, why, ...extra });
const yes = (extra = {}) => ({ ok: true, ...extra });

/** На какой стороне цель: back, front или any (гнездо, кнопка — видны всегда). */
export function sideOf(target) {
  if (SIDE[target]) return SIDE[target];
  if (target in SCREWS || target in CONNS || target === 'board' || target === 'indicator') return 'back';
  if (target === 'screen' || target === 'bug') return 'front';
  return 'any';
}

/** Можно ли дотянуться до цели (с нужной стороны и ничего не мешает); '' — можно, иначе причина. */
export function reach(s, target) {
  const side = sideOf(target);
  if (side !== 'any' && side !== s.view) return 'flip';
  const p = s.parts;
  if (target === 'cover' || target === 'display') return '';
  if (target === 'screen') return p.display.in ? '' : 'no-part';
  if (side === 'back' && p.cover.in) return 'cover';
  if (target in SCREWS) return p[SCREWS[target]].in ? '' : 'no-holder';
  if (target in CONNS) return p[CONN_UNDER[target]].in ? CONN_UNDER[target] : '';
  if (target === 'board') return p.shield.in ? 'shield' : '';
  if (target === 'speaker' || target === 'port') return p.bracket.in ? 'bracket' : '';
  return '';
}

function install(s, t, fresh) {
  const part = s.parts[t];
  const why = reach(s, t);
  if (why) return no(why);
  if (t === 'cover') {
    const m = missing(s);
    if (m.parts.some((x) => x !== 'cover' && x !== 'display') || m.screws) return no('inside-missing');
  }
  let wasted = false;
  if (fresh) {
    if (!part.broken) {
      s.waste++;
      wasted = true;
    }
    part.broken = '';
    part.fresh = true;
    if (t in s.hot) s.hot[t] = false;
  }
  part.in = true;
  if (CONN_OF[t]) s.conns[CONN_OF[t]] = 'off';
  return yes({ installed: t, fresh, wasted });
}

const ACTIONS = {
  flip(s) {
    s.view = s.view === 'back' ? 'front' : 'back';
    return yes({ view: s.view });
  },

  heat(s, t) {
    if (t !== 'cover' && t !== 'display') return no('heat-where');
    const why = reach(s, t);
    if (why) return no(why);
    if (!s.parts[t].in) return no('no-part');
    const already = s.hot[t];
    s.hot[t] = true;
    return yes({ heated: t, already });
  },

  suction(s, t) {
    if (t !== 'cover' && t !== 'display') return no('suction-where');
    const why = reach(s, t);
    if (why) return no(why);
    if (!s.parts[t].in) return no('no-part');
    if (!s.hot[t]) return no('glue');
    if (t === 'display' && s.conns.disp !== 'off') return no('flex-holds');
    s.parts[t].in = false;
    if (t === 'display') s.power = false;
    return yes({ removed: t });
  },

  screwdriver(s, t) {
    if (!(t in SCREWS)) return no('no-screws');
    const why = reach(s, t);
    if (why) return no(why);
    s.screws[t] = !s.screws[t];
    return yes({ screw: t, in: s.screws[t] });
  },

  spudger(s, t) {
    if (!(t in CONNS)) return no(t === 'cover' || t === 'display' ? 'use-suction' : 'spudger-where');
    const why = reach(s, t);
    if (why) return no(why);
    if (!s.parts[CONNS[t]].in) return no('no-part');
    const spark = t !== 'bat' && s.conns.bat === 'on';
    if (spark) s.sparks++;
    const st = s.conns[t] === 'on' ? 'off' : 'on';
    s.conns[t] = st;
    if (t === 'bat' && st === 'off') s.power = false;
    return yes({ conn: t, state: st, spark });
  },

  tweezers(s, t) {
    if (t in SCREWS) return no('use-screwdriver');
    if (!(t in s.parts)) return no('tweezers-where');
    const part = s.parts[t];
    if (!part.in) return install(s, t, false);
    const why = reach(s, t);
    if (why) return no(why);
    if (t === 'cover' || t === 'display') return no('use-suction');
    if (t === 'shield' || t === 'bracket') {
      if (SCREW_IDS.some((id) => SCREWS[id] === t && s.screws[id])) return no('screws');
    }
    if (t === 'battery' && s.conns.bat !== 'off') return no('bat-connected');
    if (CONN_OF[t] && t !== 'battery' && s.conns[CONN_OF[t]] !== 'off') return no('flex', { conn: CONN_OF[t] });
    part.in = false;
    return yes({ removed: t });
  },

  parts(s, t) {
    if (!(t in s.parts)) return no('parts-where');
    if (s.parts[t].in) return no('remove-first');
    return install(s, t, true);
  },

  brush(s, t) {
    if (t === 'jack') {
      if (!s.parts.port.in) return no('no-part');
      if (!s.dirt.jack) return no('clean');
      s.dirt.jack = false;
      return yes({ cleaned: t });
    }
    if (t === 'speaker') {
      const why = reach(s, t);
      if (why) return no(why);
      if (!s.parts.speaker.in) return no('no-part');
      if (!s.dirt.speaker) return no('clean');
      s.dirt.speaker = false;
      return yes({ cleaned: t });
    }
    if (t === 'board') {
      const why = reach(s, t);
      if (why) return no(why);
      return no(s.dirt.board ? 'brush-weak' : 'clean');
    }
    return no('brush-where');
  },

  alcohol(s, t) {
    if (t === 'board') {
      const why = reach(s, t);
      if (why) return no(why);
      if (!s.dirt.board) return no('clean');
      const spark = s.conns.bat === 'on';
      if (spark) s.sparks++;
      s.dirt.board = false;
      return yes({ cleaned: t, spark });
    }
    if ((t === 'jack' && s.dirt.jack) || (t === 'speaker' && s.dirt.speaker)) return no('alcohol-dust');
    return no('alcohol-where');
  },

  magnifier(s, t) {
    const why = t === 'jack' || t === 'button' ? '' : reach(s, t);
    if (why) return no(why);
    const find = inspect(s, t);
    if (!s.notes.includes(find)) s.notes.push(find);
    return yes({ find });
  },

  charger(s, t) {
    if (t !== 'jack') return no('charger-where');
    if (!s.parts.port.in) return no('no-part');
    return yes({ charge: chargeOk(s) && s.parts.battery.in && s.conns.bat === 'on' });
  },

  antivirus(s, t) {
    if (t !== 'screen' && t !== 'display') return no('antivirus-where');
    const why = reach(s, 'screen');
    if (why) return no(why);
    if (!s.power) return no('power-off');
    if (screenOf(s) !== 'home') return no('no-screen');
    if (!s.virus) return yes({ clean: true });
    s.scanned = true;
    return yes({ bugs: s.virus });
  },

  squash(s) {
    if (!s.scanned || !s.virus || !s.power) return no('no-bug');
    s.virus--;
    if (!s.virus) s.scanned = false;
    return yes({ left: s.virus });
  },

  flash(s, t) {
    if (t !== 'jack') return no('flash-where');
    if (!s.parts.port.in) return no('no-part');
    if (!s.bootloop) return no('no-need');
    if (!chargeOk(s)) return no('no-link');
    if (!canPower(s) || s.parts.battery.broken === 'worn') return no('no-power');
    s.bootloop = false;
    s.virus = 0;
    s.scanned = false;
    s.power = true;
    return yes({ flashed: true });
  },

  power(s) {
    if (s.power) {
      s.power = false;
      return yes({ on: false });
    }
    if (!canPower(s)) return yes({ on: false, dead: true });
    if (s.parts.battery.broken === 'worn') return yes({ on: false, blink: true });
    s.power = true;
    return yes({ on: true, screen: screenOf(s) });
  },

  deliver(s) {
    if (!assembled(s)) return no('assemble', { missing: missing(s) });
    const problems = symptoms(s);
    if (problems.length) {
      s.returns++;
      return yes({ win: false, problems });
    }
    s.done = true;
    s.power = true;
    return yes({ win: true });
  },
};

/** Действие инструментом (или flip, squash, power, deliver) над целью; меняет s. → { ok, why?, … }. */
export function act(s, tool, target) {
  if (s.done) return no('done');
  const fn = ACTIONS[tool];
  if (!fn) return no('nothing');
  const r = fn(s, target);
  if (r.ok && tool !== 'flip') s.moves++;
  return r;
}

/** Что видно в лупу: ключ находки (тексты — в index.js). */
export function inspect(s, t) {
  const p = s.parts;
  switch (t) {
    case 'cover':
      if (!p.cover.in) return 'ok';
      if (p.cover.broken) return 'cover-glass';
      if (p.battery.broken === 'swollen') return 'cover-bulge';
      return 'cover-ok';
    case 'display':
    case 'screen':
      if (!p.display.in) return 'ok';
      return p.display.broken ? 'display-crack' : 'display-ok';
    case 'battery':
      if (!p.battery.in) return 'ok';
      return p.battery.broken === 'swollen' ? 'battery-swollen' : p.battery.broken === 'worn' ? 'battery-worn' : 'battery-ok';
    case 'camera':
      if (!p.camera.in) return 'ok';
      return p.camera.broken ? 'camera-dead' : 'camera-ok';
    case 'speaker':
      if (!p.speaker.in) return 'ok';
      return p.speaker.broken ? 'speaker-torn' : s.dirt.speaker ? 'speaker-dust' : 'speaker-ok';
    case 'port':
      if (!p.port.in) return 'ok';
      return p.port.broken ? 'port-burnt' : 'port-ok';
    case 'jack':
      if (!p.port.in) return 'ok';
      return s.dirt.jack ? 'jack-lint' : p.port.broken ? 'jack-burnt' : 'jack-ok';
    case 'board':
      return s.dirt.board ? 'board-corrosion' : 'board-ok';
    case 'indicator':
      return s.wet ? 'indicator-red' : 'indicator-ok';
    case 'bat':
    case 'disp':
    case 'cam':
    case 'usb':
      return s.conns[t] === 'loose' ? `${t}-loose` : s.conns[t] === 'off' ? 'conn-off' : 'conn-ok';
    default:
      return 'ok';
  }
}

// ---------- подсказка: следующий шаг ----------

const step = (s, tool, target) => {
  const side = sideOf(target);
  if (side !== 'any' && side !== s.view) return { tool: 'flip' };
  return { tool, target };
};

/** Снять деталь (null — уже снята). */
function takeOut(s, p) {
  if (!s.parts[p].in) return null;
  if (p === 'cover') return s.hot.cover ? step(s, 'suction', 'cover') : step(s, 'heat', 'cover');
  if (p === 'display') {
    return connOff(s, 'disp') ?? (s.hot.display ? step(s, 'suction', 'display') : step(s, 'heat', 'display'));
  }
  const open = takeOut(s, 'cover');
  if (open) return open;
  if (p === 'shield' || p === 'bracket') {
    const screw = SCREW_IDS.find((id) => SCREWS[id] === p && s.screws[id]);
    if (screw) return step(s, 'screwdriver', screw);
    return step(s, 'tweezers', p);
  }
  if (p === 'speaker' || p === 'port') {
    const access = takeOut(s, 'bracket');
    if (access) return access;
  }
  if (CONN_OF[p]) {
    const flex = connOff(s, CONN_OF[p]);
    if (flex) return flex;
  }
  return step(s, 'tweezers', p);
}

/** Добраться до разъёма: снять крышку и то, что его закрывает. */
const toConn = (s, c) => takeOut(s, 'cover') ?? takeOut(s, CONN_UNDER[c]);

/** Отключить шлейф (сначала — батарею, чтобы без искры). */
function connOff(s, c) {
  if (s.conns[c] === 'off') return null;
  return toConn(s, c) ?? (c !== 'bat' ? connOff(s, 'bat') : null) ?? step(s, 'spudger', c);
}

/** Подключить шлейф (не батарею — только при отключённой батарее). */
function connOn(s, c) {
  if (s.conns[c] === 'on') return null;
  return toConn(s, c) ?? (c !== 'bat' && s.conns.bat === 'on' ? step(s, 'spudger', 'bat') : null) ?? step(s, 'spudger', c);
}

/** Поставить деталь: сломанную — новую, исправную — свою. */
function putIn(s, p) {
  if (s.parts[p].in) return null;
  if (p !== 'cover' && p !== 'display') {
    const open = takeOut(s, 'cover');
    if (open) return open;
  }
  if (p === 'speaker' || p === 'port') {
    const access = takeOut(s, 'bracket');
    if (access) return access;
  }
  return step(s, s.parts[p].broken ? 'parts' : 'tweezers', p);
}

const REMOVE_ORDER = ['cover', 'display', 'battery', 'camera', 'speaker', 'port'];

/** Следующий шаг к исправному собранному телефону без искр и лишних деталей: { tool, target } | null. */
export function nextStep(s) {
  if (s.done) return null;
  const P = s.parts;
  // 1. снять сломанное
  for (const p of REMOVE_ORDER) if (P[p].in && P[p].broken) return takeOut(s, p);
  // 2. почистить
  if (s.dirt.jack && P.port.in) return step(s, 'brush', 'jack');
  if (s.dirt.speaker && P.speaker.in) return takeOut(s, 'cover') ?? takeOut(s, 'bracket') ?? step(s, 'brush', 'speaker');
  if (s.dirt.board) {
    return takeOut(s, 'cover') ?? takeOut(s, 'shield') ?? connOff(s, 'bat') ?? step(s, 'alcohol', 'board');
  }
  // 3. собрать: детали, шлейфы (батарея — последней), крепёж, крышка
  for (const p of ['battery', 'camera', 'port', 'speaker', 'display']) {
    const r = putIn(s, p);
    if (r) return r;
  }
  for (const c of ['disp', 'cam', 'usb', 'bat']) {
    const r = connOn(s, c);
    if (r) return r;
  }
  for (const holder of ['shield', 'bracket']) {
    const r = putIn(s, holder);
    if (r) return r;
    const screw = SCREW_IDS.find((id) => SCREWS[id] === holder && !s.screws[id]);
    if (screw) return takeOut(s, 'cover') ?? step(s, 'screwdriver', screw);
  }
  const cover = putIn(s, 'cover');
  if (cover) return cover;
  // 4. программы
  if (s.bootloop) return step(s, 'flash', 'jack');
  if (s.virus > 0) {
    if (!s.power) return { tool: 'power', target: 'button' };
    if (!s.scanned) return step(s, 'antivirus', 'screen');
    return step(s, 'squash', 'bug');
  }
  return { tool: 'deliver' };
}

// ---------- сохранение и прогресс ----------

const isBool = (x) => typeof x === 'boolean';
const isCount = (x) => Number.isInteger(x) && x >= 0;
const CONN_STATES = ['on', 'off', 'loose'];

export function isValidState(s) {
  try {
    if (!s || typeof s !== 'object' || s.v !== 1) return false;
    if (!Number.isInteger(s.level) || s.level < 1) return false;
    if (!Array.isArray(s.faults) || !s.faults.every((f) => FAULTS.includes(f))) return false;
    if (!s.model || typeof s.model.name !== 'string' || !COLORS.includes(s.model.color)) return false;
    if (!s.customer || typeof s.customer.name !== 'string') return false;
    if (!Array.isArray(s.complaint) || !s.complaint.every(([f, k]) => COMPLAINTS[f]?.[k])) return false;
    if (s.view !== 'back' && s.view !== 'front') return false;
    if (!PARTS.every((p) => s.parts?.[p] && isBool(s.parts[p].in) && typeof s.parts[p].broken === 'string' && isBool(s.parts[p].fresh))) return false;
    if (!SCREW_IDS.every((id) => isBool(s.screws?.[id]))) return false;
    if (!CONN_IDS.every((c) => CONN_STATES.includes(s.conns?.[c]))) return false;
    if (!isBool(s.hot?.cover) || !isBool(s.hot?.display)) return false;
    if (!['jack', 'speaker', 'board'].every((k) => isBool(s.dirt?.[k]))) return false;
    if (![s.wet, s.scanned, s.bootloop, s.power, s.done].every(isBool)) return false;
    if (![s.virus, s.sparks, s.waste, s.returns, s.hints, s.moves].every(isCount)) return false;
    if (!Array.isArray(s.notes)) return false;
    // крепёж без держателя и закрытая крышка над разобранным — так не бывает
    if (SCREW_IDS.some((id) => s.screws[id] && !s.parts[SCREWS[id]].in)) return false;
    if (s.parts.cover.in && (INSIDE.some((p) => !s.parts[p].in) || SCREW_IDS.some((id) => !s.screws[id]))) return false;
    return true;
  } catch {
    return false;
  }
}

/** Прогресс: следующий заказ, звёзды, заказы на 3 звезды, искры за всё время. */
export const emptyProgress = () => ({ level: 1, stars: 0, perfect: 0, sparks: 0 });

export function isValidProgress(p) {
  return Boolean(p) && typeof p === 'object' && Number.isInteger(p.level) && p.level >= 1
    && isCount(p.stars) && isCount(p.perfect) && isCount(p.sparks);
}

/** Записать сданный заказ. → число звёзд. */
export function recordWin(progress, s) {
  const stars = starsFor(s);
  progress.level = Math.max(progress.level, s.level + 1);
  progress.stars += stars;
  if (stars === 3) progress.perfect++;
  progress.sparks += s.sparks;
  return stars;
}
