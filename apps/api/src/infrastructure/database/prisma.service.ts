import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly system: PrismaClient;
  readonly platform: PrismaClient;
  private readonly runtimePool: Pool;
  private readonly systemPool: Pool;
  private readonly platformPool: Pool;

  constructor(config: ConfigService) {
    const runtimeUrl = config.getOrThrow<string>('DATABASE_URL');
    const systemUrl = config.get<string>('DATABASE_SYSTEM_URL') || runtimeUrl;
    const platformUrl = config.get<string>('DATABASE_PLATFORM_URL') || runtimeUrl;
    const runtimePool = new Pool({ connectionString: runtimeUrl });
    const systemPool = new Pool({ connectionString: systemUrl });
    const platformPool = new Pool({ connectionString: platformUrl });
    super({ adapter: new PrismaPg(runtimePool) });
    this.runtimePool = runtimePool;
    this.systemPool = systemPool;
    this.platformPool = platformPool;
    this.system = new PrismaClient({ adapter: new PrismaPg(systemPool) });
    this.platform = new PrismaClient({ adapter: new PrismaPg(platformPool) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.system.$disconnect();
    await this.platform.$disconnect();
    await Promise.all([this.runtimePool.end(), this.systemPool.end(), this.platformPool.end()]);
  }
}
