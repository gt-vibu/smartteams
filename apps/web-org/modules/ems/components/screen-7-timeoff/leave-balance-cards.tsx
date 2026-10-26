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
  onSelect,
}: {
  balances: LeaveBalance[];
  typesById: Map<string, LeaveType>;
  onSelect?: (leaveTypeId: string) => void;
}) {
  if (balances.length === 0) return null;

  const nameCount = new Map<string, number>();
  for (const balance of balances) {
    const name = (balance.leaveType ?? typesById.get(balance.leaveTypeId))?.name ?? '';
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {balances.map((balance) => {
        const type = balance.leaveType ?? typesById.get(balance.leaveTypeId);
        const entitled = entitlementOf(balance);
        // Guard the divide: a type with no annual allowance has an entitlement of zero.
        const usedFraction = entitled > 0 ? (balance.usedAmount / entitled) * 100 : 0;
        // Unpaid leave has no allowance to run down: "0 of 0 available" read as none allowed.
        const unpaid = type?.paid === false && entitled === 0;

        const contents = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground">
                {type?.name ?? 'Leave'}
              </span>
              {type && (nameCount.get(type.name) ?? 0) > 1 && (
                <span className="font-mono text-[10px] text-muted-foreground">{type.code}</span>
              )}
            </div>

            {unpaid ? (
              <p className="mt-3 text-sm font-semibold text-foreground">
                Unpaid
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · no balance needed
                </span>
              </p>
            ) : (
              <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                {balance.availableAmount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  of {entitled} available
                </span>
              </p>
            )}

            {!unpaid && (
              <Progress
                aria-label={`${balance.usedAmount} of ${entitled} days used`}
                className="mt-3"
                value={Math.min(usedFraction, 100)}
              />
            )}

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
          </>
        );
        return onSelect ? (
          <button
            aria-label={`${type?.name ?? 'Leave'} balance. Open matching request history.`}
            className="min-w-0 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
            key={balance.id}
            onClick={() => onSelect(balance.leaveTypeId)}
            type="button"
          >
            {contents}
          </button>
        ) : (
          <div
            className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4"
            key={balance.id}
          >
            {contents}
          </div>
        );
      })}
    </div>
  );
}
