/**
 * Adding a day's missing check-out from the attendance drawer.
 *
 * A day that ended on a check-in could only be "regularized" with a reason, which changed nothing
 * when approved. The drawer now offers a distinct "Add missing check-out" form that asks for the
 * actual time, prefills nothing but the date, and reports only what the server did.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceDetailDrawer } from '../screen-3-attendance-table/attendance-detail-drawer';
import type { AttendanceTableRow } from '../../types/attendance-table.types';

// 09:12 on 14 Sept in the test's own timezone, so date and time fields line up with it.
const CHECK_IN = new Date(2026, 8, 14, 9, 12);

function row(overrides: Partial<AttendanceTableRow> = {}): AttendanceTableRow {
  return {
    id: 'record-14',
    date: 'Mon, 14-Sep-2026',
    firstIn: '09:12',
    lastOut: '-',
    totalHours: '-',
    payableHours: '-',
    overtime: '-',
    status: 'Present',
    statusType: 'empty',
    shift: 'Not recorded',
    canRegularize: true,
    punches: [{ type: 'IN', time: '09:12', source: 'NATIVE' }],
    openCheckInAt: CHECK_IN.toISOString(),
    ...overrides,
  };
}

function renderDrawer(overrides: Partial<AttendanceTableRow> = {}, reject?: string) {
  const onSubmitMissingCheckOut = reject
    ? vi.fn().mockRejectedValue(new Error(reject))
    : vi.fn().mockResolvedValue({ id: 'correction-1' });
  const onSubmitRegularization = vi.fn().mockResolvedValue({});
  render(
    <AttendanceDetailDrawer
      row={row(overrides)}
      isOpen
      onClose={vi.fn()}
      onSubmitRegularization={onSubmitRegularization}
      onSubmitMissingCheckOut={onSubmitMissingCheckOut}
    />,
  );
  return { onSubmitMissingCheckOut, onSubmitRegularization };
}

const setTime = (value: string) =>
  fireEvent.change(screen.getByLabelText(/actual check-out/i), { target: { value } });

describe('attendance drawer, day with no check-out', () => {
  it('offers "Add missing check-out", not the punch correction', () => {
    renderDrawer();
    expect(screen.getByText('Add missing check-out')).toBeInTheDocument();
    expect(screen.queryByText('Correct an existing punch')).not.toBeInTheDocument();
  });

  it('prefills no time, and will not send until a time and reason are given', async () => {
    const { onSubmitMissingCheckOut } = renderDrawer();
    expect(screen.getByLabelText(/actual check-out/i)).toHaveValue('');
    const send = screen.getByRole('button', { name: /request missing check-out/i });
    expect(send).toBeDisabled();

    setTime('18:07');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 'Forgot to punch out');
    expect(send).toBeEnabled();

    await userEvent.click(send);
    expect(onSubmitMissingCheckOut).toHaveBeenCalledWith(
      'record-14',
      new Date(2026, 8, 14, 18, 7).toISOString(),
      'Forgot to punch out',
    );
    expect(await screen.findByText(/sent for approval/i)).toBeInTheDocument();
  });

  it('refuses a check-out before the check-in', async () => {
    renderDrawer();
    setTime('08:00');
    await userEvent.type(screen.getByLabelText('Reason'), 'Forgot to punch out');
    expect(screen.getByText(/must be after the check-in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request missing check-out/i })).toBeDisabled();
  });

  it("shows the server's refusal and claims nothing was sent", async () => {
    renderDrawer({}, 'A missing check-out for this day is already awaiting a decision');
    setTime('18:07');
    await userEvent.type(screen.getByLabelText('Reason'), 'Forgot to punch out');
    await userEvent.click(screen.getByRole('button', { name: /request missing check-out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already awaiting a decision');
    expect(screen.queryByText(/sent for approval/i)).not.toBeInTheDocument();
  });
});

describe('attendance drawer, day with a check-out', () => {
  it('keeps the punch correction and does not offer to add a check-out', () => {
    renderDrawer({ openCheckInAt: undefined, lastOut: '18:00' });
    expect(screen.getByText('Correct an existing punch')).toBeInTheDocument();
    expect(screen.queryByText('Add missing check-out')).not.toBeInTheDocument();
  });
});
