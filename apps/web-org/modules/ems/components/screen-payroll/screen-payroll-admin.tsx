'use client';

import React from 'react';
import { BulkWorkforcePanel } from '../common/bulk-workforce-panel';
import { Wallet } from 'lucide-react';
import { ScreenHeader } from '../common/screen-header';
import { useScreenTab } from '../../hooks/use-screen-tab';
import { Button } from '@smarteam/ui';
import { usePayrollAdmin } from '../../hooks/use-payroll-admin';
import { PayrollRunsPanel } from './payroll-runs-panel';
import { PayrollEmployeePayPanel } from './payroll-employee-pay-panel';
import { ScreenPayrollLegalConfig } from './screen-payroll-legal-config';
import { ScreenCompensation } from './screen-compensation';
import { PageShell } from '../layout/page-shell';
import { hasPermission } from '@smarteam/contracts';
import { useSession } from '../../hooks/auth-context';
import { permittedTabs } from '../../lib/permitted-tabs';

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

  const { persona } = useSession();
  const permissions = persona?.permissions ?? [];
  const may = (permission: string) => hasPermission(permissions, permission);
  // Each tab is offered only to someone its API would answer.
  const { tabs, active } = permittedTabs<Tab, { id: Tab; label: string; allowed: boolean }>(
    [
      {
        id: 'RUNS',
        label: `Pay runs${admin.runs.length ? ` (${admin.runs.length})` : ''}`,
        allowed: may('payroll.runs.read'),
      },
      { id: 'EMPLOYEE_PAY', label: 'Employee salaries', allowed: may('payroll.payslips.read.all') },
      {
        id: 'COMPENSATION',
        label: 'Compensation',
        allowed: may('payroll.employee-profile.read.all') || may('payroll.components.read'),
      },
      { id: 'STATUTORY', label: 'Statutory & salary defaults', allowed: may('payroll.policy.read') },
    ],
    tab,
  );

  return (
    <PageShell>
      <ScreenHeader icon={Wallet} title="Payroll" tone="warning" />
      <BulkWorkforcePanel initialOperation="PAYROLL_POLICY" />
      <div
        aria-label="Payroll sections"
        className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-border pb-2"
        role="group"
      >
        {tabs.map((entry) => (
          <Button
            className={`shrink-0 whitespace-nowrap rounded-none pb-1 text-xs font-semibold ${
              active === entry.id
                ? 'border-b-2 border-foreground font-bold text-foreground'
                : 'text-muted-foreground'
            }`}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <span className="sm:hidden">
              {entry.id === 'RUNS'
                ? 'Runs'
                : entry.id === 'EMPLOYEE_PAY'
                  ? 'Salaries'
                  : entry.id === 'COMPENSATION'
                    ? 'Pay setup'
                    : 'Statutory'}
            </span>
            <span className="hidden sm:inline">{entry.label}</span>
          </Button>
        ))}
      </div>

      {active === 'RUNS' && <PayrollRunsPanel admin={admin} />}
      {active === 'EMPLOYEE_PAY' && <PayrollEmployeePayPanel admin={admin} />}
      {active === 'STATUTORY' && <ScreenPayrollLegalConfig />}
      {active === 'COMPENSATION' && (
        <ScreenCompensation onConfigureStatutory={() => setTab('STATUTORY')} />
      )}
    </PageShell>
  );
}
