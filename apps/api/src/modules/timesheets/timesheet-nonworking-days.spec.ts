import type { DomainContext } from '../../common/context/domain-context';
import type { Prisma } from '../../generated/prisma/client';
import { TimesheetStatus } from '../../generated/prisma/enums';
import { TimesheetEntriesService } from './timesheet-entries.service';

describe('Timesheet non-working day rules and dynamic expected hours', () => {
  let entriesService: TimesheetEntriesService;
  let mockDb: { run: jest.Mock };
  let mockAudit: { record: jest.Mock };

  const mockContext: DomainContext = {
    organizationId: 'org-1',
    accessMode: 'NATIVE',
    correlationId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
    actor: { type: 'USER', userId: 'user-emp-1' },
    permissions: new Set([
      'timesheets.write',
      'timesheets.submit',
      'timesheets.read',
      'timesheets.read.all',
    ]),
  };

  beforeEach(() => {
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
  });

  it('requires a descriptive reason when logging time on a non-working day (Sunday for Mon-Fri)', async () => {
    mockDb = {
      run: jest.fn((_ctx: unknown, fn: (tx: Prisma.TransactionClient) => unknown) => {
        const tx = {
          timesheet: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'ts-1',
              organizationId: 'org-1',
              employeeId: 'emp-1',
              timesheetPeriodId: 'period-1',
              status: TimesheetStatus.DRAFT,
            }),
            upsert: jest.fn(),
            update: jest.fn().mockResolvedValue({ id: 'ts-1' }),
          },
          employee: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'emp-1',
              organizationId: 'org-1',
              userId: 'user-emp-1',
              primaryBranchId: 'branch-1',
              dateOfJoining: new Date('2026-01-01'),
              dateOfLeaving: null,
              status: 'ACTIVE',
            }),
          },
          timesheetPeriod: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'period-1',
              organizationId: 'org-1',
              periodStart: new Date('2026-10-01'),
              periodEnd: new Date('2026-10-31'),
            }),
          },
          timesheetEntry: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { minutes: 0 } }),
            create: jest.fn().mockResolvedValue({ id: 'entry-1', minutes: 240 }),
          },
          project: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          // For WorkingDayService evaluation:
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

    entriesService = new TimesheetEntriesService(mockDb as never, mockAudit);

    // Logging time without description on Sunday should throw ConflictError requiring a reason
    await expect(
      entriesService.addManualEntry(mockContext, 'ts-1', {
        timesheetId: 'ts-1',
        workDate: '2026-10-04',
        minutes: 240,
        description: '',
      }),
    ).rejects.toThrow('Logging time on a non-working day');

    // Logging time with valid explanation on Sunday should succeed
    const result = await entriesService.addManualEntry(mockContext, 'ts-1', {
      timesheetId: 'ts-1',
      workDate: '2026-10-04',
      minutes: 240,
      description: 'Emergency weekend client deployment support',
    });
    expect(result).toBeDefined();
  });
});
