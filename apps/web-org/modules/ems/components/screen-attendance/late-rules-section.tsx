'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';

type Rules = { graceMinutes: number; marksPerHalfDay: number };
const path = (organizationId: string) => orgPath(organizationId, '/attendance/late/rules');

/**
 * When a check-in counts as late, and what being late costs. A check-in within the grace after
 * the shift starts is on time; every so many late days in a month cost half a day's pay. Zero for
 * the second means late days are recorded but never deducted.
 */
export function LateRulesSection({ canWrite }: { canWrite: boolean }) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const current = useAsyncResource(
    async () => (await apiRequest(path(organizationId!), { method: 'GET' })) as Rules,
    [organizationId],
    { enabled: Boolean(organizationId) },
  );
  const [form, setForm] = useState<Rules | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => {
    if (current.data) setForm(current.data);
  }, [current.data]);
  if (!form || !current.data) return null;
  const saved = current.data;
  const changed =
    form.graceMinutes !== saved.graceMinutes || form.marksPerHalfDay !== saved.marksPerHalfDay;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest(path(organizationId!), { method: 'PUT', body: form });
      await current.refetch();
      setMessage({ error: false, text: 'Saved. Payroll counts it from the next calculation.' });
    } catch (caught) {
      setMessage({ error: true, text: caught instanceof Error ? caught.message : 'Not saved.' });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Rules, id: string, label: string, suffix: string, max: number) => (
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
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Late check-ins</p>
        <p className="text-[11px] text-muted-foreground">
          Counted against the start of each person&apos;s assigned shift.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          'graceMinutes',
          'late-grace',
          'On time until',
          'minutes after the shift starts',
          240,
        )}
        {field(
          'marksPerHalfDay',
          'late-half-day',
          'Half a day’s pay for every',
          form.marksPerHalfDay === 0 ? 'late days — off, never deducted' : 'late days in a month',
          31,
        )}
      </div>
      {canWrite && (
        <div className="flex items-center justify-end gap-3">
          {message && (
            <span
              className={`text-[11px] font-semibold ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}
              role={message.error ? 'alert' : 'status'}
            >
              {message.text}
            </span>
          )}
          <Button disabled={busy || !changed} onClick={() => void save()} size="sm" type="button">
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
