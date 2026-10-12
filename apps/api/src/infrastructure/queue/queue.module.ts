import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
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
          ...(config.get<boolean>('REDIS_TLS', false) ? { tls: {} } : {}),
        },
        prefix: config.get<string>('REDIS_KEY_PREFIX', 'smarteam:'),
      }),
    }),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
    BullModule.registerQueue({ name: 'outbox-dispatch' }),
    BullModule.registerQueue({ name: 'file-lifecycle' }),
    BullModule.registerQueue({ name: 'attendance-auto-check-out' }),
    BullModule.registerQueue({ name: 'employee-branch-transfer' }),
    BullModule.registerQueue({ name: 'mail-delivery' }),
    BullModule.registerQueue({ name: 'leave-accrual' }),
    BullModule.registerQueue({ name: 'notification-mail' }),
    BullModule.registerQueue({ name: 'employee-exits' }),
    BullModule.registerQueue({ name: 'approval-reminders' }),
    BullModule.registerQueue({ name: 'approval-batches' }),
    BullModule.registerQueue({ name: 'workforce-assignments' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
