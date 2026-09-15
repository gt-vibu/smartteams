/**
 * The approvals queue shows what the server sent and reports a decision only once it is recorded.
 *
 * Home's Approvals tab used to list three invented requests and mark one "Approved" the moment the
 * button was pressed, with nothing sent anywhere. These pin the replacement: items come from the
 * inbox, a decision goes through the inbox's API call, and a refused decision stays visible.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { ApprovalQueue } from './approval-queue';

const leave: ApprovalInboxItem = {
  id: 'leave-1',
  domain: 'LEAVE',
  employeeId: 'employee-1',
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

async function approveWith(comment: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Comment'), comment);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
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

  it('sends the decision to the API with the comment', async () => {
    const state = inbox();
    render(<ApprovalQueue inbox={state} />);
    await approveWith('Cover arranged');

    expect(state.decide).toHaveBeenCalledWith(leave, 'APPROVED', 'Cover arranged');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and claims nothing when the API refuses', async () => {
    const state = inbox({ decide: vi.fn().mockResolvedValue(false) });
    render(<ApprovalQueue inbox={state} />);
    await approveWith('Cover arranged');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText(/✓ Approved/)).not.toBeInTheDocument();
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
});
