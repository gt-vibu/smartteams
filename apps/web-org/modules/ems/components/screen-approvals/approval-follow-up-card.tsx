'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

type FollowUp = { reminderDays: number; escalationDays: number };
const path = (organizationId: string) => orgPath(organizationId, '/approval-policies/follow-up');

/**
 * How long a request may wait: its approvers are reminded after the first delay, every day, and
 * administrators are told once after the second. Zero turns either off.
 */
export function ApprovalFollowUpCard() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId ?? null;
  const canWrite = hasPermission(persona?.permissions ?? [], 'approval-policies.write');
  const current = useAsyncResource(
    async () => (await apiRequest(path(organizationId!), { method: 'GET' })) as FollowUp,
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const [form, setForm] = useState<FollowUp | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (current.data) setForm(current.data);
  }, [current.data]);

  if (!form) return null;
  const changed =
    form.reminderDays !== current.data?.reminderDays ||
    form.escalationDays !== current.data.escalationDays;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(path(organizationId!), { method: 'PUT', body: form });
      await current.refetch();
      setMessage({ tone: 'ok', text: 'Saved.' });
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'Not saved.' });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof FollowUp, id: string, label: string, hint: string, max: number) => (
    <div>
      <Label className="mb-1 block" htmlFor={id}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          className="w-20"
          disabled={!canWrite || busy}
          id={id}
          inputMode="numeric"
          max={max}
          min={0}
          onChange={(event) =>
            setForm({ ...form, [key]: Math.max(0, Math.min(max, Number(event.target.value) || 0)) })
          }
          type="number"
          value={form[key]}
        />
        <span className="text-xs text-muted-foreground">{form[key] === 0 ? 'off' : 'days'}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Follow-up on waiting requests</h3>
        <p className="text-xs text-muted-foreground">
          So nothing sits undecided. Reminders go to the people the request is waiting on, including
          anyone covering for them.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          'reminderDays',
          'follow-up-remind',
          'Remind approvers after',
          'Then once a day until it is decided.',
          30,
        )}
        {field(
          'escalationDays',
          'follow-up-escalate',
          'Tell administrators after',
          'Once, if it is still waiting.',
          60,
        )}
      </div>
      {canWrite && (
        <div className="flex items-center justify-end gap-3">
          {message && (
            <span
              className={`text-[11px] font-semibold ${message.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
              role={message.tone === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </span>
          )}
          <Button disabled={busy || !changed} onClick={() => void save()} size="sm" type="button">
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </section>
  );
}
