import { NotificationDigestService } from './notification-digest.service';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { NotificationMailService } from './notification-mail.service';

/** Every minute: an approval reaches someone's inbox about as fast as their bell. */
const EVERY_MS = 60 * 1000;

@Processor('notification-mail')
export class NotificationMailProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(NotificationMailProcessor.name);

  constructor(
    private readonly mail: NotificationMailService,
    private readonly digests: NotificationDigestService,
    @InjectQueue('notification-mail') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'notification-mail-loop',
        { every: EVERY_MS },
        { name: 'send', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const sent = (await this.mail.sendPending()) + (await this.digests.sendPending());
    if (sent) this.logger.log(`Notification email: ${sent} queued`);
  }
}
