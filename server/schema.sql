/* Схема базы Cloudflare D1 для аккаунтов и прогресса. Выполняется один раз при создании базы.
   Комментарии только блочные: консоль D1 склеивает вставленный текст в одну строку,
   и всё после двойного дефиса стало бы комментарием — запрос бы не выполнился. */

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,          /* как игрок написал имя, регистр сохраняется */
  name_key   TEXT NOT NULL UNIQUE,   /* для сравнения: строчными, ё=е */
  salt       TEXT NOT NULL,          /* соль PBKDF2, base64 */
  hash       TEXT NOT NULL,          /* сам пароль нигде не хранится */
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,       /* SHA-256 от токена: утечка базы не даёт войти */
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS states (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,          /* весь прогресс игрока одной строкой JSON */
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  name_key TEXT PRIMARY KEY,         /* неудачные входы: защита от перебора пароля */
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
