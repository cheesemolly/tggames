// Мелкие DOM-утилиты для оболочки и игр.

/**
 * Создаёт элемент. props: class, on<event>-обработчики, свойства DOM, остальное — атрибуты.
 * children: узлы, строки, числа, массивы; null/undefined/false пропускаются.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (tag === 'button') node.type = 'button';
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

/** Подключает CSS и ждёт загрузки. Ошибка загрузки не фатальна. */
export function loadCss(href) {
  return new Promise((resolve) => {
    const link = el('link', { rel: 'stylesheet', href: String(href) });
    link.onload = () => resolve(link);
    link.onerror = () => {
      console.warn(`Не удалось загрузить стили: ${href}`);
      resolve(link);
    };
    document.head.append(link);
  });
}
