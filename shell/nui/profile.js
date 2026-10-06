// Вкладка «Профиль» нового интерфейса (в бете 'new-ui'): аватар и имя, место в общем рейтинге, лучшие места
// в играх, обратная связь, бот, политика конфиденциальности; у тех, кто видит бету, — «Бета», у владельца —
// «Панель». Шестерёнка открывает шторку настроек (звук, вибрация, анимации). Здесь же — шторка серии дней.

import { el } from '../../shared/dom.js';
import { BOT_USERNAME } from '../config.js';
import { icon } from './icons.js';
import { avatar, gameArt, openSheet, switchButton, skeleton } from './ui.js';
import { getVisits } from './store.js';
import { getPrefs, setPref } from './prefs.js';
import { firstName } from './content.js';
import { bestPlaces, streakOf, dayKey, monthCells, MONTHS, WEEKDAYS, digits, plural } from './logic.js';

export function renderProfile(container, { games, account, platform, summary, betaCount = null, admin = false, feedback, onPrefs, dockable = false }) {
  const name = account.current ? account.name : platform.user?.first_name ?? null;
  const shown = firstName(name) ?? 'Гость';
  const rank = el('div', { class: 'nrank-box' }, skeleton('card'));
  const best = el('div', { class: 'nbest' }, skeleton('tile', 3));
  const titleOf = (id) => games.find((g) => g.id === id)?.title ?? id;

  const openBot = () => platform.openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  const menu = el('div', { class: 'nmenu' },
    menuItem('chat', 'Обратная связь', feedback),
    menuItem('plane', `Наш бот @${BOT_USERNAME}`, openBot, true),
    menuItem('shield', 'Политика конфиденциальности', () => platform.openLink(new URL('privacy.html', location.href).href), true),
    betaCount !== null && menuLink('beta', betaCount ? `Бета · ${betaCount}` : 'Бета', '#/beta'),
    admin && menuLink('panel', 'Панель владельца', '#/admin'),
  );

  const screen = el('div', { class: 'scroll nscroll nprofile' },
    el('div', { class: 'nprof-head' },
      avatar(shown, 'nava-lg'),
      el('span', { class: 'nprof-name npx' }, shown),
      el('button', { class: 'niconbtn', 'aria-label': 'Настройки', onclick: () => settingsSheet({ account, onPrefs, dockable }) }, icon('gear')),
    ),
    rank,
    el('h2', { class: 'npx nsec-title' }, 'Лучшие места'),
    best,
    menu,
  );
  container.replaceChildren(screen);

  // ---------- место в рейтинге ----------
  if (!account.enabled) {
    rank.replaceChildren(el('div', { class: 'nrank nrank-guest' },
      el('span', { class: 'nrank-ic' }, icon('user')),
      el('span', { class: 'nrank-text' },
        el('span', { class: 'nrank-k' }, 'Играешь в браузере'),
        el('span', { class: 'nrank-s' }, 'Прогресс хранится только здесь. Открой игры через бота — появится место в рейтинге.')),
    ));
    best.replaceChildren(el('p', { class: 'nhint' }, 'Рейтинг работает внутри Telegram.'));
    return;
  }
  if (!account.current || !summary) {
    rank.replaceChildren(el('div', { class: 'nrank' },
      el('span', { class: 'nrank-ic' }, icon('trophy')),
      el('span', { class: 'nrank-text' },
        el('span', { class: 'nrank-k' }, 'Общий рейтинг'),
        el('span', { class: 'nrank-s' }, account.offline ? 'Нет связи с сервером — место появится, когда подключимся.' : 'Входим…')),
    ));
    best.replaceChildren();
    return;
  }
  summary().then((res) => {
    if (!screen.isConnected) return;
    if (!res.ok) {
      rank.replaceChildren(el('p', { class: 'nhint' }, 'Не удалось загрузить рейтинг.'));
      best.replaceChildren();
      return;
    }
    const o = res.data.overall;
    const me = o?.me;
    const href = res.data.mePid ? `#/top/player/${encodeURIComponent(res.data.mePid)}` : '#/top';
    rank.replaceChildren(el('a', { class: 'nrank nrank-in', href },
      el('span', { class: 'nrank-ic' }, icon('trophy')),
      el('span', { class: 'nrank-text' },
        el('span', { class: 'nrank-k' }, 'Общий рейтинг'),
        el('span', { class: 'nrank-big npx' }, res.data.outside ? 'Вне рейтинга' : me ? `${me.place}-е место` : 'Пока без места'),
        el('span', { class: 'nrank-s' }, res.data.outside
          ? 'Разработчик в рейтинге не участвует'
          : me ? `${digits(me.points)} ${plural(me.points, ['очко', 'очка', 'очков'])} · из ${digits(o.total)} игроков`
            : 'Сыграй в любую игру — и место появится')),
      icon('chevron', 'ni nrank-go'),
    ));
    const top = bestPlaces(res.data, games.map((g) => g.id));
    best.replaceChildren(...(top.length
      ? top.map((b) => el('a', { class: 'nbest-tile', href: `#/top/${encodeURIComponent(b.game)}` },
        gameArt(b.game, 'nart-xs'),
        el('span', { class: 'nbest-name' }, titleOf(b.game)),
        el('b', { class: 'npx' }, `#${b.place}`)))
      : [el('p', { class: 'nhint' }, 'Здесь появятся игры, где у тебя лучшие места.')]));
  }).catch(() => {});
}

/** Вкладка «Рейтинг» вне Telegram: аккаунта нет — рейтинга тоже (зовём в бота). */
export function renderNoRating(container, { platform }) {
  container.replaceChildren(el('div', { class: 'scroll nscroll' },
    el('h1', { class: 'npx nh1' }, 'Рейтинг'),
    el('div', { class: 'nempty nempty-card' },
      icon('trophy', 'ni nempty-ic'),
      el('p', { class: 'npx' }, 'Только в Telegram'),
      el('p', {}, 'Открой игры через бота — там у тебя будет место в общем рейтинге и в каждой игре.'),
      el('button', { class: 'nbtn', onclick: () => platform.openTelegramLink(`https://t.me/${BOT_USERNAME}`) }, `Открыть @${BOT_USERNAME}`),
    ),
  ));
}

function menuItem(iconName, text, onclick, external = false) {
  return el('button', { class: 'nmenu-item', onclick }, icon(iconName), el('span', {}, text), external ? icon('out', 'ni nmenu-out') : icon('chevron', 'ni nmenu-out'));
}

function menuLink(iconName, text, href) {
  return el('a', { class: 'nmenu-item', href }, icon(iconName), el('span', {}, text), icon('chevron', 'ni nmenu-out'));
}

// ---------- шторка настроек ----------

export function settingsSheet({ account, onPrefs, dockable = false }) {
  const prefs = getPrefs();
  const row = (iconName, title, key, note = null) => el('div', { class: 'nset-row' },
    icon(iconName),
    el('span', { class: 'nset-text' }, title, note && el('small', {}, note)),
    switchButton(prefs[key], (on) => onPrefs(setPref(key, on))),
  );
  const group = (title, ...rows) => el('div', { class: 'nset-group' }, el('span', { class: 'nset-h' }, title), el('div', { class: 'nset-box' }, rows));
  openSheet({
    title: 'Настройки',
    tall: true,
    content: [
      group('Звук и отклик',
        row('sound', 'Звуки в играх', 'sound', 'Общий выключатель поверх звука каждой игры'),
        row('vibe', 'Вибрация', 'haptics')),
      group('Приложение',
        row('sparkle', 'Анимации', 'motion', 'Выключи — всё будет появляться сразу, без движения'),
        dockable && row('panel', 'Панель внизу прикреплена', 'dock', 'Вкладки прижаты к нижнему краю, а не плавают над экраном')),
      group('Аккаунт', el('div', { class: 'nset-row' },
        icon('plane'),
        el('span', { class: 'nset-text' }, account.enabled ? 'Вход через Telegram' : 'Без аккаунта'),
        el('span', { class: 'nset-val' }, account.enabled ? (account.name ?? '…') : 'в браузере'))),
      el('p', { class: 'nhint nset-foot' }, 'Настройки — только на этом устройстве.'),
    ],
  });
}

// ---------- шторка серии ----------

export async function streakSheet() {
  const days = await getVisits();
  const today = dayKey();
  const { current, best } = streakOf(days, today);
  const set = new Set(days);
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const first = days[0] ? days[0].split('-').map(Number) : [year, month + 1];
  const title = el('span', { class: 'ncal-title' });
  const grid = el('div', { class: 'ncal-grid' });
  const prevBtn = el('button', { class: 'ncal-nav', 'aria-label': 'Прошлый месяц' }, icon('left'));
  const nextBtn = el('button', { class: 'ncal-nav', 'aria-label': 'Следующий месяц' }, icon('chevron'));
  const draw = () => {
    title.textContent = `${MONTHS[month]} ${year}`;
    grid.replaceChildren(
      ...WEEKDAYS.map((w) => el('span', { class: 'ncal-wd' }, w)),
      ...monthCells(year, month).map((c) => el('span', {
        class: ['ncal-d', c.out && 'out', set.has(c.key) && 'hit', c.key === today && 'today'].filter(Boolean).join(' '),
      }, String(c.n))),
    );
    prevBtn.disabled = year * 12 + month <= first[0] * 12 + (first[1] - 1);
    nextBtn.disabled = year * 12 + month >= now.getFullYear() * 12 + now.getMonth();
  };
  prevBtn.addEventListener('click', () => {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    draw();
  });
  nextBtn.addEventListener('click', () => {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    draw();
  });
  draw();
  openSheet({
    title: 'Серия',
    content: [
      el('div', { class: 'nstreak' },
        icon('flame', 'ni nstreak-fl'),
        el('span', { class: 'nstreak-n' }, el('b', { class: 'npx' }, String(current)), el('span', {}, `${plural(current, ['день', 'дня', 'дней'])} подряд`)),
        el('span', { class: 'nstreak-p' }, 'Заходи каждый день — огонёк не погаснет', el('small', {}, `Лучшая серия: ${best}`)),
      ),
      el('div', { class: 'ncal' }, el('div', { class: 'ncal-head' }, title, el('span', { class: 'ncal-navs' }, prevBtn, nextBtn)), grid),
    ],
  });
}
