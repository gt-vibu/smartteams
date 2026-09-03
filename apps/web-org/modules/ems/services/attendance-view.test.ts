import { describe, expect, it } from 'vitest';
import { isCheckedIn, openCheckInAt, type AttendanceRecord } from '@smarteam/contracts';
import {
  attendanceTotals,
  toAttendanceDayView,
  toAttendanceDayViews,
  toCalendarStatus,
  toDailyStatus,
  toTimelineStatus,
} from './attendance-view';

const ORG = '99999999-9999-4999-8999-999999999999';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORG,
    employeeId: EMPLOYEE,
    branchId: null,
    workDate: '2026-09-02',
    status: 'OPEN',
    dayStatus: 'PRESENT',
    workedMinutes: 0,
    overtimeMinutes: 0,
    version: 1,
    punches: [],
    ...overrides,
  };
}

function punch(punchType: 'IN' | 'OUT', occurredAt: string, id?: string) {
  return { id: `${id ?? punchType}-${occurredAt}`, punchType, occurredAt };
}

/**
 * Check-in state is derived from the punch sequence rather than a stored flag. If this drifts,
 * the button offers "check in" to someone already checked in and produces a duplicate punch.
 */
describe('check-in derivation', () => {
  it('is checked in when the last punch is an IN', () => {
    const day = record({ punches: [punch('IN', '2026-09-02T09:00:00.000Z')] });
    expect(isCheckedIn(day)).toBe(true);
    expect(openCheckInAt(day)).toBe('2026-09-02T09:00:00.000Z');
  });

  it('is checked out when the last punch is an OUT', () => {
    const day = record({
      punches: [punch('IN', '2026-09-02T09:00:00.000Z'), punch('OUT', '2026-09-02T17:00:00.000Z')],
    });
    expect(isCheckedIn(day)).toBe(false);
    expect(openCheckInAt(day)).toBeNull();
  });

  it('is checked in again after a second IN following an OUT', () => {
    const day = record({
      punches: [
        punch('IN', '2026-09-02T09:00:00.000Z'),
        punch('OUT', '2026-09-02T13:00:00.000Z'),
        punch('IN', '2026-09-02T14:00:00.000Z'),
      ],
    });
    expect(isCheckedIn(day)).toBe(true);
    expect(openCheckInAt(day)).toBe('2026-09-02T14:00:00.000Z');
  });

  it('is not checked in when there is no record for today', () => {
    expect(isCheckedIn(null)).toBe(false);
    expect(openCheckInAt(null)).toBeNull();
  });
});

describe('day view', () => {
  it('marks only the matching date as today', () => {
    const view = toAttendanceDayView(record(), { todayKey: '2026-09-02' });
    expect(view.isToday).toBe(true);
    expect(toAttendanceDayView(record(), { todayKey: '2026-09-03' }).isToday).toBe(false);
  });

  it('reads the work date as a local day, not shifted by the timezone', () => {
    // `new Date('2026-09-02')` is midnight UTC, which is the previous day west of Greenwich.
    const view = toAttendanceDayView(record({ workDate: '2026-09-02' }), {
      todayKey: '2026-09-02',
    });
    expect(view.workDate).toBe('2026-09-02');
    expect(view.dayNumber).toBe(2);
  });

  it('leaves holiday and shift null, because neither module is wired', () => {
    const view = toAttendanceDayView(record(), { todayKey: '' });
    expect(view.holidayName).toBeNull();
    expect(view.shiftName).toBeNull();
  });

  it('reports no punch times when the day has no punches', () => {
    const view = toAttendanceDayView(record(), { todayKey: '' });
    expect(view.firstInTime).toBeNull();
    expect(view.lastOutTime).toBeNull();
    expect(view.spanStartPercent).toBeNull();
  });

  it('takes the first IN and the last OUT of the day', () => {
    const view = toAttendanceDayView(
      record({
        punches: [
          punch('IN', '2026-09-02T09:00:00.000Z', 'a'),
          punch('OUT', '2026-09-02T13:00:00.000Z', 'b'),
          punch('IN', '2026-09-02T14:00:00.000Z', 'c'),
          punch('OUT', '2026-09-02T18:00:00.000Z', 'd'),
        ],
      }),
      { todayKey: '' },
    );
    expect(view.firstInTime).not.toBeNull();
    expect(view.lastOutTime).not.toBeNull();
    // The bar must span the whole day, not just the first segment.
    expect(view.spanEndPercent).toBeGreaterThan(view.spanStartPercent ?? 0);
  });

  it('surfaces a pending correction on the matching record', () => {
    const views = toAttendanceDayViews([record()], '2026-09-02', [
      {
        id: '22222222-2222-4222-8222-222222222222',
        attendanceId: '11111111-1111-4111-8111-111111111111',
        status: 'PENDING',
      },
    ]);
    expect(views[0]?.correctionStatus).toBe('PENDING');
  });

  it('sorts newest first', () => {
    const views = toAttendanceDayViews(
      [record({ id: 'a', workDate: '2026-09-01' }), record({ id: 'b', workDate: '2026-09-03' })],
      '',
    );
    expect(views.map((view) => view.workDate)).toEqual(['2026-09-03', '2026-09-01']);
  });
});

describe('totals', () => {
  it('averages only over days with work, not over every row', () => {
    const views = toAttendanceDayViews(
      [
        record({ id: 'a', workDate: '2026-09-01', workedMinutes: 480 }),
        record({ id: 'b', workDate: '2026-09-02', workedMinutes: 0 }),
        record({ id: 'c', workDate: '2026-09-03', workedMinutes: 240 }),
      ],
      '',
    );
    const totals = attendanceTotals(views);
    expect(totals.daysWithWork).toBe(2);
    expect(totals.workedMinutes).toBe(720);
    expect(totals.averageLabel).toBe('6h 0m');
  });
});

describe('status mapping', () => {
  it('never turns an unknown status into PRESENT', () => {
    expect(toDailyStatus('SOMETHING_NEW')).toBe('ABSENT');
    expect(toCalendarStatus('SOMETHING_NEW')).toBe('ABSENT');
    expect(toTimelineStatus('SOMETHING_NEW')).toBe('EMPTY');
  });

  it('treats ON_DUTY as present across all three widgets', () => {
    expect(toDailyStatus('ON_DUTY')).toBe('PRESENT');
    expect(toCalendarStatus('ON_DUTY')).toBe('PRESENT');
    expect(toTimelineStatus('ON_DUTY')).toBe('PRESENT');
  });
});
