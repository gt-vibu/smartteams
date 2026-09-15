'use client';

import React from 'react';
import { Progress } from '@smarteam/ui';
import { entitlementOf, type LeaveBalance, type LeaveType } from '@smarteam/contracts';

/**
 * Entitlement per leave type, exactly as the server reports it.
 *
 * `availableAmount` already excludes days reserved by a pending request, so nothing is
 * recalculated here — a second, disagreeing figure is worse than no figure.
 */
export function LeaveBalanceCards({
  balances,
  typesById,
}: {
  balances: LeaveBalance[];
  typesById: Map<string, LeaveType>;
}) {
  if (balances.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {balances.map((balance) => {
        const type = balance.leaveType ?? typesById.get(balance.leaveTypeId);
        const entitled = entitlementOf(balance);
        // Guard the divide: a type with no annual allowance has an entitlement of zero.
        const usedFraction = entitled > 0 ? (balance.usedAmount / entitled) * 100 : 0;

        return (
          <div className="rounded-lg border border-border bg-card p-4" key={balance.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground">
                {type?.name ?? 'Leave'}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {type?.code ?? '--'}
              </span>
            </div>

            <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
              {balance.availableAmount}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                of {entitled} available
              </span>
            </p>

            <Progress
              aria-label={`${balance.usedAmount} of ${entitled} days used`}
              className="mt-3"
              value={Math.min(usedFraction, 100)}
            />

            <dl className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex gap-1">
                <dt>Used</dt>
                <dd className="font-semibold tabular-nums text-foreground">{balance.usedAmount}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Pending</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {balance.reservedAmount}
                </dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
