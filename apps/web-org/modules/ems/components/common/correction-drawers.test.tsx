/**
 * The two correction drawers, and the difference between submitting and appearing to submit.
 *
 * Both had the same defect from opposite ends. The calendar drawer's button called
 * `setSubmitted(true)` and nothing else — no request was ever made, so a refresh or the approval
 * inbox showed nothing. The attendance drawer did call its callback, but did not await it and
 * closed on a timer, so a rejected correction was reported to the employee as accepted. It also
 * enabled its button at five characters while the API requires ten, which is how a request that
 * could never succeed was made easy to send.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ATTENDANCE_CORRECTION_REASON_MIN_LENGTH } from '@smarteam/contracts';
import { AttendanceDetailDrawer } from '../screen-3-attendance-table/attendance-detail-drawer';
import { CalendarDetailDrawer } from '../screen-4-calendar/calendar-detail-drawer';
import type { AttendanceTableRow } from '../../types/attendance-table.types';
import type { CalendarDayItem } from '../../types/calendar.types';

const RECORD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LONG_ENOUGH = 'Machine rebooted and the punch was lost';
const TOO_SHORT = 'too short';

const row = {
  id: RECORD_ID,
  date: '2026-09-01',
  status: 'PRESENT',
  punches: [],
} as unknown as AttendanceTableRow;

const day: CalendarDayItem = {
  date: '2026-09-01',
  dayNumber: 1,
  isCurrentMonth: true,
  dayStatus: 'PRESENT',
  attendanceRecordId: RECORD_ID,
};

const submitButton = () => screen.getByRole('button', { name: /submit correction request/i });

describe('AttendanceDetailDrawer', () => {
  it('keeps submission disabled below the length the API accepts', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AttendanceDetailDrawer
        row={row}
        isOpen
        onClose={vi.fn()}
        onSubmitRegularization={onSubmit}
      />,
    );
    const box = screen.getByRole('textbox');
    await userEvent.type(box, TOO_SHORT);
    // Nine characters: enough for the old five-character rule, refused by the DTO.
    expect(TOO_SHORT.length).toBeLessThan(ATTENDANCE_CORRECTION_REASON_MIN_LENGTH);
    expect(submitButton()).toBeDisabled();
  });

  it('sends the correction and reports success only after the request resolves', async () => {
    let resolveRequest: (value?: unknown) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <AttendanceDetailDrawer
        row={row}
        isOpen
        onClose={onClose}
        onSubmitRegularization={onSubmit}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), LONG_ENOUGH);
    await userEvent.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith(RECORD_ID, LONG_ENOUGH);
    // Still in flight: nothing has been claimed and the drawer has not closed.
    expect(onClose).not.toHaveBeenCalled();

    resolveRequest();
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('keeps the drawer open and shows the server error when the request fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Attendance record not found'));
    const onClose = vi.fn();
    render(
      <AttendanceDetailDrawer
        row={row}
        isOpen
        onClose={onClose}
        onSubmitRegularization={onSubmit}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), LONG_ENOUGH);
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Attendance record not found'),
    );
    expect(onClose).not.toHaveBeenCalled();
    // The reason survives, so it can be corrected rather than retyped.
    expect(screen.getByRole('textbox')).toHaveValue(LONG_ENOUGH);
  });
});

describe('CalendarDetailDrawer', () => {
  it('actually calls the API rather than only setting local state', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarDetailDrawer day={day} isOpen onClose={vi.fn()} onSubmitCorrection={onSubmit} />,
    );
    await userEvent.type(screen.getByRole('textbox'), LONG_ENOUGH);
    await userEvent.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith(RECORD_ID, LONG_ENOUGH);
  });

  it('shows the server error and stays open when the request fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Correction policy is not configured'));
    const onClose = vi.fn();
    render(
      <CalendarDetailDrawer day={day} isOpen onClose={onClose} onSubmitCorrection={onSubmit} />,
    );
    await userEvent.type(screen.getByRole('textbox'), LONG_ENOUGH);
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Correction policy is not configured'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot submit a day that has no attendance record', async () => {
    const onSubmit = vi.fn();
    render(
      <CalendarDetailDrawer
        day={{ ...day, attendanceRecordId: undefined }}
        isOpen
        onClose={vi.fn()}
        onSubmitCorrection={onSubmit}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), LONG_ENOUGH);
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
