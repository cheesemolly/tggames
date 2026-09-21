// Языки Wordle. Слова и раскладки взяты из юзербота (F:\swiss, -wordle / -slovko / -wordleru).
// Новый язык — ещё одна запись здесь + words/<id>.json, логика не меняется.

export const LANGUAGES = {
  en: {
    id: 'en',
    label: 'EN',
    title: 'Wordle',
    locale: 'en',       // язык интерфейса и экрана результата оболочки
    rows: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
    normalize: (s) => s,
    words: new URL('./words/en.json', import.meta.url),
  },
  ua: {
    id: 'ua',
    label: 'UA',
    title: 'Словко',
    locale: 'uk',
    // как на slovko.zaxid.net; апостроф — обычная буква (б'ючи)
    rows: ["'йцукенгшщзхї", 'фівапролджє', 'ґячсмитьбю'],
    normalize: (s) => s.replace(/[’ʼ`´]/g, "'"),
    words: new URL('./words/ua.json', import.meta.url),
  },
  ru: {
    id: 'ru',
    label: 'RU',
    title: 'Вордли',
    locale: 'ru',
    rows: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'],
    normalize: (s) => s.replace(/ё/g, 'е'),     // «ё» на клавиатуре и в словаре нет
    words: new URL('./words/ru.json', import.meta.url),
  },
};

export const LANG_ORDER = ['en', 'ua', 'ru'];

const ALPHABETS = Object.fromEntries(
  Object.values(LANGUAGES).map((l) => [l.id, new Set(l.rows.join(''))]),
);

/** Язык по умолчанию — по языку Telegram-пользователя. */
export function defaultLang(languageCode) {
  if (languageCode === 'uk') return 'ua';
  if (languageCode === 'ru' || languageCode === 'be') return 'ru';
  return 'en';
}

/** Нажатая клавиша → буква алфавита языка или null. */
export function toLetter(lang, key) {
  const cfg = LANGUAGES[lang];
  if (!cfg || typeof key !== 'string') return null;
  const ch = cfg.normalize(key.toLowerCase());
  return [...ch].length === 1 && ALPHABETS[lang].has(ch) ? ch : null;
}
