// Ремонт гаджетов — правила без DOM: заказ (клиент, устройство, поломки, оплата), действия инструментами, проверка
// при сдаче, звёзды, деньги и склад запчастей, прошивка с компьютера, подсказка «что делать дальше».
//
// Устройства описаны данными (devices.js): какие детали, что что закрывает, винты, шлейфы, пятна грязи. Правила
// общие: деталь снимается, когда сняты те, что её закрывают, выкручены её винты и отключён её шлейф; деталь на клею —
// фен, потом присоска. Главное правило: шлейфы и мокрую плату трогать только без питания (батарея отключена или
// вынута) — иначе искра (−1 звезда). Новая деталь — со склада (покупается в магазине); вместо исправной — −1 звезда;
// сдать неисправное — возврат, −1 звезда. Подсказка — не больше двух звёзд за заказ.
// Прошивка: кабель от компьютера в гнездо, в терминале — нужный файл для этой модели (terminal.js).

import {
  DEVICES, KINDS, FAULT_DEFS, FAULTS, COMPLAINTS, TUTORIAL, UNLOCK, SYMPTOMS, pickKind, connOwner, coveredBy, screwsOf,
  shopParts, stockKey, complaintsFor, faultParts,
} from './devices.js';

export { DEVICES, KINDS, FAULTS, FAULT_DEFS, COMPLAINTS, TUTORIAL, UNLOCK, SYMPTOMS, shopParts, stockKey, screwsOf, complaintsFor };

export const TOOLS = ['heat', 'suction', 'screwdriver', 'spudger', 'tweezers', 'parts', 'brush', 'alcohol', 'magnifier', 'charger', 'antivirus', 'flash'];
export const COLORS = ['graphite', 'white', 'mint', 'lavender', 'coral', 'blue', 'yellow', 'red'];
/** Клиенты: имя и пол — по нему причёска (у женщин — длинные волосы или пучок, у мужчин — коротко, кепка, лысина). */
export const NAMES = [
  ['Аня', 'f'], ['Вика', 'f'], ['Даша', 'f'], ['Зоя', 'f'], ['Катя', 'f'], ['Маша', 'f'], ['Оля', 'f'], ['Рита', 'f'],
  ['Уля', 'f'], ['Женя', 'f'], ['Баба Валя', 'f', 'old'], ['Борис', 'm'], ['Гоша', 'm'], ['Егор', 'm'], ['Илья', 'm'],
  ['Лёша', 'm'], ['Никита', 'm'], ['Петя', 'm'], ['Тимур', 'm'], ['Фёдор', 'm'], ['Саша', 'm'], ['Дед Миша', 'm', 'old'],
];
export const HAIR_F = [1, 2];                     // длинные, пучок
export const HAIR_M = [0, 3, 4];                  // коротко, кепка, почти лысый
export const START_MONEY = 100;

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
const spec = (s) => DEVICES[s.kind];
const P = (s, p) => DEVICES[s.kind].parts[p];
const lidClosed = (s) => Boolean(DEVICES[s.kind].lid) && s.lid === 'closed';

// ---------- заказ ----------

/** Поломки заказа: 1–3 из разных групп, разрешённых этому устройству (чем дальше, тем больше). */
export function faultsFor(kind, level, rng) {
  const r = rng();
  const n = level < 25 ? (r < 0.3 ? 2 : 1) : level < 50 ? (r < 0.55 ? 2 : 1) : (r < 0.3 ? 3 : r < 0.75 ? 2 : 1);
  const left = [...DEVICES[kind].faults];
  const out = [];
  while (out.length < n && left.length) {
    const f = left.splice(Math.floor(rng() * left.length), 1)[0];
    const g = FAULT_DEFS[f].group;
    if (out.some((x) => FAULT_DEFS[x].group === g)) continue;
    out.push(f);
  }
  return out;
}

/** Версии прошивки: стоит сломанная installed, чинит только newest; в папке компьютера — файлы разных моделей. */
function firmware(kind, model, rng) {
  const d = DEVICES[kind];
  const major = d.version[0] + Math.floor(rng() * (d.version[1] - d.version[0]));
  const minor = Math.floor(rng() * 5);
  const installed = `${major}.${minor}`;
  const newest = `${major}.${minor + 1}`;
  const older = `${major - 1}.${Math.floor(rng() * 9)}`;
  const file = (code, v) => `${code.toLowerCase()}_v${v}.${d.ext}`;
  const others = [];
  for (const k of KINDS) {
    const dk = DEVICES[k];
    for (const m of dk.models) {
      if (m.code === model.code) continue;
      const v = dk.version[0] + Math.floor(rng() * (dk.version[1] - dk.version[0]));
      others.push(`${m.code.toLowerCase()}_v${v}.${Math.floor(rng() * 6)}.${dk.ext}`);
    }
  }
  const shuffle = (list) => {
    for (let k = list.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [list[k], list[j]] = [list[j], list[k]];
    }
    return list;
  };
  // свои три версии и шесть чужих: похожие имена — читать внимательно
  const files = shuffle([file(model.code, newest), file(model.code, installed), file(model.code, older), ...shuffle(others).slice(0, 6)]);
  return { code: model.code, installed, newest, files };
}

/** Правильный файл прошивки заказа. */
export const goodFirmware = (s) => `${s.fw.code.toLowerCase()}_v${s.fw.newest}.${spec(s).ext}`;

/** Заказ номер level (всегда один и тот же); only — задать поломки самому, kind — устройство (для проверки). */
export function newOrder(level, only = null, forceKind = null) {
  const rng = seeded(level * 7919 + 101);
  const tut = TUTORIAL[level];
  let kind = forceKind ?? (tut ? tut[0] : pickKind(level, rng));
  if (!DEVICES[kind]) kind = 'phone';
  const d = DEVICES[kind];
  let faults = tut && (!forceKind || forceKind === tut[0]) ? [tut[1]] : faultsFor(kind, level, rng);
  if (Array.isArray(only)) faults = only.filter((f) => d.faults.includes(f));
  const model = pick(rng, d.models);
  const parts = Object.fromEntries(Object.keys(d.parts).map((p) => [p, { in: true, broken: '', fresh: false }]));
  const s = {
    v: 2,
    level,
    kind,
    model: { name: model.name, code: model.code, logo: model.logo, color: pick(rng, COLORS), cams: rng() < 0.5 ? 2 : 3 },
    customer: customerFor(rng),
    complaint: faults.map((f) => [f, Math.floor(rng() * complaintsFor(kind, f).length)]),
    crack: { x: 0.25 + rng() * 0.5, y: 0.2 + rng() * 0.5, seed: Math.floor(rng() * 1e9) },
    fw: firmware(kind, model, rng),
    faults,
    view: 'front',
    parts,
    screws: Object.fromEntries(Object.keys(d.screws).map((id) => [id, true])),
    conns: Object.fromEntries(Object.keys(d.conns).map((c) => [c, 'on'])),
    hot: Object.fromEntries(Object.keys(d.parts).filter((p) => d.parts[p].glue).map((p) => [p, false])),
    dirt: Object.fromEntries(Object.keys(d.spots).map((k) => [k, false])),
    wet: false,
    virus: 0,
    scanned: false,
    bootloop: false,
    blank: false,
    power: false,
    pay: 0,
    prepaid: 0,
    sparks: 0,
    waste: 0,
    returns: 0,
    hints: 0,
    moves: 0,
    notes: [],
    done: false,
  };
  if (d.lid) s.lid = 'closed';                   // ноутбук приносят закрытым
  for (const f of faults) applyFault(s, f);
  s.pay = payFor(kind, faults);
  return s;
}

export const bugsFor = (level) => Math.min(8, 3 + Math.floor(level / 8));

/** Клиент: внешность по полу и возрасту имени (у стариков — седина, у деда — борода). */
function customerFor(rng) {
  const [name, gender, age] = pick(rng, NAMES);
  const old = age === 'old';
  return {
    name,
    gender,
    old,
    skin: Math.floor(rng() * 4),
    hair: pick(rng, gender === 'f' ? HAIR_F : HAIR_M),
    hairColor: old ? 4 : Math.floor(rng() * 4),
    bg: Math.floor(rng() * 6),
    glasses: old || rng() < 0.25,
    beard: gender === 'm' && (old || rng() < 0.2),
  };
}

function applyFault(s, f) {
  const def = FAULT_DEFS[f];
  if (def.soft === 'virus') s.virus = bugsFor(s.level);
  if (def.soft === 'bootloop') s.bootloop = true;
  for (const p of faultParts(f)) s.parts[p].broken = def.value;
  if (def.conn) s.conns[def.conn] = 'loose';
  if (def.spot) s.dirt[def.spot] = true;
  if (def.wet) s.wet = true;
}

/** Оплата заказа в долларах: работа плюс детали с наценкой, кругло до 5. */
export function payFor(kind, faults) {
  let sum = 0;
  for (const f of faults) {
    sum += FAULT_DEFS[f].labor;
    for (const p of faultParts(f)) sum += DEVICES[kind].parts[p].price * 1.3;
  }
  return Math.max(5, Math.round(sum / 5) * 5);
}

// ---------- состояние устройства ----------

/**
 * Есть питание от батареи (для искр): батарея стоит и её шлейф подключён (у съёмной — просто стоит). У устройств без
 * батареи (комплектующие ПК, клавиатура, колонка) питание даёт стенд при проверке — на столе они обесточены.
 */
export function powered(s) {
  const d = spec(s);
  if (!d.battery) return false;
  if (!s.parts[d.battery].in) return false;
  const c = batConnOf(s);
  return c ? s.conns[c] === 'on' : true;
}

/** Включится ли: питание есть и плата не залита. Изношенная батарея гаснет сразу. */
export const canPower = (s) => (spec(s).battery ? powered(s) : true) && !s.dirt.board;

/** Шлейф батареи ('' — батарея съёмная или её нет). */
const batConnOf = (s) => (spec(s).battery ? P(s, spec(s).battery).conn : '');

/** Батарея устройства (или null — без батареи). */
const batteryOf = (s) => (spec(s).battery ? s.parts[spec(s).battery] : null);

export function chargeOk(s) {
  const d = spec(s);
  if (s.dirt.jack) return false;
  if (!d.port) return true;
  const port = s.parts[d.port];
  return port.in && !port.broken && s.conns[P(s, d.port).conn] === 'on';
}

/** Диск с системой (у кого он есть) в порядке. */
const osOk = (s) => !s.parts.ssd || (s.parts.ssd.in && !s.parts.ssd.broken && !s.blank);

/** Что на экране включённого устройства: none, dark, flicker, logo, noos, home. */
export function screenOf(s) {
  if (!s.power || !s.parts.display?.in) return 'none';
  if (s.conns.disp === 'loose') return 'flicker';
  if (s.conns.disp !== 'on') return 'dark';
  if (s.bootloop) return 'logo';
  if (!osOk(s)) return 'noos';
  return 'home';
}

/** Собрано: все детали и винты на месте (шлейфы проверяет уже сдача). */
export const assembled = (s) => Object.values(s.parts).every((p) => p.in) && Object.values(s.screws).every(Boolean);

export function missing(s) {
  return {
    parts: Object.keys(s.parts).filter((p) => !s.parts[p].in),
    screws: Object.keys(s.screws).filter((id) => !s.screws[id]).length,
  };
}

/** Что не так (проверка при сдаче): пусто — всё работает. */
export function symptoms(s) {
  const d = spec(s);
  const out = new Set();
  const bat = batteryOf(s);
  if (bat?.in && bat.broken === 'swollen') out.add('swollen');
  if (!canPower(s)) {
    out.add('no-power');
    return [...out];
  }
  if (bat?.broken === 'worn') out.add('drains');
  if (s.bootloop) out.add('bootloop');
  for (const [p, ps] of Object.entries(d.parts)) {
    if (!ps.miss && !ps.bad) continue;
    const st = s.parts[p];
    const works = st.in && (!ps.conn || s.conns[ps.conn] === 'on');
    if (!works && ps.miss) out.add(ps.miss);
    else if (st.in && st.broken && ps.bad) out.add(ps.bad);
  }
  if (s.blank) out.add('no-os');
  for (const [k, sp] of Object.entries(d.spots)) if (s.dirt[k] && sp.sym) out.add(sp.sym);
  if (d.battery && !d.noJack && !chargeOk(s)) out.add('no-charge');
  if (s.virus > 0 && !s.bootloop) out.add('virus');
  return [...out];
}

/** Звёзды за заказ: 3 (с подсказкой — 2) минус искры, лишние детали и возвраты; не меньше 1. */
export const starsFor = (s) => Math.max(1, (s.hints ? 2 : 3) - s.sparks - s.waste - s.returns);

/** Сколько получишь при сдаче: оплата минус предоплата за детали, плюс чаевые за звёзды. */
export function earningsFor(s) {
  const st = starsFor(s);
  const tip = st === 3 ? 0.15 : st === 2 ? 0.05 : 0;
  return Math.max(0, Math.round(s.pay * (1 + tip) - s.prepaid));
}

// ---------- доступ ----------

const no = (why, extra = {}) => ({ ok: false, why, ...extra });
const yes = (extra = {}) => ({ ok: true, ...extra });

/** На какой стороне цель: back, front или any. */
export function sideOf(s, target) {
  const d = spec(s);
  if (d.parts[target]) return d.parts[target].side === 'edge' ? 'any' : d.parts[target].side;
  if (d.screws[target]) return d.parts[d.screws[target]].side;
  if (d.conns[target]) return d.conns[target].side;
  if (d.spots[target]) return d.spots[target].side;
  if (target === 'screen' || target === 'bug') return d.parts.display?.side ?? 'front';
  if (target === 'indicator') return 'back';
  return 'any';
}

/** Что из списка ещё стоит (закрывает): '' — ничего. */
const firstIn = (s, list) => list.find((p) => s.parts[p].in) ?? '';

/** Можно ли дотянуться до цели; '' — можно, иначе причина ('flip', 'blocked' + by, 'no-holder', 'no-part'). */
export function reach(s, target) {
  const d = spec(s);
  const side = sideOf(s, target);
  if (side !== 'any' && side !== s.view) return { why: 'flip' };
  if (side === 'front' && lidClosed(s)) return { why: 'lid-closed' };
  if (d.parts[target]) {
    const by = firstIn(s, d.parts[target].blockers);
    return by ? { why: 'blocked', by } : null;
  }
  if (d.screws[target]) {
    const holder = d.screws[target];
    if (!s.parts[holder].in) return { why: 'no-holder' };
    const by = firstIn(s, d.parts[holder].blockers);
    return by ? { why: 'blocked', by } : null;
  }
  if (d.conns[target]) {
    const by = firstIn(s, d.conns[target].under);
    return by ? { why: 'blocked', by } : null;
  }
  if (d.spots[target]) {
    const by = firstIn(s, d.spots[target].under);
    return by ? { why: 'blocked', by } : null;
  }
  if (target === 'screen') return s.parts.display?.in ? null : { why: 'no-part' };
  if (target === 'indicator') {
    const by = firstIn(s, d.spots.board?.under.slice(0, 1) ?? []);
    return by ? { why: 'blocked', by } : null;
  }
  return null;
}

const refuseReach = (r) => no(r.why, r.by ? { by: r.by } : {});

/** Поставить деталь: всё, что она закрывает, должно стоять и быть привинчено. */
function install(s, p, fresh, wallet) {
  const r = reach(s, p);
  if (r) return refuseReach(r);
  if (!fresh && P(s, p).consumable) return no('consumable');
  for (const q of coveredBy(s.kind, p)) {
    if (!s.parts[q].in || screwsOf(s.kind, q).some((id) => !s.screws[id])) return no('inside-missing', { by: q });
  }
  const part = s.parts[p];
  const ps = P(s, p);
  let wasted = false;
  if (fresh) {
    const key = stockKey(s.kind, p);
    if (!wallet || !(wallet.stock?.[key] > 0)) return no('no-stock', { part: p });
    wallet.stock[key]--;
    if (!part.broken) {
      s.waste++;
      wasted = true;
    }
    part.broken = '';
    part.fresh = true;
    if (p in s.hot) s.hot[p] = false;
    if (ps.blank) s.blank = true;
  }
  part.in = true;
  if (ps.conn) s.conns[ps.conn] = 'off';
  return yes({ installed: p, fresh, wasted });
}

/** Спот: чем чистить и что мешает. */
function clean(s, tool, t) {
  const d = spec(s);
  const sp = d.spots[t];
  if (!sp) return no(`${tool}-where`);
  const r = reach(s, t);
  if (r) return refuseReach(r);
  if (sp.part && !s.parts[sp.part].in) return no('no-part');
  if (!s.dirt[t]) return no('clean');
  if (sp.tool !== tool) return no('wrong-tool', { need: sp.tool });
  const spark = Boolean(sp.power) && powered(s);
  if (spark) s.sparks++;
  s.dirt[t] = false;
  return yes({ cleaned: t, spark });
}

// ---------- действия ----------

const ACTIONS = {
  flip(s) {
    s.view = s.view === 'back' ? 'front' : 'back';
    return yes({ view: s.view });
  },

  heat(s, t) {
    if (!(t in s.hot)) return no('heat-where');
    const r = reach(s, t);
    if (r) return refuseReach(r);
    if (!s.parts[t].in) return no('no-part');
    const already = s.hot[t];
    s.hot[t] = true;
    return yes({ heated: t, already });
  },

  suction(s, t) {
    if (!(t in s.hot)) return no('suction-where');
    const r = reach(s, t);
    if (r) return refuseReach(r);
    if (!s.parts[t].in) return no('no-part');
    if (!s.hot[t]) return no('glue');
    const c = P(s, t).conn;
    if (c && s.conns[c] !== 'off') return no('flex-holds', { conn: c });
    s.parts[t].in = false;
    if (t === 'display') s.power = false;
    return yes({ removed: t });
  },

  screwdriver(s, t) {
    if (!spec(s).screws[t]) return no('no-screws');
    const r = reach(s, t);
    if (r) return refuseReach(r);
    s.screws[t] = !s.screws[t];
    return yes({ screw: t, in: s.screws[t] });
  },

  spudger(s, t) {
    const d = spec(s);
    if (!d.conns[t]) return no(t in s.hot ? 'use-suction' : 'spudger-where');
    const r = reach(s, t);
    if (r) return refuseReach(r);
    if (!s.parts[connOwner(s.kind, t)].in) return no('no-part');
    const batConn = batConnOf(s);
    const spark = t !== batConn && powered(s);
    if (spark) s.sparks++;
    const st = s.conns[t] === 'on' ? 'off' : 'on';
    s.conns[t] = st;
    if (t === batConn && st === 'off') s.power = false;
    return yes({ conn: t, state: st, spark });
  },

  tweezers(s, t) {
    const d = spec(s);
    if (d.screws[t]) return no('use-screwdriver');
    if (d.spots[t]?.tool === 'tweezers') return clean(s, 'tweezers', t);
    if (!d.parts[t]) return no('tweezers-where');
    const part = s.parts[t];
    if (!part.in) return install(s, t, false, null);
    const r = reach(s, t);
    if (r) return refuseReach(r);
    if (t in s.hot) return no('use-suction');
    if (d.parts[t].wipe) return no('use-alcohol');
    if (screwsOf(s.kind, t).some((id) => s.screws[id])) return no('screws');
    const c = P(s, t).conn;
    if (c && s.conns[c] !== 'off') return no(t === d.battery ? 'bat-connected' : 'flex', { conn: c });
    part.in = false;
    if (t === d.battery || t === 'display') s.power = false;
    return yes({ removed: t });
  },

  parts(s, t, wallet) {
    if (!spec(s).parts[t]) return no('parts-where');
    if (s.parts[t].in) return no('remove-first');
    return install(s, t, true, wallet);
  },

  /** Купить деталь на склад: хватает денег — за свои, нет — клиент даёт предоплату (вычтется из оплаты). */
  buy(s, t, wallet) {
    const ps = spec(s).parts[t];
    if (!ps?.price || !wallet) return no('not-sold');
    const key = stockKey(s.kind, t);
    let prepaid = false;
    if (wallet.money >= ps.price) wallet.money -= ps.price;
    else {
      s.prepaid += ps.price;
      prepaid = true;
    }
    wallet.stock[key] = (wallet.stock[key] ?? 0) + 1;
    return yes({ bought: t, price: ps.price, prepaid });
  },

  brush: (s, t) => clean(s, 'brush', t),
  /** Спирт: отмыть пятно или стереть деталь-расходник (старую термопасту). */
  alcohol(s, t) {
    const ps = spec(s).parts[t];
    if (!ps?.wipe) return clean(s, 'alcohol', t);
    const r = reach(s, t);
    if (r) return refuseReach(r);
    if (!s.parts[t].in) return no('no-part');
    s.parts[t].in = false;
    if (!s.parts[t].broken) s.parts[t].broken = 'gone';     // стёрта — ставить только новую, без штрафа
    return yes({ wiped: t });
  },

  /** Крышка ноутбука: открыть и закрыть. */
  lid(s) {
    if (!spec(s).lid) return no('nothing');
    if (s.view !== 'front') return no('flip');
    s.lid = s.lid === 'closed' ? 'open' : 'closed';
    return yes({ lid: s.lid });
  },

  magnifier(s, t) {
    const out = sideOf(s, t) === 'any' && !spec(s).parts[t];
    const r = out ? null : reach(s, t);
    if (r && r.why !== 'no-holder') return refuseReach(r);
    const find = inspect(s, t);
    if (!s.notes.includes(find)) s.notes.push(find);
    return yes({ find });
  },

  charger(s, t) {
    if (t !== 'jack' || spec(s).noJack) return no('charger-where');
    if (!spec(s).battery) return no('no-battery');
    return yes({ charge: chargeOk(s) && powered(s) });
  },

  antivirus(s, t) {
    if (!spec(s).virus) return no('antivirus-where');
    if (t !== 'screen' && t !== 'display') return no('antivirus-where');
    const r = reach(s, 'screen');
    if (r) return refuseReach(r);
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

  /** Прошивка файлом с компьютера: t — имя файла. */
  flash(s, t) {
    if (spec(s).noJack || !linked(s)) return no('no-link');
    const file = String(t ?? '').trim().toLowerCase();
    if (!s.fw.files.includes(file)) return no('no-file');
    const m = /^(.+)_v(\d+)\.(\d+)\.(\w+)$/.exec(file);
    if (!m || m[1] !== s.fw.code.toLowerCase() || m[4] !== spec(s).ext) return no('wrong-model', { file });
    if (s.parts.ssd && (!s.parts.ssd.in || s.parts.ssd.broken)) return no('disk-error');
    if (!s.bootloop && !s.blank) return no('no-need');
    const v = `${m[2]}.${m[3]}`;
    if (v !== s.fw.newest) return no(v === s.fw.installed && !s.blank ? 'same-version' : 'old-version', { version: v });
    s.bootloop = false;
    s.blank = false;
    s.virus = 0;
    s.scanned = false;
    s.fw.installed = s.fw.newest;
    s.power = true;
    return yes({ flashed: file });
  },

  power(s) {
    if (lidClosed(s)) return no('lid-closed');
    if (s.power) {
      s.power = false;
      return yes({ on: false });
    }
    if (!canPower(s)) return yes({ on: false, dead: true });
    if (batteryOf(s)?.broken === 'worn') return yes({ on: false, blink: true });
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

/** Видит ли компьютер устройство: питание и гнездо в порядке. */
export const linked = (s) => canPower(s) && chargeOk(s);

/** Действие инструментом (или flip, squash, power, deliver, buy) над целью; меняет s (и wallet). → { ok, why?, … }. */
export function act(s, tool, target, wallet = null) {
  if (s.done) return no('done');
  const fn = ACTIONS[tool];
  if (!fn) return no('nothing');
  const r = fn(s, target, wallet);
  if (r.ok && tool !== 'flip' && tool !== 'buy') s.moves++;
  return r;
}

/** Что видно в лупу: ключ находки (тексты — в index.js). */
export function inspect(s, t) {
  const d = spec(s);
  if (d.parts[t]) {
    const st = s.parts[t];
    if (!st.in) return 'ok';
    if (st.broken) return `${t}-${st.broken}`;
    if (d.battery && s.parts[d.battery].broken === 'swollen' && d.parts[d.battery].blockers.includes(t)) return 'cover-bulge';
    const spot = Object.keys(d.spots).find((k) => (k === t || d.spots[k].part === t) && s.dirt[k] && d.spots[k].side !== 'any');
    if (spot) return `${spot}-dirty`;
    return `ok:${t}`;
  }
  if (d.conns[t]) return s.conns[t] === 'loose' ? `${t}-loose` : s.conns[t] === 'off' ? 'conn-off' : 'conn-ok';
  if (t === 'jack') {
    if (s.dirt.jack) return 'jack-dirty';
    if (d.port && s.parts[d.port].broken) return 'jack-burnt';
    return 'jack-ok';
  }
  if (d.spots[t]) return s.dirt[t] ? `${t}-dirty` : `${t}-ok`;
  if (t === 'indicator') return s.wet ? 'indicator-red' : 'indicator-ok';
  return 'ok';
}

// ---------- подсказка: следующий шаг ----------

function step(s, tool, target) {
  const side = sideOf(s, target);
  if (side !== 'any' && side !== s.view) return { tool: 'flip' };
  if (side === 'front' && lidClosed(s)) return { tool: 'lid', target: 'lid' };
  return { tool, target };
}

/** Снять деталь (null — уже снята). */
function takeOut(s, p) {
  if (!s.parts[p].in) return null;
  const ps = P(s, p);
  for (const b of ps.blockers) {
    const r = takeOut(s, b);
    if (r) return r;
  }
  if (ps.conn) {
    const r = connOff(s, ps.conn);
    if (r) return r;
  }
  if (ps.glue) return s.hot[p] ? step(s, 'suction', p) : step(s, 'heat', p);
  if (ps.wipe) return step(s, 'alcohol', p);
  const screw = screwsOf(s.kind, p).find((id) => s.screws[id]);
  if (screw) return step(s, 'screwdriver', screw);
  return step(s, 'tweezers', p);
}

/** Добраться: снять всё из списка. */
function clear(s, list) {
  for (const p of list) {
    const r = takeOut(s, p);
    if (r) return r;
  }
  return null;
}

/** Обесточить: отключить шлейф батареи или вынуть съёмную. */
function cutPower(s) {
  const d = spec(s);
  const c = batConnOf(s);
  return c ? connOff(s, c) : takeOut(s, d.battery);
}

function connOff(s, c) {
  if (s.conns[c] === 'off') return null;
  const batConn = batConnOf(s);
  return clear(s, spec(s).conns[c].under) ?? (c !== batConn && powered(s) ? cutPower(s) : null) ?? step(s, 'spudger', c);
}

function connOn(s, c) {
  if (s.conns[c] === 'on' || !s.parts[connOwner(s.kind, c)].in) return null;
  const batConn = batConnOf(s);
  return clear(s, spec(s).conns[c].under) ?? (c !== batConn && powered(s) ? cutPower(s) : null) ?? step(s, 'spudger', c);
}

/** Привинтить винт (держатель стоит). */
function screwIn(s, id) {
  if (s.screws[id]) return null;
  return clear(s, P(s, spec(s).screws[id]).blockers) ?? step(s, 'screwdriver', id);
}

/** Поставить деталь: всё под ней — на месте; сломанную — новую со склада (нет — купить), исправную — свою. */
function putIn(s, p, wallet) {
  if (s.parts[p].in) return null;
  for (const q of coveredBy(s.kind, p)) {
    const r = putIn(s, q, wallet) ?? screwsOf(s.kind, q).map((id) => screwIn(s, id)).find(Boolean);
    if (r) return r;
  }
  const r = clear(s, P(s, p).blockers);
  if (r) return r;
  if (!s.parts[p].broken && !P(s, p).consumable) return step(s, 'tweezers', p);
  if (!(wallet?.stock?.[stockKey(s.kind, p)] > 0)) return { tool: 'buy', target: p };
  return step(s, 'parts', p);
}

/**
 * Следующий шаг к исправному собранному устройству без искр и лишних деталей: { tool, target } | null.
 * wallet — деньги и склад (подсказка «купить», если нужной детали нет).
 */
export function nextStep(s, wallet = null) {
  if (s.done) return null;
  const d = spec(s);
  // 1. снять сломанное
  for (const p of Object.keys(d.parts)) if (s.parts[p].in && s.parts[p].broken) return takeOut(s, p);
  // 2. почистить
  for (const [k, sp] of Object.entries(d.spots)) {
    if (!s.dirt[k] || (sp.part && !s.parts[sp.part].in)) continue;
    return clear(s, sp.under) ?? (sp.power && powered(s) ? cutPower(s) : null) ?? step(s, sp.tool, k);
  }
  // 3. собрать по порядку
  for (const item of d.order) {
    const [kind, id] = item.split(':');
    const r = kind === 'p' ? putIn(s, id, wallet) : kind === 'c' ? connOn(s, id) : screwsOf(s.kind, id).map((x) => screwIn(s, x)).find(Boolean);
    if (r) return r;
  }
  // 4. программы
  if (s.bootloop || s.blank) return { tool: 'flash', target: goodFirmware(s) };
  if (s.virus > 0) {
    if (lidClosed(s)) return s.view === 'front' ? { tool: 'lid', target: 'lid' } : { tool: 'flip' };
    if (!s.power) return { tool: 'power', target: 'button' };
    if (!s.scanned) return step(s, 'antivirus', 'screen');
    return step(s, 'squash', 'bug');
  }
  return { tool: 'deliver' };
}

// ---------- сохранение, деньги, прогресс ----------

const isBool = (x) => typeof x === 'boolean';
const isCount = (x) => Number.isInteger(x) && x >= 0;
const CONN_STATES = ['on', 'off', 'loose'];
const sameKeys = (o, keys) => Boolean(o) && typeof o === 'object' && Object.keys(o).length === keys.length && keys.every((k) => k in o);

export function isValidState(s) {
  try {
    if (!s || typeof s !== 'object' || s.v !== 2 || !DEVICES[s.kind]) return false;
    const d = DEVICES[s.kind];
    if (!Number.isInteger(s.level) || s.level < 1) return false;
    if (!Array.isArray(s.faults) || !s.faults.every((f) => d.faults.includes(f))) return false;
    if (!s.model || typeof s.model.name !== 'string' || !COLORS.includes(s.model.color)) return false;
    if (!s.customer || typeof s.customer.name !== 'string') return false;
    if (!Array.isArray(s.complaint) || !s.complaint.every(([f, k]) => complaintsFor(s.kind, f)?.[k])) return false;
    if (!s.fw || typeof s.fw.code !== 'string' || !Array.isArray(s.fw.files) || typeof s.fw.newest !== 'string') return false;
    if (s.view !== 'back' && s.view !== 'front') return false;
    if (d.lid ? !['open', 'closed'].includes(s.lid) : s.lid !== undefined) return false;
    const parts = Object.keys(d.parts);
    if (!sameKeys(s.parts, parts) || !parts.every((p) => isBool(s.parts[p].in) && typeof s.parts[p].broken === 'string' && isBool(s.parts[p].fresh))) return false;
    if (!sameKeys(s.screws, Object.keys(d.screws)) || !Object.values(s.screws).every(isBool)) return false;
    if (!sameKeys(s.conns, Object.keys(d.conns)) || !Object.values(s.conns).every((c) => CONN_STATES.includes(c))) return false;
    if (!sameKeys(s.hot, parts.filter((p) => d.parts[p].glue)) || !Object.values(s.hot).every(isBool)) return false;
    if (!sameKeys(s.dirt, Object.keys(d.spots)) || !Object.values(s.dirt).every(isBool)) return false;
    if (![s.wet, s.scanned, s.bootloop, s.blank, s.power, s.done].every(isBool)) return false;
    if (![s.virus, s.sparks, s.waste, s.returns, s.hints, s.moves, s.pay, s.prepaid].every(isCount)) return false;
    if (!Array.isArray(s.notes)) return false;
    // крепёж без держателя; деталь стоит, а то, что под ней, — нет (так не бывает)
    if (Object.keys(d.screws).some((id) => s.screws[id] && !s.parts[d.screws[id]].in)) return false;
    for (const q of parts) {
      for (const b of d.parts[q].blockers) {
        if (s.parts[b].in && (!s.parts[q].in || screwsOf(s.kind, q).some((id) => !s.screws[id]))) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Прогресс: следующий заказ, звёзды, на три звезды, искры, деньги, склад запчастей, заработано за всё время. */
export const emptyProgress = () => ({ level: 1, stars: 0, perfect: 0, sparks: 0, money: START_MONEY, earned: 0, stock: {}, usd: true });

export function isValidProgress(p) {
  return Boolean(p) && typeof p === 'object' && Number.isInteger(p.level) && p.level >= 1
    && isCount(p.stars) && isCount(p.perfect) && isCount(p.sparks)
    && (p.money === undefined || isCount(p.money)) && (p.earned === undefined || isCount(p.earned))
    && (p.stock === undefined || (p.stock && typeof p.stock === 'object' && Object.values(p.stock).every(isCount)));
}

/**
 * Прогресс из сохранения: старый (до денег) дополняется стартовыми деньгами и пустым складом; рубли (до 2026-10-05,
 * без отметки usd) переводятся в доллары — 20 к 1, не меньше стартовых.
 */
export function normProgress(p) {
  if (!isValidProgress(p)) return emptyProgress();
  const out = { ...emptyProgress(), ...p, stock: { ...(p.stock ?? {}) } };
  if (p.usd !== true) {
    out.money = p.money === undefined ? START_MONEY : Math.max(START_MONEY, Math.round(p.money / 20));
    out.earned = Math.round((p.earned ?? 0) / 20);
    out.usd = true;
  }
  return out;
}

/** Записать сданный заказ. → { stars, earned }. */
export function recordWin(progress, s) {
  const stars = starsFor(s);
  const earned = earningsFor(s);
  progress.level = Math.max(progress.level, s.level + 1);
  progress.stars += stars;
  if (stars === 3) progress.perfect++;
  progress.sparks += s.sparks;
  progress.money += earned;
  progress.earned += earned;
  return { stars, earned };
}
