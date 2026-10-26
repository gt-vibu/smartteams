'use client';

import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  DatePicker,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import {
  employeeDisplayName,
  formatMoney,
  isCalculationStale,
  type PayrollRun,
} from '@smarteam/contracts';
import { useEmployees } from '../../hooks/use-workforce';
import type { PayrollAdminState } from '../../hooks/use-payroll-admin';

/**
 * The lifecycle controls for one payroll run.
 *
 * Which action is offered follows the run's server state, and every action is a request whose
 * result replaces the local copy. The screen this replaced moved a run through DRAFT → CALCULATED
 * → APPROVED → RELEASED entirely in the browser, writing a hardcoded gross of ₹42,50,000 on
 * "calculate" — no employee, no policy and no statutory rule was involved.
 *
 * A stale run offers only "Recalculate": the backend refuses to approve or release it, and the UI
 * must not present an action the server will reject.
 */
export function PayrollRunActions({ run, admin }: { run: PayrollRun; admin: PayrollAdminState }) {
  const [pending, setPending] = useState<'APPROVED' | 'RELEASED' | 'LOCKED' | null>(null);
  const [calculateOpen, setCalculateOpen] = useState(false);
  const [deferAdvanceEmployeeIds, setDeferAdvanceEmployeeIds] = useState<string[]>([]);
  const stale = isCalculationStale(run);

  const advancesToRecover = admin.advances
    .filter((advance) => {
      const status = advance.status.toUpperCase();
      const outstanding = Math.max(
        0,
        (advance.approvedAmount ?? advance.requestedAmount) - advance.recoveredAmount,
      );
      const approvedAt = advance.approvedAt ? new Date(advance.approvedAt) : null;
      return (
        (status === 'APPROVED' || status === 'PARTIALLY_RECOVERED') &&
        outstanding > 0 &&
        (!approvedAt || approvedAt <= new Date(`${run.periodEnd}T23:59:59.999`)) &&
        advance.employeeId &&
        advance.employee
      );
    })
    .reduce((byEmployee, advance) => {
      const id = advance.employeeId!;
      const previous = byEmployee.get(id);
      const amount = Math.max(
        0,
        (advance.approvedAmount ?? advance.requestedAmount) - advance.recoveredAmount,
      );
      byEmployee.set(id, {
        id,
        name: [advance.employee!.firstName, advance.employee!.lastName].filter(Boolean).join(' '),
        employeeNumber: advance.employee!.employeeNumber ?? '',
        outstanding: (previous?.outstanding ?? 0) + amount,
      });
      return byEmployee;
    }, new Map<string, { id: string; name: string; employeeNumber: string; outstanding: number }>());
  const recoveryChoices = [...advancesToRecover.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const startCalculation = () => {
    setDeferAdvanceEmployeeIds([]);
    if (recoveryChoices.length > 0 && !admin.advancesUnavailable) setCalculateOpen(true);
    else void admin.calculateRun(run.id);
  };

  const calculate = async () => {
    const ok = await admin.calculateRun(run.id, deferAdvanceEmployeeIds);
    if (ok) setCalculateOpen(false);
  };

  const confirm = async () => {
    if (!pending) return;
    const ok = await admin.advanceRun(run.id, pending, '');
    if (ok) setPending(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(run.status === 'DRAFT' || run.status === 'CALCULATED' || stale) && admin.can.calculate && (
        <Button
          disabled={admin.saving || (!admin.advancesUnavailable && admin.advancesLoading)}
          onClick={startCalculation}
          size="sm"
          type="button"
        >
          {run.status === 'DRAFT' && !stale ? 'Calculate' : 'Recalculate'}
        </Button>
      )}
      {run.status === 'CALCULATED' && !stale && admin.can.approve && (
        <Button
          disabled={admin.saving}
          onClick={() => setPending('APPROVED')}
          size="sm"
          type="button"
        >
          Approve
        </Button>
      )}
      {run.status === 'APPROVED' && admin.can.release && (
        <Button
          disabled={admin.saving}
          onClick={() => setPending('RELEASED')}
          size="sm"
          type="button"
        >
          Release
        </Button>
      )}
      {run.status === 'RELEASED' && admin.can.lock && (
        <Button
          disabled={admin.saving}
          onClick={() => setPending('LOCKED')}
          size="sm"
          type="button"
          variant="outline"
        >
          Lock
        </Button>
      )}

      <Dialog onOpenChange={(open) => !open && setPending(null)} open={pending !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {pending === 'RELEASED' ? 'Release' : pending === 'LOCKED' ? 'Lock' : 'Approve'} this
            payroll run
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            This action and your account will be recorded in the audit trail.
          </p>
          <div className="mt-4 space-y-3">
            {admin.saveError && (
              <p className="text-xs text-destructive" role="alert">
                {admin.saveError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={admin.saving}
                onClick={() => setPending(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={admin.saving} onClick={() => void confirm()} type="button">
                {admin.saving ? 'Working...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setCalculateOpen} open={calculateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>Choose advance recovery for this run</DialogTitle>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Payroll will recover as much as it can while keeping total deductions within the 50%
            wage limit, after statutory and other fixed deductions. Select employees whose advance
            recovery should be deferred; their outstanding balance carries forward.
          </p>
          <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
            {recoveryChoices.map((employee) => {
              const deferred = deferAdvanceEmployeeIds.includes(employee.id);
              return (
                <label
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-3"
                  key={employee.id}
                >
                  <span className="flex items-start gap-3">
                    <Checkbox
                      checked={deferred}
                      onCheckedChange={(checked) =>
                        setDeferAdvanceEmployeeIds((current) =>
                          checked
                            ? [...new Set([...current, employee.id])]
                            : current.filter((id) => id !== employee.id),
                        )
                      }
                    />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {employee.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {employee.employeeNumber} · outstanding {formatMoney(employee.outstanding)}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {deferred ? 'Defer this run' : 'Recover maximum allowed'}
                  </span>
                </label>
              );
            })}
          </div>
          {admin.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {admin.saveError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              disabled={admin.saving}
              onClick={() => setCalculateOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={admin.saving} onClick={() => void calculate()} type="button">
              {admin.saving ? 'Calculating...' : 'Calculate payroll'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Opens a run for a period. The backend rejects a period that already has one. */
export function CreatePayrollRunDialog({
  admin,
  open,
  onOpenChange,
}: {
  admin: PayrollAdminState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!periodStart || !periodEnd) return;
    const ok = await admin.createRun({ periodStart, periodEnd, payFrequency: 'MONTHLY' });
    if (ok) {
      setPeriodStart('');
      setPeriodEnd('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Start a payroll run</DialogTitle>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block" htmlFor="run-period-start">
                Period start
              </Label>
              <DatePicker
                disabled={admin.saving}
                id="run-period-start"
                max={periodEnd || undefined}
                onChange={setPeriodStart}
                value={periodStart}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="run-period-end">
                Period end
              </Label>
              <DatePicker
                disabled={admin.saving}
                id="run-period-end"
                min={periodStart || undefined}
                onChange={setPeriodEnd}
                value={periodEnd}
              />
            </div>
          </div>
          {admin.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {admin.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={admin.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={admin.saving || !periodStart || !periodEnd} type="submit">
              {admin.saving ? 'Creating...' : 'Create draft'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Adds an adjustment. On a calculated run this marks the calculation stale server-side. */
export function AddAdjustmentDialog({
  admin,
  runId,
  open,
  onOpenChange,
}: {
  admin: PayrollAdminState;
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  // Chosen by name: the field used to ask for the internal id, which nobody can type.
  const employees = useEmployees();
  const active = (employees.data ?? []).filter((employee) => employee.status === 'ACTIVE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!employeeId || !Number.isFinite(value) || value < 0 || description.trim().length < 3)
      return;
    const ok = await admin.addAdjustment({
      payrollRunId: runId,
      employeeId,
      type: 'BONUS',
      amount: value,
      description: description.trim(),
      taxable: true,
    });
    if (ok) {
      setEmployeeId('');
      setAmount('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Add a bonus</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Adding this to a calculated run marks its figures out of date. The run has to be
          calculated again before it can be approved.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <Label className="mb-1 block" htmlFor="adjustment-employee">
              Employee
            </Label>
            <SelectMenu disabled={admin.saving} onValueChange={setEmployeeId} value={employeeId}>
              <SelectTrigger id="adjustment-employee">
                <SelectValue
                  placeholder={employees.loading ? 'Loading people…' : 'Choose a person'}
                />
              </SelectTrigger>
              <SelectContent>
                {active.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employeeDisplayName(employee)} · {employee.employeeNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="adjustment-amount">
              Amount
            </Label>
            <Input
              disabled={admin.saving}
              id="adjustment-amount"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              value={amount}
            />
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="adjustment-description">
              What it is for
            </Label>
            <Input
              disabled={admin.saving}
              id="adjustment-description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
          {admin.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {admin.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={admin.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={admin.saving} type="submit">
              {admin.saving ? 'Saving...' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
