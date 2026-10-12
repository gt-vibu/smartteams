'use client';

import type { LeaveBalance, LeavePreview, LeaveType } from '@smarteam/contracts';
import { LIMITS } from '@smarteam/contracts';
import {
  LoadingIndicator,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smarteam/ui';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useLeaveDateAvailability } from '../../hooks/use-leave-date-availability';
import { leaveRepository } from '../../repositories/leave.repository';
import { LeaveAttachmentInput, type LeaveAttachment } from './leave-attachment-input';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  types: LeaveType[];
  balances: LeaveBalance[];
  saving: boolean;
  saveError: string | null;
  onApply: (input: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason?: string;
    attachmentIds?: string[];
    session?: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
  }) => Promise<boolean>;
}

/**
 * Applies for leave.
 *
 * The server previews the same calendar and balance rules used when submitting the request.
 */
export function ApplyLeaveModal({
  isOpen,
  onClose,
  types,
  balances,
  saving,
  saveError,
  onApply,
}: ApplyLeaveModalProps) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveSession, setLeaveSession] = useState<'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF'>(
    'FULL_DAY',
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { session } = useSession();
  const calendar = useLeaveDateAvailability(
    isOpen,
    session?.organizationId,
    session?.employeeId,
    startDate,
  );
  const [attachments, setAttachments] = useState<LeaveAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewKey, setPreviewKey] = useState('');
  const selectionKey = `${leaveTypeId}:${startDate}:${endDate}:${leaveSession}`;
  const currentPreview = previewKey === selectionKey ? preview : null;
  const validDates =
    calendar.ready &&
    Boolean(startDate && endDate) &&
    !calendar.disabledDate(startDate) &&
    !calendar.disabledDate(endDate) &&
    startDate >= calendar.min &&
    endDate >= startDate &&
    endDate <= calendar.endMax;
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    if (
      !isOpen ||
      !session?.organizationId ||
      !session.employeeId ||
      !leaveTypeId ||
      !startDate ||
      !endDate ||
      !validDates
    )
      return;
    let active = true;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      void leaveRepository
        .preview(session.organizationId, {
          employeeId: session.employeeId!,
          leaveTypeId,
          session: leaveSession,
          startDate,
          endDate,
        })
        .then((value) => {
          if (active) {
            setPreview(value);
            setPreviewKey(selectionKey);
          }
        })
        .catch((caught) => {
          if (active)
            setPreviewError(
              caught instanceof Error ? caught.message : 'Could not calculate leave.',
            );
        })
        .finally(() => {
          if (active) setPreviewLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    isOpen,
    session?.organizationId,
    session?.employeeId,
    leaveTypeId,
    startDate,
    endDate,
    leaveSession,
    validDates,
    selectionKey,
    calendar.revision,
  ]);

  const balanceFor = useMemo(
    () => new Map(balances.map((balance) => [balance.leaveTypeId, balance])),
    [balances],
  );
  const selectedBalance = leaveTypeId ? balanceFor.get(leaveTypeId) : undefined;

  const reset = () => {
    setLeaveTypeId('');
    setStartDate('');
    setEndDate('');
    setReason('');
    setLeaveSession('FULL_DAY');
    setError('');
    setAttachments([]);
  };

  const handleSubmit = async () => {
    if (!leaveTypeId || !startDate || !endDate) {
      setError('Select a leave type and both dates.');
      return;
    }
    if (endDate < startDate) {
      setError('The end date cannot precede the start date.');
      return;
    }
    setError('');
    if (types.find((type) => type.id === leaveTypeId)?.requiresAttachment && !attachments.length) {
      setError('Upload a supporting document for this leave type.');
      return;
    }
    if (
      !validDates ||
      !currentPreview ||
      previewError ||
      currentPreview.issues.length ||
      previewLoading ||
      uploading
    )
      return;
    const applied = await onApply({
      session: leaveSession,
      leaveTypeId,
      startDate,
      endDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(attachments.length ? { attachmentIds: attachments.map((file) => file.id) } : {}),
    });
    if (applied) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          if (saving || uploading) return;
          reset();
          onClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent className="flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] w-[95vw] sm:max-w-lg gap-0 p-0 overflow-hidden bg-card border-border shadow-2xl">
        <DialogTitle className="shrink-0 border-b border-border px-5 py-3.5 text-sm font-semibold">
          Apply for leave
        </DialogTitle>

        <div className="flex-1 overflow-y-auto space-y-4 p-5 text-xs">
          {types.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No leave types are available for your branch yet.
            </p>
          ) : (
            <>
              <div>
                <Label className="mb-1 block" htmlFor="leave-type">
                  Leave type
                </Label>
                <SelectMenu disabled={saving} onValueChange={setLeaveTypeId} value={leaveTypeId}>
                  <SelectTrigger id="leave-type">
                    <SelectValue placeholder="Select a leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                        {/* Two types may share a name; the code is what tells them apart. */}
                        {types.some((other) => other.id !== type.id && other.name === type.name)
                          ? ` · ${type.code}`
                          : ''}
                        {type.paid ? '' : ' (unpaid)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectMenu>
                {selectedBalance && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selectedBalance.availableAmount} day
                    {selectedBalance.availableAmount === 1 ? '' : 's'} available
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="leave-session">Duration</Label>
                <select
                  id="leave-session"
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs"
                  value={leaveSession}
                  disabled={saving}
                  onChange={(event) => {
                    const value = event.target.value as typeof leaveSession;
                    setLeaveSession(value);
                    if (value !== 'FULL_DAY') setEndDate(startDate);
                  }}
                >
                  <option value="FULL_DAY">Full day(s)</option>
                  <option value="FIRST_HALF">Half day · first half of shift</option>
                  <option value="SECOND_HALF">Half day · second half of shift</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Half-day requests use one working date and reserve 0.5 days.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block" htmlFor="leave-start">
                    From
                  </Label>
                  <DatePicker
                    disabled={saving || !calendar.ready}
                    id="leave-start"
                    min={calendar.min}
                    max={calendar.max}
                    disabledDate={calendar.disabledDate}
                    onChange={(value) => {
                      setStartDate(value);
                      if (leaveSession !== 'FULL_DAY' || !value) setEndDate(value);
                      else setEndDate('');
                    }}
                    value={startDate}
                  />
                </div>
                <div>
                  <Label className="mb-1 block" htmlFor="leave-end">
                    To
                  </Label>
                  <DatePicker
                    disabled={
                      saving || !calendar.ready || !startDate || leaveSession !== 'FULL_DAY'
                    }
                    id="leave-end"
                    initialMonth={startDate}
                    min={startDate || undefined}
                    max={calendar.endMax}
                    disabledDate={calendar.disabledDate}
                    onChange={setEndDate}
                    value={endDate}
                  />
                </div>
              </div>

              <p className="text-muted-foreground">
                Days off, holidays and dates already requested for leave are unavailable. A single
                working day can use the same From and To date.
              </p>
              {!calendar.ready && !calendar.error && <LoadingIndicator variant="inline" label="Loading available dates" />}
              {calendar.error && (
                <div role="alert">
                  <p className="text-destructive">{calendar.error}</p>
                  <Button variant="outline" size="sm" onClick={calendar.retry}>
                    Retry calendar
                  </Button>
                </div>
              )}

              <div>
                <Label className="mb-1 block" htmlFor="leave-reason">
                  Reason
                </Label>
                <Textarea
                  maxLength={LIMITS.reason}
                  disabled={saving}
                  id="leave-reason"
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  value={reason}
                />
              </div>

              <LeaveAttachmentInput
                value={attachments}
                onChange={setAttachments}
                disabled={saving}
                required={Boolean(
                  types.find((type) => type.id === leaveTypeId)?.requiresAttachment,
                )}
                onBusy={setUploading}
              />
              {previewLoading && <p role="status">Calculating leave days…</p>}
              {previewError && (
                <p role="alert" className="text-destructive">
                  {previewError}
                </p>
              )}
              {currentPreview && (
                <div className="space-y-2 rounded-md border border-border p-3" aria-live="polite">
                  <p className="font-semibold">
                    {currentPreview.requestedDays} days charged · {currentPreview.remainingDays}{' '}
                    days remaining
                  </p>
                  <p className="text-muted-foreground">
                    {currentPreview.policyName} ·{' '}
                    {currentPreview.automaticallyApproved
                      ? 'Eligible for automatic approval'
                      : `${currentPreview.approvalSteps} approval stages`}
                  </p>
                  <details>
                    <summary className="cursor-pointer">How days are counted</summary>
                    {currentPreview.dates.map((day) => (
                      <p key={day.date}>
                        {day.date}: {day.counted ? 'Counted' : 'Excluded'} — {day.reason}
                      </p>
                    ))}
                  </details>
                  {currentPreview.issues.map((issue) => (
                    <p key={issue} className="text-destructive">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 bg-muted/20">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={saving || uploading}
              onClick={() => {
                reset();
                onClose();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                uploading ||
                previewLoading ||
                !validDates ||
                !currentPreview ||
                Boolean(previewError) ||
                Boolean(currentPreview.issues.length) ||
                types.length === 0
              }
              onClick={() => void handleSubmit()}
              type="button"
            >
              {saving ? 'Submitting...' : 'Submit request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
