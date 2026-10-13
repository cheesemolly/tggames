// Вещи лисы: надетое и рюкзак, подбор с земли, зелья, дары леса, цены, случайная находка и карточка вещи для
// окна рюкзака. Без DOM. (Выделено из player.js: там — сама лиса, здесь — что у неё с собой.)
//
// Ячейки: оружие ×1, броня ×1, украшения ×3, рюкзак ×8. Вещь — { id, lvl? }; что это за вещь, узнаётся по id в
// реестре. Подобранное сначала надевается в свободную ячейку своего вида, иначе идёт в рюкзак; рюкзак полон —
// меняется местами с надетым того же вида, старое падает на землю. Зелья лежат только в рюкзаке.

import { F_WALK, REG, kindOf, itemDef, own, rndOf, clamp, emit, sfx, toast } from './core.js';
import { PICK, rollRarity, weaponDmg, price } from './balance.js';
import { addPick, removePick, blockedAt, standable } from './world.js';
import { recalc, heal, addMana, gainCoins } from './player.js';

export const ACC_SLOTS = 3;
export const BAG_SLOTS = 8;

export const newInventory = () => ({
  weapon: null,
  armor: null,
  acc: Array(ACC_SLOTS).fill(null),
  bag: Array(BAG_SLOTS).fill(null),
});

const freeCell = (list) => list.indexOf(null);

function changed(G, sound = true) {
  recalc(G);
  emit(G, { t: 'ui' });
  if (sound) sfx(G, 'equip', G.player.x, G.player.y);
}

/** Есть ли у лисы такая вещь (надета или в рюкзаке). */
export function hasItem(G, id) {
  const inv = G.inv;
  if (inv.weapon?.id === id || inv.armor?.id === id) return true;
  return inv.acc.some((it) => it?.id === id) || inv.bag.some((it) => it?.id === id);
}

/** Вещь встречена: в список партии — для «коллекции». */
function noteSeen(G, id) {
  if (!G.seen.includes(id)) G.seen.push(id);
}

/**
 * Лиса получает вещь item ({ id, lvl }): надевает, кладёт в рюкзак или меняет с надетой (старая падает в точку
 * x, y). Возвращает 'equip' | 'bag' | 'swap' или false, если взять нельзя (зелье при полном рюкзаке).
 */
export function giveItem(G, item, x = G.player.x, y = G.player.y) {
  const kind = kindOf(item?.id);
  if (!kind) return false;
  const inv = G.inv;
  const it = { id: item.id, lvl: kind === 'weapon' ? clamp(item.lvl | 0, 0, 9) : 0 };
  let how = '';
  const cell = freeCell(inv.bag);
  if (kind === 'potion') {
    if (cell < 0) {
      toast(G, 'Рюкзак полон');
      sfx(G, 'deny');
      return false;
    }
    inv.bag[cell] = it;
    how = 'bag';
  } else if (kind === 'acc') {
    const slot = freeCell(inv.acc);
    if (slot >= 0) {
      inv.acc[slot] = it;
      how = 'equip';
    } else if (cell >= 0) {
      inv.bag[cell] = it;
      how = 'bag';
    } else {
      const old = inv.acc[0];
      inv.acc[0] = it;
      addPick(G, 'item', x, y, 1, old.id, old.lvl ?? 0);
      how = 'swap';
    }
  } else if (!inv[kind]) {
    inv[kind] = it;
    how = 'equip';
  } else if (cell >= 0) {
    inv.bag[cell] = it;
    how = 'bag';
  } else {
    const old = inv[kind];
    inv[kind] = it;
    addPick(G, 'item', x, y, 1, old.id, old.lvl ?? 0);
    how = 'swap';
  }
  noteSeen(G, it.id);
  G.cnt.items += 1;
  recalc(G);
  emit(G, { t: 'item', id: it.id, how });
  emit(G, { t: 'ui' });
  sfx(G, 'pick', x, y);
  return how;
}

/** Взять вещь, лежащую на земле (запись подбираемого). */
export function takeItemPick(G, p) {
  if (p.kind !== 'item' || !p.on) return false;
  const how = giveItem(G, p, p.x, p.y);
  if (!how) return false;
  emit(G, { t: 'pick', x: p.x, y: p.y, kind: 'item', v: 1, id: p.id });
  const at = G.room.picks.indexOf(p);
  if (at >= 0) removePick(G.room, at);
  return true;
}

/**
 * Надеть вещь из ячейки рюкзака bagIndex: надетая того же вида ложится на её место. Украшение идёт в свободную
 * ячейку, а если свободных нет — меняется с ячейкой accIndex (по умолчанию с первой).
 */
export function equip(G, bagIndex, accIndex = -1) {
  const inv = G.inv;
  const it = inv.bag[bagIndex];
  const kind = kindOf(it?.id);
  if (!kind || kind === 'potion') return false;
  if (kind === 'acc') {
    let slot = freeCell(inv.acc);
    if (slot < 0) slot = accIndex >= 0 && accIndex < ACC_SLOTS ? accIndex : 0;
    inv.bag[bagIndex] = inv.acc[slot];
    inv.acc[slot] = it;
  } else {
    inv.bag[bagIndex] = inv[kind];
    inv[kind] = it;
  }
  changed(G);
  return true;
}

// где лежит надетое: 'weapon' | 'armor' | 'acc' (с номером) | 'bag' (с номером)
function slotGet(inv, slot, index) {
  if (slot === 'weapon' || slot === 'armor') return inv[slot];
  if (slot === 'acc' || slot === 'bag') return inv[slot][index] ?? null;
  return null;
}
function slotClear(inv, slot, index) {
  if (slot === 'weapon' || slot === 'armor') inv[slot] = null;
  else inv[slot][index] = null;
}

/** Снять надетое (slot: 'weapon' | 'armor' | 'acc', index — номер украшения) в рюкзак. false — снимать нечего или некуда. */
export function unequip(G, slot, index = 0) {
  const inv = G.inv;
  if (slot !== 'weapon' && slot !== 'armor' && slot !== 'acc') return false;
  const it = slotGet(inv, slot, index);
  if (!it) return false;
  const cell = freeCell(inv.bag);
  if (cell < 0) {
    toast(G, 'Рюкзак полон');
    sfx(G, 'deny');
    return false;
  }
  slotClear(inv, slot, index);
  inv.bag[cell] = it;
  changed(G);
  return true;
}

/** Выбросить вещь на землю рядом с лисой (slot: 'weapon' | 'armor' | 'acc' | 'bag'). */
export function dropItem(G, slot, index = 0) {
  const inv = G.inv;
  const P = G.player;
  const it = slotGet(inv, slot, index);
  if (!it) return false;
  slotClear(inv, slot, index);
  let x = P.x + P.face * 18;
  if (!standable(G.room, x, P.y, 6)) x = P.x;
  const p = addPick(G, 'item', x, P.y, 1, it.id, it.lvl ?? 0, false);
  if (p) p.t = -0.6;                                        // чтобы не подобрать тем же нажатием
  changed(G);
  return true;
}

/** Выпить зелье из ячейки рюкзака. false — это не зелье или пить незачем (тогда оно не тратится). */
export function usePotion(G, bagIndex) {
  const inv = G.inv;
  const it = inv.bag[bagIndex];
  const def = it && own(REG.POTIONS, it.id) ? REG.POTIONS[it.id] : null;
  if (!def || G.over || G.player.down > 0) return false;
  if (typeof def.use !== 'function' || def.use(G) === false) {
    sfx(G, 'deny');
    return false;
  }
  inv.bag[bagIndex] = null;
  sfx(G, 'potion', G.player.x, G.player.y);
  emit(G, { t: 'ui' });
  return true;
}

// ---------- дары леса ----------

/** Взять дар (навсегда до конца партии). */
export function takeGift(G, id) {
  const def = own(REG.GIFTS, id) ? REG.GIFTS[id] : null;
  if (!def) return false;
  G.gifts.push(id);
  recalc(G);
  if (def.onTake) def.onTake(G);
  emit(G, { t: 'ui' });
  return true;
}

/** Три дара на выбор (после хозяина места): сначала те, которых ещё нет. Дар с offer: false не предлагается. */
export function giftOptions(G, n = 3) {
  const r = rndOf(G);
  const all = Object.keys(REG.GIFTS).filter((id) => REG.GIFTS[id].offer !== false);
  const fresh = r.shuffle(all.filter((id) => !G.gifts.includes(id)));
  const rest = r.shuffle(all.filter((id) => G.gifts.includes(id) && REG.GIFTS[id].once !== true));
  return [...fresh, ...rest].slice(0, n);
}

/** Игрок выбрал дар i из предложенных: расчёт продолжается. */
export function chooseGift(G, i) {
  const pend = G.pending;
  if (!pend || pend.kind !== 'gift' || !Number.isInteger(i) || i < 0 || i >= pend.options.length) return false;
  G.pending = null;
  takeGift(G, pend.options[i]);
  sfx(G, 'gift');
  return true;
}

// ---------- деньги ----------

/** Цена с учётом скидок лисы. */
export const shopPrice = (G, base) => Math.max(1, Math.round(base * G.player.st.shopMul));

/** Заплатить n монет. Не хватает — false, подсказка и звук отказа. */
export function spend(G, n) {
  if (G.coins < n) {
    toast(G, 'Не хватает монет');
    sfx(G, 'deny');
    return false;
  }
  G.coins -= n;
  return true;
}

// ---------- находки ----------

/**
 * Случайная находка: { id, lvl: 0 } или null. o: minRarity, maxRarity (0…3), kinds (['weapon', 'armor', 'acc'] по
 * умолчанию; можно 'potion'), rnd — своя случайность (иначе партии). Редкость — по локации и удаче; того, что у
 * лисы уже есть, старается не давать; нет вещей нужной редкости — берётся ближайшая.
 */
export function rollItem(G, o = null) {
  const r = o?.rnd ?? rndOf(G);
  const min = o?.minRarity ?? 0;
  const max = o?.maxRarity ?? 3;
  const kinds = o?.kinds ?? ['weapon', 'armor', 'acc'];
  const want = clamp(rollRarity(G.floor, G.player.st.luck, r), min, max);
  const pools = { weapon: REG.WEAPONS, armor: REG.ARMOR, acc: REG.ACCESSORIES, potion: REG.POTIONS };
  const all = [];
  for (const kind of kinds) {
    const reg = pools[kind];
    if (!reg) continue;
    for (const id of Object.keys(reg)) if (reg[id].drop !== false) all.push(id);
  }
  if (!all.length) return null;
  const rar = (id) => itemDef(id).rarity ?? 0;
  // ближайшая редкость, в которой что-то есть: сначала ниже, потом выше
  let tier = -1;
  for (let d = 0; d < 4 && tier < 0; d++) {
    for (const t of [want - d, want + d]) {
      if (tier < 0 && t >= 0 && t <= 3 && all.some((id) => rar(id) === t)) tier = t;
    }
  }
  if (tier < 0) return null;
  const same = all.filter((id) => rar(id) === tier);
  const fresh = same.filter((id) => !hasItem(G, id) && !G.seen.includes(id));
  const spare = same.filter((id) => !hasItem(G, id));
  const pool = fresh.length ? fresh : spare.length ? spare : same;
  return { id: r.pick(pool), lvl: 0 };
}

// ---------- подбираемое ----------

function collect(G, p) {
  if (p.kind === 'coin') {
    gainCoins(G, p.v, p.x, p.y);
    sfx(G, 'coin', p.x, p.y);
  } else if (p.kind === 'mana') {
    emit(G, { t: 'pick', x: p.x, y: p.y, kind: 'mana', v: addMana(G, p.v) });
    sfx(G, 'mana', p.x, p.y);
  } else {
    emit(G, { t: 'pick', x: p.x, y: p.y, kind: p.kind, v: heal(G, p.v) });
    sfx(G, 'heart', p.x, p.y);
  }
  const task = G.room.task;
  if (p.tag && task && task.def.onPick) task.def.onPick(G, task, p);
}

/**
 * Шаг подбираемого: выпавшее допрыгивает до места; монеты, сердца и мана притягиваются к лисе и подбираются
 * (сердце — только если есть что лечить, мана — если есть куда). В зачищенной комнате монеты и мана летят к
 * лисе откуда угодно. Вещи лежат, пока их не возьмут действием.
 */
export function stepPicks(G, dt) {
  const room = G.room;
  const picks = room.picks;
  if (!picks.length) return;
  const P = G.player;
  const st = P.st;
  const can = P.down <= 0 && !G.over;
  const take2 = PICK.take * PICK.take;
  for (let i = picks.length - 1; i >= 0; i--) {
    const p = picks[i];
    p.px = p.x;
    p.py = p.y;
    p.t += dt;
    if (p.z > 0 || p.vz > 0) {
      p.vz -= 620 * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0;
        p.vz = 0;
      }
    }
    if (p.vx !== 0 || p.vy !== 0) {
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (blockedAt(room, nx, ny, F_WALK)) {
        p.vx = 0;
        p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
        const k = 1 - 6 * dt;
        p.vx *= k;
        p.vy *= k;
        if (p.vx * p.vx + p.vy * p.vy < 16) {
          p.vx = 0;
          p.vy = 0;
        }
      }
    }
    if (p.kind === 'item' || !can || p.t < PICK.delay) continue;
    if (p.kind === 'mana' ? P.mana >= st.maxMana : p.kind !== 'coin' && !p.tag && P.hp >= st.maxHp) continue;
    const dx = P.x - p.x;
    const dy = P.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= take2) {
      collect(G, p);
      const at = picks[i] === p ? i : picks.indexOf(p);
      if (at >= 0) removePick(room, at);
      continue;
    }
    const far = p.pull || (room.vacuum && (p.kind === 'coin' || p.kind === 'mana'));
    if (!far && d2 > st.magnet * st.magnet) continue;
    // летит к лисе — напрямик, преграды не мешают
    const d = Math.sqrt(d2);
    const step = Math.min(d, (PICK.pull + (far ? 240 : 0)) * dt);
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.vx = 0;
    p.vy = 0;
  }
}

// ---------- карточка вещи ----------

const num = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const signed = (v, unit = '') => `${v < 0 ? '−' : '+'}${num(Math.abs(v))}${unit}`;

// как назвать характеристику в карточке; вид числа: '' — как есть, '%' — доля, 'с' — секунды
const STAT_TEXT = {
  maxHp: ['Сердца', ''], maxShield: ['Щит', ''], maxMana: ['Запас маны', ''], manaRegen: ['Мана в секунду', ''],
  speed: ['Скорость', ''], dashDmg: ['Урон рывка', ''], dashDist: ['Длина рывка', ''], dashDur: ['Время рывка', 'с'],
  dashCd: ['Перезарядка рывка', 'с'], dashCharges: ['Заряды рывка', ''], iframes: ['Неуязвимость после рывка', 'с'],
  crit: ['Шанс двойного урона', '%'], luck: ['Удача', ''], coinMul: ['Монеты', ''], magnet: ['Радиус подбора', ''],
  wDmg: ['Урон оружия', ''], wCd: ['Перезарядка оружия', ''], wCost: ['Расход маны', ''], wRange: ['Дальность оружия', ''],
  shotSpeed: ['Скорость выстрелов', ''], healBonus: ['Лечение', ''], aware: ['Чуткость добычи', ''],
  rabbitsPlus: ['Добыча в волне', ''], rabbitPts: ['Очки за добычу', ''], shopMul: ['Цены', ''],
  palSlots: ['Места для спутников', ''], palHp: ['Здоровье спутников', ''], hazardCut: ['Урон от напастей', ''],
  shieldRegen: ['Восстановление щита', ''], dodge: ['Шанс увернуться', '%'], preyStay: ['Добыча не уходит дольше', ''],
  warn: ['Напасти видны раньше', 'с'],
};

function statLines(def, lines) {
  if (def.add) {
    for (const k of Object.keys(def.add)) {
      const t = STAT_TEXT[k];
      const v = def.add[k];
      if (!t || !v) continue;
      if (k === 'hazardCut') lines.push(`${t[0]} ${signed(-v)}`);
      else if (t[1] === '%') lines.push(`${t[0]} ${signed(v * 100, ' %')}`);
      else lines.push(`${t[0]} ${signed(v, t[1] ? ` ${t[1]}` : '')}`);
    }
  }
  if (def.mul) {
    for (const k of Object.keys(def.mul)) {
      const t = STAT_TEXT[k];
      const v = def.mul[k];
      if (!t || !Number.isFinite(v) || v === 1) continue;
      lines.push(`${t[0]} ${signed(Math.round((v - 1) * 100), ' %')}`);
    }
  }
}

const SHOT_WORDS = [['burn', 'поджигает'], ['poison', 'отравляет'], ['slow', 'замедляет'], ['freeze', 'замораживает'], ['stun', 'оглушает']];

/**
 * Карточка вещи для окна рюкзака: { kind, name, rarity, lines, desc } или null. lines — числа, которые важны
 * игроку («Урон 5 · Мана 2 · 1,7 выстр./с»), desc — описание из реестра.
 */
export function itemInfo(item) {
  const kind = kindOf(item?.id);
  if (!kind) return null;
  const def = itemDef(item.id);
  const lines = [];
  if (kind === 'weapon') {
    const lvl = item.lvl ?? 0;
    const beam = def.pattern === 'beam';
    const many = ['spread', 'nova', 'burst', 'rain'].includes(def.pattern) ? def.shot?.n ?? { spread: 3, nova: 10, burst: 3, rain: 5 }[def.pattern] : 1;
    const parts = [`Урон ${num(weaponDmg(def, lvl))}${many > 1 ? ` ×${many}` : ''}${beam ? '/с' : ''}`];
    parts.push(def.mana > 0 ? `Мана ${num(def.mana)}${beam ? '/с' : ''}` : 'Без маны');
    if (!beam && def.cd > 0) parts.push(`${num(1 / def.cd)} выстр./с`);
    lines.push(parts.join(' · '));
    const words = SHOT_WORDS.filter(([k]) => def.shot?.[k] > 0).map(([, w]) => w);
    if (words.length) lines.push(words.join(', ').replace(/^./, (c) => c.toUpperCase()));
    if (lvl > 0) lines.push(`Заточка +${lvl}`);
  } else if (kind === 'armor') {
    lines.push(`Щит ${def.shield ?? 0}`);
    statLines(def, lines);
  } else if (kind === 'acc') statLines(def, lines);
  return { kind, name: def.name ?? item.id, rarity: clamp(def.rarity ?? 0, 0, 3), lines, desc: def.desc ?? '' };
}

/** Цена вещи у торговца для этой лисы на этой локации. */
export const itemPrice = (G, item) => shopPrice(G, price(item, G.floor));
