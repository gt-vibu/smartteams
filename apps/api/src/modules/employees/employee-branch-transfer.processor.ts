import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { syncPrimaryBranch, todayIn } from './employee-branch-rules';

/** Often enough that a transfer dated today moves within the hour, in every timezone. */
const EVERY_MS = 10 * 60 * 1000;

/**
 * Moves each employee's `primary_branch_id` on the day a scheduled transfer takes effect.
 *
 * A transfer dated today or earlier moves it immediately; one dated in the future cannot, because
 * everything that reads the primary branch — attendance, leave, holidays, payroll — must keep
 * seeing the current one until then. This sweep is the "then". It is idempotent: an employee
 * whose primary is already right is not touched.
 */
@Processor('employee-branch-transfer')
export class EmployeeBranchTransferProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmployeeBranchTransferProcessor.name);

  constructor(
    private readonly database: TenantDatabaseService,
    @InjectQueue('employee-branch-transfer') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'employee-branch-transfer-loop',
        { every: EVERY_MS },
        { name: 'sync', data: {}, opts: { removeOnComplete: true, removeOnFail: false } },
      )
      .catch(() => undefined);
  }

  async process() {
    const moved = await this.syncAll();
    if (moved)
      this.logger.log(`Primary branch moved for ${moved} employee(s) on their transfer date`);
  }

  async syncAll(now = new Date()) {
    const organizations = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, timezone: true },
      }),
    );
    let moved = 0;
    for (const organization of organizations) {
      try {
        moved += await this.database.run(systemContext(organization.id), async (tx) => {
          const today = todayIn(organization.timezone, now);
          // Only employees with a primary membership that has begun and whose record disagrees.
          const due = await tx.employeeBranchAssignment.findMany({
            where: {
              organizationId: organization.id,
              isPrimary: true,
              startsOn: { lte: today },
              OR: [{ endsOn: null }, { endsOn: { gte: today } }],
            },
            select: {
              employeeId: true,
              branchId: true,
              employee: { select: { primaryBranchId: true } },
            },
          });
          let count = 0;
          for (const row of due) {
            if (row.employee.primaryBranchId === row.branchId) continue;
            if (await syncPrimaryBranch(tx, organization.id, row.employeeId, today)) count += 1;
          }
          return count;
        });
      } catch (caught) {
        // One organization failing must not hold up the rest.
        this.logger.warn(
          `Branch transfer sync skipped for organization ${organization.id}: ${String(caught)}`,
        );
      }
    }
    return moved;
  }
}

function systemContext(organizationId: string): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'SYSTEM' },
    correlationId: randomUUID(),
    requestId: randomUUID(),
    permissions: new Set(['employees.write']),
  };
}
