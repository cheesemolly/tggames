# AnyGame — лицензия (перевод на русский)

> Это перевод для удобства. Юридическую силу имеет английский текст в файле [`LICENSE`](LICENSE);
> при любых расхождениях действует английская версия.

Copyright (c) 2026 cheesemolly (https://github.com/cheesemolly). Все права защищены.

Этот репозиторий и всё его содержимое — исходный код, графика, анимации, звуки, тексты, данные уровней
и головоломок, название «AnyGame» и его логотип (вместе — «Программа») — принадлежат правообладателю,
за исключением сторонних компонентов, перечисленных ниже.

Программа опубликована только для просмотра. Это **не** открытый исходный код, и никакие права вам
не предоставляются, кроме прямо указанных здесь.

## Можно

- просматривать исходный код на GitHub;
- пользоваться возможностями, которые Условия использования GitHub предоставляют для публичных
  репозиториев (просмотр и форк внутри GitHub), — только для просмотра;
- играть в игры через официальный Telegram-бот @anygametg_bot и официальный сайт
  https://cheesemolly.github.io/tggames/.

## Нельзя без предварительного письменного разрешения правообладателя

- копировать, воспроизводить, публиковать или распространять Программу или любую её часть;
- изменять, переводить Программу или создавать на её основе производные работы;
- размещать, разворачивать или запускать Программу или любую её часть — в том числе как Telegram-бот
  или мини-приложение, сайт, мобильное или настольное приложение, — кроме официальных бота и сайта;
- использовать её графику, анимации, звуки, тексты, данные уровней или головоломок, название или
  логотип в любом другом продукте;
- продавать, сдавать в аренду, сублицензировать или иным образом коммерчески использовать Программу.

Любое использование, прямо не разрешённое выше, запрещено и является нарушением авторского права.

## Сторонние компоненты

Они не принадлежат правообладателю; на них действуют их собственные лицензии и уведомления:

- `games/flags/flags/*.svg` — flag-icons (lipis, https://github.com/lipis/flag-icons),
  лицензия MIT, см. `games/flags/flags/LICENSE`;
- `games/flags/countries.json` — на основе mledoze/countries (https://github.com/mledoze/countries),
  Open Database License (ODbL) 1.0, см. `games/flags/ATTRIBUTION.txt`;
- `games/boggle/words/ru.json` — список существительных из Harrix/Russian-Nouns
  (https://github.com/Harrix/Russian-Nouns), лицензия MIT; частоты слов — из «Нового частотного
  словаря русской лексики» О. Н. Ляшевской и С. А. Шарова (2009);
- `games/erudit/words/ru.json` — список существительных из Harrix/Russian-Nouns
  (https://github.com/Harrix/Russian-Nouns), лицензия MIT; список частых слов — по «Новому частотному
  словарю русской лексики» О. Н. Ляшевской и С. А. Шарова (2009);
- `games/cities/data/cities.json` — координаты, страны и население городов из GeoNames
  (https://www.geonames.org), лицензия Creative Commons Attribution 4.0; русские названия городов и стран
  и число разделов Википедии о городе — из Wikidata (https://www.wikidata.org), CC0 1.0. Данные отобраны,
  объединены и переупорядочены;
- `games/cities/land.js` — суша для глобуса получена из Natural Earth
  (https://www.naturalearthdata.com), общественное достояние;
- `games/word-circle/levels.json` — слова уровней отобраны из списка существительных Harrix/Russian-Nouns
  (https://github.com/Harrix/Russian-Nouns), лицензия MIT; какие слова частые — по «Частотному словарю
  современного русского языка» О. Н. Ляшевской и С. А. Шарова (2009, http://dict.ruslang.ru/freq.php);
- `games/wordle/words/en.json`, `ua.json`, `ru.json` — списки слов, собранные из общедоступных источников;
  принадлежат их владельцам;
- `games/boggle/words/ru-modern.json`, `games/erudit/words/ru-modern.json`, `games/wordle/words/ru-modern.json`,
  `games/words/modern.json` — добавки современных слов, составленные для этого проекта
  (`tools/modern-words.mjs`); каких частых существительных не хватает в исходных списках, сверялось по
  «Частотному словарю современного русского языка» О. Н. Ляшевской и С. А. Шарова (2009,
  http://dict.ruslang.ru/freq.php);
- `games/chess/engine.js` — значения таблиц полей взяты из «Simplified Evaluation Function»
  Томаша Михневского, опубликованной в Chess Programming Wiki
  (https://www.chessprogramming.org/Simplified_Evaluation_Function);
- `games/go/engine.js` — шаблоны 3×3 для розыгрышей повторяют шаблоны MoGo (С. Желли, Я. Ван, Р. Мюнос,
  О. Тейто, «Modification of UCT with Patterns in Monte-Carlo Go», 2006) в виде, как они записаны в движке
  michi Петра Баудиша (https://github.com/pasky/michi, лицензия MIT); параметры поиска (эквивалент RAVE,
  априорные значения) — по мотивам michi. Сам код — свой;
- `styles/fonts/press-start-2p-*.woff2` — шрифт «Press Start 2P» (CodeMan38; Copyright 2012 The Press Start 2P
  Project Authors), SIL Open Font License 1.1, см. `styles/fonts/OFL-press-start-2p.txt`;
- `styles/fonts/golos-text-*.woff2` — шрифт «Golos Text» (Copyright 2019 The Golos Text Project Authors,
  https://github.com/googlefonts/golos-text), SIL Open Font License 1.1, см. `styles/fonts/OFL-golos-text.txt`;
- `games/nonogram/levels.js` — картинки уровней «Вкусное» сделаны из набора «16x16 Food»
  (ARoachIFoundOnMyPillow, https://opengameart.org/content/16x16-food), CC0 1.0; «Зверята» — из «Tiny Creatures»
  (Clint Bellanger, https://clintbellanger.net), CC0 1.0; «Эмодзи» и «Большие картинки» — из Microsoft Fluent Emoji
  (https://github.com/microsoft/fluentui-emoji), Copyright (c) Microsoft Corporation, лицензия MIT, см.
  `games/nonogram/LICENSE-fluent-emoji.txt`. Картинки уменьшены до сеток головоломки; рисунки «Разминки» — свои;
- скрипт Telegram Web App загружается с telegram.org во время работы и не входит в репозиторий.

Правила и механики известных игровых жанров (2048, судоку, маджонг-пасьянс, шашки, шахматы, игры со словами
в духе Wordle, змейка и другие) не заявляются. Эта лицензия защищает именно данную реализацию:
её код, графику, звуки, тексты и данные.

## Отказ от гарантий

ПРОГРАММА ПРЕДОСТАВЛЯЕТСЯ «КАК ЕСТЬ», БЕЗ КАКИХ-ЛИБО ГАРАНТИЙ, ЯВНЫХ ИЛИ ПОДРАЗУМЕВАЕМЫХ.
ПРАВООБЛАДАТЕЛЬ НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ НЕ НЕСЁТ ОТВЕТСТВЕННОСТИ ПО ЛЮБЫМ ТРЕБОВАНИЯМ,
ЗА УЩЕРБ ИЛИ ИНУЮ ОТВЕТСТВЕННОСТЬ, ВОЗНИКАЮЩИЕ ИЗ ПРОГРАММЫ ИЛИ ЕЁ ИСПОЛЬЗОВАНИЯ.

## Разрешения

Чтобы запросить разрешение на использование, не предусмотренное выше, свяжитесь с правообладателем
через https://github.com/cheesemolly или через Telegram-бот @anygametg_bot (команда /report).
