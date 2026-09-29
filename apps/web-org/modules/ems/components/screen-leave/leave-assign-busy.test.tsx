/**
 * Assigning one leave type must not freeze the rest of the screen.
 *
 * One shared `saving` flag disabled every control on the leave admin screen while a single action
 * ran, so pressing Assign on one type greyed out every other type, every balance and every request
 * until the lists reloaded — which read as the whole website refreshing. Each control now waits on
 * its own action only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { LeaveType } from '@smarteam/contracts';

const repository = vi.hoisted(() => ({
  listTypes: vi.fn(),
  listRequests: vi.fn(),
  requestInbox: vi.fn(),
  listBalances: vi.fn(),
  assignTypeToBranch: vi.fn(),
  decide: vi.fn(),
  createType: vi.fn(),
  adjustBalance: vi.fn(),
}));
vi.mock('../../repositories/leave.repository', () => ({ leaveRepository: repository }));
vi.mock('../../repositories/workforce.repository', () => ({
  workforceRepository: { listEmployees: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../hooks/auth-context', () => ({
  useSession: () => ({
    session: { organizationId: 'org-1' },
    persona: { permissions: ['leave.types.read', 'leave.types.write', 'leave.requests.read'] },
  }),
}));

const { useLeaveAdmin, leaveAdminBusyKey } = await import('../../hooks/use-leave-admin');
const { LeavePolicyPanel } = await import('./leave-policy-panel');

const type = (code: string, name: string) =>
  ({
    id: `type-${code}`,
    code,
    name,
    paid: true,
    accrualType: 'FIXED_ANNUAL',
    annualAllowance: 12,
  }) as unknown as LeaveType;

afterEach(() => {
  vi.clearAllMocks();
});

describe('the leave admin busy state', () => {
  it('marks only the action in flight as busy', async () => {
    repository.listTypes.mockResolvedValue([type('CASUAL', 'Casual Leave')]);
    repository.listRequests.mockResolvedValue([]);
    let finish: (value: unknown) => void = () => undefined;
    repository.assignTypeToBranch.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useLeaveAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let assigning: Promise<boolean> | undefined;
    act(() => {
      assigning = result.current.assignType('CASUAL', 'branch-1');
    });
    await waitFor(() =>
      expect(result.current.isBusy(leaveAdminBusyKey.assign('CASUAL'))).toBe(true),
    );
    // Nothing else is waiting: another type, the create form, a decision.
    expect(result.current.isBusy(leaveAdminBusyKey.assign('EARNED'))).toBe(false);
    expect(result.current.isBusy(leaveAdminBusyKey.createType)).toBe(false);
    expect(result.current.isBusy(leaveAdminBusyKey.decide('request-1'))).toBe(false);

    await act(async () => {
      finish({});
      await assigning;
    });
    expect(result.current.isBusy(leaveAdminBusyKey.assign('CASUAL'))).toBe(false);
    // The screen keeps its data while the lists reload; nothing is replaced by a loading state.
    expect(result.current.loading).toBe(false);
  });
});

describe('the leave types panel while one type is assigning', () => {
  it('changes only that type’s button', () => {
    const admin = {
      types: [type('CASUAL', 'Casual Leave'), type('EARNED', 'Earned Leave')],
      canWriteTypes: true,
      saving: true,
      isBusy: (key: string) => key === leaveAdminBusyKey.assign('CASUAL'),
      createType: vi.fn(),
      assignType: vi.fn(),
    } as unknown as Parameters<typeof LeavePolicyPanel>[0]['admin'];
    render(
      <LeavePolicyPanel
        admin={admin}
        branches={[{ id: 'branch-1', name: 'Headquarters' } as never]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Assigning…' })).toBeDisabled();
    // The other type is untouched: its branch picker still works, and its button still says Assign.
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Branch for Earned Leave' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add leave type' })).not.toBeDisabled();
  });
});
