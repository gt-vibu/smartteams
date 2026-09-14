#!/usr/bin/env node
/**
 * Takes a verifiable logical backup of the application database.
 *
 * docs/chore/TECHSTACK.v1.md requires scheduled dumps plus WAL archiving, and point-in-time
 * recovery, because the data is payroll. This script is the scheduled-dump half: it is the piece
 * that can live in the repository and be run identically by an operator, a cron entry, or CI.
 * The WAL/PITR half is server configuration and is documented, with a template, in
 * docs/operations/backup-and-recovery.md — it cannot be expressed as a script here because it
 * belongs to whichever PostgreSQL the deployment actually runs.
 *
 * The dump is written in PostgreSQL's custom format, which restores in parallel and can restore a
 * single table, and is paired with a SHA-256 file so a transfer or storage fault is detectable
 * before someone depends on the artifact in an incident.
 *
 *   pnpm db:backup
 *   BACKUP_DIR=/var/backups/smarteam BACKUP_RETENTION_DAYS=14 pnpm db:backup
 *
 * Exit codes: 0 success, 1 failure. Anything scheduling this must alert on a non-zero exit and on
 * the absence of a fresh artifact — a backup job that silently stops running looks exactly like
 * one that has nothing to do.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// A dump has to read every tenant's rows, which the least-privilege runtime role cannot: prefer
// the elevated connection where one is configured, as the seeds do.
const DATABASE_URL = process.env.DATABASE_SYSTEM_URL || process.env.DATABASE_URL;
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? 'backups');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const PG_DUMP = process.env.PG_DUMP_PATH ?? 'pg_dump';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

/** Never let a connection string reach a log: it carries the password. */
function safeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return 'configured database';
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) =>
      reject(
        new Error(
          error.code === 'ENOENT'
            ? `${command} not found. Install the PostgreSQL client tools, or set PG_DUMP_PATH.`
            : error.message,
        ),
      ),
    );
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function prune() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  let removed = 0;
  for (const entry of await readdir(BACKUP_DIR)) {
    if (!entry.startsWith('smarteam-')) continue;
    const path = join(BACKUP_DIR, entry);
    if ((await stat(path)).mtimeMs >= cutoff) continue;
    await rm(path);
    removed += 1;
  }
  return removed;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifact = join(BACKUP_DIR, `smarteam-${stamp}.dump`);

await mkdir(BACKUP_DIR, { recursive: true });
console.log(`Backing up ${safeTarget(DATABASE_URL)} to ${artifact}`);
const started = Date.now();

// --format=custom for parallel and selective restore; --no-owner/--no-privileges so the dump can
// be restored by a different role than the one that produced it, which is what a recovery drill
// into a scratch database actually does.
await run(PG_DUMP, [
  '--dbname',
  DATABASE_URL,
  '--format=custom',
  '--compress=9',
  '--no-owner',
  '--no-privileges',
  '--file',
  artifact,
]);

const { size } = await stat(artifact);
if (size === 0) {
  console.error('Backup artifact is empty; refusing to report success.');
  process.exit(1);
}
const digest = await sha256(artifact);
await writeFile(`${artifact}.sha256`, `${digest}  ${artifact.split(/[\\/]/).pop()}\n`, 'utf8');

const pruned = await prune();
console.log(
  `Backup complete: ${(size / 1024 / 1024).toFixed(2)} MiB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
console.log(`sha256 ${digest}`);
if (pruned > 0) console.log(`Pruned ${pruned} artifact(s) older than ${RETENTION_DAYS} days`);
