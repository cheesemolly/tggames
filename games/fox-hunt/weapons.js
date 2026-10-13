// Оружие «Лисьей охоты». Только описания: как стреляет каждый «рисунок выстрела», написано в patterns.js.
//
// Запись — { id: описание }:
//   pinecone: {
//     name: 'Шишкомёт',
//     rarity: 0,             // 0 обычное, 1 редкое, 2 эпическое, 3 легендарное
//     desc: '…',             // одна-две короткие фразы для карточки вещи
//     mana: 2,               // сколько маны за выстрел (у луча — в секунду); 0 — бесплатно
//     cd: 0.32,              // пауза между выстрелами, секунды
//     dmg: 3,                // урон одного попадания (у луча — в секунду); кузница добавляет по 25 % за уровень
//     range: 300,            // дальность: дальше снаряд не летит, а само оружие не целится
//     pattern: 'bullet',     // рисунок выстрела — см. список ниже
//     shot: {                // чем стреляет
//       look: 'shot.cone',   //   картинка снаряда (общий список: shot.cone, shot.stone, shot.acorn, shot.arrow,
//                            //   shot.thorn, shot.nut, shot.feather, shot.leaf, shot.star, shot.wave, shot.web,
//                            //   shot.pumpkin, shot.bubble, shot.spore, shot.boomerang, shot.wasp, shot.trap,
//       v: 0,                //   shot.orb + вариант v: 0 простой, 1 огонь, 2 лёд, 3 яд, 4 свет, 5 тьма)
//       speed: 420, r: 5,    //   скорость и радиус попадания
//       // по желанию: что навешивает на цель — burn, slow, freeze, stun (секунды), poison (стопки яда 1…5);
//       // kb — отбрасывание; pierce, bounce, homing, chain — см. рисунки; radius — взрыв при попадании
//     },
//     sfx: 'shot',           // звук выстрела — один из готовых:
//                            //   sfx: 'shot' обычный · sfx: 'heavy' тяжёлый · sfx: 'spread' дробь · sfx: 'bow' тетива ·
//                            //   sfx: 'magic' чары · sfx: 'zap' разряд · sfx: 'beam' луч · sfx: 'lob' бросок навесом ·
//                            //   sfx: 'boom' взрыв · sfx: 'ice' лёд · sfx: 'fire' огонь · sfx: 'swing' взмах · sfx: 'trap' капкан
//     drop: false,           // не выпадает и не продаётся (только выдаётся местом) — по желанию
//   }
//
// Рисунки (pattern) и что они читают из shot сверх общего:
//   bullet — один снаряд            spread — веер: n (3), arc — раствор в радианах (0,45)
//   burst — очередь: n (3), gap (0,07 с)        pierce — сквозь pierce целей (2)
//   bounce — отскоки от стен: bounce (3)        boomerang — туда и обратно, задевая всех
//   homing — доворачивает к врагу: homing рад/с (5), n (1)
//   lob — навесом в цель, взрыв radius (40); arc — высота дуги
//   beam — непрерывный луч (dmg и mana — в секунду, cd — шаг «тиков», 0,08)
//   chain — молния: chain перескоков (3) в радиусе chainR (110)
//   cone — удар по дуге вплотную: радиус — range оружия, arc (1,5) — раствор; обычно mana: 0
//   nova — n снарядов (10) во все стороны        trap — капкан под лапы: radius (36), max (3) одновременно
//   cloud — навесом, остаётся облако: linger (4 с), zoneLook ('poison' | 'fire' | 'ice'), zoneDmg (1)
//   rain — n бросков (5) вокруг цели: spread (50)      ray — мгновенный луч шириной width (10) до стены
//   wave — широкая волна сквозь стены и всех: r (22)
//
// Совсем особенное оружие может вместо pattern дать функцию fire(G, w, lvl, x, y, ang, tx, ty): (x, y) — лиса,
// ang — куда стреляет, (tx, ty) — цель. Тогда снаряды создаёт она сама: fireShot(G, 0, x, y, ang, w.shot, dmg) и
// lobShot(G, 0, x, y, tx, ty, w.shot, dmg) из combat.js, урон с уровнем — weaponDmg(w, lvl) из balance.js.
// Вернуть false — выстрела не было (мана не тратится).

export const WEAPONS = {
  pinecone: {
    name: 'Шишкомёт', rarity: 0, desc: 'Бьёт шишками. Простое и надёжное.',
    mana: 2, cd: 0.32, dmg: 3, range: 300, pattern: 'bullet',
    shot: { look: 'shot.cone', speed: 420, r: 5 },
    sfx: 'shot',
  },
  claws: {
    name: 'Когти', rarity: 0, desc: 'Удар перед собой. Маны не просят.',
    mana: 0, cd: 0.42, dmg: 3, range: 46, pattern: 'cone',
    shot: { look: 'fx.slash', arc: 1.7, kb: 140 },
    sfx: 'swing',
  },
  shroombomb: {
    name: 'Гриб-бомба', rarity: 1, desc: 'Летит по дуге и взрывается, задевая всех рядом.',
    mana: 7, cd: 0.9, dmg: 6, range: 230, pattern: 'lob',
    shot: { look: 'shot.spore', speed: 300, radius: 46, arc: 46 },
    sfx: 'lob',
  },
};
