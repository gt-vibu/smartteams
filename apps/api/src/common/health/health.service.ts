import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

type DependencyCheck = { status: 'up' | 'down'; latencyMs?: number };

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      service: 'smarteam-api',
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  async readiness() {
    const checks: Record<string, DependencyCheck> = {};
    await Promise.all([
      this.check('database', () => this.prisma.$queryRaw`SELECT 1`, checks),
      this.check('redis', () => this.redis.ping(), checks),
    ]);
    const ready = Object.values(checks).every((check) => check.status === 'up');
    return {
      status: ready ? ('ok' as const) : ('unavailable' as const),
      service: 'smarteam-api',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    };
  }

  private async check(
    name: string,
    operation: () => Promise<unknown>,
    checks: Record<string, DependencyCheck>,
  ) {
    const startedAt = performance.now();
    try {
      await operation();
      checks[name] = { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      checks[name] = { status: 'down', latencyMs: Math.round(performance.now() - startedAt) };
    }
  }
}
