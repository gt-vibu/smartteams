'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@smarteam/ui';
import { UserPlus } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { PersonAvatar } from '../common/person-avatar';
import { employeeDisplayName, formatDate } from '@smarteam/contracts';
import { useEmployeeOnboarding, type OnboardingInput } from '../../hooks/use-employee-onboarding';
import { useEmployees } from '../../hooks/use-workforce';
import { useOrganization } from '../../hooks/use-organization';
import { useRoles } from '../../hooks/use-roles';
import { OnboardEmployeeDialog } from './onboard-employee-dialog';
import { OnboardingOutcome } from './onboarding-outcome';
import { OnboardingSuccessDialog } from './onboarding-success-dialog';
import { PageShell } from '../layout/page-shell';
import { statusLabel } from '../../lib/status-label';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';

/**
 * Employee onboarding.
 *
 * Create the employee, record their employment and reporting line, and give them a login with a
 * least-privilege role — the whole of onboarding, in one dialog.
 *
 * "Recently joined" is the eight latest joining dates on the directory list; people with no
 * joining date recorded come last.
 */
export function ScreenOnboarding() {
  const employees = useEmployees();
  const directory = useEmployeeDirectory();
  const jobTitles = useMemo(
    () =>
      new Map(
        directory.entries.flatMap((entry) => (entry.jobTitle ? [[entry.id, entry.jobTitle]] : [])),
      ),
    [directory.entries],
  );
  const organization = useOrganization();
  const roles = useRoles();
  const onboarding = useEmployeeOnboarding();
  const [open, setOpen] = useState(false);

  const employeeRoleId = useMemo(
    () => roles.roles.find((role) => role.code === 'EMPLOYEE')?.id ?? null,
    [roles.roles],
  );

  const submit = async (input: OnboardingInput) => {
    const outcome = await onboarding.onboard(input);
    if (outcome.employee) {
      setOpen(false);
      await employees.refetch();
    }
  };

  return (
    <PageShell>
      <ScreenHeader
        actions={
          onboarding.canOnboard && (
            <Button onClick={() => setOpen(true)} size="sm" type="button">
              Add employee
            </Button>
          )
        }
        icon={UserPlus}
        title="Onboarding"
        tone="primary"
      />

      {!onboarding.canOnboard && (
        <div
          className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
          role="status"
        >
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to add employees to this organization.
          </p>
        </div>
      )}

      {/*
        Success is a modal, failure is a panel. The password is only ever in one response and
        cannot be looked up afterwards, so the moment it is on screen has to interrupt — as a
        panel below the fold it was possible to close the form and lose it. A failure is the
        opposite: it needs to stay put while the administrator works out what to fix.
      */}
      {onboarding.result?.failure && !(open && !onboarding.result.employee) && (
        <OnboardingOutcome onDismiss={onboarding.reset} result={onboarding.result} />
      )}

      {onboarding.result && !onboarding.result.failure && (
        <OnboardingSuccessDialog
          email={onboarding.result.accountEmail}
          name={
            onboarding.result.employee
              ? employeeDisplayName(onboarding.result.employee)
              : 'The employee'
          }
          onClose={onboarding.reset}
          emailed={onboarding.result.invitationEmailed}
          password={onboarding.result.temporaryPassword}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-foreground">Recently joined</h2>
        <RecentJoiners employees={employees} />
      </section>

      <OnboardEmployeeDialog
        branches={organization.branches}
        defaultBranchId={organization.primaryBranchId}
        busy={onboarding.busy}
        canCreateAccount={onboarding.canCreateAccount}
        employeeRoleId={employeeRoleId}
        roles={roles.roles.map((role) => ({ id: role.id, name: role.name }))}
        employees={employees.data ?? []}
        jobTitles={jobTitles}
        // Nothing was saved, so the reason belongs in the form, where it can be corrected at once.
        error={
          onboarding.result?.failure && !onboarding.result.employee
            ? onboarding.result.failure.message
            : null
        }
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && onboarding.result?.failure && !onboarding.result.employee)
            onboarding.reset();
        }}
        onSubmit={(input) => void submit(input)}
        open={open}
      />
    </PageShell>
  );
}

function RecentJoiners({ employees }: { employees: ReturnType<typeof useEmployees> }) {
  const rows = employees.data ?? [];
  if (employees.loading)
    return (
      <p className="py-8 text-center text-xs text-muted-foreground" role="status">
        Loading employees...
      </p>
    );

  if (employees.error)
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center" role="alert">
        <p className="text-sm font-bold text-foreground">Could not load employees</p>
        <p className="mt-1 text-xs text-muted-foreground">{employees.error}</p>
      </div>
    );

  if (rows.length === 0)
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-xs text-muted-foreground">
          No employees yet. Add the first one to get started.
        </p>
      </div>
    );

  const recent = [...rows]
    .sort((a, b) => (b.dateOfJoining ?? '').localeCompare(a.dateOfJoining ?? ''))
    .slice(0, 8);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="stack-table w-full min-w-[560px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Employee</th>
            <th className="px-4 py-2.5 font-bold">Employee ID</th>
            <th className="px-4 py-2.5 font-bold">Joined</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((employee) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={employee.id}
            >
              <td data-cell="primary" className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={employeeDisplayName(employee)} size="sm" />
                  <span className="font-semibold text-foreground">
                    {employeeDisplayName(employee)}
                  </span>
                </div>
              </td>
              <td data-label="Number" className="px-4 py-2.5 font-mono text-muted-foreground">
                {employee.employeeNumber}
              </td>
              <td
                data-label="Joined"
                className="whitespace-nowrap px-4 py-2.5 text-muted-foreground"
              >
                {employee.dateOfJoining ? formatDate(employee.dateOfJoining) : 'Not recorded'}
              </td>
              <td
                data-cell="status"
                data-label="Status"
                className="px-4 py-2.5 text-muted-foreground"
              >
                {statusLabel(employee.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
