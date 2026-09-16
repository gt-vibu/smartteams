import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RateLimitError } from '../errors/domain-error';
import { RedisService } from '../../infrastructure/redis/redis.service';

/**
 * A baseline ceiling on the native application API.
 *
 * Rate limiting was previously applied per threat — credential stuffing on `/v1/auth`, partner
 * abuse on `/v1/federation` — which left every other route uncapped. Unauthenticated attackers
 * were contained; one authenticated session was not, and on a shared instance a single tenant
 * hammering an expensive route degrades every other tenant.
 *
 * Three tiers, because the routes genuinely differ in cost. A ceiling low enough to matter for
 * payroll calculation would break ordinary browsing, and one high enough for browsing would not
 * constrain payroll at all:
 *
 *   EXPENSIVE  a whole-tenant computation or a spend against object storage
 *   MUTATION   anything that writes
 *   READ       everything else
 *
 * Distinct from the authentication limiter in one deliberate respect: this one fails **open**.
 * A Redis outage on the credential path should lock the door, but the same behaviour here would
 * turn a cache outage into a total product outage. The tenant boundary, RLS and RBAC are all
 * still enforced when this is skipped — only the ceiling is lost.
 */

type Tier = 'EXPENSIVE' | 'MUTATION' | 'READ';

/**
 * Routes whose cost is not proportional to the request. Matched on the path tail so the tenant
 * and resource ids in the middle of the path do not have to be parsed.
 */
const EXPENSIVE_SUFFIXES = [
  '/calculate',
  '/recalculate',
  '/preview',
  '/files/uploads',
  '/onboard',
  '/export',
];

@Injectable()
export class RequestRateLimitInterceptor implements NestInterceptor {
  private readonly limits: Record<Tier, number>;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.limits = {
      EXPENSIVE: config.get<number>('RATE_LIMIT_EXPENSIVE_PER_MINUTE', 20),
      MUTATION: config.get<number>('RATE_LIMIT_MUTATION_PER_MINUTE', 120),
      READ: config.get<number>('RATE_LIMIT_READ_PER_MINUTE', 600),
    };
  }

  async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = executionContext
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();

    // `/v1/auth` and `/v1/federation` carry their own, tighter limiters. Applying this one too
    // would double-count and make the configured figure on those paths a fiction.
    const path = request.originalUrl.split('?')[0] ?? '';
    if (
      path.startsWith('/v1/auth') ||
      path.startsWith('/v1/federation') ||
      path.startsWith('/health')
    )
      return next.handle();

    const tier = tierOf(request.method, path);
    // Per identity where there is one, per address otherwise, so one tenant's traffic cannot
    // exhaust another's allowance.
    const subject = request.user?.userId ?? `ip:${request.ip ?? 'unknown'}`;
    const window = Math.floor(Date.now() / 60_000);
    const key = `api:rate:${tier}:${subject}:${window}`;

    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 120);
      if (count > this.limits[tier])
        throw new RateLimitError(
          tier === 'EXPENSIVE'
            ? 'This operation is limited to protect the service. Please wait a minute and try again.'
            : 'Too many requests. Please slow down and try again.',
        );
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      // Fails open, per the note above.
    }
    return next.handle();
  }
}

function tierOf(method: string, path: string): Tier {
  if (EXPENSIVE_SUFFIXES.some((suffix) => path.endsWith(suffix))) return 'EXPENSIVE';
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'READ' : 'MUTATION';
}
