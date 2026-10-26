import { NotificationDigestService } from './notification-digest.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationMailService } from './notification-mail.service';
import { NotificationMailProcessor } from './notification-mail.processor';
import { ApprovalRemindersService } from './approval-reminders.service';
import { ApprovalRemindersProcessor } from './approval-reminders.processor';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [NotificationsController],
  providers: [
    NotificationDigestService,
    NotificationsService,
    NotificationMailService,
    NotificationMailProcessor,
    ApprovalRemindersService,
    ApprovalRemindersProcessor,
  ],
})
export class NotificationsModule {}
