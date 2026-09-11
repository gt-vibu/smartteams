#!/usr/bin/env node
/**
 * Restores a backup into a throwaway database and checks that what came back is usable.
 *
 * A backup nobody has restored is a hypothesis. This is the drill, expressed as something CI can
 * run on every change to the schema or the backup tooling, so the first restore of a payroll
 * database is never performed during an incident.
 *
 * What it asserts, in order of how badly each would hurt:
 *
 *   1. The artifact matches its recorded SHA-256, so a corrupt file fails here rather than later.
 *   2. `pg_restore` completes into an empty database.
 *   3. The migration ledger is present and every migration is marked applied — a restore that
 *      loses `_prisma_migrations` cannot safely be migrated forward.
 *   4. Row-level security is still enabled, with policies, on the tenant tables. RLS is the tenant
 *      boundary; a restore that silently dropped it would be worse than no restore.
 *   5. Core tables are present and their row counts match the source.
 *
 * The scratch database is dropped afterwards, including when a check fails.
 *
 *   pnpm db:verify-restore                        # newest artifact in BACKUP_DIR
 *   pnpm db:verify-restore backups/smarteam-x.dump
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? 'backups');
const PG_RESTORE = process.env.PG_RESTORE_PATH ?? 'pg_restore';
const SCRATCH = process.env.RESTORE_TEST_DATABASE ?? `smarteam_restore_check_${Date.now()}`;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

/** Tables whose presence and row counts are compared against the source. */
const CORE_TABLES = [
  'organizations',
  'employees',
  'payroll_runs',
  'payroll_line_items',
  'leave_requests',
  'attendance_records',
  'timesheets',
  'users',
];

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
};

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) =>
      reject(
        new Error(
          error.code === 'ENOENT'
            ? `${command} not found. Install the PostgreSQL client tools, or set PG_RESTORE_PATH.`
            : error.message,
        ),
      ),
    );
    child.on('close', (code) =>
      // pg_restore reports 1 for non-fatal warnings; only treat a hard failure as fatal.
      code === 0 || code === 1
        ? resolvePromise(stderr)
        : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)),
    );
  });
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function newestArtifact() {
  const entries = (await readdir(BACKUP_DIR)).filter(
    (name) => name.startsWith('smarteam-') && name.endsWith('.dump'),
  );
  if (entries.length === 0) throw new Error(`No backup artifacts in ${BACKUP_DIR}`);
  return join(BACKUP_DIR, entries.sort().at(-1));
}

function scratchUrl(base, database) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  url.search = '';
  return url.toString();
}

const artifact = process.argv[2] ? resolve(process.argv[2]) : await newestArtifact();
console.log(`Verifying ${artifact}`);

// 1. Integrity of the artifact itself.
try {
  const recorded = (await readFile(`${artifact}.sha256`, 'utf8')).trim().split(/\s+/)[0];
  const actual = await sha256(artifact);
  check('the artifact matches its recorded checksum', recorded === actual, actual.slice(0, 16));
} catch {
  check('a checksum file accompanies the artifact', false, 'missing .sha256');
}

const admin = new Client({ connectionString: DATABASE_URL });
await admin.connect();
const source = {};
for (const table of CORE_TABLES) {
  try {
    source[table] = Number(
      (await admin.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,
    );
  } catch {
    source[table] = null;
  }
}

let restored;
try {
  await admin.query(`CREATE DATABASE "${SCRATCH}"`);
  console.log(`  restoring into ${SCRATCH}`);

  // 2. The restore itself.
  const started = Date.now();
  await run(PG_RESTORE, [
    '--dbname',
    scratchUrl(DATABASE_URL, SCRATCH),
    '--no-owner',
    '--no-privileges',
    '--jobs=4',
    artifact,
  ]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  check('pg_restore completes into an empty database', true, `${seconds}s`);

  restored = new Client({ connectionString: scratchUrl(DATABASE_URL, SCRATCH) });
  await restored.connect();

  // 3. The migration ledger survived and is clean.
  // A rolled-back entry is a resolved failure, not outstanding work; a row that is neither
  // finished nor rolled back is a migration that stopped half way, which is what must not survive
  // into a restored database unnoticed.
  const migrations = await restored.query(
    `SELECT count(*) FILTER (WHERE finished_at IS NOT NULL)::int AS applied,
            count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS stuck
       FROM _prisma_migrations`,
  );
  check(
    'the migration ledger restored with no migration left half-applied',
    migrations.rows[0].applied > 0 && migrations.rows[0].stuck === 0,
    `${migrations.rows[0].applied} applied, ${migrations.rows[0].stuck} half-applied`,
  );

  // 4. The tenant boundary survived.
  const rls = await restored.query(
    `SELECT count(*)::int AS tables FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity`,
  );
  const policies = await restored.query(
    `SELECT count(*)::int AS policies FROM pg_policies WHERE schemaname = 'public'`,
  );
  check(
    'row-level security is still enabled on the tenant tables',
    rls.rows[0].tables > 0,
    `${rls.rows[0].tables} tables`,
  );
  check(
    'the RLS policies restored with them',
    policies.rows[0].policies >= rls.rows[0].tables,
    `${policies.rows[0].policies} policies`,
  );

  // 5. The data is there, and there is as much of it as there was.
  for (const table of CORE_TABLES) {
    if (source[table] === null) {
      check(`${table} exists in the source`, false, 'missing from source database');
      continue;
    }
    const n = Number((await restored.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
    check(`${table} restored with every row`, n === source[table], `${n} of ${source[table]}`);
  }
} finally {
  if (restored) await restored.end();
  // Terminate anything still attached, or the drop is refused and the scratch database leaks.
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [SCRATCH],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH}"`);
  await admin.end();
}

console.log(failures === 0 ? '\nRestore verified.' : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;
