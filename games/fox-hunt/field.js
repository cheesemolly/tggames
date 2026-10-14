// Поле игры: со стороны Telegram (там, где у экрана самый большой боковой отступ — слева при повороте на 90°,
// справа при −90°) лежит его строка состояния и кнопки. Эта полоса — не часть поля: поле, джойстики и надписи
// начинаются после неё, а сама полоса закрашена цветом фона игры. Остальные стороны — на весь экран.
// Масштаб мира от полосы не зависит: он считается по короткой стороне всего экрана.

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Полоса отступа по отступам экрана { top, right, bottom, left } в осях игры.
 * → { side: 'left' | 'right' | null, size } — size в px (0, если отступов по бокам нет).
 */
export function stripOf(ins) {
  const l = num(ins?.left);
  const r = num(ins?.right);
  if (l >= r && l > 0) return { side: 'left', size: l };
  if (r > 0) return { side: 'right', size: r };
  return { side: null, size: 0 };
}

/**
 * Поле для экрана w×h с отступами ins.
 * → { strip, left, w, h, base, insets }: left — где поле начинается (px от левого края экрана), w×h — его размер,
 * base — короткая сторона всего экрана (по ней считается масштаб мира), insets — отступы для содержимого поля
 * (со стороны полосы — 0, остальные прежние).
 */
export function fieldOf(w, h, ins) {
  const strip = stripOf(ins);
  const size = Math.min(strip.size, Math.max(0, w - 1));
  const cut = strip.side ? size : 0;
  const insets = {
    top: num(ins?.top),
    right: num(ins?.right),
    bottom: num(ins?.bottom),
    left: num(ins?.left),
  };
  if (strip.side) insets[strip.side] = 0;
  return {
    strip: { side: strip.side, size: cut },
    left: strip.side === 'left' ? cut : 0,
    w: Math.max(0, w - cut),
    h,
    base: Math.min(w, h),
    insets,
  };
}
