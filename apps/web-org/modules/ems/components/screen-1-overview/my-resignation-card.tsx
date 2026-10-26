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
  RESIGNATION_LABEL,
  resignationsRepository,
} from '../../repositories/resignations.repository';
import { localDateKeyIn } from '../../lib/local-date';

const inDays = (days: number) => localDateKeyIn(days);

/**
 * Handing in one's resignation, and following it until the last day.
 *
 * Kept quiet on purpose: a single line at the foot of the profile, not a banner. Once handed in,
 * it shows where it stands and the agreed last day, and can be withdrawn until then.
 */
export function MyResignationCard() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const mine = useAsyncResource(
    () => resignationsRepository.mine(organizationId!),
    [organizationId],
    {
      enabled: Boolean(organizationId),
    },
  );
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [lastDay, setLastDay] = useState(() => inDays(30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = (mine.data ?? []).find(
    (item) => item.status === 'PENDING' || item.status === 'ACCEPTED',
  );

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await mine.refetch();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (reason.trim().length < 3) return setError('Say briefly why you are leaving.');
    if (!lastDay) return setError('Choose your last working day.');
    if (
      await act(() =>
        resignationsRepository.submit(organizationId!, {
          reason: reason.trim(),
          requestedLastDay: lastDay,
        }),
      )
    ) {
      setOpen(false);
      setReason('');
    }
  };

  if (mine.loading || mine.forbidden) return null;

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              Your resignation{' '}
              <Badge variant={current.status === 'ACCEPTED' ? 'sky' : 'secondary'}>
                {RESIGNATION_LABEL[current.status]}
              </Badge>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {current.lastWorkingDay
                ? `Last working day ${formatDate(current.lastWorkingDay)}.`
                : `You asked for ${formatDate(current.requestedLastDay)} as your last day.`}
              {current.decisionComment ? ` ${current.decisionComment}` : ''}
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              void act(() => resignationsRepository.withdraw(organizationId!, current.id))
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Withdraw
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Leaving the company?</p>
          <Button onClick={() => setOpen(true)} size="sm" type="button" variant="ghost">
            Hand in resignation
          </Button>
        </div>
      )}
      {error && !open && (
        <p className="mt-2 text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      <Dialog onOpenChange={(next) => !next && !busy && setOpen(false)} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Hand in your resignation</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Your manager and HR are told. They agree your last working day with you; until then you
            can withdraw it.
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="mb-1 block" htmlFor="resign-last-day">
                Last working day you would like
              </Label>
              <DatePicker
                disabled={busy}
                id="resign-last-day"
                min={inDays(0)}
                onChange={setLastDay}
                value={lastDay}
              />
            </div>
            <div>
              <Label className="mb-1 block" htmlFor="resign-reason">
                Reason
              </Label>
              <Textarea
                disabled={busy}
                id="resign-reason"
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                value={reason}
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
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => void submit()}
                type="button"
                variant="destructive"
              >
                {busy ? 'Sending…' : 'Hand in resignation'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
