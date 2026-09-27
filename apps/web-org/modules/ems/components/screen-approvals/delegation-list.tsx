'use client';

import React from 'react';
import { Badge, Button } from '@smarteam/ui';
import { formatDateRange } from '@smarteam/contracts';
import type { Delegation } from '../../repositories/delegations.repository';

const TONE = {
  PENDING: 'warning',
  DECLINED: 'secondary',
  ACTIVE: 'success',
  UPCOMING: 'sky',
  ENDED: 'secondary',
} as const;
const LABEL = {
  PENDING: 'Waiting for answer',
  DECLINED: 'Declined',
  ACTIVE: 'Covering now',
  UPCOMING: 'Upcoming',
  ENDED: 'Ended',
} as const;

/** One list of handovers, with whatever the viewer may do to each. */
export function DelegationList({
  title,
  items,
  who,
  empty,
  busy,
  onEnd,
  onAnswer,
}: {
  title: string;
  items: Delegation[];
  who: (item: Delegation) => string;
  empty?: string;
  busy?: boolean;
  onEnd?: (item: Delegation) => void;
  /** For the person asked to cover: accept or decline a pending request. */
  onAnswer?: (item: Delegation, accept: boolean) => void;
}) {
  if (items.length === 0 && !empty) return null;
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
                  {item.setByAdministrator ? ' · set by an administrator' : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {onAnswer && item.status === 'PENDING' ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => onAnswer(item, false)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Decline
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => onAnswer(item, true)}
                      size="sm"
                      type="button"
                    >
                      Accept
                    </Button>
                  </>
                ) : (
                  <Badge variant={TONE[item.status]}>{LABEL[item.status]}</Badge>
                )}
                {onEnd && !['ENDED', 'DECLINED'].includes(item.status) && (
                  <Button
                    disabled={busy}
                    onClick={() => onEnd(item)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {item.status === 'PENDING' ? 'Withdraw' : 'End'}
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
