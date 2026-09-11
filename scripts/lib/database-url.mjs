import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The database URL a script should connect to.
 *
 * Resolution order, with no literal anywhere in the repository:
 *
 *   1. `DATABASE_URL` in the environment.
 *   2. `DATABASE_URL` in the repository's `.env` — the same file the API and a developer already
 *      use, and the one CI writes before running these suites. Read here because a plain
 *      `node scripts/…` process does not load it the way Nest's config module does.
 *   3. Nothing: exit with the variable's name.
 *
 * These scripts used to carry a working connection string as a fallback. A credential in version
 * control is a credential regardless of which database it points at, and a fallback is the worse
 * half of the problem: it silently connects somewhere instead of saying what is missing.
 */
export function resolveDatabaseUrl() {
  const fromEnvironment = process.env.DATABASE_URL;
  if (fromEnvironment) return fromEnvironment;

  const fromDotEnv = readDotEnvValue('DATABASE_URL');
  if (fromDotEnv) return fromDotEnv;

  console.error(
    'DATABASE_URL is not set and no .env in the repository root defines it.\n' +
      'Set it to a disposable local database before running this script.',
  );
  process.exit(1);
}

/** Reads one key out of the repository `.env`, without pulling in a parser for four lines of work. */
function readDotEnvValue(key) {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let contents;
  try {
    contents = readFileSync(join(repositoryRoot, '.env'), 'utf8');
  } catch {
    return undefined;
  }
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    if (trimmed.slice(0, separator).trim() !== key) continue;
    // Quotes are stripped so a quoted value in `.env` behaves the same as an unquoted one.
    return trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}
