// Ремонт гаджетов: клиент приносит сломанное устройство (смартфон, кнопочный телефон, ПарДек, Свичер, Карманка) с
// жалобой — найди поломку, разбери, почини и собери. Инструменты внизу (фен, присоска, отвёртка, лопатка, пинцет,
// запчасти, кисточка, спирт, лупа, зарядка, антивирус, компьютер): выбери и коснись детали; фен держат, кисточкой и
// спиртом трут. Снятое ложится в лотки, винты — на магнитный коврик. Новые детали покупаются в магазине (деньги —
// за сданные заказы), ставятся со склада. Прошивка — кабель от компьютера и команды в терминале на своей клавиатуре.
// «Сдать» — проверка: работает — звёзды, оплата и следующий клиент, нет — возврат (−★).
// Правила — logic.js (устройства — devices.js, терминал — terminal.js), рисунки — scene.js и kinds/*.js, звуки — sounds.js.
//
// Сцена — один SVG (viewBox 360×440): лотки, устройство (две стороны и «край» в .pr-flipper — переворот сжатием по X),
// слой лотка и слой полёта. Деталь — узел <g class="pr-part"> с CSS translate/scale (на месте 0/1, в лотке —
// уменьшенная копия на своём месте); при снятии узел переезжает в слой лотка, при установке — в своё гнездо
// (порядок слоёв задают пустые <g data-slot>, винты — сразу над своей деталью). Отстёгиваемые части (край) видны
// с обеих сторон: сзади сдвигаются зеркально. Попадание пальцем считается своим кодом по рамкам целей.

import { el } from '../../shared/dom.js';
import { animate, showLayer, hideLayer, reducedMotion } from '../../shared/motion.js';
import { createToast } from '../../shared/toast.js';
import { createFx } from '../../shared/fx.js';
import { createAudio } from '../../shared/sfx.js';
import { createSounds } from './sounds.js';
import {
  DEVICES, KINDS, TOOLS, TUTORIAL, UNLOCK, SYMPTOMS, complaintsFor, newOrder, act, nextStep, reach, screenOf, starsFor, isValidState,
  normProgress, recordWin, earningsFor, shopParts, stockKey, screwsOf,
} from './logic.js';
import { run as runTerminal, greet, tabComplete, PROMPT } from './terminal.js';
import { W, H, defs, avatar, TOOL_ICONS } from './scene.js';
import phone from './kinds/phone.js';
import button from './kinds/button.js';
import deck from './kinds/deck.js';
import nswitch from './kinds/switch.js';
import psp from './kinds/psp.js';
import earbuds from './kinds/earbuds.js';
import headphones from './kinds/headphones.js';
import mouse from './kinds/mouse.js';
import keyboard from './kinds/keyboard.js';
import hdd from './kinds/hdd.js';
import motherboard from './kinds/motherboard.js';
import gpu from './kinds/gpu.js';
import cpu from './kinds/cpu.js';
import tablet from './kinds/tablet.js';
import laptop from './kinds/laptop.js';
import watch from './kinds/watch.js';
import gamepad from './kinds/gamepad.js';
import powerbank from './kinds/powerbank.js';
import speaker from './kinds/speaker.js';
import drone from './kinds/drone.js';
import vr from './kinds/vr.js';
import camera from './kinds/camera.js';
import ereader from './kinds/ereader.js';

const LAYOUTS = {
  phone, button, deck, switch: nswitch, psp, earbuds, headphones, mouse, keyboard, hdd, motherboard, gpu, cpu, tablet, laptop,
  watch, gamepad, powerbank, speaker, drone, vr, camera, ereader,
};
const SKINS = ['telegram', 'green', 'blue', 'wood', 'night'];
const AUTO_HINT = 2;                     // первые заказы — подсказка показывается сама и бесплатно
const HEAT_MS = 1100;
const SCRUB = 240;                       // сколько потереть (единиц сцены)
const SVGNS = 'http://www.w3.org/2000/svg';
const KEYBOARD = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm._-'];

const T = {
  title: 'Ремонт гаджетов',
  sub: (level, money) => `Заказ №${level} · ${usd(money)}`,
  tools: {
    heat: 'Фен', suction: 'Присоска', screwdriver: 'Отвёртка', spudger: 'Лопатка', tweezers: 'Пинцет', parts: 'Запчасти',
    brush: 'Кисточка', alcohol: 'Спирт', magnifier: 'Лупа', charger: 'Зарядка', antivirus: 'Антивирус', flash: 'ПК',
  },
  toolHints: {
    heat: 'Держи на детали на клею, пока клей не размягчится',
    suction: 'Снимает прогретую крышку или экран',
    screwdriver: 'Выкручивает и закручивает винты',
    spudger: 'Отключает и подключает шлейфы',
    tweezers: 'Снимает детали и ставит их обратно',
    parts: 'Ставит новую деталь со склада на пустое место',
    brush: 'Потри пыльное место',
    alcohol: 'Потри липкое или окисленное',
    magnifier: 'Коснись детали — посмотреть, что с ней',
    charger: 'Вставь в гнездо — проверить зарядку',
    antivirus: 'Коснись экрана включённого смартфона',
    flash: 'Вставь кабель в гнездо — откроется терминал',
  },
  names: {
    cover: 'задняя крышка', shield: 'экран платы', bracket: 'нижняя планка', battery: 'батарея', camera: 'камера',
    speaker: 'динамик', port: 'плата зарядки', display: 'экран', fascia: 'передняя панель', keypad: 'клавиатура',
    plate: 'пластина', shell: 'корпус', fan: 'вентилятор', ssd: 'диск', stickL: 'левый стик', stickR: 'правый стик',
    joyL: 'левый контроллер', joyR: 'правый контроллер', cart: 'считыватель картриджей', door: 'дверца батареи',
    umd: 'привод дисков', nub: 'шишечка', budL: 'левый наушник', budR: 'правый наушник', padL: 'левая амбушюра',
    padR: 'правая амбушюра', driverL: 'левый динамик', driverR: 'правый динамик', band: 'оголовье', feet: 'ножки',
    switchL: 'левый микрик', switchR: 'правый микрик', wheel: 'колёсико', keycaps: 'колпачки', switch: 'свитч', case: 'дно корпуса',
    cable: 'шлейф USB', pcb: 'плата', lid: 'крышка', heads: 'блок головок', platter: 'пластина', cmos: 'батарейка BIOS',
    ram: 'память', heatsink: 'радиатор', cap: 'конденсатор', shroud: 'кожух', vram: 'видеопамять', cooler: 'кулер',
    bottom: 'дно', sensor: 'крышка с датчиком', strap: 'ремешок', rumble: 'вибромотор', grille: 'сетка', mic: 'микрофоны',
    props: 'пропеллеры', motor: 'мотор', gimbal: 'камера с подвесом', cushion: 'накладка', lens: 'объектив', shutter: 'затвор',
    paste: 'термопаста', pins: 'ножки процессора', crumbs: 'крошки', keys: 'кнопки', slot: 'слот', waxL: 'сетка левого',
    waxR: 'сетка правого',
  },
  flip: 'Перевернуть',
  hint: 'Подсказка',
  deliver: 'Сдать',
  pickTool: 'Выбери инструмент внизу',
  why: {
    flip: 'Это с другой стороны — переверни',
    blocked: (by) => `Сначала сними: ${T.names[by] ?? by}`,
    'no-holder': 'Винту некуда вкрутиться — нет детали',
    'no-part': 'Детали нет на месте',
    glue: 'Держится на клею. Прогрей края феном',
    'flex-holds': 'Держит шлейф — отключи его',
    'heat-where': 'Феном греют клей крышки и экрана',
    'suction-where': 'Присоской снимают детали на клею',
    'no-screws': 'Тут нечего откручивать',
    'use-suction': 'Это на клею — прогрей феном и сними присоской',
    'spudger-where': 'Лопаткой отключают и подключают шлейфы',
    'use-screwdriver': 'Винты — отвёрткой',
    'tweezers-where': 'Пинцетом снимают и ставят детали',
    screws: 'Сначала выкрути винты',
    'bat-connected': 'Сначала отключи батарею лопаткой',
    flex: 'Сначала отключи шлейф лопаткой',
    'parts-where': 'Новую деталь ставят на пустое место',
    'remove-first': 'Сначала сними старую деталь',
    'inside-missing': (by) => `Под ней не всё собрано: ${T.names[by] ?? by}`,
    'no-stock': 'На складе нет — купи в магазине',
    clean: 'Тут и так чисто',
    consumable: 'Старую обратно не нанести — нужна новая («Запчасти»)',
    'use-alcohol': 'Старую пасту стирают спиртом',
    'lid-closed': 'Сначала открой крышку — коснись её',
    'wrong-tool': (need) => `Тут нужен другой инструмент: ${T.tools[need]?.toLowerCase() ?? need}`,
    'no-battery': 'Тут нечего заряжать',
    'brush-weak': 'Кисточкой не взять — нужен спирт',
    'brush-where': 'Кисточкой чистят пыль',
    'alcohol-dust': 'Это пыль — тут нужна кисточка',
    'alcohol-where': 'Спиртом отмывают липкое и окисление',
    'charger-where': 'Зарядку — в гнездо',
    'antivirus-where': 'Антивирус — на экране смартфона',
    'power-off': 'Сначала включи — кнопка питания',
    'no-screen': 'Экран не работает — антивирус не запустить',
    'no-bug': '',
    done: '',
    nothing: '',
  },
  finds: {
    ok: 'Всё в порядке',
    'cover-glass': 'Стекло камеры треснуло — нужна новая крышка',
    'cover-bulge': 'Корпус что-то выдавливает изнутри',
    'display-crack': 'Стекло экрана разбито — нужен новый экран',
    'battery-swollen': 'Батарея вздулась! Под замену',
    'battery-worn': 'Батарея изношена: держит 38% ёмкости',
    'camera-dead': 'Модуль камеры сгорел',
    'speaker-torn': 'Мембрана динамика порвана',
    'speaker-dirty': 'Сетка динамика забита пылью',
    'port-burnt': 'Плата зарядки сгорела',
    'jack-ok': 'Гнездо чистое',
    'jack-dirty': 'В гнезде слежавшийся пух из кармана',
    'jack-burnt': 'Контакты в копоти — сгорела плата зарядки',
    'board-ok': 'Плата чистая',
    'board-dirty': 'Окисление — плата побывала в воде',
    'indicator-ok': 'Индикатор влаги белый — воды не было',
    'indicator-red': 'Индикатор влаги красный — был в воде',
    'keypad-worn': 'Контакты кнопок стёрты — нужна новая клавиатура',
    'keys-dirty': 'Под кнопками липкий сладкий чай',
    'keys-ok': 'Кнопки чистые',
    'fan-dirty': 'Вентилятор забит пылью',
    'fan-grind': 'Подшипник вентилятора разбит — скрежет',
    'ssd-dead': 'Диск не отвечает — нужен новый',
    'stickL-drift': 'Датчик левого стика стёрт — дрейф',
    'stickR-drift': 'Датчик правого стика стёрт — дрейф',
    'joyL-drift': 'Стик левого контроллера стёрт — дрейф',
    'joyR-drift': 'Стик правого контроллера стёрт — дрейф',
    'cart-dead': 'Считыватель картриджей сгорел',
    'slot-dirty': 'В слоте пыль на контактах',
    'slot-ok': 'Слот чистый',
    'umd-dead': 'Лазер привода не светит — нужен новый привод',
    'nub-drift': 'Шишечка стёрта — дрейф',
    'budL-dead': 'Левый наушник не отвечает — плата сгорела',
    'budR-dead': 'Правый наушник не отвечает — плата сгорела',
    'waxL-dirty': 'Сеточка левого забита серой', 'waxR-dirty': 'Сеточка правого забита серой',
    'driverL-torn': 'Мембрана левого динамика порвана', 'driverR-torn': 'Мембрана правого динамика порвана',
    'padL-worn': 'Амбушюра облезла', 'padR-worn': 'Амбушюра облезла', 'band-cracked': 'Оголовье треснуло пополам',
    'switchL-double': 'Микрик изношен — двойной клик', 'switchR-double': 'Микрик изношен — двойной клик',
    'wheel-broken': 'Энкодер колёсика сломан', 'wheel-dirty': 'Энкодер в пыли и волосах', 'lens-dirty': 'Линза в пыли',
    'feet-worn': 'Ножки стёрлись до пластика', 'keycaps-worn': 'Колпачки стёрлись', 'switch-chatter': 'Контакты свитча дребезжат',
    'cable-frayed': 'Шлейф перетёрт', 'pcb-dead': 'Плата сгорела', 'crumbs-dirty': 'Под колпачками крошки',
    'heads-stuck': 'Головки прилипли к пластине — щелчки', 'platter-scratched': 'Пластина в царапинах — битые сектора',
    'cmos-dead': 'Батарейка BIOS села: 1,9 В', 'ram-dead': 'Чип памяти сгорел', 'cap-swollen': 'Конденсатор вздулся!',
    'heatsink-dirty': 'Радиатор забит пылью', 'paste-dry': 'Термопаста высохла в камень — сотри спиртом и нанеси новую', 'vram-dead': 'Чип видеопамяти сгорел',
    'cooler-grind': 'Подшипник кулера разбит', 'cooler-dirty': 'Кулер забит пылью', 'pins-dirty': 'Ножки погнуты — выпрями пинцетом',
    'pins-ok': 'Ножки ровные', 'strap-torn': 'Ремешок порван', 'sensor-dirty': 'Датчик пульса в грязи', 'sensor-ok': 'Датчик чистый',
    'rumble-dead': 'Вибромотор сгорел', 'mic-dead': 'Микрофоны не отвечают', 'grille-dirty': 'Сетка забита пылью',
    'props-broken': 'Лопасти сломаны', 'motor-burnt': 'Обмотка мотора сгорела', 'gimbal-dead': 'Камера подвеса не отвечает',
    'cushion-worn': 'Поролон накладки развалился', 'lens-stuck': 'Мотор фокусировки заклинило', 'glass-dirty': 'Стекло объектива мутное',
    'shutter-stuck': 'Шторки затвора заклинило',
    'bat-loose': 'Разъём батареи отошёл',
    'disp-loose': 'Шлейф экрана отошёл',
    'conn-off': 'Шлейф отключён',
    'conn-ok': 'Шлейф подключён плотно',
  },
  okPart: (p) => `${cap(T.names[p] ?? p)} в порядке`,
  returned: (list) => `Клиент вернулся: ${list}`,
  assemble: (m) => (m.parts.length ? 'Сначала собери: не хватает деталей' : `Сначала собери: ${m.screws} ${plural(m.screws, 'винт', 'винта', 'винтов')} не на месте`),
  heated: 'Клей размягчился',
  rub: 'Потри пальцем',
  charging: '⚡ Заряжается',
  noCharge: 'Не заряжается',
  dead: 'Не включается',
  blink: 'Включился и сразу погас',
  bootOn: 'Включился — смотри экран',
  poweredOn: 'Включено',
  scanFound: (n) => `Найдено ${n} ${plural(n, 'вирус', 'вируса', 'вирусов')} — дави жуков!`,
  scanClean: 'Вирусов нет',
  cured: 'Вирусы удалены',
  flashed: 'Прошито — загружается',
  spark: 'Искра! Сначала обесточь',
  wasted: 'Старая деталь была исправна',
  noStock: (p) => `Нет на складе: ${T.names[p] ?? p}`,
  hintNote: 'С подсказкой — не больше двух звёзд за заказ',
  newFault: 'Новая поломка',
  newKind: 'Новое в мастерской',
  gotIt: 'Понятно',
  notes: 'Что нашёл',
  noNotes: 'Пока ничего — посмотри лупой, включи, проверь зарядку',
  pay: (n) => `Оплата ${usd(n)}`,
  prepaid: (n) => `предоплата ${usd(n)}`,
  win: (n) => `Заказ №${n} готов!`,
  earned: (n) => `+${usd(n)}`,
  quotes: ['Как новый! Спасибо!', 'Вы волшебник!', 'Ура, работает!', 'Огонь, спасибо огромное!', 'Буду всем вас советовать!'],
  mistakes: { sparks: 'искры', waste: 'лишние детали', returns: 'возвраты', hints: 'подсказка' },
  clean: 'Без единой ошибки',
  next: 'Следующий клиент',
  menu: (n, money) => `Починено: ${n} · ${usd(money)}`,
  stats: 'Мастерская',
  statRows: ['Починено', 'Заработано всего', 'Звёзд', 'На три звезды', 'Искр за всё время'],
  rank: 'Звание',
  ranks: [[0, 'Новичок'], [15, 'Подмастерье'], [45, 'Мастер'], [120, 'Профи'], [300, 'Легенда мастерской']],
  shop: 'Магазин запчастей',
  balance: 'На счету',
  stock: (n) => (n ? `на складе ${n}` : 'нет на складе'),
  prepayNote: 'Не хватает денег — клиент внесёт предоплату, её вычтут из оплаты.',
  broke: 'Не хватает денег',
  bought: (p) => `Куплено: ${T.names[p] ?? p}`,
  settings: 'Настройки',
  skin: 'Коврик',
  skins: { telegram: 'По умолчанию', green: 'Зелёный', blue: 'Силикон', wood: 'Верстак', night: 'Ночь' },
  options: 'Игра',
  marks: 'Показывать, где работает инструмент',
  nativeKbd: 'Использовать клавиатуру телефона',
  nativeKbdNote: 'В компьютере мастера — обычная клавиатура телефона вместо своей',
  cmdPlaceholder: 'команда, например devices',
  send: 'Ввод',
  howTo: 'Как играть',
  close: 'Закрыть',
  pc: 'Компьютер мастера',
  unplug: 'Отключить',
  pcHint: 'Подсказка',
  pcHintLine: (cmd) => `подсказка: ${cmd}`,
  progressLine: (k) => `[${'█'.repeat(k)}${'░'.repeat(10 - k)}] ${k * 10}%`,
  pcDone: 'Готово. Перезагрузка…',
  rules: [
    'К тебе несут сломанные смартфоны, кнопочные телефоны и приставки. Прочитай жалобу, найди поломку и почини.',
    'Выбери инструмент внизу и коснись детали. Фен и присоска снимают детали на клею, отвёртка — винты, лопатка — шлейфы, пинцет — детали.',
    'Прежде чем трогать шлейфы — обесточь: отключи батарею или вынь её. Иначе искра.',
    'Новые детали покупай в магазине 🛒 на деньги за заказы. Ставь только вместо сломанных.',
    'Прошивка — «ПК» в гнездо: в терминале devices, list и flash <файл>.',
    'Собери и нажми «Сдать». Без ошибок — три звезды и чаевые.',
  ],
  play: 'В мастерскую',
  soundOn: 'Выключить звук',
  soundOff: 'Включить звук',
  intro: {
    virus: ['Вирусы', 'Включи телефон кнопкой сбоку, возьми «Антивирус» и коснись экрана — потом дави найденных жуков. Разбирать ничего не нужно.'],
    'screen-crack': ['Разбитый экран', 'Купи экран в магазине 🛒. Сними крышку, открути экран платы, отключи батарею, потом шлейф экрана. Переверни, прогрей экран, сними присоской, поставь новый «Запчастями». Собери в обратном порядке.'],
    'port-dirty': ['Не заряжается', 'Проверь «Зарядкой» и посмотри «Лупой» в гнездо внизу. Иногда хватает кисточки.'],
    'battery-swollen': ['Вздутая батарея', 'Батарея раздулась и выдавливает крышку. Отключи её разъём лопаткой и только потом вынимай.'],
    'screen-flex': ['Чёрный экран без трещин', 'Возможно, просто отошёл шлейф. Найди его лупой и вставь обратно лопаткой — новый экран не нужен.'],
    'speaker-dust': ['Глухой звук', 'Включи телефон и послушай мелодию. Глухо — пыль в динамике, он под нижней планкой.'],
    'loose-battery': ['Не включается', 'После падения мог отойти разъём батареи. Вставить его на место — дело секунды.'],
    'camera-glass': ['Мутные фото', 'Посмотри лупой на стёклышко камеры сзади: если треснуло — менять нужно крышку, а не камеру.'],
    bootloop: ['Висит на логотипе', 'Это программа. Вставь «ПК» в гнездо: в терминале набери devices — узнаешь код модели, list — список прошивок, потом flash и имя самой свежей прошивки этой модели.'],
    'port-broken': ['Сгоревшая зарядка', 'Копоть в гнезде — плата зарядки сгорела. Она под нижней планкой, её шлейф отключай без батареи.'],
    water: ['Утопленник', 'Внутри покраснел индикатор влаги. Обесточь и отмой окисление на плате спиртом.'],
    'speaker-broken': ['Нет звука', 'Мелодии при включении нет совсем — динамик порван. Кисточка тут не поможет.'],
    'battery-worn': ['Гаснет сразу', 'Включается на миг и гаснет — батарея износилась. Лупа покажет ёмкость.'],
    'camera-module': ['Чёрная камера', 'Стёклышко целое? Тогда сгорел модуль камеры. Его шлейф — под экраном платы.'],
    'stick-drift-l': ['Дрейф стика', 'Включи — курсор в меню ползёт сам. Модули стиков под задней крышкой: сзади всё зеркально, левый стик — справа.'],
    'ssd-dead': ['Система не найдена', 'Диск сломан: замени его, а новый придёт пустым — систему поставь с компьютера (flash).'],
    'joy-drift-r': ['Дрейф контроллера', 'Контроллеры снимаются пинцетом без разборки. Сзади они меняются местами — смотри внимательно.'],
    'umd-dead': ['Не читает диски', 'Корпус открывается только без батареи: дверца, батарея, потом 4 винта. Так и правильно — без питания искр не будет.'],
    'cart-dirty': ['Не видит картриджи', 'Щель картриджа — на верхнем торце. Почисть её кисточкой снаружи.'],
  },
  kindIntro: {
    button: ['Кнопочный телефон', 'Крышка и батарея снимаются руками — пинцетом. Вынул батарею — обесточил, шлейфы можно трогать. Спереди: панель, клавиатура, пластина на винтах, экран.'],
    deck: ['ПарДек', 'Портативный компьютер: крышка на четырёх винтах, внутри батарея со шлейфом, вентилятор, диск и модули стиков.'],
    switch: ['Свичер', 'Приставка с контроллерами по бокам: их снимают пинцетом, крышка — только без них.'],
    psp: ['Карманка', 'Карманная приставка с дисками: батарея за дверцей, корпус — на винтах.'],
    earbuds: ['Наушники-вкладыши', 'Кейс склеен — фен и присоска. Тихий наушник — сера на сеточке, почисти кисточкой. Молчит совсем — нужен новый.'],
    mouse: ['Мышь', 'Снизу: дверца с батарейкой и ножки, под ножками — винты. Корпус открывается только без батарейки. Двойной клик — изношенный микрик.'],
    keyboard: ['Клавиатура', 'Батареи нет — искр не будет. Колпачки снимаются пинцетом, под ними крошки (кисточка) и липкое (спирт). Прошивка — через ПК.'],
    headphones: ['Накладные наушники', 'Амбушюры снимаются руками. Батарея — в левой чашке: отключи её, прежде чем трогать шлейфы динамиков.'],
    tablet: ['Планшет', 'Как большой смартфон: крышка на клею, экран платы на винтах, батарея со шлейфом.'],
    gamepad: ['Геймпад', 'Корпус на четырёх винтах. Сзади всё зеркально: левый стик — справа. Липкие кнопки отмывают изнутри — без батареи.'],
    powerbank: ['Пауэрбанк', 'Внутри — банки аккумулятора со шлейфом и плата. Вздутые банки — сразу под замену.'],
    hdd: ['Жёсткий диск', 'Крышка и плата — на винтах. Щелчки — головки, битые сектора — пластина. Команда test на ПК подскажет, что не так.'],
    watch: ['Умные часы', 'Крышка с датчиком — на клею. Не меряет пульс — почисти датчик кисточкой.'],
    laptop: ['Ноутбук', 'Дно на винтах, под ним батарея, вентилятор, память и диск. Липкая клавиатура — спирт, спереди.'],
    speaker: ['Умная колонка', 'Тканевая сетка снимается руками, под ней динамик. Не слышит команды — микрофоны под дном.'],
    gpu: ['Видеокарта', 'Кожух на винтах → вентиляторы → радиатор → чип. Перегрев: пыль, высохшая термопаста или вентилятор. ПК проверит командой test.'],
    motherboard: ['Материнская плата', 'Батарейка BIOS, память и радиатор питания с конденсатором под ним. Вздутый конденсатор — под замену.'],
    cpu: ['Процессор', 'Кулер на винтах, под ним термопаста. Погнутые ножки сзади выпрямляют пинцетом.'],
    drone: ['Квадрокоптер', 'Сначала пропеллеры, потом крышка на винтах. Батарея снизу съёмная — вынул и можно трогать шлейфы.'],
    vr: ['VR-шлем', 'Со стороны лица — накладка с линзами, под ней экран. Снаружи панель на винтах: батарея и вентилятор.'],
    camera: ['Фотоаппарат', 'Объектив снимается, под ним затвор. Экран — сзади. Карта памяти и шлейф экрана — под дверцей батареи.'],
    ereader: ['Электронная книга', 'Крышка на защёлках, под ней батарея и шлейфы. Экран на клею — спереди.'],
  },
};

function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (b >= 11 && b <= 14) return many;
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

const usd = (n) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  flip: svgIcon('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>'),
  hint: svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z"/>'),
  deliver: svgIcon('<path d="M20 6 9 17l-5-5"/>'),
  shop: svgIcon('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>'),
  stats: svgIcon('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>'),
  gear: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  soundOn: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svgIcon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  back: svgIcon('<path d="M20 12H8"/><path d="m12 6-6 6 6 6"/>'),
  enter: svgIcon('<path d="M20 5v7a3 3 0 0 1-3 3H6"/><path d="m10 11-4 4 4 4"/>'),
};

const defaultSettings = () => ({ skin: 'telegram', marks: true, nativeKbd: false });

let api = null;
let host = null;
let root = null;
let ui = null;
let toast = null;
let fx = null;
let game = null;
let progress = normProgress(null);
let settings = defaultSettings();
let seen = [];
let soundOn = true;
let tool = '';
let modalActive = false;
let modalToken = 0;
let busy = 0;                            // идут анимации — касания сцены ждут
let pd = null;                           // нажатие: { id, x, y, target, mode, last }
let overlay = '';                        // временное состояние экрана: scan, clean, charge, empty, flash, logo
let heatLevel = {};
let scrubbed = 0;
let mood = 'calm';
let moodTimer = 0;
let bubbleTimer = 0;
let hintShown = null;
let bugs = [];
let bugRaf = 0;
let bugLast = 0;
let adsGone = new Map();                 // закрытая реклама → когда вернётся
let pc = null;                           // открытый компьютер: { lines, input, history, at, box, busy }
const timers = new Set();
const audio = createAudio(createSounds);
const lastSound = new Map();

function sfx(name, opts, gap = 30) {
  if (!soundOn) return;
  const t = performance.now();
  if (gap && t - (lastSound.get(name) ?? -1e9) < gap) return;
  lastSound.set(name, t);
  try {
    audio.get()?.play(name, opts);
  } catch (err) {
    console.warn('звук', name, err);
  }
}

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

const wait = (ms) => new Promise((resolve) => later(resolve, reducedMotion() ? 0 : ms));

function svgEl(tag, attrs = {}, html = '') {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html) node.innerHTML = html;
  return node;
}

function save() {
  if (!api || !game || game.done) return;
  api.storage.set('current', game);
}

const saveProgress = () => api?.storage.set('progress', progress);
const tutorialAuto = () => game && game.level <= AUTO_HINT;
const D = () => DEVICES[game.kind];
const L = () => LAYOUTS[game.kind];

// ---------- сцена: постройка ----------

/** Узлы сцены одного заказа. */
let S = null;

function buildScene() {
  const svg = ui.svg;
  const l = L();
  const d = D();
  const slots = (side) => (l.ORDER[side] ?? []).map((p) => {
    if (p === 'plugs') return '<g class="pr-plugs"></g>';
    // винты — сразу над своей деталью
    const screws = screwsOf(game.kind, p).map((id) => `<g data-screwslot="${id}"></g>`).join('');
    return `<g data-slot="${p}"></g>${screws}`;
  }).join('');
  const dish = (x, y, w, h) => `<rect class="pr-dish" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`;
  const cells = Object.values(l.MAT_CELL).map(([x, y]) => `<circle class="pr-mat-cell" cx="${x}" cy="${y}" r="11"/>`).join('');
  svg.innerHTML = `${defs()}<g class="pr-traybg">${l.DISHES.map((b) => dish(...b)).join('')}
${cells ? `<rect class="pr-mat" x="${l.MAT.x}" y="${l.MAT.y}" width="${l.MAT.w}" height="${l.MAT.h}" rx="10"/>${cells}` : ''}</g>
<g class="pr-flipper">
  <g class="pr-side pr-back">${l.backBody(game)}${slots('back')}</g>
  <g class="pr-side pr-front">${l.frontBody(game)}${slots('front')}<g class="pr-bugs"></g>${l.frontTop ? l.frontTop(game) : ''}</g>
  <g class="pr-edge">${slots('edge')}</g>
</g>
<g class="pr-traylayer"></g>
<g class="pr-marks"></g>
<g class="pr-flylayer"></g>`;
  svg.dataset.kind = game.kind;
  // цвет модели — на самом SVG: градиенты в <defs> берут переменные от своих предков, а не от места использования
  svg.classList.forEach((c) => { if (c.startsWith('pr-col-')) svg.classList.remove(c); });
  svg.classList.add(`pr-col-${game.model.color}`);
  S = {
    flipper: svg.querySelector('.pr-flipper'),
    tray: svg.querySelector('.pr-traylayer'),
    fly: svg.querySelector('.pr-flylayer'),
    marks: svg.querySelector('.pr-marks'),
    bugs: svg.querySelector('.pr-bugs'),
    slots: Object.fromEntries([...svg.querySelectorAll('[data-slot]')].map((g) => [g.dataset.slot, g])),
    screwSlots: Object.fromEntries([...svg.querySelectorAll('[data-screwslot]')].map((g) => [g.dataset.screwslot, g])),
    parts: {},
    plugs: {},
    screws: {},
  };
  S.flipper.style.transformOrigin = `${l.origin[0]}px ${l.origin[1]}px`;
  for (const p of Object.keys(d.parts)) {
    const node = svgEl('g', { class: 'pr-part', 'data-part': p });
    node.append(svgEl('g', { class: 'pr-inner' }, l.part(p, game)));
    S.parts[p] = node;
  }
  for (const c of Object.keys(d.conns)) {
    const side = d.conns[c].side;
    const layer = svg.querySelector(`.pr-${side} .pr-plugs`);
    const node = svgEl('g', { class: 'pr-plugnode', 'data-plug': c }, l.plug(c));
    layer.append(node);
    S.plugs[c] = node;
  }
  for (const id of Object.keys(d.screws)) {
    const node = svgEl('g', { class: 'pr-screwnode', 'data-screw': id });
    node.append(svgEl('g', { class: 'pr-inner' }, l.screw(id)));
    S.screws[id] = node;
  }
  for (const p of Object.keys(d.parts)) putNode(p);
  for (const id of Object.keys(d.screws)) putScrew(id);
  stopBugs();
  bugs = [];
  adsGone = new Map();
  overlay = '';
  paint();
}

// ---------- места деталей ----------

const HOME = { x: 0, y: 0, s: 1 };
const placeAt = (cx, cy, tx, ty, s) => ({ x: tx - cx * s, y: ty - cy * s, s });
const isEdge = (p) => D().parts[p]?.side === 'edge';

/**
 * Место детали на устройстве. «Край» сзади — зеркальное отражение относительно центра переворота (scale −1 по X):
 * левый контроллер встаёт справа и скруглением наружу, а не просто переезжает (владелец, 2026-10-05: «неправильно
 * выворачиваются контроллеры»).
 */
function homePlace(p) {
  if (!isEdge(p) || game.view === 'front') return HOME;
  return { x: 2 * L().origin[0], y: 0, s: 1, sx: -1 };
}

/** Рамка детали на сцене сейчас (с учётом стороны у «края»). */
function boxOf(p) {
  const b = L().BOX[p];
  if (!b) return null;
  const h = homePlace(p);
  return h.sx === -1 ? { x: h.x - b.x - b.w, y: b.y, w: b.w, h: b.h } : { x: b.x + h.x, y: b.y, w: b.w, h: b.h };
}

function trayPlace(p) {
  const b = L().BOX[p];
  const t = L().TRAY[p];
  const s = Math.min(t.w / b.w, t.h / b.h);
  return placeAt(b.x + b.w / 2, b.y + b.h / 2, t.cx, t.cy, s);
}

/** Откуда приезжает новая деталь — из коробки над сценой. */
function boxPlace(p) {
  const b = L().BOX[p];
  return placeAt(b.x + b.w / 2, b.y + b.h / 2, W / 2, -b.h / 2 - 20, 1);
}

function screwPlace(id) {
  if (game.screws[id]) return HOME;
  const [hx, hy] = L().SCREW_AT[id];
  const [mx, my] = L().MAT_CELL[id];
  return placeAt(hx, hy, mx, my, 1.3);
}

const scaleOf = (p) => (p.sx === -1 ? `${-p.s} ${p.s}` : String(+p.s.toFixed(4)));

function setPlace(node, p) {
  node.style.translate = `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`;
  node.style.scale = scaleOf(p);
  node._place = p;
}

function putNode(p) {
  const node = S.parts[p];
  const gone = !game.parts[p].in && D().parts[p].consumable;
  const into = game.parts[p].in || gone ? S.slots[p] : S.tray;
  if (node.parentNode !== into) into.append(node);
  node.classList.toggle('pr-wiped', gone);
  setPlace(node, game.parts[p].in || gone ? homePlace(p) : trayPlace(p));
}

function putScrew(id) {
  const node = S.screws[id];
  const into = game.screws[id] ? S.screwSlots[id] : S.tray;
  if (node.parentNode !== into) into.append(node);
  setPlace(node, screwPlace(id));
}

/** Полёт узла по дуге; на время полёта — в слое полёта (поверх всего), по прилёте — в into. */
async function flyNode(node, to, into, { dur = 420, arc = 26, grow = 1.08 } = {}) {
  const from = node._place ?? HOME;
  setPlace(node, to);
  if (reducedMotion()) {
    into.append(node);
    return;
  }
  S.fly.append(node);
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arc, s: Math.max(from.s, to.s) * grow, sx: to.sx ?? from.sx };
  const frame = (p) => ({ translate: `${p.x}px ${p.y}px`, scale: scaleOf(p) });
  busy++;
  try {
    await animate(node, [frame(from), { ...frame(mid), offset: 0.45 }, frame(to)], { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' });
  } finally {
    busy--;
  }
  if (S && node.isConnected) into.append(node);
}

// ---------- сцена: перерисовка по состоянию ----------

function screenMode() {
  if (!game.parts.display?.in) return 'off';
  if (overlay) return overlay;
  const s = screenOf(game);
  return s === 'none' ? 'off' : s;
}

/** Куда дрейфует курсор на экране (сломан стик): l, r или ''. */
function driftOf() {
  const P = game.parts;
  for (const [id, dir] of [['stickL', 'l'], ['joyL', 'l'], ['nub', 'l'], ['stickR', 'r'], ['joyR', 'r']]) {
    if (P[id] && P[id].in && P[id].broken) return dir;
  }
  return '';
}

function paint() {
  if (!ui || !game || !S) return;
  const svg = ui.svg;
  const d = D();
  svg.dataset.view = game.view;
  svg.dataset.lid = game.lid ?? '';
  const P = game.parts;
  for (const k of Object.keys(d.spots)) svg.classList.toggle(`pr-d-${k}`, game.dirt[k]);
  for (const k of ['jack', 'speaker', 'board', 'keys', 'fan', 'slot']) if (!(k in d.spots)) svg.classList.remove(`pr-d-${k}`);
  svg.querySelectorAll('.pr-spot').forEach((n) => n.classList.toggle('pr-spot-on', Boolean(game.dirt[n.dataset.spot])));
  svg.classList.toggle('pr-wet', game.wet);
  svg.classList.toggle('pr-on', game.power);
  svg.classList.toggle('pr-swollen', Boolean(d.battery) && P[d.battery].in && P[d.battery].broken === 'swollen');
  svg.classList.toggle('pr-burnt', Boolean(d.port) && P[d.port].in && Boolean(P[d.port].broken));
  svg.classList.toggle('pr-no-port', Boolean(d.port) && !P[d.port].in);
  for (const c of Object.keys(d.conns)) {
    const node = S.plugs[c];
    node.dataset.state = game.conns[c];
    const owner = Object.keys(d.parts).find((p) => d.parts[p].conn === c);
    node.classList.toggle('pr-gone', !P[owner].in);
  }
  for (const p of Object.keys(game.hot)) S.parts[p].style.setProperty('--heat', String(game.hot[p] ? 1 : heatLevel[p] ?? 0));
  const disp = S.parts.display;
  let showAds = false;
  if (disp) {
    disp.dataset.screen = screenMode();
    disp.dataset.drift = disp.dataset.screen === 'home' ? driftOf() : '';
    showAds = Boolean(d.virus) && game.virus > 0 && disp.dataset.screen === 'home';
    disp.dataset.virus = showAds ? '1' : '0';
    const now = performance.now();
    disp.querySelectorAll('.pr-ad').forEach((ad) => ad.classList.toggle('pr-ad-gone', (adsGone.get(ad.dataset.ad) ?? 0) > now));
  }
  // жуки видны только на рабочем экране; после перезапуска игры найденные антивирусом — снова на месте
  if (S.bugs) S.bugs.style.display = showAds ? '' : 'none';
  if (showAds && game.scanned && !bugs.some((b) => !b.dead)) spawnBugs(game.virus);
  paintTicket();
  paintTools();
  paintMarks();
}

function paintTicket() {
  const st = starsFor(game);
  ui.stars.forEach((star, k) => star.classList.toggle('pr-star-off', k >= st));
  ui.sub.textContent = T.sub(game.level, progress.money);
  ui.pay.textContent = T.pay(game.pay);
  ui.flipBtn.classList.toggle('pr-flipped', game.view === 'front');
}

function paintTools() {
  ui.toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
}

// ---------- клиент ----------

function complaintText() {
  return game.complaint.map(([f, k]) => complaintsFor(game.kind, f)[k]).join(' ');
}

function setMood(m, ms = 0) {
  clearTimeout(moodTimer);
  mood = m;
  ui.avatar.innerHTML = avatar(game.customer, m);
  if (ms) moodTimer = later(() => { if (ui && game) setMood('calm'); }, ms);
}

function buildTicket() {
  ui.name.textContent = `${game.customer.name} · ${game.model.name}`;
  ui.complaint.textContent = complaintText();
  setMood('calm');
}

// ---------- попадание пальцем ----------

function toScene(clientX, clientY) {
  const m = ui.svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return [p.x, p.y];
}

function toStage([x, y]) {
  const m = ui.svg.getScreenCTM();
  const r = ui.stage.getBoundingClientRect();
  if (!m) return [0, 0];
  const p = new DOMPoint(x, y).matrixTransform(m);
  return [p.x - r.left, p.y - r.top];
}

const rect = (b) => ({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h });
const circ = ([cx, cy], r) => ({ kind: 'circle', cx, cy, r });
const viewOf = (o) => (o && !Array.isArray(o) && ('front' in o || 'back' in o) ? o[game.view] : o);

function trayRect(p) {
  const b = L().BOX[p];
  const pl = trayPlace(p);
  return { kind: 'rect', x: b.x * pl.s + pl.x, y: b.y * pl.s + pl.y, w: b.w * pl.s, h: b.h * pl.s };
}

/** Деталь открыта: всё, что её закрывает, снято. */
const exposed = (p) => D().parts[p].blockers.every((b) => !game.parts[b].in);
const onView = (side) => side === 'any' || side === 'edge' || side === game.view;

/** Все цели, которые сейчас можно задеть. prio — кто главнее при наложении. */
function targets() {
  const s = game;
  const d = D();
  const l = L();
  const list = [];
  const add = (target, shape, prio) => shape && list.push({ target, prio, ...shape });
  for (const p of Object.keys(d.parts)) if (!s.parts[p].in && !d.parts[p].consumable) add(p, trayRect(p), 6);
  for (const id of Object.keys(d.screws)) if (!s.screws[id]) add(id, circ(l.MAT_CELL[id], 13), 7);
  const btn = viewOf(l.BUTTON);
  if (btn) add('button', rect(btn), 8);
  const jack = l.JACK && viewOf(l.JACK);
  if (jack && !d.noJack) add('jack', rect(jack), 5);
  for (const [k, b] of Object.entries(l.SPOT_BOX ?? {})) {
    const sb = viewOf(b);
    const sp = d.spots[k];
    if (sb && (!sp || sp.under.every((u) => !s.parts[u].in))) add(k, rect(sb), 5);
  }
  const order = [...(l.ORDER.back ?? []), ...(l.ORDER.front ?? [])];
  const lidShut = d.lid && s.lid === 'closed';
  if (d.lid && s.view === 'front') add('lid', rect(lidShut ? l.LID.closed : l.LID.open), 8);
  for (const [p, ps] of Object.entries(d.parts)) {
    if (!onView(ps.side) || !exposed(p)) continue;
    if (lidShut && ps.side === 'front') continue;
    const layer = order.indexOf(p) * 0.01;
    // стоящая деталь — чем выше слой, тем главнее; пустые места — все равны, выигрывает меньшее (иначе место снятой
    // крышки во весь корпус перехватывало нажатие по месту камеры)
    add(p, rect(boxOf(p)), s.parts[p].in ? 2 + (isEdge(p) ? 1 : 0) + layer : 0);
  }
  for (const [id, holder] of Object.entries(d.screws)) {
    if (s.parts[holder].in && onView(d.parts[holder].side) && exposed(holder)) add(id, circ(l.SCREW_AT[id], 14), 9);
  }
  for (const [c, cs] of Object.entries(d.conns)) {
    if (cs.side === s.view && cs.under.every((u) => !s.parts[u].in)) add(c, circ(l.CONN_AT[c], 15), 9);
  }
  const board = d.spots.board;
  if (board && board.side === s.view && board.under.every((u) => !s.parts[u].in)) add('board', rect(l.BOX.board), 1.5);
  if (d.indicator && s.view === 'back' && !s.parts.cover.in) add('indicator', rect(l.BOX.indicator), 5);
  if (s.view === 'front') {
    bugs.forEach((b, k) => { if (!b.dead) add(`bug:${k}`, circ([b.x, b.y], 18), 11); });
    if (l.ADS && S.parts.display?.dataset.virus === '1') {
      const now = performance.now();
      l.ADS.forEach((pt, k) => { if ((adsGone.get(String(k)) ?? 0) <= now) add(`ad:${k}`, circ(pt, 13), 10); });
    }
  }
  return list;
}

function hitTest(pt) {
  if (!pt) return null;
  const [x, y] = pt;
  let best = null;
  let bestArea = Infinity;
  let near = null;
  let nearD = 22;
  for (const t of targets()) {
    let inside;
    let area;
    if (t.kind === 'rect') {
      inside = x >= t.x - 3 && x <= t.x + t.w + 3 && y >= t.y - 3 && y <= t.y + t.h + 3;
      area = t.w * t.h;
    } else {
      const dd = Math.hypot(x - t.cx, y - t.cy);
      inside = dd <= t.r;
      area = Math.PI * t.r * t.r;
      if (!inside && dd - t.r < nearD) {
        nearD = dd - t.r;
        near = t;
      }
    }
    if (inside && (!best || t.prio > best.prio || (t.prio === best.prio && area < bestArea))) {
      best = t;
      bestArea = area;
    }
  }
  return best?.target ?? near?.target ?? null;
}

/**
 * Цель с поправкой на инструмент: отвёртка по крышке — её винт или «сначала сними», лопатка по детали — её шлейф или
 * шлейф под ней, кисточка и спирт — пятно на детали или под ней, антивирус — экран.
 */
function mapTarget(t, target) {
  const d = D();
  const ps = d.parts[target];
  if (target === 'display' && t === 'antivirus') return 'screen';
  if (!ps) return target;
  if (t === 'screwdriver') {
    const own = screwsOf(game.kind, target);
    if (own.length) return own.find((id) => game.screws[id]) ?? own[0];
    const under = Object.keys(d.screws).find((id) => d.parts[d.screws[id]].blockers.includes(target));
    return under ?? target;
  }
  if (t === 'spudger') {
    if (ps.conn) return ps.conn;
    const under = Object.keys(d.conns).find((c) => d.conns[c].under.includes(target));
    return under ?? target;
  }
  if (t === 'brush' || t === 'alcohol') {
    const on = Object.keys(d.spots).find((k) => k === target || (d.spots[k].part === target && d.spots[k].side !== 'any'));
    if (on) return on;
    const under = Object.keys(d.spots).find((k) => d.spots[k].under.includes(target) && d.spots[k].tool === t)
      ?? Object.keys(d.spots).find((k) => d.spots[k].under.includes(target));
    return under ?? target;
  }
  return target;
}

const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

/** Центр цели в координатах сцены — для подсветок и всплывашек; slot — снятая деталь: её место на устройстве. */
function centerOf(target, slot = false) {
  const d = D();
  const l = L();
  if (d.screws[target]) return game.screws[target] ? l.SCREW_AT[target] : l.MAT_CELL[target];
  if (d.conns[target]) return l.CONN_AT[target];
  if (target === 'jack') return center(viewOf(l.JACK) ?? l.JACK?.back ?? l.JACK?.front ?? boxOf(Object.keys(d.parts)[0]));
  if (target === 'button') return center(viewOf(l.BUTTON) ?? l.BUTTON?.front ?? l.BUTTON?.back ?? boxOf(Object.keys(d.parts)[0]));
  if (target === 'lid' && d.lid) return center(game.lid === 'closed' ? l.LID.closed : l.LID.open);
  if (target === 'screen') return center(l.SCREEN ?? boxOf(Object.keys(d.parts)[0]));
  if (target === 'bug') {
    const b = bugs.find((x) => !x.dead);
    return b ? [b.x, b.y] : centerOf('screen');
  }
  if (d.parts[target]) {
    if (!game.parts[target].in && !slot) return [l.TRAY[target].cx, l.TRAY[target].cy];
    return center(boxOf(target));
  }
  if (l.SPOT_AT?.[target]) return viewOf(l.SPOT_AT[target]) ?? l.SPOT_AT[target].front ?? l.SPOT_AT[target].back;
  if (l.SPOT_BOX?.[target]) return center(viewOf(l.SPOT_BOX[target]) ?? l.SPOT_BOX[target].front ?? l.SPOT_BOX[target].back);
  if (l.BOX[target]) return center(l.BOX[target]);
  return centerOf('screen');
}

// ---------- подсветки: куда подходит инструмент, подсказка ----------

function applicable(t, target) {
  const d = D();
  const P = game.parts;
  switch (t) {
    case 'heat':
    case 'suction': return Boolean(d.parts[target]?.glue) && P[target].in;
    case 'screwdriver': return Boolean(d.screws[target]);
    case 'spudger': return Boolean(d.conns[target]);
    case 'tweezers': return (Boolean(d.parts[target]) && !d.parts[target].glue && !d.parts[target].wipe) || d.spots[target]?.tool === 'tweezers';
    case 'parts': return Boolean(d.parts[target]) && !P[target].in && d.parts[target].price > 0;
    case 'brush':
    case 'alcohol': return Object.entries(d.spots).some(([k, sp]) => sp.tool === t && (k === target || sp.part === target))
      || (t === 'alcohol' && Boolean(d.parts[target]?.wipe) && P[target].in);
    case 'charger':
    case 'flash': return target === 'jack' && !d.noJack;
    case 'antivirus': return Boolean(d.virus) && target === 'display' && P.display?.in && game.power;
    default: return false;
  }
}

function paintMarks() {
  if (!S) return;
  S.marks.querySelectorAll('.pr-mark, .pr-hint-ring').forEach((n) => n.remove());
  if (tool && settings.marks && !busy) {
    const seenT = new Set();
    for (const t of targets()) {
      if (seenT.has(t.target) || !applicable(tool, t.target)) continue;
      const m = mapTarget(tool, t.target);
      if (reach(game, m) && !(game.parts[m] && !game.parts[m].in)) continue;
      seenT.add(t.target);
      const [x, y] = centerOf(t.target, tool === 'parts');
      S.marks.append(svgEl('circle', { class: 'pr-mark', cx: x, cy: y, r: 5 }));
    }
  }
  if (hintShown?.target && hintShown.tool !== 'flash' && hintShown.tool !== 'buy') {
    const [x, y] = centerOf(hintShown.target, hintShown.tool === 'parts');
    S.marks.append(svgEl('circle', { class: 'pr-hint-ring', cx: x, cy: y, r: 16 }));
  } else if (hintShown?.tool === 'flash') {
    const [x, y] = centerOf('jack');
    S.marks.append(svgEl('circle', { class: 'pr-hint-ring', cx: x, cy: y, r: 16 }));
  }
}

function clearHint() {
  hintShown = null;
  ui.toolBtns.forEach((b) => b.classList.remove('pr-hinted'));
  [ui.flipBtn, ui.deliverBtn, ui.shopBtn].forEach((b) => b.classList.remove('pr-hinted'));
}

function showHint(free) {
  if (!game || game.done) return;
  const st = nextStep(game, progress);
  if (!st) return;
  if (!free) {
    if (!game.hints) toast.show(T.hintNote, 2200);
    game.hints++;
    save();
    sfx('hint', {}, 0);
  }
  clearHint();
  hintShown = st;
  if (st.tool === 'flip') ui.flipBtn.classList.add('pr-hinted');
  else if (st.tool === 'deliver') ui.deliverBtn.classList.add('pr-hinted');
  else if (st.tool === 'buy') ui.shopBtn.classList.add('pr-hinted');
  else if (st.tool !== 'power' && st.tool !== 'squash') {
    if (tool !== st.tool) ui.toolBtns.find((b) => b.dataset.tool === st.tool)?.classList.add('pr-hinted');
  }
  paintTicket();
  paintMarks();
}

// ---------- всплывашка у цели ----------

function bubble(text, at, ms = 1800, kind = '') {
  if (!text || !ui) return;
  const [x, y] = toStage(at ?? [W / 2, H / 2]);
  const r = ui.stage.getBoundingClientRect();
  const b = ui.bubble;
  b.textContent = text;
  b.className = `pr-bubble${kind ? ` pr-bubble-${kind}` : ''}`;
  b.hidden = false;
  const bw = b.offsetWidth;
  const bh = b.offsetHeight;
  b.style.left = `${clamp(x - bw / 2, 6, r.width - bw - 6)}px`;
  b.style.top = `${clamp(y - bh - 18, 6, r.height - bh - 6)}px`;
  animate(b, [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 160, easing: 'ease-out' });
  clearTimeout(bubbleTimer);
  bubbleTimer = later(() => {
    if (!ui) return;
    animate(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).then(() => { if (ui && b.textContent === text) b.hidden = true; });
  }, ms);
}

// ---------- эффекты ----------

function sparkFx(at) {
  const [x, y] = toStage(at);
  if (!reducedMotion()) {
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      fx.lightning(x, y, x + Math.cos(a) * 34, y + Math.sin(a) * 34, '#ffd54a', { life: 0.35, width: 2 });
    }
    fx.burst(x, y, '#ffe27a', 10, { speed: 200, size: 4 });
    animate(ui.flash, [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], { duration: 260 });
  }
  sfx('spark', {}, 0);
  api.platform.haptic.notification('error');
  setMood('shock', 1600);
  starShake();
}

function starShake() {
  const st = starsFor(game);
  const star = ui.stars[clamp(st, 0, 2)];
  if (star && !reducedMotion()) animate(star, [{ scale: '1' }, { scale: '1.5' }, { scale: '1' }], { duration: 360, easing: 'ease-out' });
}

function sparkle(at, color = '#ffffff', n = 10) {
  const [x, y] = toStage(at);
  fx.burst(x, y, color, n, { speed: 140, size: 4 });
}

function nudge(node) {
  if (!node || reducedMotion()) return;
  animate(node, [{ translate: '0 0' }, { translate: '-3px 0' }, { translate: '3px 0' }, { translate: '-2px 0' }, { translate: '0 0' }], { duration: 240, easing: 'ease-out' });
}

function innerOf(target) {
  if (S.screws[target]) return S.screws[target].firstChild;
  if (S.parts[target]) return S.parts[target].firstChild;
  if (S.plugs[target]) return S.plugs[target];
  return null;
}

/** Нельзя: мягкий «бум», покачивание и объяснение. */
function refuse(r, target) {
  const w = T.why[r.why];
  const text = typeof w === 'function' ? w(r.by ?? r.need) : w ?? '';
  if (r.why === 'flip') {
    ui.flipBtn.classList.add('pr-hinted');
    later(() => ui?.flipBtn.classList.remove('pr-hinted'), 1600);
  }
  if (!text) return;
  sfx('error', {}, 120);
  api.platform.haptic.notification('warning');
  nudge(innerOf(target));
  bubble(text, centerOf(target), 2000);
}

// ---------- действия ----------

const canTouch = () => game && !game.done && !modalActive && !busy;

function pickTool(t) {
  if (!game || game.done) return;
  audio.get();
  tool = tool === t ? '' : t;
  sfx('tool');
  api.platform.haptic.selection();
  paintTools();
  paintMarks();
  if (tool && progress.level <= 3 && !seen.includes(`tool:${tool}`)) {
    seen.push(`tool:${tool}`);
    api.storage.set('seen', seen);
    toast.show(T.toolHints[tool], 2000);
  }
}

/** Ход сделан: сохранить, перерисовать, обновить подсказку и звёзды. */
function after() {
  save();
  paint();
  if (tutorialAuto()) showHint(true);
}

async function doTool(target) {
  if (!canTouch()) return;
  if (target === 'button') {
    await doPower();
    return;
  }
  // крышка ноутбука (у диска «lid» — обычная деталь)
  if (target === 'lid' && DEVICES[game.kind].lid) {
    await doLid();
    return;
  }
  if (target.startsWith('bug:')) {
    squash(Number(target.slice(4)));
    return;
  }
  if (target.startsWith('ad:')) {
    closeAd(target.slice(3));
    return;
  }
  if (!tool) {
    bubble(T.pickTool, centerOf(target), 1400);
    ui.tools.classList.remove('pr-pulse');
    void ui.tools.offsetWidth;
    ui.tools.classList.add('pr-pulse');
    return;
  }
  if (tool === 'flash') {
    if (target !== 'jack') {
      refuse({ why: 'charger-where' }, target);
      return;
    }
    clearHint();
    await openPc();
    return;
  }
  const t = mapTarget(tool, target);
  const used = tool;
  const r = act(game, used, t, progress);
  if (!r.ok) {
    if (r.why === 'no-stock') {
      sfx('error', {}, 0);
      toast.show(T.noStock(t), 1800);
      showShop(t);
      return;
    }
    refuse(r, t);
    return;
  }
  clearHint();
  busy++;
  try {
    await perform(used, t, r);
  } finally {
    busy--;
  }
  if (!ui) return;
  after();
}

/** Показать сделанное: анимации и звуки по инструменту. */
async function perform(t, target, r) {
  switch (t) {
    case 'heat': {
      heatLevel[target] = 1;
      sfx('heated', {}, 0);
      if (!r.already) bubble(T.heated, centerOf(target), 1200);
      paint();
      break;
    }
    case 'suction': {
      sfx('suction', {}, 0);
      api.platform.haptic.impact('medium');
      const node = S.parts[target];
      if (!reducedMotion()) await animate(node.firstChild, [{ scale: '1' }, { scale: '1.03' }], { duration: 160, easing: 'ease-out' });
      if (target === 'display') overlay = '';
      await flyNode(node, trayPlace(target), S.tray, { dur: 480, arc: 40 });
      sfx('place', {}, 0);
      break;
    }
    case 'screwdriver': {
      const node = S.screws[target];
      if (r.in) {
        await flyNode(node, HOME, S.screwSlots[target], { dur: 360, arc: 18, grow: 1.2 });
        sfx('screw', {}, 0);
        if (!reducedMotion()) await animate(node.firstChild, [{ rotate: '-540deg' }, { rotate: '0deg' }], { duration: 380, easing: 'ease-out' });
        api.platform.haptic.impact('light');
      } else {
        sfx('unscrew', {}, 0);
        api.platform.haptic.selection();
        if (!reducedMotion()) {
          await animate(node.firstChild, [{ rotate: '0deg', scale: '1' }, { rotate: '-540deg', scale: '1.25' }], { duration: 380, easing: 'ease-in' });
        }
        await flyNode(node, screwPlace(target), S.tray, { dur: 380, arc: 22 });
        sfx('clink', {}, 0);
      }
      break;
    }
    case 'spudger': {
      paint();
      if (r.spark) {
        sparkFx(L().CONN_AT[target]);
        bubble(T.spark, L().CONN_AT[target], 2200, 'bad');
      } else {
        sfx(r.state === 'on' ? 'plug' : 'unplug', {}, 0);
        api.platform.haptic.impact('light');
      }
      await wait(180);
      break;
    }
    case 'tweezers': {
      if (r.cleaned) {
        paint();
        sfx('clean', {}, 0);
        sparkle(centerOf(target), '#ffe08a', 12);
        break;
      }
      const node = S.parts[target];
      sfx('lift', {}, 0);
      if (r.removed) await flyNode(node, trayPlace(target), S.tray, { dur: 440, arc: 34 });
      else {
        await flyNode(node, homePlace(target), S.slots[target], { dur: 440, arc: 34 });
        landBump(node);
      }
      sfx('place', {}, 0);
      api.platform.haptic.impact('light');
      break;
    }
    case 'parts': {
      const node = S.parts[target];
      // старая — в мусор, новая — из коробки сверху
      if (!reducedMotion()) await animate(node, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in' });
      node.firstChild.innerHTML = L().part(target, game);
      node.classList.remove('pr-wiped');
      setPlace(node, boxPlace(target));
      S.fly.append(node);
      sfx('newpart', {}, 0);
      await flyNode(node, homePlace(target), S.slots[target], { dur: 560, arc: 0, grow: 1 });
      landBump(node);
      sparkle(centerOf(target), '#fff6c8', 12);
      api.platform.haptic.impact('medium');
      saveProgress();
      if (r.wasted) {
        later(() => {
          if (!ui) return;
          sfx('error', {}, 0);
          setMood('sad', 1600);
          starShake();
          bubble(T.wasted, centerOf(target), 2000, 'bad');
        }, 250);
      }
      break;
    }
    case 'brush':
    case 'alcohol': {
      if (r.wiped) {
        // старую термопасту — стереть: тает на месте
        const node = S.parts[target];
        if (!reducedMotion()) await animate(node.firstChild, [{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: 'ease-in' });
        putNode(target);
        sfx('fizz', {}, 0);
        sparkle(centerOf(target), '#bfe6ff', 12);
        break;
      }
      paint();
      sfx('clean', {}, 0);
      sparkle(centerOf(target), t === 'alcohol' ? '#bfe6ff' : '#f4efe6', 14);
      if (r.spark) {
        sparkFx(centerOf(target));
        bubble(T.spark, centerOf(target), 2200, 'bad');
      }
      break;
    }
    case 'magnifier': {
      sfx('inspect', {}, 0);
      loupe(centerOf(target));
      bubble(findText(r.find), centerOf(target), 2400, /ok/.test(r.find) ? 'good' : 'find');
      await wait(200);
      break;
    }
    case 'charger': {
      await cable('charger');
      sfx(r.charge ? 'charge' : 'nocharge', {}, 0);
      if (r.charge && !game.power) {
        overlay = 'charge';
        paint();
      }
      bubble(r.charge ? T.charging : T.noCharge, centerOf('jack'), 1800, r.charge ? 'good' : 'bad');
      await wait(1200);
      if (overlay === 'charge') overlay = '';
      await cable('charger', true);
      break;
    }
    case 'antivirus': {
      if (r.clean) {
        overlay = 'clean';
        paint();
        sfx('clean', {}, 0);
        bubble(T.scanClean, centerOf('screen'), 1400, 'good');
        await wait(1200);
        overlay = '';
        break;
      }
      overlay = 'scan';
      paint();
      sfx('scan', {}, 0);
      await wait(1300);
      overlay = '';
      paint();                                  // жуки появляются при перерисовке (scanned)
      bubble(T.scanFound(r.bugs), centerOf('screen'), 1800, 'bad');
      break;
    }
    default:
      break;
  }
}

function findText(key) {
  if (key.startsWith('ok:')) return T.okPart(key.slice(3));
  return T.finds[key] ?? T.finds.ok;
}

function landBump(node) {
  if (reducedMotion()) return;
  animate(node.firstChild, [{ scale: '1.04' }, { scale: '0.99' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
}

/** Лупа: стеклянное кольцо мелькает над целью. */
function loupe(at) {
  const [x, y] = at;
  const ring = svgEl('g', { class: 'pr-loupe' }, `<circle cx="${x}" cy="${y}" r="20"/><path d="M${x + 14} ${y + 14}l12 12"/>`);
  S.marks.append(ring);
  animate(ring, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1', offset: 0.3 }, { opacity: 1, scale: '1', offset: 0.8 }, { opacity: 0, scale: '1.05' }],
    { duration: 900, easing: 'ease-out' }).then(() => ring.remove());
}

/** Кабель к гнезду: зарядка (белый) или компьютер (синий). Гнездо снизу — кабель снизу, сверху — сверху. out — вынуть. */
async function cable(kind, out = false) {
  if (!S) return;
  let node = S.marks.querySelector('.pr-cable');
  const [x, y] = centerOf('jack');
  const top = y < H / 3;
  const dy = top ? -70 : 70;
  if (!out) {
    node?.remove();
    const dir = top ? -1 : 1;
    const tip = y - dir * 4;
    node = svgEl('g', { class: `pr-cable pr-cable-${kind}` },
      `<path class="pr-cable-wire" d="M${x} ${tip + dir * 22}C${x} ${tip + dir * 46} ${x + 40} ${tip + dir * 36} ${x + 60} ${top ? -20 : H + 20}"/>`
      + `<rect class="pr-cable-plug" x="${x - 9}" y="${top ? tip - 22 : tip + 6}" width="18" height="16" rx="4"/>`
      + `<rect class="pr-cable-tip" x="${x - 5.5}" y="${top ? tip - 7 : tip}" width="11" height="7" rx="2"/>`);
    S.marks.append(node);
    sfx('click', {}, 0);
    if (!reducedMotion()) await animate(node, [{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
  } else if (node) {
    if (!reducedMotion()) await animate(node, [{ translate: '0 0' }, { translate: `0 ${dy}px`, opacity: 0 }], { duration: 240, easing: 'ease-in' });
    node.remove();
  }
}

/** Нужно ли перевернуть к экрану (у фотоаппарата экран сзади; без экрана — не нужно). */
const needFlipToScreen = () => Boolean(D().parts.display) && game.view !== D().parts.display.side;

/** Включение: логотип, потом экран; мелодия — по состоянию динамика. */
async function bootSequence() {
  const P = game.parts;
  const quality = P.speaker ? (!P.speaker.in || P.speaker.broken ? 'none' : game.dirt.speaker ? 'quiet' : 'ok') : 'ok';
  sfx('boot', { quality }, 0);
  if (screenOf(game) === 'home') {
    overlay = 'logo';
    paint();
    await wait(800);
    overlay = '';
  }
  paint();
}

async function doPower() {
  audio.get();
  const r = act(game, 'power', 'button');
  clearHint();
  api.platform.haptic.impact('light');
  const at = centerOf('button');
  busy++;
  try {
    if (r.on) {
      if (needFlipToScreen()) await flip();
      await bootSequence();
      if (D().parts.display && screenOf(game) !== 'home') bubble(T.bootOn, centerOf('screen'), 1400);
      else if (!D().parts.display) bubble(T.poweredOn, centerOf('button'), 1400, 'good');
    } else if (r.dead) {
      sfx('click', {}, 0);
      bubble(T.dead, at, 1600, 'bad');
    } else if (r.blink) {
      if (needFlipToScreen()) await flip();
      overlay = 'empty';
      paint();
      sfx('blink', {}, 0);
      await wait(800);
      overlay = '';
      bubble(T.blink, centerOf('screen'), 1800, 'bad');
    } else {
      sfx('off', {}, 0);
      overlay = '';
    }
  } finally {
    busy--;
  }
  if (!ui) return;
  after();
}

/** Крышка ноутбука: открыть или закрыть (экран откидывается на петле — переход в CSS). */
async function doLid() {
  audio.get();
  const r = act(game, 'lid');
  if (!r.ok) {
    refuse(r, 'lid');
    return;
  }
  clearHint();
  sfx(r.lid === 'open' ? 'lift' : 'place', {}, 0);
  api.platform.haptic.impact('light');
  busy++;
  try {
    paint();
    await wait(380);
  } finally {
    busy--;
  }
  if (ui) after();
}

/** Переворот: устройство сжимается по ширине до нуля, сторона меняется, разжимается. */
async function flip() {
  if (!game) return;
  act(game, 'flip');
  sfx('flip', {}, 0);
  const edges = Object.keys(D().parts).filter((p) => isEdge(p) && game.parts[p].in);
  if (reducedMotion()) {
    edges.forEach((p) => setPlace(S.parts[p], homePlace(p)));
    paint();
    return;
  }
  const other = game.view;
  game.view = other === 'back' ? 'front' : 'back';
  busy++;
  try {
    await animate(S.flipper, [{ scale: '1 1' }, { scale: '0 1' }], { duration: 150, easing: 'ease-in' });
    game.view = other;
    edges.forEach((p) => setPlace(S.parts[p], homePlace(p)));
    paint();
    await animate(S.flipper, [{ scale: '0 1' }, { scale: '1 1' }], { duration: 170, easing: 'ease-out' });
  } finally {
    busy--;
  }
}

async function onFlip() {
  if (!canTouch()) return;
  audio.get();
  clearHint();
  await flip();
  if (ui) after();
}

// ---------- вирусы: жуки и реклама ----------

function spawnBugs(n) {
  stopBugs();
  S.bugs.replaceChildren();
  const sc = L().SCREEN;
  bugs = Array.from({ length: n }, (_, k) => {
    const node = svgEl('g', { class: `pr-bug pr-bug-${k % 3}` },
      '<g class="pr-bug-body"><path class="pr-bug-legs" d="M-7 -4l-5 -3M-7 0h-6M-7 4l-5 3M7 -4l5 -3M7 0h6M7 4l5 3"/>'
      + '<ellipse class="pr-bug-shell" cx="0" cy="1" rx="7.5" ry="9"/><circle class="pr-bug-head" cx="0" cy="-9" r="4"/>'
      + '<path class="pr-bug-line" d="M0 -6v16"/><circle class="pr-bug-dot" cx="-3" cy="2" r="1.6"/><circle class="pr-bug-dot" cx="3.5" cy="5" r="1.4"/></g>');
    S.bugs.append(node);
    const a = Math.random() * Math.PI * 2;
    const b = { x: sc.x + 20 + Math.random() * (sc.w - 40), y: sc.y + 40 + Math.random() * (sc.h - 80), a, v: 26 + Math.random() * 22, turn: 0, node, dead: false };
    if (!reducedMotion()) animate(node.firstChild, [{ scale: '0' }, { scale: '1.2' }, { scale: '1' }], { duration: 300, delay: k * 80, easing: 'ease-out', fill: 'backwards' });
    return b;
  });
  drawBugs();
  if (!reducedMotion()) {
    bugLast = performance.now();
    bugRaf = requestAnimationFrame(bugFrame);
  }
}

function drawBugs() {
  for (const b of bugs) b.node.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${((b.a * 180) / Math.PI + 90).toFixed(1)})`);
}

function bugFrame(now) {
  if (!ui || !bugs.length) {
    bugRaf = 0;
    return;
  }
  const dt = Math.min(0.05, Math.max(0, now - bugLast) / 1000);
  bugLast = now;
  const sc = L().SCREEN;
  const [x0, y0, x1, y1] = [sc.x + 8, sc.y + 26, sc.x + sc.w - 8, sc.y + sc.h - 8];
  for (const b of bugs) {
    if (b.dead) continue;
    b.turn += (Math.random() - 0.5) * 6 * dt;
    b.turn = clamp(b.turn, -2.5, 2.5);
    b.a += b.turn * dt;
    b.x += Math.cos(b.a) * b.v * dt;
    b.y += Math.sin(b.a) * b.v * dt;
    if (b.x < x0 || b.x > x1) {
      b.a = Math.PI - b.a;
      b.x = clamp(b.x, x0, x1);
    }
    if (b.y < y0 || b.y > y1) {
      b.a = -b.a;
      b.y = clamp(b.y, y0, y1);
    }
  }
  drawBugs();
  bugRaf = requestAnimationFrame(bugFrame);
}

function stopBugs() {
  if (bugRaf) cancelAnimationFrame(bugRaf);
  bugRaf = 0;
}

function clearBugs() {
  stopBugs();
  bugs = [];
  S?.bugs.replaceChildren();
}

function squash(k) {
  const b = bugs[k];
  if (!b || b.dead || !canTouch()) return;
  const r = act(game, 'squash', 'bug');
  if (!r.ok) return;
  clearHint();
  b.dead = true;
  sfx('squash', {}, 0);
  api.platform.haptic.impact('light');
  sparkle([b.x, b.y], '#7ddc8a', 8);
  const node = b.node;
  animate(node.firstChild, [{ scale: '1 1', opacity: 1 }, { scale: '1.5 0.3', opacity: 1, offset: 0.3 }, { scale: '1.6 0.2', opacity: 0 }], { duration: 420, easing: 'ease-out' })
    .then(() => node.remove());
  if (!r.left) {
    stopBugs();
    later(() => {
      if (!ui) return;
      bugs = [];
      sfx('clean', {}, 0);
      bubble(T.cured, centerOf('screen'), 1600, 'good');
      paint();
    }, 300);
  }
  after();
}

function closeAd(k) {
  if (!canTouch()) return;
  sfx('ad', {}, 0);
  const node = S.parts.display.querySelector(`.pr-ad[data-ad="${k}"]`);
  adsGone.set(k, performance.now() + 4000);
  if (node && !reducedMotion()) animate(node, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.8' }], { duration: 180 });
  later(() => paint(), 190);
  later(() => paint(), 4050);
}

// ---------- ввод на сцене ----------

function onPointerDown(e) {
  if (!canTouch() || pd) return;
  audio.get();
  const pt = toScene(e.clientX, e.clientY);
  const target = hitTest(pt);
  pd = { id: e.pointerId, x: e.clientX, y: e.clientY, target, mode: 'tap', last: pt };
  if (target && tool === 'heat' && target in game.hot) {
    const probe = act(structuredClone(game), 'heat', target);
    if (probe.ok && !game.hot[target]) startHeat(target);
  } else if (target && (tool === 'brush' || tool === 'alcohol')) {
    const t = mapTarget(tool, target);
    const probe = act(structuredClone(game), tool, t);
    if (probe.ok) {
      pd.mode = 'scrub';
      pd.target = t;
      scrubbed = 0;
    }
  }
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    // без захвата — тоже работает
  }
}

function onPointerMove(e) {
  if (!pd || e.pointerId !== pd.id || pd.mode !== 'scrub') return;
  const pt = toScene(e.clientX, e.clientY);
  if (!pt || !pd.last) return;
  const d = Math.hypot(pt[0] - pd.last[0], pt[1] - pd.last[1]);
  pd.last = pt;
  if (d < 0.5) return;
  scrubbed += d;
  sfx(tool === 'alcohol' ? 'fizz' : 'scrub', {}, 110);
  if (Math.random() < 0.35) {
    const [x, y] = toStage(pt);
    fx.burst(x, y, tool === 'alcohol' ? '#bfe6ff' : '#cfc6b8', 2, { speed: 90, size: 3 });
  }
  if (scrubbed >= SCRUB) {
    const target = pd.target;
    pd.mode = 'done';
    doTool(target);
  }
}

function onPointerUp(e) {
  if (!pd || e.pointerId !== pd.id) return;
  const p = pd;
  pd = null;
  if (p.mode === 'heat') {
    stopHeat();
    return;
  }
  if (p.mode === 'scrub') {
    if (scrubbed < SCRUB) bubble(T.rub, centerOf(p.target), 1200);
    return;
  }
  if (p.mode === 'done' || !p.target) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) return;
  doTool(p.target);
}

function onPointerCancel() {
  if (pd?.mode === 'heat') stopHeat();
  pd = null;
}

// ---------- фен: держать ----------

let heatRaf = 0;
let heatLast = 0;
let heatTarget = '';
let heatSound = 0;

function startHeat(target) {
  pd.mode = 'heat';
  heatTarget = target;
  heatLast = performance.now();
  heatSound = 0;
  S.parts[target].classList.add('pr-heating');
  heatRaf = requestAnimationFrame(heatFrame);
}

function heatFrame(now) {
  if (!ui || !heatTarget) return;
  const dt = Math.max(0, now - heatLast);
  heatLast = now;
  heatLevel[heatTarget] = Math.min(1, (heatLevel[heatTarget] ?? 0) + dt / HEAT_MS);
  S.parts[heatTarget].style.setProperty('--heat', String(heatLevel[heatTarget]));
  heatSound -= dt;
  if (heatSound <= 0) {
    sfx('heat', {}, 0);
    heatSound = 280;
  }
  if (heatLevel[heatTarget] >= 1) {
    const t = heatTarget;
    stopHeat();
    if (pd) pd.mode = 'done';
    doTool(t);
    return;
  }
  heatRaf = requestAnimationFrame(heatFrame);
}

function stopHeat() {
  if (heatRaf) cancelAnimationFrame(heatRaf);
  heatRaf = 0;
  if (heatTarget && S) S.parts[heatTarget].classList.remove('pr-heating');
  heatTarget = '';
}

// ---------- компьютер: терминал и клавиатура ----------

async function openPc() {
  busy++;
  try {
    await cable('flash');
  } finally {
    busy--;
  }
  if (!ui) return;
  sfx('plug', {}, 0);
  pc = { lines: [...greet(game)], input: '', history: [], at: -1, busy: false, tab: null };
  const screen = el('div', { class: 'pr-term', role: 'log', 'aria-live': 'polite' });
  const line = el('div', { class: 'pr-term-input' });
  const keys = KEYBOARD.map((row) => el('div', { class: 'pr-kbd-row' },
    [...row].map((ch) => el('button', { class: 'pr-key-btn', onclick: () => typeKey(ch), onmousedown: (e) => e.preventDefault() }, ch))));
  const kb = (label, cls, fn, html = '') => {
    const b = el('button', { class: `pr-key-btn ${cls}`, onclick: fn, onmousedown: (e) => e.preventDefault(), 'aria-label': label, title: label }, html ? '' : label);
    if (html) b.innerHTML = html;
    return b;
  };
  const bottom = el('div', { class: 'pr-kbd-row' },
    kb('Tab', 'pr-key-fn pr-key-tab', () => typeKey('Tab')),
    kb('↑', 'pr-key-fn', () => typeKey('ArrowUp')),
    kb('↓', 'pr-key-fn', () => typeKey('ArrowDown')),
    kb('пробел', 'pr-key-space', () => typeKey(' ')),
    kb('Стереть', 'pr-key-fn', () => typeKey('Backspace'), ICONS.back),
    kb('Ввод', 'pr-key-enter', () => typeKey('Enter'), ICONS.enter));
  pc.box = { screen, line };
  // клавиатура телефона (настройка): поле вверху окна, своя кнопка «Ввод» и Enter
  const field = settings.nativeKbd ? el('input', {
    class: 'pr-cmd-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'send',
    placeholder: T.cmdPlaceholder, maxLength: 48,
  }) : null;
  const form = field && el('form', {
    class: 'pr-cmd-form', novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      if (!pc || pc.busy) return;
      pc.input = field.value.toLowerCase();
      field.value = '';
      pc.tab = null;
      submitPc();
    },
  }, field, el('button', { class: 'btn pr-cmd-send', type: 'submit', onmousedown: (e) => e.preventDefault() }, T.send));
  field?.addEventListener('input', () => {
    if (!pc) return;
    pc.input = field.value.toLowerCase();
    pc.tab = null;
    paintTerm();
  });
  field?.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      pc.input = field.value.toLowerCase();
      typeKey(e.key);
    }
  });
  pc.box.field = field;
  // на телефоне нет Tab и стрелок — свои кнопки под полем
  const fieldKeys = field && el('div', { class: 'pr-kbd-row pr-field-keys' },
    kb('Tab', 'pr-key-fn pr-key-tab', () => typeKey('Tab')),
    kb('↑', 'pr-key-fn', () => typeKey('ArrowUp')),
    kb('↓', 'pr-key-fn', () => typeKey('ArrowDown')));
  const box = card(T.pc,
    form,
    fieldKeys,
    el('div', { class: 'pr-monitor' }, screen, line),
    field ? null : el('div', { class: 'pr-kbd' }, keys, bottom),
    el('div', { class: 'pr-pc-actions' },
      el('button', { class: 'btn btn-secondary pr-pc-btn', onclick: () => pcHint() }, T.pcHint),
      el('button', { class: 'btn pr-pc-btn', onclick: () => closePc() }, T.unplug)),
  );
  box.classList.add('pr-card-pc');
  box.querySelector('.pr-card-head .pr-icon-btn').addEventListener('click', () => closePc(true));
  openModal(box);
  paintTerm();
  if (field) later(() => field.focus(), 60);
  if (tutorialAuto() || (TUTORIAL[game.level] && TUTORIAL[game.level][1] === 'bootloop')) pcHint(true);
}

function paintTerm() {
  if (!pc) return;
  const { screen, line } = pc.box;
  screen.replaceChildren(...pc.lines.slice(-60).map((l) => el('div', { class: `pr-term-line pr-term-${l.c ?? 'dim'}` }, l.t || ' ')));
  screen.scrollTop = screen.scrollHeight;
  line.replaceChildren(el('span', { class: 'pr-term-prompt' }, `${PROMPT} `), el('span', {}, pc.input), el('span', { class: 'pr-term-caret' }));
}

/**
 * Клавиша терминала: символ, Backspace, Enter, Tab (дописать; повторно — перебрать варианты), ↑ ↓ — прошлые команды
 * назад и вперёд (за последней — пустая строка).
 */
function typeKey(k) {
  if (!pc || pc.busy) return;
  if (k === 'Enter') {
    pc.tab = null;
    submitPc();
    return;
  }
  if (k === 'Tab') {
    const r = tabComplete(game, pc.input, pc.tab);
    pc.tab = r.tab;
    if (r.none) sfx('error', {}, 60);
    else {
      pc.input = r.line;
      if (r.list) pc.lines.push(...r.list.map((t) => ({ t: `  ${t}`, c: 'dim' })));
      sfx('click', {}, 25);
    }
    paintTerm();
    syncField();
    return;
  }
  pc.tab = null;
  if (k === 'Backspace') pc.input = pc.input.slice(0, -1);
  else if (k === 'ArrowUp') {
    if (pc.history.length) {
      pc.at = pc.at < 0 ? pc.history.length - 1 : Math.max(0, pc.at - 1);
      pc.input = pc.history[pc.at];
    }
  } else if (k === 'ArrowDown') {
    if (pc.at >= 0) {
      pc.at++;
      if (pc.at >= pc.history.length) {
        pc.at = -1;
        pc.input = '';
      } else pc.input = pc.history[pc.at];
    }
  } else if (pc.input.length < 48) pc.input += k;
  sfx('tool', {}, 25);
  paintTerm();
  syncField();
}

/** Поле клавиатуры телефона — то же, что строка терминала (после Tab и истории). */
function syncField() {
  const field = pc?.box?.field;
  if (field && field.value !== pc.input) {
    field.value = pc.input;
    field.setSelectionRange?.(field.value.length, field.value.length);
  }
}

async function submitPc() {
  const text = pc.input.trim();
  pc.input = '';
  pc.at = -1;
  if (text) pc.history.push(text);
  const res = runTerminal(game, text);
  if (res.clear) pc.lines = [];
  pc.lines.push(...res.out);
  sfx(res.out.at(-1)?.c === 'err' ? 'error' : 'click', {}, 0);
  paintTerm();
  if (res.exit) {
    closePc();
    return;
  }
  if (res.flash?.ok) {
    pc.busy = true;
    overlay = 'flash';
    paint();
    const at = pc.lines.length;
    pc.lines.push({ t: T.progressLine(0), c: 'ok' });
    for (let k = 1; k <= 10; k++) {
      await wait(150);
      if (!pc) return;
      pc.lines[at] = { t: T.progressLine(k), c: 'ok' };
      sfx('flash', { k }, 0);
      paintTerm();
    }
    pc.lines.push({ t: T.pcDone, c: 'ok' });
    sfx('flashed', {}, 0);
    overlay = '';
    pc.busy = false;
    paintTerm();
    await bootSequence();
    bubble(T.flashed, centerOf('screen'), 1600, 'good');
  }
  save();
}

function pcHint(free = false) {
  if (!pc || !game) return;
  if (!free) {
    if (!game.hints) toast.show(T.hintNote, 2200);
    game.hints++;
    paintTicket();
    save();
  }
  const st = nextStep(game, progress);
  const cmd = st?.tool === 'flash' ? `flash ${st.target}` : 'devices';
  pc.lines.push({ t: T.pcHintLine(cmd), c: 'hint' });
  sfx('hint', {}, 0);
  paintTerm();
}

function closePc(fromX = false) {
  if (!pc) return;
  pc = null;
  if (!fromX) closeModal();
  sfx('unplug', {}, 0);
  cable('flash', true);
  after();
}

// ---------- магазин ----------

function buyPart(kind, p, row) {
  const price = DEVICES[kind].parts[p].price;
  let r;
  if (kind === game.kind && !game.done) r = act(game, 'buy', p, progress);
  else if (progress.money >= price) {
    progress.money -= price;
    progress.stock[stockKey(kind, p)] = (progress.stock[stockKey(kind, p)] ?? 0) + 1;
    r = { ok: true };
  } else r = { ok: false };
  if (!r.ok) {
    sfx('error', {}, 0);
    toast.show(T.broke, 1400);
    return;
  }
  sfx('cash', {}, 0);
  api.platform.haptic.impact('light');
  saveProgress();
  save();
  if (row && !reducedMotion()) animate(row, [{ scale: '1' }, { scale: '1.03' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
  if (hintShown?.tool === 'buy') clearHint();
  paintTicket();
}

function showShop(want = '') {
  const kinds = KINDS.filter((k) => UNLOCK[k] <= Math.max(progress.level, game.level));
  let kind = game.kind;
  const money = el('b', {});
  const list = el('div', { class: 'pr-shop-list' });
  const note = el('p', { class: 'pr-note' });
  const tabs = kinds.map((k) => el('button', {
    class: 'pr-tab', role: 'tab', 'aria-selected': String(k === kind),
    onclick: () => {
      kind = k;
      tabs.forEach((t, i) => t.setAttribute('aria-selected', String(kinds[i] === k)));
      render();
      sfx('click');
    },
  }, DEVICES[k].name));
  function render() {
    money.textContent = usd(progress.money);
    const rows = shopParts(kind).map((p) => {
      const price = DEVICES[kind].parts[p].price;
      const n = progress.stock[stockKey(kind, p)] ?? 0;
      const row = el('div', { class: `pr-shop-row${kind === game.kind && p === want ? ' pr-hinted' : ''}` },
        el('div', { class: 'pr-shop-name' }, el('b', {}, cap(T.names[p] ?? p)), el('span', {}, T.stock(n))));
      const btn = el('button', {
        class: `pr-buy${progress.money < price ? ' pr-buy-short' : ''}`,
        onclick: () => {
          buyPart(kind, p, row);
          render();
        },
      }, usd(price));
      row.append(btn);
      return row;
    });
    list.replaceChildren(...rows);
    const short = kind === game.kind && shopParts(kind).some((p) => progress.money < DEVICES[kind].parts[p].price);
    note.textContent = short ? T.prepayNote : '';
  }
  render();
  openModal(card(T.shop,
    el('div', { class: 'pr-balance' }, el('span', {}, T.balance), money),
    el('div', { class: 'pr-tabs pr-tabs-scroll', role: 'tablist' }, tabs),
    list,
    note,
  ));
}

// ---------- сдача ----------

async function onDeliver() {
  if (!canTouch()) return;
  audio.get();
  const probe = act(structuredClone(game), 'deliver');
  if (!probe.ok) {
    sfx('error', {}, 0);
    toast.show(T.assemble(probe.missing), 1800);
    return;
  }
  clearHint();
  const r = act(game, 'deliver');
  if (!r.win) {
    sfx('return', {}, 0);
    api.platform.haptic.notification('error');
    setMood('sad', 2400);
    starShake();
    toast.show(T.returned(r.problems.map((k) => SYMPTOMS[k] ?? k).join(', ')), 2600);
    after();
    return;
  }
  busy++;
  try {
    if (needFlipToScreen()) await flip();
    overlay = '';
    await bootSequence();
  } finally {
    busy--;
  }
  if (!ui) return;
  const finished = game;
  const { stars, earned } = recordWin(progress, finished);
  saveProgress();
  sendProgress();
  paintTicket();
  setMood('happy');
  sfx('deliver', {}, 0);
  later(() => sfx('cash', {}, 0), 400);
  api.platform.haptic.notification('success');
  if (!reducedMotion()) fx.confetti(['#ffd23d', '#4dd0e1', '#ff7eb6', '#9ccc65', '#b388ff', '#ff9f43'], stars === 3 ? 90 : 50);
  // следующий заказ сохранён сразу: выход из окна победы не вернёт сданный
  const next = newOrder(progress.level);
  api.storage.set('current', next);
  later(() => { if (ui) showWin(finished, stars, earned, next); }, reducedMotion() ? 100 : 900);
}

function showWin(done, stars, earned, next) {
  const starRow = el('div', { class: 'pr-win-stars' }, [0, 1, 2].map((k) => el('span', { class: `pr-win-star${k < stars ? ' on' : ''}` }, '★')));
  const faults = Object.entries(T.mistakes).filter(([k]) => done[k]).map(([k, v]) => (k === 'hints' ? v : `${v}: ${done[k]}`));
  const quote = T.quotes[(done.level * 7) % T.quotes.length];
  const face = el('div', { class: 'pr-win-face' });
  face.innerHTML = avatar(done.customer, 'happy');
  const goNext = () => {
    if (game !== done) return;
    closeModal();
    startOrder(next);
  };
  const box = card(T.win(done.level),
    el('div', { class: 'pr-win-who' }, face, el('div', { class: 'pr-win-quote' }, `«${quote}»`, el('span', {}, done.customer.name))),
    starRow,
    el('div', { class: 'pr-win-money' }, T.earned(earned), done.prepaid ? el('span', {}, T.prepaid(done.prepaid)) : null),
    el('p', { class: 'pr-note pr-center' }, faults.length ? faults.join(' · ') : T.clean),
    el('button', { class: 'btn pr-play', onclick: goNext }, T.next),
  );
  box.querySelector('.pr-card-head .pr-icon-btn').addEventListener('click', goNext);
  openModal(box, { dismissible: false });
  if (!reducedMotion()) {
    [...starRow.children].forEach((s, k) => {
      animate(s, [{ transform: 'scale(0) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }],
        { duration: 420, delay: 250 + k * 220, easing: 'ease-out', fill: 'backwards' });
    });
  }
  for (let k = 0; k < stars; k++) later(() => sfx('star', { k }, 0), 300 + k * 220);
}

function sendProgress() {
  const n = progress.level - 1;
  api.progress(n ? T.menu(n, progress.money) : null);
}

// ---------- заказ ----------

function startOrder(s) {
  game = s;
  tool = '';
  heatLevel = {};
  clearHint();
  buildScene();
  buildTicket();
  save();
  if (!reducedMotion()) {
    animate(S.flipper, [{ translate: '0 -40px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
    animate(ui.ticket, [{ opacity: 0, translate: '-12px 0' }, { opacity: 1, translate: '0 0' }], { duration: 300, easing: 'ease-out' });
  }
  sfx('place', {}, 0);
  intro();
  if (tutorialAuto()) showHint(true);
}

/** Обучение: первая встреча с устройством или поломкой — карточка с советом. */
function intro() {
  const cards = [];
  if (T.kindIntro[game.kind] && !seen.includes(`kind:${game.kind}`)) {
    seen.push(`kind:${game.kind}`);
    cards.push([`${T.newKind}: ${T.kindIntro[game.kind][0]}`, T.kindIntro[game.kind][1]]);
  }
  const tut = TUTORIAL[game.level];
  if (tut && tut[0] === game.kind && T.intro[tut[1]] && !seen.includes(tut[1])) {
    seen.push(tut[1]);
    cards.push([`${T.newFault}: ${T.intro[tut[1]][0]}`, T.intro[tut[1]][1]]);
  }
  if (!cards.length) return;
  api.storage.set('seen', seen);
  later(() => {
    if (!ui || modalActive) return;
    openModal(card(cards[0][0], ...cards.map(([title, text], k) => [
      k ? el('h3', { class: 'pr-section' }, title) : null,
      el('p', { class: 'pr-note pr-rules' }, text),
    ]), el('button', { class: 'btn pr-play', onclick: closeModal }, T.gotIt)));
  }, reducedMotion() ? 0 : 450);
}

// ---------- окна ----------

function openModal(content, { dismissible = true } = {}) {
  if (!modalActive) sfx('click');
  modalToken++;
  ui.modal.replaceChildren(content);
  ui.modal.onclick = dismissible ? (e) => { if (e.target === ui.modal) closeModalAny(); } : null;
  ui.modal.dataset.dismissible = dismissible ? '1' : '0';
  if (!modalActive) showLayer(ui.modal);
  modalActive = true;
  if (pd) onPointerCancel();
}

/** Закрыть окно; открытый компьютер при этом отключается. */
function closeModalAny() {
  if (pc) closePc();
  else closeModal();
}

function closeModal() {
  if (!modalActive) return;
  modalActive = false;
  const token = ++modalToken;
  hideLayer(ui.modal, () => token === modalToken).then(() => {
    if (ui && token === modalToken) ui.modal.replaceChildren();
  });
}

function card(title, ...children) {
  return el('div', { class: 'pr-card', role: 'dialog', 'aria-label': title },
    el('div', { class: 'pr-card-head' },
      el('h2', {}, title),
      el('button', { class: 'pr-icon-btn', 'aria-label': T.close, title: T.close, onclick: closeModal }, '✕'),
    ),
    ...children,
  );
}

function showTicket() {
  const face = el('div', { class: 'pr-win-face' });
  face.innerHTML = avatar(game.customer, mood);
  const notes = game.notes.map(findText);
  openModal(card(game.customer.name,
    el('div', { class: 'pr-win-who' }, face, el('div', { class: 'pr-win-quote' }, `«${complaintText()}»`, el('span', {}, `${game.model.name} · ${T.pay(game.pay)}`))),
    el('h3', { class: 'pr-section' }, T.notes),
    notes.length
      ? el('ul', { class: 'pr-notes' }, notes.map((t) => el('li', {}, t)))
      : el('p', { class: 'pr-note' }, T.noNotes),
  ));
}

function showRules() {
  openModal(card(T.title,
    ...T.rules.map((line) => el('p', { class: 'pr-note pr-rules' }, line)),
    el('button', { class: 'btn pr-play', onclick: closeModal }, T.play),
  ));
}

function rankOf(stars) {
  let r = T.ranks[0][1];
  for (const [min, name] of T.ranks) if (stars >= min) r = name;
  return r;
}

function showStats() {
  const vals = [progress.level - 1, usd(progress.earned), progress.stars, progress.perfect, progress.sparks];
  openModal(card(T.stats,
    el('div', { class: 'pr-rank' }, el('span', {}, T.rank), el('b', {}, rankOf(progress.stars))),
    el('div', { class: 'pr-table' }, T.statRows.map((label, k) => el('div', { class: 'pr-row' }, el('span', {}, label), el('b', {}, String(vals[k]))))),
  ));
}

const saveSettings = () => api.storage.set('settings', settings);

function showSettings() {
  const skins = SKINS.map((id) => el('button', {
    class: 'pr-skin', role: 'radio', 'aria-checked': String(settings.skin === id), 'data-skin': id,
    onclick: () => {
      settings.skin = id;
      saveSettings();
      skins.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.skin === id)));
      applyOptions();
      sfx('click');
    },
  }, el('span', { class: 'pr-swatch' }, el('span', { class: 'pr-swatch-phone' })), el('span', { class: 'pr-skin-name' }, T.skins[id])));
  const toggle = (key, label, after = () => {}) => {
    const input = el('input', { type: 'checkbox', checked: settings[key] });
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      after();
    });
    return el('label', { class: 'pr-toggle' }, input, el('span', {}, label));
  };
  openModal(card(T.settings,
    el('h3', { class: 'pr-section' }, T.skin),
    el('div', { class: 'pr-skins', role: 'radiogroup' }, skins),
    el('h3', { class: 'pr-section' }, T.options),
    toggle('marks', T.marks, paintMarks),
    toggle('nativeKbd', T.nativeKbd),
    el('p', { class: 'pr-note pr-toggle-note' }, T.nativeKbdNote),
    el('button', { class: 'btn btn-secondary pr-play', onclick: showRules }, T.howTo),
  ));
}

function applyOptions() {
  host.dataset.skin = settings.skin;
}

function iconButton(icon, label, onclick, cls = 'pr-icon-btn') {
  const b = el('button', { class: cls, 'aria-label': label, title: label, onclick });
  b.innerHTML = icon;
  return b;
}

function actionButton(icon, label, onclick, cls = '') {
  const b = el('button', { class: `pr-action ${cls}`, onclick, onmousedown: (e) => e.preventDefault() },
    el('span', { class: 'pr-action-icon' }), el('span', {}, label));
  b.firstChild.innerHTML = icon;
  return b;
}

function onKeydown(e) {
  if (pc) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.tagName === 'INPUT') {
      if (e.key === 'Escape') closePc();
      return;
    }
    if (e.key === 'Escape') closePc();
    else if (e.key === 'Tab' || e.key === 'ArrowDown') typeKey(e.key);
    else if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'ArrowUp') typeKey(e.key);
    else if (/^[a-z0-9._\- ]$/i.test(e.key)) typeKey(e.key.toLowerCase());
    else return;
    e.preventDefault();
    return;
  }
  if (modalActive) {
    if (e.key === 'Escape' && ui.modal.dataset.dismissible === '1') closeModal();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || !game) return;
  if (e.code === 'KeyF') onFlip();
  else if (e.code === 'KeyH') onHint();
  else if (e.key === 'Escape' && tool) pickTool(tool);
}

function onHint() {
  if (!canTouch()) return;
  audio.get();
  showHint(tutorialAuto());
}

function onVisibility() {
  if (document.visibilityState !== 'visible') save();
}

export default {
  id: 'repair',
  title: 'Ремонт гаджетов',

  async init(container, gameApi) {
    api = gameApi;
    host = container;
    toast = createToast();
    const [saved, savedProgress, savedSettings, savedSound, rulesSeen, savedSeen] = await Promise.all([
      api.storage.get('current'), api.storage.get('progress'), api.storage.get('settings'), api.storage.get('sound'),
      api.storage.get('rules'), api.storage.get('seen'),
    ]);
    if (!api) return;
    soundOn = savedSound !== false;
    progress = normProgress(savedProgress);
    seen = Array.isArray(savedSeen) ? savedSeen.filter((x) => typeof x === 'string') : [];
    if (savedSettings && typeof savedSettings === 'object') {
      settings = {
        skin: SKINS.includes(savedSettings.skin) ? savedSettings.skin : 'telegram',
        marks: savedSettings.marks !== false,
        nativeKbd: savedSettings.nativeKbd === true,
      };
    }

    const soundBtn = iconButton(soundOn ? ICONS.soundOn : ICONS.soundOff, soundOn ? T.soundOn : T.soundOff, () => {
      soundOn = !soundOn;
      api.storage.set('sound', soundOn);
      soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
      soundBtn.title = soundOn ? T.soundOn : T.soundOff;
      soundBtn.setAttribute('aria-label', soundBtn.title);
      sfx('click');
    });
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'pr-svg');
    svg.setAttribute('aria-hidden', 'true');
    ui = {
      sub: el('div', { class: 'pr-sub' }),
      avatar: el('div', { class: 'pr-avatar' }),
      name: el('div', { class: 'pr-name' }),
      complaint: el('div', { class: 'pr-complaint' }),
      stars: [0, 1, 2].map(() => el('span', { class: 'pr-star' }, '★')),
      pay: el('div', { class: 'pr-pay' }),
      stage: el('div', { class: 'pr-stage' }),
      svg,
      bubble: el('div', { class: 'pr-bubble', hidden: true }),
      flash: el('div', { class: 'pr-flash-screen' }),
      modal: el('div', { class: 'pr-modal', hidden: true }),
      tools: el('div', { class: 'pr-tools' }),
    };
    ui.ticket = el('button', { class: 'pr-ticket', onclick: () => { if (!modalActive && game) showTicket(); } },
      ui.avatar,
      el('div', { class: 'pr-ticket-text' }, ui.name, ui.complaint),
      el('div', { class: 'pr-ticket-side' }, el('div', { class: 'pr-stars' }, ui.stars), ui.pay));
    ui.flipBtn = actionButton(ICONS.flip, T.flip, onFlip);
    ui.hintBtn = actionButton(ICONS.hint, T.hint, onHint);
    ui.deliverBtn = actionButton(ICONS.deliver, T.deliver, onDeliver, 'pr-action-main');
    ui.shopBtn = iconButton(ICONS.shop, T.shop, () => { if (!modalActive && game) showShop(hintShown?.tool === 'buy' ? hintShown.target : ''); });
    ui.toolBtns = TOOLS.map((t) => {
      const b = el('button', { class: 'pr-tool', 'data-tool': t, 'aria-pressed': 'false', title: T.toolHints[t], onclick: () => pickTool(t), onmousedown: (e) => e.preventDefault() },
        el('span', { class: 'pr-tool-icon' }), el('span', { class: 'pr-tool-name' }, T.tools[t]));
      b.firstChild.innerHTML = TOOL_ICONS[t];
      return b;
    });
    ui.tools.append(...ui.toolBtns);
    ui.stage.append(svg, ui.flash, ui.bubble);
    ui.stage.addEventListener('pointerdown', onPointerDown);
    ui.stage.addEventListener('pointermove', onPointerMove);
    ui.stage.addEventListener('pointerup', onPointerUp);
    ui.stage.addEventListener('pointercancel', onPointerCancel);
    ui.stage.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root = el('div', { class: 'pr' },
      el('div', { class: 'pr-header' },
        el('div', { class: 'pr-head-text' }, el('div', { class: 'pr-title' }, T.title), ui.sub),
        el('div', { class: 'pr-actions' },
          soundBtn,
          ui.shopBtn,
          iconButton(ICONS.stats, T.stats, showStats),
          iconButton(ICONS.gear, T.settings, showSettings),
        ),
      ),
      ui.ticket,
      ui.stage,
      el('div', { class: 'pr-bar' }, ui.flipBtn, ui.hintBtn, ui.deliverBtn),
      ui.tools,
      ui.modal,
      toast.el,
    );
    container.append(root);
    applyOptions();
    fx = createFx(ui.stage, 'pr-fx');
    ui.stage.append(fx.canvas);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibility);

    if (isValidState(saved) && !saved.done) {
      game = saved;
      tool = '';
      buildScene();
      buildTicket();
      if (tutorialAuto()) showHint(true);
    } else startOrder(newOrder(progress.level));
    sendProgress();
    if (rulesSeen !== true) {
      if (!saved) showRules();
      api.storage.set('rules', true);
    }

    if (new URLSearchParams(location.search).has('prdebug')) {
      window.__pr = {
        get game() { return game; },
        get progress() { return progress; },
        get busy() { return busy; },
        get modal() { return modalActive; },
        get pc() { return pc; },
        tool: (t) => { tool = t; paintTools(); paintMarks(); },
        tap: (target) => doTool(target),
        flip: () => onFlip(),
        power: () => doPower(),
        deliver: () => onDeliver(),
        hint: () => showHint(true),
        next: () => nextStep(game, progress),
        shop: (want) => showShop(want),
        buy: (p) => buyPart(game.kind, p, null),
        type: (text) => { for (const ch of text) typeKey(ch); },
        enter: () => typeKey('Enter'),
        money: (n) => { progress.money = n; paintTicket(); },
        /** заказ с номером level; faults — свои поломки (['virus', 'water']), kind — устройство */
        start: (level, faults, kind) => startOrder(newOrder(level, faults ?? null, kind ?? null)),
        /** сыграть подсказками без анимации, пока не останется left шагов до сдачи */
        solveExcept: (left = 1) => {
          for (let k = 0; k < 400; k++) {
            const st = nextStep(game, progress);
            if (!st || st.tool === 'deliver') break;
            const copy = structuredClone(game);
            const w = structuredClone(progress);
            let rest = 0;
            for (; rest < 400; rest++) {
              const n = nextStep(copy, w);
              if (!n || n.tool === 'deliver') break;
              act(copy, n.tool, n.target, w);
            }
            if (rest <= left) break;
            act(game, st.tool, st.target, progress);
          }
          clearBugs();
          buildScene();
          after();
        },
        skin: (id) => { settings.skin = id; applyOptions(); },
      };
    }
  },

  getState() {
    if (!game || game.done || !game.moves) return null;
    save();
    return { level: game.level };
  },

  destroy() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    stopBugs();
    stopHeat();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibility);
    if (game && !game.done && game.moves) save();
    toast?.dispose();
    fx?.dispose();
    root?.remove();
    if (host) delete host.dataset.skin;
    api = host = root = ui = toast = fx = game = S = pd = hintShown = pc = null;
    progress = normProgress(null);
    settings = defaultSettings();
    seen = [];
    bugs = [];
    adsGone = new Map();
    tool = overlay = '';
    modalActive = false;
    busy = 0;
    heatLevel = {};
    mood = 'calm';
  },
};
