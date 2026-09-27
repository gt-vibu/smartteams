'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { Branch, LeaveType } from '@smarteam/contracts';
import { leaveAdminBusyKey, type LeaveAdminState } from '../../hooks/use-leave-admin';
import { ACCRUAL_LABEL, LeaveTypeDialog } from './leave-type-dialog';
import type { LeaveTypeInput } from '../../repositories/leave.repository';

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
  const [dialog, setDialog] = useState<{ open: boolean; editing: LeaveType | null }>({
    open: false,
    editing: null,
  });
  const [assignBranch, setAssignBranch] = useState<Record<string, string>>({});
  const editingId = dialog.editing?.id ?? null;
  const busy = editingId
    ? admin.isBusy(leaveAdminBusyKey.updateType(editingId))
    : admin.isBusy(leaveAdminBusyKey.createType);

  const save = async (input: LeaveTypeInput) => {
    if (!editingId) return Boolean(await admin.createType(input));
    return Boolean(
      await admin.updateType(editingId, {
        name: input.name,
        paid: input.paid,
        accrualType: input.accrualType,
        annualAllowance: input.annualAllowance,
        monthlyAccrual: input.monthlyAccrual,
        carryoverLimit: input.carryoverLimit,
        prorateForJoiners: input.prorateForJoiners,
        sandwichOffDays: input.sandwichOffDays,
        encashable: input.encashable,
        maxEncashDays: input.maxEncashDays,
        isCompOff: input.isCompOff,
        compOffExpiryDays: input.compOffExpiryDays,
        requiresAttachment: input.requiresAttachment,
      }),
    );
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
          <Button
            onClick={() => setDialog({ open: true, editing: null })}
            size="sm"
            type="button"
            variant="outline"
          >
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
          <div
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
            key={type.id}
          >
            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {type.name}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {type.code}
                  </span>
                </p>
                {/* The badge already says paid or unpaid; repeating it here left the line long
                    enough to wrap a word at a time beside the assignment control. */}
                <p className="text-[11px] text-muted-foreground">{describeType(type)}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge variant={type.paid ? 'secondary' : 'outline'}>
                  {type.paid ? 'Paid' : 'Unpaid'}
                </Badge>
                {admin.canWriteTypes && (
                  <Button
                    onClick={() => setDialog({ open: true, editing: type })}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                )}
              </span>
            </div>

            {admin.canWriteTypes && branches.length > 0 && (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <SelectMenu
                  disabled={admin.isBusy(leaveAdminBusyKey.assign(type.code))}
                  onValueChange={(value) =>
                    setAssignBranch((prev) => ({ ...prev, [type.code]: value }))
                  }
                  value={assignBranch[type.code] ?? ''}
                >
                  <SelectTrigger
                    aria-label={`Branch for ${type.name}`}
                    className="w-full min-w-0 sm:w-44"
                  >
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
                  className="shrink-0"
                  disabled={
                    admin.isBusy(leaveAdminBusyKey.assign(type.code)) || !assignBranch[type.code]
                  }
                  onClick={() => void admin.assignType(type.code, assignBranch[type.code]!)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {admin.isBusy(leaveAdminBusyKey.assign(type.code)) ? 'Assigning…' : 'Assign'}
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

      <LeaveTypeDialog
        busy={busy}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
        onSave={save}
        open={dialog.open}
        saveError={admin.saveError}
      />
    </section>
  );
}

/** One line a person can read: "Earned every month · 1.5 a month · up to 5 carry forward". */
function describeType(type: LeaveType) {
  const label = (ACCRUAL_LABEL as Record<string, string | undefined>)[type.accrualType];
  const parts = [label ?? type.accrualType];
  if (type.accrualType === 'FIXED_ANNUAL' && type.annualAllowance)
    parts.push(
      `${type.annualAllowance} days a year${type.prorateForJoiners === false ? '' : ', pro-rated for joiners'}`,
    );
  if (type.accrualType === 'MONTHLY' && type.monthlyAccrual)
    parts.push(`${type.monthlyAccrual} a month`);
  if (type.isCompOff) parts.push('comp-off');
  if (type.sandwichOffDays) parts.push('sandwich rule');
  if (type.encashable) parts.push('encashable');
  if (type.accrualType === 'FIXED_ANNUAL' || type.accrualType === 'MONTHLY')
    parts.push(
      type.carryoverLimit ? `up to ${type.carryoverLimit} carry forward` : 'no carry forward',
    );
  return parts.join(' · ');
}
