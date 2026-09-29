'use client';

import React, { useEffect, useState } from 'react';
import type { LeaveType } from '@smarteam/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { LeaveTypeInput } from '../../repositories/leave.repository';
import { LIMITS, codeProblem, textProblem } from '@smarteam/contracts';

type Accrual = LeaveTypeInput['accrualType'];

/** How each way of earning leave reads to the person setting it up. */
export const ACCRUAL_LABEL: Record<Accrual, string> = {
  FIXED_ANNUAL: 'A fixed allowance each year',
  MONTHLY: 'Earned every month',
  MANUAL: 'Granted by an administrator',
  NONE: 'Not tracked as a balance',
  PER_PAY_PERIOD: 'Per pay period',
};

/** Offered for new types. Per pay period has no accrual engine behind it, so it is not offered. */
const OFFERED: Accrual[] = ['FIXED_ANNUAL', 'MONTHLY', 'MANUAL', 'NONE'];

const EMPTY: LeaveTypeInput = {
  code: '',
  name: '',
  paid: true,
  accrualType: 'FIXED_ANNUAL',
  annualAllowance: 12,
  requiresAttachment: false,
  prorateForJoiners: true,
};

const fromType = (type: LeaveType): LeaveTypeInput => ({
  code: type.code,
  name: type.name,
  paid: type.paid,
  accrualType: type.accrualType as Accrual,
  annualAllowance: type.annualAllowance ?? undefined,
  monthlyAccrual: type.monthlyAccrual ?? undefined,
  carryoverLimit: type.carryoverLimit ?? undefined,
  prorateForJoiners: type.prorateForJoiners ?? true,
  sandwichOffDays: type.sandwichOffDays ?? false,
  encashable: type.encashable ?? false,
  maxEncashDays: type.maxEncashDays ?? undefined,
  isCompOff: type.isCompOff ?? false,
  compOffExpiryDays: type.compOffExpiryDays ?? undefined,
  requiresAttachment: type.requiresAttachment ?? false,
});

const number = (value: string) => (value === '' ? undefined : Number(value));

/**
 * Creates a leave type, or edits one. Only the fields the chosen way of earning uses are shown,
 * and each says in plain words what it does — the rules here decide real balances.
 */
export function LeaveTypeDialog({
  open,
  editing,
  busy,
  saveError,
  onClose,
  onSave,
}: {
  open: boolean;
  /** The type being edited; absent when creating. */
  editing: LeaveType | null;
  busy: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (input: LeaveTypeInput) => Promise<boolean>;
}) {
  const [form, setForm] = useState<LeaveTypeInput>(EMPTY);
  const [carries, setCarries] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = editing ? fromType(editing) : EMPTY;
    setForm(next);
    setCarries((next.carryoverLimit ?? 0) > 0);
    setError('');
  }, [open, editing]);

  const set = (patch: Partial<LeaveTypeInput>) => setForm((current) => ({ ...current, ...patch }));
  const accrual = form.accrualType;

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim())
      return setError('A code and a name are both required.');
    if (accrual === 'FIXED_ANNUAL' && !(form.annualAllowance && form.annualAllowance > 0))
      return setError('Enter how many days a year this leave gives.');
    if (accrual === 'MONTHLY' && !(form.monthlyAccrual && form.monthlyAccrual > 0))
      return setError('Enter how many days are earned each month.');
    if (carries && !(form.carryoverLimit && form.carryoverLimit > 0))
      return setError('Enter the most days that can carry into next year.');
    setError('');
    const saved = await onSave({
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      annualAllowance: accrual === 'FIXED_ANNUAL' ? form.annualAllowance : undefined,
      monthlyAccrual: accrual === 'MONTHLY' ? form.monthlyAccrual : undefined,
      carryoverLimit: carries ? form.carryoverLimit : undefined,
    });
    if (saved) onClose();
  };

  const accrues = accrual === 'FIXED_ANNUAL' || accrual === 'MONTHLY';

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogTitle className="border-b border-border px-5 py-4 text-sm font-semibold">
          {editing ? `Edit ${editing.name}` : 'Add leave type'}
        </DialogTitle>

        <div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:max-h-[70vh]">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block" htmlFor="type-code">
                Code
              </Label>
              <Input
                maxLength={LIMITS.code}
                problem={codeProblem(form.code, 'Code', LIMITS.code)}
                disabled={busy || Boolean(editing)}
                id="type-code"
                onChange={(event) => set({ code: event.target.value })}
                placeholder="CL"
                value={form.code}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1 block" htmlFor="type-name">
                Name
              </Label>
              <Input
                maxLength={LIMITS.title}
                problem={textProblem(form.name, 'Name', LIMITS.title, 2)}
                disabled={busy}
                id="type-name"
                onChange={(event) => set({ name: event.target.value })}
                placeholder="Casual Leave"
                value={form.name}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block" htmlFor="type-accrual">
              How it is earned
            </Label>
            <SelectMenu
              disabled={busy}
              onValueChange={(value) => set({ accrualType: value as Accrual })}
              value={accrual}
            >
              <SelectTrigger id="type-accrual">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(OFFERED.includes(accrual) ? OFFERED : [...OFFERED, accrual]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACCRUAL_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
          </div>

          {accrual === 'FIXED_ANNUAL' && (
            <div className="space-y-2">
              <Label className="block" htmlFor="type-allowance">
                Days per year
              </Label>
              <Input
                max={366}
                disabled={busy}
                id="type-allowance"
                inputMode="decimal"
                min={0}
                onChange={(event) => set({ annualAllowance: number(event.target.value) })}
                step={0.5}
                type="number"
                value={form.annualAllowance ?? ''}
              />
              <label className="flex items-start gap-2 text-xs text-foreground">
                <Checkbox
                  checked={form.prorateForJoiners ?? true}
                  className="mt-0.5"
                  disabled={busy}
                  onCheckedChange={(checked) => set({ prorateForJoiners: checked === true })}
                />
                <span>
                  Pro-rate for people who join mid-year
                  <span className="block text-[11px] text-muted-foreground">
                    Someone joining in October gets the three months left, not the whole year.
                  </span>
                </span>
              </label>
            </div>
          )}

          {accrual === 'MONTHLY' && (
            <div>
              <Label className="mb-1 block" htmlFor="type-monthly">
                Days earned each month
              </Label>
              <Input
                max={31}
                disabled={busy}
                id="type-monthly"
                inputMode="decimal"
                min={0}
                onChange={(event) => set({ monthlyAccrual: number(event.target.value) })}
                step={0.5}
                type="number"
                value={form.monthlyAccrual ?? ''}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Added at the start of each month, from the month someone joins.
              </p>
            </div>
          )}

          {accrues && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex items-start gap-2 text-xs text-foreground">
                <Checkbox
                  checked={carries}
                  className="mt-0.5"
                  disabled={busy}
                  onCheckedChange={(checked) => setCarries(checked === true)}
                />
                <span>
                  Unused days carry into next year
                  <span className="block text-[11px] text-muted-foreground">
                    Anything above the limit lapses when the leave year closes.
                  </span>
                </span>
              </label>
              {carries && (
                <div>
                  <Label className="mb-1 block" htmlFor="type-carry">
                    Most days that carry forward
                  </Label>
                  <Input
                    max={366}
                    disabled={busy}
                    id="type-carry"
                    inputMode="decimal"
                    min={0}
                    onChange={(event) => set({ carryoverLimit: number(event.target.value) })}
                    step={0.5}
                    type="number"
                    value={form.carryoverLimit ?? ''}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Rules
            </p>
            <Rule
              busy={busy}
              checked={form.sandwichOffDays ?? false}
              hint="Leave on Friday and Monday counts the weekend between too."
              label="Weekends and holidays between leave days count as leave"
              onChange={(checked) => set({ sandwichOffDays: checked })}
            />
            <Rule
              busy={busy}
              checked={form.encashable ?? false}
              hint="Paid at the monthly gross over thirty, per day, in the next payroll."
              label="Unused days can be exchanged for pay"
              onChange={(checked) => set({ encashable: checked })}
            />
            {form.encashable && (
              <div className="pl-6">
                <Label className="mb-1 block" htmlFor="type-encash-max">
                  Most days a year{' '}
                  <span className="text-muted-foreground">(blank for no limit)</span>
                </Label>
                <Input
                  max={366}
                  className="w-28"
                  disabled={busy}
                  id="type-encash-max"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => set({ maxEncashDays: number(event.target.value) })}
                  step={0.5}
                  type="number"
                  value={form.maxEncashDays ?? ''}
                />
              </div>
            )}
            <Rule
              busy={busy}
              checked={form.isCompOff ?? false}
              hint="Earned by working a weekly off or a holiday, approved by the manager."
              label="This is the comp-off leave"
              onChange={(checked) =>
                set({ isCompOff: checked, ...(checked ? { accrualType: 'MANUAL' as const } : {}) })
              }
            />
            {form.isCompOff && (
              <div className="pl-6">
                <Label className="mb-1 block" htmlFor="type-comp-expiry">
                  Use within (days){' '}
                  <span className="text-muted-foreground">(blank: never lapses)</span>
                </Label>
                <Input
                  max={365}
                  step={1}
                  className="w-28"
                  disabled={busy}
                  id="type-comp-expiry"
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => set({ compOffExpiryDays: number(event.target.value) })}
                  type="number"
                  value={form.compOffExpiryDays ?? ''}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={form.paid}
                disabled={busy}
                onCheckedChange={(checked) => set({ paid: checked === true })}
              />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={form.requiresAttachment}
                disabled={busy}
                onCheckedChange={(checked) => set({ requiresAttachment: checked === true })}
              />
              Requires an attachment
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Unpaid leave reduces payable days in payroll; paid leave does not.
            {editing && ' Changes add to balances from the next update; days already given stay.'}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()} type="button">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create type'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Rule({
  label,
  hint,
  checked,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-foreground">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={busy}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span>
        {label}
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
