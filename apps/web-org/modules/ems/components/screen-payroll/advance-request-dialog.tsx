'use client';

import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import type { AdvanceAllowance } from '../../repositories/payroll.repository';
import { AllowanceMeter, allowanceBlock, rupees } from './advance-allowance';
import { LIMITS } from '@smarteam/contracts';

/**
 * Asking for a salary advance.
 *
 * Shaped around the three questions people have before they ask — how much can I get, how will
 * it come back out of my pay, and who decides — so the form answers them as the amount is typed
 * rather than in a paragraph above it. The server decides; this only stops a request it would
 * certainly refuse.
 */

/** Quick amounts: rounded shares of what is available, and the whole of it. */
function suggestions(available: number) {
  const round = (value: number) => Math.floor(value / 500) * 500;
  const picks = [round(available * 0.25), round(available * 0.5)].filter(
    (value, index, all) => value >= 500 && value < available && all.indexOf(value) === index,
  );
  return [
    ...picks.map((value) => ({ label: rupees(value), value })),
    { label: 'Max', value: available },
  ];
}

export function AdvanceRequestDialog({
  open,
  onOpenChange,
  allowance,
  saving,
  saveError,
  onRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowance: AdvanceAllowance | null;
  saving: boolean;
  saveError: string | null;
  onRequest: (input: { requestedAmount: number; reason: string }) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) return;
    setAmount('');
    setReason('');
    setTried(false);
  }, [open]);

  const blocked = allowance ? allowanceBlock(allowance) : null;
  const value = Number(amount);
  const entered = amount.trim() !== '' && Number.isFinite(value) && value > 0;
  const overLimit = allowance !== null && entered && value > allowance.available;
  const reasonOk = reason.trim().length >= 3;
  const months = allowance?.recoveryMonths ?? 1;
  const instalment = entered ? Math.ceil((value / months) * 100) / 100 : 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!entered || overLimit || !reasonOk) return;
    const ok = await onRequest({ requestedAmount: value, reason: reason.trim() });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Request a salary advance</DialogTitle>

        {!allowance ? (
          <p className="mt-4 text-xs text-muted-foreground" role="status">
            Checking how much you can ask for…
          </p>
        ) : blocked ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-center">
            <p className="text-sm font-bold text-foreground">{blocked.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{blocked.detail}</p>
            <Button className="mt-4" onClick={() => onOpenChange(false)} size="sm" type="button">
              Close
            </Button>
          </div>
        ) : (
          <form className="mt-4 space-y-4" noValidate onSubmit={submit}>
            <AllowanceMeter allowance={allowance} request={entered ? value : 0} />

            <div>
              <Label className="mb-1.5 block" htmlFor="advance-amount">
                How much do you need?
              </Label>
              <div
                className={`flex h-12 items-center rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-ring ${
                  overLimit ? 'border-destructive' : 'border-input'
                }`}
              >
                <span aria-hidden="true" className="text-lg font-semibold text-muted-foreground">
                  ₹
                </span>
                <input
                  aria-describedby="advance-amount-help"
                  aria-invalid={overLimit || (tried && !entered) || undefined}
                  className="ml-2 w-full bg-transparent text-lg font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60"
                  disabled={saving}
                  id="advance-amount"
                  inputMode="decimal"
                  min={1}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  type="number"
                  value={amount}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions(allowance.available).map((pick) => (
                  <button
                    aria-pressed={value === pick.value}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      value === pick.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                    disabled={saving}
                    key={pick.label}
                    onClick={() => setAmount(String(pick.value))}
                    type="button"
                  >
                    {pick.label}
                  </button>
                ))}
              </div>
              <p
                className={`mt-1.5 text-xs ${overLimit || (tried && !entered) ? 'text-destructive' : 'text-muted-foreground'}`}
                id="advance-amount-help"
              >
                {overLimit
                  ? `That is more than the ${rupees(allowance.available)} you can ask for now.`
                  : tried && !entered
                    ? 'Enter an amount.'
                    : `Up to ${rupees(allowance.available)}.`}
              </p>
            </div>

            {entered && !overLimit && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  How you repay it
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {months > 1 ? (
                    <>
                      <span className="font-mono font-bold tabular-nums">{rupees(instalment)}</span>{' '}
                      a month for {months} months, starting with your next payslip.
                    </>
                  ) : (
                    <>
                      <span className="font-mono font-bold tabular-nums">{rupees(value)}</span> from
                      your next payslip.
                    </>
                  )}
                </p>
                {allowance.monthlySalary ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    About {Math.max(1, Math.round((instalment / allowance.monthlySalary) * 100))}%
                    of your monthly gross, deducted by payroll — nothing to pay back yourself.
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <Label className="mb-1.5 block" htmlFor="advance-reason">
                Reason
              </Label>
              <Textarea
                maxLength={LIMITS.reason}
                aria-invalid={(tried && !reasonOk) || undefined}
                disabled={saving}
                id="advance-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="For example, a medical bill due before payday"
                rows={3}
                value={reason}
              />
              {tried && !reasonOk && (
                <p className="mt-1 text-xs text-destructive">
                  Say briefly what it is for — your approver sees this.
                </p>
              )}
            </div>

            {saveError && (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                {saveError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted-foreground">
                Goes to payroll for approval. You are told when it is decided.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 sm:flex-none"
                  disabled={saving}
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  disabled={saving || overLimit}
                  type="submit"
                >
                  {saving
                    ? 'Requesting…'
                    : entered && !overLimit
                      ? `Request ${rupees(value)}`
                      : 'Request'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
