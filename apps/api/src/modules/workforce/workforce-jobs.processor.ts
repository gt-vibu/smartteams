import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { DomainContext } from '../../common/context/domain-context';
import { RbacService } from '../rbac/rbac.service';
import { ConflictError } from '../../common/errors/domain-error';
import { WorkforceApplyService } from './workforce-apply.service';
import type { WorkforceJob, WorkforceResult } from './workforce-jobs.service';

@Processor('workforce-assignments', { concurrency: 2 })
export class WorkforceJobsProcessor extends WorkerHost {
  constructor(
    private readonly rbac: RbacService,
    private readonly assignments: WorkforceApplyService,
  ) {
    super();
  }
  async process(job: Job<WorkforceJob>) {
    const data = job.data;
    const results = [...data.results];
    const done = new Set(results.map((row) => row.id));
    for (const row of data.rows) {
      if (done.has(row.id)) continue;
      let result: WorkforceResult;
      try {
        if (row.error) throw new ConflictError(row.error);
        const permissions = await this.rbac.loadOrganizationPermissions(
          data.userId,
          data.organizationId,
          data.branchId,
        );
        const context: DomainContext = {
          organizationId: data.organizationId,
          branchId: data.branchId,
          accessMode: 'NATIVE',
          actor: { type: 'USER', userId: data.userId },
          permissions,
          reason: data.input.reason,
          requestId: data.batchId,
          correlationId: data.batchId,
        };
        await this.assignments.apply(context, data.input, row, data.targetRevision);
        result = { id: row.id, name: row.name, outcome: 'APPLIED', message: 'Assignment saved.' };
      } catch (error) {
        result = {
          id: row.id,
          name: row.name,
          outcome: 'FAILED',
          message: error instanceof Error ? error.message : 'Assignment could not be saved.',
        };
      }
      results.push(result);
      // Bounded checkpoints avoid rewriting a 10,000-result job for every employee.
      // Assignment paths are idempotent if a worker restarts between checkpoints.
      if (results.length % 25 === 0 || results.length === data.rows.length) {
        await job.updateData({ ...data, results: [...results] });
        await job.updateProgress(Math.round((results.length / data.rows.length) * 100));
      }
    }
    return { processed: results.length };
  }
}
