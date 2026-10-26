import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { unmarkedAbsences } from './report-absences';

describe('half-day absence reporting', () => {
  afterEach(() => jest.useRealTimers());
  function setup(
    unmarkedDaysAreAbsent = true,
    options: { shiftDays?: number[]; optionalHoliday?: boolean } = {},
  ) {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T10:00:00Z'));
    const date = new Date('2026-10-07');
    const tx = {
      organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({
          workWeekDays: [1, 2, 3, 4, 5],
          metadata: { unmarkedDaysAreAbsent },
        }),
      },
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'a', primaryBranchId: 'branch', dateOfJoining: new Date('2026-01-01') },
          ]),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      employeeShiftAssignment: {
        findMany: jest.fn().mockResolvedValue(
          options.shiftDays
            ? [
                {
                  employeeId: 'a',
                  startsOn: new Date('2026-10-01'),
                  endsOn: null,
                  shift: { daysOfWeek: options.shiftDays },
                },
              ]
            : [],
        ),
      },
      employeeHolidaySelection: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            options.optionalHoliday ? [{ employeeId: 'a', holiday: { holidayDate: date } }] : [],
          ),
      },
      attendanceRecord: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { employeeId: 'a', workDate: date, dayStatus: 'ON_LEAVE', workedMinutes: 0 },
          ]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            employeeId: 'a',
            startDate: date,
            endDate: date,
            chargedDates: ['2026-10-07'],
            session: 'FIRST_HALF',
          },
        ]),
      },
    };
    return tx as unknown as TenantTransaction;
  }
  it('counts only the uncovered half of a finished working day', async () => {
    expect(
      (await unmarkedAbsences(setup(), 'org', new Date('2026-10-07'), new Date('2026-10-07'))).get(
        'a',
      ),
    ).toBe(0.5);
  });
  it('uses the employee shift workweek instead of the organization fallback', async () => {
    expect(
      (
        await unmarkedAbsences(
          setup(true, { shiftDays: [7] }),
          'org',
          new Date('2026-10-07'),
          new Date('2026-10-07'),
        )
      ).size,
    ).toBe(0);
  });
  it('respects a confirmed optional holiday on the uncovered half', async () => {
    expect(
      (
        await unmarkedAbsences(
          setup(true, { optionalHoliday: true }),
          'org',
          new Date('2026-10-07'),
          new Date('2026-10-07'),
        )
      ).size,
    ).toBe(0);
  });
  it('does not mark today or future leave placeholders absent', async () => {
    expect(
      (await unmarkedAbsences(setup(), 'org', new Date('2026-10-08'), new Date('2026-10-09'))).size,
    ).toBe(0);
  });
  it('respects an organization that disables unmarked-day absences', async () => {
    expect(
      (await unmarkedAbsences(setup(false), 'org', new Date('2026-10-07'), new Date('2026-10-07')))
        .size,
    ).toBe(0);
  });
});
