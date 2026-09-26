/* Схема базы Cloudflare D1: игроки Telegram и их прогресс.
   Комментарии только блочные: консоль D1 склеивает вставленный текст в одну строку,
   и всё после двойного дефиса стало бы комментарием — запрос бы не выполнился.

   Паролей и сессий нет: вход — по подписи initData от Telegram (решение владельца, 2026-09-23).
   Если в базе остались старые таблицы, сначала:
   DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS attempts; DROP TABLE IF EXISTS states;
   DROP TABLE IF EXISTS users; */

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id        INTEGER NOT NULL UNIQUE,   /* id пользователя Telegram — он же вход */
  name         TEXT NOT NULL,             /* имя из Telegram, обновляется при каждом заходе */
  username     TEXT,                      /* @username, если он есть */
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  banned       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS users_last_seen ON users(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS states (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,               /* весь прогресс игрока одной строкой JSON */
  updated_at INTEGER NOT NULL
);

/* Черновики рассылки и личных сообщений бота (/broadcast, /message). Обработчик заводит эти таблицы
   сам при первом использовании (CREATE TABLE IF NOT EXISTS), вручную выполнять не нужно. */
CREATE TABLE IF NOT EXISTS drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL,
  chat_id     INTEGER NOT NULL,
  group_key   TEXT NOT NULL,              /* g<media_group_id> для альбома, m<message_id> для одного сообщения */
  kind        TEXT,                       /* broadcast | message */
  target      INTEGER,                    /* кому (для message) */
  target_name TEXT,
  text        TEXT,
  entities    TEXT,                       /* оформление текста — JSON entities Telegram (сдвинутые) */
  stamp       TEXT NOT NULL,              /* метка последней части альбома — предпросмотр показывает она */
  state       TEXT NOT NULL DEFAULT 'new',/* new, preview, sending, sent, cancelled */
  created_at  INTEGER NOT NULL,
  UNIQUE (admin_id, group_key)
);

CREATE TABLE IF NOT EXISTS draft_media (
  admin_id   INTEGER NOT NULL,
  group_key  TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  type       TEXT NOT NULL,               /* photo | video */
  file_id    TEXT NOT NULL,
  PRIMARY KEY (admin_id, group_key, message_id)
);

/* Рейтинг (лидерборды). Обработчик заводит эти таблицы сам (CREATE TABLE IF NOT EXISTS), вручную выполнять
   не нужно. В рейтинге игрок виден только по имени из Telegram; pid — случайная строка для ссылки на профиль,
   не связанная ни с id, ни с ником. */
CREATE TABLE IF NOT EXISTS board_players (
  user_id INTEGER PRIMARY KEY,
  pid     TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL                   /* только имя, без фамилии и ника */
);

CREATE TABLE IF NOT EXISTS board_scores (
  user_id    INTEGER NOT NULL,
  game_id    TEXT NOT NULL,
  value      INTEGER NOT NULL,            /* мера игры: уровень, рекорд, победы… (BOARDS в lib.js) */
  updated_at INTEGER NOT NULL,            /* когда достигнуто: при равных очках выше тот, кто раньше */
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS board_scores_game ON board_scores(game_id, value DESC);
