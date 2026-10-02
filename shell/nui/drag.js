// Ряды, которые листаются вбок (истории, баннеры, папки, ряды игр), — перетаскиванием мышью на компьютере
// (владелец, 2026-10-02: «на компьютере в главном меню курсором нельзя тянуть витрины»). Пальцем браузер листает их
// сам; мышью — только колесом с Shift, поэтому тянем сами: нажал и повёл — ряд едет, отпустил — баннеры
// доезжают до ближайшего (прилипание включается обратно). Если ряд сдвинули, щелчок после этого не открывает
// карточку под курсором. Обработчик один на документ (делегирование) — работает на любом экране интерфейса.

export const DRAG_ROWS = '.nstories, .nbanners, .nchips-scroll, .nrowscroll';
const THRESHOLD = 6;      // px: меньше — это щелчок, а не перетаскивание

/** on() — включено ли сейчас (бета 'mouse-drag'). Возвращает функцию снятия обработчиков. */
export function installMouseDrag(doc, on = () => true) {
  let drag = null;        // { row, x0, left0, moved }
  let swallowClick = false;

  const down = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !on()) return;
    const row = e.target.closest?.(DRAG_ROWS);
    if (!row || row.scrollWidth <= row.clientWidth) return;
    drag = { row, x0: e.clientX, left0: row.scrollLeft, moved: false };
  };
  const move = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.row.classList.add('ndragging');      // без прилипания и выделения, курсор «рука»
    }
    drag.row.scrollLeft = drag.left0 - dx;
    e.preventDefault();
  };
  const up = () => {
    if (!drag) return;
    if (drag.moved) {
      swallowClick = true;
      const row = drag.row;
      // прилипание обратно — после кадра, чтобы баннеры доехали до ближайшего плавно
      requestAnimationFrame(() => row.classList.remove('ndragging'));
    }
    drag = null;
  };
  const click = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };
  // ссылки и картинки браузер сам «перетаскивает» как файл — в рядах это мешает
  const dragstart = (e) => {
    if (on() && e.target.closest?.(DRAG_ROWS)) e.preventDefault();
  };
  doc.addEventListener('pointerdown', down);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', up);
  doc.addEventListener('click', click, true);
  doc.addEventListener('dragstart', dragstart);
  return () => {
    doc.removeEventListener('pointerdown', down);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', up);
    doc.removeEventListener('click', click, true);
    doc.removeEventListener('dragstart', dragstart);
  };
}
