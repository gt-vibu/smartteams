'use client';

import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
} from '@smarteam/ui';
import type { useAttendancePreferences } from '../../hooks/use-attendance-preferences';

type Policy = ReturnType<typeof useAttendancePreferences>;

const MODES = [
  { value: 'DISABLED', label: 'Leave the day open' },
  { value: 'REVIEW_REQUIRED', label: 'Close it and send for review' },
];

/**
 * What happens to a day the employee never checked out of.
 *
 * Closing it proposes an end time; it never records one. The day reaches whoever the
 * organization's attendance approval policy names, and counts no worked time or overtime until
 * that person accepts the time, replaces it with the real one, or rejects the day. Who reviews
 * these is therefore set on the Approvals screen, not here.
 */
export function AutoCheckOutSection({ policy }: { policy: Policy }) {
  const mode = policy.preferences?.autoCheckOutMode ?? 'DISABLED';
  const savedAt = policy.preferences?.autoCheckOutAt?.slice(0, 5) ?? '23:59';
  const [time, setTime] = useState(savedAt);
  const [ran, setRan] = useState<string | null>(null);

  // The server's value wins whenever it changes under an unedited field.
  useEffect(() => setTime(savedAt), [savedAt]);

  const runNow = async () => {
    setRan(null);
    const outcome = await policy.runAutoCheckOut();
    if (!outcome) return;
    setRan(
      outcome.closed === 0
        ? 'No open days were due to close.'
        : `${outcome.closed} day${outcome.closed === 1 ? '' : 's'} sent for review.`,
    );
  };

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold" htmlFor="auto-check-out-mode">
            Days with no check-out
          </Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            An employee who forgets to check out leaves the day at nothing. Closing it sends the day
            to your attendance approvers with the time below as a proposal; they accept it, enter
            the real time, or reject it. Nothing is paid until they do.
          </p>
        </div>
        <Badge variant="outline">Organization Default</Badge>
      </div>

      <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_9rem]">
        <SelectMenu
          disabled={!policy.canWrite || policy.saving}
          onValueChange={(value) =>
            void policy.save({ autoCheckOutMode: value as 'DISABLED' | 'REVIEW_REQUIRED' })
          }
          value={mode}
        >
          <SelectTrigger className="w-full" id="auto-check-out-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectMenu>
        <div>
          <Input
            aria-label="Closing time"
            disabled={!policy.canWrite || policy.saving || mode === 'DISABLED'}
            id="auto-check-out-at"
            onBlur={() => {
              if (time && time !== savedAt) void policy.save({ autoCheckOutAt: time });
            }}
            onChange={(event) => setTime(event.target.value)}
            type="time"
            value={time}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Your organization&rsquo;s time</p>
        </div>
      </div>

      {mode === 'REVIEW_REQUIRED' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            disabled={!policy.canWrite || policy.saving}
            onClick={() => void runNow()}
            size="sm"
            type="button"
            variant="outline"
          >
            Close due days now
          </Button>
          {ran && <span className="text-[11px] text-muted-foreground">{ran}</span>}
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        A shift that crosses midnight is never closed this way &mdash; at {time || '23:59'} it is
        still being worked.
      </p>
    </div>
  );
}
