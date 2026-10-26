import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EmployeeResignationsService } from './employee-resignations.service';
import { EmployeeMilestonesService } from './employee-milestones.service';

/** Hourly: someone is off-boarded within the hour after their last working day ends. */
const EVERY_MS = 60 * 60 * 1000;

@Processor('employee-exits')
export class EmployeeResignationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmployeeResignationsProcessor.name);

  constructor(
    private readonly resignations: EmployeeResignationsService,
    private readonly milestones: EmployeeMilestonesService,
    @InjectQueue('employee-exits') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'employee-exits-loop',
        { every: EVERY_MS },
        { name: 'complete', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const completed = await this.resignations.completeDue();
    if (completed)
      this.logger.log(`Exits: ${completed} employee(s) off-boarded after their last day`);
    // Probation ending and documents expiring are looked ahead to on the same pass.
    const told = await this.milestones.sweep();
    if (told) this.logger.log(`Milestones: ${told} reminder(s) sent`);
  }
}
