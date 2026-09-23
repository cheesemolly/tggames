// Локальный сервер аккаунтов для разработки: тот же worker.js, но поверх файла SQLite,
// а не Cloudflare D1. Нужен, чтобы проверять вход и синхронизацию, ничего не выкладывая.
//
//   node server/dev-server.js [порт]        # по умолчанию 8787, база — server/dev.sqlite
//
// В shell/config.js на время проверки: export const API_URL = 'http://127.0.0.1:8787';
// В рабочем виде там адрес Cloudflare Worker, а этот сервер не используется.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import worker from './worker.js';

const port = Number(process.argv[2]) || 8787;
const file = process.argv[3] ?? new URL('./dev.sqlite', import.meta.url).pathname.replace(/^\//, '');

const db = new DatabaseSync(file);
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

/** Интерфейс D1 (prepare → bind → first/run/all) поверх node:sqlite. */
const wrap = (stmt, args) => ({
  first: () => stmt.get(...args) ?? null,
  run: () => stmt.run(...args),
  all: () => ({ results: stmt.all(...args) }),
});

const env = {
  DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return { bind: (...args) => wrap(stmt, args), ...wrap(stmt, []) };
    },
  },
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });

  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => {
  console.log(`сервер аккаунтов: http://127.0.0.1:${port}  (база ${file})`);
});
