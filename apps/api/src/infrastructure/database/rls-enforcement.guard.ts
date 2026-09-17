import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

/**
 * Refuses to serve traffic if row-level security is not actually in force.
 *
 * Every tenant-scoped table has a policy and `FORCE ROW LEVEL SECURITY`, but PostgreSQL exempts
 * two kinds of role from all of it: a superuser, and any role with `BYPASSRLS`. Connect the
 * runtime pool as one of those and the entire isolation layer silently does nothing — no error,
 * no warning, every query succeeding exactly as before while returning other tenants' rows the
 * moment an application-layer filter is missed.
 *
 * That is not a hypothetical: the local `.env` points `DATABASE_URL` at the `postgres`
 * superuser, so RLS is inert in development. Development is where that is survivable and
 * production is where it is not, so this fails closed there and warns here.
 *
 * The environment schema already requires the system and platform roles to be *distinct* from the
 * runtime role. Distinctness is not the property that matters — privilege is — so this checks the
 * privilege directly rather than trusting the connection string to imply it.
 */
@Injectable()
export class RlsEnforcementGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger(RlsEnforcementGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const environment = this.config.get<string>('NODE_ENV', 'development');
    const isProductionLike = environment === 'production' || environment === 'staging';

    /*
     * Privilege, not identity.
     *
     * The role's own `rolsuper`/`rolbypassrls` is the obvious check and is not sufficient on its
     * own: privilege is inheritable, so a role that is merely a *member* of a superuser or
     * BYPASSRLS role reports false for both and can still read across every tenant. `pg_has_role`
     * with 'USAGE' answers the question that actually matters — can this session obtain the
     * privilege — rather than whether it holds the attribute directly.
     */
    const [role] = await this.prisma.$queryRawUnsafe<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; inherited: boolean }>
    >(`
      SELECT
        r.rolname,
        r.rolsuper,
        r.rolbypassrls,
        EXISTS (
          SELECT 1 FROM pg_roles elevated
          WHERE (elevated.rolsuper OR elevated.rolbypassrls)
            AND elevated.rolname <> r.rolname
            AND pg_has_role(r.rolname, elevated.oid, 'USAGE')
        ) AS inherited
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);

    if (!role) {
      // Cannot read the catalogue: assume the worst rather than assume the best.
      const message = 'Could not determine whether the database role enforces row-level security';
      if (isProductionLike) throw new Error(message);
      this.logger.warn(message);
      return;
    }

    const bypasses = role.rolsuper || role.rolbypassrls || role.inherited;
    if (!bypasses) return;

    const message =
      `The runtime database role "${role.rolname}" bypasses row-level security ` +
      `(superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}, inherited=${role.inherited}). ` +
      `Tenant isolation policies ` +
      `are not being enforced. Provision an unprivileged role for DATABASE_URL.`;

    if (isProductionLike) throw new Error(message);
    this.logger.warn(message);
  }
}
