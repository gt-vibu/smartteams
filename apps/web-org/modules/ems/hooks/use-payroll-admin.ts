'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  hasPermission,
  isCalculationStale,
  type PayrollRun,
  type PayrollRunStatus,
  type Payslip,
} from '@smarteam/contracts';
import { useSession } from './auth-context';
import {
  payrollRepository,
  type PayrollAdjustmentInput,
  type PayrollRunInput,
} from '../repositories/payroll.repository';
import { useAsyncResource } from './use-async-resource';
import { useMutationRunner } from './use-mutation-runner';

/**
 * Organization-wide payroll: runs, their lifecycle, and the payslips a released run produced.
 *
 * Replaces a screen driven by `payroll-runs.json` plus `localStorage`, where a run advanced
 * through its states in the browser and nothing was ever calculated. Every transition here is a
 * server decision: the API refuses an invalid one, and refuses to approve or release a run whose
 * inputs changed after it was calculated. This hook reports that state; it never decides it.
 */
export function usePayrollAdmin() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);

  const canReadRuns = hasPermission(permissions, 'payroll.runs.read');
  const canReadPayslips = hasPermission(permissions, 'payroll.payslips.read.all');
  const can = {
    write: hasPermission(permissions, 'payroll.runs.write'),
    calculate: hasPermission(permissions, 'payroll.runs.calculate'),
    approve: hasPermission(permissions, 'payroll.runs.approve'),
    release: hasPermission(permissions, 'payroll.runs.release'),
    lock: hasPermission(permissions, 'payroll.runs.lock'),
    adjust: hasPermission(permissions, 'payroll.adjustments.write'),
  };

  const runResource = useAsyncResource<PayrollRun[]>(
    () => payrollRepository.listRuns(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadRuns },
  );

  // Payslips exist only once a run is released; this is the whole-tenant list, so it needs the
  // broader read. Without it the screen shows an unavailable state rather than a narrowed list
  // that would silently look like "one employee was paid".
  const payslipResource = useAsyncResource<Payslip[]>(
    () => payrollRepository.listPayslips(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadPayslips },
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([runResource.refetch(), payslipResource.refetch()]);
  }, [payslipResource, runResource]);

  const { saving, saveError, setSaveError, run: mutate } = useMutationRunner(refetchAll);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs = useMemo(() => runResource.data ?? [], [runResource.data]);
  const selectedRun = useMemo(
    () => runs.find((entry) => entry.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const createRun = useCallback(
    (input: PayrollRunInput) =>
      mutate(
        () => payrollRepository.createRun(organizationId!, input),
        'The payroll run could not be created.',
      ),
    [mutate, organizationId],
  );

  const calculateRun = useCallback(
    (runId: string) =>
      mutate(
        () => payrollRepository.calculateRun(organizationId!, runId),
        'The payroll run could not be calculated.',
      ),
    [mutate, organizationId],
  );

  const advanceRun = useCallback(
    (runId: string, target: PayrollRunStatus, comment: string) =>
      mutate(
        () => payrollRepository.advanceRun(organizationId!, runId, target, comment),
        `The payroll run could not be moved to ${target.toLowerCase()}.`,
      ),
    [mutate, organizationId],
  );

  const addAdjustment = useCallback(
    (input: PayrollAdjustmentInput) =>
      mutate(
        () => payrollRepository.addAdjustment(organizationId!, input),
        'The payroll adjustment could not be saved.',
      ),
    [mutate, organizationId],
  );

  const payslipsForRun = useCallback(
    (runId: string) => (payslipResource.data ?? []).filter((slip) => slip.run.id === runId),
    [payslipResource.data],
  );

  return {
    runs,
    selectedRun,
    selectRun: setSelectedRunId,
    /** True when the selected run was calculated and an input changed afterwards. */
    selectedRunStale: selectedRun ? isCalculationStale(selectedRun) : false,
    payslips: useMemo(() => payslipResource.data ?? [], [payslipResource.data]),
    payslipsForRun,

    loading: runResource.loading,
    refreshing: runResource.refreshing,
    error: runResource.error,
    forbidden: runResource.forbidden || !canReadRuns,
    /** Payslip totals need the tenant-wide read; without it the list is not shown at all. */
    payslipsUnavailable: !canReadPayslips || payslipResource.forbidden,
    refetch: refetchAll,

    saving,
    saveError,
    dismissError: () => setSaveError(null),
    createRun,
    calculateRun,
    advanceRun,
    addAdjustment,
    can,
  };
}

export type PayrollAdminState = ReturnType<typeof usePayrollAdmin>;
