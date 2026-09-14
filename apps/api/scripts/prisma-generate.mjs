#!/usr/bin/env node
/**
 * `prisma generate`, but only when its output would change.
 *
 * `typecheck` and `build` both regenerated the client unconditionally, which rewrote all 97 files
 * under `src/generated/prisma` on every run. The generated client is committed and its content
 * depends only on the schema and the Prisma version, so the rewrite changed nothing — except that
 * the dev server's file watcher saw 97 changed sources and killed the running API mid-request to
 * recompile. Every typecheck, and every commit (the pre-commit hook typechecks), cost whoever was
 * using the local API a burst of dropped requests.
 *
 * The inputs are hashed — every `.prisma` file, `prisma.config.ts`, and the installed Prisma
 * versions — and generation is skipped while the hash matches the last one this machine generated
 * from. The stamp lives in `node_modules/.cache`, so it is per machine and never committed; a fresh
 * checkout (CI) has no stamp and generates.
 *
 *   node scripts/prisma-generate.mjs            generate if the inputs changed
 *   node scripts/prisma-generate.mjs --force    generate regardless (`pnpm db:generate`)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const stampFile = join(apiRoot, 'node_modules', '.cache', 'prisma-client.sha256');
const generatedEntry = join(apiRoot, 'src', 'generated', 'prisma', 'client.ts');
const require = createRequire(join(apiRoot, 'package.json'));

function prismaFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'migrations' ? [] : prismaFiles(path);
    return name.endsWith('.prisma') ? [path] : [];
  });
}

function inputsHash() {
  const hash = createHash('sha256');
  const files = [...prismaFiles(join(apiRoot, 'prisma')), join(apiRoot, 'prisma.config.ts')].sort();
  for (const file of files) {
    // Paths are part of the hash so that moving a model between files regenerates.
    hash.update(relative(apiRoot, file).replaceAll('\\', '/'));
    hash.update(readFileSync(file));
  }
  for (const pkg of ['prisma', '@prisma/client']) {
    hash.update(
      `${pkg}@${JSON.parse(readFileSync(require.resolve(`${pkg}/package.json`), 'utf8')).version}`,
    );
  }
  return hash.digest('hex');
}

/** The hash this machine last generated from, or null when there is none yet. */
function readStamp() {
  // Read directly rather than checking for the file first: a check followed by a read of the
  // same path is a race, and a missing stamp is an ordinary answer, not an error.
  try {
    return readFileSync(stampFile, 'utf8').trim();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const force = process.argv.includes('--force');
const current = inputsHash();
const previous = readStamp();

if (!force && previous === current && existsSync(generatedEntry)) {
  console.log('Prisma client is up to date with the schema; not regenerating.');
  process.exit(0);
}

// Prisma's own CLI entry under this Node, rather than a `prisma` on the path: the path only has
// it when run through a package script, and on Windows it is a `.cmd` shim besides.
const cli = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
execFileSync(process.execPath, [cli, 'generate'], { cwd: apiRoot, stdio: 'inherit' });
mkdirSync(dirname(stampFile), { recursive: true });
writeFileSync(stampFile, `${current}\n`);
