'use client';

import React from 'react';
import { Badge } from '@smarteam/ui';
import { formatDate, type SalaryAdvance } from '@smarteam/contracts';
import { rupees } from './advance-allowance';

/**
 * Past and current advances, one card each.
 *
 * The amount and where it stands lead; the rest reads as a sentence. An approved advance shows how
 * much of it has come back out of pay, as a bar, since that is what someone repaying one checks.
 */

type Tone = React.ComponentProps<typeof Badge>['variant'];

const STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Awaiting approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'sky' },
  PARTIALLY_RECOVERED: { label: 'Repaying', tone: 'sky' },
  RECOVERED: { label: 'Repaid', tone: 'success' },
  REJECTED: { label: 'Not approved', tone: 'secondary' },
  CANCELLED: { label: 'Cancelled', tone: 'secondary' },
};

function AdvanceCard({ advance }: { advance: SalaryAdvance }) {
  const status = STATUS[advance.status] ?? { label: advance.status, tone: 'secondary' as Tone };
  const approved = advance.approvedAmount ?? null;
  const recovered = advance.recoveredAmount;
  const repaying = approved !== null && approved > 0 && advance.status !== 'REJECTED';
  const shown = approved ?? advance.requestedAmount;

  return (
    <li className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold tabular-nums text-foreground">
            {rupees(shown)}
          </p>
          {approved !== null && approved !== advance.requestedAmount && (
            <p className="text-[11px] text-muted-foreground">
              Asked for {rupees(advance.requestedAmount)}
            </p>
          )}
        </div>
        <Badge variant={status.tone}>{status.label}</Badge>
      </div>

      {advance.reason && (
        <p className="mt-1.5 line-clamp-2 text-xs text-foreground/80">{advance.reason}</p>
      )}

      {repaying && (
        <div className="mt-3">
          <div
            aria-label={`${rupees(recovered)} of ${rupees(approved)} repaid`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (recovered / approved) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {recovered >= approved
              ? 'Fully repaid from your pay.'
              : `${rupees(recovered)} repaid · ${rupees(approved - recovered)} to go`}
          </p>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Requested {formatDate(advance.requestedAt)}
      </p>
    </li>
  );
}

export function AdvanceHistory({ advances }: { advances: SalaryAdvance[] }) {
  if (advances.length === 0)
    return (
      <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-bold text-foreground">No salary advances yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          When you need money before payday, request an advance. It is repaid from your pay.
        </p>
      </div>
    );
  return (
    <section aria-label="Your advances">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        History
      </p>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {advances.map((advance) => (
          <AdvanceCard advance={advance} key={advance.id} />
        ))}
      </ul>
    </section>
  );
}
