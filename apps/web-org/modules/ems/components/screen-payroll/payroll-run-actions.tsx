'use client';

import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DatePicker,
  Input,
  Label,
  Textarea,
} from '@smarteam/ui';
import { isCalculationStale, type PayrollRun } from '@smarteam/contracts';
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
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<'APPROVED' | 'RELEASED' | 'LOCKED' | null>(null);
  const stale = isCalculationStale(run);

  const confirm = async () => {
    if (!pending) return;
    const ok = await admin.advanceRun(run.id, pending, comment.trim());
    if (ok) {
      setComment('');
      setPending(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(run.status === 'DRAFT' || stale) && admin.can.calculate && (
        <Button
          disabled={admin.saving}
          onClick={() => void admin.calculateRun(run.id)}
          size="sm"
          type="button"
        >
          {stale ? 'Recalculate' : 'Calculate'}
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
            The reason is recorded against the run in the audit trail.
          </p>
          <div className="mt-4 space-y-3">
            <Label className="block" htmlFor="run-action-comment">
              Reason
            </Label>
            <Textarea
              disabled={admin.saving}
              id="run-action-comment"
              onChange={(event) => setComment(event.target.value)}
              value={comment}
            />
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
              <Button
                disabled={admin.saving || comment.trim().length < 3}
                onClick={() => void confirm()}
                type="button"
              >
                {admin.saving ? 'Working...' : 'Confirm'}
              </Button>
            </div>
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
              Employee id
            </Label>
            <Input
              disabled={admin.saving}
              id="adjustment-employee"
              onChange={(event) => setEmployeeId(event.target.value)}
              value={employeeId}
            />
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
              Description
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
