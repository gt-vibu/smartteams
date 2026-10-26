'use client';
import { payrollReadinessSchema } from '@smarteam/contracts';
import { Button } from '@smarteam/ui';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { apiRequest } from '../../lib/api-client';
import { orgPath } from '../../repositories/api-helpers';
export function PayrollReadinessPanel({ runId }: { runId: string }) {
  const { session, hasPermission } = useSession();
  const org = session?.organizationId;
  const resource = useAsyncResource(
    async () =>
      payrollReadinessSchema.parse(
        await apiRequest(orgPath(org!, `/payroll/runs/${runId}/readiness`), { method: 'GET' }),
      ),
    [org, runId],
    { enabled: Boolean(org) && hasPermission('payroll.payslips.read.all') },
  );
  if (!hasPermission('payroll.payslips.read.all')) return null;
  return (
    <details className="border-t border-border px-4 py-3">
      <summary className="text-xs font-semibold">
        Payroll readiness ·{' '}
        {resource.loading
          ? 'checking…'
          : resource.error
            ? 'could not load'
            : resource.data?.ready
              ? 'ready'
              : 'needs attention'}
      </summary>
      <div className="mt-3 space-y-2 text-xs">
        <p className="text-muted-foreground">
          Approval and release check these items again on the server. Resolve conflicts before
          closing the period.
        </p>
        {resource.error && (
          <p role="alert" className="text-destructive">
            {resource.error}
          </p>
        )}
        {resource.data?.blockers.map((item) => (
          <p key={item.code}>
            <strong>{item.count}</strong> · {item.message}
          </p>
        ))}
        {resource.data?.conflicts.map((item) => (
          <p key={item.attendanceRecordId} className="text-muted-foreground">
            {item.name ?? 'Employee'} · {item.workDate.slice(0, 10)}: attendance conflicts with
            approved leave
          </p>
        ))}
        {resource.data?.missingPay.map((item) => (
          <p key={item.id} className="text-muted-foreground">
            {item.name} · {item.employeeNumber}: pay setup missing
          </p>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={resource.loading}
          onClick={() => void resource.refetch()}
        >
          Refresh readiness
        </Button>
        <p className="text-muted-foreground">
          For released periods, use “Create correction run”, resolve the historical change,
          recalculate, review, and release the replacement. The issued original remains in history.
        </p>
      </div>
    </details>
  );
}
