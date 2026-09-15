/**
 * The Attendance Summary's week arrows move the week being shown.
 *
 * They used to be permanently disabled — no screen passed a handler — while the label summarised
 * whatever the fixed thirty-day fetch returned. These pin the week arithmetic and the arrows.
 */
import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { attendanceWeek, useAttendanceWeek } from './use-attendance-week';
import { TimelineTrackView } from '../components/screen-2-attendance/timeline-track-view';

describe('attendanceWeek', () => {
  it('is Monday to Sunday around the day given', () => {
    // 15 Sept 2026 is a Tuesday.
    expect(attendanceWeek('2026-09-15', 0)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    expect(attendanceWeek('2026-09-20', 0)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('steps back a whole week at a time, across a month boundary', () => {
    expect(attendanceWeek('2026-09-15', 1)).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    expect(attendanceWeek('2026-09-15', 3)).toEqual({ from: '2026-08-24', to: '2026-08-30' });
  });
});

describe('useAttendanceWeek', () => {
  it('opens on the current week with next disabled', () => {
    const { result } = renderHook(() => useAttendanceWeek());
    expect(result.current.next).toBeUndefined();
    expect(result.current.window.to >= result.current.window.from).toBe(true);
  });

  it('goes back a week, and forward again to the current one', () => {
    const { result } = renderHook(() => useAttendanceWeek());
    const current = result.current.window;

    act(() => result.current.previous());
    expect(result.current.window.to < current.from).toBe(true);
    expect(result.current.next).toBeDefined();

    act(() => result.current.next?.());
    expect(result.current.window).toEqual(current);
    expect(result.current.next).toBeUndefined();
  });
});

describe('a day with no check-out', () => {
  it('says so instead of reading as 00:00 worked', () => {
    render(
      <TimelineTrackView
        days={[
          {
            id: 'd14',
            dayLabel: '14 Sept',
            dayOfWeek: 'Mon',
            dayNumber: 14,
            firstInTime: '21:39',
            workedMinutes: 0,
            checkOutMissing: true,
            status: 'PRESENT',
          },
        ]}
      />,
    );
    expect(screen.getByText('No check-out')).toBeInTheDocument();
    expect(screen.getByText(/request a correction/i)).toBeInTheDocument();
    expect(screen.queryByText('00:00 Hrs worked')).not.toBeInTheDocument();
  });
});
