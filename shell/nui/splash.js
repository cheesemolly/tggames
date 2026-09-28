// Заставка нового интерфейса (в бете 'new-ui', концепт 7 «Пиксель»): жёлтый квадрат с пиксельной «A»,
// под ним по буквам впрыгивает радужное ANYGAME, три квадратика мигают по очереди. Только DOM и CSS
// (styles/nui.css, .nsplash) — лёгкая, рисуется сразу. Старая заставка «Пульс 3D» (shell/splash.js) остаётся
// игрокам, пока новый интерфейс в бете; её копия — в бэкапах (splash_pulse3d_*).

const LETTERS = [...'ANYGAME'];

/** Показать заставку; возвращает, как её убрать: remove(wait) — плавно, не раньше wait мс. */
export function startPixelSplash() {
  document.documentElement.classList.add('nui-splash');
  const layer = document.createElement('div');
  layer.className = 'nsplash';
  layer.setAttribute('aria-label', 'Загрузка');
  const mark = document.createElement('div');
  mark.className = 'nsplash-mark';
  mark.innerHTML = '<span>A</span>';
  const word = document.createElement('div');
  word.className = 'nsplash-word';
  LETTERS.forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.setProperty('--i', String(i));
    word.append(s);
  });
  const ldr = document.createElement('div');
  ldr.className = 'nsplash-ldr';
  ldr.innerHTML = '<i></i><i></i><i></i>';
  layer.append(mark, word, ldr);
  document.body.appendChild(layer);

  // пиксельный шрифт свой (styles/fonts) — пока грузится, буквы не показываем, чтобы не мелькнул обычный
  const ready = () => layer.classList.add('nsplash-ready');
  const timer = setTimeout(ready, 450);
  document.fonts?.load('20px "Press Start 2P"', 'ANYGAME').then(() => {
    clearTimeout(timer);
    ready();
  }).catch(() => {});

  return (wait) => {
    setTimeout(() => {
      layer.classList.add('nsplash-out');
      const remove = () => {
        layer.remove();
        document.documentElement.classList.remove('nui-splash');
      };
      layer.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 600);   // страховка: в свёрнутой вкладке переход может не закончиться
    }, wait);
  };
}
