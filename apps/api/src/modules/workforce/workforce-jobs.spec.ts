import type { DomainContext } from '../../common/context/domain-context';
import { WorkforceJobsService } from './workforce-jobs.service';

const context: DomainContext = {
  organizationId: 'org',
  actor: { type: 'USER', userId: 'admin' },
  accessMode: 'NATIVE',
  correlationId: 'correlation',
  requestId: 'request',
  permissions: new Set(['*']),
};
function setup(operation = 'MANAGER', state = 'completed') {
  const job = {
    data: {
      input: { operation, targetId: 'target', effectiveFrom: '2026-10-08', reason: 'Staff setup' },
      rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      results: [
        { id: 'a', outcome: 'APPLIED' },
        { id: 'b', outcome: 'FAILED' },
      ],
    },
    getState: jest.fn().mockResolvedValue(state),
  };
  const queue = { getJob: jest.fn().mockResolvedValue(job) };
  const plans = {
    plan: jest.fn().mockResolvedValue({ rows: [{ id: 'b' }, { id: 'c' }], total: 2 }),
  };
  return { queue, plans, service: new WorkforceJobsService(queue as never, plans as never) };
}
describe('workforce assignment recovery', () => {
  it('re-previews failed and uncheckpointed rows and excludes successes', async () => {
    const { service, plans } = setup();
    const result = await service.retryPreview(context, 'batch');
    expect(result.input.filter).toEqual({ employeeIds: ['b', 'c'] });
    expect(plans.plan).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ filter: { employeeIds: ['b', 'c'] } }),
    );
  });
  it('retries only failed branch availability assignments', async () => {
    const { service } = setup('LEAVE_POLICY');
    expect((await service.retryPreview(context, 'batch')).input.filter).toEqual({
      branchIds: ['b', 'c'],
    });
  });
  it('does not retry a job while it is still running', async () => {
    const { service, plans } = setup('MANAGER', 'active');
    await expect(service.retryPreview(context, 'batch')).rejects.toThrow('finish');
    expect(plans.plan).not.toHaveBeenCalled();
  });
  it('uses the current tenant and creator to look up retained results', async () => {
    const { service, queue } = setup();
    await service.retryPreview(context, 'batch');
    expect(queue.getJob).toHaveBeenCalledWith('org-admin-batch');
    await expect(
      service.retryPreview({ ...context, permissions: new Set() }, 'batch'),
    ).rejects.toThrow('permission');
  });
});
