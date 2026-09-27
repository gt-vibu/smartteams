'use client';

import React, { useState } from 'react';
import {
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectMenu,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@smarteam/ui';
import { formatDate, formatMinutes, formatMoney, type LeaveType } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { emitDataChanged } from '../../lib/data-events';
import { leaveExtrasRepository } from '../../repositories/leave-extras.repository';
import { localDateKeyIn } from '../../lib/local-date';

const TONE = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'secondary',
  CANCELLED: 'secondary',
} as const;
const LABEL = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
} as const;
const daysAgo = (n: number) => localDateKeyIn(-n);

type Asking = 'comp-off' | 'encash' | null;
type Deciding = { kind: 'comp-off' | 'encash'; id: string; approve: boolean; who: string } | null;

/**
 * Comp-off for a weekend or holiday worked, and encashing unused leave: asking for either, and —
 * for a manager or leave administrator — deciding the ones waiting on them.
 */
export function LeaveExtrasPanel({ types }: { types: readonly LeaveType[] }) {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const enabled = Boolean(organizationId);
  const compOffs = useAsyncResource(
    () => leaveExtrasRepository.compOffs(organizationId!),
    [organizationId],
    { enabled },
  );
  const encashments = useAsyncResource(
    () => leaveExtrasRepository.encashments(organizationId!),
    [organizationId],
    { enabled },
  );
  const [asking, setAsking] = useState<Asking>(null);
  const [deciding, setDeciding] = useState<Deciding>(null);
  const [form, setForm] = useState({
    workDate: '',
    days: '1',
    reason: '',
    typeId: '',
    comment: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasCompOff = types.some((type) => type.isCompOff);
  const encashable = types.filter((type) => type.encashable);
  const waiting = [
    ...(compOffs.data ?? [])
      .filter((item) => !item.mine && item.status === 'PENDING')
      .map((item) => ({
        kind: 'comp-off' as const,
        id: item.id,
        who: item.employeeName,
        what: `Worked ${formatDate(item.workDate)} (${formatMinutes(item.workedMinutes)}) · asks for ${item.days === 1 ? 'a day' : 'half a day'} · ${item.reason}`,
      })),
    ...(encashments.data ?? [])
      .filter((item) => !item.mine && item.status === 'PENDING')
      .map((item) => ({
        kind: 'encash' as const,
        id: item.id,
        who: item.employeeName,
        what: `Encash ${item.days} days of ${item.leaveType}`,
      })),
  ];
  const mine = [
    ...(compOffs.data ?? [])
      .filter((item) => item.mine)
      .map((item) => ({
        id: item.id,
        status: item.status,
        title: `Comp-off for ${formatDate(item.workDate)}`,
        detail:
          item.status === 'APPROVED' && item.expiresOn
            ? `${item.days} day · use by ${formatDate(item.expiresOn)}`
            : `${item.days} day${item.days === 1 ? '' : 's'}${item.decisionComment ? ` · ${item.decisionComment}` : ''}`,
      })),
    ...(encashments.data ?? [])
      .filter((item) => item.mine)
      .map((item) => ({
        id: item.id,
        status: item.status,
        title: `Encash ${item.days} days of ${item.leaveType}`,
        detail: item.amount
          ? `${formatMoney(item.amount)}${item.paidInRun ? ' · paid' : ' · in the next payroll'}`
          : (item.decisionComment ?? ''),
      })),
  ];

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await Promise.all([compOffs.refetch(), encashments.refetch()]);
      emitDataChanged('approvals');
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not go through.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitAsk = async () => {
    const done =
      asking === 'comp-off'
        ? await run(() =>
            leaveExtrasRepository.requestCompOff(organizationId!, {
              workDate: form.workDate,
              days: Number(form.days),
              reason: form.reason.trim(),
            }),
          )
        : await run(() =>
            leaveExtrasRepository.requestEncashment(organizationId!, {
              leaveTypeId: form.typeId,
              days: Number(form.days),
            }),
          );
    if (done) setAsking(null);
  };

  const submitDecision = async () => {
    if (!deciding) return;
    const input = {
      approve: deciding.approve,
      ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
    };
    const done = await run(() =>
      deciding.kind === 'comp-off'
        ? leaveExtrasRepository.decideCompOff(organizationId!, deciding.id, input)
        : leaveExtrasRepository.decideEncashment(organizationId!, deciding.id, input),
    );
    if (done) setDeciding(null);
  };

  if (!hasCompOff && encashable.length === 0 && waiting.length === 0 && mine.length === 0)
    return null;

  return (
    <section aria-label="Comp-off and encashment" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-foreground">Comp-off and encashment</h2>
        <div className="flex gap-2">
          {hasCompOff && (
            <Button
              onClick={() => {
                setForm({ ...form, workDate: '', days: '1', reason: '' });
                setError('');
                setAsking('comp-off');
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Ask for comp-off
            </Button>
          )}
          {encashable.length > 0 && (
            <Button
              onClick={() => {
                setForm({ ...form, typeId: encashable[0]?.id ?? '', days: '1' });
                setError('');
                setAsking('encash');
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Encash leave
            </Button>
          )}
        </div>
      </div>

      {error && !asking && !deciding && (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      {waiting.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          <li className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Waiting for you
          </li>
          {waiting.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              key={item.id}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{item.who}</span>
                <span className="text-[11px] text-muted-foreground">{item.what}</span>
              </span>
              <span className="flex gap-2">
                {[false, true].map((approve) => (
                  <Button
                    disabled={busy}
                    key={String(approve)}
                    onClick={() => {
                      setForm({ ...form, comment: '' });
                      setError('');
                      setDeciding({ kind: item.kind, id: item.id, approve, who: item.who });
                    }}
                    size="sm"
                    type="button"
                    variant={approve ? 'default' : 'outline'}
                  >
                    {approve ? 'Approve' : 'Decline'}
                  </Button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mine.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {mine.map((item) => (
            <li className="flex items-center justify-between gap-2 px-4 py-2.5" key={item.id}>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">{item.title}</span>
                <span className="text-[11px] text-muted-foreground">{item.detail}</span>
              </span>
              <Badge variant={TONE[item.status]}>{LABEL[item.status]}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog onOpenChange={(next) => !next && !busy && setAsking(null)} open={asking !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{asking === 'comp-off' ? 'Ask for comp-off' : 'Encash leave'}</DialogTitle>
          <div className="mt-3 space-y-3">
            {asking === 'comp-off' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  For a weekly off or holiday you worked in the last 60 days. Your manager approves
                  it.
                </p>
                <div>
                  <Label className="mb-1 block" htmlFor="comp-date">
                    Day you worked
                  </Label>
                  <DatePicker
                    disabled={busy}
                    id="comp-date"
                    max={daysAgo(0)}
                    min={daysAgo(60)}
                    onChange={(workDate) => setForm({ ...form, workDate })}
                    value={form.workDate}
                  />
                </div>
                <DaysPicker
                  busy={busy}
                  onChange={(days) => setForm({ ...form, days })}
                  value={form.days}
                />
                <div>
                  <Label className="mb-1 block" htmlFor="comp-reason">
                    What was the work?
                  </Label>
                  <Textarea
                    disabled={busy}
                    id="comp-reason"
                    onChange={(event) => setForm({ ...form, reason: event.target.value })}
                    rows={2}
                    value={form.reason}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Approved days leave your balance and are paid in the next payroll.
                </p>
                <div>
                  <Label className="mb-1 block" htmlFor="encash-type">
                    Leave
                  </Label>
                  <SelectMenu
                    onValueChange={(typeId) => setForm({ ...form, typeId })}
                    value={form.typeId}
                  >
                    <SelectTrigger id="encash-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {encashable.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                          {type.maxEncashDays ? ` (up to ${type.maxEncashDays} a year)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectMenu>
                </div>
                <div>
                  <Label className="mb-1 block" htmlFor="encash-days">
                    Days
                  </Label>
                  <Input
                    className="w-28"
                    disabled={busy}
                    id="encash-days"
                    inputMode="decimal"
                    min={0.5}
                    onChange={(event) => setForm({ ...form, days: event.target.value })}
                    step={0.5}
                    type="number"
                    value={form.days}
                  />
                </div>
              </>
            )}
            {error && (
              <p className="text-[11px] font-semibold text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={busy}
                onClick={() => setAsking(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void submitAsk()} type="button">
                {busy ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(next) => !next && !busy && setDeciding(null)} open={deciding !== null}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {deciding?.approve ? 'Approve' : 'Decline'} {deciding?.who}&apos;s request
          </DialogTitle>
          <div className="mt-3 space-y-3">
            <Label className="block" htmlFor="extra-comment">
              {deciding?.approve ? 'Note (optional)' : 'Reason'}
            </Label>
            <Textarea
              disabled={busy}
              id="extra-comment"
              onChange={(event) => setForm({ ...form, comment: event.target.value })}
              rows={2}
              value={form.comment}
            />
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
              <Button
                disabled={busy || (!deciding?.approve && form.comment.trim().length < 3)}
                onClick={() => void submitDecision()}
                type="button"
                variant={deciding?.approve ? 'default' : 'destructive'}
              >
                {busy ? 'Saving…' : deciding?.approve ? 'Approve' : 'Decline'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DaysPicker({
  value,
  busy,
  onChange,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="How much">
      {[
        ['1', 'A full day'],
        ['0.5', 'Half a day'],
      ].map(([days, label]) => (
        <Button
          aria-checked={value === days}
          disabled={busy}
          key={days}
          onClick={() => onChange(days!)}
          role="radio"
          size="sm"
          type="button"
          variant={value === days ? 'default' : 'outline'}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
