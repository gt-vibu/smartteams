import { ConflictError, type DomainError } from '../../common/errors/domain-error';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';

/**
 * The read boundary for employee records.
 *
 * `employees.read` reaches the caller's own record. Reading anyone else's needs
 * `employees.read.all` or the tenant wildcard — the same split Leave, Attendance, Payroll and
 * Files already use, and the one `EmployeeDetailService` was written against.
 *
 * This lived as a private method on `EmployeeDetailService` while it guarded a single route. It
 * is shared now because it guards five: the directory, a single record, employment history,
 * emergency contacts and the detail projection. Keeping one copy is what stops the next employee
 * read from being added without it — which is exactly how the directory came to be readable by
 * every self-service employee in the tenant.
 */

/**
 * Whether the caller may read beyond their own record.
 *
 * The `FEDERATION` arm is load-bearing rather than a convenience. A federation context acts for
 * the tenant and carries no `actor.userId`, so it has no "own record" to narrow to; without this
 * the self lookup below would match on `userId: undefined`, which Prisma drops from the filter,
 * and the partner would silently receive an arbitrary employee. Federation breadth is governed by
 * grants and scopes before a request ever reaches a domain service.
 */
export function canReadAllEmployees(context: DomainContext): boolean {
  return (
    context.accessMode === 'FEDERATION' ||
    context.permissions.has('*') ||
    context.permissions.has('employees.read.all')
  );
}

/** The employee record belonging to the calling user, or null when they have none. */
export async function findSelfEmployeeId(
  tx: TenantTransaction,
  context: DomainContext,
): Promise<string | null> {
  if (!context.actor.userId) return null;
  const self = await tx.employee.findFirst({
    where: { organizationId: context.organizationId, userId: context.actor.userId },
    select: { id: true },
  });
  return self?.id ?? null;
}

/**
 * Refuses a read of another employee's record unless the caller holds the broader permission.
 *
 * Callers that have already loaded the row should pass its id; the row must be confirmed to exist
 * in this organization first, so that an employee from another tenant reports as missing rather
 * than as forbidden.
 */
export async function assertMayReadEmployee(
  tx: TenantTransaction,
  context: DomainContext,
  employeeId: string,
): Promise<void> {
  if (canReadAllEmployees(context)) return;
  const selfEmployeeId = await findSelfEmployeeId(tx, context);
  if (selfEmployeeId !== employeeId) throw selfOnlyError();
}

/** The single message every self-scoped employee read reports, so the routes stay indistinguishable. */
export function selfOnlyError(): DomainError {
  return new ConflictError('Employees may only read their own record');
}
