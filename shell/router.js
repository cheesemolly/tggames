// Роутинг на hash: работает на любом статическом хостинге и внутри Telegram.
//   #/              — главная: сетка папок
//   #/folder/<id>   — папка: сетка игр внутри неё
//   #/game/<id>     — игра
//   #/admin         — панель владельца (сервер пускает только ADMIN_IDS)
//   #/beta          — вкладка «Бета»: что обкатывается у владельца до релиза (shell/beta.js)
//   #/top           — рейтинг: сводка (с общим рейтингом — вкладка «Общий», #/top/games — «По играм»);
//                     #/top/<игра> — таблица игры; #/top/player/<pid> — профиль игрока
// Новый интерфейс (в бете 'new-ui', shell/nui/): вкладки «Главная» (#/), «Игры», «Рейтинг» (#/top), «Профиль»:
//   #/games         — все игры: поиск, папки-фильтры, избранное; #/games/<папка> — сразу с фильтром папки
//   #/profile       — профиль: место в общем рейтинге, лучшие места, настройки, обратная связь

/** decodeURIComponent без исключения: ссылка вида #/game/%E0 иначе роняла приложение на старте. */
const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return '';
  }
};

export function currentRoute() {
  const [section, id, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const decodeURIComponent = decode;
  if (section === 'game' && id) return { name: 'game', id: decodeURIComponent(id) };
  if (section === 'folder' && id) return { name: 'folder', id: decodeURIComponent(id) };
  if (section === 'admin') return { name: 'admin' };
  if (section === 'beta') return { name: 'beta' };
  if (section === 'games') return { name: 'games', id: id ? decodeURIComponent(id) : null };
  if (section === 'profile') return { name: 'profile' };
  if (section === 'top') {
    if (id === 'player' && sub) return { name: 'top', pid: decodeURIComponent(sub) };
    return { name: 'top', game: id ? decodeURIComponent(id) : null };
  }
  return { name: 'menu' };
}

export function onRouteChange(cb) {
  window.addEventListener('hashchange', () => cb(currentRoute()));
}

// replace, а не push: «Назад» из игры не должен оставлять игру в истории браузера.
export function goToMenu() {
  location.replace('#/');
}

export function goToFolder(id) {
  location.replace(`#/folder/${encodeURIComponent(id)}`);
}
