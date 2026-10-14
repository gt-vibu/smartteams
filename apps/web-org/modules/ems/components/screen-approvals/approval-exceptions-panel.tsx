'use client';
import { ApproverPicker } from './approver-picker';
import { approvalExceptionsSchema, type ApprovalException } from '@smarteam/contracts';
import { Button, Dialog, DialogContent, DialogTitle, Label } from '@smarteam/ui';
import { AlertCircle, CheckCircle2, GitBranch, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '../common/empty-state';
import { SummaryMetricCard } from '../common/summary-metric-card';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { preserveDialogForPicker } from '../../lib/search-picker-escape';
import { apiRequest } from '../../lib/api-client';
import { emitDataChanged } from '../../lib/data-events';
import { orgPath } from '../../repositories/api-helpers';

export function ApprovalExceptionsPanel() {
  const { session, hasPermission } = useSession();
  const organizationId = session?.organizationId;
  const domains = [
    ...(hasPermission('leave.requests.read.all') ? [{ value: 'LEAVE', label: 'Leave' }] : []),
    ...(hasPermission('attendance.read.all')
      ? [{ value: 'ATTENDANCE_CORRECTION', label: 'Attendance corrections' }]
      : []),
  ];
  const [domain, setDomain] = useState(domains[0]?.value ?? 'LEAVE');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApprovalException | null>(null);
  const [approverUserId, setApprover] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setCursor(null);
    setSelected(null);
    setError('');
  }, [domain]);
  const resource = useAsyncResource(
    async () =>
      approvalExceptionsSchema.parse(
        await apiRequest(
          orgPath(
            organizationId!,
            `/approval-operations/exceptions?domain=${domain}${cursor ? `&cursor=${cursor}` : ''}`,
          ),
          { method: 'GET' },
        ),
      ),
    [organizationId, domain, cursor],
    { enabled: Boolean(organizationId) },
  );

  const reassign = async () => {
    if (!selected || !organizationId || !approverUserId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(orgPath(organizationId, '/approval-operations/reassign'), {
        method: 'POST',
        body: {
          domain: selected.domain,
          requestId: selected.id,
          approverUserId,
          expectedStepNumber: selected.stepNumber,
          reason: 'Approver reassigned from routing exceptions',
        },
      });
      setSelected(null);
      setApprover('');
      emitDataChanged('approvals', 'leave', 'attendance');
      await resource.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reassign this request.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <GitBranch aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Routing exceptions</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Find pending requests without an available approver and assign a new one.
          </p>
        </div>
      </div>

      <div aria-label="Request type" className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1" role="group">
        {domains.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={domain === item.value ? 'default' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={() => setDomain(item.value)}
            className={domain === item.value ? 'shadow-sm' : ''}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {resource.loading && (
        <div aria-label="Checking approval routing" className="grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card" />
          <div className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card" />
        </div>
      )}
      {resource.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{resource.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void resource.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {resource.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryMetricCard
              detail={`${domain === 'LEAVE' ? 'Leave' : 'Attendance'} requests checked`}
              icon={ListChecks}
              label="Pending requests checked"
              value={resource.data.checked}
              tone="neutral"
            />
            <SummaryMetricCard
              detail={resource.data.items.length ? 'Need a new approver' : 'All current routes are assigned'}
              icon={resource.data.items.length ? AlertCircle : CheckCircle2}
              label="Need routing repair"
              value={resource.data.items.length}
              tone={resource.data.items.length ? 'warning' : 'success'}
            />
          </div>
          {resource.data.items.length === 0 && (
            <EmptyState
              detail={`All pending ${domain === 'LEAVE' ? 'leave' : 'attendance'} requests on this page have an assigned approver.`}
              icon={CheckCircle2}
              title="No routing issues found"
            />
          )}
          {resource.data.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
            >
              <div>
                <p className="text-xs font-medium">
                  {item.requester} · stage {item.stepNumber}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected(item);
                  setApprover('');
                  setError('');
                }}
              >
                Assign an approver
              </Button>
            </div>
          ))}
          {(cursor || resource.data.nextCursor) && (
            <div className="flex gap-2">
              {cursor && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resource.loading}
                  onClick={() => setCursor(null)}
                >
                  First page
                </Button>
              )}
            {resource.data.nextCursor && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resource.loading}
                onClick={() => setCursor(resource.data!.nextCursor)}
              >
                Check next 100
              </Button>
            )}
            </div>
          )}
        </>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <DialogContent onEscapeKeyDown={preserveDialogForPicker} className="sm:max-w-lg">
          <DialogTitle>Assign an approver</DialogTitle>
          <p className="text-xs">{selected?.requester}</p>
          <Label htmlFor="exception-approver">Approver</Label>
          <ApproverPicker
            value={approverUserId}
            onChange={setApprover}
            disabled={saving}
            label="Approver"
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !approverUserId}
              onClick={() => void reassign()}
            >
              {saving ? 'Assigning…' : 'Reassign request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
