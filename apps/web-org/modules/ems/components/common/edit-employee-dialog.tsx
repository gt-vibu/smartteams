'use client';

import React, { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  emailProblem,
  employeeDisplayName,
  LIMITS,
  personNameProblem,
  type Employee,
  type EmployeeDetail,
} from '@smarteam/contracts';
import {
  editFormFrom,
  useEmployeeEdit,
  type EmployeeEditForm,
} from '../../hooks/use-employee-edit';
import { useDepartments } from '../../hooks/use-departments';
import { useOrganization } from '../../hooks/use-organization';
import { useEmployees } from '../../hooks/use-workforce';
import { Field, Fieldset } from '../screen-onboarding/form-fields';
import { JobTitlePicker } from '../screen-onboarding/job-title-picker';
import { activeByName, byName } from '../../lib/pickable';
import { PhoneField, phoneIsValid } from './phone-field';
import { CheckedInput, optionalProblem } from './checked-input';

const NONE = '__none__';

/**
 * Edit an employee after onboarding: name, contact details, employment type and date, branch,
 * department, job title and manager. The employee ID and Aadhaar are not edited here; the ID is
 * the person's identity across payroll and history, and Aadhaar has its own personal-details form.
 */
export function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
  detail,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  detail: EmployeeDetail;
  onSaved: () => void;
}) {
  const edit = useEmployeeEdit();
  const departments = useDepartments();
  const organization = useOrganization();
  const employees = useEmployees();
  const [initial, setInitial] = useState<EmployeeEditForm>(() => editFormFrom(employee, detail));
  const [form, setForm] = useState<EmployeeEditForm>(initial);

  useEffect(() => {
    if (!open) return;
    const start = editFormFrom(employee, detail);
    setInitial(start);
    setForm(start);
    edit.clearError();
    // Reset when the dialog opens, from the record as it is then.
  }, [open]);

  const set = <K extends keyof EmployeeEditForm>(key: K, value: EmployeeEditForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  // Only what was changed is checked, as only that is sent: a record saved under older rules is
  // not held hostage to a field nobody touched.
  const changed = (key: keyof EmployeeEditForm) => form[key] !== initial[key];
  const problems = {
    firstName: changed('firstName') ? personNameProblem(form.firstName, 'First name') : null,
    lastName: changed('lastName') ? personNameProblem(form.lastName, 'Last name') : null,
    workEmail: changed('workEmail') ? optionalProblem(form.workEmail, emailProblem) : null,
    personalEmail: changed('personalEmail')
      ? optionalProblem(form.personalEmail, emailProblem)
      : null,
  };
  const valid =
    form.firstName.trim() !== '' &&
    form.lastName.trim() !== '' &&
    (!changed('phone') || phoneIsValid(form.phone)) &&
    Object.values(problems).every((problem) => problem === null);
  // A manager cannot be the employee themselves.
  const managers = activeByName(
    (employees.data ?? []).filter((candidate) => candidate.id !== employee.id),
  );

  const submit = async () => {
    if (!dirty || !valid) return;
    if (await edit.save(employee, initial, form)) {
      onSaved();
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Edit {employeeDisplayName(employee)}</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">Employee ID {employee.employeeNumber}</p>

        <div className="mt-5 space-y-5">
          <Fieldset legend="Person">
            <Field label="First name" required>
              <CheckedInput
                maxLength={LIMITS.personName}
                onChange={(value) => set('firstName', value)}
                problem={problems.firstName}
                value={form.firstName}
              />
            </Field>
            <Field label="Last name" required>
              <CheckedInput
                maxLength={LIMITS.personName}
                onChange={(value) => set('lastName', value)}
                problem={problems.lastName}
                value={form.lastName}
              />
            </Field>
            <Field label="Work email">
              <CheckedInput
                maxLength={LIMITS.email}
                onChange={(value) => set('workEmail', value.trim())}
                problem={problems.workEmail}
                type="email"
                value={form.workEmail}
              />
            </Field>
            <Field label="Personal email">
              <CheckedInput
                maxLength={LIMITS.email}
                onChange={(value) => set('personalEmail', value.trim())}
                problem={problems.personalEmail}
                type="email"
                value={form.personalEmail}
              />
            </Field>
            <Field label="Phone">
              <PhoneField
                id="edit-phone"
                onChange={(value) => set('phone', value)}
                value={form.phone}
              />
            </Field>
          </Fieldset>

          <Fieldset legend="Employment">
            <Field label="Employment type">
              <SelectMenu
                onValueChange={(v) => set('employmentType', v)}
                value={form.employmentType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
            <Field label="Joining date">
              <DatePicker onChange={(v) => set('dateOfJoining', v)} value={form.dateOfJoining} />
            </Field>
            <Field label="Department">
              <SelectMenu
                onValueChange={(v) => {
                  const chosen = departments.departments.find((entry) => entry.id === v);
                  setForm((current) => ({
                    ...current,
                    departmentId: chosen?.id ?? '',
                    departmentName: chosen?.name ?? '',
                  }));
                }}
                value={form.departmentId || NONE}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {byName(departments.departments).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
            <Field label="Job title">
              <JobTitlePicker onChange={(v) => set('jobTitle', v)} value={form.jobTitle} />
            </Field>
            <Field label="Primary branch">
              <SelectMenu
                onValueChange={(v) => set('primaryBranchId', v === NONE ? '' : v)}
                value={form.primaryBranchId || NONE}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled={Boolean(initial.primaryBranchId)} value={NONE}>
                    No branch
                  </SelectItem>
                  {organization.branches
                    // A deactivated branch takes nobody new, but stays visible if it is theirs.
                    .filter(
                      (branch) =>
                        branch.status !== 'DEACTIVATED' || branch.id === initial.primaryBranchId,
                    )
                    .map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </SelectMenu>
              {initial.primaryBranchId && form.primaryBranchId !== initial.primaryBranchId && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This moves them from today, and the current branch stays in their history. To move
                  them from another date, use Transfer primary on their profile.
                </p>
              )}
            </Field>
            <Field label="Reports to">
              <SelectMenu
                onValueChange={(v) => set('managerEmployeeId', v === NONE ? '' : v)}
                value={form.managerEmployeeId || NONE}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled={Boolean(initial.managerEmployeeId)} value={NONE}>
                    No manager
                  </SelectItem>
                  {managers.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {employeeDisplayName(candidate)} · {candidate.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectMenu>
            </Field>
          </Fieldset>
        </div>

        {edit.error && (
          <p className="mt-4 text-xs text-destructive" role="alert">
            {edit.error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            disabled={edit.saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!dirty || !valid || edit.saving}
            onClick={() => void submit()}
            type="button"
          >
            {edit.saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
