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

    // Access codes are guessable in a way an email is not — they are the secret itself — so they
    // get their own counter. Without it, the per-address limit would let a botnet spread guesses
    // against a single code across many hosts and stay under every cap.
    const code = accessCodeOf(request);
    if (code) keys.push(`auth:rate:code:${code}:${window}`);

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

/**
 * Digest of the access code in the request body, when one is present.
 *
 * Normalized the same way the activation service normalizes before hashing, so `a1b2-c3d4` and
 * `A1B2C3D4` share a counter — otherwise an attacker would get a fresh budget per spelling.
 */
function accessCodeOf(request: Request): string | undefined {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const code = (body as { code?: unknown }).code;
  if (typeof code !== 'string' || code.length === 0) return undefined;
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (normalized.length === 0) return undefined;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/** Digest of the normalized email in the request body, when one is present. */
function accountOf(request: Request): string | undefined {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string' || email.length === 0) return undefined;
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}
