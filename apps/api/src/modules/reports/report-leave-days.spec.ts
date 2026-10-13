import { reportLeaveDays } from './report-leave-days';

describe('leave reporting uses the report interval', () => {
  const from = new Date('2026-10-01');
  const to = new Date('2026-10-31');
  it('does not count September charged days in the October report', () => {
    expect(
      reportLeaveDays(
        {
          startDate: new Date('2026-09-30'),
          endDate: new Date('2026-10-02'),
          requestedDays: 3,
          chargedDates: ['2026-09-30', '2026-10-01', '2026-10-02'],
          session: 'FULL_DAY',
        },
        from,
        to,
      ),
    ).toBe(2);
  });
  it('counts half-day snapshots and excludes noncharged holidays', () => {
    expect(
      reportLeaveDays(
        {
          startDate: from,
          endDate: from,
          requestedDays: 0.5,
          chargedDates: ['2026-10-01'],
          session: 'SECOND_HALF',
        },
        from,
        to,
      ),
    ).toBe(0.5);
    expect(
      reportLeaveDays(
        { startDate: from, endDate: to, requestedDays: 0, chargedDates: [], session: 'FULL_DAY' },
        from,
        to,
      ),
    ).toBe(0);
  });
  it('prorates legacy requests that lack a charged-day snapshot', () => {
    expect(
      reportLeaveDays(
        { startDate: new Date('2026-09-30'), endDate: new Date('2026-10-02'), requestedDays: 3 },
        from,
        to,
      ),
    ).toBe(2);
  });
});
