'use client';

import React, { useState } from 'react';
import { employeeDisplayName, hasPermission } from '@smarteam/contracts';
import { Button, Sheet, SheetContent, SheetTitle } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { AddMembersDialog } from '../common/add-members-dialog';
import { MembersSection } from '../common/members-section';
import type { TeamDirectoryState } from '../../hooks/use-team-directory';
import type { TeamView } from '../../services/team-directory';
import { ArchiveDialog } from '../common/archive-dialog';
import { EditTeamDialog } from './edit-team-dialog';

/**
 * One team's roster, with membership changes written straight to the API.
 *
 * Removing a member ends the membership — the row is kept with a leave date. The previous
 * version spliced the member out of a localStorage array, which destroyed the record of them
 * ever having been on the team.
 */
export function TeamDetailDrawer({
  team,
  onClose,
  directory,
}: {
  team: TeamView;
  onClose: () => void;
  directory: TeamDirectoryState;
}) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { persona } = useSession();
  const canViewEmployee = hasPermission(persona?.permissions ?? [], 'employees.read.all');

  return (
    <>
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent className="max-w-md gap-0 p-0">
          <SheetTitle className="sr-only">Team details</SheetTitle>

          <div className="border-b border-border bg-muted/40 p-5 pr-14">
            <p className="text-sm font-bold text-foreground">{team.team.name}</p>
            <p className="text-xs text-muted-foreground">{team.branchName ?? 'No branch'}</p>
            {team.team.description && (
              <p className="mt-2 text-xs text-muted-foreground">{team.team.description}</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {team.lead ? (
                <>
                  Lead:{' '}
                  <span className="font-semibold text-foreground">{team.lead.displayName}</span>
                </>
              ) : (
                'No team lead assigned.'
              )}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {directory.saveError && (
              <p className="text-xs font-semibold text-destructive" role="alert">
                {directory.saveError}
              </p>
            )}

            {directory.canWrite && (
              <div className="flex justify-end gap-2">
                <Button
                  disabled={directory.saving}
                  onClick={() => setIsEditOpen(true)}
                  size="sm"
                  type="button"
                >
                  Edit details
                </Button>
                <Button
                  disabled={directory.saving}
                  onClick={() => setIsArchiveOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Archive team
                </Button>
              </div>
            )}

            <MembersSection
              busy={directory.saving}
              canViewEmployee={canViewEmployee}
              canWrite={directory.canWrite && team.team.status !== 'ARCHIVED'}
              members={team.activeMembers}
              onAdd={() => setIsAddOpen(true)}
              onChangeRole={(memberId, role) => directory.changeRole(team.team.id, memberId, role)}
              onEnd={(memberId) => directory.endMember(team.team.id, memberId)}
              pastMembers={team.pastMembers}
              roleKind="team-roles"
            />
          </div>
        </SheetContent>
      </Sheet>

      <AddMembersDialog
        employees={directory.employees}
        excludeIds={team.activeMembers.map((member) => member.employeeId)}
        nameOf={(id) => {
          const employee = directory.employees.find((entry) => entry.id === id);
          return employee ? employeeDisplayName(employee) : 'Someone';
        }}
        onAdd={(employeeId, teamRole) => directory.addMember(team.team.id, employeeId, teamRole)}
        onClose={() => setIsAddOpen(false)}
        open={isAddOpen}
        roleKind="team-roles"
        roleLabel="Team role"
        title={`Add members to ${team.team.name}`}
      />

      <EditTeamDialog
        branches={directory.branches}
        employees={directory.employees}
        onClose={() => setIsEditOpen(false)}
        onSave={(input) => directory.updateTeam(team.team.id, input)}
        open={isEditOpen}
        otherNames={directory.teams
          .filter((entry) => entry.team.id !== team.team.id)
          .map((entry) => entry.team.name)}
        saveError={directory.saveError}
        saving={directory.saving}
        team={team.team}
      />

      <ArchiveDialog
        isOpen={isArchiveOpen}
        onArchive={(reason) => directory.archiveTeam(team.team.id, reason)}
        onClose={() => setIsArchiveOpen(false)}
        saveError={directory.saveError}
        saving={directory.saving}
        subject={`team ${team.team.name}`}
      />
    </>
  );
}
