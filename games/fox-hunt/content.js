// Всё содержимое «Лисьей охоты» одним списком: звери, оружие, вещи, комнаты, места, задания, напасти, спутники.
// Сами описания лежат в своих файлах (mobs.js, weapons.js, items.js…), здесь они только собираются в общий
// реестр REG из core.js — оттуда их берёт движок. Без DOM.
//
// Кто подключил этот файл (или logic.js) — у того реестр заполнен. Файлы содержимого сами content.js и logic.js
// не подключают: они берут функции движка прямо из core / world / player / combat / ai / director / inventory.

import { REG, own } from './core.js';
import { MOBS as BEASTS } from './mobs.js';
import { MOBS2 } from './mobs2.js';
import { MOBS3 } from './mobs3.js';
import { BOSSES } from './bosses.js';
import { HAZARDS as HAZARD_LIST } from './hazards.js';
import { WEAPONS as WEAPON_LIST } from './weapons.js';
import { ARMOR as ARMOR_LIST, ACCESSORIES as ACC_LIST, POTIONS as POTION_LIST, GIFTS as GIFT_LIST, EFFECTS as EFFECT_LIST } from './items.js';
import { ROOMS as ROOM_LIST, MODS as MOD_LIST } from './rooms.js';
import { PLACES as PLACE_LIST } from './places.js';
import { TASKS as TASK_LIST } from './quests.js';
import { MINIONS as MINION_LIST } from './minions.js';

// Сложить части в один раздел реестра; один id в двух местах — ошибка сразу, а не странность в игре.
function fill(what, target, ...parts) {
  for (const part of parts) {
    for (const id of Object.keys(part)) {
      if (own(target, id)) throw new Error(`${what}: id «${id}» встречается дважды`);
      target[id] = part[id];
    }
  }
}

fill('звери', REG.MOBS, BEASTS, MOBS2, MOBS3, BOSSES);
fill('оружие', REG.WEAPONS, WEAPON_LIST);
fill('броня', REG.ARMOR, ARMOR_LIST);
fill('украшения', REG.ACCESSORIES, ACC_LIST);
fill('зелья', REG.POTIONS, POTION_LIST);
fill('дары', REG.GIFTS, GIFT_LIST);
fill('действия', REG.EFFECTS, EFFECT_LIST);
fill('места', REG.PLACES, PLACE_LIST);
fill('задания', REG.TASKS, TASK_LIST);
fill('напасти', REG.HAZARDS, HAZARD_LIST);
fill('спутники', REG.MINIONS, MINION_LIST);
fill('условия комнат', REG.MODS, MOD_LIST);

// вещь лежит в рюкзаке под одним id — он не может значить и оружие, и зелье
{
  const seen = new Set();
  for (const part of [REG.WEAPONS, REG.ARMOR, REG.ACCESSORIES, REG.POTIONS]) {
    for (const id of Object.keys(part)) {
      if (seen.has(id)) throw new Error(`вещи: id «${id}» занят вещью другого вида`);
      seen.add(id);
    }
  }
}

for (const tpl of ROOM_LIST) {
  if (own(REG.ROOM_BY_ID, tpl.id)) throw new Error(`комнаты: id «${tpl.id}» встречается дважды`);
  REG.ROOM_BY_ID[tpl.id] = tpl;
  REG.ROOMS.push(tpl);
}

/** Добыча, враги и хозяева мест: { id: описание } (вид — поле kind: 'prey' | 'hostile' | 'boss'). */
export const MOBS = REG.MOBS;
export const WEAPONS = REG.WEAPONS;
export const ARMOR = REG.ARMOR;
export const ACCESSORIES = REG.ACCESSORIES;
export const POTIONS = REG.POTIONS;
export const GIFTS = REG.GIFTS;
export const EFFECTS = REG.EFFECTS;
export const PLACES = REG.PLACES;
export const TASKS = REG.TASKS;
export const HAZARDS = REG.HAZARDS;
export const MINIONS = REG.MINIONS;
export const MODS = REG.MODS;
export const ROOMS = REG.ROOMS;

/** id зверей одного вида: 'prey' | 'hostile' | 'boss'. */
export const mobIds = (kind) => Object.keys(REG.MOBS).filter((id) => REG.MOBS[id].kind === kind);
/** id всех вещей, которые могут лежать в рюкзаке (оружие, броня, украшения, зелья). */
export const itemIds = () => [...Object.keys(REG.WEAPONS), ...Object.keys(REG.ARMOR), ...Object.keys(REG.ACCESSORIES), ...Object.keys(REG.POTIONS)];
