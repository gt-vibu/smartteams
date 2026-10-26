'use client';

import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  TimePicker,
} from '@smarteam/ui';
import { DEFAULT_MISSED_CHECK_OUT_POLICY, type MissedCheckOutPolicy } from '@smarteam/contracts';
import type { useAttendancePreferences } from '../../hooks/use-attendance-preferences';

type Policy = ReturnType<typeof useAttendancePreferences>;

const RESOLUTION_METHODS = [
  { value: 'LEAVE_OPEN', label: 'Leave open until someone resolves it' },
  { value: 'EMPLOYEE_CORRECTION', label: 'Give the employee time to submit a correction' },
  { value: 'PROVISIONAL_AUTO_CLOSE', label: 'Propose a check-out for approval' },
] as const;

const DEADLINES = [
  { value: 'SAME_DAY', label: 'Same day' },
  { value: 'NEXT_CALENDAR_DAY', label: 'Next calendar day' },
  { value: 'BEFORE_PAYROLL_CUTOFF', label: 'Before payroll cut-off' },
] as const;

/** A missed punch is handled through the same audited correction and approval lifecycle. */
export function AutoCheckOutSection({ policy }: { policy: Policy }) {
  const savedPolicy = policy.preferences?.missedCheckOutPolicy ?? DEFAULT_MISSED_CHECK_OUT_POLICY;
  const [draft, setDraft] = useState<MissedCheckOutPolicy>(savedPolicy);
  const [saved, setSaved] = useState(true);
  const [runSummary, setRunSummary] = useState<string | null>(null);

  useEffect(() => {
    setDraft(savedPolicy);
    setSaved(true);
  }, [savedPolicy]);

  const update = (next: MissedCheckOutPolicy) => {
    setDraft(next);
    setSaved(false);
    void policy.save({ missedCheckOutPolicy: next }).then(setSaved);
  };
  const runDueReviews = async () => {
    setRunSummary(null);
    const outcome = await policy.runAutoCheckOut();
    if (!outcome) return;
    setRunSummary(
      outcome.closed
        ? `${outcome.closed} missed check-out${outcome.closed === 1 ? '' : 's'} sent for review.`
        : 'No missed check-outs are due for review.',
    );
  };

  const fallbackCopy =
    draft.deadlineFallback === 'KEEP_OPEN'
      ? 'After the deadline, keep the attendance day open for manual resolution.'
      : 'After the deadline, send a proposed time through your attendance correction approval policy. Manager steps use their configured backup approver when the employee has no manager; approval reminders and escalation settings apply.';

  return (
    <section aria-labelledby="missed-checkout-heading" className="border-t border-border pt-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold" id="missed-checkout-heading">
            Missed check-outs
          </h4>
          <p className="mt-0.5 max-w-2xl text-[11px] text-muted-foreground">
            Choose how an incomplete attendance day is resolved. Suggested or employee-entered times
            stay unverified until an authorized approver accepts them.
          </p>
        </div>
        <Badge variant="outline">Organization default</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="missed-checkout-method">Resolution</Label>
          <SelectMenu
            disabled={!policy.canWrite || policy.saving}
            onValueChange={(value) =>
              update({
                ...draft,
                resolutionMethod: value as MissedCheckOutPolicy['resolutionMethod'],
              })
            }
            value={draft.resolutionMethod}
          >
            <SelectTrigger className="mt-1 w-full" id="missed-checkout-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTION_METHODS.map((item) => (
                <SelectItem
                  disabled={
                    item.value === 'EMPLOYEE_CORRECTION' && !draft.employeeCorrectionsAllowed
                  }
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectMenu>
        </div>

        {draft.resolutionMethod !== 'LEAVE_OPEN' && (
          <div>
            <Label htmlFor="missed-checkout-deadline">Correction deadline</Label>
            <SelectMenu
              disabled={!policy.canWrite || policy.saving}
              onValueChange={(value) =>
                update({
                  ...draft,
                  correctionDeadline: value as MissedCheckOutPolicy['correctionDeadline'],
                })
              }
              value={draft.correctionDeadline}
            >
              <SelectTrigger className="mt-1 w-full" id="missed-checkout-deadline">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEADLINES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectMenu>
            {draft.correctionDeadline === 'BEFORE_PAYROLL_CUTOFF' && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Uses the payroll day configured in Organization settings. If none is set, the next
                calendar day is used.
              </p>
            )}
          </div>
        )}

        {draft.resolutionMethod === 'EMPLOYEE_CORRECTION' && (
          <div>
            <Label htmlFor="missed-checkout-fallback">If the deadline passes</Label>
            <SelectMenu
              disabled={!policy.canWrite || policy.saving}
              onValueChange={(value) =>
                update({
                  ...draft,
                  deadlineFallback: value as MissedCheckOutPolicy['deadlineFallback'],
                })
              }
              value={draft.deadlineFallback}
            >
              <SelectTrigger className="mt-1 w-full" id="missed-checkout-fallback">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KEEP_OPEN">Keep the day open for manual resolution</SelectItem>
                <SelectItem value="ROUTE_TO_APPROVAL_POLICY">
                  Send a proposed time for approval
                </SelectItem>
              </SelectContent>
            </SelectMenu>
          </div>
        )}

        {draft.resolutionMethod === 'PROVISIONAL_AUTO_CLOSE' && (
          <>
            <div>
              <Label htmlFor="missed-checkout-time-source">Proposed check-out time</Label>
              <SelectMenu
                disabled={!policy.canWrite || policy.saving}
                onValueChange={(value) =>
                  update({
                    ...draft,
                    closeTimeSource: value as MissedCheckOutPolicy['closeTimeSource'],
                  })
                }
                value={draft.closeTimeSource}
              >
                <SelectTrigger className="mt-1 w-full" id="missed-checkout-time-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHIFT_END">Assigned shift end</SelectItem>
                  <SelectItem value="CONFIGURED_TIME">A configured time</SelectItem>
                </SelectContent>
              </SelectMenu>
            </div>
            {draft.closeTimeSource === 'CONFIGURED_TIME' && (
              <div>
                <Label htmlFor="missed-checkout-time">Configured time</Label>
                <TimePicker
                  aria-label="Configured proposed check-out time"
                  className="mt-1"
                  disabled={!policy.canWrite || policy.saving}
                  id="missed-checkout-time"
                  onChange={(value) => value && update({ ...draft, configuredTime: value })}
                  value={draft.configuredTime}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Organization local time</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs font-semibold text-foreground">What happens next</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {draft.resolutionMethod === 'LEAVE_OPEN'
            ? 'The day stays incomplete until the employee or an authorized administrator resolves it.'
            : draft.resolutionMethod === 'EMPLOYEE_CORRECTION'
              ? 'The employee can submit the actual check-out and reason. The request follows the attendance correction approval policy.'
              : `At the deadline, SmartTeam proposes ${draft.closeTimeSource === 'SHIFT_END' ? 'the assigned shift end' : draft.configuredTime} and sends it for approval. A missing shift leaves the day open.`}
        </p>
        {draft.resolutionMethod !== 'LEAVE_OPEN' && (
          <p className="mt-1 text-[11px] text-muted-foreground">{fallbackCopy}</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Unresolved time is held out of finalized attendance and payroll totals. Approving a
          proposal records it as a reviewed correction; it never creates a silent system punch.
        </p>
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-foreground">
        <input
          checked={draft.employeeCorrectionsAllowed}
          className="mt-0.5"
          disabled={
            !policy.canWrite || policy.saving || draft.resolutionMethod === 'EMPLOYEE_CORRECTION'
          }
          onChange={(event) =>
            update({ ...draft, employeeCorrectionsAllowed: event.currentTarget.checked })
          }
          type="checkbox"
        />
        <span>
          Allow employees to request a missing check-out correction
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Late requests remain possible and are still reviewed by the configured approvers.
          </span>
        </span>
      </label>

      <div aria-live="polite" className="mt-2 text-[10px] text-muted-foreground" role="status">
        {policy.saving ? 'Saving policy…' : saved ? 'Policy saved' : 'Changes not saved'}
      </div>
      {draft.resolutionMethod === 'PROVISIONAL_AUTO_CLOSE' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            disabled={!policy.canWrite || policy.saving}
            onClick={() => void runDueReviews()}
            size="sm"
            type="button"
            variant="outline"
          >
            Check for due reviews now
          </Button>
          {runSummary && <span className="text-[11px] text-muted-foreground">{runSummary}</span>}
        </div>
      )}
    </section>
  );
}
