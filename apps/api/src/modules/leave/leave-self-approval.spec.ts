import type { DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { LeaveRequestStatus } from '../../generated/prisma/enums';
import { LeaveDecisionsService } from './leave-decisions.service';

describe('Leave self-approval prohibition', () => {
  let decisionsService: LeaveDecisionsService;
  let mockDb: { run: jest.Mock };
  let mockAudit: { record: jest.Mock };

  const REQUESTER_USER = 'user-emp-1';
  const OTHER_APPROVER_USER = 'user-mgr-2';

  const mockContext: DomainContext = {
    organizationId: 'org-1',
    accessMode: 'NATIVE',
    correlationId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
    actor: { type: 'USER', userId: REQUESTER_USER },
    permissions: new Set(['leave.requests.decide', 'leave.requests.read']),
  };

  beforeEach(() => {
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
  });

  it('prohibits requester from approving their own leave request', async () => {
    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          leaveRequest: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'leave-req-1',
              organizationId: 'org-1',
              status: LeaveRequestStatus.PENDING,
              employee: {
                userId: REQUESTER_USER,
                manager: { userId: OTHER_APPROVER_USER },
              },
              approvalPolicy: {
                steps: [{ id: 'step-1', stepNumber: 1, approverType: 'MANAGER' }],
              },
              approvals: [],
            }),
          },
        };
        return fn(tx as unknown as Prisma.TransactionClient);
      }),
    };

    decisionsService = new LeaveDecisionsService(mockDb as never, mockAudit);

    await expect(decisionsService.decide(mockContext, 'leave-req-1', 'APPROVED')).rejects.toThrow(
      ForbiddenDomainError,
    );
  });
});
