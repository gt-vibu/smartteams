import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          maxRetriesPerRequest: null,
          url: config.getOrThrow<string>('REDIS_URL'),
        },
        prefix: config.get<string>('REDIS_KEY_PREFIX', 'smarteam:'),
      }),
    }),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
