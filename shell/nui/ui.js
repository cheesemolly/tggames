// Общие детали нового интерфейса (в бете 'new-ui', концепт 7 «Пиксель»): аватар, картинка игры, карточки,
// нижние вкладки, шторка, переключатель, скелетон. Стили — styles/nui.css (всё под html.nui).

import { el } from '../../shared/dom.js';
import { animate, EASE_OUT, reducedMotion } from '../../shared/motion.js';
import { GAME_ICONS } from '../icons.js';
import { categoryOfGame } from '../categories.js';
import { UI, icon } from './icons.js';

/** Папка игры для цвета картинки (data-cat → --c/--cl в styles/nui.css). */
export const catOf = (id) => categoryOfGame(id)?.id ?? 'words';

const AVATAR_CATS = ['arcade', 'puzzles', 'board', 'quiz', 'words', 'music'];

/** Квадратный аватар с первой буквой имени, цвет — от имени. */
export function avatar(name, cls = '') {
  const text = String(name ?? '').trim();
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const letter = [...text][0]?.toUpperCase() ?? '?';
  return el('span', { class: `nava ${cls}`.trim(), 'data-cat': AVATAR_CATS[h % AVATAR_CATS.length] }, letter);
}

/** Цветная картинка игры: фон папки с «развёрткой», белый знак игры. */
export function gameArt(id, cls = '') {
  const art = el('span', { class: `nart ${cls}`.trim(), 'data-cat': catOf(id) });
  const glyph = el('span', { class: 'nart-g' });
  glyph.innerHTML = GAME_ICONS[id] ?? '';
  art.append(glyph);
  return art;
}

/** Сердечко «в избранное»: отдельная кнопка поверх карточки (кнопка внутри ссылки — нельзя). */
export function favButton(id, on, onFlip) {
  const button = el('button', { class: `nfav${on ? ' on' : ''}`, 'aria-label': on ? 'Убрать из избранного' : 'В избранное', 'aria-pressed': String(on) });
  button.innerHTML = on ? UI.heartOn : UI.heart;
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = await onFlip(id);
    button.classList.toggle('on', now);
    button.innerHTML = now ? UI.heartOn : UI.heart;
    button.setAttribute('aria-pressed', String(now));
    button.setAttribute('aria-label', now ? 'Убрать из избранного' : 'В избранное');
    animate(button, [{ transform: 'scale(0.7)' }, { transform: 'scale(1.2)', offset: 0.6 }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  });
  return button;
}

/** Место в рейтинге игры «#4» — появляется, когда пришла сводка рейтинга. */
export const placeTag = (id) => el('span', { class: 'nplace', 'data-place': id });

/**
 * Карточка игры для ряда на главной: картинка, название, строка прогресса, место. item — из collectGames().
 */
export function gameCard(item, { onFlip, beta = false } = {}) {
  return el('div', { class: 'ncard', 'data-cat': item.cat },
    el('a', { class: 'ncard-link', href: `#/game/${encodeURIComponent(item.id)}` },
      el('span', { class: 'ncard-art' },
        gameArt(item.id),
        (beta || item.save) && el('span', { class: 'ntags' },
          beta && el('span', { class: 'ntag ntag-beta' }, 'бета'),
          item.save && el('span', { class: 'ntag' }, 'продолжить'),
        ),
      ),
      el('span', { class: 'ncard-title' }, item.title),
      el('span', { class: 'ncard-meta' }, el('span', { class: 'ncard-line' }, item.line), placeTag(item.id)),
    ),
    favButton(item.id, item.fav, onFlip),
  );
}

/** Широкая строка игры для экрана «Игры». */
export function gameRow(item, { onFlip, beta = false } = {}) {
  return el('div', { class: 'nrow', 'data-cat': item.cat },
    el('a', { class: 'nrow-link', href: `#/game/${encodeURIComponent(item.id)}` },
      gameArt(item.id, 'nart-sm'),
      el('span', { class: 'nrow-text' },
        el('span', { class: 'nrow-title' }, item.title,
          beta && el('span', { class: 'ntag ntag-beta ntag-inline' }, 'бета'),
          item.save && el('span', { class: 'ntag ntag-inline' }, 'продолжить')),
        el('span', { class: 'ncard-meta' }, el('span', { class: 'ncard-line' }, item.line), placeTag(item.id)),
      ),
    ),
    favButton(item.id, item.fav, onFlip),
  );
}

/** Проставить места «#N» во всех карточках экрана, когда пришла сводка рейтинга. */
export function fillPlaces(root, places) {
  for (const tag of root.querySelectorAll('.nplace[data-place]')) {
    const p = places[tag.dataset.place];
    if (!p || tag.textContent) continue;
    tag.textContent = `#${p.place}`;
    tag.classList.add('nplace-in');
  }
}

/** Заголовок раздела: «Аркады» и «Все ›». */
export function sectionHead(title, href = null, label = 'Все') {
  return el('div', { class: 'nsec-head' },
    el('h2', { class: 'npx' }, title),
    href && el('a', { class: 'nsec-all', href }, `${label} ›`),
  );
}

/** Скелетон: серые плашки на месте того, что ещё грузится. */
export function skeleton(kind = 'row', count = 1) {
  return Array.from({ length: count }, () => el('div', { class: `nskel nskel-${kind}` },
    el('i', { class: 'nskel-a' }), el('span', { class: 'nskel-lines' }, el('i'), el('i'))));
}

// ---------- нижние вкладки ----------

export const TABS = [
  { id: 'home', href: '#/', label: 'Главная', icon: 'home' },
  { id: 'games', href: '#/games', label: 'Игры', icon: 'games' },
  { id: 'top', href: '#/top', label: 'Рейтинг', icon: 'trophy' },
  { id: 'profile', href: '#/profile', label: 'Профиль', icon: 'user' },
];

export function tabBar(active, { onTab = () => {} } = {}) {
  return el('nav', { class: 'ntabs', 'aria-label': 'Разделы' }, TABS.map((t) => {
    const link = el('a', { class: `ntab${t.id === active ? ' on' : ''}`, href: t.href, ...(t.id === active ? { 'aria-current': 'page' } : {}) },
      icon(t.icon), el('span', { class: 'ntab-label' }, t.label));
    // hash-роутинг везде через replace: вкладки не копятся в истории; нажатие на открытую вкладку — наверх
    link.addEventListener('click', (e) => {
      e.preventDefault();
      onTab(t, t.id === active);
      if (t.id !== active || location.hash !== t.href) location.replace(t.href);
    });
    return link;
  }));
}

// ---------- шторка ----------

/**
 * Шторка снизу (вместо окон — выбор владельца): ручка, заголовок, крестик; закрывается крестиком, тапом по
 * затемнению и движением вниз за ручку. tall — почти на весь экран.
 */
export function openSheet({ title, content, tall = false, onClose = () => {} }) {
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    Promise.all([
      animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }),
      animate(panel, [{ transform: `translateY(${dragY}px)` }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }),
    ]).then(() => {
      layer.remove();
      onClose();
    });
  };
  let closing = false;
  let dragY = 0;
  const grab = el('div', { class: 'nsheet-grab' }, el('span'));
  const head = el('div', { class: 'nsheet-head' },
    el('button', { class: 'nsheet-x', 'aria-label': 'Закрыть', onclick: close }, icon('x')),
    el('h3', { class: 'npx' }, title),
    el('span'),
  );
  const body = el('div', { class: 'nsheet-body' }, content);
  const panel = el('div', { class: `nsheet${tall ? ' nsheet-tall' : ''}`, role: 'dialog', 'aria-label': title }, grab, head, body);
  const layer = el('div', { class: 'nsheet-layer', onclick: (e) => { if (e.target === layer) close(); } }, panel);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  // потянуть вниз за ручку или заголовок — закрыть
  let startY = null;
  const dragArea = [grab, head];
  const down = (e) => {
    if (e.target.closest('button')) return;
    startY = e.clientY;
    panel.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (startY === null) return;
    dragY = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dragY}px)`;
  };
  const up = () => {
    if (startY === null) return;
    startY = null;
    if (dragY > 80) close();
    else {
      panel.style.transform = '';
      animate(panel, [{ transform: `translateY(${dragY}px)` }, { transform: 'none' }], { duration: 180, easing: EASE_OUT });
      dragY = 0;
    }
  };
  for (const area of dragArea) area.addEventListener('pointerdown', down);
  panel.addEventListener('pointermove', move);
  panel.addEventListener('pointerup', up);
  panel.addEventListener('pointercancel', up);

  document.body.append(layer);
  if (!reducedMotion()) {
    animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    animate(panel, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 300, easing: EASE_OUT });
  }
  return { close, body, panel };
}

/** Переключатель в строке настроек. */
export function switchButton(on, onChange) {
  const button = el('button', { class: `nswitch${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on) }, el('i'));
  button.addEventListener('click', () => {
    const now = !button.classList.contains('on');
    button.classList.toggle('on', now);
    button.setAttribute('aria-checked', String(now));
    onChange(now);
  });
  return button;
}
