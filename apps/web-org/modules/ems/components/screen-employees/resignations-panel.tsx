'use client';

import { formatDate } from '@smarteam/contracts';
import {
  LoadingIndicator,
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
} from '@smarteam/ui';
import { useState } from 'react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { localDateKey } from '../../lib/local-date';
import {
  RESIGNATION_LABEL,
  resignationsRepository,
  type Resignation,
} from '../../repositories/resignations.repository';

const today = () => localDateKey();

/**
 * Resignations for HR: waiting for a decision first, then those serving notice, then the rest.
 * Accepting agrees the last working day; the person is off-boarded automatically after it.
 */
export function ResignationsPanel() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const list = useAsyncResource(
    () => resignationsRepository.list(organizationId!),
    [organizationId],
    {
      enabled: Boolean(organizationId),
    },
  );
  const [deciding, setDeciding] = useState<{ item: Resignation; accept: boolean } | null>(null);
  const [lastDay, setLastDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (item: Resignation, accept: boolean) => {
    setDeciding({ item, accept });
    setLastDay(item.requestedLastDay < today() ? today() : item.requestedLastDay);
    setError('');
  };

  const confirm = async () => {
    if (!deciding) return;
    setBusy(true);
    setError('');
    try {
      await resignationsRepository.decide(organizationId!, deciding.item.id, {
        accept: deciding.accept,
        ...(deciding.accept ? { lastWorkingDay: lastDay } : {}),
      });
      setDeciding(null);
      await list.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The decision was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  if (list.loading)
    return (
      <LoadingIndicator variant="panel" label="Loading resignations" className="py-8 text-center text-xs text-muted-foreground" />
    );
  if (list.forbidden)
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        Resignations are handled by people who manage employees.
      </p>
    );
  const items = list.data ?? [];
  if (items.length === 0)
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
        No resignations in the last three months.
      </p>
    );

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((item) => (
          <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" key={item.id}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                {item.employee.name}
                <span className="font-normal text-muted-foreground">
                  {item.employee.employeeNumber}
                </span>
                <Badge variant={item.status === 'PENDING' ? 'warning' : 'secondary'}>
                  {RESIGNATION_LABEL[item.status]}
                </Badge>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Handed in {formatDate(item.submittedAt)} ·{' '}
                {item.lastWorkingDay
                  ? `last day ${formatDate(item.lastWorkingDay)}`
                  : `asked for ${formatDate(item.requestedLastDay)}`}
              </p>
              <p className="mt-1 text-xs text-foreground">{item.reason}</p>
            </div>
            {item.status === 'PENDING' && (
              <div className="flex gap-2">
                <Button onClick={() => open(item, false)} size="sm" type="button" variant="outline">
                  Decline
                </Button>
                <Button onClick={() => open(item, true)} size="sm" type="button">
                  Accept
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog onOpenChange={(next) => !next && !busy && setDeciding(null)} open={deciding !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {deciding?.accept ? 'Accept' : 'Decline'} {deciding?.item.employee.name}&apos;s
            resignation
          </DialogTitle>
          <div className="mt-3 space-y-3">
            {deciding?.accept && (
              <div>
                <Label className="mb-1 block" htmlFor="exit-last-day">
                  Last working day
                </Label>
                <DatePicker
                  disabled={busy}
                  id="exit-last-day"
                  min={today()}
                  onChange={setLastDay}
                  value={lastDay}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  They asked for {formatDate(deciding.item.requestedLastDay)}. After this day they
                  are off-boarded automatically: login closed, teams and projects ended.
                </p>
              </div>
            )}
            {error && (
              <p className="text-[11px] font-semibold text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={busy}
                onClick={() => setDeciding(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void confirm()} type="button">
                {busy ? 'Saving…' : deciding?.accept ? 'Accept resignation' : 'Decline'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
