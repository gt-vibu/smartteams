/**
 * The Shifts screen's "People" dialog: who is on a shift, and ending an assignment.
 *
 * Assignments could be created but not seen or ended, so nobody could move an employee to another
 * shift. These pin that the list is the server's, that ending one sends the chosen last day and a
 * reason, and that a refusal stays on screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Shift, ShiftAssignment } from '@smarteam/contracts';

const repository = vi.hoisted(() => ({
  assignments: vi.fn(),
  endAssignment: vi.fn(),
}));
vi.mock('../../repositories/shifts.repository', () => ({ shiftsRepository: repository }));
vi.mock('../../hooks/auth-context', () => ({
  useSession: () => ({ session: { organizationId: 'org-1' } }),
}));

const { ShiftAssignmentsDialog } = await import('./shift-assignments-dialog');

const shift = { id: 'shift-1', name: 'General', code: 'GEN' } as Shift;
const ada: ShiftAssignment = {
  id: '00000000-0000-4000-8000-000000000001',
  employee: {
    id: '00000000-0000-4000-8000-000000000002',
    firstName: 'Ada',
    lastName: 'Case',
    employeeNumber: 'EMP-001',
  },
  shift: { id: '00000000-0000-4000-8000-000000000003', name: 'General', code: 'GEN' },
  startsOn: '2026-09-01',
  endsOn: null,
  state: 'CURRENT',
};

beforeEach(() => {
  // Only the clock is fixed, so the date picker opens on September 2026; timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0));
  repository.assignments.mockReset().mockResolvedValue({ items: [ada], nextCursor: null });
  repository.endAssignment.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
});

/** Opens the End form, picks the 20th as the last day and types a reason. */
async function fillEndForm(reason: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'End' }));
  await user.click(screen.getByLabelText('Last day on shift'));
  await user.click(screen.getByRole('button', { name: '20' }));
  await user.type(screen.getByLabelText('Reason'), reason);
  return user;
}

describe('People on a shift', () => {
  it("lists the server's assignments for the shift", async () => {
    render(<ShiftAssignmentsDialog canWrite onOpenChange={vi.fn()} shift={shift} />);
    expect(await screen.findByText('Ada Case')).toBeInTheDocument();
    expect(screen.getByText('2026-09-01 → open-ended')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(repository.assignments).toHaveBeenCalledWith('org-1', {
      shiftId: 'shift-1',
      includeEnded: false,
    });
  });

  it('asks for ended assignments only when "Show ended" is ticked', async () => {
    render(<ShiftAssignmentsDialog canWrite onOpenChange={vi.fn()} shift={shift} />);
    await screen.findByText('Ada Case');
    await userEvent.setup().click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(repository.assignments).toHaveBeenLastCalledWith('org-1', {
        shiftId: 'shift-1',
        includeEnded: true,
      }),
    );
  });

  it('ends an assignment on the chosen last day with a reason, then re-reads the list', async () => {
    render(<ShiftAssignmentsDialog canWrite onOpenChange={vi.fn()} shift={shift} />);
    await screen.findByText('Ada Case');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'End' }));
    // Nothing is prefilled: the last day is the administrator's call.
    const endButton = screen.getByRole('button', { name: 'End assignment' });
    expect(endButton).toBeDisabled();
    await user.click(screen.getByLabelText('Last day on shift'));
    await user.click(screen.getByRole('button', { name: '20' }));
    expect(endButton).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Moving to the night shift');
    await user.click(endButton);
    expect(repository.endAssignment).toHaveBeenCalledWith('org-1', ada.id, {
      endsOn: '2026-09-20',
      reason: 'Moving to the night shift',
    });
    // The list is read again from the server rather than edited in place.
    await waitFor(() => expect(repository.assignments).toHaveBeenCalledTimes(2));
  });

  it('shows the API’s refusal and keeps the form open', async () => {
    repository.endAssignment.mockRejectedValue(new Error('It can only be ended earlier'));
    render(<ShiftAssignmentsDialog canWrite onOpenChange={vi.fn()} shift={shift} />);
    await screen.findByText('Ada Case');
    const user = await fillEndForm('Moving to the night shift');
    await user.click(screen.getByRole('button', { name: 'End assignment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('It can only be ended earlier');
    expect(screen.getByRole('button', { name: 'End assignment' })).toBeInTheDocument();
  });

  it('offers no End action without permission to change shifts', async () => {
    render(<ShiftAssignmentsDialog canWrite={false} onOpenChange={vi.fn()} shift={shift} />);
    await screen.findByText('Ada Case');
    expect(screen.queryByRole('button', { name: 'End' })).not.toBeInTheDocument();
  });

  it('says so when nobody is on the shift', async () => {
    repository.assignments.mockResolvedValue({ items: [], nextCursor: null });
    render(<ShiftAssignmentsDialog canWrite onOpenChange={vi.fn()} shift={shift} />);
    expect(await screen.findByText('Nobody is on this shift now or later.')).toBeInTheDocument();
  });
});
