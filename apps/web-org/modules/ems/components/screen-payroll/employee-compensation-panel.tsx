'use client';

import React, { useState, useEffect } from 'react';
import type { Employee } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';
import { CompensationHeaderCard } from './compensation-header-card';
import { CompensationSalaryForm } from './compensation-salary-form';
import { SalaryBreakdownCard } from './salary-breakdown-card';
import { AssignComponentDialog } from './assign-component-dialog';
import { UserCheck } from 'lucide-react';
import { useSalaryPreview } from '../../hooks/use-salary-preview';

interface EmployeeCompensationPanelProps {
  compensation: CompensationState;
  employee?: Employee | null;
}

/**
 * Enterprise Employee Compensation & Payroll Structure Workspace.
 *
 * Implements a single-view, 2-column desktop layout that adapts to the viewport
 * without horizontal overflow or submerged text.
 */
export function EmployeeCompensationPanel({
  compensation,
  employee,
}: EmployeeCompensationPanelProps) {
  const [assigning, setAssigning] = useState(false);
  const profile = compensation.profile;
  const policy = profile?.employeePolicy;
  const formerEmployee = employee?.status !== undefined && employee.status !== 'ACTIVE';

  const [pfEnabled, setPfEnabled] = useState<boolean>(false);
  const [ptEnabled, setPtEnabled] = useState<boolean>(false);
  const [esiEnabled, setEsiEnabled] = useState<boolean>(false);

  const [grossInput, setGrossInput] = useState('');
  const savedGross = Number(
    profile?.compensation?.grossSalary ?? profile?.compensation?.baseAmount ?? 0,
  );
  const typedGross = Number(grossInput);
  const changed =
    Boolean(profile) &&
    grossInput !== '' &&
    Number.isFinite(typedGross) &&
    typedGross >= 0 &&
    (typedGross !== savedGross ||
      pfEnabled !== (policy?.pfEnabled ?? pfEnabled) ||
      ptEnabled !== (policy?.ptEnabled ?? ptEnabled) ||
      esiEnabled !== (policy?.esiEnabled ?? esiEnabled));
  const { preview, updating } = useSalaryPreview(
    compensation.employeeId,
    changed ? { grossSalary: typedGross, pfEnabled, esiEnabled, ptEnabled } : null,
  );

  useEffect(() => {
    setPfEnabled(policy?.pfEnabled ?? profile?.organizationPolicy?.pfDefault ?? false);
    setPtEnabled(policy?.ptEnabled ?? profile?.organizationPolicy?.ptDefault ?? false);
    setEsiEnabled(policy?.esiEnabled ?? profile?.organizationPolicy?.esiDefault ?? false);
  }, [policy, profile?.organizationPolicy]);

  if (!compensation.employeeId) {
    return (
      <div className="flex min-h-[clamp(240px,45vh,380px)] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2.5">
          <UserCheck className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-foreground">Select an employee</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          Select an employee from the directory on the left to configure their complete Annual CTC,
          salary structure, and statutory rules.
        </p>
      </div>
    );
  }

  if (compensation.profileForbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,40vh,350px)] flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Access Restricted</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reading another employee&apos;s salary profile requires the organization-wide permission.
        </p>
      </div>
    );
  }

  if (compensation.profileLoading) {
    return (
      <div aria-busy="true" className="w-full min-w-0 space-y-3.5" role="status">
        <span className="sr-only">
          Loading compensation structure for {employee?.firstName ?? 'employee'}.
        </span>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {employee ? `${employee.firstName} ${employee.lastName}` : 'Loading employee'}
              </p>
              <div className="h-3 w-44 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4" key={index}>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-6 w-32 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            {Array.from({ length: 4 }, (_, index) => (
              <div className="space-y-2" key={index}>
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            {Array.from({ length: 6 }, (_, index) => (
              <div className="h-8 w-full animate-pulse rounded bg-muted" key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (compensation.profileError || !profile) {
    return (
      <div
        className="flex min-h-[clamp(200px,40vh,350px)] flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-10 text-center"
        role="alert"
      >
        <p className="text-sm font-bold text-foreground">Could not load compensation</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {compensation.profileError ?? 'No salary profile was returned for this employee.'}
        </p>
      </div>
    );
  }

  // The typed salary's figures while it differs from what is saved, the saved ones otherwise.
  const shown = (changed && preview) || profile;

  return (
    <div className="w-full min-w-0 space-y-3.5">
      {/* 1. Header with Employee Context & 4 Headline Metric Cards */}
      <CompensationHeaderCard employee={employee} profile={shown} />
      {formerEmployee && (
        <p
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          Former employee. Compensation is shown for reference and cannot be changed.
        </p>
      )}
      {changed && (
        <p
          className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          role="status"
        >
          {updating
            ? 'Updating the preview…'
            : 'Preview of the figures below. Nothing is saved until you press Save Compensation.'}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <CompensationSalaryForm
          compensation={compensation}
          esiEnabled={esiEnabled}
          readOnly={formerEmployee}
          onGrossChange={setGrossInput}
          onToggleEsi={() => setEsiEnabled(!esiEnabled)}
          onTogglePf={() => setPfEnabled(!pfEnabled)}
          onTogglePt={() => setPtEnabled(!ptEnabled)}
          pfEnabled={pfEnabled}
          profile={profile}
          ptEnabled={ptEnabled}
        />
        <SalaryBreakdownCard
          canAssign={compensation.can.assign && !formerEmployee}
          onAssignComponent={() => setAssigning(true)}
          profile={shown}
        />
      </div>

      {/* Assign Component Modal */}
      {!formerEmployee && (
        <AssignComponentDialog
          compensation={compensation}
          onOpenChange={setAssigning}
          open={assigning}
        />
      )}
    </div>
  );
}
