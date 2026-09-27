'use client';

import { useCallback, useMemo } from 'react';
import { formatMoney, hasPermission } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { useAsyncResource } from './use-async-resource';
import { payrollRepository } from '../repositories/payroll.repository';

export type AdvanceInboxItem = {
  id: string;
  domain: 'ADVANCE';
  requester: string | null;
  title: string;
  detail: string;
  submittedAt: string;
};

/**
 * Salary advances waiting for a decision, for whoever may approve them.
 *
 * An advance had a request form and a decision route, but no screen that called the route: a
 * request sat as "requested" for good. It is listed here with every other decision, and the
 * approver's own requests are left out, as the server refuses a self-approval.
 */
export function useAdvanceInbox() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const ownEmployeeId = session?.employeeId ?? null;
  const canApprove = hasPermission(persona?.permissions ?? [], 'payroll.advances.approve');

  const resource = useAsyncResource(
    () => payrollRepository.listAdvances(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canApprove },
  );

  const items: AdvanceInboxItem[] = useMemo(
    () =>
      (resource.data ?? [])
        .filter((advance) => advance.status === 'REQUESTED' && advance.employeeId !== ownEmployeeId)
        .map((advance) => ({
          id: advance.id,
          domain: 'ADVANCE' as const,
          requester: advance.employee
            ? `${advance.employee.firstName} ${advance.employee.lastName ?? ''}`.trim() +
              (advance.employee.employeeNumber ? ` (${advance.employee.employeeNumber})` : '')
            : null,
          title: `Salary advance · ${formatMoney(advance.requestedAmount)}`,
          detail: `${advance.reason ?? 'No reason given'} · recovered from net pay by payroll`,
          submittedAt: advance.requestedAt,
        })),
    [resource.data, ownEmployeeId],
  );

  const decide = useCallback(
    (id: string, approve: boolean, comment: string) =>
      payrollRepository.decideAdvance(organizationId!, id, {
        status: approve ? 'APPROVED' : 'REJECTED',
        comment,
      }),
    [organizationId],
  );

  return { items, loading: resource.loading, refetch: resource.refetch, decide };
}
