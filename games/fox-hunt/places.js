// Места «Лисьей охоты»: особые комнаты без боя и то, что в них стоит, — сундук, торговец, жертвенный камень,
// колодец желаний, привал, кузница, родник, тотем испытания, пень-напёрсточник, а у выхода от хозяина — ворон-меняла.
// Место ставит в комнату предметы и отвечает, что происходит, когда лиса с ними что-то делает.
//
// Запись — { id: место }:
//   shop: {
//     name: 'Барсук-торговец',
//     desc: '…',               // одна короткая фраза о месте
//     spot: 'room',            // где живёт: 'room' — своя комната на карте (по умолчанию), 'start' — ставится в
//                              // первую комнату локации, 'boss' — появляется у хозяина после его гибели
//     weight: 1,               // как часто выбирается на карту среди прочих мест (сундук и торговец есть всегда;
//                              // веса можно править в balance.js, PLACE_WEIGHTS); minFloor — с какой локации
//     chance: 0.35,            // для spot 'boss': с каким шансом появится
//     build(G, room, mapRoom, rnd) {},   // поставить предметы; зовётся при КАЖДОМ входе в комнату (и после загрузки)
//     use(G, thing) {},                  // лиса сделала действие с предметом места
//     label(G, thing) {},                // подпись к действию: { title, sub, cost, ok }
//     step(G, room, dt) {},              // по желанию: каждый шаг, пока лиса в комнате
//     onBreak(G, thing) {},              // по желанию: ломкий предмет места сломан
//   }
//
// Главное правило: комната не сохраняется. Всё, что должно пережить уход лисы и загрузку (что продано, открыт ли
// сундук, сколько раз пользовались алтарём), пишите в mapRoom.data — это обычные данные (числа, строки, списки,
// объекты; без функций). build читает их и ставит предметы уже в нужном виде. В use запись комнаты —
// G.map.rooms[G.room.id]. Случайное в build берите из rnd: оно одно и то же при каждом входе в эту комнату.
//
// Метки шаблона комнаты: room.center { x, y } — буква C; room.slots — [{ n, x, y }] по буквам 1…5 (их может не
// быть: проверяйте); room.dens, room.burrows, room.spawns.
//
// Предмет — addThing(G, { kind, x, y, … }) из world.js:
//   kind — картинка thing.<kind>: 'chest' (v: 0 закрыт, 1 открыт), 'pedestal', 'portal', 'stump', 'target', 'sign',
//          'altar', 'well', 'forge', 'spring', 'totem', 'gamble', 'tent'; rig — вместо картинки живая фигура:
//          'trader', 'raven', 'beaver' и спутники;
//   place: 'shop' — чей предмет: его use и label придут сюда; usable: true — с ним можно что-то сделать;
//   item: { id, lvl } — вещь, которая лежит на нём (рисуется сверху); icon: 'pick.heart' — другая картинка сверху;
//   cost, text, tag, data — что угодно своё; r — радиус, solid: false — сквозь него можно пройти;
//   breakable, hp — ломается рывком и выстрелами.
// label возвращает { title: 'Купить', sub: 'Лук охотника', cost: 30, ok: хватает ли монет } — из этого игра
// собирает подсказку «Купить: Лук охотника — 30».
//
// Что ещё можно звать:
//   из director.js: openChest(G, thing, loot) — открыть сундук и высыпать добычу ({ item } | { minRarity, kinds },
//                   coins, heart); startFight(G, done) — закрыть двери до победы над теми, кого место выпустило;
//                   startChallenge(G, волн, done) — испытание волнами; queueMob(G, id, elite, delay);
//   из inventory.js: giveItem(G, { id, lvl }) → 'equip' | 'bag' | 'swap' | false, rollItem(G, { minRarity, kinds, rnd })
//                    → { id, lvl } | null, itemPrice(G, item), shopPrice(G, цена), spend(G, монет) → хватило ли,
//                    takeGift(G, id), hasItem(G, id);
//   из player.js: heal(G, n), addMana(G, n), gainCoins(G, n), addEffect(G, id, сек),
//                 payHearts(G, n) → отдала ли (плата сердцами; последнее сердце не отдаётся);
//   из ai.js: spawnMob(G, id, x, y, { elite, warm, tame }), hireMinion(G, id) → нанят ли;
//   из world.js: addThing, removeThing(room, thing), addPick(G, 'coin' | 'heart' | 'mana' | 'item', x, y, v, id),
//                dropCoins(G, x, y, n), freeSpot(G, min, max, rnd);
//   из core.js: toast(G, 'текст'), floatText(G, x, y, 'текст'), itemDef(id) — описание вещи, kindOf(id) — её вид;
//               звуки мест: sfx(G, 'buy', x, y) — покупка, sfx(G, 'deny') — отказ, sfx(G, 'altar', x, y) — жертва,
//               sfx(G, 'well', x, y) — монета в колодец, sfx(G, 'forge', x, y) — кузница, sfx(G, 'heal', x, y) — родник
//               (звук найма hireMinion играет сам).
// Счётчик пожертвований колодца: G.cnt.donated (эта партия) и G.flags.donated (всего до неё).
//
// Как устроены места в этом файле:
//   • подпись (label) — единственное место, где решается, можно ли сейчас действовать: use первым делом спрашивает
//     её же, поэтому обещанное в подписи и сделанное не расходятся;
//   • предмет, с которым сейчас ничего не сделать (нет монет, сердце последнее, родник выпит), действие не
//     перехватывает: его подпись показывается подсказкой, как у таблички, — за этим следит tend. Прилавки торговца
//     и ворона устроены по-лавочному: «включены», пока товар не продан, а на нехватку отвечают отказом;
//   • хозяева (барсук, бобёр, ворон) — фигуры: 'idle', 'talk' — лиса подошла, 'happy' — сделка; у бобра ещё 'work';
//   • плата, которая остаётся до конца партии (сердце ворону, прибавка маны от камня), — «дар наоборот» из
//     PLACE_GIFTS: на выбор после хозяина его не предлагают, выдаёт только место;
//   • все числа мест — в таблицах сразу под этим описанием.

import { T, REG, kindOf, itemDef, own, rnd, randInt, sfx, toast, floatText, banner, emit } from './core.js';
import { MIMIC, SHOP, PICK, POSE, HUNT, LIMITS, MAX_LVL, price } from './balance.js';
import { SIDES, addThing, removeThing, addPick, dropCoins, standable } from './world.js';
import { heal, addMana, addEffect, payHearts } from './player.js';
import { spawnMob, hireMinion } from './ai.js';
import { openChest, startFight, startChallenge } from './director.js';
import { giveItem, rollItem, shopPrice, spend, takeGift } from './inventory.js';

// ---------- числа ----------
// Цены вещей, шанс зубастого сундука и ворона — в balance.js; здесь то, что есть только у мест.

/**
 * Жертвенный камень: что даёт и с какими шансами. Строка odds — который раз подряд камнем пользуются в этой
 * комнате (дальше пятого — как пятый); в каждой строке сумма 100. boon — прибавка к запасу маны до конца партии.
 */
export const ALTAR = {
  mana: 40, boon: 10, coins: 10, coinsPerFloor: 2, minRarity: 1,
  odds: [
    { item: 26, coins: 24, mana: 20, boon: 12, none: 18 },
    { item: 22, coins: 20, mana: 18, boon: 10, none: 30 },
    { item: 17, coins: 16, mana: 14, boon: 9, none: 44 },
    { item: 12, coins: 12, mana: 10, boon: 6, none: 60 },
    { item: 9, coins: 9, mana: 6, boon: 4, none: 72 },
  ],
};

/**
 * Колодец желаний: ставка, шансы (сумма 100) и вехи щедрости. coins — сколько монет в «монетном дожде» (от и до),
 * orbs — сколько шариков маны, bless — сколько секунд держится благословение.
 */
export const WELL = {
  stake: 5, orbs: 4, coins: [9, 13], bless: 25, blessings: ['haste', 'rage', 'stone'],
  odds: { heart: 22, mana: 22, coins: 12, bless: 14, none: 30 },
  marks: [50, 150, 400],
};

/**
 * Пень-напёрсточник: ставка и шансы (сумма 100). Игра чуть в убыток, как настоящие напёрстки: монетами в среднем
 * возвращается меньше половины ставки, зато изредка выпадает вещь, а раз из ста — куш (редкая вещь и jackpot монет).
 */
export const GAMBLE = {
  stake: 8, orbs: 4, coins: [12, 16], jackpot: 20,
  odds: { none: 36, heart: 14, mana: 14, coins: 22, potion: 8, item: 5, jackpot: 1 },
};

/** Кузница: цена заточки на +1, +2 и +3 (на первой локации; дальше растёт, как цены вещей). */
export const FORGE = { price: [20, 35, 55] };
/** Родник: сколько маны прибавляет (сердца возвращает все). */
export const SPRING = { mana: 50 };
/** Тотем испытания: сколько волн и что лежит в наградном сундуке. */
export const TOTEM = { waves: 3, minRarity: 1, coins: 6, coinsPerFloor: 2 };
/** Привал: сколько зверей ждёт найма и цена того, у кого своя не указана. */
export const CAMP = { cands: 2, price: 25 };
/** Ворон: редкость вещи и сколько сердец он лисе обязательно оставит. */
export const RAVEN = { rarity: 2, keep: 2 };
/** Зубастый сундук: что отдаёт место, если сам зверь ничего ценного не роняет (обычно роняет — см. mobs3.js). */
export const MIMIC_LOOT = { minRarity: 1, coins: 6, coinsPerFloor: 2 };

/**
 * «Дары наоборот»: то, что место даёт или берёт до конца партии. Устроены как дары леса (items.js), но с
 * offer: false — на выбор после хозяина не предлагаются, их выдаёт только место через takeGift.
 */
export const PLACE_GIFTS = {
  ravenfee: { name: 'Плата ворону', desc: 'Одно сердце отдано ворону насовсем.', offer: false, add: { maxHp: -1 } },
  altarboon: { name: 'Дар камня', desc: 'Запас маны больше на 10.', offer: false, add: { maxMana: ALTAR.boon } },
};
// Дары попадают в общий реестр здесь, а не через content.js: тот собирает дары только из items.js. Иначе после
// загрузки партия с таким даром не узнала бы его. (Перенесёте записи в items.js — уберите эти две строки.)
for (const id of Object.keys(PLACE_GIFTS)) REG.GIFTS[id] = PLACE_GIFTS[id];

const GIFTS_MAX = 60;                       // больше даров в партии не копится (сохранение принимает до 80)
const SHOP_HEAL = 2;                        // сколько сердец возвращает «сердце» у торговца
const SYNC = 6;                             // раз во столько шагов предмет сверяет, можно ли с ним что-то сделать
const NEAR = 64;                            // с какого расстояния хозяин места замечает лису
const POSE_TIME = { talk: 0.6, happy: 0.8, work: 0.9 };
const RISK_WORD = ['Риск', 'Риск растёт:', 'Риск растёт:', 'Риск велик:', 'Риск велик:'];

// ---------- общее ----------

const mapRoomOf = (G) => G.map.rooms[G.room.id];
const slotOf = (room, n) => room.slots.find((s) => s.n === n) ?? null;
// счётчик из записи комнаты: в сохранении на его месте может оказаться что угодно
const count = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const record = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// цены у хозяев мест растут с локацией так же, как цены вещей (balance.js, price)
const grown = (G, base) => Math.max(1, Math.round(base * (1 + 0.1 * Math.max(0, G.floor - 1))));

const offer = (title, sub = '', cost = 0) => ({ title, sub, cost, ok: true });
const blocked = (title, sub = '', cost = 0) => ({ title, sub, cost, ok: false });
/** Подпись одной строкой — так же, как её собирает игра: «Купить: Лук охотника — 30». */
export const hintOf = (l) => `${l.title}${l.sub ? `: ${l.sub}` : ''}${l.cost > 0 ? ` — ${l.cost}` : ''}`;

// Розыгрыш по таблице { исход: вес }. Случайность — партии: сохранённая партия разыграет то же самое.
function draw(G, odds) {
  let total = 0;
  for (const k in odds) total += odds[k];
  let at = rnd(G) * total;
  for (const k in odds) {
    at -= odds[k];
    if (at < 0) return k;
  }
  return 'none';
}

// Случайная находка выпрыгивает на землю; false — давать нечего
function popItem(G, x, y, o) {
  const it = rollItem(G, o);
  if (it) addPick(G, 'item', x, y, 1, it.id, 0);
  return Boolean(it);
}

function popMana(G, x, y, n) {
  for (let i = 0; i < n; i++) addPick(G, 'mana', x, y, PICK.mana);
}

// ---------- где что стоит ----------

// Запасные места вокруг середины комнаты (в клетках) — для шаблонов без цифр
const AROUND = [[-3, 0], [3, 0], [-1.5, -2], [1.5, -2], [0, 2], [-3, 2], [3, 2], [-3, -2], [3, -2], [0, -2.5]];
// Где ворону сесть возле портала (в клетках от середины); прилавок с вещью — прямо перед ним
const PERCH = [[-2, -0.25], [2, -0.25], [0, -2.25], [-2, -2], [2, -2], [-3, 1], [3, 1], [0, 1.75], [-4, 0], [4, 0]];
const STALL_DY = 26;

// Годится ли точка под предмет радиуса r: не в преграде, не у двери, не на лисьей норе и не вплотную к стоящему
function roomy(room, x, y, r = 12) {
  if (!standable(room, x, y, r)) return false;
  for (const side of SIDES) {
    const d = room.doors[side];
    if (d && Math.hypot(d.x - x, d.y - y) < 2 * T) return false;
  }
  for (const den of room.dens) if (Math.hypot(den.x - x, den.y - y) < r + 16) return false;
  for (const th of room.things) if (Math.hypot(th.x - x, th.y - y) < th.r + r + 6) return false;
  return true;
}

// Место под n-й предмет: цифра шаблона, а если её нет — свободная точка возле середины. null — поставить некуда
function spotOf(room, n) {
  const s = slotOf(room, n);
  if (s) return s;
  for (let i = 0; i < AROUND.length; i++) {
    const o = AROUND[(n - 1 + i) % AROUND.length];
    const x = room.center.x + o[0] * T;
    const y = room.center.y + o[1] * T;
    if (roomy(room, x, y)) return { x, y };
  }
  return null;
}

// ---------- подпись, подсказка, хозяева ----------

// Сверить предмет с его подписью: действовать можно — он ждёт действия; нельзя — подпись становится подсказкой,
// которая действие не перехватывает (лиса рядом с таким предметом стреляет, как обычно)
function sync(G, th) {
  const l = PLACES[th.place]?.label?.(G, th) ?? null;
  th.usable = Boolean(l && l.ok);
  th.text = l && !l.ok ? hintOf(l) : '';
}

// Предмет, который сам следит, можно ли с ним сейчас что-то сделать (см. tend)
function addLive(G, o) {
  const th = addThing(G, o);
  if (!th) return null;
  th.data.live = 1;
  th.data.wait = SYNC;
  sync(G, th);
  return th;
}

// Отказ: то же, что написано в подписи, — подсказкой внизу экрана
function refuse(G, th, l) {
  toast(G, hintOf(l));
  sfx(G, 'deny');
  sync(G, th);
}

function nope(G, text) {
  toast(G, text);
  sfx(G, 'deny');
}

function pose(th, act) {
  th.act = act;
  th.k = 0;
  th.t = 0;
}

// Хозяин места стоит на месте и смотрит на лису: кивает, когда она подошла, радуется после сделки
function keeper(G, th, dt) {
  const P = G.player;
  const d = th.data;
  d.npc = 2;                                // шаг места и правда идёт — позы есть кому довести до конца
  if (Math.abs(P.x - th.x) > 4) th.face = P.x > th.x ? 1 : -1;
  if (th.act !== 'idle') {
    th.k += dt / (POSE_TIME[th.act] ?? 0.6);
    if (th.k < 1) return;
    if (th.act === 'work') {
      pose(th, 'happy');                    // доделал — доволен
      return;
    }
    th.act = 'idle';
    th.k = 0;
  }
  const near = Math.hypot(P.x - th.x, P.y - th.y) < NEAR ? 1 : 0;
  if (near && !d.near) pose(th, 'talk');
  d.near = near;
}

// Хозяин (фигура rig) радуется сделке или берётся за работу. Если шаг места не идёт (ворон стоит в комнате
// хозяина, а шаг там свой), поза так и застыла бы — тогда её лучше не трогать
function cheer(room, rig, act = 'happy') {
  for (const th of room.things) {
    if (th.rig === rig && th.data.npc > 1) pose(th, act);
  }
}

/**
 * Шаг любого места: хозяева отзываются на лису, а предметы сверяются со своими подписями. Пока в комнате бой
 * (испытание тотема, зубастый сундук), места молчат.
 */
function tend(G, room, dt) {
  if (room.dir.mode !== 'cleared') return;
  const things = room.things;
  for (let i = 0; i < things.length; i++) {
    const th = things[i];
    const d = th.data;
    if (d.npc) keeper(G, th, dt);
    if (!d.live || --d.wait > 0) continue;
    d.wait = SYNC;
    sync(G, th);
  }
}

// ---------- сундук ----------

const CHEST_LABEL = () => offer('Открыть', 'Сундук');

// Что лежит в обычном сундуке: редкость — по локации и удаче лисы (rollItem), с третьей локации не ниже редкой
const chestLoot = (G) => ({ minRarity: G.floor >= 3 ? 1 : 0, coins: 2 + G.floor });

// Зубастый сундук побеждён: комната запоминает это только теперь — если партию закрыли посреди боя, он снова
// притворится сундуком. Если зверь сам ничего ценного не роняет, находку за него отдаёт место
function mimicDone(G) {
  const room = G.room;
  const d = mapRoomOf(G).data;
  d.opened = 1;
  const def = REG.MOBS.mimic;
  if (def && (def.drops || def.onDie)) return;
  const x = room.center.x;
  const y = room.center.y + 16;
  popItem(G, x, y, { minRarity: MIMIC_LOOT.minRarity });
  dropCoins(G, x, y, MIMIC_LOOT.coins + MIMIC_LOOT.coinsPerFloor * G.floor);
}

// Вместо находки — зверь. Зубастый сундук появляется спящим и выглядит как закрытый сундук, так что подмены не
// видно: настоящий сундук убирается, зверь встаёт на его место, двери закрываются — и от этого он просыпается сам
// (так велит начало mobs3.js: warm: 0 и startFight). false — не вышло, сундук остаётся сундуком
function releaseMimic(G, th) {
  if (!own(REG.MOBS, 'mimic') || G.room.dir.mode !== 'cleared') return false;
  const m = spawnMob(G, 'mimic', th.x, th.y, { warm: 0 });
  if (!m) return false;
  removeThing(G.room, th);
  startFight(G, mimicDone);
  return true;
}

// ---------- лавка ----------

const WARE_NAME = { heart: 'Сердце', mana: 'Склянка маны' };
const WARE_ICON = { heart: 'pick.heart', mana: 'pick.mana' };
// на трёх прилавках — оружие, броня и украшение: чтобы было из чего выбрать
const SHELVES = [['weapon'], ['armor'], ['acc']];

// Товар лавки: три вещи и два расходника. Список катается один раз и дальше лежит в записи комнаты.
function rollStock(G, r) {
  const stock = [];
  const has = (id) => stock.some((e) => e.id === id);
  const put = (it) => stock.push({ k: 'item', id: it.id, price: price(it, G.floor), sold: false });
  for (let i = 0; i < SHOP.items; i++) {
    // нужного вида не нашлось (или такая уже лежит) — любая другая вещь
    let it = rollItem(G, { rnd: r, kinds: SHELVES[i % SHELVES.length] });
    for (let guard = 0; guard < 8 && (!it || has(it.id)); guard++) it = rollItem(G, { rnd: r });
    if (it && !has(it.id)) put(it);
  }
  for (let i = 0; i < SHOP.extras; i++) {
    const potion = r() < 0.5 ? rollItem(G, { rnd: r, kinds: ['potion'] }) : null;
    if (potion && !has(potion.id)) put(potion);
    else if (i === 0) stock.push({ k: 'heart', price: SHOP.heart + G.floor, sold: false });
    else stock.push({ k: 'mana', price: SHOP.mana + G.floor, sold: false });
  }
  return stock;
}

// Запись товара на прилавке (или null: записи нет, вещь сняли с игры, список испорчен)
function wareOf(G, th) {
  const stock = mapRoomOf(G).data.stock;
  const e = Array.isArray(stock) ? stock[th.tag] : null;
  if (!record(e)) return null;
  if (e.k === 'item') return kindOf(e.id) ? e : null;
  return own(WARE_NAME, e.k) ? e : null;
}

// Цена товара без скидок лисы: та, что записана, а если запись испорчена — посчитанная заново
function wareBase(G, e) {
  if (Number.isFinite(e.price) && e.price > 0) return e.price;
  if (e.k === 'item') return price({ id: e.id }, G.floor);
  return (e.k === 'heart' ? SHOP.heart : SHOP.mana) + G.floor;
}

// ---------- жертвенный камень ----------

const altarTier = (d) => Math.min(ALTAR.odds.length - 1, count(d.uses));

function altarLabel(G) {
  if (G.player.hp <= 1) return blocked('Сердце всего одно', 'Камень его не возьмёт');
  const tier = altarTier(mapRoomOf(G).data);
  // чем больше взято, тем чаще камень молчит — подпись об этом предупреждает
  return offer('Пожертвовать сердце', `${RISK_WORD[tier]} ${ALTAR.odds[tier].none} %`);
}

// ---------- колодец желаний ----------
// Вехи щедрости. Колодец считает монеты, брошенные за все партии: G.flags.donated — сколько было до этой,
// G.cnt.donated — сколько в этой. Дошёл общий счёт до 50, 150 и 400 монет — колодец «помнит» лису: в каждой
// партии первые её броски (по одному на каждую достигнутую веху) приносят не случайное, а верное: за первую веху —
// два сердца, за вторую — зелье, за третью — редкую вещь. Сколько вех уже отблагодарено в этой партии, лежит в
// G.flags.well. Подарки скромные нарочно: это спасибо за постоянство, а не способ разбогатеть.

const donated = (G) => count(G.flags.donated) + count(G.cnt.donated);

// Сколько вех набрано общим счётом пожертвований
function marksOf(total) {
  let n = 0;
  for (const m of WELL.marks) if (total >= m) n += 1;
  return n;
}

function wellLabel(G) {
  if (G.coins < WELL.stake) return blocked('Не хватает монет', 'Колодец желаний', WELL.stake);
  // следующий бросок принесёт подарок за веху — если счёт уже набран или наберётся этой ставкой
  const due = marksOf(donated(G) + WELL.stake) > count(G.flags.well);
  return offer('Бросить монеты', due ? 'Колодец тебя помнит' : '', WELL.stake);
}

// Подарок за веху номер i (с нуля)
function wellGift(G, th, i) {
  const x = th.x;
  const y = th.y + 20;
  if (i === 0) addPick(G, 'heart', x, y, 2);
  else if (i === 1) {
    if (!popItem(G, x, y, { kinds: ['potion'] })) dropCoins(G, x, y, 3 * WELL.stake);
  } else if (!popItem(G, x, y, { minRarity: 1 })) dropCoins(G, x, y, 5 * WELL.stake);
  toast(G, 'Колодец помнит твою щедрость');
  floatText(G, th.x, th.y - 34, 'Подарок');
  sfx(G, 'taskok', th.x, th.y);
}

function wellRoll(G, th) {
  const x = th.x;
  const y = th.y + 20;
  let got = draw(G, WELL.odds);
  let bless = '';
  if (got === 'bless') {
    const fits = WELL.blessings.filter((id) => own(REG.EFFECTS, id));
    bless = fits.length ? fits[Math.floor(rnd(G) * fits.length)] : '';
    if (!bless || !addEffect(G, bless, WELL.bless)) got = 'heart';
  }
  if (got === 'heart') {
    addPick(G, 'heart', x, y, 1);
    floatText(G, th.x, th.y - 34, 'Сердце');
  } else if (got === 'mana') {
    popMana(G, x, y, WELL.orbs);
    floatText(G, th.x, th.y - 34, 'Мана');
  } else if (got === 'coins') {
    dropCoins(G, x, y, randInt(G, WELL.coins[0], WELL.coins[1]));
    floatText(G, th.x, th.y - 34, 'Монетный дождь');
  } else if (got === 'bless') {
    const name = REG.EFFECTS[bless].name ?? '';
    toast(G, `Колодец дарит: ${name.toLowerCase()} на ${WELL.bless} с`);
    floatText(G, th.x, th.y - 34, name);
    sfx(G, 'magic', th.x, th.y);
  } else floatText(G, th.x, th.y - 34, 'Тишина');
}

// ---------- привал ----------

// Запись зверя, который ждёт найма (или null: его уже наняли, такого зверя больше нет, список испорчен)
function candOf(G, th) {
  const list = mapRoomOf(G).data.cands;
  const c = Array.isArray(list) ? list[th.tag] : null;
  return record(c) && own(REG.MINIONS, c.id) && !c.hired ? c : null;
}

const campPrice = (G, id) => shopPrice(G, grown(G, REG.MINIONS[id].price ?? CAMP.price));

function campLabel(G, th) {
  const c = candOf(G, th);
  if (!c) return null;
  const name = REG.MINIONS[c.id].name ?? '';
  if (G.minions.length >= G.player.st.palSlots) return blocked('Нет места для спутника', name);
  const cost = campPrice(G, c.id);
  if (G.coins < cost) return blocked('Не хватает монет', name, cost);
  return offer('Нанять', name, cost);
}

// ---------- кузница ----------

const forgePrice = (G, lvl) => shopPrice(G, grown(G, FORGE.price[Math.min(lvl, FORGE.price.length - 1)]));

function forgeLabel(G) {
  const it = G.inv.weapon;
  const def = it && own(REG.WEAPONS, it.id) ? REG.WEAPONS[it.id] : null;
  if (!def) return blocked('Нужно оружие в лапах');
  const lvl = count(it.lvl);
  if (lvl >= MAX_LVL) return blocked('Лучше уже некуда', `${def.name} +${lvl}`);
  const cost = forgePrice(G, lvl);
  const sub = `${def.name} +${lvl + 1}`;
  if (G.coins < cost) return blocked('Не хватает монет', sub, cost);
  return offer('Заточить', sub, cost);
}

// ---------- родник ----------

function springLabel(G) {
  const P = G.player;
  if (mapRoomOf(G).data.used) return blocked('Родник иссяк');
  if (P.hp >= P.st.maxHp && P.mana >= P.st.maxMana) return blocked('Силы и так при тебе', 'Родник подождёт');
  return offer('Напиться', 'Родник');
}

// ---------- тотем испытания ----------

function totemLabel(G, th) {
  if (th.kind === 'chest') return CHEST_LABEL();
  if (mapRoomOf(G).data.won) return blocked('Испытание пройдено');
  if (G.room.dir.mode !== 'cleared') return blocked('Испытание идёт');
  return offer('Принять испытание', 'Три волны, двери закроются');
}

function totemChest(G, room, opened) {
  const at = spotOf(room, 5) ?? { x: room.center.x, y: room.center.y + 2 * T };
  return addThing(G, { kind: 'chest', x: at.x, y: at.y, r: 12, place: 'totem', v: opened ? 1 : 0, usable: !opened });
}

// Все волны пройдены: тотем гаснет, рядом появляется сундук
function totemWon(G) {
  const room = G.room;
  const d = mapRoomOf(G).data;
  d.won = 1;
  for (const th of room.things) {
    if (th.place !== 'totem' || th.kind !== 'totem') continue;
    th.v = 1;
    sync(G, th);
  }
  const chest = totemChest(G, room, false);
  toast(G, 'Испытание пройдено — сундук твой');
  sfx(G, 'taskok', chest?.x, chest?.y);
}

// ---------- пень-напёрсточник ----------

function gambleLabel(G) {
  if (G.coins < GAMBLE.stake) return blocked('Не хватает монет', 'Напёрстки', GAMBLE.stake);
  return offer('Сыграть', 'Напёрстки', GAMBLE.stake);
}

// ---------- ворон-меняла ----------

// Уговор ворона из записи комнаты хозяина (или null: его не было, вещь сняли с игры, запись испорчена)
function dealOf(G) {
  const deal = mapRoomOf(G).data.raven;
  return record(deal) && kindOf(deal.id) ? deal : null;
}

function ravenLabel(G) {
  const deal = dealOf(G);
  if (!deal || deal.done) return null;
  const name = itemDef(deal.id).name ?? '';
  if (G.player.st.maxHp <= RAVEN.keep) return blocked('Сердец слишком мало', name);
  return offer('Отдать сердце насовсем', name);
}

// Где ворону сесть: возле портала, но не на нём и не на сундуке хозяина. null — некуда
function perchOf(room) {
  for (const o of PERCH) {
    const x = room.center.x + o[0] * T;
    const y = room.center.y + o[1] * T;
    if (roomy(room, x, y, 10) && roomy(room, x, y + STALL_DY, 10)) return { x, y };
  }
  return null;
}

// ---------- места ----------

export const PLACES = {
  // Начало пути: на самой первой локации — два ручных кролика, сундук с простым оружием и таблички-подсказки.
  // Запись комнаты: met — кролики уже были, weapon — что лежит в сундуке, opened — он открыт.
  start: {
    name: 'Начало пути', desc: 'Тихая поляна, с которой начинается охота.', spot: 'start',
    build(G, room, mapRoom, r) {
      if (G.floor !== 1) return;
      const d = mapRoom.data;
      if (!d.met) {
        d.met = 1;
        for (const n of [1, 2]) {
          const s = slotOf(room, n);
          if (s && REG.MOBS.rabbit) spawnMob(G, 'rabbit', s.x, s.y, { tame: true });
        }
      }
      if (kindOf(d.weapon) !== 'weapon') {
        const simple = Object.keys(REG.WEAPONS).filter((id) => (REG.WEAPONS[id].rarity ?? 0) === 0 && REG.WEAPONS[id].drop !== false);
        d.weapon = simple.length ? r.pick(simple) : null;
      }
      addThing(G, { kind: 'chest', x: room.center.x, y: room.center.y, place: 'start', v: d.opened ? 1 : 0, usable: !d.opened && Boolean(d.weapon) });
      const hints = ['Левый стик — идти', 'Потяни правый стик и отпусти — рывок', 'Держи правый стик — действие и выстрел'];
      for (let i = 0; i < hints.length; i++) {
        const s = slotOf(room, i + 3);
        if (s) addThing(G, { kind: 'sign', x: s.x, y: s.y, r: 8, solid: false, text: hints[i], reach: 44 });
      }
    },
    use(G, th) {
      const d = mapRoomOf(G).data;
      if (th.kind === 'chest' && openChest(G, th, { item: { id: d.weapon, lvl: 0 } })) d.opened = 1;
    },
    label: CHEST_LABEL,
  },

  // Сундук: одна бесплатная находка. Изредка сундук оказывается зубастым (если такой зверь описан): вместо
  // находки — бой при закрытых дверях, а добыча — с побеждённого.
  // Запись комнаты: opened — сундук открыт (или зубастый побеждён), mimic — этот сундук зубастый (решается один
  // раз, при первом входе: сколько в комнату ни заходи, сундук тот же).
  treasure: {
    name: 'Сундук', desc: 'Одна находка даром — если сундук не окажется зубастым.',
    build(G, room, mapRoom, r) {
      const d = mapRoom.data;
      if (d.mimic !== 0 && d.mimic !== 1) d.mimic = own(REG.MOBS, 'mimic') && r() < MIMIC ? 1 : 0;
      const opened = Boolean(d.opened);
      if (opened && d.mimic) return;                          // сундук и был зверем: от него ничего не осталось
      addThing(G, { kind: 'chest', x: room.center.x, y: room.center.y, place: 'treasure', v: opened ? 1 : 0, usable: !opened });
    },
    use(G, th) {
      const d = mapRoomOf(G).data;
      if (d.opened || th.v === 1) return;
      if (d.mimic && releaseMimic(G, th)) return;
      d.mimic = 0;
      if (openChest(G, th, chestLoot(G))) d.opened = 1;
    },
    label: CHEST_LABEL,
  },

  // Барсук-торговец: на трёх прилавках — оружие, броня и украшение, ещё на двух — расходники (сердце, склянка
  // маны или зелье). Цены — из balance.js (price), скидки лисы считает shopPrice. Проданное остаётся проданным.
  // Запись комнаты: stock — [{ k: 'item' | 'heart' | 'mana', id, price, sold }].
  shop: {
    name: 'Барсук-торговец', desc: 'Три вещи и пара мелочей за монеты.',
    build(G, room, mapRoom, r) {
      const d = mapRoom.data;
      if (!Array.isArray(d.stock)) d.stock = rollStock(G, r);
      addThing(G, { kind: 'trader', rig: 'trader', x: room.center.x, y: room.center.y, r: 13, data: { npc: 1, near: 0 } });
      for (let i = 0; i < d.stock.length && i < SHOP.items + SHOP.extras; i++) {
        const e = d.stock[i];
        const s = spotOf(room, i + 1);
        if (!s || !record(e) || (e.k === 'item' ? !kindOf(e.id) : !own(WARE_NAME, e.k))) continue;
        const sold = Boolean(e.sold);
        addThing(G, {
          kind: 'pedestal', x: s.x, y: s.y, r: 10, place: 'shop', usable: !sold, tag: i,
          item: e.k === 'item' && !sold ? { id: e.id, lvl: 0 } : null, icon: sold ? null : WARE_ICON[e.k] ?? null, cost: wareBase(G, e),
        });
      }
    },
    use(G, th) {
      const e = wareOf(G, th);
      const P = G.player;
      if (!e || e.sold) return;
      if (e.k === 'heart' && P.hp >= P.st.maxHp) {
        nope(G, 'Сердца и так целы');
        return;
      }
      if (e.k === 'mana' && P.mana >= P.st.maxMana) {
        nope(G, 'Мана и так полна');
        return;
      }
      if (e.k === 'item' && kindOf(e.id) === 'potion' && !G.inv.bag.includes(null)) {
        nope(G, 'Рюкзак полон');
        return;
      }
      const cost = shopPrice(G, wareBase(G, e));
      if (!spend(G, cost)) return;
      if (e.k === 'heart') heal(G, SHOP_HEAL);
      else if (e.k === 'mana') addMana(G, PICK.flask);
      else if (!giveItem(G, { id: e.id, lvl: 0 }, th.x, th.y + 18)) {
        G.coins += cost;                    // взять не вышло — деньги назад
        return;
      }
      e.sold = true;
      th.usable = false;
      th.item = null;
      th.icon = null;
      sfx(G, 'buy', th.x, th.y);
      floatText(G, th.x, th.y - 24, `−${cost}`);
      cheer(G.room, 'trader');
      emit(G, { t: 'ui' });
    },
    label(G, th) {
      const e = wareOf(G, th);
      if (!e) return null;
      const cost = shopPrice(G, wareBase(G, e));
      return { title: 'Купить', sub: e.k === 'item' ? itemDef(e.id).name ?? '' : WARE_NAME[e.k], cost, ok: G.coins >= cost };
    },
    step: tend,
  },

  // Жертвенный камень: лиса отдаёт сердце (последнее камень не берёт) и получает что выпадет — редкую вещь,
  // монеты, ману, прибавку к запасу маны до конца партии или ничего. С каждым разом в этой комнате камень скупее.
  // Запись комнаты: uses — сколько сердец здесь уже отдано.
  altar: {
    name: 'Жертвенный камень', desc: 'Сердце в обмен на удачу: с каждым разом камень скупее.', minFloor: 2,
    build(G, room) {
      addLive(G, { kind: 'altar', x: room.center.x, y: room.center.y, r: 14, place: 'altar' });
    },
    label: altarLabel,
    use(G, th) {
      const l = altarLabel(G);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!payHearts(G, 1)) return;
      const P = G.player;
      const d = mapRoomOf(G).data;
      const odds = ALTAR.odds[altarTier(d)];
      d.uses = count(d.uses) + 1;
      th.flash = POSE.flash;
      sfx(G, 'altar', th.x, th.y);
      const x = th.x;
      const y = th.y + 18;
      let got = draw(G, odds);
      // запас маны уже под потолок (или даров набралось слишком много) — вместо прибавки просто мана
      if (got === 'boon' && (P.st.maxMana + ALTAR.boon > LIMITS.maxMana[1] || G.gifts.length >= GIFTS_MAX)) got = 'mana';
      if (got === 'item' && !popItem(G, x, y, { minRarity: ALTAR.minRarity })) got = 'coins';
      if (got === 'item') {
        floatText(G, th.x, th.y - 30, 'Находка');
        sfx(G, 'taskok', th.x, th.y);
      } else if (got === 'coins') {
        dropCoins(G, x, y, ALTAR.coins + ALTAR.coinsPerFloor * G.floor);
        floatText(G, th.x, th.y - 30, 'Монеты');
      } else if (got === 'mana') {
        addMana(G, ALTAR.mana);
        floatText(G, th.x, th.y - 30, `Мана +${ALTAR.mana}`);
        sfx(G, 'mana', P.x, P.y);
      } else if (got === 'boon') {
        takeGift(G, 'altarboon');
        addMana(G, ALTAR.boon);             // новый запас приходит полным
        floatText(G, th.x, th.y - 30, `Запас маны +${ALTAR.boon}`);
        sfx(G, 'taskok', th.x, th.y);
      } else floatText(G, th.x, th.y - 30, 'Камень молчит');
      sync(G, th);
    },
    step: tend,
  },

  // Колодец желаний: бросить пять монет — выпрыгнет сердце, мана или горсть монет, достанется короткое
  // благословение или не случится ничего. Брошенное считается за все партии (вехи щедрости — выше).
  // Запись комнаты: tosses — сколько раз бросали в этот колодец.
  well: {
    name: 'Колодец желаний', desc: 'Брось пять монет — вдруг повезёт; щедрых колодец помнит.',
    build(G, room) {
      addLive(G, { kind: 'well', x: room.center.x, y: room.center.y, r: 15, place: 'well' });
    },
    label: wellLabel,
    use(G, th) {
      const l = wellLabel(G);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!spend(G, WELL.stake)) return;
      const d = mapRoomOf(G).data;
      d.tosses = count(d.tosses) + 1;
      G.cnt.donated = count(G.cnt.donated) + WELL.stake;
      th.flash = POSE.flash;
      sfx(G, 'well', th.x, th.y);
      const thanked = count(G.flags.well);
      if (marksOf(donated(G)) > thanked) {
        G.flags.well = thanked + 1;
        wellGift(G, th, thanked);
      } else wellRoll(G, th);
      sync(G, th);
    },
    step: tend,
  },

  // Привал: у шатра ждут два зверя — любого можно нанять за монеты, если есть место для спутника. Нанятый уходит
  // с лисой, и в привале его больше нет.
  // Запись комнаты: cands — [{ id, hired }].
  camp: {
    name: 'Привал', desc: 'Здесь за монеты нанимают спутников.',
    build(G, room, mapRoom, r) {
      const d = mapRoom.data;
      if (!Array.isArray(d.cands)) {
        const ids = Object.keys(REG.MINIONS).filter((id) => REG.MINIONS[id].hire !== false);
        d.cands = r.shuffle(ids).slice(0, CAMP.cands).map((id) => ({ id, hired: 0 }));
      }
      addThing(G, { kind: 'tent', x: room.center.x, y: room.center.y, r: 18 });
      for (let i = 0; i < d.cands.length && i < 5; i++) {
        const c = d.cands[i];
        if (!record(c) || c.hired || !own(REG.MINIONS, c.id)) continue;
        const s = spotOf(room, i + 1);
        if (!s) continue;
        const th = addLive(G, { kind: 'minion', rig: c.id, x: s.x, y: s.y, r: REG.MINIONS[c.id].r ?? 8, solid: false, place: 'camp', tag: i, reach: 40 });
        if (th) th.face = s.x > room.center.x ? -1 : 1;       // смотрят на шатёр
      }
    },
    label: campLabel,
    use(G, th) {
      const c = candOf(G, th);
      const l = campLabel(G, th);
      if (!c || !l) return;
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!spend(G, l.cost)) return;
      if (!hireMinion(G, c.id)) {
        G.coins += l.cost;                  // места всё-таки не нашлось — монеты назад
        return;
      }
      c.hired = 1;
      floatText(G, th.x, th.y - 22, `−${l.cost}`);
      toast(G, `${l.sub} идёт с тобой`);
      removeThing(G.room, th);
    },
    step: tend,
  },

  // Бобёр-кузнец: точит оружие, которое у лисы в лапах, — на уровень за раз, не выше +3; каждая заточка дороже.
  // Запись комнаты пуста: уровень лежит на самом оружии и уходит вместе с ним.
  forge: {
    name: 'Бобёр-кузнец', desc: 'Точит оружие в лапах: до трёх раз, с каждым разом дороже.', minFloor: 2,
    build(G, room) {
      const c = room.center;
      addThing(G, { kind: 'forge', x: c.x, y: c.y, r: 14 });
      // бобёр — сбоку от горна, где свободнее
      const dx = roomy(room, c.x - 36, c.y + 10, 11) || !roomy(room, c.x + 36, c.y + 10, 11) ? -36 : 36;
      const th = addLive(G, { kind: 'beaver', rig: 'beaver', x: c.x + dx, y: c.y + 10, r: 11, place: 'forge', reach: 52 });
      if (th) {
        th.data.npc = 1;
        th.data.near = 0;
        th.face = dx < 0 ? 1 : -1;
      }
    },
    label: forgeLabel,
    use(G, th) {
      const l = forgeLabel(G);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!spend(G, l.cost)) return;
      const it = G.inv.weapon;
      it.lvl = count(it.lvl) + 1;
      sfx(G, 'forge', th.x, th.y);
      floatText(G, th.x, th.y - 30, `Заточка +${it.lvl}`);
      cheer(G.room, 'beaver', 'work');
      emit(G, { t: 'ui' });
      sync(G, th);
    },
    step: tend,
  },

  // Родник: один раз возвращает все сердца и прибавляет маны. Здоровой лисе с полной маной пить незачем — родник
  // подождёт, пока понадобится.
  // Запись комнаты: used — родник выпит.
  spring: {
    name: 'Родник', desc: 'Один раз вернёт все сердца и прибавит маны.',
    build(G, room, mapRoom) {
      addLive(G, { kind: 'spring', x: room.center.x, y: room.center.y, r: 15, place: 'spring', v: mapRoom.data.used ? 1 : 0 });
    },
    label: springLabel,
    use(G, th) {
      const l = springLabel(G);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      const P = G.player;
      mapRoomOf(G).data.used = 1;
      heal(G, P.st.maxHp);
      addMana(G, SPRING.mana);
      th.v = 1;
      th.flash = POSE.flash;
      sfx(G, 'heal', th.x, th.y);
      floatText(G, P.x, P.y - 24, 'Силы вернулись');
      sync(G, th);
    },
    step: tend,
  },

  // Тотем испытания: по своей воле — три волны, как в охоте, при закрытых дверях. Победила — рядом появляется
  // сундук с вещью не ниже редкой. Партию закрыли посреди боя — испытание можно начать заново.
  // Запись комнаты: won — испытание пройдено, opened — наградной сундук открыт.
  totem: {
    name: 'Тотем испытания', desc: 'Три волны врагов по своей воле — и сундук в награду.', minFloor: 2,
    build(G, room, mapRoom) {
      const d = mapRoom.data;
      addLive(G, { kind: 'totem', x: room.center.x, y: room.center.y, r: 12, place: 'totem', v: d.won ? 1 : 0 });
      if (d.won) totemChest(G, room, Boolean(d.opened));
    },
    label: totemLabel,
    use(G, th) {
      const d = mapRoomOf(G).data;
      if (th.kind === 'chest') {
        if (openChest(G, th, { minRarity: TOTEM.minRarity, coins: TOTEM.coins + TOTEM.coinsPerFloor * G.floor })) d.opened = 1;
        return;
      }
      const l = totemLabel(G, th);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!startChallenge(G, TOTEM.waves, totemWon)) return;
      th.usable = false;
      th.text = '';
      th.flash = POSE.flash;
      banner(G, 'Испытание', 'Три волны — и награда твоя', 'mod');
      sfx(G, 'banner');
    },
    step: tend,
  },

  // Пень-напёрсточник: ставка — восемь монет, а выпрыгнуть может сердце, мана, монеты, зелье, вещь — или ничего.
  // Запись комнаты: plays — сколько раз здесь сыграли.
  gamble: {
    name: 'Пень-напёрсточник', desc: 'Игра на восемь монет: чаще пусто, изредка — куш.', minFloor: 2,
    build(G, room) {
      addLive(G, { kind: 'gamble', x: room.center.x, y: room.center.y, r: 13, place: 'gamble' });
    },
    label: gambleLabel,
    use(G, th) {
      const l = gambleLabel(G);
      if (!l.ok) {
        refuse(G, th, l);
        return;
      }
      if (!spend(G, GAMBLE.stake)) return;
      const d = mapRoomOf(G).data;
      d.plays = count(d.plays) + 1;
      th.flash = POSE.flash;
      sfx(G, 'coin', th.x, th.y);
      const x = th.x;
      const y = th.y + 18;
      let got = draw(G, GAMBLE.odds);
      // вещей или зелий в игре не нашлось — ставка просто возвращается монетами
      if (got === 'jackpot' && !popItem(G, x, y, { minRarity: 1 })) got = 'coins';
      if (got === 'item' && !popItem(G, x, y)) got = 'coins';
      if (got === 'potion' && !popItem(G, x, y, { kinds: ['potion'] })) got = 'coins';
      if (got === 'jackpot') {
        dropCoins(G, x, y, GAMBLE.jackpot);
        toast(G, 'Напёрсточник в убытке — куш твой');
        floatText(G, th.x, th.y - 30, 'Куш');
        sfx(G, 'taskok', th.x, th.y);
      } else if (got === 'item' || got === 'potion') {
        floatText(G, th.x, th.y - 30, got === 'item' ? 'Находка' : 'Зелье');
        sfx(G, 'taskok', th.x, th.y);
      } else if (got === 'coins') {
        dropCoins(G, x, y, randInt(G, GAMBLE.coins[0], GAMBLE.coins[1]));
        floatText(G, th.x, th.y - 30, 'Монеты');
      } else if (got === 'heart') {
        addPick(G, 'heart', x, y, 1);
        floatText(G, th.x, th.y - 30, 'Сердце');
      } else if (got === 'mana') {
        popMana(G, x, y, GAMBLE.orbs);
        floatText(G, th.x, th.y - 30, 'Мана');
      } else {
        floatText(G, th.x, th.y - 30, 'Пусто');
        sfx(G, 'taskfail', th.x, th.y);
      }
      sync(G, th);
    },
    step: tend,
  },

  // Ворон-меняла: иногда прилетает к порталу, когда хозяин места побеждён. Отдаёт одну эпическую вещь за сердце
  // насовсем — но последние два сердца не берёт.
  // Запись комнаты хозяина: raven — { id — вещь, done — уговор состоялся }.
  raven: {
    name: 'Ворон-меняла', desc: 'Отдаёт эпическую вещь за одно сердце насовсем.', spot: 'boss', chance: HUNT.ravenChance,
    build(G, room, mapRoom, r) {
      const d = mapRoom.data;
      const at = perchOf(room);
      if (!at) return;
      if (!record(d.raven)) {
        // вещь выбирается один раз — когда ворон прилетел
        const it = rollItem(G, { minRarity: RAVEN.rarity, maxRarity: RAVEN.rarity, rnd: r });
        if (!it || (itemDef(it.id).rarity ?? 0) !== RAVEN.rarity) return;
        d.raven = { id: it.id, done: 0 };
        toast(G, 'Прилетел ворон-меняла');
      }
      const deal = d.raven;
      if (!kindOf(deal.id)) return;
      const done = Boolean(deal.done);
      addThing(G, { kind: 'raven', rig: 'raven', x: at.x, y: at.y, r: 10, data: { npc: 1, near: 0 } });
      addThing(G, {
        kind: 'pedestal', x: at.x, y: at.y + STALL_DY, r: 10, place: 'raven', usable: !done,
        item: done ? null : { id: deal.id, lvl: 0 },
      });
    },
    label: ravenLabel,
    use(G, th) {
      const deal = dealOf(G);
      const l = ravenLabel(G);
      if (!deal || !l) return;
      if (!l.ok) {
        nope(G, 'Ворон не берёт последние сердца');
        return;
      }
      if (!takeGift(G, 'ravenfee')) return;
      giveItem(G, { id: deal.id, lvl: 0 }, th.x, th.y + 18);
      deal.done = 1;
      th.usable = false;
      th.item = null;
      sfx(G, 'buy', th.x, th.y);
      floatText(G, G.player.x, G.player.y - 24, 'Сердце отдано');
      cheer(G.room, 'raven');
      emit(G, { t: 'ui' });
    },
    step: tend,
  },
};
