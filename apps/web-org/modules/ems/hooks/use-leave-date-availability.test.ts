import { describe, expect, it } from 'vitest';
import { leaveEndLimit } from './use-leave-date-availability';

describe('Leave end date constraints', () => {
  it('ends before an existing booking, including a booking inside the chosen range', () => {
    expect(
      leaveEndLimit(
        '2026-10-05',
        1,
        [{ date: '2026-10-08', reason: 'Already requested for leave' }],
        '2028-10-09',
      ),
    ).toBe('2026-10-07');
  });
  it('allows days off inside a range while limiting it to the leave year', () => {
    expect(
      leaveEndLimit('2026-10-05', 4, [{ date: '2026-10-10', reason: 'Weekly off' }], '2028-10-09'),
    ).toBe('2027-03-31');
    expect(leaveEndLimit('2026-03-30', 4, [], '2028-10-09')).toBe('2026-03-31');
  });
  it('handles leap years and the application date limit', () => {
    expect(leaveEndLimit('2023-03-01', 3, [], '2028-10-09')).toBe('2024-02-29');
    expect(leaveEndLimit('2028-10-08', 1, [], '2028-10-09')).toBe('2028-10-09');
  });
});
