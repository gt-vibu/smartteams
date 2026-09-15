import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { MetricsService } from '../../common/metrics/metrics.service';

/**
 * The three database roles the application talks to, and how many connections each may hold.
 *
 * The pools used to be constructed from a connection string alone, which left node-postgres'
 * defaults in charge: ten connections each, no idle timeout, no acquisition timeout, and no
 * server-side statement ceiling. Three pools per process meant a deployment's real demand on
 * PostgreSQL was invisible from configuration, and a single slow query could hold a connection
 * indefinitely. All four are now explicit and environment-configurable, with the relationship to
 * `max_connections` documented in docs/operations/database-pooling.md.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly system: PrismaClient;
  readonly platform: PrismaClient;
  private readonly pools: Array<{ name: string; pool: Pool }>;

  constructor(config: ConfigService, metrics: MetricsService) {
    const runtimeUrl = config.getOrThrow<string>('DATABASE_URL');
    const systemUrl = config.get<string>('DATABASE_SYSTEM_URL') || runtimeUrl;
    const platformUrl = config.get<string>('DATABASE_PLATFORM_URL') || runtimeUrl;

    const shared: Omit<PoolConfig, 'connectionString'> = {
      max: config.get<number>('DATABASE_POOL_MAX', 10),
      idleTimeoutMillis: config.get<number>('DATABASE_POOL_IDLE_TIMEOUT_MS', 10_000),
      connectionTimeoutMillis: config.get<number>('DATABASE_POOL_CONNECTION_TIMEOUT_MS', 5_000),
      // Applied by the server to every statement on the connection, so a runaway query releases
      // its connection instead of holding it until the client times out.
      statement_timeout: config.get<number>('DATABASE_STATEMENT_TIMEOUT_MS', 30_000),
    };

    const runtimePool = new Pool({ connectionString: runtimeUrl, ...shared });
    const systemPool = new Pool({ connectionString: systemUrl, ...shared });
    const platformPool = new Pool({ connectionString: platformUrl, ...shared });

    super({ adapter: new PrismaPg(runtimePool) });
    this.system = new PrismaClient({ adapter: new PrismaPg(systemPool) });
    this.platform = new PrismaClient({ adapter: new PrismaPg(platformPool) });
    this.pools = [
      { name: 'runtime', pool: runtimePool },
      { name: 'system', pool: systemPool },
      { name: 'platform', pool: platformPool },
    ];

    for (const { name, pool } of this.pools) {
      // Statement counts and latency, measured where statements are actually issued.
      //
      // Prisma's own `query` event was tried first and does not see them: with a driver adapter
      // the adapter executes against a checked-out `pg` client, and an insert of one row and an
      // insert of ten thousand both surfaced as the same handful of events. Counting here — by
      // wrapping the client each pooled connection hands out — is the count the database sees.
      //
      // Only the leading verb is labelled. The statement text is never recorded: it carries
      // tenant data, and would put unbounded cardinality into the metric.
      pool.on('connect', (client: PoolClient) => {
        const inner = client.query.bind(client) as (...args: unknown[]) => unknown;
        (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
          // `query` accepts either a statement string or a config object carrying `text`.
          const first: unknown = args[0];
          let text: string | undefined;
          if (typeof first === 'string') text = first;
          else if (first !== null && typeof first === 'object' && 'text' in first) {
            const candidate = first.text;
            if (typeof candidate === 'string') text = candidate;
          }
          metrics.dbStatements.inc({ operation: operationOf(text) });
          const started = process.hrtime.bigint();
          const settle = () =>
            metrics.dbStatementDuration.observe(Number(process.hrtime.bigint() - started) / 1e9);
          const result = inner(...args);
          if (result && typeof (result as Promise<unknown>).then === 'function')
            void (result as Promise<unknown>).then(settle, settle);
          else settle();
          return result;
        };
      });

      const publish = () => {
        metrics.dbPool.set({ pool: name, state: 'total' }, pool.totalCount);
        metrics.dbPool.set({ pool: name, state: 'idle' }, pool.idleCount);
        metrics.dbPool.set({ pool: name, state: 'waiting' }, pool.waitingCount);
        // A caller queued for a connection is the observable symptom of pool exhaustion, and the
        // signal that `DATABASE_POOL_MAX` is too low for the offered load.
        if (pool.waitingCount > 0) metrics.dbPoolExhaustion.inc({ pool: name });
      };
      pool.on('connect', publish);
      pool.on('acquire', publish);
      pool.on('release', publish);
      // Without a listener an idle-client error is an unhandled 'error' event, which terminates
      // the process. Dropping the connection is the correct response; the pool replaces it.
      pool.on('error', () => metrics.dbPoolExhaustion.inc({ pool: name }));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.system.$disconnect();
    await this.platform.$disconnect();
    await Promise.all(this.pools.map(({ pool }) => pool.end()));
  }
}

/** The leading verb of a statement, or `other`. Bounded by construction. */
function operationOf(statement: string | undefined): string {
  if (!statement) return 'other';
  const [verb = ''] = statement.trimStart().split(/\s+/, 1);
  const upper = verb.toUpperCase();
  switch (upper) {
    case 'SELECT':
    case 'INSERT':
    case 'UPDATE':
    case 'DELETE':
    case 'BEGIN':
    case 'COMMIT':
    case 'ROLLBACK':
      return upper.toLowerCase();
    default:
      return 'other';
  }
}
