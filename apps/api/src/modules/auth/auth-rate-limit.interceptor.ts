import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AuthenticationRateLimitError } from '../../common/errors/domain-error';
import { RedisService } from '../../infrastructure/redis/redis.service';

/**
 * Brute-force protection for the authentication endpoints.
 *
 * Two independent counters are enforced:
 *  - per source address, which caps a single host hammering any account;
 *  - per targeted account, which caps a distributed attack against one identity from many
 *    addresses. The account key is a digest of the normalized email, so no address is written
 *    to Redis in the clear.
 *
 * Fails closed: if Redis is unavailable the request is rejected rather than admitted
 * unlimited. That trades availability for safety on the credential path deliberately.
 */
@Injectable()
export class AuthRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const window = Math.floor(Date.now() / 60_000);
    const limit = this.config.get<number>('AUTH_RATE_LIMIT_PER_MINUTE', 30);
    const keys = [`auth:rate:ip:${request.ip ?? 'unknown'}:${request.path}:${window}`];

    const account = accountOf(request);
    if (account) keys.push(`auth:rate:account:${account}:${window}`);

    try {
      for (const key of keys) {
        const count = await this.redis.client.incr(key);
        if (count === 1) await this.redis.client.expire(key, 120);
        if (count > limit) throw new AuthenticationRateLimitError();
      }
    } catch (error) {
      if (error instanceof AuthenticationRateLimitError) throw error;
      throw new AuthenticationRateLimitError();
    }
    return next.handle();
  }
}

/** Digest of the normalized email in the request body, when one is present. */
function accountOf(request: Request): string | undefined {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string' || email.length === 0) return undefined;
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}
