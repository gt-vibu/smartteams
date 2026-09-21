import { summarizeAttendance } from './payroll-calculation';

/**
 * Which working days with no attendance count as an absence, and so cost a day's pay.
 *
 * September 2026, Monday-to-Friday week. 1 Sept is a Tuesday.
 */
const day = (key: string) => new Date(`${key}T00:00:00Z`);
const base = {
  periodStart: day('2026-09-01'),
  periodEnd: day('2026-09-04'), // Tue–Fri: four working days
  workWeekDays: [1, 2, 3, 4, 5],
  holidays: [] as Array<{ holidayDate: Date; branchId: string | null; isOptional?: boolean }>,
  branchId: null,
  leaves: [] as Array<{ startDate: Date; endDate: Date }>,
};
const present = (key: string) => ({ dayStatus: 'PRESENT', workDate: day(key) });

describe('absence days for payroll', () => {
  it('counts a working day with no attendance at all as an absence', () => {
    const summary = summarizeAttendance(
      [present('2026-09-01'), present('2026-09-02'), present('2026-09-04')],
      base,
    );
    expect(summary.absentDays).toBe(1);
  });

  it('does not count the weekend, a company holiday or approved leave', () => {
    const summary = summarizeAttendance([present('2026-09-01')], {
      ...base,
      periodEnd: day('2026-09-06'), // runs through Sat and Sun
      holidays: [{ holidayDate: day('2026-09-02'), branchId: null }],
      leaves: [{ startDate: day('2026-09-03'), endDate: day('2026-09-04') }],
    });
    expect(summary.absentDays).toBe(0);
  });

  it('treats an optional holiday as a working day unless the employee chose it', () => {
    const optional = [{ holidayDate: day('2026-09-02'), branchId: null, isOptional: true }];
    const records = [present('2026-09-01'), present('2026-09-03'), present('2026-09-04')];
    expect(summarizeAttendance(records, { ...base, holidays: optional }).absentDays).toBe(1);
    expect(
      summarizeAttendance(records, {
        ...base,
        holidays: optional,
        employeeSelectedDates: ['2026-09-02'],
      }).absentDays,
    ).toBe(0);
  });

  it('leaves days before joining to the unemployed-days rule, so they are not charged twice', () => {
    const summary = summarizeAttendance([present('2026-09-04')], {
      ...base,
      dateOfJoining: day('2026-09-03'),
    });
    expect(summary.absentDays).toBe(1); // 3 Sept only; 1–2 Sept were before joining
  });

  it('follows the configured work week', () => {
    // A Tuesday-to-Saturday company: 5 Sept (Sat) is a working day, 1–4 Sept were attended.
    const summary = summarizeAttendance(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(present),
      { ...base, periodEnd: day('2026-09-06'), workWeekDays: [2, 3, 4, 5, 6] },
    );
    expect(summary.absentDays).toBe(1);
  });
});
