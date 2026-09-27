'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import {
  aadhaarProblem,
  EMPLOYMENT_TYPE_OPTIONS,
  employeeDisplayName,
  formatAadhaar,
  type Branch,
  type Employee,
} from '@smarteam/contracts';
import type { OnboardingInput } from '../../hooks/use-employee-onboarding';
import { useDepartments } from '../../hooks/use-departments';
import { DepartmentDialog } from '../organization/department-dialog';
import { JobTitlePicker } from './job-title-picker';
import { ShiftPicker } from '../common/shift-picker';
import { Field, Fieldset } from './form-fields';
import { activeByName, byName } from '../../lib/pickable';
import { localDateKey } from '../../lib/local-date';

const NEW_DEPARTMENT = '__new__';

/**
 * The onboarding form.
 *
 * Only fields the API actually persists are collected. Nothing here is gathered and dropped: if
 * it is on this form, some endpoint stores it.
 *
 * Manager and branch are chosen from the tenant's own records rather than typed, so a value from
 * another organization cannot be entered in the first place — and the API rejects one anyway.
 */

// The API's own list: `CONTRACT` was offered here and refused, so Contract hires always failed.
const EMPLOYMENT_TYPES = EMPLOYMENT_TYPE_OPTIONS;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  branches: Branch[];
  /** The organization's main branch, where a new hire is placed unless someone picks another. */
  defaultBranchId?: string | null;
  /** The least-privilege role a new joiner receives. Absent when roles could not be read. */
  employeeRoleId: string | null;
  /** Roles the login may be given; the Employee role is chosen unless the admin picks another. */
  roles: Array<{ id: string; name: string }>;
  canCreateAccount: boolean;
  busy: boolean;
  /** Why the last attempt saved nothing, shown above the buttons. */
  error?: string | null;
  onSubmit: (input: OnboardingInput) => void;
};

const EMPTY = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  personalEmail: '',
  phone: '',
  aadhaarNumber: '',
  employmentType: 'FULL_TIME',
  dateOfJoining: localDateKey(),
  primaryBranchId: '',
  jobTitle: '',
  departmentId: '',
  roleId: '',
  managerEmployeeId: '',
  shiftId: '',
};

export function OnboardEmployeeDialog({
  open,
  onOpenChange,
  employees,
  branches,
  defaultBranchId,
  employeeRoleId,
  roles,
  canCreateAccount,
  busy,
  error,
  onSubmit,
}: Props) {
  const [form, setForm] = useState({ ...EMPTY });
  const departments = useDepartments();
  const [addingDepartment, setAddingDepartment] = useState(false);
  const department = departments.departments.find((entry) => entry.id === form.departmentId);
  // The department's series numbers the new joiner; only without one is the number typed.
  const autoNumber = department?.nextEmployeeNumber ?? null;
  const roleId = form.roleId || employeeRoleId || '';
  // Cleared whenever the dialog closes, however it closes. The screen closes it itself after a
  // successful onboarding, which skipped the old reset and opened the next one pre-filled.
  useEffect(() => {
    if (!open) setForm({ ...EMPTY });
    else if (defaultBranchId)
      setForm((current) =>
        current.primaryBranchId ? current : { ...current, primaryBranchId: defaultBranchId },
      );
  }, [open, defaultBranchId]);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const accountEmail = form.workEmail.trim();
  const accountPossible = canCreateAccount && Boolean(roleId);
  // The login is part of onboarding, not an extra. It used to be an unticked box beside an
  // optional email, so leaving the email blank produced an employee who could never sign in and
  // no password to hand over — which is the same as not having onboarded them at all.
  const wantsAccount = accountPossible && accountEmail.length > 0;

  // Shown once something has been typed, so an untouched form does not open on an error.
  const aadhaarError = aadhaarProblem(form.aadhaarNumber);
  const showAadhaarError = form.aadhaarNumber.length > 0 && aadhaarError !== null;
  const complete =
    aadhaarError === null &&
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.dateOfJoining.length === 10 &&
    // Required whenever a login can be made: it is the address they sign in with.
    (!accountPossible || accountEmail.length > 0);

  const submit = () => {
    if (!complete || busy) return;
    onSubmit({
      ...(autoNumber || !form.employeeNumber.trim()
        ? {}
        : { employeeNumber: form.employeeNumber.trim() }),
      aadhaarNumber: form.aadhaarNumber,
      ...(department ? { departmentId: department.id, department: department.name } : {}),
      firstName: form.firstName,
      lastName: form.lastName,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail,
      phone: form.phone,
      employmentType: form.employmentType,
      dateOfJoining: form.dateOfJoining,
      primaryBranchId: form.primaryBranchId || undefined,
      jobTitle: form.jobTitle,
      managerEmployeeId: form.managerEmployeeId || undefined,
      shiftId: form.shiftId || undefined,
      ...(wantsAccount && roleId
        ? {
            account: {
              email: accountEmail,
              displayName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
              roleId,
            },
          }
        : {}),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
              <Input
                inputMode="tel"
                onChange={(e) => set('phone', e.target.value)}
                value={form.phone}
              />
            </Field>
            <Field label="Aadhaar number" required>
              <Input
                aria-invalid={showAadhaarError || undefined}
                inputMode="numeric"
                onChange={(e) => set('aadhaarNumber', formatAadhaar(e.target.value))}
                placeholder="1234 5678 9012"
                value={form.aadhaarNumber}
              />
              {showAadhaarError && (
                <p className="mt-1 text-[11px] text-destructive">{aadhaarError}</p>
              )}
            </Field>
          </Fieldset>

          <Fieldset legend="Employment">
            <Field label="Department">
              <SelectMenu
                onValueChange={(value) => {
                  if (value === NEW_DEPARTMENT) setAddingDepartment(true);
                  else set('departmentId', value === 'none' ? '' : value);
                }}
                value={form.departmentId || 'none'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {byName(departments.departments).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                  {departments.canWrite && (
                    <SelectItem value={NEW_DEPARTMENT}>+ New department</SelectItem>
                  )}
                </SelectContent>
              </SelectMenu>
            </Field>
            <Field label="Employee ID">
              {autoNumber ? (
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                  <span className="font-mono font-semibold text-foreground">{autoNumber}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    from the {department?.name} series
                  </span>
                </div>
              ) : (
                <>
                  <Input
                    onChange={(e) => set('employeeNumber', e.target.value)}
                    placeholder="Assigned automatically"
                    value={form.employeeNumber}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Leave empty and the next ID (EMP001, EMP002 …) is given automatically.
                  </p>
                </>
              )}
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
              <JobTitlePicker onChange={(value) => set('jobTitle', value)} value={form.jobTitle} />
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
            <Field label="Shift">
              <ShiftPicker
                noneLabel="No shift yet"
                onChange={(value) => set('shiftId', value)}
                value={form.shiftId}
              />
              {form.shiftId && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Their shift from the joining date, until it is changed.
                </p>
              )}
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
                  {activeByName(employees).map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employeeDisplayName(employee)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
          </Fieldset>

          <Fieldset legend="Access">
            {accountPossible && roles.length > 0 && (
              <Field label="Role">
                <SelectMenu onValueChange={(value) => set('roleId', value)} value={roleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
              </Field>
            )}
            <div className="sm:col-span-2">
              {accountPossible ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  A login is created with the{' '}
                  {roles.find((role) => role.id === roleId)?.name ?? 'Employee'} role, and{' '}
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

        {error && (
          <p
            className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <span className="font-semibold">Not saved. </span>
            {error}
          </p>
        )}

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
        {/* The same dialog the Departments tab uses, so a quick-added department is a full one. */}
        <DepartmentDialog
          department={null}
          departments={departments}
          employees={employees}
          onOpenChange={setAddingDepartment}
          onSaved={(id) => set('departmentId', id)}
          open={addingDepartment}
          showMembers={false}
        />
      </DialogContent>
    </Dialog>
  );
}
