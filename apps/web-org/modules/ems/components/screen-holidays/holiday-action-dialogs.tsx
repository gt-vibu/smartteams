'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Input, Label, Textarea } from '@smarteam/ui';
import type { Holiday, EmployeeHolidayPolicy, EmployeeHolidaySelection } from '@smarteam/contracts';
import type { HolidaysState } from '../../hooks/use-holidays';
import { EmployeePolicyDialog, type HolidayAdminGroup } from './holiday-dialogs-shared';

/** Retires a holiday or multi-day holiday group. The API requires a reason and keeps the row. */
export function RetireHolidayDialog({
  holidays,
  holiday,
  holidayGroup,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  holiday?: Holiday | null;
  holidayGroup?: HolidayAdminGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');

  const targetGroup =
    holidayGroup ??
    (holiday
      ? {
          name: holiday.name,
          isOptional: holiday.isOptional,
          branchId: holiday.branchId ?? null,
          isActive: holiday.isActive,
          startDate: holiday.holidayDate.slice(0, 10),
          endDate: holiday.holidayDate.slice(0, 10),
          totalDays: 1,
          holidays: [holiday],
        }
      : null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetGroup || reason.trim().length < 2) return;
    let ok: unknown;
    if (targetGroup.holidays.length > 1) {
      ok = await holidays.retireHolidayGroup(
        targetGroup.holidays.map((h) => h.id),
        reason.trim(),
      );
    } else if (targetGroup.holidays[0]) {
      ok = await holidays.retireHoliday(targetGroup.holidays[0].id, reason.trim());
    }
    if (ok) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Retire {targetGroup?.name ?? 'holiday'}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {targetGroup && targetGroup.totalDays > 1
            ? `Retiring all ${targetGroup.totalDays} days (${targetGroup.startDate} → ${targetGroup.endDate}).`
            : ''}{' '}
          The holiday stops applying to future leave calculations. Leave already approved keeps the
          days it was charged.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Label className="block" htmlFor="holiday-retire-reason">
            Reason
          </Label>
          <Textarea
            disabled={holidays.saving}
            id="holiday-retire-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          {holidays.saveError && (
            <p className="text-xs text-destructive" role="alert">
              {holidays.saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={holidays.saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={holidays.saving || reason.trim().length < 2} type="submit">
              {holidays.saving ? 'Retiring...' : 'Retire'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modal showing which employees have selected a given optional holiday or holiday group.
 */
export function HolidaySelectionsDialog({
  holidayGroup,
  selections,
  open,
  onOpenChange,
}: {
  holidayGroup: HolidayAdminGroup | null;
  selections: EmployeeHolidaySelection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const targetHolidayIds = useMemo(
    () => new Set(holidayGroup?.holidays.map((h) => h.id) ?? []),
    [holidayGroup],
  );

  const matchedSelections = useMemo(
    () =>
      selections.filter(
        (sel) =>
          targetHolidayIds.has(sel.holidayId) &&
          (sel.status === 'CONFIRMED' || sel.status === 'PENDING'),
      ),
    [selections, targetHolidayIds],
  );

  const employeeGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeName: string;
        employeeNumber: string;
        workEmail: string;
        selectedDates: string[];
      }
    >();

    for (const sel of matchedSelections) {
      const empId = sel.employeeId;
      const empName = sel.employee
        ? `${sel.employee.firstName} ${sel.employee.lastName}`.trim()
        : 'Employee';
      const empNum = sel.employee?.employeeNumber || '—';
      const email = sel.employee?.workEmail || '—';
      const dateStr = sel.holiday ? sel.holiday.holidayDate.slice(0, 10) : '—';

      if (!map.has(empId)) {
        map.set(empId, {
          employeeName: empName,
          employeeNumber: empNum,
          workEmail: email,
          selectedDates: [],
        });
      }
      map.get(empId)!.selectedDates.push(dateStr);
    }

    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [matchedSelections]);

  if (!holidayGroup) return null;

  const isMultiDay = holidayGroup.totalDays > 1;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="flex items-center gap-2">
          <span>Employee Selections: {holidayGroup.name}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {employeeGroups.length} {employeeGroups.length === 1 ? 'employee' : 'employees'}
          </span>
        </DialogTitle>

        <div className="text-xs text-muted-foreground font-mono mt-1">
          {isMultiDay
            ? `${holidayGroup.startDate} → ${holidayGroup.endDate} (${holidayGroup.totalDays} days)`
            : holidayGroup.startDate}
        </div>

        <div className="mt-4">
          {employeeGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-xs font-medium text-foreground">
                No employees have selected this optional holiday yet.
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                When employees opt into this holiday from their Time Off screen, they will be listed
                here.
              </p>
            </div>
          ) : (
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-table-header">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3.5 py-2 font-bold">Employee</th>
                    <th className="px-3.5 py-2 font-bold">Employee ID</th>
                    <th className="px-3.5 py-2 font-bold">Selected Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeGroups.map((emp, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 font-medium text-foreground">
                        <div>{emp.employeeName}</div>
                        {emp.workEmail !== '—' && (
                          <div className="text-[10px] text-muted-foreground">{emp.workEmail}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-muted-foreground">
                        {emp.employeeNumber}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {emp.selectedDates.sort().map((dt) => (
                            <span
                              key={dt}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
                            >
                              {dt}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => onOpenChange(false)} size="sm" type="button" variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Configures the optional holiday allowance.
 */
export function AllowanceDialog({
  holidays,
  open,
  onOpenChange,
}: {
  holidays: HolidaysState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [allowance, setAllowance] = useState(holidays.settings.optionalHolidayAllowance);
  const [editingPolicy, setEditingPolicy] = useState<EmployeeHolidayPolicy | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (open) {
      setAllowance(holidays.settings.optionalHolidayAllowance);
      setEditingPolicy(undefined);
    }
  }, [open, holidays.settings]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const val = Math.max(0, Math.min(365, allowance));
    const ok = await holidays.updateAllowance(val);
    if (ok) {
      onOpenChange(false);
    }
  };

  const optionalHolidays = holidays.holidays.filter((h) => h.isOptional && h.isActive);
  const overrideCount = holidays.employeePolicies.length;

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Configure Optional Holiday Allowance</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Set the maximum optional holidays each employee can select per calendar year. You can
            also set per-employee overrides below.
          </p>

          <form className="mt-4 space-y-5" onSubmit={submit}>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Global Default (all employees)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  className="w-28"
                  disabled={holidays.saving}
                  id="optional-holiday-allowance"
                  min={0}
                  max={365}
                  onChange={(event) => setAllowance(Number.parseInt(event.target.value || '0', 10))}
                  type="number"
                  value={allowance}
                />
                <span className="text-xs text-muted-foreground">days / year per employee</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (allowance / 365) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {allowance} of 365 days selected
              </p>
            </div>

            {holidays.saveError && (
              <p className="text-xs text-destructive" role="alert">
                {holidays.saveError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                disabled={holidays.saving}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={holidays.saving || allowance < 0} type="submit">
                {holidays.saving ? 'Saving...' : 'Save Global Allowance'}
              </Button>
            </div>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Per-Employee Overrides
                {overrideCount > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    {overrideCount}
                  </span>
                )}
              </p>
              <Button
                onClick={() => setEditingPolicy(null)}
                size="sm"
                type="button"
                variant="outline"
              >
                + Add override
              </Button>
            </div>

            {holidays.employeePolicies.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                No per-employee overrides. All employees use the global allowance and the full
                optional holiday pool.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {holidays.employeePolicies.map((policy) => (
                  <li
                    key={policy.employeeId}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {policy.employee
                          ? `${policy.employee.firstName} ${policy.employee.lastName}`
                          : policy.employeeId}
                      </p>
                      <p className="text-muted-foreground">
                        Allowance:{' '}
                        <span className="font-medium text-foreground">
                          {policy.allowanceOverride != null
                            ? `${policy.allowanceOverride}d`
                            : 'Global default'}
                        </span>
                        {' · '}
                        Pool:{' '}
                        <span className="font-medium text-foreground">
                          {policy.restrictedHolidayIds.length > 0
                            ? `${policy.restrictedHolidayIds.length} specific`
                            : 'All'}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingPolicy(policy)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                      <Button
                        disabled={holidays.saving}
                        onClick={() => void holidays.deleteEmployeePolicy(policy.employeeId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editingPolicy !== undefined && (
        <EmployeePolicyDialog
          existingPolicy={editingPolicy}
          holidays={holidays}
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditingPolicy(undefined);
          }}
          open
          optionalHolidays={optionalHolidays}
        />
      )}
    </>
  );
}
