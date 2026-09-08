'use client';

import React, { useState } from 'react';
import { Badge, Button, Icon, Sheet, SheetContent, SheetTitle } from '@smarteam/ui';
import { useEmployeeDetail } from '../../hooks/use-employee-detail';
import { useAssignments } from '../../hooks/use-assignments';
import { AssignEmployeeModal } from './assign-employee-modal';
import { EmployeeStatutorySection } from './employee-statutory-section';
import {
  EmployeeProjectsSection,
  EmployeeReportingSection,
  EmployeeTeamsSection,
} from './employee-membership-sections';

interface EntityDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Backend employee id. The drawer fetches everything else itself. */
  employeeId: string | null;
}

/**
 * Employee detail.
 *
 * Takes only an id and loads the record from the API, replacing a version that received a
 * fully-formed employee object assembled from fixtures upstream. Sections it cannot source —
 * reporting line, avatar image — say so rather than showing invented values.
 */
export function EntityDetailDrawer({ isOpen, onClose, employeeId }: EntityDetailDrawerProps) {
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const detail = useEmployeeDetail(employeeId);
  const assignments = useAssignments(employeeId);

  const canManageAssignments = assignments.canWriteTeams || assignments.canWriteProjects;

  return (
    <>
      <Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
        <SheetContent className="max-w-md gap-0 p-0">
          <SheetTitle className="sr-only">Employee details</SheetTitle>

          {detail.loading && (
            <div className="space-y-3 p-5" aria-busy="true" role="status">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            </div>
          )}

          {!detail.loading && detail.forbidden && (
            <div className="p-6 text-center" role="status">
              <Icon className="mx-auto size-5 text-muted-foreground" name="lock" />
              <p className="mt-2 text-sm font-semibold text-foreground">Not available</p>
              <p className="text-xs text-muted-foreground">
                You do not have permission to view this employee.
              </p>
            </div>
          )}

          {!detail.loading && detail.error && !detail.forbidden && (
            <div className="p-6 text-center" role="alert">
              <Icon className="mx-auto size-5 text-destructive" name="warning" />
              <p className="mt-2 text-sm font-semibold text-foreground">Could not load employee</p>
              <p className="text-xs text-muted-foreground">{detail.error}</p>
              <Button
                className="mt-3"
                onClick={() => void detail.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          )}

          {detail.data && (
            <>
              <div className="flex items-start justify-between border-b border-border bg-muted/40 p-5 pr-14">
                <div className="flex items-center gap-3.5">
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-bold text-primary"
                  >
                    {detail.data.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {detail.data.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {detail.data.jobTitle ?? 'Role not recorded'}
                      {detail.data.department ? ` · ${detail.data.department}` : ''}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 font-mono text-[10px] font-bold text-muted-foreground">
                        {detail.data.employee.employeeNumber}
                      </span>
                      <Badge className="text-[10px]" variant="outline">
                        {detail.data.employee.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {canManageAssignments && (
                <div className="border-b border-border px-5 py-3">
                  <Button
                    className="w-full"
                    onClick={() => setIsAssignModalOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Icon className="size-4" name="edit" />
                    Manage assignments
                  </Button>
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Work email</span>
                    <span className="truncate font-semibold text-foreground">
                      {detail.data.employee.workEmail ?? 'Not recorded'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-semibold text-foreground">
                      {detail.data.employee.phone ?? 'Not recorded'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Employment type</span>
                    <span className="font-semibold text-foreground">
                      {detail.data.employee.employmentType}
                    </span>
                  </div>
                </div>

                <EmployeeReportingSection detail={detail.data.detail} />
                <EmployeeTeamsSection memberships={assignments.teamMemberships} />
                <EmployeeProjectsSection memberships={assignments.projectMemberships} />
                <EmployeeStatutorySection
                  canRead={detail.data.canReadCompliance}
                  profiles={detail.data.statutoryProfiles}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {detail.data && (
        <AssignEmployeeModal
          assignments={assignments}
          employeeName={detail.data.displayName}
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
        />
      )}
    </>
  );
}
