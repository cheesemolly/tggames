// Роутинг на hash: работает на любом статическом хостинге и внутри Telegram.
//   #/            — меню
//   #/game/<id>   — игра

export function currentRoute() {
  const [section, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (section === 'game' && id) return { name: 'game', id: decodeURIComponent(id) };
  return { name: 'menu' };
}

export function onRouteChange(cb) {
  window.addEventListener('hashchange', () => cb(currentRoute()));
}

// replace, а не push: «Назад» из игры не должен оставлять игру в истории браузера.
export function goToMenu() {
  location.replace('#/');
}
