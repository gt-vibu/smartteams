import type { DomainContext } from '../../common/context/domain-context';
import { ForbiddenDomainError } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

describe('Attendance correction self-approval prohibition', () => {
  let correctionsService: AttendanceCorrectionsService;
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
    permissions: new Set(['attendance.corrections.decide', 'attendance.read']),
  };

  beforeEach(() => {
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
  });

  it('prohibits requester from approving their own attendance correction', async () => {
    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          attendanceCorrection: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'corr-1',
              organizationId: 'org-1',
              status: 'PENDING',
              attendanceRecord: {
                employee: {
                  userId: REQUESTER_USER,
                  manager: { userId: OTHER_APPROVER_USER },
                },
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

    correctionsService = new AttendanceCorrectionsService(mockDb as never, mockAudit);

    await expect(
      correctionsService.decideCorrection(
        mockContext,
        'corr-1',
        'APPROVED',
        'Self approval attempt',
      ),
    ).rejects.toThrow(ForbiddenDomainError);
  });
});
