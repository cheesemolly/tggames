// Вкладка «Главная» нового интерфейса (в бете 'new-ui', концепт 7 «Пиксель»): шапка (аватар, «Привет, Имя»,
// огонёк серии), истории, баннеры («продолжить», место в рейтинге, новая игра), папки таблетками и ряды игр:
// начатые партии, избранное и по ряду на каждую папку.

import { el } from '../../shared/dom.js';
import { categories } from '../categories.js';
import { UI, icon } from './icons.js';
import { avatar, gameCard, sectionHead, fillPlaces, catOf } from './ui.js';
import { CATEGORY_ICONS, GAME_ICONS } from '../icons.js';
import { collectGames } from './games.js';
import { flipFav, getVisits } from './store.js';
import { pickBanners, placesOf, bestPlaces, streakOf, dayKey, digits, plural, placeOn } from './logic.js';
import { seenStories, storyRow, openStories } from './stories.js';
import { NEW_GAMES, firstName, pickStories, weekStory } from './content.js';

export async function renderHome(container, { games, account, platform, summary, beta, onRetry, onStreak }) {
  const items = await collectGames(games);
  const byId = Object.fromEntries(items.map((g) => [g.id, g]));
  const titleOf = (id) => byId[id]?.title ?? id;
  const visible = (id) => Boolean(byId[id]);
  const flip = async (id) => {
    const on = await flipFav(id);
    if (byId[id]) byId[id].fav = on;
    return on;
  };
  const name = firstName(account.current ? account.name : platform.user?.first_name);
  const streak = streakOf(await getVisits(), dayKey()).current;
  const rated = Boolean(account.enabled);

  // ---------- шапка ----------
  const flame = el('button', { class: 'nflame', 'aria-label': `Серия: ${streak} ${plural(streak, ['день', 'дня', 'дней'])} подряд`, onclick: onStreak },
    icon('flame'), el('b', {}, String(streak)));
  const header = el('div', { class: 'nhead' },
    el('a', { class: 'nhead-ava', href: '#/profile', 'aria-label': 'Профиль' }, avatar(name ?? '?')),
    el('span', { class: 'nhello' }, name ? `Привет, ${name}` : 'Привет!'),
    flame,
  );

  // ---------- нет связи (shell/login.js) ----------
  const offline = rated && !account.current && account.offline && onRetry && offlineRow(onRetry);

  // ---------- истории ----------
  const storiesBox = el('div', { class: 'nstories-box' });
  const drawStories = (week = null) => {
    const list = pickStories({ visible, rated, seen: seenStories(), week });
    storiesBox.replaceChildren(list.length ? storyRow(list, {
      onOpen: (i) => openStories(list, i, {
        titleOf,
        onPlay: (id) => location.replace(`#/game/${encodeURIComponent(id)}`),
        onClose: () => drawStories(week),
      }),
    }) : '');
  };
  drawStories();

  // ---------- баннеры ----------
  const fresh = NEW_GAMES.find((g) => visible(g.id));
  const banners = pickBanners({
    saved: items.filter((g) => g.save).map((g) => ({ id: g.id, at: g.at })),
    rated,
    fresh: fresh?.id ?? null,
  });
  const ratingSub = el('span', { class: 'nbn-sub' }, account.current ? 'Загружаем места…' : 'Сыграй в любую игру — и место появится');
  const ratingTitle = el('span', { class: 'nbn-title npx' }, 'Рейтинг');
  const slides = banners.map((b) => {
    if (b.kind === 'continue') {
      return bannerSlide({ game: b.game, kicker: 'Продолжить', title: titleOf(b.game), sub: byId[b.game].line, button: 'Играть', href: `#/game/${encodeURIComponent(b.game)}` });
    }
    if (b.kind === 'new') {
      return bannerSlide({ game: b.game, kicker: 'Новая игра', title: titleOf(b.game), sub: fresh.text, button: 'Играть', href: `#/game/${encodeURIComponent(b.game)}` });
    }
    return bannerSlide({ trophy: true, kicker: 'Рейтинг', titleNode: ratingTitle, subNode: ratingSub, button: 'Смотреть', href: '#/top' });
  });
  const track = el('div', { class: 'nbanners' }, slides);
  const dots = el('div', { class: 'ndots' }, slides.map((_, i) => el('i', { class: i === 0 ? 'on' : '' })));
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });

  // ---------- папки и ряды ----------
  const cats = categories.filter((c) => items.some((g) => g.cat === c.id));
  const chips = el('div', { class: 'nchips nchips-scroll' }, cats.map((c) => chip(c)));
  const row = (list) => el('div', { class: 'nrowscroll' }, list.map((g) => gameCard(g, { onFlip: flip, beta: beta(g.id) })));
  const saved = items.filter((g) => g.save).sort((a, b) => b.at - a.at);
  const favs = items.filter((g) => g.fav);
  const sections = [
    saved.length > 0 && el('section', { class: 'nsec' }, sectionHead('Продолжить'), row(saved)),
    favs.length > 0 && el('section', { class: 'nsec' }, sectionHead('Избранное', '#/games/fav'), row(favs)),
    ...cats.map((c) => el('section', { class: 'nsec' },
      sectionHead(c.title, `#/games/${encodeURIComponent(c.id)}`),
      row(items.filter((g) => g.cat === c.id)))),
  ];

  const screen = el('div', { class: 'scroll nscroll nhome' },
    header, offline, storiesBox, slides.length > 0 && el('div', { class: 'nbanner-box' }, track, slides.length > 1 && dots), chips, sections);
  container.replaceChildren(screen);

  // места «#N» и баннер рейтинга — когда придёт сводка (она кэшируется на 30 с)
  if (account.current && summary) {
    summary().then((res) => {
      if (!res.ok || !screen.isConnected) {
        if (!res.ok) ratingSub.textContent = 'Нет связи с рейтингом';
        return;
      }
      fillPlaces(screen, placesOf(res.data));
      const me = res.data.overall?.me;
      if (me) {
        ratingTitle.textContent = `Ты на ${placeOn(me.place)}`;
        ratingSub.textContent = `${digits(me.points)} ${plural(me.points, ['очко', 'очка', 'очков'])} · из ${digits(res.data.overall.total)} игроков`;
      } else {
        ratingTitle.textContent = res.data.outside ? 'Рейтинг' : 'Попади в рейтинг';
        ratingSub.textContent = res.data.outside ? 'Ты разработчик — в рейтинге не участвуешь' : 'Сыграй в любую игру — и место появится';
      }
      const week = !res.data.outside && weekStory(me && { ...me, total: res.data.overall.total },
        bestPlaces(res.data, items.map((g) => g.id)), titleOf);
      if (week) drawStories(week);
    }).catch(() => {});
  }
}

function chip(category) {
  return el('a', { class: 'nchip', 'data-cat': category.id, href: `#/games/${encodeURIComponent(category.id)}` },
    catIcon(category.id), category.title);
}

function catIcon(id) {
  const node = el('span', { class: 'nchip-ic' });
  node.innerHTML = CATEGORY_ICONS[id] ?? '';   // значки папок — те же, что в старом меню
  return node;
}

function bannerSlide({ game = null, trophy = false, kicker, title, titleNode = null, sub, subNode = null, button, href }) {
  const bg = el('span', { class: 'nbn-bg' });
  bg.innerHTML = trophy ? UI.trophy : GAME_ICONS[game] ?? '';
  return el('a', { class: 'nbanner', 'data-cat': game ? catOf(game) : 'arcade', href },
    bg,
    el('span', { class: 'nbn-kicker' }, kicker),
    titleNode ?? el('span', { class: 'nbn-title npx' }, title),
    subNode ?? el('span', { class: 'nbn-sub' }, sub),
    el('span', { class: 'nbn-btn' }, icon('play'), button),
  );
}

/** «Нет связи с сервером» + «Повторить» (повтор идёт и сам — shell/login.js). */
export function offlineRow(onRetry) {
  const retry = el('button', { class: 'nbtn nbtn-sm' }, 'Повторить');
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    retry.textContent = 'Подключаемся…';
    try {
      await onRetry();
    } finally {
      retry.disabled = false;
      retry.textContent = 'Повторить';
    }
  });
  return el('div', { class: 'noffline' },
    el('span', {}, 'Нет связи с сервером — прогресс пока только на этом устройстве'), retry);
}
