'use client';

import React, { useEffect, useRef, useState } from 'react';
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
import { PayrollRuleUpdatesCard } from './payroll-rule-updates-card';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { payrollRepository } from '../../repositories/payroll.repository';
import type { PayrollPolicy } from '@smarteam/contracts';
import { ensureStateStatutoryRules } from './ensure-state-statutory-rules';

type Tab = 'RUNS' | 'COMPENSATION' | 'STATUTORY' | 'EMPLOYEE_PAY';

/**
 * Organization-wide payroll.
 *
 * Replaces a screen driven by `payroll-runs.json` and `localStorage`, where the whole lifecycle
 * was simulated: "calculate" wrote a hardcoded gross of ₹42,50,000, approval and release only
 * changed a string in the browser, and no payslip was ever produced. Runs and employee pay now
 * come from the API, and every transition is a server decision.

 */
export function ScreenPayrollAdmin({
  onNavigateModule,
}: {
  onNavigateModule: (module: string, subView?: string) => void;
}) {
  const admin = usePayrollAdmin();
  const [rulesRevision, setRulesRevision] = useState(0);
  const [tab, setTab] = useScreenTab<Tab>(
    'payrollAdminTab',
    ['RUNS', 'COMPENSATION', 'STATUTORY', 'EMPLOYEE_PAY'],
    'RUNS',
  );

  const { persona, session } = useSession();
  const permissions = persona?.permissions ?? [];
  const may = (permission: string) => hasPermission(permissions, permission);
  const organizationId = session?.organizationId ?? null;
  const policyResource = useAsyncResource<PayrollPolicy>(
    () => payrollRepository.getPolicy(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && may('payroll.policy.read') && may('payroll.policy.write') },
  );
  const repairedRulesKey = useRef<string | null>(null);
  // Each tab is offered only to someone its API would answer.
  const { tabs, active } = permittedTabs<Tab, { id: Tab; label: string; allowed: boolean }>(
    [
      {
        id: 'RUNS',
        label: `Payroll runs${admin.runs.length ? ` (${admin.runs.length})` : ''}`,
        allowed: may('payroll.runs.read'),
      },
      { id: 'EMPLOYEE_PAY', label: 'Employee pay', allowed: may('payroll.payslips.read.all') },
      {
        id: 'COMPENSATION',
        label: 'Compensation',
        allowed: may('payroll.employee-profile.read.all') || may('payroll.components.read'),
      },
      { id: 'STATUTORY', label: 'Statutory rules', allowed: may('payroll.policy.read') },
    ],
    tab,
  );

  // Repair missing effective-date segments even when the admin stays on Payroll runs. The
  // statutory and compensation tabs are mounted only when selected, so their local effects alone
  // left gaps untouched for admins who went straight to Calculate.
  useEffect(() => {
    const policy = policyResource.data;
    const jurisdiction = policy?.statutoryJurisdiction?.trim().toUpperCase();
    if (
      !organizationId ||
      !policy ||
      policyResource.loading ||
      !jurisdiction ||
      !may('payroll.policy.read') ||
      !may('payroll.policy.write')
    ) {
      return;
    }
    const enabled = { epf: policy.pfDefault, esic: policy.esiDefault, pt: policy.ptDefault };
    if (!enabled.epf && !enabled.esic && !enabled.pt) return;
    const key = `${organizationId}:${jurisdiction}:${Number(enabled.epf)}:${Number(enabled.esic)}:${Number(enabled.pt)}`;
    if (repairedRulesKey.current === key) return;
    repairedRulesKey.current = key;

    void ensureStateStatutoryRules(organizationId, jurisdiction, enabled).then(
      ({ error, created }) => {
        if (error) {
          repairedRulesKey.current = null;
          window.dispatchEvent(
            new CustomEvent('ems:feedback', {
              detail: {
                tone: 'error',
                message:
                  error instanceof Error
                    ? `Could not repair statutory rule coverage: ${error.message}`
                    : 'Could not repair statutory rule coverage.',
              },
            }),
          );
          return;
        }
        if (created.length && /statutory rule/i.test(admin.saveError ?? '')) admin.dismissError();
      },
    );
  }, [
    admin,
    organizationId,
    permissions,
    policyResource.data,
    policyResource.loading,
  ]);

  return (
    <PageShell>
      <ScreenHeader
        description="Runs, compensation, statutory configuration and employee pay."
        icon={Wallet}
        title="Payroll"
        tone="warning"
      />
      <PayrollRuleUpdatesCard
        onAccepted={() => Promise.resolve().then(() => setRulesRevision((value) => value + 1))}
      />
      <div className="flex items-center gap-4 border-b border-border pb-2">
        {tabs.map((entry) => (
          <Button
            className={`rounded-none pb-1 text-xs font-semibold ${
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
            {entry.label}
          </Button>
        ))}
      </div>

      {active === 'RUNS' && (
        <PayrollRunsPanel admin={admin} onNavigateModule={onNavigateModule} />
      )}
      {active === 'EMPLOYEE_PAY' && <PayrollEmployeePayPanel admin={admin} />}
      {active === 'STATUTORY' && <ScreenPayrollLegalConfig key={rulesRevision} />}
      {active === 'COMPENSATION' && <ScreenCompensation />}
    </PageShell>
  );
}
