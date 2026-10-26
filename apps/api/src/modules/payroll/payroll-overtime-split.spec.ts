import { Prisma } from '../../generated/prisma/client';
import { overtimePay, sumOvertimeByDayType } from './payroll-overtime-split';

const pay = (
  overtimeMinutes: number,
  days: { weeklyOffMinutes: number; holidayMinutes: number },
  rates: { weeklyOff: number | null; holiday: number | null },
) =>
  overtimePay({
    minutePay: new Prisma.Decimal(10),
    overtimeMinutes,
    employeeMultiplier: new Prisma.Decimal(1.5),
    days,
    rates,
  }).toNumber();

describe('sumOvertimeByDayType', () => {
  it('counts overtime per day type and ignores days with none', () => {
    expect(
      sumOvertimeByDayType([
        { overtimeMinutes: 60, overtimeDayType: 'HOLIDAY' },
        { overtimeMinutes: 30, overtimeDayType: 'WEEKLY_OFF' },
        { overtimeMinutes: 90, overtimeDayType: 'WORKING_DAY' },
        { overtimeMinutes: 0, overtimeDayType: 'HOLIDAY' },
        { overtimeMinutes: null, overtimeDayType: null },
      ]),
    ).toEqual({ holidayMinutes: 60, weeklyOffMinutes: 30 });
  });
});

describe('overtimePay', () => {
  const none = { weeklyOffMinutes: 0, holidayMinutes: 0 };

  it('pays the employee multiplier when no special rate is set', () => {
    expect(
      pay(60, { weeklyOffMinutes: 60, holidayMinutes: 0 }, { weeklyOff: null, holiday: null }),
    ).toBe(900);
  });

  it('pays holiday and weekly-off minutes at their own rates', () => {
    // 60 holiday at 3x, 30 weekly off at 2x, 30 ordinary at 1.5x.
    expect(
      pay(120, { weeklyOffMinutes: 30, holidayMinutes: 60 }, { weeklyOff: 2, holiday: 3 }),
    ).toBe(60 * 10 * 3 + 30 * 10 * 2 + 30 * 10 * 1.5);
  });

  it('never pays for more minutes than the approved timesheet', () => {
    expect(
      pay(30, { weeklyOffMinutes: 0, holidayMinutes: 120 }, { weeklyOff: 2, holiday: 3 }),
    ).toBe(30 * 10 * 3);
  });

  it('pays nothing for no overtime', () => {
    expect(pay(0, none, { weeklyOff: 2, holiday: 3 })).toBe(0);
  });
});
