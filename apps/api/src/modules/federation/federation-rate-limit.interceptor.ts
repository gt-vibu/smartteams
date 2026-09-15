import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RateLimitError } from '../../common/errors/domain-error';
import { MetricsService } from '../../common/metrics/metrics.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { FederationRequest } from './federation.types';

@Injectable()
export class FederationRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = executionContext.switchToHttp().getRequest<FederationRequest>();
    const clientKey = request.federation?.clientInternalId ?? this.tokenClientKey(request);
    if (!clientKey) return next.handle();
    const isTokenRequest = request.path === '/v1/oauth/token';
    const limit = isTokenRequest
      ? this.config.get<number>('FEDERATION_TOKEN_RATE_LIMIT_PER_MINUTE', 60)
      : this.config.get<number>('FEDERATION_RATE_LIMIT_PER_MINUTE', 600);
    const window = Math.floor(Date.now() / 60_000);
    const key = `federation:rate:${isTokenRequest ? 'token' : 'client'}:${clientKey}:${window}`;
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 120);
      if (count > limit) {
        this.metrics.federationRateLimitHits.inc();
        throw new RateLimitError();
      }
      return next.handle();
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      this.metrics.federationRateLimitHits.inc();
      throw new RateLimitError();
    }
  }

  private tokenClientKey(request: FederationRequest) {
    if (request.path !== '/v1/oauth/token') return undefined;
    const body = request.body;
    const clientId =
      body && typeof body === 'object' && !Array.isArray(body) && 'client_id' in body
        ? body.client_id
        : undefined;
    return typeof clientId === 'string' && clientId.length > 0 ? clientId : request.ip;
  }
}
