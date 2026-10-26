import { RedisService } from '../../infrastructure/redis/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { DomainContext } from '../../common/context/domain-context';
import { requirePermission } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import type { ApprovalBatchDto } from './approval-batches.dto';

export type ApprovalBatchResult = {
  id: string;
  domain: string;
  outcome: 'DECIDED' | 'FAILED';
  message: string;
  status?: string;
  label?: string;
};
export type ApprovalBatchData = ApprovalBatchDto & {
  organizationId: string;
  userId: string;
  fingerprint: string;
  results: ApprovalBatchResult[];
};

@Injectable()
export class ApprovalBatchesService {
  constructor(
    @InjectQueue('approval-batches') private readonly queue: Queue<ApprovalBatchData>,
    private readonly redis: RedisService,
  ) {}
  async start(context: DomainContext, input: ApprovalBatchDto) {
    if (!context.actor.userId) throw new ConflictError('A human approver is required');
    for (const item of input.items)
      requirePermission(
        context,
        item.domain === 'LEAVE' ? 'leave.requests.decide' : 'attendance.corrections.decide',
      );
    if (new Set(input.items.map((item) => `${item.domain}:${item.id}`)).size !== input.items.length)
      throw new ConflictError('A batch must not contain duplicate requests');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const jobId = `${context.organizationId}-${context.actor.userId}-${input.batchId}`;
    const old = await this.queue.getJob(jobId);
    if (old) {
      if (old.data.fingerprint !== fingerprint)
        throw new ConflictError('This batch ID was already used for different requests');
      await this.index(old);
      return this.dto(old);
    }
    const job = await this.queue.add(
      'decide',
      {
        ...input,
        organizationId: context.organizationId,
        userId: context.actor.userId,
        fingerprint,
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
    const persisted = await this.queue.getJob(jobId);
    if (persisted && persisted.data.fingerprint !== fingerprint)
      throw new ConflictError('This batch ID was already used for different requests');
    await this.index(persisted ?? job);
    return this.dto(persisted ?? job);
  }
  private async index(job: Job<ApprovalBatchData>) {
    const client = this.redis.client;
    const key = `approval-history:${job.data.organizationId}:${job.data.userId}`;
    await client
      .multi()
      .zadd(key, job.timestamp, job.id!)
      .zremrangebyscore(key, '-inf', Date.now() - 7 * 86400000)
      .expire(key, 7 * 86400)
      .exec();
  }
  async history(context: DomainContext, offset = 0) {
    requirePermission(context, 'approval-policies.read');
    const client = this.redis.client;
    const key = `approval-history:${context.organizationId}:${context.actor.userId}`;
    await client.zremrangebyscore(key, '-inf', Date.now() - 7 * 86400000);
    const ids = await client.zrevrange(key, offset, offset + 10);
    const jobs = await Promise.all(ids.slice(0, 10).map((id) => this.queue.getJob(id)));
    const items = await Promise.all(
      jobs
        .filter((job): job is Job<ApprovalBatchData> => Boolean(job))
        .map(async (job) => ({
          batchId: job.data.batchId,
          createdAt: new Date(job.timestamp).toISOString(),
          state: await job.getState(),
          total: job.data.items.length,
          processed: job.data.results.length,
          failed: job.data.results.filter((row) => row.outcome === 'FAILED').length,
          error: job.failedReason || null,
        })),
    );
    return { items, nextOffset: ids.length > 10 ? offset + 10 : null };
  }
  async get(context: DomainContext, batchId: string) {
    const job = await this.queue.getJob(
      `${context.organizationId}-${context.actor.userId}-${batchId}`,
    );
    if (!job) throw new NotFoundError('Approval batch');
    return this.dto(job);
  }
  private async dto(job: Job<ApprovalBatchData>) {
    return {
      batchId: job.data.batchId,
      state: await job.getState(),
      total: job.data.items.length,
      processed: job.data.results.length,
      results: job.data.results,
      error: job.failedReason || null,
    };
  }
}
