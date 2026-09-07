'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  type OrganizationMember,
  type RoleWithPermissions,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import { accessControlRepository } from '../repositories/access-control.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

type Loaded = { members: OrganizationMember[]; roles: RoleWithPermissions[] };

/**
 * Organization access control: who has which roles, and what those roles actually grant.
 *
 * `rbac.read` gates roles, `members.read` gates the member list — the same split the API
 * enforces, so a caller who can see roles but not the member list (or the reverse) gets exactly
 * that rather than an all-or-nothing screen.
 */
export function useAccessControl() {
  const { session, persona, refreshSession } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  // The signed-in user's own id, for self-enrollment. Never read from a form.
  const currentUserId = persona?.id ?? null;
  const hasEmployeeIdentity = Boolean(session?.employeeId);

  const canReadMembers = hasPermission(permissions, 'members.read');
  const canReadRoles = hasPermission(permissions, 'rbac.read');
  const canManageAccess = hasPermission(permissions, 'rbac.write');
  const canAddMembers = hasPermission(permissions, 'members.write');

  const resource = useAsyncResource<Loaded>(
    async () => {
      const [members, roles] = await Promise.all([
        canReadMembers ? accessControlRepository.listMembers(organizationId!) : Promise.resolve([]),
        canReadRoles ? accessControlRepository.listRoles(organizationId!) : Promise.resolve([]),
      ]);
      return { members, roles };
    },
    [organizationId, canReadMembers, canReadRoles],
    { enabled: Boolean(organizationId) && (canReadMembers || canReadRoles) },
  );

  const { saving, saveError, run } = useMutationRunner(resource.refetch);

  const createRole = useCallback(
    (input: { code: string; name: string; permissionKeys: string[] }) =>
      run(
        () => accessControlRepository.createRole(organizationId!, input),
        'The role could not be created.',
      ),
    [organizationId, run],
  );

  const assignRole = useCallback(
    (userId: string, roleId: string) =>
      run(
        () => accessControlRepository.assignRole(organizationId!, userId, roleId),
        'The role could not be assigned.',
      ),
    [organizationId, run],
  );

  const revokeRole = useCallback(
    (userRoleId: string) =>
      run(
        () => accessControlRepository.revokeRole(organizationId!, userRoleId),
        'The role could not be removed.',
      ),
    [organizationId, run],
  );

  // Shown once, on the response that actually created a login — never re-derivable afterward,
  // so it lives here rather than being refetched or reconstructed.
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<string | null>(null);

  const addMember = useCallback(
    (input: { email: string; displayName: string; roleIds: string[]; reason: string }) =>
      run(async () => {
        const result = await accessControlRepository.addMember(organizationId!, input);
        setLastTemporaryPassword(result.temporaryPassword);
      }, 'The member could not be added.'),
    [organizationId, run],
  );

  /**
   * Creates an employee record for the signed-in administrator and links it to their existing
   * account — one identity, not a second login. The session is re-read afterwards so the employee
   * link, and with it the Employee Workspace, appears without a page reload.
   */
  const enrollSelfAsEmployee = useCallback(
    (input: {
      employeeNumber: string;
      firstName: string;
      lastName: string;
      employmentType: string;
      workEmail?: string;
      dateOfJoining?: string;
    }) =>
      run(async () => {
        await accessControlRepository.enrollSelfAsEmployee(organizationId!, currentUserId!, input);
        await refreshSession();
      }, 'You could not be added as an employee.'),
    [organizationId, currentUserId, refreshSession, run],
  );

  return {
    members: resource.data?.members ?? [],
    roles: resource.data?.roles ?? [],
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    forbidden: resource.forbidden,
    canReadMembers,
    canReadRoles,
    canManageAccess,
    canAddMembers,
    saving,
    saveError,
    createRole,
    assignRole,
    revokeRole,
    addMember,
    enrollSelfAsEmployee,
    hasEmployeeIdentity,
    canEnrollSelf: hasPermission(permissions, 'employees.write') && !hasEmployeeIdentity,
    lastTemporaryPassword,
    clearTemporaryPassword: () => setLastTemporaryPassword(null),
  };
}

export type AccessControlState = ReturnType<typeof useAccessControl>;
