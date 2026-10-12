'use client';
import { ApproverPicker } from './approver-picker';
import { approvalExceptionsSchema, type ApprovalException } from '@smarteam/contracts';
import { Button, Dialog, DialogContent, DialogTitle, Label } from '@smarteam/ui';
import { useEffect, useState } from 'react';
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
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Requests needing routing repair</h2>
        <p className="text-xs text-muted-foreground">
          Find requests whose current approver is unavailable. Reassignment changes this request’s
          owner and records the routing change; it does not approve the request.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {domains.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={domain === item.value ? 'default' : 'outline'}
            size="sm"
            disabled={saving}
            onClick={() => setDomain(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {resource.loading && (
        <p role="status" className="text-xs">
          Checking approval routing…
        </p>
      )}
      {resource.error && (
        <div role="alert" className="text-xs text-destructive">
          {resource.error}
          <Button type="button" variant="outline" size="sm" onClick={() => void resource.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {resource.data && (
        <>
          <p className="text-xs text-muted-foreground">
            Checked {resource.data.checked} pending requests on this page ·{' '}
            {resource.data.items.length} need routing repair
          </p>
          {resource.data.items.length === 0 && (
            <p className="text-xs">No routing exception found in this page.</p>
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
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!cursor || resource.loading}
              onClick={() => setCursor(null)}
            >
              First page
            </Button>
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
