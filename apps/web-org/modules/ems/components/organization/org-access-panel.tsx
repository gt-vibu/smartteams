'use client';

import React, { useState } from 'react';
import type { OrganizationMember, RoleWithPermissions } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useAccessControl } from '../../hooks/use-access-control';
import { Unavailable } from './org-profile-panel';
import { AccessAddMemberDialog } from './access-add-member-dialog';
import { AccessCreateRoleDialog } from './access-create-role-dialog';
import { AccessManageDrawer } from './access-manage-drawer';
import { AccessSelfEnrollDialog } from './access-self-enroll-dialog';
import { useSession } from '../../hooks/auth-context';

/**
 * Organization access control: who has which roles, and what each role actually grants.
 *
 * Every list, grant and revoke here goes through routes that already enforced their own
 * authorization before this screen existed — `RbacAdminService` and `MembersService`. This is a
 * view onto that, not a second permission system: what an administrator can do here is exactly
 * what the API lets their own token do, checked server-side on every action.
 */
export function OrgAccessPanel() {
  const access = useAccessControl();
  const [view, setView] = useState<'people' | 'roles'>('people');
  const [managing, setManaging] = useState<OrganizationMember | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [enrollingSelf, setEnrollingSelf] = useState(false);
  const { persona } = useSession();

  if (!access.canReadMembers && !access.canReadRoles) {
    return (
      <Unavailable
        detail="You do not have permission to view organization access."
        title="Not available"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
          <Button
            className={`h-auto rounded-md px-3 py-1.5 text-xs font-semibold ${
              view === 'people'
                ? 'bg-card text-foreground shadow-2xs'
                : 'bg-card/50 text-foreground/75 hover:bg-card hover:text-foreground'
            }`}
            onClick={() => setView('people')}
            size="sm"
            type="button"
            variant="ghost"
          >
            People{access.members.length ? ` (${access.members.length})` : ''}
          </Button>
          <Button
            className={`h-auto rounded-md px-3 py-1.5 text-xs font-semibold ${
              view === 'roles'
                ? 'bg-card text-foreground shadow-2xs'
                : 'bg-card/50 text-foreground/75 hover:bg-card hover:text-foreground'
            }`}
            onClick={() => setView('roles')}
            size="sm"
            type="button"
            variant="ghost"
          >
            Roles{access.roles.length ? ` (${access.roles.length})` : ''}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {view === 'people' && access.canEnrollSelf && (
            <Button
              onClick={() => setEnrollingSelf(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Add myself as employee
            </Button>
          )}
          {view === 'people' && access.canAddMembers && (
            <Button onClick={() => setAddingMember(true)} size="sm" type="button">
              Add member
            </Button>
          )}
          {view === 'roles' && access.canManageAccess && (
            <Button onClick={() => setCreatingRole(true)} size="sm" type="button">
              Create role
            </Button>
          )}
        </div>
      </div>

      {access.lastTemporaryPassword && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <div>
            <p className="font-bold text-amber-800 dark:text-amber-300">
              Temporary password &mdash; shown once
            </p>
            <p className="mt-0.5 font-mono text-amber-900 dark:text-amber-200">
              {access.lastTemporaryPassword}
            </p>
          </div>
          <Button
            className="h-auto px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300"
            onClick={access.clearTemporaryPassword}
            size="sm"
            type="button"
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      )}

      {access.error && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
          role="alert"
        >
          {access.error}
        </p>
      )}

      {access.loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground" role="status">
          Loading...
        </p>
      ) : view === 'people' ? (
        <PeopleTable
          canManage={access.canManageAccess}
          canRead={access.canReadMembers}
          members={access.members}
          onManage={setManaging}
        />
      ) : (
        <RolesTable canRead={access.canReadRoles} roles={access.roles} />
      )}

      <AccessManageDrawer
        canManage={access.canManageAccess}
        isOpen={managing !== null}
        member={managing}
        onAssign={access.assignRole}
        onClose={() => setManaging(null)}
        onRevoke={access.revokeRole}
        roles={access.roles}
        saveError={access.saveError}
        saving={access.saving}
      />
      <AccessAddMemberDialog
        isOpen={addingMember}
        onAdd={access.addMember}
        onClose={() => setAddingMember(false)}
        roles={access.roles}
        saveError={access.saveError}
        saving={access.saving}
      />
      <AccessSelfEnrollDialog
        displayName={persona?.name ?? ''}
        isOpen={enrollingSelf}
        onClose={() => setEnrollingSelf(false)}
        onEnroll={access.enrollSelfAsEmployee}
        saveError={access.saveError}
        saving={access.saving}
      />
      <AccessCreateRoleDialog
        isOpen={creatingRole}
        onClose={() => setCreatingRole(false)}
        onCreate={access.createRole}
        saveError={access.saveError}
        saving={access.saving}
      />
    </div>
  );
}

function PeopleTable({
  canManage,
  canRead,
  members,
  onManage,
}: {
  canManage: boolean;
  canRead: boolean;
  members: OrganizationMember[];
  onManage: (member: OrganizationMember) => void;
}) {
  if (!canRead)
    return (
      <Unavailable
        detail="You do not have permission to view the member list."
        title="Not available"
      />
    );
  if (members.length === 0)
    return <Unavailable detail="No active members yet." title="Nobody here yet" />;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-table-header text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-bold">Member</th>
              <th className="px-4 py-2.5 font-bold">Roles</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                key={member.userId}
              >
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-foreground">{member.displayName}</div>
                  <div className="text-[11px] text-muted-foreground">{member.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  {member.roles.length === 0 ? (
                    <span className="text-muted-foreground">No roles</span>
                  ) : (
                    <span className="text-foreground">
                      {member.roles.map((role) => role.name).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      member.isActive
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {member.isActive ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canManage && (
                    <Button
                      className="h-auto px-2 py-1 text-[11px]"
                      onClick={() => onManage(member)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Manage access
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolesTable({ canRead, roles }: { canRead: boolean; roles: RoleWithPermissions[] }) {
  if (!canRead)
    return <Unavailable detail="You do not have permission to view roles." title="Not available" />;
  if (roles.length === 0)
    return <Unavailable detail="No roles exist yet." title="Nothing here yet" />;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {roles.map((role) => (
        <section className="rounded-xl border border-border bg-card p-4" key={role.id}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-foreground">{role.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                role.isSystem
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
              }`}
            >
              {role.isSystem ? 'System' : 'Custom'}
            </span>
          </div>
          {role.description && (
            <p className="mt-1 text-[11px] text-muted-foreground">{role.description}</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
          </p>
        </section>
      ))}
    </div>
  );
}
