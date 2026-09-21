// Анимации через Web Animations API — для оболочки и игр.
// При системной настройке «уменьшить движение» всё происходит мгновенно.

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reduce.matches;

export const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * el.animate(), но с учётом «уменьшить движение»; возвращает Promise окончания (ошибки гасятся).
 * Окончание страхуется таймером: в свёрнутой вкладке браузер ставит анимации на паузу, и без страховки
 * код «после анимации» (спрятать окно, снять паузу) не выполнился бы до возвращения.
 */
export function animate(el, keyframes, options = {}) {
  if (!el?.animate || reducedMotion()) return Promise.resolve();
  const animation = el.animate(keyframes, options);
  const total = (options.delay ?? 0) + (options.duration ?? 0);
  return Promise.race([
    animation.finished.then(() => {}, () => {}),
    new Promise((resolve) => setTimeout(resolve, total + 50)),
  ]);
}

/** Показать слой поверх игры (окно): фон проявляется, карточка всплывает. */
export function showLayer(layer) {
  layer.hidden = false;
  cancelAll(layer);
  animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  const card = layer.firstElementChild;
  if (card) {
    animate(card, [
      { opacity: 0, transform: 'translateY(16px) scale(0.98)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 260, easing: EASE_OUT });
  }
}

/**
 * Спрятать слой с затуханием. stillWanted() проверяется в конце: если за время анимации слой успели
 * открыть снова (другим окном), он не прячется.
 */
export async function hideLayer(layer, stillWanted = () => true) {
  const card = layer.firstElementChild;
  const fade = { duration: 160, easing: 'ease-in', fill: 'forwards' };
  await Promise.all([
    animate(layer, [{ opacity: 1 }, { opacity: 0 }], fade),
    card && animate(card, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.98)' }], fade),
  ]);
  if (stillWanted()) layer.hidden = true;
  cancelAll(layer);
}

function cancelAll(el) {
  el.getAnimations?.({ subtree: true }).forEach((a) => a.cancel());
}

/**
 * FLIP: плавный переход размера элемента, когда change() перестраивает раскладку
 * (элемент мгновенно получает новый размер, а анимация «доезжает» от старого).
 */
export function flipSize(el, change, { duration = 280, origin = 'top center' } = {}) {
  const before = el.getBoundingClientRect();
  change();
  const after = el.getBoundingClientRect();
  if (!after.width || Math.abs(before.width - after.width) < 1) return;
  el.style.transformOrigin = origin;
  animate(el, [{ transform: `scale(${before.width / after.width})` }, { transform: 'none' }], { duration, easing: EASE_OUT });
}

/** «Впрыгивание» — для только что появившегося элемента. */
export function pop(el, { from = 0.6, duration = 220 } = {}) {
  return animate(el, [
    { transform: `scale(${from})`, opacity: 0.4 },
    { transform: 'scale(1.1)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1)' },
  ], { duration, easing: 'ease-out' });
}

/** Тряска — ошибка. */
export function shake(el, { distance = 6, duration = 360 } = {}) {
  return animate(el, [
    { transform: 'translateX(0)' },
    { transform: `translateX(-${distance}px)` },
    { transform: `translateX(${distance}px)` },
    { transform: `translateX(-${distance * 0.6}px)` },
    { transform: `translateX(${distance * 0.6}px)` },
    { transform: 'translateX(0)' },
  ], { duration, easing: 'ease-in-out' });
}
