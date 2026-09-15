import type { Prisma } from '../../generated/prisma/client';
import type { DomainContext } from '../../common/context/domain-context';
import { jsonSnapshot, type AuditService } from '../audit/audit.service';
import type { OutboxService } from '../federation/outbox.service';

/**
 * Cancels an optional-holiday selection: the one way a granted optional holiday stops applying.
 *
 * Extracted from `EmployeeHolidaysService.cancelSelection` unchanged — the same status change, audit
 * action and `employee.holiday.cancelled` event — so that converting a worked holiday into a
 * working day cancels it the same way rather than through a second mechanism. The caller decides
 * who may cancel and when; this only records the cancellation.
 */
export async function cancelHolidaySelection(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  outbox: OutboxService,
  context: DomainContext,
  selection: { id: string; employeeId: string; holidayId: string },
  reason?: string,
) {
  const updated = await tx.employeeHolidaySelection.update({
    where: { id: selection.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  await audit.record(
    context,
    {
      entityType: 'EMPLOYEE_HOLIDAY_SELECTION',
      entityId: selection.id,
      action: 'EMPLOYEE_HOLIDAY_CANCELLED',
      beforeState: jsonSnapshot(selection),
      afterState: jsonSnapshot(updated),
      reason,
    },
    tx,
  );
  await outbox.append(
    context,
    {
      aggregateType: 'EmployeeHolidaySelection',
      aggregateId: selection.id,
      aggregateVersion: 2,
      eventType: 'employee.holiday.cancelled',
      payload: jsonSnapshot({
        selectionId: selection.id,
        employeeId: selection.employeeId,
        holidayId: selection.holidayId,
        reason,
      }),
    },
    tx,
  );
  return updated;
}
