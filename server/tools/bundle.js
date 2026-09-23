// Собирает worker.js + lib.js в один файл worker.bundled.js — его удобно вставлять
// в редактор Cloudflare (там один файл), не разбираясь с модулями.
//
//   node server/tools/bundle.js
//
// Тест server/tests/bundle.test.js следит, чтобы собранный файл не отстал от исходников.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const dir = new URL('../', import.meta.url);

export function buildBundle() {
  const lib = readFileSync(new URL('lib.js', dir), 'utf8');
  const worker = readFileSync(new URL('worker.js', dir), 'utf8');

  // lib.js встраивается целиком: у него нет импортов, достаточно убрать слово export.
  const inlined = lib.replace(/^export /gm, '');
  // из worker.js убираем сам импорт lib.js (он уже выше в файле)
  const body = worker.replace(/import \{[\s\S]*?\} from '\.\/lib\.js';\n/, '');

  return [
    '// СОБРАННЫЙ ФАЙЛ — не редактировать руками.',
    '// Источники: server/worker.js и server/lib.js, пересборка: node server/tools/bundle.js',
    '// Это то, что вставляется в редактор Cloudflare Worker.',
    '',
    inlined.trim(),
    '',
    body.trim(),
    '',
  ].join('\n');
}

// Запущен как скрипт (а не импортирован тестом) — пишем файл.
// Путь сравнивается через pathToFileURL: на Windows это `file:///F:/...`, вручную не собрать.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = new URL('worker.bundled.js', dir);
  writeFileSync(out, buildBundle());
  console.log('собрано:', out.pathname);
}
