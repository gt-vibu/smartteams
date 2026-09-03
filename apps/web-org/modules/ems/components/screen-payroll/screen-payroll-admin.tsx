'use client';

import React from 'react';
import { Wallet } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button } from '@smarteam/ui';
import { usePayrollAdmin } from '../../hooks/use-payroll-admin';
import { PayrollRunsPanel } from './payroll-runs-panel';
import { PayrollEmployeePayPanel } from './payroll-employee-pay-panel';
import { ScreenPayrollLegalConfig } from './screen-payroll-legal-config';
import { ScreenCompensation } from './screen-compensation';

type Tab = 'RUNS' | 'COMPENSATION' | 'STATUTORY' | 'EMPLOYEE_PAY';

/**
 * Organization-wide payroll.
 *
 * Replaces a screen driven by `payroll-runs.json` and `localStorage`, where the whole lifecycle
 * was simulated: "calculate" wrote a hardcoded gross of ₹42,50,000, approval and release only
 * changed a string in the browser, and no payslip was ever produced. Runs and employee pay now
 * come from the API, and every transition is a server decision.

 */
export function ScreenPayrollAdmin() {
  const admin = usePayrollAdmin();
  const [tab, setTab] = useScreenTab<Tab>(
    'payrollAdminTab',
    ['RUNS', 'COMPENSATION', 'STATUTORY', 'EMPLOYEE_PAY'],
    'RUNS',
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'RUNS', label: `Payroll runs${admin.runs.length ? ` (${admin.runs.length})` : ''}` },
    { id: 'EMPLOYEE_PAY', label: 'Employee pay' },
    { id: 'COMPENSATION', label: 'Compensation' },
    { id: 'STATUTORY', label: 'Statutory rules' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 py-4 sm:px-6">
      <ScreenHeader
        description="Runs, compensation, statutory configuration and employee pay."
        icon={Wallet}
        title="Payroll"
        tone="warning"
      />
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

      {tab === 'RUNS' && <PayrollRunsPanel admin={admin} />}
      {tab === 'EMPLOYEE_PAY' && <PayrollEmployeePayPanel admin={admin} />}
      {tab === 'STATUTORY' && <ScreenPayrollLegalConfig />}
      {tab === 'COMPENSATION' && <ScreenCompensation />}
    </div>
  );
}
