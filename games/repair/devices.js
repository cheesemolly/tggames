// Устройства мастерской — из каких деталей собраны, что что закрывает, где винты и шлейфы, что ломается.
// Только данные, без DOM: правила (logic.js) общие для всех устройств и читают их отсюда; рисунки — kinds/*.js.
//
// Деталь: side — сторона (back, front; edge — видна с обеих, как отстёгиваемые джойстики); glue — на клею (фен и
// присоска); blockers — что надо снять раньше неё; conn — её шлейф; miss/bad — что не работает без неё / со сломанной;
// price — цена новой в магазине (0 — не продаётся, не ломается); blank — новая приходит без системы (диск).
// Винты: винт → деталь, которую держит. Шлейфы: шлейф → { side, under — что его закрывает }.
// Пятна грязи (spots): tool — чем чистить, part — на какой детали (должна стоять), under — что закрывает,
// side — откуда видно (any — снаружи), power — трогать только без питания (иначе искра), sym — что не работает.
// order — порядок сборки для подсказки (p: деталь, c: шлейф, s: винты детали).

const P = (o = {}) => ({ side: 'back', glue: false, blockers: [], conn: '', miss: '', bad: '', price: 0, blank: false, ...o });

export const DEVICES = {
  phone: {
    name: 'Смартфон',
    portrait: true,
    parts: {
      cover: P({ glue: true, bad: 'blurry', price: 500 }),
      shield: P({ blockers: ['cover'] }),
      bracket: P({ blockers: ['cover'] }),
      battery: P({ blockers: ['cover'], conn: 'bat', price: 700 }),
      camera: P({ blockers: ['cover'], conn: 'cam', miss: 'no-camera', bad: 'no-camera', price: 800 }),
      speaker: P({ blockers: ['cover', 'bracket'], miss: 'no-sound', bad: 'no-sound', price: 300 }),
      port: P({ blockers: ['cover', 'bracket'], conn: 'usb', miss: 'no-charge', bad: 'no-charge', price: 400 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 1200 }),
    },
    screws: { s1: 'shield', s2: 'shield', s3: 'shield', s4: 'shield', s5: 'bracket', s6: 'bracket' },
    conns: {
      bat: { side: 'back', under: ['cover', 'shield'] },
      disp: { side: 'back', under: ['cover', 'shield'] },
      cam: { side: 'back', under: ['cover', 'shield'] },
      usb: { side: 'back', under: ['cover', 'bracket'] },
    },
    battery: 'battery',
    port: 'port',
    spots: {
      jack: { tool: 'brush', part: 'port', under: [], side: 'any', sym: 'no-charge' },
      speaker: { tool: 'brush', part: 'speaker', under: ['cover', 'bracket'], side: 'back', sym: 'quiet' },
      board: { tool: 'alcohol', part: '', under: ['cover', 'shield'], side: 'back', power: true, sym: '' },
    },
    indicator: true,
    virus: true,
    order: ['p:battery', 'p:camera', 'p:port', 'p:speaker', 'p:display', 'c:disp', 'c:cam', 'c:usb', 'c:bat',
      'p:shield', 's:shield', 'p:bracket', 's:bracket', 'p:cover'],
    faults: ['virus', 'bootloop', 'screen-crack', 'screen-flex', 'battery-swollen', 'battery-worn', 'loose-battery', 'water',
      'port-dirty', 'port-broken', 'speaker-dust', 'speaker-broken', 'camera-glass', 'camera-module'],
    models: [
      { name: 'Грушафон 12', code: 'GRF-12', logo: 'pear' },
      { name: 'Комета S9', code: 'KMT-S9', logo: 'star' },
      { name: 'Нимбус 5', code: 'NMB-5', logo: 'cloud' },
      { name: 'Ёжик Мини', code: 'EZH-MINI', logo: 'dot' },
      { name: 'Орбита Про', code: 'ORB-PRO', logo: 'ring' },
      { name: 'Листик 8', code: 'LST-8', logo: 'leaf' },
      { name: 'Капля X', code: 'KPL-X', logo: 'drop' },
    ],
    ext: 'fw',
    version: [11, 16],
  },

  // кнопочный телефон: крышка и батарея снимаются руками, спереди — панель, клавиатура и пластина с экраном
  button: {
    name: 'Кнопочный телефон',
    portrait: true,
    parts: {
      cover: P({}),
      battery: P({ blockers: ['cover'], price: 300 }),
      fascia: P({ side: 'front' }),
      keypad: P({ side: 'front', blockers: ['fascia'], miss: 'no-keys', bad: 'no-keys', price: 250 }),
      plate: P({ side: 'front', blockers: ['fascia', 'keypad'] }),
      display: P({ side: 'front', blockers: ['fascia', 'keypad', 'plate'], conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 400 }),
    },
    screws: { s1: 'plate', s2: 'plate' },
    conns: { disp: { side: 'front', under: ['fascia', 'keypad'] } },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      keys: { tool: 'alcohol', part: 'keypad', under: ['fascia'], side: 'front', sym: 'sticky' },
      board: { tool: 'alcohol', part: '', under: ['fascia', 'keypad'], side: 'front', power: true, sym: '' },
    },
    order: ['p:display', 'c:disp', 'p:plate', 's:plate', 'p:keypad', 'p:fascia', 'p:battery', 'p:cover'],
    faults: ['battery-worn', 'keys-sticky', 'keypad-worn', 'screen-crack', 'water', 'bootloop', 'port-dirty'],
    models: [
      { name: 'Кирпич 3310', code: 'KRP-3310', logo: 'dot' },
      { name: 'Тапик 105', code: 'TPK-105', logo: 'ring' },
      { name: 'Бабушкофон', code: 'BBF-1', logo: 'star' },
    ],
    ext: 'bin',
    version: [3, 8],
  },

  // портативный компьютер с двумя стиками: крышка на винтах, внутри батарея, вентилятор, диск и модули стиков
  deck: {
    name: 'ПарДек',
    portrait: false,
    parts: {
      shell: P({}),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 900 }),
      fan: P({ blockers: ['shell'], conn: 'fan', miss: 'overheat', bad: 'noisy', price: 500 }),
      ssd: P({ blockers: ['shell'], miss: 'no-os', bad: 'no-os', price: 800, blank: true }),
      stickL: P({ blockers: ['shell'], conn: 'stl', miss: 'stick-l', bad: 'stick-l', price: 350 }),
      stickR: P({ blockers: ['shell'], conn: 'str', miss: 'stick-r', bad: 'stick-r', price: 350 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 1100 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell', d1: 'ssd', l1: 'stickL', r1: 'stickR' },
    conns: {
      bat: { side: 'back', under: ['shell'] },
      fan: { side: 'back', under: ['shell'] },
      stl: { side: 'back', under: ['shell'] },
      str: { side: 'back', under: ['shell'] },
      disp: { side: 'back', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      fan: { tool: 'brush', part: 'fan', under: ['shell'], side: 'back', sym: 'overheat' },
    },
    order: ['p:ssd', 's:ssd', 'p:fan', 'p:stickL', 's:stickL', 'p:stickR', 's:stickR', 'p:display', 'p:battery',
      'c:disp', 'c:fan', 'c:stl', 'c:str', 'c:bat', 'p:shell', 's:shell'],
    faults: ['stick-drift-l', 'stick-drift-r', 'fan-dust', 'fan-broken', 'ssd-dead', 'screen-crack', 'battery-worn',
      'loose-battery', 'bootloop', 'port-dirty'],
    models: [
      { name: 'ПарДек LCD', code: 'PDK-LCD', logo: 'ring' },
      { name: 'ПарДек OLED', code: 'PDK-OLED', logo: 'ring' },
    ],
    ext: 'img',
    version: [3, 6],
  },

  // приставка-планшет с отстёгиваемыми джойконами по бокам
  switch: {
    name: 'Свичер',
    portrait: false,
    parts: {
      joyL: P({ side: 'edge', miss: 'joy-l', bad: 'joy-l', price: 600 }),
      joyR: P({ side: 'edge', miss: 'joy-r', bad: 'joy-r', price: 600 }),
      shell: P({ blockers: ['joyL', 'joyR'] }),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 700 }),
      fan: P({ blockers: ['shell'] }),
      cart: P({ blockers: ['shell'], conn: 'crt', miss: 'no-cart', bad: 'no-cart', price: 450 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 900 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell' },
    conns: {
      bat: { side: 'back', under: ['shell'] },
      crt: { side: 'back', under: ['shell'] },
      disp: { side: 'back', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      slot: { tool: 'brush', part: 'cart', under: [], side: 'any', sym: 'no-cart' },
      fan: { tool: 'brush', part: 'fan', under: ['shell'], side: 'back', sym: 'overheat' },
    },
    order: ['p:fan', 'p:cart', 'p:display', 'p:battery', 'c:disp', 'c:crt', 'c:bat', 'p:shell', 's:shell', 'p:joyL', 'p:joyR'],
    faults: ['joy-drift-l', 'joy-drift-r', 'cart-dirty', 'cart-broken', 'fan-dust', 'screen-crack', 'battery-swollen',
      'loose-battery', 'bootloop', 'port-dirty'],
    models: [
      { name: 'Свичер', code: 'SVC-1', logo: 'drop' },
      { name: 'Свичер OLED', code: 'SVC-OLED', logo: 'drop' },
    ],
    ext: 'pkg',
    version: [17, 20],
  },

  // карманная приставка с дисками: батарея за дверцей, корпус на винтах — только без батареи
  psp: {
    name: 'Карманка',
    portrait: false,
    parts: {
      door: P({}),
      battery: P({ blockers: ['door'], price: 400 }),
      shell: P({ blockers: ['door', 'battery'] }),
      umd: P({ blockers: ['shell'], conn: 'umd', miss: 'no-disc', bad: 'no-disc', price: 650 }),
      nub: P({ blockers: ['shell'], conn: 'nub', miss: 'nub', bad: 'nub', price: 250 }),
      display: P({ side: 'front', conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 700 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell' },
    conns: {
      umd: { side: 'back', under: ['shell'] },
      nub: { side: 'back', under: ['shell'] },
      disp: { side: 'back', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      board: { tool: 'alcohol', part: '', under: ['shell'], side: 'back', power: true, sym: '' },
    },
    order: ['p:umd', 'p:nub', 'p:display', 'c:disp', 'c:umd', 'c:nub', 'p:shell', 's:shell', 'p:battery', 'p:door'],
    faults: ['battery-worn', 'umd-dead', 'nub-drift', 'screen-crack', 'water', 'bootloop', 'port-dirty'],
    models: [
      { name: 'Карманка 1000', code: 'KRM-1000', logo: 'star' },
      { name: 'Карманка 3000', code: 'KRM-3000', logo: 'star' },
    ],
    ext: 'pbp',
    version: [5, 7],
  },
};

export const KINDS = Object.keys(DEVICES);

/** Поломки: что меняют в устройстве; labor — плата за работу (детали клиент оплачивает сверху). */
export const FAULT_DEFS = {
  virus: { group: 'soft', soft: 'virus', labor: 300 },
  bootloop: { group: 'soft', soft: 'bootloop', labor: 500 },
  'screen-crack': { group: 'screen', part: 'display', value: 'crack', labor: 500 },
  'screen-flex': { group: 'screen', conn: 'disp', labor: 400 },
  'battery-swollen': { group: 'battery', part: 'battery', value: 'swollen', labor: 300 },
  'battery-worn': { group: 'battery', part: 'battery', value: 'worn', labor: 200 },
  'loose-battery': { group: 'battery', conn: 'bat', labor: 300 },
  water: { group: 'water', spot: 'board', wet: true, labor: 700 },
  'port-dirty': { group: 'port', spot: 'jack', labor: 200 },
  'port-broken': { group: 'port', part: 'port', value: 'burnt', labor: 500 },
  'speaker-dust': { group: 'speaker', spot: 'speaker', labor: 300 },
  'speaker-broken': { group: 'speaker', part: 'speaker', value: 'torn', labor: 300 },
  'camera-glass': { group: 'camera', part: 'cover', value: 'glass', labor: 200 },
  'camera-module': { group: 'camera', part: 'camera', value: 'dead', labor: 400 },
  'keys-sticky': { group: 'keys', spot: 'keys', labor: 300 },
  'keypad-worn': { group: 'keys', part: 'keypad', value: 'worn', labor: 200 },
  'stick-drift-l': { group: 'stick', part: 'stickL', value: 'drift', labor: 500 },
  'stick-drift-r': { group: 'stick', part: 'stickR', value: 'drift', labor: 500 },
  'fan-dust': { group: 'fan', spot: 'fan', labor: 400 },
  'fan-broken': { group: 'fan', part: 'fan', value: 'grind', labor: 400 },
  'ssd-dead': { group: 'ssd', part: 'ssd', value: 'dead', labor: 700 },
  'joy-drift-l': { group: 'joy', part: 'joyL', value: 'drift', labor: 200 },
  'joy-drift-r': { group: 'joy', part: 'joyR', value: 'drift', labor: 200 },
  'cart-dirty': { group: 'cart', spot: 'slot', labor: 200 },
  'cart-broken': { group: 'cart', part: 'cart', value: 'dead', labor: 500 },
  'umd-dead': { group: 'umd', part: 'umd', value: 'dead', labor: 500 },
  'nub-drift': { group: 'nub', part: 'nub', value: 'drift', labor: 400 },
};
export const FAULTS = Object.keys(FAULT_DEFS);

/** Жалобы клиентов: общие и свои у устройства (похожие у разных поломок — есть что диагностировать). */
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
    'Сел на него. Экран в трещинах.',
    'Выпал из рук на асфальт, стекло паутиной.',
  ],
  'screen-flex': [
    'После падения экран чёрный, но звонки слышно.',
    'Экран мигает и гаснет, хотя ни одной трещины.',
  ],
  'battery-swollen': [
    'Крышка сзади отходит, корпус стал толще.',
    'Качается на столе, будто его раздуло.',
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
  'speaker-dust': ['Музыку еле слышно, звук глухой.', 'Звук будто через подушку.'],
  'speaker-broken': ['Динамик хрипел, а теперь молчит.', 'Звука нет совсем, даже будильник не слышно.'],
  'camera-glass': ['На всех фото мутное пятно.', 'Камера снимает как через туман.'],
  'camera-module': ['Камера показывает чёрный экран.', 'Камера не открывается — чёрный квадрат.'],
  'keys-sticky': ['Пролил сладкий чай — кнопки залипают.', 'Кнопки липкие и нажимаются через раз.'],
  'keypad-worn': ['Цифры 2 и 5 не нажимаются, номер не набрать.', 'Кнопки стёрлись и не реагируют.'],
  'stick-drift-l': ['Персонаж сам идёт влево, хотя стик не трогаю.', 'Левый стик дрейфует — камера уезжает.'],
  'stick-drift-r': ['Камера в играх сама крутится.', 'Правый стик живёт своей жизнью.'],
  'fan-dust': ['Греется как утюг и выключается в играх.', 'Горячий, тормозит, а вентилятор еле дует.'],
  'fan-broken': ['Внутри что-то скрежещет и жужжит.', 'Гудит как трактор, а потом перегревается.'],
  'ssd-dead': ['Пишет «система не найдена».', 'Включается, а дальше — «нет загрузочного диска».'],
  'joy-drift-l': ['Левый джойстик сам ведёт персонажа.', 'Левый контроллер дрейфует — в играх не управлять.'],
  'joy-drift-r': ['Правый джойстик тянет камеру в сторону.', 'Правый контроллер сам нажимает направления.'],
  'cart-dirty': ['Не видит картриджи, только иногда.', 'Картридж приходится вставлять по десять раз.'],
  'cart-broken': ['Не видит ни один картридж.', 'Пишет «вставьте картридж», хотя он вставлен.'],
  'umd-dead': ['Диск не крутится, игры не запускаются.', 'Пишет «нет диска», а он внутри.'],
  'nub-drift': ['Аналоговая шишечка сама ведёт героя.', 'Персонаж бежит сам, стоит только включить игру.'],
};

/** Обучение: заказ → [устройство, поломка]. Остальные заказы — случайные среди уже показанных устройств. */
export const TUTORIAL = {
  1: ['phone', 'virus'], 2: ['phone', 'screen-crack'], 3: ['phone', 'port-dirty'], 4: ['phone', 'battery-swollen'],
  5: ['phone', 'screen-flex'], 6: ['phone', 'speaker-dust'], 7: ['phone', 'loose-battery'], 8: ['phone', 'camera-glass'],
  9: ['phone', 'bootloop'], 10: ['phone', 'port-broken'], 11: ['phone', 'water'], 12: ['phone', 'speaker-broken'],
  13: ['phone', 'battery-worn'], 14: ['phone', 'camera-module'],
  15: ['button', 'keys-sticky'], 17: ['deck', 'stick-drift-l'], 19: ['deck', 'ssd-dead'], 21: ['switch', 'joy-drift-r'],
  23: ['psp', 'umd-dead'], 25: ['switch', 'cart-dirty'],
};
/** С какого заказа устройство приходит в мастерскую. */
export const UNLOCK = { phone: 1, button: 15, deck: 17, switch: 21, psp: 23 };
const KIND_WEIGHT = { phone: 5, button: 2, deck: 2, switch: 2, psp: 2 };

export const pickKind = (level, rng) => {
  const open = KINDS.filter((k) => UNLOCK[k] <= level);
  const total = open.reduce((a, k) => a + KIND_WEIGHT[k], 0);
  let x = rng() * total;
  for (const k of open) {
    x -= KIND_WEIGHT[k];
    if (x < 0) return k;
  }
  return open[open.length - 1];
};

/** Шлейф → деталь, чей он. */
export function connOwner(kind, c) {
  const parts = DEVICES[kind].parts;
  return Object.keys(parts).find((p) => parts[p].conn === c) ?? '';
}

/** Детали, которые закрывает p (у кого p среди blockers). */
export function coveredBy(kind, p) {
  const parts = DEVICES[kind].parts;
  return Object.keys(parts).filter((q) => parts[q].blockers.includes(p));
}

export const screwsOf = (kind, holder) => Object.keys(DEVICES[kind].screws).filter((id) => DEVICES[kind].screws[id] === holder);

/** Запчасти магазина: что продаётся для устройства. */
export const shopParts = (kind) => Object.keys(DEVICES[kind].parts).filter((p) => DEVICES[kind].parts[p].price > 0);
export const stockKey = (kind, p) => `${kind}-${p}`;
