// Управление «Лисьей охоты»: два джойстика под большими пальцами, мышь и клавиши. Джойстики бывают «статичными» (по
// умолчанию: основания всегда на местах, касание берётся в круге радиуса catchK около основания) и «плавающими»
// (настройка stick; про «плавающие» — всё ниже).
//
// Левая половина экрана — ходьба, правая — действие. Палец на правой лежит на месте — огонь (или «взять», «купить»:
// что окажется рядом); с настройкой weaponBtn («Отдельная кнопка для оружия») то же делает круглая кнопка над правым
// джойстиком, пока её держат, а сам джойстик только тянется для рывка; оттянул — прицел рывка, отпустил — рывок; вернул в середину — рывок отменён. «Режим левши»
// меняет половины местами. Кольцо появляется там, куда лёг палец, и едет за ним, если палец ушёл дальше радиуса.
// На компьютере: WASD / стрелки — ходьба, левая кнопка мыши — рывок к курсору (нажал — прицел, отпустил — прыжок),
// правая кнопка или Shift — огонь в курсор, пробел — рывок по ходу, E — действие, Esc / P — пауза.
//
// Все правила — в createStickCore: там нет ни страницы, ни событий, только числа, и тесты гоняют именно его.
// createInput — тонкая обёртка: переводит события указателя в оси игры (экран бывает положен набок — api.screen),
// кормит ими ядро и раз в кадр двигает два джойстика, нарисованных стилями (game.css, блок «стики»).
// Стрелку рывка в мире рисует рендер — по объекту ввода.
//
// Симуляция (step в logic.js) каждый кадр получает один и тот же объект:
//   mx, my — куда идти (длина до 1) · fire — огонь держат · act — разовое «действие» (клавиша E)
//   aim + ax, ay, ap — рывок прицеливают: направление (длина 1) и сила 0…1
//   dash + dx, dy, dp — разовая команда «рывок» · hasT + tx, ty — точка мира, куда стрелять (мышь)
/** Прицел сдвинулся на (dx, dy): новое место, не дальше краёв поля w × h (захват курсора в полном экране). */
export function stepCursor(cur, dx, dy, w, h) {
  const nx = cur.x + (Number.isFinite(dx) ? dx : 0);
  const ny = cur.y + (Number.isFinite(dy) ? dy : 0);
  cur.x = Math.min(Math.max(0, w), Math.max(0, nx));
  cur.y = Math.min(Math.max(0, h), Math.max(0, ny));
  return cur;
}

/** Все числа управления — в одном месте: крутить можно, не трогая правил. Размеры — в пикселях CSS. */
export const STICK = {
  zone: 0.46,          // доля ширины экрана под каждый джойстик; полоса между ними — тому, кто свободен и ближе
  radius: 46,          // радиус кольца, он же ход ручки; палец ушёл дальше — кольцо едет за ним
  edge: 32,            // ближе к краю экрана кольцо не рисуется: там системные жесты («назад», «домой»)
  padX: 24,            // место покоя: на столько дальше от бокового края, чем можно,
  padY: 10,            // и от нижнего
  dead: 0.14,          // ходьба: мёртвая зона, доля радиуса
  hold: 16,            // действие: ближе к точке касания — «держу» (огонь или «взять»)
  aim: 20,             // действие: дальше — прицел рывка; между hold и aim остаётся как было, чтобы не дрожало
  holdDelay: 0.13,     // с: столько палец лежит неподвижно, прежде чем это «держу», а не начало взмаха (см. ниже)
  still: 6,            // сдвинулся дальше — палец в движении: отсчёт holdDelay начинается заново
  tapFire: 0.05,       // с: короткое нажатие — огонь на это время: хватает на один выстрел или одно «взять»
  stale: 0.4,          // с: кадров не было дольше — игра стояла (пауза, свернули); разовые команды за это время не в счёт
  reach: 148,          // единиц мира: длина полного рывка — по ней мышь считает силу, чтобы лиса прыгала до курсора
  reachMin: 0.45,      // какую долю длины даёт самый слабый рывок (оба числа — как в balance.js: BASE.dashDist, DASH.minPower)
  catchK: 1.6,         // «статичные» джойстики: касание берёт джойстик, лёгши не дальше этой доли радиуса от его центра
  mouseDead: 10,       // единиц мира: курсор на самой лисе — рывка нет
  btnR: 32,            // кнопка оружия (настройка weaponBtn): радиус, 64 px поперёк — не меньше 56
  btnCatch: 1.25,      // касание берёт кнопку, лёгши не дальше этой доли её радиуса от середины
  btnGapX: 1.5,        // середина кнопки от середины правого джойстика: по горизонтали в радиусах кольца (в сторону ходьбы),
  btnGapY: 1.9,        // и вверх
};

/** Что ядро ответило на клавишу: не наша · наша (страницу не трогать) · просят паузу. */
export const KEY_FREE = 0;
export const KEY_TAKEN = 1;
export const KEY_PAUSE = 2;

const MOVE = 0;        // джойстик ходьбы
const ACT = 1;         // джойстик действия
// Палец на джойстике действия. Огонь начинается не в миг касания, а когда палец пролежал неподвижно holdDelay:
// иначе каждый рывок начинался бы с выстрела (мана не восстанавливается) или с покупки того, что лежит рядом.
// Короткое нажатие — тоже огонь, только импульсом, когда палец уже поднят.
const PRESS = 0;       // только лёг — ещё не ясно, нажатие это или начало взмаха
const HOLD = 1;        // лежит на месте: огонь / действие
const AIM = 2;         // оттянут: прицел рывка
const BACK = 3;        // вернулся из прицела в середину: рывок отменён, огня пока нет

// по биту на клавишу: W и ↑ зажаты вместе, одну отпустили — лиса всё ещё идёт вверх
const KEY_BIT = { KeyW: 1, ArrowUp: 2, KeyS: 4, ArrowDown: 8, KeyA: 16, ArrowLeft: 32, KeyD: 64, ArrowRight: 128, ShiftLeft: 256, ShiftRight: 512 };
const K_UP = 3;
const K_DOWN = 12;
const K_LEFT = 48;
const K_RIGHT = 192;
const K_FIRE = 768;

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// длина вектора; не Math.hypot: тот на каждый вызов заводит массив под свои аргументы, а зовём мы его каждый кадр
const hyp = (x, y) => Math.sqrt(x * x + y * y);

/**
 * Правила управления без страницы. Координаты — пиксели сцены в осях игры (0, 0 — левый верхний угол).
 *   w, h, insets — размер сцены и отступы { top, right, bottom, left }, куда кольца не ставятся;
 *   lefty — ходьба справа; stick — 'static' (основания стоят на местах, касание берётся внутри круга около них) или
 *   'float' (кольцо встаёт туда, где лёг палец; так было сначала); weaponBtn — отдельная кнопка оружия (огонь и «взять»
 *   только с неё, стик действия не стреляет); toWorld(x, y, out) → { x, y } — точка сцены в мире (нужна только мыши);
 *   now() — часы в секундах (в тестах — свои); tune — поправки к STICK.
 * Пальцы: down / move / up / cancel по номеру указателя. Мышь: mouse(buttons, x, y). Клавиши: key(code, down, repeat).
 * frame(foxX, foxY, foxDir, reach) — раз в кадр: возвращает объект ввода (всегда один и тот же) и обновляет sticks —
 * что рисовать. Место лисы в мире нужно мыши (рывок — от лисы к курсору), куда она смотрит (радианы) — пробелу,
 * reach — длина её полного рывка (по умолчанию STICK.reach).
 */
export function createStickCore({ w = 0, h = 0, insets = null, lefty = false, stick = 'float', weaponBtn = false, toWorld = null, now = null, tune = null } = {}) {
  const C = { ...STICK, ...tune };
  const clock = now ?? (() => performance.now() / 1000);
  const input = { mx: 0, my: 0, fire: false, act: false, aim: false, ax: 0, ay: 0, ap: 0, dash: false, dx: 0, dy: 0, dp: 0, hasT: false, tx: 0, ty: 0 };
  // палец на джойстике: ox, oy — точка отсчёта (где лёг; едет за далеко ушедшим пальцем), x, y — где он сейчас;
  // sx, sy и t0 — где и с каких пор он лежит неподвижно (ждём «держу»)
  const pad = () => ({ on: false, id: 0, ox: 0, oy: 0, x: 0, y: 0, sx: 0, sy: 0, t0: 0, mode: PRESS, fired: false });
  const pads = [pad(), pad()];
  // что рисовать: середина кольца (уже внутри безопасной зоны), сдвиг ручки и состояние idle | on | hold | aim
  const view = () => ({ on: false, x: 0, y: 0, kx: 0, ky: 0, state: 'idle' });
  // кнопка оружия: палец на ней (id, fired — огонь хоть один кадр видел) и что рисовать (shown — настройка включена)
  const btn = { on: false, id: 0, fired: false };
  const sticks = { move: view(), act: view(), btn: { shown: false, on: false, x: 0, y: 0, r: 0 } };
  const views = [sticks.move, sticks.act];
  const mouse = { seen: false, x: 0, y: 0, left: false, right: false, go: false, gx: 0, gy: 0 };
  const spot = { x: 0, y: 0 };

  let W = w;
  let H = h;
  let inT = 0;
  let inR = 0;
  let inB = 0;
  let inL = 0;
  let isLefty = Boolean(lefty);
  let fixed = stick === 'static';
  let useBtn = Boolean(weaponBtn);
  let btnX = 0;
  let btnY = 0;
  // где может стоять середина кольца и где джойстики ждут палец
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const homeX = [0, 0];
  const homeY = [0, 0];

  let keys = 0;
  const face = { x: 1, y: 0 };     // куда шли последним — туда рывок по пробелу, если стоим
  let last = -Infinity;            // когда был прошлый кадр
  // разовые команды ждут ближайшего кадра
  let dashOn = false;
  let dashX = 0;
  let dashY = 0;
  let dashP = 0;
  let actOn = false;
  let spaceOn = false;
  let pulse = false;       // короткое нажатие: огонь до pulseEnd (и хотя бы один кадр)
  let pulseEnd = 0;
  // куда пишут свои ответы world(), origin() и mouseAim() — числа вместо новых объектов
  let wx = 0;
  let wy = 0;
  let fromX = 0;
  let fromY = 0;
  let aimX = 0;
  let aimY = 0;
  let aimP = 0;
  let warned = false;

  const onBtn = (id) => btn.on && btn.id === id;
  const byId = (id) => (pads[MOVE].on && pads[MOVE].id === id ? pads[MOVE] : pads[ACT].on && pads[ACT].id === id ? pads[ACT] : null);
  const power = (d) => Math.max(0, Math.min(1, (d - C.aim) / (C.radius - C.aim)));

  /** Что рисовать: занятый джойстик — под пальцем (но в безопасной зоне), свободный — на своём месте покоя. */
  function sync() {
    const b = sticks.btn;
    b.shown = useBtn;
    b.on = btn.on;
    b.x = btnX;
    b.y = btnY;
    b.r = C.btnR;
    for (let i = 0; i < 2; i++) {
      const p = pads[i];
      const v = views[i];
      v.on = p.on;
      if (fixed) {
        // основание не двигается; ручка идёт за пальцем (move держит её в круге)
        v.x = homeX[i];
        v.y = homeY[i];
        v.kx = p.on ? p.x - p.ox : 0;
        v.ky = p.on ? p.y - p.oy : 0;
        v.state = !p.on ? 'idle' : i === MOVE || p.mode === PRESS || p.mode === BACK ? 'on' : p.mode === HOLD ? 'hold' : 'aim';
        continue;
      }
      if (!p.on) {
        v.x = homeX[i];
        v.y = homeY[i];
        v.kx = 0;
        v.ky = 0;
        v.state = 'idle';
        continue;
      }
      // правила считаются от настоящей точки касания: палец у самого края не должен «сам» оттянуть ручку.
      // В безопасную зону сдвигается только рисунок.
      v.x = Math.max(minX, Math.min(maxX, p.ox));
      v.y = Math.max(minY, Math.min(maxY, p.oy));
      v.kx = p.x - p.ox;
      v.ky = p.y - p.oy;
      v.state = i === MOVE || p.mode === PRESS || p.mode === BACK ? 'on' : p.mode === HOLD ? 'hold' : 'aim';
    }
  }

  /** Границы для середины кольца и места покоя — после смены размера, отступов или руки. */
  function layout() {
    const r = C.radius;
    minX = Math.max(inL, C.edge) + r;
    maxX = W - Math.max(inR, C.edge) - r;
    minY = Math.max(inT, C.edge) + r;
    maxY = H - Math.max(inB, C.edge) - r;
    // экран теснее двух отступов — кольцо встаёт посередине того, что есть
    if (minX > maxX) minX = maxX = (minX + maxX) / 2;
    if (minY > maxY) minY = maxY = (minY + maxY) / 2;
    const leftX = Math.min(minX + C.padX, maxX);
    const rightX = Math.max(maxX - C.padX, minX);
    homeX[MOVE] = isLefty ? rightX : leftX;
    homeX[ACT] = isLefty ? leftX : rightX;
    homeY[MOVE] = homeY[ACT] = Math.max(maxY - C.padY, minY);
    // кнопка оружия: над правым джойстиком, в сторону ходьбы (у левши зеркально), целиком в безопасной зоне
    const bR = C.btnR;
    const bMinX = Math.max(inL, C.edge) + bR;
    const bMaxX = Math.max(bMinX, W - Math.max(inR, C.edge) - bR);
    const bMinY = Math.max(inT, C.edge) + bR;
    const bMaxY = Math.max(bMinY, H - Math.max(inB, C.edge) - bR);
    btnX = Math.max(bMinX, Math.min(bMaxX, homeX[ACT] + (isLefty ? 1 : -1) * r * C.btnGapX));
    btnY = Math.max(bMinY, Math.min(bMaxY, homeY[ACT] - r * C.btnGapY));
    sync();
  }

  function resize(nw, nh, ins = NO_INSETS) {
    if (nw !== W || nh !== H) cancelAll();           // экран стал другим — старые точки пальцев ничего не значат
    W = nw;
    H = nh;
    inT = ins.top > 0 ? ins.top : 0;
    inR = ins.right > 0 ? ins.right : 0;
    inB = ins.bottom > 0 ? ins.bottom : 0;
    inL = ins.left > 0 ? ins.left : 0;
    layout();
  }

  function setLefty(on) {
    if (Boolean(on) === isLefty) return;
    isLefty = Boolean(on);
    cancelAll();
    layout();
  }

  /** Кнопка оружия на лету. Пальцы отпускаются: у стика действия правила другие. */
  function setWeaponBtn(on) {
    if (Boolean(on) === useBtn) return;
    useBtn = Boolean(on);
    cancelAll();
    sync();
  }

  /** Джойстики на лету: 'static' | 'float'. Пальцы отпускаются (точки отсчёта у режимов разные). */
  function setStick(mode) {
    const next = mode === 'static';
    if (next === fixed) return;
    fixed = next;
    cancelAll();
    sync();
  }

  /** «Статичные»: ближайший свободный джойстик, в чьём круге лёг палец, или −1. */
  function pickFixed(x, y) {
    const reach = C.radius * C.catchK;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < 2; i++) {
      if (pads[i].on) continue;
      const d = hyp(x - homeX[i], y - homeY[i]);
      if (d <= reach && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  /** Какому джойстику достанется палец, лёгший в x: MOVE, ACT или −1 (половина занята, третий палец). */
  function pick(x) {
    const onLeft = isLefty ? ACT : MOVE;
    const onRight = isLefty ? MOVE : ACT;
    if (x < W * C.zone) return pads[onLeft].on ? -1 : onLeft;
    if (x >= W * (1 - C.zone)) return pads[onRight].on ? -1 : onRight;
    // ничья полоса посередине: тому, чья половина ближе, а занят — другому
    const near = x < W / 2 ? onLeft : onRight;
    if (!pads[near].on) return near;
    const far = near === onLeft ? onRight : onLeft;
    return pads[far].on ? -1 : far;
  }

  /** Палец лёг (или замер после движения): «держу» отсчитывается от этого места и мига. */
  function rest(p, mode) {
    p.mode = mode;
    p.sx = p.x;
    p.sy = p.y;
    p.t0 = clock();
  }

  /** Палец лёг. Возвращает 0 — взял джойстик ходьбы, 1 — действия, 2 — кнопку оружия, −1 — палец лишний. */
  function down(id, x, y) {
    const old = byId(id);
    if (old) old.on = false;                         // тот же номер лёг снова — прошлое отпускание потерялось
    if (onBtn(id)) btn.on = false;
    if (useBtn && !btn.on && hyp(x - btnX, y - btnY) <= C.btnR * C.btnCatch) {
      btn.on = true;
      btn.id = id;
      btn.fired = false;
      return 2;
    }
    const i = fixed ? pickFixed(x, y) : pick(x);
    if (i < 0) return -1;
    const p = pads[i];
    p.on = true;
    p.id = id;
    p.x = x;
    p.y = y;
    // у статичного отсчёт — от основания, а не от места касания
    p.ox = fixed ? homeX[i] : x;
    p.oy = fixed ? homeY[i] : y;
    if (fixed) clampKnob(p);
    p.fired = false;
    rest(p, PRESS);
    return i;
  }

  /** Ручка статичного не выходит за край круга (основание на месте). */
  function clampKnob(p) {
    const ox = p.x - p.ox;
    const oy = p.y - p.oy;
    const d = hyp(ox, oy);
    if (d > C.radius) {
      p.x = p.ox + (ox * C.radius) / d;
      p.y = p.oy + (oy * C.radius) / d;
    }
  }

  function move(id, x, y) {
    const p = byId(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (fixed) clampKnob(p);
    const ox = p.x - p.ox;
    const oy = p.y - p.oy;
    let d = hyp(ox, oy);
    if (!fixed && d > C.radius) {
      // палец убежал за кольцо — точка отсчёта едет следом: назад всегда один и тот же короткий путь
      const k = (d - C.radius) / d;
      p.ox += ox * k;
      p.oy += oy * k;
      d = C.radius;
    }
    if (p !== pads[ACT]) return;
    if (p.mode === AIM) {
      if (d < C.hold) rest(p, BACK);                 // вернул в середину — рывок отменён
    } else if (d > C.aim) p.mode = AIM;
    // ещё не «держу», а палец в движении (медленно тянет к прицелу) — отсчёт заново
    else if (p.mode !== HOLD && hyp(x - p.sx, y - p.sy) > C.still) rest(p, p.mode);
  }

  /** Палец поднят: с прицела — рывок, после короткого нажатия — импульс огня. */
  function up(id) {
    if (onBtn(id)) {
      btn.on = false;
      if (!btn.fired) {
        pulse = true;                                // нажал и отпустил между кадрами — огонь импульсом
        pulseEnd = clock() + C.tapFire;
      }
      return;
    }
    const p = byId(id);
    if (!p) return;
    p.on = false;
    if (p !== pads[ACT]) return;
    if (p.mode === AIM) {
      const ox = p.x - p.ox;
      const oy = p.y - p.oy;
      const d = hyp(ox, oy);
      if (d > 0) {
        dashOn = true;
        dashX = ox / d;
        dashY = oy / d;
        dashP = power(d);
      }
    } else if (!useBtn && (p.mode === PRESS || (p.mode === HOLD && !p.fired))) {
      // нажал и отпустил, а огня ещё ни один кадр не видел — отдаём его импульсом
      pulse = true;
      pulseEnd = clock() + C.tapFire;
    }
  }

  /** Касание оборвалось (система забрала палец): отпустить без рывка и без огня. */
  function cancel(id) {
    if (onBtn(id)) btn.on = false;
    const p = byId(id);
    if (p) p.on = false;
  }

  function cancelAll() {
    pads[MOVE].on = false;
    pads[ACT].on = false;
    btn.on = false;
  }

  const holds = (id) => byId(id) !== null || onBtn(id);

  /** Мышь: какие кнопки зажаты (биты MouseEvent.buttons) и где курсор. Отпустил левую — рывок. */
  function mouseAt(buttons, x, y) {
    const left = (buttons & 1) !== 0;
    if (mouse.left && !left) {
      mouse.go = true;
      mouse.gx = x;
      mouse.gy = y;
    }
    mouse.seen = true;
    mouse.x = x;
    mouse.y = y;
    mouse.left = left;
    mouse.right = (buttons & 2) !== 0;
  }

  /** Курсор ушёл со сцены: целиться некуда. */
  function mouseOut() {
    if (!mouse.left && !mouse.right) mouse.seen = false;
  }

  /** Кнопки мыши «отпали» сами (окно потеряло фокус): без рывка. */
  function mouseDrop() {
    mouse.left = false;
    mouse.right = false;
  }

  /** Клавиша по e.code. Ходьба и огонь — пока зажаты; пробел и E — разово (повтор от удержания не в счёт). */
  function key(code, isDown, repeat = false) {
    const bit = KEY_BIT[code];
    if (bit) {
      keys = isDown ? keys | bit : keys & ~bit;
      return KEY_TAKEN;
    }
    if (code !== 'Space' && code !== 'KeyE' && code !== 'Escape' && code !== 'KeyP') return KEY_FREE;
    if (!isDown || repeat) return KEY_TAKEN;
    if (code === 'Space') spaceOn = true;
    else if (code === 'KeyE') actOn = true;
    else return KEY_PAUSE;
    return KEY_TAKEN;
  }

  /** Окно потеряло фокус: отпускания клавиш уже не придут. */
  function blur() {
    keys = 0;
    mouseDrop();
  }

  /** Точка сцены → мир: пишет wx, wy. false — переводить нечем или вышли не числа. */
  function world(x, y) {
    if (!toWorld) return false;
    spot.x = NaN;
    spot.y = NaN;
    const p = toWorld(x, y, spot) || spot;
    wx = p.x;
    wy = p.y;
    return Number.isFinite(wx) && Number.isFinite(wy);
  }

  /** Откуда мышь целит рывок: место лисы → fromX, fromY. Не сказали — середина экрана (и замечание в консоль). */
  function origin(fx, fy) {
    if (Number.isFinite(fx) && Number.isFinite(fy)) {
      fromX = fx;
      fromY = fy;
      return true;
    }
    if (!warned) {
      warned = true;
      console.warn('лисья охота: frame() не знает, где лиса, — мышь целит рывок от середины экрана');
    }
    if (!world(W / 2, H / 2)) return false;
    fromX = wx;
    fromY = wy;
    return true;
  }

  /** Прицел мыши: от лисы к точке мира → aimX, aimY, aimP. false — курсор на самой лисе. */
  function mouseAim(x, y, reach) {
    const ox = x - fromX;
    const oy = y - fromY;
    const d = hyp(ox, oy);
    if (!(d > C.mouseDead)) return false;
    const far = reach > 0 ? reach : C.reach;
    const near = far * C.reachMin;
    aimX = ox / d;
    aimY = oy / d;
    aimP = Math.max(0, Math.min(1, (d - near) / (far - near)));
    return true;
  }

  function frame(foxX, foxY, foxDir, reach) {
    const t = clock();
    if (t - last > C.stale) {
      // кадры не шли: игра стояла — что нажали за это время, уже не команды
      dashOn = false;
      actOn = false;
      spaceOn = false;
      pulse = false;
      mouse.go = false;
    }
    last = t;

    // ходьба: джойстик и клавиши вместе, длина не больше 1
    let mx = 0;
    let my = 0;
    const m = pads[MOVE];
    if (m.on) {
      // дальше радиуса палец от точки отсчёта не уходит (move), так что длина здесь и так не больше 1
      const ox = (m.x - m.ox) / C.radius;
      const oy = (m.y - m.oy) / C.radius;
      if (hyp(ox, oy) >= C.dead) {
        mx = ox;
        my = oy;
      }
    }
    mx += (keys & K_RIGHT ? 1 : 0) - (keys & K_LEFT ? 1 : 0);
    my += (keys & K_DOWN ? 1 : 0) - (keys & K_UP ? 1 : 0);
    const speed = hyp(mx, my);
    if (speed > 1) {
      // по диагонали с клавиш и клавиши вместе с джойстиком — не быстрее обычного
      mx /= speed;
      my /= speed;
    }
    if (speed > 0) {
      face.x = mx / Math.min(1, speed);
      face.y = my / Math.min(1, speed);
    }

    // джойстик действия
    let fire = false;
    let aim = false;
    let ax = 0;
    let ay = 0;
    let ap = 0;
    const a = pads[ACT];
    if (a.on) {
      // с отдельной кнопкой оружия стик действия только тянется для рывка: «держу на месте» огня не даёт
      if (!useBtn && (a.mode === PRESS || a.mode === BACK) && t - a.t0 >= C.holdDelay) a.mode = HOLD;
      if (a.mode === HOLD) {
        fire = true;
        a.fired = true;
      } else if (a.mode === AIM) {
        const ox = a.x - a.ox;
        const oy = a.y - a.oy;
        const d = hyp(ox, oy);
        if (d > 0) {
          aim = true;
          ax = ox / d;
          ay = oy / d;
          ap = power(d);
        }
      }
    }
    if (useBtn && btn.on) {
      fire = true;
      btn.fired = true;
    }
    if (pulse) {
      fire = true;
      if (t >= pulseEnd) pulse = false;
    }

    // мышь и Shift: огонь — в курсор, рывок — от лисы к курсору
    let hasT = false;
    let tx = 0;
    let ty = 0;
    const shift = (keys & K_FIRE) !== 0;
    if (mouse.right || shift) fire = true;
    if (mouse.seen && (mouse.left || mouse.right || shift) && world(mouse.x, mouse.y)) {
      const cx = wx;
      const cy = wy;
      if (mouse.right || shift) {
        hasT = true;
        tx = cx;
        ty = cy;
      }
      if (mouse.left && !aim && origin(foxX, foxY) && mouseAim(cx, cy, reach)) {
        aim = true;
        ax = aimX;
        ay = aimY;
        ap = aimP;
      }
    }
    if (mouse.go) {
      mouse.go = false;
      // рывок с джойстика, если случился в тот же кадр, главнее
      if (!dashOn && world(mouse.gx, mouse.gy)) {
        const cx = wx;
        const cy = wy;
        if (origin(foxX, foxY) && mouseAim(cx, cy, reach)) {
          dashOn = true;
          dashX = aimX;
          dashY = aimY;
          dashP = aimP;
        }
      }
    }
    if (spaceOn) {
      spaceOn = false;
      if (!dashOn) {
        // пробел: во весь размах по ходу, а стоим — куда лиса смотрит
        dashOn = true;
        dashP = 1;
        if (speed === 0 && Number.isFinite(foxDir)) {
          dashX = Math.cos(foxDir);
          dashY = Math.sin(foxDir);
        } else {
          dashX = face.x;
          dashY = face.y;
        }
      }
    }

    input.mx = mx;
    input.my = my;
    input.fire = fire;
    input.aim = aim;
    input.ax = ax;
    input.ay = ay;
    input.ap = ap;
    input.hasT = hasT;
    input.tx = tx;
    input.ty = ty;
    // разовые команды: отданы этим кадром — к следующему их уже нет
    input.act = actOn;
    input.dash = dashOn;
    input.dx = dashOn ? dashX : 0;
    input.dy = dashOn ? dashY : 0;
    input.dp = dashOn ? dashP : 0;
    actOn = false;
    dashOn = false;
    sync();
    return input;
  }

  /** Отпустить всё: пальцы, мышь, клавиши и несыгранные разовые команды (открылось окно, игру свернули). */
  function reset() {
    cancelAll();
    keys = 0;
    mouseDrop();
    mouse.go = false;
    dashOn = false;
    actOn = false;
    spaceOn = false;
    pulse = false;
    input.mx = input.my = 0;
    input.fire = input.act = input.aim = input.dash = input.hasT = false;
    input.ax = input.ay = input.ap = 0;
    input.dx = input.dy = input.dp = 0;
    input.tx = input.ty = 0;
    sync();
  }

  resize(W, H, insets ?? NO_INSETS);

  return {
    input, sticks, resize, setLefty, setStick, setWeaponBtn, down, move, up, cancel, cancelAll, holds, mouse: mouseAt, mouseOut, mouseDrop, key, blur, frame, reset,
    get lefty() { return isLefty; },
    get stick() { return fixed ? 'static' : 'float'; },
    get weaponBtn() { return useBtn; },
  };
}

/**
 * Управление на странице: createInput({ stage, sticksEl, screen, toWorld, onPause }).
 *   stage — сцена (на ней ловятся касания), sticksEl — слой для джойстиков поверх холста;
 *   screen — api.screen (экран может лежать набок) или null; toWorld(x, y, out) → { x, y } — точка сцены в мире;
 *   onPause() — нажали Esc или P; lefty — сразу в режиме левши; tune — поправки к STICK (например, числа рывка
 *   из balance.js: { reachMin: DASH.minPower }).
 * Возвращает { frame(foxX, foxY, foxDir, reach) → объект ввода, state — он же, sticks — что нарисовано,
 * setLefty(on), setAction('fire' | 'use' | 'none') — значок на ручке, resize(), reset(), destroy() }.
 * frame() зовут раз в кадр перед шагами симуляции: он же двигает джойстики. Разовые команды (dash, act) живут один
 * вызов — в кадре, где шагов не будет (экран чаще 60 Гц), звать его не надо, иначе команда пропадёт; рендеру для
 * стрелки рывка хватит state.
 */
export function createInput({ stage, sticksEl, screen = null, toWorld = null, onPause = null, lefty = false, stick = 'float', weaponBtn = false, tune = null, now = null } = {}) {
  const doc = stage.ownerDocument;
  const win = doc.defaultView;
  const core = createStickCore({ lefty, stick, weaponBtn, toWorld, tune, now: now ?? (() => win.performance.now() / 1000) });
  const input = core.input;

  // где сцена лежит в осях игры (обновляет resize) и точка под указателем — числа, без новых объектов на событие
  let left = 0;
  let top = 0;
  let px = 0;
  let py = 0;
  let turn = screen ? screen.turn : 0;
  const point = { x: 0, y: 0 };
  const safe = { top: 0, right: 0, bottom: 0, left: 0 };
  let mounted = false;
  let hidden = false;
  let lifted = false;      // touch-события сказали: на экране не осталось ни одного пальца
  let action = 'none';
  let alive = true;
  // захват курсора (полный экран на компьютере): прицел — нарисованная точка, её двигают сдвиги мыши
  const cur = { x: 0, y: 0 };
  let sw = 0;              // размер сцены в осях игры (обновляет resize)
  let sh = 0;
  let wantLock = false;    // игра хочет, чтобы курсор был пойман
  let lockFails = 0;       // сколько раз браузер отказал подряд; два отказа — больше не мучаем
  let cross = null;        // нарисованный прицел (создаётся при первом захвате)
  let crossOn = false;

  const locked = () => doc.pointerLockElement === stage;

  function makeStick(kind) {
    const root = doc.createElement('div');
    root.className = `fh-stick fh-stick--${kind} fh-stick--idle`;
    root.setAttribute('aria-hidden', 'true');
    const ring = doc.createElement('div');
    ring.className = 'fh-stick-ring';
    const knob = doc.createElement('div');
    knob.className = 'fh-stick-knob';
    if (kind === 'act') {
      // значки «огонь» и «взять»: какой виден — решает data-action на самом джойстике
      for (const what of ['fire', 'use']) {
        const glyph = doc.createElement('span');
        glyph.className = `fh-stick-glyph fh-stick-glyph--${what}`;
        knob.append(glyph);
      }
      root.dataset.action = action;
    }
    root.append(ring, knob);
    // x…state — что уже стоит в стилях: страницу трогаем, только когда оно разошлось с нужным
    return { root, knob, x: NaN, y: NaN, kx: NaN, ky: NaN, state: 'idle' };
  }
  const drawn = [makeStick('move'), makeStick('act')];

  // кнопка оружия: круг с теми же значками «огонь» / «взять»; на страницу встаёт, только пока настройка включена
  const wb = doc.createElement('div');
  wb.className = 'fh-stick-btn';
  wb.setAttribute('aria-hidden', 'true');
  const wbDisc = doc.createElement('div');
  wbDisc.className = 'fh-stick-btn-disc';
  wb.append(wbDisc);
  for (const what of ['fire', 'use']) {
    const glyph = doc.createElement('span');
    glyph.className = `fh-stick-glyph fh-stick-glyph--${what}`;
    wb.append(glyph);
  }
  wb.dataset.action = action;
  const wbDraw = { x: NaN, y: NaN, on: false };
  let wbMounted = false;

  /** Поставить кольцо и ручку: только transform, и только если сдвинулись хотя бы на полпикселя. */
  function paintStick(d, v) {
    const x = Math.round(v.x * 2) / 2;
    const y = Math.round(v.y * 2) / 2;
    if (x !== d.x || y !== d.y) {
      d.x = x;
      d.y = y;
      d.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    const kx = Math.round(v.kx * 2) / 2;
    const ky = Math.round(v.ky * 2) / 2;
    if (kx !== d.kx || ky !== d.ky) {
      d.kx = kx;
      d.ky = ky;
      d.knob.style.transform = `translate3d(${kx}px, ${ky}px, 0)`;
    }
    if (v.state !== d.state) {
      d.state = v.state;
      d.root.classList.toggle('fh-stick--idle', v.state === 'idle');
      d.root.classList.toggle('fh-stick--hold', v.state === 'hold');
      d.root.classList.toggle('fh-stick--aim', v.state === 'aim');
    }
  }

  function paintBtn() {
    const v = core.sticks.btn;
    if (!v.shown || !mounted) return;
    const x = Math.round(v.x * 2) / 2;
    const y = Math.round(v.y * 2) / 2;
    if (x !== wbDraw.x || y !== wbDraw.y) {
      wbDraw.x = x;
      wbDraw.y = y;
      wb.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    if (v.on !== wbDraw.on) {
      wbDraw.on = v.on;
      wb.classList.toggle('fh-stick-btn--on', v.on);
    }
  }

  /** Кнопка оружия — на страницу или с неё, по настройке; значок «огонь» / «взять» — у неё, а не у стика. */
  function mountBtn() {
    const want = core.weaponBtn && mounted;
    if (want && !wbMounted) {
      wbMounted = true;
      wb.style.setProperty('--fh-btn-r', `${core.sticks.btn.r}px`);
      sticksEl.append(wb);
    } else if (!want && wbMounted) {
      wbMounted = false;
      wb.remove();
    }
    wb.dataset.action = action;
    drawn[ACT].root.dataset.action = core.weaponBtn ? 'none' : action;
  }

  function paint() {
    paintStick(drawn[MOVE], core.sticks.move);
    paintStick(drawn[ACT], core.sticks.act);
    paintBtn();
  }

  /** Мышь в деле — джойстики убираются; коснулись пальцем — возвращаются. */
  function hide(on) {
    if (on === hidden) return;
    hidden = on;
    sticksEl.classList.toggle('fh-sticks--off', on);
  }

  /**
   * Запомнить, где сцена и какие у неё отступы. Единственное место, где читается раскладка: в обработчиках
   * движения её трогать нельзя — каждое чтение там заставило бы браузер пересчитывать страницу по нескольку раз за кадр.
   * Зовётся при смене размера, поворота и отступов (сама обёртка тоже следит, но index.js может позвать и явно).
   */
  function resize() {
    if (!alive) return;
    const box = stage.getBoundingClientRect();
    let w = box.width;
    let h = box.height;
    safe.top = safe.right = safe.bottom = safe.left = 0;
    if (screen) {
      // экран может лежать на боку, и рамка повёрнутой сцены — «стоячая»: два её угла переводим в оси игры
      let p = screen.toLocal(box.left, box.top, point) || point;
      const ax = p.x;
      const ay = p.y;
      p = screen.toLocal(box.right, box.bottom, point) || point;
      left = Math.min(ax, p.x);
      top = Math.min(ay, p.y);
      w = Math.abs(p.x - ax);
      h = Math.abs(p.y - ay);
      // отступы экрана — в отступы сцены (обычно сцена и есть весь экран)
      const size = screen.size();
      const ins = screen.insets();
      safe.top = Math.max(0, ins.top - top);
      safe.left = Math.max(0, ins.left - left);
      safe.right = Math.max(0, ins.right - (size.w - left - w));
      safe.bottom = Math.max(0, ins.bottom - (size.h - top - h));
      if (screen.turn !== turn) {
        turn = screen.turn;
        core.cancelAll();                            // экран перевернули — пальцы лежат уже не там
      }
    } else {
      left = box.left;
      top = box.top;
    }
    sw = w;
    sh = h;
    if (locked()) stepCursor(cur, 0, 0, sw, sh);
    core.resize(w, h, safe);
    paint();
    if (!mounted && w > 0 && h > 0) {
      // на страницу — уже на своих местах: иначе джойстики на глазах приезжали бы из угла
      mounted = true;
      sticksEl.append(drawn[MOVE].root, drawn[ACT].root);
      mountBtn();
      paint();
    }
  }

  /** Точка события в осях сцены → px, py. Раскладку не читает: место сцены запомнено в resize(). */
  function locate(e) {
    if (screen) {
      const p = screen.toLocal(e.clientX, e.clientY, point) || point;
      px = p.x - left;
      py = p.y - top;
    } else {
      px = e.clientX - left;
      py = e.clientY - top;
    }
  }

  function capture(e) {
    try {
      stage.setPointerCapture(e.pointerId);          // палец уйдёт за край сцены — ведём дальше
    } catch {
      // касание уже кончилось — вести нечего
    }
  }

  function onMouse(e) {
    hide(true);
    if (locked()) {
      // курсор пойман: места под ним нет, есть только сдвиги — прицел едет по ним и за поле не выходит
      stepCursor(cur, e.movementX, e.movementY, sw, sh);
      px = cur.x;
      py = cur.y;
      placeCross();
    } else {
      locate(e);
      cur.x = px;
      cur.y = py;
    }
    core.mouse(e.buttons, px, py);
  }

  /** Прицел-спрайт: готовый элемент со стилями (без градиентов), в кадре двигается только translate. */
  function placeCross() {
    if (!cross) return;
    const x = Math.round(cur.x);
    const y = Math.round(cur.y);
    cross.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function showCross(on) {
    if (on && !cross) {
      cross = doc.createElement('div');
      cross.className = 'fh-cross';
      cross.setAttribute('aria-hidden', 'true');
      stage.append(cross);
    }
    if (!cross || on === crossOn) return;
    crossOn = on;
    if (on) placeCross();
    cross.classList.toggle('fh-cross--on', on);
  }

  function requestLock() {
    try {
      const r = stage.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      lockFails += 1;
    }
  }

  function onLockChange() {
    if (!alive) return;
    if (locked()) {
      lockFails = 0;
      stepCursor(cur, 0, 0, sw, sh);
      showCross(true);
    } else {
      showCross(false);
      core.mouseDrop();
    }
  }

  function onLockError() {
    lockFails += 1;
  }

  /**
   * Игра хочет (true) или не хочет (false) держать курсор пойманным. Звать при смене условий (окно открылось и
   * закрылось, полный экран включился). fresh — после нового включения: прежние отказы забыты.
   * Захват браузер даёт только по нажатию (или вскоре после него): не вышло — следующее нажатие на поле попробует
   * ещё раз и ни во что не превратится; после двух отказов подряд — обычный курсор, без мучений.
   */
  function setLock(want, fresh = false) {
    if (!alive) return;
    if (fresh) lockFails = 0;
    wantLock = Boolean(want);
    if (wantLock) {
      if (!locked() && lockFails < 2) requestLock();
    } else if (locked()) {
      try {
        doc.exitPointerLock?.();
      } catch {
        // уже отпущен
      }
    }
  }

  function onPointerDown(e) {
    const t = e.target;
    // кнопка паузы, окна и всё, что лежит поверх сцены, — не наше
    if (t !== stage && t !== sticksEl && t?.localName !== 'canvas') return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      if (wantLock && !locked() && lockFails < 2) {
        // это нажатие нужно браузеру, чтобы поймать курсор, — игре оно не достаётся
        requestLock();
        return;
      }
      onMouse(e);
      if (!locked()) capture(e);
      return;
    }
    hide(false);
    if (lifted) {
      // пальцев на экране не было, а джойстик всё ещё «держат»: отпускание потерялось — иначе половина
      // экрана осталась бы занятой до паузы
      lifted = false;
      core.cancelAll();
    }
    locate(e);
    if (core.down(e.pointerId, px, py) < 0) return;  // третий палец или занятая половина
    capture(e);
  }

  function onPointerMove(e) {
    if (e.pointerType === 'mouse') {
      onMouse(e);
      return;
    }
    if (!core.holds(e.pointerId)) return;
    locate(e);
    core.move(e.pointerId, px, py);
  }

  function onPointerUp(e) {
    if (e.pointerType === 'mouse') {
      onMouse(e);
      return;
    }
    if (!core.holds(e.pointerId)) return;
    locate(e);
    core.move(e.pointerId, px, py);
    core.up(e.pointerId);
  }

  function onPointerCancel(e) {
    if (e.pointerType === 'mouse') core.mouseDrop();
    else core.cancel(e.pointerId);
  }

  function onPointerLeave(e) {
    if (e.pointerType === 'mouse') core.mouseOut();
  }

  const prevent = (e) => e.preventDefault();

  // Пальцы лежат на сцене подолгу: без preventDefault айфон включает выделение и лупу, а частые касания
  // приближают страницу. Pointer-события при этом приходят как обычно. Заодно touch-события честно говорят,
  // сколько пальцев на экране, — по ним ловится потерянное отпускание (см. onPointerDown).
  function onTouchStart(e) {
    lifted = false;
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (e.touches && e.touches.length === 0) lifted = true;
    e.preventDefault();
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space' && t?.closest?.('button')) return;      // пробел на кнопке — нажатие кнопки, не рывок
    const res = core.key(e.code, true, e.repeat);
    if (res === KEY_FREE) return;
    e.preventDefault();
    if (res === KEY_PAUSE) onPause?.();
    else hide(true);                                 // клавиатура — значит, не телефон
  }

  function onKeyUp(e) {
    core.key(e.code, false);
  }

  function onBlur() {
    core.blur();
  }

  function onVisibility() {
    if (doc.hidden) reset();
  }

  function frame(foxX, foxY, foxDir, reach) {
    core.frame(foxX, foxY, foxDir, reach);
    paint();
    return input;
  }

  function reset() {
    core.reset();
    paint();
  }

  function setLefty(on) {
    core.setLefty(on);
    paint();
  }

  function setStick(mode) {
    core.setStick(mode);
    paint();
  }

  function setWeaponBtn(on) {
    core.setWeaponBtn(on);
    mountBtn();
    paint();
  }

  /** Что сейчас сделает нажатие без движения: значок на ручке джойстика действия. */
  function setAction(kind) {
    const next = kind === 'fire' || kind === 'use' ? kind : 'none';
    if (next === action) return;
    action = next;
    wb.dataset.action = next;
    drawn[ACT].root.dataset.action = core.weaponBtn ? 'none' : next;
  }

  // без этого браузер забирал бы палец под свою прокрутку и обрывал касание
  const touchAction = stage.style.touchAction;
  stage.style.touchAction = 'none';
  sticksEl.style.setProperty('--fh-stick-r', `${tune?.radius ?? STICK.radius}px`);
  // на компьютере с мышью джойстики не показываются с самого начала
  hide(Boolean(win.matchMedia?.('(hover: hover) and (pointer: fine)').matches));

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  stage.addEventListener('pointerleave', onPointerLeave);
  stage.addEventListener('contextmenu', prevent);
  stage.addEventListener('selectstart', prevent);
  stage.addEventListener('touchstart', onTouchStart, { passive: false });
  stage.addEventListener('touchmove', prevent, { passive: false });
  stage.addEventListener('touchend', onTouchEnd, { passive: false });
  stage.addEventListener('touchcancel', onTouchEnd, { passive: false });
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('pointerlockerror', onLockError);
  win.addEventListener('blur', onBlur);
  const offChange = screen?.onChange?.(resize);
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(stage);
  resize();

  function destroy() {
    if (!alive) return;
    alive = false;
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onPointerUp);
    stage.removeEventListener('pointercancel', onPointerCancel);
    stage.removeEventListener('pointerleave', onPointerLeave);
    stage.removeEventListener('contextmenu', prevent);
    stage.removeEventListener('selectstart', prevent);
    stage.removeEventListener('touchstart', onTouchStart);
    stage.removeEventListener('touchmove', prevent);
    stage.removeEventListener('touchend', onTouchEnd);
    stage.removeEventListener('touchcancel', onTouchEnd);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('keyup', onKeyUp);
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pointerlockchange', onLockChange);
    doc.removeEventListener('pointerlockerror', onLockError);
    win.removeEventListener('blur', onBlur);
    wantLock = false;
    if (locked()) {
      try {
        doc.exitPointerLock?.();
      } catch {
        // уже отпущен
      }
    }
    cross?.remove();
    cross = null;
    offChange?.();
    observer?.disconnect();
    core.reset();
    drawn[MOVE].root.remove();
    drawn[ACT].root.remove();
    wb.remove();
    sticksEl.classList.remove('fh-sticks--off');
    sticksEl.style.removeProperty('--fh-stick-r');
    stage.style.touchAction = touchAction;
  }

  return { frame, state: input, sticks: core.sticks, setLefty, setStick, setWeaponBtn, setAction, setLock, get locked() { return locked(); }, resize, reset, destroy };
}
