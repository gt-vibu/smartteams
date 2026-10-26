import type { DomainContext } from '../../common/context/domain-context';
import { ApprovalAnalyticsService } from './approval-analytics.service';

const context: DomainContext = {
  organizationId: 'org',
  actor: { type: 'USER', userId: 'admin' },
  accessMode: 'NATIVE',
  requestId: 'r',
  correlationId: 'c',
  permissions: new Set(['*']),
};
function setup() {
  const requests = () => ({
    count: jest.fn().mockResolvedValue(7),
    findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-09-01') }),
  });
  const tx = {
    organizationSettings: {
      findUnique: jest.fn().mockResolvedValue({ approvalEscalationDays: 5 }),
    },
    leaveRequest: requests(),
    attendanceCorrection: requests(),
    leaveApproval: { count: jest.fn().mockResolvedValue(3) },
    attendanceApproval: { count: jest.fn().mockResolvedValue(4) },
  };
  return {
    tx,
    service: new ApprovalAnalyticsService({
      run: jest.fn((_context: unknown, callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as never),
  };
}
describe('approval workload permissions', () => {
  it('includes both domains for an organization administrator with wildcard permissions', async () => {
    const { service } = setup();
    expect((await service.get(context)).rows).toHaveLength(2);
  });
  it('never queries a domain the caller cannot read', async () => {
    const { service, tx } = setup();
    const result = await service.get({
      ...context,
      permissions: new Set(['approval-policies.read', 'leave.requests.read.all']),
    });
    expect(result.rows).toHaveLength(1);
    expect(tx.attendanceCorrection.count).not.toHaveBeenCalled();
  });
  it('scopes aggregate queries to the caller branch', async () => {
    const { service, tx } = setup();
    await service.get({ ...context, branchId: 'north' });
    expect(tx.leaveRequest.count).toHaveBeenCalledWith({
      where: { organizationId: 'org', branchId: 'north', status: 'PENDING' },
    });
    expect(tx.attendanceCorrection.count).toHaveBeenCalledWith({
      where: { organizationId: 'org', attendanceRecord: { branchId: 'north' }, status: 'PENDING' },
    });
  });
});
