import { AttendancePunchType } from '../../generated/prisma/enums';
import { attendanceTotals, hasOpenPunch } from './attendance.service';

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 9, minutes));

describe('attendance calculations', () => {
  it('calculates regular and overtime minutes from ordered punch pairs', () => {
    const result = attendanceTotals(
      [
        { punchType: AttendancePunchType.IN, occurredAt: at(0) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(30) },
        { punchType: AttendancePunchType.IN, occurredAt: at(45) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(120) },
      ],
      60,
    );

    expect(result).toEqual({ workedMinutes: 105, overtimeMinutes: 45, completed: true });
  });

  it('detects an unmatched final check-in', () => {
    expect(hasOpenPunch([{ punchType: AttendancePunchType.IN, occurredAt: at(0) }])).toBe(true);
    expect(
      hasOpenPunch([
        { punchType: AttendancePunchType.IN, occurredAt: at(0) },
        { punchType: AttendancePunchType.OUT, occurredAt: at(30) },
      ]),
    ).toBe(false);
  });
});
