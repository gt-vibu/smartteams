/**
 * A check-in on an approved optional holiday, as the employee and the approver see it.
 *
 * The day is never shown as a plain "Present"; the employee's reason is sent only to the API and
 * reported as sent only once it accepted it; the approver chooses keep or convert with a reason,
 * and nothing reads as decided before the server says so.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HolidayConflict, HolidayReviewInboxItem } from '@smarteam/contracts';
import { toHolidayConflictView } from '../../services/holiday-conflict-view';
import { attendanceSummaryStats, type AttendanceDayView } from '../../services/attendance-view';
import { AttendanceDetailDrawer } from '../screen-3-attendance-table/attendance-detail-drawer';
import { HolidayReviewDialog } from '../screen-approvals/holiday-review-dialog';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function conflict(state: HolidayConflict['state']): HolidayConflict {
  return {
    attendanceId: ID(1),
    employeeId: ID(2),
    workDate: '2026-09-14',
    selectionId: ID(3),
    holiday: { id: ID(4), name: 'Onam', date: '2026-09-14' },
    state,
    attendance: { status: 'COMPLETED', workedMinutes: 535, overtimeMinutes: 55, punches: [] },
    review: null,
  };
}

function drawer(state: HolidayConflict['state'], onExplain = vi.fn().mockResolvedValue({})) {
  const view = toHolidayConflictView(conflict(state));
  render(
    <AttendanceDetailDrawer
      row={{
        id: ID(1),
        date: 'Mon, 14-Sep-2026',
        firstIn: '09:12',
        lastOut: '18:07',
        totalHours: '08:55',
        payableHours: '08:55',
        overtime: '00:55',
        status: `Onam · ${view.label}`,
        statusType: 'holiday-checkin',
        shift: 'Not recorded',
        holidayConflict: view,
      }}
      isOpen
      onClose={vi.fn()}
      onExplainHolidayCheckIn={onExplain}
    />,
  );
  return onExplain;
}

describe('the employee’s view of the day', () => {
  it('labels the day by its review state rather than "Present"', () => {
    drawer('AWAITING_REASON');
    expect(screen.getAllByText(/Worked on holiday · reason needed/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Present')).not.toBeInTheDocument();
  });

  it('sends the reason and comment, and says so only after the server accepted it', async () => {
    const onExplain = drawer('AWAITING_REASON');
    const user = userEvent.setup();
    // A suggestion fills the box; it stays editable.
    await user.click(screen.getByRole('button', { name: 'My manager asked me to work today' }));
    await user.type(screen.getByLabelText(/comment/i), 'Release night');
    await user.click(screen.getByRole('button', { name: 'Send for manager review' }));
    expect(onExplain).toHaveBeenCalledWith(
      ID(1),
      'My manager asked me to work today',
      'Release night',
    );
    expect(await screen.findByText(/Sent to your manager/)).toBeInTheDocument();
  });

  it('keeps the form and shows the API’s refusal', async () => {
    drawer('AWAITING_REASON', vi.fn().mockRejectedValue(new Error('Already awaiting a decision')));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/why did you work/i), 'Covering for a colleague');
    await user.click(screen.getByRole('button', { name: 'Send for manager review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already awaiting a decision');
    expect(screen.queryByText(/Sent to your manager/)).not.toBeInTheDocument();
  });

  it('offers no form once a manager has decided', () => {
    drawer('HOLIDAY_KEPT');
    expect(screen.getAllByText(/Holiday kept · check-in not counted/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Send for manager review' }),
    ).not.toBeInTheDocument();
  });

  it('counts an unresolved day as neither present nor holiday, and a kept one as a holiday', () => {
    const day = (state: HolidayConflict['state']) =>
      ({
        dayStatus: 'PRESENT',
        holidayConflict: toHolidayConflictView(conflict(state)),
      }) as AttendanceDayView;
    expect(attendanceSummaryStats([day('AWAITING_DECISION')])).toMatchObject({
      presentDays: 0,
      holidayDays: 0,
    });
    expect(attendanceSummaryStats([day('HOLIDAY_KEPT')])).toMatchObject({
      presentDays: 0,
      holidayDays: 1,
    });
    expect(attendanceSummaryStats([day('CONVERTED_TO_WORKING_DAY')])).toMatchObject({
      presentDays: 1,
    });
  });
});

const review: HolidayReviewInboxItem = {
  id: ID(5),
  attendanceId: ID(1),
  workDate: '2026-09-14',
  holiday: { id: ID(4), name: 'Onam', date: '2026-09-14' },
  employee: { id: ID(2), firstName: 'Ada', lastName: 'Case' },
  reason: 'My manager asked me to work today',
  comment: null,
  createdAt: '2026-09-14T13:00:00.000Z',
  attendance: {
    status: 'COMPLETED',
    workedMinutes: 535,
    overtimeMinutes: 55,
    punches: [
      { type: 'IN', occurredAt: '2026-09-14T03:42:00.000Z' },
      { type: 'OUT', occurredAt: '2026-09-14T12:37:00.000Z' },
    ],
  },
};
const item: ApprovalInboxItem = {
  id: review.id,
  domain: 'HOLIDAY_CHECK_IN',
  employeeId: ID(2),
  title: 'Worked on an approved optional holiday',
  detail: '',
  submittedAt: review.createdAt,
  holidayReview: review,
};

function reviewDialog(decideHolidayReview: ApprovalInboxState['decideHolidayReview']) {
  const onClose = vi.fn();
  const inbox = {
    saving: false,
    saveError: null,
    decideHolidayReview,
  } as unknown as ApprovalInboxState;
  render(<HolidayReviewDialog item={item} inbox={inbox} onClose={onClose} />);
  return onClose;
}

describe('the approver’s review', () => {
  it('needs an outcome and a reason before anything is sent', async () => {
    const decide = vi.fn();
    reviewDialog(decide);
    const record = screen.getByRole('button', { name: 'Record decision' });
    expect(record).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Keep the holiday/));
    expect(record).toBeDisabled();
    await user.type(screen.getByLabelText('Reason for the decision'), 'Not needed');
    await user.click(record);
    expect(decide).toHaveBeenCalledWith(item, 'KEEP_HOLIDAY', 'Not needed');
  });

  it('closes only after the server recorded the decision', async () => {
    const onClose = reviewDialog(
      vi.fn().mockResolvedValue({
        result: 'CONVERT_TO_WORKING_DAY',
        payroll: { markedStale: 1, finalizedRuns: [] },
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Convert to a working day/));
    await user.type(screen.getByLabelText('Reason for the decision'), 'Worked on request');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open when the decision is refused', async () => {
    const onClose = reviewDialog(vi.fn().mockResolvedValue(null));
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Keep the holiday/));
    await user.type(screen.getByLabelText('Reason for the decision'), 'Not needed');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says so when payroll for the date is already released', async () => {
    reviewDialog(
      vi.fn().mockResolvedValue({
        result: 'KEEP_HOLIDAY',
        payroll: { markedStale: 0, finalizedRuns: [{ id: 'run', status: 'RELEASED' }] },
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Keep the holiday/));
    await user.type(screen.getByLabelText('Reason for the decision'), 'Not needed');
    await user.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /already released.*payroll correction/,
    );
  });
});
