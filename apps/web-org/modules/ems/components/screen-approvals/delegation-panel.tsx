'use client';

import React, { useState } from 'react';
import { Badge, Button, DatePicker, Input, Label } from '@smarteam/ui';
import { formatDateRange } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { emitDataChanged } from '../../lib/data-events';
import { EmployeeCombobox } from '../common/employee-combobox';
import { delegationsRepository, type Delegation } from '../../repositories/delegations.repository';
import { localDateKey } from '../../lib/local-date';

const todayKey = () => localDateKey();

const TONE = { ACTIVE: 'success', UPCOMING: 'sky', ENDED: 'secondary' } as const;
const LABEL = { ACTIVE: 'Covering now', UPCOMING: 'Upcoming', ENDED: 'Ended' } as const;

/**
 * Handing approvals to a colleague while away.
 *
 * The person covering can decide what the delegator could, for the chosen days, and is told when
 * something is waiting. The delegator keeps deciding too, and can end the handover early.
 */
export function DelegationPanel() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const enabled = Boolean(organizationId);
  const list = useAsyncResource(
    () => delegationsRepository.list(organizationId!),
    [organizationId],
    {
      enabled,
    },
  );
  const people = useAsyncResource(
    () => delegationsRepository.candidates(organizationId!),
    [organizationId],
    { enabled },
  );
  const [delegateId, setDelegateId] = useState('');
  const [startsOn, setStartsOn] = useState(todayKey);
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await list.refetch();
      emitDataChanged('approvals');
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not save.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!delegateId) return setError('Choose who will cover your approvals.');
    if (!endsOn) return setError('Choose the last day you are away.');
    if (endsOn < startsOn) return setError('The last day cannot be before the first.');
    const saved = await run(() =>
      delegationsRepository.create(organizationId!, {
        delegateEmployeeId: delegateId,
        startsOn,
        endsOn,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    );
    if (saved) {
      setDelegateId('');
      setEndsOn('');
      setReason('');
    }
  };

  const given = list.data?.given ?? [];
  const received = (list.data?.received ?? []).filter((item) => item.status !== 'ENDED');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Going away?</h3>
          <p className="text-xs text-muted-foreground">
            Hand your approvals to a colleague for the days you are out. You can still decide them
            yourself, and end the handover early.
          </p>
        </div>
        <div>
          <Label className="mb-1 block" htmlFor="delegate">
            Who covers
          </Label>
          <EmployeeCombobox
            disabled={busy || people.loading}
            employees={people.data ?? []}
            id="delegate"
            onChange={setDelegateId}
            placeholder={people.loading ? 'Loading colleagues…' : 'Choose a colleague'}
            value={delegateId}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block" htmlFor="delegate-from">
              First day away
            </Label>
            <DatePicker
              disabled={busy}
              id="delegate-from"
              min={todayKey()}
              onChange={setStartsOn}
              value={startsOn}
            />
          </div>
          <div>
            <Label className="mb-1 block" htmlFor="delegate-to">
              Last day away
            </Label>
            <DatePicker
              disabled={busy}
              id="delegate-to"
              min={startsOn || todayKey()}
              onChange={setEndsOn}
              value={endsOn}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block" htmlFor="delegate-reason">
            Note for them <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            disabled={busy}
            id="delegate-reason"
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Annual leave"
            value={reason}
          />
        </div>
        {error && (
          <p className="text-[11px] font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button disabled={busy} onClick={() => void submit()} type="button">
            {busy ? 'Saving…' : 'Hand over approvals'}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {received.length > 0 && (
          <List
            items={received}
            title="You are covering"
            who={(item) => `For ${item.delegator.name}`}
          />
        )}
        <List
          empty="You have not handed over your approvals."
          items={given}
          onEnd={(item) => void run(() => delegationsRepository.revoke(organizationId!, item.id))}
          busy={busy}
          title="Your handovers"
          who={(item) => `To ${item.delegate.name}`}
        />
      </section>
    </div>
  );
}

function List({
  title,
  items,
  who,
  empty,
  onEnd,
  busy,
}: {
  title: string;
  items: Delegation[];
  who: (item: Delegation) => string;
  empty?: string;
  onEnd?: (item: Delegation) => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <p className="border-b border-border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              key={item.id}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">{who(item)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateRange(item.startsOn, item.endsOn)}
                  {item.reason ? ` · ${item.reason}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={TONE[item.status]}>{LABEL[item.status]}</Badge>
                {onEnd && item.status !== 'ENDED' && (
                  <Button
                    disabled={busy}
                    onClick={() => onEnd(item)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    End
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
