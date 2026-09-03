'use client';

import React from 'react';
import { Badge } from '@smarteam/ui';
import { dateKey, entitlementOf } from '@smarteam/contracts';
import { useLeave } from '../../hooks/use-leave';

/** Compact leave summary for the overview screen, reading the same API as the Time Off screen. */
export function OverviewLeavePreviewTab() {
  const leave = useLeave();
  const recent = leave.requests.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {leave.balances.map((balance) => {
          const type = balance.leaveType ?? leave.typesById.get(balance.leaveTypeId);
          return (
            <div className="rounded-lg border border-border bg-card p-3.5" key={balance.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-foreground">
                  {type?.name ?? 'Leave'}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {type?.code ?? '--'}
                </span>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {balance.availableAmount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {entitlementOf(balance)} days
                </span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {balance.usedAmount} used · {balance.reservedAmount} pending
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-xs font-semibold text-foreground">Recent leave requests</h4>
        </div>

        {recent.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted-foreground">
            No leave requests submitted.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <tbody>
              {recent.map((request) => {
                const type = leave.typesById.get(request.leaveTypeId);
                return (
                  <tr
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                    key={request.id}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {type?.name ?? 'Leave'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {dateKey(request.startDate)} to {dateKey(request.endDate)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-foreground">
                      {request.requestedDays}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Badge
                        variant={
                          request.status === 'REJECTED'
                            ? 'destructive'
                            : request.status === 'APPROVED'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {request.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
