'use client';

import React from 'react';
import { formatMoney } from '@smarteam/contracts';
import type { AdvanceAllowance } from '../../repositories/payroll.repository';

/**
 * How much of the advance limit is left, drawn rather than written out.
 *
 * The limit is one bar: what is being repaid, what is waiting for a decision, the request being
 * typed (when there is one) and what is still free. The figures sit in a legend under it, so the
 * sentence that used to carry all four numbers is now something read at a glance.
 */

/** Whole rupees when there are no paise, so large figures stay short. */
export const rupees = (value: number) =>
  Number.isInteger(value) ? formatMoney(value).replace(/\.00$/, '') : formatMoney(value);

/** Why no request can be made, or null when one can. */
export function allowanceBlock(allowance: AdvanceAllowance) {
  if (allowance.limitPercent === 0)
    return {
      title: 'Advances are turned off',
      detail: 'Your organisation does not offer salary advances at the moment.',
    };
  if (allowance.limit === null)
    return {
      title: 'No salary on record yet',
      detail: 'An advance is measured against your monthly salary. Ask HR to add it.',
    };
  if (allowance.available <= 0)
    return {
      title: 'You have used your full limit',
      detail:
        'More becomes available as pending requests are decided and approved advances are repaid.',
    };
  return null;
}

const SEGMENTS = [
  { key: 'repaying', label: 'Being repaid', bar: 'bg-slate-500 dark:bg-slate-400' },
  { key: 'pending', label: 'Awaiting approval', bar: 'bg-amber-500' },
  { key: 'request', label: 'This request', bar: 'bg-primary' },
] as const;

export function AllowanceMeter({
  allowance,
  request = 0,
}: {
  allowance: AdvanceAllowance;
  /** The amount being typed, shown as its own share of the bar while it fits. */
  request?: number;
}) {
  const limit = allowance.limit ?? 0;
  const pending = allowance.pending ?? 0;
  const repaying = allowance.repaying ?? Math.max(0, allowance.outstanding - pending);
  const asked = Math.min(Math.max(request, 0), allowance.available);
  const values = { repaying, pending, request: asked };
  const share = (value: number) => (limit > 0 ? Math.min(100, (value / limit) * 100) : 0);
  const left = Math.max(0, allowance.available - asked);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {asked > 0 ? 'Left after this request' : 'Available to request'}
          </p>
          <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-foreground">
            {rupees(left)}
          </p>
        </div>
        <p className="pb-1 text-right text-xs text-muted-foreground">
          of <span className="font-semibold text-foreground">{rupees(limit)}</span> limit
        </p>
      </div>

      <div
        aria-label={`${rupees(left)} of ${rupees(limit)} available`}
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
      >
        {SEGMENTS.map((segment) =>
          values[segment.key] > 0 ? (
            <span
              className={`h-full ${segment.bar} transition-[width] duration-300 motion-reduce:transition-none`}
              key={segment.key}
              style={{ width: `${share(values[segment.key])}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {SEGMENTS.filter((segment) => values[segment.key] > 0).map((segment) => (
          <li className="flex items-center gap-1.5" key={segment.key}>
            <span aria-hidden="true" className={`size-2 rounded-full ${segment.bar}`} />
            {segment.label}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {rupees(values[segment.key])}
            </span>
          </li>
        ))}
      </ul>

      {allowance.monthlySalary !== null && (
        <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
          Limit is {allowance.limitPercent}% of your {rupees(allowance.monthlySalary)} monthly gross
          salary.
        </p>
      )}
    </div>
  );
}

/** The advances tab's summary: three figures an employee looks for before asking. */
export function AllowanceSummary({ allowance }: { allowance: AdvanceAllowance }) {
  // Off, or nothing to measure against: say so instead of three zeros.
  if (allowance.limitPercent === 0 || allowance.limit === null)
    return <p className="text-xs text-muted-foreground">{allowanceBlock(allowance)?.detail}</p>;
  const tiles = [
    { label: 'Available now', value: allowance.available, tone: 'text-primary' },
    { label: 'Pending', value: allowance.pending ?? 0, tone: 'text-foreground' },
    {
      label: 'Being repaid',
      value: allowance.repaying ?? Math.max(0, allowance.outstanding - (allowance.pending ?? 0)),
      tone: 'text-foreground',
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div className="rounded-lg border border-border bg-card px-3 py-2.5" key={tile.label}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tile.label}
          </p>
          <p
            className={`mt-0.5 font-mono text-sm font-bold tabular-nums sm:text-base ${tile.tone}`}
          >
            {rupees(tile.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
