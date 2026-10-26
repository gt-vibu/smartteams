'use client';

import {
  EMPLOYMENT_TYPE_OPTIONS,
  employeeDisplayName,
  formatAadhaar,
  LIMITS,
  type Branch,
  type Employee,
} from '@smarteam/contracts';
import {
  DatePicker,
  Input,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import { Field, Fieldset } from './form-fields';
import { CheckedInput } from '../common/checked-input';
import { PhoneField } from '../common/phone-field';
import { ShiftPicker } from '../common/shift-picker';
import { JobTitlePicker } from './job-title-picker';
import { activeByName, byName } from '../../lib/pickable';
import type { useDepartments } from '../../hooks/use-departments';

export type OnboardEmployeeForm = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  aadhaarNumber: string;
  employmentType: string;
  dateOfJoining: string;
  primaryBranchId: string;
  jobTitle: string;
  departmentId: string;
  roleId: string;
  managerEmployeeId: string;
  shiftId: string;
};

type SetField = (key: keyof OnboardEmployeeForm, value: string) => void;

export function OnboardPersonFields({
  form,
  set,
  problems,
  aadhaarError,
  showAadhaarError,
  accountPossible,
}: {
  form: OnboardEmployeeForm;
  set: SetField;
  problems: {
    firstName: string | null;
    lastName: string | null;
    workEmail: string | null;
    personalEmail: string | null;
  };
  aadhaarError: string | null;
  showAadhaarError: boolean;
  accountPossible: boolean;
}) {
  return (
    <Fieldset legend="Person">
      <Field label="First name" required>
        <CheckedInput
          autoComplete="given-name"
          maxLength={LIMITS.personName}
          onChange={(value) => set('firstName', value)}
          problem={problems.firstName}
          value={form.firstName}
        />
      </Field>
      <Field label="Last name" required>
        <CheckedInput
          autoComplete="family-name"
          maxLength={LIMITS.personName}
          onChange={(value) => set('lastName', value)}
          problem={problems.lastName}
          value={form.lastName}
        />
      </Field>
      <Field label="Work email" required={accountPossible}>
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
          id="onboard-phone"
          onChange={(value) => set('phone', value)}
          value={form.phone}
        />
      </Field>
      <Field label="Aadhaar number" required>
        <Input
          aria-invalid={showAadhaarError || undefined}
          inputMode="numeric"
          maxLength={14}
          onChange={(event) => set('aadhaarNumber', formatAadhaar(event.target.value))}
          placeholder="1234 5678 9012"
          value={form.aadhaarNumber}
        />
        {showAadhaarError && <p className="mt-1 text-[11px] text-destructive">{aadhaarError}</p>}
      </Field>
    </Fieldset>
  );
}

export function OnboardEmploymentFields({
  form,
  set,
  problems,
  departments,
  branches,
  employees,
  jobTitles,
  autoNumber,
  departmentName,
  onDepartmentSelect,
}: {
  form: OnboardEmployeeForm;
  set: SetField;
  problems: { employeeNumber: string | null; dateOfJoining: string | null };
  departments: ReturnType<typeof useDepartments>;
  branches: Branch[];
  employees: Employee[];
  jobTitles?: ReadonlyMap<string, string>;
  autoNumber: string | null;
  departmentName?: string;
  onDepartmentSelect: (value: string) => void;
}) {
  return (
    <Fieldset legend="Employment">
      <Field label="Department">
        <SelectMenu onValueChange={onDepartmentSelect} value={form.departmentId || 'none'}>
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
            {departments.canWrite && <SelectItem value="__new__">+ New department</SelectItem>}
          </SelectContent>
        </SelectMenu>
      </Field>
      <Field label="Employee ID">
        {autoNumber ? (
          <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
            <span className="font-mono font-semibold text-foreground">{autoNumber}</span>
            <span className="ml-2 text-[11px] text-muted-foreground">
              from the {departmentName} series
            </span>
          </div>
        ) : (
          <>
            <CheckedInput
              maxLength={LIMITS.employeeNumber}
              onChange={(value) => set('employeeNumber', value.toUpperCase())}
              placeholder="Assigned automatically"
              problem={problems.employeeNumber}
              value={form.employeeNumber}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Leave empty to assign the next employee ID.
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
            {EMPLOYMENT_TYPE_OPTIONS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectMenu>
      </Field>
      <Field label="Joining date" required>
        <DatePicker onChange={(value) => set('dateOfJoining', value)} value={form.dateOfJoining} />
      </Field>
      <Field label="Job title">
        <JobTitlePicker onChange={(value) => set('jobTitle', value)} value={form.jobTitle} />
      </Field>
      <Field label="Branch" required>
        <SelectMenu
          disabled={branches.filter((branch) => branch.status !== 'DEACTIVATED').length === 0}
          onValueChange={(value) => set('primaryBranchId', value === 'none' ? '' : value)}
          value={form.primaryBranchId || 'none'}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>
              Choose a branch
            </SelectItem>
            {branches
              .filter((branch) => branch.status !== 'DEACTIVATED')
              .map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
          </SelectContent>
        </SelectMenu>
        {branches.filter((branch) => branch.status !== 'DEACTIVATED').length === 0 && (
          <p className="text-xs text-destructive">
            Create an active branch before onboarding an employee.
          </p>
        )}
      </Field>
      <Field label="Shift">
        <ShiftPicker
          noneLabel="No shift yet"
          onChange={(value) => set('shiftId', value)}
          value={form.shiftId}
        />
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
                {[
                  employeeDisplayName(employee),
                  jobTitles?.get(employee.id),
                  employee.employeeNumber,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectMenu>
      </Field>
    </Fieldset>
  );
}

export function OnboardAccessFields({
  form,
  set,
  roles,
  roleId,
  accountPossible,
  accountEmail,
  canCreateAccount,
}: {
  form: OnboardEmployeeForm;
  set: SetField;
  roles: Array<{ id: string; name: string }>;
  roleId: string;
  accountPossible: boolean;
  accountEmail: string;
  canCreateAccount: boolean;
}) {
  return (
    <Fieldset legend="Access">
      {accountPossible && roles.length > 0 && (
        <Field label="Access profile">
          <p className="mb-1 text-[11px] text-muted-foreground">
            Controls what this person can see and do. Job title and team/project responsibilities
            are managed separately.
          </p>
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
          <p className="text-xs leading-relaxed text-muted-foreground">
            A login will be created for{' '}
            <span className="font-semibold text-foreground">
              {accountEmail || 'the work email above'}
            </span>{' '}
            with the {roles.find((role) => role.id === roleId)?.name ?? 'Employee'} access profile.
            The password appears once after creation.
          </p>
        ) : (
          <p
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            role="alert"
          >
            {canCreateAccount
              ? 'No Employee access profile is available. Add one under Organization → Access & Permissions to create a login.'
              : 'You cannot create logins. The employee record will be created without access.'}
          </p>
        )}
      </div>
      {!accountPossible && form.workEmail && (
        <p className="text-xs text-muted-foreground">
          The work email will be saved on the employee record.
        </p>
      )}
    </Fieldset>
  );
}
