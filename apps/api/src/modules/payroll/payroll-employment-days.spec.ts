import { unemployedDays } from './payroll-calculation';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const AUGUST_START = d('2026-08-01');
const AUGUST_END = d('2026-08-31');

/**
 * `payrollDayBasis` is a fixed monthly divisor, so every unpaid day costs one basis-day of gross.
 * Employment dates were missing from that sum, which meant somebody who joined on the 16th was
 * paid for the whole month. These pin the day counts the fix contributes.
 */
describe('unemployedDays', () => {
  it('counts nothing for an employee present all period', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2024-03-15'), null)).toBe(0);
  });

  it('counts nothing when the employment dates are unknown', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, null, null)).toBe(0);
  });

  it('counts the days before a mid-month joiner started', () => {
    // Joined on the 16th, so the 1st to the 15th are unpaid: fifteen days.
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2026-08-16'), null)).toBe(15);
  });

  it('counts nothing when the employee joined on the first day of the period', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2026-08-01'), null)).toBe(0);
  });

  it('counts the days after a mid-month leaver finished', () => {
    // Left on the 10th, so the 11th to the 31st are unpaid: twenty-one days.
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2024-03-15'), d('2026-08-10'))).toBe(21);
  });

  it('counts nothing when the employee left on the last day of the period', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2024-03-15'), d('2026-08-31'))).toBe(0);
  });

  it('counts both ends for someone who joined and left inside the period', () => {
    // Present from the 10th to the 20th: nine days before, eleven after.
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2026-08-10'), d('2026-08-20'))).toBe(20);
  });

  it('counts the whole period for someone who joins after it ends', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2026-09-15'), null)).toBe(31);
  });

  it('counts the whole period for someone who left before it started', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2024-03-15'), d('2026-07-20'))).toBe(31);
  });

  it('never counts a negative day', () => {
    expect(unemployedDays(AUGUST_START, AUGUST_END, d('2020-01-01'), d('2030-01-01'))).toBe(0);
  });
});
