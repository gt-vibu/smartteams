'use client';
import {
  workforceOptionsSchema,
  workforcePeopleSchema,
  workforcePreviewSchema,
  type WorkforceInput,
  type WorkforceOperation,
  type WorkforcePreview,
} from '@smarteam/contracts';
import { Button, Input, Checkbox } from '@smarteam/ui';
import { useEffect, useId, useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { useWorkforceJob } from '../../hooks/use-workforce-job';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { WorkforceEmployeePicker } from './workforce-employee-picker';
import { WorkforceJobProgress } from './workforce-job-progress';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

const operations: Array<{ id: WorkforceOperation; name: string; permission: string }> = [
  {
    id: 'PAYROLL_POLICY',
    name: 'Assign payroll policy',
    permission: 'payroll.employee-profile.write',
  },
  { id: 'MANAGER', name: 'Assign reporting manager', permission: 'employees.write' },
  { id: 'SHIFT', name: 'Publish shift assignments', permission: 'shifts.write' },
  { id: 'LEAVE_POLICY', name: 'Make leave available to branches', permission: 'leave.types.write' },
];
export function BulkWorkforcePanel({
  initialOperation = 'MANAGER',
}: {
  initialOperation?: WorkforceOperation;
}) {
  const { session, hasPermission } = useSession();
  const scopeName = useId();
  const org = session?.organizationId;
  const allowed = operations.filter((operation) => hasPermission(operation.permission));
  const [operation, setOperation] = useState<WorkforceOperation>(initialOperation);
  const current = allowed.some((item) => item.id === operation) ? operation : allowed[0]?.id;
  const [open, setOpen] = useState(false);
  const [targetId, setTarget] = useState('');
  const [effectiveFrom, setDate] = useState('');
  const [branchId, setBranch] = useState('');
  const [departmentId, setDepartment] = useState('');
  const [roleId, setRole] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const [cursor, setCursor] = useState<string | null>(null);
  const [scope, setScope] = useState<'GROUP' | 'PEOPLE'>('GROUP');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<WorkforcePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const job = useWorkforceJob();
  useEffect(() => {
    if (job.state?.batchId) setPreview(null);
  }, [job.state?.batchId]);
  const locked = busy || job.starting || job.active;
  const options = useAsyncResource(
    async () =>
      workforceOptionsSchema.parse(
        await apiRequest(orgPath(org!, `/workforce/options?operation=${current}`), {
          method: 'GET',
        }),
      ),
    [org, current],
    { enabled: open && Boolean(org && current) && hasPermission('employees.read.all') },
  );
  useEffect(() => {
    setCursor(null);
    setSelected([]);
    setPreview(null);
  }, [branchId, departmentId, roleId, term, current]);
  useEffect(() => {
    setPreview(null);
  }, [targetId, effectiveFrom, scope, selected]);
  const filter = {
    ...(branchId ? { branchId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(roleId ? { roleId } : {}),
    ...(term ? { search: term } : {}),
  };
  const people = useAsyncResource(
    async () =>
      workforcePeopleSchema.parse(
        await apiRequest(
          orgPath(
            org!,
            `/workforce/people?${new URLSearchParams({ ...filter, ...(cursor ? { cursor } : {}) })}`,
          ),
          { method: 'GET' },
        ),
      ),
    [org, branchId, departmentId, roleId, term, cursor],
    {
      enabled:
        open && Boolean(org) && current !== 'LEAVE_POLICY' && hasPermission('employees.read.all'),
    },
  );
  if (!hasPermission('employees.read.all') || !allowed.length || !current) return null;
  const makeInput = (): WorkforceInput => ({
    operation: current,
    targetId,
    effectiveFrom: ['LEAVE_POLICY', 'MANAGER'].includes(current)
      ? (options.data?.today ?? '')
      : effectiveFrom || (options.data?.today ?? ''),
    reason: `Bulk ${current.toLowerCase().replaceAll('_', ' ')} assignment`,
    filter:
      current === 'LEAVE_POLICY'
        ? { ...(branchId ? { branchId } : {}), allEmployees: !branchId }
        : scope === 'PEOPLE'
          ? { employeeIds: selected }
          : { ...filter, allEmployees: true },
  });
  const check = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(
        workforcePreviewSchema.parse(
          await apiRequest(orgPath(org!, '/workforce/preview'), {
            method: 'POST',
            body: makeInput(),
            timeoutMs: 60000,
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview the assignments.');
    } finally {
      setBusy(false);
    }
  };
  const select = (
    label: string,
    value: string,
    change: (value: string) => void,
    items: ReadonlyArray<{ id: string; name: string }>,
    first: string,
  ) => (
    <label className="space-y-1 text-xs">
      <span>{label}</span>
      <select
        aria-label={label}
        className="block w-full rounded-md border border-border bg-background p-2"
        value={value}
        disabled={locked}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">{first}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details
      className="rounded-lg border border-border bg-card p-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Bulk staff setup
        {job.active && (
          <span className="ml-2 text-xs font-normal">
            Applying {job.state?.processed}/{job.state?.total}…
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs text-muted-foreground">
          Choose a group or individual employees, preview the impact, then apply in the background.
          Up to 10,000 employees per job.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            Action
            <select
              aria-label="Bulk action"
              className="block w-full rounded border border-border bg-background p-2"
              value={current}
              disabled={locked}
              onChange={(event) => {
                setOperation(event.target.value as WorkforceOperation);
                setTarget('');
              }}
            >
              {allowed.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {current === 'MANAGER' ? (
            <div className="text-xs">
              <p className="mb-1">Reporting manager</p>
              <WorkforceEmployeePicker value={targetId} onChange={setTarget} disabled={locked} />
            </div>
          ) : (
            select('Assignment target', targetId, setTarget, options.data?.targets ?? [], 'Choose…')
          )}
          {select(
            current === 'LEAVE_POLICY' ? 'Apply to branch' : 'Branch',
            branchId,
            setBranch,
            options.data?.branches ?? [],
            'All active branches',
          )}
          {current !== 'LEAVE_POLICY' && (
            <>
              {select(
                'Department',
                departmentId,
                setDepartment,
                options.data?.departments ?? [],
                'All departments',
              )}
              {select(
                'Access role',
                roleId,
                setRole,
                options.data?.roles ?? [],
                'All access roles',
              )}
              {current !== 'MANAGER' && (
                <label className="space-y-1 text-xs">
                  Effective from
                  <Input
                    type="date"
                    aria-label="Assignment effective date"
                    value={effectiveFrom || options.data?.today || ''}
                    disabled={locked}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </div>
        {current === 'PAYROLL_POLICY' && (
          <p className="text-xs text-muted-foreground">
            The selected policy supplies shared pay components. Salary amounts and existing
            individual PF, ESI, PT and payslip settings are preserved. Access roles are used only to
            select employees; permissions do not change.
          </p>
        )}
        {current === 'MANAGER' && (
          <p className="text-xs text-muted-foreground">
            Reporting manager changes take effect today.
          </p>
        )}
        {current === 'LEAVE_POLICY' && (
          <p className="text-xs text-muted-foreground">
            Available immediately to eligible employees in the selected branches. Existing leave
            usage and balances are preserved.
          </p>
        )}
        {current !== 'LEAVE_POLICY' && (
          <div className="space-y-2">
            <label className="block text-xs">
              Find employees
              <Input
                aria-label="Search staff for assignment"
                placeholder="Name or employee ID"
                value={search}
                disabled={locked}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <div className="flex flex-wrap gap-4 text-xs">
              <label>
                <input
                  type="radio"
                  name={scopeName}
                  checked={scope === 'GROUP'}
                  disabled={locked}
                  onChange={() => setScope('GROUP')}
                />{' '}
                All matching employees ({people.data?.total.toLocaleString() ?? '…'})
              </label>
              <label>
                <input
                  type="radio"
                  name={scopeName}
                  checked={scope === 'PEOPLE'}
                  disabled={locked}
                  onChange={() => setScope('PEOPLE')}
                />{' '}
                Select individuals ({selected.length.toLocaleString()})
              </label>
            </div>
            {people.loading && (
              <p role="status" className="text-xs">
                Finding employees…
              </p>
            )}
            {scope === 'PEOPLE' && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={locked || people.loading}
                  onClick={() =>
                    setSelected((previous) => [
                      ...new Set([
                        ...previous,
                        ...(people.data?.items.map((item) => item.id) ?? []),
                      ]),
                    ])
                  }
                >
                  Select this page
                </Button>
                {selected.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={locked}
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </Button>
                )}
                <ul className="max-h-56 overflow-y-auto rounded border border-border">
                  {people.data?.items.map((person) => (
                    <li key={person.id}>
                      <label className="flex gap-2 p-2 text-xs">
                        <Checkbox
                          aria-label={`Select ${person.name} ${person.employeeNumber}`}
                          checked={selected.includes(person.id)}
                          disabled={locked}
                          onCheckedChange={(checked) =>
                            setSelected((previous) =>
                              checked
                                ? [...new Set([...previous, person.id])]
                                : previous.filter((id) => id !== person.id),
                            )
                          }
                        />
                        <span>
                          {person.name} · {person.employeeNumber}
                          <span className="block text-muted-foreground">{person.branchName}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  {cursor && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => setCursor(null)}
                    >
                      First page
                    </Button>
                  )}
                  {people.data?.nextCursor && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => setCursor(people.data!.nextCursor)}
                    >
                      Next 50 employees
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {(error || options.error || people.error) && (
          <p role="alert" className="text-xs text-destructive">
            {error || options.error || people.error}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            locked ||
            search !== term ||
            people.loading ||
            options.loading ||
            !targetId ||
            (scope === 'PEOPLE' && current !== 'LEAVE_POLICY' && !selected.length)
          }
          onClick={() => void check()}
        >
          {busy ? 'Checking assignments…' : 'Preview assignments'}
        </Button>
        {preview && (
          <div className="space-y-2 rounded border border-border bg-background p-3 text-xs">
            <p className="font-semibold">
              {preview.targetName} · {preview.affectedEmployees.toLocaleString()} employees affected
              · {preview.valid.toLocaleString()} valid · {preview.invalid.toLocaleString()} need
              review
            </p>
            {preview.impact && (
              <p>
                Next 30 days ({preview.impact.from} to {preview.impact.to}):{' '}
                {preview.impact.leaveRequests} pending or approved leave requests and{' '}
                {preview.impact.attendanceRecords} attendance records may be affected. Original
                records are retained; payroll must be recalculated after publication.
              </p>
            )}
            <details>
              <summary className="cursor-pointer">Review selection (first 100)</summary>
              <ul className="max-h-44 overflow-y-auto">
                {preview.rows.map((row) => (
                  <li key={row.id} className={row.error ? 'text-destructive' : ''}>
                    {row.name}: {row.error ?? 'Ready'}
                  </li>
                ))}
              </ul>
            </details>
            <Button
              type="button"
              size="sm"
              disabled={locked || !preview.valid}
              onClick={() => void job.start(makeInput(), preview.fingerprint)}
            >
              {job.starting
                ? 'Starting…'
                : `Apply to ${preview.valid.toLocaleString()} ${current === 'LEAVE_POLICY' ? 'branches' : 'employees'}`}
            </Button>
            {preview.invalid > 0 && (
              <p>Rows with issues remain unchanged and appear in the result report.</p>
            )}
          </div>
        )}
        <WorkforceJobProgress job={job} />
      </div>
    </details>
  );
}
