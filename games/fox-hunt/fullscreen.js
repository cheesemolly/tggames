// Полный экран на компьютере: настоящий полный экран, захват клавиши Esc (чтобы она оставалась паузой) и общие
// мелочи для захвата курсора. DOM не создаёт; document и navigator приходят параметрами — тесты подставляют поддельные.
// Любой отказ или отсутствие API молча значит «играем как раньше».

/** Настройка «Полный экран»: нет поля (старое сохранение) или что-то не то — выключено. */
export function readFullscreen(v) {
  return v?.fullscreen === true;
}

/**
 * Компьютер ли это: нет касаний, указатель точный, телефонного браузера нет, экран не лежит на боку.
 * Телефон и Telegram на телефоне ничего не меняют.
 */
export function isDesktop({ touchPoints = 0, fine = false, rotated = false, mobileUa = false } = {}) {
  return touchPoints === 0 && fine === true && !rotated && !mobileUa;
}

/** Условия для isDesktop из настоящего окна. */
export function desktopFacts(win, screen = null) {
  const nav = win?.navigator;
  return {
    touchPoints: Number(nav?.maxTouchPoints) || 0,
    fine: Boolean(win?.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches),
    rotated: Boolean(screen?.rotated),
    mobileUa: /Android|iPhone|iPad|iPod|Mobile/i.test(String(nav?.userAgent ?? '')),
  };
}

/**
 * host — элемент, который разворачивается (контейнер игры). onLost() — полный экран кончился сам (Esc без захвата
 * клавиши, жест браузера), не по нашему leave().
 * Возвращает { enter() → Promise<bool>, leave(), destroy(), get active, get keyLocked }.
 */
export function createFullscreen({ doc, nav, host, tg = null, onLost = null } = {}) {
  // В Telegram окно мини-приложения разворачивает только его собственный полный экран (platform.fullscreen):
  // обычный requestFullscreen растянул бы страницу лишь внутри маленького окна.
  if (tg?.supported) return createTelegramFullscreen(tg, onLost);
  let entered = false;
  let keyLocked = false;
  let leaving = false;
  let gen = 0;                       // каждый leave / destroy отменяет ещё не законченный enter
  let alive = true;

  const isFull = () => Boolean(doc) && doc.fullscreenElement === host;

  function unlockKeys() {
    if (!keyLocked) return;
    keyLocked = false;
    try {
      nav?.keyboard?.unlock?.();
    } catch {
      // нечего снимать
    }
  }

  function exit() {
    if (!isFull()) return;
    try {
      const r = doc.exitFullscreen?.();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // уже вышли
    }
  }

  function onChange() {
    if (isFull()) {
      entered = true;
      return;
    }
    if (!entered) return;
    entered = false;
    unlockKeys();
    if (leaving) {
      leaving = false;
      return;
    }
    if (alive) onLost?.();
  }

  doc?.addEventListener?.('fullscreenchange', onChange);

  /** Включить: вызывать прямо из нажатия — браузер разрешает полный экран только так. */
  async function enter() {
    if (!alive || !host || typeof host.requestFullscreen !== 'function') return false;
    if (isFull()) return true;
    const mine = ++gen;
    try {
      await host.requestFullscreen();
    } catch {
      return false;
    }
    if (mine !== gen || !alive) {
      // пока ждали, нас выключили
      exit();
      return false;
    }
    entered = true;
    // Esc остаётся игре: без захвата браузер сам выходит из полного экрана и кнопка Esc до игры не доходит
    try {
      if (nav?.keyboard && typeof nav.keyboard.lock === 'function') {
        await nav.keyboard.lock(['Escape']);
        keyLocked = true;
        if (mine !== gen || !alive) {
          unlockKeys();
          exit();
          return false;
        }
      }
    } catch {
      keyLocked = false;
    }
    return true;
  }

  /** Выключить: из полного экрана, клавишу вернуть. Лишний вызов ничего не делает. */
  function leave() {
    gen += 1;
    unlockKeys();
    if (isFull()) {
      leaving = true;
      exit();
      // если выход не сработал сразу, событие всё равно придёт; флаг не должен пережить его
    } else {
      entered = false;
    }
  }

  function destroy() {
    if (!alive) return;
    leave();
    alive = false;
    doc?.removeEventListener?.('fullscreenchange', onChange);
    onLost = null;
  }

  return {
    enter,
    leave,
    destroy,
    get active() {
      return alive && entered && isFull();
    },
    get keyLocked() {
      return keyLocked;
    },
  };
}

/** Полный экран Telegram (Bot API 8.0): запрос, ответ приходит событием; Esc здесь решает сам клиент. */
function createTelegramFullscreen(tg, onLost) {
  let entered = false;
  let leaving = false;
  let alive = true;
  let waiting = null;                // { done, timer } — включение ещё не подтверждено

  function settle(ok) {
    if (!waiting) return;
    clearTimeout(waiting.timer);
    const { done } = waiting;
    waiting = null;
    done(ok);
  }

  function onChange() {
    if (!alive) return;
    if (tg.isActive) {
      entered = true;
      settle(true);
      return;
    }
    if (waiting) {
      settle(false);                 // fullscreenFailed
      return;
    }
    if (!entered) return;
    entered = false;
    if (leaving) {
      leaving = false;
      return;
    }
    onLost?.();
  }

  tg.onChange?.(onChange);

  function enter() {
    if (!alive) return Promise.resolve(false);
    if (tg.isActive) {
      entered = true;
      return Promise.resolve(true);
    }
    settle(false);
    return new Promise((resolve) => {
      waiting = { done: resolve, timer: setTimeout(() => settle(Boolean(tg.isActive) && (entered = true)), 1500) };
      try {
        tg.request();
      } catch {
        settle(false);
      }
    });
  }

  function leave() {
    settle(false);
    if (!tg.isActive) {
      entered = false;
      return;
    }
    leaving = true;
    try {
      tg.exit();
    } catch {
      // уже вышли
    }
  }

  function destroy() {
    if (!alive) return;
    leave();
    alive = false;
    tg.offChange?.(onChange);
    onLost = null;
  }

  return {
    enter,
    leave,
    destroy,
    get active() {
      return alive && entered && Boolean(tg.isActive);
    },
    get keyLocked() {
      return false;
    },
  };
}
