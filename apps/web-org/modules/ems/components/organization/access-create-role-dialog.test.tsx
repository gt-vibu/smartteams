import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EMPLOYEE_BASELINE_PERMISSION_KEYS } from '@smarteam/contracts';
import { AccessCreateRoleDialog } from './access-create-role-dialog';

describe('creating an access profile', () => {
  it('starts with required employee self-service access and keeps it in the submitted profile', () => {
    const onCreate = vi
      .fn<(input: { code: string; name: string; permissionKeys: string[] }) => Promise<boolean>>()
      .mockResolvedValue(true);
    render(
      <AccessCreateRoleDialog
        isOpen
        onClose={vi.fn()}
        onCreate={onCreate}
        saveError={null}
        saving={false}
      />,
    );
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Time approver' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Approve leave requests' }));
    expect(screen.getByRole('checkbox', { name: 'View own employee record' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'View own employee record' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create access profile' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const submittedProfile = onCreate.mock.calls[0]?.[0];
    expect(submittedProfile?.code).toBe('TIME_APPROVER');
    expect(submittedProfile?.permissionKeys).toEqual(
      expect.arrayContaining([...EMPLOYEE_BASELINE_PERMISSION_KEYS, 'leave.requests.decide']),
    );
  }, 15_000);
});
