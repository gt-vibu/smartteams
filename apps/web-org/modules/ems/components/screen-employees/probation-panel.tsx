'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  Textarea,
} from '@smarteam/ui';
import { formatDate } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import {
  employeeExtrasRepository,
  type ProbationRow,
} from '../../repositories/employee-extras.repository';

/**
 * Everyone on probation, soonest ending first, with the two outcomes: confirm them, or extend it.
 * Their manager and HR are reminded a week before it ends.
 */
export function ProbationPanel() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const list = useAsyncResource(
    () => employeeExtrasRepository.probation(organizationId!),
    [organizationId],
    {
      enabled: Boolean(organizationId),
    },
  );
  const [acting, setActing] = useState<{ row: ProbationRow; extend: boolean } | null>(null);
  const [extendTo, setExtendTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!acting) return;
    if (acting.extend && !extendTo) return setError('Choose the new end of probation.');
    setBusy(true);
    setError('');
    try {
      await employeeExtrasRepository.confirm(organizationId!, acting.row.employeeId, {
        ...(acting.extend ? { extendTo } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      await list.refetch();
      setActing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data ?? [];
  if (list.loading)
    return (
      <p className="py-8 text-center text-xs text-muted-foreground" role="status">
        Loading…
      </p>
    );
  if (rows.length === 0)
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
        Nobody is on probation. Set it from a person&apos;s profile.
      </p>
    );

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {rows.map((row) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            key={row.employeeId}
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                {row.name}
                <span className="font-normal text-muted-foreground">{row.employeeNumber}</span>
                <Badge
                  variant={
                    row.daysLeft < 0 ? 'destructive' : row.daysLeft <= 7 ? 'warning' : 'secondary'
                  }
                >
                  {row.daysLeft < 0
                    ? `Ended ${-row.daysLeft} days ago`
                    : row.daysLeft === 0
                      ? 'Ends today'
                      : `${row.daysLeft} days left`}
                </Badge>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Ends {formatDate(row.probationEndsOn)}
                {row.manager ? ` · reports to ${row.manager}` : ''}
              </span>
            </span>
            <span className="flex gap-2">
              <Button
                onClick={() => {
                  setActing({ row, extend: true });
                  setExtendTo('');
                  setNote('');
                  setError('');
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Extend
              </Button>
              <Button
                onClick={() => {
                  setActing({ row, extend: false });
                  setNote('');
                  setError('');
                }}
                size="sm"
                type="button"
              >
                Confirm
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <Dialog onOpenChange={(next) => !next && !busy && setActing(null)} open={acting !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {acting?.extend ? 'Extend probation for' : 'Confirm'} {acting?.row.name}
          </DialogTitle>
          <div className="mt-3 space-y-3">
            {acting?.extend && (
              <div>
                <Label className="mb-1 block" htmlFor="probation-until">
                  New end of probation
                </Label>
                <DatePicker
                  disabled={busy}
                  id="probation-until"
                  min={acting.row.probationEndsOn}
                  onChange={setExtendTo}
                  value={extendTo}
                />
              </div>
            )}
            <div>
              <Label className="mb-1 block" htmlFor="probation-note">
                Note to them (optional)
              </Label>
              <Textarea
                disabled={busy}
                id="probation-note"
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                value={note}
              />
            </div>
            {error && (
              <p className="text-[11px] font-semibold text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={busy}
                onClick={() => setActing(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void confirm()} type="button">
                {busy ? 'Saving…' : acting?.extend ? 'Extend' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Setting or clearing someone's probation, from their profile. */
export function ProbationControl({
  employeeId,
  current,
  onSaved,
}: {
  employeeId: string;
  current: string | null;
  onSaved: () => void;
}) {
  const { session } = useSession();
  const [endsOn, setEndsOn] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      await employeeExtrasRepository.setProbation(session!.organizationId, employeeId, value);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Label className="block" htmlFor="profile-probation">
        Probation ends
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <DatePicker disabled={busy} id="profile-probation" onChange={setEndsOn} value={endsOn} />
        </div>
        <Button
          disabled={busy || !endsOn || endsOn === current}
          onClick={() => void save(endsOn)}
          size="sm"
          type="button"
        >
          Save
        </Button>
        {current && (
          <Button
            disabled={busy}
            onClick={() => void save(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Not on probation
          </Button>
        )}
      </div>
      {error && (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
