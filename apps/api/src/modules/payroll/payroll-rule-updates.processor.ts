import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PayrollRuleUpdatesService, type RuleWatchJob } from './payroll-rule-updates.service';

/** A daily due check provides calendar-month cadence while recovering after missed downtime. */
const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

@Processor('payroll-compliance-watch')
export class PayrollRuleUpdatesProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PayrollRuleUpdatesProcessor.name);

  constructor(
    private readonly updates: PayrollRuleUpdatesService,
    @InjectQueue('payroll-compliance-watch') private readonly queue: Queue<RuleWatchJob>,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'payroll-compliance-monthly-source-check',
        { every: EVERY_DAY_MS },
        { name: 'check-sources', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not register payroll source scheduler: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  async process(job: { data: RuleWatchJob }) {
    const result = await this.updates.runScheduled(job.data);
    if (result.checked || result.changed)
      this.logger.log(
        `Payroll government source check: ${result.checked} checked, ${result.changed} review item(s) created`,
      );
    return result;
  }
}
