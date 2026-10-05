// Устройства мастерской — из каких деталей собраны, что что закрывает, где винты и шлейфы, что ломается.
// Только данные, без DOM: правила (logic.js) общие для всех устройств и читают их отсюда; рисунки — kinds/*.js.
//
// Деталь: side — сторона (back, front; edge — видна с обеих, как отстёгиваемые джойстики); glue — на клею (фен и
// присоска); blockers — что надо снять раньше неё; conn — её шлейф; miss/bad — что не работает без неё / со сломанной;
// price — цена новой в магазине в долларах (0 — не продаётся, не ломается); blank — новая приходит без системы (диск);
// wipe — снимается спиртом (стереть), consumable — расходник: старую обратно не поставить, только новую (термопаста).
// Винты: винт → деталь, которую держит. Шлейфы: шлейф → { side, under — что его закрывает }.
// Пятна (spots): tool — чем исправлять (кисточка, спирт, пинцет — выпрямить ножки), part — на какой детали, under — что закрывает,
// side — откуда видно (any — снаружи), power — трогать только без питания (иначе искра), sym — что не работает.
// order — порядок сборки для подсказки (p: деталь, c: шлейф, s: винты детали). battery: '' — без батареи (комплектующие
// ПК: питание даёт стенд, искр нет); noJack — нет гнезда (не заряжается и не прошивается);
// noFlash — к компьютеру не подключить (видеокарта: «гнездо» — контакты PCIe, их только чистят).

const P = (o = {}) => ({ side: 'back', glue: false, blockers: [], conn: '', miss: '', bad: '', price: 0, blank: false, ...o });

export const DEVICES = {
  phone: {
    name: 'Смартфон',
    portrait: true,
    parts: {
      cover: P({ glue: true, bad: 'blurry', price: 25 }),
      shield: P({ blockers: ['cover'] }),
      bracket: P({ blockers: ['cover'] }),
      battery: P({ blockers: ['cover'], conn: 'bat', price: 35 }),
      camera: P({ blockers: ['cover'], conn: 'cam', miss: 'no-camera', bad: 'no-camera', price: 40 }),
      speaker: P({ blockers: ['cover', 'bracket'], miss: 'no-sound', bad: 'no-sound', price: 15 }),
      port: P({ blockers: ['cover', 'bracket'], conn: 'usb', miss: 'no-charge', bad: 'no-charge', price: 20 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 60 }),
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
      battery: P({ blockers: ['cover'], price: 15 }),
      fascia: P({ side: 'front' }),
      keypad: P({ side: 'front', blockers: ['fascia'], miss: 'no-keys', bad: 'no-keys', price: 12 }),
      plate: P({ side: 'front', blockers: ['fascia', 'keypad'] }),
      display: P({ side: 'front', blockers: ['fascia', 'keypad', 'plate'], conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 20 }),
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
      battery: P({ blockers: ['shell'], conn: 'bat', price: 45 }),
      fan: P({ blockers: ['shell'], conn: 'fan', miss: 'overheat', bad: 'noisy', price: 25 }),
      ssd: P({ blockers: ['shell'], miss: 'no-os', bad: 'no-os', price: 40, blank: true }),
      stickL: P({ blockers: ['shell'], conn: 'stl', miss: 'stick-l', bad: 'stick-l', price: 18 }),
      stickR: P({ blockers: ['shell'], conn: 'str', miss: 'stick-r', bad: 'stick-r', price: 18 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 55 }),
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
      joyL: P({ side: 'edge', miss: 'joy-l', bad: 'joy-l', price: 30 }),
      joyR: P({ side: 'edge', miss: 'joy-r', bad: 'joy-r', price: 30 }),
      shell: P({ blockers: ['joyL', 'joyR'] }),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 35 }),
      fan: P({ blockers: ['shell'] }),
      cart: P({ blockers: ['shell'], conn: 'crt', miss: 'no-cart', bad: 'no-cart', price: 22 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 45 }),
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
      battery: P({ blockers: ['door'], price: 20 }),
      shell: P({ blockers: ['door', 'battery'] }),
      umd: P({ blockers: ['shell'], conn: 'umd', miss: 'no-disc', bad: 'no-disc', price: 32 }),
      nub: P({ blockers: ['shell'], conn: 'nub', miss: 'nub', bad: 'nub', price: 12 }),
      display: P({ side: 'front', conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 35 }),
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

  // беспроводные наушники-вкладыши: в кейсе два наушника, кейс на клею, внутри батарея
  earbuds: {
    name: 'Наушники-вкладыши',
    portrait: true,
    parts: {
      budL: P({ side: 'front', miss: 'bud-l', bad: 'bud-l', price: 30 }),
      budR: P({ side: 'front', miss: 'bud-r', bad: 'bud-r', price: 30 }),
      shell: P({ glue: true }),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 12 }),
    },
    screws: {},
    conns: { bat: { side: 'back', under: ['shell'] } },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      waxL: { tool: 'brush', part: 'budL', under: [], side: 'front', sym: 'quiet-l' },
      waxR: { tool: 'brush', part: 'budR', under: [], side: 'front', sym: 'quiet-r' },
    },
    order: ['p:battery', 'c:bat', 'p:shell', 'p:budL', 'p:budR'],
    faults: ['bud-dead-l', 'bud-dead-r', 'wax-l', 'wax-r', 'battery-worn', 'port-dirty', 'bootloop'],
    models: [{ name: 'Бусинки Про', code: 'BSN-PRO', logo: 'drop' }, { name: 'Капельки 2', code: 'BDS-2', logo: 'dot' }],
    ext: 'dfu',
    version: [2, 6],
  },

  // накладные наушники: амбушюры снимаются руками, под ними динамики; батарея — в левой чашке
  headphones: {
    name: 'Накладные наушники',
    portrait: true,
    parts: {
      band: P({ side: 'front', bad: 'band', price: 18 }),
      padL: P({ side: 'front', bad: 'pads', price: 8 }),
      padR: P({ side: 'front', bad: 'pads', price: 8 }),
      battery: P({ side: 'front', blockers: ['padL'], conn: 'bat', price: 15 }),
      driverL: P({ side: 'front', blockers: ['padL'], conn: 'dl', miss: 'no-sound-l', bad: 'no-sound-l', price: 20 }),
      driverR: P({ side: 'front', blockers: ['padR'], conn: 'dr', miss: 'no-sound-r', bad: 'no-sound-r', price: 20 }),
    },
    screws: {},
    conns: {
      bat: { side: 'front', under: ['padL'] },
      dl: { side: 'front', under: ['padL'] },
      dr: { side: 'front', under: ['padR'] },
    },
    battery: 'battery',
    port: '',
    spots: { jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' } },
    order: ['p:battery', 'p:driverL', 'p:driverR', 'c:dl', 'c:dr', 'c:bat', 'p:padL', 'p:padR', 'p:band'],
    faults: ['driver-l', 'driver-r', 'pads-worn', 'band-crack', 'battery-worn', 'port-dirty', 'bootloop'],
    models: [{ name: 'Облака 700', code: 'OBL-700', logo: 'cloud' }, { name: 'Басы Макс', code: 'BAS-MAX', logo: 'ring' }],
    ext: 'dfu',
    version: [1, 5],
  },

  // беспроводная мышь: снизу дверца с батарейкой, ножки, под ними винты; внутри микрики и колёсико
  mouse: {
    name: 'Мышь',
    portrait: true,
    parts: {
      door: P({}),
      battery: P({ blockers: ['door'], price: 3 }),
      feet: P({ bad: 'glide', price: 4 }),
      shell: P({ blockers: ['feet', 'door', 'battery'] }),
      switchL: P({ blockers: ['shell'], miss: 'click-l', bad: 'click-l', price: 3 }),
      switchR: P({ blockers: ['shell'], miss: 'click-r', bad: 'click-r', price: 3 }),
      wheel: P({ blockers: ['shell'], miss: 'scroll', bad: 'scroll', price: 5 }),
    },
    screws: { h1: 'shell', h2: 'shell' },
    conns: {},
    battery: 'battery',
    port: '',
    noJack: true,
    spots: {
      lens: { tool: 'brush', part: '', under: [], side: 'back', sym: 'cursor' },
      wheel: { tool: 'brush', part: 'wheel', under: ['shell'], side: 'back', sym: 'scroll' },
    },
    order: ['p:switchL', 'p:switchR', 'p:wheel', 'p:shell', 's:shell', 'p:battery', 'p:door', 'p:feet'],
    faults: ['click-double-l', 'click-double-r', 'wheel-dirty', 'wheel-broken', 'lens-dirty', 'feet-worn', 'battery-worn'],
    models: [{ name: 'Грызун М2', code: 'GRZ-M2', logo: 'dot' }, { name: 'Хвостик', code: 'HVS-1', logo: 'leaf' }],
    ext: 'bin',
    version: [1, 3],
  },

  // механическая клавиатура: сверху колпачки и свитчи, снизу дно на 4 винтах, внутри кабель и плата
  keyboard: {
    name: 'Клавиатура',
    portrait: false,
    parts: {
      keycaps: P({ side: 'front', bad: 'caps', price: 15 }),
      switch: P({ side: 'front', blockers: ['keycaps'], miss: 'double-type', bad: 'double-type', price: 4 }),
      case: P({}),
      cable: P({ blockers: ['case'], conn: 'cab', miss: 'no-keys', bad: 'disconnects', price: 8 }),
      pcb: P({ blockers: ['case', 'cable'], miss: 'no-keys', bad: 'no-keys', price: 25 }),
    },
    screws: { h1: 'case', h2: 'case', h3: 'case', h4: 'case' },
    conns: { cab: { side: 'back', under: ['case'] } },
    battery: '',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      crumbs: { tool: 'brush', part: '', under: ['keycaps'], side: 'front', sym: 'keys-stuck' },
      keys: { tool: 'alcohol', part: '', under: ['keycaps'], side: 'front', sym: 'sticky' },
    },
    order: ['p:pcb', 'p:cable', 'c:cab', 'p:case', 's:case', 'p:switch', 'p:keycaps'],
    faults: ['crumbs', 'keys-sticky', 'switch-chatter', 'cable-frayed', 'pcb-dead', 'caps-worn', 'bootloop'],
    models: [{ name: 'Клацалка 87', code: 'KLC-87', logo: 'star' }, { name: 'Тык-Тык', code: 'TKT-60', logo: 'dot' }],
    ext: 'hex',
    version: [2, 9],
  },

  // жёсткий диск: сверху крышка на 4 винтах, под ней головки и пластина; снизу плата контроллера на 3 винтах
  hdd: {
    name: 'Жёсткий диск',
    portrait: false,
    parts: {
      lid: P({ side: 'front' }),
      heads: P({ side: 'front', blockers: ['lid'], conn: 'arm', miss: 'clicking', bad: 'clicking', price: 25 }),
      platter: P({ side: 'front', blockers: ['lid', 'heads'], miss: 'bad-sectors', bad: 'bad-sectors', price: 30 }),
      pcb: P({ miss: 'not-detected', bad: 'not-detected', price: 20 }),
    },
    screws: { h1: 'lid', h2: 'lid', h3: 'lid', h4: 'lid', p1: 'pcb', p2: 'pcb', p3: 'pcb' },
    conns: { arm: { side: 'front', under: ['lid'] } },
    battery: '',
    port: '',
    spots: { jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'not-detected' } },
    order: ['p:platter', 'p:heads', 'c:arm', 'p:lid', 's:lid', 'p:pcb', 's:pcb'],
    faults: ['heads-stuck', 'platter-scratched', 'pcb-dead', 'port-dirty', 'bootloop'],
    models: [{ name: 'Блин 2ТБ', code: 'BLN-2T', logo: 'ring' }, { name: 'Склад 4ТБ', code: 'SKL-4T', logo: 'ring' }],
    ext: 'fw',
    version: [1, 4],
  },

  // материнская плата: батарейка BIOS, память, радиатор питания на винтах, под ним конденсатор
  motherboard: {
    name: 'Материнская плата',
    portrait: true,
    parts: {
      cmos: P({ side: 'front', miss: 'bios-reset', bad: 'bios-reset', price: 2 }),
      ram: P({ side: 'front', miss: 'no-boot', bad: 'no-boot', price: 30 }),
      heatsink: P({ side: 'front' }),
      cap: P({ side: 'front', blockers: ['heatsink'], miss: 'reboots', bad: 'reboots', price: 3 }),
    },
    screws: { k1: 'heatsink', k2: 'heatsink' },
    conns: {},
    battery: '',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'not-detected' },
      heatsink: { tool: 'brush', part: 'heatsink', under: [], side: 'front', sym: 'overheat' },
      board: { tool: 'alcohol', part: '', under: [], side: 'front', power: true, sym: '' },
    },
    order: ['p:cap', 'p:heatsink', 's:heatsink', 'p:ram', 'p:cmos'],
    faults: ['cmos-dead', 'ram-dead', 'cap-swollen', 'heatsink-dust', 'water', 'bootloop'],
    models: [{ name: 'Мать Z90', code: 'MAT-Z90', logo: 'star' }, { name: 'Плата B60', code: 'PLT-B60', logo: 'ring' }],
    ext: 'rom',
    version: [3, 9],
  },

  // видеокарта: кожух на 4 винтах → вентиляторы → радиатор на 2 винтах → память; контакты — снаружи
  gpu: {
    name: 'Видеокарта',
    portrait: false,
    parts: {
      shroud: P({ side: 'front' }),
      fan: P({ side: 'front', blockers: ['shroud'], conn: 'fan', miss: 'overheat', bad: 'noisy', price: 20 }),
      heatsink: P({ side: 'front', blockers: ['shroud', 'fan'] }),
      vram: P({ side: 'front', blockers: ['heatsink'], miss: 'artifacts', bad: 'artifacts', price: 35 }),
      paste: P({ side: 'front', blockers: ['heatsink'], wipe: true, consumable: true, miss: 'overheat', bad: 'overheat', price: 3 }),
    },
    screws: { g1: 'shroud', g2: 'shroud', g3: 'shroud', g4: 'shroud', k1: 'heatsink', k2: 'heatsink' },
    conns: { fan: { side: 'front', under: ['shroud'] } },
    battery: '',
    port: '',
    spots: {
      jack: { tool: 'alcohol', part: '', under: [], side: 'any', sym: 'not-detected' },
      fan: { tool: 'brush', part: 'fan', under: ['shroud'], side: 'front', sym: 'overheat' },
      heatsink: { tool: 'brush', part: 'heatsink', under: ['shroud', 'fan'], side: 'front', sym: 'overheat' },
    },
    order: ['p:vram', 'p:paste', 'p:heatsink', 's:heatsink', 'p:fan', 'c:fan', 'p:shroud', 's:shroud'],
    faults: ['fan-broken', 'fan-dust', 'paste-dry', 'heatsink-dust', 'vram-dead', 'pcie-dirty'],
    noFlash: true,
    models: [{ name: 'Жар-Птица 4070', code: 'ZHP-4070', logo: 'star' }, { name: 'Радуга 7800', code: 'RDG-7800', logo: 'drop' }],
    ext: 'rom',
    version: [86, 95],
  },

  // процессор с кулером: кулер на 4 винтах, под ним термопаста; снизу — ножки
  cpu: {
    name: 'Процессор',
    portrait: true,
    parts: {
      cooler: P({ side: 'front', miss: 'overheat', bad: 'noisy', price: 15 }),
      paste: P({ side: 'front', blockers: ['cooler'], wipe: true, consumable: true, miss: 'overheat', bad: 'overheat', price: 3 }),
    },
    screws: { c1: 'cooler', c2: 'cooler', c3: 'cooler', c4: 'cooler' },
    conns: {},
    battery: '',
    port: '',
    noJack: true,
    spots: {
      cooler: { tool: 'brush', part: 'cooler', under: [], side: 'front', sym: 'overheat' },
      pins: { tool: 'tweezers', part: '', under: [], side: 'back', sym: 'no-boot' },
    },
    order: ['p:paste', 'p:cooler', 's:cooler'],
    faults: ['cooler-broken', 'cooler-dust', 'paste-dry', 'pins-bent'],
    models: [{ name: 'Камень 9', code: 'KMN-9', logo: 'ring' }, { name: 'Ядро 7', code: 'YDR-7', logo: 'star' }],
    ext: 'bin',
    version: [1, 2],
  },

  // планшет: как смартфон, только больше — крышка на клею, экран платы на винтах, батарея, динамик, зарядка
  tablet: {
    name: 'Планшет',
    portrait: true,
    parts: {
      cover: P({ glue: true, price: 30 }),
      shield: P({ blockers: ['cover'] }),
      battery: P({ blockers: ['cover'], conn: 'bat', price: 45 }),
      speaker: P({ blockers: ['cover'], miss: 'no-sound', bad: 'no-sound', price: 15 }),
      port: P({ blockers: ['cover'], conn: 'usb', miss: 'no-charge', bad: 'no-charge', price: 20 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 90 }),
    },
    screws: { s1: 'shield', s2: 'shield', s3: 'shield', s4: 'shield' },
    conns: {
      bat: { side: 'back', under: ['cover', 'shield'] },
      disp: { side: 'back', under: ['cover', 'shield'] },
      usb: { side: 'back', under: ['cover'] },
    },
    battery: 'battery',
    port: 'port',
    spots: {
      jack: { tool: 'brush', part: 'port', under: [], side: 'any', sym: 'no-charge' },
      speaker: { tool: 'brush', part: 'speaker', under: ['cover'], side: 'back', sym: 'quiet' },
      board: { tool: 'alcohol', part: '', under: ['cover', 'shield'], side: 'back', power: true, sym: '' },
    },
    virus: true,
    order: ['p:battery', 'p:port', 'p:speaker', 'p:display', 'c:disp', 'c:usb', 'c:bat', 'p:shield', 's:shield', 'p:cover'],
    faults: ['virus', 'bootloop', 'screen-crack', 'screen-flex', 'battery-swollen', 'battery-worn', 'port-dirty', 'port-broken',
      'speaker-dust', 'speaker-broken', 'water'],
    models: [{ name: 'Скрижаль 11', code: 'SKR-11', logo: 'pear' }, { name: 'Комета Таб', code: 'KMT-TAB', logo: 'star' }],
    ext: 'fw',
    version: [14, 18],
  },

  // ноутбук: спереди экран и клавиатура, снизу дно на 4 винтах — батарея, вентилятор, память, диск
  laptop: {
    name: 'Ноутбук',
    portrait: false,
    lid: true,
    parts: {
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 80 }),
      keypad: P({ side: 'front', conn: 'kbd', miss: 'no-keys', bad: 'no-keys', price: 35 }),
      bottom: P({}),
      battery: P({ blockers: ['bottom'], conn: 'bat', price: 50 }),
      fan: P({ blockers: ['bottom'], conn: 'fan', miss: 'overheat', bad: 'noisy', price: 20 }),
      ram: P({ blockers: ['bottom'], miss: 'no-boot', bad: 'no-boot', price: 30 }),
      ssd: P({ blockers: ['bottom'], miss: 'no-os', bad: 'no-os', price: 45, blank: true }),
    },
    screws: { h1: 'bottom', h2: 'bottom', h3: 'bottom', h4: 'bottom', d1: 'ssd' },
    conns: {
      bat: { side: 'back', under: ['bottom'] },
      fan: { side: 'back', under: ['bottom'] },
      disp: { side: 'back', under: ['bottom'] },
      kbd: { side: 'back', under: ['bottom'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      keys: { tool: 'alcohol', part: 'keypad', under: [], side: 'front', sym: 'sticky' },
      fan: { tool: 'brush', part: 'fan', under: ['bottom'], side: 'back', sym: 'overheat' },
    },
    virus: true,
    order: ['p:ram', 'p:ssd', 's:ssd', 'p:fan', 'p:battery', 'p:display', 'p:keypad', 'c:disp', 'c:kbd', 'c:fan', 'c:bat',
      'p:bottom', 's:bottom'],
    faults: ['screen-crack', 'keys-sticky', 'keypad-worn', 'fan-dust', 'fan-broken', 'ssd-dead', 'ram-dead', 'battery-worn',
      'loose-battery', 'virus', 'bootloop', 'port-dirty'],
    models: [{ name: 'Буклет Эйр', code: 'BKL-AIR', logo: 'pear' }, { name: 'Рабочая Лошадка', code: 'RBL-15', logo: 'leaf' }],
    ext: 'img',
    version: [10, 14],
  },

  // умные часы: экран спереди, сзади крышка с датчиком на клею — под ней батарея и шлейфы; ремешок
  watch: {
    name: 'Умные часы',
    portrait: true,
    parts: {
      strap: P({ side: 'front', bad: 'strap', price: 10 }),
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 40 }),
      sensor: P({ glue: true, miss: 'no-pulse', bad: 'no-pulse', price: 15 }),
      battery: P({ blockers: ['sensor'], conn: 'bat', price: 12 }),
    },
    screws: {},
    conns: {
      bat: { side: 'back', under: ['sensor'] },
      disp: { side: 'back', under: ['sensor'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'back', sym: 'no-charge' },
      sensor: { tool: 'brush', part: 'sensor', under: [], side: 'back', sym: 'no-pulse' },
      board: { tool: 'alcohol', part: '', under: ['sensor'], side: 'back', power: true, sym: '' },
    },
    order: ['p:display', 'p:battery', 'c:disp', 'c:bat', 'p:sensor', 'p:strap'],
    faults: ['screen-crack', 'battery-worn', 'battery-swollen', 'strap-torn', 'sensor-dirty', 'water', 'bootloop', 'port-dirty'],
    models: [{ name: 'Пульс 5', code: 'PLS-5', logo: 'drop' }, { name: 'Шагомер Ультра', code: 'SHG-U', logo: 'ring' }],
    ext: 'fw',
    version: [7, 11],
  },

  // геймпад: снизу корпус на 4 винтах — батарея, модули стиков на винтах, вибромотор; липкие кнопки — изнутри
  gamepad: {
    name: 'Геймпад',
    portrait: false,
    parts: {
      shell: P({}),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 15 }),
      stickL: P({ blockers: ['shell'], conn: 'stl', miss: 'stick-l', bad: 'stick-l', price: 10 }),
      stickR: P({ blockers: ['shell'], conn: 'str', miss: 'stick-r', bad: 'stick-r', price: 10 }),
      rumble: P({ blockers: ['shell'], conn: 'rmb', miss: 'no-vibro', bad: 'no-vibro', price: 6 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell', l1: 'stickL', r1: 'stickR' },
    conns: {
      bat: { side: 'back', under: ['shell'] },
      stl: { side: 'back', under: ['shell'] },
      str: { side: 'back', under: ['shell'] },
      rmb: { side: 'back', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      keys: { tool: 'alcohol', part: '', under: ['shell'], side: 'back', power: true, sym: 'sticky' },
    },
    order: ['p:stickL', 's:stickL', 'p:stickR', 's:stickR', 'p:rumble', 'p:battery', 'c:stl', 'c:str', 'c:rmb', 'c:bat',
      'p:shell', 's:shell'],
    faults: ['stick-drift-l', 'stick-drift-r', 'rumble-dead', 'keys-sticky', 'battery-worn', 'loose-battery', 'port-dirty', 'bootloop'],
    models: [{ name: 'Джойстик Ультра', code: 'DJS-U', logo: 'star' }, { name: 'Пульт Про', code: 'PLT-PRO', logo: 'ring' }],
    ext: 'bin',
    version: [3, 7],
  },

  // пауэрбанк: корпус на защёлках, внутри банки аккумулятора со шлейфом и плата
  powerbank: {
    name: 'Пауэрбанк',
    portrait: true,
    parts: {
      shell: P({}),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 18 }),
      pcb: P({ blockers: ['shell'], miss: 'no-output', bad: 'no-output', price: 10 }),
    },
    screws: { h1: 'shell', h2: 'shell' },
    conns: { bat: { side: 'back', under: ['shell'] } },
    battery: 'battery',
    port: '',
    spots: { jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' } },
    order: ['p:pcb', 'p:battery', 'c:bat', 'p:shell', 's:shell'],
    faults: ['battery-swollen', 'battery-worn', 'loose-battery', 'pcb-dead', 'port-dirty'],
    models: [{ name: 'Кирпичик 20000', code: 'KRP-20K', logo: 'dot' }, { name: 'Заряжайка', code: 'ZRJ-10K', logo: 'star' }],
    ext: 'bin',
    version: [1, 3],
  },

  // умная колонка: спереди сетка на защёлках, под ней динамик; снизу дно на винтах — микрофоны
  speaker: {
    name: 'Умная колонка',
    portrait: true,
    parts: {
      grille: P({ side: 'front' }),
      speaker: P({ side: 'front', blockers: ['grille'], conn: 'drv', miss: 'no-sound', bad: 'no-sound', price: 20 }),
      base: P({}),
      mic: P({ blockers: ['base'], miss: 'deaf', bad: 'deaf', price: 8 }),
    },
    screws: { h1: 'base', h2: 'base', h3: 'base', h4: 'base' },
    conns: { drv: { side: 'front', under: ['grille'] } },
    battery: '',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-power' },
      grille: { tool: 'brush', part: 'grille', under: [], side: 'front', sym: 'quiet' },
      board: { tool: 'alcohol', part: '', under: ['base'], side: 'back', power: true, sym: '' },
    },
    order: ['p:speaker', 'c:drv', 'p:grille', 'p:mic', 'p:base', 's:base'],
    faults: ['speaker-broken', 'grille-dust', 'mic-dead', 'water', 'bootloop', 'port-dirty'],
    models: [{ name: 'Шептунья Мини', code: 'SHP-MINI', logo: 'ring' }, { name: 'Болтушка', code: 'BLT-2', logo: 'cloud' }],
    ext: 'fw',
    version: [4, 8],
  },

  // квадрокоптер: сверху пропеллеры и камера, корпус на 4 винтах — мотор; снизу съёмная батарея
  drone: {
    name: 'Квадрокоптер',
    portrait: false,
    parts: {
      props: P({ side: 'front', miss: 'no-fly', bad: 'no-fly', price: 8 }),
      gimbal: P({ side: 'front', conn: 'gim', miss: 'no-camera', bad: 'no-camera', price: 40 }),
      shell: P({ side: 'front', blockers: ['props'] }),
      motor: P({ side: 'front', blockers: ['shell'], conn: 'mot', miss: 'motor', bad: 'motor', price: 20 }),
      battery: P({ price: 30 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell' },
    conns: {
      gim: { side: 'front', under: ['shell'] },
      mot: { side: 'front', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      board: { tool: 'alcohol', part: '', under: ['shell'], side: 'front', power: true, sym: '' },
    },
    order: ['p:motor', 'p:gimbal', 'c:gim', 'c:mot', 'p:shell', 's:shell', 'p:props', 'p:battery'],
    faults: ['props-broken', 'motor-dead', 'gimbal-dead', 'battery-worn', 'battery-swollen', 'water', 'bootloop'],
    models: [{ name: 'Квадрик Мини', code: 'KVD-MINI', logo: 'star' }, { name: 'Стрекоза 3', code: 'STR-3', logo: 'leaf' }],
    ext: 'bin',
    version: [5, 9],
  },

  // шлем виртуальной реальности: со стороны лица — накладка и линзы, под накладкой экран; снаружи панель на винтах
  vr: {
    name: 'VR-шлем',
    portrait: false,
    parts: {
      cushion: P({ side: 'front', bad: 'cushion', price: 12 }),
      display: P({ side: 'front', blockers: ['cushion'], conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 70 }),
      shell: P({}),
      battery: P({ blockers: ['shell'], conn: 'bat', price: 25 }),
      fan: P({ blockers: ['shell'], conn: 'fan', miss: 'overheat', bad: 'noisy', price: 12 }),
    },
    screws: { h1: 'shell', h2: 'shell', h3: 'shell', h4: 'shell' },
    conns: {
      disp: { side: 'back', under: ['shell'] },
      bat: { side: 'back', under: ['shell'] },
      fan: { side: 'back', under: ['shell'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      lens: { tool: 'brush', part: 'cushion', under: [], side: 'front', sym: 'blurry' },
      fan: { tool: 'brush', part: 'fan', under: ['shell'], side: 'back', sym: 'overheat' },
    },
    order: ['p:fan', 'p:battery', 'p:display', 'c:disp', 'c:fan', 'c:bat', 'p:shell', 's:shell', 'p:cushion'],
    faults: ['lens-dirty', 'cushion-worn', 'screen-crack', 'fan-dust', 'battery-worn', 'bootloop', 'port-dirty'],
    models: [{ name: 'Мираж VR', code: 'MRJ-VR', logo: 'drop' }, { name: 'Очки Космос', code: 'KSM-2', logo: 'star' }],
    ext: 'img',
    version: [50, 60],
  },

  // фотоаппарат: спереди объектив (снимается), под ним затвор; сзади экран на клею, дверца и батарея
  camera: {
    name: 'Фотоаппарат',
    portrait: false,
    parts: {
      lens: P({ side: 'front', miss: 'no-focus', bad: 'no-focus', price: 60 }),
      shutter: P({ side: 'front', blockers: ['lens'], miss: 'no-shot', bad: 'no-shot', price: 35 }),
      display: P({ glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 30 }),
      door: P({}),
      battery: P({ blockers: ['door'], price: 20 }),
    },
    screws: {},
    conns: { disp: { side: 'back', under: ['door'] } },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      glass: { tool: 'brush', part: 'lens', under: [], side: 'front', sym: 'blurry' },
      slot: { tool: 'brush', part: '', under: ['door'], side: 'back', sym: 'no-card' },
    },
    order: ['p:shutter', 'p:lens', 'p:display', 'c:disp', 'p:battery', 'p:door'],
    faults: ['lens-stuck', 'glass-dirty', 'shutter-stuck', 'screen-crack', 'battery-worn', 'cart-dirty', 'bootloop'],
    models: [{ name: 'Зеркалка Д90', code: 'ZRK-D90', logo: 'ring' }, { name: 'Мыльница', code: 'MLN-5', logo: 'dot' }],
    ext: 'bin',
    version: [1, 4],
  },

  // электронная книга: экран на клею спереди, сзади крышка на защёлках — батарея и плата
  ereader: {
    name: 'Электронная книга',
    portrait: true,
    parts: {
      display: P({ side: 'front', glue: true, conn: 'disp', miss: 'no-screen', bad: 'cracked', price: 45 }),
      cover: P({}),
      battery: P({ blockers: ['cover'], conn: 'bat', price: 15 }),
    },
    screws: {},
    conns: {
      bat: { side: 'back', under: ['cover'] },
      disp: { side: 'back', under: ['cover'] },
    },
    battery: 'battery',
    port: '',
    spots: {
      jack: { tool: 'brush', part: '', under: [], side: 'any', sym: 'no-charge' },
      board: { tool: 'alcohol', part: '', under: ['cover'], side: 'back', power: true, sym: '' },
    },
    order: ['p:display', 'p:battery', 'c:disp', 'c:bat', 'p:cover'],
    faults: ['screen-crack', 'battery-worn', 'loose-battery', 'port-dirty', 'bootloop', 'water'],
    models: [{ name: 'Читалка 6', code: 'CHT-6', logo: 'leaf' }, { name: 'Книжник', code: 'KNZ-7', logo: 'cloud' }],
    ext: 'fw',
    version: [4, 6],
  },
};

export const KINDS = Object.keys(DEVICES);

/** Поломки: что меняют в устройстве; labor — плата за работу в долларах (детали клиент оплачивает сверху). */
export const FAULT_DEFS = {
  virus: { group: 'soft', soft: 'virus', labor: 15 },
  bootloop: { group: 'soft', soft: 'bootloop', labor: 25 },
  'screen-crack': { group: 'screen', part: 'display', value: 'crack', labor: 25 },
  'screen-flex': { group: 'screen', conn: 'disp', labor: 20 },
  'battery-swollen': { group: 'battery', part: 'battery', value: 'swollen', labor: 15 },
  'battery-worn': { group: 'battery', part: 'battery', value: 'worn', labor: 10 },
  'loose-battery': { group: 'battery', conn: 'bat', labor: 15 },
  water: { group: 'water', spot: 'board', wet: true, labor: 35 },
  'port-dirty': { group: 'port', spot: 'jack', labor: 10 },
  'port-broken': { group: 'port', part: 'port', value: 'burnt', labor: 25 },
  'pcie-dirty': { group: 'port', spot: 'jack', labor: 10 },
  'speaker-dust': { group: 'speaker', spot: 'speaker', labor: 15 },
  'speaker-broken': { group: 'speaker', part: 'speaker', value: 'torn', labor: 15 },
  'grille-dust': { group: 'speaker', spot: 'grille', labor: 10 },
  'camera-glass': { group: 'camera', part: 'cover', value: 'glass', labor: 10 },
  'camera-module': { group: 'camera', part: 'camera', value: 'dead', labor: 20 },
  'keys-sticky': { group: 'keys', spot: 'keys', labor: 15 },
  'keypad-worn': { group: 'keys', part: 'keypad', value: 'worn', labor: 10 },
  'stick-drift-l': { group: 'stick', part: 'stickL', value: 'drift', labor: 25 },
  'stick-drift-r': { group: 'stick', part: 'stickR', value: 'drift', labor: 25 },
  'fan-dust': { group: 'fan', spot: 'fan', labor: 20 },
  'fan-broken': { group: 'fan', part: 'fan', value: 'grind', labor: 20 },
  'ssd-dead': { group: 'ssd', part: 'ssd', value: 'dead', labor: 35 },
  'joy-drift-l': { group: 'joy', part: 'joyL', value: 'drift', labor: 10 },
  'joy-drift-r': { group: 'joy', part: 'joyR', value: 'drift', labor: 10 },
  'cart-dirty': { group: 'cart', spot: 'slot', labor: 10 },
  'cart-broken': { group: 'cart', part: 'cart', value: 'dead', labor: 25 },
  'umd-dead': { group: 'umd', part: 'umd', value: 'dead', labor: 25 },
  'nub-drift': { group: 'nub', part: 'nub', value: 'drift', labor: 20 },
  'bud-dead-l': { group: 'bud', part: 'budL', value: 'dead', labor: 10 },
  'bud-dead-r': { group: 'bud', part: 'budR', value: 'dead', labor: 10 },
  'wax-l': { group: 'wax', spot: 'waxL', labor: 10 },
  'wax-r': { group: 'wax', spot: 'waxR', labor: 10 },
  'driver-l': { group: 'driver', part: 'driverL', value: 'torn', labor: 20 },
  'driver-r': { group: 'driver', part: 'driverR', value: 'torn', labor: 20 },
  'pads-worn': { group: 'pads', parts: ['padL', 'padR'], value: 'worn', labor: 5 },
  'band-crack': { group: 'band', part: 'band', value: 'cracked', labor: 10 },
  'click-double-l': { group: 'click', part: 'switchL', value: 'double', labor: 15 },
  'click-double-r': { group: 'click', part: 'switchR', value: 'double', labor: 15 },
  'wheel-dirty': { group: 'wheel', spot: 'wheel', labor: 10 },
  'wheel-broken': { group: 'wheel', part: 'wheel', value: 'broken', labor: 15 },
  'lens-dirty': { group: 'lens', spot: 'lens', labor: 5 },
  'feet-worn': { group: 'feet', part: 'feet', value: 'worn', labor: 5 },
  crumbs: { group: 'crumbs', spot: 'crumbs', labor: 10 },
  'switch-chatter': { group: 'switch', part: 'switch', value: 'chatter', labor: 15 },
  'cable-frayed': { group: 'cable', part: 'cable', value: 'frayed', labor: 10 },
  'pcb-dead': { group: 'pcb', part: 'pcb', value: 'dead', labor: 20 },
  'caps-worn': { group: 'caps', part: 'keycaps', value: 'worn', labor: 5 },
  'heads-stuck': { group: 'heads', part: 'heads', value: 'stuck', labor: 40 },
  'platter-scratched': { group: 'heads', part: 'platter', value: 'scratched', labor: 40 },
  'cmos-dead': { group: 'cmos', part: 'cmos', value: 'dead', labor: 5 },
  'ram-dead': { group: 'ram', part: 'ram', value: 'dead', labor: 15 },
  'cap-swollen': { group: 'cap', part: 'cap', value: 'swollen', labor: 25 },
  'heatsink-dust': { group: 'cooling', spot: 'heatsink', labor: 15 },
  'paste-dry': { group: 'paste', part: 'paste', value: 'dry', labor: 20 },
  'vram-dead': { group: 'vram', part: 'vram', value: 'dead', labor: 45 },
  'cooler-broken': { group: 'cooler', part: 'cooler', value: 'grind', labor: 10 },
  'cooler-dust': { group: 'cooler', spot: 'cooler', labor: 10 },
  'pins-bent': { group: 'pins', spot: 'pins', labor: 30 },
  'strap-torn': { group: 'strap', part: 'strap', value: 'torn', labor: 5 },
  'sensor-dirty': { group: 'sensor', spot: 'sensor', labor: 10 },
  'rumble-dead': { group: 'rumble', part: 'rumble', value: 'dead', labor: 15 },
  'mic-dead': { group: 'mic', part: 'mic', value: 'dead', labor: 20 },
  'props-broken': { group: 'props', part: 'props', value: 'broken', labor: 5 },
  'motor-dead': { group: 'motor', part: 'motor', value: 'burnt', labor: 25 },
  'gimbal-dead': { group: 'gimbal', part: 'gimbal', value: 'dead', labor: 25 },
  'cushion-worn': { group: 'cushion', part: 'cushion', value: 'worn', labor: 5 },
  'lens-stuck': { group: 'lens', part: 'lens', value: 'stuck', labor: 30 },
  'glass-dirty': { group: 'glass', spot: 'glass', labor: 5 },
  'shutter-stuck': { group: 'shutter', part: 'shutter', value: 'stuck', labor: 30 },
};
export const FAULTS = Object.keys(FAULT_DEFS);

/** Детали, которые меняет поломка. */
export const faultParts = (f) => FAULT_DEFS[f].parts ?? (FAULT_DEFS[f].part ? [FAULT_DEFS[f].part] : []);

/** Жалобы клиентов (похожие у разных поломок — есть что диагностировать); свои у устройства — KIND_COMPLAINTS. */
export const COMPLAINTS = {
  virus: [
    'Везде реклама, и он сам что-то качает.',
    'Выскакивает «Вы выиграли миллион!», всё тормозит.',
    'Поставил «ускоритель» — и началось: окна, реклама, жуки какие-то.',
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
  'screen-flex': ['После падения экран чёрный, но звук есть.', 'Экран мигает и гаснет, хотя ни одной трещины.'],
  'battery-swollen': ['Корпус отходит, будто его раздуло.', 'Качается на столе — что-то выпирает изнутри.'],
  'battery-worn': ['Включается на секунду и сразу гаснет.', 'Садится мгновенно, даже если ничего не делать.'],
  'loose-battery': ['Уронил — и он больше не включается.', 'Не включается совсем, даже на зарядке.'],
  water: ['Утопил в ванной, теперь не включается.', 'Упал в лужу, выключился и больше не оживал.'],
  'port-dirty': ['Зарядка вставляется не до конца и не заряжает.', 'Заряжается, только если держать провод под углом.'],
  'port-broken': ['Не заряжается, а разъём пахнет горелым.', 'Поставил на дешёвую зарядку — щёлкнуло, и всё, не заряжается.'],
  'pcie-dirty': ['Компьютер не видит карту, хотя кулеры крутятся.', 'Пишет «устройство не найдено» после переезда.'],
  'speaker-dust': ['Звук еле слышно, глухой.', 'Звук будто через подушку.'],
  'speaker-broken': ['Динамик хрипел, а теперь молчит.', 'Звука нет совсем.'],
  'grille-dust': ['Звук стал тихим и глухим.', 'Колонка играет как из-под одеяла.'],
  'camera-glass': ['На всех фото мутное пятно.', 'Камера снимает как через туман.'],
  'camera-module': ['Камера показывает чёрный экран.', 'Камера не открывается — чёрный квадрат.'],
  'keys-sticky': ['Пролил сладкий чай — кнопки залипают.', 'Кнопки липкие и нажимаются через раз.'],
  'keypad-worn': ['Половина кнопок не нажимается.', 'Кнопки стёрлись и не реагируют.'],
  'stick-drift-l': ['Персонаж сам идёт влево, хотя стик не трогаю.', 'Левый стик дрейфует — героя уводит.'],
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
  'bud-dead-l': ['Левый наушник молчит, хотя заряжен.', 'Левый перестал подключаться.'],
  'bud-dead-r': ['Правый наушник не играет совсем.', 'Правый не включается после стирки.'],
  'wax-l': ['Левый стал играть тише правого.', 'В левом звук как из бочки.'],
  'wax-r': ['Правый тихий, левый нормальный.', 'Правый будто заткнули ватой.'],
  'driver-l': ['Левое ухо хрипит, а потом замолчало.', 'Слева тишина, справа музыка.'],
  'driver-r': ['Правый динамик дребезжит и молчит.', 'Справа ничего не слышно.'],
  'pads-worn': ['Амбушюры облезли, крошатся на шею.', 'Кожа на амбушюрах потрескалась.'],
  'band-crack': ['Оголовье треснуло, наушники разваливаются.', 'Сломал дужку, когда снимал.'],
  'click-double-l': ['Левая кнопка кликает дважды.', 'Одно нажатие — два клика, файлы открываются сами.'],
  'click-double-r': ['Правая кнопка двоит.', 'Контекстное меню открывается и сразу закрывается.'],
  'wheel-dirty': ['Колёсико скроллит рывками.', 'Прокрутка прыгает то вверх, то вниз.'],
  'wheel-broken': ['Колёсико крутится, а страница стоит.', 'Колёсико болтается и не скроллит.'],
  'lens-dirty': ['Курсор скачет по экрану.', 'Курсор дёргается и улетает в угол.'],
  'feet-worn': ['Мышь царапает стол и плохо скользит.', 'Ножки стёрлись, мышь едет рывками.'],
  crumbs: ['Клавиши застревают, крошки внутри.', 'Пробел залипает и хрустит.'],
  'switch-chatter': ['Буква «W» печатается дважды.', 'Одна клавиша пишет «аа» вместо «а».'],
  'cable-frayed': ['Отключается, если пошевелить провод.', 'Провод перетёрся у основания.'],
  'pcb-dead': ['Совсем не работает, ни огонька.', 'Подключаю — и ничего.'],
  'caps-worn': ['Буквы на клавишах стёрлись.', 'Колпачки блестят и пожелтели.'],
  'heads-stuck': ['Щёлкает и не определяется.', 'Тикает как часы, файлы не открываются.'],
  'platter-scratched': ['Копирование виснет на половине.', 'Проверка нашла тысячи битых секторов.'],
  'cmos-dead': ['Каждый раз сбрасываются дата и время.', 'После выключения настройки BIOS слетают.'],
  'ram-dead': ['Пищит и не стартует.', 'Кулеры крутятся, а изображения нет.'],
  'cap-swollen': ['Сам перезагружается под нагрузкой.', 'Выключается в играх без причины.'],
  'heatsink-dust': ['Перегревается и сбрасывает частоты.', 'Радиатор в пыли, всё горячее.'],
  'paste-dry': ['В играх 95 градусов и тормоза.', 'Греется до отключения.'],
  'vram-dead': ['На экране цветные квадраты и полосы.', 'Артефакты в играх, потом синий экран.'],
  'cooler-broken': ['Кулер воет и дребезжит.', 'Кулер крутится рывками и скрипит.'],
  'cooler-dust': ['Кулер забит пылью, процессор горячий.', 'Шумит и греется.'],
  'pins-bent': ['Уронил процессор, теперь не запускается.', 'После переустановки компьютер не стартует.'],
  'strap-torn': ['Ремешок порвался, часы упали.', 'Застёжка ремешка оторвалась.'],
  'sensor-dirty': ['Перестал мерить пульс.', 'Пульс показывает прочерки.'],
  'rumble-dead': ['Пропала вибрация.', 'В играх не трясётся, как раньше.'],
  'mic-dead': ['Не слышит, когда к ней обращаюсь.', 'Отвечает только если кричать в упор.'],
  'props-broken': ['Врезался в дерево, лопасти сломаны.', 'Пропеллеры в трещинах, не взлетает.'],
  'motor-dead': ['Один мотор не крутится, его заваливает.', 'При взлёте переворачивается.'],
  'gimbal-dead': ['Камера не снимает, подвес дёргается.', 'Видео чёрное, камера висит криво.'],
  'cushion-worn': ['Накладка на лицо облезла и колется.', 'Поролон развалился.'],
  'lens-stuck': ['Объектив не фокусируется.', 'Объектив жужжит и не выдвигается.'],
  'glass-dirty': ['На фото мутное пятно.', 'Всё как в тумане.'],
  'shutter-stuck': ['Нажимаю спуск — ничего не происходит.', 'Затвор не щёлкает.'],
};

/** Жалобы, которые у этого устройства звучат по-своему. */
export const KIND_COMPLAINTS = {
  earbuds: {
    'battery-worn': ['Кейс садится за день и не заряжает наушники.', 'Наушники из кейса выходят разряженными.'],
    'port-dirty': ['Кейс не заряжается от провода.', 'Провод в кейсе болтается и не заряжает.'],
    bootloop: ['После обновления мигают красным и не подключаются.', 'Не находятся в блютусе после прошивки.'],
  },
  headphones: {
    'battery-worn': ['Держат заряд полчаса.', 'Выключаются посреди песни.'],
    bootloop: ['После обновления просто мигают и не подключаются.', 'Не включаются, только огонёк.'],
  },
  mouse: { 'battery-worn': ['Мышь не включается, огонёк не горит.', 'Новую батарейку не ставил, перестала работать.'] },
  keyboard: { bootloop: ['Подсветка мигает, а клавиши не печатают.', 'После обновления прошивки не работает.'] },
  hdd: {
    'port-dirty': ['Компьютер не видит диск.', 'Диск определяется через раз.'],
    'pcb-dead': ['Запахло палёным, диск не крутится.', 'Подключил не тот блок питания — и тишина.'],
    bootloop: ['Определяется как непонятное устройство без объёма.', 'Объём показывает ноль байт.'],
  },
  motherboard: {
    water: ['Пролил кофе на открытый корпус.', 'Сверху капал кондиционер — теперь не стартует.'],
    bootloop: ['После обновления BIOS не стартует.', 'Чёрный экран после прошивки BIOS.'],
    'port-dirty': ['Не видит флешку с прошивкой.', 'Порты на задней панели не работают.'],
  },
  tablet: { water: ['Ребёнок уронил в ванну.', 'Пролил сок прямо на экран.'] },
  laptop: {
    'keys-sticky': ['Пролил кофе на клавиатуру.', 'Клавиши липкие после чая.'],
    'keypad-worn': ['Половина клавиш не печатает.', 'Клавиатура перестала работать.'],
  },
  watch: {
    water: ['Нырнул в них в море — и всё.', 'Плавал в бассейне, часы погасли.'],
    'port-dirty': ['Не заряжаются на подставке.', 'Ставлю на зарядку — не реагируют.'],
  },
  gamepad: { 'keys-sticky': ['Кнопки залипают после газировки.', 'Крестовина липкая.'] },
  powerbank: {
    'battery-worn': ['Заряжает телефон только на 20%.', 'Сам садится за ночь.'],
    'pcb-dead': ['Не отдаёт заряд, огоньки горят.', 'Телефон подключаю — не заряжается.'],
  },
  speaker: {
    water: ['Пролили суп на колонку.', 'Стояла у окна в дождь.'],
    bootloop: ['Крутится кольцо загрузки бесконечно.', 'После обновления только мигает.'],
    'port-dirty': ['Не включается от блока питания.', 'Штекер питания болтается.'],
  },
  drone: {
    water: ['Сел на воду.', 'Упал в озеро, достали сачком.'],
    bootloop: ['После обновления моторы не запускаются.', 'Пульт не видит дрон после прошивки.'],
    'battery-worn': ['Летает две минуты.', 'Садится сразу после взлёта.'],
  },
  vr: { bootloop: ['Висит на заставке.', 'После обновления в шлеме только логотип.'] },
  camera: {
    'cart-dirty': ['Не видит карту памяти.', 'Пишет «нет карты», хотя она вставлена.'],
    'battery-worn': ['Батарея садится за десять снимков.', 'Выключается при включении вспышки.'],
  },
  ereader: { water: ['Читал в ванной и уронил.', 'Облили чаем.'] },
};

/** Жалобы заказа: свои у устройства или общие. */
export const complaintsFor = (kind, f) => KIND_COMPLAINTS[kind]?.[f] ?? COMPLAINTS[f];

/** Что не работает — для возврата клиента и терминала. */
export const SYMPTOMS = {
  swollen: 'батарея вздута', 'no-power': 'не включается', drains: 'сразу садится', bootloop: 'прошивка сбоит',
  'no-screen': 'экран не показывает', cracked: 'экран разбит', 'no-charge': 'не заряжается', 'no-sound': 'нет звука',
  quiet: 'звук глухой', 'no-camera': 'камера не работает', blurry: 'картинка мутная', virus: 'вирусы на месте',
  'no-os': 'система не загружается', 'stick-l': 'левый стик дрейфует', 'stick-r': 'правый стик дрейфует',
  'joy-l': 'левый контроллер дрейфует', 'joy-r': 'правый контроллер дрейфует', overheat: 'перегревается',
  noisy: 'вентилятор скрежещет', 'no-cart': 'не читает картриджи', 'no-disc': 'не читает диски', nub: 'шишечка дрейфует',
  'no-keys': 'кнопки не нажимаются', sticky: 'кнопки залипают', 'bud-l': 'левый наушник молчит',
  'bud-r': 'правый наушник молчит', 'quiet-l': 'левый наушник тихий', 'quiet-r': 'правый наушник тихий',
  'no-sound-l': 'слева нет звука', 'no-sound-r': 'справа нет звука', pads: 'амбушюры облезли', band: 'оголовье треснуло',
  'click-l': 'левая кнопка двоит', 'click-r': 'правая кнопка двоит', scroll: 'колёсико не скроллит', cursor: 'курсор скачет',
  glide: 'плохо скользит', caps: 'буквы стёрлись', 'double-type': 'клавиша печатает дважды', disconnects: 'провод отваливается',
  'keys-stuck': 'клавиши застревают', 'bad-sectors': 'битые сектора', clicking: 'щёлкает и не читается',
  'not-detected': 'компьютер не видит', 'bios-reset': 'сбрасывает время', 'no-boot': 'не стартует', reboots: 'сам перезагружается',
  artifacts: 'артефакты на экране', 'no-vibro': 'нет вибрации', 'no-output': 'не отдаёт заряд', deaf: 'не слышит команды',
  motor: 'мотор не крутится', 'no-fly': 'не взлетает', cushion: 'накладка облезла', 'no-focus': 'не фокусируется',
  'no-shot': 'затвор не срабатывает', 'no-card': 'не видит карту', strap: 'ремешок порван', 'no-pulse': 'не меряет пульс',
};

/** Обучение: заказ → [устройство, поломка] — первая встреча с устройством. Остальные — случайные. */
export const TUTORIAL = {
  1: ['phone', 'virus'], 2: ['phone', 'screen-crack'], 3: ['phone', 'port-dirty'], 4: ['phone', 'battery-swollen'],
  5: ['phone', 'screen-flex'], 6: ['phone', 'speaker-dust'], 7: ['phone', 'loose-battery'], 8: ['phone', 'camera-glass'],
  9: ['phone', 'bootloop'], 10: ['phone', 'port-broken'], 11: ['phone', 'water'], 12: ['phone', 'speaker-broken'],
  13: ['phone', 'battery-worn'], 14: ['phone', 'camera-module'],
  15: ['button', 'keys-sticky'], 16: ['earbuds', 'wax-l'], 17: ['deck', 'stick-drift-l'], 18: ['mouse', 'click-double-l'],
  19: ['deck', 'ssd-dead'], 20: ['keyboard', 'crumbs'], 21: ['switch', 'joy-drift-r'], 22: ['headphones', 'driver-r'],
  23: ['psp', 'umd-dead'], 24: ['tablet', 'screen-crack'], 25: ['switch', 'cart-dirty'], 26: ['gamepad', 'rumble-dead'],
  28: ['powerbank', 'battery-swollen'], 30: ['hdd', 'heads-stuck'], 32: ['watch', 'strap-torn'], 34: ['laptop', 'fan-dust'],
  36: ['speaker', 'mic-dead'], 38: ['gpu', 'paste-dry'], 40: ['motherboard', 'cap-swollen'], 42: ['cpu', 'pins-bent'],
  44: ['drone', 'props-broken'], 46: ['vr', 'lens-dirty'], 48: ['camera', 'lens-stuck'], 50: ['ereader', 'screen-crack'],
};
/** С какого заказа устройство приходит в мастерскую — с первого заказа обучения на нём. */
export const UNLOCK = Object.fromEntries(Object.keys(DEVICES).map((k) => [k,
  k === 'phone' ? 1 : Math.min(...Object.entries(TUTORIAL).filter(([, [kind]]) => kind === k).map(([lv]) => Number(lv)))]));
const KIND_WEIGHT = Object.fromEntries(Object.keys(DEVICES).map((k) => [k, k === 'phone' ? 6 : 2]));

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
