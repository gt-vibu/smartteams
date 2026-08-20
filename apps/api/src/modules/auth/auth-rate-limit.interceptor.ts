import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AuthenticationRateLimitError } from '../../common/errors/domain-error';
import { RedisService } from '../../infrastructure/redis/redis.service';

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
    const route = request.path;
    const key = `auth:rate:${request.ip ?? 'unknown'}:${route}:${window}`;
    const limit = this.config.get<number>('AUTH_RATE_LIMIT_PER_MINUTE', 30);
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 120);
      if (count > limit) throw new AuthenticationRateLimitError();
      return next.handle();
    } catch (error) {
      if (error instanceof AuthenticationRateLimitError) throw error;
      throw new AuthenticationRateLimitError();
    }
  }
}
