import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { LeaveAccrualService } from './leave-accrual.service';

/** Hourly: a new month or leave year is picked up within the hour, whatever the timezone. */
const EVERY_MS = 60 * 60 * 1000;

/** One scheduled job across every API process, like the other sweeps. */
@Processor('leave-accrual')
export class LeaveAccrualProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(LeaveAccrualProcessor.name);

  constructor(
    private readonly accrual: LeaveAccrualService,
    @InjectQueue('leave-accrual') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'leave-accrual-loop',
        { every: EVERY_MS },
        { name: 'accrue', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const { added } = await this.accrual.accrueAll();
    if (added) this.logger.log(`Leave accrual: ${added} day(s) added to balances`);
  }
}
