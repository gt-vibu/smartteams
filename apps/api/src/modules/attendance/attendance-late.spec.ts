import { lateHalfDays, lateMarks } from './attendance-late';

const shiftStart = new Date('1970-01-01T09:30:00.000Z'); // 09:30 wall-clock, as TIME columns come back
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function tx(firstIns: Array<{ date: string; at: string } | { date: string; at: null }>) {
  return {
    organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    organizationSettings: { findUnique: jest.fn().mockResolvedValue({ lateGraceMinutes: 10 }) },
    attendanceRecord: {
      findMany: jest.fn().mockResolvedValue(
        firstIns.map(({ date, at }) => ({
          employeeId: 'e1',
          workDate: day(date),
          punches: at ? [{ occurredAt: new Date(at) }] : [],
        })),
      ),
    },
    employeeShiftAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          employeeId: 'e1',
          startsOn: day('2026-09-01'),
          endsOn: null,
          shift: { startsAt: shiftStart, daysOfWeek: [1, 2, 3, 4, 5] },
        },
      ]),
    },
  } as never;
}

describe('late marks', () => {
  const range = { from: day('2026-09-01'), to: day('2026-09-30') };

  it('counts a check-in beyond the grace, in the organization’s timezone', async () => {
    // 09:30 IST is 04:00 UTC. 04:05 UTC is within 10 minutes; 04:25 UTC is 25 minutes late.
    const marks = await lateMarks(
      tx([
        { date: '2026-09-21', at: '2026-09-21T04:05:00.000Z' },
        { date: '2026-09-22', at: '2026-09-22T04:25:00.000Z' },
      ]),
      'org',
      range,
    );
    expect(marks).toEqual([{ employeeId: 'e1', date: '2026-09-22', minutesLate: 25 }]);
  });

  it('never marks a day with no shift that weekday, or no check-in', async () => {
    const marks = await lateMarks(
      tx([
        { date: '2026-09-26', at: '2026-09-26T09:00:00.000Z' }, // a Saturday
        { date: '2026-09-23', at: null },
      ]),
      'org',
      range,
    );
    expect(marks).toEqual([]);
  });

  it('costs half a day for every so many, and nothing when switched off', () => {
    expect(lateHalfDays(7, 3)).toBe(2);
    expect(lateHalfDays(2, 3)).toBe(0);
    expect(lateHalfDays(9, 0)).toBe(0);
  });
});
