import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/** Mirrors how `PrismaService` builds its client, so the test exercises the same driver path. */
function clientFor(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { client: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}

/**
 * Row-level security, against a real database.
 *
 * Every other suite in this project mocks Prisma, which means the 62 RLS policies and the
 * `assert_same_organization` triggers — the layer that is supposed to hold when application
 * scoping fails — were verified by nothing. A migration could drop a policy and the whole suite
 * would stay green.
 *
 * These run against Postgres. They are excluded from `pnpm test` (which must stay fast and
 * offline) and run by `pnpm test:integration`, which CI executes on the job that already has a
 * database.
 *
 * The tests connect as a **purpose-made restricted role**, not as the migration role. That
 * distinction is the whole point: a superuser, or any role with BYPASSRLS, ignores every policy
 * silently, so a suite that ran as one would pass while proving nothing.
 */

// Creates and drops a probe role, so it needs the elevated connection where one is configured —
// the same preference the seeds use — and falls back to `DATABASE_URL` (CI's superuser).
const ADMIN_URL = process.env.DATABASE_SYSTEM_URL || process.env.DATABASE_URL || '';
const PROBE_ROLE = 'smarteam_rls_probe';
const PROBE_PASSWORD = 'rls-probe-local-only';

/** The same connection string, re-pointed at the restricted role. */
function probeUrl(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.username = PROBE_ROLE;
  url.password = PROBE_PASSWORD;
  return url.toString();
}

const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

describeIfDatabase('row-level security', () => {
  const adminConnection = clientFor(ADMIN_URL);
  const admin = adminConnection.client;
  let probeConnection: ReturnType<typeof clientFor>;
  let probe: PrismaClient;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    // A role that cannot bypass RLS, whatever the migration role happens to be.
    await admin.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
          CREATE ROLE ${PROBE_ROLE} LOGIN PASSWORD '${PROBE_PASSWORD}';
        END IF;
      END $$;
    `);
    await admin.$executeRawUnsafe(`ALTER ROLE ${PROBE_ROLE} NOSUPERUSER NOBYPASSRLS`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`);
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`,
    );

    for (const [id, slug] of [
      [tenantA, `rls-a-${suffix}`],
      [tenantB, `rls-b-${suffix}`],
    ]) {
      await admin.$executeRawUnsafe(
        `INSERT INTO organizations (id, name, slug, source, timezone, currency_code, status, created_at, updated_at)
         VALUES ($1::uuid, $2::text, $3::text, 'NATIVE', 'Asia/Kolkata', 'INR', 'ACTIVE', now(), now())`,
        id,
        slug,
        slug,
      );
    }

    probeConnection = clientFor(probeUrl(ADMIN_URL));
    probe = probeConnection.client;
  }, 60_000);

  afterAll(async () => {
    await probe.$disconnect();
    await probeConnection.pool.end();
    for (const id of [tenantA, tenantB])
      await admin.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, id);
    await admin.$disconnect();
    await adminConnection.pool.end();
  }, 60_000);

  /** Everything below runs inside a transaction with the tenant variable set, as the app does. */
  async function asTenant<T>(
    organizationId: string,
    work: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return probe.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.organization_id', $1, true)`,
        organizationId,
      );
      await tx.$executeRawUnsafe(`SELECT set_config('app.platform_bypass', 'false', true)`);
      return work(tx as unknown as PrismaClient);
    });
  }

  it('the probe role genuinely cannot bypass RLS', async () => {
    // If this fails, nothing else in this file proves anything.
    const rows = await probe.$queryRawUnsafe<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('shows a tenant only its own organization row', async () => {
    const rows = await asTenant(tenantA, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM organizations`),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(tenantA);
    expect(ids).not.toContain(tenantB);
  });

  it('hides another tenant even when its id is named explicitly', async () => {
    // The exact shape of an IDOR: the attacker already knows the id.
    const rows = await asTenant(tenantA, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM organizations WHERE id = $1::uuid`,
        tenantB,
      ),
    );
    expect(rows).toHaveLength(0);
  });

  it('refuses a write that would plant a row in another tenant', async () => {
    // `WITH CHECK` is the half of a policy that stops a scoped session writing across the border.
    await expect(
      asTenant(tenantA, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO branches (id, organization_id, name, code, source, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, 'Smuggled', 'SMG', 'NATIVE', 'ACTIVE', now(), now())`,
          tenantB,
        ),
      ),
    ).rejects.toThrow();
  });

  it('sees nothing at all when no tenant variable is set', async () => {
    // A connection that forgets to scope itself must read nothing, not everything.
    const rows = await probe.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM organizations`,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it('keeps every tenant-scoped table enrolled in RLS', async () => {
    // Guards against a future migration adding a table and forgetting the policy.
    const rows = await admin.$queryRawUnsafe<Array<{ tablename: string }>>(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname AND col.table_schema = 'public'
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND col.column_name = 'organization_id'
        AND c.relrowsecurity = false
    `);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('forces RLS even for the table owner', async () => {
    // Without FORCE, the owning role silently skips policies — which is how an "enabled" policy
    // ends up doing nothing in production.
    const rows = await admin.$queryRawUnsafe<Array<{ tablename: string }>>(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = false
    `);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
