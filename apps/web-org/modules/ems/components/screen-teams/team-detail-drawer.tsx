'use client';

import React, { useMemo, useState } from 'react';
import { employeeDisplayName } from '@smarteam/contracts';
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { TeamDirectoryState } from '../../hooks/use-team-directory';
import type { TeamView } from '../../services/team-directory';
import { ArchiveDialog } from '../common/archive-dialog';

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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const availableToAdd = useMemo(() => {
    const active = new Set(team.activeMembers.map((member) => member.employeeId));
    return directory.employees
      .filter((employee) => !active.has(employee.id))
      .sort((a, b) => employeeDisplayName(a).localeCompare(employeeDisplayName(b)));
  }, [directory.employees, team.activeMembers]);

  const handleAdd = async () => {
    if (!selectedEmployeeId) return;
    const added = await directory.addMember(team.team.id, selectedEmployeeId);
    if (added) setSelectedEmployeeId('');
  };

  return (
    <>
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent className="max-w-md gap-0 p-0">
          <SheetTitle className="sr-only">Team details</SheetTitle>

          <div className="border-b border-border bg-muted/40 p-5">
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
              <div className="flex justify-end">
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

            {directory.canWrite && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Add a member
                </span>
                {availableToAdd.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Every employee in the directory is already on this team.
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <SelectMenu
                      disabled={directory.saving}
                      onValueChange={setSelectedEmployeeId}
                      value={selectedEmployeeId}
                    >
                      <SelectTrigger aria-label="Employee to add">
                        <SelectValue placeholder="Select an employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableToAdd.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employeeDisplayName(employee)} · {employee.employeeNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectMenu>
                    <Button
                      disabled={!selectedEmployeeId || directory.saving}
                      onClick={() => void handleAdd()}
                      size="sm"
                      type="button"
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Members
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {team.activeMembers.length} active
                </span>
              </div>
              {team.activeMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">This team has no active members.</p>
              ) : (
                <div className="space-y-1.5">
                  {team.activeMembers.map((member) => (
                    <div
                      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                      key={member.memberId}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {member.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">
                          {member.displayName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {member.employeeNumber} · since {member.since.slice(0, 10)}
                        </span>
                      </span>
                      {team.lead?.employeeId === member.employeeId ? (
                        <Badge variant="outline">Lead</Badge>
                      ) : (
                        directory.canWrite && (
                          <Button
                            disabled={directory.saving}
                            onClick={() => void directory.endMember(team.team.id, member.memberId)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            End
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {team.pastMembers.length > 0 && (
              <div className="border-t border-border pt-3">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Former members
                </span>
                <div className="space-y-1.5">
                  {team.pastMembers.map((member) => (
                    <div
                      className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 opacity-70"
                      key={member.memberId}
                    >
                      <span className="truncate text-xs text-muted-foreground">
                        {member.displayName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Left {member.until?.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
