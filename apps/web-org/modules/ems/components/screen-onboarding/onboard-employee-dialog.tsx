'use client';

import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@smarteam/ui';
import {
  aadhaarProblem,
  codeProblem,
  dateProblem,
  emailProblem,
  LIMITS,
  personNameProblem,
  type Branch,
  type Employee,
} from '@smarteam/contracts';
import type { OnboardingInput } from '../../hooks/use-employee-onboarding';
import { useDepartments } from '../../hooks/use-departments';
import { DepartmentDialog } from '../organization/department-dialog';
import { localDateKey } from '../../lib/local-date';
import { phoneIsValid } from '../common/phone-field';
import { optionalProblem } from '../common/checked-input';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { useSession } from '../../hooks/auth-context';
import {
  OnboardAccessFields,
  OnboardEmploymentFields,
  OnboardPersonFields,
  type OnboardEmployeeForm,
} from './onboard-employee-fields';

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  /** Each person's current job title, shown beside their name in "Reports to". */
  jobTitles?: ReadonlyMap<string, string>;
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
  onSubmit: (input: OnboardingInput) => void | Promise<boolean>;
};

const EMPTY: OnboardEmployeeForm = {
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
  jobTitles,
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [tab, setTab] = useState<'person' | 'employment' | 'access'>('person');
  const { session } = useSession();
  const departments = useDepartments();
  const [addingDepartment, setAddingDepartment] = useState(false);
  const department = departments.departments.find((entry) => entry.id === form.departmentId);
  // The department's series numbers the new joiner; only without one is the number typed.
  const autoNumber = department?.nextEmployeeNumber ?? null;
  const roleId = form.roleId || employeeRoleId || '';
  // Cleared whenever the dialog closes, however it closes. The screen closes it itself after a
  // successful onboarding, which skipped the old reset and opened the next one pre-filled.
  useEffect(() => {
    if (!open) {
      setForm({ ...EMPTY });
      setTab('person');
    } else {
      if (defaultBranchId)
        setForm((current) =>
          current.primaryBranchId ? current : { ...current, primaryBranchId: defaultBranchId },
        );
      const organizationId = session?.organizationId;
      if (organizationId) {
        void apiRequest(orgPath(organizationId, '/workflow-drafts?kind=EMPLOYEE_ONBOARDING'), {
          method: 'GET',
        })
          .then((value) => {
            const drafts = value as Array<{ id: string; payload: OnboardEmployeeForm }>;
            if (drafts[0]?.payload) {
              setDraftId(drafts[0].id);
              setDraftNotice('A saved onboarding draft is ready to resume.');
              setForm((current) =>
                current.firstName || current.lastName
                  ? current
                  : { ...EMPTY, ...drafts[0]!.payload },
              );
            }
          })
          .catch(() =>
            setDraftNotice('Saved draft could not be loaded. Check your connection and retry.'),
          );
      }
    }
  }, [open, defaultBranchId, session?.organizationId]);

  const set = (key: keyof OnboardEmployeeForm, value: string) =>
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
  // Each field held to the rule the API applies, so what the form accepts the server accepts.
  const problems = {
    firstName: personNameProblem(form.firstName, 'First name'),
    lastName: personNameProblem(form.lastName, 'Last name'),
    workEmail: optionalProblem(form.workEmail, emailProblem),
    personalEmail: optionalProblem(form.personalEmail, emailProblem),
    employeeNumber: optionalProblem(form.employeeNumber, (value) =>
      codeProblem(value, 'Employee ID', LIMITS.employeeNumber),
    ),
    dateOfJoining: dateProblem(form.dateOfJoining, 'Joining date', {
      earliest: '1950-01-01',
      latest: `${new Date().getFullYear() + 1}-12-31`,
    }),
  };
  const personComplete =
    Boolean(form.firstName.trim() && form.lastName.trim() && form.aadhaarNumber.trim()) &&
    problems.firstName === null &&
    problems.lastName === null &&
    problems.workEmail === null &&
    problems.personalEmail === null &&
    aadhaarError === null &&
    phoneIsValid(form.phone) &&
    // Required whenever a login can be made: it is the address they sign in with.
    (!accountPossible || accountEmail.length > 0);
  const employmentComplete =
    Boolean(
      form.employmentType &&
      form.dateOfJoining &&
      form.primaryBranchId &&
      branches.some(
        (branch) => branch.id === form.primaryBranchId && branch.status !== 'DEACTIVATED',
      ),
    ) &&
    problems.employeeNumber === null &&
    problems.dateOfJoining === null;
  const accessComplete = !accountPossible || Boolean(roleId && accountEmail);
  const complete = personComplete && employmentComplete && accessComplete;
  const progress = personComplete ? (employmentComplete ? 100 : 50) : 0;

  const submit = async () => {
    if (!complete || busy) return;
    const completed = await onSubmit({
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
    if (completed && draftId && session?.organizationId) {
      // The completed employee record supersedes the unfinished form, so it is removed from
      // the encrypted draft store instead of reappearing as stale onboarding input next time.
      await apiRequest(orgPath(session.organizationId, `/workflow-drafts/${draftId}`), {
        method: 'DELETE',
      }).catch(() => undefined);
      setDraftId(null);
    }
  };

  const saveDraft = async () => {
    const organizationId = session?.organizationId;
    if (!organizationId || draftBusy) return;
    setDraftBusy(true);
    setDraftNotice(null);
    try {
      const saved = (await apiRequest(orgPath(organizationId, '/workflow-drafts'), {
        method: 'POST',
        body: {
          kind: 'EMPLOYEE_ONBOARDING',
          title:
            `Onboarding: ${form.firstName.trim()} ${form.lastName.trim()}`.trim() ||
            'Employee onboarding',
          payload: form,
        },
      })) as { id: string };
      setDraftId(saved.id);
      setDraftNotice('Draft saved securely. You can close this form and resume later.');
    } catch {
      setDraftNotice('Draft was not saved. Check your connection and try again.');
    } finally {
      setDraftBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(92dvh,52rem)] max-h-[calc(100dvh-0.5rem)] w-full flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:w-[95vw] sm:max-w-2xl sm:rounded-xl sm:max-h-[90vh]">
        <header className="shrink-0 border-b border-border bg-card px-5 py-4 pr-12">
          <DialogTitle>Add employee</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave unknown details blank and add them later.
          </p>
          {draftNotice && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {draftNotice}
              {draftId ? ' · Saved draft available' : ''}
            </p>
          )}
        </header>

        <Tabs
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={(value) => setTab(value as typeof tab)}
          value={tab}
        >
          <div className="mx-5 mt-3 shrink-0">
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute left-[16.666%] right-[16.666%] top-4 h-0.5 bg-muted"
              />
              <div
                aria-hidden="true"
                className="absolute left-[16.666%] top-4 h-0.5 bg-primary transition-[width] duration-300"
                style={{ width: `${progress * 0.66668}%` }}
              />
              <TabsList
                aria-label="Employee onboarding progress"
                className="relative grid h-auto w-full grid-cols-3 items-start rounded-none bg-transparent p-0"
              >
                <TabsTrigger
                  className="group z-10 h-auto flex-col gap-1 rounded-none bg-transparent px-1 py-0 text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  value="person"
                >
                  <StepMarker active={tab === 'person'} complete={personComplete} number="1" />
                  <span className="text-xs font-semibold">Person</span>
                </TabsTrigger>
                <TabsTrigger
                  className="group z-10 h-auto flex-col gap-1 rounded-none bg-transparent px-1 py-0 text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  disabled={!personComplete}
                  value="employment"
                >
                  <StepMarker
                    active={tab === 'employment'}
                    complete={personComplete && employmentComplete}
                    number="2"
                  />
                  <span className="text-xs font-semibold">Employment</span>
                </TabsTrigger>
                <TabsTrigger
                  className="group z-10 h-auto flex-col gap-1 rounded-none bg-transparent px-1 py-0 text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  disabled={!personComplete || !employmentComplete}
                  value="access"
                >
                  <StepMarker active={tab === 'access'} complete={false} number="3" />
                  <span className="text-xs font-semibold">Access</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <TabsContent className="mt-0" value="person">
              <OnboardPersonFields
                accountPossible={accountPossible}
                aadhaarError={aadhaarError}
                form={form}
                problems={problems}
                set={set}
                showAadhaarError={showAadhaarError}
              />
            </TabsContent>
            <TabsContent className="mt-0" value="employment">
              <OnboardEmploymentFields
                autoNumber={autoNumber}
                branches={branches}
                departments={departments}
                departmentName={department?.name}
                employees={employees}
                form={form}
                jobTitles={jobTitles}
                onDepartmentSelect={(value) => {
                  if (value === NEW_DEPARTMENT) setAddingDepartment(true);
                  else set('departmentId', value === 'none' ? '' : value);
                }}
                problems={problems}
                set={set}
              />
            </TabsContent>
            <TabsContent className="mt-0" value="access">
              <OnboardAccessFields
                accountEmail={accountEmail}
                accountPossible={accountPossible}
                canCreateAccount={canCreateAccount}
                form={form}
                roleId={roleId}
                roles={roles}
                set={set}
              />
            </TabsContent>
          </div>
        </Tabs>

        <footer className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <p
              className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <span className="font-semibold">Not saved. </span>
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="max-w-52 text-[11px] text-muted-foreground" aria-live="polite">
              {tab === 'person' && !personComplete
                ? 'Complete the required person details to continue.'
                : tab === 'employment' && !employmentComplete
                  ? 'Complete the required employment details to continue.'
                  : tab === 'access' && !accessComplete
                    ? 'Enter a valid work email and access profile to continue.'
                    : tab === 'access'
                      ? 'All required details are ready.'
                      : 'Required details are complete.'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={draftBusy || busy}
                onClick={() => void saveDraft()}
                type="button"
                variant="outline"
              >
                {draftBusy ? 'Saving…' : 'Save as draft'}
              </Button>
              <Button
                disabled={busy}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              {tab !== 'person' && (
                <Button
                  disabled={busy}
                  onClick={() => setTab(tab === 'access' ? 'employment' : 'person')}
                  type="button"
                  variant="outline"
                >
                  Back
                </Button>
              )}
              {tab === 'person' ? (
                <Button
                  disabled={!personComplete || busy}
                  onClick={() => setTab('employment')}
                  type="button"
                >
                  Continue
                </Button>
              ) : tab === 'employment' ? (
                <Button
                  disabled={!employmentComplete || busy}
                  onClick={() => setTab('access')}
                  type="button"
                >
                  Continue
                </Button>
              ) : (
                <Button disabled={!complete || busy} onClick={submit} type="button">
                  {busy ? 'Creating…' : 'Create employee'}
                </Button>
              )}
            </div>
          </div>
        </footer>
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

function StepMarker({
  active,
  complete,
  number,
}: {
  active: boolean;
  complete: boolean;
  number: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 place-items-center rounded-full border-2 bg-card text-xs font-semibold transition-colors ${
        complete
          ? 'border-primary bg-primary text-primary-foreground'
          : active
            ? 'border-primary text-primary'
            : 'border-border text-muted-foreground'
      }`}
    >
      {complete ? <Check className="size-4" /> : number}
    </span>
  );
}
