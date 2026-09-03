'use client';

import React from 'react';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button } from '@smarteam/ui';
import { usePayroll } from '../../hooks/use-payroll';
import { PayrollStructurePanel } from './payroll-structure-panel';
import { PayrollPayslipsPanel } from './payroll-payslips-panel';
import { PayrollAdvancesPanel } from './payroll-advances-panel';

type Tab = 'structure' | 'payslips' | 'advances';

/**
 * The employee's own payroll.
 *
 * Replaces a screen built on `payroll.json` that computed its own statutory deductions in the
 * browser — a flat 1800 for PF, 200 for professional tax, and ten percent of gross as income tax.
 * Those figures were not the ones payroll would pay. Every number here is now a backend result,
 * and anything the backend does not calculate is absent rather than estimated.
 */
export function ScreenPayroll() {
  const payroll = usePayroll();
  const [tab, setTab] = useScreenTab<Tab>(
    'payrollTab',
    ['structure', 'payslips', 'advances'],
    'structure',
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'structure', label: 'Salary structure' },
    {
      id: 'payslips',
      label: `Payslips${payroll.payslips.length ? ` (${payroll.payslips.length})` : ''}`,
    },
    {
      id: 'advances',
      label: `Advances${payroll.advances.length ? ` (${payroll.advances.length})` : ''}`,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {tabs.map((entry) => (
          <Button
            className={`rounded-none pb-1 text-xs font-semibold ${
              tab === entry.id
                ? 'border-b-2 border-foreground font-bold text-foreground'
                : 'text-muted-foreground'
            }`}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {payroll.hasNoEmployeeRecord && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
          <p className="text-sm font-bold text-foreground">No employee record</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your account is not linked to an employee, so payroll cannot be resolved for you.
          </p>
        </div>
      )}

      {!payroll.hasNoEmployeeRecord && payroll.loading && (
        <p className="py-10 text-center text-xs text-muted-foreground" role="status">
          Loading payroll...
        </p>
      )}

      {!payroll.hasNoEmployeeRecord && !payroll.loading && payroll.error && (
        <div className="rounded-lg border border-border bg-card p-10 text-center" role="alert">
          <p className="text-sm font-bold text-foreground">Could not load payroll</p>
          <p className="mt-1 text-xs text-muted-foreground">{payroll.error}</p>
          <Button
            className="mt-3"
            onClick={() => void payroll.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}

      {!payroll.hasNoEmployeeRecord && !payroll.loading && !payroll.error && (
        <>
          {tab === 'structure' &&
            (payroll.profileForbidden || !payroll.profile ? (
              <Unavailable
                detail="You do not have permission to view your salary structure, or none has been assigned yet."
                title="Salary structure not available"
              />
            ) : (
              <PayrollStructurePanel profile={payroll.profile} />
            ))}

          {tab === 'payslips' &&
            (payroll.payslipsForbidden ? (
              <Unavailable
                detail="You do not have permission to view payslips."
                title="Payslips not available"
              />
            ) : (
              <PayrollPayslipsPanel payslips={payroll.payslips} />
            ))}

          {tab === 'advances' &&
            (payroll.advancesForbidden ? (
              <Unavailable
                detail="You do not have permission to view salary advances."
                title="Advances not available"
              />
            ) : (
              <PayrollAdvancesPanel
                advances={payroll.advances}
                canRequest={payroll.canRequestAdvance && !payroll.hasNoEmployeeRecord}
                onRequest={payroll.requestAdvance}
                saveError={payroll.saveError}
                saving={payroll.saving}
              />
            ))}
        </>
      )}
    </div>
  );
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-10 text-center" role="status">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
