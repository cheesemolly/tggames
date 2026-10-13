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
  sling: {
    name: 'Рогатка', rarity: 0, desc: 'Быстрые камешки. Мана почти не уходит.',
    mana: 1, cd: 0.22, dmg: 2, range: 280, pattern: 'bullet',
    shot: { look: 'shot.stone', speed: 520, r: 4 },
    sfx: 'shot',
  },
  thorns: {
    name: 'Колючкомёт', rarity: 0, desc: 'Очередь из трёх колючек подряд.',
    mana: 3, cd: 0.55, dmg: 1.5, range: 260, pattern: 'burst',
    shot: { look: 'shot.thorn', speed: 480, r: 4, n: 3, gap: 0.06 },
    sfx: 'shot',
  },
  acorngun: {
    name: 'Желудёвая дробь', rarity: 0, desc: 'Веер желудей. Хороша вблизи.',
    mana: 3, cd: 0.6, dmg: 2, range: 200, pattern: 'spread',
    shot: { look: 'shot.acorn', speed: 400, r: 5, n: 5, arc: 0.5 },
    sfx: 'spread',
  },
  club: {
    name: 'Дубина-коряга', rarity: 0, desc: 'Тяжёлый удар вплотную. Отбрасывает. Маны не просит.',
    mana: 0, cd: 0.55, dmg: 4, range: 52, pattern: 'cone',
    shot: { look: 'fx.slash', arc: 1.9, kb: 260 },
    sfx: 'swing',
  },
  bow: {
    name: 'Лук охотника', rarity: 1, desc: 'Стрела пробивает двоих.',
    mana: 4, cd: 0.6, dmg: 5, range: 380, pattern: 'pierce',
    shot: { look: 'shot.arrow', speed: 620, r: 4, pierce: 2 },
    sfx: 'bow',
  },
  boomerang: {
    name: 'Бумеранг-рогач', rarity: 1, desc: 'Летит туда и обратно, задевая всех.',
    mana: 3, cd: 0.8, dmg: 6, range: 220, pattern: 'boomerang',
    shot: { look: 'shot.boomerang', speed: 360, r: 8 },
    sfx: 'swing',
  },
  icicle: {
    name: 'Сосулька', rarity: 1, desc: 'Ледяной шарик замедляет того, в кого попал.',
    mana: 3, cd: 0.4, dmg: 5, range: 300, pattern: 'bullet',
    shot: { look: 'shot.orb', v: 2, speed: 380, r: 6, slow: 1.5 },
    sfx: 'ice',
  },
  fireacorn: {
    name: 'Огненный жёлудь', rarity: 1, desc: 'Поджигает цель.',
    mana: 4, cd: 0.5, dmg: 5, range: 290, pattern: 'bullet',
    shot: { look: 'shot.acorn', speed: 400, r: 5, burn: 3 },
    sfx: 'fire',
  },
  bouncenut: {
    name: 'Орех-попрыгун', rarity: 1, desc: 'Отскакивает от стен — достанет за углом.',
    mana: 3, cd: 0.45, dmg: 5, range: 420, pattern: 'bounce',
    shot: { look: 'shot.nut', speed: 440, r: 5, bounce: 3 },
    sfx: 'shot',
  },
  wasps: {
    name: 'Осиный рой', rarity: 1, desc: 'Три осы сами находят врага.',
    mana: 5, cd: 0.8, dmg: 3, range: 320, pattern: 'homing',
    shot: { look: 'shot.wasp', speed: 260, r: 5, n: 3, homing: 4 },
    sfx: 'magic',
  },
  venom: {
    name: 'Ядовитый шип', rarity: 1, desc: 'Яд копится с каждым попаданием.',
    mana: 3, cd: 0.4, dmg: 3, range: 300, pattern: 'bullet',
    shot: { look: 'shot.orb', v: 3, speed: 420, r: 5, poison: 1 },
    sfx: 'magic',
  },
  lightning: {
    name: 'Посох молний', rarity: 2, desc: 'Молния перескакивает с врага на врага.',
    mana: 6, cd: 0.7, dmg: 6, range: 260, pattern: 'chain',
    shot: { look: 'shot.orb', v: 4, speed: 700, r: 6, chain: 3, chainR: 110 },
    sfx: 'zap',
  },
  firefly: {
    name: 'Луч светлячка', rarity: 2, desc: 'Тонкий луч, пока держишь огонь.',
    mana: 7, cd: 0.08, dmg: 18, range: 230, pattern: 'beam',
    shot: { look: 'shot.orb', v: 4, speed: 1500, r: 6 },
    sfx: 'beam',
  },
  leaves: {
    name: 'Тройной лист', rarity: 2, desc: 'Три листа веером. Каждый пролетает сквозь двоих.',
    mana: 5, cd: 0.6, dmg: 4, range: 280, pattern: 'spread',
    shot: { look: 'shot.leaf', speed: 440, r: 6, n: 3, arc: 0.35, pierce: 2 },
    sfx: 'spread',
  },
  frostbreath: {
    name: 'Ледяное дыхание', rarity: 2, desc: 'Холодный вдох перед собой замораживает всех на дуге.',
    mana: 3, cd: 0.5, dmg: 7, range: 90, pattern: 'cone',
    shot: { look: 'fx.ice', arc: 1.6, freeze: 1.2, kb: 60 },
    sfx: 'ice',
  },
  thornring: {
    name: 'Кольцо шипов', rarity: 2, desc: 'Шипы разлетаются во все стороны.',
    mana: 8, cd: 1.0, dmg: 5, range: 170, pattern: 'nova',
    shot: { look: 'shot.thorn', speed: 300, r: 5, n: 12 },
    sfx: 'spread',
  },
  beartrap: {
    name: 'Капкан', rarity: 2, desc: 'Кладёт капкан под лапы. Лежат до трёх.',
    mana: 8, cd: 1.2, dmg: 22, range: 40, pattern: 'trap',
    shot: { look: 'shot.trap', r: 12, radius: 40, max: 3, life: 25 },
    sfx: 'trap',
  },
  spores: {
    name: 'Споровое облако', rarity: 2, desc: 'Бросок навесом — на месте остаётся ядовитое облако.',
    mana: 8, cd: 1.1, dmg: 4, range: 240, pattern: 'cloud',
    shot: { look: 'shot.spore', speed: 300, radius: 40, arc: 40, poison: 1, linger: 4, zoneLook: 'poison', zoneDmg: 2 },
    sfx: 'lob',
  },
  starstaff: {
    name: 'Звёздный посох', rarity: 3, desc: 'Три звезды сами ищут врагов.',
    mana: 6, cd: 0.7, dmg: 6, range: 340, pattern: 'homing',
    shot: { look: 'shot.star', speed: 340, r: 6, n: 3, homing: 6 },
    sfx: 'magic',
  },
  stormroar: {
    name: 'Рёв бури', rarity: 3, desc: 'Широкий удар воздуха: отбрасывает и оглушает.',
    mana: 8, cd: 0.9, dmg: 20, range: 110, pattern: 'cone',
    shot: { look: 'fx.puff', arc: 2.4, kb: 380, stun: 1 },
    sfx: 'heavy',
  },
  meteor: {
    name: 'Звездопад', rarity: 3, desc: 'Пять огненных камней падают вокруг цели.',
    mana: 12, cd: 1.4, dmg: 10, range: 320, pattern: 'rain',
    shot: { look: 'shot.orb', v: 1, speed: 300, radius: 44, arc: 60, burn: 2, n: 5, spread: 60 },
    sfx: 'boom',
  },
  crescent: {
    name: 'Лунный серп', rarity: 3, desc: 'Широкая волна летит сквозь стены и всех на пути.',
    mana: 7, cd: 0.8, dmg: 14, range: 330, pattern: 'wave',
    shot: { look: 'shot.wave', speed: 380, r: 22 },
    sfx: 'magic',
  },
  sunray: {
    name: 'Солнечный луч', rarity: 3, desc: 'Мгновенный луч прошивает всех до стены.',
    mana: 10, cd: 1.0, dmg: 20, range: 420, pattern: 'ray',
    shot: { look: 'shot.orb', v: 4, width: 12, speed: 2600 },
    sfx: 'beam',
  },
};
