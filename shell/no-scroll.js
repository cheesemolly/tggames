// Страница не прокручивается (замечание владельца с видео с айфона: «во всех играх работает скролл, он очень
// мешает»). В Telegram на iOS документ пружинит и съезжает от любого движения пальца, даже когда прокручивать
// нечего, — вместе с ним уезжает игра. Поэтому:
//   1) html и body закреплены (styles/app.css: overflow hidden, overscroll-behavior none, body fixed);
//   2) движение пальца гасится везде, кроме элементов, которые действительно прокручиваются сейчас
//      (длинное окно настроек, список игр, панель владельца) — там прокрутка нужна, иначе не добраться до низа.
// Игры получают pointer-события как раньше: preventDefault у touchmove их не отменяет.

/**
 * Ближайший предок, который сейчас можно прокрутить по вертикали (или null). style(el) — getComputedStyle.
 * horizontal — считать и ряды, прокручиваемые вбок (ряды игр и баннеры нового интерфейса, в бете 'new-ui').
 */
export function scrollableAncestor(el, style, { horizontal = false } = {}) {
  const can = (value) => value === 'auto' || value === 'scroll';
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const s = style(node);
    if (can(s.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    if (horizontal && can(s.overflowX) && node.scrollWidth > node.clientWidth + 1) return node;
  }
  return null;
}

/** horizontal() — спрашивается при каждом касании: новый интерфейс включается после входа. */
export function lockPageScroll(doc = document, { horizontal = () => false } = {}) {
  const style = (node) => doc.defaultView.getComputedStyle(node);
  doc.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;                    // щипок (масштаб в маджонге) — не трогаем
    if (!scrollableAncestor(e.target, style, { horizontal: horizontal() })) e.preventDefault();
  }, { passive: false });
}
