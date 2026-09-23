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
