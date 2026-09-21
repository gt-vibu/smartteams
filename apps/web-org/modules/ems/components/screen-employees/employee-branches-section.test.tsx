import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BranchMembership } from '@smarteam/contracts';
import type { BranchMembershipsState } from '../../hooks/use-branch-memberships';

const cancel = vi.fn().mockResolvedValue(true);
let state: Partial<BranchMembershipsState> = {};
vi.mock('../../hooks/use-branch-memberships', () => ({
  useBranchMemberships: () => state,
}));

const { EmployeeBranchesSection } = await import('./employee-branches-section');

const row = (overrides: Partial<BranchMembership>): BranchMembership => ({
  id: crypto.randomUUID(),
  branchId: crypto.randomUUID(),
  branchName: 'Koramangala',
  branchCode: 'KOR',
  relationship: 'PRIMARY',
  startsOn: '2026-01-05',
  endsOn: null,
  state: 'ACTIVE',
  ...overrides,
});

function show(rows: BranchMembership[], readOnly = false) {
  state = {
    canRead: true,
    canWrite: true,
    loading: false,
    loadError: null,
    rows,
    branches: [],
    busy: false,
    error: null,
    clearError: vi.fn(),
    cancel,
  };
  render(<EmployeeBranchesSection employeeId="e1" readOnly={readOnly} />);
}

describe('EmployeeBranchesSection', () => {
  it('shows the primary and the additional branches apart', () => {
    show([
      row({}),
      row({ branchName: 'Whitefield', relationship: 'ADDITIONAL', startsOn: '2026-09-01' }),
    ]);
    expect(screen.getByText('Koramangala')).toBeTruthy();
    expect(screen.getByText('Primary')).toBeTruthy();
    expect(screen.getByText('Whitefield')).toBeTruthy();
    expect(screen.getByText('Additional')).toBeTruthy();
  });

  it('offers no second transfer while one is scheduled, and can cancel it', async () => {
    const scheduled = row({ branchName: 'Mysuru', startsOn: '2026-10-01', state: 'UPCOMING' });
    show([row({ endsOn: '2026-09-30' }), scheduled]);
    expect(screen.queryByRole('button', { name: 'Transfer primary' })).toBeNull();
    expect(screen.getByText('Moves here on 2026-10-01')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel transfer' }));
    expect(cancel).toHaveBeenCalledWith(scheduled.id);
  });

  it('keeps past branches as history rather than dropping them', async () => {
    show([
      row({ branchName: 'Mysuru', startsOn: '2026-09-21' }),
      row({ endsOn: '2026-09-20', state: 'ENDED' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: /branch history \(1\)/i }));
    expect(screen.getByText('Koramangala')).toBeTruthy();
    expect(screen.getByText(/2026-01-05 – 2026-09-20/)).toBeTruthy();
  });

  it('offers no changes for someone who has left', () => {
    show([row({})], true);
    expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transfer primary' })).toBeNull();
  });
});
