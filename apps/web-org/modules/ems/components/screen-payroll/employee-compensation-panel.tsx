'use client';

import { LoadingIndicator } from '@smarteam/ui';

import React, { useState, useEffect } from 'react';
import type { Employee } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';
import { CompensationHeaderCard } from './compensation-header-card';
import { CompensationSalaryForm } from './compensation-salary-form';
import { SalaryBreakdownCard } from './salary-breakdown-card';
import { AssignComponentDialog } from './assign-component-dialog';
import { ConfigureSalaryPolicyDialog } from './configure-salary-policy-dialog';
import { UserCheck } from 'lucide-react';
import { useSalaryPreview } from '../../hooks/use-salary-preview';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { payrollRepository } from '../../repositories/payroll.repository';
import type { PayrollPolicy } from '@smarteam/contracts';

interface EmployeeCompensationPanelProps {
  compensation: CompensationState;
  employee?: Employee | null;
  onConfigureStatutory?: () => void;
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
  onConfigureStatutory,
}: EmployeeCompensationPanelProps) {
  const [assigning, setAssigning] = useState(false);
  const [configuringPolicy, setConfiguringPolicy] = useState(false);
  const profile = compensation.profile;
  const policy = profile?.employeePolicy;
  const { session } = useSession();
  const policies = useAsyncResource<PayrollPolicy[]>(
    () => payrollRepository.listPolicies(session!.organizationId),
    [session?.organizationId],
    { enabled: Boolean(session?.organizationId && compensation.can.saveSalary) },
  );
  const [selectedPolicyId, setSelectedPolicyId] = useState('');

  const [pfEnabled, setPfEnabled] = useState<boolean>(true);
  const [ptEnabled, setPtEnabled] = useState<boolean>(true);
  const [esiEnabled, setEsiEnabled] = useState<boolean>(true);

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
    if (policy) {
      setPfEnabled(policy.pfEnabled);
      setPtEnabled(policy.ptEnabled);
      setEsiEnabled(policy.esiEnabled);
    }
  }, [policy]);

  useEffect(() => {
    setSelectedPolicyId(
      policy?.assignmentSource === 'INDIVIDUAL_OVERRIDE' ? (policy.payrollPolicyId ?? '') : '',
    );
  }, [policy?.assignmentSource, policy?.payrollPolicyId, compensation.employeeId]);

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
        <LoadingIndicator variant="inline" label="Loading compensation structure" className="text-xs text-muted-foreground" />
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
          onGrossChange={setGrossInput}
          onToggleEsi={() => setEsiEnabled(!esiEnabled)}
          onTogglePf={() => setPfEnabled(!pfEnabled)}
          onTogglePt={() => setPtEnabled(!ptEnabled)}
          pfEnabled={pfEnabled}
          profile={profile}
          policies={policies.data ?? []}
          selectedPolicyId={selectedPolicyId}
          onSelectedPolicyIdChange={setSelectedPolicyId}
          onConfigureStatutory={onConfigureStatutory}
          ptEnabled={ptEnabled}
        />
        <SalaryBreakdownCard
          canAssign={compensation.can.assign}
          canConfigurePolicy={compensation.can.savePolicy}
          onAssignComponent={() => setAssigning(true)}
          onConfigurePolicy={() => setConfiguringPolicy(true)}
          profile={shown}
        />
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
