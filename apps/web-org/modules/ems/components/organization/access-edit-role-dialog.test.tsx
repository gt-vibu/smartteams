/**
 * Turning individual permissions on and off for a role.
 *
 * These pin what the administrator sees: the role's current permissions checked, a change sent as
 * the complete new set with an audit description, nothing sent until something changed, and a
 * permission the signed-in user does not hold shown but not toggleable.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleWithPermissions } from '@smarteam/contracts';
import { AccessEditRoleDialog } from './access-edit-role-dialog';

const manager = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  code: 'MANAGER',
  name: 'Manager',
  description: null,
  scope: 'ORGANIZATION',
  branchId: null,
  isSystem: true,
  permissions: [
    { permission: { key: 'attendance.read' } },
    { permission: { key: 'leave.requests.decide' } },
  ],
} as RoleWithPermissions;

function renderDialog(ownPermissions: string[], onSave = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn();
  render(
    <AccessEditRoleDialog
      onClose={onClose}
      onSave={onSave}
      ownPermissions={ownPermissions}
      role={manager}
      saveError={null}
      saving={false}
    />,
  );
  return { onSave, onClose };
}

describe('editing a role’s permissions', () => {
  it('starts from what the role has now', () => {
    renderDialog(['*']);
    expect(screen.getByRole('checkbox', { name: 'Approve leave requests' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'View everyone’s attendance' })).not.toBeChecked();
    expect(screen.queryByText('attendance.read')).not.toBeInTheDocument();
    expect(screen.queryByText('leave.requests.decide')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled();
  });

  it('sends the whole new set without asking for a comment, then closes', async () => {
    const { onSave, onClose } = renderDialog(['*']);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'View everyone’s attendance' }));
    await user.click(screen.getByRole('checkbox', { name: 'Approve leave requests' }));
    expect(screen.getByText('1 turned on · 1 turned off')).toBeInTheDocument();

    expect(screen.queryByLabelText('Reason for the change')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save permissions' }));

    expect(onSave).toHaveBeenCalledWith(manager.id, {
      permissionKeys: expect.arrayContaining(['attendance.read', 'attendance.read.all']) as unknown,
      reason: 'Role permissions updated',
    });
    const sent = (onSave.mock.calls[0] as [string, { permissionKeys: string[] }])[1].permissionKeys;
    expect(sent).not.toContain('leave.requests.decide');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a permission the user does not hold, but will not toggle it', () => {
    renderDialog(['rbac.write', 'attendance.read', 'leave.requests.decide']);
    expect(screen.getByRole('checkbox', { name: 'View everyone’s attendance' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Approve leave requests' })).not.toBeDisabled();
  });
});
