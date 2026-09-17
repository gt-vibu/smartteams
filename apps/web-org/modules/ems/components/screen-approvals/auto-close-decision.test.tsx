/**
 * Deciding a day that was closed with no check-out.
 *
 * The close proposes a time; the approver is the one who settles it. These pin that the dialog
 * says where the time came from, that approving as-is sends no time of its own, and that a time
 * the approver enters is the one that reaches the API.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { ApprovalQueue } from './approval-queue';

const autoClosed: ApprovalInboxItem = {
  id: 'correction-1',
  domain: 'ATTENDANCE_CORRECTION',
  employeeId: 'employee-1',
  title: 'Day closed with no check-out',
  detail: 'Proposed check-out at 16 Sep, 23:59 · Closed automatically',
  submittedAt: '2026-09-16T18:30:00.000Z',
  proposedCheckOut: '2026-09-16T18:29:00.000Z',
  autoClosed: true,
};

function inboxState(overrides: Partial<ApprovalInboxState> = {}): ApprovalInboxState {
  return {
    items: [autoClosed],
    loading: false,
    error: null,
    leaveForbidden: false,
    attendanceForbidden: false,
    refetch: vi.fn(),
    saving: false,
    saveError: null,
    dismissError: vi.fn(),
    decide: vi.fn().mockResolvedValue(true),
    decideHolidayReview: vi.fn(),
    canDecide: () => true,
    ...overrides,
  };
}

describe('an automatically closed day in the approvals queue', () => {
  it('says the day was closed automatically and what approving would record', async () => {
    render(<ApprovalQueue inbox={inboxState()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }));
    expect(
      screen.getByText(/This day was closed automatically because no check-out was recorded/i),
    ).toBeInTheDocument();
    // The proposed time is stated, and nothing is prefilled for the approver.
    expect(screen.getAllByText(/23:59|11:59/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Time')).toHaveValue('');
  });

  it('approves at the proposed time when the approver adds none', async () => {
    const decide = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ApprovalQueue inbox={inboxState({ decide })} />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.type(screen.getByLabelText('Comment'), 'Checked with the team');
    await user.click(screen.getByRole('button', { name: 'Approve', hidden: false }));
    expect(decide).toHaveBeenCalledWith(autoClosed, 'APPROVED', 'Checked with the team', undefined);
  });

  it('sends the time the approver enters instead', async () => {
    const decide = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ApprovalQueue inbox={inboxState({ decide })} />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByLabelText('Date'));
    await user.click(screen.getByRole('button', { name: '16' }));
    await user.type(screen.getByLabelText('Time'), '18:07');
    await user.type(screen.getByLabelText('Comment'), 'He left at six');
    await user.click(screen.getAllByRole('button', { name: 'Approve' }).at(-1)!);

    const [, status, comment, checkOutAt] = decide.mock.calls.at(-1) as [
      unknown,
      string,
      string,
      string,
    ];
    expect(status).toBe('APPROVED');
    expect(comment).toBe('He left at six');
    // Sent as an instant, from the approver's own date and time.
    expect(new Date(checkOutAt).getHours()).toBe(18);
    expect(new Date(checkOutAt).getMinutes()).toBe(7);
  });

  it('offers no time field when rejecting', async () => {
    render(<ApprovalQueue inbox={inboxState()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
  });
});
