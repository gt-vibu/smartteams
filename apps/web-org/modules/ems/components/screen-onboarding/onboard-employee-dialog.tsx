'use client';

import React, { useState } from 'react';
import {
  Button,
  DatePicker,
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
import { employeeDisplayName, type Branch, type Employee } from '@smarteam/contracts';
import type { OnboardingInput } from '../../hooks/use-employee-onboarding';

/**
 * The onboarding form.
 *
 * Only fields the API actually persists are collected. Nothing here is gathered and dropped: if
 * it is on this form, some endpoint stores it.
 *
 * Manager and branch are chosen from the tenant's own records rather than typed, so a value from
 * another organization cannot be entered in the first place — and the API rejects one anyway.
 */

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  branches: Branch[];
  /** The least-privilege role a new joiner receives. Absent when roles could not be read. */
  employeeRoleId: string | null;
  canCreateAccount: boolean;
  busy: boolean;
  onSubmit: (input: OnboardingInput) => void;
};

const EMPTY = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  personalEmail: '',
  phone: '',
  employmentType: 'FULL_TIME',
  dateOfJoining: new Date().toISOString().slice(0, 10),
  primaryBranchId: '',
  jobTitle: '',
  department: '',
  managerEmployeeId: '',
};

export function OnboardEmployeeDialog({
  open,
  onOpenChange,
  employees,
  branches,
  employeeRoleId,
  canCreateAccount,
  busy,
  onSubmit,
}: Props) {
  const [form, setForm] = useState({ ...EMPTY });

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const accountEmail = form.workEmail.trim();
  const accountPossible = canCreateAccount && Boolean(employeeRoleId);
  // The login is part of onboarding, not an extra. It used to be an unticked box beside an
  // optional email, so leaving the email blank produced an employee who could never sign in and
  // no password to hand over — which is the same as not having onboarded them at all.
  const wantsAccount = accountPossible && accountEmail.length > 0;

  const complete =
    form.employeeNumber.trim().length > 0 &&
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.dateOfJoining.length === 10 &&
    // Required whenever a login can be made: it is the address they sign in with.
    (!accountPossible || accountEmail.length > 0);

  const submit = () => {
    if (!complete || busy) return;
    onSubmit({
      employeeNumber: form.employeeNumber,
      firstName: form.firstName,
      lastName: form.lastName,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail,
      phone: form.phone,
      employmentType: form.employmentType,
      dateOfJoining: form.dateOfJoining,
      primaryBranchId: form.primaryBranchId || undefined,
      jobTitle: form.jobTitle,
      department: form.department,
      managerEmployeeId: form.managerEmployeeId || undefined,
      ...(wantsAccount && employeeRoleId
        ? {
            account: {
              email: accountEmail,
              displayName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
              roleId: employeeRoleId,
            },
          }
        : {}),
    });
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setForm({ ...EMPTY });
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Add employee</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave anything you do not know yet blank &mdash; you can add it to their record later.
        </p>

        <div className="mt-5 space-y-5">
          <Fieldset legend="Person">
            <Field label="First name" required>
              <Input onChange={(e) => set('firstName', e.target.value)} value={form.firstName} />
            </Field>
            <Field label="Last name" required>
              <Input onChange={(e) => set('lastName', e.target.value)} value={form.lastName} />
            </Field>
            <Field label="Work email" required={accountPossible}>
              <Input
                onChange={(e) => set('workEmail', e.target.value)}
                type="email"
                value={form.workEmail}
              />
            </Field>
            <Field label="Personal email">
              <Input
                onChange={(e) => set('personalEmail', e.target.value)}
                type="email"
                value={form.personalEmail}
              />
            </Field>
            <Field label="Phone">
              <Input onChange={(e) => set('phone', e.target.value)} value={form.phone} />
            </Field>
          </Fieldset>

          <Fieldset legend="Employment">
            <Field label="Employee number" required>
              <Input
                onChange={(e) => set('employeeNumber', e.target.value)}
                value={form.employeeNumber}
              />
            </Field>
            <Field label="Employment type" required>
              <SelectMenu
                onValueChange={(value) => set('employmentType', value)}
                value={form.employmentType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
            <Field label="Joining date" required>
              <DatePicker
                onChange={(value) => set('dateOfJoining', value)}
                value={form.dateOfJoining}
              />
            </Field>
            <Field label="Job title">
              <Input onChange={(e) => set('jobTitle', e.target.value)} value={form.jobTitle} />
            </Field>
            <Field label="Department">
              <Input onChange={(e) => set('department', e.target.value)} value={form.department} />
            </Field>
            <Field label="Branch">
              <SelectMenu
                onValueChange={(value) => set('primaryBranchId', value === 'none' ? '' : value)}
                value={form.primaryBranchId || 'none'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
            <Field label="Reports to">
              <SelectMenu
                onValueChange={(value) => set('managerEmployeeId', value === 'none' ? '' : value)}
                value={form.managerEmployeeId || 'none'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No manager</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeDisplayName(employee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
          </Fieldset>

          <Fieldset legend="Access">
            <div className="sm:col-span-2">
              {accountPossible ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  A login is created with the Employee role, and{' '}
                  <span className="font-semibold text-foreground">
                    {accountEmail || 'the work email above'}
                  </span>{' '}
                  is what they sign in with. You get their password on the next screen, once.
                </p>
              ) : (
                <p
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  role="alert"
                >
                  {canCreateAccount
                    ? 'This organization has no Employee role, so no login can be created. Add one under Organization → Access before onboarding, or this person will not be able to sign in.'
                    : 'You do not have permission to create logins. The employee record will be created without one, and they will not be able to sign in until someone grants them access.'}
                </p>
              )}
            </div>
          </Fieldset>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={!complete || busy} onClick={submit} type="button">
            {busy ? 'Creating...' : 'Create employee'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fieldset({ children, legend }: { children: React.ReactNode; legend: string }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {legend}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1 block">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
