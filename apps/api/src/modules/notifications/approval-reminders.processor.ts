import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ApprovalRemindersService } from './approval-reminders.service';

/** Hourly; each request is reminded at most once a day and escalated once. */
const EVERY_MS = 60 * 60 * 1000;

@Processor('approval-reminders')
export class ApprovalRemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ApprovalRemindersProcessor.name);

  constructor(
    private readonly reminders: ApprovalRemindersService,
    @InjectQueue('approval-reminders') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'approval-reminders-loop',
        { every: EVERY_MS },
        { name: 'sweep', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const sent = await this.reminders.sweep();
    if (sent) this.logger.log(`Approval follow-up: ${sent} reminder(s) sent`);
  }
}
