'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@smarteam/ui';
import { UserPlus } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { PersonAvatar } from '../common/person-avatar';
import { employeeDisplayName } from '@smarteam/contracts';
import { useEmployeeOnboarding, type OnboardingInput } from '../../hooks/use-employee-onboarding';
import { useEmployees } from '../../hooks/use-workforce';
import { useOrganization } from '../../hooks/use-organization';
import { useRoles } from '../../hooks/use-roles';
import { OnboardEmployeeDialog } from './onboard-employee-dialog';
import { OnboardingOutcome } from './onboarding-outcome';

/**
 * Employee onboarding.
 *
 * This screen was briefly reduced to a list of backend capability gaps. That was a mistake in
 * reasoning: the absence of a candidate pipeline, checklists, document verification and asset
 * allocation is not the absence of onboarding. Creating an employee, recording their employment,
 * setting their reporting line, giving them a login and assigning a least-privilege role are all
 * real, native operations — so onboarding is the workflow, and those four are the gaps.
 *
 * "Recently joined" is deliberately not ordered by joining date. `dateOfJoining` is readable now —
 * the employee detail route returns it — but only one employee at a time, so ordering the list by
 * it would take a request per employee. That is the N+1 this screen is not going to ship; the
 * roll is shown as the API returns it until the employee list itself carries the date.
 */
export function ScreenOnboarding() {
  const employees = useEmployees();
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
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        actions={
          onboarding.canOnboard && (
            <Button onClick={() => setOpen(true)} size="sm" type="button">
              Add employee
            </Button>
          )
        }
        description="Bring a new employee into your organization."
        icon={UserPlus}
        title="Onboarding"
        tone="primary"
      />

      {!onboarding.canOnboard && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-bold text-foreground">Not available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not have permission to add employees to this organization.
          </p>
        </div>
      )}

      {onboarding.result && (
        <OnboardingOutcome onDismiss={onboarding.reset} result={onboarding.result} />
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-bold text-foreground">Recently joined</h2>
        <RecentJoiners employees={employees} />
      </section>

      {/*
        Collapsed by default, and last.
        This list used to be the whole page, and even as a section it dominated a screen whose job
        is to onboard someone. None of it blocks that, so it should not be the first thing read —
        but it stays on the page, because quietly dropping it would be the other mistake.
      */}
      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Advanced onboarding features not yet available ({GAPS.length})
        </summary>
        <dl className="divide-y divide-border border-t border-border">
          {GAPS.map((gap) => (
            <div className="px-4 py-3" key={gap.title}>
              <dt className="text-xs font-bold text-foreground">{gap.title}</dt>
              <dd className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {gap.detail}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <OnboardEmployeeDialog
        branches={organization.branches}
        busy={onboarding.busy}
        canCreateAccount={onboarding.canCreateAccount}
        employeeRoleId={employeeRoleId}
        employees={employees.data ?? []}
        onOpenChange={setOpen}
        onSubmit={(input) => void submit(input)}
        open={open}
      />
    </div>
  );
}

const GAPS = [
  {
    title: 'Candidate pipeline',
    detail:
      'Offer stages and pre-boarding have no entity. Nothing can store someone who has not yet become an employee.',
  },
  {
    title: 'Onboarding checklists',
    detail: 'No task, template or completion state is modelled.',
  },
  {
    title: 'Document verification',
    detail:
      'Files can be uploaded against an employee, but there is no verification state or reviewer to attach them to.',
  },
  {
    title: 'Asset allocation',
    detail: 'No asset or allocation entity exists.',
  },
];

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

  // The employee list has no joining date and no created-at, so "recent" cannot be ordered from
  // it. Showing the newest by employee number would be a guess, so this shows the roll as the API
  // returns it and links out to each record, where the joining date is real.
  const recent = rows.slice(0, 8);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Employee</th>
            <th className="px-4 py-2.5 font-bold">Number</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((employee) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={employee.id}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <PersonAvatar name={employeeDisplayName(employee)} size="sm" />
                  <span className="font-semibold text-foreground">
                    {employeeDisplayName(employee)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {employee.employeeNumber}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{employee.status.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
