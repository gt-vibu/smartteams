import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    const useTls = config.get<boolean>('REDIS_TLS', false);
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      keyPrefix: config.get<string>('REDIS_KEY_PREFIX', 'smarteam:'),
      maxRetriesPerRequest: null,
      ...(useTls ? { tls: {} } : {}),
    });
  }

  async ping() {
    return this.client.ping();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
