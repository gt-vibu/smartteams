'use client';

import React, { useState } from 'react';
import {
  Badge,
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
import type { Branch } from '@smarteam/contracts';
import type { LeaveAdminState } from '../../hooks/use-leave-admin';
import type { LeaveTypeInput } from '../../repositories/leave.repository';

const ACCRUAL_TYPES: LeaveTypeInput['accrualType'][] = [
  'FIXED_ANNUAL',
  'MONTHLY',
  'PER_PAY_PERIOD',
  'MANUAL',
  'NONE',
];

/**
 * Leave types and their branch assignments.
 *
 * A type only becomes usable once assigned to a branch — that is what provisions balances — so
 * the assignment control sits next to the type rather than on a separate screen.
 */
export function LeavePolicyPanel({
  admin,
  branches,
}: {
  admin: LeaveAdminState;
  branches: Branch[];
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<LeaveTypeInput>({
    code: '',
    name: '',
    paid: true,
    accrualType: 'FIXED_ANNUAL',
    annualAllowance: 12,
    requiresAttachment: false,
  });
  const [error, setError] = useState('');
  const [assignBranch, setAssignBranch] = useState<Record<string, string>>({});

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('A code and a name are both required.');
      return;
    }
    setError('');
    const created = await admin.createType({
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
    });
    if (created) {
      setForm({
        code: '',
        name: '',
        paid: true,
        accrualType: 'FIXED_ANNUAL',
        annualAllowance: 12,
        requiresAttachment: false,
      });
      setIsCreateOpen(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Leave types
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Assign a type to a branch to provision balances for its employees.
          </p>
        </div>
        {admin.canWriteTypes && (
          <Button onClick={() => setIsCreateOpen(true)} size="sm" type="button" variant="outline">
            New type
          </Button>
        )}
      </header>

      <div className="divide-y divide-border">
        {admin.types.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No leave types have been created.
          </p>
        )}

        {admin.types.map((type) => (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={type.id}>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                {type.name}
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {type.code}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {type.paid ? 'Paid' : 'Unpaid'} · {type.accrualType}
                {type.annualAllowance !== null && type.annualAllowance !== undefined
                  ? ` · ${type.annualAllowance} days a year`
                  : ''}
              </p>
            </div>

            <Badge variant={type.paid ? 'secondary' : 'outline'}>
              {type.paid ? 'Paid' : 'Unpaid'}
            </Badge>

            {admin.canWriteTypes && branches.length > 0 && (
              <div className="flex items-center gap-2">
                <SelectMenu
                  disabled={admin.saving}
                  onValueChange={(value) =>
                    setAssignBranch((prev) => ({ ...prev, [type.code]: value }))
                  }
                  value={assignBranch[type.code] ?? ''}
                >
                  <SelectTrigger aria-label={`Branch for ${type.name}`} className="w-44">
                    <SelectValue placeholder="Assign to branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
                <Button
                  disabled={admin.saving || !assignBranch[type.code]}
                  onClick={() => void admin.assignType(type.code, assignBranch[type.code]!)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Assign
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {admin.saveError && (
        <p
          className="border-t border-border px-4 py-2 text-xs font-medium text-destructive"
          role="alert"
        >
          {admin.saveError}
        </p>
      )}

      <Dialog onOpenChange={(open) => !open && setIsCreateOpen(false)} open={isCreateOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogTitle className="border-b border-border px-5 py-4 text-sm font-semibold">
            New leave type
          </DialogTitle>

          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="mb-1 block" htmlFor="type-code">
                  Code
                </Label>
                <Input
                  disabled={admin.saving}
                  id="type-code"
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                  placeholder="CL"
                  value={form.code}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block" htmlFor="type-name">
                  Name
                </Label>
                <Input
                  disabled={admin.saving}
                  id="type-name"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Casual Leave"
                  value={form.name}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block" htmlFor="type-accrual">
                  Accrual
                </Label>
                <SelectMenu
                  disabled={admin.saving}
                  onValueChange={(value) =>
                    setForm({ ...form, accrualType: value as LeaveTypeInput['accrualType'] })
                  }
                  value={form.accrualType}
                >
                  <SelectTrigger id="type-accrual">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCRUAL_TYPES.map((accrual) => (
                      <SelectItem key={accrual} value={accrual}>
                        {accrual}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </div>
              <div>
                <Label className="mb-1 block" htmlFor="type-allowance">
                  Annual allowance
                </Label>
                <Input
                  disabled={admin.saving}
                  id="type-allowance"
                  min={0}
                  onChange={(event) =>
                    setForm({ ...form, annualAllowance: Number(event.target.value) })
                  }
                  type="number"
                  value={form.annualAllowance ?? 0}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={form.paid}
                  disabled={admin.saving}
                  onCheckedChange={(checked) => setForm({ ...form, paid: checked === true })}
                />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={form.requiresAttachment}
                  disabled={admin.saving}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, requiresAttachment: checked === true })
                  }
                />
                Requires an attachment
              </label>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Unpaid leave reduces payable days in payroll; paid leave does not.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p className="text-[11px] font-medium text-destructive" role="alert">
              {error || admin.saveError}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={admin.saving}
                onClick={() => setIsCreateOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={admin.saving} onClick={() => void submit()} type="button">
                {admin.saving ? 'Saving...' : 'Create type'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
