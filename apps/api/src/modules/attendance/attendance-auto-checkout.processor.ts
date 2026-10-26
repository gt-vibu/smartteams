import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AttendanceAutoCheckOutService } from './attendance-auto-checkout.service';

/** Often enough that a 23:59 cutoff is acted on within the same hour, in every timezone. */
const EVERY_MS = 10 * 60 * 1000;

/**
 * The sweep that closes yesterday's forgotten check-outs.
 *
 * It runs on the same queue machinery as outbox dispatch, so it is one scheduled job across
 * however many API processes are running rather than one per process. Each pass asks every
 * organization that has switched automatic close on whether its own day is over yet; the work is
 * idempotent, so an extra pass costs nothing.
 */
@Processor('attendance-auto-check-out')
export class AttendanceAutoCheckOutProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AttendanceAutoCheckOutProcessor.name);

  constructor(
    private readonly autoCheckOut: AttendanceAutoCheckOutService,
    @InjectQueue('attendance-auto-check-out') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'attendance-auto-check-out-loop',
        { every: EVERY_MS },
        { name: 'close', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const outcome = await this.autoCheckOut.closeDueDays();
    if (outcome.closed || outcome.failed)
      this.logger.log(
        `Automatic check-out: ${outcome.closed} day(s) sent for review, ${outcome.failed} could not be`,
      );
  }
}
