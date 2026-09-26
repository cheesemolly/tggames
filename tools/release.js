// Релиз беты: всё, что владелец обкатывал (shell/beta.js), — игрокам одним деплоем.
//   npm run release           — выпустить;
//   npm run release -- --dry  — только показать, что выйдет, и черновик девлога;
//   npm run release -- --only splash,feedback — выпустить только эти id, остальное остаётся в бете.
// Что делает:
//   1) печатает список и черновик девлога для /broadcast;
//   2) очищает список беты в shell/beta.js (проверки feature('<id>') в коде становятся «включено у всех»);
//   3) снимает beta: true с выходящих игр и убирает выходящие id из SERVER_BETA (команды бота, запросы сервера)
//      в server/lib.js и пересобирает server/worker.bundled.js
//      (тогда бот покажет их в инлайн-режиме — но только после того, как владелец вставит воркер в Cloudflare).
// Коммит, архив и пуш — дальше обычным бэкапом (CLAUDE.md).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const START = /( *\/\/ >>> список беты[^\n]*\n)[\s\S]*?( *\/\/ <<< конец списка беты)/;

/** Исходник shell/beta.js с пустым списком беты (метки остаются). */
export function clearBetaList(src) {
  if (!START.test(src)) throw new Error('в shell/beta.js не найдены метки списка беты');
  return src.replace(START, '$1$2');
}

/** Исходник shell/beta.js без записей с этими id (частичный релиз: остальное остаётся в бете). */
export function removeBetaEntries(src, ids) {
  if (!START.test(src)) throw new Error('в shell/beta.js не найдены метки списка беты');
  return src.replace(START, (whole) => ids.reduce(
    (text, id) => text.replace(new RegExp(`\\n *\\{\\n *id: '${id}',[\\s\\S]*?\\n *\\},(?=\\n)`), ''),
    whole,
  ));
}

/** Исходник server/lib.js без пометки beta: true у выходящих игр. */
export function unflagGames(src, ids) {
  return src.split('\n').map((line) => (ids.some((id) => line.includes(`id: '${id}'`))
    ? line.replace(/,\s*beta:\s*true/, '').replace(/beta:\s*true,\s*/, '')
    : line)).join('\n');
}

/** Исходник server/lib.js без выпущенных id в SERVER_BETA (серверная часть беты: команды бота, запросы). */
export function unflagServerBeta(src, ids) {
  const block = /( *\/\/ >>> серверная бета[^\n]*\n)([\s\S]*?)( *\/\/ <<< конец серверной беты)/;
  const m = src.match(block);
  if (!m) return src;
  const kept = m[2].split('\n').filter((line) => !ids.some((id) => line.trim() === `'${id}',`)).join('\n');
  return src.replace(block, `$1${kept}$3`);
}

/** Черновик девлога для рассылки — в стиле владельца: с маленьких букв, без эмодзи. */
export function devlog(entries, date = new Date()) {
  const d = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  const line = (b) => `- ${(b.title ?? b.id).toLowerCase()}${b.note ? `: ${b.note}` : ''}`;
  const games = entries.filter((b) => b.kind === 'game');
  const features = entries.filter((b) => b.kind !== 'game');
  return [
    `/broadcast обновление ${d}`,
    ...(games.length ? ['', 'новые игры', ...games.map(line)] : []),
    ...(features.length ? ['', 'новое', ...features.map(line)] : []),
  ].join('\n');
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const betaPath = `${root}shell/beta.js`;
  const libPath = `${root}server/lib.js`;
  const { BETA: ALL } = await import(pathToFileURL(betaPath).href);
  const dry = process.argv.includes('--dry');
  // --only id1,id2 — выпустить только это, остальное остаётся в бете
  const onlyAt = process.argv.indexOf('--only');
  const only = onlyAt > 0 ? (process.argv[onlyAt + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (only) {
    const unknown = only.filter((id) => !ALL.some((b) => b.id === id));
    if (unknown.length || !only.length) {
      console.log(`В бете нет: ${unknown.join(', ') || '(пусто)'}. Есть: ${ALL.map((b) => b.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }
  const BETA = only ? ALL.filter((b) => only.includes(b.id)) : ALL;

  if (!BETA.length) {
    console.log('В бете пусто — выпускать нечего.');
    return;
  }
  console.log(`${dry ? 'Выйдет' : 'Выходит'} в паблик (${BETA.length}):`);
  for (const b of BETA) console.log(`  ${b.kind === 'game' ? 'игра   ' : 'функция'}  ${b.id} — ${b.title ?? ''}`);
  console.log(`\nЧерновик девлога:\n\n${devlog(BETA)}\n`);
  if (dry) return;

  const betaSrc = readFileSync(betaPath, 'utf8');
  writeFileSync(betaPath, only ? removeBetaEntries(betaSrc, only) : clearBetaList(betaSrc));
  const gameIds = BETA.filter((b) => b.kind === 'game').map((b) => b.id);
  const lib = readFileSync(libPath, 'utf8');
  const next = unflagServerBeta(unflagGames(lib, gameIds), BETA.map((b) => b.id));
  if (next !== lib) {
    writeFileSync(libPath, next);
    execFileSync(process.execPath, [`${root}server/tools/bundle.js`], { stdio: 'inherit' });
    console.log('Сервер изменился (игры в инлайн-режиме, команды бота из беты): вставь server/worker.bundled.js в Cloudflare.');
  }
  console.log(only
    ? `Из беты выпущено: ${only.join(', ')}; в бете осталось ${ALL.length - BETA.length}. Дальше — npm test и бэкап.`
    : 'Список беты очищен. Дальше — npm test и бэкап (коммит, архив, пуш).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
