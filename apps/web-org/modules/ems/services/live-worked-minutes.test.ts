import { describe, expect, it } from 'vitest';
import { liveWorkedMinutes, type AttendanceRecord } from '@smarteam/contracts';

/**
 * Hours worked so far. The server totals a session when it closes, so someone checked in all
 * morning read 0m on the admin table until they checked out.
 */
const punch = (punchType: 'IN' | 'OUT', occurredAt: string) =>
  ({ id: crypto.randomUUID(), punchType, occurredAt }) as NonNullable<
    AttendanceRecord['punches']
  >[number];

const now = new Date('2026-09-18T09:30:00.000Z').getTime();

describe('live worked minutes', () => {
  it('counts an open session up to now', () => {
    expect(
      liveWorkedMinutes(
        { workedMinutes: 0, punches: [punch('IN', '2026-09-18T05:07:00.000Z')] },
        now,
      ),
    ).toBe(263);
  });

  it('adds the open session to time already closed today', () => {
    const punches = [
      punch('IN', '2026-09-18T04:00:00.000Z'),
      punch('OUT', '2026-09-18T06:00:00.000Z'),
      punch('IN', '2026-09-18T09:00:00.000Z'),
    ];
    expect(liveWorkedMinutes({ workedMinutes: 120, punches }, now)).toBe(150);
  });

  it('does not keep counting a past day whose check-out was never recorded', () => {
    // Left open on the 16th, read on the 18th. Counting it to now read 36 hours on one day.
    expect(
      liveWorkedMinutes(
        {
          workDate: '2026-09-16',
          workedMinutes: 0,
          punches: [punch('IN', '2026-09-16T07:35:00.000Z')],
        },
        now,
      ),
    ).toBe(0);
  });

  it('still counts the open session on the day that is running', () => {
    expect(
      liveWorkedMinutes(
        {
          workDate: new Date(now).toISOString().slice(0, 10),
          workedMinutes: 0,
          punches: [punch('IN', '2026-09-18T05:07:00.000Z')],
        },
        now,
      ),
    ).toBe(263);
  });

  it('leaves a closed day exactly as the server totalled it', () => {
    const punches = [
      punch('IN', '2026-09-18T04:00:00.000Z'),
      punch('OUT', '2026-09-18T08:00:00.000Z'),
    ];
    expect(liveWorkedMinutes({ workedMinutes: 240, punches }, now)).toBe(240);
  });
});
