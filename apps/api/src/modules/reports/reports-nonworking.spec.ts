import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService nonWorkingDaysAudit', () => {
  let reportsService: ReportsService;
  let mockDb: { run: jest.Mock };

  const mockContext: DomainContext = {
    organizationId: 'org-1',
    accessMode: 'NATIVE',
    correlationId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
    actor: { type: 'USER', userId: 'user-admin-1' },
    permissions: new Set(['attendance.read.all']),
  };

  it('lists approved attendance corrections and timesheet entries that occurred on non-working days', async () => {
    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          attendanceCorrection: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'corr-1',
                reason: 'Weekend emergency fix',
                attendanceRecord: {
                  employeeId: 'emp-1',
                  workDate: new Date('2026-10-04T00:00:00.000Z'), // Sunday
                  workedMinutes: 480,
                  employee: {
                    id: 'emp-1',
                    firstName: 'Alice',
                    lastName: 'Smith',
                    employeeNumber: 'EMP001',
                  },
                },
                approvals: [{ approverUserId: 'user-mgr-1', createdAt: new Date('2026-10-05') }],
              },
            ]),
          },
          timesheetEntry: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'entry-1',
                workDate: new Date('2026-10-04T00:00:00.000Z'), // Sunday
                minutes: 240,
                description: JSON.stringify({
                  projectName: 'Core Platform',
                  description: 'Sunday maintenance',
                }),
                timesheet: {
                  employeeId: 'emp-1',
                  employee: {
                    id: 'emp-1',
                    firstName: 'Alice',
                    lastName: 'Smith',
                    employeeNumber: 'EMP001',
                  },
                  approvals: [{ approverUserId: 'user-mgr-1', createdAt: new Date('2026-10-05') }],
                },
              },
            ]),
          },
          // WorkingDayService mock tables
          employee: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'emp-1',
              organizationId: 'org-1',
              primaryBranchId: 'branch-1',
              dateOfJoining: new Date('2026-01-01'),
              dateOfLeaving: null,
              status: 'ACTIVE',
            }),
          },
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

    reportsService = new ReportsService(mockDb as never);

    const report = await reportsService.nonWorkingDaysAudit(
      mockContext,
      '2026-10-01',
      '2026-10-31',
    );

    expect(report).toBeDefined();
    expect(report.totalItems).toBe(2);
    expect(report.items[0]).toMatchObject({
      type: 'ATTENDANCE_CORRECTION',
      workDate: '2026-10-04',
      nonWorkingDayReason: 'WEEKLY_OFF',
    });
    expect(report.items[1]).toMatchObject({
      type: 'TIMESHEET_ENTRY',
      workDate: '2026-10-04',
      nonWorkingDayReason: 'WEEKLY_OFF',
    });
  });
});
