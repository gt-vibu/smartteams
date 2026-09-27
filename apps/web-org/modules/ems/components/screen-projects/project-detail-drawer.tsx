'use client';

import React, { useState } from 'react';
import { Badge, Button, Sheet, SheetContent, SheetTitle } from '@smarteam/ui';
import type { ProjectDirectoryState } from '../../hooks/use-project-directory';
import type { ProjectView } from '../../services/team-directory';
import { ArchiveDialog } from '../common/archive-dialog';
import { AddMembersDialog } from '../common/add-members-dialog';
import { MembersSection } from '../common/members-section';
import { EditProjectDialog } from './edit-project-dialog';
import { LeadSection } from '../common/lead-section';
import { GroupFilesSection } from '../common/group-files-section';
import { useSession } from '../../hooks/auth-context';
import { employeeDisplayName, hasPermission, type Employee, formatDate } from '@smarteam/contracts';

const nameOf = (employees: readonly Employee[], id: string) => {
  const employee = employees.find((entry) => entry.id === id);
  return employee ? employeeDisplayName(employee) : 'Someone';
};

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
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { persona, session } = useSession();
  const canViewEmployee = hasPermission(persona?.permissions ?? [], 'employees.read.all');

  return (
    <>
      <Sheet onOpenChange={(open) => !open && onClose()} open>
        <SheetContent className="max-w-md gap-0 p-0">
          <SheetTitle className="sr-only">Project details</SheetTitle>

          <div className="border-b border-border bg-muted/40 p-5 pr-14">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-foreground">{view.project.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground mt-0.5">
                  {[view.project.code, view.branchName].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Badge
                variant={view.project.status === 'ACTIVE' ? 'outline' : 'secondary'}
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${
                  view.project.status === 'ACTIVE'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : ''
                }`}
              >
                {view.project.status ?? 'UNKNOWN'}
              </Badge>
            </div>
            {view.project.description && (
              <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
                {view.project.description}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {view.project.startDate
                ? `From ${formatDate(view.project.startDate)}`
                : 'No start date'}
              {view.project.endDate ? ` to ${formatDate(view.project.endDate)}` : ''}
            </p>
          </div>

          {directory.canWrite && (
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
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

            <LeadSection
              busy={directory.saving}
              canWrite={directory.canWrite && view.project.status !== 'ARCHIVED'}
              employees={directory.employees}
              onSave={(employeeId) =>
                directory.updateProject(view.project.id, { projectLeadEmployeeId: employeeId })
              }
              kind="project"
              lead={view.lead}
            />

            <MembersSection
              busy={directory.saving}
              canViewEmployee={canViewEmployee}
              canWrite={directory.canWrite && view.project.status !== 'ARCHIVED'}
              leadEmployeeId={view.lead?.employeeId}
              members={view.activeMembers}
              onAdd={() => setIsAssignOpen(true)}
              onChangeRole={(memberId, role) =>
                directory.changeRole(view.project.id, memberId, role)
              }
              onEnd={(memberId) => directory.endMember(view.project.id, memberId)}
              pastMembers={view.pastMembers}
              roleKind="project-roles"
            />

            <GroupFilesSection
              canUpload={
                view.project.status !== 'ARCHIVED' &&
                (hasPermission(persona?.permissions ?? [], 'files.organization.manage') ||
                  view.lead?.employeeId === session?.employeeId ||
                  view.activeMembers.some((member) => member.employeeId === session?.employeeId))
              }
              groupId={view.project.id}
              kind="project"
            />
          </div>
        </SheetContent>
      </Sheet>

      <AddMembersDialog
        employees={directory.employees}
        excludeIds={[
          ...view.activeMembers.map((member) => member.employeeId),
          ...(view.lead ? [view.lead.employeeId] : []),
        ]}
        nameOf={(id) => nameOf(directory.employees, id)}
        onAdd={(employeeId, projectRole) =>
          directory.addMember(view.project.id, {
            employeeId,
            ...(projectRole ? { projectRole } : {}),
          })
        }
        onClose={() => setIsAssignOpen(false)}
        open={isAssignOpen}
        roleKind="project-roles"
        roleLabel="Project role"
        title={`Add members to ${view.project.name}`}
      />

      <EditProjectDialog
        branches={directory.branches}
        onClose={() => setIsEditOpen(false)}
        onSave={(input) => directory.updateProject(view.project.id, input)}
        open={isEditOpen}
        otherNames={directory.projects
          .filter((entry) => entry.project.id !== view.project.id)
          .map((entry) => entry.project.name)}
        project={view.project}
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
