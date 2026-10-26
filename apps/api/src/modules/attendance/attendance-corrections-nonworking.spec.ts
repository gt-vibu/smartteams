import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { AttendanceDayStatus, AttendanceStatus } from '../../generated/prisma/enums';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

describe('Attendance corrections on non-working days', () => {
  let correctionsService: AttendanceCorrectionsService;
  let mockDb: { run: jest.Mock };
  let mockAudit: { record: jest.Mock };

  const mockContext: DomainContext = {
    organizationId: 'org-1',
    accessMode: 'NATIVE',
    correlationId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
    actor: { type: 'USER', userId: 'user-emp-1' },
    permissions: new Set([
      'attendance.corrections.write',
      'attendance.read',
      'attendance.read.all',
    ]),
  };

  beforeEach(() => {
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
  });

  it('flags a Sunday attendance regularization as non-working day for a Mon-Fri employee with appropriate reason metadata', async () => {
    let capturedSnapshot: Record<string, unknown> = {};

    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
          employee: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'emp-1',
              organizationId: 'org-1',
              userId: 'user-emp-1',
              primaryBranchId: 'branch-1',
              dateOfJoining: new Date('2026-01-01'),
              dateOfLeaving: null,
              status: 'ACTIVE',
              manager: { userId: 'user-mgr-1' },
            }),
          },
          attendanceRecord: {
            findFirst: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({
              id: 'att-rec-1',
              organizationId: 'org-1',
              employeeId: 'emp-1',
              branchId: 'branch-1',
              workDate: new Date('2026-10-04T00:00:00.000Z'), // Sunday
              status: AttendanceStatus.OPEN,
              dayStatus: AttendanceDayStatus.ABSENT,
              punches: [],
              employee: { userId: 'user-emp-1', manager: { userId: 'user-mgr-1' } },
            }),
            findUnique: jest.fn().mockResolvedValue({
              id: 'att-rec-1',
              employeeId: 'emp-1',
              workDate: new Date('2026-10-04T00:00:00.000Z'),
            }),
          },
          attendanceCorrection: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest
              .fn()
              .mockImplementation(
                ({ data }: { data: { afterSnapshot: Record<string, unknown> } }) => {
                  capturedSnapshot = data.afterSnapshot;
                  return {
                    id: 'corr-1',
                    ...data,
                  };
                },
              ),
          },
          approvalPolicy: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'policy-1',
                isDefault: true,
                steps: [{ id: 'step-1', stepNumber: 1, approverType: 'MANAGER' }],
              },
            ]),
          },
          approvalDelegation: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          notification: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          userRole: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          // WorkingDayService tables
          employeeShiftAssignment: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          shift: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          organizationSettings: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ workWeekDays: [1, 2, 3, 4, 5], standardDayMinutes: 480 }),
          },
          holiday: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          employeeHolidaySelection: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          leaveRequest: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        return fn(tx as unknown as Prisma.TransactionClient);
      }),
    };

    correctionsService = new AttendanceCorrectionsService(mockDb as never, mockAudit);

    const result = await correctionsService.requestCorrectionForDate(
      mockContext,
      'emp-1',
      '2026-10-04',
      {
        reason: 'Weekend server migration work',
        afterSnapshot: {
          correctedCheckIn: '2026-10-04T10:00:00.000Z',
          correctedCheckOut: '2026-10-04T18:00:00.000Z',
        },
      },
    );

    expect(result).toBeDefined();
    expect(capturedSnapshot).toBeDefined();
    expect(capturedSnapshot.isNonWorkingDay).toBe(true);
    expect(capturedSnapshot.nonWorkingDayReason).toBe('WEEKLY_OFF');
    expect(capturedSnapshot.nonWorkingDayDetail).toContain('Weekly off (Sunday)');
  });

  it('rejects attendance regularization on a non-working day if reason is missing or whitespace', async () => {
    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          employee: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'emp-1',
              organizationId: 'org-1',
              userId: 'user-emp-1',
              primaryBranchId: 'branch-1',
              dateOfJoining: new Date('2026-01-01'),
              dateOfLeaving: null,
              status: 'ACTIVE',
              manager: { userId: 'user-mgr-1' },
            }),
          },
          attendanceRecord: {
            findFirst: jest.fn().mockResolvedValue(null),
            upsert: jest.fn().mockResolvedValue({
              id: 'att-rec-1',
              organizationId: 'org-1',
              employeeId: 'emp-1',
              branchId: 'branch-1',
              workDate: new Date('2026-10-04T00:00:00.000Z'), // Sunday
              status: AttendanceStatus.OPEN,
              dayStatus: AttendanceDayStatus.ABSENT,
              employee: { userId: 'user-emp-1', manager: { userId: 'user-mgr-1' } },
            }),
          },
          attendanceCorrection: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          employeeShiftAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
          shift: { findFirst: jest.fn().mockResolvedValue(null) },
          organizationSettings: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ workWeekDays: [1, 2, 3, 4, 5], standardDayMinutes: 480 }),
          },
          holiday: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          employeeHolidaySelection: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
          leaveRequest: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        return fn(tx as unknown as Prisma.TransactionClient);
      }),
    };

    correctionsService = new AttendanceCorrectionsService(mockDb as never, mockAudit);

    await expect(
      correctionsService.requestCorrectionForDate(mockContext, 'emp-1', '2026-10-04', {
        reason: 'short',
        afterSnapshot: {
          correctedCheckIn: '2026-10-04T10:00:00.000Z',
          correctedCheckOut: '2026-10-04T18:00:00.000Z',
        },
      }),
    ).rejects.toThrow('Regularization on a non-working day requires a descriptive reason');
  });
});
