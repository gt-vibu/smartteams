import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { DomainContext } from '../../common/context/domain-context';
import { AttendanceService } from '../attendance/attendance.service';
import { LeaveService } from '../leave/leave.service';
import { RbacService } from '../rbac/rbac.service';
import type { ApprovalBatchData, ApprovalBatchResult } from './approval-batches.service';

@Processor('approval-batches', { concurrency: 2 })
export class ApprovalBatchesProcessor extends WorkerHost {
  constructor(
    private readonly rbac: RbacService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
  ) {
    super();
  }
  async process(job: Job<ApprovalBatchData>) {
    const data = job.data;
    const results = [...data.results];
    const completed = new Set(results.map((row) => `${row.domain}:${row.id}`));
    for (const item of data.items) {
      if (completed.has(`${item.domain}:${item.id}`)) continue;
      let result: ApprovalBatchResult;
      try {
        // Re-resolve membership and authority for every item, including after worker restarts.
        const permissions = await this.rbac.loadOrganizationPermissions(
          data.userId,
          data.organizationId,
        );
        const context: DomainContext = {
          organizationId: data.organizationId,
          accessMode: 'NATIVE',
          actor: { type: 'USER', userId: data.userId },
          permissions,
          correlationId: data.batchId,
          requestId: data.batchId,
        };
        const decision =
          item.domain === 'LEAVE'
            ? await this.leave.decide(
                context,
                item.id,
                data.status,
                data.comment,
                item.expectedStepNumber,
              )
            : await this.attendance.decideCorrection(
                context,
                item.id,
                data.status,
                data.comment,
                undefined,
                item.expectedStepNumber,
              );
        result = {
          id: item.id,
          domain: item.domain,
          outcome: 'DECIDED',
          status: decision.status,
          message:
            decision.status === 'PENDING'
              ? 'Your step is complete; waiting for the next approver.'
              : `Request ${decision.status.toLowerCase()}.`,
        };
      } catch (caught) {
        result = {
          id: item.id,
          domain: item.domain,
          outcome: 'FAILED',
          message: caught instanceof Error ? caught.message : 'Could not record the decision.',
        };
      }
      results.push(result);
      result.label = item.label;
      await job.updateData({ ...data, results: [...results] });
      await job.updateProgress(Math.round((results.length / data.items.length) * 100));
    }
    return { processed: results.length };
  }
}
