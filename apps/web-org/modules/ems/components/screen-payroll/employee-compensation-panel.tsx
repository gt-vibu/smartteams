'use client';

import React, { useState } from 'react';
import { Badge, Button, DatePicker, Input, Label } from '@smarteam/ui';
import { formatMoney, type SalaryProfile } from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';
import { PayrollStructurePanel } from './payroll-structure-panel';
import { AssignComponentDialog } from './assign-component-dialog';

/**
 * One employee's compensation: what an administrator configures, and what payroll derives from it.
 *
 * The split matters. Gross salary and component assignments are *inputs* an administrator sets.
 * Base, HRA, other allowance and every statutory deduction are *outputs* the backend derives from
 * the organisation's payroll policy — the builder this replaced let an administrator type
 * "Basic = 50%" and "HRA = 40% of Basic" into the browser, where they governed nothing.
 */
export function EmployeeCompensationPanel({ compensation }: { compensation: CompensationState }) {
  const [assigning, setAssigning] = useState(false);

  if (!compensation.employeeId) {
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-bold text-foreground">Select an employee</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Compensation is configured per employee.
        </p>
      </div>
    );
  }

  if (compensation.profileForbidden) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
        role="status"
      >
        <p className="text-sm font-bold text-foreground">Not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Reading another employee&apos;s salary profile needs the organisation-wide permission.
        </p>
      </div>
    );
  }

  if (compensation.profileLoading) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground" role="status">
        Loading compensation...
      </p>
    );
  }

  if (compensation.profileError || !compensation.profile) {
    return (
      <div
        className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center"
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
    <div className="space-y-5">
      <SalaryInputs compensation={compensation} profile={compensation.profile} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-foreground">Assigned components</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Effective-dated. A new period is added rather than overwriting an old one.
            </p>
          </div>
          {compensation.can.assign && (
            <Button onClick={() => setAssigning(true)} size="sm" type="button" variant="outline">
              Assign component
            </Button>
          )}
        </div>
        <AssignmentTable profile={compensation.profile} />
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="text-xs font-bold text-foreground">Derived by payroll</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Calculated from the organisation&apos;s payroll policy and statutory rules. Not
            editable.
          </p>
        </div>
        <PayrollStructurePanel profile={compensation.profile} />
      </section>

      <AssignComponentDialog
        compensation={compensation}
        onOpenChange={setAssigning}
        open={assigning}
      />
    </div>
  );
}

/** Gross salary and the payroll flags — the only compensation values an administrator sets. */
function SalaryInputs({
  compensation,
  profile,
}: {
  compensation: CompensationState;
  profile: SalaryProfile;
}) {
  const current = profile.compensation;
  const [gross, setGross] = useState(String(current?.grossSalary ?? current?.baseAmount ?? ''));
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const policy = profile.employeePolicy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const grossSalary = Number(gross);
    if (!Number.isFinite(grossSalary) || grossSalary < 0 || !effectiveFrom) return;
    await compensation.saveSalary({
      grossSalary,
      overtimeMultiplier: Number(current?.overtimeMultiplier ?? 1.5),
      effectiveFrom,
      payrollEnabled: policy?.payrollEnabled ?? true,
      salarySlipMode: policy?.salarySlipMode ?? 'ENABLED',
      pfEnabled: policy?.pfEnabled ?? false,
      esiEnabled: policy?.esiEnabled ?? false,
      ptEnabled: policy?.ptEnabled ?? false,
    });
  };

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-bold text-foreground">Configured salary</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Monthly gross. Everything below it is derived from this figure.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={submit}
      >
        <div>
          <Label className="mb-1 block" htmlFor="gross-salary">
            Monthly gross
          </Label>
          <Input
            className="w-40"
            disabled={compensation.saving || !compensation.can.saveSalary}
            id="gross-salary"
            inputMode="decimal"
            onChange={(event) => setGross(event.target.value)}
            type="number"
            value={gross}
          />
        </div>
        <div>
          <Label className="mb-1 block" htmlFor="salary-effective-from">
            Effective from
          </Label>
          <DatePicker
            className="w-40"
            disabled={compensation.saving || !compensation.can.saveSalary}
            id="salary-effective-from"
            onChange={setEffectiveFrom}
            value={effectiveFrom}
          />
        </div>
        {compensation.can.saveSalary && (
          <Button disabled={compensation.saving || !effectiveFrom} size="sm" type="submit">
            {compensation.saving ? 'Saving...' : 'Save salary'}
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'PF', on: policy?.pfEnabled },
            { label: 'ESI', on: policy?.esiEnabled },
            { label: 'PT', on: policy?.ptEnabled },
          ].map((flag) => (
            <Badge key={flag.label} variant={flag.on ? 'success' : 'secondary'}>
              {flag.label} {flag.on ? 'on' : 'off'}
            </Badge>
          ))}
        </div>
      </form>
      {compensation.saveError && (
        <p className="text-xs text-destructive" role="alert">
          {compensation.saveError}
        </p>
      )}
    </section>
  );
}

function AssignmentTable({ profile }: { profile: SalaryProfile }) {
  const assignments = profile.components ?? [];
  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-xs text-muted-foreground">
          No components are assigned. Payroll still pays base, HRA and other allowance from the
          policy.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-border bg-table-header">
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-bold">Component</th>
            <th className="px-4 py-2.5 font-bold">Value</th>
            <th className="px-4 py-2.5 font-bold">From</th>
            <th className="px-4 py-2.5 font-bold">To</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              key={assignment.id}
            >
              <td className="px-4 py-2.5 font-semibold text-foreground">
                {assignment.payComponent?.name ?? assignment.payComponentId.slice(0, 8)}
              </td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {assignment.percentage !== null && assignment.percentage !== undefined
                  ? `${assignment.percentage}% of base`
                  : formatMoney(assignment.amount ?? null)}
              </td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {assignment.effectiveFrom.slice(0, 10)}
              </td>
              <td className="px-4 py-2.5 font-mono text-muted-foreground">
                {assignment.effectiveTo ? assignment.effectiveTo.slice(0, 10) : 'Open'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
