'use client';

import React, { useState } from 'react';
import { Button, DatePicker, Input, Label } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { emitDataChanged } from '../../lib/data-events';
import { EmployeeCombobox } from '../common/employee-combobox';
import { delegationsRepository } from '../../repositories/delegations.repository';
import { DelegationList } from './delegation-list';
import { localDateKey } from '../../lib/local-date';

const todayKey = () => localDateKey();

/**
 * Handing approvals to a colleague while away.
 *
 * In their own workspace, someone asks a colleague to cover; the colleague accepts or declines,
 * and nothing is handed over until they accept. In the admin workspace an administrator sets cover
 * up for anyone, which takes effect at once. The person covering decides what the person away
 * could, for the chosen days; the person away keeps deciding too, and can end it early.
 */
export function DelegationPanel({ admin = false }: { admin?: boolean }) {
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
  const [awayId, setAwayId] = useState('');
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
    if (admin && !awayId) return setError('Choose who is away.');
    if (!delegateId) return setError('Choose who will cover the approvals.');
    if (admin && awayId === delegateId)
      return setError('Choose someone other than the person who is away.');
    if (!endsOn) return setError('Choose the last day you are away.');
    if (endsOn < startsOn) return setError('The last day cannot be before the first.');
    const saved = await run(() =>
      delegationsRepository.create(organizationId!, {
        delegateEmployeeId: delegateId,
        ...(admin ? { delegatorEmployeeId: awayId } : {}),
        startsOn,
        endsOn,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    );
    if (saved) {
      setDelegateId('');
      setAwayId('');
      setEndsOn('');
      setReason('');
    }
  };

  const given = list.data?.given ?? [];
  const received = list.data?.received ?? [];
  const asked = received.filter((item) => item.status === 'PENDING');
  const covering = received.filter((item) => ['ACTIVE', 'UPCOMING'].includes(item.status));
  const everyone = list.data?.all ?? [];
  const answer = (item: { id: string }, accept: boolean) =>
    void run(() => delegationsRepository.respond(organizationId!, item.id, accept));
  const end = (item: { id: string }) =>
    void run(() => delegationsRepository.revoke(organizationId!, item.id));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {admin ? 'Set up cover' : 'Going away?'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {admin
              ? "Hand someone's approvals to a colleague for the days they are out. It takes effect straight away."
              : 'Ask a colleague to cover your approvals while you are out. It starts once they accept; you can still decide them yourself.'}
          </p>
        </div>
        {admin && (
          <div>
            <Label className="mb-1 block" htmlFor="delegate-away">
              Who is away
            </Label>
            <EmployeeCombobox
              disabled={busy || people.loading}
              employees={people.data ?? []}
              id="delegate-away"
              onChange={setAwayId}
              placeholder={people.loading ? 'Loading people…' : 'Choose a person'}
              value={awayId}
            />
          </div>
        )}
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
            {busy ? 'Saving…' : admin ? 'Set up cover' : 'Ask for cover'}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {admin ? (
          <DelegationList
            busy={busy}
            empty="Nobody's approvals are covered."
            items={everyone}
            onEnd={end}
            title="Cover in place"
            who={(item) => `${item.delegator.name} → ${item.delegate.name}`}
          />
        ) : (
          <>
            <DelegationList
              busy={busy}
              items={asked}
              onAnswer={answer}
              title="Asked to cover"
              who={(item) => `For ${item.delegator.name}`}
            />
            <DelegationList
              items={covering}
              title="You are covering"
              who={(item) => `For ${item.delegator.name}`}
            />
            <DelegationList
              busy={busy}
              empty="You have not handed over your approvals."
              items={given}
              onEnd={end}
              title="Your handovers"
              who={(item) => `To ${item.delegate.name}`}
            />
          </>
        )}
      </section>
    </div>
  );
}
