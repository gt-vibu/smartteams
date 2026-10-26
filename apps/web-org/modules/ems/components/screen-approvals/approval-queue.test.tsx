/**
 * The approvals queue shows what the server sent and reports a decision only once it is recorded.
 *
 * Home's Approvals tab used to list three invented requests and mark one "Approved" the moment the
 * button was pressed, with nothing sent anywhere. These pin the replacement: items come from the
 * inbox, a decision goes through the inbox's API call, and a refused decision stays visible.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { ApprovalQueue } from './approval-queue';

const leave: ApprovalInboxItem = {
  id: 'leave-1',
  domain: 'LEAVE',
  employeeId: 'employee-1',
  requester: null,
  title: 'Leave request',
  detail: '2026-09-21 to 2026-09-22 · Family function',
  submittedAt: '2026-09-14T09:00:00.000Z',
};

function inbox(overrides: Partial<ApprovalInboxState> = {}): ApprovalInboxState {
  return {
    items: [leave],
    loading: false,
    error: null,
    leaveForbidden: false,
    attendanceForbidden: false,
    refetch: vi.fn().mockResolvedValue(undefined),
    saving: false,
    saveError: null,
    dismissError: vi.fn(),
    decide: vi.fn().mockResolvedValue(true),
    decideHolidayReview: vi.fn().mockResolvedValue(null),
    canDecide: () => true,
    ...overrides,
  };
}

async function rejectWith(reason: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Reason for rejection'), reason);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
}

describe('ApprovalQueue', () => {
  it('lists what the inbox returned, and nothing else', () => {
    render(<ApprovalQueue inbox={inbox()} />);
    expect(screen.getByText('Leave request')).toBeInTheDocument();
    expect(screen.getByText(/Family function/)).toBeInTheDocument();
    expect(screen.queryByText(/Mithun|Shailesh|Tejasri/)).not.toBeInTheDocument();
  });

  it('says so when nothing is waiting, rather than showing examples', () => {
    render(<ApprovalQueue inbox={inbox({ items: [] })} />);
    expect(screen.getByText('Nothing awaiting your decision')).toBeInTheDocument();
  });

  it('approves directly without asking for a comment', async () => {
    const state = inbox();
    render(<ApprovalQueue inbox={state} />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(state.decide).toHaveBeenCalledWith(leave, 'APPROVED', '');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects with a required reason', async () => {
    const state = inbox();
    render(<ApprovalQueue inbox={state} />);
    await rejectWith('Cover not arranged');

    expect(state.decide).toHaveBeenCalledWith(leave, 'REJECTED', 'Cover not arranged');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the reject dialog open when the API refuses', async () => {
    const state = inbox({ decide: vi.fn().mockResolvedValue(false) });
    render(<ApprovalQueue inbox={state} />);
    await rejectWith('Cover not arranged');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows why a decision failed', () => {
    render(<ApprovalQueue inbox={inbox({ saveError: 'You cannot approve your own request' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('You cannot approve your own request');
  });

  it('offers no buttons on an item the caller cannot decide', () => {
    render(<ApprovalQueue inbox={inbox({ canDecide: () => false })} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('You cannot decide this')).toBeInTheDocument();
  });

  it('excludes ADVANCE financial items from bulk selection', () => {
    const advanceItem: ApprovalInboxItem = {
      id: 'adv-1',
      domain: 'ADVANCE',
      employeeId: 'employee-1',
      requester: 'Asha',
      title: 'Salary Advance · ₹15,000',
      detail: 'Emergency medical expenses',
      submittedAt: '2026-09-14T09:00:00.000Z',
    };
    render(<ApprovalQueue inbox={inbox({ items: [leave, advanceItem] })} />);
    expect(screen.getByText(/Financial · Individual Review/)).toBeInTheDocument();
    // Bulk select bar should not be present when only 1 selectable non-advance item exists
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
  });

  it('keeps absent-day regularizations on the individual review path', async () => {
    const regularization: ApprovalInboxItem = {
      id: 'corr-1',
      domain: 'ATTENDANCE_CORRECTION',
      employeeId: 'employee-1',
      requester: 'Rohan Das (EMP-105)',
      title: 'Attendance regularization',
      detail: 'Check-in to 09:10 AM · Check-out to 10:20 PM · Forgot to punch',
      submittedAt: '2026-10-12T09:00:00.000Z',
      requiresIndividualReview: true,
    };
    const state = inbox({ items: [regularization] });
    render(<ApprovalQueue inbox={state} />);

    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
    expect(screen.getByText(/Attendance regularization · Individual review/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(state.decide).toHaveBeenCalledWith(regularization, 'APPROVED', '');
  });
});
