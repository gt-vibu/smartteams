'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@smarteam/ui';
import { formatDate, hasPermission, formatDateRange } from '@smarteam/contracts';
import { currentMonthRange } from '../../hooks/use-attendance-admin';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { attendanceRepository } from '../../repositories/attendance.repository';
import { useLeaveAdmin } from '../../hooks/use-leave-admin';
import { useCompensation } from '../../hooks/use-compensation';
import { useEmployees } from '../../hooks/use-workforce';
import { EmployeeCompensationPanel } from '../screen-payroll/employee-compensation-panel';

const note =
  'rounded-lg border border-dashed border-border bg-card/60 p-6 text-center text-xs text-muted-foreground';

function hours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** One employee's salary, using the same panel as Payroll → Compensation. */
export function EmployeePayrollTab({ employeeId }: { employeeId: string }) {
  const compensation = useCompensation();
  const employees = useEmployees();
  const { selectEmployee } = compensation;
  useEffect(() => selectEmployee(employeeId), [selectEmployee, employeeId]);
  const employee = (employees.data ?? []).find((entry) => entry.id === employeeId) ?? null;
  if (compensation.employeeId !== employeeId) return null;
  return (
    <EmployeeCompensationPanel compensation={compensation} employee={employee} key={employeeId} />
  );
}

/** One employee's attendance for a chosen date range (the current month by default). */
export function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
  const initial = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const canRead = hasPermission(persona?.permissions ?? [], 'attendance.read');
  // Asked for this one person, so a large company's other records cannot crowd theirs out.
  const attendance = useAsyncResource(
    () => attendanceRepository.list(organizationId!, { employeeId, from, to, limit: 500 }),
    [organizationId, employeeId, from, to],
    { enabled: Boolean(organizationId) && canRead },
  );
  const rows = [...(attendance.data?.records ?? [])].sort((a, b) =>
    b.workDate.localeCompare(a.workDate),
  );
  const worked = rows.reduce((sum, record) => sum + record.workedMinutes, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="block text-muted-foreground">From</span>
          <Input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </label>
        <label className="space-y-1">
          <span className="block text-muted-foreground">To</span>
          <Input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
        </label>
        <p className="ml-auto text-muted-foreground">
          {rows.length} day{rows.length === 1 ? '' : 's'} recorded · {hours(worked)} worked
        </p>
      </div>
      {!canRead || attendance.forbidden ? (
        <p className={note}>You do not have permission to view attendance.</p>
      ) : attendance.loading ? (
        <p className={note} role="status">
          Loading attendance…
        </p>
      ) : attendance.error ? (
        <p className={note} role="alert">
          {attendance.error}
        </p>
      ) : rows.length === 0 ? (
        <p className={note}>No attendance recorded in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="stack-table w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-bold">Date</th>
                <th className="px-4 py-2 font-bold">Status</th>
                <th className="px-4 py-2 font-bold">Worked</th>
                <th className="px-4 py-2 font-bold">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr className="border-b border-border last:border-0" key={record.id}>
                  <td className="px-4 py-2 font-mono" data-cell="primary">
                    {formatDate(record.workDate)}
                  </td>
                  <td className="px-4 py-2" data-cell="status" data-label="Status">
                    {record.dayStatus.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="px-4 py-2 font-mono" data-label="Worked">
                    {hours(record.workedMinutes)}
                  </td>
                  <td className="px-4 py-2 font-mono" data-label="Overtime">
                    {hours(record.overtimeMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One employee's leave balances and requests. Approving stays in Leave, where the inbox is. */
export function EmployeeLeaveTab({ employeeId }: { employeeId: string }) {
  const leave = useLeaveAdmin();
  const typeName = (id: string) => leave.types.find((type) => type.id === id)?.name ?? 'Leave';
  const balances = leave.balances.filter((balance) => balance.employeeId === employeeId);
  const requests = leave.requests
    .filter((request) => request.employeeId === employeeId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  if (leave.forbidden) return <p className={note}>You do not have permission to view leave.</p>;
  if (leave.loading)
    return (
      <p className={note} role="status">
        Loading leave…
      </p>
    );
  if (leave.error)
    return (
      <p className={note} role="alert">
        {leave.error}
      </p>
    );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Balances
        </h3>
        {balances.length === 0 ? (
          <p className={note}>No leave balances yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((balance) => (
              <div className="rounded-lg border border-border bg-card p-3 text-xs" key={balance.id}>
                <p className="font-semibold text-foreground">
                  {balance.leaveType?.name ?? typeName(balance.leaveTypeId)}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                  {balance.availableAmount}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">days left</span>
                </p>
                <p className="text-muted-foreground">
                  {balance.usedAmount} used · {balance.reservedAmount} pending
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Requests
        </h3>
        {requests.length === 0 ? (
          <p className={note}>No leave requests.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-xs">
            {requests.map((request) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                key={request.id}
              >
                <div>
                  <p className="font-semibold text-foreground">{typeName(request.leaveTypeId)}</p>
                  <p className="font-mono text-muted-foreground">
                    {formatDateRange(request.startDate, request.endDate)} · {request.requestedDays}{' '}
                    day
                    {request.requestedDays === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                  {request.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
