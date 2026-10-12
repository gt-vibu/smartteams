'use client';

import React, { useMemo, useState } from 'react';
import { Button, DatePicker, Dialog, DialogContent, DialogTitle, Input, Label } from '@smarteam/ui';
import { CheckCircle2, Users } from 'lucide-react';
import {
  workforcePreviewSchema,
  workforceOptionsSchema,
  workforcePeopleSchema,
  type WorkforceInput,
  type WorkforcePreview,
} from '@smarteam/contracts';
import type { CompensationState } from '../../hooks/use-compensation';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { useWorkforceJob } from '../../hooks/use-workforce-job';
import { useTeams } from '../../hooks/use-workforce';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { WorkforceJobProgress } from '../../components/common/workforce-job-progress';

const EMPTY_TARGET = '00000000-0000-0000-0000-000000000000';

type FilterState = {
  search: string;
  departmentId: string;
  roleId: string;
  teamId: string;
  employmentType: string;
};

/** Payroll salary changes use the same previewed, resumable background jobs as workforce setup. */
export function RoleSalaryAllotmentDialog({
  compensation,
  open,
  onOpenChange,
}: {
  compensation: CompensationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { session, hasPermission } = useSession();
  const organizationId = session?.organizationId;
  const job = useWorkforceJob();
  const teams = useTeams();
  const [grossSalary, setGrossSalary] = useState('');
  const [salaryMode, setSalaryMode] = useState<'MONTHLY' | 'LPA'>('MONTHLY');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [pfEnabled, setPfEnabled] = useState(true);
  const [ptEnabled, setPtEnabled] = useState(true);
  const [esiEnabled, setEsiEnabled] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    departmentId: '',
    roleId: '',
    teamId: '',
    employmentType: '',
  });
  const [preview, setPreview] = useState<WorkforcePreview | null>(null);
  const [previewInput, setPreviewInput] = useState<WorkforceInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useAsyncResource(
    async () =>
      workforceOptionsSchema.parse(
        await apiRequest(orgPath(organizationId!, `/workforce/options?operation=SALARY`), {
          method: 'GET',
        }),
      ),
    [organizationId],
    {
      enabled:
        open &&
        Boolean(organizationId) &&
        hasPermission('payroll.employee-profile.write') &&
        hasPermission('employees.read.all'),
    },
  );
  const filter = useMemo(
    () => ({
      allEmployees: true,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.roleId ? { roleId: filters.roleId } : {}),
      ...(filters.teamId ? { teamId: filters.teamId } : {}),
      ...(filters.employmentType
        ? {
            employmentType: filters.employmentType as
              'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN',
          }
        : {}),
    }),
    [filters],
  );
  const matching = useAsyncResource(
    async () =>
      workforcePeopleSchema.parse(
        await apiRequest(
          orgPath(
            organizationId!,
            `/workforce/people?${new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, String(value)]))}`,
          ),
          { method: 'GET' },
        ),
      ),
    [organizationId, filter],
    { enabled: open && Boolean(organizationId) && hasPermission('employees.read.all') },
  );
  const targetOptions = [
    ...(options.data?.roles ?? []).map((item) => ({ ...item, kind: 'role' })),
    ...(options.data?.departments ?? []).map((item) => ({ ...item, kind: 'department' })),
    ...(teams.data ?? []).map((item) => ({ id: item.id, name: item.name, kind: 'team' })),
  ];

  const clearPreview = () => {
    setPreview(null);
    setPreviewInput(null);
    setError('');
  };
  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    clearPreview();
  };
  const inputForPreview = (): WorkforceInput => ({
    operation: 'SALARY',
    targetId: EMPTY_TARGET,
    effectiveFrom,
    reason: 'Bulk salary assignment',
    filter,
    salary: { grossSalary: salaryMode === 'LPA' ? Number(grossSalary) * 100000 / 12 : Number(grossSalary), pfEnabled, esiEnabled, ptEnabled },
  });
  const makePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || busy || job.active) return;
    setBusy(true);
    setError('');
    try {
      const input = inputForPreview();
      const result = workforcePreviewSchema.parse(
        await apiRequest(orgPath(organizationId, '/workforce/preview'), {
          method: 'POST',
          body: input,
          timeoutMs: 60000,
        }),
      );
      setPreview(result);
      setPreviewInput(input);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview salary changes.');
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!preview || !previewInput || busy || job.active) return;
    await job.start(previewInput, preview.fingerprint);
    setPreview(null);
    setPreviewInput(null);
    await compensation.refetch();
  };
  const setSalary = (value: string) => {
    setGrossSalary(value);
    clearPreview();
    const entered = Number(value);
    const number = salaryMode === 'LPA' ? entered * 100000 / 12 : entered;
    if (Number.isFinite(number) && number > 0) setEsiEnabled(number <= 21000);
  };
  const closed = busy || job.starting || job.active;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!closed) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle className="sticky top-[-1.25rem] z-20 -mx-5 -mt-5 flex items-center gap-2 bg-card px-5 pt-5 pb-3 text-base font-bold">
          <Users className="h-5 w-5 text-primary" />
          Salary assignment
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          Choose a group or narrow the people list, review the affected employees, then apply.
          Salary values are written only after you confirm the preview.
        </p>
        <form onSubmit={(event) => void makePreview(event)} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span>Role, department or team</span>
              <select
                aria-label="Salary assignment group"
                className="block h-10 w-full rounded border border-border bg-background px-2"
                disabled={closed}
                value={
                  filters.roleId
                    ? `ROLE:${filters.roleId}`
                    : filters.departmentId
                      ? `DEPARTMENT:${filters.departmentId}`
                      : filters.teamId
                        ? `TEAM:${filters.teamId}`
                        : ''
                }
                onChange={(event) => {
                  const [kind, selectedId = ''] = event.target.value.split(':');
                  setFilters((current) => ({
                    ...current,
                    roleId: kind === 'ROLE' ? selectedId : '',
                    departmentId: kind === 'DEPARTMENT' ? selectedId : '',
                    teamId: kind === 'TEAM' ? selectedId : '',
                  }));
                  clearPreview();
                }}
              >
                <option value="">All groups</option>
                {targetOptions.map((option) => (
                  <option
                    key={`${option.kind}:${option.id}`}
                    value={`${option.kind.toUpperCase()}:${option.id}`}
                  >
                    {option.kind}: {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span>Employment type</span>
              <select
                aria-label="Salary employment type"
                className="block h-10 w-full rounded border border-border bg-background px-2"
                disabled={closed}
                value={filters.employmentType}
                onChange={(event) => updateFilter('employmentType', event.target.value)}
              >
                <option value="">All types</option>
                {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="salary-target-search">Find employees</Label>
            <Input
              id="salary-target-search"
              aria-label="Search salary assignment employees"
              maxLength={100}
              placeholder="Name or employee ID"
              disabled={closed}
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
            {matching.loading ? (
              <p role="status" className="text-xs">
                Counting matching employees…
              </p>
            ) : matching.error ? (
              <p role="alert" className="text-xs text-destructive">
                {matching.error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {matching.data?.total.toLocaleString() ?? 0} employees match. Every match is
                included; preview shows the exact affected total and any payroll blockers.
              </p>
            )}
            <div className="max-h-36 overflow-auto rounded border border-border p-2 text-xs">
              {matching.data?.items.map((person) => (
                <p key={person.id} className="py-0.5">
                  {person.name} · {person.employeeNumber}
                </p>
              ))}
            </div>
            {matching.data?.nextCursor && (
              <p className="text-[11px] text-muted-foreground">
                Showing the first 50 matches. Search or use a narrower group to inspect people
                further down the list.
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span>Gross salary</span>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  required
                  min={0.01}
                  max={salaryMode === 'LPA' ? 1000 : 100000000}
                  step="0.01"
                  type="number"
                  inputMode="decimal"
                  aria-label={salaryMode === 'LPA' ? 'Annual gross salary in LPA' : 'Monthly gross salary in rupees'}
                  value={grossSalary}
                  onChange={(event) => setSalary(event.target.value)}
                  disabled={closed}
                />
                <select aria-label="Salary period" className="h-9 rounded-md border border-border bg-background px-2" value={salaryMode} onChange={(event) => { const nextMode = event.target.value as 'MONTHLY' | 'LPA'; setSalaryMode(nextMode); const value = Number(grossSalary); const monthly = nextMode === 'LPA' ? value * 100000 / 12 : value; if (Number.isFinite(monthly) && monthly > 0) setEsiEnabled(monthly <= 21000); clearPreview(); }} disabled={closed}>
                  <option value="MONTHLY">Monthly ₹</option><option value="LPA">Annual LPA</option>
                </select>
              </div>
            </label>
            <label className="space-y-1 text-xs">
              <span>Effective from</span>
              <DatePicker
                value={effectiveFrom}
                onChange={(value) => {
                  setEffectiveFrom(value);
                  clearPreview();
                }}
                disabled={closed}
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold">Statutory deductions</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['PF', pfEnabled, setPfEnabled],
                  ['PT', ptEnabled, setPtEnabled],
                  ['ESI', esiEnabled, setEsiEnabled],
                ] as const
              ).map(([label, value, set]) => (
                <button
                  key={label}
                  type="button"
                  disabled={closed}
                  aria-pressed={value}
                  onClick={() => {
                    set(!value);
                    clearPreview();
                  }}
                  className={`rounded-lg border p-2 text-xs ${value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                >
                  <CheckCircle2 className="mr-1 inline size-3.5" />
                  {label} {value ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {preview && (
            <section
              aria-label="Salary assignment preview"
              className="space-y-2 rounded border border-border bg-muted/30 p-3"
            >
              <p className="text-sm font-semibold">
                {preview.affectedEmployees.toLocaleString()} employees ·{' '}
                {preview.valid.toLocaleString()} ready · {preview.invalid.toLocaleString()} blocked
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.targetName}. Existing released payroll periods are protected. This is an
                individual salary change for every matching employee.
              </p>
              {preview.rows
                .filter((row) => row.error)
                .slice(0, 8)
                .map((row) => (
                  <p key={row.id} className="text-xs text-destructive">
                    {row.name}: {row.error}
                  </p>
                ))}
              {preview.invalid > 8 && (
                <p className="text-xs text-muted-foreground">
                  And {(preview.invalid - 8).toLocaleString()} more blockers; download the job
                  results after applying.
                </p>
              )}
            </section>
          )}
          <WorkforceJobProgress job={job} />
          <div className="sticky bottom-[-1.25rem] z-20 -mx-5 -mb-5 flex justify-end gap-2 border-t border-border bg-card px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              disabled={closed}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {preview ? (
              <Button
                type="button"
                disabled={closed || preview.valid === 0}
                onClick={() => void apply()}
              >
                {job.starting
                  ? 'Starting…'
                  : `Apply to ${preview.valid.toLocaleString()} employees`}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={closed || !grossSalary || !effectiveFrom || !matching.data?.total}
              >
                {busy ? 'Preparing preview…' : 'Preview salary changes'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
