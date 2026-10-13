import { DEFAULT_MISSED_CHECK_OUT_POLICY } from '@smarteam/contracts';
import {
  addLocalDays,
  missedCheckOutDeadline,
  parseMissedCheckOutPolicy,
  readMissedCheckOutPolicy,
  withMissedCheckOutPolicy,
} from './attendance-missed-checkout-policy';

describe('missed check-out policy', () => {
  it('keeps new organizations on the safe leave-open default', () => {
    expect(readMissedCheckOutPolicy({})).toEqual(DEFAULT_MISSED_CHECK_OUT_POLICY);
  });

  it('maps legacy review settings to provisional review without changing their configured time', () => {
    const legacyTime = new Date(Date.UTC(1970, 0, 1, 18, 15));
    expect(readMissedCheckOutPolicy({}, 'REVIEW_REQUIRED', legacyTime)).toMatchObject({
      resolutionMethod: 'PROVISIONAL_AUTO_CLOSE',
      correctionDeadline: 'SAME_DAY',
      configuredTime: '18:15',
    });
  });

  it('rejects an employee-correction policy when employee corrections are disabled', () => {
    expect(() =>
      parseMissedCheckOutPolicy({
        ...DEFAULT_MISSED_CHECK_OUT_POLICY,
        resolutionMethod: 'EMPLOYEE_CORRECTION',
        employeeCorrectionsAllowed: false,
      }),
    ).toThrow('The missed check-out policy is invalid');
  });

  it('uses organization local dates for same-day and next-day deadlines', () => {
    const sameDay = missedCheckOutDeadline('2026-09-16', 'Asia/Kolkata', {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      correctionDeadline: 'SAME_DAY',
      configuredTime: '18:30',
    });
    const nextDay = missedCheckOutDeadline('2026-09-16', 'Asia/Kolkata', {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      correctionDeadline: 'NEXT_CALENDAR_DAY',
      configuredTime: '18:30',
    });
    expect(sameDay.toISOString()).toBe('2026-09-16T13:00:00.000Z');
    expect(nextDay.toISOString()).toBe('2026-09-17T13:00:00.000Z');
  });

  it('uses the day before the next payroll date and clips month-end payroll days', () => {
    const deadline = missedCheckOutDeadline(
      '2026-01-31',
      'UTC',
      {
        ...DEFAULT_MISSED_CHECK_OUT_POLICY,
        correctionDeadline: 'BEFORE_PAYROLL_CUTOFF',
        configuredTime: '18:00',
      },
      31,
    );
    expect(deadline.toISOString()).toBe('2026-02-27T18:00:00.000Z');
  });

  it('falls back to the next day without a configured payroll date', () => {
    expect(
      missedCheckOutDeadline('2026-09-16', 'UTC', {
        ...DEFAULT_MISSED_CHECK_OUT_POLICY,
        correctionDeadline: 'BEFORE_PAYROLL_CUTOFF',
      }),
    ).toEqual(new Date('2026-09-17T23:59:00.000Z'));
  });

  it('adds calendar days without depending on the server timezone', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('retains the previous version and resolves policy by attendance work date', () => {
    const previous = {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      version: 4,
      effectiveFrom: '2026-09-01',
      resolutionMethod: 'PROVISIONAL_AUTO_CLOSE' as const,
    };
    const current = {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      version: 5,
      effectiveFrom: '2026-10-01',
    };
    const metadata = withMissedCheckOutPolicy({}, previous);
    const revised = withMissedCheckOutPolicy(metadata, current, previous);

    expect(readMissedCheckOutPolicy(revised, null, null, '2026-09-30')).toEqual(previous);
    expect(readMissedCheckOutPolicy(revised, null, null, '2026-10-01')).toEqual(current);
  });
});
