// Вкладка «Игры» нового интерфейса (в бете 'new-ui'): поиск по названию, папки таблетками (можно несколько),
// «Избранное», сортировка («Сначала недавние» / «Ещё не пробовал» — в бете 'catalog-untried' / «По названию») и список игр с сердечком и местом в рейтинге.
// Фильтры и поиск помнятся, пока приложение открыто. #/games/<папка> (из «Все ›» на главной) — сразу с ней.

import { el } from '../../shared/dom.js';
import { pop } from '../../shared/motion.js';
import { categories } from '../categories.js';
import { CATEGORY_ICONS } from '../icons.js';
import { UI, icon } from './icons.js';
import { gameRow, fillPlaces, skeleton } from './ui.js';
import { collectGames } from './games.js';
import { flipFav } from './store.js';
import { filterGames, sortGames, sortModes, SORTS, placesOf, plural } from './logic.js';
import { feature } from '../beta.js';

const state = { query: '', cats: [], fav: false, sort: 'recent', preset: null };

export async function renderCatalog(container, { games, route, account, summary, beta }) {
  // пришли по ссылке «Все ›» с другой папкой — фильтр ставится заново; вернулись на вкладку — как было
  const preset = route.id ?? null;
  if (preset !== state.preset) {
    state.preset = preset;
    state.query = '';
    state.fav = preset === 'fav';
    state.cats = preset && preset !== 'fav' && categories.some((c) => c.id === preset) ? [preset] : [];
  }

  if (!sortModes(feature('catalog-untried')).includes(state.sort)) state.sort = 'recent';
  const list = el('div', { class: 'nlist' }, skeleton('row', 5));
  const count = el('span', { class: 'nsort-count' });
  const sortBtn = el('button', { class: 'nsort-btn' }, icon('sort'), el('span', {}, SORTS[state.sort]));
  const search = el('input', {
    class: 'nsearch-input', type: 'search', placeholder: 'Найти игру', value: state.query, maxLength: 40,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'search', 'aria-label': 'Найти игру',
  });
  const chips = el('div', { class: 'nchips' });
  const screen = el('div', { class: 'scroll nscroll ncatalog' },
    el('h1', { class: 'npx nh1' }, 'Игры'),
    el('label', { class: 'nsearch' }, icon('search'), search),
    chips,
    el('div', { class: 'nsortrow' }, count, sortBtn),
    list,
  );
  container.replaceChildren(screen);

  const items = await collectGames(games);
  if (!screen.isConnected) return;
  const flip = async (id) => {
    const on = await flipFav(id);
    const item = items.find((g) => g.id === id);
    if (item) item.fav = on;
    if (state.fav && !on) draw();          // в «Избранном» снятая игра уходит из списка
    return on;
  };
  let places = {};

  const cats = categories.filter((c) => items.some((g) => g.cat === c.id));
  const drawChips = () => chips.replaceChildren(
    ...cats.map((c) => chipButton(c.title, CATEGORY_ICONS[c.id], c.id, state.cats.includes(c.id), () => {
      state.cats = state.cats.includes(c.id) ? state.cats.filter((x) => x !== c.id) : [...state.cats, c.id];
      drawChips();
      draw();
    })),
    chipButton('Избранное', state.fav ? UI.heartOn : UI.heart, 'fav', state.fav, () => {
      state.fav = !state.fav;
      drawChips();
      draw();
    }),
  );

  const recent = Object.fromEntries(items.map((g) => [g.id, g.at]));
  function draw() {
    const shown = sortGames(filterGames(items, state), state.sort, recent);
    count.textContent = `${shown.length} ${plural(shown.length, ['игра', 'игры', 'игр'])}`;
    list.replaceChildren(...(shown.length
      ? shown.map((g, i) => {
        const row = gameRow(g, { onFlip: flip, beta: beta(g.id) });
        row.style.setProperty('--i', String(Math.min(i, 12)));
        return row;
      })
      : [el('div', { class: 'nempty' },
        el('p', { class: 'npx' }, 'Пусто'),
        el('p', {}, state.fav ? 'Нажми сердечко у игры — она появится здесь.' : 'Ничего не нашлось. Попробуй другое название или сними фильтры.'))]));
    fillPlaces(list, places);
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    draw();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search.blur();
  });
  sortBtn.addEventListener('click', () => {
    const modes = sortModes(feature('catalog-untried'));
    state.sort = modes[(modes.indexOf(state.sort) + 1) % modes.length];
    sortBtn.lastChild.textContent = SORTS[state.sort];
    pop(sortBtn, { from: 0.92 });
    draw();
  });

  drawChips();
  draw();

  if (account.current && summary) {
    summary().then((res) => {
      if (!res.ok || !screen.isConnected) return;
      places = placesOf(res.data);
      fillPlaces(list, places);
    }).catch(() => {});
  }
}

function chipButton(title, glyph, cat, on, onclick) {
  const ic = el('span', { class: 'nchip-ic' });
  ic.innerHTML = glyph ?? '';
  return el('button', { class: `nchip${on ? ' on' : ''}`, 'data-cat': cat, 'aria-pressed': String(on), onclick }, ic, title);
}
