'use client';

import React, { useState } from 'react';
import { LoadingIndicator, Badge, Button, Icon } from '@smarteam/ui';
import { employmentTypeLabel, hasPermission, formatDate } from '@smarteam/contracts';
import { ChevronLeft } from 'lucide-react';
import { useEmployeeDetail } from '../../hooks/use-employee-detail';
import { useAssignments } from '../../hooks/use-assignments';
import { useSession } from '../../hooks/auth-context';
import { AssignEmployeeModal } from '../common/assign-employee-modal';
import { EditEmployeeDialog } from '../common/edit-employee-dialog';
import { RemoveEmployeeDialog } from './remove-employee-dialog';
import { FormerEmployeeSummary } from './former-employee-summary';
import { EmployeeShiftSection } from './employee-shift-section';
import { EmployeeBranchesSection } from './employee-branches-section';
import { EmployeeStatutorySection } from '../common/employee-statutory-section';
import { EmployeeCustomFieldsSection } from '../common/employee-custom-fields-section';
import { ProbationControl } from './probation-panel';
import { AccountAccessPanel } from '../screen-onboarding/account-access-panel';
import {
  EmployeeProjectsSection,
  EmployeeReportingSection,
  EmployeeTeamsSection,
} from '../common/employee-membership-sections';
import {
  EmployeeAttendanceTab,
  EmployeeLeaveTab,
  EmployeePayrollTab,
} from './employee-profile-records';

type Tab = 'details' | 'payroll' | 'attendance' | 'leave';

/** One employee, everything about them: details, payroll, attendance and leave. */
export function EmployeeProfile({
  employeeId,
  onBack,
}: {
  employeeId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const detail = useEmployeeDetail(employeeId);
  const assignments = useAssignments(employeeId);
  const { persona } = useSession();
  const permissions = persona?.permissions ?? [];
  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'details', label: 'Details', show: true },
    {
      id: 'payroll',
      label: 'Payroll',
      show: hasPermission(permissions, 'payroll.employee-profile.read.all'),
    },
    // Someone else's attendance and leave need the organization-wide keys; the self-service ones
    // every employee holds would open the tab onto a refusal.
    {
      id: 'attendance',
      label: 'Attendance',
      show: hasPermission(permissions, 'attendance.read.all'),
    },
    { id: 'leave', label: 'Leave', show: hasPermission(permissions, 'leave.requests.read.all') },
  ];
  const data = detail.data;
  // Someone who has left is history: shown in full, changed by nobody.
  const left = Boolean(data && data.employee.status !== 'ACTIVE');

  return (
    <div className="space-y-4">
      <button
        className="-ml-1 flex min-h-10 items-center gap-1 rounded-md px-1 text-sm font-semibold text-primary"
        onClick={onBack}
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        All employees
      </button>

      {detail.loading && (
        <LoadingIndicator variant="inline" label="Loading employee" className="text-xs text-muted-foreground" />
      )}
      {!detail.loading && (detail.forbidden || detail.error) && (
        <p
          className="rounded-lg border border-border bg-card p-6 text-center text-xs text-destructive"
          role="alert"
        >
          {detail.forbidden ? 'You do not have permission to view this employee.' : detail.error}
        </p>
      )}

      {data && (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-bold text-primary"
              >
                {data.initials}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-foreground">{data.displayName}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {data.jobTitle ?? 'Role not recorded'}
                  {data.department ? ` · ${data.department}` : ''}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 font-mono text-[10px] font-bold text-muted-foreground">
                    {data.employee.employeeNumber}
                  </span>
                  <Badge className="text-[10px]" variant="outline">
                    {left ? 'Left the company' : 'Active'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!left && detail.canWrite && data.detail && (
                <Button onClick={() => setEditing(true)} size="sm" type="button">
                  <Icon className="size-4" name="edit" />
                  Edit details
                </Button>
              )}
              {!left && (assignments.canWriteTeams || assignments.canWriteProjects) && (
                <Button
                  onClick={() => setAssigning(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Teams & projects
                </Button>
              )}
              {detail.canWrite && data.employee.status === 'ACTIVE' && (
                <Button
                  className="text-destructive"
                  onClick={() => setRemoving(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Remove from company
                </Button>
              )}
            </div>
          </header>

          <div className="flex gap-4 overflow-x-auto border-b border-border" role="tablist">
            {tabs
              .filter((entry) => entry.show)
              .map((entry) => (
                <button
                  aria-selected={tab === entry.id}
                  className={`whitespace-nowrap pb-2 text-xs font-semibold ${
                    tab === entry.id
                      ? 'border-b-2 border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  key={entry.id}
                  onClick={() => setTab(entry.id)}
                  role="tab"
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
          </div>

          {tab === 'details' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-1.5 rounded-lg border border-border bg-card p-4 text-xs">
                {[
                  ['Work email', data.employee.workEmail ?? 'Not recorded'],
                  ['Phone', data.employee.phone ?? 'Not recorded'],
                  ['Employment type', employmentTypeLabel(data.employee.employmentType)],
                  ['Date of joining', formatDate(data.detail?.dateOfJoining) || 'Not recorded'],
                  ...(left
                    ? [
                        [
                          'Date of leaving',
                          formatDate(data.detail?.dateOfLeaving) || 'Not recorded',
                        ],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-3" key={label}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="truncate font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </section>
              <div className="space-y-4">
                <EmployeeShiftSection employeeId={employeeId} readOnly={left} />
                <EmployeeBranchesSection employeeId={employeeId} readOnly={left} />
                <EmployeeReportingSection detail={data.detail} />
                <EmployeeTeamsSection memberships={assignments.teamMemberships} />
                <EmployeeProjectsSection memberships={assignments.projectMemberships} />
                <EmployeeCustomFieldsSection employeeId={employeeId} readOnly={left} />
                {detail.canWrite && !left && (
                  <section className="rounded-lg border border-border bg-card p-4 text-xs">
                    {data.detail?.confirmedOn ? (
                      <p className="text-muted-foreground">
                        Confirmed in their role on {formatDate(data.detail.confirmedOn)}.
                      </p>
                    ) : (
                      <ProbationControl
                        current={data.detail?.probationEndsOn?.slice(0, 10) ?? null}
                        employeeId={employeeId}
                        onSaved={() => void detail.refetch()}
                      />
                    )}
                  </section>
                )}
              </div>
              <EmployeeStatutorySection
                canRead={data.canReadCompliance}
                profiles={data.statutoryProfiles}
              />
              {left ? (
                <FormerEmployeeSummary
                  employeeId={employeeId}
                  joined={data.detail?.dateOfJoining ?? null}
                  left={data.detail?.dateOfLeaving ?? null}
                />
              ) : (
                <AccountAccessPanel employeeId={employeeId} />
              )}
            </div>
          )}
          {tab === 'payroll' && <EmployeePayrollTab employeeId={employeeId} />}
          {tab === 'attendance' && <EmployeeAttendanceTab employeeId={employeeId} />}
          {tab === 'leave' && <EmployeeLeaveTab employeeId={employeeId} />}

          <AssignEmployeeModal
            assignments={assignments}
            employeeName={data.displayName}
            isOpen={assigning}
            onClose={() => setAssigning(false)}
          />
          <RemoveEmployeeDialog
            employeeId={employeeId}
            name={data.displayName}
            onOpenChange={setRemoving}
            onRemoved={() => void detail.refetch()}
            open={removing}
          />
          {data.detail && (
            <EditEmployeeDialog
              detail={data.detail}
              employee={data.employee}
              onOpenChange={setEditing}
              onSaved={() => void detail.refetch()}
              open={editing}
            />
          )}
        </>
      )}
    </div>
  );
}
