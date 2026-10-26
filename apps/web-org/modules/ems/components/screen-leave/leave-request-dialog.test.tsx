import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LeaveAdminState } from '../../hooks/use-leave-admin';
import { LeaveRequestDialog } from './leave-request-dialog';

const request = {
  id: 'req-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  leaveTypeId: 'type-1',
  startDate: '2026-09-21T00:00:00.000Z',
  endDate: '2026-09-23T00:00:00.000Z',
  requestedDays: 3,
  status: 'PENDING',
  reason: 'Sister’s wedding in Coimbatore',
};

const employee = {
  id: 'emp-1',
  firstName: 'Asha',
  lastName: 'Rao',
  middleName: null,
  preferredName: null,
  employeeNumber: 'EMP001',
};

const adminState = (overrides: Partial<LeaveAdminState> = {}) =>
  ({
    types: [{ id: 'type-1', code: 'PL', name: 'Paid leave', paid: true }],
    balances: [
      {
        id: 'bal-1',
        employeeId: 'emp-1',
        leaveTypeId: 'type-1',
        openingAmount: 6,
        accruedAmount: 6,
        usedAmount: 2,
        reservedAmount: 3,
        availableAmount: 7,
      },
    ],
    inbox: [{ id: 'req-1' }],
    canDecide: true,
    saveError: null,
    isBusy: () => false,
    decide: vi.fn().mockResolvedValue(true),
    ...overrides,
  }) as unknown as LeaveAdminState;

describe('LeaveRequestDialog', () => {
  it('shows who asked, the dates, the reason and the balance', () => {
    render(
      <LeaveRequestDialog
        admin={adminState()}
        employee={employee as never}
        onClose={vi.fn()}
        request={request as never}
      />,
    );
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('2026-09-21')).toBeTruthy();
    expect(screen.getByText('2026-09-23')).toBeTruthy();
    expect(screen.getByText('3 working days')).toBeTruthy();
    expect(screen.getByText('Sister’s wedding in Coimbatore')).toBeTruthy();
    expect(screen.getByText(/7 left of 12/)).toBeTruthy();
  });

  it('says so when no reason was given', () => {
    render(
      <LeaveRequestDialog
        admin={adminState()}
        employee={employee as never}
        onClose={vi.fn()}
        request={{ ...request, reason: null }}
      />,
    );
    expect(screen.getByText('No reason was given.')).toBeTruthy();
  });

  it('approves the request without requiring a comment, then closes', async () => {
    const decide = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <LeaveRequestDialog
        admin={adminState({ decide })}
        employee={employee as never}
        onClose={onClose}
        request={request as never}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(decide).toHaveBeenCalledWith('req-1', 'APPROVED', '');
    expect(onClose).toHaveBeenCalled();
  });

  it('requires a reason when rejecting', async () => {
    const decide = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <LeaveRequestDialog
        admin={adminState({ decide })}
        employee={employee as never}
        onClose={onClose}
        request={request as never}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(decide).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('A reason is required');

    await userEvent.type(screen.getByLabelText('Rejection reason'), 'Coverage conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Rejection' }));
    expect(decide).toHaveBeenCalledWith('req-1', 'REJECTED', 'Coverage conflict');
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no decision on a request awaiting someone else', () => {
    render(
      <LeaveRequestDialog
        admin={adminState({ inbox: [] })}
        employee={employee as never}
        onClose={vi.fn()}
        request={request as never}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('This request is not awaiting your decision.')).toBeTruthy();
  });
});
