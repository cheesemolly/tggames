// Альбомный экран игры (в реестре landscape: true; владелец, 2026-10-13: «альбомная ориентация и чтобы ничего не
// мешало в горизонтали играть»).
//
// Повернуть экран телефона Telegram не умеет: lockOrientation() только закрепляет то, как телефон лежит сейчас.
// Поэтому, пока телефон держат стоя, экран игры кладётся набок стилем — поворотом на 90° вокруг левого верхнего
// угла. Когда телефон уже повёрнут (или это окно на компьютере), поворота нет, а на телефоне альбомная ориентация
// закрепляется, чтобы экран не встал обратно посреди игры. Поворачивается весь экран маршрута (main.screen):
// игра, «Загрузка…», экран ошибки и карточка итога.
//
// Рамка экрана (в осях устройства): в полном экране Telegram — весь body вместе с полями под часы и кнопки
// Telegram (игра рисует поле в край, а свои кнопки держит внутри отступов), иначе — #app (вне Telegram над ним
// остаётся шапка заглушки). Размеры берутся из вёрстки в пикселях: vh/dvh и переменные Telegram о повёрнутом экране
// ничего не знают.
//
//   поворот   экран (transform-origin: 0 0)              точка устройства (x, y) → точка игры
//   0         W × H, без поворота                        (x, y)
//   90        H × W, translate(W, 0) rotate(90deg)       (y, W − x)        лево игры — верх телефона
//   −90       H × W, translate(0, H) rotate(−90deg)      (H − y, x)        лево игры — низ телефона
// W и H — рамка в осях устройства, x и y — от её левого верхнего угла.
//
// На экране игры — класс screen-land, признак data-turn и отступы --ls-t/-r/-b/-l (уже в осях игры). Сообщения
// оболочки (shared/toast.js) живут на body, вне экрана игры: для них на <html> остаются признак data-land (поворот)
// и переменная --land-t (верхний отступ игры) — по ним стили кладут сообщение на тот же бок (styles/app.css).
//
// Чистые функции (turnOf, placeOf, toLocal, insetsOf) и сам помощник на подставных окне и платформе проверяет
// shell/tests/landscape.test.js; вживую — tools/fox-hunt-landscape.html.

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const VARS = ['--ls-t', '--ls-r', '--ls-b', '--ls-l'];        // отступы в осях игры: верх, право, низ, лево
const ROOT_TOP = '--land-t';   // верхний отступ игры — ещё и на <html>: для сообщений оболочки вне экрана игры
const TURN_FADE_MS = 180;      // экран перевернулся — короткое проявление вместо скачка за один кадр
const RECHECK_MS = 200;        // страница скрыта, кадров нет — сверяемся по таймеру

/** На сколько повёрнут экран игры: 0 — не повёрнут (компьютер или рамка и так широкая), иначе 90 или −90 (flip). */
export function turnOf({ w, h, desktop = false, flip = false }) {
  if (desktop || w >= h) return 0;
  return flip ? -90 : 90;
}

/** Стили экрана для рамки { x, y, w, h } (оси устройства) и поворота: свойство CSS → значение. */
export function placeOf(box, turn) {
  const side = turn !== 0;
  let transform = 'none';
  if (turn === 90) transform = `translate(${box.w}px, 0) rotate(90deg)`;
  if (turn === -90) transform = `translate(0, ${box.h}px) rotate(-90deg)`;
  return {
    position: 'fixed',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${side ? box.h : box.w}px`,
    height: `${side ? box.w : box.h}px`,
    'transform-origin': '0 0',
    transform,
  };
}

/** Точка касания (clientX, clientY) → точка в осях игры. out — куда писать (чтобы не плодить объекты на каждый кадр). */
export function toLocal(box, turn, clientX, clientY, out = { x: 0, y: 0 }) {
  const x = clientX - box.x;
  const y = clientY - box.y;
  if (turn === 90) {
    out.x = y;
    out.y = box.w - x;
  } else if (turn === -90) {
    out.x = box.h - y;
    out.y = x;
  } else {
    out.x = x;
    out.y = y;
  }
  return out;
}

/** Отступы устройства { top, right, bottom, left } → те же отступы в осях повёрнутой игры. Мусор — ноль. */
export function insetsOf(device, turn) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const d = device ?? NO_INSETS;
  const top = n(d.top);
  const right = n(d.right);
  const bottom = n(d.bottom);
  const left = n(d.left);
  if (turn === 90) return { top: right, right: bottom, bottom: left, left: top };
  if (turn === -90) return { top: left, right: top, bottom: right, left: bottom };
  return { top, right, bottom, left };
}

/**
 * Положить экран el набок и держать его таким, пока не позовут dispose().
 *   platform — адаптер Telegram (isDesktop, insets, onInsets, orientation, onActivated);
 *   app      — #app: рамка экрана вне полного экрана Telegram;
 *   win, doc — окно и документ (в тестах — подставные).
 * Возвращает { api, sync, forget, dispose }: api — это api.screen для игры; sync() — сверить сейчас; forget() —
 * снять обработчики onChange закрытой игры; dispose() — вернуть экран как был.
 */
export function createLandscape(el, { platform, app = null, win = window, doc = document } = {}) {
  const root = doc.documentElement;
  const desktop = Boolean(platform?.isDesktop);
  const listeners = new Set();
  const box = { x: 0, y: 0, w: 0, h: 0 };     // рамка в осях устройства
  let ins = { ...NO_INSETS };                 // отступы в осях игры
  let turn = 0;
  let flipped = false;
  let placed = false;        // рамку уже удалось измерить, стили стоят
  let locked = false;        // ориентацию закрепили мы
  let relock = false;        // вернулись в приложение — повторить просьбу о закреплении
  let disposed = false;
  let frame = 0;
  let timer = 0;

  const calm = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    || Boolean(root.classList?.contains('reduce-motion'));

  /** Рамка в целых пикселях: дробная дала бы мыло на повёрнутом холсте. */
  function measure() {
    const host = root.dataset?.fullscreen === 'on' ? doc.body : (app ?? el.parentElement ?? doc.body);
    const r = host.getBoundingClientRect();
    const x = Math.round(r.left);
    const y = Math.round(r.top);
    return { x, y, w: Math.round(r.right) - x, h: Math.round(r.bottom) - y };
  }

  /**
   * Закрепить альбомную ориентацию можно только на телефоне, который уже лежит на боку: lock() закрепляет то, что
   * есть сейчас, и у стоящего телефона закрепил бы портрет. Поэтому мало широкой рамки (она бывает и у стоящего
   * телефона — мини-приложение, открытое на пол-экрана) — шире, чем выше, должно быть и само окно.
   */
  function syncLock() {
    const want = !disposed && placed && !desktop && turn === 0 && win.innerWidth > win.innerHeight;
    if (want && (!locked || relock)) platform.orientation?.lock();
    else if (!want && locked) platform.orientation?.unlock();
    locked = want;
    relock = false;
  }

  /** Сверить рамку, поворот и отступы с тем, что есть сейчас; стили и обработчики — только если что-то изменилось. */
  function sync() {
    if (disposed) return;
    const b = measure();
    if (b.w <= 0 || b.h <= 0) return;           // экран ещё не разложен — придёт resize
    const t = turnOf({ w: b.w, h: b.h, desktop, flip: flipped });
    const i = insetsOf(platform.insets?.(), t);
    const turned = placed && t !== turn;
    const moved = !placed || turned || b.x !== box.x || b.y !== box.y || b.w !== box.w || b.h !== box.h;
    const inset = !placed || i.top !== ins.top || i.right !== ins.right || i.bottom !== ins.bottom || i.left !== ins.left;
    if (moved) {
      Object.assign(box, b);
      turn = t;
      el.classList.add('screen-land');
      el.dataset.turn = String(t);
      for (const [name, value] of Object.entries(placeOf(box, t))) el.style.setProperty(name, value);
      // сообщения оболочки живут на body, вне экрана игры: по этому признаку стили кладут их на тот же бок
      root.dataset.land = String(t);
    }
    if (inset) {
      ins = i;
      [i.top, i.right, i.bottom, i.left].forEach((px, k) => el.style.setProperty(VARS[k], `${px}px`));
      root.style.setProperty(ROOT_TOP, `${i.top}px`);
    }
    placed = true;
    syncLock();
    if (!moved && !inset) return;
    if (turned && !calm()) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: TURN_FADE_MS, easing: 'ease-out' });
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch (err) {
        console.error('альбомный экран: обработчик onChange упал', err);
      }
    }
  }

  /**
   * Сверка — следующим кадром и не чаще раза за кадр. Telegram зовёт обработчики до того, как сам выставит новые
   * переменные (высоту окна, отступы), так что прямо в обработчике вёрстка ещё старая; а iOS шлёт эти события на
   * каждый пересчёт вёрстки, без изменений.
   */
  function later() {
    if (disposed || frame) return;
    frame = win.requestAnimationFrame(run);
    timer = win.setTimeout(run, RECHECK_MS);
  }

  function run() {
    win.cancelAnimationFrame(frame);
    win.clearTimeout(timer);
    frame = 0;
    timer = 0;
    sync();
  }

  win.addEventListener('resize', later);
  win.addEventListener('orientationchange', later);
  const offInsets = platform.onInsets?.(later);
  // Android отпускает закрепление, пока приложение свёрнуто, а вернувшись, закрепляет то, как телефон лежит в эту
  // секунду, — возможно, уже стоя. Вернулись — сверяемся заново (повтор той же просьбы клиент молча пропускает).
  const offActivated = platform.onActivated?.(() => {
    relock = true;
    later();
  });
  // рамка меняется и без событий окна (поля body в полном экране) — следим за ней самой
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(later) : null;
  observer?.observe(doc.body);
  if (app) observer?.observe(app);

  const api = {
    /** На сколько повёрнут экран сейчас: 0 | 90 | −90. */
    get turn() { return turn; },
    /** Экран положен набок стилем (телефон держат стоя) — тогда его можно перевернуть на другой бок (flip). */
    get rotated() { return turn !== 0; },
    get flipped() { return flipped; },
    /** Размер экрана в осях игры. */
    size: () => (turn === 0 ? { w: box.w, h: box.h } : { w: box.h, h: box.w }),
    toLocal: (clientX, clientY, out) => toLocal(box, turn, clientX, clientY, out),
    /** Куда нельзя ставить кнопки (часы, вырез, кнопки Telegram) — в осях игры. */
    insets: () => ({ ...ins }),
    /** Положить на другой бок (для левшей и тех, кому кнопки Telegram мешают слева). */
    flip(on) {
      if (Boolean(on) === flipped) return;
      flipped = Boolean(on);
      sync();
    },
    /** Сменились размер, поворот или отступы; зовётся после того, как стили уже стоят. Возвращает отписку. */
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  sync();

  return {
    api,
    sync,
    /** Игру закрыли или перезапускают: её обработчики больше не зовутся, даже если она забыла отписаться. */
    forget() {
      listeners.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener('resize', later);
      win.removeEventListener('orientationchange', later);
      offInsets?.();
      offActivated?.();
      observer?.disconnect();
      win.cancelAnimationFrame(frame);
      win.clearTimeout(timer);
      frame = 0;
      timer = 0;
      listeners.clear();
      syncLock();                                // disposed — значит, отпустить, если закрепляли
      el.classList.remove('screen-land');
      delete el.dataset.turn;
      for (const name of [...Object.keys(placeOf(box, 0)), ...VARS]) el.style.removeProperty(name);
      delete root.dataset.land;
      root.style.removeProperty(ROOT_TOP);
    },
  };
}
