// Вкладка «Бета» (только владелец, маршрут #/beta): что сейчас обкатывается и ещё не видно игрокам.
// Игры можно открыть отсюда; функции — описаны, где их искать. Переключатель «Смотреть как игрок» прячет
// бету на этом устройстве — так видно, что получат игроки до релиза. Релиз — `npm run release` (Claude).

import { el } from '../shared/dom.js';
import { BETA, playerView, setPlayerView } from './beta.js';
import { GAME_ICONS } from './icons.js';

function tile(markup) {
  const node = el('span', { class: 'tile' });
  node.innerHTML = markup;
  return node;
}

export function renderBeta(container, { games, onBack, onChange }) {
  const asPlayer = playerView();
  const gamesList = BETA.filter((b) => b.kind === 'game');
  const features = BETA.filter((b) => b.kind === 'feature');

  const toggle = el('button', {
    class: `beta-switch${asPlayer ? ' on' : ''}`,
    role: 'switch',
    'aria-checked': String(asPlayer),
    onclick: () => {
      setPlayerView(!asPlayer);
      onChange();
    },
  }, el('span', { class: 'beta-knob' }));

  const since = (b) => (b.since ? el('span', { class: 'beta-since' }, `с ${b.since.split('-').reverse().join('.')}`) : null);

  const gameCard = (b) => {
    const entry = games.find((g) => g.id === b.id);
    return el('div', { class: 'beta-card' },
      tile(GAME_ICONS[b.id] ?? ''),
      el('div', { class: 'beta-card-text' },
        el('div', { class: 'beta-card-title' }, b.title ?? entry?.title ?? b.id, since(b)),
        b.note && el('div', { class: 'beta-card-note' }, b.note),
      ),
      entry && !asPlayer && el('a', { class: 'account-btn', href: `#/game/${encodeURIComponent(b.id)}` }, 'Открыть'),
    );
  };
  const featureCard = (b) => el('div', { class: 'beta-card' },
    el('div', { class: 'beta-card-text' },
      el('div', { class: 'beta-card-title' }, b.title ?? b.id, since(b)),
      b.note && el('div', { class: 'beta-card-note' }, b.note),
    ),
    b.open && !asPlayer && el('a', { class: 'account-btn', href: b.open }, 'Открыть'),
  );

  container.replaceChildren(el('div', { class: 'scroll beta-screen' },
    el('div', { class: 'folder-head' },
      el('button', { class: 'back-chip', onclick: onBack, 'aria-label': 'Ко всем играм' }, '‹ Все игры'),
      el('div', { class: 'folder-head-text' },
        el('h1', {}, 'Бета'),
        el('div', { class: 'title-rule' }),
        el('p', { class: 'hint' }, 'Это видишь только ты. Игроки получат всё сразу после релиза — напиши Claude «релиз».'),
      ),
    ),
    el('div', { class: 'beta-row' },
      el('div', {},
        el('div', { class: 'beta-card-title' }, 'Смотреть как игрок'),
        el('div', { class: 'beta-card-note' }, asPlayer
          ? 'Бета спрятана на этом устройстве — ты видишь то же, что игроки.'
          : 'Выключено: бета видна тебе в меню и в играх.'),
      ),
      toggle,
    ),
    !BETA.length && el('p', { class: 'hint beta-empty' }, 'Сейчас в бете ничего нет. Всё новое сначала появится здесь.'),
    gamesList.length > 0 && el('h2', { class: 'beta-h' }, `Игры · ${gamesList.length}`),
    gamesList.map(gameCard),
    features.length > 0 && el('h2', { class: 'beta-h' }, `Функции · ${features.length}`),
    features.map(featureCard),
  ));
}
