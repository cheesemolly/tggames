// Значки нового интерфейса (в бете 'new-ui'): вкладки, шапка, меню профиля, настройки.
// Как и значки игр (shell/icons.js), — линии в коде, цвет от родителя (currentColor).

const svg = (body) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"'
  + ` stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const FLAME = 'M12 21c3.6 0 6.2-2.5 6.2-6 0-3.8-2.9-5.6-4.2-9-1.5 2.1-1.5 3.8-1.5 3.8S10.1 8.8 10.7 5C7.4 7.1 5.8 10.6 5.8 15c0 3.5 2.6 6 6.2 6z';
const HEART = 'M12 20s-7.2-4.5-7.2-10.1A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.2 2.7C19.2 15.5 12 20 12 20z';

export const UI = {
  home: svg('<path d="M4 11 12 4.5 20 11v8.2a1.3 1.3 0 0 1-1.3 1.3H15v-5.5H9v5.5H5.3A1.3 1.3 0 0 1 4 19.2z"/>'),
  games: svg('<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.2a2.8 2.8 0 0 0 3.2 3.8M16 5.5h2.8a2.8 2.8 0 0 1-3.2 3.8"/>'
    + '<path d="M12 13v3.5M8.5 20h7M10 16.5h4"/>'),
  user: svg('<circle cx="12" cy="8.6" r="3.6"/><path d="M5 20c.9-3.7 3.7-5.6 7-5.6s6.1 1.9 7 5.6"/>'),
  flame: svg(`<path d="${FLAME}" fill="currentColor"/>`),
  heart: svg(`<path d="${HEART}"/>`),
  heartOn: svg(`<path d="${HEART}" fill="currentColor"/>`),
  search: svg('<circle cx="11" cy="11" r="6.2"/><path d="m20 20-4.4-4.4"/>'),
  sort: svg('<path d="M7.5 5v14M4.5 16l3 3 3-3M16.5 19V5M13.5 8l3-3 3 3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/>'),
  chat: svg('<path d="M4 5.5h16v10.5H9.5L5 19.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  plane: svg('<path d="M20.5 4.2 3.8 10.8l6 2.4 2.4 6 8.3-15z"/><path d="m9.8 13.2 4.4-4.4"/>'),
  shield: svg('<path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.5-7 8.9-4.1-1.4-7-4.7-7-8.9V6z"/><path d="m9 12 2.1 2.1L15.2 10"/>'),
  out: svg('<path d="M8 16 16 8M9.5 8H16v6.5"/>'),
  chevron: svg('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
  left: svg('<path d="m14.5 6-6 6 6 6"/>'),
  x: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  play: svg('<path d="M8 5.2v13.6L18.8 12z" fill="currentColor"/>'),
  sound: svg('<path d="M11 5 6.5 9H4v6h2.5L11 19z"/><path d="M15 9a4.5 4.5 0 0 1 0 6M17.8 6.5a8 8 0 0 1 0 11"/>'),
  vibe: svg('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 9v6M19.5 9v6"/>'),
  sparkle: svg('<path d="M12 3.5c.7 4.2 2.7 6.2 7 7-4.3.8-6.3 2.8-7 7-.7-4.2-2.7-6.2-7-7 4.3-.8 6.3-2.8 7-7z"/>'),
  beta: svg('<path d="M9 4.5h6M10 4.5v5.2L5.2 17.6a1.9 1.9 0 0 0 1.6 2.9h10.4a1.9 1.9 0 0 0 1.6-2.9L14 9.7V4.5"/><path d="M7.4 14h9.2"/>'),
  panel: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/>'
    + '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  medal: svg('<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 10 6 3.5h4L12 8M15.5 10 18 3.5h-4L12 8"/>'),
  retry: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
};

/** <span> со значком: innerHTML из доверенной строки выше, не из данных игрока. */
export function icon(name, cls = 'ni') {
  const node = document.createElement('span');
  node.className = cls;
  node.innerHTML = UI[name] ?? '';
  return node;
}
