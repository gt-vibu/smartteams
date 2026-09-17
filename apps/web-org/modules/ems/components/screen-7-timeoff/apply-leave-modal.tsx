'use client';

import React, { useMemo, useState } from 'react';
import {
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
import type { LeaveBalance, LeaveType } from '@smarteam/contracts';

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
  }) => Promise<boolean>;
}

/**
 * Applies for leave.
 *
 * The day count is deliberately not previewed. The server derives it from the branch working
 * week and the holiday calendar; a client-side estimate would disagree with the figure the
 * request is actually created with, and the user would be told two different numbers.
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
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

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
    setError('');
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
    const applied = await onApply({
      leaveTypeId,
      startDate,
      endDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block" htmlFor="leave-start">
                    From
                  </Label>
                  <DatePicker
                    disabled={saving}
                    id="leave-start"
                    max={endDate || undefined}
                    onChange={setStartDate}
                    value={startDate}
                  />
                </div>
                <div>
                  <Label className="mb-1 block" htmlFor="leave-end">
                    To
                  </Label>
                  <DatePicker
                    disabled={saving}
                    id="leave-end"
                    min={startDate || undefined}
                    onChange={setEndDate}
                    value={endDate}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1 block" htmlFor="leave-reason">
                  Reason
                </Label>
                <Textarea
                  disabled={saving}
                  id="leave-reason"
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  value={reason}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Working days are counted by the server using your branch calendar, so weekends and
                holidays in the range are not deducted.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 bg-muted/20">
          <p className="text-[11px] font-medium text-destructive" role="alert">
            {error || saveError}
          </p>
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saving || types.length === 0}
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
