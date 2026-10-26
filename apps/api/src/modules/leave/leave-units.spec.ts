import { leaveUnitsOn, validateLeaveSession } from './leave-units';
import { summarizeAttendance } from '../payroll/payroll-attendance-summary';
import { summarizeLeave } from '../payroll/payroll-calculation';
import { Prisma } from '../../generated/prisma/client';
const date = new Date('2026-11-16');
const half = {
  startDate: date,
  endDate: date,
  session: 'FIRST_HALF',
  chargedDates: ['2026-11-16'],
};
it('refuses multi-date half-day requests', () => {
  expect(() => validateLeaveSession('FIRST_HALF', date, new Date('2026-11-17'))).toThrow(
    'one working date',
  );
});
it('charges only the selected half and excludes dates outside the charged snapshot', () => {
  expect(leaveUnitsOn(half, date)).toBe(0.5);
  expect(leaveUnitsOn(half, new Date('2026-11-17'))).toBe(0);
});
it('deducts only the uncovered half when half-day leave has no attendance', () => {
  const options = {
    periodStart: date,
    periodEnd: date,
    workWeekDays: [1, 2, 3, 4, 5],
    holidays: [],
    branchId: null,
    leaves: [half],
  };
  expect(summarizeAttendance([{ dayStatus: 'ON_LEAVE', workDate: date }], options)).toEqual({
    absentDays: 0,
    halfDays: 1,
  });
  expect(summarizeAttendance([{ dayStatus: 'HALF_DAY', workDate: date }], options)).toEqual({
    absentDays: 0,
    halfDays: 0,
  });
  expect(
    summarizeAttendance([], { ...options, leaves: [half, { ...half, session: 'SECOND_HALF' }] }),
  ).toEqual({ absentDays: 0, halfDays: 0 });
});
it('prices a payroll month using charged dates rather than calendar-range proportions', () => {
  const request = {
    startDate: new Date('2026-10-30'),
    endDate: new Date('2026-11-02'),
    chargedDates: ['2026-10-30', '2026-11-02'],
    requestedDays: new Prisma.Decimal(2),
    leaveType: { paid: false },
  };
  expect(summarizeLeave([request], new Date('2026-11-01'), new Date('2026-11-30'))).toEqual({
    paidDays: 0,
    unpaidDays: 1,
  });
});
