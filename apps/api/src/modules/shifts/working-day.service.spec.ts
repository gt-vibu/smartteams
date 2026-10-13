import type { Prisma } from '../../generated/prisma/client';
import { WorkingDayService } from './working-day.service';

describe('WorkingDayService', () => {
  let service: WorkingDayService;
  const orgId = '11111111-1111-4111-8111-111111111111';
  const empId = '22222222-2222-4222-8222-222222222222';
  const branchId = '33333333-3333-4333-8333-333333333333';

  let mockEmployee: {
    id: string;
    primaryBranchId: string;
    dateOfJoining: Date;
    dateOfLeaving: Date | null;
    status: string;
  };
  let mockLeave: { chargedDates?: string[]; leaveType: { name: string; paid: boolean } } | null;
  let mockHoliday: { name: string } | null;
  let mockOptionalHoliday: { holiday: { name: string } } | null;
  let mockShiftAssignment: {
    shift: {
      name: string;
      daysOfWeek: number[];
      startsAt: Date;
      endsAt: Date;
      crossesMidnight: boolean;
    };
  } | null;

  let mockTx: Prisma.TransactionClient;

  beforeEach(() => {
    mockEmployee = {
      id: empId,
      primaryBranchId: branchId,
      dateOfJoining: new Date('2026-01-01T00:00:00.000Z'),
      dateOfLeaving: null,
      status: 'ACTIVE',
    };
    mockLeave = null;
    mockHoliday = null;
    mockOptionalHoliday = null;
    mockShiftAssignment = null;

    mockTx = {
      organizationSettings: {
        findUnique: () =>
          Promise.resolve({ workWeekDays: [1, 2, 3, 4, 5], standardDayMinutes: 480 }),
      },
      employee: {
        findFirst: () => Promise.resolve(mockEmployee),
      },
      leaveRequest: {
        findFirst: () => Promise.resolve(mockLeave),
      },
      holiday: {
        findFirst: () => Promise.resolve(mockHoliday),
      },
      employeeHolidaySelection: {
        findFirst: () => Promise.resolve(mockOptionalHoliday),
      },
      employeeShiftAssignment: {
        findFirst: () => Promise.resolve(mockShiftAssignment),
      },
    } as unknown as Prisma.TransactionClient;

    const mockDb = {
      run: (_ctx: unknown, callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        callback(mockTx),
    };
    service = new WorkingDayService(mockDb as never);
  });

  it('keeps uncharged dates outside an approved leave request available for the actual calendar', async () => {
    mockLeave = {
      chargedDates: ['2026-09-18', '2026-09-21'],
      leaveType: { name: 'Annual', paid: true },
    };
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-20');
    expect(result.reason).toBe('WEEKLY_OFF');
  });

  it('identifies Sunday as non-working day under standard Mon-Fri default schedule', async () => {
    // 2026-09-20 is a Sunday
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-20');
    expect(result.isWorkingDay).toBe(false);
    expect(result.reason).toBe('WEEKLY_OFF');
    expect(result.detail).toContain('Sunday');
  });

  it('identifies Monday as a working day with 480 minutes under standard default schedule', async () => {
    // 2026-09-21 is a Monday
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-21');
    expect(result.isWorkingDay).toBe(true);
    expect(result.expectedMinutes).toBe(480);
  });

  it('handles Mon-Sat 6-day shift assignments correctly', async () => {
    mockShiftAssignment = {
      shift: {
        name: 'Mon-Sat General',
        daysOfWeek: [1, 2, 3, 4, 5, 6], // Mon to Sat
        startsAt: new Date('1970-01-01T09:00:00.000Z'),
        endsAt: new Date('1970-01-01T17:00:00.000Z'),
        crossesMidnight: false,
      },
    };
    // 2026-09-26 is a Saturday -> Working Day
    const satResult = await service.evaluateDay(mockTx, orgId, empId, '2026-09-26');
    expect(satResult.isWorkingDay).toBe(true);
    expect(satResult.expectedMinutes).toBe(480);

    // 2026-09-27 is a Sunday -> Weekly Off
    const sunResult = await service.evaluateDay(mockTx, orgId, empId, '2026-09-27');
    expect(sunResult.isWorkingDay).toBe(false);
    expect(sunResult.reason).toBe('WEEKLY_OFF');
  });

  it('handles night shifts crossing midnight', async () => {
    mockShiftAssignment = {
      shift: {
        name: 'Night Shift',
        daysOfWeek: [1, 2, 3, 4, 5],
        startsAt: new Date('1970-01-01T21:00:00.000Z'), // 9 PM
        endsAt: new Date('1970-01-01T05:00:00.000Z'), // 5 AM
        crossesMidnight: true,
      },
    };
    // 2026-09-22 is a Tuesday
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-22');
    expect(result.isWorkingDay).toBe(true);
    expect(result.expectedMinutes).toBe(480); // 8 hours
  });

  it('handles public mandatory holidays on a regular working day', async () => {
    mockHoliday = { name: 'Gandhi Jayanti' };
    // 2026-10-02 is a Friday
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-10-02');
    expect(result.isWorkingDay).toBe(false);
    expect(result.reason).toBe('HOLIDAY');
    expect(result.detail).toBe('Public holiday: Gandhi Jayanti');
  });

  it('handles approved leave overlapping the work date', async () => {
    mockLeave = {
      leaveType: { name: 'Casual Leave', paid: true },
    };
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-23');
    expect(result.isWorkingDay).toBe(false);
    expect(result.reason).toBe('ON_LEAVE');
    expect(result.detail).toContain('Casual Leave');
  });

  it('marks dates before employee joining as BEFORE_JOINING', async () => {
    mockEmployee.dateOfJoining = new Date('2026-09-15T00:00:00.000Z');
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-10');
    expect(result.isWorkingDay).toBe(false);
    expect(result.reason).toBe('BEFORE_JOINING');
  });

  it('marks dates after employee leaving as AFTER_LEAVING', async () => {
    mockEmployee.dateOfLeaving = new Date('2026-09-20T00:00:00.000Z');
    const result = await service.evaluateDay(mockTx, orgId, empId, '2026-09-25');
    expect(result.isWorkingDay).toBe(false);
    expect(result.reason).toBe('AFTER_LEAVING');
  });

  it('computes dynamic expected hours across a date range prorated for join date and holidays', async () => {
    mockEmployee.dateOfJoining = new Date('2026-09-15T00:00:00.000Z'); // Joined mid-month
    // Range: 2026-09-01 to 2026-09-30 (30 days total)
    // From Sep 1 to Sep 14: 14 days before joining (0 hrs)
    // From Sep 15 to Sep 30: 16 calendar days -> 12 working days (Mon-Fri) * 8 hrs = 96 hrs
    const result = await service.expectedHours(mockTx, orgId, empId, '2026-09-01', '2026-09-30');

    expect(result.workingDaysCount).toBe(12);
    expect(result.totalHours).toBe(96);
  });

  it('computes expected hours correctly for a mid-month joiner on a part-time shift with approved leave', async () => {
    mockEmployee.dateOfJoining = new Date('2026-09-15T00:00:00.000Z');
    // Part-time shift: Mon-Fri, 9am to 1pm (4 hours / 240 mins)
    mockShiftAssignment = {
      shift: {
        name: 'Part-time Morning',
        daysOfWeek: [1, 2, 3, 4, 5],
        startsAt: new Date('1970-01-01T09:00:00.000Z'),
        endsAt: new Date('1970-01-01T13:00:00.000Z'),
        crossesMidnight: false,
      },
    };
    // 1 day on approved leave (2026-09-16)
    mockTx.leaveRequest.findFirst = jest.fn(
      ({ where }: { where: { startDate: { lte: Date } } }) => {
        const targetDate = where.startDate.lte.toISOString().slice(0, 10);
        return Promise.resolve(
          targetDate === '2026-09-16' ? { leaveType: { name: 'Sick Leave', paid: true } } : null,
        );
      },
    ) as never;

    const result = await service.expectedHours(mockTx, orgId, empId, '2026-09-01', '2026-09-30');

    // 12 working days minus 1 approved leave = 11 working days * 4 hours = 44 hours
    expect(result.workingDaysCount).toBe(11);
    expect(result.totalHours).toBe(44);
  });
});
