'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Button, Progress, Sheet, SheetContent, SheetTitle } from '@smarteam/ui';
import type { ProjectDirectoryState } from '../../hooks/use-project-directory';
import type { ProjectView } from '../../services/team-directory';
import { ArchiveDialog } from '../common/archive-dialog';
import { AssignProjectMemberModal } from './assign-project-member-modal';
import { totalAllocation } from './project-views';

/**
 * One project's allocations, written straight to the API.
 *
 * Removing someone ends the allocation with today's date; the row is kept so past capacity
 * remains reportable.
 */
export function ProjectDetailDrawer({
  view,
  onClose,
  directory,
}: {
  view: ProjectView;
  onClose: () => void;
  directory: ProjectDirectoryState;
}) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const candidates = useMemo(() => {
    const allocated = new Set(view.activeMembers.map((member) => member.employeeId));
    return directory.employees.filter((employee) => !allocated.has(employee.id));
  }, [directory.employees, view.activeMembers]);

  const total = totalAllocation(view);

  return (
    <>
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent className="max-w-md gap-0 p-0">
          <SheetTitle className="sr-only">Project details</SheetTitle>

          <div className="border-b border-border bg-muted/40 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{view.project.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {view.project.code ?? '--'} · {view.branchName ?? 'No branch'}
                </p>
              </div>
              <Badge variant="outline">{view.project.status ?? 'UNKNOWN'}</Badge>
            </div>
            {view.project.description && (
              <p className="mt-2 text-xs text-muted-foreground">{view.project.description}</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {view.project.startDate
                ? `From ${view.project.startDate.slice(0, 10)}`
                : 'No start date'}
              {view.project.endDate ? ` to ${view.project.endDate.slice(0, 10)}` : ''}
            </p>
          </div>

          {directory.canWrite && (
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Button
                className="flex-1"
                disabled={directory.saving}
                onClick={() => setIsAssignOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Allocate someone
              </Button>
              <Button
                disabled={directory.saving}
                onClick={() => setIsArchiveOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Archive
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {directory.saveError && (
              <p className="text-xs font-semibold text-destructive" role="alert">
                {directory.saveError}
              </p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Total allocated capacity</span>
                <span className="font-mono font-bold text-foreground">{total}%</span>
              </div>
              <Progress aria-label={`Total allocation ${total}%`} value={Math.min(total, 100)} />
            </div>

            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Allocated ({view.activeMembers.length})
              </span>
              {view.activeMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody is allocated to this project.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {view.activeMembers.map((member) => (
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
                          {member.projectRole ?? 'Role not recorded'} · since{' '}
                          {member.since.slice(0, 10)}
                        </span>
                      </span>
                      <span className="font-mono text-xs font-bold text-primary">
                        {member.allocationPercentage === null
                          ? '--'
                          : `${member.allocationPercentage}%`}
                      </span>
                      {directory.canWrite && (
                        <Button
                          disabled={directory.saving}
                          onClick={() => void directory.endMember(view.project.id, member.memberId)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          End
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {view.pastMembers.length > 0 && (
              <div className="border-t border-border pt-3">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Past allocations
                </span>
                <div className="space-y-1.5">
                  {view.pastMembers.map((member) => (
                    <div
                      className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 opacity-70"
                      key={member.memberId}
                    >
                      <span className="truncate text-xs text-muted-foreground">
                        {member.displayName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Ended {member.until?.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AssignProjectMemberModal
        candidates={candidates}
        isOpen={isAssignOpen}
        onAssign={(member) => directory.addMember(view.project.id, member)}
        onClose={() => setIsAssignOpen(false)}
        projectName={view.project.name}
        saveError={directory.saveError}
        saving={directory.saving}
      />

      <ArchiveDialog
        isOpen={isArchiveOpen}
        onArchive={(reason) => directory.archiveProject(view.project.id, reason)}
        onClose={() => setIsArchiveOpen(false)}
        saveError={directory.saveError}
        saving={directory.saving}
        subject={`project ${view.project.name}`}
      />
    </>
  );
}
