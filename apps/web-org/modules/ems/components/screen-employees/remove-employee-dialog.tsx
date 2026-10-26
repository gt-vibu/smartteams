'use client';

import React, { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Label, Textarea } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
import { LIMITS } from '@smarteam/contracts';

/**
 * Takes someone off the company: they can no longer sign in, and payroll stops including them.
 * Nothing is deleted — attendance, leave, payslips and files stay as history — and the reason is
 * written to the audit trail.
 */
export function RemoveEmployeeDialog({
  employeeId,
  name,
  open,
  onOpenChange,
  onRemoved,
}: {
  employeeId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const { session } = useSession();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setReason('');
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!session?.organizationId || saving) return;
    if (reason.trim().length < 2) {
      setError('Give a reason, for example "Resigned" or "End of contract".');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(
        orgPath(session.organizationId, `/employees/${encodeURIComponent(employeeId)}/deactivate`),
        { method: 'POST', body: { reason: reason.trim() } },
      );
      close(false);
      onRemoved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${name} could not be removed.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>Remove {name} from the company</DialogTitle>
        <div className="mt-3 space-y-3 text-xs">
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>They can no longer sign in, and any open session ends now.</li>
            <li>Payroll stops including them from today.</li>
            <li>They cannot be put on new teams or projects.</li>
            <li>Nothing is deleted: attendance, leave, payslips and files stay as history.</li>
          </ul>
          <div>
            <Label className="mb-1 block" htmlFor="remove-reason">
              Reason
            </Label>
            <Textarea
              maxLength={LIMITS.reason}
              disabled={saving}
              id="remove-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Resigned, end of contract"
              rows={3}
              value={reason}
            />
          </div>
          {error && (
            <p className="font-semibold text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => close(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => void submit()}
              type="button"
              variant="destructive"
            >
              {saving ? 'Removing…' : 'Remove from company'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
