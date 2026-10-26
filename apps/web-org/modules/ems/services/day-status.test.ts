/**
 * One rule for what a day was, shared by the Home work schedule, the attendance timeline and the
 * calendar, plus the timeline's shift-fitted ruler and the timesheet's period names.
 */
import { describe, expect, it } from 'vitest';
import { datesBetween, dayStatusLabel, resolveDayStatus, type DayFacts } from './day-status';
import { axisTicks, onAxis, timelineAxis } from './timeline-axis';
import { periodLabel } from './timesheet-view';

const day = (facts: Partial<DayFacts>): DayFacts => ({
  dateKey: '2026-09-25',
  todayKey: '2026-09-29',
  isWeeklyOff: false,
  unmarkedDaysAreAbsent: true,
  joinedOn: '2024-06-03',
  ...facts,
});

describe('resolveDayStatus', () => {
  it('puts time worked ahead of leave, a holiday or a weekly off', () => {
    expect(resolveDayStatus(day({ recordStatus: 'PRESENT', leaveName: 'Casual Leave' }))).toBe(
      'PRESENT',
    );
    expect(resolveDayStatus(day({ workedMinutes: 30, isWeeklyOff: true }))).toBe('PRESENT');
  });

  it('shows approved leave, then a holiday, then a weekly off', () => {
    expect(resolveDayStatus(day({ leaveName: 'Casual Leave', holidayName: 'Onam' }))).toBe('LEAVE');
    expect(resolveDayStatus(day({ holidayName: 'Onam', isWeeklyOff: true }))).toBe('HOLIDAY');
    expect(resolveDayStatus(day({ isWeeklyOff: true }))).toBe('WEEKEND');
  });

  it('marks a missed working day absent only where the organization counts it so', () => {
    expect(resolveDayStatus(day({}))).toBe('ABSENT');
    expect(resolveDayStatus(day({ unmarkedDaysAreAbsent: false }))).toBe('EMPTY');
  });

  it('never marks a day before joining, today or a future day absent', () => {
    expect(resolveDayStatus(day({ joinedOn: '2026-09-28' }))).toBe('EMPTY');
    expect(resolveDayStatus(day({ joinedOn: null }))).toBe('EMPTY');
    expect(resolveDayStatus(day({ dateKey: '2026-09-29' }))).toBe('TODAY');
    expect(resolveDayStatus(day({ dateKey: '2026-09-30' }))).toBe('UPCOMING');
  });

  it('names the leave or holiday in its label', () => {
    expect(dayStatusLabel('LEAVE', { leaveName: 'Casual Leave' })).toBe('Casual Leave');
    expect(dayStatusLabel('HOLIDAY', { holidayName: 'Onam' })).toBe('Onam');
    expect(dayStatusLabel('UPCOMING')).toBe('');
  });

  it('lists every day of a week, oldest first', () => {
    expect(datesBetween('2026-09-28', '2026-10-04')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });
});

describe('timelineAxis', () => {
  it('spans the shift with two hours either side', () => {
    expect(timelineAxis({ startsAt: '09:30', endsAt: '18:30' }, [])).toEqual({
      startHour: 7,
      endHour: 21,
    });
  });

  it('widens to take in a punch outside that', () => {
    // 05:00 is about 20.8% of the day.
    expect(timelineAxis({ startsAt: '09:00', endsAt: '18:00' }, [20.8]).startHour).toBe(4);
  });

  it('keeps the whole day for a shift across midnight', () => {
    expect(timelineAxis({ startsAt: '22:00', endsAt: '06:00' }, [])).toEqual({
      startHour: 0,
      endHour: 24,
    });
  });

  it('places a punch on the axis and labels the hours', () => {
    const axis = { startHour: 8, endHour: 20 };
    expect(onAxis(50, axis)).toBe(((12 - 8) / 12) * 100);
    expect(axisTicks(axis)[0]).toEqual({ label: '8 AM', percent: 0 });
  });
});

describe('periodLabel', () => {
  it('names a calendar month by its month', () => {
    expect(
      periodLabel({ periodStart: '2026-09-01', periodEnd: '2026-09-30', periodType: 'MONTHLY' }),
    ).toBe('Sep 2026');
  });

  it('gives any other period its dates', () => {
    expect(
      periodLabel({ periodStart: '2026-09-28', periodEnd: '2026-10-04', periodType: 'WEEKLY' }),
    ).toBe('28 Sep – 4 Oct 2026');
  });
});
