// Рейтинг (в бете: shell/beta.js, id 'leaderboard'). Три экрана:
//   #/top               — сводка: по каждой игре лидер и твоё место;
//                         с общим рейтингом (в бете 'leaderboard-overall') — две вкладки: #/top — «Общий»
//                         (сумма очков за места во всех играх, считает сервер), #/top/games — «По играм»;
//   #/top/<игра>        — таблица игры: пьедестал из трёх и список до 50-го места (твоё — всегда видно);
//   #/top/player/<pid>  — профиль игрока: его места во всех играх. Разработчик (в бете 'leaderboard-no-admin') мест
//                         не занимает, в профиле у него бейдж admin; найти игрока можно по @нику (в бете 'player-search').
//                         Сам ник нигде не показывается — поиск только открывает профиль.
// Игрок виден только по имени из Telegram — ни ника, ни id (требование владельца, 2026-09-26): их нет
// даже в ответе сервера, профиль открывается по случайному pid. Мера успеха у каждой игры своя (уровень,
// рекорд, победы…) — её и текст («уровень 14», «37 очков») считает сервер (BOARDS в server/lib.js).
//
// source — откуда брать данные: { summary(), game(id), player(pid), find(username) } → { ok, data, error }.
// В приложении это запросы аккаунта, на проверочной странице — подставные данные.

import { el } from '../shared/dom.js';
import { GAME_ICONS } from './icons.js';
import { categoryOfGame } from './categories.js';
import { message } from '../platform/errors.js';
import { showLayer, hideLayer, pop, shake } from '../shared/motion.js';

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

function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
const digits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
/** «1 240 очков» */
const pointsText = (n) => `${digits(n)} ${plural(n, ['очко', 'очка', 'очков'])}`;
/** «🥇 3 · в 12 играх» */
const overallSub = (p) => [p.firsts > 0 && `🥇 ${p.firsts}`, `в ${p.games} ${plural(p.games, ['игре', 'играх', 'играх'])}`]
  .filter(Boolean).join(' · ');

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

export async function renderTop(container, { route, games, source, onBack, overall = false, search = false }) {
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
      // с общим рейтингом сервер отдаёт очки за каждую игру — сверху те, что дали больше (видно, где подняться)
      const withPoints = overall && 'overall' in p && !p.outside;
      const list = withPoints ? [...p.games].sort((a, b) => b.points - a.points || a.place - b.place) : p.games;
      show(
        el('div', { class: 'folder-head' },
          el('button', { class: 'back-chip', onclick: onBack, 'aria-label': 'Назад' }, '‹ Назад'),
        ),
        el('div', { class: 'top-profile' },
          avatar(p.name, 'top-avatar-lg'),
          el('div', { class: 'top-profile-name' }, p.name,
            p.admin && el('span', { class: 'top-admin' }, 'admin'),
            p.me && el('span', { class: 'top-you' }, 'это ты')),
          p.outside && el('p', { class: 'hint top-outside' }, 'Разработчик — в рейтинге не участвует.'),
          withPoints && el('a', { class: 'top-overall-card', href: '#/top' },
            el('span', { class: 'top-overall-label' }, 'Общий рейтинг'),
            p.overall
              ? el('span', { class: 'top-overall-value' },
                `${MEDALS[p.overall.place - 1] ?? ''} ${placeText(p.overall.place, p.overall.total)}`.trim(),
                el('span', { class: 'top-overall-points' }, pointsText(p.overall.points)))
              : el('span', { class: 'top-overall-value' }, 'пока без места'),
          ),
          !p.outside && el('div', { class: 'top-profile-sum' },
            stat(p.games.length, 'в рейтинге'),
            stat(p.games.filter((g) => g.place === 1).length, 'первых мест'),
            stat(medals, 'в тройке'),
          ),
        ),
        list.length
          ? el('div', { class: 'top-list' }, list.map((g, i) => el('a', {
            class: `top-row${g.place && g.place <= 3 ? ' top-row-medal' : ''}`,
            href: `#/top/${encodeURIComponent(g.game)}`,
            style: `--i: ${i}; ${catStyle(g.game)}`,
          },
            tile(g.game),
            el('span', { class: 'top-row-main' },
              el('span', { class: 'top-row-name' }, titleOf(g.game)),
              el('span', { class: 'top-row-sub' }, withPoints ? `${g.text} · +${pointsText(g.points)}` : g.text),
            ),
            g.place && el('span', { class: 'top-place' }, MEDALS[g.place - 1] ?? `${g.place}`),
          )))
          : el('p', { class: 'hint top-empty' }, 'Пока ни в одной игре нет результата.'),
        el('p', { class: 'hint top-privacy' }, 'В рейтинге видно только имя — без ника и id.'),
      );
    };
    return load();
  }

  // ---------- таблица игры ----------
  if (route.game && route.game !== 'games') {
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
        b.outside && el('p', { class: 'hint top-empty' }, 'Тебя здесь нет: разработчик в рейтинге не участвует.'),
        !b.me && !b.outside && b.rows.length > 0 && el('p', { class: 'hint top-empty' }, 'Тебя здесь пока нет — сыграй, и место появится.'),
      );
    };
    return load();
  }

  // ---------- сводка ----------
  const tab = overall && route.game === 'games' ? 'games' : 'overall';
  const header = head({
    back: onBack, backLabel: 'Все игры', title: 'Рейтинг', style: '--cat: var(--cat-words)',
    hint: overall && tab === 'overall'
      ? 'Очки за места во всех играх. Видно только имя — без ника и id.'
      : 'Места игроков в каждой игре. Видно только имя — без ника и id.',
  });
  const tabs = overall && el('div', { class: 'top-tabs', role: 'tablist' },
    el('a', { class: `top-tab${tab === 'overall' ? ' on' : ''}`, href: '#/top', role: 'tab', 'aria-selected': String(tab === 'overall') }, 'Общий'),
    el('a', { class: `top-tab${tab === 'games' ? ' on' : ''}`, href: '#/top/games', role: 'tab', 'aria-selected': String(tab === 'games') }, 'По играм'),
  );
  const searchForm = search && findForm(source);
  const load = async () => {
    loading([header, tabs]);
    const res = await source.summary();
    if (!res.ok) return failed([header, tabs], res, load);
    const outsideNote = res.data.outside && el('p', { class: 'hint top-outside' }, 'Ты разработчик — в рейтинге не участвуешь, но профиль открывается.');
    const meLink = res.data.mePid && el('a', { class: 'account-row top-me-link', href: `#/top/player/${encodeURIComponent(res.data.mePid)}` },
      el('span', { class: 'account-name' }, overall ? 'Мой профиль: общее место и места в играх' : 'Мой профиль: места во всех играх'),
      el('span', { class: 'account-btn' }, 'Открыть'),
    );

    if (overall && tab === 'overall') {
      const o = res.data.overall;
      // сервер ещё старый (worker.bundled.js не вставлен в Cloudflare) — общего рейтинга он не знает
      if (!o) {
        return show(header, tabs, el('div', { class: 'top-empty' },
          el('p', {}, 'Общий рейтинг ещё не включён на сервере.'),
          el('a', { class: 'account-btn', href: '#/top/games' }, 'Рейтинг по играм'),
        ));
      }
      const meOutside = o.me && !o.rows.some((r) => r.me);
      const row = (r, i) => el('a', {
        class: `top-row${r.me ? ' top-row-me' : ''}`, href: `#/top/player/${encodeURIComponent(r.pid)}`, style: `--i: ${i}`,
      },
        el('span', { class: 'top-num' }, r.place),
        avatar(r.name),
        el('span', { class: 'top-row-main' },
          el('span', { class: 'top-row-name' }, r.name, r.me && el('span', { class: 'top-you' }, 'ты')),
          el('span', { class: 'top-row-sub' }, overallSub(r)),
        ),
        el('span', { class: 'top-row-value' }, pointsText(r.points)),
      );
      const how = el('div', { class: 'top-how', hidden: true },
        el('div', { class: 'top-how-card' },
          el('p', {}, 'За место в каждой игре — очки, как в гонках. Очки всех игр складываются.'),
          el('div', { class: 'top-how-grid' }, [[1, 100], [2, 93], [3, 86], [5, 75], [10, 52], [20, 25]].map(([pl, pt]) => el('span', {},
            el('b', {}, MEDALS[pl - 1] ?? `${pl}-е`), el('span', {}, `+${pt}`)))),
          el('p', {}, 'Любой результат в игре — не меньше 10 очков: пробуй разные игры. При равенстве выше тот, у кого больше первых мест.'),
        ),
      );
      let howOpen = false;
      const howBtn = el('button', {
        class: 'top-how-btn',
        onclick: () => {
          howOpen = !howOpen;
          howBtn.textContent = howOpen ? 'Скрыть' : 'Как считаются очки';
          if (howOpen) showLayer(how);
          else hideLayer(how, () => !howOpen);
        },
      }, 'Как считаются очки');
      const podium = o.rows.slice(0, 3);
      return show(
        header, tabs, searchForm, outsideNote, meLink, howBtn, how,
        o.rows.length === 0
          ? el('p', { class: 'hint top-empty' }, 'Здесь пока никого — сыграй первым!')
          : el('div', { class: 'top-podium' },
            // порядок на пьедестале: 2 — 1 — 3
            [podium[1], podium[0], podium[2]].map((r) => (r
              ? el('a', { class: `top-step top-step-${r.place}${r.me ? ' top-row-me' : ''}`, href: `#/top/player/${encodeURIComponent(r.pid)}` },
                el('span', { class: 'top-medal' }, MEDALS[r.place - 1]),
                avatar(r.name, 'top-avatar-md'),
                el('span', { class: 'top-step-name' }, r.name),
                el('span', { class: 'top-step-value' }, pointsText(r.points)),
                el('span', { class: 'top-step-block' }, r.place),
              )
              : el('span', { class: 'top-step top-step-empty' }))),
          ),
        o.rows.length > 3 && el('div', { class: 'top-list' }, o.rows.slice(3).map(row)),
        meOutside && el('div', { class: 'top-gap' }, '···'),
        meOutside && el('div', { class: 'top-list' }, row({ ...o.me, me: true }, 0)),
        !o.me && !res.data.outside && o.rows.length > 0 && el('p', { class: 'hint top-empty' }, 'Тебя здесь пока нет — сыграй в любую игру, и место появится.'),
      );
    }

    const list = res.data.games.filter((g) => games.some((x) => x.id === g.game));
    show(
      header,
      tabs,
      searchForm,
      outsideNote,
      meLink,
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
            : res.data.outside ? 'Ты вне рейтинга' : 'Тебя здесь пока нет'),
        ),
        el('span', { class: 'top-chevron' }, '›'),
      ))),
    );
  };
  return load();
}

/** Подпись карточки «Рейтинг» в меню при общем рейтинге: «Ты: 4-е место · 1 240 очков» (или null). */
export function overallLine(summary) {
  const me = summary?.overall?.me;
  return me ? `Ты: ${placeText(me.place, 0)} · ${pointsText(me.points)}` : null;
}

/**
 * Поиск игрока по @нику (в бете 'player-search'): поле вверху экрана — экранная клавиатура его не закрывает;
 * своя кнопка «Найти» + Enter; кнопка не забирает фокус (иначе клавиатура на iOS закрылась бы). Найден — профиль.
 */
function findForm(source) {
  const input = el('input', {
    class: 'top-search-input', type: 'text', placeholder: '@ник игрока', maxlength: '64',
    autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'search',
    'aria-label': 'Ник игрока в Telegram',
  });
  const note = el('p', { class: 'hint top-search-note', hidden: true });
  const button = el('button', { class: 'account-btn', type: 'submit', onmousedown: (e) => e.preventDefault() }, 'Найти');
  let busy = false;
  const say = (text) => {
    note.textContent = text;
    note.hidden = false;
    pop(note, { from: 0.9 });
  };
  const form = el('form', {
    class: 'top-search', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      if (busy) return;
      const raw = input.value.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
      if (!/^[a-z0-9_]{4,32}$/i.test(raw)) {
        shake(form);
        say(raw ? 'Ник — латиница, цифры и «_», от 4 символов' : 'Впиши @ник игрока в Telegram');
        input.focus();
        return;
      }
      busy = true;
      button.disabled = true;
      const res = await source.find(raw.toLowerCase());
      busy = false;
      button.disabled = false;
      if (res.ok && res.data?.pid) {
        input.blur();
        location.hash = `#/top/player/${encodeURIComponent(res.data.pid)}`;
        return;
      }
      shake(form);
      say(res.error === 'no_player' || res.error === 'not_found' ? 'Игрок с таким ником не найден' : message(res.error));
    },
  },
    el('div', { class: 'top-search-row' }, input, button),
    note,
  );
  input.addEventListener('input', () => { note.hidden = true; });
  return form;
}

function stat(value, label) {
  return el('span', { class: 'top-stat' }, el('b', {}, value), el('span', {}, label));
}
