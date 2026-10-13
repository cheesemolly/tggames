// Надписи и окна «Лисьей охоты» — всё, что живёт на странице поверх холста: сердца, щит, жизни, мана с оружием,
// монеты, счёт, плашки (локация, условие комнаты, волны, задание, хозяин места), мини-карта, подпись к действию
// у предмета, подсказки первой локации и окна: пауза, рюкзак, статистика, выбор дара.
//
// Владелец просил: альбомный экран, ничего не мешает играть, единственная кнопка — пауза, а в ней — выход в меню,
// музыка, статистика, режим левши; и рюкзак с ячейками под оружие, броню и украшения. Поэтому во время игры всё
// мелкое, полупрозрачное и касаний не ловит (кроме паузы), а кнопки живут только в окнах.
//
// На чём всё держится:
//   • своей прокрутки нет нигде — экран бывает положен набок стилем, и палец с прокруткой расходятся. Каждое окно
//     свёрстано под рамку BOX и целиком растёт или сжимается под экран (--fh-zoom); длинное листается страницами;
//   • кнопка срабатывает по отпусканию пальца (tap), а не по click: второй палец при зажатом джойстике click не даёт;
//   • значки — рисунки игры (art.icon), но их дорисовывают отдельно от окон, поэтому у каждого значка есть запасной
//     вид: рисунок линиями или первая буква названия. Рисунок появился — окно возьмёт его при следующем открытии;
//   • sync() зовут каждый кадр: он сравнивает числа с тем, что уже показано, и трогает страницу, только когда
//     что-то изменилось. Почти всё читается прямо из состояния партии, из событий — только мимолётное (плашки,
//     встряски, всплывающие сообщения).
//
// Правила игры окна не знают: вещи надевает и снимает движок (actions), окно после этого заново читает партию.

import './art-all.js';
import { el } from '../../shared/dom.js';
import { showLayer, hideLayer, animate, EASE_OUT } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { pointsInfo } from '../../shared/points-info.js';
import { createArt } from './art.js';
import { WEAPONS, ARMOR, ACCESSORIES, POTIONS, GIFTS, MINIONS, EFFECTS, TASKS } from './content.js';
import { itemInfo, runSummary } from './logic.js';
import { BIOME_NAMES } from './tiles.js';

/** Рамка, под которую свёрстано каждое окно (px), и поле вокруг него: экран 568×320 без 98×20 под вырезы и кнопки. */
export const BOX = { w: 454, h: 284, gap: 8 };
/** Экран, под который свёрстаны надписи поверх игры: на большем они крупнее. */
export const HUD_BASE = { w: 568, h: 320 };

const ZOOM = [0.5, 1.5];              // во сколько раз окно может сжаться и вырасти
const HUD_ZOOM = [0.8, 1.5];
const RIG_K = 4;                      // точек холста на единицу мира — для портретов спутников
const RIG_BOX = 34;                   // рамка портрета, единиц мира
const PER_PAGE = 40;                  // значков коллекции на странице: 10 × 4
const EXTRA_ROW = 5;                  // даров и спутников в ряду рюкзака
const NOTICE_MS = 2400;               // сколько висит плашка
const GIFT_GUARD_MS = 450;            // окно дара появляется посреди игры — первые касания не в счёт
const LIVES_SHOWN = 3;
const SIDES = ['n', 'e', 's', 'w'];
const SIDE_STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const KINDS = ['weapon', 'armor', 'acc', 'potion'];
const REGS = { weapon: WEAPONS, armor: ARMOR, acc: ACCESSORIES, potion: POTIONS };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// разряды — неразрывным пробелом: число не должно разорваться на две строки
const digits = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const dec = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const two = (n) => String(n).padStart(2, '0');

/** Секунды → «12:05» (с часами — «1:02:05»). */
export function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** Все надписи окон и подсказок. Имена вещей, даров, заданий и текст плашек приходят из описаний игры. */
export const T = {
  pauseBtn: 'Пауза',
  close: 'Закрыть',
  back: 'Назад',
  pause: {
    title: 'Пауза', resumed: 'Охота продолжается',
    where: (floor, place) => `Локация ${floor} · ${place}`,
    resume: 'Продолжить', bag: 'Рюкзак', stats: 'Статистика', restart: 'Заново', exit: 'В меню',
    ask: 'Начать заново?', yes: 'Да', no: 'Нет',
  },
  set: { music: 'Музыка', sound: 'Звуки', lefty: 'Режим левши', flip: 'Перевернуть экран' },
  bag: {
    title: 'Рюкзак', worn: 'Надето', pack: (n, of) => `В рюкзаке · ${n} из ${of}`, extra: 'Дары и спутники', noExtra: 'пока нет',
    slot: { weapon: 'Оружие', armor: 'Броня', acc: 'Украшение', bag: 'Ячейка рюкзака' },
    about: {
      weapon: 'Сюда надевается оружие. Оно стреляет, пока держишь стик действия, и тратит ману.',
      armor: 'Сюда надевается броня. Она даёт щит: он принимает удары вместо сердец.',
      acc: 'Место под украшение. Носить можно три сразу — каждое что-то прибавляет.',
      bag: 'Свободная ячейка. Сюда ложатся находки и зелья.',
    },
    empty: 'Пусто',
    equip: 'Надеть', unequip: 'Снять', drink: 'Выпить', drop: 'Выбросить',
    which: 'Все три места заняты. Нажми на украшение, которое снять.',
    none: 'Пока пусто. Вещи лежат в сундуках, продаются у торговца и выпадают из врагов.',
    full: 'Рюкзак полон', noNeed: 'Сейчас незачем', cant: 'Не вышло',
    gift: 'Дар леса', pal: 'Спутник', hp: (n, of) => `Здоровье ${n} из ${of}`,
    lvl: (n) => `+${n}`, more: (n) => `+${n}`, times: (n) => `×${n}`,
  },
  kind: { weapon: 'Оружие', armor: 'Броня', acc: 'Украшение', potion: 'Зелье' },
  kinds: { weapon: 'Оружие', armor: 'Броня', acc: 'Украшения', potion: 'Зелья' },
  rarity: ['Обычное', 'Редкое', 'Эпическое', 'Легендарное'],
  stats: {
    title: 'Статистика',
    tabs: { run: 'Эта охота', all: 'За всё время', seen: 'Коллекция' },
    run: { score: 'Очки', floor: 'Локация', time: 'Время', rabbits: 'Добыча', kills: 'Враги', bosses: 'Хозяева мест', tasks: 'Задания', coins: 'Монеты' },
    all: {
      games: 'Охот', best: 'Рекорд', deep: 'Дальняя локация', rabbits: 'Добыча', foes: 'Враги', bosses: 'Хозяева мест',
      rooms: 'Комнаты', tasks: 'Задания', coins: 'Монеты', donated: 'Отдано колодцу',
    },
    kindLine: (kind, n, of) => `${kind} · ${n} из ${of}`,
    total: (n, of) => `Всего найдено ${n} из ${of}`,
    unknown: 'Ещё не найдено', hidden: 'Попадётся на охоте',
    prev: 'Раньше', next: 'Дальше',
  },
  gift: { title: 'Дар леса', sub: 'Выбери один — он останется с лисой до конца охоты', take: 'Взять дар', choose: 'Выбери дар' },
  hud: { wave: (n, of) => `Волна ${n} из ${of}`, free: 'даром' },
  task: { ok: 'Задание выполнено', fail: 'Задание не вышло', of: (n, goal) => `${n} из ${goal}` },
  got: { equip: 'Надето', bag: 'В рюкзаке', swap: 'Надето, прежнее — на земле' },
  hint: {
    move: (m) => (m.mouse ? 'Клавиши WASD или стрелки — идти' : `${m.walk} стик — идти`),
    dash: (m) => (m.mouse ? 'Зажми левую кнопку мыши и отпусти — рывок к курсору' : `Потяни ${m.act} стик и отпусти — рывок. Так ловят добычу`),
    fire: (m) => (m.mouse ? 'Правая кнопка мыши или Shift — выстрел. Он тратит ману' : `Держи ${m.act} стик на месте — выстрел. Он тратит ману`),
    use: (m) => (m.mouse ? 'Клавиша E у находки — взять или открыть' : `Нажми ${m.act} стик у находки — возьмёшь или откроешь`),
    zone: () => 'Красное — опасно. Уйди или перепрыгни рывком',
  },
};

// ---------- запасные рисунки линиями ----------
// Пока художники не дорисовали значок, вместо него — простой знак в рамке 24×24. Цвет — от надписи вокруг
// (currentColor), вторая и третья краски — переменные --g2 и --g3 (game.css).

const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[name] ?? GLYPH.place}</svg>`;
const GLYPH = {
  pause: '<rect x="6.2" y="5" width="4.2" height="14" rx="1.5"/><rect x="13.6" y="5" width="4.2" height="14" rx="1.5"/>',
  close: '<path class="fh-ln" d="M6.5 6.5l11 11m0-11l-11 11"/>',
  prev: '<path class="fh-ln" d="M14.5 5.5 8 12l6.5 6.5"/>',
  next: '<path class="fh-ln" d="M9.5 5.5 16 12l-6.5 6.5"/>',
  heart: '<path d="M12 20.6C11.5 20.6 4 15.9 4 10.2a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 5.7-7.5 10.4-8 10.4Z"/>',
  shield: '<path d="M12 2.6 4.6 5.3v6c0 4.6 3.1 8.5 7.4 10.1 4.3-1.6 7.4-5.5 7.4-10.1v-6L12 2.6Z"/><path class="fh-g2" d="M12 5.2 7 7v4.3c0 3 1.9 5.8 5 7.3V5.2Z"/>',
  mana: '<path d="M12 2.6c3.5 4.6 6.6 8 6.6 11.4a6.6 6.6 0 0 1-13.2 0c0-3.4 3.1-6.8 6.6-11.4Z"/><path class="fh-g2" d="M9 12.2c-1 1.8-.6 4 1.1 5.2-.4-1.8-.6-3.4-1.1-5.2Z"/>',
  coin: '<circle cx="12" cy="12" r="8.8"/><circle class="fh-g2" cx="12" cy="12" r="5.4"/>',
  fox: '<path d="M3 3.2l6.4 4.2h5.2L21 3.2l-1.3 9.3L12 21 4.3 12.5 3 3.2Z"/><path class="fh-g2" d="M12 21l-4.7-5.2 4.7-2.3 4.7 2.3L12 21Z"/>'
    + '<circle class="fh-g3" cx="8.9" cy="11.6" r="1.1"/><circle class="fh-g3" cx="15.1" cy="11.6" r="1.1"/>',
  dash: '<path d="M10.6 3.5h8.6a1 1 0 0 1 .95 1.3l-4.9 14.6a1.6 1.6 0 0 1-1.5 1.1H5a1 1 0 0 1-.95-1.3L9 4.6a1.6 1.6 0 0 1 1.5-1.1Z"/>',
  // пустые ячейки: рогатка, щит, кольцо с камнем
  weapon: '<path class="fh-ln" d="M7 4v4.6a5 5 0 0 0 10 0V4M12 13.6v6.9"/>',
  armor: '<path class="fh-ln" d="M12 3.6 5.6 6v5.4c0 4 2.6 7.3 6.4 8.8 3.8-1.5 6.4-4.8 6.4-8.8V6L12 3.6Z"/>',
  acc: '<circle class="fh-ln" cx="12" cy="14.2" r="5.8"/><path d="M12 2.6l2.9 3.4L12 9.4 9.1 6 12 2.6Z"/>',
  // комнаты на мини-карте: корона хозяина, камень сундука, монета торговца, звезда прочих мест
  boss: '<path d="M4.6 18.5 3.2 7.4l5 3.9L12 5l3.8 6.3 5-3.9-1.4 11.1H4.6Z"/>',
  treasure: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z"/>',
  shop: '<circle cx="12" cy="12" r="8.5"/>',
  place: '<path d="M12 2.8l2.7 6.5 6.5 2.7-6.5 2.7-2.7 6.5-2.7-6.5L2.8 12l6.5-2.7L12 2.8Z"/>',
};

// Значки надписей: какие рисунки игры годятся (берётся первый готовый) и чем заменить, пока их нет.
const ICON = {
  heart: [['ui.heart', 'pick.heart'], 'heart'],
  shield: [['ui.shield'], 'shield'],
  mana: [['ui.mana', 'pick.mana'], 'mana'],
  coin: [['ui.coin', 'pick.coin'], 'coin'],
  life: [['ui.life', 'ui.fox'], 'fox'],
  dash: [['ui.dash'], 'dash'],
  weapon: [['ui.slot.weapon', 'ui.weapon'], 'weapon'],
  armor: [['ui.slot.armor', 'ui.armor'], 'armor'],
  acc: [['ui.slot.acc', 'ui.acc'], 'acc'],
};

// ---------- чистые помощники (их проверяют тесты) ----------

/**
 * Кнопка окна: срабатывает, когда палец (любой: второй при зажатом джойстике click не даёт) нажал её и на ней же
 * отпустил; с клавиатуры — Enter и пробел. Пока нажата — класс fh-down.
 */
export function tap(node, fn) {
  let id = null;
  const release = () => {
    id = null;
    node.classList.remove('fh-down');
  };
  node.addEventListener('pointerdown', (e) => {
    if (node.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    id = e.pointerId;
    node.classList.add('fh-down');
  });
  node.addEventListener('pointerup', (e) => {
    if (id === null || e.pointerId !== id) return;
    release();
    // касание «привязано» к кнопке, и отпускание придёт сюда, даже если палец с неё уехал — тогда это не нажатие
    const at = node.ownerDocument?.elementFromPoint?.(e.clientX, e.clientY);
    if (at && !node.contains(at)) return;
    fn(e);
  });
  node.addEventListener('pointercancel', release);
  node.addEventListener('pointerleave', release);
  // без этого браузер после отпускания дошлёт click тому, что оказалось под пальцем (кнопке только что открытого окна)
  node.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat && !node.disabled) fn(e);
  });
  return node;
}

/** Подпись к действию у предмета: «Взять: Лук охотника», «Купить: Сердце» и цена отдельно (0 — даром). */
export function promptText(F) {
  if (!F) return { text: '', cost: 0, ok: true, sign: false };
  if (F.type === 'hint') return { text: String(F.title ?? ''), cost: 0, ok: true, sign: true };
  const title = String(F.title ?? '');
  const sub = String(F.sub ?? '');
  return { text: sub && title ? `${title}: ${sub}` : title || sub, cost: F.cost > 0 ? Math.round(F.cost) : 0, ok: F.ok !== false, sign: false };
}

/**
 * Мини-карта: что показывать. Комнаты, где лиса была, — целиком; их соседи за дверями — бледно (туда можно пойти).
 * Возвращает { cols, rows, cells: [{ id, x, y, type, state }], links: [{ x, y, h }] }: x, y — в клетках от левого
 * верхнего угла; state: 'cur' — лиса здесь, 'done' — зачищена, 'seen' — была, 'near' — ещё не была; связь —
 * дверь между клетками (h — горизонтальная), её x, y — левая или верхняя из двух клеток.
 */
export function mapLayout(map) {
  const rooms = map?.rooms ?? [];
  const state = new Map();
  for (const r of rooms) {
    if (!r.seen) continue;
    state.set(r.id, r.id === map.cur ? 'cur' : r.state === 'cleared' ? 'done' : 'seen');
    for (const s of SIDES) {
      const to = r.doors[s];
      if (to >= 0 && rooms[to] && !rooms[to].seen) state.set(to, 'near');
    }
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of state.keys()) {
    const r = rooms[id];
    x0 = Math.min(x0, r.gx);
    y0 = Math.min(y0, r.gy);
    x1 = Math.max(x1, r.gx);
    y1 = Math.max(y1, r.gy);
  }
  if (!state.size) return { cols: 0, rows: 0, cells: [], links: [] };
  const cells = [];
  const links = [];
  for (const [id, st] of state) {
    const r = rooms[id];
    cells.push({ id, x: r.gx - x0, y: r.gy - y0, type: r.type, state: st });
    // дверь известна, если хоть в одной из двух комнат лиса была; каждая — один раз (от левой и от верхней)
    for (const s of ['e', 's']) {
      const to = r.doors[s];
      if (!(to >= 0) || !state.has(to) || (st === 'near' && state.get(to) === 'near')) continue;
      links.push({ x: r.gx - x0, y: r.gy - y0, h: s === 'e' });
    }
  }
  cells.sort((a, b) => a.id - b.id);
  return { cols: x1 - x0 + 1, rows: y1 - y0 + 1, cells, links };
}

/**
 * Страницы коллекции: вещи по видам, внутри — от обычных к легендарным. found — id встреченных вещей.
 * Каждая страница — { kind, ids, got, of, part, parts }: got из of найдено во всём виде; вид длиннее страницы
 * делится на части.
 */
export function collectionPages(found, per = PER_PAGE) {
  const has = found instanceof Set ? found : new Set(found ?? []);
  const pages = [];
  for (const kind of KINDS) {
    const reg = REGS[kind];
    const ids = Object.keys(reg).sort((a, b) => (reg[a].rarity ?? 0) - (reg[b].rarity ?? 0));
    if (!ids.length) continue;
    const got = ids.filter((id) => has.has(id)).length;
    const parts = Math.ceil(ids.length / per);
    for (let p = 0; p < parts; p++) pages.push({ kind, ids: ids.slice(p * per, (p + 1) * per), got, of: ids.length, part: p + 1, parts });
  }
  return pages;
}

/** Во сколько раз увеличить окно, чтобы рамка BOX с полями влезла в экран w×h без отступов ins. */
export function zoomFor(w, h, ins = NO_INSETS) {
  const k = Math.min((w - ins.left - ins.right - BOX.gap * 2) / BOX.w, (h - ins.top - ins.bottom - BOX.gap * 2) / BOX.h);
  return clamp(Number.isFinite(k) ? k : 1, ZOOM[0], ZOOM[1]);
}

/** Во сколько раз увеличить надписи поверх игры на экране w×h. */
export function hudZoomFor(w, h) {
  const k = Math.min(w / HUD_BASE.w, h / HUD_BASE.h);
  return clamp(Number.isFinite(k) ? k : 1, HUD_ZOOM[0], HUD_ZOOM[1]);
}

const kindOfItem = (id) => KINDS.find((k) => Object.prototype.hasOwnProperty.call(REGS[k], id)) ?? null;
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const initial = (name) => (name ? String(name).trim().charAt(0).toUpperCase() : '?') || '?';

// ---------- сборка ----------

/**
 * Надписи и окна в root (div.fh): слой .fh-hud с кнопкой паузы, слой окон .fh-modal и всплывающее сообщение.
 *   api — от оболочки (нужен подсказке «Очки в рейтинге»);
 *   actions — что окна просят у игры: resume(), restart(), exit(), equip(i, accIndex), unequip(slot, index),
 *     drop(slot, index), usePotion(i), chooseGift(i), set(key, value) — 'lefty' | 'flip' | 'music' | 'sound' |
 *     'hint:<id>', sfx(name); по желанию pause() — окно открылось само (кнопка паузы, выбор дара);
 *   get — что окна читают: game(), stats(), settings(), sound(), seen(), toScreen(wx, wy, out), screen();
 *     по желанию points() — готовый блок «Очки в рейтинге».
 */
export function createUi({ root, api, actions, get }) {
  const doc = root.ownerDocument ?? document;
  const view = doc.defaultView ?? globalThis;
  // окна увеличиваются до полутора раз — холсты значков берутся с запасом
  const density = clamp(Math.ceil((view.devicePixelRatio || 1) * 1.5), 2, 4);
  const art = createArt(RIG_K);
  const toast = createToast();
  const timers = new Set();
  let alive = true;

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const say = (name) => {
    try {
      actions.sfx?.(name);
    } catch (err) {
      console.warn('лисья охота: звук окна', name, err);
    }
  };
  const screenOf = () => get.screen?.() ?? api?.screen ?? null;

  // ---------- значки ----------

  const masters = new Map();     // «ключ:размер» → холст-образец; пустые не запоминаются — рисунок могут дорисовать
  const rigs = new Map();        // спутник → портрет
  let ghostInk = '';

  function master(key, px) {
    if (!art.has(key)) return null;
    const id = `${key}:${px}`;
    let c = masters.get(id);
    if (!c) {
      c = art.icon(key, px, density);
      masters.set(id, c);
    }
    return c;
  }

  // Портрет живой фигуры (спутника): она собрана из частей, готовой картинки у неё нет — ставим в спокойную позу.
  function rigMaster(id) {
    if (!art.hasRig(id)) return null;
    let c = rigs.get(id);
    if (c !== undefined) return c;
    c = null;
    try {
      const side = RIG_BOX * RIG_K;
      const canvas = doc.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const g = canvas.getContext('2d');
      const pose = { t: 0.4, act: 'idle', k: 0, speed: 0, vx: 0, vy: 0, z: 0, flash: 0, hp: 1, elite: false, aim: 0, data: {} };
      if (art.rig(g, id, side * 0.46, side * 0.8, 1, pose)) c = canvas;
    } catch (err) {
      console.warn('лисья охота: портрет спутника', id, err);
    }
    rigs.set(id, c);
    return c;
  }

  function stamp(src, ghost) {
    const c = doc.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    if (ghost) {
      // только силуэт: краска — из палитры игры (--fh-ghost), холсту нужен готовый цвет
      if (!ghostInk) ghostInk = view.getComputedStyle?.(root).getPropertyValue('--fh-ghost').trim() || 'gray';
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = ghostInk;
      g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  /**
   * Значок: keys — ключи рисунков игры (берётся первый готовый), px — самый большой размер, каким его покажут.
   * o: glyph — запасной рисунок линиями, letter — запасная буква, rig — живая фигура, ghost — только силуэт,
   * cls — свой класс. Размер на странице задают стили.
   */
  function icon(keys, px, o = {}) {
    const box = el('span', { class: `fh-ic${o.cls ? ` ${o.cls}` : ''}`, 'aria-hidden': 'true' });
    let src = null;
    for (const key of typeof keys === 'string' ? [keys] : keys ?? []) {
      src = master(key, px);
      if (src) break;
    }
    if (!src && o.rig) src = rigMaster(o.rig);
    if (src) {
      box.append(stamp(src, o.ghost));
      if (o.ghost) box.classList.add('fh-ic--ghost');
    } else if (o.glyph) {
      box.classList.add('fh-ic--glyph');
      box.innerHTML = svg(o.glyph);
    } else {
      box.classList.add('fh-ic--letter');
      box.textContent = o.letter ?? '?';
    }
    return box;
  }
  const sign = (name, px, cls) => icon(ICON[name][0], px, { glyph: ICON[name][1], cls: `fh-ic--${name}${cls ? ` ${cls}` : ''}` });
  const itemIcon = (id, px, name, ghost) => icon(`item.${id}`, px, ghost ? { ghost: true, letter: '?' } : { letter: initial(name) });

  // ---------- надписи поверх игры ----------

  const chip = (cls, ...kids) => el('div', { class: `fh-chip ${cls}` }, ...kids);

  // слева: сердца и щит · мана и оружие · жизни, монеты, заряды рывка · действия зелий
  const heartsBox = el('span', { class: 'fh-pips' });
  const shieldBox = el('span', { class: 'fh-pips fh-pips--shield' });
  const healthChip = chip('fh-health', heartsBox, shieldBox);
  const manaFill = el('i', { class: 'fh-bar-fill' });
  const manaNum = el('span', { class: 'fh-num' }, '0');
  const manaChip = chip('fh-mana', sign('mana', 16), el('span', { class: 'fh-bar' }, manaFill), manaNum);
  const weaponIc = el('span', { class: 'fh-weapon-ic' });
  const weaponCost = el('span', { class: 'fh-num fh-weapon-cost' });
  const weaponChip = chip('fh-weapon', weaponIc, weaponCost);
  const livesBox = el('span', { class: 'fh-pips' });
  const coinNum = el('span', { class: 'fh-num' }, '0');
  const coinChip = chip('fh-coins', sign('coin', 16), coinNum);
  const dashBox = el('span', { class: 'fh-pips fh-pips--dash' });
  const fxBox = el('div', { class: 'fh-row fh-fx' });
  const left = el('div', { class: 'fh-side fh-side--l' },
    healthChip,
    el('div', { class: 'fh-row' }, manaChip, weaponChip),
    el('div', { class: 'fh-row' }, chip('fh-lives', livesBox), coinChip, chip('fh-dash', dashBox)),
    fxBox,
  );

  // посередине: счёт, под ним — волны, хозяин места, задание, плашка
  const scoreNum = el('span', { class: 'fh-score-num' }, '0');
  const scoreChip = chip('fh-score', scoreNum);
  const wavesBox = el('div', { class: 'fh-pane fh-waves' });
  const bossName = el('span', { class: 'fh-boss-name' });
  const bossFill = el('i', { class: 'fh-bar-fill' });
  const bossPane = el('div', { class: 'fh-pane fh-boss' }, bossName, el('span', { class: 'fh-bar' }, bossFill));
  const taskName = el('b', { class: 'fh-task-name' });
  const taskCount = el('span', { class: 'fh-task-count' });
  const taskText = el('span', { class: 'fh-task-text' });
  const taskFill = el('i', { class: 'fh-bar-fill' });
  const taskBar = el('span', { class: 'fh-bar fh-task-bar' }, taskFill);
  const taskPane = el('div', { class: 'fh-pane fh-task' }, el('div', { class: 'fh-task-head' }, taskName, taskCount), taskText, taskBar);
  const noteIc = el('span', { class: 'fh-note-ic' });
  const noteTitle = el('b', { class: 'fh-note-title' });
  const noteSub = el('span', { class: 'fh-note-sub' });
  const notePane = el('div', { class: 'fh-pane fh-note', role: 'status' }, noteIc, el('span', { class: 'fh-note-text' }, noteTitle, noteSub));
  const mid = el('div', { class: 'fh-mid' }, scoreChip, wavesBox, bossPane, taskPane, notePane);

  // справа: пауза — единственная кнопка на экране — и мини-карта
  const pauseBtn = el('button', { class: 'fh-pause-btn', 'aria-label': T.pauseBtn, title: T.pauseBtn });
  pauseBtn.innerHTML = `<span class="fh-pause-face">${svg('pause')}</span>`;
  tap(pauseBtn, () => {
    say('tap');
    openPause(false);
  });
  const mapLinks = el('div', { class: 'fh-map-links' });
  const mapRooms = el('div', { class: 'fh-map-rooms' });
  const mapIn = el('div', { class: 'fh-map-in' }, mapLinks, mapRooms);
  const mapChip = el('div', { class: 'fh-map', 'aria-hidden': 'true' }, mapIn);
  const right = el('div', { class: 'fh-side fh-side--r' }, pauseBtn, mapChip);

  // подпись над предметом, с которым лиса может что-то сделать: место ей задаёт place() через transform
  const promptLabel = el('span', { class: 'fh-prompt-text' });
  const promptCost = el('span', { class: 'fh-prompt-cost' });
  const promptIn = el('div', { class: 'fh-prompt-in' }, promptLabel, promptCost);
  const promptEl = el('div', { class: 'fh-prompt' }, promptIn);
  // подсказка первой локации — внизу, между джойстиками
  const hintEl = el('div', { class: 'fh-hint', role: 'status' });

  const hud = el('div', { class: 'fh-hud' }, el('div', { class: 'fh-top' }, left, mid, right), promptEl, hintEl);
  const modal = el('div', { class: 'fh-modal', hidden: true });
  root.append(hud, modal, toast.el);

  // что уже показано: sync сравнивает с этим и трогает страницу, только когда число изменилось
  const S = {
    G: null, hp: -1, maxHp: -1, sh: -1, maxSh: -1, lives: -1, livesN: -1, mana: -1, manaP: -1,
    wid: null, wlvl: -1, wcost: NaN, coins: -1, score: -1, ch: -1, maxCh: -1,
    wave: -1, task: null, taskN: -1, taskGoal: -1, taskT: -1, boss: null, bossP: -1,
    fRef: null, fTitle: '', fSub: '', fCost: -1, fOk: true,
    map: null, cur: -1, seen: -1, done: -1, fxAt: -1, fxSig: '',
  };
  const hearts = [];
  const shields = [];
  const lives = [];
  const dashes = [];

  const turn = (node, on) => node.classList.toggle('fh-on', Boolean(on));

  /** Короткий «вздох» числа или значка: стало больше — заметно, но не мешает. */
  function bump(node, big) {
    animate(node, [{ transform: `scale(${big ? 1.45 : 1.22})` }, { transform: 'scale(1)' }], { duration: big ? 260 : 170, easing: 'ease-out' });
  }

  function jolt(node) {
    animate(node, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-0.25em)' }, { transform: 'translateX(0.25em)' },
      { transform: 'translateX(-0.12em)' }, { transform: 'translateX(0)' },
    ], { duration: 240, easing: 'ease-in-out' });
  }

  // ряд значков (сердца, щит, жизни, заряды): сколько нужно, столько и стоит
  function fit(list, box, n, make) {
    while (list.length < n) {
      const node = make();
      list.push(node);
      box.append(node);
    }
    while (list.length > n) list.pop().remove();
  }
  function light(list, n, was) {
    for (let i = 0; i < list.length; i++) {
      const off = i >= n;
      if (list[i].classList.contains('fh-off') === off) continue;
      list[i].classList.toggle('fh-off', off);
      if (!off && was >= 0) bump(list[i], true);
    }
  }

  function syncVitals(G) {
    const P = G.player;
    const st = P.st;
    const hp = P.down > 0 ? 0 : clamp(Math.ceil(P.hp), 0, st.maxHp);
    if (st.maxHp !== S.maxHp) {
      fit(hearts, heartsBox, st.maxHp, () => sign('heart', 20, 'fh-pip'));
      S.maxHp = st.maxHp;
      S.hp = -1;
    }
    if (hp !== S.hp) {
      light(hearts, hp, S.hp);
      S.hp = hp;
    }
    if (st.maxShield !== S.maxSh) {
      fit(shields, shieldBox, st.maxShield, () => sign('shield', 20, 'fh-pip'));
      S.maxSh = st.maxShield;
      S.sh = -1;
    }
    const sh = clamp(Math.ceil(P.shield), 0, st.maxShield);
    if (sh !== S.sh) {
      light(shields, sh, S.sh);
      S.sh = sh;
    }
    const livesN = Math.max(LIVES_SHOWN, G.lives);
    if (livesN !== S.livesN) {
      fit(lives, livesBox, livesN, () => sign('life', 20, 'fh-pip'));
      S.livesN = livesN;
      S.lives = -1;
    }
    if (G.lives !== S.lives) {
      light(lives, G.lives, S.lives);
      S.lives = G.lives;
    }
    if (st.dashCharges !== S.maxCh) {
      fit(dashes, dashBox, st.dashCharges, () => sign('dash', 16, 'fh-pip'));
      S.maxCh = st.dashCharges;
      S.ch = -1;
    }
    if (P.charges !== S.ch) {
      light(dashes, P.charges, -1);
      S.ch = P.charges;
    }

    const mana = Math.floor(P.mana + 1e-6);
    if (mana !== S.mana) {
      manaNum.textContent = String(mana);
      S.mana = mana;
    }
    const manaP = st.maxMana > 0 ? Math.round(clamp(P.mana / st.maxMana, 0, 1) * 50) : 0;
    if (manaP !== S.manaP) {
      manaFill.style.transform = `scaleX(${manaP / 50})`;
      S.manaP = manaP;
    }

    const w = G.inv.weapon;
    const wid = w ? w.id : '';
    const wlvl = w ? w.lvl | 0 : 0;
    if (wid !== S.wid || wlvl !== S.wlvl) {
      const name = w ? itemInfo(w)?.name : '';
      weaponIc.replaceChildren(w ? itemIcon(w.id, 22, name) : sign('weapon', 22, 'fh-ic--idle'));
      if (S.wid !== null && w) bump(weaponIc, true);
      S.wid = wid;
      S.wlvl = wlvl;
      S.wcost = NaN;
    }
    const cost = w ? Math.round((WEAPONS[wid]?.mana ?? 0) * st.wCost * 10) / 10 : -1;
    if (cost !== S.wcost) {
      weaponCost.textContent = cost < 0 ? '' : dec(cost);
      weaponChip.classList.toggle('fh-weapon--none', cost < 0);
      S.wcost = cost;
    }

    if (G.coins !== S.coins) {
      coinNum.textContent = digits(G.coins);
      if (S.coins >= 0 && G.coins > S.coins) bump(coinChip);
      S.coins = G.coins;
    }
    if (G.score !== S.score) {
      scoreNum.textContent = digits(G.score);
      if (S.score >= 0 && G.score > S.score) bump(scoreNum, G.score - S.score >= 5);
      S.score = G.score;
    }
  }

  // действия зелий и даров: «Ускорение 24» — сверяется пять раз в секунду, числа меняются раз в секунду
  function syncFx(G) {
    if (Math.abs(G.time - S.fxAt) < 0.2) return;
    S.fxAt = G.time;
    const fx = G.player.fx;
    let sig = '';
    for (const k in fx) if (fx[k] > 0 && own(EFFECTS, k) && EFFECTS[k].name) sig += `${k}:${Math.ceil(fx[k])};`;
    if (sig === S.fxSig) return;
    S.fxSig = sig;
    const kids = [];
    for (const k in fx) {
      if (!(fx[k] > 0) || !own(EFFECTS, k) || !EFFECTS[k].name) continue;
      kids.push(chip(`fh-fx-chip${k === 'slow' || k === 'root' ? ' fh-fx-chip--bad' : ''}`, EFFECTS[k].name, el('span', { class: 'fh-num' }, String(Math.ceil(fx[k])))));
    }
    fxBox.replaceChildren(...kids);
  }

  // ---------- волны, задание, хозяин ----------

  function syncRoom(G) {
    const room = G.room;
    const dir = room.dir;
    // волны охоты: точка на волну — пройденные, идущая, будущие
    let wave = 0;
    if (dir && dir.waves > 0 && dir.kind !== 'boss' && (dir.mode === 'wave' || dir.mode === 'calm' || dir.mode === 'ready')) {
      const done = dir.mode === 'calm' ? dir.wave + 1 : dir.mode === 'wave' ? dir.wave : 0;
      wave = 1000 + dir.waves * 100 + done * 10 + (dir.mode === 'wave' ? 1 : 0);
    }
    if (wave !== S.wave) {
      if (wave) {
        const done = Math.floor((wave % 100) / 10);
        const going = wave % 10 === 1;
        const kids = [];
        for (let i = 0; i < dir.waves; i++) kids.push(el('i', { class: `fh-wave${i < done ? ' fh-wave--done' : i === done && going ? ' fh-wave--now' : ''}` }));
        wavesBox.replaceChildren(...kids);
        wavesBox.setAttribute('aria-label', T.hud.wave(Math.min(dir.waves, done + 1), dir.waves));
      }
      turn(wavesBox, wave);
      S.wave = wave;
    }

    const task = room.task ?? null;
    if (task !== S.task) {
      if (task) {
        taskName.textContent = task.name ?? '';
        taskText.textContent = task.text ?? '';
        taskBar.hidden = !(task.time > 0);
      }
      turn(taskPane, task);
      S.task = task;
      S.taskN = -1;
      S.taskGoal = -1;
      S.taskT = -1;
    }
    if (task) {
      if (task.n !== S.taskN || task.goal !== S.taskGoal) {
        taskCount.textContent = task.goal > 0 ? T.task.of(Math.min(task.n, task.goal), task.goal) : '';
        if (S.taskN >= 0 && task.n > S.taskN) bump(taskCount);
        S.taskN = task.n;
        S.taskGoal = task.goal;
      }
      if (task.time > 0) {
        const rest = Math.round(clamp(1 - task.t / task.time, 0, 1) * 100);
        if (rest !== S.taskT) {
          taskFill.style.transform = `scaleX(${rest / 100})`;
          taskPane.classList.toggle('fh-task--late', rest < 25);
          S.taskT = rest;
        }
      }
    }

    const boss = room.boss && !room.boss.dead ? room.boss : null;
    if (boss !== S.boss) {
      if (boss) bossName.textContent = boss.def?.name ?? '';
      turn(bossPane, boss);
      S.boss = boss;
      S.bossP = -1;
    }
    if (boss) {
      const p = boss.maxHp > 0 ? Math.round(clamp(boss.hp / boss.maxHp, 0, 1) * 200) : 0;
      if (p !== S.bossP) {
        bossFill.style.transform = `scaleX(${p / 200})`;
        S.bossP = p;
      }
    }
  }

  // ---------- плашки ----------

  const notes = [];              // ждут своей очереди
  let noteBusy = false;

  /** Плашка под счётом: { kind, title, sub, icon }. Показываются по одной; лишние в очереди вытесняют старые. */
  function notice(n) {
    if (!n.title && !n.sub) return;
    if (notes.length >= 3) notes.shift();
    notes.push(n);
    if (!noteBusy) nextNote();
  }

  function nextNote() {
    const n = notes.shift();
    if (!n) {
      noteBusy = false;
      return;
    }
    noteBusy = true;
    notePane.className = `fh-pane fh-note fh-note--${n.kind || 'note'}${n.rarity >= 0 ? ` fh-r${n.rarity}` : ''}`;
    noteIc.replaceChildren(...(n.icon ? [n.icon()] : []));
    noteIc.hidden = !n.icon;
    noteTitle.textContent = n.title ?? '';
    noteSub.textContent = n.sub ?? '';
    noteSub.hidden = !n.sub;
    turn(notePane, true);
    later(() => {
      turn(notePane, false);
      later(nextNote, 260);
    }, n.ms ?? NOTICE_MS);
  }

  // ---------- мини-карта ----------

  const MAP = { cw: 1.05, ch: 0.82, gap: 0.3, maxW: 8.6, maxH: 6.2 };       // em: клетка, промежуток, самое большее
  const mapCells = new Map();    // id комнаты → клетка на странице

  function renderMap(map) {
    if (map !== S.map) {
      // новая локация: те же номера комнат значат другие комнаты
      mapCells.clear();
      mapRooms.replaceChildren();
    }
    const L = mapLayout(map);
    turn(mapChip, L.cells.length > 1);
    if (!L.cells.length) return;
    const k = Math.min(1, MAP.maxW / (L.cols * (MAP.cw + MAP.gap) - MAP.gap), MAP.maxH / (L.rows * (MAP.ch + MAP.gap) - MAP.gap));
    const cw = MAP.cw * k;
    const ch = MAP.ch * k;
    const gap = MAP.gap * k;
    const em = (v) => `${Math.round(v * 100) / 100}em`;
    mapIn.style.width = em(L.cols * (cw + gap) - gap);
    mapIn.style.height = em(L.rows * (ch + gap) - gap);
    mapIn.style.setProperty('--cw', em(cw));
    mapIn.style.setProperty('--ch', em(ch));
    mapIn.style.setProperty('--gap', em(gap));
    mapLinks.replaceChildren(...L.links.map((l) => {
      const node = el('i', { class: `fh-link fh-link--${l.h ? 'h' : 'v'}` });
      node.style.translate = l.h ? `${em(l.x * (cw + gap) + cw)} ${em(l.y * (ch + gap) + ch / 2)}` : `${em(l.x * (cw + gap) + cw / 2)} ${em(l.y * (ch + gap) + ch)}`;
      return node;
    }));
    const keep = new Set();
    for (const c of L.cells) {
      keep.add(c.id);
      let node = mapCells.get(c.id);
      if (!node) {
        node = el('span', { class: 'fh-room' });
        mapCells.set(c.id, node);
        mapRooms.append(node);
      }
      const special = c.type !== 'hunt' && c.type !== 'start';
      const cls = `fh-room fh-room--${c.state}${c.type === 'boss' ? ' fh-room--boss' : special ? ' fh-room--place' : ''}`;
      if (node.className !== cls) node.className = cls;
      node.style.translate = `${em(c.x * (cw + gap))} ${em(c.y * (ch + gap))}`;
      if (special && !node.firstChild) node.append(icon(`ui.room.${c.type}`, 16, { glyph: own(GLYPH, c.type) ? c.type : 'place' }));
    }
    for (const [id, node] of mapCells) {
      if (keep.has(id)) continue;
      node.remove();
      mapCells.delete(id);
    }
  }

  function syncMap(G) {
    const map = G.map;
    if (!map) return;
    let seen = 0;
    let done = 0;
    for (let i = 0; i < map.rooms.length; i++) {
      if (map.rooms[i].seen) seen += 1;
      if (map.rooms[i].state === 'cleared') done += 1;
    }
    if (map === S.map && map.cur === S.cur && seen === S.seen && done === S.done) return;
    renderMap(map);
    S.map = map;
    S.cur = map.cur;
    S.seen = seen;
    S.done = done;
  }

  // ---------- подпись к действию ----------

  const spot = { x: 0, y: 0 };
  const safe = { l: 0, t: 0, r: 0, b: 0 };     // куда подписи можно, px корня
  const LIFT = { pick: 26, chest: 34, pedestal: 46, portal: 46, sign: 30, stump: 30, target: 34 };   // на сколько выше предмета, ед. мира
  let promptOn = false;
  let promptHalf = 0;            // полширины и высота подписи: чтобы не вылезала за края
  let promptTall = 0;
  let promptX = NaN;
  let promptY = NaN;

  function measurePrompt() {
    promptHalf = promptIn.offsetWidth / 2;
    promptTall = promptIn.offsetHeight;
    promptX = NaN;
  }

  function syncPrompt(G) {
    const F = G.over ? null : G.room.focus ?? null;
    const ref = F ? F.ref : null;
    if (ref === S.fRef && (!F || (F.title === S.fTitle && F.sub === S.fSub && F.cost === S.fCost && F.ok === S.fOk))) return;
    S.fRef = ref;
    if (F) {
      S.fTitle = F.title;
      S.fSub = F.sub;
      S.fCost = F.cost;
      S.fOk = F.ok;
      const p = promptText(F);
      promptLabel.textContent = p.text;
      promptCost.replaceChildren(...(p.cost > 0 ? [sign('coin', 16), String(p.cost)] : []));
      promptCost.hidden = !(p.cost > 0);
      promptEl.classList.toggle('fh-prompt--no', !p.ok);
      promptEl.classList.toggle('fh-prompt--sign', p.sign);
      measurePrompt();
    }
    promptOn = Boolean(F && (F.title || F.sub));
    turn(promptEl, promptOn);
  }

  /** Раз в кадр после рисования: подпись едет за своим предметом (мир → экран), не вылезая за края. */
  function place(G) {
    if (!promptOn || !G || !G.room) return;
    const F = G.room.focus;
    const ref = F ? F.ref : null;
    if (!ref) return;
    const lift = F.type === 'pick' ? LIFT.pick : ref.rig ? 50 : LIFT[ref.kind] ?? (ref.r ?? 12) + 24;
    const p = get.toScreen?.(ref.x, ref.y - lift, spot) ?? spot;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const x = Math.round(clamp(p.x, safe.l + promptHalf, Math.max(safe.l + promptHalf, safe.r - promptHalf)));
    const y = Math.round(clamp(p.y, safe.t + promptTall, Math.max(safe.t + promptTall, safe.b)));
    if (x === promptX && y === promptY) return;
    promptX = x;
    promptY = y;
    promptEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  // ---------- подсказки первой локации ----------
  // Короткая строка внизу, между джойстиками: как идти, как прыгать, как стрелять, что такое красное, как брать.
  // Каждая — один раз на устройство: игра помнит флажки в настройках (actions.set('hint:<id>', true)); не помнит —
  // хотя бы раз за партию.

  const HINTS = ['move', 'dash', 'fire', 'use', 'zone'];
  const HINT_MAX = { move: 10, dash: 16, fire: 9, use: 12, zone: 4 };          // дольше не висит, с
  const known = { move: false, dash: false, fire: false, use: false, zone: false };
  const hint = { id: '', t0: 0, x0: 0, y0: 0, zoneT: -99, left: 0, token: 0 };

  function hintsReset(G) {
    const s = get.settings?.() ?? {};
    hint.left = 0;
    for (const id of HINTS) {
      known[id] = s[`hint:${id}`] === true || s.hints?.[id] === true || (Array.isArray(s.hints) && s.hints.includes(id));
      if (!known[id]) hint.left += 1;
    }
    hint.x0 = G.player.x;
    hint.y0 = G.player.y;
    hint.zoneT = -99;
    showHint('', G);
  }

  function learned(id) {
    if (known[id]) return;
    known[id] = true;
    hint.left -= 1;
    try {
      actions.set?.(`hint:${id}`, true);
    } catch (err) {
      console.warn('лисья охота: подсказка не запомнилась', id, err);
    }
  }

  function showHint(id, G) {
    if (id === hint.id) return;
    const was = hint.id;
    hint.id = id;
    hint.t0 = G.time;
    const token = ++hint.token;
    const fill = () => {
      if (token !== hint.token || !hint.id) return;
      const lefty = Boolean(get.settings?.()?.lefty);
      const mouse = Boolean(view.matchMedia?.('(hover: hover) and (pointer: fine)').matches);
      hintEl.textContent = T.hint[hint.id]({ mouse, walk: lefty ? 'Правый' : 'Левый', act: lefty ? 'левый' : 'правый' });
      turn(hintEl, true);
    };
    turn(hintEl, false);
    if (!id) return;
    // прежняя подсказка сначала гаснет, новая проявляется на её месте
    if (was) later(fill, 200);
    else fill();
  }

  function syncHints(G) {
    if (hint.left <= 0 && !hint.id) return;
    if (G.floor !== 1 || G.loop !== 0 || G.over) {
      showHint('', G);
      return;
    }
    const P = G.player;
    const focus = G.room.focus && G.room.focus.type !== 'hint';
    // что лиса уже сделала сама — тому учить незачем
    if (!known.move && (P.x - hint.x0) * (P.x - hint.x0) + (P.y - hint.y0) * (P.y - hint.y0) > 3600) learned('move');
    if (!known.dash && G.cnt.dashes > 0) learned('dash');
    if (!known.fire && G.inv.weapon && P.wcd > 0) learned('fire');
    if (hint.id) {
      const shown = G.time - hint.t0;
      if (shown > HINT_MAX[hint.id] || (hint.id === 'use' && !focus && shown > 0.6)) learned(hint.id);
    }
    let want = '';
    if (!known.zone && G.time - hint.zoneT < HINT_MAX.zone) want = 'zone';
    else if (!known.use && focus) want = 'use';
    else if (!known.move) want = 'move';
    else if (!known.dash) want = 'dash';
    else if (!known.fire && G.inv.weapon) want = 'fire';
    showHint(want, G);
  }

  // ---------- каждый кадр ----------

  function fresh(G) {
    // другая партия (заново, загрузка): всё показанное — недействительно
    S.G = G;
    for (const k of ['hp', 'maxHp', 'sh', 'maxSh', 'lives', 'livesN', 'mana', 'manaP', 'wlvl', 'coins', 'score', 'ch', 'maxCh', 'wave', 'taskN', 'taskGoal', 'taskT', 'bossP', 'fCost', 'cur', 'seen', 'done', 'fxAt']) S[k] = -1;
    S.wid = null;
    S.wcost = NaN;
    S.task = null;
    S.boss = null;
    S.fRef = null;
    S.map = null;
    S.fxSig = '';
    notes.length = 0;
    turn(taskPane, false);
    turn(bossPane, false);
    turn(promptEl, false);
    promptOn = false;
    hintsReset(G);
  }

  /** Раз в кадр: числа и плашки — по состоянию партии. Страницу трогает, только если показанное изменилось. */
  function sync(G) {
    if (!alive || !G || !G.player || !G.room) return;
    if (G !== S.G) fresh(G);
    syncVitals(G);
    syncFx(G);
    syncRoom(G);
    syncMap(G);
    syncPrompt(G);
    syncHints(G);
    // дар предлагают после хозяина места (и заново — если партию закрыли, не выбрав)
    const pend = G.pending && G.pending.kind === 'gift' ? G.pending : null;
    if (pend && !hasWin('gift')) openGift(pend.options);
    else if (!pend && hasWin('gift')) dropWin('gift');
  }

  /** Событие расчёта: мимолётное — плашки, встряски, сообщения. Остальное sync и так увидит в состоянии. */
  function onEvent(e, G) {
    if (!alive || !e) return;
    switch (e.t) {
      case 'banner':
        notice({ kind: e.kind || 'note', title: e.title, sub: e.sub });
        break;
      case 'toast':
        if (e.s) toast.show(String(e.s), 1900);
        break;
      case 'task':
        if (e.state === 'ok' || e.state === 'fail') notice({ kind: e.state, title: own(TASKS, e.id) ? TASKS[e.id].name : '', sub: T.task[e.state], ms: 1700 });
        break;
      case 'item': {
        const info = itemInfo({ id: e.id });
        if (info) notice({ kind: 'item', rarity: info.rarity, title: info.name, sub: T.got[e.how] ?? '', icon: () => itemIcon(e.id, 30, info.name), ms: 2000 });
        break;
      }
      case 'ui':
        S.wlvl = -1;                               // оружие могли заточить
        top()?.refresh?.();
        break;
      case 'hurt':
        jolt(healthChip);
        break;
      case 'block':
        bump(healthChip);
        break;
      case 'life':
        jolt(livesBox);
        break;
      case 'nomana':
        jolt(manaChip);
        manaChip.classList.add('fh-mana--no');
        later(() => manaChip.classList.remove('fh-mana--no'), 420);
        break;
      case 'zone':
        if (e.zone && e.zone.from === 1 && G) hint.zoneT = G.time;
        break;
      default:
    }
  }

  // ---------- окна ----------
  // Слой один, окна в нём — стопкой: рюкзак и статистика открываются поверх паузы, «Назад» снимает верхнее.
  // Каждое окно — { name, el, refresh(), back() → true, если само отменило своё, focus }.

  const wins = [];
  let token = 0;

  const top = () => wins[wins.length - 1] ?? null;
  const hasWin = (name) => wins.some((w) => w.name === name);

  function present(how) {
    const w = top();
    if (!w) return;
    w.refresh?.();
    modal.replaceChildren(w.el);
    if (how === 'open') showLayer(modal);
    else animate(w.el, [{ opacity: 0, transform: `translateX(${how === 'back' ? -14 : 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 190, easing: EASE_OUT });
    try {
      w.focus?.focus({ preventScroll: true });
    } catch {
      // без фокуса окно тоже работает
    }
  }

  function pushWin(w) {
    const first = wins.length === 0;
    wins.push(w);
    token += 1;
    if (first) {
      say('open');
      try {
        actions.pause?.();
      } catch (err) {
        console.error('лисья охота: пауза', err);
      }
    }
    present(first ? 'open' : 'next');
  }

  function shut() {
    const t = ++token;
    say('close');
    hideLayer(modal, () => t === token).then(() => {
      if (alive && t === token) modal.replaceChildren();
    });
  }

  /** Снять верхнее окно: под ним — прежнее; не осталось ни одного — игра продолжается. */
  function closeTop() {
    if (!wins.length) return;
    wins.pop();
    if (wins.length) {
      token += 1;
      present('back');
      return;
    }
    shut();
    actions.resume?.();
  }

  /** Закрыть всё, кроме выбора дара (его нельзя закрыть, не выбрав). */
  function closeAll() {
    if (!wins.length) return;
    const gift = wins.find((w) => w.name === 'gift');
    wins.length = 0;
    if (gift) {
      wins.push(gift);
      token += 1;
      present('back');
      return;
    }
    shut();
    actions.resume?.();
  }

  function dropWin(name) {
    const i = wins.findIndex((w) => w.name === name);
    if (i < 0) return;
    const wasTop = i === wins.length - 1;
    wins.splice(i, 1);
    if (!wasTop) return;
    if (wins.length) {
      token += 1;
      present('back');
    } else {
      shut();
      actions.resume?.();
    }
  }

  function button(text, cls, fn, props = {}) {
    const b = el('button', { class: `fh-btn${cls ? ` ${cls}` : ''}`, ...props }, text);
    tap(b, () => {
      say('tap');
      fn(b);
    });
    return b;
  }

  function closeButton() {
    const b = el('button', { class: 'fh-x', 'aria-label': T.close, title: T.close });
    b.innerHTML = svg('close');
    tap(b, () => {
      say('tap');
      closeTop();
    });
    return b;
  }

  // ---------- пауза ----------

  function pauseWin(resumed) {
    const G = get.game();
    const title = resumed ? T.pause.resumed : T.pause.title;
    const resume = button(T.pause.resume, 'fh-btn--main', closeAll);
    const values = {
      music: () => get.settings?.()?.music !== false,
      sound: () => get.sound?.() !== false,
      lefty: () => Boolean(get.settings?.()?.lefty),
      flip: () => Boolean(get.settings?.()?.flip),
    };
    const keys = ['music', 'sound', 'lefty'];
    // перевернуть на другой бок можно только экран, который лежит на боку (телефон держат стоя)
    if (screenOf()?.rotated) keys.push('flip');
    const switches = keys.map((key) => {
      const b = el('button', { class: 'fh-btn fh-switch', role: 'switch', 'aria-checked': String(values[key]()) },
        el('span', { class: 'fh-switch-label' }, T.set[key]), el('i', { class: 'fh-switch-track' }));
      tap(b, () => {
        try {
          actions.set?.(key, !values[key]());
        } catch (err) {
          console.error('лисья охота: настройка', key, err);
        }
        // что вышло на самом деле, решает игра — показываем её ответ
        b.setAttribute('aria-checked', String(values[key]()));
        say('tap');
      });
      return b;
    });

    // «Заново» переспрашивает тут же, на месте кнопок: случайное нажатие партию не сотрёт
    const foot = el('div', { class: 'fh-foot' });
    let asking = false;
    function drawFoot(moved) {
      if (asking) {
        foot.replaceChildren(
          el('span', { class: 'fh-ask' }, T.pause.ask),
          button(T.pause.yes, 'fh-btn--danger', () => {
            wins.length = 0;
            shut();
            actions.restart?.();
            actions.resume?.();
          }),
          button(T.pause.no, '', () => {
            asking = false;
            drawFoot(true);
          }),
        );
      } else {
        foot.replaceChildren(
          button(T.pause.restart, '', () => {
            asking = true;
            drawFoot(true);
          }),
          button(T.pause.exit, '', () => actions.exit?.()),
        );
      }
      foot.classList.toggle('fh-foot--ask', asking);
      if (moved) animate(foot, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
    }
    drawFoot(false);

    const card = el('div', { class: 'fh-win fh-pause', role: 'dialog', 'aria-label': title },
      el('div', { class: 'fh-head' },
        el('h2', { class: 'fh-title' }, title),
        el('p', { class: 'fh-sub' }, G ? T.pause.where(G.floor, BIOME_NAMES[G.biome] ?? '') : ''),
      ),
      el('div', { class: 'fh-pause-body' },
        el('div', { class: 'fh-col' },
          resume,
          button(T.pause.bag, '', () => pushWin(bagWin())),
          button(T.pause.stats, '', () => pushWin(statsWin())),
        ),
        el('div', { class: 'fh-col fh-col--switches' }, switches),
      ),
      foot,
    );
    return {
      name: 'pause',
      el: card,
      focus: resume,
      back() {
        if (!asking) return false;
        asking = false;
        drawFoot(true);
        return true;
      },
    };
  }

  /** Открыть паузу. resumed — партию только что продолжили с сохранения: окно говорит об этом. */
  function openPause(resumed = false) {
    const G = get.game();
    if (!alive || !G || G.over || hasWin('pause')) return;
    pushWin(pauseWin(Boolean(resumed)));
  }

  // ---------- рюкзак ----------

  const invSig = (inv) => {
    let s = `${inv.weapon?.id ?? ''}.${inv.weapon?.lvl ?? 0}|${inv.armor?.id ?? ''}`;
    for (const it of inv.acc) s += `|${it?.id ?? ''}`;
    for (const it of inv.bag) s += `|${it?.id ?? ''}.${it?.lvl ?? 0}`;
    return s;
  };
  const itemAt = (inv, slot, index) => (slot === 'weapon' || slot === 'armor' ? inv[slot] : inv[slot]?.[index]) ?? null;

  // где теперь лежит вещь (после «надеть» и «снять» она переезжает, а выбор остаётся на ней)
  function locate(inv, ref) {
    if (!ref) return null;
    if (inv.weapon === ref) return { slot: 'weapon', index: 0 };
    if (inv.armor === ref) return { slot: 'armor', index: 0 };
    let i = inv.acc.indexOf(ref);
    if (i >= 0) return { slot: 'acc', index: i };
    i = inv.bag.indexOf(ref);
    return i >= 0 ? { slot: 'bag', index: i } : null;
  }

  function bagWin() {
    const leftPane = el('div', { class: 'fh-bag-left' });
    const info = el('div', { class: 'fh-info' });
    let sel = null;              // { slot, index, ref } — что выбрано; ref — сама вещь (null — пустая ячейка)
    let choosing = -1;           // ячейка рюкзака с украшением, которому выбирают место среди занятых
    let extraPage = 0;
    let started = false;

    function firstItem(inv) {
      if (inv.weapon) return { slot: 'weapon', index: 0, ref: inv.weapon };
      if (inv.armor) return { slot: 'armor', index: 0, ref: inv.armor };
      for (const slot of ['acc', 'bag']) {
        const i = inv[slot].findIndex(Boolean);
        if (i >= 0) return { slot, index: i, ref: inv[slot][i] };
      }
      return null;
    }

    /** Попросить игру что-то сделать с вещью и перечитать рюкзак. Ничего не изменилось — сказать почему. */
    function act(run, ref, why) {
      const before = invSig(get.game().inv);
      const was = sel;
      try {
        run();
      } catch (err) {
        console.error('лисья охота: действие с вещью', err);
      }
      const inv = get.game().inv;
      const failed = invSig(inv) === before;
      if (failed) toast.show(why, 1500);
      const at = locate(inv, ref);
      if (at) sel = { ...at, ref };
      else if (was && (was.slot === 'weapon' || was.slot === 'armor' || was.slot === 'acc' || was.slot === 'bag')) sel = { slot: was.slot, index: was.index, ref: itemAt(inv, was.slot, was.index) };
      else sel = firstItem(inv);
      draw();
      if (failed) jolt(info);
    }

    function choose(slot, index) {
      const inv = get.game().inv;
      if (choosing >= 0) {
        const from = choosing;
        choosing = -1;
        if (slot === 'acc') {
          act(() => actions.equip?.(from, index), inv.bag[from], T.bag.cant);
          return;
        }
      }
      sel = { slot, index, ref: itemAt(inv, slot, index) };
      draw();
    }

    function cell(slot, index, it) {
      const data = it ? itemInfo(it) : null;
      const picked = Boolean(sel) && sel.slot === slot && sel.index === index;
      const target = choosing >= 0 && slot === 'acc';
      const b = el('button', {
        class: `fh-slot fh-slot--${slot}${data ? ` fh-r${data.rarity}` : ' fh-slot--empty'}${picked ? ' fh-slot--sel' : ''}${target ? ' fh-slot--target' : ''}`,
        'aria-label': data ? data.name : `${T.bag.slot[slot]}: ${T.bag.empty.toLowerCase()}`,
        'aria-pressed': String(picked),
      });
      if (data) b.append(itemIcon(it.id, 34, data.name));
      else if (slot !== 'bag') b.append(sign(slot, 26, 'fh-ic--idle'));
      if (it && it.lvl > 0) b.append(el('span', { class: 'fh-badge' }, T.bag.lvl(it.lvl)));
      tap(b, () => {
        say('tap');
        choose(slot, index);
      });
      return b;
    }

    // дары и спутники: одинаковые дары — одним значком со счётчиком; не влезли в ряд — последняя ячейка листает
    function extras(G) {
      const list = G.minions.map((m, i) => ({ slot: 'pal', index: i, id: m.id, name: MINIONS[m.id]?.name ?? m.id }));
      const count = new Map();
      G.gifts.forEach((id, i) => {
        if (count.has(id)) count.get(id).n += 1;
        else {
          const e = { slot: 'gift', index: i, id, name: GIFTS[id]?.name ?? id, n: 1 };
          count.set(id, e);
          list.push(e);
        }
      });
      if (!list.length) return el('p', { class: 'fh-none' }, T.bag.noExtra);
      const paged = list.length > EXTRA_ROW;
      const per = paged ? EXTRA_ROW - 1 : EXTRA_ROW;
      const pages = Math.ceil(list.length / per);
      extraPage %= pages;
      const row = list.slice(extraPage * per, extraPage * per + per).map((e) => {
        const picked = Boolean(sel) && sel.slot === e.slot && sel.index === e.index;
        const b = el('button', { class: `fh-slot fh-slot--${e.slot}${picked ? ' fh-slot--sel' : ''}`, 'aria-label': e.name, 'aria-pressed': String(picked) },
          e.slot === 'pal' ? icon([`ui.minion.${e.id}`], 34, { rig: e.id, letter: initial(e.name) }) : icon(`gift.${e.id}`, 34, { letter: initial(e.name) }));
        if (e.n > 1) b.append(el('span', { class: 'fh-badge' }, T.bag.times(e.n)));
        tap(b, () => {
          say('tap');
          choosing = -1;
          sel = { slot: e.slot, index: e.index, ref: null };
          draw();
        });
        return b;
      });
      if (paged) {
        const rest = list.length - Math.min(list.length, (extraPage + 1) * per);
        const more = el('button', { class: 'fh-slot fh-slot--more', 'aria-label': T.stats.next }, rest > 0 ? T.bag.more(rest) : '');
        if (rest <= 0) more.innerHTML = svg('prev');
        tap(more, () => {
          say('tap');
          extraPage = (extraPage + 1) % pages;
          draw();
        });
        row.push(more);
      }
      return el('div', { class: 'fh-slots fh-slots--extra' }, row);
    }

    const plate = (cls, ...kids) => el('div', { class: `fh-plate ${cls}` }, ...kids);
    const cardHead = (pic, name, meta) => el('div', { class: 'fh-info-head' }, pic,
      el('div', { class: 'fh-info-names' }, el('b', { class: 'fh-info-name' }, name), meta ? el('span', { class: 'fh-info-meta' }, meta) : null));

    function drawInfo(G) {
      const inv = G.inv;
      const kids = [];
      if (choosing >= 0) kids.push(el('p', { class: 'fh-info-ask' }, T.bag.which));
      if (!sel) kids.push(el('p', { class: 'fh-info-text' }, T.bag.none));
      else if (sel.slot === 'gift') {
        const id = G.gifts[sel.index];
        const def = GIFTS[id] ?? {};
        kids.push(cardHead(plate('fh-plate--gift', icon(`gift.${id}`, 44, { letter: initial(def.name) })), def.name ?? id, T.bag.gift),
          el('p', { class: 'fh-info-text' }, def.desc ?? ''));
      } else if (sel.slot === 'pal') {
        const m = G.minions[sel.index];
        const def = (m && MINIONS[m.id]) ?? {};
        const pal = m ? G.room?.pals?.find((n) => n.id === m.id && !n.dead) : null;
        kids.push(cardHead(plate('fh-plate--pal', icon([`ui.minion.${m?.id}`], 44, { rig: m?.id, letter: initial(def.name) })), def.name ?? m?.id ?? '', T.bag.pal));
        if (m) kids.push(el('ul', { class: 'fh-info-lines' }, el('li', {}, T.bag.hp(m.hp, pal?.maxHp ?? Math.max(m.hp, Math.round((def.hp ?? m.hp) * (G.player.st.palHp ?? 1)))))));
        kids.push(el('p', { class: 'fh-info-text' }, def.desc ?? ''));
      } else if (!sel.ref) {
        kids.push(cardHead(plate('fh-plate--empty', sel.slot === 'bag' ? null : sign(sel.slot, 40, 'fh-ic--idle')), T.bag.slot[sel.slot], T.bag.empty),
          el('p', { class: 'fh-info-text' }, T.bag.about[sel.slot]));
      } else {
        const it = sel.ref;
        const data = itemInfo(it);
        const worn = sel.slot !== 'bag';
        kids.push(cardHead(plate(`fh-r${data.rarity}`, itemIcon(it.id, 44, data.name)), data.name, `${T.kind[data.kind]} · ${T.rarity[data.rarity].toLowerCase()}`));
        if (data.lines.length) kids.push(el('ul', { class: 'fh-info-lines' }, data.lines.map((line) => el('li', {}, line))));
        if (data.desc) kids.push(el('p', { class: 'fh-info-text' }, data.desc));
        const drop = button(T.bag.drop, '', () => act(() => actions.drop?.(sel.slot, sel.index), null, T.bag.cant));
        let main;
        if (worn) main = button(T.bag.unequip, 'fh-btn--main', () => act(() => actions.unequip?.(sel.slot, sel.index), it, T.bag.full));
        else if (data.kind === 'potion') main = button(T.bag.drink, 'fh-btn--main', () => act(() => actions.usePotion?.(sel.index), it, T.bag.noNeed));
        else {
          main = button(T.bag.equip, 'fh-btn--main', () => {
            // украшений три: все места заняты — пусть игрок сам скажет, которое снять
            if (data.kind === 'acc' && inv.acc.every(Boolean)) {
              choosing = sel.index;
              draw();
              return;
            }
            act(() => actions.equip?.(sel.index), it, T.bag.cant);
          });
        }
        kids.push(el('div', { class: 'fh-info-actions' }, main, drop));
      }
      info.replaceChildren(...kids);
    }

    function draw() {
      const G = get.game();
      if (!G) return;
      const inv = G.inv;
      if (!started) {
        started = true;
        sel = firstItem(inv);
      } else if (sel && sel.slot !== 'gift' && sel.slot !== 'pal') {
        // пока окно открыто, вещь могли переложить не мы (событие 'ui') — выбор идёт за ней
        const at = locate(inv, sel.ref);
        sel = at ? { ...at, ref: sel.ref } : { slot: sel.slot, index: sel.index, ref: itemAt(inv, sel.slot, sel.index) };
      } else if (sel && ((sel.slot === 'gift' && sel.index >= G.gifts.length) || (sel.slot === 'pal' && sel.index >= G.minions.length))) sel = firstItem(inv);
      if (choosing >= 0 && !(inv.bag[choosing] && kindOfItem(inv.bag[choosing].id) === 'acc' && inv.acc.every(Boolean))) choosing = -1;
      const packed = inv.bag.filter(Boolean).length;
      leftPane.replaceChildren(
        el('h3', { class: 'fh-label' }, T.bag.worn),
        el('div', { class: 'fh-slots' }, cell('weapon', 0, inv.weapon), cell('armor', 0, inv.armor), inv.acc.map((it, i) => cell('acc', i, it))),
        el('h3', { class: 'fh-label' }, T.bag.pack(packed, inv.bag.length)),
        el('div', { class: 'fh-slots fh-slots--bag' }, inv.bag.map((it, i) => cell('bag', i, it))),
        el('h3', { class: 'fh-label' }, T.bag.extra),
        extras(G),
      );
      drawInfo(G);
    }

    const card = el('div', { class: 'fh-win fh-bag', role: 'dialog', 'aria-label': T.bag.title },
      el('div', { class: 'fh-head' }, el('h2', { class: 'fh-title' }, T.bag.title), closeButton()),
      el('div', { class: 'fh-bag-body' }, leftPane, info),
    );
    return {
      name: 'bag',
      el: card,
      refresh: draw,
      back() {
        if (choosing < 0) return false;
        choosing = -1;
        draw();
        return true;
      },
      /** Для проверочной страницы: выбрать ячейку. */
      select(slot, index) {
        choosing = -1;
        choose(slot, index);
      },
    };
  }

  // ---------- статистика ----------

  function statsWin(startTab = 'run') {
    const TABS = ['run', 'all', 'seen'];
    const body = el('div', { class: 'fh-stats-body' });
    let tab = TABS.includes(startTab) ? startTab : 'run';
    let page = 0;
    let picked = '';             // на какую вещь коллекции нажали

    const tabs = TABS.map((id) => {
      const b = el('button', { class: 'fh-tab', role: 'tab', 'aria-selected': 'false' }, T.stats.tabs[id]);
      tap(b, () => {
        if (tab === id) return;
        say('tap');
        const dir = TABS.indexOf(id) > TABS.indexOf(tab) ? 1 : -1;
        tab = id;
        picked = '';
        draw();
        slide(dir);
      });
      return b;
    });

    const slide = (dir) => animate(body, [{ opacity: 0, transform: `translateX(${dir * 12}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE_OUT });
    const tile = (label, value) => el('div', { class: 'fh-tile' }, el('b', { class: 'fh-tile-num' }, value), el('span', { class: 'fh-tile-label' }, label));

    function runPage(G) {
      const s = runSummary(G);
      const value = {
        score: digits(s.score), floor: `${s.floor} · ${BIOME_NAMES[s.biome] ?? ''}`, time: clock(s.time), rabbits: digits(s.rabbits),
        kills: digits(s.kills), bosses: digits(s.bosses), tasks: digits(s.tasks), coins: digits(s.coins),
      };
      return [el('div', { class: 'fh-tiles fh-tiles--run' }, Object.keys(T.stats.run).map((k) => tile(T.stats.run[k], value[k])))];
    }

    function allPage() {
      const st = get.stats?.() ?? {};
      const kids = [el('div', { class: 'fh-tiles' }, Object.keys(T.stats.all).map((k) => tile(T.stats.all[k], digits(Number.isFinite(st[k]) ? st[k] : 0))))];
      // «Очки в рейтинге» — общий блок всех игр; его может не быть (подсказка ещё закрыта)
      const points = get.points ? get.points() : pointsInfo(api, 'fox-hunt');
      if (points) kids.push(points);
      return kids;
    }

    function seenPage(G) {
      const found = new Set([...(get.seen?.() ?? []), ...(G.seen ?? [])]);
      const pages = collectionPages(found);
      if (!pages.length) return [el('p', { class: 'fh-none' }, T.stats.unknown)];
      page = clamp(page, 0, pages.length - 1);
      const p = pages[page];
      let got = 0;
      let all = 0;
      for (const q of pages) {
        if (q.part !== 1) continue;
        got += q.got;
        all += q.of;
      }
      const line = el('div', { class: 'fh-pager-text' });
      const describe = () => {
        const def = picked ? REGS[p.kind][picked] : null;
        if (def && found.has(picked)) line.replaceChildren(el('b', {}, def.name ?? picked), el('span', {}, `${T.kind[p.kind]} · ${T.rarity[clamp(def.rarity ?? 0, 0, 3)].toLowerCase()}`));
        else if (def) line.replaceChildren(el('b', {}, T.stats.unknown), el('span', {}, T.stats.hidden));
        else line.replaceChildren(el('b', {}, T.stats.kindLine(T.kinds[p.kind], p.got, p.of)), el('span', {}, T.stats.total(got, all)));
      };
      describe();
      const arrow = (dir) => {
        const b = el('button', { class: 'fh-x fh-arrow', 'aria-label': dir < 0 ? T.stats.prev : T.stats.next, disabled: pages.length < 2 });
        b.innerHTML = svg(dir < 0 ? 'prev' : 'next');
        tap(b, () => {
          say('tap');
          page = (page + dir + pages.length) % pages.length;
          picked = '';
          draw();
          slide(dir);
        });
        return b;
      };
      const cells = p.ids.map((id) => {
        const def = REGS[p.kind][id];
        const has = found.has(id);
        const b = el('button', {
          class: `fh-slot fh-slot--seen${has ? ` fh-r${clamp(def.rarity ?? 0, 0, 3)}` : ' fh-slot--unknown'}${picked === id ? ' fh-slot--sel' : ''}`,
          'aria-label': has ? def.name ?? id : T.stats.unknown,
        }, itemIcon(id, 34, def.name, !has));
        tap(b, () => {
          say('tap');
          const was = body.querySelector?.('.fh-slot--sel');
          was?.classList.remove('fh-slot--sel');
          picked = picked === id ? '' : id;
          if (picked) b.classList.add('fh-slot--sel');
          describe();
          bump(line);
        });
        return b;
      });
      return [el('div', { class: 'fh-pager' }, arrow(-1), line, arrow(1)), el('div', { class: 'fh-seen' }, cells)];
    }

    function draw() {
      const G = get.game();
      if (!G) return;
      tabs.forEach((b, i) => b.setAttribute('aria-selected', String(TABS[i] === tab)));
      body.className = `fh-stats-body fh-stats-body--${tab}`;
      body.replaceChildren(...(tab === 'run' ? runPage(G) : tab === 'all' ? allPage() : seenPage(G)));
    }

    const card = el('div', { class: 'fh-win fh-stats', role: 'dialog', 'aria-label': T.stats.title },
      el('div', { class: 'fh-head' }, el('div', { class: 'fh-tabs', role: 'tablist' }, tabs), closeButton()),
      body,
    );
    return {
      name: 'stats',
      el: card,
      refresh: draw,
      /** Для проверочной страницы: открыть вкладку и страницу коллекции, выбрать вещь. */
      show(nextTab, nextPage = 0, id = '') {
        if (TABS.includes(nextTab)) tab = nextTab;
        page = nextPage;
        picked = id;
        draw();
      },
    };
  }

  // ---------- дар леса ----------

  function giftWin(options) {
    const openedAt = Date.now();
    let chosen = -1;
    const take = button(T.gift.choose, 'fh-btn--main fh-gift-take', () => {
      if (chosen < 0) return;
      const i = chosen;
      try {
        actions.chooseGift?.(i);
      } catch (err) {
        console.error('лисья охота: выбор дара', err);
      }
      // дар взят — окно уходит (а не взят — sync увидит, что выбор всё ещё ждёт, и откроет его снова)
      if (!get.game()?.pending) dropWin('gift');
    }, { disabled: true });
    const cards = options.map((id, i) => {
      const def = GIFTS[id] ?? {};
      const b = el('button', { class: 'fh-gift-card', 'aria-pressed': 'false' },
        el('span', { class: 'fh-plate fh-plate--gift' }, icon(`gift.${id}`, 52, { letter: initial(def.name) })),
        el('b', { class: 'fh-gift-name' }, def.name ?? id),
        el('span', { class: 'fh-gift-desc' }, def.desc ?? ''),
      );
      tap(b, () => {
        // окно выскакивает посреди боя, пальцы ещё на джойстиках: касание в первые мгновения — не выбор
        if (Date.now() - openedAt < GIFT_GUARD_MS) return;
        say('tap');
        chosen = i;
        cards.forEach((c, k) => {
          c.classList.toggle('fh-gift-card--sel', k === i);
          c.setAttribute('aria-pressed', String(k === i));
        });
        take.disabled = false;
        take.textContent = T.gift.take;
        bump(b.firstElementChild ?? b);
      });
      return b;
    });
    const card = el('div', { class: 'fh-win fh-gift', role: 'dialog', 'aria-label': T.gift.title },
      el('div', { class: 'fh-head fh-head--center' }, el('h2', { class: 'fh-title' }, T.gift.title), el('p', { class: 'fh-sub' }, T.gift.sub)),
      el('div', { class: 'fh-gift-cards' }, cards),
      take,
    );
    return { name: 'gift', el: card };
  }

  function openGift(options) {
    if (!alive || !Array.isArray(options) || !options.length) return;
    const w = giftWin(options);
    // поверх уже открытой паузы дар не лезет: ждёт под ней
    if (wins.length) wins.unshift(w);
    else pushWin(w);
  }

  // ---------- «Назад» ----------

  /** Нажали «Назад» (или Esc): снять верхнее окно, а нет окон — открыть паузу. true — разобрались сами. */
  function back() {
    const G = get.game();
    if (!alive || !G || G.over) return false;
    const w = top();
    if (!w) {
      openPause(false);
      return true;
    }
    if (w.back?.()) return true;
    // выбор дара закрыть нельзя — зато из него можно выйти в паузу (и в меню)
    if (w.name === 'gift') openPause(false);
    else closeTop();
    return true;
  }

  // ---------- размеры ----------

  let offChange = null;
  let observer = null;

  function layout() {
    if (!alive) return;
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    if (!w || !h) return;
    const ins = screenOf()?.insets?.() ?? NO_INSETS;
    root.style.setProperty('--fh-zoom', String(Math.round(zoomFor(w, h, ins) * 1000) / 1000));
    root.style.setProperty('--fh-hud-zoom', String(Math.round(hudZoomFor(w, h) * 1000) / 1000));
    safe.l = ins.left + 6;
    safe.t = ins.top + 6;
    safe.r = w - ins.right - 6;
    safe.b = h - ins.bottom - 6;
    measurePrompt();
  }

  offChange = screenOf()?.onChange?.(layout) ?? null;
  if (typeof view.ResizeObserver === 'function') {
    observer = new view.ResizeObserver(layout);
    observer.observe(root);
  }
  layout();

  function destroy() {
    if (!alive) return;
    alive = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (typeof offChange === 'function') offChange();
    observer?.disconnect();
    toast.dispose();
    hud.remove();
    modal.remove();
    root.style.removeProperty('--fh-zoom');
    root.style.removeProperty('--fh-hud-zoom');
    wins.length = 0;
    notes.length = 0;
    masters.clear();
    rigs.clear();
    mapCells.clear();
    art.clear();
  }

  return {
    sync,
    onEvent,
    place,
    openPause,
    back,
    get isOpen() {
      return wins.length > 0;
    },
    destroy,
    /** Сверх договора — для проверочной страницы и отладки: открыть окно по имени ('pause' | 'bag' | 'stats'). */
    open(name, arg) {
      if (name === 'pause') openPause(Boolean(arg));
      else if (name === 'bag' && !hasWin('bag')) pushWin(bagWin());
      else if (name === 'stats' && !hasWin('stats')) pushWin(statsWin(arg));
      return top();
    },
    /** Верхнее окно (или null). */
    get top() {
      return top();
    },
    layout,
  };
}
