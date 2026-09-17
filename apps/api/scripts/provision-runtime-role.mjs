#!/usr/bin/env node
/**
 * Gives a development database the least-privilege runtime role the API is designed for.
 *
 * The environment contract (docs/development/ENVIRONMENT_CONTRACT.v1.md) requires `DATABASE_URL`
 * to be a role that cannot bypass row-level security, with elevated roles on separate URLs. Local
 * setups never provisioned one: `DATABASE_URL` pointed at the `postgres` superuser, so every
 * tenant-isolation policy was inert in development and the API started with a warning saying so.
 * A missing tenant filter would return other organizations' rows here without any error, and
 * only show up in production.
 *
 * This script, run once against a development database:
 *   1. creates (or re-secures) `smarteam_app` — LOGIN, not a superuser, no BYPASSRLS — with a
 *      random password that is written to `.env` and never printed;
 *   2. grants it data access on every table, including tables later migrations will create;
 *   3. rewrites `.env`, after copying it to `.env.backup-<time>`: `DATABASE_URL` becomes the new
 *      role, and the privileged URL it replaces is kept as `DATABASE_SYSTEM_URL`,
 *      `DATABASE_PLATFORM_URL` and `DATABASE_MIGRATION_URL` unless those are already set;
 *   4. proves it: connects as the new role and checks both that it cannot bypass RLS and that a
 *      tenant table reads as empty with no tenant selected.
 *
 * Development only. Re-running is safe; it rotates the role's password.
 *
 *   pnpm --filter @smarteam/api db:provision-runtime-role
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLE = 'smarteam_app';
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(apiRoot, '..', '..', '.env');
const require = createRequire(join(apiRoot, 'package.json'));
const { Client } = require('pg');

function readEnv() {
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

/** Sets keys in `.env`, replacing an existing line or appending one; every other line is kept. */
function writeEnv(updates) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (next.length && next[next.length - 1] === '') next.pop();
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  writeFileSync(envPath, next.join('\n') + '\n');
}

const describe = (url) => {
  const parsed = new URL(url);
  return `${decodeURIComponent(parsed.username)}@${parsed.host}${parsed.pathname}`;
};

const env = { ...readEnv(), ...process.env };
const environment = env.NODE_ENV ?? 'development';
if (environment === 'production' || environment === 'staging') {
  console.error(
    `Refusing to run with NODE_ENV=${environment}: roles there are provisioned by deployment.`,
  );
  process.exit(1);
}

const adminUrl = env.DATABASE_MIGRATION_URL || env.DATABASE_SYSTEM_URL || env.DATABASE_URL;
if (!adminUrl) {
  console.error('No database URL in the environment or .env.');
  process.exit(1);
}

const admin = new Client({ connectionString: adminUrl });
await admin.connect();
const [{ rolsuper, owner, database }] = (
  await admin.query(
    `SELECT r.rolsuper, current_user AS owner, current_database() AS database
       FROM pg_roles r WHERE r.rolname = current_user`,
  )
).rows;
if (!rolsuper) {
  console.error(
    `${describe(adminUrl)} is not a superuser; it cannot create roles or grant on every table.`,
  );
  process.exit(1);
}

const password = randomBytes(24).toString('base64url');
const exists =
  (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE])).rowCount > 0;
const secure = `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${admin.escapeLiteral(password)}`;
await admin.query(exists ? `ALTER ROLE ${ROLE} WITH ${secure}` : `CREATE ROLE ${ROLE} ${secure}`);
for (const statement of [
  `GRANT CONNECT ON DATABASE ${admin.escapeIdentifier(database)} TO ${ROLE}`,
  `GRANT USAGE ON SCHEMA public TO ${ROLE}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`,
  `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`,
  // Migrations run as the owner, so grants have to follow the tables they create.
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${admin.escapeIdentifier(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLE}`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${admin.escapeIdentifier(owner)} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ROLE}`,
]) {
  await admin.query(statement);
}
await admin.end();

const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = ROLE;
runtimeUrl.password = password;

// Prove it before touching `.env`, so a failure leaves the working setup as it was.
const runtime = new Client({ connectionString: runtimeUrl.toString() });
await runtime.connect();
const privilege = (
  await runtime.query(
    `SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  )
).rows[0];
const visible = (await runtime.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n;
await runtime.end();
if (privilege.rolsuper || privilege.rolbypassrls || visible !== 0) {
  console.error(
    `The new role is not isolated (superuser=${privilege.rolsuper}, bypassrls=${privilege.rolbypassrls}, ` +
      `organizations visible without a tenant=${visible}). .env was not changed.`,
  );
  process.exit(1);
}

const backup = `${envPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
copyFileSync(envPath, backup);
const current = readEnv();
writeEnv({
  DATABASE_URL: runtimeUrl.toString(),
  ...(current.DATABASE_SYSTEM_URL ? {} : { DATABASE_SYSTEM_URL: adminUrl }),
  ...(current.DATABASE_PLATFORM_URL ? {} : { DATABASE_PLATFORM_URL: adminUrl }),
  ...(current.DATABASE_MIGRATION_URL ? {} : { DATABASE_MIGRATION_URL: adminUrl }),
});

console.log(
  `Runtime role ${ROLE} is in force: no superuser, no BYPASSRLS, and no tenant rows visible without a tenant.`,
);
console.log(`DATABASE_URL          -> ${describe(runtimeUrl.toString())}`);
console.log(`Elevated URLs kept on -> ${describe(adminUrl)} (system, platform, migrations)`);
console.log(`Previous .env saved to ${backup}. Restart the API to pick it up.`);
