/**
 * A Prisma connection string made acceptable to the PostgreSQL client tools.
 *
 * Prisma URLs carry parameters libpq does not know — the documented shape ends in
 * `?schema=public` — and `pg_dump` refuses the whole URL over one of them ("invalid URI query
 * parameter"). The backup script passed the URL through unchanged, so with the environment
 * configured as `.env.example` shows, every backup failed. CI's URL happens to have no query, which
 * is why the drill there stayed green.
 *
 * Only Prisma's own parameters are removed. Everything libpq understands — `sslmode` above all,
 * which a managed production database requires — is kept; dropping the whole query, as the restore
 * script used to, would quietly downgrade a verified TLS connection to whatever the server offers.
 */
const PRISMA_ONLY = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'connect_timeout_ms',
  'pgbouncer',
  'statement_cache_size',
];

export function libpqUrl(url, database) {
  const parsed = new URL(url);
  for (const key of PRISMA_ONLY) parsed.searchParams.delete(key);
  if (database) parsed.pathname = `/${database}`;
  return parsed.toString();
}
