// Рейтинг (в бете: shell/beta.js, id 'leaderboard'). Три экрана:
//   #/top               — сводка: по каждой игре лидер и твоё место;
//   #/top/<игра>        — таблица игры: пьедестал из трёх и список до 50-го места (твоё — всегда видно);
//   #/top/player/<pid>  — профиль игрока: его места во всех играх.
// Игрок виден только по имени из Telegram — ни ника, ни id (требование владельца, 2026-09-26): их нет
// даже в ответе сервера, профиль открывается по случайному pid. Мера успеха у каждой игры своя (уровень,
// рекорд, победы…) — её и текст («уровень 14», «37 очков») считает сервер (BOARDS в server/lib.js).
//
// source — откуда брать данные: { summary(), game(id), player(pid) } → { ok, data, error }.
// В приложении это запросы аккаунта, на проверочной странице — подставные данные.

import { el } from '../shared/dom.js';
import { GAME_ICONS } from './icons.js';
import { categoryOfGame } from './categories.js';
import { message } from '../platform/errors.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function tile(game) {
  const node = el('span', { class: 'tile', style: catStyle(game) });
  node.innerHTML = GAME_ICONS[game] ?? '';
  return node;
}

function catStyle(game) {
  const category = categoryOfGame(game);
  return category ? `--cat: var(${category.color})` : '';
}

/** «1-е место из 12» */
const placeText = (place, total) => `${place}-е место${total ? ` из ${total}` : ''}`;

/** Кружок с первой буквой имени; цвет — от имени, из цветов папок (они заданы для обеих тем). */
const AVATAR_COLORS = ['--cat-words', '--cat-puzzles', '--cat-arcade', '--cat-board', '--cat-quiz', '--cat-music'];
function avatar(name, size = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?';
  return el('span', { class: `top-avatar ${size}`.trim(), style: `--cat: var(${AVATAR_COLORS[h % AVATAR_COLORS.length]})` }, letter);
}

function head({ back, backLabel, title, hint, style = '' }) {
  return el('div', { class: 'folder-head', style },
    el('button', { class: 'back-chip', onclick: back, 'aria-label': backLabel }, `‹ ${backLabel}`),
    el('div', { class: 'folder-head-text' },
      el('h1', {}, title),
      el('div', { class: 'title-rule' }),
      hint && el('p', { class: 'hint' }, hint),
    ),
  );
}

export async function renderTop(container, { route, games, source, onBack }) {
  const titleOf = (id) => games.find((g) => g.id === id)?.title ?? id;
  const screen = el('div', { class: 'scroll top-screen' });
  container.replaceChildren(screen);
  // replaceChildren, в отличие от el(), не пропускает false/null — отсеиваем сами
  const show = (...nodes) => screen.replaceChildren(...nodes.flat().filter((n) => n != null && n !== false));

  const loading = (header) => show(header, el('p', { class: 'hint top-loading' }, 'Загрузка…'));
  const failed = (header, res, retry) => show(header, el('div', { class: 'top-empty' },
    el('p', {}, res.error === 'network' ? 'Нет связи с сервером.'
      // сервер ещё старый (новый worker.bundled.js не вставлен в Cloudflare) — рейтинга он не знает
      : res.error === 'not_found' && !route.game && !route.pid ? 'Рейтинг ещё не включён на сервере.'
        : message(res.error)),
    el('button', { class: 'account-btn', onclick: retry }, 'Повторить'),
  ));

  // ---------- профиль ----------
  if (route.pid) {
    const header = head({ back: onBack, backLabel: 'Назад', title: 'Профиль' });
    const load = async () => {
      loading(header);
      const res = await source.player(route.pid);
      if (!res.ok) return failed(header, res, load);
      const p = res.data;
      const medals = p.games.filter((g) => g.place <= 3).length;
      show(
        el('div', { class: 'folder-head' },
          el('button', { class: 'back-chip', onclick: onBack, 'aria-label': 'Назад' }, '‹ Назад'),
        ),
        el('div', { class: 'top-profile' },
          avatar(p.name, 'top-avatar-lg'),
          el('div', { class: 'top-profile-name' }, p.name, p.me && el('span', { class: 'top-you' }, 'это ты')),
          el('div', { class: 'top-profile-sum' },
            stat(p.games.length, 'в рейтинге'),
            stat(p.games.filter((g) => g.place === 1).length, 'первых мест'),
            stat(medals, 'в тройке'),
          ),
        ),
        p.games.length
          ? el('div', { class: 'top-list' }, p.games.map((g, i) => el('a', {
            class: `top-row${g.place <= 3 ? ' top-row-medal' : ''}`,
            href: `#/top/${encodeURIComponent(g.game)}`,
            style: `--i: ${i}; ${catStyle(g.game)}`,
          },
            tile(g.game),
            el('span', { class: 'top-row-main' },
              el('span', { class: 'top-row-name' }, titleOf(g.game)),
              el('span', { class: 'top-row-sub' }, g.text),
            ),
            el('span', { class: 'top-place' }, MEDALS[g.place - 1] ?? `${g.place}`),
          )))
          : el('p', { class: 'hint top-empty' }, 'Пока ни в одной игре нет результата.'),
        el('p', { class: 'hint top-privacy' }, 'В рейтинге видно только имя — без ника и id.'),
      );
    };
    return load();
  }

  // ---------- таблица игры ----------
  if (route.game) {
    const header = head({ back: onBack, backLabel: 'Рейтинг', title: titleOf(route.game), style: catStyle(route.game) });
    const load = async () => {
      loading(header);
      const res = await source.game(route.game);
      if (!res.ok) return failed(header, res, load);
      const b = res.data;
      const podium = b.rows.slice(0, 3);
      const rest = b.rows.slice(3);
      const meOutside = b.me && !b.rows.some((r) => r.me);
      const row = (r, i) => el('a', {
        class: `top-row${r.me ? ' top-row-me' : ''}`, href: `#/top/player/${encodeURIComponent(r.pid)}`, style: `--i: ${i}`,
      },
        el('span', { class: 'top-num' }, r.place),
        avatar(r.name),
        el('span', { class: 'top-row-main' },
          el('span', { class: 'top-row-name' }, r.name, r.me && el('span', { class: 'top-you' }, 'ты')),
        ),
        el('span', { class: 'top-row-value' }, r.text),
      );
      show(
        head({
          back: onBack, backLabel: 'Рейтинг', title: titleOf(route.game), style: catStyle(route.game),
          hint: `Место — ${b.by}. Игроков: ${b.total}`,
        }),
        b.rows.length === 0
          ? el('p', { class: 'hint top-empty' }, 'Здесь пока никого — сыграй первым!')
          : el('div', { class: 'top-podium', style: catStyle(route.game) },
            // порядок на пьедестале: 2 — 1 — 3
            [podium[1], podium[0], podium[2]].map((r) => (r
              ? el('a', { class: `top-step top-step-${r.place}${r.me ? ' top-row-me' : ''}`, href: `#/top/player/${encodeURIComponent(r.pid)}` },
                el('span', { class: 'top-medal' }, MEDALS[r.place - 1]),
                avatar(r.name, 'top-avatar-md'),
                el('span', { class: 'top-step-name' }, r.name),
                el('span', { class: 'top-step-value' }, r.text),
                el('span', { class: 'top-step-block' }, r.place),
              )
              : el('span', { class: 'top-step top-step-empty' }))),
          ),
        rest.length > 0 && el('div', { class: 'top-list' }, rest.map(row)),
        meOutside && el('div', { class: 'top-gap' }, '···'),
        meOutside && el('div', { class: 'top-list' }, row({ ...b.me, me: true }, 0)),
        !b.me && b.rows.length > 0 && el('p', { class: 'hint top-empty' }, 'Тебя здесь пока нет — сыграй, и место появится.'),
      );
    };
    return load();
  }

  // ---------- сводка ----------
  const header = head({
    back: onBack, backLabel: 'Все игры', title: 'Рейтинг', style: '--cat: var(--cat-words)',
    hint: 'Места игроков в каждой игре. Видно только имя — без ника и id.',
  });
  const load = async () => {
    loading(header);
    const res = await source.summary();
    if (!res.ok) return failed(header, res, load);
    const list = res.data.games.filter((g) => games.some((x) => x.id === g.game));
    show(
      header,
      res.data.mePid && el('a', { class: 'account-row top-me-link', href: `#/top/player/${encodeURIComponent(res.data.mePid)}` },
        el('span', { class: 'account-name' }, 'Мой профиль: места во всех играх'),
        el('span', { class: 'account-btn' }, 'Открыть'),
      ),
      el('div', { class: 'top-list' }, list.map((g, i) => el('a', {
        class: 'top-row top-game', href: `#/top/${encodeURIComponent(g.game)}`, style: `--i: ${i}; ${catStyle(g.game)}`,
      },
        tile(g.game),
        el('span', { class: 'top-row-main' },
          el('span', { class: 'top-row-name' }, titleOf(g.game)),
          el('span', { class: 'top-row-sub' }, g.leader
            ? `🥇 ${g.leader.me ? 'Ты' : g.leader.name} — ${g.leader.text}`
            : 'Пока никого — будь первым'),
          el('span', { class: 'top-row-sub top-row-mine' }, g.me
            ? `Ты: ${placeText(g.me.place, g.total)} · ${g.me.text}`
            : 'Тебя здесь пока нет'),
        ),
        el('span', { class: 'top-chevron' }, '›'),
      ))),
    );
  };
  return load();
}

function stat(value, label) {
  return el('span', { class: 'top-stat' }, el('b', {}, value), el('span', {}, label));
}
