'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input } from '@smarteam/ui';
import { dateKey, employeeDisplayName, entitlementOf, type Employee } from '@smarteam/contracts';
import type { LeaveAdminState } from '../../hooks/use-leave-admin';

/**
 * Every employee's balances, with the manual adjustment the API supports.
 *
 * An adjustment is a ledger entry, not an overwrite: the API records the amount and reason
 * against the balance so the movement stays explainable months later.
 */
export function LeaveBalancesPanel({ admin }: { admin: LeaveAdminState }) {
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const employeesById = useMemo(
    () => new Map<string, Employee>(admin.employees.map((e) => [e.id, e])),
    [admin.employees],
  );
  const typesById = useMemo(
    () => new Map(admin.types.map((type) => [type.id, type])),
    [admin.types],
  );

  const query = search.trim().toLowerCase();
  const rows = admin.balances.filter((balance) => {
    if (!query) return true;
    const employee = employeesById.get(balance.employeeId);
    return (
      (employee ? employeeDisplayName(employee).toLowerCase() : '').includes(query) ||
      (employee?.employeeNumber ?? '').toLowerCase().includes(query)
    );
  });

  const submit = async (balanceId: string) => {
    const balance = admin.balances.find((entry) => entry.id === balanceId);
    if (!balance) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      setError('Enter a non-zero number of days.');
      return;
    }
    // The API requires at least five characters and stores the reason on the ledger entry.
    if (reason.trim().length < 5) {
      setError('A reason of at least five characters is required.');
      return;
    }
    setError('');
    const adjusted = await admin.adjustBalance({
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      amount: value,
      reason: reason.trim(),
      periodStart: dateKey(balance.periodStart),
      periodEnd: dateKey(balance.periodEnd),
    });
    if (adjusted) {
      setActiveId(null);
      setReason('');
      setAmount('1');
    }
  };

  return (
    <section className="space-y-3">
      <Input
        className="max-w-xs"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search employee"
        value={search}
      />

      {rows.length === 0 ? (
        <div className="flex min-h-[clamp(200px,42vh,380px)] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">No balances</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Balances are provisioned once a leave type is assigned to a branch.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="stack-table stack-wide w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-border bg-table-header">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Employee</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Entitled</th>
                <th className="px-4 py-2.5 font-semibold">Used</th>
                <th className="px-4 py-2.5 font-semibold">Pending</th>
                <th className="px-4 py-2.5 font-semibold">Available</th>
                <th className="px-4 py-2.5 text-right font-semibold">Adjust</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((balance) => {
                const employee = employeesById.get(balance.employeeId);
                const type = typesById.get(balance.leaveTypeId);
                return (
                  <React.Fragment key={balance.id}>
                    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                      <td data-cell="primary" className="px-4 py-2.5">
                        <span className="block font-semibold text-foreground">
                          {employee ? employeeDisplayName(employee) : 'Not in the directory'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {employee?.employeeNumber ?? '--'}
                        </span>
                      </td>
                      <td data-label="Type" className="px-4 py-2.5 text-foreground">
                        {type?.name ?? 'Leave'}
                      </td>
                      <td
                        data-label="Entitled"
                        className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground"
                      >
                        {entitlementOf(balance)}
                      </td>
                      <td
                        data-label="Used"
                        className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground"
                      >
                        {balance.usedAmount}
                      </td>
                      <td
                        data-label="Pending"
                        className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground"
                      >
                        {balance.reservedAmount}
                      </td>
                      <td
                        data-label="Available"
                        className="px-4 py-2.5 font-mono font-semibold tabular-nums text-foreground"
                      >
                        {balance.availableAmount}
                      </td>
                      <td data-cell="actions" className="px-4 py-2.5 text-right">
                        {admin.canAdjust && activeId !== balance.id && (
                          <Button
                            onClick={() => {
                              setActiveId(balance.id);
                              setError('');
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Adjust
                          </Button>
                        )}
                      </td>
                    </tr>

                    {activeId === balance.id && (
                      <tr className="border-b border-border bg-muted/30">
                        <td className="px-4 py-3" colSpan={7}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              aria-label="Days to adjust"
                              className="w-24"
                              disabled={admin.saving}
                              onChange={(event) => setAmount(event.target.value)}
                              type="number"
                              value={amount}
                            />
                            <Input
                              aria-label="Adjustment reason"
                              className="max-w-sm"
                              disabled={admin.saving}
                              onChange={(event) => setReason(event.target.value)}
                              placeholder="Reason (recorded on the ledger)"
                              value={reason}
                            />
                            <Button
                              disabled={admin.saving}
                              onClick={() => void submit(balance.id)}
                              size="sm"
                              type="button"
                            >
                              {admin.saving ? 'Saving...' : 'Apply'}
                            </Button>
                            <Button
                              disabled={admin.saving}
                              onClick={() => setActiveId(null)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Cancel
                            </Button>
                            {(error || admin.saveError) && (
                              <span
                                className="text-[11px] font-medium text-destructive"
                                role="alert"
                              >
                                {error || admin.saveError}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
