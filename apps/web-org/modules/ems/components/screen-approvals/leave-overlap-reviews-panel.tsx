'use client';

import { Button, LoadingIndicator } from '@smarteam/ui';
import { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { emitDataChanged } from '../../lib/data-events';
import { orgPath } from '../../repositories/api-helpers';

type LeaveOverlapReview = {
  id: string;
  attendanceId: string;
  workDate: string;
  leaveType: string;
  leavePaid: boolean;
  leaveUnits: number;
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string };
  status: string;
  workedMinutes: number;
  punches: Array<{ type: string; occurredAt: string }>;
  createdAt: string;
};

async function loadInbox(organizationId: string): Promise<{ reviews: LeaveOverlapReview[] }> {
  const payload = await apiRequest(orgPath(organizationId, '/attendance/leave-overlaps/inbox'), {
    method: 'GET',
  });
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { reviews?: unknown }).reviews)
  )
    throw new Error('The leave overlap inbox returned an invalid response.');
  return payload as { reviews: LeaveOverlapReview[] };
}

async function loadAutoApproval(organizationId: string): Promise<{ enabled: boolean }> {
  const payload = await apiRequest(
    orgPath(organizationId, '/attendance/leave-overlaps/auto-approval'),
    { method: 'GET' },
  );
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { enabled?: unknown }).enabled !== 'boolean'
  )
    throw new Error('The automatic approval setting returned an invalid response.');
  return payload as { enabled: boolean };
}

export function LeaveOverlapReviewsPanel({ canConfigure }: { canConfigure: boolean }) {
  const { session } = useAuth();
  const organizationId = session.organizationId;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [autoError, setAutoError] = useState('');
  const [actionError, setActionError] = useState('');
  const [autoSetting, setAutoSetting] = useState<boolean | null>(null);

  const inbox = useAsyncResource(() => loadInbox(organizationId), [organizationId]);
  const autoApproval = useAsyncResource(() => loadAutoApproval(organizationId), [organizationId], {
    enabled: canConfigure,
  });
  const enabled = autoSetting ?? autoApproval.data?.enabled ?? false;
  const rows = useMemo(() => inbox.data?.reviews ?? [], [inbox.data]);

  const decide = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setBusyId(id);
    setActionError('');
    try {
      await apiRequest(
        orgPath(organizationId, `/attendance/leave-overlaps/${encodeURIComponent(id)}/decision`),
        {
          method: 'POST',
          body: { status },
        },
      );
      emitDataChanged('attendance', 'leave', 'payroll', 'approvals');
      await inbox.refetch();
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Could not record the overlap decision.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const setAutomatic = async (value: boolean) => {
    setAutoSetting(value);
    setAutoError('');
    try {
      const saved = (await apiRequest(
        orgPath(organizationId, '/attendance/leave-overlaps/auto-approval'),
        { method: 'PATCH', body: { enabled: value } },
      )) as { enabled: boolean };
      setAutoSetting(saved.enabled);
      await autoApproval.refetch();
    } catch (caught) {
      setAutoSetting(null);
      setAutoError(
        caught instanceof Error ? caught.message : 'Could not update automatic approval.',
      );
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Worked days during approved leave</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Approve only after check-out. Approval marks the date present, restores its leave balance,
          and removes it from paid or unpaid leave calculations. Rejection keeps the leave in place
          and excludes the punches from worked pay.
        </p>
      </div>

      {canConfigure && (
        <div className="rounded-md border border-border bg-card p-3">
          <label className="flex items-start gap-3 text-xs">
            <input
              aria-label="Automatically approve completed leave overlaps"
              checked={enabled}
              disabled={autoApproval.loading || autoApproval.refreshing}
              className="mt-0.5 size-4 accent-primary"
              onChange={(event) => void setAutomatic(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="font-semibold text-foreground">
                Automatically approve completed overlaps
              </span>
              <span className="mt-1 block text-muted-foreground">
                An overlap is approved after the employee checks out. HR employees’ overlaps still
                route to an organization admin when manual review is enabled.
              </span>
            </span>
          </label>
          {autoError && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {autoError}
            </p>
          )}
        </div>
      )}

      {inbox.loading && <LoadingIndicator variant="inline" label="Loading leave overlaps" />}
      {inbox.error && (
        <p className="text-xs text-destructive" role="alert">
          {inbox.error}
        </p>
      )}
      {actionError && (
        <p className="text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}
      {!inbox.loading && !inbox.error && rows.length === 0 && (
        <p className="rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
          No leave overlaps are waiting for review.
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const checkedOut = row.punches.at(-1)?.type === 'OUT';
          return (
            <article className="space-y-3 rounded-lg border border-border bg-card p-4" key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {row.employee.firstName} {row.employee.lastName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {row.employee.employeeNumber} · {row.workDate}
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Review required
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {row.leaveType} · {row.leaveUnits} {row.leaveUnits === 1 ? 'day' : 'day'} ·{' '}
                {row.leavePaid ? 'paid leave' : 'unpaid leave'} · {row.punches.length} punches
              </p>
              {!checkedOut && (
                <p className="text-[11px] text-muted-foreground">
                  Approval becomes available after check-out closes the session.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={busyId === row.id}
                  onClick={() => void decide(row.id, 'REJECTED')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Reject · keep leave
                </Button>
                <Button
                  disabled={busyId === row.id || !checkedOut}
                  onClick={() => void decide(row.id, 'APPROVED')}
                  size="sm"
                  type="button"
                >
                  {busyId === row.id ? 'Saving…' : 'Approve · mark present'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
