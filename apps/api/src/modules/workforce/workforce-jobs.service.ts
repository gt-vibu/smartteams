import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { WorkforceStartDto, WorkforcePreviewDto } from './workforce.dto';
import { digest, WorkforcePlanService, type WorkforceRow } from './workforce-plan.service';
import { authorizeWorkforce } from './workforce-selection';

export type WorkforceResult = {
  id: string;
  name: string;
  outcome: 'APPLIED' | 'FAILED';
  message: string;
};
export type WorkforceJob = {
  organizationId: string;
  userId: string;
  branchId?: string;
  batchId: string;
  fingerprint: string;
  input: WorkforcePreviewDto;
  targetRevision: string;
  rows: WorkforceRow[];
  results: WorkforceResult[];
};
@Injectable()
export class WorkforceJobsService {
  constructor(
    @InjectQueue('workforce-assignments') private readonly queue: Queue<WorkforceJob>,
    private readonly plans: WorkforcePlanService,
  ) {}
  async start(context: DomainContext, input: WorkforceStartDto) {
    authorizeWorkforce(context, input.operation);
    if (!context.actor.userId) throw new ConflictError('An administrator session is required.');
    const { batchId, fingerprint: previewFingerprint, ...values } = input;
    const fingerprint = digest(values);
    const jobId = `${context.organizationId}-${context.actor.userId}-${batchId}`;
    const old = await this.queue.getJob(jobId);
    if (old) {
      if (old.data.fingerprint !== fingerprint)
        throw new ConflictError('This job ID belongs to another selection.');
      return this.view(old);
    }
    const plan = await this.plans.plan(context, values);
    if (plan.fingerprint !== previewFingerprint)
      throw new ConflictError('Setup changed since the preview. Review it again.');
    if (!plan.valid)
      throw new ConflictError('Resolve the preview issues before applying assignments.');
    const job = await this.queue.add(
      'assign',
      {
        organizationId: context.organizationId,
        userId: context.actor.userId,
        branchId: context.branchId,
        batchId,
        fingerprint,
        input: values,
        targetRevision: plan.targetRevision,
        rows: plan.rows,
        results: [],
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 7 * 86400 },
        removeOnFail: { age: 7 * 86400 },
      },
    );
    const saved = await this.queue.getJob(jobId);
    if (saved && saved.data.fingerprint !== fingerprint)
      throw new ConflictError('This job ID belongs to another selection.');
    return this.view(saved ?? job);
  }
  async retryPreview(context: DomainContext, batchId: string) {
    const job = await this.find(context, batchId);
    if (!['completed', 'failed'].includes(await job.getState()))
      throw new ConflictError('Wait for the current assignment job to finish.');
    const applied = new Set(
      job.data.results.filter((row) => row.outcome === 'APPLIED').map((row) => row.id),
    );
    const ids = job.data.rows.filter((row) => !applied.has(row.id)).map((row) => row.id);
    if (!ids.length) throw new ConflictError('All assignments were already applied.');
    const input = {
      ...job.data.input,
      filter:
        job.data.input.operation === 'LEAVE_POLICY' ? { branchIds: ids } : { employeeIds: ids },
    };
    const { rows, ...preview } = await this.plans.plan(context, input);
    return { input, preview: { ...preview, rows: rows.slice(0, 100) } };
  }
  async find(context: DomainContext, batchId: string) {
    requirePermission(context, 'employees.read.all');
    const job = await this.queue.getJob(
      `${context.organizationId}-${context.actor.userId}-${batchId}`,
    );
    if (!job) throw new NotFoundError('Workforce assignment job');
    return job;
  }
  async status(context: DomainContext, batchId: string, offset = 0) {
    return this.view(await this.find(context, batchId), offset);
  }
  private async view(job: Job<WorkforceJob>, offset = 0) {
    const results = job.data.results;
    return {
      batchId: job.data.batchId,
      state: await job.getState(),
      operation: job.data.input.operation,
      total: job.data.rows.length,
      processed: results.length,
      applied: results.filter((row) => row.outcome === 'APPLIED').length,
      failed: results.filter((row) => row.outcome === 'FAILED').length,
      results: results.slice(offset, offset + 100),
      nextOffset: results.length > offset + 100 ? offset + 100 : null,
      error: job.failedReason || null,
    };
  }
}
