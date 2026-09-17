'use client';

import React, { useState, useEffect } from 'react';
import type { Employee } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';
import { CompensationHeaderCard } from './compensation-header-card';
import { CompensationSalaryForm } from './compensation-salary-form';
import { EarningsBreakdownCard } from './earnings-breakdown-card';
import { StatutoryApplicabilityCard } from './statutory-applicability-card';
import { CompensationSummaryCard } from './compensation-summary-card';
import { AssignComponentDialog } from './assign-component-dialog';
import { ConfigureSalaryPolicyDialog } from './configure-salary-policy-dialog';
import { UserCheck } from 'lucide-react';

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
  const [configuringPolicy, setConfiguringPolicy] = useState(false);
  const profile = compensation.profile;
  const policy = profile?.employeePolicy;

  const [pfEnabled, setPfEnabled] = useState<boolean>(true);
  const [ptEnabled, setPtEnabled] = useState<boolean>(true);
  const [esiEnabled, setEsiEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (policy) {
      setPfEnabled(policy.pfEnabled);
      setPtEnabled(policy.ptEnabled);
      setEsiEnabled(policy.esiEnabled);
    }
  }, [policy]);

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
      <div className="flex min-h-[clamp(200px,40vh,350px)] flex-col items-center justify-center rounded-xl border border-border bg-card p-10 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
        <p className="text-xs text-muted-foreground" role="status">
          Loading compensation structure...
        </p>
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

  return (
    <div className="w-full min-w-0 space-y-3.5">
      {/* 1. Header with Employee Context & 4 Headline Metric Cards */}
      <CompensationHeaderCard employee={employee} profile={profile} />

      {/* 2. Main 2-Column Responsive Workspace Grid */}
      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* Left Column: Primary Configuration, Earnings Table, Deductions Table */}
        <div className="min-w-0 space-y-3.5">
          <CompensationSalaryForm
            compensation={compensation}
            profile={profile}
            pfEnabled={pfEnabled}
            ptEnabled={ptEnabled}
            esiEnabled={esiEnabled}
          />

          <EarningsBreakdownCard
            canAssign={compensation.can.assign}
            canConfigurePolicy={compensation.can.savePolicy}
            onAssignComponent={() => setAssigning(true)}
            onConfigurePolicy={() => setConfiguringPolicy(true)}
            profile={profile}
          />

          <StatutoryApplicabilityCard profile={profile} />
        </div>

        {/* Right Column: Policy & Toggles, CTC Distribution Donut, Compensation Summary */}
        <div className="min-w-0 space-y-3.5">
          <CompensationSummaryCard
            compensation={compensation}
            profile={profile}
            pfEnabled={pfEnabled}
            ptEnabled={ptEnabled}
            esiEnabled={esiEnabled}
            onTogglePf={() => setPfEnabled(!pfEnabled)}
            onTogglePt={() => setPtEnabled(!ptEnabled)}
            onToggleEsi={() => setEsiEnabled(!esiEnabled)}
          />
        </div>
      </div>

      {/* Assign Component Modal */}
      <AssignComponentDialog
        compensation={compensation}
        onOpenChange={setAssigning}
        open={assigning}
      />

      {/* Configure Salary Policy Modal */}
      <ConfigureSalaryPolicyDialog
        compensation={compensation}
        onOpenChange={setConfiguringPolicy}
        open={configuringPolicy}
      />
    </div>
  );
}
