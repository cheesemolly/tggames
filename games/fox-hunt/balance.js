// Числа и формулы «Лисьей охоты» в одном месте: всё, что можно крутить, не трогая движок. Без DOM.
//
// Здесь только «сколько»: сила лисы, длина рывка, здоровье и число зверей, как часто бьют напасти, что и почём
// выпадает, из чего собирается волна. «Как» — в движке (player, combat, ai, director). Числа — стартовые: их
// подбирает прогон бота.

import { REG, BIOMES, T, clamp, lerp } from './core.js';

// ---------- лиса ----------

/** Характеристики лисы без вещей и даров. Вещи меняют их только через add / mul (см. items.js). */
export const BASE = {
  maxHp: 5, maxShield: 0, maxMana: 100, manaRegen: 0,
  speed: 132,
  dashDmg: 4, dashDist: 148, dashDur: 0.17, dashCd: 0.55, dashCharges: 1, iframes: 0.06,
  crit: 0.05, luck: 0, coinMul: 1, magnet: 34,
  wDmg: 1, wCd: 1, wCost: 1, wRange: 1, shotSpeed: 1,
  healBonus: 0, aware: 1, rabbitsPlus: 0, rabbitPts: 0, shopMul: 1,
  palSlots: 2, palHp: 1, hazardCut: 0, shieldRegen: 1, dodge: 0, preyStay: 1, warn: 0,
};

/** Пределы: что бы ни надела лиса, дальше характеристика не уйдёт. */
export const LIMITS = {
  maxHp: [1, 10], maxShield: [0, 8], maxMana: [0, 250], manaRegen: [0, 20],
  speed: [50, 260],
  dashDmg: [1, 60], dashDist: [60, 260], dashDur: [0.08, 0.4], dashCd: [0.15, 3], dashCharges: [1, 4], iframes: [0, 0.6],
  crit: [0, 0.8], luck: [0, 6], coinMul: [0, 5], magnet: [10, 240],
  wDmg: [0.1, 8], wCd: [0.25, 4], wCost: [0, 4], wRange: [0.3, 3], shotSpeed: [0.3, 3],
  healBonus: [0, 5], aware: [0.2, 3], rabbitsPlus: [0, 6], rabbitPts: [0, 5], shopMul: [0.2, 3],
  palSlots: [0, 3], palHp: [0.2, 5], hazardCut: [0, 3], shieldRegen: [0.2, 5], dodge: [0, 0.6], preyStay: [0.3, 3], warn: [0, 1.5],
};

/** Эти характеристики — целые (сердца, щит, заряды). */
export const WHOLE = ['maxHp', 'maxShield', 'maxMana', 'dashCharges', 'palSlots', 'rabbitsPlus', 'rabbitPts', 'healBonus', 'hazardCut'];

export const FOX = {
  lives: 3,
  accel: 2200,                // разгон и остановка, ед./с²
  iceAccel: 500,              // на льду — лиса скользит
  mud: 0.6,                   // скорость в грязи
  hurtInv: 1.1,               // после удара лиса столько секунд неуязвима
  respawnInv: 2,
  respawnTime: 1.2,           // сколько лежит, потеряв жизнь
  shieldDelay: 4,             // щит начинает восстанавливаться через столько секунд без урона
  shieldStep: 1.2,            // …по единице за столько секунд
  floorHurt: 1,               // колючки и горячая трещина: единица урона за столько секунд стояния
  knock: 230,                 // отбрасывание при ударе, ед./с
  nomanaGap: 0.6,             // «нет маны» — не чаще
  reviveInv: 2,
  windTime: 6,                // «второе дыхание» после потери жизни
};

export const DASH = {
  minPower: 0.45,             // самый короткий рывок — такая доля полного
  assistArc: (14 * Math.PI) / 180,
  assistExtra: 20,            // цель чуть дальше длины рывка тоже «притягивает»
  sweep: 14,                  // радиус, которым рывок задевает зверей
  height: 10,                 // высота прыжка (только для рисунка)
  step: 6,                    // шаг проверки пути
  extend: 1.2 * T,            // на сколько рывок дотянется вперёд, если конец пришёлся на воду или пень
  minLen: 10,                 // короче — рывка нет (упёрлась в стену), заряд не тратится
  bounceLen: 46,              // отскок от колючего
  bounceDur: 0.16,
  shockR: 48, shockDmg: 2, shockKb: 240,       // «гром при приземлении»
  trailStep: 26, trailR: 17, trailTime: 2.2, trailBurn: 2,   // огненный след
  freeze: 1, slow: 2,         // ледяной и паутинный рывок
  kb: 170,                    // отбрасывание тех, кого задел рывок
};

/** Сколько длится рывок такой длины: короткий — быстрее, но не мгновенный. */
export const dashTime = (st, len) => st.dashDur * clamp(len / st.dashDist, 0.45, 1.3);

export const POSE = { land: 0.12, hurt: 0.25, fire: 0.12, bite: 0.2, rise: 0.5, flash: 0.12 };

/** Числа умений-флагов (сами флаги — в player.js). */
export const PERK = {
  bugRange: 96, bugGap: 1.1, bugDmg: 1,          // светлячок: как далеко, как часто и как сильно бьёт
  sporeR: 48, sporeTime: 3, sporePoison: 2,       // облако спор, когда лису ударили
  blockInv: 0.6,                                  // оберег сработал — столько секунд лису не тронуть
  dodgeInv: 0.4,                                  // увернулась — столько
};

// ---------- подбираемое ----------

export const PICK = {
  mana: 6,                    // шарик маны
  flask: 35,                  // склянка
  delay: 0.35,                // только что выпавшее не подбирается столько секунд
  take: 15,                   // ближе этого — подобрано
  pull: 420,                  // скорость, с которой подбираемое летит к лисе
  itemReach: 32,              // с какого расстояния вещь можно взять действием
  thingReach: 26,             // …и с какого — открыть сундук, купить (сверх радиуса предмета)
};

/** Что выпадает из убитого зверя (сверх монет из его описания). luck добавляет к шансам. */
export const DROPS = {
  heart: 0.035, mana: 0.2, item: 0.012,
  eliteHeart: 0.2, eliteItem: 0.3,
  bushCoin: 0.3,
  luckHeart: 0.02, luckItem: 0.012,
};

/** Награда за зачищенную комнату: [вес, что]. */
export const CLEAR_REWARD = [
  [40, 'none'], [32, 'coins'], [12, 'heart'], [12, 'mana'], [4, 'item'],
];

export const RARITY_NAMES = ['Обычное', 'Редкое', 'Эпическое', 'Легендарное'];

/** Редкость находки (0…3): чем дальше локация и больше удача, тем чаще редкое. */
export function rollRarity(floor, luck, rnd) {
  const f = Math.min(8, Math.max(0, floor - 1));
  const w = [60 - 5 * f, 30 + 2 * f, 8 + 2.2 * f, 1.5 + 0.8 * f];
  for (let r = 1; r < 4; r++) w[r] *= 1 + Math.max(0, luck) * 0.4 * r;
  let at = rnd() * (w[0] + w[1] + w[2] + w[3]);
  for (let r = 0; r < 4; r++) {
    at -= w[r];
    if (at < 0) return r;
  }
  return 0;
}

const PRICES = {
  weapon: [18, 32, 55, 90],
  armor: [16, 30, 50, 80],
  acc: [14, 26, 45, 75],
  potion: [10, 14, 20, 28],
};
/** Цена сердечка и склянки маны у торговца. */
export const SHOP = { heart: 8, mana: 6, items: 3, extras: 2 };

/** Цена вещи у торговца на этой локации (без скидок лисы — их считает shopPrice в inventory.js). */
export function price(item, floor) {
  const def = item && (REG.WEAPONS[item.id] || REG.ARMOR[item.id] || REG.ACCESSORIES[item.id] || REG.POTIONS[item.id]);
  if (!def) return 0;
  const kind = REG.WEAPONS[item.id] ? 'weapon' : REG.ARMOR[item.id] ? 'armor' : REG.ACCESSORIES[item.id] ? 'acc' : 'potion';
  const base = PRICES[kind][clamp(def.rarity ?? 0, 0, 3)] * (1 + 0.2 * (item.lvl ?? 0));
  return Math.max(1, Math.round(base * (1 + 0.1 * Math.max(0, floor - 1))));
}

/** Оружие сильнее на четверть за каждый уровень (кузница). */
export const weaponDmg = (def, lvl) => (def.dmg ?? 0) * (1 + 0.25 * (lvl ?? 0));
export const MAX_LVL = 3;

// ---------- звери ----------

export const MOB = {
  hpPerFloor: 0.22,
  eliteHp: 2.2, eliteSize: 1.2, eliteDmg: 2, elitePts: 2,
  warm: 0.7,                  // столько секунд зверь «проявляется» из метки и безвреден
  farSpawn: 5 * T,            // враг появляется не ближе к лисе
  touchGap: 0.5,              // «ошейник»: как часто бьёт того, кто трётся о лису
  zoneDmg: 5,                 // сколько напасть (лось, обвал) снимает со зверя
};

export const mobHp = (base, floor, elite) => Math.max(1, Math.ceil(base * (1 + MOB.hpPerFloor * Math.max(0, floor - 1)) * (elite ? MOB.eliteHp : 1)));
export const eliteChance = (floor) => (floor <= 1 ? 0 : Math.min(0.35, 0.06 + 0.04 * (floor - 2)));
export const bossPts = (def, loop) => (def.pts ?? 30) + 10 * loop;

/** Повадки добычи, общие для всей (остальное — в описании каждой, mobs.js). */
export const PREY = {
  alert: 0.25,                // заметила лису — столько секунд стоит столбиком
  freeze: 0.45,               // загнана в угол — столько секунд не шевелится
  dive: 0.3,                  // сколько ныряет в нору
  calm: 2.2,                  // лиса дальше стольких «расстояний, с которых замечают» — успокаивается
  bolt: 0.9,                  // столько секунд после угла рвётся на простор
  pop: 0.45,                  // выскочив из норы, столько секунд осматривается
};

/** Действия на зверей: горит, отравлен, замедлен. */
export const STATUS = { tick: 0.5, burnDps: 1.5, poisonDps: 0.5, poisonMax: 5, poisonTime: 4, slow: 0.5 };

// ---------- охота ----------

export const HUNT = {
  inside: 2 * T,              // двери закрываются, когда лиса зашла на столько
  enter: 0.8,                 // …и через столько секунд выходит первая волна
  calm: 2.2,                  // передышка между волнами
  preyGap: 0.35,              // кролики выскакивают из нор по одному
  mobGap: 0.15,
  taskChance: 0.5,            // шанс задания в передышку
  maxMobs: 14,                // врагов в одной волне не больше
  strikeGap: 1.2,             // два удара напастей — не чаще
  minWarn: 0.8,               // короче этого напасти не предупреждают (на это опирается strikeGap)
  bossIntro: 1.6,
  giftDelay: 1.4,             // после гибели хозяина — пауза до выбора дара
  ravenChance: 0.35,
  modChance: 0.14,            // особая комната («туман», «изобилие»…) — со второй локации
};

export const waveBudget = (floor, loop) => 5 + 2.5 * floor + 6 * loop;
export const preyPerWave = (floor) => 3 + Math.min(floor, 5);
export const wavesPerRoom = (floor) => (floor <= 2 ? 2 : 3);
export const hazardCount = (floor) => (floor >= 4 ? 2 : 1);

/** Через сколько секунд следующая напасть: 7–11 с на первой локации, до 3,5–6 с после первого круга. */
export function hazardGap(floor, loop, rnd) {
  const p = loop >= 1 ? 1 : clamp((floor - 1) / 5, 0, 1);
  return lerp(7, 3.5, p) + rnd() * lerp(4, 2.5, p);
}

const biomeOf = (floor) => BIOMES[(((floor - 1) % BIOMES.length) + BIOMES.length) % BIOMES.length];

/** Какая добыча выходит в волне: в основном кролики, дальше — зайцы, изредка толстяк и золотой. */
function preyFor(floor, loop, n, rnd) {
  const out = [];
  let gold = false;
  for (let i = 0; i < n; i++) {
    const r = rnd();
    let id = 'rabbit';
    if (!gold && REG.MOBS.gold && floor >= 2 && r < 0.03 + 0.01 * loop) {
      id = 'gold';
      gold = true;
    } else if (REG.MOBS.fat && r < 0.13) id = 'fat';
    else if (REG.MOBS.hare && floor >= 2 && r < 0.13 + Math.min(0.4, 0.14 * (floor - 1))) id = 'hare';
    out.push(id);
  }
  return out;
}

/**
 * Состав волны — чистая функция: floor и loop — где мы, huntIndex — сколько охотничьих комнат на этой локации уже
 * пройдено, waveIndex — номер волны с нуля, rnd — случайность. Возвращает { prey: [id…], mobs: [{ id, elite }…] }.
 *
 * Враги набираются на «бюджет» (стоимость зверя — его cost): из зверей здешнего места, а до 35 % — из мест,
 * пройденных раньше. На первой локации новое вводится по одному: сначала только те, у кого intro ≤ huntIndex,
 * и бюджет растёт от комнаты к комнате.
 */
export function planWave(floor, loop, huntIndex, waveIndex, rnd) {
  const biome = biomeOf(floor);
  const bi = BIOMES.indexOf(biome);
  const here = [];
  const before = [];
  for (const id of Object.keys(REG.MOBS)) {
    const d = REG.MOBS[id];
    if (d.kind !== 'hostile' || d.wave === false) continue;
    if ((d.minFloor ?? 1) > floor) continue;
    if (floor === 1 && loop === 0 && (d.intro ?? 0) > huntIndex) continue;
    const at = BIOMES.indexOf(d.biome);
    if (d.biome === biome || at < 0) here.push(id);
    else if (loop >= 1 || at < bi) before.push(id);
  }
  // пока у места нет своих зверей (их ещё не нарисовали) — берутся любые
  const home = here.length ? here : before;

  let budget = waveBudget(floor, loop) * (0.8 + 0.2 * Math.min(2, waveIndex));
  if (floor === 1 && loop === 0) budget = Math.min(budget, 2 + 1.8 * huntIndex + waveIndex);
  const mobs = [];
  const elite = eliteChance(floor);
  const cost = (id) => Math.max(1, REG.MOBS[id].cost ?? REG.MOBS[id].pts ?? 1);
  for (let guard = 0; guard < 40 && mobs.length < HUNT.maxMobs && home.length; guard++) {
    const pool = before.length && here.length && rnd() < 0.35 ? before : home;
    const fits = pool.filter((id) => cost(id) <= budget);
    if (!fits.length) {
      if (pool === home) break;
      continue;
    }
    const id = rnd.weighted(fits, (x) => REG.MOBS[x].weight ?? 1) ?? fits[0];
    const pack = REG.MOBS[id].pack;
    let n = pack ? rnd.int(pack[0], pack[1]) : 1;
    n = Math.max(1, Math.min(n, Math.floor(budget / cost(id)), HUNT.maxMobs - mobs.length));
    const boss = !pack && rnd() < elite;
    for (let i = 0; i < n; i++) mobs.push({ id, elite: boss });
    budget -= cost(id) * n * (boss ? 1.5 : 1);
  }
  return { prey: preyFor(floor, loop, preyPerWave(floor), rnd), mobs };
}

/** Какие напасти бывают в охотничьей комнате: по одной на первых локациях, с четвёртой — две разные. */
export function hazardsFor(floor, loop, biome, huntIndex, rnd) {
  const fits = [];
  for (const id of Object.keys(REG.HAZARDS)) {
    const d = REG.HAZARDS[id];
    if (d.auto === false) continue;                         // только по вызову (молния «Грозы»)
    if ((d.minFloor ?? 1) > floor) continue;
    if (floor === 1 && loop === 0 && (d.intro ?? 0) > huntIndex) continue;
    if (d.biomes && !d.biomes.includes(biome)) continue;
    fits.push(id);
  }
  rnd.shuffle(fits);
  return fits.slice(0, hazardCount(floor));
}

// ---------- карта локации ----------

/** Сколько комнат в локации: 7–8 на первой, до 9–12 дальше. */
export function roomCount(floor, rnd) {
  const lo = Math.min(9, 6 + floor);
  const hi = Math.min(12, 7 + floor);
  return rnd.int(lo, hi);
}

/** Веса мест (кроме сундука и торговца — они есть всегда). Места нет в списке — берётся его weight или 1. */
export const PLACE_WEIGHTS = { altar: 1, well: 1, camp: 1.2, forge: 0.9, spring: 0.8, totem: 0.7, gamble: 0.8 };

/** Сколько ещё особых комнат (сверх сундука и торговца) помещается в локацию из n комнат. */
export function extraPlaces(n, rnd) {
  const room = Math.max(0, n - 7);                        // три охотничьи комнаты остаются всегда
  const want = n >= 11 ? 2 : n >= 9 ? 1 : rnd() < 0.5 ? 1 : 0;
  return Math.min(room, want);
}

export const MIMIC = 0.08;                  // шанс, что сундук — зубастый

// ---------- очки ----------

export const POINTS = { chain: 1, stump: 2 };
